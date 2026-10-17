import Phaser from 'phaser';
import { BALL, PADDLE, WORLD } from '../config/tuning';
import { cellRect } from '../core/level/grid';
import type { BallSkin, BurstStyle, PaddleSkin, TrailStyle } from '../core/meta/cosmetics';
import type { SimEvent } from '../core/sim/events';
import type { GameSimulation } from '../core/sim/simulation';
import type { BrickState } from '../core/sim/state';
import type { CollectibleKind } from '../core/types';
import {
  brickColor,
  paintBall,
  paintBrick,
  paintCollectible,
  paintPaddle,
  paintParticle,
  paintSlider,
  paintWallLayer,
  type BrickVisualKind,
  type ParticleShape,
  type Sprite,
} from './painter';
import { shade, THEMES, type ThemePalette } from './themes';

export interface SceneHost {
  /** Called once per rendered frame with real elapsed seconds. */
  frame(dt: number): void;
}

export interface VisualOptions {
  ball: BallSkin;
  paddle: PaddleSkin;
  trail: TrailStyle;
  burst: BurstStyle;
  ballVisibility: boolean;
  reducedEffects: boolean;
}

export interface FieldRect {
  /** Field position and size in CSS pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

interface BrickView {
  image: Phaser.GameObjects.Image;
  hp: number;
  color: number;
  kind: BrickVisualKind;
}

const TRAIL_LENGTH = 10;

/**
 * Phaser scene that renders a GameSimulation. It reads simulation state every frame and reacts to
 * simulation events with restrained effects. It never changes gameplay state.
 */
export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  private theme: ThemePalette = THEMES.neon;
  private visuals: VisualOptions = {
    ball: 'classic',
    paddle: 'classic',
    trail: 'none',
    burst: 'shards',
    ballVisibility: false,
    reducedEffects: false,
  };
  private sim: GameSimulation | null = null;
  private attachedSim: GameSimulation | null = null;
  private sprites = new Map<string, Sprite>();
  private fieldGfx!: Phaser.GameObjects.Graphics;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private gateGfx!: Phaser.GameObjects.Graphics;
  private wallImage: Phaser.GameObjects.Image | null = null;
  private wallKey: string | null = null;
  private bricks = new Map<number, BrickView>();
  private steel: Phaser.GameObjects.Image[] = [];
  private sliders: Phaser.GameObjects.Image[] = [];
  private paddle!: Phaser.GameObjects.Image;
  private balls: Phaser.GameObjects.Image[] = [];
  private collectibles = new Map<number, Phaser.GameObjects.Image>();
  private emitters = new Map<ParticleShape, Phaser.GameObjects.Particles.ParticleEmitter>();
  private trails = new Map<number, { x: number; y: number }[]>();
  private field: FieldRect = { x: 0, y: 0, w: 360, h: 600, dpr: 1 };
  private ready = false;
  private elapsed = 0;
  private readyCallbacks: (() => void)[] = [];

  constructor() {
    super({ key: 'game' });
  }

  setHost(host: SceneHost | null): void {
    this.host = host;
  }

  whenReady(cb: () => void): void {
    if (this.ready) cb();
    else this.readyCallbacks.push(cb);
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.fieldGfx = this.add.graphics().setDepth(0);
    this.gateGfx = this.add.graphics().setDepth(3);
    this.trailGfx = this.add.graphics().setDepth(6);
    this.overlayGfx = this.add.graphics().setDepth(9);
    this.buildThemeObjects();
    this.applyCamera();
    this.ready = true;
    for (const cb of this.readyCallbacks.splice(0)) cb();
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(0.25, delta / 1000);
    this.elapsed += dt;
    this.host?.frame(dt);
  }

  // ------------------------------------------------------------------ configuration

  setTheme(theme: ThemePalette): void {
    if (this.theme.id === theme.id) return;
    this.theme = theme;
    if (!this.ready) return;
    this.buildThemeObjects();
    this.rebuildLevel();
  }

