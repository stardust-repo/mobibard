import { clamp, PROBE_PATCH_COUNT } from './vision.js';
import { getLanguage, t } from './language-manager.js';

const PATCH_COUNT = PROBE_PATCH_COUNT;
const PATCH_STRIDE = 3; // R, G, B
const CHANNELS_PER_KEY = PATCH_COUNT * PATCH_STRIDE;

/**
 * Compact per-frame storage. Each key keeps the averaged RGB of three small,
 * visible sampling patches. The released-key reference is captured once while
 * the keyboard guides are adjusted and is never relearned from the video.
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

function srgbToLinear(value) {
  const c = clamp(Number(value) || 0, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** RGB 0..255 -> CIE L*a*b* (D65). */
function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl);
  const z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883;
  const delta = 6 / 29;
  const f = value => value > delta ** 3
    ? Math.cbrt(value)
    : value / (3 * delta * delta) + 4 / 29;
  const fx = f(x); const fy = f(y); const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Standard CIEDE2000 perceptual color-difference formula. */
function deltaE2000(lab1, lab2) {
  const L1 = lab1.l; const a1 = lab1.a; const b1 = lab1.b;
  const L2 = lab2.l; const a2 = lab2.a; const b2 = lab2.b;
  const C1 = Math.hypot(a1, b1); const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7 || 1)));
  const a1p = (1 + G) * a1; const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1); const C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => {
    if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return 0;
    let h = Math.atan2(b, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return h;
  };
  const h1p = hp(a1p, b1); const h2p = hp(a2p, b2);
  const dLp = L2 - L1; const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * Math.PI / 180);
  const Lbarp = (L1 + L2) / 2; const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;
  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * Math.PI / 180)
    + 0.24 * Math.cos((2 * hbarp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbarp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hbarp - 63) * Math.PI / 180);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt((Cbarp ** 7) / (Cbarp ** 7 + 25 ** 7 || 1));
  const Sl = 1 + (0.015 * ((Lbarp - 50) ** 2)) / Math.sqrt(20 + ((Lbarp - 50) ** 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * Math.PI / 180) * Rc;
  const lTerm = dLp / Sl; const cTerm = dCp / Sc; const hTerm = dHp / Sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + Rt * cTerm * hTerm);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function baselineLabTable(baselineColors, keyCount) {
  const table = new Array(keyCount * PATCH_COUNT);
  for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
    for (let patchIndex = 0; patchIndex < PATCH_COUNT; patchIndex += 1) {
      const offset = (keyIndex * PATCH_COUNT + patchIndex) * 3;
      table[keyIndex * PATCH_COUNT + patchIndex] = rgbToLab(
        baselineColors[offset], baselineColors[offset + 1], baselineColors[offset + 2],
      );
    }
  }
  return table;
}

function buildFrameMetrics(colors, baselineLab, keyCount) {
  const metrics = new Array(keyCount);
  for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
    const patches = [];
    const dLs = []; const dAs = []; const dBs = [];
    for (let patchIndex = 0; patchIndex < PATCH_COUNT; patchIndex += 1) {
      const offset = (keyIndex * PATCH_COUNT + patchIndex) * PATCH_STRIDE;
      const base = baselineLab[keyIndex * PATCH_COUNT + patchIndex];
      const current = rgbToLab(colors[offset], colors[offset + 1], colors[offset + 2]);
      const dL = current.l - base.l;
      const da = current.a - base.a;
      const db = current.b - base.b;
      const chroma = Math.hypot(da, db);
      const de = deltaE2000(base, current);
      patches.push({ base, current, dL, da, db, chroma, de });
      dLs.push(dL); dAs.push(da); dBs.push(db);
    }
    const dL = median(dLs); const da = median(dAs); const db = median(dBs);
    metrics[keyIndex] = {
      patches,
      vector: { dL, da, db },
      chroma: Math.hypot(da, db),
      minChroma: Math.min(...patches.map(p => p.chroma)),
      maxChroma: Math.max(...patches.map(p => p.chroma)),
      minDeltaE: Math.min(...patches.map(p => p.de)),
    };
  }
  return metrics;
}

function patchDirectionConsensus(metric, options) {
  const aggregate = metric.vector;
  const aggregateMag = Math.hypot(aggregate.da, aggregate.db);
  if (aggregateMag < 1e-6) return false;
  if (metric.maxChroma <= 1e-6) return false;
  if (metric.minChroma / metric.maxChroma < options.minPatchBalance) return false;

  for (const patch of metric.patches) {
    const mag = Math.hypot(patch.da, patch.db);
    if (mag < 1e-6) return false;
    const cosine = (patch.da * aggregate.da + patch.db * aggregate.db) / (mag * aggregateMag);
    if (cosine < options.minPatchDirectionCosine) return false;
  }
  return true;
}

