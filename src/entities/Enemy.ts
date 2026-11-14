import { Box, CollisionSystem } from '../core/Collision';
import { TMXMap } from '../types';
import { Player } from './Player';
import { audio } from '../core/AudioManager';
import enemiesConfig from '../data/enemies.json';
import {
  calculatePiranhaTrajectory,
  calculatePiranhaFrame,
  PIRANHA_SPRITE_SPEC,
  SPLASH_ANIM_SPEC,
  ITEM_PICKUP_EFFECT_SPEC,
  METEORITE_PHYSICS,
} from '../core/ParityFormulas';

export class VisualEffect {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public active: boolean = true;
  public effectType: 'enemy_death' | 'item_pickup';

  private frameTimer: number = 0;
  private currentFrame: number = 0;
  private totalFrames: number;
  private cols: number;
  private startX: number;
  private startY: number;
  private frameW: number;
  private frameH: number;
  private frameDuration: number;

  constructor(effectType: 'enemy_death' | 'item_pickup', centerX: number, centerY: number) {
    this.effectType = effectType;
    if (effectType === 'enemy_death') {
      // ENEMY_DEATH in enemies_tile_2.png: (360, 820), 160x150, 4 frames
      this.startX = 360;
      this.startY = 820;
      this.frameW = 160;
      this.frameH = 150;
      this.cols = 4;
      this.totalFrames = 4;
      this.frameDuration = 0.075;
      this.width = 160;
      this.height = 150;
      this.x = centerX - this.width / 2;
      this.y = centerY - this.height / 2;
    } else {
      // L"POWER" in coinEffect.png (0x00438be0 & 0x00434760): 104x162, 9 cols x 4 rows, anchor (52, 129), 29 frames at 30 FPS
      this.startX = 0;
      this.startY = 0;
      this.frameW = ITEM_PICKUP_EFFECT_SPEC.frameW;
      this.frameH = ITEM_PICKUP_EFFECT_SPEC.frameH;
      this.cols = ITEM_PICKUP_EFFECT_SPEC.cols;
      this.totalFrames = ITEM_PICKUP_EFFECT_SPEC.totalFrames;
      this.frameDuration = ITEM_PICKUP_EFFECT_SPEC.frameDuration;
      this.width = ITEM_PICKUP_EFFECT_SPEC.frameW;
      this.height = ITEM_PICKUP_EFFECT_SPEC.frameH;
      this.x = centerX - ITEM_PICKUP_EFFECT_SPEC.anchorX;
      this.y = centerY - ITEM_PICKUP_EFFECT_SPEC.anchorY;
    }
  }

