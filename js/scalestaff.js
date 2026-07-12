// A horizontally scrolling staff that shows a whole sequence of notes at once,
// highlights the current one, and auto-scrolls to follow along. The clef is
// pinned in a fixed cap on the left so it stays visible while notes slide past.

import { clefGroup, svgEl as el, BOTTOM_LINE_STEP } from './staff.js';
import { diatonicStep, noteName } from './notes.js';

const LINE = 15;                 // staff line spacing (px)
const TOP = 54;                  // y of the top staff line
const BOTTOM = TOP + 4 * LINE;   // y of the bottom staff line
const H = 184;                   // svg height
const CAP_W = 84;                // width of the pinned clef cap
const NOTE_X0 = CAP_W + 26;      // x of the first note
const NOTE_DX = 62;              // spacing between notes
const RX = 11, RY = 7.4;         // note-head radii
const ACCIDENTAL_GLYPH = { 1: '♯', '-1': '♭', 2: '𝄪', '-2': '♭♭' };

export class ScaleStaff {
  constructor(container) {
    container.replaceChildren();
    this.root = document.createElement('div');
    this.root.className = 'scale-staff';

    this.scroller = document.createElement('div');
    this.scroller.className = 'scale-scroll';
    this.svg = el('svg', { class: 'scale-svg', role: 'img', 'aria-label': 'scale' });
    this.scroller.appendChild(this.svg);

    this.cap = el('svg', { class: 'scale-cap', width: CAP_W, height: H,
      viewBox: `0 0 ${CAP_W} ${H}` });

    this.root.append(this.scroller, this.cap);
    container.appendChild(this.root);

    this.noteEls = [];
    this.clef = 'treble';
  }

  _staffLines(group, width) {
    for (let i = 0; i < 5; i++) {
      group.append(el('line', {
        x1: 0, x2: width, y1: TOP + i * LINE, y2: TOP + i * LINE,
        class: 'staff-line',
      }));
    }
  }

  setScale(notes, clef = 'treble', spellings = null) {
    this.clef = clef;
    this.noteEls = [];
    const width = NOTE_X0 + notes.length * NOTE_DX + 30;

    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${H}`);
    this.svg.replaceChildren();
    this._staffLines(this.svg, width);

    notes.forEach((midi, i) => {
      this.svg.append(this._noteGroup(midi, NOTE_X0 + i * NOTE_DX, i, spellings?.[i]));
    });

    // Pinned cap: matching staff-line stubs plus the clef glyph.
    this.cap.replaceChildren();
    this._staffLines(this.cap, CAP_W);
    this.cap.append(clefGroup(clef, LINE, TOP, BOTTOM, clef === 'bass' ? 12 : 14));

    this.scroller.scrollLeft = 0;
  }

  _noteGroup(midi, x, i, spelling) {
    // Prefer the key-correct spelling; fall back to raw pitch spelling.
    const { step, accidental } = spelling ?? diatonicStep(midi);
    const p = step - BOTTOM_LINE_STEP[this.clef];
    const y = BOTTOM - p * (LINE / 2);
    const g = el('g', { class: 'snote', 'data-state': 'upcoming' });

    // Ledger lines above and below the staff as needed.
    for (let lp = -2; lp >= p + (p % 2 ? 1 : 0); lp -= 2) {
      g.append(el('line', { x1: x - RX - 6, x2: x + RX + 6,
        y1: BOTTOM - lp * (LINE / 2), y2: BOTTOM - lp * (LINE / 2), class: 'staff-line' }));
    }
    for (let lp = 10; lp <= p - (p % 2 ? 1 : 0); lp += 2) {
      g.append(el('line', { x1: x - RX - 6, x2: x + RX + 6,
        y1: BOTTOM - lp * (LINE / 2), y2: BOTTOM - lp * (LINE / 2), class: 'staff-line' }));
    }

    if (accidental !== 0) {
      const t = el('text', { x: x - RX - 15, y: y + LINE * 0.4,
        class: 'staff-accidental', 'font-size': LINE * 2 });
      t.textContent = ACCIDENTAL_GLYPH[accidental] ?? (accidental > 0 ? '♯' : '♭');
      g.append(t);
    }

    const head = el('ellipse', { cx: x, cy: y, rx: RX, ry: RY, class: 'snote-head' });
    head.setAttribute('transform', `rotate(-12 ${x} ${y})`);
    g.append(head);

    const label = el('text', { x, y: BOTTOM + 42, class: 'snote-label' });
    label.textContent = spelling?.label
      ?? noteName(midi, { octave: false }).replace('#', '♯');
    g.append(label);

    this.noteEls[i] = g;
    return g;
  }

  // state: 'upcoming' | 'current' | 'good' | 'done' | 'skip'
  setNoteState(i, state) {
    const g = this.noteEls[i];
    if (g) g.setAttribute('data-state', state);
  }

  scrollToNote(i) {
    const x = NOTE_X0 + i * NOTE_DX;
    const target = x - this.scroller.clientWidth / 2;
    this.scroller.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }
}
