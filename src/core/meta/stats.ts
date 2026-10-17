import { SPEED } from '../../config/tuning';
import type { SimEvent } from '../sim/events';
import type { GameMode, GameStyle, PowerType, ThemeId } from '../types';

/**
 * Lifetime statistics. They are updated from simulation events as they happen and are stored in
 * the same atomic save document as the unfinished session, so restoring a session can never
 * replay (and double-count) events that were already counted.
 *
 * Ball counting rule: a ball counts as "launched" when it is served from the paddle (level start
 * or after a lost life/attempt) or created by Multiball. Bounces and restored balls never count.
 */
export interface Stats {
  gamesPlayed: number;
  highScoreRuns: number;
  progressionSessions: number;
  levelsCompleted: number;
  classicLevelsCompleted: number;
  mazeLevelsCompleted: number;
  specialLevelsCompleted: number;
  mazeDynamicLevelsCompleted: number;
  attemptsFailed: number;
  livesLost: number;
  bricksDestroyed: number;
  bricksDestroyedByPower: number;
  resistantDestroyed: number;
  specialDestroyed: number;
  ballsLaunched: number;
  bestCombo: number;
  powersCollected: number;
  powersActivated: number;
  collectedByType: Record<PowerType, number>;
  activatedByType: Record<PowerType, number>;
  extraLivesCollected: number;
  checkpointsReached: number;
  recordsBroken: number;
  totalScore: number;
  playTimeSeconds: number;
  bestRally: number;
  maxSimultaneousBalls: number;
  bestPiercingKills: number;
  bestExplosionKills: number;
  flawlessLevels: number;
  lastStandClears: number;
  maxLivesHeld: number;
  overdriveDestroys: number;
  themesPlayed: ThemeId[];
}

export function emptyStats(): Stats {
  return {
    gamesPlayed: 0,
    highScoreRuns: 0,
    progressionSessions: 0,
    levelsCompleted: 0,
    classicLevelsCompleted: 0,
    mazeLevelsCompleted: 0,
    specialLevelsCompleted: 0,
    mazeDynamicLevelsCompleted: 0,
    attemptsFailed: 0,
    livesLost: 0,
    bricksDestroyed: 0,
    bricksDestroyedByPower: 0,
    resistantDestroyed: 0,
    specialDestroyed: 0,
    ballsLaunched: 0,
    bestCombo: 0,
    powersCollected: 0,
    powersActivated: 0,
    collectedByType: { multiball: 0, piercing: 0, explosion: 0 },
    activatedByType: { multiball: 0, piercing: 0, explosion: 0 },
    extraLivesCollected: 0,
    checkpointsReached: 0,
    recordsBroken: 0,
    totalScore: 0,
    playTimeSeconds: 0,
    bestRally: 0,
    maxSimultaneousBalls: 0,
    bestPiercingKills: 0,
    bestExplosionKills: 0,
    flawlessLevels: 0,
    lastStandClears: 0,
    maxLivesHeld: 0,
    overdriveDestroys: 0,
    themesPlayed: [],
  };
}

/** Context the simulation cannot know but statistics need. */
export interface StatsContext {
  mode: GameMode | 'tutorial';
  style: GameStyle;
  /** Current inactivity boost (for the "overdrive" feat). */
  boost: number;
  rally: number;
  balls: number;
}

/** Applies one simulation event to the statistics. Tutorial play is never counted. */
export function applySimEvent(stats: Stats, event: SimEvent, ctx: StatsContext): void {
  if (ctx.mode === 'tutorial') return;
  switch (event.type) {
    case 'serve':
      stats.ballsLaunched += 1;
      break;
    case 'multiball':
      stats.ballsLaunched += event.created;
      stats.maxSimultaneousBalls = Math.max(stats.maxSimultaneousBalls, event.total);
      break;
    case 'brickDestroyed':
      stats.bricksDestroyed += 1;
      if (event.cause === 'explosion' || event.cause === 'piercing') stats.bricksDestroyedByPower += 1;
      if (event.kind === 'resistant') stats.resistantDestroyed += 1;
      if (event.kind === 'special') stats.specialDestroyed += 1;
      stats.bestCombo = Math.max(stats.bestCombo, event.chain);
      stats.bestRally = Math.max(stats.bestRally, ctx.rally);
      if (ctx.boost >= SPEED.maxBoost - 1e-6) stats.overdriveDestroys += 1;
      break;
    case 'powerCaught':
      stats.powersCollected += 1;
      stats.collectedByType[event.power] += 1;
      break;
    case 'powerActivated':
      stats.powersActivated += 1;
      stats.activatedByType[event.power] += 1;
      break;
    case 'extraLifeCaught':
      if (!event.capped) stats.extraLivesCollected += 1;
      stats.maxLivesHeld = Math.max(stats.maxLivesHeld, event.lives);
      break;
    case 'piercingEnded':
      stats.bestPiercingKills = Math.max(stats.bestPiercingKills, event.kills);
      break;
    case 'explosion':
      stats.bestExplosionKills = Math.max(stats.bestExplosionKills, event.destroyed);
      break;
    case 'lifeLost':
      stats.livesLost += 1;
      break;
    case 'attemptFailed':
      stats.attemptsFailed += 1;
      break;
    default:
      break;
  }
}

export interface LevelCompletion {
  mode: GameMode;
  style: GameStyle;
  level: number;
  special: boolean;
  dynamic: boolean;
  ballsLost: number;
  lives: number | null;
}

export function applyLevelCompleted(stats: Stats, c: LevelCompletion): void {
  stats.levelsCompleted += 1;
  if (c.style === 'classic') stats.classicLevelsCompleted += 1;
  else stats.mazeLevelsCompleted += 1;
  if (c.special) stats.specialLevelsCompleted += 1;
  if (c.style === 'maze' && c.dynamic) stats.mazeDynamicLevelsCompleted += 1;
  if (c.ballsLost === 0 && c.level >= 8) stats.flawlessLevels += 1;
  if (c.mode === 'highscore' && c.lives === 1) stats.lastStandClears += 1;
}

export function noteThemePlayed(stats: Stats, theme: ThemeId): void {
  if (!stats.themesPlayed.includes(theme)) stats.themesPlayed.push(theme);
}
