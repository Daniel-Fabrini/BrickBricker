import { h } from './dom';

/** A page or modal. Views rebuild their DOM in render(), which also runs after language changes. */
export abstract class View {
  readonly el: HTMLElement;

  constructor(className: string) {
    this.el = h('div', { class: className });
  }

  abstract render(): void;

  /** Return true if the back action was handled. Modals close by default. */
  onBack(): boolean {
    return false;
  }

  onShow(): void {}

  destroy(): void {
    this.el.remove();
  }
}

/**
 * Manages one active page, a stack of modals, the in-game HUD layer and non-blocking toasts.
 */
export class UIManager {
  readonly root: HTMLElement;
  readonly hudLayer: HTMLElement;
  readonly popupLayer: HTMLElement;
  private readonly pageLayer: HTMLElement;
  private readonly modalLayer: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private page: View | null = null;
  private modals: View[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.hudLayer = h('div', { class: 'layer layer-hud' });
    this.popupLayer = h('div', { class: 'layer layer-popups', attrs: { 'aria-hidden': 'true' } });
    this.pageLayer = h('div', { class: 'layer layer-page' });
    this.modalLayer = h('div', { class: 'layer layer-modal' });
    this.toastLayer = h('div', { class: 'layer layer-toast', attrs: { role: 'status', 'aria-live': 'polite' } });
    root.append(this.hudLayer, this.popupLayer, this.pageLayer, this.modalLayer, this.toastLayer);
  }

  get currentPage(): View | null {
    return this.page;
  }

  get topModal(): View | null {
    return this.modals[this.modals.length - 1] ?? null;
  }

  showPage(view: View | null): void {
    const previous = this.page;
    this.page = view;
    if (previous && previous !== view) {
      previous.el.classList.add('leaving');
      window.setTimeout(() => previous.destroy(), 180);
    }
    if (view) {
      view.render();
      view.el.classList.add('page', 'entering');
      this.pageLayer.append(view.el);
      requestAnimationFrame(() => view.el.classList.remove('entering'));
      view.onShow();
    }
  }

  openModal(view: View): void {
    view.render();
    view.el.classList.add('modal', 'entering');
    this.modalLayer.append(view.el);
    this.modals.push(view);
    requestAnimationFrame(() => view.el.classList.remove('entering'));
    view.onShow();
  }

  closeModal(view?: View): void {
    const target = view ?? this.topModal;
    if (!target) return;
    this.modals = this.modals.filter((m) => m !== target);
    target.destroy();
  }

  closeAllModals(): void {
    for (const m of [...this.modals]) m.destroy();
    this.modals = [];
  }

  hasModal(predicate: (v: View) => boolean): boolean {
    return this.modals.some(predicate);
  }

  /** Android back: top modal first, then the page. */
  back(): boolean {
    const modal = this.topModal;
    if (modal) {
      if (!modal.onBack()) this.closeModal(modal);
      return true;
    }
    return this.page ? this.page.onBack() : false;
  }

  /** Re-renders everything (e.g. after a language or theme change). */
  refreshAll(): void {
    this.page?.render();
    for (const m of this.modals) m.render();
  }

  toast(title: string, detail?: string, kind: 'info' | 'reward' | 'warn' = 'info'): void {
    const el = h('div', { class: `toast toast-${kind}` }, h('div', { class: 'toast-title', text: title }), detail ? h('div', { class: 'toast-detail', text: detail }) : null);
    this.toastLayer.append(el);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => el.remove(), 300);
    }, 2800);
  }
}
