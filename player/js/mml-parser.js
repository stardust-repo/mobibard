(() => {
  "use strict";

  const tr = (key, values = []) => window.MobibardI18n?.t?.(key, values) || String(key);
  const { clampInt, formatTime } = window.MabiUtils;
  const NOTE_BASE = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };
  const EPS = 1e-9;

function parseMabinogiMml(text) {
  if (!String(text || "").trim()) throw new Error(tr("mml.err_empty"));
  if (/\[|\]/.test(text)) throw new Error(tr("mml.err_brackets_parts"));
  const partInfos = splitMmlPartsDetailed(text);
  if (partInfos.length > 6) throw new Error(tr("mml.err_max_parts"));
  while (partInfos.length < 6) partInfos.push({ text: "", sourceStart: 0, sourceEnd: 0, rawStart: 0, rawEnd: 0 });
  const parsedParts = partInfos.map((p, i) => parseMmlPart(p.text, i, { globalOffset: p.sourceStart }));
  const tempos = [{ beat: 0, bpm: 120, part: -1, order: -1, explicit: false, sourceStart: -1, sourceEnd: -1, globalSourceStart: -1, globalSourceEnd: -1 }];
  for (const p of parsedParts) tempos.push(...p.tempos);
  tempos.sort((a, b) => a.beat - b.beat || a.order - b.order || a.part - b.part);
  for (const t of tempos) {
    if (t.bpm < 32 || t.bpm > 255) throw new Error(tr("mml.err_tempo_range", [t.bpm]));
  }
  return { parts: parsedParts, tempos: normalizeTempoMap(tempos) };
}

function splitMmlParts(text) {
  return splitMmlPartsDetailed(text).map(p => p.text);
}

function splitMmlPartsDetailed(text) {
  const raw = String(text || "");
  let bodyStart = 0;
  const header = raw.match(/^\s*MML\s*@/i);
  if (header) bodyStart = header[0].length;
  let bodyEnd = raw.length;
  const lastSemi = raw.lastIndexOf(";");
  if (lastSemi >= bodyStart) bodyEnd = lastSemi;

  const body = raw.slice(bodyStart, bodyEnd);
  if (body.trim() === "") return [];

  const result = [];
  let partRawStart = bodyStart;
  for (let i = 0; i <= body.length; i++) {
    if (i < body.length && body[i] !== ",") continue;
    const rawEnd = bodyStart + i;
    const rawText = raw.slice(partRawStart, rawEnd);
    const leading = rawText.match(/^\s*/)?.[0].length || 0;
    const trailing = rawText.match(/\s*$/)?.[0].length || 0;
    const sourceStart = partRawStart + leading;
    const sourceEnd = Math.max(sourceStart, rawEnd - trailing);
    result.push({
      text: raw.slice(sourceStart, sourceEnd),
      sourceStart,
      sourceEnd,
      rawStart: partRawStart,
      rawEnd
    });
    partRawStart = rawEnd + 1;
  }
  return result;
}

function parseMmlPart(s, partIndex, options = {}) {
  const globalOffset = Number(options.globalOffset) || 0;
  let i = 0, beat = 0, octave = 4, length = 4, defaultDuration = 1, volume = 8, order = 0;
  let pendingTie = false;
  let lastTieTarget = null;
  const notes = [];
  const rests = [];
  const tempos = [];
  const makeSourceRange = (start, end) => ({
    start,
    end,
    globalStart: globalOffset + start,
    globalEnd: globalOffset + end
  });
  const readNumber = () => { let start = i; while (i < s.length && /\d/.test(s[i])) i++; return i > start ? Number(s.slice(start, i)) : null; };
  const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const readDots = (base) => { let dur = base, add = base / 2; while (s[i] === ".") { dur += add; add /= 2; i++; } return dur; };
  const readLengthBeats = () => {
    const n = readNumber();
    if (n == null) return readDots(defaultDuration);
    if (!isValidLength(n)) throw new Error(tr("mml.err_part_length", [partIndex + 1, n]));
    return readDots(4 / n);
  };
  const readNoteToken = () => {
    skipSpace();
    const tokenStart = i;
    const ch = s[i]?.toLowerCase();
    if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
    if (ch === "r") {
      i++;
      const dur = readLengthBeats();
      return { rest: true, midi: null, dur, sourceRange: makeSourceRange(tokenStart, i) };
    }
    if (ch === "n") {
      i++;
      const num = readNumber();
      if (num == null) throw new Error(tr("mml.err_part_n_required", [partIndex + 1]));
      const dur = readDots(defaultDuration);
      if (num === 0) return { rest: true, midi: null, dur, sourceRange: makeSourceRange(tokenStart, i) };
      return { rest: false, midi: clampInt(num, 0, 127), dur, sourceRange: makeSourceRange(tokenStart, i) };
    }
    i++;
    let semitone = NOTE_BASE[ch];
    if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
    else if (s[i] === "-") { semitone--; i++; }
    const midi = (octave + 1) * 12 + semitone;
    const dur = readLengthBeats();
    return { rest: false, midi, dur, sourceRange: makeSourceRange(tokenStart, i) };
  };
  const applyNoteToken = (token) => {
    if (!token) return;
    if (pendingTie) {
      if (!lastTieTarget) throw new Error(tr("mml.err_part_tie_before", [partIndex + 1]));
      if (lastTieTarget.rest !== token.rest || lastTieTarget.midi !== token.midi) {
        throw new Error(tr("mml.err_part_tie_same", [partIndex + 1]));
      }
      if (lastTieTarget.note) {
        lastTieTarget.note.duration += token.dur;
        lastTieTarget.note.sourceRanges.push(token.sourceRange);
        lastTieTarget.note.sourceStart = Math.min(lastTieTarget.note.sourceStart, token.sourceRange.start);
        lastTieTarget.note.sourceEnd = Math.max(lastTieTarget.note.sourceEnd, token.sourceRange.end);
        lastTieTarget.note.globalSourceStart = Math.min(lastTieTarget.note.globalSourceStart, token.sourceRange.globalStart);
        lastTieTarget.note.globalSourceEnd = Math.max(lastTieTarget.note.globalSourceEnd, token.sourceRange.globalEnd);
      }
      beat += token.dur;
      pendingTie = false;
      return;
    }

    if (token.rest) {
      const rest = {
        part: partIndex,
        beat,
        duration: token.dur,
        rest: true,
        midi: null,
        sourceStart: token.sourceRange.start,
        sourceEnd: token.sourceRange.end,
        globalSourceStart: token.sourceRange.globalStart,
        globalSourceEnd: token.sourceRange.globalEnd,
        sourceRanges: [token.sourceRange]
      };
      rests.push(rest);
      beat += token.dur;
      lastTieTarget = { rest: true, midi: null, note: rest };
      return;
    }

    if (token.midi < 0 || token.midi > 127) throw new Error(tr("mml.err_part_pitch_range", [partIndex + 1]));
    const note = {
      part: partIndex,
      beat,
      duration: token.dur,
      midi: token.midi,
      volume,
      sourceStart: token.sourceRange.start,
      sourceEnd: token.sourceRange.end,
      globalSourceStart: token.sourceRange.globalStart,
      globalSourceEnd: token.sourceRange.globalEnd,
      sourceRanges: [token.sourceRange]
    };
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
      if (!lastTieTarget) throw new Error(tr("mml.err_part_tie_before", [partIndex + 1]));
      if (pendingTie) throw new Error(tr("mml.err_part_tie_repeat", [partIndex + 1]));
      pendingTie = true;
    } else if (ch === "t") {
      const tempoStart = i;
      i++;
      const bpm = readNumber();
      if (bpm == null) throw new Error(tr("mml.err_part_t_required", [partIndex + 1]));
      tempos.push({
        beat,
        bpm,
        part: partIndex,
        order: order++,
        explicit: true,
        sourceStart: tempoStart,
        sourceEnd: i,
        globalSourceStart: globalOffset + tempoStart,
        globalSourceEnd: globalOffset + i
      });
    } else if (ch === "o") {
      i++; const v = readNumber(); if (v == null) throw new Error(tr("mml.err_part_o_required", [partIndex + 1]));
      if (v < 0 || v > 9) throw new Error(tr("mml.err_part_o_range", [partIndex + 1, v])); octave = v;
    } else if (ch === "l") {
      i++; const v = readNumber(); if (v == null || !isValidLength(v)) throw new Error(tr("mml.err_part_l_range", [partIndex + 1])); length = v; defaultDuration = readDots(4 / v);
    } else if (ch === "v") {
      i++; const v = readNumber(); if (v == null) throw new Error(tr("mml.err_part_v_required", [partIndex + 1]));
      if (v < 0 || v > 15) throw new Error(tr("mml.err_part_v_range", [partIndex + 1, v])); volume = v;
    } else if (ch === ">") { i++; octave++; if (octave > 9) throw new Error(tr("mml.err_part_octave_high", [partIndex + 1])); }
    else if (ch === "<") { i++; octave--; if (octave < 0) throw new Error(tr("mml.err_part_octave_low", [partIndex + 1])); }
    else if (ch === ";") { i++; break; }
    else { throw new Error(tr("mml.err_part_unknown_char", [partIndex + 1, s[i]])); }
  }
  if (pendingTie) throw new Error(tr("mml.err_part_tie_after", [partIndex + 1]));
  return { notes, rests, tempos, lengthBeats: beat };
}

