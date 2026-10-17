import { BALL, OBSTACLES, PADDLE, WORLD } from '../../config/tuning';
import type { Rect } from '../math';
import { cellIndex, cellRect, gateRect, inGrid } from './grid';
import type { LevelDefinition } from './types';

/**
 * Structural and reachability validation for every level (generated or hand-designed).
 *
 * Reachability is checked in configuration space: the ball centre is sampled on a fine lattice and
 * a position is free when a circle of radius (ball radius + safety margin) does not overlap any
 * solid. Gates are treated as permanently CLOSED (so a level never depends on gate timing) while
 * sliders are ignored because they always move out of the way. Starting from the paddle area we
 * flood-fill free space; every brick touching reachable space is considered destroyable, is removed,
 * and the flood continues. A level is completable when every destructible brick is eventually
 * reached. The safety margin also guarantees corridors are comfortably wider than the ball.
 */

export const VALIDATION = {
  /** Extra clearance around the ball when deciding whether a passage is usable. */
  clearanceMargin: 8,
  /** Lattice resolution in world units. */
  step: 5,
  /** Minimum free space between the lowest solid and the paddle. */
  minPaddleGap: 150,
  minDestructible: 1,
} as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  destructible: number;
  reachable: number;
}

interface Solid {
  rect: Rect;
  brick: number; // index into level.bricks, or -1 for indestructible solids
}

export function validateLevel(level: LevelDefinition): ValidationResult {
  const errors: string[] = [];
  const occupied = new Map<number, string>();

  const claim = (col: number, row: number, what: string): void => {
    if (!inGrid(col, row)) {
      errors.push(`${what} outside grid at ${col},${row}`);
      return;
    }
    const idx = cellIndex(col, row);
    const prev = occupied.get(idx);
    if (prev) errors.push(`${what} overlaps ${prev} at ${col},${row}`);
    else occupied.set(idx, what);
  };

  level.bricks.forEach((b, i) => {
    claim(b.col, b.row, `brick#${i}`);
    if (!Number.isInteger(b.hp) || b.hp < 1 || b.hp > 5) errors.push(`brick#${i} has invalid hp ${b.hp}`);
    if (b.kind === 'standard' && b.hp !== 1) errors.push(`standard brick#${i} must have 1 hp`);
    if (b.kind === 'resistant' && b.hp < 2) errors.push(`resistant brick#${i} must have >= 2 hp`);
  });
  level.statics.forEach((s, i) => claim(s.col, s.row, `${s.kind}#${i}`));

  const sliderRows = new Set<number>();
  level.obstacles.forEach((o, i) => {
    if (o.kind === 'gate') {
      if (o.openTime <= OBSTACLES.gateWarnTime || o.closedTime <= 0) errors.push(`gate#${i} has invalid timing`);
      for (let c = o.col; c < o.col + o.w; c++) for (let r = o.row; r < o.row + o.h; r++) claim(c, r, `gate#${i}`);
    } else {
      sliderRows.add(o.row);
      const w = o.widthCells * WORLD.cellW;
      if (o.minX < OBSTACLES.sliderEndClearance - 0.001) errors.push(`slider#${i} too close to left wall`);
      if (o.maxX + w > WORLD.width - OBSTACLES.sliderEndClearance + 0.001) errors.push(`slider#${i} too close to right wall`);
      if (o.maxX <= o.minX) errors.push(`slider#${i} has no travel range`);
      if (o.speed <= 0) errors.push(`slider#${i} does not move`);
      if (!inGrid(0, o.row)) errors.push(`slider#${i} lane outside grid`);
    }
  });
  // Slider lanes (and the rows directly next to them) must be empty so a ball can never be pinched.
  for (const row of sliderRows) {
    for (const r of [row - 1, row, row + 1]) {
      for (let c = 0; c < WORLD.gridCols; c++) {
        const what = occupied.get(cellIndex(c, r));
        if (what) errors.push(`slider lane row ${row} is not clear (${what} at ${c},${r})`);
      }
    }
  }

  const destructible = level.bricks.length;
  if (destructible < VALIDATION.minDestructible) errors.push('level has no destructible bricks');

  // Paddle access: nothing solid may come too close to the paddle.
  let lowest = 0;
  for (const idx of occupied.keys()) {
    const row = Math.floor(idx / WORLD.gridCols);
    lowest = Math.max(lowest, WORLD.gridTop + (row + 1) * WORLD.cellH);
  }
  for (const row of sliderRows) lowest = Math.max(lowest, WORLD.gridTop + (row + 1) * WORLD.cellH);
  if (PADDLE.y - PADDLE.height / 2 - lowest < VALIDATION.minPaddleGap) {
    errors.push(`solids too close to the paddle (lowest at ${lowest})`);
  }

  const reachable = errors.length === 0 ? countReachable(level) : 0;
  if (errors.length === 0 && reachable < destructible) {
    errors.push(`only ${reachable}/${destructible} destructible bricks are reachable`);
  }
  return { ok: errors.length === 0, errors, destructible, reachable };
}

