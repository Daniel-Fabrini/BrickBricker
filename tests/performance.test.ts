import { describe, expect, it } from 'vitest';
import { BALL } from '../src/config/tuning';
import { getLevel, PROGRESSION_SEED } from '../src/core/level/levelProvider';
import { GameSimulation } from '../src/core/sim/simulation';
import { botPaddle, DT } from './helpers';

describe('performance budget', () => {
  it('simulates a dense level with the maximum number of balls far faster than real time', () => {
    const level = getLevel('maze', 47, PROGRESSION_SEED);
    for (const b of level.bricks) {
      if (b.kind === 'standard') {
        b.kind = 'resistant';
        b.hp = 5;
      }
    }
    const sim = GameSimulation.create({ level, mode: 'tutorial', seed: 8, inventory: ['multiball', 'multiball'] });
    while (sim.state.phase !== 'playing') sim.step(DT);
    sim.activatePower(0);
    sim.activatePower(1);
    expect(sim.state.balls.length).toBe(BALL.maxBalls);
    const simulatedSeconds = 60;
    const start = performance.now();
    let maxBalls = 0;
    for (let i = 0; i < simulatedSeconds / DT; i++) {
      botPaddle(sim);
      sim.step(DT);
      sim.drainEvents();
      maxBalls = Math.max(maxBalls, sim.state.balls.length);
    }
    const elapsed = performance.now() - start;
    expect(maxBalls).toBe(BALL.maxBalls);
    // 60 s of gameplay at 120 Hz with 8 balls must take well under 1/10 of real time, leaving the
    // frame budget to rendering on phones.
    expect(elapsed).toBeLessThan(simulatedSeconds * 1000 * 0.1);
  });
});
