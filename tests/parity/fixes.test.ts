import { describe, it, expect, vi } from 'vitest';
import { Jumper, Door, SignPost, CollectibleItem } from '../../src/entities/Interactive';
import { BirdEnemy, CannonEnemy } from '../../src/entities/Enemy';
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
      layers: [
        {
          name: 'Platforms',
          width: 10,
          height: 10,
          data: new Array(100).fill(0),
          visible: true,
          opacity: 1,
        },
      ],
      tilesets: [],
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

      // Player must lose life and respawn at checkpoint
      expect(player.lives).toBe(initialLives - 1);
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
});
