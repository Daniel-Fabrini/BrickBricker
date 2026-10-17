import { cosmeticsUnlockedBy } from '../core/meta/cosmetics';
import { evaluateAchievements, type AchievementContext, type AchievementDef } from '../core/meta/achievements';
import type { CheckpointState } from '../core/run/run';
import { normalizeInventory } from '../core/sim/inventory';
import type { GameStyle } from '../core/types';
import type { Profile } from '../persistence/schema';

/** Profile mutations shared by gameplay sessions. Pure functions over the save document. */

export function recordLevelReached(profile: Profile, style: GameStyle, level: number): void {
  const p = profile.progression[style];
  p.bestLevel = Math.max(p.bestLevel, level);
}

export function recordCheckpoint(profile: Profile, style: GameStyle, checkpoint: CheckpointState): void {
  const p = profile.progression[style];
  p.highestCheckpoint = Math.max(p.highestCheckpoint, checkpoint.level);
  p.checkpoints[String(checkpoint.level)] = { inventory: normalizeInventory(checkpoint.inventory), score: checkpoint.score };
  p.bestLevel = Math.max(p.bestLevel, checkpoint.level + 1);
}

/** The checkpoint state a new Progression session starts from (milestone 0 = level 1). */
export function checkpointForMilestone(profile: Profile, style: GameStyle, milestone: number): CheckpointState | null {
  if (milestone <= 0) return null;
  const p = profile.progression[style];
  if (milestone > p.highestCheckpoint || milestone % 5 !== 0) return null;
  const saved = p.checkpoints[String(milestone)];
  return { level: milestone, inventory: normalizeInventory(saved?.inventory), score: saved?.score ?? 0 };
}

export interface HighScoreResult {
  isNewRecord: boolean;
  previous: number;
}

export function recordHighScore(profile: Profile, style: GameStyle, score: number, level: number, now: number): HighScoreResult {
  const current = profile.highScores[style];
  const previous = current.score;
  const isNewRecord = score > previous;
  if (isNewRecord) {
    profile.highScores[style] = { score, level, date: now };
    if (previous > 0) profile.stats.recordsBroken += 1;
  }
  return { isNewRecord, previous };
}

export interface Live {
  style: GameStyle;
  highScore: number;
  level: number;
}

export function achievementContext(profile: Profile, live?: Live): AchievementContext {
  const bestHighScore = { classic: profile.highScores.classic.score, maze: profile.highScores.maze.score };
  const bestLevel = { classic: profile.progression.classic.bestLevel, maze: profile.progression.maze.bestLevel };
  if (live) {
    bestHighScore[live.style] = Math.max(bestHighScore[live.style], live.highScore);
    bestLevel[live.style] = Math.max(bestLevel[live.style], live.level);
  }
  return { stats: profile.stats, records: { bestHighScore, bestLevel } };
}

export interface UnlockResult {
  achievements: AchievementDef[];
  cosmetics: string[];
}

/** Unlocks newly completed achievements and the cosmetics they reward. Idempotent. */
export function unlockAchievements(profile: Profile, now: number, live?: Live): UnlockResult {
  const fresh = evaluateAchievements(achievementContext(profile, live), Object.keys(profile.achievements));
  const cosmetics: string[] = [];
  for (const a of fresh) {
    profile.achievements[a.id] = now;
    for (const c of cosmeticsUnlockedBy(a.id)) {
      if (!profile.cosmetics.unlocked.includes(c.id)) {
        profile.cosmetics.unlocked.push(c.id);
        cosmetics.push(c.id);
      }
    }
  }
  return { achievements: fresh, cosmetics };
}
