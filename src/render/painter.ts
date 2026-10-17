import { BALL, OBSTACLES, PADDLE, POWERS, WORLD } from '../config/tuning';
import type { BallSkin, PaddleSkin } from '../core/meta/cosmetics';
import type { StaticDef } from '../core/level/types';
import { hashSeed, Rng } from '../core/rng';
import type { CollectibleKind } from '../core/types';
import { hex, rgba, shade, type ThemePalette } from './themes';

/**
 * Procedural sprite painter (Canvas 2D). All game art is generated at runtime from the theme
 * palette, so the app ships no image assets and both themes stay pixel-consistent with the world
 * geometry. Drawing happens in world units; `texScale` converts to texture pixels.
 */
export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Size in world units excluding padding. */
  w: number;
  h: number;
  /** Padding (world units) added on every side, e.g. for glow. */
  pad: number;
  scale: number;
}

type Ctx = CanvasRenderingContext2D;

function makeSprite(theme: ThemePalette, w: number, h: number, pad: number, draw: (ctx: Ctx) => void, scaleOverride?: number): Sprite {
  const scale = scaleOverride ?? theme.texScale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((w + pad * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((h + pad * 2) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = !theme.pixelArt;
  ctx.scale(scale, scale);
  ctx.translate(pad, pad);
  draw(ctx);
  return { canvas, w, h, pad, scale };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// 5x5 pixel glyphs for retro icons.
const GLYPHS: Record<string, string[]> = {
  M: ['1...1', '11.11', '1.1.1', '1...1', '1...1'],
  P: ['1111.', '1...1', '1111.', '1....', '1....'],
  E: ['11111', '1....', '1111.', '1....', '11111'],
  '?': ['.111.', '1...1', '..11.', '.....', '..1..'],
  H: ['.1.1.', '11111', '11111', '.111.', '..1..'],
};

function glyph(ctx: Ctx, ch: string, x: number, y: number, size: number, color: string): void {
  const rows = GLYPHS[ch];
  if (!rows) return;
  ctx.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '1') ctx.fillRect(x + c * size, y + r * size, size, size);
  });
}

// ------------------------------------------------------------------ bricks

export type BrickVisualKind = 'standard' | 'resistant' | 'special' | 'steel';

export function brickColor(theme: ThemePalette, kind: BrickVisualKind, row: number, maxHp: number): number {
  if (kind === 'special') return theme.special;
  if (kind === 'steel') return theme.steel;
  if (kind === 'resistant') return theme.resistantColors[Math.min(theme.resistantColors.length - 1, Math.max(0, maxHp - 2))] ?? theme.steel;
  return theme.rowColors[((row % theme.rowColors.length) + theme.rowColors.length) % theme.rowColors.length] ?? 0xffffff;
}

export function paintBrick(theme: ThemePalette, kind: BrickVisualKind, color: number, hp: number, maxHp: number): Sprite {
  const w = WORLD.cellW;
  const h = WORLD.cellH;
  return theme.pixelArt
    ? makeSprite(theme, w, h, 0, (ctx) => retroBrick(ctx, theme, kind, color, hp, maxHp, w, h))
    : makeSprite(theme, w, h, 3, (ctx) => neonBrick(ctx, theme, kind, color, hp, maxHp, w, h));
}

function retroBrick(ctx: Ctx, theme: ThemePalette, kind: BrickVisualKind, color: number, hp: number, maxHp: number, w: number, h: number): void {
  const damage = Math.max(0, maxHp - hp);
  const base = kind === 'resistant' ? shade(color, -0.12 * damage) : color;
  px(ctx, hex(base), 0, 0, w, h);
  px(ctx, hex(shade(base, 0.4)), 0, 0, w - 1, 1);
  px(ctx, hex(shade(base, 0.4)), 0, 0, 1, h - 1);
  px(ctx, hex(shade(base, -0.45)), 1, h - 2, w - 1, 1);
  px(ctx, hex(shade(base, -0.45)), w - 2, 1, 1, h - 2);
  px(ctx, '#000000', 0, h - 1, w, 1);
  px(ctx, '#000000', w - 1, 0, 1, h);
  if (kind === 'steel') {
    const rivet = hex(theme.steelEdge);
    for (const [x, y] of [
      [3, 3],
      [w - 5, 3],
      [3, h - 5],
      [w - 5, h - 5],
    ] as const)
      px(ctx, rivet, x, y, 2, 2);
    px(ctx, hex(shade(base, 0.25)), 8, 4, 14, 1);
    px(ctx, hex(shade(base, 0.25)), 8, 7, 14, 1);
    return;
  }
  if (kind === 'special') {
    glyph(ctx, '?', w / 2 - 5, 2, 2, hex(theme.specialAccent));
    if (maxHp > 1) {
      px(ctx, hex(theme.specialAccent), 2, 2, 2, h - 5);
      px(ctx, hex(theme.specialAccent), w - 5, 2, 2, h - 5);
    }
    if (damage > 0) crackPixels(ctx, w, h, damage, 0x000000);
    return;
  }
  if (kind === 'resistant') {
    // Remaining hit points as pips, cracks for each hit taken.
    const pip = hex(shade(base, 0.6));
    const start = Math.round(w / 2 - (hp * 4 - 2) / 2);
    for (let i = 0; i < hp; i++) px(ctx, pip, start + i * 4, 6, 2, 2);
    px(ctx, hex(shade(base, 0.2)), 2, 3, w - 5, 1);
    if (damage > 0) crackPixels(ctx, w, h, damage, 0x000000);
  }
}

function crackPixels(ctx: Ctx, w: number, h: number, damage: number, color: number): void {
  const rng = new Rng(hashSeed('crack', damage));
  const c = hex(color);
  for (let d = 0; d < damage; d++) {
    let x = rng.int(4, w - 6);
    let y = 1;
    while (y < h - 2) {
      px(ctx, c, x, y);
      y += 1;
      x += rng.int(-1, 1);
      x = Math.max(2, Math.min(w - 3, x));
    }
  }
}

function neonBrick(ctx: Ctx, theme: ThemePalette, kind: BrickVisualKind, color: number, hp: number, maxHp: number, w: number, h: number): void {
  const damage = Math.max(0, maxHp - hp);
  const inset = 1.1;
  const strength = kind === 'resistant' ? 0.35 + 0.65 * (hp / maxHp) : 1;
  ctx.shadowColor = rgba(color, 0.9 * strength);
  ctx.shadowBlur = 2.5 * 4;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, 2.5);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(color, kind === 'steel' ? 0.55 : 0.42 * strength + 0.08));
  grad.addColorStop(1, rgba(color, kind === 'steel' ? 0.35 : 0.14 * strength + 0.04));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = kind === 'resistant' ? 1.6 : 1.2;
  ctx.strokeStyle = rgba(kind === 'steel' ? theme.steelEdge : color, kind === 'resistant' ? 0.55 + 0.45 * strength : 1);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (kind === 'steel') {
    ctx.strokeStyle = rgba(theme.steelEdge, 0.35);
    ctx.lineWidth = 0.6;
    for (let x = 4; x < w; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, h - 2.5);
      ctx.lineTo(x + 3, 2.5);
      ctx.stroke();
    }
    return;
  }
  if (kind === 'resistant') {
    roundRect(ctx, 3.2, 3.2, w - 6.4, h - 6.4, 1.5);
    ctx.strokeStyle = rgba(color, 0.5 * strength);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = rgba(0xffffff, 0.95);
    ctx.shadowColor = rgba(color, 1);
    ctx.shadowBlur = 4;
    const start = w / 2 - ((hp - 1) * 3.2) / 2;
    for (let i = 0; i < hp; i++) {
      ctx.beginPath();
      ctx.arc(start + i * 3.2, h / 2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  if (kind === 'special') {
    ctx.fillStyle = rgba(theme.specialAccent, 0.95);
    ctx.shadowColor = rgba(theme.specialAccent, 1);
    ctx.shadowBlur = 6;
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4.2);
    ctx.lineTo(cx + 4.2, cy);
    ctx.lineTo(cx, cy + 4.2);
    ctx.lineTo(cx - 4.2, cy);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    if (maxHp > 1) {
      roundRect(ctx, 2.6, 2.6, w - 5.2, h - 5.2, 1.5);
      ctx.strokeStyle = rgba(theme.specialAccent, 0.8);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  if (damage > 0) {
    const rng = new Rng(hashSeed('neoncrack', damage));
    ctx.strokeStyle = rgba(0xffffff, 0.75);
    ctx.lineWidth = 0.5;
    for (let d = 0; d < damage; d++) {
      let x = rng.float(5, w - 5);
      let y = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < h - 2) {
        y += rng.float(1.5, 3);
        x += rng.float(-2.2, 2.2);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ walls

export function paintWallLayer(theme: ThemePalette, statics: StaticDef[], rows: number): Sprite {
  const walls = statics.filter((s) => s.kind === 'wall');
  const set = new Set(walls.map((s) => `${s.col},${s.row}`));
  const has = (c: number, r: number): boolean => set.has(`${c},${r}`);
  const height = WORLD.gridTop + Math.max(1, rows) * WORLD.cellH;
  const scale = theme.pixelArt ? 1 : 2;
  return makeSprite(
    theme,
    WORLD.width,
    height,
    0,
    (ctx) => {
      for (const s of walls) {
        const x = s.col * WORLD.cellW;
        const y = WORLD.gridTop + s.row * WORLD.cellH;
        const w = WORLD.cellW;
        const h = WORLD.cellH;
        if (theme.pixelArt) {
          px(ctx, hex(theme.wall), x, y, w, h);
          // Mortar lines in a running-bond pattern.
          const mortar = hex(shade(theme.wall, -0.35));
          px(ctx, mortar, x, y + 7, w, 1);
          px(ctx, mortar, x + (s.row % 2 === 0 ? 10 : 20), y, 1, 7);
          px(ctx, mortar, x + (s.row % 2 === 0 ? 20 : 10), y + 8, 1, 7);
          const edge = hex(theme.wallEdge);
          if (!has(s.col, s.row - 1)) px(ctx, edge, x, y, w, 1);
          if (!has(s.col - 1, s.row)) px(ctx, edge, x, y, 1, h);
          const dark = hex(shade(theme.wall, -0.55));
          if (!has(s.col, s.row + 1)) px(ctx, dark, x, y + h - 1, w, 1);
          if (!has(s.col + 1, s.row)) px(ctx, dark, x + w - 1, y, 1, h);
        } else {
          ctx.fillStyle = rgba(theme.wall, 0.95);
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = rgba(theme.wallEdge, 0.18);
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y + h);
          ctx.lineTo(x + w, y);
          ctx.stroke();
        }
      }
      if (!theme.pixelArt) {
        ctx.strokeStyle = hex(theme.wallEdge);
        ctx.shadowColor = rgba(theme.wallEdge, 1);
        ctx.shadowBlur = 5;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const s of walls) {
          const x = s.col * WORLD.cellW;
          const y = WORLD.gridTop + s.row * WORLD.cellH;
          if (!has(s.col, s.row - 1)) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + WORLD.cellW, y);
          }
          if (!has(s.col, s.row + 1)) {
            ctx.moveTo(x, y + WORLD.cellH);
            ctx.lineTo(x + WORLD.cellW, y + WORLD.cellH);
          }
          if (!has(s.col - 1, s.row)) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + WORLD.cellH);
          }
          if (!has(s.col + 1, s.row)) {
            ctx.moveTo(x + WORLD.cellW, y);
            ctx.lineTo(x + WORLD.cellW, y + WORLD.cellH);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    },
    scale,
  );
}

// ------------------------------------------------------------------ paddle, ball, slider

export function paintPaddle(theme: ThemePalette, skin: PaddleSkin): Sprite {
  const w = PADDLE.width;
  const h = PADDLE.height;
  if (theme.pixelArt) {
    return makeSprite(theme, w, h, 0, (ctx) => {
      const body = skin === 'chrome' ? 0xc8d0e0 : skin === 'arcade' ? 0xf9e04b : theme.paddle;
      const accent = skin === 'arcade' ? 0x202020 : skin === 'glitch' ? 0x3ccde8 : theme.paddleAccent;
      px(ctx, hex(body), 4, 1, w - 8, h - 2);
      px(ctx, hex(shade(body, 0.5)), 4, 1, w - 8, 2);
      px(ctx, hex(shade(body, -0.45)), 4, h - 3, w - 8, 2);
      // Rounded end caps.
      px(ctx, hex(accent), 0, 3, 4, h - 6);
      px(ctx, hex(accent), 1, 2, 3, h - 4);
      px(ctx, hex(accent), w - 4, 3, 4, h - 6);
      px(ctx, hex(accent), w - 4, 2, 3, h - 4);
      px(ctx, hex(accent), 4, 1, 6, h - 2);
      px(ctx, hex(accent), w - 10, 1, 6, h - 2);
      if (skin === 'striped') for (let x = 14; x < w - 14; x += 6) px(ctx, hex(theme.paddleAccent), x, 3, 3, h - 6);
      if (skin === 'chrome') px(ctx, '#ffffff', 12, 3, w - 24, 1);
      if (skin === 'arcade') for (let x = 12; x < w - 12; x += 6) px(ctx, '#202020', x, 3, 3, h - 6);
      if (skin === 'glitch') {
        const rng = new Rng(7);
        for (let i = 0; i < 8; i++) px(ctx, hex(rng.pick([0xff2bd6, 0x3ccde8, 0xffffff])), rng.int(10, w - 14), rng.int(2, h - 4), rng.int(2, 6), 1);
      }
    });
  }
  return makeSprite(theme, w, h, 5, (ctx) => {
    const main = skin === 'chrome' ? 0xdfe8ff : skin === 'arcade' ? 0xffe14d : skin === 'glitch' ? 0xff2bd6 : theme.paddle;
    ctx.shadowColor = rgba(main, 1);
    ctx.shadowBlur = 14;
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, h / 2);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(0xffffff, 0.95));
    grad.addColorStop(0.35, rgba(main, 0.9));
    grad.addColorStop(1, rgba(shade(main, -0.5), 0.9));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(0xffffff, 0.8);
    ctx.stroke();
    ctx.fillStyle = rgba(theme.paddleAccent, 0.9);
    if (skin === 'striped') for (let x = 12; x < w - 12; x += 7) ctx.fillRect(x, 2.5, 2.5, h - 5);
    if (skin === 'arcade') for (let x = 10; x < w - 10; x += 6) ctx.fillRect(x, 2.5, 3, h - 5);
    if (skin === 'glitch') {
      const rng = new Rng(11);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = rgba(rng.pick([0x00e5ff, 0xffffff, 0x39ff88]), 0.85);
        ctx.fillRect(rng.float(6, w - 12), rng.float(2, h - 4), rng.float(2, 7), 1);
      }
    }
    if (skin === 'classic' || skin === 'chrome') {
      ctx.fillStyle = rgba(theme.paddleAccent, 0.95);
      roundRect(ctx, 2, 2, 8, h - 4, (h - 4) / 2);
      ctx.fill();
      roundRect(ctx, w - 10, 2, 8, h - 4, (h - 4) / 2);
      ctx.fill();
    }
  });
}

