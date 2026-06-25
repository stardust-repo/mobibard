(() => {
  "use strict";

  const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];
  const VALID_LENGTHS = [1, 2, 4, 8, 16, 32, 64];
  const DEFAULT_TEMPO = 120;
  const DEFAULT_VOLUME = 8;
  const DEFAULT_OCTAVE = 4;
  const DEFAULT_LENGTH = 4;
  // whole note = 1024 units. This keeps common dotted 64th-note values integer.
  const WHOLE_UNITS = 1024;
  const EPS = 1e-9;

  const L_STATES = VALID_LENGTHS.map(denom => ({ label: String(denom), units: durationUnits(denom, 0) }));
  const durationCandidateCache = new Map();
  const noteDurationCache = new Map();
  const restDurationCache = new Map();

  function optimizeMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    const outputParts = [];
    for (let i = 0; i < partCount; i++) {
      let events = parsedParts[i].events;
      if (i === 0) events = injectTempoEvents(events, tempoMap);
      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: i === 0 && hasAnyContent,
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return { mml, parts: outputParts, before, after, saved: before - after, tempoMap };
  }

  function optimizePart(text, options = {}) {
    const parsed = parsePart(String(text || ""), 0);
    const startTempo = options.includeTempo === false
      ? null
      : normalizeTempoEvents(parsed.tempos)[0]?.bpm || DEFAULT_TEMPO;
    const events = options.includeTempo === false ? parsed.events : injectTempoEvents(parsed.events, normalizeTempoEvents(parsed.tempos));
    const part = renderPart(events, {
      isMelody: options.includeTempo !== false,
      startTempo,
      forceHeader: Boolean(String(text || "").trim()),
      partIndex: 0
    });
    return { part, before: String(text || "").trim().length, after: part.length };
  }

  function trimShortRestsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const threshold = normalizeRestTrimThreshold(options);
    const targetPartIndex = Number.isInteger(options.targetPartIndex)
      ? Math.max(0, Math.min(partCount - 1, options.targetPartIndex))
      : null;

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let removed = 0;
    let removedUnits = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const shouldTrim = targetPartIndex == null || targetPartIndex === i;
      let events;
      if (shouldTrim) {
        const trimmed = absorbShortRests(parsedParts[i].events, threshold, tempoMap);
        events = trimmed.events;
        removed += trimmed.removed;
        removedUnits += trimmed.removedUnits;
      } else {
        events = mergeAdjacentRests(parsedParts[i].events);
      }

      // 템포 안쪽으로 늘어난 음표는 해당 템포 위치에서 tie로 나누어 둔다.
      // 실제 T 문자는 멜로디에만 들어가지만, 다른 파트도 같은 박자 지점에서
      // 음 길이가 나뉘어야 템포 변화 구간을 더 안전하게 보존할 수 있다.
      events = splitMarkedNotesAtTempoPositions(events, tempoMap);
      if (i === 0) events = injectTempoEvents(events, tempoMap);

      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: i === 0 && hasAnyContent,
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      removed,
      removedUnits,
      tempoMap
    };
  }

  function splitMmlPartsStrict(text) {
    let s = String(text || "").replace(/^\uFEFF/, "").trim();
    const m = s.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (m) s = m[1];
    if (/\[|\]/.test(s)) throw new Error("마비노기 MML에서는 [] 표기를 사용할 수 없습니다.");
    if (s === "") return [];
    return s.split(",").map(part => normalizeCommandCase(part.trim()));
  }

  function composeMml(parts, options = {}) {
    const raw = Array.from(parts || []).map(x => String(x || "").trim());
    const list = options.preserveEmpty ? raw.slice(0, options.partCount || raw.length || 0) : raw.filter(Boolean);
    return `MML@${list.join(",")};`;
  }

  function normalizeCommandCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, ch => {
      const lower = ch.toLowerCase();
      if ("tolv".includes(lower)) return lower.toUpperCase();
      if ("rnabcdefg".includes(lower)) return lower;
      return ch;
    });
  }

  function parsePart(input, partIndex, options = {}) {
    const s = normalizeCommandCase(String(input || "").replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim());
    let i = 0;
    let pos = 0;
    let octave = DEFAULT_OCTAVE;
    let defaultUnits = durationUnits(DEFAULT_LENGTH, 0);
    let volume = DEFAULT_VOLUME;
    let order = 0;
    let pendingTie = false;
    let lastTieTarget = null;
    const events = [];
    const tempos = [];

    const fail = message => { throw new Error(`${partIndex + 1}파트: ${message}`); };
    const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readNumber = () => {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      return i > start ? { value: Number(s.slice(start, i)), text: s.slice(start, i) } : null;
    };
    const readDotsCount = () => {
      let dots = 0;
      while (s[i] === ".") { dots++; i++; }
      return dots;
    };
    const readLengthUnits = () => {
      const n = readNumber();
      const dots = readDotsCount();
      if (!n) return durationUnitsFromBase(defaultUnits, dots);
      if (!VALID_LENGTHS.includes(n.value)) fail(`길이 ${n.value}은 지원하지 않습니다. 1,2,4,8,16,32,64를 사용해 주세요.`);
      return durationUnits(n.value, dots);
    };
    const readNoteToken = () => {
      skipSpace();
      const ch = s[i]?.toLowerCase();
      if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
      if (ch === "r") {
        i++;
        return { kind: "rest", duration: readLengthUnits() };
      }
      if (ch === "n") {
        i++;
        const num = readNumber();
        if (!num) fail("N 뒤에 음 번호가 필요합니다.");
        if (num.value < 0 || num.value > 127) fail(`N${num.value}은 지원 범위를 벗어났습니다.`);
        const duration = durationUnitsFromBase(defaultUnits, readDotsCount());
        if (num.value === 0) return { kind: "rest", duration };
        return { kind: "note", midi: num.value, duration, volume };
      }
      i++;
      let semitone = NOTE_BASE[ch];
      if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
      else if (s[i] === "-") { semitone--; i++; }
      const midi = (octave + 1) * 12 + semitone;
      const duration = readLengthUnits();
      return { kind: "note", midi, duration, volume };
    };
    const appendToken = token => {
      if (!isIntegerLike(token.duration) || token.duration <= 0) {
        fail("64분음표보다 더 작은 소수 길이는 현재 최적화할 수 없습니다.");
      }
      token.duration = Math.round(token.duration);

      if (pendingTie) {
        if (!lastTieTarget) fail("& 앞에 이어질 음표가 필요합니다.");
        if (lastTieTarget.kind !== token.kind || lastTieTarget.midi !== token.midi) fail("&는 같은 음끼리만 이어 주세요.");
        lastTieTarget.event.duration += token.duration;
        pos += token.duration;
        pendingTie = false;
        return;
      }

      const ev = token.kind === "note"
        ? { type: "note", start: pos, duration: token.duration, midi: token.midi, volume: token.volume }
        : { type: "rest", start: pos, duration: token.duration };
      events.push(ev);
      pos += token.duration;
      lastTieTarget = { kind: token.kind, midi: token.midi, event: ev };
    };

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const raw = s[i];
      const ch = raw.toLowerCase();

      if (ch in NOTE_BASE || ch === "r" || ch === "n") {
        appendToken(readNoteToken());
      } else if (ch === "&") {
        i++;
        if (!lastTieTarget) fail("& 앞에 이어질 음표가 필요합니다.");
        if (pendingTie) fail("&가 연속으로 나왔습니다.");
        pendingTie = true;
      } else if (ch === "t") {
        i++;
        const n = readNumber();
        if (!n) fail("T 뒤에 숫자가 필요합니다.");
        if (n.value < 32 || n.value > 255) fail(`T${n.value}은 지원 범위를 벗어났습니다.`);
        tempos.push({ pos, bpm: n.value, part: partIndex, order: partIndex * 100000000 + order++ });
      } else if (ch === "o") {
        i++;
        const n = readNumber();
        if (!n) fail("O 뒤에 숫자가 필요합니다.");
        if (n.value < 0 || n.value > 9) fail(`O${n.value}은 지원 범위를 벗어났습니다.`);
        octave = n.value;
      } else if (ch === "l") {
        i++;
        const n = readNumber();
        const dots = readDotsCount();
        if (!n || !VALID_LENGTHS.includes(n.value)) fail("L은 1,2,4,8,16,32,64 중 하나를 사용해 주세요.");
        defaultUnits = durationUnits(n.value, dots);
        if (!isIntegerLike(defaultUnits)) fail("현재 최적화할 수 없는 L 점음표 길이입니다.");
        defaultUnits = Math.round(defaultUnits);
      } else if (ch === "v") {
        i++;
        const n = readNumber();
        if (!n) fail("V 뒤에 숫자가 필요합니다.");
        if (n.value < 0 || n.value > 15) fail(`V${n.value}는 지원 범위를 벗어났습니다.`);
        volume = n.value;
      } else if (raw === ">") {
        i++;
        octave++;
        if (octave > 9) fail("옥타브가 너무 높습니다.");
      } else if (raw === "<") {
        i++;
        octave--;
        if (octave < 0) fail("옥타브가 너무 낮습니다.");
      } else if (raw === ";") {
        i++;
        break;
      } else {
        fail(`알 수 없는 문자 '${raw}'가 있습니다.`);
      }
    }
    if (pendingTie) fail("& 뒤에 이어질 음표가 필요합니다.");

    return { raw: s, events: options.mergeRests === false ? normalizeEventStarts(events) : mergeAdjacentRests(events), tempos, length: pos };
  }

  function mergeAdjacentRests(events) {
    const out = [];
    for (const ev of events) {
      const last = out[out.length - 1];
      if (ev.type === "rest" && last?.type === "rest" && !ev.preTempos?.length && !last.preTempos?.length) {
        last.duration += ev.duration;
      } else {
        out.push({ ...ev });
      }
    }
    let pos = 0;
    for (const ev of out) { ev.start = pos; pos += ev.duration; }
    return out;
  }

  function normalizeRestTrimThreshold(options = {}) {
    if (options.all || String(options.denom || options.threshold || "").toLowerCase() === "all") {
      return { all: true, units: Infinity, denom: null };
    }
    const denom = Number(options.denom ?? options.thresholdDenom ?? options.threshold ?? 32);
    if (!VALID_LENGTHS.includes(denom) || denom < 4) {
      throw new Error("쉼표 삭제 기준은 all, 4, 8, 16, 32, 64 중 하나여야 합니다.");
    }
    return { all: false, units: durationUnits(denom, 0), denom };
  }

  function absorbShortRests(events, threshold, tempoMap = []) {
    const out = [];
    let lastAbsorbableNote = null;
    let removed = 0;
    let removedUnits = 0;

    for (const source of events || []) {
      const ev = { ...source };
      if (ev.type === "note") {
        delete ev.extendedByRest;
        out.push(ev);
        lastAbsorbableNote = ev;
        continue;
      }

      if (ev.type === "rest") {
        const canDelete = threshold.all || (Number.isFinite(ev.duration) && ev.duration <= threshold.units + EPS);
        if (canDelete && lastAbsorbableNote) {
          lastAbsorbableNote.duration += ev.duration;
          lastAbsorbableNote.extendedByRest = true;
          lastAbsorbableNote.crossesTempoAfterRestTrim = noteCrossesTempo(lastAbsorbableNote, tempoMap);
          removed++;
          removedUnits += ev.duration;
          continue;
        }
        out.push(ev);
        lastAbsorbableNote = null;
        continue;
      }

      out.push(ev);
      lastAbsorbableNote = null;
    }

    return {
      events: mergeAdjacentRests(normalizeEventStarts(out)),
      removed,
      removedUnits
    };
  }

  function noteCrossesTempo(ev, tempoMap = []) {
    if (!ev || ev.type !== "note") return false;
    const start = Number(ev.start) || 0;
    const end = start + (Number(ev.duration) || 0);
    return (tempoMap || []).some(t => t.pos > start + EPS && t.pos < end - EPS);
  }

  function splitMarkedNotesAtTempoPositions(events, tempoMap = []) {
    const tempos = (tempoMap || []).filter(t => t.pos > 0).sort((a, b) => a.pos - b.pos);
    if (!tempos.length) return normalizeEventStarts((events || []).map(stripEditFlags));

    const out = [];
    for (const source of events || []) {
      const ev = { ...source };
      if (ev.type !== "note" || !ev.extendedByRest) {
        out.push(stripEditFlags(ev));
        continue;
      }

      const start = ev.start;
      const end = ev.start + ev.duration;
      const cuts = tempos.map(t => t.pos).filter(pos => pos > start + EPS && pos < end - EPS);
      if (!cuts.length) {
        out.push(stripEditFlags(ev));
        continue;
      }

      let cursor = start;
      let first = true;
      for (const cut of cuts.concat(end)) {
        const duration = cut - cursor;
        if (duration > EPS) {
          const segment = stripEditFlags({ ...ev, start: cursor, duration });
          if (!first) segment.tieFromPrev = true;
          out.push(segment);
          first = false;
        }
        cursor = cut;
      }
    }
    return normalizeEventStarts(out);
  }

  function stripEditFlags(ev) {
    const copy = { ...ev };
    delete copy.extendedByRest;
    delete copy.crossesTempoAfterRestTrim;
    return copy;
  }

  function normalizeTempoEvents(events) {
    const sorted = [...events].sort((a, b) => a.pos - b.pos || a.order - b.order || a.part - b.part);
    const byPos = [];
    for (const ev of sorted) {
      const last = byPos[byPos.length - 1];
      if (last && last.pos === ev.pos) {
        last.bpm = ev.bpm;
        last.order = ev.order;
      } else {
        byPos.push({ pos: ev.pos, bpm: ev.bpm, order: ev.order });
      }
    }
    if (!byPos.length || byPos[0].pos !== 0) byPos.unshift({ pos: 0, bpm: DEFAULT_TEMPO, order: -1 });
    const out = [];
    for (const ev of byPos) {
      const last = out[out.length - 1];
      if (last && last.bpm === ev.bpm) continue;
      out.push({ pos: ev.pos, bpm: ev.bpm });
    }
    return out;
  }

  function injectTempoEvents(events, tempoMap) {
    const tempos = (tempoMap || []).filter(t => t.pos > 0).sort((a, b) => a.pos - b.pos);
    if (!tempos.length) return mergeAdjacentRests(events.map(e => ({ ...e })));

    const result = [];
    let ti = 0;
    const pushTempoOnly = bpm => result.push({ type: "tempo", preTempos: [bpm], start: currentLength(result), duration: 0 });

    for (const source of events) {
      let ev = { ...source };
      let localStart = ev.start;
      let left = ev.duration;

      while (ti < tempos.length && tempos[ti].pos <= localStart) {
        const bpm = tempos[ti++].bpm;
        const last = result[result.length - 1];
        if (last) last.postTempos = [...(last.postTempos || []), bpm];
        else pushTempoOnly(bpm);
      }

      while (ti < tempos.length && tempos[ti].pos > localStart && tempos[ti].pos < localStart + left) {
        const tempo = tempos[ti++];
        const firstDur = tempo.pos - localStart;
        if (firstDur > 0) result.push(copyEventSegment(ev, localStart, firstDur, false));
        const secondDur = localStart + left - tempo.pos;
        ev = copyEventSegment(ev, tempo.pos, secondDur, ev.type === "note");
        ev.preTempos = [...(ev.preTempos || []), tempo.bpm];
        localStart = tempo.pos;
        left = secondDur;
      }

      if (left > 0) result.push(copyEventSegment(ev, localStart, left, Boolean(ev.tieFromPrev)));
    }

    let end = events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
    while (ti < tempos.length) {
      const tempo = tempos[ti++];
      if (tempo.pos > end) {
        result.push({ type: "rest", start: end, duration: tempo.pos - end });
        end = tempo.pos;
      }
      const last = result[result.length - 1];
      if (last) last.postTempos = [...(last.postTempos || []), tempo.bpm];
      else pushTempoOnly(tempo.bpm);
    }

    return normalizeEventStarts(result);
  }

  function copyEventSegment(ev, start, duration, tieFromPrev) {
    const copy = { ...ev, start, duration };
    delete copy.postTempos;
    if (tieFromPrev) copy.tieFromPrev = true;
    else delete copy.tieFromPrev;
    return copy;
  }

  function normalizeEventStarts(events) {
    const out = [];
    let pos = 0;
    for (const ev of events) {
      if (ev.type === "tempo") {
        out.push({ ...ev, start: pos });
        continue;
      }
      const copy = { ...ev, start: pos };
      out.push(copy);
      pos += copy.duration;
      if (ev.postTempos?.length) {
        out.push({ type: "tempo", start: pos, duration: 0, preTempos: ev.postTempos.slice() });
      }
    }
    return out;
  }

  function currentLength(events) {
    return events.reduce((pos, ev) => pos + (ev.duration || 0), 0);
  }

  function renderPart(events, options) {
    const musicalEvents = events.filter(ev => ev.type === "note" || ev.type === "rest");
    const firstNote = musicalEvents.find(ev => ev.type === "note");
    const initVolume = firstNote ? clamp(firstNote.volume, 0, 15) : DEFAULT_VOLUME;
    const initOctave = firstNote ? midiToOctave(firstNote.midi) : DEFAULT_OCTAVE;
    const hasAnything = options.forceHeader || musicalEvents.length || events.some(ev => ev.type === "tempo" || ev.preTempos?.length || ev.postTempos?.length);
    if (!hasAnything) return "";

    let best = null;
    for (const initialL of L_STATES) {
      const rendered = renderPartWithInitialState(events, {
        ...options,
        initVolume,
        initOctave,
        initialL
      });
      if (best == null || rendered.length < best.length || (rendered.length === best.length && rendered < best)) best = rendered;
    }
    return best || "";
  }

  function renderPartWithInitialState(events, state) {
    let currentVolume = state.initVolume;
    let currentOctave = state.initOctave;
    const decorated = [];

    for (const ev of events) {
      if (ev.type === "tempo") {
        decorated.push({ type: "tempo", pre: renderTempoList(ev.preTempos) });
        continue;
      }
      const preTempo = renderTempoList(ev.preTempos);
      if (ev.type === "rest") {
        decorated.push({ type: "rest", duration: ev.duration, pre: preTempo, tiePrefix: false });
        continue;
      }
      const vol = clamp(ev.volume, 0, 15);
      let command = "";
      if (vol !== currentVolume) {
        command += `V${vol}`;
        currentVolume = vol;
      }
      const pitch = renderPitch(ev.midi, currentOctave);
      command += pitch.prefix;
      currentOctave = pitch.octave;
      decorated.push({
        type: "note",
        duration: ev.duration,
        pre: preTempo,
        tiePrefix: Boolean(ev.tieFromPrev),
        command,
        symbol: pitch.symbol
      });
    }

    const startTempo = state.isMelody ? `T${state.startTempo || DEFAULT_TEMPO}` : "";
    const header = `${startTempo}V${state.initVolume}O${state.initOctave}L${state.initialL.label}`;
    let dp = new Map([[state.initialL.label, { text: header, lState: state.initialL }]]);

    for (const ev of decorated) {
      if (ev.type === "tempo") {
        for (const item of dp.values()) item.text += ev.pre;
        continue;
      }
      const next = new Map();
      for (const item of dp.values()) {
        for (const targetL of L_STATES) {
          const change = targetL.label === item.lState.label ? "" : `L${targetL.label}`;
          const body = renderDecoratedEvent(ev, targetL.units);
          const prefix = (ev.tiePrefix ? "&" : "") + (ev.pre || "") + change;
          const text = item.text + prefix + body;
          const old = next.get(targetL.label);
          if (!old || text.length < old.text.length || (text.length === old.text.length && text < old.text)) {
            next.set(targetL.label, { text, lState: targetL });
          }
        }
      }
      dp = next;
    }

    let best = null;
    for (const item of dp.values()) {
      if (!best || item.text.length < best.length || (item.text.length === best.length && item.text < best)) best = item.text;
    }
    return best || header;
  }

  function renderDecoratedEvent(ev, defaultUnits) {
    if (ev.type === "rest") return renderRestDuration(ev.duration, defaultUnits);
    return renderNoteDuration(ev.command + ev.symbol, ev.symbol, ev.duration, defaultUnits);
  }

  function renderTempoList(list) {
    return Array.from(list || []).map(bpm => `T${bpm}`).join("");
  }

  function renderPitch(midi, currentOctave) {
    if (midi < 0 || midi > 127) throw new Error(`음역 ${midi}은 지원할 수 없습니다.`);
    const targetOctave = midiToOctave(midi);
    if (targetOctave < 0 || targetOctave > 9) throw new Error(`O${targetOctave} 음역은 지원할 수 없습니다.`);
    const symbol = NOTE_NAMES[((midi % 12) + 12) % 12];
    const candidates = [];
    if (targetOctave === currentOctave) candidates.push({ prefix: "", symbol, octave: targetOctave });
    const delta = targetOctave - currentOctave;
    if (delta !== 0 && Math.abs(delta) <= 9) candidates.push({ prefix: delta > 0 ? ">".repeat(delta) : "<".repeat(-delta), symbol, octave: targetOctave });
    candidates.push({ prefix: `O${targetOctave}`, symbol, octave: targetOctave });
    candidates.sort((a, b) => (a.prefix.length + a.symbol.length) - (b.prefix.length + b.symbol.length) || a.prefix.localeCompare(b.prefix));
    return candidates[0];
  }

  function midiToOctave(midi) {
    return Math.floor(midi / 12) - 1;
  }

  function renderNoteDuration(firstSymbol, repeatSymbol, units, defaultUnits) {
    units = normalizeUnits(units);
    const key = `${firstSymbol}|${repeatSymbol}|${units}|${defaultUnits}`;
    if (noteDurationCache.has(key)) return noteDurationCache.get(key);
    const candidates = getDurationCandidates(defaultUnits);
    let best = null;
    for (const cand of candidates) {
      if (cand.units > units) continue;
      const first = `${firstSymbol}${cand.suffix}`;
      let text;
      if (cand.units === units) {
        text = first;
      } else {
        let tail;
        try { tail = bestNoteTail(units - cand.units, repeatSymbol, defaultUnits); }
        catch (_) { continue; }
        text = `${first}&${tail}`;
      }
      if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
    }
    if (best == null) throw new Error(`길이 ${units}을 MML로 표현하지 못했습니다.`);
    noteDurationCache.set(key, best);
    return best;
  }

  function bestNoteTail(units, symbol, defaultUnits) {
    units = normalizeUnits(units);
    const key = `tail|${symbol}|${units}|${defaultUnits}`;
    if (noteDurationCache.has(key)) return noteDurationCache.get(key);
    if (units === 0) return "";
    const candidates = getDurationCandidates(defaultUnits);
    const dp = Array(units + 1).fill(null);
    dp[0] = "";
    for (let u = 1; u <= units; u++) {
      let best = null;
      for (const cand of candidates) {
        if (cand.units > u || dp[u - cand.units] == null) continue;
        const piece = `${symbol}${cand.suffix}`;
        const text = cand.units === u ? piece : `${dp[u - cand.units]}&${piece}`;
        if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
      }
      dp[u] = best;
    }
    const out = dp[units];
    if (out == null) throw new Error(`길이 ${units}을 MML로 표현하지 못했습니다.`);
    noteDurationCache.set(key, out);
    return out;
  }

  function renderRestDuration(units, defaultUnits) {
    units = normalizeUnits(units);
    const key = `${units}|${defaultUnits}`;
    if (restDurationCache.has(key)) return restDurationCache.get(key);
    const candidates = getDurationCandidates(defaultUnits);
    const dp = Array(units + 1).fill(null);
    dp[0] = "";
    for (let u = 1; u <= units; u++) {
      let best = null;
      for (const cand of candidates) {
        if (cand.units > u || dp[u - cand.units] == null) continue;
        const piece = `r${cand.suffix}`;
        const text = dp[u - cand.units] + piece;
        if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
      }
      dp[u] = best;
    }
    const out = dp[units];
    if (out == null) throw new Error(`쉼표 길이 ${units}을 MML로 표현하지 못했습니다.`);
    restDurationCache.set(key, out);
    return out;
  }

  function getDurationCandidates(defaultUnits) {
    const key = String(defaultUnits);
    if (durationCandidateCache.has(key)) return durationCandidateCache.get(key);
    const map = new Map();
    const add = (units, suffix) => {
      if (!isIntegerLike(units) || units <= 0) return;
      units = Math.round(units);
      const old = map.get(units);
      if (old == null || suffix.length < old.length || (suffix.length === old.length && suffix < old)) map.set(units, suffix);
    };
    add(defaultUnits, "");
    add(durationUnitsFromBase(defaultUnits, 1), ".");
    for (const denom of VALID_LENGTHS) {
      add(durationUnits(denom, 0), String(denom));
      add(durationUnits(denom, 1), `${denom}.`);
    }
    const candidates = Array.from(map, ([units, suffix]) => ({ units, suffix }))
      .sort((a, b) => b.units - a.units || a.suffix.length - b.suffix.length || a.suffix.localeCompare(b.suffix));
    durationCandidateCache.set(key, candidates);
    return candidates;
  }

  function durationUnits(denom, dots = 0) {
    let total = WHOLE_UNITS / denom;
    let add = total / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function durationUnitsFromBase(baseUnits, dots = 0) {
    let total = baseUnits;
    let add = baseUnits / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function normalizeUnits(value) {
    if (!isIntegerLike(value)) throw new Error("현재 최적화할 수 없는 소수 길이가 있습니다.");
    return Math.round(value);
  }

  function isIntegerLike(value) {
    return Number.isFinite(value) && Math.abs(value - Math.round(value)) < EPS;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
  }

  function countPartChars(parts) {
    return Array.from(parts || []).reduce((sum, part) => sum + String(part || "").trim().length, 0);
  }

  window.MabiOptimizer = { optimizeMml, optimizePart, trimShortRestsMml };
})();
