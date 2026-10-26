// Tempo map from the transcribed notes, ported 1:1 from w2m/tempo.py (checked against it with node on
// synthetic and real songs). See the Python file for the method; comments here only mark JS specifics.
import { DRUM, roundHalfEven } from './dsp.mjs';

const TFPS = 100;
export const DEFAULT_TEMPO = {
  mode: 'auto', min: 32, max: 255, prefer: 120.0, changes: true, change_penalty: 8.0,
  min_segment_beats: 16, align_bars: true, integer_bpm: true, follow_beats: true,
};
const KICK = [35, 36], SNARE = [37, 38, 39, 40], HATS = [42, 44, 46];

// ---------- numpy-like helpers ----------
const pyRound = (x, d) => Number(x.toFixed(d));                 // Python round(x, d) on the exact binary value
const pmod = (a, b) => ((a % b) + b) % b;                         // Python % (non-negative for b > 0)
const argmax = a => { let j = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[j]) j = i; return j; };
const amax = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
const amin = a => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
const std = a => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
function median(a) {
  const s = Float64Array.from(a).sort(), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}
function searchsorted(arr, v, right = false) {                    // first index i with arr[i] >= v (> v if right)
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (right ? arr[m] <= v : arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
}
function interp(x, xp, fp) {                                      // np.interp for one x (xp increasing)
  const n = xp.length;
  if (x <= xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  const j = searchsorted(xp, x, true) - 1;
  const t = (x - xp[j]) / (xp[j + 1] - xp[j]);
  return fp[j] + t * (fp[j + 1] - fp[j]);
}
function gaussSmooth(x, sigma = 1.5) {
  const r = Math.ceil(3 * sigma), k = [];
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-0.5 * (i / sigma) ** 2); k.push(v); s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const n = x.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let d = -r; d <= r; d++) { const j = i + d; if (j >= 0 && j < n) acc += x[j] * k[d + r]; }
    out[i] = acc;
  }
  return out;
}
function polyfit1(x, y, w) {                                      // weighted least squares y = a + P x, weights w
  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { sw += w[i]; sx += w[i] * x[i]; sy += w[i] * y[i]; }
  const mx = sx / sw, my = sy / sw;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx; sxx += w[i] * dx * dx; sxy += w[i] * dx * (y[i] - my); }
  const P = sxy / sxx;
  return [P, my - P * mx];
}
const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };

// ---------- pieces (same names as Python) ----------
export function onsetEnvelopes(notes, n) {
  const env = new Float64Array(n), low = new Float64Array(n), back = new Float64Array(n);
  for (const nt of notes) {
    let p = nt[0]; const prog = nt[1], on = nt[2], conf = nt[4] ?? 1;
    const f = roundHalfEven(on * TFPS);
    if (f < 0 || f >= n) continue;
    const c = Math.min(Math.max(conf, 0.3), 1.0);
    let w, lw;
    if (Math.trunc(prog) === DRUM) {
      p = Math.trunc(p);
      w = KICK.includes(p) || SNARE.includes(p) ? 2.0 : (HATS.includes(p) ? 0.7 : 1.0);
      lw = KICK.includes(p) ? 2.0 : 0.0;
      if (SNARE.includes(p)) back[f] += c;
    } else {
      w = 1.0;
      const pr = Math.trunc(prog);
      lw = pr >= 32 && pr < 40 ? 1.0 : (p < 48 ? 0.5 : 0.0);
    }
    env[f] += w * c; low[f] += lw * c;
  }
  const l1 = a => a.map(v => Math.log1p(v));
  return [gaussSmooth(l1(env)), gaussSmooth(l1(low)), gaussSmooth(l1(back))];
}

export function tempoGrid(lo, hi, step = 0.01) {
  const n = Math.floor(Math.log(hi / lo) / Math.log1p(step)) + 1;
  return Float64Array.from({ length: n }, (_, k) => lo * (1.0 + step) ** k);
}

function acf(x, maxLag) {                                         // direct form == Python's zero-padded FFT
  const L = x.length, r = new Float64Array(L);
  const top = Math.min(L - 1, maxLag);
  for (let k = 0; k <= top; k++) { let s = 0; for (let i = 0; i + k < L; i++) s += x[i] * x[i + k]; r[k] = s; }
  if (!(r[0] > 1e-12)) return new Float64Array(L);
  const r0 = r[0];
  for (let k = 0; k <= top; k++) r[k] /= r0;
  return r;
}

