import { clamp, PROBE_PATCH_COUNT } from './vision.js?v=20260830-site-nav1';
import { t } from './language-manager.js?v=20260831-account-menu1';

const PATCH_COUNT = PROBE_PATCH_COUNT;
const PATCH_STRIDE = 3; // R, G, B
const CHANNELS_PER_KEY = PATCH_COUNT * PATCH_STRIDE;

export const DEFAULT_WHITE_CHANGE_PERCENT = 30;
export const DEFAULT_BLACK_CHANGE_PERCENT = 50;
export const DEFAULT_NOTE_EXTENSION_FRAMES = 0;
export const NOTE_EXTENSION_FRAME_OPTIONS = Object.freeze([0, 0.25, 0.5, 1]);

function normalizeNoteExtensionFrames(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NOTE_EXTENSION_FRAMES;
  return NOTE_EXTENSION_FRAME_OPTIONS.reduce((best, option) =>
    Math.abs(option - numeric) < Math.abs(best - numeric) ? option : best
  , DEFAULT_NOTE_EXTENSION_FRAMES);
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
  const { _startFrame, _endFrame, _leadFrameTime, _tailFrameTime, ...clean } = note;
  return clean;
}

function frameBoundaryTime(frameStarts, finalTime, framePosition) {
  const count = frameStarts.length;
  if (!count) return 0;

  const position = clamp(Number(framePosition) || 0, 0, count);
  const lowerIndex = Math.floor(position);
  if (lowerIndex >= count) return Math.max(frameStarts[count - 1], Number(finalTime) || 0);

  const lowerTime = Math.max(0, Number(frameStarts[lowerIndex]) || 0);
  const fraction = position - lowerIndex;
  if (fraction <= 0) return lowerTime;

  const upperTime = lowerIndex + 1 < count
    ? Math.max(lowerTime, Number(frameStarts[lowerIndex + 1]) || lowerTime)
    : Math.max(lowerTime, Number(finalTime) || lowerTime);
  return lowerTime + ((upperTime - lowerTime) * fraction);
}

/**
 * Expands each raw note into surrounding frame time where that same key was not
 * detected. Fractional frame amounts are linearly interpolated between frame boundaries. Raw note runs are never merged. If the tail expansion of an
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
 * Re-applies note-length expansion from compact per-note frame-boundary
 * context. The maximum UI extension is one frame, so keeping the immediately
 * adjacent frame times on each raw note is enough to rebuild 0 / 0.25 / 0.5 /
 * 1 frame expansion without decoding the video again.
 */
export function expandNotesByStoredFrameContext(notes, extensionFrames) {
  const amount = normalizeNoteExtensionFrames(extensionFrames);
  if (!Array.isArray(notes) || !notes.length) return [];
  if (!amount) return notes.map(stripFrameMetadata);

  const groups = new Map();
  for (const note of notes) {
    const key = Number(note.midi);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }

  const expandedNotes = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const af = Number(a._startFrame);
      const bf = Number(b._startFrame);
      if (Number.isFinite(af) && Number.isFinite(bf) && af !== bf) return af - bf;
      return (Number(a.start) || 0) - (Number(b.start) || 0) || (Number(a.end) || 0) - (Number(b.end) || 0);
    });

    const expanded = group.map((note, index) => {
      const rawStart = Math.max(0, Number(note.start) || 0);
      const rawEnd = Math.max(rawStart, Number(note.end) || rawStart);
      const leadTimeValue = Number(note._leadFrameTime);
      const tailTimeValue = Number(note._tailFrameTime);
      const leadTime = Number.isFinite(leadTimeValue) ? Math.min(rawStart, Math.max(0, leadTimeValue)) : rawStart;
      const tailTime = Number.isFinite(tailTimeValue) ? Math.max(rawEnd, tailTimeValue) : rawEnd;
      const previousRawEnd = index > 0 ? Math.max(0, Number(group[index - 1].end) || 0) : 0;
      const nextRawStart = index + 1 < group.length ? Math.max(rawEnd, Number(group[index + 1].start) || rawEnd) : Number.POSITIVE_INFINITY;
      return {
        note,
        start: Math.max(previousRawEnd, rawStart - ((rawStart - leadTime) * amount)),
        end: Math.min(nextRawStart, rawEnd + ((tailTime - rawEnd) * amount)),
      };
    });

    // When both neighboring notes expand into the same gap, the following note
    // owns that shared area. Notes remain separate and are never merged.
    for (let index = 1; index < expanded.length; index += 1) {
      const previous = expanded[index - 1];
      const current = expanded[index];
      if (previous.end > current.start) previous.end = current.start;
    }

    for (const item of expanded) {
      const clean = stripFrameMetadata(item.note);
      const start = Math.max(0, item.start);
      const end = Math.max(start, item.end);
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
    this.rawNotes = [];
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
      this.rawNotes = this.notes.map(note => ({
        ...note,
        _leadFrameTime: frameBoundaryTime(this.frameStarts, this.finalTime, note._startFrame - 1),
        _tailFrameTime: frameBoundaryTime(this.frameStarts, this.finalTime, note._endFrame + 1),
      }));
      this.notes = expandNotesByFrames(this.rawNotes, this.frameStarts, this.finalTime, this.noteExtensionFrames);
      this.finished = true;
    }
    return {
      notes: this.notes,
      rawNotes: this.rawNotes.map(note => ({ ...note })),
      baselines: this.baselines,
      detectionOptions: this.detectionOptions,
      noteExtensionFrames: this.noteExtensionFrames,
      frameCount: this.frameCount,
    };
  }
}

