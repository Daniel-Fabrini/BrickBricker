/** Minimal async key-value storage abstraction so persistence works on web, native and in tests. */
export interface KeyValueStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly name = 'memory';
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class LocalStorageStore implements KeyValueStore {
  readonly name = 'localStorage';

  static available(): boolean {
    try {
      const k = '__bbi_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return window.localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }
}

/**
 * Writes to a primary store and mirrors to a secondary one (e.g. Capacitor Preferences +
 * localStorage). Reads prefer the primary and fall back to the mirror.
 */
export class MirroredStore implements KeyValueStore {
  readonly name: string;

  constructor(
    private readonly primary: KeyValueStore,
    private readonly mirror: KeyValueStore,
  ) {
    this.name = `${primary.name}+${mirror.name}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.primary.get(key);
      if (value !== null) return value;
    } catch (err) {
      console.warn('[storage] primary read failed', err);
    }
    return this.mirror.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    const results = await Promise.allSettled([this.primary.set(key, value), this.mirror.set(key, value)]);
    if (results.every((r) => r.status === 'rejected')) {
      throw new Error('All storage backends failed to write');
    }
  }

  async remove(key: string): Promise<void> {
    await Promise.allSettled([this.primary.remove(key), this.mirror.remove(key)]);
  }
}
