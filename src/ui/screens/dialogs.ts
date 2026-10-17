import type { AppApi } from '../../app/api';
import { checkpointMilestones } from '../../core/run/run';
import { t } from '../../i18n/i18n';
import { LANGUAGES } from '../../persistence/schema';
import { button } from '../components';
import { h } from '../dom';
import { View } from '../UIManager';

export class ConfirmDialog extends View {
  constructor(
    private readonly app: AppApi,
    private readonly title: string,
    private readonly body: string,
    private readonly onConfirm: () => void,
    private readonly confirmLabel = t('common.confirm'),
  ) {
    super('dialog');
  }

  render(): void {
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card', attrs: { 'data-testid': 'confirm-dialog' } },
        h('h2', { class: 'dialog-title', text: this.title }),
        h('p', { class: 'dialog-body', text: this.body }),
        h(
          'div',
          { class: 'dialog-actions' },
          button(this.app, t('common.cancel'), () => this.app.ui.closeModal(this), { variant: 'ghost', testId: 'confirm-cancel' }),
          button(
            this.app,
            this.confirmLabel,
            () => {
              this.app.ui.closeModal(this);
              this.onConfirm();
            },
            { variant: 'primary', testId: 'confirm-ok' },
          ),
        ),
      ),
    );
  }
}

export class LanguageSheet extends View {
  constructor(private readonly app: AppApi) {
    super('dialog sheet');
  }

  render(): void {
    const current = this.app.data.settings.language;
    this.el.setAttribute('role', 'dialog');
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card', attrs: { 'data-testid': 'language-sheet' } },
        h('h2', { class: 'dialog-title', text: t('settings.language') }),
        h(
          'div',
          { class: 'choice-list vertical' },
          ...LANGUAGES.map((lang) =>
            h('button', {
              class: `choice${current === lang ? ' active' : ''}`,
              text: t(`lang.${lang}`),
              attrs: { type: 'button', lang, 'data-testid': `lang-${lang}` },
              on: {
                click: () => {
                  this.app.sound('uiTap');
                  this.app.setLanguage(lang);
                  this.app.ui.closeModal(this);
                },
              },
            }),
          ),
        ),
        button(this.app, t('common.close'), () => this.app.ui.closeModal(this), { variant: 'ghost' }),
      ),
    );
  }
}

/** Lets the player pick any unlocked checkpoint to start a Progression session from. */
export class ProgressionStartSheet extends View {
  constructor(private readonly app: AppApi) {
    super('dialog sheet');
  }

  render(): void {
    const style = this.app.data.settings.style;
    const highest = this.app.data.profile.progression[style].highestCheckpoint;
    const milestones = checkpointMilestones(highest).reverse();
    this.el.setAttribute('role', 'dialog');
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card', attrs: { 'data-testid': 'progression-start' } },
        h('h2', { class: 'dialog-title', text: t('prog.chooseStart') }),
        h(
          'div',
          { class: 'choice-list vertical scroll' },
          ...milestones.map((m, i) =>
            h(
              'button',
              {
                class: `choice milestone${i === 0 ? ' active' : ''}`,
                attrs: { type: 'button', 'data-testid': `start-${m}` },
                on: {
                  click: () => {
                    this.app.sound('uiTap');
                    this.app.ui.closeModal(this);
                    this.app.startProgression(m);
                  },
                },
              },
              h('span', { class: 'choice-main', text: m === 0 ? t('prog.fromBeginning') : t('prog.fromCheckpoint', { level: m + 1 }) }),
              h('span', { class: 'choice-sub', text: m === 0 ? '' : t('prog.checkpointLabel', { level: m }) }),
              i === 0 ? h('span', { class: 'badge', text: t('prog.latest') }) : null,
            ),
          ),
        ),
        button(this.app, t('common.cancel'), () => this.app.ui.closeModal(this), { variant: 'ghost' }),
      ),
    );
  }
}

export class OnboardingDialog extends View {
  constructor(private readonly app: AppApi) {
    super('dialog');
  }

  render(): void {
    this.el.setAttribute('role', 'dialog');
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card onboarding', attrs: { 'data-testid': 'onboarding' } },
        h('h2', { class: 'dialog-title', text: t('tut.welcomeTitle') }),
        h('p', { class: 'dialog-body', text: t('tut.welcomeBody') }),
        h(
          'div',
          { class: 'choice-list vertical' },
          ...(['en', 'es', 'pt-BR'] as const).map((lang) =>
            h('button', {
              class: `choice small${this.app.data.settings.language === lang ? ' active' : ''}`,
              text: t(`lang.${lang}`),
              attrs: { type: 'button', lang, 'data-testid': `onboard-lang-${lang}` },
              on: {
                click: () => {
                  this.app.setLanguage(lang);
                },
              },
            }),
          ),
        ),
        h(
          'div',
          { class: 'dialog-actions' },
          button(
            this.app,
            t('tut.skip'),
            () => {
              this.app.ui.closeModal(this);
              this.app.finishTutorial(true);
            },
            { variant: 'ghost', testId: 'tutorial-skip' },
          ),
          button(
            this.app,
            t('tut.play'),
            () => {
              this.app.ui.closeModal(this);
              this.app.startTutorial();
            },
            { variant: 'primary', testId: 'tutorial-play' },
          ),
        ),
      ),
    );
  }

  override onBack(): boolean {
    this.app.ui.closeModal(this);
    this.app.finishTutorial(true);
    return true;
  }
}

/** Short explanatory card used by the tutorial. */
export class InfoCard extends View {
  constructor(
    private readonly app: AppApi,
    private readonly title: string,
    private readonly body: string,
    private readonly actionLabel: string,
    private readonly onNext: () => void,
    private readonly onSkip: (() => void) | null,
  ) {
    super('dialog info-card');
  }

  render(): void {
    this.el.replaceChildren(
      h(
        'div',
        { class: 'panel dialog-card', attrs: { 'data-testid': 'info-card' } },
        h('h2', { class: 'dialog-title', text: this.title }),
        h('p', { class: 'dialog-body', text: this.body }),
        h(
          'div',
          { class: 'dialog-actions' },
          this.onSkip
            ? button(
                this.app,
                t('common.skip'),
                () => {
                  this.app.ui.closeModal(this);
                  this.onSkip?.();
                },
                { variant: 'ghost' },
              )
            : null,
          button(
            this.app,
            this.actionLabel,
            () => {
              this.app.ui.closeModal(this);
              this.onNext();
            },
            { variant: 'primary', testId: 'info-next' },
          ),
        ),
      ),
    );
  }

  override onBack(): boolean {
    return true;
  }
}
