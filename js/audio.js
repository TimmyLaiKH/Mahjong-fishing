/*
 * Background music player for five CC0 Chinese-instrument tracks from
 * Freesound. A different track is chosen after each one finishes. Playback
 * only starts after a user gesture, as required by browser autoplay rules.
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
  let enabled = true;
  let volume = 0.32;
  let active = false;
  let current = -1;
  let errors = 0;

  function randomTrack(previous) {
    if (TRACKS.length === 1) return 0;
    let index = previous;
    while (index === previous) index = Math.floor(Math.random() * TRACKS.length);
    return index;
  }

  function load(index) {
    current = index;
    if (!audio) return;
    audio.src = TRACKS[index].file;
    audio.load();
  }

  function play() {
    if (!enabled || !active || !audio || !audio.src) return;
    const result = audio.play();
    if (result?.catch) result.catch(() => {}); // autoplay still blocked
  }

  function ensureAudio() {
    if (audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audio.addEventListener('ended', () => {
      if (!enabled || !active) return;
      load(randomTrack(current));
      play();
    });
    audio.addEventListener('error', () => {
      errors += 1;
      if (!enabled || !active || errors > TRACKS.length) return;
      load(randomTrack(current));
      play();
    });
  }

  function start() {
    if (!enabled) return;
    active = true;
    ensureAudio();
    if (current < 0) load(randomTrack(-1));
    play();
  }

  function suspend() {
    if (audio) audio.pause();
  }

  function resume() {
    if (enabled && active) play();
  }

  function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    volume = Math.min(1, Math.max(0, next));
    if (audio) audio.volume = volume;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) {
      active = false;
      suspend();
    } else {
      active = true;
      play();
    }
  }

  return {
    start,
    suspend,
    resume,
    setEnabled,
    setVolume,
    isEnabled: () => enabled,
    isPlaying: () => Boolean(audio && !audio.paused),
    trackName: () => (current >= 0 ? TRACKS[current].name : TRACKS[0].name),
  };
}