export function paintBall(theme: ThemePalette, skin: BallSkin, color: number = theme.ball): Sprite {
  const d = BALL.radius * 2;
  const r = BALL.radius;
  if (theme.pixelArt) {
    return makeSprite(theme, d, d, 0, (ctx) => {
      const c = hex(color);
      const dark = hex(shade(color, -0.45));
      const shape: Record<BallSkin, string[]> = {
        classic: ['....1111....', '..11111111..', '.1111111111.', '.1111111111.', '111111111111', '111111111111', '111111111111', '111111111111', '.1111111111.', '.1111111111.', '..11111111..', '....1111....'],
        ring: ['....1111....', '..11111111..', '.111....111.', '.11......11.', '111..11..111', '11..1111..11', '11..1111..11', '111..11..111', '.11......11.', '.111....111.', '..11111111..', '....1111....'],
        star: ['.....11.....', '.....11.....', '....1111....', '111111111111', '.1111111111.', '..11111111..', '...111111...', '..11111111..', '..111..111..', '.111....111.', '.11......11.', '............'],
        core: ['....1111....', '..11....11..', '.1........1.', '.1..1111..1.', '1..111111..1', '1..111111..1', '1..111111..1', '1..111111..1', '.1..1111..1.', '.1........1.', '..11....11..', '....1111....'],
        gem: ['.....11.....', '....1111....', '...111111...', '..11111111..', '.1111111111.', '111111111111', '111111111111', '.1111111111.', '..11111111..', '...111111...', '....1111....', '.....11.....'],
      };
      shape[skin].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '1') px(ctx, y > 7 ? dark : c, x, y);
      });
      if (skin === 'classic' || skin === 'gem') px(ctx, '#ffffff', 3, 3, 2, 2);
    });
  }
  return makeSprite(theme, d, d, 6, (ctx) => {
    ctx.shadowColor = rgba(theme.ballGlow, 1);
    ctx.shadowBlur = 16;
    ctx.fillStyle = rgba(color, 1);
    ctx.strokeStyle = rgba(color, 1);
    switch (skin) {
      case 'classic':
        ctx.beginPath();
        ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r, r, r - 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r, r, 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'star': {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = i % 2 === 0 ? r : r * 0.45;
          ctx.lineTo(r + Math.cos(a) * rad, r + Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'core':
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r, r, r - 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r, r, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'gem':
        ctx.beginPath();
        ctx.moveTo(r, 0.3);
        ctx.lineTo(d - 0.3, r);
        ctx.lineTo(r, d - 0.3);
        ctx.lineTo(0.3, r);
        ctx.closePath();
        ctx.fill();
        break;
    }
    ctx.shadowBlur = 0;
  });
}

export function paintSlider(theme: ThemePalette, widthCells: number): Sprite {
  const w = widthCells * WORLD.cellW;
  const h = OBSTACLES.sliderHeight;
  if (theme.pixelArt) {
    return makeSprite(theme, w, h, 0, (ctx) => {
      px(ctx, hex(theme.slider), 0, 0, w, h);
      for (let x = 0; x < w; x += 8) px(ctx, hex(theme.paddleAccent), x, 2, 4, h - 4);
      px(ctx, '#000000', 0, h - 1, w, 1);
    });
  }
  return makeSprite(theme, w, h, 4, (ctx) => {
    ctx.shadowColor = rgba(theme.slider, 1);
    ctx.shadowBlur = 10;
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 2);
    ctx.fillStyle = rgba(theme.slider, 0.35);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hex(theme.slider);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(theme.slider, 0.85);
    for (let x = 6; x < w - 4; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, h - 2);
      ctx.lineTo(x + 4, 2);
      ctx.lineTo(x + 6, 2);
      ctx.lineTo(x + 2, h - 2);
      ctx.closePath();
      ctx.fill();
    }
  });
}

