import { hashSeed } from '../core/rng';
import { migrate } from './migrations';
import { defaultSaveData, type LanguageCode, type SaveData } from './schema';
import type { KeyValueStore } from './storage';
import { sanitizeSaveData } from './validate';

export const SAVE_KEYS = {
  main: 'bbi.save',
  backup: 'bbi.save.backup',
  corrupt: 'bbi.save.corrupt',
} as const;

const FORMAT = 'bbi-save';

interface Envelope {
  format: typeof FORMAT;
  checksum: number;
  data: unknown;
}

export type LoadOutcome = 'fresh' | 'loaded' | 'migrated' | 'restoredBackup' | 'reset';

export interface LoadResult {
  data: SaveData;
  outcome: LoadOutcome;
  /** True if an invalid unfinished session had to be discarded. */
  sessionDropped: boolean;
}

function checksum(json: string): number {
  return hashSeed(json);
}

export function encodeSave(data: SaveData): string {
  const json = JSON.stringify(data);
  return JSON.stringify({ format: FORMAT, checksum: checksum(json), data } satisfies Envelope);
}

/** Parses and verifies an envelope; returns null on any corruption. */
export function decodeSave(raw: string | null): unknown {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (parsed.format !== FORMAT || typeof parsed.checksum !== 'number') return null;
    if (checksum(JSON.stringify(parsed.data)) !== parsed.checksum) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads and saves the single versioned save document.
 *  - Writes are serialised and coalesced; the newest document always wins.
 *  - Every write is one atomic key update. The previous good document is kept as a backup.
 *  - On load, a corrupted main save falls back to the backup; if both are unusable the game starts
 *    fresh and keeps the corrupted text under a separate key for diagnosis.
 */
export class SaveManager {
  private writing: Promise<void> = Promise.resolve();
  private pending: SaveData | null = null;
  private lastWritten: string | null = null;
  private writeCount = 0;

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get writes(): number {
    return this.writeCount;
  }

  async load(fallbackLanguage: LanguageCode): Promise<LoadResult> {
    const mainRaw = await this.safeGet(SAVE_KEYS.main);
    const main = decodeSave(mainRaw);
    if (main !== null) {
      const result = this.interpret(main, fallbackLanguage);
      if (result) {
        this.lastWritten = mainRaw;
        return result;
      }
    }
    const backupRaw = await this.safeGet(SAVE_KEYS.backup);
    const backup = decodeSave(backupRaw);
    if (backup !== null) {
      const result = this.interpret(backup, fallbackLanguage);
      if (result) {
        if (mainRaw) await this.safeSet(SAVE_KEYS.corrupt, mainRaw);
        this.lastWritten = backupRaw;
        return { ...result, outcome: 'restoredBackup' };
      }
    }
    const data = defaultSaveData(fallbackLanguage, this.now());
    if (mainRaw) {
      await this.safeSet(SAVE_KEYS.corrupt, mainRaw);
      return { data, outcome: 'reset', sessionDropped: false };
    }
    return { data, outcome: 'fresh', sessionDropped: false };
  }

  private interpret(raw: unknown, fallbackLanguage: LanguageCode): LoadResult | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const migration = migrate(raw);
    const { data, sessionDropped } = sanitizeSaveData(migration.doc, fallbackLanguage, this.now());
    return { data, outcome: migration.migrated ? 'migrated' : 'loaded', sessionDropped };
  }

  /** Queues a write of the whole document. Resolves when this (or a newer) document is stored. */
  save(data: SaveData): Promise<void> {
    this.pending = { ...data, savedAt: this.now() };
    this.writing = this.writing.then(() => this.drain());
    return this.writing;
  }

  /** Waits for every queued write. */
  flush(): Promise<void> {
    return this.writing;
  }

  private async drain(): Promise<void> {
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    const encoded = encodeSave(next);
    try {
      if (this.lastWritten && this.lastWritten !== encoded) await this.store.set(SAVE_KEYS.backup, this.lastWritten);
      await this.store.set(SAVE_KEYS.main, encoded);
      this.lastWritten = encoded;
      this.writeCount++;
    } catch (err) {
      console.error('[save] write failed', err);
    }
  }

  private async safeGet(key: string): Promise<string | null> {
    try {
      return await this.store.get(key);
    } catch (err) {
      console.warn('[save] read failed', key, err);
      return null;
    }
  }

  private async safeSet(key: string, value: string): Promise<void> {
    try {
      await this.store.set(key, value);
    } catch (err) {
      console.warn('[save] write failed', key, err);
    }
  }
}
