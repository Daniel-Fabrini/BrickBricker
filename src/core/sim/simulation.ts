import { BALL, LIVES, PADDLE, POWERS, SCORING, SIM, WORLD } from '../../config/tuning';
import { cellIndex, cellRect, gatePhase, gateRect, inGrid, sliderPose } from '../level/grid';
import type { GateDef, LevelDefinition, SliderDef } from '../level/types';
import { circleRectContact, clamp, DEG_TO_RAD, rectsOverlap, type CircleRectContact, type Rect } from '../math';
import { Rng } from '../rng';
import type { CollectibleKind, GameMode, InventorySlots, PowerType } from '../types';
import { rollDrop } from './dropTable';
import type { DamageCause, SimEvent } from './events';
import { inventoryAdd, normalizeInventory } from './inventory';
import { burstBonus, comboBreak, comboMultiplier, comboRegister, comboTick, destroyPoints, levelClearBonus, newCombo } from './scoring';
import { effectiveSpeed, newSpeedState, speedOnDestroy, speedTick } from './speed';
import { emptyCounters, type BallState, type BrickState, type SimState } from './state';

export interface SimOptions {
  level: LevelDefinition;
  mode: GameMode | 'tutorial';
  /** Lives at the start of this level (High Score only). */
  lives?: number | null;
  inventory?: InventorySlots;
  score?: number;
  /** RNG seed for drops and serves. Defaults to the level seed. */
  seed?: number;
  paddleResponse?: number;
  /** Tutorial only: collectibles forced out of special bricks, in order. */
  forcedDrops?: CollectibleKind[];
}

interface Contact {
  kind: 'brick' | 'static' | 'gate' | 'slider';
  brickIndex: number;
  label: 'wall' | 'steel' | 'obstacle';
  nx: number;
  ny: number;
  depth: number;
  ovx: number;
}

const CELL_EMPTY = 0;
const CELL_WALL = 1;
const CELL_STEEL = 2;

const PADDLE_HALF_W = PADDLE.width / 2;
const PADDLE_TOP = PADDLE.y - PADDLE.height / 2;

/**
 * Deterministic simulation of a single level. It owns physics, collisions, brick damage, level
 * completion, power-ups, the inventory, combos, scoring, inactivity speed-up and the mode-specific
 * response to losing the last ball. It never touches rendering, audio, storage or the DOM: callers
 * feed it paddle targets and power activations, step it with a fixed dt, and drain its events.
 */
export class GameSimulation {
  private readonly s: SimState;
  private readonly rng: Rng;
  private events: SimEvent[] = [];
  private readonly brickGrid: Int32Array;
  private readonly staticGrid: Uint8Array;
  private readonly gateGrid: Int16Array;
  private readonly gateDefs: GateDef[];
  private readonly sliderDefs: SliderDef[];
  private readonly contacts: Contact[] = [];
  private forcedDrops: CollectibleKind[];

  private constructor(state: SimState, forcedDrops: CollectibleKind[] = []) {
    this.s = state;
    this.rng = new Rng(state.rngState);
    this.forcedDrops = [...forcedDrops];
    const cells = WORLD.gridCols * WORLD.gridMaxRows;
    this.brickGrid = new Int32Array(cells).fill(-1);
    this.staticGrid = new Uint8Array(cells);
    this.gateGrid = new Int16Array(cells).fill(-1);
    this.gateDefs = [];
    this.sliderDefs = [];
    state.bricks.forEach((b, i) => {
      if (b.alive && inGrid(b.col, b.row)) this.brickGrid[cellIndex(b.col, b.row)] = i;
    });
    for (const st of state.statics) {
      if (inGrid(st.col, st.row)) this.staticGrid[cellIndex(st.col, st.row)] = st.kind === 'wall' ? CELL_WALL : CELL_STEEL;
    }
    for (const o of state.level.obstacles) {
      if (o.kind === 'gate') {
        const gi = this.gateDefs.length;
        this.gateDefs.push(o);
        for (let c = o.col; c < o.col + o.w; c++) {
          for (let r = o.row; r < o.row + o.h; r++) if (inGrid(c, r)) this.gateGrid[cellIndex(c, r)] = gi;
        }
      } else {
        this.sliderDefs.push(o);
      }
    }
    if (state.gates.length !== this.gateDefs.length) {
      state.gates = this.gateDefs.map((_, index) => ({ index, solid: false }));
    }
  }

