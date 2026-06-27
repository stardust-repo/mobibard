(() => {
  "use strict";

  const { clampInt, unique } = window.MabiUtils;
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];

  const GM_PROGRAM_NAMES = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
    "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavi",
    "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
    "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
    "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
    "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
    "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
    "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
    "String Ensemble 1", "String Ensemble 2", "SynthStrings 1", "SynthStrings 2", "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
    "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "SynthBrass 1", "SynthBrass 2",
    "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet",
    "Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
    "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
    "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
    "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bag pipe", "Fiddle", "Shanai",
    "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
    "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot"
  ];

  const GM_DRUM_NAMES = {
    35: "Acoustic Bass Drum", 36: "Bass Drum 1", 37: "Side Stick", 38: "Acoustic Snare", 39: "Hand Clap", 40: "Electric Snare",
    41: "Low Floor Tom", 42: "Closed Hi-Hat", 43: "High Floor Tom", 44: "Pedal Hi-Hat", 45: "Low Tom", 46: "Open Hi-Hat",
    47: "Low-Mid Tom", 48: "Hi-Mid Tom", 49: "Crash Cymbal 1", 50: "High Tom", 51: "Ride Cymbal 1", 52: "Chinese Cymbal",
    53: "Ride Bell", 54: "Tambourine", 55: "Splash Cymbal", 56: "Cowbell", 57: "Crash Cymbal 2", 58: "Vibraslap",
    59: "Ride Cymbal 2", 60: "Hi Bongo", 61: "Low Bongo", 62: "Mute Hi Conga", 63: "Open Hi Conga", 64: "Low Conga",
    65: "High Timbale", 66: "Low Timbale", 67: "High Agogo", 68: "Low Agogo", 69: "Cabasa", 70: "Maracas",
    71: "Short Whistle", 72: "Long Whistle", 73: "Short Guiro", 74: "Long Guiro", 75: "Claves", 76: "Hi Wood Block",
    77: "Low Wood Block", 78: "Mute Cuica", 79: "Open Cuica", 80: "Mute Triangle", 81: "Open Triangle"
  };

  const PERCUSSION_NAME_RE = /(drum|percussion|perc|snare|cymbal|kick|tom|hi[- ]?hat|ride|crash|clap|taiko|gong|wood\s*block|timpani|북|드럼|스네어|심벌|심벌즈|퍼커션|킥|탐|하이햇|라이드|크래시|공|징|북|박수|클랩|우드블록|팀파니)/i;
  const BEAT_PROGRAMS = new Set([47, 112, 113, 115, 116, 117, 118, 119]);

  function analyzeMidi(bytes, fileName = "MIDI") {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error("SMPTE 방식 MIDI는 지원하지 않습니다. PPQ/TPQN 방식으로 내보내 주세요.");
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16;
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid);
    const instrumentChoices = buildInstrumentChoices(sourceGroups);
    if (!instrumentChoices.length) throw new Error("노트를 찾지 못했습니다. 드럼/컨트롤만 있는 MIDI이거나 note on/off 쌍이 깨진 파일일 수 있습니다.");
    return {
      fileName,
      format: midi.format,
      trackCount: midi.trackCount,
      ppq,
      noteCount: midi.notes.length,
      tempoCount: normalizeMidiTempos(midi.tempoEvents).length,
      warnings: [...midi.warnings],
      // 사용자 선택용: 같은 악기명은 하나의 선택지로 묶어서 보여준다.
      instrumentGroups: instrumentChoices,
      instrumentChoices,
      // 내부 변환용: 채널/프로그램 상태를 포함한다. 중복 병합 경계로만 사용한다.
      sourceInstrumentGroups: sourceGroups,
      hasBeatGroups: instrumentChoices.some(g => g.isBeat),
      channels: instrumentChoices
    };
  }

  function buildInstrumentSourceGroups(midi, ticksPerGrid) {
    const groups = new Map();
    for (const note of midi.notes) {
      const groupInfo = getInstrumentGroupInfo(note);
      let group = groups.get(groupInfo.id);
      if (!group) {
        group = {
          id: groupInfo.id,
          channel: note.channel,
          program: normalizeProgram(note.program),
          isBeat: groupInfo.isBeat,
          isDrumNoteGroup: groupInfo.isDrumNoteGroup,
          instrumentName: groupInfo.instrumentName,
          programText: groupInfo.programText,
          noteCount: 0,
          duplicateMerged: 0,
          minMidi: Infinity,
          maxMidi: -Infinity
        };
        groups.set(groupInfo.id, group);
      }
      group.noteCount++;
      group.minMidi = Math.min(group.minMidi, note.midi);
      group.maxMidi = Math.max(group.maxMidi, note.midi);
    }

    // 64분음표 양자화 기준 완전 중복 수. 채널이 다른 같은 악기는 병합하지 않는다.
    const dupStats = new Map();
    for (const note of midi.notes) {
      const groupInfo = getInstrumentGroupInfo(note);
      const startGrid = Math.max(0, Math.round(note.startTick / ticksPerGrid));
      const durGrid = Math.max(1, Math.round((note.endTick - note.startTick) / ticksPerGrid));
      const key = `${groupInfo.id}|${note.midi}|${startGrid}|${startGrid + durGrid}`;
      dupStats.set(key, (dupStats.get(key) || 0) + 1);
    }
    const mergedByGroup = new Map();
    for (const [key, count] of dupStats) {
      if (count <= 1) continue;
      const groupId = key.split("|")[0];
      mergedByGroup.set(groupId, (mergedByGroup.get(groupId) || 0) + count - 1);
    }

    return Array.from(groups.values()).map(group => ({
      ...group,
      duplicateMerged: mergedByGroup.get(group.id) || 0,
      rangeText: Number.isFinite(group.minMidi) ? `${midiName(group.minMidi)}~${midiName(group.maxMidi)}` : "노트 없음",
      choiceId: instrumentChoiceId(group.instrumentName, group.isBeat)
    }));
  }

  function buildInstrumentChoices(sourceGroups) {
    const choices = new Map();
    for (const group of sourceGroups || []) {
      const name = cleanInstrumentName(group.instrumentName || group.programText || "악기 정보 없음");
      const id = instrumentChoiceId(name, group.isBeat);
      let choice = choices.get(id);
      if (!choice) {
        choice = {
          id,
          isBeat: Boolean(group.isBeat),
          isPercussion: Boolean(group.isBeat),
          instrumentName: name,
          programText: group.isBeat ? `${name} · 비트` : name,
          noteCount: 0,
          duplicateMerged: 0,
          minMidi: Infinity,
          maxMidi: -Infinity,
          sourceGroupIds: [],
          programCounts: new Map()
        };
        choices.set(id, choice);
      }
      const groupNoteCount = Number(group.noteCount) || 0;
      choice.noteCount += groupNoteCount;
      choice.duplicateMerged += Number(group.duplicateMerged) || 0;
      choice.minMidi = Math.min(choice.minMidi, group.minMidi);
      choice.maxMidi = Math.max(choice.maxMidi, group.maxMidi);
      choice.sourceGroupIds.push(group.id);
      const program = normalizeProgram(group.program);
      choice.programCounts.set(program, (choice.programCounts.get(program) || 0) + groupNoteCount);
    }

    return Array.from(choices.values()).map(choice => {
      const rangeText = Number.isFinite(choice.minMidi) ? `${midiName(choice.minMidi)}~${midiName(choice.maxMidi)}` : "노트 없음";
      const program = Array.from(choice.programCounts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
      return {
        id: choice.id,
        isBeat: choice.isBeat,
        isPercussion: choice.isPercussion,
        instrumentName: choice.instrumentName,
        programText: choice.programText,
        program,
        noteCount: choice.noteCount,
        duplicateMerged: choice.duplicateMerged,
        rangeText,
        sourceGroupIds: [...new Set(choice.sourceGroupIds)],
        defaultChecked: !choice.isBeat,
        description: buildInstrumentGroupDescription({
          instrumentName: choice.instrumentName,
          programText: choice.programText,
          noteCount: choice.noteCount,
          duplicateMerged: choice.duplicateMerged,
          rangeText,
          isBeat: choice.isBeat
        })
      };
    }).sort((a, b) => {
      if (a.isBeat !== b.isBeat) return a.isBeat ? 1 : -1;
      return a.instrumentName.localeCompare(b.instrumentName, "ko") || a.id.localeCompare(b.id);
    });
  }

  function buildInstrumentGroupDescription(group) {
    const chunks = [];
    chunks.push(group.programText || group.instrumentName);
    chunks.push(`노트 ${group.noteCount.toLocaleString("ko-KR")}개`);
    if (group.duplicateMerged) chunks.push(`완전 중복 ${group.duplicateMerged.toLocaleString("ko-KR")}개 병합 예정`);
    chunks.push(group.rangeText);
    if (group.isBeat) chunks.push("비트");
    return chunks.join(" · ");
  }

  function cleanInstrumentName(name) {
    return String(name || "악기 정보 없음").replace(/\s*·\s*비트\s*$/i, "").replace(/^\d+\.\s*/, "").trim() || "악기 정보 없음";
  }

  function instrumentChoiceId(name, isBeat) {
    const key = cleanInstrumentName(name).toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").replace(/[^\p{L}\p{N}+#(). _-]+/gu, "");
    return `${isBeat ? "beat" : "inst"}:${key || "unknown"}`;
  }

  function getInstrumentGroupInfo(note) {
    const program = normalizeProgram(note.program);
    const names = [programName(program), note.trackName, note.instrumentMetaName].filter(Boolean).join(" / ");
    const isBeat = note.channel === 9 || BEAT_PROGRAMS.has(program) || PERCUSSION_NAME_RE.test(names);
    if (note.channel === 9) {
      const drumName = GM_DRUM_NAMES[note.midi] || `Percussion ${note.midi}`;
      return {
        id: `ch${note.channel}:drum:${note.midi}`,
        isBeat: true,
        isDrumNoteGroup: true,
        instrumentName: drumName,
        programText: drumName
      };
    }
    const instrumentName = isBeat && note.instrumentMetaName && PERCUSSION_NAME_RE.test(note.instrumentMetaName)
      ? note.instrumentMetaName
      : programName(program);
    return {
      id: `ch${note.channel}:program:${program}:beat:${isBeat ? 1 : 0}`,
      isBeat,
      isDrumNoteGroup: false,
      instrumentName,
      programText: isBeat ? `${instrumentName} · 비트` : instrumentName
    };
  }

  function normalizeProgram(program) {
    return Number.isInteger(program) && program >= 0 && program < 128 ? program : 0;
  }

  function midiName(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(midi / 12) - 1;
    return `${names[((midi % 12) + 12) % 12]}${octave}`;
  }

  function buildMidiInstrumentPreview(bytes, instrumentChoiceId, options = {}) {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error("SMPTE 방식 MIDI는 지원하지 않습니다. PPQ/TPQN 방식으로 내보내 주세요.");
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16;
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid);
    const instrumentGroups = buildInstrumentChoices(sourceGroups);
    const choiceMap = new Map(instrumentGroups.map(g => [g.id, g]));
    const choice = choiceMap.get(String(instrumentChoiceId || ""));
    if (!choice) throw new Error("미리듣기 할 악기를 찾지 못했습니다.");

    const sourceToChoice = new Map();
    for (const c of instrumentGroups) {
      for (const sourceId of c.sourceGroupIds || []) sourceToChoice.set(sourceId, c.id);
    }

    let nextNoteId = 1;
    const rawNotes = midi.notes
      .map(n => {
        const sourceInfo = getInstrumentGroupInfo(n);
        const choiceId = sourceToChoice.get(sourceInfo.id) || instrumentChoiceId(sourceInfo.instrumentName, sourceInfo.isBeat);
        if (choiceId !== choice.id) return null;
        const startGrid = Math.max(0, Math.round(n.startTick / ticksPerGrid));
        const durGrid = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerGrid));
        return {
          id: `preview-${nextNoteId++}`,
          midi: n.midi,
          startGrid,
          endGrid: startGrid + durGrid,
          durGrid,
          midiVelocity: clampInt(Math.round(n.velocity), 1, 127),
          velocity: clampInt(Math.round(n.velocity / 127 * 15), 1, 15),
          channel: n.channel,
          program: normalizeProgram(n.program),
          instrumentGroupId: sourceInfo.id,
          instrumentChoiceId: choice.id,
          isBeat: Boolean(choice.isBeat || sourceInfo.isBeat),
          isPercussion: Boolean(choice.isBeat || sourceInfo.isBeat)
        };
      })
      .filter(Boolean);

    if (!rawNotes.length) throw new Error("선택한 악기에서 미리듣기 할 노트를 찾지 못했습니다.");

    const { notes } = mergeDuplicateGridNotes(rawNotes);
    notes.sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi || b.velocity - a.velocity);

    const firstGrid = Math.min(...notes.map(n => n.startGrid));
    const tempoGridEvents = normalizeGridTempos(normalizeMidiTempos(midi.tempoEvents).map(t => ({
      grid: Math.max(0, Math.round(t.tick / ticksPerGrid)),
      bpm: t.bpm
    })));
    const firstSec = gridToSeconds(firstGrid, tempoGridEvents);
    const maxSeconds = Math.max(2, Math.min(20, Number(options.maxSeconds ?? options.seconds ?? 8) || 8));
    const tailSeconds = Math.max(0.25, Math.min(2, Number(options.tailSeconds ?? 0.75) || 0.75));
    const previewNotes = [];
    for (const n of notes) {
      const start = gridToSeconds(n.startGrid, tempoGridEvents) - firstSec;
      if (start > maxSeconds) break;
      const end = gridToSeconds(n.endGrid, tempoGridEvents) - firstSec;
      const clippedStart = Math.max(0, start);
      const clippedEnd = Math.min(maxSeconds + tailSeconds, end);
      const durationSec = clippedEnd - clippedStart;
      if (durationSec <= 0.01) continue;
      previewNotes.push({
        part: 0,
        midi: n.midi,
        start: clippedStart,
        durationSec,
        volume: n.velocity
      });
    }
    if (!previewNotes.length) throw new Error("미리듣기 구간에 소리 나는 노트가 없습니다.");

    const programCounts = new Map();
    for (const n of rawNotes) {
      const p = normalizeProgram(n.program);
      programCounts.set(p, (programCounts.get(p) || 0) + 1);
    }
    const program = Array.from(programCounts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    const duration = previewNotes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
    return {
      instrumentId: choice.id,
      instrumentName: choice.instrumentName,
      isBeat: Boolean(choice.isBeat),
      program,
      notes: previewNotes,
      duration,
      firstGrid,
      noteCount: rawNotes.length
    };
  }

  function buildMidiFilePreview(bytes, options = {}) {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error("SMPTE 방식 MIDI는 지원하지 않습니다. PPQ/TPQN 방식으로 내보내 주세요.");
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16;
    let nextNoteId = 1;
    const rawNotes = midi.notes.map(n => {
      const sourceInfo = getInstrumentGroupInfo(n);
      const startGrid = Math.max(0, Math.round(n.startTick / ticksPerGrid));
      const durGrid = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerGrid));
      return {
        id: `file-preview-${nextNoteId++}`,
        midi: n.midi,
        startGrid,
        endGrid: startGrid + durGrid,
        durGrid,
        midiVelocity: clampInt(Math.round(n.velocity), 1, 127),
        velocity: clampInt(Math.round(n.velocity / 127 * 15), 1, 15),
        channel: n.channel,
        program: normalizeProgram(n.program),
        instrumentGroupId: sourceInfo.id,
        instrumentChoiceId: instrumentChoiceId(sourceInfo.instrumentName, sourceInfo.isBeat),
        isBeat: Boolean(sourceInfo.isBeat),
        isPercussion: Boolean(sourceInfo.isBeat)
      };
    });
    if (!rawNotes.length) throw new Error("미리듣기 할 노트를 찾지 못했습니다.");

    const { notes } = mergeDuplicateGridNotes(rawNotes);
    notes.sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi || b.velocity - a.velocity);
    const firstGrid = Math.min(...notes.map(n => n.startGrid));
    const tempoGridEvents = normalizeGridTempos(normalizeMidiTempos(midi.tempoEvents).map(t => ({
      grid: Math.max(0, Math.round(t.tick / ticksPerGrid)),
      bpm: t.bpm
    })));
    const firstSec = gridToSeconds(firstGrid, tempoGridEvents);
    const maxSeconds = Math.max(5, Math.min(180, Number(options.maxSeconds ?? options.seconds ?? 45) || 45));
    const tailSeconds = Math.max(0.25, Math.min(3, Number(options.tailSeconds ?? 1.0) || 1.0));
    const previewNotes = [];
    for (const n of notes) {
      const start = gridToSeconds(n.startGrid, tempoGridEvents) - firstSec;
      if (start > maxSeconds) break;
      const end = gridToSeconds(n.endGrid, tempoGridEvents) - firstSec;
      const clippedStart = Math.max(0, start);
      const clippedEnd = Math.min(maxSeconds + tailSeconds, end);
      const durationSec = clippedEnd - clippedStart;
      if (durationSec <= 0.01) continue;
      previewNotes.push({
        part: 0,
        midi: n.midi,
        start: clippedStart,
        durationSec,
        volume: n.velocity,
        program: normalizeProgram(n.program),
        isBeat: Boolean(n.isBeat || n.isPercussion)
      });
    }
    if (!previewNotes.length) throw new Error("미리듣기 구간에 소리 나는 노트가 없습니다.");

    const duration = previewNotes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
    return {
      notes: previewNotes,
      duration,
      firstGrid,
      noteCount: notes.length,
      previewSeconds: maxSeconds
    };
  }

  function gridToSeconds(grid, tempoEvents) {
    const target = Math.max(0, Math.round(Number(grid) || 0));
    const events = normalizeGridTempos(tempoEvents || []);
    let sec = 0;
    let pos = 0;
    let bpm = events[0]?.bpm || 120;
    for (let i = 1; i < events.length; i++) {
      const ev = events[i];
      if (ev.grid >= target) break;
      sec += (ev.grid - pos) * (60 / bpm / 16);
      pos = ev.grid;
      bpm = ev.bpm;
    }
    sec += Math.max(0, target - pos) * (60 / bpm / 16);
    return sec;
  }

  function midiToMml(bytes, fileName = "MIDI", options = {}) {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error("SMPTE 방식 MIDI는 지원하지 않습니다. PPQ/TPQN 방식으로 내보내 주세요.");

    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16; // 64분음표 = 4분음표 / 16
    const warnings = [...midi.warnings];
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid);
    const instrumentGroups = buildInstrumentChoices(sourceGroups);
    const choiceMap = new Map(instrumentGroups.map(g => [g.id, g]));
    const sourceToChoice = new Map();
    for (const choice of instrumentGroups) {
      for (const sourceId of choice.sourceGroupIds || []) sourceToChoice.set(sourceId, choice.id);
    }
    const hasBeatGroupsInFile = instrumentGroups.some(g => g.isBeat);
    const partCount = clampInt(options.partCount ?? (Array.isArray(options.exportChannels) ? options.exportChannels.length : 3), 1, 6);
    const exportChannels = normalizeExportChannels(options, partCount, instrumentGroups, hasBeatGroupsInFile);
    const roles = exportChannels.map(ch => ch.role);
    const selectedSet = new Set(exportChannels.flatMap(ch => ch.selectedInstrumentGroups));

    const normalizedMidiTempos = normalizeMidiTempos(midi.tempoEvents);
    const tempoGridEvents = normalizeGridTempos(normalizedMidiTempos.map(t => ({
      grid: Math.max(0, Math.round(t.tick / ticksPerGrid)),
      bpm: t.bpm
    })));

    let nextNoteId = 1;
    const rawNotes = midi.notes
      .map(n => {
        const sourceInfo = getInstrumentGroupInfo(n);
        const choiceId = sourceToChoice.get(sourceInfo.id) || instrumentChoiceId(sourceInfo.instrumentName, sourceInfo.isBeat);
        const choice = choiceMap.get(choiceId);
        if (!selectedSet.has(choiceId)) return null;
        const startGrid = Math.max(0, Math.round(n.startTick / ticksPerGrid));
        const durGrid = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerGrid));
        return {
          id: `note-${nextNoteId++}`,
          midi: n.midi,
          startGrid,
          endGrid: startGrid + durGrid,
          durGrid,
          midiVelocity: clampInt(Math.round(n.velocity), 1, 127),
          velocity: clampInt(Math.round(n.velocity / 127 * 15), 1, 15),
          channel: n.channel,
          trackIndex: n.trackIndex,
          program: normalizeProgram(n.program),
          // UI 선택은 악기명 기준이지만, 완전 중복 병합은 원본 연주 그룹 기준으로만 한다.
          instrumentGroupId: sourceInfo.id,
          instrumentChoiceId: choiceId,
          isBeat: Boolean(choice?.isBeat || sourceInfo.isBeat),
          isPercussion: Boolean(choice?.isBeat || sourceInfo.isBeat)
        };
      })
      .filter(Boolean);

    if (!rawNotes.length) throw new Error("선택한 악기에서 노트를 찾지 못했습니다.");

    const { notes, mergedCount } = mergeDuplicateGridNotes(rawNotes);
    notes.sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi || b.velocity - a.velocity);

    const assignment = assignNotesToVoices(notes, exportChannels);
    const { voices, skipped, placed, overlapMerged } = assignment;
    const maxEndGrid = Math.max(0, ...notes.map(n => n.endGrid));
    const parts = voices.map((v, i) => voiceToMml64(v, i === 0 ? tempoGridEvents : [], i === 0 ? maxEndGrid : 0));
    const mml = `MML@${parts.join(",")};`;
    const totalUsed = voices.reduce((sum, v) => sum + v.length, 0);
    const selectedLabels = Array.from(selectedSet)
      .map(id => choiceMap.get(id))
      .filter(Boolean)
      .map(g => g.instrumentName);
    const channelLines = exportChannels.map((ch, i) => {
      const names = ch.selectedInstrumentGroups.map(id => choiceMap.get(id)?.instrumentName).filter(Boolean);
      const label = names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개` : names.join(", ");
      const overlapLabel = overlapMergeModeLabel(ch.overlapMergeMode ?? ch.overlapMerge);
      return `${i + 1}. ${roleLabel(ch.role)}${overlapLabel ? `/${overlapLabel}` : ""}: ${label || "선택 없음"}`;
    });
    const tempoMessage = tempoGridEvents.length > 1
      ? `MIDI 템포 ${tempoGridEvents.length}개를 멜로디 파트에 반영했습니다.`
      : `시작 템포 T${tempoGridEvents[0]?.bpm || 120}을 사용했습니다.`;
    const message = [
      `${fileName} 변환 완료`,
      `선택 악기: ${selectedLabels.length > 6 ? selectedLabels.slice(0, 6).join(", ") + ` 외 ${selectedLabels.length - 6}개` : selectedLabels.join(", ")}`,
      `입력 노트 ${rawNotes.length.toLocaleString("ko-KR")}개 → 완전 중복 병합 ${mergedCount.toLocaleString("ko-KR")}개 → 정상 배치 ${placed.toLocaleString("ko-KR")}개` + (overlapMerged ? ` / 겹침 병합 ${overlapMerged.toLocaleString("ko-KR")}개` : ""),
      `출력 노트 ${totalUsed.toLocaleString("ko-KR")}개 / 생략 ${skipped.toLocaleString("ko-KR")}개`,
      `변환 설정: ${exportChannels.length}파트 / 최소 64분음표`,
      `채널 설정:\n- ${channelLines.join("\n- ")}`,
      tempoMessage,
      skipped ? `역할/악기/동시음 제한으로 ${skipped.toLocaleString("ko-KR")}개를 생략했습니다.` : "생략된 노트가 없습니다.",
      warnings.length ? "\n주의:\n- " + unique(warnings).join("\n- ") : ""
    ].filter(Boolean).join("\n");
    return { mml, parts, message, warnings, selectedInstrumentGroups: Array.from(selectedSet), partCount: exportChannels.length, roles, exportChannels, skipped, mergedCount, placed, overlapMerged };
  }

  function normalizeExportChannels(options, partCount, instrumentGroups, allowBeat = true) {
    const active = (instrumentGroups || []).filter(g => g.noteCount > 0);
    const normalIds = active.filter(g => !g.isBeat).map(g => g.id);
    const beatIds = active.filter(g => g.isBeat).map(g => g.id);
    const validIds = new Set(active.map(g => g.id));
    const rawChannels = Array.isArray(options.exportChannels) ? options.exportChannels : null;
    const roles = normalizeRoles(options.roles, partCount, allowBeat && beatIds.length > 0);
    const globalSelected = normalizeSelectedInstrumentGroups(options.selectedInstrumentGroups, instrumentGroups);

    return Array.from({ length: partCount }, (_, i) => {
      const raw = rawChannels?.[i] || null;
      let role = String(raw?.role || roles[i] || "auto");
      if (role === "beat" && (!allowBeat || !beatIds.length)) role = "auto";
      if (!["auto", "high", "low", "beat"].includes(role)) role = "auto";
      const allowed = role === "beat" ? beatIds : normalIds;
      const allowedSet = new Set(allowed);
      let selected = Array.isArray(raw?.selectedInstrumentGroups)
        ? raw.selectedInstrumentGroups.map(String).filter(id => validIds.has(id) && allowedSet.has(id))
        : globalSelected.filter(id => allowedSet.has(id));
      if (!selected.length) selected = allowed.length ? [allowed[0]] : [];
      const overlapMergeMode = normalizeOverlapMergeMode(raw?.overlapMergeMode ?? raw?.overlapMerge ?? true);
      return {
        role,
        overlapMergeMode,
        overlapMerge: overlapMergeMode !== "none",
        selectedInstrumentGroups: [...new Set(selected)]
      };
    });
  }

  function normalizeSelectedInstrumentGroups(input, groups) {
    const active = (groups || []).filter(g => g.noteCount > 0);
    const validIds = new Set(active.map(g => g.id));
    let list = Array.isArray(input) ? input.map(String).filter(id => validIds.has(id)) : [];
    if (!list.length) {
      const firstNormal = active.find(g => !g.isBeat);
      if (firstNormal) list = [firstNormal.id];
    }
    if (!list.length && active[0]) list = [active[0].id];
    return [...new Set(list)];
  }

  function normalizeRoles(input, partCount, allowBeat = true) {
    const valid = new Set(["auto", "high", "low", ...(allowBeat ? ["beat"] : [])]);
    const defaults = defaultRoles(partCount, allowBeat);
    return Array.from({ length: partCount }, (_, i) => {
      const raw = Array.isArray(input) ? String(input[i] || defaults[i] || "auto") : (defaults[i] || "auto");
      return valid.has(raw) ? raw : (defaults[i] || "auto");
    });
  }

  function defaultRoles(partCount, allowBeat = true) {
    const roles = Array.from({ length: partCount }, () => "auto");
    if (partCount >= 1) roles[0] = "high";
    if (partCount >= 3) roles[2] = "low";
    return roles;
  }

  function mergeDuplicateGridNotes(rawNotes) {
    const byKey = new Map();
    for (const n of rawNotes) {
      const key = `${n.instrumentGroupId}|${n.midi}|${n.startGrid}|${n.endGrid}`;
      let item = byKey.get(key);
      if (!item) {
        item = { ...n, midiVelocities: [n.midiVelocity], sourceCount: 1, mergedIds: [n.id] };
        byKey.set(key, item);
      } else {
        item.sourceCount++;
        item.midiVelocities.push(n.midiVelocity);
        item.mergedIds.push(n.id);
      }
    }
    let nextMergedId = 1;
    const notes = Array.from(byKey.values()).map(n => {
      const mergedMidiVelocity = mergeMidiVelocity(n.midiVelocities);
      return {
        ...n,
        id: n.sourceCount > 1 ? `merged-${nextMergedId++}` : n.id,
        midiVelocity: mergedMidiVelocity,
        velocity: clampInt(Math.round(mergedMidiVelocity / 127 * 15), 1, 15),
        durGrid: Math.max(1, n.endGrid - n.startGrid)
      };
    });
    const mergedCount = rawNotes.length - notes.length;
    return { notes, mergedCount };
  }

  function mergeMidiVelocity(values) {
    const nums = values.map(v => clampInt(Math.round(v), 1, 127));
    const max = Math.max(...nums);
    if (nums.length <= 1) return max;
    // 완전 중복은 대체로 제작/변환 과정의 중복이므로 과증폭하지 않고 약간만 보정한다.
    return clampInt(Math.round(max * (1 + 0.12 * Math.min(nums.length - 1, 4))), 1, 127);
  }

  function roleLabel(role) {
    return ({ auto: "자동", high: "고음", low: "저음", beat: "비트" })[role] || "자동";
  }

  function normalizeOverlapMergeMode(value) {
    if (value === true || value === "true") return "all";
    if (value === false || value === "false") return "none";
    const mode = String(value || "all").toLowerCase();
    return ["all", "half", "none"].includes(mode) ? mode : "all";
  }

  function overlapMergeModeLabel(value) {
    const mode = normalizeOverlapMergeMode(value);
    if (mode === "all") return "겹침 모두 병합";
    if (mode === "half") return "겹침 절반 병합";
    return "";
  }

  function assignNotesToVoices(notes, exportChannelsOrCount, oldRoles = null) {
    const exportChannels = Array.isArray(exportChannelsOrCount)
      ? exportChannelsOrCount
      : Array.from({ length: clampInt(exportChannelsOrCount || 3, 1, 6) }, (_, i) => ({ role: oldRoles?.[i] || defaultRoles(exportChannelsOrCount || 3)[i] || "auto", overlapMergeMode: "none", overlapMerge: false, selectedInstrumentGroups: [] }));
    const partCount = exportChannels.length;
    const voices = Array.from({ length: partCount }, () => []);
    const voiceEnd = Array(partCount).fill(0);
    const usedNoteIds = new Set();
    let skipped = 0;
    let placed = 0;
    let overlapMerged = 0;
    let i = 0;

    while (i < notes.length) {
      const startGrid = notes[i].startGrid;
      const group = [];
      while (i < notes.length && notes[i].startGrid === startGrid) group.push(notes[i++]);
      const remaining = group.filter(note => !usedNoteIds.has(note.id));
      const assignedChannels = new Set();

      // 1차: 비어 있는 채널에 정상 배치. 역할/옥타브 영역 점수로 채널-노트 조합을 고른다.
      while (remaining.length) {
        const best = findBestNormalPlacement(remaining, exportChannels, voices, voiceEnd, assignedChannels, startGrid);
        if (!best) break;
        const [chosen] = remaining.splice(best.noteIndex, 1);
        voices[best.channelIndex].push(chosen);
        voiceEnd[best.channelIndex] = Math.max(voiceEnd[best.channelIndex], chosen.endGrid);
        assignedChannels.add(best.channelIndex);
        usedNoteIds.add(chosen.id);
        placed++;
      }

      // 2차: 정상 배치가 불가능한 노트만 겹침 병합으로 구제한다.
      while (remaining.length) {
        const best = findBestOverlapMergePlacement(remaining, exportChannels, voices, assignedChannels, startGrid);
        if (!best) break;
        const [chosen] = remaining.splice(best.noteIndex, 1);
        trimActiveNoteAt(voices[best.channelIndex], startGrid);
        voices[best.channelIndex].push(chosen);
        voices[best.channelIndex].sort((a, b) => a.startGrid - b.startGrid || a.endGrid - b.endGrid || a.midi - b.midi);
        voiceEnd[best.channelIndex] = Math.max(chosen.endGrid, getVoiceEnd(voices[best.channelIndex]));
        assignedChannels.add(best.channelIndex);
        usedNoteIds.add(chosen.id);
        overlapMerged++;
      }

      skipped += remaining.length;
    }

    return { voices, skipped, placed, overlapMerged };
  }

  function findBestNormalPlacement(remaining, exportChannels, voices, voiceEnd, assignedChannels, startGrid) {
    let best = null;
    for (let noteIndex = 0; noteIndex < remaining.length; noteIndex++) {
      const note = remaining[noteIndex];
      for (let channelIndex = 0; channelIndex < exportChannels.length; channelIndex++) {
        if (assignedChannels.has(channelIndex)) continue;
        if (voiceEnd[channelIndex] > startGrid) continue;
        const cfg = exportChannels[channelIndex];
        if (!canChannelUseNote(note, cfg)) continue;
        const score = channelNoteScore(note, cfg, channelIndex, false);
        const item = { noteIndex, channelIndex, score };
        if (!best || compareScore(item.score, best.score) > 0) best = item;
      }
    }
    return best;
  }

  function findBestOverlapMergePlacement(remaining, exportChannels, voices, assignedChannels, startGrid) {
    let best = null;
    for (let noteIndex = 0; noteIndex < remaining.length; noteIndex++) {
      const note = remaining[noteIndex];
      for (let channelIndex = 0; channelIndex < exportChannels.length; channelIndex++) {
        if (assignedChannels.has(channelIndex)) continue;
        const cfg = exportChannels[channelIndex];
        const mergeMode = normalizeOverlapMergeMode(cfg.overlapMergeMode ?? cfg.overlapMerge);
        if (mergeMode === "none") continue;
        if (!canChannelUseNote(note, cfg)) continue;
        const active = findActiveNoteAt(voices[channelIndex], startGrid);
        if (!active) continue;
        if (mergeMode === "half" && !isPastOverlapMergeHalfPoint(active, startGrid)) continue;
        const trimLoss = Math.max(0, active.endGrid - startGrid);
        const score = [...channelNoteScore(note, cfg, channelIndex, true), -trimLoss];
        const item = { noteIndex, channelIndex, score };
        if (!best || compareScore(item.score, best.score) > 0) best = item;
      }
    }
    return best;
  }

  function isPastOverlapMergeHalfPoint(active, startGrid) {
    if (!active) return false;
    const activeStart = Number(active.startGrid) || 0;
    const activeEnd = Number(active.endGrid) || activeStart;
    if (activeEnd <= activeStart) return false;
    const halfPoint = activeStart + (activeEnd - activeStart) * 0.5;
    return startGrid >= halfPoint;
  }

  function canChannelUseNote(note, cfg) {
    if (!cfg) return false;
    const wantsBeat = cfg.role === "beat";
    if (wantsBeat !== isBeatCandidate(note)) return false;
    const selected = cfg.selectedInstrumentGroups;
    if (Array.isArray(selected) && selected.length && !selected.includes(note.instrumentChoiceId)) return false;
    return true;
  }

  function channelNoteScore(note, cfg, channelIndex, isMerge) {
    const role = cfg?.role || "auto";
    const highArea = note.midi >= 60; // O4C 이상
    let roleFit = 0;
    let rolePitch = 0;
    if (role === "beat") {
      roleFit = 400;
      rolePitch = drumPriority(note.midi);
    } else if (role === "high") {
      roleFit = highArea ? 320 : 30;
      rolePitch = note.midi;
    } else if (role === "low") {
      roleFit = highArea ? 30 : 320;
      rolePitch = -note.midi;
    } else {
      roleFit = 170;
      rolePitch = note.midi;
    }
    return [
      roleFit,
      isMerge ? -35 : 0,
      rolePitch,
      note.velocity || 0,
      note.durGrid || Math.max(1, note.endGrid - note.startGrid),
      -channelIndex
    ];
  }

  function findActiveNoteAt(voice, grid) {
    for (let i = voice.length - 1; i >= 0; i--) {
      const n = voice[i];
      if (n.startGrid < grid && n.endGrid > grid) return n;
      if (n.endGrid <= grid) break;
    }
    return null;
  }

  function trimActiveNoteAt(voice, grid) {
    const n = findActiveNoteAt(voice, grid);
    if (!n) return false;
    n.endGrid = Math.max(n.startGrid, grid);
    n.durGrid = Math.max(0, n.endGrid - n.startGrid);
    if (n.durGrid <= 0) {
      const idx = voice.indexOf(n);
      if (idx >= 0) voice.splice(idx, 1);
    }
    return true;
  }

  function getVoiceEnd(voice) {
    return voice.reduce((max, n) => Math.max(max, n.endGrid || 0), 0);
  }

  function isBeatCandidate(n) {
    return Boolean(n?.isBeat || n?.isPercussion || n?.channel === 9);
  }

  function compareScore(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  function drumPriority(midi) {
    if ([35, 36].includes(midi)) return 100; // Kick
    if ([38, 40, 37].includes(midi)) return 96; // Snare / side stick
    if ([42, 44, 46].includes(midi)) return 90; // Hi-hat
    if ([49, 51, 52, 55, 57, 59].includes(midi)) return 84; // Cymbal / ride
    if ([41, 43, 45, 47, 48, 50].includes(midi)) return 76; // Tom
    if ([39, 54, 56, 69, 70, 75, 80, 81].includes(midi)) return 68;
    return GM_DRUM_NAMES[midi] ? 60 : 0;
  }

  function voiceToMml64(notes, tempoEvents = [], finalGrid = 0) {
    let out = "";
    let pos = 0;
    let octave = 4;
    let volume = 8;
    const tempos = (tempoEvents && tempoEvents.length ? normalizeGridTempos(tempoEvents) : []).filter(t => t.grid <= Math.max(finalGrid, ...notes.map(n => n.endGrid), 0));
    let tempoIndex = 0;

    const peekTempoGrid = () => tempoIndex < tempos.length ? tempos[tempoIndex].grid : Infinity;
    const emitTemposAtCurrentPos = () => {
      while (tempoIndex < tempos.length && tempos[tempoIndex].grid === pos) {
        out += `T${tempos[tempoIndex].bpm}`;
        tempoIndex++;
      }
    };
    const nextTempoInside = (end) => {
      const grid = peekTempoGrid();
      return grid > pos && grid < end ? grid : end;
    };
    const emitRestTo = (target) => {
      while (pos < target) {
        emitTemposAtCurrentPos();
        const segEnd = nextTempoInside(target);
        if (segEnd > pos) {
          out += durationToMmlTokens("r", segEnd - pos, false);
          pos = segEnd;
        }
      }
      emitTemposAtCurrentPos();
    };
    const emitNoteTo = (note, name) => {
      while (pos < note.endGrid) {
        emitTemposAtCurrentPos();
        const segEnd = nextTempoInside(note.endGrid);
        if (segEnd > pos) {
          out += durationToMmlTokens(name, segEnd - pos, true);
          pos = segEnd;
        }
        if (pos < note.endGrid) out += "&";
      }
      emitTemposAtCurrentPos();
    };

    for (const n of notes) {
      if (n.startGrid > pos) emitRestTo(n.startGrid);
      else emitTemposAtCurrentPos();
      if (n.endGrid <= pos) continue;
      if (n.velocity !== volume) { out += `V${n.velocity}`; volume = n.velocity; }
      const noteOct = Math.floor(n.midi / 12) - 1;
      if (noteOct !== octave) { out += `O${noteOct}`; octave = noteOct; }
      const name = NOTE_NAMES[((n.midi % 12) + 12) % 12];
      emitNoteTo(n, name);
    }

    if (finalGrid > pos && tempoIndex < tempos.length) emitRestTo(finalGrid);
    emitTemposAtCurrentPos();
    return out;
  }

  function durationToMmlTokens(prefix, grids, tie) {
    const units = [
      [64, "1"], [48, "2."], [32, "2"], [24, "4."], [16, "4"], [12, "8."],
      [8, "8"], [6, "16."], [4, "16"], [3, "32."], [2, "32"], [1, "64"]
    ];
    const parts = [];
    let left = Math.max(0, Math.round(grids));
    while (left > 0) {
      const u = units.find(([g]) => g <= left) || units[units.length - 1];
      parts.push(prefix + u[1]);
      left -= u[0];
    }
    return tie ? parts.join("&") : parts.join("");
  }

  function normalizeGridTempos(events) {
    const sorted = [...(events || [])]
      .map(t => ({ grid: Math.max(0, Math.round(Number(t.grid) || 0)), bpm: clampInt(t.bpm, 32, 255) }))
      .sort((a, b) => a.grid - b.grid);
    const out = [];
    for (const ev of sorted) {
      const last = out[out.length - 1];
      if (last && last.grid === ev.grid) last.bpm = ev.bpm;
      else out.push(ev);
    }
    if (!out.length || out[0].grid !== 0) out.unshift({ grid: 0, bpm: 120 });
    return out.filter((ev, i, arr) => i === 0 || ev.bpm !== arr[i - 1].bpm || ev.grid === 0);
  }

  function buildChannelSummaries(midi) {
    return midi.channelInfo.map((info, channelIndex) => {
      const programs = Array.from(info.programs).sort((a, b) => a - b);
      const trackNames = Array.from(info.trackNames).filter(Boolean);
      const instrumentNames = Array.from(info.instrumentNames).filter(Boolean);
      const allNames = [...trackNames, ...instrumentNames, ...programs.map(programName)].join(" / ");
      const drumNotes = Array.from(info.drumNotes).sort((a, b) => a - b);
      const isPercussion = channelIndex === 9 || PERCUSSION_NAME_RE.test(allNames);
      const programNames = isPercussion
        ? ["드럼/퍼커션"]
        : (programs.length ? programs.map(programName) : ["프로그램 미지정(기본 피아노)"]);
      const drumNoteNames = drumNotes.slice(0, 8).map(n => GM_DRUM_NAMES[n] || `Perc ${n}`);
      return {
        channelIndex,
        channelNumber: channelIndex + 1,
        noteCount: info.noteCount,
        programs,
        programNames,
        trackNames,
        instrumentNames,
        drumNoteNames,
        isPercussion,
        defaultChecked: info.noteCount > 0 && !isPercussion,
        description: buildChannelDescription({ programNames, trackNames, instrumentNames, drumNoteNames, noteCount: info.noteCount, isPercussion })
      };
    });
  }

  function buildChannelDescription(summary) {
    const chunks = [];
    chunks.push(summary.programNames.join(" / "));
    if (summary.trackNames.length) chunks.push(`트랙: ${summary.trackNames.slice(0, 2).join(" / ")}`);
    if (summary.instrumentNames.length) chunks.push(`이름: ${summary.instrumentNames.slice(0, 2).join(" / ")}`);
    if (summary.isPercussion && summary.drumNoteNames.length) chunks.push(`예: ${summary.drumNoteNames.join(", ")}`);
    chunks.push(`노트 ${summary.noteCount.toLocaleString("ko-KR")}개`);
    return chunks.join(" · ");
  }

  function programName(program) {
    const p = clampInt(program, 0, 127);
    return `${p + 1}. ${GM_PROGRAM_NAMES[p] || "Unknown"}`;
  }

  function parseMidiFile(bytes) {
    const r = new ByteReader(bytes);
    const warnings = [];
    if (r.readAscii(4) !== "MThd") throw new Error("MThd 헤더가 없습니다. 표준 MIDI 파일인지 확인해 주세요.");
    const headerLength = r.readU32();
    if (headerLength < 6) throw new Error("MIDI 헤더 길이가 올바르지 않습니다.");
    const format = r.readU16();
    const trackCount = r.readU16();
    const divisionRaw = r.readU16();
    if (headerLength > 6) r.skip(headerLength - 6);
    const smpteDivision = (divisionRaw & 0x8000) !== 0;
    const ppq = smpteDivision ? 480 : (divisionRaw & 0x7fff);
    const notes = [];
    const tempoEvents = [{ tick: 0, bpm: 120 }];
    const channelInfo = Array.from({ length: 16 }, () => ({
      noteCount: 0,
      programs: new Set(),
      tracks: new Set(),
      trackNames: new Set(),
      instrumentNames: new Set(),
      drumNotes: new Set()
    }));
    const trackMeta = Array.from({ length: trackCount }, () => ({ trackName: "", instrumentName: "" }));

    for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
      if (r.remaining() < 8) break;
      const id = r.readAscii(4);
      const len = r.readU32();
      if (id !== "MTrk") throw new Error(`${trackIndex + 1}번 트랙에서 MTrk 헤더를 찾지 못했습니다.`);
      const end = r.pos + len;
      parseMidiTrack(r, end, trackIndex, notes, tempoEvents, warnings, channelInfo, trackMeta);
      r.pos = end;
    }
    notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
    tempoEvents.sort((a, b) => a.tick - b.tick);
    return { format, trackCount, ppq, smpteDivision, notes, tempoEvents, warnings, channelInfo, trackMeta };
  }

  function normalizeMidiTempos(events) {
    const map = [];
    for (const ev of [...events].sort((a, b) => a.tick - b.tick)) {
      const last = map[map.length - 1];
      if (last && last.tick === ev.tick) last.bpm = ev.bpm;
      else map.push({ tick: ev.tick, bpm: ev.bpm });
    }
    if (!map.length || map[0].tick !== 0) map.unshift({ tick: 0, bpm: 120 });
    return map.filter((ev, i, arr) => i === 0 || ev.bpm !== arr[i - 1].bpm || ev.tick === 0);
  }

  function parseMidiTrack(r, end, trackIndex, notes, tempoEvents, warnings, channelInfo, trackMeta) {
    let tick = 0;
    let running = null;
    const open = new Map();
    const currentProgram = Array(16).fill(null);

    const addOpen = (ch, midi, velocity) => {
      const key = `${ch}:${midi}`;
      if (!open.has(key)) open.set(key, []);
      open.get(key).push({ tick, velocity, program: currentProgram[ch] });
    };
    const closeOpen = (ch, midi) => {
      const key = `${ch}:${midi}`;
      const arr = open.get(key);
      if (!arr || !arr.length) return;
      const s = arr.shift();
      if (!arr.length) open.delete(key);
      if (tick <= s.tick) return;
      notes.push({
        startTick: s.tick,
        endTick: tick,
        midi,
        velocity: s.velocity,
        channel: ch,
        trackIndex,
        program: s.program,
        trackName: trackMeta[trackIndex]?.trackName || "",
        instrumentMetaName: trackMeta[trackIndex]?.instrumentName || ""
      });
      registerNoteChannel(channelInfo[ch], ch, midi, trackIndex, trackMeta[trackIndex]);
    };

    while (r.pos < end && r.remaining() > 0) {
      tick += r.readVarLen();
      let status = r.readU8();
      if (status < 0x80) {
        if (running == null) throw new Error("MIDI running status가 올바르지 않습니다.");
        r.pos--;
        status = running;
      } else if (status < 0xf0) running = status;

      if (status === 0xff) {
        const type = r.readU8();
        const len = r.readVarLen();
        const data = r.readBytes(len);
        if (type === 0x51 && data.length === 3) {
          const mpqn = (data[0] << 16) | (data[1] << 8) | data[2];
          const bpm = clampInt(Math.round(60000000 / mpqn), 32, 255);
          tempoEvents.push({ tick, bpm });
        } else if (type === 0x03) {
          trackMeta[trackIndex].trackName = decodeMetaText(data);
        } else if (type === 0x04) {
          trackMeta[trackIndex].instrumentName = decodeMetaText(data);
        }
        if (type === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        r.skip(r.readVarLen());
      } else {
        const cmd = status & 0xf0;
        const ch = status & 0x0f;
        const d1 = r.readU8();
        const needs2 = cmd !== 0xc0 && cmd !== 0xd0;
        const d2 = needs2 ? r.readU8() : 0;
        if (cmd === 0xc0) {
          currentProgram[ch] = d1;
          channelInfo[ch].programs.add(d1);
        } else if (cmd === 0x90 && d2 > 0) {
          addOpen(ch, d1, d2);
        } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
          closeOpen(ch, d1);
        }
      }
    }
    if (open.size) {
      const count = Array.from(open.values()).reduce((sum, arr) => sum + arr.length, 0);
      warnings.push(`${trackIndex + 1}번 트랙: note off가 없는 노트 ${count}개를 생략했습니다.`);
    }
    r.pos = end;
  }

  function registerNoteChannel(info, ch, midi, trackIndex, meta) {
    info.noteCount++;
    info.tracks.add(trackIndex);
    if (meta?.trackName) info.trackNames.add(meta.trackName);
    if (meta?.instrumentName) info.instrumentNames.add(meta.instrumentName);
    if (ch === 9) info.drumNotes.add(midi);
  }

  function decodeMetaText(bytes) {
    if (!bytes || !bytes.length) return "";
    try {
      if (window.TextDecoder) return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "").trim();
    } catch (_) {}
    return Array.from(bytes, b => String.fromCharCode(b)).join("").replace(/\0/g, "").trim();
  }

  class ByteReader {
    constructor(bytes) { this.bytes = bytes; this.pos = 0; }
    remaining() { return this.bytes.length - this.pos; }
    readU8() { if (this.pos >= this.bytes.length) throw new Error("파일 끝에 도달했습니다."); return this.bytes[this.pos++]; }
    readU16() { const v = (this.readU8() << 8) | this.readU8(); return v >>> 0; }
    readU32() { return (((this.readU8() << 24) >>> 0) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0; }
    readAscii(n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(this.readU8()); return s; }
    readBytes(n) {
      if (this.pos + n > this.bytes.length) throw new Error("파일 끝에 도달했습니다.");
      const out = this.bytes.slice(this.pos, this.pos + n);
      this.pos += n;
      return out;
    }
    readVarLen() { let v = 0; for (let i = 0; i < 4; i++) { const b = this.readU8(); v = (v << 7) | (b & 0x7f); if ((b & 0x80) === 0) return v; } return v; }
    skip(n) { this.pos = Math.min(this.bytes.length, this.pos + n); }
  }

  window.MabiMidi = { midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview };
})();
