/* MOBIBARD Wave2MIDI inference worker (classic worker).
 *
 * Runs the whole pipeline off the main thread:
 *   24 kHz mono samples -> frontend features -> ONNX (6 s windows, 1 s overlap)
 *   -> state decoder -> velocity -> tempo map -> Standard MIDI bytes.
 * The model bytes come from lib/model-cache.mjs (IndexedDB, verified by SHA-256).
 *
 * Wave2MIDI v2 ships as one build (model/manifest.json "models.w16"): weights stored as 16-bit, maths in 32-bit.
 * The same file runs on WebGPU and on the CPU (WebAssembly); the GPU is used when the browser offers it.
 * The note decoder is fixed to the state decoder (lib/w2m_web.mjs decodeStates).
 */
"use strict";

const BASE = new URL("./", self.location.href);
// Cache-busting token passed by wave2midi.js (worker.js?v=...), reused for the ES module imports.
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const libUrl = name => new URL(`lib/${name}?v=${encodeURIComponent(ASSET_VERSION)}`, BASE).href;
// ONNX Runtime Web 1.31.1 builds: the CPU-only build when the model runs on the CPU anyway, the WebGPU build otherwise.
const ORT_RUNTIMES = {
  modernGpu: { version: "1.31.1", file: "ort.webgpu.min.js" },
  modernCpu: { version: "1.31.1", file: "ort.wasm.min.js" },
};
function pickRuntime(options, caps) {
  return options?.executionProvider === "wasm" || !caps?.webgpu ? ORT_RUNTIMES.modernCpu : ORT_RUNTIMES.modernGpu;
}
// Model outputs the state decoder uses (fetching only these keeps the read-back from the GPU small).
// peak decoder (decoderMode "peak"): onset/frame/offset maps instead of the state map.
const DEFAULT_TEMPO_FALLBACK = { integer_tolerance: 0.015, integer_block_beats: 8 };
const STATE_OUTPUTS = ["state", "drum", "inst"];
const PEAK_OUTPUTS = ["onset", "frame", "offset", "drum", "inst"];
const neededOutputsFor = mode => (mode === "peak" ? PEAK_OUTPUTS : STATE_OUTPUTS);
function ortSourcesFor(runtime) {
  return [
    new URL(`../../vendor/onnxruntime-web/${runtime.version}/`, BASE).href,
    `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtime.version}/dist/`,
  ];
}
let ortFile = ORT_RUNTIMES.modernGpu.file;
let ortVersion = "";

// CPU sessions: do not keep a memory arena / planned buffers between runs (measured: far less memory per session).
const CPU_MEMORY_OPTIONS = { enableCpuMemArena: false, enableMemPattern: false };

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
    import(libUrl("w2m_web.mjs")),
    import(libUrl("velocity.mjs")),
    import(libUrl("midi.mjs")),
    import(libUrl("model-cache.mjs")),
    import(libUrl("tempo.mjs")),
  ]).then(([w2m, velocity, midi, cache, tempo]) => ({ w2m, velocity, midi, cache, tempo }));
  return libsPromise;
}

