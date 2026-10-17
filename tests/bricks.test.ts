import { describe, expect, it } from 'vitest';
import { SCORING } from '../src/config/tuning';
import { below, count, makeLevel, makeSim, ofType, runFor, runUntil } from './helpers';

describe('bricks and level completion', () => {
  it('destroys a standard brick with a single hit (req 1)', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 5, row: 5, kind: 'standard', hp: 1 }, { col: 0, row: 0, kind: 'standard', hp: 1 }] }));
    const p = below(5, 5);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    const events = runUntil(sim, (evs) => count(evs, 'brickDestroyed') > 0, 2);
    const destroyed = ofType(events, 'brickDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]?.kind).toBe('standard');
    expect(count(events, 'brickDamaged')).toBe(0);
    expect(sim.state.bricks[0]?.alive).toBe(false);
    expect(sim.state.destructibleRemaining).toBe(1);
  });

  it('requires exactly maxHp hits for a resistant brick and shows each damage stage (req 2)', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 5, row: 5, kind: 'resistant', hp: 3 }, { col: 0, row: 0, kind: 'standard', hp: 1 }] }));
    const hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = below(5, 5);
      sim.debugPlaceBall(p.x, p.y, 0, -300);
      const events = runUntil(sim, (evs) => count(evs, 'brickDamaged') + count(evs, 'brickDestroyed') > 0, 2);
      for (const e of ofType(events, 'brickDamaged')) hits.push(e.hp);
      if (i < 2) {
        expect(sim.state.bricks[0]?.alive).toBe(true);
        expect(sim.state.bricks[0]?.hp).toBe(2 - i);
      }
    }
    expect(hits).toEqual([2, 1]);
    expect(sim.state.bricks[0]?.alive).toBe(false);
  });

  it('awards resistant damage hits a small flat amount and the destruction once', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 5, row: 5, kind: 'resistant', hp: 2 }, { col: 0, row: 0, kind: 'standard', hp: 1 }] }));
    let damagePoints = 0;
    let destroyPoints = 0;
    for (let i = 0; i < 2; i++) {
      const p = below(5, 5);
      sim.debugPlaceBall(p.x, p.y, 0, -300);
      const events = runUntil(sim, (evs) => count(evs, 'brickDamaged') + count(evs, 'brickDestroyed') > 0, 2);
      for (const e of ofType(events, 'brickDamaged')) damagePoints += e.points;
      for (const e of ofType(events, 'brickDestroyed')) destroyPoints += e.points;
    }
    expect(damagePoints).toBe(SCORING.damageHitPoints);
    expect(destroyPoints).toBe(SCORING.resistantBasePerHp * 2);
    expect(sim.state.score).toBe(damagePoints + destroyPoints);
  });

  it('completes the level only after every destructible brick is destroyed (req 3)', () => {
    const sim = makeSim(
      makeLevel({
        bricks: [
          { col: 2, row: 3, kind: 'standard', hp: 1 },
          { col: 6, row: 3, kind: 'special', hp: 1 },
          { col: 9, row: 3, kind: 'resistant', hp: 2 },
        ],
      }),
    );
    const targets: [number, number][] = [
      [2, 3],
      [6, 3],
      [9, 3],
      [9, 3],
    ];
    targets.forEach(([c, r], i) => {
      expect(sim.state.phase).not.toBe('complete');
      const p = below(c, r);
      sim.debugPlaceBall(p.x, p.y, 0, -300);
      runUntil(sim, (evs) => count(evs, 'brickDamaged') + count(evs, 'brickDestroyed') > 0, 2);
      if (i < targets.length - 1) expect(sim.state.phase).toBe('playing');
    });
    runFor(sim, 0.05);
    expect(sim.state.destructibleRemaining).toBe(0);
    expect(sim.state.phase).toBe('complete');
  });

  it('never counts fixed walls or steel blocks toward completion (req 4)', () => {
    const sim = makeSim(
      makeLevel({
        bricks: [{ col: 5, row: 6, kind: 'standard', hp: 1 }],
        statics: [
          { col: 1, row: 2, kind: 'wall' },
          { col: 2, row: 2, kind: 'wall' },
          { col: 9, row: 2, kind: 'steel' },
        ],
      }),
    );
    expect(sim.state.destructibleRemaining).toBe(1);
    const p = below(5, 6);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    const events = runUntil(sim, (evs) => count(evs, 'levelComplete') > 0, 3);
    expect(count(events, 'levelComplete')).toBe(1);
    expect(sim.state.phase).toBe('complete');
    expect(sim.state.statics).toHaveLength(3);
  });

  it('bounces off walls without damaging anything', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'standard', hp: 1 }], statics: [{ col: 5, row: 8, kind: 'wall' }] }));
    const p = below(5, 8);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    const events = runUntil(sim, (evs) => evs.some((e) => e.type === 'wallHit' && e.kind === 'wall'), 2);
    expect(events.some((e) => e.type === 'wallHit' && e.kind === 'wall')).toBe(true);
    expect(sim.state.balls[0]?.vy).toBeGreaterThan(0);
    expect(count(events, 'brickDestroyed')).toBe(0);
  });
});
