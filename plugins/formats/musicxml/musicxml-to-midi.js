(() => {
  "use strict";

  const utils = window.MabiUtils;
  const notation = window.MabiNotation;
  const midiParser = window.MabiMidiParser;
  if (!utils) throw new Error("utils.js must be loaded before musicxml-to-midi.js");
  if (!notation) throw new Error("notation-utils.js must be loaded before musicxml-to-midi.js");
  if (!midiParser) throw new Error("midi-parser.js must be loaded before musicxml-to-midi.js");

  const FALLBACK_MESSAGES = {
    "xml.err_empty": "{0} 파일이 비어 있습니다.",
    "xml.err_score_missing": "{0} 파일에서 MusicXML 악보(score-partwise 또는 score-timewise)를 찾지 못했습니다.",
    "xml.err_zip_empty": "{0} 압축 파일 안에 읽을 항목이 없습니다.",
    "xml.err_body_missing": "{0} 압축 파일에서 MusicXML 본문을 찾지 못했습니다.",
    "xml.err_score_type": "{0} 파일의 MusicXML 악보 형식을 지원하지 않습니다.",
    "xml.err_parts_missing": "{0} 파일에서 악보 파트를 찾지 못했습니다.",
    "xml.err_notes_missing": "{0} 파일에서 연주 가능한 노트를 찾지 못했습니다.",
    "xml.err_parse": "{0} XML을 해석하지 못했습니다: {1}",
    "xml.parse_error": "XML 문법 오류",
  };
  const tr = (key, values = []) => {
    const translated = window.MobibardI18n?.t?.(key, values);
    if (translated && translated !== key) return translated;
    let message = FALLBACK_MESSAGES[key] || String(key);
    values.forEach((value, index) => { message = message.replaceAll(`{${index}}`, String(value)); });
    return message;
  };

  const PPQ = 480;
  const DEFAULT_TEMPO = 120;
  // MusicXML defines forte as MIDI velocity 90 for percentage-based dynamics.
  // When the score supplies no usable dynamic information, Mobibard policy is MIDI 96 (~75%).
  const FORTE_VELOCITY = 90;
  const FALLBACK_VELOCITY = 96;
  const MIN_NOTE_TICKS = 1;
  const PERCUSSION_RE = /(drum|percussion|perc|snare|cymbal|kick|tom|hi[- ]?hat|timpani|taiko|wood\s*block|claves|cowbell|triangle|gong|tambourine|maracas|bongo|conga|타악|드럼|스네어|심벌|팀파니|북|징|탬버린)/i;

  async function musicXmlToMidiBytes(data, name = "MusicXML") {
    const inputBytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    const xmlText = await extractMusicXmlText(inputBytes, name);
    const parsed = parseMusicXml(xmlText, name);
    return buildStandardMidiFile(parsed);
  }

  async function extractMusicXmlText(bytes, name = "MusicXML") {
    if (!bytes?.length) throw new Error(tr("xml.err_empty", [name]));
    if (utils.looksLikeZip(bytes)) return readCompressedMusicXml(bytes, name);
    const text = utils.decodeXml(bytes);
    ensureMusicXmlText(text, name);
    return text;
  }

  function ensureMusicXmlText(text, name = "MusicXML") {
    if (!/<\s*(?:[\w.-]+:)?score-(?:partwise|timewise)\b/i.test(String(text || ""))) {
      throw new Error(tr("xml.err_score_missing", [name]));
    }
  }

  function readCompressedMusicXml(bytes, name = "MusicXML") {
    const entries = utils.unzip(bytes);
    if (!entries.size) throw new Error(tr("xml.err_zip_empty", [name]));
    let rootPath = "";
    const container = utils.findZipEntry(entries, ["META-INF/container.xml"]);
    if (container) {
      const doc = utils.parseXml(container.bytes, `${name} container.xml`);
      const rootfile = utils.firstDescendantByLocalName(doc.documentElement, "rootfile");
      rootPath = rootfile?.getAttribute("full-path") || "";
    }

    const scoreEntry = utils.findZipEntry(entries, rootPath, entryName => {
      if (/^META-INF\//i.test(entryName)) return false;
      return /\.musicxml$/i.test(entryName) || /\.xml$/i.test(entryName);
    });
    if (!scoreEntry) throw new Error(tr("xml.err_body_missing", [name]));
    const text = utils.decodeXml(scoreEntry.bytes);
    ensureMusicXmlText(text, name);
    return text;
  }

  function parseMusicXml(text, name = "MusicXML") {
    const doc = parseXmlDocument(text, name);
    const root = doc.documentElement;
    const rootName = local(root);
    if (rootName !== "score-partwise" && rootName !== "score-timewise") {
      throw new Error(tr("xml.err_score_type", [name]));
    }

    const partInfo = parsePartList(root);
    const partSources = rootName === "score-timewise" ? collectTimewiseParts(root) : collectPartwiseParts(root);
    if (!partSources.length) throw new Error(tr("xml.err_parts_missing", [name]));

    const usedChannels = new Set();
    const allNotes = [];
    const tempoEvents = [{ tick: 0, bpm: DEFAULT_TEMPO }];
    const tracks = [];

    partSources.forEach((source, index) => {
      const info = normalizePartInfo(partInfo.get(source.id) || {}, source.id, index);
      const channel = pickMidiChannel(info, index, usedChannels);
      const program = pickMidiProgram(info);
      const parsedPart = parsePartMeasures(source.measures, { ...info, channel, program, trackIndex: index + 1 }, tempoEvents);
      const mergedNotes = mergeTiedNotes(parsedPart.notes);
      if (mergedNotes.length) {
        tracks.push({
          id: source.id || `P${index + 1}`,
          name: info.name || `Part ${index + 1}`,
          instrumentName: info.instrumentName || info.name || `Part ${index + 1}`,
          channel,
          program,
          notes: mergedNotes
        });
        allNotes.push(...mergedNotes);
      }
    });

    if (!allNotes.length) throw new Error(tr("xml.err_notes_missing", [name]));
    return {
      ppq: PPQ,
      format: 1,
      tempoEvents: normalizeMusicXmlTempoEvents(tempoEvents),
      tracks,
      noteCount: allNotes.length
    };
  }

  function parseXmlDocument(text, name = "XML") {
    try {
      return utils.parseXml(text, name);
    } catch (error) {
      throw new Error(tr("xml.err_parse", [name, error?.message || tr("xml.parse_error")]));
    }
  }

  function parsePartList(root) {
    const out = new Map();
    const partList = child(root, "part-list");
    if (!partList) return out;
    for (const part of descendants(partList, "score-part")) {
      const id = part.getAttribute("id") || "";
      if (!id) continue;
      const name = text(child(part, "part-name")) || text(child(part, "part-abbreviation")) || id;
      const scoreInstrument = child(part, "score-instrument");
      const instrumentName = text(child(scoreInstrument, "instrument-name")) || name;
      const midiInstrument = child(part, "midi-instrument");
      const midiProgram = parseInt(text(child(midiInstrument, "midi-program")), 10);
      const midiChannel = parseInt(text(child(midiInstrument, "midi-channel")), 10);
      const midiUnpitched = parseInt(text(child(midiInstrument, "midi-unpitched")), 10);
      const percussion = PERCUSSION_RE.test(`${name} ${instrumentName}`) || midiChannel === 10 || Number.isFinite(midiUnpitched);
      out.set(id, {
        id,
        name,
        instrumentName,
        midiProgram: Number.isFinite(midiProgram) ? midiProgram - 1 : null,
        midiChannel: Number.isFinite(midiChannel) ? midiChannel - 1 : null,
        midiUnpitched: Number.isFinite(midiUnpitched) ? midiUnpitched - 1 : null,
        percussion
      });
    }
    return out;
  }

  function collectPartwiseParts(root) {
    return children(root, "part").map((part, index) => ({
      id: part.getAttribute("id") || `P${index + 1}`,
      measures: children(part, "measure")
    })).filter(item => item.measures.length);
  }

  function collectTimewiseParts(root) {
    const map = new Map();
    for (const measure of children(root, "measure")) {
      for (const part of children(measure, "part")) {
        const id = part.getAttribute("id") || `P${map.size + 1}`;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(part);
      }
    }
    return Array.from(map.entries()).map(([id, measures]) => ({ id, measures })).filter(item => item.measures.length);
  }

  function normalizePartInfo(info, id, index) {
    const name = info.name || id || `Part ${index + 1}`;
    const instrumentName = info.instrumentName || name;
    return {
      ...info,
      id,
      name,
      instrumentName,
      percussion: Boolean(info.percussion || PERCUSSION_RE.test(`${name} ${instrumentName}`))
    };
  }

  function pickMidiChannel(info, index, usedChannels) {
    if (info.percussion) return 9;
    const requested = info.midiChannel;
    if (Number.isInteger(requested) && requested >= 0 && requested < 16 && requested !== 9 && !usedChannels.has(requested)) {
      usedChannels.add(requested);
      return requested;
    }
    for (const ch of midiParser.melodicChannels) {
      if (!usedChannels.has(ch)) {
        usedChannels.add(ch);
        return ch;
      }
    }
    return midiParser.defaultMelodicChannel(index);
  }

  function pickMidiProgram(info) {
    const raw = info.midiProgram;
    if (Number.isInteger(raw) && raw >= 0 && raw < 128) return raw;
    if (info.percussion) return 0;
    return guessProgramByName(`${info.instrumentName || ""} ${info.name || ""}`);
  }

  function guessProgramByName(value) {
    const s = String(value || "").toLowerCase();
    if (/piccolo|피콜로/.test(s)) return 72;
    if (/flute|플루트/.test(s)) return 73;
    if (/recorder|리코더/.test(s)) return 74;
    if (/oboe|오보에/.test(s)) return 68;
    if (/clarinet|클라리넷/.test(s)) return 71;
    if (/bassoon|바순/.test(s)) return 70;
    if (/sax|색소폰/.test(s)) return 65;
    if (/trumpet|트럼펫/.test(s)) return 56;
    if (/trombone|트롬본/.test(s)) return 57;
    if (/tuba|튜바/.test(s)) return 58;
    if (/horn|호른/.test(s)) return 60;
    if (/harp|하프/.test(s)) return 46;
    if (/violin|바이올린/.test(s)) return 40;
    if (/viola|비올라/.test(s)) return 41;
    if (/cello|첼로/.test(s)) return 42;
    if (/contrabass|double\s*bass|콘트라베이스|더블베이스/.test(s)) return 43;
    if (/string|strings|현악/.test(s)) return 48;
    if (/electric\s*guitar|일렉.*기타/.test(s)) return 27;
    if (/guitar|기타/.test(s)) return 24;
    if (/bass|베이스/.test(s)) return 32;
    if (/organ|오르간/.test(s)) return 19;
    if (/accordion|아코디언/.test(s)) return 21;
    if (/choir|voice|vocal|합창|보컬|성악/.test(s)) return 52;
    if (/marimba|마림바/.test(s)) return 12;
    if (/xylophone|실로폰/.test(s)) return 13;
    if (/vibraphone|비브라폰/.test(s)) return 11;
    if (/bell|glockenspiel|종|벨/.test(s)) return 9;
    return 0;
  }

  function parsePartMeasures(measures, part, tempoEvents) {
    let divisions = 1;
    let transpose = 0;
    let measureStartTick = 0;
    let currentTick = 0;
    let lastNoteStartTick = 0;
    let currentVelocity = FALLBACK_VELOCITY;
    const notes = [];

    for (const measure of measures || []) {
      currentTick = measureStartTick;
      lastNoteStartTick = currentTick;
      let maxMeasureTick = measureStartTick;

      for (const node of elementChildren(measure)) {
        const name = local(node);
        if (name === "attributes") {
          const nextDivisions = parseFloat(text(child(node, "divisions")));
          if (Number.isFinite(nextDivisions) && nextDivisions > 0) divisions = nextDivisions;
          const chromatic = parseFloat(text(child(child(node, "transpose"), "chromatic")));
          transpose = Number.isFinite(chromatic) ? chromatic : transpose;
        } else if (name === "direction") {
          const directionTick = musicXmlDirectionTick(node, currentTick, divisions);
          const tempo = readTempoFromDirection(node);
          if (tempo) tempoEvents.push({ tick: directionTick, bpm: tempo });
          const velocity = readVelocityFromDirection(node);
          if (velocity) currentVelocity = velocity;
        } else if (name === "sound") {
          const soundTick = musicXmlSoundTick(node, currentTick, divisions);
          const tempo = clampTempo(parseFloat(node.getAttribute("tempo") || ""));
          if (tempo) tempoEvents.push({ tick: soundTick, bpm: tempo });
          const velocity = velocityFromDynamics(node.getAttribute("dynamics"));
          if (velocity) currentVelocity = velocity;
        } else if (name === "backup") {
          currentTick = Math.max(measureStartTick, currentTick - durationToTicks(text(child(node, "duration")), divisions));
        } else if (name === "forward") {
          currentTick += durationToTicks(text(child(node, "duration")), divisions);
          maxMeasureTick = Math.max(maxMeasureTick, currentTick);
        } else if (name === "note") {
          const parsed = readMusicXmlNote(node, part, divisions, transpose, currentTick, lastNoteStartTick, currentVelocity);
          if (parsed.note) notes.push(parsed.note);
          if (!parsed.isChord && !parsed.isGrace) {
            lastNoteStartTick = currentTick;
            currentTick += parsed.durationTicks;
            maxMeasureTick = Math.max(maxMeasureTick, currentTick);
          } else if (parsed.note) {
            maxMeasureTick = Math.max(maxMeasureTick, parsed.note.endTick);
          }
        }
      }
      measureStartTick = Math.max(measureStartTick, currentTick, maxMeasureTick);
    }
    return { notes };
  }

  function readTempoFromDirection(direction) {
    const sound = child(direction, "sound");
    const soundTempo = clampTempo(parseFloat(sound?.getAttribute("tempo") || ""));
    if (soundTempo) return soundTempo;
    for (const metronome of descendants(direction, "metronome")) {
      const perMinuteText = text(child(metronome, "per-minute"));
      const match = /[-+]?\d+(?:\.\d+)?/.exec(perMinuteText);
      const perMinute = match ? Number(match[0]) : NaN;
      if (!Number.isFinite(perMinute) || perMinute <= 0) continue;
      const beatUnit = text(child(metronome, "beat-unit")).trim().toLowerCase();
      const quarterFactor = musicXmlBeatUnitQuarters(beatUnit);
      if (!quarterFactor) continue;
      const dotCount = descendants(metronome, "beat-unit-dot").length;
      let dottedFactor = 1;
      let add = 0.5;
      for (let index = 0; index < dotCount; index++) {
        dottedFactor += add;
        add /= 2;
      }
      const bpm = clampTempo(perMinute * quarterFactor * dottedFactor);
      if (bpm) return bpm;
    }
    return 0;
  }

  function musicXmlBeatUnitQuarters(value) {
    const units = {
      maxima: 32,
      long: 16,
      breve: 8,
      whole: 4,
      half: 2,
      quarter: 1,
      eighth: 0.5,
      "16th": 0.25,
      "32nd": 0.125,
      "64th": 0.0625,
      "128th": 0.03125,
      "256th": 0.015625,
      "512th": 0.0078125,
      "1024th": 0.00390625,
    };
    return units[String(value || "").toLowerCase()] || 0;
  }

  function musicXmlDirectionTick(direction, currentTick, divisions) {
    const sound = child(direction, "sound");
    const soundOffset = text(child(sound, "offset"));
    const directionOffset = text(child(direction, "offset"));
    const raw = soundOffset !== "" ? soundOffset : directionOffset;
    const offset = Number(raw);
    if (!Number.isFinite(offset) || offset === 0) return currentTick;
    return Math.max(0, currentTick + Math.round(offset * PPQ / Math.max(1, Number(divisions) || 1)));
  }

  function musicXmlSoundTick(sound, currentTick, divisions) {
    const offset = Number(text(child(sound, "offset")));
    if (!Number.isFinite(offset) || offset === 0) return currentTick;
    return Math.max(0, currentTick + Math.round(offset * PPQ / Math.max(1, Number(divisions) || 1)));
  }

  function readVelocityFromDirection(direction) {
    const sound = child(direction, "sound");
    const fromSound = velocityFromDynamics(sound?.getAttribute("dynamics"));
    if (fromSound) return fromSound;
    const dyn = firstDescendant(direction, "dynamics");
    if (!dyn) return 0;
    const mark = elementChildren(dyn)[0]?.localName || text(dyn).trim();
    return dynamicMarkToVelocity(mark);
  }

  function readMusicXmlNote(noteEl, part, divisions, transpose, currentTick, lastNoteStartTick, currentVelocity) {
    const isChord = Boolean(child(noteEl, "chord"));
    const isGrace = Boolean(child(noteEl, "grace"));
    const durationTicks = isGrace ? 0 : Math.max(0, durationToTicks(text(child(noteEl, "duration")), divisions));
    const startTick = isChord ? lastNoteStartTick : currentTick;
    const endTick = startTick + Math.max(MIN_NOTE_TICKS, durationTicks);
    const isRest = Boolean(child(noteEl, "rest"));
    if (isRest || isGrace || durationTicks <= 0) return { note: null, isChord, isGrace, durationTicks };

    const pitch = child(noteEl, "pitch");
    const unpitched = child(noteEl, "unpitched");
    const instrumentId = child(noteEl, "instrument")?.getAttribute("id") || "";
    let midi = pitch ? pitchToMidi(pitch) : unpitchedToMidi(unpitched, part);
    if (!Number.isFinite(midi)) return { note: null, isChord, isGrace, durationTicks };
    if (pitch) midi += Math.round(Number(transpose) || 0);
    midi = Math.max(0, Math.min(127, Math.round(midi)));

    const velocity = velocityFromDynamics(noteEl.getAttribute("dynamics")) || currentVelocity || FALLBACK_VELOCITY;
    const tieTypes = descendants(noteEl, "tie").concat(descendants(noteEl, "tied")).map(el => String(el.getAttribute("type") || "").toLowerCase());
    const note = {
      startTick,
      endTick,
      midi,
      velocity: Math.max(1, Math.min(127, Math.round(velocity))),
      channel: part.channel,
      program: part.program,
      trackIndex: part.trackIndex,
      trackName: part.name || "",
      instrumentName: part.instrumentName || part.name || "",
      voice: text(child(noteEl, "voice")) || "1",
      staff: text(child(noteEl, "staff")) || "1",
      instrumentId,
      tieStart: tieTypes.includes("start") || tieTypes.includes("continue"),
      tieStop: tieTypes.includes("stop") || tieTypes.includes("continue")
    };
    return { note, isChord, isGrace, durationTicks };
  }


  function unpitchedToMidi(unpitched, part) {
    if (Number.isFinite(part.midiUnpitched)) return part.midiUnpitched;
    if (!unpitched) return part.percussion ? 36 : NaN;
    const step = text(child(unpitched, "display-step")).trim().toUpperCase();
    const octave = parseInt(text(child(unpitched, "display-octave")), 10);
    if (!Object.prototype.hasOwnProperty.call(notation.STEP_TO_SEMITONE, step) || !Number.isFinite(octave)) {
      return part.percussion ? 36 : NaN;
    }
    return notation.pitchToMidi(step, octave, 0, part.percussion ? 36 : 60);
  }

  function durationToTicks(value, divisions) {
    const duration = parseFloat(value);
    const divs = Math.max(1, Number(divisions) || 1);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.max(MIN_NOTE_TICKS, Math.round(duration * PPQ / divs));
  }

  function mergeTiedNotes(notes) {
    const sorted = [...(notes || [])].sort((a, b) => a.startTick - b.startTick || a.trackIndex - b.trackIndex || a.midi - b.midi);
    const out = [];
    const open = new Map();
    for (const note of sorted) {
      const key = `${note.trackIndex}:${note.voice}:${note.staff}:${note.midi}:${note.channel}:${note.program}`;
      const previous = open.get(key);
      if (note.tieStop && previous && note.startTick <= previous.endTick + PPQ) {
        previous.endTick = Math.max(previous.endTick, note.endTick);
        previous.velocity = Math.max(previous.velocity, note.velocity);
        if (!note.tieStart) open.delete(key);
        continue;
      }
      out.push(note);
      if (note.tieStart) open.set(key, note);
    }
    return out.filter(note => note.endTick > note.startTick);
  }

  function normalizeMusicXmlTempoEvents(events) {
    return midiParser.normalizeTempoEvents((events || []).map(event => ({
      ...event,
      tick: Math.max(0, Math.round(Number(event.tick) || 0)),
      bpm: clampTempo(event.bpm) || DEFAULT_TEMPO,
    })));
  }

  function clampTempo(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(32, Math.min(255, n));
  }

  function velocityFromDynamics(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    // MusicXML dynamics is a percentage of the default forte MIDI velocity (90),
    // not a direct percentage of 127.
    return Math.max(1, Math.min(127, Math.round(n * FORTE_VELOCITY / 100)));
  }

  function dynamicMarkToVelocity(mark) {
    const key = String(mark || "").trim().toLowerCase();
    return ({ ppp: 28, pp: 38, p: 50, mp: 64, mf: 76, f: 90, ff: 105, fff: 120, sfz: 112, sf: 104, fp: 82 })[key] || 0;
  }

  function buildStandardMidiFile(score) {
    const tracks = [];
    tracks.push(buildTempoTrack(score.tempoEvents));
    for (const part of score.tracks) {
      tracks.push(buildPartTrack(part));
    }
    const bytes = [];
    pushAscii(bytes, "MThd");
    pushU32(bytes, 6);
    pushU16(bytes, 1);
    pushU16(bytes, tracks.length);
    pushU16(bytes, PPQ);
    for (const track of tracks) {
      pushAscii(bytes, "MTrk");
      pushU32(bytes, track.length);
      bytes.push(...track);
    }
    return new Uint8Array(bytes);
  }

  function buildTempoTrack(tempoEvents) {
    const events = normalizeMusicXmlTempoEvents(tempoEvents).map(ev => {
      const mpqn = Math.max(1, Math.round(60000000 / ev.bpm));
      return {
        tick: ev.tick,
        order: 0,
        data: [0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff]
      };
    });
    events.unshift({ tick: 0, order: -2, data: metaTextEvent(0x03, "Tempo") });
    return encodeTrackEvents(events);
  }

  function buildPartTrack(part) {
    const ch = Math.max(0, Math.min(15, Number(part.channel) || 0));
    const program = Math.max(0, Math.min(127, Number(part.program) || 0));
    const events = [
      { tick: 0, order: -3, data: metaTextEvent(0x03, part.name || "MusicXML Part") },
      { tick: 0, order: -2, data: metaTextEvent(0x04, part.instrumentName || part.name || "MusicXML Instrument") },
      { tick: 0, order: -1, data: [0xc0 | ch, program] }
    ];
    for (const note of part.notes || []) {
      const start = Math.max(0, Math.round(Number(note.startTick) || 0));
      const end = Math.max(start + MIN_NOTE_TICKS, Math.round(Number(note.endTick) || 0));
      const midi = Math.max(0, Math.min(127, Math.round(Number(note.midi) || 0)));
      const velocity = Math.max(1, Math.min(127, Math.round(Number(note.velocity) || FALLBACK_VELOCITY)));
      events.push({ tick: start, order: 1, data: [0x90 | ch, midi, velocity] });
      events.push({ tick: end, order: 0, data: [0x80 | ch, midi, 0] });
    }
    return encodeTrackEvents(events);
  }

  function encodeTrackEvents(events) {
    const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
    const out = [];
    let tick = 0;
    for (const event of sorted) {
      const nextTick = Math.max(0, Math.round(Number(event.tick) || 0));
      pushVarLen(out, Math.max(0, nextTick - tick));
      out.push(...event.data);
      tick = nextTick;
    }
    pushVarLen(out, 0);
    out.push(0xff, 0x2f, 0x00);
    return out;
  }

  function metaTextEvent(type, value) {
    const encoded = new TextEncoder().encode(String(value || ""));
    const out = [0xff, type & 0x7f];
    pushVarLen(out, encoded.length);
    out.push(...encoded);
    return out;
  }

  function pushAscii(out, value) {
    for (let i = 0; i < value.length; i++) out.push(value.charCodeAt(i) & 0xff);
  }

  function pushU16(out, value) {
    out.push((value >> 8) & 0xff, value & 0xff);
  }

  function pushU32(out, value) {
    out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  function pushVarLen(out, value) {
    let buffer = Math.max(0, Math.round(Number(value) || 0)) & 0x0fffffff;
    let bytes = [buffer & 0x7f];
    buffer >>= 7;
    while (buffer > 0) {
      bytes.unshift((buffer & 0x7f) | 0x80);
      buffer >>= 7;
    }
    out.push(...bytes);
  }

  function local(node) {
    return utils.localName(node);
  }

  function elementChildren(node) {
    return Array.from(node?.children || []);
  }

  function children(node, name) {
    return utils.childrenByLocalName(node, name);
  }

  function child(node, name) {
    return utils.childByLocalName(node, name);
  }

  function descendants(node, name) {
    return utils.descendantsByLocalName(node, name);
  }

  function firstDescendant(node, name) {
    return utils.firstDescendantByLocalName(node, name);
  }

  function text(node) {
    return String(node?.textContent || "").trim();
  }

  window.MabiMusicXml = { musicXmlToMidiBytes, extractMusicXmlText };
})();
