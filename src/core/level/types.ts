import type { DifficultyParams } from '../../config/difficulty';
import type { BrickKind, GameStyle, StaticKind } from '../types';

/** A destructible brick occupying one grid cell. */
export interface BrickDef {
  col: number;
  row: number;
  kind: BrickKind;
  hp: number;
}

/** An indestructible cell: a maze wall or a steel block. Never counts toward completion. */
export interface StaticDef {
  col: number;
  row: number;
  kind: StaticKind;
}

/** A bar moving horizontally back and forth inside an empty lane row. */
export interface SliderDef {
  kind: 'slider';
  row: number;
  widthCells: number;
  /** Travel range of the slider's left edge in world units. */
  minX: number;
  maxX: number;
  speed: number;
  /** Starting phase of the ping-pong cycle in [0, 1). */
  phase: number;
}

/** A barrier that periodically opens and closes, always with a visible warning before closing. */
export interface GateDef {
  kind: 'gate';
  col: number;
  row: number;
  w: number;
  h: number;
  openTime: number;
  closedTime: number;
  /** Time offset into the cycle at t = 0 (seconds). */
  offset: number;
}

export type ObstacleDef = SliderDef | GateDef;

export interface LevelDefinition {
  /** Stable identifier, e.g. "maze:23:123456". */
  key: string;
  number: number;
  style: GameStyle;
  seed: number;
  /** Id of the hand-designed special level, or null for generated levels. */
  special: string | null;
  /** Number of grid rows the layout uses. */
  rows: number;
  bricks: BrickDef[];
  statics: StaticDef[];
  obstacles: ObstacleDef[];
  ballSpeed: number;
  /** Optional formation/template names, useful for debugging and tests. */
  formation?: string;
  template?: string;
  difficulty?: DifficultyParams;
}
