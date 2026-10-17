import { OBSTACLES, WORLD } from '../../config/tuning';
import type { Rect } from '../math';
import type { GateDef, SliderDef } from './types';

export function cellRect(col: number, row: number): Rect {
  return {
    x: col * WORLD.cellW,
    y: WORLD.gridTop + row * WORLD.cellH,
    w: WORLD.cellW,
    h: WORLD.cellH,
  };
}

export function cellIndex(col: number, row: number): number {
  return row * WORLD.gridCols + col;
}

export function inGrid(col: number, row: number): boolean {
  return col >= 0 && col < WORLD.gridCols && row >= 0 && row < WORLD.gridMaxRows;
}

export function gateRect(gate: Pick<GateDef, 'col' | 'row' | 'w' | 'h'>): Rect {
  return {
    x: gate.col * WORLD.cellW,
    y: WORLD.gridTop + gate.row * WORLD.cellH,
    w: gate.w * WORLD.cellW,
    h: gate.h * WORLD.cellH,
  };
}

export interface SliderPose {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
}

/** Deterministic slider pose at simulation time t (ping-pong between minX and maxX). */
export function sliderPose(slider: SliderDef, t: number): SliderPose {
  const w = slider.widthCells * WORLD.cellW;
  const h = OBSTACLES.sliderHeight;
  const y = WORLD.gridTop + slider.row * WORLD.cellH + (WORLD.cellH - h) / 2;
  const span = Math.max(0, slider.maxX - slider.minX);
  if (span === 0 || slider.speed <= 0) return { x: slider.minX, y, w, h, vx: 0 };
  const period = (2 * span) / slider.speed;
  let u = (t / period + slider.phase) % 1;
  if (u < 0) u += 1;
  const forward = u < 0.5;
  const tri = forward ? u * 2 : 2 - u * 2;
  return { x: slider.minX + tri * span, y, w, h, vx: forward ? slider.speed : -slider.speed };
}

export interface GatePhase {
  /** Whether the gate wants to be closed at this time (it may stay open while a ball is inside). */
  wantsClosed: boolean;
  /** True during the warning period right before closing. */
  warning: boolean;
  /** 0..1 progress through the current open or closed phase. */
  progress: number;
}

export function gatePhase(gate: GateDef, t: number): GatePhase {
  const period = gate.openTime + gate.closedTime;
  let local = (t + gate.offset) % period;
  if (local < 0) local += period;
  if (local < gate.openTime) {
    return {
      wantsClosed: false,
      warning: local >= gate.openTime - OBSTACLES.gateWarnTime,
      progress: local / gate.openTime,
    };
  }
  return { wantsClosed: true, warning: false, progress: (local - gate.openTime) / gate.closedTime };
}