  public update(dt: number) {
    if (!this.active) return;
    this.frameTimer += dt;
    while (this.frameTimer >= this.frameDuration) {
      this.frameTimer -= this.frameDuration;
      this.currentFrame++;
      if (this.currentFrame >= this.totalFrames) {
        this.active = false;
        break;
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    enemyImages: Record<string, HTMLImageElement>,
    coinEffectImg?: HTMLImageElement
  ) {
    if (!this.active) return;

    const img =
      this.effectType === 'enemy_death'
        ? (enemyImages['/assets/images/enemies/enemies_tile_2.png'] || enemyImages['/assets/images/enemies/enemies_tile.png'])
        : coinEffectImg;
    if (!img) return;

    const col = this.currentFrame % this.cols;
    const row = Math.floor(this.currentFrame / this.cols);
    const sx = this.startX + col * this.frameW;
    const sy = this.startY + row * this.frameH;

    ctx.save();
    if (this.effectType === 'item_pickup') {
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.drawImage(
      img,
      sx,
      sy,
      this.frameW,
      this.frameH,
      Math.round(this.x),
      Math.round(this.y),
      this.width,
      this.height
    );
    ctx.restore();
  }
}

export class Enemy {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number;
  public height: number;
  public type: string;
  public animName: string;
  public facingRight: boolean = false;
  public active: boolean = true;
  public collidesFloor: boolean = false;

  protected startX: number;
  protected startY: number;
  protected frameTimer: number = 0;
  protected currentFrame: number = 0;
  protected config: any;
  protected distanceTraveled: number = 0;
  protected maxDistance: number = 0;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    this.type = type;
    this.animName = props.pAnim || props.pAsset || name;

    // Lookup exact sprite config from enemies.json
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['DINOSAUR_SMALL'];
    this.width = this.config?.frameW || (w > 0 ? w : 60);
    this.height = this.config?.frameH || (h > 0 ? h : 60);

    // Anchor bottom-center of enemy sprite onto the bottom of the TMX marker
    // TMX object markers are typically 50x50 placed at floor level
    const markerW = w > 0 ? w : this.width;
    const markerH = h > 0 ? h : this.height;
    this.x = Math.round(x + markerW / 2 - this.width / 2);
    this.y = Math.round(y + markerH - this.height);
    this.startX = this.x;
    this.startY = this.y;

    this.collidesFloor =
      props.pCollidesFloor === 'true' ||
      this.type === 'Enemy' ||
      this.animName === 'HEDGEHOG' ||
      this.animName === 'STATIC_SNAKE';

    const hasExplicitVel = props.pxVel !== undefined && props.pxVel !== '';
    const vel = parseFloat(props.pxVel || '0');
    this.vx = isNaN(vel) ? 0 : vel;

    if (!hasExplicitVel && this.config && this.config.speed > 0) {
      this.vx = -this.config.speed;
    }

    if (props.pLook === '-1') {
      this.facingRight = false;
    } else if (props.pLook === '1') {
      this.facingRight = true;
    } else {
      this.facingRight = this.vx > 0;
    }

    // pxDest="100" is a TMX editor template placeholder; only use explicit custom distance
    const distStr = props.pDistance || (props.pxDest && props.pxDest !== '100' ? props.pxDest : '0');
    const dist = parseFloat(distStr);
    this.maxDistance = isNaN(dist) ? 0 : Math.abs(dist);
  }

  public getBox(): Box {
    // Exact collision hitboxes reverse-engineered from Vascolet.exe (0x00419180 table)
    const name = this.animName.toUpperCase();

    if (name === 'PTERODACTILE') {
      const bw = 54;
      const bh = 26;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + 45,
        w: bw,
        h: bh,
      };
    }
    if (name === 'BIRD_BROWN' || name === 'BIRD_BLACK') {
      const bw = 75;
      const bh = 40;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + 45,
        w: bw,
        h: bh,
      };
    }
    if (name === 'BIRD_YELLOW') {
      const bw = 62;
      const bh = 20;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + 40,
        w: bw,
        h: bh,
      };
    }
    if (name === 'BIRD_ROBOT') {
      const bw = 66;
      const bh = 75;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + 17,
        w: bw,
        h: bh,
      };
    }
    if (name === 'STALACTITE') {
      const bw = 30;
      const bh = 60;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y,
        w: bw,
        h: bh,
      };
    }
    if (name === 'METEORITE') {
      const bw = 38;
      const bh = 38;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + (this.height - bh) / 2,
        w: bw,
        h: bh,
      };
    }

    const centeredProjectiles: Record<string, [number, number]> = {
      CANNONBALL_PIRATES: [32, 32],
      CANNONBALL_FUTURE: [50, 20],
      CANNONBALL_EGYPT: [50, 16],
      CANNONBALL_CASTLE: [35, 32],
      BIG_CANNONBALL: [36, 36],
    };
    if (centeredProjectiles[name]) {
      const [bw, bh] = centeredProjectiles[name];
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + (this.height - bh) / 2,
        w: bw,
        h: bh,
      };
    }

    if (name.includes('PIRANHA')) {
      const bw = PIRANHA_SPRITE_SPEC.hitboxW;
      const bh = PIRANHA_SPRITE_SPEC.hitboxH;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + (this.height - bh),
        w: bw,
        h: bh,
      };
    }

    // Ground-anchored entities from Vascolet.exe 0x00419180 registration table
    const bottomAlignedHitboxes: Record<string, [number, number]> = {
      STATIC_SNAKE: [32, 60],
      SNAKE: [50, 32],
      HEDGEHOG: [30, 30],
      ESCORPION_R: [80, 32],
      RAT: [80, 32],
      DINOSAUR_BIG: [50, 70],
      DINOSAUR_SMALL: [34, 50],
      MUMMY: [35, 130],
      PIRATE: [40, 100],
      TEMPLARY: [55, 150],
      SNAKE_ROBOT: [70, 90],
      MOUSE_ROBOT: [70, 38],
      BIG_ROBOT: [100, 158],
      MINE: [80, 50],
      COCONUT: [30, 30],
      ROCK: [40, 39],
      CANNONBALL_PREHISTORY: [50, 32],
      GUILLOTINE: [60, 45],
      FIRE: [32, 40],
      FIRE_Y: [32, 40],
      FIRE_R: [32, 40],
      FIRE_G: [32, 40],
      CANNON_PREHISTORY: [70, 80],
      CANNON_EGYPT: [80, 90],
      CANNON_CASTLE: [80, 90],
      CANNON_PIRATES: [80, 90],
      CANNON_LASER: [80, 90],
      RED_SPLATTER: [76, 152],
      BLUE_SPLATTER: [76, 152],
      GREEN_SPLATTER: [76, 152],
      LAVA_IN: [76, 152],
      LAVA_OUT: [76, 152],
      WATER_IN: [76, 152],
      WATER_OUT: [76, 152],
      ACID_IN: [76, 152],
      ACID_OUT: [76, 152],
      CAVE_TRAP: [76, 304],
    };

    if (bottomAlignedHitboxes[name]) {
      const [bw, bh] = bottomAlignedHitboxes[name];
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + (this.height - bh),
        w: bw,
        h: bh,
      };
    }

    // Fallback inset hitbox
    const padX = Math.min(10, Math.floor(this.width * 0.12));
    const padY = Math.min(8, Math.floor(this.height * 0.08));
    return {
      x: this.x + padX,
      y: this.y + padY,
      w: Math.max(16, this.width - padX * 2),
      h: Math.max(16, this.height - padY),
    };
  }

  public canBeStomped(): boolean {
    // In Vascolet.exe, Enemy::onCollide (0x0043e0c0), Bird::onCollide (0x0043e890),
    // and Jumper::onCollide (0x00440b50) all allow stomping from above (including STATIC_SNAKE and HEDGEHOG).
    // Only non-stompable hazards (Fire, Guillotine, Piranha, Stalactite, Thrower, Projectiles, Traps) cannot be stomped.
    const unStompableTypes = ['Projectile', 'Fire', 'Guillotine', 'Piranha', 'Stalactite', 'Thrower'];
    if (unStompableTypes.includes(this.type)) {
      return false;
    }
    const unStompableAnims = [
      'GUILLOTINE',
      'FIRE',
      'FIRE_R',
      'FIRE_Y',
      'FIRE_G',
      'ROCK',
      'COCONUT',
      'METEORITE',
      'BIG_CANNONBALL',
      'PIRANHA_R',
      'PIRANHA_G',
      'CANNONBALL_PREHISTORY',
      'CANNONBALL_EGYPT',
      'CANNONBALL_CASTLE',
      'CANNONBALL_PIRATES',
      'CANNONBALL_FUTURE',
      'STALACTITE',
      'MINE',
      'CAVE_TRAP',
      'RED_SPLATTER',
      'BLUE_SPLATTER',
      'GREEN_SPLATTER',
      'LAVA_IN',
      'LAVA_OUT',
      'WATER_IN',
      'WATER_OUT',
      'ACID_IN',
      'ACID_OUT',
      'CANNON_PREHISTORY',
      'CANNON_EGYPT',
      'CANNON_CASTLE',
      'CANNON_PIRATES',
      'CANNON_LASER',
    ];
    return !unStompableAnims.includes(this.animName.toUpperCase());
  }

  public settleToFloor(map: TMXMap) {
    if (!this.collidesFloor) return;
    for (let step = 0; step < 20; step++) {
      this.snapToFloor(map, 0.05);
    }
  }

  protected snapToFloor(map: TMXMap, dt: number) {
    if (!this.collidesFloor) return;

    this.vy = Math.min(600, this.vy + 900 * dt);
    this.y += this.vy * dt;

    const tileW = map.tileWidth;
    const tileH = map.tileHeight;
    const footY = this.y + this.height;
    const leftX = this.x + 10;
    const rightX = this.x + this.width - 10;

    const ty = Math.floor(footY / tileH);
    const tx1 = Math.floor(leftX / tileW);
    const tx2 = Math.floor(rightX / tileW);

    if (
      CollisionSystem.isSolid(map, tx1, ty) ||
      CollisionSystem.isPlatform(map, tx1, ty) ||
      CollisionSystem.isSolid(map, tx2, ty) ||
      CollisionSystem.isPlatform(map, tx2, ty)
    ) {
      this.y = ty * tileH - this.height;
      this.vy = 0;
    }
  }

  public update(
    dt: number,
    map: TMXMap,
    player: Player,
    spawnProjectile?: (p: ProjectileEnemy) => void,
    spawnEffect?: (eff: VisualEffect) => void
  ) {
    if (!this.active) return;

    // Animation frame timer
    this.frameTimer += dt;
    if (this.frameTimer > 0.1) {
      this.frameTimer = 0;
      const count = this.config?.count || 1;
      this.currentFrame = (this.currentFrame + 1) % count;
    }

    // Settle onto floor if ground enemy
    this.snapToFloor(map, dt);

    // Default ground patrol logic
    if (this.vx !== 0) {
      const dx = this.vx * dt;
      this.x += dx;
      this.distanceTraveled += Math.abs(dx);

      // Check wall collision
      const checkX = this.vx > 0 ? this.x + this.width : this.x;
      const tileX = Math.floor(checkX / map.tileWidth);
      const tileY = Math.floor((this.y + this.height * 0.6) / map.tileHeight);
      const hitWall = CollisionSystem.isSolid(map, tileX, tileY);

      // Check ledge ahead (avoid walking into pits/traps if grounded)
      let isLedge = false;
      if (this.collidesFloor && this.vy === 0) {
        const frontX = this.vx > 0 ? this.x + this.width + 4 : this.x - 4;
        const frontTileX = Math.floor(frontX / map.tileWidth);
        const floorTileY = Math.floor((this.y + this.height + 4) / map.tileHeight);
        const hasFloorAhead =
          CollisionSystem.isSolid(map, frontTileX, floorTileY) ||
          CollisionSystem.isPlatform(map, frontTileX, floorTileY);
        isLedge = !hasFloorAhead;
      }

      const reachedMaxDist = this.maxDistance > 0 && this.distanceTraveled >= this.maxDistance;

      if (hitWall || isLedge || reachedMaxDist) {
        this.vx = -this.vx;
        this.facingRight = this.vx > 0;
        this.distanceTraveled = 0;
      }
    }

    // Check collision with player
    this.checkPlayerCollision(player, spawnEffect);
  }

  protected checkPlayerCollision(player: Player, spawnEffect?: (eff: VisualEffect) => void) {
    if (player.state === 'dead') return;

    const enemyBox = this.getBox();
    const playerBox = player.getBox();

    if (CollisionSystem.checkAABB(enemyBox, playerBox)) {
      // Check if player lands/stomps on the enemy from above (Vascolet.exe 0x0043e0c0 & 0x00440b50)
      const isFalling = player.vy > 0;
      const playerFeet = playerBox.y + playerBox.h;
      const enemyHead = Math.max(enemyBox.y + 18, enemyBox.y + enemyBox.h * 0.75);

      if (isFalling && (playerFeet <= enemyHead || playerBox.y < enemyBox.y) && this.canBeStomped()) {
        // Successful stomp! (Vascolet.exe 0x004330f0: bounce vy = -510.0)
        this.active = false;
        player.currentPlatform = null;
        player.vy = -510; // Bounce up!
        player.jumpCount = 1; // Allow double jump at apex of bounce if player has cereal
        player.onGround = false;
        player.state = 'jump';
        player.addScore(100);
        audio.playSound('/assets/audio/fx/jump.ogg', 0.85);
        if (spawnEffect) {
          spawnEffect(new VisualEffect('enemy_death', this.x + this.width / 2, this.y + this.height / 2));
        }
      } else if (!player.isInvulnerable) {
        // Side/bottom contact damages player
        player.takeDamage(this.x);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, enemyImages: Record<string, HTMLImageElement>) {
    if (!this.active || !this.config) return;

    const img = enemyImages[this.config.image];
    if (!img) return;

    const cols = this.config.cols || 1;
    const col = this.currentFrame % cols;
    const row = Math.floor(this.currentFrame / cols);

    const sx = this.config.startX + col * this.config.frameW;
    const sy = this.config.startY + row * this.config.frameH;
    const sw = this.config.frameW;
    const sh = this.config.frameH;

    ctx.save();
    // In original Vascolet sprite sheets, all enemy sprites face RIGHT.
    // Therefore, flip (scale(-1, 1)) when facing LEFT.
    if (!this.facingRight) {
      ctx.translate(Math.round(this.x + sw), Math.round(this.y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, Math.round(this.x), Math.round(this.y), sw, sh);
    }
    ctx.restore();
  }
}

// Flying Bird / Pterodactile Enemy
export class BirdEnemy extends Enemy {
  private flightTimer: number = 0;
  private xDelta: number = -400;
  private yDelta: number = 20;
  private duration: number = 3.0;
  private progress: number = 0;
  private direction: number = 1;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = false;
    this.animName = props.pAnim || props.pAsset || 'BIRD_BROWN';
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['BIRD_BROWN'];
    this.width = this.config?.frameW || 110;
    this.height = this.config?.frameH || 130;

    const hasXDelta = props.pxDelta !== undefined && props.pxDelta !== '';
    const rawXDelta = hasXDelta ? parseFloat(props.pxDelta) : (props.pxDest ? parseFloat(props.pxDest) : -400);
    this.xDelta = isNaN(rawXDelta) ? -400 : rawXDelta;

    const hasYDelta = props.pyDelta !== undefined && props.pyDelta !== '';
    const rawYDelta = hasYDelta ? parseFloat(props.pyDelta) : 0;
    this.yDelta = isNaN(rawYDelta) ? 0 : rawYDelta;

    const rawDur = parseFloat(props.pDuration || '3.0');
    this.duration = isNaN(rawDur) || rawDur <= 0 ? 3.0 : rawDur;

    this.facingRight = this.xDelta > 0;
  }

  public update(
    dt: number,
    _map: TMXMap,
    player: Player,
    _spawnProjectile?: (p: ProjectileEnemy) => void,
    spawnEffect?: (eff: VisualEffect) => void
  ) {
    if (!this.active) return;

    this.flightTimer += dt;
    this.frameTimer += dt;
    if (this.frameTimer > 0.1) {
      this.frameTimer = 0;
      const count = this.config?.count || 5;
      this.currentFrame = (this.currentFrame + 1) % count;
    }

    // Interpolate flight between startX and startX + xDelta over duration
    this.progress += (dt / this.duration) * this.direction;
    if (this.progress >= 1) {
      this.progress = 1;
      this.direction = -1;
    } else if (this.progress <= 0) {
      this.progress = 0;
      this.direction = 1;
    }

    if (Math.abs(this.xDelta) > 0) {
      this.facingRight = this.direction * this.xDelta > 0;
    }
    this.x = this.startX + this.xDelta * this.progress;
    if (Math.abs(this.yDelta) > 20) {
      this.y = this.startY + this.yDelta * this.progress + Math.sin(this.flightTimer * 4.0) * 8;
    } else {
      this.y = this.startY + Math.sin(this.flightTimer * 4.0) * Math.min(38, Math.abs(this.yDelta) * 0.5);
    }

    this.checkPlayerCollision(player, spawnEffect);
  }
}

// Falling Stalactite / Coconut / Rock Hazard
export class StalactiteEnemy extends Enemy {
  private isFalling: boolean = false;
  private triggerOffset: number = 100;
  private fallAccel: number = 800.0;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = false;
    this.animName = props.pAsset || props.pAnim || 'STALACTITE';
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['STALACTITE'];
    this.width = this.config?.frameW || 60;
    this.height = this.config?.frameH || 60;
    this.vx = 0;
    this.vy = 0;
    const off = parseFloat(props.pxOffset || '100');
    this.triggerOffset = isNaN(off) || off <= 0 ? 100 : Math.abs(off);
    const acc = parseFloat(props.pyAccel || '800');
    this.fallAccel = isNaN(acc) || acc <= 0 ? 800 : Math.abs(acc);
  }

  public update(dt: number, map: TMXMap, player: Player) {
    if (!this.active) return;

    if (!this.isFalling) {
      const dx = Math.abs(player.x + player.width / 2 - (this.x + this.width / 2));
      const dy = player.y - this.y;
      if (dx <= this.triggerOffset && dy > -20 && dy < 600) {
        this.isFalling = true;
      }
    } else {
      this.vy += this.fallAccel * dt;
      this.y += this.vy * dt;

      const bottomY = this.y + this.height;
      const tileX = Math.floor((this.x + this.width / 2) / map.tileWidth);
      const tileY = Math.floor(bottomY / map.tileHeight);
      if (CollisionSystem.isSolid(map, tileX, tileY)) {
        this.active = false;
        audio.playSound('/assets/audio/fx/explosion.ogg', 0.4);
        return;
      }
    }

    this.checkPlayerCollision(player);
  }
}

