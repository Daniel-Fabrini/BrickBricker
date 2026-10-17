import type { ThemeId } from '../core/types';
import { MUSIC, type MusicTrack } from './music';
import { SFX, type SfxName, type Voice } from './sfx';

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
}

/**
 * Procedural audio: every sound effect and both music tracks are synthesised with the Web Audio
 * API at runtime (no audio files, no licensing concerns). Sounds adapt to the active theme:
 * Retro uses square/triangle/noise chiptune voices, Neon uses filtered saw/sine voices with echo.
 *
 * Repetition control: each effect has a minimum retrigger interval and the engine caps the
 * number of simultaneous voices, so multiball rallies never turn into noise.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private echo: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private pulse: PeriodicWave | null = null;
  private theme: ThemeId = 'neon';
  private settings: AudioSettings = { musicVolume: 0.6, sfxVolume: 0.8, musicEnabled: true, sfxEnabled: true };
  private lastPlayed = new Map<SfxName, number>();
  private activeVoices = 0;
  private readonly maxVoices = 12;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private intensity: 'menu' | 'game' = 'menu';
  private ducked = false;
  private suspendedByApp = false;

  /** Must be called from a user gesture on mobile browsers. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended' && !this.suspendedByApp) {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  private init(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      // A short feedback echo used by Neon voices.
      this.echo = ctx.createDelay(1);
      this.echo.delayTime.value = 0.18;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      this.echo.connect(feedback);
      feedback.connect(this.echo);
      this.echo.connect(wet);
      wet.connect(this.master);
      const length = ctx.sampleRate * 0.5;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
      // 25% duty pulse wave for authentic chiptune leads.
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
      this.pulse = ctx.createPeriodicWave(real, imag);
      this.applyVolumes();
    } catch (err) {
      console.warn('[audio] unavailable', err);
      this.ctx = null;
    }
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
  }

  configure(settings: AudioSettings): void {
    this.settings = { ...settings };
    this.applyVolumes();
    if (!settings.musicEnabled) this.stopMusic();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const music = this.settings.musicEnabled ? this.settings.musicVolume * (this.ducked ? 0.25 : 1) * 0.5 : 0;
    const sfx = this.settings.sfxEnabled ? this.settings.sfxVolume : 0;
    this.musicBus.gain.setTargetAtTime(music, now, 0.08);
    this.sfxBus.gain.setTargetAtTime(this.ducked ? 0 : sfx, now, 0.03);
  }

  /** Pause: music is ducked and gameplay effects are muted. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyVolumes();
  }

  /** App backgrounded / foregrounded. */
  setAppActive(active: boolean): void {
    if (!this.ctx) return;
    this.suspendedByApp = !active;
    if (active) void this.ctx.resume().catch(() => undefined);
    else void this.ctx.suspend().catch(() => undefined);
  }

  play(name: SfxName, variation = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.settings.sfxEnabled || this.ducked || ctx.state !== 'running') return;
    const def = SFX[name];
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < def.minInterval) return;
    if (this.activeVoices >= this.maxVoices && !def.priority) return;
    this.lastPlayed.set(name, now);
    const voices = def[this.theme](variation);
    for (const v of voices) this.voice(v, now);
  }

  private voice(v: Voice, start: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t0 = start + (v.delay ?? 0);
    const end = t0 + v.duration;
    const gain = ctx.createGain();
    const peak = v.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (v.attack ?? 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let source: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      source = src;
    } else {
      const osc = ctx.createOscillator();
      if (v.wave === 'pulse' && this.pulse) osc.setPeriodicWave(this.pulse);
      else osc.type = v.wave === 'pulse' ? 'square' : v.wave;
      osc.frequency.setValueAtTime(v.freq, t0);
      if (v.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.freqEnd), end);
      if (v.detune) osc.detune.value = v.detune;
      source = osc;
    }
    let node: AudioNode = source;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.setValueAtTime(v.filter.freq, t0);
      if (v.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(v.filter.freqEnd, end);
      f.Q.value = v.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.sfxBus);
    if (v.echo && this.echo) gain.connect(this.echo);
    this.activeVoices++;
    source.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      gain.disconnect();
    };
    source.start(t0);
    source.stop(end + 0.02);
  }

  // ------------------------------------------------------------------ music

  startMusic(intensity: 'menu' | 'game'): void {
    this.intensity = intensity;
    if (!this.ctx || !this.settings.musicEnabled) return;
    if (this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 40);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusicIntensity(intensity: 'menu' | 'game'): void {
    this.intensity = intensity;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    const track: MusicTrack = MUSIC[this.theme];
    const stepDur = 60 / track.bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      for (const note of track.notesAt(this.step, this.intensity)) this.musicVoice(note, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % track.length;
    }
  }

  private musicVoice(v: Voice, t0: number, stepDur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const end = t0 + v.duration * stepDur;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v.gain, t0 + (v.attack ?? 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let source: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      source = src;
    } else {
      const osc = ctx.createOscillator();
      if (v.wave === 'pulse' && this.pulse) osc.setPeriodicWave(this.pulse);
      else osc.type = v.wave === 'pulse' ? 'square' : v.wave;
      osc.frequency.setValueAtTime(v.freq, t0);
      if (v.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.freqEnd), end);
      if (v.detune) osc.detune.value = v.detune;
      source = osc;
    }
    let node: AudioNode = source;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.frequency.value = v.filter.freq;
      f.Q.value = v.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.musicBus);
    if (v.echo && this.echo) gain.connect(this.echo);
    source.onended = () => gain.disconnect();
    source.start(t0);
    source.stop(end + 0.02);
  }
}
