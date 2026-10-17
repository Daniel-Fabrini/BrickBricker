import { LIVES, POWERS, WORLD } from '../config/tuning';
import { COSMETICS, sanitizeSelection } from '../core/meta/cosmetics';
import { emptyStats, type Stats } from '../core/meta/stats';
import type { BrickDef, LevelDefinition, ObstacleDef, StaticDef } from '../core/level/types';
import type { RunState } from '../core/run/run';
import type { BallState, BrickState, SimState } from '../core/sim/state';
import { emptyCounters } from '../core/sim/state';
import {
  BRICK_KINDS,
  COLLECTIBLE_KINDS,
  GAME_STYLES,
  isGameMode,
  isGameStyle,
  isPowerType,
  isThemeId,
  POWER_TYPES,
  STATIC_KINDS,
  type InventorySlots,
} from '../core/types';
import {
  defaultProfile,
  defaultSettings,
  LANGUAGES,
  SAVE_VERSION,
  type CheckpointRecord,
  type LanguageCode,
  type Profile,
  type ProgressionRecord,
  type SaveData,
  type SessionSnapshot,
  type Settings,
} from './schema';

/**
 * Defensive sanitisation of loaded save data. Permanent data (settings, profile) is repaired
 * field by field so one bad value never wipes progress; the unfinished session is either fully
 * valid or discarded, because resuming a half-valid game state could be unsafe.
 */

type Dict = Record<string, unknown>;

