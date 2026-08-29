import { clamp, PROBE_PATCH_COUNT } from './vision.js';
import { getLanguage, t } from './language-manager.js?v=20260830-auto-range-v1';

const PATCH_COUNT = PROBE_PATCH_COUNT;
const PATCH_STRIDE = 3; // R, G, B
const CHANNELS_PER_KEY = PATCH_COUNT * PATCH_STRIDE;

export const DEFAULT_WHITE_CHANGE_PERCENT = 30;
export const DEFAULT_BLACK_CHANGE_PERCENT = 50;
export const DEFAULT_NOTE_EXTENSION_FRAMES = 0;
export const MAX_NOTE_EXTENSION_FRAMES = 999;

function normalizeNoteExtensionFrames(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NOTE_EXTENSION_FRAMES;
  return clamp(Math.round(numeric), 0, MAX_NOTE_EXTENSION_FRAMES);
}

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

/** Converts an sRGB sample into the perceptually uniform OKLab color vector. */
export function rgbToOklab(r, g, b) {
  const rn = srgbToLinear(r);
  const gn = srgbToLinear(g);
  const bn = srgbToLinear(b);

  const l = 0.4122214708 * rn + 0.5363325363 * gn + 0.0514459929 * bn;
  const m = 0.2119034982 * rn + 0.6806995451 * gn + 0.1073969566 * bn;
  const s = 0.0883024619 * rn + 0.2817188376 * gn + 0.6299787005 * bn;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return [
    0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  ];
}

/**
 * OKLab vector distance expressed as 0..100 percent of the practical sRGB
 * full-scale distance. In OKLab, black -> white is essentially distance 1.0,
 * so multiplying DeltaE by 100 gives an intuitive percentage scale.
 */
export function oklabDistancePercent(reference, current) {
  const dL = current[0] - reference[0];
  const da = current[1] - reference[1];
  const db = current[2] - reference[2];
  return clamp(Math.hypot(dL, da, db) * 100, 0, 100);
}

function patchColorSignature(colors, keyIndex, patchIndex) {
  const offset = keyIndex * CHANNELS_PER_KEY + patchIndex * PATCH_STRIDE;
  const r = colors[offset];
  const g = colors[offset + 1];
  const b = colors[offset + 2];
  return {
    rgb: [r, g, b],
    oklab: rgbToOklab(r, g, b),
  };
}

function keyPatchSignatures(colors, keyIndex) {
  return Array.from(
    { length: PATCH_COUNT },
    (_, patchIndex) => patchColorSignature(colors, keyIndex, patchIndex),
  );
}

function normalizeDetectionOptions(options = {}) {
  const requestedWhite = Number(options.whiteChangePercent);
  const requestedBlack = Number(options.blackChangePercent);
  return {
    whiteChangePercent: Number.isFinite(requestedWhite)
      ? clamp(requestedWhite, 1, 100)
      : DEFAULT_WHITE_CHANGE_PERCENT,
    blackChangePercent: Number.isFinite(requestedBlack)
      ? clamp(requestedBlack, 1, 100)
      : DEFAULT_BLACK_CHANGE_PERCENT,
  };
}

/**
 * Creates the exact key-by-key / patch-by-patch OKLab comparator used both by
 * the live preview and by full-video MIDI analysis. Keeping this shared avoids
 * the preview showing a different result from the actual note detector.
 */
export function createKeyChangeEvaluator(keys, baselineColors, options = {}, validKeyMask = null) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error(t('error.key_count_mismatch'));
  const keyCount = keys.length;
  if (!baselineColors || baselineColors.length !== keyCount * CHANNELS_PER_KEY) {
    throw new Error(t('error.baseline_missing'));
  }
  const baselineSignatures = Array.from(
    { length: keyCount },
    (_, keyIndex) => keyPatchSignatures(baselineColors, keyIndex),
  );
  const baseOptions = normalizeDetectionOptions(options);
  const mask = Array.isArray(validKeyMask) || ArrayBuffer.isView(validKeyMask) ? validKeyMask : null;

  return (currentColors, optionOverrides = null) => {
    if (!(currentColors instanceof Uint8Array) || currentColors.length !== keyCount * CHANNELS_PER_KEY) {
      throw new Error(t('error.feature_size', { bytes: keyCount * CHANNELS_PER_KEY }));
    }
    const detectionOptions = optionOverrides
      ? normalizeDetectionOptions({ ...baseOptions, ...optionOverrides })
      : baseOptions;
    const changed = new Array(keyCount).fill(false);
    const maxDistancePercent = new Float32Array(keyCount);
    const patchDistancePercent = new Float32Array(keyCount * PATCH_COUNT);

    for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
      if (mask && mask[keyIndex] === false) continue;
      const threshold = keys[keyIndex].type === 'black'
        ? detectionOptions.blackChangePercent
        : detectionOptions.whiteChangePercent;
      const currentSignatures = keyPatchSignatures(currentColors, keyIndex);
      let maximum = 0;
      for (let patchIndex = 0; patchIndex < PATCH_COUNT; patchIndex += 1) {
        const distance = oklabDistancePercent(
          baselineSignatures[keyIndex][patchIndex].oklab,
          currentSignatures[patchIndex].oklab,
        );
        patchDistancePercent[keyIndex * PATCH_COUNT + patchIndex] = distance;
        maximum = Math.max(maximum, distance);
        if (distance >= threshold) changed[keyIndex] = true;
      }
      maxDistancePercent[keyIndex] = maximum;
    }
    return { changed, maxDistancePercent, patchDistancePercent };
  };
}

