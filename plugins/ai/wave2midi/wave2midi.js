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
  const VERSION = "1.0.14";
  const SAMPLE_RATE = 24000;
  const IDLE_TERMINATE_MS = 3 * 60 * 1000;
  // predictSong keeps T x 88 x K instrument probabilities in memory (K = meta.classes.length;
  // 16 classes ≈ 34 MB per minute of audio).
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

  // Safari / every iOS & iPadOS browser (all WebKit).
  function isAppleWebKit() {
    const nav = root.navigator || {};
    const ua = String(nav.userAgent || "");
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1);
    const desktopSafari = /AppleWebKit\//.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(ua);
    return iOS || desktopSafari;
  }
  const APPLE_WEBKIT = isAppleWebKit();

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

  // 2:1 decimation 48 kHz -> 24 kHz with a windowed-sinc low-pass (cutoff 11 kHz, 63 taps).
  let halfBandTaps = null;
  function decimate48kTo24k(input) {
    if (!halfBandTaps) {
      const N = 63, M = (N - 1) / 2, fc = 11000 / 48000;
      halfBandTaps = new Float32Array(N);
      let sum = 0;
      for (let n = 0; n < N; n += 1) {
        const k = n - M;
        const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
        const window = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (N - 1));
        halfBandTaps[n] = sinc * window;
        sum += halfBandTaps[n];
      }
      for (let n = 0; n < N; n += 1) halfBandTaps[n] /= sum;
    }
    const taps = halfBandTaps, N = taps.length, M = (N - 1) >> 1;
    const out = new Float32Array(Math.ceil(input.length / 2));
    for (let i = 0; i < out.length; i += 1) {
      const center = i * 2;
      let acc = 0;
      for (let n = 0; n < N; n += 1) {
        const j = center + n - M;
        if (j >= 0 && j < input.length) acc += input[j] * taps[n];
      }
      out[i] = acc;
    }
    return out;
  }

  /** File | Blob | ArrayBuffer -> Float32Array (mono, 24 kHz). */
  async function decodeAudio(input) {
    const Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Offline) throw makeError("unsupported", "OfflineAudioContext is not available");
    const buffer = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer();
    // Apple WebKit: no audio object at a non-standard rate (24 kHz) is created, because a tab whose
    // Web Audio state was touched at an unusual rate is suspected of staying silent until it is
    // closed. Decode/down-mix at 48 kHz instead and resample to 24 kHz here.
    if (APPLE_WEBKIT) {
      const RATE = 48000;
      let decoded;
      try {
        decoded = await new Offline(1, 1, RATE).decodeAudioData(buffer);
      } catch (error) {
        throw makeError("decode-failed", error?.message || "Audio decoding failed");
      }
      const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
      const mixer = new Offline(1, frames, RATE);
      const mixSource = mixer.createBufferSource();
      mixSource.buffer = decoded; // down-mixed to mono at 48 kHz by the browser
      mixSource.connect(mixer.destination);
      mixSource.start();
      return decimate48kTo24k((await mixer.startRendering()).getChannelData(0));
    }
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
   * options: { velocity=true (false: constant 100, number: fixed velocity), velocityRange=[min,max],
   *            tempo=true (false: constant 120 BPM, number: fixed BPM), tempoChanges, onsetThreshold,
   *            maxSeconds=600, executionProvider: "auto"|"wasm", modelVariant: "auto"|"fp16"|"w16",
   *            ortSources: string[], onProgress({stage, done, total}), signal }
   * Progress stages: decode, runtime, model-check, model-download, model-store, model-init,
   *                  analyze (done/total windows), velocity, midi.
   * Result: { notes: [[pitch, program(128=drum), onsetSec, offsetSec, confidence]], velocities,
   *           midi: Uint8Array, seconds, elapsed, provider, variant ("fp16"|"w16"), thresholds, classes, model, storage }
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
        velocity: options.velocity ?? true,
        velocityRange: options.velocityRange,
        tempo: options.tempo ?? true,
        tempoChanges: options.tempoChanges,
        onsetThreshold: options.onsetThreshold,
        maxSeconds,
        executionProvider: options.executionProvider || "auto",
        modelVariant: options.modelVariant || "auto",
        ortSources: options.ortSources,
      },
    }, { onProgress, signal, transfer: [wave.buffer] });
    result.storage = await storagePromise;
    return result;
  }

  /**
   * Re-applies post-processing options (onsetThreshold, velocity, velocityRange, tempo, tempoChanges) to the last
   * transcription without running the model again. Rejects with code "no-job" when the worker was
   * released in the meantime (idle timeout, abort) — call transcribe() again in that case.
   */
  async function postprocess(options = {}) {
    if (!worker) throw makeError("no-job", "No transcription to post-process");
    return call("postprocess", { options: {
      velocity: options.velocity ?? true,
      velocityRange: options.velocityRange,
      tempo: options.tempo ?? true,
      tempoChanges: options.tempoChanges,
      onsetThreshold: options.onsetThreshold,
    } }, options);
  }

  /** Default post-processing values from model/meta.json (no model download). */
  let defaultsPromise = null;
  function getPostprocessDefaults() {
    defaultsPromise ??= fetch(new URL("model/meta.json", BASE).href, { cache: "no-cache" })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(meta => Object.freeze({
        onsetThreshold: Number(meta?.thresholds?.onset) || 0.16,
        velocity: meta?.velocity?.enabled !== false,
        velocityMin: Number(meta?.velocity?.min) || 35,
        velocityMax: Number(meta?.velocity?.max) || 120,
        tempoChanges: meta?.tempo?.changes !== false,
        tempoMin: Number(meta?.tempo?.min) || 32,
        tempoMax: Number(meta?.tempo?.max) || 255,
      }))
      .catch(error => { defaultsPromise = null; throw error; });
    return defaultsPromise;
  }

  /** Download/verify the model and create the session ahead of time. */
  async function preload(options = {}) {
    const storagePromise = requestPersistentStorage();
    const result = await call("preload", { options: {
      executionProvider: options.executionProvider || "auto",
      modelVariant: options.modelVariant || "auto",
      ortSources: options.ortSources,
    } }, options);
    result.storage = await storagePromise;
    return result;
  }

  /** Which build this browser would use: { webgpu, shaderF16, adapter, variant: "fp16"|"w16" } (no download). */
  function getCapabilities(options = {}) {
    return call("capabilities", { options: { executionProvider: options.executionProvider || "auto", modelVariant: options.modelVariant || "auto" } });
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

  // ---- Helpers shared by products that import audio through their normal file loaders ----
  const AUDIO_EXTENSIONS = new Set(["wav", "wave", "mp3", "ogg", "oga", "opus", "m4a", "aac", "flac", "webm", "aif", "aiff"]);

  /** True for audio files this module can transcribe (not MIDI/karaoke, which are "audio/*" too). */
  function isAudioFile(fileOrName, mimeType = "") {
    const name = typeof fileOrName === "string" ? fileOrName : String(fileOrName?.name || "");
    const type = String((typeof fileOrName === "string" ? mimeType : fileOrName?.type) || mimeType || "").toLowerCase();
    const extension = (name.toLowerCase().match(/\.([^.]+)$/)?.[1] || "");
    if (AUDIO_EXTENSIONS.has(extension)) return true;
    return type.startsWith("audio/") && !/midi|kar/.test(type);
  }

  /**
   * Localized progress line. tr(name, values) is the product's translator for these logical names:
   * preparing, downloading ({0}/{1} MB), analyzing ({0} %).
   */
  function progressText(event, tr) {
    const stage = String(event?.stage || "");
    const done = Number(event?.done) || 0;
    const total = Number(event?.total) || 0;
    if (stage === "model-download") return tr("downloading", [(done / 1e6).toFixed(1), ((total || done) / 1e6).toFixed(1)]);
    if (stage === "analyze") return tr("analyzing", [total > 0 ? Math.round((done / total) * 100) : 0]);
    return tr("preparing", []);
  }

  /** 0..1 for stages with real progress, otherwise null (indeterminate). */
  function progressFraction(event) {
    const done = Number(event?.done) || 0;
    const total = Number(event?.total) || 0;
    if ((event?.stage === "model-download" || event?.stage === "analyze") && total > 0) return Math.max(0, Math.min(1, done / total));
    return null;
  }

  /** Localized error line. tr names: err_unsupported, err_decode, err_too_long ({0} minutes), err_runtime,
   *  err_model, err_memory, no_notes, failed ({0} = raw message). */
  function errorText(error, tr, { maxMinutes = 10 } = {}) {
    const code = String(error?.code || "");
    const map = {
      unsupported: ["err_unsupported", []],
      "decode-failed": ["err_decode", []],
      "too-long": ["err_too_long", [maxMinutes]],
      "runtime-unavailable": ["err_runtime", []],
      "model-init-failed": ["err_runtime", []],
      "model-unavailable": ["err_model", []],
      "model-corrupt": ["err_model", []],
      "out-of-memory": ["err_memory", []],
      "no-notes": ["no_notes", []],
    };
    const [name, values] = map[code] || ["failed", [String(error?.message || error || "")]];
    return tr(name, values);
  }

  // Small persistent progress notice (toasts in Simple/Player auto-hide after ~2 s, while a
  // transcription can take a minute). One notice per page; styles are injected once.
  let noticeElement = null;
  function ensureNotice() {
    if (noticeElement?.isConnected) return noticeElement;
    if (!document.getElementById("w2m-progress-notice-style")) {
      const style = document.createElement("style");
      style.id = "w2m-progress-notice-style";
      style.textContent = `
.w2m-progress-notice{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:2147483000;transform:translateX(-50%);
  width:min(360px,calc(100vw - 32px));box-sizing:border-box;display:grid;gap:7px;padding:10px 14px 12px;border-radius:12px;
  background:rgba(22,27,34,.94);color:#f5f7fa;font:600 12.5px/1.35 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;
  box-shadow:0 12px 32px rgba(0,0,0,.28);pointer-events:none}
.w2m-progress-notice[hidden]{display:none}
.w2m-progress-notice span{overflow-wrap:anywhere}
.w2m-progress-notice progress{width:100%;height:6px;accent-color:#5b8def}
@media (prefers-color-scheme: light){.w2m-progress-notice{background:rgba(255,255,255,.97);color:#1c2430;border:1px solid rgba(20,30,45,.14)}}`;
      document.head.append(style);
    }
    noticeElement = document.createElement("div");
    noticeElement.className = "w2m-progress-notice";
    noticeElement.setAttribute("role", "status");
    noticeElement.setAttribute("aria-live", "polite");
    noticeElement.hidden = true;
    noticeElement.innerHTML = "<span></span><progress max=\"1\"></progress>";
    document.body.append(noticeElement);
    return noticeElement;
  }

  function showProgressNotice(text, fraction = null) {
    const notice = ensureNotice();
    notice.querySelector("span").textContent = String(text || "");
    const bar = notice.querySelector("progress");
    if (fraction == null) bar.removeAttribute("value");
    else bar.value = Math.max(0, Math.min(1, Number(fraction) || 0));
    notice.hidden = false;
  }

  function hideProgressNotice() {
    if (noticeElement) noticeElement.hidden = true;
  }

  root.MobibardWave2Midi = Object.freeze({
    version: VERSION,
    isAppleWebKit: APPLE_WEBKIT,
    SAMPLE_RATE,
    DRUM_PROGRAM: 128,
    isSupported,
    decodeAudio,
    transcribe,
    postprocess,
    getPostprocessDefaults,
    preload,
    getCacheStatus,
    getCapabilities,
    getModelInfo,
    clearCache,
    requestPersistentStorage,
    toMidiFile,
    isAudioFile,
    progressText,
    progressFraction,
    errorText,
    showProgressNotice,
    hideProgressNotice,
    dispose: () => disposeWorker(),
  });
})();
