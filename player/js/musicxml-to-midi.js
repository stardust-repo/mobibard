(() => {
  "use strict";

  const tr = (key, values = []) => window.MobibardI18n?.t?.(key, values) || String(key);

  const PPQ = 480;
  const DEFAULT_TEMPO = 120;
  const DEFAULT_VELOCITY = 92;
  const MIN_NOTE_TICKS = 1;
  const NOTE_STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NORMAL_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  const PERCUSSION_RE = /(drum|percussion|perc|snare|cymbal|kick|tom|hi[- ]?hat|timpani|taiko|wood\s*block|claves|cowbell|triangle|gong|tambourine|maracas|bongo|conga|타악|드럼|스네어|심벌|팀파니|북|징|탬버린)/i;

  async function musicXmlToMidiBytes(data, name = "MusicXML") {
    const inputBytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    const xmlText = await extractMusicXmlText(inputBytes, name);
    const parsed = parseMusicXml(xmlText, name);
    return buildStandardMidiFile(parsed);
  }

  async function extractMusicXmlText(bytes, name = "MusicXML") {
    if (!bytes?.length) throw new Error(tr("xml.err_empty", [name]));
    if (looksLikeZip(bytes)) return readCompressedMusicXml(bytes, name);
    const text = decodeXmlBytes(bytes);
    ensureMusicXmlText(text, name);
    return text;
  }

  function looksLikeZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  function ensureMusicXmlText(text, name = "MusicXML") {
    if (!/<\s*(?:[\w.-]+:)?score-(?:partwise|timewise)\b/i.test(String(text || ""))) {
      throw new Error(tr("xml.err_score_missing", [name]));
    }
  }

  async function readCompressedMusicXml(bytes, name = "MusicXML") {
    const entries = parseZipEntries(bytes);
    if (!entries.length) throw new Error(tr("xml.err_zip_empty", [name]));
    const entryMap = new Map(entries.map(entry => [entry.name, entry]));
    let rootPath = "";
    const container = entryMap.get("META-INF/container.xml") || entryMap.get("meta-inf/container.xml");
    if (container) {
      const containerText = decodeXmlBytes(await inflateZipEntry(container));
      const doc = parseXmlDocument(containerText, `${name} container.xml`);
      const rootfile = firstDescendant(doc.documentElement, "rootfile");
      rootPath = rootfile?.getAttribute("full-path") || "";
    }

    let scoreEntry = rootPath ? entryMap.get(rootPath) : null;
    if (!scoreEntry) {
      scoreEntry = entries.find(entry => /\.musicxml$/i.test(entry.name))
        || entries.find(entry => /\.xml$/i.test(entry.name) && !/^META-INF\//i.test(entry.name) && !/^meta-inf\//i.test(entry.name));
    }
    if (!scoreEntry) throw new Error(tr("xml.err_body_missing", [name]));
    const text = decodeXmlBytes(await inflateZipEntry(scoreEntry));
    ensureMusicXmlText(text, name);
    return text;
  }

  function parseZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const getU16 = (offset) => view.getUint16(offset, true);
    const getU32 = (offset) => view.getUint32(offset, true);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 0xffff - 22);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (getU32(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(tr("xml.err_central_dir"));
    const entryCount = getU16(eocd + 10);
    let pos = getU32(eocd + 16);
    const entries = [];
    const decoder = new TextDecoder("utf-8");
    for (let i = 0; i < entryCount && pos + 46 <= bytes.length; i++) {
      if (getU32(pos) !== 0x02014b50) break;
      const method = getU16(pos + 10);
      const compressedSize = getU32(pos + 20);
      const uncompressedSize = getU32(pos + 24);
      const nameLength = getU16(pos + 28);
      const extraLength = getU16(pos + 30);
      const commentLength = getU16(pos + 32);
      const localOffset = getU32(pos + 42);
      const nameBytes = bytes.slice(pos + 46, pos + 46 + nameLength);
      const entryName = decoder.decode(nameBytes).replace(/^\/+/, "");
      const localNameLength = getU16(localOffset + 26);
      const localExtraLength = getU16(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name: entryName,
        method,
        compressedSize,
        uncompressedSize,
        data: bytes.slice(dataOffset, dataOffset + compressedSize)
      });
      pos += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function inflateZipEntry(entry) {
    if (entry.method === 0) return entry.data;
    if (entry.method !== 8) throw new Error(tr("xml.err_compression", [entry.method]));
    if (typeof DecompressionStream !== "function") {
      throw new Error(tr("xml.err_decompress_unsupported"));
    }
    try {
      const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (err) {
      try {
        const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (_) {
        throw err;
      }
    }
  }

  function decodeXmlBytes(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder("utf-8").decode(bytes.slice(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes.slice(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes.slice(2));
    }
    const head = Array.from(bytes.slice(0, 260), b => String.fromCharCode(b)).join("");
    const enc = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1];
    if (enc) {
      try { return new TextDecoder(enc).decode(bytes); } catch (_) {}
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
      tempoEvents: normalizeTempoEvents(tempoEvents),
      tracks,
      noteCount: allNotes.length
    };
  }

  function parseXmlDocument(text, name = "XML") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(text || ""), "application/xml");
    const error = Array.from(doc.getElementsByTagName("parsererror"))[0];
    if (error) throw new Error(tr("xml.err_parse", [name, error.textContent?.trim()?.slice(0, 180) || tr("xml.parse_error")]));
    return doc;
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
    for (const ch of NORMAL_CHANNELS) {
      if (!usedChannels.has(ch)) {
        usedChannels.add(ch);
        return ch;
      }
    }
    return NORMAL_CHANNELS[index % NORMAL_CHANNELS.length];
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
    let currentVelocity = DEFAULT_VELOCITY;
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
          const tempo = readTempoFromDirection(node);
          if (tempo) tempoEvents.push({ tick: currentTick, bpm: tempo });
          const velocity = readVelocityFromDirection(node);
          if (velocity) currentVelocity = velocity;
        } else if (name === "sound") {
          const tempo = clampTempo(parseFloat(node.getAttribute("tempo") || ""));
          if (tempo) tempoEvents.push({ tick: currentTick, bpm: tempo });
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
      const bpm = clampTempo(parseFloat(text(child(metronome, "per-minute"))));
      if (bpm) return bpm;
    }
    return 0;
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

    const velocity = velocityFromDynamics(noteEl.getAttribute("dynamics")) || currentVelocity || DEFAULT_VELOCITY;
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

  function pitchToMidi(pitch) {
    const step = text(child(pitch, "step")).trim().toUpperCase();
    const octave = parseInt(text(child(pitch, "octave")), 10);
    const alter = parseFloat(text(child(pitch, "alter")) || "0") || 0;
    if (!(step in NOTE_STEP) || !Number.isFinite(octave)) return NaN;
    return (octave + 1) * 12 + NOTE_STEP[step] + alter;
  }

  function unpitchedToMidi(unpitched, part) {
    if (Number.isFinite(part.midiUnpitched)) return part.midiUnpitched;
    if (!unpitched) return part.percussion ? 36 : NaN;
    const step = text(child(unpitched, "display-step")).trim().toUpperCase();
    const octave = parseInt(text(child(unpitched, "display-octave")), 10);
    if (part.percussion && !(step in NOTE_STEP)) return 36;
    if (!(step in NOTE_STEP) || !Number.isFinite(octave)) return part.percussion ? 36 : NaN;
    return (octave + 1) * 12 + NOTE_STEP[step];
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

  function normalizeTempoEvents(events) {
    const map = new Map();
    for (const ev of events || []) {
      const tick = Math.max(0, Math.round(Number(ev.tick) || 0));
      const bpm = clampTempo(Number(ev.bpm));
      if (bpm) map.set(tick, bpm);
    }
    if (!map.has(0)) map.set(0, DEFAULT_TEMPO);
    return Array.from(map.entries())
      .map(([tick, bpm]) => ({ tick, bpm }))
      .sort((a, b) => a.tick - b.tick)
      .filter((ev, index, arr) => index === 0 || ev.bpm !== arr[index - 1].bpm || ev.tick === 0);
  }

  function clampTempo(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(32, Math.min(255, n));
  }

  function velocityFromDynamics(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1, Math.min(127, Math.round(n * 127 / 100)));
  }

  function dynamicMarkToVelocity(mark) {
    const key = String(mark || "").trim().toLowerCase();
    return ({ ppp: 34, pp: 44, p: 54, mp: 68, mf: 84, f: 100, ff: 112, fff: 124, sfz: 118, sf: 110, fp: 92 })[key] || 0;
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
    const events = normalizeTempoEvents(tempoEvents).map(ev => {
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
      const velocity = Math.max(1, Math.min(127, Math.round(Number(note.velocity) || DEFAULT_VELOCITY)));
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
    return node?.localName || node?.nodeName || "";
  }

  function elementChildren(node) {
    return Array.from(node?.children || []);
  }

  function children(node, name) {
    return elementChildren(node).filter(el => local(el) === name);
  }

  function child(node, name) {
    return children(node, name)[0] || null;
  }

  function descendants(node, name) {
    const out = [];
    const walk = (el) => {
      for (const c of elementChildren(el)) {
        if (local(c) === name) out.push(c);
        walk(c);
      }
    };
    if (node) walk(node);
    return out;
  }

  function firstDescendant(node, name) {
    return descendants(node, name)[0] || null;
  }

  function text(node) {
    return String(node?.textContent || "").trim();
  }

  window.MabiMusicXml = { musicXmlToMidiBytes, extractMusicXmlText };
})();
