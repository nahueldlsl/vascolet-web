import { describe, it, expect } from 'vitest';
import {
  calculatePiranhaTrajectory,
  calculatePiranhaFrame,
  easeOutCubic,
  PIRANHA_SPRITE_SPEC,
} from '../../src/core/ParityFormulas';

describe('Piranha Parity (Vascolet.exe 0x0043af9d, 0x00405350, 0x0043f850)', () => {
  const startY = 3360;
  const jumpHeight = 300;
  const duration = 2.0;

  it('uses cubic ease-out: easeOutCubic(t) = 1 - (1 - t)^3 (0x0044bc40)', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5); // 1 - 0.5^3 = 0.875
    expect(easeOutCubic(1)).toBe(1);
  });

  it('follows Ping-Pong Mode 2 jump arc: rising to peak at 50% and returning to base', () => {
    // Start of jump (t = 0)
    const t0 = calculatePiranhaTrajectory(0, duration, startY, jumpHeight);
    expect(t0.y).toBeCloseTo(startY, 3);
    expect(t0.isRising).toBe(true);
    expect(t0.isJumping).toBe(true);

    // Quarter jump (t = 0.5s => progress = 0.25 => subT = 0.5)
    // easeOutCubic(0.5) = 0.875 => y = 3360 - 0.875 * 300 = 3097.5
    const tQuarter = calculatePiranhaTrajectory(0.5, duration, startY, jumpHeight);
    expect(tQuarter.y).toBeCloseTo(startY - 0.875 * jumpHeight, 3);
    expect(tQuarter.isRising).toBe(true);

    // Peak of jump (t = 1.0s => progress = 0.5 => subT = 1.0)
    // easeOutCubic(1.0) = 1.0 => y = 3360 - 300 = 3060
    const tPeak = calculatePiranhaTrajectory(1.0, duration, startY, jumpHeight);
    expect(tPeak.y).toBeCloseTo(startY - jumpHeight, 3);
    expect(tPeak.isRising).toBe(true);

    // Three-quarters jump (t = 1.5s => progress = 0.75 => subT = 0.5)
    const tThreeQuarter = calculatePiranhaTrajectory(1.5, duration, startY, jumpHeight);
    expect(tThreeQuarter.y).toBeCloseTo(startY - 0.875 * jumpHeight, 3);
    expect(tThreeQuarter.isRising).toBe(false); // progress 0.75 >= 0.60 threshold

    // End of jump (t = 2.0s => complete)
    const tEnd = calculatePiranhaTrajectory(2.0, duration, startY, jumpHeight);
    expect(tEnd.isJumping).toBe(false);
  });

  it('switches animation direction at exactly 0.60f progress threshold (0x0043fa49 / 0x004ef0e0)', () => {
    // Just before 0.60
    const beforeThreshold = calculatePiranhaTrajectory(duration * 0.59, duration, startY, jumpHeight);
    expect(beforeThreshold.isRising).toBe(true);

    // Exactly at / past 0.60
    const atThreshold = calculatePiranhaTrajectory(duration * 0.60, duration, startY, jumpHeight);
    expect(atThreshold.isRising).toBe(false);

    const pastThreshold = calculatePiranhaTrajectory(duration * 0.70, duration, startY, jumpHeight);
    expect(pastThreshold.isRising).toBe(false);
  });

  it('selects frames based on 60ms interval: rising (0, 1) and falling (2, 3) (0x004375b1)', () => {
    // Rising:
    expect(calculatePiranhaFrame(0.00, true)).toBe(0);
    expect(calculatePiranhaFrame(0.05, true)).toBe(0);
    expect(calculatePiranhaFrame(0.06, true)).toBe(1);
    expect(calculatePiranhaFrame(0.11, true)).toBe(1);
    expect(calculatePiranhaFrame(0.12, true)).toBe(0);

    // Falling:
    expect(calculatePiranhaFrame(0.00, false)).toBe(2);
    expect(calculatePiranhaFrame(0.05, false)).toBe(2);
    expect(calculatePiranhaFrame(0.06, false)).toBe(3);
    expect(calculatePiranhaFrame(0.11, false)).toBe(3);
    expect(calculatePiranhaFrame(0.12, false)).toBe(2);
  });

  it('has exact sprite dimensions, anchor point, and hitbox as Vascolet.exe (0x0043af9d)', () => {
    expect(PIRANHA_SPRITE_SPEC.frameW).toBe(80);
    expect(PIRANHA_SPRITE_SPEC.frameH).toBe(80);
    expect(PIRANHA_SPRITE_SPEC.anchorX).toBe(40); // 80 / 2
    expect(PIRANHA_SPRITE_SPEC.anchorY).toBe(75); // 5px above bottom
    expect(PIRANHA_SPRITE_SPEC.hitboxW).toBe(50);
    expect(PIRANHA_SPRITE_SPEC.hitboxH).toBe(55);
  });
});
