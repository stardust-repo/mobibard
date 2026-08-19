(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  const notation = root.MabiNotation;
  const core = root.MabiMusicFormats;
  if (!utils || !notation || !core) throw new Error("MNX parser dependencies are not loaded.");

  function cleanJsonText(bytes) {
    return utils.decodeText(bytes, ["utf-8", "utf-16le", "utf-16be"]).replace(/^\uFEFF/, "").trim();
  }

  function locateMnxEntry(entries) {
    const preferred = utils.findZipEntry(entries, ["score.mnx", "score.mnx.json", "mnx.json", "score.json"]);
    if (preferred) return preferred;
    return utils.findZipEntry(entries, [], name => {
      const lower = name.toLowerCase();
      return !lower.startsWith("meta-inf/") && (lower.endsWith(".mnx") || lower.endsWith(".mnx.json") || lower.endsWith(".json"));
    });
  }

  function parseDocumentBytes(value, fileName) {
    const bytes = utils.toUint8Array(value);
    let sourceName = fileName;
    let sourceBytes = bytes;
    if (utils.looksLikeZip(bytes)) {
      const entry = locateMnxEntry(utils.unzip(bytes));
      if (!entry) throw new Error(`${fileName} 압축 파일에서 MNX JSON 문서를 찾지 못했습니다.`);
      sourceName = entry.name;
      sourceBytes = entry.bytes;
    }
    try {
      const documentValue = JSON.parse(cleanJsonText(sourceBytes));
      if (!documentValue || typeof documentValue !== "object") throw new Error("루트 객체가 없습니다.");
      return { documentValue, sourceName };
    } catch (error) {
      throw new Error(`${sourceName} MNX JSON을 해석하지 못했습니다. (${error?.message || error})`);
    }
  }

  function numberFrom(value, fallback = NaN) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function timeSignatureFromGlobal(measure, fallback) {
    const value = measure?.time ?? measure?.timeSignature ?? measure?.meter;
    return notation.normalizeTimeSignature(value, fallback);
  }

  function keySignatureFromGlobal(measure, fallback = { fifths: 0, minor: false }) {
    const value = measure?.key ?? measure?.keySignature;
    if (!value) return { ...fallback };
    if (typeof value === "number") return { fifths: core.clampInt(value, -7, 7, fallback.fifths), minor: fallback.minor };
    const fifths = core.clampInt(value.fifths ?? value.sharps ?? value.accidentals, -7, 7, fallback.fifths);
    const modeText = String(value.mode ?? value.quality ?? "").toLowerCase();
    return { fifths, minor: value.minor === true || modeText === "minor" };
  }

  function normalizeTempo(value, fallback = 120) {
    if (Array.isArray(value)) value = value[0];
    const bpm = numberFrom(value?.bpm ?? value?.beatsPerMinute ?? value?.tempo ?? value, fallback);
    return Math.max(1, Math.min(999, bpm));
  }

  function collectTempoItems(globalMeasure) {
    const values = [];
    const direct = globalMeasure?.tempo ?? globalMeasure?.tempos;
    if (Array.isArray(direct)) values.push(...direct);
    else if (direct != null) values.push(direct);
    for (const content of globalMeasure?.content || []) {
      if (content?.tempo != null || String(content?.type || "").toLowerCase() === "tempo") values.push(content.tempo ?? content);
    }
    return values;
  }

  function positionQuarters(value, measureQuarters = 4) {
    if (value == null) return 0;
    if (typeof value === "number") return Math.max(0, value * 4);
    if (typeof value === "string" || Array.isArray(value)) {
      const fraction = notation.fractionValue(value, NaN);
      return Number.isFinite(fraction) ? Math.max(0, fraction * 4) : 0;
    }
    if (typeof value === "object") {
      if (Number.isFinite(Number(value.quarters))) return Math.max(0, Number(value.quarters));
      if (Number.isFinite(Number(value.measureFraction))) return Math.max(0, Number(value.measureFraction) * measureQuarters);
      const fraction = notation.fractionValue(value, NaN);
      if (Number.isFinite(fraction)) return Math.max(0, fraction * 4);
    }
    return 0;
  }

  function durationQuarters(value, measureDuration = 4, multiplier = 1) {
    if (value?.base === "measure" || value?.type === "measure") return measureDuration * multiplier;
    return Math.max(0, notation.noteValueQuarters(value, { fallback: 1 }) * multiplier);
  }

  function tupletMultiplier(item, inherited) {
    const ratio = item?.ratio ?? item?.timeModification ?? item?.tuplet ?? item;
    const actual = numberFrom(ratio?.actualNotes ?? ratio?.actual ?? ratio?.inner, NaN);
    const normal = numberFrom(ratio?.normalNotes ?? ratio?.normal ?? ratio?.outer, NaN);
    if (Number.isFinite(actual) && actual > 0 && Number.isFinite(normal) && normal > 0) return inherited * (normal / actual);
    return inherited;
  }

  function tieFlags(note) {
    const value = note?.tie ?? note?.ties ?? note?.tied;
    const values = Array.isArray(value) ? value : [value];
    let start = false;
    let stop = false;
    for (const item of values) {
      const text = String(item?.type ?? item ?? "").toLowerCase();
      start ||= item?.start === true || item?.begin === true || ["start", "begin", "continue"].includes(text);
      stop ||= item?.stop === true || item?.end === true || ["stop", "end", "continue"].includes(text);
    }
    return { start, stop };
  }

  function notePitch(note, fallback = 60) {
    if (Number.isFinite(Number(note?.midi))) return core.clampInt(note.midi, 0, 127, fallback);
    return notation.pitchObjectToMidi(note?.pitch ?? note, fallback);
  }

  function parseSequenceContent(content, context) {
    let cursor = context.startQuarter;
    let maximum = cursor;
    const items = Array.isArray(content) ? content : [];

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const type = String(item.type ?? item.kind ?? "").toLowerCase();
      const explicitPosition = item.position ?? item.offset ?? item.onset;
      if (explicitPosition != null) cursor = context.measureStartQuarter + positionQuarters(explicitPosition, context.measureDurationQuarter);

      const nested = item.content ?? item.events;
      if (Array.isArray(nested) && (type === "tuplet" || item.ratio || item.actualNotes || item.normalNotes)) {
        const nestedContext = {
          ...context,
          startQuarter: cursor,
          multiplier: tupletMultiplier(item, context.multiplier),
        };
        const nestedEnd = parseSequenceContent(nested, nestedContext);
        cursor = Math.max(cursor, nestedEnd);
        maximum = Math.max(maximum, cursor);
        continue;
      }
      if (Array.isArray(nested) && !item.duration && !item.notes && !item.rest) {
        const nestedEnd = parseSequenceContent(nested, { ...context, startQuarter: cursor });
        cursor = Math.max(cursor, nestedEnd);
        maximum = Math.max(maximum, cursor);
        continue;
      }

      const value = item.duration ?? item.value ?? item.noteValue ?? item.visualDuration;
      const duration = durationQuarters(value, context.measureDurationQuarter, context.multiplier);
      if (type === "space" || item.space != null || item.rest != null || type === "rest") {
        cursor += duration;
        maximum = Math.max(maximum, cursor);
        continue;
      }

      const notes = Array.isArray(item.notes) ? item.notes : (item.note ? [item.note] : []);
      if (notes.length) {
        for (const note of notes) {
          const pitch = notePitch(note);
          const tie = tieFlags(note);
          const key = `${context.trackIndex}:${pitch}:${context.staff ?? 1}:${context.voice ?? 0}`;
          const endQuarter = Math.max(cursor + 1 / context.ppq, cursor + duration);
          if (tie.stop && context.activeTies.has(key)) {
            const previous = context.activeTies.get(key);
            previous.endTick = Math.max(previous.endTick, Math.round(endQuarter * context.ppq));
            if (!tie.start) context.activeTies.delete(key);
          } else {
            const lyric = Array.isArray(note.lyrics) ? note.lyrics.map(item => item?.text ?? item).filter(Boolean).join(" ")
              : (note.lyric?.text ?? note.lyric ?? item.lyric?.text ?? item.lyric ?? "");
            const output = {
              startTick: Math.round(cursor * context.ppq),
              endTick: Math.max(Math.round(cursor * context.ppq) + 1, Math.round(endQuarter * context.ppq)),
              pitch,
              velocity: core.clampInt(note.velocity ?? item.velocity, 1, 127, core.DEFAULT_VELOCITY),
              lyric: String(lyric || ""),
            };
            context.notes.push(output);
            if (tie.start) context.activeTies.set(key, output);
          }
        }
      }
      cursor += duration;
      maximum = Math.max(maximum, cursor);
    }
    return maximum;
  }

  function partProgram(part) {
    const instrument = part?.instrument ?? part?.instruments?.[0] ?? {};
    return core.clampInt(
      part?.midiProgram ?? part?.program ?? instrument?.midiProgram ?? instrument?.program ?? instrument?.midi?.program,
      0,
      127,
      0,
    );
  }

  function partChannel(part) {
    const instrument = part?.instrument ?? part?.instruments?.[0] ?? {};
    const value = numberFrom(part?.midiChannel ?? part?.channel ?? instrument?.midiChannel ?? instrument?.channel ?? instrument?.midi?.channel, NaN);
    if (!Number.isFinite(value)) return undefined;
    // MNX implementations may serialize MIDI channels as either zero- or one-based.
    return core.clampInt(value >= 1 && value <= 16 ? value - 1 : value, 0, 15, 0);
  }

  function mnxToMidiBytes(data, fileName = "MNX") {
    const { documentValue, sourceName } = parseDocumentBytes(data, fileName);
    const parts = Array.isArray(documentValue.parts) ? documentValue.parts : [];
    if (!parts.length) throw new Error(`${sourceName}에 MNX part가 없습니다.`);

    const ppq = core.DEFAULT_PPQ;
    const globalMeasures = Array.isArray(documentValue.global?.measures) ? documentValue.global.measures : [];
    const maxMeasures = Math.max(globalMeasures.length, ...parts.map(part => Array.isArray(part.measures) ? part.measures.length : 0));
    const measureStarts = [];
    const measureDurations = [];
    const timeSignatures = [];
    const keySignatures = [];
    const tempoEvents = [];
    let currentQuarter = 0;
    let currentTime = { numerator: 4, denominator: 4 };
    let currentKey = { fifths: 0, minor: false };

    for (let measureIndex = 0; measureIndex < maxMeasures; measureIndex++) {
      const globalMeasure = globalMeasures[measureIndex] || {};
      currentTime = timeSignatureFromGlobal(globalMeasure, currentTime);
      currentKey = keySignatureFromGlobal(globalMeasure, currentKey);
      const duration = notation.measureQuarters(currentTime);
      measureStarts.push(currentQuarter);
      measureDurations.push(duration);
      if (measureIndex === 0 || globalMeasure.time || globalMeasure.timeSignature || globalMeasure.meter) {
        timeSignatures.push({ tick: Math.round(currentQuarter * ppq), ...currentTime });
      }
      if (measureIndex === 0 || globalMeasure.key || globalMeasure.keySignature) {
        keySignatures.push({ tick: Math.round(currentQuarter * ppq), sharps: currentKey.fifths, minor: currentKey.minor });
      }
      for (const tempo of collectTempoItems(globalMeasure)) {
        const offset = positionQuarters(tempo?.position ?? tempo?.offset ?? 0, duration);
        tempoEvents.push({ tick: Math.round((currentQuarter + offset) * ppq), bpm: normalizeTempo(tempo) });
      }
      currentQuarter += duration;
    }

    const tracks = parts.map((part, partIndex) => {
      const notes = [];
      const activeTies = new Map();
      for (let measureIndex = 0; measureIndex < maxMeasures; measureIndex++) {
        const measure = part.measures?.[measureIndex] || {};
        const sequences = Array.isArray(measure.sequences) ? measure.sequences : [];
        for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex++) {
          const sequence = sequences[sequenceIndex] || {};
          parseSequenceContent(sequence.content || [], {
            ppq,
            notes,
            activeTies,
            trackIndex: partIndex,
            staff: sequence.staff ?? 1,
            voice: sequence.voice ?? sequenceIndex,
            measureStartQuarter: measureStarts[measureIndex] || 0,
            measureDurationQuarter: measureDurations[measureIndex] || 4,
            startQuarter: measureStarts[measureIndex] || 0,
            multiplier: 1,
          });
        }
      }
      const channel = partChannel(part);
      const percussion = part.percussion === true || part.isPercussion === true || channel === 9;
      return {
        name: String(part.name ?? part.fullName ?? part.id ?? `Part ${partIndex + 1}`),
        program: partProgram(part),
        channel: percussion ? 9 : channel,
        isDrums: percussion,
        notes,
      };
    }).filter(track => track.notes.length > 0);

    if (!tracks.length) throw new Error(`${sourceName}에서 재생 가능한 MNX 음표를 찾지 못했습니다.`);
    const title = String(documentValue.title ?? documentValue.metadata?.title ?? documentValue.score?.title ?? fileName.replace(/\.(?:mnx(?:\.json)?|json)$/i, ""));
    return {
      midiBytes: core.buildMidi({
        ppq,
        title,
        tempoEvents: notation.dedupeTimedEvents(tempoEvents.length ? tempoEvents : [{ tick: 0, bpm: 120 }], event => event.bpm),
        timeSignatures: notation.dedupeTimedEvents(timeSignatures, event => `${event.numerator}/${event.denominator}`),
        keySignatures: notation.dedupeTimedEvents(keySignatures, event => `${event.sharps}:${event.minor}`),
        tracks,
      }),
      metadata: {
        title,
        sourceEntry: sourceName,
        partCount: tracks.length,
        noteCount: tracks.reduce((sum, track) => sum + track.notes.length, 0),
        mnxVersion: documentValue.mnx?.version ?? null,
      },
    };
  }

  root.MabiMnx = Object.freeze({ version: "5.0.0", parseDocumentBytes, mnxToMidiBytes });
})();
