(() => {
  "use strict";

  // 자유 편집: 설정이 반영된 결과 MML을 사용자가 고치면, 그 수정을 "설정 적용 전" 원본 쪽으로 역계산한다.
  // Player의 설정 단계(볼륨 생성·쉼표 정리·볼륨·옥타브·앞 공백·템포·페이드)는 채널 안의 노트 개수와 순서를 바꾸지 않으므로
  // 원본의 n번째 노트 = 결과의 n번째 노트로 짝을 짓고, 노트마다 "결과 - 원본" 차이(음높이·길이·볼륨·앞 간격)를 그대로 되돌린다.
  // 히스토리는 없다. 입력은 (현재 원본, 수정 전 결과, 수정한 결과) 세 개뿐이고, 출력은 새 원본이다.
  const VERSION = "1.2.0";
  const TPB = 192; // 1박 = 192틱 (64분음표·셋잇단까지 정수)
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];
  const LENGTHS = (() => {
    const list = [];
    for (const n of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]) {
      let ticks = (4 / n) * TPB;
      let add = ticks / 2;
      for (let dots = 0; dots <= 2; dots++) {
        if (Number.isInteger(ticks)) list.push({ ticks, text: `${n}${".".repeat(dots)}` });
        ticks += add;
        add /= 2;
      }
    }
    return list.sort((a, b) => b.ticks - a.ticks);
  })();

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const toTicks = beats => Math.max(0, Math.round((Number(beats) || 0) * TPB));

  function parser() {
    const api = window.MabiMml;
    if (typeof api?.parseMmlPart !== "function" || typeof api?.splitMmlParts !== "function") throw new Error("MML parser is not loaded.");
    return api;
  }

  function splitParts(mml) {
    const parts = parser().splitMmlParts(String(mml || "")).slice(0, 6).map(part => String(part || ""));
    while (parts.length < 6) parts.push("");
    return parts;
  }

  // 채널 하나를 "앞 간격 + 노트" 목록으로 읽는다.
  function readPart(text, index) {
    const parsed = parser().parseMmlPart(String(text || ""), index);
    const notes = parsed.notes.slice().sort((a, b) => a.beat - b.beat);
    let prevEnd = 0;
    const seq = notes.map(note => {
      const start = toTicks(note.beat);
      const item = { midi: note.midi, dur: toTicks(note.duration), vol: Number(note.volume) || 0, gap: Math.max(0, start - prevEnd), start };
      prevEnd = start + item.dur;
      return item;
    });
    const tempos = parsed.tempos.map(tempo => ({ tick: toTicks(tempo.beat), bpm: Number(tempo.bpm) || 120 }));
    return { seq, tempos, endTick: toTicks(parsed.lengthBeats) };
  }

  const sameKey = (a, b) => a.midi === b.midi && a.dur === b.dur;

  // 수정 전 결과(R)와 수정한 결과(E)의 노트 정렬. 공통 앞뒤를 잘라낸 가운데만 LCS로 맞춘다.
  function alignNotes(R, E) {
    let head = 0;
    while (head < R.length && head < E.length && sameKey(R[head], E[head])) head++;
    let tail = 0;
    while (tail < R.length - head && tail < E.length - head && sameKey(R[R.length - 1 - tail], E[E.length - 1 - tail])) tail++;
    const ops = [];
    for (let i = 0; i < head; i++) ops.push({ type: "keep", r: i, e: i });
    const r0 = head, r1 = R.length - tail, e0 = head, e1 = E.length - tail;
    const n = r1 - r0, m = e1 - e0;
    if (n * m > 4_000_000) throw Object.assign(new Error("edit too large"), { code: "too-large" });
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = sameKey(R[r0 + i], E[e0 + j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const middle = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && sameKey(R[r0 + i], E[e0 + j])) { middle.push({ type: "keep", r: r0 + i, e: e0 + j }); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { middle.push({ type: "insert", e: e0 + j }); j++; }
      else { middle.push({ type: "delete", r: r0 + i }); i++; }
    }
    // 붙어 있는 삭제+삽입은 "그 노트를 고친 것"으로 본다(음높이·길이 수정).
    for (let k = 0; k < middle.length; k++) {
      const run = [];
      while (k < middle.length && middle[k].type !== "keep") run.push(middle[k++]);
      const dels = run.filter(op => op.type === "delete");
      const ins = run.filter(op => op.type === "insert");
      const pairs = Math.min(dels.length, ins.length);
      for (let p = 0; p < pairs; p++) ops.push({ type: "keep", r: dels[p].r, e: ins[p].e });
      for (let p = pairs; p < dels.length; p++) ops.push(dels[p]);
      for (let p = pairs; p < ins.length; p++) ops.push(ins[p]);
      if (k < middle.length) ops.push(middle[k]);
    }
    for (let t = 0; t < tail; t++) ops.push({ type: "keep", r: r1 + t, e: e1 + t });
    return ops;
  }

  function lengthTokens(ticks) {
    const out = [];
    let left = Math.round(ticks);
    for (const item of LENGTHS) {
      while (left >= item.ticks) { out.push(item.text); left -= item.ticks; }
    }
    return out;
  }

  // 새 원본 채널을 MML로 쓴다(간격은 쉼표, 길이는 붙임줄, 템포는 원래 붙어 있던 노트 앞에).
  function writePart(seq, temposBefore, trailingTempos) {
    let text = "";
    let octave = null;
    let volume = null;
    const writeTempos = list => { for (const bpm of list || []) text += `t${bpm}`; };
    seq.forEach((item, index) => {
      writeTempos(temposBefore.get(index));
      if (item.gap > 0) text += lengthTokens(item.gap).map(len => `r${len}`).join("");
      if (item.vol !== volume) { text += `v${item.vol}`; volume = item.vol; }
      const midi = clamp(item.midi, 12, 131);
      const noteOctave = Math.floor(midi / 12) - 1;
      if (noteOctave !== octave) { text += `o${noteOctave}`; octave = noteOctave; }
      const name = NOTE_NAMES[midi % 12];
      const tokens = lengthTokens(item.dur);
      text += (tokens.length ? tokens : ["64"]).map(len => `${name}${len}`).join("&");
    });
    writeTempos(trailingTempos);
    return text;
  }

  // 길이를 줄이고 정리한다. 템포가 없는 채널만 최적화기에 맡긴다(최적화기는 템포를 1채널로 모으기 때문).
  function compactPart(text, index, hasTempo) {
    const optimizer = window.MabiOptimizer;
    if (typeof optimizer?.optimizeMml !== "function") return text;
    try {
      if (index === 0) return optimizer.optimizeMml(`MML@${text};`, { partCount: 1 }).parts[0] || text;
      if (hasTempo) return text;
      const parts = ["", "", "", "", "", ""];
      parts[index] = text;
      return optimizer.optimizeMml(`MML@${parts.join(",")};`, { partCount: 6 }).parts[index] || text;
    } catch (_) {
      return text;
    }
  }

  function invertPart(sourceText, baseText, editedText, index) {
    const S = readPart(sourceText, index);
    const R = readPart(baseText, index);
    const E = readPart(editedText, index);
    if (S.seq.length !== R.seq.length) throw Object.assign(new Error("note count mismatch"), { code: "unmapped", part: index });
    const tempoEdited = R.tempos.length !== E.tempos.length || R.tempos.some((tempo, i) => tempo.bpm !== E.tempos[i].bpm);

    // 원본 템포는 그 뒤 첫 노트에 붙여 둔다(노트가 지워지면 다음 노트로).
    const tempoAnchor = new Map();
    const trailing = [];
    for (const tempo of S.tempos) {
      const at = S.seq.findIndex(item => item.start >= tempo.tick);
      if (at < 0) trailing.push(tempo.bpm);
      else tempoAnchor.set(at, [...(tempoAnchor.get(at) || []), tempo.bpm]);
    }

    const ops = alignNotes(R.seq, E.seq);
    const out = [];
    const temposBefore = new Map();
    let carryTempos = [];
    let lastDelta = null;
    const nextDelta = (from) => {
      for (let k = from; k < ops.length; k++) if (ops[k].type === "keep") return deltaOf(ops[k].r);
      return null;
    };
    const deltaOf = r => ({ midi: S.seq[r].midi - R.seq[r].midi, vol: S.seq[r].vol - R.seq[r].vol });
    ops.forEach((op, k) => {
      if (op.type === "delete") {
        carryTempos = carryTempos.concat(tempoAnchor.get(op.r) || []);
        return;
      }
      let item;
      if (op.type === "keep") {
        const s = S.seq[op.r], r = R.seq[op.r], e = E.seq[op.e];
        const delta = deltaOf(op.r);
        lastDelta = delta;
        item = {
          midi: e.midi + delta.midi,
          dur: s.dur + (e.dur - r.dur) > 0 ? s.dur + (e.dur - r.dur) : e.dur,
          vol: clamp(e.vol + delta.vol, 0, 15),
          gap: Math.max(0, s.gap + (e.gap - r.gap))
        };
        carryTempos = carryTempos.concat(tempoAnchor.get(op.r) || []);
      } else {
        const e = E.seq[op.e];
        const delta = lastDelta || nextDelta(k) || { midi: 0, vol: 0 };
        item = { midi: e.midi + delta.midi, dur: e.dur, vol: clamp(e.vol + delta.vol, 0, 15), gap: e.gap };
      }
      if (carryTempos.length) { temposBefore.set(out.length, carryTempos); carryTempos = []; }
      out.push(item);
    });
    const text = writePart(out, temposBefore, trailing.concat(carryTempos));
    return { text: compactPart(text, index, S.tempos.length > 0), tempoEdited };
  }

  // sourceMml: 지금 원본(수정본), baseResult: 수정 전 결과, editedResult: 사용자가 고친 결과.
  // 반환: { source(새 원본 MML 문자열 아님, 채널 배열), changedParts, tempoEdited }
  // options.skipUnmapped: 짝을 지을 수 없는 채널은 오류 대신 editedResult 쪽 채널을 그대로 쓰고 droppedParts에 넣는다.
  function invert(sourceMml, baseResult, editedResult, options = {}) {
    const sourceParts = splitParts(sourceMml);
    const baseParts = splitParts(baseResult);
    const editedParts = splitParts(editedResult);
    const nextParts = sourceParts.slice();
    const changedParts = [];
    const droppedParts = [];
    let tempoEdited = false;
    for (let index = 0; index < 6; index++) {
      if (String(baseParts[index]).trim() === String(editedParts[index]).trim()) continue;
      changedParts.push(index);
      // 원본과 기준이 같은 채널(설정·수정이 없는 채널)은 고친 내용을 그대로 쓴다.
      if (String(sourceParts[index]).trim() === String(baseParts[index]).trim()) { nextParts[index] = editedParts[index]; continue; }
      try {
        const result = invertPart(sourceParts[index], baseParts[index], editedParts[index], index);
        nextParts[index] = result.text;
        tempoEdited = tempoEdited || result.tempoEdited;
      } catch (error) {
        if (!options.skipUnmapped || !error?.code) throw error;
        nextParts[index] = editedParts[index];
        droppedParts.push(index);
      }
    }
    return { parts: nextParts, changedParts, droppedParts, tempoEdited };
  }

  // ---- 원본이 바뀌었을 때: 수정본(M) = 옛 원본(O) + 자유 편집 수정. 새 원본(N)에 같은 수정을 얹는다(3-way, 노트 단위).
  function mapOps(ops) {
    const kept = new Map();      // O 번호 -> 대상 번호
    const inserts = new Map();   // O 기준 위치(-1 = 맨 앞) -> 대상 번호들
    let anchor = -1;
    for (const op of ops) {
      if (op.type === "keep") { kept.set(op.r, op.e); anchor = op.r; }
      else if (op.type === "delete") anchor = op.r;
      else inserts.set(anchor, [...(inserts.get(anchor) || []), op.e]);
    }
    return { kept, inserts };
  }

  function mergePart(oldText, modifiedText, newText, index) {
    const O = readPart(oldText, index), M = readPart(modifiedText, index), N = readPart(newText, index);
    const toM = mapOps(alignNotes(O.seq, M.seq));
    const toN = mapOps(alignNotes(O.seq, N.seq));
    // 새 원본의 템포는 그 뒤 첫 노트에 붙인다.
    const tempoAnchor = new Map();
    const trailing = [];
    for (const tempo of N.tempos) {
      const at = N.seq.findIndex(item => item.start >= tempo.tick);
      if (at < 0) trailing.push(tempo.bpm);
      else tempoAnchor.set(at, [...(tempoAnchor.get(at) || []), tempo.bpm]);
    }
    const out = [];
    const temposBefore = new Map();
    let carry = [];
    const push = (item, nIndex) => {
      if (nIndex != null) carry = carry.concat(tempoAnchor.get(nIndex) || []);
      if (carry.length) { temposBefore.set(out.length, carry); carry = []; }
      out.push({ midi: item.midi, dur: item.dur, vol: item.vol, gap: item.gap });
    };
    for (let a = -1; a < O.seq.length; a++) {
      for (const j of toN.inserts.get(a) || []) push(N.seq[j], j);
      for (const k of toM.inserts.get(a) || []) push(M.seq[k], null);
      const i = a + 1;
      if (i >= O.seq.length) break;
      const j = toN.kept.get(i);
      const k = toM.kept.get(i);
      if (j == null) continue;                       // 새 원본에서 지운 노트
      if (k == null) { carry = carry.concat(tempoAnchor.get(j) || []); continue; } // 자유 편집에서 지운 노트
      const o = O.seq[i], m = M.seq[k], n = N.seq[j];
      const dur = n.dur + (m.dur - o.dur);
      push({ midi: n.midi + (m.midi - o.midi), dur: dur > 0 ? dur : n.dur, vol: clamp(n.vol + (m.vol - o.vol), 0, 15), gap: Math.max(0, n.gap + (m.gap - o.gap)) }, j);
    }
    return compactPart(writePart(out, temposBefore, trailing.concat(carry)), index, N.tempos.length > 0);
  }

  function merge(modifiedMml, oldOriginal, newOriginal) {
    const M = splitParts(modifiedMml), O = splitParts(oldOriginal), N = splitParts(newOriginal);
    const parts = M.slice();
    const droppedParts = [];
    for (let index = 0; index < 6; index++) {
      const o = String(O[index]).trim(), m = String(M[index]).trim(), n = String(N[index]).trim();
      if (o === n) continue;                 // 원본이 안 바뀐 채널: 수정본 그대로
      if (o === m) { parts[index] = N[index]; continue; } // 자유 편집이 없던 채널: 새 원본 그대로
      try { parts[index] = mergePart(O[index], M[index], N[index], index); }
      catch (_) { parts[index] = N[index]; droppedParts.push(index); }
    }
    return { parts, droppedParts };
  }

  // 역계산한 원본에 설정을 다시 적용한 결과(actual)가 사용자가 쓴 결과(expected)와 노트 단위로 얼마나 다른지 센다.
  function countMismatches(expectedMml, actualMml, partIndexes = [0, 1, 2, 3, 4, 5]) {
    const expected = splitParts(expectedMml);
    const actual = splitParts(actualMml);
    let mismatched = 0;
    for (const index of partIndexes) {
      let a, b;
      try { a = readPart(expected[index], index).seq; b = readPart(actual[index], index).seq; } catch (_) { mismatched += 1; continue; }
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i++) {
        const x = a[i], y = b[i];
        if (!x || !y || x.midi !== y.midi || x.dur !== y.dur || x.start !== y.start || x.vol !== y.vol) mismatched += 1;
      }
    }
    return mismatched;
  }

  window.MabiFreeEdit = Object.freeze({ version: VERSION, invert, merge, countMismatches, splitParts });
})();
