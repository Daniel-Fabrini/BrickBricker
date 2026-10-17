export const DEG_TO_RAD = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface CircleRectContact {
  /** Closest point on the rectangle to the circle centre. */
  cx: number;
  cy: number;
  /** Penetration depth (> 0 when overlapping). */
  depth: number;
  /** Which region of the rectangle the centre projects onto. */
  region: 'left' | 'right' | 'top' | 'bottom' | 'corner' | 'inside';
  /** Corner flags when region === 'corner'. */
  cornerX: -1 | 1 | 0;
  cornerY: -1 | 1 | 0;
}

/**
 * Circle vs axis-aligned rectangle overlap. Returns null when they do not touch.
 * The region tells the caller whether the contact is on a face or a corner so it can
 * decide how to handle seams between adjacent cells.
 */
export function circleRectContact(px: number, py: number, r: number, rect: Rect): CircleRectContact | null {
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;
  const cx = clamp(px, minX, maxX);
  const cy = clamp(py, minY, maxY);
  const dx = px - cx;
  const dy = py - cy;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return null;

  if (dx === 0 && dy === 0) {
    // Centre inside the rectangle: pick the face of least penetration.
    const left = px - minX;
    const right = maxX - px;
    const top = py - minY;
    const bottom = maxY - py;
    const m = Math.min(left, right, top, bottom);
    if (m === top) return { cx: px, cy: minY, depth: top + r, region: 'top', cornerX: 0, cornerY: 0 };
    if (m === bottom) return { cx: px, cy: maxY, depth: bottom + r, region: 'bottom', cornerX: 0, cornerY: 0 };
    if (m === left) return { cx: minX, cy: py, depth: left + r, region: 'left', cornerX: 0, cornerY: 0 };
    return { cx: maxX, cy: py, depth: right + r, region: 'right', cornerX: 0, cornerY: 0 };
  }

  const dist = Math.sqrt(distSq);
  const depth = r - dist;
  const outX = px < minX ? -1 : px > maxX ? 1 : 0;
  const outY = py < minY ? -1 : py > maxY ? 1 : 0;
  if (outX !== 0 && outY !== 0) {
    return { cx, cy, depth, region: 'corner', cornerX: outX, cornerY: outY };
  }
  if (outX === -1) return { cx, cy, depth, region: 'left', cornerX: 0, cornerY: 0 };
  if (outX === 1) return { cx, cy, depth, region: 'right', cornerX: 0, cornerY: 0 };
  if (outY === -1) return { cx, cy, depth, region: 'top', cornerX: 0, cornerY: 0 };
  return { cx, cy, depth, region: 'bottom', cornerX: 0, cornerY: 0 };
}
