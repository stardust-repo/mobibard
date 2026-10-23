// Probability maps -> notes, ported 1:1 from w2m/labels.py::decode_notes and w2m/infer.py::predict_song.
import { HOP, FPS, N_PITCH, PITCH_MIN, DRUM } from './dsp.mjs';

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
        for (let k = 0; k < K; k++) if (k !== best && score[k] >= th.inst_multi) ks.push(k);
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

/** Overlapping windows + linear cross-fade, as in predict_song. runWindow(Float32Array samples) -> probs of W frames. */
export async function predictSong(wave, meta, runWindow, onProgress) {
  let W = Math.round(meta.window_seconds * FPS); W += W % 2;
  const O = Math.min(Math.round(meta.overlap_seconds * FPS), W / 2), H = W - O;
  const T = Math.ceil(wave.length / HOP), K = meta.classes.length;
  const starts = [0];
  while (starts[starts.length - 1] + W < T) starts.push(starts[starts.length - 1] + H);
  const acc = { onset: new Float32Array(T * P), frame: new Float32Array(T * P), offset: new Float32Array(T * P),
                drum: new Float32Array(T * P), inst: new Float32Array(T * P * K) };
  const wsum = new Float32Array(T);
  for (let wi = 0; wi < starts.length; wi++) {
    const st = starts[wi], seg = new Float32Array(W * HOP);
    seg.set(wave.subarray(st * HOP, Math.min(wave.length, (st + W) * HOP)));
    const pr = await runWindow(seg);
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
    if (onProgress) onProgress(wi + 1, starts.length);
  }
  for (let t = 0; t < T; t++) {
    const s = Math.max(wsum[t], 1e-6);
    for (const key of ['onset', 'frame', 'offset', 'drum']) for (let p = 0; p < P; p++) acc[key][t * P + p] /= s;
    for (let j = 0; j < P * K; j++) acc.inst[t * P * K + j] /= s;
  }
  return { probs: acc, T };
}
