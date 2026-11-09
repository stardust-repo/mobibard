// Probability maps -> notes, ported 1:1 from w2m/labels.py::decode_notes and w2m/infer.py::predict_song.
import { HOP, FPS, N_PITCH, PITCH_MIN, DRUM, BASE_MIDI, logfreqAmp, roundHalfEven } from './dsp.mjs';

const P = N_PITCH;

function peaks(x, T, th, radius = 2) {
  const out = [];
  for (let p = 0; p < P; p++) {
    for (let t = 0; t < T; t++) {
      const v = x[t * P + p];
      if (!(v >= th)) continue;
      let ok = true;
      for (let d = 1; d <= radius && ok; d++) {
        const l = t - d >= 0 ? x[(t - d) * P + p] : -1, r = t + d < T ? x[(t + d) * P + p] : -1;
        ok = v > l && v >= r;
      }
      if (ok) out.push([t, p]);
    }
  }
  return out;  // sorted by pitch, then time
}

function subframe(x, T, t, p) {
  if (t === 0 || t === T - 1) return t;
  const a = x[(t - 1) * P + p], b = x[t * P + p], c = x[(t + 1) * P + p], den = a - 2 * b + c;
  const d = den < -1e-6 ? 0.5 * (a - c) / den : 0;
  return t + Math.max(-0.5, Math.min(0.5, d));
}

/** probs: {onset, frame, offset, drum: Float32Array(T*88), inst: Float32Array(T*88*K)}.
 *  Returns [[pitch, program, onset_s, offset_s, confidence], ...] sorted by onset, program, pitch. */
export function decodeNotes(probs, T, classes, th) {
  const K = classes.length, { onset: on, frame: fr, offset: of, inst } = probs, out = [];
  const minf = th.min_frames, offPeak = new Uint8Array(T * P);
  for (const [t, p] of peaks(of, T, th.offset)) offPeak[t * P + p] = 1;
  const byPitch = new Map();
  for (const [t, p] of peaks(on, T, th.onset)) { if (!byPitch.has(p)) byPitch.set(p, []); byPitch.get(p).push(t); }
  for (const [p, ts] of byPitch) {
    const stops = [];
    for (let t = 0; t < T; t++) if (fr[t * P + p] < th.frame || offPeak[t * P + p]) stops.push(t);
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i], nxt = i + 1 < ts.length ? ts[i + 1] : T;
      let lo = 0, hi = stops.length;                       // first stop >= t + minf
      while (lo < hi) { const m = (lo + hi) >> 1; if (stops[m] < t + minf) lo = m + 1; else hi = m; }
      let e = lo < stops.length ? stops[lo] : T;
      e = Math.max(Math.min(e, nxt), Math.min(t + 1, T));
      const s = subframe(on, T, t, p), conf = on[t * P + p];
      const onsetS = Math.max(s, 0) / FPS;
      let offsetS = e / FPS;
      if (offsetS <= onsetS) offsetS = onsetS + 1 / FPS;
      let ks = [0];
      if (inst && K > 1) {
        const h = Math.max(Math.min(e, t + th.inst_frames), t + 1), score = new Float64Array(K);
        for (let u = t; u < h; u++) { const o = (u * P + p) * K; for (let k = 0; k < K; k++) score[k] += inst[o + k]; }
        let best = 0;
        for (let k = 0; k < K; k++) { score[k] /= (h - t); if (score[k] > score[best]) best = k; }
        ks = [best];
      }
      for (const k of ks) out.push([p + PITCH_MIN, classes[k], onsetS, offsetS, conf]);
    }
  }
  if (probs.drum) {
    for (const [t, p] of peaks(probs.drum, T, th.drum)) {
      const o = Math.max(subframe(probs.drum, T, t, p), 0) / FPS;
      out.push([p + PITCH_MIN, DRUM, o, o + th.drum_seconds, probs.drum[t * P + p]]);
    }
  }
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Extended decoder, ported 1:1 from w2m/decode_plus.py (keep the two in step; see that file for the rules).
export const DEFAULT_DECODE_PLUS = {
  enabled: true, inst_multi: 0.4,
  recover: true, extend: false,
  rec_core: 0.5, rec_core_frames: 8, rec_lo: 0.2, rec_share: 0.7, rec_fp: 0.8, rec_min_frames: 8,
  rec_back: 15, rec_back_onset: 0.02, rec_join: 3, rec_join_rise: 1.0, rec_ghost: 0.8,
  rise: 0.5, rise_onset: 0.03,
  fp_inst: true, fp_cand: 0.3, fp_ref: 0.5, fp_win: 3.0, fp_semi: 7, fp_topk: 3, fp_margin: 0.05,
  unison: false, uni_resp: 0.3, uni_win: 1.5, uni_semi: 12, uni_min_refs: 2,
  fp_store_frame: 0.15, fp_store_onset: 0.02,
};
const GHOST_INTERVALS = [12, 19, 24];

