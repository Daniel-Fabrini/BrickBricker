import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from './native';

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Short, restrained vibration feedback. Silently ignored when unsupported. */
export function haptic(strength: 'light' | 'medium' | 'heavy'): void {
  if (!enabled) return;
  if (isNative()) {
    const style = strength === 'heavy' ? ImpactStyle.Heavy : strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    void Haptics.impact({ style }).catch(() => undefined);
    return;
  }
  try {
    navigator.vibrate?.(strength === 'heavy' ? 40 : strength === 'medium' ? 20 : 10);
  } catch {
    // Vibration is optional.
  }
}