// Jumping Piranha / Fireball with liquid splash (anim_lava_tile.png)
export class PiranhaEnemy extends Enemy {
  private timer: number = 0;
  private duration: number = 1.5;
  private minTime: number = 1.0;
  private maxTime: number = 1.5;
  private waitDuration: number = 1.25;
  private jumpHeight: number = 300;
  public isJumping: boolean = false;
  private isRising: boolean = true;
  private splashType: string = '';
  private splashTileX: number = 0;
  private waterSurfaceY: number = 0;
  private jumpBaseY: number = 0;
  private splashAnimMode: 'none' | 'out' | 'in' = 'none';
  private splashAnimTimer: number = 0;
  private triggeredOutSplash: boolean = false;
  private triggeredInSplash: boolean = false;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = false;
    this.duration = Math.max(0.8, parseFloat(props.pDuration || '1.5'));
    this.minTime = Math.max(0.2, parseFloat(props.pMinTime || props.pMaxTime || '1.0'));
    this.maxTime = Math.max(this.minTime, parseFloat(props.pMaxTime || '1.5'));
    this.waitDuration = (this.minTime + this.maxTime) / 2;
    this.jumpHeight = Math.abs(parseFloat(props.pyDelta || '300'));
    this.splashType = props.pAnimSplash || '';
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['PIRANHA_R'];

