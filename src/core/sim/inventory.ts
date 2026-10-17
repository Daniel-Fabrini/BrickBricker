import { POWERS } from '../../config/tuning';
import type { InventorySlots, PowerType } from '../types';

/**
 * Two-slot power inventory. Powers are only ever added when a collectible is physically caught,
 * never overwrite an occupied slot, and are only removed by an explicit activation.
 */
export function emptyInventory(): InventorySlots {
  return new Array<PowerType | null>(POWERS.inventorySlots).fill(null);
}

export function normalizeInventory(slots: readonly (PowerType | null)[] | null | undefined): InventorySlots {
  const out = emptyInventory();
  if (!slots) return out;
  for (let i = 0; i < out.length; i++) out[i] = slots[i] ?? null;
  return out;
}

/** Stores a power in the first free slot. Returns the slot index, or -1 when the inventory is full. */
export function inventoryAdd(slots: InventorySlots, power: PowerType): number {
  const index = slots.indexOf(null);
  if (index < 0) return -1;
  slots[index] = power;
  return index;
}

/** Removes and returns the power in a slot (null when empty or out of range). */
export function inventoryTake(slots: InventorySlots, index: number): PowerType | null {
  if (index < 0 || index >= slots.length) return null;
  const power = slots[index] ?? null;
  slots[index] = null;
  return power;
}

export function inventoryIsFull(slots: InventorySlots): boolean {
  return !slots.includes(null);
}
