const WINDOW_MIN_SECONDS = 0.045;
const WINDOW_MAX_SECONDS = 0.12;
const SEARCH_OFFSETS = Object.freeze([-0.035, -0.012, 0.012, 0.038, 0.067, 0.098]);
const PRE_OFFSET_SECONDS = -0.105;
const HARMONIC_WEIGHTS = Object.freeze([1, 0.5, 0.28, 0.16]);
const TUNING_MULTIPLIERS = Object.freeze([0.997, 1, 1.003]);
const JOINT_ONSET_TOLERANCE_SECONDS = 0.02;
const JOINT_BIN_TOLERANCE_CENTS = 12;
const JOINT_HARMONIC_AMPLITUDE_PROFILE = Object.freeze([1, 0.52, 0.30, 0.18]);
const JOINT_REGULARIZATION = 0.18;
const JOINT_ITERATIONS = 32;
const hannCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function midiToFrequency(midi) {
  return 440 * (2 ** ((Number(midi) - 69) / 12));
}

function quantile(sorted, amount) {
  if (!sorted.length) return Number.NaN;
  const position = clamp(amount, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const fraction = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * fraction);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

function getHann(length) {
  const rounded = Math.max(64, Math.round(length / 16) * 16);
  if (hannCache.has(rounded)) return hannCache.get(rounded);
  const window = new Float32Array(rounded);
  for (let index = 0; index < rounded; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((Math.PI * 2 * index) / (rounded - 1));
  }
  hannCache.set(rounded, window);
  return window;
}

function sinusoidAmplitude(samples, startIndex, hann, sampleRate, frequency) {
  if (!(frequency > 0 && frequency < sampleRate * 0.49)) return 0;
  if (startIndex < 0 || startIndex + hann.length > samples.length) return 0;
  const omega = (Math.PI * 2 * frequency) / sampleRate;
  const cosStep = Math.cos(omega);
  const sinStep = Math.sin(omega);
  let cosValue = 1;
  let sinValue = 0;
  let real = 0;
  let imag = 0;
  let weightSum = 0;

  for (let offset = 0; offset < hann.length; offset += 1) {
    const weight = hann[offset];
    const weighted = samples[startIndex + offset] * weight;
    real += weighted * cosValue;
    imag -= weighted * sinValue;
    weightSum += weight;
    const nextCos = cosValue * cosStep - sinValue * sinStep;
    sinValue = sinValue * cosStep + cosValue * sinStep;
    cosValue = nextCos;
  }
  return weightSum > 0 ? (2 * Math.hypot(real, imag)) / weightSum : 0;
}

function harmonicStrength(samples, startIndex, hann, sampleRate, midi) {
  const fundamental = midiToFrequency(midi);
  let best = 0;
  for (const tuning of TUNING_MULTIPLIERS) {
    let weightedSquares = 0;
    let weightTotal = 0;
    for (let harmonicIndex = 0; harmonicIndex < HARMONIC_WEIGHTS.length; harmonicIndex += 1) {
      const frequency = fundamental * (harmonicIndex + 1) * tuning;
      if (frequency >= sampleRate * 0.49) break;
      const weight = HARMONIC_WEIGHTS[harmonicIndex];
      const amplitude = sinusoidAmplitude(samples, startIndex, hann, sampleRate, frequency);
      weightedSquares += amplitude * amplitude * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) best = Math.max(best, Math.sqrt(weightedSquares / weightTotal));
  }
  return best;
}

function estimateLevelDb(samples, sampleRate, onsetSeconds, midi) {
  const fundamental = midiToFrequency(midi);
  if (!(fundamental > 0 && fundamental < sampleRate * 0.48)) return Number.NaN;
  const windowSeconds = clamp(4 / fundamental, WINDOW_MIN_SECONDS, WINDOW_MAX_SECONDS);
  const hann = getHann(windowSeconds * sampleRate);
  let attack = 0;
  for (const offset of SEARCH_OFFSETS) {
    const start = Math.round((onsetSeconds + offset) * sampleRate);
    attack = Math.max(attack, harmonicStrength(samples, start, hann, sampleRate, midi));
  }
  const preStart = Math.round((onsetSeconds + PRE_OFFSET_SECONDS) * sampleRate);
  const pre = harmonicStrength(samples, preStart, hann, sampleRate, midi);
  const cleaned = Math.max(1e-8, attack - pre * 0.62);
  return 20 * Math.log10(cleaned);
}


function centsDistance(left, right) {
  if (!(left > 0 && right > 0)) return Infinity;
  return Math.abs(1200 * Math.log2(left / right));
}

function createJointBins(midis, sampleRate) {
  const bins = [];
  const nyquist = sampleRate * 0.49;
  for (let noteIndex = 0; noteIndex < midis.length; noteIndex += 1) {
    const fundamental = midiToFrequency(midis[noteIndex]);
    for (let harmonicIndex = 0; harmonicIndex < JOINT_HARMONIC_AMPLITUDE_PROFILE.length; harmonicIndex += 1) {
      const frequency = fundamental * (harmonicIndex + 1);
      if (!(frequency > 0 && frequency < nyquist)) break;
      let target = null;
      for (const bin of bins) {
        if (centsDistance(bin.frequency, frequency) <= JOINT_BIN_TOLERANCE_CENTS) {
          target = bin;
          break;
        }
      }
      if (!target) {
        target = { frequency, weightSum: 0, weightedFrequency: 0, coefficients: new Float64Array(midis.length) };
        bins.push(target);
      }
      const harmonicAmplitude = JOINT_HARMONIC_AMPLITUDE_PROFILE[harmonicIndex];
      const coefficient = harmonicAmplitude * harmonicAmplitude;
      target.coefficients[noteIndex] += coefficient;
      target.weightSum += coefficient;
      target.weightedFrequency += frequency * coefficient;
      target.frequency = target.weightedFrequency / Math.max(1e-9, target.weightSum);
    }
  }
  return bins.sort((left, right) => left.frequency - right.frequency);
}

function tunedAmplitude(samples, startIndex, hann, sampleRate, frequency) {
  let best = 0;
  for (const tuning of TUNING_MULTIPLIERS) {
    best = Math.max(best, sinusoidAmplitude(samples, startIndex, hann, sampleRate, frequency * tuning));
  }
  return best;
}

function cleanedBinPower(samples, sampleRate, onsetSeconds, frequency, hann) {
  let attack = 0;
  for (const offset of SEARCH_OFFSETS) {
    const start = Math.round((onsetSeconds + offset) * sampleRate);
    attack = Math.max(attack, tunedAmplitude(samples, start, hann, sampleRate, frequency));
  }
  const preStart = Math.round((onsetSeconds + PRE_OFFSET_SECONDS) * sampleRate);
  const pre = tunedAmplitude(samples, preStart, hann, sampleRate, frequency);
  const cleaned = Math.max(1e-8, attack - pre * 0.62);
  return cleaned * cleaned;
}

function solveJointPowers(matrixRows, observations, priors) {
  const noteCount = priors.length;
  if (!noteCount) return new Float64Array(0);
  const values = Float64Array.from(priors, value => Math.max(1e-12, Number(value) || 0));
  const fitted = new Float64Array(observations.length);
  const rebuildFitted = () => {
    fitted.fill(0);
    for (let row = 0; row < matrixRows.length; row += 1) {
      const coefficients = matrixRows[row];
      let sum = 0;
      for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) sum += coefficients[noteIndex] * values[noteIndex];
      fitted[row] = sum;
    }
  };
  rebuildFitted();

  for (let iteration = 0; iteration < JOINT_ITERATIONS; iteration += 1) {
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
      let numerator = JOINT_REGULARIZATION * priors[noteIndex];
      let denominator = JOINT_REGULARIZATION;
      for (let row = 0; row < matrixRows.length; row += 1) {
        const coefficient = matrixRows[row][noteIndex];
        if (!(coefficient > 0)) continue;
        const residualWithoutCurrent = observations[row] - (fitted[row] - coefficient * values[noteIndex]);
        numerator += coefficient * residualWithoutCurrent;
        denominator += coefficient * coefficient;
      }
      const next = Math.max(1e-12, numerator / Math.max(1e-9, denominator));
      const delta = next - values[noteIndex];
      if (Math.abs(delta) < 1e-14) continue;
      values[noteIndex] = next;
      for (let row = 0; row < matrixRows.length; row += 1) {
        const coefficient = matrixRows[row][noteIndex];
        if (coefficient) fitted[row] += coefficient * delta;
      }
    }
  }
  return values;
}

