import { t } from './language-manager.js?v=20260830-cleanup2';
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const PROBE_PATCH_COUNT = 3;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isWhiteMidi(midi) {
  return WHITE_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

export function midiNoteName(midi) {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pitchClass]}${octave}`;
}

export function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remain = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remain.toFixed(3).padStart(6, '0')}`;
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const position = (sorted.length - 1) * clamp(q, 0, 1);
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function median(values) {
  return quantile(values, 0.5);
}

function medianAbsoluteDeviation(values, center = median(values)) {
  const deviations = Array.from(values, value => Math.abs(value - center));
  return median(deviations);
}

function boxSmooth(values, radius) {
  const output = new Float32Array(values.length);
  if (radius <= 0 || values.length === 0) {
    output.set(values);
    return output;
  }

  let sum = 0;
  let left = 0;
  let right = -1;
  for (let i = 0; i < values.length; i += 1) {
    const targetLeft = Math.max(0, i - radius);
    const targetRight = Math.min(values.length - 1, i + radius);
    while (right < targetRight) sum += values[++right];
    while (left < targetLeft) sum -= values[left++];
    output[i] = sum / (right - left + 1);
  }
  return output;
}

function downsampleLuma(imageData, maxWidth = 420, maxHeight = 300) {
  const { width, height, data } = imageData;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const output = new Float32Array(outWidth * outHeight);

  for (let y = 0; y < outHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / outWidth));
      const index = (sourceY * width + sourceX) * 4;
      output[y * outWidth + x] = luma(data[index], data[index + 1], data[index + 2]);
    }
  }

  return {
    data: output,
    width: outWidth,
    height: outHeight,
    scaleX: width / outWidth,
    scaleY: height / outHeight,
  };
}

function makeIntegral(values, width, height, transform = value => value) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += transform(values[y * width + x], x, y);
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }
  return integral;
}

function integralRect(integral, width, x0, y0, x1, y1) {
  const stride = width + 1;
  const ax = clamp(Math.floor(x0), 0, width);
  const ay = clamp(Math.floor(y0), 0, (integral.length / stride) - 1);
  const bx = clamp(Math.ceil(x1), 0, width);
  const by = clamp(Math.ceil(y1), 0, (integral.length / stride) - 1);
  return integral[by * stride + bx]
    - integral[ay * stride + bx]
    - integral[by * stride + ax]
    + integral[ay * stride + ax];
}

function bandStats(integral, integralSq, width, x0, y0, x1, y1) {
  const count = Math.max(1, (Math.ceil(x1) - Math.floor(x0)) * (Math.ceil(y1) - Math.floor(y0)));
  const sum = integralRect(integral, width, x0, y0, x1, y1);
  const sumSq = integralRect(integralSq, width, x0, y0, x1, y1);
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

function verticalEdgeProfile(gray, width, y0, y1) {
  const profile = new Float32Array(width);
  const startY = clamp(Math.floor(y0), 0, Math.max(0, Math.floor(gray.length / width) - 1));
  const endY = clamp(Math.ceil(y1), startY + 1, Math.floor(gray.length / width));
  const step = Math.max(1, Math.floor((endY - startY) / 36));
  for (let x = 1; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = startY; y < endY; y += step) {
      sum += Math.abs(gray[y * width + x] - gray[y * width + x - 1]);
      count += 1;
    }
    profile[x] = count ? sum / count : 0;
  }
  return boxSmooth(profile, 1);
}