    // Preserve the marker dimensions (50x48 or 50x55) for collision and anchoring
    this.width = w > 0 ? w : PIRANHA_SPRITE_SPEC.hitboxW;
    this.height = h > 0 ? h : PIRANHA_SPRITE_SPEC.hitboxH;
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;

    // StageManager::snapToGrid (0x00427b80) & EnemyLava::EnemyLava (0x0043f4f0):
    // In all 5 TMX maps, the Piranha marker y is in the air row above the liquid surface tile.
    // The actual 76x76 liquid surface tile (pKilling=true) starts at row (floor(y / 76) + 1) * 76
    // and column floor((x + width * 0.5) / 76) * 76.
    const tileCol = Math.floor((this.startX + this.width * 0.5) / 76);
    const tileRow = Math.floor(this.startY / 76) + 1;
    this.splashTileX = tileCol * 76;
    this.waterSurfaceY = tileRow * 76;
    // Start/end jump slightly below waterSurfaceY so piranha emerges from and plunges into the liquid
    this.jumpBaseY = this.waterSurfaceY - 16;
  }

  public update(dt: number, _map: TMXMap, player: Player) {
    this.timer += dt;

    const cycle = this.duration + this.waitDuration;
    const currentT = this.timer % cycle;

    // Advance active splash animation timer (7/60s per frame in 0x00434760)
    if (this.splashAnimMode !== 'none') {
      this.splashAnimTimer += dt;
      const seq =
        this.splashAnimMode === 'out' ? SPLASH_ANIM_SPEC.OUT_FRAMES : SPLASH_ANIM_SPEC.IN_FRAMES;
      if (this.splashAnimTimer >= seq.length * SPLASH_ANIM_SPEC.FRAME_DURATION) {
        this.splashAnimMode = 'none';
        this.splashAnimTimer = 0;
      }
    }

    // Ping-pong easeOutCubic jump arc matching Vascolet.exe 0x00405350 / 0x0044bc40
    const trajectory = calculatePiranhaTrajectory(currentT, this.duration, this.jumpBaseY, this.jumpHeight);
    this.y = trajectory.y;
    this.isRising = trajectory.isRising;
    this.isJumping = trajectory.isJumping;

    if (this.isJumping) {
      // Trigger _OUT splash at jump start (0x0043f850)
      if (!this.triggeredOutSplash) {
        this.triggeredOutSplash = true;
        this.triggeredInSplash = false;
        this.splashAnimMode = 'out';
        this.splashAnimTimer = 0;
      }

      // Trigger _IN splash once during descent when crossing waterSurfaceY - 76 (0x0043f850)
      if (
        !this.triggeredInSplash &&
        !this.isRising &&
        this.y > this.waterSurfaceY - SPLASH_ANIM_SPEC.FRAME_W
      ) {
        this.triggeredInSplash = true;
        this.splashAnimMode = 'in';
        this.splashAnimTimer = 0;
      }

      if (this.animName.includes('PIRANHA')) {
        this.currentFrame = calculatePiranhaFrame(currentT, this.isRising);
      } else {
        // Fireballs have 2 frames (FIRE_R, FIRE_Y, FIRE_G) at 7/60s per frame
        const count = this.config?.count || 2;
        const framePair = Math.floor(currentT / SPLASH_ANIM_SPEC.FRAME_DURATION) % 2;
        this.currentFrame = framePair % count;
      }
    } else {
      // Hidden underwater while waiting (0x0043f7e0 sets visible = 0)
      this.triggeredOutSplash = false;
      this.currentFrame = 0;
    }

    if (this.isJumping && !player.isInvulnerable && player.state !== 'dead') {
      if (CollisionSystem.checkAABB(this.getBox(), player.getBox())) {
        player.takeDamage(this.x);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, enemyImages: Record<string, HTMLImageElement>) {
    if (!this.active || !this.config) return;

    // 1. Render piranha/fireball only while jumping (hidden underwater during wait phase, 0x0043f7e0)
    if (this.isJumping && this.y <= this.waterSurfaceY + 24) {
      const img = enemyImages[this.config.image];
      if (img) {
        const cols = this.config.cols || 1;
        const col = this.currentFrame % cols;
        const row = Math.floor(this.currentFrame / cols);
        const sx = this.config.startX + col * this.config.frameW;
        const sy = this.config.startY + row * this.config.frameH;
        const sw = this.config.frameW;
        const sh = this.config.frameH;

        const anchorX = this.config?.anchorX || PIRANHA_SPRITE_SPEC.anchorX;
        const anchorY = this.config?.anchorY || PIRANHA_SPRITE_SPEC.anchorY;
        const drawX = Math.round(this.splashTileX + 38 - anchorX);
        const drawY = Math.round(this.y + this.height - anchorY);

        ctx.save();
        // Clip at the water surface line (or bottom of surface tile while splash is active) so piranha emerges cleanly from water
        const clipBottomY = this.splashAnimMode !== 'none' ? this.waterSurfaceY + 76 : this.waterSurfaceY + 4;
        ctx.beginPath();
        ctx.rect(drawX - 10, drawY - 10, sw + 20, Math.max(0, clipBottomY - (drawY - 10)));
        ctx.clip();

        if (!this.isRising && this.animName.includes('FIRE')) {
          // Flip fireball vertically when falling down
          ctx.translate(drawX, drawY + sh);
          ctx.scale(1, -1);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        } else {
          // Piranhas have native DOWN frames in row (frames 2 and 3); no flip needed
          ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, sw, sh);
        }
        ctx.restore();
      }
    }

    // 2. Render liquid splash (LAVA / WATER / ACID) from anim_lava_tile.png (0x0043f3e0 & 0x00434760)
    // Each 76x152 cell has its 76x76 opaque liquid block in the bottom half (dy=76..152) and the transparent
    // splash plume in the top half (dy=0..76). Drawing at drawY = waterSurfaceY - 76 places the bottom half
    // (drawY + 76 .. drawY + 152) directly on top of the 76x76 liquid surface tile at waterSurfaceY.
    if (this.splashType && this.splashAnimMode !== 'none') {
      const splashImg = enemyImages['/assets/images/enemies/anim_lava_tile.png'];
      const seq =
        this.splashAnimMode === 'out' ? SPLASH_ANIM_SPEC.OUT_FRAMES : SPLASH_ANIM_SPEC.IN_FRAMES;
      const seqIndex = Math.floor(this.splashAnimTimer / SPLASH_ANIM_SPEC.FRAME_DURATION);

      if (splashImg && seqIndex >= 0 && seqIndex < seq.length) {
        const splashFrame = seq[seqIndex];
        let splashRow = 0; // LAVA
        if (this.splashType === 'WATER') splashRow = 1;
        else if (this.splashType === 'ACID') splashRow = 2;

        const sx = splashFrame * SPLASH_ANIM_SPEC.FRAME_W;
        const sy = splashRow * SPLASH_ANIM_SPEC.FRAME_H;
        const sw = SPLASH_ANIM_SPEC.FRAME_W;
        const sh = SPLASH_ANIM_SPEC.FRAME_H;
        const drawX = this.splashTileX;
        const drawY = this.waterSurfaceY - 76;
        ctx.drawImage(splashImg, sx, sy, sw, sh, drawX, drawY, sw, sh);
      }
    }
  }
}

