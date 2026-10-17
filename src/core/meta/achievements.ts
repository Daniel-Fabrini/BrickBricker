import type { GameStyle } from '../types';
import type { Stats } from './stats';

/**
 * Achievements are derived entirely from persistent statistics and records, so they can be
 * re-evaluated at any time (after a level, a run, or a save restore) without double counting.
 * Secret achievements hide their condition until unlocked but are reachable through normal play.
 * Achievements only unlock cosmetics; they never grant score, lives or any gameplay advantage.
 */
export const ACHIEVEMENT_CATEGORIES = ['progression', 'checkpoints', 'highscore', 'bricks', 'combo', 'powers', 'maze', 'special', 'secret'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface RecordsView {
  bestHighScore: Record<GameStyle, number>;
  bestLevel: Record<GameStyle, number>;
}

export interface AchievementContext {
  stats: Stats;
  records: RecordsView;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  secret: boolean;
  target: number;
  progress(ctx: AchievementContext): number;
}

const bestLevel = (ctx: AchievementContext): number => Math.max(ctx.records.bestLevel.classic, ctx.records.bestLevel.maze);
const bestScore = (ctx: AchievementContext): number => Math.max(ctx.records.bestHighScore.classic, ctx.records.bestHighScore.maze);

function def(id: string, category: AchievementCategory, target: number, progress: (ctx: AchievementContext) => number, secret = false): AchievementDef {
  return { id, category, target, progress, secret };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  def('prog_5', 'progression', 5, bestLevel),
  def('prog_10', 'progression', 10, bestLevel),
  def('prog_25', 'progression', 25, bestLevel),
  def('prog_50', 'progression', 50, bestLevel),
  def('prog_100', 'progression', 100, bestLevel),

  def('cp_first', 'checkpoints', 1, (c) => c.stats.checkpointsReached),
  def('cp_10', 'checkpoints', 10, (c) => c.stats.checkpointsReached),

  def('hs_10k', 'highscore', 10_000, bestScore),
  def('hs_50k', 'highscore', 50_000, bestScore),
  def('hs_150k', 'highscore', 150_000, bestScore),
  def('hs_record', 'highscore', 1, (c) => c.stats.recordsBroken),

  def('bricks_500', 'bricks', 500, (c) => c.stats.bricksDestroyed),
  def('bricks_5000', 'bricks', 5_000, (c) => c.stats.bricksDestroyed),
  def('bricks_25000', 'bricks', 25_000, (c) => c.stats.bricksDestroyed),

  def('combo_10', 'combo', 10, (c) => c.stats.bestCombo),
  def('combo_25', 'combo', 25, (c) => c.stats.bestCombo),
  def('combo_50', 'combo', 50, (c) => c.stats.bestCombo),

  def('pw_multiball', 'powers', 6, (c) => c.stats.maxSimultaneousBalls),
  def('pw_piercing', 'powers', 10, (c) => c.stats.bestPiercingKills),
  def('pw_explosion', 'powers', 6, (c) => c.stats.bestExplosionKills),
  def('pw_collect_25', 'powers', 25, (c) => c.stats.powersCollected),
  def('pw_extralife', 'powers', 1, (c) => c.stats.extraLivesCollected),

  def('maze_5', 'maze', 5, (c) => c.stats.mazeLevelsCompleted),
  def('maze_25', 'maze', 25, (c) => c.stats.mazeLevelsCompleted),
  def('maze_dynamic', 'maze', 1, (c) => c.stats.mazeDynamicLevelsCompleted),

  def('special_1', 'special', 1, (c) => c.stats.specialLevelsCompleted),
  def('special_5', 'special', 5, (c) => c.stats.specialLevelsCompleted),

  def('secret_flawless', 'secret', 1, (c) => c.stats.flawlessLevels, true),
  def('secret_last_stand', 'secret', 1, (c) => c.stats.lastStandClears, true),
  def('secret_full_house', 'secret', 9, (c) => c.stats.maxLivesHeld, true),
  def('secret_ricochet', 'secret', 8, (c) => c.stats.bestRally, true),
  def('secret_overdrive', 'secret', 1, (c) => c.stats.overdriveDestroys, true),
  def('secret_two_worlds', 'secret', 2, (c) => c.stats.themesPlayed.length, true),
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Returns achievements that are now complete but not yet in `unlocked`. */
export function evaluateAchievements(ctx: AchievementContext, unlocked: readonly string[]): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.progress(ctx) >= a.target);
}

export function achievementProgress(a: AchievementDef, ctx: AchievementContext): number {
  return Math.max(0, Math.min(1, a.progress(ctx) / a.target));
}
