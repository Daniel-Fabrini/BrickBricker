import { applyLevelCompleted, applySimEvent, noteThemePlayed } from '../core/meta/stats';
import {
  applyAttemptFailed,
  applyLevelComplete,
  applyRunOver,
  createLevelSimulation,
  newHighScoreRun,
  newProgressionRun,
  type CheckpointState,
  type RunState,
} from '../core/run/run';
import type { SimEvent } from '../core/sim/events';
import { GameSimulation } from '../core/sim/simulation';
import type { GameStyle, ThemeId } from '../core/types';
import type { SaveData, SessionSnapshot } from '../persistence/schema';
import { checkpointForMilestone, recordCheckpoint, recordHighScore, recordLevelReached, unlockAchievements } from './profile';

export type SessionPhase = 'playing' | 'levelComplete' | 'attemptFailed' | 'runOver';

export interface LevelSummary {
  level: number;
  special: string | null;
  score: number;
  levelPoints: number;
  bricks: number;
  bestCombo: number;
  ballsLost: number;
  time: number;
  checkpoint: CheckpointState | null;
  nextLevel: number;
}

export interface RunSummary {
  style: GameStyle;
  score: number;
  level: number;
  levelsCompleted: number;
  bricks: number;
  bestCombo: number;
  powersUsed: number;
  playTime: number;
  isNewRecord: boolean;
  previousBest: number;
}

export type SessionNotice =
  | { type: 'achievement'; id: string }
  | { type: 'cosmetic'; id: string }
  | { type: 'checkpoint'; level: number }
  | { type: 'levelComplete'; summary: LevelSummary }
  | { type: 'attemptFailed'; resumeLevel: number; checkpointLevel: number }
  | { type: 'runOver'; summary: RunSummary };

export interface SessionOptions {
  paddleResponse?: number;
  theme?: ThemeId;
  now?: () => number;
}

/**
 * One unfinished game (a Progression session or a High Score run). It drives the simulation for
 * the current level, applies cross-level rules, and keeps the profile (records, statistics,
 * checkpoints, achievements) and the save document in sync. It has no rendering or platform code.
 */
export class GameSession {
  phase: SessionPhase = 'playing';
  private notices: SessionNotice[] = [];
  private renderEvents: SimEvent[] = [];
  private levelStartScore: number;
  private achievementTimer = 0;
  private readonly now: () => number;
  private paddleResponse: number | undefined;
  lastLevelSummary: LevelSummary | null = null;
  lastRunSummary: RunSummary | null = null;

  private constructor(
    readonly data: SaveData,
    public run: RunState,
    public sim: GameSimulation,
    options: SessionOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.paddleResponse = options.paddleResponse;
    this.levelStartScore = sim.state.score;
    if (options.theme) noteThemePlayed(data.profile.stats, options.theme);
  }

  // ------------------------------------------------------------------ construction

  static newProgression(data: SaveData, style: GameStyle, milestone: number | null, options: SessionOptions = {}): GameSession {
    const record = data.profile.progression[style];
    const from = checkpointForMilestone(data.profile, style, milestone ?? record.highestCheckpoint);
    const run = newProgressionRun(style, from, (options.now ?? Date.now)());
    data.profile.stats.gamesPlayed += 1;
    data.profile.stats.progressionSessions += 1;
    const session = new GameSession(data, run, createLevelSimulation(run, options.paddleResponse), options);
    session.onLevelStarted();
    return session;
  }

  static newHighScore(data: SaveData, style: GameStyle, seed: number, options: SessionOptions = {}): GameSession {
    const run = newHighScoreRun(style, seed, (options.now ?? Date.now)());
    data.profile.stats.gamesPlayed += 1;
    data.profile.stats.highScoreRuns += 1;
    const session = new GameSession(data, run, createLevelSimulation(run, options.paddleResponse), options);
    session.onLevelStarted();
    return session;
  }

