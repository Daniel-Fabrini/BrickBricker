import { Preferences } from '@capacitor/preferences';
import { LocalStorageStore, MemoryStore, MirroredStore, type KeyValueStore } from '../persistence/storage';
import { isNative } from './native';

/** Capacitor Preferences (Android SharedPreferences) wrapped as a KeyValueStore. */
class PreferencesStore implements KeyValueStore {
  readonly name = 'preferences';

  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

/**
 * Native: SharedPreferences, mirrored to WebView localStorage as a second copy.
 * Web: localStorage, or memory if storage is blocked (progress then lasts for the session only).
 */
export function createStore(): KeyValueStore {
  const local = LocalStorageStore.available() ? new LocalStorageStore() : null;
  if (isNative()) return local ? new MirroredStore(new PreferencesStore(), local) : new PreferencesStore();
  return local ?? new MemoryStore();
}