function estimateJointLevelsDb(samples, sampleRate, onsetSeconds, midis) {
  const uniqueMidis = [...new Set(midis.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!uniqueMidis.length) return new Map();
  if (uniqueMidis.length === 1) return new Map([[uniqueMidis[0], estimateLevelDb(samples, sampleRate, onsetSeconds, uniqueMidis[0])]]);

  const minimumFundamental = Math.min(...uniqueMidis.map(midiToFrequency));
  const windowSeconds = clamp(4 / minimumFundamental, WINDOW_MIN_SECONDS, WINDOW_MAX_SECONDS);
  const hann = getHann(windowSeconds * sampleRate);
  const bins = createJointBins(uniqueMidis, sampleRate);
  if (bins.length < uniqueMidis.length) {
    return new Map(uniqueMidis.map(midi => [midi, estimateLevelDb(samples, sampleRate, onsetSeconds, midi)]));
  }

  const observations = bins.map(bin => cleanedBinPower(samples, sampleRate, onsetSeconds, bin.frequency, hann));
  const priors = uniqueMidis.map(midi => {
    const levelDb = estimateLevelDb(samples, sampleRate, onsetSeconds, midi);
    return Number.isFinite(levelDb) ? 10 ** (levelDb / 10) : 1e-12;
  });
  const solved = solveJointPowers(bins.map(bin => bin.coefficients), observations, priors);
  const exclusiveEstimates = Array.from({ length: uniqueMidis.length }, () => []);
  const hasExclusiveFundamental = new Array(uniqueMidis.length).fill(false);
  for (let row = 0; row < bins.length; row += 1) {
    const contributors = [];
    for (let noteIndex = 0; noteIndex < uniqueMidis.length; noteIndex += 1) {
      if (bins[row].coefficients[noteIndex] > 0) contributors.push(noteIndex);
    }
    if (contributors.length !== 1) continue;
    const noteIndex = contributors[0];
    const coefficient = bins[row].coefficients[noteIndex];
    const estimate = Math.sqrt(Math.max(1e-12, observations[row]) / Math.max(1e-9, coefficient));
    if (Number.isFinite(estimate)) exclusiveEstimates[noteIndex].push(estimate);
    if (coefficient > 0.85) hasExclusiveFundamental[noteIndex] = true;
  }

  const levels = new Map();
  for (let index = 0; index < uniqueMidis.length; index += 1) {
    const priorAmplitude = Math.sqrt(Math.max(1e-12, priors[index]));
    const exclusive = exclusiveEstimates[index];
    let sourceAmplitude;
    if (exclusive.length) {
      const exclusiveAmplitude = median(exclusive);
      const confidence = hasExclusiveFundamental[index] ? 0.90 : (exclusive.length >= 2 ? 0.78 : 0.45);
      sourceAmplitude = priorAmplitude * (1 - confidence) + exclusiveAmplitude * confidence;
    } else {
      const solvedAmplitude = Math.sqrt(Math.max(1e-12, solved[index]));
      sourceAmplitude = priorAmplitude * 0.72 + solvedAmplitude * 0.28;
    }
    levels.set(uniqueMidis[index], 20 * Math.log10(Math.max(1e-8, sourceAmplitude)));
  }
  return levels;
}

function clusterPitchGroupsByOnset(groups) {
  const clusters = [];
  let current = null;
  for (const group of groups) {
    if (!current || group.onset - current.startOnset > JOINT_ONSET_TOLERANCE_SECONDS) {
      current = { startOnset: group.onset, groups: [] };
      clusters.push(current);
    }
    current.groups.push(group);
  }
  return clusters;
}

function instrumentKey(note) {
  return `${note.channel}:${note.bankMsb || 0}:${note.bankLsb || 0}:${note.program || 0}`;
}

function octaveKey(note) {
  return `${instrumentKey(note)}:${Math.floor((Number(note.midi) || 0) / 12)}`;
}

function controllerCorrectedLevel(note, level, compensateControllers) {
  if (!compensateControllers || !Number.isFinite(level)) return level;
  const volume = clamp((Number(note.channelVolume) || 0) / 127, 0, 1);
  const expression = clamp((Number(note.expression) || 0) / 127, 0, 1);
  const factor = volume * expression;
  if (factor < 0.025) return level;
  return level - 20 * Math.log10(factor);
}

function makeStats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const med = quantile(sorted, 0.5);
  const low = quantile(sorted, 0.2);
  const high = quantile(sorted, 0.8);
  return { median: med, low, high, spread: Math.max(4, high - low), count: sorted.length };
}