function countProfilePeaks(profile, threshold, minDistance) {
  const peaks = [];
  for (let x = 1; x < profile.length - 1; x += 1) {
    if (profile[x] >= threshold && profile[x] >= profile[x - 1] && profile[x] > profile[x + 1]) {
      if (!peaks.length || x - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(x);
      } else if (profile[x] > profile[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = x;
      }
    }
  }
  return peaks;
}

function fillSmallFalseGaps(mask, maximumGap) {
  const result = Uint8Array.from(mask);
  let index = 0;
  while (index < result.length) {
    if (result[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < result.length && !result[index]) index += 1;
    const end = index;
    if (start > 0 && end < result.length && end - start <= maximumGap) {
      result.fill(1, start, end);
    }
  }
  return result;
}

function longestTrueRun(mask) {
  let bestStart = 0;
  let bestEnd = 0;
  let index = 0;
  while (index < mask.length) {
    while (index < mask.length && !mask[index]) index += 1;
    const start = index;
    while (index < mask.length && mask[index]) index += 1;
    if (index - start > bestEnd - bestStart) {
      bestStart = start;
      bestEnd = index;
    }
  }
  return { start: bestStart, end: bestEnd };
}

/**
 * Finds a likely horizontally aligned piano keyboard. This is intentionally a
 * proposal algorithm: the UI always keeps manual drag selection available.
 */
export function autoDetectKeyboardRegion(imageData) {
  const sourceWidth = imageData.width;
  const sourceHeight = imageData.height;
  const small = downsampleLuma(imageData);
  const { data: gray, width, height, scaleX, scaleY } = small;
  const integral = makeIntegral(gray, width, height);
  const integralSq = makeIntegral(gray, width, height, value => value * value);

  let best = null;
  const heightFractions = [0.12, 0.15, 0.18, 0.21, 0.24, 0.28, 0.32, 0.36];
  const bottomFractions = [0.68, 0.74, 0.80, 0.86, 0.92, 0.97, 1.0];

  for (const heightFraction of heightFractions) {
    const candidateHeight = Math.max(18, Math.round(height * heightFraction));
    for (const bottomFraction of bottomFractions) {
      const y1 = Math.min(height, Math.round(height * bottomFraction));
      const y0 = y1 - candidateHeight;
      if (y0 < Math.round(height * 0.32)) continue;

      const top = bandStats(integral, integralSq, width, 0, y0 + candidateHeight * 0.08, width, y0 + candidateHeight * 0.52);
      const lower = bandStats(integral, integralSq, width, 0, y0 + candidateHeight * 0.62, width, y0 + candidateHeight * 0.94);
      const edgeProfile = verticalEdgeProfile(gray, width, y0 + candidateHeight * 0.56, y0 + candidateHeight * 0.94);
      const edgeThreshold = quantile(edgeProfile, 0.82);
      const peaks = countProfilePeaks(edgeProfile, edgeThreshold, Math.max(2, Math.round(width / 180)));
      const edgeMean = edgeProfile.reduce((sum, value) => sum + value, 0) / Math.max(1, edgeProfile.length);

      let topBoundary = 0;
      if (y0 > 0) {
        for (let x = 0; x < width; x += 2) {
          topBoundary += Math.abs(gray[y0 * width + x] - gray[(y0 - 1) * width + x]);
        }
        topBoundary /= Math.ceil(width / 2);
      }

      const enoughVerticalLines = clamp(peaks.length / 16, 0, 1.4);
      const brightnessScore = clamp((lower.mean - 55) / 170, 0, 1.2);
      const textureScore = clamp((top.std + lower.std * 0.35) / 72, 0, 1.3);
      const edgeScore = clamp(edgeMean / 22, 0, 1.3);
      const boundaryScore = clamp(topBoundary / 34, 0, 1.1);
      const positionScore = clamp((y1 / height - 0.55) / 0.45, 0, 1);
      const score = brightnessScore * 1.25
        + textureScore * 0.95
        + edgeScore * 1.15
        + enoughVerticalLines * 1.05
        + boundaryScore * 0.4
        + positionScore * 0.25;

      if (!best || score > best.score) {
        best = { x0: 0, x1: width, y0, y1, score, peaks: peaks.length };
      }
    }
  }

  if (!best) {
    return {
      rect: {
        x: 0,
        y: Math.round(sourceHeight * 0.72),
        width: sourceWidth,
        height: Math.round(sourceHeight * 0.28),
      },
      confidence: 0,
      usedFallback: true,
    };
  }

  // Trim side margins by looking for a broad bright/stable run in the lower keys.
  const lowerY0 = Math.floor(best.y0 + (best.y1 - best.y0) * 0.62);
  const lowerY1 = Math.ceil(best.y0 + (best.y1 - best.y0) * 0.94);
  const columnMeans = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = lowerY0; y < lowerY1; y += 2) {
      sum += gray[y * width + x];
      count += 1;
    }
    columnMeans[x] = count ? sum / count : 0;
  }
  const p20 = quantile(columnMeans, 0.20);
  const p82 = quantile(columnMeans, 0.82);
  const threshold = p20 + (p82 - p20) * 0.22;
  const likelyKeyboard = Uint8Array.from(columnMeans, value => value >= threshold ? 1 : 0);
  const closed = fillSmallFalseGaps(likelyKeyboard, Math.max(3, Math.round(width * 0.025)));
  const run = longestTrueRun(closed);
  if (run.end - run.start >= width * 0.48) {
    best.x0 = Math.max(0, run.start - Math.round(width * 0.008));
    best.x1 = Math.min(width, run.end + Math.round(width * 0.008));
  }

  const normalizedConfidence = clamp((best.score - 2.15) / 3.45, 0, 1);
  const usedFallback = normalizedConfidence < 0.18;
  const result = usedFallback
    ? { x0: 0, x1: width, y0: Math.round(height * 0.72), y1: height }
    : best;

  const x = Math.round(result.x0 * scaleX);
  const y = Math.round(result.y0 * scaleY);
  const x1 = Math.round(result.x1 * scaleX);
  const y1 = Math.round(result.y1 * scaleY);
  return {
    rect: {
      x: clamp(x, 0, sourceWidth - 1),
      y: clamp(y, 0, sourceHeight - 1),
      width: clamp(x1 - x, 8, sourceWidth - x),
      height: clamp(y1 - y, 8, sourceHeight - y),
    },
    confidence: usedFallback ? 0.1 : normalizedConfidence,
    usedFallback,
    diagnostics: { score: best.score, verticalPeakCount: best.peaks },
  };
}

function profileFromImage(imageData, yStartFraction, yEndFraction) {
  const { width, height, data } = imageData;
  const y0 = clamp(Math.floor(height * yStartFraction), 0, height - 1);
  const y1 = clamp(Math.ceil(height * yEndFraction), y0 + 1, height);
  const stepY = Math.max(1, Math.floor((y1 - y0) / 56));
  const luminance = new Float32Array(width);
  const verticalEdge = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    let sumLuma = 0;
    let sumEdge = 0;
    let count = 0;
    for (let y = y0; y < y1; y += stepY) {
      const index = (y * width + x) * 4;
      const current = luma(data[index], data[index + 1], data[index + 2]);
      sumLuma += current;
      if (x > 0) {
        const previousIndex = index - 4;
        const previous = luma(data[previousIndex], data[previousIndex + 1], data[previousIndex + 2]);
        sumEdge += Math.abs(current - previous);
      }
      count += 1;
    }
    luminance[x] = count ? sumLuma / count : 0;
    verticalEdge[x] = count ? sumEdge / count : 0;
  }

  return { luminance, verticalEdge };
}

function estimateBoundaryPeriod(score, width, height) {
  const minLag = clamp(Math.round(height * 0.065), 5, Math.max(5, Math.floor(width / 5)));
  const maxLag = clamp(Math.round(height * 0.38), minLag + 2, Math.max(minLag + 2, Math.min(160, Math.floor(width / 3))));
  const baseline = quantile(score, 0.55);
  const positive = Float32Array.from(score, value => Math.max(0, value - baseline));
  const correlations = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let x = 0; x + lag < width; x += 1) {
      const a = positive[x];
      const b = positive[x + lag];
      numerator += a * b;
      leftEnergy += a * a;
      rightEnergy += b * b;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy) || 1;
    const normalized = numerator / denominator;
    correlations.push({ lag, value: normalized / Math.sqrt(lag / minLag) });
  }

  const localMaxima = correlations.filter((entry, index) => {
    const before = correlations[index - 1]?.value ?? -Infinity;
    const after = correlations[index + 1]?.value ?? -Infinity;
    return entry.value >= before && entry.value >= after;
  });
  if (!localMaxima.length) return clamp(height * 0.14, minLag, maxLag);
  const strongest = Math.max(...localMaxima.map(entry => entry.value));
  const earlyStrong = localMaxima.find(entry => entry.value >= strongest * 0.72);
  return (earlyStrong ?? localMaxima.reduce((a, b) => a.value > b.value ? a : b)).lag;
}

