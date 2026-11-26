// Wave2MIDI v2 in the browser: frontend (log-frequency harmonic stack), window stitching, note decoder, MIDI writer.
// Port of w2m/frontend.py, w2m/infer.py (predict_song), w2m/labels.py (decode_notes) and w2m/midi.py.
// Runs in browsers and in node (tests). The network itself runs in onnxruntime-web (see app.js).
export const SR = 24000, HOP = 240, FPS = 100, PITCH_MIN = 21, NP = 88, DRUM = 128;
const N_LOGF = 357, OUT_BINS = 264, LOG_FLOOR = 1e-4, BASE_MIDI = 9 - 1 / 3;

// ---------------------------------------------------------------- FFT (radix 2, real input)
class FFT {
  constructor(n) {
    this.n = n; this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / n); this.sin[i] = -Math.sin(2 * Math.PI * i / n); }
    this.rev = new Uint32Array(n); let bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); this.rev[i] = r; }
    this.re = new Float64Array(n); this.im = new Float64Array(n);
  }
  // input: this.re filled (im zero) -> magnitudes of bins 0..n/2 into mag
  run(mag) {
    const n = this.n, re = this.re, im = this.im, rev = this.rev;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0, w = 0; k < half; k++, w += step) {
          const a = s + k, b = a + half, c = this.cos[w], d = this.sin[w];
          const tr = re[b] * c - im[b] * d, ti = re[b] * d + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  }
}

function filterbank(n) {                       // sparse version of dsp.logfreq_filterbank
  const df = SR / n, out = [];
  for (let k = 0; k < N_LOGF; k++) {
    const fc = 440 * Math.pow(2, (BASE_MIDI + k / 3 - 69) / 12);
    if (fc >= SR / 2) { out.push(null); continue; }
    const w = Math.max(fc * (Math.pow(2, 1 / 36) - 1), df);
    const lo = Math.max(0, Math.floor((fc - w) / df)), hi = Math.min(n / 2, Math.ceil((fc + w) / df));
    const wt = []; let s = 0;
    for (let i = lo; i <= hi; i++) { const v = Math.max(0, 1 - Math.abs(i * df - fc) / w); wt.push(v); s += v; }
    out.push(s > 0 ? { lo, wt: Float64Array.from(wt, v => v / s) } : null);
  }
  return out;
}

