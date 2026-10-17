import { describe, expect, it } from 'vitest';
import { BALL, PADDLE, SCORING, SPEED } from '../src/config/tuning';
import { getLevel, PROGRESSION_SEED } from '../src/core/level/levelProvider';
import type { BrickDef } from '../src/core/level/types';
import { FixedStepLoop } from '../src/core/sim/loop';
import { burstBonus, comboMultiplier, comboRegister, comboTick, destroyPoints, levelMultiplier, newCombo } from '../src/core/sim/scoring';
import { GameSimulation } from '../src/core/sim/simulation';
import { effectiveSpeed, newSpeedState, speedOnDestroy, speedTick } from '../src/core/sim/speed';
import { GameSession } from '../src/game/session';
import { defaultSaveData } from '../src/persistence/schema';
import { below, botPaddle, count, DT, makeLevel, makeSim, ofType, runFor, runUntil } from './helpers';

describe('scoring and combos (req 18)', () => {
  it('raises the multiplier every few chained destructions up to a cap', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(4)).toBe(1);
    expect(comboMultiplier(5)).toBe(1.5);
    expect(comboMultiplier(10)).toBe(2);
    expect(comboMultiplier(15)).toBe(2.5);
    expect(comboMultiplier(30)).toBe(SCORING.comboMaxMultiplier);
    expect(comboMultiplier(500)).toBe(SCORING.comboMaxMultiplier);
    for (let c = 1; c < 60; c++) expect(comboMultiplier(c)).toBeGreaterThanOrEqual(comboMultiplier(c - 1));
  });

  it('keeps the combo alive within the window and ends it after the timeout', () => {
    const combo = newCombo();
    comboRegister(combo);
    expect(comboTick(combo, SCORING.comboWindow - 0.1)).toBe(0);
    comboRegister(combo);
    expect(combo.chain).toBe(2);
    // A short pause (e.g. waiting for the ball to come back) does not break it.
    expect(comboTick(combo, SCORING.comboWindow * 0.9)).toBe(0);
    expect(comboTick(combo, SCORING.comboWindow * 0.2)).toBe(2);
    expect(combo.chain).toBe(0);
    expect(combo.best).toBe(2);
  });

  it('applies level and combo multipliers plus power and burst bonuses', () => {
    expect(levelMultiplier(1)).toBe(1);
    expect(levelMultiplier(1000)).toBe(SCORING.levelBonusMax);
    expect(destroyPoints('standard', 1, 1, 1, false, 0)).toBe(10);
    expect(destroyPoints('resistant', 3, 1, 1, false, 0)).toBe(30);
    expect(destroyPoints('standard', 1, 1, 10, false, 0)).toBe(20);
    expect(destroyPoints('standard', 1, 1, 1, true, 0)).toBe(10 + SCORING.powerKillBonus);
    const recent: number[] = [];
    expect(burstBonus(recent, 0).bonus).toBe(0);
    expect(burstBonus(recent, 0.1).bonus).toBe(0);
    expect(burstBonus(recent, 0.2).bonus).toBe(SCORING.burstPointsPerBrick);
    expect(burstBonus(recent, 5).bonus).toBe(0);
  });

  it('ends the combo in the simulation after a period without destruction', () => {
    const bricks: BrickDef[] = [
      { col: 5, row: 5, kind: 'standard', hp: 1 },
      { col: 0, row: 0, kind: 'resistant', hp: 5 },
    ];
    const sim = makeSim(makeLevel({ bricks }));
    const p = below(5, 5);
    sim.debugPlaceBall(p.x, p.y, 0, -300);
    runUntil(sim, (evs) => count(evs, 'brickDestroyed') > 0, 2);
    expect(sim.state.combo.chain).toBe(1);
    const events = runFor(sim, SCORING.comboWindow + 0.2, () => sim.setPaddleTarget(sim.state.balls[0]?.x ?? 180));
    expect(ofType(events, 'comboEnd')[0]?.chain).toBe(1);
    expect(sim.state.combo.chain).toBe(0);
  });
});

