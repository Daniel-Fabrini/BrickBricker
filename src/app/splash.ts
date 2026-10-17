/** Minimum time the splash screen stays up (measured from app start), unless tapped once ready. */
export const SPLASH_MIN_MS = 1800;

/**
 * Fades out the splash screen (`#boot`, rendered by index.html before any code loads) once the game
 * is ready. It stays visible for at least SPLASH_MIN_MS so the title and credit can be read; a tap
 * skips the remaining wait.
 */
export function hideSplash(): Promise<void> {
  const el = document.getElementById('boot');
  if (!el) {
    document.body.classList.add('ready');
    return Promise.resolve();
  }
  el.classList.add('loaded');
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  return new Promise((resolve) => {
    const finish = (): void => {
      window.clearTimeout(timer);
      el.removeEventListener('pointerdown', finish);
      el.classList.add('done');
      document.body.classList.add('ready');
      window.setTimeout(() => {
        el.remove();
        resolve();
      }, 550);
    };
    const timer = window.setTimeout(finish, wait);
    el.addEventListener('pointerdown', finish);
  });
}

/** Shows a startup failure on the splash screen instead of the loading bar. */
export function showSplashError(message: string): void {
  const el = document.getElementById('boot');
  if (!el) return;
  el.classList.add('error');
  const status = el.querySelector('.splash-status');
  if (status) status.textContent = message;
}
