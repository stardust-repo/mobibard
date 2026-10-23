// Fixed signal processing, ported 1:1 from w2m/dsp.py (tested against it with node).
export const SR = 24000, HOP = 240, FPS = 100, N_LOGF = 357, BASE_MIDI = 9 - 1 / 3;
export const PITCH_MIN = 21, N_PITCH = 88, DRUM = 128;

// numpy-compatible rounding (round half to even)
export function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
}

const fbCache = new Map();
function filterbank(n) {
  if (fbCache.has(n)) return fbCache.get(n);
  const nb = n / 2 + 1, df = SR / n, cols = [];
  for (let k = 0; k < N_LOGF; k++) {
    const m = BASE_MIDI + k / 3, fc = 440 * 2 ** ((m - 69) / 12);
    if (fc >= SR / 2) { cols.push(null); continue; }
    const w = Math.max(fc * (2 ** (1 / 36) - 1), df);
    const lo = Math.max(0, Math.ceil((fc - w) / df) - 1), hi = Math.min(nb - 1, Math.floor((fc + w) / df) + 1);
    const wt = new Float64Array(hi - lo + 1);
    let s = 0;
    for (let j = lo; j <= hi; j++) { const v = Math.max(0, 1 - Math.abs(j * df - fc) / w); wt[j - lo] = v; s += v; }
    if (s > 0) { const f = new Float32Array(wt.length); for (let i = 0; i < wt.length; i++) f[i] = wt[i] / s; cols.push({ lo, w: f }); }
    else cols.push(null);
  }
  fbCache.set(n, cols);
  return cols;
}

const fftCache = new Map();
function fftPlan(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const bits = Math.log2(n), rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)) * (4 / n);   // periodic Hann, sine amp -> 1
  const plan = { n, rev, cos, sin, win, re: new Float64Array(n), im: new Float64Array(n), mag: new Float32Array(n / 2 + 1) };
  fftCache.set(n, plan);
  return plan;
}

function fftMag(plan) {
  const { n, cos, sin, re, im, mag } = plan;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half, wr = cos[k], wi = sin[k];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  for (let j = 0; j <= n / 2; j++) mag[j] = Math.hypot(re[j], im[j]);
  return mag;
}

/** Amplitude log-frequency spectrogram, T frames x N_LOGF (frame t centred at sample t*HOP, zero outside). */
export function logfreqAmp(wave, n, T) {
  const plan = fftPlan(n), cols = filterbank(n), out = new Float32Array(T * N_LOGF), half = n / 2;
  const { rev, win, re, im } = plan;
  for (let t = 0; t < T; t++) {
    const start = t * HOP - half;
    for (let i = 0; i < n; i++) {
      const s = start + i, v = s >= 0 && s < wave.length ? wave[s] * win[i] : 0, r = rev[i];
      re[r] = v; im[r] = 0;
    }
    const mag = fftMag(plan), o = t * N_LOGF;
    for (let k = 0; k < N_LOGF; k++) {
      const c = cols[k];
      if (!c) { out[o + k] = 0; continue; }
      let s = 0;
      for (let i = 0; i < c.w.length; i++) s += c.w[i] * mag[c.lo + i];
      out[o + k] = s;
    }
  }
  return out;
}

/** Model input for one window: Float32Array [C=len(n_ffts)*len(shifts), T, 264] (eval mode, no pitch shift). */
export function frontendFeatures(wave, meta) {
  const L = meta.frontend, T = Math.floor(wave.length / HOP), OB = L.out_bins;
  const floor = (Math.log(1e-4) + 5) / 2.5, chans = L.n_ffts.length * L.shifts.length;
  const out = new Float32Array(chans * T * OB);
  let c = 0;
  for (const n of L.n_ffts) {
    const S = logfreqAmp(wave, n, T);
    for (const sh of L.shifts) {
      const base = L.out_start + sh;       // index in the unpadded log-frequency axis
      for (let t = 0; t < T; t++) {
        const o = (c * T + t) * OB, so = t * N_LOGF;
        for (let b = 0; b < OB; b++) {
          const k = base + b;
          out[o + b] = k >= 0 && k < N_LOGF ? (Math.log(S[so + k] + 1e-4) + 5) / 2.5 : floor;
        }
      }
      c++;
    }
  }
  return out;
}
