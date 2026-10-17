import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '../src/core/meta/achievements';
import { COSMETICS, COSMETIC_CATEGORIES } from '../src/core/meta/cosmetics';
import { SPECIAL_LEVELS } from '../src/core/level/specialLevels';
import { POWER_TYPES } from '../src/core/types';
import { detectLanguage, LOCALES, placeholders, translate, type TranslationKey } from '../src/i18n/i18n';
import { en } from '../src/i18n/locales/en';
import { LANGUAGES } from '../src/persistence/schema';

const keys = Object.keys(en) as TranslationKey[];

describe('localization (req 23)', () => {
  it('provides every key, non-empty, in English, Spanish and Brazilian Portuguese', () => {
    expect(LANGUAGES).toEqual(['en', 'es', 'pt-BR']);
    for (const lang of LANGUAGES) {
      const table = LOCALES[lang];
      expect(Object.keys(table).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(typeof table[key]).toBe('string');
        expect(table[key].trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('uses the same placeholders in every language', () => {
    for (const key of keys) {
      const expected = placeholders(en[key]);
      for (const lang of LANGUAGES) expect(placeholders(LOCALES[lang][key]), `${lang}:${key}`).toEqual(expected);
    }
  });

  it('actually translates user-facing text (not copies of English)', () => {
    const shared = new Set(['app.title', 'app.subtitle', 'lang.en', 'lang.es', 'lang.pt-BR']);
    for (const lang of ['es', 'pt-BR'] as const) {
      const different = keys.filter((k) => !shared.has(k) && LOCALES[lang][k] !== en[k]).length;
      expect(different / keys.length).toBeGreaterThan(0.8);
    }
  });

  it('has names and descriptions for every achievement, cosmetic, power, category and special level', () => {
    const required: string[] = [];
    for (const a of ACHIEVEMENTS) {
      required.push(`ach.${a.id}.name`, `ach.${a.id}.desc`);
      if (a.secret) required.push(`ach.${a.id}.hint`);
    }
    for (const c of ACHIEVEMENT_CATEGORIES) required.push(`ach.category.${c}`);
    for (const c of COSMETICS) required.push(`cos.${c.category}.${c.variant}`);
    for (const c of COSMETIC_CATEGORIES) required.push(`collection.${c}`);
    for (const p of POWER_TYPES) required.push(`power.${p}`, `power.${p}.desc`);
    for (const s of SPECIAL_LEVELS) required.push(`special.${s.id}`);
    for (const key of required) expect(keys, key).toContain(key);
  });

  it('detects the device language with Portuguese -> pt-BR, Spanish -> es, otherwise English', () => {
    expect(detectLanguage(['pt-BR'])).toBe('pt-BR');
    expect(detectLanguage(['pt-PT'])).toBe('pt-BR');
    expect(detectLanguage(['pt'])).toBe('pt-BR');
    expect(detectLanguage(['es-MX', 'en-US'])).toBe('es');
    expect(detectLanguage(['es'])).toBe('es');
    expect(detectLanguage(['fr-FR', 'de'])).toBe('en');
    expect(detectLanguage(['fr-FR', 'es-AR'])).toBe('es');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(['en-GB'])).toBe('en');
  });

  it('interpolates parameters', () => {
    expect(translate('es', 'level.complete', { level: 7 })).toBe('¡Nivel 7 completado!');
    expect(translate('pt-BR', 'level.complete', { level: 7 })).toBe('Fase 7 concluída!');
    expect(translate('en', 'menu.bestScore', { score: '1,000' })).toBe('Best 1,000');
  });

  it('keeps labels short enough for small screens', () => {
    const compact: TranslationKey[] = ['menu.stats', 'menu.achievements', 'menu.collection', 'menu.language', 'menu.settings', 'hud.score', 'hud.level', 'hud.lives', 'style.classic', 'style.maze', 'theme.retro', 'theme.neon'];
    for (const lang of LANGUAGES) for (const key of compact) expect(LOCALES[lang][key].length, `${lang}:${key}`).toBeLessThanOrEqual(12);
    for (const lang of LANGUAGES) for (const key of keys.filter((k) => k.endsWith('.name'))) expect(LOCALES[lang][key].length, `${lang}:${key}`).toBeLessThanOrEqual(26);
  });
});