function localScores(env, bpms, prefer, win = 1200, hop = 300) {
  const n = env.length, starts = [];
  for (let s = 0; s <= Math.max(1, n - win); s += hop) starts.push(s);
  if (starts[starts.length - 1] + win < n) starts.push(n - win);
  const K = bpms.length, lags = bpms.map(b => 60.0 * TFPS / b);
  const prior = bpms.map(b => Math.exp(-0.5 * (Math.log2(b / prefer) / 0.9) ** 2));
  const maxLag = Math.ceil(4 * amax(lags)) + 2;
  const out = starts.map(() => new Float64Array(K));
  starts.forEach((s, i) => {
    const seg = env.subarray(s, s + win), m = mean(seg);
    const x = seg.map(v => v - m);
    if (x.length < 2 || std(x) < 1e-6) return;
    const r = acf(x, maxLag), L = r.length, idx = Float64Array.from({ length: L }, (_, k) => k);
    const sc = new Float64Array(K);
    for (const mm of [1, 2, 3, 4]) {
      for (let k = 0; k < K; k++) { const q = mm * lags[k]; if (q < L - 1) sc[k] += interp(q, idx, r) / mm; }
    }
    for (let k = 0; k < K; k++) sc[k] = Math.max(sc[k], 0.0) * prior[k] + 1e-3;
    const mx = amax(sc);
    for (let k = 0; k < K; k++) out[i][k] = Math.log(sc[k] / mx);
  });
  const centres = starts.map(s => Math.min(s + Math.floor(win / 2), n - 1));
  return [out, centres];
}

function viterbi(scores, bpms, changes = true, penalty = 8.0) {
  const W = scores.length, K = bpms.length;
  if (!changes || W === 1) {
    const tot = new Float64Array(K);
    for (const row of scores) for (let k = 0; k < K; k++) tot[k] += row[k];
    return new Array(W).fill(argmax(tot));
  }
  const lb = bpms.map(b => Math.log2(b)), cost = [];
  for (let a = 0; a < K; a++) {
    const row = new Float64Array(K);
    for (let b = 0; b < K; b++) row[b] = a === b ? 0 : (Math.abs(a - b) <= 1 ? 0.5 : penalty + 4.0 * Math.abs(lb[a] - lb[b]));
    cost.push(row);
  }
  let acc = Float64Array.from(scores[0]);
  const back = [new Int32Array(K)];
  for (let w = 1; w < W; w++) {
    const bk = new Int32Array(K), nacc = new Float64Array(K);
    for (let to = 0; to < K; to++) {
      let best = -Infinity, j = 0;
      for (let fr = 0; fr < K; fr++) { const v = acc[fr] - cost[fr][to]; if (v > best) { best = v; j = fr; } }
      bk[to] = j; nacc[to] = best + scores[w][to];
    }
    back.push(bk); acc = nacc;
  }
  const path = new Array(W);
  path[W - 1] = argmax(acc);
  for (let w = W - 1; w > 0; w--) path[w - 1] = back[w][path[w]];
  return path;
}

function trackBeats(env, period, tightness = 100.0) {
  const n = env.length, sd = std(env) + 1e-9;
  const e = env.map(v => v / sd), score = Float64Array.from(e), back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const P = period[t], lo = Math.max(1, roundHalfEven(0.5 * P)), hi = roundHalfEven(2.0 * P);
    if (t - lo < 0) continue;
    let best = -Infinity, bp = -1;
    for (let tau = lo; tau <= Math.min(hi, t); tau++) {
      const v = score[t - tau] - tightness * Math.log(tau / P) ** 2;
      if (v > best) { best = v; bp = t - tau; }
    }
    if (best > 0) { score[t] = e[t] + best; back[t] = bp; }
  }
  const tail = Math.max(1, roundHalfEven(period[n - 1]));
  let t = n - tail + argmax(score.subarray(n - tail));
  const beats = [];
  while (t >= 0) { beats.push(t); t = back[t]; }
  return beats.reverse();
}