  static create(options: SimOptions): GameSimulation {
    const { level } = options;
    const bricks: BrickState[] = level.bricks.map((b, id) => ({
      id,
      col: b.col,
      row: b.row,
      kind: b.kind,
      hp: b.hp,
      maxHp: b.hp,
      alive: true,
    }));
    const highScore = options.mode === 'highscore';
    const state: SimState = {
      version: 1,
      mode: options.mode,
      level: structuredCloneSafe(level),
      phase: 'serving',
      time: 0,
      serveTimer: BALL.serveDelay,
      serveOffset: 0,
      levelSpeed: level.ballSpeed,
      balls: [],
      paddle: {
        x: WORLD.width / 2,
        px: WORLD.width / 2,
        targetX: WORLD.width / 2,
        response: options.paddleResponse ?? PADDLE.response,
      },
      bricks,
      statics: level.statics.map((s) => ({ ...s })),
      gates: [],
      collectibles: [],
      inventory: normalizeInventory(options.inventory),
      effects: { piercingTime: 0, explosiveCharges: 0, piercingKills: 0 },
      combo: newCombo(),
      speed: newSpeedState(),
      recentDestroys: [],
      score: options.score ?? 0,
      lives: highScore ? clamp(options.lives ?? LIVES.highScoreStart, 0, LIVES.highScoreMax) : null,
      maxLives: highScore ? LIVES.highScoreMax : null,
      destructibleRemaining: bricks.length,
      extraLifeDrops: 0,
      rngState: (options.seed ?? level.seed) >>> 0,
      nextId: 1,
      counters: emptyCounters(),
    };
    const sim = new GameSimulation(state, options.forcedDrops);
    sim.spawnServeBall();
    return sim;
  }

  /** Rebuilds a simulation from a snapshot produced by `snapshot()`. */
  static restore(snapshot: SimState): GameSimulation {
    const state = structuredCloneSafe(snapshot);
    state.destructibleRemaining = state.bricks.filter((b) => b.alive).length;
    state.inventory = normalizeInventory(state.inventory);
    return new GameSimulation(state);
  }

  get state(): Readonly<SimState> {
    return this.s;
  }