export class Frontend {
  constructor(fe) {                              // fe = meta.frontend
    this.nffts = fe.n_ffts; this.shifts = fe.shifts; this.padLo = fe.pad_lo; this.outStart = fe.out_start;
    this.R = this.nffts.length; this.H = this.shifts.length;
    this.floor = (Math.log(LOG_FLOOR) + 5) / 2.5;
    this.fft = this.nffts.map(n => new FFT(n)); this.fb = this.nffts.map(filterbank);
    this.win = this.nffts.map(n => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)));
    this.mag = this.nffts.map(n => new Float64Array(n / 2 + 1));
  }
  // seg: Float32Array of exactly frames*HOP samples (zero padded) -> Float32Array [R*H, frames, 264]
  features(seg, frames) {
    const out = new Float32Array(this.R * this.H * frames * OUT_BINS);
    const row = new Float32Array(this.padLo + N_LOGF + 64);
    const base = this.padLo + this.outStart;
    for (let r = 0; r < this.R; r++) {
      const n = this.nffts[r], fft = this.fft[r], win = this.win[r], mag = this.mag[r], fb = this.fb[r], sc = 4 / n;
      for (let t = 0; t < frames; t++) {
        const s0 = t * HOP - n / 2;
        for (let i = 0; i < n; i++) { const j = s0 + i; fft.re[i] = (j >= 0 && j < seg.length) ? seg[j] * win[i] : 0; fft.im[i] = 0; }
        fft.run(mag);
        row.fill(this.floor);
        for (let k = 0; k < N_LOGF; k++) {
          const f = fb[k]; let v = 0;
          if (f) for (let i = 0; i < f.wt.length; i++) v += mag[f.lo + i] * f.wt[i];
          row[this.padLo + k] = (Math.log(v * sc + LOG_FLOOR) + 5) / 2.5;
        }
        for (let h = 0; h < this.H; h++) {
          const o = (((r * this.H + h) * frames) + t) * OUT_BINS, st = base + this.shifts[h];
          for (let f = 0; f < OUT_BINS; f++) out[o + f] = row[st + f];
        }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- whole song: windows + cross-fade (predict_song)
// runWindow(features) -> {onset, frame, offset, drum, multi: [600*88], inst: [600*88*K], state: [600*88*3]} (probabilities)
// plus, for v2.1, the note layer of the window: nidx [512] (cell = frame*88 + pitch index), ninst [512*K], nrole [512*3],
// nmulti [512], nis [512] (is-a-real-note score). Every note start the model decides on carries its own instrument there.
// opts.prepare(seg) -> Promise<features> (e.g. a pool of Web Workers); opts.lookahead = windows prepared in advance.
// The next window's network run is started BEFORE the finished one is added up, so the accelerator is not left
// waiting for the CPU (frontend of one window takes about as long as several network runs).
//
// MobiBard changes against the upstream web export (keep them when this file is replaced):
//   opts.concurrency  up to this many network runs in flight (CPU: one per session lane; GPU: 1)
//   opts.keys         which per-cell model outputs are accumulated (default: all). The state decoder needs only
//                     ["state", "drum", "inst"], which saves memory on long songs. The note layer (nidx ...) is always merged.
export async function predictSong(wave, meta, frontend, runWindow, onProgress, opts = {}) {
  let W = Math.round(meta.window_seconds * FPS); W += W % 2;
  const O = Math.min(Math.round(meta.overlap_seconds * FPS), W >> 1), H = W - O;
  const T = Math.ceil(wave.length / HOP), K = meta.classes.length;
  const starts = [0]; while (starts[starts.length - 1] + W < T) starts.push(starts[starts.length - 1] + H);
  const per = { onset: 1, frame: 1, offset: 1, drum: 1, multi: 1, inst: K, state: 3 };
  const keys = (opts.keys || Object.keys(per)).filter(k => per[k]);
  const acc = {}; for (const k of keys) acc[k] = new Float32Array(T * NP * per[k]);
  const wsum = new Float32Array(T), stats = { wait: 0, accumulate: 0 };
  const conc = Math.max(1, Math.floor(opts.concurrency ?? 1));
  const prepare = opts.prepare || (seg => frontend.features(seg, W)), ahead = Math.max(conc, opts.lookahead ?? 0);
  const segment = wi => { const seg = new Float32Array(W * HOP), st = starts[wi];
    seg.set(wave.subarray(st * HOP, Math.min(wave.length, (st + W) * HOP))); return seg; };
  const nlBest = new Map(), pending = new Map();   // v2.1 note layer: cell key -> row of the heaviest window
  const start = wi => { if (wi < starts.length && !pending.has(wi)) pending.set(wi, Promise.resolve(prepare(segment(wi)))); };
  const launch = async wi => { for (let j = wi; j <= wi + ahead; j++) start(j);
    const x = await pending.get(wi); pending.delete(wi); return runWindow(x); };
  const runs = new Map(); let nextLaunch = 0;
  const fill = upto => { while (nextLaunch < upto && nextLaunch < starts.length) {
    const r = launch(nextLaunch); r.catch(() => {}); runs.set(nextLaunch, r); nextLaunch++; } };
  fill(conc);
  for (let wi = 0; wi < starts.length; wi++) {
    const st = starts[wi], tw = performance.now();
    const out = await runs.get(wi); runs.delete(wi); stats.wait += performance.now() - tw;
    fill(wi + 1 + conc);
    const ta = performance.now(), n = Math.min(W, T - st), w = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      if (O > 0) {
        if (st > 0 && i < O) w[i] = (i + 0.5) / O;
        if (st + W < T && i >= W - O) w[i] = (W - i - 0.5) / O;
      }
    }
    for (const k of keys) {
      const d = out[k], c = per[k] * NP, a = acc[k];
      for (let i = 0; i < n; i++) { const wi_ = w[i], s0 = (st + i) * c, d0 = i * c; for (let j = 0; j < c; j++) a[s0 + j] += wi_ * d[d0 + j]; }
    }
    for (let i = 0; i < n; i++) wsum[st + i] += w[i];
    if (out.nidx) {                               // v2.1 note layer: keep, per cell, the row of the window that sees it best
      const Kc = out.nidx.length;
      for (let k = 0; k < Kc; k++) {
        const c = Number(out.nidx[k]), tt = Math.floor(c / NP), pp = c - tt * NP;
        if (tt >= n) continue;
        const key = (st + tt) * NP + pp, wt = w[tt], old = nlBest.get(key);
        if (!old || wt > old.w) nlBest.set(key, { w: wt, inst: out.ninst.slice(k * K, (k + 1) * K), role: out.nrole ? out.nrole.slice(k * 3, k * 3 + 3) : null,
                                                  multi: out.nmulti[k], is: out.nis[k] });
      }
    }
    stats.accumulate += performance.now() - ta;
    if (onProgress) onProgress((wi + 1) / starts.length, wi + 1, starts.length);
  }
  for (const k of keys) {
    const c = per[k] * NP, a = acc[k];
    for (let t = 0; t < T; t++) { const d = Math.max(wsum[t], 1e-6); for (let j = 0; j < c; j++) a[t * c + j] /= d; }
  }
  if (nlBest.size) {
    const ks = [...nlBest.keys()].sort((x, y) => x - y), M = ks.length;
    const nl = { key: Int32Array.from(ks), inst: new Float32Array(M * K), role: new Float32Array(M * 3),
                 multi: new Float32Array(M), is: new Float32Array(M), byP: new Map() };
    ks.forEach((k, r) => { const e = nlBest.get(k); nl.inst.set(e.inst, r * K); if (e.role) nl.role.set(e.role, r * 3); nl.multi[r] = e.multi; nl.is[r] = e.is;
      const p = k % NP, t = (k - p) / NP; if (!nl.byP.has(p)) nl.byP.set(p, { fr: [], rows: [] }); const bp = nl.byP.get(p); bp.fr.push(t); bp.rows.push(r); });
    acc.nl = nl;                                  // keys are sorted, so each pitch's frames are sorted too
  }
  acc.T = T; acc.stats = stats; return acc;
}

// ---------------------------------------------------------------- decoder (labels.decode_notes, peak decoder)
function peaks(x, T, P, thr) {                  // x [T*P]; returns [{t,p}] in row-major order
  const res = [];
  for (let t = 0; t < T; t++) for (let p = 0; p < P; p++) {
    const v = x[t * P + p]; if (!(v >= thr)) continue;
    let ok = true;
    for (let d = 1; d <= 2 && ok; d++) {
      const l = t - d >= 0 ? x[(t - d) * P + p] : -1, r = t + d < T ? x[(t + d) * P + p] : -1;
      if (!(v > l) || !(v >= r)) ok = false;
    }
    if (ok) res.push({ t, p });
  }
  return res;
}
function subframe(x, T, P, t, p) {
  const a = x[Math.max(t - 1, 0) * P + p], b = x[t * P + p], c = x[Math.min(t + 1, T - 1) * P + p], den = a - 2 * b + c;
  let d = den < -1e-6 ? 0.5 * (a - c) / den : 0;
  if (t === 0 || t === T - 1) d = 0;
  return t + Math.min(0.5, Math.max(-0.5, d));
}
function lowerBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; }

/** Row of the note layer's candidate within +-2 frames of (t, p), or -1 (labels.nl_row). */
export function nlRow(pr, t, p) {
  const b = pr.nl && pr.nl.byP.get(p); if (!b) return -1;
  let lo = 0, hi = b.fr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (b.fr[m] < t) lo = m + 1; else hi = m; }
  let best = -1, bd = 3;
  for (const k of [lo - 1, lo]) if (k >= 0 && k < b.fr.length && Math.abs(b.fr[k] - t) < bd) { best = b.rows[k]; bd = Math.abs(b.fr[k] - t); }
  return best;
}
// note_gate: a note start the note layer rates below this as "a real note" is dropped (0 = off; cells without a row are kept)
const gateOk = (pr, th, t, p) => { const g = th.note_gate || 0; if (g <= 0) return true; const r = nlRow(pr, t, p); return r < 0 || pr.nl.is[r] >= g; };

