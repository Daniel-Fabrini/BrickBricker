import type { AppApi } from '../../app/api';
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, achievementProgress } from '../../core/meta/achievements';
import { cosmeticsUnlockedBy } from '../../core/meta/cosmetics';
import { achievementContext } from '../../game/profile';
import { formatNumber, t, type TranslationKey } from '../../i18n/i18n';
import { screenHeader } from '../components';
import { h, icon } from '../dom';
import { View } from '../UIManager';
import { cosmeticName } from './CollectionScreen';

export function achievementName(id: string): string {
  return t(`ach.${id}.name` as TranslationKey);
}

export class AchievementsScreen extends View {
  constructor(private readonly app: AppApi) {
    super('screen achievements-screen');
  }

  render(): void {
    const profile = this.app.data.profile;
    const ctx = achievementContext(profile);
    const unlockedCount = ACHIEVEMENTS.filter((a) => profile.achievements[a.id] !== undefined).length;
    const body = h(
      'div',
      { class: 'screen-body' },
      h('p', { class: 'summary', text: t('ach.count', { unlocked: unlockedCount, total: ACHIEVEMENTS.length }) }),
    );
    for (const category of ACHIEVEMENT_CATEGORIES) {
      const list = ACHIEVEMENTS.filter((a) => a.category === category);
      const panel = h('section', { class: 'panel section' }, h('h2', { class: 'section-title', text: t(`ach.category.${category}` as TranslationKey) }));
      for (const a of list) {
        const unlocked = profile.achievements[a.id] !== undefined;
        const hidden = a.secret && !unlocked;
        const progress = achievementProgress(a, ctx);
        const current = Math.min(a.target, Math.floor(a.progress(ctx)));
        const rewards = cosmeticsUnlockedBy(a.id);
        panel.append(
          h(
            'div',
            { class: `achievement${unlocked ? ' unlocked' : ''}${hidden ? ' secret' : ''}`, attrs: { 'data-testid': `ach-${a.id}` } },
            h('span', { class: 'ach-icon' }, icon(unlocked ? 'trophy' : 'lock')),
            h(
              'span',
              { class: 'ach-text' },
              h('span', { class: 'ach-name', text: hidden ? t('ach.secretName') : achievementName(a.id) }),
              h('span', { class: 'ach-desc', text: hidden ? t(`ach.${a.id}.hint` as TranslationKey) : t(`ach.${a.id}.desc` as TranslationKey) }),
              !unlocked && !hidden && a.target > 1
                ? h(
                    'span',
                    { class: 'progress' },
                    h('span', { class: 'progress-bar', style: { width: `${Math.round(progress * 100)}%` } }),
                    h('span', { class: 'progress-label', text: t('ach.progress', { current: formatNumber(current), target: formatNumber(a.target) }) }),
                  )
                : null,
              rewards.length > 0 && !hidden ? h('span', { class: 'ach-reward', text: t('ach.reward', { name: rewards.map((c) => cosmeticName(c.id)).join(', ') }) }) : null,
            ),
          ),
        );
      }
      body.append(panel);
    }
    this.el.replaceChildren(screenHeader(this.app, 'ach.title', () => this.app.showMainMenu()), body);
  }

  override onBack(): boolean {
    this.app.showMainMenu();
    return true;
  }
}
