import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements } from '../src/core/meta/achievements';
import { COSMETICS, DEFAULT_COSMETICS, sanitizeSelection } from '../src/core/meta/cosmetics';
import { applySimEvent, emptyStats } from '../src/core/meta/stats';
import { getLevel, PROGRESSION_SEED } from '../src/core/level/levelProvider';
import { GameSession } from '../src/game/session';
import { achievementContext, unlockAchievements } from '../src/game/profile';
import { defaultSaveData, type SaveData } from '../src/persistence/schema';
import { NEON, RETRO, THEMES } from '../src/render/themes';
import { DT } from './helpers';

function drive(session: GameSession, steps: number): void {
  for (let i = 0; i < steps; i++) {
    const s = session.sim.state;
    let target = s.paddle.x;
    let lowest = -1;
    for (const b of s.balls) {
      if (b.vy > 0 && b.y > lowest) {
        lowest = b.y;
        target = b.x;
      }
    }
    session.setPaddleTarget(target + Math.cos(i * 0.01) * 15);
    session.step(DT);
    if (session.phase === 'levelComplete' || session.phase === 'attemptFailed') session.continueToNextLevel();
  }
}

function everythingUnlocked(): SaveData {
  const data = defaultSaveData('en', 0);
  for (const a of ACHIEVEMENTS) data.profile.achievements[a.id] = 1;
  data.profile.cosmetics.unlocked = COSMETICS.map((c) => c.id);
  data.profile.cosmetics.selected = { ball: 'ball.gem', paddle: 'paddle.glitch', trail: 'trail.rainbow', burst: 'burst.stars' };
  return data;
}

describe('theme switching (req 24)', () => {
  it('produces identical gameplay in Retro and Neon', () => {
    for (const mode of ['progression', 'highscore'] as const) {
      const results = (['retro', 'neon'] as const).map((theme) => {
        const data = defaultSaveData('en', 0);
        data.settings.theme = theme;
        const session =
          mode === 'progression'
            ? GameSession.newProgression(data, 'maze', 0, { theme, now: () => 0 })
            : GameSession.newHighScore(data, 'classic', 31337, { theme, now: () => 0 });
        drive(session, 120 * 40);
        const snap = session.sim.snapshot();
        const stats = { ...data.profile.stats, themesPlayed: [] };
        return { snap, run: session.run, stats };
      });
      expect(results[0]?.snap).toEqual(results[1]?.snap);
      expect(results[0]?.run).toEqual(results[1]?.run);
      expect(results[0]?.stats).toEqual(results[1]?.stats);
    }
  });

  it('keeps theme data purely visual', () => {
    expect(Object.keys(THEMES)).toEqual(['retro', 'neon']);
    const gameplayWords = /speed|radius|hp|score|lives|damage|width|height|probab|weight/i;
    for (const theme of [RETRO, NEON]) for (const key of Object.keys(theme)) expect(gameplayWords.test(key), key).toBe(false);
    // Level layouts never depend on the theme: the generator has no theme input.
    expect(getLevel('maze', 23, PROGRESSION_SEED)).toEqual(getLevel('maze', 23, PROGRESSION_SEED));
  });
});

describe('achievements and cosmetics grant no gameplay advantage (req 26)', () => {
  it('plays identically with no rewards and with every reward unlocked and equipped', () => {
    const plain = defaultSaveData('en', 0);
    const rich = everythingUnlocked();
    const a = GameSession.newHighScore(plain, 'maze', 2024, { now: () => 0 });
    const b = GameSession.newHighScore(rich, 'maze', 2024, { now: () => 0 });
    expect(b.sim.snapshot()).toEqual(a.sim.snapshot());
    drive(a, 120 * 45);
    drive(b, 120 * 45);
    expect(b.sim.snapshot()).toEqual(a.sim.snapshot());
    expect(b.run.score).toBe(a.run.score);
    expect(b.run.lives).toBe(a.run.lives);
  });

  it('cosmetics are visual descriptors only', () => {
    for (const c of COSMETICS) expect(Object.keys(c).sort()).toEqual(['category', 'id', 'unlockedBy', 'variant']);
    for (const c of COSMETICS) if (c.unlockedBy) expect(ACHIEVEMENTS.some((a) => a.id === c.unlockedBy)).toBe(true);
    expect(sanitizeSelection({ ball: 'ball.gem' }, ['ball.classic'])).toEqual(DEFAULT_COSMETICS);
  });

  it('unlocking achievements only changes achievements and cosmetics', () => {
    const data = defaultSaveData('en', 0);
    data.profile.stats.bricksDestroyed = 30_000;
    data.profile.stats.bestCombo = 60;
    data.profile.highScores.classic.score = 200_000;
    const before = structuredClone(data);
    const result = unlockAchievements(data.profile, 10);
    expect(result.achievements.length).toBeGreaterThan(5);
    expect(result.cosmetics.length).toBeGreaterThan(0);
    expect(data.profile.stats).toEqual(before.profile.stats);
    expect(data.profile.highScores).toEqual(before.profile.highScores);
    expect(data.profile.progression).toEqual(before.profile.progression);
    expect(data.settings).toEqual(before.settings);
    // Idempotent: nothing new on a second evaluation.
    expect(unlockAchievements(data.profile, 11).achievements).toHaveLength(0);
  });

  it('every achievement is reachable through normal play statistics', () => {
    const stats = emptyStats();
    const ctx = achievementContext(defaultSaveData('en', 0).profile);
    expect(evaluateAchievements(ctx, [])).toHaveLength(0);
    stats.bricksDestroyed = 25_000;
    stats.bestCombo = 50;
    stats.checkpointsReached = 10;
    stats.recordsBroken = 1;
    stats.maxSimultaneousBalls = 8;
    stats.bestPiercingKills = 10;
    stats.bestExplosionKills = 6;
    stats.powersCollected = 25;
    stats.extraLivesCollected = 1;
    stats.mazeLevelsCompleted = 25;
    stats.mazeDynamicLevelsCompleted = 1;
    stats.specialLevelsCompleted = 5;
    stats.flawlessLevels = 1;
    stats.lastStandClears = 1;
    stats.maxLivesHeld = 9;
    stats.bestRally = 8;
    stats.overdriveDestroys = 1;
    stats.themesPlayed = ['retro', 'neon'];
    const all = evaluateAchievements({ stats, records: { bestHighScore: { classic: 150_000, maze: 0 }, bestLevel: { classic: 100, maze: 0 } } }, []);
    expect(all.map((a) => a.id).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('tutorial play is never counted in statistics', () => {
    const stats = emptyStats();
    applySimEvent(stats, { type: 'serve', ballId: 1 }, { mode: 'tutorial', style: 'classic', boost: 1, rally: 0, balls: 1 });
    expect(stats).toEqual(emptyStats());
  });
});