function fit(times, ks, w) {                                      // -> [a, P]
  if (times.length < 2) return [times.length ? times[0] : 0.0, 0.5];
  const [P, a] = polyfit1(ks, times, w);
  return [a, P];
}
const sl = (arr, a, b) => arr.slice(a, b + 1);                    // inclusive slice

function segments(beatT, beatBpm, changes, minBeats) {
  const n = beatT.length;
  if (!changes || n < 2 * minBeats) return [[0, n - 1]];
  const groups = [[0, 0, beatBpm[0]]];
  for (let k = 1; k < n; k++) {
    const g = groups[groups.length - 1];
    if (Math.abs(Math.log(beatBpm[k] / g[2])) < 0.02) g[1] = k; else groups.push([k, k, beatBpm[k]]);
  }
  let changed = true;
  while (changed && groups.length > 1) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g[1] - g[0] + 1 < minBeats) {
        const j = i > 0 && (i === groups.length - 1 ||
          Math.abs(Math.log(groups[i - 1][2] / g[2])) <= Math.abs(Math.log(groups[i + 1][2] / g[2]))) ? i - 1 : i + 1;
        const lo = Math.min(i, j), hi = Math.max(i, j);
        groups[lo] = [groups[lo][0], groups[hi][1],
          (groups[lo][1] - groups[lo][0]) >= (groups[hi][1] - groups[hi][0]) ? groups[lo][2] : groups[hi][2]];
        groups.splice(hi, 1);
        changed = true;
        break;
      }
    }
  }
  return groups.map(g => [g[0], g[1]]);
}

const peakAt = (x, frames, r = 2) => frames.map(f => {
  let m = -Infinity;
  for (let i = Math.max(0, f - r); i < Math.min(x.length, f + r + 1); i++) if (x[i] > m) m = x[i];
  return m;
});

function metre(beatF, low, env, notes) {
  if (beatF.length < 12) return [4, 0];
  let acc = beatF.map(f => {
    const a = Math.max(0, f - 2), b = Math.min(low.length, f + 3);
    let ml = -Infinity, me = -Infinity;
    for (let i = a; i < b; i++) { if (low[i] > ml) ml = low[i]; if (env[i] > me) me = env[i]; }
    return ml + 0.5 * me;
  });
  const nd = notes.filter(nt => nt[1] !== DRUM);
  if (nd.length) {
    const df = []; for (let i = 1; i < beatF.length; i++) df.push(beatF[i] - beatF[i - 1]);
    const P = median(df) / TFPS, bt = beatF.map(f => f / TFPS), hold = new Float64Array(beatF.length);
    for (const nt of nd) {
      const j = Math.min(Math.max(searchsorted(bt, nt[2] - 0.5 * P), 0), beatF.length - 1);
      if (Math.abs(beatF[j] / TFPS - nt[2]) <= 0.06) hold[j] += Math.min(Math.max((nt[3] - nt[2]) / P, 0.0), 4.0);
    }
    if (amax(hold) > 0) {
      const lh = hold.map(v => Math.log1p(v)), lm = amax(lh), am = amax(acc);
      acc = acc.map((v, i) => v + 0.7 * lh[i] / lm * am);
    }
  }
  const best = {};
  for (const nb of [4, 3]) {
    const A = range(0, nb).map(ph => { const s = []; for (let i = ph; i < acc.length; i += nb) s.push(acc[i]); return mean(s); });
    best[nb] = [amax(A) / (mean(A) + 1e-9), argmax(A)];
  }
  const nb = best[3][0] > best[4][0] * 1.08 ? 3 : 4;
  return [nb, best[nb][1]];
}

const DENSITY_TARGET = 2.0, DENSITY_SIGMA = 0.6, PRIOR_SIGMA = 0.9;
const octaveScore = (bpm, perBeat, prefer) =>
  -0.5 * (Math.log2(bpm / prefer) / PRIOR_SIGMA) ** 2 - 0.5 * (Math.log2(Math.max(perBeat, 1e-3) / DENSITY_TARGET) / DENSITY_SIGMA) ** 2;
