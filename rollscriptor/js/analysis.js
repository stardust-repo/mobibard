import { clamp, PROBE_PATCH_COUNT } from './vision.js';
import { getLanguage, t } from './language-manager.js';

const PATCH_COUNT = PROBE_PATCH_COUNT;
const PATCH_STRIDE = 3; // R, G, B
const CHANNELS_PER_KEY = PATCH_COUNT * PATCH_STRIDE;

export const HUE_SECTOR_DEGREES = 30;
export const BRIGHTNESS_CHANGE_POINTS = 50;
const DEFAULT_NEUTRAL_CHROMA_PERCENT = 6;

/**
 * Compact per-frame storage. Each key keeps the averaged RGB of three small,
 * visible sampling patches. The released-key reference is captured once while
 * the keyboard guides are confirmed and is never relearned from the video.
 */
export class FeatureStore {
  constructor(keyCount, blockSize = 1024) {
    if (!Number.isInteger(keyCount) || keyCount <= 0) throw new Error(t('error.feature_key_count'));
    this.keyCount = keyCount;
    this.blockSize = blockSize;
    this.frameStride = keyCount * CHANNELS_PER_KEY;
    this.blocks = [];
    this.frameCount = 0;
    this.lastTimestamp = 0;
    this.lastDuration = 0;
  }

  #ensureBlock() {
    let block = this.blocks[this.blocks.length - 1];
    if (!block || block.count >= this.blockSize) {
      block = {
        count: 0,
        colors: new Uint8Array(this.blockSize * this.frameStride),
        timestamps: new Float64Array(this.blockSize),
        durations: new Float32Array(this.blockSize),
      };
      this.blocks.push(block);
    }
    return block;
  }

  addFrame(timestamp, duration, colors) {
    if (!(colors instanceof Uint8Array) || colors.length !== this.frameStride) {
      throw new Error(t('error.feature_size', { bytes: this.frameStride }));
    }
    const block = this.#ensureBlock();
    const localIndex = block.count;
    block.colors.set(colors, localIndex * this.frameStride);
    block.timestamps[localIndex] = timestamp;
    block.durations[localIndex] = duration;
    block.count += 1;
    this.frameCount += 1;
    this.lastTimestamp = timestamp;
    this.lastDuration = duration;
  }

  forEachFrame(callback) {
    let globalIndex = 0;
    for (const block of this.blocks) {
      for (let localIndex = 0; localIndex < block.count; localIndex += 1) {
        const colorOffset = localIndex * this.frameStride;
        callback({
          index: globalIndex,
          timestamp: block.timestamps[localIndex],
          duration: block.durations[localIndex],
          colors: block.colors.subarray(colorOffset, colorOffset + this.frameStride),
        });
        globalIndex += 1;
      }
    }
  }
}

