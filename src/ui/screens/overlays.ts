import type { AppApi } from '../../app/api';
import type { LevelSummary, RunSummary } from '../../game/session';
import { formatDuration, formatNumber, t, type TranslationKey } from '../../i18n/i18n';
import { POWER_TYPES } from '../../core/types';
import { button, statRow } from '../components';
import { h, icon } from '../dom';
import { View } from '../UIManager';

export class PauseOverlay extends View {
  constructor(
    private readonly app: AppApi,
    private readonly fromBackground: boolean,
  ) {
    super('dialog overlay pause-overlay');
  }

  render(): void {
    this.el.setAttribute('role', 'dialog');
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card', attrs: { 'data-testid': 'pause-overlay' } },
        h('h2', { class: 'dialog-title big', text: t('pause.title') }),
        this.fromBackground ? h('p', { class: 'dialog-body', text: t('pause.background') }) : null,
        h(
          'div',
          { class: 'power-help' },
          ...POWER_TYPES.map((p) =>
            h(
              'div',
              { class: 'power-help-row' },
              h('img', { class: 'power-help-icon', attrs: { src: this.app.powerIcon(p), alt: '' } }),
              h('span', { class: 'power-help-text' }, h('strong', { text: t(`power.${p}` as TranslationKey) }), ' ', t(`power.${p}.desc` as TranslationKey)),
            ),
          ),
        ),
        h(
          'div',
          { class: 'dialog-actions vertical' },
          button(this.app, t('pause.resume'), () => this.app.resumeGame(), { variant: 'primary', icon: 'play', testId: 'resume' }),
          button(this.app, t('pause.settings'), () => this.app.openSettings(), { variant: 'secondary', icon: 'gear', testId: 'pause-settings' }),
          button(this.app, t('pause.quit'), () => this.app.quitToMenu(), { variant: 'ghost', testId: 'quit' }),
        ),
      ),
    );
  }

  /** Back never resumes: the player must explicitly tap Resume. */
  override onBack(): boolean {
    return true;
  }
}

export class LevelCompleteOverlay extends View {
  constructor(
    private readonly app: AppApi,
    private readonly summary: LevelSummary,
  ) {
    super('dialog overlay result-overlay');
  }

  render(): void {
    const s = this.summary;
    const special = s.special ? t(`special.${s.special}` as TranslationKey) : null;
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card result-card', attrs: { 'data-testid': 'level-complete' } },
        h('h2', { class: 'dialog-title big', text: special ? t('level.specialComplete') : t('level.complete', { level: s.level }) }),
        special ? h('p', { class: 'dialog-sub', text: special }) : null,
        s.checkpoint
          ? h(
              'div',
              { class: 'banner banner-checkpoint', attrs: { 'data-testid': 'checkpoint-banner' } },
              icon('flag'),
              h('span', {}, h('strong', { text: t('level.checkpoint') }), ' ', t('level.checkpointDesc', { level: s.checkpoint.level + 1 })),
            )
          : null,
        h(
          'div',
          { class: 'stats-grid' },
          statRow(t('level.points'), formatNumber(s.levelPoints)),
          statRow(t('level.total'), formatNumber(s.score)),
          statRow(t('level.bricks'), formatNumber(s.bricks)),
          statRow(t('level.bestCombo'), formatNumber(s.bestCombo)),
          statRow(t('level.time'), formatDuration(s.time)),
        ),
        h('p', { class: 'note', text: t('level.inventoryKept') }),
        h(
          'div',
          { class: 'dialog-actions vertical' },
          button(this.app, t('level.next', { level: s.nextLevel }), () => this.app.nextLevel(), { variant: 'primary', icon: 'play', testId: 'next-level' }),
          button(this.app, t('pause.quit'), () => this.app.quitToMenu(), { variant: 'ghost', testId: 'quit' }),
        ),
      ),
    );
  }

  override onBack(): boolean {
    return true;
  }
}

export class FailedOverlay extends View {
  constructor(
    private readonly app: AppApi,
    private readonly checkpointLevel: number,
  ) {
    super('dialog overlay result-overlay');
  }

  render(): void {
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card result-card', attrs: { 'data-testid': 'attempt-failed' } },
        h('h2', { class: 'dialog-title big', text: t('fail.title') }),
        h('p', { class: 'dialog-body', text: this.checkpointLevel > 0 ? t('fail.body', { level: this.checkpointLevel + 1 }) : t('fail.bodyStart') }),
        h(
          'div',
          { class: 'dialog-actions vertical' },
          button(this.app, t('fail.retry'), () => this.app.nextLevel(), { variant: 'primary', icon: 'play', testId: 'retry' }),
          button(this.app, t('fail.menu'), () => this.app.quitToMenu(), { variant: 'ghost', testId: 'quit' }),
        ),
      ),
    );
  }

  override onBack(): boolean {
    return true;
  }
}

export class GameOverOverlay extends View {
  constructor(
    private readonly app: AppApi,
    private readonly summary: RunSummary,
  ) {
    super('dialog overlay result-overlay');
  }

  render(): void {
    const s = this.summary;
    this.el.replaceChildren(
      h(
        'div',
        { class: `panel dialog-card result-card${s.isNewRecord ? ' record' : ''}`, attrs: { 'data-testid': 'game-over' } },
        h('h2', { class: 'dialog-title big', text: t('over.title') }),
        h('div', { class: 'final-score-label', text: t('over.finalScore') }),
        h('div', { class: 'final-score', attrs: { 'data-testid': 'final-score' }, text: formatNumber(s.score) }),
        s.isNewRecord
          ? h(
              'div',
              { class: 'banner banner-record', attrs: { 'data-testid': 'new-record' } },
              icon('trophy'),
              h('span', {}, h('strong', { text: t('over.newRecord') }), s.previousBest > 0 ? ` ${t('over.previousBest', { score: formatNumber(s.previousBest) })}` : ''),
            )
          : h('p', { class: 'dialog-sub', text: t('over.best', { score: formatNumber(Math.max(s.previousBest, s.score)) }) }),
        h(
          'div',
          { class: 'stats-grid' },
          statRow(t('over.levelReached'), formatNumber(s.level)),
          statRow(t('over.levels'), formatNumber(s.levelsCompleted)),
          statRow(t('over.bricks'), formatNumber(s.bricks)),
          statRow(t('over.combo'), formatNumber(s.bestCombo)),
          statRow(t('over.powers'), formatNumber(s.powersUsed)),
          statRow(t('over.time'), formatDuration(s.playTime)),
        ),
        h(
          'div',
          { class: 'dialog-actions vertical' },
          button(this.app, t('over.again'), () => this.app.playAgain(), { variant: 'primary', icon: 'play', testId: 'play-again' }),
          button(this.app, t('over.menu'), () => this.app.quitToMenu(), { variant: 'ghost', testId: 'quit' }),
        ),
      ),
    );
  }

  override onBack(): boolean {
    this.app.quitToMenu();
    return true;
  }
}
