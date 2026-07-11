// Hand-rolled SVG staff renderer: five lines, clef, ledger lines, accidental,
// and a whole-note head. No dependencies.

import { TREBLE_CLEF_PATH, BASS_CLEF_PATH } from './clefs.js';
import { diatonicStep, isNatural } from './notes.js';

const S = 18;              // distance between staff lines, in viewBox units
const W = 340;             // viewBox width
const H = 200;             // viewBox height
const TOP_Y = 60;          // y of the top staff line
const BOTTOM_Y = TOP_Y + 4 * S;
const NOTE_X = 205;        // x of the note head

// Reference diatonic step sitting on the bottom staff line.
const BOTTOM_LINE_STEP = { treble: 30 /* E4 */, bass: 18 /* G2 */ };

// Treble glyph: source bbox and where the G-line crosses it (fraction of its
// height from the top). Height in staff spaces matches engraving convention.
const TREBLE_CAL = {
  minX: 127, minY: -675.4, w: 890, h: 2536,
  heightSpaces: 7.0, gLineFrac: 0.52, // fraction calibrated by screenshot
};
// Bass glyph source coordinates are calibrated to its original staff:
// top line at y=6378, line spacing 590.5, glyph starting at x=1239.
const BASS_CAL = { x0: 1239, topLineY: 6378, spacing: 590.5 };

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export class Staff {
  constructor(container) {
    this.svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'staff-svg',
      role: 'img',
      'aria-label': 'musical staff',
    });
    container.appendChild(this.svg);
    this.clef = null;
    this.staticGroup = el('g');
    this.noteGroup = el('g', { class: 'staff-note' });
    this.svg.append(this.staticGroup, this.noteGroup);
    this.setClef('treble');
  }

  setClef(clef) {
    if (clef === this.clef) return;
    this.clef = clef;
    this.staticGroup.replaceChildren();
    for (let i = 0; i < 5; i++) {
      this.staticGroup.append(el('line', {
        x1: 12, x2: W - 12, y1: TOP_Y + i * S, y2: TOP_Y + i * S,
        class: 'staff-line',
      }));
    }
    if (clef === 'bass') {
      const scale = S / BASS_CAL.spacing;
      const g = el('g', {
        transform:
          `translate(${26 - BASS_CAL.x0 * scale}, ${TOP_Y - BASS_CAL.topLineY * scale}) scale(${scale})`,
      });
      g.append(el('path', { d: BASS_CLEF_PATH, class: 'staff-clef' }));
      this.staticGroup.append(g);
    } else {
      const c = TREBLE_CAL;
      const scale = (c.heightSpaces * S) / c.h;
      const gLineY = BOTTOM_Y - S; // G4 sits on the second line from the bottom
      const ty = gLineY - (c.minY + c.h * c.gLineFrac) * scale;
      const g = el('g', {
        transform: `translate(${30 - c.minX * scale}, ${ty}) scale(${scale})`,
      });
      g.append(el('path', { d: TREBLE_CLEF_PATH, class: 'staff-clef' }));
      this.staticGroup.append(g);
    }
  }

  clearNote() {
    this.noteGroup.replaceChildren();
  }

  // Draws a whole note (with ledger lines / accidental as needed).
  setNote(midi) {
    this.clearNote();
    if (midi == null) return;

    const { step, accidental } = diatonicStep(midi);
    const p = step - BOTTOM_LINE_STEP[this.clef]; // half-space steps above the bottom line
    const y = BOTTOM_Y - p * (S / 2);
    const rx = S * 0.8, ry = S * 0.52;

    for (let lp = -2; lp >= p + (p % 2 ? 1 : 0); lp -= 2) {
      this.noteGroup.append(el('line', {
        x1: NOTE_X - rx - 7, x2: NOTE_X + rx + 7,
        y1: BOTTOM_Y - lp * (S / 2), y2: BOTTOM_Y - lp * (S / 2),
        class: 'staff-line',
      }));
    }
    for (let lp = 10; lp <= p - (p % 2 ? 1 : 0); lp += 2) {
      this.noteGroup.append(el('line', {
        x1: NOTE_X - rx - 7, x2: NOTE_X + rx + 7,
        y1: BOTTOM_Y - lp * (S / 2), y2: BOTTOM_Y - lp * (S / 2),
        class: 'staff-line',
      }));
    }

    if (accidental !== 0) {
      const t = el('text', {
        x: NOTE_X - rx - 26, y: y + S * 0.42,
        class: 'staff-accidental',
        'font-size': S * 2.4,
      });
      t.textContent = accidental > 0 ? '♯' : '♭';
      this.noteGroup.append(t);
    }

    const head = el('g', { class: 'note-head' });
    head.append(el('ellipse', { cx: NOTE_X, cy: y, rx, ry, class: 'note-outer' }));
    head.append(el('ellipse', {
      cx: NOTE_X, cy: y, rx: rx * 0.52, ry: ry * 0.62,
      transform: `rotate(-55 ${NOTE_X} ${y})`,
      class: 'note-hole',
    }));
    this.noteGroup.append(head);
  }

  // 'idle' | 'good' | 'success'
  setNoteState(state) {
    this.noteGroup.dataset.state = state;
  }
}

// Picks the clef that keeps a range closest to the staff.
export function clefForRange(lowMidi, highMidi) {
  const mid = (lowMidi + highMidi) / 2;
  return mid < 57 /* A3 */ ? 'bass' : 'treble';
}

export { isNatural };