function findBoundaryPeaks(score, nominalWidth) {
  const center = median(score);
  const mad = medianAbsoluteDeviation(score, center);
  const threshold = Math.max(quantile(score, 0.76), center + Math.max(1, mad * 1.45));
  const searchRadius = Math.max(1, Math.round(nominalWidth * 0.13));
  const candidates = [];

  for (let x = 1; x < score.length - 1; x += 1) {
    if (score[x] < threshold) continue;
    let isMaximum = true;
    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const other = x + dx;
      if (other < 0 || other >= score.length || other === x) continue;
      if (score[other] > score[x]) {
        isMaximum = false;
        break;
      }
    }
    if (isMaximum) candidates.push({ x, score: score[x] });
  }

  const minimumDistance = Math.max(2, Math.round(nominalWidth * 0.24));
  candidates.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.every(item => Math.abs(item.x - candidate.x) >= minimumDistance)) {
      selected.push(candidate);
    }
  }
  return selected.sort((a, b) => a.x - b.x);
}

function strongestPeakInRange(peaks, score, minimum, maximum, target, nominalWidth) {
  let best = null;
  for (const peak of peaks) {
    if (peak.x < minimum || peak.x > maximum) continue;
    const distancePenalty = Math.abs(peak.x - target) / Math.max(1, nominalWidth);
    const value = peak.score - distancePenalty * quantile(score, 0.8) * 0.55;
    if (!best || value > best.value) best = { ...peak, value };
  }
  return best;
}

function buildWhiteBoundaries(score, width, nominalWidth, expectedCount = 0) {
  const peaks = findBoundaryPeaks(score, nominalWidth);
  const boundaries = [0];
  let snapped = 0;

  if (expectedCount > 0) {
    // Follow the observed widths sequentially instead of snapping every boundary
    // to a globally equal grid. A perspective-skewed or deliberately stylized
    // keyboard can accumulate a large offset from the equal-grid prediction even
    // though adjacent key widths change smoothly.
    let previous = 0;
    let localWidth = width / expectedCount;
    for (let index = 1; index < expectedCount; index += 1) {
      const intervalsRemainingIncludingNext = expectedCount - index + 1;
      const remainingAverage = (width - previous) / Math.max(1, intervalsRemainingIncludingNext);
      const predictedWidth = clamp(
        localWidth * 0.72 + remainingAverage * 0.28,
        (width / expectedCount) * 0.48,
        (width / expectedCount) * 1.72,
      );
      const target = previous + predictedWidth;
      const intervalsAfterNext = expectedCount - index;
      const minimumRoomAfter = intervalsAfterNext * (width / expectedCount) * 0.40;
      const maximumX = Math.min(
        width - Math.max(2, minimumRoomAfter),
        previous + predictedWidth * 1.58,
      );
      const minimumX = previous + predictedWidth * 0.52;
      const best = strongestPeakInRange(
        peaks,
        score,
        minimumX,
        maximumX,
        target,
        predictedWidth,
      );
      let x = Math.round(best ? best.x : target);
      x = clamp(x, previous + 2, width - Math.max(2, intervalsAfterNext * 2));
      boundaries.push(x);
      if (best) snapped += 1;
      const measured = x - previous;
      localWidth = clamp(
        localWidth * 0.58 + measured * 0.42,
        (width / expectedCount) * 0.48,
        (width / expectedCount) * 1.72,
      );
      previous = x;
    }
  } else {
    let previous = 0;
    let localWidth = nominalWidth;
    let guard = 0;
    while (previous + localWidth * 0.48 < width && guard++ < 100) {
      const remaining = width - previous;
      if (remaining < localWidth * 1.42) break;
      const target = previous + localWidth;
      const best = strongestPeakInRange(
        peaks,
        score,
        previous + localWidth * 0.55,
        previous + localWidth * 1.52,
        target,
        localWidth,
      );
      let next = Math.round(best ? best.x : target);
      if (next <= previous + 1) next = Math.round(previous + localWidth);
      if (next >= width - 1) break;
      const measured = next - previous;
      boundaries.push(next);
      if (best) snapped += 1;
      localWidth = clamp(localWidth * 0.72 + measured * 0.28, nominalWidth * 0.62, nominalWidth * 1.48);
      previous = next;
    }
  }
  boundaries.push(width);

  // Refine and clean too-small intervals without forcing equal widths.
  for (let i = 1; i < boundaries.length - 1; i += 1) {
    const left = boundaries[i - 1];
    const right = boundaries[i + 1];
    const radius = Math.max(2, Math.round(Math.min(boundaries[i] - left, right - boundaries[i]) * 0.25));
    let bestX = boundaries[i];
    let bestScore = score[bestX] ?? 0;
    for (let x = Math.max(left + 2, boundaries[i] - radius); x <= Math.min(right - 2, boundaries[i] + radius); x += 1) {
      if (score[x] > bestScore) {
        bestScore = score[x];
        bestX = x;
      }
    }
    boundaries[i] = bestX;
  }

  let changed = true;
  while (changed && boundaries.length > 4) {
    changed = false;
    const widths = [];
    for (let i = 0; i < boundaries.length - 1; i += 1) widths.push(boundaries[i + 1] - boundaries[i]);
    const typical = median(widths.filter(value => value >= 3));
    for (let i = 0; i < widths.length; i += 1) {
      if (widths[i] < typical * 0.38) {
        const removeIndex = i === 0 ? 1
          : i === widths.length - 1 ? boundaries.length - 2
            : (score[boundaries[i]] < score[boundaries[i + 1]] ? i : i + 1);
        boundaries.splice(removeIndex, 1);
        changed = true;
        break;
      }
    }
  }

  const finalWidths = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) finalWidths.push(boundaries[i + 1] - boundaries[i]);
  const typical = median(finalWidths);
  const snapRatio = snapped / Math.max(1, boundaries.length - 2);
  const widthVariation = typical > 0
    ? median(finalWidths.map(value => Math.abs(value - typical))) / typical
    : 1;
  return {
    boundaries,
    peaks,
    confidence: clamp(snapRatio * 0.72 + (1 - clamp(widthVariation / 0.55, 0, 1)) * 0.28, 0, 1),
  };
}

