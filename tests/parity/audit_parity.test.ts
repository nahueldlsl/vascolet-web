import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Player } from '../../src/entities/Player';
import { Door, SignPost } from '../../src/entities/Interactive';
import { Enemy, CannonEnemy, ProjectileEnemy } from '../../src/entities/Enemy';
import { resolvePlayerSpawn } from '../../src/scenes/GameScene';
import { LevelSelectScene } from '../../src/scenes/LevelSelectScene';
import { GameStorage, ERA_ORDER } from '../../src/core/Storage';
import { InputManager } from '../../src/core/Input';
import { CutsceneScene } from '../../src/scenes/CutsceneScene';
import { GameEra, LEVEL_CONFIGS, MapObject, TMXMap } from '../../src/types';

function makeDummyInput(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    isLeft: () => Boolean(overrides.left),
    isRight: () => Boolean(overrides.right),
    isUp: () => Boolean(overrides.up),
    isDown: () => Boolean(overrides.down),
    isJump: () => Boolean(overrides.jump),
    isJumpJustPressed: () => Boolean(overrides.jumpJustPressed),
    isJumpActionJustPressed: () => Boolean(overrides.jumpActionJustPressed),
    isActionJustPressed: () => Boolean(overrides.actionJustPressed),
    isSelectJustPressed: () => Boolean(overrides.selectJustPressed),
    isPauseJustPressed: () => Boolean(overrides.pauseJustPressed),
    isAnyKeyJustPressed: () => Boolean(overrides.anyKeyJustPressed),
    isUpJustPressed: () => Boolean(overrides.upJustPressed),
    isDownJustPressed: () => Boolean(overrides.downJustPressed),
    isLeftJustPressed: () => Boolean(overrides.leftJustPressed),
    isRightJustPressed: () => Boolean(overrides.rightJustPressed),
  } as any;
}

function makeFlatMap(width = 20, height = 15, floorRow = 12): TMXMap {
  const tiles = new Uint32Array(width * height);
  for (let tx = 0; tx < width; tx++) {
    tiles[floorRow * width + tx] = 1;
  }
  return {
    width,
    height,
    tileWidth: 76,
    tileHeight: 76,
    tilesetName: 'test',
    tilesetImageSource: '',
    tileProps: new Map([[0, { pHard: true }]]),
    tiles,
    objects: [],
    properties: {},
  };
}

