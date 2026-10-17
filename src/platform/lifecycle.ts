import { App } from '@capacitor/app';
import { SystemBars, SystemBarType } from '@capacitor/core';
import { isNative } from './native';

export interface LifecycleHandlers {
  /** App moved to the background (or tab hidden). Must pause and save. */
  onBackground(): void;
  onForeground(): void;
  /** Android back button / gesture. Return true if handled. */
  onBack(): boolean;
}

/**
 * Bridges Android lifecycle events and browser visibility events to the game. The game pauses on
 * background and only resumes when the player chooses to.
 */
export function initLifecycle(handlers: LifecycleHandlers): void {
  let backgrounded = false;
  const goBackground = (): void => {
    if (backgrounded) return;
    backgrounded = true;
    handlers.onBackground();
  };
  const goForeground = (): void => {
    if (!backgrounded) return;
    backgrounded = false;
    handlers.onForeground();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') goBackground();
    else goForeground();
  });
  window.addEventListener('pagehide', goBackground);
  window.addEventListener('blur', () => {
    // Desktop browsers: losing focus pauses gameplay but is not a full background event.
    if (!isNative()) handlers.onBackground();
  });

  if (isNative()) {
    void App.addListener('appStateChange', ({ isActive }) => (isActive ? goForeground() : goBackground()));
    void App.addListener('pause', goBackground);
    void App.addListener('resume', goForeground);
    void App.addListener('backButton', () => {
      if (!handlers.onBack()) void App.exitApp();
    });
    // Immersive play: hide the status bar; the navigation bar stays available.
    void SystemBars.hide({ bar: SystemBarType.StatusBar }).catch(() => undefined);
  } else {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') handlers.onBack();
    });
  }
}
