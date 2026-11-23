# eSpeak NG browser voice

These files are the browser build of eSpeak NG used for the shared Cantonese announcement voice.

- Upstream: https://github.com/ianmarmour/espeak-ng.js
- npm package: `espeak-ng@1.0.2` (https://www.npmjs.com/package/espeak-ng)
- Files used: `dist/espeak-ng.js`, `dist/espeak-ng.wasm` and `LICENSE` from the npm package, unmodified.
- Voice data includes the full `yue` (Cantonese) dictionary, so Chinese characters are
  pronounced with Cantonese readings rather than spelled out as Unicode names.
- License: **GPL-3.0-or-later**. The full upstream `LICENSE` file is included here as `LICENSE`.

`full-worker.js` and `../../voice.js` are this game's own small adapters. The worker imports the
unmodified Emscripten module, asks it to synthesise one WAV per line with `-v yue`, decodes the WAV
to mono PCM and transfers the samples back to the page. Speech failures fall back to the browser's
`SpeechSynthesis`; they never affect gameplay.
