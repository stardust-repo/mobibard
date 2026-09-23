(() => {
  "use strict";

  const VERSION = "1.0.3";
  const SAMPLE_RATE = 44100;
  const CHANNELS = 2;
  const ENCODER_VERSION = "0.7.0";
  const CURRENT_SCRIPT_URL = document.currentScript?.src ? new URL(document.currentScript.src) : null;
  const COMMON_BASE_URL = CURRENT_SCRIPT_URL ? new URL("./", CURRENT_SCRIPT_URL) : new URL("../plugins/common/", window.location.href);
  const VENDOR_BASE_URL = new URL("../vendor/", COMMON_BASE_URL);
  const LOCAL_ENCODER_SCRIPT_URL = new URL(`wasm-media-encoders/${ENCODER_VERSION}/WasmMediaEncoder.min.js`, VENDOR_BASE_URL).href;
  const LOCAL_OGG_WASM_URL = new URL(`wasm-media-encoders/${ENCODER_VERSION}/ogg.wasm`, VENDOR_BASE_URL).href;
  let encoderLibraryPromise = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function nextFrame() {
    return new Promise(resolve => {
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => resolve());
      else window.setTimeout(resolve, 0);
    });
  }

  async function appendEncoderScript(url) {
    const existing = Array.from(document.querySelectorAll('script[data-mobibard-ogg-encoder="1"]'))
      .find(node => node.src === url && node.dataset.mobibardOggState !== "error");
    if (existing?.dataset.mobibardOggState === "loaded" && window.WasmMediaEncoder) return window.WasmMediaEncoder;
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => window.WasmMediaEncoder ? resolve(window.WasmMediaEncoder) : reject(new Error("OGG encoder did not initialize.")), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Could not load OGG encoder: ${url}`)), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.mobibardOggEncoder = "1";
      script.dataset.mobibardOggState = "loading";
      script.addEventListener("load", () => {
        script.dataset.mobibardOggState = "loaded";
        if (window.WasmMediaEncoder) resolve(window.WasmMediaEncoder);
        else reject(new Error("OGG encoder did not initialize."));
      }, { once: true });
      script.addEventListener("error", () => {
        script.dataset.mobibardOggState = "error";
        script.remove();
        reject(new Error(`Could not load OGG encoder: ${url}`));
      }, { once: true });
      document.head.append(script);
    });
  }

  function loadEncoderLibrary() {
    if (window.WasmMediaEncoder?.createEncoder || window.WasmMediaEncoder?.createOggEncoder) {
      return Promise.resolve(window.WasmMediaEncoder);
    }
    if (encoderLibraryPromise) return encoderLibraryPromise;
    encoderLibraryPromise = appendEncoderScript(LOCAL_ENCODER_SCRIPT_URL).catch(error => {
      encoderLibraryPromise = null;
      throw error;
    });
    return encoderLibraryPromise;
  }

  async function createOggEncoder() {
    const library = await loadEncoderLibrary();
    if (typeof library.createEncoder === "function") {
      return library.createEncoder("audio/ogg", LOCAL_OGG_WASM_URL);
    }
    throw new Error("Bundled OGG encoder API is unavailable.");
  }

  function estimateLastAudibleFrame(audioBuffer, threshold = 0.00001, paddingSeconds = 0.08) {
    const length = Math.max(0, Number(audioBuffer?.length) || 0);
    const channels = Math.max(1, Number(audioBuffer?.numberOfChannels) || 1);
    if (!length) return 0;
    const data = [];
    for (let channel = 0; channel < channels; channel += 1) data.push(audioBuffer.getChannelData(channel));
    let frame = length - 1;
    outer: for (; frame > 0; frame -= 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        if (Math.abs(data[channel][frame] || 0) > threshold) break outer;
      }
    }
    const padding = Math.round((Number(audioBuffer.sampleRate) || SAMPLE_RATE) * Math.max(0, Number(paddingSeconds) || 0));
    return Math.min(length, Math.max(1, frame + 1 + padding));
  }

  async function encodeOgg(audioBuffer, options = {}) {
    if (!audioBuffer?.length) throw new Error("Rendered audio is empty.");
    const encoder = await createOggEncoder();
    const channels = Math.max(1, Math.min(2, Number(audioBuffer.numberOfChannels) || 1));
    const sampleRate = Math.max(8000, Math.round(Number(audioBuffer.sampleRate) || SAMPLE_RATE));
    const quality = clamp(options.vbrQuality ?? 5, -1, 10);
    encoder.configure({ sampleRate, channels, vbrQuality: quality });

    const trimSilence = options.trimSilence !== false;
    const frameLength = trimSilence
      ? estimateLastAudibleFrame(audioBuffer, options.silenceThreshold, options.trailingPaddingSeconds)
      : audioBuffer.length;
    const chunkFrames = Math.max(2048, Math.min(131072, Math.round(Number(options.chunkFrames) || 32768)));
    const parts = [];
    let encodedFrames = 0;

    for (let offset = 0; offset < frameLength; offset += chunkFrames) {
      const end = Math.min(frameLength, offset + chunkFrames);
      const pcm = [];
      for (let channel = 0; channel < channels; channel += 1) {
        pcm.push(audioBuffer.getChannelData(channel).subarray(offset, end));
      }
      const output = encoder.encode(pcm);
      if (output?.length) parts.push(new Uint8Array(output));
      encodedFrames = end;
      options.onProgress?.("encode", frameLength ? encodedFrames / frameLength : 1);
      if ((offset / chunkFrames) % 12 === 11) await nextFrame();
    }

    const finalOutput = encoder.finalize();
    if (finalOutput?.length) parts.push(new Uint8Array(finalOutput));
    options.onProgress?.("encode", 1);
    return new Blob(parts, { type: "audio/ogg" });
  }

  function normalizeOggFileName(fileName) {
    const cleaned = String(fileName || "mobibard-audio")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "mobibard-audio";
    return /\.ogg$/i.test(cleaned) ? cleaned : `${cleaned.replace(/\.[^.]+$/, "")}.ogg`;
  }

  function downloadBlob(blob, fileName) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = normalizeOggFileName(fileName);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return link.download;
  }

  async function renderOgg(options = {}) {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) throw new Error("OfflineAudioContext is unavailable.");
    if (typeof options.render !== "function") throw new Error("Audio render callback is required.");

    const duration = Math.max(0.01, Number(options.durationSec) || 0.01);
    const tail = Math.max(0.05, Number(options.tailSec) || 0.2);
    const sampleRate = SAMPLE_RATE;
    const channels = CHANNELS;
    const totalFrames = Math.max(1, Math.ceil((duration + tail) * sampleRate));
    if (!Number.isSafeInteger(totalFrames) || totalFrames > 0x7fffffff) {
      throw new Error("The score is too long to render as one audio file.");
    }

    options.onProgress?.("prepare", 0);
    const context = new OfflineContext(channels, totalFrames, sampleRate);
    await options.render(context, { durationSec: duration, tailSec: tail, sampleRate, channels });
    options.onProgress?.("render", 0);
    const audioBuffer = await context.startRendering();
    options.onProgress?.("render", 1);
    const blob = await encodeOgg(audioBuffer, options);
    return {
      blob,
      sampleRate,
      channels,
      durationSec: audioBuffer.duration,
      fileName: normalizeOggFileName(options.fileName),
    };
  }

  async function renderAndDownloadOgg(options = {}) {
    const result = await renderOgg(options);
    downloadBlob(result.blob, result.fileName);
    return result;
  }

  window.MobibardAudioExport = Object.freeze({
    version: VERSION,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    encodeOgg,
    renderOgg,
    renderAndDownloadOgg,
    normalizeOggFileName,
    downloadBlob,
  });
})();
