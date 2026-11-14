import { TMXMap, MapObject, LevelConfig, LEVEL_CONFIGS, GameEra } from '../types';
import { assets } from '../core/AssetLoader';
import { audio } from '../core/AudioManager';
import { Camera } from '../core/Camera';
import { InputManager } from '../core/Input';
import { Player } from '../entities/Player';
import {
  Enemy,
  BirdEnemy,
  StalactiteEnemy,
  PiranhaEnemy,
  CannonEnemy,
  GuillotineEnemy,
  ProjectileEnemy,
  MeteoriteEnemy,
  JumperEnemy,
  VisualEffect,
} from '../entities/Enemy';
import { CollectibleItem, Door, MovingPlatform, SavePoint, SignPost } from '../entities/Interactive';
import { HUD } from '../ui/HUD';
import { DialogueBox } from '../ui/DialogueBox';
import { OptionsModal } from '../ui/OptionsModal';
import { calculateMeteoriteInterval, createMeteoriteSpawn } from '../core/ParityFormulas';

/**
 * Resolves the canonical player spawn object from TMX objects, preferring
 * spawns inside the playable area (x >= minPlayableX) and selecting the
 * leftmost one deterministically when duplicate markers exist (e.g. egypt.tmx).
 */
export function resolvePlayerSpawn(
  objects: MapObject[],
  minPlayableX: number
): { x: number; y: number } {
  const candidates = objects.filter((o) => o.type === 'Vascolet');
  if (candidates.length === 0) {
    return { x: Math.max(100, minPlayableX), y: 100 };
  }
  const inPlayable = candidates.filter((o) => o.x >= minPlayableX);
  const pool = inPlayable.length > 0 ? inPlayable : candidates;
  const chosen = pool.reduce((best, cur) => (cur.x < best.x ? cur : best), pool[0]);
  const x = chosen.width > 0 ? Math.round(chosen.x + chosen.width * 0.5 - 25) : chosen.x;
  const y = chosen.height > 0 ? Math.round(chosen.y + chosen.height - 90) : chosen.y;
  return { x, y };
}

export class GameScene {
  public levelEra: GameEra = 'prehistory';
  public config!: LevelConfig;
  public map!: TMXMap;
  public camera!: Camera;
  public player!: Player;

  public enemies: Enemy[] = [];
  public items: CollectibleItem[] = [];
  public doors: Door[] = [];
  public platforms: MovingPlatform[] = [];
  public savePoints: SavePoint[] = [];
  public signs: SignPost[] = [];
  public projectiles: ProjectileEnemy[] = [];
  public meteorites: MeteoriteEnemy[] = [];
  public effects: VisualEffect[] = [];

  private hudMessageText: string = '';
  private hudMessageTimer: number = 0;
  private meteoriteSpawnTimer: number = 0;
  private meteoriteNextSpawn: number = 0.8;
  private lastRoomX: number = -1;
  private lastRoomY: number = -1;

  public hud: HUD = new HUD();
  public dialogueBox: DialogueBox = new DialogueBox();
  public optionsModal: OptionsModal = new OptionsModal();

  public isPaused: boolean = false;
  public isShowingHelp: boolean = false;
  public pauseSelectedIndex: number = 0;
  private pauseOptions: { label: string; action: string }[] = [
    { label: 'Continuar', action: 'resume' },
    { label: 'Ayuda', action: 'help' },
    { label: 'Opciones', action: 'options' },
    { label: 'Salir', action: 'quit' },
  ];

  public isCompleted: boolean = false;
  public levelCompleteTimer: number = 0;
  public isGameOver: boolean = false;

  private tilesetImg!: HTMLImageElement;
  private vascoletImg!: HTMLImageElement;
  private vascoletDinoImg!: HTMLImageElement;
  private vascoletSkateImg!: HTMLImageElement;
  private itemsImg!: HTMLImageElement;
  private hudBgImg!: HTMLImageElement;
  private coinEffectImg!: HTMLImageElement;
  private gatesImg!: HTMLImageElement;
  private platformsImg!: HTMLImageElement;
  private signsImg!: HTMLImageElement;
  private bannerImg!: HTMLImageElement;
  private buttonsImg!: HTMLImageElement;
  private opcionesImg!: HTMLImageElement;
  private helpImg!: HTMLImageElement;
  private pressAnyKeyImg!: HTMLImageElement;
  private enemyImages: Record<string, HTMLImageElement> = {};

