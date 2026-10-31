/* MOBIBARD Wave2MIDI inference worker (classic worker).
 *
 * Runs the whole pipeline off the main thread:
 *   24 kHz mono samples -> frontend features -> ONNX (8 s windows, 2 s overlap)
 *   -> note decoding -> velocity -> Standard MIDI bytes.
 * The model bytes come from lib/model-cache.mjs (IndexedDB, verified by SHA-256).
 *
 * Two builds of the same model are published (model/manifest.json "models"):
 *   fp16 — half-precision compute, WebGPU only, needs the adapter feature "shader-f16"
 *   w16  — 16-bit weights / 32-bit compute, runs everywhere (WebGPU or WebAssembly); the fallback
 * The environment is probed first and only the build that will actually run is downloaded.
 * If the fp16 build cannot be downloaded, initialised or run, the worker falls back to w16.
 */
"use strict";

const BASE = new URL("./", self.location.href);
// Cache-busting token passed by wave2midi.js (worker.js?v=...), reused for the ES module imports.
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const libUrl = name => new URL(`lib/${name}?v=${encodeURIComponent(ASSET_VERSION)}`, BASE).href;
const ORT_VERSION = "1.31.1";
const ORT_FILE = "ort.webgpu.min.js";
const DEFAULT_ORT_SOURCES = [
  new URL("../../vendor/onnxruntime-web/1.31.1/", BASE).href,
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
];

let libsPromise = null;
let ortBase = "";
let session = null;
let sessionInfo = null;
let lastJob = null;

function fail(code, message, cause) {
  const error = new Error(message || code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function loadLibs() {
  libsPromise ??= Promise.all([
    import(libUrl("dsp.mjs")),
    import(libUrl("decode.mjs")),
    import(libUrl("velocity.mjs")),
    import(libUrl("midi.mjs")),
    import(libUrl("model-cache.mjs")),
    import(libUrl("tempo.mjs")),
  ]).then(([dsp, decode, velocity, midi, cache, tempo]) => ({ dsp, decode, velocity, midi, cache, tempo }));
  return libsPromise;
}

function loadOrt(sources) {
  if (self.ort) return ortBase;
  const errors = [];
  for (const base of sources) {
    try {
      importScripts(base + ORT_FILE);
      if (self.ort?.InferenceSession) {
        ortBase = base;
        self.ort.env.wasm.wasmPaths = base;
        // Multi-threaded WASM needs SharedArrayBuffer (cross-origin isolation); GitHub Pages is not isolated.
        self.ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)) : 1;
        return base;
      }
    } catch (error) {
      errors.push(`${base}: ${error?.message || error}`);
    }
  }
  throw fail("runtime-unavailable", "ONNX Runtime could not be loaded. " + errors.join(" | "));
}

// ---- Environment probe -----------------------------------------------------------------
// fp16 needs a WebGPU adapter that exposes "shader-f16" (half floats in WGSL); ONNX Runtime's
// WebGPU backend requests that feature itself when the adapter has it. The result is cached
// for the worker's lifetime.
let capsPromise = null;
function probeCapabilities() {
  capsPromise ??= (async () => {
    const caps = { webgpu: false, shaderF16: false, adapter: "" };
    if (!self.navigator?.gpu) return caps;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return caps;
      caps.webgpu = true;
      caps.shaderF16 = !!adapter.features?.has?.("shader-f16");
      const info = adapter.info || (await adapter.requestAdapterInfo?.().catch(() => null)) || null;
      caps.adapter = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(" ");
      // Confirms a device with half-float shaders can really be created on this adapter
      // (some drivers advertise the feature but refuse the device).
      if (caps.shaderF16) {
        try {
          const device = await adapter.requestDevice({ requiredFeatures: ["shader-f16"] });
          device.destroy?.();
        } catch {
          caps.shaderF16 = false;
        }
      }
    } catch { /* WebGPU blocked or crashed: WebAssembly only */ }
    return caps;
  })();
  return capsPromise;
}

// Builds to try, best first. options.modelVariant: "auto" (default) | "fp16" | "w16".
function cpuOnly(options) {
  return options.executionProvider === "wasm";
}

async function chooseVariants(options) {
  if (cpuOnly(options)) return { caps: { webgpu: false, shaderF16: false, adapter: "", skipped: "cpu-only" }, order: ["w16"] };
  const caps = await probeCapabilities();
  if (options.modelVariant === "w16") return { caps, order: ["w16"] };
  const fp16Ready = caps.webgpu && caps.shaderF16;
  return { caps, order: fp16Ready ? ["fp16", "w16"] : ["w16"] };
}

