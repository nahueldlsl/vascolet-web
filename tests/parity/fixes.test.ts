import { describe, it, expect, vi } from 'vitest';
import { Jumper, Door, SignPost, CollectibleItem } from '../../src/entities/Interactive';
import { Enemy, BirdEnemy, CannonEnemy, JumperEnemy } from '../../src/entities/Enemy';
import { Player } from '../../src/entities/Player';
import { CollisionSystem } from '../../src/core/Collision';
import { TMXMap, LEVEL_CONFIGS } from '../../src/types';

describe('Parity Bug Fixes Verification', () => {
  describe('1. Jumper Mechanics and Anchoring', () => {
    it('anchors Jumper sprite to floor and uses correct sprite dimensions', () => {
      // TMX marker is 50x50 at (100, 200)
      const jumper = new Jumper(100, 200, 50, 50, 'SNAKE');
      // SNAKE frame is 60x100
      expect(jumper.width).toBe(60);
      expect(jumper.height).toBe(100);
      // Floor anchor: y = 200 + 50 - 100 = 150
      expect(jumper.y).toBe(150);
      // Centered X: 100 + 25 - 30 = 95
      expect(jumper.x).toBe(95);
    });

    it('sets bounceVelocity to -850 for default or low TMX pyVel (e.g. 100.0 from Egypt)', () => {
      const jumperLow = new Jumper(100, 200, 50, 50, 'SNAKE', '100.0');
      expect(jumperLow.bounceVelocity).toBe(-850);

      const jumperDefault = new Jumper(100, 200, 50, 50, 'SNAKE');
      expect(jumperDefault.bounceVelocity).toBe(-850);

      const jumperHigh = new Jumper(100, 200, 50, 50, 'SNAKE', '-920');
      expect(jumperHigh.bounceVelocity).toBe(-920);
    });

    it('launches player with bounceVelocity and allows double jump apex', () => {
      const jumper = new Jumper(100, 200, 50, 50, 'SNAKE');
      const player = new Player(100, 160);
      player.setSuit('normal');
      player.vy = 200;
      player.onGround = true;

      jumper.update(0.016, player);

      expect(player.vy).toBe(-850);
      expect(player.onGround).toBe(false);
      expect(player.state).toBe('jump');
      expect(player.jumpCount).toBe(1);
    });
  });

  describe('2. Door Solid Collision Resolution', () => {
    it('pushes player out of closed door when walking right', () => {
      const door = new Door('GATE_PREHISTORY', 'RED_KEY', 500, 200, 80, 200);
      const player = new Player(460, 220);
      player.setSuit('normal');
      player.vx = 200;

      door.update(0.016, player);

      const pBox = player.getBox();
      const doorBox = door.getBox();
      expect(CollisionSystem.checkAABB(pBox, doorBox)).toBe(false);
      expect(player.vx).toBe(0);
    });

    it('resolves collision when player is standing or jumping with vx === 0', () => {
      const door = new Door('GATE_PREHISTORY', 'RED_KEY', 500, 200, 80, 200);
      const player = new Player(480, 220); // Overlapping door left edge
      player.setSuit('normal');
      player.vx = 0;

      door.update(0.016, player);

      const pBox = player.getBox();
      const doorBox = door.getBox();
      expect(CollisionSystem.checkAABB(pBox, doorBox)).toBe(false);
    });

    it('resolves collision when player approaches from the right', () => {
      const door = new Door('GATE_PREHISTORY', 'RED_KEY', 500, 200, 80, 200);
      const player = new Player(560, 220); // Overlapping door right edge
      player.setSuit('normal');
      player.vx = -150;

      door.update(0.016, player);

      const pBox = player.getBox();
      const doorBox = door.getBox();
      expect(CollisionSystem.checkAABB(pBox, doorBox)).toBe(false);
      expect(player.vx).toBe(0);
    });
  });

  describe('3. SignPost Text Decoding', () => {
    it('correctly decodes Spanish accents, inverted exclamation/question marks and ñ', () => {
      const signPiranha = new SignPost(0, 0, 0, 0, '\\!Zona de lagunas con Pira\\mas!');
      expect(signPiranha.text).toBe('¡Zona de lagunas con Pirañas!');

      const signQuestion = new SignPost(0, 0, 0, 0, '\\?Donde habr\\a una puerta?');
      expect(signQuestion.text).toBe('¿Donde habrá una puerta?');

      const signBath = new SignPost(0, 0, 0, 0, 'Zona de ba\\mo de los dinosaurios.');
      expect(signBath.text).toBe('Zona de baño de los dinosaurios.');

      const signLong = new SignPost(
        0,
        0,
        0,
        0,
        'BarbaRoja le discuti\\o al Gran BarbaNegra que el cofre m\\agico puede\\ncalentar alimentos...'
      );
      expect(signLong.text).toBe(
        'BarbaRoja le discutió al Gran BarbaNegra que el cofre mágico puede\ncalentar alimentos...'
      );
    });
  });

  describe('4. Abyss Bottomless Pit Collision & Death', () => {
    const dummyMap: TMXMap = {
      width: 10,
      height: 10,
      tileWidth: 40,
      tileHeight: 40,
      tilesetName: 'test',
      tilesetImageSource: '',
      tileProps: new Map(),
      tiles: new Uint32Array(100),
      objects: [],
      properties: {},
    };

    it('CollisionSystem.getTileProps returns null for tileY >= map.height', () => {
      const propsBelow = CollisionSystem.getTileProps(dummyMap, 5, 10);
      expect(propsBelow).toBeNull();

      const propsFarBelow = CollisionSystem.getTileProps(dummyMap, 5, 15);
      expect(propsFarBelow).toBeNull();
    });

    it('kills player when falling past world bottom even if invulnerable', () => {
      const player = new Player(100, dummyMap.height * dummyMap.tileHeight + 150);
      player.setSuit('normal');
      player.isInvulnerable = true;
      const initialLives = player.lives;

      const mockInput = {
        isLeft: () => false,
        isRight: () => false,
        isUp: () => false,
        isDown: () => false,
        isJump: () => false,
        isJumpJustPressed: () => false,
        isJumpActionJustPressed: () => false,
        isActionJustPressed: () => false,
        isSelectJustPressed: () => false,
        isPauseJustPressed: () => false,
        isAnyKeyJustPressed: () => false,
        isUpJustPressed: () => false,
        isDownJustPressed: () => false,
        isLeftJustPressed: () => false,
        isRightJustPressed: () => false,
      };

      player.update(0.016, mockInput as any, dummyMap);

      // Player must lose life and be in dead state
      expect(player.lives).toBe(initialLives - 1);
      expect(player.state).toBe('dead');

      // Advancing timer past 1.8s restores player at checkpoint in idle state
      player.update(1.9, mockInput as any, dummyMap);
      expect(player.state).toBe('idle');
      expect(player.x).toBe(100);
      expect(player.isInvulnerable).toBe(true);
    });
  });

  describe('5. BirdEnemy Trajectory', () => {
    it('preserves pxDelta = 0 for vertical patrols without resetting to -400', () => {
      const bird = new BirdEnemy('VerticalBird', 'Bird', 300, 200, 50, 50, {
        pAnim: 'BIRD_BROWN',
        pxDelta: '0',
        pyDelta: '100',
        pDuration: '2.0',
      });

      expect((bird as any).xDelta).toBe(0);
      expect((bird as any).yDelta).toBe(100);
    });

    it('interpolates vertically along pyDelta when pyDelta > 20', () => {
      const bird = new BirdEnemy('VerticalBird', 'Bird', 300, 200, 50, 50, {
        pAnim: 'BIRD_BROWN',
        pxDelta: '0',
        pyDelta: '100',
        pDuration: '2.0',
      });
      const dummyPlayer = new Player(0, 0);

      // Advance by 1 second (halfway through 2.0 duration => progress ~ 0.5)
      bird.update(1.0, {} as any, dummyPlayer);

      // x should remain at startX (centered in marker: 300 + 25 - 55 = 270)
      expect(bird.x).toBe((bird as any).startX);
      // y matches startY + yDelta * progress + sin(flightTimer * 4.0) * 8
      const expectedY = (bird as any).startY + 100 * 0.5 + Math.sin(1.0 * 4.0) * 8;
      expect(bird.y).toBeCloseTo(expectedY, 2);
    });
  });

  describe('6. CannonEnemy Y-Offset Calculation', () => {
    it('adjusts negative pyOffset from floor so projectile stays in barrel', () => {
      const cannon = new CannonEnemy('Cannon', 'Cannon', 400, 300, 80, 90, {
        pyOffset: '-45',
      });

      // cannon height is 90. 90 + (-45) - 30 = 15
      expect((cannon as any).yOffset).toBe(15);
    });

    it('keeps non-negative pyOffset as-is', () => {
      const cannon = new CannonEnemy('Cannon', 'Cannon', 400, 300, 80, 90, {
        pyOffset: '25',
      });

      expect((cannon as any).yOffset).toBe(25);
    });
  });

  describe('7. CollectibleItem Microwave Single Pickup', () => {
    it('does not collect microwave if player already has one', () => {
      const microwave = new CollectibleItem('Item', 'MICROWAVE', 200, 200, 40, 40);
      const player = new Player(200, 200);
      player.setSuit('normal');
      player.hasMicrowave = true;

      microwave.update(0.016, player);

      expect(microwave.collected).toBe(false);
    });

    it('collects microwave if player does not have one yet', () => {
      const microwave = new CollectibleItem('Item', 'MICROWAVE', 200, 200, 40, 40);
      const player = new Player(200, 200);
      player.setSuit('normal');
      player.hasMicrowave = false;

      microwave.update(0.016, player);

      expect(microwave.collected).toBe(true);
      expect(player.hasMicrowave).toBe(true);
    });
  });

  describe('8. Level Configuration Parity', () => {
    it('pirates level minPlayableX aligns with room 1 at 1216', () => {
      expect(LEVEL_CONFIGS.pirates.minPlayableX).toBe(1216);
    });
  });

  describe('9. Camelot (castle.tmx) Snake Jump & Stomp Binary Parity (0x00431074, 0x00419180, 0x0043e0c0)', () => {
    it('uses exact 50x90 Player hitbox (0x00431074) and 32x60 STATIC_SNAKE hitbox (0x0043b4c2)', () => {
      const player = new Player(100, 100);
      player.setSuit('normal');
      expect(player.getBox()).toEqual({ x: 100, y: 100, w: 50, h: 90 });

      const snake = new Enemy('Snake', 'Enemy', 2064, 3510, 56, 62, {
        pAnim: 'STATIC_SNAKE',
        pAsset: 'STATIC_SNAKE',
        pCollidesFloor: 'true',
      });
      const sBox = snake.getBox();
      expect(sBox.w).toBe(32);
      expect(sBox.h).toBe(60);
    });

    it('allows Player with 0 Vascolet cups (vy=-600, vx=250) to cleanly jump over Camelot STATIC_SNAKE without damage', () => {
      // Flat floor at row 47 (y = 47 * 76 = 3572)
      const snake = new Enemy('Snake', 'Enemy', 2064, 3510, 56, 62, {
        pAnim: 'STATIC_SNAKE',
        pAsset: 'STATIC_SNAKE',
        pCollidesFloor: 'true',
        pxVel: '0',
      });
      // Snap snake bottom onto floor y = 3572
      snake.y = 3572 - snake.height;

      const sBox = snake.getBox();
      // Start jump so apex is centered over snake hitbox center
      // Time to apex = 600 / 1800 = 1/3 s; horizontal distance to apex = 250 * (1/3) = 83.333 px
      const snakeCenterX = sBox.x + sBox.w * 0.5;
      const startCenterX = snakeCenterX - 250 * (600 / 1800);

      const player = new Player(startCenterX - 25, 3572 - 90);
      player.setSuit('normal');
      player.vascoletCups = 0;
      player.vx = 250;
      player.vy = player.getJumpVelocity(); // -600
      player.onGround = false;
      player.state = 'jump';

      const dt = 1 / 120;
      for (let step = 0; step < 85; step++) {
        player.x += player.vx * dt;
        player.vy += 1800 * dt;
        player.y += player.vy * dt;
        if (player.y + player.height >= 3572) {
          player.y = 3572 - player.height;
          player.vy = 0;
          player.onGround = true;
        }
        // Check collision at every substep
        const hit = CollisionSystem.checkAABB(snake.getBox(), player.getBox());
        expect(hit).toBe(false);
      }
      expect(player.x).toBeGreaterThan(sBox.x + sBox.w);
      expect(player.lives).toBe(10);
    });

    it('allows stomping STATIC_SNAKE and HEDGEHOG from above (Vascolet.exe Enemy::onCollide 0x0043e0c0)', () => {
      const snake = new Enemy('Snake', 'Enemy', 500, 300, 56, 62, {
        pAnim: 'STATIC_SNAKE',
      });
      expect(snake.canBeStomped()).toBe(true);

      const sBox = snake.getBox();
      const player = new Player(sBox.x, sBox.y - 80);
      player.setSuit('normal');
      player.vy = 200; // falling down onto snake top

      (snake as any).checkPlayerCollision(player);
      expect(snake.active).toBe(false);
      expect(player.vy).toBe(-510);
      expect(player.lives).toBe(10);

      const hedgehog = new Enemy('Hedgehog', 'Enemy', 700, 300, 50, 50, {
        pAnim: 'HEDGEHOG',
      });
      expect(hedgehog.canBeStomped()).toBe(true);
      expect(hedgehog.getBox().w).toBe(30);
      expect(hedgehog.getBox().h).toBe(30);
    });
  });

  describe('10. JumperEnemy Binary Behavior (Vascolet.exe 0x00440860)', () => {
    it('uses exact binary hitboxes (SNAKE 50x32, SNAKE_ROBOT 70x90), leaps at vy=-600, and can be stomped', () => {
      const jumperSnake = new JumperEnemy('Jumper', 'Jumper', 5419, 4874, 56, 59, {
        pAnim: 'SNAKE',
        pxVel: '120',
        pyAccel: '800.0',
      });
      expect(jumperSnake.getBox().w).toBe(50);
      expect(jumperSnake.getBox().h).toBe(32);
      expect(jumperSnake.canBeStomped()).toBe(true);

      const jumperRobot = new JumperEnemy('Jumper', 'Jumper', 10336, 5168, 76, 152, {
        pAnim: 'SNAKE_ROBOT',
        pxVel: '-120',
        pyAccel: '800.0',
      });
      expect(jumperRobot.getBox().w).toBe(70);
      expect(jumperRobot.getBox().h).toBe(90);
    });
  });

  describe('11. CollectibleItem pCount Support (Vascolet.exe 0x00433fb0 / 0x0042db50)', () => {
    it('awards 1 coin and 100 points (0 extra lives) when collecting a pCount=100 COIN item', () => {
      const coin = new CollectibleItem('Item', 'COIN', 200, 200, 40, 40, 100);
      const player = new Player(200, 200);
      player.setSuit('normal');

      coin.update(0.016, player);

      expect(coin.collected).toBe(true);
      expect(player.coins).toBe(1);
      expect(player.score).toBe(100);
      expect(player.lives).toBe(10);
    });

    it('does not collect items or grant extra lives while player is dead', () => {
      const coin = new CollectibleItem('Item', 'COIN', 200, 200, 40, 40, 100);
      const extraLife = new CollectibleItem('Item', 'LIVES', 200, 200, 40, 40, 1);
      const player = new Player(200, 200);
      player.setSuit('normal');
      player.die(); // lives: 9, state: 'dead'

      coin.update(0.016, player);
      extraLife.update(0.016, player);

      expect(coin.collected).toBe(false);
      expect(extraLife.collected).toBe(false);
      expect(player.coins).toBe(0);
      expect(player.score).toBe(0);
      expect(player.lives).toBe(9);
    });
  });
});
