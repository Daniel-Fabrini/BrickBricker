import type { AppApi } from '../../app/api';
import { describeSnapshot } from '../../game/session';
import { formatNumber, t } from '../../i18n/i18n';
import { button, iconButton, segmented } from '../components';
import { h, icon } from '../dom';
import { View } from '../UIManager';

export class MainMenuScreen extends View {
  constructor(private readonly app: AppApi) {
    super('screen main-menu');
  }

  render(): void {
    const { data } = this.app;
    const settings = data.settings;
    const style = settings.style;
    const prog = data.profile.progression[style];
    const best = data.profile.highScores[style];
    this.el.replaceChildren();

    const logo = h(
      'div',
      { class: 'logo', attrs: { role: 'img', 'aria-label': `${t('app.title')} ${t('app.subtitle')}` } },
      h('div', { class: 'logo-title', text: t('app.title') }),
      h('div', { class: 'logo-sub', text: t('app.subtitle') }),
    );

    let continueCard: HTMLElement | null = null;
    if (data.session) {
      const d = describeSnapshot(data.session);
      const modeName = t(d.mode === 'progression' ? 'mode.progression' : 'mode.highscore');
      const styleName = t(d.style === 'classic' ? 'style.classic' : 'style.maze');
      continueCard = h(
        'div',
        { class: 'panel continue-card', attrs: { 'data-testid': 'continue-card' } },
        h('div', { class: 'continue-title', text: t('menu.continueTitle') }),
        h('div', { class: 'continue-desc', text: t('menu.continueDesc', { mode: modeName, style: styleName, level: d.level }) }),
        h(
          'div',
          { class: 'continue-meta' },
          h('span', { text: t('menu.continueScore', { score: formatNumber(d.score) }) }),
          d.lives !== null ? h('span', { text: t('menu.continueLives', { lives: d.lives }) }) : null,
        ),
        h(
          'div',
          { class: 'continue-actions' },
          button(this.app, t('menu.continue'), () => this.app.continueSession(), { variant: 'primary', icon: 'play', testId: 'continue' }),
          button(this.app, t('menu.abandon'), () => this.app.abandonSession(), { variant: 'ghost', testId: 'abandon' }),
        ),
      );
    }

    const modeCard = (mode: 'progression' | 'highscore'): HTMLElement => {
      const title = t(mode === 'progression' ? 'mode.progression' : 'mode.highscore');
      const desc = t(mode === 'progression' ? 'menu.progression.desc' : 'menu.highscore.desc');
      const meta =
        mode === 'progression'
          ? [
              prog.bestLevel > 0 ? t('menu.bestLevel', { level: prog.bestLevel }) : null,
              prog.highestCheckpoint > 0 ? t('menu.checkpoint', { level: prog.highestCheckpoint }) : t('menu.noCheckpoint'),
            ]
          : [best.score > 0 ? t('menu.bestScore', { score: formatNumber(best.score) }) : t('menu.noScore')];
      return h(
        'button',
        {
          class: `mode-card mode-${mode}`,
          attrs: { type: 'button', 'data-testid': `mode-${mode}` },
          on: {
            click: () => {
              this.app.sound('uiTap');
              this.app.requestStart(mode);
            },
          },
        },
        h('span', { class: 'mode-icon' }, icon(mode === 'progression' ? 'flag' : 'trophy')),
        h(
          'span',
          { class: 'mode-text' },
          h('span', { class: 'mode-title', text: title }),
          h('span', { class: 'mode-desc', text: desc }),
          h('span', { class: 'mode-meta' }, ...meta.filter((m): m is string => m !== null).map((m) => h('span', { text: m }))),
        ),
        h('span', { class: 'mode-go' }, icon('play')),
      );
    };

    const styleRow = h(
      'div',
      { class: 'option-block' },
      h('div', { class: 'option-label', text: t('menu.style') }),
      segmented(
        this.app,
        [
          { value: 'classic', label: t('style.classic'), testId: 'style-classic' },
          { value: 'maze', label: t('style.maze'), testId: 'style-maze' },
        ],
        style,
        (v) => this.app.updateSettings({ style: v }),
        t('menu.style'),
      ),
      h('div', { class: 'option-desc', text: t(style === 'classic' ? 'menu.style.classic.desc' : 'menu.style.maze.desc') }),
    );

    const themeRow = h(
      'div',
      { class: 'option-block' },
      h('div', { class: 'option-label', text: t('menu.theme') }),
      segmented(
        this.app,
        [
          { value: 'retro', label: t('theme.retro'), testId: 'theme-retro' },
          { value: 'neon', label: t('theme.neon'), testId: 'theme-neon' },
        ],
        settings.theme,
        (v) => this.app.updateSettings({ theme: v }),
        t('menu.theme'),
      ),
    );

    const nav = h(
      'nav',
      { class: 'menu-nav' },
      this.navItem('stats', t('menu.stats'), () => this.app.openStats(), 'nav-stats'),
      this.navItem('trophy', t('menu.achievements'), () => this.app.openAchievements(), 'nav-achievements'),
      this.navItem('sparkle', t('menu.collection'), () => this.app.openCollection(), 'nav-collection'),
      this.navItem('globe', t('menu.language'), () => this.app.openLanguagePicker(), 'nav-language'),
      this.navItem('gear', t('menu.settings'), () => this.app.openSettings(), 'nav-settings'),
    );

    this.el.append(
      h(
        'div',
        { class: 'menu-scroll' },
        logo,
        continueCard,
        h('div', { class: 'mode-cards' }, modeCard('progression'), modeCard('highscore')),
        h('div', { class: 'panel options' }, styleRow, themeRow),
      ),
      nav,
    );
  }

  private navItem(iconName: string, label: string, onClick: () => void, testId: string): HTMLElement {
    const btn = iconButton(this.app, iconName, label, onClick, testId);
    btn.classList.add('nav-item');
    btn.append(h('span', { class: 'nav-label', text: label }));
    return btn;
  }

  override onBack(): boolean {
    return false;
  }
}
