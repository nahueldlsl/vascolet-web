import { Box, CollisionSystem } from '../core/Collision';
import { Player } from './Player';
import { VisualEffect } from './Enemy';
import { audio } from '../core/AudioManager';
import { easeOutCubic } from '../core/ParityFormulas';
import spritesData from '../data/sprites.json';
import enemiesConfig from '../data/enemies.json';

export class CollectibleItem {
  public x: number;
  public y: number;
  public width: number = 40;
  public height: number = 40;
  public type: string;
  public assetName: string;
  public collected: boolean = false;
  private animTimer: number = 0;
  private floatOffset: number = 0;

  constructor(type: string, assetName: string, x: number, y: number, w: number, h: number) {
    this.type = type;
    this.assetName = assetName;
    this.x = x;
    this.y = y;

    let spriteKey = this.assetName;
    if (this.assetName === 'POINTS') spriteKey = 'COIN';
    const itemMeta = (spritesData.items as any)[spriteKey] || (spritesData.items as any)['COIN'];

    this.width = w > 0 ? w : (itemMeta?.w || 40);
    this.height = h > 0 ? h : (itemMeta?.h || 40);
  }

  public getBox(): Box {
    // Generous pickup hitbox (+16px margin) centered around the item
    const margin = 16;
    return {
      x: this.x - margin,
      y: this.y + this.floatOffset - margin,
      w: this.width + margin * 2,
      h: this.height + margin * 2,
    };
  }

  public update(
    dt: number,
    player: Player,
    onLevelComplete?: () => void,
    spawnEffect?: (eff: VisualEffect) => void
  ) {
    if (this.collected) return;

    // Item float interpolator from Vascolet.exe (0x00441ae0 & 0x00441c70):
    // Ping-pong mode 2, easeOutCubic, delta = -7.0 px, duration = 1.5s
    const duration = 1.5;
    this.animTimer = (this.animTimer + dt) % duration;
    const progress = this.animTimer / duration;
    const subT = progress < 0.5 ? progress * 2.0 : 1.0 - (progress - 0.5) * 2.0;
    this.floatOffset = -7.0 * easeOutCubic(subT);

    if (this.assetName === 'MICROWAVE' && player.hasMicrowave) return;

    if (CollisionSystem.checkAABB(this.getBox(), player.getBox())) {
      this.collected = true;

      if (spawnEffect) {
        // Item::onCollide (0x00441cd0) spawns L"POWER" (coinEffect.png) at center - 2.0
        spawnEffect(new VisualEffect('item_pickup', this.x + this.width * 0.5 - 2.0, this.y + this.height * 0.5 - 2.0));
      }

      if (this.assetName === 'COIN' || this.assetName === 'POINTS') {
        player.collectCoin();
      } else if (this.assetName === 'LIVES') {
        player.collectLife();
      } else if (this.assetName.includes('KEY')) {
        player.collectKey(this.assetName);
      } else if (this.assetName === 'MICROWAVE') {
        if (!player.hasMicrowave) {
          player.collectMicrowave();
          if (onLevelComplete) {
            setTimeout(() => onLevelComplete(), 1000);
          }
        }
      } else if (this.assetName === 'VASCOLETS') {
        player.vascoletCups = Math.min(4, player.vascoletCups + 1);
        player.addScore(500);
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.85);
      } else if (this.assetName === 'CEREALS') {
        player.cerealBowls = Math.min(4, player.cerealBowls + 1);
        player.addScore(250);
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.85);
      } else {
        player.addScore(250);
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.85);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, itemsImg: HTMLImageElement) {
    if (this.collected) return;

    let spriteKey = this.assetName;
    if (this.assetName === 'POINTS') spriteKey = 'COIN';

    const itemMeta = (spritesData.items as any)[spriteKey] || (spritesData.items as any)['COIN'];
    const drawW = itemMeta.w;
    const drawH = itemMeta.h;
    const drawX = Math.round(this.x + (this.width - drawW) / 2);
    const drawY = Math.round(this.y + (this.height - drawH) / 2 + this.floatOffset);

    ctx.drawImage(
      itemsImg,
      itemMeta.x,
      itemMeta.y,
      itemMeta.w,
      itemMeta.h,
      drawX,
      drawY,
      drawW,
      drawH
    );
  }
}

export class Door {
  public x: number;
  public y: number;
  public width: number = 76;
  public height: number = 304;
  public assetName: string;
  public requiredItem: string;
  public opened: boolean = false;
  private openProgress: number = 0; // 0 to 1

  constructor(assetName: string, requiredItem: string, x: number, y: number, w: number, h: number) {
    this.assetName = assetName;
    this.requiredItem = requiredItem;
    this.x = x;
    this.y = y;
    this.width = w > 0 ? w : 76;
    this.height = h > 0 ? h : 304;
  }

