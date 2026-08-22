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

  function generateAccompanimentMml(text, options = {}) {
    const partCount = 6;
    const genre = String(options.genre || "pop").trim().toLowerCase();
    const supportedGenres = new Set(["pop", "jazz", "ballad", "bossa", "rock", "funk", "classical"]);
    if (!supportedGenres.has(genre)) throw new Error(tr("accomp.err_genre"));

    const strength = normalizeGenerationStrength(options.strength);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const analysisPartIndexes = normalizeAccompanimentPartIndexes(options.analysisPartIndexes, parsedParts, "analysis");
    const generationPartIndexes = normalizeAccompanimentPartIndexes(options.generationPartIndexes, parsedParts, "generation");
    if (!analysisPartIndexes.length) throw new Error(tr("msg.select_one_ref"));
    if (!generationPartIndexes.length) throw new Error(tr("msg.select_one_ch_4"));

    const analysis = buildAccompanimentAnalysis(parsedParts, analysisPartIndexes);
    if (analysis.notes.length < 2 || !(analysis.songEnd > 0)) {
      throw new Error(tr("accomp.err_flow"));
    }

    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(part => part.tempos));
    const key = estimateGenreKey(analysis.notes);
    const baseVolume = clamp(Math.round(medianNumber(analysis.notes.map(note => note.volume), DEFAULT_VOLUME)) - 2, 3, 13);
    const chordPlan = buildGenreChordPlan(analysis.notes, key, analysis.songEnd, strength, genre);
    if (!chordPlan.length) throw new Error(tr("accomp.err_harmony"));

    const fullParts = buildGenreAccompanimentParts(genre, chordPlan, {
      songEnd: analysis.songEnd,
      strength,
      medianPitch: analysis.upperPitchCenter,
      baseVolume
    });
    const compactPart = buildCompactAccompanimentPart(genre, chordPlan, {
      songEnd: analysis.songEnd,
      strength,
      medianPitch: analysis.upperPitchCenter,
      baseVolume
    });
    const roleAssignments = chooseAccompanimentRoleAssignments(generationPartIndexes.length, fullParts, compactPart);

    const outputParts = sourceParts.slice();
    for (let order = 0; order < generationPartIndexes.length; order++) {
      const partIndex = generationPartIndexes[order];
      let events = roleAssignments[order]?.events || [];
      if (partIndex === 0) events = injectTempoEvents(events, tempoMap);
      outputParts[partIndex] = renderPartFast(events, {
        isMelody: partIndex === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: partIndex === 0,
        partIndex
      });
    }

    const overlapPartIndexes = analysisPartIndexes.filter(index => generationPartIndexes.includes(index));
    const replacedPartIndexes = generationPartIndexes.filter(index => parsedParts[index].events.some(event => event.type === "note"));
    const generatedRoles = roleAssignments.map((assignment, order) => ({
      partIndex: generationPartIndexes[order],
      role: assignment.role,
      noteCount: assignment.events.filter(event => event.type === "note").length
    }));
    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });

    return {
      mml,
      parts: outputParts,
      before: countPartChars(sourceParts),
      after: countPartChars(outputParts),
      genre,
      strength,
      analysisPartIndexes,
      generationPartIndexes,
      overlapPartIndexes,
      replacedPartIndexes,
      analyzedPartCount: analysisPartIndexes.length,
      generatedPartCount: generatedRoles.filter(role => role.noteCount > 0).length,
      generatedRoles,
      key: { tonic: key.tonic, mode: key.mode, label: formatGenreKeyLabel(key) },
      chordCount: chordPlan.length,
      analysisNoteCount: analysis.notes.length,
      songEnd: analysis.songEnd
    };
  }

  function normalizeAccompanimentPartIndexes(values, parsedParts, kind) {
    const source = Array.isArray(values) ? values : [];
    const result = [];
    const seen = new Set();
    for (const raw of source) {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= parsedParts.length || seen.has(index)) continue;
      seen.add(index);
      result.push(index);
    }
    if (result.length) return result.sort((a, b) => a - b);

    if (kind === "analysis") {
      return parsedParts
        .map((part, index) => part.events.some(event => event.type === "note") ? index : -1)
        .filter(index => index >= 0);
    }
    return parsedParts
      .map((part, index) => index > 0 && !part.events.some(event => event.type === "note") ? index : -1)
      .filter(index => index >= 0);
  }

  function buildAccompanimentAnalysis(parsedParts, partIndexes) {
    const noteMap = new Map();
    let songEnd = 0;
    for (const partIndex of partIndexes) {
      const part = parsedParts[partIndex];
      songEnd = Math.max(songEnd, Number(part.length) || 0);
      for (const event of part.events) {
        if (event.type !== "note" || !(event.duration > 0)) continue;
        const start = Math.max(0, Math.round(event.start || 0));
        const end = start + Math.max(1, Math.round(event.duration));
        const key = `${start}:${event.midi}`;
        const previous = noteMap.get(key);
        if (previous) {
          previous.duration = Math.max(previous.duration, end - start);
          previous.volume = Math.max(previous.volume, event.volume || DEFAULT_VOLUME);
          previous.sourceCount += 1;
        } else {
          noteMap.set(key, {
            ...event,
            start,
            duration: end - start,
            volume: clamp(event.volume ?? DEFAULT_VOLUME, 0, 15),
            sourcePartIndex: partIndex,
            sourceCount: 1
          });
        }
        songEnd = Math.max(songEnd, end);
      }
    }
    const notes = Array.from(noteMap.values()).sort((a, b) => a.start - b.start || a.midi - b.midi);
    const pitches = notes.map(note => note.midi).sort((a, b) => a - b);
    const upperIndex = Math.max(0, Math.min(pitches.length - 1, Math.round((pitches.length - 1) * 0.68)));
    const upperPitchCenter = pitches[upperIndex] ?? 64;
    return { notes, songEnd, upperPitchCenter };
  }

  function chooseAccompanimentRoleAssignments(targetCount, fullParts, compactPart) {
    const count = Math.max(1, Math.min(6, Number(targetCount) || 1));
    const hasNotes = events => Array.isArray(events) && events.some(event => event.type === "note");
    const voices = [
      { role: tr("accomp.role.low_harmony"), events: fullParts[0] || [] },
      { role: tr("accomp.role.mid_harmony"), events: fullParts[1] || [] },
      { role: tr("accomp.role.high_harmony"), events: fullParts[2] || [] },
      { role: tr("accomp.role.support"), events: fullParts[3] || [] }
    ].filter(item => hasNotes(item.events));
    const compact = { role: tr("accomp.role.core"), events: compactPart || [] };
    const bass = { role: tr("accomp.role.bass"), events: fullParts[4] || [] };
    if (count === 1) return [compact];

    const harmonyNeeded = count - 2;
    const harmony = voices.slice(Math.max(0, voices.length - harmonyNeeded));
    while (harmony.length < harmonyNeeded) {
      const shift = harmony.length % 2 === 0 ? -12 : 12;
      const shifted = shiftGeneratedEvents(compact.events, shift);
      harmony.unshift({ role: shift < 0 ? tr("accomp.role.low") : tr("accomp.role.high"), events: shifted });
    }
    return [...harmony.slice(-harmonyNeeded), compact, bass];
  }

  function shiftGeneratedEvents(events, semitones) {
    return (events || []).map(event => event.type === "note"
      ? { ...event, midi: clamp((event.midi || 60) + semitones, 12, 107) }
      : { ...event });
  }

  function buildCompactAccompanimentPart(genre, chordPlan, options) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s = durationUnits(16, 0);
    const minDuration = durationUnits(64, 0);
    const segments = [];
    let previousVoicing = null;
    const orderMap = {
      pop: [0, 1, 2, 1],
      jazz: [1, 2, 0, 2],
      ballad: [0, 1, 2, 1],
      bossa: [0, 2, 1, 2],
      rock: [0, 2, 0, 2],
      funk: [0, 2, 1, 2, 0, 1],
      classical: [0, 2, 1, 2]
    };
    const order = orderMap[genre] || orderMap.pop;

    for (const segment of chordPlan) {
      const voicing = chooseGenreVoicing(segment.chord, 3, options.medianPitch, previousVoicing, options.strength, genre);
      previousVoicing = voicing;
      let step = options.strength === "light" ? q : e;
      if (options.strength === "strong" && (genre === "funk" || genre === "rock")) step = s;
      const syncOffset = (genre === "jazz" || genre === "bossa" || genre === "funk") && options.strength !== "light" ? Math.floor(step / 2) : 0;
      let hitIndex = 0;
      for (let offset = syncOffset; offset < segment.duration; offset += step) {
        const start = segment.start + offset;
        const available = segment.end - start;
        if (available < minDuration) continue;
        const pitch = voicing[order[hitIndex % order.length] % Math.max(1, voicing.length)];
        const accent = hitIndex === 0 || (genre === "rock" && hitIndex % 2 === 0) || (genre === "funk" && hitIndex % 3 === 1);
        const rawDuration = Math.min(step * (genre === "ballad" ? 1 : 0.75), available);
        const quantizedDuration = Math.max(minDuration, Math.floor(rawDuration / minDuration) * minDuration);
        segments.push({
          start,
          duration: Math.min(quantizedDuration, available),
          midi: pitch,
          volume: clamp(options.baseVolume + (accent ? 1 : 0) + (options.strength === "strong" ? 1 : 0), 2, 14)
        });
        hitIndex++;
      }
    }
    return noteSegmentsToEvents(segments, options.songEnd);
  }

  function normalizeGenerationStrength(value) {
    const raw = String(value || "normal").trim().toLowerCase();
    return ["light", "normal", "strong"].includes(raw) ? raw : "normal";
  }

  function estimateGenreKey(notes) {
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    const minorScale = [0, 2, 3, 5, 7, 8, 10];
    const histogram = Array(12).fill(0);
    for (const note of notes) {
      const pc = ((note.midi % 12) + 12) % 12;
      const weight = Math.max(1, note.duration) * (0.65 + clamp(note.volume, 0, 15) / 24);
      histogram[pc] += weight;
    }

    const firstPc = ((notes[0]?.midi || 60) % 12 + 12) % 12;
    const lastPc = ((notes[notes.length - 1]?.midi || 60) % 12 + 12) % 12;
    let best = null;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ["major", "minor"]) {
        const scale = mode === "major" ? majorScale : minorScale;
        const scaleSet = new Set(scale.map(interval => (tonic + interval) % 12));
        let score = 0;
        for (let pc = 0; pc < 12; pc++) score += histogram[pc] * (scaleSet.has(pc) ? 2.5 : -2.2);
        score += histogram[tonic] * 1.8;
        const third = (tonic + (mode === "major" ? 4 : 3)) % 12;
        const fifth = (tonic + 7) % 12;
        score += histogram[third] * 0.65 + histogram[fifth] * 0.45;
        if (firstPc === tonic) score += 12;
        if (lastPc === tonic) score += 24;
        if (lastPc === third || lastPc === fifth) score += 8;
        if (!best || score > best.score) best = { tonic, mode, score, scale };
      }
    }
    return best || { tonic: 0, mode: "major", scale: majorScale, score: 0 };
  }

  function formatGenreKeyLabel(key) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${names[key.tonic] || "C"}${key.mode === "minor" ? "m" : ""}`;
  }


  function buildGenreChordPlan(notes, key, songEnd, strength, genre) {
    if (genre === "jazz") return buildJazzChordPlan(notes, key, songEnd, strength);

    const config = {
      pop: {
        chords: buildPopDiatonicChords(key),
        passing: false,
        split: intensity => strength === "strong" && intensity.score >= 0.52
      },
      ballad: {
        chords: buildBalladDiatonicChords(key),
        passing: false,
        split: intensity => strength === "strong" && intensity.score >= 0.58
      },
      bossa: {
        chords: buildJazzDiatonicChords(key),
        passing: strength === "strong",
        split: intensity => strength === "strong" || (strength === "normal" && intensity.score >= 0.48)
      },
      rock: {
        chords: buildRockDiatonicChords(key),
        passing: false,
        split: intensity => strength === "strong" && intensity.score >= 0.4
      },
      funk: {
        chords: buildFunkDiatonicChords(key),
        passing: false,
        split: intensity => strength !== "light" && intensity.score >= 0.34
      },
      classical: {
        chords: buildClassicalDiatonicChords(key),
        passing: false,
        split: intensity => strength === "strong" || (strength === "normal" && intensity.score >= 0.62)
      }
    }[genre];

    return buildConfiguredGenreChordPlan(notes, key, songEnd, strength, config);
  }

  function buildConfiguredGenreChordPlan(notes, key, songEnd, strength, config) {
    const BAR_UNITS = WHOLE_UNITS;
    const firstNoteStart = notes.reduce((min, note) => Math.min(min, note.start), Infinity);
    const lastNoteEnd = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    const start = Number.isFinite(firstNoteStart) ? Math.max(0, firstNoteStart) : 0;
    const end = Math.min(songEnd, Math.max(start + BAR_UNITS, Math.ceil(lastNoteEnd / BAR_UNITS) * BAR_UNITS));
    const chords = config?.chords?.length ? config.chords : buildJazzDiatonicChords(key);
    const segments = [];
    let previous = null;
    let segmentIndex = 0;

    for (let barStart = start; barStart < end; barStart += BAR_UNITS) {
      const barEnd = Math.min(barStart + BAR_UNITS, end);
      const barNotes = notes.filter(note => note.start < barEnd && note.start + note.duration > barStart);
      const intensity = measureGenreSegmentIntensity(barNotes, barStart, barEnd);
      const splitBar = Boolean(config?.split?.(intensity, barNotes));
      const segmentSize = splitBar ? BAR_UNITS / 2 : barEnd - barStart;

      for (let segmentStart = barStart; segmentStart < barEnd; segmentStart += segmentSize) {
        const segmentEnd = Math.min(segmentStart + segmentSize, barEnd);
        const segmentNotes = barNotes.filter(note => note.start < segmentEnd && note.start + note.duration > segmentStart);
        const isFinal = segmentEnd >= end - EPS;
        let chord = chooseJazzChordForSegment(segmentNotes, chords, key, previous, segmentIndex, isFinal);
        if (config?.passing) chord = applyJazzPassingHarmony(chord, previous, segmentNotes, key, segmentIndex, strength);
        const segmentIntensity = measureGenreSegmentIntensity(segmentNotes, segmentStart, segmentEnd);
        segments.push({
          start: segmentStart,
          end: segmentEnd,
          duration: segmentEnd - segmentStart,
          chord,
          intensity: segmentIntensity
        });
        previous = chord;
        segmentIndex++;
      }
    }
    return segments;
  }

  function buildPopDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const qualities = key.mode === "minor"
      ? ["minor", "dim", "major", "minor", "major", "major", "major"]
      : ["major", "minor", "minor", "major", "major", "minor", "dim"];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, qualities[degree], degree));
  }

  function buildClassicalDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 4, 5, 7, 9, 11];
    const qualities = key.mode === "minor"
      ? ["minor", "dim", "major", "minor", "major", "major", "dim"]
      : ["major", "minor", "minor", "major", "major", "minor", "dim"];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, qualities[degree], degree));
  }

  function buildBalladDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const qualities = key.mode === "minor"
      ? ["minAdd9", "m7b5", "add9", "min7", "sus4", "add9", "dom7"]
      : ["add9", "min7", "min7", "add9", "sus4", "min7", "dim"];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, qualities[degree], degree));
  }

  function buildRockDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, "power", degree));
  }

  function buildFunkDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const qualities = key.mode === "minor"
      ? ["min7", "m7b5", "maj7", "min7", "dom7", "maj7", "dom7"]
      : ["dom7", "min7", "min7", "dom7", "dom7", "min7", "m7b5"];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, qualities[degree], degree));
  }

  function buildJazzChordPlan(notes, key, songEnd, strength) {
    const BAR_UNITS = WHOLE_UNITS;
    const firstNoteStart = notes.reduce((min, note) => Math.min(min, note.start), Infinity);
    const lastNoteEnd = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    const start = Number.isFinite(firstNoteStart) ? Math.max(0, firstNoteStart) : 0;
    const end = Math.min(songEnd, Math.max(start + BAR_UNITS, Math.ceil(lastNoteEnd / BAR_UNITS) * BAR_UNITS));
    const chords = buildJazzDiatonicChords(key);
    const segments = [];
    let previous = null;
    let segmentIndex = 0;

    for (let barStart = start; barStart < end; barStart += BAR_UNITS) {
      const barEnd = Math.min(barStart + BAR_UNITS, end);
      const barNotes = notes.filter(note => note.start < barEnd && note.start + note.duration > barStart);
      const intensity = measureGenreSegmentIntensity(barNotes, barStart, barEnd);
      const splitBar = strength === "strong" && intensity.score >= 0.44 && barNotes.length >= 3;
      const segmentSize = splitBar ? BAR_UNITS / 2 : barEnd - barStart;

      for (let segmentStart = barStart; segmentStart < barEnd; segmentStart += segmentSize) {
        const segmentEnd = Math.min(segmentStart + segmentSize, barEnd);
        const segmentNotes = barNotes.filter(note => note.start < segmentEnd && note.start + note.duration > segmentStart);
        const isFinal = segmentEnd >= end - EPS;
        let chord = chooseJazzChordForSegment(segmentNotes, chords, key, previous, segmentIndex, isFinal);
        if (strength !== "light") chord = applyJazzPassingHarmony(chord, previous, segmentNotes, key, segmentIndex, strength);
        const segmentIntensity = measureGenreSegmentIntensity(segmentNotes, segmentStart, segmentEnd);
        segments.push({
          start: segmentStart,
          end: segmentEnd,
          duration: segmentEnd - segmentStart,
          chord,
          intensity: segmentIntensity
        });
        previous = chord;
        segmentIndex++;
      }
    }

    return segments;
  }

  function buildJazzDiatonicChords(key) {
    const roots = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const qualities = key.mode === "minor"
      ? ["min7", "m7b5", "maj7", "min7", "dom7", "maj7", "dom7"]
      : ["maj7", "min7", "min7", "maj7", "dom7", "min7", "m7b5"];
    return roots.map((interval, degree) => createJazzChord((key.tonic + interval) % 12, qualities[degree], degree));
  }

  function createJazzChord(rootPc, quality, degree = null, labelSuffix = "") {
    const intervalMap = {
      major: [0, 4, 7],
      minor: [0, 3, 7],
      add9: [0, 4, 7, 14],
      minAdd9: [0, 3, 7, 14],
      power: [0, 7],
      sus2: [0, 2, 7],
      sus4: [0, 5, 7],
      dim: [0, 3, 6],
      maj7: [0, 4, 7, 11],
      min7: [0, 3, 7, 10],
      dom7: [0, 4, 7, 10],
      m7b5: [0, 3, 6, 10],
      dim7: [0, 3, 6, 9]
    };
    const intervals = intervalMap[quality] || intervalMap.maj7;
    return {
      rootPc,
      quality,
      degree,
      labelSuffix,
      intervals,
      pcs: intervals.map(interval => (rootPc + interval) % 12)
    };
  }

  function chooseJazzChordForSegment(notes, chords, key, previous, segmentIndex, isFinal) {
    if (!notes.length) {
      const fallback = key.mode === "minor" ? [0, 5, 1, 4] : [0, 5, 1, 4];
      return chords[fallback[segmentIndex % fallback.length]];
    }

    let best = null;
    for (const chord of chords) {
      let score = scoreJazzChordAgainstNotes(chord, notes, key);
      score += scoreJazzChordProgression(previous, chord, key);
      if (isFinal && chord.degree === 0) score += 18;
      if (previous && previous.rootPc === chord.rootPc) score -= 1.5;
      if (!best || score > best.score) best = { chord, score };
    }
    return best?.chord || chords[0];
  }

  function scoreJazzChordAgainstNotes(chord, notes, key) {
    const scaleSet = new Set(key.scale.map(interval => (key.tonic + interval) % 12));
    let score = 0;
    for (const note of notes) {
      const pc = ((note.midi % 12) + 12) % 12;
      const overlap = Math.max(1, note.duration);
      if (chord.pcs.includes(pc)) score += overlap * 5.2;
      else if (scaleSet.has(pc)) score += overlap * 1.15;
      else score -= overlap * 3.4;
      if ((note.start % WHOLE_UNITS) < durationUnits(8, 0) && chord.pcs.includes(pc)) score += overlap * 1.3;
    }
    return score;
  }

  function scoreJazzChordProgression(previous, chord, key) {
    if (!previous || previous.degree == null || chord.degree == null) return 0;
    const majorMap = {
      0: { 5: 5, 3: 4, 1: 3, 4: 3 },
      1: { 4: 8, 6: 2 },
      2: { 5: 4, 3: 3, 4: 3 },
      3: { 4: 7, 0: 4, 1: 3 },
      4: { 0: 9, 5: 5 },
      5: { 1: 7, 3: 5, 4: 4 },
      6: { 0: 6, 2: 3 }
    };
    const minorMap = {
      0: { 5: 5, 3: 4, 1: 3, 4: 4 },
      1: { 4: 9 },
      2: { 5: 5, 3: 4 },
      3: { 4: 7, 0: 4 },
      4: { 0: 10, 5: 4 },
      5: { 1: 6, 3: 5, 4: 4 },
      6: { 0: 5 }
    };
    return (key.mode === "minor" ? minorMap : majorMap)[previous.degree]?.[chord.degree] || 0;
  }

  function applyJazzPassingHarmony(chord, previous, notes, key, segmentIndex, strength) {
    if (!previous || chord.rootPc === previous.rootPc) return chord;
    const sparse = notes.length <= 1;
    const allow = strength === "strong" || (strength === "normal" && sparse && segmentIndex % 2 === 1);
    if (!allow) return chord;

    const dominantRoot = (chord.rootPc + 7) % 12;
    const dominant = createJazzChord(dominantRoot, "dom7", null, "/V");
    const chordScore = scoreJazzChordAgainstNotes(chord, notes, key);
    const dominantScore = scoreJazzChordAgainstNotes(dominant, notes, key);
    if (dominantScore + (strength === "strong" ? 8 : 3) >= chordScore) return dominant;
    return chord;
  }

  function measureGenreSegmentIntensity(notes, start, end) {
    const span = Math.max(1, end - start);
    if (!notes.length) return { score: 0, density: 0, coverage: 0, velocity: 0, range: 0 };
    let covered = 0;
    let velocitySum = 0;
    let minPitch = Infinity;
    let maxPitch = -Infinity;
    for (const note of notes) {
      covered += Math.max(0, Math.min(end, note.start + note.duration) - Math.max(start, note.start));
      velocitySum += clamp(note.volume, 0, 15) / 15;
      minPitch = Math.min(minPitch, note.midi);
      maxPitch = Math.max(maxPitch, note.midi);
    }
    const density = Math.min(1, notes.length / Math.max(2, span / durationUnits(8, 0)));
    const coverage = Math.min(1, covered / span);
    const velocity = velocitySum / notes.length;
    const range = Math.min(1, Math.max(0, maxPitch - minPitch) / 18);
    return { score: density * 0.4 + coverage * 0.27 + velocity * 0.2 + range * 0.13, density, coverage, velocity, range };
  }


  function buildGenreAccompanimentParts(genre, chordPlan, options) {
    if (genre === "pop") return buildPopAccompanimentParts(chordPlan, options);
    if (genre === "classical") return buildClassicalAccompanimentParts(chordPlan, options);
    if (genre === "ballad") return buildBalladAccompanimentParts(chordPlan, options);
    if (genre === "bossa") return buildBossaAccompanimentParts(chordPlan, options);
    if (genre === "rock") return buildRockAccompanimentParts(chordPlan, options);
    if (genre === "funk") return buildFunkAccompanimentParts(chordPlan, options);
    return buildJazzAccompanimentParts(chordPlan, options);
  }

  function buildPopAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength, "pop");
      previousVoicing = voicing;
      const hits = buildPopHits(segment, strength);
      const volume = clamp(Math.round(options.baseVolume + 1 + segment.intensity.score * 2), 3, 13);
      pushVoicingHits(voiceSegments, voicing, hits, segment, volume, { accentBeats: strength !== "light" });
      const bass = buildPopBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildClassicalAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, 4, options.medianPitch, previousVoicing, strength, "classical");
      previousVoicing = voicing;
      const chordHits = buildClassicalChordHits(segment, strength);
      const chordVoices = strength === "light" ? 2 : 3;
      const volume = clamp(Math.round(options.baseVolume + segment.intensity.score * 2), 3, 12);
      pushVoicingHits(voiceSegments, voicing.slice(0, chordVoices), chordHits, segment, volume);

      if (strength !== "light" && voicing.length >= 3) {
        const arpeggio = buildClassicalArpeggioHits(segment, strength);
        const order = strength === "strong" ? [0, 2, 1, 3, 1, 2] : [0, 2, 1, 2];
        for (let hitIndex = 0; hitIndex < arpeggio.length; hitIndex++) {
          const hit = arpeggio[hitIndex];
          voiceSegments[3].push({
            start: segment.start + hit.offset,
            duration: Math.min(hit.duration, segment.end - (segment.start + hit.offset)),
            midi: voicing[order[hitIndex % order.length] % voicing.length],
            volume: clamp(volume - 1 + (hitIndex === 0 ? 1 : 0), 2, 13)
          });
        }
      }

      const bass = buildClassicalBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildBalladAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength, "ballad");
      previousVoicing = voicing;
      const hits = buildBalladHits(segment, strength);
      const volume = clamp(Math.round(options.baseVolume + segment.intensity.score * 2), 3, 12);
      pushVoicingHits(voiceSegments, voicing, hits, segment, volume);
      const bass = buildBalladBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildBossaAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength, "bossa");
      previousVoicing = voicing;
      const hits = buildBossaHits(segment, strength);
      const volume = clamp(Math.round(options.baseVolume + 1 + segment.intensity.score * 2), 3, 13);
      pushVoicingHits(voiceSegments, voicing, hits, segment, volume);
      const bass = buildBossaBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildRockAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength, "rock");
      previousVoicing = voicing;
      const hits = buildRockHits(segment, strength);
      const volume = clamp(Math.round(options.baseVolume + 2 + segment.intensity.score * 2), 5, 14);
      pushVoicingHits(voiceSegments, voicing, hits, segment, volume, { accentBeats: true });
      const bass = buildRockBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildFunkAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseGenreVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength, "funk");
      previousVoicing = voicing;
      const hits = buildFunkHits(segment, strength);
      const volume = clamp(Math.round(options.baseVolume + 1 + segment.intensity.score * 3), 4, 14);
      pushVoicingHits(voiceSegments, voicing, hits, segment, volume, { accentBeats: true });
      const bass = buildFunkBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }
    return buildAccompanimentEventParts(voiceSegments, bassSegments, options.songEnd);
  }

  function buildAccompanimentEventParts(voiceSegments, bassSegments, songEnd) {
    const parts = [];
    for (let voice = 0; voice < 4; voice++) parts.push(noteSegmentsToEvents(voiceSegments[voice], songEnd));
    parts.push(noteSegmentsToEvents(bassSegments, songEnd));
    return parts;
  }

  function pushVoicingHits(voiceSegments, voicing, hits, segment, volume, options = {}) {
    for (let voice = 0; voice < voicing.length && voice < voiceSegments.length; voice++) {
      for (const hit of hits) {
        const start = segment.start + hit.offset;
        const beatAccent = options.accentBeats && ((Math.round(hit.offset / durationUnits(4, 0)) % 2) === 0) ? 1 : 0;
        voiceSegments[voice].push({
          start,
          duration: Math.min(hit.duration, segment.end - start),
          midi: voicing[voice],
          volume: clamp(volume + beatAccent - (voice === voicing.length - 1 ? 1 : 0), 2, 15)
        });
      }
    }
  }

  function makeGenreHits(segment, rawOffsets, duration) {
    const result = [];
    const seen = new Set();
    for (const raw of rawOffsets) {
      const offset = Math.max(0, Math.round(raw));
      if (offset >= segment.duration || seen.has(offset)) continue;
      seen.add(offset);
      const available = segment.duration - offset;
      if (available < durationUnits(64, 0)) continue;
      result.push({ offset, duration: Math.max(durationUnits(64, 0), Math.min(duration, available)) });
    }
    return result;
  }

  function buildPopHits(segment, strength) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(64, 0);
    if (strength === "light") return makeGenreHits(segment, [0, h], Math.max(e, h - gap));
    if (strength === "strong") return makeGenreHits(segment, [0, e, q, q + e, q * 2, q * 3], Math.max(durationUnits(16, 0), e - gap));
    return makeGenreHits(segment, [0, q, q * 2, q * 3], Math.max(e, q - gap));
  }

  function buildClassicalChordHits(segment, strength) {
    const h = durationUnits(2, 0);
    const gap = durationUnits(32, 0);
    if (strength === "light") return makeGenreHits(segment, [0], Math.max(1, segment.duration - gap));
    return makeGenreHits(segment, [0, h], Math.max(durationUnits(8, 0), h - gap));
  }

  function buildClassicalArpeggioHits(segment, strength) {
    const step = strength === "strong" ? durationUnits(8, 0) : durationUnits(4, 0);
    const gap = durationUnits(64, 0);
    const offsets = [];
    for (let offset = 0; offset < segment.duration; offset += step) offsets.push(offset);
    return makeGenreHits(segment, offsets, Math.max(durationUnits(64, 0), step - gap));
  }

  function buildBalladHits(segment, strength) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const gap = durationUnits(32, 0);
    if (strength === "light") return makeGenreHits(segment, [0], Math.max(1, segment.duration - gap));
    if (strength === "strong") {
      const offsets = segment.intensity.score >= 0.56 ? [0, q, q * 2, q * 3] : [0, h];
      const unit = offsets.length >= 4 ? q : h;
      return makeGenreHits(segment, offsets, Math.max(1, unit - gap));
    }
    const offsets = segment.intensity.score >= 0.5 ? [0, h] : [0];
    const unit = offsets.length > 1 ? h : segment.duration;
    return makeGenreHits(segment, offsets, Math.max(1, unit - gap));
  }

  function buildBossaHits(segment, strength) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s = durationUnits(16, 0);
    if (strength === "light") return makeGenreHits(segment, [0, q * 2 + e], Math.max(s, e - durationUnits(32, 0)));
    if (strength === "strong") return makeGenreHits(segment, [0, e, q + e, q * 2, q * 2 + e, q * 3 + e], Math.max(s, e - durationUnits(32, 0)));
    return makeGenreHits(segment, [0, q + e, q * 2, q * 3 + e], Math.max(s, e - durationUnits(32, 0)));
  }

  function buildRockHits(segment, strength) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(64, 0);
    const step = strength === "light" ? q : e;
    const offsets = [];
    for (let offset = 0; offset < segment.duration; offset += step) offsets.push(offset);
    return makeGenreHits(segment, offsets, Math.max(durationUnits(64, 0), step - gap));
  }

  function buildFunkHits(segment, strength) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s = durationUnits(16, 0);
    if (strength === "light") return makeGenreHits(segment, [0, q + e, q * 3], s);
    if (strength === "strong") return makeGenreHits(segment, [0, s * 3, q + s, q + e, q * 2 + s, q * 2 + e + s, q * 3 + s, q * 3 + e + s], s);
    return makeGenreHits(segment, [0, e + s, q + e, q * 2 + s, q * 3 + e], s);
  }

  function chooseGenreVoicing(chord, voiceCount, melodyMedian, previousVoicing, strength, genre) {
    if (genre === "jazz") return chooseJazzVoicing(chord, voiceCount, melodyMedian, previousVoicing, strength);
    const quality = chord.quality;
    const guides = {
      pop: {
        major: [0, 4, 7, 12], minor: [0, 3, 7, 12], dim: [0, 3, 6, 12],
        add9: [0, 4, 7, 14], minAdd9: [0, 3, 7, 14]
      },
      classical: {
        major: [0, 4, 7, 12], minor: [0, 3, 7, 12], dim: [0, 3, 6, 12],
        maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10]
      },
      ballad: {
        major: [0, 4, 7, 14], add9: [0, 4, 7, 14], minor: [0, 3, 7, 14], minAdd9: [0, 3, 7, 14],
        maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], sus4: [0, 5, 7, 12],
        m7b5: [0, 3, 6, 10], dim: [0, 3, 6, 12]
      },
      bossa: {
        maj7: [4, 11, 14, 21], min7: [3, 10, 14, 19], dom7: [4, 10, 14, 21], m7b5: [3, 10, 13, 17]
      },
      rock: { power: [0, 7, 12, 19] },
      funk: {
        dom7: [4, 10, 14, 21], min7: [3, 10, 14, 19], maj7: [4, 11, 14, 21], m7b5: [3, 10, 13, 17]
      }
    };
    const fallback = chord.intervals?.length ? chord.intervals : [0, 4, 7, 12];
    const intervals = (guides[genre]?.[quality] || fallback).slice(0, voiceCount);
    const upperCap = Math.max(62, Math.min(88, Math.round(melodyMedian) - 1));
    const baseCenters = voiceCount === 2
      ? [melodyMedian - 18, melodyMedian - 10]
      : voiceCount === 3
        ? [melodyMedian - 21, melodyMedian - 14, melodyMedian - 7]
        : [melodyMedian - 24, melodyMedian - 17, melodyMedian - 10, melodyMedian - 4];
    const pitches = [];
    for (let i = 0; i < intervals.length; i++) {
      const pc = (chord.rootPc + intervals[i]) % 12;
      const target = Number.isFinite(previousVoicing?.[i]) ? previousVoicing[i] : baseCenters[i];
      let pitch = nearestPitchForClass(pc, target, genre === "rock" ? 36 : 40, upperCap);
      if (i > 0) {
        while (pitch <= pitches[i - 1] + 2 && pitch + 12 <= upperCap) pitch += 12;
        while (pitch > upperCap && pitch - 12 > pitches[i - 1] + 2) pitch -= 12;
      }
      pitches.push(pitch);
    }
    return pitches;
  }

  function buildPopBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(64, 0);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 41);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 5, 32, 56);
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 41);
    const volume = clamp(Math.round(baseVolume + 1 + segment.intensity.score * 2), 4, 14);
    let pattern;
    if (strength === "light") pattern = [[0, root], [h, fifth]];
    else if (strength === "strong") pattern = [[0, root], [e, root], [q, fifth], [q + e, root], [q * 2, root], [q * 3, chooseJazzApproachPitch(fifth, nextRoot, segment.chord)]];
    else pattern = [[0, root], [q, root], [q * 2, fifth], [q * 3, root]];
    return pattern.filter(([offset]) => offset < segment.duration).map(([offset, midi], index) => ({
      start: segment.start + offset,
      duration: Math.max(1, Math.min((strength === "strong" ? e : q) - gap, segment.duration - offset)),
      midi,
      volume: clamp(volume + (index === 0 ? 1 : 0), 3, 15)
    }));
  }

  function buildClassicalBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(64, 0);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 40);
    const thirdInterval = segment.chord.quality === "minor" || segment.chord.quality === "dim" ? 3 : 4;
    const third = nearestPitchForClass((segment.chord.rootPc + thirdInterval) % 12, root + 4, 31, 57);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 7, 31, 57);
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 40);
    const volume = clamp(Math.round(baseVolume + segment.intensity.score * 2), 3, 13);
    let pattern;
    if (strength === "light") pattern = [[0, root], [h, fifth]];
    else if (strength === "strong") pattern = [[0, root], [e, fifth], [q, third], [q + e, fifth], [q * 2, root], [q * 2 + e, fifth], [q * 3, third], [q * 3 + e, chooseJazzApproachPitch(fifth, nextRoot, segment.chord)]];
    else pattern = [[0, root], [q, fifth], [q * 2, third], [q * 3, fifth]];
    const step = strength === "strong" ? e : (strength === "light" ? h : q);
    return pattern.filter(([offset]) => offset < segment.duration).map(([offset, midi], index) => ({
      start: segment.start + offset,
      duration: Math.max(1, Math.min(step - gap, segment.duration - offset)),
      midi,
      volume: clamp(volume + (index === 0 ? 1 : 0), 2, 14)
    }));
  }

  function buildBalladBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const gap = durationUnits(32, 0);
    const volume = clamp(Math.round(baseVolume + segment.intensity.score * 2), 4, 13);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 41);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 5, 32, 55);
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 41);
    if (strength === "light") return [{ start: segment.start, duration: Math.max(1, segment.duration - gap), midi: root, volume }];
    const offsets = strength === "strong" ? [0, q, q * 2, q * 3] : [0, h];
    return offsets.filter(offset => offset < segment.duration).map((offset, index) => ({
      start: segment.start + offset,
      duration: Math.max(1, Math.min((strength === "strong" ? q : h) - gap, segment.duration - offset)),
      midi: index === offsets.length - 1 && strength === "strong" ? chooseJazzApproachPitch(root, nextRoot, segment.chord) : (index % 2 ? fifth : root),
      volume: clamp(volume + (index === 0 ? 1 : 0), 3, 14)
    }));
  }

  function buildBossaBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(32, 0);
    const volume = clamp(Math.round(baseVolume + 1 + segment.intensity.score * 2), 4, 13);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 42);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 4, 33, 56);
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 42);
    const pattern = strength === "strong"
      ? [[0, root], [q + e, fifth], [q * 2, root], [q * 3 + e, chooseJazzApproachPitch(fifth, nextRoot, segment.chord)]]
      : [[0, root], [q * 2, fifth]];
    const active = pattern.filter(([offset]) => offset < segment.duration);
    return active.map(([offset, midi], index) => {
      const nextOffset = active[index + 1]?.[0] ?? segment.duration;
      const desired = strength === "strong" ? e - gap : (strength === "light" ? q * 2 - gap : q + e - gap);
      return {
        start: segment.start + offset,
        duration: Math.max(1, Math.min(desired, nextOffset - offset - gap, segment.duration - offset)),
        midi,
        volume: clamp(volume + (index === 0 ? 1 : 0), 3, 14)
      };
    });
  }

  function buildRockBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const gap = durationUnits(64, 0);
    const step = strength === "light" ? q : e;
    const volume = clamp(Math.round(baseVolume + 2 + segment.intensity.score * 2), 5, 15);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 40);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 5, 31, 56);
    const octave = root + 12 <= 59 ? root + 12 : root;
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 40);
    const result = [];
    let index = 0;
    for (let offset = 0; offset < segment.duration; offset += step, index++) {
      let midi = index % 4 === 2 ? fifth : (strength === "strong" && index % 4 === 3 ? octave : root);
      if (offset + step >= segment.duration && strength === "strong") midi = chooseJazzApproachPitch(midi, nextRoot, segment.chord);
      result.push({ start: segment.start + offset, duration: Math.max(1, Math.min(step - gap, segment.duration - offset)), midi, volume: clamp(volume + (index % 4 === 0 ? 1 : 0), 4, 15) });
    }
    return result;
  }

  function buildFunkBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s = durationUnits(16, 0);
    const volume = clamp(Math.round(baseVolume + 2 + segment.intensity.score * 2), 5, 15);
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 41);
    const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 4, 31, 57);
    const octave = root + 12 <= 59 ? root + 12 : root;
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 41);
    const pattern = strength === "light"
      ? [[0, root], [q + e, octave], [q * 3, fifth]]
      : strength === "strong"
        ? [[0, root], [e, octave], [q + s, fifth], [q + e + s, octave], [q * 2 + e, root], [q * 3 + s, chooseJazzApproachPitch(fifth, nextRoot, segment.chord)]]
        : [[0, root], [e + s, octave], [q + e, fifth], [q * 2 + s, root], [q * 3 + e, octave]];
    return pattern.filter(([offset]) => offset < segment.duration).map(([offset, midi], index) => ({
      start: segment.start + offset,
      duration: Math.max(1, Math.min(strength === "light" ? e : s * 2, segment.duration - offset)),
      midi,
      volume: clamp(volume + (index === 0 ? 1 : 0), 4, 15)
    }));
  }

  function buildJazzAccompanimentParts(chordPlan, options) {
    const strength = options.strength;
    const voiceCount = strength === "light" ? 2 : (strength === "strong" ? 4 : 3);
    const voiceSegments = Array.from({ length: 4 }, () => []);
    const bassSegments = [];
    let previousVoicing = null;
    let previousBass = null;

    for (let i = 0; i < chordPlan.length; i++) {
      const segment = chordPlan[i];
      const nextChord = chordPlan[i + 1]?.chord || segment.chord;
      const voicing = chooseJazzVoicing(segment.chord, voiceCount, options.medianPitch, previousVoicing, strength);
      previousVoicing = voicing;
      const compVolume = clamp(Math.round(options.baseVolume + segment.intensity.score * 3 + (strength === "strong" ? 1 : 0)), 3, 13);
      const hits = buildJazzCompingHits(segment, strength);

      for (let voice = 0; voice < voiceCount; voice++) {
        for (const hit of hits) {
          voiceSegments[voice].push({
            start: segment.start + hit.offset,
            duration: Math.min(hit.duration, segment.end - (segment.start + hit.offset)),
            midi: voicing[voice],
            volume: clamp(compVolume + (voice === voiceCount - 1 ? -1 : 0), 2, 13)
          });
        }
      }

      const bass = buildJazzBassSegments(segment, nextChord, strength, previousBass, options.baseVolume);
      if (bass.length) previousBass = bass[bass.length - 1].midi;
      bassSegments.push(...bass);
    }

    const parts = [];
    for (let voice = 0; voice < 4; voice++) parts.push(noteSegmentsToEvents(voiceSegments[voice], options.songEnd));
    parts.push(noteSegmentsToEvents(bassSegments, options.songEnd));

    // 출력은 화음1~화음4 + 화음5(베이스) 순서다.
    return parts;
  }

  function buildJazzCompingHits(segment, strength) {
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const len = segment.duration;
    const intensity = segment.intensity.score;
    let offsets;
    let duration;

    if (strength === "light") {
      offsets = intensity < 0.22 ? [0] : [q, Math.min(len - e, q * 3)];
      duration = e;
    } else if (strength === "strong") {
      offsets = intensity < 0.2 ? [0, q * 2] : [e, q + e, q * 2, q * 3 + e];
      duration = Math.max(durationUnits(16, 0), e - durationUnits(32, 0));
    } else {
      offsets = intensity < 0.2 ? [0, q * 2] : [e, q * 2, Math.min(len - e, q * 3 + e)];
      duration = e;
    }

    const unique = [];
    const seen = new Set();
    for (const raw of offsets) {
      const offset = Math.round(raw);
      if (offset < 0 || offset >= len || seen.has(offset)) continue;
      seen.add(offset);
      const available = len - offset;
      if (available < durationUnits(64, 0)) continue;
      unique.push({ offset, duration: Math.max(durationUnits(64, 0), Math.min(duration, available)) });
    }
    return unique;
  }

  function chooseJazzVoicing(chord, voiceCount, melodyMedian, previousVoicing, strength) {
    const qualityGuide = {
      maj7: [4, 11, 14, 21],
      min7: [3, 10, 14, 19],
      dom7: [4, 10, 14, 21],
      m7b5: [3, 10, 13, 17],
      dim7: [3, 9, 15, 18]
    };
    const intervals = qualityGuide[chord.quality] || qualityGuide.maj7;
    const selectedIntervals = intervals.slice(0, voiceCount);
    const upperCap = Math.max(62, Math.min(88, Math.round(melodyMedian) - 1));
    const centers = voiceCount === 2
      ? [melodyMedian - 16, melodyMedian - 9]
      : voiceCount === 3
        ? [melodyMedian - 19, melodyMedian - 13, melodyMedian - 7]
        : [melodyMedian - 22, melodyMedian - 16, melodyMedian - 10, melodyMedian - 5];
    const pitches = [];

    for (let i = 0; i < selectedIntervals.length; i++) {
      const pc = (chord.rootPc + selectedIntervals[i]) % 12;
      const previous = previousVoicing?.[i];
      const target = Number.isFinite(previous) ? previous : centers[i];
      let pitch = nearestPitchForClass(pc, target, 40, upperCap);
      if (i > 0) {
        while (pitch <= pitches[i - 1] + 2 && pitch + 12 <= upperCap) pitch += 12;
        while (pitch > upperCap && pitch - 12 > pitches[i - 1] + 2) pitch -= 12;
      }
      pitches.push(pitch);
    }

    if (strength === "strong" && pitches.length >= 4 && pitches[3] - pitches[0] > 26) pitches[3] -= 12;
    return pitches;
  }

  function buildJazzBassSegments(segment, nextChord, strength, previousBass, baseVolume) {
    const q = durationUnits(4, 0);
    const h = durationUnits(2, 0);
    const volume = clamp(Math.round(baseVolume + 1 + segment.intensity.score * 2), 4, 14);
    const result = [];
    const root = chooseJazzBassPitch(segment.chord.rootPc, previousBass, 43);
    const nextRoot = chooseJazzBassPitch(nextChord.rootPc, root, 43);

    if (strength === "light") {
      const firstDur = Math.min(h - durationUnits(32, 0), segment.duration);
      result.push({ start: segment.start, duration: Math.max(1, firstDur), midi: root, volume });
      if (segment.duration > h) {
        const fifth = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 3, 34, 55);
        result.push({ start: segment.start + h, duration: Math.max(1, Math.min(h - durationUnits(32, 0), segment.end - (segment.start + h))), midi: fifth, volume: clamp(volume - 1, 3, 14) });
      }
      return result;
    }

    const beatCount = Math.max(1, Math.floor(segment.duration / q));
    for (let beat = 0; beat < beatCount; beat++) {
      const start = segment.start + beat * q;
      const isLast = beat === beatCount - 1;
      let pitch;
      if (beat === 0) pitch = root;
      else if (isLast) pitch = chooseJazzApproachPitch(previousBass ?? root, nextRoot, segment.chord);
      else if (beat % 2 === 1) pitch = nearestPitchForClass((segment.chord.rootPc + (segment.chord.quality === "min7" ? 3 : 4)) % 12, root + 4, 34, 57);
      else pitch = nearestPitchForClass((segment.chord.rootPc + 7) % 12, root + 6, 34, 57);
      if (strength === "strong" && beat === 2 && segment.intensity.score > 0.55) pitch = root + 12 <= 59 ? root + 12 : root;
      result.push({
        start,
        duration: Math.max(1, Math.min(q - durationUnits(32, 0), segment.end - start)),
        midi: pitch,
        volume: clamp(volume + (beat === 0 ? 1 : 0), 3, 14)
      });
      previousBass = pitch;
    }
    return result;
  }

  function chooseJazzApproachPitch(previous, nextRoot, chord) {
    const candidates = [nextRoot - 1, nextRoot + 1, nextRoot - 2, nextRoot + 2, nearestPitchForClass((chord.rootPc + 7) % 12, nextRoot, 34, 59)]
      .filter(pitch => pitch >= 34 && pitch <= 59);
    candidates.sort((a, b) => Math.abs(a - previous) - Math.abs(b - previous) || Math.abs(a - nextRoot) - Math.abs(b - nextRoot));
    return candidates[0] ?? nextRoot;
  }

  function chooseJazzBassPitch(pc, previous, center) {
    const target = Number.isFinite(previous) ? previous : center;
    const candidates = [];
    for (let midi = 34; midi <= 55; midi++) if (midi % 12 === pc) candidates.push(midi);
    candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || Math.abs(a - center) - Math.abs(b - center));
    return candidates[0] ?? 43;
  }

  function nearestPitchForClass(pc, target, min, max) {
    const normalizedPc = ((pc % 12) + 12) % 12;
    let best = null;
    for (let midi = min; midi <= max; midi++) {
      if (((midi % 12) + 12) % 12 !== normalizedPc) continue;
      const score = Math.abs(midi - target);
      if (!best || score < best.score) best = { midi, score };
    }
    return best?.midi ?? clamp(Math.round(target), min, max);
  }

  function noteSegmentsToEvents(segments, songEnd) {
    const sorted = [...(segments || [])]
      .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.duration) && segment.duration > 0 && Number.isFinite(segment.midi))
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
    if (!sorted.length) return [];
    const events = [];
    let cursor = 0;
    for (const segment of sorted) {
      let start = Math.max(0, Math.round(segment.start));
      let duration = Math.max(1, Math.round(segment.duration));
      if (start < cursor) {
        const cut = cursor - start;
        start = cursor;
        duration -= cut;
      }
      if (duration <= 0 || start >= songEnd) continue;
      duration = Math.min(duration, Math.max(0, Math.round(songEnd - start)));
      if (start > cursor) events.push({ type: "rest", start: cursor, duration: start - cursor });
      events.push({ type: "note", start, duration, midi: clamp(segment.midi, 0, 127), volume: clamp(segment.volume, 0, 15) });
      cursor = start + duration;
    }
    if (cursor < songEnd) events.push({ type: "rest", start: cursor, duration: Math.round(songEnd - cursor) });
    return mergeAdjacentRests(normalizeEventStarts(events));
  }

  function medianNumber(values, fallback = 0) {
    const sorted = Array.from(values || []).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return fallback;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }



  function generateDynamicsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const genre = String(options.genre || "pop").trim().toLowerCase();
    const supportedGenres = new Set(["pop", "jazz", "ballad", "bossa", "rock", "funk", "classical"]);
    if (!supportedGenres.has(genre)) throw new Error(tr("vol.err_genre"));
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

    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      const selected = targetPartIndexes == null || targetPartIndexes.has(partIndex);
      if (!selected) {
        partResults.push({ partIndex, status: "unselected", generatedCommands: 0, changedNotes: 0 });
        continue;
      }

      const scanned = scanPartForDynamics(sourceParts[partIndex], partIndex);
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
      generatedCommands,
      changedNotes,
      processedPartCount,
      skippedExpressivePartCount,
      existingExpressivePartCount,
      partResults
    };
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
          else appendToken({ kind: "note", midi: n.value, duration, sourceIndex });
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
    const strengthAmount = { light: 1, normal: 2, strong: 3 }[options.strength] || 2;
    const q = durationUnits(4, 0);
    const e = durationUnits(8, 0);
    const s16 = durationUnits(16, 0);
    const bar = WHOLE_UNITS;
    const medianPitch = medianNumber(sounding.map(note => note.midi), 60);
    const profile = {
      pop: { beat: [1.0, -0.2, 0.55, -0.15], offbeat: 0.15, phrase: 0.75, length: 0.35, pitch: 0.22, density: 0.40 },
      jazz: { beat: [0.15, 0.15, 0.05, 0.20], offbeat: 0.70, phrase: 0.55, length: 0.35, pitch: 0.18, density: 0.30 },
      ballad: { beat: [0.50, -0.15, 0.25, -0.15], offbeat: 0.05, phrase: 1.05, length: 0.65, pitch: 0.38, density: 0.45 },
      bossa: { beat: [0.55, 0.05, 0.30, 0.10], offbeat: 0.55, phrase: 0.48, length: 0.25, pitch: 0.12, density: 0.30 },
      rock: { beat: [1.00, 0.05, 0.80, 0.05], offbeat: 0.10, phrase: 0.45, length: 0.20, pitch: 0.12, density: 0.25 },
      funk: { beat: [0.50, -0.05, 0.25, -0.05], offbeat: 0.95, phrase: 0.38, length: 0.10, pitch: 0.08, density: 0.20 },
      classical: { beat: [0.85, -0.20, 0.35, -0.15], offbeat: 0.05, phrase: 1.10, length: 0.70, pitch: 0.48, density: 0.42 }
    }[options.genre];
    const roleFactor = options.partIndex === 0 ? 1 : 0.72;

    const phraseIds = [];
    let phraseId = 0;
    let phraseStartTime = sounding[0]?.start || 0;
    for (let index = 0; index < sounding.length; index++) {
      if (index > 0) {
        const previous = sounding[index - 1];
        const gap = sounding[index].start - (previous.start + previous.duration);
        const longContinuous = sounding[index].start - phraseStartTime >= bar * 4 && (sounding[index].start % bar) < s16;
        if (gap >= e || longContinuous) {
          phraseId++;
          phraseStartTime = sounding[index].start;
        }
      }
      phraseIds[index] = phraseId;
    }
    const phraseGroups = new Map();
    for (let i = 0; i < sounding.length; i++) {
      if (!phraseGroups.has(phraseIds[i])) phraseGroups.set(phraseIds[i], []);
      phraseGroups.get(phraseIds[i]).push(i);
    }

    const rawTargets = new Map();
    const forceChange = new Set();
    for (const indexes of phraseGroups.values()) {
      for (let localIndex = 0; localIndex < indexes.length; localIndex++) {
        const noteIndex = indexes[localIndex];
        const note = sounding[noteIndex];
        const progress = indexes.length <= 1 ? 0.5 : localIndex / (indexes.length - 1);
        const phraseCurve = (Math.sin(Math.PI * progress) - 0.38) * profile.phrase * roleFactor;
        const withinBar = ((note.start % bar) + bar) % bar;
        const quarterIndex = Math.floor(withinBar / q) % 4;
        const withinQuarter = withinBar % q;
        const isOffbeat = Math.abs(withinQuarter - e) <= s16 / 2 || (options.genre === "funk" && withinQuarter >= s16 && withinQuarter <= q - s16);
        let beatScore = profile.beat[quarterIndex] || 0;
        if (isOffbeat) beatScore += profile.offbeat;
        const lengthRatio = note.duration / q;
        const lengthScore = lengthRatio >= 2 ? profile.length : (lengthRatio <= 0.25 ? -profile.length * 0.55 : 0);
        const pitchScore = clamp((note.midi - medianPitch) / 12, -1, 1) * profile.pitch * roleFactor;
        const windowStart = note.start - q / 2;
        const windowEnd = note.start + q / 2;
        const localDensity = sounding.reduce((count, other) => count + (other.start >= windowStart && other.start < windowEnd ? 1 : 0), 0);
        const densityScore = localDensity >= 5 ? -profile.density : (localDensity <= 1 ? profile.density * 0.18 : 0);
        const previous = noteIndex > 0 ? sounding[noteIndex - 1] : null;
        const repeatScore = previous && previous.midi === note.midi ? (noteIndex % 2 ? -0.25 : 0.20) : 0;
        const boundaryScore = localIndex === 0 ? 0.45 : (localIndex === indexes.length - 1 ? (lengthRatio >= 1 ? 0.20 : -0.30) : 0);
        const score = (beatScore + phraseCurve + lengthScore + pitchScore + densityScore + repeatScore + boundaryScore) * strengthAmount;
        rawTargets.set(note, clamp(baseVolume + Math.round(score), 2, 15));
        if (localIndex === 0 || beatScore >= 0.8) forceChange.add(note);
      }
    }

    const targets = new Map();
    let currentVolume = null;
    let notesSinceChange = 999;
    const minHold = options.strength === "light" ? 4 : (options.strength === "normal" ? 2 : 1);
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
      let target = rawTargets.get(note) ?? baseVolume;
      if (currentVolume == null || currentVolume === 0) {
        currentVolume = target;
        notesSinceChange = 0;
      } else if (target !== currentVolume) {
        const allow = forceChange.has(note) || Math.abs(target - currentVolume) >= 2 || notesSinceChange >= minHold;
        if (allow) {
          currentVolume = target;
          notesSinceChange = 0;
        } else {
          target = currentVolume;
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

    const threshold = normalizeRestTrimThreshold(options);
    const targetPartIndexes = normalizeTargetPartIndexes(options, partCount);

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let removed = 0;
    let removedUnits = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const shouldTrim = targetPartIndexes == null || targetPartIndexes.has(i);
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


  function adjustVolumesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const rawDelta = Number(options.delta ?? 0);
    if (!Number.isFinite(rawDelta)) throw new Error(tr("vol.err_number"));
    const delta = clamp(rawDelta, -15, 15);
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const targetPartIndexes = normalizeTargetPartIndexes(options, partCount);
    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let touchedNotes = 0;
    let changedNotes = 0;
    let clampedNotes = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const shouldAdjust = targetPartIndexes == null || targetPartIndexes.has(i);
      if (!shouldAdjust) {
        outputParts.push(sourceParts[i] || "");
        continue;
      }

      let events = parsedParts[i].events.map(ev => {
        if (ev.type !== "note") return { ...ev };
        const beforeVolume = clamp(ev.volume, 0, 15);
        const unclamped = beforeVolume + delta;
        const afterVolume = clamp(unclamped, 0, 15);
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
      touchedNotes,
      changedNotes,
      clampedNotes,
      tempoMap
    };
  }


  function transposeOctavesMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const rawOctaves = Number(options.octaves ?? options.delta ?? 0);
    if (!Number.isFinite(rawOctaves)) throw new Error(tr("pitch.err_number"));
    const octaves = clamp(Math.round(rawOctaves), -7, 7);
    let source = String(text || "").replace(/^\uFEFF/, "").trim();
    const wrapped = source.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (wrapped) source = wrapped[1];
    if (/\[|\]/.test(source)) throw new Error(tr("mml.err_brackets"));
    const sourceParts = source === "" ? [] : source.split(",").slice(0, partCount).map(part => String(part || "").trim());
    while (sourceParts.length < partCount) sourceParts.push("");

    const targetPartIndexes = normalizeTargetPartIndexes(options, partCount);
    let touchedCommands = 0;
    let changedCommands = 0;
    let clampedCommands = 0;

    const outputParts = sourceParts.map((part, index) => {
      const shouldAdjust = targetPartIndexes == null || targetPartIndexes.has(index);
      if (!shouldAdjust) return part || "";

      return String(part || "").replace(/O(\d+)/gi, (full, digits) => {
        const beforeOctave = Number(digits);
        if (!Number.isInteger(beforeOctave)) return full;
        const requestedOctave = beforeOctave + octaves;
        const afterOctave = octaves === 0 ? beforeOctave : clamp(requestedOctave, 0, 7);
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
    // 이전의 "200자 안쪽" 탐색 범위를, 요청대로 목표 글자 수의 절반으로 둔다.
    const searchSlackChars = Math.max(0, Math.round(Number(options.searchSlackChars ?? (maxChars / 2))));
    const minCommonSilenceUnits = Math.max(0, Math.round(Number(options.minCommonSilenceBeats ?? 2) * durationUnits(4, 0)));
    const maxPages = Math.max(1, Math.min(200, Math.round(Number(options.maxPages || 120))));

    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const sourceLengths = sourceParts.map(part => String(part || "").length);
    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const totalUnits = Math.max(
      0,
      ...parsedParts.map(p => partMusicalEnd(p.events)),
      ...tempoMap.map(t => t.pos || 0)
    );

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
          skippedUnits: 0,
          reason: "within-limit",
          warning: ""
        }],
        maxChars,
        searchSlackChars,
        minCommonSilenceUnits,
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
          skippedUnits: 0,
          reason: "empty",
          warning: ""
        }],
        maxChars,
        searchSlackChars,
        minCommonSilenceUnits,
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
        searchSlackChars,
        minCommonSilenceUnits
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
      minCommonSilenceUnits,
      totalUnits,
      warnings
    };
  }

  function choosePageCut(parsedParts, tempoMap, pageStart, totalUnits, options) {
    const { partCount, maxChars, searchSlackChars, minCommonSilenceUnits } = options;
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

    let bestIdx = findEstimatedBestIndex(parsedParts, pageStart, candidateEnds, maxChars);
    if (bestIdx < 0) bestIdx = 0;

    // 실제 렌더링은 비싸므로, 추정값으로 잡은 근처만 확인한다.
    // 초과하면 이분 탐색으로 앞으로 당기고, 여유가 크면 몇 번만 뒤로 늘린다.
    if (measure(candidateEnds[bestIdx]).maxLen > maxChars) {
      let loFit = -1;
      let hiFail = bestIdx;
      while (hiFail - loFit > 1) {
        const mid = Math.floor((loFit + hiFail) / 2);
        if (measure(candidateEnds[mid]).maxLen <= maxChars) loFit = mid;
        else hiFail = mid;
      }
      bestIdx = Math.max(0, loFit);
    }

    const bestEnd = Math.max(pageStart + 1, Math.min(candidateEnds[bestIdx], totalUnits));
    const lowerTarget = Math.max(0, maxChars - searchSlackChars);
    const bestMeasure = measure(bestEnd);
    const targetReachable = bestMeasure.maxLen >= lowerTarget;

    // 분할 지점 탐색은 반드시 "제한 글자 수에 가까운 영역" 안에서만 한다.
    // 예: 제한 2400자라면 searchSlackChars 기본값은 1200자이고,
    // 실제 렌더링 기준으로 1200자 이상이 되는 첫 후보부터 2400자 이하의 마지막 후보까지만 탐색한다.
    // 예전 로직은 이 범위 안에서 2박 무음을 못 찾으면 초반 무음으로 되돌아가는 fallback이 있어서
    // 100자대 악보가 먼저 잘리는 문제가 있었다.
    const minSearchEnd = targetReachable
      ? findEarliestCandidateAtLeastLength(measure, candidateEnds, bestIdx, lowerTarget)
      : null;
    const searchStart = targetReachable && minSearchEnd ? minSearchEnd : pageStart + 1;
    const searchEnd = bestEnd;

    const commonSilences = getCommonSilenceIntervals(parsedParts, pageStart, bestEnd)
      .filter(iv => iv.end > pageStart + EPS && iv.start > pageStart + EPS && iv.start <= searchEnd + EPS)
      .map(iv => ({
        start: Math.max(pageStart + 1, Math.round(iv.start)),
        end: Math.max(pageStart + 1, Math.round(iv.end)),
        duration: Math.max(0, Math.round(iv.end - iv.start))
      }))
      .filter(iv => iv.start >= searchStart - EPS && iv.start <= searchEnd + EPS);

    const goodSilence = pickSilenceCandidate(commonSilences, measure, maxChars, lowerTarget, minCommonSilenceUnits, targetReachable, searchStart, searchEnd);
    if (goodSilence) {
      return { end: goodSilence.start, nextStart: Math.max(goodSilence.end, goodSilence.start), reason: "common-silence", warning: "" };
    }

    const anySilence = pickSilenceCandidate(commonSilences, measure, maxChars, lowerTarget, 1, targetReachable, searchStart, searchEnd);
    if (anySilence) {
      return {
        end: anySilence.start,
        nextStart: Math.max(anySilence.end, anySilence.start),
        reason: "longest-silence",
        warning: anySilence.duration < minCommonSilenceUnits ? tr("split.warn_longest_silence") : ""
      };
    }

    const bestSafeChannels = countSafeChannelsAt(parsedParts, bestEnd);
    if (bestSafeChannels >= parsedParts.length && measure(bestEnd).maxLen <= maxChars) {
      return { end: bestEnd, nextStart: bestEnd, reason: "clean-boundary", warning: "" };
    }

    const clean = pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, true, searchStart);
    if (clean) return { end: clean.pos, nextStart: clean.pos, reason: "clean-boundary", warning: "" };

    if (measure(bestEnd).maxLen <= maxChars) {
      return {
        end: bestEnd,
        nextStart: bestEnd,
        reason: "partial-boundary",
        warning: tr("split.warn_partial_safe", [bestSafeChannels, partCount])
      };
    }

    const fallback = pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, false, searchStart);
    if (fallback) {
      return {
        end: fallback.pos,
        nextStart: fallback.pos,
        reason: "partial-boundary",
        warning: tr("split.warn_partial_safe", [fallback.safeChannels, partCount])
      };
    }

    return {
      end: bestEnd,
      nextStart: bestEnd,
      reason: "char-limit",
      warning: tr("split.warn_char_limit")
    };
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

  function estimatePageMaxLength(parsedParts, start, end) {
    let max = 0;
    for (const part of parsedParts || []) {
      let count = 0;
      let gaps = 0;
      let lastEnd = 0;
      for (const ev of part.events || []) {
        if (ev.type !== "note") continue;
        const evEnd = ev.start + ev.duration;
        if (ev.start < start - EPS || ev.start >= end - EPS || evEnd <= start + EPS) continue;
        const localStart = Math.max(0, ev.start - start);
        if (localStart > lastEnd + EPS) gaps++;
        count++;
        lastEnd = Math.max(lastEnd, Math.min(evEnd, end) - start);
      }
      if (count || gaps) {
        // 실제 최적화는 반복 길이/옥타브/볼륨을 꽤 줄이므로 보수적인 근사만 사용한다.
        max = Math.max(max, 10 + count * 1.35 + gaps * 2.4);
      }
    }
    return max;
  }

  function findEarliestCandidateAtLeastLength(measure, candidates, bestIdx, targetLen) {
    if (!targetLen || bestIdx < 0 || measure(candidates[bestIdx]).maxLen < targetLen) return null;
    let lo = 0;
    let hi = bestIdx;
    let ans = candidates[bestIdx];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const m = measure(candidates[mid]);
      if (m.maxLen >= targetLen) {
        ans = candidates[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function pickSilenceCandidate(intervals, measure, maxChars, lowerTarget, minDuration, requireLower, searchStart, searchEnd) {
    let best = null;
    for (const iv of intervals) {
      if (iv.duration < minDuration) continue;
      if (iv.start < searchStart - EPS || iv.start > searchEnd + EPS) continue;
      const m = measure(iv.start);
      if (m.maxLen > maxChars) continue;
      if (requireLower && m.maxLen < lowerTarget) continue;
      const score = {
        lenScore: m.maxLen,
        duration: iv.duration,
        start: iv.start
      };
      if (!best
        || score.lenScore > best.score.lenScore
        || (score.lenScore === best.score.lenScore && score.duration > best.score.duration)
        || (score.lenScore === best.score.lenScore && score.duration === best.score.duration && score.start > best.score.start)) {
        best = { ...iv, score };
      }
    }
    return best;
  }

  function pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, requireAllSafe, searchStart) {
    const points = collectBoundaryPoints(parsedParts, pageStart, bestEnd);
    let best = null;
    const targetReachable = measure(bestEnd).maxLen >= lowerTarget;
    for (const pos of points) {
      if (pos <= pageStart + EPS || pos > bestEnd + EPS) continue;
      const m = measure(pos);
      if (m.maxLen > maxChars) continue;
      if (targetReachable && (pos < searchStart - EPS || m.maxLen < lowerTarget)) continue;
      const safeChannels = countSafeChannelsAt(parsedParts, pos);
      if (requireAllSafe && safeChannels < parsedParts.length) continue;
      const score = { safeChannels, lenScore: m.maxLen, pos };
      if (!best
        || score.safeChannels > best.score.safeChannels
        || (score.safeChannels === best.score.safeChannels && score.lenScore > best.score.lenScore)
        || (score.safeChannels === best.score.safeChannels && score.lenScore === best.score.lenScore && score.pos > best.score.pos)) {
        best = { pos, safeChannels, score };
      }
    }
    return best;
  }

  function renderPageSegment(parsedParts, tempoMap, start, end, partCount) {
    start = Math.max(0, Math.round(start));
    end = Math.max(start, Math.round(end));
    const currentTempo = tempoAt(tempoMap, start);
    const relTempoMap = [{ pos: 0, bpm: currentTempo }];
    for (const t of tempoMap || []) {
      if (t.pos > start + EPS && t.pos < end - EPS) relTempoMap.push({ pos: Math.round(t.pos - start), bpm: t.bpm });
    }
    const hasAnyNotes = parsedParts.some(p => (p.events || []).some(ev => ev.type === "note" && ev.start >= start - EPS && ev.start < end - EPS));
    const hasTempoInside = relTempoMap.length > 1;
    const outputParts = [];
    for (let i = 0; i < partCount; i++) {
      let events = buildPartSegmentEvents(parsedParts[i]?.events || [], start, end);
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

  function buildPartSegmentEvents(events, start, end) {
    const notes = (events || [])
      .filter(ev => ev.type === "note")
      .map(ev => ({ ...ev, end: ev.start + ev.duration }))
      .filter(ev => ev.start >= start - EPS && ev.start < end - EPS && ev.end > start + EPS)
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
    const out = [];
    let cursor = 0;
    for (const note of notes) {
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
    const notes = [];
    for (let p = 0; p < parsedParts.length; p++) {
      for (const ev of parsedParts[p].events || []) {
        if (ev.type === "note") notes.push({ part: p, start: ev.start, end: ev.start + ev.duration, midi: ev.midi });
      }
    }
    return notes;
  }

  function getCommonSilenceIntervals(parsedParts, from, to) {
    const intervals = collectAllNotes(parsedParts)
      .map(n => ({ start: Math.max(from, n.start), end: Math.min(to, n.end) }))
      .filter(n => n.end > from + EPS && n.start < to - EPS && n.end > n.start + EPS)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const gaps = [];
    let cursor = from;
    for (const iv of intervals) {
      if (iv.start > cursor + EPS) gaps.push({ start: cursor, end: iv.start });
      cursor = Math.max(cursor, iv.end);
    }
    if (cursor < to - EPS) gaps.push({ start: cursor, end: to });
    return gaps;
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
    for (const p of parsedParts) {
      const active = (p.events || []).some(ev => ev.type === "note" && ev.start < pos - EPS && ev.start + ev.duration > pos + EPS);
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
      const ch = s[i]?.toLowerCase();
      if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
      if (ch === "r") {
        i++;
        return { kind: "rest", duration: readLengthUnits() };
      }
      if (ch === "n") {
        i++;
        const num = readNumber();
        if (!num) fail(tr("mml.err_n_required"));
        if (num.value < 0 || num.value > 127) fail(tr("mml.err_n_range", [num.value]));
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
      if (!Number.isFinite(token.duration) || token.duration <= 0) {
        fail(tr("mml.err_tiny_fraction"));
      }
      token.duration = quantizeInputDurationUnits(token.duration);

      if (pendingTie) {
        if (!lastTieTarget) fail(tr("mml.err_tie_before"));
        if (lastTieTarget.kind !== token.kind || lastTieTarget.midi !== token.midi) fail(tr("mml.err_tie_same"));
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
    let out = `${options.isMelody ? `T${options.startTempo || DEFAULT_TEMPO}` : ""}V${initVolume}O${initOctave}L${initialL.label}`;

    for (const ev of events) {
      if (ev.type === "tempo") {
        out += renderTempoList(ev.preTempos);
        continue;
      }
      const preTempo = renderTempoList(ev.preTempos);
      if (ev.tieFromPrev) out += "&";
      out += preTempo;
      if (ev.type === "rest") {
        out += renderRestDuration(ev.duration, initialL.units);
        continue;
      }
      if (ev.type === "note") {
        const vol = clamp(ev.volume, 0, 15);
        let command = "";
        if (vol !== currentVolume) {
          command += `V${vol}`;
          currentVolume = vol;
        }
        const pitch = renderPitch(ev.midi, currentOctave);
        command += pitch.prefix;
        currentOctave = pitch.octave;
        out += renderNoteDuration(command + pitch.symbol, pitch.symbol, ev.duration, initialL.units);
      }
    }
    return out;
  }

  function chooseFastInitialL(events) {
    const musical = (events || []).filter(ev => ev.type === "note" || ev.type === "rest");
    if (!musical.length) return L_STATES.find(x => x.label === String(DEFAULT_LENGTH)) || L_STATES[0];
    let best = null;
    for (const l of L_STATES) {
      let score = 0;
      for (const ev of musical) {
        try {
          score += ev.type === "rest"
            ? renderRestDuration(ev.duration, l.units).length
            : renderNoteDuration("c", "c", ev.duration, l.units).length;
        } catch (_) {
          score += 9999;
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

    const startTempo = state.isMelody && state.emitStartTempo !== false ? `T${state.startTempo || DEFAULT_TEMPO}` : "";
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
    if (out == null) throw new Error(tr("mml.err_duration_render", [units]));
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
    if (out == null) throw new Error(tr("mml.err_rest_render", [units]));
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
    if (!isIntegerLike(value)) throw new Error(tr("mml.err_fraction_unsupported"));
    return Math.round(value);
  }

  function isIntegerLike(value) {
    return Number.isFinite(value) && Math.abs(value - Math.round(value)) < EPS;
  }

  function countPartChars(parts) {
    return Array.from(parts || []).reduce((sum, part) => sum + String(part || "").trim().length, 0);
  }

  window.MabiOptimizer = Object.freeze({ version: "5.1.0", optimizeMml, generateAccompanimentMml, generateDynamicsMml, simplifyTemposMml, countShortRestsMml, trimShortRestsMml, addLeadingSilenceMml, adjustVolumesMml, transposeOctavesMml, splitMmlPages });
})();
