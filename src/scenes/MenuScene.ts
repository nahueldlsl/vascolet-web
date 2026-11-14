import { InputManager } from '../core/Input';
import { audio } from '../core/AudioManager';
import { OptionsModal } from '../ui/OptionsModal';

export class MenuScene {
  private selectedIndex: number = 0;
  private options: { label: string; action: string }[] = [
    { label: 'Jugar', action: 'play' },
    { label: 'Opciones', action: 'options' },
    { label: 'Ayuda', action: 'help' },
    { label: 'Créditos', action: 'credits' },
    { label: 'Historia', action: 'story' },
  ];
  public optionsModal: OptionsModal = new OptionsModal();

  constructor() {}

  public onEnter() {
    audio.playMusic('/assets/audio/music/andy.ogg', true);
  }

  public update(_dt: number, input: InputManager): string | null {
    if (this.optionsModal.isOpen) {
      this.optionsModal.update(input);
      return null;
    }

    if (input.isDownJustPressed()) {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    } else if (input.isUpJustPressed()) {
      this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    }

    if (input.isSelectJustPressed()) {
      audio.playSound('/assets/audio/fx/powerup.ogg', 0.7);
      const act = this.options[this.selectedIndex].action;
      if (act === 'options') {
        this.optionsModal.open();
        return null;
      }
      return act;
    }

    return null;
  }

  public handleMouseMove(x: number, y: number) {
    if (this.optionsModal.isOpen) return;

    const btnX = 760;
    const btnW = 290;
    const btnH = 60;
    const startY = 330;
    const itemSpacing = 72;

    for (let i = 0; i < this.options.length; i++) {
      const top = startY + i * itemSpacing;
      if (x >= btnX && x <= btnX + btnW && y >= top && y <= top + btnH) {
        if (this.selectedIndex !== i) {
          this.selectedIndex = i;
          audio.playSound('/assets/audio/fx/item.ogg', 0.25);
        }
        break;
      }
    }
  }

  public handleClick(x: number, y: number, canvasW: number = 1200, canvasH: number = 900): string | null {
    if (this.optionsModal.isOpen) {
      this.optionsModal.handleClick(x, y, canvasW, canvasH);
      return null;
    }

    const btnX = 760;
    const btnW = 290;
    const btnH = 60;
    const startY = 330;
    const itemSpacing = 72;

    for (let i = 0; i < this.options.length; i++) {
      const top = startY + i * itemSpacing;
      if (x >= btnX && x <= btnX + btnW && y >= top && y <= top + btnH) {
        this.selectedIndex = i;
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.7);
        const act = this.options[i].action;
        if (act === 'options') {
          this.optionsModal.open();
          return null;
        }
        return act;
      }
    }
    return null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    bgImg: HTMLImageElement | undefined,
    buttonsImg: HTMLImageElement | undefined,
    opcionesImg: HTMLImageElement | undefined,
    width: number,
    height: number
  ) {
    // 1. Render Background: crop the active 1200x900 region out of 2048x1024 texture
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, 1200, 900, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#991118';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Render Buttons in the clear right quadrant
    const btnX = 760;
    const btnW = 290;
    const btnH = 60;
    const startY = 330;
    const itemSpacing = 72;

    this.options.forEach((opt, idx) => {
      const btnY = startY + idx * itemSpacing;
      const isSelected = idx === this.selectedIndex;

      ctx.save();
      if (buttonsImg) {
        // Native button sprite from buttons_tile.png:
        // Normal: (8, 11, 233, 54) | Hover/Active: (258, 11, 233, 54)
        const sx = isSelected ? 258 : 8;
        const sy = 11;
        const sw = 233;
        const sh = 54;
        ctx.drawImage(buttonsImg, sx, sy, sw, sh, btnX, btnY, btnW, btnH);
      } else {
        ctx.fillStyle = isSelected ? '#d35400' : 'rgba(30, 20, 20, 0.85)';
        ctx.strokeStyle = isSelected ? '#f1c40f' : '#e74c3c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 12);
        ctx.fill();
        ctx.stroke();
      }

      // Button Label with text outline
      ctx.font = 'bold 23px "Arial Black", Gadget, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textX = btnX + btnW / 2;
      const textY = btnY + btnH / 2;

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(opt.label, textX, textY);

      ctx.fillStyle = isSelected ? '#ffffff' : '#f9ca24';
      ctx.fillText(opt.label, textX, textY);

      ctx.restore();
    });

    // 3. Render Options Modal if open
    this.optionsModal.render(ctx, opcionesImg, buttonsImg, width, height);
  }
}
