import { LIVES, PROGRESSION } from '../../config/tuning';
import { getLevel, isCheckpointLevel, isSpecialLevelNumber, PROGRESSION_SEED } from '../level/levelProvider';
import type { LevelDefinition } from '../level/types';
import { hashSeed } from '../rng';
import { emptyInventory, normalizeInventory } from '../sim/inventory';
import { GameSimulation } from '../sim/simulation';
import type { GameMode, GameStyle, InventorySlots } from '../types';

/**
 * Rules that span several levels: lives (High Score), checkpoints (Progression), carried-over
 * score and inventory.
 *
 * Inventory rules:
 *  - Both stored powers carry over when a level is completed (in both modes).
 *  - High Score: the inventory survives lost lives and is cleared only when a new run starts.
 *  - Progression: a failed attempt restores the inventory saved with the active checkpoint
 *    (empty before the first checkpoint). Starting a new Progression session uses the inventory of
 *    the checkpoint it starts from.
 *
 * Checkpoint rule: completing level 5k (k >= 1) records { level: 5k, inventory, score } and the
 * player resumes from level 5k + 1. Before any checkpoint the resume point is level 1.
 */

export interface CheckpointState {
  /** Completed milestone level (0 = no checkpoint yet; resume at level 1). */
  level: number;
  inventory: InventorySlots;
  score: number;
}

export interface RunState {
  version: 1;
  mode: GameMode;
  style: GameStyle;
  /** Seed for procedural levels: fixed for Progression, random per High Score run. */
  seed: number;
  level: number;
  score: number;
  lives: number | null;
  inventory: InventorySlots;
  checkpoint: CheckpointState;
  attempt: number;
  levelsCompleted: number;
  specialLevelsCompleted: number;
  checkpointsReached: number;
  bricksDestroyed: number;
  bestCombo: number;
  ballsLost: number;
  powersUsed: number;
  playTime: number;
  startedAt: number;
}

export function newProgressionRun(style: GameStyle, from: CheckpointState | null, now: number = Date.now()): RunState {
  const checkpoint: CheckpointState = from
    ? { level: from.level, inventory: normalizeInventory(from.inventory), score: Math.max(0, from.score) }
    : { level: 0, inventory: emptyInventory(), score: 0 };
  return {
    version: 1,
    mode: 'progression',
    style,
    seed: PROGRESSION_SEED,
    level: checkpoint.level + 1,
    score: checkpoint.score,
    lives: null,
    inventory: normalizeInventory(checkpoint.inventory),
    checkpoint,
    attempt: 0,
    levelsCompleted: 0,
    specialLevelsCompleted: 0,
    checkpointsReached: 0,
    bricksDestroyed: 0,
    bestCombo: 0,
    ballsLost: 0,
    powersUsed: 0,
    playTime: 0,
    startedAt: now,
  };
}

export function newHighScoreRun(style: GameStyle, seed: number, now: number = Date.now()): RunState {
  return {
    version: 1,
    mode: 'highscore',
    style,
    seed: seed >>> 0,
    level: 1,
    score: 0,
    lives: LIVES.highScoreStart,
    inventory: emptyInventory(),
    checkpoint: { level: 0, inventory: emptyInventory(), score: 0 },
    attempt: 0,
    levelsCompleted: 0,
    specialLevelsCompleted: 0,
    checkpointsReached: 0,
    bricksDestroyed: 0,
    bestCombo: 0,
    ballsLost: 0,
    powersUsed: 0,
    playTime: 0,
    startedAt: now,
  };
}

export function levelForRun(run: RunState): LevelDefinition {
  return getLevel(run.style, run.level, run.seed);
}

/** Creates the simulation for the run's current level using the carried-over state. */
export function createLevelSimulation(run: RunState, paddleResponse?: number): GameSimulation {
  const level = levelForRun(run);
  return GameSimulation.create({
    level,
    mode: run.mode,
    lives: run.lives,
    inventory: run.inventory,
    score: run.score,
    seed: hashSeed('sim', level.seed, run.attempt, run.seed),
    paddleResponse,
  });
}

export interface LevelCompleteResult {
  completedLevel: number;
  special: boolean;
  checkpoint: CheckpointState | null;
}

/** Carries score, lives and both inventory slots into the next level and records checkpoints. */
export function applyLevelComplete(run: RunState, sim: GameSimulation): LevelCompleteResult {
  const s = sim.state;
  const completedLevel = run.level;
  run.score = s.score;
  run.lives = s.lives;
  run.inventory = normalizeInventory(s.inventory);
  run.levelsCompleted += 1;
  run.bricksDestroyed += s.counters.bricksDestroyed;
  run.bestCombo = Math.max(run.bestCombo, s.combo.best);
  run.ballsLost += s.counters.ballsLost;
  run.powersUsed += s.counters.powersActivated;
  const special = isSpecialLevelNumber(completedLevel);
  if (special) run.specialLevelsCompleted += 1;
  run.level = completedLevel + 1;
  run.attempt = 0;

  let checkpoint: CheckpointState | null = null;
  if (run.mode === 'progression' && isCheckpointLevel(completedLevel)) {
    checkpoint = { level: completedLevel, inventory: normalizeInventory(run.inventory), score: run.score };
    run.checkpoint = checkpoint;
    run.checkpointsReached += 1;
  }
  return { completedLevel, special, checkpoint };
}

/** Progression: the last ball was lost before the level was cleared. Restore the checkpoint state. */
export function applyAttemptFailed(run: RunState, sim: GameSimulation): void {
  if (run.mode !== 'progression') throw new Error('applyAttemptFailed is only valid in Progression');
  const s = sim.state;
  run.bricksDestroyed += s.counters.bricksDestroyed;
  run.bestCombo = Math.max(run.bestCombo, s.combo.best);
  run.ballsLost += s.counters.ballsLost;
  run.powersUsed += s.counters.powersActivated;
  run.level = run.checkpoint.level + 1;
  run.score = run.checkpoint.score;
  run.inventory = normalizeInventory(run.checkpoint.inventory);
  run.attempt += 1;
}

/** High Score: the run is over (all lives used). Folds the last level's counters into the run. */
export function applyRunOver(run: RunState, sim: GameSimulation): void {
  const s = sim.state;
  run.score = s.score;
  run.lives = 0;
  run.bricksDestroyed += s.counters.bricksDestroyed;
  run.bestCombo = Math.max(run.bestCombo, s.combo.best);
  run.ballsLost += s.counters.ballsLost;
  run.powersUsed += s.counters.powersActivated;
}

/** Milestones the player may start a Progression session from (0 = level 1). */
export function checkpointMilestones(highestCheckpoint: number): number[] {
  const out = [0];
  for (let m = PROGRESSION.checkpointInterval; m <= highestCheckpoint; m += PROGRESSION.checkpointInterval) out.push(m);
  return out;
}
