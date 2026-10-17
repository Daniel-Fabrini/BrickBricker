import type { LanguageCode } from '../persistence/schema';
import { en, type TranslationKey } from './locales/en';
import { es } from './locales/es';
import { ptBR } from './locales/ptBR';

export type { TranslationKey };

export const LOCALES: Record<LanguageCode, Record<TranslationKey, string>> = {
  en,
  es,
  'pt-BR': ptBR,
};

/** BCP-47 tags used for number formatting. */
const NUMBER_LOCALE: Record<LanguageCode, string> = { en: 'en-US', es: 'es-ES', 'pt-BR': 'pt-BR' };

/**
 * Maps device locales to a supported language: any Portuguese locale -> Brazilian Portuguese,
 * any Spanish locale -> Spanish, everything else -> English.
 */
export function detectLanguage(preferred: readonly string[]): LanguageCode {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower === 'pt' || lower.startsWith('pt-') || lower.startsWith('pt_')) return 'pt-BR';
    if (lower === 'es' || lower.startsWith('es-') || lower.startsWith('es_')) return 'es';
    if (lower === 'en' || lower.startsWith('en-') || lower.startsWith('en_')) return 'en';
  }
  return 'en';
}

export function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = navigator.languages && navigator.languages.length > 0 ? [...navigator.languages] : [];
  if (navigator.language) list.push(navigator.language);
  return list;
}

export type Params = Record<string, string | number>;

let current: LanguageCode = 'en';
const listeners = new Set<(lang: LanguageCode) => void>();

export function setLanguage(lang: LanguageCode): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const l of listeners) l(lang);
}

export function getLanguage(): LanguageCode {
  return current;
}

export function onLanguageChange(listener: (lang: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function translate(lang: LanguageCode, key: TranslationKey, params?: Params): string {
  const table = LOCALES[lang] ?? en;
  return interpolate(table[key] ?? en[key] ?? key, params);
}

/** Translates in the current language. */
export function t(key: TranslationKey, params?: Params): string {
  return translate(current, key, params);
}

export function formatNumber(value: number): string {
  try {
    return new Intl.NumberFormat(NUMBER_LOCALE[current]).format(Math.round(value));
  } catch {
    return String(Math.round(value));
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return t('time.hm', { h, m });
  if (m > 0) return t('time.ms', { m, s });
  return t('time.s', { s });
}

/** Placeholder names used in a template, e.g. "{level}". */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}
