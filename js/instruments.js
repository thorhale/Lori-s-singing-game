// Reference-tone playback: a real sampled grand piano plus two synthesized
// alternatives (warm electric piano, soft flute).

import { midiToFreq } from './notes.js';

// Salamander Grand Piano samples (CC-BY Alexander Holm), spaced a minor third
// apart so no note is shifted more than 1.5 semitones from a real recording.
const PIANO_SAMPLES = {
  42: 'Fs2', 45: 'A2', 48: 'C3', 51: 'Ds3', 54: 'Fs3', 57: 'A3',
  60: 'C4', 63: 'Ds4', 66: 'Fs4', 69: 'A4', 72: 'C5', 75: 'Ds5',
  78: 'Fs5', 81: 'A5', 84: 'C6',
};

export const INSTRUMENT_INFO = [
  { id: 'piano', label: 'Grand piano', emoji: '🎹' },
  { id: 'epiano', label: 'Warm e-piano', emoji: '🎛️' },
  { id: 'flute', label: 'Soft flute', emoji: '🪈' },
];

export class Instruments {
  constructor(audioContext, { sampleBase = 'assets/samples/' } = {}) {
    this.ctx = audioContext;
    this.sampleBase = sampleBase;
    this.buffers = new Map(); // sample midi -> AudioBuffer
    this.master = audioContext.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(audioContext.destination);
    this._loading = null;
  }

  loadPiano() {
    this._loading ??= Promise.all(
      Object.entries(PIANO_SAMPLES).map(async ([midi, name]) => {
        const res = await fetch(this.sampleBase + name + '.mp3');
        const data = await res.arrayBuffer();
        this.buffers.set(Number(midi), await this.ctx.decodeAudioData(data));
      }),
    );
    return this._loading;
  }

  // Plays the given MIDI note on the chosen instrument. Returns duration (s).
  play(midi, instrument = 'piano', duration = 1.6) {
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (instrument === 'piano' && this.buffers.size > 0) {
      this._playPiano(midi, duration);
    } else if (instrument === 'flute') {
      this._playFlute(midi, duration);
    } else {
      this._playEPiano(midi, duration);
    }
    return duration;
  }

  // Short two-note sparkle for a correctly sung note.
  chime() {
    const t = this.ctx.currentTime;
    [[1319, 0], [1760, 0.09]].forEach(([f, dt]) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.12, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.35);
      osc.connect(g).connect(this.master);
      osc.start(t + dt);
      osc.stop(t + dt + 0.4);
    });
  }

  _playPiano(midi, duration) {
    let best = null;
    for (const m of this.buffers.keys()) {
      if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(best);
    src.playbackRate.value = Math.pow(2, (midi - best) / 12);
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(1, t);
    g.gain.setValueAtTime(1, t + duration);
    g.gain.linearRampToValueAtTime(0, t + duration + 0.25);
    src.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.3);
  }

  _playEPiano(midi, duration) {
    const f = midiToFreq(midi);
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    // A few decaying harmonics with a hint of detune gives a Rhodes-ish tone.
    const partials = [
      { mult: 1, amp: 0.55, decay: duration },
      { mult: 1.001, amp: 0.2, decay: duration },
      { mult: 2, amp: 0.14, decay: duration * 0.6 },
      { mult: 3, amp: 0.05, decay: duration * 0.35 },
      { mult: 4.05, amp: 0.025, decay: duration * 0.2 },
    ];
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * p.mult;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.amp, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + duration + 0.3);
    }
    out.gain.setValueAtTime(1, t);
    out.gain.setValueAtTime(1, t + duration);
    out.gain.linearRampToValueAtTime(0, t + duration + 0.25);
  }

  _playFlute(midi, duration) {
    const f = midiToFreq(midi);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const vibrato = this.ctx.createOscillator();
    vibrato.frequency.value = 5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = f * 0.004; // ~7 cents of gentle vibrato
    vibrato.connect(vibGain).connect(osc.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.09);
    g.gain.setValueAtTime(0.35, t + duration - 0.1);
    g.gain.linearRampToValueAtTime(0, t + duration + 0.15);
    osc.connect(g).connect(this.master);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + duration + 0.2);
    vibrato.stop(t + duration + 0.2);
  }
}