function stripFrameMetadata(note) {
  const { _startFrame, _endFrame, ...clean } = note;
  return clean;
}

function frameBoundaryTime(frameStarts, finalTime, frameIndex) {
  const count = frameStarts.length;
  if (!count) return 0;
  const index = clamp(Math.round(Number(frameIndex) || 0), 0, count);
  if (index >= count) return Math.max(frameStarts[count - 1], Number(finalTime) || 0);
  return Math.max(0, Number(frameStarts[index]) || 0);
}

/**
 * Expands each raw note into surrounding frames where that same key was not
 * detected. Raw note runs are never merged. If the tail expansion of an
 * earlier note overlaps the lead expansion of the following note, the
 * following note owns the overlap and the earlier tail is clipped there.
 */
export function expandNotesByFrames(notes, frameStarts, finalTime, extensionFrames) {
  const amount = normalizeNoteExtensionFrames(extensionFrames);
  if (!Array.isArray(notes) || !notes.length) return [];
  if (!amount || !Array.isArray(frameStarts) || !frameStarts.length) {
    return notes.map(stripFrameMetadata);
  }

  const frameCount = frameStarts.length;
  const groups = new Map();
  for (const note of notes) {
    const key = Number(note.midi);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }

  const expandedNotes = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a._startFrame - b._startFrame || a._endFrame - b._endFrame);
    const expanded = group.map((note, index) => {
      const previousRawEnd = index > 0 ? group[index - 1]._endFrame : 0;
      const nextRawStart = index + 1 < group.length ? group[index + 1]._startFrame : frameCount;
      return {
        note,
        startFrame: Math.max(previousRawEnd, note._startFrame - amount),
        endFrame: Math.min(nextRawStart, note._endFrame + amount),
      };
    });

    // A shared/overlapping empty area belongs to the following note. This is
    // deliberately a boundary split, not a merge; both raw notes survive.
    for (let index = 1; index < expanded.length; index += 1) {
      const previous = expanded[index - 1];
      const current = expanded[index];
      if (previous.endFrame > current.startFrame) previous.endFrame = current.startFrame;
    }

    for (const item of expanded) {
      const start = frameBoundaryTime(frameStarts, finalTime, item.startFrame);
      const end = Math.max(start, frameBoundaryTime(frameStarts, finalTime, item.endFrame));
      const clean = stripFrameMetadata(item.note);
      expandedNotes.push({ ...clean, start, end, duration: end - start });
    }
  }

  expandedNotes.sort((a, b) => a.start - b.start || a.midi - b.midi || a.end - b.end);
  return expandedNotes;
}

/**
 * Stateful single-pass detector using the fixed release colors captured when
 * keyboard detection is confirmed. There is intentionally no temporal
 * smoothing/hysteresis: each decoded frame is compared directly with that
 * fixed reference, and returning to the original region closes the raw note.
 * Optional frame expansion is applied only after all raw runs are known, so
 * neighboring notes remain distinct and following-note priority is preserved.
 */
export class StreamingNoteDetector {
  constructor(keys, options = {}) {
    if (!Array.isArray(keys) || keys.length === 0) throw new Error(t('error.key_count_mismatch'));
    this.keys = keys;
    this.keyCount = keys.length;
    this.velocity = clamp(Math.round(Number(options.velocity) || 100), 1, 127);
    this.detectionOptions = normalizeDetectionOptions(options);
    this.noteExtensionFrames = normalizeNoteExtensionFrames(options.noteExtensionFrames);

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
    this.validKeyMask = Array.isArray(options.validKeyMask) || ArrayBuffer.isView(options.validKeyMask)
      ? options.validKeyMask
      : null;
    this.evaluateChanges = createKeyChangeEvaluator(
      this.keys,
      fixedBaselineColors,
      this.detectionOptions,
      this.validKeyMask,
    );
    this.states = Array.from({ length: this.keyCount }, () => ({ active: false, noteStart: 0, noteStartFrame: 0 }));
    this.notes = [];
    this.frameStarts = [];
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
    const frameIndex = this.frameCount;
    this.frameStarts.push(frameTime);
    this.finalTime = Math.max(this.finalTime, frameTime + frameDuration);

    const frameDetection = this.evaluateChanges(colors);
    for (let keyIndex = 0; keyIndex < this.keyCount; keyIndex += 1) {
      const state = this.states[keyIndex];
      const pressed = frameDetection.changed[keyIndex];

      if (!state.active && pressed) {
        state.active = true;
        state.noteStart = frameTime;
        state.noteStartFrame = frameIndex;
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
          _startFrame: state.noteStartFrame,
          _endFrame: frameIndex,
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
          _startFrame: state.noteStartFrame,
          _endFrame: this.frameCount,
        });
        state.active = false;
      }
      this.notes.sort((a, b) => a.start - b.start || a.midi - b.midi || a.end - b.end);
      this.notes = expandNotesByFrames(this.notes, this.frameStarts, this.finalTime, this.noteExtensionFrames);
      this.finished = true;
    }
    return {
      notes: this.notes,
      baselines: this.baselines,
      detectionOptions: this.detectionOptions,
      noteExtensionFrames: this.noteExtensionFrames,
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
