import { BALL, SPEED } from '../../config/tuning';
import type { SpeedState } from './state';

/**
 * Inactivity speed adjustment. If no brick is destroyed for SPEED.inactivityDelay seconds, the
 * ball speeds up smoothly (linear multiplier growth) up to SPEED.maxBoost. Destroying a brick
 * resets the timer and the multiplier then decays smoothly back to 1. The resulting speed is
 * always capped by BALL.absoluteMaxSpeed. Timers only advance when the simulation steps, so
 * pausing freezes them.
 */
export function newSpeedState(): SpeedState {
  return { inactivity: 0, boost: 1 };
}

export function speedTick(state: SpeedState, dt: number): void {
  state.inactivity += dt;
  if (state.inactivity > SPEED.inactivityDelay) {
    state.boost = Math.min(SPEED.maxBoost, state.boost + SPEED.boostRate * dt);
  } else if (state.boost > 1) {
    state.boost = Math.max(1, state.boost - SPEED.recoveryRate * dt);
  }
}

export function speedOnDestroy(state: SpeedState): void {
  state.inactivity = 0;
}

export function effectiveSpeed(levelSpeed: number, state: SpeedState): number {
  return Math.min(BALL.absoluteMaxSpeed, levelSpeed * state.boost);
}