function kMeansTwo(values) {
  let low = quantile(values, 0.25);
  let high = quantile(values, 0.78);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    let lowSum = 0;
    let lowCount = 0;
    let highSum = 0;
    let highCount = 0;
    for (const value of values) {
      if (Math.abs(value - low) <= Math.abs(value - high)) {
        lowSum += value;
        lowCount += 1;
      } else {
        highSum += value;
        highCount += 1;
      }
    }
    if (lowCount) low = lowSum / lowCount;
    if (highCount) high = highSum / highCount;
  }
  if (low > high) [low, high] = [high, low];
  return { low, high, threshold: (low + high) / 2 };
}

function removeShortRuns(mask, minimumLength) {
  const result = Uint8Array.from(mask);
  let index = 0;
  while (index < result.length) {
    if (!result[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < result.length && result[index]) index += 1;
    if (index - start < minimumLength) result.fill(0, start, index);
  }
  return result;
}

function trueRuns(mask) {
  const runs = [];
  let index = 0;
  while (index < mask.length) {
    while (index < mask.length && !mask[index]) index += 1;
    const start = index;
    while (index < mask.length && mask[index]) index += 1;
    if (index > start) runs.push({ start, end: index });
  }
  return runs;
}

function inferBlackHeight(imageData, runs, defaultHeight) {
  if (!runs.length) return defaultHeight;
  const { width, height, data } = imageData;
  const candidates = [];

  // A black key is centered on the vertical separator between two white keys.
  // Looking only at that center pixel makes the separator look like the black
  // key continues far below its real tip. Sample three points across the body
  // and require a majority to remain darker than the outside instead.
  for (const run of runs.slice(0, 36)) {
    const runWidth = Math.max(1, run.end - run.start);
    const centerX = (run.start + run.end) / 2;
    const insideXs = [0.28, 0.50, 0.72].map(t => clamp(
      Math.round(run.start + runWidth * t), 0, width - 1,
    ));
    const sideOffset = Math.max(2, Math.round(runWidth * 0.9));
    const leftX = clamp(Math.round(centerX - sideOffset), 0, width - 1);
    const rightX = clamp(Math.round(centerX + sideOffset), 0, width - 1);
    let lastDarkY = Math.round(height * 0.35);

    for (let y = Math.round(height * 0.08); y < Math.round(height * 0.82); y += 1) {
      const leftIndex = (y * width + leftX) * 4;
      const rightIndex = (y * width + rightX) * 4;
      const sideLuma = (luma(data[leftIndex], data[leftIndex + 1], data[leftIndex + 2])
        + luma(data[rightIndex], data[rightIndex + 1], data[rightIndex + 2])) / 2;
      let darkInteriorPoints = 0;
      for (const x of insideXs) {
        const index = (y * width + x) * 4;
        const insideLuma = luma(data[index], data[index + 1], data[index + 2]);
        if (sideLuma - insideLuma > 9) darkInteriorPoints += 1;
      }
      if (darkInteriorPoints >= 2) lastDarkY = y;
    }
    candidates.push(lastDarkY);
  }
  return clamp(Math.round(median(candidates)), Math.round(height * 0.35), Math.round(height * 0.78));
}

function detectBlackCandidates(imageData, boundaries) {
  const { width, height } = imageData;
  const top = profileFromImage(imageData, 0.08, 0.53).luminance;
  const bottom = profileFromImage(imageData, 0.62, 0.91).luminance;
  const contrast = new Float32Array(width);
  for (let x = 0; x < width; x += 1) contrast[x] = bottom[x] - top[x];
  const smoothed = boxSmooth(contrast, Math.max(1, Math.round(width / 900)));
  const clusters = kMeansTwo(smoothed);
  const separation = clusters.high - clusters.low;
  const threshold = separation >= 7 ? clusters.threshold : quantile(smoothed, 0.70);

  const widths = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) widths.push(boundaries[i + 1] - boundaries[i]);
  const typicalWhiteWidth = Math.max(4, median(widths));
  let mask = Uint8Array.from(smoothed, value => value >= threshold ? 1 : 0);
  mask = fillSmallFalseGaps(mask, Math.max(1, Math.round(typicalWhiteWidth * 0.09)));
  mask = removeShortRuns(mask, Math.max(2, Math.round(typicalWhiteWidth * 0.13)));
  const allRuns = trueRuns(mask).filter(run => {
    const runWidth = run.end - run.start;
    return runWidth >= typicalWhiteWidth * 0.16 && runWidth <= typicalWhiteWidth * 1.05;
  });
  const blackHeight = inferBlackHeight(imageData, allRuns, Math.round(height * 0.61));
  const gaps = new Array(Math.max(0, boundaries.length - 2)).fill(null);

  for (const run of allRuns) {
    const center = (run.start + run.end) / 2;
    let bestGap = -1;
    let bestDistance = Infinity;
    for (let gap = 0; gap < boundaries.length - 2; gap += 1) {
      const boundary = boundaries[gap + 1];
      const localWidth = Math.min(boundaries[gap + 1] - boundaries[gap], boundaries[gap + 2] - boundaries[gap + 1]);
      const distance = Math.abs(center - boundary);
      if (distance < bestDistance && distance <= localWidth * 0.58) {
        bestDistance = distance;
        bestGap = gap;
      }
    }
    if (bestGap >= 0) {
      const score = Array.from(smoothed.slice(run.start, run.end)).reduce((sum, value) => sum + value, 0)
        / Math.max(1, run.end - run.start);
      if (!gaps[bestGap] || score > gaps[bestGap].score) {
        gaps[bestGap] = {
          x0: run.start,
          x1: run.end,
          y0: Math.round(height * 0.04),
          y1: blackHeight,
          score,
        };
      }
    }
  }

  return {
    gaps,
    blackHeight,
    separation,
    threshold,
    confidence: clamp(separation / 38, 0, 1),
  };
}

function nextWhitePitchClassIndex(index) {
  return (index + 1) % 7;
}

function expectedBlackAfterWhitePitchClass(whiteIndex) {
  // C-D, D-E, F-G, G-A, A-B have black keys.
  return ![2, 6].includes(whiteIndex);
}

