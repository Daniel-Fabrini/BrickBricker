import { PADDLE, SAVE, SIM, WORLD } from '../config/tuning';
import { PaddleInputMapper, type ControlOptions } from '../core/input';
import { getLevel, PROGRESSION_SEED } from '../core/level/levelProvider';
import { cosmeticById, cosmeticsUnlockedBy, type BallSkin, type BurstStyle, type PaddleSkin, type TrailStyle } from '../core/meta/cosmetics';
import type { SimEvent } from '../core/sim/events';
import { FixedStepLoop } from '../core/sim/loop';
import { GameSimulation } from '../core/sim/simulation';
import type { GameStyle } from '../core/types';
import type { GameSession, SessionNotice } from '../game/session';
import { t, type TranslationKey } from '../i18n/i18n';
import { haptic } from '../platform/haptics';
import type { GameScene, SceneHost, VisualOptions } from '../render/GameScene';
import { Hud } from '../ui/Hud';
import { renderDpr, type Layout } from '../ui/layout';
import { FailedOverlay, GameOverOverlay, LevelCompleteOverlay, PauseOverlay } from '../ui/screens/overlays';
import { InfoCard } from '../ui/screens/dialogs';
import { achievementName } from '../ui/screens/AchievementsScreen';
import { cosmeticName } from '../ui/screens/CollectionScreen';
import { h } from '../ui/dom';
import type { View } from '../ui/UIManager';
import type { AppApi } from './api';
import { TutorialDirector } from './Tutorial';

export type PlayMode = 'demo' | 'game' | 'tutorial';

export interface ControllerHost extends AppApi {
  persist(): void;
  layout(): Layout;
}

const DEMO_LEVELS = [7, 12, 16, 23, 28, 33];

/**
 * Drives whatever is on the playfield: the attract-mode demo behind the menu, a real game session,
 * or the tutorial. Owns the fixed-step loop, pause state, touch input, HUD updates, audio/haptic
 * feedback and in-game overlays.
 */
export class GameController implements SceneHost {
  mode: PlayMode = 'demo';
  session: GameSession | null = null;
  private tutorial: TutorialDirector | null = null;
  private demo: GameSimulation | null = null;
  private demoIndex = 0;
  private demoTime = 0;
  private readonly loop: FixedStepLoop;
  private paused = false;
  private overlay: View | null = null;
  private hud: Hud | null = null;
  private skipButton: HTMLButtonElement | null = null;
  private readonly input: PaddleInputMapper;
  private autosave = 0;
  private frameEvents: SimEvent[] = [];
  private attachedSim: GameSimulation | null = null;
  private activePointer: number | null = null;
  /** End-to-end tests only: lets the paddle track the ball automatically. */
  testAutopilot = false;

  constructor(
    private readonly app: ControllerHost,
    private readonly scene: GameScene,
    private readonly surface: HTMLElement,
  ) {
    this.loop = new FixedStepLoop((dt) => this.fixedStep(dt), SIM.fixedStep, SIM.maxFrameDelta);
    this.input = new PaddleInputMapper(this.controlOptions());
    this.bindInput();
    scene.setHost(this);
  }

  // ------------------------------------------------------------------ public API

  get isPaused(): boolean {
    return this.paused;
  }

  get activeSim(): GameSimulation | null {
    if (this.mode === 'game') return this.session?.sim ?? null;
    if (this.mode === 'tutorial') return this.tutorial?.sim ?? null;
    return this.demo;
  }

  startDemo(style: GameStyle): void {
    this.teardownPlay();
    this.mode = 'demo';
    this.demoIndex = (this.demoIndex + 1) % DEMO_LEVELS.length;
    const level = getLevel(style, DEMO_LEVELS[this.demoIndex] ?? 7, PROGRESSION_SEED);
    this.demo = GameSimulation.create({ level, mode: 'tutorial', seed: 1234 + this.demoIndex });
    this.demoTime = 0;
    this.paused = false;
    this.loop.resume();
    this.scene.attach(this.demo);
    this.app.audio.setMusicIntensity('menu');
  }