function startsPerBeat(starts, beatT) {
  if (beatT.length < 2) return 0.0;
  const a = beatT[0], b = beatT[beatT.length - 1];
  return (searchsorted(starts, b, true) - searchsorted(starts, a)) / (beatT.length - 1);
}
const preferDouble = (bpm, perBeat, prefer, margin = 0.3) =>
  octaveScore(2 * bpm, perBeat / 2, prefer) > octaveScore(bpm, perBeat, prefer) + margin;

function needsDouble(beatF, snare, nSnare) {
  if (nSnare < 24 || beatF.length < 16) return false;
  const on = peakAt(snare, beatF);
  const mids = []; for (let i = 0; i < beatF.length - 1; i++) mids.push(Math.floor((beatF[i] + beatF[i + 1]) / 2));
  const mid = peakAt(snare, mids), thr = 0.3 * amax(snare);
  const hitOn = on.filter(v => v > thr).length, hitMid = mid.filter(v => v > thr).length;
  return hitMid >= 2 * Math.max(hitOn, 1) && hitMid >= 0.25 * mid.length;
}

function sse(ks, bt, w, lo, hi) {
  const x = sl(ks, lo, hi), y = sl(bt, lo, hi), ww = sl(w, lo, hi);
  const [P, a0] = polyfit1(x, y, ww);
  let e = 0; for (let i = 0; i < x.length; i++) e += ww[i] * (y[i] - a0 - P * x[i]) ** 2;
  return e;
}
function refineBounds(segs, beatT, ks, w, reach = 12) {
  segs = segs.map(g => [...g]);
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i][0], b = segs[i + 1][1];
    let best = null, arg = segs[i + 1][0];
    for (let cut = Math.max(a + 4, segs[i + 1][0] - reach); cut <= Math.min(b - 3, segs[i + 1][0] + reach); cut++) {
      const err = sse(ks, beatT, w, a, cut - 1) + sse(ks, beatT, w, cut, b);
      if (best === null || err < best) { best = err; arg = cut; }
    }
    segs[i][1] = arg - 1; segs[i + 1][0] = arg;
  }
  return segs;
}

function locateSwitch(env, [a1, P1], [a2, P2], tLo, tHi) {
  const n = env.length;
  const pk = ts => peakAt(env, ts.map(t => Math.min(Math.max(roundHalfEven(t * TFPS), 0), n - 1)));
  const zone = range(Math.max(0, Math.trunc(tLo * TFPS)), Math.min(n, Math.trunc(tHi * TFPS) + 1));
  const base = zone.length ? mean(peakAt(env, zone)) : 0.0;
  const b1 = range(Math.ceil((tLo - a1) / P1), Math.floor((tHi - a1) / P1) + 1).map(k => a1 + k * P1);
  const b2 = range(Math.ceil((tLo - a2) / P2), Math.floor((tHi - a2) / P2) + 1).map(k => a2 + k * P2);
  if (!b1.length || !b2.length) return 0.5 * (tLo + tHi);
  const e1 = pk(b1).map(v => v - base), e2 = pk(b2).map(v => v - base);
  let best = -Infinity, arg = b1[0], c1 = 0;
  b1.forEach((tj, i) => {
    c1 += e1[i];
    let s2 = 0; b2.forEach((t, k) => { if (t > tj + 0.5 * P2) s2 += e2[k]; });
    const sc = c1 + s2;
    if (sc >= best - 1e-9) { best = Math.max(sc, best); arg = tj; }
  });
  return arg;
}

// ---------- positions ----------
function absPos(t, tm) {
  const segs = tm.segments;
  if (tm.beat_times && tm.beat_times.length) {
    const bt = tm.beat_times, n = bt.length, f = tm.beat_first;
    const Pf = 60.0 / segs[0].bpm, Pl = 60.0 / segs[segs.length - 1].bpm;
    if (t < bt[0]) return f + (t - bt[0]) / Pf;
    if (t > bt[n - 1]) return f + n - 1 + (t - bt[n - 1]) / Pl;
    if (t === bt[n - 1]) return f + n - 1;
    const j = searchsorted(bt, t, true) - 1;
    return f + j + (t - bt[j]) / (bt[j + 1] - bt[j]);
  }
  const starts = segs.map(s => s.time);
  const j = Math.min(Math.max(searchsorted(starts, t, true) - 1, 0), segs.length - 1);
  return segs[j].beat + (t - starts[j]) / (60.0 / segs[j].bpm);
}

