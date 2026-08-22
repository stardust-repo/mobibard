(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  const notation = root.MabiNotation;
  const core = root.MabiMusicFormats;
  if (!utils || !notation || !core) throw new Error("MuseScore parser dependencies are not loaded.");

  function child(node, name) { return utils.childByLocalName(node, name); }
  function children(node, name) { return utils.childrenByLocalName(node, name); }
  function text(node, names, fallback = "") { return utils.childText(node, names, fallback); }
  function numberText(node, names, fallback = NaN) {
    const number = Number(text(node, names, ""));
    return Number.isFinite(number) ? number : fallback;
  }

  function locateMscxEntry(entries) {
    const container = utils.findZipEntry(entries, ["META-INF/container.xml"]);
    if (container) {
      try {
        const documentNode = utils.parseXml(container.bytes, container.name);
        const rootFile = utils.firstDescendantByLocalName(documentNode, "rootfile");
        const path = rootFile?.getAttribute?.("full-path") || rootFile?.getAttribute?.("fullPath");
        const selected = utils.findZipEntry(entries, [path]);
        if (selected) return selected;
      } catch (_) {}
    }
    const preferred = utils.findZipEntry(entries, ["score.mscx", "score/score.mscx"]);
    if (preferred) return preferred;
    return utils.findZipEntry(entries, [], name => {
      const lower = name.toLowerCase();
      return lower.endsWith(".mscx") && !lower.includes("/excerpts/") && !lower.startsWith("excerpts/");
    });
  }

  function extractMscxDocument(value, fileName) {
    const bytes = utils.toUint8Array(value);
    let sourceName = fileName;
    let sourceBytes = bytes;
    if (utils.looksLikeZip(bytes)) {
      const entry = locateMscxEntry(utils.unzip(bytes));
      if (!entry) throw new Error(`${fileName} 압축 파일에서 MuseScore .mscx 문서를 찾지 못했습니다.`);
      sourceName = entry.name;
      sourceBytes = entry.bytes;
    }
    const documentNode = utils.parseXml(sourceBytes, sourceName);
    const rootName = utils.localName(documentNode.documentElement);
    if (rootName !== "musescore") throw new Error(`${sourceName}은 MuseScore XML 문서가 아닙니다.`);
    const score = utils.firstDescendantByLocalName(documentNode, "score");
    if (!score) throw new Error(`${sourceName}에 MuseScore Score 요소가 없습니다.`);
    return { documentNode, score, sourceName };
  }

  function directDescendant(node, name) {
    const expected = String(name).toLowerCase();
    return Array.from(node?.children || []).find(item => utils.localName(item) === expected) || null;
  }

  function metaTag(score, name) {
    const expected = String(name || "").toLowerCase();
    for (const item of utils.descendantsByLocalName(score, "metatag")) {
      if (String(item.getAttribute?.("name") || "").toLowerCase() === expected) return String(item.textContent || "").trim();
    }
    return "";
  }

  function titleOf(score, fileName) {
    return metaTag(score, "workTitle") || metaTag(score, "movementTitle") || metaTag(score, "title")
      || String(fileName || "MuseScore").replace(/\.(?:mscz|mscx)$/i, "");
  }

  function scoreDivision(score) {
    const value = Number(text(score, ["Division", "division"], "480"));
    return Number.isFinite(value) && value > 0 ? value : 480;
  }

  function museControllerValue(channelNode, controller, fallback = undefined) {
    if (!channelNode) return fallback;
    for (const node of utils.descendantsByLocalName(channelNode, "controller")) {
      const ctrl = Number(node.getAttribute?.("ctrl") ?? node.getAttribute?.("controller") ?? text(node, ["ctrl", "controller"], ""));
      if (ctrl !== controller) continue;
      const value = Number(node.getAttribute?.("value") ?? text(node, ["value"], node.textContent));
      if (Number.isFinite(value)) return core.clampInt(value, 0, 127, fallback ?? 0);
    }
    return fallback;
  }

  function dynamicVelocity(value, fallback = core.DEFAULT_VELOCITY) {
    const key = String(value || "").trim().toLowerCase();
    return ({ ppp: 28, pp: 38, p: 50, mp: 64, mf: 76, f: 90, ff: 105, fff: 120, sfz: 112, sf: 104, fp: 82 })[key]
      || core.clampInt(Number(value), 1, 127, fallback);
  }

  function mapParts(score) {
    const staffToPart = new Map();
    const parts = [];
    const partNodes = children(score, "Part");
    for (let index = 0; index < partNodes.length; index++) {
      const node = partNodes[index];
      const instrument = directDescendant(node, "Instrument") || utils.firstDescendantByLocalName(node, "instrument");
      const channelNode = instrument ? utils.firstDescendantByLocalName(instrument, "channel") : null;
      const programNode = channelNode ? utils.firstDescendantByLocalName(channelNode, "program") : null;
      const channelValue = numberText(channelNode, ["midiChannel", "channel"], NaN);
      let channel;
      if (Number.isFinite(channelValue)) channel = core.clampInt(channelValue >= 1 && channelValue <= 16 ? channelValue - 1 : channelValue, 0, 15, 0);
      const name = text(node, ["trackName", "name"], "")
        || text(instrument, ["longName", "shortName", "trackName"], "")
        || `Part ${index + 1}`;
      const program = core.clampInt(programNode?.getAttribute?.("value") ?? programNode?.textContent ?? numberText(channelNode, ["program"], 0), 0, 127, 0);
      const drumset = Boolean(utils.firstDescendantByLocalName(instrument, "drumset"))
        || String(text(instrument, ["useDrumset"], "")).toLowerCase() === "true"
        || channel === 9;
      const part = {
        index, node, name, program, channel: drumset ? 9 : channel, isDrums: drumset, notes: [], activeTies: new Map(),
        volume: museControllerValue(channelNode, 7, undefined),
        pan: museControllerValue(channelNode, 10, undefined),
        expression: museControllerValue(channelNode, 11, undefined),
      };
      parts.push(part);
      for (const staffNode of children(node, "Staff")) {
        const id = String(staffNode.getAttribute?.("id") || text(staffNode, ["id"], "")).trim();
        if (id) staffToPart.set(id, part);
      }
    }
    return { parts, staffToPart };
  }

  function scoreStaffNodes(score) {
    return children(score, "Staff").filter(node => children(node, "Measure").length > 0);
  }

  function timeSignatureInMeasure(measure, fallback) {
    const timeSig = utils.firstDescendantByLocalName(measure, "timesig");
    if (!timeSig) return { ...fallback };
    return notation.normalizeTimeSignature({
      numerator: numberText(timeSig, ["sigN", "numerator"], fallback.numerator),
      denominator: numberText(timeSig, ["sigD", "denominator"], fallback.denominator),
    }, fallback);
  }

  function measureLengthQuarters(measure, timeSignature) {
    const raw = measure.getAttribute?.("len") || text(measure, ["len"], "");
    const fraction = notation.fractionValue(raw, NaN);
    return Number.isFinite(fraction) && fraction > 0 ? fraction * 4 : notation.measureQuarters(timeSignature);
  }

  function collectTimeline(staffNodes, ppq) {
    const maxMeasures = Math.max(0, ...staffNodes.map(staff => children(staff, "Measure").length));
    const starts = [];
    const durations = [];
    const timeSignatures = [];
    const keySignatures = [];
    const tempoEvents = [];
    let quarter = 0;
    let currentTime = { numerator: 4, denominator: 4 };
    let currentKey = { sharps: 0, minor: false };

    for (let index = 0; index < maxMeasures; index++) {
      const measures = staffNodes.map(staff => children(staff, "Measure")[index]).filter(Boolean);
      const reference = measures[0];
      const foundTime = measures.map(measure => utils.firstDescendantByLocalName(measure, "timesig")).find(Boolean);
      if (foundTime) currentTime = timeSignatureInMeasure(foundTime.parentElement || reference, currentTime);
      const duration = reference ? measureLengthQuarters(reference, currentTime) : notation.measureQuarters(currentTime);
      starts.push(quarter);
      durations.push(duration);
      if (index === 0 || foundTime) timeSignatures.push({ tick: Math.round(quarter * ppq), ...currentTime });

      const keyNode = measures.map(measure => utils.firstDescendantByLocalName(measure, "keysig")).find(Boolean);
      if (keyNode) {
        const accidental = numberText(keyNode, ["accidental", "fifths"], currentKey.sharps);
        const mode = String(text(keyNode, ["mode"], "")).toLowerCase();
        currentKey = { sharps: core.clampInt(accidental, -7, 7, currentKey.sharps), minor: mode === "minor" };
      }
      if (index === 0 || keyNode) keySignatures.push({ tick: Math.round(quarter * ppq), ...currentKey });

      quarter += duration;
    }
    return { maxMeasures, starts, durations, timeSignatures, keySignatures, tempoEvents };
  }

  function collectTuplets(documentNode) {
    const result = new Map();
    for (const node of utils.descendantsByLocalName(documentNode, "tuplet")) {
      if (utils.localName(node.parentElement) !== "voice" && utils.localName(node.parentElement) !== "measure") continue;
      const id = String(node.getAttribute?.("id") || "").trim();
      if (!id) continue;
      const actual = numberText(node, ["actualNotes", "actual"], NaN);
      const normal = numberText(node, ["normalNotes", "normal"], NaN);
      if (Number.isFinite(actual) && actual > 0 && Number.isFinite(normal) && normal > 0) result.set(id, normal / actual);
    }
    return result;
  }

  function chordDurationQuarter(node, measureDuration, tuplets) {
    const durationType = text(node, ["durationType", "duration-type"], "quarter").toLowerCase();
    if (durationType === "measure") return measureDuration;
    const durationRaw = text(node, ["duration"], "");
    let quarters;
    const fraction = notation.fractionValue(durationRaw, NaN);
    if (Number.isFinite(fraction) && durationRaw.includes("/")) quarters = fraction * 4;
    else quarters = notation.noteValueQuarters({ base: durationType, dots: numberText(node, ["dots"], 0) }, { fallback: 1 });
    const tupletId = text(node, ["Tuplet", "tuplet"], "");
    if (tupletId && tuplets.has(tupletId)) quarters *= tuplets.get(tupletId);
    return Math.max(1 / core.DEFAULT_PPQ, quarters);
  }

  function elementName(node) { return utils.localName(node); }

  function parseStaff(staffNode, part, timeline, division, tuplets, ppq) {
    const staffId = String(staffNode.getAttribute?.("id") || "1");
    const measures = children(staffNode, "Measure");
    let staffVelocity = 64;
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
      const measure = measures[measureIndex];
      const measureStart = timeline.starts[measureIndex] || 0;
      const measureDuration = timeline.durations[measureIndex] || 4;
      const voices = children(measure, "voice");
      for (const tempoNode of utils.descendantsByLocalName(measure, "tempo")) {
        if (utils.localName(tempoNode.parentElement) !== "measure") continue;
        let value = Number(String(tempoNode.textContent || "").trim());
        if (!Number.isFinite(value) || value <= 0) continue;
        if (value <= 20) value *= 60;
        timeline.tempoEvents.push({ tick: Math.round(measureStart * ppq), bpm: Math.max(1, Math.min(999, value)) });
      }
      for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex++) {
        const voice = voices[voiceIndex];
        let cursor = measureStart;
        let currentVelocity = staffVelocity;
        for (const item of Array.from(voice.children || [])) {
          const kind = elementName(item);
          if (kind === "tick") {
            const tick = Number(item.textContent);
            if (Number.isFinite(tick)) cursor = Math.max(0, tick / division);
            continue;
          }
          if (kind === "location") {
            const fractions = notation.fractionValue(text(item, ["fractions"], ""), NaN);
            if (Number.isFinite(fractions)) cursor += fractions * 4;
            continue;
          }
          if (kind === "tempo") {
            let value = Number(String(item.textContent || "").trim());
            if (Number.isFinite(value) && value > 0) {
              if (value <= 20) value *= 60;
              timeline.tempoEvents.push({ tick: Math.round(cursor * ppq), bpm: Math.max(1, Math.min(999, value)) });
            }
            continue;
          }
          if (kind === "dynamic") {
            const explicit = numberText(item, ["velocity"], NaN);
            const mark = text(item, ["subtype", "text"], "");
            currentVelocity = Number.isFinite(explicit)
              ? core.clampInt(explicit, 1, 127, currentVelocity)
              : dynamicVelocity(mark, currentVelocity);
            staffVelocity = currentVelocity;
            continue;
          }
          if (kind !== "chord" && kind !== "rest") continue;
          const duration = chordDurationQuarter(item, measureDuration, tuplets);
          const grace = Boolean(child(item, "grace4") || child(item, "grace8") || child(item, "acciaccatura") || child(item, "appoggiatura"));
          const effectiveDuration = grace ? Math.min(duration, 0.125) : duration;
          if (kind === "chord") {
            const noteNodes = children(item, "Note");
            const lyric = children(item, "Lyrics").map(node => text(node, ["text", "syllabic"], "")).filter(Boolean).join(" ");
            for (const noteNode of noteNodes) {
              const pitch = core.clampInt(numberText(noteNode, ["pitch"], 60), 0, 127, 60);
              const tieStart = Boolean(child(noteNode, "Tie") || child(noteNode, "tie"));
              const tieStop = Boolean(child(noteNode, "endSpanner") || child(noteNode, "endspanner"));
              const tieKey = `${staffId}:${voiceIndex}:${pitch}`;
              const endTick = Math.max(Math.round(cursor * ppq) + 1, Math.round((cursor + effectiveDuration) * ppq));
              if (tieStop && part.activeTies.has(tieKey)) {
                const previous = part.activeTies.get(tieKey);
                previous.endTick = Math.max(previous.endTick, endTick);
                if (!tieStart) part.activeTies.delete(tieKey);
              } else {
                const velocityValue = numberText(noteNode, ["veloOffset", "velocity"], NaN);
                const veloType = String(text(noteNode, ["veloType"], "")).trim().toLowerCase();
                const isAbsoluteVelocity = veloType === "1" || veloType.includes("user") || veloType.includes("absolute");
                const velocity = Number.isFinite(velocityValue)
                  ? (isAbsoluteVelocity ? velocityValue : currentVelocity + velocityValue)
                  : currentVelocity;
                const output = {
                  startTick: Math.round(cursor * ppq),
                  endTick,
                  pitch,
                  velocity: core.clampInt(velocity, 1, 127, core.DEFAULT_VELOCITY),
                  lyric,
                };
                part.notes.push(output);
                if (tieStart) part.activeTies.set(tieKey, output);
              }
            }
          }
          if (!grace) cursor += duration;
        }
      }
    }
  }

  function museScoreToMidiBytes(data, fileName = "MuseScore") {
    const { documentNode, score, sourceName } = extractMscxDocument(data, fileName);
    const ppq = core.DEFAULT_PPQ;
    const division = scoreDivision(score);
    const { parts, staffToPart } = mapParts(score);
    const staffNodes = scoreStaffNodes(score);
    if (!staffNodes.length) throw new Error(`${sourceName}에 재생 가능한 MuseScore Staff가 없습니다.`);
    const timeline = collectTimeline(staffNodes, ppq);
    const tuplets = collectTuplets(documentNode);

    for (let index = 0; index < staffNodes.length; index++) {
      const staffNode = staffNodes[index];
      const id = String(staffNode.getAttribute?.("id") || "").trim();
      let part = staffToPart.get(id);
      if (!part) {
        part = { index: parts.length, name: `Staff ${id || index + 1}`, program: 0, channel: undefined, isDrums: false, notes: [], activeTies: new Map() };
        parts.push(part);
      }
      parseStaff(staffNode, part, timeline, division, tuplets, ppq);
    }

    const tracks = parts.filter(part => part.notes.length).map(part => ({
      name: part.name,
      program: part.program,
      channel: part.isDrums ? 9 : part.channel,
      isDrums: part.isDrums,
      volume: part.volume,
      pan: part.pan,
      expression: part.expression,
      notes: part.notes,
    }));
    if (!tracks.length) throw new Error(`${sourceName}에서 재생 가능한 MuseScore 음표를 찾지 못했습니다.`);
    const title = titleOf(score, fileName);
    return {
      midiBytes: core.buildMidi({
        ppq,
        title,
        tempoEvents: notation.dedupeTimedEvents(timeline.tempoEvents.length ? timeline.tempoEvents : [{ tick: 0, bpm: 120 }], event => event.bpm),
        timeSignatures: notation.dedupeTimedEvents(timeline.timeSignatures, event => `${event.numerator}/${event.denominator}`),
        keySignatures: notation.dedupeTimedEvents(timeline.keySignatures, event => `${event.sharps}:${event.minor}`),
        tracks,
      }),
      metadata: {
        title,
        sourceEntry: sourceName,
        partCount: tracks.length,
        noteCount: tracks.reduce((sum, track) => sum + track.notes.length, 0),
        museScoreVersion: documentNode.documentElement?.getAttribute?.("version") || null,
      },
    };
  }

  root.MabiMuseScore = Object.freeze({ version: "5.1.0", extractMscxDocument, museScoreToMidiBytes });
})();
