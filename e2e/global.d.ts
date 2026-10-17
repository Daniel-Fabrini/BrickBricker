/** Shape of the `?test` automation hooks (see src/app/testHooks.ts). */
interface BbiTestHooks {
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

interface Window {
  __BBI__?: BbiTestHooks;
}