// Cannon / Thrower that shoots projectiles
export class CannonEnemy extends Enemy {
  private shootTimer: number = 0;
  private shootInterval: number = 2.5;
  private minShootInterval: number = 2.0;
  private maxShootInterval: number = 2.5;
  private bulletAsset: string = 'CANNONBALL_PREHISTORY';
  private bulletVel: number = -350;
  private xOffset: number = -40;
  private yOffset: number = 15;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = props.pCollidesFloor === 'true';
    const parsedMax = parseFloat(props.pMaxTime || '2.5');
    const parsedMin = parseFloat(props.pMinTime || props.pMaxTime || '2.5');
    const safeMax = isNaN(parsedMax) || parsedMax <= 0 ? 2.5 : parsedMax;
    const safeMin = isNaN(parsedMin) || parsedMin <= 0 ? safeMax : parsedMin;
    this.minShootInterval = Math.min(safeMin, safeMax);
    this.maxShootInterval = Math.max(safeMin, safeMax);
    this.shootInterval = this.pickNextInterval();
    this.bulletAsset = props.pBulletAsset || 'CANNONBALL_PREHISTORY';
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['CANNON_PREHISTORY'];
    this.width = this.config?.frameW || 80;
    this.height = this.config?.frameH || 90;

    // Read projectile velocity BEFORE resetting this.vx to 0
    const rawVel = parseFloat(props.pxVel || '-350');
    this.bulletVel = isNaN(rawVel) || rawVel === 0 ? -350 : rawVel;
    this.facingRight = this.bulletVel > 0;
    this.vx = 0;

