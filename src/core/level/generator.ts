import { getDifficulty, type DifficultyParams } from '../../config/difficulty';
import { WORLD } from '../../config/tuning';
import { hashSeed, Rng } from '../rng';
import type { GameStyle } from '../types';
import { emptyMask, formationsFor, thinMask, type Mask } from './formations';
import { cellIndex } from './grid';
import { makeGate, makeSlider, templatesForTier, type MazeLayout } from './mazeTemplates';
import type { BrickDef, LevelDefinition, ObstacleDef, StaticDef } from './types';
import { validateLevel } from './validator';

/**
 * Constraint-based procedural generator. A candidate is built from a formation (brick mask), an
 * optional maze template (walls, gates, sliders), and difficulty-driven brick typing. Every
 * candidate is validated structurally and for reachability; failing candidates are rebuilt with a
 * derived seed. After MAX_ATTEMPTS a guaranteed-safe fallback is used. All randomness is seeded
 * from (style, level, baseSeed) so the same inputs always produce the same level.
 */

export const GENERATOR = {
  maxAttempts: 24,
  minBricks: 14,
} as const;

const COLS = WORLD.gridCols;

export function generateLevel(style: GameStyle, levelNumber: number, baseSeed: number): LevelDefinition {
  const difficulty = getDifficulty(levelNumber, style);
  for (let attempt = 0; attempt < GENERATOR.maxAttempts; attempt++) {
    const seed = hashSeed('level', style, levelNumber, baseSeed, attempt);
    const candidate = buildCandidate(style, levelNumber, seed, difficulty);
    if (candidate && validateLevel(candidate).ok) return candidate;
  }
  return fallbackLevel(style, levelNumber, baseSeed, difficulty);
}

function buildCandidate(style: GameStyle, levelNumber: number, seed: number, difficulty: DifficultyParams): LevelDefinition | null {
  const rng = new Rng(seed);
  const formation = rng.pick(formationsFor(difficulty.formationComplexity));

  let layout: MazeLayout | null = null;
  let brickRows = difficulty.rows;
  if (style === 'maze') {
    const template = rng.pick(templatesForTier(difficulty.mazeComplexity));
    layout = template.build(brickRows, rng);
    brickRows = layout.brickRows;
  }

  const rowOffset = layout ? 0 : rng.int(0, difficulty.rows <= 6 ? 2 : 1);
  let mask = formation.build({ rows: brickRows, density: difficulty.density, rng });
  if (difficulty.formationComplexity >= 1 && formation.id !== 'randomSymmetric') {
    mask = thinMask(mask, Math.min(1, difficulty.density + 0.15), rng, 0.7);
  }

  const wallSet = new Set<number>();
  const statics: StaticDef[] = [];
  if (layout) {
    for (const [c, r] of layout.walls) {
      const idx = cellIndex(c, r);
      if (wallSet.has(idx)) continue;
      wallSet.add(idx);
      statics.push({ col: c, row: r, kind: 'wall' });
    }
  }

  const obstacles: ObstacleDef[] = [];
  const gateCells = new Set<number>();
  if (layout && difficulty.gates > 0 && layout.gateSlots.length > 1) {
    // Never gate every opening: at least one always stays open.
    const slots = rng.shuffle([...layout.gateSlots]).slice(0, Math.min(difficulty.gates, layout.gateSlots.length - 1));
    for (const slot of slots) {
      obstacles.push(makeGate(slot, rng));
      for (let c = slot.col; c < slot.col + slot.w; c++) for (let r = slot.row; r < slot.row + slot.h; r++) gateCells.add(cellIndex(c, r));
    }
  }

  const bricks: BrickDef[] = [];
  for (let r = 0; r < mask.length; r++) {
    const row = mask[r] as boolean[];
    for (let c = 0; c < COLS; c++) {
      if (!row[c]) continue;
      const gr = r + rowOffset;
      const idx = cellIndex(c, gr);
      if (wallSet.has(idx) || gateCells.has(idx)) continue;
      bricks.push({ col: c, row: gr, kind: 'standard', hp: 1 });
    }
  }
  if (bricks.length < GENERATOR.minBricks) return null;

  const totalRows = Math.max(layout?.totalRows ?? 0, brickRows + rowOffset);

  if (layout && difficulty.sliders > 0) {
    // Sliders live in an empty lane below everything else, separated by a free row.
    const lane = totalRows + 1;
    if (lane + 1 < WORLD.gridMaxRows) {
      if (difficulty.sliders >= 2) {
        obstacles.push(makeSlider(lane, rng, 'left'), makeSlider(lane, rng, 'right'));
      } else {
        obstacles.push(makeSlider(lane, rng));
      }
    }
  }

  assignBrickTypes(bricks, difficulty, rng);

  return {
    key: `${style}:${levelNumber}:${seed}`,
    number: levelNumber,
    style,
    seed,
    special: null,
    rows: totalRows,
    bricks,
    statics,
    obstacles,
    ballSpeed: difficulty.ballSpeed,
    formation: formation.id,
    template: layout?.id,
    difficulty,
  };
}

