import { describe, expect, it } from 'vitest';
import { GameSession, abandonSession } from '../src/game/session';
import { recordCheckpoint, unlockAchievements } from '../src/game/profile';
import { migrate } from '../src/persistence/migrations';
import { decodeSave, encodeSave, SaveManager, SAVE_KEYS } from '../src/persistence/saveManager';
import { defaultSaveData, SAVE_VERSION, type SaveData } from '../src/persistence/schema';
import { MemoryStore } from '../src/persistence/storage';
import { sanitizeSaveData, sanitizeSession } from '../src/persistence/validate';
import { DT } from './helpers';

/** Deterministic "player": paddle follows the lowest descending ball; power used on a schedule. */
function play(session: GameSession, steps: number, offset = 0): void {
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
    session.setPaddleTarget(target + Math.sin((i + offset) * 0.013) * 18);
    if ((i + offset) % 900 === 450) session.activatePower(0);
    session.step(DT);
    if (session.phase !== 'playing') session.continueToNextLevel();
    session.drainRenderEvents();
    session.drainNotices();
  }
}

function roundTrip(data: SaveData): SaveData {
  const decoded = decodeSave(encodeSave(data));
  return sanitizeSaveData(migrate(decoded).doc, 'en', 0).data;
}

describe('save and restore (req 21)', () => {
  it('restores mode, level, score, lives, balls, bricks, inventory and timers exactly', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newHighScore(data, 'maze', 4242, { now: () => 0 });
    session.sim.state.inventory[0] = 'multiball';
    play(session, 120 * 20);
    session.syncToSave();
    const saved = roundTrip(data);
    const snapshot = saved.session;
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;
    expect(snapshot.sim).not.toBeNull();

    const restored = GameSession.resume(saved, snapshot, { now: () => 0 });
    const a = session.sim.snapshot();
    const b = restored.sim.snapshot();
    expect(b).toEqual(a);
    expect(restored.run).toEqual(session.run);
    expect(restored.sim.state.lives).toBe(session.sim.state.lives);
    expect(restored.sim.state.balls).toEqual(session.sim.state.balls);
    expect(restored.sim.state.inventory).toEqual(session.sim.state.inventory);
    expect(restored.sim.state.combo).toEqual(session.sim.state.combo);
    expect(restored.sim.state.speed).toEqual(session.sim.state.speed);

    // Both continue identically with identical input.
    play(session, 120 * 10, 7);
    play(restored, 120 * 10, 7);
    expect(restored.sim.snapshot()).toEqual(session.sim.snapshot());
  });

  it('saves between-level sessions without a simulation and resumes at the next level start', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newProgression(data, 'classic', 0, { now: () => 0 });
    session.sim.debugDestroyAllBricks();
    session.step(DT);
    expect(session.phase).toBe('levelComplete');
    const saved = roundTrip(data);
    expect(saved.session?.sim).toBeNull();
    expect(saved.session?.run.level).toBe(2);
    const restored = GameSession.resume(saved, saved.session!, { now: () => 0 });
    expect(restored.sim.state.level.number).toBe(2);
    expect(restored.sim.state.phase).toBe('serving');
  });

  it('drops a corrupted session but keeps permanent progress', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newProgression(data, 'classic', 0, { now: () => 0 });
    play(session, 300);
    session.syncToSave();
    data.profile.highScores.classic.score = 1234;
    const raw = JSON.parse(JSON.stringify(data)) as { session: { sim: { balls: unknown } } };
    raw.session.sim.balls = 'garbage';
    const report = sanitizeSaveData(raw, 'en', 0);
    expect(report.sessionDropped).toBe(true);
    expect(report.data.session).toBeNull();
    expect(report.data.profile.highScores.classic.score).toBe(1234);
    expect(sanitizeSession({ version: 1, run: { mode: 'nope' } })).toBeNull();
  });
});

