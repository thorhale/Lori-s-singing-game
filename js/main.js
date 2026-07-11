// App shell: screens, settings, range finder flow, and the game loop.

import { midiToFreq, noteName } from './notes.js';
import { PitchEngine } from './pitch.js';
import { Instruments, INSTRUMENT_INFO } from './instruments.js';
import { Staff, clefForRange } from './staff.js';
import { HeldNoteDetector, buildRange, DEFAULT_RANGE } from './rangefinder.js';
import {
  LEVELS, TOLERANCES, NOTES_PER_ROUND,
  makeRound, NoteMatcher, noteScore, starsForRound, summarize,
} from './game.js';

const params = new URLSearchParams(location.search);
const TEST_MODE = params.get('test') === '1';

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

if (params.get('range')) {
  const m = params.get('range').match(/^(\d+)-(\d+)$/);
  if (m) store.set('lori.range', { low: +m[1], high: +m[2] });
}

const state = {
  ctx: null,
  engine: null,
  instruments: null,
  staff: null,
  rangeStaff: null,
  mode: null, // 'range' | 'game' | null — routes pitch frames
  settings: store.get('lori.settings', {
    instrument: 'piano', autoRef: true, tolerance: 'normal',
  }),
  range: store.get('lori.range', null),
  progress: store.get('lori.progress', {}),
  // game round
  level: null,
  round: [],
  noteIdx: 0,
  matcher: null,
  results: [],
  score: 0,
  streak: 0,
  refPlayingUntil: 0,
  advancing: false,
  hintTimer: null,
  // range finder
  rangePhase: null, // 'low' | 'high'
  detector: null,
  rangeLow: null,
  wakeLock: null,
};

function prettyName(midi, { octave = false } = {}) {
  return noteName(midi, { octave }).replace('#', '♯').replace('b', '♭');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.toggle('active', s.id === id);
  });
  if (id !== 'screen-game' && id !== 'screen-range') state.mode = null;
  if (id === 'screen-game') acquireWakeLock(); else releaseWakeLock();
}