function inferLeftmostWhitePitchClass(blackGaps) {
  if (!blackGaps.length) return { whiteIndex: 0, confidence: 0 };
  let best = null;
  for (let startWhiteIndex = 0; startWhiteIndex < 7; startWhiteIndex += 1) {
    let score = 0;
    let weight = 0;
    for (let gap = 0; gap < blackGaps.length; gap += 1) {
      const observed = Boolean(blackGaps[gap]);
      const whiteIndex = (startWhiteIndex + gap) % 7;
      const expected = expectedBlackAfterWhitePitchClass(whiteIndex);
      const localWeight = blackGaps[gap] ? 1.25 : 0.7;
      score += observed === expected ? localWeight : -localWeight;
      weight += localWeight;
    }
    const normalized = weight ? score / weight : 0;
    if (!best || normalized > best.score) best = { whiteIndex: startWhiteIndex, score: normalized };
  }
  return { whiteIndex: best?.whiteIndex ?? 0, confidence: clamp((best?.score ?? 0) * 0.5 + 0.5, 0, 1) };
}

/** Detects non-equal white-key boundaries and black-key shapes inside a selected ROI. */
export function detectKeyGeometry(imageData, options = {}) {
  const { width, height } = imageData;
  if (width < 40 || height < 24) throw new Error(t('error.region_small'));

  const lower = profileFromImage(imageData, 0.56, 0.94);
  const smoothLuminance = boxSmooth(lower.luminance, Math.max(2, Math.round(height * 0.035)));
  const localLuminance = boxSmooth(lower.luminance, Math.max(4, Math.round(height * 0.12)));
  const smoothEdge = boxSmooth(lower.verticalEdge, Math.max(1, Math.round(width / 1200)));
  const score = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const darkness = Math.max(0, localLuminance[x] - smoothLuminance[x]);
    score[x] = smoothEdge[x] * 1.55 + darkness * 0.72;
  }

  const requestedCount = clamp(Math.round(Number(options.expectedWhiteKeyCount) || 0), 0, 75);
  const estimatedPeriod = requestedCount > 0 ? width / requestedCount : estimateBoundaryPeriod(score, width, height);
  const white = buildWhiteBoundaries(score, width, estimatedPeriod, requestedCount);
  if (white.boundaries.length < 4) throw new Error(t('error.white_boundaries'));

  const black = detectBlackCandidates(imageData, white.boundaries);
  const inferred = inferLeftmostWhitePitchClass(black.gaps);
  const whiteCount = white.boundaries.length - 1;
  const overallConfidence = clamp(white.confidence * 0.72 + black.confidence * 0.28, 0, 1);

  return {
    width,
    height,
    whiteBoundaries: white.boundaries,
    blackGaps: black.gaps,
    blackHeight: black.blackHeight,
    inferredLeftmostWhiteIndex: inferred.whiteIndex,
    inferredLeftmostWhiteName: WHITE_NAMES[inferred.whiteIndex],
    inferredPitchConfidence: inferred.confidence,
    whiteCount,
    detectedBlackCount: black.gaps.filter(Boolean).length,
    nominalWhiteWidth: estimatedPeriod,
    confidence: overallConfidence,
    diagnostics: {
      whiteConfidence: white.confidence,
      blackConfidence: black.confidence,
      blackContrastSeparation: black.separation,
      candidateBoundaryCount: white.peaks.length,
    },
  };
}

function nextWhiteMidi(midi) {
  const pitchClass = ((midi % 12) + 12) % 12;
  return midi + (pitchClass === 4 || pitchClass === 11 ? 1 : 2);
}

function nearestWhiteMidiWithPitchClass(pitchClass, around = 48) {
  let best = null;
  for (let midi = 0; midi <= 127; midi += 1) {
    if (!isWhiteMidi(midi) || midi % 12 !== pitchClass) continue;
    const distance = Math.abs(midi - around);
    if (!best || distance < best.distance) best = { midi, distance };
  }
  return best?.midi ?? 60;
}

/**
 * Detects a flat chromatic keyboard from one guide line. This mode is for
 * piano-roll videos where all 88 keys are drawn as simple white/black strips
 * instead of a traditional raised black-key silhouette. Boundaries are found
 * from color/edge changes around the selected line, while the expected 88-key
 * count keeps the result stable when adjacent white keys have weak borders.
 */
export function detectSingleLineKeyGeometry(imageData, options = {}) {
  const { width, height, data } = imageData;
  if (width < 88 || height < 8) throw new Error(t('error.region_small'));
  const expectedKeyCount = clamp(Math.round(Number(options.expectedKeyCount) || 88), 12, 128);
  const requestedLineY = Number(options.lineY);
  const centerY = clamp(Number.isFinite(requestedLineY) ? requestedLineY : height / 2, 0, Math.max(0, height - 1));
  const halfBand = Math.max(1, Math.round(height * 0.16));
  const y0 = clamp(Math.floor(centerY - halfBand), 0, Math.max(0, height - 1));
  const y1 = clamp(Math.ceil(centerY + halfBand), y0 + 1, height);
  const edge = new Float32Array(width);

  for (let x = 1; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y += 1) {
      const a = (y * width + x - 1) * 4;
      const b = (y * width + x) * 4;
      const dr = data[b] - data[a];
      const dg = data[b + 1] - data[a + 1];
      const db = data[b + 2] - data[a + 2];
      sum += Math.hypot(dr, dg, db);
      count += 1;
    }
    edge[x] = count ? sum / count : 0;
  }

  const score = boxSmooth(edge, Math.max(1, Math.round(width / 2200)));
  const nominalWidth = width / expectedKeyCount;
  const detected = buildWhiteBoundaries(score, width, nominalWidth, expectedKeyCount);

  // In one-line mode the visual keyboard is expected to contain 88 equal
  // chromatic strips. Some videos deliberately draw almost no borders at all,
  // so edge detection can have too little evidence even though the keyboard is
  // perfectly usable. In that case keep working by evenly dividing the selected
  // guide span into 88 regions and mark the geometry as estimated.
  const minimumObservedBoundaries = Math.max(8, Math.round(expectedKeyCount * 0.20));
  const boundaryCountMismatch = detected.boundaries.length !== expectedKeyCount + 1;
  const insufficientBoundaryEvidence = boundaryCountMismatch
    || detected.peaks.length < minimumObservedBoundaries
    || detected.confidence < 0.30;
  const equalBoundaries = Array.from(
    { length: expectedKeyCount + 1 },
    (_, index) => width * index / expectedKeyCount,
  );
  const keyBoundaries = insufficientBoundaryEvidence ? equalBoundaries : detected.boundaries;

  return {
    mode: 'single',
    width,
    height,
    keyBoundaries,
    keyCount: expectedKeyCount,
    whiteCount: Array.from({ length: expectedKeyCount }, (_, index) => isWhiteMidi(21 + index)).filter(Boolean).length,
    detectedBlackCount: Array.from({ length: expectedKeyCount }, (_, index) => !isWhiteMidi(21 + index)).filter(Boolean).length,
    nominalKeyWidth: nominalWidth,
    confidence: insufficientBoundaryEvidence ? 0 : detected.confidence,
    boundariesEstimated: insufficientBoundaryEvidence,
    diagnostics: {
      boundaryConfidence: detected.confidence,
      candidateBoundaryCount: detected.peaks.length,
      boundariesEstimated: insufficientBoundaryEvidence,
    },
  };
}

