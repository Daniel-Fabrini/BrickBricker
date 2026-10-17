import type { AppApi } from '../app/api';
import { t, type TranslationKey } from '../i18n/i18n';
import { h, icon } from './dom';

export function button(
  app: AppApi,
  label: string,
  onClick: () => void,
  opts: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: string; testId?: string; disabled?: boolean; ariaLabel?: string } = {},
): HTMLButtonElement {
  const btn = h(
    'button',
    {
      class: `btn btn-${opts.variant ?? 'secondary'}`,
      attrs: { type: 'button', 'data-testid': opts.testId, disabled: opts.disabled, 'aria-label': opts.ariaLabel },
      on: {
        click: () => {
          app.sound(opts.variant === 'ghost' ? 'uiBack' : 'uiTap');
          onClick();
        },
      },
    },
    opts.icon ? icon(opts.icon) : null,
    h('span', { class: 'btn-label', text: label }),
  );
  return btn;
}

export function iconButton(app: AppApi, iconName: string, label: string, onClick: () => void, testId?: string): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'icon-btn',
      attrs: { type: 'button', 'aria-label': label, title: label, 'data-testid': testId },
      on: {
        click: () => {
          app.sound('uiTap');
          onClick();
        },
      },
    },
    icon(iconName),
  );
}

export function screenHeader(app: AppApi, titleKey: TranslationKey, onBack: () => void): HTMLElement {
  return h(
    'header',
    { class: 'screen-header' },
    h(
      'button',
      {
        class: 'icon-btn back-btn',
        attrs: { type: 'button', 'aria-label': t('common.back'), 'data-testid': 'back' },
        on: {
          click: () => {
            app.sound('uiBack');
            onBack();
          },
        },
      },
      icon('back'),
    ),
    h('h1', { class: 'screen-title', text: t(titleKey) }),
  );
}

export function section(titleKey: TranslationKey, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'panel section' }, h('h2', { class: 'section-title', text: t(titleKey) }), ...children);
}

export function toggleRow(app: AppApi, labelKey: TranslationKey, value: boolean, onChange: (v: boolean) => void, descKey?: TranslationKey, testId?: string): HTMLElement {
  const input = h('input', {
    class: 'switch-input',
    attrs: { type: 'checkbox', role: 'switch', 'data-testid': testId, 'aria-label': t(labelKey) },
  });
  input.checked = value;
  input.addEventListener('change', () => {
    app.sound('uiTap');
    onChange(input.checked);
  });
  return h(
    'label',
    { class: 'row row-toggle' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: t(labelKey) }), descKey ? h('span', { class: 'row-desc', text: t(descKey) }) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' }, h('span', { class: 'switch-thumb' }))),
  );
}

export function sliderRow(labelKey: TranslationKey, value: number, onChange: (v: number) => void, testId?: string): HTMLElement {
  const out = h('span', { class: 'row-value', text: `${Math.round(value * 100)}%` });
  const input = h('input', {
    class: 'slider',
    attrs: { type: 'range', min: 0, max: 100, step: 5, 'aria-label': t(labelKey), 'data-testid': testId },
  });
  input.value = String(Math.round(value * 100));
  input.addEventListener('input', () => {
    out.textContent = `${input.value}%`;
    onChange(Number(input.value) / 100);
  });
  return h('label', { class: 'row row-slider' }, h('span', { class: 'row-label', text: t(labelKey) }), input, out);
}

export function segmented<T extends string>(
  app: AppApi,
  options: { value: T; label: string; testId?: string }[],
  current: T,
  onChange: (v: T) => void,
  ariaLabel: string,
): HTMLElement {
  const group = h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': ariaLabel } });
  for (const opt of options) {
    const btn = h('button', {
      class: `segment${opt.value === current ? ' active' : ''}`,
      text: opt.label,
      attrs: { type: 'button', role: 'radio', 'aria-checked': opt.value === current ? 'true' : 'false', 'data-testid': opt.testId },
      on: {
        click: () => {
          if (opt.value === current) return;
          app.sound('uiTap');
          onChange(opt.value);
        },
      },
    });
    group.append(btn);
  }
  return group;
}

export function statRow(label: string, value: string, note?: string): HTMLElement {
  return h(
    'div',
    { class: 'row row-stat' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: label }), note ? h('span', { class: 'row-desc', text: note }) : null),
    h('span', { class: 'row-value', text: value }),
  );
}
