import type { AudioEngine } from '../audio/AudioEngine';
import type { SfxName } from '../audio/sfx';
import type { CollectibleKind, GameMode } from '../core/types';
import type { LanguageCode, SaveData, Settings } from '../persistence/schema';
import type { UIManager } from '../ui/UIManager';

/** The surface screens use to talk to the application. Keeps UI code free of game wiring. */
export interface AppApi {
  readonly data: SaveData;
  readonly audio: AudioEngine;
  readonly ui: UIManager;
  readonly version: string;

  showMainMenu(): void;
  openSettings(): void;
  openStats(): void;
  openAchievements(): void;
  openCollection(): void;
  openLanguagePicker(): void;

  requestStart(mode: GameMode): void;
  startProgression(milestone: number): void;
  startHighScore(): void;
  continueSession(): void;
  abandonSession(): void;
  resumeGame(): void;
  pauseGame(): void;
  quitToMenu(): void;
  nextLevel(): void;
  playAgain(): void;
  activatePower(slot: number): void;

  updateSettings(patch: Partial<Settings>): void;
  setLanguage(lang: LanguageCode): void;
  equipCosmetic(id: string): void;
  startTutorial(): void;
  finishTutorial(skipped: boolean): void;

  sound(name: SfxName): void;
  powerIcon(kind: CollectibleKind): string;
  cosmeticPreview(id: string): string;
}
