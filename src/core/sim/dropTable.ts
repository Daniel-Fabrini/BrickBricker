import { POWERS } from '../../config/tuning';
import type { Rng } from '../rng';
import type { CollectibleKind } from '../types';

export interface DropContext {
  /** Whether the current mode uses lives (High Score). Progression never drops Extra Life. */
  extraLifeEnabled: boolean;
  /** True when lives are already at the cap; Extra Life is then removed from the table. */
  livesAtCap: boolean;
  extraLifeDropsThisLevel: number;
}

export function dropWeights(ctx: DropContext): { value: CollectibleKind; weight: number }[] {
  const allowExtraLife =
    ctx.extraLifeEnabled && !ctx.livesAtCap && ctx.extraLifeDropsThisLevel < POWERS.maxExtraLifeDropsPerLevel;
  return [
    { value: 'multiball', weight: POWERS.weights.multiball },
    { value: 'piercing', weight: POWERS.weights.piercing },
    { value: 'explosion', weight: POWERS.weights.explosion },
    { value: 'extraLife', weight: allowExtraLife ? POWERS.weights.extraLife : 0 },
  ];
}

/** Rolls the drop for a destroyed special brick: null means nothing drops. */
export function rollDrop(rng: Rng, ctx: DropContext, dropChance: number = POWERS.dropChance): CollectibleKind | null {
  if (!rng.chance(dropChance)) return null;
  return rng.weighted(dropWeights(ctx));
}
