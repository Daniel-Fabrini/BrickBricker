import { BALL, WORLD } from '../config/tuning';
import { cosmeticById, type BallSkin, type BurstStyle, type PaddleSkin, type TrailStyle } from '../core/meta/cosmetics';
import { paintBall, paintPaddle } from './painter';
import { hex, rgba, type ThemePalette } from './themes';

/** Small preview images for the collection screen, drawn in the active theme. */
export function cosmeticPreview(theme: ThemePalette, id: string): string {
  const def = cosmeticById(id);
  if (!def) return '';
  switch (def.category) {
    case 'ball':
      return paintBall(theme, def.variant as BallSkin).canvas.toDataURL('image/png');
    case 'paddle':
      return paintPaddle(theme, def.variant as PaddleSkin).canvas.toDataURL('image/png');
    case 'trail':
      return trailPreview(theme, def.variant as TrailStyle);
    case 'burst':
      return burstPreview(theme, def.variant as BurstStyle);
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function trailPreview(theme: ThemePalette, style: TrailStyle): string {
  const made = canvas(160, 64);
  if (!made) return '';
  const [c, ctx] = made;
  ctx.imageSmoothingEnabled = !theme.pixelArt;
  const r = BALL.radius * 2;
  for (let i = 9; i >= 1 && style !== 'none'; i--) {
    if (style === 'dots' && i % 2 === 1) continue;
    const k = 1 - i / 10;
    const color = style === 'rainbow' ? (theme.rowColors[i % theme.rowColors.length] ?? theme.ballGlow) : theme.ballGlow;
    ctx.fillStyle = rgba(color, (style === 'ribbon' ? 0.5 : 0.4) * k + 0.1);
    const size = style === 'ribbon' ? r * (0.4 + 0.6 * k) : style === 'sparkle' ? r * 0.35 * (1 + ((i * 7) % 3)) : r * 0.6 * k + 2;
    const x = 130 - i * 12;
    const y = 32 + Math.sin(i * 0.6) * 8;
    if (theme.pixelArt) ctx.fillRect(x - size / 2, y - size / 2, size, size);
    else {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = hex(theme.ball);
  ctx.beginPath();
  ctx.arc(136, 32, r, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL('image/png');
}

function burstPreview(theme: ThemePalette, style: BurstStyle): string {
  const made = canvas(120, 72);
  if (!made) return '';
  const [c, ctx] = made;
  const cx = 60;
  const cy = 36;
  const colors = theme.rowColors;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = 14 + (i % 3) * 8;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.7;
    const color = style === 'confetti' ? (colors[i % colors.length] ?? 0xffffff) : (colors[2] ?? 0xffffff);
    ctx.fillStyle = hex(color);
    ctx.strokeStyle = hex(color);
    switch (style) {
      case 'pixels':
        ctx.fillRect(Math.round(x), Math.round(y), 5, 5);
        break;
      case 'confetti':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a * 2);
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
        break;
      case 'rings':
        if (i === 0) {
          for (const rr of [10, 20, 30]) {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        break;
      case 'stars': {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const sa = -Math.PI / 2 + (k * Math.PI) / 5;
          const rad = k % 2 === 0 ? 5 : 2.2;
          ctx.lineTo(x + Math.cos(sa) * rad, y + Math.sin(sa) * rad);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      default:
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a + 1.2) * 4, y + Math.sin(a + 1.2) * 4);
        ctx.closePath();
        ctx.fill();
    }
  }
  ctx.fillStyle = rgba(colors[2] ?? 0xffffff, 0.35);
  ctx.fillRect(cx - WORLD.cellW / 2, cy - WORLD.cellH / 2, WORLD.cellW, WORLD.cellH);
  return c.toDataURL('image/png');
}