/** Creates the 88-key A0..C8 map used by one-line flat-keyboard detection. */
export function createSingleLineKeyMap(geometry, startMidi = 21) {
  const boundaries = geometry?.keyBoundaries;
  const keyCount = Math.max(0, Math.min(boundaries?.length ? boundaries.length - 1 : 0, 128));
  if (!boundaries || keyCount < 1) throw new Error(t('error.key_count_mismatch'));
  const safeStart = clamp(Math.round(Number(startMidi) || 21), 0, Math.max(0, 127 - keyCount + 1));
  const keys = [];
  for (let index = 0; index < keyCount; index += 1) {
    const midi = safeStart + index;
    keys.push({
      id: `s-${index}`,
      type: isWhiteMidi(midi) ? 'white' : 'black',
      visualIndex: index,
      midi,
      name: midiNoteName(midi),
      x0: boundaries[index],
      x1: boundaries[index + 1],
      y0: 0,
      y1: geometry.height,
      detected: true,
    });
  }
  return {
    startMidi: safeStart,
    whiteKeys: keys.filter(key => key.type === 'white'),
    blackKeys: keys.filter(key => key.type === 'black'),
    keys,
    pitchMismatch: false,
    inferredLeftmostName: midiNoteName(safeStart),
  };
}

export function suggestLeftmostMidi(geometry) {
  if (geometry.whiteCount === 52) return 21; // Full 88-key piano: A0 to C8.
  const pitchClass = WHITE_PCS[geometry.inferredLeftmostWhiteIndex] ?? 0;
  return nearestWhiteMidiWithPitchClass(pitchClass, 48);
}

/** Converts the visual key geometry into MIDI-numbered white and black keys. */
export function createKeyMap(geometry, requestedStartMidi) {
  let startMidi = clamp(Math.round(Number(requestedStartMidi) || 60), 0, 127);
  while (startMidi > 0 && !isWhiteMidi(startMidi)) startMidi -= 1;
  const whiteKeys = [];
  let midi = startMidi;

  for (let index = 0; index < geometry.whiteCount; index += 1) {
    if (midi > 127) break;
    whiteKeys.push({
      id: `w-${index}`,
      type: 'white',
      visualIndex: index,
      midi,
      name: midiNoteName(midi),
      x0: geometry.whiteBoundaries[index],
      x1: geometry.whiteBoundaries[index + 1],
      y0: 0,
      y1: geometry.height,
    });
    midi = nextWhiteMidi(midi);
  }

  const blackKeys = [];
  for (let gap = 0; gap < whiteKeys.length - 1; gap += 1) {
    const left = whiteKeys[gap];
    const right = whiteKeys[gap + 1];
    if (right.midi - left.midi !== 2) continue;
    const boundary = geometry.whiteBoundaries[gap + 1];
    const localWhiteWidth = Math.min(left.x1 - left.x0, right.x1 - right.x0);
    const detected = geometry.blackGaps[gap];
    const fallbackWidth = Math.max(3, localWhiteWidth * 0.56);
    const x0 = detected ? detected.x0 : boundary - fallbackWidth / 2;
    const x1 = detected ? detected.x1 : boundary + fallbackWidth / 2;
    blackKeys.push({
      id: `b-${gap}`,
      type: 'black',
      visualIndex: gap,
      midi: left.midi + 1,
      name: midiNoteName(left.midi + 1),
      x0: clamp(x0, 0, geometry.width),
      x1: clamp(x1, 0, geometry.width),
      y0: detected?.y0 ?? Math.round(geometry.height * 0.04),
      y1: detected?.y1 ?? geometry.blackHeight,
      detected: Boolean(detected),
    });
  }

  const keys = [...whiteKeys, ...blackKeys].sort((a, b) => a.midi - b.midi);
  const visualPitchClass = WHITE_PCS[geometry.inferredLeftmostWhiteIndex];
  const pitchMismatch = startMidi % 12 !== visualPitchClass && geometry.inferredPitchConfidence >= 0.58;
  return {
    startMidi,
    whiteKeys,
    blackKeys,
    keys,
    pitchMismatch,
    inferredLeftmostName: geometry.inferredLeftmostWhiteName,
  };
}

function safeProbeRect(x0, y0, x1, y1, width, height) {
  const left = clamp(Math.floor(Math.min(x0, x1)), 0, Math.max(0, width - 1));
  const top = clamp(Math.floor(Math.min(y0, y1)), 0, Math.max(0, height - 1));
  const right = clamp(Math.ceil(Math.max(x0, x1)), left + 1, width);
  const bottom = clamp(Math.ceil(Math.max(y0, y1)), top + 1, height);
  return { x0: left, y0: top, x1: right, y1: bottom };
}

/**
 * Builds the exact color-sampling boxes shown on the two guide lines.
 * Each key uses a very small central area. Black-key boxes are valid whenever
 * the visible guide line crosses the detected black-key body. Their tiny sample
 * rectangles are clipped to that body so the neighboring white key cannot leak
 * into the black-key color sample.
 */
