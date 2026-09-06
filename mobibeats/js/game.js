(() => {
  "use strict";

  const {
    clamp,
    clampInt,
    shortError,
    base64ToUint8Array,
    parseMabinogiMml,
    buildSchedule,
    composeMml,
    parseMidi: parseMidiDocument,
    normalizeMidiTempoEvents,
    parseSoundBank: parseSoundBankSource,
    loadDefaultSoundBank,
    findSoundBankPreset,
    prepareNotes,
    schedulePreparedNotes,
  } = window.MobiBeatsPlugins;

  const APP_VERSION = "5.3.0";
  const PART_LABELS = ["멜로디", "화음1", "화음2", "화음3", "화음4", "화음5"];
  const KEY_CONFIGS = {
    4: [
      { code: "KeyD", label: "D" },
      { code: "KeyF", label: "F" },
      { code: "KeyJ", label: "J" },
      { code: "KeyK", label: "K" }
    ],
    5: [
      { code: "KeyD", label: "D" },
      { code: "KeyF", label: "F" },
      { code: "Space", label: "SPACE" },
      { code: "KeyJ", label: "J" },
      { code: "KeyK", label: "K" }
    ],
    6: [
      { code: "KeyS", label: "S" },
      { code: "KeyD", label: "D" },
      { code: "KeyF", label: "F" },
      { code: "KeyJ", label: "J" },
      { code: "KeyK", label: "K" },
      { code: "KeyL", label: "L" }
    ]
  };
  const LANE_COLORS = ["#53d9ff", "#8d91ff", "#d778ff", "#ff72bd", "#ffb35e", "#67eea2"];
  const JUDGE_WINDOWS = Object.freeze({
    Perfect: 0.055,
    Great: 0.09,
    GoodEarly: 0.18,
    GoodLate: 0.26
  });
  const JUDGE_WEIGHTS = Object.freeze({ Perfect: 1.5, Great: 1, Good: 0.8, Miss: 0 });
  const LONG_NOTE_SCORE_MULTIPLIER = 2;
  const DIFFICULTY_LABELS = Object.freeze({ easy: "EASY", normal: "NORMAL", hard: "HARD" });
  const DIFFICULTY_PROFILES = Object.freeze({
    easy: { minGroupGap: 0.26, maxChord: 1, densityScale: 0.4 },
    normal: { minGroupGap: 0.17, maxChord: 2, densityScale: 0.62 },
    hard: { minGroupGap: 0, maxChord: 6, densityScale: 1 }
  });
  const NOTE_SPEEDS = [0.75, 1, 1.25, 1.5, 2];
  const LONG_NOTE_BEATS = 2;
  const LONG_RELEASE_GRACE = 0.12;
  const MISSED_NOTE_FALL_PX_PER_SEC = 360;
  const HIT_EFFECT_DURATION = 0.44;
  const HOLD_EFFECT_DURATION = 0.32;
  const LONG_COMPLETE_EFFECT_DURATION = 0.56;
  const MISS_EFFECT_DURATION = 0.22;
  const MAX_ACTIVE_HIT_EFFECTS = 6;
  const TAP_NOTE_HEIGHT_SCALE = 1.5;
  const COUNTDOWN_LEAD = 3.2;
  const RESUME_LEAD = 0.75;
  const AUDIO_LOOKAHEAD = 1.1;
  const AUDIO_INTERVAL_MS = 80;
  const DEFAULT_PRESET_KEY = "0:0";
  const NOTE_OFFSET_MIN_MS = -300;
  const NOTE_OFFSET_MAX_MS = 300;
  const STORAGE_KEY = "mml-rhythm-stage-score-v1";
  const OFFSET_STORAGE_KEY = "mml-rhythm-stage-note-offset-v1";
  const MESSAGE_LOAD_TYPES = new Set(["LOAD_RHYTHM_SCORE", "MML_RHYTHM_LOAD", "MML_RHYTHM_SCORE", "MML_RHYTHM_OPEN"]);
  const SAMPLE_SCORE = Object.freeze({
    title: "별빛 산책",
    mml: "MML@t144v12o5l8cdefgab>c4<bagfedc4e8g8>c8<g8e4d4c2,t144v9o4l4c2g2a2f2c2g2c1,t144v8o3l4e2d2c2a2g2e2c1,t144v10o2l4c2c2f2g2c2g2c1;",
    instruments: ["0:0", "0:48", "0:32", "0:11", "0:0", "0:0"]
  });

  const $ = (id) => document.getElementById(id);
  const dom = {
    app: $("app"),
    canvas: $("gameCanvas"),
    viewport: $("gameViewport"),
    laneKeys: $("laneKeys"),
    scoreInfoBtn: $("scoreInfoBtn"),
    pauseBtn: $("pauseBtn"),
    speedBtn: $("speedBtn"),
    speedValue: $("speedValue"),
    offsetBtn: $("offsetBtn"),
    offsetValue: $("offsetValue"),
    volumeSlider: $("volumeSlider"),
    volumeValue: $("volumeValue"),
    fullscreenBtn: $("fullscreenBtn"),
    closeBtn: $("closeBtn"),
    hudSongTitle: $("hudSongTitle"),
    hudChartInfo: $("hudChartInfo"),
    scoreValue: $("scoreValue"),
    progressFill: $("progressFill"),
    currentTime: $("currentTime"),
    totalTime: $("totalTime"),
    comboDisplay: $("comboDisplay"),
    comboValue: $("comboValue"),
    judgementDisplay: $("judgementDisplay"),
    judgementText: $("judgementText"),
    judgementOffset: $("judgementOffset"),
    countdownDisplay: $("countdownDisplay"),
    audioStatus: $("audioStatus"),
    startOverlay: $("startOverlay"),
    startTitle: $("startTitle"),
    startSubtitle: $("startSubtitle"),
    difficultyControl: $("difficultyControl"),
    keyModeControl: $("keyModeControl"),
    startKeyMode: $("startKeyMode"),
    startNoteCount: $("startNoteCount"),
    startLongCount: $("startLongCount"),
    startLevel: $("startLevel"),
    startDuration: $("startDuration"),
    startChannelCount: $("startChannelCount"),
    startKeyGuide: $("startKeyGuide"),
    startStatus: $("startStatus"),
    startBtn: $("startBtn"),
    startInfoBtn: $("startInfoBtn"),
    helpBtn: $("helpBtn"),
    pauseOverlay: $("pauseOverlay"),
    resumeBtn: $("resumeBtn"),
    restartBtn: $("restartBtn"),
    pauseInfoBtn: $("pauseInfoBtn"),
    quitBtn: $("quitBtn"),
    resultOverlay: $("resultOverlay"),
    resultRank: $("resultRank"),
    resultScore: $("resultScore"),
    resultPerfect: $("resultPerfect"),
    resultGreat: $("resultGreat"),
    resultGood: $("resultGood"),
    resultMiss: $("resultMiss"),
    resultCombo: $("resultCombo"),
    resultAccuracy: $("resultAccuracy"),
    resultMessage: $("resultMessage"),
    retryBtn: $("retryBtn"),
    resultInfoBtn: $("resultInfoBtn"),
    resultCloseBtn: $("resultCloseBtn"),
    scoreDialog: $("scoreDialog"),
    scoreForm: $("scoreForm"),
    songTitleInput: $("songTitleInput"),
    mmlInput: $("mmlInput"),
    instrumentRows: $("instrumentRows"),
    scoreChannelCount: $("scoreChannelCount"),
    allPianoBtn: $("allPianoBtn"),
    defaultInstrumentsBtn: $("defaultInstrumentsBtn"),
    soundBankState: $("soundBankState"),
    scoreParseStatus: $("scoreParseStatus"),
    loadSampleBtn: $("loadSampleBtn"),
    applyScoreBtn: $("applyScoreBtn"),
    offsetDialog: $("offsetDialog"),
    offsetForm: $("offsetForm"),
    noteOffsetSlider: $("noteOffsetSlider"),
    offsetDialogValue: $("offsetDialogValue"),
    helpDialog: $("helpDialog"),
    toast: $("toast")
  };

  const ctx2d = dom.canvas.getContext("2d", { alpha: false });
  const hitEffectSpriteCache = new Map();
  const state = {
    title: SAMPLE_SCORE.title,
    sourceType: "mml",
    sourceMetadata: null,
    mml: SAMPLE_SCORE.mml,
    instruments: [...SAMPLE_SCORE.instruments],
    instrumentBaseline: [...SAMPLE_SCORE.instruments],
    parsed: null,
    schedule: null,
    activeParts: [],
    keyCount: 4,
    keyConfig: KEY_CONFIGS[4],
    difficulty: "normal",
    chartNotes: [],
    laneNotes: [],
    chartDropped: 0,
    chartLevel: 1,
    maxRawScore: 1,
    status: "ready",
    speedIndex: 1,
    volume: 1,
    noteOffsetMs: 0,
    score: 0,
    rawScore: 0,
    combo: 0,
    maxCombo: 0,
    counts: { Perfect: 0, Great: 0, Good: 0, Miss: 0 },
    nextMissIndex: 0,
    laneCursor: [],
    lanePressed: [],
    heldLongByLane: [],
    pointerLanes: new Map(),
    effects: [],
    audioCtx: null,
    masterGain: null,
    soundFont: null,
    soundFontPromise: null,
    soundFontError: null,
    presetOptions: [],
    preparedAudioNotes: null,
    audioGainScale: 1,
    audioMode: "loading",
    songStartCtxTime: 0,
    pauseSongTime: 0,
    activeSources: [],
    scheduledAudioIds: new Set(),
    schedulerTimer: 0,
    animationFrame: 0,
    lastFrameTime: 0,
    previousFrameTimestampMs: 0,
    frameDeltaEma: 1 / 60,
    effectQuality: 1,
    canvasWidth: 0,
    canvasHeight: 0,
    canvasDpr: 1,
    stars: createStars(92),
    toastTimer: 0,
    judgementTimer: 0,
    comboTimer: 0,
    audioStatusTimer: 0,
    resumeAfterDialog: false,
    scoreDialogApplied: false,
    scoreDialogOpenedFromPause: false,
    embedded: window.parent !== window,
    pendingStart: false,
    countdownLabel: "",
    dialogDraftInstruments: null,
    dialogDefaultInstruments: [...SAMPLE_SCORE.instruments],
    dialogParseTimer: 0
  };

  function init() {
    if (state.embedded) document.documentElement.classList.add("embedded");
    bindEvents();
    renderInstrumentRows(state.instruments);
    setVolume(state.volume);
    state.noteOffsetMs = readSavedNoteOffset();
    setNoteOffsetMs(state.noteOffsetMs, { persist: false });
    updateSpeedUi();
    resizeCanvas();
    prewarmHitEffectSprites();

    const saved = readSavedScore();
    const initial = saved || SAMPLE_SCORE;
    try {
      applyScoreData(initial, { persist: false, source: saved ? "saved" : "sample" });
    } catch (err) {
      setStartError(shortError(err));
      applyScoreData(SAMPLE_SCORE, { persist: false, source: "sample" });
    }

    state.soundFontPromise = loadSoundFont();
    state.animationFrame = requestAnimationFrame(frameLoop);
    announceReady();
  }

  function bindEvents() {
    dom.startBtn.addEventListener("click", () => void startGame());
    dom.retryBtn.addEventListener("click", () => void startGame());
    dom.resumeBtn.addEventListener("click", () => void resumeGame());
    dom.restartBtn.addEventListener("click", () => void startGame());
    dom.quitBtn.addEventListener("click", returnToStart);
    dom.resultCloseBtn.addEventListener("click", returnToStart);
    dom.pauseBtn.addEventListener("click", togglePause);

    dom.scoreInfoBtn.addEventListener("click", openScoreDialog);
    dom.startInfoBtn.addEventListener("click", openScoreDialog);
    dom.pauseInfoBtn.addEventListener("click", openScoreDialog);
    dom.resultInfoBtn.addEventListener("click", openScoreDialog);
    dom.helpBtn.addEventListener("click", openHelpDialog);

    dom.speedBtn.addEventListener("click", cycleNoteSpeed);
    dom.offsetBtn?.addEventListener("click", openOffsetDialog);
    dom.volumeSlider.addEventListener("input", () => setVolume(Number(dom.volumeSlider.value) / 100));
    dom.difficultyControl?.addEventListener("click", onDifficultyControlClick);
    dom.keyModeControl?.addEventListener("click", onKeyModeControlClick);
    dom.fullscreenBtn.addEventListener("click", toggleFullscreen);
    dom.closeBtn.addEventListener("click", closeRhythmGame);

    dom.scoreForm.addEventListener("submit", onScoreFormSubmit);
    dom.offsetForm?.addEventListener("submit", onOffsetFormSubmit);
    dom.noteOffsetSlider?.addEventListener("input", updateOffsetDialogPreview);
    dom.offsetDialog?.querySelectorAll("[data-offset-adjust], [data-offset-value]").forEach((button) => {
      button.addEventListener("click", onOffsetQuickAction);
    });
    dom.loadSampleBtn.addEventListener("click", () => populateScoreForm(SAMPLE_SCORE, { useAsDefault: true }));
    dom.allPianoBtn?.addEventListener("click", () => setInstrumentRowsValues(Array(6).fill(DEFAULT_PRESET_KEY)));
    dom.defaultInstrumentsBtn?.addEventListener("click", () => setInstrumentRowsValues(state.dialogDefaultInstruments || state.instrumentBaseline));
    dom.mmlInput?.addEventListener("input", scheduleDialogMmlInspection);

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = $(button.dataset.closeDialog);
        if (dialog?.open) dialog.close("cancel");
      });
    });

    dom.scoreDialog.addEventListener("close", () => onDialogClosed(dom.scoreDialog));
    dom.offsetDialog?.addEventListener("close", () => onDialogClosed(dom.offsetDialog));
    dom.helpDialog.addEventListener("close", () => onDialogClosed(dom.helpDialog));
    dom.scoreDialog.addEventListener("cancel", () => { state.scoreDialogApplied = false; });

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("message", onParentMessage);
    document.addEventListener("fullscreenchange", updateFullscreenUi);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && isRunning()) pauseGame(false);
    });

    dom.canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    dom.canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    dom.canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
    dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function applyScoreData(input, options = {}) {
    const normalized = normalizeScorePayload(input);
    const score = normalized.sourceType === "midi"
      ? buildMidiScore(normalized)
      : buildMmlScore(normalized);
    const { parsed, schedule, activeParts } = score;

    if (!activeParts.length) throw new Error("소리 나는 음표가 있는 연주 채널이 없습니다.");
    const suggestedKeyCount = activeParts.length >= 5 ? 6 : 4;
    const keyCount = normalizeKeyCount(normalized.keyCount, suggestedKeyCount);
    const difficulty = normalizeDifficulty(normalized.difficulty, "normal");
    const chart = buildChart(schedule.notes, activeParts, keyCount, schedule.duration, difficulty);
    if (!chart.notes.length) throw new Error("게임에 사용할 수 있는 노트를 만들지 못했습니다.");

    stopGameAudio();
    state.title = score.title || normalized.title || "제목 없는 곡";
    state.sourceType = normalized.sourceType;
    state.sourceMetadata = score.sourceMetadata || null;
    state.mml = normalized.sourceType === "mml" ? normalized.mml : "";
    state.instruments = normalizeInstrumentList(score.instruments || normalized.instruments);
    if (options.updateInstrumentBaseline !== false && options.source !== "dialog") {
      state.instrumentBaseline = [...state.instruments];
    }
    state.parsed = parsed;
    state.schedule = schedule;
    state.activeParts = activeParts;
    state.keyCount = keyCount;
    state.keyConfig = KEY_CONFIGS[keyCount];
    state.difficulty = difficulty;
    if (normalized.noteOffsetMs != null) state.noteOffsetMs = normalized.noteOffsetMs;
    updateNoteOffsetUi();
    applyChartResult(chart);
    state.preparedAudioNotes = null;
    state.status = "ready";
    state.pauseSongTime = 0;
    resetGameStats();
    renderLaneKeys();
    updateAllUi();
    renderInstrumentRows(state.instruments);
    showOverlay(dom.startOverlay);
    hideOverlay(dom.pauseOverlay);
    hideOverlay(dom.resultOverlay);

    // MIDI 바이트를 localStorage에 중복 저장하지 않는다. MML 입력만 기존 방식으로 보존한다.
    if (options.persist !== false && state.sourceType === "mml") saveScore();

    if (options.source === "message") {
      postToParent("MML_RHYTHM_LOADED", {
        version: APP_VERSION,
        sourceType: state.sourceType,
        title: state.title,
        channelCount: state.activeParts.length,
        keyCount: state.keyCount,
        difficulty: state.difficulty,
        noteOffsetMs: state.noteOffsetMs,
        noteCount: state.chartNotes.length,
        longNoteCount: state.chartNotes.filter((note) => note.isLong).length
      });
    }
    return getPublicChartInfo();
  }

  function buildMmlScore(normalized) {
    const parsed = parseMabinogiMml(normalized.mml);
    const schedule = buildSchedule(parsed);
    const activeParts = parsed.parts
      .map((part, index) => ({ index, noteCount: part.notes.filter((note) => note.volume > 0).length }))
      .filter((part) => part.noteCount > 0)
      .map((part) => part.index);
    return {
      title: normalized.title,
      parsed,
      schedule,
      activeParts,
      instruments: normalized.instruments,
      sourceMetadata: null
    };
  }

  function buildMidiScore(normalized) {
    const midi = parseMidiDocument(normalized.midiBytes, { type2Policy: "all", closeOpenNotes: true });
    if (midi.smpteDivision) throw new Error("SMPTE 시간 분할 MIDI는 리듬 게임으로 불러올 수 없습니다.");
    if (!midi.notes?.length) throw new Error("MIDI에서 소리 나는 음표를 찾지 못했습니다.");

    const ppq = Math.max(1, Number(midi.ppq) || 480);
    const grouped = new Map();
    for (const note of midi.notes) {
      if (!note || note.velocity <= 0 || note.endTick <= note.startTick) continue;
      const isDrum = Number(note.channel) === 9;
      const bank = isDrum ? 128 : clampInt(Number(note.bank ?? 0), 0, 16383);
      const program = isDrum ? 0 : clampInt(Number(note.program ?? 0), 0, 127);
      const key = `${bank}:${program}`;
      let group = grouped.get(key);
      if (!group) {
        group = { key, bank, program, isDrum, notes: [], firstTick: note.startTick };
        grouped.set(key, group);
      }
      group.notes.push(note);
      group.firstTick = Math.min(group.firstTick, note.startTick);
    }
    const groups = [...grouped.values()];
    if (!groups.length) throw new Error("MIDI에서 재생 가능한 음표를 찾지 못했습니다.");

    // MobiBeats는 최대 6파트이므로 음표 수가 많은 음색을 우선 독립 파트로 유지한다.
    // 나머지 음색은 음표 수가 가장 적은 파트에 병합하되 MIDI 음표와 타이밍은 모두 보존한다.
    const primaryGroups = groups
      .slice()
      .sort((left, right) => right.notes.length - left.notes.length || left.firstTick - right.firstTick || left.key.localeCompare(right.key))
      .slice(0, 6);
    const partLoads = Array(primaryGroups.length).fill(0);
    const groupPart = new Map();
    primaryGroups.forEach((group, part) => {
      groupPart.set(group.key, part);
      partLoads[part] = group.notes.length;
    });
    for (const group of groups) {
      if (groupPart.has(group.key)) continue;
      let targetPart = 0;
      for (let part = 1; part < partLoads.length; part++) {
        if (partLoads[part] < partLoads[targetPart]) targetPart = part;
      }
      groupPart.set(group.key, targetPart);
      partLoads[targetPart] += group.notes.length;
    }

    const lengthBeats = Math.max(0, Number(midi.durationTicks) || 0) / ppq;
    const parts = Array.from({ length: 6 }, (_, part) => ({ notes: [], rests: [], tempos: [], lengthBeats: part < primaryGroups.length ? lengthBeats : 0 }));
    for (const group of groups) {
      const part = groupPart.get(group.key) ?? 0;
      for (const note of group.notes) {
        parts[part].notes.push({
          part,
          beat: Math.max(0, Number(note.startTick) || 0) / ppq,
          duration: Math.max(1, Number(note.endTick) - Number(note.startTick)) / ppq,
          midi: clampInt(Number(note.midi ?? note.pitch), 0, 127),
          volume: clampInt(Math.ceil((Number(note.velocity) || 1) / 127 * 15), 1, 15),
          sourceStart: -1,
          sourceEnd: -1,
          globalSourceStart: -1,
          globalSourceEnd: -1,
          sourceRanges: []
        });
      }
      parts[part].notes.sort((left, right) => left.beat - right.beat || left.midi - right.midi);
    }

    const tempoEvents = normalizeMidiTempoEvents(midi.tempoEvents);
    const tempos = tempoEvents.map((tempo, order) => ({
      beat: Math.max(0, Number(tempo.tick) || 0) / ppq,
      bpm: Math.max(1, Number(tempo.bpm) || 120),
      part: -1,
      order,
      explicit: true,
      sourceStart: -1,
      sourceEnd: -1,
      globalSourceStart: -1,
      globalSourceEnd: -1
    }));
    const parsed = { parts, tempos };
    const schedule = buildSchedule(parsed);
    const activeParts = parts
      .map((part, index) => ({ index, noteCount: part.notes.length }))
      .filter((part) => part.noteCount > 0)
      .map((part) => part.index);
    const inferredInstruments = Array(6).fill(DEFAULT_PRESET_KEY);
    primaryGroups.forEach((group, part) => { inferredInstruments[part] = `${group.bank}:${group.program}`; });
    const trackTitle = midi.trackMeta?.map((meta) => String(meta?.trackName || "").trim()).find(Boolean) || "";

    return {
      title: normalized.titleWasExplicit ? normalized.title : (trackTitle || normalized.title),
      parsed,
      schedule,
      activeParts,
      instruments: normalized.instrumentsWereExplicit ? normalized.instruments : inferredInstruments,
      sourceMetadata: {
        format: midi.format,
        ppq,
        trackCount: midi.trackCount,
        noteCount: midi.notes.length,
        tempoCount: tempoEvents.length,
        warnings: [...(midi.warnings || [])],
        macBinary: Boolean(midi.metadata?.macBinary),
        mergedInstrumentGroupCount: Math.max(0, groups.length - primaryGroups.length)
      }
    };
  }

  function normalizeScorePayload(input) {
    const outer = input && typeof input === "object" ? input : {};
    const source = outer.payload && typeof outer.payload === "object" ? outer.payload : outer;
    const titleWasExplicit = source.title != null || source.name != null;
    const instrumentsWereExplicit = Array.isArray(source.instruments);
    const midiSource = source.midiBytes ?? source.midiBuffer ?? source.midiData ?? source.midi;
    const midiBytes = normalizeMidiBytes(midiSource);
    let mml = String(source.mml || "").trim();
    let instruments = instrumentsWereExplicit ? source.instruments : null;

    if (Array.isArray(source.parts)) {
      const rawParts = source.parts.slice(0, 6).map((part) => {
        if (typeof part === "string") return part;
        return String(part?.mml ?? part?.text ?? "");
      });
      while (rawParts.length < 6) rawParts.push("");
      if (!mml) mml = composeMml(rawParts, { preserveEmpty: true, partCount: 6 });
      if (!instruments) {
        instruments = source.parts.slice(0, 6).map((part) => {
          if (!part || typeof part === "string") return DEFAULT_PRESET_KEY;
          return part.instrument ?? part.presetKey ?? part.program ?? DEFAULT_PRESET_KEY;
        });
      }
    }

    const sourceType = midiBytes?.length ? "midi" : "mml";
    if (sourceType === "mml") {
      if (!mml) throw new Error("MML이 비어 있습니다.");
      if (!/^\s*MML\s*@/i.test(mml)) mml = `MML@${mml.replace(/;\s*$/, "")};`;
      if (!/;\s*$/.test(mml)) mml += ";";
    }

    return {
      sourceType,
      title: String(source.title || source.name || "제목 없는 곡").trim().slice(0, 80),
      titleWasExplicit,
      mml,
      midiBytes,
      instruments: normalizeInstrumentList(instruments),
      instrumentsWereExplicit,
      keyCount: normalizeKeyCount(source.keyCount ?? source.keys, null),
      difficulty: normalizeDifficulty(source.difficulty ?? source.levelMode, null),
      noteOffsetMs: source.noteOffsetMs != null || source.noteOffset != null
        ? normalizeNoteOffsetMs(source.noteOffsetMs ?? source.noteOffset)
        : null
    };
  }

  function normalizeMidiBytes(value) {
    if (value == null) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return null;
      const payload = text.includes(",") && /^data:/i.test(text) ? text.slice(text.indexOf(",") + 1) : text;
      try { return base64ToUint8Array(payload); }
      catch (_) { throw new Error("MIDI Base64 데이터가 올바르지 않습니다."); }
    }
    throw new Error("지원하지 않는 MIDI 데이터 형식입니다.");
  }

  function normalizeKeyCount(value, fallback = 4) {
    const parsed = Number(value);
    if ([4, 5, 6].includes(parsed)) return parsed;
    return fallback == null ? null : ([4, 5, 6].includes(Number(fallback)) ? Number(fallback) : 4);
  }

  function normalizeDifficulty(value, fallback = "normal") {
    const key = String(value ?? "").trim().toLowerCase();
    if (key in DIFFICULTY_LABELS) return key;
    return fallback == null ? null : (String(fallback).toLowerCase() in DIFFICULTY_LABELS ? String(fallback).toLowerCase() : "normal");
  }

  function normalizeNoteOffsetMs(value, fallback = 0) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
    return clampInt(Math.round(base / 5) * 5, NOTE_OFFSET_MIN_MS, NOTE_OFFSET_MAX_MS);
  }

  function applyChartResult(chart) {
    state.chartNotes = chart.notes;
    state.laneNotes = chart.laneNotes;
    state.chartDropped = chart.dropped;
    state.chartLevel = chart.level;
    state.maxRawScore = chart.maxRawScore;
  }

  function rebuildChart(options = {}) {
    if (!state.schedule || !state.activeParts.length) return null;
    const chart = buildChart(
      state.schedule.notes,
      state.activeParts,
      state.keyCount,
      state.schedule.duration,
      state.difficulty
    );
    if (!chart.notes.length) throw new Error("선택한 설정으로 게임 노트를 만들지 못했습니다.");
    stopGameAudio();
    applyChartResult(chart);
    state.keyConfig = KEY_CONFIGS[state.keyCount];
    state.status = "ready";
    state.pauseSongTime = 0;
    resetGameStats();
    renderLaneKeys();
    updateAllUi();
    if (options.persist !== false) saveScore();
    return getPublicChartInfo();
  }

  function parseInstrumentKey(value) {
    const [bankText, programText] = normalizeInstrumentKey(value).split(":");
    return [Number(programText) || 0, Number(bankText) || 0];
  }

  function normalizeInstrumentList(input) {
    const list = Array.isArray(input) ? input.slice(0, 6) : [];
    while (list.length < 6) list.push(DEFAULT_PRESET_KEY);
    return list.map(normalizeInstrumentKey);
  }

  function normalizeInstrumentKey(value) {
    if (typeof value === "number") return `0:${clampInt(value, 0, 127)}`;
    if (value && typeof value === "object") {
      if (typeof value.key === "string") return normalizeInstrumentKey(value.key);
      const bank = clampInt(Number(value.bank ?? 0), 0, 16383);
      const preset = clampInt(Number(value.preset ?? value.program ?? 0), 0, 127);
      return `${bank}:${preset}`;
    }
    const text = String(value ?? DEFAULT_PRESET_KEY).trim();
    if (/^\d{1,3}$/.test(text)) return `0:${clampInt(Number(text), 0, 127)}`;
    const match = text.match(/^(\d{1,5}):(\d{1,3})$/);
    if (!match) return DEFAULT_PRESET_KEY;
    return `${clampInt(Number(match[1]), 0, 16383)}:${clampInt(Number(match[2]), 0, 127)}`;
  }

  function buildChart(scheduleNotes, activeParts, keyCount, durationSec, difficulty = "normal") {
    const mode = normalizeDifficulty(difficulty, "normal");
    const audible = (scheduleNotes || [])
      .filter((note) => note && note.volume > 0 && note.durationSec > 0.015)
      .map((note, index) => ({ ...note, sourceId: index }));

    const deduped = dedupeChartSources(audible);
    const groups = groupNotesByStart(deduped, 0.012);
    const midiValues = deduped.map((note) => note.midi).sort((a, b) => a - b);
    const lowPitch = percentile(midiValues, 0.04, 48);
    const highPitch = Math.max(lowPitch + 7, percentile(midiValues, 0.96, 72));
    const partTotals = new Map();
    for (const note of deduped) partTotals.set(note.part, (partTotals.get(note.part) || 0) + 1);

    const laneOccupiedUntil = Array(keyCount).fill(-Infinity);
    const lastLaneTime = Array(keyCount).fill(-Infinity);
    const lastLaneStateByPart = new Map();
    const partUsage = new Map(activeParts.map((part) => [part, 0]));
    const partLastSelectedTime = new Map(activeParts.map((part) => [part, -Infinity]));
    const hardNotes = [];
    let dropped = Math.max(0, audible.length - deduped.length);

    for (const group of groups) {
      const groupTime = group[0].start;
      const freeLanes = [];
      for (let lane = 0; lane < keyCount; lane++) {
        if (laneOccupiedUntil[lane] <= groupTime + 0.015) freeLanes.push(lane);
      }
      if (!freeLanes.length) {
        dropped += group.length;
        continue;
      }

      const chosen = chooseGroupSources(group, Math.min(freeLanes.length, keyCount), {
        groupTime,
        partUsage,
        partTotals,
        partLastSelectedTime,
        difficulty: "hard"
      });
      dropped += Math.max(0, group.length - chosen.length);
      chosen.sort((a, b) => a.midi - b.midi || a.part - b.part);

      const laneSet = chooseLaneCombination(chosen, freeLanes, {
        keyCount,
        lowPitch,
        highPitch,
        lastLaneTime,
        lastLaneStateByPart,
        groupTime
      });

      for (let i = 0; i < chosen.length; i++) {
        const source = chosen[i];
        const lane = laneSet[i];
        const isLong = Number(source.duration) >= LONG_NOTE_BEATS - 1e-7;
        const end = source.start + source.durationSec;
        hardNotes.push({
          id: hardNotes.length,
          sourceId: source.sourceId,
          part: source.part,
          midi: source.midi,
          volume: source.volume,
          beat: source.beat,
          durationBeats: source.duration,
          start: source.start,
          end,
          durationSec: source.durationSec,
          lane,
          isLong,
          status: "pending",
          headJudgement: null,
          headDelta: 0,
          judgement: null,
          hitDelta: 0
        });
        lastLaneTime[lane] = groupTime;
        lastLaneStateByPart.set(source.part, { lane, midi: source.midi, time: groupTime });
        partUsage.set(source.part, (partUsage.get(source.part) || 0) + 1);
        partLastSelectedTime.set(source.part, groupTime);
        if (isLong) laneOccupiedUntil[lane] = Math.max(laneOccupiedUntil[lane], end + 0.02);
      }
    }

    hardNotes.sort((a, b) => a.start - b.start || a.lane - b.lane || a.part - b.part);
    const generated = filterChartNotesForDifficulty(hardNotes, mode, keyCount);
    dropped += Math.max(0, hardNotes.length - generated.length);
    generated.forEach((note, index) => { note.id = index; });

    const laneNotes = Array.from({ length: keyCount }, () => []);
    for (const note of generated) laneNotes[note.lane].push(note);
    const longCount = generated.filter((note) => note.isLong).length;
    const maxRawScore = generated.reduce((sum, note) => {
      const multiplier = note.isLong ? LONG_NOTE_SCORE_MULTIPLIER : 1;
      return sum + JUDGE_WEIGHTS.Perfect * multiplier;
    }, 0) || 1;
    const selectedGroups = groupNotesByStart(generated, 0.012);
    const maxChord = selectedGroups.reduce((max, group) => Math.max(max, group.length), generated.length ? 1 : 0);
    const nps = generated.length / Math.max(1, durationSec);
    const chordRatio = selectedGroups.length ? generated.length / selectedGroups.length : 1;
    const longRatio = generated.length ? longCount / generated.length : 0;
    const difficultyBoost = mode === "hard" ? 2.2 : mode === "easy" ? -1.4 : 0;
    const level = clampInt(Math.round(nps * 3.8 + chordRatio * 1.8 + maxChord * 1.2 + longRatio * 4 + difficultyBoost), 1, 30);

    return {
      notes: generated,
      laneNotes,
      dropped,
      maxChord,
      level,
      maxRawScore,
      difficulty: mode,
      sourceNoteCount: deduped.length
    };
  }

  function filterChartNotesForDifficulty(notes, difficulty, keyCount) {
    if (difficulty === "hard") return notes.map((note) => ({ ...note }));
    const profile = DIFFICULTY_PROFILES[difficulty] || DIFFICULTY_PROFILES.normal;
    const grouped = groupNotesByStart(notes, 0.012);
    const thinnedGroups = simplifyGroupsForDifficulty(grouped, difficulty);
    const partTotals = new Map();
    for (const note of notes) partTotals.set(note.part, (partTotals.get(note.part) || 0) + 1);
    const partUsage = new Map();
    const partLastSelectedTime = new Map();
    const output = [];
    for (const group of thinnedGroups) {
      const groupTime = group[0]?.start || 0;
      const chordLimit = difficulty === "normal"
        ? Math.min(profile.maxChord, Math.max(3, keyCount - 1))
        : Math.min(profile.maxChord, keyCount);
      const chosen = chooseGroupSources(group, Math.min(chordLimit, group.length), {
        groupTime,
        partUsage,
        partTotals,
        partLastSelectedTime,
        difficulty
      });
      for (const note of chosen) {
        output.push({ ...note });
        partUsage.set(note.part, (partUsage.get(note.part) || 0) + 1);
        partLastSelectedTime.set(note.part, groupTime);
      }
    }
    return output.sort((a, b) => a.start - b.start || a.lane - b.lane || a.part - b.part);
  }

  function simplifyGroupsForDifficulty(groups, difficulty) {
    if (difficulty === "hard") return groups.map((group) => group.slice());
    const gap = DIFFICULTY_PROFILES[difficulty]?.minGroupGap || 0;
    if (!(gap > 0) || groups.length < 2) return groups.map((group) => group.slice());

    const output = [];
    let cluster = [];
    let clusterStart = -Infinity;
    const flush = () => {
      if (!cluster.length) return;
      let best = cluster[0];
      let bestScore = groupSelectionPriority(best);
      for (let i = 1; i < cluster.length; i++) {
        const score = groupSelectionPriority(cluster[i]);
        if (score > bestScore + 1e-9) {
          best = cluster[i];
          bestScore = score;
        }
      }
      output.push(best.slice());
      cluster = [];
    };

    for (const group of groups) {
      const time = group[0]?.start ?? 0;
      if (!cluster.length) {
        cluster = [group];
        clusterStart = time;
        continue;
      }
      if (time - clusterStart < gap) {
        cluster.push(group);
      } else {
        flush();
        cluster = [group];
        clusterStart = time;
      }
    }
    flush();
    return output;
  }

  function groupSelectionPriority(group) {
    if (!group?.length) return -Infinity;
    const bestNote = Math.max(...group.map(noteSelectionPriority));
    const beat = Number(group[0].beat) || 0;
    const wholeBeatDistance = Math.abs(beat - Math.round(beat));
    const halfBeatDistance = Math.abs(beat * 2 - Math.round(beat * 2));
    const accent = wholeBeatDistance < 0.035 ? 1.6 : halfBeatDistance < 0.05 ? 0.65 : 0;
    const longBonus = group.some((note) => Number(note.duration) >= LONG_NOTE_BEATS) ? 2.2 : 0;
    return bestNote + accent + longBonus + Math.min(0.8, group.length * 0.12);
  }

  function dedupeChartSources(notes) {
    const map = new Map();
    for (const note of notes) {
      const timeKey = Math.round(note.start * 200); // 5ms 단위
      const key = `${timeKey}:${note.midi}`;
      const prev = map.get(key);
      if (!prev || chartSourcePriority(note) > chartSourcePriority(prev)) map.set(key, note);
    }
    return [...map.values()].sort((a, b) => a.start - b.start || a.midi - b.midi || a.part - b.part);
  }

  function chartSourcePriority(note) {
    return noteSelectionPriority(note) + (Number(note.duration) >= LONG_NOTE_BEATS ? 0.8 : 0);
  }

  function noteSelectionPriority(note) {
    const duration = Math.max(0, Number(note.duration ?? note.durationBeats) || 0);
    const beat = Number(note.beat) || 0;
    const wholeBeatDistance = Math.abs(beat - Math.round(beat));
    const halfBeatDistance = Math.abs(beat * 2 - Math.round(beat * 2));
    const accent = wholeBeatDistance < 0.035 ? 1.25 : halfBeatDistance < 0.05 ? 0.45 : 0;
    return Math.min(3.2, Math.sqrt(duration) * 1.45)
      + (Number(note.volume) || 0) / 15
      + accent
      + (duration >= LONG_NOTE_BEATS ? 2.1 : 0);
  }

  function groupNotesByStart(notes, tolerance) {
    const groups = [];
    let current = [];
    let anchor = -Infinity;
    for (const note of notes) {
      if (!current.length || Math.abs(note.start - anchor) <= tolerance) {
        if (!current.length) anchor = note.start;
        current.push(note);
      } else {
        groups.push(current);
        current = [note];
        anchor = note.start;
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  function chooseGroupSources(group, limit, context) {
    if (limit <= 0) return [];
    if (group.length <= limit) return group.slice();
    const remaining = group.slice().sort((a, b) => a.midi - b.midi || a.part - b.part);
    const selected = [];
    const low = remaining[0].midi;
    const high = remaining[remaining.length - 1].midi;
    const range = Math.max(1, high - low);

    for (let slot = 0; slot < limit && remaining.length; slot++) {
      const target = limit === 1 ? (low + high) / 2 : low + range * slot / (limit - 1);
      let bestIndex = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const note = remaining[i];
        const lastTime = context.partLastSelectedTime.get(note.part) ?? -Infinity;
        const restBonus = Math.min(1.4, Math.max(0, context.groupTime - lastTime) / 1.2);
        const usage = context.partUsage.get(note.part) || 0;
        const total = context.partTotals.get(note.part) || 1;
        const usageRatio = usage / total;
        const partDiversity = selected.some((item) => item.part === note.part) ? 0 : 0.45;
        const pitchFit = 1.8 - Math.abs(note.midi - target) / range * 2.1;
        const pitchDiversity = selected.length
          ? Math.min(...selected.map((item) => Math.abs(item.midi - note.midi))) / 12
          : 0;
        const score = noteSelectionPriority(note)
          + pitchFit
          + Math.min(1.1, pitchDiversity)
          + restBonus
          + partDiversity
          - usageRatio * 0.6;
        if (score > bestScore + 1e-9) {
          bestScore = score;
          bestIndex = i;
        }
      }
      selected.push(remaining.splice(bestIndex, 1)[0]);
    }
    return selected;
  }

  function chooseLaneCombination(notes, freeLanes, context) {
    if (notes.length === 1) return [chooseSingleLane(notes[0], freeLanes, context)];
    const candidates = laneCombinations(freeLanes, notes.length);
    let best = candidates[0] || freeLanes.slice(0, notes.length).sort((a, b) => a - b);
    let bestCost = Infinity;
    for (const lanes of candidates) {
      let cost = 0;
      for (let i = 0; i < notes.length; i++) cost += laneAssignmentCost(notes[i], lanes[i], context);
      for (let i = 1; i < notes.length; i++) {
        const pitchGap = notes[i].midi - notes[i - 1].midi;
        const laneGap = lanes[i] - lanes[i - 1];
        if (pitchGap >= 7 && laneGap < 2) cost += 0.7;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = lanes;
      }
    }
    return best;
  }

  function chooseSingleLane(note, freeLanes, context) {
    let bestLane = freeLanes[0];
    let bestCost = Infinity;
    for (const lane of freeLanes) {
      const cost = laneAssignmentCost(note, lane, context);
      if (cost < bestCost) {
        bestCost = cost;
        bestLane = lane;
      }
    }
    return bestLane;
  }

  function laneAssignmentCost(note, lane, context) {
    const pitchNorm = clamp((note.midi - context.lowPitch) / Math.max(1, context.highPitch - context.lowPitch), 0, 1);
    const pitchLane = pitchNorm * (context.keyCount - 1);
    const previous = context.lastLaneStateByPart.get(note.part);
    let desired = pitchLane;
    let directionPenalty = 0;
    if (previous && context.groupTime - previous.time < 3.5) {
      const interval = note.midi - previous.midi;
      const contourLane = clamp(previous.lane + interval / 4.2, 0, context.keyCount - 1);
      desired = pitchLane * 0.62 + contourLane * 0.38;
      if (interval >= 2 && lane <= previous.lane) directionPenalty += 1.25;
      if (interval <= -2 && lane >= previous.lane) directionPenalty += 1.25;
      if (Math.abs(interval) <= 1) directionPenalty += Math.abs(lane - previous.lane) * 0.5;
    }
    let cost = Math.abs(lane - desired) * 3 + directionPenalty;
    const sinceLane = context.groupTime - context.lastLaneTime[lane];
    if (sinceLane < 0.1) cost += (0.1 - sinceLane) * 26;
    return cost;
  }

  function laneCombinations(values, size, start = 0, prefix = [], output = []) {
    if (prefix.length === size) {
      output.push(prefix.slice());
      return output;
    }
    for (let i = start; i <= values.length - (size - prefix.length); i++) {
      prefix.push(values[i]);
      laneCombinations(values, size, i + 1, prefix, output);
      prefix.pop();
    }
    return output;
  }

  function percentile(sorted, ratio, fallback) {
    if (!sorted.length) return fallback;
    const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
    return sorted[index];
  }

  async function loadSoundFont() {
    setAudioStatus("공용 기본 음원을 불러오는 중…", "loading", false);
    dom.soundBankState.textContent = "음원 로딩 중";
    dom.soundBankState.className = "state-pill";
    try {
      state.soundFont = await loadDefaultSoundBank({
        clearBase64: true,
        onProgress(progress) {
          const percent = Math.min(99, Math.max(0, Math.round((Number(progress) || 0) * 100)));
          dom.soundBankState.textContent = `음원 로딩 ${percent}%`;
        }
      });
      state.presetOptions = buildPresetOptions(state.soundFont);
      state.audioMode = "soundbank";
      state.soundFontError = null;
      dom.soundBankState.textContent = "공용 기본 음원 준비됨";
      dom.soundBankState.className = "state-pill ready";
      setAudioStatus("공용 기본 음원 준비 완료", "ready", true);
      renderInstrumentRows(dom.scoreDialog.open ? (readInstrumentRowsValues() || state.dialogDraftInstruments || state.instruments) : state.instruments);
      updateChartInfoUi();
      return state.soundFont;
    } catch (err) {
      state.soundFont = null;
      state.presetOptions = [];
      state.audioMode = "synth";
      state.soundFontError = err;
      dom.soundBankState.textContent = "간이 음원 사용";
      dom.soundBankState.className = "state-pill error";
      setAudioStatus("공용 기본 음원을 읽지 못해 간이 음원으로 재생합니다.", "error", false);
      renderInstrumentRows(dom.scoreDialog.open ? (readInstrumentRowsValues() || state.dialogDraftInstruments || state.instruments) : state.instruments);
      updateChartInfoUi();
      return null;
    }
  }

  function buildPresetOptions(soundFont) {
    const seen = new Set();
    return (soundFont?.presets || [])
      .filter((preset) => preset && Array.isArray(preset.regions) && preset.regions.length)
      .slice()
      .sort((a, b) => (a.bank - b.bank) || (a.preset - b.preset) || String(a.name).localeCompare(String(b.name)))
      .filter((preset) => {
        const key = `${preset.bank}:${preset.preset}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((preset) => ({
        key: `${preset.bank}:${preset.preset}`,
        label: formatPresetLabel(preset),
        preset
      }));
  }

  function formatPresetLabel(preset) {
    const number = String(Number(preset.preset) + 1).padStart(3, "0");
    const name = String(preset.name || "이름 없는 악기").trim();
    return Number(preset.bank) === 0 ? `${number} ${name}` : `Bank ${preset.bank} · ${number} ${name}`;
  }

  async function ensureAudioContext() {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("이 브라우저는 Web Audio를 지원하지 않습니다.");
      state.audioCtx = new AudioContextClass({ latencyHint: "interactive" });
      state.masterGain = state.audioCtx.createGain();
      state.masterGain.connect(state.audioCtx.destination);
      updateMasterGain();
    }
    if (state.audioCtx.state === "suspended") await state.audioCtx.resume();
    return state.audioCtx;
  }

  async function prepareAudioNotes() {
    if (!state.schedule) return [];
    const audioCtx = await ensureAudioContext();
    if (!state.soundFont) {
      state.preparedAudioNotes = null;
      state.audioGainScale = 0.72;
      return [];
    }

    const prepared = [];
    for (let part = 0; part < 6; part++) {
      const partNotes = state.schedule.notes.filter((note) => note.part === part && note.volume > 0);
      if (!partNotes.length) continue;
      const preset = findSoundBankPreset(state.soundFont, ...parseInstrumentKey(state.instruments[part]));
      if (!preset) continue;
      prepared.push(...prepareNotes(audioCtx, state.soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    prepared.forEach((note, index) => { note.id = index; });
    state.preparedAudioNotes = prepared;
    state.audioGainScale = computeAutoGainScale(prepared);
    return prepared;
  }

  function computeAutoGainScale(notes) {
    const events = [];
    for (const note of notes || []) {
      events.push([note.start, 1]);
      events.push([note.noteEnd ?? note.start + note.durationSec, -1]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0;
    let peak = 0;
    for (const [, delta] of events) {
      active += delta;
      peak = Math.max(peak, active);
    }
    if (peak <= 3) return 0.9;
    return Math.max(0.3, Math.min(0.9, Math.sqrt(3 / peak) * 0.9));
  }

  async function startGame() {
    if (state.pendingStart || !state.chartNotes.length || !state.schedule) return;
    state.pendingStart = true;
    dom.startBtn.disabled = true;
    dom.startBtn.textContent = "준비 중…";
    try {
      await ensureAudioContext();
      if (state.soundFontPromise) await state.soundFontPromise;
      if (state.soundFont && !state.preparedAudioNotes) await prepareAudioNotes();

      stopGameAudio();
      resetGameStats();
      state.status = "countdown";
      state.pauseSongTime = 0;
      state.songStartCtxTime = state.audioCtx.currentTime + COUNTDOWN_LEAD;
      state.scheduledAudioIds = new Set();
      state.activeSources = [];
      hideOverlay(dom.startOverlay);
      hideOverlay(dom.pauseOverlay);
      hideOverlay(dom.resultOverlay);
      scheduleAudioWindow();
      updateAllUi();
      dom.canvas.focus?.();
    } catch (err) {
      showToast(`게임 시작 실패: ${shortError(err)}`);
      state.status = "ready";
      showOverlay(dom.startOverlay);
    } finally {
      state.pendingStart = false;
      dom.startBtn.disabled = !state.chartNotes.length;
      dom.startBtn.textContent = "게임 시작";
    }
  }

  function resetGameStats() {
    state.score = 0;
    state.rawScore = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 };
    state.nextMissIndex = 0;
    state.laneCursor = Array(state.keyCount).fill(0);
    state.lanePressed = Array(state.keyCount).fill(false);
    state.heldLongByLane = Array(state.keyCount).fill(null);
    state.pointerLanes.clear();
    state.effects = [];
    state.countdownLabel = "";
    for (const note of state.chartNotes) {
      note.status = "pending";
      note.headJudgement = null;
      note.headDelta = 0;
      note.releaseAccepted = false;
      note.judgement = null;
      note.hitDelta = 0;
    }
    updateScoreUi();
    updateComboUi(false);
    dom.countdownDisplay.textContent = "";
    dom.judgementDisplay.className = "judgement-display";
  }

  function pauseGame(showUi = true) {
    if (!isRunning()) return false;
    state.pauseSongTime = getSongTime();
    state.status = "paused";
    stopGameAudio();
    clearPressedLanes();
    if (showUi) showOverlay(dom.pauseOverlay);
    return true;
  }

  async function resumeGame() {
    if (state.status !== "paused") return;
    try {
      await ensureAudioContext();
      state.songStartCtxTime = state.audioCtx.currentTime + RESUME_LEAD - state.pauseSongTime;
      state.status = state.pauseSongTime < 0 ? "countdown" : "playing";
      state.scheduledAudioIds = new Set();
      state.activeSources = [];
      hideOverlay(dom.pauseOverlay);
      scheduleAudioWindow();
    } catch (err) {
      showToast(`재개 실패: ${shortError(err)}`);
    }
  }

  function togglePause() {
    if (isRunning()) pauseGame(true);
    else if (state.status === "paused") void resumeGame();
  }

  function returnToStart() {
    stopGameAudio();
    state.status = "ready";
    state.pauseSongTime = 0;
    resetGameStats();
    hideOverlay(dom.pauseOverlay);
    hideOverlay(dom.resultOverlay);
    showOverlay(dom.startOverlay);
    updateAllUi();
  }

  function finishGame() {
    if (state.status === "result") return;
    for (const note of state.chartNotes) {
      if (note.status === "pending" || note.status === "holding") finalizeNote(note, "Miss", 0, { silentEffect: true });
    }
    stopGameAudio();
    state.status = "result";
    clearPressedLanes();
    updateResultUi();
    showOverlay(dom.resultOverlay);
    postToParent("MML_RHYTHM_RESULT", {
      version: APP_VERSION,
      title: state.title,
      score: state.score,
      maxCombo: state.maxCombo,
      counts: { ...state.counts },
      accuracy: state.rawScore / state.maxRawScore,
      keyCount: state.keyCount,
      difficulty: state.difficulty,
      noteOffsetMs: state.noteOffsetMs,
      noteCount: state.chartNotes.length
    });
  }

  function isRunning() {
    return state.status === "countdown" || state.status === "playing";
  }

  function getSongTime() {
    if (state.status === "paused") return state.pauseSongTime;
    if (!state.audioCtx || !state.songStartCtxTime) return state.pauseSongTime || 0;
    return state.audioCtx.currentTime - state.songStartCtxTime;
  }

  function getChartTime(songTime = getSongTime()) {
    return songTime - state.noteOffsetMs / 1000;
  }

  function scheduleAudioWindow() {
    if (!isRunning() || !state.audioCtx || !state.schedule) return;
    if (state.schedulerTimer) clearTimeout(state.schedulerTimer);
    const songTime = getSongTime();
    const windowStart = Math.max(0, songTime - 0.035);
    const windowEnd = Math.min(state.schedule.duration + 0.1, Math.max(0, songTime) + AUDIO_LOOKAHEAD);

    if (state.soundFont && Array.isArray(state.preparedAudioNotes)) {
      schedulePreparedNotes(state.audioCtx, state.preparedAudioNotes, {
        baseTime: state.songStartCtxTime,
        fromSec: 0,
        playbackSpeed: 1,
        windowStart,
        windowEnd,
        destination: state.masterGain || state.audioCtx.destination,
        activeSources: state.activeSources,
        scheduledIds: state.scheduledAudioIds,
        minLeadTime: 0.018,
        gainScale: state.audioGainScale
      });
    } else {
      scheduleFallbackWindow(windowStart, windowEnd);
    }

    state.schedulerTimer = window.setTimeout(scheduleAudioWindow, AUDIO_INTERVAL_MS);
  }

  function scheduleFallbackWindow(windowStart, windowEnd) {
    for (let index = 0; index < state.schedule.notes.length; index++) {
      const note = state.schedule.notes[index];
      if (note.start >= windowEnd) break;
      if (note.start + note.durationSec <= windowStart || note.volume <= 0) continue;
      const id = `fallback:${index}`;
      if (state.scheduledAudioIds.has(id)) continue;
      state.scheduledAudioIds.add(id);
      scheduleFallbackNote(note, id);
    }
  }

  function scheduleFallbackNote(note, id) {
    const audioCtx = state.audioCtx;
    if (!audioCtx) return;
    const program = Number(normalizeInstrumentKey(state.instruments[note.part]).split(":")[1]) || 0;
    const startOffset = Math.max(0, getSongTime() - note.start);
    const start = Math.max(audioCtx.currentTime + 0.012, state.songStartCtxTime + note.start);
    const remaining = Math.max(0.015, note.durationSec - startOffset);
    const end = start + remaining;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = fallbackWaveform(program);
    oscillator.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
    const volume = Math.pow(clamp(note.volume / 15, 0, 1), 1.5) * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.setValueAtTime(volume, Math.max(start + 0.008, end - 0.045));
    gain.gain.linearRampToValueAtTime(0.0001, end + 0.045);
    oscillator.connect(gain).connect(state.masterGain || audioCtx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.06);
    const item = { source: oscillator, gain, id };
    oscillator.onended = () => removeActiveSource(item);
    state.activeSources.push(item);
  }

  function fallbackWaveform(program) {
    if (program >= 32 && program <= 39) return "square";
    if (program >= 40 && program <= 55) return "sawtooth";
    if (program >= 72 && program <= 79) return "sine";
    if (program >= 80 && program <= 95) return "triangle";
    return "triangle";
  }

  function stopGameAudio() {
    if (state.schedulerTimer) {
      clearTimeout(state.schedulerTimer);
      state.schedulerTimer = 0;
    }
    for (const item of state.activeSources.splice(0)) {
      try { item.source?.stop?.(); } catch (_) {}
      try { item.source?.disconnect?.(); } catch (_) {}
      try { item.gain?.disconnect?.(); } catch (_) {}
    }
    state.scheduledAudioIds = new Set();
  }

  function removeActiveSource(item) {
    const index = state.activeSources.indexOf(item);
    if (index >= 0) state.activeSources.splice(index, 1);
    try { item.source?.disconnect?.(); } catch (_) {}
    try { item.gain?.disconnect?.(); } catch (_) {}
  }

  function onKeyDown(event) {
    if (event.code === "Escape") {
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      togglePause();
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (event.code === "Enter" && dom.startOverlay.classList.contains("visible") && !dom.startBtn.disabled) {
      event.preventDefault();
      void startGame();
      return;
    }
    const lane = state.keyConfig.findIndex((key) => key.code === event.code);
    if (lane < 0) return;
    event.preventDefault();
    if (event.repeat) return;
    pressLane(lane);
  }

  function onKeyUp(event) {
    if (isEditableTarget(event.target)) return;
    const lane = state.keyConfig.findIndex((key) => key.code === event.code);
    if (lane < 0) return;
    event.preventDefault();
    releaseLane(lane);
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, button, [contenteditable='true']"));
  }

  function canAcceptLaneInput() {
    if (state.status === "playing") return true;
    if (state.status !== "countdown") return false;
    return getChartTime() >= -JUDGE_WINDOWS.GoodEarly;
  }

  function pressLane(lane) {
    if (!Number.isInteger(lane) || lane < 0 || lane >= state.keyCount) return;
    const canJudge = canAcceptLaneInput();
    state.lanePressed[lane] = true;
    updateLaneKeyPressed(lane, true);
    if (!canJudge) return;

    const now = getChartTime();
    const note = findHittableNote(lane, now);
    if (!note) return;
    const delta = now - note.start;
    const judgement = judgementForDelta(delta);
    if (!judgement) return;

    if (note.isLong) {
      note.status = "holding";
      note.headJudgement = judgement;
      note.headDelta = delta;
      note.releaseAccepted = false;
      state.heldLongByLane[lane] = note;
      showJudgement("Hold", delta);
      addHitEffect(lane, judgement, { kind: "hold-start", color: "#77f6bd" });
      advanceLaneCursor(lane);
    } else {
      finalizeNote(note, judgement, delta);
    }
  }

  function releaseLane(lane) {
    if (!Number.isInteger(lane) || lane < 0 || lane >= state.keyCount) return;
    state.lanePressed[lane] = false;
    updateLaneKeyPressed(lane, false);
    const note = state.heldLongByLane[lane];
    if (!note || note.status !== "holding") return;
    const now = getChartTime();
    if (now >= note.end - LONG_RELEASE_GRACE) {
      note.releaseAccepted = true;
      return;
    }
    finalizeNote(note, "Miss", now - note.end);
  }

  function findHittableNote(lane, now) {
    const notes = state.laneNotes[lane] || [];
    let cursor = state.laneCursor[lane] || 0;
    while (cursor < notes.length && notes[cursor].status !== "pending") cursor++;
    state.laneCursor[lane] = cursor;
    let best = null;
    let bestDistance = Infinity;
    for (let i = cursor; i < notes.length; i++) {
      const note = notes[i];
      if (note.status !== "pending") continue;
      if (note.start > now + JUDGE_WINDOWS.GoodEarly) break;
      const delta = now - note.start;
      const insideWindow = delta < 0
        ? Math.abs(delta) <= JUDGE_WINDOWS.GoodEarly
        : delta <= JUDGE_WINDOWS.GoodLate;
      const distance = Math.abs(delta);
      if (insideWindow && distance < bestDistance) {
        best = note;
        bestDistance = distance;
      }
    }
    return best;
  }

  function judgementForDelta(delta) {
    const distance = Math.abs(delta);
    if (distance <= JUDGE_WINDOWS.Perfect) return "Perfect";
    if (distance <= JUDGE_WINDOWS.Great) return "Great";
    if (delta < 0 && distance <= JUDGE_WINDOWS.GoodEarly) return "Good";
    if (delta >= 0 && delta <= JUDGE_WINDOWS.GoodLate) return "Good";
    return null;
  }

  function finalizeNote(note, judgement, delta = 0, options = {}) {
    if (!note || note.status === "hit" || note.status === "miss") return;
    const lane = note.lane;
    note.status = judgement === "Miss" ? "miss" : "hit";
    note.judgement = judgement;
    note.hitDelta = delta;
    if (note.isLong && state.heldLongByLane[lane] === note) state.heldLongByLane[lane] = null;

    state.counts[judgement]++;
    const multiplier = note.isLong ? LONG_NOTE_SCORE_MULTIPLIER : 1;
    state.rawScore += JUDGE_WEIGHTS[judgement] * multiplier;
    state.score = clampInt(Math.round(state.rawScore / state.maxRawScore * 100000), 0, 100000);

    if (judgement === "Perfect" || judgement === "Great") {
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
    } else {
      state.combo = 0;
    }

    advanceLaneCursor(lane);
    updateScoreUi();
    updateComboUi(true);
    if (!options.silentEffect) {
      showJudgement(judgement, delta);
      addHitEffect(lane, judgement, {
        kind: note.isLong && judgement !== "Miss" ? "long-complete" : "tap"
      });
    }
  }

  function advanceLaneCursor(lane) {
    const notes = state.laneNotes[lane] || [];
    let cursor = state.laneCursor[lane] || 0;
    while (cursor < notes.length && notes[cursor].status !== "pending") cursor++;
    state.laneCursor[lane] = cursor;
  }

  function updateGameLogic(songTime, chartTime = getChartTime(songTime)) {
    updateCountdown(chartTime);
    if (chartTime >= 0 && state.status === "countdown") state.status = "playing";
    if (state.status !== "playing") return;

    while (state.nextMissIndex < state.chartNotes.length) {
      const note = state.chartNotes[state.nextMissIndex];
      if (note.start + JUDGE_WINDOWS.GoodLate >= chartTime) break;
      if (note.status === "pending") finalizeNote(note, "Miss", chartTime - note.start);
      state.nextMissIndex++;
    }

    for (let lane = 0; lane < state.heldLongByLane.length; lane++) {
      const note = state.heldLongByLane[lane];
      if (!note || note.status !== "holding") continue;
      if (chartTime >= note.end) {
        const completed = state.lanePressed[lane] || note.releaseAccepted;
        finalizeNote(note, completed ? (note.headJudgement || "Good") : "Miss", note.headDelta);
      }
    }

    const chartFinished = chartTime >= state.schedule.duration + 0.55;
    const audioFinished = songTime >= state.schedule.duration + 0.05;
    if (chartFinished && audioFinished) finishGame();
  }

  function showJudgement(judgement, delta) {
    const normalized = String(judgement || "");
    dom.judgementDisplay.className = `judgement-display ${normalized.toLowerCase()}`;
    dom.judgementText.textContent = normalized;
    dom.judgementOffset.textContent = normalized === "Hold" || normalized === "Miss"
      ? ""
      : `${delta >= 0 ? "+" : ""}${Math.round(delta * 1000)}ms`;

    if (typeof dom.judgementDisplay.getAnimations === "function") {
      for (const animation of dom.judgementDisplay.getAnimations()) animation.cancel();
    }
    if (typeof dom.judgementDisplay.animate === "function") {
      dom.judgementDisplay.animate([
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.66)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.08)", offset: 0.08 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.82 },
        { opacity: 0, transform: "translate(-50%, -58%) scale(0.96)" }
      ], {
        duration: 1800,
        easing: "cubic-bezier(0.18, 0.86, 0.26, 1)"
      });
    }
  }

  function updateComboUi(pop) {
    dom.comboValue.textContent = String(state.combo);
    dom.comboDisplay.classList.toggle("visible", state.combo > 0);
    if (!pop || state.combo <= 0) return;
    dom.comboDisplay.classList.add("pop");
    if (state.comboTimer) clearTimeout(state.comboTimer);
    state.comboTimer = setTimeout(() => dom.comboDisplay.classList.remove("pop"), 120);
  }

  function addHitEffect(lane, judgement, options = {}) {
    const normalized = String(judgement || "Miss");
    const success = normalized === "Perfect" || normalized === "Great" || normalized === "Good";
    const kind = options.kind || "tap";
    const holding = kind === "hold-start";
    const color = options.color || (normalized === "Perfect" ? "#7ff7ff"
      : normalized === "Great" ? "#d59cff"
        : normalized === "Good" ? "#ffe17a" : "#ff718c");
    const duration = kind === "long-complete" ? LONG_COMPLETE_EFFECT_DURATION
      : holding ? HOLD_EFFECT_DURATION
        : success ? HIT_EFFECT_DURATION : MISS_EFFECT_DURATION;
    const particleCount = kind === "long-complete" ? 8
      : normalized === "Perfect" ? 6
        : normalized === "Great" ? 5
          : normalized === "Good" ? 4
            : holding ? 3 : 0;
    const createdAt = performance.now() / 1000;

    // 빠른 연타에서는 같은 레인의 이전 효과를 교체해 효과가 무한히 겹치지 않게 한다.
    for (let index = state.effects.length - 1; index >= 0; index--) {
      const previous = state.effects[index];
      if (previous.lane !== lane) continue;
      if (kind === "long-complete" || previous.kind !== "long-complete") {
        state.effects.splice(index, 1);
        break;
      }
    }
    while (state.effects.length >= MAX_ACTIVE_HIT_EFFECTS) state.effects.shift();

    state.effects.push({
      lane,
      color,
      judgement: normalized,
      success,
      holding,
      kind,
      duration,
      particleCount,
      createdAt
    });
    flashLaneKey(lane, normalized, color, kind);
  }

  function flashLaneKey(lane, judgement, color, kind) {
    const key = dom.laneKeys.children[lane];
    const flash = key?.querySelector(".lane-key-flash");
    if (!key || !flash || typeof flash.animate !== "function") return;
    const success = judgement !== "Miss";
    const duration = kind === "long-complete" ? 340 : kind === "hold-start" ? 240 : success ? 260 : 160;
    flash.style.backgroundColor = success ? color : "#ff718c";
    for (const animation of flash.getAnimations()) animation.cancel();
    flash.animate([
      { opacity: success ? 0.92 : 0.72, transform: "scale(0.78)" },
      { opacity: 0.36, transform: "scale(1)", offset: 0.42 },
      { opacity: 0, transform: "scale(1.12)" }
    ], { duration, easing: "cubic-bezier(0.16, 0.84, 0.28, 1)" });

    if (typeof key.animate === "function") {
      for (const animation of key.getAnimations()) animation.cancel();
      key.animate([
        { transform: "translateY(-1px) scale(1.025)" },
        { transform: "translateY(0) scale(1)" }
      ], { duration: Math.min(180, duration), easing: "ease-out" });
    }
  }

  function getHitEffectSprite(color, kind) {
    const variant = kind === "long-complete" ? "long" : "tap";
    const cacheKey = `${color}:${variant}`;
    const cached = hitEffectSpriteCache.get(cacheKey);
    if (cached) return cached;

    const size = variant === "long" ? 192 : 152;
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const context = sprite.getContext("2d");
    const center = size / 2;
    const radius = size * 0.48;

    const glow = context.createRadialGradient(center, center, 0, center, center, radius);
    glow.addColorStop(0, "rgba(255,255,255,0.96)");
    glow.addColorStop(0.13, hexToRgba(color, 0.92));
    glow.addColorStop(0.42, hexToRgba(color, 0.38));
    glow.addColorStop(1, hexToRgba(color, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    const bar = context.createLinearGradient(size * 0.08, 0, size * 0.92, 0);
    bar.addColorStop(0, hexToRgba(color, 0));
    bar.addColorStop(0.24, hexToRgba(color, 0.75));
    bar.addColorStop(0.5, "rgba(255,255,255,0.95)");
    bar.addColorStop(0.76, hexToRgba(color, 0.75));
    bar.addColorStop(1, hexToRgba(color, 0));
    context.fillStyle = bar;
    context.fillRect(size * 0.08, center - size * 0.045, size * 0.84, size * 0.09);

    hitEffectSpriteCache.set(cacheKey, sprite);
    return sprite;
  }

  function prewarmHitEffectSprites() {
    const colors = ["#7ff7ff", "#d59cff", "#ffe17a", "#ff718c", "#77f6bd"];
    for (const color of colors) getHitEffectSprite(color, "tap");
    for (const color of colors.slice(0, 3)) getHitEffectSprite(color, "long-complete");
  }

  function onPointerDown(event) {
    if (!canAcceptLaneInput()) return;
    event.preventDefault();
    const lane = laneFromPointer(event);
    if (lane < 0) return;
    state.pointerLanes.set(event.pointerId, lane);
    try { dom.canvas.setPointerCapture(event.pointerId); } catch (_) {}
    pressLane(lane);
  }

  function onPointerUp(event) {
    const lane = state.pointerLanes.get(event.pointerId);
    if (!Number.isInteger(lane)) return;
    event.preventDefault();
    state.pointerLanes.delete(event.pointerId);
    releaseLane(lane);
  }

  function laneFromPointer(event) {
    const rect = dom.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const geometry = getTrackGeometry(rect.width, rect.height);
    const edges = trackEdgesAtY(geometry.judgeY, geometry);
    if (x < edges.left || x > edges.right) return -1;
    return clampInt(Math.floor((x - edges.left) / (edges.right - edges.left) * state.keyCount), 0, state.keyCount - 1);
  }

  function clearPressedLanes() {
    for (let lane = 0; lane < state.lanePressed.length; lane++) {
      state.lanePressed[lane] = false;
      updateLaneKeyPressed(lane, false);
    }
    state.pointerLanes.clear();
  }

  function updateLaneKeyPressed(lane, pressed) {
    dom.laneKeys.children[lane]?.classList.toggle("pressed", pressed);
  }

  function frameLoop(timestampMs) {
    if (state.previousFrameTimestampMs > 0) {
      const frameDelta = clamp((timestampMs - state.previousFrameTimestampMs) / 1000, 0, 0.1);
      state.frameDeltaEma += (frameDelta - state.frameDeltaEma) * 0.08;
      if (state.effects.length > 0 && (frameDelta > 0.034 || state.frameDeltaEma > 0.024)) {
        state.effectQuality = Math.max(0.5, state.effectQuality - 0.12);
      } else if (state.frameDeltaEma < 0.019) {
        state.effectQuality = Math.min(1, state.effectQuality + 0.015);
      }
    }
    state.previousFrameTimestampMs = timestampMs;
    state.lastFrameTime = timestampMs / 1000;
    const activeTimeline = isRunning() || state.status === "paused";
    const songTime = activeTimeline ? getSongTime() : getPreviewTime(timestampMs / 1000);
    const chartTime = activeTimeline ? getChartTime(songTime) : songTime;
    if (isRunning()) updateGameLogic(songTime, chartTime);
    updateProgressUi(songTime);
    drawScene(chartTime, timestampMs / 1000);
    state.animationFrame = requestAnimationFrame(frameLoop);
  }

  function getPreviewTime(realTime) {
    if (!state.schedule?.duration) return -0.7;
    if (state.status === "result") return state.schedule.duration;
    return -0.8 + Math.sin(realTime * 0.35) * 0.08;
  }

  function resizeCanvas() {
    const rect = dom.canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (dom.canvas.width !== width || dom.canvas.height !== height) {
      dom.canvas.width = width;
      dom.canvas.height = height;
      state.canvasWidth = rect.width;
      state.canvasHeight = rect.height;
      state.canvasDpr = dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function drawScene(songTime, realTime) {
    const width = state.canvasWidth || dom.canvas.clientWidth;
    const height = state.canvasHeight || dom.canvas.clientHeight;
    if (!width || !height) return;
    ctx2d.setTransform(state.canvasDpr, 0, 0, state.canvasDpr, 0, 0);
    drawBackground(width, height, realTime);
    const geometry = getTrackGeometry(width, height);
    drawTrack(geometry, songTime, realTime);
    drawNotes(geometry, songTime);
    drawJudgementLine(geometry, realTime);
    drawHitEffects(geometry, realTime);
  }

  function drawBackground(width, height, realTime) {
    const gradient = ctx2d.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#090b25");
    gradient.addColorStop(0.58, "#09091b");
    gradient.addColorStop(1, "#03040d");
    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, width, height);

    const glow = ctx2d.createRadialGradient(width * 0.5, height * 0.25, 0, width * 0.5, height * 0.25, width * 0.55);
    glow.addColorStop(0, "rgba(95, 79, 255, 0.23)");
    glow.addColorStop(0.45, "rgba(42, 157, 255, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx2d.fillStyle = glow;
    ctx2d.fillRect(0, 0, width, height);

    for (const star of state.stars) {
      const twinkle = 0.34 + 0.36 * Math.sin(realTime * star.speed + star.phase);
      ctx2d.globalAlpha = twinkle;
      ctx2d.fillStyle = star.tint;
      ctx2d.beginPath();
      ctx2d.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;
  }

  function getTrackGeometry(width, height) {
    const topHud = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-hud-height")) || 76;
    const available = height - topHud;
    const judgeY = height - Math.max(73, available * 0.11);
    const horizonY = topHud + Math.max(68, available * 0.105);
    const bottomWidth = Math.min(width * 0.88, 960);
    const topWidth = Math.max(52, bottomWidth * 0.13);
    return {
      width,
      height,
      centerX: width / 2,
      horizonY,
      judgeY,
      topHalf: topWidth / 2,
      bottomHalf: bottomWidth / 2
    };
  }

  function trackEdgesAtY(y, geometry) {
    const t = clamp((y - geometry.horizonY) / Math.max(1, geometry.judgeY - geometry.horizonY), 0, 1.25);
    const half = geometry.topHalf + (geometry.bottomHalf - geometry.topHalf) * t;
    return { left: geometry.centerX - half, right: geometry.centerX + half, width: half * 2 };
  }

  function drawTrack(geometry, songTime, realTime) {
    const top = trackEdgesAtY(geometry.horizonY, geometry);
    const bottom = trackEdgesAtY(geometry.judgeY, geometry);
    const trackGradient = ctx2d.createLinearGradient(0, geometry.horizonY, 0, geometry.judgeY);
    trackGradient.addColorStop(0, "rgba(28, 31, 78, 0.46)");
    trackGradient.addColorStop(0.68, "rgba(14, 17, 48, 0.84)");
    trackGradient.addColorStop(1, "rgba(10, 12, 35, 0.96)");
    ctx2d.fillStyle = trackGradient;
    ctx2d.beginPath();
    ctx2d.moveTo(top.left, geometry.horizonY);
    ctx2d.lineTo(top.right, geometry.horizonY);
    ctx2d.lineTo(bottom.right, geometry.judgeY);
    ctx2d.lineTo(bottom.left, geometry.judgeY);
    ctx2d.closePath();
    ctx2d.fill();

    for (let lane = 0; lane < state.keyCount; lane++) {
      if (!state.lanePressed[lane]) continue;
      const topLeft = top.left + top.width * lane / state.keyCount;
      const topRight = top.left + top.width * (lane + 1) / state.keyCount;
      const bottomLeft = bottom.left + bottom.width * lane / state.keyCount;
      const bottomRight = bottom.left + bottom.width * (lane + 1) / state.keyCount;
      const color = laneColor(lane);
      const glow = ctx2d.createLinearGradient(0, geometry.horizonY, 0, geometry.judgeY);
      glow.addColorStop(0, hexToRgba(color, 0.02));
      glow.addColorStop(1, hexToRgba(color, 0.28));
      ctx2d.fillStyle = glow;
      ctx2d.beginPath();
      ctx2d.moveTo(topLeft, geometry.horizonY);
      ctx2d.lineTo(topRight, geometry.horizonY);
      ctx2d.lineTo(bottomRight, geometry.judgeY);
      ctx2d.lineTo(bottomLeft, geometry.judgeY);
      ctx2d.closePath();
      ctx2d.fill();
    }

    ctx2d.lineWidth = 1;
    for (let lane = 0; lane <= state.keyCount; lane++) {
      const topX = top.left + top.width * lane / state.keyCount;
      const bottomX = bottom.left + bottom.width * lane / state.keyCount;
      const lineGradient = ctx2d.createLinearGradient(0, geometry.horizonY, 0, geometry.judgeY);
      lineGradient.addColorStop(0, "rgba(112, 135, 255, 0.08)");
      lineGradient.addColorStop(1, "rgba(193, 220, 255, 0.34)");
      ctx2d.strokeStyle = lineGradient;
      ctx2d.beginPath();
      ctx2d.moveTo(topX, geometry.horizonY);
      ctx2d.lineTo(bottomX, geometry.judgeY);
      ctx2d.stroke();
    }

    const approach = getApproachTime();
    const gridStep = 0.5;
    const firstGrid = Math.ceil(songTime / gridStep) * gridStep;
    for (let time = firstGrid; time <= songTime + approach + gridStep; time += gridStep) {
      const y = timeToY(time, songTime, geometry, approach);
      if (y < geometry.horizonY - 1 || y > geometry.judgeY + 1) continue;
      const edges = trackEdgesAtY(y, geometry);
      const major = Math.abs((time / gridStep) % 4) < 0.01;
      ctx2d.strokeStyle = major ? "rgba(146, 211, 255, 0.21)" : "rgba(255, 255, 255, 0.075)";
      ctx2d.lineWidth = major ? 1.2 : 0.7;
      ctx2d.beginPath();
      ctx2d.moveTo(edges.left, y);
      ctx2d.lineTo(edges.right, y);
      ctx2d.stroke();
    }

    const horizonGlow = ctx2d.createRadialGradient(geometry.centerX, geometry.horizonY, 0, geometry.centerX, geometry.horizonY, geometry.bottomHalf * 0.52);
    horizonGlow.addColorStop(0, `rgba(102, 218, 255, ${0.26 + Math.sin(realTime * 1.3) * 0.05})`);
    horizonGlow.addColorStop(1, "rgba(102, 218, 255, 0)");
    ctx2d.fillStyle = horizonGlow;
    ctx2d.fillRect(geometry.centerX - geometry.bottomHalf, geometry.horizonY - 45, geometry.bottomHalf * 2, 100);
  }

  function drawNotes(geometry, songTime) {
    const approach = getApproachTime();
    for (const note of state.chartNotes) {
      if (!note.isLong || note.status === "hit") continue;
      if (note.start > songTime + approach + 0.12) continue;
      drawLongNote(note, geometry, songTime, approach);
    }
    for (const note of state.chartNotes) {
      if (note.isLong || note.status === "hit") continue;
      if (note.start > songTime + approach + 0.12) continue;
      drawTapNote(note, geometry, songTime, approach);
    }
  }

  function drawTapNote(note, geometry, songTime, approach) {
    const y = timeToY(note.start, songTime, geometry, approach);
    const progress = clamp((y - geometry.horizonY) / Math.max(1, geometry.judgeY - geometry.horizonY), 0, 1);
    const height = getTapNoteHeight(progress);
    const lateLimit = geometry.judgeY + JUDGE_WINDOWS.GoodLate * MISSED_NOTE_FALL_PX_PER_SEC + height;
    const maxY = note.status === "miss" ? geometry.height + height + 30 : lateLimit;
    if (y < geometry.horizonY - height || y > maxY) return;

    const bounds = laneBoundsAtY(note.lane, y, geometry);
    const laneWidth = bounds.right - bounds.left;
    const margin = laneWidth * 0.12;
    const missed = note.status === "miss";
    const color = missed ? "#9ca3b8" : laneColor(note.lane);
    ctx2d.save();
    ctx2d.globalAlpha = missed ? 0.72 : 1;
    ctx2d.shadowColor = missed ? "rgba(185, 190, 205, 0.5)" : color;
    ctx2d.shadowBlur = missed ? 7 : 8 + progress * 18;
    const gradient = ctx2d.createLinearGradient(bounds.left, y, bounds.right, y);
    if (missed) {
      gradient.addColorStop(0, "rgba(220,224,235,0.76)");
      gradient.addColorStop(0.2, "#858b9e");
      gradient.addColorStop(0.8, "#858b9e");
      gradient.addColorStop(1, "rgba(220,224,235,0.76)");
    } else {
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.18, color);
      gradient.addColorStop(0.82, color);
      gradient.addColorStop(1, "rgba(255,255,255,0.95)");
    }
    ctx2d.fillStyle = gradient;
    roundedRect(ctx2d, bounds.left + margin, y - height / 2, laneWidth - margin * 2, height, Math.min(height / 2, 10));
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.fillStyle = missed ? "rgba(235,238,245,0.45)" : "rgba(255,255,255,0.76)";
    roundedRect(ctx2d, bounds.left + margin * 1.45, y - height * 0.26, laneWidth - margin * 2.9, Math.max(2, height * 0.18), 4);
    ctx2d.fill();
    ctx2d.restore();
  }

  function getTapNoteHeight(progress = 1) {
    return (5 + clamp(progress, 0, 1) * 15) * TAP_NOTE_HEIGHT_SCALE;
  }

  function drawLongNote(note, geometry, songTime, approach) {
    let headTime = note.start;
    if (note.status === "holding" && songTime >= note.start) headTime = songTime;
    const headY = timeToY(headTime, songTime, geometry, approach);
    const tailY = timeToY(note.end, songTime, geometry, approach);
    const outsideAbove = headY < geometry.horizonY - 14 && tailY < geometry.horizonY - 14;
    const outsideBelow = headY > geometry.height + 70 && tailY > geometry.height + 70;
    if (outsideAbove || outsideBelow) return;

    const clampedHeadY = clamp(headY, geometry.horizonY, geometry.height + 45);
    const clampedTailY = clamp(tailY, geometry.horizonY, geometry.height + 45);
    const head = laneBoundsAtY(note.lane, clampedHeadY, geometry);
    const tail = laneBoundsAtY(note.lane, clampedTailY, geometry);
    const missed = note.status === "miss";
    const color = missed ? "#9299ac" : laneColor(note.lane);
    const headMargin = (head.right - head.left) * 0.21;
    const tailMargin = (tail.right - tail.left) * 0.25;

    ctx2d.save();
    ctx2d.globalAlpha = missed ? 0.56 : 0.78;
    ctx2d.shadowColor = missed ? "rgba(174,181,199,0.5)" : color;
    ctx2d.shadowBlur = missed ? 8 : note.status === "holding" ? 28 : 14;
    const ribbon = ctx2d.createLinearGradient(0, clampedTailY, 0, clampedHeadY);
    if (missed) {
      ribbon.addColorStop(0, "rgba(121,127,145,0.18)");
      ribbon.addColorStop(0.8, "rgba(146,153,172,0.55)");
      ribbon.addColorStop(1, "rgba(196,201,214,0.78)");
    } else {
      ribbon.addColorStop(0, hexToRgba(color, 0.18));
      ribbon.addColorStop(0.8, hexToRgba(color, note.status === "holding" ? 0.82 : 0.62));
      ribbon.addColorStop(1, hexToRgba(color, 0.95));
    }
    ctx2d.fillStyle = ribbon;
    ctx2d.beginPath();
    ctx2d.moveTo(tail.left + tailMargin, clampedTailY);
    ctx2d.lineTo(tail.right - tailMargin, clampedTailY);
    ctx2d.lineTo(head.right - headMargin, clampedHeadY);
    ctx2d.lineTo(head.left + headMargin, clampedHeadY);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    ctx2d.strokeStyle = missed ? "rgba(210,214,225,0.52)" : hexToRgba(color, 0.82);
    ctx2d.lineWidth = missed ? 1 : 1.2;
    ctx2d.stroke();
    ctx2d.restore();

    if (note.status !== "holding" || songTime < note.end) {
      const syntheticHead = { ...note, start: headTime, status: note.status === "holding" ? "pending" : note.status };
      drawTapNote(syntheticHead, geometry, songTime, approach);
    }
  }

  function drawHitEffects(geometry, realTime) {
    let writeIndex = 0;
    for (let index = 0; index < state.effects.length; index++) {
      const effect = state.effects[index];
      if (realTime - effect.createdAt < effect.duration) state.effects[writeIndex++] = effect;
    }
    state.effects.length = writeIndex;

    const quality = clamp(state.effectQuality, 0.5, 1);
    for (const effect of state.effects) {
      const age = Math.max(0, realTime - effect.createdAt);
      const progress = clamp(age / effect.duration, 0, 1);
      const fade = Math.pow(1 - progress, 1.12);
      const bounds = laneBoundsAtY(effect.lane, geometry.judgeY, geometry);
      const laneWidth = bounds.right - bounds.left;
      const centerX = (bounds.left + bounds.right) / 2;
      const noteHeight = getTapNoteHeight(1);
      const strength = effect.kind === "long-complete" ? 1.22 : effect.holding ? 0.88 : 1;

      ctx2d.save();
      if (effect.success || effect.holding) {
        // 가벼운 단색 빔: 매 프레임 그라데이션과 큰 그림자를 만들지 않는다.
        const beamTopY = Math.max(geometry.horizonY, geometry.judgeY - (64 + progress * 112) * strength);
        const beamTop = laneBoundsAtY(effect.lane, beamTopY, geometry);
        ctx2d.globalAlpha = 0.24 * fade;
        ctx2d.fillStyle = effect.color;
        ctx2d.beginPath();
        ctx2d.moveTo(bounds.left + laneWidth * 0.08, geometry.judgeY);
        ctx2d.lineTo(bounds.right - laneWidth * 0.08, geometry.judgeY);
        ctx2d.lineTo(beamTop.right - (beamTop.right - beamTop.left) * 0.25, beamTopY);
        ctx2d.lineTo(beamTop.left + (beamTop.right - beamTop.left) * 0.25, beamTopY);
        ctx2d.closePath();
        ctx2d.fill();

        // 광원은 캐시한 스프라이트를 확대해서 그린다.
        const sprite = getHitEffectSprite(effect.color, effect.kind);
        const spriteWidth = laneWidth * (1.05 + progress * 0.72) * strength;
        const spriteHeight = noteHeight * (3.4 + progress * 1.8) * strength;
        ctx2d.globalAlpha = fade * (effect.kind === "long-complete" ? 1 : 0.9);
        ctx2d.drawImage(
          sprite,
          centerX - spriteWidth / 2,
          geometry.judgeY - spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );

        // 확산 링은 한 개만 사용한다.
        const ringProgress = clamp(progress * 1.08, 0, 1);
        ctx2d.globalAlpha = fade * 0.82;
        ctx2d.strokeStyle = effect.color;
        ctx2d.lineWidth = Math.max(1.2, (3.8 - ringProgress * 2.4) * strength);
        ctx2d.beginPath();
        ctx2d.ellipse(
          centerX,
          geometry.judgeY,
          laneWidth * (0.22 + ringProgress * 0.58) * strength,
          noteHeight * (0.55 + ringProgress * 1.45) * strength,
          0,
          0,
          Math.PI * 2
        );
        ctx2d.stroke();

        const rayCount = quality < 0.7 ? 3 : effect.kind === "long-complete" ? 6 : 4;
        ctx2d.lineCap = "round";
        for (let ray = 0; ray < rayCount; ray++) {
          const angle = Math.PI * 2 * ray / rayCount + effect.lane * 0.13;
          const inner = 7 + progress * 9;
          const outer = inner + (17 + (ray % 3) * 5) * (0.55 + progress) * strength;
          ctx2d.globalAlpha = fade * (ray % 2 === 0 ? 0.72 : 0.46);
          ctx2d.strokeStyle = ray % 2 === 0 ? "#ffffff" : effect.color;
          ctx2d.lineWidth = ray % 2 === 0 ? 1.8 : 1.2;
          ctx2d.beginPath();
          ctx2d.moveTo(centerX + Math.cos(angle) * inner, geometry.judgeY + Math.sin(angle) * inner * 0.55);
          ctx2d.lineTo(centerX + Math.cos(angle) * outer, geometry.judgeY + Math.sin(angle) * outer * 0.55);
          ctx2d.stroke();
        }

        const particleCount = Math.max(2, Math.round((effect.particleCount || 0) * quality));
        for (let particle = 0; particle < particleCount; particle++) {
          const delay = (particle % 3) * 0.025;
          const localProgress = clamp((age - delay) / Math.max(0.001, effect.duration - delay), 0, 1);
          if (localProgress <= 0 || localProgress >= 1) continue;
          const spread = particleCount <= 1 ? 0 : particle / (particleCount - 1) - 0.5;
          const jitter = Math.sin((particle + 1) * 91.173 + effect.lane * 37.719 + effect.createdAt * 10.37);
          const x = centerX
            + (spread * 0.24 + jitter * 0.035) * laneWidth
            + (spread * 0.68 + jitter * 0.1) * laneWidth * localProgress;
          const y = geometry.judgeY
            - (54 + (particle % 4) * 15 + Math.abs(jitter) * 22) * localProgress
            + 58 * localProgress * localProgress;
          const size = (2.3 + (particle % 3) * 0.9) * (1 - localProgress * 0.35);
          ctx2d.globalAlpha = Math.pow(1 - localProgress, 1.25);
          ctx2d.fillStyle = localProgress < 0.25 ? "#ffffff" : effect.color;
          ctx2d.fillRect(x - size / 2, y - size / 2, size, size);
        }
      } else {
        const radius = 10 + progress * 26;
        ctx2d.globalAlpha = fade * 0.42;
        ctx2d.strokeStyle = effect.color;
        ctx2d.lineWidth = 2.2 * fade + 0.8;
        ctx2d.beginPath();
        ctx2d.ellipse(centerX, geometry.judgeY, radius, radius * 0.68, 0, 0, Math.PI * 2);
        ctx2d.stroke();
      }
      ctx2d.restore();
    }
  }

  function drawJudgementLine(geometry, realTime) {
    const bandHeight = Math.max(28, getTapNoteHeight(1) * 1.08);
    const topY = geometry.judgeY - bandHeight / 2;
    const bottomY = geometry.judgeY + bandHeight / 2;
    const top = trackEdgesAtY(topY, geometry);
    const bottom = trackEdgesAtY(bottomY, geometry);
    const pulse = 0.76 + Math.sin(realTime * 4.2) * 0.1;

    ctx2d.save();
    const fill = ctx2d.createLinearGradient(0, topY, 0, bottomY);
    fill.addColorStop(0, "rgba(80, 207, 255, 0.08)");
    fill.addColorStop(0.5, `rgba(115, 229, 255, ${0.19 * pulse})`);
    fill.addColorStop(1, "rgba(156, 119, 255, 0.09)");
    ctx2d.fillStyle = fill;
    ctx2d.beginPath();
    ctx2d.moveTo(top.left, topY);
    ctx2d.lineTo(top.right, topY);
    ctx2d.lineTo(bottom.right, bottomY);
    ctx2d.lineTo(bottom.left, bottomY);
    ctx2d.closePath();
    ctx2d.fill();

    ctx2d.strokeStyle = "rgba(158, 235, 255, 0.48)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(top.left, topY);
    ctx2d.lineTo(top.right, topY);
    ctx2d.moveTo(bottom.left, bottomY);
    ctx2d.lineTo(bottom.right, bottomY);
    ctx2d.stroke();

    const center = trackEdgesAtY(geometry.judgeY, geometry);
    ctx2d.shadowColor = "rgba(111, 229, 255, 0.95)";
    ctx2d.shadowBlur = 20;
    ctx2d.strokeStyle = `rgba(214, 250, 255, ${pulse})`;
    ctx2d.lineWidth = 4;
    ctx2d.beginPath();
    ctx2d.moveTo(center.left, geometry.judgeY);
    ctx2d.lineTo(center.right, geometry.judgeY);
    ctx2d.stroke();
    ctx2d.restore();
  }

  function laneBoundsAtY(lane, y, geometry) {
    const edges = trackEdgesAtY(y, geometry);
    return {
      left: edges.left + edges.width * lane / state.keyCount,
      right: edges.left + edges.width * (lane + 1) / state.keyCount
    };
  }

  function timeToY(targetTime, songTime, geometry, approach) {
    const delta = targetTime - songTime;
    if (delta < 0) return geometry.judgeY + Math.abs(delta) * MISSED_NOTE_FALL_PX_PER_SEC;
    const progress = 1 - delta / approach;
    if (progress < 0) return geometry.horizonY - 4;
    const eased = Math.pow(clamp(progress, 0, 1), 1.58);
    return geometry.horizonY + (geometry.judgeY - geometry.horizonY) * eased;
  }

  function getApproachTime() {
    return 2.35 / NOTE_SPEEDS[state.speedIndex];
  }

  function laneColor(lane) {
    if (state.keyCount === 4) return [LANE_COLORS[0], LANE_COLORS[1], LANE_COLORS[4], LANE_COLORS[5]][lane] || LANE_COLORS[lane];
    return LANE_COLORS[lane] || "#8be8ff";
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function hexToRgba(hex, alpha) {
    const normalized = String(hex).replace("#", "");
    const value = parseInt(normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function createStars(count) {
    let seed = 0x5f3759df;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    return Array.from({ length: count }, () => ({
      x: random(),
      y: random() * 0.72,
      size: 0.45 + random() * 1.25,
      speed: 0.7 + random() * 2.2,
      phase: random() * Math.PI * 2,
      tint: random() > 0.56 ? "#aeeeff" : random() > 0.5 ? "#d5bcff" : "#ffffff"
    }));
  }

  function updateCountdown(songTime) {
    let label = "";
    let isGo = false;
    if (songTime < 0) {
      const remaining = -songTime;
      label = remaining > 3 ? "READY" : String(Math.max(1, Math.ceil(remaining)));
    } else if (songTime < 0.34) {
      label = "GO!";
      isGo = true;
    }
    if (label !== state.countdownLabel) {
      state.countdownLabel = label;
      dom.countdownDisplay.textContent = label;
    }
    dom.countdownDisplay.classList.toggle("go", isGo);
  }

  function updateAllUi() {
    updateScoreUi();
    updateChartInfoUi();
    updateProgressUi(state.status === "result" ? state.schedule?.duration || 0 : 0);
    updateSpeedUi();
    updateChartOptionControls();
  }

  function updateChartInfoUi() {
    const noteCount = state.chartNotes.length;
    const longCount = state.chartNotes.filter((note) => note.isLong).length;
    const duration = state.schedule?.duration || 0;
    const difficultyLabel = DIFFICULTY_LABELS[state.difficulty] || "NORMAL";
    dom.hudSongTitle.textContent = state.title;
    dom.hudChartInfo.textContent = `${state.keyCount} KEY · ${difficultyLabel} · ${noteCount} NOTES`;
    dom.startTitle.textContent = state.title;
    dom.startKeyMode.textContent = `${state.keyCount} KEY`;
    dom.startNoteCount.textContent = noteCount.toLocaleString("ko-KR");
    dom.startLongCount.textContent = longCount.toLocaleString("ko-KR");
    dom.startLevel.textContent = `${difficultyLabel} ${state.chartLevel}`;
    dom.startDuration.textContent = formatClock(duration);
    dom.startChannelCount.textContent = String(state.activeParts.length);
    dom.totalTime.textContent = formatClock(duration);
    dom.startSubtitle.textContent = state.chartDropped > 0
      ? `선택한 난이도와 키 구성에 맞춰 음표 ${state.chartDropped.toLocaleString("ko-KR")}개를 정리했습니다.`
      : "음정 흐름과 여러 채널을 함께 분석해 만든 리듬 차트입니다.";
    dom.startStatus.className = "start-status";
    dom.startStatus.textContent = state.audioMode === "loading"
      ? "기본 음원을 준비하고 있습니다. 준비가 끝나기 전에도 시작 버튼을 누를 수 있습니다."
      : state.audioMode === "synth"
        ? "기본 음원을 불러오지 못해 간이 음원으로 재생합니다."
        : "연주 정보를 확인한 뒤 게임을 시작하세요.";
    dom.startBtn.disabled = !noteCount;
    renderStartKeyGuide();
  }

  function updateScoreUi() {
    dom.scoreValue.textContent = String(state.score).padStart(6, "0");
  }

  function updateProgressUi(songTime) {
    const duration = state.schedule?.duration || 0;
    const current = clamp(Number(songTime) || 0, 0, duration || 0);
    const ratio = duration > 0 ? current / duration : 0;
    dom.progressFill.style.width = `${ratio * 100}%`;
    dom.currentTime.textContent = formatClock(current);
  }

  function updateResultUi() {
    const accuracy = state.rawScore / state.maxRawScore;
    dom.resultRank.textContent = resultRank(state.score);
    dom.resultScore.textContent = String(state.score).padStart(6, "0");
    dom.resultPerfect.textContent = state.counts.Perfect.toLocaleString("ko-KR");
    dom.resultGreat.textContent = state.counts.Great.toLocaleString("ko-KR");
    dom.resultGood.textContent = state.counts.Good.toLocaleString("ko-KR");
    dom.resultMiss.textContent = state.counts.Miss.toLocaleString("ko-KR");
    dom.resultCombo.textContent = state.maxCombo.toLocaleString("ko-KR");
    dom.resultAccuracy.textContent = `${(accuracy * 100).toFixed(2)}%`;
    dom.resultMessage.textContent = resultMessage(state.score, state.counts);
  }

  function resultRank(score) {
    if (score >= 100000) return "SS";
    if (score >= 95000) return "S";
    if (score >= 85000) return "A";
    if (score >= 70000) return "B";
    if (score >= 55000) return "C";
    return "D";
  }

  function resultMessage(score, counts) {
    if (score >= 100000) return "ALL PERFECT! 모든 노트를 정확하게 연주했습니다.";
    if ((counts?.Good || 0) === 0 && (counts?.Miss || 0) === 0) return "FULL COMBO! Perfect와 Great로 끝까지 콤보를 이어갔습니다.";
    if (score >= 90000) return "훌륭한 연주입니다. 조금만 더 다듬으면 완벽해질 것 같습니다.";
    if (score >= 70000) return "좋은 연주입니다. 배속을 조절해 다시 도전해 보세요.";
    return "곡의 흐름을 익힌 뒤 다시 도전해 보세요.";
  }

  function renderLaneKeys() {
    dom.laneKeys.innerHTML = "";
    dom.laneKeys.style.gridTemplateColumns = `repeat(${state.keyCount}, minmax(0, 1fr))`;
    for (const key of state.keyConfig) {
      const item = document.createElement("div");
      item.className = "lane-key";
      const flash = document.createElement("span");
      flash.className = "lane-key-flash";
      const label = document.createElement("span");
      label.className = "lane-key-label";
      label.textContent = key.label;
      item.append(flash, label);
      dom.laneKeys.appendChild(item);
    }
  }

  function renderStartKeyGuide() {
    dom.startKeyGuide.innerHTML = "";
    for (const key of state.keyConfig) {
      const item = document.createElement("kbd");
      item.textContent = key.label;
      dom.startKeyGuide.appendChild(item);
    }
  }

  function renderInstrumentRows(values = state.instruments) {
    if (!dom.instrumentRows) return;
    const sourceValues = normalizeInstrumentList(values);
    state.dialogDraftInstruments = [...sourceValues];
    dom.instrumentRows.innerHTML = "";
    for (let part = 0; part < 6; part++) {
      const row = document.createElement("div");
      row.className = "instrument-row";
      const label = document.createElement("label");
      label.htmlFor = `instrumentSelect${part}`;
      label.textContent = PART_LABELS[part];
      const select = document.createElement("select");
      select.id = `instrumentSelect${part}`;
      select.dataset.instrumentPart = String(part);
      const selected = normalizeInstrumentKey(sourceValues[part]);
      if (state.presetOptions.length) {
        const available = new Set(state.presetOptions.map((option) => option.key));
        for (const option of state.presetOptions) {
          const element = new Option(option.label, option.key, false, option.key === selected);
          select.appendChild(element);
        }
        if (!available.has(selected)) {
          const fallback = new Option(`선택값 ${selected}`, selected, true, true);
          select.insertBefore(fallback, select.firstChild);
        }
      } else {
        const program = Number(selected.split(":")[1]) + 1;
        select.appendChild(new Option(`악기 ${String(program).padStart(3, "0")}`, selected, true, true));
      }
      select.addEventListener("change", () => {
        state.dialogDraftInstruments = readInstrumentRowsValues() || state.dialogDraftInstruments;
      });
      row.append(label, select);
      dom.instrumentRows.appendChild(row);
    }
  }

  function setInstrumentRowsValues(values) {
    const normalized = normalizeInstrumentList(values);
    state.dialogDraftInstruments = [...normalized];
    renderInstrumentRows(normalized);
  }

  function readInstrumentRowsValues() {
    const selects = [...dom.instrumentRows.querySelectorAll("select[data-instrument-part]")];
    if (!selects.length) return null;
    const values = Array(6).fill(DEFAULT_PRESET_KEY);
    for (const select of selects) values[Number(select.dataset.instrumentPart)] = normalizeInstrumentKey(select.value);
    return values;
  }

  function openScoreDialog() {
    if (state.sourceType === "midi") {
      showToast("MIDI로 불러온 곡은 MML 편집 창에서 직접 수정할 수 없습니다.");
      return;
    }
    state.scoreDialogApplied = false;
    state.dialogDefaultInstruments = [...state.instrumentBaseline];
    populateScoreForm(
      { title: state.title, mml: state.mml, instruments: state.instruments },
      { defaultInstruments: state.instrumentBaseline }
    );
    openDialogWithPause(dom.scoreDialog);
  }

  function populateScoreForm(data, options = {}) {
    const normalized = normalizeScorePayload(data);
    dom.songTitleInput.value = normalized.title;
    dom.mmlInput.value = normalized.mml;
    state.dialogDraftInstruments = normalizeInstrumentList(normalized.instruments);
    if (options.useAsDefault) state.dialogDefaultInstruments = [...state.dialogDraftInstruments];
    else if (options.defaultInstruments) state.dialogDefaultInstruments = normalizeInstrumentList(options.defaultInstruments);
    renderInstrumentRows(state.dialogDraftInstruments);
    inspectDialogMml(normalized.mml);
    setDialogStatus("MML과 6개 채널의 악기를 확인한 뒤 적용하세요.", "");
  }

  function scheduleDialogMmlInspection() {
    if (state.dialogParseTimer) clearTimeout(state.dialogParseTimer);
    state.dialogParseTimer = setTimeout(() => inspectDialogMml(dom.mmlInput.value), 140);
  }

  function inspectDialogMml(value) {
    if (!dom.scoreChannelCount) return;
    try {
      const normalized = normalizeScorePayload({ mml: value, instruments: state.dialogDraftInstruments || state.instruments });
      const parsed = parseMabinogiMml(normalized.mml);
      const count = parsed.parts.filter((part) => part.notes.some((note) => note.volume > 0)).length;
      dom.scoreChannelCount.textContent = `MML 채널 ${count}개`;
      dom.scoreChannelCount.className = "state-pill channel-count-pill";
      dom.scoreChannelCount.title = `소리 나는 MML 채널 ${count}개`;
      return count;
    } catch (err) {
      dom.scoreChannelCount.textContent = "MML 확인 필요";
      dom.scoreChannelCount.className = "state-pill channel-count-pill error";
      dom.scoreChannelCount.title = shortError(err);
      return 0;
    }
  }

  function onScoreFormSubmit(event) {
    event.preventDefault();
    const instruments = readInstrumentRowsValues() || state.instruments;
    try {
      const info = applyScoreData({
        title: dom.songTitleInput.value,
        mml: dom.mmlInput.value,
        instruments,
        keyCount: state.keyCount,
        difficulty: state.difficulty,
        noteOffsetMs: state.noteOffsetMs
      }, { persist: true, source: "dialog", updateInstrumentBaseline: false });
      state.scoreDialogApplied = true;
      state.dialogDraftInstruments = null;
      setDialogStatus(`${info.keyCount}키 · ${DIFFICULTY_LABELS[info.difficulty]} · 노트 ${info.noteCount.toLocaleString("ko-KR")}개 차트를 만들었습니다.`, "success");
      dom.scoreDialog.close("applied");
      showToast("연주 정보를 적용했습니다.");
    } catch (err) {
      setDialogStatus(shortError(err), "error");
      inspectDialogMml(dom.mmlInput.value);
    }
  }

  function setDialogStatus(text, type) {
    dom.scoreParseStatus.textContent = text;
    dom.scoreParseStatus.className = `dialog-status${type ? ` ${type}` : ""}`;
  }

  function formatNoteOffsetMs(value) {
    const normalized = normalizeNoteOffsetMs(value);
    return `${normalized > 0 ? "+" : ""}${normalized}ms`;
  }

  function setNoteOffsetMs(value, options = {}) {
    state.noteOffsetMs = normalizeNoteOffsetMs(value, state.noteOffsetMs);
    updateNoteOffsetUi();
    if (options.persist) {
      saveNoteOffset();
      saveScore();
    }
    return state.noteOffsetMs;
  }

  function updateNoteOffsetUi() {
    const label = formatNoteOffsetMs(state.noteOffsetMs);
    if (dom.offsetValue) dom.offsetValue.textContent = label;
    if (dom.offsetBtn) {
      dom.offsetBtn.title = `노트 오프셋 ${label} · 노트 판정 시점을 앞뒤로 조절합니다.`;
      dom.offsetBtn.setAttribute("aria-label", `노트 오프셋 ${label}`);
    }
  }

  function openOffsetDialog() {
    if (!dom.offsetDialog || !dom.noteOffsetSlider) return;
    dom.noteOffsetSlider.value = String(state.noteOffsetMs);
    updateOffsetDialogPreview();
    openDialogWithPause(dom.offsetDialog);
  }

  function updateOffsetDialogPreview() {
    if (!dom.noteOffsetSlider || !dom.offsetDialogValue) return;
    dom.offsetDialogValue.textContent = formatNoteOffsetMs(dom.noteOffsetSlider.value);
  }

  function onOffsetQuickAction(event) {
    if (!dom.noteOffsetSlider) return;
    const button = event.currentTarget;
    const explicit = button.dataset.offsetValue;
    const adjust = Number(button.dataset.offsetAdjust || 0);
    const next = explicit != null
      ? normalizeNoteOffsetMs(explicit)
      : normalizeNoteOffsetMs(Number(dom.noteOffsetSlider.value) + adjust);
    dom.noteOffsetSlider.value = String(next);
    updateOffsetDialogPreview();
  }

  function onOffsetFormSubmit(event) {
    event.preventDefault();
    const value = setNoteOffsetMs(dom.noteOffsetSlider?.value, { persist: true });
    dom.offsetDialog?.close("applied");
    showToast(`노트 오프셋을 ${formatNoteOffsetMs(value)}로 설정했습니다.`);
  }

  function openHelpDialog() {
    openDialogWithPause(dom.helpDialog);
  }

  function openDialogWithPause(dialog) {
    const wasRunning = isRunning();
    const wasPaused = state.status === "paused";
    state.resumeAfterDialog = wasRunning;
    state.scoreDialogOpenedFromPause = wasPaused;
    if (wasRunning) {
      pauseGame(false);
      hideOverlay(dom.pauseOverlay);
    } else if (wasPaused) {
      hideOverlay(dom.pauseOverlay);
    }
    if (!dialog.open) dialog.showModal();
  }

  function onDialogClosed(dialog) {
    if (dialog === dom.scoreDialog && state.scoreDialogApplied) {
      state.resumeAfterDialog = false;
      state.scoreDialogOpenedFromPause = false;
      state.dialogDraftInstruments = null;
      return;
    }
    if (dialog === dom.scoreDialog) state.dialogDraftInstruments = null;
    if (state.resumeAfterDialog && state.status === "paused") {
      state.resumeAfterDialog = false;
      void resumeGame();
      return;
    }
    if (state.scoreDialogOpenedFromPause && state.status === "paused") {
      state.scoreDialogOpenedFromPause = false;
      showOverlay(dom.pauseOverlay);
    }
  }

  function onDifficultyControlClick(event) {
    const button = event.target.closest("button[data-difficulty]");
    if (!button || !dom.difficultyControl?.contains(button)) return;
    const next = normalizeDifficulty(button.dataset.difficulty, state.difficulty);
    if (next === state.difficulty) return;
    const previous = state.difficulty;
    state.difficulty = next;
    try {
      rebuildChart();
      showToast(`난이도 ${DIFFICULTY_LABELS[next]}로 변경했습니다.`);
    } catch (err) {
      state.difficulty = previous;
      updateChartOptionControls();
      showToast(`난이도 변경 실패: ${shortError(err)}`);
    }
  }

  function onKeyModeControlClick(event) {
    const button = event.target.closest("button[data-key-count]");
    if (!button || !dom.keyModeControl?.contains(button)) return;
    const next = normalizeKeyCount(button.dataset.keyCount, state.keyCount);
    if (next === state.keyCount) return;
    const previous = state.keyCount;
    state.keyCount = next;
    state.keyConfig = KEY_CONFIGS[next];
    try {
      rebuildChart();
      showToast(`${next}키 구성으로 변경했습니다.`);
    } catch (err) {
      state.keyCount = previous;
      state.keyConfig = KEY_CONFIGS[previous];
      updateChartOptionControls();
      showToast(`키 구성 변경 실패: ${shortError(err)}`);
    }
  }

  function updateChartOptionControls() {
    dom.difficultyControl?.querySelectorAll("button[data-difficulty]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === state.difficulty));
    });
    dom.keyModeControl?.querySelectorAll("button[data-key-count]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.keyCount) === state.keyCount));
    });
  }

  function formatSpeed(value) {
    const label = Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, ".0");
    return `${label}×`;
  }

  function cycleNoteSpeed() {
    state.speedIndex = (state.speedIndex + 1) % NOTE_SPEEDS.length;
    updateSpeedUi();
    showToast(`노트 배속 ${formatSpeed(NOTE_SPEEDS[state.speedIndex])}`);
  }

  function updateSpeedUi() {
    dom.speedValue.textContent = formatSpeed(NOTE_SPEEDS[state.speedIndex]);
  }

  function setVolume(value) {
    state.volume = clamp(Number(value) || 0, 0, 1.5);
    const percent = Math.round(state.volume * 100);
    dom.volumeSlider.value = String(percent);
    dom.volumeValue.textContent = `${percent}%`;
    updateMasterGain();
  }

  function updateMasterGain() {
    if (!state.masterGain || !state.audioCtx) return;
    const target = Math.pow(state.volume, 1.32) * 0.95;
    state.masterGain.gain.setTargetAtTime(target, state.audioCtx.currentTime, 0.012);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await dom.app.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch (err) {
      showToast(`전체 화면 전환 실패: ${shortError(err)}`);
    }
  }

  function updateFullscreenUi() {
    dom.fullscreenBtn.setAttribute("aria-label", document.fullscreenElement ? "전체 화면 종료" : "전체 화면");
    dom.fullscreenBtn.title = document.fullscreenElement ? "전체 화면 종료" : "전체 화면";
  }

  function closeRhythmGame() {
    stopGameAudio();
    postToParent("MML_RHYTHM_CLOSE", { version: APP_VERSION });
    if (!state.embedded) showToast("독립 페이지에서는 브라우저 탭을 닫아 주세요.");
  }

  function onParentMessage(event) {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object" || !MESSAGE_LOAD_TYPES.has(data.type)) return;
    try {
      applyScoreData(data.payload || data, { persist: false, source: "message" });
      showToast("연주 정보를 받았습니다.");
    } catch (err) {
      postToParent("MML_RHYTHM_ERROR", { version: APP_VERSION, message: shortError(err) });
      showToast(`연주 정보 불러오기 실패: ${shortError(err)}`);
    }
  }

  function announceReady() {
    postToParent("MML_RHYTHM_READY", {
      version: APP_VERSION,
      accepts: ["mml", "midiBytes", "midiBuffer", "midiData", "title", "instruments", "parts", "keyCount", "difficulty", "noteOffsetMs"]
    });
  }

  function postToParent(type, payload = {}) {
    if (window.parent === window) return;
    const targetOrigin = location.origin === "null" ? "*" : location.origin;
    window.parent.postMessage({ type, payload, ...payload }, targetOrigin);
  }

  function getPublicChartInfo() {
    return {
      title: state.title,
      sourceType: state.sourceType,
      keyCount: state.keyCount,
      channelCount: state.activeParts.length,
      noteCount: state.chartNotes.length,
      longNoteCount: state.chartNotes.filter((note) => note.isLong).length,
      droppedNoteCount: state.chartDropped,
      duration: state.schedule?.duration || 0,
      level: state.chartLevel,
      difficulty: state.difficulty,
      noteOffsetMs: state.noteOffsetMs
    };
  }

  function saveScore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        title: state.title,
        mml: state.mml,
        instruments: state.instruments,
        keyCount: state.keyCount,
        difficulty: state.difficulty,
        noteOffsetMs: state.noteOffsetMs
      }));
    } catch (_) {}
  }

  function readSavedScore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.mml) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveNoteOffset() {
    try { localStorage.setItem(OFFSET_STORAGE_KEY, String(state.noteOffsetMs)); } catch (_) {}
  }

  function readSavedNoteOffset() {
    try { return normalizeNoteOffsetMs(localStorage.getItem(OFFSET_STORAGE_KEY), 0); }
    catch (_) { return 0; }
  }

  function setAudioStatus(text, type = "", autoHide = false) {
    dom.audioStatus.textContent = text;
    dom.audioStatus.className = `audio-status${type ? ` ${type}` : ""}`;
    if (state.audioStatusTimer) clearTimeout(state.audioStatusTimer);
    if (autoHide) {
      state.audioStatusTimer = setTimeout(() => dom.audioStatus.classList.add("hidden"), 2200);
    }
  }

  function setStartError(message) {
    dom.startStatus.textContent = message;
    dom.startStatus.className = "start-status error";
    dom.startBtn.disabled = true;
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 2600);
  }

  function showOverlay(element) {
    element?.classList.add("visible");
  }

  function hideOverlay(element) {
    element?.classList.remove("visible");
  }

  function formatClock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const total = Math.floor(value + 0.0001);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  const publicApi = Object.freeze({
    version: APP_VERSION,
    loadScore(data) {
      return applyScoreData(data, { persist: false, source: "api" });
    },
    loadMidi(bytes, options = {}) {
      return applyScoreData({ ...options, midiBytes: bytes }, { persist: false, source: "api" });
    },
    parseMidi(bytes, options = {}) {
      return parseMidiDocument(bytes, options);
    },
    async loadSoundBank(source, options = {}) {
      const bank = await parseSoundBankSource(source, options);
      stopGameAudio();
      state.soundFont = bank;
      state.soundFontPromise = Promise.resolve(bank);
      state.presetOptions = buildPresetOptions(bank);
      state.preparedAudioNotes = null;
      state.audioMode = "soundbank";
      state.soundFontError = null;
      dom.soundBankState.textContent = `${String(bank.fileName || bank.format || "SoundBank")} 준비됨`;
      dom.soundBankState.className = "state-pill ready";
      renderInstrumentRows(dom.scoreDialog.open ? (readInstrumentRowsValues() || state.dialogDraftInstruments || state.instruments) : state.instruments);
      updateChartInfoUi();
      return bank;
    },
    start() { return startGame(); },
    pause() { if (isRunning()) pauseGame(true); },
    resume() { if (state.status === "paused") return resumeGame(); },
    openScoreDialog,
    getChartInfo: getPublicChartInfo,
    getChartPreview() {
      return state.chartNotes.map((note) => ({
        id: note.id,
        part: note.part,
        lane: note.lane,
        start: note.start,
        end: note.end,
        durationBeats: note.durationBeats,
        isLong: note.isLong,
        midi: note.midi
      }));
    },
    getScoreData() {
      return {
        title: state.title,
        sourceType: state.sourceType,
        sourceMetadata: state.sourceMetadata ? { ...state.sourceMetadata, warnings: [...(state.sourceMetadata.warnings || [])] } : null,
        mml: state.mml,
        instruments: [...state.instruments],
        keyCount: state.keyCount,
        difficulty: state.difficulty,
        noteOffsetMs: state.noteOffsetMs
      };
    },
    setDifficulty(value) {
      state.difficulty = normalizeDifficulty(value, state.difficulty);
      return rebuildChart();
    },
    setKeyCount(value) {
      state.keyCount = normalizeKeyCount(value, state.keyCount);
      state.keyConfig = KEY_CONFIGS[state.keyCount];
      return rebuildChart();
    },
    setNoteOffset(value) {
      return setNoteOffsetMs(value, { persist: true });
    },
    calculateScore(results) {
      let raw = 0;
      let maximum = 0;
      for (const item of Array.from(results || [])) {
        const multiplier = item?.isLong || item?.hold ? LONG_NOTE_SCORE_MULTIPLIER : 1;
        maximum += JUDGE_WEIGHTS.Perfect * multiplier;
        raw += (JUDGE_WEIGHTS[item?.judgement || item?.grade] || 0) * multiplier;
      }
      return maximum ? clampInt(Math.round(raw / maximum * 100000), 0, 100000) : 0;
    }
  });

  window.MobiBeats = publicApi;
  window.MmlRhythmGame = publicApi;

  init();
})();
