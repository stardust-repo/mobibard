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