  public async loadLevel(era: GameEra, initialScore: number = 0, initialLives: number = 10): Promise<void> {
    this.levelEra = era;
    this.config = LEVEL_CONFIGS[era];
    this.isPaused = false;
    this.isShowingHelp = false;
    this.optionsModal.close();
    this.pauseSelectedIndex = 0;
    this.isCompleted = false;
    this.levelCompleteTimer = 0;
    this.isGameOver = false;

    // Load Map
    this.map = await assets.loadTMX(this.config.tmxFile);

    // Load Tileset image
    this.tilesetImg = await assets.loadImage(this.config.tilesetImage);

    // Load Vascolet suits
    this.vascoletImg = await assets.loadImage('/assets/images/vascolet/frames_AV_tile.png');
    this.vascoletDinoImg = await assets.loadImage('/assets/images/vascolet/frames_AVD_tile.png');
    this.vascoletSkateImg = await assets.loadImage('/assets/images/vascolet/frames_AVP_tile.png');

    // Load common sprite sheets & HUD / Pause UI
    this.itemsImg = await assets.loadImage('/assets/images/menuElements/items.png');
    this.hudBgImg = await assets.loadImage('/assets/images/menuElements/back_hud.png');
    this.coinEffectImg = await assets.loadImage('/assets/images/enemies/coinEffect.png');
    this.gatesImg = await assets.loadImage('/assets/images/elements/tile_gates.png');
    this.platformsImg = await assets.loadImage('/assets/images/elements/tile_platforms.png');
    this.signsImg = await assets.loadImage('/assets/images/elements/signs_tile.png');
    this.bannerImg = await assets.loadImage('/assets/lang/images/menu/banner.png');
    this.buttonsImg = await assets.loadImage('/assets/images/menuElements/buttons_tile.png');
    this.opcionesImg = await assets.loadImage('/assets/images/menuElements/opciones_tile.png');
    this.helpImg = await assets.loadImage('/assets/lang/images/help/ayuda.jpg');
    this.pressAnyKeyImg = await assets.loadImage('/assets/lang/images/menu/press_any_key.png');

    // Load enemy textures
    this.enemyImages['/assets/images/enemies/enemies_tile.png'] = await assets.loadImage('/assets/images/enemies/enemies_tile.png');
    this.enemyImages['/assets/images/enemies/enemies_tile_2.png'] = await assets.loadImage('/assets/images/enemies/enemies_tile_2.png');
    this.enemyImages['/assets/images/enemies/anim_lava_tile.png'] = await assets.loadImage('/assets/images/enemies/anim_lava_tile.png');

    // Camera: 1200 x 900 native resolution using 16x12-tile fixed rooms (1216 x 912 TMX units)
    this.camera = new Camera(1200, 900);
    const minCameraY = this.levelEra === 'prehistory' ? 3 * 912 : 0;
    this.camera.setBounds(
      this.map.width * this.map.tileWidth,
      this.map.height * this.map.tileHeight,
      this.config.minPlayableX,
      minCameraY
    );

    // Parse Entities
    this.parseObjects();

    // Preserve score & lives from previous level and synchronize next extra life threshold
    this.player.setScoreAndLives(initialScore, initialLives);

    // Settle ground enemies onto their floor tiles without advancing patrols
    for (const enemy of this.enemies) {
      if (enemy.collidesFloor) {
        enemy.settleToFloor(this.map);
      }
    }

    // Camera initial snap to player's fixed room
    this.camera.setPosition(this.player.x, this.player.y, this.player.width, this.player.height);

    // Start level music
    audio.playMusic(this.config.musicFile, true);
  }