  /** Deep copy of the full state, safe to persist. */
  snapshot(): SimState {
    this.s.rngState = this.rng.getState();
    return structuredCloneSafe(this.s);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  isFinished(): boolean {
    return this.s.phase === 'complete' || this.s.phase === 'failed' || this.s.phase === 'gameOver';
  }

  setPaddleTarget(x: number): void {
    this.s.paddle.targetX = clamp(x, PADDLE_HALF_W, WORLD.width - PADDLE_HALF_W);
  }

  setPaddleResponse(response: number): void {
    this.s.paddle.response = Math.max(1, response);
  }

  currentSpeed(): number {
    return effectiveSpeed(this.s.levelSpeed, this.s.speed);
  }

  /** Current pose of every slider, for rendering. */
  sliderPoses(): ReturnType<typeof sliderPose>[] {
    return this.sliderDefs.map((d) => sliderPose(d, this.s.time));
  }

  gateInfo(): { def: GateDef; solid: boolean; warning: boolean }[] {
    return this.gateDefs.map((def, i) => ({
      def,
      solid: this.s.gates[i]?.solid ?? false,
      warning: gatePhase(def, this.s.time).warning,
    }));
  }

  // ------------------------------------------------------------------ main step

  step(dt: number = SIM.fixedStep): void {
    const s = this.s;
    if (this.isFinished()) return;
    s.time += dt;

    for (const b of s.balls) {
      b.px = b.x;
      b.py = b.y;
    }
    for (const c of s.collectibles) c.py = c.y;
    s.paddle.px = s.paddle.x;

    this.updatePaddle(dt);
    this.updateGates();

    if (s.phase === 'serving') {
      s.serveTimer -= dt;
      const ball = s.balls[0];
      if (ball) {
        ball.x = clamp(s.paddle.x + s.serveOffset, BALL.radius, WORLD.width - BALL.radius);
        ball.y = PADDLE_TOP - BALL.radius - 0.5;
      }
      if (s.serveTimer <= 0) this.launchServeBall();
    } else if (s.phase === 'playing') {
      const before = s.speed.boost;
      speedTick(s.speed, dt);
      if (before < s.speed.boost && Math.floor(before * 20) !== Math.floor(s.speed.boost * 20)) {
        this.emit({ type: 'speedBoost', boost: s.speed.boost });
      }
      const ended = comboTick(s.combo, dt);
      if (ended > 0) this.emit({ type: 'comboEnd', chain: ended });
      this.updateEffects(dt);
      this.updateBalls(dt);
    }

    this.updateCollectibles(dt);

    if (s.destructibleRemaining <= 0 && (s.phase === 'playing' || s.phase === 'serving')) {
      this.completeLevel();
      return;
    }
    this.handleLostBalls();
    s.rngState = this.rng.getState();
  }

  // ------------------------------------------------------------------ powers

  /** Manually activates the power stored in `slot`. Powers are never activated automatically. */
  activatePower(slot: number): boolean {
    const s = this.s;
    const power = s.inventory[slot] ?? null;
    if (power === null) {
      this.emit({ type: 'powerRejected', power: null, slot, reason: 'empty' });
      return false;
    }
    if (s.phase !== 'playing') {
      this.emit({ type: 'powerRejected', power, slot, reason: 'notPlaying' });
      return false;
    }
    switch (power) {
      case 'multiball': {
        if (s.balls.length >= BALL.maxBalls) {
          this.emit({ type: 'powerRejected', power, slot, reason: 'maxBalls' });
          return false;
        }
        const created = this.spawnMultiball();
        this.emit({ type: 'multiball', created, total: s.balls.length });
        break;
      }
      case 'piercing': {
        if (s.effects.piercingTime <= 0) s.effects.piercingKills = 0;
        s.effects.piercingTime = Math.min(POWERS.piercing.maxDuration, Math.max(0, s.effects.piercingTime) + POWERS.piercing.duration);
        break;
      }
      case 'explosion': {
        if (s.effects.explosiveCharges >= POWERS.explosion.maxCharges) {
          this.emit({ type: 'powerRejected', power, slot, reason: 'maxCharges' });
          return false;
        }
        s.effects.explosiveCharges += 1;
        break;
      }
    }
    s.inventory[slot] = null;
    s.counters.powersActivated += 1;
    this.emit({ type: 'powerActivated', power, slot });
    return true;
  }

  // ------------------------------------------------------------------ debug / test hooks

  /** Destroys every remaining brick through the normal destruction path (used by e2e tests). */
  debugDestroyAllBricks(): void {
    for (const b of this.s.bricks) if (b.alive) this.damageBrick(b, b.hp, 'debug');
  }

  /** Moves a ball (or spawns one) at an exact position/velocity. Test helper. */
  debugPlaceBall(x: number, y: number, vx: number, vy: number, index = 0): void {
    const s = this.s;
    if (s.phase === 'serving') s.phase = 'playing';
    let ball = s.balls[index];
    if (!ball) {
      ball = this.newBall(x, y, vx, vy);
      s.balls.push(ball);
    }
    ball.x = ball.px = x;
    ball.y = ball.py = y;
    ball.vx = vx;
    ball.vy = vy;
  }

  /** Spawns a falling collectible (tutorial and tests). It still has to be caught by the paddle. */
  spawnCollectible(kind: CollectibleKind, x: number, y: number): number {
    const id = this.s.nextId++;
    this.s.collectibles.push({ id, kind, x, y, py: y });
    this.emit({ type: 'collectibleSpawned', id, kind, x, y });
    return id;
  }

  /** Keeps the ball resting on the paddle (tutorial only, while the player learns to move). */
  holdServe(): void {
    if (this.s.phase === 'serving') this.s.serveTimer = Math.max(this.s.serveTimer, BALL.serveDelay * 0.6);
  }

  // ------------------------------------------------------------------ internals

  private emit(event: SimEvent): void {
    this.events.push(event);
  }

  private newBall(x: number, y: number, vx: number, vy: number): BallState {
    return { id: this.s.nextId++, x, y, vx, vy, px: x, py: y, pierced: [], idle: 0, stuck: 0 };
  }

  private spawnServeBall(): void {
    const s = this.s;
    s.phase = 'serving';
    s.serveTimer = BALL.serveDelay;
    s.serveOffset = 0;
    s.balls = [this.newBall(s.paddle.x, PADDLE_TOP - BALL.radius - 0.5, 0, 0)];
  }

  private launchServeBall(): void {
    const s = this.s;
    const ball = s.balls[0];
    if (!ball) return;
    const angle = this.rng.float(BALL.serveMinAngleDeg, BALL.serveMaxAngleDeg) * this.rng.sign() * DEG_TO_RAD;
    const speed = this.currentSpeed();
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    s.phase = 'playing';
    s.counters.ballsLaunched += 1;
    s.counters.maxSimultaneousBalls = Math.max(s.counters.maxSimultaneousBalls, s.balls.length);
    this.emit({ type: 'serve', ballId: ball.id });
  }

  private updatePaddle(dt: number): void {
    const p = this.s.paddle;
    const desired = (p.targetX - p.x) * (1 - Math.exp(-p.response * dt));
    const maxStep = PADDLE.maxSpeed * dt;
    p.x = clamp(p.x + clamp(desired, -maxStep, maxStep), PADDLE_HALF_W, WORLD.width - PADDLE_HALF_W);
  }

  private updateGates(): void {
    const s = this.s;
    this.gateDefs.forEach((def, i) => {
      const gate = s.gates[i];
      if (!gate) return;
      const phase = gatePhase(def, s.time);
      if (!phase.wantsClosed) {
        gate.solid = false;
        return;
      }
      if (gate.solid) return;
      // Only close when no ball is inside the gate, so a ball can never be trapped in a closing gate.
      const rect = gateRect(def);
      const inflated: Rect = { x: rect.x - BALL.radius - 1, y: rect.y - BALL.radius - 1, w: rect.w + 2 * BALL.radius + 2, h: rect.h + 2 * BALL.radius + 2 };
      const blocked = s.balls.some((b) => b.x > inflated.x && b.x < inflated.x + inflated.w && b.y > inflated.y && b.y < inflated.y + inflated.h);
      if (!blocked) gate.solid = true;
    });
  }

  private updateEffects(dt: number): void {
    const e = this.s.effects;
    if (e.piercingTime > 0) {
      e.piercingTime -= dt;
      if (e.piercingTime <= 0) {
        e.piercingTime = 0;
        for (const b of this.s.balls) b.pierced = [];
        this.emit({ type: 'piercingEnded', kills: e.piercingKills });
      }
    }
  }

  private updateBalls(dt: number): void {
    const s = this.s;
    const speed = this.currentSpeed();
    // Keep every ball at the current target speed (smoothly varying with the inactivity boost).
    for (const ball of s.balls) {
      const mag = Math.hypot(ball.vx, ball.vy);
      if (mag > 0) {
        ball.vx = (ball.vx / mag) * speed;
        ball.vy = (ball.vy / mag) * speed;
      }
    }
    const substeps = Math.max(1, Math.ceil((speed * dt) / BALL.maxSubstepDistance));
    const sub = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      for (const ball of s.balls) {
        if (ball.y - BALL.radius > WORLD.height) continue;
        this.moveBall(ball, sub, speed);
        if (s.destructibleRemaining <= 0) return;
      }
    }
  }

