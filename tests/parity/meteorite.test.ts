import { describe, it, expect } from 'vitest';
import { calculateMeteoriteInterval, createMeteoriteSpawn } from '../../src/core/ParityFormulas';

describe('Meteorite Parity (Vascolet.exe 0x00420a74)', () => {
  it('spawns with timer interval uniformly distributed between 3.0s and 4.0s (0x00420ad4)', () => {
    // Test boundary conditions of rand() / 32767.0: 0.0 and 1.0
    const minInterval = calculateMeteoriteInterval(() => 0.0);
    const midInterval = calculateMeteoriteInterval(() => 0.5);
    const maxInterval = calculateMeteoriteInterval(() => 1.0);

    expect(minInterval).toBeCloseTo(3.0, 5);
    expect(midInterval).toBeCloseTo(3.5, 5);
    expect(maxInterval).toBeCloseTo(4.0, 5);

    // Test a sample of 100 random values
    for (let i = 0; i < 100; i++) {
      const interval = calculateMeteoriteInterval();
      expect(interval).toBeGreaterThanOrEqual(3.0);
      expect(interval).toBeLessThanOrEqual(4.0);
    }
  });

  describe('Left Branch (rand < 0.5)', () => {
    it('spawns within [cameraX - 100, cameraX + 300] and angle in [135°, 180°]', () => {
      const cameraX = 500;
      const cameraY = 200;

      // Deterministic pseudo-random: first call 0.2 (< 0.5 -> left), second call 0.0 (min X)
      let callCount = 0;
      const mockRandMin = () => {
        callCount++;
        if (callCount === 1) return 0.2; // left
        if (callCount === 2) return 0.0; // min X
        if (callCount === 3) return 0.0; // min Angle
        return 0.5;
      };

      const spawnMin = createMeteoriteSpawn(cameraX, cameraY, mockRandMin);
      expect(spawnMin.spawnX).toBeCloseTo(cameraX - 100.0, 5);
      expect(spawnMin.spawnY).toBeCloseTo(cameraY - 65.0, 5);
      expect(spawnMin.angle).toBeCloseTo(0.75 * Math.PI, 5); // 135°
      expect(spawnMin.speed).toBeCloseTo(250.0, 5);
      expect(spawnMin.vx).toBeGreaterThan(0); // heading right
      expect(spawnMin.vy).toBeGreaterThan(0); // heading down

      // Max values for left branch
      callCount = 0;
      const mockRandMax = () => {
        callCount++;
        if (callCount === 1) return 0.49; // left
        if (callCount === 2) return 1.0; // max X
        if (callCount === 3) return 1.0; // max Angle
        return 0.5;
      };

      const spawnMax = createMeteoriteSpawn(cameraX, cameraY, mockRandMax);
      expect(spawnMax.spawnX).toBeCloseTo(cameraX + 300.0, 5);
      expect(spawnMax.angle).toBeCloseTo(Math.PI, 5); // 180°
    });
  });

  describe('Right Branch (rand >= 0.5)', () => {
    it('spawns within [cameraX + 900, cameraX + 1300] and angle in [144°, 171°]', () => {
      const cameraX = 500;
      const cameraY = 200;

      let callCount = 0;
      const mockRandMin = () => {
        callCount++;
        if (callCount === 1) return 0.8; // right
        if (callCount === 2) return 0.0; // min X
        if (callCount === 3) return 0.0; // min Angle
        return 0.5;
      };

      const spawnMin = createMeteoriteSpawn(cameraX, cameraY, mockRandMin);
      expect(spawnMin.spawnX).toBeCloseTo(cameraX + 900.0, 5);
      expect(spawnMin.spawnY).toBeCloseTo(cameraY - 65.0, 5);
      expect(spawnMin.angle).toBeCloseTo(0.8 * Math.PI, 5); // 144°
      expect(spawnMin.speed).toBeCloseTo(250.0, 5);
      expect(spawnMin.vx).toBeLessThan(0); // heading left
      expect(spawnMin.vy).toBeGreaterThan(0); // heading down

      callCount = 0;
      const mockRandMax = () => {
        callCount++;
        if (callCount === 1) return 0.8; // right
        if (callCount === 2) return 1.0; // max X
        if (callCount === 3) return 1.0; // max Angle
        return 0.5;
      };

      const spawnMax = createMeteoriteSpawn(cameraX, cameraY, mockRandMax);
      expect(spawnMax.spawnX).toBeCloseTo(cameraX + 1300.0, 5);
      expect(spawnMax.angle).toBeCloseTo(0.95 * Math.PI, 5); // 171°
    });
  });

  it('despawns when exceeding cameraY + 700.0', () => {
    const cameraY = 300;
    const spawn = createMeteoriteSpawn(0, cameraY);
    expect(spawn.despawnY).toBeCloseTo(cameraY + 700.0, 5);
  });
});
