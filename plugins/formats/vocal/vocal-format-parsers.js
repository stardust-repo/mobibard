(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before vocal-format-parsers.js");

  const PPQ = 480;
  const SV_QUARTER = 705600000;

  function fileTitle(fileName) {
    return String(fileName || "Vocal project").replace(/\.[^.]+$/, "");
  }

  function pick(object, keys, fallback = undefined) {
    if (!object || typeof object !== "object") return fallback;
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null) return object[key];
    }
    return fallback;
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeBpm(value, fallback = 120) {
    let bpm = Number(value);
    if (!Number.isFinite(bpm) || bpm <= 0) return fallback;
    if (bpm > 1000) bpm /= 100;
    return Math.max(1, Math.min(999, bpm));
  }

  function uniqueTempoEvents(events) {
    const byTick = new Map();
    for (const item of events || []) {
      const tick = Math.max(0, Math.round(Number(item.tick) || 0));
      byTick.set(tick, { tick, bpm: normalizeBpm(item.bpm) });
    }
    if (!byTick.has(0)) byTick.set(0, { tick: 0, bpm: 120 });
    return Array.from(byTick.values()).sort((a, b) => a.tick - b.tick);
  }

  function ensureTracks(tracks, fileName) {
    const normalized = (tracks || []).map((track, index) => ({
      name: String(track.name || `Vocal ${index + 1}`),
      program: 52,
      notes: (track.notes || []).filter(note => Number(note.durationTick) > 0).map(note => ({
        startTick: Math.max(0, Math.round(Number(note.startTick) || 0)),
        durationTick: Math.max(1, Math.round(Number(note.durationTick) || 1)),
        pitch: core.clampInt(note.pitch, 0, 127, 60),
        velocity: core.clampInt(note.velocity, 1, 127, 96),
        lyric: String(note.lyric || ""),
      })),
    })).filter(track => track.notes.length);
    if (!normalized.length) throw new Error(`${fileName}에서 보컬 음표를 찾지 못했습니다.`);
    return normalized;
  }

  function buildResult(fileName, tracks, tempoEvents = [], timeSignatures = [], metadata = {}) {
    const normalizedTracks = ensureTracks(tracks, fileName);
    return {
      midiBytes: core.buildMidi({
        title: fileTitle(fileName),
        ppq: PPQ,
        tempoEvents: uniqueTempoEvents(tempoEvents),
        timeSignatures: timeSignatures.length ? timeSignatures : [{ tick: 0, numerator: 4, denominator: 4 }],
        tracks: normalizedTracks,
      }),
      metadata: {
        trackCount: normalizedTracks.length,
        noteCount: normalizedTracks.reduce((sum, track) => sum + track.notes.length, 0),
        ...metadata,
      },
    };
  }

  function parseVsq(bytes, fileName) {
    const parser = window.MabiMidiParser;
    if (!parser?.normalizeContainer) throw new Error("공용 MIDI 파서를 불러오지 못했습니다.");
    const normalized = parser.normalizeContainer(bytes);
    const view = core.asUint8Array(normalized.bytes);
    if (!parser.asciiAt?.(view, 0, "MThd")) {
      throw new Error(`${fileName}은 MIDI 기반 VSQ 파일이 아닙니다.`);
    }
    parser.parse(view, { type2Policy: "first-track" });
    const container = { ...normalized };
    delete container.bytes;
    return { midiBytes: view, metadata: { midiBased: true, container } };
  }

  function parseVsqx(bytes, fileName) {
    const documentNode = core.xmlDocument(bytes, fileName);
    const rootName = String(documentNode.documentElement?.localName || "").toLowerCase();
    if (!rootName.includes("vsq")) throw new Error(`${fileName}은 VSQX 문서가 아닙니다.`);
    const resolution = Math.max(1, Number(core.childText(core.firstLocal(documentNode, "masterTrack"), ["resolution"], PPQ)) || PPQ);
    const scale = PPQ / resolution;
    const tempoEvents = [];
    for (const tempo of core.localElements(documentNode, "tempo")) {
      const pos = Number(core.childText(tempo, ["posTick", "pos"], 0)) || 0;
      const bpm = Number(core.childText(tempo, ["bpm", "value"], 12000)) || 12000;
      tempoEvents.push({ tick: Math.round(pos * scale), bpm: normalizeBpm(bpm) });
    }
    const timeSignatures = [];
    for (const timeSig of core.localElements(documentNode, "timeSig")) {
      const numerator = Number(core.childText(timeSig, ["nume", "numerator"], 4)) || 4;
      const denominator = Number(core.childText(timeSig, ["denomi", "denominator"], 4)) || 4;
      if (!timeSignatures.length) timeSignatures.push({ tick: 0, numerator, denominator });
    }

    const tracks = [];
    const trackNodes = core.localElements(documentNode, "vsTrack");
    for (let trackIndex = 0; trackIndex < trackNodes.length; trackIndex++) {
      const trackNode = trackNodes[trackIndex];
      const name = core.childText(trackNode, ["trackName", "name"], `Vocal ${trackIndex + 1}`);
      const notes = [];
      const parts = Array.from(trackNode.children || []).filter(node => String(node.localName || node.nodeName).toLowerCase() === "musicalpart");
      const actualParts = parts.length ? parts : core.localElements(trackNode, "musicalPart");
      for (const part of actualParts) {
        const partPosition = Number(core.childText(part, ["posTick", "pos"], 0)) || 0;
        for (const noteNode of core.localElements(part, "note")) {
          const position = Number(core.childText(noteNode, ["posTick", "pos"], 0)) || 0;
          const duration = Number(core.childText(noteNode, ["durTick", "duration", "dur"], 0)) || 0;
          const pitch = Number(core.childText(noteNode, ["noteNum", "noteNumber", "pitch"], 60));
          const velocity = Number(core.childText(noteNode, ["velocity", "vel"], 96));
          const lyric = core.childText(noteNode, ["lyric"], "");
          notes.push({
            startTick: Math.round((partPosition + position) * scale),
            durationTick: Math.max(1, Math.round(duration * scale)),
            pitch,
            velocity,
            lyric,
          });
        }
      }
      if (notes.length) tracks.push({ name, notes });
    }
    return buildResult(fileName, tracks, tempoEvents, timeSignatures, { sourceResolution: resolution });
  }

  function decodeUst(bytes) {
    return core.textDecode(bytes, ["utf-8", "shift_jis", "windows-31j", "windows-1252"]);
  }

  function parseUst(bytes, fileName) {
    const text = decodeUst(bytes);
    if (!/^\s*\[#SETTING\]/im.test(text)) throw new Error(`${fileName}은 UTAU UST 문서가 아닙니다.`);
    const sections = [];
    let current = null;
    for (const raw of text.split(/\r?\n/)) {
      const section = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
      if (section) {
        current = { name: section[1], values: {} };
        sections.push(current);
        continue;
      }
      if (!current) continue;
      const equals = raw.indexOf("=");
      if (equals >= 0) current.values[raw.slice(0, equals).trim()] = raw.slice(equals + 1).trim();
    }
    const settings = sections.find(section => section.name.toUpperCase() === "#SETTING")?.values || {};
    const tempoEvents = [{ tick: 0, bpm: normalizeBpm(settings.Tempo || 120) }];
    const notes = [];
    let cursor = 0;
    for (const section of sections) {
      if (!/^#\d+$/.test(section.name)) continue;
      const values = section.values;
      const length = Math.max(1, Number(values.Length) || 0);
      const lyric = String(values.Lyric || "");
      const pitch = Number(values.NoteNum);
      if (values.Tempo) tempoEvents.push({ tick: cursor, bpm: normalizeBpm(values.Tempo) });
      if (Number.isFinite(pitch) && !/^(?:r|休符)$/i.test(lyric.trim())) {
        notes.push({ startTick: cursor, durationTick: length, pitch, velocity: Number(values.Intensity) || 96, lyric });
      }
      cursor += length;
    }
    return buildResult(fileName, [{ name: settings.ProjectName || fileTitle(fileName), notes }], tempoEvents, [], { encoding: "UST" });
  }

  function parseUstx(bytes, fileName) {
    const data = core.parseYaml(core.textDecode(bytes));
    if (!data || typeof data !== "object" || (!Array.isArray(data.voice_parts) && !Array.isArray(data.voiceParts))) {
      throw new Error(`${fileName}은 OpenUtau USTX 문서가 아닙니다.`);
    }
    const resolution = Math.max(1, Number(data.resolution) || PPQ);
    const scale = PPQ / resolution;
    const trackNames = array(data.tracks).map((track, index) => String(track?.track_name || track?.trackName || track?.name || `Vocal ${index + 1}`));
    const trackMap = new Map();
    for (const part of array(data.voice_parts || data.voiceParts)) {
      const trackNo = Number(part.track_no ?? part.trackNo ?? 0) || 0;
      const offset = Number(part.position) || 0;
      if (!trackMap.has(trackNo)) trackMap.set(trackNo, { name: trackNames[trackNo] || part.name || `Vocal ${trackNo + 1}`, notes: [] });
      for (const note of array(part.notes)) {
        trackMap.get(trackNo).notes.push({
          startTick: Math.round((offset + (Number(note.position) || 0)) * scale),
          durationTick: Math.max(1, Math.round((Number(note.duration) || 0) * scale)),
          pitch: Number(note.tone ?? note.pitch ?? note.note_num ?? 60),
          velocity: 96,
          lyric: String(note.lyric || ""),
        });
      }
    }
    const tempoEvents = array(data.tempos).map(item => ({
      tick: Math.round((Number(item.position) || 0) * scale),
      bpm: normalizeBpm(item.bpm || item.tempo),
    }));
    if (!tempoEvents.length) tempoEvents.push({ tick: 0, bpm: normalizeBpm(data.bpm || 120) });
    const timeSignatures = array(data.time_signatures || data.timeSignatures).slice(0, 1).map(item => ({
      tick: 0,
      numerator: Number(item.beat_per_bar ?? item.beatPerBar ?? item.numerator) || 4,
      denominator: Number(item.beat_unit ?? item.beatUnit ?? item.denominator) || 4,
    }));
    return buildResult(fileName, Array.from(trackMap.values()), tempoEvents, timeSignatures, { sourceResolution: resolution });
  }

  function jsonObject(bytes, fileName) {
    try {
      return JSON.parse(core.textDecode(bytes, ["utf-8"]));
    } catch (error) {
      throw new Error(`${fileName} JSON을 해석하지 못했습니다. (${error?.message || error})`);
    }
  }

  function synthVGroups(data) {
    const groups = new Map();
    const library = new Map();
    for (const group of array(data.library || data.groups || data.noteGroups)) {
      const id = String(group.uuid || group.id || group.groupId || "");
      if (id) library.set(id, group);
    }
    for (let trackIndex = 0; trackIndex < array(data.tracks).length; trackIndex++) {
      const track = data.tracks[trackIndex] || {};
      const name = String(track.name || track.displayName || `Vocal ${trackIndex + 1}`);
      const items = [];
      if (track.mainGroup) items.push({ group: track.mainGroup, offset: 0 });
      if (track.main_group) items.push({ group: track.main_group, offset: 0 });
      for (const ref of array(track.groups || track.groupRefs || track.group_refs)) {
        const group = ref.notes ? ref : library.get(String(ref.groupID || ref.groupId || ref.group_id || ref.uuid || ref.id || ""));
        if (group) items.push({ group, offset: Number(ref.blickOffset ?? ref.offset ?? ref.position ?? 0) || 0 });
      }
      if (track.notes) items.push({ group: track, offset: 0 });
      const notes = [];
      for (const item of items) {
        for (const note of array(item.group.notes || item.group.noteList || item.group.note_list)) {
          const onset = Number(pick(note, ["onset", "position", "pos", "blickOnset", "blick_onset"], 0)) || 0;
          const duration = Number(pick(note, ["duration", "dur", "length", "blickDuration", "blick_duration"], 0)) || 0;
          const pitch = Number(pick(note, ["pitch", "tone", "noteNum", "note_num", "number"], 60));
          notes.push({
            startTick: Math.round((item.offset + onset) * PPQ / SV_QUARTER),
            durationTick: Math.max(1, Math.round(duration * PPQ / SV_QUARTER)),
            pitch,
            velocity: 96,
            lyric: String(pick(note, ["lyrics", "lyric"], "")),
          });
        }
      }
      if (notes.length) groups.set(trackIndex, { name, notes });
    }
    return Array.from(groups.values());
  }

  function synthVTempo(data) {
    const candidates = [
      data?.time?.tempo,
      data?.time?.tempos,
      data?.tempos,
      data?.tempo,
    ];
    const list = candidates.find(Array.isArray) || [];
    return list.map(item => ({
      tick: Math.round((Number(pick(item, ["position", "pos", "blick", "onset"], 0)) || 0) * PPQ / SV_QUARTER),
      bpm: normalizeBpm(pick(item, ["bpm", "tempo", "value"], 120)),
    }));
  }

  function parseSvp(bytes, fileName) {
    const data = jsonObject(bytes, fileName);
    const tracks = synthVGroups(data);
    if (!tracks.length) throw new Error(`${fileName}에서 Synthesizer V 음표를 찾지 못했습니다.`);
    return buildResult(fileName, tracks, synthVTempo(data), [], { timeUnit: "blick", quarter: SV_QUARTER });
  }

  function parseS5p(bytes, fileName) {
    return parseSvp(bytes, fileName);
  }

  function findNumberByKeys(node, keys, fallback = undefined, visited = new Set()) {
    if (!node || typeof node !== "object" || visited.has(node)) return fallback;
    visited.add(node);
    for (const key of keys) {
      const value = node[key];
      if (Number.isFinite(Number(value))) return Number(value);
    }
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const value of values) {
      const found = findNumberByKeys(value, keys, undefined, visited);
      if (found !== undefined) return found;
    }
    return fallback;
  }

  function collectNoteObjects(node, offset = 0, result = []) {
    if (!node || typeof node !== "object") return result;
    if (Array.isArray(node)) {
      for (const child of node) collectNoteObjects(child, offset, result);
      return result;
    }
    const nextOffset = offset + (Number(pick(node, ["pos", "position", "startPos", "start"], 0)) || 0);
    for (const [key, value] of Object.entries(node)) {
      if (/notes?/i.test(key) && Array.isArray(value)) {
        for (const note of value) {
          if (!note || typeof note !== "object") continue;
          const pitch = Number(pick(note, ["number", "noteNum", "noteNumber", "pitch", "tone"], NaN));
          const duration = Number(pick(note, ["duration", "dur", "length"], NaN));
          if (Number.isFinite(pitch) && Number.isFinite(duration)) {
            result.push({
              start: nextOffset + (Number(pick(note, ["pos", "position", "start", "tick"], 0)) || 0),
              duration,
              pitch,
              velocity: Number(pick(note, ["velocity", "vel"], 96)) || 96,
              lyric: String(pick(note, ["lyric", "lyrics"], "")),
            });
          }
        }
      } else if (value && typeof value === "object") {
        collectNoteObjects(value, nextOffset, result);
      }
    }
    return result;
  }

  function collectTempoObjects(node, result = [], insideTempo = false, visited = new Set()) {
    if (!node || typeof node !== "object" || visited.has(node)) return result;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        if (insideTempo && child && typeof child === "object") {
          const bpm = Number(pick(child, ["bpm", "value", "tempo"], NaN));
          if (Number.isFinite(bpm)) {
            result.push({
              tick: Number(pick(child, ["pos", "position", "tick", "clock"], 0)) || 0,
              bpm: normalizeBpm(bpm),
            });
          }
        }
        collectTempoObjects(child, result, insideTempo, visited);
      }
      return result;
    }
    for (const [key, value] of Object.entries(node)) {
      const nextInsideTempo = insideTempo || /tempo/i.test(key);
      if (nextInsideTempo && value && typeof value === "object") {
        if (!Array.isArray(value)) {
          const bpm = Number(pick(value, ["bpm", "value", "tempo"], NaN));
          if (Number.isFinite(bpm)) {
            result.push({
              tick: Number(pick(value, ["pos", "position", "tick", "clock"], 0)) || 0,
              bpm: normalizeBpm(bpm),
            });
          }
        }
        collectTempoObjects(value, result, nextInsideTempo, visited);
      } else if (value && typeof value === "object") {
        collectTempoObjects(value, result, false, visited);
      }
    }
    return result;
  }

  function parseVpr(bytes, fileName) {
    const entries = core.unzip(bytes);
    const jsonEntry = Array.from(entries.entries()).find(([name, value]) => /(?:^|\/)sequence\.json$/i.test(name) && value.length)
      || Array.from(entries.entries()).find(([name]) => /\.json$/i.test(name));
    if (!jsonEntry) throw new Error(`${fileName}에서 VOCALOID 프로젝트 JSON을 찾지 못했습니다.`);
    const data = jsonObject(jsonEntry[1], fileName);
    const resolution = Math.max(1, Number(findNumberByKeys(data, ["resolution", "ppq", "ticksPerQuarter"], PPQ)) || PPQ);
    const scale = PPQ / resolution;
    const tracks = [];
    const topTracks = array(data.tracks || data.vsTracks || data.voxTracks);
    if (topTracks.length) {
      topTracks.forEach((track, index) => {
        const rawNotes = collectNoteObjects(track);
        if (rawNotes.length) tracks.push({
          name: String(track.name || track.trackName || `Vocal ${index + 1}`),
          notes: rawNotes.map(note => ({
            startTick: Math.round(note.start * scale),
            durationTick: Math.max(1, Math.round(note.duration * scale)),
            pitch: note.pitch,
            velocity: note.velocity,
            lyric: note.lyric,
          })),
        });
      });
    }
    if (!tracks.length) {
      const rawNotes = collectNoteObjects(data);
      if (rawNotes.length) tracks.push({ name: fileTitle(fileName), notes: rawNotes.map(note => ({
        startTick: Math.round(note.start * scale), durationTick: Math.max(1, Math.round(note.duration * scale)), pitch: note.pitch, velocity: note.velocity, lyric: note.lyric,
      })) });
    }
    const tempoEvents = collectTempoObjects(data).map(item => ({ tick: Math.round(item.tick * scale), bpm: item.bpm }));
    return buildResult(fileName, tracks, tempoEvents, [], { sourceResolution: resolution, jsonPath: jsonEntry[0] });
  }

  function closestLocalName(node, expectedName) {
    const target = String(expectedName || "").toLowerCase();
    let current = node?.parentElement || node?.parentNode || null;
    while (current) {
      if (String(current.localName || current.nodeName || "").replace(/^.*:/, "").toLowerCase() === target) return current;
      current = current.parentElement || current.parentNode || null;
    }
    return null;
  }

  function parseCcs(bytes, fileName) {
    const documentNode = core.xmlDocument(bytes, fileName);
    const noteNodes = core.localElements(documentNode, "Note");
    if (!noteNodes.length) throw new Error(`${fileName}에서 CeVIO 노트를 찾지 못했습니다.`);
    const sourcePpq = 960;
    const scale = PPQ / sourcePpq;
    const grouped = new Map();
    for (const noteNode of noteNodes) {
      const unit = closestLocalName(noteNode, "Unit");
      const key = unit?.getAttribute?.("Id") || unit?.getAttribute?.("Name") || "CeVIO Vocal";
      if (!grouped.has(key)) grouped.set(key, { name: unit?.getAttribute?.("Name") || "CeVIO Vocal", notes: [] });
      const clock = Number(noteNode.getAttribute("Clock") ?? noteNode.getAttribute("clock") ?? 0) || 0;
      const duration = Number(noteNode.getAttribute("Duration") ?? noteNode.getAttribute("duration") ?? 0) || 0;
      const directPitch = noteNode.getAttribute("Pitch") ?? noteNode.getAttribute("NoteNum");
      let pitch = directPitch == null || directPitch === "" ? NaN : Number(directPitch);
      if (!Number.isFinite(pitch)) {
        const step = Number(noteNode.getAttribute("PitchStep") ?? 0) || 0;
        const octave = Number(noteNode.getAttribute("PitchOctave") ?? 4) || 4;
        pitch = (octave + 1) * 12 + step;
      }
      grouped.get(key).notes.push({
        startTick: Math.round(clock * scale),
        durationTick: Math.max(1, Math.round(duration * scale)),
        pitch,
        velocity: Number(noteNode.getAttribute("Dynamics") || 96) || 96,
        lyric: noteNode.getAttribute("Lyric") || "",
      });
    }
    const tempoEvents = core.localElements(documentNode, "Sound").map(node => ({
      tick: Math.round((Number(node.getAttribute("Clock")) || 0) * scale),
      bpm: normalizeBpm(node.getAttribute("Tempo") || 120),
    }));
    const timeNode = core.localElements(documentNode, "Time")[0];
    const timeSignatures = timeNode ? [{ tick: 0, numerator: Number(timeNode.getAttribute("Beats")) || 4, denominator: Number(timeNode.getAttribute("BeatType")) || 4 }] : [];
    return buildResult(fileName, Array.from(grouped.values()), tempoEvents, timeSignatures, { sourceResolution: sourcePpq });
  }

  window.MabiVocalFormats = Object.freeze({
    parseVsq,
    parseVsqx,
    parseVpr,
    parseUst,
    parseUstx,
    parseSvp,
    parseS5p,
    parseCcs,
    SV_QUARTER,
  });
})();