  /** Resumes an unfinished session exactly where it was saved. Statistics are not replayed. */
  static resume(data: SaveData, snapshot: SessionSnapshot, options: SessionOptions = {}): GameSession {
    const run = structuredClone(snapshot.run);
    let sim: GameSimulation;
    let fresh = false;
    if (snapshot.sim) {
      sim = GameSimulation.restore(snapshot.sim);
      if (options.paddleResponse) sim.setPaddleResponse(options.paddleResponse);
    } else {
      sim = createLevelSimulation(run, options.paddleResponse);
      fresh = true;
    }
    const session = new GameSession(data, run, sim, options);
    if (snapshot.sim) session.levelStartScore = run.score;
    if (fresh) session.onLevelStarted();
    else data.session = session.snapshot();
    return session;
  }

  // ------------------------------------------------------------------ per-frame API

  get mode(): RunState['mode'] {
    return this.run.mode;
  }

  setPaddleTarget(x: number): void {
    this.sim.setPaddleTarget(x);
  }

  setPaddleResponse(response: number): void {
    this.paddleResponse = response;
    this.sim.setPaddleResponse(response);
  }

  activatePower(slot: number): boolean {
    const ok = this.sim.activatePower(slot);
    this.processEvents();
    return ok;
  }

  /** Advances one fixed simulation step. */
  step(dt: number): void {
    if (this.phase !== 'playing') return;
    this.sim.step(dt);
    if (this.sim.state.phase === 'playing') {
      this.run.playTime += dt;
      this.data.profile.stats.playTimeSeconds += dt;
    }
    this.processEvents();
    this.achievementTimer += dt;
    if (this.achievementTimer >= 0.5) {
      this.achievementTimer = 0;
      this.checkAchievements();
    }
  }

  /** Events for the renderer/audio since the last call. */
  drainRenderEvents(): SimEvent[] {
    const out = this.renderEvents;
    this.renderEvents = [];
    return out;
  }

  drainNotices(): SessionNotice[] {
    const out = this.notices;
    this.notices = [];
    return out;
  }

  /** After a level summary or a failed attempt, starts the next/current level. */
  continueToNextLevel(): void {
    if (this.phase !== 'levelComplete' && this.phase !== 'attemptFailed') return;
    this.sim = createLevelSimulation(this.run, this.paddleResponse);
    this.levelStartScore = this.sim.state.score;
    this.phase = 'playing';
    this.onLevelStarted();
  }

  /** Snapshot of the unfinished session (null once a High Score run is over). */
  snapshot(): SessionSnapshot | null {
    if (this.phase === 'runOver') return null;
    const midLevel = this.phase === 'playing' && !this.sim.isFinished();
    return {
      version: 1,
      run: structuredClone(this.run),
      sim: midLevel ? this.sim.snapshot() : null,
      savedAt: this.now(),
    };
  }

  /** Writes the current session into the save document (call before persisting). */
  syncToSave(): void {
    this.data.session = this.snapshot();
  }

  // ------------------------------------------------------------------ internals

  private onLevelStarted(): void {
    if (this.run.mode === 'progression') recordLevelReached(this.data.profile, this.run.style, this.run.level);
    this.syncToSave();
  }

  private processEvents(): void {
    const events = this.sim.drainEvents();
    if (events.length === 0) return;
    const s = this.sim.state;
    const stats = this.data.profile.stats;
    for (const ev of events) {
      applySimEvent(stats, ev, { mode: this.run.mode, style: this.run.style, boost: s.speed.boost, rally: s.counters.rally, balls: s.balls.length });
      this.renderEvents.push(ev);
    }
    if (s.phase === 'complete') this.finishLevel();
    else if (s.phase === 'failed') this.failAttempt();
    else if (s.phase === 'gameOver') this.finishRun();
  }

