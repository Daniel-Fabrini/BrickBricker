import { describe, expect, it } from 'vitest';
import { BALL, PADDLE, POWERS, SCORING } from '../src/config/tuning';
import { emptyInventory, inventoryAdd, inventoryIsFull, inventoryTake } from '../src/core/sim/inventory';
import type { BrickDef } from '../src/core/level/types';
import { below, botPaddle, count, DT, makeLevel, makeSim, ofType, runFor, runUntil } from './helpers';

describe('inventory and power-ups', () => {
  it('never overwrites a stored power when the inventory is full (req 13)', () => {
    const slots = emptyInventory();
    expect(inventoryAdd(slots, 'multiball')).toBe(0);
    expect(inventoryAdd(slots, 'piercing')).toBe(1);
    expect(inventoryIsFull(slots)).toBe(true);
    expect(inventoryAdd(slots, 'explosion')).toBe(-1);
    expect(slots).toEqual(['multiball', 'piercing']);

    const sim = makeSim(makeLevel(), { inventory: ['multiball', 'piercing'] });
    sim.spawnCollectible('explosion', sim.state.paddle.x, PADDLE.y - 40);
    const events = runUntil(sim, (evs) => count(evs, 'inventoryFull') > 0, 2);
    expect(count(events, 'inventoryFull')).toBe(1);
    expect(count(events, 'powerCaught')).toBe(0);
    expect(sim.state.inventory).toEqual(['multiball', 'piercing']);
    expect(sim.state.score).toBe(SCORING.inventoryFullPoints);
  });

  it('fills the first free slot and takes powers out by slot', () => {
    const slots = emptyInventory();
    inventoryAdd(slots, 'explosion');
    inventoryAdd(slots, 'piercing');
    expect(inventoryTake(slots, 0)).toBe('explosion');
    expect(slots).toEqual([null, 'piercing']);
    expect(inventoryAdd(slots, 'multiball')).toBe(0);
    expect(inventoryTake(slots, 5)).toBeNull();
  });

  it('requires power-ups to be physically caught by the paddle (req 14)', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'resistant', hp: 5 }, { col: 11, row: 0, kind: 'resistant', hp: 5 }] }), { mode: 'tutorial' });
    sim.setPaddleTarget(300);
    runFor(sim, 0.5);
    const missedId = sim.spawnCollectible('multiball', 40, 300);
    const xs: number[] = [];
    const events = runUntil(
      sim,
      (evs) => evs.some((e) => e.type === 'collectibleMissed' && e.id === missedId),
      5,
      () => {
        const c = sim.state.collectibles.find((k) => k.id === missedId);
        if (c) xs.push(c.x);
      },
    );
    expect(count(events, 'collectibleMissed')).toBe(1);
    expect(count(events, 'powerCaught')).toBe(0);
    expect(sim.state.inventory).toEqual([null, null]);
    // No magnetism: the collectible falls straight down.
    expect(new Set(xs)).toEqual(new Set([40]));

    sim.spawnCollectible('piercing', 300, 300);
    const caught = runUntil(sim, (evs) => count(evs, 'powerCaught') > 0, 5);
    expect(ofType(caught, 'powerCaught')[0]?.power).toBe('piercing');
    expect(sim.state.inventory).toEqual(['piercing', null]);
  });

  it('discards uncollected power-ups when the level ends instead of storing them', () => {
    const sim = makeSim(makeLevel());
    sim.spawnCollectible('multiball', 40, 100);
    sim.debugDestroyAllBricks();
    const events = runFor(sim, 0.1);
    expect(count(events, 'collectiblesDiscarded')).toBe(1);
    expect(sim.state.inventory).toEqual([null, null]);
  });

  it('activates stored powers only through explicit player input (req 15)', () => {
    const bricks: BrickDef[] = [];
    for (let c = 0; c < 12; c++) bricks.push({ col: c, row: 2, kind: 'resistant', hp: 5 });
    const sim = makeSim(makeLevel({ bricks }), { inventory: ['multiball', 'explosion'] });
    const events = runFor(sim, 30, () => botPaddle(sim));
    expect(count(events, 'powerActivated')).toBe(0);
    expect(sim.state.inventory).toEqual(['multiball', 'explosion']);
    expect(sim.state.counters.powersActivated).toBe(0);

    expect(sim.activatePower(1)).toBe(true);
    expect(sim.state.inventory).toEqual(['multiball', null]);
    expect(sim.state.effects.explosiveCharges).toBe(1);
    expect(sim.activatePower(1)).toBe(false);
  });

  it('refuses activation while the ball rests on the paddle and keeps the power', () => {
    const sim = makeSim(makeLevel(), { inventory: ['piercing', null] });
    expect(sim.state.phase).toBe('serving');
    expect(sim.activatePower(0)).toBe(false);
    expect(sim.state.inventory[0]).toBe('piercing');
    expect(ofType(sim.drainEvents(), 'powerRejected')[0]?.reason).toBe('notPlaying');
  });

  it('multiball creates a bounded number of balls, each with its own valid trajectory', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'resistant', hp: 5 }] }), { inventory: ['multiball', 'multiball'] });
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    expect(sim.activatePower(0)).toBe(true);
    expect(sim.state.balls).toHaveLength(3);
    expect(sim.activatePower(1)).toBe(true);
    expect(sim.state.balls.length).toBeLessThanOrEqual(BALL.maxBalls);
    expect(sim.state.balls.length).toBe(BALL.maxBalls);
    const directions = new Set(sim.state.balls.map((b) => Math.atan2(b.vy, b.vx).toFixed(3)));
    expect(directions.size).toBe(sim.state.balls.length);
    for (const b of sim.state.balls) expect(Math.abs(b.vy) / Math.hypot(b.vx, b.vy)).toBeGreaterThanOrEqual(BALL.minVerticalRatio - 1e-9);
    sim.state.inventory[0] = 'multiball';
    expect(sim.activatePower(0)).toBe(false);
    expect(sim.state.inventory[0]).toBe('multiball');
  });

  it('piercing passes through bricks but still respects resistant hit points', () => {
    const bricks: BrickDef[] = [
      { col: 5, row: 8, kind: 'standard', hp: 1 },
      { col: 5, row: 7, kind: 'resistant', hp: 3 },
      { col: 5, row: 6, kind: 'standard', hp: 1 },
      { col: 0, row: 0, kind: 'standard', hp: 1 },
    ];
    const sim = makeSim(makeLevel({ bricks }), { inventory: ['piercing', null] });
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    sim.activatePower(0);
    const p = below(5, 8);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    const events = runUntil(sim, (evs) => count(evs, 'wallHit') > 0, 2);
    expect(ofType(events, 'brickDestroyed').map((e) => e.brickId).sort()).toEqual([0, 2]);
    expect(ofType(events, 'brickDamaged')).toHaveLength(1);
    expect(sim.state.bricks[1]?.hp).toBe(2);
    expect(sim.state.bricks[1]?.alive).toBe(true);
    expect(sim.state.effects.piercingKills).toBe(2);
  });

  it('explosion damages nearby bricks by its strength and never bypasses hit points', () => {
    const bricks: BrickDef[] = [];
    for (let c = 3; c <= 7; c++) for (let r = 4; r <= 6; r++) bricks.push({ col: c, row: r, kind: c === 5 && r === 5 ? 'standard' : 'resistant', hp: c === 5 && r === 5 ? 1 : 3 });
    bricks.push({ col: 0, row: 0, kind: 'standard', hp: 1 });
    const sim = makeSim(makeLevel({ bricks }), { inventory: ['explosion', null] });
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    sim.activatePower(0);
    // Hit the bottom-centre brick (col 5, row 6) from below.
    const p = below(5, 6);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    const events = runUntil(sim, (evs) => count(evs, 'explosion') > 0, 2);
    const explosion = ofType(events, 'explosion')[0];
    expect(explosion).toBeDefined();
    for (const b of sim.state.bricks) {
      expect(b.hp).toBeGreaterThanOrEqual(0);
      expect(b.maxHp - b.hp).toBeLessThanOrEqual(POWERS.explosion.innerDamage);
    }
    expect(sim.state.effects.explosiveCharges).toBe(0);
    expect(sim.state.destructibleRemaining).toBe(sim.state.bricks.filter((b) => b.alive).length);
  });
});

