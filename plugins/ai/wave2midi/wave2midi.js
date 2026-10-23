/* MOBIBARD Wave2MIDI — shared audio-to-MIDI transcription (classic script).
 *
 *   <script src="../plugins/ai/wave2midi/wave2midi.js"></script>
 *   const result = await MobibardWave2Midi.transcribe(file, { onProgress, signal });
 *   const midiFile = MobibardWave2Midi.toMidiFile(result, file.name);
 *
 * Nothing is loaded until the first call: the worker, ONNX Runtime and the model are
 * fetched lazily. The model is kept in IndexedDB and persistent storage is requested so
 * the browser does not evict it on its own (see lib/model-cache.mjs).
 */
(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const scriptUrl = document.currentScript?.src || new URL("plugins/ai/wave2midi/wave2midi.js", document.baseURI).href;
  const BASE = new URL("./", scriptUrl);
  const VERSION = "1.0.3";
  const SAMPLE_RATE = 24000;
  const IDLE_TERMINATE_MS = 3 * 60 * 1000;
  // predictSong keeps T x 88 x 23 instrument probabilities in memory (~49 MB per minute of audio).
  const DEFAULT_MAX_SECONDS = 10 * 60;

  let worker = null;
  let idleTimer = 0;
  let nextId = 1;
  const pending = new Map();

  function makeError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  function isSupported() {
    return typeof Worker === "function"
      && typeof WebAssembly === "object"
      && typeof indexedDB !== "undefined"
      && !!root.crypto?.subtle
      && typeof (root.OfflineAudioContext || root.webkitOfflineAudioContext) === "function";
  }

  function disposeWorker(reason = "disposed") {
    window.clearTimeout(idleTimer);
    if (worker) { worker.terminate(); worker = null; }
    for (const entry of pending.values()) entry.reject(makeError(reason === "aborted" ? "aborted" : "disposed", reason));
    pending.clear();
  }

  function scheduleIdleTerminate() {
    window.clearTimeout(idleTimer);
    if (pending.size) return;
    // Releases the ONNX session (~100 MB+) when the feature has not been used for a while.
    idleTimer = window.setTimeout(() => { if (!pending.size) disposeWorker(); }, IDLE_TERMINATE_MS);
  }

  function getWorker() {
    window.clearTimeout(idleTimer);
    if (worker) return worker;
    worker = new Worker(new URL(`worker.js?v=${VERSION}`, BASE).href);
    worker.onmessage = event => {
      const message = event.data || {};
      const entry = pending.get(message.id);
      if (!entry) return;
      if (message.type === "progress") { entry.onProgress?.(message); return; }
      pending.delete(message.id);
      if (message.type === "result") entry.resolve(message.result);
      else entry.reject(makeError(message.code || "failed", message.message));
      scheduleIdleTerminate();
    };
    worker.onerror = event => {
      event.preventDefault?.();
      disposeWorker(event.message || "worker-error");
    };
    return worker;
  }

  function call(type, payload = {}, { onProgress, signal, transfer = [] } = {}) {
    if (signal?.aborted) return Promise.reject(makeError("aborted", "aborted"));
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, onProgress });
      if (signal) {
        signal.addEventListener("abort", () => {
          // The pipeline is CPU/GPU bound inside the worker; terminating it is the only real cancel.
          if (pending.has(id)) disposeWorker("aborted");
        }, { once: true });
      }
      getWorker().postMessage({ id, type, ...payload }, transfer);
    });
  }

  async function requestPersistentStorage() {
    const storage = root.navigator?.storage;
    if (!storage?.persist) return { supported: false, persisted: false };
    try {
      if (await storage.persisted?.()) return { supported: true, persisted: true };
      return { supported: true, persisted: !!(await storage.persist()) };
    } catch {
      return { supported: true, persisted: false };
    }
  }

  /** File | Blob | ArrayBuffer -> Float32Array (mono, 24 kHz). */
  async function decodeAudio(input) {
    const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Offline) throw makeError("unsupported", "OfflineAudioContext is not available");
    const buffer = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer();
    let audio;
    try {
      audio = await new Offline(1, 1, SAMPLE_RATE).decodeAudioData(buffer);
    } catch (error) {
      throw makeError("decode-failed", error?.message || "Audio decoding failed");
    }
    const length = Math.max(1, Math.ceil(audio.duration * SAMPLE_RATE));
    const offline = new Offline(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = audio; // down-mixed to mono and resampled to 24 kHz by the browser
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0).slice();
  }

  /**
   * input: File | Blob | ArrayBuffer | Float32Array (already mono 24 kHz).
   * options: { velocity=true, onsetThreshold, maxSeconds=600, executionProvider: "auto"|"wasm",
   *            ortSources: string[], onProgress({stage, done, total}), signal }
   * Progress stages: decode, runtime, model-check, model-download, model-store, model-init,
   *                  analyze (done/total windows), velocity, midi.
   * Result: { notes: [[pitch, program(128=drum), onsetSec, offsetSec, confidence]], velocities,
   *           midi: Uint8Array, seconds, elapsed, provider, thresholds, classes, model, storage }
   */
  async function transcribe(input, options = {}) {
    if (!isSupported()) throw makeError("unsupported", "This browser cannot run Wave2MIDI");
    const { onProgress, signal } = options;
    const storagePromise = requestPersistentStorage();
    let wave;
    if (input instanceof Float32Array) wave = input.slice();
    else {
      onProgress?.({ stage: "decode", done: 0, total: 0 });
      wave = await decodeAudio(input);
    }
    if (signal?.aborted) throw makeError("aborted", "aborted");
    const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;
    if (maxSeconds > 0 && wave.length / SAMPLE_RATE > maxSeconds) throw makeError("too-long", `Audio is longer than ${maxSeconds} seconds`);
    const result = await call("transcribe", {
      wave,
      options: {
        velocity: options.velocity !== false,
        onsetThreshold: options.onsetThreshold,
        maxSeconds,
        executionProvider: options.executionProvider || "auto",
        ortSources: options.ortSources,
      },
    }, { onProgress, signal, transfer: [wave.buffer] });
    result.storage = await storagePromise;
    return result;
  }

  /** Download/verify the model and create the session ahead of time. */
  async function preload(options = {}) {
    const storagePromise = requestPersistentStorage();
    const result = await call("preload", { options: { executionProvider: options.executionProvider || "auto", ortSources: options.ortSources } }, options);
    result.storage = await storagePromise;
    return result;
  }

  async function getCacheStatus() {
    const status = await call("status");
    const storage = root.navigator?.storage;
    try { status.persisted = !!(await storage?.persisted?.()); } catch { status.persisted = false; }
    return status;
  }

  function clearCache() {
    disposeWorker();
    return call("clear");
  }

  let modelInfoPromise = null;
  /** Model name / version / author / license from model/manifest.json (no model download). */
  function getModelInfo() {
    modelInfoPromise ??= fetch(new URL("model/manifest.json", BASE).href, { cache: "no-cache" })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(manifest => Object.freeze({
        name: String(manifest.name || "Wave2MIDI"),
        version: String(manifest.version || ""),
        author: String(manifest.author || ""),
        license: String(manifest.license || ""),
        licenseUrl: manifest.licenseFile ? new URL(`model/${manifest.licenseFile}`, BASE).href : "",
      }))
      .catch(error => { modelInfoPromise = null; throw error; });
    return modelInfoPromise;
  }

  function toMidiFile(result, sourceName = "audio") {
    const base = String(sourceName || "audio").replace(/\.[^./\\]+$/, "") || "audio";
    return new File([result.midi], `${base}.mid`, { type: "audio/midi" });
  }

  root.MobibardWave2Midi = Object.freeze({
    version: VERSION,
    SAMPLE_RATE,
    DRUM_PROGRAM: 128,
    isSupported,
    decodeAudio,
    transcribe,
    preload,
    getCacheStatus,
    getModelInfo,
    clearCache,
    requestPersistentStorage,
    toMidiFile,
    dispose: () => disposeWorker(),
  });
})();
