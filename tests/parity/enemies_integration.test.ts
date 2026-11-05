import { describe, it, expect } from 'vitest';
import { PiranhaEnemy, MeteoriteEnemy, VisualEffect } from '../../src/entities/Enemy';
import { PIRANHA_SPRITE_SPEC, ITEM_PICKUP_EFFECT_SPEC, METEORITE_PHYSICS } from '../../src/core/ParityFormulas';
import { TMXMap } from '../../src/types';
import { Player } from '../../src/entities/Player';

describe('Enemy Entity Integration Tests', () => {
  it('PiranhaEnemy initializes with correct TMX marker dimensions and hitbox', () => {
    const piranha = new PiranhaEnemy('PiranhaR Water', 'Piranha', 17648, 3360, 50, 48, {
      pAnim: 'PIRANHA_R',
      pAnimSplash: 'WATER',
      pDuration: '3.0',
      pMaxTime: '3.0',
      pMinTime: '3.0',
      pyDelta: '-300',
    });

    // Object coordinates
    expect(piranha.x).toBe(17648);
    expect(piranha.y).toBe(3360);
    expect(piranha.width).toBe(50);
    expect(piranha.height).toBe(48);

    // Hitbox specification
    const box = piranha.getBox();
    expect(box.w).toBe(PIRANHA_SPRITE_SPEC.hitboxW); // 50
    expect(box.h).toBe(PIRANHA_SPRITE_SPEC.hitboxH); // 55
    expect(box.x).toBe(17648 + (50 - 50) / 2); // 17648
    expect(box.y).toBe(3360 + (48 - 55)); // 3353
  });

  it('MeteoriteEnemy initializes with 38x38 hitbox and projectile properties', () => {
    const meteorite = new MeteoriteEnemy(500, 100, -170, 180, 2.5);

    expect(meteorite.x).toBe(500);
    expect(meteorite.y).toBe(100);
    expect(meteorite.vx).toBe(-170);
    expect(meteorite.vy).toBe(180);
    expect(meteorite.angle).toBe(2.5);
    expect(meteorite.collidesFloor).toBe(false);

    const box = meteorite.getBox();
    expect(box.w).toBe(38);
    expect(box.h).toBe(38);
    // Centered in 60x60 frame
    expect(box.x).toBe(500 + (60 - 38) / 2); // 511
    expect(box.y).toBe(100 + (60 - 38) / 2); // 111
  });

  it('VisualEffect item_pickup uses 104x162 frame and (52, 129) anchor from Vascolet.exe (0x00438be0)', () => {
    const eff = new VisualEffect('item_pickup', 300, 400);
    expect(eff.width).toBe(ITEM_PICKUP_EFFECT_SPEC.frameW); // 104
    expect(eff.height).toBe(ITEM_PICKUP_EFFECT_SPEC.frameH); // 162
    expect(eff.x).toBe(300 - ITEM_PICKUP_EFFECT_SPEC.anchorX); // 248
    expect(eff.y).toBe(400 - ITEM_PICKUP_EFFECT_SPEC.anchorY); // 271
  });

  it('MeteoriteEnemy passes through top boundary row above cameraY and bounces twice on floor tiles (0x004412b0)', () => {
    // 16x12 room starting at (0, 76), with solid boundary at row 0 (y=0..76) and solid floor at row 10 (y=760..836)
    const width = 16;
    const height = 14;
    const tiles = new Uint32Array(width * height);
    for (let tx = 0; tx < width; tx++) {
      tiles[0 * width + tx] = 1; // top boundary row above room
      tiles[10 * width + tx] = 1; // floor inside room
    }
    const map: TMXMap = {
      width,
      height,
      tileWidth: 76,
      tileHeight: 76,
      tilesetName: 'test',
      tilesetImageSource: '',
      tileProps: new Map([[0, { pHard: 'true' }]]),
      tiles,
      objects: [],
      properties: {},
    };
    const player = new Player(50, 500, 0);

    // Spawn at y = cameraY - 65 = 76 - 65 = 11 (inside top boundary row 0!)
    const m = new MeteoriteEnemy(400, 11, 0, 200, Math.PI * 0.85);
    expect(m.ay).toBe(METEORITE_PHYSICS.INITIAL_AY);

    // Step across top boundary row: should NOT explode on row 0, and reaches 2 bounces within ~3s
    for (let i = 0; i < 240 && m.bounceCount < 2; i++) {
      m.update(1 / 60, map, player, undefined, undefined, 0, 76, 1216, 912);
    }

    expect(m.active).toBe(true);
    expect(m.hasEnteredRoom).toBe(true);
    expect(m.bounceCount).toBe(2);
    expect(m.ay).toBe(METEORITE_PHYSICS.BOUNCE_AY);
  });
});
