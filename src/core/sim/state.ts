import type { LevelDefinition } from '../level/types';
import type { BrickKind, CollectibleKind, GameMode, InventorySlots, StaticKind } from '../types';

/**
 * The complete, JSON-serialisable state of one level being played. Snapshots of this structure are
 * what the save system stores for "Continue", so everything needed to resume exactly lives here.
 */

export type SimPhase = 'serving' | 'playing' | 'complete' | 'failed' | 'gameOver';

export interface BallState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Position at the start of the last fixed step (for render interpolation). */
  px: number;
  py: number;
  /** Bricks currently being passed through while piercing (each is damaged once per pass). */
  pierced: number[];
  /** Seconds since this ball last touched the paddle or damaged a brick. */
  idle: number;
  /** Seconds of continuous deep overlap with solids (stuck rescue). */
  stuck: number;
}

export interface PaddleState {
  x: number;
  px: number;
  targetX: number;
  /** Follow rate (1/s); the tolerant-control option lowers it. Input tuning only. */
  response: number;
}

export interface BrickState {
  id: number;
  col: number;
  row: number;
  kind: BrickKind;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface StaticState {
  col: number;
  row: number;
  kind: StaticKind;
}

export interface GateState {
  index: number;
  solid: boolean;
}

export interface CollectibleState {
  id: number;
  kind: CollectibleKind;
  x: number;
  y: number;
  py: number;
}

export interface ComboState {
  chain: number;
  timer: number;
  best: number;
}

export interface SpeedState {
  inactivity: number;
  boost: number;
}

export interface EffectsState {
  piercingTime: number;
  explosiveCharges: number;
  /** Bricks destroyed by the current piercing activation (for achievements). */
  piercingKills: number;
}

/** Per-level counters, reported on the level summary and used for achievements. */
export interface LevelCounters {
  bricksDestroyed: number;
  ballsLaunched: number;
  ballsLost: number;
  livesLost: number;
  powersCollected: number;
  powersActivated: number;
  maxSimultaneousBalls: number;
  /** Bricks destroyed since the last paddle contact (best value in this level). */
  bestRally: number;
  rally: number;
  extraLivesCollected: number;
}

export interface SimState {
  version: 1;
  mode: GameMode | 'tutorial';
  level: LevelDefinition;
  phase: SimPhase;
  time: number;
  serveTimer: number;
  /** Horizontal offset of the served ball relative to the paddle centre. */
  serveOffset: number;
  levelSpeed: number;
  balls: BallState[];
  paddle: PaddleState;
  bricks: BrickState[];
  statics: StaticState[];
  gates: GateState[];
  collectibles: CollectibleState[];
  inventory: InventorySlots;
  effects: EffectsState;
  combo: ComboState;
  speed: SpeedState;
  /** Recent destruction timestamps used for burst bonuses. */
  recentDestroys: number[];
  score: number;
  lives: number | null;
  maxLives: number | null;
  destructibleRemaining: number;
  extraLifeDrops: number;
  rngState: number;
  nextId: number;
  counters: LevelCounters;
}

export function emptyCounters(): LevelCounters {
  return {
    bricksDestroyed: 0,
    ballsLaunched: 0,
    ballsLost: 0,
    livesLost: 0,
    powersCollected: 0,
    powersActivated: 0,
    maxSimultaneousBalls: 0,
    bestRally: 0,
    rally: 0,
    extraLivesCollected: 0,
  };
}