export function createLineAnalysisProbes(
  keyMap,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  whiteLineY,
  blackLineY,
) {
  const scaleX = targetWidth / Math.max(1, sourceWidth);
  const scaleY = targetHeight / Math.max(1, sourceHeight);
  const whiteCenterY = clamp(whiteLineY * scaleY, 0, Math.max(0, targetHeight - 1));
  const blackCenterY = clamp(blackLineY * scaleY, 0, Math.max(0, targetHeight - 1));
  const halfHeight = Math.max(0.55, targetHeight * 0.0028);

  return keyMap.keys.map(key => {
    const x0 = key.x0 * scaleX;
    const x1 = key.x1 * scaleX;
    const keyWidth = Math.max(1, x1 - x0);
    const centerY = key.type === 'white' ? whiteCenterY : blackCenterY;

    // v13: sample only the central 30% of each key. This is still conservative,
    // but wide enough to split the visible box into three independent samples.
    const sampleFraction = key.type === 'white' ? 0.30 : 0.30;
    const innerMargin = (1 - sampleFraction) * 0.5;
    const innerX0 = x0 + keyWidth * innerMargin;
    const innerX1 = x1 - keyWidth * innerMargin;
    let sampleTop = centerY - halfHeight;
    let sampleBottom = centerY + halfHeight;

    let valid = true;
    if (key.type === 'black') {
      const bodyTop = clamp(key.y0 * scaleY, 0, Math.max(0, targetHeight - 1));
      const bodyBottom = clamp(key.y1 * scaleY, bodyTop + 1, targetHeight);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      // The guide line itself is the user's confirmation point. Previously we
      // rejected a black key unless the whole thin sample box stayed inside a
      // generous 12% inset, which could silently disable clearly visible black
      // keys near their tip. Accept the key whenever the guide center actually
      // crosses the detected black-key body, then clip the tiny sample box to
      // that body so it cannot bleed into the neighboring white key.
      const bodyInset = Math.min(Math.max(0.35, bodyHeight * 0.02), Math.max(0, (bodyHeight - 1) / 2));
      const safeTop = bodyTop + bodyInset;
      const safeBottom = bodyBottom - bodyInset;
      valid = centerY >= safeTop && centerY <= safeBottom;
      if (valid) {
        sampleTop = Math.max(sampleTop, safeTop);
        sampleBottom = Math.min(sampleBottom, safeBottom);
        if (sampleBottom <= sampleTop) {
          sampleTop = Math.max(bodyTop, centerY - 0.5);
          sampleBottom = Math.min(bodyBottom, centerY + 0.5);
        }
      }
    }

    const span = Math.max(1, innerX1 - innerX0);
    const cut1 = innerX0 + span / 3;
    const cut2 = innerX0 + span * 2 / 3;
    const leftPatch = safeProbeRect(innerX0, sampleTop, cut1, sampleBottom, targetWidth, targetHeight);
    const centerPatch = safeProbeRect(cut1, sampleTop, cut2, sampleBottom, targetWidth, targetHeight);
    const rightPatch = safeProbeRect(cut2, sampleTop, innerX1, sampleBottom, targetWidth, targetHeight);
    return { key, patches: [leftPatch, centerPatch, rightPatch], valid };
  });
}

/**
 * Builds the same three independent color samples for every key on one shared
 * guide line. Unlike the two-line mode, black keys are not clipped to a raised
 * black-key body because flat-keyboard videos deliberately draw every key on
 * the same plane.
 */
export function createSingleLineAnalysisProbes(
  keyMap,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  lineY,
) {
  const scaleX = targetWidth / Math.max(1, sourceWidth);
  const scaleY = targetHeight / Math.max(1, sourceHeight);
  const centerY = clamp(lineY * scaleY, 0, Math.max(0, targetHeight - 1));
  const halfHeight = Math.max(0.55, targetHeight * 0.0028);

  return keyMap.keys.map(key => {
    const x0 = key.x0 * scaleX;
    const x1 = key.x1 * scaleX;
    const keyWidth = Math.max(1, x1 - x0);
    const innerMargin = 0.35;
    const innerX0 = x0 + keyWidth * innerMargin;
    const innerX1 = x1 - keyWidth * innerMargin;
    const sampleTop = centerY - halfHeight;
    const sampleBottom = centerY + halfHeight;
    const span = Math.max(1, innerX1 - innerX0);
    const cut1 = innerX0 + span / 3;
    const cut2 = innerX0 + span * 2 / 3;
    return {
      key,
      patches: [
        safeProbeRect(innerX0, sampleTop, cut1, sampleBottom, targetWidth, targetHeight),
        safeProbeRect(cut1, sampleTop, cut2, sampleBottom, targetWidth, targetHeight),
        safeProbeRect(cut2, sampleTop, innerX1, sampleBottom, targetWidth, targetHeight),
      ],
      valid: true,
    };
  });
}

/** Builds two small color probes per key in a resized analysis canvas. */
export function createAnalysisProbes(keyMap, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;
  return keyMap.keys.map(key => {
    const x0 = key.x0 * scaleX;
    const x1 = key.x1 * scaleX;
    const keyWidth = Math.max(1, x1 - x0);
    let primary;
    let secondary;
    if (key.type === 'white') {
      primary = safeProbeRect(
        x0 + keyWidth * 0.20,
        targetHeight * 0.62,
        x1 - keyWidth * 0.20,
        targetHeight * 0.90,
        targetWidth,
        targetHeight,
      );
      secondary = safeProbeRect(
        x0 + keyWidth * 0.31,
        targetHeight * 0.32,
        x1 - keyWidth * 0.31,
        targetHeight * 0.53,
        targetWidth,
        targetHeight,
      );
    } else {
      const y0 = key.y0 * scaleY;
      const y1 = key.y1 * scaleY;
      const keyHeight = Math.max(1, y1 - y0);
      primary = safeProbeRect(
        x0 + keyWidth * 0.18,
        y0 + keyHeight * 0.18,
        x1 - keyWidth * 0.18,
        y0 + keyHeight * 0.68,
        targetWidth,
        targetHeight,
      );
      secondary = safeProbeRect(
        x0 + keyWidth * 0.24,
        y0 + keyHeight * 0.55,
        x1 - keyWidth * 0.24,
        y0 + keyHeight * 0.88,
        targetWidth,
        targetHeight,
      );
    }
    return { key, patches: [primary, secondary] };
  });
}

function averagePatch(data, width, height, rect) {
  const patchWidth = Math.max(1, rect.x1 - rect.x0);
  const patchHeight = Math.max(1, rect.y1 - rect.y0);
  const gridX = clamp(Math.round(Math.sqrt(48 * patchWidth / patchHeight)), 3, 10);
  const gridY = clamp(Math.round(48 / gridX), 3, 10);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let gy = 0; gy < gridY; gy += 1) {
    const y = clamp(Math.floor(rect.y0 + (gy + 0.5) * patchHeight / gridY), 0, height - 1);
    for (let gx = 0; gx < gridX; gx += 1) {
      const x = clamp(Math.floor(rect.x0 + (gx + 0.5) * patchWidth / gridX), 0, width - 1);
      const index = (y * width + x) * 4;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count += 1;
    }
  }

  return [
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count),
  ];
}

