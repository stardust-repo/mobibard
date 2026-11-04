// Probability maps -> notes, ported 1:1 from w2m/labels.py::decode_notes and w2m/infer.py::predict_song.
import { HOP, FPS, N_PITCH, PITCH_MIN, DRUM } from './dsp.mjs';

const P = N_PITCH;
const INST_FLOOR = 0.05;       // 악기 후보로 인정하는 최소 확률 (inst_range 사용 시)

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
        if (th.inst_range != null) {
          // 가장 확률이 높은 악기의 확률에서 inst_range 이내인 악기를 확률 순서로 inst_max개까지(최고 악기 포함) 씁니다.
          // 확률이 너무 낮은 악기(< INST_FLOOR)는 범위 안이어도 쓰지 않습니다.
          const extra = [];
          for (let k = 0; k < K; k++) if (k !== best && score[k] >= INST_FLOOR && score[best] - score[k] <= th.inst_range + 1e-9) extra.push(k);
          extra.sort((a, b) => score[b] - score[a] || a - b);
          for (const k of extra.slice(0, Math.max(0, Math.floor(th.inst_max ?? K) - 1))) ks.push(k);
        } else {
          for (let k = 0; k < K; k++) if (k !== best && score[k] >= th.inst_multi) ks.push(k);
        }
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

/** 같은 시각(onset이 SAME_ONSET초 이내)에 시작한 음높이 노트가 max개보다 많으면, onset 확률(confidence)이 높은 음높이부터
 *  max개 음높이만 남깁니다. 한 음높이의 여러 악기 노트는 함께 남거나 함께 빠집니다. 드럼은 건드리지 않습니다. */
const SAME_ONSET = 0.03;
export function limitPolyphony(notes, max) {
  const limit = Math.floor(Number(max));
  if (!(limit >= 1)) return notes;
  const pitched = notes.filter(n => n[1] !== DRUM).sort((a, b) => a[2] - b[2]);
  const drop = new Set();
  for (let i = 0; i < pitched.length;) {
    let j = i; while (j < pitched.length && pitched[j][2] - pitched[i][2] <= SAME_ONSET) j++;
    const best = new Map();                                   // pitch -> highest confidence in this cluster
    for (let k = i; k < j; k++) best.set(pitched[k][0], Math.max(best.get(pitched[k][0]) ?? -1, pitched[k][4]));
    if (best.size > limit) {
      const keep = new Set([...best.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, limit).map(e => e[0]));
      for (let k = i; k < j; k++) if (!keep.has(pitched[k][0])) drop.add(pitched[k]);
    }
    i = j;
  }
  return drop.size ? notes.filter(n => !drop.has(n)) : notes;
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
  return { probs: acc, T, stats };
}
