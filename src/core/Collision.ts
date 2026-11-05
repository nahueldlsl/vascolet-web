import { TMXMap, TileProperties } from '../types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class CollisionSystem {
  public static checkAABB(a: Box, b: Box): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  public static getTileProps(map: TMXMap, tileX: number, tileY: number): TileProperties | null {
    if (tileX < 0 || tileX >= map.width || tileY < 0) {
      return { pHard: true }; // Boundary is solid
    }
    if (tileY >= map.height) {
      return null; // Abyss/pit below map is open air, not solid
    }
    const index = tileY * map.width + tileX;
    const gid = map.tiles[index];
    if (gid === 0) return null;
    const tileId = gid - 1;
    return map.tileProps.get(tileId) || null;
  }

  public static isSolid(map: TMXMap, tileX: number, tileY: number): boolean {
    const props = this.getTileProps(map, tileX, tileY);
    return !!props?.pHard;
  }

  public static isPlatform(map: TMXMap, tileX: number, tileY: number): boolean {
    const props = this.getTileProps(map, tileX, tileY);
    return !!props?.pPlatform && !props.pHard;
  }

  public static isHazard(map: TMXMap, tileX: number, tileY: number): boolean {
    const props = this.getTileProps(map, tileX, tileY);
    return !!props?.pKilling;
  }

  public static isLadder(map: TMXMap, tileX: number, tileY: number): boolean {
    const props = this.getTileProps(map, tileX, tileY);
    return !!props?.pLadder || !!props?.pLadderEnd;
  }

  public static isLadderEnd(map: TMXMap, tileX: number, tileY: number): boolean {
    const props = this.getTileProps(map, tileX, tileY);
    return !!props?.pLadderEnd;
  }

  public static getLadderInfo(
    map: TMXMap,
    box: Box
  ): { hasLadder: boolean; centerX: number; topY: number; isTopEnd: boolean } | null {
    const tileW = map.tileWidth;
    const tileH = map.tileHeight;
    const centerTileX = Math.floor((box.x + box.w / 2) / tileW);
    const startY = Math.floor(box.y / tileH);
    const endY = Math.floor((box.y + box.h - 1) / tileH);

    let hasLadder = false;
    let minLadderTy = 999999;
    let isTopEnd = false;

    for (let ty = startY; ty <= endY; ty++) {
      const props = this.getTileProps(map, centerTileX, ty);
      if (props?.pLadder || props?.pLadderEnd) {
        hasLadder = true;
        if (ty < minLadderTy) {
          minLadderTy = ty;
          isTopEnd = !!props.pLadderEnd;
        }
      }
    }

    if (!hasLadder) return null;

    return {
      hasLadder: true,
      centerX: (centerTileX + 0.5) * tileW,
      topY: minLadderTy * tileH,
      isTopEnd,
    };
  }

  public static checkHazardCollision(map: TMXMap, box: Box): boolean {
    const startX = Math.floor(box.x / map.tileWidth);
    const endX = Math.floor((box.x + box.w - 1) / map.tileWidth);
    const startY = Math.floor(box.y / map.tileHeight);
    const endY = Math.floor((box.y + box.h - 1) / map.tileHeight);

    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        if (this.isHazard(map, tx, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  public static checkLadderOverlap(map: TMXMap, box: Box): boolean {
    const centerX = Math.floor((box.x + box.w / 2) / map.tileWidth);
    const startY = Math.floor(box.y / map.tileHeight);
    const endY = Math.floor((box.y + box.h - 1) / map.tileHeight);

    for (let ty = startY; ty <= endY; ty++) {
      if (this.isLadder(map, centerX, ty)) {
        return true;
      }
    }
    return false;
  }
}