  private parseObjects() {
    this.enemies = [];
    this.items = [];
    this.doors = [];
    this.platforms = [];
    this.savePoints = [];
    this.signs = [];
    this.projectiles = [];
    this.meteorites = [];
    this.effects = [];
    this.hudMessageText = '';
    this.hudMessageTimer = 0;
    this.dialogueBox.hide();
    this.meteoriteSpawnTimer = 0;
    this.meteoriteNextSpawn = 0.3 + Math.random() * 1.2;
    this.lastRoomX = -1;
    this.lastRoomY = -1;

    for (const obj of this.map.objects) {
      const type = obj.type;
      const name = obj.name;
      const x = obj.x;
      const y = obj.y;
      const w = obj.width;
      const h = obj.height;
      const p = obj.properties;

      if (type === 'Vascolet') {
        // Player spawn resolved below via resolvePlayerSpawn
      } else if (type === 'Item') {
        const assetName = p.pAsset || 'COIN';
        const count = parseInt(p.pCount || '1', 10) || 1;
        this.items.push(new CollectibleItem(type, assetName, x, y, w, h, count));
      } else if (type === 'Door') {
        const assetName = p.pAsset || 'BLUE_DOOR_PREHISTORY';
        const reqItem = p.pRequiredItem || '';
        const reqCount = parseInt(p.pRequiredCount || p.pCount || '1', 10) || 1;
        this.doors.push(new Door(assetName, reqItem, x, y, w, h, reqCount));
      } else if (type === 'SavePoint') {
        this.savePoints.push(new SavePoint(x, y, w, h));
      } else if (type === 'Information') {
        this.signs.push(new SignPost(x, y, w, h, p.pText || ''));
      } else if (type === 'Jumper') {
        this.enemies.push(new JumperEnemy(name, type, x, y, w, h, p));
      } else if (type === 'Platform' || type === 'PlatformInterp' || type === 'PlatformLinear') {
        const xDelta = parseFloat(p.pxDest || '0');
        const yDelta = parseFloat(p.pyDest || '0');
        const speed = parseFloat(p.pSpeed || '0');
        const totalDist = Math.hypot(xDelta, yDelta);
        let duration = parseFloat(p.pDuration || '0');
        if ((isNaN(duration) || duration <= 0) && speed > 0 && totalDist > 0) {
          duration = totalDist / speed;
        }
        if (isNaN(duration) || duration <= 0) {
          duration = 3.0;
        }
        const wait = parseFloat(p.pWait || '0.5');
        const defaultPlatAsset = `PLATFORM_${this.levelEra.toUpperCase()}_SMALL`;
        const interp = type === 'PlatformInterp' ? 'cosine' : 'linear';
        this.platforms.push(
          new MovingPlatform(x, y, w, h, xDelta, yDelta, duration, wait, p.pAsset || defaultPlatAsset, interp)
        );
      } else if (type === 'Bird') {
        this.enemies.push(new BirdEnemy(name, type, x, y, w, h, p));
      } else if (type === 'Stalactite') {
        this.enemies.push(new StalactiteEnemy(name, type, x, y, w, h, p));
      } else if (type === 'Piranha') {
        this.enemies.push(new PiranhaEnemy(name, type, x, y, w, h, p));
      } else if (type === 'Fire') {
        this.enemies.push(new Enemy(name, type, x, y, w, h, p));
      } else if (type === 'Thrower') {
        this.enemies.push(new CannonEnemy(name, type, x, y, w, h, p));
      } else if (type === 'Guillotine') {
        this.enemies.push(new GuillotineEnemy(name, type, x, y, w, h, p));
      } else {
        this.enemies.push(new Enemy(name, type, x, y, w, h, p));
      }
    }

    const spawn = resolvePlayerSpawn(this.map.objects, this.config.minPlayableX);
    this.player = new Player(spawn.x, spawn.y, this.config.minPlayableX);

    // Apply era suit
    if (this.levelEra === 'prehistory') {
      this.player.setSuit('dino');
    } else if (this.levelEra === 'future') {
      this.player.setSuit('skate');
    } else {
      this.player.setSuit('normal');
    }
  }