/** Returns [R,G,B] for each of the three visible sub-patches per key. */
export function sampleKeyColors(imageData, probes) {
  const PATCH_STRIDE = 3;
  const KEY_STRIDE = PATCH_STRIDE * PROBE_PATCH_COUNT;
  const output = new Uint8Array(probes.length * KEY_STRIDE);
  for (let keyIndex = 0; keyIndex < probes.length; keyIndex += 1) {
    const probe = probes[keyIndex];
    for (let patchIndex = 0; patchIndex < PROBE_PATCH_COUNT; patchIndex += 1) {
      const offset = keyIndex * KEY_STRIDE + patchIndex * PATCH_STRIDE;
      // Invalid black-key boxes stay constant across every frame, so they can
      // never create a false Note On from a neighboring white key.
      if (probe.valid === false) {
        output[offset] = 0;
        output[offset + 1] = 0;
        output[offset + 2] = 0;
        continue;
      }
      const sample = averagePatch(imageData.data, imageData.width, imageData.height, probe.patches[patchIndex]);
      output[offset] = sample[0];
      output[offset + 1] = sample[1];
      output[offset + 2] = sample[2];
    }
  }
  return output;
}


/**
 * Precomputes the exact pixel addresses used by the visible line probes.
 *
 * The analysis only needs two very thin horizontal bands (white-key line and
 * black-key line). Reading those bands instead of the entire resized frame
 * avoids the biggest Canvas -> CPU readback cost without changing a single
 * sampled pixel or any detection threshold.
 */
export function createLineProbeSampler(probes, canvasWidth, canvasHeight) {
  const width = Math.max(1, Math.round(canvasWidth));
  const height = Math.max(1, Math.round(canvasHeight));
  const bands = { white: null, black: null };

  for (const type of ['white', 'black']) {
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    let found = false;
    for (const probe of probes) {
      if (probe.valid === false || (probe.key?.type === 'black' ? 'black' : 'white') !== type) continue;
      for (const rect of probe.patches) {
        left = Math.min(left, rect.x0);
        top = Math.min(top, rect.y0);
        right = Math.max(right, rect.x1);
        bottom = Math.max(bottom, rect.y1);
        found = true;
      }
    }
    if (found) {
      const x = clamp(Math.floor(left), 0, width - 1);
      const y = clamp(Math.floor(top), 0, height - 1);
      const x1 = clamp(Math.ceil(right), x + 1, width);
      const y1 = clamp(Math.ceil(bottom), y + 1, height);
      bands[type] = { x, y, width: x1 - x, height: y1 - y };
    }
  }

  function buildPatchSamples(rect, band) {
    const patchWidth = Math.max(1, rect.x1 - rect.x0);
    const patchHeight = Math.max(1, rect.y1 - rect.y0);
    const gridX = clamp(Math.round(Math.sqrt(48 * patchWidth / patchHeight)), 3, 10);
    const gridY = clamp(Math.round(48 / gridX), 3, 10);
    const offsets = new Uint32Array(gridX * gridY);
    let cursor = 0;
    for (let gy = 0; gy < gridY; gy += 1) {
      const globalY = clamp(Math.floor(rect.y0 + (gy + 0.5) * patchHeight / gridY), 0, height - 1);
      const localY = globalY - band.y;
      for (let gx = 0; gx < gridX; gx += 1) {
        const globalX = clamp(Math.floor(rect.x0 + (gx + 0.5) * patchWidth / gridX), 0, width - 1);
        const localX = globalX - band.x;
        offsets[cursor++] = (localY * band.width + localX) * 4;
      }
    }
    return offsets;
  }

  const entries = probes.map(probe => {
    if (probe.valid === false) return { valid: false, type: probe.key?.type === 'black' ? 'black' : 'white', patches: [] };
    const type = probe.key?.type === 'black' ? 'black' : 'white';
    const band = bands[type];
    if (!band) return { valid: false, type, patches: [] };
    return {
      valid: true,
      type,
      patches: probe.patches.map(rect => buildPatchSamples(rect, band)),
    };
  });

  return { width, height, bands, entries, keyCount: probes.length };
}

/**
 * Samples exactly the same RGB points as sampleKeyColors(), but performs only
 * two narrow getImageData() calls per frame instead of reading the full frame.
 */
export function sampleKeyColorsFromContext(context, sampler) {
  if (!sampler || !context) throw new Error('Invalid probe sampler.');
  const PATCH_STRIDE = 3;
  const KEY_STRIDE = PATCH_STRIDE * PROBE_PATCH_COUNT;
  const output = new Uint8Array(sampler.keyCount * KEY_STRIDE);
  const bandImages = { white: null, black: null };

  for (const type of ['white', 'black']) {
    const band = sampler.bands[type];
    if (!band) continue;
    bandImages[type] = context.getImageData(band.x, band.y, band.width, band.height);
  }

  for (let keyIndex = 0; keyIndex < sampler.entries.length; keyIndex += 1) {
    const entry = sampler.entries[keyIndex];
    if (!entry.valid) continue;
    const data = bandImages[entry.type]?.data;
    if (!data) continue;
    for (let patchIndex = 0; patchIndex < PROBE_PATCH_COUNT; patchIndex += 1) {
      const offsets = entry.patches[patchIndex];
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let i = 0; i < offsets.length; i += 1) {
        const index = offsets[i];
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }
      const count = Math.max(1, offsets.length);
      const outputOffset = keyIndex * KEY_STRIDE + patchIndex * PATCH_STRIDE;
      output[outputOffset] = Math.round(red / count);
      output[outputOffset + 1] = Math.round(green / count);
      output[outputOffset + 2] = Math.round(blue / count);
    }
  }
  return output;
}

export function cropImageData(context, rect) {
  const x = clamp(Math.round(rect.x), 0, context.canvas.width - 1);
  const y = clamp(Math.round(rect.y), 0, context.canvas.height - 1);
  const width = clamp(Math.round(rect.width), 1, context.canvas.width - x);
  const height = clamp(Math.round(rect.height), 1, context.canvas.height - y);
  return context.getImageData(x, y, width, height);
}