describe('inactivity speed adjustment (req 19)', () => {
  it('waits for the inactivity delay, then increases speed gradually up to a cap', () => {
    const s = newSpeedState();
    const dt = 1 / 120;
    let previous = s.boost;
    let maxStep = 0;
    for (let t = 0; t < 60; t += dt) {
      speedTick(s, dt);
      maxStep = Math.max(maxStep, s.boost - previous);
      previous = s.boost;
      if (t < SPEED.inactivityDelay - dt) expect(s.boost).toBe(1);
    }
    expect(s.boost).toBeCloseTo(SPEED.maxBoost, 6);
    expect(maxStep).toBeLessThanOrEqual(SPEED.boostRate * dt + 1e-9);
    expect(effectiveSpeed(10_000, s)).toBe(BALL.absoluteMaxSpeed);
  });

  it('resets on destruction and returns smoothly toward the level speed', () => {
    const s = { inactivity: 30, boost: SPEED.maxBoost };
    speedOnDestroy(s);
    expect(s.inactivity).toBe(0);
    const dt = 1 / 120;
    let previous = s.boost;
    for (let i = 0; i < 120; i++) {
      speedTick(s, dt);
      expect(previous - s.boost).toBeLessThanOrEqual(SPEED.recoveryRate * dt + 1e-9);
      expect(s.boost).toBeLessThanOrEqual(previous);
      previous = s.boost;
    }
    for (let i = 0; i < 400; i++) speedTick(s, dt);
    expect(s.boost).toBe(1);
  });

  it('speeds up a ball in a stalled level without sudden jumps and never exceeds the cap', () => {
    const sim = makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'resistant', hp: 5 }], speed: 450 }));
    const p = { x: 300, y: 400 };
    sim.debugPlaceBall(p.x, p.y, 0, -450);
    let prevSpeed = sim.currentSpeed();
    let maxJump = 0;
    runFor(sim, 30, () => {
      sim.setPaddleTarget(sim.state.balls[0]?.x ?? 300);
      const speed = sim.currentSpeed();
      maxJump = Math.max(maxJump, Math.abs(speed - prevSpeed));
      prevSpeed = speed;
      expect(speed).toBeLessThanOrEqual(BALL.absoluteMaxSpeed);
    });
    expect(sim.currentSpeed()).toBeGreaterThan(450 * 1.1);
    expect(sim.currentSpeed()).toBeLessThanOrEqual(BALL.absoluteMaxSpeed);
    expect(maxJump).toBeLessThan(0.2);
  });
});

describe('pause (req 20)', () => {
  it('freezes timers, balls, obstacles, combos and falling power-ups', () => {
    const level = getLevel('maze', 26, PROGRESSION_SEED);
    expect(level.obstacles.length).toBeGreaterThan(0);
    const sim = GameSimulation.create({ level, mode: 'progression', seed: 3 });
    const loop = new FixedStepLoop((dt) => sim.step(dt));
    for (let i = 0; i < 300; i++) {
      botPaddle(sim);
      loop.advance(1 / 60);
    }
    sim.spawnCollectible('multiball', 100, 200);
    sim.state.combo.chain = 3;
    sim.state.combo.timer = 1;
    loop.advance(1 / 60);
    const before = JSON.stringify(sim.snapshot());
    const sliders = JSON.stringify(sim.sliderPoses());
    loop.pause();
    for (let i = 0; i < 600; i++) expect(loop.advance(1 / 60)).toBe(0);
    expect(JSON.stringify(sim.snapshot())).toBe(before);
    expect(JSON.stringify(sim.sliderPoses())).toBe(sliders);
    loop.resume();
    expect(loop.advance(1 / 60)).toBeGreaterThan(0);
    expect(JSON.stringify(sim.snapshot())).not.toBe(before);
  });

  it('does not let a paused session advance or charge a life', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newHighScore(data, 'classic', 9, { now: () => 0 });
    const loop = new FixedStepLoop((dt) => session.step(dt));
    loop.advance(0.05);
    session.sim.debugPlaceBall(20, 590, 0, 300);
    loop.pause();
    for (let i = 0; i < 100; i++) loop.advance(0.1);
    expect(session.sim.state.lives).toBe(5);
    expect(data.profile.stats.livesLost).toBe(0);
  });

  it('clamps huge frame deltas (e.g. after the app resumes)', () => {
    let steps = 0;
    const loop = new FixedStepLoop(() => steps++);
    loop.advance(30);
    expect(steps).toBeLessThanOrEqual(24);
  });
});

