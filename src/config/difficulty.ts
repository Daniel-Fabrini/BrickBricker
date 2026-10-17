import type { GameStyle } from '../core/types';

/**
 * Level-difficulty curve. Parameters are introduced at different levels and grow on different
 * cadences so that no level raises every axis at once:
 *  - ball speed only rises between five-level tiers (plus a tiny in-tier ramp),
 *  - brick rows grow every couple of levels,
 *  - resistant bricks and higher hit points appear progressively,
 *  - maze complexity and dynamic obstacles unlock at fixed milestones,
 *  - the first level after each checkpoint is a slightly easier "breather".
 */
export interface DifficultyParams {
  level: number;
  tier: number;
  ballSpeed: number;
  rows: number;
  density: number;
  resistantRatio: number;
  maxHp: number;
  specialMin: number;
  specialMax: number;
  /** 0..3 – which formation families the generator may use. */
  formationComplexity: number;
  /** 0 for Classic; 1..4 for Maze (ledges, pockets, corridors, dynamic). */
  mazeComplexity: number;
  sliders: number;
  gates: number;
  breather: boolean;
}

export const DIFFICULTY = {
  baseSpeed: 300,
  speedGain: 170,
  speedTierScale: 7,
  speedInTierStep: 2,
  maxLevelSpeed: 470,
  minRows: 4,
  maxRows: 15,
  levelsPerRow: 2.2,
  baseDensity: 0.58,
  densityGain: 0.32,
  resistantStartLevel: 3,
  resistantBase: 0.08,
  resistantGain: 0.47,
  resistantMax: 0.55,
  hpThresholds: [
    { level: 1, maxHp: 1 },
    { level: 3, maxHp: 2 },
    { level: 9, maxHp: 3 },
    { level: 18, maxHp: 4 },
    { level: 30, maxHp: 5 },
  ],
  maze: {
    pocketsFrom: 6,
    corridorsFrom: 13,
    slidersFrom: 16,
    secondSliderFrom: 26,
    gatesFrom: 22,
    secondGateFrom: 32,
  },
} as const;

export function levelSpeed(level: number): number {
  const t = Math.max(0, level - 1);
  const tier = Math.floor(t / 5);
  const inTier = t % 5;
  const speed =
    DIFFICULTY.baseSpeed +
    DIFFICULTY.speedGain * (1 - Math.exp(-tier / DIFFICULTY.speedTierScale)) +
    inTier * DIFFICULTY.speedInTierStep;
  return Math.min(DIFFICULTY.maxLevelSpeed, Math.round(speed));
}

export function maxHpForLevel(level: number): number {
  let hp = 1;
  for (const threshold of DIFFICULTY.hpThresholds) {
    if (level >= threshold.level) hp = threshold.maxHp;
  }
  return hp;
}

export function getDifficulty(level: number, style: GameStyle): DifficultyParams {
  const n = Math.max(1, Math.floor(level));
  const t = n - 1;
  const tier = Math.floor(t / 5);
  const breather = tier > 0 && t % 5 === 0;

  let rows = Math.min(DIFFICULTY.maxRows, DIFFICULTY.minRows + Math.floor(t / DIFFICULTY.levelsPerRow));
  let density = DIFFICULTY.baseDensity + DIFFICULTY.densityGain * (1 - Math.exp(-t / 15));
  let resistantRatio = 0;
  if (n >= DIFFICULTY.resistantStartLevel) {
    const r = t - (DIFFICULTY.resistantStartLevel - 1);
    resistantRatio = Math.min(
      DIFFICULTY.resistantMax,
      DIFFICULTY.resistantBase + DIFFICULTY.resistantGain * (1 - Math.exp(-r / 25)),
    );
  }

  if (breather) {
    rows = Math.max(DIFFICULTY.minRows, rows - 2);
    density = Math.max(DIFFICULTY.baseDensity, density - 0.1);
    resistantRatio = Math.max(0, resistantRatio - 0.06);
  }

  const specialMin = n < 5 ? 1 : 2;
  const specialMax = n < 2 ? 1 : n < 5 ? 2 : n < 15 ? 3 : 4;

  const formationComplexity = tier === 0 ? 0 : tier === 1 ? 1 : tier <= 3 ? 2 : 3;

  let mazeComplexity = 0;
  let sliders = 0;
  let gates = 0;
  if (style === 'maze') {
    const m = DIFFICULTY.maze;
    mazeComplexity = n < m.pocketsFrom ? 1 : n < m.corridorsFrom ? 2 : n < m.slidersFrom ? 3 : 4;
    if (n >= m.slidersFrom) sliders = n >= m.secondSliderFrom ? 2 : 1;
    if (n >= m.gatesFrom) gates = n >= m.secondGateFrom ? 2 : 1;
    // Dynamic obstacles alternate with calmer levels so they never pile up every level.
    if (breather) {
      sliders = Math.min(sliders, 1);
      gates = 0;
    } else if (n % 2 === 1) {
      gates = Math.min(gates, 1);
    }
    // Maze levels already add routing difficulty, so keep brick volume a little lower.
    rows = Math.max(DIFFICULTY.minRows, rows - 1);
  }

  return {
    level: n,
    tier,
    ballSpeed: levelSpeed(n),
    rows,
    density: Math.min(0.95, density),
    resistantRatio,
    maxHp: maxHpForLevel(n),
    specialMin,
    specialMax,
    formationComplexity,
    mazeComplexity,
    sliders,
    gates,
    breather,
  };
}