function makeInstruments(pr, meta) {
  const th = meta.thresholds, T = pr.T, P = NP, K = meta.classes.length;
  return (t, e, p) => {
    if (K <= 1) return [0];
    const r = nlRow(pr, t, p);
    if (r >= 0) {                                 // v2.1: the note layer decides the instrument per note
      const sc = pr.nl.inst.subarray(r * K, (r + 1) * K), order = [...Array(K).keys()].sort((a, b) => sc[b] - sc[a] || a - b);
      const ks = [order[0]]; for (let k = 0; k < K; k++) if (sc[k] >= th.inst_multi && k !== order[0]) ks.push(k);
      if (ks.length === 1 && pr.nl.multi[r] >= (th.multi ?? 0.5)) { const more = order.slice(1).filter(k => sc[k] >= 0.5); ks.push(...(more.length ? more : [order[1]])); }
      return ks;
    }
    const h = Math.max(Math.min(e, t + (th.inst_frames | 0)), t + 1), sc = new Float64Array(K);   // no note-layer row: frame-wise scores
    for (let f = t; f < h; f++) for (let k = 0; k < K; k++) sc[k] += pr.inst[(f * P + p) * K + k];
    for (let k = 0; k < K; k++) sc[k] /= (h - t);
    const order = [...Array(K).keys()].sort((a, b) => sc[b] - sc[a] || a - b);
    const best = order[0], ks = [best];
    for (let k = 0; k < K; k++) if (sc[k] >= th.inst_multi && k !== best) ks.push(k);
    let mu = -1; for (let f = Math.max(t - 1, 0); f < Math.min(t + 2, T); f++) mu = Math.max(mu, pr.multi[f * P + p]);
    if (ks.length === 1 && mu >= (th.multi ?? 0.5)) {
      const more = order.slice(1).filter(k => sc[k] >= 0.5); ks.push(...(more.length ? more : [order[1]]));
    }
    return ks;
  };
}

