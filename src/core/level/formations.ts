import { WORLD } from '../../config/tuning';
import type { Rng } from '../rng';

/**
 * Brick formations. Each returns a rows x 12 occupancy mask. Most formations are mirror-symmetric,
 * which reads well on a narrow portrait screen and keeps both sides of the field equally fair.
 */
export type Mask = boolean[][];

export interface FormationContext {
  rows: number;
  density: number;
  rng: Rng;
}

export interface Formation {
  id: string;
  complexity: number;
  build(ctx: FormationContext): Mask;
}

const COLS = WORLD.gridCols;
const HALF = COLS / 2;

export function emptyMask(rows: number): Mask {
  return Array.from({ length: rows }, () => new Array<boolean>(COLS).fill(false));
}

function mirrored(rows: number, fn: (col: number, row: number) => boolean): Mask {
  const mask = emptyMask(rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < HALF; c++) {
      const on = fn(c, r);
      (mask[r] as boolean[])[c] = on;
      (mask[r] as boolean[])[COLS - 1 - c] = on;
    }
  }
  return mask;
}

/** Symmetrically removes cells to reach roughly the requested density (never below minKeep). */
export function thinMask(mask: Mask, density: number, rng: Rng, minKeep = 0.55): Mask {
  const keep = Math.max(minKeep, Math.min(1, density));
  if (keep >= 0.999) return mask;
  for (const row of mask) {
    for (let c = 0; c < HALF; c++) {
      if (row[c] && !rng.chance(keep)) {
        row[c] = false;
        row[COLS - 1 - c] = false;
      }
    }
  }
  return mask;
}

export const FORMATIONS: Formation[] = [
  {
    id: 'rows',
    complexity: 0,
    build: ({ rows, rng }) => {
      const gapEvery = rng.pick([0, 0, 3, 4]);
      return mirrored(rows, (_c, r) => gapEvery === 0 || r % gapEvery !== gapEvery - 1);
    },
  },
  {
    id: 'pyramid',
    complexity: 0,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => {
        const fromCentre = HALF - 1 - c; // 0 at centre columns
        return fromCentre <= Math.floor((r + 1) * (HALF / rows)) + 0;
      }),
  },
  {
    id: 'block',
    complexity: 0,
    build: ({ rows, rng }) => {
      const margin = rng.int(0, 2);
      return mirrored(rows, (c) => c >= margin);
    },
  },
  {
    id: 'stripes',
    complexity: 0,
    build: ({ rows, rng }) => {
      const width = rng.pick([1, 2]);
      return mirrored(rows, (c) => Math.floor((HALF - 1 - c) / width) % 2 === 0);
    },
  },
  {
    id: 'checker',
    complexity: 1,
    build: ({ rows }) => mirrored(rows, (c, r) => (c + r) % 2 === 0),
  },
  {
    id: 'diamond',
    complexity: 1,
    build: ({ rows }) => {
      const mid = (rows - 1) / 2;
      return mirrored(rows, (c, r) => {
        const dx = (HALF - 0.5 - c) / HALF;
        const dy = mid === 0 ? 0 : Math.abs(r - mid) / (mid + 1);
        return dx + dy <= 1.05;
      });
    },
  },
  {
    id: 'invertedPyramid',
    complexity: 1,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => {
        const fromCentre = HALF - 1 - c;
        return fromCentre <= Math.floor((rows - r) * (HALF / rows));
      }),
  },
  {
    id: 'columns',
    complexity: 1,
    build: ({ rows, rng }) => {
      const period = rng.pick([3, 4]);
      return mirrored(rows, (c) => (HALF - 1 - c) % period !== period - 1);
    },
  },
  {
    id: 'twinTowers',
    complexity: 1,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => (c >= 1 && c <= 3) || (r >= rows - 2 && c >= 0) || (r < 2 && c >= 3)),
  },
  {
    id: 'wave',
    complexity: 2,
    build: ({ rows, rng }) => {
      const thickness = Math.max(2, Math.floor(rows / 3));
      const amp = Math.max(1, Math.floor((rows - thickness) / 2));
      const phase = rng.float(0, Math.PI * 2);
      return mirrored(rows, (c, r) => {
        const offset = Math.round(amp + Math.sin(c * 0.9 + phase) * amp);
        return r >= offset && r < offset + thickness;
      });
    },
  },
  {
    id: 'frame',
    complexity: 2,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => {
        const ring = Math.min(c, r, rows - 1 - r);
        return ring % 2 === 0;
      }),
  },
  {
    id: 'islands',
    complexity: 2,
    build: ({ rows, rng }) => {
      const mask = emptyMask(rows);
      const islandW = 2;
      const islandH = rng.pick([2, 3]);
      for (let r = 0; r + islandH <= rows; r += islandH + 1) {
        const shift = (r / (islandH + 1)) % 2 === 0 ? 0 : 1;
        for (let c = shift; c + islandW <= HALF; c += islandW + 1) {
          for (let dr = 0; dr < islandH; dr++) {
            for (let dc = 0; dc < islandW; dc++) {
              const row = mask[r + dr] as boolean[];
              row[c + dc] = true;
              row[COLS - 1 - (c + dc)] = true;
            }
          }
        }
      }
      return mask;
    },
  },
  {
    id: 'zigzag',
    complexity: 2,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => {
        const band = Math.floor(r / 2) % 2 === 0;
        return band ? c % 3 !== 2 : (c + 1) % 3 !== 2;
      }),
  },
  {
    id: 'hourglass',
    complexity: 2,
    build: ({ rows }) => {
      const mid = (rows - 1) / 2;
      return mirrored(rows, (c, r) => {
        const fromCentre = HALF - 1 - c;
        const width = 1 + Math.round((Math.abs(r - mid) / Math.max(1, mid)) * (HALF - 1));
        return fromCentre < width;
      });
    },
  },
  {
    id: 'randomSymmetric',
    complexity: 3,
    build: ({ rows, rng, density }) => mirrored(rows, () => rng.chance(Math.max(0.55, density))),
  },
  {
    id: 'fortress',
    complexity: 3,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => r === 0 || r === rows - 1 || c === 0 || (c >= 3 && r >= 2 && r <= rows - 3)),
  },
  {
    id: 'lattice',
    complexity: 3,
    build: ({ rows }) => mirrored(rows, (c, r) => r % 3 === 0 || c % 3 === 0),
  },
  {
    id: 'arrows',
    complexity: 3,
    build: ({ rows }) =>
      mirrored(rows, (c, r) => {
        const fromCentre = HALF - 1 - c;
        return (r + fromCentre) % 4 < 2;
      }),
  },
];

export function formationsFor(complexity: number): Formation[] {
  return FORMATIONS.filter((f) => f.complexity <= complexity);
}

export function countMask(mask: Mask): number {
  let n = 0;
  for (const row of mask) for (const cell of row) if (cell) n++;
  return n;
}