  startSession(session: GameSession, startPaused: boolean): void {
    this.teardownPlay();
    this.mode = 'game';
    this.session = session;
    session.setPaddleResponse(this.paddleResponse());
    this.createHud();
    this.attachCurrentLevel();
    this.app.audio.setMusicIntensity('game');
    this.paused = false;
    this.loop.resume();
    if (session.phase === 'levelComplete' && session.lastLevelSummary) this.showOverlay(new LevelCompleteOverlay(this.app, session.lastLevelSummary));
    else if (startPaused) this.pause(false);
  }

  startTutorial(): void {
    this.teardownPlay();
    this.mode = 'tutorial';
    this.createHud();
    this.tutorial = new TutorialDirector(
      {
        tip: (text) => this.hud?.showMessage(text, 0, 'info'),
        highlightSlot: (i) => this.hud?.setSlotHighlight(i),
        showCards: () => this.showTutorialCards(),
      },
      this.paddleResponse(),
    );
    this.skipButton = h('button', {
      class: 'btn btn-ghost tutorial-skip',
      text: t('common.skip'),
      attrs: { type: 'button', 'data-testid': 'tutorial-skip-ingame' },
      on: { click: () => this.app.finishTutorial(true) },
    });
    this.app.ui.hudLayer.append(this.skipButton);
    this.hud?.setContext({ mode: 'tutorial', level: 1, special: null, checkpointLevel: 0 });
    this.scene.attach(this.tutorial.sim);
    this.attachedSim = this.tutorial.sim;
    this.paused = false;
    this.loop.resume();
    this.app.audio.setMusicIntensity('game');
  }

  /** Stops the current game/tutorial (after saving) and returns to the demo backdrop. */
  stopToDemo(style: GameStyle): void {
    this.startDemo(style);
  }

  pause(manual = true): void {
    if (this.mode === 'demo' || this.paused) return;
    if (this.mode === 'game' && this.session && this.session.phase !== 'playing') return;
    this.paused = true;
    this.loop.pause();
    this.input.up();
    this.app.audio.setDucked(true);
    this.saveNow();
    this.showOverlay(new PauseOverlay(this.app, !manual));
  }

  /** Resumes only on an explicit player action. */
  resume(): void {
    if (!this.paused) return;
    this.closeOverlay();
    this.paused = false;
    this.loop.resume();
    this.app.audio.setDucked(false);
  }

  /** App went to the background: pause (never charges a life) and save immediately. */
  onBackground(): void {
    if (this.mode !== 'demo' && !this.paused) this.pause(false);
    this.saveNow();
  }

  activatePower(slot: number): void {
    if (this.paused) return;
    if (this.mode === 'game' && this.session) {
      this.session.activatePower(slot);
      this.flushRenderEvents();
    } else if (this.mode === 'tutorial' && this.tutorial) {
      this.tutorial.sim.activatePower(slot);
      const events = this.tutorial.sim.drainEvents();
      this.tutorial.onEvents(events);
      this.dispatch(events);
    }
  }

  nextLevel(): void {
    if (!this.session) return;
    this.closeOverlay();
    this.session.continueToNextLevel();
    this.attachCurrentLevel();
    this.paused = false;
    this.loop.resume();
    this.app.audio.setDucked(false);
    this.saveNow();
  }

  /** Re-applies settings that affect controls or visuals (never gameplay rules). */
  refreshSettings(): void {
    this.input.setOptions(this.controlOptions());
    this.session?.setPaddleResponse(this.paddleResponse());
    this.tutorial?.sim.setPaddleResponse(this.paddleResponse());
    this.scene.setVisuals(this.visualOptions());
    const sim = this.activeSim;
    if (sim && this.mode !== 'demo') this.hud?.update(sim, this.paused);
  }