function normalizeTempoMap(events) {
  const map = [];
  for (const ev of events) {
    const normalized = {
      beat: Number(ev.beat) || 0,
      bpm: Number(ev.bpm) || 120,
      part: Number.isInteger(ev.part) ? ev.part : -1,
      order: Number.isFinite(ev.order) ? ev.order : -1,
      explicit: Boolean(ev.explicit),
      sourceStart: Number.isFinite(ev.sourceStart) ? ev.sourceStart : -1,
      sourceEnd: Number.isFinite(ev.sourceEnd) ? ev.sourceEnd : -1,
      globalSourceStart: Number.isFinite(ev.globalSourceStart) ? ev.globalSourceStart : -1,
      globalSourceEnd: Number.isFinite(ev.globalSourceEnd) ? ev.globalSourceEnd : -1
    };
    const last = map[map.length - 1];
    if (last && Math.abs(last.beat - normalized.beat) < EPS) map[map.length - 1] = normalized;
    else map.push(normalized);
  }
  if (!map.length || map[0].beat !== 0) {
    map.unshift({ beat: 0, bpm: 120, part: -1, order: -1, explicit: false, sourceStart: -1, sourceEnd: -1, globalSourceStart: -1, globalSourceEnd: -1 });
  }
  return map;
}

function buildSchedule(parsed) {
  const notes = [];
  const rests = [];
  for (const p of parsed.parts) {
    for (const n of p.notes) {
      const start = beatToSeconds(n.beat, parsed.tempos);
      const end = beatToSeconds(n.beat + n.duration, parsed.tempos);
      notes.push({ ...n, start, durationSec: Math.max(0.02, end - start) });
    }
    for (const r of (p.rests || [])) {
      const start = beatToSeconds(r.beat, parsed.tempos);
      const end = beatToSeconds(r.beat + r.duration, parsed.tempos);
      rests.push({ ...r, start, durationSec: Math.max(0, end - start) });
    }
  }
  notes.sort((a, b) => a.start - b.start || a.part - b.part);
  rests.sort((a, b) => a.start - b.start || a.part - b.part);
  const noteLen = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
  const partLen = (parsed.parts || []).reduce((m, p) => Math.max(m, beatToSeconds(Number(p.lengthBeats) || 0, parsed.tempos)), 0);
  const len = Math.max(noteLen, partLen);
  const tempoMarkers = buildTempoMarkers(parsed.tempos, len);
  const tempoMap = (parsed.tempos || []).map((tempo) => ({
    beat: Math.max(0, Number(tempo.beat) || 0),
    time: beatToSeconds(Number(tempo.beat) || 0, parsed.tempos),
    bpm: Math.max(1, Number(tempo.bpm) || 120),
    part: Number.isInteger(tempo.part) ? tempo.part : -1,
    explicit: Boolean(tempo.explicit),
    sourceStart: Number.isFinite(tempo.sourceStart) ? tempo.sourceStart : -1,
    sourceEnd: Number.isFinite(tempo.sourceEnd) ? tempo.sourceEnd : -1,
    globalSourceStart: Number.isFinite(tempo.globalSourceStart) ? tempo.globalSourceStart : -1,
    globalSourceEnd: Number.isFinite(tempo.globalSourceEnd) ? tempo.globalSourceEnd : -1
  }));
  return {
    notes,
    rests,
    duration: len,
    tempoMarkers,
    tempoMap,
    summary: tr("mml.estimated_length", [formatTime(len)])
  };
}