export function decodeNotes(pr, meta) {
  const th = meta.thresholds, T = pr.T, P = NP, K = meta.classes.length, minf = th.min_frames | 0, out = [];
  const instruments = makeInstruments(pr, meta);
  const on = peaks(pr.onset, T, P, th.onset);
  if (on.length) {
    const offPeak = new Uint8Array(T * P); for (const { t, p } of peaks(pr.offset, T, P, th.offset)) offPeak[t * P + p] = 1;
    on.sort((a, b) => a.p - b.p || a.t - b.t);
    const byP = new Map(); for (const o of on) { if (!byP.has(o.p)) byP.set(o.p, []); byP.get(o.p).push(o); }
    for (const [p, list] of [...byP].sort((a, b) => a[0] - b[0])) {
      const stops = []; for (let t = 0; t < T; t++) if (pr.frame[t * P + p] < th.frame || offPeak[t * P + p]) stops.push(t);
      list.forEach((o, i) => {
        if (!gateOk(pr, th, o.t, p)) return;
        const t = o.t, nxt = i + 1 < list.length ? list[i + 1].t : T, j = lowerBound(stops, t + minf);
        let e = j < stops.length ? stops[j] : T; e = Math.min(e, nxt); e = Math.max(e, Math.min(t + 1, T));
        const s = subframe(pr.onset, T, P, t, p), onset = Math.max(s, 0) / FPS; let offset = e / FPS;
        if (offset <= onset) offset = onset + 1 / FPS;
        for (const k of instruments(t, e, p)) out.push([p + PITCH_MIN, meta.classes[k], Math.fround(onset), Math.fround(offset), pr.onset[t * P + p]]);
      });
    }
  }
  for (const { t, p } of peaks(pr.drum, T, P, th.drum)) {
    const o = Math.max(subframe(pr.drum, T, P, t, p), 0) / FPS;
    out.push([p + PITCH_MIN, DRUM, Math.fround(o), Math.fround(o + th.drum_seconds), pr.drum[t * P + p]]);
  }
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out;
}

// ---------------------------------------------------------------- state decoder (labels.decode_states): no onset/frame/offset thresholds
function statePath(st, T, P, bias) {
  const NEG = -1e9, back = new Int8Array(T * P * 3), score = new Float64Array(P * 3);
  const lp = (t, p, s) => Math.fround(Math.log(Math.max(st[(t * P + p) * 3 + s], 1e-7))) + (s === 1 ? bias : 0);
  for (let p = 0; p < P; p++) { score[p * 3] = lp(0, p, 0); score[p * 3 + 1] = lp(0, p, 1); score[p * 3 + 2] = NEG; }
  for (let t = 1; t < T; t++) for (let p = 0; p < P; p++) {
    const s0 = score[p * 3], s1 = score[p * 3 + 1], s2 = score[p * 3 + 2];
    const bOff = s0 >= s1 && s0 >= s2 ? 0 : (s1 >= s2 ? 1 : 2), m = Math.max(s0, s1, s2);
    const bS = s1 >= s2 ? 1 : 2, cS = bS === 1 ? s1 : s2, b = (t * P + p) * 3;
    back[b] = bOff; back[b + 1] = bOff; back[b + 2] = bS;
    const n0 = m + lp(t, p, 0), n1 = m + lp(t, p, 1), n2 = cS + lp(t, p, 2), mx = Math.max(n0, n1, n2);
    score[p * 3] = n0 - mx; score[p * 3 + 1] = n1 - mx; score[p * 3 + 2] = n2 - mx;
  }
  const path = new Int8Array(T * P);
  for (let p = 0; p < P; p++) {
    const s0 = score[p * 3], s1 = score[p * 3 + 1], s2 = score[p * 3 + 2];
    let cur = s0 >= s1 && s0 >= s2 ? 0 : (s1 >= s2 ? 1 : 2);
    for (let t = T - 1; t >= 0; t--) { path[t * P + p] = cur; cur = back[(t * P + p) * 3 + cur]; }
  }
  return path;
}

