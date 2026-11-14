import { InputManager } from '../core/Input';
import { audio } from '../core/AudioManager';

export class CutsceneScene {
  private slides: string[] = [];
  private currentSlideIndex: number = 0;
  private onCompleteAction: string = 'menu';
  private debounceTimer: number = 0;

  public setup(slides: string[], onCompleteAction: string) {
    this.slides = slides;
    this.currentSlideIndex = 0;
    this.onCompleteAction = onCompleteAction;
    this.debounceTimer = 0.5; // ignore immediate keypress
  }

  public update(dt: number, input: InputManager): string | null {
    if (this.debounceTimer > 0) {
      this.debounceTimer -= dt;
      return null;
    }

    if (input.isJumpJustPressed() || input.isActionJustPressed() || input.isAnyKeyJustPressed()) {
      audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      this.currentSlideIndex++;
      if (this.currentSlideIndex >= this.slides.length) {
        return this.onCompleteAction;
      }
    }

    if (input.isPauseJustPressed()) {
      return this.onCompleteAction;
    }

    return null;
  }

  public handleClick(): string | null {
    if (this.debounceTimer > 0) return null;
    audio.playSound('/assets/audio/fx/item.ogg', 0.5);
    this.currentSlideIndex++;
    if (this.currentSlideIndex >= this.slides.length) {
      return this.onCompleteAction;
    }
    return null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    images: Record<string, HTMLImageElement>,
    width: number,
    height: number
  ) {
    const currentPath = this.slides[this.currentSlideIndex];
    const img = images[currentPath];

    if (img) {
      const sw = img.width >= 2048 ? 1200 : img.width;
      const sh = img.height >= 1024 ? 900 : img.height;
      ctx.drawImage(img, 0, 0, sw, sh, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }

    // Authentic "Pulsa cualquier tecla para continuar." banner from press_any_key.png
    const pressAnyKeyImg = images['/assets/lang/images/menu/press_any_key.png'];
    if (pressAnyKeyImg) {
      const sw = 576;
      const sh = 61;
      const dx = Math.round((width - sw) / 2);
      const dy = height - sh;
      ctx.drawImage(pressAnyKeyImg, 224, 67, sw, sh, dx, dy, sw, sh);
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect(width / 2 - 200, height - 55, 400, 36, 8);
      ctx.fill();

      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#f1c40f';
      ctx.textAlign = 'center';
      ctx.fillText('Pulsa cualquier tecla para continuar.', width / 2, height - 32);
      ctx.restore();
    }
  }
}
