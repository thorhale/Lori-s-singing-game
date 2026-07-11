// Microphone capture and pitch detection.
//
// Detection is time-domain autocorrelation (ACF2+) with parabolic peak
// interpolation, which is robust for solo voice. Frames are gated by RMS so
// silence and breath noise don't register, and the reported pitch is a median
// over recent frames to suppress octave flickers.

import { freqToMidiFloat } from './notes.js';

const MIN_FREQ = 70;    // below a low male voice
const MAX_FREQ = 1200;  // above a high soprano
const RMS_GATE = 0.012;
const MEDIAN_WINDOW = 5;

function autoCorrelate(buf, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < RMS_GATE) return { freq: null, rms };

  // Trim leading/trailing samples below a threshold relative to the frame,
  // which sharpens the correlation peak on note attacks.
  const thres = 0.2;
  let r1 = 0, r2 = buf.length - 1;
  for (let i = 0; i < buf.length / 2; i++) {
    if (Math.abs(buf[i]) < thres) r1 = i; else break;
  }
  for (let i = 1; i < buf.length / 2; i++) {
    if (Math.abs(buf[buf.length - i]) < thres) r2 = buf.length - i; else break;
  }
  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;
  if (n < 2 * Math.floor(sampleRate / MAX_FREQ)) return { freq: null, rms };

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_FREQ));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const c = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // Skip the zero-lag peak, then take the highest peak after the first dip.
  let d = minLag;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let lag = d; lag <= maxLag; lag++) {
    if (c[lag] > maxval) { maxval = c[lag]; maxpos = lag; }
  }
  if (maxpos <= 0 || maxval < 0.3 * c[0]) return { freq: null, rms };

  // Parabolic interpolation around the peak for sub-sample precision.
  let T0 = maxpos;
  if (T0 > 0 && T0 < maxLag) {
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 -= b / (2 * a);
  }

  const freq = sampleRate / T0;
  if (freq < MIN_FREQ || freq > MAX_FREQ) return { freq: null, rms };
  return { freq, rms };
}

export class PitchEngine {
  constructor(audioContext, { testMode = false } = {}) {
    this.ctx = audioContext;
    this.testMode = testMode;
    this.analyser = null;
    this.stream = null;
    this.testOsc = null;
    this.testGain = null;
    this.buf = null;
    this.recent = [];
    this.listeners = new Set();
    this.running = false;
    this._raf = null;
  }

  // Requests the microphone (or wires up the test oscillator) and starts the
  // analysis loop. Safe to call more than once.
  async start() {
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.buf = new Float32Array(this.analyser.fftSize);

      if (this.testMode) {
        this.testOsc = this.ctx.createOscillator();
        this.testGain = this.ctx.createGain();
        this.testOsc.frequency.value = 220;
        this.testGain.gain.value = 0; // silent until a test sets a frequency
        this.testOsc.connect(this.testGain).connect(this.analyser);
        this.testOsc.start();
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      }
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (!this.running) {
      this.running = true;
      const tick = () => {
        if (!this.running) return;
        this._analyseFrame();
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.recent = [];
  }

  // cb receives {freq, midiFloat, rms} while voiced, or null while silent.
  onFrame(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setTestTone(freq, volume = 0.5) {
    if (!this.testGain) return;
    const t = this.ctx.currentTime;
    if (freq) this.testOsc.frequency.setValueAtTime(freq, t);
    this.testGain.gain.setValueAtTime(freq ? volume : 0, t);
  }

  _analyseFrame() {
    this.analyser.getFloatTimeDomainData(this.buf);
    const { freq, rms } = autoCorrelate(this.buf, this.ctx.sampleRate);

    let result = null;
    if (freq) {
      this.recent.push(freqToMidiFloat(freq));
      if (this.recent.length > MEDIAN_WINDOW) this.recent.shift();
      const sorted = [...this.recent].sort((a, b) => a - b);
      const midiFloat = sorted[Math.floor(sorted.length / 2)];
      result = { freq, midiFloat, rms };
    } else {
      this.recent.length = 0;
    }
    for (const cb of this.listeners) cb(result);
  }
}