  setVisuals(visuals: VisualOptions): void {
    const changed = JSON.stringify(visuals) !== JSON.stringify(this.visuals);
    this.visuals = { ...visuals };
    if (!changed || !this.ready) return;
    this.buildThemeObjects();
    this.rebuildLevel();
  }

  setField(rect: FieldRect): void {
    this.field = rect;
    if (this.ready) this.applyCamera();
  }

  /** Displays a simulation. Visuals are rebuilt whenever a new level is attached. */
  attach(sim: GameSimulation | null): void {
    this.sim = sim;
    if (!this.ready) return;
    if (sim !== this.attachedSim || sim === null) this.rebuildLevel();
  }

  // ------------------------------------------------------------------ rendering

  render(alpha: number): void {
    const sim = this.sim;
    if (!this.ready || !sim) return;
    const s = sim.state;
    const t = this.elapsed;

    // Paddle (interpolated).
    const px = s.paddle.px + (s.paddle.x - s.paddle.px) * alpha;
    this.paddle.setPosition(px, PADDLE.y).setVisible(s.phase !== 'complete');

    // Special bricks shimmer gently (disabled with reduced effects).
    if (!this.visuals.reducedEffects) {
      for (const view of this.bricks.values()) {
        if (view.kind === 'special' && view.image.visible) view.image.setAlpha(0.82 + 0.18 * Math.sin(t * 4 + view.image.x * 0.05));
      }
    }

    // Sliders.
    const poses = sim.sliderPoses();
    poses.forEach((pose, i) => this.sliders[i]?.setPosition(pose.x + pose.w / 2, pose.y + pose.h / 2));

    // Gates.
    this.drawGates(sim, t);

    // Balls.
    const piercing = s.effects.piercingTime > 0;
    const armed = s.effects.explosiveCharges > 0;
    const seen = new Set<number>();
    s.balls.forEach((b, i) => {
      const img = this.ballImage(i);
      const x = b.px + (b.x - b.px) * alpha;
      const y = b.py + (b.y - b.py) * alpha;
      img.setPosition(x, y).setVisible(true);
      if (piercing) img.setTint(this.theme.piercing);
      else img.clearTint();
      seen.add(b.id);
      let trail = this.trails.get(b.id);
      if (!trail) {
        trail = [];
        this.trails.set(b.id, trail);
      }
      trail.unshift({ x, y });
      if (trail.length > TRAIL_LENGTH) trail.length = TRAIL_LENGTH;
    });
    for (let i = s.balls.length; i < this.balls.length; i++) this.balls[i]?.setVisible(false);
    for (const id of [...this.trails.keys()]) if (!seen.has(id)) this.trails.delete(id);
    this.drawTrails(piercing);
    this.drawBallOverlays(sim, armed, t);

    // Collectibles.
    const live = new Set<number>();
    for (const c of s.collectibles) {
      live.add(c.id);
      let img = this.collectibles.get(c.id);
      if (!img) {
        img = this.spriteImage(this.collectibleKey(c.kind), () => paintCollectible(this.theme, c.kind)).setDepth(7);
        this.collectibles.set(c.id, img);
      }
      img.setPosition(c.x, c.py + (c.y - c.py) * alpha);
    }
    for (const [id, img] of this.collectibles) {
      if (!live.has(id)) {
        img.destroy();
        this.collectibles.delete(id);
      }
    }
  }