  /** Rebuilds language-dependent in-game UI (HUD labels, tutorial tip) after a language change. */
  refreshLanguage(): void {
    if (this.mode === 'demo' || !this.hud) return;
    this.createHud();
    if (this.mode === 'game' && this.session) {
      const s = this.session.sim.state;
      this.hud?.setContext({ mode: this.session.mode, level: s.level.number, special: s.level.special, checkpointLevel: this.session.run.checkpoint.level });
    } else if (this.mode === 'tutorial' && this.tutorial) {
      this.hud?.setContext({ mode: 'tutorial', level: 1, special: null, checkpointLevel: 0 });
      const tip = this.tutorial.currentTip();
      if (tip) this.hud?.showMessage(tip, 0, 'info');
      if (this.skipButton) {
        this.skipButton.textContent = t('common.skip');
        this.app.ui.hudLayer.append(this.skipButton);
      }
    }
    const sim = this.activeSim;
    if (sim) this.hud?.update(sim, this.paused);
  }

  visualOptions(): VisualOptions {
    const s = this.app.data.settings;
    const sel = this.app.data.profile.cosmetics.selected;
    const variant = <T>(id: string, fallback: T): T => (cosmeticById(id)?.variant as T | undefined) ?? fallback;
    return {
      ball: variant<BallSkin>(sel.ball, 'classic'),
      paddle: variant<PaddleSkin>(sel.paddle, 'classic'),
      trail: variant<TrailStyle>(sel.trail, 'none'),
      burst: variant<BurstStyle>(sel.burst, 'shards'),
      ballVisibility: s.ballVisibility,
      reducedEffects: s.reducedEffects,
    };
  }

  onLayout(layout: Layout): void {
    this.scene.setField({ ...layout.field, dpr: renderDpr() });
  }

  /** Writes the current session to the save document and persists it. */
  saveNow(): void {
    if (this.mode === 'game' && this.session) this.session.syncToSave();
    this.app.persist();
    this.autosave = 0;
  }

  // ------------------------------------------------------------------ frame loop

  frame(dt: number): void {
    const sim = this.activeSim;
    if (!sim) return;
    if (this.mode === 'demo' || (this.testAutopilot && !this.paused)) this.autopilot(sim);
    this.loop.advance(dt);
    this.flushRenderEvents();
    if (this.mode === 'game' && this.session) {
      const notices = this.session.drainNotices();
      const announced = new Set(notices.filter((n) => n.type === 'achievement').map((n) => (n.type === 'achievement' ? n.id : '')));
      for (const n of notices) {
        // Cosmetics unlocked by an achievement shown in this batch are listed in that toast instead.
        if (n.type === 'cosmetic' && announced.has(cosmeticById(n.id)?.unlockedBy ?? '')) continue;
        this.handleNotice(n);
      }
      if (!this.paused && this.session.phase === 'playing') {
        this.autosave += dt;
        if (this.autosave >= SAVE.autosaveInterval) this.saveNow();
      }
    }
    if (this.mode === 'demo' && this.demo) {
      this.demoTime += dt;
      if (this.demo.isFinished() || this.demoTime > 75) this.startDemo(this.demo.state.level.style);
    }
    const current = this.activeSim;
    if (!current) return;
    this.scene.render(this.loop.alpha());
    if (this.mode !== 'demo' && this.hud) this.hud.update(current, this.paused);
  }

  private fixedStep(dt: number): void {
    if (this.mode === 'game' && this.session) {
      this.session.step(dt);
      if (this.session.phase !== 'playing') this.loop.pause();
    } else if (this.mode === 'tutorial' && this.tutorial) {
      this.tutorial.beforeStep(dt);
      this.tutorial.sim.step(dt);
      const events = this.tutorial.sim.drainEvents();
      this.tutorial.onEvents(events);
      this.frameEvents.push(...events);
      if (this.tutorial.sim.isFinished()) this.loop.pause();
    } else if (this.demo) {
      this.demo.step(dt);
      this.demo.drainEvents();
    }
  }

  private flushRenderEvents(): void {
    if (this.mode === 'game' && this.session) this.frameEvents.push(...this.session.drainRenderEvents());
    if (this.frameEvents.length === 0) return;
    const events = this.frameEvents;
    this.frameEvents = [];
    this.dispatch(events);
  }

