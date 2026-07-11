// Level definitions, note sequencing, pitch matching, and scoring.

import { isNatural, noteName } from './notes.js';

export const NOTES_PER_ROUND = 10;
export const HOLD_TARGET_MS = 900;   // cumulative in-tune time to win a note
export const TOLERANCES = { easy: 50, normal: 35, strict: 20 };

export const LEVELS = [
  {
    id: 1, name: 'First steps', emoji: '🐣',
    blurb: 'Five easy notes, moving one step at a time.',
    span: 5, accidentals: false, maxLeap: 2,
  },
  {
    id: 2, name: 'Reaching out', emoji: '🌿',
    blurb: 'A whole octave of notes, still stepwise.',
    span: 8, accidentals: false, maxLeap: 2,
  },
  {
    id: 3, name: 'Leaps & bounds', emoji: '🦘',
    blurb: 'Your full range, with skips and jumps.',
    span: Infinity, accidentals: false, maxLeap: 5,
  },
  {
    id: 4, name: 'Sharps & flats', emoji: '✨',
    blurb: 'Everything — including the black keys.',
    span: Infinity, accidentals: true, maxLeap: 5,
  },
];

// The pool of candidate MIDI notes for a level, centered in the singer's range.
export function levelPool(level, lowMidi, highMidi) {
  const all = [];
  for (let m = lowMidi; m <= highMidi; m++) {
    if (level.accidentals || isNatural(m)) all.push(m);
  }
  if (all.length === 0) return [Math.round((lowMidi + highMidi) / 2)];
  if (all.length <= level.span) return all;
  const centerVal = (lowMidi + highMidi) / 2;
  let start = 0;
  let bestDist = Infinity;
  for (let i = 0; i + level.span <= all.length; i++) {
    const mid = (all[i] + all[i + level.span - 1]) / 2;
    const d = Math.abs(mid - centerVal);
    if (d < bestDist) { bestDist = d; start = i; }
  }
  return all.slice(start, start + level.span);
}

// A round of notes: a random walk over the pool with bounded leaps and no
// immediate repeats.
export function makeRound(level, lowMidi, highMidi, count = NOTES_PER_ROUND) {
  const pool = levelPool(level, lowMidi, highMidi);
  const notes = [];
  let idx = Math.floor(pool.length / 2);
  for (let i = 0; i < count; i++) {
    notes.push(pool[idx]);
    if (pool.length === 1) continue;
    const candidates = [];
    for (let j = 0; j < pool.length; j++) {
      if (j === idx) continue;
      if (Math.abs(j - idx) <= level.maxLeap) candidates.push(j);
    }
    idx = candidates[Math.floor(Math.random() * candidates.length)] ?? idx;
  }
  return notes;
}

// Tracks one note attempt: feed pitch frames in, and it accumulates in-tune
// hold time (decaying while off-pitch or silent) until the note is won.
export class NoteMatcher {
  constructor(targetMidi, toleranceCents) {
    this.target = targetMidi;
    this.tol = toleranceCents;
    this.holdMs = 0;
    this.startTime = null;   // first voiced frame, for time-to-hit stats
    this.done = false;
    this._lastT = null;
  }

  // frame: {midiFloat} or null (silence). Returns a UI status object.
  update(frame, now = performance.now()) {
    const dt = this._lastT == null ? 0 : Math.min(100, now - this._lastT);
    this._lastT = now;
    if (this.done) return { state: 'done', progress: 1 };

    if (!frame) {
      this.holdMs = Math.max(0, this.holdMs - dt * 1.5);
      return { state: 'silent', progress: this.holdMs / HOLD_TARGET_MS };
    }

    if (this.startTime === null) this.startTime = now;
    const cents = 100 * (frame.midiFloat - this.target);
    if (Math.abs(cents) <= this.tol) {
      this.holdMs += dt;
      if (this.holdMs >= HOLD_TARGET_MS) {
        this.done = true;
        return { state: 'done', progress: 1, cents };
      }
      return { state: 'good', progress: this.holdMs / HOLD_TARGET_MS, cents };
    }
    this.holdMs = Math.max(0, this.holdMs - dt * 1.5);
    return {
      state: cents > 0 ? 'high' : 'low',
      progress: this.holdMs / HOLD_TARGET_MS,
      cents,
    };
  }

  get timeToHitMs() {
    return this.startTime === null ? null : this._lastT - this.startTime;
  }
}

export function noteScore(timeToHitMs, streak) {
  const speedBonus = timeToHitMs == null
    ? 0
    : Math.max(0, Math.round(50 - timeToHitMs / 200));
  return 100 + speedBonus + Math.min(50, streak * 10);
}

export function starsForRound(results) {
  const hit = results.filter((r) => !r.skipped);
  if (hit.length === 0) return 0;
  const hitRatio = hit.length / results.length;
  const avgTime = hit.reduce((a, r) => a + r.timeMs, 0) / hit.length;
  if (hitRatio === 1 && avgTime < 4000) return 3;
  if (hitRatio >= 0.8) return 2;
  return 1;
}

// Human-friendly summary of which notes went well / need work.
export function summarize(results) {
  const hit = results.filter((r) => !r.skipped);
  const slowest = [...hit].sort((a, b) => b.timeMs - a.timeMs).slice(0, 2);
  return {
    hitCount: hit.length,
    total: results.length,
    avgTimeMs: hit.length
      ? hit.reduce((a, r) => a + r.timeMs, 0) / hit.length
      : null,
    needsWork: slowest.filter((r) => r.timeMs > 5000).map((r) => noteName(r.midi)),
  };
}
