/** Shared domain types used by the pure gameplay core and every layer above it. */

export const GAME_MODES = ['progression', 'highscore'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const GAME_STYLES = ['classic', 'maze'] as const;
export type GameStyle = (typeof GAME_STYLES)[number];

export const THEME_IDS = ['retro', 'neon'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Powers that can be stored in the two-slot inventory and activated manually. */
export const POWER_TYPES = ['multiball', 'piercing', 'explosion'] as const;
export type PowerType = (typeof POWER_TYPES)[number];

/** Everything that can fall from a special brick. Extra Life is never stored in the inventory. */
export const COLLECTIBLE_KINDS = ['multiball', 'piercing', 'explosion', 'extraLife'] as const;
export type CollectibleKind = (typeof COLLECTIBLE_KINDS)[number];

/** Destructible brick kinds (they all count toward level completion). */
export const BRICK_KINDS = ['standard', 'resistant', 'special'] as const;
export type BrickKind = (typeof BRICK_KINDS)[number];

/** Kinds of static, indestructible cells (never counted toward completion). */
export const STATIC_KINDS = ['wall', 'steel'] as const;
export type StaticKind = (typeof STATIC_KINDS)[number];

export type InventorySlots = (PowerType | null)[];

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && (GAME_MODES as readonly string[]).includes(value);
}

export function isGameStyle(value: unknown): value is GameStyle {
  return typeof value === 'string' && (GAME_STYLES as readonly string[]).includes(value);
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function isPowerType(value: unknown): value is PowerType {
  return typeof value === 'string' && (POWER_TYPES as readonly string[]).includes(value);
}