  /** Visual and haptic-free reactions to simulation events. */
  applyEvents(events: SimEvent[]): void {
    if (!this.ready || !this.sim) return;
    const reduced = this.visuals.reducedEffects;
    for (const ev of events) {
      switch (ev.type) {
        case 'brickDamaged': {
          const view = this.bricks.get(ev.brickId);
          if (!view) break;
          view.hp = ev.hp;
          const brick = this.sim.state.bricks[ev.brickId];
          if (brick) view.image.setTexture(this.brickTexture(view.kind, view.color, brick.hp, brick.maxHp));
          if (!reduced) {
            this.tweens.add({ targets: view.image, scaleX: view.image.scaleX * 1.08, scaleY: view.image.scaleY * 1.12, yoyo: true, duration: 60 });
          }
          this.burst('spark', ev.x, ev.y, reduced ? 1 : 3, view.color);
          break;
        }
        case 'brickDestroyed': {
          const view = this.bricks.get(ev.brickId);
          if (view) {
            view.image.setVisible(false);
            this.brickBurst(ev.x, ev.y, view.color, ev.kind === 'special');
          }
          break;
        }
        case 'explosion': {
          this.ring(ev.x, ev.y, 1.6, this.theme.explosive, 320);
          this.burst('spark', ev.x, ev.y, reduced ? 4 : 14, this.theme.explosive);
          if (!reduced) this.cameras.main.shake(140, 0.006);
          break;
        }
        case 'paddleHit':
          if (!reduced) {
            this.tweens.add({ targets: this.paddle, scaleY: this.paddle.scaleY * 0.82, yoyo: true, duration: 50 });
          }
          break;
        case 'powerCaught':
        case 'extraLifeCaught':
        case 'inventoryFull':
          this.ring(this.sim.state.paddle.x, PADDLE.y, 0.8, this.theme.power[ev.type === 'powerCaught' || ev.type === 'inventoryFull' ? ev.power : 'extraLife'], 240);
          break;
        case 'multiball':
          for (const b of this.sim.state.balls) this.ring(b.x, b.y, 0.35, this.theme.power.multiball, 200);
          break;
        case 'lifeLost':
        case 'attemptFailed':
          if (!reduced) {
            this.cameras.main.shake(180, 0.005);
            this.cameras.main.flash(160, 120, 20, 40);
          }
          break;
        case 'levelComplete':
          this.celebrate();
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ building

  private applyCamera(): void {
    const cam = this.cameras.main;
    const zoom = (this.field.w * this.field.dpr) / WORLD.width;
    cam.setZoom(zoom);
    cam.setScroll(-(this.field.x * this.field.dpr) / zoom, -(this.field.y * this.field.dpr) / zoom);
  }

  private buildThemeObjects(): void {
    const theme = this.theme;
    this.fieldGfx.clear();
    this.fieldGfx.fillStyle(theme.fieldFill, theme.fieldFillAlpha);
    this.fieldGfx.fillRect(0, 0, WORLD.width, WORLD.height);
    if (theme.pixelArt) {
      this.fieldGfx.fillStyle(theme.fieldBorder, 1);
      this.fieldGfx.fillRect(-3, -3, WORLD.width + 6, 3);
      this.fieldGfx.fillRect(-3, 0, 3, WORLD.height);
      this.fieldGfx.fillRect(WORLD.width, 0, 3, WORLD.height);
      this.fieldGfx.fillStyle(0xffffff, 0.04);
      for (let y = 0; y < WORLD.height; y += 4) this.fieldGfx.fillRect(0, y, WORLD.width, 1);
    } else {
      for (const [width, alpha] of [
        [6, 0.08],
        [3, 0.18],
        [1.2, 0.9],
      ] as const) {
        this.fieldGfx.lineStyle(width, theme.fieldBorder, alpha);
        this.fieldGfx.beginPath();
        this.fieldGfx.moveTo(0, WORLD.height);
        this.fieldGfx.lineTo(0, 0);
        this.fieldGfx.lineTo(WORLD.width, 0);
        this.fieldGfx.lineTo(WORLD.width, WORLD.height);
        this.fieldGfx.strokePath();
      }
    }

    this.paddle?.destroy();
    this.paddle = this.spriteImage(`${theme.id}:paddle:${this.visuals.paddle}`, () => paintPaddle(theme, this.visuals.paddle)).setDepth(5);
    this.paddle.setPosition(WORLD.width / 2, PADDLE.y);
    for (const b of this.balls) b.destroy();
    this.balls = [];

    for (const e of this.emitters.values()) e.destroy();
    this.emitters.clear();
    const shapes: ParticleShape[] = ['square', 'circle', 'star', 'confetti', 'spark'];
    for (const shape of shapes) {
      const key = `${theme.id}:particle:${shape}`;
      const sprite = this.ensureSprite(key, () => paintParticle(theme, shape));
      const emitter = this.add.particles(0, 0, key, {
        lifespan: { min: 260, max: 560 },
        speed: { min: 30, max: 130 },
        angle: { min: 0, max: 360 },
        scale: { start: 1 / sprite.scale, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: shape === 'confetti' || shape === 'star' ? { min: 0, max: 360 } : 0,
        gravityY: shape === 'confetti' ? 160 : 90,
        blendMode: theme.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
        emitting: false,
      });
      emitter.setDepth(8);
      this.emitters.set(shape, emitter);
    }
  }

  private rebuildLevel(): void {
    for (const view of this.bricks.values()) view.image.destroy();
    this.bricks.clear();
    for (const img of this.steel) img.destroy();
    this.steel = [];
    for (const img of this.sliders) img.destroy();
    this.sliders = [];
    for (const img of this.collectibles.values()) img.destroy();
    this.collectibles.clear();
    this.trails.clear();
    this.wallImage?.destroy();
    this.wallImage = null;
    if (this.wallKey) {
      this.textures.remove(this.wallKey);
      this.sprites.delete(this.wallKey);
      this.wallKey = null;
    }
    this.gateGfx.clear();
    for (const b of this.balls) b.setVisible(false);

    const sim = this.sim;
    this.attachedSim = sim;
    if (!sim) return;
    const s = sim.state;
    const theme = this.theme;

    if (s.statics.some((st) => st.kind === 'wall')) {
      this.wallKey = `${theme.id}:walls:${s.level.key}`;
      const sprite = this.ensureSprite(this.wallKey, () => paintWallLayer(theme, s.statics, s.level.rows));
      this.wallImage = this.add.image(0, 0, this.wallKey).setOrigin(0, 0).setScale(1 / sprite.scale).setDepth(2);
    }
    for (const st of s.statics) {
      if (st.kind !== 'steel') continue;
      const r = cellRect(st.col, st.row);
      const key = `${theme.id}:steel`;
      const img = this.spriteImage(key, () => paintBrick(theme, 'steel', theme.steel, 1, 1)).setDepth(2);
      img.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      this.steel.push(img);
    }
    for (const brick of s.bricks) this.addBrickView(brick);
    for (const pose of sim.sliderPoses()) {
      const cells = Math.round(pose.w / WORLD.cellW);
      const img = this.spriteImage(`${theme.id}:slider:${cells}`, () => paintSlider(theme, cells)).setDepth(3);
      img.setPosition(pose.x + pose.w / 2, pose.y + pose.h / 2);
      this.sliders.push(img);
    }
    this.render(1);
  }

  private addBrickView(brick: BrickState): void {
    if (!brick.alive) return;
    const r = cellRect(brick.col, brick.row);
    const kind: BrickVisualKind = brick.kind;
    const color = brickColor(this.theme, kind, brick.row, brick.maxHp);
    const key = this.brickTexture(kind, color, brick.hp, brick.maxHp);
    const sprite = this.sprites.get(key);
    const img = this.add.image(r.x + r.w / 2, r.y + r.h / 2, key).setDepth(4);
    if (sprite) img.setScale(1 / sprite.scale);
    this.bricks.set(brick.id, { image: img, hp: brick.hp, color, kind });
  }

  private brickTexture(kind: BrickVisualKind, color: number, hp: number, maxHp: number): string {
    const key = `${this.theme.id}:brick:${kind}:${color}:${hp}:${maxHp}`;
    this.ensureSprite(key, () => paintBrick(this.theme, kind, color, hp, maxHp));
    return key;
  }

  private collectibleKey(kind: CollectibleKind): string {
    return `${this.theme.id}:collectible:${kind}`;
  }

  private ballImage(index: number): Phaser.GameObjects.Image {
    let img = this.balls[index];
    if (!img) {
      img = this.spriteImage(`${this.theme.id}:ball:${this.visuals.ball}`, () => paintBall(this.theme, this.visuals.ball)).setDepth(7);
      this.balls[index] = img;
    }
    return img;
  }

  private ensureSprite(key: string, paint: () => Sprite): Sprite {
    let sprite = this.sprites.get(key);
    if (!sprite || !this.textures.exists(key)) {
      sprite = paint();
      if (this.textures.exists(key)) this.textures.remove(key);
      const texture = this.textures.addCanvas(key, sprite.canvas);
      if (texture && this.theme.pixelArt) texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }

  private spriteImage(key: string, paint: () => Sprite): Phaser.GameObjects.Image {
    const sprite = this.ensureSprite(key, paint);
    return this.add.image(0, 0, key).setScale(1 / sprite.scale);
  }

  // ------------------------------------------------------------------ effects

  private brickBurst(x: number, y: number, color: number, special: boolean): void {
    const reduced = this.visuals.reducedEffects;
    const count = reduced ? 2 : special ? 12 : 7;
    switch (this.visuals.burst) {
      case 'confetti':
        this.burst('confetti', x, y, count + 2, color, true);
        break;
      case 'pixels':
        this.burst('square', x, y, count, color);
        break;
      case 'rings':
        this.ring(x, y, 0.55, color, 220);
        if (!reduced) this.burst('spark', x, y, 3, color);
        break;
      case 'stars':
        this.burst('star', x, y, count, color);
        break;
      default:
        this.burst(this.theme.pixelArt ? 'square' : 'circle', x, y, count, color);
    }
    if (special) this.ring(x, y, 0.7, this.theme.special, 260);
  }

  private burst(shape: ParticleShape, x: number, y: number, count: number, color: number, rainbow = false): void {
    const emitter = this.emitters.get(shape);
    if (!emitter || count <= 0) return;
    if (rainbow) {
      for (let i = 0; i < count; i++) {
        emitter.setParticleTint(this.theme.rowColors[i % this.theme.rowColors.length] ?? color);
        emitter.explode(1, x, y);
      }
      return;
    }
    emitter.setParticleTint(shade(color, 0.25));
    emitter.explode(count, x, y);
  }

  private ring(x: number, y: number, size: number, color: number, duration: number): void {
    const key = `${this.theme.id}:particle:ring`;
    const sprite = this.ensureSprite(key, () => paintParticle(this.theme, 'ring'));
    const base = 1 / sprite.scale;
    const img = this.add.image(x, y, key).setDepth(8).setTint(color).setScale(base * size * 0.3).setAlpha(0.9);
    if (this.theme.glow) img.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: img,
      scale: base * size * (this.visuals.reducedEffects ? 0.9 : 1.6),
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  private celebrate(): void {
    const count = this.visuals.reducedEffects ? 1 : 4;
    for (let i = 0; i < count; i++) {
      const x = WORLD.width * (0.2 + 0.2 * i);
      this.time.delayedCall(i * 120, () => {
        this.ring(x, 220, 2.2, this.theme.rowColors[i % this.theme.rowColors.length] ?? 0xffffff, 520);
        this.burst(this.visuals.burst === 'confetti' ? 'confetti' : 'star', x, 220, this.visuals.reducedEffects ? 3 : 10, this.theme.special);
      });
    }
  }

  private drawGates(sim: GameSimulation, t: number): void {
    const g = this.gateGfx;
    g.clear();
    for (const gate of sim.gateInfo()) {
      const r = cellRect(gate.def.col, gate.def.row);
      const w = gate.def.w * WORLD.cellW;
      const h = gate.def.h * WORLD.cellH;
      if (gate.solid) {
        g.fillStyle(this.theme.gate, this.theme.glow ? 0.45 : 0.85);
        g.fillRect(r.x, r.y, w, h);
        g.lineStyle(1.5, this.theme.gate, 1);
        g.strokeRect(r.x + 0.75, r.y + 0.75, w - 1.5, h - 1.5);
        for (let x = r.x + 4; x < r.x + w - 2; x += 6) {
          g.lineBetween(x, r.y + 2, x, r.y + h - 2);
        }
      } else {
        const warn = gate.warning;
        const color = warn ? this.theme.gateWarn : this.theme.gate;
        const blink = warn && !this.visuals.reducedEffects ? 0.35 + 0.65 * Math.abs(Math.sin(t * 10)) : warn ? 0.8 : 0.35;
        g.lineStyle(1.2, color, blink);
        for (let x = r.x; x < r.x + w; x += 6) g.lineBetween(x, r.y + h / 2, Math.min(r.x + w, x + 3), r.y + h / 2);
        g.fillStyle(color, warn ? 0.25 * blink : 0.08);
        g.fillRect(r.x, r.y, w, h);
      }
    }
  }

  private drawTrails(piercing: boolean): void {
    const g = this.trailGfx;
    g.clear();
    const style = this.visuals.trail;
    const forced = this.visuals.ballVisibility;
    if (style === 'none' && !forced && !piercing) return;
    const r = BALL.radius;
    let index = 0;
    for (const trail of this.trails.values()) {
      index++;
      const length = style === 'none' ? 5 : trail.length;
      for (let i = 1; i < Math.min(length, trail.length); i++) {
        const p = trail[i];
        if (!p) continue;
        const k = 1 - i / TRAIL_LENGTH;
        let color = piercing ? this.theme.piercing : this.theme.ballGlow;
        if (style === 'rainbow') color = this.theme.rowColors[(i + index + Math.floor(this.elapsed * 12)) % this.theme.rowColors.length] ?? color;
        if (style === 'dots' && i % 2 === 1) continue;
        const alpha = (style === 'ribbon' ? 0.45 : 0.35) * k;
        const size = style === 'ribbon' ? r * (0.4 + 0.6 * k) : style === 'sparkle' ? r * 0.35 * (1 + ((i * 7) % 3)) : r * 0.6 * k + 1;
        g.fillStyle(color, alpha);
        if (this.theme.pixelArt) g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        else g.fillCircle(p.x, p.y, size);
      }
    }
  }

  private drawBallOverlays(sim: GameSimulation, armed: boolean, t: number): void {
    const g = this.overlayGfx;
    g.clear();
    const s = sim.state;
    const r = BALL.radius;
    for (const b of s.balls) {
      if (this.visuals.ballVisibility) {
        g.lineStyle(2, this.theme.outline, 0.9);
        g.strokeCircle(b.x, b.y, r + 2.2);
        g.lineStyle(1, 0xffffff, 0.9);
        g.strokeCircle(b.x, b.y, r + 3.6);
      }
      if (armed) {
        const pulse = this.visuals.reducedEffects ? 0.8 : 0.5 + 0.5 * Math.abs(Math.sin(t * 8));
        g.lineStyle(1.5, this.theme.explosive, pulse);
        g.strokeCircle(b.x, b.y, r + 4 + pulse * 1.5);
      }
    }
    if (s.phase === 'serving' && s.balls[0]) {
      const b = s.balls[0];
      const k = Math.max(0, Math.min(1, s.serveTimer / BALL.serveDelay));
      g.lineStyle(1.5, this.theme.ballGlow, 0.6);
      g.beginPath();
      g.arc(b.x, b.y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
      g.strokePath();
    }
  }
}