  private dispatch(events: SimEvent[]): void {
    const sim = this.activeSim;
    if (!sim) return;
    this.scene.applyEvents(events);
    this.hud?.onEvents(events, sim);
    if (this.mode !== 'demo') this.playFeedback(events);
  }

  private playFeedback(events: SimEvent[]): void {
    const audio = this.app.audio;
    for (const ev of events) {
      switch (ev.type) {
        case 'paddleHit':
          audio.play('paddle');
          break;
        case 'wallHit':
          audio.play('wall');
          break;
        case 'brickDamaged':
          audio.play('brickHit', ev.maxHp - ev.hp);
          break;
        case 'brickDestroyed':
          audio.play(ev.kind === 'special' ? 'specialBreak' : 'brickBreak', ev.chain);
          break;
        case 'comboUp':
          audio.play('combo', Math.round((ev.multiplier - 1) * 4));
          break;
        case 'collectibleSpawned':
          audio.play('powerDrop');
          break;
        case 'powerCaught':
          audio.play('powerCatch');
          haptic('light');
          break;
        case 'inventoryFull':
          audio.play('inventoryFull');
          break;
        case 'extraLifeCaught':
          audio.play('extraLife');
          haptic('medium');
          break;
        case 'powerActivated':
          audio.play(ev.power === 'multiball' ? 'multiball' : ev.power === 'piercing' ? 'piercing' : 'powerActivate');
          haptic('light');
          break;
        case 'explosion':
          audio.play('explosion');
          haptic('medium');
          break;
        case 'serve':
          audio.play('serve');
          break;
        case 'lifeLost':
          audio.play('lifeLost');
          haptic('heavy');
          break;
        case 'attemptFailed':
          audio.play('attemptFailed');
          haptic('heavy');
          break;
        case 'levelComplete':
          audio.play('levelComplete');
          break;
        case 'runOver':
          audio.play('gameOver');
          break;
        default:
          break;
      }
    }
  }

  private handleNotice(n: SessionNotice): void {
    const ui = this.app.ui;
    switch (n.type) {
      case 'achievement': {
        const rewards = cosmeticsUnlockedBy(n.id).map((c) => cosmeticName(c.id));
        ui.toast(t('toast.achievement'), rewards.length > 0 ? `${achievementName(n.id)} · ${t('ach.reward', { name: rewards.join(', ') })}` : achievementName(n.id), 'reward');
        this.app.audio.play('achievement');
        break;
      }
      case 'cosmetic':
        ui.toast(t('toast.cosmetic'), cosmeticName(n.id), 'reward');
        break;
      case 'checkpoint':
        this.app.audio.play('checkpoint');
        break;
      case 'levelComplete':
        this.app.audio.setDucked(false);
        this.saveNow();
        this.showOverlay(new LevelCompleteOverlay(this.app, n.summary));
        break;
      case 'attemptFailed':
        this.saveNow();
        this.showOverlay(new FailedOverlay(this.app, n.checkpointLevel));
        break;
      case 'runOver':
        if (n.summary.isNewRecord) {
          this.app.audio.play('newRecord');
          ui.toast(t('toast.newRecord'), undefined, 'reward');
        }
        this.saveNow();
        this.showOverlay(new GameOverOverlay(this.app, n.summary));
        break;
    }
  }

  // ------------------------------------------------------------------ helpers

  private attachCurrentLevel(): void {
    const session = this.session;
    if (!session) return;
    if (this.attachedSim !== session.sim) {
      this.scene.attach(session.sim);
      this.attachedSim = session.sim;
      const s = session.sim.state;
      this.hud?.setContext({ mode: session.mode, level: s.level.number, special: s.level.special, checkpointLevel: session.run.checkpoint.level });
      if (s.phase === 'serving') {
        const special = s.level.special ? ` · ${t(`special.${s.level.special}` as TranslationKey)}` : '';
        this.hud?.showMessage(`${t('hud.level')} ${s.level.number}${special}`, 1300, 'info');
      }
    }
  }