    const rawXOff = parseFloat(props.pxOffset || (this.facingRight ? `${this.width}` : '-40'));
    this.xOffset = isNaN(rawXOff) ? (this.facingRight ? this.width : -40) : rawXOff;

    const rawYOff = parseFloat(props.pyOffset || '15');
    this.yOffset = isNaN(rawYOff) ? 15 : (rawYOff < 0 ? (this.height + rawYOff - 30) : rawYOff);
  }

  private pickNextInterval(): number {
    if (this.maxShootInterval <= this.minShootInterval) {
      return this.minShootInterval;
    }
    return this.minShootInterval + Math.random() * (this.maxShootInterval - this.minShootInterval);
  }

  public update(dt: number, map: TMXMap, player: Player, spawnProjectile?: (p: ProjectileEnemy) => void) {
    this.snapToFloor(map, dt);

    this.frameTimer += dt;
    if (this.frameTimer > 0.18) {
      this.frameTimer = 0;
      const count = this.config?.count || 3;
      this.currentFrame = (this.currentFrame + 1) % count;
    }

    this.shootTimer += dt;
    if (this.shootTimer >= this.shootInterval) {
      this.shootTimer = 0;
      this.shootInterval = this.pickNextInterval();
      if (spawnProjectile) {
        const bullet = new ProjectileEnemy(
          this.bulletAsset,
          'Projectile',
          this.x + this.xOffset,
          this.y + this.yOffset,
          60,
          60,
          { pxVel: `${this.bulletVel}`, pAnim: this.bulletAsset }
        );
        spawnProjectile(bullet);
        const shotSound =
          this.animName === 'CANNON_LASER'
            ? '/assets/audio/fx/laser.ogg'
            : this.animName === 'CANNON_EGYPT'
              ? '/assets/audio/fx/statue_shot.ogg'
              : '/assets/audio/fx/cannon.ogg';
        audio.playSound(shotSound, 0.5);
      }
    }

    this.checkPlayerCollision(player);
  }
}

// Projectile
export class ProjectileEnemy extends Enemy {
  private lifetime: number = 6.0;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = false;
    this.vx = parseFloat(props.pxVel || '-350');
    this.facingRight = this.vx > 0;
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['CANNONBALL_PREHISTORY'];
    this.width = this.config?.frameW || 60;
    this.height = this.config?.frameH || 60;
    // Directional projectiles (count === 2) have frame 0 = left, frame 1 = right
    if (this.config?.count === 2) {
      this.currentFrame = this.vx > 0 ? 1 : 0;
    }
  }

  public update(dt: number, map: TMXMap, player: Player) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
      return;
    }

    // Deactivate on solid wall collision so bullets/lasers never pass through walls
    if (map && map.tiles && map.tileWidth > 0 && map.tileHeight > 0) {
      const box = this.getBox();
      const leadX = this.vx >= 0 ? box.x + box.w : box.x;
      const tx = Math.floor(leadX / map.tileWidth);
      const topTy = Math.floor((box.y + 4) / map.tileHeight);
      const bottomTy = Math.floor((box.y + box.h - 4) / map.tileHeight);
      for (let ty = topTy; ty <= bottomTy; ty++) {
        if (CollisionSystem.isSolid(map, tx, ty)) {
          this.active = false;
          return;
        }
      }
    }

    if (!player.isInvulnerable && player.state !== 'dead') {
      if (CollisionSystem.checkAABB(this.getBox(), player.getBox())) {
        player.takeDamage(this.x);
        this.active = false;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, enemyImages: Record<string, HTMLImageElement>) {
    if (!this.active || !this.config) return;
    const img = enemyImages[this.config.image];
    if (!img) return;

    const col = this.currentFrame % (this.config.cols || 1);
    const sx = this.config.startX + col * this.config.frameW;
    const sy = this.config.startY;
    const sw = this.config.frameW;
    const sh = this.config.frameH;

    ctx.drawImage(img, sx, sy, sw, sh, Math.round(this.x), Math.round(this.y), sw, sh);
  }
}