/** Converts some standard bricks into resistant and special bricks, mirroring choices for symmetry. */
export function assignBrickTypes(bricks: BrickDef[], difficulty: DifficultyParams, rng: Rng): void {
  const byCell = new Map<number, BrickDef>();
  for (const b of bricks) byCell.set(cellIndex(b.col, b.row), b);
  const mirrorOf = (b: BrickDef): BrickDef | undefined => byCell.get(cellIndex(COLS - 1 - b.col, b.row));
  const leftHalf = bricks.filter((b) => b.col < COLS / 2);

  // Resistant bricks: pick a placement strategy, then choose cells on the left half and mirror.
  if (difficulty.resistantRatio > 0 && difficulty.maxHp >= 2) {
    const target = Math.round(bricks.length * difficulty.resistantRatio);
    const strategy = rng.pick(['bands', 'core', 'scatter'] as const);
    const minRow = Math.min(...bricks.map((b) => b.row));
    const maxRow = Math.max(...bricks.map((b) => b.row));
    const scored = leftHalf.map((b) => {
      let score: number;
      if (strategy === 'bands') score = b.row - minRow + rng.next() * 0.5; // top rows first
      else if (strategy === 'core') score = Math.abs(b.col - (COLS / 2 - 0.5)) + Math.abs(b.row - (minRow + maxRow) / 2) * 0.6 + rng.next() * 0.5;
      else score = rng.next();
      return { b, score };
    });
    scored.sort((a, b) => a.score - b.score);
    let made = 0;
    for (const { b } of scored) {
      if (made >= target) break;
      const t = (b.row - minRow) / Math.max(1, maxRow - minRow);
      // Higher hit points are rarer and favour upper rows.
      const bias = Math.pow(rng.next(), 1.6) * (1 - t * 0.5);
      const hp = Math.min(difficulty.maxHp, 2 + Math.floor(bias * (difficulty.maxHp - 1)));
      for (const cell of [b, mirrorOf(b)]) {
        if (!cell || cell.kind !== 'standard') continue;
        cell.kind = 'resistant';
        cell.hp = hp;
        made++;
      }
    }
  }

  // Special bricks: placed in mirrored pairs where possible, never adjacent to another special.
  const specialCount = Math.min(rng.int(difficulty.specialMin, difficulty.specialMax), Math.max(1, Math.floor(bricks.length * 0.07)));
  const candidates = rng.shuffle(bricks.filter((b) => b.kind === 'standard'));
  const isAdjacentToSpecial = (b: BrickDef): boolean =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dc, dr]) => byCell.get(cellIndex(b.col + (dc as number), b.row + (dr as number)))?.kind === 'special');
  let placed = 0;
  for (const b of candidates) {
    if (placed >= specialCount) break;
    if (b.kind !== 'standard' || isAdjacentToSpecial(b)) continue;
    b.kind = 'special';
    b.hp = difficulty.level >= 14 && rng.chance(0.35) ? 2 : 1;
    placed++;
    const m = mirrorOf(b);
    if (placed < specialCount && m && m !== b && m.kind === 'standard' && !isAdjacentToSpecial(m)) {
      m.kind = 'special';
      m.hp = b.hp;
      placed++;
    }
  }
}

/** A simple full-rows level that always validates; used only if every generated candidate fails. */
export function fallbackLevel(style: GameStyle, levelNumber: number, baseSeed: number, difficulty: DifficultyParams): LevelDefinition {
  const seed = hashSeed('fallback', style, levelNumber, baseSeed);
  const rng = new Rng(seed);
  const rows = Math.max(4, Math.min(8, difficulty.rows));
  const mask: Mask = emptyMask(rows).map((row) => row.map(() => true));
  const bricks: BrickDef[] = [];
  mask.forEach((row, r) => row.forEach((on, c) => on && bricks.push({ col: c, row: r + 1, kind: 'standard', hp: 1 })));
  assignBrickTypes(bricks, difficulty, rng);
  const statics: StaticDef[] =
    style === 'maze'
      ? [
          { col: 2, row: rows + 3, kind: 'wall' },
          { col: 3, row: rows + 3, kind: 'wall' },
          { col: 8, row: rows + 3, kind: 'wall' },
          { col: 9, row: rows + 3, kind: 'wall' },
        ]
      : [];
  return {
    key: `${style}:${levelNumber}:fallback:${seed}`,
    number: levelNumber,
    style,
    seed,
    special: null,
    rows: rows + 4,
    bricks,
    statics,
    obstacles: [],
    ballSpeed: difficulty.ballSpeed,
    formation: 'fallback',
    template: style === 'maze' ? 'fallback' : undefined,
    difficulty,
  };
}