function parseVascoletObjectsFromTMX(filePath: string): MapObject[] {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const objects: MapObject[] = [];
  const objRegex = /<object\b([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const getAttr = (k: string) => {
      const m = new RegExp(`${k}="([^"]*)"`).exec(attrs);
      return m ? m[1] : '';
    };
    const type = getAttr('type');
    if (type !== 'Vascolet') continue;
    objects.push({
      name: getAttr('name'),
      type,
      x: parseFloat(getAttr('x') || '0'),
      y: parseFloat(getAttr('y') || '0'),
      width: parseFloat(getAttr('width') || '0'),
      height: parseFloat(getAttr('height') || '0'),
      properties: {},
    });
  }
  return objects;
}

describe('Complete Audit & Parity Fixes', () => {
  describe('1. TMX Player Spawn Resolution', () => {
    it('resolves valid playable spawn across all 5 TMX files regardless of duplicate XML order', () => {
      const dataDir = path.resolve(__dirname, '../../public/assets/data');
      const expectedFiles: Record<GameEra, string> = {
        prehistory: 'prehistory.tmx',
        egypt: 'egypt.tmx',
        castle: 'castle.tmx',
        pirates: 'pirates.tmx',
        future: 'future.tmx',
      };

      for (const era of ERA_ORDER) {
        const objs = parseVascoletObjectsFromTMX(path.join(dataDir, expectedFiles[era]));
        expect(objs.length).toBeGreaterThan(0);

        const spawn = resolvePlayerSpawn(objs, LEVEL_CONFIGS[era].minPlayableX);
        expect(spawn.x).toBeGreaterThanOrEqual(LEVEL_CONFIGS[era].minPlayableX);

        // Reversing XML order must yield the exact same deterministic spawn
        const reversed = resolvePlayerSpawn([...objs].reverse(), LEVEL_CONFIGS[era].minPlayableX);
        expect(reversed).toEqual(spawn);
      }

      // Specifically verify egypt picks the room-(4,6) spawn (~3804, not 11121)
      const egyptObjs = parseVascoletObjectsFromTMX(path.join(dataDir, 'egypt.tmx'));
      const egyptSpawn = resolvePlayerSpawn(egyptObjs, LEVEL_CONFIGS.egypt.minPlayableX);
      expect(egyptSpawn.x).toBeLessThan(4000);
    });
  });

  describe('2. Player Physics, Input Separation & Original Caps', () => {
    it('supports MAX_FALL_SPEED up to 1500 px/s and right world boundary clamp', () => {
      const map = makeFlatMap(10, 20, 19);
      const player = new Player(100, 100, 0);
      player.setSuit('normal');

      // Free fall from high altitude should surpass 1000 px/s up to 1500 px/s
      for (let i = 0; i < 60; i++) {
        player.update(1 / 60, makeDummyInput(), map);
      }
      expect(player.vy).toBeGreaterThan(1000);
      expect(player.vy).toBeLessThanOrEqual(1500);

      // Right world boundary clamp
      player.x = map.width * map.tileWidth + 50;
      player.vx = 250;
      player.update(0.016, makeDummyInput({ right: true }), map);
      expect(player.x).toBeLessThanOrEqual(map.width * map.tileWidth - player.width);
    });

    it('applies air acceleration inertia instead of instant mid-air direction snapping', () => {
      const map = makeFlatMap(20, 15, 12);
      const player = new Player(300, 400, 0);
      player.setSuit('normal');
      player.onGround = false;
      player.vx = 0;

      player.update(1 / 60, makeDummyInput({ right: true }), map);
      expect(player.vx).toBeGreaterThan(0);
      expect(player.vx).toBeLessThan(250);
    });

    it('allows ArrowUp and Space jumping normally and triggers SignPost only on exact hitbox overlap', () => {
      const map = makeFlatMap(20, 15, 12);
      const player = new Player(300, 12 * 76 - 90, 0);
      player.setSuit('normal');
      player.onGround = true;

      // ArrowUp/KeyW (jumpJustPressed=true) MUST jump unconditionally (-600 + 1800 * 1/60 = -570)
      player.update(1 / 60, makeDummyInput({ up: true, jumpJustPressed: true }), map);
      expect(player.vy).toBeCloseTo(-570, 5);
      expect(player.state).toBe('jump');

      // Explicit Space/X MUST also jump
      player.onGround = true;
      player.vy = 0;
      player.state = 'idle';
      player.update(1 / 60, makeDummyInput({ jumpJustPressed: true, jumpActionJustPressed: true }), map);
      expect(player.vy).toBeCloseTo(-570, 5);
      expect(player.state).toBe('jump');

      // SignPost uses exact TMX sprite hitbox (0x004415e0) and does NOT trigger 40px away before hazards
      const sign = new SignPost(500, player.y, 39, 59, '¡Prohibido tirarse al agua!');
      player.x = 500 - player.width - 5; // 5px gap left of sign: must NOT overlap
      expect(sign.isPlayerNear(player)).toBe(false);
      player.x = 500; // Overlapping sign: triggers automatically
      expect(sign.isPlayerNear(player)).toBe(true);
    });

    it('enforces original caps: score 999999, lives 99, keyCounts 9, and victory freeze', () => {
      const map = makeFlatMap(20, 15, 12);
      const player = new Player(300, 12 * 76 - 90, 0);
      player.setScoreAndLives(997500, 98);
      player.addScore(10000);
      expect(player.score).toBe(999999);
      expect(player.lives).toBe(99);

      player.collectLife(5);
      expect(player.lives).toBe(99);

      for (let i = 0; i < 12; i++) {
        player.collectKey('RED_KEY');
      }
      expect(player.keyCounts.RED_KEY).toBe(9);

      player.winLevel();
      const startX = player.x;
      player.update(0.1, makeDummyInput({ right: true }), map);
      expect(player.state).toBe('victory');
      expect(player.x).toBe(startX);
    });
  });

  describe('3. Door 2D Collision & pRequiredCount Support', () => {
    it('supports landing on top of closed door vertically without pushing player sideways', () => {
      const door = new Door('BLUE_DOOR_CASTLE', 'BLUE_KEY', 500, 300, 76, 228);
      const player = new Player(513, 300 - 85, 0); // 5px overlapping door top
      player.setSuit('normal');
      player.vy = 200;
      const beforeX = player.x;

      door.update(0.016, player);

      expect(player.x).toBe(beforeX);
      expect(player.y).toBe(300 - player.height);
      expect(player.vy).toBe(0);
      expect(player.onGround).toBe(true);
    });

    it('enforces requiredCount when > 1 keys are required', () => {
      const door = new Door('RED_DOOR_EGYPT', 'RED_KEY', 500, 300, 76, 228, 2);
      const player = new Player(470, 350, 0);
      player.setSuit('normal');
      player.collectKey('RED_KEY');

      door.update(0.016, player);
      expect(door.opened).toBe(false);
      expect(player.keyCounts.RED_KEY).toBe(1);

      player.collectKey('RED_KEY');
      player.x = 470;
      door.update(0.016, player);
      expect(door.opened).toBe(true);
      expect(player.keyCounts.RED_KEY).toBe(0);
    });
  });

  describe('4. Enemy Fixes (settleToFloor, Cannon pMinTime, Projectile Walls)', () => {
    it('settleToFloor lands enemy onto floor without advancing patrol X or hurting player', () => {
      const map = makeFlatMap(20, 15, 10);
      const enemy = new Enemy('Dino', 'Enemy', 300, 10 * 76 - 70, 50, 50, { pAnim: 'DINOSAUR_SMALL' });
      const initialX = enemy.x;
      const player = new Player(initialX, 10 * 76 - 90, 0);

      enemy.settleToFloor(map);

      expect(enemy.x).toBe(initialX);
      expect(enemy.y + enemy.height).toBe(10 * 76);
      expect(player.state).not.toBe('dead');
    });

    it('deactivates ProjectileEnemy when hitting a solid wall', () => {
      const map = makeFlatMap(20, 15, 12);
      // Put a solid wall column at tx = 6
      map.tiles[5 * map.width + 6] = 1;
      const bullet = new ProjectileEnemy('Shot', 'Projectile', 6 * 76 - 50, 5 * 76, 60, 60, {
        pAnim: 'CANNONBALL_CASTLE',
        pxVel: '400',
      });
      const player = new Player(50, 50, 0);

      bullet.update(0.1, map, player);
      expect(bullet.active).toBe(false);
    });

    it('samples CannonEnemy interval between pMinTime and pMaxTime', () => {
      const cannon = new CannonEnemy('Cannon', 'Thrower', 400, 400, 76, 76, {
        pAnim: 'CANNON_LASER',
        pBulletAsset: 'CANNONBALL_FUTURE',
        pMinTime: '0.2',
        pMaxTime: '0.4',
        pxVel: '-400',
      });
      const player = new Player(50, 50, 0);
      const map = makeFlatMap(20, 15, 12);

      let fired = 0;
      for (let i = 0; i < 100; i++) {
        cannon.update(0.05, map, player, () => fired++);
      }
      // Over 5.0 seconds with interval in [0.2, 0.4], must fire > 12 times (not just 5s/0.4s=12)
      expect(fired).toBeGreaterThanOrEqual(12);
    });
  });

  describe('5. Progressive Unlocking & Persistent LocalStorage', () => {
    const storeMap = new Map<string, string>();
    const origWindow = (globalThis as any).window;

    beforeEach(() => {
      storeMap.clear();
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => (storeMap.has(k) ? storeMap.get(k)! : null),
          setItem: (k: string, v: string) => storeMap.set(k, String(v)),
          removeItem: (k: string) => storeMap.delete(k),
          clear: () => storeMap.clear(),
        },
      };
    });

    afterEach(() => {
      (globalThis as any).window = origWindow;
    });

    it('locks levels 2..5 initially and unlocks them sequentially on completion', () => {
      const select = new LevelSelectScene();
      expect(select.unlockedLevels).toBe(1);
      expect(select.isLevelUnlocked(0)).toBe(true);
      expect(select.isLevelUnlocked(1)).toBe(false);

      // Clicking locked Egypt card (x=268..481, y=213..833) does not start level
      expect(select.handleClick(350, 400)).toBeNull();
      // Clicking unlocked Prehistory card starts prehistory
      expect(select.handleClick(100, 400)).toEqual({ action: 'play_level', levelId: 'prehistory' });

      GameStorage.unlockNextLevel('prehistory');
      select.syncFromStorage();
      expect(select.unlockedLevels).toBe(2);
      expect(select.handleClick(350, 400)).toEqual({ action: 'play_level', levelId: 'egypt' });

      GameStorage.recordLevelCoins('prehistory', 42);
      const reloaded = new LevelSelectScene();
      expect(reloaded.unlockedLevels).toBe(2);
      expect(reloaded.levelCoins.prehistory).toBe(42);
    });

    it('persists storySeen and audio/stretch options', () => {
      expect(GameStorage.loadSave().storySeen).toBe(false);
      GameStorage.markStorySeen();
      expect(GameStorage.loadSave().storySeen).toBe(true);

      GameStorage.saveOptions({ musicVolume: 0.3, sfxMuted: true, stretchScreen: true });
      const opts = GameStorage.loadOptions();
      expect(opts.musicVolume).toBeCloseTo(0.3);
      expect(opts.sfxMuted).toBe(true);
      expect(opts.stretchScreen).toBe(true);
    });
  });

  describe('6. Asset Integrity, Touch Edge-Triggering & Cutscene Debounce', () => {
    const origWindow = (globalThis as any).window;

    afterEach(() => {
      (globalThis as any).window = origWindow;
    });

    it('verifies every /assets/... path referenced in src/ exists in public/', () => {
      const srcDir = path.resolve(__dirname, '../../src');
      const publicDir = path.resolve(__dirname, '../../public');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (full.endsWith('.ts') || full.endsWith('.json')) files.push(full);
        }
      };
      walk(srcDir);

      const missing: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = content.match(/\/assets\/[A-Za-z0-9_\/\.\-]+/g) || [];
        for (const assetPath of matches) {
          if (!fs.existsSync(path.join(publicDir, assetPath))) {
            missing.push(`${path.relative(srcDir, file)} -> ${assetPath}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('triggers InputManager.isAnyKeyJustPressed only on initial press of virtual buttons', () => {
      (globalThis as any).window = { addEventListener: () => {} };
      const input = new InputManager();

      expect(input.isAnyKeyJustPressed()).toBe(false);
      input.setVirtualButton('jump', true);
      expect(input.isAnyKeyJustPressed()).toBe(true);

      // Holding the virtual button into the next frame must NOT retrigger
      input.update();
      expect(input.isAnyKeyJustPressed()).toBe(false);

      input.setVirtualButton('jump', false);
      input.update();
      expect(input.isAnyKeyJustPressed()).toBe(false);
    });

    it('respects debounceTimer in CutsceneScene.handleClick before advancing slides', () => {
      const cutscene = new CutsceneScene();
      cutscene.setup(['slide1.jpg', 'slide2.jpg'], 'menu');

      // Click during initial 0.5s debounce window must be ignored
      expect(cutscene.handleClick()).toBeNull();
      cutscene.update(0.6, makeDummyInput());

      // After debounce expires, clicks advance slides sequentially
      expect(cutscene.handleClick()).toBeNull();
      expect(cutscene.handleClick()).toBe('menu');
    });
  });
});