// ---- Audio-based MIDI velocity estimation (merged hotfix; no extra module dependency) ----
const TARGET_SAMPLE_RATE = 12000;
const WINDOW_BEFORE_SECONDS = 0.07;
const WINDOW_AFTER_SECONDS = 0.16;
const ANALYSIS_WINDOW_SECONDS = 0.042;
const ATTACK_SEARCH_BEFORE_SECONDS = 0.055;
const ATTACK_SEARCH_AFTER_SECONDS = 0.11;
const ATTACK_STEP_SECONDS = 0.009;
const MAX_NOTES_PER_BATCH = 192;
const MAX_BATCH_SPAN_SECONDS = 18;

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export function midiToFrequency(midi) {
  return 440 * (2 ** ((Number(midi) - 69) / 12));
}

function quantile(sortedValues, amount) {
  if (!sortedValues.length) return 0;
  const position = clampNumber(amount, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(sortedValues.length - 1, lower + 1);
  const fraction = position - lower;
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * fraction);
}

function createHann(length) {
  const window = new Float32Array(length);
  if (length <= 1) {
    if (length === 1) window[0] = 1;
    return window;
  }
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((Math.PI * 2 * index) / (length - 1));
  }
  return window;
}

function sinusoidAmplitude(samples, startIndex, hann, sampleRate, frequency) {
  const length = hann.length;
  if (frequency <= 0 || frequency >= sampleRate * 0.49) return 0;
  const omega = (Math.PI * 2 * frequency) / sampleRate;
  const cosStep = Math.cos(omega);
  const sinStep = Math.sin(omega);
  let cosValue = 1;
  let sinValue = 0;
  let real = 0;
  let imag = 0;
  let weightSum = 0;

  for (let offset = 0; offset < length; offset += 1) {
    const sample = samples[startIndex + offset] || 0;
    const weight = hann[offset];
    const weighted = sample * weight;
    real += weighted * cosValue;
    imag -= weighted * sinValue;
    weightSum += weight;

    const nextCos = cosValue * cosStep - sinValue * sinStep;
    sinValue = sinValue * cosStep + cosValue * sinStep;
    cosValue = nextCos;
  }

  if (weightSum <= 0) return 0;
  return (2 * Math.hypot(real, imag)) / weightSum;
}

function harmonicStrength(samples, startIndex, hann, sampleRate, midi) {
  const fundamental = midiToFrequency(midi);
  const harmonicWeights = [1, 0.48, 0.28, 0.16];
  const tuningMultipliers = [0.996, 1, 1.004];
  let best = 0;

  for (const tuning of tuningMultipliers) {
    let weightedSquares = 0;
    let weightTotal = 0;
    for (let harmonicIndex = 0; harmonicIndex < harmonicWeights.length; harmonicIndex += 1) {
      const harmonic = harmonicIndex + 1;
      const frequency = fundamental * harmonic * tuning;
      if (frequency >= sampleRate * 0.49) break;
      const weight = harmonicWeights[harmonicIndex];
      const amplitude = sinusoidAmplitude(samples, startIndex, hann, sampleRate, frequency);
      weightedSquares += weight * amplitude * amplitude;
      weightTotal += weight;
    }
    if (weightTotal > 0) best = Math.max(best, Math.sqrt(weightedSquares / weightTotal));
  }
  return best;
}

