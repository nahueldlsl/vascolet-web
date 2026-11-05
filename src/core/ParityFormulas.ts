/**
 * ParityFormulas.ts
 *
 * Exact gameplay physics, constants, and coordinate math reverse-engineered
 * directly from the original Vascolet.exe binary using REA disassembly.
 */

export interface MeteoriteSpawnData {
  spawnX: number;
  spawnY: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  despawnY: number;
}

/**
 * Meteorite spawn timer interval in seconds.
 * Original binary Vascolet.exe at 0x00420ad4 - 0x00420aed:
 *   timer = 3.0 + (rand() / 32767.0) * 1.0
 *   Range: [3.0, 4.0] seconds.
 */
export function calculateMeteoriteInterval(randomFn: () => number = Math.random): number {
  return 3.0 + randomFn() * 1.0;
}

/**
 * Meteorite spawn position and velocity vectors.
 * Original binary Vascolet.exe at 0x00420b13 - 0x00420d90:
 * - Speed: 250.0 px/s (stored at double 0x004ef098)
 * - Spawn Y: camera.y - 65.0 (stored at float 0x004ef0c8)
 * - Branch: rand() < 0.5
 *   - Left Branch:
 *       x = camera.x - 100.0 + (rand() / 32767.0) * 400.0  => [-100, 300]
 *       angle = 0.75 * PI + (rand() / 32767.0) * (0.25 * PI) => [135°, 180°]
 *       vx = -cos(angle) * 250.0 (positive, heading right)
 *       vy = sin(angle) * 250.0  (positive, heading down)
 *   - Right Branch:
 *       x = camera.x + 900.0 + (rand() / 32767.0) * 400.0  => [900, 1300]
 *       angle = 0.8 * PI + (rand() / 32767.0) * (0.15 * PI)  => [144°, 171°]
 *       vx = cos(angle) * 250.0  (negative, heading left)
 *       vy = sin(angle) * 250.0  (positive, heading down)
 * - Despawn Y: camera.y + 700.0
 */
export function createMeteoriteSpawn(
  cameraX: number,
  cameraY: number,
  randomFn: () => number = Math.random
): MeteoriteSpawnData {
  const speed = 250.0;
  const spawnY = cameraY - 65.0;
  const isLeft = randomFn() < 0.5;

  let spawnX: number;
  let angle: number;
  let vx: number;
  let vy: number;

  if (isLeft) {
    spawnX = cameraX - 100.0 + randomFn() * 400.0;
    angle = 0.75 * Math.PI + randomFn() * (0.25 * Math.PI);
    vx = -Math.cos(angle) * speed;
    vy = Math.sin(angle) * speed;
  } else {
    spawnX = cameraX + 900.0 + randomFn() * 400.0;
    angle = 0.8 * Math.PI + randomFn() * (0.15 * Math.PI);
    vx = Math.cos(angle) * speed;
    vy = Math.sin(angle) * speed;
  }

  const despawnY = cameraY + 700.0;

  return {
    spawnX,
    spawnY,
    vx,
    vy,
    angle,
    speed,
    despawnY,
  };
}

/**
 * Meteorite gravity and floor bounce physics from Vascolet.exe:
 * - Initial vertical acceleration (0x00420d37): ay = 400.0 px/s^2 (0x43c80000)
 * - Floor bounce handler (0x004412b0):
 *     if (bounceCount < 2 && hitDirection == DOWN):
 *       vy = bounceCount * 50.0 - 650.0  (-650 on 1st bounce, -600 on 2nd bounce)
 *       y = tileTopY - height - 2.0
 *       bounceCount++
 *       ay = 900.0 px/s^2 (0x44610000)
 */
export const METEORITE_PHYSICS = {
  INITIAL_AY: 400.0,
  BOUNCE_AY: 900.0,
  MAX_BOUNCES: 2,
  BOUNCE_BASE_VY: -650.0,
  BOUNCE_STEP_VY: 50.0,
};

/**
 * Standard cubic ease-out easing function.
 * Original binary Vascolet.exe at 0x0044bc40:
 *   easeOutCubic(t) = 1.0 - (1.0 - t)^3
 */
export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1.0 - Math.pow(1.0 - clamped, 3);
}