/** [T*88] ln amplitude at each pitch: max of its three log-frequency bins, n_fft 1024 (short window). */
export function levelMap(wave, T) {
  const S = logfreqAmp(wave, 1024, T), NL = S.length / T, out = new Float32Array(T * P);
  const k0 = roundHalfEven((PITCH_MIN - BASE_MIDI) * 3);
  for (let t = 0; t < T; t++) {
    for (let p = 0; p < P; p++) {
      const k = k0 + 3 * p, hi = Math.min(k + 1, NL - 1), o = t * NL;
      out[t * P + p] = Math.max(Math.log(S[o + k - 1] + 1e-4), Math.log(S[o + k] + 1e-4), Math.log(S[o + hi] + 1e-4));
    }
  }
  return out;
}

function riseMap(L, T) {
  const out = new Float32Array(T * P);
  if (T < 9) return out;
  for (let t = 5; t < T - 3; t++) {
    for (let p = 0; p < P; p++) {
      const nxt = Math.max(L[t * P + p], L[(t + 1) * P + p], L[(t + 2) * P + p]);
      let s = 0;
      for (let u = t - 5; u < t; u++) s += L[u * P + p];
      out[t * P + p] = nxt - s / 5;
    }
  }
  return out;
}

function unit(v) {
  let n = 0;
  for (let d = 0; d < v.length; d++) n += v[d] * v[d];
  n = Math.sqrt(n);
  if (!(n > 1e-9)) return null;
  for (let d = 0; d < v.length; d++) v[d] /= n;
  return v;
}

/** Unit mean of the kept fingerprints at pitch p over frames [t0, t1); null when none is kept. */
function meanFp(fp, T, t0, t1, p, only = null) {
  if (!fp) return null;
  const s = new Float64Array(fp.D);
  let n = 0;
  const lo = Math.max(t0, 0), hi = Math.min(Math.max(t1, t0 + 1), T);
  for (let t = lo; t < hi; t++) {
    if (only && !only(t)) continue;
    const v = fp.map.get(t * P + p);
    if (!v) continue;
    for (let d = 0; d < fp.D; d++) s[d] += v[d];
    n++;
  }
  if (!n) return null;
  for (let d = 0; d < fp.D; d++) s[d] /= n;
  return unit(s);
}

function dot(a, b) { let s = 0; for (let d = 0; d < a.length; d++) s += a[d] * b[d]; return s; }

/** The plain decoder's melodic notes, instruments decided later: [pitch index, start, end, onset_s, conf]. */
function baseNotes(probs, T, th) {
  const { onset: on, frame: fr, offset: of } = probs, out = [];
  const minf = th.min_frames, offPeak = new Uint8Array(T * P);
  for (const [t, p] of peaks(of, T, th.offset)) offPeak[t * P + p] = 1;
  const byPitch = new Map();
  for (const [t, p] of peaks(on, T, th.onset)) { if (!byPitch.has(p)) byPitch.set(p, []); byPitch.get(p).push(t); }
  for (const [p, ts] of byPitch) {
    const stops = [];
    for (let t = 0; t < T; t++) if (fr[t * P + p] < th.frame || offPeak[t * P + p]) stops.push(t);
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i], nxt = i + 1 < ts.length ? ts[i + 1] : T;
      let lo = 0, hi = stops.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (stops[m] < t + minf) lo = m + 1; else hi = m; }
      let e = lo < stops.length ? stops[lo] : T;
      e = Math.max(Math.min(e, nxt), Math.min(t + 1, T));
      out.push([p, t, e, Math.max(subframe(on, T, t, p), 0) / FPS, on[t * P + p]]);
    }
  }
  return out;
}

