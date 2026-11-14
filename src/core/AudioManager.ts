import { resolveAssetUrl } from './AssetLoader';
import { GameStorage } from './Storage';

export class AudioManager {
  private currentMusic: HTMLAudioElement | null = null;
  private currentMusicPath: string | null = null;
  private isMuted: boolean = false;
  private musicMuted: boolean = false;
  private sfxMuted: boolean = false;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.6;
  private sfxCache: Map<string, HTMLAudioElement[]> = new Map();
  private userInteracted: boolean = false;

  constructor() {
    const saved = GameStorage.loadOptions();
    this.musicVolume = saved.musicVolume;
    this.sfxVolume = saved.sfxVolume;
    this.musicMuted = saved.musicMuted;
    this.sfxMuted = saved.sfxMuted;

    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.userInteracted = true;
        if (this.currentMusic && this.currentMusic.paused && !this.isMuted && !this.musicMuted) {
          this.currentMusic.play().catch(() => {});
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
  }

  public playMusic(path: string, loop: boolean = true) {
    if (typeof Audio === 'undefined') return;
    if (this.currentMusicPath === path && this.currentMusic && !this.currentMusic.paused) {
      return;
    }
    this.stopMusic();

    this.currentMusicPath = path;
    const audio = new Audio(resolveAssetUrl(path));
    audio.loop = loop;
    audio.volume = this.isMuted || this.musicMuted ? 0 : this.musicVolume;
    this.currentMusic = audio;

    if (this.userInteracted && !this.isMuted && !this.musicMuted) {
      audio.play().catch(() => {});
    }
  }

  public stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
      this.currentMusicPath = null;
    }
  }

  public playSound(path: string, volumeScale: number = 1.0) {
    if (typeof Audio === 'undefined') return;
    if (this.isMuted || this.sfxMuted) return;

    // Use a small pool of elements for rapid retriggering
    let pool = this.sfxCache.get(path);
    if (!pool) {
      pool = [];
      this.sfxCache.set(path, pool);
    }

    let audio = pool.find((a) => a.ended || a.paused);
    if (!audio) {
      audio = new Audio(resolveAssetUrl(path));
      pool.push(audio);
      if (pool.length > 8) {
        pool.shift();
      }
    }

    audio.currentTime = 0;
    audio.volume = Math.min(1.0, Math.max(0, this.sfxVolume * volumeScale));
    audio.play().catch(() => {});
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.currentMusic) {
      this.currentMusic.volume = this.isMuted || this.musicMuted ? 0 : this.musicVolume;
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMusicMute(): boolean {
    this.musicMuted = !this.musicMuted;
    if (this.currentMusic) {
      this.currentMusic.volume = this.isMuted || this.musicMuted ? 0 : this.musicVolume;
    }
    GameStorage.saveOptions({ musicMuted: this.musicMuted });
    return this.musicMuted;
  }

  public getMusicMuted(): boolean {
    return this.isMuted || this.musicMuted;
  }

  public toggleSfxMute(): boolean {
    this.sfxMuted = !this.sfxMuted;
    GameStorage.saveOptions({ sfxMuted: this.sfxMuted });
    return this.sfxMuted;
  }

  public getSfxMuted(): boolean {
    return this.isMuted || this.sfxMuted;
  }

  public setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.musicMuted = this.musicVolume === 0;
    if (this.currentMusic) {
      this.currentMusic.volume = this.isMuted || this.musicMuted ? 0 : this.musicVolume;
    }
    GameStorage.saveOptions({ musicVolume: this.musicVolume, musicMuted: this.musicMuted });
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setSfxVolume(v: number) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    this.sfxMuted = this.sfxVolume === 0;
    GameStorage.saveOptions({ sfxVolume: this.sfxVolume, sfxMuted: this.sfxMuted });
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }
}

export const audio = new AudioManager();
