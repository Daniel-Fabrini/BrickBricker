import { describe, expect, it } from 'vitest';
import { TutorialDirector } from '../src/app/Tutorial';
import { DT } from './helpers';

describe('interactive tutorial', () => {
  it('waits for each player action before moving on and ends with the info cards', () => {
    const tips: string[] = [];
    const highlights: number[] = [];
    let cards = 0;
    const director = new TutorialDirector({
      tip: (text) => tips.push(text),
      highlightSlot: (i) => highlights.push(i),
      showCards: () => cards++,
    });
    const sim = director.sim;
    const step = (): void => {
      director.beforeStep(DT);
      sim.step(DT);
      director.onEvents(sim.drainEvents());
    };

    // 1. Nothing happens until the paddle is moved: the ball stays on the paddle.
    for (let i = 0; i < 120 * 5; i++) step();
    expect(director.stage).toBe('move');
    expect(sim.state.phase).toBe('serving');

    // 2. Swiping moves the paddle; afterwards the ball launches by itself.
    for (let i = 0; i < 120 && director.stage === 'move'; i++) {
      sim.setPaddleTarget(i % 60 < 30 ? 60 : 300);
      step();
    }
    expect(director.stage).toBe('launch');
    for (let i = 0; i < 240 && sim.state.phase === 'serving'; i++) step();
    expect(sim.state.phase).toBe('playing');

    // 3-5. Play: chase falling powers first, otherwise the ball; activate when asked.
    let activated = false;
    for (let i = 0; i < 120 * 300 && director.stage !== 'cards'; i++) {
      const s = sim.state;
      const power = s.collectibles[0];
      let target = s.paddle.x;
      let lowest = -1;
      for (const b of s.balls) {
        if (b.vy > 0 && b.y > lowest) {
          lowest = b.y;
          target = b.x;
        }
      }
      if (power && (lowest < 380 || power.y > lowest)) target = power.x;
      sim.setPaddleTarget(target);
      if (director.stage === 'activate' && s.phase === 'playing' && !activated) {
        const slot = s.inventory.findIndex((p) => p !== null);
        sim.activatePower(slot);
        director.onEvents(sim.drainEvents());
        activated = true;
      }
      step();
    }
    expect(activated).toBe(true);
    expect(highlights.some((i) => i >= 0)).toBe(true);
    expect(highlights[highlights.length - 1]).toBe(-1);
    expect(director.stage).toBe('cards');
    expect(cards).toBe(1);
    expect(sim.state.phase).toBe('complete');
    expect(new Set(tips).size).toBeGreaterThanOrEqual(4);
  });
});
