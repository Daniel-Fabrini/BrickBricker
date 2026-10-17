import type { ControlMode } from '../core/input';
import { DEFAULT_COSMETICS, defaultUnlockedCosmetics, type CosmeticSelection } from '../core/meta/cosmetics';
import { emptyStats, type Stats } from '../core/meta/stats';
import type { RunState } from '../core/run/run';
import type { SimState } from '../core/sim/state';
import type { GameStyle, InventorySlots, ThemeId } from '../core/types';

/** Versioned save document. Everything is stored in ONE document so writes are atomic. */
export const SAVE_VERSION = 1;

export const LANGUAGES = ['en', 'es', 'pt-BR'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export interface Settings {
  language: LanguageCode;
  theme: ThemeId;
  style: GameStyle;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  controlMode: ControlMode;
  controlAssist: boolean;
  ballVisibility: boolean;
  tolerantControl: boolean;
  reducedEffects: boolean;
  haptics: boolean;
}

export interface CheckpointRecord {
  inventory: InventorySlots;
  score: number;
}

export interface ProgressionRecord {
  /** Highest level number reached (started) in this style. */
  bestLevel: number;
  /** Highest completed checkpoint milestone (0 = none). */
  highestCheckpoint: number;
  /** Snapshot stored when each milestone was last reached, keyed by milestone level. */
  checkpoints: Record<string, CheckpointRecord>;
}

export interface HighScoreRecord {
  score: number;
  level: number;
  date: number;
}

export interface Profile {
  createdAt: number;
  tutorialDone: boolean;
  /** True once the first-launch flow (language detection + tutorial offer) has run. */
  onboarded: boolean;
  highScores: Record<GameStyle, HighScoreRecord>;
  progression: Record<GameStyle, ProgressionRecord>;
  stats: Stats;
  /** Unlocked achievement id -> unlock timestamp. */
  achievements: Record<string, number>;
  cosmetics: {
    unlocked: string[];
    selected: CosmeticSelection;
  };
}

/** An unfinished game. `sim` is null when the run is between levels. */
export interface SessionSnapshot {
  version: 1;
  run: RunState;
  sim: SimState | null;
  savedAt: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: number;
  settings: Settings;
  profile: Profile;
  session: SessionSnapshot | null;
}

export function defaultSettings(language: LanguageCode = 'en'): Settings {
  return {
    language,
    theme: 'neon',
    style: 'classic',
    musicVolume: 0.6,
    sfxVolume: 0.8,
    musicEnabled: true,
    sfxEnabled: true,
    controlMode: 'direct',
    controlAssist: true,
    ballVisibility: false,
    tolerantControl: false,
    reducedEffects: false,
    haptics: true,
  };
}

export function emptyProgressionRecord(): ProgressionRecord {
  return { bestLevel: 0, highestCheckpoint: 0, checkpoints: {} };
}

export function defaultProfile(now: number = Date.now()): Profile {
  return {
    createdAt: now,
    tutorialDone: false,
    onboarded: false,
    highScores: {
      classic: { score: 0, level: 0, date: 0 },
      maze: { score: 0, level: 0, date: 0 },
    },
    progression: { classic: emptyProgressionRecord(), maze: emptyProgressionRecord() },
    stats: emptyStats(),
    achievements: {},
    cosmetics: { unlocked: defaultUnlockedCosmetics(), selected: { ...DEFAULT_COSMETICS } },
  };
}

export function defaultSaveData(language: LanguageCode = 'en', now: number = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    settings: defaultSettings(language),
    profile: defaultProfile(now),
    session: null,
  };
}
