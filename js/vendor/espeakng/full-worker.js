/*
 * Small Web Worker adapter around the npm `espeak-ng` browser build.
 * Each request creates one short-lived eSpeak instance, synthesises a WAV into
 * its private Emscripten filesystem, and returns decoded mono PCM. The 18 MB
 * WASM module is fetched once by the browser; later instances use the compiled
 * code cache, so each announcement stays fast.
 */
import ESpeakNg from './espeak-ng.js';

function findChunk(bytes, name, start = 12) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let pos = start; pos + 8 <= bytes.length;) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = view.getUint32(pos + 4, true);
    if (id === name) return { pos: pos + 8, size };
    pos += 8 + size + (size % 2);
  }
  return null;
}

function decodeWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fmt = findChunk(bytes, 'fmt ');
  const data = findChunk(bytes, 'data');
  if (!fmt || !data) throw new Error('語音檔格式不正確');
  const channels = view.getUint16(fmt.pos + 2, true);
  const sampleRate = view.getUint32(fmt.pos + 4, true);
  const bits = view.getUint16(fmt.pos + 14, true);
  if (bits !== 16 || channels < 1) throw new Error('語音檔格式不支援');
  const frames = Math.floor(data.size / (channels * 2));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(data.pos + (frame * channels + channel) * 2, true);
    }
    samples[frame] = sum / channels / 32768;
  }
  return { samples, sampleRate };
}

async function render(text) {
  const module = await ESpeakNg({
    arguments: ['-v', 'yue', '-s', '150', '-w', 'voice.wav', String(text || ' ')],
    // eSpeak writes diagnostics and raw WAV bytes to stdio. Drop both so the
    // worker stays quiet and only the decoded samples cross the boundary.
    print() {},
    printErr() {},
  });
  return decodeWav(module.FS.readFile('voice.wav'));
}

async function handle({ id, text, prime }) {
  try {
    const { samples, sampleRate } = await render(prime ? ' ' : text);
    self.postMessage({ id, samples: samples.buffer, sampleRate }, [samples.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
}

let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(() => handle(event.data));
};

postMessage('ready');
