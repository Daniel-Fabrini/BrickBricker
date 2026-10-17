import type { AppApi } from '../app/api';
import { POWERS } from '../config/tuning';
import type { SimEvent } from '../core/sim/events';
import type { GameSimulation } from '../core/sim/simulation';
import { comboMultiplier } from '../core/sim/scoring';
import type { GameMode, PowerType } from '../core/types';
import { formatNumber, t, type TranslationKey } from '../i18n/i18n';
import { h, icon, setText } from './dom';

export interface HudContext {
  mode: GameMode | 'tutorial';
  level: number;
  special: string | null;
  checkpointLevel: number;
}

/**
 * In-game HUD (DOM): score, level, lives, level progress, combo, active effects, pause button and
 * the two inventory slots. Updated every frame with cheap diffing; touches outside its buttons
 * pass straight through to the playfield.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly score: HTMLElement;
  private readonly level: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly effects: HTMLElement;
  private readonly piercingBar: HTMLElement;
  private readonly armed: HTMLElement;
  private readonly slots: HTMLButtonElement[] = [];
  private readonly message: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private last = { score: -1, lives: -2, progress: -1, slots: '', combo: -1, playing: false, piercing: -1, armed: -1, iconsKey: '' };
  private messageTimer: number | null = null;
  private highlightSlot = -1;

  constructor(
    private readonly app: AppApi,
    private readonly popupLayer: HTMLElement,
  ) {
    this.score = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-score' } });
    this.level = h('span', { class: 'hud-value', attrs: { 'data-testid': 'hud-level' } });
    this.lives = h('span', { class: 'hud-lives', attrs: { 'data-testid': 'hud-lives' } });
    this.progress = h('span', { class: 'hud-progress-bar' });
    this.combo = h('div', { class: 'hud-combo', attrs: { 'data-testid': 'hud-combo' } });
    this.piercingBar = h('span', { class: 'effect-bar-fill' });
    this.armed = h('span', { class: 'effect-armed' }, icon('bomb'));
    this.effects = h('div', { class: 'hud-effects' }, h('span', { class: 'effect-bar' }, this.piercingBar), this.armed);
    this.message = h('div', { class: 'hud-message', attrs: { 'data-testid': 'hud-message' } });
    this.pauseBtn = h(
      'button',
      {
        class: 'icon-btn hud-pause',
        attrs: { type: 'button', 'aria-label': t('hud.pause'), 'data-testid': 'pause' },
        on: {
          pointerdown: (e) => e.stopPropagation(),
          click: () => {
            this.app.sound('uiTap');
            this.app.pauseGame();
          },
        },
      },
      icon('pause'),
    );
    for (let i = 0; i < POWERS.inventorySlots; i++) {
      const slot = h('button', {
        class: 'slot',
        attrs: { type: 'button', 'data-testid': `slot-${i}`, 'aria-label': t('hud.slotEmpty') },
        on: {
          pointerdown: (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.app.activatePower(i);
          },
        },
      });
      this.slots.push(slot);
    }
    this.el = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'hud-block' }, h('span', { class: 'hud-label', text: t('hud.score') }), this.score),
        h('div', { class: 'hud-block center' }, h('span', { class: 'hud-label', text: t('hud.level') }), this.level),
        h('div', { class: 'hud-block right' }, this.lives, this.pauseBtn),
        h('div', { class: 'hud-progress' }, this.progress),
      ),
      this.combo,
      this.message,
      h('div', { class: 'hud-bottom' }, this.slots[0] ?? null, this.effects, this.slots[1] ?? null),
    );
  }

  /** Static labels for a level: number, special badge, checkpoint info. */
  setContext(ctx: HudContext): void {
    const special = ctx.special && ctx.special !== 'tutorial' ? t(`special.${ctx.special}` as TranslationKey) : null;
    setText(this.level, special ? `${ctx.level} · ${special}` : String(ctx.level));
    this.level.classList.toggle('special', Boolean(special));
    this.lives.dataset.mode = ctx.mode;
    if (ctx.mode === 'progression') {
      this.lives.replaceChildren(icon('flag', 'icon small'), h('span', { text: ctx.checkpointLevel > 0 ? String(ctx.checkpointLevel) : '–' }));
      this.lives.setAttribute('aria-label', t('menu.checkpoint', { level: ctx.checkpointLevel }));
    }
    this.last.lives = -2;
    this.last.iconsKey = '';
  }

  update(sim: GameSimulation, paused: boolean): void {
    const s = sim.state;
    if (s.score !== this.last.score) {
      this.last.score = s.score;
      setText(this.score, formatNumber(s.score));
    }
    if (s.lives !== null && s.lives !== this.last.lives) {
      this.last.lives = s.lives;
      const hearts = [];
      for (let i = 0; i < s.lives; i++) hearts.push(icon('heart', 'icon heart'));
      this.lives.replaceChildren(...hearts);
      this.lives.setAttribute('aria-label', `${t('hud.lives')}: ${s.lives}`);
      this.lives.dataset.count = String(s.lives);
    }
    const total = s.bricks.length;
    const progress = total > 0 ? (total - s.destructibleRemaining) / total : 0;
    if (Math.abs(progress - this.last.progress) > 0.001) {
      this.last.progress = progress;
      this.progress.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    const mult = comboMultiplier(s.combo.chain);
    const comboKey = s.combo.chain >= 3 ? s.combo.chain * 10 + mult : 0;
    if (comboKey !== this.last.combo) {
      this.last.combo = comboKey;
      if (comboKey === 0) this.combo.classList.remove('show');
      else {
        const parts: HTMLElement[] = [h('span', { class: 'combo-chain', text: t('hud.chain', { chain: s.combo.chain }) })];
        if (mult > 1) parts.push(h('span', { class: 'combo-mult', text: t('hud.combo', { mult }) }));
        this.combo.replaceChildren(...parts);
        this.combo.classList.add('show');
        this.combo.classList.toggle('hot', mult >= 2);
      }
    }
    const playing = s.phase === 'playing' && !paused;
    const slotKey = s.inventory.map((p) => p ?? '-').join(',');
    const iconsKey = `${this.app.data.settings.theme}:${slotKey}`;
    if (slotKey !== this.last.slots || playing !== this.last.playing || iconsKey !== this.last.iconsKey) {
      this.last.slots = slotKey;
      this.last.playing = playing;
      this.last.iconsKey = iconsKey;
      s.inventory.forEach((p, i) => this.renderSlot(i, p, playing));
    }
    const piercing = Math.round((s.effects.piercingTime / POWERS.piercing.duration) * 100);
    if (piercing !== this.last.piercing) {
      this.last.piercing = piercing;
      this.piercingBar.style.width = `${Math.min(100, piercing)}%`;
      this.effects.classList.toggle('piercing', piercing > 0);
    }
    if (s.effects.explosiveCharges !== this.last.armed) {
      this.last.armed = s.effects.explosiveCharges;
      this.armed.classList.toggle('show', s.effects.explosiveCharges > 0);
      this.armed.dataset.charges = String(s.effects.explosiveCharges);
    }
  }

  private renderSlot(i: number, power: PowerType | null, playing: boolean): void {
    const slot = this.slots[i];
    if (!slot) return;
    slot.classList.toggle('filled', power !== null);
    slot.classList.toggle('ready', power !== null && playing);
    slot.classList.toggle('highlight', this.highlightSlot === i && power !== null);
    slot.dataset.power = power ?? '';
    slot.style.backgroundImage = power ? `url(${this.app.powerIcon(power)})` : '';
    slot.setAttribute('aria-label', power ? t('hud.slotLabel', { power: t(`power.${power}` as TranslationKey) }) : t('hud.slotEmpty'));
  }

  setSlotHighlight(index: number): void {
    this.highlightSlot = index;
    this.last.slots = '';
  }

  showMessage(text: string, duration = 1400, kind: 'info' | 'good' | 'bad' = 'info'): void {
    this.message.textContent = text;
    this.message.className = `hud-message show ${kind}`;
    if (this.messageTimer !== null) window.clearTimeout(this.messageTimer);
    if (duration > 0) this.messageTimer = window.setTimeout(() => this.message.classList.remove('show'), duration);
  }

  hideMessage(): void {
    this.message.classList.remove('show');
  }

  /** Floating text at a world position (restrained: only for notable events). */
  popup(text: string, worldX: number, worldY: number, kind: 'points' | 'good' | 'bad' = 'points'): void {
    const el = h('div', {
      class: `popup popup-${kind}`,
      text,
      style: {
        left: `calc(var(--field-x) + ${worldX} * var(--world-scale) * 1px)`,
        top: `calc(var(--field-y) + ${worldY} * var(--world-scale) * 1px)`,
      },
    });
    this.popupLayer.append(el);
    while (this.popupLayer.children.length > 6) this.popupLayer.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), 900);
  }

  onEvents(events: SimEvent[], sim: GameSimulation): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'explosion':
          if (ev.destroyed > 0) this.popup(`×${ev.destroyed}`, ev.x, ev.y, 'good');
          break;
        case 'burst':
          if (ev.count === 3 || ev.count % 5 === 0) this.popup(t('hud.burst', { points: ev.bonus * (ev.count - 2) }), 180, 330, 'good');
          break;
        case 'inventoryFull':
          this.popup(t('hud.inventoryFull'), sim.state.paddle.x, 520, 'bad');
          break;
        case 'extraLifeCaught':
          this.popup(ev.capped ? t('life.capped', { points: ev.points }) : t('life.extra'), sim.state.paddle.x, 515, 'good');
          break;
        case 'lifeLost':
          this.showMessage(t('life.lost'), 1100, 'bad');
          break;
        case 'powerRejected':
          if (ev.reason === 'maxBalls') this.showMessage(t('power.rejected.maxBalls'), 1100, 'bad');
          else if (ev.reason === 'maxCharges') this.showMessage(t('power.rejected.maxCharges'), 1100, 'bad');
          else if (ev.reason === 'notPlaying') this.showMessage(t('power.rejected.notPlaying'), 900, 'bad');
          break;
        case 'speedBoost':
          if (Math.abs(ev.boost - 1.05) < 0.03) this.showMessage(t('hud.speedUp'), 900, 'info');
          break;
        default:
          break;
      }
    }
  }

  destroy(): void {
    this.el.remove();
    this.popupLayer.replaceChildren();
  }
}