const SRGB_LINEAR_LUT = new Float64Array(256);
for (let i = 0; i < SRGB_LINEAR_LUT.length; i += 1) {
  const c = i / 255;
  SRGB_LINEAR_LUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function srgbToLinear(value) {
  const numeric = clamp(Number(value) || 0, 0, 255);
  if (Number.isInteger(numeric)) return SRGB_LINEAR_LUT[numeric];
  const c = numeric / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Perceptual lightness on a 0..100 scale (CIE L* from sRGB/D65).
 * This matches the UI notion used by the detector: a baseline of 20 changes
 * state at >= 70 for a baseline of 20, and at <= 40 for a baseline of 90.
 */
function rgbBrightness100(r, g, b) {
  const y = 0.2126729 * srgbToLinear(r)
    + 0.7151522 * srgbToLinear(g)
    + 0.0721750 * srgbToLinear(b);
  const delta = 6 / 29;
  const fy = y > delta ** 3
    ? Math.cbrt(y)
    : y / (3 * delta * delta) + 4 / 29;
  return clamp(116 * fy - 16, 0, 100);
}

/** RGB 0..255 -> HSV hue plus RGB chroma percentage. */
function rgbHueAndChroma(r, g, b) {
  const rn = clamp(Number(r) || 0, 0, 255) / 255;
  const gn = clamp(Number(g) || 0, 0, 255) / 255;
  const bn = clamp(Number(b) || 0, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta > 1e-9) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * (((bn - rn) / delta) + 2);
    else hue = 60 * (((rn - gn) / delta) + 4);
    if (hue < 0) hue += 360;
  }

  return { hue, chromaPercent: delta * 100 };
}

function hueSector(hue, sectorDegrees) {
  const sectorCount = Math.max(1, Math.round(360 / sectorDegrees));
  // Center the 30-degree regions on 0°, 30°, 60°... rather than placing a
  // hard boundary on those familiar hue angles. The red region therefore
  // wraps cleanly around 345°..15°.
  const normalized = ((hue % 360) + 360) % 360;
  return Math.floor(((normalized + sectorDegrees / 2) % 360) / sectorDegrees) % sectorCount;
}

function patchColorSignature(colors, keyIndex, patchIndex, options) {
  const offset = keyIndex * CHANNELS_PER_KEY + patchIndex * PATCH_STRIDE;
  const r = colors[offset];
  const g = colors[offset + 1];
  const b = colors[offset + 2];
  const { hue, chromaPercent } = rgbHueAndChroma(r, g, b);
  const neutral = chromaPercent < options.neutralChromaPercent;
  return {
    rgb: [r, g, b],
    brightness: rgbBrightness100(r, g, b),
    hue,
    hueSector: neutral ? -1 : hueSector(hue, options.hueSectorDegrees),
    neutral,
  };
}

function keyPatchSignatures(colors, keyIndex, options) {
  return Array.from(
    { length: PATCH_COUNT },
    (_, patchIndex) => patchColorSignature(colors, keyIndex, patchIndex, options),
  );
}

function normalizeDetectionOptions(options = {}) {
  const requestedSector = Number(options.hueSectorDegrees);
  const hueSectorDegrees = Number.isFinite(requestedSector) && requestedSector > 0
    ? clamp(requestedSector, 5, 180)
    : HUE_SECTOR_DEGREES;
  const requestedBrightness = Number(options.brightnessChangePoints);
  const brightnessChangePoints = Number.isFinite(requestedBrightness)
    ? clamp(requestedBrightness, 1, 100)
    : BRIGHTNESS_CHANGE_POINTS;
  const requestedNeutral = Number(options.neutralChromaPercent);
  const neutralChromaPercent = Number.isFinite(requestedNeutral)
    ? clamp(requestedNeutral, 0, 30)
    : DEFAULT_NEUTRAL_CHROMA_PERCENT;
  return { hueSectorDegrees, brightnessChangePoints, neutralChromaPercent };
}

/**
 * A key sample is considered changed from its confirmed release state when either:
 *  1) that sample moves to a different 30° hue region, or
 *  2) its perceptual brightness moves by at least 50 points on a 0..100 scale.
 *
 * Every key has three independently evaluated samples. The key is active when
 * any one of those samples changes, so localized highlights on narrow black
 * keys are not diluted by averaging unchanged parts of the same key.
 *
 * Nearly achromatic colors are kept in one neutral region so tiny RGB noise on
 * white/black keys does not create a meaningless hue flip. Moving between the
 * neutral region and any chromatic hue region still counts as a color change.
 */
function keyStateChanged(baselineSignature, currentSignature, options) {
  const colorRegionChanged = baselineSignature.hueSector !== currentSignature.hueSector;
  const brightnessChanged = Math.abs(currentSignature.brightness - baselineSignature.brightness)
    >= options.brightnessChangePoints;
  return colorRegionChanged || brightnessChanged;
}

/**
 * Stateful single-pass detector using the fixed release colors captured when
 * keyboard detection is confirmed. There is intentionally no temporal
 * smoothing/hysteresis: each decoded frame is compared directly with that
 * fixed reference, and returning to the original region closes the note.
 */
export class StreamingNoteDetector {
  constructor(keys, options = {}) {
    if (!Array.isArray(keys) || keys.length === 0) throw new Error(t('error.key_count_mismatch'));
    this.keys = keys;
    this.keyCount = keys.length;
    this.velocity = clamp(Math.round(Number(options.velocity) || 100), 1, 127);
    this.detectionOptions = normalizeDetectionOptions(options);

    const suppliedBaseline = options.baselineColors;
    if (!suppliedBaseline || suppliedBaseline.length !== this.keyCount * CHANNELS_PER_KEY) {
      throw new Error(t('error.baseline_missing'));
    }

    const fixedBaselineColors = Float32Array.from(suppliedBaseline);
    this.baselines = {
      colors: fixedBaselineColors,
      confidence: new Float32Array(this.keyCount * PATCH_COUNT).fill(1),
      source: 'setup-frame',
    };
    // Keep the three visible samples of every key independent. A piano-roll
    // note often covers only part of a black key; averaging the three samples
    // together can dilute an otherwise obvious color/brightness change.
    this.baselineSignatures = Array.from(
      { length: this.keyCount },
      (_, keyIndex) => keyPatchSignatures(fixedBaselineColors, keyIndex, this.detectionOptions),
    );
    this.validKeyMask = Array.isArray(options.validKeyMask) || ArrayBuffer.isView(options.validKeyMask)
      ? options.validKeyMask
      : null;
    this.states = Array.from({ length: this.keyCount }, () => ({ active: false, noteStart: 0 }));
    this.notes = [];
    this.frameCount = 0;
    this.finalTime = 0;
    this.finished = false;
  }

  processFrame(timestamp, duration, colors) {
    if (this.finished) throw new Error('StreamingNoteDetector is already finished.');
    if (!(colors instanceof Uint8Array) || colors.length !== this.keyCount * CHANNELS_PER_KEY) {
      throw new Error(t('error.feature_size', { bytes: this.keyCount * CHANNELS_PER_KEY }));
    }

    const frameTime = Math.max(0, Number(timestamp) || 0);
    const frameDuration = Math.max(0, Number(duration) || 0);
    this.finalTime = Math.max(this.finalTime, frameTime + frameDuration);

    for (let keyIndex = 0; keyIndex < this.keyCount; keyIndex += 1) {
      const state = this.states[keyIndex];
      const valid = !this.validKeyMask || this.validKeyMask[keyIndex] !== false;
      const currentSignatures = valid
        ? keyPatchSignatures(colors, keyIndex, this.detectionOptions)
        : null;
      // White and black keys are both evaluated key-by-key and patch-by-patch.
      // One changed sample is sufficient because a falling note/highlight may
      // occupy only a narrow strip of the physical key in the source video.
      const pressed = valid && currentSignatures.some((currentSignature, patchIndex) => keyStateChanged(
        this.baselineSignatures[keyIndex][patchIndex],
        currentSignature,
        this.detectionOptions,
      ));

      if (!state.active && pressed) {
        state.active = true;
        state.noteStart = frameTime;
      } else if (state.active && !pressed) {
        const end = Math.max(state.noteStart, frameTime);
        this.notes.push({
          midi: this.keys[keyIndex].midi,
          name: this.keys[keyIndex].name,
          start: state.noteStart,
          end,
          duration: end - state.noteStart,
          velocity: this.velocity,
          keyType: this.keys[keyIndex].type,
        });
        state.active = false;
      }
    }

    this.frameCount += 1;
  }

  finish() {
    if (!this.finished) {
      for (let keyIndex = 0; keyIndex < this.keyCount; keyIndex += 1) {
        const state = this.states[keyIndex];
        if (!state.active) continue;
        const end = Math.max(state.noteStart, this.finalTime);
        this.notes.push({
          midi: this.keys[keyIndex].midi,
          name: this.keys[keyIndex].name,
          start: state.noteStart,
          end,
          duration: end - state.noteStart,
          velocity: this.velocity,
          keyType: this.keys[keyIndex].type,
        });
        state.active = false;
      }
      this.notes.sort((a, b) => a.start - b.start || a.midi - b.midi || a.end - b.end);
      this.finished = true;
    }
    return {
      notes: this.notes,
      baselines: this.baselines,
      detectionOptions: this.detectionOptions,
      frameCount: this.frameCount,
    };
  }
}

export function detectNotesFromFeatures(store, keys, options = {}, onProgress) {
  if (store.frameCount === 0) return { notes: [], baselines: null };
  if (keys.length !== store.keyCount) throw new Error(t('error.key_count_mismatch'));

  const detector = new StreamingNoteDetector(keys, options);
  let processed = 0;
  store.forEachFrame(({ timestamp, duration, colors }) => {
    detector.processFrame(timestamp, duration, colors);
    processed += 1;
    if (processed % 180 === 0) {
      onProgress?.({
        phase: 'notes',
        progress: processed / Math.max(1, store.frameCount),
        detail: t('analysis.post_detail', {
          processed: processed.toLocaleString(getLanguage()),
          total: store.frameCount.toLocaleString(getLanguage()),
        }),
      });
    }
  });
  const result = detector.finish();
  onProgress?.({
    phase: 'done',
    progress: 1,
    detail: t('analysis.post_done', { count: result.notes.length.toLocaleString(getLanguage()) }),
  });
  return result;
}

export function calculateMaximumPolyphony(notes) {
  const events = [];
  for (const note of notes) {
    events.push({ time: note.start, delta: 1 });
    events.push({ time: note.end, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0;
  let maximum = 0;
  for (const event of events) {
    current += event.delta;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}