function analyze(message) {
  const samples = message.samples instanceof Float32Array ? message.samples : new Float32Array(message.samples || 0);
  const sampleRate = Math.max(8000, Number(message.sampleRate) || 16000);
  const notes = Array.isArray(message.notes) ? message.notes : [];
  const offsetSeconds = Number(message.offsetSeconds) || 0;
  const baseVelocity = clamp(Math.round(Number(message.baseVelocity) || 96), 1, 127);
  const dynamicScale = clamp((Number(message.dynamicPercent) || 100) / 100, 0.25, 2.5);
  const compensateControllers = message.compensateControllers !== false;
  const duration = samples.length / sampleRate;

  const uniqueGroups = new Map();
  for (const note of notes) {
    const onset = Number(note.time) + offsetSeconds;
    const key = `${Math.round(onset * 1000)}:${note.midi}`;
    let group = uniqueGroups.get(key);
    if (!group) {
      group = { onset, midi: note.midi, noteIds: [] };
      uniqueGroups.set(key, group);
    }
    group.noteIds.push(note.index);
  }

  const groups = [...uniqueGroups.values()].sort((left, right) => left.onset - right.onset || left.midi - right.midi);
  const clusters = clusterPitchGroupsByOnset(groups);
  const levelByNoteId = new Map();
  let outsideCount = 0;
  let silentCount = 0;
  let completedGroups = 0;
  const progressStep = Math.max(1, Math.floor(groups.length / 120));

  for (const cluster of clusters) {
    const validGroups = cluster.groups.filter(group => group.onset >= -0.02 && group.onset <= duration + 0.02);
    for (const group of cluster.groups) {
      if (!validGroups.includes(group)) outsideCount += group.noteIds.length;
    }

    let jointLevels = new Map();
    if (validGroups.length) {
      const onset = validGroups.reduce((sum, group) => sum + group.onset, 0) / validGroups.length;
      jointLevels = estimateJointLevelsDb(samples, sampleRate, onset, validGroups.map(group => group.midi));
    }

    for (const group of cluster.groups) {
      let level = validGroups.includes(group) ? jointLevels.get(group.midi) : Number.NaN;
      if (Number.isFinite(level) && level < -95) {
        silentCount += group.noteIds.length;
        level = Number.NaN;
      }
      for (const noteId of group.noteIds) levelByNoteId.set(noteId, level);
      completedGroups += 1;
      if (completedGroups % progressStep === 0 || completedGroups === groups.length) {
        postMessage({ type: 'progress', completed: completedGroups, total: groups.length });
      }
    }
  }

  const enriched = notes.map(note => {
    const measured = levelByNoteId.get(note.index);
    return {
      ...note,
      measuredLevelDb: measured,
      correctedLevelDb: controllerCorrectedLevel(note, measured, compensateControllers),
    };
  });

  const instrumentValues = new Map();
  const octaveValues = new Map();
  const allValues = [];
  for (const note of enriched) {
    if (!Number.isFinite(note.correctedLevelDb)) continue;
    allValues.push(note.correctedLevelDb);
    const inst = instrumentKey(note);
    const octave = octaveKey(note);
    if (!instrumentValues.has(inst)) instrumentValues.set(inst, []);
    if (!octaveValues.has(octave)) octaveValues.set(octave, []);
    instrumentValues.get(inst).push(note.correctedLevelDb);
    octaveValues.get(octave).push(note.correctedLevelDb);
  }

  const globalStats = makeStats(allValues);
  const instrumentStats = new Map([...instrumentValues].map(([key, values]) => [key, makeStats(values)]));
  const octaveMedians = new Map([...octaveValues].map(([key, values]) => [key, values.length >= 6 ? median(values) : Number.NaN]));

  const pitchAdjusted = enriched.map(note => {
    if (!Number.isFinite(note.correctedLevelDb)) return { ...note, adjustedLevelDb: Number.NaN };
    const instStats = instrumentStats.get(instrumentKey(note)) || globalStats;
    const octaveMedian = octaveMedians.get(octaveKey(note));
    const adjustment = Number.isFinite(octaveMedian) && instStats
      ? octaveMedian - instStats.median
      : 0;
    return { ...note, adjustedLevelDb: note.correctedLevelDb - adjustment };
  });

  const adjustedByInstrument = new Map();
  for (const note of pitchAdjusted) {
    if (!Number.isFinite(note.adjustedLevelDb)) continue;
    const key = instrumentKey(note);
    if (!adjustedByInstrument.has(key)) adjustedByInstrument.set(key, []);
    adjustedByInstrument.get(key).push(note.adjustedLevelDb);
  }
  const adjustedStats = new Map([...adjustedByInstrument].map(([key, values]) => [key, makeStats(values)]));
  const fallbackStats = makeStats(pitchAdjusted.map(note => note.adjustedLevelDb)) || globalStats;

  const results = [];
  for (const note of pitchAdjusted) {
    if (!Number.isFinite(note.adjustedLevelDb)) {
      results.push({ index: note.index, velocity: note.originalVelocity, levelDb: null, analyzed: false });
      continue;
    }
    const stats = (adjustedStats.get(instrumentKey(note))?.count >= 8
      ? adjustedStats.get(instrumentKey(note))
      : fallbackStats) || { median: note.adjustedLevelDb, spread: 8 };
    const unitsPerDb = clamp((28 / Math.max(4, stats.spread)) * dynamicScale, 1.1, 8.5);
    const deltaDb = clamp(note.adjustedLevelDb - stats.median, -24, 14);
    const velocity = clamp(Math.round(baseVelocity + deltaDb * unitsPerDb), 1, 127);
    results.push({ index: note.index, velocity, levelDb: note.measuredLevelDb, analyzed: true });
  }

  let analyzedCount = 0;
  let minVelocity = Infinity;
  let maxVelocity = -Infinity;
  let velocitySum = 0;
  for (const result of results) {
    if (!result.analyzed) continue;
    analyzedCount += 1;
    minVelocity = Math.min(minVelocity, result.velocity);
    maxVelocity = Math.max(maxVelocity, result.velocity);
    velocitySum += result.velocity;
  }
  postMessage({
    type: 'done',
    results,
    summary: {
      analyzedCount,
      outsideCount,
      silentCount,
      minVelocity: analyzedCount ? minVelocity : null,
      maxVelocity: analyzedCount ? maxVelocity : null,
      averageVelocity: analyzedCount ? velocitySum / analyzedCount : null,
      uniqueAnalysisCount: groups.length,
      jointClusterCount: clusters.length,
    },
  });
}

self.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type !== 'analyze') return;
  try {
    analyze(message);
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
});