  public handleMouseMove(x: number, y: number, width: number = 1200, height: number = 900) {
    if (!this.isPaused || this.isShowingHelp || this.optionsModal.isOpen) return;

    const dialogW = 280;
    const dialogH = 552;
    const dx = Math.round((width - dialogW) / 2);
    const dy = Math.round((height - dialogH) / 2);
    const btnX = dx + 45;
    const btnW = 190;
    const btnH = 40;
    const startY = dy + 295;
    const spacing = 46;

    for (let i = 0; i < this.pauseOptions.length; i++) {
      const by = startY + i * spacing;
      if (x >= btnX && x <= btnX + btnW && y >= by && y <= by + btnH) {
        if (this.pauseSelectedIndex !== i) {
          this.pauseSelectedIndex = i;
          audio.playSound('/assets/audio/fx/item.ogg', 0.25);
        }
        break;
      }
    }
  }

  public handleClick(x: number, y: number, width: number = 1200, height: number = 900): string | null {
    if (!this.isPaused) return null;

    if (this.isShowingHelp) {
      this.isShowingHelp = false;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
      return null;
    }

    if (this.optionsModal.isOpen) {
      this.optionsModal.handleClick(x, y, width, height);
      return null;
    }

    const dialogW = 280;
    const dialogH = 552;
    const dx = Math.round((width - dialogW) / 2);
    const dy = Math.round((height - dialogH) / 2);
    const btnX = dx + 45;
    const btnW = 190;
    const btnH = 40;
    const startY = dy + 295;
    const spacing = 46;

    for (let i = 0; i < this.pauseOptions.length; i++) {
      const by = startY + i * spacing;
      if (x >= btnX && x <= btnX + btnW && y >= by && y <= by + btnH) {
        this.pauseSelectedIndex = i;
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.6);
        return this.executePauseAction(this.pauseOptions[i].action);
      }
    }