function executionPlans(variant, options, caps) {
  // fp16 is only worth running on the GPU; on WebAssembly it would be emulated and slower than w16.
  if (variant === "fp16") return [["webgpu"]];
  return cpuOnly(options) || !caps.webgpu ? [["wasm"]] : [["webgpu", "wasm"], ["wasm"]];
}

async function releaseSession() {
  const old = session;
  session = null;
  sessionInfo = null;
  try { await old?.release?.(); } catch { /* already gone */ }
}

async function ensureSession(options, progress) {
  if (session && (!options.modelVariant || options.modelVariant === "auto" || options.modelVariant === sessionInfo?.variant)) return sessionInfo;
  if (session) await releaseSession();
  const libs = await loadLibs();
  progress("runtime", 0, 0);
  loadOrt(options.ortSources?.length ? options.ortSources : DEFAULT_ORT_SOURCES);
  const { caps, order } = await chooseVariants(options);
  const errors = [];
  for (const variant of order) {
    let model;
    try {
      model = await libs.cache.loadModel(new URL("model/", BASE).href, (stage, loaded, total) => progress(stage, loaded, total), { variant });
    } catch (error) {
      // The fallback build is mandatory; a missing/corrupt fp16 build just means "use w16".
      if (variant === order[order.length - 1]) throw error;
      errors.push(`[${variant} download] ${error?.message || error}`);
      continue;
    }
    progress("model-init", 0, 0);
    for (const eps of executionPlans(model.variant, options, caps)) {
      try {
        session = await self.ort.InferenceSession.create(model.bytes, { executionProviders: eps, graphOptimizationLevel: "all" });
        sessionInfo = {
          provider: eps[0],
          variant: model.variant,
          compute: model.compute,
          capabilities: caps,
          runtimeBase: ortBase,
          meta: model.meta,
          manifest: model.manifest,
          modelFromCache: model.fromCache,
          modelStored: model.stored,
          fallbackReasons: errors.slice(),
        };
        if (errors.length) console.warn("[Wave2MIDI] fp16 build unavailable, using", model.variant, errors);
        return sessionInfo;
      } catch (error) {
        errors.push(`[${model.variant} ${eps.join("+")}] ${error?.message || error}`);
      }
    }
  }
  throw fail("model-init-failed", "The model could not be initialised. " + errors.join(" | "));
}

// ---- Frontend features in nested Web Workers ---------------------------------------------
// One window's features take about as long as 5 network runs on a GPU, so several windows are prepared in
// parallel (lib/feature_worker.mjs) while the network runs. Falls back to the calling thread.
class FeaturePool {
  constructor(meta, count) {
    this.meta = meta;
    this.workers = [];
    this.jobs = new Map();
    this.next = 0;
    try {
      if (typeof Worker === "undefined") throw new Error("nested workers unavailable");
      const url = libUrl("feature_worker.mjs");
      for (let i = 0; i < count; i++) {
        const w = new Worker(url, { type: "module" });
        w.onmessage = e => {
          const job = this.jobs.get(e.data.id);
          this.jobs.delete(e.data.id);
          job?.resolve(e.data.f);
        };
        w.onerror = e => {
          // A worker that cannot start (module workers unsupported, blocked, ...): switch to the main path.
          for (const job of this.jobs.values()) job.reject(new Error(e.message || "feature worker failed"));
          this.jobs.clear();
          this.terminate();
        };
        w.postMessage({ meta });
        this.workers.push(w);
      }
    } catch {
      this.terminate();
    }
  }
  get size() { return this.workers.length; }
  features(seg, dsp) {
    if (!this.workers.length) return Promise.resolve(dsp.frontendFeatures(seg, this.meta));
    const id = this.next++;
    const promise = new Promise((resolve, reject) => this.jobs.set(id, { resolve, reject }));
    this.workers[id % this.workers.length].postMessage({ id, seg });   // copied (0.8 MB), so seg stays usable
    // If the pool dies mid-run, recompute on this thread instead of failing the whole conversion.
    return promise.catch(() => dsp.frontendFeatures(seg, this.meta));
  }
  terminate() {
    for (const w of this.workers) { try { w.terminate(); } catch { /* gone */ } }
    this.workers = [];
  }
}

