import { describe, it, expect } from 'vitest';
import { Player } from '../../src/entities/Player';

describe('Player Score Carryover & Extra Life Parity Tests', () => {
  it('initializes default player with 0 score, 10 lives, and nextExtraLifeScore at 2000', () => {
    const player = new Player(100, 100);
    expect(player.score).toBe(0);
    expect(player.lives).toBe(10);
    expect(player.getNextExtraLifeScore()).toBe(2000);
  });

  it('correctly synchronizes nextExtraLifeScore when carrying over score across levels', () => {
    const player = new Player(100, 100);
    // Player ended previous era with 3500 score and 8 lives
    player.setScoreAndLives(3500, 8);

    expect(player.score).toBe(3500);
    expect(player.lives).toBe(8);
    // Next extra life must be at 4000 (not 2000!)
    expect(player.getNextExtraLifeScore()).toBe(4000);

    // Picking up 100-point coin should NOT grant an extra life at 3600
    player.collectCoin();
    expect(player.score).toBe(3600);
    expect(player.lives).toBe(8);
    expect(player.getNextExtraLifeScore()).toBe(4000);

    // Adding 400 points reaches 4000, which triggers exactly 1 extra life
    player.addScore(400);
    expect(player.score).toBe(4000);
    expect(player.lives).toBe(9);
    expect(player.getNextExtraLifeScore()).toBe(6000);
  });

  it('handles multiple life thresholds when a large score bonus is awarded', () => {
    const player = new Player(100, 100);
    player.setScoreAndLives(1800, 10);
    expect(player.getNextExtraLifeScore()).toBe(2000);

    // Award 4500 points (1800 + 4500 = 6300 -> crosses 2000, 4000, 6000)
    player.addScore(4500);
    expect(player.score).toBe(6300);
    expect(player.lives).toBe(13); // +3 lives
    expect(player.getNextExtraLifeScore()).toBe(8000);
  });
});
