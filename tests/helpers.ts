import { PADDLE, SIM, WORLD } from '../src/config/tuning';
import { cellRect } from '../src/core/level/grid';
import type { BrickDef, LevelDefinition, ObstacleDef, StaticDef } from '../src/core/level/types';
import type { SimEvent } from '../src/core/sim/events';
import { GameSimulation, type SimOptions } from '../src/core/sim/simulation';
import type { GameStyle } from '../src/core/types';

export const DT = SIM.fixedStep;

export function makeLevel(
  opts: { bricks?: BrickDef[]; statics?: StaticDef[]; obstacles?: ObstacleDef[]; number?: number; style?: GameStyle; speed?: number } = {},
): LevelDefinition {
  return {
    key: 'test',
    number: opts.number ?? 1,
    style: opts.style ?? 'classic',
    seed: 42,
    special: null,
    rows: 12,
    bricks: opts.bricks ?? [{ col: 5, row: 5, kind: 'standard', hp: 1 }],
    statics: opts.statics ?? [],
    obstacles: opts.obstacles ?? [],
    ballSpeed: opts.speed ?? 300,
  };
}

export function makeSim(level: LevelDefinition, options: Partial<SimOptions> = {}): GameSimulation {
  return GameSimulation.create({ level, mode: 'progression', ...options });
}

/** Steps until `predicate` holds (or the time limit passes); returns all events seen. */
export function runUntil(sim: GameSimulation, predicate: (events: SimEvent[]) => boolean, maxSeconds = 10, beforeStep?: () => void): SimEvent[] {
  const all: SimEvent[] = [];
  const steps = Math.ceil(maxSeconds / DT);
  for (let i = 0; i < steps; i++) {
    beforeStep?.();
    sim.step(DT);
    const evs = sim.drainEvents();
    all.push(...evs);
    if (predicate(all)) break;
  }
  return all;
}

export function runFor(sim: GameSimulation, seconds: number, beforeStep?: (t: number) => void): SimEvent[] {
  const all: SimEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    beforeStep?.(i * DT);
    sim.step(DT);
    all.push(...sim.drainEvents());
  }
  return all;
}

/** Simple bot: keeps the paddle under the lowest descending ball, slightly off-centre for variety. */
export function botPaddle(sim: GameSimulation): void {
  const s = sim.state;
  let target = s.paddle.x;
  let lowest = -1;
  for (const b of s.balls) {
    if (b.vy > 0 && b.y > lowest) {
      lowest = b.y;
      target = b.x;
    }
  }
  if (lowest < 0 && s.balls[0]) target = s.balls[0].x;
  sim.setPaddleTarget(target + Math.sin(s.time * 1.7) * PADDLE.width * 0.3);
}

/** World position directly below the centre of a grid cell. */
export function below(col: number, row: number, distance = 40): { x: number; y: number } {
  const r = cellRect(col, row);
  return { x: r.x + r.w / 2, y: r.y + r.h + distance };
}

export function count(events: SimEvent[], type: SimEvent['type']): number {
  return events.filter((e) => e.type === type).length;
}

export function ofType<T extends SimEvent['type']>(events: SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export const FIELD = WORLD;
