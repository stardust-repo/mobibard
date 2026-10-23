/* MOBIBARD Wave2MIDI inference worker (classic worker).
 *
 * Runs the whole pipeline off the main thread:
 *   24 kHz mono samples -> frontend features -> ONNX (8 s windows, 2 s overlap)
 *   -> note decoding -> velocity -> Standard MIDI bytes.
 * The model bytes come from lib/model-cache.mjs (IndexedDB, verified by SHA-256).
 */
"use strict";

const BASE = new URL("./", self.location.href);
// Cache-busting token passed by wave2midi.js (worker.js?v=...), reused for the ES module imports.
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const libUrl = name => new URL(`lib/${name}?v=${encodeURIComponent(ASSET_VERSION)}`, BASE).href;
const ORT_VERSION = "1.20.1";
const ORT_FILE = "ort.webgpu.min.js";
const DEFAULT_ORT_SOURCES = [
  new URL("vendor/onnxruntime-web/", BASE).href,
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`,
];

let libsPromise = null;
let ortBase = "";
let session = null;
let sessionInfo = null;

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
  ]).then(([dsp, decode, velocity, midi, cache]) => ({ dsp, decode, velocity, midi, cache }));
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
        self.ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
        return base;
      }
    } catch (error) {
      errors.push(`${base}: ${error?.message || error}`);
    }
  }
  throw fail("runtime-unavailable", "ONNX Runtime could not be loaded. " + errors.join(" | "));
}

async function hasWebGpu() {
  if (!self.navigator?.gpu) return false;
  try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
}

async function ensureSession(options, progress) {
  if (session) return sessionInfo;
  const libs = await loadLibs();
  progress("runtime", 0, 0);
  loadOrt(options.ortSources?.length ? options.ortSources : DEFAULT_ORT_SOURCES);
  const model = await libs.cache.loadModel(new URL("model/", BASE).href, (stage, loaded, total) => progress(stage, loaded, total));
  progress("model-init", 0, 0);
  const plans = options.executionProvider === "wasm" || !(await hasWebGpu()) ? [["wasm"]] : [["webgpu", "wasm"], ["wasm"]];
  const errors = [];
  for (const eps of plans) {
    try {
      session = await self.ort.InferenceSession.create(model.bytes, { executionProviders: eps, graphOptimizationLevel: "all" });
      sessionInfo = {
        provider: eps[0],
        runtimeBase: ortBase,
        meta: model.meta,
        manifest: model.manifest,
        modelFromCache: model.fromCache,
        modelStored: model.stored,
      };
      return sessionInfo;
    } catch (error) {
      errors.push(`[${eps.join("+")}] ${error?.message || error}`);
    }
  }
  throw fail("model-init-failed", "The model could not be initialised. " + errors.join(" | "));
}

async function transcribe(id, wave, options) {
  const progress = (stage, done = 0, total = 0) => self.postMessage({ type: "progress", id, stage, done, total });
  const info = await ensureSession(options, progress);
  const { dsp, decode, velocity, midi } = await loadLibs();
  const meta = info.meta;
  const seconds = wave.length / dsp.SR;
  const maxSeconds = Number(options.maxSeconds) || 0;
  if (maxSeconds > 0 && seconds > maxSeconds) throw fail("too-long", `Audio is longer than ${maxSeconds} seconds`);
  const started = performance.now();

  const runWindow = async segment => {
    const input = new self.ort.Tensor("float32", dsp.frontendFeatures(segment, meta), meta.input.shape);
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
  const { probs, T } = await decode.predictSong(wave, meta, runWindow, (done, total) => progress("analyze", done, total));
  const onset = Number(options.onsetThreshold);
  const thresholds = { ...meta.thresholds, ...(onset > 0 && onset < 1 ? { onset } : {}) };
  const notes = decode.decodeNotes(probs, T, meta.classes, thresholds);
  let velocities = null;
  if (options.velocity !== false && meta.velocity?.enabled !== false && notes.length) {
    progress("velocity", 0, 0);
    velocities = velocity.estimateVelocity(wave, notes, meta.velocity);
  }
  progress("midi", 0, 0);
  const midiBytes = midi.midiBytes(notes, velocities ?? 100);
  return {
    notes,
    velocities,
    midi: midiBytes,
    seconds,
    elapsed: (performance.now() - started) / 1000,
    provider: info.provider,
    thresholds,
    classes: meta.classes.slice(),
    model: {
      id: info.manifest?.id, sha256: info.manifest?.sha256, version: meta.version, step: meta.step,
      author: meta.author || info.manifest?.author || "", license: meta.license?.spdx || info.manifest?.license || "",
      fromCache: info.modelFromCache, stored: info.modelStored,
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
    } else if (type === "preload") {
      const info = await ensureSession(event.data.options || {}, (stage, done, total) => self.postMessage({ type: "progress", id, stage, done, total }));
      self.postMessage({ type: "result", id, result: { provider: info.provider, model: { id: info.manifest?.id, fromCache: info.modelFromCache, stored: info.modelStored } } });
    } else if (type === "status") {
      const { cache } = await loadLibs();
      self.postMessage({ type: "result", id, result: await cache.getCacheStatus(new URL("model/", BASE).href) });
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
