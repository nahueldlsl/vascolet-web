import { audio } from '../core/AudioManager';
import { InputManager } from '../core/Input';
import { GameStorage } from '../core/Storage';

export class OptionsModal {
  public isOpen: boolean = false;
  public selectedRow: number = 0; // 0: Music, 1: Effects, 2: Fullscreen, 3: Stretch, 4: Volver
  public stretchScreen: boolean = GameStorage.loadOptions().stretchScreen;

  // Dialog placement on 1200x900 canvas (native 280x614 region from opciones_tile.png)
  private readonly dialogW = 280;
  private readonly dialogH = 614;

  public open() {
    this.stretchScreen = GameStorage.loadOptions().stretchScreen;
    this.isOpen = true;
    this.selectedRow = 4;
  }

  public close() {
    this.isOpen = false;
  }

  public update(input: InputManager): boolean {
    if (!this.isOpen) return false;

    if (input.isPauseJustPressed()) {
      this.close();
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
      return true;
    }

    if (input.isDownJustPressed()) {
      this.selectedRow = (this.selectedRow + 1) % 5;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    } else if (input.isUpJustPressed()) {
      this.selectedRow = (this.selectedRow - 1 + 5) % 5;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    }

    if (input.isLeftJustPressed()) {
      if (this.selectedRow === 0) {
        audio.setMusicVolume(audio.getMusicVolume() - 0.1);
      } else if (this.selectedRow === 1) {
        audio.setSfxVolume(audio.getSfxVolume() - 0.1);
        audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      }
    } else if (input.isRightJustPressed()) {
      if (this.selectedRow === 0) {
        audio.setMusicVolume(audio.getMusicVolume() + 0.1);
      } else if (this.selectedRow === 1) {
        audio.setSfxVolume(audio.getSfxVolume() + 0.1);
        audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      }
    }

    if (input.isSelectJustPressed()) {
      if (this.selectedRow === 0) {
        audio.toggleMusicMute();
      } else if (this.selectedRow === 1) {
        audio.toggleSfxMute();
        audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      } else if (this.selectedRow === 2) {
        this.toggleFullscreen();
      } else if (this.selectedRow === 3) {
        this.toggleStretch();
      } else if (this.selectedRow === 4) {
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.6);
        this.close();
      }
    }