  private moveBall(ball: BallState, dt: number, speed: number): void {
    const s = this.s;
    const r = BALL.radius;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.idle += dt;
    let bounced = false;

    // Field boundaries (left, right, top). The bottom is open.
    if (ball.x < r) {
      ball.x = r;
      if (ball.vx < 0) {
        ball.vx = -ball.vx;
        bounced = true;
        this.emit({ type: 'wallHit', ballId: ball.id, x: ball.x, y: ball.y, kind: 'field' });
      }
    } else if (ball.x > WORLD.width - r) {
      ball.x = WORLD.width - r;
      if (ball.vx > 0) {
        ball.vx = -ball.vx;
        bounced = true;
        this.emit({ type: 'wallHit', ballId: ball.id, x: ball.x, y: ball.y, kind: 'field' });
      }
    }
    if (ball.y < r) {
      ball.y = r;
      if (ball.vy < 0) {
        ball.vy = -ball.vy;
        bounced = true;
        this.emit({ type: 'wallHit', ballId: ball.id, x: ball.x, y: ball.y, kind: 'field' });
      }
    }

    // Paddle.
    if (ball.vy > 0 && ball.y <= PADDLE.y) {
      const paddleRect: Rect = { x: s.paddle.x - PADDLE_HALF_W, y: PADDLE_TOP, w: PADDLE.width, h: PADDLE.height };
      if (circleRectContact(ball.x, ball.y, r, paddleRect)) {
        this.bounceOffPaddle(ball, speed);
        return;
      }
    }

    const piercing = s.effects.piercingTime > 0;
    const contacts = this.gatherContacts(ball);
    let maxDepth = 0;
    const overlappingBricks: number[] = [];
    for (const c of contacts) {
      if (c.kind === 'brick') {
        const brick = s.bricks[c.brickIndex];
        if (!brick || !brick.alive) continue;
        if (piercing) {
          overlappingBricks.push(brick.id);
          if (!ball.pierced.includes(brick.id)) {
            ball.pierced.push(brick.id);
            ball.idle = 0;
            this.hitBrick(brick, 'piercing');
          }
          continue;
        }
        ball.x += c.nx * c.depth;
        ball.y += c.ny * c.depth;
        if (ball.vx * c.nx + ball.vy * c.ny < 0) {
          reflect(ball, c.nx, c.ny, 0);
          bounced = true;
          ball.idle = 0;
          this.hitBrick(brick, 'ball');
        }
        continue;
      }
      maxDepth = Math.max(maxDepth, c.depth);
      ball.x += c.nx * c.depth;
      ball.y += c.ny * c.depth;
      const relVx = ball.vx - c.ovx;
      if (relVx * c.nx + ball.vy * c.ny < 0) {
        reflect(ball, c.nx, c.ny, c.ovx);
        bounced = true;
        this.emit({ type: 'wallHit', ballId: ball.id, x: ball.x, y: ball.y, kind: c.label });
      }
    }
    if (piercing && ball.pierced.length > 0) {
      ball.pierced = ball.pierced.filter((id) => overlappingBricks.includes(id));
    }

    if (bounced) enforceTrajectory(ball, speed);

    // Gentle nudge if a ball has been bouncing without touching the paddle or bricks for too long.
    if (ball.idle > BALL.stallTimeout) {
      const nudge = this.rng.float(BALL.stallNudgeMinDeg, BALL.stallNudgeMaxDeg) * this.rng.sign() * DEG_TO_RAD;
      const cos = Math.cos(nudge);
      const sin = Math.sin(nudge);
      const vx = ball.vx * cos - ball.vy * sin;
      const vy = ball.vx * sin + ball.vy * cos;
      ball.vx = vx;
      ball.vy = vy;
      enforceTrajectory(ball, speed);
      ball.idle = 0;
    }

    // Stuck rescue: continuous deep overlap (e.g. squeezed by a moving obstacle).
    if (maxDepth > r * 0.6) {
      ball.stuck += dt;
      if (ball.stuck > BALL.stuckRescueTime) {
        const spot = this.findFreeSpot(ball.x, ball.y);
        ball.x = spot.x;
        ball.y = spot.y;
        if (ball.vy < 0) ball.vy = -ball.vy;
        enforceTrajectory(ball, speed);
        ball.stuck = 0;
        this.emit({ type: 'ballRescued', ballId: ball.id });
      }
    } else {
      ball.stuck = 0;
    }
  }

