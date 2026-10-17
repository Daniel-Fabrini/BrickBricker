import { describe, expect, it } from 'vitest';
import { LIVES, PADDLE, POWERS, SCORING } from '../src/config/tuning';
import { dropWeights, rollDrop } from '../src/core/sim/dropTable';
import { Rng } from '../src/core/rng';
import { newHighScoreRun } from '../src/core/run/run';
import type { GameSimulation } from '../src/core/sim/simulation';
import { count, makeLevel, makeSim, ofType, runFor, runUntil } from './helpers';

function dropBall(sim: GameSimulation, index = 0): void {
  // A ball far from the paddle, already below it and falling.
  sim.debugPlaceBall(20, 590, 0, 300, index);
}

function highScoreSim(lives?: number): GameSimulation {
  return makeSim(makeLevel({ bricks: [{ col: 0, row: 0, kind: 'standard', hp: 1 }, { col: 11, row: 0, kind: 'standard', hp: 1 }] }), {
    mode: 'highscore',
    lives,
  });
}

describe('lives and ball accounting', () => {
  it('starts a High Score run with five lives (req 6)', () => {
    expect(LIVES.highScoreStart).toBe(5);
    expect(newHighScoreRun('classic', 1).lives).toBe(5);
    expect(highScoreSim().state.lives).toBe(5);
  });

  it('does not cost a life when one ball is lost while others remain (req 5)', () => {
    const sim = highScoreSim();
    sim.debugPlaceBall(180, 300, 120, -250, 0);
    sim.debugPlaceBall(200, 300, -120, -250, 1);
    dropBall(sim, 2);
    expect(sim.state.balls).toHaveLength(3);
    const events = runFor(sim, 0.3);
    expect(count(events, 'ballLost')).toBe(1);
    expect(ofType(events, 'ballLost')[0]?.remaining).toBe(2);
    expect(count(events, 'lifeLost')).toBe(0);
    expect(sim.state.lives).toBe(5);
    expect(sim.state.balls).toHaveLength(2);
    expect(sim.state.phase).toBe('playing');
  });

  it('consumes exactly one life when the final ball is lost (req 7)', () => {
    const sim = highScoreSim();
    dropBall(sim);
    const events = runFor(sim, 0.5);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(sim.state.lives).toBe(4);
    expect(sim.state.phase).toBe('serving');
    expect(sim.state.balls).toHaveLength(1);
    // Nothing else is charged while the new ball waits on the paddle.
    const more = runFor(sim, 0.5);
    expect(count(more, 'lifeLost')).toBe(0);
    expect(sim.state.lives).toBe(4);
  });

  it('loses one life (not several) when multiple balls fall in the same step', () => {
    const sim = highScoreSim();
    dropBall(sim, 0);
    dropBall(sim, 1);
    dropBall(sim, 2);
    const events = runFor(sim, 0.3);
    expect(count(events, 'ballLost')).toBe(3);
    expect(count(events, 'lifeLost')).toBe(1);
    expect(sim.state.lives).toBe(4);
  });

  it('ends the run only when every life is exhausted (req 8)', () => {
    const sim = highScoreSim();
    for (let life = 5; life >= 1; life--) {
      expect(sim.state.phase).not.toBe('gameOver');
      runUntil(sim, () => sim.state.phase === 'playing', 3);
      dropBall(sim);
      const events = runFor(sim, 0.3);
      expect(sim.state.lives).toBe(life - 1);
      if (life > 1) {
        expect(sim.state.phase).toBe('serving');
        expect(count(events, 'runOver')).toBe(0);
      } else {
        expect(sim.state.phase).toBe('gameOver');
        expect(count(events, 'runOver')).toBe(1);
      }
    }
    expect(runFor(sim, 1)).toHaveLength(0);
  });

  it('respects the nine-life cap for Extra Life (req 9)', () => {
    const sim = highScoreSim(8);
    sim.spawnCollectible('extraLife', sim.state.paddle.x, PADDLE.y - 40);
    runUntil(sim, (evs) => count(evs, 'extraLifeCaught') > 0, 2);
    expect(sim.state.lives).toBe(9);
    const scoreBefore = sim.state.score;
    sim.spawnCollectible('extraLife', sim.state.paddle.x, PADDLE.y - 40);
    const events = runUntil(sim, (evs) => count(evs, 'extraLifeCaught') > 0, 2);
    const caught = ofType(events, 'extraLifeCaught')[0];
    expect(caught?.capped).toBe(true);
    expect(sim.state.lives).toBe(LIVES.highScoreMax);
    expect(sim.state.score).toBe(scoreBefore + SCORING.extraLifeAtCapPoints);
    expect(highScoreSim(42).state.lives).toBe(9);
  });

  it('handles Extra Life by its special rules: never stored, rare, not dropped in Progression (req 16)', () => {
    const sim = highScoreSim(3);
    sim.spawnCollectible('extraLife', sim.state.paddle.x, PADDLE.y - 40);
    runUntil(sim, (evs) => count(evs, 'extraLifeCaught') > 0, 2);
    expect(sim.state.lives).toBe(4);
    expect(sim.state.inventory).toEqual([null, null]);

    const rng = new Rng(1234);
    const counts: Record<string, number> = { multiball: 0, piercing: 0, explosion: 0, extraLife: 0, none: 0 };
    for (let i = 0; i < 20000; i++) {
      const kind = rollDrop(rng, { extraLifeEnabled: true, livesAtCap: false, extraLifeDropsThisLevel: 0 });
      counts[kind ?? 'none'] = (counts[kind ?? 'none'] ?? 0) + 1;
    }
    const drops = 20000 - (counts.none ?? 0);
    expect((counts.extraLife ?? 0) / drops).toBeLessThan(0.1);
    expect((counts.extraLife ?? 0) / drops).toBeGreaterThan(0.02);
    for (const p of ['multiball', 'piercing', 'explosion']) expect((counts[p] ?? 0) / drops).toBeGreaterThan(0.25);
    expect((counts.none ?? 0) / 20000).toBeCloseTo(1 - POWERS.dropChance, 1);

    // Progression has no life system: Extra Life is excluded from its drop table.
    expect(dropWeights({ extraLifeEnabled: false, livesAtCap: false, extraLifeDropsThisLevel: 0 }).find((w) => w.value === 'extraLife')?.weight).toBe(0);
    // At the cap it is removed from the table too.
    expect(dropWeights({ extraLifeEnabled: true, livesAtCap: true, extraLifeDropsThisLevel: 0 }).find((w) => w.value === 'extraLife')?.weight).toBe(0);
    for (let i = 0; i < 5000; i++) expect(rollDrop(rng, { extraLifeEnabled: false, livesAtCap: false, extraLifeDropsThisLevel: 0 })).not.toBe('extraLife');
  });

  it('counts launched balls with the documented rule: serves plus multiball creations', () => {
    const sim = highScoreSim();
    runUntil(sim, () => sim.state.phase === 'playing', 3);
    expect(sim.state.counters.ballsLaunched).toBe(1);
    sim.state.inventory[0] = 'multiball';
    sim.activatePower(0);
    expect(sim.state.counters.ballsLaunched).toBe(3);
    // Bounces never count.
    runFor(sim, 2, () => sim.setPaddleTarget(sim.state.balls[0]?.x ?? 180));
    expect(sim.state.counters.ballsLaunched).toBe(3);
  });
});
