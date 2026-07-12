// Scale and mode definitions plus helpers for building a singable note
// sequence within the player's range.

import { noteName } from './notes.js';

// Each scale is a list of semitone offsets from the root, ending on the octave.
// `category` groups them in the picker; `short` is a one-line description.
export const SCALES = [
  {
    id: 'major', name: 'Major', category: 'Scales',
    short: 'Bright and happy — the classic “do-re-mi”.',
    intervals: [0, 2, 4, 5, 7, 9, 11, 12],
  },
  {
    id: 'natminor', name: 'Natural minor', category: 'Scales',
    short: 'Serious and a little sad.',
    intervals: [0, 2, 3, 5, 7, 8, 10, 12],
  },
  {
    id: 'majpent', name: 'Major pentatonic', category: 'Scales',
    short: 'Five easy notes — almost impossible to sing wrong.',
    intervals: [0, 2, 4, 7, 9, 12],
  },
  {
    id: 'minpent', name: 'Minor pentatonic', category: 'Scales',
    short: 'The sound of blues and rock solos.',
    intervals: [0, 3, 5, 7, 10, 12],
  },
  {
    id: 'harmonic', name: 'Harmonic minor', category: 'Scales',
    short: 'Minor with a dramatic, exotic leap near the top.',
    intervals: [0, 2, 3, 5, 7, 8, 11, 12],
  },
  {
    id: 'melodic', name: 'Melodic minor', category: 'Scales',
    short: 'A smoother minor for climbing upward.',
    intervals: [0, 2, 3, 5, 7, 9, 11, 12],
  },

  {
    id: 'ionian', name: 'Ionian', category: 'The 7 modes',
    short: 'Mode 1 — identical to the major scale. Bright.',
    intervals: [0, 2, 4, 5, 7, 9, 11, 12],
  },
  {
    id: 'dorian', name: 'Dorian', category: 'The 7 modes',
    short: 'Mode 2 — minor, but hopeful and jazzy.',
    intervals: [0, 2, 3, 5, 7, 9, 10, 12],
  },
  {
    id: 'phrygian', name: 'Phrygian', category: 'The 7 modes',
    short: 'Mode 3 — dark, with a Spanish flavor.',
    intervals: [0, 1, 3, 5, 7, 8, 10, 12],
  },
  {
    id: 'lydian', name: 'Lydian', category: 'The 7 modes',
    short: 'Mode 4 — dreamy and floating.',
    intervals: [0, 2, 4, 6, 7, 9, 11, 12],
  },
  {
    id: 'mixolydian', name: 'Mixolydian', category: 'The 7 modes',
    short: 'Mode 5 — major, but bluesy and relaxed.',
    intervals: [0, 2, 4, 5, 7, 9, 10, 12],
  },
  {
    id: 'aeolian', name: 'Aeolian', category: 'The 7 modes',
    short: 'Mode 6 — identical to the natural minor scale.',
    intervals: [0, 2, 3, 5, 7, 8, 10, 12],
  },
  {
    id: 'locrian', name: 'Locrian', category: 'The 7 modes',
    short: 'Mode 7 — unstable and mysterious (rarely used).',
    intervals: [0, 1, 3, 5, 6, 8, 10, 12],
  },
];

// Roots carry an explicit letter + accidental so scales can be spelled with the
// correct note letters (one per degree) rather than raw pitch classes.
const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ROOTS = [
  { pc: 0, letter: 0, name: 'C' }, { pc: 1, letter: 0, name: 'C♯' },
  { pc: 2, letter: 1, name: 'D' }, { pc: 3, letter: 2, name: 'E♭' },
  { pc: 4, letter: 2, name: 'E' }, { pc: 5, letter: 3, name: 'F' },
  { pc: 6, letter: 3, name: 'F♯' }, { pc: 7, letter: 4, name: 'G' },
  { pc: 8, letter: 5, name: 'A♭' }, { pc: 9, letter: 5, name: 'A' },
  { pc: 10, letter: 6, name: 'B♭' }, { pc: 11, letter: 6, name: 'B' },
];
export const ROOT_NAMES = ROOTS.map((r) => r.name);

function accSymbol(acc) {
  if (acc === 0) return '';
  if (acc === 2) return '𝄪';
  if (acc === -2) return '♭♭';
  return acc > 0 ? '♯' : '♭';
}

// Letter offset (0–7) each scale degree occupies. Heptatonic scales walk the
// letters one at a time; pentatonics skip the degrees they omit.
const PENT_LETTERS = { majpent: [0, 1, 2, 4, 5, 7], minpent: [0, 2, 3, 4, 6, 7] };

// Spells each degree of a scale with the correct letter + accidental for the key.
function spellDegrees(rootPc, def) {
  const root = ROOTS[rootPc];
  const letters = PENT_LETTERS[def.id] ?? def.intervals.map((_, k) => k);
  return def.intervals.map((iv, k) => {
    const letterIndex = (root.letter + letters[k]) % 7;
    const targetPc = (rootPc + iv) % 12;
    let acc = targetPc - LETTER_PC[letterIndex];
    if (acc > 6) acc -= 12; else if (acc < -6) acc += 12;
    return { letterIndex, acc, label: LETTER_NAMES[letterIndex] + accSymbol(acc) };
  });
}

// Diatonic staff step for a spelled note (octave * 7 + letter), matching notes.js.
function stepFor(midi, letterIndex, acc) {
  const octave = Math.round((midi - LETTER_PC[letterIndex] - acc) / 12) - 1;
  return octave * 7 + letterIndex;
}

// Whole/half (and augmented-second) step pattern between consecutive notes,
// e.g. "W–W–H–W–W–W–H" for a major scale.
export function stepPattern(intervals) {
  const map = { 1: 'H', 2: 'W', 3: 'W½' };
  const steps = [];
  for (let i = 1; i < intervals.length; i++) {
    steps.push(map[intervals[i] - intervals[i - 1]] ?? '?');
  }
  return steps.join('–');
}

// Chooses the octave of the root that best centers the scale in the range.
export function pickRootMidi(rootPc, span, range) {
  const center = (range.low + range.high) / 2;
  let best = rootPc;
  let bestDist = Infinity;
  for (let m = rootPc; m <= 108; m += 12) {
    const d = Math.abs(m + span / 2 - center);
    if (d < bestDist) { bestDist = d; best = m; }
  }
  return best;
}

// Builds the sequence of notes to sing: ascending, optionally followed by a
// descent back to the root (which is what makes the staff scroll). Returns the
// MIDI notes plus a parallel `spellings` array ({ step, accidental, label }) so
// the staff can draw each note with its correct letter name.
export function buildScaleSequence(rootPc, def, range, { upDown = true } = {}) {
  const span = def.intervals[def.intervals.length - 1];
  const rootMidi = pickRootMidi(rootPc, span, range);
  const degrees = spellDegrees(rootPc, def);
  const ascNotes = def.intervals.map((i) => rootMidi + i);
  const ascSpell = ascNotes.map((m, k) => ({
    step: stepFor(m, degrees[k].letterIndex, degrees[k].acc),
    accidental: degrees[k].acc,
    label: degrees[k].label,
  }));
  const notes = upDown ? ascNotes.concat(ascNotes.slice(0, -1).reverse()) : ascNotes;
  const spellings = upDown
    ? ascSpell.concat(ascSpell.slice(0, -1).reverse())
    : ascSpell;
  return { rootMidi, notes, spellings };
}

export function scaleTitle(rootPc, def) {
  return `${ROOT_NAMES[rootPc]} ${def.name}`;
}

export { noteName };
