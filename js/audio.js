/*
 * Background music player for five CC0 Chinese-instrument tracks from
 * Freesound. A different track is chosen after each one finishes. Playback is
 * attempted as soon as the page loads; browsers that block audible autoplay
 * simply wait until the first user gesture, then start normally.
 *
 * The music track is routed through Web Audio so it shares the Web Speech API
 * audio session boundary with voice announcements.
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
  let musicEnabled = true;
  let effectsEnabled = true;
  // masterVolume scales every sound (music, clicks, tile strike, voice).
  // musicVolume scales only the background track.
  let masterVolume = 0.32;
  let musicVolume = 1;
  let active = false;
  let current = -1;
  let errors = 0;
  const buffers = new Map();

  let musicCtx = null;
  let musicGainNode = null;
  let activeSource = null;
  let lastError = '';
  let decodeCalls = 0;

  function randomTrack(previous) {
    if (TRACKS.length === 1) return 0;
    let index = previous;
    while (index === previous) index = Math.floor(Math.random() * TRACKS.length);
    return index;
  }

  function musicGainValue() {
    return Math.min(1, masterVolume * musicVolume);
  }

  function ensureMusicContext() {
    if (musicCtx) return musicCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      musicCtx = new Ctor();
      if (musicCtx.state === 'suspended') musicCtx.resume();
      musicGainNode = musicCtx.createGain();
      musicGainNode.gain.value = musicGainValue();
      musicGainNode.connect(musicCtx.destination);
    } catch { musicCtx = null; }
    return musicCtx;
  }

  async function decodeTrack(index) {
    decodeCalls += 1;
    if (buffers.has(index)) return buffers.get(index);
    const response = await fetch(TRACKS[index].file);
    if (!response.ok) throw new Error(`音樂載入失敗：${TRACKS[index].name}`);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = ensureMusicContext();
    if (!ctx) throw new Error('瀏覽器不支援 Web Audio');
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    buffers.set(index, buffer);
    return buffer;
  }

  function startPlayback(buffer, index) {
    const ctx = ensureMusicContext();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') void ctx.resume();
      if (activeSource) {
        activeSource.onended = null;
        activeSource.disconnect();
        activeSource = null;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(musicGainNode);
      source.onended = () => {
        if (activeSource !== source) return;
        activeSource = null;
        if (!musicEnabled || !active) return;
        const nextIndex = randomTrack(index);
        void decodeTrack(nextIndex).then((nextBuffer) => {
          if (musicEnabled && active && current === index) {
            current = nextIndex;
            startPlayback(nextBuffer, nextIndex);
          }
        });
      };
      source.start(0);
      activeSource = source;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  function playTrack(index) {
    current = index;
    void decodeTrack(index).then((buffer) => {
      if (musicEnabled && active && current === index) startPlayback(buffer, index);
    }).catch((error) => {
      if (!musicEnabled || !active || errors > TRACKS.length * 2) return;
      errors += 1;
      lastError = error instanceof Error ? error.message : String(error);
      current = randomTrack(index);
      playTrack(current);
    });
  }

  function play() {
    if (!musicEnabled || !active || current < 0) return;
    playTrack(current);
  }

  function start() {
    if (!musicEnabled) return;
    active = true;
    if (current < 0) current = randomTrack(-1);
    play();
  }

  function suspend() {
    if (!activeSource) return;
    activeSource.onended = null;
    activeSource.disconnect();
    activeSource = null;
  }

  function resume() {
    if (!musicEnabled || !active || activeSource) return;
    if (current >= 0) playTrack(current);
  }

  function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    masterVolume = Math.min(1, Math.max(0, next));
    if (musicGainNode) musicGainNode.gain.value = musicGainValue();
  }

  function setMusicVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    musicVolume = Math.min(1, Math.max(0, next));
    if (musicGainNode) musicGainNode.gain.value = musicGainValue();
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
  // recording. They follow the effects switch and the master volume.
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
    isPlaying: () => Boolean(activeSource),
    trackName: () => (current >= 0 ? TRACKS[current].name : TRACKS[0].name),
    debug: () => ({
      current, active, musicEnabled, effectsEnabled,
      activeSource: Boolean(activeSource),
      musicCtx: Boolean(musicCtx), musicGainNode: Boolean(musicGainNode),
      buffers: [...buffers.keys()], errors, lastError, decodeCalls,
    }),
  };
}