async function transcribe(id, wave, options) {
  const progress = (stage, done = 0, total = 0) => self.postMessage({ type: "progress", id, stage, done, total });
  let info = await ensureSession(options, progress);
  const { dsp, decode, velocity, midi, tempo } = await loadLibs();
  const meta = info.meta;
  const seconds = wave.length / dsp.SR;
  const maxSeconds = Number(options.maxSeconds) || 0;
  if (maxSeconds > 0 && seconds > maxSeconds) throw fail("too-long", `Audio is longer than ${maxSeconds} seconds`);
  const started = performance.now();

  // Features for several windows are prepared in parallel workers while the network runs.
  // lowMemory (iPhone / iPad): no helper workers and only one window prepared ahead. Every helper worker and every
  // prepared window (13.5 MB each) adds to the memory of the tab, and iOS reloads the page when it runs out.
  const cores = navigator.hardwareConcurrency || 4;
  const poolSize = options.lowMemory ? 0 : Math.max(1, Math.min(8, cores - 2));
  const pool = new FeaturePool(meta, poolSize);
  const predictOptions = { prepare: seg => pool.features(seg, dsp), lookahead: Math.max(1, pool.size) };
  const runWindow = async feats => {
    const input = new self.ort.Tensor("float32", feats, meta.input.shape);
    const result = await session.run({ [meta.input.name || "features"]: input });
    const out = {
      onset: result.onset.data, frame: result.frame.data, offset: result.offset.data,
      drum: result.drum.data, inst: result.inst.data,
    };
    input.dispose?.();
    return out;
  };
  // Same window layout as decode.predictSong, so the first progress tick already shows the real count.
  let W = Math.round(meta.window_seconds * dsp.FPS); W += W % 2;
  const hopFrames = W - Math.min(Math.round(meta.overlap_seconds * dsp.FPS), W / 2);
  const totalFrames = Math.ceil(wave.length / dsp.HOP);
  const windowCount = totalFrames > W ? 1 + Math.ceil((totalFrames - W) / hopFrames) : 1;
  progress("analyze", 0, windowCount);
  let predicted;
  try {
    predicted = await decode.predictSong(wave, meta, runWindow, (done, total) => progress("analyze", done, total), predictOptions);
  } catch (error) {
    // Some GPUs pass the probe but fail (or lose the device) while running half precision.
    if (info.variant !== "fp16" || error instanceof RangeError) throw error;
    console.warn("[Wave2MIDI] fp16 inference failed, retrying with the w16 build", error);
    await releaseSession();
    info = await ensureSession({ ...options, modelVariant: "w16" }, progress);
    info.fallbackReasons = [...(info.fallbackReasons || []), `[fp16 run] ${error?.message || error}`];
    progress("analyze", 0, windowCount);
    predicted = await decode.predictSong(wave, meta, runWindow, (done, total) => progress("analyze", done, total), predictOptions);
  } finally {
    pool.terminate();
    // iPad / iPhone: the WebGPU weights and buffers of the session stay allocated while the worker idles, and the
    // tab was killed shortly after a conversion finished. Free them right away (the next conversion reloads the
    // model from the IndexedDB copy). The probability maps stay, so "postprocess" still works without the model.
    if (options.lowMemory) await releaseSession();
  }
  // The model output is kept so post-processing options (note sensitivity, velocity, tempo) can be
  // re-applied without running the model again ("postprocess" message). Freed with the worker.
  lastJob = { probs: predicted.probs, T: predicted.T, wave, seconds, info };
  return finishTranscription(lastJob, options, progress, started);
}