/**
 * Piranha jump trajectory using Ping-Pong Mode 2 and easeOutCubic.
 * Original binary Vascolet.exe at 0x00405350 & 0x0043f850:
 * - Ping-Pong Mode 2 (0x0040535f):
 *   If progress < 0.5:
 *     subT = progress * 2.0 (0.0 -> 1.0)
 *     eased = easeOutCubic(subT)
 *   Else:
 *     subT = 1.0 - (progress - 0.5) * 2.0 (1.0 -> 0.0)
 *     eased = easeOutCubic(subT)
 * - Rise vs Fall threshold (0x0043fa49):
 *   Threshold constant is 0.60f (0x004ef0e0).
 *   progress < 0.60 => Rising (PIRANHA_UP frames 0, 1)
 *   progress >= 0.60 => Falling (PIRANHA_DOWN frames 2, 3)
 */
export function calculatePiranhaTrajectory(
  currentT: number,
  duration: number,
  startY: number,
  jumpHeight: number
): { y: number; isRising: boolean; isJumping: boolean; progress: number } {
  if (currentT < 0 || currentT >= duration) {
    return {
      y: startY + 200,
      isRising: false,
      isJumping: false,
      progress: currentT / duration,
    };
  }

  const progress = currentT / duration;
  let eased: number;

  if (progress < 0.5) {
    const subT = progress * 2.0;
    eased = easeOutCubic(subT);
  } else {
    const subT = 1.0 - (progress - 0.5) * 2.0;
    eased = easeOutCubic(subT);
  }

  const y = startY - eased * jumpHeight;
  const isRising = progress < 0.6;

  return {
    y,
    isRising,
    isJumping: true,
    progress,
  };
}

/**
 * 60ms per animation frame pair (0x3c in Vascolet.exe at 0x004375b1).
 * Frames 0, 1 = PIRANHA_UP
 * Frames 2, 3 = PIRANHA_DOWN
 */
export function calculatePiranhaFrame(currentT: number, isRising: boolean): number {
  const framePair = Math.floor(currentT / 0.06) % 2;
  return isRising ? framePair : 2 + framePair;
}

/**
 * Liquid splash animation sequences from Vascolet.exe (0x00438be0 & 0x00434760):
 * - Sprite sheet: assets/images/enemies/anim_lava_tile.png (76x152 per cell, 8 cols, anchor 38x152)
 * - _OUT sequence (6 frames at 7/60s): [0, 1, 2, 3, 4, 5]
 * - _IN sequence (4 frames at 7/60s):  [7, 3, 4, 5]
 */
export const SPLASH_ANIM_SPEC = {
  FRAME_W: 76,
  FRAME_H: 152,
  ANCHOR_X: 38,
  ANCHOR_Y: 152,
  FRAME_DURATION: 7.0 / 60.0,
  OUT_FRAMES: [0, 1, 2, 3, 4, 5] as const,
  IN_FRAMES: [7, 3, 4, 5] as const,
};

/**
 * Item pickup sparkle animation (L"POWER" in coinEffect.png) from Vascolet.exe (0x00438be0 & 0x00434760):
 * - Cell: 104x162, 9 cols x 4 rows
 * - Anchor: (52, 129)
 * - Active frames: 0..28 (29 non-blank frames) at 30 FPS
 */
export const ITEM_PICKUP_EFFECT_SPEC = {
  frameW: 104,
  frameH: 162,
  cols: 9,
  rows: 4,
  totalFrames: 29,
  anchorX: 52,
  anchorY: 129,
  frameDuration: 1.0 / 30.0,
};

/**
 * TMX Object Coordinate Transformation.
 * Original binary Vascolet.exe base GameObject initialization at 0x0041e916 - 0x0041e96a:
 *   x_pos = x_tmx - (w_tmx * 0.5)
 *   y_pos = y_tmx - h_tmx
 */
export function transformTMXObjectCoords(
  tmxX: number,
  tmxY: number,
  tmxW: number,
  tmxH: number
): { x: number; y: number } {
  return {
    x: tmxX - tmxW * 0.5,
    y: tmxY - tmxH,
  };
}

/**
 * Piranha sprite anchor definition from 0x0043af9d - 0x0043b08b:
 * Frame: 80x80
 * Anchor: (40, 75) => center horizontally, 5px from bottom
 * Hitbox: 50x55
 */
export const PIRANHA_SPRITE_SPEC = {
  frameW: 80,
  frameH: 80,
  anchorX: 40,
  anchorY: 75,
  hitboxW: 50,
  hitboxH: 55,
};
