import { SIM } from '../../config/tuning';

/**
 * Fixed-timestep driver with pause support. Rendering frames feed real elapsed time; the
 * simulation always advances in identical `dt` slices. While paused nothing advances, so balls,
 * obstacles, timers, combos and falling power-ups are all frozen.
 */
export class FixedStepLoop {
  private accumulator = 0;
  private paused = false;
  private readonly maxStepsPerFrame = 24;

  constructor(
    private readonly stepFn: (dt: number) => void,
    private readonly dt: number = SIM.fixedStep,
    private readonly maxFrameDelta: number = SIM.maxFrameDelta,
  ) {}

  /** Advances by real elapsed seconds; returns how many fixed steps ran. */
  advance(elapsedSeconds: number): number {
    if (this.paused || !(elapsedSeconds > 0)) return 0;
    this.accumulator += Math.min(elapsedSeconds, this.maxFrameDelta);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxStepsPerFrame) {
      this.stepFn(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= this.maxStepsPerFrame) this.accumulator = 0;
    return steps;
  }

  /** Interpolation factor between the previous and current step, for smooth rendering. */
  alpha(): number {
    return this.paused ? 1 : Math.min(1, this.accumulator / this.dt);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.accumulator = 0;
  }

  isPaused(): boolean {
    return this.paused;
  }
}
