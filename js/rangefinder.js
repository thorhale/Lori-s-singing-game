// Range-finder logic: detect a note that the singer is holding steadily.

const HOLD_MS = 1200;        // how long a note must be held to lock in
const STABLE_CENTS = 80;     // max wobble allowed across the hold window

export const DEFAULT_RANGE = { low: 55 /* G3 */, high: 74 /* D5 */ };
export const MIN_RANGE_SEMITONES = 7;

// Feed pitch frames in; returns {locked, midi, progress}. `midi` is the live
// median while singing, and the locked value once the hold completes.
export class HeldNoteDetector {
  constructor() {
    this.frames = []; // {t, midiFloat}
    this.locked = null;
  }

  update(frame, now = performance.now()) {
    if (this.locked !== null) {
      return { locked: true, midi: this.locked, progress: 1 };
    }
    if (!frame) {
      this.frames.length = 0;
      return { locked: false, midi: null, progress: 0 };
    }
    this.frames.push({ t: now, midiFloat: frame.midiFloat });
    while (this.frames.length && this.frames[0].t < now - HOLD_MS) {
      this.frames.shift();
    }
    const vals = this.frames.map((f) => f.midiFloat).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const spread = (vals[vals.length - 1] - vals[0]) * 100;
    const heldMs = now - this.frames[0].t;

    if (spread > STABLE_CENTS) {
      // Unstable: keep only the recent tail so a new attempt starts quickly.
      this.frames = this.frames.filter((f) => f.t > now - 250);
      return { locked: false, midi: Math.round(median), progress: 0 };
    }
    if (heldMs >= HOLD_MS && this.frames.length > 10) {
      this.locked = Math.round(median);
      return { locked: true, midi: this.locked, progress: 1 };
    }
    return { locked: false, midi: Math.round(median), progress: heldMs / HOLD_MS };
  }

  reset() {
    this.frames.length = 0;
    this.locked = null;
  }
}

// Turns raw low/high locks into a sensible exercise range: trims one semitone
// off each strained end, and falls back to the default if too narrow.
export function buildRange(lowMidi, highMidi) {
  let low = lowMidi + 1;
  let high = highMidi - 1;
  if (high - low < MIN_RANGE_SEMITONES) {
    const mid = Math.round((low + high) / 2);
    low = mid - Math.ceil(MIN_RANGE_SEMITONES / 2);
    high = mid + Math.ceil(MIN_RANGE_SEMITONES / 2);
  }
  return { low, high };
}
