// Persistent model storage for MOBIBARD AI models.
//
// The ONNX file is stored in IndexedDB (not only the HTTP cache) so it survives normal
// cache eviction and browser restarts. Each model id keeps exactly one record, so
// publishing a new model (new sha256 in manifest.json) replaces the old bytes in place.
// Records are verified by size + SHA-256 on every load; a damaged record is dropped and
// downloaded again. Usable from both window and worker scopes.
//
// manifest.json can list several builds of the same model under "models" (e.g. "fp16" for
// GPUs with shader-f16, "w16" as the universal fallback). Each build is stored as its own
// record, so switching between environments never evicts the other build. The fallback build
// keeps the bare model id, which is the key older versions used, so an existing download is reused.

export const DB_NAME = "mobibard-ai-models";
export const DB_VERSION = 1;
export const STORE = "models";

export class ModelError extends Error {
  constructor(code, message, cause) {
    super(message || code);
    this.name = "ModelError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new ModelError("storage-unavailable", "IndexedDB is not available")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new ModelError("storage-unavailable", "IndexedDB open failed"));
    request.onblocked = () => reject(new ModelError("storage-unavailable", "IndexedDB open blocked"));
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      const request = run(store);
      if (request) request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new ModelError("storage-unavailable", "IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export const readRecord = id => withStore("readonly", store => store.get(id));
export const writeRecord = record => withStore("readwrite", store => store.put(record));
export const deleteRecord = id => withStore("readwrite", store => store.delete(id));
export const listRecordIds = () => withStore("readonly", store => store.getAllKeys());

export async function sha256Hex(data) {
  const view = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new ModelError("model-unavailable", `${url}: HTTP ${response.status}`);
  return response.json();
}

async function download(url, expectedBytes, onProgress, cacheMode) {
  const response = await fetch(url, { cache: cacheMode });
  if (!response.ok) throw new ModelError("model-unavailable", `${url}: HTTP ${response.status}`);
  // The stream yields *decoded* bytes. When the server compresses the response (GitHub Pages
  // serves .onnx with Content-Encoding: gzip), Content-Length is the compressed size and must
  // not be used to size the buffer. Prefer the manifest size, which is the real decoded size.
  const encoded = !!response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity";
  const headerLength = encoded ? 0 : Number(response.headers.get("content-length")) || 0;
  const total = expectedBytes || headerLength || 0;
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  let out = total > 0 ? new Uint8Array(total) : null;
  let parts = out ? null : [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (out && loaded + value.byteLength > out.byteLength) {
      // More data than expected (wrong size hint): keep everything and let the hash check decide.
      parts = [out.subarray(0, loaded)];
      out = null;
    }
    if (out) out.set(value, loaded);
    else parts.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, Math.max(total, loaded));
  }
  if (out) return loaded === out.byteLength ? out : out.slice(0, loaded);
  const joined = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

/**
 * Resolves which file to load. Returns { variant, id, file, bytes, sha256, compute }.
 * A manifest without "models" is the old single-model layout (file/bytes/sha256 at the top level).
 */
export function resolveModelEntry(manifest, variant) {
  const baseId = manifest?.id || "mobibard_m2m";
  const models = manifest?.models && typeof manifest.models === "object" ? manifest.models : null;
  if (!models) {
    if (variant && variant !== "w16" && variant !== "default") {
      throw new ModelError("model-unavailable", `Model build "${variant}" is not published`);
    }
    return { variant: "w16", id: baseId, file: manifest?.file, bytes: manifest?.bytes, sha256: manifest?.sha256, compute: "fp32" };
  }
  const fallback = manifest.fallback && models[manifest.fallback] ? manifest.fallback : Object.keys(models)[0];
  const key = variant && variant !== "default" ? variant : fallback;
  const entry = models[key];
  if (!entry?.file) throw new ModelError("model-unavailable", `Model build "${key}" is not published`);
  return {
    variant: key,
    id: key === fallback ? baseId : `${baseId}:${key}`,
    file: entry.file,
    bytes: Number(entry.bytes) || 0,
    sha256: String(entry.sha256 || ""),
    compute: String(entry.compute || ""),
  };
}

function fallbackRecordId(manifest, variant) {
  const baseId = manifest?.id || "mobibard_m2m";
  return variant && variant !== "w16" && variant !== "default" ? `${baseId}:${variant}` : baseId;
}

async function verifiedRecord(record, entry) {
  if (!record?.data) return null;
  if (entry && record.sha256 !== entry.sha256) return null;                 // outdated model
  if (record.data.byteLength !== record.bytes) return null;
  const hash = await sha256Hex(record.data);
  return hash === record.sha256 ? record : null;
}

/** Status without downloading anything (variant: the build this environment would use). */
export async function getCacheStatus(baseUrl, variant = "default") {
  let manifest = null;
  try { manifest = await fetchJson(new URL("manifest.json", baseUrl).href); } catch { /* offline */ }
  let entry = null;
  try { entry = manifest ? resolveModelEntry(manifest, variant) : null; } catch { entry = null; }
  let record = null;
  try { record = await readRecord(entry?.id || fallbackRecordId(manifest, variant)); } catch { /* no storage */ }
  return {
    variant: entry?.variant || record?.variant || variant,
    cached: !!record?.data,
    current: !!record?.data && (!entry || record.sha256 === entry.sha256),
    bytes: record?.bytes || entry?.bytes || 0,
    savedAt: record?.savedAt || 0,
    sha256: record?.sha256 || "",
  };
}

export async function clearCache() {
  const ids = await listRecordIds();
  for (const id of ids) await deleteRecord(id);
  return ids.length;
}

/**
 * Returns { bytes: Uint8Array, meta, manifest, variant, compute, fromCache, stored }.
 * variant: a key of manifest.models ("fp16", "w16", …) or "default" for the fallback build.
 * onProgress(stage, loaded, total) with stage "model-check" | "model-download" | "model-store".
 */
export async function loadModel(baseUrl, onProgress, { variant = "default" } = {}) {
  onProgress?.("model-check", 0, 0);
  let manifest = null;
  try { manifest = await fetchJson(new URL("manifest.json", baseUrl).href); } catch (error) { /* offline: try cache */ }
  // Offline: no manifest, so the record id is derived from the requested build.
  const entry = manifest ? resolveModelEntry(manifest, variant) : null;
  const id = entry?.id || fallbackRecordId(null, variant);
  let record = null;
  try { record = await readRecord(id); } catch { /* storage blocked: download only */ }
  try {
    const valid = await verifiedRecord(record, entry);
    if (valid) {
      // meta.json can change without a new model file (version label, thresholds), so refresh it
      // whenever the network is available and keep the stored copy for offline use.
      let meta = valid.meta;
      if (manifest) {
        try {
          const fresh = await fetchJson(new URL(manifest.meta || "meta.json", baseUrl).href);
          if (JSON.stringify(fresh) !== JSON.stringify(meta)) {
            meta = fresh;
            try { await writeRecord({ ...valid, meta, manifest }); } catch { /* keep using fresh meta */ }
          }
        } catch { /* offline: stored meta */ }
      }
      return {
        bytes: new Uint8Array(valid.data), meta, manifest: manifest || valid.manifest,
        variant: entry?.variant || valid.variant || "w16", compute: entry?.compute || valid.compute || "",
        fromCache: true, stored: true,
      };
    }
  } catch { /* hash failure -> re-download */ }
  if (!manifest) throw new ModelError("model-unavailable", "Model manifest could not be loaded (offline?)");

  const modelUrl = new URL(entry.file, baseUrl).href;
  const progress = (loaded, total) => onProgress?.("model-download", loaded, total || entry.bytes);
  let bytes = await download(modelUrl, entry.bytes, progress, "default");
  if (bytes.byteLength !== entry.bytes || await sha256Hex(bytes) !== entry.sha256) {
    // A stale HTTP cache entry can serve the previous model under the same URL.
    bytes = await download(modelUrl, entry.bytes, progress, "reload");
    if (bytes.byteLength !== entry.bytes || await sha256Hex(bytes) !== entry.sha256) {
      throw new ModelError("model-corrupt", "Downloaded model failed the integrity check");
    }
  }
  const meta = await fetchJson(new URL(manifest.meta || "meta.json", baseUrl).href);
  onProgress?.("model-store", bytes.byteLength, bytes.byteLength);
  let stored = false;
  try {
    // Store a standalone ArrayBuffer (structured clone) and drop any previous version of this id.
    const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
    await writeRecord({
      id, variant: entry.variant, compute: entry.compute, sha256: entry.sha256, bytes: entry.bytes,
      data, meta, manifest, savedAt: Date.now(),
    });
    stored = true;
  } catch (error) {
    console.warn("[Wave2MIDI] Model could not be stored persistently; it will be downloaded again next time.", error);
  }
  return { bytes, meta, manifest, variant: entry.variant, compute: entry.compute, fromCache: false, stored };
}