  private createHud(): void {
    this.hud?.destroy();
    this.hud = new Hud(this.app, this.app.ui.popupLayer);
    this.app.ui.hudLayer.replaceChildren(this.hud.el);
  }

  private teardownPlay(): void {
    this.closeOverlay();
    this.hud?.destroy();
    this.hud = null;
    this.skipButton?.remove();
    this.skipButton = null;
    this.app.ui.hudLayer.replaceChildren();
    this.session = null;
    this.tutorial = null;
    this.demo = null;
    this.attachedSim = null;
    this.frameEvents = [];
    this.input.up();
    this.app.audio.setDucked(false);
  }

  private showOverlay(view: View): void {
    this.closeOverlay();
    this.overlay = view;
    this.app.ui.openModal(view);
  }

  private closeOverlay(): void {
    if (this.overlay) this.app.ui.closeModal(this.overlay);
    this.overlay = null;
  }

  private showTutorialCards(): void {
    const cards: [TranslationKey, TranslationKey][] = [
      ['tut.stylesTitle', 'tut.stylesBody'],
      ['tut.modesTitle', 'tut.modesBody'],
      ['tut.powersTitle', 'tut.powersBody'],
      ['tut.doneTitle', 'tut.doneBody'],
    ];
    const show = (i: number): void => {
      const card = cards[i];
      if (!card) {
        this.app.finishTutorial(false);
        return;
      }
      const last = i === cards.length - 1;
      this.app.ui.openModal(
        new InfoCard(this.app, t(card[0]), t(card[1]), last ? t('common.done') : t('common.next'), () => show(i + 1), last ? null : () => this.app.finishTutorial(false)),
      );
    };
    this.hud?.hideMessage();
    show(0);
  }

  private autopilot(sim: GameSimulation): void {
    const s = sim.state;
    let target = s.paddle.x;
    let lowest = -1;
    for (const b of s.balls) {
      if (b.vy > 0 && b.y > lowest) {
        lowest = b.y;
        target = b.x;
      }
    }
    if (lowest < 0 && s.balls[0]) target = s.balls[0].x;
    sim.setPaddleTarget(target + Math.sin(s.time * 1.3) * PADDLE.width * 0.32);
  }

  private controlOptions(): ControlOptions {
    const s = this.app.data.settings;
    return { mode: s.controlMode, assist: s.controlAssist, tolerant: s.tolerantControl };
  }

  private paddleResponse(): number {
    return this.app.data.settings.tolerantControl ? PADDLE.tolerantResponse : PADDLE.response;
  }

  private bindInput(): void {
    const el = this.surface;
    const toNx = (clientX: number): number => {
      const f = this.app.layout().field;
      return (clientX - f.x) / f.w;
    };
    const target = (x: number | null): void => {
      if (x === null) return;
      if (this.mode === 'game') this.session?.setPaddleTarget(x);
      else if (this.mode === 'tutorial') this.tutorial?.sim.setPaddleTarget(x);
    };
    el.addEventListener('pointerdown', (e) => {
      this.app.audio.unlock();
      if (this.mode === 'demo' || this.paused) return;
      this.activePointer = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is optional.
      }
      const paddleX = this.activeSim?.state.paddle.x ?? WORLD.width / 2;
      target(this.input.down(toNx(e.clientX), paddleX));
    });
    el.addEventListener('pointermove', (e) => {
      if (this.mode === 'demo' || this.paused) return;
      if (this.activePointer !== null && e.pointerId !== this.activePointer) return;
      if (!this.input.isActive) {
        // Mouse hover on desktop: follow without a press in direct mode.
        if (e.pointerType === 'mouse' && this.app.data.settings.controlMode === 'direct') target(this.input.directTarget(toNx(e.clientX)));
        return;
      }
      target(this.input.move(toNx(e.clientX)));
    });
    const end = (e: PointerEvent): void => {
      if (this.activePointer !== null && e.pointerId !== this.activePointer) return;
      this.activePointer = null;
      this.input.up();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
