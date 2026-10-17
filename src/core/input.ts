import { INPUT, PADDLE, WORLD } from '../config/tuning';
import { clamp } from './math';

export type ControlMode = 'direct' | 'relative';

export interface ControlOptions {
  mode: ControlMode;
  /** Control assistance: edge mapping so the finger never has to reach the screen edge. */
  assist: boolean;
  /** Accessibility: steadier, more forgiving control (larger margins, tremor filter). */
  tolerant: boolean;
}

/**
 * Converts horizontal touch positions into paddle targets. Positions are normalised to [0, 1]
 * across the touch surface, so the paddle follows a swipe anywhere in the play area: the player
 * never needs to touch the paddle itself.
 */
export class PaddleInputMapper {
  private anchorInput = 0;
  private anchorPaddle = WORLD.width / 2;
  private lastTarget: number | null = null;
  private active = false;

  constructor(private options: ControlOptions) {}

  setOptions(options: ControlOptions): void {
    this.options = options;
  }

  get isActive(): boolean {
    return this.active;
  }

  down(nx: number, paddleX: number): number | null {
    this.active = true;
    this.anchorInput = nx;
    this.anchorPaddle = paddleX;
    this.lastTarget = null;
    return this.options.mode === 'direct' ? this.emit(this.directTarget(nx)) : null;
  }

  move(nx: number): number | null {
    if (!this.active) return null;
    if (this.options.mode === 'direct') return this.emit(this.directTarget(nx));
    const sensitivity = this.options.tolerant ? INPUT.tolerantRelativeSensitivity : INPUT.relativeSensitivity;
    return this.emit(this.anchorPaddle + (nx - this.anchorInput) * WORLD.width * sensitivity);
  }

  up(): void {
    this.active = false;
  }

  /** Maps a normalised touch x to a world x, applying the edge-assist margin. */
  directTarget(nx: number): number {
    const half = PADDLE.width / 2;
    if (!this.options.assist && !this.options.tolerant) return clamp(nx * WORLD.width, half, WORLD.width - half);
    const margin = this.options.tolerant ? INPUT.tolerantEdgeMargin : INPUT.edgeMargin;
    const t = clamp((nx - margin) / (1 - 2 * margin), 0, 1);
    return half + t * (WORLD.width - 2 * half);
  }

  private emit(target: number): number | null {
    const half = PADDLE.width / 2;
    const clamped = clamp(target, half, WORLD.width - half);
    if (this.options.tolerant && this.lastTarget !== null && Math.abs(clamped - this.lastTarget) < INPUT.tolerantDeadZone) {
      return null;
    }
    this.lastTarget = clamped;
    return clamped;
  }
}
