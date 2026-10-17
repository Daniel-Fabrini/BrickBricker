/** Synthesised sound-effect recipes for both themes. Frequencies in Hz, times in seconds. */
export interface Voice {
  wave: OscillatorType | 'noise' | 'pulse';
  freq: number;
  freqEnd?: number;
  duration: number;
  gain: number;
  attack?: number;
  delay?: number;
  detune?: number;
  echo?: boolean;
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
}

export type SfxName =
  | 'paddle'
  | 'wall'
  | 'brickHit'
  | 'brickBreak'
  | 'specialBreak'
  | 'combo'
  | 'powerDrop'
  | 'powerCatch'
  | 'powerActivate'
  | 'inventoryFull'
  | 'multiball'
  | 'piercing'
  | 'explosion'
  | 'lifeLost'
  | 'extraLife'
  | 'serve'
  | 'checkpoint'
  | 'levelComplete'
  | 'newRecord'
  | 'gameOver'
  | 'attemptFailed'
  | 'achievement'
  | 'uiTap'
  | 'uiBack';

interface SfxDef {
  minInterval: number;
  priority?: boolean;
  retro(variation: number): Voice[];
  neon(variation: number): Voice[];
}

const semis = (base: number, n: number): number => base * Math.pow(2, n / 12);

function arpeggio(wave: Voice['wave'], base: number, steps: number[], noteLen: number, gain: number, echo = false): Voice[] {
  return steps.map((s, i) => ({ wave, freq: semis(base, s), duration: noteLen * 1.6, gain, delay: i * noteLen, echo }));
}