export function beatTime(b, tm) {
  const segs = tm.segments, bt = tm.beat_times, n = bt.length, f = tm.beat_first;
  const Pf = 60.0 / segs[0].bpm, Pl = 60.0 / segs[segs.length - 1].bpm;
  if (b < f) return bt[0] + (b - f) * Pf;
  if (b > f + n - 1) return bt[n - 1] + (b - (f + n - 1)) * Pl;
  const j = Math.min(Math.floor(b - f), n - 2), r = b - f - j;
  return n === 1 ? bt[0] : bt[j] + r * (bt[j + 1] - bt[j]);
}

/** seconds (audio time) -> beats from MIDI tick 0 */
export function beatPosition(t, tm) { return absPos(t, tm) - absPos(tm.offset_seconds ?? 0.0, tm); }

export function gridFit(notes, tm, tol = 0.035, rel = 0.15) {
  if (!notes.length) return 0.0;
  let ok = 0;
  for (const nt of notes) {
    const on = nt[2], q = beatPosition(on, tm) * 4.0;
    const d = Math.max(beatPosition(on + 0.01, tm) - beatPosition(on - 0.01, tm), 1e-6);
    const sixteenth = 0.02 / d / 4.0, off = Math.abs(q - roundHalfEven(q));
    if (off * sixteenth <= tol && off <= rel) ok++;
  }
  return ok / notes.length;
}

export function fixedTempo(bpm = 120.0, reason = null) {
  const tm = { mode: 'fixed', segments: [{ beat: 0, time: 0.0, bpm, bpm_written: bpm }], time_signature: [4, 4],
    offset_seconds: 0.0, bar_aligned: false, bpm, constant: true };
  if (reason) tm.note = reason;
  return tm;
}

