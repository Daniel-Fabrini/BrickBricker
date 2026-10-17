/**
 * Small deterministic PRNG (mulberry32). The whole state is one uint32, which makes simulation
 * snapshots trivially serialisable and lets tests reproduce drops, serves and generated levels.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Weighted choice; entries with weight <= 0 are never chosen. Returns null if nothing is choosable. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T | null {
    let total = 0;
    for (const entry of entries) if (entry.weight > 0) total += entry.weight;
    if (total <= 0) return null;
    let roll = this.next() * total;
    for (const entry of entries) {
      if (entry.weight <= 0) continue;
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    // Floating point safety: return the last positive entry.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && entry.weight > 0) return entry.value;
    }
    return null;
  }
}

/** FNV-1a hash of the provided parts; used to derive stable seeds such as (style, level). */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
