/* MML 6채널 정리 엔진 — 규칙 기반 (MML 채널 정리기 v2 엔진, MobiBard 공용)
 * 입력: MIDI ArrayBuffer + 옵션 { total(1-6), mainCount(1-3), mainInst, slotInst[], cymbal:{on,density}, drum:{on,density} }
 * 출력: { tracks, report, midiBytes }
 *
 * MobiBard 확장(원본 동작은 기본값에서 그대로):
 *   - arrangeSource(src, opt): 이미 읽은 MIDI({ div, notes:[{s,e,p,v,ch}], tempos:[[tick,us]], tsigs:[[tick,n,d]], progs:{ch:prog} })로 정리
 *   - opt.gridPerBeat: 정리 격자(4분음표당 칸 수). 4=16분음표(기본), 8=32분음표, 16=64분음표
 *   - 전역 이름: window.MabiArranger (원본 이름 window.MMLEngine 도 함께 둡니다)
 */
(function (root) {
'use strict';

// ------------------------------------------------------------ MIDI 읽기/쓰기
function readVlq(d, i) { let v = 0, b; do { b = d[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return [v, i]; }
function vlq(v) { const out = [v & 0x7f]; v >>>= 7; while (v) { out.push((v & 0x7f) | 0x80); v >>>= 7; } return out.reverse(); }

function parseMidi(buf) {
  const d = new Uint8Array(buf);
  const str = (a, b) => String.fromCharCode(...d.slice(a, b));
  if (str(0, 4) !== 'MThd') throw new Error('MIDI 파일이 아닙니다.');
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const hl = dv.getUint32(4), ntr = dv.getUint16(10), div = dv.getUint16(12);
  if (div & 0x8000) throw new Error('SMPTE 시간 단위 MIDI는 지원하지 않습니다.');
  let i = 8 + hl;
  const notes = [], tempos = [], tsigs = [], progs = {};
  for (let k = 0; k < ntr && i < d.length; k++) {
    if (str(i, i + 4) !== 'MTrk') break;
    const L = dv.getUint32(i + 4); let j = i + 8; const end = j + L; let t = 0, rs = 0;
    const on = new Map();
    while (j < end) {
      let dt; [dt, j] = readVlq(d, j); t += dt;
      const b = d[j];
      if (b === 0xff) {
        const typ = d[j + 1]; let ln; [ln, j] = readVlq(d, j + 2);
        if (typ === 0x51) tempos.push([t, (d[j] << 16) | (d[j + 1] << 8) | d[j + 2]]);
        else if (typ === 0x58) tsigs.push([t, d[j], 2 ** d[j + 1]]);
        j += ln;
      } else if (b === 0xf0 || b === 0xf7) {
        let ln; [ln, j] = readVlq(d, j + 1); j += ln;
      } else {
        if (b & 0x80) { rs = b; j++; }
        const hi = rs & 0xf0, ch = rs & 0x0f;
        const n = (hi === 0xc0 || hi === 0xd0) ? 1 : 2;
        const a1 = d[j], a2 = d[j + 1]; j += n;
        if (hi === 0xc0) { if (!(ch in progs)) progs[ch] = a1; }
        else if (hi === 0x90 || hi === 0x80) {
          const key = ch * 128 + a1;
          const close = () => { const o = on.get(key); if (o && t > o.s) notes.push({ s: o.s, e: t, p: a1, v: o.v, ch }); on.delete(key); };
          if (hi === 0x90 && a2 > 0) { if (on.has(key)) close(); on.set(key, { s: t, v: a2 }); }
          else if (on.has(key)) close();
        }
      }
    }
    i = end;
  }
  notes.sort((a, b) => a.s - b.s || a.p - b.p);
  if (!tempos.length) tempos.push([0, 500000]);
  return { div, notes, tempos, tsigs, progs };
}

function writeMidi(div, tracks) {
  // tracks: [{ name, events:[[tick, [bytes...], order]] }]
  const out = [];
  const push32 = v => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  out.push(...[77, 84, 104, 100]); push32(6); out.push(0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (div >> 8) & 255, div & 255);
  for (const tr of tracks) {
    const evs = tr.events.slice().sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    const body = []; let t = 0;
    const nm = Array.from(new TextEncoder().encode(tr.name));
    body.push(0, 0xff, 0x03, ...vlq(nm.length), ...nm);
    for (const [tk, bytes] of evs) { body.push(...vlq(tk - t), ...bytes); t = tk; }
    body.push(0, 0xff, 0x2f, 0);
    out.push(77, 84, 114, 107); push32(body.length);
    for (let k = 0; k < body.length; k++) out.push(body[k]);
  }
  return new Uint8Array(out);
}

// ------------------------------------------------------------ 악기 표
// aff: 역할별 어울림(0~1)  melody / counter / harmony / bass
const INSTRUMENTS = [
  { id: 'piano',   name: '피아노',        prog: 0,  lo: 21, hi: 108, sus: false, aff: { melody: .8, counter: .7, harmony: 1, bass: .8 } },
  { id: 'harp',    name: '하프',          prog: 46, lo: 24, hi: 103, sus: false, aff: { melody: .6, counter: .7, harmony: 1, bass: .6 } },
  { id: 'lute',    name: '류트(기타)',    prog: 24, lo: 40, hi: 88,  sus: false, aff: { melody: .6, counter: .6, harmony: 1, bass: .5 } },
  { id: 'violin',  name: '바이올린',      prog: 40, lo: 55, hi: 100, sus: true,  aff: { melody: 1, counter: .9, harmony: .5, bass: .1 } },
  { id: 'flute',   name: '플루트',        prog: 73, lo: 60, hi: 96,  sus: true,  aff: { melody: 1, counter: .9, harmony: .4, bass: 0 } },
  { id: 'clarinet',name: '클라리넷',      prog: 71, lo: 50, hi: 91,  sus: true,  aff: { melody: .9, counter: .9, harmony: .6, bass: .2 } },
  { id: 'oboe',    name: '오보에',        prog: 68, lo: 58, hi: 91,  sus: true,  aff: { melody: .9, counter: .8, harmony: .4, bass: .1 } },
  { id: 'trumpet', name: '트럼펫',        prog: 56, lo: 54, hi: 82,  sus: true,  aff: { melody: .9, counter: .7, harmony: .4, bass: .1 } },
  { id: 'harmonica',name:'하모니카',      prog: 22, lo: 60, hi: 96,  sus: true,  aff: { melody: .8, counter: .7, harmony: .6, bass: 0 } },
  { id: 'xylophone',name:'실로폰',        prog: 13, lo: 65, hi: 108, sus: false, aff: { melody: .8, counter: .7, harmony: .5, bass: 0 } },
  { id: 'cello',   name: '첼로',          prog: 42, lo: 36, hi: 76,  sus: true,  aff: { melody: .6, counter: .7, harmony: .7, bass: .8 } },
  { id: 'contrabass',name:'콘트라베이스', prog: 43, lo: 28, hi: 60,  sus: true,  aff: { melody: .1, counter: .2, harmony: .4, bass: 1 } },
  { id: 'tuba',    name: '튜바',          prog: 58, lo: 28, hi: 58,  sus: true,  aff: { melody: .1, counter: .2, harmony: .3, bass: 1 } },
];
const DRUM_INST = [
  { id: 'cymbal', name: '드럼 심벌', drum: 'cymbal' },
  { id: 'bigdrum', name: '드럼 북', drum: 'drum' },
];
const INST_BY_ID = Object.fromEntries([...INSTRUMENTS, ...DRUM_INST].map(x => [x.id, x]));

// GM 프로그램 → 가장 가까운 프리셋 (자동 선택용)
function presetFromProgram(p) {
  if (p == null) return 'piano';
  if (p === 22 || p === 23) return 'harmonica';
  if (p === 42) return 'cello';
  if (p === 43) return 'contrabass';
  if (p === 46) return 'harp';
  if (p === 58) return 'tuba';
  if (p === 68 || p === 69) return 'oboe';
  if (p < 8) return 'piano';
  if (p < 16) return 'xylophone';
  if (p < 24) return 'piano';
  if (p < 32) return 'lute';
  if (p < 40) return 'contrabass';
  if (p < 56) return 'violin';
  if (p < 64) return 'trumpet';
  if (p < 72) return 'clarinet';
  if (p < 80) return 'flute';
  if (p < 88) return 'violin';
  return 'piano';
}
const GM_LABEL = p => {
  if (p == null) return '악기 미지정';
  const special = { 0: '피아노', 9: '글로켄슈필', 10: '뮤직박스', 13: '실로폰', 22: '하모니카', 24: '나일론기타', 25: '스틸기타', 32: '어쿠스틱베이스', 33: '일렉베이스', 40: '바이올린', 41: '비올라', 42: '첼로', 43: '콘트라베이스', 46: '하프', 48: '현악합주', 56: '트럼펫', 58: '튜바', 68: '오보에', 71: '클라리넷', 73: '플루트' };
  if (special[p]) return special[p];
  return ['피아노류', '건반타악기', '오르간', '기타', '베이스', '현악기', '앙상블', '금관', '목관(리드)', '목관(파이프)', '신스리드', '신스패드', '신스효과', '민속악기', '타악기', '효과음'][p >> 3];
};

// ------------------------------------------------------------ 도우미
const LEAD_PROGS = new Set([8,9,10,11,12,13,14,15,22,23,40,41,42,43,44,45,48,49,50,51,52,53,54,55]);
for (let p = 56; p < 88; p++) LEAD_PROGS.add(p);

function chanStats(notes) {
  const by = new Map();
  for (const n of notes) { if (!by.has(n.ch)) by.set(n.ch, []); by.get(n.ch).push(n); }
  const st = {};
  for (const [ch, ns] of by) {
    const ev = []; for (const n of ns) { ev.push([n.s, 1], [n.e, -1]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, last = 0, mono = 0, act = 0;
    for (const [t, dlt] of ev) { if (cur > 0) act += t - last; if (cur === 1) mono += t - last; last = t; cur += dlt; }
    const ps = ns.map(n => n.p);
    st[ch] = { n: ns.length, mean: ps.reduce((a, b) => a + b, 0) / ps.length, lo: Math.min(...ps), hi: Math.max(...ps), mono: act ? mono / act : 1 };
  }
  return st;
}
function guessRole(ch, s, prog) {
  if (ch === 9) return 'drum';
  if (s.mean < 45 || (prog != null && prog >= 32 && prog <= 39)) return 'bass';
  if (prog != null && LEAD_PROGS.has(prog) && s.mean >= 55) return 'lead';
  if (prog == null && s.mono > 0.8 && s.mean >= 64) return 'lead';
  return 'harmony';
}
const copy = (n, o) => Object.assign({ s: n.s, e: n.e, p: n.p, v: n.v, ch: n.ch, oe: n.oe }, o || {});
function dedupe(ns) {
  const m = new Map();
  for (const n of ns) {
    const k = n.s * 128 + n.p, o = m.get(k);
    if (o) { o.e = Math.max(o.e, n.e); o.v = Math.max(o.v, n.v); } else m.set(k, copy(n));
  }
  return [...m.values()].sort((a, b) => a.s - b.s || b.p - a.p);
}
function groupByStart(ns) {
  const m = new Map();
  for (const n of ns) { if (!m.has(n.s)) m.set(n.s, []); m.get(n.s).push(n); }
  return [...m.keys()].sort((a, b) => a - b).map(t => [t, m.get(t)]);
}
function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

// 단선율: 새 음의 key가 더 크면 울리던 음을 자르고 교체
function mono(ns, key, stat) {
  const line = [], rest = []; let cur = null;
  for (const [t, g] of groupByStart(ns)) {
    g.sort((a, b) => cmpKey(key(b), key(a)));
    const best = g[0];
    if (cur && cur.e > t) {
      if (cmpKey(key(best), key(cur)) > 0) { cur.e = t; if (stat) stat.cut++; cur = copy(best); line.push(cur); rest.push(...g.slice(1)); }
      else rest.push(...g);
    } else { cur = copy(best); line.push(cur); rest.push(...g.slice(1)); }
  }
  return [line.filter(n => n.e > n.s), rest];
}
function clean(line) {
  line = line.filter(n => n.e > n.s).sort((a, b) => a.s - b.s || b.p - a.p);
  const out = [];
  for (const n of line) {
    if (out.length && out[out.length - 1].s === n.s) continue;
    if (out.length && out[out.length - 1].e > n.s) out[out.length - 1].e = n.s;
    out.push(n);
  }
  return out.filter(n => n.e > n.s);
}
function stripSpikes(line, g) {
  return line.filter((n, i) => {
    if (n.e - n.s > g || i === 0 || i === line.length - 1) return true;
    const a = line[i - 1], b = line[i + 1];
    return !(Math.abs(n.p - a.p) >= 12 && Math.abs(n.p - b.p) >= 12 && n.s - a.e <= g && b.s - n.e <= g);
  });
}
function importanceOrder(g) {
  g = g.slice().sort((a, b) => b.p - a.p);
  if (g.length <= 2) return g;
  const order = [g[0], g[g.length - 1]], pcs = new Set([g[0].p % 12, g[g.length - 1].p % 12]);
  const mid = g.slice(1, -1).sort((a, b) => (pcs.has(a.p % 12) - pcs.has(b.p % 12)) || b.v - a.v);
  for (const n of mid) { order.push(n); pcs.add(n.p % 12); }
  return order;
}
function* perms(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of perms(rest, k - 1)) yield [arr[i], ...p];
  }
}
// 화음 성부 나누기 (혼합 규칙: 1박 이상 울린 음만 자르고, 아니면 새 음을 버림)
function voices(ns, k, beat, stat) {
  const out = Array.from({ length: k }, () => []), cur = Array(k).fill(null);
  const last = Array.from({ length: k }, (_, i) => 76 - 8 * i);
  for (const [t, g0] of groupByStart(ns)) {
    let g = importanceOrder(g0);
    if (g.length > k) { stat.drop += g.length - k; stat.dropped.push(...g.slice(k)); g = g.slice(0, k); }
    for (let i = 0; i < k; i++) if (cur[i] && cur[i].e > t && g.some(n => n.p === cur[i].p)) cur[i].e = t;
    let active = [...Array(k).keys()].filter(i => cur[i] && cur[i].e > t);
    let need = g.length - (k - active.length);
    if (need > 0) {
      for (const i of active.slice().sort((a, b) => cur[a].s - cur[b].s)) {
        if (need <= 0) break;
        if (t - cur[i].s >= beat) { cur[i].e = t; stat.cut++; need--; }
      }
      if (need > 0) { stat.drop += need; stat.dropped.push(...g.slice(g.length - need)); g = g.slice(0, g.length - need); }
    }
    if (!g.length) continue;
    active = [...Array(k).keys()].filter(i => cur[i] && cur[i].e > t);
    const free = [...Array(k).keys()].filter(i => !active.includes(i));
    g.sort((a, b) => b.p - a.p);
    let best = null, bc = Infinity;
    for (const perm of perms(free, g.length)) {
      const pitch = {}; for (const i of active) pitch[i] = cur[i].p;
      perm.forEach((i, j) => { pitch[i] = g[j].p; });
      const keys = Object.keys(pitch).map(Number);
      let inv = 0; for (const x of keys) for (const y of keys) if (x < y && pitch[x] < pitch[y]) inv++;
      let c = inv * 100; perm.forEach((i, j) => { c += Math.abs(last[i] - g[j].p); });
      if (c < bc) { bc = c; best = perm; }
    }
    best.forEach((i, j) => { cur[i] = copy(g[j]); out[i].push(cur[i]); last[i] = g[j].p; });
  }
  return out.map(v => v.filter(n => n.e > n.s));
}
function bestShift(line, lo, hi) {
  if (!line.length) return 0;
  let best = 0, bs = -1;
  for (const sh of [0, -12, 12, -24, 24]) {
    const inr = line.filter(n => n.p + sh >= lo && n.p + sh <= hi).length / line.length;
    const sc = inr - Math.abs(sh) / 12 * 0.08;
    if (sc > bs + 1e-9) { bs = sc; best = sh; }
  }
  return best;
}
function rangeFit(line, inst) {
  if (!inst || !line.length) return 1;
  const sh = bestShift(line, inst.lo, inst.hi);
  const inr = line.filter(n => n.p + sh >= inst.lo && n.p + sh <= inst.hi).length / line.length;
  return inr * (1 - Math.abs(sh) / 12 * 0.1);
}
function fold(line, inst) {
  const sh = bestShift(line, inst.lo, inst.hi); let moved = 0;
  const out = line.map(n => {
    let p = n.p + sh;
    while (p < inst.lo) p += 12; while (p > inst.hi) p -= 12;
    if (p !== n.p) moved++;
    return copy(n, { p });
  });
  return { line: out, shift: sh, moved };
}

// ============================================================ v2 엔진
/* 채널 한도
 * 아래 두 숫자는 엔진의 한계가 아니라 "마비노기 MML 스펙" 때문에 두는 값이다.
 *   - 합주 악보 전체에서 쓸 수 있는 MML 채널은 최대 6개
 *   - 메인 주자 1명만 한 악기로 최대 3채널(1,2,3번)을 쓰고, 나머지 주자는 1채널씩
 * 엔진(arrange) 자체는 채널 수와 주자별 채널 수에 제한이 없다. 다른 용도로 쓸 때는
 * 이 상수를 바꾸거나, opt.players 로 주자 구성을 직접 넘기면 된다. (화면은 이 상수로 버튼을 만든다.)
 */
const MABINOGI_LIMITS = { totalChannels: 6, mainPlayerChannels: 3 };

// 최소 비용 배정 (헝가리안, 행 n ≤ 열 m). 채널이 많아져도 O(n²m)
function hungarian(cost) {
  const n = cost.length; if (!n) return new Int32Array(0);
  const m = cost[0].length, u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Int32Array(n); for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

/* 주자 구성
 * 일반형: opt.players = [{ channels: 3, inst: 'auto' | 악기id }, { channels: 1, inst: 'flute' }, { drum: 'cymbal' | 'drum', density }, ...]
 *   - 드럼이 아닌 첫 주자가 메인 주자(주선율 우선). 주자 수, 주자별 채널 수 모두 제한 없음.
 * 간편형(마비노기 화면용): total, mainCount, mainInst, rows(또는 slotInst + cymbal/drum) → 위 형태로 바꾼다.
 */
function normalizePlayers(opt, warnings) {
  let players;
  if (opt.players) players = opt.players.map(p => Object.assign({}, p));
  else {
    const rows = opt.rows ? opt.rows.slice() : (opt.slotInst || []).concat(opt.cymbal && opt.cymbal.on ? ['cymbal'] : [], opt.drum && opt.drum.on ? ['bigdrum'] : []);
    const nDrum = (opt.cymbal && opt.cymbal.on ? 1 : 0) + (opt.drum && opt.drum.on ? 1 : 0);
    const Nmel = opt.total - nDrum;
    if (Nmel < 1) throw new Error('선율 악기에 쓸 채널이 없습니다. 채널 수를 늘리거나 드럼을 하나 빼세요.');
    const M = Math.min(opt.mainCount, Nmel);
    if (M < opt.mainCount) warnings.push(`드럼 채널을 빼면 선율 채널이 ${Nmel}개뿐이라 메인 주자 채널을 ${M}개로 줄였습니다.`);
    players = [{ channels: M, inst: opt.mainInst || 'auto' }];
    let singles = Nmel - M; const seen = new Set();
    for (const id of rows) {
      if (id === 'cymbal' || id === 'bigdrum') {
        const o = id === 'cymbal' ? opt.cymbal : opt.drum;
        if (o && o.on && !seen.has(id)) { seen.add(id); players.push({ drum: id === 'cymbal' ? 'cymbal' : 'drum', density: o.density || 'max' }); }
      } else if (singles > 0) { singles--; players.push({ channels: 1, inst: id || 'auto' }); }
    }
    while (singles-- > 0) players.push({ channels: 1, inst: 'auto' });
    if (opt.cymbal && opt.cymbal.on && !seen.has('cymbal')) players.push({ drum: 'cymbal', density: opt.cymbal.density || 'max' });
    if (opt.drum && opt.drum.on && !seen.has('bigdrum')) players.push({ drum: 'drum', density: opt.drum.density || 'max' });
  }
  const mel = players.filter(p => !p.drum && p.channels > 0);
  if (!mel.length) throw new Error('선율 악기 주자가 한 명은 있어야 합니다.');
  mel.forEach((p, i) => { p.main = i === 0; });
  return players.filter(p => p.drum || p.channels > 0);
}
const cp = (n, o) => Object.assign({}, n, o);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 각 음이 시작할 때, 함께 울리는 음 중 더 높은(dir=1)/낮은(dir=-1) 음의 수
function sweepRank(c, dir, counts) {
  const out = new Float64Array(c.length); let active = [], i = 0;
  while (i < c.length) {
    let j = i; const t = c[i].s;
    while (j < c.length && c[j].s === t) j++;
    active = active.filter(k => c[k].e > t);
    for (let k = i; k < j; k++) active.push(k);
    for (let k = i; k < j; k++) {
      let r = 0; const n = c[k];
      for (const a of active) { const o = c[a]; if (a !== k && dir * (o.p - n.p) > 0 && counts(o, n)) r++; }
      out[k] = r;
    }
    i = j;
  }
  return out;
}
// 곡 전체에서 (음 점수 합 - 연결 비용 합)이 최대인 단선율 경로
function trace(c, node, P) {
  const N = c.length; if (!N) return [];
  const best = new Float64Array(N), prev = new Int32Array(N).fill(-1);
  let pm = 0, pmArg = -1, ptr = 0;
  for (let j = 0; j < N; j++) {
    const nj = c[j];
    while (ptr < j && c[ptr].s < nj.s - P.W) { if (best[ptr] > pm) { pm = best[ptr]; pmArg = ptr; } ptr++; }
    let b = pm, a = pmArg, cnt = 0;
    for (let i = j - 1; i >= ptr && cnt < 96; i--) {
      const ni = c[i]; if (ni.s >= nj.s) continue; cnt++;
      const ov = ni.e - nj.s;
      let cost = ov <= P.G ? 0 : P.trunc * Math.min(1, ov / (ni.e - ni.s));
      const iv = Math.abs(nj.p - ni.p);
      if (iv > P.intFree) cost += Math.min(P.intCap, (iv - P.intFree) * P.intSlope);
      if (iv > 12) cost += P.leap;
      if (ni.ch !== nj.ch) cost += P.sw;
      const v = best[i] - cost;
      if (v > b) { b = v; a = i; }
    }
    best[j] = node[j] + b; prev[j] = a;
  }
  let end = 0; for (let j = 1; j < N; j++) if (best[j] > best[end]) end = j;
  if (best[end] <= 0) return [];
  const path = []; for (let k = end; k >= 0; k = prev[k]) path.push(c[k]);
  return path.reverse();
}

function pickOrder(g, cov) {
  g = g.slice().sort((a, b) => b.p - a.p);
  if (g.length <= 1) return g;
  const pcs = new Set(cov);
  const sc = n => (pcs.has(n.p % 12) ? 0 : 2) + n.v / 127 + (n.dup > 1 ? .3 : 0);
  const order = []; const pool = g.slice();
  while (pool.length) {
    let bi = 0; for (let i = 1; i < pool.length; i++) if (sc(pool[i]) > sc(pool[bi])) bi = i;
    const n = pool.splice(bi, 1)[0]; order.push(n); pcs.add(n.p % 12);
  }
  return order;
}
function voices2(ns, k, beat, stat, covAt) {
  const out = Array.from({ length: k }, () => []), cur = Array(k).fill(null);
  const last = Array.from({ length: k }, (_, i) => 72 - 7 * i);
  const all = [...Array(k).keys()];
  for (const [t, g0] of groupByStart(ns)) {
    let g = pickOrder(g0, covAt(t));
    if (g.length > k) { stat.drop += g.length - k; stat.dropped.push(...g.slice(k)); g = g.slice(0, k); }
    for (const i of all) if (cur[i] && cur[i].e > t && g.some(n => n.p === cur[i].p)) cur[i].e = t;
    let active = all.filter(i => cur[i] && cur[i].e > t);
    let need = g.length - (k - active.length);
    if (need > 0) {
      for (const i of active.slice().sort((a, b) => cur[a].s - cur[b].s)) {
        if (need <= 0) break;
        if (t - cur[i].s >= beat) { cur[i].e = t; stat.cut++; need--; }
      }
      if (need > 0) { stat.drop += need; stat.dropped.push(...g.slice(g.length - need)); g = g.slice(0, g.length - need); }
    }
    if (!g.length) continue;
    active = all.filter(i => cur[i] && cur[i].e > t);
    const free = all.filter(i => !active.includes(i));
    g.sort((a, b) => b.p - a.p);
    // 높은 음 → 위 성부 순서를 지키면서, 울리는 성부와의 교차와 이동 거리가 최소가 되게 배정 (성부 수 제한 없음)
    const F = free.length, L = g.length, cst = (vi, n) => {
      let c = Math.abs(last[vi] - n.p);
      for (const a of active) if ((a < vi && cur[a].p < n.p) || (a > vi && cur[a].p > n.p)) c += 100;
      return c;
    };
    const dp = Array.from({ length: F + 1 }, () => new Float64Array(L + 1).fill(Infinity));
    for (let i = 0; i <= F; i++) dp[i][0] = 0;
    for (let i = 1; i <= F; i++) for (let j = 1; j <= Math.min(i, L); j++)
      dp[i][j] = Math.min(dp[i - 1][j], dp[i - 1][j - 1] + cst(free[i - 1], g[j - 1]));
    const best = Array(L);
    for (let i = F, j = L; j > 0; i--) if (dp[i][j] !== dp[i - 1][j]) { best[j - 1] = free[i - 1]; j--; }
    best.forEach((i, j) => { cur[i] = cp(g[j]); out[i].push(cur[i]); last[i] = g[j].p; });
  }
  return out.map(v => v.filter(n => n.e > n.s));
}

const CYM_TYPE = { 49: 1, 57: 1, 52: .9, 55: .9, 51: .6, 59: .6, 53: .55, 46: .5, 42: .3, 44: .25 };
const DRUM_TYPE = { 36: 1, 35: 1, 38: .7, 40: .7, 37: .4, 39: .45, 41: .6, 43: .6, 45: .55, 47: .55, 48: .55, 50: .55 };
function drumLine(drumNotes, typeMap, outPitch, density, G, div, metric, barOf) {
  const hits = new Map();
  for (const n of drumNotes) {
    const w = typeMap[n.p]; if (w == null) continue;
    const sc = .45 * w + .35 * metric(n.s) + .2 * n.v / 127;
    const o = hits.get(n.s);
    if (!o || sc > o.sc) hits.set(n.s, { t: n.s, v: Math.max(n.v, o ? o.v : 0), sc });
  }
  let arr = [...hits.values()].sort((a, b) => a.t - b.t); const total = arr.length;
  if (density !== 'max') {
    const frac = density === 'mid' ? .55 : .22, gap = density === 'mid' ? div / 2 : div;
    const bars = new Map();
    for (const h of arr) { const b = barOf(h.t); if (!bars.has(b)) bars.set(b, []); bars.get(b).push(h); }
    const picked = [];
    for (const hs of bars.values()) {
      const target = density === 'mid' ? Math.ceil(hs.length * frac) : Math.max(1, Math.round(hs.length * frac));
      const sel = [];
      for (const h of hs.slice().sort((a, b) => b.sc - a.sc)) {
        if (sel.length >= target) break;
        if (sel.every(o => Math.abs(o.t - h.t) >= gap)) sel.push(h);
      }
      picked.push(...sel);
    }
    picked.sort((a, b) => a.t - b.t); arr = [];
    for (const h of picked) {
      const l = arr[arr.length - 1];
      if (l && h.t - l.t < gap) { if (h.sc > l.sc) arr[arr.length - 1] = h; } else arr.push(h);
    }
  }
  return { line: arr.map(h => ({ s: h.t, e: h.t + G, p: outPitch, v: h.v, ch: 9 })), total };
}

const ROLE_WEIGHT = { melody: 10, bass: 6, counter: 3.5 };
const roleWeight = r => ROLE_WEIGHT[r] || Math.max(1, 4.5 - 0.7 * (+r.slice(7)));
const ROLE_LABEL = r => r === 'melody' ? '주선율' : r === 'bass' ? '베이스' : r === 'counter' ? '대선율' : '화음 ' + r.slice(7);
const roleType = r => r.startsWith('harmony') ? 'harmony' : r;
function densLabel(d) { return d === 'max' ? '최대' : d === 'mid' ? '중간' : '느슨'; }

function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }

function arrange(buf, opt) {
  return arrangeSource(parseMidi(buf), opt);
}

function arrangeSource(src0, opt) {
  opt = opt || {};
  const GPB = [4, 8, 16].includes(Number(opt.gridPerBeat)) ? Number(opt.gridPerBeat) : 4;
  let src = src0;
  // 격자 한 칸이 정수 틱이 되도록 필요하면 시간 단위를 늘립니다(음 사이 비율은 그대로).
  if (src.div % GPB) {
    const f = GPB / gcdInt(src.div, GPB);
    src = Object.assign({}, src0, {
      div: src0.div * f,
      notes: src0.notes.map(n => Object.assign({}, n, { s: n.s * f, e: n.e * f })),
      tempos: src0.tempos.map(([t, u]) => [t * f, u]),
      tsigs: (src0.tsigs || []).map(([t, a, b]) => [t * f, a, b]),
    });
  }
  const { div, tempos, progs } = src;
  const tsigs = src.tsigs || [];
  const warnings = [], notices = [];
  if (!src.notes.length) throw new Error('노트가 없는 MIDI입니다.');

  // ---- 1. 채널 예산 (주자 구성 → 선율 채널 수)
  const players = normalizePlayers(opt, warnings);
  const melPlayers = players.filter(p => !p.drum);
  const Nmel = melPlayers.reduce((a, p) => a + p.channels, 0);

  // ---- 2. 박자 격자
  const G = div / GPB, endT = Math.max(...src.notes.map(n => n.e));
  let tsN = 4, tsD = 4, tsOrigin = 0;
  if (tsigs.length) {
    const span = new Map(), first = new Map(), pts = [...tsigs, [endT, 0, 0]];
    for (let i = 0; i < tsigs.length; i++) { const k = tsigs[i][1] + '/' + tsigs[i][2]; span.set(k, (span.get(k) || 0) + Math.max(0, pts[i + 1][0] - pts[i][0])); if (!first.has(k)) first.set(k, tsigs[i][0]); }
    const top = [...span].sort((a, b) => b[1] - a[1])[0][0]; [tsN, tsD] = top.split('/').map(Number); tsOrigin = first.get(top);
  }
  const barLen = div * 4 / tsD * tsN;
  let OFF = 0, bestErr = Infinity;
  for (let o = 0; o < G; o += Math.max(1, G / 4)) {
    let err = 0; for (const n of src.notes) { const r = ((n.s - o) % G + G) % G; err += Math.min(r, G - r); }
    if (err < bestErr) { bestErr = err; OFF = o; }
  }
  const q = t => Math.max(0, Math.round((t - OFF) / G) * G);
  const barOrigin = q(tsOrigin) % barLen;
  const barPos = t => (((t - barOrigin) % barLen) + barLen) % barLen;
  const barOf = t => Math.floor((t - barOrigin) / barLen);
  const metric = t => { const p = barPos(t); return p === 0 ? 1 : p % div === 0 ? .7 : p % (div / 2) === 0 ? .45 : .2; };

  const qn = [];
  for (const n of src.notes) {
    if (n.ch !== 9 && n.v < 30 && n.e - n.s <= div / 8) continue;    // 잡음성 음 (32분음표 이하로 짧고 약한 음)
    let a = q(n.s), b = q(n.e); if (b <= a) b = a + G;
    qn.push({ s: a, e: b, p: n.p, v: n.v, ch: n.ch, oe: b, dup: 1 });
  }
  const drumNotes = qn.filter(n => n.ch === 9), pitched = qn.filter(n => n.ch !== 9);

  // ---- 3. 채널 성격 (선율다움 / 베이스다움)
  const st = chanStats(pitched), chF = {};
  for (const ch of Object.keys(st)) {
    const s = st[ch], p = progs[ch];
    const hint = p == null ? .5 : LEAD_PROGS.has(p) ? 1 : .25;
    const isBassProg = p != null && p >= 32 && p <= 39;
    const bass = (s.mean < 48 || isBassProg) ? 1 : clamp((62 - s.mean) / 24, 0, .6);
    const lead = bass === 1 ? 0 : .5 * hint + .25 * s.mono + .25 * clamp((s.mean - 52) / 20, 0, 1);
    chF[ch] = { lead, bass, isLead: lead >= .6 };
  }
  // 같은 시작·같은 음이 여러 채널에 있으면 하나로 합침 (전사 중복)
  const mm = new Map();
  for (const n of pitched) {
    const k = n.s * 128 + n.p, o = mm.get(k);
    if (!o) { mm.set(k, n); continue; }
    const pref = x => n.p < 55 ? chF[x.ch].bass : chF[x.ch].lead;
    if (pref(n) > pref(o)) o.ch = n.ch;
    o.e = Math.max(o.e, n.e); o.oe = o.e; o.v = Math.max(o.v, n.v); o.dup++;
  }
  const all = [...mm.values()].sort((a, b) => a.s - b.s || b.p - a.p);
  all.forEach((n, i) => { n.id = i; });
  const sal = n => .5 * n.v / 127 + .5 * Math.min(n.e - n.s, 2 * div) / (2 * div) + (n.dup > 1 ? .15 : 0);
  const cells = Math.ceil(Math.max(...all.map(n => n.e)) / G) + 2;

  // ---- 4. 주선율: 전체 경로 탐색
  let cands = all.filter(n => chF[n.ch].bass < 1 && n.p >= 52);
  if (!cands.length) cands = all.slice();
  const hasLead = cands.some(n => chF[n.ch].isLead);
  const leadCov = new Int32Array(cells + 1);
  for (const n of cands) if (chF[n.ch].isLead) for (let k = n.s / G; k < n.e / G; k++) leadCov[k + 1] = 1;
  for (let k = 1; k <= cells; k++) leadCov[k] += leadCov[k - 1];
  const T = opt.trust == null ? 1 : opt.trust;   // 1 = 기록된 악기를 믿음, 0 = 문맥만 봄
  const leadOver = n => leadCov[Math.min(cells, n.e / G)] - leadCov[n.s / G] > 0;
  const leadNear = n => { const a = Math.max(0, (n.s - div) / G), b = Math.min(cells, (n.e + div) / G); return leadCov[b] - leadCov[a] > 0; };
  const PM = { W: 2 * barLen, G, trunc: 1.4, intFree: 5, intSlope: .06, intCap: 1.2, leap: .5, sw: .05 + .2 * T };
  const melNode = c => {
    const rk = sweepRank(c, 1, (o, n) => T < .5 || !chF[n.ch].isLead || chF[o.ch].isLead);
    return c.map((n, i) => (rk[i] === 0 ? 1 : rk[i] === 1 ? .1 : -.5) + .8 * sal(n) + (.3 + .9 * T) * chF[n.ch].lead + .45 * (1 - T) - .9
      - (hasLead && !chF[n.ch].isLead ? (leadOver(n) ? .4 + 1.2 * T : leadNear(n) ? 1.6 * T * T : 0) : 0));
  };
  const melody = clean(trace(cands, melNode(cands), PM).map(n => cp(n)));
  const used = new Set(melody.map(n => n.id));
  const atMap = line => { const m = new Map(); for (const n of line) for (let k = n.s / G; k < n.e / G; k++) m.set(k, n.p); return m; };
  const melAt = atMap(melody);

  // ---- 5. 대선율: 남은 선율 악기 음에서 같은 방식으로
  let counter = [];
  if (hasLead) {
    const cc = cands.filter(n => chF[n.ch].isLead && !used.has(n.id) && melAt.get(n.s / G) !== n.p);
    const rk = sweepRank(cc, 1, () => true);
    const node = cc.map((n, i) => (rk[i] === 0 ? 1 : rk[i] === 1 ? .2 : -.4) + .8 * sal(n) + 1.2 * chF[n.ch].lead - .9 - ((melAt.get(n.s / G) ?? 999) < n.p ? .3 : 0));
    counter = clean(trace(cc, node, PM).map(n => cp(n)));
    if (counter.length < Math.max(16, .08 * melody.length)) counter = [];
  }

  // ---- 6. 베이스
  const bc = all.filter(n => !used.has(n.id) && n.p < 60);
  const rkb = sweepRank(bc, -1, () => true);
  const bnode = bc.map((n, i) => (rkb[i] === 0 ? 1 : rkb[i] === 1 ? -.2 : -.8) + .6 * sal(n) + (.4 + .9 * T) * chF[n.ch].bass + .2 * (1 - T) - .9 + (barPos(n.s) === 0 ? .4 : barPos(n.s) % div === 0 ? .25 : 0));
  let bass = clean(trace(bc, bnode, { W: 2 * barLen, G, trunc: 1.2, intFree: 7, intSlope: .03, intCap: .8, leap: 0, sw: .2 }).map(n => cp(n)));
  bass = bass.filter(n => { const m = melAt.get(n.s / G); return m == null || n.p < m - 2; });
  if (bass.length < 8) bass = [];
  const bassAt = atMap(bass);
  for (const n of bass) used.add(n.id);
  const ctrIds = new Set(counter.map(n => n.id));

  // ---- 7. 역할 목록
  const restExists = all.some(n => !used.has(n.id) && !ctrIds.has(n.id) && n.p >= 40);
  const harmAvail = restExists || counter.length > 0;
  const roleList = []; let hk = 0;
  for (let i = 0; roleList.length < Nmel && i < Nmel + 4; i++) {   // 채널 수만큼 화음 성부를 늘림
    const r = ['melody', 'bass', 'h', 'counter'][i] || 'h';
    if (r === 'h') { if (harmAvail && (restExists || !roleList.includes('counter'))) roleList.push('harmony' + (++hk)); }
    else if (r === 'melody' ? melody.length : r === 'bass' ? bass.length : counter.length) roleList.push(r);
  }
  const counterPlaced = roleList.includes('counter');

  // ---- 8. 화음: 주선율 아래로 모으고, 성부로 나눔
  const pool = [];
  for (const n of all) {
    if (used.has(n.id) || (counterPlaced && ctrIds.has(n.id)) || n.p < 40) continue;
    const m = melAt.get(n.s / G), b = bassAt.get(n.s / G); let p = n.p;
    if (m != null) { if (p === m) continue; while (p >= m) p -= 12; }
    if (b != null) { while (p <= b) p += 12; if (m != null && p >= m) continue; }
    if (p < 40) continue;
    pool.push(cp(n, { p }));
  }
  const vstat = { cut: 0, drop: 0, dropped: [] };
  const covAt = t => { const k = t / G, a = []; if (melAt.has(k)) a.push(melAt.get(k) % 12); if (bassAt.has(k)) a.push(bassAt.get(k) % 12); return a; };
  const lines = { melody, bass, counter };
  if (hk) voices2(dedupe(pool), hk, div, vstat, covAt).forEach((v, i) => { lines['harmony' + (i + 1)] = clean(v); });
  const leftovers = vstat.dropped.map(n => cp(n));
  if (!hk) leftovers.push(...pool);
  if (!roleList.includes('bass')) leftovers.push(...bass.map(n => cp(n)));

  // ---- 9. 역할 → 채널 배정 (주자 수·주자별 채널 수 제한 없음)
  const slots = [];
  for (const pl of melPlayers) for (let i = 0; i < pl.channels; i++)
    slots.push({ player: pl, main: pl.main, inst: pl.inst && pl.inst !== 'auto' ? INST_BY_ID[pl.inst] : null });
  const domPreset = {};
  for (const r of roleList) {
    const c = new Map(); for (const n of lines[r]) c.set(progs[n.ch], (c.get(progs[n.ch]) || 0) + 1);
    let bp = null, bn = -1; for (const [p, k] of c) if (k > bn) { bn = k; bp = p; }
    domPreset[r] = presetFromProgram(bp);
  }
  const fitMemo = new Map();
  const instFit = (inst, r, auto) => {
    const key = inst.id + r + auto; if (fitMemo.has(key)) return fitMemo.get(key);
    const v = inst.aff[roleType(r)] * rangeFit(lines[r], inst) * (auto && domPreset[r] === inst.id ? 1.25 : 1);
    fitMemo.set(key, v); return v;
  };
  const autoBest = r => { let bi = null, bs = -1; for (const inst of INSTRUMENTS) { const v = instFit(inst, r, true); if (v > bs + 1e-9) { bs = v; bi = inst; } } return { inst: bi, score: bs }; };
  const fit = (slot, r) => slot.inst ? instFit(slot.inst, r, !!slot.player.autoPick) : autoBest(r).score;
  const gain = (slot, r) => roleWeight(r) * fit(slot, r) + (r === 'melody' && slot.main ? 6 : 0);
  const solve = () => {
    const a = hungarian(roleList.map(r => slots.map(s => -gain(s, r))));
    let sc = 0; roleList.forEach((r, j) => { sc += gain(slots[a[j]], r); });
    return [a, sc];
  };
  // 여러 채널을 쓰는 주자의 악기가 자동이면: 맡게 될 역할들에 가장 잘 맞는 악기를 고름
  for (const pl of melPlayers) {
    if (!(pl.main || pl.channels > 1) || (pl.inst && pl.inst !== 'auto')) continue;
    const mine = slots.filter(s => s.player === pl); let bi = null, bs = -Infinity; pl.autoPick = true;
    for (const inst of INSTRUMENTS) { mine.forEach(s => { s.inst = inst; }); const sc = solve()[1]; if (sc > bs + 1e-9) { bs = sc; bi = inst; } }
    mine.forEach(s => { s.inst = bi; s.auto = true; });
  }
  const assign = solve()[0];
  const slotRole = Array(slots.length).fill(null);
  roleList.forEach((r, j) => { slotRole[assign[j]] = r; });
  slots.forEach((s, i) => { if (!s.inst) { s.inst = slotRole[i] ? autoBest(slotRole[i]).inst : INST_BY_ID.piano; s.auto = true; } });
  const avgP = r => { const l = (r && lines[r]) || []; return l.length ? l.reduce((a, n) => a + n.p, 0) / l.length : -1; };
  for (const pl of melPlayers) {      // 같은 주자 안에서는 주선율 → 높은 음 역할 순으로 채널 정렬
    const ix = slots.map((s, i) => s.player === pl ? i : -1).filter(i => i >= 0); if (ix.length < 2) continue;
    const sorted = ix.map(i => slotRole[i]).sort((a, b) => (b === 'melody') - (a === 'melody') || avgP(b) - avgP(a));
    ix.forEach((i, k) => { slotRole[i] = sorted[k]; });
  }
  const melSlot = slotRole.indexOf('melody');
  if (melSlot >= 0 && !slots[melSlot].main) notices.push(`메인 악기(${slots[0].inst.name})가 주선율 음역·성격에 맞지 않아 주선율을 다른 주자에게 보냈습니다.`);

  const chans = slots.map((s, i) => {
    const r = slotRole[i], f = fold(clean((r ? lines[r] : []).map(n => cp(n))), s.inst);
    return { slot: s, role: r, line: f.line.map((n, k) => Object.assign(n, { oe: n.oe })), shift: f.shift, moved: f.moved, fills: 0 };
  });

  // ---- 10. 남는 음을 쉬는 자리에 (주선율 채널 제외), 잘린 음은 자리가 비면 원래 길이까지 늘임
  if (leftovers.length) {
    const med = chans.map(c => { const ps = c.line.map(n => n.p).sort((a, b) => a - b); return ps.length ? ps[ps.length >> 1] : null; });
    const occ = chans.map(c => c.line.map(n => [n.s, n.e]));
    const isFree = (k, s, e) => { const a = occ[k]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m][1] <= s) lo = m + 1; else hi = m; } return !(lo < a.length && a[lo][0] < e); };
    for (const n of dedupe(leftovers).sort((a, b) => b.v - a.v)) {
      let bk = -1, bd = 99;
      chans.forEach((c, k) => {
        if (!c.role || c.role === 'melody' || c.role === 'counter' || med[k] == null) return;
        if (c.role === 'bass' && n.p >= 60) return;
        const p = n.p + c.shift; if (p < c.slot.inst.lo || p > c.slot.inst.hi) return;
        const d = Math.abs(p - med[k]);
        if (d <= 9 && d < bd && isFree(k, n.s, n.e)) { bd = d; bk = k; }
      });
      if (bk >= 0) { const c = chans[bk]; c.line.push(cp(n, { p: n.p + c.shift })); c.fills++; occ[bk].push([n.s, n.e]); occ[bk].sort((a, b) => a[0] - b[0]); }
    }
    chans.forEach(c => { c.line = clean(c.line); });
  }
  let extended = 0;
  for (const c of chans) for (let i = 0; i < c.line.length; i++) {
    const n = c.line[i], lim = i + 1 < c.line.length ? c.line[i + 1].s : Infinity;
    if (n.oe && n.e < n.oe && lim > n.e) { n.e = Math.min(n.oe, lim); extended++; }
  }

  // ---- 11. 드럼
  const drumPlayers = players.filter(p => p.drum);
  if (drumPlayers.length && !drumNotes.length) warnings.push('원본에 드럼(MIDI 10번 채널)이 없어 드럼 채널이 비어 있습니다.');
  for (const pl of drumPlayers) {
    const isC = pl.drum === 'cymbal', dens = pl.density || 'max';
    const d = drumLine(drumNotes, isC ? CYM_TYPE : DRUM_TYPE, isC ? 49 : 36, dens, G, div, metric, barOf);
    pl.out = { main: false, drum: pl.drum, inst: isC ? '드럼 심벌' : '드럼 북', instId: isC ? 'cymbal' : 'bigdrum',
      role: (isC ? '심벌' : '북') + ' (' + densLabel(dens) + ')', notes: d.line, total: d.total, density: dens, sources: [] };
  }

  // ---- 12. 템포 (평균으로 고정)
  let tot = 0; const tp = tempos.concat([[endT, 0]]);
  for (let i = 0; i < tempos.length; i++) tot += Math.max(0, tp[i + 1][0] - tp[i][0]) * tp[i][1];
  const bpm = Math.round(60e6 / (endT > tempos[0][0] ? tot / (endT - tempos[0][0]) : tempos[0][1]));

  // ---- 13. 출력
  const srcOf = line => { const m = new Map(); for (const n of line) { const k = GM_LABEL(progs[n.ch]); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const out = [];
  players.forEach((pl, pi) => {
    if (pl.drum) { out.push(Object.assign(pl.out, { player: pi + 1 })); return; }
    for (const c of chans) if (c.slot.player === pl) out.push({ player: pi + 1, main: c.slot.main, inst: c.slot.inst.name, instId: c.slot.inst.id, prog: c.slot.inst.prog, auto: !!c.slot.auto,
      role: c.role ? ROLE_LABEL(c.role) : '(쉼)', roleKey: c.role, notes: c.line, shift: c.shift, moved: c.moved, fills: c.fills, sources: srcOf(c.line) });
  });
  out.forEach((c, i) => { c.mml = i + 1; });
  for (const c of out) for (let i = 1; i < c.notes.length; i++) if (c.notes[i - 1].e > c.notes[i].s) throw new Error('내부 오류: 채널 ' + c.mml + ' 노트 겹침');

  // 보존율: 원본(중복 제거) 음 가운데 같은 시점·같은 음이름이 결과에 남은 비율
  const keep = new Set(); for (const c of out) if (!c.drum) for (const n of c.notes) keep.add(n.s * 12 + n.p % 12);
  const preserved = all.filter(n => keep.has(n.s * 12 + n.p % 12)).length / all.length;

  const us = Math.round(60e6 / bpm);
  const midiTracks = [{ name: 'Conductor', events: [[0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255], 0], [0, [0xff, 0x58, 4, tsN, Math.log2(tsD), 24, 8], 0]] }];
  let midiCh = 0;
  for (const c of out) {
    // MIDI는 16채널(10번은 드럼)뿐이라 선율 트랙이 15개를 넘으면 채널 번호를 돌려 쓴다. 트랙은 그대로 분리되어 있다.
    let ch = 9; if (!c.drum) { if (midiCh % 16 === 9) midiCh++; ch = midiCh++ % 16; }
    const evs = []; if (!c.drum) evs.push([0, [0xc0 | ch, c.prog], 0]);
    for (const n of c.notes) { evs.push([n.s, [0x90 | ch, n.p, clamp(n.v, 1, 127)], 1]); evs.push([n.e, [0x80 | ch, n.p, 0], 0]); }
    midiTracks.push({ name: `MML CH${c.mml} P${c.player}${c.main ? '(메인)' : ''} ${c.inst} - ${c.role}`, events: evs });
  }
  // 원본(정렬만 한 것) — 비교용
  const original = Object.keys(st).map(Number).sort((a, b) => a - b).map(ch => ({ mml: 100 + ch, instId: presetFromProgram(progs[ch]), notes: pitched.filter(n => n.ch === ch) }));
  if (drumNotes.length) {
    original.push({ mml: 120, drum: 'cymbal', instId: 'cymbal', notes: drumNotes.filter(n => CYM_TYPE[n.p] != null) });
    original.push({ mml: 121, drum: 'drum', instId: 'bigdrum', notes: drumNotes.filter(n => DRUM_TYPE[n.p] != null) });
  }
  const srcChannels = Object.keys(st).map(Number).sort((a, b) => a - b).map(ch => ({ ch: ch + 1, label: GM_LABEL(progs[ch]), n: st[ch].n, lo: st[ch].lo, hi: st[ch].hi,
    lead: chF[ch].lead, bass: chF[ch].bass, role: chF[ch].bass === 1 ? '베이스' : chF[ch].isLead ? '선율' : '반주' }));
  if (drumNotes.length) srcChannels.push({ ch: 10, label: '드럼', n: drumNotes.length, drum: true, role: '드럼' });
  return { div, bpm, ts: [tsN, tsD], barLen, barOrigin, offset: OFF, grid: G, channels: out, warnings, notices, srcChannels, original,
    srcNoteCount: src.notes.length, preserved, endTick: q(endT),
    trust: T, stats: { merged: pitched.length - all.length, harmCut: vstat.cut, harmDrop: vstat.drop, extended }, midiBytes: writeMidi(div, midiTracks) };
}

const api = { arrange, arrangeSource, parseMidi, INSTRUMENTS, DRUM_INST, densLabel, MABINOGI_LIMITS };
if (typeof module !== 'undefined') module.exports = api; else { root.MabiArranger = api; if (!root.MMLEngine) root.MMLEngine = api; }
})(typeof window !== 'undefined' ? window : globalThis);
