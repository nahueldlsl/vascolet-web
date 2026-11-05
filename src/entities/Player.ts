import { TMXMap } from '../types';
import { CollisionSystem, Box } from '../core/Collision';
import { InputManager } from '../core/Input';
import { audio } from '../core/AudioManager';
import spritesData from '../data/sprites.json';

export type PlayerState = 'idle' | 'walk' | 'jump' | 'fall' | 'climb' | 'hurt' | 'dead' | 'getup';
export type PlayerSuit = 'normal' | 'dino' | 'skate';

export class Player {
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;

  // Collision box
  public width: number = 62;
  public height: number = 104;

  public state: PlayerState = 'idle';
  public suit: PlayerSuit = 'normal';
  public facingRight: boolean = true;
  public onGround: boolean = false;
  public onLadder: boolean = false;
  public currentPlatform: any = null;

  // Lives and inventory (PC original starts with 10 lives)
  public lives: number = 10;
  public score: number = 0;
  public coins: number = 0;
  private nextExtraLifeScore: number = 2000;
  public vascoletCups: number = 0;
  public cerealBowls: number = 0;
  public keys: Set<string> = new Set();
  public keyCounts: Record<string, number> = {
    YELLOW_KEY: 0,
    RED_KEY: 0,
    GREEN_KEY: 0,
    BLUE_KEY: 0,
  };
  public hasMicrowave: boolean = false;
  public checkpointX: number = 0;
  public checkpointY: number = 0;
  public minPlayableX: number = 0;

  // Jump tracking for double jump
  public jumpCount: number = 0;

  // Animation
  private frameTimer: number = 0;
  private currentFrameIndex: number = 0;
  private animFrameTime: number = 0.08; // ~12 fps

  // Hurt / invulnerability timer
  public isInvulnerable: boolean = false;
  private invulnerableTimer: number = 0;
  private deathTimer: number = 0;

  // Footstep audio timer
  private stepTimer: number = 0;
  private stepToggle: boolean = false;

  // Physics constants (exact from binary reverse engineering of Vascolet.exe)
  private readonly GRAVITY = 1800.0;
  private readonly WALK_SPEED = 250.0;
  private readonly CLIMB_SPEED = 150.0;
  private readonly MAX_FALL_SPEED = 1000.0;

  public getJumpVelocity(): number {
    // Exact table from binary Vascolet.exe at 0x0050a7d0:
    // 0 cups: -600, 1: -700, 2: -790, 3: -810, 4: -850
    const jumpTable = [-600.0, -700.0, -790.0, -810.0, -850.0];
    const cups = Math.max(0, Math.min(4, this.vascoletCups));
    return jumpTable[cups];
  }

  public canDoubleJump(): boolean {
    // In original PC Vascolet (0x004315bf), double jump is granted by collecting Cereal Bowls
    return this.cerealBowls > 0;
  }

  public getDoubleJumpVelocity(): number {
    // Exact table from binary Vascolet.exe at 0x0050a7f8 / 0x0050a800:
    // 1 cereal: -640, 2: -680, 3: -720, 4: -760
    const doubleJumpTable = [-640.0, -680.0, -720.0, -760.0];
    const idx = Math.max(0, Math.min(3, this.cerealBowls - 1));
    return doubleJumpTable[idx];
  }

  constructor(startX: number, startY: number, minPlayableX: number = 0) {
    this.minPlayableX = minPlayableX;
    this.x = Math.max(minPlayableX, startX);
    this.y = startY;
    this.checkpointX = this.x;
    this.checkpointY = startY;
  }

  public setSuit(suit: PlayerSuit) {
    this.suit = suit;
    // Physical tile collision body is 62 x 104 across all eras in Vascolet engine (TMX standard)
    this.width = 62;
    this.height = 104;
  }

  public resetToCheckpoint() {
    this.currentPlatform = null;
    this.x = Math.max(this.minPlayableX, this.checkpointX);
    this.y = this.checkpointY;
    this.vx = 0;
    this.vy = 0;
    this.jumpCount = 0;
    this.state = 'idle';
    this.deathTimer = 0;
    this.isInvulnerable = true;
    this.invulnerableTimer = 2.0;
  }

