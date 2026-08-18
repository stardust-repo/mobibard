(() => {
  "use strict";

  // Finale MUSX container and EnigmaXML reader.
  // score.dat decoding follows the MIT-licensed denigma implementation.

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  const core = root.MabiMusicFormats;
  const notation = root.MabiNotation;
  if (!utils) throw new Error("utils.js must be loaded before finale-musx-to-midi.js");
  if (!core) throw new Error("music-format-core.js must be loaded before finale-musx-to-midi.js");
  if (!notation) throw new Error("notation-utils.js must be loaded before finale-musx-to-midi.js");

  const INITIAL_STATE = 0x28006d45;
  const RESET_LIMIT = 0x20000;
  const WHOLE_EDU = 4096;
  const QUARTER_EDU = WHOLE_EDU / 4;
  const DEFAULT_BPM = 120;
  const MAX_CHAIN_STEPS = 1_000_000;

  function recodeScoreDat(value, initialState = INITIAL_STATE) {
    const output = utils.copyUint8Array(value);
    let state = initialState >>> 0;
    for (let index = 0; index < output.length; index++) {
      if (index % RESET_LIMIT === 0) state = initialState >>> 0;
      state = (Math.imul(state, 0x41c64e6d) + 0x3039) >>> 0;
      const upper = state >>> 16;
      output[index] ^= (upper + Math.floor(upper / 255)) & 0xff;
    }
    return output;
  }

  function isGzip(value) {
    const bytes = utils.toUint8Array(value);
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  }

  function looksLikeXml(value) {
    const bytes = utils.toUint8Array(value);
    const text = utils.decodeText(bytes.subarray(0, Math.min(bytes.length, 512)), ["utf-8", "utf-16le", "utf-16be"]);
    return /^\s*(?:<\?xml\b[^>]*>\s*)?<finale\b/i.test(text) || /<finale\b/i.test(text);
  }

  function decodeScoreDat(value) {
    const bytes = utils.toUint8Array(value);
    if (!bytes.length) throw new Error("MUSX score.dat 파일이 비어 있습니다.");
    if (looksLikeXml(bytes)) return utils.decodeXml(bytes);
    if (isGzip(bytes)) return utils.decodeXml(utils.gunzip(bytes));
    const decoded = recodeScoreDat(bytes);
    if (!isGzip(decoded)) throw new Error("MUSX score.dat의 Finale 인코딩을 해제하지 못했습니다.");
    return utils.decodeXml(utils.gunzip(decoded));
  }

  function entryBySuffix(entries, suffixes) {
    const wanted = (Array.isArray(suffixes) ? suffixes : [suffixes]).map(value => String(value).toLowerCase());
    return utils.findZipEntry(entries, wanted, name => {
      const lower = String(name).toLowerCase();
      return wanted.some(suffix => lower === suffix || lower.endsWith(`/${suffix}`));
    });
  }

  function metadataFromArchive(entries) {
    const metadataEntry = entryBySuffix(entries, ["NotationMetadata.xml", "metadata.xml"]);
    if (!metadataEntry) return {};
    try {
      const documentNode = utils.parseXml(metadataEntry.bytes, metadataEntry.name);
      const pick = names => {
        for (const name of names) {
          const node = utils.firstDescendantByLocalName(documentNode, name);
          const value = String(node?.textContent || "").replace(/\s+/g, " ").trim();
          if (value) return value;
        }
        return "";
      };
      return {
        title: pick(["title", "documenttitle", "worktitle", "movementtitle"]),
        composer: pick(["composer", "creator"]),
        copyright: pick(["copyright", "rights"]),
      };
    } catch (_) {
      return {};
    }
  }

  function extractMusxDocument(value, fileName = "score.musx") {
    const bytes = utils.toUint8Array(value);
    if (utils.looksLikeZip(bytes)) {
      const entries = utils.unzip(bytes);
      const scoreEntry = entryBySuffix(entries, "score.dat");
      if (!scoreEntry) {
        const xmlEntry = utils.findZipEntry(entries, [], name => /(?:^|\/)(?:score|document|finale).*\.xml$/i.test(name));
        if (!xmlEntry) throw new Error(`${fileName}에서 Finale score.dat 파일을 찾지 못했습니다.`);
        return {
          documentNode: utils.parseXml(xmlEntry.bytes, xmlEntry.name),
          sourceEntry: xmlEntry.name,
          metadata: metadataFromArchive(entries),
        };
      }
      const xml = decodeScoreDat(scoreEntry.bytes);
      return {
        documentNode: utils.parseXml(xml, scoreEntry.name),
        sourceEntry: scoreEntry.name,
        metadata: metadataFromArchive(entries),
      };
    }
    return {
      documentNode: utils.parseXml(bytes, fileName),
      sourceEntry: fileName,
      metadata: {},
    };
  }

  function attributeValue(node, names) {
    for (const name of Array.isArray(names) ? names : [names]) {
      const direct = node?.getAttribute?.(name);
      if (direct != null && String(direct).trim() !== "") return String(direct).trim();
      const expected = String(name).toLowerCase();
      for (const attribute of Array.from(node?.attributes || [])) {
        if (String(attribute.localName || attribute.name).replace(/^.*:/, "").toLowerCase() === expected) {
          const value = String(attribute.value || "").trim();
          if (value !== "") return value;
        }
      }
    }
    return "";
  }

  function fieldValue(node, names, fallback = "") {
    const attribute = attributeValue(node, names);
    if (attribute !== "") return attribute;
    for (const name of Array.isArray(names) ? names : [names]) {
      const child = utils.childByLocalName(node, name);
      const value = String(child?.textContent || "").trim();
      if (value !== "") return value;
    }
    return fallback;
  }

  function fieldNumber(node, names, fallback = 0) {
    const raw = fieldValue(node, names, "");
    if (raw === "") return fallback;
    const number = Number(raw);
    return Number.isFinite(number) ? number : fallback;
  }

  function descendantFieldNumber(node, names, fallback = 0) {
    const direct = fieldNumber(node, names, NaN);
    if (Number.isFinite(direct)) return direct;
    for (const name of Array.isArray(names) ? names : [names]) {
      const descendant = utils.firstDescendantByLocalName(node, name);
      const number = Number(String(descendant?.textContent || "").trim());
      if (Number.isFinite(number)) return number;
    }
    return fallback;
  }

  function hasFlag(node, names) {
    for (const name of Array.isArray(names) ? names : [names]) {
      const attribute = attributeValue(node, name);
      if (attribute !== "") return !/^(?:0|false|no|off)$/i.test(attribute);
      const child = utils.childByLocalName(node, name);
      if (child) {
        const value = String(child.textContent || "").trim();
        return value === "" || !/^(?:0|false|no|off)$/i.test(value);
      }
    }
    return false;
  }

  function cleanName(value, fallback) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || /^\d+$/.test(text)) return fallback;
    return text.slice(0, 160);
  }

  function parseEntryNodes(documentNode) {
    const entries = new Map();
    for (const node of utils.descendantsByLocalName(documentNode, "entry")) {
      const entnum = Math.trunc(fieldNumber(node, ["entnum", "entryNumber", "id"], NaN));
      if (!Number.isFinite(entnum)) continue;
      const noteNodes = utils.childrenByLocalName(node, "note");
      const notes = noteNodes.map(noteNode => ({
        harmLev: Math.trunc(fieldNumber(noteNode, ["harmLev", "harmonicLevel"], 0)),
        harmAlt: Math.trunc(fieldNumber(noteNode, ["harmAlt", "harmonicAlteration"], 0)),
        tieStart: hasFlag(noteNode, ["tieStart", "tie-start", "startTie"]),
        tieEnd: hasFlag(noteNode, ["tieEnd", "tie-end", "endTie", "tieStop"]),
      }));
      entries.set(entnum, {
        entnum,
        next: Math.trunc(fieldNumber(node, ["next", "nextEntry"], 0)),
        previous: Math.trunc(fieldNumber(node, ["prev", "previous", "previousEntry"], 0)),
        durationEdu: Math.max(0, Math.round(fieldNumber(node, ["dura", "duration"], QUARTER_EDU))),
        isGrace: hasFlag(node, ["graceNote", "grace", "isGrace"]),
        notes,
      });
    }
    return entries;
  }

  function parseFrames(documentNode) {
    const frames = new Map();
    for (const node of utils.descendantsByLocalName(documentNode, "framespec")) {
      const cmper = Math.trunc(fieldNumber(node, ["cmper", "id"], NaN));
      if (!Number.isFinite(cmper)) continue;
      frames.set(cmper, {
        cmper,
        startEntry: Math.trunc(fieldNumber(node, ["startEntry", "startEntnum", "start"], 0)),
        endEntry: Math.trunc(fieldNumber(node, ["endEntry", "endEntnum", "end"], 0)),
      });
    }
    return frames;
  }

  function parseMeasures(documentNode) {
    const nodes = utils.descendantsByLocalName(documentNode, "measspec");
    const raw = [];
    let previousBeats = 4;
    let previousDivbeat = QUARTER_EDU;
    let previousKey = 0;
    for (const node of nodes) {
      const number = Math.trunc(fieldNumber(node, ["cmper", "measure", "id"], NaN));
      if (!Number.isFinite(number) || number <= 0) continue;
      const beats = Math.max(1, Math.round(fieldNumber(node, ["beats", "beatCount"], previousBeats)));
      const divbeat = Math.max(1, Math.round(fieldNumber(node, ["divbeat", "beatDuration"], previousDivbeat)));
      const keyNode = utils.firstDescendantByLocalName(node, "keysig");
      const keyRaw = Math.trunc(keyNode
        ? descendantFieldNumber(keyNode, ["key", "keyValue"], previousKey)
        : descendantFieldNumber(node, ["key", "keySig", "keyValue"], previousKey));
      const explicitDuration = Math.round(fieldNumber(node, ["duration", "actualDuration", "actDur"], NaN));
      raw.push({ number, beats, divbeat, keyRaw, explicitDuration });
      previousBeats = beats;
      previousDivbeat = divbeat;
      previousKey = keyRaw;
    }
    raw.sort((left, right) => left.number - right.number);
    const measures = new Map();
    let startEdu = 0;
    for (const item of raw) {
      const nominal = item.beats * item.divbeat;
      const lengthEdu = Number.isFinite(item.explicitDuration) && item.explicitDuration > 0 ? item.explicitDuration : nominal;
      measures.set(item.number, { ...item, startEdu, lengthEdu: Math.max(1, lengthEdu) });
      startEdu += Math.max(1, lengthEdu);
    }
    return { measures, durationEdu: startEdu };
  }

  function parseStaffSpecs(documentNode) {
    const staffs = new Map();
    for (const node of utils.descendantsByLocalName(documentNode, "staffspec")) {
      const id = Math.trunc(fieldNumber(node, ["cmper", "staff", "id"], NaN));
      if (!Number.isFinite(id) || id <= 0) continue;
      const candidateName = fieldValue(node, ["fullName", "staffName", "instrumentName", "instName", "name"], "");
      let program = descendantFieldNumber(node, ["midiProgram", "midiPatch", "program", "patch"], 0);
      if (program >= 1 && program <= 128 && hasFlag(node, ["oneBasedProgram", "oneBasedPatch"])) program -= 1;
      let channel = descendantFieldNumber(node, ["midiChannel", "channel"], NaN);
      if (Number.isFinite(channel) && channel >= 1 && channel <= 16) channel -= 1;
      const percussion = hasFlag(node, ["percussion", "isPercussion", "usePercussionMap"]) || channel === 9;
      staffs.set(id, {
        id,
        name: cleanName(candidateName, `Staff ${id}`),
        program: utils.clampInt(program, 0, 127, 0),
        channel: Number.isFinite(channel) ? utils.clampInt(channel, 0, 15, 0) : undefined,
        isDrums: percussion,
        keyAdjust: Math.trunc(descendantFieldNumber(node, ["keyAdjust", "transposition", "transpositionKey"], 0)),
      });
    }
    return staffs;
  }

  function parsePlacements(documentNode, frames, entries) {
    const placements = [];
    const staffIds = new Set();
    for (const hold of utils.descendantsByLocalName(documentNode, "gfhold")) {
      const staff = Math.trunc(fieldNumber(hold, ["cmper1", "staff"], NaN));
      const measure = Math.trunc(fieldNumber(hold, ["cmper2", "measure"], NaN));
      if (!Number.isFinite(staff) || !Number.isFinite(measure) || staff <= 0 || measure <= 0 || staff >= 65000) continue;
      staffIds.add(staff);
      for (let layer = 1; layer <= 4; layer++) {
        const frameId = Math.trunc(fieldNumber(hold, [`frame${layer}`], 0));
        const frame = frames.get(frameId);
        if (!frame || !frame.startEntry) continue;
        let entnum = frame.startEntry;
        let localEdu = 0;
        let steps = 0;
        const seen = new Set();
        while (entnum && steps++ < MAX_CHAIN_STEPS && !seen.has(entnum)) {
          seen.add(entnum);
          const entry = entries.get(entnum);
          if (!entry) break;
          placements.push({ staff, measure, layer, localEdu, entry });
          if (!entry.isGrace) localEdu += entry.durationEdu;
          if (entnum === frame.endEntry || !entry.next) break;
          entnum = entry.next;
        }
      }
    }
    return { placements, staffIds };
  }

  function titleFromDocument(documentNode, fileName, archiveMetadata) {
    if (archiveMetadata?.title) return archiveMetadata.title;
    for (const name of ["title", "documenttitle", "worktitle", "movementtitle"]) {
      const node = utils.firstDescendantByLocalName(documentNode, name);
      const value = cleanName(node?.textContent, "");
      if (value) return value;
    }
    return String(fileName || "score.musx").replace(/\.musx$/i, "");
  }

  function enigmaXmlToMidi(documentNode, fileName = "score.musx", archiveMetadata = {}) {
    if (utils.localName(documentNode?.documentElement) !== "finale") {
      throw new Error(`${fileName}의 score.dat가 Finale EnigmaXML 문서가 아닙니다.`);
    }
    const ppq = core.DEFAULT_PPQ;
    const entries = parseEntryNodes(documentNode);
    const frames = parseFrames(documentNode);
    const { measures, durationEdu } = parseMeasures(documentNode);
    const staffSpecs = parseStaffSpecs(documentNode);
    const { placements, staffIds } = parsePlacements(documentNode, frames, entries);
    if (!measures.size) throw new Error(`${fileName}에서 Finale 마디 정보를 찾지 못했습니다.`);
    if (!placements.length) throw new Error(`${fileName}에서 Finale 음표 프레임을 찾지 못했습니다.`);

    const eduToTick = value => Math.max(0, Math.round((Number(value) || 0) * ppq / QUARTER_EDU));
    const timeSignatures = [];
    const keySignatures = [];
    for (const measure of measures.values()) {
      const tick = eduToTick(measure.startEdu);
      const time = notation.finaleTimeSignature(measure.beats, measure.divbeat, WHOLE_EDU);
      const key = notation.decodeFinaleKey(measure.keyRaw);
      timeSignatures.push({ tick, ...time });
      keySignatures.push({ tick, sharps: key.fifths, minor: key.minor });
    }

    const orderedStaffIds = [...staffIds].sort((left, right) => left - right);
    const tracks = [];
    for (let staffIndex = 0; staffIndex < orderedStaffIds.length; staffIndex++) {
      const staffId = orderedStaffIds[staffIndex];
      const spec = staffSpecs.get(staffId) || {
        id: staffId,
        name: `Staff ${staffId}`,
        program: 0,
        channel: undefined,
        isDrums: false,
        keyAdjust: 0,
      };
      const notes = [];
      const activeTies = new Map();
      const staffPlacements = placements
        .filter(item => item.staff === staffId)
        .sort((left, right) => left.measure - right.measure || left.layer - right.layer || left.localEdu - right.localEdu || left.entry.entnum - right.entry.entnum);
      for (const placement of staffPlacements) {
        const measure = measures.get(placement.measure);
        if (!measure || !placement.entry.notes.length) continue;
        const key = notation.adjustFinaleKey(measure.keyRaw, spec.keyAdjust);
        const startTick = eduToTick(measure.startEdu + placement.localEdu);
        const durationTick = placement.entry.isGrace ? 1 : Math.max(1, eduToTick(placement.entry.durationEdu));
        const endTick = startTick + durationTick;
        for (const sourceNote of placement.entry.notes) {
          const pitch = notation.finalePitchToMidi(sourceNote.harmLev, sourceNote.harmAlt, key, 60);
          const tieKey = `${placement.layer}:${pitch}`;
          if (sourceNote.tieEnd && activeTies.has(tieKey)) {
            const active = activeTies.get(tieKey);
            active.endTick = Math.max(active.endTick, endTick);
            if (!sourceNote.tieStart) activeTies.delete(tieKey);
            continue;
          }
          const note = { startTick, endTick, pitch, velocity: 88 };
          notes.push(note);
          if (sourceNote.tieStart) activeTies.set(tieKey, note);
        }
      }
      if (notes.length) {
        tracks.push({
          name: spec.name,
          program: spec.program,
          channel: spec.isDrums ? 9 : (Number.isFinite(spec.channel) ? spec.channel : root.MabiMidiParser.defaultMelodicChannel(staffIndex)),
          isDrums: spec.isDrums,
          notes,
        });
      }
    }
    if (!tracks.length) throw new Error(`${fileName}에서 재생 가능한 Finale 음표를 찾지 못했습니다.`);

    const title = titleFromDocument(documentNode, fileName, archiveMetadata);
    return {
      midiBytes: core.buildMidi({
        ppq,
        title,
        tempoEvents: [{ tick: 0, bpm: DEFAULT_BPM }],
        timeSignatures: notation.dedupeTimedEvents(timeSignatures, event => `${event.numerator}/${event.denominator}`),
        keySignatures: notation.dedupeTimedEvents(keySignatures, event => `${event.sharps}:${event.minor}`),
        tracks,
      }),
      metadata: {
        title,
        composer: archiveMetadata.composer || "",
        copyright: archiveMetadata.copyright || "",
        finaleVersion: documentNode.documentElement?.getAttribute?.("version") || null,
        staffCount: tracks.length,
        noteCount: tracks.reduce((sum, track) => sum + track.notes.length, 0),
        durationTick: eduToTick(durationEdu),
      },
    };
  }

  function musxToMidiBytes(value, fileName = "score.musx") {
    const extracted = extractMusxDocument(value, fileName);
    const converted = enigmaXmlToMidi(extracted.documentNode, fileName, extracted.metadata);
    return { ...converted, metadata: { ...converted.metadata, sourceEntry: extracted.sourceEntry } };
  }

  root.MabiFinaleMusx = Object.freeze({
    version: "5.0.0",
    recodeScoreDat,
    decodeScoreDat,
    extractMusxDocument,
    enigmaXmlToMidi,
    musxToMidiBytes,
  });
})();