function buildTempoMarkers(tempoMap, durationSec) {
  const markers = [];
  if (!Array.isArray(tempoMap) || tempoMap.length === 0 || durationSec <= 0) return markers;

  // 시작 템포도 사용자가 위치를 파악할 수 있도록 표시한다.
  const first = tempoMap[0];
  markers.push(makeTempoMarker(first, 0));

  let previousBpm = first.bpm;
  for (let i = 1; i < tempoMap.length; i++) {
    const cur = tempoMap[i];
    if (cur.bpm === previousBpm) continue;
    previousBpm = cur.bpm;

    const time = beatToSeconds(cur.beat, tempoMap);
    if (time < -EPS || time > durationSec + EPS) continue;
    markers.push(makeTempoMarker(cur, Math.max(0, Math.min(durationSec, time))));
  }
  return markers;
}

function makeTempoMarker(tempo, time) {
  return {
    beat: Math.max(0, Number(tempo?.beat) || 0),
    time: Math.max(0, Number(time) || 0),
    bpm: Math.max(1, Number(tempo?.bpm) || 120),
    part: Number.isInteger(tempo?.part) ? tempo.part : -1,
    explicit: Boolean(tempo?.explicit),
    sourceStart: Number.isFinite(tempo?.sourceStart) ? tempo.sourceStart : -1,
    sourceEnd: Number.isFinite(tempo?.sourceEnd) ? tempo.sourceEnd : -1,
    globalSourceStart: Number.isFinite(tempo?.globalSourceStart) ? tempo.globalSourceStart : -1,
    globalSourceEnd: Number.isFinite(tempo?.globalSourceEnd) ? tempo.globalSourceEnd : -1
  };
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

  window.MabiMml = { parseMabinogiMml, splitMmlParts, splitMmlPartsDetailed, parseMmlPart, buildSchedule, beatToSeconds, composeMml };
})();