// Post-processing: probability maps -> notes -> velocity -> tempo map -> MIDI.
//   options.onsetThreshold  note sensitivity (lower = more notes); default meta.thresholds.onset
//   options.velocity        true/undefined: estimated, false: constant 100, number: that fixed velocity (1-127)
//   options.velocityRange   [min, max] (1-127) range of estimated velocities; default meta.velocity min/max
//   options.tempo           true/undefined: auto, false: 120 BPM grid, number: that fixed BPM
//   options.tempoChanges    false: one tempo for the whole song (auto mode only)
async function finishTranscription(job, options, progress, started = performance.now()) {
  const { decode, velocity, midi, tempo } = await loadLibs();
  const { probs, T, wave, seconds, info } = job;
  const meta = info.meta;
  const onset = Number(options.onsetThreshold);
  const thresholds = { ...meta.thresholds, ...(onset > 0 && onset < 1 ? { onset } : {}) };
  const notes = decode.decodeNotes(probs, T, meta.classes, thresholds);
  let velocities = null;
  const fixedVelocity = typeof options.velocity === "number" && options.velocity > 0
    ? Math.min(127, Math.max(1, Math.round(options.velocity)))
    : (options.velocity === false ? 100 : 0);
  if (!fixedVelocity && meta.velocity?.enabled !== false && notes.length) {
    progress("velocity", 0, 0);
    const cfg = { ...meta.velocity };
    const range = Array.isArray(options.velocityRange) ? options.velocityRange.map(Number) : null;
    if (range && range.every((value) => Number.isFinite(value))) {
      const lo = Math.min(127, Math.max(1, Math.round(Math.min(range[0], range[1]))));
      const hi = Math.min(127, Math.max(1, Math.round(Math.max(range[0], range[1]))));
      cfg.min = lo;
      cfg.max = hi;
    }
    velocities = velocity.estimateVelocity(wave, notes, cfg);
  }
  // Tempo map from the notes (on by default): the MIDI then carries the detected tempo changes and
  // bar positions instead of a constant 120 BPM grid. options.tempo === false keeps the audio timing at
  // 120 BPM; a number fixes that BPM.
  let tempoMap = null;
  if (options.tempo !== false && notes.length) {
    progress("tempo", 0, 0);
    // Only an explicit number fixes the BPM; true / undefined mean automatic (Number(true) would be 1 BPM).
    const fixed = typeof options.tempo === "number" ? options.tempo : NaN;
    const cfg = { ...(meta.tempo || {}), mode: Number.isFinite(fixed) && fixed > 0 ? fixed : "auto" };
    if (typeof options.tempoChanges === "boolean") cfg.changes = options.tempoChanges;
    try {
      tempoMap = tempo.tempoMap(notes, seconds, cfg);
    } catch (error) {
      console.warn("[Wave2MIDI] tempo estimation failed; using 120 BPM", error);
      tempoMap = null;
    }
  }
  progress("midi", 0, 0);
  const midiBytes = midi.midiBytes(notes, velocities ?? (fixedVelocity || 100), 480, 120, tempoMap);
  return {
    notes,
    velocities,
    midi: midiBytes,
    seconds,
    elapsed: (performance.now() - started) / 1000,
    provider: info.provider,
    variant: info.variant,
    thresholds,
    tempo: tempoMap,
    classes: meta.classes.slice(),
    model: {
      id: info.manifest?.id, sha256: info.manifest?.sha256, version: meta.version, step: meta.step,
      author: meta.author || info.manifest?.author || "", license: meta.license?.spdx || info.manifest?.license || "",
      fromCache: info.modelFromCache, stored: info.modelStored,
      variant: info.variant, compute: info.compute,
    },
  };
}

self.onmessage = async event => {
  const { id, type } = event.data || {};
  try {
    if (type === "transcribe") {
      const result = await transcribe(id, event.data.wave, event.data.options || {});
      const transfer = [result.midi.buffer];
      if (result.velocities) transfer.push(result.velocities.buffer);
      self.postMessage({ type: "result", id, result }, transfer);
    } else if (type === "postprocess") {
      if (!lastJob) throw fail("no-job", "No transcription to post-process (the worker was released)");
      const progress = (stage, done = 0, total = 0) => self.postMessage({ type: "progress", id, stage, done, total });
      const result = await finishTranscription(lastJob, event.data.options || {}, progress);
      const transfer = [result.midi.buffer];
      if (result.velocities) transfer.push(result.velocities.buffer);
      self.postMessage({ type: "result", id, result }, transfer);
    } else if (type === "preload") {
      const info = await ensureSession(event.data.options || {}, (stage, done, total) => self.postMessage({ type: "progress", id, stage, done, total }));
      self.postMessage({ type: "result", id, result: {
        provider: info.provider,
        variant: info.variant,
        capabilities: info.capabilities,
        model: { id: info.manifest?.id, variant: info.variant, compute: info.compute, fromCache: info.modelFromCache, stored: info.modelStored },
      } });
    } else if (type === "status") {
      const { cache } = await loadLibs();
      const { caps, order } = await chooseVariants(event.data.options || {});
      const status = await cache.getCacheStatus(new URL("model/", BASE).href, order[0]);
      self.postMessage({ type: "result", id, result: { ...status, capabilities: caps } });
    } else if (type === "capabilities") {
      const { caps, order } = await chooseVariants(event.data.options || {});
      self.postMessage({ type: "result", id, result: { ...caps, variant: order[0] } });
    } else if (type === "clear") {
      const { cache } = await loadLibs();
      self.postMessage({ type: "result", id, result: { removed: await cache.clearCache() } });
    } else {
      throw fail("bad-request", `Unknown message type: ${type}`);
    }
  } catch (error) {
    const code = error instanceof RangeError ? "out-of-memory" : (error?.code || "failed");
    self.postMessage({ type: "error", id, code, message: error?.message || String(error) });
  }
};
