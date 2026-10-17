import { tutorialLevel } from '../core/level/levelProvider';
import type { SimEvent } from '../core/sim/events';
import { GameSimulation } from '../core/sim/simulation';
import { t } from '../i18n/i18n';

export type TutorialStage = 'move' | 'launch' | 'catch' | 'activate' | 'clear' | 'cards';

export interface TutorialHooks {
  tip(text: string): void;
  highlightSlot(index: number): void;
  showCards(): void;
}

/**
 * Interactive tutorial: a tiny level where each step waits for the player to actually do the
 * thing being taught (move, let the ball launch, catch a power, activate it, clear the level),
 * followed by three short cards about styles, modes/checkpoints and powers. Skippable any time.
 */
export class TutorialDirector {
  readonly sim: GameSimulation;
  stage: TutorialStage = 'move';
  private moved = 0;
  private lastPaddleX: number;
  private clearTimer = 0;

  constructor(
    private readonly hooks: TutorialHooks,
    paddleResponse?: number,
  ) {
    this.sim = GameSimulation.create({
      level: tutorialLevel(),
      mode: 'tutorial',
      seed: 99,
      paddleResponse,
      forcedDrops: ['multiball', 'multiball', 'piercing'],
    });
    this.lastPaddleX = this.sim.state.paddle.x;
    hooks.tip(t('tut.move'));
  }

  /** The instruction for the current step, in the current language. */
  currentTip(): string | null {
    switch (this.stage) {
      case 'move':
        return t('tut.move');
      case 'launch':
        return t('tut.launch');
      case 'catch':
        return t('tut.catch');
      case 'activate':
        return t('tut.activate');
      case 'clear':
        return t('tut.clear');
      default:
        return null;
    }
  }

  /** Called before each fixed simulation step. */
  beforeStep(dt: number): void {
    const s = this.sim.state;
    if (this.stage === 'move') {
      this.sim.holdServe();
      this.moved += Math.abs(s.paddle.x - this.lastPaddleX);
      this.lastPaddleX = s.paddle.x;
      if (this.moved > 140) {
        this.stage = 'launch';
        this.hooks.tip(t('tut.launch'));
      }
    }
    if (this.stage === 'clear' && this.clearTimer > 0) {
      this.clearTimer -= dt;
    }
  }

  onEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'collectibleSpawned':
          if (this.stage === 'launch' || this.stage === 'catch') {
            this.stage = 'catch';
            this.hooks.tip(t('tut.catch'));
          }
          break;
        case 'collectibleMissed':
          if (this.stage === 'catch') {
            this.hooks.tip(t('tut.missed'));
            const x = Math.max(40, Math.min(320, this.sim.state.paddle.x + 60));
            this.sim.spawnCollectible('multiball', x, 260);
          }
          break;
        case 'powerCaught':
          if (this.stage === 'catch' || this.stage === 'launch') {
            this.stage = 'activate';
            this.hooks.tip(t('tut.activate'));
            this.hooks.highlightSlot(ev.slot);
          }
          break;
        case 'powerActivated':
          if (this.stage === 'activate') {
            this.stage = 'clear';
            this.clearTimer = 2.5;
            this.hooks.highlightSlot(-1);
            this.hooks.tip(t('tut.clear'));
          }
          break;
        case 'levelComplete':
          this.stage = 'cards';
          this.hooks.highlightSlot(-1);
          this.hooks.showCards();
          break;
        default:
          break;
      }
    }
  }
}
