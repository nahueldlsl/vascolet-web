import { Player } from '../entities/Player';
import spritesData from '../data/sprites.json';

export class HUD {
  private drawOutlinedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign = 'center',
    fontSize: number = 22
  ) {
    ctx.save();
    ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    player: Player,
    _levelTitle: string,
    itemsImg: HTMLImageElement | undefined,
    hudBgImg: HTMLImageElement | undefined
  ) {
    ctx.save();

    // 1. Original Top HUD Background from back_hud.png (0, 0, 600, 92)
    if (hudBgImg) {
      ctx.drawImage(hudBgImg, 0, 0, 600, 92, 0, 0, 1200, 86);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, 1200, 86);
    }

    if (itemsImg) {
      const items = spritesData.items as Record<string, { x: number; y: number; w: number; h: number }>;

      // 2. HUD_HERO (Vascolet Face + Lives count) at (45, 5)
      const heroMeta = items['LIVES'];
      if (heroMeta) {
        ctx.drawImage(itemsImg, heroMeta.x, heroMeta.y, heroMeta.w, heroMeta.h, 45, 4, 72, 72);
      }
      this.drawOutlinedText(ctx, `${player.lives}`, 114, 64, 'center', 22);

      // 3. Puntos & 6-digit Score centered at x = 270
      this.drawOutlinedText(ctx, 'Puntos', 270, 32, 'center', 21);
      this.drawOutlinedText(ctx, player.score.toString().padStart(6, '0'), 270, 62, 'center', 21);

      // 4. HUD_MILK_GLASSES (4 Vascolet Cups at x = 405, w = 50, h = 70)
      const cupOn = items['VASCOLETS'];
      const cupOff = items['VASCOLETS_OFF'];
      for (let i = 0; i < 4; i++) {
        const meta = i < player.vascoletCups ? cupOn : cupOff;
        if (meta) {
          ctx.drawImage(itemsImg, meta.x, meta.y, meta.w, meta.h, 405 + i * 50, 5, 50, 70);
        }
      }

      // 5. HUD_CEREALS (4 Cereal Bowls at x = 605, w = 71, h = 55)
      const cerealOn = items['CEREALS'];
      const cerealOff = items['CEREALS_OFF'];
      for (let i = 0; i < 4; i++) {
        const meta = i < player.cerealBowls ? cerealOn : cerealOff;
        if (meta) {
          ctx.drawImage(itemsImg, meta.x, meta.y, meta.w, meta.h, 605 + i * 71, 14, 71, 55);
        }
      }

      // 6. HUD_KEYS (4 Colored Keys: Yellow, Red, Green, Blue at x = 900)
      const keyOrder = ['YELLOW_KEY', 'RED_KEY', 'GREEN_KEY', 'BLUE_KEY'];
      for (let i = 0; i < keyOrder.length; i++) {
        const keyName = keyOrder[i];
        const keyMeta = items[keyName];
        const keyX = 900 + i * 72;
        if (keyMeta) {
          ctx.drawImage(itemsImg, keyMeta.x, keyMeta.y, keyMeta.w, keyMeta.h, keyX, 3, 72, 72);
        }
        const count = player.keyCounts[keyName] || 0;
        this.drawOutlinedText(ctx, `${count}`, keyX + 54, 64, 'center', 21);
      }
    }

    ctx.restore();
  }
}
