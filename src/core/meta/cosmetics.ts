/**
 * Cosmetic rewards. They are purely visual descriptors interpreted by the renderer: there are no
 * fields that could influence physics, hitboxes, sizes, speed, scoring, powers or difficulty, and
 * the simulation never receives cosmetic data.
 */
export const COSMETIC_CATEGORIES = ['ball', 'paddle', 'trail', 'burst'] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];

export type BallSkin = 'classic' | 'ring' | 'star' | 'core' | 'gem';
export type PaddleSkin = 'classic' | 'striped' | 'chrome' | 'arcade' | 'glitch';
export type TrailStyle = 'none' | 'dots' | 'ribbon' | 'sparkle' | 'rainbow';
export type BurstStyle = 'shards' | 'confetti' | 'pixels' | 'rings' | 'stars';

export interface CosmeticDef {
  id: string;
  category: CosmeticCategory;
  /** Visual variant understood by the renderer. */
  variant: BallSkin | PaddleSkin | TrailStyle | BurstStyle;
  /** Achievement that unlocks it; null = available from the start. */
  unlockedBy: string | null;
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'ball.classic', category: 'ball', variant: 'classic', unlockedBy: null },
  { id: 'ball.ring', category: 'ball', variant: 'ring', unlockedBy: 'cp_first' },
  { id: 'ball.star', category: 'ball', variant: 'star', unlockedBy: 'combo_25' },
  { id: 'ball.core', category: 'ball', variant: 'core', unlockedBy: 'hs_50k' },
  { id: 'ball.gem', category: 'ball', variant: 'gem', unlockedBy: 'special_5' },

  { id: 'paddle.classic', category: 'paddle', variant: 'classic', unlockedBy: null },
  { id: 'paddle.striped', category: 'paddle', variant: 'striped', unlockedBy: 'prog_10' },
  { id: 'paddle.chrome', category: 'paddle', variant: 'chrome', unlockedBy: 'bricks_5000' },
  { id: 'paddle.arcade', category: 'paddle', variant: 'arcade', unlockedBy: 'maze_25' },
  { id: 'paddle.glitch', category: 'paddle', variant: 'glitch', unlockedBy: 'secret_overdrive' },

  { id: 'trail.none', category: 'trail', variant: 'none', unlockedBy: null },
  { id: 'trail.dots', category: 'trail', variant: 'dots', unlockedBy: 'bricks_500' },
  { id: 'trail.ribbon', category: 'trail', variant: 'ribbon', unlockedBy: 'combo_10' },
  { id: 'trail.sparkle', category: 'trail', variant: 'sparkle', unlockedBy: 'pw_multiball' },
  { id: 'trail.rainbow', category: 'trail', variant: 'rainbow', unlockedBy: 'prog_50' },

  { id: 'burst.shards', category: 'burst', variant: 'shards', unlockedBy: null },
  { id: 'burst.confetti', category: 'burst', variant: 'confetti', unlockedBy: 'special_1' },
  { id: 'burst.pixels', category: 'burst', variant: 'pixels', unlockedBy: 'hs_10k' },
  { id: 'burst.rings', category: 'burst', variant: 'rings', unlockedBy: 'pw_explosion' },
  { id: 'burst.stars', category: 'burst', variant: 'stars', unlockedBy: 'secret_flawless' },
];

export type CosmeticSelection = Record<CosmeticCategory, string>;

export const DEFAULT_COSMETICS: CosmeticSelection = {
  ball: 'ball.classic',
  paddle: 'paddle.classic',
  trail: 'trail.none',
  burst: 'burst.shards',
};

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function defaultUnlockedCosmetics(): string[] {
  return COSMETICS.filter((c) => c.unlockedBy === null).map((c) => c.id);
}

export function cosmeticsUnlockedBy(achievementId: string): CosmeticDef[] {
  return COSMETICS.filter((c) => c.unlockedBy === achievementId);
}

/** Returns a valid selection: unknown or locked items fall back to the defaults. */
export function sanitizeSelection(selection: Partial<Record<string, unknown>>, unlocked: readonly string[]): CosmeticSelection {
  const out = { ...DEFAULT_COSMETICS };
  for (const category of Object.keys(DEFAULT_COSMETICS) as CosmeticCategory[]) {
    const id = selection[category];
    const def = typeof id === 'string' ? cosmeticById(id) : undefined;
    if (def && def.category === category && unlocked.includes(def.id)) out[category] = def.id;
  }
  return out;
}