function buildSameTypePositions(keys) {
  const positions = new Array(keys.length);
  const groups = { white: [], black: [] };
  for (let i = 0; i < keys.length; i += 1) groups[keys[i].type === 'black' ? 'black' : 'white'].push(i);
  for (const type of ['white', 'black']) {
    groups[type].forEach((keyIndex, position) => { positions[keyIndex] = { type, position }; });
  }
  return { groups, positions };
}

function estimateLocalCommonEffect(keyIndex, metrics, keys, sameType, validKeyMask, options) {
  const info = sameType.positions[keyIndex];
  if (!info) return { dL: 0, da: 0, db: 0, count: 0 };
  const group = sameType.groups[info.type];
  const candidates = [];
  const radius = options.neighborRadius;
  for (let delta = -radius; delta <= radius; delta += 1) {
    if (delta === 0) continue;
    const pos = info.position + delta;
    if (pos < 0 || pos >= group.length) continue;
    const neighborIndex = group[pos];
    if (validKeyMask && validKeyMask[neighborIndex] === false) continue;
    candidates.push({ index: neighborIndex, metric: metrics[neighborIndex] });
  }
  if (candidates.length < 2) return { dL: 0, da: 0, db: 0, count: 0 };

  // Real pressed keys are usually the strongest local outliers. Estimate the
  // common lighting/effect vector from the quieter half of nearby same-type
  // keys, so chords are not simply averaged into the background effect.
  candidates.sort((a, b) => a.metric.minDeltaE - b.metric.minDeltaE);
  const keep = Math.max(2, Math.ceil(candidates.length * options.neighborQuietFraction));
  const quiet = candidates.slice(0, keep);
  return {
    dL: median(quiet.map(item => item.metric.vector.dL)),
    da: median(quiet.map(item => item.metric.vector.da)),
    db: median(quiet.map(item => item.metric.vector.db)),
    count: quiet.length,
  };
}

function residualAfterCommonEffect(metric, common) {
  let minDeltaE = Infinity;
  let minChroma = Infinity;
  let maxChroma = 0;
  const residualVectors = [];
  for (const patch of metric.patches) {
    const dL = patch.dL - common.dL;
    const da = patch.da - common.da;
    const db = patch.db - common.db;
    const adjusted = {
      l: patch.base.l + dL,
      a: patch.base.a + da,
      b: patch.base.b + db,
    };
    const de = deltaE2000(patch.base, adjusted);
    const chroma = Math.hypot(da, db);
    minDeltaE = Math.min(minDeltaE, de);
    minChroma = Math.min(minChroma, chroma);
    maxChroma = Math.max(maxChroma, chroma);
    residualVectors.push({ da, db, chroma });
  }
  return { minDeltaE, minChroma, maxChroma, residualVectors };
}

function residualDirectionConsensus(residual, options) {
  const da = median(residual.residualVectors.map(v => v.da));
  const db = median(residual.residualVectors.map(v => v.db));
  const aggregateMag = Math.hypot(da, db);
  if (aggregateMag < 1e-6 || residual.maxChroma < 1e-6) return false;
  if (residual.minChroma / residual.maxChroma < options.minResidualPatchBalance) return false;
  for (const vector of residual.residualVectors) {
    if (vector.chroma < 1e-6) return false;
    const cosine = (vector.da * da + vector.db * db) / (vector.chroma * aggregateMag);
    if (cosine < options.minResidualDirectionCosine) return false;
  }
  return true;
}

function keyPressed(metrics, keyIndex, common, options) {
  const metric = metrics[keyIndex];

  // First gate: all three visible sub-patches must plainly leave the fixed
  // released color in the same color direction. This rejects edge glints and
  // gradients that touch only part of a key.
  if (metric.minDeltaE < options.clearDeltaE) return false;
  if (metric.minChroma < options.minChromaticShift) return false;
  if (!patchDirectionConsensus(metric, options)) return false;

  if (common.count < 2) return true;
  const commonChroma = Math.hypot(common.da, common.db);
  const commonLabMagnitude = Math.hypot(common.dL, common.da, common.db);
  if (commonChroma < options.minCommonEffectChroma && commonLabMagnitude < options.minCommonEffectLab) return true;

  // Remove the same-frame color/light movement shared by nearby unpressed
  // keys. A wide blue glow can strongly tint black keys, but if neighboring
  // black keys move in the same direction that shared component is treated as
  // an effect, not a key press.
  const residual = residualAfterCommonEffect(metric, common);
  if (residual.minDeltaE < options.minResidualDeltaE) return false;
  if (residual.minChroma < options.minResidualChromaticShift) return false;
  if (!residualDirectionConsensus(residual, options)) return false;
  return true;
}

/**
 * Convert frame colors to note intervals.
 *
 * Invariants used by v13:
 *  - the released color captured during keyboard setup is fixed;
 *  - pressed color is unrestricted (blue/green/red/etc. all allowed);
 *  - no temporal smoothing/debounce/hysteresis/minimum note length;
 *  - same-frame neighboring keys are used only to subtract common visual
 *    effects such as glow, bloom, color wash, or lighting.
 */