export const SFX: Record<SfxName, SfxDef> = {
  paddle: {
    minInterval: 0.04,
    retro: () => [{ wave: 'pulse', freq: 440, freqEnd: 520, duration: 0.07, gain: 0.18 }],
    neon: () => [
      { wave: 'sine', freq: 330, freqEnd: 420, duration: 0.12, gain: 0.22 },
      { wave: 'triangle', freq: 660, duration: 0.08, gain: 0.06, echo: true },
    ],
  },
  wall: {
    minInterval: 0.07,
    retro: () => [{ wave: 'triangle', freq: 220, duration: 0.05, gain: 0.12 }],
    neon: () => [{ wave: 'sine', freq: 180, freqEnd: 140, duration: 0.07, gain: 0.1 }],
  },
  brickHit: {
    minInterval: 0.05,
    retro: (v) => [{ wave: 'square', freq: 300 + v * 40, duration: 0.05, gain: 0.12, filter: { type: 'lowpass', freq: 2400 } }],
    neon: (v) => [{ wave: 'triangle', freq: 520 + v * 60, freqEnd: 380, duration: 0.09, gain: 0.14, echo: true }],
  },
  brickBreak: {
    minInterval: 0.035,
    retro: (v) => [
      { wave: 'pulse', freq: semis(660, (v % 12) * 0.5), freqEnd: semis(880, (v % 12) * 0.5), duration: 0.08, gain: 0.14 },
      { wave: 'noise', freq: 0, duration: 0.05, gain: 0.05, filter: { type: 'highpass', freq: 3000 } },
    ],
    neon: (v) => [
      { wave: 'sine', freq: semis(880, (v % 12) * 0.5), freqEnd: semis(1320, (v % 12) * 0.5), duration: 0.14, gain: 0.16, echo: true },
      { wave: 'noise', freq: 0, duration: 0.06, gain: 0.035, filter: { type: 'bandpass', freq: 5200, q: 2 } },
    ],
  },
  specialBreak: {
    minInterval: 0.06,
    retro: () => arpeggio('pulse', 784, [0, 4, 7, 12], 0.04, 0.12),
    neon: () => arpeggio('sine', 988, [0, 7, 12, 19], 0.045, 0.12, true),
  },
  combo: {
    minInterval: 0.15,
    priority: true,
    retro: (v) => arpeggio('pulse', semis(523, Math.min(12, v)), [0, 4, 7], 0.05, 0.12),
    neon: (v) => arpeggio('triangle', semis(659, Math.min(12, v)), [0, 7, 12], 0.06, 0.12, true),
  },
  powerDrop: {
    minInterval: 0.1,
    retro: () => [{ wave: 'triangle', freq: 880, freqEnd: 440, duration: 0.18, gain: 0.12 }],
    neon: () => [{ wave: 'sine', freq: 1320, freqEnd: 660, duration: 0.25, gain: 0.1, echo: true }],
  },
  powerCatch: {
    minInterval: 0.08,
    priority: true,
    retro: () => arpeggio('pulse', 523, [0, 7, 12, 16], 0.045, 0.14),
    neon: () => arpeggio('sine', 659, [0, 5, 12, 17], 0.05, 0.14, true),
  },
  powerActivate: {
    minInterval: 0.1,
    priority: true,
    retro: () => [{ wave: 'square', freq: 220, freqEnd: 880, duration: 0.22, gain: 0.13, filter: { type: 'lowpass', freq: 3000 } }],
    neon: () => [
      { wave: 'sawtooth', freq: 220, freqEnd: 880, duration: 0.3, gain: 0.08, filter: { type: 'lowpass', freq: 600, freqEnd: 5000, q: 6 }, echo: true },
    ],
  },
  inventoryFull: {
    minInterval: 0.15,
    retro: () => [{ wave: 'square', freq: 196, duration: 0.12, gain: 0.1 }],
    neon: () => [{ wave: 'triangle', freq: 233, freqEnd: 196, duration: 0.18, gain: 0.1 }],
  },
  multiball: {
    minInterval: 0.2,
    priority: true,
    retro: () => arpeggio('pulse', 440, [0, 12, 7, 19], 0.05, 0.12),
    neon: () => arpeggio('sine', 523, [0, 12, 19, 24], 0.06, 0.12, true),
  },
  piercing: {
    minInterval: 0.2,
    priority: true,
    retro: () => [{ wave: 'pulse', freq: 1200, freqEnd: 300, duration: 0.3, gain: 0.12 }],
    neon: () => [{ wave: 'sawtooth', freq: 1600, freqEnd: 400, duration: 0.35, gain: 0.07, filter: { type: 'bandpass', freq: 1800, q: 3 }, echo: true }],
  },
  explosion: {
    minInterval: 0.12,
    priority: true,
    retro: () => [
      { wave: 'noise', freq: 0, duration: 0.4, gain: 0.3, filter: { type: 'lowpass', freq: 2200, freqEnd: 200 } },
      { wave: 'square', freq: 110, freqEnd: 40, duration: 0.3, gain: 0.16 },
    ],
    neon: () => [
      { wave: 'noise', freq: 0, duration: 0.55, gain: 0.25, filter: { type: 'lowpass', freq: 3000, freqEnd: 150 } },
      { wave: 'sine', freq: 90, freqEnd: 35, duration: 0.45, gain: 0.35 },
    ],
  },
  lifeLost: {
    minInterval: 0.3,
    priority: true,
    retro: () => arpeggio('square', 392, [0, -3, -7, -12], 0.09, 0.14),
    neon: () => [{ wave: 'sawtooth', freq: 330, freqEnd: 82, duration: 0.6, gain: 0.08, filter: { type: 'lowpass', freq: 1500, freqEnd: 200 } }],
  },
  extraLife: {
    minInterval: 0.3,
    priority: true,
    retro: () => arpeggio('pulse', 523, [0, 4, 7, 12, 16, 19], 0.05, 0.13),
    neon: () => arpeggio('sine', 523, [0, 4, 7, 12, 16, 19, 24], 0.05, 0.12, true),
  },
  serve: {
    minInterval: 0.2,
    retro: () => [{ wave: 'triangle', freq: 660, duration: 0.06, gain: 0.1 }],
    neon: () => [{ wave: 'sine', freq: 880, duration: 0.1, gain: 0.08, echo: true }],
  },
  checkpoint: {
    minInterval: 0.5,
    priority: true,
    retro: () => arpeggio('pulse', 392, [0, 4, 7, 12, 7, 12, 16], 0.07, 0.13),
    neon: () => arpeggio('triangle', 440, [0, 7, 12, 16, 19, 24], 0.08, 0.12, true),
  },
  levelComplete: {
    minInterval: 0.5,
    priority: true,
    retro: () => arpeggio('pulse', 523, [0, 4, 7, 12, 16, 12, 19, 24], 0.065, 0.13),
    neon: () => arpeggio('sine', 523, [0, 4, 7, 11, 12, 16, 19, 24], 0.07, 0.13, true),
  },
  newRecord: {
    minInterval: 0.5,
    priority: true,
    retro: () => arpeggio('pulse', 659, [0, 4, 7, 12, 4, 7, 12, 16, 24], 0.06, 0.13),
    neon: () => arpeggio('triangle', 659, [0, 5, 7, 12, 17, 19, 24], 0.07, 0.13, true),
  },
  gameOver: {
    minInterval: 0.5,
    priority: true,
    retro: () => arpeggio('square', 330, [0, -1, -3, -5, -8, -12], 0.12, 0.13),
    neon: () => arpeggio('sawtooth', 262, [0, -3, -7, -12], 0.16, 0.06, true),
  },
  attemptFailed: {
    minInterval: 0.5,
    priority: true,
    retro: () => arpeggio('square', 294, [0, -2, -5], 0.1, 0.13),
    neon: () => arpeggio('triangle', 294, [0, -5, -12], 0.12, 0.12, true),
  },
  achievement: {
    minInterval: 0.4,
    priority: true,
    retro: () => arpeggio('pulse', 1047, [0, 7, 12], 0.05, 0.1),
    neon: () => arpeggio('sine', 1047, [0, 7, 12, 19], 0.05, 0.1, true),
  },
  uiTap: {
    minInterval: 0.04,
    retro: () => [{ wave: 'pulse', freq: 880, duration: 0.03, gain: 0.08 }],
    neon: () => [{ wave: 'sine', freq: 1200, duration: 0.05, gain: 0.07 }],
  },
  uiBack: {
    minInterval: 0.04,
    retro: () => [{ wave: 'pulse', freq: 587, duration: 0.03, gain: 0.08 }],
    neon: () => [{ wave: 'sine', freq: 800, duration: 0.05, gain: 0.07 }],
  },
};