export function estimateVelocityLevelDb(samples, midi, sampleRate = TARGET_SAMPLE_RATE) {
  if (!samples?.length) return -120;
  const windowLength = Math.max(48, Math.round(ANALYSIS_WINDOW_SECONDS * sampleRate));
  if (samples.length < windowLength) return -120;
  const hann = createHann(windowLength);
  const onsetIndex = Math.round(WINDOW_BEFORE_SECONDS * sampleRate);
  const searchStart = Math.max(0, onsetIndex - Math.round(ATTACK_SEARCH_BEFORE_SECONDS * sampleRate));
  const searchEnd = Math.min(samples.length - windowLength, onsetIndex + Math.round(ATTACK_SEARCH_AFTER_SECONDS * sampleRate));
  const step = Math.max(1, Math.round(ATTACK_STEP_SECONDS * sampleRate));

  let attackStrength = 0;
  for (let start = searchStart; start <= searchEnd; start += step) {
    attackStrength = Math.max(attackStrength, harmonicStrength(samples, start, hann, sampleRate, midi));
  }

  // Estimate the already-present tonal energy just before the visual onset.
  // This reduces inflation from sustained notes whose harmonics overlap the new note.
  const preStart = Math.max(0, onsetIndex - Math.round(0.065 * sampleRate));
  const preStrength = harmonicStrength(samples, Math.min(preStart, samples.length - windowLength), hann, sampleRate, midi);
  const cleanedStrength = Math.max(1e-7, attackStrength - preStrength * 0.55);
  return 20 * Math.log10(cleanedStrength);
}

export function applyAudioVelocityLevels(notes, baseVelocity = 95) {
  if (!Array.isArray(notes) || !notes.length) return [];
  const levels = notes
    .map(note => Number(note.audioVelocityDb))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!levels.length) return notes.map(note => ({ ...note }));

  const median = quantile(levels, 0.5);
  const low = quantile(levels, 0.2);
  const high = quantile(levels, 0.8);
  const spread = Math.max(4, high - low);
  const unitsPerDb = clampNumber(28 / spread, 2.2, 5.5);
  const center = clampNumber(Math.round(Number(baseVelocity) || 95), 1, 127);

  return notes.map(note => {
    const level = Number(note.audioVelocityDb);
    if (!Number.isFinite(level)) return { ...note, velocity: center };
    const deltaDb = clampNumber(level - median, -22, 12);
    const velocity = Math.round(clampNumber(center + deltaDb * unitsPerDb, 1, 127));
    return { ...note, velocity };
  });
}

function createAnalysisWindows(notes, absoluteTimeOffset) {
  return notes.map((note, localIndex) => {
    const onset = absoluteTimeOffset + Math.max(0, Number(note.start) || 0);
    const sampleCount = Math.ceil((WINDOW_BEFORE_SECONDS + WINDOW_AFTER_SECONDS) * TARGET_SAMPLE_RATE);
    return {
      localIndex,
      midi: Number(note.midi),
      onset,
      start: onset - WINDOW_BEFORE_SECONDS,
      end: onset + WINDOW_AFTER_SECONDS,
      samples: new Float32Array(sampleCount),
    };
  });
}