export function decodeStates(pr, meta, bias = 0) {
  const th = meta.thresholds, T = pr.T, P = NP, K = meta.classes.length, out = [];
  const path = statePath(pr.state, T, P, bias), ps = new Float32Array(T * P);
  for (let i = 0; i < T * P; i++) ps[i] = pr.state[i * 3 + 1];
  const instruments = makeInstruments(pr, meta);
  for (let p = 0; p < P; p++) {
    const ts = [], offs = [];
    for (let t = 0; t < T; t++) {
      const c = path[t * P + p], prev = t ? path[(t - 1) * P + p] : 0;
      if (c === 1 && prev !== 1) ts.push(t);
      if (c === 0) offs.push(t);
    }
    ts.forEach((t, i) => {
      const j = lowerBound(offs, t);
      let e = j < offs.length ? offs[j] : T; e = Math.min(e, i + 1 < ts.length ? ts[i + 1] : T); e = Math.max(e, Math.min(t + 1, T));
      let r = t; while (r + 1 < e && path[(r + 1) * P + p] === 1) r++;
      let pk = t; for (let f = t + 1; f <= r; f++) if (ps[f * P + p] > ps[pk * P + p]) pk = f;
      if (!gateOk(pr, th, pk, p)) return;
      const onset = Math.max(subframe(ps, T, P, pk, p), 0) / FPS; let offset = e / FPS;
      if (offset <= onset) offset = onset + 1 / FPS;
      for (const k of instruments(pk, e, p)) out.push([p + PITCH_MIN, meta.classes[k], Math.fround(onset), Math.fround(offset), ps[pk * P + p]]);
    });
  }
  for (const { t, p } of peaks(pr.drum, T, P, th.drum)) {
    const o = Math.max(subframe(pr.drum, T, P, t, p), 0) / FPS;
    out.push([p + PITCH_MIN, DRUM, Math.fround(o), Math.fround(o + th.drum_seconds), pr.drum[t * P + p]]);
  }
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out;
}

// ---------------------------------------------------------------- MIDI (fixed 120 BPM, PPQ 480)
const vlq = n => { n = Math.max(0, Math.round(n)); const o = [n & 127]; n >>= 7; while (n) { o.push((n & 127) | 128); n >>= 7; } return o.reverse(); };
const chunk = (id, data) => { const h = [...id].map(c => c.charCodeAt(0)), L = data.length; return [...h, L >>> 24 & 255, L >>> 16 & 255, L >>> 8 & 255, L & 255, ...data]; };
function track(events) {
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const d = []; let last = 0;
  for (const [tick, , msg] of events) { d.push(...vlq(tick - last), ...msg); last = tick; }
  d.push(0, 0xff, 0x2f, 0); return chunk("MTrk", d);
}
const FAM = ["Piano", "Chromatic Perc", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth Lead", "Synth Pad", "Synth FX", "Ethnic", "Percussive", "SFX"];
export function writeMidi(notes, velocity = 90, ppq = 480, bpm = 120) {
  const us = Math.round(60e6 / bpm), tps = ppq * 1e6 / us, tick = t => Math.round(t * tps);
  const tracks = [track([[0, 0, [0xff, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255]], [0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]]])];
  const progs = [...new Set(notes.map(n => n[1]))].sort((a, b) => a - b), melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; let mi = 0;
  for (const prog of progs) {
    let ch, name, ev;
    if (prog === DRUM) { ch = 9; name = "Drums"; ev = [[0, 0, [0xff, 3, ...vlq(name.length), ...[...name].map(c => c.charCodeAt(0))]]]; }
    else { ch = melodic[mi++ % 15]; name = `${FAM[prog >> 3]} (program ${prog})`;
      ev = [[0, 0, [0xff, 3, ...vlq(name.length), ...[...name].map(c => c.charCodeAt(0))]], [0, 1, [0xc0 | ch, prog & 127]]]; }
    for (const n of notes) if (n[1] === prog) {
      const a = tick(n[2]); let b = tick(n[3]); b = Math.max(b, a + 1); const p = n[0] & 127;
      ev.push([a, 3, [0x90 | ch, p, velocity]], [b, 2, [0x80 | ch, p, 0]]);
    }
    tracks.push(track(ev));
  }
  const header = chunk("MThd", [0, 1, (tracks.length) >> 8 & 255, tracks.length & 255, ppq >> 8, ppq & 255]);
  return new Uint8Array([...header, ...tracks.flat()]);
}