export function detectNotesFromFeatures(store, keys, options = {}, onProgress) {
  if (store.frameCount === 0) return { notes: [], baselines: null };
  if (keys.length !== store.keyCount) throw new Error(t('error.key_count_mismatch'));

  const velocity = clamp(Math.round(Number(options.velocity) || 100), 1, 127);
  const detectionOptions = {
    clearDeltaE: clamp(Number(options.clearDeltaE) || 18, 1, 100),
    minChromaticShift: clamp(Number(options.minChromaticShift) || 16, 1, 150),
    minPatchBalance: clamp(Number(options.minPatchBalance) || 0.46, 0.05, 1),
    minPatchDirectionCosine: clamp(Number(options.minPatchDirectionCosine) || 0.70, -1, 1),
    neighborRadius: clamp(Math.round(Number(options.neighborRadius) || 5), 1, 12),
    neighborQuietFraction: clamp(Number(options.neighborQuietFraction) || 0.5, 0.2, 0.8),
    minCommonEffectChroma: clamp(Number(options.minCommonEffectChroma) || 6, 0, 100),
    minCommonEffectLab: clamp(Number(options.minCommonEffectLab) || 8, 0, 150),
    minResidualDeltaE: clamp(Number(options.minResidualDeltaE) || 11, 1, 100),
    minResidualChromaticShift: clamp(Number(options.minResidualChromaticShift) || 11, 1, 150),
    minResidualPatchBalance: clamp(Number(options.minResidualPatchBalance) || 0.38, 0.05, 1),
    minResidualDirectionCosine: clamp(Number(options.minResidualDirectionCosine) || 0.58, -1, 1),
  };

  const suppliedBaseline = options.baselineColors;
  if (!suppliedBaseline || suppliedBaseline.length !== store.keyCount * CHANNELS_PER_KEY) {
    throw new Error(t('error.baseline_missing'));
  }
  const fixedBaselineColors = Float32Array.from(suppliedBaseline);
  const baselines = {
    colors: fixedBaselineColors,
    confidence: new Float32Array(store.keyCount * PATCH_COUNT).fill(1),
    source: 'setup-frame',
  };
  const baselineLab = baselineLabTable(fixedBaselineColors, store.keyCount);
  const sameType = buildSameTypePositions(keys);
  const validKeyMask = Array.isArray(options.validKeyMask) || ArrayBuffer.isView(options.validKeyMask)
    ? options.validKeyMask
    : null;

  const states = Array.from({ length: store.keyCount }, () => ({ active: false, noteStart: 0 }));
  const notes = [];
  let processed = 0;
  let finalTime = 0;

  store.forEachFrame(({ timestamp, duration, colors }) => {
    finalTime = Math.max(finalTime, timestamp + Math.max(0, duration));
    const metrics = buildFrameMetrics(colors, baselineLab, store.keyCount);

    for (let keyIndex = 0; keyIndex < store.keyCount; keyIndex += 1) {
      const state = states[keyIndex];
      const valid = !validKeyMask || validKeyMask[keyIndex] !== false;
      const common = valid
        ? estimateLocalCommonEffect(keyIndex, metrics, keys, sameType, validKeyMask, detectionOptions)
        : { dL: 0, da: 0, db: 0, count: 0 };
      const pressed = valid && keyPressed(metrics, keyIndex, common, detectionOptions);

      if (!state.active && pressed) {
        state.active = true;
        state.noteStart = timestamp;
      } else if (state.active && !pressed) {
        const end = Math.max(state.noteStart, timestamp);
        notes.push({
          midi: keys[keyIndex].midi,
          name: keys[keyIndex].name,
          start: state.noteStart,
          end,
          duration: end - state.noteStart,
          velocity,
          keyType: keys[keyIndex].type,
        });
        state.active = false;
      }
    }

    processed += 1;
    if (processed % 180 === 0) {
      onProgress?.({
        phase: 'notes',
        progress: processed / Math.max(1, store.frameCount),
        detail: t('analysis.post_detail', { processed: processed.toLocaleString(getLanguage()), total: store.frameCount.toLocaleString(getLanguage()) }),
      });
    }
  });

  for (let keyIndex = 0; keyIndex < store.keyCount; keyIndex += 1) {
    const state = states[keyIndex];
    if (!state.active) continue;
    const end = Math.max(state.noteStart, finalTime);
    notes.push({
      midi: keys[keyIndex].midi,
      name: keys[keyIndex].name,
      start: state.noteStart,
      end,
      duration: end - state.noteStart,
      velocity,
      keyType: keys[keyIndex].type,
    });
  }

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi || a.end - b.end);
  onProgress?.({ phase: 'done', progress: 1, detail: t('analysis.post_done', { count: notes.length.toLocaleString(getLanguage()) }) });
  return { notes, baselines, detectionOptions };
}

export function calculateMaximumPolyphony(notes) {
  const events = [];
  for (const note of notes) {
    events.push({ time: note.start, delta: 1 });
    events.push({ time: note.end, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0; let maximum = 0;
  for (const event of events) {
    current += event.delta;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}
