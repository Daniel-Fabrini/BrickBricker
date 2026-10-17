import type { App } from './App';

/**
 * Automation hooks for end-to-end tests, enabled only with the `?test` URL parameter (the Android
 * app never loads such a URL). They go through the same public game APIs as the player.
 */
export interface TestHooks {
  phase(): string | null;
  mode(): string;
  sim(): unknown;
  data(): unknown;
  destroyAllBricks(): void;
  setPaddle(x: number): void;
  autopilot(on: boolean): void;
  flush(): Promise<void>;
  loseAllBalls(): void;
}

declare global {
  interface Window {
    __BBI__?: TestHooks;
  }
}

export function installTestHooks(app: App): void {
  if (!new URLSearchParams(window.location.search).has('test')) return;
  const sim = () => app.controller.activeSim;
  window.__BBI__ = {
    phase: () => app.controller.session?.phase ?? null,
    mode: () => app.controller.mode,
    sim: () => sim()?.snapshot() ?? null,
    data: () => JSON.parse(JSON.stringify(app.data)) as unknown,
    destroyAllBricks: () => sim()?.debugDestroyAllBricks(),
    setPaddle: (x: number) => sim()?.setPaddleTarget(x),
    autopilot: (on: boolean) => {
      app.controller.testAutopilot = on;
    },
    flush: () => app.flushSaves(),
    loseAllBalls: () => {
      const s = sim();
      if (!s) return;
      s.state.balls.forEach((_, i) => s.debugPlaceBall(180, 640, 0, 300, i));
    },
  };
}
