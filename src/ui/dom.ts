/** Tiny DOM helpers used by every screen (no framework needed). */
type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  style?: Partial<Record<string, string>>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  dataset?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k, v);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      if (handler) el.addEventListener(type, handler as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const ICONS: Record<string, string> = {
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 4.6l1.8 1.4-2 3.4-2.1-.8a7.6 7.6 0 0 1-1.7 1l-.3 2.2h-4l-.3-2.2a7.6 7.6 0 0 1-1.7-1l-2.1.8-2-3.4 1.8-1.4a7.7 7.7 0 0 1 0-2.2L2 9.5l2-3.4 2.1.8a7.6 7.6 0 0 1 1.7-1L8.1 3.7h4l.3 2.2a7.6 7.6 0 0 1 1.7 1l2.1-.8 2 3.4-1.8 1.4a7.7 7.7 0 0 1 0 2.2z"/>',
  stats: '<path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z"/>',
  trophy: '<path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V18h3v2H8v-2h3v-3.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1 1.7V7zm12 0v2.7A2 2 0 0 0 18 8V7z"/>',
  sparkle: '<path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/>',
  globe: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.6 15.6 0 0 0-1.3-3.9A8 8 0 0 1 18.9 8zM12 4a13.7 13.7 0 0 1 1.8 4h-3.6A13.7 13.7 0 0 1 12 4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.8 2h3a15.6 15.6 0 0 0 1.3 3.9A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.9A15.6 15.6 0 0 0 8.1 8zM12 20a13.7 13.7 0 0 1-1.8-4h3.6A13.7 13.7 0 0 1 12 20zm2.3-6H9.7a14.6 14.6 0 0 1 0-4h4.6a14.6 14.6 0 0 1 0 4zm.3 5.9a15.6 15.6 0 0 0 1.3-3.9h3a8 8 0 0 1-4.3 3.9zm1.7-5.9a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4z"/>',
  back: '<path d="M15.4 5.4L14 4l-8 8 8 8 1.4-1.4L8.8 12z"/>',
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.5 1.2 5.2 3 1.7-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/>',
  flag: '<path d="M5 21V3h2v1h11l-2.5 4.5L18 13H7v8z"/>',
  check: '<path d="M9.5 16.2L5.3 12l-1.4 1.4 5.6 5.6L20.6 7.9l-1.4-1.4z"/>',
  bomb: '<path d="M14.5 4.5l1.3-1.3 1.4 1.4-1.3 1.3A7 7 0 1 1 13 5.3V3h2v1.5zM9.5 9a4 4 0 0 0-3.5 3h2a2 2 0 0 1 1.5-1z"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  help: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2zm2.1-7.8l-.9.9A3.4 3.4 0 0 0 13 15h-2v-.5a4 4 0 0 1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 9H8a4 4 0 1 1 7.1 2.2z"/>',
};

export function icon(name: keyof typeof ICONS | string, cls = 'icon'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}
