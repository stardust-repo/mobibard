(() => {
  "use strict";

  /*
   * MIDI 자동 음색 매핑 설정
   *
   * 악기를 추가하거나 대응 규칙을 바꿀 때는 이 파일의 세 구역만 수정한다.
   * 1) TARGETS: 마비노기에서 사용할 수 있는 악기와 대표 GM 프리셋
   * 2) PROGRAM_RULES: 일반 MIDI Program(0~127)을 TARGETS에 연결
   * 3) DRUM_NOTE_RULES: MIDI 10번 채널의 드럼 노트 번호를 TARGETS에 연결
   *
   * 규칙에 없는 Program/드럼 노트는 DEFAULT_TARGET_ID(피아노)를 사용한다.
   */

  const DEFAULT_TARGET_ID = "piano";

  // program은 MIDI 내부값(0~127)이다. 화면에 보이는 GM 번호는 program + 1이다.
  const TARGETS = [
    { id: "lute", name: "류트", bank: 0, program: 24 },                 // GM 25 Acoustic Guitar (nylon)
    { id: "mandolin", name: "만돌린", bank: 0, program: 105 },       // GM 106 Banjo
    { id: "folkGuitar", name: "포크 기타", bank: 0, program: 25 },   // GM 26 Acoustic Guitar (steel)
    { id: "flute", name: "플루트", bank: 0, program: 73 },           // GM 74 Flute
    { id: "chalumeau", name: "샬루모", bank: 0, program: 71 },       // GM 72 Clarinet
    { id: "harmonica", name: "하모니카", bank: 0, program: 22 },     // GM 23 Harmonica
    { id: "catHarmonica", name: "고양이의 하모니카", bank: 0, program: 53 }, // GM 54 Voice Oohs
    { id: "violin", name: "바이올린", bank: 0, program: 40 },         // GM 41 Violin
    { id: "piano", name: "피아노", bank: 0, program: 0 },            // GM 1 Acoustic Grand Piano
    { id: "drum", name: "북", bank: 0, program: 116 },               // GM 117 Taiko Drum
    { id: "cymbals", name: "심벌즈", bank: 0, program: 119 },        // GM 120 Reverse Cymbal
    { id: "xylophone", name: "실로폰", bank: 0, program: 13 },       // GM 14 Xylophone
    { id: "harp", name: "하프", bank: 0, program: 46 },              // GM 47 Orchestral Harp
    { id: "musicBox", name: "오르골", bank: 0, program: 10 }         // GM 11 Music Box
  ];

  /*
   * 일반 GM Program 매핑. ranges는 [시작, 끝] 모두 포함하며 0부터 센다.
   * 예: [0, 7]은 화면상의 GM 1~8이다.
   */
  const PROGRAM_RULES = [
    { target: "piano", ranges: [[0, 7], [16, 19]] },
    { target: "musicBox", programs: [8, 10, 14, 112] },
    { target: "xylophone", ranges: [[9, 9], [11, 13]], programs: [93, 108, 113, 114, 115] },
    { target: "mandolin", programs: [15, 45, 105, 106, 107] },
    { target: "harmonica", ranges: [[20, 23], [80, 83]] },
    { target: "lute", programs: [24, 104] },
    { target: "folkGuitar", ranges: [[25, 39]], programs: [84, 87] },
    { target: "violin", ranges: [[40, 44], [48, 51], [88, 90], [92, 92], [94, 95]], programs: [55, 86, 110] },
    { target: "harp", programs: [46] },
    { target: "drum", programs: [47, 116, 117, 118] },
    { target: "catHarmonica", ranges: [[52, 54]], programs: [85, 91, 111] },
    { target: "chalumeau", ranges: [[56, 71]], programs: [109] },
    { target: "flute", ranges: [[72, 79]] },
    { target: "cymbals", programs: [119] }
  ];

  /* MIDI 10번 채널의 GM 드럼 노트 매핑. 표준 범위 35~81을 모두 분류한다. */
  const DRUM_NOTE_RULES = [
    {
      target: "drum",
      notes: [35, 36, 37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 58, 60, 61, 62, 63, 64, 65, 66, 78, 79]
    },
    {
      target: "cymbals",
      notes: [42, 44, 46, 49, 51, 52, 53, 54, 55, 57, 59, 69, 70, 73, 74, 80, 81]
    },
    {
      target: "xylophone",
      notes: [56, 67, 68, 75, 76, 77]
    },
    {
      target: "flute",
      notes: [71, 72]
    }
  ];

  const targetById = new Map(TARGETS.map((target, priority) => [target.id, Object.freeze({
    ...target,
    priority,
    presetKey: `${target.bank}:${target.program}`
  })]));

  const defaultTarget = targetById.get(DEFAULT_TARGET_ID);
  if (!defaultTarget) throw new Error(`Unknown default MIDI sound target: ${DEFAULT_TARGET_ID}`);

  const programTargetIds = Array(128).fill(DEFAULT_TARGET_ID);
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

  const drumTargetIds = new Map();
  for (const rule of DRUM_NOTE_RULES) {
    if (!targetById.has(rule.target)) continue;
    for (const value of rule.notes || []) {
      const note = Math.trunc(Number(value));
      if (Number.isInteger(note)) drumTargetIds.set(note, rule.target);
    }
  }

  function resolveProgram(program) {
    const value = Number(program);
    if (!Number.isInteger(value) || value < 0 || value >= 128) return defaultTarget;
    return targetById.get(programTargetIds[value]) || defaultTarget;
  }

  function resolveDrumNote(note) {
    const value = Number(note);
    if (!Number.isInteger(value)) return defaultTarget;
    return targetById.get(drumTargetIds.get(value)) || defaultTarget;
  }

  function isDrumGroup(group) {
    return Boolean(
      group?.isDrumNoteGroup
      || Number.isInteger(group?.drumMidi)
      || (Number(group?.channel) === 9 && Number.isInteger(group?.midi))
    );
  }

  function resolveGroup(group) {
    if (!group || typeof group !== "object") return defaultTarget;
    if (isDrumGroup(group)) {
      const drumNote = Number.isInteger(group.drumMidi) ? group.drumMidi : group.midi;
      return resolveDrumNote(drumNote);
    }
    return resolveProgram(group.program ?? group.preset);
  }

  // 한 MML 채널에 여러 MIDI 악기가 들어오면 대상별 노트 수를 합산해 가장 큰 음색을 선택한다.
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
    )[0]?.target || defaultTarget;
  }

  window.MobibardInstrumentMap = Object.freeze({
    version: "1.0",
    defaultTargetId: DEFAULT_TARGET_ID,
    targets: Object.freeze(Array.from(targetById.values())),
    programRules: Object.freeze(PROGRAM_RULES),
    drumNoteRules: Object.freeze(DRUM_NOTE_RULES),
    resolveProgram,
    resolveDrumNote,
    resolveGroup,
    chooseTarget
  });
})();