// ------------------------------------------------------------------ collectibles & icons

function drawPowerSymbol(ctx: Ctx, theme: ThemePalette, kind: CollectibleKind, cx: number, cy: number, size: number, color: string): void {
  if (theme.pixelArt) {
    const ch = kind === 'multiball' ? 'M' : kind === 'piercing' ? 'P' : kind === 'explosion' ? 'E' : 'H';
    const cell = Math.max(1, Math.round(size / 5));
    glyph(ctx, ch, Math.round(cx - (cell * 5) / 2), Math.round(cy - (cell * 5) / 2), cell, color);
    return;
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.12;
  const s = size / 2;
  switch (kind) {
    case 'multiball':
      for (const [dx, dy] of [
        [-0.5, 0.3],
        [0.5, 0.3],
        [0, -0.5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy + dy * s, s * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'piercing':
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s * 0.15);
      ctx.lineTo(cx + s * 0.25, cy + s * 0.15);
      ctx.lineTo(cx + s * 0.25, cy + s * 0.55);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.15);
      ctx.lineTo(cx - s, cy - s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'explosion':
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const rad = i % 2 === 0 ? s : s * 0.45;
        ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'extraLife':
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.bezierCurveTo(cx - s * 1.3, cy - s * 0.1, cx - s * 0.6, cy - s * 1.1, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.1, cx + s * 1.3, cy - s * 0.1, cx, cy + s * 0.85);
      ctx.fill();
      break;
  }
}

export function paintCollectible(theme: ThemePalette, kind: CollectibleKind): Sprite {
  const w = POWERS.collectibleWidth;
  const h = POWERS.collectibleHeight;
  const color = theme.power[kind];
  if (theme.pixelArt) {
    return makeSprite(theme, w, h, 0, (ctx) => {
      px(ctx, hex(color), 2, 0, w - 4, h);
      px(ctx, hex(color), 0, 2, w, h - 4);
      px(ctx, hex(shade(color, 0.5)), 2, 1, w - 4, 2);
      px(ctx, hex(shade(color, -0.5)), 2, h - 2, w - 4, 1);
      px(ctx, '#000000', 6, 2, w - 12, h - 4);
      drawPowerSymbol(ctx, theme, kind, w / 2, h / 2, 10, hex(color));
    });
  }
  return makeSprite(theme, w, h, 5, (ctx) => {
    ctx.shadowColor = rgba(color, 1);
    ctx.shadowBlur = 12;
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, h / 2);
    ctx.fillStyle = rgba(color, 0.25);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = hex(color);
    ctx.stroke();
    ctx.shadowBlur = 6;
    drawPowerSymbol(ctx, theme, kind, w / 2, h / 2, 9, '#ffffff');
    ctx.shadowBlur = 0;
  });
}

/** Square icon for DOM elements (inventory slots, help, collection). */
export function powerIconDataUrl(theme: ThemePalette, kind: CollectibleKind, sizePx = 96): string {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = !theme.pixelArt;
  const color = theme.power[kind];
  if (theme.pixelArt) {
    const unit = sizePx / 16;
    ctx.scale(unit, unit);
    drawPowerSymbol(ctx, theme, kind, 8, 8, 10, hex(color));
  } else {
    ctx.shadowColor = rgba(color, 1);
    ctx.shadowBlur = sizePx * 0.15;
    drawPowerSymbol(ctx, theme, kind, sizePx / 2, sizePx / 2, sizePx * 0.55, hex(color));
  }
  return canvas.toDataURL('image/png');
}

/** Preview of a cosmetic for the collection screen. */
export function cosmeticPreviewDataUrl(sprite: Sprite): string {
  return sprite.canvas.toDataURL('image/png');
}

// ------------------------------------------------------------------ particles

export type ParticleShape = 'square' | 'circle' | 'star' | 'confetti' | 'ring' | 'spark';

export function paintParticle(theme: ThemePalette, shape: ParticleShape): Sprite {
  const size = shape === 'ring' ? 24 : shape === 'confetti' ? 4 : 3;
  const scale = theme.pixelArt ? 2 : 4;
  return makeSprite(
    theme,
    size,
    shape === 'confetti' ? size / 2 : size,
    shape === 'ring' ? 2 : 0,
    (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      switch (shape) {
        case 'square':
          ctx.fillRect(0, 0, size, size);
          break;
        case 'confetti':
          ctx.fillRect(0, 0, size, size / 2);
          break;
        case 'circle':
        case 'spark': {
          const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(1, shape === 'spark' ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.2)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'star': {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const rad = i % 2 === 0 ? size / 2 : size / 4.5;
            ctx.lineTo(size / 2 + Math.cos(a) * rad, size / 2 + Math.sin(a) * rad);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'ring':
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
    },
    scale,
  );
}