  private finishLevel(): void {
    const s = this.sim.state;
    const stats = this.data.profile.stats;
    stats.totalScore += Math.max(0, s.score - this.levelStartScore);
    applyLevelCompleted(stats, {
      mode: this.run.mode,
      style: this.run.style,
      level: this.run.level,
      special: s.level.special !== null,
      dynamic: s.level.obstacles.length > 0,
      ballsLost: s.counters.ballsLost,
      lives: s.lives,
    });
    const result = applyLevelComplete(this.run, this.sim);
    if (result.checkpoint) {
      recordCheckpoint(this.data.profile, this.run.style, result.checkpoint);
      stats.checkpointsReached += 1;
      this.notices.push({ type: 'checkpoint', level: result.checkpoint.level });
    }
    if (this.run.mode === 'progression') recordLevelReached(this.data.profile, this.run.style, this.run.level);
    const summary: LevelSummary = {
      level: result.completedLevel,
      special: s.level.special,
      score: this.run.score,
      levelPoints: s.score - this.levelStartScore,
      bricks: s.counters.bricksDestroyed,
      bestCombo: s.combo.best,
      ballsLost: s.counters.ballsLost,
      time: s.time,
      checkpoint: result.checkpoint,
      nextLevel: this.run.level,
    };
    this.lastLevelSummary = summary;
    this.phase = 'levelComplete';
    this.notices.push({ type: 'levelComplete', summary });
    this.checkAchievements();
    this.syncToSave();
  }

  private failAttempt(): void {
    const s = this.sim.state;
    this.data.profile.stats.totalScore += Math.max(0, s.score - this.levelStartScore);
    applyAttemptFailed(this.run, this.sim);
    this.phase = 'attemptFailed';
    this.notices.push({ type: 'attemptFailed', resumeLevel: this.run.level, checkpointLevel: this.run.checkpoint.level });
    this.checkAchievements();
    this.syncToSave();
  }

  private finishRun(): void {
    const s = this.sim.state;
    const stats = this.data.profile.stats;
    stats.totalScore += Math.max(0, s.score - this.levelStartScore);
    applyRunOver(this.run, this.sim);
    const record = recordHighScore(this.data.profile, this.run.style, this.run.score, this.run.level, this.now());
    const summary: RunSummary = {
      style: this.run.style,
      score: this.run.score,
      level: this.run.level,
      levelsCompleted: this.run.levelsCompleted,
      bricks: this.run.bricksDestroyed,
      bestCombo: this.run.bestCombo,
      powersUsed: this.run.powersUsed,
      playTime: this.run.playTime,
      isNewRecord: record.isNewRecord,
      previousBest: record.previous,
    };
    this.lastRunSummary = summary;
    this.phase = 'runOver';
    this.notices.push({ type: 'runOver', summary });
    this.checkAchievements();
    this.data.session = null;
  }

  private checkAchievements(): void {
    const s = this.sim.state;
    const live = {
      style: this.run.style,
      highScore: this.run.mode === 'highscore' ? s.score : 0,
      level: this.run.mode === 'progression' ? this.run.level : 0,
    };
    const unlocked = unlockAchievements(this.data.profile, this.now(), live);
    for (const a of unlocked.achievements) this.notices.push({ type: 'achievement', id: a.id });
    for (const c of unlocked.cosmetics) this.notices.push({ type: 'cosmetic', id: c });
  }
}

/** Abandoning clears ONLY the unfinished session; records, stats, cosmetics and checkpoints stay. */
export function abandonSession(data: SaveData): void {
  data.session = null;
}

/** Level definition for a session snapshot (used by the menu to describe a saved game). */
export function describeSnapshot(snapshot: SessionSnapshot): { mode: RunState['mode']; style: GameStyle; level: number; score: number; lives: number | null } {
  const sim = snapshot.sim;
  return {
    mode: snapshot.run.mode,
    style: snapshot.run.style,
    level: snapshot.run.level,
    score: sim ? sim.score : snapshot.run.score,
    lives: sim ? sim.lives : snapshot.run.lives,
  };
}
