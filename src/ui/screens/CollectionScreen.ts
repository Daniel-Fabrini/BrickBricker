import type { AppApi } from '../../app/api';
import { achievementById } from '../../core/meta/achievements';
import { COSMETIC_CATEGORIES, COSMETICS, cosmeticById } from '../../core/meta/cosmetics';
import { t, type TranslationKey } from '../../i18n/i18n';
import { screenHeader } from '../components';
import { h, icon } from '../dom';
import { View } from '../UIManager';

export function cosmeticName(id: string): string {
  const def = cosmeticById(id);
  if (!def) return id;
  return t(`cos.${def.category}.${def.variant}` as TranslationKey);
}

export class CollectionScreen extends View {
  constructor(private readonly app: AppApi) {
    super('screen collection-screen');
  }

  render(): void {
    const profile = this.app.data.profile;
    const body = h('div', { class: 'screen-body' }, h('p', { class: 'note', text: t('collection.note') }));
    for (const category of COSMETIC_CATEGORIES) {
      const grid = h('div', { class: 'cosmetic-grid' });
      for (const c of COSMETICS.filter((x) => x.category === category)) {
        const unlocked = profile.cosmetics.unlocked.includes(c.id);
        const equipped = profile.cosmetics.selected[category] === c.id;
        const ach = c.unlockedBy ? achievementById(c.unlockedBy) : undefined;
        const hint = !unlocked && ach ? (ach.secret ? t('collection.secretHint') : t('collection.unlockHint', { achievement: t(`ach.${ach.id}.name` as TranslationKey) })) : '';
        const preview = this.app.cosmeticPreview(c.id);
        grid.append(
          h(
            'button',
            {
              class: `cosmetic${unlocked ? '' : ' locked'}${equipped ? ' equipped' : ''}`,
              attrs: {
                type: 'button',
                disabled: !unlocked,
                'aria-pressed': equipped ? 'true' : 'false',
                'aria-label': `${cosmeticName(c.id)}${unlocked ? '' : ` (${t('common.locked')})`}`,
                'data-testid': `cosmetic-${c.id}`,
              },
              on: {
                click: () => {
                  if (!unlocked || equipped) return;
                  this.app.sound('uiTap');
                  this.app.equipCosmetic(c.id);
                  this.render();
                },
              },
            },
            h('span', { class: 'cosmetic-preview' }, preview ? h('img', { attrs: { src: preview, alt: '' } }) : null, unlocked ? null : icon('lock', 'icon lock-badge')),
            h('span', { class: 'cosmetic-name', text: cosmeticName(c.id) }),
            h('span', { class: 'cosmetic-state', text: equipped ? t('common.equipped') : unlocked ? t('common.equip') : hint }),
          ),
        );
      }
      body.append(h('section', { class: 'panel section' }, h('h2', { class: 'section-title', text: t(`collection.${category}` as TranslationKey) }), grid));
    }
    this.el.replaceChildren(screenHeader(this.app, 'collection.title', () => this.app.showMainMenu()), body);
  }

  override onBack(): boolean {
    this.app.showMainMenu();
    return true;
  }
}
