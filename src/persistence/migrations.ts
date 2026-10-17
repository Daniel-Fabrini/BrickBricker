import { SAVE_VERSION } from './schema';
import { isDict } from './validate';

/**
 * Save migrations. Each entry upgrades a document from version N to N + 1. Version 0 is the
 * unversioned pre-release prototype layout ({ settings, bestScore, bestLevel, stats }). Documents
 * from a NEWER app version are loaded best-effort (unknown fields are ignored by sanitisation).
 */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  0: (doc) => {
    const bestScore = typeof doc.bestScore === 'number' ? doc.bestScore : 0;
    const bestLevel = typeof doc.bestLevel === 'number' ? doc.bestLevel : 0;
    const profile = isDict(doc.profile) ? doc.profile : {};
    return {
      version: 1,
      savedAt: doc.savedAt,
      settings: doc.settings,
      profile: {
        ...profile,
        stats: profile.stats ?? doc.stats,
        highScores: profile.highScores ?? { classic: { score: bestScore, level: 0, date: 0 }, maze: { score: 0, level: 0, date: 0 } },
        progression: profile.progression ?? {
          classic: { bestLevel, highestCheckpoint: bestLevel - (bestLevel % 5), checkpoints: {} },
          maze: { bestLevel: 0, highestCheckpoint: 0, checkpoints: {} },
        },
      },
      // Sessions from older layouts are never resumed.
      session: null,
    };
  },
};

export interface MigrationResult {
  doc: Record<string, unknown>;
  fromVersion: number;
  migrated: boolean;
  newerThanApp: boolean;
}

export function migrate(raw: unknown): MigrationResult {
  let doc: Record<string, unknown> = isDict(raw) ? { ...raw } : {};
  const declared = typeof doc.version === 'number' && Number.isInteger(doc.version) ? doc.version : 0;
  if (declared > SAVE_VERSION) {
    return { doc, fromVersion: declared, migrated: false, newerThanApp: true };
  }
  let version = declared;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    doc = step(doc);
    version += 1;
  }
  return { doc, fromVersion: declared, migrated: declared !== SAVE_VERSION, newerThanApp: false };
}
