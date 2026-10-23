// Persistent model storage for MOBIBARD AI models.
//
// The ONNX file is stored in IndexedDB (not only the HTTP cache) so it survives normal
// cache eviction and browser restarts. Each model id keeps exactly one record, so
// publishing a new model (new sha256 in manifest.json) replaces the old bytes in place.
// Records are verified by size + SHA-256 on every load; a damaged record is dropped and
// downloaded again. Usable from both window and worker scopes.

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
  const total = Number(response.headers.get("content-length")) || expectedBytes || 0;
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const out = total > 0 ? new Uint8Array(total) : null;
  const parts = out ? null : [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (out && loaded + value.byteLength <= out.byteLength) out.set(value, loaded);
    else if (out) { // server sent more than announced: fall back to chunk list
      throw new ModelError("model-corrupt", "Model download size mismatch");
    } else parts.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }
  if (out) return loaded === out.byteLength ? out : out.slice(0, loaded);
  const joined = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
  return joined;
}

async function verifiedRecord(record, manifest) {
  if (!record?.data) return null;
  if (manifest && record.sha256 !== manifest.sha256) return null;           // outdated model
  if (record.data.byteLength !== record.bytes) return null;
  const hash = await sha256Hex(record.data);
  return hash === record.sha256 ? record : null;
}

/** Status without downloading anything. */
export async function getCacheStatus(baseUrl) {
  let manifest = null;
  try { manifest = await fetchJson(new URL("manifest.json", baseUrl).href); } catch { /* offline */ }
  let record = null;
  try { record = await readRecord(manifest?.id || "mobibard_m2m"); } catch { /* no storage */ }
  return {
    cached: !!record?.data,
    current: !!record?.data && (!manifest || record.sha256 === manifest.sha256),
    bytes: record?.bytes || manifest?.bytes || 0,
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
 * Returns { bytes: Uint8Array, meta, manifest, fromCache, stored }.
 * onProgress(stage, loaded, total) with stage "model-check" | "model-download" | "model-store".
 */
export async function loadModel(baseUrl, onProgress) {
  onProgress?.("model-check", 0, 0);
  let manifest = null;
  try { manifest = await fetchJson(new URL("manifest.json", baseUrl).href); } catch (error) { /* offline: try cache */ }
  const id = manifest?.id || "mobibard_m2m";
  let record = null;
  try { record = await readRecord(id); } catch { /* storage blocked: download only */ }
  try {
    const valid = await verifiedRecord(record, manifest);
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
      return { bytes: new Uint8Array(valid.data), meta, manifest: manifest || valid.manifest, fromCache: true, stored: true };
    }
  } catch { /* hash failure -> re-download */ }
  if (!manifest) throw new ModelError("model-unavailable", "Model manifest could not be loaded (offline?)");

  const modelUrl = new URL(manifest.file, baseUrl).href;
  const progress = (loaded, total) => onProgress?.("model-download", loaded, total || manifest.bytes);
  let bytes = await download(modelUrl, manifest.bytes, progress, "default");
  if (bytes.byteLength !== manifest.bytes || await sha256Hex(bytes) !== manifest.sha256) {
    // A stale HTTP cache entry can serve the previous model under the same URL.
    bytes = await download(modelUrl, manifest.bytes, progress, "reload");
    if (bytes.byteLength !== manifest.bytes || await sha256Hex(bytes) !== manifest.sha256) {
      throw new ModelError("model-corrupt", "Downloaded model failed the integrity check");
    }
  }
  const meta = await fetchJson(new URL(manifest.meta || "meta.json", baseUrl).href);
  onProgress?.("model-store", bytes.byteLength, bytes.byteLength);
  let stored = false;
  try {
    // Store a standalone ArrayBuffer (structured clone) and drop any previous version of this id.
    const data = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
    await writeRecord({ id, sha256: manifest.sha256, bytes: manifest.bytes, data, meta, manifest, savedAt: Date.now() });
    stored = true;
  } catch (error) {
    console.warn("[Wave2MIDI] Model could not be stored persistently; it will be downloaded again next time.", error);
  }
  return { bytes, meta, manifest, fromCache: false, stored };
}
