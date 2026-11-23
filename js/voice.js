/*
 * Shared Cantonese announcement voice.
 *
 * eSpeak NG is bundled as a Web Worker so every device speaks the same voice
 * without depending on the operating system's installed speech voices and
 * without shipping one audio file per announcement. Speech is a bonus: every
 * failure path resolves quietly and the game falls back to SpeechSynthesis.
 */
const WORKER_URL = new URL('./vendor/espeakng/full-worker.js?v=1.4.74', import.meta.url).href;
const INIT_TIMEOUT_MS = 20000;
const SYNTH_TIMEOUT_MS = 12000;

let worker = null;
let initPromise = null;
let resolveInit = null;
let primePromise = null;
let ready = false;
let lastError = '';
let lastText = '';
let sampleRate = 22050;
let messageId = 0;
let audioContext = null;
let currentSource = null;
const pending = new Map();

function stopWorker() {
  if (worker) {
    try { worker.terminate(); } catch { /* already gone */ }
    worker = null;
  }
  ready = false;
  initPromise = null;
  resolveInit = null;
  primePromise = null;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error('語音引擎已停止'));
  }
  pending.clear();
}

function handleMessage(event) {
  if (event.data === 'ready') {
    const resolve = resolveInit;
    resolveInit = null;
    if (resolve) resolve();
    return;
  }
  const data = event.data;
  const entry = pending.get(data?.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(data.id);
  if (data.error) {
    entry.reject(new Error(data.error));
    return;
  }
  if (data.sampleRate) sampleRate = data.sampleRate;
  entry.resolve(new Float32Array(data.samples));
}

function initVoice() {
  if (initPromise) return initPromise;
  if (typeof Worker === 'undefined') return Promise.reject(new Error('此瀏覽器不支援 Web Worker'));

  initPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('語音引擎載入超時')), INIT_TIMEOUT_MS);
    const fail = (error) => {
      clearTimeout(timer);
      resolveInit = null;
      lastError = String(error?.message || error);
      stopWorker();
      reject(error);
    };
    resolveInit = () => {
      clearTimeout(timer);
      lastError = '';
      resolve();
    };
    try {
      // The full-dictionary eSpeak build ships as an ES module. Module workers
      // keep the 100 ms synthesis off the main thread; older browsers fall back.
      worker = new Worker(WORKER_URL, { type: 'module' });
      worker.onmessage = handleMessage;
      worker.onerror = (event) => fail(new Error(event?.message || '語音引擎載入失敗'));
    } catch (error) {
      fail(error);
    }
  });
  return initPromise;
}

function request(text, prime = false) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('語音引擎尚未載入'));
      return;
    }
    const id = ++messageId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('語音合成超時'));
    }, SYNTH_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      worker.postMessage({ id, text: String(text || ' '), prime });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

function ensureAudioContext() {
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try { audioContext = new Ctor(); } catch { return null; }
  return audioContext;
}

function playSamples(samples, volume) {
  const ctx = ensureAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  const scale = peak > 0.001 ? Math.min(2.4, 0.9 / peak) : 1;
  const gain = Math.max(0, Math.min(1, Number(volume) || 0));
  const fade = Math.min(240, Math.floor(sampleRate * 0.008));
  const pcm = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const edge = Math.min(i, samples.length - 1 - i);
    const envelope = fade > 0 && edge < fade ? edge / fade : 1;
    pcm[i] = samples[i] * scale * gain * envelope;
  }

  const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(pcm, 0);
  if (currentSource) {
    try { currentSource.stop(); } catch { /* already finished */ }
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (currentSource === source) currentSource = null;
  };
  currentSource = source;
  source.start();
  return true;
}

/** Load and warm the worker on the first user gesture. Never throws. */
export function primeVoice() {
  if (primePromise) return primePromise;
  primePromise = initVoice()
    .then(() => request(' ', true))
    .then(() => {
      ready = true;
      return true;
    })
    .catch((error) => {
      lastError = String(error?.message || error);
      stopWorker();
      primePromise = null;
      return false;
    });
  return primePromise;
}

/** Return raw mono samples for a line. Used by browser probes only. */
export async function synthesizeVoice(text) {
  if (!await primeVoice()) throw new Error('語音引擎無法使用');
  return request(text);
}

/** Speak one line with the bundled eSpeak NG `yue` voice. */
export async function speakWithESpeak(text, { enabled = true, volume = 1 } = {}) {
  if (!enabled || !text || typeof Worker === 'undefined') return false;
  lastText = String(text);
  try {
    return playSamples(await synthesizeVoice(text), volume);
  } catch {
    return false;
  }
}

/** Small status surface for browser probes; not used by gameplay. */
export function voiceStatus() {
  return {
    supported: typeof Worker !== 'undefined', ready, voice: 'yue', sampleRate, lastError, lastText,
  };
}
