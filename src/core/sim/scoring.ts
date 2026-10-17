import { SCORING } from '../../config/tuning';
import type { BrickKind } from '../types';
import type { ComboState } from './state';

/**
 * Arcade scoring rules (all values in SCORING):
 *  - destroying a brick: base value x level multiplier x combo multiplier (+ power and burst bonuses)
 *  - a hit that only damages a resistant brick: a small flat amount, never multiplied, so repeated
 *    hits cannot be farmed (a brick can only be hit maxHp - 1 times before it breaks)
 */

export function brickBaseValue(kind: BrickKind, maxHp: number): number {
  switch (kind) {
    case 'standard':
      return SCORING.standardBase;
    case 'resistant':
      return SCORING.resistantBasePerHp * maxHp;
    case 'special':
      return SCORING.specialBase;
  }
}

export function levelMultiplier(level: number): number {
  return Math.min(SCORING.levelBonusMax, 1 + SCORING.levelBonusPerLevel * Math.max(0, level - 1));
}

export function comboMultiplier(chain: number): number {
  if (chain <= 0) return 1;
  const steps = Math.floor(chain / SCORING.comboStep);
  return Math.min(SCORING.comboMaxMultiplier, 1 + steps * SCORING.comboStepMultiplier);
}

export function newCombo(): ComboState {
  return { chain: 0, timer: 0, best: 0 };
}

/** Registers a destruction and returns the new chain length. */
export function comboRegister(combo: ComboState): number {
  combo.chain += 1;
  combo.timer = SCORING.comboWindow;
  if (combo.chain > combo.best) combo.best = combo.chain;
  return combo.chain;
}

/** Advances the combo timer. Returns the chain that just ended, or 0 if the combo is still alive. */
export function comboTick(combo: ComboState, dt: number): number {
  if (combo.chain === 0) return 0;
  combo.timer -= dt;
  if (combo.timer > 0) return 0;
  const ended = combo.chain;
  combo.chain = 0;
  combo.timer = 0;
  return ended;
}

export function comboBreak(combo: ComboState): number {
  const ended = combo.chain;
  combo.chain = 0;
  combo.timer = 0;
  return ended;
}

export function destroyPoints(kind: BrickKind, maxHp: number, level: number, chain: number, byPower: boolean, burstBonus: number): number {
  const base = brickBaseValue(kind, maxHp) * levelMultiplier(level) * comboMultiplier(chain);
  return Math.round(base) + (byPower ? SCORING.powerKillBonus : 0) + burstBonus;
}

/** Burst bonus for a destruction at `now`, given recent destruction times (pruned in place). */
export function burstBonus(recent: number[], now: number): { bonus: number; count: number } {
  while (recent.length > 0 && now - (recent[0] as number) > SCORING.burstWindow) recent.shift();
  recent.push(now);
  const count = recent.length;
  return { bonus: count >= SCORING.burstMin ? SCORING.burstPointsPerBrick : 0, count };
}

export function levelClearBonus(level: number): number {
  return SCORING.levelClearBonusPerLevel * level;
}
