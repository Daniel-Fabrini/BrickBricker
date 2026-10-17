import type { CollectibleKind, ThemeId } from '../core/types';

/**
 * Visual themes. They only describe colours and drawing styles; nothing here is read by the
 * simulation, so switching theme can never change physics, layouts, difficulty or scoring.
 */
export interface ThemePalette {
  id: ThemeId;
  /** Texture pixels per world unit. Retro uses 1:1 pixel art with nearest filtering. */
  texScale: number;
  pixelArt: boolean;
  glow: boolean;
  fieldFill: number;
  fieldFillAlpha: number;
  fieldBorder: number;
  rowColors: number[];
  resistantColors: number[];
  special: number;
  specialAccent: number;
  wall: number;
  wallEdge: number;
  steel: number;
  steelEdge: number;
  gate: number;
  gateWarn: number;
  slider: number;
  paddle: number;
  paddleAccent: number;
  ball: number;
  ballGlow: number;
  outline: number;
  piercing: number;
  explosive: number;
  power: Record<CollectibleKind, number>;
  text: string;
  fontFamily: string;
}

export const RETRO: ThemePalette = {
  id: 'retro',
  texScale: 1,
  pixelArt: true,
  glow: false,
  fieldFill: 0x05051a,
  fieldFillAlpha: 0.88,
  fieldBorder: 0x5a5aa8,
  rowColors: [0xe83b3b, 0xf7941d, 0xf9e04b, 0x52c84a, 0x3ccde8, 0x3b6fe8, 0xa14be8],
  resistantColors: [0x9aa0b4, 0xb8a46a, 0xc77d4a, 0xc24b6b],
  special: 0xffc93c,
  specialAccent: 0xb5651d,
  wall: 0x4b4f6b,
  wallEdge: 0x8b90b8,
  steel: 0x7d8597,
  steelEdge: 0xd8dde8,
  gate: 0x3ccde8,
  gateWarn: 0xf9e04b,
  slider: 0xe8e8f0,
  paddle: 0xd8dde8,
  paddleAccent: 0xe83b3b,
  ball: 0xffffff,
  ballGlow: 0xffffff,
  outline: 0x000000,
  piercing: 0xff6b3d,
  explosive: 0xff3d3d,
  power: { multiball: 0x3ccde8, piercing: 0xf7941d, explosion: 0xe83b3b, extraLife: 0x52c84a },
  text: '#ffffff',
  fontFamily: '"Press Start 2P", ui-monospace, monospace',
};

export const NEON: ThemePalette = {
  id: 'neon',
  texScale: 4,
  pixelArt: false,
  glow: true,
  fieldFill: 0x07021a,
  fieldFillAlpha: 0.72,
  fieldBorder: 0x00e5ff,
  rowColors: [0xff2bd6, 0xff5e8a, 0xff9f1c, 0xffe14d, 0x39ff88, 0x00e5ff, 0x8a5cff],
  resistantColors: [0x7cf9ff, 0xa98bff, 0xff7af0, 0xffffff],
  special: 0xfff3a0,
  specialAccent: 0xffb300,
  wall: 0x141a4a,
  wallEdge: 0x3d7bff,
  steel: 0x2a2f45,
  steelEdge: 0xb8c7ff,
  gate: 0x00e5ff,
  gateWarn: 0xff2bd6,
  slider: 0xff9f1c,
  paddle: 0x00e5ff,
  paddleAccent: 0xff2bd6,
  ball: 0xffffff,
  ballGlow: 0x7cf9ff,
  outline: 0xff2bd6,
  piercing: 0xff9f1c,
  explosive: 0xff3d6e,
  power: { multiball: 0x00e5ff, piercing: 0xff9f1c, explosion: 0xff2b6e, extraLife: 0x39ff88 },
  text: '#e8f7ff',
  fontFamily: 'Orbitron, system-ui, sans-serif',
};

export const THEMES: Record<ThemeId, ThemePalette> = { retro: RETRO, neon: NEON };

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function shade(color: number, factor: number): number {
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(factor >= 0 ? c + (255 - c) * factor : c * (1 + factor))));
  const r = f((color >> 16) & 0xff);
  const g = f((color >> 8) & 0xff);
  const b = f(color & 0xff);
  return (r << 16) | (g << 8) | b;
}
