import { describe, it, expect } from 'vitest';
import { transformTMXObjectCoords } from '../../src/core/ParityFormulas';

describe('TMX Object Coordinate Translation (Vascolet.exe 0x0041e916)', () => {
  it('translates TMX object coordinates using x - w*0.5 and y - h', () => {
    // For a standard 50x48 Piranha marker at (17648, 3360)
    const piranha = transformTMXObjectCoords(17648, 3360, 50, 48);
    expect(piranha.x).toBe(17648 - 25); // 17623
    expect(piranha.y).toBe(3360 - 48); // 3312

    // For a 60x60 item/enemy marker at (100, 200)
    const item = transformTMXObjectCoords(100, 200, 60, 60);
    expect(item.x).toBe(100 - 30); // 70
    expect(item.y).toBe(200 - 60); // 140
  });
});