describe('ball physics', () => {
  it('rebounds more vertically from the paddle centre and more angled near the edges', () => {
    const angleFor = (offset: number): number => {
      const sim = makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'resistant', hp: 5 }] }));
      runFor(sim, 0.05);
      const x = sim.state.paddle.x + offset;
      sim.debugPlaceBall(x, PADDLE.y - 30, 0, 300);
      runUntil(sim, (evs) => count(evs, 'paddleHit') > 0, 1);
      const b = sim.state.balls[0];
      if (!b) throw new Error('no ball');
      expect(b.vy).toBeLessThan(0);
      return Math.abs(Math.atan2(b.vx, -b.vy)) * (180 / Math.PI);
    };
    const centre = angleFor(0);
    const mid = angleFor(PADDLE.width * 0.25);
    const edge = angleFor(PADDLE.width * 0.48);
    expect(centre).toBeLessThan(BALL.minPaddleAngleDeg + 0.5);
    expect(mid).toBeGreaterThan(centre);
    expect(edge).toBeGreaterThan(mid);
    expect(edge).toBeLessThanOrEqual(BALL.maxBounceAngleDeg + 1e-6);
  });

  it('keeps every active ball on a valid trajectory (speed, vertical component, finite state)', () => {
    for (const style of ['classic', 'maze'] as const) {
      const level = getLevel(style, 27, PROGRESSION_SEED);
      const sim = GameSimulation.create({ level, mode: 'tutorial', seed: 11, inventory: ['multiball', 'multiball'] });
      let activated = 0;
      for (let i = 0; i < 120 * 90; i++) {
        botPaddle(sim);
        sim.step(DT);
        sim.drainEvents();
        if (sim.state.phase === 'playing' && activated < 2 && i % 600 === 0) {
          sim.activatePower(activated);
          activated++;
        }
        if (sim.state.phase !== 'playing') continue;
        const speed = sim.currentSpeed();
        expect(speed).toBeLessThanOrEqual(BALL.absoluteMaxSpeed + 1e-6);
        for (const b of sim.state.balls) {
          expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy)).toBe(true);
          const mag = Math.hypot(b.vx, b.vy);
          expect(Math.abs(mag - speed) / speed).toBeLessThan(0.05);
          expect(Math.abs(b.vy) / mag).toBeGreaterThanOrEqual(BALL.minVerticalRatio - 0.02);
          expect(b.x).toBeGreaterThanOrEqual(BALL.radius - 0.5);
          expect(b.x).toBeLessThanOrEqual(360 - BALL.radius + 0.5);
        }
        if (sim.isFinished()) break;
      }
    }
  });

  it('does not tunnel through a thin row of bricks at maximum speed', () => {
    const bricks: BrickDef[] = [];
    for (let c = 0; c < 12; c++) bricks.push({ col: c, row: 6, kind: 'resistant', hp: 5 });
    const sim = makeSim(makeLevel({ bricks, speed: BALL.absoluteMaxSpeed }));
    for (let i = 0; i < 20; i++) {
      const x = 15 + i * 16.5;
      sim.debugPlaceBall(x, 260, (i % 2 ? 1 : -1) * 120, -BALL.absoluteMaxSpeed);
      runUntil(sim, (evs) => count(evs, 'brickDamaged') + count(evs, 'brickDestroyed') > 0, 1);
      const b = sim.state.balls[0];
      expect(b && b.y > 36 + 7 * 15).toBe(true);
    }
  });
});
