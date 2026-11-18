(() => {
  "use strict";

  // MobiBard bundled 14-preset SoundFont mapping.
  // The bundled file is intentionally not GM-numbered: preset 0~13 are the
  // fourteen MobiBard instruments below. This mapper is used only while the
  // embedded default SoundFont is active. User-selected SF2/SF3/DLS files keep
  // the existing GM/bank assignment rules.
  const TARGETS = [
    { id: "piano", name: "Piano", preset: 0 },
    { id: "chalumeau", name: "Chalumeau", preset: 1 },
    { id: "flute", name: "Flute", preset: 2 },
    { id: "harp", name: "Harp", preset: 3 },
    { id: "lute", name: "Lute", preset: 4 },
    { id: "mandolin", name: "Mandolin", preset: 5 },
    { id: "violin", name: "Violin", preset: 6 },
    { id: "xylophone", name: "Xylophone", preset: 7 },
    { id: "musicBox", name: "MusicBox", preset: 8 },
    { id: "guitar", name: "Guitar", preset: 9 },
    { id: "harmonica", name: "Harmonica", preset: 10 },
    { id: "vocal", name: "Cat", preset: 11 },
    { id: "drum", name: "BigDrum", preset: 12 },
    { id: "metal", name: "Cymbals", preset: 13 },
  ].map((target, priority) => Object.freeze({
    ...target,
    priority,
    bank: 0,
    presetKey: `0:${target.preset}`,
  }));

  const targetById = new Map(TARGETS.map(target => [target.id, target]));
  const DEFAULT_TARGET = targetById.get("piano");

  // Programs are zero-based GM program numbers. Only presets 1~11 are used
  // for melodic instruments. Preset 12 is reserved for vocals, and presets
  // 13/14 are reserved for drum-channel membrane/metal percussion.
  const PROGRAM_RULES = [
    { target: "piano", ranges: [[0, 7], [16, 19]] },
    { target: "musicBox", programs: [8, 10, 112] },
    { target: "xylophone", programs: [9, 11, 12, 13, 14, 93, 108, 113, 114, 115] },
    { target: "mandolin", programs: [15, 45, 105, 106, 107] },
    { target: "harmonica", ranges: [[20, 23], [80, 83]] },
    { target: "lute", programs: [24, 104] },
    { target: "guitar", ranges: [[25, 39]], programs: [84, 87] },
    { target: "violin", ranges: [[40, 44], [48, 51], [88, 90], [92, 92], [94, 95]], programs: [55, 86, 110] },
    { target: "harp", programs: [46] },
    { target: "chalumeau", ranges: [[56, 71]], programs: [109, 111] },
    { target: "flute", ranges: [[72, 79]] },
  ];

  // Keep this aligned with Player's Vocal category. Name matching also catches
  // non-GM files whose program number is unhelpful but whose instrument label
  // clearly says voice/choir/vocal.
  const VOCAL_PROGRAMS = new Set([52, 53, 54, 85, 91, 101, 121, 123]);
  const VOCAL_NAME_RE = /(choir|chorus|voice|vocal|vocoder|aahs?|oohs?|sing|singer|chant|breath|bird|goblin|합창|보컬|목소리|코러스|성악|人声|人聲|合唱|ボーカル|コーラス|声)/i;

  // GM percussion notes that are reasonably represented by the dedicated
  // BigDrum preset. Other percussion notes deliberately fall back to Piano.
  const DRUM_NOTES = new Set([
    35, 36, 37, 38, 40, 41, 43, 45, 47, 48, 50,
    60, 61, 62, 63, 64, 65, 66, 78, 79,
  ]);

  // Metal percussion: hi-hats/cymbals/bells/cowbell/agogo/triangle and
  // tambourine/cabasa where the metallic component is the closest match.
  const METAL_NOTES = new Set([
    42, 44, 46, 49, 51, 52, 53, 54, 55, 56, 57, 59,
    67, 68, 69, 80, 81,
  ]);

  const programTargetIds = Array(128).fill("piano");
  for (const rule of PROGRAM_RULES) {
    if (!targetById.has(rule.target)) continue;
    for (const range of rule.ranges || []) {
      const start = Math.max(0, Math.min(127, Math.trunc(Number(range?.[0]))));
      const end = Math.max(start, Math.min(127, Math.trunc(Number(range?.[1]))));
      for (let program = start; program <= end; program++) programTargetIds[program] = rule.target;
    }
    for (const value of rule.programs || []) {
      const program = Math.trunc(Number(value));
      if (program >= 0 && program < 128) programTargetIds[program] = rule.target;
    }
  }

  function normalizeProgram(program) {
    const value = Math.trunc(Number(program));
    return Number.isInteger(value) && value >= 0 && value < 128 ? value : 0;
  }

  function isDrumGroup(group) {
    return Boolean(
      group?.isBeat
      || group?.isPercussion
      || group?.isDrumNoteGroup
      || Number.isInteger(group?.drumMidi)
      || Number(group?.channel) === 9
      || Number(group?.bank) === 128
    );
  }

  function isVocalGroup(group) {
    const program = normalizeProgram(group?.program ?? group?.preset);
    if (VOCAL_PROGRAMS.has(program)) return true;
    const name = String(
      group?.instrumentName
      || group?.programName
      || group?.programText
      || group?.name
      || ""
    ).trim();
    return Boolean(name && VOCAL_NAME_RE.test(name));
  }

  function resolveProgram(program, name = "") {
    const safeProgram = normalizeProgram(program);
    if (VOCAL_PROGRAMS.has(safeProgram) || (name && VOCAL_NAME_RE.test(String(name)))) {
      return targetById.get("vocal");
    }
    return targetById.get(programTargetIds[safeProgram]) || DEFAULT_TARGET;
  }

  function resolveDrumNote(note) {
    const value = Math.trunc(Number(note));
    if (DRUM_NOTES.has(value)) return targetById.get("drum");
    if (METAL_NOTES.has(value)) return targetById.get("metal");
    return DEFAULT_TARGET;
  }

  function resolveGroup(group) {
    if (!group || typeof group !== "object") return DEFAULT_TARGET;
    if (isDrumGroup(group)) {
      const drumNote = Number.isInteger(group.drumMidi)
        ? group.drumMidi
        : (Number.isFinite(Number(group.midi)) ? Math.trunc(Number(group.midi)) : null);
      return resolveDrumNote(drumNote);
    }
    if (isVocalGroup(group)) return targetById.get("vocal");
    return resolveProgram(group.program ?? group.preset, group.instrumentName || group.programName || group.programText || group.name || "");
  }

  function resolveRequest(request = {}) {
    const isDrum = Boolean(request.isDrum || request.isBeat || Number(request.bank) === 128 || Number(request.channel) === 9);
    if (isDrum) return resolveDrumNote(request.midi ?? request.drumMidi);
    return resolveProgram(request.program ?? request.preset, request.instrumentName || request.programName || request.programText || request.name || "");
  }

  // One MML part can contain multiple source instruments. Weight by note count
  // and use the earliest dedicated preset as a deterministic tie-breaker.
  function chooseTarget(groups) {
    const scores = new Map();
    for (const group of Array.isArray(groups) ? groups : []) {
      const target = resolveGroup(group);
      const noteCount = Number(group?.noteCount);
      const weight = Number.isFinite(noteCount) && noteCount > 0 ? noteCount : 1;
      const current = scores.get(target.id) || { target, weight: 0, largestGroup: 0 };
      current.weight += weight;
      current.largestGroup = Math.max(current.largestGroup, weight);
      scores.set(target.id, current);
    }
    return Array.from(scores.values()).sort((a, b) =>
      b.weight - a.weight
      || b.largestGroup - a.largestGroup
      || a.target.priority - b.target.priority
    )[0]?.target || DEFAULT_TARGET;
  }

  window.MobibardDefaultInstrumentMap = Object.freeze({
    version: "1.0.0",
    targets: Object.freeze(TARGETS),
    programRules: Object.freeze(PROGRAM_RULES),
    vocalPrograms: Object.freeze(Array.from(VOCAL_PROGRAMS)),
    drumNotes: Object.freeze(Array.from(DRUM_NOTES)),
    metalNotes: Object.freeze(Array.from(METAL_NOTES)),
    resolveProgram,
    resolveDrumNote,
    resolveGroup,
    resolveRequest,
    chooseTarget,
  });
})();