    return null;
  }

  private executePauseAction(action: string): string | null {
    if (action === 'resume') {
      this.isPaused = false;
    } else if (action === 'help') {
      this.isShowingHelp = true;
    } else if (action === 'options') {
      this.optionsModal.open();
    } else if (action === 'quit') {
      this.isPaused = false;
      return 'quit_to_menu';
    }
    return null;
  }

  public update(dt: number, input: InputManager): string | null {
    // If paused, handle Pause / Options / Help navigation
    if (this.isPaused) {
      if (this.isShowingHelp) {
        if (input.isAnyKeyJustPressed() || input.isPauseJustPressed() || input.isSelectJustPressed()) {
          this.isShowingHelp = false;
          audio.playSound('/assets/audio/fx/item.ogg', 0.4);
        }
        return null;
      }

      if (this.optionsModal.isOpen) {
        this.optionsModal.update(input);
        return null;
      }

      if (input.isPauseJustPressed()) {
        this.isPaused = false;
        audio.playSound('/assets/audio/fx/item.ogg', 0.5);
        return null;
      }

      if (input.isDownJustPressed()) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex + 1) % this.pauseOptions.length;
        audio.playSound('/assets/audio/fx/item.ogg', 0.4);
      } else if (input.isUpJustPressed()) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex - 1 + this.pauseOptions.length) % this.pauseOptions.length;
        audio.playSound('/assets/audio/fx/item.ogg', 0.4);
      }

      if (input.isSelectJustPressed()) {
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.6);
        return this.executePauseAction(this.pauseOptions[this.pauseSelectedIndex].action);
      }

      return null;
    }

    // Toggle pause with Escape / P
    if (input.isPauseJustPressed()) {
      this.isPaused = true;
      this.pauseSelectedIndex = 0;
      audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      return null;
    }

    // Check game over (allow death hop/animation to complete before switching screen)
    if (this.player.lives <= 0 && this.player.state === 'dead' && this.player.getDeathTimer() >= 1.5) {
      audio.stopMusic();
      audio.playSound('/assets/audio/fx/death_2.ogg', 0.9);
      this.isGameOver = true;
      return 'game_over';
    }

    // Freeze gameplay during microwave victory sequence (Vascolet.exe state 11)
    if (this.levelCompleteTimer > 0) {
      this.player.update(dt, input, this.map);
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const eff = this.effects[i];
        eff.update(dt);
        if (!eff.active) {
          this.effects.splice(i, 1);
        }
      }
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.isCompleted = true;
        return 'level_completed';
      }
      return null;
    }

    // Update Player
    this.player.update(dt, input, this.map);

    // Update Platforms in current room (or platform carrying the player)
    for (const plat of this.platforms) {
      if (plat === this.player.currentPlatform || this.camera.isInCurrentRoom(plat.x, plat.y, plat.width, plat.height, 250)) {
        plat.update(dt, this.player);
      }
    }

    // Fixed-room camera transition (StageManager 16x12-tile screens)
    // Run after platform carrier updates to ensure zero jitter/latency
    this.camera.follow(this.player.x, this.player.y, this.player.width, this.player.height);

    // Reset transient HUD alerts and meteorite zone timer on room transition (0x00420230 / 0x0041fe60)
    const roomX = this.camera.screenX + 1;
    const roomY = this.camera.screenY + 1;
    if (roomX !== this.lastRoomX || roomY !== this.lastRoomY) {
      this.lastRoomX = roomX;
      this.lastRoomY = roomY;
      this.hudMessageText = '';
      this.hudMessageTimer = 0;
      this.dialogueBox.hide();
      this.meteorites = [];
      this.meteoriteSpawnTimer = 0;
      this.meteoriteNextSpawn = 0.3 + Math.random() * 1.2;
    }

    // Update Doors
    for (const door of this.doors) {
      if (this.camera.isInCurrentRoom(door.x, door.y, door.width, door.height, 100)) {
        door.update(dt, this.player);
      }
    }

    // Update Items
    const addEffect = (eff: VisualEffect) => this.effects.push(eff);
    for (const item of this.items) {
      if (!item.collected && this.camera.isInCurrentRoom(item.x, item.y, item.width, item.height, 80)) {
        item.update(
          dt,
          this.player,
          () => {
            audio.stopMusic();
            this.player.winLevel();
            this.levelCompleteTimer = 1.0;
          },
          addEffect
        );
      }
    }

    if (this.isCompleted) {
      return 'level_completed';
    }

    // Update Savepoints & Signs: both automatically trigger Hud::showMessage(text, 2.0s) on overlap (0x004415e0 / 0x00407470)
    for (const sp of this.savePoints) {
      if (sp.update(this.player)) {
        this.hudMessageText = 'Juego Salvado';
        this.hudMessageTimer = 2.0;
      }
    }
    for (const sign of this.signs) {
      if (sign.isPlayerNear(this.player)) {
        this.hudMessageText = sign.text;
        this.hudMessageTimer = 2.0;
        break;
      }
    }

    if (this.hudMessageTimer > 0) {
      this.hudMessageTimer = Math.max(0, this.hudMessageTimer - dt);
      if (this.hudMessageTimer > 0 && this.hudMessageText) {
        this.dialogueBox.show(this.hudMessageText);
      } else {
        this.hudMessageText = '';
        this.dialogueBox.hide();
      }
    } else {
      this.dialogueBox.hide();
    }

    // Update Enemies (only those inside the active room)
    for (const enemy of this.enemies) {
      if (enemy.active && this.camera.isInCurrentRoom(enemy.x, enemy.y, enemy.width, enemy.height, 120)) {
        enemy.update(
          dt,
          this.map,
          this.player,
          (proj) => {
            this.projectiles.push(proj);
          },
          addEffect
        );
      }
    }

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, this.map, this.player);
      if (!p.active || !this.camera.isInCurrentRoom(p.x, p.y, p.width, p.height, 150)) {
        this.projectiles.splice(i, 1);
      }
    }

    // Update Meteorite Hazard Zone (screen-based check using pMeteorite(roomX,roomY) from TMX)
    const isMeteoriteZone =
      this.map.properties[`pMeteorite(${roomX},${roomY})`] === 'true' ||
      this.map.properties['pMeteorites'] === 'true';

    if (isMeteoriteZone) {
      this.meteoriteSpawnTimer += dt;
      if (this.meteoriteSpawnTimer >= this.meteoriteNextSpawn) {
        this.meteoriteSpawnTimer = 0;
        this.meteoriteNextSpawn = calculateMeteoriteInterval();

        const spawn = createMeteoriteSpawn(this.camera.x, this.camera.y);
        this.meteorites.push(
          new MeteoriteEnemy(spawn.spawnX, spawn.spawnY, spawn.vx, spawn.vy, spawn.angle)
        );
      }
    }

    // Update Meteorites
    for (let i = this.meteorites.length - 1; i >= 0; i--) {
      const m = this.meteorites[i];
      m.update(
        dt,
        this.map,
        this.player,
        undefined,
        addEffect,
        this.camera.x,
        this.camera.y,
        this.camera.roomWidth,
        this.camera.roomHeight
      );
      if (!m.active || m.y > this.camera.y + this.camera.roomHeight + 100.0) {
        this.meteorites.splice(i, 1);
      }
    }

    // Update Visual Effects (enemy death stars & coin pickup sparkles)
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const eff = this.effects[i];
      eff.update(dt);
      if (!eff.active) {
        this.effects.splice(i, 1);
      }
    }

    return null;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();

    // Clear background with level ambient/sky color
    ctx.fillStyle = this.config.bgColor || '#0a0a14';
    ctx.fillRect(0, 0, width, height);

    // Scale 16x12-tile room (1216 x 912 TMX units) onto the 1200 x 900 screen
    const scaleX = width / this.camera.roomWidth;
    const scaleY = height / this.camera.roomHeight;
    ctx.save();
    ctx.scale(scaleX, scaleY);

    // 1. Render Visible Tiles of the current 16x12-tile room
    const tileW = this.map.tileWidth;
    const tileH = this.map.tileHeight;
    const tilesetCols = 13;

    const startCol = Math.max(0, Math.floor(this.camera.x / tileW));
    const endCol = Math.min(this.map.width - 1, startCol + 16);
    const startRow = Math.max(0, Math.floor(this.camera.y / tileH));
    const endRow = Math.min(this.map.height - 1, startRow + 12);

    for (let ty = startRow; ty <= endRow; ty++) {
      for (let tx = startCol; tx <= endCol; tx++) {
        const index = ty * this.map.width + tx;
        const gid = this.map.tiles[index];
        if (gid === 0) continue;

        const tileId = gid - 1;
        const dx = Math.round(tx * tileW - this.camera.x);
        const dy = Math.round(ty * tileH - this.camera.y);

        // Check for boundary debug collision tiles with red dots/crosses
        const isDebugBoundary =
          (this.levelEra === 'prehistory' && tileId === 53) ||
          (this.levelEra === 'castle' && (tileId === 37 || tileId === 176)) ||
          (this.levelEra === 'egypt' && tileId === 5) ||
          (this.levelEra === 'future' && tileId === 328);

        if (isDebugBoundary) {
          if (this.levelEra === 'prehistory' && ty < 48) {
            continue;
          }
          ctx.fillStyle = '#000000';
          ctx.fillRect(dx, dy, tileW, tileH);
          continue;
        }

        const sx = (tileId % tilesetCols) * tileW;
        const sy = Math.floor(tileId / tilesetCols) * tileH;

        ctx.drawImage(this.tilesetImg, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
      }
    }

    // Transform coordinate system for game entities in current room
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    // 2. Render Platforms
    for (const plat of this.platforms) {
      if (this.camera.isInCurrentRoom(plat.x, plat.y, plat.width, plat.height, 200)) {
        plat.render(ctx, this.platformsImg);
      }
    }

    // 3. Render Doors
    for (const door of this.doors) {
      if (this.camera.isInCurrentRoom(door.x, door.y, door.width, door.height, 100)) {
        door.render(ctx, this.gatesImg);
      }
    }

    // 4. Render SavePoints
    for (const sp of this.savePoints) {
      if (this.camera.isInCurrentRoom(sp.x, sp.y, sp.width, sp.height, 100)) {
        sp.render(ctx, this.signsImg);
      }
    }

    // 6. Render Signs
    for (const sign of this.signs) {
      if (this.camera.isInCurrentRoom(sign.x, sign.y, sign.width, sign.height, 100)) {
        sign.render(ctx, this.signsImg);
      }
    }

    // 7. Render Items
    for (const item of this.items) {
      if (!item.collected && this.camera.isInCurrentRoom(item.x, item.y, item.width, item.height, 100)) {
        item.render(ctx, this.itemsImg);
      }
    }

    // 8. Render Enemies
    for (const enemy of this.enemies) {
      if (enemy.active && this.camera.isInCurrentRoom(enemy.x, enemy.y, enemy.width, enemy.height, 120)) {
        enemy.render(ctx, this.enemyImages);
      }
    }

    // 9. Render Projectiles
    for (const p of this.projectiles) {
      p.render(ctx, this.enemyImages);
    }

    // 9.5 Render Meteorites
    for (const m of this.meteorites) {
      m.render(ctx, this.enemyImages);
    }

    // 10. Render Visual Effects (ENEMY_DEATH stars & coinEffect sparkles)
    for (const eff of this.effects) {
      eff.render(ctx, this.enemyImages, this.coinEffectImg);
    }

    // 11. Render Player with active era suit image
    let playerImg = this.vascoletImg;
    if (this.player.suit === 'dino') {
      playerImg = this.vascoletDinoImg;
    } else if (this.player.suit === 'skate') {
      playerImg = this.vascoletSkateImg;
    }
    this.player.render(ctx, playerImg);

    ctx.restore(); // Restore from room world scale/translation

    // 12. Render Original PC UI Overlays in 1200x900 Screen Space
    this.hud.render(ctx, this.player, this.config.title, this.itemsImg, this.hudBgImg);
    this.dialogueBox.render(ctx, width, height, this.hudBgImg);

    // 13. Render Original PC Pause Dialog (banner.png + buttons_tile.png)
    if (this.isPaused) {
      if (this.isShowingHelp && this.helpImg) {
        const sw = this.helpImg.width >= 2048 ? 1200 : this.helpImg.width;
        const sh = this.helpImg.height >= 1024 ? 900 : this.helpImg.height;
        ctx.drawImage(this.helpImg, 0, 0, sw, sh, 0, 0, width, height);
        if (this.pressAnyKeyImg) {
          ctx.drawImage(this.pressAnyKeyImg, 224, 67, 576, 61, Math.round((width - 576) / 2), height - 61, 576, 61);
        }
      } else if (this.optionsModal.isOpen) {
        this.optionsModal.render(ctx, this.opcionesImg, this.buttonsImg, width, height);
      } else {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, width, height);

        const dialogW = 280;
        const dialogH = 552;
        const dx = Math.round((width - dialogW) / 2);
        const dy = Math.round((height - dialogH) / 2);

        if (this.bannerImg) {
          // Top Pause dialog from banner.png: (10, 24, 280, 552)
          ctx.drawImage(this.bannerImg, 10, 24, 280, 552, dx, dy, dialogW, dialogH);
        }

        const btnX = dx + 45;
        const btnW = 190;
        const btnH = 40;
        const startY = dy + 295;
        const spacing = 46;

        this.pauseOptions.forEach((opt, i) => {
          const btnY = startY + i * spacing;
          const isSelected = i === this.pauseSelectedIndex;

          if (this.buttonsImg) {
            const sx = isSelected ? 258 : 8;
            ctx.drawImage(this.buttonsImg, sx, 11, 233, 54, btnX, btnY, btnW, btnH);
          }

          ctx.font = 'bold 20px "Arial Black", Gadget, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(opt.label, btnX + btnW / 2, btnY + btnH / 2);
          ctx.fillStyle = isSelected ? '#ffffff' : '#f9ca24';
          ctx.fillText(opt.label, btnX + btnW / 2, btnY + btnH / 2);
        });

        ctx.restore();
      }
    }

    ctx.restore();
  }
}
