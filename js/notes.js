// Note math: MIDI numbers <-> frequencies <-> names <-> staff positions.

export const A4_MIDI = 69;
export const A4_FREQ = 440;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Letter (0=C..6=B) and accidental (0 or 1 semitone up) for each pitch class,
// using sharp spelling.
const SHARP_SPELLING = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0],
  [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];
const FLAT_SPELLING = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

export function midiToFreq(midi) {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function freqToMidiFloat(freq) {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

// Signed cents between a sung frequency and a target MIDI note.
export function centsOff(freq, targetMidi) {
  return 100 * (freqToMidiFloat(freq) - targetMidi);
}

export function isNatural(midi) {
  return SHARP_SPELLING[((midi % 12) + 12) % 12][1] === 0;
}

export function noteName(midi, { flats = false, octave = true } = {}) {
  const pc = ((midi % 12) + 12) % 12;
  const name = (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
  return octave ? name + (Math.floor(midi / 12) - 1) : name;
}

// Diatonic step index: C(-1)=0, each letter counts one step. Used for staff
// geometry, where adjacent line/space positions are one step apart.
export function diatonicStep(midi, { flats = false } = {}) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1; // scientific octave: C4 = MIDI 60
  const [letter, acc] = (flats ? FLAT_SPELLING : SHARP_SPELLING)[pc];
  return { step: octave * 7 + letter, accidental: acc };
}