// ---------- main ----------
function fromPath(winBpm, ctx, allowDouble) {
  const { notes, n, env, low, snenv, nearest, c, hi } = ctx;
  const period = Float64Array.from(nearest, i => 60.0 * TFPS / winBpm[i]);
  let beatF = trackBeats(env, period);
  if (beatF.length < 8) return null;
  let mult = 1.0;
  const bpmNow = median(beatF.map(f => winBpm[nearest[f]]));
  if (allowDouble && amax(winBpm) * 2 <= hi && (needsDouble(beatF, snenv, ctx.nSnare) ||
      preferDouble(bpmNow, startsPerBeat(ctx.starts, beatF.map(f => f / TFPS)), Number(c.prefer)))) {
    mult = 2.0;
    beatF = trackBeats(env, period.map(p => p / 2));
  }
  let beatT = beatF.map(f => f / TFPS);
  const beatBpm = beatF.map(f => winBpm[nearest[f]] * mult);
  let segs = segments(beatT, beatBpm, !!c.changes, Math.trunc(c.min_segment_beats));
  let ks = range(0, beatT.length);
  const weights = bf => { const ev = bf.map(f => env[f]), m = amax(ev); return ev.map(v => 0.05 + v / (m + 1e-9)); };
  let bw = weights(beatF);
  if (segs.length > 1) segs = refineBounds(segs, beatT, ks, bw);
  let fits = segs.map(([a, b]) => fit(sl(beatT, a, b), sl(ks, a, b), sl(bw, a, b)));
  if (segs.length > 1) {
    const bp = fits.map(([, P]) => 60.0 / P);
    if (amax(bp) / amin(bp) < 1.02) { segs = [[0, beatT.length - 1]]; fits = [fit(beatT, ks, bw)]; }
  }
  const bounds = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const [a1, b1] = segs[i], [a2, b2] = segs[i + 1];
    const x1 = a1, y1 = Math.max(a1 + 1, b1 - 6), x2 = Math.min(b2 - 1, a2 + 6), y2 = b2;
    const l1 = fit(sl(beatT, x1, y1), sl(ks, x1, y1), sl(bw, x1, y1));
    const l2 = fit(sl(beatT, x2, y2), sl(ks, x2, y2), sl(bw, x2, y2));
    const Pold = l1[1], Pnew = l2[1], tMid = beatT[b1], reach = Math.max(4.0, 10 * Math.max(Pold, Pnew));
    const loT = Math.max(beatT[a1], tMid - reach, bounds.length ? bounds[bounds.length - 1] : -1.0);
    const hiT = Math.min(beatT[b2], tMid + reach);
    bounds.push(locateSwitch(env, l1, l2, loT, hiT) + 0.5 * Pnew);
  }
  const bf = bounds.map(b => b * TFPS), Ps = fits.map(([, P]) => P);
  const period2 = Float64Array.from({ length: n }, (_, t) => Ps[searchsorted(bf, t, true)] * TFPS);
  beatF = trackBeats(env, period2);
  beatT = beatF.map(f => f / TFPS);
  ks = range(0, beatT.length);
  bw = weights(beatF);
  const lab = beatT.map(t => searchsorted(bounds, t, true));
  segs = [];
  for (let j = 0; j < fits.length; j++) {
    const idx = []; lab.forEach((l, i) => { if (l === j) idx.push(i); });
    if (idx.length >= 4) segs.push([idx[0], idx[idx.length - 1]]);
  }
  if (!segs.length) segs = [[0, beatT.length - 1]];
  segs[0] = [0, segs[0][1]];
  segs[segs.length - 1] = [segs[segs.length - 1][0], beatT.length - 1];
  for (let i = 1; i < segs.length; i++) segs[i] = [segs[i - 1][1] + 1, segs[i][1]];
  if (segs.length > 1) segs = refineBounds(segs, beatT, ks, bw);
  fits = segs.map(([a, b]) => fit(sl(beatT, a, b), sl(ks, a, b), sl(bw, a, b)));
  const [nb, phase] = metre(beatF, low, env, notes);
  const [a0, P0] = fits[0];
  const tFirst = amin(notes.map(nt => nt[2]));
  const kFirst = Math.floor((tFirst + 0.05 - a0) / P0);
  const k0 = c.align_bars ? kFirst - pmod(kFirst - phase, nb) : 0;
  let T0 = c.align_bars ? a0 + k0 * P0 : 0.0;
  for (let i = 1; i < segs.length; i++) {
    const [ka, kb] = segs[i], [a, P] = fits[i];
    if (ka - 1 > segs[i - 1][0] && Math.abs(beatT[ka - 1] - (a + (ka - 1) * P)) < 0.15 * P) {
      segs[i - 1] = [segs[i - 1][0], ka - 2]; segs[i] = [ka - 1, kb];
    }
  }
  const N = beatT.length, pred = new Float64Array(N);
  segs.forEach(([ka, kb], i) => { const [a, P] = fits[i]; for (let k = ka; k <= kb; k++) pred[k] = a + ks[k] * P; });
  let bt = Float64Array.from(pred);
  if (c.follow_beats && N >= 9) {
    const r = beatT.map((t, k) => t - pred[k]);
    const rm = r.map((_, k) => median(r.slice(Math.max(0, k - 2), k + 3)));
    const cand = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let num = 0, den = 0;
      for (let d = -4; d <= 4; d++) { const j = k + d; if (j >= 0 && j < N) { num += rm[j] * bw[j]; den += bw[j]; } }
      cand[k] = pred[k] + num / Math.max(den, 1e-9);
    }
    let ok = true;
    for (let k = 1; k < N; k++) {
      const Pk = pred[k] - pred[k - 1], d = cand[k] - cand[k - 1];
      if (d < 0.5 * Pk || d > 1.5 * Pk) { ok = false; break; }
    }
    if (ok) bt = cand;
  }
  const outSegs = segs.map(([ka], i) => ({ beat: ka - k0, bpm: 60.0 / fits[i][1] }));
  const tm = { mode: 'auto', segments: outSegs, time_signature: [nb, 4], bar_aligned: !!c.align_bars, beats: N,
    beat_first: -k0, beat_times: Array.from(bt, x => pyRound(x, 4)) };
  if (c.align_bars) T0 = beatTime(0.0, tm);
  tm.offset_seconds = T0;
  const ref = absPos(T0, tm);
  outSegs.forEach((sg, i) => {
    sg.time = i === 0 ? T0 : beatTime(sg.beat, tm);
    sg.beat = i === 0 ? 0.0 : pyRound(sg.beat - ref, 4);
    const b = Math.min(Math.max(sg.bpm, ctx.lo), hi);
    sg.bpm_written = c.integer_bpm ? Math.min(Math.max(roundHalfEven(b), ctx.lo), hi) : b;
  });
  tm.grid_fit = pyRound(gridFit(notes, tm), 3);
  tm.bpm = outSegs[0].bpm_written;
  tm.constant = outSegs.length === 1;
  return tm;
}