describe('save manager', () => {
  it('writes atomically to one key and keeps the previous document as a backup', async () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store, () => 1000);
    const data = defaultSaveData('es', 0);
    await saves.save(data);
    data.profile.stats.bricksDestroyed = 10;
    await saves.save(data);
    expect(store.data.has(SAVE_KEYS.main)).toBe(true);
    expect(store.data.has(SAVE_KEYS.backup)).toBe(true);
    const loaded = await new SaveManager(store).load('en');
    expect(loaded.outcome).toBe('loaded');
    expect(loaded.data.profile.stats.bricksDestroyed).toBe(10);
    expect(loaded.data.settings.language).toBe('es');
  });

  it('recovers from a corrupted main save using the backup', async () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    const data = defaultSaveData('en', 0);
    data.profile.stats.bricksDestroyed = 5;
    await saves.save(data);
    data.profile.stats.bricksDestroyed = 6;
    await saves.save(data);
    store.data.set(SAVE_KEYS.main, store.data.get(SAVE_KEYS.main)!.slice(0, 50));
    const loaded = await new SaveManager(store).load('en');
    expect(loaded.outcome).toBe('restoredBackup');
    expect(loaded.data.profile.stats.bricksDestroyed).toBe(5);
    expect(store.data.has(SAVE_KEYS.corrupt)).toBe(true);
  });

  it('detects tampered data through the checksum and starts fresh when nothing is usable', async () => {
    const store = new MemoryStore();
    const encoded = encodeSave(defaultSaveData('en', 0));
    store.data.set(SAVE_KEYS.main, encoded.replace('"bricksDestroyed":0', '"bricksDestroyed":999'));
    expect(decodeSave(store.data.get(SAVE_KEYS.main)!)).toBeNull();
    const loaded = await new SaveManager(store).load('pt-BR');
    expect(loaded.outcome).toBe('reset');
    expect(loaded.data.settings.language).toBe('pt-BR');
  });

  it('migrates the unversioned prototype layout and repairs invalid fields', () => {
    const legacy = { bestScore: 900, bestLevel: 12, settings: { theme: 'retro', musicVolume: 7, language: 'xx' } };
    const migrated = migrate(legacy);
    expect(migrated.fromVersion).toBe(0);
    expect(migrated.migrated).toBe(true);
    const data = sanitizeSaveData(migrated.doc, 'es', 0).data;
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.profile.highScores.classic.score).toBe(900);
    expect(data.profile.progression.classic.bestLevel).toBe(12);
    expect(data.profile.progression.classic.highestCheckpoint).toBe(10);
    expect(data.settings.theme).toBe('retro');
    expect(data.settings.musicVolume).toBe(1);
    expect(data.settings.language).toBe('es');
  });

  it('serialises concurrent writes and keeps the newest document', async () => {
    const store = new MemoryStore();
    const saves = new SaveManager(store);
    const data = defaultSaveData('en', 0);
    const writes = [];
    for (let i = 1; i <= 20; i++) {
      data.profile.stats.bricksDestroyed = i;
      writes.push(saves.save(structuredClone(data)));
    }
    await Promise.all(writes);
    const loaded = await new SaveManager(store).load('en');
    expect(loaded.data.profile.stats.bricksDestroyed).toBe(20);
  });
});

describe('abandoning a session (req 22)', () => {
  it('clears only the unfinished session', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newProgression(data, 'maze', 0, { now: () => 0 });
    play(session, 1200);
    recordCheckpoint(data.profile, 'maze', { level: 10, inventory: ['piercing', null], score: 4000 });
    data.profile.highScores.classic = { score: 9000, level: 7, date: 1 };
    data.profile.stats.bricksDestroyed += 600;
    unlockAchievements(data.profile, 5);
    session.syncToSave();
    expect(data.session).not.toBeNull();
    const before = structuredClone(data);
    abandonSession(data);
    expect(data.session).toBeNull();
    expect(data.profile).toEqual(before.profile);
    expect(data.settings).toEqual(before.settings);
    expect(data.profile.progression.maze.highestCheckpoint).toBe(10);
    expect(data.profile.cosmetics.unlocked).toContain('trail.dots');
  });
});

describe('statistics after restoration (req 27)', () => {
  it('never double-counts events when a saved session is restored and replayed', () => {
    const data = defaultSaveData('en', 0);
    const session = GameSession.newHighScore(data, 'classic', 99, { now: () => 0 });
    session.sim.state.inventory[0] = 'multiball';
    session.sim.state.inventory[1] = 'explosion';
    play(session, 120 * 15);
    session.syncToSave();
    // The save document holds stats AND the session from the same instant.
    const checkpointDoc = roundTrip(data);
    const statsAtSave = structuredClone(checkpointDoc.profile.stats);

    // Original keeps playing.
    play(session, 120 * 15, 3);
    const finalOriginal = structuredClone(data.profile.stats);

    // "Crash": restore from the save and play the same inputs.
    const restored = GameSession.resume(checkpointDoc, checkpointDoc.session!, { now: () => 0 });
    expect(checkpointDoc.profile.stats).toEqual(statsAtSave);
    play(restored, 120 * 15, 3);
    expect(checkpointDoc.profile.stats).toEqual(finalOriginal);
    expect(finalOriginal.bricksDestroyed).toBeGreaterThan(statsAtSave.bricksDestroyed);
    // Restoring alone does not re-count launches, games or bricks.
    const again = roundTrip(checkpointDoc);
    const before = structuredClone(again.profile.stats);
    GameSession.resume(again, again.session!, { now: () => 0 });
    expect(again.profile.stats).toEqual(before);
  });
});