function loadOrt(sources, runtime) {
  if (self.ort) return ortBase;
  const errors = [];
  for (const base of sources) {
    try {
      importScripts(base + runtime.file);
      if (self.ort?.InferenceSession) {
        ortBase = base;
        ortFile = runtime.file;
        ortVersion = runtime.version;
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
// Browsers that give a WebGPU adapter run the model on the GPU; everything else runs it on the CPU (WebAssembly).
// A GPU session that cannot be created falls through to the CPU, and a run that fails on the GPU is repeated on the
// CPU (see transcribe). The result is cached for the worker's lifetime.
let capsPromise = null;
function probeCapabilities() {
  capsPromise ??= (async () => {
    const caps = { webgpu: false, f16: false, adapter: "" };
    if (!self.navigator?.gpu) return caps;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      // Without an adapter ONNX Runtime silently drops "webgpu" and runs on the CPU, so it must not be reported as GPU.
      if (!adapter) return caps;
      caps.webgpu = true;
      caps.f16 = !!adapter.features?.has("shader-f16");
      const info = adapter.info || (await adapter.requestAdapterInfo?.().catch(() => null)) || null;
      caps.adapter = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(" ");
    } catch { /* WebGPU blocked or crashed: WebAssembly only */ }
    return caps;
  })();
  return capsPromise;
}

function cpuOnly(options) {
  return options.executionProvider === "wasm";
}

async function chooseVariants(options) {
  if (cpuOnly(options)) return { caps: { webgpu: false, f16: false, adapter: "", skipped: "cpu-only" }, order: ["w16"] };
  const caps = await probeCapabilities();
  return { caps, order: ["w16"] };
}

function executionPlans(caps) {
  return caps?.webgpu ? [["webgpu"], ["wasm"]] : [["wasm"]];
}

async function releaseSession() {
  const old = session;
  session = null;
  sessionInfo = null;
  try { await old?.release?.(); } catch { /* already gone */ }
}

async function ensureSession(options, progress) {
  if (session && (options.executionProvider !== "wasm" || sessionInfo?.provider === "wasm")) return sessionInfo;
  if (session) await releaseSession();
  const libs = await loadLibs();
  progress("runtime", 0, 0);
  const { caps, order } = await chooseVariants(options);
  const runtime = pickRuntime(options, caps);
  loadOrt(options.ortSources?.length ? options.ortSources : ortSourcesFor(runtime), runtime);
  const errors = [];
  for (const variant of order) {
    let model;
    try {
      model = await libs.cache.loadModel(new URL("model/", BASE).href, (stage, loaded, total) => progress(stage, loaded, total), { variant });
    } catch (error) {
      throw error;
    }
    progress("model-init", 0, 0);
    for (const eps of executionPlans(caps)) {
      try {
        session = await self.ort.InferenceSession.create(model.bytes, { executionProviders: eps, graphOptimizationLevel: "all", ...(eps[0] === "wasm" ? CPU_MEMORY_OPTIONS : {}) });
        sessionInfo = {
          provider: eps[0],
          variant: model.variant,
          compute: model.compute,
          capabilities: caps,
          runtimeBase: ortBase,
          runtimeVersion: ortVersion,
          meta: model.meta,
          manifest: model.manifest,
          modelFromCache: model.fromCache,
          modelStored: model.stored,
          fallbackReasons: errors.slice(),
        };
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
  constructor(meta, count, w2m) {
    this.meta = meta;
    this.w2m = w2m;
    this.frontend = null;
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
  // Same computation on the calling thread, used when no nested worker is available.
  localFeatures(seg) {
    this.frontend ??= new this.w2m.Frontend(this.meta.frontend);
    return this.frontend.features(seg, seg.length / this.w2m.HOP);
  }
  features(seg) {
    if (!this.workers.length) return Promise.resolve(this.localFeatures(seg));
    const id = this.next++;
    const promise = new Promise((resolve, reject) => this.jobs.set(id, { resolve, reject }));
    this.workers[id % this.workers.length].postMessage({ id, seg });   // copied (0.8 MB), so seg stays usable
    // If the pool dies mid-run, recompute on this thread instead of failing the whole conversion.
    return promise.catch(() => this.localFeatures(seg));
  }
  terminate() {
    for (const w of this.workers) { try { w.terminate(); } catch { /* gone */ } }
    this.workers = [];
  }
}

// ---- Several CPU sessions (no GPU) ---------------------------------------------------------
// WebAssembly threads need cross-origin isolation, which the host (GitHub Pages) cannot provide, so a CPU run uses
// one thread per session. Windows are independent, so "lanes" (this worker's own session plus helper workers with
// their own single-thread sessions, infer-worker.js) each process a different window. Every lane costs memory
// (model weights + WebAssembly heap), hence the small lane count chosen by the caller.
class LanePool {
  constructor(runOnMain, inputName, shape, outputNames) {
    this.inputName = inputName;
    this.shape = shape;
    this.outputNames = outputNames;
    this.helpers = [];
    this.free = [];
    this.waiters = [];
    this.mainLane = { helper: null, run: async feats => { await new Promise(r => setTimeout(r, 0)); return runOnMain(feats); } };
  }
  /** Starts count-1 helper sessions; the ones that fail to start are simply left out. */
  async start(count) {
    const starting = [];
    for (let i = 1; i < count; i++) {
      starting.push(new Promise(resolve => {
        let worker = null;
        try {
          worker = new Worker(new URL(`infer-worker.js?v=${encodeURIComponent(ASSET_VERSION)}`, BASE).href);
        } catch { resolve(null); return; }
        const lane = { helper: worker, pending: new Map(), next: 1 };
        lane.run = feats => new Promise((res, rej) => {
          const id = lane.next++;
          lane.pending.set(id, { res, rej });
          // Copied (13.5 MB), not transferred, so the window can be computed again if this helper fails.
          worker.postMessage({ type: "run", id, feats, shape: this.shape, inputName: this.inputName, outputNames: this.outputNames });
        });
        const failAll = message => { for (const j of lane.pending.values()) j.rej(new Error(message)); lane.pending.clear(); };
        worker.onmessage = e => {
          const m = e.data || {};
          if (m.type === "ready") { resolve(lane); return; }
          if (m.type === "done") { const j = lane.pending.get(m.id); lane.pending.delete(m.id); j?.res(m.out); return; }
          if (m.type === "error") {
            if (m.id == null) { worker.terminate(); resolve(null); return; }
            const j = lane.pending.get(m.id); lane.pending.delete(m.id); j?.rej(new Error(m.message));
          }
        };
        worker.onerror = e => { failAll(e.message || "helper failed"); lane.dead = true; resolve(null); };
        worker.postMessage({ type: "init", ortBase, ortFile });
      }));
    }
    this.helpers = (await Promise.all(starting)).filter(Boolean);
    // Helpers first: the main lane computes synchronously and would delay handing out the other windows.
    this.free = [...this.helpers, this.mainLane];
  }
  get size() { return this.helpers.length + 1; }
  async acquire() {
    if (this.free.length) return this.free.shift();
    return new Promise(resolve => this.waiters.push(resolve));
  }
  release(lane) {
    if (lane.dead) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter(lane); else this.free.push(lane);
  }
  async run(feats) {
    const lane = await this.acquire();
    try {
      return await lane.run(feats);
    } catch (error) {
      // A helper that fails is dropped and its window is computed again on the remaining lanes.
      if (!lane.helper || error instanceof RangeError) throw error;
      lane.dead = true;
      try { lane.helper.terminate(); } catch { /* gone */ }
      this.helpers = this.helpers.filter(h => h !== lane);
      console.warn("[Wave2MIDI] a CPU helper session failed; continuing with fewer lanes", error);
      return this.run(feats);
    } finally {
      this.release(lane);
    }
  }
  terminate() {
    for (const h of this.helpers) { try { h.helper.terminate(); } catch { /* gone */ } }
    this.helpers = [];
    this.free = [];
  }
}

async function transcribe(id, wave, options) {
  const progress = (stage, done = 0, total = 0) => self.postMessage({ type: "progress", id, stage, done, total });
  lastJob = null; // drop the previous song's probability maps before allocating new ones
  let info = await ensureSession(options, progress);
  const { w2m } = await loadLibs();
  const meta = info.meta;
  const seconds = wave.length / w2m.SR;
  const maxSeconds = Number(options.maxSeconds) || 0;
  if (maxSeconds > 0 && seconds > maxSeconds) throw fail("too-long", `Audio is longer than ${maxSeconds} seconds`);
  const started = performance.now();

  // Features for several windows are prepared in parallel workers while the network runs.
  const cores = navigator.hardwareConcurrency || 4;
  // CPU lanes (see LanePool): how many sessions the caller allows (1 = just this worker's session).
  const cpuSessions = Math.max(1, Math.floor(Number(options.cpuSessions) || 1));
  const poolSize = info.provider === "wasm" && cpuSessions > 1
    ? Math.max(1, Math.min(cpuSessions, cores - 2))
    : Math.max(1, Math.min(8, cores - 2));
  const pool = new FeaturePool(meta, poolSize, w2m);
  const decoderMode = options.decoderMode === "peak" ? "peak" : "state";
  const NEEDED_OUTPUTS = neededOutputsFor(decoderMode);
  const predictOptions = { prepare: seg => pool.features(seg), lookahead: Math.max(1, pool.size), keys: NEEDED_OUTPUTS };
  // The 128-d per-note feature (model outputs fpi/fpv/fpc) is only fetched when the instrument-consistency step can use it.
  const wantFeat = (options.fingerprint === true || options.collectFingerprint === true) && Boolean(meta.outputs?.fpc);
  const fpThr = 0.02; // same as the default of selectFeat in the helper lanes (infer-worker.js)
  const fetchNames = wantFeat ? [...NEEDED_OUTPUTS, "fpi", "fpv", "fpc"] : NEEDED_OUTPUTS;
  predictOptions.sparseFeat = wantFeat ? Number(meta.outputs.fpc[1]) || 128 : 0;
  const runOnMain = async feats => {
    const input = new self.ort.Tensor("float32", feats, meta.input.shape);
    const result = await session.run({ [meta.input.name || "features"]: input }, fetchNames);
    const out = {};
    for (const name of NEEDED_OUTPUTS) out[name] = result[name].data;
    if (wantFeat && result.fpc) Object.assign(out, w2m.selectFeat(result.fpi.data, result.fpv.data, result.fpc.data, result.fpc.dims[2], fpThr));
    input.dispose?.();
    return out;
  };
  // Same window layout as w2m.predictSong, so the first progress tick already shows the real count.
  let W = Math.round(meta.window_seconds * w2m.FPS); W += W % 2;
  const hopFrames = W - Math.min(Math.round(meta.overlap_seconds * w2m.FPS), W / 2);
  const totalFrames = Math.ceil(wave.length / w2m.HOP);
  const windowCount = totalFrames > W ? 1 + Math.ceil((totalFrames - W) / hopFrames) : 1;
  progress("analyze", 0, windowCount);
  const inputName = meta.input.name || "features";
  const frontend = new w2m.Frontend(meta.frontend);
  const predictOnce = async () => {
    let lanes = null;
    try {
      if (info.provider === "wasm" && cpuSessions > 1) {
        lanes = new LanePool(runOnMain, inputName, meta.input.shape, fetchNames);
        await lanes.start(cpuSessions);
        if (lanes.size < 2) { lanes.terminate(); lanes = null; }
      }
      return await w2m.predictSong(wave, meta, frontend, lanes ? feats => lanes.run(feats) : runOnMain,
        (fraction, done, total) => progress("analyze", done, total),
        { ...predictOptions, concurrency: lanes ? lanes.size : 1, lookahead: Math.max(predictOptions.lookahead, lanes ? lanes.size : 1) });
    } finally {
      lanes?.terminate();
    }
  };
  let predicted;
  try {
    predicted = await predictOnce();
  } catch (error) {
    // Some GPUs create the session but fail (or lose the device) while running: repeat the whole run on the CPU.
    if (info.provider !== "webgpu" || error instanceof RangeError) throw error;
    console.warn("[Wave2MIDI] GPU inference failed, retrying on the CPU (WebAssembly)", error);
    await releaseSession();
    info = await ensureSession({ ...options, executionProvider: "wasm" }, progress);
    info.fallbackReasons = [...(info.fallbackReasons || []), `[gpu run] ${error?.message || error}`];
    progress("analyze", 0, windowCount);
    predicted = await predictOnce();
  } finally {
    pool.terminate();
  }
  // The model output is kept so post-processing options (note sensitivity, drums, velocity, tempo) can be
  // re-applied without running the model again ("postprocess" message). Freed with the worker.
  // Only the probability maps are needed for post-processing: free the model and its buffers now.
  await releaseSession();
  lastJob = { probs: predicted.probs ?? predicted, T: predicted.T, wave, seconds, info, mode: decoderMode };
  return finishTranscription(lastJob, options, progress, started);
}

// Post-processing: probability maps -> notes (state decoder) -> velocity -> tempo map -> MIDI.
//   options.stateBias       -1..1 added to the "note start" state (higher = more and weaker notes); default 0
//   options.drumThreshold   0.05..0.4 drum hit threshold (lower = more drum hits); default meta.thresholds.drum
//   options.collectFingerprint  true: keep the model's 128-d note features during the run, so fingerprint can be switched on later
//   options.fingerprint     true: uncertain instruments are decided by similar nearby notes (see lib/w2m_web.mjs); default false
//   options.velocity        true/undefined: estimated, false: constant 100, number: that fixed velocity (1-127)
//   options.velocityRange   [min, max] (1-127) range of estimated velocities; default meta.velocity min/max
//   options.tempo           true/undefined: auto, false: 120 BPM grid, number: that fixed BPM
//   options.tempoChanges    false: one tempo for the whole song (auto mode only)
async function finishTranscription(job, options, progress, started = performance.now()) {
  const { w2m, velocity, midi, tempo } = await loadLibs();
  const { probs, T, wave, seconds, info } = job;
  const meta = info.meta;
  const mode = options.decoderMode === "peak" ? "peak" : "state";
  // The model outputs the chosen decoder needs were not kept for this job (other mode) -> the caller re-runs the model.
  if (mode !== (job.mode || "state")) throw fail("no-job", `The stored model output is for the "${job.mode || "state"}" decoder`);
  const range = meta.decode || {};
  const [biasLo, biasHi] = range.state_bias_range || [-1, 1];
  const [drumLo, drumHi] = range.drum_range || [0.05, 0.4];
  const bias = Number.isFinite(Number(options.stateBias)) && options.stateBias !== null && options.stateBias !== ""
    ? Math.min(biasHi, Math.max(biasLo, Number(options.stateBias)))
    : Number(range.state_bias) || 0;
  const drum = Number.isFinite(Number(options.drumThreshold)) && options.drumThreshold !== null && options.drumThreshold !== ""
    ? Math.min(drumHi, Math.max(drumLo, Number(options.drumThreshold)))
    : Number(meta.thresholds.drum);
  // multi > 1: a second instrument per note is never added (one instrument per note).
  const thresholds = { ...meta.thresholds, drum, multi: 1.01 };
  // The state decoder reads the "multi" map only to compare it with the (unreachable) threshold above.
  const maps = { ...probs, T, multi: probs.multi || (job.zeroMulti ??= new Float32Array(T * w2m.NP)) };
  const fingerprint = options.fingerprint === true;
  const fpStats = {};
  let notes, decoder;
  if (mode === "peak") {
    const num = (value, lo, hi, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Math.min(hi, Math.max(lo, Number(value))) : fallback);
    const peakThresholds = { ...thresholds,
      onset: num(options.peakOnset, 0.02, 0.9, Number(meta.thresholds.onset)),
      frame: num(options.peakFrame, 0.05, 0.95, Number(meta.thresholds.frame)),
      offset: num(options.peakOffset, 0.05, 0.95, Number(meta.thresholds.offset)),
      min_frames: Math.round(num(options.peakMinFrames, 1, 30, Number(meta.thresholds.min_frames))) };
    notes = w2m.decodeNotes(maps, { ...meta, thresholds: peakThresholds }, { fingerprint, stats: fpStats, debug: options.debugFingerprint ? (job.fpDebug = []) : null });
    decoder = { mode: "peak", onset: peakThresholds.onset, frame: peakThresholds.frame, offset: peakThresholds.offset, minFrames: peakThresholds.min_frames, fingerprint, ...fpStats };
  } else {
    notes = w2m.decodeStates(maps, { ...meta, thresholds }, bias, { fingerprint, stats: fpStats, debug: options.debugFingerprint ? (job.fpDebug = []) : null });
    decoder = { mode: "state", bias, fingerprint, ...fpStats };
  }
  let velocities = null;
  const fixedVelocity = typeof options.velocity === "number" && options.velocity > 0
    ? Math.min(127, Math.max(1, Math.round(options.velocity)))
    : (options.velocity === false ? 100 : 0);
  if (!fixedVelocity && meta.velocity?.enabled !== false && notes.length) {
    progress("velocity", 0, 0);
    const cfg = { ...meta.velocity };
    const vrange = Array.isArray(options.velocityRange) ? options.velocityRange.map(Number) : null;
    if (vrange && vrange.every((value) => Number.isFinite(value))) {
      const lo = Math.min(127, Math.max(1, Math.round(Math.min(vrange[0], vrange[1]))));
      const hi = Math.min(127, Math.max(1, Math.round(Math.max(vrange[0], vrange[1]))));
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
    // Tempo error allowance (0 = default: timing kept as exact as before). Higher levels allow a larger accumulated timing
    // error (seconds) and re-fit the integer tempo over longer stretches (beats), so the tempo is corrected less often.
    const level = Number(options.tempoError);
    if (Number.isFinite(level) && level > 0) {
      const lv = Math.min(10, Math.max(0, level));
      const base = { ...DEFAULT_TEMPO_FALLBACK, ...(meta.tempo || {}) };
      cfg.integer_tolerance = Number(base.integer_tolerance) + lv * 0.0135;
      cfg.integer_block_beats = Math.round(Number(base.integer_block_beats) + lv * 6);
    }
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
    decoder,
    ...(job.fpDebug ? { fingerprintDebug: job.fpDebug } : {}),
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