  private bounceOffPaddle(ball: BallState, speed: number): void {
    const s = this.s;
    const offset = clamp((ball.x - s.paddle.x) / (PADDLE_HALF_W + BALL.radius), -1, 1);
    let angle = offset * BALL.maxBounceAngleDeg;
    if (Math.abs(angle) < BALL.minPaddleAngleDeg) {
      const dir = offset !== 0 ? Math.sign(offset) : ball.vx >= 0 ? 1 : -1;
      angle = dir * BALL.minPaddleAngleDeg;
    }
    const rad = angle * DEG_TO_RAD;
    ball.vx = Math.sin(rad) * speed;
    ball.vy = -Math.cos(rad) * speed;
    ball.y = PADDLE_TOP - BALL.radius - 0.01;
    ball.idle = 0;
    s.counters.rally = 0;
    this.emit({ type: 'paddleHit', ballId: ball.id, x: ball.x, offset });
  }

  private isSolidCell(col: number, row: number): boolean {
    if (col < 0 || col >= WORLD.gridCols) return true;
    if (row < 0 || row >= WORLD.gridMaxRows) return false;
    const idx = cellIndex(col, row);
    if ((this.staticGrid[idx] ?? 0) !== CELL_EMPTY) return true;
    if ((this.brickGrid[idx] ?? -1) >= 0) return true;
    const gi = this.gateGrid[idx] ?? -1;
    return gi >= 0 && (this.s.gates[gi]?.solid ?? false);
  }

  /** Normal for a contact with grid cell (col,row); corners shared with solid neighbours act as faces. */
  private cellNormal(col: number, row: number, c: CircleRectContact, bx: number, by: number): [number, number] | null {
    switch (c.region) {
      case 'left':
        return [-1, 0];
      case 'right':
        return [1, 0];
      case 'top':
        return [0, -1];
      case 'bottom':
        return [0, 1];
      case 'inside':
        return [0, 1];
      case 'corner': {
        const horiz = this.isSolidCell(col + c.cornerX, row);
        const vert = this.isSolidCell(col, row + c.cornerY);
        if (horiz && vert) return null;
        if (horiz) return [0, c.cornerY];
        if (vert) return [c.cornerX, 0];
        const dx = bx - c.cx;
        const dy = by - c.cy;
        const len = Math.hypot(dx, dy) || 1;
        return [dx / len, dy / len];
      }
    }
  }