// Guillotine
export class GuillotineEnemy extends Enemy {
  private timer: number = 0;
  private waitTime: number = 1.7;
  private duration: number = 0.5;
  private dropDelta: number = 100;
  private wasDropping: boolean = false;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.collidesFloor = false;
    this.waitTime = parseFloat(props.pWait || '1.7');
    this.duration = parseFloat(props.pDuration || '0.5');
    this.dropDelta = parseFloat(props.pyDelta || '100');
    this.config = (enemiesConfig as any)['GUILLOTINE'];
    this.width = this.config?.frameW || 76;
    this.height = this.config?.frameH || 300;
  }

  public update(dt: number, _map: TMXMap, player: Player) {
    this.timer += dt;
    const totalCycle = this.waitTime + this.duration;
    const t = this.timer % totalCycle;

    if (t < this.duration) {
      if (!this.wasDropping) {
        this.wasDropping = true;
        audio.playSound('/assets/audio/fx/guillotine.ogg', 0.45);
      }
      const progress = t / this.duration;
      const drop = Math.sin(progress * Math.PI);
      this.y = this.startY + drop * this.dropDelta;
    } else {
      this.wasDropping = false;
      this.y = this.startY;
    }

    if (!player.isInvulnerable && player.state !== 'dead') {
      if (CollisionSystem.checkAABB(this.getBox(), player.getBox())) {
        player.die();
      }
    }
  }
}

// Falling incandescent meteorite hazard for "Zona de meteoritos" (Vascolet.exe 0x00440f80 - 0x004412b0)
export class MeteoriteEnemy extends Enemy {
  public rotation: number = 0;
  public angle: number = 0;
  public ay: number = METEORITE_PHYSICS.INITIAL_AY;
  public bounceCount: number = 0;
  public hasEnteredRoom: boolean = false;
  private rotSpeed: number;

  constructor(x: number, y: number, vx: number, vy: number, angle: number = 0) {
    super('Meteorite', 'Projectile', x, y, 60, 60, { pAnim: 'METEORITE', pxVel: `${vx}` });
    this.collidesFloor = false;
    this.vx = vx;
    this.vy = vy;
    this.ay = METEORITE_PHYSICS.INITIAL_AY;
    this.angle = angle;
    this.config = (enemiesConfig as any)['METEORITE'];
    this.width = this.config?.frameW || 60;
    this.height = this.config?.frameH || 60;
    this.rotation = 0;
    this.rotSpeed = (Math.random() < 0.5 ? 1 : -1) * Math.PI;
  }

  public update(
    dt: number,
    map: TMXMap,
    player: Player,
    _spawnProjectile?: (p: ProjectileEnemy) => void,
    spawnEffect?: (eff: VisualEffect) => void,
    cameraX: number = 0,
    cameraY: number = 0,
    roomWidth: number = 1216,
    roomHeight: number = 912
  ) {
    if (!this.active) return;

    // Integrate velocity and position with vertical gravity ay (0x0041f8c0)
    this.vy += this.ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;

    const box = this.getBox();

    // Room bounds check matching MobileObject::update (0x0041f8c0) & Meteorite::update (0x00441190):
    // Tile & player collisions only occur while the meteorite's box is inside the active room.
    // This allows the meteorite to enter from y = cameraY - 65 without hitting the top boundary row (ty = 35).
    const insideRoom =
      box.x >= cameraX &&
      box.x + box.w <= cameraX + roomWidth &&
      box.y >= cameraY &&
      box.y + box.h <= cameraY + roomHeight;

    if (insideRoom) {
      this.hasEnteredRoom = true;
    } else if (this.hasEnteredRoom) {
      this.active = false;
      return;
    } else if (this.y > cameraY + roomHeight + 100) {
      this.active = false;
      return;
    }

    if (!insideRoom) {
      return;
    }

    // Floor bounce collision matching Meteorite::onCollideY (0x004412b0):
    // Only bounces on downward floor contact (vy > 0) up to 2 times; ignores horizontal wall collisions.
    if (this.vy > 0 && this.bounceCount < METEORITE_PHYSICS.MAX_BOUNCES) {
      const bottomY = box.y + box.h;
      const tileY = Math.floor(bottomY / map.tileHeight);
      const leftTileX = Math.floor((box.x + 2) / map.tileWidth);
      const rightTileX = Math.floor((box.x + box.w - 2) / map.tileWidth);

      for (let tx = leftTileX; tx <= rightTileX; tx++) {
        if (CollisionSystem.isSolid(map, tx, tileY) || CollisionSystem.isPlatform(map, tx, tileY)) {
          const boxBottomOffset = (box.y - this.y) + box.h;
          this.vy =
            this.bounceCount * METEORITE_PHYSICS.BOUNCE_STEP_VY +
            METEORITE_PHYSICS.BOUNCE_BASE_VY;
          this.y = tileY * map.tileHeight - boxBottomOffset - 2.0;
          this.bounceCount += 1;
          this.ay = METEORITE_PHYSICS.BOUNCE_AY;
          break;
        }
      }
    }

    // Check collision with player (0x00441210)
    if (!player.isInvulnerable && player.state !== 'dead') {
      if (CollisionSystem.checkAABB(box, player.getBox())) {
        player.takeDamage(this.x);
        this.explode(spawnEffect);
      }
    }
  }

  private explode(spawnEffect?: (eff: VisualEffect) => void) {
    this.active = false;
    audio.playSound('/assets/audio/fx/explosion.ogg', 0.6);
    if (spawnEffect) {
      spawnEffect(new VisualEffect('enemy_death', this.x + this.width / 2, this.y + this.height / 2));
    }
  }

