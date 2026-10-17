import { OBSTACLES, WORLD } from '../../config/tuning';
import type { Rng } from '../rng';
import type { GateDef, ObstacleDef, SliderDef } from './types';

/**
 * Maze templates: fixed wall layouts introduced by complexity tier.
 *  1 – ledges / pillars: easy-to-read deflectors.
 *  2 – pockets / shelves / chambers: bricks partly enclosed by walls.
 *  3 – corridors: channels with offset openings that require routing.
 * Templates also report where gates may be placed (openings that have an alternative route) so the
 * generator can add dynamic obstacles at tier 4 without ever creating a single blocked path.
 *
 * Openings are always at least two cells wide (60 units) horizontally and three rows tall
 * (45 units) vertically, far wider than the 12-unit ball.
 */
export interface MazeLayout {
  id: string;
  /** Wall cells. */
  walls: [number, number][];
  /** Rows (relative to the top of the grid) where bricks may be placed. */
  brickRows: number;
  /** Total grid rows the layout occupies (walls included). */
  totalRows: number;
  /** Candidate gate openings – each is safe to close because another opening always remains. */
  gateSlots: Omit<GateDef, 'kind' | 'openTime' | 'closedTime' | 'offset'>[];
}

export interface MazeTemplate {
  id: string;
  tier: number;
  build(brickRows: number, rng: Rng): MazeLayout;
}

const COLS = WORLD.gridCols;

function mirrorCells(cells: [number, number][]): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const [c, r] of cells) {
    out.set(`${c},${r}`, [c, r]);
    out.set(`${COLS - 1 - c},${r}`, [COLS - 1 - c, r]);
  }
  return [...out.values()];
}

function hLine(c0: number, c1: number, row: number): [number, number][] {
  const out: [number, number][] = [];
  for (let c = c0; c <= c1; c++) out.push([c, row]);
  return out;
}

function vLine(col: number, r0: number, r1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = r0; r <= r1; r++) out.push([col, r]);
  return out;
}