function copyBufferIntoWindow(window, wrapped) {
  const audioBuffer = wrapped?.buffer;
  if (!audioBuffer || !Number.isFinite(Number(wrapped.timestamp))) return;
  const bufferStart = Number(wrapped.timestamp);
  const bufferDuration = Number(wrapped.duration) || Number(audioBuffer.duration) || 0;
  const bufferEnd = bufferStart + bufferDuration;
  const overlapStart = Math.max(window.start, bufferStart);
  const overlapEnd = Math.min(window.end, bufferEnd);
  if (!(overlapEnd > overlapStart)) return;

  const sourceRate = Number(audioBuffer.sampleRate) || 48000;
  const channels = [];
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    channels.push(audioBuffer.getChannelData(channel));
  }
  if (!channels.length) return;

  const outputStart = Math.max(0, Math.ceil((overlapStart - window.start) * TARGET_SAMPLE_RATE));
  const outputEnd = Math.min(window.samples.length, Math.ceil((overlapEnd - window.start) * TARGET_SAMPLE_RATE));
  for (let outputIndex = outputStart; outputIndex < outputEnd; outputIndex += 1) {
    const timestamp = window.start + outputIndex / TARGET_SAMPLE_RATE;
    const sourcePosition = (timestamp - bufferStart) * sourceRate;
    const index0 = Math.floor(sourcePosition);
    if (index0 < 0 || index0 >= audioBuffer.length) continue;
    const index1 = Math.min(audioBuffer.length - 1, index0 + 1);
    const fraction = sourcePosition - index0;
    let mixed = 0;
    for (const data of channels) {
      mixed += data[index0] + ((data[index1] - data[index0]) * fraction);
    }
    window.samples[outputIndex] = mixed / channels.length;
  }
}

function makeBatches(sortedEntries) {
  const batches = [];
  let current = [];
  let firstStart = 0;
  for (const entry of sortedEntries) {
    const start = Number(entry.note.start) || 0;
    const spanTooLarge = current.length && start - firstStart > MAX_BATCH_SPAN_SECONDS;
    if (current.length >= MAX_NOTES_PER_BATCH || spanTooLarge) {
      batches.push(current);
      current = [];
    }
    if (!current.length) firstStart = start;
    current.push(entry);
  }
  if (current.length) batches.push(current);
  return batches;
}

/**
 * Estimates per-note velocity levels from the video's decoded audio track.
 * Notes already provide pitch and visual onset; audio is used only to measure
 * short attack energy around those known pitches. The returned notes include
 * audioVelocityDb so the fixed velocity slider can re-center the dynamics later
 * without decoding the audio a second time.
 */
export async function estimateAudioVelocities(notes, options = {}) {
  if (!Array.isArray(notes) || !notes.length) return { notes: [], analyzedCount: 0 };
  const sink = options.sink;
  if (!sink || typeof sink.buffers !== 'function') throw new Error('Audio sink is unavailable');
  const absoluteTimeOffset = Number(options.absoluteTimeOffset) || 0;
  const baseVelocity = clampNumber(Math.round(Number(options.baseVelocity) || 95), 1, 127);
  const shouldAbort = typeof options.shouldAbort === 'function' ? options.shouldAbort : () => false;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  const indexed = notes.map((note, index) => ({ note, index })).sort((a, b) => a.note.start - b.note.start || a.index - b.index);
  const batches = makeBatches(indexed);
  const levelsByIndex = new Float64Array(notes.length);
  levelsByIndex.fill(Number.NaN);
  let analyzedCount = 0;
  let decodedBufferCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    if (shouldAbort()) break;
    const batch = batches[batchIndex];
    const windows = createAnalysisWindows(batch.map(entry => entry.note), absoluteTimeOffset);
    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];

    for await (const wrapped of sink.buffers(Math.max(0, firstWindow.start), lastWindow.end)) {
      if (shouldAbort()) break;
      decodedBufferCount += 1;
      const wrappedStart = Number(wrapped.timestamp) || 0;
      const wrappedEnd = wrappedStart + (Number(wrapped.duration) || Number(wrapped.buffer?.duration) || 0);
      for (const window of windows) {
        if (window.end <= wrappedStart || window.start >= wrappedEnd) continue;
        copyBufferIntoWindow(window, wrapped);
      }
    }
    if (shouldAbort()) break;

    for (let localIndex = 0; localIndex < windows.length; localIndex += 1) {
      const entry = batch[localIndex];
      levelsByIndex[entry.index] = estimateVelocityLevelDb(windows[localIndex].samples, entry.note.midi, TARGET_SAMPLE_RATE);
      analyzedCount += 1;
    }
    onProgress((batchIndex + 1) / batches.length, analyzedCount, notes.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  if (!shouldAbort() && decodedBufferCount === 0) throw new Error('No decodable audio samples were found');

  const withLevels = notes.map((note, index) => ({ ...note, audioVelocityDb: levelsByIndex[index] }));
  return {
    notes: applyAudioVelocityLevels(withLevels, baseVelocity),
    analyzedCount,
    completed: analyzedCount === notes.length,
  };
}
