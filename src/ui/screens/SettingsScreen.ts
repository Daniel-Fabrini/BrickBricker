import type { AppApi } from '../../app/api';
import { t } from '../../i18n/i18n';
import { LANGUAGES } from '../../persistence/schema';
import { button, screenHeader, section, segmented, sliderRow, toggleRow } from '../components';
import { h } from '../dom';
import { View } from '../UIManager';

/** Settings. Opened from the main menu (as a page) or from the pause menu (as a modal). */
export class SettingsScreen extends View {
  constructor(
    private readonly app: AppApi,
    private readonly onClose: () => void,
    private readonly inGame: boolean,
  ) {
    super('screen settings-screen');
  }

  render(): void {
    const s = this.app.data.settings;
    const update = this.app.updateSettings.bind(this.app);
    this.el.replaceChildren(
      screenHeader(this.app, 'settings.title', this.onClose),
      h(
        'div',
        { class: 'screen-body' },
        section(
          'settings.audio',
          toggleRow(this.app, 'settings.music', s.musicEnabled, (v) => update({ musicEnabled: v }), undefined, 'toggle-music'),
          sliderRow('settings.musicVolume', s.musicVolume, (v) => update({ musicVolume: v }), 'slider-music'),
          toggleRow(this.app, 'settings.sfx', s.sfxEnabled, (v) => update({ sfxEnabled: v }), undefined, 'toggle-sfx'),
          sliderRow('settings.sfxVolume', s.sfxVolume, (v) => update({ sfxVolume: v }), 'slider-sfx'),
        ),
        section(
          'settings.controls',
          h(
            'div',
            { class: 'row row-column' },
            h('span', { class: 'row-label', text: t('settings.controlMode') }),
            segmented(
              this.app,
              [
                { value: 'direct', label: t('settings.control.direct'), testId: 'control-direct' },
                { value: 'relative', label: t('settings.control.relative'), testId: 'control-relative' },
              ],
              s.controlMode,
              (v) => {
                update({ controlMode: v });
                this.render();
              },
              t('settings.controlMode'),
            ),
          ),
          toggleRow(this.app, 'settings.controlAssist', s.controlAssist, (v) => update({ controlAssist: v }), 'settings.controlAssist.desc'),
          toggleRow(this.app, 'settings.haptics', s.haptics, (v) => update({ haptics: v })),
        ),
        section(
          'settings.accessibility',
          toggleRow(this.app, 'settings.ballVisibility', s.ballVisibility, (v) => update({ ballVisibility: v }), 'settings.ballVisibility.desc', 'toggle-visibility'),
          toggleRow(this.app, 'settings.tolerantControl', s.tolerantControl, (v) => update({ tolerantControl: v }), 'settings.tolerantControl.desc', 'toggle-tolerant'),
          toggleRow(this.app, 'settings.reducedEffects', s.reducedEffects, (v) => update({ reducedEffects: v }), 'settings.reducedEffects.desc', 'toggle-reduced'),
          h('p', { class: 'note', text: t('settings.accessibilityNote') }),
        ),
        section(
          'settings.display',
          h(
            'div',
            { class: 'row row-column' },
            h('span', { class: 'row-label', text: t('settings.theme') }),
            segmented(
              this.app,
              [
                { value: 'retro', label: t('theme.retro') },
                { value: 'neon', label: t('theme.neon') },
              ],
              s.theme,
              (v) => {
                update({ theme: v });
                this.render();
              },
              t('settings.theme'),
            ),
          ),
          h(
            'div',
            { class: 'row row-column' },
            h('span', { class: 'row-label', text: t('settings.language') }),
            h(
              'div',
              { class: 'choice-list' },
              ...LANGUAGES.map((lang) =>
                h('button', {
                  class: `choice${s.language === lang ? ' active' : ''}`,
                  text: t(`lang.${lang}`),
                  attrs: { type: 'button', lang, 'aria-pressed': s.language === lang ? 'true' : 'false', 'data-testid': `lang-${lang}` },
                  on: {
                    click: () => {
                      this.app.sound('uiTap');
                      this.app.setLanguage(lang);
                    },
                  },
                }),
              ),
            ),
          ),
        ),
        this.inGame
          ? null
          : section('menu.tutorial', button(this.app, t('settings.tutorial'), () => this.app.startTutorial(), { variant: 'secondary', icon: 'help', testId: 'replay-tutorial' })),
        section('settings.about', h('p', { class: 'note', text: t('settings.aboutBody', { version: this.app.version }) })),
      ),
    );
  }

  override onBack(): boolean {
    this.onClose();
    return true;
  }
}