function countReachable(level: LevelDefinition): number {
  const solids: Solid[] = [];
  level.statics.forEach((s) => solids.push({ rect: cellRect(s.col, s.row), brick: -1 }));
  level.obstacles.forEach((o) => {
    if (o.kind === 'gate') solids.push({ rect: gateRect(o), brick: -1 });
  });
  level.bricks.forEach((b, i) => solids.push({ rect: cellRect(b.col, b.row), brick: i }));

  const step = VALIDATION.step;
  const clearance = BALL.radius + VALIDATION.clearanceMargin;
  const cols = Math.floor(WORLD.width / step) + 1;
  const rows = Math.floor(WORLD.height / step) + 1;
  const nodeX = (i: number): number => i * step;
  const nodeY = (j: number): number => j * step;

  // For each node, which solids block it (precomputed once; bricks are removed as they are reached).
  const blockers: number[][] = new Array(cols * rows);
  const blockedCount = new Int32Array(cols * rows);
  const inField = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = nodeX(i);
      const y = nodeY(j);
      const n = j * cols + i;
      if (x < BALL.radius || x > WORLD.width - BALL.radius || y < BALL.radius || y > PADDLE.y) continue;
      inField[n] = 1;
    }
  }
  solids.forEach((solid, si) => {
    const r = solid.rect;
    const i0 = Math.max(0, Math.floor((r.x - clearance) / step));
    const i1 = Math.min(cols - 1, Math.ceil((r.x + r.w + clearance) / step));
    const j0 = Math.max(0, Math.floor((r.y - clearance) / step));
    const j1 = Math.min(rows - 1, Math.ceil((r.y + r.h + clearance) / step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = nodeX(i);
        const y = nodeY(j);
        const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
        const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
        if (dx * dx + dy * dy < clearance * clearance) {
          const n = j * cols + i;
          (blockers[n] ??= []).push(si);
          blockedCount[n] = (blockedCount[n] ?? 0) + 1;
        }
      }
    }
  });

  // Nodes adjacent to each brick (just outside its blocking zone) – touching them means the ball
  // can reach the brick. The distance is kept below clearance * sqrt(2) so a brick tucked into a
  // concave wall corner is not counted as reachable through the corner.
  const touchDist = clearance + 4.5;
  const touchNodes: number[][] = solids.map((solid) => {
    if (solid.brick < 0) return [];
    const r = solid.rect;
    const out: number[] = [];
    const i0 = Math.max(0, Math.floor((r.x - touchDist) / step));
    const i1 = Math.min(cols - 1, Math.ceil((r.x + r.w + touchDist) / step));
    const j0 = Math.max(0, Math.floor((r.y - touchDist) / step));
    const j1 = Math.min(rows - 1, Math.ceil((r.y + r.h + touchDist) / step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = nodeX(i);
        const y = nodeY(j);
        const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
        const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
        if (dx * dx + dy * dy <= touchDist * touchDist) out.push(j * cols + i);
      }
    }
    return out;
  });

  const visited = new Uint8Array(cols * rows);
  const removed = new Uint8Array(solids.length);
  const queue: number[] = [];
  const isFree = (n: number): boolean => inField[n] === 1 && (blockedCount[n] ?? 0) === 0;

  // Seed: free nodes in the band just above the paddle.
  const seedRow = Math.floor((PADDLE.y - PADDLE.height - BALL.radius - 4) / step);
  for (let i = 0; i < cols; i++) {
    const n = seedRow * cols + i;
    if (isFree(n)) {
      visited[n] = 1;
      queue.push(n);
    }
  }

  let reached = 0;
  let progress = true;
  while (progress) {
    progress = false;
    while (queue.length > 0) {
      const n = queue.pop() as number;
      const i = n % cols;
      const j = (n - i) / cols;
      const neighbours = [i > 0 ? n - 1 : -1, i < cols - 1 ? n + 1 : -1, j > 0 ? n - cols : -1, j < rows - 1 ? n + cols : -1];
      for (const m of neighbours) {
        if (m < 0 || visited[m] === 1 || !isFree(m)) continue;
        visited[m] = 1;
        queue.push(m);
      }
    }
    // Remove every brick that touches reachable space, then keep flooding through the hole.
    solids.forEach((solid, si) => {
      if (solid.brick < 0 || removed[si] === 1) return;
      const touches = (touchNodes[si] ?? []).some((n) => visited[n] === 1);
      if (!touches) return;
      removed[si] = 1;
      reached++;
      progress = true;
      const r = solid.rect;
      const i0 = Math.max(0, Math.floor((r.x - clearance) / step));
      const i1 = Math.min(cols - 1, Math.ceil((r.x + r.w + clearance) / step));
      const j0 = Math.max(0, Math.floor((r.y - clearance) / step));
      const j1 = Math.min(rows - 1, Math.ceil((r.y + r.h + clearance) / step));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const n = j * cols + i;
          const list = blockers[n];
          if (!list || !list.includes(si)) continue;
          blockedCount[n] = (blockedCount[n] ?? 1) - 1;
          if (visited[n] === 1 || !isFree(n)) continue;
          // Only continue flooding from nodes adjacent to already-visited space.
          const ii = n % cols;
          const jj = (n - ii) / cols;
          const adj = [ii > 0 ? n - 1 : -1, ii < cols - 1 ? n + 1 : -1, jj > 0 ? n - cols : -1, jj < rows - 1 ? n + cols : -1];
          if (adj.some((a) => a >= 0 && visited[a] === 1)) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    });
    if (queue.length === 0 && progress) {
      // Newly freed nodes may only connect through other newly freed nodes; rescan once.
      for (let n = 0; n < cols * rows; n++) {
        if (visited[n] === 1 || !isFree(n)) continue;
        const ii = n % cols;
        const jj = (n - ii) / cols;
        const adj = [ii > 0 ? n - 1 : -1, ii < cols - 1 ? n + 1 : -1, jj > 0 ? n - cols : -1, jj < rows - 1 ? n + cols : -1];
        if (adj.some((a) => a >= 0 && visited[a] === 1)) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }
  }
  return reached;
}