    return true;
  }

  public handleClick(x: number, y: number, canvasW: number, canvasH: number): boolean {
    if (!this.isOpen) return false;

    const dx = Math.round((canvasW - this.dialogW) / 2);
    const dy = Math.round((canvasH - this.dialogH) / 2);

    // 1. Music mute speaker icon area: (dx + 140..265, dy + 190..240)
    if (x >= dx + 140 && x <= dx + 265 && y >= dy + 190 && y <= dy + 240) {
      audio.toggleMusicMute();
      return true;
    }

    // 2. Music volume slider track: (dx + 25..255, dy + 240..278)
    if (x >= dx + 20 && x <= dx + 260 && y >= dy + 235 && y <= dy + 280) {
      const ratio = (x - (dx + 32)) / 216;
      audio.setMusicVolume(ratio);
      return true;
    }

    // 3. SFX mute speaker icon area: (dx + 140..265, dy + 282..332)
    if (x >= dx + 140 && x <= dx + 265 && y >= dy + 282 && y <= dy + 332) {
      audio.toggleSfxMute();
      audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      return true;
    }

    // 4. SFX volume slider track: (dx + 20..260, dy + 330..372)
    if (x >= dx + 20 && x <= dx + 260 && y >= dy + 328 && y <= dy + 372) {
      const ratio = (x - (dx + 32)) / 216;
      audio.setSfxVolume(ratio);
      audio.playSound('/assets/audio/fx/item.ogg', 0.5);
      return true;
    }

    // 5. Fullscreen checkbox: (dx + 20..270, dy + 368..412)
    if (x >= dx + 20 && x <= dx + 270 && y >= dy + 368 && y <= dy + 412) {
      this.toggleFullscreen();
      return true;
    }

    // 6. Stretch screen checkbox: (dx + 20..270, dy + 413..458)
    if (x >= dx + 20 && x <= dx + 270 && y >= dy + 413 && y <= dy + 458) {
      this.toggleStretch();
      return true;
    }

    // 7. Volver button: (dx + 45..235, dy + 468..522)
    if (x >= dx + 45 && x <= dx + 235 && y >= dy + 468 && y <= dy + 522) {
      audio.playSound('/assets/audio/fx/powerup.ogg', 0.6);
      this.close();
      return true;
    }

    return true;
  }

  private toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  private toggleStretch() {
    this.stretchScreen = !this.stretchScreen;
    GameStorage.saveOptions({ stretchScreen: this.stretchScreen });
    window.dispatchEvent(new Event('resize'));
  }

  public render(
    ctx: CanvasRenderingContext2D,
    opcionesImg: HTMLImageElement | undefined,
    buttonsImg: HTMLImageElement | undefined,
    width: number,
    height: number
  ) {
    if (!this.isOpen) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, width, height);

    const dx = Math.round((width - this.dialogW) / 2);
    const dy = Math.round((height - this.dialogH) / 2);

    if (opcionesImg) {
      // 1. Main Options Panel from opciones_tile.png: (10, 24, 280, 614)
      ctx.drawImage(opcionesImg, 10, 24, 280, 614, dx, dy, this.dialogW, this.dialogH);

      // 2. Music Speaker Icon: active orange (300, 2, 42, 50) vs muted grey (355, 2, 36, 50)
      const musicMuted = audio.getMusicMuted();
      if (!musicMuted) {
        ctx.drawImage(opcionesImg, 300, 2, 42, 50, dx + 216, dy + 192, 34, 40);
      } else {
        ctx.drawImage(opcionesImg, 355, 2, 36, 50, dx + 218, dy + 192, 30, 40);
      }

      // 3. Music Slider Coin Knob: (385, 62, 31, 31) along track [dx+26 .. dx+232] at dy+240
      const musicVol = musicMuted ? 0 : audio.getMusicVolume();
      const musicKnobX = Math.round(dx + 26 + musicVol * 206);
      ctx.drawImage(opcionesImg, 385, 62, 31, 31, musicKnobX, dy + 239, 31, 31);

      // 4. SFX Speaker Icon
      const sfxMuted = audio.getSfxMuted();
      if (!sfxMuted) {
        ctx.drawImage(opcionesImg, 300, 2, 42, 50, dx + 216, dy + 284, 34, 40);
      } else {
        ctx.drawImage(opcionesImg, 355, 2, 36, 50, dx + 218, dy + 284, 30, 40);
      }

      // 5. SFX Slider Coin Knob along track [dx+26 .. dx+232] at dy+332
      const sfxVol = sfxMuted ? 0 : audio.getSfxVolume();
      const sfxKnobX = Math.round(dx + 26 + sfxVol * 206);
      ctx.drawImage(opcionesImg, 385, 62, 31, 31, sfxKnobX, dy + 331, 31, 31);

      // 6. Fullscreen Checkmark: (303, 62, 33, 30) in box (dx+219, dy+373)
      if (document.fullscreenElement) {
        ctx.drawImage(opcionesImg, 303, 62, 33, 30, dx + 221, dy + 374, 33, 30);
      }

      // 7. Stretch Screen Checkmark in box (dx+219, dy+416)
      if (this.stretchScreen) {
        ctx.drawImage(opcionesImg, 303, 62, 33, 30, dx + 221, dy + 417, 33, 30);
      }

      // Highlight indicator for keyboard/d-pad focused option row (0 to 3)
      if (this.selectedRow >= 0 && this.selectedRow <= 3) {
        const hx = dx + 18;
        let hy = 0;
        const hw = this.dialogW - 36;
        let hh = 0;

        if (this.selectedRow === 0) {
          hy = dy + 188;
          hh = 86;
        } else if (this.selectedRow === 1) {
          hy = dy + 280;
          hh = 86;
        } else if (this.selectedRow === 2) {
          hy = dy + 368;
          hh = 42;
        } else if (this.selectedRow === 3) {
          hy = dy + 412;
          hh = 42;
        }

        ctx.save();
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(241, 196, 15, 0.12)';
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(hx, hy, hw, hh, 8);
        } else {
          ctx.rect(hx, hy, hw, hh);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 8. "Volver" Button at (dx + 50, dy + 472, 180, 46)
    const btnX = dx + 50;
    const btnY = dy + 472;
    const btnW = 180;
    const btnH = 46;
    const isBtnSelected = this.selectedRow === 4;

    if (buttonsImg) {
      const sx = isBtnSelected ? 258 : 8;
      ctx.drawImage(buttonsImg, sx, 11, 233, 54, btnX, btnY, btnW, btnH);
    }

    ctx.font = 'bold 20px "Arial Black", Gadget, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.strokeText('Volver', btnX + btnW / 2, btnY + btnH / 2);
    ctx.fillStyle = isBtnSelected ? '#ffffff' : '#f9ca24';
    ctx.fillText('Volver', btnX + btnW / 2, btnY + btnH / 2);

    ctx.restore();
  }
}