  public render(ctx: CanvasRenderingContext2D, enemyImages: Record<string, HTMLImageElement>) {
    if (!this.active || !this.config) return;
    const img = enemyImages[this.config.image];
    if (!img) return;

    const sx = this.config.startX;
    const sy = this.config.startY;
    const sw = this.config.frameW;
    const sh = this.config.frameH;

    ctx.save();
    ctx.translate(Math.round(this.x + sw / 2), Math.round(this.y + sh / 2));
    ctx.rotate(this.rotation);
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
}

// Jumping Snake / Robot Snake Enemy (Vascolet.exe 0x00423885 -> Jumper::Jumper at 0x00440860, vtable 0x4ECDF4)
export class JumperEnemy extends Enemy {
  public savedVx: number = 120;
  public ay: number = 800.0;
  public onGround: boolean = false;
  private groundTimer: number = 0;

  constructor(name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string>) {
    super(name, type, x, y, w, h, props);
    this.animName = props.pAnim || props.pAsset || 'SNAKE';
    this.config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['SNAKE'];
    this.width = this.config?.frameW || 60;
    this.height = this.config?.frameH || 100;

    const markerW = w > 0 ? w : this.width;
    const markerH = h > 0 ? h : this.height;
    this.x = Math.round(x + markerW / 2 - this.width / 2);
    this.y = Math.round(y + markerH - this.height);
    this.startX = this.x;
    this.startY = this.y;

    const rawVx = parseFloat(props.pxVel || '120');
    this.savedVx = isNaN(rawVx) || rawVx === 0 ? 120 : rawVx;
    this.vx = this.savedVx;
    this.facingRight = this.savedVx > 0;

    const rawAy = parseFloat(props.pyAccel || '800');
    this.ay = isNaN(rawAy) || rawAy <= 0 ? 800 : rawAy;
    this.collidesFloor = true;
  }

  public settleToFloor(map: TMXMap) {
    if (!this.collidesFloor) return;
    for (let step = 0; step < 20; step++) {
      this.snapToFloor(map, 0.05);
    }
  }

  protected snapToFloor(map: TMXMap, dt: number) {
    if (this.onGround) return;
    super.snapToFloor(map, dt);
    if (this.vy === 0) {
      this.onGround = true;
      this.vx = 0;
    }
  }

  public update(
    dt: number,
    map: TMXMap,
    player: Player,
    _spawnProjectile?: (p: ProjectileEnemy) => void,
    spawnEffect?: (eff: VisualEffect) => void
  ) {
    if (!this.active) return;

    this.frameTimer += dt;
    if (this.frameTimer > 0.1) {
      this.frameTimer = 0;
      const count = this.config?.count || 4;
      this.currentFrame = (this.currentFrame + 1) % count;
    }

    if (this.onGround) {
      this.groundTimer += dt;
      // After completing ground coil cycle (0x00440a47), leap with vy = -600.0 (0x4EF218)
      if (this.groundTimer >= 0.4) {
        this.groundTimer = 0;
        this.onGround = false;
        this.vx = this.savedVx;
        this.vy = -600.0;
        this.facingRight = this.vx > 0;
        audio.playSound('/assets/audio/fx/jump.ogg', 0.45);
      }
    } else {
      const tileW = map.tileWidth;
      const tileH = map.tileHeight;

      // Horizontal movement and wall/ledge reversal (0x00440c70)
      const dx = this.vx * dt;
      this.x += dx;
      this.distanceTraveled += Math.abs(dx);

      const box = this.getBox();
      const checkX = this.vx > 0 ? box.x + box.w : box.x;
      const tileX = Math.floor(checkX / tileW);
      const midTileY = Math.floor((box.y + box.h * 0.5) / tileH);
      const hitWall = CollisionSystem.isSolid(map, tileX, midTileY);
      const reachedMaxDist = this.maxDistance > 0 && this.distanceTraveled >= this.maxDistance;

      if (hitWall || reachedMaxDist) {
        this.x -= dx;
        this.vx = -this.vx;
        this.savedVx = this.vx;
        this.facingRight = this.vx > 0;
        this.distanceTraveled = 0;
      }

      // Vertical gravity and ceiling/floor collision (0x00440d70)
      this.vy = Math.min(800, this.vy + this.ay * dt);
      this.y += this.vy * dt;

      const updatedBox = this.getBox();
      const leftTileX = Math.floor((updatedBox.x + 4) / tileW);
      const rightTileX = Math.floor((updatedBox.x + updatedBox.w - 4) / tileW);

      if (this.vy < 0) {
        const topTileY = Math.floor(updatedBox.y / tileH);
        if (
          CollisionSystem.isSolid(map, leftTileX, topTileY) ||
          CollisionSystem.isSolid(map, rightTileX, topTileY)
        ) {
          const boxTopOffset = updatedBox.y - this.y;
          this.y = (topTileY + 1) * tileH - boxTopOffset;
          this.vy = 0;
        }
      } else if (this.vy > 0) {
        const footY = this.y + this.height;
        const floorTileY = Math.floor(footY / tileH);
        if (
          CollisionSystem.isSolid(map, leftTileX, floorTileY) ||
          CollisionSystem.isPlatform(map, leftTileX, floorTileY) ||
          CollisionSystem.isSolid(map, rightTileX, floorTileY) ||
          CollisionSystem.isPlatform(map, rightTileX, floorTileY)
        ) {
          this.y = floorTileY * tileH - this.height;
          this.vy = 0;
          if (this.vx !== 0) {
            this.savedVx = this.vx;
          }
          this.vx = 0;
          this.onGround = true;
          this.groundTimer = 0;
          this.currentFrame = 0;

          // If landed at the edge of a floor ledge, reverse next jump direction
          const frontX = this.savedVx > 0 ? updatedBox.x + updatedBox.w + 8 : updatedBox.x - 8;
          const frontTileX = Math.floor(frontX / tileW);
          const hasFloorAhead =
            CollisionSystem.isSolid(map, frontTileX, floorTileY) ||
            CollisionSystem.isPlatform(map, frontTileX, floorTileY);
          if (!hasFloorAhead) {
            this.savedVx = -this.savedVx;
            this.facingRight = this.savedVx > 0;
          }
        }
      }
    }

    this.checkPlayerCollision(player, spawnEffect);
  }
}