export function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function dict(v: unknown): Dict {
  return isDict(v) ? v : {};
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function int(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function sanitizeInventory(v: unknown): InventorySlots {
  const arr = Array.isArray(v) ? v : [];
  const out: InventorySlots = [];
  for (let i = 0; i < POWERS.inventorySlots; i++) {
    const p = arr[i];
    out.push(isPowerType(p) ? p : null);
  }
  return out;
}

export function sanitizeSettings(v: unknown, fallbackLanguage: LanguageCode): Settings {
  const d = dict(v);
  const def = defaultSettings(fallbackLanguage);
  return {
    language: oneOf(d.language, LANGUAGES, def.language),
    theme: isThemeId(d.theme) ? d.theme : def.theme,
    style: isGameStyle(d.style) ? d.style : def.style,
    musicVolume: num(d.musicVolume, def.musicVolume, 0, 1),
    sfxVolume: num(d.sfxVolume, def.sfxVolume, 0, 1),
    musicEnabled: bool(d.musicEnabled, def.musicEnabled),
    sfxEnabled: bool(d.sfxEnabled, def.sfxEnabled),
    controlMode: oneOf(d.controlMode, ['direct', 'relative'] as const, def.controlMode),
    controlAssist: bool(d.controlAssist, def.controlAssist),
    ballVisibility: bool(d.ballVisibility, def.ballVisibility),
    tolerantControl: bool(d.tolerantControl, def.tolerantControl),
    reducedEffects: bool(d.reducedEffects, def.reducedEffects),
    haptics: bool(d.haptics, def.haptics),
  };
}

function sanitizeStats(v: unknown): Stats {
  const d = dict(v);
  const out = emptyStats();
  for (const key of Object.keys(out) as (keyof Stats)[]) {
    const current = out[key];
    if (typeof current === 'number') {
      // Counters are integers; play time is fractional seconds and must not be rounded.
      (out as unknown as Dict)[key] = key === 'playTimeSeconds' ? num(d[key], 0, 0) : int(d[key], 0);
    }
  }
  for (const key of ['collectedByType', 'activatedByType'] as const) {
    const src = dict(d[key]);
    for (const p of POWER_TYPES) out[key][p] = int(src[p], 0);
  }
  out.themesPlayed = Array.isArray(d.themesPlayed) ? [...new Set(d.themesPlayed.filter(isThemeId))] : [];
  return out;
}

function sanitizeProgression(v: unknown): ProgressionRecord {
  const d = dict(v);
  const checkpoints: Record<string, CheckpointRecord> = {};
  const highest = int(d.highestCheckpoint, 0);
  const normalizedHighest = highest - (highest % 5);
  for (const [key, value] of Object.entries(dict(d.checkpoints))) {
    const level = Number(key);
    if (!Number.isInteger(level) || level <= 0 || level % 5 !== 0 || level > normalizedHighest) continue;
    const cp = dict(value);
    checkpoints[String(level)] = { inventory: sanitizeInventory(cp.inventory), score: int(cp.score, 0) };
  }
  return {
    bestLevel: Math.max(int(d.bestLevel, 0), normalizedHighest),
    highestCheckpoint: normalizedHighest,
    checkpoints,
  };
}

export function sanitizeProfile(v: unknown, now: number): Profile {
  const d = dict(v);
  const def = defaultProfile(now);
  const hs = dict(d.highScores);
  const prog = dict(d.progression);
  const unlockedCosmetics = new Set(def.cosmetics.unlocked);
  const cos = dict(d.cosmetics);
  if (Array.isArray(cos.unlocked)) {
    for (const id of cos.unlocked) if (typeof id === 'string' && COSMETICS.some((c) => c.id === id)) unlockedCosmetics.add(id);
  }
  const unlocked = [...unlockedCosmetics];
  const achievements: Record<string, number> = {};
  for (const [id, ts] of Object.entries(dict(d.achievements))) {
    if (typeof id === 'string' && id.length < 64) achievements[id] = int(ts, now);
  }
  const highScores = { ...def.highScores };
  for (const style of GAME_STYLES) {
    const r = dict(hs[style]);
    highScores[style] = { score: int(r.score, 0), level: int(r.level, 0), date: int(r.date, 0) };
  }
  return {
    createdAt: int(d.createdAt, now),
    tutorialDone: bool(d.tutorialDone, false),
    onboarded: bool(d.onboarded, false),
    highScores,
    progression: { classic: sanitizeProgression(prog.classic), maze: sanitizeProgression(prog.maze) },
    stats: sanitizeStats(d.stats),
    achievements,
    cosmetics: { unlocked, selected: sanitizeSelection(dict(cos.selected), unlocked) },
  };
}

// ---------------------------------------------------------------- session (all-or-nothing)

class Invalid extends Error {}

function req(cond: boolean, what: string): void {
  if (!cond) throw new Invalid(what);
}

function finite(v: unknown, what: string): number {
  req(typeof v === 'number' && Number.isFinite(v), what);
  return v as number;
}

function intIn(v: unknown, min: number, max: number, what: string): number {
  const n = finite(v, what);
  req(Number.isInteger(n) && n >= min && n <= max, what);
  return n;
}

function checkLevel(v: unknown): LevelDefinition {
  const d = dict(v);
  req(typeof d.key === 'string', 'level.key');
  intIn(d.number, 1, 1_000_000, 'level.number');
  req(isGameStyle(d.style), 'level.style');
  finite(d.seed, 'level.seed');
  req(d.special === null || typeof d.special === 'string', 'level.special');
  intIn(d.rows, 0, WORLD.gridMaxRows, 'level.rows');
  finite(d.ballSpeed, 'level.ballSpeed');
  req(Array.isArray(d.bricks) && Array.isArray(d.statics) && Array.isArray(d.obstacles), 'level arrays');
  for (const b of d.bricks as unknown[]) {
    const bd = dict(b) as Partial<BrickDef>;
    intIn(bd.col, 0, WORLD.gridCols - 1, 'brick.col');
    intIn(bd.row, 0, WORLD.gridMaxRows - 1, 'brick.row');
    req((BRICK_KINDS as readonly string[]).includes(String(bd.kind)), 'brick.kind');
    intIn(bd.hp, 1, 5, 'brick.hp');
  }
  for (const s of d.statics as unknown[]) {
    const sd = dict(s) as Partial<StaticDef>;
    intIn(sd.col, 0, WORLD.gridCols - 1, 'static.col');
    intIn(sd.row, 0, WORLD.gridMaxRows - 1, 'static.row');
    req((STATIC_KINDS as readonly string[]).includes(String(sd.kind)), 'static.kind');
  }
  for (const o of d.obstacles as unknown[]) {
    const od = dict(o) as Partial<ObstacleDef> & Dict;
    if (od.kind === 'gate') {
      for (const k of ['col', 'row', 'w', 'h', 'openTime', 'closedTime', 'offset']) finite(od[k], `gate.${k}`);
    } else if (od.kind === 'slider') {
      for (const k of ['row', 'widthCells', 'minX', 'maxX', 'speed', 'phase']) finite(od[k], `slider.${k}`);
    } else {
      throw new Invalid('obstacle.kind');
    }
  }
  return v as LevelDefinition;
}

function checkSim(v: unknown): SimState {
  const d = dict(v);
  req(d.version === 1, 'sim.version');
  req(d.mode === 'progression' || d.mode === 'highscore', 'sim.mode');
  checkLevel(d.level);
  req(['serving', 'playing', 'complete', 'failed', 'gameOver'].includes(String(d.phase)), 'sim.phase');
  for (const k of ['time', 'serveTimer', 'serveOffset', 'levelSpeed', 'score', 'rngState', 'nextId', 'extraLifeDrops']) finite(d[k], `sim.${k}`);
  req(Array.isArray(d.balls) && (d.balls as unknown[]).length <= 32, 'sim.balls');
  for (const b of d.balls as unknown[]) {
    const bd = dict(b) as Partial<BallState> & Dict;
    for (const k of ['id', 'x', 'y', 'vx', 'vy', 'px', 'py', 'idle', 'stuck']) finite(bd[k], `ball.${k}`);
    req(Array.isArray(bd.pierced), 'ball.pierced');
  }
  const paddle = dict(d.paddle);
  for (const k of ['x', 'px', 'targetX', 'response']) finite(paddle[k], `paddle.${k}`);
  req(Array.isArray(d.bricks), 'sim.bricks');
  for (const b of d.bricks as unknown[]) {
    const bd = dict(b) as Partial<BrickState> & Dict;
    for (const k of ['id', 'col', 'row', 'hp', 'maxHp']) finite(bd[k], `brickState.${k}`);
    req(typeof bd.alive === 'boolean', 'brickState.alive');
    req((BRICK_KINDS as readonly string[]).includes(String(bd.kind)), 'brickState.kind');
  }
  req(Array.isArray(d.statics) && Array.isArray(d.gates) && Array.isArray(d.collectibles), 'sim arrays');
  for (const c of d.collectibles as unknown[]) {
    const cd = dict(c);
    for (const k of ['id', 'x', 'y', 'py']) finite(cd[k], `collectible.${k}`);
    req((COLLECTIBLE_KINDS as readonly string[]).includes(String(cd.kind)), 'collectible.kind');
  }
  const effects = dict(d.effects);
  for (const k of ['piercingTime', 'explosiveCharges', 'piercingKills']) finite(effects[k], `effects.${k}`);
  const combo = dict(d.combo);
  for (const k of ['chain', 'timer', 'best']) finite(combo[k], `combo.${k}`);
  const speed = dict(d.speed);
  for (const k of ['inactivity', 'boost']) finite(speed[k], `speed.${k}`);
  req(Array.isArray(d.recentDestroys), 'sim.recentDestroys');
  if (d.mode === 'highscore') intIn(d.lives, 0, LIVES.highScoreMax, 'sim.lives');
  const counters = { ...emptyCounters(), ...dict(d.counters) };
  for (const [k, val] of Object.entries(counters)) finite(val, `counters.${k}`);
  const sim = v as SimState;
  sim.counters = counters as SimState['counters'];
  sim.inventory = sanitizeInventory(d.inventory);
  return sim;
}

function checkRun(v: unknown): RunState {
  const d = dict(v);
  req(d.version === 1, 'run.version');
  req(isGameMode(d.mode), 'run.mode');
  req(isGameStyle(d.style), 'run.style');
  finite(d.seed, 'run.seed');
  intIn(d.level, 1, 1_000_000, 'run.level');
  finite(d.score, 'run.score');
  if (d.mode === 'highscore') intIn(d.lives, 1, LIVES.highScoreMax, 'run.lives');
  const cp = dict(d.checkpoint);
  const cpLevel = intIn(cp.level, 0, 1_000_000, 'checkpoint.level');
  req(cpLevel % 5 === 0, 'checkpoint.level multiple of 5');
  finite(cp.score, 'checkpoint.score');
  for (const k of ['attempt', 'levelsCompleted', 'specialLevelsCompleted', 'checkpointsReached', 'bricksDestroyed', 'bestCombo', 'ballsLost', 'powersUsed', 'playTime', 'startedAt']) {
    finite(d[k], `run.${k}`);
  }
  const run = v as RunState;
  run.inventory = sanitizeInventory(d.inventory);
  run.checkpoint = { level: cpLevel, inventory: sanitizeInventory(cp.inventory), score: cp.score as number };
  return run;
}

/** Returns a valid session or null (an invalid session is dropped, never partially resumed). */
export function sanitizeSession(v: unknown): SessionSnapshot | null {
  if (v === null || v === undefined) return null;
  try {
    const d = dict(v);
    req(d.version === 1, 'session.version');
    const run = checkRun(d.run);
    const sim = d.sim === null || d.sim === undefined ? null : checkSim(d.sim);
    if (sim) {
      req(sim.mode === run.mode, 'session mode mismatch');
      req(sim.level.number === run.level && sim.level.style === run.style, 'session level mismatch');
      req(sim.phase === 'serving' || sim.phase === 'playing', 'session phase must be resumable');
    }
    return { version: 1, run, sim, savedAt: int(d.savedAt, 0) };
  } catch (err) {
    if (err instanceof Invalid) return null;
    throw err;
  }
}

export interface SanitizeReport {
  data: SaveData;
  sessionDropped: boolean;
}

export function sanitizeSaveData(v: unknown, fallbackLanguage: LanguageCode, now: number): SanitizeReport {
  const d = dict(v);
  const session = sanitizeSession(d.session);
  const sessionDropped = d.session !== null && d.session !== undefined && session === null;
  return {
    data: {
      version: SAVE_VERSION,
      savedAt: int(d.savedAt, now),
      settings: sanitizeSettings(d.settings, fallbackLanguage),
      profile: sanitizeProfile(d.profile, now),
      session,
    },
    sessionDropped,
  };
}