  public getBox(): Box {
    if (this.suit === 'dino') {
      const bw = 44;
      const bh = 104;
      return {
        x: this.x + (this.width - bw) / 2,
        y: this.y + (this.height - bh),
        w: bw,
        h: bh,
      };
    }
    return {
      x: this.x,
      y: this.y,
      w: this.width,
      h: this.height,
    };
  }

  public getDeathTimer(): number {
    return this.deathTimer;
  }

  public takeDamage(_fromX: number) {
    if (this.isInvulnerable || this.state === 'dead') return;
    this.die();
  }

  public update(dt: number, input: InputManager, map: TMXMap) {
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 1.8) {
        if (this.lives > 0) {
          this.resetToCheckpoint();
        }
      }
      return;
    }

    if (this.isInvulnerable) {
      this.invulnerableTimer -= dt;
      if (this.invulnerableTimer <= 0) {
        this.isInvulnerable = false;
        if (this.state === 'hurt') {
          this.state = 'idle';
        }
      }
    }

    const box = this.getBox();
    const ladderInfo = this.suit === 'normal' ? CollisionSystem.getLadderInfo(map, box) : null;
    const ladderOverlap = !!ladderInfo;

    // Check entering ladder from top (pressing DOWN while standing on platform above ladder)
    if (input.isDown() && this.suit === 'normal' && this.state !== 'climb' && this.onGround) {
      const centerTileX = Math.floor((box.x + box.w / 2) / map.tileWidth);
      const footTileY = Math.floor((box.y + box.h + 4) / map.tileHeight);
      if (CollisionSystem.isLadder(map, centerTileX, footTileY)) {
        this.state = 'climb';
        this.x = (centerTileX + 0.5) * map.tileWidth - this.width / 2;
        this.y += 10;
        this.vy = this.CLIMB_SPEED;
        this.vx = 0;
        this.onGround = false;
      }
    }

    // Entering ladder from overlapping (pressing UP or DOWN)
    if (ladderOverlap && this.state !== 'climb') {
      if (input.isUp()) {
        this.state = 'climb';
        this.x = ladderInfo.centerX - this.width / 2;
        this.vy = -this.CLIMB_SPEED;
        this.vx = 0;
        this.onGround = false;
      } else if (input.isDown() && !this.onGround) {
        this.state = 'climb';
        this.x = ladderInfo.centerX - this.width / 2;
        this.vy = this.CLIMB_SPEED;
        this.vx = 0;
      }
    }

    // While in climb state:
    if (this.state === 'climb') {
      this.currentPlatform = null;
      // 1. Jump exit (only with explicit jump button Space/KeyX, NOT ArrowUp)
      if (input.isJumpActionJustPressed()) {
        this.state = 'jump';
        this.vy = this.getJumpVelocity();
        this.jumpCount = 1;
        this.onGround = false;
        if (input.isLeft()) {
          this.vx = -this.WALK_SPEED;
          this.facingRight = false;
        } else if (input.isRight()) {
          this.vx = this.WALK_SPEED;
          this.facingRight = true;
        } else {
          this.vx = 0;
        }
        audio.playSound('/assets/audio/fx/jump_vascolet.ogg', 0.8);
      } else {
        // 2. Horizontal movement is locked to 0 on ladder (Vascolet.exe at 0x0050a81c = 0.0)
        this.vx = 0;
        if (input.isLeft()) {
          this.facingRight = false;
        } else if (input.isRight()) {
          this.facingRight = true;
        }

        // 3. Vertical climbing
        if (input.isUp()) {
          this.vy = -this.CLIMB_SPEED;
        } else if (input.isDown()) {
          this.vy = this.CLIMB_SPEED;
        } else {
          this.vy = 0;
        }

        // 4. Reaching top of ladder while climbing UP: step onto top floor
        if (this.vy < 0 && ladderInfo) {
          const tileW = map.tileWidth;
          const tileH = map.tileHeight;
          const centerTileX = Math.floor((this.x + this.width / 2) / tileW);
          const waistTileY = Math.floor((this.y + this.height * 0.5) / tileH);
          const hasLadderAbove = CollisionSystem.isLadder(map, centerTileX, waistTileY);

          if (!hasLadderAbove || ladderInfo.isTopEnd) {
            const ladderTopY = ladderInfo.topY;
            if (this.y + this.height <= ladderTopY + 24) {
              this.y = ladderTopY - this.height;
              this.state = 'idle';
              this.vy = 0;
              this.onGround = true;
              this.jumpCount = 0;
            }
          }
        }

        // 5. If feet touch solid ground and not pressing UP: exit ladder to walk or idle
        if (this.onGround && !input.isUp()) {
          this.state = (input.isLeft() || input.isRight()) ? 'walk' : 'idle';
        }

        // 6. If no longer overlapping ladder (e.g. moved off horizontally):
        if (!ladderOverlap && this.state === 'climb') {
          this.state = this.onGround ? (this.vx !== 0 ? 'walk' : 'idle') : 'fall';
        }
      }
    }

    if (this.state !== 'climb') {
      // Horizontal Movement (if not in knockback hurt state)
      if (this.state !== 'hurt') {
        if (input.isLeft()) {
          this.vx = -this.WALK_SPEED;
          this.facingRight = false;
          if (this.onGround || this.currentPlatform) this.state = 'walk';
        } else if (input.isRight()) {
          this.vx = this.WALK_SPEED;
          this.facingRight = true;
          if (this.onGround || this.currentPlatform) this.state = 'walk';
        } else {
          this.vx = 0;
          if (this.onGround || this.currentPlatform) this.state = 'idle';
        }
      }

      // Footstep sound
      if (this.state === 'walk' && (this.onGround || this.currentPlatform)) {
        this.stepTimer += dt;
        if (this.stepTimer >= (this.suit === 'skate' ? 0.4 : 0.3)) {
          this.stepTimer = 0;
          this.stepToggle = !this.stepToggle;
          if (this.suit === 'dino') {
            const snd = this.stepToggle ? '/assets/audio/fx/footstep_dino_1.ogg' : '/assets/audio/fx/footstep_dino_2.ogg';
            audio.playSound(snd, 0.45);
          } else if (this.suit === 'skate') {
            audio.playSound('/assets/audio/fx/skate.ogg', 0.4);
          } else {
            const snd = this.stepToggle ? '/assets/audio/fx/footstep_1.ogg' : '/assets/audio/fx/footstep_2.ogg';
            audio.playSound(snd, 0.4);
          }
        }
      } else {
        this.stepTimer = 0;
      }

      // Jump & Double Jump
      if (input.isJumpJustPressed()) {
        if (this.onGround || this.currentPlatform) {
          // 1st Jump from ground or moving platform
          this.currentPlatform = null;
          this.vy = this.getJumpVelocity();
          this.onGround = false;
          this.jumpCount = 1;
          this.state = 'jump';
          const snd = this.suit === 'dino' ? '/assets/audio/fx/jump.ogg' : '/assets/audio/fx/jump_vascolet.ogg';
          audio.playSound(snd, 0.8);
        } else if (this.canDoubleJump() && this.jumpCount === 1) {
          // 2nd Jump in mid-air (Double Jump unlocked with Cereal Bowls!)
          this.currentPlatform = null;
          this.vy = this.getDoubleJumpVelocity();
          this.jumpCount = 2;
          this.state = 'jump';
          const snd = this.suit === 'dino' ? '/assets/audio/fx/jump.ogg' : '/assets/audio/fx/jump_vascolet.ogg';
          audio.playSound(snd, 0.85);
        }
      }

      // Gravity
      if (this.currentPlatform) {
        this.vy = 0;
        this.onGround = true;
      } else {
        this.vy += this.GRAVITY * dt;
        if (this.vy > this.MAX_FALL_SPEED) {
          this.vy = this.MAX_FALL_SPEED;
        }

        if (this.vy > 0 && !this.onGround && this.state !== 'hurt') {
          this.state = 'fall';
        }
      }
    }

    // Apply movement with tile collision
    this.moveAndCollide(dt, map, input);

    // Hazard collision & abyss fall check
    if (this.y > map.height * map.tileHeight) {
      this.die();
      // If falling out of the world abyss, immediately restore player at checkpoint coordinates
      // so camera never follows falling corpse into empty bottom void
      this.x = Math.max(this.minPlayableX, this.checkpointX);
      this.y = this.checkpointY;
    } else if (!this.isInvulnerable && CollisionSystem.checkHazardCollision(map, this.getBox())) {
      this.die();
    }

    // Update animations
    this.updateAnimation(dt);
  }

  private moveAndCollide(dt: number, map: TMXMap, input: InputManager) {
    const tileW = map.tileWidth;
    const tileH = map.tileHeight;

    // --- Move X ---
    this.x += this.vx * dt;

    // Clamp horizontal movement to minimum playable X
    if (this.x < this.minPlayableX) {
      this.x = this.minPlayableX;
      if (this.vx < 0) this.vx = 0;
    }

    // Check horizontal tiles
    const startX = Math.floor(this.x / tileW);
    const endX = Math.floor((this.x + this.width - 1) / tileW);
    const startY = Math.floor(this.y / tileH);
    const endY = Math.floor((this.y + this.height - 1) / tileH);

    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        if (CollisionSystem.isSolid(map, tx, ty)) {
          if (this.vx > 0) {
            // Moving right, hit left edge of tile
            this.x = tx * tileW - this.width;
            this.vx = 0;
          } else if (this.vx < 0) {
            // Moving left, hit right edge of tile
            this.x = (tx + 1) * tileW;
            this.vx = 0;
          }
        }
      }
    }

    // --- Move Y ---
    const oldBottom = this.y + this.height;
    this.y += this.vy * dt;

    const newStartX = Math.floor(this.x / tileW);
    const newEndX = Math.floor((this.x + this.width - 1) / tileW);
    const newStartY = Math.floor(this.y / tileH);
    const newEndY = Math.floor((this.y + this.height) / tileH);

    this.onGround = false;
    if (this.currentPlatform) {
      this.onGround = true;
    }

    for (let ty = newStartY; ty <= newEndY; ty++) {
      for (let tx = newStartX; tx <= newEndX; tx++) {
        const isSolid = CollisionSystem.isSolid(map, tx, ty);
        const isPlatform = CollisionSystem.isPlatform(map, tx, ty);

        if (isSolid) {
          if (this.vy > 0) {
            // Falling down, hit floor
            this.currentPlatform = null;
            this.y = ty * tileH - this.height;
            this.vy = 0;
            this.onGround = true;
            this.jumpCount = 0;
          } else if (this.vy < 0) {
            // Moving up, hit ceiling
            this.y = (ty + 1) * tileH;
            this.vy = 0;
          }
        } else if (isPlatform && this.vy >= 0 && !input.isDown()) {
          // Check one-way platform (only if previously above it)
          const platformTop = ty * tileH;
          if (oldBottom <= platformTop + 6 && this.y + this.height >= platformTop) {
            this.currentPlatform = null;
            this.y = platformTop - this.height;
            this.vy = 0;
            this.onGround = true;
            this.jumpCount = 0;
          }
        }
      }
    }
  }

  public die() {
    if (this.state === 'dead') return;
    this.currentPlatform = null;
    this.state = 'dead';
    this.vx = 0;
    this.vy = 0;
    this.x = Math.max(this.minPlayableX, this.x);
    this.deathTimer = 0;
    this.lives--;
    audio.playSound('/assets/audio/fx/death_2.ogg', 0.9);
  }

  public addScore(points: number) {
    this.score += points;
    while (this.score >= this.nextExtraLifeScore) {
      this.lives++;
      this.nextExtraLifeScore += 2000;
      audio.playSound('/assets/audio/fx/extra_life.ogg', 0.9);
    }
  }

  public collectCoin() {
    this.coins++;
    this.addScore(100);
    audio.playSound('/assets/audio/fx/item.ogg', 0.6);
  }

  public collectLife() {
    this.lives++;
    audio.playSound('/assets/audio/fx/extra_life.ogg', 0.9);
  }

  public collectKey(keyName: string) {
    this.keys.add(keyName);
    this.keyCounts[keyName] = (this.keyCounts[keyName] || 0) + 1;
    audio.playSound('/assets/audio/fx/item.ogg', 0.8);
  }

  public useKey(keyName: string) {
    if (this.keyCounts[keyName] && this.keyCounts[keyName] > 0) {
      this.keyCounts[keyName]--;
      if (this.keyCounts[keyName] <= 0) {
        this.keys.delete(keyName);
      }
    } else {
      this.keys.delete(keyName);
    }
  }

  public collectMicrowave() {
    this.hasMicrowave = true;
    audio.playSound('/assets/audio/fx/microwave.ogg', 1.0);
  }

  public updateAnimation(dt: number) {
    this.frameTimer += dt;
    if (this.frameTimer < this.animFrameTime) return;
    this.frameTimer = 0;

    const dinoWalkFrames = [8, 9, 10, 11, 1, 2, 3, 4, 5, 6, 7];
    const skateWalkFrames = [1, 2];
    const normalWalkFrames = [1, 2, 3, 4, 5, 6, 7, 8];
    const climbFrames = [21, 22, 21, 23];

    if (this.suit === 'dino') {
      switch (this.state) {
        case 'idle':
          this.currentFrameIndex = 0;
          break;
        case 'walk':
          this.currentFrameIndex = (this.currentFrameIndex + 1) % dinoWalkFrames.length;
          break;
        case 'jump':
        case 'fall':
          this.currentFrameIndex = 15;
          break;
        case 'hurt':
          this.currentFrameIndex = 13;
          break;
        case 'dead':
          this.currentFrameIndex = 14;
          break;
      }
    } else if (this.suit === 'skate') {
      switch (this.state) {
        case 'idle':
          this.currentFrameIndex = 0;
          break;
        case 'walk':
          this.currentFrameIndex = (this.currentFrameIndex + 1) % skateWalkFrames.length;
          break;
        case 'jump':
        case 'fall':
          this.currentFrameIndex = 3;
          break;
        case 'dead':
        case 'hurt':
          this.currentFrameIndex = 4;
          break;
      }
    } else {
      switch (this.state) {
        case 'idle':
          this.currentFrameIndex = 0;
          break;
        case 'walk':
          this.currentFrameIndex = (this.currentFrameIndex + 1) % normalWalkFrames.length;
          break;
        case 'jump':
          this.currentFrameIndex = 9;
          break;
        case 'fall':
          this.currentFrameIndex = 11;
          break;
        case 'climb':
          if (this.vy !== 0) {
            this.currentFrameIndex = (this.currentFrameIndex + 1) % climbFrames.length;
          }
          break;
        case 'dead':
        case 'hurt':
          this.currentFrameIndex = 16;
          break;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
    if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
      // Blinking effect when invulnerable
      return;
    }

    let frameList = spritesData.vascolet;
    let frameId = 0;
    let anchorX = 71;
    let anchorY = 153;

    if (this.suit === 'dino') {
      frameList = spritesData.dino_vascolet;
      anchorX = 100;
      anchorY = 213;
      const dinoWalkFrames = [8, 9, 10, 11, 1, 2, 3, 4, 5, 6, 7];
      if (this.state === 'walk') {
        frameId = dinoWalkFrames[this.currentFrameIndex % dinoWalkFrames.length];
      } else if (this.state === 'jump' || this.state === 'fall') {
        frameId = 15;
      } else if (this.state === 'hurt') {
        frameId = 13;
      } else if (this.state === 'dead') {
        frameId = 14;
      } else {
        frameId = 0;
      }
    } else if (this.suit === 'skate') {
      frameList = spritesData.skate_vascolet;
      anchorX = 71;
      anchorY = 156;
      const skateWalkFrames = [1, 2];
      if (this.state === 'walk') {
        frameId = skateWalkFrames[this.currentFrameIndex % skateWalkFrames.length];
      } else if (this.state === 'jump' || this.state === 'fall') {
        frameId = 3;
      } else if (this.state === 'dead' || this.state === 'hurt') {
        frameId = 4;
      } else {
        frameId = 0;
      }
    } else {
      anchorX = 71;
      anchorY = 153;
      const walkFrames = [1, 2, 3, 4, 5, 6, 7, 8];
      const climbFrames = [21, 22, 21, 23];
      if (this.state === 'walk') {
        frameId = walkFrames[this.currentFrameIndex % walkFrames.length];
      } else if (this.state === 'climb') {
        frameId = climbFrames[this.currentFrameIndex % climbFrames.length];
      } else if (this.state === 'jump') {
        frameId = 9;
      } else if (this.state === 'fall') {
        frameId = 11;
      } else if (this.state === 'dead' || this.state === 'hurt') {
        frameId = 16;
      } else {
        frameId = 0;
      }
    }

    const frame = frameList[frameId] || frameList[0];
    const drawX = Math.round(this.x + this.width / 2 - anchorX);
    const drawY = Math.round(this.y + this.height - anchorY);

    ctx.save();
    if (!this.facingRight) {
      ctx.translate(drawX + frame.w, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    } else {
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, drawX, drawY, frame.w, frame.h);
    }
    ctx.restore();
  }
}