  private gatherContacts(ball: BallState): Contact[] {
    const out = this.contacts;
    out.length = 0;
    const r = BALL.radius;
    const c0 = Math.floor((ball.x - r) / WORLD.cellW);
    const c1 = Math.floor((ball.x + r) / WORLD.cellW);
    const r0 = Math.floor((ball.y - r - WORLD.gridTop) / WORLD.cellH);
    const r1 = Math.floor((ball.y + r - WORLD.gridTop) / WORLD.cellH);
    for (let row = Math.max(0, r0); row <= Math.min(WORLD.gridMaxRows - 1, r1); row++) {
      for (let col = Math.max(0, c0); col <= Math.min(WORLD.gridCols - 1, c1); col++) {
        const idx = cellIndex(col, row);
        const brickIndex = this.brickGrid[idx] ?? -1;
        const staticKind = this.staticGrid[idx] ?? CELL_EMPTY;
        const gi = this.gateGrid[idx] ?? -1;
        const gateSolid = gi >= 0 && (this.s.gates[gi]?.solid ?? false);
        if (brickIndex < 0 && staticKind === CELL_EMPTY && !gateSolid) continue;
        const contact = circleRectContact(ball.x, ball.y, r, cellRect(col, row));
        if (!contact) continue;
        const normal = this.cellNormal(col, row, contact, ball.x, ball.y);
        if (!normal) continue;
        if (brickIndex >= 0) {
          out.push({ kind: 'brick', brickIndex, label: 'wall', nx: normal[0], ny: normal[1], depth: contact.depth, ovx: 0 });
        } else {
          out.push({
            kind: gateSolid ? 'gate' : 'static',
            brickIndex: -1,
            label: gateSolid ? 'obstacle' : staticKind === CELL_WALL ? 'wall' : 'steel',
            nx: normal[0],
            ny: normal[1],
            depth: contact.depth,
            ovx: 0,
          });
        }
      }
    }
    for (const def of this.sliderDefs) {
      const pose = sliderPose(def, this.s.time);
      const contact = circleRectContact(ball.x, ball.y, r, pose);
      if (!contact) continue;
      let nx: number;
      let ny: number;
      if (contact.region === 'corner') {
        const dx = ball.x - contact.cx;
        const dy = ball.y - contact.cy;
        const len = Math.hypot(dx, dy) || 1;
        nx = dx / len;
        ny = dy / len;
      } else {
        nx = contact.region === 'left' ? -1 : contact.region === 'right' ? 1 : 0;
        ny = contact.region === 'top' ? -1 : contact.region === 'bottom' || contact.region === 'inside' ? 1 : 0;
      }
      out.push({ kind: 'slider', brickIndex: -1, label: 'obstacle', nx, ny, depth: contact.depth, ovx: pose.vx });
    }
    out.sort((a, b) => b.depth - a.depth);
    return out;
  }

  private overlapsSolid(x: number, y: number, r: number): boolean {
    if (x < r || x > WORLD.width - r || y < r) return true;
    const c0 = Math.floor((x - r) / WORLD.cellW);
    const c1 = Math.floor((x + r) / WORLD.cellW);
    const r0 = Math.floor((y - r - WORLD.gridTop) / WORLD.cellH);
    const r1 = Math.floor((y + r - WORLD.gridTop) / WORLD.cellH);
    for (let row = Math.max(0, r0); row <= Math.min(WORLD.gridMaxRows - 1, r1); row++) {
      for (let col = Math.max(0, c0); col <= Math.min(WORLD.gridCols - 1, c1); col++) {
        if (this.isSolidCell(col, row) && circleRectContact(x, y, r, cellRect(col, row))) return true;
      }
    }
    for (const def of this.sliderDefs) {
      if (circleRectContact(x, y, r, sliderPose(def, this.s.time))) return true;
    }
    return false;
  }

