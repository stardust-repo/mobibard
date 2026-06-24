(() => {
  "use strict";
  const { clampInt, formatTime } = window.MabiUtils;
  const NOTE_BASE = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };
  const EPS = 1e-9;

function parseMabinogiMml(text) {
  if (!text.trim()) throw new Error("MML이 비어 있습니다.");
  if (/\[|\]/.test(text)) throw new Error("마비노기 MML에서는 [] 표기를 사용할 수 없습니다. 파트는 쉼표로 나눠 입력해 주세요.");
  const parts = splitMmlParts(text);
  if (parts.length > 6) throw new Error("이 샘플은 최대 6파트까지만 재생합니다.");
  while (parts.length < 6) parts.push("");
  const parsedParts = parts.map((p, i) => parseMmlPart(p, i));
  const tempos = [{ beat: 0, bpm: 120, part: -1, order: -1 }];
  for (const p of parsedParts) tempos.push(...p.tempos);
  tempos.sort((a, b) => a.beat - b.beat || a.order - b.order || a.part - b.part);
  for (const t of tempos) {
    if (t.bpm < 32 || t.bpm > 255) throw new Error(`T${t.bpm}은 지원 범위를 벗어났습니다. 템포는 32~255로 입력해 주세요.`);
  }
  return { parts: parsedParts, tempos: normalizeTempoMap(tempos) };
}

function splitMmlParts(text) {
  let s = String(text || "").trim();
  const m = s.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
  if (m) s = m[1];
  if (s === "") return [];
  return s.split(",").map(x => x.trim());
}

function parseMmlPart(s, partIndex) {
  let i = 0, beat = 0, octave = 4, length = 4, defaultDuration = 1, volume = 8, order = 0;
  let pendingTie = false;
  let lastTieTarget = null;
  const notes = [];
  const tempos = [];
  const readNumber = () => { let start = i; while (i < s.length && /\d/.test(s[i])) i++; return i > start ? Number(s.slice(start, i)) : null; };
  const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const readDots = (base) => { let dur = base, add = base / 2; while (s[i] === ".") { dur += add; add /= 2; i++; } return dur; };
  const readLengthBeats = () => {
    const n = readNumber();
    if (n == null) return readDots(defaultDuration);
    if (!isValidLength(n)) throw new Error(`${partIndex + 1}파트: 길이 ${n}은 지원하지 않습니다. 1,2,4,8,16,32,64를 사용해 주세요.`);
    return readDots(4 / n);
  };
  const readNoteToken = () => {
    skipSpace();
    const ch = s[i]?.toLowerCase();
    if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
    if (ch === "r") { i++; return { rest: true, midi: null, dur: readLengthBeats() }; }
    if (ch === "n") {
      i++;
      const num = readNumber();
      if (num == null) throw new Error(`${partIndex + 1}파트: N 뒤에 음 번호가 필요합니다.`);
      const dur = readDots(defaultDuration);
      if (num === 0) return { rest: true, midi: null, dur };
      return { rest: false, midi: clampInt(num, 0, 127), dur };
    }
    i++;
    let semitone = NOTE_BASE[ch];
    if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
    else if (s[i] === "-") { semitone--; i++; }
    const midi = (octave + 1) * 12 + semitone;
    return { rest: false, midi, dur: readLengthBeats() };
  };
  const applyNoteToken = (token) => {
    if (pendingTie) {
      if (!lastTieTarget) throw new Error(`${partIndex + 1}파트: & 앞에 이어질 음표가 필요합니다.`);
      if (lastTieTarget.rest !== token.rest || lastTieTarget.midi !== token.midi) {
        throw new Error(`${partIndex + 1}파트: &는 같은 음끼리만 이어 주세요.`);
      }
      if (!token.rest) lastTieTarget.note.duration += token.dur;
      beat += token.dur;
      pendingTie = false;
      return;
    }

    if (token.rest) {
      beat += token.dur;
      lastTieTarget = { rest: true, midi: null, note: null };
      return;
    }

    if (token.midi < 0 || token.midi > 127) throw new Error(`${partIndex + 1}파트: 음역이 너무 높거나 낮습니다.`);
    const note = { part: partIndex, beat, duration: token.dur, midi: token.midi, volume };
    notes.push(note);
    beat += token.dur;
    lastTieTarget = { rest: false, midi: token.midi, note };
  };

  while (i < s.length) {
    skipSpace();
    if (i >= s.length) break;
    const ch = s[i].toLowerCase();
    if (ch in NOTE_BASE || ch === "r" || ch === "n") {
      const token = readNoteToken();
      applyNoteToken(token);
    } else if (ch === "&") {
      i++;
      if (!lastTieTarget) throw new Error(`${partIndex + 1}파트: & 앞에 이어질 음표가 필요합니다.`);
      if (pendingTie) throw new Error(`${partIndex + 1}파트: &가 연속으로 나왔습니다.`);
      pendingTie = true;
    } else if (ch === "t") {
      i++; const bpm = readNumber(); if (bpm == null) throw new Error(`${partIndex + 1}파트: T 뒤에 숫자가 필요합니다.`);
      tempos.push({ beat, bpm, part: partIndex, order: order++ });
    } else if (ch === "o") {
      i++; const v = readNumber(); if (v == null) throw new Error(`${partIndex + 1}파트: O 뒤에 숫자가 필요합니다.`);
      if (v < 0 || v > 9) throw new Error(`${partIndex + 1}파트: O${v}는 지원 범위를 벗어났습니다.`); octave = v;
    } else if (ch === "l") {
      i++; const v = readNumber(); if (v == null || !isValidLength(v)) throw new Error(`${partIndex + 1}파트: L은 1,2,4,8,16,32,64 중 하나를 사용해 주세요.`); length = v; defaultDuration = readDots(4 / v);
    } else if (ch === "v") {
      i++; const v = readNumber(); if (v == null) throw new Error(`${partIndex + 1}파트: V 뒤에 숫자가 필요합니다.`);
      if (v < 0 || v > 15) throw new Error(`${partIndex + 1}파트: V${v}는 지원 범위를 벗어났습니다. 0~15를 사용해 주세요.`); volume = v;
    } else if (ch === ">") { i++; octave++; if (octave > 9) throw new Error(`${partIndex + 1}파트: 옥타브가 너무 높습니다.`); }
    else if (ch === "<") { i++; octave--; if (octave < 0) throw new Error(`${partIndex + 1}파트: 옥타브가 너무 낮습니다.`); }
    else if (ch === ";") { i++; break; }
    else { throw new Error(`${partIndex + 1}파트: 알 수 없는 문자 '${s[i]}'가 있습니다.`); }
  }
  if (pendingTie) throw new Error(`${partIndex + 1}파트: & 뒤에 이어질 음표가 필요합니다.`);
  return { notes, tempos, lengthBeats: beat };
}

function normalizeTempoMap(events) {
  const map = [];
  for (const ev of events) {
    const last = map[map.length - 1];
    if (last && Math.abs(last.beat - ev.beat) < EPS) last.bpm = ev.bpm;
    else map.push({ beat: ev.beat, bpm: ev.bpm });
  }
  if (map[0].beat !== 0) map.unshift({ beat: 0, bpm: 120 });
  return map;
}

function buildSchedule(parsed) {
  const notes = [];
  for (const p of parsed.parts) {
    for (const n of p.notes) {
      const start = beatToSeconds(n.beat, parsed.tempos);
      const end = beatToSeconds(n.beat + n.duration, parsed.tempos);
      notes.push({ ...n, start, durationSec: Math.max(0.02, end - start) });
    }
  }
  notes.sort((a, b) => a.start - b.start || a.part - b.part);
  const len = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
  const tempoMarkers = buildTempoMarkers(parsed.tempos, len);
  return {
    notes,
    tempoMarkers,
    summary: `예상 길이 ${formatTime(len)}`
  };
}

function buildTempoMarkers(tempoMap, durationSec) {
  const markers = [];
  if (!Array.isArray(tempoMap) || tempoMap.length === 0 || durationSec <= 0) return markers;

  // 시작 템포도 사용자가 위치를 파악할 수 있도록 표시한다.
  const first = tempoMap[0];
  markers.push({ beat: first.beat, time: 0, bpm: first.bpm });

  let previousBpm = first.bpm;
  for (let i = 1; i < tempoMap.length; i++) {
    const cur = tempoMap[i];
    if (cur.bpm === previousBpm) continue;
    previousBpm = cur.bpm;

    const time = beatToSeconds(cur.beat, tempoMap);
    if (time < -EPS || time > durationSec + EPS) continue;
    markers.push({ beat: cur.beat, time: Math.max(0, Math.min(durationSec, time)), bpm: cur.bpm });
  }
  return markers;
}

function beatToSeconds(beat, tempoMap) {
  let sec = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const cur = tempoMap[i];
    const nextBeat = tempoMap[i + 1]?.beat ?? Infinity;
    if (beat <= cur.beat) break;
    const end = Math.min(beat, nextBeat);
    sec += Math.max(0, end - cur.beat) * 60 / cur.bpm;
    if (beat < nextBeat) break;
  }
  return sec;
}

function isValidLength(n) { return [1,2,4,8,16,32,64].includes(n); }


  function composeMml(parts, options = {}) {
    const raw = Array.from(parts || []).map(x => String(x || "").trim());
    const list = options.preserveEmpty ? raw.slice(0, options.partCount || raw.length || 0) : raw.filter(Boolean);
    return `MML@${list.join(",")};`;
  }

  window.MabiMml = { parseMabinogiMml, splitMmlParts, parseMmlPart, buildSchedule, beatToSeconds, composeMml };
})();
