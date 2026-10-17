import type { BrickKind, CollectibleKind, PowerType } from '../types';

export type DamageCause = 'ball' | 'piercing' | 'explosion' | 'debug';

/**
 * Events emitted by the simulation. They are the only channel from gameplay rules to rendering,
 * audio, statistics and achievements, so every state change is observed exactly once.
 */
export type SimEvent =
  | { type: 'serve'; ballId: number }
  | { type: 'paddleHit'; ballId: number; x: number; offset: number }
  | { type: 'wallHit'; ballId: number; x: number; y: number; kind: 'field' | 'wall' | 'steel' | 'obstacle' }
  | { type: 'brickDamaged'; brickId: number; kind: BrickKind; hp: number; maxHp: number; x: number; y: number; points: number; cause: DamageCause }
  | {
      type: 'brickDestroyed';
      brickId: number;
      kind: BrickKind;
      maxHp: number;
      x: number;
      y: number;
      points: number;
      cause: DamageCause;
      chain: number;
      multiplier: number;
      remaining: number;
    }
  | { type: 'comboUp'; chain: number; multiplier: number }
  | { type: 'comboEnd'; chain: number }
  | { type: 'burst'; count: number; bonus: number }
  | { type: 'collectibleSpawned'; id: number; kind: CollectibleKind; x: number; y: number }
  | { type: 'powerCaught'; id: number; power: PowerType; slot: number }
  | { type: 'inventoryFull'; id: number; power: PowerType; points: number }
  | { type: 'extraLifeCaught'; id: number; lives: number; capped: boolean; points: number }
  | { type: 'collectibleMissed'; id: number; kind: CollectibleKind }
  | { type: 'collectiblesDiscarded'; count: number }
  | { type: 'powerActivated'; power: PowerType; slot: number }
  | { type: 'powerRejected'; power: PowerType | null; slot: number; reason: 'notPlaying' | 'empty' | 'maxBalls' | 'maxCharges' }
  | { type: 'multiball'; created: number; total: number }
  | { type: 'piercingEnded'; kills: number }
  | { type: 'explosion'; x: number; y: number; destroyed: number; damaged: number }
  | { type: 'ballLost'; ballId: number; remaining: number }
  | { type: 'lifeLost'; lives: number }
  | { type: 'speedBoost'; boost: number }
  | { type: 'ballRescued'; ballId: number }
  | { type: 'levelComplete'; bonus: number; score: number }
  | { type: 'attemptFailed' }
  | { type: 'runOver'; score: number };

export type SimEventType = SimEvent['type'];