  private findFreeSpot(x: number, y: number): { x: number; y: number } {
    const r = BALL.radius + 1;
    for (let radius = 6; radius <= 150; radius += 6) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + Math.PI / 2; // start searching downward
        const cx = clamp(x + Math.cos(a) * radius, r, WORLD.width - r);
        const cy = clamp(y + Math.sin(a) * radius, r, PADDLE_TOP - 40);
        if (!this.overlapsSolid(cx, cy, r)) return { x: cx, y: cy };
      }
    }
    return { x: clamp(x, r, WORLD.width - r), y: PADDLE_TOP - 120 };
  }

  private hitBrick(brick: BrickState, cause: DamageCause): void {
    const e = this.s.effects;
    if (e.explosiveCharges > 0) {
      e.explosiveCharges -= 1;
      this.explode(brick);
      return;
    }
    this.damageBrick(brick, 1, cause);
  }

  private explode(center: BrickState): void {
    const s = this.s;
    const cfg = POWERS.explosion;
    const rect = cellRect(center.col, center.row);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const targets: { brick: BrickState; damage: number }[] = [];
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const br = cellRect(b.col, b.row);
      const d = Math.hypot(br.x + br.w / 2 - cx, br.y + br.h / 2 - cy);
      if (d <= cfg.innerRadius) targets.push({ brick: b, damage: cfg.innerDamage });
      else if (d <= cfg.outerRadius) targets.push({ brick: b, damage: cfg.outerDamage });
    }
    let destroyed = 0;
    let damaged = 0;
    for (const t of targets) {
      const result = this.damageBrick(t.brick, t.damage, 'explosion');
      if (result === 'destroyed') destroyed++;
      else if (result === 'damaged') damaged++;
    }
    this.emit({ type: 'explosion', x: cx, y: cy, destroyed, damaged });
  }

  /** Applies damage exactly once; destruction (and its score) can only happen on the alive -> dead edge. */
  private damageBrick(brick: BrickState, amount: number, cause: DamageCause): 'destroyed' | 'damaged' | 'none' {
    if (!brick.alive || amount <= 0) return 'none';
    const s = this.s;
    const rect = cellRect(brick.col, brick.row);
    const x = rect.x + rect.w / 2;
    const y = rect.y + rect.h / 2;
    brick.hp = Math.max(0, brick.hp - amount);
    if (brick.hp > 0) {
      s.score += SCORING.damageHitPoints;
      this.emit({ type: 'brickDamaged', brickId: brick.id, kind: brick.kind, hp: brick.hp, maxHp: brick.maxHp, x, y, points: SCORING.damageHitPoints, cause });
      return 'damaged';
    }

    brick.alive = false;
    if (inGrid(brick.col, brick.row)) this.brickGrid[cellIndex(brick.col, brick.row)] = -1;
    s.destructibleRemaining -= 1;

    const previousMultiplier = comboMultiplier(s.combo.chain);
    const chain = comboRegister(s.combo);
    const multiplier = comboMultiplier(chain);
    if (multiplier > previousMultiplier) this.emit({ type: 'comboUp', chain, multiplier });
    const burst = burstBonus(s.recentDestroys, s.time);
    const byPower = cause === 'explosion' || cause === 'piercing';
    const points = destroyPoints(brick.kind, brick.maxHp, s.level.number, chain, byPower, burst.bonus);
    s.score += points;
    speedOnDestroy(s.speed);
    s.counters.bricksDestroyed += 1;
    s.counters.rally += 1;
    s.counters.bestRally = Math.max(s.counters.bestRally, s.counters.rally);
    if (cause === 'piercing') s.effects.piercingKills += 1;
    this.emit({
      type: 'brickDestroyed',
      brickId: brick.id,
      kind: brick.kind,
      maxHp: brick.maxHp,
      x,
      y,
      points,
      cause,
      chain,
      multiplier,
      remaining: s.destructibleRemaining,
    });
    if (burst.bonus > 0) this.emit({ type: 'burst', count: burst.count, bonus: burst.bonus });
    if (brick.kind === 'special') this.maybeDrop(x, y);
    return 'destroyed';
  }

  private maybeDrop(x: number, y: number): void {
    const s = this.s;
    if (s.collectibles.length >= POWERS.maxCollectiblesOnField) return;
    let kind: CollectibleKind | null;
    if (this.forcedDrops.length > 0) {
      kind = this.forcedDrops.shift() ?? null;
    } else {
      kind = rollDrop(this.rng, {
        extraLifeEnabled: s.mode === 'highscore',
        livesAtCap: s.lives !== null && s.maxLives !== null && s.lives >= s.maxLives,
        extraLifeDropsThisLevel: s.extraLifeDrops,
      });
    }
    if (!kind) return;
    if (kind === 'extraLife') s.extraLifeDrops += 1;
    const id = s.nextId++;
    s.collectibles.push({ id, kind, x, y, py: y });
    this.emit({ type: 'collectibleSpawned', id, kind, x, y });
  }

  private updateCollectibles(dt: number): void {
    const s = this.s;
    if (s.collectibles.length === 0) return;
    const paddleRect: Rect = { x: s.paddle.x - PADDLE_HALF_W, y: PADDLE_TOP, w: PADDLE.width, h: PADDLE.height };
    const remaining = [];
    for (const c of s.collectibles) {
      c.y += POWERS.collectibleFallSpeed * dt;
      const rect: Rect = {
        x: c.x - POWERS.collectibleWidth / 2,
        y: c.y - POWERS.collectibleHeight / 2,
        w: POWERS.collectibleWidth,
        h: POWERS.collectibleHeight,
      };
      if (rectsOverlap(rect, paddleRect)) {
        this.catchCollectible(c.id, c.kind);
        continue;
      }
      if (rect.y > WORLD.height) {
        this.emit({ type: 'collectibleMissed', id: c.id, kind: c.kind });
        continue;
      }
      remaining.push(c);
    }
    s.collectibles = remaining;
  }

  private catchCollectible(id: number, kind: CollectibleKind): void {
    const s = this.s;
    if (kind === 'extraLife') {
      if (s.lives !== null && s.maxLives !== null && s.lives < s.maxLives) {
        s.lives += 1;
        s.counters.extraLivesCollected += 1;
        this.emit({ type: 'extraLifeCaught', id, lives: s.lives, capped: false, points: 0 });
      } else {
        s.score += SCORING.extraLifeAtCapPoints;
        this.emit({ type: 'extraLifeCaught', id, lives: s.lives ?? 0, capped: true, points: SCORING.extraLifeAtCapPoints });
      }
      return;
    }
    const power: PowerType = kind;
    const slot = inventoryAdd(s.inventory, power);
    if (slot >= 0) {
      s.counters.powersCollected += 1;
      this.emit({ type: 'powerCaught', id, power, slot });
    } else {
      s.score += SCORING.inventoryFullPoints;
      this.emit({ type: 'inventoryFull', id, power, points: SCORING.inventoryFullPoints });
    }
  }

  private spawnMultiball(): number {
    const s = this.s;
    const cfg = POWERS.multiball;
    const sources = s.balls.filter((b) => b.y - BALL.radius <= WORLD.height).slice(0, cfg.maxSourceBalls);
    const speed = this.currentSpeed();
    let created = 0;
    for (const src of sources) {
      for (let k = 0; k < cfg.newBallsPerSource; k++) {
        if (s.balls.length >= BALL.maxBalls) break;
        // Seeded jitter keeps every new ball on its own trajectory, even when several balls
        // split from the same direction.
        const sign = k % 2 === 0 ? -1 : 1;
        const angle = sign * cfg.spreadDeg * (1 + Math.floor(k / 2)) * this.rng.float(0.7, 1.3) * DEG_TO_RAD;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const ball = this.newBall(src.x, src.y, src.vx * cos - src.vy * sin, src.vx * sin + src.vy * cos);
        enforceTrajectory(ball, speed);
        s.balls.push(ball);
        created++;
      }
    }
    s.counters.ballsLaunched += created;
    s.counters.maxSimultaneousBalls = Math.max(s.counters.maxSimultaneousBalls, s.balls.length);
    return created;
  }

  private completeLevel(): void {
    const s = this.s;
    const bonus = s.mode === 'tutorial' ? 0 : levelClearBonus(s.level.number);
    s.score += bonus;
    s.phase = 'complete';
    s.balls = [];
    if (s.effects.piercingTime > 0) this.emit({ type: 'piercingEnded', kills: s.effects.piercingKills });
    s.effects = { piercingTime: 0, explosiveCharges: 0, piercingKills: 0 };
    const ended = comboBreak(s.combo);
    if (ended > 0) this.emit({ type: 'comboEnd', chain: ended });
    if (s.collectibles.length > 0) {
      // Uncaught collectibles are never added to the inventory.
      this.emit({ type: 'collectiblesDiscarded', count: s.collectibles.length });
      s.collectibles = [];
    }
    s.rngState = this.rng.getState();
    this.emit({ type: 'levelComplete', bonus, score: s.score });
  }

  private handleLostBalls(): void {
    const s = this.s;
    if (s.phase !== 'playing') return;
    const lost = s.balls.filter((ball) => ball.y - BALL.radius > WORLD.height);
    if (lost.length === 0) return;
    const alive = s.balls.filter((ball) => ball.y - BALL.radius <= WORLD.height);
    s.balls = alive;
    for (const ball of lost) {
      s.counters.ballsLost += 1;
      this.emit({ type: 'ballLost', ballId: ball.id, remaining: alive.length });
    }
    if (alive.length > 0) return;

    // The last active ball is gone: apply the mode-specific rule exactly once.
    const ended = comboBreak(s.combo);
    if (ended > 0) this.emit({ type: 'comboEnd', chain: ended });
    if (s.effects.piercingTime > 0) this.emit({ type: 'piercingEnded', kills: s.effects.piercingKills });
    s.effects = { piercingTime: 0, explosiveCharges: 0, piercingKills: 0 };
    s.counters.rally = 0;
    s.recentDestroys = [];

    if (s.mode === 'highscore') {
      s.lives = Math.max(0, (s.lives ?? 0) - 1);
      s.counters.livesLost += 1;
      this.emit({ type: 'lifeLost', lives: s.lives });
      if (s.lives > 0) {
        this.spawnServeBall();
      } else {
        s.phase = 'gameOver';
        this.emit({ type: 'runOver', score: s.score });
      }
    } else if (s.mode === 'progression') {
      s.phase = 'failed';
      this.emit({ type: 'attemptFailed' });
    } else {
      this.spawnServeBall();
    }
  }
}

function reflect(ball: BallState, nx: number, ny: number, ovx: number): void {
  const rvx = ball.vx - ovx;
  const rvy = ball.vy;
  const dot = rvx * nx + rvy * ny;
  ball.vx = rvx - 2 * dot * nx + ovx;
  ball.vy = rvy - 2 * dot * ny;
}

/** Normalises to `speed` and enforces the minimum vertical component (no near-horizontal paths). */
export function enforceTrajectory(ball: { vx: number; vy: number }, speed: number): void {
  let mag = Math.hypot(ball.vx, ball.vy);
  if (mag === 0) {
    ball.vx = 0;
    ball.vy = -speed;
    mag = speed;
  }
  let vx = (ball.vx / mag) * speed;
  let vy = (ball.vy / mag) * speed;
  const minVy = speed * BALL.minVerticalRatio;
  if (Math.abs(vy) < minVy) {
    vy = (vy < 0 ? -1 : 1) * minVy;
    vx = (vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, speed * speed - vy * vy));
  }
  ball.vx = vx;
  ball.vy = vy;
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
