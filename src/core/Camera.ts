export class Camera {
  public x: number = 0;
  public y: number = 0;
  public width: number = 1200;
  public height: number = 900;

  // In TMX world coordinates (76x76 tiles), each fixed screen is 16x12 tiles (1216x912)
  public readonly roomWidth: number = 16 * 76; // 1216
  public readonly roomHeight: number = 12 * 76; // 912

  public screenX: number = 0;
  public screenY: number = 0;

  public minX: number = 0;
  public maxX: number = 0;
  public minY: number = 0;
  public maxY: number = 0;

  constructor(width: number = 1200, height: number = 900) {
    this.width = width;
    this.height = height;
  }

  public setBounds(mapWidthPx: number, mapHeightPx: number, minX: number = 0, minY: number = 0) {
    this.minX = minX;
    this.maxX = Math.max(minX, mapWidthPx - this.roomWidth);
    this.minY = minY;
    this.maxY = Math.max(minY, mapHeightPx - this.roomHeight);
  }

  /**
   * Fixed-screen camera transition matching StageManager (0x4276ef) & Vascolet (0x432807) in Vascolet.exe:
   * Camera stays completely stationary within the current 16x12-tile room and snaps to the
   * next room only when Vascolet crosses the horizontal or vertical screen boundary.
   */
  public follow(targetX: number, targetY: number, targetW: number = 62, targetH: number = 104) {
    const validX = isNaN(targetX) ? this.minX : targetX;
    const validY = isNaN(targetY) ? this.minY : targetY;

    const centerX = validX + targetW * 0.5;
    const centerY = validY + targetH * 0.5;

    this.screenX = Math.floor(centerX / this.roomWidth);
    this.screenY = Math.floor(centerY / this.roomHeight);

    this.clamp();
  }

  public setPosition(targetX: number, targetY: number, targetW: number = 62, targetH: number = 104) {
    this.follow(targetX, targetY, targetW, targetH);
  }

  public isInCurrentRoom(ex: number, ey: number, ew: number = 0, eh: number = 0, margin: number = 120): boolean {
    return (
      ex + ew >= this.x - margin &&
      ex <= this.x + this.roomWidth + margin &&
      ey + eh >= this.y - margin &&
      ey <= this.y + this.roomHeight + margin
    );
  }

  private clamp() {
    const minRoomX = Math.floor(this.minX / this.roomWidth);
    const maxRoomX = Math.floor(this.maxX / this.roomWidth);
    const minRoomY = Math.floor(this.minY / this.roomHeight);
    const maxRoomY = Math.floor(this.maxY / this.roomHeight);

    if (this.screenX < minRoomX) this.screenX = minRoomX;
    if (this.screenX > maxRoomX) this.screenX = maxRoomX;
    if (this.screenY < minRoomY) this.screenY = minRoomY;
    if (this.screenY > maxRoomY) this.screenY = maxRoomY;

    this.x = this.screenX * this.roomWidth;
    this.y = this.screenY * this.roomHeight;
  }
}
