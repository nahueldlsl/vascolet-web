import { assets } from './core/AssetLoader';
import { audio } from './core/AudioManager';
import { InputManager } from './core/Input';
import { GameEra } from './types';
import { MenuScene } from './scenes/MenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { CutsceneScene } from './scenes/CutsceneScene';

type ActiveState = 'MENU' | 'LEVEL_SELECT' | 'STORY' | 'HELP' | 'CREDITS' | 'LEVEL_INTRO' | 'GAME' | 'GAME_OVER' | 'VICTORY';

const ERA_INTRO_IMAGES: Record<GameEra, string> = {
  prehistory: '/assets/lang/images/intros/intro_prehistoria.jpg',
  egypt: '/assets/lang/images/intros/intro_egipto.jpg',
  castle: '/assets/lang/images/intros/intro_castillo.jpg',
  pirates: '/assets/lang/images/intros/intro_pirata.jpg',
  future: '/assets/lang/images/intros/intro_futuro.jpg',
};

class GameApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;

  public state: ActiveState = 'MENU';
  public currentEra: GameEra = 'prehistory';
  private pendingScore: number = 0;
  private pendingLives: number = 10;

  public menuScene: MenuScene = new MenuScene();
  public levelSelectScene: LevelSelectScene = new LevelSelectScene();
  public gameScene: GameScene = new GameScene();
  public cutsceneScene: CutsceneScene = new CutsceneScene();

  private lastTime: number = 0;
  private bgMenuImg?: HTMLImageElement;
  private buttonsImg?: HTMLImageElement;
  private opcionesImg?: HTMLImageElement;
  private itemsImg?: HTMLImageElement;
  private bgLevelSelectImg?: HTMLImageElement;
  private levelButtonImgs: Record<string, HTMLImageElement> = {};
  private cutsceneImages: Record<string, HTMLImageElement> = {};

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.input = new InputManager();

    this.setupListeners();
    (window as any).game = this;
  }

  public async showLevelIntro(era: GameEra, score: number = 0, lives: number = 10) {
    this.currentEra = era;
    this.pendingScore = score;
    this.pendingLives = lives;
    const introImg = ERA_INTRO_IMAGES[era];
    this.cutsceneScene.setup([introImg], 'enter_loaded_level');
    this.state = 'LEVEL_INTRO';
  }

  public async startLevel(era: GameEra, score: number = 0, lives: number = 10) {
    this.currentEra = era;
    this.renderLoading(`Cargando ${era.toUpperCase()}...`);
    await this.gameScene.loadLevel(era, score, lives);
    this.state = 'GAME';
  }

  public async init() {
    // Show loading indicator
    this.renderLoading('Cargando recursos del juego...');

    try {
      // Preload UI images
      this.bgMenuImg = await assets.loadImage('/assets/images/menuElements/menu.jpg');
      this.buttonsImg = await assets.loadImage('/assets/images/menuElements/buttons_tile.png');
      this.opcionesImg = await assets.loadImage('/assets/images/menuElements/opciones_tile.png');
      this.itemsImg = await assets.loadImage('/assets/images/menuElements/items.png');
      this.bgLevelSelectImg = await assets.loadImage('/assets/lang/images/seleccionar_nivel/fondo_seleccionar_nivel.jpg');

      const btnPaths = [
        '/assets/lang/images/seleccionar_nivel/boton_prehistoria.png',
        '/assets/lang/images/seleccionar_nivel/boton_egipto.png',
        '/assets/lang/images/seleccionar_nivel/boton_castillo.png',
        '/assets/lang/images/seleccionar_nivel/boton_piratas.png',
        '/assets/lang/images/seleccionar_nivel/boton_futuro.png',
      ];
      for (const p of btnPaths) {
        this.levelButtonImgs[p] = await assets.loadImage(p);
      }

      const cutscenePaths = [
        '/assets/lang/images/menu/press_any_key.png',
        '/assets/lang/images/intros/intro_page1.jpg',
        '/assets/lang/images/intros/intro_page2.jpg',
        '/assets/lang/images/intros/intro_page3.jpg',
        '/assets/lang/images/intros/intro_page4.jpg',
        '/assets/lang/images/intros/intro_prehistoria.jpg',
        '/assets/lang/images/intros/intro_egipto.jpg',
        '/assets/lang/images/intros/intro_castillo.jpg',
        '/assets/lang/images/intros/intro_pirata.jpg',
        '/assets/lang/images/intros/intro_futuro.jpg',
        '/assets/lang/images/intros/perdiste.jpg',
        '/assets/lang/images/intros/fin.jpg',
        '/assets/lang/images/credits/creditos.jpg',
        '/assets/lang/images/help/ayuda.jpg',
      ];
      for (const p of cutscenePaths) {
        this.cutsceneImages[p] = await assets.loadImage(p);
      }

      this.menuScene.onEnter();
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    } catch (e) {
      console.error(e);
      this.renderLoading('Error al cargar recursos. Revisa la consola.');
    }
  }

  private setupListeners() {
    // Window resize
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();

    // Canvas click
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      if (this.state === 'MENU') {
        const action = this.menuScene.handleClick(x, y, this.canvas.width, this.canvas.height);
        if (action) this.handleSceneAction(action);
      } else if (this.state === 'LEVEL_SELECT') {
        const res = this.levelSelectScene.handleClick(x, y);
        if (res) {
          if (res.action === 'play_level' && res.levelId) {
            this.showLevelIntro(res.levelId, 0, 10);
          } else if (res.action === 'back_to_menu') {
            this.state = 'MENU';
            this.menuScene.onEnter();
          }
        }
      } else if (this.state === 'GAME') {
        const res = this.gameScene.handleClick(x, y, this.canvas.width, this.canvas.height);
        if (res === 'quit_to_menu') {
          this.state = 'LEVEL_SELECT';
          this.levelSelectScene.onEnter();
        }
      } else if (['STORY', 'HELP', 'CREDITS', 'LEVEL_INTRO', 'GAME_OVER', 'VICTORY'].includes(this.state)) {
        const nextAction = this.cutsceneScene.handleClick();
        if (nextAction) this.handleSceneAction(nextAction);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      if (this.state === 'MENU') {
        this.menuScene.handleMouseMove(x, y);
      } else if (this.state === 'LEVEL_SELECT') {
        this.levelSelectScene.handleMouseMove(x, y);
      } else if (this.state === 'GAME') {
        this.gameScene.handleMouseMove(x, y, this.canvas.width, this.canvas.height);
      }
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        audio.toggleMute();
      } else if (e.code === 'KeyF') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    });

    // Touch controls mapping
    const bindTouch = (id: string, btnName: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const set = (active: boolean) => (e: Event) => {
        e.preventDefault();
        this.input.setVirtualButton(btnName, active);
      };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('pointerleave', set(false));
    };

    bindTouch('btn-left', 'left');
    bindTouch('btn-right', 'right');
    bindTouch('btn-up', 'up');
    bindTouch('btn-down', 'down');
    bindTouch('btn-jump', 'jump');
    bindTouch('btn-action', 'action');
    bindTouch('btn-pause', 'pause');
  }

  private resizeCanvas() {
    // Keep 4:3 aspect ratio (1200x900 native OLPC XO-1 resolution)
    const container = document.getElementById('game-container');
    if (!container) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const targetRatio = 1200 / 900;

    let w = winW;
    let h = winW / targetRatio;

    if (h > winH) {
      h = winH;
      w = winH * targetRatio;
    }

    this.canvas.style.width = `${Math.floor(w)}px`;
    this.canvas.style.height = `${Math.floor(h)}px`;
  }

  private handleSceneAction(action: string) {
    if (action === 'start_game') {
      this.showLevelIntro('prehistory', 0, 10);
    } else if (action === 'enter_loaded_level') {
      this.startLevel(this.currentEra, this.pendingScore, this.pendingLives);
    } else if (action === 'level_select') {
      this.state = 'LEVEL_SELECT';
      this.levelSelectScene.onEnter();
    } else if (action === 'story') {
      this.cutsceneScene.setup(
        [
          '/assets/lang/images/intros/intro_page1.jpg',
          '/assets/lang/images/intros/intro_page2.jpg',
          '/assets/lang/images/intros/intro_page3.jpg',
          '/assets/lang/images/intros/intro_page4.jpg',
        ],
        'level_select'
      );
      this.state = 'STORY';
    } else if (action === 'help') {
      this.cutsceneScene.setup(['/assets/lang/images/help/ayuda.jpg'], 'menu');
      this.state = 'HELP';
    } else if (action === 'credits') {
      this.cutsceneScene.setup(['/assets/lang/images/credits/creditos.jpg'], 'menu');
      this.state = 'CREDITS';
    } else if (action === 'menu') {
      this.state = 'MENU';
      this.menuScene.onEnter();
    }
  }

  private loop(timestamp: number) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    this.input.update();
    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    switch (this.state) {
      case 'MENU': {
        const action = this.menuScene.update(dt, this.input);
        if (action) this.handleSceneAction(action);
        break;
      }
      case 'LEVEL_SELECT': {
        const res = this.levelSelectScene.update(dt, this.input);
        if (res) {
          if (res.action === 'play_level' && res.levelId) {
            this.showLevelIntro(res.levelId, 0, 10);
          } else if (res.action === 'back_to_menu') {
            this.state = 'MENU';
            this.menuScene.onEnter();
          }
        }
        break;
      }
      case 'GAME': {
        const result = this.gameScene.update(dt, this.input);
        if (this.gameScene.player) {
          this.levelSelectScene.recordCoins(this.currentEra, this.gameScene.player.coins);
        }
        if (result === 'quit_to_menu') {
          this.state = 'LEVEL_SELECT';
          this.levelSelectScene.onEnter();
        } else if (result === 'game_over') {
          this.cutsceneScene.setup(['/assets/lang/images/intros/perdiste.jpg'], 'menu');
          this.state = 'GAME_OVER';
        } else if (result === 'level_completed') {
          const eras: GameEra[] = ['prehistory', 'egypt', 'castle', 'pirates', 'future'];
          const currentIndex = eras.indexOf(this.currentEra);
          if (currentIndex < eras.length - 1) {
            const nextEra = eras[currentIndex + 1];
            this.showLevelIntro(nextEra, this.gameScene.player.score, this.gameScene.player.lives);
          } else {
            this.cutsceneScene.setup(['/assets/lang/images/intros/fin.jpg'], 'menu');
            this.state = 'VICTORY';
          }
        }
        break;
      }
      case 'STORY':
      case 'HELP':
      case 'CREDITS':
      case 'LEVEL_INTRO':
      case 'GAME_OVER':
      case 'VICTORY': {
        const nextAction = this.cutsceneScene.update(dt, this.input);
        if (nextAction) this.handleSceneAction(nextAction);
        break;
      }
    }
  }

  private render() {
    const { width, height } = this.canvas;

    switch (this.state) {
      case 'MENU':
        this.menuScene.render(this.ctx, this.bgMenuImg, this.buttonsImg, this.opcionesImg, width, height);
        break;
      case 'LEVEL_SELECT':
        this.levelSelectScene.render(
          this.ctx,
          this.bgLevelSelectImg,
          this.levelButtonImgs,
          this.buttonsImg,
          this.itemsImg,
          width,
          height
        );
        break;
      case 'GAME':
        this.gameScene.render(this.ctx, width, height);
        break;
      case 'STORY':
      case 'HELP':
      case 'CREDITS':
      case 'LEVEL_INTRO':
      case 'GAME_OVER':
      case 'VICTORY':
        this.cutsceneScene.render(this.ctx, this.cutsceneImages, width, height);
        break;
    }
  }

  private renderLoading(msg: string) {
    this.ctx.fillStyle = '#0a0a14';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.font = 'bold 24px monospace';
    this.ctx.fillStyle = '#f1c40f';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(msg, this.canvas.width / 2, this.canvas.height / 2);
  }
}

// Start game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new GameApp();
  app.init();
});