export function estimateTempo(notes, seconds, cfg = {}) {
  const c = { ...DEFAULT_TEMPO, ...cfg };
  const lo = Number(c.min), hi = Number(c.max);
  const clampPrefer = () => Math.min(Math.max(c.prefer, lo), hi);
  const uniq = new Set(notes.map(nt => roundHalfEven(nt[2] * 100)));
  if (uniq.size < 16) return fixedTempo(clampPrefer(), 'too few notes');
  const n = Math.trunc(Math.ceil(Math.max(seconds, amax(notes.map(nt => nt[2])) + 0.5) * TFPS)) + 1;
  const [env, low, snenv] = onsetEnvelopes(notes, n);
  const nSnare = notes.filter(nt => nt[1] === DRUM && SNARE.includes(roundHalfEven(nt[0]))).length;
  const bpms = tempoGrid(lo, hi);
  const [scores, centres] = localScores(env, bpms, Number(c.prefer));
  const path = viterbi(scores, bpms, !!c.changes, Number(c.change_penalty));
  const nearest = new Int32Array(n);
  for (let t = 0; t < n; t++) {
    let j = Math.min(Math.max(searchsorted(centres, t), 0), centres.length - 1);
    const p = Math.min(Math.max(j - 1, 0), centres.length - 1);
    if (Math.abs(centres[p] - t) < Math.abs(centres[j] - t)) j = p;
    nearest[t] = j;
  }
  const starts = Float64Array.from(new Set(notes.filter(nt => !(nt[1] === DRUM && HATS.includes(roundHalfEven(nt[0]))))
    .map(nt => roundHalfEven(nt[2] * 100)))).sort().map(v => v / 100);
  const ctx = { notes, n, env, low, snenv, nSnare, nearest, starts, c, lo, hi };
  const winBpm = Float64Array.from(path, k => bpms[k]);
  let best = fromPath(winBpm, ctx, true);
  if (!best) return fixedTempo(clampPrefer(), 'no beat found');
  if (best.grid_fit < 0.85) {
    const cands = [0.75, 4 / 3, 2 / 3, 1.5].map(r => winBpm.map(b => b * r));
    const K = bpms.length, tot = new Float64Array(K);
    for (const row of scores) for (let k = 0; k < K; k++) tot[k] += row[k];
    const order = range(0, K).sort((a, b) => tot[b] - tot[a] || a - b).slice(0, 40);
    const med = median(winBpm);
    for (const k of order) {
      const b = bpms[k], oc = Math.log2(b / med);
      if (Math.abs(oc - roundHalfEven(oc)) > 0.04 && cands.every(x => Math.abs(Math.log(b / median(x))) > 0.03))
        cands.push(new Float64Array(winBpm.length).fill(b));
      if (cands.length >= 7) break;
    }
    for (const wb of cands) {
      if (amin(wb) < lo || amax(wb) > hi) continue;
      const tm = fromPath(wb, ctx, true);
      if (tm && tm.grid_fit > best.grid_fit + 0.1) best = tm;
    }
  }
  return best;
}

/** cfg.mode = 'auto' or a number (fixed tempo, clipped to min..max). */
export function tempoMap(notes, seconds, cfg = {}) {
  const c = { ...DEFAULT_TEMPO, ...cfg };
  if (typeof c.mode === 'string' && c.mode.trim().toLowerCase() === 'auto') return estimateTempo(notes, seconds, c);
  let bpm = Number(c.mode);
  if (!Number.isFinite(bpm)) bpm = 120.0;
  const clipped = Math.min(Math.max(bpm, c.min), c.max);
  return fixedTempo(clipped, clipped === bpm ? null : `${bpm} BPM is outside ${c.min}..${c.max}`);
}
