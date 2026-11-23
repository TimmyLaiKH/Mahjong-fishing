/*
 * Background music player for five CC0 Chinese-instrument tracks from
 * Freesound. A different track is chosen after each one finishes. Playback is
 * attempted as soon as the page loads; browsers that block audible autoplay
 * simply wait until the first user gesture, then start normally.
 */

export const TRACKS = Object.freeze([
  {
    name: 'A ride through chinese valley',
    file: 'assets/audio/a-ride-through-chinese-valley.mp3',
    source: 'https://freesound.org/s/573972/',
  },
  {
    name: 'blossom valley in paradise',
    file: 'assets/audio/blossom-valley-in-paradise.mp3',
    source: 'https://freesound.org/s/521367/',
  },
  {
    name: 'Ghuzheng Fantasie',
    file: 'assets/audio/ghuzheng-fantasie.mp3',
    source: 'https://freesound.org/s/541306/',
  },
  {
    name: 'guzheng solo',
    file: 'assets/audio/guzheng-solo.mp3',
    source: 'https://freesound.org/s/472707/',
  },
  {
    name: 'Erhu Melodic Loop',
    file: 'assets/audio/erhu-melodic-loop.mp3',
    source: 'https://freesound.org/s/565196/',
  },
]);

export function createMusic() {
  let audio = null;
  let musicEnabled = true;
  let effectsEnabled = true;
  // masterVolume scales every sound (music, clicks, tile strike, voice).
  // musicVolume scales only the background track.
  let masterVolume = 0.32;
  let musicVolume = 1;
  let active = false;
  let current = -1;
  let errors = 0;

  function randomTrack(previous) {
    if (TRACKS.length === 1) return 0;
    let index = previous;
    while (index === previous) index = Math.floor(Math.random() * TRACKS.length);
    return index;
  }

  function musicGain() {
    return Math.min(1, masterVolume * musicVolume);
  }

  function load(index) {
    current = index;
    if (!audio) return;
    audio.src = TRACKS[index].file;
    audio.load();
  }

  function play() {
    if (!musicEnabled || !active || !audio || !audio.src) return;
    const result = audio.play();
    if (result?.catch) result.catch(() => {}); // autoplay still blocked
  }

  function ensureAudio() {
    if (audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = musicGain();
    audio.addEventListener('ended', () => {
      if (!musicEnabled || !active) return;
      load(randomTrack(current));
      play();
    });
    audio.addEventListener('error', () => {
      errors += 1;
      if (!musicEnabled || !active || errors > TRACKS.length) return;
      load(randomTrack(current));
      play();
    });
  }

  function start() {
    if (!musicEnabled) return;
    active = true;
    ensureAudio();
    if (current < 0) load(randomTrack(-1));
    play();
  }

  function suspend() {
    if (audio) audio.pause();
  }

  function resume() {
    if (musicEnabled && active) play();
  }

  function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    masterVolume = Math.min(1, Math.max(0, next));
    if (audio) audio.volume = musicGain();
  }

  function setMusicVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    musicVolume = Math.min(1, Math.max(0, next));
    if (audio) audio.volume = musicGain();
  }

  function setMusicEnabled(value) {
    musicEnabled = Boolean(value);
    if (!musicEnabled) {
      active = false;
      suspend();
    } else {
      active = true;
      play();
    }
  }

  function setEffectsEnabled(value) {
    effectsEnabled = Boolean(value);
  }

  // The click is synthesised; the tile strike is a short CC0 Freesound
  // recording. Both follow the effects switch and the master volume.
  let context = null;
  const TILE_SOUND = 'assets/audio/mahjong-tile-strike.mp3?v=1.4.61';

  function ensureContext() {
    if (context) return context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { context = new Ctor(); } catch { return null; }
    return context;
  }

  function blip(frequency, duration, wave = 'sine', level = 0.12) {
    if (!effectsEnabled) return;
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const peak = Math.max(0.001, masterVolume * level);
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    } catch { /* sound is optional */ }
  }

  function click() {
    blip(880, 0.055, 'triangle', 0.1);
  }

  function tile() {
    if (!effectsEnabled || masterVolume <= 0) return;
    try {
      const effect = new Audio(TILE_SOUND);
      effect.volume = Math.min(1, masterVolume * 1.1);
      const result = effect.play();
      if (result?.catch) result.catch(() => {}); // sound is optional
    } catch { /* sound is optional */ }
  }

  return {
    start,
    suspend,
    resume,
    setMusicEnabled,
    setEffectsEnabled,
    setVolume,
    setMusicVolume,
    click,
    tile,
    isMusicEnabled: () => musicEnabled,
    isEffectsEnabled: () => effectsEnabled,
    isEnabled: () => musicEnabled,
    isPlaying: () => Boolean(audio && !audio.paused),
    trackName: () => (current >= 0 ? TRACKS[current].name : TRACKS[0].name),
  };
}
