(() => {
  "use strict";

  const tr = (key, values = []) => window.MobibardI18n?.t?.(key, values) || String(key);
  const clamp = window.MabiUtils?.clampInt;
  const composeMml = window.MabiUtils?.composeMml;
  if (!clamp || !composeMml) throw new Error("utils.js must be loaded before mml-optimizer.js");

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
  const durationPlanCache = new Map();

  const isUsableInputLength = value => Number.isInteger(value) && value > 0;
  // Optimizer rendering is integer-unit based. Irregular source lengths are accepted and
  // quantized here so editing tools remain usable even when their exact rhythm cannot be preserved.
  const quantizeInputDurationUnits = value => {
    const raw = Number(value) || 0;
    // 64분음표(16)와 점64분음표(24)의 조합으로 표현 가능한 최소 격자는 8 units.
    // 비정규 길이는 가장 가까운 이 격자로 맞춰 후속 렌더러가 반드시 표준 길이로 출력할 수 있게 한다.
    return Math.max(16, Math.round(raw / 8) * 8);
  };

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

  function normalizeGenerationStrength(value) {
    const raw = String(value || "normal").trim().toLowerCase();
    return ["light", "normal", "strong"].includes(raw) ? raw : "normal";
  }



  function medianNumber(values, fallback = 0) {
    const sorted = Array.from(values || []).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return fallback;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }



  // ---------------------------------------------------------------- 볼륨 생성 (v2)
  // 1) 모든 채널의 노트로 박자(3/4·4/4)와 마디 시작 위치를 추정한다. 앞쪽 공백이 마디 단위가 아니어도 강박이 맞는다.
  // 2) 마디별 에너지(노트 밀도·연주 채널 수·음높이)를 모든 채널 공통으로 계산해 구간 단위 셈여림을 만든다.
  // 3) 채널별로 프레이즈 곡선·박자 강세·당김음·음 길이·선율 윤곽을 더해 연속값 목표를 만든다.
  // 4) 기준 볼륨(중앙값)을 유지하도록 맞추고, 히스테리시스로 V 명령 수를 줄여 정수 볼륨으로 바꾼다.
  const DYNAMICS_GENRES = ["pop", "jazz", "ballad", "bossa", "rock", "funk", "classical"];
  const DYNAMICS_PROFILES = {
    //            박자 강세(4/4)                3/4      8분 엇박 16분 엇박 당김음 구간  프레이즈 길이  음높이 밀도
    pop:       { beat: [1.00, -0.25, 0.50, -0.20], beat3: [1.00, -0.25, -0.15], off8: 0.10, off16: -0.15, sync: 0.35, macro: 0.70, phrase: 0.70, length: 0.35, pitch: 0.25, density: 0.30 },
    jazz:      { beat: [0.20, 0.35, 0.10, 0.40],   beat3: [0.30, 0.20, 0.30],    off8: 0.55, off16: -0.05, sync: 0.60, macro: 0.60, phrase: 0.55, length: 0.30, pitch: 0.25, density: 0.25 },
    ballad:    { beat: [0.55, -0.15, 0.25, -0.15], beat3: [0.60, -0.15, -0.10], off8: 0.00, off16: -0.20, sync: 0.20, macro: 1.00, phrase: 1.05, length: 0.60, pitch: 0.40, density: 0.35 },
    bossa:     { beat: [0.50, 0.05, 0.25, 0.10],   beat3: [0.50, 0.05, 0.10],    off8: 0.40, off16: -0.05, sync: 0.45, macro: 0.50, phrase: 0.50, length: 0.25, pitch: 0.15, density: 0.25 },
    rock:      { beat: [1.00, 0.10, 0.85, 0.10],   beat3: [1.00, 0.10, 0.10],    off8: 0.05, off16: -0.15, sync: 0.30, macro: 0.55, phrase: 0.40, length: 0.20, pitch: 0.15, density: 0.20 },
    funk:      { beat: [0.55, -0.10, 0.25, -0.10], beat3: [0.55, -0.10, -0.10], off8: 0.30, off16: 0.55,  sync: 0.55, macro: 0.40, phrase: 0.35, length: 0.10, pitch: 0.10, density: 0.15 },
    classical: { beat: [0.80, -0.25, 0.35, -0.20], beat3: [0.85, -0.25, -0.15], off8: 0.00, off16: -0.15, sync: 0.25, macro: 1.10, phrase: 1.10, length: 0.65, pitch: 0.50, density: 0.35 }
  };
  // 강약: 점수 배율, 기준 볼륨 위/아래로 허용하는 폭, 같은 볼륨을 유지할 최소 노트 수, 바꿀 때 필요한 차이(히스테리시스).
  const DYNAMICS_STRENGTHS = {
    light:  { gain: 1.0, spanUp: 2, spanDown: 2, minHold: 3, hysteresis: 0.85 },
    normal: { gain: 1.7, spanUp: 3, spanDown: 3, minHold: 2, hysteresis: 0.75 },
    strong: { gain: 2.6, spanUp: 4, spanDown: 5, minHold: 1, hysteresis: 0.65 }
  };

  function generateDynamicsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const genre = String(options.genre || "pop").trim().toLowerCase();
    if (!DYNAMICS_GENRES.includes(genre)) throw new Error(tr("vol.err_genre"));
    const strength = normalizeGenerationStrength(options.strength);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");
    const targetPartIndexes = normalizeTargetPartIndexes(options, partCount);
    const outputParts = [...sourceParts];
    const partResults = [];
    let generatedCommands = 0;
    let changedNotes = 0;
    let processedPartCount = 0;
    let skippedExpressivePartCount = 0;
    let existingExpressivePartCount = 0;

    // 대상 채널은 파싱 오류를 그대로 알리고, 대상이 아닌 채널은 박자·구간 분석에만 쓰므로 실패해도 건너뛴다.
    const scannedParts = sourceParts.map((part, partIndex) => {
      const selected = targetPartIndexes == null || targetPartIndexes.has(partIndex);
      if (selected) return scanPartForDynamics(part, partIndex);
      try { return scanPartForDynamics(part, partIndex); } catch (_) { return null; }
    });
    const context = analyzeDynamicsContext(scannedParts);

    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      const selected = targetPartIndexes == null || targetPartIndexes.has(partIndex);
      if (!selected) {
        partResults.push({ partIndex, status: "unselected", generatedCommands: 0, changedNotes: 0 });
        continue;
      }

      const scanned = scannedParts[partIndex];
      const soundingNotes = scanned.notes.filter(note => note.volume > 0);
      if (soundingNotes.length < 2) {
        partResults.push({ partIndex, status: "no_notes", generatedCommands: 0, changedNotes: 0 });
        continue;
      }

      const distinctVolumes = [...new Set(soundingNotes.map(note => clamp(note.volume, 2, 15)))];
      const minVolume = Math.min(...distinctVolumes);
      const maxVolume = Math.max(...distinctVolumes);
      const volumeRange = maxVolume - minVolume;
      const hasExistingExpression = distinctVolumes.length >= 3 || volumeRange >= 2;
      if (hasExistingExpression) existingExpressivePartCount++;
      if (hasExistingExpression && options.overwriteExisting !== true) {
        skippedExpressivePartCount++;
        partResults.push({
          partIndex,
          status: "existing_expression",
          generatedCommands: 0,
          changedNotes: 0,
          distinctVolumeCount: distinctVolumes.length,
          minVolume,
          maxVolume,
          volumeRange,
          matchedConditions: [
            ...(distinctVolumes.length >= 3 ? ["distinct_values"] : []),
            ...(volumeRange >= 2 ? ["volume_range"] : [])
          ]
        });
        continue;
      }

      const generated = buildDynamicsTargets(scanned.notes, {
        genre,
        strength,
        partIndex,
        context,
        baseVolume: clamp(Math.round(medianNumber(soundingNotes.map(note => note.volume), DEFAULT_VOLUME)), 2, 15)
      });
      const rewritten = rewritePartWithDynamics(sourceParts[partIndex], scanned, generated.targets);
      outputParts[partIndex] = rewritten.part;
      generatedCommands += rewritten.generatedCommands;
      changedNotes += generated.changedNotes;
      processedPartCount++;
      partResults.push({
        partIndex,
        status: "generated",
        generatedCommands: rewritten.generatedCommands,
        changedNotes: generated.changedNotes,
        baseVolume: generated.baseVolume,
        minVolume: generated.minVolume,
        maxVolume: generated.maxVolume
      });
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
      genre,
      strength,
      meter: { beatsPerBar: context.beatsPerBar, phaseUnits: context.phase, confident: context.confident },
      generatedCommands,
      changedNotes,
      processedPartCount,
      skippedExpressivePartCount,
      existingExpressivePartCount,
      partResults
    };
  }

  // 모든 채널의 노트로 박자·마디 위치·마디별 에너지를 구한다.
  function analyzeDynamicsContext(scannedParts) {
    const q = durationUnits(4, 0);
    const s16 = durationUnits(16, 0);
    const onsets = [];
    let firstStart = Infinity;
    for (const part of scannedParts) {
      for (const note of part?.notes || []) {
        if (!(note.volume > 0)) continue;
        onsets.push(note);
        if (note.start < firstStart) firstStart = note.start;
      }
    }
    const fallback = { beatsPerBar: 4, bar: 4 * q, phase: 0, confident: false, barEnergy: [] };
    if (onsets.length < 8) return withBarEnergy(fallback, scannedParts);

    // 길게 울리는 음, 여러 채널이 같이 시작하는 자리, 가장 낮은 채널(베이스)이 들어오는 자리가 강박일 가능성이 높다.
    // 곡의 첫 음도 강박으로 본다. (왈츠처럼 매 박 음이 있어도 베이스가 1박에만 들어오면 3박자로 잡힌다.)
    let bassPart = null;
    let bassMedian = Infinity;
    for (const part of scannedParts) {
      const pitches = (part?.notes || []).filter(note => note.volume > 0).map(note => note.midi);
      if (pitches.length < 8) continue;
      const median = medianNumber(pitches, 60);
      if (median < bassMedian) { bassMedian = median; bassPart = part; }
    }
    const weightAt = new Map();
    for (const part of scannedParts) {
      const bassBonus = part && part === bassPart && scannedParts.filter(Boolean).length > 1 ? 2 : 0;
      for (const note of part?.notes || []) {
        if (!(note.volume > 0)) continue;
        const grid = Math.round(note.start / s16);
        const weight = 0.5 + Math.min(note.duration / q, 2) * 0.5 + bassBonus + (note.start === firstStart ? 2 : 0);
        weightAt.set(grid, (weightAt.get(grid) || 0) + weight);
      }
    }
    // 4분음표 안의 위치(16분 단위 0~3) 중 무게가 가장 큰 곳을 박 위치로 본다(대부분 0).
    const subWeights = [0, 0, 0, 0];
    for (const [grid, weight] of weightAt) subWeights[((grid % 4) + 4) % 4] += weight;
    const subPhase = subWeights.indexOf(Math.max(...subWeights));

    let best = null;
    for (const beatsPerBar of [4, 3]) {
      const sums = new Array(beatsPerBar).fill(0);
      for (const [grid, weight] of weightAt) {
        const rel = grid - subPhase;
        if (((rel % 4) + 4) % 4 !== 0) continue;
        sums[(((rel / 4) % beatsPerBar) + beatsPerBar) % beatsPerBar] += weight;
      }
      const mean = sums.reduce((a, b) => a + b, 0) / beatsPerBar || 1;
      const firstBeat = ((Math.round(firstStart / s16) - subPhase) / 4);
      const firstIndex = ((Math.round(firstBeat) % beatsPerBar) + beatsPerBar) % beatsPerBar;
      let top = 0;
      for (let k = 1; k < beatsPerBar; k++) if (sums[k] > sums[top]) top = k;
      // 첫 음 위치가 거의 같은 무게면 첫 음 쪽을 마디 시작으로 둔다.
      const downbeat = sums[firstIndex] >= sums[top] * 0.9 ? firstIndex : top;
      const salience = sums[downbeat] / mean;
      const candidate = { beatsPerBar, downbeat, salience };
      if (!best) best = candidate;
      else if (beatsPerBar === 3 && candidate.salience > best.salience * 1.15 && candidate.salience >= 1.35) best = candidate;
    }
    const bar = best.beatsPerBar * q;
    const phase = (((subPhase * s16 + best.downbeat * q) % bar) + bar) % bar;
    return withBarEnergy({ beatsPerBar: best.beatsPerBar, bar, phase, confident: best.salience >= 1.25, barEnergy: [] }, scannedParts);
  }

  // 마디별 에너지: 노트 시작 수, 연주 중인 채널 수, 평균 음높이를 순위로 정규화해 -1~1, 앞뒤 2마디로 부드럽게.
  function withBarEnergy(context, scannedParts) {
    const { bar, phase } = context;
    const stats = [];
    const statAt = index => {
      while (stats.length <= index) stats.push({ onsets: 0, parts: new Set(), pitchSum: 0, sounding: 0 });
      return stats[index];
    };
    scannedParts.forEach((part, partIndex) => {
      for (const note of part?.notes || []) {
        if (!(note.volume > 0)) continue;
        const index = Math.max(0, Math.floor((note.start - phase) / bar) + (phase > 0 ? 1 : 0));
        const stat = statAt(index);
        stat.onsets++;
        stat.parts.add(partIndex);
        stat.pitchSum += note.midi;
        stat.sounding += note.duration;
      }
    });
    if (stats.length < 4) return { ...context, barEnergy: stats.map(() => 0) };
    const active = stats.map((stat, index) => ({ index, stat })).filter(item => item.stat.onsets > 0);
    const rankOf = values => {
      const order = values.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
      const ranks = new Array(values.length);
      order.forEach(([, i], r) => { ranks[i] = values.length > 1 ? r / (values.length - 1) : 0.5; });
      return ranks;
    };
    const density = rankOf(active.map(item => item.stat.onsets));
    const parts = rankOf(active.map(item => item.stat.parts.size));
    const pitch = rankOf(active.map(item => item.stat.pitchSum / item.stat.onsets));
    const raw = new Array(stats.length).fill(-1);
    active.forEach((item, i) => { raw[item.index] = (0.5 * density[i] + 0.3 * parts[i] + 0.2 * pitch[i]) * 2 - 1; });
    const barEnergy = raw.map((_, index) => {
      let sum = 0;
      let weight = 0;
      for (let k = -2; k <= 2; k++) {
        const value = raw[index + k];
        if (value == null) continue;
        const w = 3 - Math.abs(k);
        sum += value * w;
        weight += w;
      }
      return weight ? sum / weight : 0;
    });
    return { ...context, barEnergy };
  }

  function scanPartForDynamics(input, partIndex) {
    const s = String(input || "").trim();
    let i = 0;
    let pos = 0;
    let octave = DEFAULT_OCTAVE;
    let defaultUnits = durationUnits(DEFAULT_LENGTH, 0);
    let volume = DEFAULT_VOLUME;
    let pendingTie = false;
    let lastTieTarget = null;
    const notes = [];
    const volumeRanges = [];

    const fail = message => { throw new Error(tr("mml.err_part_detail", [partIndex + 1, message])); };
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
      if (!isUsableInputLength(n.value)) fail(tr("mml.err_length", [n.value]));
      return durationUnits(n.value, dots);
    };
    const appendToken = token => {
      token.duration = quantizeInputDurationUnits(token.duration);
      if (pendingTie) {
        if (!lastTieTarget || lastTieTarget.kind !== token.kind || lastTieTarget.midi !== token.midi) fail(tr("mml.err_tie_same"));
        if (lastTieTarget.note) lastTieTarget.note.duration += token.duration;
        pos += token.duration;
        pendingTie = false;
        return;
      }
      let note = null;
      if (token.kind === "note") {
        note = { start: pos, duration: token.duration, midi: token.midi, volume, sourceIndex: token.sourceIndex };
        notes.push(note);
      }
      pos += token.duration;
      lastTieTarget = { kind: token.kind, midi: token.midi, note };
    };

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const raw = s[i];
      const ch = raw.toLowerCase();
      if (ch in NOTE_BASE || ch === "r" || ch === "n") {
        const sourceIndex = i;
        if (ch === "r") {
          i++;
          appendToken({ kind: "rest", duration: readLengthUnits(), sourceIndex });
          continue;
        }
        if (ch === "n") {
          i++;
          const n = readNumber();
          if (!n) fail(tr("mml.err_n_required"));
          const duration = durationUnitsFromBase(defaultUnits, readDotsCount());
          if (n.value === 0) appendToken({ kind: "rest", duration, sourceIndex });
          // N 코드 기준(o4 c = 48)은 MabiUtils가 정한다.
          else appendToken({ kind: "note", midi: Math.min(127, window.MabiUtils.nCodeToMidi(n.value)), duration, sourceIndex });
          continue;
        }
        i++;
        let semitone = NOTE_BASE[ch];
        if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
        else if (s[i] === "-") { semitone--; i++; }
        appendToken({ kind: "note", midi: (octave + 1) * 12 + semitone, duration: readLengthUnits(), sourceIndex });
      } else if (ch === "&") {
        i++;
        if (!lastTieTarget || pendingTie) fail(tr("mml.err_tie_invalid"));
        pendingTie = true;
      } else if (ch === "t") {
        i++;
        if (!readNumber()) fail(tr("mml.err_t_required"));
      } else if (ch === "o") {
        i++;
        const n = readNumber();
        if (!n) fail(tr("mml.err_o_required"));
        octave = n.value;
      } else if (ch === "l") {
        i++;
        const n = readNumber();
        const dots = readDotsCount();
        if (!n || !isUsableInputLength(n.value)) fail(tr("mml.err_l_check"));
        defaultUnits = quantizeInputDurationUnits(durationUnits(n.value, dots));
      } else if (ch === "v") {
        const start = i++;
        const n = readNumber();
        if (!n) fail(tr("mml.err_v_required"));
        volume = clamp(n.value, 0, 15);
        volumeRanges.push({ start, end: i });
      } else if (raw === ">") {
        octave++;
        i++;
      } else if (raw === "<") {
        octave--;
        i++;
      } else if (raw === ";") {
        i++;
        break;
      } else {
        fail(tr("mml.err_unknown_char", [raw]));
      }
    }
    if (pendingTie) fail(tr("mml.err_tie_after"));
    return { source: s, notes, volumeRanges, length: pos };
  }

  function buildDynamicsTargets(allNotes, options) {
    const sounding = allNotes.filter(note => note.volume > 0);
    const baseVolume = clamp(options.baseVolume, 2, 15);
    const strengthConfig = DYNAMICS_STRENGTHS[options.strength] || DYNAMICS_STRENGTHS.normal;
    const profile = DYNAMICS_PROFILES[options.genre] || DYNAMICS_PROFILES.pop;
    const context = options.context || { beatsPerBar: 4, bar: WHOLE_UNITS, phase: 0, barEnergy: [] };
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s16 = durationUnits(16, 0);
    const bar = context.bar;
    const isMelody = options.partIndex === 0;
    const roleFactor = isMelody ? 1 : 0.7;
    const beatProfile = context.beatsPerBar === 3 ? profile.beat3 : profile.beat;
    const positionInBar = start => ((((start - context.phase) % bar) + bar) % bar);
    const barIndexOf = start => Math.max(0, Math.floor((start - context.phase) / bar) + (context.phase > 0 ? 1 : 0));

    // 프레이즈: 8분 쉼표 이상 끊기거나, 4마디 이상 이어진 뒤 마디 첫 박에서 새로 시작.
    const phrases = [];
    let current = [];
    let phraseStart = sounding[0]?.start || 0;
    for (let i = 0; i < sounding.length; i++) {
      const note = sounding[i];
      if (current.length) {
        const previous = sounding[i - 1];
        const gap = note.start - (previous.start + previous.duration);
        const longRun = note.start - phraseStart >= bar * 4 && positionInBar(note.start) < s16;
        if (gap >= e || longRun) {
          phrases.push(current);
          current = [];
          phraseStart = note.start;
        }
      }
      current.push(i);
    }
    if (current.length) phrases.push(current);

    // 구간 안의 노트 밀도(앞뒤 반 박)를 두 포인터로 센다.
    const localDensity = new Array(sounding.length).fill(0);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < sounding.length; i++) {
      const start = sounding[i].start;
      while (lo < sounding.length && sounding[lo].start < start - q / 2) lo++;
      while (hi < sounding.length && sounding[hi].start < start + q / 2) hi++;
      localDensity[i] = hi - lo;
    }

    const continuous = new Array(sounding.length).fill(0);
    const forceChange = new Set();
    for (const indexes of phrases) {
      const pitches = indexes.map(i => sounding[i].midi);
      const phraseMean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      indexes.forEach((noteIndex, localIndex) => {
        const note = sounding[noteIndex];
        // 프레이즈 곡선: 60% 지점에서 정점, 시작은 약간 여리게, 끝은 풀어 준다.
        const progress = indexes.length <= 1 ? 0.6 : localIndex / (indexes.length - 1);
        const arch = progress <= 0.6 ? Math.sin((Math.PI / 2) * (progress / 0.6)) : Math.cos((Math.PI / 2) * ((progress - 0.6) / 0.4));
        let phraseScore = (arch - 0.45) * profile.phrase * roleFactor;
        if (localIndex === indexes.length - 1 && indexes.length > 1 && note.duration < q) phraseScore -= 0.25 * profile.phrase;

        // 박자 강세와 엇박.
        const withinBar = positionInBar(note.start);
        const beatIndex = Math.min(beatProfile.length - 1, Math.floor(withinBar / q));
        const withinBeat = withinBar - beatIndex * q;
        let metric = withinBeat < s16 / 2 ? beatProfile[beatIndex] : 0;
        if (Math.abs(withinBeat - e) < s16 / 2) metric += profile.off8;
        else if (withinBeat >= s16 / 2 && Math.abs(withinBeat - e) >= s16 / 2) metric += profile.off16;
        // 당김음: 박 사이에서 시작해 다음 박을 넘겨 이어지는 음.
        const nextBeat = note.start - withinBeat + q;
        const syncopated = withinBeat >= s16 / 2 && note.start + note.duration > nextBeat + s16 / 2;
        if (syncopated) metric += profile.sync;

        // 음 길이: 길수록 조금 세게, 아주 짧으면 조금 여리게.
        const lengthScore = Math.max(-1, Math.min(1, Math.log2(Math.max(note.duration, 1) / e) / 2)) * profile.length;
        // 선율 윤곽: 프레이즈 평균보다 높으면 세게, 앞뒤보다 2반음 이상 높은 정점은 추가 강세.
        let pitchScore = Math.max(-1, Math.min(1, (note.midi - phraseMean) / 7)) * profile.pitch * roleFactor;
        const prev = localIndex > 0 ? sounding[indexes[localIndex - 1]] : null;
        const next = localIndex < indexes.length - 1 ? sounding[indexes[localIndex + 1]] : null;
        if (prev && next && note.midi - prev.midi >= 2 && note.midi - next.midi >= 2) pitchScore += 0.3 * profile.pitch * roleFactor;
        // 빠른 음이 몰린 곳의 개별 음은 강세를 덜 준다.
        const density = localDensity[noteIndex];
        const densityScore = density >= 5 ? -profile.density : (density <= 1 ? profile.density * 0.2 : 0);
        // 구간 셈여림(모든 채널 공통).
        const macro = (context.barEnergy[barIndexOf(note.start)] || 0) * profile.macro;

        continuous[noteIndex] = (macro + phraseScore + metric + lengthScore + pitchScore + densityScore) * strengthConfig.gain;
        if (localIndex === 0 || (withinBar < s16 / 2 && beatProfile[0] >= 0.5)) forceChange.add(note);
      });
    }

    // 기준 볼륨(원래 중앙값)이 유지되도록 가운데를 맞춘 뒤, 허용 폭 안으로 위/아래를 따로 눌러 담는다.
    const center = medianNumber(continuous, 0);
    const upRoom = Math.max(0, Math.min(strengthConfig.spanUp, 15 - baseVolume));
    const downRoom = Math.max(0, Math.min(strengthConfig.spanDown, baseVolume - 2));
    const centered = continuous.map(value => value - center);
    const maxUp = Math.max(0, ...centered);
    const maxDown = Math.max(0, ...centered.map(value => -value));
    const values = new Map();
    sounding.forEach((note, i) => {
      const value = centered[i];
      const scaled = value >= 0 ? (maxUp > upRoom ? value * (upRoom / maxUp) : value) : (maxDown > downRoom ? value * (downRoom / maxDown) : value);
      values.set(note, baseVolume + scaled);
    });

    const targets = new Map();
    let currentVolume = null;
    let notesSinceChange = 0;
    let changedNotes = 0;
    let minVolume = 15;
    let maxVolume = 2;
    for (const note of allNotes) {
      if (note.volume <= 0) {
        targets.set(note, 0);
        currentVolume = 0;
        notesSinceChange = 0;
        continue;
      }
      const value = values.get(note) ?? baseVolume;
      const rounded = clamp(Math.round(value), 2, 15);
      if (currentVolume == null || currentVolume === 0) {
        currentVolume = rounded;
        notesSinceChange = 0;
      } else if (rounded !== currentVolume && Math.abs(value - currentVolume) >= strengthConfig.hysteresis) {
        const allow = forceChange.has(note) || Math.abs(rounded - currentVolume) >= 2 || notesSinceChange >= strengthConfig.minHold;
        if (allow) {
          currentVolume = rounded;
          notesSinceChange = 0;
        }
      }
      targets.set(note, currentVolume);
      notesSinceChange++;
      if (currentVolume !== clamp(note.volume, 2, 15)) changedNotes++;
      minVolume = Math.min(minVolume, currentVolume);
      maxVolume = Math.max(maxVolume, currentVolume);
    }
    return { targets, changedNotes, baseVolume, minVolume, maxVolume };
  }

  function rewritePartWithDynamics(source, scanned, targets) {
    const insertions = new Map();
    let currentVolume = null;
    let generatedCommands = 0;
    for (const note of scanned.notes) {
      const target = targets.get(note);
      if (!Number.isFinite(target)) continue;
      if (currentVolume === target) continue;
      insertions.set(note.sourceIndex, `${insertions.get(note.sourceIndex) || ""}V${target}`);
      currentVolume = target;
      generatedCommands++;
    }
    const skipped = new Set();
    for (const range of scanned.volumeRanges) for (let index = range.start; index < range.end; index++) skipped.add(index);
    let out = "";
    for (let index = 0; index <= source.length; index++) {
      if (insertions.has(index)) out += insertions.get(index);
      if (index < source.length && !skipped.has(index)) out += source[index];
    }
    return { part: out, generatedCommands };
  }

  function countShortRestsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const threshold = normalizeRestTrimThreshold(options);
    const counts = sourceParts.map((part, index) => {
      const parsed = parsePart(part, index, { mergeRests: false });
      return countAbsorbableShortRests(parsed.events, threshold);
    });

    return {
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
      threshold
    };
  }

  function trimShortRestsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const perPartModes = Array.isArray(options.partModes) ? options.partModes.slice(0, partCount) : null;
    const threshold = perPartModes ? null : normalizeRestTrimThreshold(options);
    const targetPartIndexes = perPartModes ? null : normalizeTargetPartIndexes(options, partCount);
    const partThresholds = perPartModes
      ? Array.from({ length: partCount }, (_, index) => {
          const mode = String(perPartModes[index] ?? "keep").toLowerCase();
          if (!mode || mode === "keep") return null;
          return normalizeRestTrimThreshold(mode === "all" ? { all: true } : { denom: Number(mode) });
        })
      : null;

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let removed = 0;
    let removedUnits = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const partThreshold = partThresholds ? partThresholds[i] : threshold;
      const shouldTrim = partThresholds ? Boolean(partThreshold) : (targetPartIndexes == null || targetPartIndexes.has(i));
      let events;
      if (shouldTrim) {
        const trimmed = absorbShortRests(parsedParts[i].events, partThreshold, tempoMap);
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


  function adjustVolumesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const preserveZeroMinOne = Boolean(options.preserveZeroMinOne);
    const partDeltas = Array.isArray(options.partDeltas)
      ? Array.from({ length: partCount }, (_, index) => {
          const value = Number(options.partDeltas[index] ?? 0);
          if (!Number.isFinite(value)) throw new Error(tr("vol.err_number"));
          return clamp(value, -15, 15);
        })
      : null;
    const rawDelta = Number(options.delta ?? 0);
    if (!partDeltas && !Number.isFinite(rawDelta)) throw new Error(tr("vol.err_number"));
    const delta = partDeltas ? 0 : clamp(rawDelta, -15, 15);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const targetPartIndexes = partDeltas ? null : normalizeTargetPartIndexes(options, partCount);
    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let touchedNotes = 0;
    let changedNotes = 0;
    let clampedNotes = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const partDelta = partDeltas ? partDeltas[i] : delta;
      const shouldAdjust = partDeltas ? partDelta !== 0 : (targetPartIndexes == null || targetPartIndexes.has(i));
      if (!shouldAdjust) {
        outputParts.push(sourceParts[i] || "");
        continue;
      }

      let events = parsedParts[i].events.map(ev => {
        if (ev.type !== "note") return { ...ev };
        const beforeVolume = clamp(ev.volume, 0, 15);
        const unclamped = beforeVolume + partDelta;
        let afterVolume = clamp(unclamped, 0, 15);
        if (preserveZeroMinOne) {
          afterVolume = beforeVolume === 0 ? 0 : Math.max(1, afterVolume);
        }
        touchedNotes++;
        if (afterVolume !== beforeVolume) changedNotes++;
        if (afterVolume !== unclamped) clampedNotes++;
        return { ...ev, volume: afterVolume };
      });

      events = mergeAdjacentRests(events);
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
      delta,
      partDeltas,
      touchedNotes,
      changedNotes,
      clampedNotes,
      tempoMap
    };
  }


  function setVolumesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const preserveZeroMinOne = Boolean(options.preserveZeroMinOne);
    const partVolumes = Array.from({ length: partCount }, (_, index) => {
      const raw = Array.isArray(options.partVolumes) ? options.partVolumes[index] : options.volume;
      if (raw === null || raw === undefined || raw === "" || String(raw).toLowerCase() === "keep") return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(tr("vol.err_number"));
      return clamp(Math.round(value), 0, 15);
    });
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let touchedNotes = 0;
    let changedNotes = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const fixedVolume = partVolumes[i];
      if (fixedVolume == null) {
        outputParts.push(sourceParts[i] || "");
        continue;
      }

      let events = parsedParts[i].events.map(ev => {
        if (ev.type !== "note") return { ...ev };
        const beforeVolume = clamp(ev.volume, 0, 15);
        const afterVolume = preserveZeroMinOne
          ? (beforeVolume === 0 ? 0 : Math.max(1, fixedVolume))
          : fixedVolume;
        touchedNotes++;
        if (beforeVolume !== afterVolume) changedNotes++;
        return { ...ev, volume: afterVolume };
      });

      events = mergeAdjacentRests(events);
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
      partVolumes,
      touchedNotes,
      changedNotes,
      tempoMap
    };
  }


  /**
   * 볼륨 간소화(템포 간소화와 같은 방식): 파트별로 음의 볼륨을 앞에서부터 보면서, 직전에 유지한 볼륨과의 차이가
   * maxDelta 이하이면 직전 볼륨을 그대로 씁니다. 파트의 최저/최고 볼륨인 음은 건드리지 않고,
   * 원래 V0인 음은 V0으로 두며 V0이 아닌 음이 V0이 되지는 않습니다(최소 V1).
   * options: { partCount, maxDelta = 1 }
   */
  function simplifyVolumesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const maxDelta = clamp(Math.round(Number(options.maxDelta ?? 1) || 1), 1, 14);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let changedNotes = 0;
    let changesBefore = 0;
    let changesAfter = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const notes = parsedParts[i].events.filter(ev => ev.type === "note");
      if (!notes.length) {
        outputParts.push(sourceParts[i] || "");
        continue;
      }
      let partMin = 15;
      let partMax = 0;
      for (const ev of notes) {
        const v = clamp(ev.volume, 0, 15);
        if (v < partMin) partMin = v;
        if (v > partMax) partMax = v;
      }
      let prevBefore = null;
      let prevAfter = null;
      let events = parsedParts[i].events.map(ev => {
        if (ev.type !== "note") return { ...ev };
        const before = clamp(ev.volume, 0, 15);
        let after = before;
        const isExtreme = before === partMin || before === partMax;
        if (!isExtreme && prevAfter !== null && Math.abs(before - prevAfter) <= maxDelta) {
          after = before === 0 ? 0 : Math.max(1, prevAfter);
        }
        if (prevBefore !== null && before !== prevBefore) changesBefore++;
        if (prevAfter !== null && after !== prevAfter) changesAfter++;
        if (after !== before) changedNotes++;
        prevBefore = before;
        prevAfter = after;
        return { ...ev, volume: after };
      });

      events = mergeAdjacentRests(events);
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
      maxDelta,
      changedNotes,
      changesBefore,
      changesAfter,
      removedChanges: changesBefore - changesAfter
    };
  }


  function buildTempoSecondIndex(tempoMap) {
    const beatUnits = durationUnits(4, 0);
    const normalized = normalizeTempoEvents(tempoMap || []);
    const segments = [];
    let seconds = 0;
    let previousPos = 0;
    let previousBpm = normalized[0]?.bpm || DEFAULT_TEMPO;
    segments.push({ pos: 0, bpm: previousBpm, seconds: 0 });
    for (let index = 1; index < normalized.length; index++) {
      const event = normalized[index];
      const pos = Math.max(previousPos, Number(event.pos) || 0);
      seconds += (pos - previousPos) * (60 / Math.max(1, previousBpm)) / beatUnits;
      previousPos = pos;
      previousBpm = Math.max(1, Number(event.bpm) || DEFAULT_TEMPO);
      segments.push({ pos: previousPos, bpm: previousBpm, seconds });
    }
    return { segments, beatUnits };
  }

  function secondsAtUnits(index, rawPos) {
    const pos = Math.max(0, Number(rawPos) || 0);
    const segments = index?.segments || [];
    if (!segments.length) return pos * (60 / DEFAULT_TEMPO) / durationUnits(4, 0);
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (segments[middle].pos <= pos + EPS) low = middle;
      else high = middle - 1;
    }
    const segment = segments[low];
    return segment.seconds + (pos - segment.pos) * (60 / Math.max(1, segment.bpm)) / index.beatUnits;
  }

  function applyFadeMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const fadeInSeconds = Math.max(0, Number(options.fadeInSeconds ?? options.fadeIn ?? 0) || 0);
    const fadeOutSeconds = Math.max(0, Number(options.fadeOutSeconds ?? options.fadeOut ?? 0) || 0);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    if (fadeInSeconds <= EPS && fadeOutSeconds <= EPS) {
      return { mml: String(text || ""), parts: sourceParts, fadeInSeconds: 0, fadeOutSeconds: 0, changedNotes: 0 };
    }

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(part => part.tempos));
    const hasAnyContent = parsedParts.some(part => part.events.length || part.tempos.length || String(part.raw || "").trim());

    let firstSoundUnit = Infinity;
    let lastSoundStartUnit = -Infinity;
    let soundingNotes = 0;
    for (const part of parsedParts) {
      for (const event of part.events) {
        if (event.type !== "note" || clamp(event.volume, 0, 15) <= 0) continue;
        firstSoundUnit = Math.min(firstSoundUnit, event.start);
        lastSoundStartUnit = Math.max(lastSoundStartUnit, event.start);
        soundingNotes += 1;
      }
    }
    if (!Number.isFinite(firstSoundUnit) || !Number.isFinite(lastSoundStartUnit) || soundingNotes <= 0) {
      return { mml: String(text || ""), parts: sourceParts, fadeInSeconds, fadeOutSeconds, changedNotes: 0, tempoMap };
    }

    const secondIndex = buildTempoSecondIndex(tempoMap);
    const firstSoundSeconds = secondsAtUnits(secondIndex, firstSoundUnit);
    const lastSoundStartSeconds = secondsAtUnits(secondIndex, lastSoundStartUnit);
    const noteStartSpanSeconds = Math.max(0, lastSoundStartSeconds - firstSoundSeconds);

    // MML volume commands are note-level.  The fade window therefore uses note
    // start times: fade-in begins at the first sounding note, and fade-out ends
    // with the final sounding note starting at V1.  When a score is shorter than
    // the requested envelope, fit the envelope into the available note-onset span.
    let effectiveFadeInSeconds = fadeInSeconds > EPS ? Math.min(fadeInSeconds, noteStartSpanSeconds) : 0;
    let effectiveFadeOutSeconds = fadeOutSeconds > EPS ? Math.min(fadeOutSeconds, noteStartSpanSeconds) : 0;
    if (noteStartSpanSeconds > EPS && effectiveFadeInSeconds > EPS && effectiveFadeOutSeconds > EPS) {
      const combined = effectiveFadeInSeconds + effectiveFadeOutSeconds;
      if (combined > noteStartSpanSeconds + EPS) {
        const fit = noteStartSpanSeconds / combined;
        effectiveFadeInSeconds *= fit;
        effectiveFadeOutSeconds *= fit;
      }
    }
    const fadeOutStartSeconds = lastSoundStartSeconds - effectiveFadeOutSeconds;

    let changedNotes = 0;
    let touchedNotes = 0;
    const outputParts = [];

    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      let events = parsedParts[partIndex].events.map(event => {
        if (event.type !== "note") return { ...event };
        const originalVolume = clamp(event.volume, 0, 15);
        if (originalVolume <= 0) return { ...event, volume: originalVolume };

        touchedNotes += 1;
        const noteStartSeconds = secondsAtUnits(secondIndex, event.start);
        let factor = 1;

        if (fadeInSeconds > EPS) {
          let inFactor = 1;
          if (noteStartSpanSeconds <= EPS) inFactor = 0;
          else if (effectiveFadeInSeconds > EPS && noteStartSeconds <= firstSoundSeconds + effectiveFadeInSeconds + EPS) {
            inFactor = Math.max(0, Math.min(1, (noteStartSeconds - firstSoundSeconds) / effectiveFadeInSeconds));
          }
          factor = Math.min(factor, inFactor);
        }

        if (fadeOutSeconds > EPS) {
          let outFactor = 1;
          if (noteStartSpanSeconds <= EPS) outFactor = 0;
          else if (effectiveFadeOutSeconds > EPS && noteStartSeconds >= fadeOutStartSeconds - EPS) {
            outFactor = Math.max(0, Math.min(1, (lastSoundStartSeconds - noteStartSeconds) / effectiveFadeOutSeconds));
          }
          factor = Math.min(factor, outFactor);
        }

        // Interpolate between V1 and the note's own original volume.  V0 remains
        // silent and is handled above; V1 naturally stays V1 throughout the fade.
        const fadedVolume = factor >= 1 - EPS
          ? originalVolume
          : Math.max(1, Math.min(originalVolume, Math.round(1 + (originalVolume - 1) * factor)));
        if (fadedVolume !== originalVolume) changedNotes += 1;
        return { ...event, volume: fadedVolume };
      });

      events = mergeAdjacentRests(events);
      if (partIndex === 0) events = injectTempoEvents(events, tempoMap);
      outputParts.push(renderPart(events, {
        isMelody: partIndex === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: partIndex === 0 && hasAnyContent,
        partIndex
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    return {
      mml,
      parts: outputParts,
      fadeInSeconds,
      fadeOutSeconds,
      effectiveFadeInSeconds,
      effectiveFadeOutSeconds,
      firstSoundUnit,
      lastSoundStartUnit,
      firstSoundSeconds,
      lastSoundStartSeconds,
      noteStartSpanSeconds,
      touchedNotes,
      changedNotes,
      tempoMap
    };
  }

  function transposeOctavesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const partOctaves = Array.isArray(options.partOctaves)
      ? Array.from({ length: partCount }, (_, index) => {
          const value = Number(options.partOctaves[index] ?? 0);
          if (!Number.isFinite(value)) throw new Error(tr("pitch.err_number"));
          return clamp(Math.round(value), -7, 7);
        })
      : null;
    const rawOctaves = Number(options.octaves ?? options.delta ?? 0);
    if (!partOctaves && !Number.isFinite(rawOctaves)) throw new Error(tr("pitch.err_number"));
    const octaves = partOctaves ? 0 : clamp(Math.round(rawOctaves), -7, 7);
    let source = String(text || "").replace(/^\uFEFF/, "").trim();
    const wrapped = source.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (wrapped) source = wrapped[1];
    if (/\[|\]/.test(source)) throw new Error(tr("mml.err_brackets"));
    const sourceParts = source === "" ? [] : source.split(",").slice(0, partCount).map(part => String(part || "").trim());
    while (sourceParts.length < partCount) sourceParts.push("");

    const targetPartIndexes = partOctaves ? null : normalizeTargetPartIndexes(options, partCount);
    let touchedCommands = 0;
    let changedCommands = 0;
    let clampedCommands = 0;

    const outputParts = sourceParts.map((part, index) => {
      const partShift = partOctaves ? partOctaves[index] : octaves;
      const shouldAdjust = partOctaves ? partShift !== 0 : (targetPartIndexes == null || targetPartIndexes.has(index));
      if (!shouldAdjust) return part || "";

      return String(part || "").replace(/O(\d+)/gi, (full, digits) => {
        const beforeOctave = Number(digits);
        if (!Number.isInteger(beforeOctave)) return full;
        const requestedOctave = beforeOctave + partShift;
        const afterOctave = partShift === 0 ? beforeOctave : clamp(requestedOctave, 0, 7);
        touchedCommands++;
        if (afterOctave !== requestedOctave) clampedCommands++;
        if (afterOctave !== beforeOctave) changedCommands++;
        return `${full.charAt(0)}${afterOctave}`;
      });
    });

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      octaves,
      partOctaves,
      touchedCommands,
      changedCommands,
      clampedCommands
    };
  }


  function addLeadingSilenceMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const beats = Math.max(0, Number(options.beats ?? 8));
    const addUnits = Math.round(beats * durationUnits(4, 0));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const leadingUnits = findFirstNoteStart(parsedParts);
    const removeUnits = leadingUnits > EPS ? Math.round(leadingUnits) : 0;

    // "맨앞 무음 설정"은 누적 추가가 아니라 현재 첫 음 앞의 공통 무음을 먼저 제거한 뒤
    // 사용자가 지정한 길이만큼 T120 기준 무음을 새로 넣는 기능이다.
    const baseParts = removeUnits > 0
      ? parsedParts.map(part => ({
          ...part,
          events: shiftEventsAfterTrim(part.events, removeUnits)
        }))
      : parsedParts;
    const baseTempoMap = removeUnits > 0
      ? shiftTempoMapAfterTrim(tempoMap, removeUnits)
      : tempoMap;

    const renderBaseWithoutLeadingSilence = () => {
      const hasAnyContent = baseParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim()) || baseTempoMap.length > 0;
      const outputParts = [];
      for (let i = 0; i < partCount; i++) {
        let events = baseParts[i].events;
        if (i === 0) events = injectTempoEvents(events, baseTempoMap);
        outputParts.push(renderPart(events, {
          isMelody: i === 0,
          startTempo: baseTempoMap[0]?.bpm || DEFAULT_TEMPO,
          forceHeader: i === 0 && hasAnyContent,
          partIndex: i
        }));
      }
      return { outputParts, tempo: baseTempoMap };
    };

    if (addUnits <= 0) {
      const rendered = renderBaseWithoutLeadingSilence();
      const mml = composeMml(rendered.outputParts, { preserveEmpty: true, partCount });
      const before = countPartChars(sourceParts);
      const after = countPartChars(rendered.outputParts);
      return {
        mml,
        parts: rendered.outputParts,
        before,
        after,
        saved: before - after,
        tempoMap: rendered.tempo,
        addedUnits: 0,
        addedBeats: 0,
        removedLeadingUnits: removeUnits,
        removedLeadingBeats: removeUnits / durationUnits(4, 0)
      };
    }

    const shiftedTempoMap = buildTempoMapWithLeadingSilence(baseTempoMap, addUnits);
    const hasAnyContent = baseParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const hasPartContent = baseParts[i].events.length || String(baseParts[i].raw || "").trim();
      let events = hasPartContent
        ? prependRestToEvents(baseParts[i].events, addUnits)
        : [];
      if (i === 0) events = injectTempoEvents(events, shiftedTempoMap);
      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: DEFAULT_TEMPO,
        forceHeader: i === 0 && (hasAnyContent || shiftedTempoMap.length > 0),
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
      tempoMap: shiftedTempoMap,
      addedUnits: addUnits,
      addedBeats: addUnits / durationUnits(4, 0),
      removedLeadingUnits: removeUnits,
      removedLeadingBeats: removeUnits / durationUnits(4, 0)
    };
  }


  function findFirstNoteStart(parsedParts) {
    let first = Infinity;
    for (const part of parsedParts || []) {
      for (const ev of part.events || []) {
        if (ev.type === "note") first = Math.min(first, ev.start);
      }
    }
    return Number.isFinite(first) ? Math.max(0, Math.round(first)) : 0;
  }

  function shiftEventsAfterTrim(events, trimUnits) {
    const out = [];
    for (const ev of events || []) {
      const start = Number(ev.start) || 0;
      const end = start + (Number(ev.duration) || 0);
      if (end <= trimUnits + EPS) continue;
      if (ev.type === "rest") {
        const newStart = Math.max(0, Math.round(start - trimUnits));
        const newEnd = Math.max(0, Math.round(end - trimUnits));
        if (newEnd > newStart + EPS) out.push({ type: "rest", start: newStart, duration: newEnd - newStart });
        continue;
      }
      if (ev.type === "note") {
        const newStart = Math.max(0, Math.round(start - trimUnits));
        const newEnd = Math.max(newStart, Math.round(end - trimUnits));
        if (newEnd > newStart + EPS) out.push({ ...ev, start: newStart, duration: newEnd - newStart });
      }
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function shiftTempoMapAfterTrim(tempoMap, trimUnits) {
    const current = tempoAt(tempoMap, trimUnits);
    const shifted = [{ pos: 0, bpm: current, order: -1 }];
    let order = 0;
    for (const t of tempoMap || []) {
      if (t.pos > trimUnits + EPS) shifted.push({ pos: Math.round(t.pos - trimUnits), bpm: t.bpm, order: order++ });
    }
    return normalizeTempoEvents(shifted);
  }

  function prependRestToEvents(events, addUnits) {
    const out = [{ type: "rest", start: 0, duration: addUnits }];
    for (const ev of events || []) {
      if (ev.type !== "note" && ev.type !== "rest") continue;
      out.push({ ...ev, start: Math.round((Number(ev.start) || 0) + addUnits) });
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function buildTempoMapWithLeadingSilence(tempoMap, addUnits) {
    const originalStartTempo = tempoAt(tempoMap, 0);
    const out = [{ pos: 0, bpm: DEFAULT_TEMPO, order: -2 }];
    let order = 0;
    if (originalStartTempo !== DEFAULT_TEMPO) out.push({ pos: addUnits, bpm: originalStartTempo, order: order++ });
    for (const t of tempoMap || []) {
      if (t.pos <= EPS) continue;
      out.push({ pos: Math.round(t.pos + addUnits), bpm: t.bpm, order: order++ });
    }
    return normalizeTempoEvents(out);
  }


  function splitMmlPages(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const maxChars = Math.max(200, Math.round(Number(options.maxChars || options.maxPartChars || 2400)));
    // 분할 탐색은 마지막 허용 위치에서 뒤→앞으로 진행한다.
    // searchEndPercent는 "앞에서부터 몇 % 지점까지 탐색할지"를 뜻한다.
    // 예: 80이면 maxChars 2,400 기준 약 1,920자 지점까지 역방향 탐색한다.
    // 기존 searchSlackChars 옵션은 외부/이전 호출부 호환을 위해 계속 지원한다.
    const requestedSearchEndPercent = Number(options.searchEndPercent);
    const hasSearchEndPercent = options.searchEndPercent !== undefined
      && options.searchEndPercent !== null
      && Number.isFinite(requestedSearchEndPercent);
    const searchEndPercent = hasSearchEndPercent
      ? Math.max(0, Math.min(100, requestedSearchEndPercent))
      : null;
    const searchSlackChars = hasSearchEndPercent
      ? Math.max(0, maxChars - Math.round(maxChars * searchEndPercent / 100))
      : Math.max(0, Math.round(Number(options.searchSlackChars ?? (maxChars / 2))));
    const searchMinChars = hasSearchEndPercent
      ? Math.round(maxChars * searchEndPercent / 100)
      : Math.max(0, maxChars - searchSlackChars);
    // 공통 공백 길이 평가는 2박을 상한으로 둔다. 기존 minCommonSilenceBeats 옵션명도 하위 호환한다.
    const maxCommonSilenceUnits = Math.max(0, Math.round(Number(options.maxCommonSilenceBeats ?? options.minCommonSilenceBeats ?? 2) * durationUnits(4, 0)));
    const maxPages = Math.max(1, Math.min(200, Math.round(Number(options.maxPages || 120))));

    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const sourceLengths = sourceParts.map(part => String(part || "").length);
    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const splitTempoSecondIndex = buildTempoSecondIndex(tempoMap);
    const totalUnits = Math.max(
      0,
      ...parsedParts.map(p => partMusicalEnd(p.events)),
      ...tempoMap.map(t => t.pos || 0)
    );

    // Reuse a previously discovered timing plan when option changes preserve the
    // score timeline. Re-render each page once and fall back to a full search only
    // when a cached boundary now exceeds the character limit or no longer covers
    // the complete score.
    const preferredPages = Array.isArray(options.preferredPages) ? options.preferredPages : null;
    if (preferredPages?.length && totalUnits > EPS) {
      const reusedPages = [];
      let expectedStart = 0;
      let validPlan = true;
      for (let index = 0; index < preferredPages.length; index++) {
        const preferred = preferredPages[index] || {};
        const start = Math.max(0, Math.min(totalUnits, Math.round(Number(preferred.start) || 0)));
        const end = Math.max(start, Math.min(totalUnits, Math.round(Number(preferred.end) || 0)));
        const nextStart = Math.max(end, Math.min(totalUnits, Math.round(Number(preferred.nextStart ?? end) || 0)));
        if (Math.abs(start - expectedStart) > EPS || end <= start + EPS) {
          validPlan = false;
          break;
        }
        const rendered = renderPageSegment(parsedParts, tempoMap, start, end, partCount);
        const maxPartLength = Math.max(0, ...rendered.lengths);
        if (maxPartLength > maxChars) {
          validPlan = false;
          break;
        }
        reusedPages.push({
          index: index + 1,
          mml: rendered.mml,
          parts: rendered.parts,
          lengths: rendered.lengths,
          maxPartLength,
          start,
          end,
          nextStart,
          startSeconds: secondsAtUnits(splitTempoSecondIndex, start),
          endSeconds: secondsAtUnits(splitTempoSecondIndex, end),
          nextStartSeconds: secondsAtUnits(splitTempoSecondIndex, nextStart),
          sourcePositions: locateSplitSourcePositions(parsedParts, end),
          skippedUnits: Math.max(0, nextStart - end),
          reason: "cached-boundary",
          warning: ""
        });
        expectedStart = nextStart;
        if (expectedStart >= totalUnits - EPS) break;
      }
      if (validPlan && reusedPages.length && expectedStart >= totalUnits - EPS) {
        return {
          pages: reusedPages,
          maxChars,
          searchSlackChars,
          maxCommonSilenceUnits,
          minCommonSilenceUnits: maxCommonSilenceUnits,
          totalUnits,
          warnings: [],
          reusedPreferredPages: true
        };
      }
    }

    // 원본의 모든 채널이 제한 글자 수 이하면 분할 지점을 찾지 않는다.
    // 렌더링 과정에서 헤더나 쉼표가 추가되어 길이가 늘더라도 사용자가 입력한
    // 각 채널 자체가 제한 안에 있다면 원문을 한 페이지로 그대로 제공한다.
    if (sourceLengths.every(length => length <= maxChars)) {
      const mml = composeMml(sourceParts, { preserveEmpty: true, partCount });
      return {
        pages: [{
          index: 1,
          mml,
          parts: sourceParts.slice(),
          lengths: sourceLengths,
          maxPartLength: Math.max(0, ...sourceLengths),
          start: 0,
          end: totalUnits,
          nextStart: totalUnits,
          startSeconds: 0,
          endSeconds: secondsAtUnits(splitTempoSecondIndex, totalUnits),
          nextStartSeconds: secondsAtUnits(splitTempoSecondIndex, totalUnits),
          sourcePositions: locateSplitSourcePositions(parsedParts, totalUnits),
          skippedUnits: 0,
          reason: "within-limit",
          warning: ""
        }],
        maxChars,
        searchSlackChars,
        maxCommonSilenceUnits,
        minCommonSilenceUnits: maxCommonSilenceUnits,
        totalUnits,
        warnings: []
      };
    }

    if (totalUnits <= EPS) {
      const optimized = optimizeMml(text, { partCount });
      return {
        pages: [{
          index: 1,
          mml: optimized.mml,
          parts: optimized.parts,
          lengths: optimized.parts.map(p => p.length),
          maxPartLength: Math.max(0, ...optimized.parts.map(p => p.length)),
          start: 0,
          end: 0,
          nextStart: 0,
          startSeconds: 0,
          endSeconds: 0,
          nextStartSeconds: 0,
          sourcePositions: locateSplitSourcePositions(parsedParts, 0),
          skippedUnits: 0,
          reason: "empty",
          warning: ""
        }],
        maxChars,
        searchSlackChars,
        maxCommonSilenceUnits,
        minCommonSilenceUnits: maxCommonSilenceUnits,
        totalUnits,
        warnings: []
      };
    }

    const pages = [];
    const warnings = [];
    let pageStart = 0;
    let guard = 0;

    while (pageStart < totalUnits - EPS && guard++ < maxPages) {
      const cut = choosePageCut(parsedParts, tempoMap, pageStart, totalUnits, {
        partCount,
        maxChars,
        searchMinChars,
        strictSearchEnd: hasSearchEndPercent,
        maxCommonSilenceUnits
      });

      let pageEnd = Math.max(pageStart, Math.min(totalUnits, cut.end));
      let nextStart = Math.max(pageEnd, Math.min(totalUnits, cut.nextStart));
      if (pageEnd <= pageStart + EPS && totalUnits > pageStart + EPS) {
        pageEnd = Math.min(totalUnits, pageStart + durationUnits(4, 0));
        nextStart = pageEnd;
        cut.reason = "forced";
        cut.warning = tr("split.warn_forced_beat");
      }

      const rendered = renderPageSegment(parsedParts, tempoMap, pageStart, pageEnd, partCount);
      const page = {
        index: pages.length + 1,
        mml: rendered.mml,
        parts: rendered.parts,
        lengths: rendered.lengths,
        maxPartLength: Math.max(0, ...rendered.lengths),
        start: pageStart,
        end: pageEnd,
        nextStart,
        startSeconds: secondsAtUnits(splitTempoSecondIndex, pageStart),
        endSeconds: secondsAtUnits(splitTempoSecondIndex, pageEnd),
        nextStartSeconds: secondsAtUnits(splitTempoSecondIndex, nextStart),
        sourcePositions: locateSplitSourcePositions(parsedParts, pageEnd),
        skippedUnits: Math.max(0, nextStart - pageEnd),
        reason: cut.reason,
        warning: cut.warning || ""
      };
      pages.push(page);
      if (page.maxPartLength > maxChars) {
        warnings.push(tr("split.warn_page_over", [page.index, page.maxPartLength, maxChars]));
      }
      if (page.warning) warnings.push(tr("split.warn_page", [page.index, page.warning]));

      if (nextStart <= pageStart + EPS) break;
      pageStart = nextStart;
    }

    if (guard >= maxPages && pageStart < totalUnits - EPS) {
      warnings.push(tr("split.warn_too_many_pages"));
    }

    return {
      pages,
      maxChars,
      searchSlackChars,
      maxCommonSilenceUnits,
      minCommonSilenceUnits: maxCommonSilenceUnits,
      totalUnits,
      warnings
    };
  }

  function locateSplitSourcePositions(parsedParts, boundaryUnits) {
    const target = Math.max(0, Math.round(Number(boundaryUnits) || 0));
    return Array.from(parsedParts || []).map(part => {
      const rawLength = String(part?.raw || "").length;
      const anchors = [];
      for (const event of part?.events || []) {
        const start = Math.max(0, Number(event?.start) || 0);
        const duration = Math.max(0, Number(event?.duration) || 0);
        const sourceStart = Number(event?.sourceStart);
        if (!Number.isFinite(sourceStart) || sourceStart < 0) continue;
        anchors.push({
          pos: start,
          end: start + duration,
          sourceStart: Math.min(rawLength, Math.round(sourceStart)),
          sourceEnd: Math.min(rawLength, Math.max(0, Math.round(Number(event?.sourceEnd) || sourceStart)))
        });
      }
      for (const tempo of part?.tempos || []) {
        const sourceStart = Number(tempo?.sourceStart);
        if (!Number.isFinite(sourceStart) || sourceStart < 0) continue;
        const pos = Math.max(0, Number(tempo?.pos) || 0);
        anchors.push({
          pos,
          end: pos,
          sourceStart: Math.min(rawLength, Math.round(sourceStart)),
          sourceEnd: Math.min(rawLength, Math.max(0, Math.round(Number(tempo?.sourceEnd) || sourceStart)))
        });
      }
      anchors.sort((a, b) => a.pos - b.pos || a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd);
      const crossing = anchors.find(anchor => anchor.pos < target - EPS && anchor.end > target + EPS);
      if (crossing) return crossing.sourceStart;
      const next = anchors.find(anchor => anchor.pos >= target - EPS);
      if (next) return next.sourceStart;
      return rawLength;
    });
  }

  function choosePageCut(parsedParts, tempoMap, pageStart, totalUnits, options) {
    const { partCount, maxChars, searchMinChars, strictSearchEnd, maxCommonSilenceUnits } = options;
    const measureCache = new Map();
    const measure = (end) => {
      const key = String(Math.round(end));
      if (!measureCache.has(key)) {
        const safeEnd = Math.max(pageStart, Math.min(totalUnits, Math.round(end)));
        try {
          const rendered = renderPageSegment(parsedParts, tempoMap, pageStart, safeEnd, partCount);
          measureCache.set(key, {
            end: safeEnd,
            maxLen: Math.max(0, ...rendered.lengths),
            lengths: rendered.lengths
          });
        } catch (_) {
          measureCache.set(key, {
            end: safeEnd,
            maxLen: Infinity,
            lengths: []
          });
        }
      }
      return measureCache.get(key);
    };

    const wholeEstimate = estimatePageMaxLength(parsedParts, pageStart, totalUnits);
    if (wholeEstimate <= maxChars) {
      const whole = measure(totalUnits);
      if (whole.maxLen <= maxChars) {
        return { end: totalUnits, nextStart: totalUnits, reason: "last", warning: "" };
      }
    }

    const candidateEnds = collectBoundaryPoints(parsedParts, pageStart, totalUnits)
      .filter(pos => pos > pageStart + EPS && pos <= totalUnits + EPS)
      .sort((a, b) => a - b);
    if (!candidateEnds.length || candidateEnds[candidateEnds.length - 1] !== Math.round(totalUnits)) {
      candidateEnds.push(Math.round(totalUnits));
    }

    // The search itself is shared with the editor (split-search.js); this only describes the score to it.
    const found = window.MabiSplitSearch.searchBoundary({
      start: pageStart,
      candidates: candidateEnds,
      hintIndex: findEstimatedBestIndex(parsedParts, pageStart, candidateEnds, maxChars),
      measure,
      maxChars,
      searchMinChars,
      strict: strictSearchEnd,
      busy: getSplitBusyIntervals(parsedParts),
      maxSilence: maxCommonSilenceUnits,
      countClean: pos => countSafeChannelsAt(parsedParts, pos),
      channelCount: partCount,
      minAdvance: 1,
      norm: Math.round,
      eps: EPS
    });
    const warning = found.reason === "partial-boundary"
      ? tr("split.warn_partial_safe", [found.cleanChannels, partCount])
      : (found.reason === "char-limit" ? tr("split.warn_char_limit") : "");
    return { end: found.end, nextStart: found.nextStart, reason: found.reason, warning };
  }


  function findEstimatedBestIndex(parsedParts, pageStart, candidates, maxChars) {
    let lo = 0;
    let hi = candidates.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const est = estimatePageMaxLength(parsedParts, pageStart, candidates[mid]);
      if (est <= maxChars) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function lowerBoundNoteStart(notes, value) {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].start < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function getSplitPartNotes(part) {
    if (!part) return [];
    if (Array.isArray(part.__splitNotes)) return part.__splitNotes;
    const notes = (part.events || [])
      .filter(ev => ev.type === "note")
      .map(ev => ({ ...ev, end: ev.start + ev.duration }))
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
    try { Object.defineProperty(part, "__splitNotes", { value: notes, configurable: true }); }
    catch (_) { part.__splitNotes = notes; }
    return notes;
  }

  function estimatePageMaxLength(parsedParts, start, end) {
    let max = 0;
    for (const part of parsedParts || []) {
      const notes = getSplitPartNotes(part);
      let count = 0;
      let gaps = 0;
      let lastEnd = 0;
      let index = lowerBoundNoteStart(notes, start - EPS);
      for (; index < notes.length; index++) {
        const ev = notes[index];
        if (ev.start >= end - EPS) break;
        if (ev.end <= start + EPS) continue;
        const localStart = Math.max(0, ev.start - start);
        if (localStart > lastEnd + EPS) gaps++;
        count++;
        lastEnd = Math.max(lastEnd, Math.min(ev.end, end) - start);
      }
      if (count || gaps) {
        // 실제 최적화는 반복 길이/옥타브/볼륨을 꽤 줄이므로 보수적인 근사만 사용한다.
        max = Math.max(max, 10 + count * 1.35 + gaps * 2.4);
      }
    }
    return max;
  }

  function renderPageSegment(parsedParts, tempoMap, start, end, partCount) {
    start = Math.max(0, Math.round(start));
    end = Math.max(start, Math.round(end));
    const currentTempo = tempoAt(tempoMap, start);
    const relTempoMap = [{ pos: 0, bpm: currentTempo }];
    for (const t of tempoMap || []) {
      if (t.pos > start + EPS && t.pos < end - EPS) relTempoMap.push({ pos: Math.round(t.pos - start), bpm: t.bpm });
    }
    const hasAnyNotes = parsedParts.some(part => {
      const notes = getSplitPartNotes(part);
      const index = lowerBoundNoteStart(notes, start - EPS);
      return Boolean(notes[index] && notes[index].start < end - EPS);
    });
    const hasTempoInside = relTempoMap.length > 1;
    const outputParts = [];
    for (let i = 0; i < partCount; i++) {
      let events = buildPartSegmentEvents(parsedParts[i], start, end);
      if (i === 0) events = injectTempoEvents(events, relTempoMap);
      outputParts.push(renderPartFast(events, {
        isMelody: i === 0,
        startTempo: currentTempo,
        forceHeader: i === 0 && (hasAnyNotes || hasTempoInside),
        partIndex: i
      }));
    }
    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    return { mml, parts: outputParts, lengths: outputParts.map(part => String(part || "").length) };
  }

  function buildPartSegmentEvents(part, start, end) {
    const notes = getSplitPartNotes(part);
    const out = [];
    let cursor = 0;
    let index = lowerBoundNoteStart(notes, start - EPS);
    for (; index < notes.length; index++) {
      const note = notes[index];
      if (note.start >= end - EPS) break;
      if (note.end <= start + EPS) continue;
      const localStart = Math.max(0, Math.round(note.start - start));
      if (localStart > cursor) {
        out.push({ type: "rest", start: cursor, duration: localStart - cursor });
        cursor = localStart;
      }
      const clippedEnd = Math.min(note.end, end);
      const dur = Math.max(0, Math.round(clippedEnd - note.start));
      if (dur <= 0) continue;
      out.push({ type: "note", start: cursor, duration: dur, midi: note.midi, volume: note.volume });
      cursor += dur;
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function tempoAt(tempoMap, pos) {
    let bpm = DEFAULT_TEMPO;
    for (const t of tempoMap || []) {
      if (t.pos <= pos + EPS) bpm = t.bpm;
      else break;
    }
    return bpm;
  }

  function partMusicalEnd(events) {
    let end = 0;
    for (const ev of events || []) {
      if (ev.type === "note" || ev.type === "rest") end = Math.max(end, ev.start + ev.duration);
    }
    return end;
  }

  function collectAllNotes(parsedParts) {
    if (Array.isArray(parsedParts?.__splitAllNotes)) return parsedParts.__splitAllNotes;
    const notes = [];
    for (let p = 0; p < (parsedParts || []).length; p++) {
      for (const ev of getSplitPartNotes(parsedParts[p])) {
        notes.push({ part: p, start: ev.start, end: ev.end, midi: ev.midi });
      }
    }
    notes.sort((a, b) => a.start - b.start || a.end - b.end || a.part - b.part || a.midi - b.midi);
    try { Object.defineProperty(parsedParts, "__splitAllNotes", { value: notes, configurable: true }); }
    catch (_) { parsedParts.__splitAllNotes = notes; }
    return notes;
  }

  function getSplitBusyIntervals(parsedParts) {
    if (Array.isArray(parsedParts?.__splitBusyIntervals)) return parsedParts.__splitBusyIntervals;
    const busy = [];
    for (const note of collectAllNotes(parsedParts)) {
      if (!note || note.end <= note.start + EPS) continue;
      const last = busy[busy.length - 1];
      if (!last || note.start > last.end + EPS) {
        busy.push({ start: note.start, end: note.end });
      } else if (note.end > last.end) {
        last.end = note.end;
      }
    }
    try { Object.defineProperty(parsedParts, "__splitBusyIntervals", { value: busy, configurable: true }); }
    catch (_) { parsedParts.__splitBusyIntervals = busy; }
    return busy;
  }

  function collectBoundaryPoints(parsedParts, from, to) {
    const set = new Set([Math.round(to)]);
    for (const n of collectAllNotes(parsedParts)) {
      if (n.start > from + EPS && n.start < to + EPS) set.add(Math.round(n.start));
      if (n.end > from + EPS && n.end < to + EPS) set.add(Math.round(n.end));
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  function countSafeChannelsAt(parsedParts, pos) {
    let safe = 0;
    for (const part of parsedParts) {
      const notes = getSplitPartNotes(part);
      const nextIndex = lowerBoundNoteStart(notes, pos - EPS);
      const previous = nextIndex > 0 ? notes[nextIndex - 1] : null;
      const active = Boolean(previous && previous.start < pos - EPS && previous.end > pos + EPS);
      if (!active) safe++;
    }
    return safe;
  }

  function splitMmlPartsStrict(text) {
    let s = String(text || "").replace(/^\uFEFF/, "").trim();
    const m = s.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (m) s = m[1];
    if (/\[|\]/.test(s)) throw new Error(tr("mml.err_brackets"));
    if (s === "") return [];
    return s.split(",").map(part => normalizeCommandCase(part.trim()));
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

    const fail = message => { throw new Error(tr("mml.err_part_detail", [partIndex + 1, message])); };
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
      if (!isUsableInputLength(n.value)) fail(tr("mml.err_length_full", [n.value]));
      return durationUnits(n.value, dots);
    };
    const readNoteToken = () => {
      skipSpace();
      const sourceStart = i;
      const ch = s[i]?.toLowerCase();
      if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
      if (ch === "r") {
        i++;
        const duration = readLengthUnits();
        return { kind: "rest", duration, sourceStart, sourceEnd: i };
      }
      if (ch === "n") {
        i++;
        const num = readNumber();
        if (!num) fail(tr("mml.err_n_required"));
        if (num.value < 0 || num.value > 127) fail(tr("mml.err_n_range", [num.value]));
        const duration = durationUnitsFromBase(defaultUnits, readDotsCount());
        if (num.value === 0) return { kind: "rest", duration, sourceStart, sourceEnd: i };
        // N 코드 기준(o4 c = 48)은 MabiUtils가 정한다.
        return { kind: "note", midi: Math.min(127, window.MabiUtils.nCodeToMidi(num.value)), duration, volume, sourceStart, sourceEnd: i };
      }
      i++;
      let semitone = NOTE_BASE[ch];
      if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
      else if (s[i] === "-") { semitone--; i++; }
      const midi = (octave + 1) * 12 + semitone;
      const duration = readLengthUnits();
      return { kind: "note", midi, duration, volume, sourceStart, sourceEnd: i };
    };
    const appendToken = token => {
      if (!Number.isFinite(token.duration) || token.duration <= 0) {
        fail(tr("mml.err_tiny_fraction"));
      }
      token.duration = quantizeInputDurationUnits(token.duration);

      if (pendingTie) {
        if (!lastTieTarget) fail(tr("mml.err_tie_before"));
        if (lastTieTarget.kind !== token.kind || lastTieTarget.midi !== token.midi) fail(tr("mml.err_tie_same"));
        lastTieTarget.event.duration += token.duration;
        if (Number.isFinite(token.sourceEnd)) lastTieTarget.event.sourceEnd = Math.max(Number(lastTieTarget.event.sourceEnd) || 0, token.sourceEnd);
        pos += token.duration;
        pendingTie = false;
        return;
      }

      const sourceStart = Number.isFinite(token.sourceStart) ? token.sourceStart : -1;
      const sourceEnd = Number.isFinite(token.sourceEnd) ? token.sourceEnd : sourceStart;
      const ev = token.kind === "note"
        ? { type: "note", start: pos, duration: token.duration, midi: token.midi, volume: token.volume, sourceStart, sourceEnd }
        : { type: "rest", start: pos, duration: token.duration, sourceStart, sourceEnd };
      events.push(ev);
      pos += token.duration;
      lastTieTarget = { kind: token.kind, midi: token.midi, event: ev };
    };

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const commandStart = i;
      const raw = s[i];
      const ch = raw.toLowerCase();

      if (ch in NOTE_BASE || ch === "r" || ch === "n") {
        appendToken(readNoteToken());
      } else if (ch === "&") {
        i++;
        if (!lastTieTarget) fail(tr("mml.err_tie_before"));
        if (pendingTie) fail(tr("mml.err_tie_repeat"));
        pendingTie = true;
      } else if (ch === "t") {
        i++;
        const n = readNumber();
        if (!n) fail(tr("mml.err_t_required"));
        if (n.value < 32 || n.value > 255) fail(tr("mml.err_t_range", [n.value]));
        tempos.push({
          pos,
          bpm: n.value,
          part: partIndex,
          order: partIndex * 100000000 + order++,
          sourceStart: commandStart,
          sourceEnd: i
        });
      } else if (ch === "o") {
        i++;
        const n = readNumber();
        if (!n) fail(tr("mml.err_o_required"));
        if (n.value < 0 || n.value > 9) fail(tr("mml.err_o_range", [n.value]));
        octave = n.value;
      } else if (ch === "l") {
        i++;
        const n = readNumber();
        const dots = readDotsCount();
        if (!n || !isUsableInputLength(n.value)) fail(tr("mml.err_l_range"));
        defaultUnits = quantizeInputDurationUnits(durationUnits(n.value, dots));
      } else if (ch === "v") {
        i++;
        const n = readNumber();
        if (!n) fail(tr("mml.err_v_required"));
        if (n.value < 0 || n.value > 15) fail(tr("mml.err_v_range", [n.value]));
        volume = n.value;
      } else if (raw === ">") {
        i++;
        octave++;
        if (octave > 9) fail(tr("mml.err_octave_high"));
      } else if (raw === "<") {
        i++;
        octave--;
        if (octave < 0) fail(tr("mml.err_octave_low"));
      } else if (raw === ";") {
        i++;
        break;
      } else {
        fail(tr("mml.err_unknown_char", [raw]));
      }
    }
    if (pendingTie) fail(tr("mml.err_tie_after"));

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

  function normalizeTargetPartIndexes(options = {}, partCount = 6) {
    if (Array.isArray(options.targetPartIndexes)) {
      const set = new Set();
      for (const raw of options.targetPartIndexes) {
        const index = Number(raw);
        if (Number.isInteger(index) && index >= 0 && index < partCount) set.add(index);
      }
      return set;
    }
    if (Number.isInteger(options.targetPartIndex)) {
      return new Set([Math.max(0, Math.min(partCount - 1, options.targetPartIndex))]);
    }
    return null;
  }


  function normalizeRestTrimThreshold(options = {}) {
    if (options.all || String(options.denom || options.threshold || "").toLowerCase() === "all") {
      return { all: true, units: Infinity, denom: null };
    }
    const denom = Number(options.denom ?? options.thresholdDenom ?? options.threshold ?? 32);
    if (!VALID_LENGTHS.includes(denom) || denom < 4) {
      throw new Error(tr("rest.err_limit"));
    }
    return { all: false, units: durationUnits(denom, 0), denom };
  }

  function countAbsorbableShortRests(events, threshold) {
    let hasAbsorbableNote = false;
    let count = 0;

    for (const ev of events || []) {
      if (ev.type === "note") {
        hasAbsorbableNote = true;
        continue;
      }

      if (ev.type === "rest") {
        const canDelete = threshold.all || (Number.isFinite(ev.duration) && ev.duration <= threshold.units + EPS);
        if (canDelete && hasAbsorbableNote) {
          count++;
          continue;
        }
        hasAbsorbableNote = false;
        continue;
      }

      hasAbsorbableNote = false;
    }

    return count;
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

  function simplifyTemposMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, Number(options.partCount) || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const explicitEvents = parsedParts
      .flatMap(part => part.tempos)
      .map(event => ({ ...event }))
      .sort((left, right) => left.pos - right.pos || left.order - right.order || left.part - right.part);

    const thresholdSource = options.maxBpmDeltaExclusive ?? options.bpmThreshold;
    const maxBpmDeltaExclusive = Number.isFinite(Number(thresholdSource))
      ? Math.max(1, Number(thresholdSource))
      : 5;
    const preserveExtrema = options.preserveExtrema !== false;

    // A position can contain tempo commands in several parts. The command with the
    // highest common parser order is the effective one, while all source commands at
    // that position must be removed together if that effective change is simplified.
    const groupedByPosition = [];
    for (const event of explicitEvents) {
      let group = groupedByPosition[groupedByPosition.length - 1];
      if (!group || group.pos !== event.pos) {
        group = { pos: event.pos, events: [] };
        groupedByPosition.push(group);
      }
      group.events.push(event);
    }

    const effectiveEvents = groupedByPosition.map(group => {
      const winner = group.events[group.events.length - 1];
      return {
        pos: winner.pos,
        bpm: winner.bpm,
        order: winner.order,
        part: winner.part,
        events: group.events.map(event => ({ ...event })),
        implicit: false
      };
    });

    const timeline = effectiveEvents.slice();
    if (!timeline.length || timeline[0].pos !== 0) {
      timeline.unshift({
        pos: 0,
        bpm: DEFAULT_TEMPO,
        order: -1,
        part: -1,
        events: [],
        implicit: true
      });
    }

    // addLeadingSilenceMml() uses T120 only while the generated leading rest is
    // playing, then restores the song's original starting tempo at the first note.
    // Treat that leading default tempo as transport padding for cleanup comparisons.
    // Otherwise Player (cleanup after adding the leading gap) and Simple (cleanup
    // before adding it) can disagree about the song-wide min/max and previous tempo.
    const firstNoteStart = findFirstNoteStart(parsedParts);
    const firstTimelineEvent = timeline[0] || null;
    const nextTimelineEvent = timeline[1] || null;
    const hasLeadingDefaultTempoPadding = Boolean(
      firstTimelineEvent &&
      firstTimelineEvent.pos === 0 &&
      firstTimelineEvent.bpm === DEFAULT_TEMPO &&
      firstNoteStart > EPS &&
      nextTimelineEvent &&
      nextTimelineEvent.pos === firstNoteStart
    );
    const comparisonTimeline = hasLeadingDefaultTempoPadding ? timeline.slice(1) : timeline;
    const tempoValues = comparisonTimeline.length
      ? comparisonTimeline.map(event => event.bpm)
      : timeline.map(event => event.bpm);
    const minBpm = Math.min(...tempoValues);
    const maxBpm = Math.max(...tempoValues);
    const keptEvents = [];
    const removedEvents = [];
    let previousRetainedChange = null;

    for (let timelineIndex = 0; timelineIndex < timeline.length; timelineIndex++) {
      const event = timeline[timelineIndex];
      if (hasLeadingDefaultTempoPadding && timelineIndex === 0) {
        // Keep the padding tempo token in the output, but do not let it participate
        // in the musical tempo cleanup baseline or min/max protection.
        keptEvents.push(event);
        continue;
      }
      if (!previousRetainedChange) {
        keptEvents.push(event);
        previousRetainedChange = event;
        continue;
      }

      const isExtrema = preserveExtrema && (event.bpm === minBpm || event.bpm === maxBpm);
      const isSmallChange = Math.abs(event.bpm - previousRetainedChange.bpm) < maxBpmDeltaExclusive;

      // Tempo cleanup is distance-independent. Compare every tempo command against
      // the last retained tempo and remove changes inside the exclusive BPM range.
      // Global minimum/maximum tempo values remain protected when requested.
      if (!event.implicit && !isExtrema && isSmallChange) {
        removedEvents.push({
          ...event,
          previousPos: previousRetainedChange.pos,
          previousBpm: previousRetainedChange.bpm
        });
        continue;
      }

      keptEvents.push(event);
      previousRetainedChange = event;
    }

    const rangesByPart = Array.from({ length: partCount }, () => []);
    for (const event of removedEvents) {
      for (const sourceEvent of event.events || []) {
        const part = Number(sourceEvent.part);
        const start = Number(sourceEvent.sourceStart);
        const end = Number(sourceEvent.sourceEnd);
        if (!Number.isInteger(part) || part < 0 || part >= partCount) continue;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
        rangesByPart[part].push({ start, end });
      }
    }

    let removedTokenCount = 0;
    const outputParts = sourceParts.map((part, partIndex) => {
      const uniqueRanges = [];
      const seen = new Set();
      for (const range of rangesByPart[partIndex]) {
        const key = `${range.start}:${range.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueRanges.push(range);
      }
      uniqueRanges.sort((left, right) => right.start - left.start || right.end - left.end);
      removedTokenCount += uniqueRanges.length;
      let output = part;
      for (const range of uniqueRanges) {
        output = output.slice(0, range.start) + output.slice(range.end);
      }
      return output;
    });

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    const tempoMap = timeline.map(event => ({ pos: event.pos, bpm: event.bpm }));
    const simplifiedTempoMap = keptEvents.map(event => ({ pos: event.pos, bpm: event.bpm }));

    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      tempoMap,
      simplifiedTempoMap,
      removed: removedEvents.map(event => ({
        pos: event.pos,
        bpm: event.bpm,
        previousPos: event.previousPos,
        previousBpm: event.previousBpm,
        sourceCommandCount: event.events?.length || 0
      })),
      removedCount: removedEvents.length,
      removedTokenCount,
      beforeTempoCount: explicitEvents.length,
      afterTempoCount: Math.max(0, explicitEvents.length - removedTokenCount),
      minBpm,
      maxBpm,
      maxBpmDeltaExclusive,
      preserveExtrema,
      ignoredLeadingDefaultTempoForComparison: hasLeadingDefaultTempoPadding
    };
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


  function renderPartFast(events, options) {
    const musicalEvents = events.filter(ev => ev.type === "note" || ev.type === "rest");
    const firstNote = musicalEvents.find(ev => ev.type === "note");
    const initVolume = firstNote ? clamp(firstNote.volume, 0, 15) : DEFAULT_VOLUME;
    const initOctave = firstNote ? midiToOctave(firstNote.midi) : DEFAULT_OCTAVE;
    const hasAnything = options.forceHeader || musicalEvents.length || events.some(ev => ev.type === "tempo" || ev.preTempos?.length || ev.postTempos?.length);
    if (!hasAnything) return "";

    const initialL = chooseFastInitialL(musicalEvents);
    let currentVolume = initVolume;
    let currentOctave = initOctave;
    const chunks = [`${options.isMelody ? `T${options.startTempo || DEFAULT_TEMPO}` : ""}V${initVolume}O${initOctave}L${initialL.label}`];

    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const ev = events[eventIndex];
      if (ev.type === "tempo") {
        const tempo = renderTempoList(ev.preTempos);
        if (tempo) chunks.push(tempo);
        continue;
      }
      if (ev.tieFromPrev) chunks.push("&");
      const preTempo = renderTempoList(ev.preTempos);
      if (preTempo) chunks.push(preTempo);
      if (ev.type === "rest") {
        chunks.push(renderRestDuration(ev.duration, initialL.units));
        continue;
      }
      if (ev.type === "note") {
        const vol = clamp(ev.volume, 0, 15);
        let command = "";
        if (vol !== currentVolume) {
          command += `V${vol}`;
          currentVolume = vol;
        }
        const pitch = renderPitchWithBoundaryOptimization(events, eventIndex, currentOctave);
        command += pitch.prefix;
        currentOctave = pitch.octave;
        chunks.push(renderNoteDuration(command + pitch.symbol, pitch.symbol, ev.duration, initialL.units));
      }
    }
    return chunks.join("");
  }

  function chooseFastInitialL(events) {
    const musical = events || [];
    if (!musical.length) return L_STATES.find(x => x.label === String(DEFAULT_LENGTH)) || L_STATES[0];

    // Split-page measurement calls this function many times on overlapping note ranges.
    // Score repeated durations as a histogram so the cost is proportional to the number
    // of distinct durations rather than note count × seven L states.
    const durationCounts = new Map();
    for (const ev of musical) {
      if (ev.type !== "note" && ev.type !== "rest") continue;
      const key = `${ev.type === "rest" ? "r" : "n"}:${ev.duration}`;
      const item = durationCounts.get(key);
      if (item) item.count += 1;
      else durationCounts.set(key, { type: ev.type, duration: ev.duration, count: 1 });
    }
    if (!durationCounts.size) return L_STATES.find(x => x.label === String(DEFAULT_LENGTH)) || L_STATES[0];

    let best = null;
    for (const l of L_STATES) {
      let score = 0;
      for (const item of durationCounts.values()) {
        try {
          const length = item.type === "rest"
            ? renderRestDuration(item.duration, l.units).length
            : renderNoteDuration("c", "c", item.duration, l.units).length;
          score += length * item.count;
        } catch (_) {
          score += 9999 * item.count;
        }
      }
      // 짧은 악보에서는 기본 선언 길이 차이가 그대로 체감되므로 라벨 길이도 더한다.
      score += String(l.label).length;
      if (!best || score < best.score || (score === best.score && Number(l.label) < Number(best.label))) {
        best = { ...l, score };
      }
    }
    return best || L_STATES[0];
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

  function appendRenderPath(path, chunk) {
    const text = String(chunk || "");
    if (!text) return path;
    return {
      prev: path,
      chunk: text,
      length: (path?.length || 0) + text.length,
      lexRank: path?.lexRank || 0
    };
  }

  function flattenRenderPath(path) {
    if (!path) return "";
    const chunks = [];
    for (let cursor = path; cursor; cursor = cursor.prev) {
      if (cursor.chunk) chunks.push(cursor.chunk);
    }
    chunks.reverse();
    return chunks.join("");
  }

  function assignRenderLexRanks(items) {
    const ordered = items.slice().sort((a, b) => {
      if (a.prevLexRank !== b.prevLexRank) return a.prevLexRank - b.prevLexRank;
      if (a.chunk === b.chunk) return 0;
      return a.chunk < b.chunk ? -1 : 1;
    });
    let rank = -1;
    let previous = null;
    for (const item of ordered) {
      if (!previous || item.prevLexRank !== previous.prevLexRank || item.chunk !== previous.chunk) rank += 1;
      item.path.lexRank = rank;
      previous = item;
    }
  }

  function renderPartWithInitialState(events, state) {
    let currentVolume = state.initVolume;
    let currentOctave = state.initOctave;
    const decorated = [];

    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const ev = events[eventIndex];
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
      const pitch = renderPitchWithBoundaryOptimization(events, eventIndex, currentOctave);
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

    const startTempo = state.isMelody && state.emitStartTempo !== false ? `T${state.startTempo || DEFAULT_TEMPO}` : "";
    const header = `${startTempo}V${state.initVolume}O${state.initOctave}L${state.initialL.label}`;
    const initialPath = { prev: null, chunk: header, length: header.length, lexRank: 0 };
    let dp = new Map([[state.initialL.label, { path: initialPath, lState: state.initialL }]]);

    for (const ev of decorated) {
      if (ev.type === "tempo") {
        if (ev.pre) {
          for (const item of dp.values()) item.path = appendRenderPath(item.path, ev.pre);
        }
        continue;
      }

      // The event body depends only on the destination L state. The DP stores a
      // persistent path rather than copying the full MML string for every transition.
      // Distinct L-state paths have already diverged before their common end point, so
      // appending a new chunk preserves their previous lexicographic order. This lets
      // equal-length candidates use the previous rank without rebuilding long strings.
      const bodies = new Map();
      for (const targetL of L_STATES) bodies.set(targetL.label, renderDecoratedEvent(ev, targetL.units));

      const next = new Map();
      const rankItems = [];
      for (const targetL of L_STATES) {
        const body = bodies.get(targetL.label) || "";
        let bestItem = null;
        let bestChunk = "";
        let bestLength = Infinity;
        for (const item of dp.values()) {
          const change = targetL.label === item.lState.label ? "" : `L${targetL.label}`;
          const chunk = (ev.tiePrefix ? "&" : "") + (ev.pre || "") + change + body;
          const candidateLength = item.path.length + chunk.length;
          if (candidateLength < bestLength || (
            candidateLength === bestLength && bestItem && item.path.lexRank < bestItem.path.lexRank
          )) {
            bestItem = item;
            bestChunk = chunk;
            bestLength = candidateLength;
          }
        }
        if (!bestItem) continue;
        const path = appendRenderPath(bestItem.path, bestChunk);
        const nextItem = { path, lState: targetL };
        next.set(targetL.label, nextItem);
        rankItems.push({ path, prevLexRank: bestItem.path.lexRank, chunk: bestChunk });
      }
      assignRenderLexRanks(rankItems);
      dp = next;
    }

    let best = null;
    for (const item of dp.values()) {
      if (!best || item.path.length < best.path.length || (
        item.path.length === best.path.length && item.path.lexRank < best.path.lexRank
      )) best = item;
    }
    return best ? flattenRenderPath(best.path) : header;
  }

  function renderDecoratedEvent(ev, defaultUnits) {
    if (ev.type === "rest") return renderRestDuration(ev.duration, defaultUnits);
    return renderNoteDuration(ev.command + ev.symbol, ev.symbol, ev.duration, defaultUnits);
  }

  function renderTempoList(list) {
    return Array.from(list || []).map(bpm => `T${bpm}`).join("");
  }

  function renderPitch(midi, currentOctave) {
    if (midi < 0 || midi > 127) throw new Error(tr("mml.err_midi_range", [midi]));
    const targetOctave = midiToOctave(midi);
    if (targetOctave < 0 || targetOctave > 9) throw new Error(tr("mml.err_target_octave", [targetOctave]));
    const symbol = NOTE_NAMES[((midi % 12) + 12) % 12];
    const candidates = [];
    if (targetOctave === currentOctave) candidates.push({ prefix: "", symbol, octave: targetOctave });
    const delta = targetOctave - currentOctave;
    if (delta !== 0 && Math.abs(delta) <= 9) candidates.push({ prefix: delta > 0 ? ">".repeat(delta) : "<".repeat(-delta), symbol, octave: targetOctave });
    candidates.push({ prefix: `O${targetOctave}`, symbol, octave: targetOctave });
    candidates.sort((a, b) => (a.prefix.length + a.symbol.length) - (b.prefix.length + b.symbol.length) || a.prefix.localeCompare(b.prefix));
    return candidates[0];
  }

  function renderBoundaryAliasPitch(midi, currentOctave) {
    const targetOctave = midiToOctave(midi);
    const pitchClass = ((midi % 12) + 12) % 12;

    // Crossing B -> C upward can be written as b+ without changing the current octave.
    if (pitchClass === 0 && targetOctave === currentOctave + 1) {
      return { prefix: "", symbol: "b+", octave: currentOctave };
    }
    // Crossing C -> B downward can be written as c- without changing the current octave.
    if (pitchClass === 11 && targetOctave === currentOctave - 1) {
      return { prefix: "", symbol: "c-", octave: currentOctave };
    }
    return null;
  }

  function findNextNoteEvent(events, startIndex) {
    for (let index = startIndex + 1; index < events.length; index++) {
      if (events[index]?.type === "note") return events[index];
    }
    return null;
  }

  function pitchRenderLength(pitch) {
    return String(pitch?.prefix || "").length + String(pitch?.symbol || "").length;
  }

  function renderPitchWithBoundaryOptimization(events, eventIndex, currentOctave) {
    const ev = events[eventIndex];
    const natural = renderPitch(ev.midi, currentOctave);
    const alias = renderBoundaryAliasPitch(ev.midi, currentOctave);
    if (!alias) return natural;

    // b+ / c- costs the same as >c / <b for this note. Use it only when keeping
    // the current octave makes the next sounding note strictly shorter. Rests and
    // tempo commands do not affect octave state, so they are intentionally skipped.
    const nextNote = findNextNoteEvent(events, eventIndex);
    if (!nextNote) return natural;

    const naturalNext = renderPitch(nextNote.midi, natural.octave);
    const aliasNext = renderPitch(nextNote.midi, alias.octave);
    const naturalCost = pitchRenderLength(natural) + pitchRenderLength(naturalNext);
    const aliasCost = pitchRenderLength(alias) + pitchRenderLength(aliasNext);
    return aliasCost < naturalCost ? alias : natural;
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
    if (best == null) throw new Error(tr("mml.err_duration_render", [units]));
    noteDurationCache.set(key, best);
    return best;
  }

  function bestNoteTail(units, symbol, defaultUnits) {
    units = normalizeUnits(units);
    const key = `tail|${symbol}|${units}|${defaultUnits}`;
    if (noteDurationCache.has(key)) return noteDurationCache.get(key);
    if (units === 0) return "";
    const plan = getDurationRenderPlan(units, defaultUnits, String(symbol).length, 1, "note");
    const out = plan.map(suffix => `${symbol}${suffix}`).join("&");
    noteDurationCache.set(key, out);
    return out;
  }

  function renderRestDuration(units, defaultUnits) {
    units = normalizeUnits(units);
    const key = `${units}|${defaultUnits}`;
    if (restDurationCache.has(key)) return restDurationCache.get(key);
    const plan = getDurationRenderPlan(units, defaultUnits, 1, 0, "rest");
    const out = plan.map(suffix => `r${suffix}`).join("");
    restDurationCache.set(key, out);
    return out;
  }

  // Duration candidates are all multiples of a small common quantum (currently 8 units).
  // Solve only reachable states and retain a compact predecessor plan instead of repeatedly
  // concatenating complete MML strings for every intermediate duration.
  function getDurationRenderPlan(units, defaultUnits, symbolLength, separatorLength, kind) {
    const candidates = getDurationCandidates(defaultUnits);
    const quantum = durationCandidateQuantum(candidates);
    if (units % quantum !== 0) {
      const errorKey = kind === "rest" ? "mml.err_rest_render" : "mml.err_duration_render";
      throw new Error(tr(errorKey, [units]));
    }

    const cacheKey = `${kind}|${units}|${defaultUnits}|${symbolLength}|${separatorLength}`;
    const cached = durationPlanCache.get(cacheKey);
    if (cached) return cached;

    const scaledUnits = units / quantum;
    const lengths = new Float64Array(scaledUnits + 1);
    lengths.fill(Number.POSITIVE_INFINITY);
    lengths[0] = 0;
    const previous = new Int32Array(scaledUnits + 1);
    previous.fill(-1);
    const selected = new Int16Array(scaledUnits + 1);
    selected.fill(-1);

    for (let current = 1; current <= scaledUnits; current++) {
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        const candidate = candidates[candidateIndex];
        const candidateUnits = candidate.units / quantum;
        const previousUnits = current - candidateUnits;
        if (previousUnits < 0 || !Number.isFinite(lengths[previousUnits])) continue;
        const candidateLength = lengths[previousUnits]
          + symbolLength
          + candidate.suffix.length
          + (previousUnits > 0 ? separatorLength : 0);
        if (candidateLength < lengths[current]) {
          lengths[current] = candidateLength;
          previous[current] = previousUnits;
          selected[current] = candidateIndex;
        }
      }
    }

    if (!Number.isFinite(lengths[scaledUnits])) {
      const errorKey = kind === "rest" ? "mml.err_rest_render" : "mml.err_duration_render";
      throw new Error(tr(errorKey, [units]));
    }

    const reversed = [];
    for (let cursor = scaledUnits; cursor > 0;) {
      const candidateIndex = selected[cursor];
      const previousUnits = previous[cursor];
      if (candidateIndex < 0 || previousUnits < 0 || previousUnits >= cursor) {
        const errorKey = kind === "rest" ? "mml.err_rest_render" : "mml.err_duration_render";
        throw new Error(tr(errorKey, [units]));
      }
      reversed.push(candidates[candidateIndex].suffix);
      cursor = previousUnits;
    }

    const plan = Object.freeze(reversed.reverse());
    durationPlanCache.set(cacheKey, plan);
    return plan;
  }

  function durationCandidateQuantum(candidates) {
    let quantum = 0;
    for (const candidate of candidates || []) quantum = greatestCommonDivisor(quantum, candidate.units);
    return Math.max(1, quantum);
  }

  function greatestCommonDivisor(left, right) {
    let a = Math.abs(Math.round(Number(left) || 0));
    let b = Math.abs(Math.round(Number(right) || 0));
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a || 1;
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
    if (!isIntegerLike(value)) throw new Error(tr("mml.err_fraction_unsupported"));
    return Math.round(value);
  }

  function isIntegerLike(value) {
    return Number.isFinite(value) && Math.abs(value - Math.round(value)) < EPS;
  }

  function countPartChars(parts) {
    return Array.from(parts || []).reduce((sum, part) => sum + String(part || "").trim().length, 0);
  }

  window.MabiOptimizer = Object.freeze({ version: "5.1.1", optimizeMml, generateDynamicsMml, simplifyTemposMml, countShortRestsMml, trimShortRestsMml, addLeadingSilenceMml, adjustVolumesMml, setVolumesMml, simplifyVolumesMml, applyFadeMml, transposeOctavesMml, splitMmlPages });
})();
