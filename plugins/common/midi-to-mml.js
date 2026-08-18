(() => {
  "use strict";

  const tr = (key, values = []) => window.MobibardI18n?.t?.(key, values) || String(key);
  const fmt = value => Number(value || 0).toLocaleString(document.documentElement.lang || undefined);
  const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const { clampInt } = window.MabiUtils;
  const midiParser = window.MabiMidiParser;
  if (!midiParser) throw new Error("midi-parser.js must be loaded before midi-to-mml.js");
  const normalizeProgram = midiParser.normalizeProgram;
  const normalizeBank = midiParser.normalizeBank;
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];
  const MML_MIN_MIDI = 12; // O0C
  const MML_MAX_MIDI = 127; // O9G (MIDI maximum)

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
    if (midi.smpteDivision) throw new Error(tr("midi.err_smpte"));
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16;
    const warnings = [...midi.warnings];
    const unsupportedPitchCount = midi.notes.reduce((count, note) => count + (isMmlPitchSupported(note.midi) ? 0 : 1), 0);
    if (unsupportedPitchCount > 0) {
      warnings.push(tr("midi.warn_pitch_skipped", [fmt(unsupportedPitchCount), midiName(MML_MIN_MIDI), midiName(MML_MAX_MIDI)]));
    }
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid);
    const instrumentChoices = buildInstrumentChoices(sourceGroups);
    if (!instrumentChoices.length) throw new Error(tr("midi.err_no_notes"));
    return {
      fileName,
      format: midi.format,
      trackCount: midi.trackCount,
      ppq,
      noteCount: midi.notes.length,
      tempoCount: normalizeMidiTempos(midi.tempoEvents).length,
      warnings,
      unsupportedPitchCount,
      // 사용자 선택용: Track/Channel과 무관하게 실제 음색 Bank MSB/LSB + Program 조합을 하나의 선택지로 묶는다.
      // GM percussion Channel 10은 Drum Note까지 포함해 개별 타악기로 분리한다.
      instrumentGroups: instrumentChoices,
      instrumentChoices,
      // 내부 변환용: 원본 채널/Track 경계를 보존하며 완전 중복 병합 경계로만 사용한다.
      sourceInstrumentGroups: sourceGroups,
      channels: instrumentChoices
    };
  }

  function buildInstrumentSourceGroups(midi, ticksPerGrid, gridStep = 1) {
    const groups = new Map();
    for (const note of midi.notes) {
      if (!isMmlPitchSupported(note.midi)) continue;
      const groupInfo = getInstrumentGroupInfo(note);
      let group = groups.get(groupInfo.id);
      if (!group) {
        group = {
          id: groupInfo.id,
          choiceId: groupInfo.choiceId,
          channel: note.channel,
          trackIndex: note.trackIndex,
          partName: groupInfo.partName,
          bankMsb: groupInfo.bankMsb,
          bankLsb: groupInfo.bankLsb,
          program: groupInfo.program,
          drumMidi: groupInfo.drumMidi,
          isBeat: groupInfo.isBeat,
          isDrumNoteGroup: groupInfo.isDrumNoteGroup,
          instrumentName: groupInfo.instrumentName,
          displayName: groupInfo.displayName,
          programText: groupInfo.programText,
          programNumberText: groupInfo.programNumberText,
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

    // 선택한 양자화 격자 기준 완전 중복 수. 채널이 다른 같은 악기는 병합하지 않는다.
    const dupStats = new Map();
    for (const note of midi.notes) {
      if (!isMmlPitchSupported(note.midi)) continue;
      const groupInfo = getInstrumentGroupInfo(note);
      const startGrid = quantizeGridValue(note.startTick / ticksPerGrid, gridStep, 0);
      const durGrid = quantizeGridValue((note.endTick - note.startTick) / ticksPerGrid, gridStep, gridStep);
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
      rangeText: Number.isFinite(group.minMidi) ? `${midiName(group.minMidi)}~${midiName(group.maxMidi)}` : tr("ui.no_notes")
    }));
  }

  function buildInstrumentChoices(sourceGroups) {
    const choices = new Map();
    for (const group of sourceGroups || []) {
      const id = group.choiceId || instrumentChoiceId(
        group.bankMsb,
        group.bankLsb,
        group.program,
        group.isDrumNoteGroup,
        group.drumMidi
      );
      let choice = choices.get(id);
      if (!choice) {
        choice = {
          id,
          partName: "",
          bankMsb: normalizeBank(group.bankMsb),
          bankLsb: normalizeBank(group.bankLsb),
          program: normalizeProgram(group.program),
          drumMidi: Number.isInteger(group.drumMidi) ? group.drumMidi : null,
          isBeat: Boolean(group.isBeat),
          isDrumNoteGroup: Boolean(group.isDrumNoteGroup || Number.isInteger(group.drumMidi)),
          isPercussion: Boolean(group.isBeat),
          noteCount: 0,
          duplicateMerged: 0,
          minMidi: Infinity,
          maxMidi: -Infinity,
          sourceGroupIds: [],
          sourcePartNames: new Set(),
          instrumentNameCounts: new Map()
        };
        choices.set(id, choice);
      }
      choice.isBeat = choice.isBeat || Boolean(group.isBeat);
      choice.isPercussion = choice.isPercussion || Boolean(group.isBeat);
      choice.isDrumNoteGroup = choice.isDrumNoteGroup || Boolean(group.isDrumNoteGroup || Number.isInteger(group.drumMidi));
      const groupNoteCount = Number(group.noteCount) || 0;
      const instrumentName = cleanInstrumentName(group.instrumentName || group.programText || programName(choice.program));
      choice.instrumentNameCounts.set(instrumentName, (choice.instrumentNameCounts.get(instrumentName) || 0) + groupNoteCount);
      choice.noteCount += groupNoteCount;
      choice.duplicateMerged += Number(group.duplicateMerged) || 0;
      choice.minMidi = Math.min(choice.minMidi, group.minMidi);
      choice.maxMidi = Math.max(choice.maxMidi, group.maxMidi);
      choice.sourceGroupIds.push(group.id);
      if (group.partName) choice.sourcePartNames.add(group.partName);
    }

    return Array.from(choices.values()).map(choice => {
      const rangeText = Number.isFinite(choice.minMidi) ? `${midiName(choice.minMidi)}~${midiName(choice.maxMidi)}` : tr("ui.no_notes");
      const instrumentName = Array.from(choice.instrumentNameCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0]?.[0]
        || programName(choice.program);
      // Track 이름은 악기 식별/표시에 사용하지 않는다. 같은 Bank+Program은 파일 전체에서 정확히 한 항목으로 표시한다.
      const displayName = instrumentName;
      const bankText = `Bank ${choice.bankMsb}:${choice.bankLsb}`;
      const programNumberText = tr("midi.program_number", [choice.program + 1]);
      const programText = instrumentName;
      return {
        id: choice.id,
        partName: choice.partName,
        bankMsb: choice.bankMsb,
        bankLsb: choice.bankLsb,
        program: choice.program,
        drumMidi: choice.drumMidi,
        isBeat: choice.isBeat,
        isDrumNoteGroup: choice.isDrumNoteGroup,
        isPercussion: choice.isPercussion,
        instrumentName,
        displayName,
        programText,
        bankText,
        programNumberText,
        noteCount: choice.noteCount,
        duplicateMerged: choice.duplicateMerged,
        rangeText,
        sourceGroupIds: [...new Set(choice.sourceGroupIds)],
        defaultChecked: false,
        description: buildInstrumentGroupDescription({
          instrumentName,
          displayName,
          programText,
          bankText,
          programNumberText,
          noteCount: choice.noteCount,
          duplicateMerged: choice.duplicateMerged,
          rangeText,
          isBeat: choice.isBeat
        })
      };
    }).sort((a, b) => {
      if (a.isBeat !== b.isBeat) return a.isBeat ? 1 : -1;
      return a.bankMsb - b.bankMsb
        || a.bankLsb - b.bankLsb
        || a.program - b.program
        || (Number.isInteger(a.drumMidi) ? a.drumMidi : -1) - (Number.isInteger(b.drumMidi) ? b.drumMidi : -1)
        || a.instrumentName.localeCompare(b.instrumentName, "ko")
        || a.id.localeCompare(b.id);
    });
  }

  function buildInstrumentGroupDescription(group) {
    const chunks = [];
    chunks.push(group.displayName || instrumentDisplayName(group.instrumentName || group.programText, group.partName));
    if (group.bankText) chunks.push(group.bankText);
    if (group.programNumberText) chunks.push(group.programNumberText);
    chunks.push(tr("midi.note_count", [fmt(group.noteCount)]));
    if (group.duplicateMerged) chunks.push(tr("midi.dup_planned", [fmt(group.duplicateMerged)]));
    chunks.push(group.rangeText);
    return chunks.join(" · ");
  }

  function cleanInstrumentName(name) {
    return String(name || tr("snd.no_inst")).replace(new RegExp(`\\s*·\\s*${escapeRegExp(tr("ui.beat"))}\\s*$`, "i"), "").replace(/^\d+\.\s*/, "").trim() || tr("snd.no_inst");
  }

  function cleanInstrumentMetaName(name) {
    const text = String(name || "")
      .replace(/\0/g, " ")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || /^(?:track|part|instrument)\s*\d*$/i.test(text)) return "";
    return text.slice(0, 100);
  }

  function cleanPartName(name, trackIndex = 0) {
    const text = String(name || "")
      .replace(/\0/g, " ")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/(?:\s*[,;|])+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return (text || tr("midi.part_default", [Number(trackIndex) + 1])).slice(0, 100);
  }

  function identityText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}+#(). _-]+/gu, "")
      .trim()
      .slice(0, 100) || "unknown";
  }

  function instrumentDisplayName(instrumentName, partName) {
    const instrument = cleanInstrumentName(instrumentName || tr("snd.no_inst"));
    const part = String(partName || "").trim();
    if (!part || instrument.toLocaleLowerCase("ko-KR") === part.toLocaleLowerCase("ko-KR")) return instrument;
    return `${instrument} · ${part}`;
  }

  function instrumentChoiceId(bankMsb, bankLsb, program, isDrumNoteGroup = false, drumMidi = null) {
    const msb = normalizeBank(bankMsb);
    const lsb = normalizeBank(bankLsb);
    const programKey = normalizeProgram(program);
    if (isDrumNoteGroup && Number.isInteger(drumMidi)) {
      return `drum:bank:${msb}:${lsb}:program:${programKey}:note:${drumMidi}`;
    }
    return `inst:bank:${msb}:${lsb}:program:${programKey}`;
  }

  function getInstrumentGroupInfo(note) {
    const program = normalizeProgram(note.program);
    const bankMsb = normalizeBank(note.bankMsb);
    const bankLsb = normalizeBank(note.bankLsb);
    const partName = cleanPartName(note.trackName, note.trackIndex);
    const explicitInstrumentName = cleanInstrumentMetaName(note.instrumentMetaName);
    const names = [programName(program), explicitInstrumentName].filter(Boolean).join(" / ");
    const isBeat = note.channel === 9 || BEAT_PROGRAMS.has(program) || PERCUSSION_NAME_RE.test(names);
    if (note.channel === 9) {
      const drumName = GM_DRUM_NAMES[note.midi] || `Percussion ${note.midi}`;
      const choiceId = instrumentChoiceId(bankMsb, bankLsb, program, true, note.midi);
      return {
        id: `part:${identityText(partName)}:ch${note.channel}:bank:${bankMsb}:${bankLsb}:program:${program}:drum:${note.midi}`,
        choiceId,
        partName,
        bankMsb,
        bankLsb,
        program,
        drumMidi: note.midi,
        isBeat: true,
        isDrumNoteGroup: true,
        instrumentName: drumName,
        displayName: instrumentDisplayName(drumName, partName),
        programText: drumName,
        programNumberText: tr("midi.program_number", [program + 1])
      };
    }
    const instrumentName = explicitInstrumentName || programName(program);
    const choiceId = instrumentChoiceId(bankMsb, bankLsb, program, false, null);
    return {
      id: `part:${identityText(partName)}:ch${note.channel}:bank:${bankMsb}:${bankLsb}:program:${program}:beat:${isBeat ? 1 : 0}`,
      choiceId,
      partName,
      bankMsb,
      bankLsb,
      program,
      drumMidi: null,
      isBeat,
      isDrumNoteGroup: false,
      instrumentName,
      displayName: instrumentDisplayName(instrumentName, partName),
      programText: instrumentName,
      programNumberText: tr("midi.program_number", [program + 1])
    };
  }

  function isMmlPitchSupported(midi) {
    const value = Number(midi);
    return Number.isInteger(value) && value >= MML_MIN_MIDI && value <= MML_MAX_MIDI;
  }

  function midiName(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(midi / 12) - 1;
    return `${names[((midi % 12) + 12) % 12]}${octave}`;
  }

  function midiVelocityToMmlVolume(value) {
    const velocity = clampInt(Math.round(Number(value) || 0), 0, 127);
    if (velocity <= 0) return 0;
    if (velocity === 1) return 1;
    // MIDI velocity 2~127, 126개 값을 MML V2~V15의 14단계로 균등하게 나눈다.
    return clampInt(2 + Math.floor((velocity - 2) / 9), 2, 15);
  }

  function normalizeQuantizeDivision(value) {
    return Number(value) === 32 ? 32 : 64;
  }

  function quantizeGridStep(division) {
    return normalizeQuantizeDivision(division) === 32 ? 2 : 1;
  }

  function quantizeGridValue(value, step = 1, minimum = 0) {
    const unit = step === 2 ? 2 : 1;
    return Math.max(minimum, Math.round((Number(value) || 0) / unit) * unit);
  }

  function buildMidiInstrumentPreview(bytes, instrumentChoiceId, options = {}) {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error(tr("midi.err_smpte"));
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16;
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid);
    const instrumentGroups = buildInstrumentChoices(sourceGroups);
    const choiceMap = new Map(instrumentGroups.map(g => [g.id, g]));
    const choice = choiceMap.get(String(instrumentChoiceId || ""));
    if (!choice) throw new Error(tr("midi.err_no_preview_inst"));

    const sourceToChoice = new Map();
    for (const c of instrumentGroups) {
      for (const sourceId of c.sourceGroupIds || []) sourceToChoice.set(sourceId, c.id);
    }

    let nextNoteId = 1;
    const rawNotes = midi.notes
      .map(n => {
        if (!isMmlPitchSupported(n.midi)) return null;
        const sourceInfo = getInstrumentGroupInfo(n);
        const choiceId = sourceToChoice.get(sourceInfo.id) || sourceInfo.choiceId;
        if (choiceId !== choice.id) return null;
        const startGrid = Math.max(0, Math.round(n.startTick / ticksPerGrid));
        const durGrid = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerGrid));
        return {
          id: `preview-${nextNoteId++}`,
          midi: n.midi,
          startGrid,
          endGrid: startGrid + durGrid,
          durGrid,
          midiVelocity: clampInt(Math.round(n.velocity), 0, 127),
          velocity: midiVelocityToMmlVolume(n.velocity),
          channel: n.channel,
          program: normalizeProgram(n.program),
          bankMsb: normalizeBank(n.bankMsb),
          bankLsb: normalizeBank(n.bankLsb),
          instrumentGroupId: sourceInfo.id,
          instrumentChoiceId: choice.id,
          isBeat: Boolean(choice.isBeat || sourceInfo.isBeat),
          isPercussion: Boolean(choice.isBeat || sourceInfo.isBeat)
        };
      })
      .filter(Boolean);

    if (!rawNotes.length) throw new Error(tr("midi.err_no_preview_notes_selected"));

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
    if (!previewNotes.length) throw new Error(tr("midi.err_preview_silent"));

    const program = normalizeProgram(choice.program);
    const bankMsb = normalizeBank(choice.bankMsb);
    const bankLsb = normalizeBank(choice.bankLsb);
    const duration = previewNotes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
    return {
      instrumentId: choice.id,
      instrumentName: choice.instrumentName,
      isBeat: Boolean(choice.isBeat),
      program,
      bankMsb,
      bankLsb,
      notes: previewNotes,
      duration,
      firstGrid,
      noteCount: rawNotes.length
    };
  }

  function buildMidiFilePreview(bytes, options = {}) {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error(tr("midi.err_smpte"));
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
        midiVelocity: clampInt(Math.round(n.velocity), 0, 127),
        velocity: midiVelocityToMmlVolume(n.velocity),
        channel: n.channel,
        program: normalizeProgram(n.program),
        bankMsb: normalizeBank(n.bankMsb),
        bankLsb: normalizeBank(n.bankLsb),
        instrumentGroupId: sourceInfo.id,
        instrumentChoiceId: sourceInfo.choiceId,
        isBeat: Boolean(sourceInfo.isBeat),
        isPercussion: Boolean(sourceInfo.isBeat)
      };
    });
    if (!rawNotes.length) throw new Error(tr("midi.err_no_preview_notes"));

    const { notes } = mergeDuplicateGridNotes(rawNotes);
    notes.sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi || b.velocity - a.velocity);
    const firstGrid = Math.min(...notes.map(n => n.startGrid));
    const tempoGridEvents = normalizeGridTempos(normalizeMidiTempos(midi.tempoEvents).map(t => ({
      grid: Math.max(0, Math.round(t.tick / ticksPerGrid)),
      bpm: t.bpm
    })));
    const firstSec = gridToSeconds(firstGrid, tempoGridEvents);
    const maxSeconds = Math.max(5, Math.min(900, Number(options.maxSeconds ?? options.seconds ?? 45) || 45));
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
    if (!previewNotes.length) throw new Error(tr("midi.err_preview_silent"));

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
    if (midi.smpteDivision) throw new Error(tr("midi.err_smpte"));

    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16; // 내부 격자는 64분음표. 32분음표 모드는 2칸 단위로 스냅한다.
    const quantizeDivision = normalizeQuantizeDivision(options.quantizeDivision);
    const gridStep = quantizeGridStep(quantizeDivision);
    const warnings = [...midi.warnings];
    const unsupportedPitchCount = midi.notes.reduce((count, note) => count + (isMmlPitchSupported(note.midi) ? 0 : 1), 0);
    if (unsupportedPitchCount > 0) {
      warnings.push(tr("midi.warn_pitch_skipped", [fmt(unsupportedPitchCount), midiName(MML_MIN_MIDI), midiName(MML_MAX_MIDI)]));
    }
    const sourceGroups = buildInstrumentSourceGroups(midi, ticksPerGrid, gridStep);
    const instrumentGroups = buildInstrumentChoices(sourceGroups);
    const choiceMap = new Map(instrumentGroups.map(g => [g.id, g]));
    const sourceToChoice = new Map();
    for (const choice of instrumentGroups) {
      for (const sourceId of choice.sourceGroupIds || []) sourceToChoice.set(sourceId, choice.id);
    }
    const partCount = clampInt(options.partCount ?? (Array.isArray(options.exportChannels) ? options.exportChannels.length : 3), 1, 6);
    const exportChannels = normalizeExportChannels(options, partCount, instrumentGroups);
    const roles = exportChannels.map(ch => ch.role);
    const selectedSet = new Set(exportChannels.flatMap(ch => ch.selectedInstrumentGroups));

    const normalizedMidiTempos = normalizeMidiTempos(midi.tempoEvents);
    const tempoGridEvents = normalizeGridTempos(normalizedMidiTempos.map(t => ({
      grid: quantizeGridValue(t.tick / ticksPerGrid, gridStep, 0),
      bpm: t.bpm
    })));

    let nextNoteId = 1;
    const rawNotes = midi.notes
      .map(n => {
        if (!isMmlPitchSupported(n.midi)) return null;
        const sourceInfo = getInstrumentGroupInfo(n);
        const choiceId = sourceToChoice.get(sourceInfo.id) || sourceInfo.choiceId;
        const choice = choiceMap.get(choiceId);
        if (!selectedSet.has(choiceId)) return null;
        const startGrid = quantizeGridValue(n.startTick / ticksPerGrid, gridStep, 0);
        const durGrid = quantizeGridValue((n.endTick - n.startTick) / ticksPerGrid, gridStep, gridStep);
        return {
          id: `note-${nextNoteId++}`,
          midi: n.midi,
          startGrid,
          endGrid: startGrid + durGrid,
          durGrid,
          midiVelocity: clampInt(Math.round(n.velocity), 0, 127),
          velocity: midiVelocityToMmlVolume(n.velocity),
          channel: n.channel,
          trackIndex: n.trackIndex,
          program: normalizeProgram(n.program),
          bankMsb: normalizeBank(n.bankMsb),
          bankLsb: normalizeBank(n.bankLsb),
          // UI 선택은 악기명 기준이지만, 완전 중복 병합은 원본 연주 그룹 기준으로만 한다.
          instrumentGroupId: sourceInfo.id,
          instrumentChoiceId: choiceId,
          isBeat: Boolean(choice?.isBeat || sourceInfo.isBeat),
          isPercussion: Boolean(choice?.isBeat || sourceInfo.isBeat)
        };
      })
      .filter(Boolean);

    if (!rawNotes.length) throw new Error(tr("midi.err_selected_no_notes"));

    const { notes, mergedCount } = mergeDuplicateGridNotes(rawNotes);
    notes.sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi || b.velocity - a.velocity);

    const maxEndGrid = Math.max(0, ...notes.map(n => n.endGrid));
    const assignableNotes = notes.filter(note => exportChannels.some(ch => canChannelUseNote(note, ch)));
    const assignment = assignNotesToVoices(assignableNotes, exportChannels);
    const { voices, skipped, placed, overlapMerged } = assignment;
    const finalEndGrid = Math.max(maxEndGrid, ...voices.flatMap(v => v.map(n => n.endGrid || 0)), 0);
    const parts = voices.map((v, i) => voiceToMml64(v, i === 0 ? tempoGridEvents : [], i === 0 ? finalEndGrid : 0));
    const mml = `MML@${parts.join(",")};`;
    const totalUsed = voices.reduce((sum, v) => sum + v.length, 0);
    const message = tr("midi.convert_result_brief", [
      fmt(exportChannels.length),
      fmt(rawNotes.length),
      fmt(totalUsed),
      fmt(skipped)
    ]);
    return { mml, parts, message, warnings, selectedInstrumentGroups: Array.from(selectedSet), partCount: exportChannels.length, roles, exportChannels, skipped, unsupportedPitchCount, mergedCount, placed, overlapMerged, quantizeDivision };
  }

  function normalizeExportChannels(options, partCount, instrumentGroups) {
    const active = (instrumentGroups || []).filter(group => group.noteCount > 0);
    const validIds = new Set(active.map(group => group.id));
    const rawChannels = Array.isArray(options.exportChannels) ? options.exportChannels : null;
    const roles = normalizeRoles(options.roles, partCount);
    const globalSelected = normalizeSelectedInstrumentGroups(options.selectedInstrumentGroups, instrumentGroups);

    return Array.from({ length: partCount }, (_, i) => {
      const raw = rawChannels?.[i] || null;
      const role = normalizeExportRole(raw?.role || roles[i] || "auto");
      const selected = Array.isArray(raw?.selectedInstrumentGroups)
        ? raw.selectedInstrumentGroups.map(String).filter(id => validIds.has(id))
        : globalSelected.filter(id => validIds.has(id));
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
    const active = (groups || []).filter(group => group.noteCount > 0);
    const validIds = new Set(active.map(group => group.id));
    const list = Array.isArray(input) ? input.map(String).filter(id => validIds.has(id)) : [];
    return [...new Set(list)];
  }

  function normalizeRoles(input, partCount) {
    const defaults = defaultRoles(partCount);
    return Array.from({ length: partCount }, (_, i) => {
      const raw = Array.isArray(input) ? String(input[i] || defaults[i] || "auto") : (defaults[i] || "auto");
      return normalizeExportRole(raw);
    });
  }

  function normalizeExportRole(role) {
    const raw = String(role || "auto").toLowerCase();
    return ["auto", "high", "low"].includes(raw) ? raw : "auto";
  }

  function defaultRoles(partCount) {
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
        velocity: midiVelocityToMmlVolume(mergedMidiVelocity),
        durGrid: Math.max(1, n.endGrid - n.startGrid)
      };
    });
    const mergedCount = rawNotes.length - notes.length;
    return { notes, mergedCount };
  }

  function mergeMidiVelocity(values) {
    const nums = values.map(v => clampInt(Math.round(v), 0, 127));
    const max = Math.max(...nums);
    if (nums.length <= 1) return max;
    // 완전 중복은 대체로 제작/변환 과정의 중복이므로 과증폭하지 않고 약간만 보정한다.
    return clampInt(Math.round(max * (1 + 0.12 * Math.min(nums.length - 1, 4))), 0, 127);
  }

  function normalizeOverlapMergeMode(value) {
    if (value === true || value === "true") return "all";
    if (value === false || value === "false") return "none";
    const mode = String(value || "all").toLowerCase();
    return ["all", "half", "none"].includes(mode) ? mode : "all";
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
    const startupRoleContexts = buildStartupRoleContexts(notes, exportChannels);
    let i = 0;

    while (i < notes.length) {
      const startGrid = notes[i].startGrid;
      const group = [];
      while (i < notes.length && notes[i].startGrid === startGrid) group.push(notes[i++]);
      const remaining = group.filter(note => !usedNoteIds.has(note.id));
      const assignedChannels = new Set();

      // 1차: 정상 배치를 우선하되, 고음/저음 역할과 반대로 1옥타브를 초과해 튀는 노트는
      // 겹침 병합 허용 채널까지 포함해 더 가까운 성부가 있는지 먼저 비교한다.
      while (remaining.length) {
        const best = findBestNormalPlacement(remaining, exportChannels, voices, voiceEnd, assignedChannels, startGrid, startupRoleContexts);
        if (!best) break;
        const [chosen] = remaining.splice(best.noteIndex, 1);
        if (best.isMerge) {
          trimActiveNoteAt(voices[best.channelIndex], startGrid);
          voices[best.channelIndex].push(chosen);
          voices[best.channelIndex].sort((a, b) => a.startGrid - b.startGrid || a.endGrid - b.endGrid || a.midi - b.midi);
          voiceEnd[best.channelIndex] = Math.max(chosen.endGrid, getVoiceEnd(voices[best.channelIndex]));
          overlapMerged++;
        } else {
          voices[best.channelIndex].push(chosen);
          voiceEnd[best.channelIndex] = Math.max(voiceEnd[best.channelIndex], chosen.endGrid);
          placed++;
        }
        assignedChannels.add(best.channelIndex);
        usedNoteIds.add(chosen.id);
      }

      // 2차: 정상 배치가 불가능한 노트만 겹침 병합으로 구제한다.
      while (remaining.length) {
        const best = findBestOverlapMergePlacement(remaining, exportChannels, voices, assignedChannels, startGrid, startupRoleContexts);
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

  function findBestNormalPlacement(remaining, exportChannels, voices, voiceEnd, assignedChannels, startGrid, startupRoleContexts = null) {
    let best = null;
    const pitchSpread = getMelodicPitchSpread(remaining);
    for (let noteIndex = 0; noteIndex < remaining.length; noteIndex++) {
      const note = remaining[noteIndex];
      const normalCandidates = [];
      const mergeCandidates = [];
      for (let channelIndex = 0; channelIndex < exportChannels.length; channelIndex++) {
        if (assignedChannels.has(channelIndex)) continue;
        const cfg = exportChannels[channelIndex];
        if (!canChannelUseNote(note, cfg)) continue;

        if (voiceEnd[channelIndex] <= startGrid) {
          const referenceNote = findLastNoteBefore(voices[channelIndex], startGrid);
          normalCandidates.push({
            type: "normal",
            noteIndex,
            channelIndex,
            cfg,
            referenceNote,
            pitchDistance: notePitchDistance(note, referenceNote),
            playedLength: 0
          });
        } else {
          const mergeInfo = getOverlapMergeCandidateInfo(cfg, voices[channelIndex], startGrid);
          if (mergeInfo) {
            mergeCandidates.push({
              type: "merge",
              noteIndex,
              channelIndex,
              cfg,
              referenceNote: mergeInfo.active,
              pitchDistance: notePitchDistance(note, mergeInfo.active),
              playedLength: mergeInfo.playedLength
            });
          }
        }
      }

      const allCandidates = normalCandidates.concat(mergeCandidates);
      const nearestPitchDistance = nearestFinitePitchDistance(allCandidates);
      const guardedNormalDistance = nearestGuardedNormalDistance(note, normalCandidates, nearestPitchDistance, pitchSpread);
      const eligibleMergeCandidates = Number.isFinite(guardedNormalDistance)
        ? mergeCandidates.filter(candidate => Number.isFinite(candidate.pitchDistance) && candidate.pitchDistance < guardedNormalDistance)
        : [];
      const candidates = normalCandidates.concat(eligibleMergeCandidates);

      for (const candidate of candidates) {
        const isMerge = candidate.type === "merge";
        const score = channelNoteScore(note, candidate.cfg, candidate.channelIndex, {
          referenceNote: candidate.referenceNote,
          pitchDistance: candidate.pitchDistance,
          nearestPitchDistance,
          pitchSpread,
          isMerge,
          playedLength: candidate.playedLength,
          mergeAsNormalCandidate: isMerge,
          startupRoleContext: getStartupRoleContextForNote(note, startupRoleContexts)
        });
        const item = { noteIndex, channelIndex: candidate.channelIndex, score, isMerge };
        if (!best || compareScore(item.score, best.score) > 0) best = item;
      }
    }
    return best;
  }

  function findBestOverlapMergePlacement(remaining, exportChannels, voices, assignedChannels, startGrid, startupRoleContexts = null) {
    let best = null;
    const pitchSpread = getMelodicPitchSpread(remaining);
    for (let noteIndex = 0; noteIndex < remaining.length; noteIndex++) {
      const note = remaining[noteIndex];
      const candidates = [];
      for (let channelIndex = 0; channelIndex < exportChannels.length; channelIndex++) {
        if (assignedChannels.has(channelIndex)) continue;
        const cfg = exportChannels[channelIndex];
        if (!canChannelUseNote(note, cfg)) continue;
        const mergeInfo = getOverlapMergeCandidateInfo(cfg, voices[channelIndex], startGrid);
        if (!mergeInfo) continue;
        candidates.push({
          noteIndex,
          channelIndex,
          cfg,
          active: mergeInfo.active,
          playedLength: mergeInfo.playedLength,
          pitchDistance: notePitchDistance(note, mergeInfo.active)
        });
      }

      const nearestPitchDistance = nearestFinitePitchDistance(candidates);
      for (const candidate of candidates) {
        const score = channelNoteScore(note, candidate.cfg, candidate.channelIndex, {
          referenceNote: candidate.active,
          pitchDistance: candidate.pitchDistance,
          nearestPitchDistance,
          pitchSpread,
          isMerge: true,
          playedLength: candidate.playedLength,
          startupRoleContext: getStartupRoleContextForNote(note, startupRoleContexts)
        });
        const item = { noteIndex, channelIndex: candidate.channelIndex, score };
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


  function getOverlapMergeCandidateInfo(cfg, voice, startGrid) {
    const mergeMode = normalizeOverlapMergeMode(cfg?.overlapMergeMode ?? cfg?.overlapMerge);
    if (mergeMode === "none") return null;
    const active = findActiveNoteAt(voice, startGrid);
    if (!active) return null;
    if (mergeMode === "half" && !isPastOverlapMergeHalfPoint(active, startGrid)) return null;
    const activeStart = Number(active.startGrid);
    const playedLength = Math.max(0, startGrid - (Number.isFinite(activeStart) ? activeStart : startGrid));
    return { active, playedLength };
  }

  function canChannelUseNote(note, cfg) {
    if (!cfg) return false;
    const selected = cfg.selectedInstrumentGroups;
    if (!Array.isArray(selected) || !selected.length) return false;
    return selected.includes(note.instrumentChoiceId);
  }

  function getMelodicPitchSpread(notes) {
    const melodic = (notes || []).filter(n => !isBeatCandidate(n));
    const src = melodic.length ? melodic : (notes || []);
    let minMidi = Infinity;
    let maxMidi = -Infinity;
    for (const n of src) {
      const midi = Number(n?.midi);
      if (!Number.isFinite(midi)) continue;
      minMidi = Math.min(minMidi, midi);
      maxMidi = Math.max(maxMidi, midi);
    }
    if (!Number.isFinite(minMidi) || !Number.isFinite(maxMidi)) return { minMidi: 0, maxMidi: 0 };
    return { minMidi, maxMidi };
  }

  function buildStartupRoleContexts(notes, exportChannels) {
    const contexts = new Map();
    const melodicChannels = (exportChannels || [])
      .map((cfg, channelIndex) => ({ cfg, channelIndex }));
    if (!melodicChannels.length) return contexts;

    const instrumentIds = [...new Set((notes || [])
      .filter(n => !isBeatCandidate(n) && n?.instrumentChoiceId != null)
      .map(n => String(n.instrumentChoiceId)))]
      .filter(Boolean);

    for (const instrumentId of instrumentIds) {
      const channels = melodicChannels.filter(item => {
        const selected = item.cfg?.selectedInstrumentGroups;
        return Array.isArray(selected) && selected.map(String).includes(instrumentId);
      });
      const validChannelCount = channels.length;
      if (!validChannelCount) continue;

      const source = (notes || []).filter(n => !isBeatCandidate(n) && String(n.instrumentChoiceId) === instrumentId);
      if (!source.length) continue;

      // 도입부에서 모든 채널이 비어 있을 때는 선행 노트가 없으므로 고음/저음 기준이 사라진다.
      // 그래서 첫 발생 음부터 유효 채널 수만큼의 초기 노트 묶음을 보고,
      // 그 묶음 안의 최고음/최저음을 각각 고음/저음 역할의 초기 기준으로 쓴다.
      // 같은 시작점에 여러 음이 있으면 그 시작점의 음들은 통째로 포함해 성부 순서를 보존한다.
      const initialNotes = [];
      let idx = 0;
      while (idx < source.length && initialNotes.length < validChannelCount) {
        const start = source[idx].startGrid;
        while (idx < source.length && source[idx].startGrid === start) {
          initialNotes.push(source[idx++]);
        }
      }
      if (initialNotes.length < 2) continue;

      const spread = getMelodicPitchSpread(initialNotes);
      if (!(spread.maxMidi > spread.minMidi)) continue;
      contexts.set(instrumentId, {
        noteIds: new Set(initialNotes.map(n => n.id)),
        minMidi: spread.minMidi,
        maxMidi: spread.maxMidi,
        hasHigh: channels.some(item => item.cfg?.role === "high"),
        hasLow: channels.some(item => item.cfg?.role === "low"),
        hasAuto: channels.some(item => item.cfg?.role === "auto"),
        validChannelCount
      });
    }
    return contexts;
  }

  function getStartupRoleContextForNote(note, contexts) {
    if (!note || !contexts || typeof contexts.get !== "function") return null;
    return contexts.get(String(note.instrumentChoiceId)) || null;
  }

  function startupRoleSeedScore(note, role, referenceNote, context) {
    if (!context || referenceNote || !context.noteIds?.has(note?.id)) return 0;
    const noteMidi = Number(note?.midi);
    const minMidi = Number(context.minMidi);
    const maxMidi = Number(context.maxMidi);
    if (!Number.isFinite(noteMidi) || !Number.isFinite(minMidi) || !Number.isFinite(maxMidi) || maxMidi <= minMidi) return 0;

    const isHighEdge = noteMidi >= maxMidi;
    const isLowEdge = noteMidi <= minMidi;
    const pos = Math.max(0, Math.min(1, (noteMidi - minMidi) / (maxMidi - minMidi)));

    if (role === "high") {
      if (isHighEdge) return 30;
      // 자동 채널이 없는 2파트 구성에서는, 최고음이 아닌 초기음도 높은 쪽에 가까우면 약하게 받을 수 있게 한다.
      return context.hasAuto ? 0 : Math.round(pos * 10);
    }
    if (role === "low") {
      if (isLowEdge) return 30;
      return context.hasAuto ? 0 : Math.round((1 - pos) * 10);
    }
    if (role === "auto") {
      if ((isHighEdge && context.hasHigh) || (isLowEdge && context.hasLow)) return 0;
      return 20;
    }
    return 0;
  }

  function melodicRoleDirectionScore(note, role, pitchSpread) {
    if (role !== "high" && role !== "low") return 500;

    // 같은 시작 시점에 여러 음이 있으면 그 안에서 고/저 역할을 먼저 나눈다.
    // 단일 음처럼 비교 폭이 없을 때는 전체 곡 음역으로 억지 판정하지 않고 중립으로 둔다.
    // 그래야 고음/저음 채널의 입력 조건이 사실상 동률인 상황에서 선행 노트와 더 가까운 채널이 자연스럽게 가져간다.
    const minMidi = Number(pitchSpread?.minMidi);
    const maxMidi = Number(pitchSpread?.maxMidi);
    if (!Number.isFinite(minMidi) || !Number.isFinite(maxMidi) || maxMidi <= minMidi) return 500;

    const pos = Math.max(0, Math.min(1, ((Number(note.midi) || 0) - minMidi) / (maxMidi - minMidi)));
    return role === "high" ? Math.round(pos * 1000) : Math.round((1 - pos) * 1000);
  }

  function findLastNoteBefore(voice, grid) {
    for (let i = voice.length - 1; i >= 0; i--) {
      const n = voice[i];
      if (n.startGrid <= grid && n.endGrid <= grid) return n;
    }
    return null;
  }

  function notePitchDistance(note, referenceNote) {
    const noteMidi = Number(note?.midi);
    const referenceMidi = Number(referenceNote?.midi);
    if (!Number.isFinite(noteMidi) || !Number.isFinite(referenceMidi)) return null;
    return Math.abs(noteMidi - referenceMidi);
  }

  function nearestFinitePitchDistance(candidates) {
    let nearest = Infinity;
    for (const candidate of candidates || []) {
      const distance = candidate?.pitchDistance;
      if (Number.isFinite(distance)) nearest = Math.min(nearest, distance);
    }
    return Number.isFinite(nearest) ? nearest : null;
  }


  function nearestGuardedNormalDistance(note, normalCandidates, nearestPitchDistance, pitchSpread = null) {
    let nearest = Infinity;
    for (const candidate of normalCandidates || []) {
      if (!shouldRelaxRolePriority(note, candidate.cfg?.role, candidate.referenceNote, candidate.pitchDistance, nearestPitchDistance, pitchSpread)) continue;
      if (Number.isFinite(candidate.pitchDistance)) nearest = Math.min(nearest, candidate.pitchDistance);
    }
    return Number.isFinite(nearest) ? nearest : null;
  }

  function isReverseOctaveRoleJump(note, role, referenceNote) {
    const noteMidi = Number(note?.midi);
    const referenceMidi = Number(referenceNote?.midi);
    if (!Number.isFinite(noteMidi) || !Number.isFinite(referenceMidi)) return false;
    // 예: 고음 파트의 마지막 음이 F5라면 F4까지는 역할 우선 유지, E4 이하는 가까운 다른 채널을 먼저 찾는다.
    if (role === "high") return noteMidi < referenceMidi - 12;
    // 예: 저음 파트의 마지막 음이 E2라면 E3까지는 역할 우선 유지, F3 이상은 가까운 다른 채널을 먼저 찾는다.
    if (role === "low") return noteMidi > referenceMidi + 12;
    return false;
  }

  function isRoleEdgeNoteInPitchSpread(note, role, pitchSpread) {
    if (role !== "high" && role !== "low") return false;
    const noteMidi = Number(note?.midi);
    const minMidi = Number(pitchSpread?.minMidi);
    const maxMidi = Number(pitchSpread?.maxMidi);
    if (!Number.isFinite(noteMidi) || !Number.isFinite(minMidi) || !Number.isFinite(maxMidi) || maxMidi <= minMidi) return false;
    // 같은 시작 시점에 여러 음이 있으면 고음 파트는 그 묶음의 가장 높은 음,
    // 저음 파트는 가장 낮은 음을 먼저 가져가야 성부 순서가 뒤집히지 않는다.
    // 이 경우에는 직전 음과 1옥타브를 초과해 떨어져도 역할 우선권을 유지한다.
    if (role === "high") return noteMidi >= maxMidi;
    if (role === "low") return noteMidi <= minMidi;
    return false;
  }

  function shouldRelaxRolePriority(note, role, referenceNote, pitchDistance, nearestPitchDistance, pitchSpread = null) {
    if (isRoleEdgeNoteInPitchSpread(note, role, pitchSpread)) return false;
    if (!isReverseOctaveRoleJump(note, role, referenceNote)) return false;
    const distance = pitchDistance;
    const nearest = nearestPitchDistance;
    return Number.isFinite(distance) && Number.isFinite(nearest) && distance > nearest;
  }

  function channelNoteScore(note, cfg, channelIndex, options = {}) {
    const role = cfg?.role || "auto";
    const referenceNote = options.referenceNote || null;
    const playedLength = Math.max(0, Number(options.playedLength) || 0);
    const durGrid = note.durGrid || Math.max(1, note.endGrid - note.startGrid);

    // C4 같은 고정 옥타브 기준은 쓰지 않는다.
    // 고음/저음 역할은 성부 연속성보다 먼저 본다.
    // 같은 시작 시점에 여러 음이 있으면 그 안에서
    // 고음 채널은 더 높은 음, 저음 채널은 더 낮은 음을 우선한다.
    // 단일 음처럼 고/저 입력 조건이 동률이면 역할 방향 점수는 중립으로 두고 선행 노트 근접성을 우선한다.
    // 다만 단일 음이나 역할 끝점이 아닌 음이 역할 방향과 반대로 1옥타브를 초과해 튀는 경우에는,
    // 정상 배치 후보와 겹침 병합 허용 후보를 함께 보고 더 가까운 채널이 있으면 역할 우선권을 내려준다.
    // 같은 시작 시점의 최고음/최저음은 성부 순서 보존을 위해 이 완화에서 제외한다.
    // 예: 고음 F5 뒤의 F4까지는 고음 우선 유지, E4 이하는 더 가까운 후보를 먼저 본다.
    const optionPitchDistance = options.pitchDistance;
    const pitchDistance = Number.isFinite(optionPitchDistance)
      ? optionPitchDistance
      : notePitchDistance(note, referenceNote);
    const proximity = pitchDistance === null ? 0 : Math.max(0, 128 - Math.min(128, pitchDistance));
    const roleDirection = melodicRoleDirectionScore(note, role, options.pitchSpread);
    const startupRoleFit = startupRoleSeedScore(note, role, referenceNote, options.startupRoleContext);
    const relaxRolePriority = shouldRelaxRolePriority(note, role, referenceNote, pitchDistance, options.nearestPitchDistance, options.pitchSpread);
    // 고음/저음 역할은 자동보다 기본 우선권을 가진다.
    // 단, 역할 방향과 반대로 1옥타브를 초과해 튀고 더 가까운 후보가 있으면 우선권을 내려준다.
    // 이렇게 해야 중간 음역에서 자동 500점이 가까운 고음/저음 성부를 빼앗지 않는다.
    const roleTier = relaxRolePriority ? 0 : ((role === "high" || role === "low") ? 2 : 1);
    const effectiveRoleDirection = relaxRolePriority ? -1000 : roleDirection;
    const mergePlayed = options.isMerge ? playedLength : 0;

    if (options.isMerge && options.mergeAsNormalCandidate) {
      return [
        startupRoleFit,
        roleTier,
        effectiveRoleDirection,
        proximity,
        mergePlayed,
        note.velocity || 0,
        durGrid,
        -channelIndex
      ];
    }

    return options.isMerge ? [
      startupRoleFit,
      roleTier,
      effectiveRoleDirection,
      mergePlayed,
      proximity,
      note.velocity || 0,
      durGrid,
      -channelIndex
    ] : [
      startupRoleFit,
      roleTier,
      effectiveRoleDirection,
      proximity,
      note.velocity || 0,
      durGrid,
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

  function voiceToMml64(notes, tempoEvents = [], finalGrid = 0) {
    let out = "";
    let pos = 0;
    let octave = 4;
    let volume = 8;
    const playableNotes = Array.from(notes || []).filter(note => isMmlPitchSupported(note?.midi));
    const tempos = (tempoEvents && tempoEvents.length ? normalizeGridTempos(tempoEvents) : []).filter(t => t.grid <= Math.max(finalGrid, ...playableNotes.map(n => n.endGrid), 0));
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

    for (const n of playableNotes) {
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

  function programName(program) {
    const p = clampInt(program, 0, 127);
    return `${p + 1}. ${GM_PROGRAM_NAMES[p] || "Unknown"}`;
  }

  function parseMidiFile(bytes) {
    const parser = window.MabiMidiParser;
    if (!parser?.parse) throw new Error("공용 MIDI 파서를 불러오지 못했습니다.");
    return parser.parse(bytes, {
      type2Policy: "first-track",
      translate: tr,
    });
  }

  function normalizeMidiTempos(events) {
    const parser = window.MabiMidiParser;
    const normalized = parser?.normalizeTempoEvents
      ? parser.normalizeTempoEvents(events)
      : [...(events || [])].sort((left, right) => left.tick - right.tick);
    return normalized.map(event => ({
      tick: Math.max(0, Math.round(Number(event.tick) || 0)),
      bpm: clampInt(Math.round(Number(event.bpm) || 120), 32, 255),
    }));
  }

  window.MabiMidi = Object.freeze({ version: "5.0.0", midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview, parseMidiFile });
})();