/** probs as for decodeNotes; fp = {D, map: Map(t*88+p -> unit Float32Array(D))} from predictSong (null = no
 *  fingerprint layer); level = levelMap(wave, T) (null = no level split); opt = meta.decode_plus.
 *  Returns notes like decodeNotes; stats (optional object) gets {recovered, extended}. */
export function decodePlus(probs, T, classes, th, opt, fp, level, stats) {
  const o = { ...DEFAULT_DECODE_PLUS, ...(opt || {}) };
  const K = classes.length, { onset: on, frame: fr, offset: of, inst } = probs;
  const mel = baseNotes(probs, T, th);
  const rise = level ? riseMap(level, T) : null;
  const offPeak = new Uint8Array(T * P);
  for (const [t, p] of peaks(of, T, th.offset)) offPeak[t * P + p] = 1;
  const anyOff = (t0, t1, p) => { for (let t = Math.max(t0, 0); t < Math.min(t1, T); t++) if (offPeak[t * P + p]) return true; return false; };
  const sliceMax = (arr, t0, t1, p) => { let m = -Infinity; for (let t = Math.max(t0, 0); t < Math.min(t1, T); t++) m = Math.max(m, arr[t * P + p]); return m; };
  const sliceMean = (arr, t0, t1, p) => { let s = 0, n = 0; for (let t = Math.max(t0, 0); t < Math.min(t1, T); t++) { s += arr[t * P + p]; n++; } return n ? s / n : NaN; };
  let added = 0, extended = 0;
  if ((o.recover || o.extend) && inst) {
    const byP = new Map();
    mel.forEach((n, i) => { if (!byP.has(n[0])) byP.set(n[0], []); byP.get(n[0]).push(i); });
    const am = new Int32Array(T), same = new Uint8Array(T);
    for (let p = 0; p < P; p++) {
      const idx = byP.get(p) || [];
      const starts = [...new Set(idx.map(i => mel[i][1]))].sort((a, b) => a - b);
      const cutSet = new Set(starts);
      if (rise) {                    // level jumps; the frames of one attack (and those right after a note start) count once
        let last = -1e9;
        for (let t = 0; t < T; t++) {
          if (!(rise[t * P + p] >= o.rise && on[t * P + p] >= o.rise_onset)) continue;
          const nearStart = starts.some(s0 => t - s0 >= 0 && t - s0 <= o.rec_join);
          if (t - last > o.rec_join && !nearStart) cutSet.add(t);
          last = t;
        }
      }
      const cut = [...cutSet].sort((a, b) => a - b);
      for (let t = 0; t < T; t++) {
        const b = (t * P + p) * K;
        let best = 0;
        for (let k = 1; k < K; k++) if (inst[b + k] > inst[b + best]) best = k;
        am[t] = best;
      }
      let t = 0;
      while (t < T) {
        if (!(fr[t * P + p] >= o.rec_lo)) { t++; continue; }
        const s = t;
        while (t < T && fr[t * P + p] >= o.rec_lo) t++;
        const e = t;
        const bounds = [s, ...cut.filter(c => s < c && c < e), e];
        for (let bi = 0; bi + 1 < bounds.length; bi++) {
          const a = bounds[bi], b = bounds[bi + 1];
          if (b - a < o.rec_min_frames) continue;
          let run = 0, longest = 0;
          for (let u = a; u < b; u++) { run = fr[u * P + p] >= o.rec_core ? run + 1 : 0; longest = Math.max(longest, run); }
          if (longest < o.rec_core_frames) continue;
          const cnt = new Int32Array(K);
          for (let u = a; u < b; u++) cnt[am[u]]++;
          let dom = 0;
          for (let k = 1; k < K; k++) if (cnt[k] > cnt[dom]) dom = k;
          if (cnt[dom] < o.rec_share * (b - a)) continue;
          for (let u = a; u < b; u++) same[u] = am[u] === dom ? 1 : 0;
          let cm = fp ? meanFp(fp, T, a, b, p) : null;
          if (cm) {
            const coreMean = meanFp(fp, T, a, b, p, u => fr[u * P + p] >= o.rec_core);
            if (coreMean) cm = coreMean;
            for (let u = a; u < b; u++) {
              const v = fp.map.get(u * P + p);
              if (v && dot(v, cm) < o.rec_fp) same[u] = 0;
            }
          }
          let first = -1, last = -1;
          for (let u = a; u < b; u++) if (same[u]) { if (first < 0) first = u; last = u; }
          if (first < 0) continue;
          let a2 = first;
          const b2 = last + 1;
          const cov = idx.filter(i => mel[i][1] < b && mel[i][2] > a);
          if (cov.length) {
            if (o.extend) for (const i of cov) { const n = mel[i]; if (n[1] >= a && n[2] < b2 && !anyOff(n[2], b2, p)) { n[2] = b2; extended++; } }
            continue;
          }
          if (!o.recover || b2 - a2 < o.rec_min_frames) continue;
          const prev = idx.filter(i => a2 - mel[i][2] >= 0 && a2 - mel[i][2] <= o.rec_join);
          const strong = !!rise && sliceMax(rise, Math.max(a2 - 2, 0), a2 + 3, p) >= o.rec_join_rise;
          if (prev.length && !strong) {
            if (o.extend) for (const i of prev) if (!anyOff(mel[i][2], b2, p)) { mel[i][2] = b2; extended++; }
            continue;
          }
          const mine = sliceMean(fr, a2, b2, p);
          if (GHOST_INTERVALS.some(iv => p - iv >= 0 && sliceMean(fr, a2, b2, p - iv) * o.rec_ghost > mine)) continue;
          const lo = Math.max(a2 - o.rec_back, 0);
          let bestT = -1, bestV = -Infinity;
          for (let u = lo; u < Math.min(a2 + 3, T); u++) if (on[u * P + p] > bestV) { bestV = on[u * P + p]; bestT = u; }
          if (bestT >= 0 && bestV >= o.rec_back_onset) a2 = bestT;
          const dup = idx.filter(i => Math.abs(mel[i][1] - a2) <= o.rec_join);
          if (dup.length) {                   // the start lands on an existing note: that note continues
            if (o.extend) for (const i of dup) if (mel[i][2] < b2 && !anyOff(mel[i][2], b2, p)) { mel[i][2] = b2; extended++; }
            continue;
          }
          const conf = sliceMax(on, Math.max(a2 - 2, 0), a2 + 3, p);
          mel.push([p, a2, b2, a2 / FPS, conf]);
          idx.push(mel.length - 1);
          added++;
        }
      }
    }
  }
  // instruments
  const N = mel.length, out = [];
  if (N) {
    const KK = inst && K > 1 ? K : 1, scores = new Float64Array(N * KK).fill(KK === 1 ? 1 : 0);
    if (KK > 1) {
      mel.forEach((n, j) => {
        const t = n[1], e = Math.max(n[2], n[1] + 1), h = Math.max(Math.min(e, t + th.inst_frames), t + 1);
        for (let u = t; u < h; u++) { const b = (u * P + n[0]) * K; for (let k = 0; k < K; k++) scores[j * KK + k] += inst[b + k]; }
        for (let k = 0; k < K; k++) scores[j * KK + k] /= (h - t);
      });
    }
    const sc = (j, k) => scores[j * KK + k];
    const top = new Int32Array(N), lab = new Int32Array(N), ncand = new Int32Array(N), refs = new Uint8Array(N);
    for (let j = 0; j < N; j++) {
      let b = 0;
      for (let k = 1; k < KK; k++) if (sc(j, k) > sc(j, b)) b = k;
      top[j] = lab[j] = b;
      let c = 0;
      for (let k = 0; k < KK; k++) if (sc(j, k) >= o.fp_cand) c++;
      ncand[j] = c + (sc(j, b) < o.fp_cand ? 1 : 0);
      refs[j] = ncand[j] === 1 && sc(j, b) >= o.fp_ref ? 1 : 0;
    }
    if (o.fp_inst && fp && KK > 1) {
      const fps = mel.map(n => meanFp(fp, T, n[1], n[1] + 5, n[0]));
      const decided = Uint8Array.from(refs);
      let maxC = 0;
      for (let j = 0; j < N; j++) maxC = Math.max(maxC, ncand[j]);
      for (let nc = 2; nc <= maxC; nc++) {
        const todo = [];
        for (let j = 0; j < N; j++) if (ncand[j] === nc && !decided[j]) todo.push(j);
        for (const j of todo) {
          if (!fps[j]) continue;
          const sims = new Map();
          for (let r = 0; r < N; r++) {
            if (!decided[r] || Math.abs(mel[r][3] - mel[j][3]) > o.fp_win || Math.abs(mel[r][0] - mel[j][0]) > o.fp_semi) continue;
            const k = lab[r];
            if (!(sc(j, k) >= o.fp_cand || k === top[j]) || !fps[r]) continue;
            if (!sims.has(k)) sims.set(k, []);
            sims.get(k).push(dot(fps[r], fps[j]));
          }
          let kb = -1, sb = -Infinity;
          for (let k = 0; k < KK; k++) {
            const l = sims.get(k);
            if (!l) continue;
            l.sort((x, y) => y - x);
            const m = l.slice(0, o.fp_topk).reduce((x, y) => x + y, 0) / Math.min(l.length, o.fp_topk);
            sims.set(k, m);
            if (m > sb) { sb = m; kb = k; }
          }
          if (kb >= 0 && kb !== top[j]) {
            const st = sims.has(top[j]) ? sims.get(top[j]) : -1;
            if (sb >= st + o.fp_margin) lab[j] = kb;
          }
        }
        for (const j of todo) decided[j] = 1;
      }
    }
    const multi = o.inst_multi ?? th.inst_multi;
    for (let j = 0; j < N; j++) {
      const n = mel[j], ks = [lab[j]];
      for (let k = 0; k < KK; k++) {
        if (k === lab[j]) continue;
        // MobiBard: one instrument per note (same rule as decodeNotes); extra instruments only when opt.allow_multi.
        if (o.allow_multi && sc(j, k) >= multi) { ks.push(k); continue; }
        if (o.unison && sc(j, k) >= o.uni_resp) {
          let c = 0;
          for (let r = 0; r < N; r++) if (refs[r] && lab[r] === k && Math.abs(mel[r][3] - n[3]) <= o.uni_win && Math.abs(mel[r][0] - n[0]) <= o.uni_semi) c++;
          if (c >= o.uni_min_refs) ks.push(k);
        }
      }
      const onsetS = n[3];
      let offsetS = Math.max(n[2], n[1] + 1) / FPS;
      if (offsetS <= onsetS) offsetS = onsetS + 1 / FPS;
      for (const k of ks) out.push([n[0] + PITCH_MIN, classes[KK > 1 ? k : 0], onsetS, offsetS, n[4]]);
    }
  }
  if (probs.drum) {
    for (const [t, p] of peaks(probs.drum, T, th.drum)) {
      const x = Math.max(subframe(probs.drum, T, t, p), 0) / FPS;
      out.push([p + PITCH_MIN, DRUM, x, x + th.drum_seconds, probs.drum[t * P + p]]);
    }
  }
  if (stats) { stats.recovered = added; stats.extended = extended; }
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out;
}


