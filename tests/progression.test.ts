import { describe, expect, it } from 'vitest';
import { isCheckpointLevel, isSpecialLevelNumber } from '../src/core/level/levelProvider';
import { applyAttemptFailed, applyLevelComplete, checkpointMilestones, createLevelSimulation, newHighScoreRun, newProgressionRun } from '../src/core/run/run';
import type { GameSimulation } from '../src/core/sim/simulation';
import { GameSession } from '../src/game/session';
import { defaultSaveData } from '../src/persistence/schema';
import { DT } from './helpers';

function clearLevel(sim: GameSimulation): void {
  sim.debugDestroyAllBricks();
  sim.step(DT);
  expect(sim.state.phase).toBe('complete');
}

function failLevel(sim: GameSimulation): void {
  while (sim.state.phase === 'serving') sim.step(DT);
  sim.debugPlaceBall(20, 590, 0, 300);
  for (let i = 0; i < 60 && sim.state.phase === 'playing'; i++) sim.step(DT);
  expect(sim.state.phase).toBe('failed');
}

describe('Progression checkpoints', () => {
  it('creates checkpoints after levels 5, 10, 15, 20 and every further multiple of five (req 10)', () => {
    const run = newProgressionRun('classic', null);
    const checkpoints: number[] = [];
    for (let level = 1; level <= 36; level++) {
      expect(run.level).toBe(level);
      const sim = createLevelSimulation(run);
      clearLevel(sim);
      const result = applyLevelComplete(run, sim);
      if (result.checkpoint) checkpoints.push(result.checkpoint.level);
    }
    expect(checkpoints).toEqual([5, 10, 15, 20, 25, 30, 35]);
    expect(run.checkpoint.level).toBe(35);
    for (const n of [5, 10, 15, 100, 105, 1000]) expect(isCheckpointLevel(n)).toBe(true);
    for (const n of [1, 4, 6, 9, 11, 99, 101]) expect(isCheckpointLevel(n)).toBe(false);
    expect(checkpointMilestones(15)).toEqual([0, 5, 10, 15]);
  });

  it('places special levels roughly every ten levels', () => {
    const specials = Array.from({ length: 50 }, (_, i) => i + 1).filter(isSpecialLevelNumber);
    expect(specials).toEqual([10, 20, 30, 40, 50]);
  });

  it('restores the most recent checkpoint (level, score and inventory) after a failed attempt (req 11)', () => {
    const run = newProgressionRun('maze', null);
    // Level 1-5 with powers collected along the way.
    for (let level = 1; level <= 5; level++) {
      const sim = createLevelSimulation(run);
      if (level === 3) sim.state.inventory[0] = 'piercing';
      if (level === 5) sim.state.inventory[1] = 'explosion';
      clearLevel(sim);
      applyLevelComplete(run, sim);
    }
    const checkpointScore = run.score;
    expect(run.checkpoint).toEqual({ level: 5, inventory: ['piercing', 'explosion'], score: checkpointScore });

    // Level 6 and 7 change the inventory and score, then level 8 fails.
    for (let level = 6; level <= 7; level++) {
      const sim = createLevelSimulation(run);
      sim.state.inventory[0] = 'multiball';
      clearLevel(sim);
      applyLevelComplete(run, sim);
    }
    expect(run.level).toBe(8);
    expect(run.inventory).toEqual(['multiball', 'explosion']);
    const failing = createLevelSimulation(run);
    failLevel(failing);
    applyAttemptFailed(run, failing);
    expect(run.level).toBe(6);
    expect(run.score).toBe(checkpointScore);
    expect(run.inventory).toEqual(['piercing', 'explosion']);
    expect(run.attempt).toBe(1);

    // The restored level is a fresh, playable level 6 (never an already-completed state).
    const retry = createLevelSimulation(run);
    expect(retry.state.level.number).toBe(6);
    expect(retry.state.phase).toBe('serving');
    expect(retry.state.destructibleRemaining).toBe(retry.state.bricks.length);
  });

  it('returns to level 1 with an empty inventory before the first checkpoint', () => {
    const run = newProgressionRun('classic', null);
    for (let level = 1; level <= 3; level++) {
      const sim = createLevelSimulation(run);
      sim.state.inventory[0] = 'multiball';
      clearLevel(sim);
      applyLevelComplete(run, sim);
    }
    const sim = createLevelSimulation(run);
    failLevel(sim);
    applyAttemptFailed(run, sim);
    expect(run.level).toBe(1);
    expect(run.inventory).toEqual([null, null]);
    expect(run.score).toBe(0);
  });

  it('carries both stored powers over when a level is completed (req 12)', () => {
    for (const run of [newProgressionRun('classic', null), newHighScoreRun('maze', 77)]) {
      const sim = createLevelSimulation(run);
      sim.state.inventory[0] = 'multiball';
      sim.state.inventory[1] = 'piercing';
      clearLevel(sim);
      applyLevelComplete(run, sim);
      expect(run.inventory).toEqual(['multiball', 'piercing']);
      const next = createLevelSimulation(run);
      expect(next.state.level.number).toBe(2);
      expect(next.state.inventory).toEqual(['multiball', 'piercing']);
    }
  });

  it('keeps the High Score inventory and lives across levels and does not use checkpoints', () => {
    const run = newHighScoreRun('classic', 5);
    for (let level = 1; level <= 6; level++) {
      const sim = createLevelSimulation(run);
      if (level === 2) sim.state.inventory[0] = 'explosion';
      clearLevel(sim);
      const result = applyLevelComplete(run, sim);
      expect(result.checkpoint).toBeNull();
    }
    expect(run.inventory[0]).toBe('explosion');
    expect(run.lives).toBe(5);
    expect(run.checkpoint.level).toBe(0);
    expect(() => applyAttemptFailed(run, createLevelSimulation(run))).toThrow();
  });

  it('records checkpoints in the profile and resumes new sessions from them; High Score never touches them', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newProgression(data, 'classic', 0, { now: () => 0 });
    for (let i = 0; i < 5; i++) {
      if (i === 4) session.sim.state.inventory[0] = 'multiball';
      session.sim.debugDestroyAllBricks();
      session.step(DT);
      expect(session.phase).toBe('levelComplete');
      session.continueToNextLevel();
    }
    expect(data.profile.progression.classic.highestCheckpoint).toBe(5);
    expect(data.profile.progression.classic.checkpoints['5']?.inventory).toEqual(['multiball', null]);
    expect(data.profile.stats.checkpointsReached).toBe(1);

    const before = structuredClone(data.profile.progression);
    const hs = GameSession.newHighScore(data, 'classic', 3, { now: () => 0 });
    for (let life = 0; life < 5; life++) {
      while (hs.sim.state.phase === 'serving') hs.step(DT);
      hs.sim.debugPlaceBall(20, 590, 0, 300);
      for (let i = 0; i < 60 && hs.phase === 'playing' && hs.sim.state.phase === 'playing'; i++) hs.step(DT);
    }
    expect(hs.phase).toBe('runOver');
    expect(data.profile.progression).toEqual(before);

    const resumed = GameSession.newProgression(data, 'classic', null, { now: () => 0 });
    expect(resumed.run.level).toBe(6);
    expect(resumed.sim.state.inventory).toEqual(['multiball', null]);
  });
});
