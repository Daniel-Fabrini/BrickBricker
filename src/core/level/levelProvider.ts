import { PROGRESSION } from '../../config/tuning';
import type { GameStyle } from '../types';
import { generateLevel } from './generator';
import { buildSpecialLevel, specialDesignsFor } from './specialLevels';
import type { LevelDefinition } from './types';

/** Seed used for Progression so level N is always the same layout (fair, reproducible checkpoints). */
export const PROGRESSION_SEED = 20251017;

export function isSpecialLevelNumber(level: number): boolean {
  return level > 0 && level % PROGRESSION.specialLevelInterval === 0;
}

export function isCheckpointLevel(level: number): boolean {
  return level > 0 && level % PROGRESSION.checkpointInterval === 0;
}

const cache = new Map<string, LevelDefinition>();
const CACHE_LIMIT = 64;

/**
 * Hybrid level source: every tenth level is a hand-designed special level (cycled with variations),
 * every other level is procedurally generated and validated.
 */
export function getLevel(style: GameStyle, level: number, baseSeed: number): LevelDefinition {
  const n = Math.max(1, Math.floor(level));
  const key = `${style}:${n}:${baseSeed}`;
  const cached = cache.get(key);
  if (cached) return structuredClone(cached);

  let def: LevelDefinition;
  if (isSpecialLevelNumber(n)) {
    const designs = specialDesignsFor(style);
    const index = n / PROGRESSION.specialLevelInterval - 1;
    const design = designs[index % designs.length];
    if (!design) throw new Error(`No special level designs for ${style}`);
    def = buildSpecialLevel(design, n, Math.floor(index / designs.length));
  } else {
    def = generateLevel(style, n, baseSeed);
  }
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, def);
  return structuredClone(def);
}

/** A tiny, fixed level used by the interactive tutorial. */
export function tutorialLevel(): LevelDefinition {
  const bricks: LevelDefinition['bricks'] = [];
  for (let c = 2; c < 10; c++) {
    bricks.push({ col: c, row: 3, kind: 'standard', hp: 1 });
    bricks.push({ col: c, row: 4, kind: c === 5 || c === 6 ? 'special' : 'standard', hp: 1 });
  }
  return {
    key: 'tutorial',
    number: 1,
    style: 'classic',
    seed: 7,
    special: 'tutorial',
    rows: 6,
    bricks,
    statics: [],
    obstacles: [],
    ballSpeed: 270,
  };
}