export const MAZE_TEMPLATES: MazeTemplate[] = [
  {
    id: 'ledges',
    tier: 1,
    build: (rows, rng) => {
      const width = rng.pick([2, 3]);
      const row = rows + 1;
      return { id: 'ledges', walls: mirrorCells(hLine(1, width, row)), brickRows: rows, totalRows: row + 1, gateSlots: [] };
    },
  },
  {
    id: 'pillars',
    tier: 1,
    build: (rows, rng) => {
      const col = rng.pick([2, 3]);
      const height = Math.min(3, Math.max(2, Math.floor(rows / 3)));
      const r0 = rows - height;
      return {
        id: 'pillars',
        walls: mirrorCells(vLine(col, r0, rows - 1)),
        brickRows: rows,
        totalRows: rows,
        gateSlots: [],
      };
    },
  },
  {
    id: 'centerBar',
    tier: 1,
    build: (rows) => {
      const row = rows + 1;
      return { id: 'centerBar', walls: mirrorCells(hLine(4, 5, row)), brickRows: rows, totalRows: row + 1, gateSlots: [] };
    },
  },
  {
    id: 'hoods',
    tier: 2,
    build: (rows) => {
      // Two inverted U-shaped hoods; bricks inside are reached through a 2-cell opening below.
      const top = 1;
      const depth = Math.min(4, Math.max(3, rows - 2));
      const walls = [...hLine(1, 4, top), ...vLine(1, top + 1, top + depth), ...vLine(4, top + 1, top + depth - 1)];
      return { id: 'hoods', walls: mirrorCells(walls), brickRows: rows, totalRows: Math.max(rows, top + depth + 1), gateSlots: [] };
    },
  },
  {
    id: 'shelves',
    tier: 2,
    build: (rows) => {
      const walls: [number, number][] = [];
      const step = 4;
      let left = true;
      for (let r = 3; r < rows; r += step) {
        walls.push(...(left ? hLine(0, 3, r) : hLine(8, 11, r)));
        left = !left;
      }
      return { id: 'shelves', walls, brickRows: rows, totalRows: rows, gateSlots: [] };
    },
  },
  {
    id: 'chambers',
    tier: 2,
    build: (rows) => {
      // A full-width barrier with two side openings separates the upper chamber.
      const barrier = Math.max(3, Math.floor(rows / 2));
      const walls = mirrorCells([...hLine(0, 0, barrier), ...hLine(3, 5, barrier)]);
      return {
        id: 'chambers',
        walls,
        brickRows: rows,
        totalRows: rows,
        gateSlots: [
          { col: 1, row: barrier, w: 2, h: 1 },
          { col: 9, row: barrier, w: 2, h: 1 },
        ],
      };
    },
  },
  {
    id: 'corridors',
    tier: 3,
    build: (rows, rng) => {
      // Two vertical walls split the field in three channels; openings at alternating heights.
      const height = Math.max(9, rows);
      const gap = 3;
      const leftGapAt = rng.pick([1, height - gap - 1]);
      const walls: [number, number][] = [];
      for (let r = 0; r < height; r++) {
        if (r < leftGapAt || r >= leftGapAt + gap) walls.push([3, r]);
      }
      const mirroredWalls = mirrorCells(walls);
      return {
        id: 'corridors',
        walls: mirroredWalls,
        brickRows: height,
        totalRows: height,
        gateSlots: [],
      };
    },
  },
  {
    id: 'crossroads',
    tier: 3,
    build: (rows) => {
      const height = Math.max(10, rows);
      const mid = Math.floor(height / 2);
      const walls = mirrorCells([
        ...hLine(0, 1, mid),
        ...hLine(4, 5, mid),
        ...vLine(4, 1, mid - 1),
        ...vLine(4, mid + 4, height - 1),
      ]);
      return {
        id: 'crossroads',
        walls,
        brickRows: height,
        totalRows: height,
        gateSlots: [
          { col: 2, row: mid, w: 2, h: 1 },
          { col: 8, row: mid, w: 2, h: 1 },
        ],
      };
    },
  },
  {
    id: 'funnel',
    tier: 3,
    build: (rows) => {
      const height = Math.max(8, rows);
      const walls: [number, number][] = [];
      // Stepped diagonal walls that funnel toward a central opening.
      const base = height - 1;
      for (let i = 0; i < 4; i++) walls.push([i, base - 3 + i], [i + 1, base - 3 + i]);
      return { id: 'funnel', walls: mirrorCells(walls), brickRows: height - 1, totalRows: height, gateSlots: [] };
    },
  },
];

export function templatesForTier(tier: number): MazeTemplate[] {
  const exact = MAZE_TEMPLATES.filter((t) => t.tier === Math.min(3, tier));
  return exact.length > 0 ? exact : MAZE_TEMPLATES.filter((t) => t.tier <= tier);
}

export function makeGate(slot: Omit<GateDef, 'kind' | 'openTime' | 'closedTime' | 'offset'>, rng: Rng): GateDef {
  return {
    kind: 'gate',
    ...slot,
    openTime: OBSTACLES.gateOpenTime,
    closedTime: OBSTACLES.gateClosedTime,
    offset: Math.round(rng.float(0, OBSTACLES.gateOpenTime + OBSTACLES.gateClosedTime) * 100) / 100,
  };
}

export function makeSlider(row: number, rng: Rng, half?: 'left' | 'right'): SliderDef {
  const widthCells = 2;
  const w = widthCells * WORLD.cellW;
  const clearance = OBSTACLES.sliderEndClearance;
  let minX = clearance;
  let maxX = WORLD.width - clearance - w;
  if (half === 'left') maxX = WORLD.width / 2 - w - 4;
  if (half === 'right') minX = WORLD.width / 2 + 4;
  return {
    kind: 'slider',
    row,
    widthCells,
    minX,
    maxX,
    speed: Math.round(rng.float(OBSTACLES.sliderMinSpeed, OBSTACLES.sliderMaxSpeed)),
    phase: Math.round(rng.next() * 100) / 100,
  };
}

export function isObstacleGate(o: ObstacleDef): o is GateDef {
  return o.kind === 'gate';
}
