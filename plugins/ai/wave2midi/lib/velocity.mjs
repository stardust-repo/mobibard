// Note velocity by onset spectral flux, ported 1:1 from w2m/velocity.py.
import { FPS, N_LOGF, BASE_MIDI, DRUM, HOP, logfreqAmp, roundHalfEven } from './dsp.mjs';

const binOfMidi = m => (m - BASE_MIDI) * 3;
const binOfHz = f => binOfMidi(69 + 12 * Math.log2(Math.max(f, 1e-6) / 440));

function drumBand(p) {
  if (p === 35 || p === 36) return [30, 150];
  if ([37, 38, 39, 40].includes(p)) return [150, 5000];
  if ([41, 43, 45, 47, 48, 50].includes(p)) return [60, 700];
  if ([42, 44, 46, 49, 51, 52, 53, 55, 57, 59].includes(p)) return [3000, 11500];
  return [100, 8000];
}
function drumGroup(p) {
  if (p === 35 || p === 36) return 'kick';
  if ([37, 38, 39, 40].includes(p)) return 'snare';
  if ([41, 43, 45, 47, 48, 50].includes(p)) return 'tom';
  if ([42, 44, 46].includes(p)) return 'hat';
  if ([49, 51, 52, 53, 55, 57, 59].includes(p)) return 'cymbal';
  return 'perc';
}
function melodicBins(pitch, harmonics) {
  const c = roundHalfEven(binOfMidi(pitch)), out = [];
  for (let h = 1; h <= harmonics; h++) {
    const k = c + Math.round(36 * Math.log2(h));
    for (const b of [k - 1, k, k + 1]) if (b >= 0 && b < N_LOGF) out.push(b);
  }
  return out;
}
function bandBins(lo, hi) {
  const a = Math.max(0, Math.ceil(binOfHz(lo))), b = Math.min(N_LOGF - 1, Math.floor(binOfHz(hi)));
  if (b < a) return [Math.min(Math.max(a, 0), N_LOGF - 1)];
  const out = []; for (let i = a; i <= b; i++) out.push(i); return out;
}

function onsetFluxDb(S, T, notes, cfg) {
  const n = notes.length, t0 = new Int32Array(n), drum = notes.map(x => x[1] === DRUM);
  for (let i = 0; i < n; i++) t0[i] = Math.min(Math.max(roundHalfEven(Math.fround(notes[i][2]) * FPS), 0), T - 1);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => t0[a] - t0[b] || a - b);
  const bins = new Array(n), weights = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && t0[order[j + 1]] - t0[order[i]] <= cfg.cluster_frames) j++;
    const members = order.slice(i, j + 1), count = new Map();
    for (const m of members) {
      bins[m] = drum[m] ? bandBins(...drumBand(notes[m][0])) : melodicBins(notes[m][0], cfg.harmonics);
      if (!drum[m]) for (const x of bins[m]) count.set(x, (count.get(x) || 0) + 1);
    }
    for (const m of members) weights[m] = drum[m] ? bins[m].map(() => 1 / Math.max(bins[m].length, 1)) : bins[m].map(x => 1 / count.get(x));
    i = j + 1;
  }
  const energy = (t, m) => { let s = 0; const b = bins[m], w = weights[m]; for (let q = 0; q < b.length; q++) { const a = S[t * N_LOGF + b[q]]; s += w[q] * a * a; } return s; };
  const db = new Float64Array(n), win = cfg.window_frames, [preA, preB] = cfg.pre_frames;
  for (let m = 0; m < n; m++) {
    const t = t0[m];
    let post = -Infinity;
    for (let u = t; u < Math.min(t + win, T); u++) post = Math.max(post, energy(u, m));
    if (!isFinite(post)) post = 0;
    const lo = Math.max(t - preB, 0), hi = Math.max(t - preA + 1, 0);
    let pre = 0;
    if (hi > lo) { for (let u = lo; u < hi; u++) pre += energy(u, m); pre /= hi - lo; }
    db[m] = 10 * Math.log10(Math.max(post - pre, 0.05 * post) + 1e-12);
  }
  return db;
}

const median = v => percentile(v, 50);
function percentile(v, q) {
  const a = Float64Array.from(v).sort(), pos = (a.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** notes: [[pitch, program, onset, offset, conf], ...] -> Int32Array velocities (1..127). */
export function estimateVelocity(wave, notes, cfg, spectra = null) {
  const n = notes.length, out = new Int32Array(n);
  if (!n) return out;
  const T = Math.ceil(wave.length / HOP);
  const isDrum = notes.map(x => x[1] === DRUM), db = new Float64Array(n);
  const melIdx = [], drumIdx = [];
  isDrum.forEach((d, i) => (d ? drumIdx : melIdx).push(i));
  if (melIdx.length) {
    const Sm = spectra?.[cfg.n_fft] || logfreqAmp(wave, cfg.n_fft, T);
    const r = onsetFluxDb(Sm, T, melIdx.map(i => notes[i]), cfg); melIdx.forEach((i, j) => { db[i] = r[j]; });
  }
  if (drumIdx.length) {
    const Sd = spectra?.[cfg.drum_n_fft] || logfreqAmp(wave, cfg.drum_n_fft, T);
    const r = onsetFluxDb(Sd, T, drumIdx.map(i => notes[i]), cfg); drumIdx.forEach((i, j) => { db[i] = r[j]; });
  }
  const keys = notes.map((x, i) => isDrum[i] ? `d:${drumGroup(x[0])}` : `m:${x[1]}`);
  const groups = new Map();
  keys.forEach((k, i) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const adj = Float64Array.from(db);
  for (const [k, idx] of groups) {
    if (!k.startsWith('m:') || idx.length < Math.max(cfg.min_group, 8)) continue;
    const p = idx.map(i => notes[i][0]), y = idx.map(i => db[i]);
    const mp = p.reduce((a, b) => a + b, 0) / p.length, my = y.reduce((a, b) => a + b, 0) / y.length;
    const sd = Math.sqrt(p.reduce((a, b) => a + (b - mp) ** 2, 0) / p.length);
    if (sd <= 1) continue;
    let sxy = 0, sxx = 0; for (let q = 0; q < p.length; q++) { sxy += (p[q] - mp) * (y[q] - my); sxx += (p[q] - mp) ** 2; }
    const slope = sxy / sxx, pm = median(p);
    idx.forEach((i, q) => { adj[i] = db[i] - cfg.pitch_comp * slope * (p[q] - pm); });
  }
  const stats = {};
  for (const [name, flag] of [['m', false], ['d', true]]) {
    const v = []; for (let i = 0; i < n; i++) if (isDrum[i] === flag) v.push(adj[i]);
    if (v.length) stats[name] = [median(v), Math.max(percentile(v, 95) - percentile(v, 5), cfg.min_range_db)];
  }
  for (const [k, idx] of groups) {
    const v = idx.map(i => adj[i]), [poolMed, poolSpan] = stats[k[0]];
    let med = poolMed, span = poolSpan, offset = 0;
    if (idx.length >= cfg.min_group) {
      med = median(v);
      span = Math.max(percentile(v, 95) - percentile(v, 5), cfg.min_range_db);
      offset = cfg.track_balance * (med - poolMed) / poolSpan;
    }
    idx.forEach((i, q) => {
      const x = Math.min(1, Math.max(0, 0.5 + (v[q] - med) / span + offset));
      out[i] = Math.min(127, Math.max(1, roundHalfEven(cfg.min + (cfg.max - cfg.min) * x)));
    });
  }
  return out;
}