/** Overlapping windows + linear cross-fade, as in predict_song. runWindow(Float32Array samples) -> probs of W frames. */
/** runWindow(x) -> probabilities of one window. x is the 8 s audio segment, or, when opts.prepare is given,
 *  what prepare(segment) resolved to (e.g. frontend features computed in Web Workers). prepare() is started
 *  opts.lookahead windows ahead, so feature extraction for the next windows overlaps the network run. */
export async function predictSong(wave, meta, runWindow, onProgress, opts = {}) {
  const prepare = opts.prepare, conc = Math.max(1, Math.floor(opts.concurrency ?? 1));
  const ahead = Math.max(conc, Math.max(0, opts.lookahead ?? 0));
  let W = Math.round(meta.window_seconds * FPS); W += W % 2;
  const O = Math.min(Math.round(meta.overlap_seconds * FPS), W / 2), H = W - O;
  const T = Math.ceil(wave.length / HOP), K = meta.classes.length;
  const starts = [0];
  while (starts[starts.length - 1] + W < T) starts.push(starts[starts.length - 1] + H);
  const acc = { onset: new Float32Array(T * P), frame: new Float32Array(T * P), offset: new Float32Array(T * P),
                drum: new Float32Array(T * P), inst: new Float32Array(T * P * K) };
  const wsum = new Float32Array(T);
  // fingerprints (model output "fp", [W, 88, D]) are kept only where the frame or onset map is on, as sparse
  // per-cell weighted sums (a whole song of all cells would not fit comfortably in the page's memory)
  const D = meta.fp_dim || 0, dp = meta.decode_plus || {};
  const sF = dp.fp_store_frame ?? 0.15, sO = dp.fp_store_onset ?? 0.02;
  const fpAcc = D ? new Map() : null;
  const segment = wi => {
    const st = starts[wi], seg = new Float32Array(W * HOP);
    seg.set(wave.subarray(st * HOP, Math.min(wave.length, (st + W) * HOP)));
    return seg;
  };
  const pending = new Map();
  const start = wi => { if (prepare && wi < starts.length && !pending.has(wi)) pending.set(wi, prepare(segment(wi))); };
  const t0 = performance.now();
  const stats = { accumulate: 0, wait: 0 };
  /** Starts the network run of window wi (its input may still be in preparation). */
  const launch = async wi => {
    for (let j = wi; j <= wi + ahead; j++) start(j);
    if (!prepare) return runWindow(segment(wi));
    const x = await pending.get(wi); pending.delete(wi);
    return runWindow(x);
  };
  // Up to `concurrency` network runs are in flight (CPU: one per session lane; GPU: 1). The run of window wi+1 is
  // started BEFORE the results of window wi are added up, so the GPU/CPU keeps working on the next window while
  // the main thread does the bookkeeping (and no timer tick is waited for per window).
  const runs = new Map();
  let nextLaunch = 0;
  const fill = upto => {
    while (nextLaunch < upto && nextLaunch < starts.length) {
      const r = launch(nextLaunch); r.catch(() => {}); runs.set(nextLaunch, r); nextLaunch++;
    }
  };
  fill(conc);
  for (let wi = 0; wi < starts.length; wi++) {
    const st = starts[wi];
    const tw = performance.now();
    const pr = await runs.get(wi);
    runs.delete(wi);
    stats.wait += performance.now() - tw;
    fill(wi + 1 + conc);
    const ta = performance.now();
    const n = Math.min(W, T - st);
    for (let i = 0; i < n; i++) {
      let w = 1;
      if (O > 0 && st > 0 && i < O) w = (i + 0.5) / O;
      if (O > 0 && st + W < T && i >= W - O) w = (W - i - 0.5) / O;
      const t = st + i;
      for (const key of ['onset', 'frame', 'offset', 'drum']) {
        const a = acc[key], src = pr[key];
        for (let p = 0; p < P; p++) a[t * P + p] += w * src[i * P + p];
      }
      const a = acc.inst, src = pr.inst, base = t * P * K, sb = i * P * K;
      for (let j = 0; j < P * K; j++) a[base + j] += w * src[sb + j];
      wsum[t] += w;
      if (fpAcc && pr.fp) {
        for (let p = 0; p < P; p++) {
          if (!(pr.frame[i * P + p] >= sF || pr.onset[i * P + p] >= sO)) continue;
          const key = t * P + p;
          let v = fpAcc.get(key);
          if (!v) { v = new Float32Array(D); fpAcc.set(key, v); }
          const o = (i * P + p) * D;
          for (let d = 0; d < D; d++) v[d] += w * pr.fp[o + d];
        }
      }
    }
    stats.accumulate += performance.now() - ta;
    if (onProgress) onProgress(wi + 1, starts.length);
  }
  stats.total = performance.now() - t0;
  for (let t = 0; t < T; t++) {
    const s = Math.max(wsum[t], 1e-6);
    for (const key of ['onset', 'frame', 'offset', 'drum']) for (let p = 0; p < P; p++) acc[key][t * P + p] /= s;
    for (let j = 0; j < P * K; j++) acc.inst[t * P * K + j] /= s;
  }
  let fp = null;
  if (fpAcc && fpAcc.size) {                  // unit length; drop cells whose final maps are off (as in Python)
    for (const [key, v] of fpAcc) {
      if (!(acc.frame[key] >= sF || acc.onset[key] >= sO)) { fpAcc.delete(key); continue; }
      let n = 0;
      for (let d = 0; d < D; d++) n += v[d] * v[d];
      n = Math.max(Math.sqrt(n), 1e-6);
      for (let d = 0; d < D; d++) v[d] /= n;
    }
    fp = { D, map: fpAcc };
  }
  return { probs: acc, T, stats, fp };
}
