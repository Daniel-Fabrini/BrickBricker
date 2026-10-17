import type { ThemeId } from '../core/types';
import type { Voice } from './sfx';

/**
 * Original procedural music. Each track is a 4-bar loop (64 sixteenth steps) built from a chord
 * progression; the "game" intensity adds drums and a lead on top of the calmer "menu" layer.
 * Voice durations are expressed in steps.
 */
export interface MusicTrack {
  bpm: number;
  length: number;
  notesAt(step: number, intensity: 'menu' | 'game'): Voice[];
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// A minor progression: Am - F - C - G (root notes, MIDI).
const ROOTS = [57, 53, 48, 55];
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const RETRO_LEAD = [76, 0, 72, 0, 74, 76, 0, 79, 77, 0, 76, 0, 74, 0, 72, 0];

const retro: MusicTrack = {
  bpm: 132,
  length: 64,
  notesAt(step, intensity) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar] as number[];
    const root = ROOTS[bar] as number;
    const out: Voice[] = [];
    // Triangle bass on eighths with an octave bounce.
    if (s % 2 === 0) out.push({ wave: 'triangle', freq: midi(root - 12 + (s % 4 === 2 ? 12 : 0)), duration: 1.8, gain: 0.22 });
    // Pulse arpeggio.
    const arp = chord[s % 3] as number;
    out.push({ wave: 'pulse', freq: midi(arp + 12), duration: 0.9, gain: intensity === 'menu' ? 0.035 : 0.045 });
    if (intensity === 'game') {
      if (s % 4 === 0) out.push({ wave: 'triangle', freq: 140, freqEnd: 45, duration: 1.2, gain: 0.25 });
      if (s % 4 === 2) out.push({ wave: 'noise', freq: 0, duration: 0.5, gain: 0.05, filter: { type: 'highpass', freq: 6000 } });
      if (s === 4 || s === 12) out.push({ wave: 'noise', freq: 0, duration: 1.2, gain: 0.08, filter: { type: 'bandpass', freq: 1800, q: 0.8 } });
      const lead = RETRO_LEAD[(s + bar * 3) % 16] as number;
      if (lead > 0 && bar % 2 === 1) out.push({ wave: 'square', freq: midi(lead), duration: 1.6, gain: 0.03, filter: { type: 'lowpass', freq: 3200 } });
    }
    return out;
  },
};

const NEON_CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 52, 55, 59],
  [55, 59, 62, 65],
];

const neon: MusicTrack = {
  bpm: 100,
  length: 64,
  notesAt(step, intensity) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = NEON_CHORDS[bar] as number[];
    const root = ROOTS[bar] as number;
    const out: Voice[] = [];
    // Warm detuned pad at the start of each bar.
    if (s === 0) {
      for (const n of chord) {
        out.push({ wave: 'sawtooth', freq: midi(n), duration: 16, gain: 0.018, attack: 0.6, detune: -7, filter: { type: 'lowpass', freq: 900, q: 0.7 } });
        out.push({ wave: 'sawtooth', freq: midi(n), duration: 16, gain: 0.018, attack: 0.6, detune: 7, filter: { type: 'lowpass', freq: 900, q: 0.7 } });
      }
    }
    // Sine arpeggio with echo.
    if (s % 2 === 0) {
      const n = chord[(s / 2) % chord.length] as number;
      out.push({ wave: 'sine', freq: midi(n + 12), duration: 1.6, gain: 0.05, echo: true });
    }
    if (intensity === 'game') {
      if (s % 4 === 0) out.push({ wave: 'sine', freq: 110, freqEnd: 40, duration: 1.5, gain: 0.32 });
      if (s % 2 === 1) out.push({ wave: 'noise', freq: 0, duration: 0.4, gain: 0.025, filter: { type: 'highpass', freq: 8000 } });
      if (s % 4 === 2) out.push({ wave: 'sawtooth', freq: midi(root - 12), duration: 1.6, gain: 0.05, filter: { type: 'lowpass', freq: 500, q: 4 } });
    } else if (s === 0) {
      out.push({ wave: 'sine', freq: midi(root - 12), duration: 14, gain: 0.08, attack: 0.3 });
    }
    return out;
  },
};

export const MUSIC: Record<ThemeId, MusicTrack> = { retro, neon };