  public getBox(): Box {
    return {
      x: this.x,
      y: this.y,
      w: this.width,
      h: this.height * (1 - this.openProgress), // shrinks as it opens upwards
    };
  }

  public update(dt: number, player: Player) {
    if (this.opened) {
      if (this.openProgress < 1) {
        this.openProgress = Math.min(1, this.openProgress + dt * 1.5);
      }
      return;
    }

    // Check if player has the required key and touches the door
    const triggerBox: Box = {
      x: this.x - 20,
      y: this.y,
      w: this.width + 40,
      h: this.height,
    };

    if (CollisionSystem.checkAABB(triggerBox, player.getBox())) {
      if (!this.requiredItem || player.keys.has(this.requiredItem)) {
        if (this.requiredItem) {
          player.useKey(this.requiredItem);
        }
        this.opened = true;
        audio.playSound('/assets/audio/fx/door.ogg', 0.9);
      }
    }

    // If not open, act as solid barrier to player
    if (!this.opened) {
      const doorBox = this.getBox();
      const pBox = player.getBox();
      if (CollisionSystem.checkAABB(doorBox, pBox)) {
        const playerCenterX = pBox.x + pBox.w / 2;
        const doorCenterX = doorBox.x + doorBox.w / 2;
        const boxOffsetLeft = pBox.x - player.x;
        if (playerCenterX < doorCenterX) {
          player.x = doorBox.x - boxOffsetLeft - pBox.w;
          if (player.vx > 0) player.vx = 0;
        } else {
          player.x = doorBox.x + doorBox.w - boxOffsetLeft;
          if (player.vx < 0) player.vx = 0;
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, gatesImg: HTMLImageElement) {
    if (this.openProgress >= 1) return;

    // Pick door color offset (0=RED, 1=GREEN, 2=YELLOW, 3=BLUE)
    const keyOrAsset = `${this.assetName}_${this.requiredItem}`;
    let col = 0;
    if (keyOrAsset.includes('RED')) col = 0;
    else if (keyOrAsset.includes('GREEN')) col = 1;
    else if (keyOrAsset.includes('YELLOW')) col = 2;
    else if (keyOrAsset.includes('BLUE')) col = 3;

    // Pick era block in tile_gates.png (1024x1024, each gate 80x304)
    let baseX = 0;
    let baseY = 0;
    if (this.assetName.includes('PREHISTORY')) {
      baseX = 0;
      baseY = 304;
    } else if (this.assetName.includes('EGYPT')) {
      baseX = 640;
      baseY = 0;
    } else if (this.assetName.includes('CASTLE')) {
      baseX = 0;
      baseY = 0;
    } else if (this.assetName.includes('PIRATES')) {
      baseX = 320;
      baseY = 0;
    } else if (this.assetName.includes('FUTURE')) {
      baseX = 320;
      baseY = 304;
    }

    const sx = baseX + col * 80;
    const sy = baseY;
    const sw = 76;
    const sh = 304 * (1 - this.openProgress);

    ctx.drawImage(
      gatesImg,
      sx,
      sy,
      sw,
      sh,
      Math.round(this.x),
      Math.round(this.y),
      this.width,
      this.height * (1 - this.openProgress)
    );
  }
}

export class MovingPlatform {
  public x: number;
  public y: number;
  public startX: number;
  public startY: number;
  public destX: number;
  public destY: number;
  public width: number;
  public height: number;
  public duration: number;
  public assetName: string;
  public interpType: 'linear' | 'cosine';
  private progress: number = 0;
  private direction: number = 1;
  private waitTimer: number = 0;
  private waitDuration: number = 0.5;

  constructor(
    x: number,
    y: number,
    w: number,
    h: number,
    xDelta: number,
    yDelta: number,
    duration: number,
    wait: number,
    assetName: string = 'PLATFORM_PREHISTORY_SMALL',
    interpType: 'linear' | 'cosine' = 'linear'
  ) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.destX = x + xDelta;
    this.destY = y + yDelta;
    this.assetName = assetName || 'PLATFORM_PREHISTORY_SMALL';
    this.interpType = interpType;
    const isLarge = this.assetName.includes('LARGE');
    this.width = w > 0 ? w : (isLarge ? 228 : 152);
    this.height = h > 0 ? h : 40;
    this.duration = duration > 0 ? duration : 3.0;
    this.waitDuration = wait >= 0 ? wait : 0.5;
  }

  public getBox(): Box {
    return {
      x: this.x,
      y: this.y,
      w: this.width,
      h: this.height,
    };
  }

  public update(dt: number, player: Player) {
    const prevX = this.x;
    const prevY = this.y;

    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      // While waiting at endpoints, platform position does not change,
      // but we STILL sustain and carry the player standing on top!
    } else {
      this.progress += (dt / this.duration) * this.direction;
      if (this.progress >= 1) {
        this.progress = 1;
        this.direction = -1;
        this.waitTimer = this.waitDuration;
      } else if (this.progress <= 0) {
        this.progress = 0;
        this.direction = 1;
        this.waitTimer = this.waitDuration;
      }

      // Linear for Platform/PlatformLinear, smooth cosine for PlatformInterp
      const t =
        this.interpType === 'cosine'
          ? 0.5 - 0.5 * Math.cos(this.progress * Math.PI)
          : this.progress;

      this.x = this.startX + (this.destX - this.startX) * t;
      this.y = this.startY + (this.destY - this.startY) * t;
    }

    const dx = this.x - prevX;
    const dy = this.y - prevY;

    if (player.state !== 'dead') {
      const pBox = player.getBox();

      // 1. CARRIER: If player is currently riding this platform, transport them with the delta
      if (player.currentPlatform === this) {
        const withinHorizontal =
          pBox.x + pBox.w > this.x && pBox.x < this.x + this.width;

        if (!withinHorizontal) {
          // Player walked off the platform horizontally
          player.currentPlatform = null;
          player.onGround = false;
          if (player.state !== 'jump' && player.state !== 'hurt') {
            player.state = 'fall';
          }
        } else {
          // Carry player seamlessly horizontally
          player.x += dx;
          // Strictly lock vertical position to top of platform
          player.y = this.y - player.height;
          player.vy = 0;
          player.onGround = true;
          player.jumpCount = 0;
          if (player.state === 'fall') {
            player.state = player.vx !== 0 ? 'walk' : 'idle';
          }
        }
      }

      // 2. LANDING: If player is falling downwards (vy >= 0) and not currently attached to this platform
      if (player.vy >= 0 && player.currentPlatform !== this) {
        const horizOverlap =
          pBox.x + pBox.w > this.x + 4 && pBox.x < this.x + this.width - 4;

        if (horizOverlap) {
          const playerBottom = player.y + player.height;
          const prevPlayerBottom = playerBottom - player.vy * dt;
          const platTop = this.y;
          const prevPlatTop = prevY;

          // Swept check: feet were above/near platform top last frame, and at/below it this frame
          const isLanding =
            (prevPlayerBottom <= prevPlatTop + 16 && playerBottom >= platTop - 4) ||
            (playerBottom >= platTop - 4 && playerBottom <= platTop + 16);

          if (isLanding) {
            player.y = platTop - player.height;
            player.vy = 0;
            player.onGround = true;
            player.jumpCount = 0;
            player.currentPlatform = this;
            if (player.state === 'fall' || player.state === 'jump') {
              player.state = player.vx !== 0 ? 'walk' : 'idle';
            }
          }
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, platformImg: HTMLImageElement) {
    // Select era row and size column in tile_platforms.png (512x512)
    const isLarge = this.assetName.includes('LARGE') || this.width > 180;
    const sx = isLarge ? 165 : 3;
    const sw = isLarge ? 230 : 154;

    let sy = 131;
    let sh = 40;
    if (this.assetName.includes('FUTURE')) {
      sy = 4;
      sh = 52;
    } else if (this.assetName.includes('EGYPT')) {
      sy = 70;
      sh = 40;
    } else if (this.assetName.includes('PREHISTORY')) {
      sy = 131;
      sh = 40;
    } else if (this.assetName.includes('PIRATES')) {
      sy = 191;
      sh = 40;
    } else if (this.assetName.includes('CASTLE')) {
      sy = 252;
      sh = 38;
    }

    ctx.drawImage(
      platformImg,
      sx,
      sy,
      sw,
      sh,
      Math.round(this.x),
      Math.round(this.y),
      this.width,
      this.height
    );
  }
}

export class SavePoint {
  public x: number;
  public y: number;
  public width: number = 44;
  public height: number = 56;
  public activated: boolean = false;

  constructor(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.width = w > 0 ? w : 44;
    this.height = h > 0 ? h : 56;
  }

  public getBox(): Box {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }

  public isPlayerNear(player: Player): boolean {
    const triggerBox: Box = {
      x: this.x - 30,
      y: this.y - 60,
      w: this.width + 60,
      h: this.height + 80,
    };
    return CollisionSystem.checkAABB(triggerBox, player.getBox());
  }

  public update(player: Player) {
    if (!this.activated && this.isPlayerNear(player)) {
      this.activated = true;
      player.checkpointX = this.x;
      player.checkpointY = this.y - 40;
      audio.playSound('/assets/audio/fx/powerup.ogg', 0.5);
    }
  }

  public render(ctx: CanvasRenderingContext2D, signsImg: HTMLImageElement) {
    // Native floppy disk save sign from signs_tile.png: (85, 5, 70, 152)
    const drawW = 70;
    const drawH = 152;
    const baseGroundY = this.y + this.height;
    const drawX = Math.round(this.x + (this.width - drawW) / 2);
    const drawY = Math.round(baseGroundY - drawH);

    ctx.drawImage(
      signsImg,
      85,
      5,
      70,
      152,
      drawX,
      drawY,
      drawW,
      drawH
    );
  }
}

export class SignPost {
  public x: number;
  public y: number;
  public width: number = 39;
  public height: number = 59;
  public text: string;

  constructor(x: number, y: number, w: number, h: number, rawText: string) {
    this.x = x;
    this.y = y;
    this.width = w > 0 ? w : 39;
    this.height = h > 0 ? h : 59;
    // Format text: replace escaped characters
    this.text = rawText
      .replace(/\\n/g, '\n')
      .replace(/\\!/g, '¡')
      .replace(/\\[?]/g, '¿')
      .replace(/\\mo/g, 'ño')
      .replace(/\\ma/g, 'ña')
      .replace(/\\a/g, 'á')
      .replace(/\\e/g, 'é')
      .replace(/\\i/g, 'í')
      .replace(/\\o/g, 'ó')
      .replace(/\\u/g, 'ú');
  }

  public isPlayerNear(player: Player): boolean {
    const triggerBox: Box = {
      x: this.x - 40,
      y: this.y - 80,
      w: this.width + 80,
      h: this.height + 100,
    };
    return CollisionSystem.checkAABB(triggerBox, player.getBox());
  }

  public render(ctx: CanvasRenderingContext2D, signsImg: HTMLImageElement) {
    // Native question mark info sign from signs_tile.png: (5, 5, 70, 152)
    const drawW = 70;
    const drawH = 152;
    const baseGroundY = this.y + this.height;
    const drawX = Math.round(this.x + (this.width - drawW) / 2);
    const drawY = Math.round(baseGroundY - drawH);

    ctx.drawImage(
      signsImg,
      5,
      5,
      70,
      152,
      drawX,
      drawY,
      drawW,
      drawH
    );
  }
}

// Trampoline / Spring Jumper
export class Jumper {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public animName: string;
  public bounceVelocity: number = -850;
  private animTimer: number = 0;
  private currentFrame: number = 0;
  private bounceCooldown: number = 0;

  constructor(x: number, y: number, w: number, h: number, animName: string, pyVel?: string) {
    this.animName = animName || 'SNAKE';
    const config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['SNAKE'];
    this.width = config?.frameW || 60;
    this.height = config?.frameH || 100;
    const markerW = w > 0 ? w : this.width;
    const markerH = h > 0 ? h : this.height;
    this.x = Math.round(x + markerW / 2 - this.width / 2);
    this.y = Math.round(y + markerH - this.height);
    const vel = parseFloat(pyVel || '0');
    if (!isNaN(vel) && Math.abs(vel) >= 500) {
      this.bounceVelocity = -Math.abs(vel);
    } else {
      this.bounceVelocity = -850;
    }
  }

  public getBox(): Box {
    return {
      x: this.x,
      y: this.y,
      w: this.width,
      h: this.height,
    };
  }

  public update(dt: number, player: Player) {
    this.animTimer += dt;
    if (this.animTimer > 0.1) {
      this.animTimer = 0;
      this.currentFrame = (this.currentFrame + 1) % 4;
    }

    if (this.bounceCooldown > 0) {
      this.bounceCooldown -= dt;
    }

    if (this.bounceCooldown <= 0 && CollisionSystem.checkAABB(this.getBox(), player.getBox())) {
      // Launch player into the air using TMX pyVel impulse (or default -850)
      player.currentPlatform = null;
      player.vy = this.bounceVelocity;
      player.jumpCount = 1; // Double jump enabled at bounce apex if player has cereal
      player.onGround = false;
      player.state = 'jump';
      this.bounceCooldown = 0.25;
      audio.playSound('/assets/audio/fx/jump.ogg', 0.95);
    }
  }

  public render(ctx: CanvasRenderingContext2D, enemyImages: Record<string, HTMLImageElement>) {
    const config = (enemiesConfig as any)[this.animName] || (enemiesConfig as any)['SNAKE'];
    if (!config) return;
    const img = enemyImages[config.image];
    if (!img) return;

    const cols = config.cols || 1;
    const col = this.currentFrame % cols;
    const row = Math.floor(this.currentFrame / cols);
    const sx = config.startX + col * config.frameW;
    const sy = config.startY + row * config.frameH;

    ctx.drawImage(img, sx, sy, config.frameW, config.frameH, this.x, this.y, this.width, this.height);
  }
}
