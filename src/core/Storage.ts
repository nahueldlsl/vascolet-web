import { GameEra } from '../types';

export const ERA_ORDER: GameEra[] = ['prehistory', 'egypt', 'castle', 'pirates', 'future'];

const SAVE_KEY = 'vascolet_web_save_v1';
const OPTIONS_KEY = 'vascolet_web_options_v1';

export interface SaveData {
  unlockedLevels: number;
  levelCoins: Record<GameEra, number>;
  storySeen: boolean;
}

export interface OptionsData {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  stretchScreen: boolean;
}

function getStorage(): globalThis.Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return null;
}

export function defaultSaveData(): SaveData {
  return {
    unlockedLevels: 1,
    levelCoins: {
      prehistory: 0,
      egypt: 0,
      castle: 0,
      pirates: 0,
      future: 0,
    },
    storySeen: false,
  };
}

export function defaultOptionsData(): OptionsData {
  return {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    musicMuted: false,
    sfxMuted: false,
    stretchScreen: false,
  };
}

export class GameStorage {
  public static loadSave(): SaveData {
    const defaults = defaultSaveData();
    const store = getStorage();
    if (!store) return defaults;

    try {
      const raw = store.getItem(SAVE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const unlocked =
        typeof parsed.unlockedLevels === 'number'
          ? Math.max(1, Math.min(ERA_ORDER.length, Math.floor(parsed.unlockedLevels)))
          : 1;
      const coins = { ...defaults.levelCoins };
      if (parsed.levelCoins && typeof parsed.levelCoins === 'object') {
        for (const era of ERA_ORDER) {
          const val = (parsed.levelCoins as Record<string, unknown>)[era];
          if (typeof val === 'number' && !isNaN(val)) {
            coins[era] = Math.max(0, Math.min(100, Math.floor(val)));
          }
        }
      }
      return {
        unlockedLevels: unlocked,
        levelCoins: coins,
        storySeen: Boolean(parsed.storySeen),
      };
    } catch {
      return defaults;
    }
  }

  public static saveProgress(data: SaveData): void {
    const store = getStorage();
    if (!store) return;
    try {
      store.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota/storage errors
    }
  }

  public static recordLevelCoins(era: GameEra, coins: number): SaveData {
    const save = this.loadSave();
    const clamped = Math.max(0, Math.min(100, Math.floor(coins)));
    if (clamped > (save.levelCoins[era] || 0)) {
      save.levelCoins[era] = clamped;
      this.saveProgress(save);
    }
    return save;
  }

  public static unlockNextLevel(completedEra: GameEra): SaveData {
    const save = this.loadSave();
    const idx = ERA_ORDER.indexOf(completedEra);
    if (idx >= 0) {
      const targetUnlocked = Math.min(ERA_ORDER.length, idx + 2);
      if (targetUnlocked > save.unlockedLevels) {
        save.unlockedLevels = targetUnlocked;
        this.saveProgress(save);
      }
    }
    return save;
  }

  public static markStorySeen(): SaveData {
    const save = this.loadSave();
    if (!save.storySeen) {
      save.storySeen = true;
      this.saveProgress(save);
    }
    return save;
  }

  public static loadOptions(): OptionsData {
    const defaults = defaultOptionsData();
    const store = getStorage();
    if (!store) return defaults;

    try {
      const raw = store.getItem(OPTIONS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<OptionsData>;
      return {
        musicVolume:
          typeof parsed.musicVolume === 'number' && !isNaN(parsed.musicVolume)
            ? Math.max(0, Math.min(1, parsed.musicVolume))
            : defaults.musicVolume,
        sfxVolume:
          typeof parsed.sfxVolume === 'number' && !isNaN(parsed.sfxVolume)
            ? Math.max(0, Math.min(1, parsed.sfxVolume))
            : defaults.sfxVolume,
        musicMuted: Boolean(parsed.musicMuted),
        sfxMuted: Boolean(parsed.sfxMuted),
        stretchScreen: Boolean(parsed.stretchScreen),
      };
    } catch {
      return defaults;
    }
  }

  public static saveOptions(opts: Partial<OptionsData>): OptionsData {
    const current = this.loadOptions();
    const merged: OptionsData = {
      ...current,
      ...opts,
    };
    const store = getStorage();
    if (store) {
      try {
        store.setItem(OPTIONS_KEY, JSON.stringify(merged));
      } catch {
        // Ignore quota/storage errors
      }
    }
    return merged;
  }
}