describe('no duplicate destruction or score events (req 17)', () => {
  it('counts a brick hit by several simultaneous multiball balls exactly once', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 5, row: 5, kind: 'standard', hp: 1 }, { col: 0, row: 0, kind: 'standard', hp: 1 }] }));
    const p = below(5, 5, 20);
    for (let i = 0; i < 6; i++) sim.debugPlaceBall(p.x + (i - 3) * 2, p.y, 0, -300, i);
    const events = runFor(sim, 0.3);
    const destroyed = ofType(events, 'brickDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(sim.state.score).toBe(destroyed[0]?.points);
    expect(sim.state.counters.bricksDestroyed).toBe(1);
  });

  it('keeps explosion destruction, counters and score consistent with the events emitted', () => {
    const bricks: BrickDef[] = [];
    for (let c = 2; c <= 9; c++) for (let r = 3; r <= 7; r++) bricks.push({ col: c, row: r, kind: (c + r) % 3 === 0 ? 'resistant' : 'standard', hp: (c + r) % 3 === 0 ? 2 : 1 });
    const sim = makeSim(makeLevel({ bricks }), { inventory: ['explosion', 'multiball'] });
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    sim.activatePower(0);
    sim.activatePower(1);
    const all = runFor(sim, 20, () => botPaddle(sim));
    const destroyed = ofType(all, 'brickDestroyed');
    const ids = destroyed.map((e) => e.brickId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(destroyed.length).toBe(sim.state.bricks.filter((b) => !b.alive).length);
    expect(sim.state.counters.bricksDestroyed).toBe(destroyed.length);
    const points =
      destroyed.reduce((sum, e) => sum + e.points, 0) +
      ofType(all, 'brickDamaged').reduce((sum, e) => sum + e.points, 0) +
      ofType(all, 'levelComplete').reduce((sum, e) => sum + e.bonus, 0) +
      ofType(all, 'inventoryFull').reduce((sum, e) => sum + e.points, 0) +
      ofType(all, 'extraLifeCaught').reduce((sum, e) => sum + e.points, 0);
    expect(sim.state.score).toBe(points);
  });

  it('does not double-count a brick destroyed by explosion and touched by another ball in the same step', () => {
    const bricks: BrickDef[] = [
      { col: 5, row: 5, kind: 'standard', hp: 1 },
      { col: 6, row: 5, kind: 'standard', hp: 1 },
      { col: 0, row: 0, kind: 'standard', hp: 1 },
    ];
    const sim = makeSim(makeLevel({ bricks }), { inventory: ['explosion', null] });
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    sim.activatePower(0);
    const a = below(5, 5, 10);
    const b = below(6, 5, 10);
    sim.debugPlaceBall(a.x, a.y, 0, -300, 0);
    sim.debugPlaceBall(b.x, b.y, 0, -300, 1);
    const events = runFor(sim, 0.2);
    const destroyed = ofType(events, 'brickDestroyed').filter((e) => e.brickId !== 2);
    expect(destroyed.map((e) => e.brickId).sort()).toEqual([0, 1]);
    expect(sim.state.counters.bricksDestroyed).toBe(2);
    expect(DT).toBeGreaterThan(0);
  });
});
