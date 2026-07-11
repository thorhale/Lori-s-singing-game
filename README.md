# Lori’s Singing Game 🎶

A sight-singing game: a note appears on the musical staff, you sing it, and the
game listens through the microphone and tells you whether to go higher or lower
until you nail it.

## Features

- **Real pitch detection** — autocorrelation-based detection tuned for the
  singing voice, with a live tuner meter and gentle “a little higher / lower”
  guidance.
- **Real piano reference tones** — sampled from the Salamander Grand Piano, so
  the note you hear sounds like an actual piano (with a warm e-piano and a soft
  flute as alternatives in Settings).
- **Range finder** — sing your lowest and highest comfortable notes once, and
  every exercise stays inside *your* voice.
- **Four levels** — from five stepwise notes to leaps, and finally sharps and
  flats. Earn stars, unlock the next level, and beat your best score.
- **Note names always shown** — every note is labeled while you learn the
  staff positions.
- No build step, no dependencies: plain HTML, CSS, and JavaScript.

## Playing it

The microphone requires a secure (HTTPS) page, so the easiest way to play on a
phone or tablet is GitHub Pages:

1. In this repository: **Settings → Pages → Deploy from branch → `main`**.
2. Open `https://<your-username>.github.io/Lori-s-singing-game/` on the device.
3. Tap **Let’s sing!** and allow microphone access.

To run locally instead: `python3 -m http.server` in the repo folder, then open
`http://localhost:8000` (localhost counts as secure, so the mic works).

Tips: sing “oooh” or “aaah” with a steady tone, in a quiet room, and keep the
device fairly close.

## Development notes

- `?test=1` replaces the microphone with a controllable oscillator and exposes
  `window.__test` hooks — handy for trying the game without singing.
- `?range=55-74` pre-seeds the stored vocal range (MIDI numbers).

## Credits

- Piano samples: [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander/)
  by Alexander Holm, CC-BY, via the Tone.js audio collection.
- Clef glyphs: public-domain SVGs from Wikimedia Commons.
