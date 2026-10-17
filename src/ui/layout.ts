import { WORLD } from '../config/tuning';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Layout {
  width: number;
  height: number;
  safe: Insets;
  hudHeight: number;
  bottomHeight: number;
  field: { x: number; y: number; w: number; h: number };
  /** CSS pixels per world unit. */
  scale: number;
}

const ASPECT = WORLD.width / WORLD.height;

/** Device pixel ratio used for rendering (capped to keep fill-rate reasonable on phones). */
export const MAX_RENDER_DPR = 2.5;

export function renderDpr(): number {
  return Math.min(MAX_RENDER_DPR, window.devicePixelRatio || 1);
}

/**
 * Portrait layout: HUD on top, the fixed-aspect playfield in the middle (as large as possible)
 * and the power inventory below it, all inside the safe area (cutouts, status and navigation bars).
 */
export function computeLayout(width: number, height: number, safe: Insets): Layout {
  const hudHeight = Math.round(Math.min(64, Math.max(46, height * 0.068)));
  const bottomHeight = Math.round(Math.min(78, Math.max(58, height * 0.085)));
  const gutter = 6;
  const availW = Math.max(100, width - safe.left - safe.right - gutter * 2);
  const availH = Math.max(150, height - safe.top - safe.bottom - hudHeight - bottomHeight - gutter * 2);
  const fieldW = Math.floor(Math.min(availW, availH * ASPECT));
  const fieldH = Math.floor(fieldW / ASPECT);
  const extra = availH - fieldH;
  const x = Math.round(safe.left + (width - safe.left - safe.right - fieldW) / 2);
  const y = Math.round(safe.top + gutter + hudHeight + extra * 0.55);
  return { width, height, safe, hudHeight, bottomHeight, field: { x, y, w: fieldW, h: fieldH }, scale: fieldW / WORLD.width };
}

let probe: HTMLDivElement | null = null;

export function readSafeInsets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const read = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return { top: read(cs.paddingTop), right: read(cs.paddingRight), bottom: read(cs.paddingBottom), left: read(cs.paddingLeft) };
}

export function applyLayoutVars(layout: Layout): void {
  const root = document.documentElement.style;
  root.setProperty('--field-x', `${layout.field.x}px`);
  root.setProperty('--field-y', `${layout.field.y}px`);
  root.setProperty('--field-w', `${layout.field.w}px`);
  root.setProperty('--field-h', `${layout.field.h}px`);
  root.setProperty('--hud-h', `${layout.hudHeight}px`);
  root.setProperty('--bottom-h', `${layout.bottomHeight}px`);
  root.setProperty('--world-scale', String(layout.scale));
}
