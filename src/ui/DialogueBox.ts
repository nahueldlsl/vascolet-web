export class DialogueBox {
  public visible: boolean = false;
  public text: string = '';

  public show(text: string) {
    this.text = text;
    this.visible = true;
  }

  public hide() {
    this.visible = false;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    screenWidth: number,
    _screenHeight: number,
    hudBgImg?: HTMLImageElement
  ) {
    if (!this.visible || !this.text) return;

    ctx.save();

    // Original PC game Dialog banner strip from back_hud.png (0, 92, 600, 92)
    // Positioned directly below the top HUD at y = 115 across the full 1200px width
    const bannerY = 115;
    const bannerH = 66;

    if (hudBgImg) {
      ctx.drawImage(hudBgImg, 0, 92, 600, 92, 0, bannerY, screenWidth, bannerH);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.fillRect(0, bannerY, screenWidth, bannerH);
    }

    // Centered white text matching PC original
    const lines = this.text.split('\n');
    ctx.font = 'bold 21px "Arial", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#ffffff';

    if (lines.length === 1) {
      const cy = bannerY + bannerH / 2;
      ctx.strokeText(lines[0], screenWidth / 2, cy);
      ctx.fillText(lines[0], screenWidth / 2, cy);
    } else {
      const startY = bannerY + 20;
      const lineSpacing = 26;
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i * lineSpacing;
        ctx.strokeText(lines[i], screenWidth / 2, y);
        ctx.fillText(lines[i], screenWidth / 2, y);
      }
    }

    ctx.restore();
  }
}