async function acquireWakeLock() {
  try { state.wakeLock = await navigator.wakeLock?.request('screen'); }
  catch { /* not critical */ }
}
function releaseWakeLock() {
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

// ---------------------------------------------------------------- audio init

function ensureAudio() {
  if (state.ctx) return;
  state.ctx = new (window.AudioContext || window.webkitAudioContext)();
  state.instruments = new Instruments(state.ctx);
  state.instruments.loadPiano().catch(() => {
    // Samples unavailable (e.g. offline): the e-piano synth still works.
    if (state.settings.instrument === 'piano') state.settings.instrument = 'epiano';
  });
  state.engine = new PitchEngine(state.ctx, { testMode: TEST_MODE });
  state.engine.onFrame(onPitchFrame);
}

async function startListening() {
  ensureAudio();
  await state.engine.start();
}

// ------------------------------------------------------------- pitch routing

function onPitchFrame(frame) {
  if (state.mode === 'range') rangeFrame(frame);
  else if (state.mode === 'game') gameFrame(frame);
}

// ---------------------------------------------------------------- welcome

$('btn-start').addEventListener('click', async () => {
  const err = $('mic-error');
  err.classList.add('hidden');
  try {
    await startListening();
  } catch (e) {
    err.textContent =
      'I couldn’t reach the microphone. Please allow mic access and try again.';
    err.classList.remove('hidden');
    return;
  }
  if (state.range) showLevels();
  else startRangeFinder();
});

$('btn-welcome-settings').addEventListener('click', () => openSettings());

// ------------------------------------------------------------- range finder

function startRangeFinder() {
  state.mode = 'range';
  state.rangePhase = 'low';
  state.rangeLow = null;
  state.detector = new HeldNoteDetector();
  if (!state.rangeStaff) state.rangeStaff = new Staff($('range-staff-holder'));
  $('range-title').textContent = 'Find your range';
  $('range-instructions').textContent =
    'Sing your LOWEST comfortable note — a relaxed “oooh” — and hold it steady.';
  $('range-note').textContent = '–';
  setRing($('range-ring'), 0);
  showScreen('screen-range');
}

function rangeFrame(frame) {
  const res = state.detector.update(frame);
  const noteEl = $('range-note');
  if (res.midi != null) {
    noteEl.textContent = prettyName(res.midi, { octave: true });
    const clef = res.midi < 57 ? 'bass' : 'treble';
    state.rangeStaff.setClef(clef);
    state.rangeStaff.setNote(res.midi);
    state.rangeStaff.setNoteState(res.progress > 0 ? 'good' : 'idle');
  } else {
    noteEl.textContent = '–';
    state.rangeStaff.clearNote();
  }
  setRing($('range-ring'), res.progress);

  if (!res.locked) return;

  if (state.rangePhase === 'low') {
    state.rangeLow = res.midi;
    state.rangePhase = 'pause';
    $('range-instructions').textContent =
      `Lovely — ${prettyName(res.midi, { octave: true })}! ` +
      'Now sing your HIGHEST comfortable note and hold it.';
    setTimeout(() => {
      state.detector.reset();
      state.rangePhase = 'high';
      setRing($('range-ring'), 0);
    }, 1600);
  } else if (state.rangePhase === 'high') {
    if (res.midi <= state.rangeLow + 4) {
      $('range-instructions').textContent =
        'That was close to your low note — try singing higher, and hold it.';
      state.detector.reset();
      return;
    }
    state.rangePhase = null;
    state.mode = null;
    state.range = buildRange(state.rangeLow, res.midi);
    store.set('lori.range', state.range);
    $('range-instructions').textContent =
      `Your singing range: ${prettyName(state.range.low, { octave: true })} to ` +
      `${prettyName(state.range.high, { octave: true })}. Let’s play! 🎉`;
    setTimeout(showLevels, 1800);
  }
}

$('btn-range-skip').addEventListener('click', () => {
  state.mode = null;
  state.range = { ...DEFAULT_RANGE };
  store.set('lori.range', state.range);
  showLevels();
});

function setRing(svgCircle, progress) {
  const r = svgCircle.r.baseVal.value;
  const c = 2 * Math.PI * r;
  svgCircle.style.strokeDasharray = c;
  svgCircle.style.strokeDashoffset = c * (1 - Math.min(1, progress));
}

// ------------------------------------------------------------------- levels

function showLevels() {
  const list = $('level-list');
  list.replaceChildren();
  $('range-chip-text').textContent =
    `Range: ${prettyName(state.range.low, { octave: true })} – ` +
    prettyName(state.range.high, { octave: true });
  LEVELS.forEach((level, i) => {
    const prev = LEVELS[i - 1];
    const unlocked = i === 0 || (state.progress[prev.id]?.stars ?? 0) >= 1;
    const p = state.progress[level.id];
    const btn = document.createElement('button');
    btn.className = 'level-card' + (unlocked ? '' : ' locked');
    btn.innerHTML = `
      <span class="level-emoji">${unlocked ? level.emoji : '🔒'}</span>
      <span class="level-text">
        <span class="level-name">${level.name}</span>
        <span class="level-blurb">${level.blurb}</span>
      </span>
      <span class="level-stars">${p ? '⭐'.repeat(p.stars) : ''}</span>`;
    if (unlocked) btn.addEventListener('click', () => startLevel(level));
    list.appendChild(btn);
  });
  showScreen('screen-levels');
}

$('btn-redo-range').addEventListener('click', async () => {
  try { await startListening(); } catch { return; }
  startRangeFinder();
});

// --------------------------------------------------------------------- game

function toleranceCents() {
  return TOLERANCES[state.settings.tolerance] ?? TOLERANCES.normal;
}

function startLevel(level) {
  state.level = level;
  state.round = makeRound(level, state.range.low, state.range.high);
  state.noteIdx = 0;
  state.results = [];
  state.score = 0;
  state.streak = 0;
  if (!state.staff) state.staff = new Staff($('staff-holder'));
  state.staff.setClef(clefForRange(state.range.low, state.range.high));
  $('game-level-name').textContent = `${level.emoji} ${level.name}`;
  showScreen('screen-game');
  state.mode = 'game';
  nextNote();
}

function currentTarget() { return state.round[state.noteIdx]; }

function nextNote() {
  const midi = currentTarget();
  state.matcher = new NoteMatcher(midi, toleranceCents());
  state.advancing = false;
  state.staff.setNote(midi);
  state.staff.setNoteState('idle');
  $('note-label').textContent = prettyName(midi);
  $('game-progress').textContent = `Note ${state.noteIdx + 1} of ${state.round.length}`;
  $('game-score').textContent = state.score;
  $('streak').textContent = state.streak >= 2 ? `🔥 ${state.streak} in a row!` : '';
  setFeedback('listen');
  setHoldBar(0);
  clearTimeout(state.hintTimer);
  state.hintTimer = setTimeout(() => {
    if (!state.advancing) setHint('Tap “Hear it” any time to listen again 💛');
  }, 12000);
  setHint('');
  if (state.settings.autoRef) playReference();
  else setFeedback('sing');
}

function playReference() {
  const dur = state.instruments.play(
    currentTarget(), state.settings.instrument, 1.4,
  );
  // While the speaker plays the reference the mic hears it too, so matching
  // pauses until shortly after it ends.
  state.refPlayingUntil = performance.now() + dur * 1000 + 300;
  setFeedback('listen');
}

$('btn-hear').addEventListener('click', () => {
  if (state.mode === 'game' && !state.advancing) playReference();
});

$('btn-skip').addEventListener('click', () => {
  if (state.mode !== 'game' || state.advancing) return;
  state.results.push({ midi: currentTarget(), skipped: true, timeMs: null });
  state.streak = 0;
  advance();
});

$('btn-game-back').addEventListener('click', () => {
  state.mode = null;
  clearTimeout(state.hintTimer);
  showLevels();
});

function gameFrame(frame) {
  if (state.advancing) return;
  if (performance.now() < state.refPlayingUntil) {
    setFeedback('listen');
    return;
  }
  const st = state.matcher.update(frame);
  setHoldBar(st.progress);
  if (st.state === 'done') {
    onNoteSuccess();
    return;
  }
  setMeter(st.cents);
  if (st.state === 'good') {
    state.staff.setNoteState('good');
    setFeedback('good');
  } else if (st.state === 'high') {
    state.staff.setNoteState('idle');
    setFeedback('high');
  } else if (st.state === 'low') {
    state.staff.setNoteState('idle');
    setFeedback('low');
  } else {
    state.staff.setNoteState('idle');
    setFeedback('sing');
  }
}

function onNoteSuccess() {
  state.advancing = true;
  clearTimeout(state.hintTimer);
  const timeMs = state.matcher.timeToHitMs ?? 0;
  state.streak += 1;
  state.score += noteScore(timeMs, state.streak);
  state.results.push({ midi: currentTarget(), skipped: false, timeMs });
  state.staff.setNoteState('success');
  setFeedback('success');
  setHoldBar(1);
  $('game-score').textContent = state.score;
  state.instruments.chime();
  setTimeout(advance, 950);
}

function advance() {
  state.noteIdx += 1;
  if (state.noteIdx >= state.round.length) finishRound();
  else nextNote();
}

function finishRound() {
  state.mode = null;
  clearTimeout(state.hintTimer);
  const stars = starsForRound(state.results);
  const prev = state.progress[state.level.id] ?? { stars: 0, best: 0 };
  state.progress[state.level.id] = {
    stars: Math.max(prev.stars, stars),
    best: Math.max(prev.best, state.score),
  };
  store.set('lori.progress', state.progress);

  const sum = summarize(state.results);
  $('summary-stars').textContent =
    stars ? '⭐'.repeat(stars) : '🌱';
  $('summary-headline').textContent =
    stars === 3 ? 'Absolutely wonderful!' :
    stars === 2 ? 'Great singing!' :
    stars === 1 ? 'Nice work — keep going!' :
    'Good try — let’s try that again!';
  $('summary-score').textContent = `Score: ${state.score}`;
  const bits = [`You sang ${sum.hitCount} of ${sum.total} notes.`];
  if (sum.avgTimeMs != null) {
    bits.push(`Average ${(sum.avgTimeMs / 1000).toFixed(1)}s to find each note.`);
  }
  if (sum.needsWork.length) {
    bits.push(`Worth extra practice: ${sum.needsWork.join(', ')}.`);
  }
  $('summary-detail').textContent = bits.join(' ');
  showScreen('screen-summary');
}

$('btn-again').addEventListener('click', () => startLevel(state.level));
$('btn-to-levels').addEventListener('click', showLevels);

// ----------------------------------------------------------------- feedback

const FEEDBACK = {
  listen: { text: '🎧 Listen…', cls: 'listen' },
  sing: { text: '🎤 Sing the note!', cls: 'sing' },
  good: { text: '🎯 Hold it right there…', cls: 'good' },
  high: { text: '⬇️ A little lower', cls: 'off' },
  low: { text: '⬆️ A little higher', cls: 'off' },
  success: { text: '🌟 Beautiful!', cls: 'success' },
};

function setFeedback(kind) {
  const f = FEEDBACK[kind];
  const el = $('feedback');
  if (el.dataset.kind === kind) return;
  el.dataset.kind = kind;
  el.textContent = f.text;
  el.className = 'feedback ' + f.cls;
  if (kind === 'listen' || kind === 'sing' || kind === 'success') setMeter(null);
}

// Tuner meter: needle position from cents (clamped to ±METER_RANGE).
const METER_RANGE = 100;
function setMeter(cents) {
  const needle = $('meter-needle');
  if (cents == null) {
    needle.classList.add('hidden');
    return;
  }
  needle.classList.remove('hidden');
  const clamped = Math.max(-METER_RANGE, Math.min(METER_RANGE, cents));
  needle.style.left = `${50 + (clamped / METER_RANGE) * 50}%`;
  needle.classList.toggle('in-tune', Math.abs(cents) <= toleranceCents());
  $('meter-zone').style.width = `${(toleranceCents() / METER_RANGE) * 100}%`;
}

function setHoldBar(progress) {
  $('hold-bar').style.width = `${Math.min(1, progress) * 100}%`;
}

function setHint(text) {
  $('game-hint').textContent = text;
}

// ----------------------------------------------------------------- settings

function openSettings() {
  ensureAudio();
  const sheet = $('settings-sheet');
  sheet.classList.remove('hidden');
  renderSettings();
}

function renderSettings() {
  const wrap = $('setting-instruments');
  wrap.replaceChildren();
  for (const info of INSTRUMENT_INFO) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (state.settings.instrument === info.id ? ' selected' : '');
    btn.textContent = `${info.emoji} ${info.label}`;
    btn.addEventListener('click', () => {
      state.settings.instrument = info.id;
      saveSettings();
      renderSettings();
      // Preview near the middle of her range.
      const mid = state.range
        ? Math.round((state.range.low + state.range.high) / 2) : 60;
      state.instruments.play(mid, info.id, 1.2);
    });
    wrap.appendChild(btn);
  }

  const tolWrap = $('setting-tolerance');
  tolWrap.replaceChildren();
  for (const [id, label] of [['easy', 'Gentle'], ['normal', 'Normal'], ['strict', 'Precise']]) {
    const btn = document.createElement('button');
    btn.className = 'chip' + (state.settings.tolerance === id ? ' selected' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      state.settings.tolerance = id;
      saveSettings();
      renderSettings();
    });
    tolWrap.appendChild(btn);
  }

  const auto = $('setting-autoref');
  auto.checked = state.settings.autoRef;
}

$('setting-autoref').addEventListener('change', (e) => {
  state.settings.autoRef = e.target.checked;
  saveSettings();
});

$('btn-settings-range').addEventListener('click', async () => {
  $('settings-sheet').classList.add('hidden');
  try { await startListening(); } catch { return; }
  startRangeFinder();
});

$('btn-settings-close').addEventListener('click', () => {
  $('settings-sheet').classList.add('hidden');
});
$('settings-sheet').addEventListener('click', (e) => {
  if (e.target === $('settings-sheet')) $('settings-sheet').classList.add('hidden');
});

document.querySelectorAll('.btn-open-settings').forEach((b) => {
  b.addEventListener('click', () => openSettings());
});

function saveSettings() {
  store.set('lori.settings', state.settings);
}

// --------------------------------------------------------------- test hooks

if (TEST_MODE) {
  window.__test = {
    state,
    showScreen,
    setTone: (freq, vol = 0.5) => state.engine.setTestTone(freq, vol),
    midiToFreq,
    startLevel: (i) => startLevel(LEVELS[i]),
  };
}

// ------------------------------------------------------------------ boot

if (state.range) {
  $('btn-start').textContent = 'Let’s sing! 🎤';
}
showScreen('screen-welcome');
