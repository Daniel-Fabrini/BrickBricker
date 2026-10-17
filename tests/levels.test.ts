import { describe, expect, it } from 'vitest';
import { getDifficulty, levelSpeed } from '../src/config/difficulty';
import { BALL, WORLD } from '../src/config/tuning';
import { fallbackLevel, generateLevel } from '../src/core/level/generator';
import { getLevel, PROGRESSION_SEED, tutorialLevel } from '../src/core/level/levelProvider';
import { buildSpecialLevel, SPECIAL_LEVELS, specialDesignsFor } from '../src/core/level/specialLevels';
import type { LevelDefinition } from '../src/core/level/types';
import { validateLevel } from '../src/core/level/validator';
import { GameSimulation } from '../src/core/sim/simulation';
import { GAME_STYLES } from '../src/core/types';
import { botPaddle, DT } from './helpers';

describe('procedural levels (req 25)', () => {
  it('generates levels that pass structural and reachability validation', () => {
    for (const style of GAME_STYLES) {
      for (const seed of [PROGRESSION_SEED, 1, 987654]) {
        for (let n = 1; n <= 120; n++) {
          const level = getLevel(style, n, seed);
          const result = validateLevel(level);
          expect(result.ok, `${style} ${n} seed ${seed}: ${result.errors.join('; ')}`).toBe(true);
          expect(result.reachable).toBe(level.bricks.length);
          expect(level.bricks.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is deterministic for the same style, level and seed', () => {
    for (const style of GAME_STYLES) {
      for (const n of [1, 7, 23, 41]) {
        expect(generateLevel(style, n, 5)).toEqual(generateLevel(style, n, 5));
      }
    }
    expect(generateLevel('classic', 7, 5)).not.toEqual(generateLevel('classic', 7, 6));
  });

  it('never counts walls as bricks and keeps every cell inside the grid', () => {
    for (let n = 1; n <= 60; n++) {
      const level = getLevel('maze', n, PROGRESSION_SEED);
      const cells = new Set<string>();
      for (const b of level.bricks) {
        expect(b.col).toBeGreaterThanOrEqual(0);
        expect(b.col).toBeLessThan(WORLD.gridCols);
        expect(b.row).toBeLessThan(WORLD.gridMaxRows);
        cells.add(`${b.col},${b.row}`);
      }
      for (const s of level.statics) expect(cells.has(`${s.col},${s.row}`)).toBe(false);
    }
  });

  it('introduces maze mechanics gradually (no dynamic obstacles early)', () => {
    for (let n = 1; n < 16; n++) {
      if (n % 10 === 0) continue;
      expect(getLevel('maze', n, PROGRESSION_SEED).obstacles, `maze ${n}`).toHaveLength(0);
    }
    const later = Array.from({ length: 30 }, (_, i) => getLevel('maze', 16 + i, PROGRESSION_SEED));
    expect(later.some((l) => l.obstacles.some((o) => o.kind === 'slider'))).toBe(true);
    expect(later.some((l) => l.obstacles.some((o) => o.kind === 'gate'))).toBe(true);
    for (let n = 1; n <= 40; n++) expect(getLevel('classic', n, PROGRESSION_SEED).obstacles).toHaveLength(0);
    for (let n = 1; n <= 40; n++) if (n % 10 !== 0) expect(getLevel('classic', n, PROGRESSION_SEED).statics).toHaveLength(0);
  });

  it('ramps difficulty gradually: no parameter jumps, not everything increases every level', () => {
    for (const style of GAME_STYLES) {
      let allIncreased = 0;
      for (let n = 2; n <= 100; n++) {
        const a = getDifficulty(n - 1, style);
        const b = getDifficulty(n, style);
        expect(Math.abs(b.ballSpeed - a.ballSpeed)).toBeLessThanOrEqual(25);
        expect(Math.abs(b.rows - a.rows)).toBeLessThanOrEqual(3);
        expect(b.maxHp - a.maxHp).toBeLessThanOrEqual(1);
        expect(b.resistantRatio - a.resistantRatio).toBeLessThan(0.1);
        if (b.ballSpeed > a.ballSpeed && b.rows > a.rows && b.resistantRatio > a.resistantRatio && b.maxHp > a.maxHp) allIncreased++;
      }
      expect(allIncreased).toBe(0);
    }
    expect(getDifficulty(1, 'classic').resistantRatio).toBe(0);
    expect(getDifficulty(1, 'classic').maxHp).toBe(1);
    expect(getDifficulty(6, 'classic').breather).toBe(true);
    expect(levelSpeed(1)).toBeLessThan(levelSpeed(50));
    expect(levelSpeed(100000)).toBeLessThanOrEqual(BALL.absoluteMaxSpeed);
  });

  it('keeps special bricks rare enough not to trivialise levels', () => {
    for (const style of GAME_STYLES) {
      for (let n = 1; n <= 60; n++) {
        if (n % 10 === 0) continue;
        const level = getLevel(style, n, PROGRESSION_SEED);
        const specials = level.bricks.filter((b) => b.kind === 'special').length;
        expect(specials).toBeGreaterThanOrEqual(1);
        expect(specials).toBeLessThanOrEqual(Math.max(2, Math.ceil(level.bricks.length * 0.12)));
      }
    }
  });

  it('validator rejects sealed bricks, narrow passages and gate-only routes', () => {
    const base = (partial: Partial<LevelDefinition>): LevelDefinition => ({
      key: 'v',
      number: 1,
      style: 'maze',
      seed: 1,
      special: null,
      rows: 10,
      bricks: [],
      statics: [],
      obstacles: [],
      ballSpeed: 300,
      ...partial,
    });
    // Brick completely enclosed by walls.
    const sealed = base({
      bricks: [{ col: 5, row: 5, kind: 'standard', hp: 1 }],
      statics: [
        [4, 4],
        [5, 4],
        [6, 4],
        [4, 5],
        [6, 5],
        [4, 6],
        [5, 6],
        [6, 6],
      ].map(([col, row]) => ({ col: col as number, row: row as number, kind: 'wall' as const })),
    });
    expect(validateLevel(sealed).ok).toBe(false);
    // Opening one row tall (15 units) is narrower than a safe corridor.
    const narrow = base({
      bricks: [{ col: 5, row: 2, kind: 'standard', hp: 1 }],
      statics: [
        ...Array.from({ length: 12 }, (_, c) => ({ col: c, row: 4, kind: 'wall' as const })),
        ...Array.from({ length: 11 }, (_, c) => ({ col: c + 1, row: 6, kind: 'wall' as const })),
        { col: 0, row: 5, kind: 'wall' as const },
      ].filter((s) => !(s.row === 4 && s.col === 11)),
    });
    expect(validateLevel(narrow).ok).toBe(false);
    // A chamber reachable only through a gate is rejected (gates are treated as closed).
    const gated = base({
      bricks: [{ col: 5, row: 1, kind: 'standard', hp: 1 }],
      statics: Array.from({ length: 12 }, (_, c) => ({ col: c, row: 4, kind: 'wall' as const })).filter((s) => s.col !== 5 && s.col !== 6),
      obstacles: [{ kind: 'gate', col: 5, row: 4, w: 2, h: 1, openTime: 2.8, closedTime: 2, offset: 0 }],
    });
    expect(validateLevel(gated).ok).toBe(false);
    // Same chamber with a second permanent opening is accepted.
    const twoWays = base({
      ...gated,
      statics: gated.statics.filter((s) => s.col !== 0 && s.col !== 1),
    });
    expect(validateLevel(twoWays).ok, validateLevel(twoWays).errors.join(';')).toBe(true);
    // Overlapping cells are rejected.
    expect(validateLevel(base({ bricks: [{ col: 1, row: 1, kind: 'standard', hp: 1 }], statics: [{ col: 1, row: 1, kind: 'wall' }] })).ok).toBe(false);
  });

  it('fallback and tutorial levels are valid', () => {
    for (const style of GAME_STYLES) expect(validateLevel(fallbackLevel(style, 30, 1, getDifficulty(30, style))).ok).toBe(true);
    expect(validateLevel(tutorialLevel()).ok).toBe(true);
  });
});

describe('special levels', () => {
  it('every hand-designed level is valid in both its normal and mirrored/toughened variants', () => {
    expect(specialDesignsFor('classic').length).toBeGreaterThanOrEqual(8);
    expect(specialDesignsFor('maze').length).toBeGreaterThanOrEqual(8);
    for (const design of SPECIAL_LEVELS) {
      for (const cycle of [0, 1, 2, 3]) {
        const level = buildSpecialLevel(design, 10 * (cycle + 1), cycle);
        const result = validateLevel(level);
        expect(result.ok, `${design.id} cycle ${cycle}: ${result.errors.join('; ')}`).toBe(true);
      }
    }
  });

  it('appears every tenth level and repeats infinitely with variations', () => {
    const l10 = getLevel('classic', 10, PROGRESSION_SEED);
    const l90 = getLevel('classic', 90, PROGRESSION_SEED);
    expect(l10.special).toBe(l90.special);
    expect(l90.bricks).not.toEqual(l10.bricks);
    expect(getLevel('maze', 1000, PROGRESSION_SEED).special).not.toBeNull();
    expect(getLevel('maze', 11, PROGRESSION_SEED).special).toBeNull();
  });
});

describe('levels are completable under the game physics', () => {
  it('a simple bot clears a sample of generated and special levels', () => {
    const samples: [('classic' | 'maze'), number][] = [
      ['classic', 1],
      ['classic', 4],
      ['classic', 10],
      ['classic', 13],
      ['maze', 1],
      ['maze', 6],
      ['maze', 10],
      ['maze', 17],
    ];
    for (const [style, n] of samples) {
      const level = getLevel(style, n, PROGRESSION_SEED);
      const sim = GameSimulation.create({ level, mode: 'tutorial', seed: 5 });
      const maxSteps = Math.round(900 / DT);
      for (let i = 0; i < maxSteps && !sim.isFinished(); i++) {
        botPaddle(sim);
        sim.step(DT);
        sim.drainEvents();
      }
      expect(sim.state.phase, `${style} ${n}`).toBe('complete');
    }
  });
});
