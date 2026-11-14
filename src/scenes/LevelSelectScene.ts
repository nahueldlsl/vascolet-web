import { InputManager } from '../core/Input';
import { audio } from '../core/AudioManager';
import { GameStorage } from '../core/Storage';
import { GameEra } from '../types';

interface LevelDef {
  id: GameEra;
  title: string;
  imgButtonKey: string;
  cardX: number;
  cardY: number;
  charSx: number;
  charSy: number;
  charSw: number;
  charSh: number;
  charPx: number;
  charPy: number;
}

export class LevelSelectScene {
  private levels: LevelDef[] = [
    {
      id: 'prehistory',
      title: '1. PREHISTORIA',
      imgButtonKey: '/assets/lang/images/seleccionar_nivel/boton_prehistoria.png',
      cardX: 42,
      cardY: 213,
      charSx: 440,
      charSy: 0,
      charSw: 248,
      charSh: 540,
      charPx: 42,
      charPy: 213,
    },
    {
      id: 'egypt',
      title: '2. EGIPTO',
      imgButtonKey: '/assets/lang/images/seleccionar_nivel/boton_egipto.png',
      cardX: 268,
      cardY: 213,
      charSx: 440,
      charSy: 0,
      charSw: 234,
      charSh: 540,
      charPx: 268,
      charPy: 213,
    },
    {
      id: 'castle',
      title: '3. CASTILLO',
      imgButtonKey: '/assets/lang/images/seleccionar_nivel/boton_castillo.png',
      cardX: 494,
      cardY: 213,
      charSx: 440,
      charSy: 0,
      charSw: 202,
      charSh: 620,
      charPx: 494,
      charPy: 119,
    },
    {
      id: 'pirates',
      title: '4. PIRATAS',
      imgButtonKey: '/assets/lang/images/seleccionar_nivel/boton_piratas.png',
      cardX: 720,
      cardY: 213,
      charSx: 440,
      charSy: 0,
      charSw: 256,
      charSh: 540,
      charPx: 720,
      charPy: 213,
    },
    {
      id: 'future',
      title: '5. EL FUTURO',
      imgButtonKey: '/assets/lang/images/seleccionar_nivel/boton_futuro.png',
      cardX: 946,
      cardY: 213,
      charSx: 440,
      charSy: 0,
      charSw: 261,
      charSh: 540,
      charPx: 946,
      charPy: 213,
    },
  ];

  public selectedIndex: number = 0;
  public unlockedLevels: number = 1;
  private inputTimer: number = 0;
  public levelCoins: Record<GameEra, number> = {
    prehistory: 0,
    egypt: 0,
    castle: 0,
    pirates: 0,
    future: 0,
  };

  constructor() {
    this.syncFromStorage();
  }

  public syncFromStorage() {
    const save = GameStorage.loadSave();
    this.unlockedLevels = save.unlockedLevels;
    this.levelCoins = { ...save.levelCoins };
    if (this.selectedIndex >= this.unlockedLevels) {
      this.selectedIndex = Math.max(0, this.unlockedLevels - 1);
    }
  }

  public isLevelUnlocked(index: number): boolean {
    return index >= 0 && index < this.unlockedLevels;
  }

  public recordCoins(era: GameEra, coins: number) {
    const save = GameStorage.recordLevelCoins(era, coins);
    this.levelCoins[era] = save.levelCoins[era];
  }

  public onEnter() {
    this.syncFromStorage();
    audio.playMusic('/assets/audio/music/andy.ogg', true);
  }

  public update(dt: number, input: InputManager): { action: string; levelId?: GameEra } | null {
    this.inputTimer += dt;
    const selectableCount = Math.max(1, Math.min(this.levels.length, this.unlockedLevels));

    if (input.isLeftJustPressed()) {
      this.selectedIndex = (this.selectedIndex - 1 + selectableCount) % selectableCount;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    } else if (input.isRightJustPressed()) {
      this.selectedIndex = (this.selectedIndex + 1) % selectableCount;
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
    }

    if (input.isSelectJustPressed() && this.isLevelUnlocked(this.selectedIndex)) {
      audio.playSound('/assets/audio/fx/powerup.ogg', 0.8);
      return { action: 'play_level', levelId: this.levels[this.selectedIndex].id };
    }

    if (input.isPauseJustPressed()) {
      return { action: 'back_to_menu' };
    }

    return null;
  }

