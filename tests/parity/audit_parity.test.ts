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
import { CollisionSystem } from '../../src/core/Collision';
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

    it('allows Space-only jumping (ArrowUp does not jump) and triggers SignPost only on exact hitbox overlap', () => {
      const map = makeFlatMap(20, 15, 12);
      const player = new Player(300, 12 * 76 - 90, 0);
      player.setSuit('normal');
      player.onGround = true;

      // Holding ArrowUp on flat ground MUST NOT trigger jump
      player.update(1 / 60, makeDummyInput({ up: true, upJustPressed: true }), map);
      expect(player.state).toBe('idle');
      expect(player.onGround).toBe(true);

      // Explicit Space MUST jump (-600 + 1800 * 1/60 = -570)
      player.update(1 / 60, makeDummyInput({ jump: true, jumpJustPressed: true, jumpActionJustPressed: true }), map);
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

    it('CannonEnemy (Thrower) does not damage or block player on body contact; only its projectiles hurt', () => {
      const thrower = new CannonEnemy('CANNON_PREHISTORY', 'Thrower', 400, 400, 90, 90, {
        pAnim: 'CANNON_PREHISTORY',
        pBulletAsset: 'CANNONBALL_PREHISTORY',
        pMinTime: '1.2',
        pMaxTime: '1.2',
        pxVel: '-350',
        pxOffset: '-10',
        pyOffset: '-65',
      });
      const player = new Player(400, 400, 0);
      const map = makeFlatMap(20, 15, 12);
      const spawned: ProjectileEnemy[] = [];

      const initialLives = player.lives;
      // Direct overlap + falling from above (stomp angle): must neither hurt player nor kill thrower
      player.vy = 200;
      thrower.update(0.1, map, player, (b) => spawned.push(b));
      expect(player.lives).toBe(initialLives);
      expect(player.state).not.toBe('hurt');
      expect(player.isInvulnerable).toBe(false);
      expect(thrower.active).toBe(true);

      // Advance until a projectile spawns, then place player in projectile's path
      for (let i = 0; i < 20 && spawned.length === 0; i++) {
        thrower.update(0.1, map, player, (b) => spawned.push(b));
      }
      expect(spawned.length).toBeGreaterThan(0);

      const bullet = spawned[0];
      player.x = bullet.x;
      player.y = bullet.y;
      bullet.update(0.016, map, player);
      expect(player.lives).toBe(initialLives - 1);
      expect(player.state).toBe('dead');
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

  describe('7. Space-Only Jump Input & Ladder / pLadderEnd Parity', () => {
    const origWindow = (globalThis as any).window;

    afterEach(() => {
      (globalThis as any).window = origWindow;
    });

    function makeLadderMap(): TMXMap {
      const width = 10;
      const height = 12;
      const tiles = new Uint32Array(width * height);
      // GIDs (tileId = gid - 1): 1->pHard(0), 2->pLadderEnd(1), 3->pLadder(2)
      for (let tx = 0; tx < width; tx++) {
        tiles[9 * width + tx] = 1; // solid bottom floor at row 9
      }
      // Upper floor at row 6 with a pLadderEnd gap at column 4
      tiles[6 * width + 2] = 1;
      tiles[6 * width + 3] = 1;
      tiles[6 * width + 4] = 2; // pLadderEnd
      tiles[6 * width + 5] = 1;
      tiles[6 * width + 6] = 1;
      // Ladder shaft at column 4, rows 7..8
      tiles[7 * width + 4] = 3; // pLadder
      tiles[8 * width + 4] = 3; // pLadder

      return {
        width,
        height,
        tileWidth: 76,
        tileHeight: 76,
        tilesetName: 'test',
        tilesetImageSource: '',
        tileProps: new Map([
          [0, { pHard: true }],
          [1, { pLadderEnd: true }],
          [2, { pLadder: true }],
        ]),
        tiles,
        objects: [],
        properties: {},
      };
    }

    it('InputManager binds keyboard jump strictly to Space (ArrowUp/KeyW/KeyX/KeyZ do not jump)', () => {
      const listeners: Record<string, (e: any) => void> = {};
      (globalThis as any).window = {
        addEventListener: (ev: string, fn: (e: any) => void) => {
          listeners[ev] = fn;
        },
      };
      const input = new InputManager();

      for (const code of ['ArrowUp', 'KeyW', 'KeyX', 'KeyZ']) {
        listeners.keydown({ code, preventDefault: () => {} });
        expect(input.isJump()).toBe(false);
        expect(input.isJumpJustPressed()).toBe(false);
        expect(input.isJumpActionJustPressed()).toBe(false);
        listeners.keyup({ code });
        input.update();
      }

      listeners.keydown({ code: 'ArrowUp', preventDefault: () => {} });
      expect(input.isUp()).toBe(true);
      expect(input.isJump()).toBe(false);
      listeners.keyup({ code: 'ArrowUp' });
      input.update();

      listeners.keydown({ code: 'Space', preventDefault: () => {} });
      expect(input.isJump()).toBe(true);
      expect(input.isJumpJustPressed()).toBe(true);
      expect(input.isJumpActionJustPressed()).toBe(true);
    });

    it('treats pLadderEnd as a one-way platform so player stands firmly on ladder tops', () => {
      const map = makeLadderMap();
      expect(CollisionSystem.isPlatform(map, 4, 6)).toBe(true);

      // Player centered on pLadderEnd column 4, right on top of row 6
      const player = new Player(4 * 76 + 13, 6 * 76 - 90, 0);
      player.setSuit('normal');
      player.onGround = true;

      for (let i = 0; i < 15; i++) {
        player.update(1 / 60, makeDummyInput({ up: i < 5 }), map);
      }

      expect(player.y).toBe(6 * 76 - 90);
      expect(player.onGround).toBe(true);
      expect(player.state).toBe('idle');
    });

    it('climbs ladder smoothly with ArrowUp held and lands on top without oscillating or jumping', () => {
      const map = makeLadderMap();
      // Player at bottom of ladder (row 9 top = 684), centered on column 4
      const player = new Player(4 * 76 + 13, 9 * 76 - 90, 0);
      player.setSuit('normal');
      player.onGround = true;

      // Climb all the way up holding ArrowUp continuously for ~2 seconds
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60, makeDummyInput({ up: true }), map);
      }

      expect(player.y).toBe(6 * 76 - 90);
      expect(player.vy).toBe(0);
      expect(player.onGround).toBe(true);
      expect(player.state).toBe('idle');
    });

    it('enters ladder from top when pressing ArrowDown on pLadderEnd and reaches bottom floor', () => {
      const map = makeLadderMap();
      const player = new Player(4 * 76 + 13, 6 * 76 - 90, 0);
      player.setSuit('normal');
      player.onGround = true;

      // Frame 1: pressing Down on pLadderEnd enters climb
      player.update(1 / 60, makeDummyInput({ down: true }), map);
      expect(player.state).toBe('climb');

      // Continue holding Down until hitting solid row 9 floor
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60, makeDummyInput({ down: true }), map);
      }
      // Next frame with Down released exits cleanly to idle at row 9 floor
      player.update(1 / 60, makeDummyInput(), map);

      expect(player.y).toBe(9 * 76 - 90);
      expect(player.onGround).toBe(true);
      expect(player.state).toBe('idle');
    });

    it('ignores Space while holding Up on ladder, but allows Space jump when Up is released', () => {
      const map = makeLadderMap();
      const player = new Player(4 * 76 + 13, 8 * 76 - 90, 0);
      player.setSuit('normal');

      // Enter climb with ArrowUp
      player.update(1 / 60, makeDummyInput({ up: true }), map);
      expect(player.state).toBe('climb');

      // Pressing Space while still holding Up must keep climbing (Vascolet.exe 0x0043142a)
      player.update(
        1 / 60,
        makeDummyInput({ up: true, jump: true, jumpJustPressed: true, jumpActionJustPressed: true }),
        map
      );
      expect(player.state).toBe('climb');

      // Pressing Space when Up is NOT held detaches into a jump
      player.update(
        1 / 60,
        makeDummyInput({ right: true, jump: true, jumpJustPressed: true, jumpActionJustPressed: true }),
        map
      );
      expect(player.state).toBe('jump');
      expect(player.vy).toBeLessThan(0);
    });
  });
});
