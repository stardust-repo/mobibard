(() => {
  "use strict";

  const DB_NAME = "mobibard-player-cache";
  const DB_VERSION = 1;
  const STORE_NAME = "soundBanks";
  const ACTIVE_KEY = "active";

  let openPromise = null;

  function openDatabase() {
    if (openPromise) return openPromise;
    openPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open sound-bank cache."));
      request.onblocked = () => reject(new Error("Sound-bank cache database is blocked."));
    }).catch(err => {
      openPromise = null;
      throw err;
    });
    return openPromise;
  }

  async function withStore(mode, run) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      try {
        result = run(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Sound-bank cache transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Sound-bank cache transaction was aborted."));
    });
  }

  async function putActive({ bytes, name = "SoundBank", mimeType = "application/octet-stream", extension = "", sha256 = "", updatedAt = "" } = {}) {
    const value = bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes instanceof ArrayBuffer ? bytes : await bytes?.arrayBuffer?.() || 0);
    const blob = new Blob([value], { type: mimeType || "application/octet-stream" });
    const record = {
      id: ACTIVE_KEY,
      name: String(name || "SoundBank"),
      mimeType: String(mimeType || "application/octet-stream"),
      extension: String(extension || "").replace(/^\./, "").toLowerCase(),
      sha256: String(sha256 || ""),
      updatedAt: String(updatedAt || new Date().toISOString()),
      size: value.byteLength,
      blob
    };
    await withStore("readwrite", store => { store.put(record); });
    return { ...record, blob: undefined };
  }

  async function getActive() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(ACTIVE_KEY);
      request.onsuccess = async () => {
        const record = request.result;
        if (!record) {
          resolve(null);
          return;
        }
        try {
          const bytes = record.blob instanceof Blob
            ? new Uint8Array(await record.blob.arrayBuffer())
            : (record.bytes instanceof Uint8Array
              ? record.bytes
              : new Uint8Array(record.bytes || 0));
          resolve({
            name: String(record.name || "SoundBank"),
            mimeType: String(record.mimeType || "application/octet-stream"),
            extension: String(record.extension || ""),
            sha256: String(record.sha256 || ""),
            updatedAt: String(record.updatedAt || ""),
            size: Number(record.size) || bytes.byteLength,
            bytes
          });
        } catch (err) {
          reject(err);
        }
      };
      request.onerror = () => reject(request.error || new Error("Failed to read sound-bank cache."));
    });
  }

  async function clearActive() {
    await withStore("readwrite", store => { store.delete(ACTIVE_KEY); });
  }

  window.MobibardSoundBankCache = Object.freeze({
    getActive,
    putActive,
    clearActive
  });
})();