  public handleClick(x: number, y: number): { action: string; levelId?: GameEra } | null {
    // Check if back button clicked: x: 35..175, y: 35..90
    if (x >= 35 && x <= 180 && y >= 35 && y <= 90) {
      audio.playSound('/assets/audio/fx/item.ogg', 0.4);
      return { action: 'back_to_menu' };
    }

    // Check each of the 5 era card slots (only unlocked eras can be entered)
    for (let i = 0; i < this.levels.length; i++) {
      const lvl = this.levels[i];
      if (x >= lvl.cardX && x <= lvl.cardX + 213 && y >= lvl.cardY && y <= lvl.cardY + 620) {
        if (!this.isLevelUnlocked(i)) {
          return null;
        }
        this.selectedIndex = i;
        audio.playSound('/assets/audio/fx/powerup.ogg', 0.8);
        return { action: 'play_level', levelId: lvl.id };
      }
    }

    return null;
  }

  public handleMouseMove(x: number, y: number) {
    for (let i = 0; i < this.levels.length; i++) {
      const lvl = this.levels[i];
      if (x >= lvl.cardX && x <= lvl.cardX + 213 && y >= lvl.cardY && y <= lvl.cardY + 620) {
        if (this.isLevelUnlocked(i) && this.selectedIndex !== i) {
          this.selectedIndex = i;
          audio.playSound('/assets/audio/fx/item.ogg', 0.25);
        }
        break;
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    bgImg: HTMLImageElement | undefined,
    levelButtonImages: Record<string, HTMLImageElement>,
    buttonsImg: HTMLImageElement | undefined,
    itemsImg: HTMLImageElement | undefined,
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

    // 2. Authentic "Volver" button at (35, 35)
    ctx.save();
    const backX = 35;
    const backY = 35;
    const backW = 140;
    const backH = 55;
    if (buttonsImg) {
      // Row 2 col 0: (5, 162, 138, 55)
      ctx.drawImage(buttonsImg, 5, 162, 138, 55, backX, backY, backW, backH);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(backX, backY, backW, backH, 10);
      ctx.fill();
      ctx.stroke();
    }
    ctx.font = 'bold 20px "Arial Black", Gadget, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('Volver', backX + backW / 2, backY + backH / 2 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Volver', backX + backW / 2, backY + backH / 2 + 2);
    ctx.restore();

    // 3. Render 5 Era Cards matching background artwork + "0 / 100" coin counters
    this.levels.forEach((lvl, i) => {
      const unlocked = this.isLevelUnlocked(i);
      const isSelected = unlocked && i === this.selectedIndex;
      const btnImg = levelButtonImages[lvl.imgButtonKey];

      if (!btnImg) return;

      ctx.save();
      if (!unlocked) {
        // Dim locked era cards so progressive unlocking is visually clear
        ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
        ctx.beginPath();
        ctx.roundRect(lvl.cardX, lvl.cardY, 213, 534, 12);
        ctx.fill();
      } else if (isSelected) {
        // Draw active glowing card frame: (223, 3, 213, 534) at (cardX, cardY)
        ctx.drawImage(btnImg, 223, 3, 213, 534, lvl.cardX, lvl.cardY, 213, 534);

        // Draw full-color character illustration on top at exact anchor (charPx, charPy)
        ctx.drawImage(
          btnImg,
          lvl.charSx,
          lvl.charSy,
          lvl.charSw,
          lvl.charSh,
          lvl.charPx,
          lvl.charPy,
          lvl.charSw,
          lvl.charSh
        );
      }

      // Authentic Coin Counter ("0 / 100") below each card's era year plaque
      const coins = this.levelCoins[lvl.id] || 0;
      const counterY = lvl.cardY + 534 + 78;
      const centerX = lvl.cardX + 213 / 2;

      if (itemsImg) {
        // Coin icon from items.png (532, 0, 76, 76)
        ctx.drawImage(itemsImg, 532, 0, 76, 76, centerX - 75, counterY - 20, 36, 36);
      }

      ctx.font = 'bold 22px "Arial Black", Gadget, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(`${coins} / 100`, centerX - 32, counterY);
      ctx.fillStyle = isSelected ? '#f1c40f' : '#ffffff';
      ctx.fillText(`${coins} / 100`, centerX - 32, counterY);

      ctx.restore();
    });
  }
}

