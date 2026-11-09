/* MOBIBARD Wave2MIDI helper worker (classic worker): one extra single-thread CPU (WebAssembly) session.
 *
 * Several of these run next to worker.js when the GPU is not available, so that independent 8 s windows are
 * processed on several cores without cross-origin isolation (WebAssembly threads need COOP/COEP headers, which
 * GitHub Pages cannot send). Started and stopped by worker.js for one conversion at a time.
 *   {type:"init", ortBase, ortFile}                -> {type:"ready"} | {type:"error", message}
 *   {type:"run", id, feats, shape, inputName}       -> {type:"done", id, out} | {type:"error", id, message}
 */
"use strict";

const BASE = new URL("./", self.location.href);
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "1";
let session = null;

self.onmessage = async event => {
  const m = event.data || {};
  try {
    if (m.type === "init") {
      importScripts(m.ortBase + m.ortFile);
      self.ort.env.wasm.wasmPaths = m.ortBase;
      self.ort.env.wasm.numThreads = 1;
      // The model comes from the same IndexedDB copy worker.js uses (already downloaded and verified).
      const cache = await import(new URL(`lib/model-cache.mjs?v=${encodeURIComponent(ASSET_VERSION)}`, BASE).href);
      const model = await cache.loadModel(new URL("model/", BASE).href, () => {}, { variant: "w16" });
      session = await self.ort.InferenceSession.create(model.bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all", enableCpuMemArena: false, enableMemPattern: false });
      self.postMessage({ type: "ready" });
    } else if (m.type === "run") {
      try {
        const input = new self.ort.Tensor("float32", m.feats, m.shape);
        const r = await session.run({ [m.inputName || "features"]: input });
        const out = {
          onset: r.onset.data.slice(), frame: r.frame.data.slice(), offset: r.offset.data.slice(),
          drum: r.drum.data.slice(), inst: r.inst.data.slice(),
        };
        if (r.fp) out.fp = r.fp.data.slice();
        input.dispose?.();
        self.postMessage({ type: "done", id: m.id, out }, Object.values(out).map(a => a.buffer));
      } catch (error) {
        self.postMessage({ type: "error", id: m.id, message: String(error?.message || error) });
      }
    }
  } catch (error) {
    self.postMessage({ type: "error", id: m.id, message: String(error?.message || error) });
  }
};
