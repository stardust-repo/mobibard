(() => {
  "use strict";

  const APP_VERSION_LABEL = "v5.0";

  const CONFIG = {
    defaultChannelCount: 1,
    preRollPixels: 8,
    beatsPerMeasure: 4,
    minPitch: 12, // C0
    maxPitch: 119, // B8
    defaultRowHeight: 12,
    baseQuarterWidth: 48,
    zoomLevels: [0.3, 0.45, 0.6, 0.85, 1, 1.5, 2, 3.5, 5],
    get minZoom() { return this.zoomLevels[0] ?? 1; },
    get maxZoom() { return this.zoomLevels[this.zoomLevels.length - 1] ?? 1; },
    gridMinPixelSpacing: 18,
    denseGridMinPixelSpacing: 12,
    minimumNoteBeat: 4 / 64,
    pageScrollDuration: 210,
    pageScrollRightMarginRatio: 0.22,
    pageScrollLeftMarginRatio: 0.16,
    playbackStartContextRatio: 0.24,
    playbackStartContextMinPixels: 112,
    playbackStartContextMaxPixels: 260,
    timelineDragEdgePixels: 34,
    manualScrollSnapDelay: 110,
    minTempo: 32,
    maxTempo: 255,
    tempoMarkerHitRadius: 9,
    dragAutoScrollEdgePixels: 52,
    dragAutoScrollMinSpeed: 2.5,
    dragAutoScrollMaxSpeed: 18,
    noteBoundarySnapPixels: 10,
    timelineExtensionBeats: 4,
    historyLimit: 100,
    playbackLookaheadSeconds: 0.65,
    playbackSchedulerIntervalMs: 45,
    playbackScheduleBatchLimit: 96,
    playbackScheduleBudgetMs: 4.5,
    playbackNormalizationReferenceVoices: 2,
    playbackNormalizationMinimumGain: 0.35,
    rollOverscanXRatio: 0.42,
    rollOverscanYRatio: 0.58,
    rollOverscanMaxX: 640,
    rollOverscanMaxY: 480,
    rollBufferGuardRatio: 0.22,
    longPressDurationMs: 560,
    longPressMoveTolerance: 12,
  };

  const { getIgnorableSequentialOverlapTrim } = window.MabiUtils;

  function openFilePickerInput(input) {
    if (!input || input.disabled) return;
    const groupedPicker = window.MabiSupportedFilesUi?.openFileInput;
    if (typeof groupedPicker === "function") {
      void groupedPicker(input);
      return;
    }
    input.click();
  }

  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  // Recommended channel palette: pure, high-saturation hues at 30° intervals.
  const CHANNEL_COLORS = [
    "#ff0000", //   0° red
    "#ff8000", //  30° orange
    "#ffff00", //  60° yellow
    "#80ff00", //  90° chartreuse
    "#00ff00", // 120° green
    "#00ff80", // 150° spring green
    "#00ffff", // 180° cyan
    "#0080ff", // 210° azure
    "#0000ff", // 240° blue
    "#8000ff", // 270° violet
    "#ff00ff", // 300° magenta
    "#ff0080", // 330° rose
  ];
  const LEGACY_CHANNEL_COLOR_MAP = new Map([
    ["#e75555", "#ff0000"],
    ["#e79e55", "#ff8000"],
    ["#e7e755", "#ffff00"],
    ["#9ee755", "#80ff00"],
    ["#55e755", "#00ff00"],
    ["#55e79e", "#00ff80"],
    ["#55e7e7", "#00ffff"],
    ["#559ee7", "#0080ff"],
    ["#5555e7", "#0000ff"],
    ["#9e55e7", "#8000ff"],
    ["#e755e7", "#ff00ff"],
    ["#e7559e", "#ff0080"],
  ]);
  const SOURCE_ROOT_COLOR = "#7f8998";
  const AUTOSAVE_DB_NAME = "mobibard-autosave";
  const AUTOSAVE_DB_VERSION = 1;
  const AUTOSAVE_STORE_NAME = "snapshots";
  const AUTOSAVE_KEY = "latest";
  const AUTOSAVE_FALLBACK_KEY = "mobibard-autosave-fallback";

  const CANVAS_THEME = {
    dark: {
      rollPre: "#14161a",
      rollBackground: "#17191e",
      blackRow: "#1c1f25",
      octaveLine: "#3a404b",
      pitchLine: "#2a2e36",
      measureGrid: "#5b6372",
      beatGrid: "#414753",
      minorGrid: "#2c3038",
      selectedStroke: "#ffffff",
      noteStroke: "#ffffff",
      selectedShine: "rgba(255,255,255,0.18)",
      resizeHandle: "rgba(15,18,24,0.72)",
      resizeHandleLine: "rgba(255,255,255,0.9)",
      marqueeFill: "rgba(122, 162, 247, 0.12)",
      marqueeStroke: "rgba(174, 199, 255, 0.95)",
      timelineBackground: "#242830",
      timelinePre: "#1d2026",
      timelineMeasure: "#7d8799",
      timelineBeat: "#555d6b",
      measureTextOutline: "rgba(36,40,48,0.96)",
      measureText: "#f3f6fb",
      midiReferenceStroke: "#ffffff",
      midiReferenceFill: "rgba(116, 184, 255, 0.42)",
    },
    light: {
      rollPre: "#d4dbe4",
      rollBackground: "#ffffff",
      blackRow: "#e4e9ef",
      octaveLine: "#667487",
      pitchLine: "#b7c0cb",
      measureGrid: "#4d5b6d",
      beatGrid: "#7c8898",
      minorGrid: "#c5ccd5",
      selectedStroke: "#ffffff",
      noteStroke: "#ffffff",
      selectedShine: "rgba(255,255,255,0.58)",
      resizeHandle: "rgba(18,28,41,0.82)",
      resizeHandleLine: "rgba(255,255,255,0.98)",
      marqueeFill: "rgba(35, 89, 185, 0.16)",
      marqueeStroke: "rgba(30, 78, 165, 1)",
      timelineBackground: "#e3e9f0",
      timelinePre: "#cfd7e1",
      timelineMeasure: "#465568",
      timelineBeat: "#7d8999",
      measureTextOutline: "rgba(227,233,240,1)",
      measureText: "#101820",
      midiReferenceStroke: "#ffffff",
      midiReferenceFill: "rgba(25, 105, 170, 0.46)",
    },
  };

  const elements = {
    app: document.querySelector("#app"),
    workspace: document.querySelector(".workspace"),
    appContent: document.querySelector(".app-content"),
    sidePanel: document.querySelector("#sidePanel"),
    sidebarChannelsTab: document.querySelector("#sidebarChannelsTab"),
    sidebarHistoryTab: document.querySelector("#sidebarHistoryTab"),
    pianoSection: document.querySelector(".piano-section"),
    historyPanel: document.querySelector("#historyPanel"),
    historyCornerToggle: document.querySelector("#historyCornerToggle"),
    historyUndoButton: document.querySelector("#historyUndoButton"),
    historyRedoButton: document.querySelector("#historyRedoButton"),
    historyList: document.querySelector("#historyList"),
    fileButton: document.querySelector("#fileButton"),
    fileMenu: document.querySelector("#fileMenu"),
    editButton: document.querySelector("#editButton"),
    editMenu: document.querySelector("#editMenu"),
    editUndoButton: document.querySelector("#editUndoButton"),
    editRedoButton: document.querySelector("#editRedoButton"),
    editCopyButton: document.querySelector("#editCopyButton"),
    editCutButton: document.querySelector("#editCutButton"),
    editPasteButton: document.querySelector("#editPasteButton"),
    editSelectAllButton: document.querySelector("#editSelectAllButton"),
    editDeleteButton: document.querySelector("#editDeleteButton"),
    editNoteVolumeButton: document.querySelector("#editNoteVolumeButton"),
    fileExportButton: document.querySelector("#fileExportButton"),
    mmlImportButton: document.querySelector("#mmlImportButton"),
    newButton: document.querySelector("#newButton"),
    openButton: document.querySelector("#openButton"),
    saveButton: document.querySelector("#saveButton"),
    midiOpenButton: document.querySelector("#midiOpenButton"),
    audioOpenButton: document.querySelector("#audioOpenButton"),
    fileInput: document.querySelector("#fileInput"),
    mmlImportFileInput: document.querySelector("#mmlImportFileInput"),
    midiFileInput: document.querySelector("#midiFileInput"),
    audioFileInput: document.querySelector("#audioFileInput"),
    jumpStartButton: document.querySelector("#jumpStartButton"),
    playButton: document.querySelector("#playButton"),
    jumpEndButton: document.querySelector("#jumpEndButton"),
    playbackTime: document.querySelector("#playbackTime"),
    volumeButton: document.querySelector("#volumeButton"),
    volumeMenu: document.querySelector("#volumeMenu"),
    volumeSlider: document.querySelector("#volumeSlider"),
    volumeValue: document.querySelector("#volumeValue"),
    volumeResetButton: document.querySelector("#volumeResetButton"),
    playbackRateButton: document.querySelector("#playbackRateButton"),
    playbackRateMenu: document.querySelector("#playbackRateMenu"),
    playbackRateSlider: document.querySelector("#playbackRateSlider"),
    playbackRateValue: document.querySelector("#playbackRateValue"),
    playbackRateResetButton: document.querySelector("#playbackRateResetButton"),
    measureSpaceButton: document.querySelector("#measureSpaceButton"),
    beatSpaceButton: document.querySelector("#beatSpaceButton"),
    snapSelect: document.querySelector("#snapSelect"),
    noteVolumeDisplaySelect: document.querySelector("#noteVolumeDisplaySelect"),
    pitchSpacingSelect: document.querySelector("#pitchSpacingSelect"),
    zoomButton: document.querySelector("#zoomButton"),
    zoomMenu: document.querySelector("#zoomMenu"),
    zoomSlider: document.querySelector("#zoomSlider"),
    zoomMinLabel: document.querySelector("#zoomMinLabel"),
    zoomMaxLabel: document.querySelector("#zoomMaxLabel"),
    zoomValue: document.querySelector("#zoomValue"),
    zoomResetButton: document.querySelector("#zoomResetButton"),
    themeButton: document.querySelector("#themeButton"),
    themeIcon: document.querySelector("#themeIcon"),
    themeMenu: document.querySelector("#themeMenu"),
    languageSelect: document.querySelector("#languageSelect"),
    googleAccountButton: document.querySelector("#googleAccountButton"),
    googleAccountMenu: document.querySelector("#googleAccountMenu"),
    googleLoginButton: document.querySelector("#googleLoginButton"),
    noteToolButton: document.querySelector("#noteToolButton"),
    selectToolButton: document.querySelector("#selectToolButton"),
    timelineCanvas: document.querySelector("#timelineCanvas"),
    keyboardCanvas: document.querySelector("#keyboardCanvas"),
    rollViewport: document.querySelector("#rollViewport"),
    rollSpacer: document.querySelector("#rollSpacer"),
    rollCanvas: document.querySelector("#rollCanvas"),
    playhead: document.querySelector("#playhead"),
    horizontalScrollBar: document.querySelector("#horizontalScrollBar"),
    horizontalScrollThumb: document.querySelector("#horizontalScrollThumb"),
    verticalScrollBar: document.querySelector("#verticalScrollBar"),
    verticalScrollThumb: document.querySelector("#verticalScrollThumb"),
    verticalSplitter: document.querySelector("#verticalSplitter"),
    channelPanel: document.querySelector("#channelPanel"),
    channelTabs: document.querySelector("#channelTabs"),
    addChannelButton: document.querySelector("#addChannelButton"),
    deleteChannelsButton: document.querySelector("#deleteChannelsButton"),
    copyChannelButton: document.querySelector("#copyChannelButton"),
    pasteChannelButton: document.querySelector("#pasteChannelButton"),
    noteVolumeButton: document.querySelector("#noteVolumeButton"),
    channelNameInput: document.querySelector("#channelNameInput"),
    channelInstrumentSelect: document.querySelector("#channelInstrumentSelect"),
    deleteChannelButton: document.querySelector("#deleteChannelButton"),
    clearChannelButton: document.querySelector("#clearChannelButton"),
    channelMuteMixerButton: document.querySelector("#channelMuteMixerButton"),
    channelMuteBackdrop: document.querySelector("#channelMuteBackdrop"),
    channelMuteMixer: document.querySelector("#channelMuteMixer"),
    channelMuteMixerCloseButton: document.querySelector("#channelMuteMixerCloseButton"),
    muteAllChannelsButton: document.querySelector("#muteAllChannelsButton"),
    unmuteAllChannelsButton: document.querySelector("#unmuteAllChannelsButton"),
    channelMuteList: document.querySelector("#channelMuteList"),
    channelTitle: document.querySelector("#channelTitle"),
    channelColorInput: document.querySelector("#channelColorInput"),
    dirtyIndicator: document.querySelector("#dirtyIndicator"),
    infoChannel: document.querySelector("#infoChannel"),
    infoNoteCount: document.querySelector("#infoNoteCount"),
    infoLength: document.querySelector("#infoLength"),
    infoSelection: document.querySelector("#infoSelection"),
    noteChannelView: document.querySelector("#noteChannelView"),
    midiReferenceView: document.querySelector("#midiReferenceView"),
    midiReferenceStatus: document.querySelector("#midiReferenceStatus"),
    midiReferenceLoadButton: document.querySelector("#midiReferenceLoadButton"),
    midiReferenceFileName: document.querySelector("#midiReferenceFileName"),
    midiReferenceShowAllButton: document.querySelector("#midiReferenceShowAllButton"),
    midiReferenceHideAllButton: document.querySelector("#midiReferenceHideAllButton"),
    midiReferenceClearButton: document.querySelector("#midiReferenceClearButton"),
    midiInstrumentList: document.querySelector("#midiInstrumentList"),
    midiCopySelectedButton: document.querySelector("#midiCopySelectedButton"),
    midiCopyInstrumentButton: document.querySelector("#midiCopyInstrumentButton"),
    midiTransferButton: document.querySelector("#midiTransferButton"),
    mmlImportBackdrop: document.querySelector("#mmlImportBackdrop"),
    mmlImportDialog: document.querySelector("#mmlImportDialog"),
    mmlImportCloseButton: document.querySelector("#mmlImportCloseButton"),
    mmlImportCancelButton: document.querySelector("#mmlImportCancelButton"),
    mmlImportApplyButton: document.querySelector("#mmlImportApplyButton"),
    mmlImportChooseFileButton: document.querySelector("#mmlImportChooseFileButton"),
    mmlImportPasteButton: document.querySelector("#mmlImportPasteButton"),
    mmlImportText: document.querySelector("#mmlImportText"),
    mmlImportApplyTempo: document.querySelector("#mmlImportApplyTempo"),
    mmlImportStatus: document.querySelector("#mmlImportStatus"),
    mmlImportSourceLabel: document.querySelector("#mmlImportSourceLabel"),
    mmlImportChannelSection: document.querySelector("#mmlImportChannelSection"),
    mmlImportChannelTitle: document.querySelector("#mmlImportChannelTitle"),
    mmlImportChannelList: document.querySelector("#mmlImportChannelList"),
    mmlImportSelectAllButton: document.querySelector("#mmlImportSelectAllButton"),
    mmlImportClearSelectionButton: document.querySelector("#mmlImportClearSelectionButton"),
    midiImportBackdrop: document.querySelector("#midiImportBackdrop"),
    midiImportDialog: document.querySelector("#midiImportDialog"),
    midiImportTitle: document.querySelector("#midiImportTitle"),
    midiImportSourceLabel: document.querySelector("#midiImportSourceLabel"),
    midiImportSummary: document.querySelector("#midiImportSummary"),
    midiImportTargetMode: document.querySelector("#midiImportTargetMode"),
    midiImportQuantize: document.querySelector("#midiImportQuantize"),
    midiImportIgnoreSingle64thOverlap: document.querySelector("#midiImportIgnoreSingle64thOverlap"),
    midiImportMidiControls: document.querySelector("#midiImportMidiControls"),
    midiImportPreviewSelectedButton: document.querySelector("#midiImportPreviewSelectedButton"),
    midiImportPreviewAllButton: document.querySelector("#midiImportPreviewAllButton"),
    midiImportSelectionActions: document.querySelector("#midiImportSelectionActions"),
    midiImportTextSelectionActions: document.querySelector("#midiImportTextSelectionActions"),
    midiImportSelectionList: document.querySelector("#midiImportSelectionList"),
    midiImportSelectAllButton: document.querySelector("#midiImportSelectAllButton"),
    midiImportClearAllButton: document.querySelector("#midiImportClearAllButton"),
    midiImportTextSelectAllButton: document.querySelector("#midiImportTextSelectAllButton"),
    midiImportTextClearAllButton: document.querySelector("#midiImportTextClearAllButton"),
    midiImportStatus: document.querySelector("#midiImportStatus"),
    midiImportCloseButton: document.querySelector("#midiImportCloseButton"),
    midiImportCancelButton: document.querySelector("#midiImportCancelButton"),
    midiImportApplyButton: document.querySelector("#midiImportApplyButton"),
    midiImportNewButton: document.querySelector("#midiImportNewButton"),
    mmlExportBackdrop: document.querySelector("#mmlExportBackdrop"),
    mmlExportDialog: document.querySelector("#mmlExportDialog"),
    mmlExportCloseButton: document.querySelector("#mmlExportCloseButton"),
    mmlExportSelectAllButton: document.querySelector("#mmlExportSelectAllButton"),
    mmlExportClearAllButton: document.querySelector("#mmlExportClearAllButton"),
    mmlExportChannelList: document.querySelector("#mmlExportChannelList"),
    mmlExportSummary: document.querySelector("#mmlExportSummary"),
    mmlExportCancelButton: document.querySelector("#mmlExportCancelButton"),
    mmlExportApplyButton: document.querySelector("#mmlExportApplyButton"),
    channelDeleteBackdrop: document.querySelector("#channelDeleteBackdrop"),
    channelDeleteDialog: document.querySelector("#channelDeleteDialog"),
    channelDeleteCloseButton: document.querySelector("#channelDeleteCloseButton"),
    channelDeleteCancelButton: document.querySelector("#channelDeleteCancelButton"),
    channelDeleteApplyButton: document.querySelector("#channelDeleteApplyButton"),
    channelDeleteSelectAllButton: document.querySelector("#channelDeleteSelectAllButton"),
    channelDeleteClearAllButton: document.querySelector("#channelDeleteClearAllButton"),
    channelDeleteList: document.querySelector("#channelDeleteList"),
    channelDeleteSummary: document.querySelector("#channelDeleteSummary"),
    midiTransferBackdrop: document.querySelector("#midiTransferBackdrop"),
    midiTransferDialog: document.querySelector("#midiTransferDialog"),
    midiTransferCloseButton: document.querySelector("#midiTransferCloseButton"),
    midiTransferCancelButton: document.querySelector("#midiTransferCancelButton"),
    midiTransferApplyButton: document.querySelector("#midiTransferApplyButton"),
    midiTransferSourceLabel: document.querySelector("#midiTransferSourceLabel"),
    midiTransferSourceMode: document.querySelector("#midiTransferSourceMode"),
    midiTransferConflictMode: document.querySelector("#midiTransferConflictMode"),
    midiTransferChannelList: document.querySelector("#midiTransferChannelList"),
    midiTransferSummary: document.querySelector("#midiTransferSummary"),
    midiTransferSelectAllButton: document.querySelector("#midiTransferSelectAllButton"),
    midiTransferClearAllButton: document.querySelector("#midiTransferClearAllButton"),
    noteVolumeBackdrop: document.querySelector("#noteVolumeBackdrop"),
    noteVolumeDialog: document.querySelector("#noteVolumeDialog"),
    noteVolumeCloseButton: document.querySelector("#noteVolumeCloseButton"),
    noteVolumeCancelButton: document.querySelector("#noteVolumeCancelButton"),
    noteVolumeApplyButton: document.querySelector("#noteVolumeApplyButton"),
    noteVolumeSlider: document.querySelector("#noteVolumeSlider"),
    noteVolumeValue: document.querySelector("#noteVolumeValue"),
    noteVolumeSelectionLabel: document.querySelector("#noteVolumeSelectionLabel"),
    tempoEditorBackdrop: document.querySelector("#tempoEditorBackdrop"),
    tempoEditorDialog: document.querySelector("#tempoEditorDialog"),
    tempoEditorTitle: document.querySelector("#tempoEditorTitle"),
    tempoEditorPosition: document.querySelector("#tempoEditorPosition"),
    tempoBpmInput: document.querySelector("#tempoBpmInput"),
    tempoEditorCloseButton: document.querySelector("#tempoEditorCloseButton"),
    tempoEditorCancelButton: document.querySelector("#tempoEditorCancelButton"),
    tempoEditorApplyButton: document.querySelector("#tempoEditorApplyButton"),
    tempoEditorDeleteButton: document.querySelector("#tempoEditorDeleteButton"),
    timeEditBackdrop: document.querySelector("#timeEditBackdrop"),
    timeEditDialog: document.querySelector("#timeEditDialog"),
    timeEditTitle: document.querySelector("#timeEditTitle"),
    timeEditPosition: document.querySelector("#timeEditPosition"),
    timeEditAmountInput: document.querySelector("#timeEditAmountInput"),
    timeEditUnitLabel: document.querySelector("#timeEditUnitLabel"),
    timeEditCloseButton: document.querySelector("#timeEditCloseButton"),
    timeEditCancelButton: document.querySelector("#timeEditCancelButton"),
    timeEditInsertButton: document.querySelector("#timeEditInsertButton"),
    timeEditDeleteButton: document.querySelector("#timeEditDeleteButton"),
    midiReferenceMessage: document.querySelector("#midiReferenceMessage"),
    midiInfoFormat: document.querySelector("#midiInfoFormat"),
    midiInfoTrackCount: document.querySelector("#midiInfoTrackCount"),
    midiInfoInstrumentCount: document.querySelector("#midiInfoInstrumentCount"),
    midiInfoTitle: document.querySelector("#midiInfoTitle"),
    midiInfoNoteCount: document.querySelector("#midiInfoNoteCount"),
    midiInfoLength: document.querySelector("#midiInfoLength"),
    midiInfoSelection: document.querySelector("#midiInfoSelection"),
    midiSourceIdentity: document.querySelector("#midiSourceIdentity"),
    midiSourceColorInput: document.querySelector("#midiSourceColorInput"),
    midiSourceNameInput: document.querySelector("#midiSourceNameInput"),
    midiSourceInstrumentControl: document.querySelector("#midiSourceInstrumentControl"),
    midiSourceInstrumentInfo: document.querySelector("#midiSourceInstrumentInfo"),
    audioSourceView: document.querySelector("#audioSourceView"),
    audioSourceIdentity: document.querySelector("#audioSourceIdentity"),
    audioSourceColorInput: document.querySelector("#audioSourceColorInput"),
    audioSourceNameInput: document.querySelector("#audioSourceNameInput"),
    audioSourceOffsetInput: document.querySelector("#audioSourceOffsetInput"),
    audioSourceVolumeInput: document.querySelector("#audioSourceVolumeInput"),
    audioSourceVolumeValue: document.querySelector("#audioSourceVolumeValue"),
    audioSourceRateInput: document.querySelector("#audioSourceRateInput"),
    audioSourceDeleteButton: document.querySelector("#audioSourceDeleteButton"),
    audioInfoTitle: document.querySelector("#audioInfoTitle"),
    audioInfoStart: document.querySelector("#audioInfoStart"),
    audioInfoEnd: document.querySelector("#audioInfoEnd"),
    audioInfoDuration: document.querySelector("#audioInfoDuration"),
    audioLaneLabel: document.querySelector("#audioLaneLabel"),
    audioLaneViewport: document.querySelector("#audioLaneViewport"),
    audioLaneContent: document.querySelector("#audioLaneContent"),
    confirmDialog: document.querySelector("#confirmDialog"),
    confirmDialogTitle: document.querySelector("#confirmDialogTitle"),
    confirmDialogMessage: document.querySelector("#confirmDialogMessage"),
    confirmDialogCancel: document.querySelector("#confirmDialogCancel"),
    confirmDialogConfirm: document.querySelector("#confirmDialogConfirm"),
    contextMenu: document.querySelector("#contextMenu"),
    toast: document.querySelector("#toast"),
  };

  const state = {
    projectName: "새 프로젝트",
    snapValue: 4,
    rowHeight: CONFIG.defaultRowHeight,
    zoom: 1,
    theme: "dark",
    language: "ko",
    timelineBeats: CONFIG.beatsPerMeasure,
    activeChannel: 0,
    activePanel: "notes",
    sidebarTab: "channels",
    collapsedMidiDocumentIds: new Set(),
    collapsedChannelGroups: { edit: false, source: false },
    editTool: "note",
    selectedNoteIds: new Set(),
    nextNoteId: 1,
    dirty: false,
    channels: createDefaultChannels(),
    tempos: createDefaultTempos(),
    nextTempoId: 2,
    interaction: null,
    tempoDrag: null,
    tempoTouchTap: null,
    tempoEditor: { mode: null, tempoId: null, beat: 0 },
    timeEdit: { unit: "measure", beat: 0 },
    suppressContextMenuUntil: 0,
    suppressNextContextMenu: false,
    playhead: {
      beat: 0,
      pointerId: null,
      previewBeat: -1,
      previewAt: 0,
    },
    keyboard: {
      pointerId: null,
      pressedPitch: null,
      hoverPitch: null,
      voice: null,
      requestToken: 0,
      previewPitch: null,
      previewStartedAt: 0,
      previewTimer: 0,
      previewVoice: null,
      previewRequestToken: 0,
      playbackPitches: new Set(),
    },
    playback: {
      running: false,
      loading: false,
      requestToken: 0,
      startedAt: 0,
      startBeat: 0,
      endBeat: 0,
      startSeconds: 0,
      endSeconds: 0,
      animationFrame: 0,
      scrollAnimation: null,
      schedulerTimer: 0,
      audioStartTime: 0,
      notes: [],
      scheduleIndex: 0,
      scheduledNoteKeys: new Set(),
      voiceRecords: new Map(),
      visualEvents: [],
      visualEventIndex: 0,
      visualPitchCounts: new Map(),
      tempoMap: null,
      lastTimelineDrawAt: 0,
      keyboardDrawAt: 0,
      keyboardDrawTimer: 0,
      scheduleContinuation: 0,
      audioSources: new Set(),
      autoGainScale: 1,
    },
    viewportScroll: {
      snapTimer: 0,
      drawFrame: 0,
    },
    zoomWheel: {
      accumulatedDelta: 0,
      lastEventAt: 0,
      lastStepAt: 0,
      mode: null,
      selectionSignature: "",
      volumeHistoryEntryId: null,
      lastVolumeEditAt: 0,
    },
    mmlImport: {
      parseTimer: 0,
      parsed: null,
      sourceFileName: "",
      format: "mml",
      candidates: [],
      selectedCandidateIndexes: new Set(),
      candidateSignature: "",
    },
    midiImport: {
      fileName: "",
      sourceType: "midi",
      sourceLabel: "MIDI",
      kind: "midi",
      midiBuffer: null,
      preview: null,
      text: "",
      textFormat: "",
      textCandidates: [],
      textParsed: null,
      selectedGroupIds: new Set(),
      selectedTextIndexes: new Set(),
      previewingKey: "",
      previewStopTimer: 0,
      busy: false,
    },
    dragAutoScroll: {
      animationFrame: 0,
      clientX: 0,
      clientY: 0,
    },
    channelDrag: {
      sourceId: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      dragging: false,
      sourceElement: null,
      previewOrder: [],
    },
    customScrollDrag: null,
    longPress: null,
    masterVolume: 1,
    noteVolumeDisplay: "all",
    playbackRate: 1,
    rollSurface: {
      originX: 0,
      originY: 0,
      width: 1,
      height: 1,
      overscanX: 0,
      overscanY: 0,
    },
    suppressNextRollPointerUp: null,
    history: {
      undoStack: [],
      redoStack: [],
      currentEntry: null,
      restoring: false,
      nextId: 1,
      collapsed: false,
    },
    midiDocuments: [],
    activeMidiDocumentId: null,
    nextMidiDocumentId: 1,
    audioClips: [],
    activeAudioClipId: null,
    nextAudioClipId: 1,
    audioRuntime: new Map(),
    audioLaneInteraction: null,
    midiReference: createDefaultMidiReference(),
    midiSelectedNoteKeys: new Set(),
    midiReferenceRuntime: {
      noteBuckets: new Map(),
      indexedNoteCount: 0,
    },
    noteClipboard: null,
    channelNoteRuntime: new Map(),
    autosave: {
      timer: 0,
      saving: false,
      queued: false,
      restoring: false,
      pendingChanges: false,
      failed: false,
      lastSavedAt: 0,
    },
  };

  const EditorSoundBankPlayer = window.MobibardEditorSoundBank?.Player;
  if (typeof EditorSoundBankPlayer !== "function") {
    throw new Error("Editor SoundBank 플러그인을 불러오지 못했습니다.");
  }
  const audioEngine = new EditorSoundBankPlayer({
    bankNumber: 0,
    presetNumber: 0,
    volume: state.masterVolume,
    onStatus: () => {},
  });

  function openAutosaveDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = window.indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
          database.createObjectStore(AUTOSAVE_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("자동 저장 DB를 열지 못했습니다."));
    });
  }

  async function writeAutosaveSnapshot(payload) {
    try {
      const database = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(AUTOSAVE_STORE_NAME, "readwrite");
        transaction.objectStore(AUTOSAVE_STORE_NAME).put(payload);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("자동 저장에 실패했습니다."));
        transaction.onabort = () => reject(transaction.error || new Error("자동 저장이 중단되었습니다."));
      });
      database.close();
      try { window.localStorage.removeItem(AUTOSAVE_FALLBACK_KEY); } catch {}
      return true;
    } catch (error) {
      try {
        const fallbackPayload = { ...payload, audioAssets: [] };
        window.localStorage.setItem(AUTOSAVE_FALLBACK_KEY, JSON.stringify(fallbackPayload));
        return true;
      } catch {
        console.warn("Mobibard autosave failed", error);
        return false;
      }
    }
  }

  async function readAutosaveSnapshot() {
    try {
      const database = await openAutosaveDatabase();
      const result = await new Promise((resolve, reject) => {
        const transaction = database.transaction(AUTOSAVE_STORE_NAME, "readonly");
        const request = transaction.objectStore(AUTOSAVE_STORE_NAME).get(AUTOSAVE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("자동 저장을 읽지 못했습니다."));
      });
      database.close();
      if (result?.data) return result;
    } catch {}
    try {
      const raw = window.localStorage.getItem(AUTOSAVE_FALLBACK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.data ? parsed : null;
    } catch {
      return null;
    }
  }

  function scheduleAutosave(delay = 420) {
    if (state.autosave.restoring) return;
    state.autosave.pendingChanges = true;
    window.clearTimeout(state.autosave.timer);
    state.autosave.timer = window.setTimeout(() => {
      state.autosave.timer = 0;
      void saveAutosaveNow();
    }, Math.max(0, Number(delay) || 0));
  }

  async function saveAutosaveNow() {
    if (state.autosave.restoring) return false;
    window.clearTimeout(state.autosave.timer);
    state.autosave.timer = 0;
    if (state.autosave.saving) {
      state.autosave.queued = true;
      return false;
    }
    state.autosave.saving = true;
    state.autosave.queued = false;
    let success = false;
    try {
      const payload = {
        id: AUTOSAVE_KEY,
        version: 1,
        savedAt: Date.now(),
        data: serializeProject(),
        audioAssets: getAutosaveAudioAssets(),
      };
      success = await writeAutosaveSnapshot(payload);
      state.autosave.failed = !success;
      if (success) {
        state.autosave.pendingChanges = false;
        state.autosave.lastSavedAt = payload.savedAt;
      }
    } catch (error) {
      state.autosave.failed = true;
      console.warn("Mobibard autosave failed", error);
    } finally {
      state.autosave.saving = false;
      if (state.autosave.queued || state.autosave.pendingChanges) {
        state.autosave.queued = false;
        scheduleAutosave(120);
      }
    }
    return success;
  }

  async function restoreAutosaveOnStartup() {
    const snapshot = await readAutosaveSnapshot();
    if (!snapshot?.data) return false;
    state.autosave.restoring = true;
    try {
      const virtualFile = {
        name: "자동 저장.mmlproj.json",
        text: async () => JSON.stringify(snapshot.data),
      };
      await loadProjectFromFile(virtualFile, { notify: false });
      await restoreAutosaveAudioAssets(snapshot.audioAssets);
      state.autosave.lastSavedAt = Number(snapshot.savedAt) || Date.now();
      state.autosave.pendingChanges = false;
      state.autosave.failed = false;
      state.dirty = false;
      updateDirtyState();
      showToast("자동 저장된 편집 상태를 복구했습니다.");
      return true;
    } catch (error) {
      console.warn("Mobibard autosave restore failed", error);
      return false;
    } finally {
      state.autosave.restoring = false;
    }
  }

  function isValidChannelColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ""));
  }

  function normalizeChannelColor(value) {
    const normalized = String(value || "").toLowerCase();
    return LEGACY_CHANNEL_COLOR_MAP.get(normalized) || normalized;
  }

  function getChannelColor(channel, fallbackIndex = 0) {
    return isValidChannelColor(channel?.color)
      ? normalizeChannelColor(channel.color)
      : CHANNEL_COLORS[fallbackIndex % CHANNEL_COLORS.length];
  }

  function darkenHexColor(color, amount = 0.46) {
    const normalized = isValidChannelColor(color) ? normalizeChannelColor(color) : "#808080";
    const strength = clamp(Number(amount) || 0, 0, 0.9);
    const keep = 1 - strength;
    const component = (offset) => Math.round(parseInt(normalized.slice(offset, offset + 2), 16) * keep)
      .toString(16)
      .padStart(2, "0");
    return `#${component(1)}${component(3)}${component(5)}`;
  }

  function getMidiGroupColor(group, fallbackIndex = 0) {
    return isValidChannelColor(group?.color)
      ? normalizeChannelColor(group.color)
      : CHANNEL_COLORS[(Number(group?.colorIndex) || fallbackIndex) % CHANNEL_COLORS.length];
  }

  function getMidiGroupDisplayName(group, fallback = "악기 채널") {
    if (!group) return fallback;
    const channels = Array.isArray(group.channels) ? group.channels : [group.channel].filter((value) => value != null);
    const isDrums = channels.some((channel) => Number(channel) === 9)
      || String(group.programName || group.name || "").toLowerCase() === "drums";
    if (isDrums) return `Ch10 · ${group.programName || group.name || "Drums"}`;
    const program = clamp(Math.round(Number(group.program) || 0), 0, 127);
    return `#${program + 1} · ${group.programName || group.name || GM_PROGRAM_NAMES[program] || fallback}`;
  }

  let activeColorPaletteInput = null;
  let colorPaletteMenu = null;

  function closeRecommendedColorPalette() {
    if (!colorPaletteMenu) return;
    colorPaletteMenu.hidden = true;
    activeColorPaletteInput = null;
  }

  function ensureRecommendedColorPalette() {
    if (colorPaletteMenu) return colorPaletteMenu;
    const menu = document.createElement("div");
    menu.className = "recommended-color-palette";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "추천 채널 색상");
    const title = document.createElement("div");
    title.className = "recommended-color-palette-title";
    title.textContent = "추천 색상";
    const grid = document.createElement("div");
    grid.className = "recommended-color-grid";
    CHANNEL_COLORS.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recommended-color-swatch";
      button.style.setProperty("--swatch-color", color);
      button.title = `${index + 1} · ${color}`;
      button.setAttribute("aria-label", `추천 색상 ${index + 1}`);
      button.addEventListener("click", () => {
        const input = activeColorPaletteInput;
        if (!input) return;
        input.value = color;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        closeRecommendedColorPalette();
      });
      grid.append(button);
    });
    const custom = document.createElement("button");
    custom.type = "button";
    custom.className = "recommended-color-custom";
    custom.textContent = "직접 선택…";
    custom.addEventListener("click", () => {
      const input = activeColorPaletteInput;
      closeRecommendedColorPalette();
      if (input && !input.disabled) input.click();
    });
    menu.append(title, grid, custom);
    document.body.append(menu);
    colorPaletteMenu = menu;
    document.addEventListener("pointerdown", (event) => {
      if (menu.hidden) return;
      if (menu.contains(event.target) || event.target === activeColorPaletteInput) return;
      closeRecommendedColorPalette();
    });
    return menu;
  }

  function openRecommendedColorPalette(input) {
    if (!input || input.disabled) return false;
    const menu = ensureRecommendedColorPalette();
    activeColorPaletteInput = input;
    const rect = input.getBoundingClientRect();
    menu.hidden = false;
    const width = menu.offsetWidth || 196;
    const height = menu.offsetHeight || 118;
    const left = clamp(rect.left, 6, Math.max(6, window.innerWidth - width - 6));
    const below = rect.bottom + 6;
    const top = below + height <= window.innerHeight - 6 ? below : Math.max(6, rect.top - height - 6);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    return true;
  }

  function bindRecommendedColorPalette(input) {
    if (!input) return;
    input.addEventListener("pointerdown", (event) => {
      if (input.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      openRecommendedColorPalette(input);
    });
    input.addEventListener("click", (event) => {
      // Trusted clicks come from the visible color chip and open the 12-color palette.
      // Programmatic input.click() from “직접 선택…” stays available for the native picker.
      if (!event.isTrusted || input.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      openRecommendedColorPalette(input);
    });
  }

  function updateSourceColorControl(color, editable = false) {
    const normalized = isValidChannelColor(color) ? String(color).toLowerCase() : SOURCE_ROOT_COLOR;
    elements.midiSourceIdentity?.style.setProperty("--channel-current-color", normalized);
    elements.midiSourceColorInput?.closest(".source-color-control")?.style.setProperty("--channel-current-color", normalized);
    if (elements.midiSourceColorInput) {
      elements.midiSourceColorInput.value = normalized;
      elements.midiSourceColorInput.disabled = !editable;
      elements.midiSourceColorInput.title = editable ? "악기 채널 색상 변경" : "원본 루트 색상은 고정됩니다.";
    }
    elements.midiSourceIdentity?.classList.toggle("source-root-identity", !editable);
  }

  function updateChannelColorControl(color) {
    const normalized = isValidChannelColor(color) ? String(color).toLowerCase() : CHANNEL_COLORS[0];
    const identity = elements.channelColorInput?.closest(".channel-identity-control");
    const control = elements.channelColorInput?.closest(".channel-color-control");
    identity?.style.setProperty("--channel-current-color", normalized);
    control?.style.setProperty("--channel-current-color", normalized);
  }

  function createDefaultChannel(id, fallbackIndex = 0) {
    return {
      id,
      name: `Ch${id}`,
      color: CHANNEL_COLORS[fallbackIndex % CHANNEL_COLORS.length],
      muted: false,
      visible: true,
      instrument: "Acoustic Grand Piano",
      notes: [],
    };
  }

  function createDefaultChannels(count = CONFIG.defaultChannelCount) {
    return Array.from({ length: count }, (_, index) => createDefaultChannel(index + 1, index));
  }

  function createDefaultTempos() {
    return [{ id: 1, beat: 0, bpm: 120, fixed: true }];
  }

  const GM_PROGRAM_NAMES = [
    "Acoustic Grand Piano",
    "Bright Acoustic Piano",
    "Electric Grand Piano",
    "Honky-tonk Piano",
    "Electric Piano 1",
    "Electric Piano 2",
    "Harpsichord",
    "Clavinet",
    "Celesta",
    "Glockenspiel",
    "Music Box",
    "Vibraphone",
    "Marimba",
    "Xylophone",
    "Tubular Bells",
    "Dulcimer",
    "Drawbar Organ",
    "Percussive Organ",
    "Rock Organ",
    "Church Organ",
    "Reed Organ",
    "Accordion",
    "Harmonica",
    "Tango Accordion",
    "Acoustic Guitar (nylon)",
    "Acoustic Guitar (steel)",
    "Electric Guitar (jazz)",
    "Electric Guitar (clean)",
    "Electric Guitar (muted)",
    "Overdriven Guitar",
    "Distortion Guitar",
    "Guitar Harmonics",
    "Acoustic Bass",
    "Electric Bass (finger)",
    "Electric Bass (pick)",
    "Fretless Bass",
    "Slap Bass 1",
    "Slap Bass 2",
    "Synth Bass 1",
    "Synth Bass 2",
    "Violin",
    "Viola",
    "Cello",
    "Contrabass",
    "Tremolo Strings",
    "Pizzicato Strings",
    "Orchestral Harp",
    "Timpani",
    "String Ensemble 1",
    "String Ensemble 2",
    "Synth Strings 1",
    "Synth Strings 2",
    "Choir Aahs",
    "Voice Oohs",
    "Synth Voice",
    "Orchestra Hit",
    "Trumpet",
    "Trombone",
    "Tuba",
    "Muted Trumpet",
    "French Horn",
    "Brass Section",
    "Synth Brass 1",
    "Synth Brass 2",
    "Soprano Sax",
    "Alto Sax",
    "Tenor Sax",
    "Baritone Sax",
    "Oboe",
    "English Horn",
    "Bassoon",
    "Clarinet",
    "Piccolo",
    "Flute",
    "Recorder",
    "Pan Flute",
    "Blown Bottle",
    "Shakuhachi",
    "Whistle",
    "Ocarina",
    "Lead 1 (square)",
    "Lead 2 (sawtooth)",
    "Lead 3 (calliope)",
    "Lead 4 (chiff)",
    "Lead 5 (charang)",
    "Lead 6 (voice)",
    "Lead 7 (fifths)",
    "Lead 8 (bass + lead)",
    "Pad 1 (new age)",
    "Pad 2 (warm)",
    "Pad 3 (polysynth)",
    "Pad 4 (choir)",
    "Pad 5 (bowed)",
    "Pad 6 (metallic)",
    "Pad 7 (halo)",
    "Pad 8 (sweep)",
    "FX 1 (rain)",
    "FX 2 (soundtrack)",
    "FX 3 (crystal)",
    "FX 4 (atmosphere)",
    "FX 5 (brightness)",
    "FX 6 (goblins)",
    "FX 7 (echoes)",
    "FX 8 (sci-fi)",
    "Sitar",
    "Banjo",
    "Shamisen",
    "Koto",
    "Kalimba",
    "Bag Pipe",
    "Fiddle",
    "Shanai",
    "Tinkle Bell",
    "Agogo",
    "Steel Drums",
    "Woodblock",
    "Taiko Drum",
    "Melodic Tom",
    "Synth Drum",
    "Reverse Cymbal",
    "Guitar Fret Noise",
    "Breath Noise",
    "Seashore",
    "Bird Tweet",
    "Telephone Ring",
    "Helicopter",
    "Applause",
    "Gunshot"
  ];

  function isDrumInstrumentName(name) {
    return /^(drums?|gm\s*drums?|percussion)$/i.test(String(name || "").trim());
  }

  function isMidiGroupDrums(group) {
    const channels = Array.isArray(group?.channels) ? group.channels : [group?.channel].filter((value) => value != null);
    return channels.some((channel) => Number(channel) === 9)
      || isDrumInstrumentName(group?.programName || group?.name);
  }

  function getInstrumentProgramFromName(name) {
    const normalized = String(name || "").trim();
    if (isDrumInstrumentName(normalized)) return 0;
    const exact = GM_PROGRAM_NAMES.findIndex((item) => item === normalized);
    if (exact >= 0) return exact;
    if (/piano\s*1|sc-55\s*piano/i.test(normalized)) return 0;
    return 0;
  }

  function getChannelInstrumentProgram(channel) {
    return getInstrumentProgramFromName(channel?.instrument);
  }

  function getChannelInstrumentBank(channel) {
    return isDrumInstrumentName(channel?.instrument) ? 128 : 0;
  }

  function normalizeMidiSourceType(value) {
    const type = String(value || "").trim().toLowerCase();
    return type || "midi";
  }

  function defaultMidiSourceLabel(sourceType) {
    const normalized = normalizeMidiSourceType(sourceType);
    const plugin = window.MabiMusicFormats?.listFormats?.().find((format) => format.id === normalized);
    return plugin?.label || (normalized === "midi" ? "MIDI" : normalized.toUpperCase());
  }

  function createDefaultMidiReference() {
    return {
      id: null,
      title: "",
      fileName: "",
      sourceType: "midi",
      sourceLabel: "MIDI",
      quantizeDivision: 64,
      format: 0,
      division: 480,
      trackCount: 0,
      durationBeats: 0,
      tempoEvents: [{ id: 1, beat: 0, bpm: 120, fixed: true }],
      visible: true,
      muted: false,
      groups: [],
      activeGroupId: null,
      message: "MIDI를 불러오면 같은 악기를 하나의 읽기 전용 채널로 합쳐 표시합니다.",
    };
  }

  function cloneMidiReferenceForStorage(reference = state.midiReference) {
    return {
      id: reference.id == null ? null : String(reference.id),
      title: String(reference.title || ""),
      fileName: String(reference.fileName || ""),
      sourceType: normalizeMidiSourceType(reference.sourceType),
      sourceLabel: String(reference.sourceLabel || defaultMidiSourceLabel(normalizeMidiSourceType(reference.sourceType))),
      quantizeDivision: Number(reference.quantizeDivision) === 32 ? 32 : 64,
      format: Number(reference.format) || 0,
      division: Math.max(1, Number(reference.division) || 480),
      trackCount: Math.max(0, Number(reference.trackCount) || 0),
      durationBeats: Math.max(0, Number(reference.durationBeats) || 0),
      visible: reference.visible !== false,
      muted: Boolean(reference.muted),
      tempoEvents: Array.isArray(reference.tempoEvents)
        ? reference.tempoEvents.map((tempo) => ({
          id: Number(tempo.id) || 0,
          beat: Math.max(0, Number(tempo.beat) || 0),
          bpm: clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
          fixed: Boolean(tempo.fixed),
        }))
        : [],
      groups: Array.isArray(reference.groups)
        ? reference.groups.map((group, groupIndex) => ({
          id: String(group.id || `midi-group-${groupIndex + 1}`),
          name: String(group.name || `MIDI 악기 ${groupIndex + 1}`),
          trackName: String(group.trackName || ""),
          trackIndex: Math.max(0, Number(group.trackIndex) || 0),
          channel: clamp(Math.round(Number(group.channel) || 0), 0, 15),
          program: clamp(Math.round(Number(group.program) || 0), 0, 127),
          programName: String(group.programName || GM_PROGRAM_NAMES[Number(group.program) || 0] || "Unknown"),
          visible: group.visible !== false,
          muted: Boolean(group.muted),
          color: getMidiGroupColor(group, groupIndex),
          colorIndex: Math.max(0, Number(group.colorIndex) || groupIndex),
          notes: Array.isArray(group.notes)
            ? group.notes.map((note, noteIndex) => ({
              id: Number(note.id) || noteIndex + 1,
              pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
              startBeat: Math.max(0, Number(note.startBeat) || 0),
              durationBeat: Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat),
              velocity: normalizeNoteDynamics(note).velocity,
              volume: normalizeNoteDynamics(note).volume,
            }))
            : [],
        }))
        : [],
      activeGroupId: reference.activeGroupId == null ? null : String(reference.activeGroupId),
      message: String(reference.message || ""),
    };
  }

  function stripMidiFileExtension(fileName) {
    const name = String(fileName || "MIDI").replace(/\.(?:mid|midi|kar|mus|musx|mnx(?:\.json)?|mscz|mscx|musicxml|xml|mxl|gp3|gp4|gp5|gpx|gp|tab|vsq|vsqx|vpr|ust|ustx|svp|s5p|ccs)$/i, "").trim();
    return name || "MIDI";
  }

  function makeUniqueMidiTitle(fileName) {
    const base = stripMidiFileExtension(fileName);
    const occupied = new Set(state.midiDocuments.map((document) => String(document.title || "").toLocaleLowerCase()));
    let title = base;
    let suffix = 2;
    while (occupied.has(title.toLocaleLowerCase())) {
      title = `${base} (${suffix++})`;
    }
    return title;
  }

  function getActiveMidiDocument() {
    return state.midiDocuments.find((document) => String(document.id) === String(state.activeMidiDocumentId)) || null;
  }

  function setActiveMidiReference(document) {
    state.midiReference = document || createDefaultMidiReference();
    state.activeMidiDocumentId = document?.id ?? null;
    state.midiReferenceRuntime.noteBuckets = new Map();
    state.midiReferenceRuntime.indexedNoteCount = 0;
    clearMidiSelection();
    if (document) {
      rebuildMidiReferenceIndex(document);
    }
  }

  function getActiveTempoCollection() {
    const document = isMidiReferenceActive() ? getActiveMidiDocument() : null;
    return document?.tempoEvents?.length ? document.tempoEvents : state.tempos;
  }

  const clamp = window.MabiUtils?.clamp;
  if (typeof clamp !== "function") throw new Error("utils.js must be loaded before this Editor script");

  function velocityToMmlVolume(value) {
    const velocity = clamp(Math.round(Number(value) || 0), 0, 127);
    if (velocity <= 0) return 0;
    if (velocity === 1) return 1;
    // Velocity 2~127은 정확히 126단계이므로 V2~V15의 14구간으로 9단계씩 나눕니다.
    return clamp(2 + Math.floor((velocity - 2) / 9), 2, 15);
  }

  function mmlVolumeToVelocity(value) {
    const volume = clamp(Math.round(Number(value) || 0), 0, 15);
    if (volume <= 0) return 0;
    if (volume === 1) return 1;
    const bucketStart = 2 + (volume - 2) * 9;
    return clamp(bucketStart + 4, 2, 127);
  }

  function getNoteVolume(note, fallback = 15) {
    if (Number.isFinite(Number(note?.volume))) {
      return clamp(Math.round(Number(note.volume)), 0, 15);
    }
    if (Number.isFinite(Number(note?.velocity))) {
      return velocityToMmlVolume(note.velocity);
    }
    return clamp(Math.round(Number(fallback) || 15), 0, 15);
  }

  function getNotePlaybackVelocity(note, fallbackVolume = 15) {
    const volume = getNoteVolume(note, fallbackVolume);
    if (volume <= 0) return 0;
    const rawVelocity = Number(note?.velocity);
    if (Number.isFinite(rawVelocity) && velocityToMmlVolume(rawVelocity) === volume) {
      return clamp(Math.round(rawVelocity), 1, 127);
    }
    return mmlVolumeToVelocity(volume);
  }

  function normalizeNoteDynamics(note, fallbackVolume = 15) {
    const volume = getNoteVolume(note, fallbackVolume);
    const rawVelocity = Number(note?.velocity);
    const velocity = volume <= 0
      ? 0
      : Number.isFinite(rawVelocity) && velocityToMmlVolume(rawVelocity) === volume
        ? clamp(Math.round(rawVelocity), 1, 127)
        : mmlVolumeToVelocity(volume);
    return { volume, velocity };
  }

  function trySetPointerCapture(element, pointerId) {
    try {
      element?.setPointerCapture?.(pointerId);
      return true;
    } catch {
      return false;
    }
  }

  function getQuarterWidth() {
    return CONFIG.baseQuarterWidth * state.zoom;
  }

  function getTotalBeats() {
    return Math.max(CONFIG.beatsPerMeasure, Number(state.timelineBeats) || 0);
  }

  function getPersistentContentEndBeat() {
    const lastAudioEnd = state.audioClips.reduce((maximum, clip) => Math.max(maximum, getAudioClipEndBeat(clip)), 0);
    if (isMidiReferenceActive()) {
      return Math.max(getMidiReferenceEndBeat(getActiveMidiDocument() || state.midiReference), lastAudioEnd);
    }
    const lastNoteEnd = state.channels.reduce(
      (projectEnd, channel) => channel.notes.reduce(
        (channelEnd, note) => Math.max(channelEnd, note.startBeat + note.durationBeat),
        projectEnd,
      ),
      0,
    );
    const lastTempoBeat = state.tempos.reduce(
      (maximum, tempo) => Math.max(maximum, tempo.beat),
      0,
    );
    return Math.max(lastNoteEnd, lastTempoBeat, lastAudioEnd);
  }

  function getProjectContentEndBeat() {
    return Math.max(getPersistentContentEndBeat(), state.playhead.beat || 0);
  }

  function getViewportVisibleEndBeat() {
    const viewportWidth = Math.max(1, elements.rollViewport?.clientWidth || 1);
    return Math.max(0, xToBeat(viewportWidth));
  }

  function ensureTimelineFitsViewport() {
    const contentEnd = getProjectContentEndBeat();
    const rightPadding = contentEnd > 0 ? Math.max(getSnapBeat(), CONFIG.minimumNoteBeat) : 0;
    const requiredBeat = Math.max(
      getViewportVisibleEndBeat(),
      contentEnd + rightPadding,
      xToBeat((elements.rollViewport?.scrollLeft || 0) + (elements.rollViewport?.clientWidth || 0)),
    );
    if (requiredBeat > state.timelineBeats + 1e-7) {
      state.timelineBeats = requiredBeat;
      return true;
    }
    return false;
  }

  function extendTimelineToBeat(requiredBeat) {
    const safeRequiredBeat = Math.max(0, Number(requiredBeat) || 0);
    if (safeRequiredBeat <= getTotalBeats() - 1e-7) {
      return false;
    }
    state.timelineBeats = Math.ceil(
      safeRequiredBeat / CONFIG.timelineExtensionBeats,
    ) * CONFIG.timelineExtensionBeats;
    resizeRollSurface();
    drawRoll();
    updatePlayheadVisual();
    drawTimeline();
    return true;
  }

  function getMinimumTimelineBeats() {
    const viewportBeats = Math.max(CONFIG.beatsPerMeasure, getViewportVisibleEndBeat());
    const contentEnd = getPersistentContentEndBeat();
    if (contentEnd <= 1e-7) {
      return viewportBeats;
    }
    const rightPadding = Math.max(getSnapBeat(), CONFIG.minimumNoteBeat);
    const roundedContentEnd = Math.ceil(
      (contentEnd + rightPadding) / CONFIG.timelineExtensionBeats,
    ) * CONFIG.timelineExtensionBeats;
    return Math.max(viewportBeats, roundedContentEnd);
  }

  function shrinkTimelineToContent() {
    if (state.playback.running || state.playback.loading || state.interaction || state.tempoDrag) {
      return false;
    }
    const targetBeats = getMinimumTimelineBeats();
    if (targetBeats >= getTotalBeats() - 1e-7) {
      return false;
    }

    state.timelineBeats = targetBeats;
    state.playhead.beat = clamp(state.playhead.beat, 0, targetBeats);
    resizeRollSurface();
    elements.rollViewport.scrollLeft = clamp(
      elements.rollViewport.scrollLeft,
      0,
      getMaxScrollLeft(),
    );
    drawRoll();
    updatePlayheadVisual();
    drawTimeline();
    updatePlaybackTimeInfo();
    return true;
  }

  function getPreRollWidth() {
    return CONFIG.preRollPixels;
  }

  // 앞쪽 공백은 화면 여백일 뿐 재생 시간에는 포함되지 않습니다.
  function getTimelineStartBeat() {
    return 0;
  }

  function getRollWidth() {
    return Math.ceil(getPreRollWidth() + getTotalBeats() * getQuarterWidth());
  }

  function getPitchCount() {
    return CONFIG.maxPitch - CONFIG.minPitch + 1;
  }

  function getRowHeight() {
    return state.rowHeight;
  }

  function getRollHeight() {
    return getPitchCount() * getRowHeight();
  }

  function getStepPerBeat() {
    return state.snapValue / 4;
  }

  function getSnapBeat() {
    return 1 / getStepPerBeat();
  }

  function getVisibleGridUnit() {
    // 가이드선은 편집 단위와 무관합니다. 350% 이상에서는 1/64 음표까지
    // 점선으로 표시하고, 그보다 낮은 배율에서는 기존처럼 최대 1/32 음표까지만 표시합니다.
    if (state.zoom >= 3.5 - 1e-7) {
      return CONFIG.minimumNoteBeat;
    }
    const quarterWidth = getQuarterWidth();
    const units = [0.125, 0.25, 0.5, 1, 2, CONFIG.beatsPerMeasure];
    return units.find((unit) => {
      if (unit === 0.125) {
        return state.zoom >= 2 - 1e-7
          && unit * quarterWidth >= CONFIG.denseGridMinPixelSpacing - 1e-7;
      }
      return unit * quarterWidth >= CONFIG.gridMinPixelSpacing - 1e-7;
    }) || CONFIG.beatsPerMeasure;
  }

  function beatToX(beat) {
    return getPreRollWidth() + beat * getQuarterWidth();
  }

  function xToBeat(x) {
    return (x - getPreRollWidth()) / getQuarterWidth();
  }

  function isMidiReferenceActive() {
    return state.activePanel === "midi";
  }

  function getMidiGroupById(groupId = state.midiReference.activeGroupId) {
    return state.midiReference.groups.find((group) => group.id === groupId) || null;
  }

  function getVisibleMidiGroups() {
    const document = getActiveMidiDocument();
    if (!document || document.visible === false) return [];
    return state.midiReference.groups.filter((group) => group.visible !== false);
  }

  function getMidiReferenceEndBeat(reference = state.midiReference) {
    let endBeat = Math.max(0, Number(reference?.durationBeats) || 0);
    for (const group of reference?.groups || []) {
      for (const note of group.notes || []) {
        endBeat = Math.max(endBeat, note.startBeat + note.durationBeat);
      }
    }
    return endBeat;
  }

  function midiSelectionKey(groupId, noteId) {
    return `${groupId}:${noteId}`;
  }

  function rebuildMidiReferenceIndex(reference = state.midiReference) {
    const buckets = new Map();
    let noteCount = 0;
    (reference.groups || []).forEach((group, groupIndex) => {
      (group.notes || []).forEach((note, noteIndex) => {
        noteCount += 1;
        const startBeat = Math.max(0, Number(note.startBeat) || 0);
        const endBeat = startBeat + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || 0);
        const firstMeasure = Math.max(0, Math.floor(startBeat / CONFIG.beatsPerMeasure));
        const lastMeasure = Math.max(firstMeasure, Math.floor(Math.max(startBeat, endBeat - 1e-7) / CONFIG.beatsPerMeasure));
        for (let measure = firstMeasure; measure <= lastMeasure; measure += 1) {
          let bucket = buckets.get(measure);
          if (!bucket) {
            bucket = [];
            buckets.set(measure, bucket);
          }
          bucket.push([groupIndex, noteIndex]);
        }
      });
    });
    state.midiReferenceRuntime.noteBuckets = buckets;
    state.midiReferenceRuntime.indexedNoteCount = noteCount;
  }

  function getVisibleMidiNoteRefs(visibleStartBeat, visibleEndBeat) {
    if (!state.midiReferenceRuntime.noteBuckets.size && state.midiReference.groups.length) {
      rebuildMidiReferenceIndex();
    }
    const firstMeasure = Math.max(0, Math.floor(Math.max(0, visibleStartBeat) / CONFIG.beatsPerMeasure));
    const lastMeasure = Math.max(firstMeasure, Math.floor(Math.max(0, visibleEndBeat) / CONFIG.beatsPerMeasure));
    const refs = new Map();
    for (let measure = firstMeasure; measure <= lastMeasure; measure += 1) {
      const bucket = state.midiReferenceRuntime.noteBuckets.get(measure);
      if (!bucket) {
        continue;
      }
      for (const [groupIndex, noteIndex] of bucket) {
        refs.set(`${groupIndex}:${noteIndex}`, [groupIndex, noteIndex]);
      }
    }
    return Array.from(refs.values());
  }

  function snapBeatToUnit(beat, unit, mode = "round") {
    const safeUnit = Math.max(Number.EPSILON, Number(unit) || CONFIG.minimumNoteBeat);
    const ratio = beat / safeUnit;
    const snappedRatio = mode === "floor"
      ? Math.floor(ratio + 1e-9)
      : mode === "ceil"
        ? Math.ceil(ratio - 1e-9)
        : Math.round(ratio);
    return snappedRatio * safeUnit;
  }

  function snapBeat(beat) {
    return snapBeatToUnit(beat, getSnapBeat());
  }

  function getPlaybackVisualBeat(beat) {
    return snapBeatToUnit(beat, CONFIG.minimumNoteBeat, "floor");
  }

  function getMaxScrollLeft() {
    return Math.max(0, getRollWidth() - elements.rollViewport.clientWidth);
  }

  function snapScrollLeftToBeatUnit(scrollLeft, beatUnit, mode = "round") {
    const safeScrollLeft = Math.max(0, Number(scrollLeft) || 0);
    const stepPixels = Math.max(1, getQuarterWidth() * beatUnit);
    if (safeScrollLeft <= getPreRollWidth() * 0.5) {
      return 0;
    }
    const ratio = (safeScrollLeft - getPreRollWidth()) / stepPixels;
    const snappedRatio = mode === "floor"
      ? Math.floor(ratio + 1e-9)
      : mode === "ceil"
        ? Math.ceil(ratio - 1e-9)
        : Math.round(ratio);
    return clamp(getPreRollWidth() + snappedRatio * stepPixels, 0, getMaxScrollLeft());
  }

  function getSortedTempos() {
    return [...getActiveTempoCollection()].sort((left, right) => left.beat - right.beat || (left.id || 0) - (right.id || 0));
  }

  function getTempoAtBeat(beat) {
    const targetBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    let bpm = 120;
    for (const tempo of getSortedTempos()) {
      if (tempo.beat > targetBeat + 1e-9) {
        break;
      }
      bpm = tempo.bpm;
    }
    return bpm;
  }

  function beatToSeconds(beat) {
    const targetBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    const tempos = getSortedTempos();
    let seconds = 0;
    let segmentBeat = 0;
    let bpm = 120;

    for (const tempo of tempos) {
      if (tempo.beat <= segmentBeat + 1e-9) {
        bpm = tempo.bpm;
        continue;
      }
      if (tempo.beat >= targetBeat) {
        break;
      }
      seconds += (tempo.beat - segmentBeat) * 60 / bpm;
      segmentBeat = tempo.beat;
      bpm = tempo.bpm;
    }

    seconds += Math.max(0, targetBeat - segmentBeat) * 60 / bpm;
    return seconds;
  }

  function secondsToBeatUnclamped(seconds) {
    let remainingSeconds = Math.max(0, Number(seconds) || 0);
    const tempos = getSortedTempos();
    let segmentBeat = 0;
    let bpm = 120;

    for (const tempo of tempos) {
      if (tempo.beat <= segmentBeat + 1e-9) {
        bpm = tempo.bpm;
        continue;
      }
      const segmentSeconds = (tempo.beat - segmentBeat) * 60 / bpm;
      if (remainingSeconds <= segmentSeconds + 1e-9) {
        return Math.max(0, segmentBeat + remainingSeconds * bpm / 60);
      }
      remainingSeconds -= segmentSeconds;
      segmentBeat = tempo.beat;
      bpm = tempo.bpm;
    }

    return Math.max(0, segmentBeat + remainingSeconds * bpm / 60);
  }

  function secondsToBeat(seconds) {
    return clamp(secondsToBeatUnclamped(seconds), 0, getTotalBeats());
  }

  function secondsBetweenBeats(startBeat, endBeat) {
    return Math.max(0, beatToSeconds(endBeat) - beatToSeconds(startBeat));
  }

  function createTempoTimeMap(tempoCollection = null) {
    const tempos = Array.isArray(tempoCollection)
      ? [...tempoCollection].sort((left, right) => left.beat - right.beat || (left.id || 0) - (right.id || 0))
      : getSortedTempos();
    const segments = [];
    let startBeat = 0;
    let startSeconds = 0;
    let bpm = 120;
    for (const tempo of tempos) {
      if (tempo.beat <= startBeat + 1e-9) {
        bpm = tempo.bpm;
        continue;
      }
      segments.push({ startBeat, endBeat: tempo.beat, startSeconds, bpm });
      startSeconds += (tempo.beat - startBeat) * 60 / bpm;
      startBeat = tempo.beat;
      bpm = tempo.bpm;
    }
    segments.push({ startBeat, endBeat: Infinity, startSeconds, bpm });
    return segments;
  }

  function beatToSecondsFromMap(beat, map = state.playback.tempoMap) {
    if (!Array.isArray(map) || !map.length) {
      return beatToSeconds(beat);
    }
    const targetBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    let low = 0;
    let high = map.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (map[middle].startBeat <= targetBeat + 1e-9) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const segment = map[low];
    return segment.startSeconds + Math.max(0, targetBeat - segment.startBeat) * 60 / segment.bpm;
  }

  function secondsToBeatFromMap(seconds, map = state.playback.tempoMap) {
    if (!Array.isArray(map) || !map.length) {
      return secondsToBeat(seconds);
    }
    const targetSeconds = Math.max(0, Number(seconds) || 0);
    let low = 0;
    let high = map.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (map[middle].startSeconds <= targetSeconds + 1e-9) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const segment = map[low];
    return clamp(
      segment.startBeat + Math.max(0, targetSeconds - segment.startSeconds) * segment.bpm / 60,
      0,
      getTotalBeats(),
    );
  }

  function beatToSecondsInTempoMap(beat, map) {
    const targetBeat = Math.max(0, Number(beat) || 0);
    if (!Array.isArray(map) || !map.length) return targetBeat * 0.5;
    let low = 0;
    let high = map.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (map[middle].startBeat <= targetBeat + 1e-9) low = middle;
      else high = middle - 1;
    }
    const segment = map[low];
    return segment.startSeconds + Math.max(0, targetBeat - segment.startBeat) * 60 / segment.bpm;
  }

  function buildMidiPlaybackCache(midiDocument) {
    if (!midiDocument) return null;
    const tempoMap = createTempoTimeMap(midiDocument.tempoEvents || []);
    const notes = [];
    const groupById = new Map();
    for (const group of midiDocument.groups || []) {
      groupById.set(String(group.id), group);
      for (const note of group.notes || []) {
        const startBeat = Math.max(0, Number(note.startBeat) || 0);
        const endBeat = startBeat + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        notes.push({
          id: note.id,
          pitch: note.pitch,
          velocity: getNotePlaybackVelocity(note),
          volume: getNoteVolume(note),
          startBeat,
          durationBeat: endBeat - startBeat,
          endBeat,
          startSeconds: beatToSecondsInTempoMap(startBeat, tempoMap),
          endSeconds: beatToSecondsInTempoMap(endBeat, tempoMap),
          source: "midi",
          sourceId: group.id,
          instrumentProgram: clamp(Number(group.program) || 0, 0, 127),
          instrumentBank: isMidiGroupDrums(group) ? 128 : 0,
        });
      }
    }
    notes.sort((left, right) => left.startSeconds - right.startSeconds || left.pitch - right.pitch || left.endSeconds - right.endSeconds);
    midiDocument.playbackCache = { tempoMap, notes, groupById, noteCount: notes.length };
    return midiDocument.playbackCache;
  }

  function ensureMidiPlaybackCache(midiDocument) {
    const expectedCount = (midiDocument?.groups || []).reduce((sum, group) => sum + (group.notes?.length || 0), 0);
    if (!midiDocument?.playbackCache || midiDocument.playbackCache.noteCount !== expectedCount) {
      return buildMidiPlaybackCache(midiDocument);
    }
    return midiDocument.playbackCache;
  }

  function getTempoAtExactBeat(beat, ignoredId = null) {
    return state.tempos.find((tempo) =>
      tempo.id !== ignoredId && Math.abs(tempo.beat - beat) < 1e-7
    ) || null;
  }

  function pitchToY(pitch) {
    return (CONFIG.maxPitch - pitch) * getRowHeight();
  }

  function yToPitch(y) {
    const row = Math.floor(y / getRowHeight());
    return clamp(CONFIG.maxPitch - row, CONFIG.minPitch, CONFIG.maxPitch);
  }

  function isBlackPitch(pitch) {
    return BLACK_KEYS.has(((pitch % 12) + 12) % 12);
  }

  function findAdjacentWhitePitch(pitch, direction) {
    for (let candidate = pitch + direction; candidate >= CONFIG.minPitch && candidate <= CONFIG.maxPitch; candidate += direction) {
      if (!isBlackPitch(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  function getPitchCenterY(pitch) {
    return pitchToY(pitch) + getRowHeight() / 2;
  }

  function getWhiteKeyBounds(pitch) {
    const center = getPitchCenterY(pitch);
    const higher = findAdjacentWhitePitch(pitch, 1);
    const lower = findAdjacentWhitePitch(pitch, -1);
    return {
      top: higher == null ? 0 : (center + getPitchCenterY(higher)) / 2,
      bottom: lower == null ? getRollHeight() : (center + getPitchCenterY(lower)) / 2,
    };
  }

  function keyboardPitchAt(x, absoluteY, keyboardWidth) {
    const blackWidth = Math.round(keyboardWidth * 0.62);
    const blackHeight = Math.max(12, getRowHeight() * 0.72);
    const approximatePitch = yToPitch(absoluteY);

    if (x <= blackWidth + 4) {
      for (let pitch = approximatePitch + 2; pitch >= approximatePitch - 2; pitch -= 1) {
        if (pitch < CONFIG.minPitch || pitch > CONFIG.maxPitch || !isBlackPitch(pitch)) {
          continue;
        }
        if (Math.abs(absoluteY - getPitchCenterY(pitch)) <= blackHeight / 2) {
          return pitch;
        }
      }
    }

    for (let pitch = approximatePitch + 3; pitch >= approximatePitch - 3; pitch -= 1) {
      if (pitch < CONFIG.minPitch || pitch > CONFIG.maxPitch || isBlackPitch(pitch)) {
        continue;
      }
      const bounds = getWhiteKeyBounds(pitch);
      if (absoluteY >= bounds.top && absoluteY < bounds.bottom) {
        return pitch;
      }
    }

    let nearestWhite = clamp(approximatePitch, CONFIG.minPitch, CONFIG.maxPitch);
    while (nearestWhite > CONFIG.minPitch && isBlackPitch(nearestWhite)) {
      nearestWhite -= 1;
    }
    return nearestWhite;
  }

  function noteLabel(pitch) {
    const name = NOTE_NAMES[pitch % 12];
    const octave = Math.floor(pitch / 12) - 1;
    return `${name}${octave}`;
  }

  function resizeCanvas(canvas, cssWidth, cssHeight, pixelRatio = null) {
    const dpr = pixelRatio == null ? (window.devicePixelRatio || 1) : Math.max(1, Number(pixelRatio) || 1);
    const width = Math.max(1, Math.floor(cssWidth));
    const height = Math.max(1, Math.floor(cssHeight));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
  }


  function updateRollCanvasPosition() {
    elements.rollCanvas.style.transform = `translate(${Math.floor(state.rollSurface.originX)}px, ${Math.floor(state.rollSurface.originY)}px)`;
  }

  function calculateRollSurfaceGeometry() {
    const viewportWidth = Math.max(1, elements.rollViewport.clientWidth);
    const viewportHeight = Math.max(1, elements.rollViewport.clientHeight);
    const contentWidth = Math.max(1, getRollWidth());
    const contentHeight = Math.max(1, getRollHeight());
    const overscanX = Math.min(CONFIG.rollOverscanMaxX, Math.round(viewportWidth * CONFIG.rollOverscanXRatio));
    // 피아노롤의 세로 음역은 C0~B8로 유한하므로 세로 전체를 한 번에 버퍼링합니다.
    // 스크롤 이벤트보다 먼저 화면이 움직여도 캔버스가 비는 프레임이 생기지 않습니다.
    const overscanY = contentHeight;
    const width = Math.min(contentWidth, viewportWidth + overscanX * 2);
    const height = contentHeight;
    const originX = clamp(
      Math.round(elements.rollViewport.scrollLeft - Math.max(0, width - viewportWidth) / 2),
      0,
      Math.max(0, contentWidth - width),
    );
    const originY = 0;
    return { originX, originY, width, height, overscanX, overscanY };
  }

  function applyRollSurfaceGeometry(geometry, { forceResize = false } = {}) {
    const sizeChanged = forceResize
      || state.rollSurface.width !== geometry.width
      || state.rollSurface.height !== geometry.height;
    const originChanged = state.rollSurface.originX !== geometry.originX
      || state.rollSurface.originY !== geometry.originY;
    state.rollSurface = { ...geometry };
    if (sizeChanged) {
      const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      const rollPixelRatio = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.25 : 1.5);
      resizeCanvas(elements.rollCanvas, geometry.width, geometry.height, rollPixelRatio);
    }
    updateRollCanvasPosition();
    return sizeChanged || originChanged;
  }

  function ensureRollRenderBuffer(force = false) {
    const viewport = elements.rollViewport;
    const surface = state.rollSurface;
    const visibleLeft = viewport.scrollLeft;
    const visibleTop = viewport.scrollTop;
    const visibleRight = visibleLeft + viewport.clientWidth;
    const visibleBottom = visibleTop + viewport.clientHeight;
    const guardX = Math.min(surface.overscanX * CONFIG.rollBufferGuardRatio, Math.max(16, viewport.clientWidth * 0.12));
    const guardY = Math.min(surface.overscanY * CONFIG.rollBufferGuardRatio, Math.max(16, viewport.clientHeight * 0.12));
    const contentWidth = getRollWidth();
    const contentHeight = getRollHeight();
    const outsideSafeBuffer = (surface.originX > 0 && visibleLeft < surface.originX + guardX)
      || (surface.originX + surface.width < contentWidth && visibleRight > surface.originX + surface.width - guardX)
      || (surface.originY > 0 && visibleTop < surface.originY + guardY)
      || (surface.originY + surface.height < contentHeight && visibleBottom > surface.originY + surface.height - guardY);
    if (!force && !outsideSafeBuffer) return false;
    const changed = applyRollSurfaceGeometry(calculateRollSurfaceGeometry(), { forceResize: force });
    if (changed || force) drawRoll();
    return changed || force;
  }

  function resizeRollSurface() {
    const contentWidth = getRollWidth();
    const contentHeight = getRollHeight();
    elements.rollSpacer.style.width = `${contentWidth}px`;
    elements.rollSpacer.style.height = `${contentHeight}px`;
    elements.rollViewport.style.setProperty("--roll-height", `${contentHeight}px`);
    applyRollSurfaceGeometry(calculateRollSurfaceGeometry(), { forceResize: true });
    updateAudioLaneTransform();
    updateCustomScrollbars();
  }

  function updateCustomScrollbars() {
    if (!elements.horizontalScrollBar || !elements.verticalScrollBar) {
      return;
    }
    const viewport = elements.rollViewport;
    const horizontalTrack = Math.max(1, elements.horizontalScrollBar.clientWidth);
    const verticalTrack = Math.max(1, elements.verticalScrollBar.clientHeight);
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

    const horizontalThumbSize = maxScrollLeft <= 0
      ? horizontalTrack
      : Math.max(42, horizontalTrack * viewport.clientWidth / Math.max(viewport.scrollWidth, 1));
    const verticalThumbSize = maxScrollTop <= 0
      ? verticalTrack
      : Math.max(42, verticalTrack * viewport.clientHeight / Math.max(viewport.scrollHeight, 1));
    const horizontalTravel = Math.max(0, horizontalTrack - horizontalThumbSize);
    const verticalTravel = Math.max(0, verticalTrack - verticalThumbSize);
    const horizontalOffset = maxScrollLeft > 0 ? horizontalTravel * viewport.scrollLeft / maxScrollLeft : 0;
    const verticalOffset = maxScrollTop > 0 ? verticalTravel * viewport.scrollTop / maxScrollTop : 0;

    elements.horizontalScrollThumb.style.width = `${horizontalThumbSize}px`;
    elements.horizontalScrollThumb.style.transform = `translateX(${horizontalOffset}px)`;
    elements.verticalScrollThumb.style.height = `${verticalThumbSize}px`;
    elements.verticalScrollThumb.style.transform = `translateY(${verticalOffset}px)`;
    elements.horizontalScrollBar.classList.toggle("disabled", maxScrollLeft <= 0);
    elements.verticalScrollBar.classList.toggle("disabled", maxScrollTop <= 0);
    elements.horizontalScrollBar.setAttribute("aria-valuenow", String(Math.round(maxScrollLeft ? viewport.scrollLeft / maxScrollLeft * 100 : 0)));
    elements.verticalScrollBar.setAttribute("aria-valuenow", String(Math.round(maxScrollTop ? viewport.scrollTop / maxScrollTop * 100 : 0)));
  }

  function beginCustomScrollbarDrag(axis, event) {
    if (event.button !== 0) {
      return;
    }
    if (axis === "x" && (state.playback.running || state.playback.loading)) {
      // 사용자가 가로 스크롤을 직접 잡은 동안 이전 자동 스크롤이 위치를 덮어쓰지 않게 합니다.
      state.playback.scrollAnimation = null;
    }
    const bar = axis === "x" ? elements.horizontalScrollBar : elements.verticalScrollBar;
    const thumb = axis === "x" ? elements.horizontalScrollThumb : elements.verticalScrollThumb;
    const viewport = elements.rollViewport;
    const barRect = bar.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const maximumScroll = axis === "x"
      ? Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      : Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const trackLength = axis === "x" ? barRect.width : barRect.height;
    const thumbLength = axis === "x" ? thumbRect.width : thumbRect.height;
    if (maximumScroll <= 0 || trackLength <= thumbLength) {
      return;
    }

    const pointerPosition = axis === "x" ? event.clientX : event.clientY;
    const thumbStart = axis === "x" ? thumbRect.left : thumbRect.top;
    const thumbEnd = axis === "x" ? thumbRect.right : thumbRect.bottom;
    if (pointerPosition < thumbStart || pointerPosition > thumbEnd) {
      const local = pointerPosition - (axis === "x" ? barRect.left : barRect.top);
      const ratio = clamp((local - thumbLength / 2) / Math.max(1, trackLength - thumbLength), 0, 1);
      if (axis === "x") {
        viewport.scrollLeft = ratio * maximumScroll;
      } else {
        viewport.scrollTop = ratio * maximumScroll;
      }
      updateCustomScrollbars();
    }

    state.customScrollDrag = {
      axis,
      pointerId: event.pointerId,
      startPointer: pointerPosition,
      startScroll: axis === "x" ? viewport.scrollLeft : viewport.scrollTop,
      maximumScroll,
      travel: Math.max(1, trackLength - thumbLength),
    };
    bar.classList.add("dragging");
    trySetPointerCapture(bar, event.pointerId);
    event.preventDefault();
  }

  function moveCustomScrollbarDrag(event) {
    const drag = state.customScrollDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const pointerPosition = drag.axis === "x" ? event.clientX : event.clientY;
    const nextScroll = clamp(
      drag.startScroll + (pointerPosition - drag.startPointer) / drag.travel * drag.maximumScroll,
      0,
      drag.maximumScroll,
    );
    if (drag.axis === "x") {
      elements.rollViewport.scrollLeft = nextScroll;
    } else {
      elements.rollViewport.scrollTop = nextScroll;
    }
    event.preventDefault();
  }

  function endCustomScrollbarDrag(event) {
    const drag = state.customScrollDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const bar = drag.axis === "x" ? elements.horizontalScrollBar : elements.verticalScrollBar;
    state.customScrollDrag = null;
    bar.classList.remove("dragging");
    try { bar.releasePointerCapture(event.pointerId); } catch {}
    if (drag.axis === "x" && (state.playback.running || state.playback.loading)) {
      // 드래그를 놓았을 때 재생선이 왼쪽 밖에 있으면 즉시 안전 영역으로 복귀시킵니다.
      restorePlaybackPlayheadFromLeft(state.playhead.beat, { force: true });
    }
    scheduleManualScrollSnap();
  }

  function scheduleRollRedraw() {
    if (state.viewportScroll.drawFrame) {
      return;
    }
    state.viewportScroll.drawFrame = requestAnimationFrame(() => {
      state.viewportScroll.drawFrame = 0;
      drawRoll();
    });
  }

  function getCanvasTheme() {
    return CANVAS_THEME[state.theme] || CANVAS_THEME.dark;
  }

  function loadStoredTheme() {
    try {
      const stored = window.localStorage.getItem("mobibard-theme")
        ?? window.localStorage.getItem("mml-editor-theme");
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  function loadStoredVolume() {
    try {
      const raw = window.localStorage.getItem("mobibard-master-volume");
      if (raw === null || raw.trim() === "") return 1;
      const stored = Number(raw);
      return Number.isFinite(stored) ? clamp(stored, 0, 1.5) : 1;
    } catch {
      return 1;
    }
  }

  function normalizeNoteVolumeDisplay(value) {
    return value === "selected" || value === "none" ? value : "all";
  }

  function loadStoredNoteVolumeDisplay() {
    try {
      return normalizeNoteVolumeDisplay(window.localStorage.getItem("mobibard-note-volume-display"));
    } catch {
      return "all";
    }
  }

  function setNoteVolumeDisplay(value, { persist = true } = {}) {
    state.noteVolumeDisplay = normalizeNoteVolumeDisplay(value);
    if (elements.noteVolumeDisplaySelect) {
      elements.noteVolumeDisplaySelect.value = state.noteVolumeDisplay;
    }
    if (persist) {
      try { window.localStorage.setItem("mobibard-note-volume-display", state.noteVolumeDisplay); } catch {}
    }
    if (elements.rollCanvas?.style.width) drawRoll();
    return state.noteVolumeDisplay;
  }

  function shouldDrawNoteVolumeLabel(isActiveChannel) {
    if (state.noteVolumeDisplay === "none") return false;
    if (state.noteVolumeDisplay === "selected") return Boolean(isActiveChannel);
    return true;
  }

  function updateVolumeControls() {
    const percent = Math.round(state.masterVolume * 100);
    if (elements.volumeSlider) elements.volumeSlider.value = String(percent);
    if (elements.volumeValue) elements.volumeValue.textContent = `${percent}%`;
    if (elements.volumeButton) {
      elements.volumeButton.textContent = percent === 0 ? "볼륨 0" : `볼륨 ${percent}`;
      elements.volumeButton.title = `전체 재생 볼륨 ${percent}%`;
    }
  }

  function setMasterVolume(value, { persist = true } = {}) {
    state.masterVolume = clamp(Number(value) || 0, 0, 1.5);
    audioEngine.setVolume(state.masterVolume);
    updateVolumeControls();
    if (persist) {
      try { window.localStorage.setItem("mobibard-master-volume", String(state.masterVolume)); } catch {}
    }
    return state.masterVolume;
  }

  function loadStoredPlaybackRate() {
    try {
      const raw = window.localStorage.getItem("mobibard-playback-rate");
      if (raw === null || raw.trim() === "") return 1;
      const stored = Number(raw);
      return Number.isFinite(stored) ? clamp(stored, 0.75, 1.5) : 1;
    } catch {
      return 1;
    }
  }

  function formatPlaybackRate(value) {
    const normalized = Math.round(clamp(Number(value) || 1, 0.75, 1.5) * 100) / 100;
    return `${Number.isInteger(normalized) ? normalized.toFixed(0) : String(normalized).replace(/0+$/, "").replace(/\.$/, "")}×`;
  }

  function updatePlaybackRatePreview(value) {
    const normalized = Math.round(clamp(Number(value) || 1, 0.75, 1.5) * 100) / 100;
    const label = formatPlaybackRate(normalized);
    if (elements.playbackRateSlider) elements.playbackRateSlider.value = String(normalized);
    if (elements.playbackRateValue) elements.playbackRateValue.textContent = label;
    if (elements.playbackRateButton) {
      elements.playbackRateButton.textContent = `배속 ${label}`;
      elements.playbackRateButton.title = `재생 배속 ${label}`;
    }
  }

  function updatePlaybackRateControl() {
    updatePlaybackRatePreview(state.playbackRate);
    updatePlaybackTimeInfo();
  }

  function setPlaybackRate(value, { persist = true, restart = true } = {}) {
    const nextRate = clamp(Number(value) || 1, 0.75, 1.5);
    if (Math.abs(nextRate - state.playbackRate) < 1e-7) {
      updatePlaybackRateControl();
      return false;
    }
    const wasPlaying = restart && (state.playback.running || state.playback.loading);
    if (wasPlaying) stopPlayback(false);
    state.playbackRate = nextRate;
    updatePlaybackRateControl();
    if (persist) {
      try { window.localStorage.setItem("mobibard-playback-rate", String(state.playbackRate)); } catch {}
    }
    if (wasPlaying) window.setTimeout(() => startPlayback(), 0);
    return true;
  }

  function closeVolumeMenu() {
    if (!elements.volumeMenu) return;
    elements.volumeMenu.hidden = true;
    elements.volumeButton?.setAttribute("aria-expanded", "false");
  }

  function closeZoomMenu() {
    if (!elements.zoomMenu) return;
    elements.zoomMenu.hidden = true;
    elements.zoomButton?.setAttribute("aria-expanded", "false");
  }

  function closePlaybackRateMenu() {
    if (!elements.playbackRateMenu) return;
    elements.playbackRateMenu.hidden = true;
    elements.playbackRateButton?.setAttribute("aria-expanded", "false");
    updatePlaybackRateControl();
  }

  function toggleVolumeMenu() {
    if (!elements.volumeMenu) return;
    const opening = elements.volumeMenu.hidden;
    closeZoomMenu();
    closePlaybackRateMenu();
    elements.volumeMenu.hidden = !opening;
    elements.volumeButton?.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => {
      positionTopbarMenu(elements.volumeMenu, elements.volumeButton);
      elements.volumeSlider?.focus();
    });
  }

  function toggleZoomMenu() {
    if (!elements.zoomMenu) return;
    const opening = elements.zoomMenu.hidden;
    closeVolumeMenu();
    closePlaybackRateMenu();
    elements.zoomMenu.hidden = !opening;
    elements.zoomButton?.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => {
      positionTopbarMenu(elements.zoomMenu, elements.zoomButton);
      elements.zoomSlider?.focus();
    });
  }

  function togglePlaybackRateMenu() {
    if (!elements.playbackRateMenu) return;
    const opening = elements.playbackRateMenu.hidden;
    closeVolumeMenu();
    closeZoomMenu();
    elements.playbackRateMenu.hidden = !opening;
    elements.playbackRateButton?.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => {
      positionTopbarMenu(elements.playbackRateMenu, elements.playbackRateButton);
      elements.playbackRateSlider?.focus();
    });
  }

  function normalizeLanguage(value) {
    const supported = new Set(["ko", "ja", "en", "zh-CN", "zh-TW"]);
    const raw = String(value || "");
    if (supported.has(raw)) {
      return raw;
    }
    const lower = raw.toLowerCase();
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk")) return "zh-TW";
    if (lower.startsWith("zh")) return "zh-CN";
    return "ko";
  }

  function loadStoredLanguage() {
    try {
      return normalizeLanguage(window.localStorage.getItem("mobibard-language") || "ko");
    } catch {
      return "ko";
    }
  }

  function applyLanguage(language, { persist = true, notify = false } = {}) {
    const nextLanguage = normalizeLanguage(language);
    state.language = nextLanguage;
    document.documentElement.lang = nextLanguage;
    if (elements.languageSelect) {
      elements.languageSelect.value = nextLanguage;
    }
    if (persist) {
      try {
        window.localStorage.setItem("mobibard-language", nextLanguage);
      } catch {}
    }
    if (notify) {
      const label = elements.languageSelect?.selectedOptions?.[0]?.textContent || nextLanguage;
      showToast(`언어 설정을 ${label}(으)로 저장했습니다.`);
    }
    return nextLanguage;
  }

  function positionTopbarMenu(menu, button) {
    if (!menu || !button) return;
    const rect = button.getBoundingClientRect();
    const measuredWidth = menu.offsetWidth || 160;
    const menuWidth = menu.classList.contains("vertical-range-menu")
      ? measuredWidth
      : Math.max(160, measuredWidth);
    const left = clamp(rect.left, 6, Math.max(6, window.innerWidth - menuWidth - 6));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = "auto";
    menu.style.top = `${Math.round(rect.bottom - 1)}px`;
  }

  function copyCurrentContext() {
    if (state.activePanel === "audio") {
      showToast("오디오 블록은 노트 복사 대상이 아닙니다.");
      return false;
    }
    if (isMidiReferenceActive()) {
      return state.midiSelectedNoteKeys.size ? copySelectedMidiNotes() : copyActiveMidiInstrument();
    }
    return state.selectedNoteIds.size ? copySelectedNotes() : copyActiveChannelNotes();
  }

  function cutCurrentContext() {
    if (state.activePanel === "audio") {
      showToast("오디오 블록은 잘라낼 수 없습니다.");
      return false;
    }
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭은 읽기 전용이라 잘라낼 수 없습니다.");
      return false;
    }
    return state.selectedNoteIds.size ? cutSelectedNotes() : cutActiveChannelNotes();
  }

  function selectAllCurrentContext() {
    if (isMidiReferenceActive()) {
      selectAllMidiNotes();
    } else if (state.activePanel === "audio") {
      showToast("오디오 블록은 하단 트랙에서 직접 선택하세요.");
    } else {
      selectAllNotes();
    }
  }

  function deleteCurrentSelection() {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭은 읽기 전용입니다.");
      return false;
    }
    if (state.activePanel === "audio") {
      void requestDeleteAudioClip();
      return true;
    }
    return deleteSelectedNote();
  }

  function updateEditMenuState() {
    if (!elements.editMenu) return;
    const midiActive = isMidiReferenceActive();
    const audioActive = state.activePanel === "audio";
    const notesActive = state.activePanel === "notes" && Boolean(getActiveChannel());
    const activeMidiGroup = midiActive ? getMidiGroupById() : null;
    const hasCopySource = audioActive ? false : (midiActive
      ? Boolean(state.midiSelectedNoteKeys.size || activeMidiGroup?.notes?.length)
      : notesActive && Boolean(state.selectedNoteIds.size || getActiveChannel()?.notes?.length));
    elements.editUndoButton.disabled = state.history.undoStack.length === 0;
    elements.editRedoButton.disabled = state.history.redoStack.length === 0;
    elements.editCopyButton.disabled = !hasCopySource;
    elements.editCutButton.disabled = midiActive || audioActive || !hasCopySource;
    elements.editPasteButton.disabled = midiActive || audioActive || !notesActive;
    elements.editSelectAllButton.disabled = audioActive || (midiActive
      ? !activeMidiGroup?.notes?.length
      : !notesActive || !getActiveChannel()?.notes?.length);
    elements.editDeleteButton.disabled = midiActive || (audioActive ? !getActiveAudioClip() : !notesActive || !state.selectedNoteIds.size);
    if (elements.editNoteVolumeButton) elements.editNoteVolumeButton.disabled = midiActive || audioActive || !notesActive || !state.selectedNoteIds.size;
    elements.fileExportButton.disabled = !hasCopySource;
  }

  function closeFileMenu() {
    elements.fileMenu.hidden = true;
    elements.fileButton.setAttribute("aria-expanded", "false");
  }

  function closeEditMenu() {
    if (!elements.editMenu) return;
    elements.editMenu.hidden = true;
    elements.editButton?.setAttribute("aria-expanded", "false");
  }

  function closeThemeMenu() {
    elements.themeMenu.hidden = true;
    elements.themeButton.setAttribute("aria-expanded", "false");
  }

  function closeGoogleAccountMenu() {
    if (elements.googleAccountMenu) {
      elements.googleAccountMenu.hidden = true;
    }
    elements.googleAccountButton?.setAttribute("aria-expanded", "false");
  }

  function updateThemeControls() {
    elements.themeButton.title = `Guest 설정 · 현재 ${state.theme === "light" ? "밝은 색상" : "어두운 색상"}`;
    for (const item of elements.themeMenu.querySelectorAll("[data-theme-choice]")) {
      item.setAttribute("aria-checked", String(item.dataset.themeChoice === state.theme));
    }
  }

  function applyTheme(theme, { persist = true, notify = false } = {}) {
    const nextTheme = theme === "light" ? "light" : "dark";
    state.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    updateThemeControls();
    closeThemeMenu();
    if (persist) {
      try {
        window.localStorage.setItem("mobibard-theme", nextTheme);
      } catch {
        // Storage can be unavailable in private or restricted environments.
      }
    }
    if (elements.rollCanvas.style.width) {
      drawRoll();
      drawTimeline();
      drawKeyboard();
    }
    if (notify) {
      showToast(nextTheme === "light" ? "밝은 색상으로 변경했습니다." : "어두운 색상으로 변경했습니다.");
    }
  }

  function renderAll() {
    renderChannelTabs();
    renderChannelEditor();
    renderHistoryPanel();
    updateEditToolControls();
    resizeAndDraw();
    renderAudioLane();
    updateDirtyState();
  }

  function updateEditToolControls() {
    const selecting = state.editTool === "select";
    elements.noteToolButton?.setAttribute("aria-pressed", String(!selecting));
    elements.selectToolButton?.setAttribute("aria-pressed", String(selecting));
    elements.rollViewport?.classList.toggle("select-tool-active", selecting);
    if (!state.interaction) {
      elements.rollCanvas.style.cursor = selecting ? "default" : ((isMidiReferenceActive() || state.activePanel === "audio" || state.activePanel === "none") ? "default" : "crosshair");
    }
  }

  function setEditTool(tool, { notify = true } = {}) {
    const next = tool === "select" ? "select" : "note";
    if (state.editTool === next) {
      updateEditToolControls();
      return false;
    }
    state.editTool = next;
    state.interaction = null;
    stopRollDragAutoScroll();
    clearEditorPitchPreview(true);
    updateEditToolControls();
    if (notify) {
      showToast(next === "select" ? "선택 도구로 변경했습니다." : "노트 도구로 변경했습니다.");
    }
    return true;
  }

  function resizeAndDraw() {
    ensureTimelineFitsViewport();
    const rollWidth = getRollWidth();
    const rollHeight = getRollHeight();
    elements.rollViewport.style.setProperty("--roll-height", `${rollHeight}px`);

    resizeRollSurface();
    renderAudioLane();

    // 세로 스크롤바가 생기면서 실제 가시 폭이 줄어드는 첫 렌더에서도
    // 불필요한 몇 픽셀짜리 가로 스크롤이 생기지 않도록 한 번 더 맞춥니다.
    if (elements.rollViewport.scrollLeft <= 0.5 && getMaxScrollLeft() <= 24) {
      const contentEnd = getProjectContentEndBeat();
      const rightPadding = contentEnd > 0 ? Math.max(getSnapBeat(), CONFIG.minimumNoteBeat) : 0;
      const fittedBeats = Math.max(getViewportVisibleEndBeat(), contentEnd + rightPadding);
      if (fittedBeats < state.timelineBeats - 1e-7) {
        state.timelineBeats = Math.max(CONFIG.beatsPerMeasure, fittedBeats);
        resizeRollSurface();
      }
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const configuredKeyboardWidth = Number.parseFloat(rootStyle.getPropertyValue("--keyboard-width")) || 52;
    const configuredTimelineHeight = Number.parseFloat(rootStyle.getPropertyValue("--timeline-height")) || 34;
    const keyboardWidth = Math.max(1, Math.round(configuredKeyboardWidth));
    const timelineWidth = Math.max(1, Math.round(elements.rollViewport.clientWidth));
    const keyboardHeight = Math.max(1, Math.round(elements.rollViewport.clientHeight));
    const timelineHeight = Math.max(1, Math.round(configuredTimelineHeight));
    resizeCanvas(elements.timelineCanvas, timelineWidth, timelineHeight);
    resizeCanvas(elements.keyboardCanvas, keyboardWidth, keyboardHeight);

    updateCustomScrollbars();
    drawRoll();
    updatePlayheadVisual();
    drawTimeline();
    drawKeyboard();
    updateZoomLabel();
  }

  function drawMidiReferenceNotes(context, visibleLeft, visibleTop, visibleRight, visibleBottom) {
    if (!isMidiReferenceActive()) {
      return;
    }
    const groups = state.midiReference.groups;
    if (!groups.length || getActiveMidiDocument()?.visible === false) {
      return;
    }
    const theme = getCanvasTheme();
    const visibleStartBeat = Math.max(0, xToBeat(visibleLeft) - CONFIG.minimumNoteBeat);
    const visibleEndBeat = Math.max(visibleStartBeat, xToBeat(visibleRight) + CONFIG.minimumNoteBeat);
    const noteRefs = getVisibleMidiNoteRefs(visibleStartBeat, visibleEndBeat);
    const activeGroupId = state.midiReference.activeGroupId;

    context.save();
    // Two inexpensive passes keep the active source channel visually above all siblings
    // without sorting the visible-note list on every frame.
    for (let pass = 0; pass < 2; pass += 1) {
      const activePass = pass === 1;
      for (const [groupIndex, noteIndex] of noteRefs) {
        const group = groups[groupIndex];
        if (!group || group.visible === false) {
          continue;
        }
        const active = group.id === activeGroupId;
        if (active !== activePass) {
          continue;
        }
        const note = group.notes[noteIndex];
        if (!note) {
          continue;
        }
        const x = beatToX(note.startBeat);
        const endX = beatToX(note.startBeat + note.durationBeat);
        if (endX < visibleLeft || x > visibleRight) {
          continue;
        }
        const y = pitchToY(note.pitch) + (active ? 1 : 3);
        const height = Math.max(3, getRowHeight() - (active ? 2 : 6));
        if (y + height < visibleTop || y > visibleBottom) {
          continue;
        }
        const width = Math.max(3, endX - x - 1);
        const selected = state.midiSelectedNoteKeys.has(midiSelectionKey(group.id, note.id));
        const color = getMidiGroupColor(group, groupIndex);
        const baseAlpha = active ? 0.99 : 0.70;
        context.globalAlpha = group.muted ? baseAlpha * 0.46 : baseAlpha;
        if (active) {
          context.fillStyle = "rgba(0,0,0,.26)";
          context.fillRect(x + 2, y + 2, width, Math.max(1, height - 1));
        }
        context.fillStyle = color || theme.midiReferenceFill;
        context.fillRect(x + 1, y, width, height);
        if (active) {
          context.fillStyle = "rgba(255,255,255,.30)";
          context.fillRect(x + 2, y + 1, Math.max(0, width - 2), Math.min(2, height));
          context.fillStyle = "rgba(0,0,0,.20)";
          context.fillRect(x + 2, y + height - 2, Math.max(0, width - 2), 2);
        }
        context.globalAlpha = selected ? 1 : (group.muted ? baseAlpha * 0.46 : baseAlpha);
        context.strokeStyle = selected ? theme.selectedStroke : (color || theme.midiReferenceStroke);
        context.lineWidth = selected ? 2.5 : (active ? 1.5 : 1);
        context.strokeRect(x + 1.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
      }
    }
    context.restore();
  }

  function getMidiNoteBounds(note) {
    const left = beatToX(note.startBeat);
    const top = pitchToY(note.pitch) + 2;
    return {
      left,
      right: beatToX(note.startBeat + note.durationBeat),
      top,
      bottom: top + Math.max(4, getRowHeight() - 4),
    };
  }

  function findMidiNoteAt(x, y) {
    if (getActiveMidiDocument()?.visible === false) return null;
    const refs = getVisibleMidiNoteRefs(xToBeat(x) - 0.25, xToBeat(x) + 0.25);
    const activeGroupId = state.midiReference.activeGroupId;
    refs.sort(([leftGroup], [rightGroup]) => {
      const leftActive = state.midiReference.groups[leftGroup]?.id === activeGroupId ? 1 : 0;
      const rightActive = state.midiReference.groups[rightGroup]?.id === activeGroupId ? 1 : 0;
      return rightActive - leftActive || rightGroup - leftGroup;
    });
    for (const [groupIndex, noteIndex] of refs) {
      const group = state.midiReference.groups[groupIndex];
      if (!group || group.visible === false) {
        continue;
      }
      const note = group.notes[noteIndex];
      const bounds = getMidiNoteBounds(note);
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        return { group, note };
      }
    }
    return null;
  }

  function compareNotesByTimeline(left, right) {
    const leftStart = Number(left?.startBeat) || 0;
    const rightStart = Number(right?.startBeat) || 0;
    const leftDuration = Math.max(CONFIG.minimumNoteBeat, Number(left?.durationBeat) || CONFIG.minimumNoteBeat);
    const rightDuration = Math.max(CONFIG.minimumNoteBeat, Number(right?.durationBeat) || CONFIG.minimumNoteBeat);
    return leftStart - rightStart
      || (leftStart + leftDuration) - (rightStart + rightDuration)
      || (Number(left?.pitch) || 0) - (Number(right?.pitch) || 0)
      || (Number(left?.id) || 0) - (Number(right?.id) || 0);
  }

  function buildChannelNoteIndex(channel) {
    const buckets = new Map();
    // 원본 배열은 ID와 선택 참조의 안정성을 위해 생성 순서를 유지합니다.
    // 렌더링 인덱스만 시간순으로 정렬해 편집 후에도 앞쪽 노트부터 일관되게 그립니다.
    const orderedIndices = channel.notes
      .map((_, index) => index)
      .sort((leftIndex, rightIndex) => compareNotesByTimeline(
        channel.notes[leftIndex],
        channel.notes[rightIndex],
      ));
    for (const index of orderedIndices) {
      const note = channel.notes[index];
      const firstMeasure = Math.max(0, Math.floor(note.startBeat / CONFIG.beatsPerMeasure));
      const lastMeasure = Math.max(
        firstMeasure,
        Math.floor(Math.max(note.startBeat, note.startBeat + note.durationBeat - 1e-7) / CONFIG.beatsPerMeasure),
      );
      for (let measure = firstMeasure; measure <= lastMeasure; measure += 1) {
        if (!buckets.has(measure)) {
          buckets.set(measure, []);
        }
        buckets.get(measure).push(index);
      }
    }
    const runtime = { noteCount: channel.notes.length, buckets };
    state.channelNoteRuntime.set(String(channel.id), runtime);
    return runtime;
  }

  function getChannelNoteRuntime(channel) {
    const key = String(channel.id);
    const current = state.channelNoteRuntime.get(key);
    if (!current || current.noteCount !== channel.notes.length) {
      return buildChannelNoteIndex(channel);
    }
    return current;
  }

  function getVisibleChannelNotes(channel, startBeat, endBeat, channelIndex = -1) {
    const runtime = getChannelNoteRuntime(channel);
    const firstMeasure = Math.max(0, Math.floor(Math.max(0, startBeat) / CONFIG.beatsPerMeasure));
    const lastMeasure = Math.max(firstMeasure, Math.floor(Math.max(0, endBeat) / CONFIG.beatsPerMeasure));
    const indices = new Set();
    for (let measure = firstMeasure; measure <= lastMeasure; measure += 1) {
      for (const index of runtime.buckets.get(measure) || []) {
        indices.add(index);
      }
    }

    const noteById = new Map();
    for (const index of indices) {
      const note = channel.notes[index];
      if (note && note.startBeat + note.durationBeat >= startBeat && note.startBeat <= endBeat) {
        noteById.set(note.id, note);
      }
    }

    // 드래그 중에는 기존 마디 인덱스를 매 프레임 다시 만들지 않습니다.
    // 위치가 바뀐 노트만 추가 검사해 긴 채널에서도 전체 배열 순회를 피합니다.
    if (
      state.interaction
      && state.activePanel === "notes"
      && channelIndex === state.activeChannel
    ) {
      const interactionNotes = state.interaction.type === "move-selection"
        ? state.interaction.originals?.map((entry) => entry.note) || []
        : state.interaction.type === "resize-note"
          ? [state.interaction.note]
          : [];
      for (const note of interactionNotes) {
        if (note && note.startBeat + note.durationBeat >= startBeat && note.startBeat <= endBeat) {
          noteById.set(note.id, note);
        }
      }
    }

    return [...noteById.values()].sort(compareNotesByTimeline);
  }

  function drawRoll() {
    const context = elements.rollCanvas.getContext("2d");
    const viewportWidth = Math.max(1, state.rollSurface.width || elements.rollCanvas.clientWidth);
    const viewportHeight = Math.max(1, state.rollSurface.height || elements.rollCanvas.clientHeight);
    const visibleLeft = state.rollSurface.originX || 0;
    const visibleTop = state.rollSurface.originY || 0;
    const visibleRight = visibleLeft + viewportWidth;
    const visibleBottom = visibleTop + viewportHeight;
    const totalWidth = getRollWidth();
    const totalHeight = getRollHeight();
    const editableStartX = beatToX(0);
    const theme = getCanvasTheme();

    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.save();
    context.translate(-visibleLeft, -visibleTop);

    context.fillStyle = theme.rollBackground;
    context.fillRect(visibleLeft, visibleTop, viewportWidth, viewportHeight);
    if (visibleLeft < editableStartX) {
      context.fillStyle = theme.rollPre;
      context.fillRect(visibleLeft, visibleTop, Math.min(editableStartX, visibleRight) - visibleLeft, viewportHeight);
    }

    const horizontalStart = Math.max(editableStartX, visibleLeft);
    const horizontalEnd = Math.min(totalWidth, visibleRight);
    for (let pitch = CONFIG.maxPitch; pitch >= CONFIG.minPitch; pitch -= 1) {
      const y = pitchToY(pitch);
      const rowBottom = y + getRowHeight();
      if (rowBottom < visibleTop || y > visibleBottom) {
        continue;
      }
      if (isBlackPitch(pitch)) {
        context.fillStyle = theme.blackRow;
        context.fillRect(horizontalStart, y, Math.max(0, horizontalEnd - horizontalStart), getRowHeight());
      }
      context.strokeStyle = theme.pitchLine;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(horizontalStart, y + 0.5);
      context.lineTo(horizontalEnd, y + 0.5);
      context.stroke();
    }

    for (let pitch = CONFIG.maxPitch; pitch >= CONFIG.minPitch; pitch -= 1) {
      if (pitch % 12 !== 0) {
        continue;
      }
      const boundaryY = pitchToY(pitch) + getRowHeight();
      if (boundaryY < visibleTop || boundaryY > visibleBottom || boundaryY < 0 || boundaryY > totalHeight) {
        continue;
      }
      context.strokeStyle = theme.octaveLine;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(horizontalStart, Math.round(boundaryY) + 0.5);
      context.lineTo(horizontalEnd, Math.round(boundaryY) + 0.5);
      context.stroke();
    }
    context.lineWidth = 1;

    const drawingUnit = getVisibleGridUnit();
    const visibleStartBeat = Math.max(0, xToBeat(visibleLeft) - drawingUnit);
    const visibleEndBeat = Math.min(getTotalBeats(), Math.max(0, xToBeat(visibleRight) + drawingUnit));
    const firstGridIndex = Math.max(0, Math.floor(visibleStartBeat / drawingUnit));
    const lastGridIndex = Math.ceil(visibleEndBeat / drawingUnit);

    for (let index = firstGridIndex; index <= lastGridIndex; index += 1) {
      const beat = index * drawingUnit;
      const x = Math.round(beatToX(beat)) + 0.5;
      const isMeasure = Math.abs(beat % CONFIG.beatsPerMeasure) < 1e-7;
      const isBeat = Math.abs(beat % 1) < 1e-7;
      const isThirtySecondBoundary = Math.abs(beat / 0.125 - Math.round(beat / 0.125)) < 1e-7;
      const isSixtyFourthSubdivision = Math.abs(drawingUnit - CONFIG.minimumNoteBeat) < 1e-7
        && !isThirtySecondBoundary;
      context.strokeStyle = isMeasure ? theme.measureGrid : isBeat ? theme.beatGrid : theme.minorGrid;
      context.lineWidth = isMeasure ? 1.5 : 1;
      context.setLineDash(isSixtyFourthSubdivision ? [2, 3] : []);
      context.beginPath();
      context.moveTo(x, visibleTop);
      context.lineTo(x, visibleBottom);
      context.stroke();
    }
    context.setLineDash([]);

    drawMidiReferenceNotes(context, visibleLeft, visibleTop, visibleRight, visibleBottom);

    const visibleChannels = isMidiReferenceActive()
      ? []
      : [...state.channels.keys()]
        .filter((channelIndex) => state.channels[channelIndex]?.visible !== false)
        // Background channels first; the active channel is always painted last so it stays on top.
        .sort((a, b) => Number(state.activePanel === "notes" && a === state.activeChannel) - Number(state.activePanel === "notes" && b === state.activeChannel));
    for (const channelIndex of visibleChannels) {
      const channel = state.channels[channelIndex];
      const color = getChannelColor(channel, channelIndex);
      const noteBorderColor = darkenHexColor(color);
      const isActive = state.activePanel === "notes" && channelIndex === state.activeChannel;
      // Keep overlaps visible, while giving the active channel a dense foreground presence.
      const baseAlpha = isActive ? 0.99 : 0.70;
      const channelAlpha = channel.muted ? baseAlpha * 0.46 : baseAlpha;
      context.globalAlpha = channelAlpha;

      const notesInView = getVisibleChannelNotes(
        channel,
        Math.max(0, xToBeat(visibleLeft) - CONFIG.beatsPerMeasure),
        Math.max(0, xToBeat(visibleRight) + CONFIG.beatsPerMeasure),
        channelIndex,
      );
      const orderedNotesInView = isActive
        ? [...notesInView].sort((left, right) => {
          const leftSelected = state.selectedNoteIds.has(left.id) ? 1 : 0;
          const rightSelected = state.selectedNoteIds.has(right.id) ? 1 : 0;
          return leftSelected - rightSelected || compareNotesByTimeline(left, right);
        })
        : notesInView;
      for (const note of orderedNotesInView) {
        const x = beatToX(note.startBeat);
        const endX = beatToX(note.startBeat + note.durationBeat);
        if (endX < visibleLeft || x > visibleRight) {
          continue;
        }
        // Active-channel notes are deliberately thicker than background notes.
        const y = pitchToY(note.pitch) + (isActive ? 1 : 3);
        const heightValue = Math.max(3, getRowHeight() - (isActive ? 2 : 6));
        if (y + heightValue < visibleTop || y > visibleBottom) {
          continue;
        }
        const widthValue = Math.max(5, endX - x - 1);
        const selected = isActive && state.selectedNoteIds.has(note.id);
        const noteVolume = getNoteVolume(note);
        context.globalAlpha = channelAlpha * (0.62 + noteVolume / 15 * 0.36);

        if (isActive) {
          // Cheap bevel/shadow treatment: no canvas blur, so dense projects stay fast.
          context.fillStyle = "rgba(0,0,0,.26)";
          context.fillRect(x + 2, y + 2, widthValue, Math.max(1, heightValue - 1));
        }
        context.fillStyle = color;
        context.fillRect(x + 1, y, widthValue, heightValue);
        if (isActive) {
          context.fillStyle = "rgba(255,255,255,.30)";
          context.fillRect(x + 2, y + 1, Math.max(0, widthValue - 2), Math.min(2, heightValue));
          context.fillStyle = "rgba(0,0,0,.20)";
          context.fillRect(x + 2, y + heightValue - 2, Math.max(0, widthValue - 2), 2);
        }
        context.strokeStyle = noteBorderColor;
        context.lineWidth = selected ? 2.5 : (isActive ? 1.5 : 1);
        context.strokeRect(x + 1.5, y + 0.5, widthValue - 1, heightValue - 1);

        if (selected) {
          context.fillStyle = theme.selectedShine;
          context.fillRect(x + 3, y + 2, Math.max(0, widthValue - 4), 3);
          const handleWidth = Math.min(4, Math.max(2, Math.floor(widthValue / 4)));
          context.fillStyle = theme.resizeHandle;
          context.fillRect(x + 1, y + 1, handleWidth, Math.max(1, heightValue - 2));
          context.fillRect(x + 1 + widthValue - handleWidth, y + 1, handleWidth, Math.max(1, heightValue - 2));
          context.fillStyle = theme.resizeHandleLine;
          context.fillRect(x + 2, y + 4, 1, Math.max(1, heightValue - 8));
          context.fillRect(x + widthValue - 1, y + 4, 1, Math.max(1, heightValue - 8));
        }
        if (shouldDrawNoteVolumeLabel(isActive)) {
          // 마비노기 볼륨은 노트 시작점의 왼쪽 위 바깥에 표시합니다.
          // 설정에서 전체/선택 채널만/숨김을 선택할 수 있습니다.
          const volumeLabel = `V${noteVolume}`;
          const volumeFontSize = clamp(Math.floor(heightValue - 1), 6, 9);
          context.save();
          context.globalAlpha = channel.muted
            ? (isActive ? 0.54 : 0.34)
            : (isActive ? 0.96 : 0.62);
          context.font = `700 ${volumeFontSize}px system-ui, sans-serif`;
          context.textAlign = "left";
          context.textBaseline = "bottom";
          context.lineJoin = "round";
          context.lineWidth = 2;
          context.strokeStyle = state.theme === "light"
            ? "rgba(255,255,255,.94)"
            : "rgba(0,0,0,.82)";
          context.fillStyle = state.theme === "light" ? "#101923" : "#ffffff";
          const volumeTextX = x + 1;
          const volumeTextY = y - 1;
          context.strokeText(volumeLabel, volumeTextX, volumeTextY);
          context.fillText(volumeLabel, volumeTextX, volumeTextY);
          context.restore();
        }
        context.globalAlpha = channelAlpha;
      }
    }
    context.globalAlpha = 1;

    if (!isMidiReferenceActive() && state.interaction?.type === "create") {
      const draft = state.interaction.draft;
      const draftX = beatToX(draft.startBeat);
      context.globalAlpha = 0.65;
      context.fillStyle = getChannelColor(getActiveChannel(), state.activeChannel);
      const draftWidth = Math.max(5, beatToX(draft.startBeat + draft.durationBeat) - draftX - 1);
      const draftY = pitchToY(draft.pitch) + 2;
      const draftHeight = getRowHeight() - 4;
      context.fillRect(draftX + 1, draftY, draftWidth, draftHeight);
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.strokeRect(draftX + 1.5, draftY + 0.5, Math.max(1, draftWidth - 1), Math.max(1, draftHeight - 1));
      context.globalAlpha = 1;
    }

    if (state.interaction?.type === "marquee" || state.interaction?.type === "midi-marquee") {
      const left = Math.min(state.interaction.startX, state.interaction.currentX);
      const top = Math.min(state.interaction.startY, state.interaction.currentY);
      const boxWidth = Math.abs(state.interaction.currentX - state.interaction.startX);
      const boxHeight = Math.abs(state.interaction.currentY - state.interaction.startY);
      context.fillStyle = theme.marqueeFill;
      context.fillRect(left, top, boxWidth, boxHeight);
      context.strokeStyle = theme.marqueeStroke;
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      context.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.round(boxWidth), Math.round(boxHeight));
      context.setLineDash([]);
    }

    context.restore();
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function getAlignedVisiblePlayheadX() {
    return Math.round(beatToX(state.playhead.beat) - elements.rollViewport.scrollLeft);
  }

  function getTempoMarkerScreenGeometry(tempo) {
    const lineX = Math.round(beatToX(tempo.beat) - elements.rollViewport.scrollLeft) + 0.5;
    const label = `${tempo.bpm}`;
    const labelWidth = Math.max(30, 13 + label.length * 6.5);
    const canvasWidth = elements.timelineCanvas.clientWidth;
    const labelX = clamp(lineX + 5, 2, Math.max(2, canvasWidth - labelWidth - 2));
    const canvasHeight = elements.timelineCanvas.clientHeight || 51;
    return {
      lineX,
      label,
      labelX,
      labelY: Math.max(20, canvasHeight - 16),
      labelWidth,
      labelHeight: 14,
    };
  }

  function drawRoundedRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
  }

  function drawTimeline() {
    const context = elements.timelineCanvas.getContext("2d");
    const width = elements.timelineCanvas.clientWidth;
    const height = elements.timelineCanvas.clientHeight || 51;
    const scrollLeft = elements.rollViewport.scrollLeft;
    const theme = getCanvasTheme();
    const drawingUnit = getVisibleGridUnit();
    const firstVisibleBeat = Math.max(0, xToBeat(scrollLeft) - drawingUnit);
    const lastVisibleBeat = Math.min(getTotalBeats(), xToBeat(scrollLeft + width) + drawingUnit);

    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.timelineBackground;
    context.fillRect(0, 0, width, height);

    const preRollRight = getPreRollWidth() - scrollLeft;
    if (preRollRight > 0) {
      context.fillStyle = theme.timelinePre;
      context.fillRect(0, 0, Math.min(width, preRollRight), height);
    }

    const firstGridIndex = Math.max(0, Math.floor(firstVisibleBeat / drawingUnit));
    const lastGridIndex = Math.ceil(lastVisibleBeat / drawingUnit);
    for (let index = firstGridIndex; index <= lastGridIndex; index += 1) {
      const beat = index * drawingUnit;
      const x = Math.round(beatToX(beat) - scrollLeft) + 0.5;
      const isMeasure = Math.abs(beat % CONFIG.beatsPerMeasure) < 1e-7;
      const isBeat = Math.abs(beat % 1) < 1e-7;
      const isThirtySecondBoundary = Math.abs(beat / 0.125 - Math.round(beat / 0.125)) < 1e-7;
      const isSixtyFourthSubdivision = Math.abs(drawingUnit - CONFIG.minimumNoteBeat) < 1e-7
        && !isThirtySecondBoundary;
      context.strokeStyle = isMeasure ? theme.timelineMeasure : isBeat ? theme.timelineBeat : theme.minorGrid;
      context.lineWidth = isMeasure ? 1.5 : 1;
      context.setLineDash(isSixtyFourthSubdivision ? [2, 3] : []);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.setLineDash([]);

    const visibleTempoMarkers = [];
    for (const tempo of getSortedTempos()) {
      const marker = getTempoMarkerScreenGeometry(tempo);
      if (marker.lineX < -marker.labelWidth - 8 || marker.lineX > width + marker.labelWidth + 8) {
        continue;
      }
      visibleTempoMarkers.push(marker);
      context.strokeStyle = "#2ea86f";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(marker.lineX, 0);
      context.lineTo(marker.lineX, height);
      context.stroke();
    }

    context.font = "700 11px sans-serif";
    context.textBaseline = "top";
    context.lineJoin = "round";
    const firstMeasureBeat = Math.ceil(firstVisibleBeat / CONFIG.beatsPerMeasure) * CONFIG.beatsPerMeasure;
    for (let beat = firstMeasureBeat; beat <= lastVisibleBeat; beat += CONFIG.beatsPerMeasure) {
      const x = Math.round(beatToX(beat) - scrollLeft);
      const label = String(Math.floor(beat / CONFIG.beatsPerMeasure));
      context.lineWidth = 3;
      context.strokeStyle = theme.measureTextOutline;
      context.strokeText(label, x + 4, 2);
      context.fillStyle = theme.measureText;
      context.fillText(label, x + 4, 2);
    }
    context.textBaseline = "alphabetic";

    context.font = "700 10px sans-serif";
    for (const marker of visibleTempoMarkers) {
      drawRoundedRect(context, marker.labelX, marker.labelY, marker.labelWidth, marker.labelHeight, 3);
      context.fillStyle = state.theme === "light" ? "#11603f" : "#176845";
      context.fill();
      context.strokeStyle = state.theme === "light" ? "#23865b" : "#72e2a8";
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = "#f4fff8";
      context.textBaseline = "middle";
      context.fillText(marker.label, marker.labelX + 6, marker.labelY + marker.labelHeight / 2 + 0.5);
    }
    context.textBaseline = "alphabetic";
    context.lineWidth = 1;
  }

  function updatePlayheadVisual() {
    const visibleX = getAlignedVisiblePlayheadX();
    const pianoRect = elements.pianoSection.getBoundingClientRect();
    const rollRect = elements.rollViewport.getBoundingClientRect();
    const timelineRect = elements.timelineCanvas.getBoundingClientRect();
    const isVisible = visibleX >= -1 && visibleX <= elements.rollViewport.clientWidth + 1;
    elements.playhead.hidden = !isVisible;
    if (!isVisible) {
      return;
    }
    const left = rollRect.left - pianoRect.left + visibleX;
    const top = timelineRect.top - pianoRect.top;
    const audioRect = elements.audioLaneViewport?.getBoundingClientRect();
    const bottom = (audioRect?.bottom || rollRect.bottom) - pianoRect.top;
    elements.playhead.style.top = `${Math.round(top)}px`;
    elements.playhead.style.height = `${Math.max(0, Math.round(bottom - top))}px`;
    elements.playhead.style.transform = `translateX(${Math.round(left) - 1}px)`;
  }

  function previewNotesAtPlayhead(beat) {
    if (state.playback.running || state.playback.loading) return 0;
    const safeBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    const now = performance.now();
    if (Math.abs(safeBeat - state.playhead.previewBeat) < 1e-7 && now - state.playhead.previewAt < 80) return 0;
    state.playhead.previewBeat = safeBeat;
    state.playhead.previewAt = now;

    const notes = [];
    if (isMidiReferenceActive()) {
      const document = getActiveMidiDocument();
      if (document && !document.muted) {
        for (const group of document.groups || []) {
          if (group.muted) continue;
          for (const note of group.notes || []) {
            if (note.startBeat <= safeBeat + 1e-7 && note.startBeat + note.durationBeat > safeBeat + 1e-7) {
              notes.push({
                pitch: note.pitch,
                velocity: clamp(Math.round(Number(note.velocity) || 100), 1, 127),
                program: clamp(Number(group.program) || 0, 0, 127),
                bank: isMidiGroupDrums(group) ? 128 : 0,
              });
            }
          }
        }
      }
    } else {
      for (const channel of state.channels) {
        if (channel.muted) continue;
        for (const note of channel.notes || []) {
          if (note.startBeat <= safeBeat + 1e-7 && note.startBeat + note.durationBeat > safeBeat + 1e-7) {
            const velocity = getNotePlaybackVelocity(note);
            if (velocity > 0) notes.push({ pitch: note.pitch, velocity, program: getChannelInstrumentProgram(channel), bank: getChannelInstrumentBank(channel) });
          }
        }
      }
    }
    if (!notes.length) return 0;
    const maximum = Math.max(16, Number(audioEngine.maxVoices) || 64);
    const audible = notes
      .sort((left, right) => right.velocity - left.velocity || left.pitch - right.pitch)
      .slice(0, maximum);
    const gainScale = getPlaybackNormalizationGainForVoiceCount(audible.length);
    for (const note of audible) {
      audioEngine.playNote(note.pitch, note.velocity, null, 0.14, {
        program: note.program,
        bank: note.bank || 0,
        gainScale,
      });
    }
    return audible.length;
  }

  function setPlayheadBeat(beat, { stop = false, preview = stop } = {}) {
    if (stop && (state.playback.running || state.playback.loading)) {
      stopPlayback(false);
    }
    state.playhead.beat = clamp(
      Number(beat) || 0,
      0,
      getTotalBeats(),
    );
    updatePlayheadVisual();
    drawTimeline();
    updatePlaybackTimeInfo();
    if (preview) previewNotesAtPlayhead(state.playhead.beat);
  }

  function timelineRawBeatFromPointer(event) {
    const rect = elements.timelineCanvas.getBoundingClientRect();
    const absoluteX = event.clientX - rect.left + elements.rollViewport.scrollLeft;
    return xToBeat(absoluteX);
  }

  function timelineBeatFromPointer(event) {
    return clamp(snapBeat(timelineRawBeatFromPointer(event)), 0, getTotalBeats());
  }

  function scrollTimelineDuringDrag(event) {
    const rect = elements.timelineCanvas.getBoundingClientRect();
    const edge = Math.min(CONFIG.timelineDragEdgePixels, rect.width * 0.16);
    let direction = 0;
    let strength = 1;

    if (event.clientX < rect.left + edge) {
      direction = -1;
      strength = clamp(Math.ceil((rect.left + edge - event.clientX) / Math.max(8, edge / 2)), 1, 4);
    } else if (event.clientX > rect.right - edge) {
      direction = 1;
      strength = clamp(Math.ceil((event.clientX - (rect.right - edge)) / Math.max(8, edge / 2)), 1, 4);
    }

    if (!direction) {
      return false;
    }

    const stepPixels = getQuarterWidth() * getSnapBeat() * strength;
    const nextScrollLeft = snapScrollLeftToBeatUnit(
      elements.rollViewport.scrollLeft + direction * stepPixels,
      getSnapBeat(),
    );
    if (Math.abs(nextScrollLeft - elements.rollViewport.scrollLeft) < 0.5) {
      return false;
    }
    elements.rollViewport.scrollLeft = nextScrollLeft;
    return true;
  }

  function findTempoMarkerFromPointer(event) {
    const rect = elements.timelineCanvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const touchLike = event.pointerType === "touch" || event.pointerType === "pen";
    const horizontalPadding = touchLike ? 8 : 2;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const tempo of getSortedTempos()) {
      const marker = getTempoMarkerScreenGeometry(tempo);
      // Tempo manipulation is intentionally limited to the tempo label band.
      // The full-height green guide line no longer steals playhead dragging.
      const onLabel = pointerX >= marker.labelX - horizontalPadding
        && pointerX <= marker.labelX + marker.labelWidth + horizontalPadding
        && pointerY >= marker.labelY
        && pointerY <= marker.labelY + marker.labelHeight;
      const distance = Math.abs(pointerX - marker.lineX);
      if (onLabel && distance < nearestDistance) {
        nearest = tempo;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function handleTimelinePointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    const rawBeat = timelineRawBeatFromPointer(event);
    const tempo = rawBeat >= 0 ? findTempoMarkerFromPointer(event) : null;
    const touchLike = event.pointerType === "touch" || event.pointerType === "pen";

    if (tempo) {
      setPlayheadBeat(tempo.beat, { stop: true });
      if (isMidiReferenceActive()) {
        showToast(`MIDI 템포 ${tempo.bpm} · 읽기 전용`);
        event.preventDefault();
        return;
      }
      if (tempo.fixed) {
        if (touchLike) {
          state.tempoTouchTap = {
            pointerId: event.pointerId,
            tempoId: tempo.id,
            startX: event.clientX,
            startY: event.clientY,
            cancelled: false,
          };
          trySetPointerCapture(elements.timelineCanvas, event.pointerId);
        } else {
          showToast("0번 템포는 위치가 고정되어 있으며 우클릭으로 값을 수정할 수 있습니다.");
        }
        event.preventDefault();
        return;
      }
      state.tempoDrag = {
        pointerId: event.pointerId,
        tempoId: tempo.id,
        originalBeat: tempo.beat,
        moved: false,
        pointerType: event.pointerType || "mouse",
        startX: event.clientX,
        startY: event.clientY,
        dragStarted: !touchLike,
      };
      trySetPointerCapture(elements.timelineCanvas, event.pointerId);
      elements.timelineCanvas.style.cursor = touchLike ? "pointer" : "ew-resize";
      event.preventDefault();
      return;
    }

    state.playhead.pointerId = event.pointerId;
    trySetPointerCapture(elements.timelineCanvas, event.pointerId);
    setPlayheadBeat(timelineBeatFromPointer(event), { stop: true });
    event.preventDefault();
  }

  function handleTimelinePointerMove(event) {
    if (state.tempoTouchTap?.pointerId === event.pointerId) {
      const distance = Math.hypot(
        event.clientX - state.tempoTouchTap.startX,
        event.clientY - state.tempoTouchTap.startY,
      );
      if (distance > CONFIG.longPressMoveTolerance) state.tempoTouchTap.cancelled = true;
      event.preventDefault();
      return;
    }

    if (state.tempoDrag?.pointerId === event.pointerId) {
      if (isMidiReferenceActive()) {
        state.tempoDrag = null;
        elements.timelineCanvas.style.cursor = "pointer";
        return;
      }
      const drag = state.tempoDrag;
      const touchLike = drag.pointerType === "touch" || drag.pointerType === "pen";
      if (touchLike && !drag.dragStarted) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (distance <= CONFIG.longPressMoveTolerance) {
          event.preventDefault();
          return;
        }
        drag.dragStarted = true;
        elements.timelineCanvas.style.cursor = "ew-resize";
      }
      scrollTimelineDuringDrag(event);
      const tempo = state.tempos.find((item) => item.id === drag.tempoId);
      if (!tempo || tempo.fixed) {
        return;
      }
      const minimumBeat = getSnapBeat();
      const targetBeat = clamp(timelineBeatFromPointer(event), minimumBeat, getTotalBeats());
      if (!getTempoAtExactBeat(targetBeat, tempo.id)) {
        if (Math.abs(tempo.beat - targetBeat) > 1e-7) {
          tempo.beat = Number(targetBeat.toFixed(6));
          drag.moved = true;
          drawTimeline();
          updateChannelInfo();
        }
      }
      event.preventDefault();
      return;
    }

    if (state.playhead.pointerId === event.pointerId) {
      scrollTimelineDuringDrag(event);
      setPlayheadBeat(timelineBeatFromPointer(event), { preview: true });
      return;
    }

    const hoverTempo = findTempoMarkerFromPointer(event);
    elements.timelineCanvas.style.cursor = hoverTempo
      ? (isMidiReferenceActive() || hoverTempo.fixed ? "pointer" : "ew-resize")
      : "default";
  }

  function handleTimelinePointerUp(event) {
    if (state.tempoTouchTap?.pointerId === event.pointerId) {
      const tap = state.tempoTouchTap;
      state.tempoTouchTap = null;
      try { elements.timelineCanvas.releasePointerCapture(event.pointerId); } catch {}
      if (!tap.cancelled && event.type !== "pointercancel") {
        const tempo = state.tempos.find((item) => item.id === tap.tempoId);
        if (tempo) openTempoEditor(tempo);
      }
      return;
    }

    if (state.tempoDrag?.pointerId === event.pointerId) {
      const drag = state.tempoDrag;
      const moved = drag.moved;
      const touchLike = drag.pointerType === "touch" || drag.pointerType === "pen";
      const tempo = state.tempos.find((item) => item.id === drag.tempoId);
      state.tempoDrag = null;
      elements.timelineCanvas.style.cursor = "default";
      try {
        elements.timelineCanvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
      if (moved) {
        markDirty("템포 이동");
        shrinkTimelineToContent();
        drawRoll();
        drawTimeline();
        updateChannelInfo();
      } else if (touchLike && event.type !== "pointercancel" && tempo) {
        openTempoEditor(tempo);
      }
      return;
    }

    if (state.playhead.pointerId !== event.pointerId) {
      return;
    }
    state.playhead.pointerId = null;
    try {
      elements.timelineCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
  }


  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function isKeyboardPitchPressed(pitch) {
    return state.keyboard.pressedPitch === pitch
      || state.keyboard.previewPitch === pitch
      || state.keyboard.playbackPitches.has(pitch);
  }

  function pitchSetsEqual(left, right) {
    if (left.size !== right.size) {
      return false;
    }
    for (const pitch of left) {
      if (!right.has(pitch)) {
        return false;
      }
    }
    return true;
  }

  function applyPlaybackVisualEvent(event) {
    const current = state.playback.visualPitchCounts.get(event.pitch) || 0;
    const next = current + event.delta;
    if (next > 0) {
      state.playback.visualPitchCounts.set(event.pitch, next);
    } else {
      state.playback.visualPitchCounts.delete(event.pitch);
    }
  }

  function syncPlaybackPitchSet() {
    const next = new Set(state.playback.visualPitchCounts.keys());
    if (pitchSetsEqual(next, state.keyboard.playbackPitches)) return;
    state.keyboard.playbackPitches = next;
    const now = performance.now();
    const minimumInterval = 34;
    const elapsed = now - state.playback.keyboardDrawAt;
    if (elapsed >= minimumInterval && !state.playback.keyboardDrawTimer) {
      state.playback.keyboardDrawAt = now;
      drawKeyboard();
      return;
    }
    if (!state.playback.keyboardDrawTimer) {
      state.playback.keyboardDrawTimer = window.setTimeout(() => {
        state.playback.keyboardDrawTimer = 0;
        state.playback.keyboardDrawAt = performance.now();
        drawKeyboard();
      }, Math.max(0, minimumInterval - elapsed));
    }
  }

  function initializePlaybackVisualEvents(notes, startBeat) {
    const events = [];
    for (const note of notes) {
      if (getNotePlaybackVelocity(note) <= 0) continue;
      const endBeat = note.startBeat + note.durationBeat;
      if (endBeat <= startBeat + 1e-7) {
        continue;
      }
      events.push({ beat: note.startBeat, pitch: note.pitch, delta: 1 });
      events.push({ beat: endBeat, pitch: note.pitch, delta: -1 });
    }
    events.sort((left, right) => left.beat - right.beat || left.delta - right.delta || left.pitch - right.pitch);
    state.playback.visualEvents = events;
    state.playback.visualEventIndex = 0;
    state.playback.visualPitchCounts = new Map();
    while (
      state.playback.visualEventIndex < events.length
      && events[state.playback.visualEventIndex].beat <= startBeat + 1e-7
    ) {
      applyPlaybackVisualEvent(events[state.playback.visualEventIndex++]);
    }
    syncPlaybackPitchSet();
  }

  function updatePlaybackKeyboardPitches(beat) {
    const events = state.playback.visualEvents;
    let changed = false;
    while (
      state.playback.visualEventIndex < events.length
      && events[state.playback.visualEventIndex].beat <= beat + 1e-7
    ) {
      applyPlaybackVisualEvent(events[state.playback.visualEventIndex++]);
      changed = true;
    }
    if (changed) {
      syncPlaybackPitchSet();
    }
  }

  function clearPlaybackKeyboardPitches() {
    state.playback.visualEvents = [];
    state.playback.visualEventIndex = 0;
    state.playback.visualPitchCounts = new Map();
    window.clearTimeout(state.playback.keyboardDrawTimer);
    state.playback.keyboardDrawTimer = 0;
    if (!state.keyboard.playbackPitches.size) return;
    state.keyboard.playbackPitches = new Set();
    state.playback.keyboardDrawAt = performance.now();
    drawKeyboard();
  }

  function drawKeyboard() {
    const context = elements.keyboardCanvas.getContext("2d");
    const width = elements.keyboardCanvas.clientWidth;
    const height = elements.keyboardCanvas.clientHeight;
    const scrollTop = elements.rollViewport.scrollTop;
    const visibleTop = scrollTop - getRowHeight() * 2;
    const visibleBottom = scrollTop + height + getRowHeight() * 2;
    const blackWidth = Math.round(width * 0.62);
    const blackHeight = Math.max(12, getRowHeight() * 0.72);

    const whiteGradient = context.createLinearGradient(0, 0, width, 0);
    whiteGradient.addColorStop(0, "#eceef1");
    whiteGradient.addColorStop(0.12, "#ffffff");
    whiteGradient.addColorStop(0.76, "#f8f8f7");
    whiteGradient.addColorStop(0.94, "#dedfdf");
    whiteGradient.addColorStop(1, "#b8bcc1");
    const pressedWhiteGradient = context.createLinearGradient(0, 0, width, 0);
    pressedWhiteGradient.addColorStop(0, "#c5dafb");
    pressedWhiteGradient.addColorStop(0.72, "#d9e8ff");
    pressedWhiteGradient.addColorStop(1, "#83a9e5");
    const blackGradient = context.createLinearGradient(0, 0, blackWidth, 0);
    blackGradient.addColorStop(0, "#050608");
    blackGradient.addColorStop(0.18, "#15191f");
    blackGradient.addColorStop(0.78, "#242a32");
    blackGradient.addColorStop(1, "#050608");
    const pressedBlackGradient = context.createLinearGradient(0, 0, blackWidth, 0);
    pressedBlackGradient.addColorStop(0, "#17345f");
    pressedBlackGradient.addColorStop(0.7, "#5489d7");
    pressedBlackGradient.addColorStop(1, "#1b3b6e");

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#9fa4aa";
    context.fillRect(0, 0, width, height);

    // 흰 건반은 인접한 흰 건반 중심의 중간 지점까지 차지합니다.
    // 검은 건반이 있는 경계는 앞쪽만 구분선을 그려 실제 건반의 홈처럼 보이게 합니다.
    for (let pitch = CONFIG.maxPitch; pitch >= CONFIG.minPitch; pitch -= 1) {
      if (isBlackPitch(pitch)) {
        continue;
      }
      const bounds = getWhiteKeyBounds(pitch);
      if (bounds.bottom < visibleTop || bounds.top > visibleBottom) {
        continue;
      }
      const y = bounds.top - scrollTop;
      const keyHeight = bounds.bottom - bounds.top;
      const pressed = isKeyboardPitchPressed(pitch);
      const hovered = state.keyboard.hoverPitch === pitch;

      context.fillStyle = pressed ? pressedWhiteGradient : whiteGradient;
      context.fillRect(0, y, width, keyHeight);
      if (hovered && !pressed) {
        context.fillStyle = "rgba(101, 151, 230, 0.16)";
        context.fillRect(0, y, width, keyHeight);
      }

      context.fillStyle = "rgba(255,255,255,0.72)";
      context.fillRect(2, y + 1, width - 7, 1);
      context.fillStyle = "rgba(72,78,87,0.12)";
      context.fillRect(width - 9, y + 1, 7, Math.max(0, keyHeight - 2));

      const lowerWhite = findAdjacentWhitePitch(pitch, -1);
      if (lowerWhite != null) {
        const hasBlackBetween = pitch - lowerWhite === 2;
        const lineStart = hasBlackBetween ? blackWidth - 1 : 0;
        context.strokeStyle = pitch % 12 === 0 ? "#707780" : "#92979e";
        context.lineWidth = pitch % 12 === 0 ? 1.35 : 1;
        context.beginPath();
        context.moveTo(lineStart, Math.round(y + keyHeight) + 0.5);
        context.lineTo(width, Math.round(y + keyHeight) + 0.5);
        context.stroke();
      }

      if (pitch % 12 === 0) {
        context.fillStyle = pressed ? "#173e75" : "#444a52";
        context.font = "600 11px sans-serif";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(noteLabel(pitch), width - 13, getPitchCenterY(pitch) - scrollTop);
      }
    }

    // 검은 건반은 음정 행의 중심에 얹고, 흰 건반보다 짧고 좁게 그립니다.
    for (let pitch = CONFIG.maxPitch; pitch >= CONFIG.minPitch; pitch -= 1) {
      if (!isBlackPitch(pitch)) {
        continue;
      }
      const centerY = getPitchCenterY(pitch) - scrollTop;
      if (centerY + blackHeight / 2 < 0 || centerY - blackHeight / 2 > height) {
        continue;
      }
      const keyY = centerY - blackHeight / 2;
      const pressed = isKeyboardPitchPressed(pitch);
      const hovered = state.keyboard.hoverPitch === pitch;

      context.save();
      context.shadowColor = "rgba(0,0,0,0.62)";
      context.shadowBlur = 4;
      context.shadowOffsetX = 2;
      context.shadowOffsetY = 1;
      roundedRectPath(context, 0, keyY, blackWidth, blackHeight, 3.5);
      context.fillStyle = pressed ? pressedBlackGradient : blackGradient;
      context.fill();
      context.restore();

      roundedRectPath(context, 0.5, keyY + 0.5, blackWidth - 1, blackHeight - 1, 3.5);
      context.strokeStyle = pressed ? "#9bc0ff" : "#020305";
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = pressed
        ? "rgba(255,255,255,0.32)"
        : hovered
          ? "rgba(122,162,247,0.28)"
          : "rgba(255,255,255,0.11)";
      roundedRectPath(context, 3, keyY + 2, blackWidth - 10, 2.5, 1.25);
      context.fill();

      context.fillStyle = "rgba(255,255,255,0.07)";
      context.fillRect(blackWidth - 6, keyY + 3, 2, Math.max(0, blackHeight - 6));
    }

    context.fillStyle = "rgba(0,0,0,0.32)";
    context.fillRect(width - 4, 0, 4, height);
  }

  function keyboardPitchFromPointer(event) {
    const rect = elements.keyboardCanvas.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const absoluteY = event.clientY - rect.top + elements.rollViewport.scrollTop;
    return keyboardPitchAt(x, absoluteY, rect.width);
  }


  function releaseKeyboardVoice(fast = false) {
    state.keyboard.requestToken += 1;
    if (state.keyboard.voice) {
      const context = audioEngine.context;
      state.keyboard.voice.release(context?.currentTime || 0, fast ? 0.04 : 0.16);
      state.keyboard.voice = null;
    }
    state.keyboard.pressedPitch = null;
    drawKeyboard();
  }

  async function previewKeyboardPitch(pitch) {
    const token = ++state.keyboard.requestToken;
    if (state.keyboard.voice) {
      const context = audioEngine.context;
      state.keyboard.voice.release(context?.currentTime || 0, 0.06);
      state.keyboard.voice = null;
    }
    state.keyboard.pressedPitch = pitch;
    drawKeyboard();

    try {
      audioEngine.ensureContext();
      await audioEngine.ensureReady();
      if (token !== state.keyboard.requestToken || state.keyboard.pressedPitch !== pitch) {
        return;
      }
      const previewChannel = state.activePanel === "notes" ? getActiveChannel() : null;
      const previewProgram = previewChannel ? getChannelInstrumentProgram(previewChannel) : 0;
      const previewBank = previewChannel ? getChannelInstrumentBank(previewChannel) : 0;
      state.keyboard.voice = audioEngine.playNote(pitch, 108, null, null, { program: previewProgram, bank: previewBank });
    } catch (error) {
      console.error(error);
      if (token === state.keyboard.requestToken) {
        showToast(error instanceof Error ? error.message : "소리를 재생하지 못했습니다.");
        releaseKeyboardVoice(true);
      }
    }
  }

  async function previewEditorPitch(pitch, { holdVisual = true } = {}) {
    const safePitch = clamp(Math.round(Number(pitch) || CONFIG.minPitch), CONFIG.minPitch, CONFIG.maxPitch);
    window.clearTimeout(state.keyboard.previewTimer);
    state.keyboard.previewTimer = 0;
    state.keyboard.previewPitch = safePitch;
    state.keyboard.previewStartedAt = performance.now();
    drawKeyboard();

    const token = ++state.keyboard.previewRequestToken;
    if (state.keyboard.previewVoice) {
      const context = audioEngine.context;
      state.keyboard.previewVoice.release(context?.currentTime || 0, 0.04);
      state.keyboard.previewVoice = null;
    }

    try {
      audioEngine.ensureContext();
      await audioEngine.ensureReady();
      if (token !== state.keyboard.previewRequestToken) {
        return;
      }
      const previewChannel = state.activePanel === "notes" ? getActiveChannel() : null;
      const previewProgram = previewChannel ? getChannelInstrumentProgram(previewChannel) : 0;
      const previewBank = previewChannel ? getChannelInstrumentBank(previewChannel) : 0;
      state.keyboard.previewVoice = audioEngine.playNote(safePitch, 104, null, 0.14, { program: previewProgram, bank: previewBank });
    } catch (error) {
      console.error(error);
    }

    if (!holdVisual && state.keyboard.previewPitch === safePitch) {
      endEditorPitchPreview();
    }
  }

  function endEditorPitchPreview() {
    window.clearTimeout(state.keyboard.previewTimer);
    const elapsed = performance.now() - state.keyboard.previewStartedAt;
    const delay = Math.max(0, 135 - elapsed);
    state.keyboard.previewTimer = window.setTimeout(() => {
      state.keyboard.previewTimer = 0;
      state.keyboard.previewPitch = null;
      drawKeyboard();
    }, delay);
  }

  function clearEditorPitchPreview(fast = false) {
    window.clearTimeout(state.keyboard.previewTimer);
    state.keyboard.previewTimer = 0;
    state.keyboard.previewRequestToken += 1;
    state.keyboard.previewPitch = null;
    if (state.keyboard.previewVoice) {
      const context = audioEngine.context;
      state.keyboard.previewVoice.release(context?.currentTime || 0, fast ? 0.03 : 0.08);
      state.keyboard.previewVoice = null;
    }
    drawKeyboard();
  }

  function handleKeyboardPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    state.keyboard.pointerId = event.pointerId;
    trySetPointerCapture(elements.keyboardCanvas, event.pointerId);
    const pitch = keyboardPitchFromPointer(event);
    state.keyboard.hoverPitch = pitch;
    previewKeyboardPitch(pitch);
    event.preventDefault();
  }

  function handleKeyboardPointerMove(event) {
    const pitch = keyboardPitchFromPointer(event);
    if (state.keyboard.hoverPitch !== pitch) {
      state.keyboard.hoverPitch = pitch;
      drawKeyboard();
    }
    if (state.keyboard.pointerId === event.pointerId && state.keyboard.pressedPitch !== pitch) {
      previewKeyboardPitch(pitch);
    }
  }

  function handleKeyboardPointerUp(event) {
    if (state.keyboard.pointerId !== event.pointerId) {
      return;
    }
    state.keyboard.pointerId = null;
    try {
      elements.keyboardCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    releaseKeyboardVoice(false);
  }

  function handleKeyboardPointerLeave() {
    if (state.keyboard.pointerId == null) {
      state.keyboard.hoverPitch = null;
      drawKeyboard();
    }
  }

  function clearChannelDropIndicators() {
    elements.channelTabs?.querySelectorAll(".channel-tree-item[data-channel-id]").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
      item.classList.toggle(
        "dragging",
        Boolean(state.channelDrag.dragging)
          && item.dataset.channelId === String(state.channelDrag.sourceId),
      );
    });
  }

  function getChannelPreviewOrderIds() {
    if (!elements.channelTabs) return [];
    return [...elements.channelTabs.querySelectorAll(".channel-tree-item[data-channel-id]")]
      .map((item) => String(item.dataset.channelId || ""))
      .filter(Boolean);
  }

  function commitChannelPreviewOrder(orderIds, sourceId) {
    if (!Array.isArray(orderIds) || orderIds.length !== state.channels.length) {
      renderChannelTabs();
      return false;
    }
    const currentIds = state.channels.map((channel) => String(channel.id));
    if (currentIds.every((id, index) => id === String(orderIds[index]))) {
      renderChannelTabs();
      return false;
    }
    const activeChannelId = getActiveChannel()?.id;
    const channelById = new Map(state.channels.map((channel) => [String(channel.id), channel]));
    const reordered = orderIds.map((id) => channelById.get(String(id))).filter(Boolean);
    if (reordered.length !== state.channels.length) {
      renderChannelTabs();
      return false;
    }
    state.channels = reordered;
    state.activeChannel = Math.max(0, state.channels.findIndex((channel) => channel.id === activeChannelId));
    markDirty("채널 순서 변경");
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    const moved = state.channels.find((channel) => String(channel.id) === String(sourceId));
    if (moved) showToast(`${moved.name} 채널 순서를 변경했습니다.`);
    return true;
  }

  function moveChannelById(sourceId, targetId, placeAfter = false) {
    const sourceIndex = state.channels.findIndex((channel) => String(channel.id) === String(sourceId));
    const targetIndexBeforeRemoval = state.channels.findIndex((channel) => String(channel.id) === String(targetId));
    if (sourceIndex < 0 || targetIndexBeforeRemoval < 0 || sourceIndex === targetIndexBeforeRemoval) {
      return false;
    }
    const orderIds = state.channels.map((channel) => String(channel.id));
    const [movedId] = orderIds.splice(sourceIndex, 1);
    const targetIndex = orderIds.findIndex((id) => id === String(targetId));
    const insertionIndex = clamp(targetIndex + (placeAfter ? 1 : 0), 0, orderIds.length);
    orderIds.splice(insertionIndex, 0, movedId);

    const activeChannelId = getActiveChannel()?.id;
    const channelById = new Map(state.channels.map((channel) => [String(channel.id), channel]));
    state.channels = orderIds.map((id) => channelById.get(id)).filter(Boolean);
    state.activeChannel = Math.max(0, state.channels.findIndex((channel) => channel.id === activeChannelId));
    markDirty("채널 순서 변경");
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    const moved = channelById.get(String(sourceId));
    if (moved) showToast(`${moved.name} 채널 순서를 변경했습니다.`);
    return true;
  }

  function updateChannelDragPreview(event) {
    const drag = state.channelDrag;
    if (!drag.dragging || !elements.channelTabs || !drag.sourceElement) return;
    const treeRect = elements.channelTabs.getBoundingClientRect();
    if (event.clientY < treeRect.top + 42) {
      elements.channelTabs.scrollTop -= 14;
    } else if (event.clientY > treeRect.bottom - 42) {
      elements.channelTabs.scrollTop += 14;
    }

    const sourceElement = drag.sourceElement;
    const channelItems = [...elements.channelTabs.querySelectorAll(".channel-tree-item[data-channel-id]")]
      .filter((item) => item !== sourceElement);

    let beforeElement = null;
    for (const item of channelItems) {
      const rect = item.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        beforeElement = item;
        break;
      }
    }

    if (beforeElement) {
      elements.channelTabs.insertBefore(sourceElement, beforeElement);
    } else {
      // 음악 채널의 최하단은 오디오 행 바로 앞입니다. 오디오가 없으면 목록 끝까지 이동합니다.
      const firstAudioItem = elements.channelTabs.querySelector(".audio-source-item");
      elements.channelTabs.insertBefore(sourceElement, firstAudioItem || null);
    }
    drag.previewOrder = getChannelPreviewOrderIds();
    clearChannelDropIndicators();
  }

  function resetChannelDragState() {
    state.channelDrag.sourceId = null;
    state.channelDrag.pointerId = null;
    state.channelDrag.dragging = false;
    state.channelDrag.sourceElement = null;
    state.channelDrag.previewOrder = [];
  }

  function cancelChannelPointerDrag() {
    const drag = state.channelDrag;
    if (!drag.sourceId || !drag.dragging) return false;
    try { drag.sourceElement?.releasePointerCapture(drag.pointerId); } catch {}
    resetChannelDragState();
    // 실제 state.channels는 아직 바뀌지 않았으므로 다시 그리면 원래 순서가 그대로 복원됩니다.
    renderChannelTabs();
    return true;
  }

  function beginChannelPointerDrag(event, channelId, item) {
    if (
      event.button !== 0
      || event.target.closest(".channel-tree-action, .channel-tree-expander")
    ) return;
    state.channelDrag.sourceId = String(channelId);
    state.channelDrag.pointerId = event.pointerId;
    state.channelDrag.startX = event.clientX;
    state.channelDrag.startY = event.clientY;
    state.channelDrag.dragging = false;
    state.channelDrag.sourceElement = item;
    state.channelDrag.previewOrder = getChannelPreviewOrderIds();
    trySetPointerCapture(item, event.pointerId);
  }

  function moveChannelPointerDrag(event) {
    const drag = state.channelDrag;
    if (drag.pointerId !== event.pointerId || !drag.sourceId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 7) {
      drag.dragging = true;
      drag.sourceElement?.classList.add("dragging");
    }
    if (!drag.dragging) return;
    updateChannelDragPreview(event);
    event.preventDefault();
  }

  function endChannelPointerDrag(event) {
    const drag = state.channelDrag;
    if (drag.pointerId !== event.pointerId || !drag.sourceId) return;
    const sourceId = drag.sourceId;
    const dragged = drag.dragging;
    const previewOrder = dragged ? getChannelPreviewOrderIds() : [];
    try { drag.sourceElement?.releasePointerCapture(event.pointerId); } catch {}
    resetChannelDragState();

    if (dragged) {
      commitChannelPreviewOrder(previewOrder, sourceId);
      return;
    }

    const index = state.channels.findIndex((channel) => String(channel.id) === String(sourceId));
    if (index >= 0) selectChannel(index, { toggle: false });
  }


  function getAudioClipColor(clip, fallbackIndex = 0) {
    return isValidChannelColor(clip?.color)
      ? normalizeChannelColor(clip.color)
      : CHANNEL_COLORS[fallbackIndex % CHANNEL_COLORS.length];
  }

  function normalizeAudioClip(raw, index = 0) {
    const startBeat = Math.max(0, Number(raw?.startBeat) || 0);
    const durationBeat = Math.max(CONFIG.minimumNoteBeat, Number(raw?.durationBeat) || CONFIG.beatsPerMeasure);
    return {
      id: String(raw?.id || `audio-${index + 1}`),
      title: String(raw?.title || raw?.fileName || `오디오 ${index + 1}`),
      fileName: String(raw?.fileName || raw?.title || `오디오 ${index + 1}`),
      mimeType: String(raw?.mimeType || "audio/*"),
      color: getAudioClipColor(raw, index),
      visible: raw?.visible !== false,
      muted: Boolean(raw?.muted),
      startBeat,
      durationBeat,
      sourceDurationSeconds: Math.max(0, Number(raw?.sourceDurationSeconds) || 0),
      sourceOffsetSeconds: Math.max(0, Number(raw?.sourceOffsetSeconds) || 0),
      volume: clamp(Number.isFinite(Number(raw?.volume)) ? Number(raw.volume) : 0.3, 0, 1),
      playbackRate: clamp(Number.isFinite(Number(raw?.playbackRate)) ? Number(raw.playbackRate) : 1, 0.25, 4),
      assetAvailable: raw?.assetAvailable !== false,
    };
  }

  function getActiveAudioClip() {
    return state.audioClips.find((clip) => String(clip.id) === String(state.activeAudioClipId)) || null;
  }

  function getAudioClipEndBeat(clip) {
    return Math.max(0, Number(clip?.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(clip?.durationBeat) || 0);
  }

  function getAudioRuntime(clipId) {
    return state.audioRuntime.get(String(clipId)) || null;
  }

  function updateAudioLaneTransform() {
    if (!elements.audioLaneContent) return;
    elements.audioLaneContent.style.width = `${getRollWidth()}px`;
    elements.audioLaneContent.style.transform = `translateX(${-Math.round(elements.rollViewport?.scrollLeft || 0)}px)`;
  }

  function updateAudioSourceInspector() {
    const clip = getActiveAudioClip();
    if (!clip) return;
    const color = getAudioClipColor(clip, state.audioClips.indexOf(clip));
    elements.audioSourceIdentity?.style.setProperty("--channel-current-color", color);
    elements.audioSourceColorInput?.closest(".source-color-control")?.style.setProperty("--channel-current-color", color);
    if (elements.audioSourceColorInput) elements.audioSourceColorInput.value = color;
    if (elements.audioSourceNameInput) elements.audioSourceNameInput.value = clip.title;
    if (elements.audioSourceOffsetInput) {
      elements.audioSourceOffsetInput.max = String(Math.max(0, Number(clip.sourceDurationSeconds) || 0));
      elements.audioSourceOffsetInput.value = String(Math.round((Number(clip.sourceOffsetSeconds) || 0) * 100) / 100);
    }
    if (elements.audioSourceVolumeInput) {
      const volumePercent = Math.round(clamp(Number(clip.volume) || 0, 0, 1) * 100);
      elements.audioSourceVolumeInput.value = String(volumePercent);
      if (elements.audioSourceVolumeValue) elements.audioSourceVolumeValue.textContent = `${volumePercent}%`;
    }
    if (elements.audioSourceRateInput) elements.audioSourceRateInput.value = String(Math.round(clamp(Number(clip.playbackRate) || 1, 0.25, 4) * 100) / 100);
    if (elements.audioInfoTitle) elements.audioInfoTitle.textContent = clip.title;
    if (elements.audioInfoStart) elements.audioInfoStart.textContent = `${clip.startBeat.toFixed(3)} beat`;
    if (elements.audioInfoEnd) elements.audioInfoEnd.textContent = `${getAudioClipEndBeat(clip).toFixed(3)} beat`;
    if (elements.audioInfoDuration) elements.audioInfoDuration.textContent = formatSeconds(clip.sourceDurationSeconds || 0);
    if (elements.audioSourceDeleteButton) elements.audioSourceDeleteButton.disabled = false;
  }

  function selectAudioClip(clipId) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip) return false;
    setSidebarTab("channels");
    state.activePanel = "audio";
    state.activeAudioClipId = clip.id;
    clearNoteSelection();
    clearMidiSelection();
    state.timelineBeats = Math.max(getMinimumTimelineBeats(), getAudioClipEndBeat(clip) + CONFIG.minimumNoteBeat);
    renderChannelTabs();
    renderChannelEditor();
    renderAudioLane();
    updatePlayheadVisual();
    return true;
  }

  function setAudioClipVisible(clipId, visible, { notify = true } = {}) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip || clip.visible === Boolean(visible)) return false;
    clip.visible = Boolean(visible);
    setDirtyWithoutHistory();
    renderChannelTabs();
    renderAudioLane();
    if (notify) showToast(`${clip.title}을 ${clip.visible ? "표시" : "숨김"} 처리했습니다.`);
    return true;
  }

  function setAudioClipMuted(clipId, muted, { notify = true } = {}) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip || clip.muted === Boolean(muted)) return false;
    const wasPlaying = state.playback.running || state.playback.loading;
    clip.muted = Boolean(muted);
    setDirtyWithoutHistory();
    renderChannelTabs();
    renderAudioLane();
    if (wasPlaying) {
      const beat = state.playhead.beat;
      stopPlayback(false);
      state.playhead.beat = beat;
      window.setTimeout(() => startPlayback(), 0);
    }
    if (notify) showToast(`${clip.title} ${clip.muted ? "음소거" : "음소거 해제"}`);
    return true;
  }

  function setAudioClipColor(clipId, color, { commit = true } = {}) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip || !isValidChannelColor(color)) return false;
    const normalized = String(color).toLowerCase();
    if (clip.color === normalized) return false;
    clip.color = normalized;
    if (commit) markDirty("오디오 색상 변경");
    else setDirtyWithoutHistory();
    renderChannelTabs();
    renderAudioLane();
    updateAudioSourceInspector();
    return true;
  }

  function removeAudioRuntime(clipId) {
    state.audioRuntime.delete(String(clipId));
  }

  async function requestDeleteAudioClip(clipId = state.activeAudioClipId) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip) return false;
    const confirmed = await showConfirmDialog({
      title: "오디오 삭제",
      message: `${clip.title} 오디오를 삭제할까요?`,
      confirmLabel: "삭제",
    });
    if (!confirmed) return false;
    const index = state.audioClips.indexOf(clip);
    state.audioClips.splice(index, 1);
    if (String(state.activeAudioClipId) === String(clip.id)) {
      state.activeAudioClipId = null;
      state.activePanel = "notes";
    }
    shrinkTimelineToContent();
    markDirty("오디오 삭제");
    renderAll();
    return true;
  }

  async function decodeAudioArrayBuffer(arrayBuffer) {
    const context = audioEngine.ensureContext();
    return context.decodeAudioData(arrayBuffer.slice(0));
  }

  function audioDurationToBeatLength(startBeat, durationSeconds) {
    const tempoMap = createTempoTimeMap();
    const startSeconds = beatToSecondsFromMap(startBeat, tempoMap);
    const rawEndBeat = secondsToBeatFromMap(startSeconds + Math.max(0, durationSeconds), tempoMap);
    const snappedEnd = Math.max(startBeat + CONFIG.minimumNoteBeat, snapBeatToUnit(rawEndBeat, CONFIG.minimumNoteBeat));
    return Math.max(CONFIG.minimumNoteBeat, snappedEnd - startBeat);
  }

  async function importAudioFile(file) {
    if (!file) return false;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeAudioArrayBuffer(arrayBuffer);
      const reconnect = state.audioClips.find((clip) => clip.fileName === file.name && !getAudioRuntime(clip.id)?.audioBuffer);
      if (reconnect) {
        state.audioRuntime.set(String(reconnect.id), { arrayBuffer, audioBuffer: decoded, mimeType: file.type || reconnect.mimeType || "audio/*" });
        reconnect.assetAvailable = true;
        reconnect.mimeType = file.type || reconnect.mimeType || "audio/*";
        reconnect.sourceDurationSeconds = decoded.duration;
        state.activeAudioClipId = reconnect.id;
        state.activePanel = "audio";
        markDirty("오디오 다시 연결");
        renderAll();
        showToast(`${file.name} 오디오를 다시 연결했습니다.`);
        return true;
      }
      const id = `audio-${state.nextAudioClipId++}`;
      const startBeat = clamp(snapBeatToUnit(state.playhead.beat, getSnapBeat()), 0, getTotalBeats());
      const clip = normalizeAudioClip({
        id,
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        fileName: file.name,
        mimeType: file.type || "audio/*",
        color: getAudioClipColor(null, state.audioClips.length),
        startBeat,
        durationBeat: audioDurationToBeatLength(startBeat, decoded.duration),
        sourceDurationSeconds: decoded.duration,
        sourceOffsetSeconds: 0,
        volume: 0.3,
        playbackRate: 1,
        visible: true,
        muted: false,
        assetAvailable: true,
      }, state.audioClips.length);
      state.audioRuntime.set(String(id), { arrayBuffer, audioBuffer: decoded, mimeType: clip.mimeType });
      state.audioClips.push(clip);
      state.activeAudioClipId = clip.id;
      state.activePanel = "audio";
      extendTimelineToBeat(getAudioClipEndBeat(clip) + CONFIG.minimumNoteBeat);
      markDirty("오디오 추가");
      renderAll();
      showToast(`${file.name} 오디오를 추가했습니다.`);
      return true;
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "오디오를 불러오지 못했습니다.");
      return false;
    }
  }

  function getAutosaveAudioAssets() {
    return state.audioClips.map((clip) => {
      const runtime = getAudioRuntime(clip.id);
      return runtime?.arrayBuffer ? {
        id: String(clip.id),
        mimeType: runtime.mimeType || clip.mimeType || "audio/*",
        arrayBuffer: runtime.arrayBuffer,
      } : null;
    }).filter(Boolean);
  }

  async function restoreAutosaveAudioAssets(assets) {
    if (!Array.isArray(assets) || !assets.length) return;
    for (const asset of assets) {
      const clip = state.audioClips.find((item) => String(item.id) === String(asset?.id));
      if (!clip || !(asset?.arrayBuffer instanceof ArrayBuffer)) continue;
      try {
        const audioBuffer = await decodeAudioArrayBuffer(asset.arrayBuffer);
        state.audioRuntime.set(String(clip.id), {
          arrayBuffer: asset.arrayBuffer,
          audioBuffer,
          mimeType: asset.mimeType || clip.mimeType || "audio/*",
        });
        clip.assetAvailable = true;
        clip.sourceDurationSeconds = audioBuffer.duration;
      } catch {
        clip.assetAvailable = false;
      }
    }
    renderAudioLane();
    updateAudioSourceInspector();
  }

  function stopScheduledAudioClips() {
    for (const source of state.playback.audioSources || []) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    state.playback.audioSources = new Set();
  }

  function scheduleAudioClipsForPlayback(startBeat) {
    const context = audioEngine.context;
    if (!context) return 0;
    const globalRate = Math.max(0.01, Number(state.playbackRate) || 1);
    const playbackStartSeconds = state.playback.startSeconds;
    let scheduled = 0;
    stopScheduledAudioClips();
    for (const clip of state.audioClips) {
      if (clip.muted) continue;
      const runtime = getAudioRuntime(clip.id);
      const buffer = runtime?.audioBuffer;
      if (!buffer) continue;
      const clipStartSeconds = beatToSecondsFromMap(clip.startBeat, state.playback.tempoMap);
      const clipEndSeconds = beatToSecondsFromMap(getAudioClipEndBeat(clip), state.playback.tempoMap);
      if (clipEndSeconds <= playbackStartSeconds + 1e-6) continue;
      const audibleStartSeconds = Math.max(clipStartSeconds, playbackStartSeconds);
      const clipRate = clamp(Number(clip.playbackRate) || 1, 0.25, 4);
      const effectiveRate = globalRate * clipRate;
      const timelineOffset = Math.max(0, audibleStartSeconds - clipStartSeconds);
      const sourceOffset = Math.max(0, Number(clip.sourceOffsetSeconds) || 0) + timelineOffset * clipRate;
      const timelineDuration = Math.max(0, clipEndSeconds - audibleStartSeconds);
      const availableSourceDuration = Math.max(0, buffer.duration - sourceOffset);
      const requestedSourceDuration = timelineDuration * clipRate;
      const sourceDuration = Math.min(requestedSourceDuration, availableSourceDuration);
      if (sourceDuration <= 0.002) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(effectiveRate, context.currentTime);
      const gain = context.createGain();
      gain.gain.value = clamp(Number(clip.volume) || 0, 0, 1);
      source.connect(gain);
      gain.connect(audioEngine.masterGain || context.destination);
      const startAt = state.playback.audioStartTime + Math.max(0, audibleStartSeconds - playbackStartSeconds) / globalRate;
      source.start(Math.max(context.currentTime + 0.004, startAt), sourceOffset, sourceDuration);
      source.onended = () => {
        state.playback.audioSources.delete(source);
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
      state.playback.audioSources.add(source);
      scheduled += 1;
    }
    return scheduled;
  }

  function updateAudioClipSettings(clip, { offsetSeconds = null, volumePercent = null, playbackRate = null, commit = true } = {}) {
    if (!clip) return false;
    let changed = false;
    if (offsetSeconds != null) {
      const maxOffset = Math.max(0, Number(clip.sourceDurationSeconds) || 0);
      const nextOffset = clamp(Number(offsetSeconds) || 0, 0, maxOffset);
      if (Math.abs(nextOffset - (Number(clip.sourceOffsetSeconds) || 0)) > 1e-7) {
        clip.sourceOffsetSeconds = nextOffset;
        changed = true;
      }
    }
    if (volumePercent != null) {
      const nextVolume = clamp((Number(volumePercent) || 0) / 100, 0, 1);
      if (Math.abs(nextVolume - (Number(clip.volume) || 0)) > 1e-7) {
        clip.volume = nextVolume;
        changed = true;
      }
    }
    if (playbackRate != null) {
      const nextRate = clamp(Number(playbackRate) || 1, 0.25, 4);
      if (Math.abs(nextRate - (Number(clip.playbackRate) || 1)) > 1e-7) {
        clip.playbackRate = nextRate;
        changed = true;
      }
    }
    if (!changed) return false;
    if (state.playback.running || state.playback.loading) {
      const beat = state.playhead.beat;
      stopPlayback(false);
      state.playhead.beat = beat;
      window.setTimeout(() => startPlayback(), 0);
    }
    if (commit) markDirty("오디오 설정 변경");
    else setDirtyWithoutHistory();
    updateAudioSourceInspector();
    renderAudioLane();
    return true;
  }

  function getAudioClipsInDisplayOrder({ visibleOnly = false } = {}) {
    return state.audioClips
      .map((clip, sourceIndex) => ({ clip, sourceIndex }))
      .filter(({ clip }) => !visibleOnly || clip.visible !== false)
      .sort((left, right) => (
        (Number(right.clip.startBeat) || 0) - (Number(left.clip.startBeat) || 0)
        || getAudioClipEndBeat(right.clip) - getAudioClipEndBeat(left.clip)
        || right.sourceIndex - left.sourceIndex
      ));
  }

  function getVisibleAudioClipsInDisplayOrder() {
    return getAudioClipsInDisplayOrder({ visibleOnly: true });
  }

  function updateAudioClipVerticalOrder() {
    if (!elements.audioLaneContent || !elements.audioLaneViewport) return;
    const rowHeight = matchMedia("(pointer: coarse)").matches ? 32 : 27;
    const ordered = getVisibleAudioClipsInDisplayOrder();
    const contentHeight = Math.max(elements.audioLaneViewport.clientHeight || 0, ordered.length * rowHeight + 6);
    elements.audioLaneContent.style.height = `${contentHeight}px`;
    ordered.forEach(({ clip }, rowIndex) => {
      const element = Array.from(elements.audioLaneContent.children).find((item) => String(item.dataset?.audioClipId) === String(clip.id));
      if (!element) return;
      element.style.top = `${3 + rowIndex * rowHeight}px`;
      element.style.height = `${Math.max(20, rowHeight - 5)}px`;
      element.style.zIndex = String(ordered.length - rowIndex);
    });
  }

  function renderAudioLane() {
    if (!elements.audioLaneContent || !elements.audioLaneViewport) return;
    elements.audioLaneContent.replaceChildren();
    updateAudioLaneTransform();
    const totalWidth = getRollWidth();
    elements.audioLaneContent.style.width = `${totalWidth}px`;
    const activeId = String(state.activeAudioClipId || "");
    getVisibleAudioClipsInDisplayOrder().forEach(({ clip, sourceIndex: index }) => {
      const block = document.createElement("div");
      block.className = `audio-clip-block${String(clip.id) === activeId ? " active" : ""}${clip.muted ? " is-muted" : ""}${clip.assetAvailable === false ? " is-missing" : ""}`;
      block.style.setProperty("--audio-clip-color", getAudioClipColor(clip, index));
      block.style.left = `${beatToX(clip.startBeat)}px`;
      block.style.width = `${Math.max(8, getAudioClipEndBeat(clip) * getQuarterWidth() - clip.startBeat * getQuarterWidth())}px`;
      block.dataset.audioClipId = String(clip.id);
      block.title = `${clip.title} · ${clip.startBeat.toFixed(3)} ~ ${getAudioClipEndBeat(clip).toFixed(3)} beat${clip.assetAvailable === false ? " · 음원 다시 불러오기 필요" : ""}`;

      const leftHandle = document.createElement("button");
      leftHandle.type = "button";
      leftHandle.className = "audio-clip-handle audio-clip-left-handle";
      leftHandle.setAttribute("aria-label", `${clip.title} 시작점 조절`);
      const main = document.createElement("div");
      main.className = "audio-clip-main";
      const title = document.createElement("span");
      title.textContent = clip.title;
      const time = document.createElement("small");
      time.textContent = `${Math.round(clamp(Number(clip.volume) || 0, 0, 1) * 100)}% · ${Math.round(clamp(Number(clip.playbackRate) || 1, 0.25, 4) * 100) / 100}×`;
      main.append(title, time);
      const rightHandle = document.createElement("button");
      rightHandle.type = "button";
      rightHandle.className = "audio-clip-handle audio-clip-right-handle";
      rightHandle.setAttribute("aria-label", `${clip.title} 끝점 조절`);
      block.append(leftHandle, main, rightHandle);

      const begin = (event, mode) => {
        if (event.button !== 0) return;
        state.activePanel = "audio";
        state.activeAudioClipId = clip.id;
        clearNoteSelection();
        clearMidiSelection();
        elements.audioLaneContent.querySelectorAll(".audio-clip-block.active").forEach((item) => item.classList.remove("active"));
        block.classList.add("active");
        renderChannelTabs();
        renderChannelEditor();
        const laneRect = elements.audioLaneViewport.getBoundingClientRect();
        const pointerBeat = xToBeat(event.clientX - laneRect.left + elements.rollViewport.scrollLeft);
        state.audioLaneInteraction = {
          pointerId: event.pointerId,
          clip,
          mode,
          originalStartBeat: clip.startBeat,
          originalDurationBeat: clip.durationBeat,
          originalEndBeat: getAudioClipEndBeat(clip),
          pointerBeatOffset: pointerBeat - clip.startBeat,
          moved: false,
          element: block,
        };
        block.classList.add("dragging");
        trySetPointerCapture(block, event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      };
      main.addEventListener("pointerdown", (event) => begin(event, "move"));
      leftHandle.addEventListener("pointerdown", (event) => begin(event, "left"));
      rightHandle.addEventListener("pointerdown", (event) => begin(event, "right"));
      block.addEventListener("pointermove", (event) => {
        const interaction = state.audioLaneInteraction;
        if (!interaction || interaction.pointerId !== event.pointerId || interaction.clip !== clip) return;
        const rect = elements.audioLaneViewport.getBoundingClientRect();
        const edge = 38;
        if (event.clientX > rect.right - edge) elements.rollViewport.scrollLeft += 12;
        else if (event.clientX < rect.left + edge) elements.rollViewport.scrollLeft -= 12;
        const pointerBeat = xToBeat(event.clientX - rect.left + elements.rollViewport.scrollLeft);
        const unit = getSnapBeat();
        if (interaction.mode === "move") {
          const nextStart = Math.max(0, snapBeatToUnit(pointerBeat - interaction.pointerBeatOffset, unit));
          clip.startBeat = nextStart;
          clip.durationBeat = interaction.originalDurationBeat;
        } else if (interaction.mode === "left") {
          const nextStart = clamp(snapBeatToUnit(pointerBeat, unit), 0, interaction.originalEndBeat - CONFIG.minimumNoteBeat);
          clip.startBeat = nextStart;
          clip.durationBeat = Math.max(CONFIG.minimumNoteBeat, interaction.originalEndBeat - nextStart);
        } else {
          const nextEnd = Math.max(interaction.originalStartBeat + CONFIG.minimumNoteBeat, snapBeatToUnit(pointerBeat, unit));
          clip.startBeat = interaction.originalStartBeat;
          clip.durationBeat = Math.max(CONFIG.minimumNoteBeat, nextEnd - interaction.originalStartBeat);
        }
        interaction.moved = true;
        extendTimelineToBeat(getAudioClipEndBeat(clip) + CONFIG.minimumNoteBeat);
        block.style.left = `${beatToX(clip.startBeat)}px`;
        block.style.width = `${Math.max(8, clip.durationBeat * getQuarterWidth())}px`;
        updateAudioLaneTransform();
        updateAudioClipVerticalOrder();
        updateAudioSourceInspector();
        event.preventDefault();
      });
      const finish = (event) => {
        const interaction = state.audioLaneInteraction;
        if (!interaction || interaction.pointerId !== event.pointerId || interaction.clip !== clip) return;
        try { block.releasePointerCapture(event.pointerId); } catch {}
        state.audioLaneInteraction = null;
        block.classList.remove("dragging");
        if (interaction.moved) {
          markDirty(interaction.mode === "move" ? "오디오 이동" : "오디오 길이 변경");
          shrinkTimelineToContent();
        }
        renderAudioLane();
        updateAudioSourceInspector();
      };
      block.addEventListener("pointerup", finish);
      block.addEventListener("pointercancel", finish);
      elements.audioLaneContent.append(block);
    });
    updateAudioClipVerticalOrder();
    elements.audioLaneLabel.textContent = state.audioClips.length ? `오디오 ${state.audioClips.length}` : "오디오";
  }

  function renderChannelMuteMixer() {
    if (!elements.channelMuteList) return;
    elements.channelMuteList.replaceChildren();
    for (const channel of state.channels) {
      const row = document.createElement("label");
      row.className = "channel-mute-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(channel.muted);
      checkbox.addEventListener("change", () => setChannelMutedById(channel.id, checkbox.checked));
      const name = document.createElement("span");
      name.textContent = channel.name;
      row.append(checkbox, name);
      elements.channelMuteList.append(row);
    }
  }

  function closeChannelMuteMixer() {
    if (elements.channelMuteBackdrop) elements.channelMuteBackdrop.hidden = true;
  }

  function renderChannelTabs() {
    if (!elements.channelTabs) return;
    elements.channelTabs.replaceChildren();

    const createAction = ({ kind, active, label, title, onClick }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `channel-tree-action channel-tree-${kind}`;
      button.setAttribute("aria-pressed", String(Boolean(active)));
      button.setAttribute("aria-label", label);
      button.title = title;
      button.textContent = kind === "visibility"
        ? (active ? "👁" : "🙈")
        : (active ? "🔇" : "🔊");
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick?.();
      });
      return button;
    };

    // 모든 음악 채널은 하나의 평면 편집 채널 목록으로 표시합니다.
    // 지원 음악 파일은 불러오는 순간 공통 플러그인에서 MIDI로 정규화한 뒤 일반 편집 채널로 변환하므로 별도 원본 트리를 만들지 않습니다.
    state.channels.forEach((channel, index) => {
      const active = state.activePanel === "notes" && index === state.activeChannel;
      const item = document.createElement("div");
      item.className = `channel-tab-item channel-tree-item channel-tree-channel-item${active ? " active" : ""}${channel.muted ? " is-muted" : ""}${channel.visible === false ? " is-hidden" : ""}`;
      item.style.setProperty("--channel-color", getChannelColor(channel, index));
      item.dataset.channelIndex = String(index);
      item.dataset.channelId = String(channel.id);
      item.dataset.contextArea = "channel-tab";
      item.setAttribute("role", "treeitem");
      item.setAttribute("aria-level", "1");
      item.setAttribute("aria-selected", String(active));

      const main = document.createElement("button");
      main.type = "button";
      main.className = "channel-tree-main channel-tab-main";
      main.title = `${channel.name} · 누르면 선택, 위아래로 드래그하면 순서 변경`;
      const label = document.createElement("span");
      label.className = "channel-tree-label channel-tab-label";
      label.textContent = channel.name;
      main.append(label);

      const actions = document.createElement("div");
      actions.className = "channel-tree-actions";
      actions.append(
        createAction({
          kind: "visibility",
          active: channel.visible !== false,
          label: `${channel.name} ${channel.visible === false ? "표시" : "숨김"}`,
          title: channel.visible === false ? "피아노롤에 표시" : "피아노롤에서 숨기기",
          onClick: () => setChannelVisibleById(channel.id, channel.visible === false),
        }),
        createAction({
          kind: "mute",
          active: channel.muted,
          label: `${channel.name} ${channel.muted ? "음소거 해제" : "음소거"}`,
          title: channel.muted ? "음소거 해제" : "음소거",
          onClick: () => setChannelMutedById(channel.id, !channel.muted),
        }),
      );
      item.append(main, actions);
      item.addEventListener("pointerdown", (event) => beginChannelPointerDrag(event, channel.id, item));
      item.addEventListener("pointermove", moveChannelPointerDrag);
      item.addEventListener("pointerup", endChannelPointerDrag);
      item.addEventListener("pointercancel", () => { cancelChannelPointerDrag(); });
      elements.channelTabs.append(item);
    });

    // 오디오는 불러오기 메뉴만 별도이지만 왼쪽에서는 별도 '원본 자료' 구역 없이 같은 목록에 둡니다.
    getAudioClipsInDisplayOrder().forEach(({ clip, sourceIndex: clipIndex }) => {
      const active = state.activePanel === "audio" && String(state.activeAudioClipId) === String(clip.id);
      const item = document.createElement("div");
      item.className = `channel-tree-item audio-source-item${active ? " active" : ""}${clip.muted ? " is-muted" : ""}${clip.visible === false ? " is-hidden" : ""}`;
      item.style.setProperty("--channel-color", getAudioClipColor(clip, clipIndex));
      item.dataset.audioClipId = String(clip.id);
      item.dataset.contextArea = "audio-source";
      item.setAttribute("role", "treeitem");
      item.setAttribute("aria-level", "1");
      item.setAttribute("aria-selected", String(active));

      const main = document.createElement("button");
      main.type = "button";
      main.className = "channel-tree-main channel-tab-main";
      main.title = clip.fileName || clip.title;
      const label = document.createElement("span");
      label.className = "channel-tree-label channel-tab-label";
      label.textContent = clip.title;
      main.append(label);
      main.addEventListener("click", () => selectAudioClip(clip.id));

      const actions = document.createElement("div");
      actions.className = "channel-tree-actions";
      actions.append(
        createAction({
          kind: "visibility",
          active: clip.visible !== false,
          label: `${clip.title} ${clip.visible === false ? "표시" : "숨김"}`,
          title: clip.visible === false ? "오디오 블록 표시" : "오디오 블록 숨기기",
          onClick: () => setAudioClipVisible(clip.id, clip.visible === false),
        }),
        createAction({
          kind: "mute",
          active: clip.muted,
          label: `${clip.title} ${clip.muted ? "음소거 해제" : "음소거"}`,
          title: clip.muted ? "오디오 음소거 해제" : "오디오 음소거",
          onClick: () => setAudioClipMuted(clip.id, !clip.muted),
        }),
      );
      item.append(main, actions);
      elements.channelTabs.append(item);
    });

    elements.addChannelButton.disabled = false;
    if (elements.deleteChannelsButton) elements.deleteChannelsButton.disabled = state.channels.length <= 1;
    elements.deleteChannelButton.disabled = state.activePanel !== "notes" || state.channels.length <= 1;
    elements.clearChannelButton.disabled = state.activePanel !== "notes";
    elements.copyChannelButton.disabled = state.activePanel !== "notes";
    elements.pasteChannelButton.disabled = state.activePanel !== "notes";
    updateEditMenuState();
  }

  function renderChannelEditor() {
    const midiActive = isMidiReferenceActive() && Boolean(getActiveMidiDocument());
    const audioActive = state.activePanel === "audio" && Boolean(getActiveAudioClip());
    const notesActive = state.activePanel === "notes" && Boolean(getActiveChannel());
    elements.noteChannelView.hidden = !notesActive;
    elements.midiReferenceView.hidden = !midiActive;
    elements.midiReferenceView.setAttribute("aria-hidden", String(!midiActive));
    if (elements.audioSourceView) {
      elements.audioSourceView.hidden = !audioActive;
      elements.audioSourceView.setAttribute("aria-hidden", String(!audioActive));
    }
    elements.rollViewport.classList.toggle("midi-reference-active", midiActive || audioActive);

    if (midiActive) {
      updateMidiReferenceUI();
      return;
    }
    if (audioActive) {
      updateAudioSourceInspector();
      return;
    }
    if (!notesActive) {
      updateEditMenuState();
      return;
    }

    const channel = state.channels[state.activeChannel];
    elements.channelTitle.textContent = channel.name;
    if (elements.channelNameInput.value !== channel.name) {
      elements.channelNameInput.value = channel.name;
    }
    const activeColor = getChannelColor(channel, state.activeChannel);
    elements.channelColorInput.value = activeColor;
    updateChannelColorControl(activeColor);
    if (elements.channelInstrumentSelect) {
      const instrumentName = String(channel.instrument || "Acoustic Grand Piano");
      const matchedProgram = GM_PROGRAM_NAMES.findIndex((name) => name === instrumentName);
      elements.channelInstrumentSelect.value = isDrumInstrumentName(instrumentName) ? "drums" : String(matchedProgram >= 0 ? matchedProgram : 0);
    }
    updateChannelInfo();
  }

  function setMidiReferenceStatus(label, mode = "") {
    elements.midiReferenceStatus.textContent = label;
    if (mode) {
      elements.midiReferenceStatus.dataset.mode = mode;
    } else {
      delete elements.midiReferenceStatus.dataset.mode;
    }
  }

  function getSelectedMidiNotes() {
    const activeGroup = getMidiGroupById();
    if (!activeGroup) return [];
    const selected = [];
    for (const note of activeGroup.notes || []) {
      if (state.midiSelectedNoteKeys.has(midiSelectionKey(activeGroup.id, note.id))) {
        selected.push({ group: activeGroup, note });
      }
    }
    return selected;
  }

  function clearMidiSelection() {
    state.midiSelectedNoteKeys.clear();
  }

  function selectOnlyMidiNote(groupId, noteId) {
    state.midiReference.activeGroupId = groupId;
    clearMidiSelection();
    state.midiSelectedNoteKeys.add(midiSelectionKey(groupId, noteId));
  }

  function selectAllMidiNotes() {
    clearMidiSelection();
    const active = getMidiGroupById();
    if (!active || active.visible === false || getActiveMidiDocument()?.visible === false) {
      drawRoll();
      updateMidiReferenceUI();
      return;
    }
    for (const note of active.notes || []) {
      state.midiSelectedNoteKeys.add(midiSelectionKey(active.id, note.id));
    }
    drawRoll();
    updateMidiReferenceUI();
  }

  function renderMidiInstrumentList() {
    elements.midiInstrumentList?.replaceChildren();
  }

  function updateMidiSelectionUI() {
    const selectedCount = getSelectedMidiNotes().length;
    elements.midiCopySelectedButton.disabled = selectedCount === 0;
    elements.midiInfoSelection.textContent = selectedCount ? `${selectedCount}개 선택` : "없음";
    updateEditMenuState();
  }

  function updateMidiReferenceUI() {
    const reference = state.midiReference;
    const document = getActiveMidiDocument();
    const hasSource = Boolean(document) && reference.groups.length > 0;
    const totalNotes = reference.groups.reduce((sum, group) => sum + group.notes.length, 0);
    const activeGroup = getMidiGroupById();
    const selected = getSelectedMidiNotes();
    const activeGroupIndex = activeGroup ? reference.groups.indexOf(activeGroup) : -1;
    const title = activeGroup
      ? getMidiGroupDisplayName(activeGroup)
      : (document?.title || stripMidiFileExtension(reference.fileName) || "원본 자료");
    const noteCount = activeGroup ? activeGroup.notes.length : totalNotes;
    const endBeat = activeGroup
      ? activeGroup.notes.reduce((maximum, note) => Math.max(maximum, note.startBeat + note.durationBeat), 0)
      : getMidiReferenceEndBeat(reference);
    const durationSeconds = beatToSecondsInTempoMap(endBeat, createTempoTimeMap(reference.tempoEvents || []));

    elements.midiReferenceFileName.textContent = reference.fileName || "";
    elements.midiReferenceMessage.textContent = reference.message || "";
    if (elements.midiReferenceClearButton) {
      elements.midiReferenceClearButton.disabled = !document;
      elements.midiReferenceClearButton.title = activeGroup ? "선택한 원본 악기 채널 삭제" : "선택한 원본 자료 삭제";
      elements.midiReferenceClearButton.setAttribute("aria-label", elements.midiReferenceClearButton.title);
    }
    if (elements.midiTransferButton) {
      const canCopy = Boolean(activeGroup?.notes?.length || (!activeGroup && reference.groups.some((group) => group.notes?.length)));
      elements.midiTransferButton.disabled = !canCopy;
      elements.midiTransferButton.textContent = "채널 복사";
      elements.midiTransferButton.title = activeGroup
        ? "현재 원본 악기를 새 편집 채널로 복사"
        : "복사할 원본 악기를 선택해 새 편집 채널로 복사";
    }
    if (elements.midiSourceInstrumentControl) elements.midiSourceInstrumentControl.hidden = !activeGroup;
    if (elements.midiSourceInstrumentInfo) {
      elements.midiSourceInstrumentInfo.value = activeGroup ? getMidiGroupDisplayName(activeGroup) : "";
      elements.midiSourceInstrumentInfo.title = activeGroup ? getMidiGroupDisplayName(activeGroup) : "원본 루트에는 악기 정보가 없습니다.";
    }
    elements.midiCopyInstrumentButton.disabled = !activeGroup?.notes.length;
    elements.midiCopySelectedButton.disabled = !selected.length;
    elements.midiInfoFormat.textContent = hasSource ? `${reference.sourceLabel || "원본"} · ${reference.format ? `SMF ${reference.format}` : "읽기 전용"}` : "없음";
    elements.midiInfoTrackCount.textContent = String(reference.trackCount || 0);
    elements.midiInfoInstrumentCount.textContent = String(reference.groups.length);
    if (elements.midiInfoTitle) elements.midiInfoTitle.textContent = title;
    if (elements.midiSourceNameInput) {
      elements.midiSourceNameInput.value = title;
      elements.midiSourceNameInput.readOnly = Boolean(activeGroup);
      elements.midiSourceNameInput.title = activeGroup ? "원본 악기 채널 이름은 수정할 수 없습니다." : "원본 자료 제목 수정";
      elements.midiSourceNameInput.setAttribute("aria-readonly", String(Boolean(activeGroup)));
    }
    elements.midiInfoNoteCount.textContent = String(noteCount);
    if (elements.midiInfoLength) elements.midiInfoLength.textContent = formatSeconds(durationSeconds);
    if (selected.length === 1) {
      const note = selected[0].note;
      elements.midiInfoSelection.textContent = `${noteLabel(note.pitch)} / ${note.startBeat.toFixed(3)} beat`;
    } else {
      elements.midiInfoSelection.textContent = selected.length ? `${selected.length}개 선택` : "없음";
    }
    updateSourceColorControl(
      activeGroup ? getMidiGroupColor(activeGroup, activeGroupIndex) : SOURCE_ROOT_COLOR,
      Boolean(activeGroup),
    );
    const tempoCount = reference.tempoEvents?.length || 0;
    setMidiReferenceStatus(
      document
        ? (hasSource ? `${reference.groups.length}악기 · ${totalNotes}노트 · 템포 ${tempoCount}` : "원본 채널 없음")
        : "원본 자료 없음",
      document ? "ready" : "",
    );
    renderMidiInstrumentList();
    updateEditMenuState();
  }

  function setDirtyWithoutHistory() {
    if (!state.history.restoring) {
      const snapshot = captureHistorySnapshot();
      if (state.history.currentEntry) {
        state.history.currentEntry.snapshot = snapshot;
      } else {
        state.history.currentEntry = createHistoryEntry(snapshot, "현재 상태");
      }
      renderHistoryPanel();
    }
    state.dirty = true;
    updateDirtyState();
    scheduleAutosave();
  }

  // MIDI byte decoding and metadata text decoding are provided by plugins/formats/midi/midi-parser.js.

  function evaluateMergedMidiVelocity(velocities) {
    const safe = velocities
      .map((value) => clamp(Math.round(Number(value) || 1), 1, 127))
      .filter(Number.isFinite);
    if (!safe.length) return 100;
    if (safe.length === 1) return safe[0];
    // 같은 노트가 여러 트랙에서 중복된 경우 음압 에너지를 합산하되 MIDI 범위에서 부드럽게 제한합니다.
    const energy = Math.sqrt(safe.reduce((sum, velocity) => sum + velocity * velocity, 0));
    return clamp(Math.round(energy), Math.max(...safe), 127);
  }

  function reevaluateMidiInstrumentVelocities(notes) {
    if (!Array.isArray(notes) || notes.length < 2) return notes || [];
    const sorted = notes.map((note) => clamp(Number(note.velocity) || 100, 1, 127)).sort((a, b) => a - b);
    const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))];
    const low = percentile(0.05);
    const high = percentile(0.95);
    if (high - low < 8) return notes;
    return notes.map((note) => {
      const original = clamp(Number(note.velocity) || 100, 1, 127);
      const ratio = clamp((original - low) / Math.max(1, high - low), 0, 1);
      const normalized = 20 + Math.pow(ratio, 0.92) * 98;
      return { ...note, velocity: clamp(Math.round(original * 0.68 + normalized * 0.32), 1, 127) };
    });
  }

  function mergeMidiInstrumentNotes(rawNotes) {
    const duplicateMap = new Map();
    for (const note of rawNotes) {
      const key = `${note.pitch}:${Number(note.startBeat).toFixed(6)}:${Number(note.durationBeat).toFixed(6)}`;
      let merged = duplicateMap.get(key);
      if (!merged) {
        merged = {
          pitch: note.pitch,
          startBeat: note.startBeat,
          durationBeat: note.durationBeat,
          velocities: [],
        };
        duplicateMap.set(key, merged);
      }
      merged.velocities.push(note.velocity);
    }
    const merged = Array.from(duplicateMap.values())
      .map((note, index) => ({
        id: index + 1,
        pitch: note.pitch,
        startBeat: Number(note.startBeat.toFixed(6)),
        durationBeat: Number(note.durationBeat.toFixed(6)),
        velocity: evaluateMergedMidiVelocity(note.velocities),
      }))
      .sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch || left.durationBeat - right.durationBeat)
      .map((note, index) => ({ ...note, id: index + 1 }));
    return reevaluateMidiInstrumentVelocities(merged).map((note) => ({
      ...note,
      volume: velocityToMmlVolume(note.velocity),
    }));
  }

  function normalizeMidiDocumentInstruments(reference) {
    const source = { ...createDefaultMidiReference(), ...reference };
    source.sourceType = normalizeMidiSourceType(source.sourceType);
    source.sourceLabel = String(source.sourceLabel || defaultMidiSourceLabel(source.sourceType));
    source.quantizeDivision = Number(source.quantizeDivision) === 32 ? 32 : 64;
    source.visible = source.visible !== false;
    const quantizeUnit = 4 / source.quantizeDivision;
    const instrumentMap = new Map();
    for (const [groupIndex, group] of (source.groups || []).entries()) {
      const channels = Array.isArray(group.channels) && group.channels.length
        ? group.channels.map((channel) => clamp(Math.round(Number(channel) || 0), 0, 15))
        : [clamp(Math.round(Number(group.channel) || 0), 0, 15)];
      const drums = channels.includes(9) || String(group.programName || group.name).toLowerCase() === "drums";
      const program = drums ? 0 : clamp(Math.round(Number(group.program) || 0), 0, 127);
      const key = drums ? "drums" : `program-${program}`;
      let merged = instrumentMap.get(key);
      if (!merged) {
        merged = {
          id: `midi-instrument-${drums ? "drums" : program}`,
          name: drums ? "Drums" : (GM_PROGRAM_NAMES[program] || `Program ${program + 1}`),
          programName: drums ? "Drums" : (GM_PROGRAM_NAMES[program] || `Program ${program + 1}`),
          program,
          channel: channels[0] ?? 0,
          channels: new Set(),
          trackIndex: Math.max(0, Number(group.trackIndex) || 0),
          sourceTracks: new Set(),
          visible: group.visible !== false,
          muted: Boolean(group.muted),
          color: getMidiGroupColor(group, groupIndex),
          colorIndex: groupIndex,
          rawNotes: [],
        };
        instrumentMap.set(key, merged);
      } else {
        merged.visible = merged.visible || group.visible !== false;
        merged.muted = merged.muted && Boolean(group.muted);
        merged.trackIndex = Math.min(merged.trackIndex, Math.max(0, Number(group.trackIndex) || 0));
      }
      channels.forEach((channel) => merged.channels.add(channel));
      const tracks = Array.isArray(group.sourceTracks) ? group.sourceTracks : [group.trackName].filter(Boolean);
      tracks.forEach((track) => merged.sourceTracks.add(String(track)));
      for (const note of group.notes || []) {
        merged.rawNotes.push({
          pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat: Number(Math.max(0, snapBeatToUnit(Number(note.startBeat) || 0, quantizeUnit)).toFixed(6)),
          durationBeat: Number(Math.max(quantizeUnit, snapBeatToUnit(Number(note.durationBeat) || quantizeUnit, quantizeUnit)).toFixed(6)),
          velocity: clamp(Math.round(Number(note.velocity) || 100), 1, 127),
        });
      }
    }
    const groups = [...instrumentMap.values()].map((group, index) => {
      const channels = [...group.channels].sort((a, b) => a - b);
      const sourceTracks = [...group.sourceTracks];
      return {
        id: `${group.id}-${index + 1}`,
        name: group.name,
        trackName: sourceTracks.join(", "),
        sourceTracks,
        trackIndex: group.trackIndex,
        channel: channels[0] ?? 0,
        channels,
        program: group.program,
        programName: group.programName,
        visible: group.visible,
        muted: group.muted,
        color: isValidChannelColor(group.color) ? group.color : CHANNEL_COLORS[index % CHANNEL_COLORS.length],
        colorIndex: index,
        notes: mergeMidiInstrumentNotes(group.rawNotes),
      };
    }).filter((group) => group.notes.length)
      .sort((left, right) => left.program - right.program || left.trackIndex - right.trackIndex);
    groups.forEach((group, index) => {
      group.colorIndex = index;
      group.id = `midi-instrument-${group.channels.includes(9) ? "drums" : group.program}-${index + 1}`;
    });
    source.groups = groups;
    source.activeGroupId = groups.some((group) => String(group.id) === String(source.activeGroupId))
      ? source.activeGroupId
      : groups[0]?.id || null;
    source.durationBeats = Number(snapBeatToUnit(Math.max(
      Number(source.durationBeats) || 0,
      ...groups.flatMap((group) => group.notes.map((note) => note.startBeat + note.durationBeat)),
      0,
    ), quantizeUnit, "ceil").toFixed(6));
    return source;
  }

  function parseMidiArrayBuffer(arrayBuffer, fileName = "", options = {}) {
    const quantizeDivision = Number(options.quantizeDivision) === 32 ? 32 : 64;
    const quantizeUnit = 4 / quantizeDivision;
    const sourceType = normalizeMidiSourceType(options.sourceType);
    const sourceLabel = String(options.sourceLabel || defaultMidiSourceLabel(sourceType));
    const parser = window.MabiMidiParser;
    if (!parser?.parse) throw new Error("공용 MIDI 파서를 불러오지 못했습니다.");

    const midi = parser.parse(arrayBuffer, { type2Policy: "all", closeOpenNotes: true });
    if (midi.format > 1) {
      throw new Error("SMF Format 0과 1 MIDI만 지원합니다.");
    }
    if (!midi.trackCount) {
      throw new Error("MIDI 트랙이 없습니다.");
    }
    if (midi.smpteDivision) {
      throw new Error("SMPTE 시간 형식 MIDI는 아직 지원하지 않습니다. PPQN MIDI를 사용하세요.");
    }

    const division = Math.max(1, Number(midi.ppq) || 480);
    const rawNotes = (midi.notes || []).map((note) => {
      const rawStartBeat = Math.max(0, Number(note.startTick) || 0) / division;
      const rawEndBeat = Math.max((Number(note.startTick) || 0) + 1, Number(note.endTick) || 0) / division;
      const startBeat = Math.max(0, snapBeatToUnit(rawStartBeat, quantizeUnit));
      const endBeat = Math.max(startBeat + quantizeUnit, snapBeatToUnit(rawEndBeat, quantizeUnit));
      const trackIndex = Math.max(0, Number(note.trackIndex) || 0);
      const trackName = String(note.trackName || note.instrumentMetaName || `Track ${trackIndex + 1}`);
      const channel = clamp(Math.round(Number(note.channel) || 0), 0, 15);
      const program = channel === 9 ? 0 : clamp(Math.round(Number(note.program) || 0), 0, 127);
      return {
        trackIndex,
        trackName,
        instrumentName: String(note.instrumentMetaName || ""),
        channel,
        program,
        pitch: clamp(Math.round(Number(note.midi ?? note.pitch) || 60), 0, 127),
        startBeat: Number(startBeat.toFixed(6)),
        durationBeat: Number((endBeat - startBeat).toFixed(6)),
        velocity: clamp(Math.round(Number(note.velocity) || 100), 1, 127),
      };
    });

    if (!rawNotes.length) {
      throw new Error("MIDI 파일에서 노트 이벤트를 찾지 못했습니다.");
    }

    const instruments = new Map();
    for (const note of rawNotes) {
      const isDrums = note.channel === 9;
      const key = isDrums ? "drums" : `program-${note.program}`;
      let instrument = instruments.get(key);
      if (!instrument) {
        const programName = isDrums ? "Drums" : (GM_PROGRAM_NAMES[note.program] || `Program ${note.program + 1}`);
        instrument = {
          key,
          id: `midi-instrument-${isDrums ? "drums" : note.program}`,
          name: programName,
          trackName: "",
          trackIndex: note.trackIndex,
          channel: note.channel,
          channels: new Set(),
          sourceTracks: new Set(),
          program: isDrums ? 0 : note.program,
          programName,
          visible: true,
          muted: false,
          colorIndex: instruments.size,
          rawNotes: [],
        };
        instruments.set(key, instrument);
      }
      instrument.trackIndex = Math.min(instrument.trackIndex, note.trackIndex);
      instrument.channels.add(note.channel);
      instrument.sourceTracks.add(note.trackName || `Track ${note.trackIndex + 1}`);
      instrument.rawNotes.push(note);
    }

    let mergedDuplicateCount = 0;
    const groups = Array.from(instruments.values())
      .map((instrument, index) => {
        const notes = mergeMidiInstrumentNotes(instrument.rawNotes);
        mergedDuplicateCount += instrument.rawNotes.length - notes.length;
        const sourceTracks = Array.from(instrument.sourceTracks);
        const channels = Array.from(instrument.channels).sort((left, right) => left - right);
        return {
          id: `${instrument.id}-${index + 1}`,
          name: instrument.programName,
          trackName: sourceTracks.join(", "),
          sourceTracks,
          trackIndex: instrument.trackIndex,
          channel: channels[0] ?? 0,
          channels,
          program: instrument.program,
          programName: instrument.programName,
          visible: true,
          muted: false,
          colorIndex: index,
          notes,
        };
      })
      .filter((group) => group.notes.length)
      .sort((left, right) => left.program - right.program || left.trackIndex - right.trackIndex);

    groups.forEach((group, index) => {
      group.colorIndex = index;
      group.id = `midi-instrument-${group.channel === 9 ? "drums" : group.program}-${index + 1}`;
    });

    const durationBeats = Math.max(
      (Number(midi.durationTicks) || 0) / division,
      ...groups.flatMap((group) => group.notes.map((note) => note.startBeat + note.durationBeat)),
      0,
    );
    const tempoByBeat = new Map();
    const parsedTempos = parser.normalizeTempoEvents?.(midi.tempoEvents) || midi.tempoEvents || [];
    for (const tempo of parsedTempos) {
      const beat = Number(Math.max(0, snapBeatToUnit((Number(tempo.tick) || 0) / division, quantizeUnit)).toFixed(6));
      const bpm = clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo);
      tempoByBeat.set(beat, bpm);
    }
    if (!tempoByBeat.has(0)) tempoByBeat.set(0, 120);
    const normalizedTempoEvents = Array.from(tempoByBeat, ([beat, bpm]) => ({ beat, bpm }))
      .sort((left, right) => left.beat - right.beat)
      .map((tempo, index) => ({ id: index + 1, ...tempo, fixed: index === 0 && Math.abs(tempo.beat) < 1e-7 }));
    const totalNotes = groups.reduce((sum, group) => sum + group.notes.length, 0);
    return {
      id: null,
      title: stripMidiFileExtension(fileName),
      fileName,
      sourceType,
      sourceLabel,
      quantizeDivision,
      format: midi.format,
      division,
      trackCount: midi.trackCount,
      durationBeats: Number(snapBeatToUnit(durationBeats, quantizeUnit, "ceil").toFixed(6)),
      tempoEvents: normalizedTempoEvents,
      visible: true,
      muted: false,
      groups,
      activeGroupId: groups[0]?.id || null,
      message: `${groups.length}개 악기 채널과 ${totalNotes}개 노트를 1/${quantizeDivision} 음표 단위로 읽었습니다.${mergedDuplicateCount ? ` 중복 노트 ${mergedDuplicateCount}개를 병합했습니다.` : ""}`,
      parserWarnings: [...(midi.warnings || [])],
      containerMetadata: { ...(midi.metadata || {}) },
    };
  }

  function getImportSourceInfo(file) {
    const name = String(file?.name || "Music");
    const format = window.MabiMusicFormats?.findFormat(name, file?.type || "");
    return {
      fileName: name,
      sourceType: format?.id || "midi",
      sourceLabel: format?.label || "MIDI",
    };
  }

  function toStandaloneArrayBuffer(bytes) {
    if (bytes instanceof ArrayBuffer) return bytes.slice(0);
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }

  async function convertImportFileToMidiBuffer(file) {
    if (!window.MabiMusicFormats?.convertFile) throw new Error("음악 포맷 플러그인을 불러오지 못했습니다.");
    const converted = await window.MabiMusicFormats.convertFile(file);
    return {
      fileName: String(file.name || "Music"),
      sourceType: converted.sourceType,
      sourceLabel: converted.sourceLabel,
      midiBuffer: toStandaloneArrayBuffer(converted.midiBytes),
    };
  }

  function setMidiImportStatus(message, { error = false } = {}) {
    if (!elements.midiImportStatus) return;
    elements.midiImportStatus.textContent = String(message || "");
    elements.midiImportStatus.classList.toggle("error", Boolean(error));
  }

  function getUnifiedTextFormatLabel(format = state.midiImport.textFormat) {
    if (format === "3mle") return "3MLE";
    if (format === "mmi") return "MMI";
    return "MML";
  }

  function stopMidiImportPreview({ update = true } = {}) {
    window.clearTimeout(state.midiImport.previewStopTimer);
    state.midiImport.previewStopTimer = 0;
    if (state.midiImport.previewingKey) {
      audioEngine.stopAll();
      state.midiImport.previewingKey = "";
    }
    if (update && elements.midiImportBackdrop && !elements.midiImportBackdrop.hidden) {
      updateMidiImportDialog();
    }
  }

  function resetMidiImportState() {
    stopMidiImportPreview({ update: false });
    state.midiImport.fileName = "";
    state.midiImport.sourceType = "midi";
    state.midiImport.sourceLabel = "MIDI";
    state.midiImport.kind = "midi";
    state.midiImport.midiBuffer = null;
    state.midiImport.preview = null;
    state.midiImport.text = "";
    state.midiImport.textFormat = "";
    state.midiImport.textCandidates = [];
    state.midiImport.textParsed = null;
    state.midiImport.selectedGroupIds = new Set();
    state.midiImport.selectedTextIndexes = new Set();
    state.midiImport.busy = false;
    if (elements.midiImportIgnoreSingle64thOverlap) {
      elements.midiImportIgnoreSingle64thOverlap.checked = true;
    }
  }

  function getMidiImportSelectedGroups(preview = state.midiImport.preview) {
    if (!preview?.groups?.length) return [];
    const selected = state.midiImport.selectedGroupIds;
    return preview.groups.filter((group) => selected.has(String(group.id)));
  }

  function getMidiImportSelectedTextCandidates() {
    return (state.midiImport.textCandidates || []).filter((_, index) => state.midiImport.selectedTextIndexes.has(index));
  }

  function getCurrentUnifiedTextParsed() {
    if (state.midiImport.kind !== "text") return null;
    const format = state.midiImport.textFormat;
    if (format === "3mle" || format === "mmi") {
      const selected = getMidiImportSelectedTextCandidates();
      if (!selected.length) return null;
      return parseMmlCandidateParts(selected, 64);
    }
    return state.midiImport.textParsed;
  }

  function updateMidiImportSummary() {
    if (!elements.midiImportSummary) return;
    const entries = [];
    if (state.midiImport.kind === "midi") {
      const preview = state.midiImport.preview;
      if (preview) {
        const noteCount = preview.groups.reduce((sum, group) => sum + (group.notes?.length || 0), 0);
        const tempoCount = preview.tempoEvents?.length || 0;
        const durationSeconds = beatToSecondsInTempoMap(preview.durationBeats, createTempoTimeMap(preview.tempoEvents || []));
        entries.push(`악기 ${preview.groups.length}개`, `노트 ${noteCount}개`, `템포 ${tempoCount}개`, `길이 ${formatSeconds(durationSeconds)}`);
      }
    } else {
      const format = state.midiImport.textFormat;
      const parsed = getCurrentUnifiedTextParsed();
      if (format === "3mle" || format === "mmi") {
        entries.push(
          `채널 ${state.midiImport.textCandidates.length}개`,
          `선택 ${state.midiImport.selectedTextIndexes.size}개`,
          `노트 ${parsed?.noteCount || 0}개`,
        );
      } else if (parsed) {
        entries.push(`음성 ${parsed.noteParts?.length || 0}개`, `노트 ${parsed.noteCount || 0}개`, `템포 ${parsed.explicitTempoCount || 0}개`);
      }
    }
    const fragment = document.createDocumentFragment();
    entries.forEach((text) => {
      const item = document.createElement("span");
      item.textContent = text;
      fragment.append(item);
    });
    elements.midiImportSummary.replaceChildren(fragment);
  }

  function renderMidiImportSelectionList() {
    if (!elements.midiImportSelectionList) return;
    elements.midiImportSelectionList.replaceChildren();
    const isMidi = state.midiImport.kind === "midi";
    const isSelectableText = state.midiImport.kind === "text" && ["3mle", "mmi"].includes(state.midiImport.textFormat);
    const selectable = isMidi || isSelectableText;
    if (elements.midiImportSelectionActions) elements.midiImportSelectionActions.hidden = !isMidi;
    if (elements.midiImportTextSelectionActions) elements.midiImportTextSelectionActions.hidden = !isSelectableText;
    elements.midiImportSelectionList.hidden = !selectable;
    if (!selectable) return;

    if (isMidi) {
      const groups = state.midiImport.preview?.groups || [];
      groups.forEach((group, index) => {
        const row = document.createElement("div");
        row.className = "midi-import-selection-row";
        row.style.setProperty("--channel-color", getMidiGroupColor(group, index));
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.midiImport.selectedGroupIds.has(String(group.id));
        checkbox.setAttribute("aria-label", `${getMidiGroupDisplayName(group)} 가져오기`);
        const info = document.createElement("div");
        info.className = "midi-import-selection-info";
        const title = document.createElement("strong");
        title.textContent = getMidiGroupDisplayName(group, `악기 ${index + 1}`);
        const meta = document.createElement("small");
        meta.textContent = `${group.notes?.length || 0}노트${group.trackName ? ` · ${group.trackName}` : ""}`;
        info.append(title, meta);
        const previewButton = document.createElement("button");
        previewButton.type = "button";
        const previewKey = `group:${group.id}`;
        previewButton.className = "midi-import-row-preview";
        previewButton.textContent = state.midiImport.previewingKey === previewKey ? "■ 정지" : "▶ 듣기";
        previewButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          previewMidiImportGroups([String(group.id)], previewKey);
        });
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) state.midiImport.selectedGroupIds.add(String(group.id));
          else state.midiImport.selectedGroupIds.delete(String(group.id));
          updateMidiImportDialog();
        });
        row.append(checkbox, info, previewButton);
        elements.midiImportSelectionList.append(row);
      });
      return;
    }

    state.midiImport.textCandidates.forEach((candidate, index) => {
      const row = document.createElement("label");
      row.className = "midi-import-selection-row text-import-selection-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.midiImport.selectedTextIndexes.has(index);
      checkbox.setAttribute("aria-label", `${candidate.label} 가져오기`);
      const info = document.createElement("div");
      info.className = "midi-import-selection-info";
      const title = document.createElement("strong");
      title.textContent = candidate.label;
      const meta = document.createElement("small");
      meta.textContent = `${candidate.value?.length || 0}자`;
      info.append(title, meta);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.midiImport.selectedTextIndexes.add(index);
        else state.midiImport.selectedTextIndexes.delete(index);
        updateMidiImportDialog();
      });
      row.append(checkbox, info);
      elements.midiImportSelectionList.append(row);
    });
  }

  function updateMidiImportDialog() {
    const isMidi = state.midiImport.kind === "midi";
    const isText = state.midiImport.kind === "text";
    const textFormat = getUnifiedTextFormatLabel();
    const midiReady = isMidi && Boolean(state.midiImport.midiBuffer && state.midiImport.preview && !state.midiImport.busy);
    const textParsed = isText ? getCurrentUnifiedTextParsed() : null;
    const textReady = isText && Boolean(textParsed?.noteCount) && !state.midiImport.busy;
    const ready = midiReady ? getMidiImportSelectedGroups().length > 0 : textReady;

    if (elements.midiImportTitle) {
      elements.midiImportTitle.textContent = isMidi
        ? `${state.midiImport.sourceLabel || "MIDI"} 불러오기`
        : `${textFormat} 불러오기`;
    }
    if (elements.midiImportSourceLabel) elements.midiImportSourceLabel.textContent = state.midiImport.fileName || "파일을 선택하세요.";
    if (elements.midiImportMidiControls) elements.midiImportMidiControls.hidden = !isMidi;
    if (elements.midiImportApplyButton) elements.midiImportApplyButton.disabled = !ready;
    if (elements.midiImportNewButton) elements.midiImportNewButton.disabled = !ready;
    if (elements.midiImportPreviewSelectedButton) {
      const selectedReady = midiReady && getMidiImportSelectedGroups().length > 0;
      elements.midiImportPreviewSelectedButton.disabled = !selectedReady;
      elements.midiImportPreviewSelectedButton.textContent = state.midiImport.previewingKey === "selected" ? "■ 선택 정지" : "▶ 선택 듣기";
    }
    if (elements.midiImportPreviewAllButton) {
      elements.midiImportPreviewAllButton.disabled = !midiReady;
      elements.midiImportPreviewAllButton.textContent = state.midiImport.previewingKey === "all" ? "■ 원본 정지" : "▶ 원본 듣기";
    }
    updateMidiImportSummary();
    renderMidiImportSelectionList();

    if (state.midiImport.busy) return;
    if (isMidi && state.midiImport.preview) {
      const selected = getMidiImportSelectedGroups().length;
      const division = Number(elements.midiImportQuantize?.value) === 32 ? 32 : 64;
      const overlapLabel = elements.midiImportIgnoreSingle64thOverlap?.checked !== false ? " · 1/64 겹침 무시" : "";
      setMidiImportStatus(`${selected}/${state.midiImport.preview.groups.length}개 악기 선택 · ${division}박 양자화${overlapLabel}`);
    } else if (isText && ["3mle", "mmi"].includes(state.midiImport.textFormat)) {
      setMidiImportStatus(`${state.midiImport.selectedTextIndexes.size}/${state.midiImport.textCandidates.length}개 채널 선택 · 선택한 채널만 편집 영역에 가져옵니다.`);
    } else if (isText && textParsed) {
      setMidiImportStatus(`${textParsed.noteParts?.length || 0}개 음성 · ${textParsed.noteCount || 0}개 노트를 편집 영역에 가져옵니다.`);
    }
  }

  function openMidiImportDialog() {
    closeFileMenu();
    closeEditMenu();
    closeContextMenu();
    closeThemeMenu();
    closeVolumeMenu();
    closeZoomMenu();
    closePlaybackRateMenu();
    if (elements.midiImportBackdrop) elements.midiImportBackdrop.hidden = false;
    updateMidiImportDialog();
  }

  function closeMidiImportDialog({ reset = true } = {}) {
    stopMidiImportPreview({ update: false });
    if (elements.midiImportBackdrop) elements.midiImportBackdrop.hidden = true;
    if (reset && !state.midiImport.busy) {
      resetMidiImportState();
      updateMidiImportSummary();
      if (elements.midiImportSelectionList) elements.midiImportSelectionList.replaceChildren();
    }
  }

  function reparseMidiImportPreview() {
    if (!state.midiImport.midiBuffer || state.midiImport.kind !== "midi") return null;
    stopMidiImportPreview({ update: false });
    const selectedBefore = new Set(state.midiImport.selectedGroupIds);
    const quantizeDivision = Number(elements.midiImportQuantize?.value) === 32 ? 32 : 64;
    const parsed = parseMidiArrayBuffer(state.midiImport.midiBuffer, state.midiImport.fileName, {
      quantizeDivision,
      sourceType: state.midiImport.sourceType,
      sourceLabel: state.midiImport.sourceLabel,
    });
    state.midiImport.preview = parsed;
    const available = new Set(parsed.groups.map((group) => String(group.id)));
    state.midiImport.selectedGroupIds = selectedBefore.size
      ? new Set([...selectedBefore].filter((id) => available.has(id)))
      : new Set(parsed.groups.map((group) => String(group.id)));
    if (!state.midiImport.selectedGroupIds.size && parsed.groups.length) {
      state.midiImport.selectedGroupIds = new Set(parsed.groups.map((group) => String(group.id)));
    }
    updateMidiImportDialog();
    return parsed;
  }

  async function prepareMidiImportFile(file) {
    if (!file || state.midiImport.busy) return false;
    resetMidiImportState();
    const source = getImportSourceInfo(file);
    state.midiImport.busy = true;
    state.midiImport.kind = "midi";
    state.midiImport.fileName = source.fileName;
    state.midiImport.sourceType = source.sourceType;
    state.midiImport.sourceLabel = source.sourceLabel;
    if (elements.midiImportQuantize) elements.midiImportQuantize.value = "64";
    openMidiImportDialog();
    setMidiImportStatus(`${source.sourceLabel} 파일을 분석하고 있습니다.`);
    try {
      const converted = await convertImportFileToMidiBuffer(file);
      state.midiImport.fileName = converted.fileName;
      state.midiImport.sourceType = converted.sourceType;
      state.midiImport.sourceLabel = converted.sourceLabel;
      state.midiImport.midiBuffer = converted.midiBuffer;
      const preview = parseMidiArrayBuffer(converted.midiBuffer, converted.fileName, {
        quantizeDivision: 64,
        sourceType: converted.sourceType,
        sourceLabel: converted.sourceLabel,
      });
      state.midiImport.preview = preview;
      state.midiImport.selectedGroupIds = new Set(preview.groups.map((group) => String(group.id)));
      state.midiImport.busy = false;
      updateMidiImportDialog();
      return true;
    } catch (error) {
      state.midiImport.busy = false;
      state.midiImport.midiBuffer = null;
      state.midiImport.preview = null;
      const message = error instanceof Error ? error.message : `${source.sourceLabel} 파일을 읽지 못했습니다.`;
      setMidiImportStatus(message, { error: true });
      updateMidiImportDialog();
      console.error(error);
      return false;
    }
  }

  function detectCompatibleTextFormat(fileName, text) {
    const extension = (String(fileName || "").match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
    if (extension === "mmi") return "mmi";
    if (extension === "3mle" || (!/^\s*MML\s*@/i.test(text) && /^\s*\[Channel\s*\d+\]\s*$/im.test(text))) return "3mle";
    return "mml";
  }

  async function prepareCompatibleTextImportFile(file) {
    if (!file || state.midiImport.busy) return false;
    resetMidiImportState();
    state.midiImport.busy = true;
    state.midiImport.kind = "text";
    state.midiImport.fileName = file.name || "호환 파일";
    openMidiImportDialog();
    setMidiImportStatus("호환 파일을 분석하고 있습니다.");
    try {
      const text = decodeTextFileBytes(await file.arrayBuffer()).replace(/^\uFEFF/, "");
      const format = detectCompatibleTextFormat(file.name, text);
      state.midiImport.text = text;
      state.midiImport.textFormat = format;
      state.midiImport.textCandidates = [];
      state.midiImport.selectedTextIndexes = new Set();
      if (format === "3mle" || format === "mmi") {
        const candidates = format === "mmi"
          ? extractMabiIccoMmlPartCandidates(text)
          : extractThreeMleMmlPartCandidates(text);
        if (!candidates.length) throw new Error(`${format === "mmi" ? "MMI" : "3MLE"} 파일에서 연주 가능한 채널을 찾지 못했습니다.`);
        state.midiImport.textCandidates = candidates;
        state.midiImport.selectedTextIndexes = new Set(candidates.map((_, index) => index));
        state.midiImport.textParsed = parseMmlCandidateParts(candidates, 64);
      } else {
        state.midiImport.textParsed = parseMmlText(text, { quantize: 64 });
        if (!state.midiImport.textParsed?.noteCount) throw new Error("MML 파일에서 연주 가능한 노트를 찾지 못했습니다.");
      }
      state.midiImport.busy = false;
      updateMidiImportDialog();
      return true;
    } catch (error) {
      state.midiImport.busy = false;
      state.midiImport.textParsed = null;
      setMidiImportStatus(error instanceof Error ? error.message : "호환 파일을 읽지 못했습니다.", { error: true });
      updateMidiImportDialog();
      console.error(error);
      return false;
    }
  }

  async function previewMidiImportGroups(groupIds = null, previewKey = "all") {
    if (state.midiImport.kind !== "midi" || !state.midiImport.preview || state.midiImport.busy) return false;
    if (state.midiImport.previewingKey === previewKey) {
      stopMidiImportPreview();
      return true;
    }
    stopMidiImportPreview({ update: false });
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    try {
      audioEngine.ensureContext();
      await audioEngine.resume();
      await audioEngine.ensureReady();
      const preview = state.midiImport.preview;
      const wanted = groupIds ? new Set(groupIds.map(String)) : null;
      const groups = (preview.groups || []).filter((group) => !wanted || wanted.has(String(group.id)));
      const tempoMap = createTempoTimeMap(preview.tempoEvents || []);
      const notes = [];
      groups.forEach((group) => {
        (group.notes || []).forEach((note) => {
          const startBeat = Math.max(0, Number(note.startBeat) || 0);
          const endBeat = startBeat + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
          notes.push({
            pitch: note.pitch,
            velocity: getNotePlaybackVelocity(note),
            startSeconds: beatToSecondsInTempoMap(startBeat, tempoMap),
            endSeconds: beatToSecondsInTempoMap(endBeat, tempoMap),
            program: clamp(Number(group.program) || 0, 0, 127),
            bank: isMidiGroupDrums(group) ? 128 : 0,
          });
        });
      });
      notes.sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);
      if (!notes.length) {
        showToast("미리 들을 노트가 없습니다.");
        return false;
      }
      const firstSeconds = notes[0].startSeconds;
      const previewLength = 8;
      const lastSeconds = firstSeconds + previewLength;
      const context = audioEngine.context;
      const startAt = context.currentTime + 0.05;
      const gainScale = computePlaybackAutoGainScale(notes, {
        windowStart: firstSeconds,
        windowEnd: lastSeconds,
      });
      let scheduled = 0;
      for (const note of notes) {
        if (note.startSeconds > lastSeconds) break;
        if (note.endSeconds <= firstSeconds || note.velocity <= 0) continue;
        const offset = Math.max(0, note.startSeconds - firstSeconds);
        const duration = Math.min(previewLength - offset, Math.max(0.03, note.endSeconds - Math.max(firstSeconds, note.startSeconds)));
        if (duration <= 0.01) continue;
        audioEngine.playNote(note.pitch, note.velocity, startAt + offset, duration, {
          program: note.program,
          bank: note.bank,
          gainScale,
        });
        scheduled += 1;
        if (scheduled >= 360) break;
      }
      state.midiImport.previewingKey = previewKey;
      state.midiImport.previewStopTimer = window.setTimeout(() => stopMidiImportPreview(), Math.round((previewLength + 0.15) * 1000));
      updateMidiImportDialog();
      return true;
    } catch (error) {
      console.error(error);
      stopMidiImportPreview();
      showToast("원본 미리듣기를 시작하지 못했습니다.");
      return false;
    }
  }

  function addMidiDocument(parsed, fileName = parsed.fileName) {
    parsed.id = `midi-doc-${state.nextMidiDocumentId++}`;
    parsed.title = makeUniqueMidiTitle(fileName || parsed.title);
    state.collapsedMidiDocumentIds.delete(String(parsed.id));
    buildMidiPlaybackCache(parsed);
    state.midiDocuments.push(parsed);
    return parsed;
  }

  function cloneMidiImportSelection() {
    const preview = state.midiImport.preview;
    if (!preview) return null;
    const selectedIds = state.midiImport.selectedGroupIds;
    const groups = (preview.groups || [])
      .filter((group) => selectedIds.has(String(group.id)))
      .map((group) => ({ ...group, notes: (group.notes || []).map((note) => ({ ...note })) }));
    if (!groups.length) return null;
    const durationBeats = Math.max(
      0,
      ...groups.flatMap((group) => group.notes.map((note) => Number(note.startBeat) + Number(note.durationBeat))),
    );
    return {
      ...preview,
      id: null,
      groups,
      activeGroupId: groups[0]?.id || null,
      durationBeats: Number(durationBeats.toFixed(6)),
      tempoEvents: (preview.tempoEvents || []).map((tempo) => ({ ...tempo })),
      playbackCache: null,
    };
  }

  function getIgnorableEditorOverlapPlan(voice, note) {
    if (!voice?.notes?.length) return null;
    const previous = voice.notes[voice.notes.length - 1];
    const previousStart = Number(previous.startBeat) || 0;
    const previousEnd = previousStart + Math.max(CONFIG.minimumNoteBeat, Number(previous.durationBeat) || CONFIG.minimumNoteBeat);
    const nextStart = Number(note.startBeat) || 0;
    const plan = getIgnorableSequentialOverlapTrim(
      previousStart,
      previousEnd,
      nextStart,
      CONFIG.minimumNoteBeat,
      CONFIG.minimumNoteBeat,
    );
    return plan ? { previous, durationBeat: plan.trimmedDuration } : null;
  }

  function applyIgnorableEditorOverlapPlan(plan) {
    if (!plan?.previous) return;
    plan.previous.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, plan.durationBeat).toFixed(6));
  }

  function splitNotesIntoMonophonicVoices(notes, { ignoreSingle64thOverlap = true } = {}) {
    const sorted = (notes || []).map((note) => ({ ...note })).sort((left, right) => (
      left.startBeat - right.startBeat
      || left.pitch - right.pitch
      || left.durationBeat - right.durationBeat
    ));
    const voices = [];
    for (const note of sorted) {
      const start = Number(note.startBeat) || 0;
      let bestIndex = -1;
      let bestDistance = Infinity;
      let bestOverlapPlan = null;
      for (let index = 0; index < voices.length; index += 1) {
        const voice = voices[index];
        let overlapPlan = null;
        if (voice.endBeat > start + 1e-7) {
          overlapPlan = ignoreSingle64thOverlap ? getIgnorableEditorOverlapPlan(voice, note) : null;
          if (!overlapPlan) continue;
        }
        const distance = voice.lastPitch == null ? 0 : Math.abs(voice.lastPitch - note.pitch);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
          bestOverlapPlan = overlapPlan;
        }
      }
      if (bestIndex < 0) {
        bestIndex = voices.length;
        voices.push({ notes: [], endBeat: 0, lastPitch: null });
        bestOverlapPlan = null;
      }
      const voice = voices[bestIndex];
      // One 64th-note-or-smaller overlap is treated as a quantization boundary error,
      // so the pair stays in the same monophonic voice instead of creating a new one.
      applyIgnorableEditorOverlapPlan(bestOverlapPlan);
      const resolvedStart = Number(note.startBeat) || 0;
      voice.notes.push(note);
      voice.endBeat = resolvedStart + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      voice.lastPitch = note.pitch;
    }
    return voices.map((voice) => voice.notes);
  }

  function overwriteEditorChannelsFromMidiDocument(parsed) {
    const descriptors = [];
    for (const group of parsed.groups || []) {
      const voices = splitNotesIntoMonophonicVoices(group.notes || []);
      voices.forEach((notes, voiceIndex) => {
        descriptors.push({
          name: voices.length > 1 ? `${group.name} ${voiceIndex + 1}` : group.name,
          notes,
        });
      });
    }
    if (!descriptors.length) return { channelCount: 0, noteCount: 0 };

    const startIndex = clamp(state.activeChannel, 0, Math.max(0, state.channels.length - 1));
    const untouchedNames = new Set(
      state.channels
        .filter((_, index) => index < startIndex || index >= startIndex + descriptors.length)
        .map((channel) => String(channel.name || "").trim().toLocaleLowerCase()),
    );
    const importedIds = [];
    let noteCount = 0;
    descriptors.forEach((descriptor, descriptorIndex) => {
      const targetIndex = startIndex + descriptorIndex;
      let channel = state.channels[targetIndex];
      if (!channel) {
        const id = nextChannelId();
        channel = createDefaultChannel(id, targetIndex);
        state.channels.push(channel);
      }
      const baseName = `${stripMidiFileExtension(parsed.fileName || parsed.title)} · ${descriptor.name}`;
      channel.name = makeUniqueChannelName(baseName, channel.id, untouchedNames);
      untouchedNames.add(channel.name.toLocaleLowerCase());
      channel.notes = descriptor.notes.map((note) => {
        const dynamics = normalizeNoteDynamics(note);
        noteCount += 1;
        return {
          id: state.nextNoteId++,
          pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat: Number(Math.max(0, Number(note.startBeat) || 0).toFixed(6)),
          durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat).toFixed(6)),
          velocity: dynamics.velocity,
          volume: dynamics.volume,
        };
      });
      channel.visible = true;
      state.channelNoteRuntime.delete(String(channel.id));
      importedIds.push(channel.id);
    });

    state.tempos = (parsed.tempoEvents || []).map((tempo, index) => ({
      id: index + 1,
      beat: Number(Math.max(0, Number(tempo.beat) || 0).toFixed(6)),
      bpm: clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
      fixed: index === 0,
    }));
    if (!state.tempos.length || Math.abs(state.tempos[0].beat) > 1e-7) {
      state.tempos.unshift({ id: 1, beat: 0, bpm: 120, fixed: true });
    }
    state.tempos.forEach((tempo, index) => {
      tempo.id = index + 1;
      tempo.fixed = index === 0;
      if (index === 0) tempo.beat = 0;
    });
    state.nextTempoId = state.tempos.length + 1;
    state.activeChannel = Math.max(0, state.channels.findIndex((channel) => channel.id === importedIds[0]));
    state.activePanel = "notes";
    clearNoteSelection();
    clearMidiSelection();
    state.channelNoteRuntime.clear();
    return { channelCount: descriptors.length, noteCount };
  }

  function importMidiSelectionAsEditableChannels(parsed, {
    openNew = false,
    fileName = parsed?.fileName || "",
    ignoreSingle64thOverlap = true,
  } = {}) {
    const groups = (parsed?.groups || []).filter((group) => Array.isArray(group?.notes) && group.notes.length);
    if (!groups.length) return { channelCount: 0, instrumentCount: 0, noteCount: 0 };

    const sourceTitle = stripMidiFileExtension(fileName || parsed?.fileName || parsed?.title || "불러온 파일") || "불러온 파일";
    if (openNew) {
      resetProject({ notify: false });
      state.channels = [];
      state.activeChannel = 0;
      state.projectName = sourceTitle;
    }

    const documentLike = { title: sourceTitle, groups };
    const colorByInstrument = new Map();
    const createdChannels = [];
    let noteCount = 0;

    groups.forEach((group, groupIndex) => {
      const instrumentKey = isMidiGroupDrums(group)
        ? "drums"
        : `program-${clamp(Math.round(Number(group?.program) || 0), 0, 127)}`;
      if (!colorByInstrument.has(instrumentKey)) {
        colorByInstrument.set(instrumentKey, getMidiGroupColor(group, groupIndex));
      }
      const copyColor = colorByInstrument.get(instrumentKey);
      const voices = splitNotesIntoMonophonicVoices(group.notes || [], { ignoreSingle64thOverlap });
      voices.forEach((voiceNotes, voiceIndex) => {
        if (!voiceNotes.length) return;
        const channel = makeEditorChannelFromMidiVoice(group, voiceNotes, {
          document: documentLike,
          voiceIndex,
          voiceCount: voices.length,
          copyColor,
        });
        state.channels.push(channel);
        state.channelNoteRuntime.delete(String(channel.id));
        createdChannels.push(channel);
        noteCount += channel.notes.length;
      });
    });

    if (!state.channels.length) state.channels = createDefaultChannels(1);

    // 새로 열기는 파일 템포 맵을 사용하고, 추가는 현재 프로젝트 템포를 그대로 유지합니다.
    if (openNew) {
      state.tempos = (parsed.tempoEvents || []).map((tempo, index) => ({
        id: index + 1,
        beat: Number(Math.max(0, Number(tempo.beat) || 0).toFixed(6)),
        bpm: clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
        fixed: index === 0,
      }));
      if (!state.tempos.length || Math.abs(state.tempos[0].beat) > 1e-7) {
        state.tempos.unshift({ id: 1, beat: 0, bpm: 120, fixed: true });
      }
      state.tempos.forEach((tempo, index) => {
        tempo.id = index + 1;
        tempo.fixed = index === 0;
        if (index === 0) tempo.beat = 0;
      });
      state.nextTempoId = state.tempos.length + 1;
    }

    state.activePanel = "notes";
    state.activeMidiDocumentId = null;
    setActiveMidiReference(null);
    state.activeAudioClipId = null;
    const firstId = createdChannels[0]?.id;
    const firstIndex = state.channels.findIndex((channel) => channel.id === firstId);
    state.activeChannel = firstIndex >= 0 ? firstIndex : 0;
    clearNoteSelection();
    clearMidiSelection();
    state.channelNoteRuntime.clear();
    return { channelCount: createdChannels.length, instrumentCount: groups.length, noteCount };
  }

  async function applyMidiImport(action = "add") {
    if (state.midiImport.busy) return false;
    const openNew = action === "new";
    const kind = state.midiImport.kind;
    const fileName = state.midiImport.fileName;
    stopMidiImportPreview({ update: false });
    state.midiImport.busy = true;
    updateMidiImportDialog();
    try {
      if (state.playback.running || state.playback.loading) stopPlayback(false);

      if (kind === "midi") {
        const parsed = cloneMidiImportSelection();
        if (!parsed?.groups?.length) throw new Error("가져올 악기를 하나 이상 선택하세요.");
        const imported = importMidiSelectionAsEditableChannels(parsed, {
          openNew,
          fileName,
          ignoreSingle64thOverlap: elements.midiImportIgnoreSingle64thOverlap?.checked !== false,
        });
        if (!imported.channelCount) throw new Error("가져올 노트가 있는 악기를 하나 이상 선택하세요.");
        markDirty(`${state.midiImport.sourceLabel || "MIDI"} ${openNew ? "새로 열기" : "추가"}`);
        shrinkTimelineToContent();
        ensureTimelineFitsViewport();
        state.playhead.beat = clamp(state.playhead.beat, 0, getTotalBeats());
        state.midiImport.busy = false;
        closeMidiImportDialog();
        renderAll();
        resizeAndDraw();
        showToast(`${stripMidiFileExtension(fileName)}에서 선택한 악기 ${imported.instrumentCount}개를 ${imported.channelCount}개 편집 채널로 ${openNew ? "새로 열었습니다." : "추가했습니다."}`);
        return true;
      }

      const parsed = getCurrentUnifiedTextParsed();
      if (!parsed?.noteCount) throw new Error("가져올 채널을 하나 이상 선택하세요.");
      const format = state.midiImport.textFormat;
      const importLabel = getUnifiedTextFormatLabel(format);
      if (openNew) {
        resetProject({ notify: false });
        state.channels = [];
        state.activeChannel = 0;
        state.projectName = String(fileName || importLabel).replace(/\.(?:mml|3mle|mmi|txt)$/i, "") || importLabel;
      }
      state.mmlImport.sourceFileName = fileName;
      const importedChannelIds = [];
      parsed.noteParts.forEach((part, partIndex) => {
        const channel = createImportedChannel(part, partIndex + 1);
        state.channels.push(channel);
        importedChannelIds.push(channel.id);
      });
      if (!state.channels.length) state.channels = createDefaultChannels();
      if (openNew && parsed.explicitTempoCount) {
        state.tempos = parsed.tempos.map((tempo, index) => ({
          id: index + 1,
          beat: Number(tempo.beat.toFixed(6)),
          bpm: clamp(Math.round(tempo.bpm), CONFIG.minTempo, CONFIG.maxTempo),
          fixed: index === 0,
        }));
        state.nextTempoId = state.tempos.length + 1;
      }
      state.activePanel = "notes";
      const firstIndex = state.channels.findIndex((channel) => channel.id === importedChannelIds[0]);
      state.activeChannel = firstIndex >= 0 ? firstIndex : 0;
      clearNoteSelection();
      clearMidiSelection();
      state.channelNoteRuntime.clear();
      markDirty(`${importLabel} ${openNew ? "새로 열기" : "추가"}`);
      shrinkTimelineToContent();
      ensureTimelineFitsViewport();
      state.midiImport.busy = false;
      closeMidiImportDialog();
      renderAll();
      resizeAndDraw();
      showToast(`${importLabel}에서 ${parsed.noteParts.length}개 채널을 ${openNew ? "새 프로젝트로 열었습니다." : "추가했습니다."}`);
      return true;
    } catch (error) {
      state.midiImport.busy = false;
      const message = error instanceof Error ? error.message : "파일을 불러오지 못했습니다.";
      updateMidiImportDialog();
      setMidiImportStatus(message, { error: true });
      console.error(error);
      return false;
    }
  }

  async function prepareUnifiedImportFile(file) {
    if (!file) return false;
    const name = String(file.name || "");
    const extension = (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
    if (["json", "mmlproj"].includes(extension) || /\.mmlproj\.json$/i.test(name)) {
      try {
        await loadProjectFromFile(file);
        return true;
      } catch (error) {
        console.error(error);
        showToast(error instanceof Error ? error.message : "프로젝트 파일을 불러오지 못했습니다.");
        return false;
      }
    }
    if (window.MabiMusicFormats?.isSupported(name, file.type || "")) {
      return prepareMidiImportFile(file);
    }
    if (["mml", "3mle", "mmi", "txt"].includes(extension) || String(file.type || "").startsWith("text/")) {
      return prepareCompatibleTextImportFile(file);
    }
    showToast("지원하지 않는 파일 형식입니다.");
    return false;
  }

  async function loadMidiReferenceFile(file, options = {}) {
    if (!file) return false;
    if (options.interactive !== false && options.skipDialog !== true && options.quantizeDivision == null) {
      return prepareMidiImportFile(file);
    }
    try {
      const converted = await convertImportFileToMidiBuffer(file);
      const parsed = parseMidiArrayBuffer(converted.midiBuffer, converted.fileName, {
        quantizeDivision: options.quantizeDivision,
        sourceType: converted.sourceType,
        sourceLabel: converted.sourceLabel,
      });
      const imported = importMidiSelectionAsEditableChannels(parsed, {
        openNew: false,
        fileName: converted.fileName,
      });
      if (!imported.channelCount) throw new Error("가져올 노트가 없습니다.");
      markDirty(`${converted.sourceLabel} 추가`);
      shrinkTimelineToContent();
      ensureTimelineFitsViewport();
      renderAll();
      resizeAndDraw();
      showToast(`${stripMidiFileExtension(converted.fileName)}에서 ${imported.channelCount}개 편집 채널을 추가했습니다.`);
      return true;
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "음악 파일을 읽지 못했습니다.");
      return false;
    }
  }

  function renameActiveMidiDocumentTitle(value) {
    const document = getActiveMidiDocument();
    if (!document || state.midiReference.activeGroupId) return false;
    const nextTitle = String(value || "").trim();
    if (!nextTitle) {
      if (elements.midiSourceNameInput) elements.midiSourceNameInput.value = document.title || stripMidiFileExtension(document.fileName);
      showToast("원본 자료 제목은 비워둘 수 없습니다.");
      return false;
    }
    if (nextTitle === document.title) return true;
    document.title = nextTitle.slice(0, 80);
    state.midiReference.title = document.title;
    setDirtyWithoutHistory();
    renderChannelTabs();
    updateMidiReferenceUI();
    scheduleAutosave(120);
    showToast(`원본 자료 제목을 "${document.title}"(으)로 변경했습니다.`);
    return true;
  }

  function renameActiveAudioTitle(value) {
    const clip = getActiveAudioClip();
    if (!clip) return false;
    const nextTitle = String(value || "").trim();
    if (!nextTitle) {
      if (elements.audioSourceNameInput) elements.audioSourceNameInput.value = clip.title;
      showToast("오디오 제목은 비워둘 수 없습니다.");
      return false;
    }
    if (nextTitle === clip.title) return true;
    clip.title = nextTitle.slice(0, 80);
    setDirtyWithoutHistory();
    renderChannelTabs();
    updateAudioSourceInspector();
    renderAudioLane();
    scheduleAutosave(120);
    showToast(`오디오 제목을 "${clip.title}"(으)로 변경했습니다.`);
    return true;
  }

  function recomputeMidiDocumentDuration(document) {
    if (!document) return 0;
    let endBeat = 0;
    for (const group of document.groups || []) {
      for (const note of group.notes || []) {
        endBeat = Math.max(endBeat, Number(note.startBeat) + Number(note.durationBeat));
      }
    }
    document.durationBeats = Math.max(0, Number(endBeat) || 0);
    return document.durationBeats;
  }

  function deleteMidiGroup(documentId, groupId) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    if (!document) return false;
    const groupIndex = (document.groups || []).findIndex((group) => String(group.id) === String(groupId));
    if (groupIndex < 0) return false;
    const [removed] = document.groups.splice(groupIndex, 1);
    document.activeGroupId = null;
    recomputeMidiDocumentDuration(document);
    if (String(state.activeMidiDocumentId) === String(document.id)) {
      setActiveMidiReference(document);
      state.midiReference.activeGroupId = null;
    }
    clearMidiSelection();
    renderAll();
    shrinkTimelineToContent();
    resizeAndDraw();
    setDirtyWithoutHistory();
    scheduleAutosave(120);
    showToast(`${getMidiGroupDisplayName(removed, "원본 채널")} 채널 정보를 삭제했습니다.`);
    return true;
  }

  async function requestDeleteMidiGroup(documentId, groupId) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const group = document?.groups?.find((item) => String(item.id) === String(groupId));
    if (!document || !group) return false;
    const confirmed = await showConfirmDialog({
      title: "원본 채널 삭제",
      message: `${getMidiGroupDisplayName(group)} 채널 정보만 삭제할까요?\n원본 문서의 다른 채널은 유지됩니다.`,
      confirmLabel: "삭제",
    });
    return confirmed ? deleteMidiGroup(document.id, group.id) : false;
  }

  function clearMidiReference() {
    const active = getActiveMidiDocument();
    if (!active) {
      return false;
    }
    if (state.playback.running || state.playback.loading) {
      stopPlayback(false);
    }
    state.midiDocuments = state.midiDocuments.filter((midiDocument) => String(midiDocument.id) !== String(active.id));
    state.activePanel = "notes";
    setActiveMidiReference(null);
    renderAll();
    shrinkTimelineToContent();
    resizeAndDraw();
    setDirtyWithoutHistory();
    showToast(`${active.title || active.fileName} 원본 자료를 삭제했습니다.`);
    return true;
  }

  function setMidiDocumentVisible(documentId, visible, { notify = true } = {}) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const nextVisible = Boolean(visible);
    if (!document || document.visible === nextVisible) return false;
    document.visible = nextVisible;
    if (String(state.activeMidiDocumentId) === String(document.id)) state.midiReference.visible = nextVisible;
    setDirtyWithoutHistory();
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    if (notify) showToast(`${document.title || document.fileName || "MIDI"}를 ${nextVisible ? "표시" : "숨김"} 처리했습니다.`);
    return true;
  }

  function setMidiGroupVisibleByDocument(documentId, groupId, visible, { notify = true } = {}) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const group = document?.groups?.find((item) => String(item.id) === String(groupId));
    const nextVisible = Boolean(visible);
    if (!group || group.visible === nextVisible) return false;
    group.visible = nextVisible;
    if (String(state.activeMidiDocumentId) === String(document?.id)) {
      const activeGroup = state.midiReference.groups?.find((item) => String(item.id) === String(group.id));
      if (activeGroup) activeGroup.visible = nextVisible;
    }
    setDirtyWithoutHistory();
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    if (notify) showToast(`${getMidiGroupDisplayName(group)}을 ${nextVisible ? "표시" : "숨김"} 처리했습니다.`);
    return true;
  }

  function setMidiGroupVisible(groupId, visible, options = {}) {
    const document = getActiveMidiDocument();
    return document ? setMidiGroupVisibleByDocument(document.id, groupId, visible, options) : false;
  }

  function setMidiDocumentMuted(documentId, muted, { notify = true } = {}) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const nextMuted = Boolean(muted);
    if (!document || document.muted === nextMuted) return false;
    document.muted = nextMuted;
    if (String(state.activeMidiDocumentId) === String(document.id)) state.midiReference.muted = nextMuted;
    setDirtyWithoutHistory();
    if (state.playback.running || state.playback.loading) {
      if (nextMuted) releasePlaybackVoicesForSource(null, { source: "midi" });
      else schedulePlaybackCatchupForSource(null, { source: "midi" });
      refreshPlaybackVisualsAfterMuteChange();
    }
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    if (notify) showToast(`${document.title || document.fileName || "MIDI"} ${nextMuted ? "음소거" : "음소거 해제"}`);
    return true;
  }

  function setMidiGroupMuted(documentId, groupId, muted, { notify = true } = {}) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const group = document?.groups?.find((item) => String(item.id) === String(groupId));
    const nextMuted = Boolean(muted);
    if (!group || group.muted === nextMuted) return false;
    group.muted = nextMuted;
    setDirtyWithoutHistory();
    if ((state.playback.running || state.playback.loading) && String(state.activeMidiDocumentId) === String(document.id)) {
      if (nextMuted) releasePlaybackVoicesForSource(group.id, { source: "midi" });
      else schedulePlaybackCatchupForSource(group.id, { source: "midi" });
      refreshPlaybackVisualsAfterMuteChange();
    }
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    if (notify) showToast(`${getMidiGroupDisplayName(group)} ${nextMuted ? "음소거" : "음소거 해제"}`);
    return true;
  }

  function setAllMidiGroupsVisible(visible = true) {
    const active = getActiveMidiDocument();
    if (!active) return false;
    let changed = false;
    active.visible = true;
    for (const group of active.groups || []) {
      if (group.visible === Boolean(visible)) continue;
      group.visible = Boolean(visible);
      changed = true;
    }
    if (!changed) return false;
    setActiveMidiReference(active);
    setDirtyWithoutHistory();
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    showToast(visible ? "모든 MIDI 악기를 표시했습니다." : "모든 MIDI 악기를 숨겼습니다.");
    return true;
  }

  async function copyMidiNotesToClipboard(items, { originBeat = null, label = "MIDI 노트" } = {}) {
    const notes = items.map((item) => item.note || item);
    return copyNotesToNodeClipboard(notes, {
      label: `${label} ${notes.length}개`,
      originBeat,
      source: "midi",
    });
  }

  function copySelectedMidiNotes() {
    const selected = getSelectedMidiNotes();
    const originBeat = selected.length
      ? Math.min(...selected.map((item) => item.note.startBeat))
      : null;
    return copyMidiNotesToClipboard(selected, { originBeat, label: "선택 MIDI 노트" });
  }

  function copyActiveMidiInstrument() {
    const group = getMidiGroupById();
    return group ? copyMidiNotesToClipboard(group.notes, { originBeat: 0, label: group.programName || "MIDI 악기" }) : false;
  }

  function getMidiChannelCopyGroupsFromDialog() {
    const document = getActiveMidiDocument();
    if (!document || !elements.midiTransferChannelList) return [];
    const selectedIds = new Set(
      [...elements.midiTransferChannelList.querySelectorAll('input[type="checkbox"]:checked')]
        .map((input) => String(input.value || "")),
    );
    return (document.groups || []).filter((group) => selectedIds.has(String(group.id)));
  }

  function makeEditorChannelFromMidiVoice(group, notes, { document = null, voiceIndex = 0, voiceCount = 1, copyColor = null } = {}) {
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    const voiceSuffix = voiceCount > 1 ? ` (${voiceIndex + 1})` : "";
    const requestedName = `${getMidiGroupDisplayName(group, "악기 채널")}${voiceSuffix}`;
    channel.name = makeUniqueChannelName(requestedName, channel.id);
    channel.color = isValidChannelColor(copyColor) ? normalizeChannelColor(copyColor) : getMidiGroupColor(group, state.channels.length);
    const program = clamp(Math.round(Number(group?.program) || 0), 0, 127);
    channel.instrument = isMidiGroupDrums(group) ? "Drums" : (GM_PROGRAM_NAMES[program] || GM_PROGRAM_NAMES[0]);
    channel.notes = (notes || []).map((note) => {
      const dynamics = normalizeNoteDynamics(note);
      return {
        id: state.nextNoteId++,
        pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
        startBeat: Number(Math.max(0, Number(note.startBeat) || 0).toFixed(6)),
        durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat).toFixed(6)),
        velocity: dynamics.velocity,
        volume: dynamics.volume,
      };
    });
    channel.visible = true;
    channel.muted = false;
    return channel;
  }

  function copyMidiGroupsToNewEditorChannels(groups, { document = getActiveMidiDocument(), closeDialog = false } = {}) {
    const validGroups = (groups || []).filter((group) => Array.isArray(group?.notes) && group.notes.length);
    if (!validGroups.length) {
      showToast("복사할 원본 악기 채널이 없습니다.");
      return false;
    }
    const createdChannels = [];
    const colorByInstrument = new Map();
    let copiedNotes = 0;
    for (const group of validGroups) {
      const sourceIndex = Math.max(0, (document?.groups || []).indexOf(group));
      const instrumentKey = isMidiGroupDrums(group) ? "drums" : `program-${clamp(Math.round(Number(group?.program) || 0), 0, 127)}`;
      if (!colorByInstrument.has(instrumentKey)) {
        colorByInstrument.set(instrumentKey, getMidiGroupColor(group, sourceIndex));
      }
      const copyColor = colorByInstrument.get(instrumentKey);
      const voices = splitNotesIntoMonophonicVoices(group.notes || []);
      voices.forEach((voiceNotes, voiceIndex) => {
        if (!voiceNotes.length) return;
        const channel = makeEditorChannelFromMidiVoice(group, voiceNotes, {
          document,
          voiceIndex,
          voiceCount: voices.length,
          copyColor,
        });
        state.channels.push(channel);
        state.channelNoteRuntime.delete(String(channel.id));
        createdChannels.push(channel);
        copiedNotes += channel.notes.length;
      });
    }
    if (!createdChannels.length) {
      showToast("복사할 노트를 만들지 못했습니다.");
      return false;
    }
    state.activePanel = "notes";
    state.activeMidiDocumentId = document?.id ?? state.activeMidiDocumentId;
    state.activeChannel = state.channels.findIndex((channel) => channel.id === createdChannels[0].id);
    if (state.activeChannel < 0) state.activeChannel = 0;
    clearNoteSelection();
    clearMidiSelection();
    if (closeDialog) closeMidiTransferDialog();
    markDirty("원본 채널 복사");
    ensureTimelineFitsViewport();
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    const voiceExtra = createdChannels.length - validGroups.length;
    showToast(`${validGroups.length}개 악기에서 ${copiedNotes}개 노트를 ${createdChannels.length}개 새 편집 채널로 복사했습니다.${voiceExtra > 0 ? " 화음은 겹치지 않도록 여러 채널로 분리했습니다." : ""}`);
    return true;
  }

  function copyActiveMidiInstrumentToNewChannels() {
    const document = getActiveMidiDocument();
    const group = getMidiGroupById();
    if (!document || !group?.notes?.length) {
      showToast("복사할 원본 악기를 선택하세요.");
      return false;
    }
    return copyMidiGroupsToNewEditorChannels([group], { document });
  }

  function updateMidiTransferSummary() {
    if (!elements.midiTransferSummary) return;
    const document = getActiveMidiDocument();
    const selectedGroups = getMidiChannelCopyGroupsFromDialog();
    const selectedNotes = selectedGroups.reduce((sum, group) => sum + (group.notes?.length || 0), 0);
    if (!document?.groups?.length) {
      elements.midiTransferSummary.textContent = "복사할 악기 채널이 없습니다.";
      elements.midiTransferApplyButton.disabled = true;
      return;
    }
    elements.midiTransferSummary.textContent = selectedGroups.length
      ? `${document.groups.length}개 악기 중 ${selectedGroups.length}개 선택 · 원본 노트 ${selectedNotes}개`
      : "복사할 악기를 하나 이상 선택하세요.";
    elements.midiTransferApplyButton.disabled = selectedGroups.length === 0;
  }

  function setAllMidiTransferGroupsChecked(checked) {
    if (!elements.midiTransferChannelList) return;
    elements.midiTransferChannelList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = Boolean(checked);
    });
    updateMidiTransferSummary();
  }

  function renderMidiTransferDialog() {
    const midiDocument = getActiveMidiDocument();
    if (!midiDocument?.groups?.length || !elements.midiTransferChannelList) return false;
    elements.midiTransferSourceLabel.textContent = `${midiDocument.title || midiDocument.fileName || "원본 자료"} · ${midiDocument.groups.length}개 악기`;
    elements.midiTransferChannelList.replaceChildren();
    midiDocument.groups.forEach((group, index) => {
      const row = document.createElement("label");
      row.className = "midi-transfer-channel-row midi-copy-instrument-row";
      row.style.setProperty("--channel-color", getMidiGroupColor(group, index));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(group.id);
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `${getMidiGroupDisplayName(group)} 복사 선택`);
      const text = document.createElement("span");
      text.className = "midi-transfer-channel-name";
      text.textContent = `${getMidiGroupDisplayName(group)} · ${group.notes?.length || 0}노트`;
      row.append(checkbox, text);
      checkbox.addEventListener("change", updateMidiTransferSummary);
      elements.midiTransferChannelList.append(row);
    });
    updateMidiTransferSummary();
    return true;
  }

  function openMidiTransferDialog() {
    const document = getActiveMidiDocument();
    if (!document?.groups?.length) {
      showToast("복사할 원본 자료가 없습니다.");
      return false;
    }
    if (state.midiReference.activeGroupId) {
      return copyActiveMidiInstrumentToNewChannels();
    }
    if (!renderMidiTransferDialog()) return false;
    elements.midiTransferBackdrop.hidden = false;
    requestAnimationFrame(() => elements.midiTransferChannelList.querySelector('input[type="checkbox"]')?.focus());
    return true;
  }

  function closeMidiTransferDialog() {
    if (elements.midiTransferBackdrop) elements.midiTransferBackdrop.hidden = true;
  }

  function applyMidiTransfer() {
    const document = getActiveMidiDocument();
    const groups = getMidiChannelCopyGroupsFromDialog();
    if (!document || !groups.length) {
      updateMidiTransferSummary();
      return false;
    }
    return copyMidiGroupsToNewEditorChannels(groups, { document, closeDialog: true });
  }

  function updateChannelInfo() {
    const channel = state.activePanel === "notes" ? state.channels[state.activeChannel] : null;
    if (!channel) {
      if (elements.noteVolumeButton) {
        elements.noteVolumeButton.disabled = true;
        elements.noteVolumeButton.textContent = "V";
        elements.noteVolumeButton.title = "채널을 선택한 뒤 노트 볼륨을 수정할 수 있습니다.";
      }
      updatePlaybackTimeInfo();
      updateEditMenuState();
      return;
    }
    const lastBeat = channel.notes.reduce(
      (maximum, note) => Math.max(maximum, note.startBeat + note.durationBeat),
      0,
    );
    const lastSeconds = beatToSeconds(lastBeat);
    const selected = getSelectedNotes();

    elements.infoChannel.textContent = `${channel.name}${channel.muted ? " · 음소거" : ""}${channel.visible === false ? " · 숨김" : ""}`;
    elements.infoNoteCount.textContent = String(channel.notes.length);
    elements.infoLength.textContent = formatSeconds(lastSeconds);
    if (selected.length === 1) {
      const [note] = selected;
      elements.infoSelection.textContent = `${noteLabel(note.pitch)} / ${note.startBeat.toFixed(3)} beat`;
    } else if (selected.length > 1) {
      elements.infoSelection.textContent = `${selected.length}개 선택`;
    } else {
      elements.infoSelection.textContent = "없음";
    }
    if (elements.noteVolumeButton) {
      elements.noteVolumeButton.disabled = selected.length === 0;
      if (selected.length === 1) {
        elements.noteVolumeButton.textContent = `V${getNoteVolume(selected[0])}`;
        elements.noteVolumeButton.title = `${noteLabel(selected[0].pitch)} 볼륨 V${getNoteVolume(selected[0])} · Alt+휠로 조절`;
      } else if (selected.length > 1) {
        const volumes = new Set(selected.map((note) => getNoteVolume(note)));
        elements.noteVolumeButton.textContent = volumes.size === 1 ? `V${getNoteVolume(selected[0])}` : "V…";
        elements.noteVolumeButton.title = `${selected.length}개 선택 노트 볼륨 수정 · Alt+휠로 조절`;
      } else {
        elements.noteVolumeButton.textContent = "V";
        elements.noteVolumeButton.title = "선택 노트 볼륨 수정";
      }
    }
    updatePlaybackTimeInfo();
    updateEditMenuState();
  }

  function openNoteVolumeDialog() {
    if (state.activePanel === "audio") {
      showToast("오디오에는 노트 볼륨 기능을 사용할 수 없습니다.");
      return false;
    }
    if (isMidiReferenceActive()) {
      showToast("MIDI 노트는 읽기 전용입니다.");
      return false;
    }
    const selected = getSelectedNotes();
    if (!selected.length) {
      showToast("볼륨을 수정할 노트를 선택하세요.");
      return false;
    }
    const volumes = selected.map((note) => getNoteVolume(note));
    const unique = new Set(volumes);
    const initial = unique.size === 1
      ? volumes[0]
      : Math.round(volumes.reduce((sum, value) => sum + value, 0) / volumes.length);
    elements.noteVolumeSlider.value = String(initial);
    elements.noteVolumeValue.textContent = unique.size === 1 ? `V${initial}` : `혼합 → V${initial}`;
    elements.noteVolumeSelectionLabel.textContent = `${selected.length}개 선택 노트`;
    elements.noteVolumeBackdrop.hidden = false;
    requestAnimationFrame(() => elements.noteVolumeSlider.focus());
    return true;
  }

  function closeNoteVolumeDialog() {
    if (elements.noteVolumeBackdrop) elements.noteVolumeBackdrop.hidden = true;
  }

  function applySelectedNoteVolume() {
    const selected = getSelectedNotes();
    if (!selected.length) {
      closeNoteVolumeDialog();
      return false;
    }
    const volume = clamp(Math.round(Number(elements.noteVolumeSlider.value) || 0), 0, 15);
    const velocity = mmlVolumeToVelocity(volume);
    if (selected.every((note) => getNoteVolume(note) === volume)) {
      closeNoteVolumeDialog();
      return false;
    }
    for (const note of selected) {
      note.volume = volume;
      note.velocity = velocity;
    }
    closeNoteVolumeDialog();
    state.channelNoteRuntime.delete(String(getActiveChannel()?.id));
    markDirty("노트 볼륨 변경");
    drawRoll();
    updateChannelInfo();
    showToast(`${selected.length}개 노트의 볼륨을 V${volume}(으)로 변경했습니다.`);
    return true;
  }

  function updateDirtyState() {
    elements.dirtyIndicator.hidden = !state.dirty;
    document.title = `${state.dirty ? "● " : ""}${state.projectName} - 모비바드 ${APP_VERSION_LABEL}`;
  }

  function captureHistorySnapshot() {
    return JSON.stringify({
      channels: state.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        color: getChannelColor(channel),
        instrument: channel.instrument,
        notes: channel.notes.map((note) => ({ ...note })),
      })),
      tempos: state.tempos.map((tempo) => ({ ...tempo })),
      audioClips: state.audioClips.map((clip) => ({ ...clip })),
      nextNoteId: state.nextNoteId,
      nextTempoId: state.nextTempoId,
      nextAudioClipId: state.nextAudioClipId,
    });
  }

  function createHistoryEntry(snapshot, label = "편집") {
    return {
      id: state.history.nextId++,
      snapshot,
      label: String(label || "편집"),
      createdAt: Date.now(),
    };
  }

  function initializeHistory(label = "시작") {
    state.history.undoStack.length = 0;
    state.history.redoStack.length = 0;
    state.history.nextId = 1;
    state.history.currentEntry = createHistoryEntry(captureHistorySnapshot(), label);
    state.history.restoring = false;
    renderHistoryPanel();
  }

  function commitHistorySnapshot(label = "편집") {
    if (state.history.restoring) {
      return false;
    }
    const nextSnapshot = captureHistorySnapshot();
    if (state.history.currentEntry == null) {
      state.history.currentEntry = createHistoryEntry(nextSnapshot, label);
      renderHistoryPanel();
      return false;
    }
    if (nextSnapshot === state.history.currentEntry.snapshot) {
      return false;
    }
    state.history.undoStack.push(state.history.currentEntry);
    if (state.history.undoStack.length > CONFIG.historyLimit) {
      state.history.undoStack.splice(0, state.history.undoStack.length - CONFIG.historyLimit);
    }
    state.history.currentEntry = createHistoryEntry(nextSnapshot, label);
    state.history.redoStack.length = 0;
    renderHistoryPanel();
    return true;
  }

  function getOrderedHistoryEntries() {
    return [
      ...state.history.undoStack,
      ...(state.history.currentEntry ? [state.history.currentEntry] : []),
      ...state.history.redoStack.slice().reverse(),
    ];
  }

  function renderHistoryPanel() {
    if (!elements.historyList) {
      return;
    }
    const entries = getOrderedHistoryEntries();
    const currentIndex = state.history.undoStack.length;
    const newestFirst = entries.map((entry, index) => ({ entry, index })).reverse();
    elements.historyList.replaceChildren();
    newestFirst.forEach(({ entry, index }) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `history-item${index === currentIndex ? " current" : ""}${index > currentIndex ? " future" : ""}`;
      button.dataset.historyIndex = String(index);
      button.title = `${entry.label}`;
      if (index === currentIndex) {
        button.setAttribute("aria-current", "step");
      }
      const label = document.createElement("span");
      label.className = "history-item-label";
      label.textContent = entry.label;
      button.append(label);
      button.addEventListener("click", () => jumpToHistoryIndex(index));
      item.append(button);
      elements.historyList.append(item);
    });
    elements.historyUndoButton.disabled = state.history.undoStack.length === 0;
    elements.historyRedoButton.disabled = state.history.redoStack.length === 0;
    updateEditMenuState();
    requestAnimationFrame(() => {
      elements.historyList.querySelector(".history-item.current")?.scrollIntoView({ block: "nearest" });
    });
  }

  function getChannelTreeKeyboardItems() {
    if (!elements.channelTabs) return [];
    return [...elements.channelTabs.querySelectorAll(".channel-tree-item")].filter((item) => (
      !item.hidden && item.getClientRects().length > 0 && item.querySelector(".channel-tree-main")
    ));
  }

  function activateChannelTreeKeyboardItem(item) {
    if (!item) return false;
    if (item.dataset.channelId != null) {
      const index = state.channels.findIndex((channel) => String(channel.id) === String(item.dataset.channelId));
      return index >= 0 ? selectChannel(index, { toggle: false }) : false;
    }
    if (item.dataset.audioClipId != null) {
      return selectAudioClip(item.dataset.audioClipId);
    }
    if (item.dataset.groupId != null && item.dataset.midiDocumentId != null) {
      return selectMidiGroupFromTree(item.dataset.midiDocumentId, item.dataset.groupId);
    }
    if (item.dataset.midiDocumentId != null) {
      return selectMidiDocument(item.dataset.midiDocumentId);
    }
    return false;
  }

  function channelTreeItemIdentity(item) {
    if (!item) return null;
    if (item.dataset.channelId != null) return { kind: "channel", id: String(item.dataset.channelId) };
    if (item.dataset.audioClipId != null) return { kind: "audio", id: String(item.dataset.audioClipId) };
    if (item.dataset.groupId != null && item.dataset.midiDocumentId != null) {
      return { kind: "group", id: String(item.dataset.groupId), documentId: String(item.dataset.midiDocumentId) };
    }
    if (item.dataset.midiDocumentId != null) return { kind: "document", id: String(item.dataset.midiDocumentId) };
    return null;
  }

  function findChannelTreeItemByIdentity(identity) {
    if (!identity) return null;
    return getChannelTreeKeyboardItems().find((item) => {
      const candidate = channelTreeItemIdentity(item);
      return candidate?.kind === identity.kind
        && candidate.id === identity.id
        && (candidate.documentId || "") === (identity.documentId || "");
    }) || null;
  }

  function handleChannelTreeArrowNavigation(event) {
    if (!elements.channelTabs || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const items = getChannelTreeKeyboardItems();
    if (!items.length) return false;
    const currentItem = event.target.closest?.(".channel-tree-item");
    let index = currentItem ? items.indexOf(currentItem) : items.findIndex((item) => item.classList.contains("active"));
    if (index < 0) index = 0;
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = items.length - 1;
    else if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    else index = Math.min(items.length - 1, index + 1);
    const target = items[index];
    const identity = channelTreeItemIdentity(target);
    activateChannelTreeKeyboardItem(target);
    requestAnimationFrame(() => {
      const restored = findChannelTreeItemByIdentity(identity);
      restored?.querySelector(".channel-tree-main")?.focus({ preventScroll: true });
      restored?.scrollIntoView({ block: "nearest" });
    });
    event.preventDefault();
    return true;
  }

  function handleHistoryArrowNavigation(event) {
    if (!elements.historyList || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const buttons = [...elements.historyList.querySelectorAll(".history-item")];
    if (!buttons.length) return false;
    const current = event.target.closest?.(".history-item");
    let index = current ? buttons.indexOf(current) : buttons.findIndex((button) => button.classList.contains("current"));
    if (index < 0) index = 0;
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    else index = Math.min(buttons.length - 1, index + 1);
    buttons[index].focus({ preventScroll: true });
    buttons[index].scrollIntoView({ block: "nearest" });
    event.preventDefault();
    return true;
  }

  function setSidebarTab(tab, { persist = true, focus = false } = {}) {
    const nextTab = tab === "history" ? "history" : "channels";
    state.sidebarTab = nextTab;
    const channelsActive = nextTab === "channels";
    elements.sidebarChannelsTab?.classList.toggle("active", channelsActive);
    elements.sidebarHistoryTab?.classList.toggle("active", !channelsActive);
    elements.sidebarChannelsTab?.setAttribute("aria-selected", String(channelsActive));
    elements.sidebarHistoryTab?.setAttribute("aria-selected", String(!channelsActive));
    if (elements.channelPanel) elements.channelPanel.hidden = !channelsActive;
    if (elements.historyPanel) elements.historyPanel.hidden = channelsActive;
    if (persist) {
      try { window.localStorage.setItem("mobibard-sidebar-tab", nextTab); } catch {}
      scheduleAutosave(500);
    }
    if (focus) (channelsActive ? elements.sidebarChannelsTab : elements.sidebarHistoryTab)?.focus();
    requestAnimationFrame(resizeAndDraw);
  }

  function loadStoredSidebarTab() {
    try { return window.localStorage.getItem("mobibard-sidebar-tab") === "history" ? "history" : "channels"; }
    catch { return "channels"; }
  }

  function setHistoryCollapsed(collapsed) {
    state.history.collapsed = Boolean(collapsed);
    elements.appContent.classList.toggle("history-collapsed", state.history.collapsed);
    if (elements.sidePanel) elements.sidePanel.hidden = state.history.collapsed;
    if (elements.historyCornerToggle) {
      elements.historyCornerToggle.textContent = state.history.collapsed ? "패널 열기" : "패널 닫기";
      elements.historyCornerToggle.dataset.state = state.history.collapsed ? "closed" : "open";
      elements.historyCornerToggle.title = state.history.collapsed ? "왼쪽 패널 열기" : "왼쪽 패널 닫기";
      elements.historyCornerToggle.setAttribute("aria-label", elements.historyCornerToggle.title);
      elements.historyCornerToggle.setAttribute("aria-pressed", String(state.history.collapsed));
    }
    try {
      window.localStorage.setItem("mobibard-sidebar-collapsed", state.history.collapsed ? "1" : "0");
    } catch {}
    requestAnimationFrame(resizeAndDraw);
  }

  function loadHistoryCollapsedState() {
    try {
      const current = window.localStorage.getItem("mobibard-sidebar-collapsed");
      if (current != null) return current === "1";
      return window.localStorage.getItem("mobibard-history-collapsed") === "1";
    } catch {
      return false;
    }
  }

  function restoreHistorySnapshot(snapshot) {
    const data = JSON.parse(snapshot);
    const scrollLeft = elements.rollViewport.scrollLeft;
    const scrollTop = elements.rollViewport.scrollTop;
    const activeChannelId = getActiveChannel()?.id ?? null;
    const activeChannelIndex = state.activeChannel;
    const playheadBeat = state.playhead.beat;
    const mutedByChannelId = new Map(state.channels.map((channel) => [String(channel.id), Boolean(channel.muted)]));
    const visibleByChannelId = new Map(state.channels.map((channel) => [String(channel.id), channel.visible !== false]));
    const mutedByAudioId = new Map(state.audioClips.map((clip) => [String(clip.id), Boolean(clip.muted)]));
    const visibleByAudioId = new Map(state.audioClips.map((clip) => [String(clip.id), clip.visible !== false]));

    stopPlayback(false);
    releaseKeyboardVoice(true);
    clearEditorPitchPreview(true);
    stopRollDragAutoScroll();

    state.history.restoring = true;
    try {
      state.channels = data.channels.map((channel, index) => {
        const channelId = Number(channel.id) || index + 1;
        return {
        id: channelId,
        name: String(channel.name || `Ch${channelId}`),
        color: getChannelColor(channel, index),
        muted: mutedByChannelId.get(String(channelId)) || false,
        visible: visibleByChannelId.has(String(channelId)) ? visibleByChannelId.get(String(channelId)) : true,
        instrument: String(channel.instrument || "Acoustic Grand Piano"),
        notes: normalizeMonophonicNotes(channel.notes.map((note) => ({
          id: Number(note.id),
          pitch: clamp(Number(note.pitch), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat: Math.max(0, Number(note.startBeat) || 0),
          durationBeat: Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat),
          velocity: normalizeNoteDynamics(note).velocity,
          volume: normalizeNoteDynamics(note).volume,
        }))),
      };
      });
      if (!state.channels.length) {
        state.channels = createDefaultChannels(1);
      }
      normalizeDefaultChannelNames();
      state.tempos = data.tempos.map((tempo) => ({
        id: Number(tempo.id),
        beat: Math.max(0, Number(tempo.beat) || 0),
        bpm: clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
        fixed: Boolean(tempo.fixed),
      }));
      if (!state.tempos.some((tempo) => Math.abs(tempo.beat) < 1e-7)) {
        state.tempos.unshift({ id: 1, beat: 0, bpm: 120, fixed: true });
      }
      state.audioClips = (Array.isArray(data.audioClips) ? data.audioClips : []).map((clip, index) => {
        const normalized = normalizeAudioClip(clip, index);
        normalized.muted = mutedByAudioId.has(String(normalized.id)) ? mutedByAudioId.get(String(normalized.id)) : normalized.muted;
        normalized.visible = visibleByAudioId.has(String(normalized.id)) ? visibleByAudioId.get(String(normalized.id)) : normalized.visible;
        normalized.assetAvailable = Boolean(getAudioRuntime(normalized.id)?.audioBuffer) || normalized.assetAvailable;
        return normalized;
      });
      state.nextNoteId = Math.max(1, Number(data.nextNoteId) || 1);
      state.nextTempoId = Math.max(2, Number(data.nextTempoId) || 2);
      state.nextAudioClipId = Math.max(1, Number(data.nextAudioClipId) || 1);
      const restoredActiveIndex = activeChannelId == null
        ? -1
        : state.channels.findIndex((channel) => String(channel.id) === String(activeChannelId));
      state.activeChannel = restoredActiveIndex >= 0
        ? restoredActiveIndex
        : clamp(activeChannelIndex, 0, state.channels.length - 1);
      if (state.activePanel === "audio" && getActiveAudioClip()) {
        // 현재 오디오 선택을 유지합니다.
      } else {
        state.activePanel = "notes";
        state.activeAudioClipId = null;
      }
      state.timelineBeats = Math.max(
        CONFIG.beatsPerMeasure,
        getMinimumTimelineBeats(),
        getViewportVisibleEndBeat(),
      );
      state.playhead.beat = clamp(playheadBeat, 0, getTotalBeats());
      clearNoteSelection();
      state.interaction = null;
      state.tempoDrag = null;
      state.dirty = true;
      state.channelNoteRuntime.clear();
      renderAll();
      elements.rollViewport.scrollLeft = clamp(scrollLeft, 0, getMaxScrollLeft());
      elements.rollViewport.scrollTop = clamp(
        scrollTop,
        0,
        Math.max(0, getRollHeight() - elements.rollViewport.clientHeight),
      );
      updatePlayheadVisual();
      drawTimeline();
      drawKeyboard();
      updatePlaybackTimeInfo();
    } finally {
      state.history.restoring = false;
      renderHistoryPanel();
    }
    scheduleAutosave();
  }

  function jumpToHistoryIndex(targetIndex) {
    const entries = getOrderedHistoryEntries();
    const safeIndex = clamp(Math.round(Number(targetIndex) || 0), 0, Math.max(0, entries.length - 1));
    const currentIndex = state.history.undoStack.length;
    if (!entries.length || safeIndex === currentIndex) {
      return false;
    }
    state.history.undoStack = entries.slice(0, safeIndex);
    state.history.currentEntry = entries[safeIndex];
    state.history.redoStack = entries.slice(safeIndex + 1).reverse();
    restoreHistorySnapshot(state.history.currentEntry.snapshot);
    renderHistoryPanel();
    showToast(`${safeIndex + 1}번째 편집 상태로 이동했습니다.`);
    return true;
  }

  function undoHistory({ notify = true } = {}) {
    if (!state.history.undoStack.length) {
      if (notify) showToast("되돌릴 편집이 없습니다.");
      return false;
    }
    const previousEntry = state.history.undoStack.pop();
    if (state.history.currentEntry) {
      state.history.redoStack.push(state.history.currentEntry);
    }
    state.history.currentEntry = previousEntry;
    restoreHistorySnapshot(previousEntry.snapshot);
    renderHistoryPanel();
    if (notify) showToast("편집을 되돌렸습니다.");
    return true;
  }

  function redoHistory({ notify = true } = {}) {
    if (!state.history.redoStack.length) {
      if (notify) showToast("다시 실행할 편집이 없습니다.");
      return false;
    }
    const nextEntry = state.history.redoStack.pop();
    if (state.history.currentEntry) {
      state.history.undoStack.push(state.history.currentEntry);
    }
    if (state.history.undoStack.length > CONFIG.historyLimit) {
      state.history.undoStack.splice(0, state.history.undoStack.length - CONFIG.historyLimit);
    }
    state.history.currentEntry = nextEntry;
    restoreHistorySnapshot(nextEntry.snapshot);
    renderHistoryPanel();
    if (notify) showToast("편집을 다시 실행했습니다.");
    return true;
  }

  function handleHistoryShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return false;
    }
    const code = event.code;
    const key = String(event.key || "").toLowerCase();
    const isZ = code === "KeyZ" || key === "z" || key === "ㅋ";
    const isY = code === "KeyY" || key === "y" || key === "ㅛ";
    const redo = isY || (isZ && event.shiftKey);
    const undo = isZ && !event.shiftKey;
    if (!undo && !redo) {
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    redo ? redoHistory() : undoHistory();
    return true;
  }

  function markDirty(label = "편집") {
    state.channelNoteRuntime.clear();
    commitHistorySnapshot(label);
    state.dirty = true;
    updateDirtyState();
    scheduleAutosave();
  }

  function formatSeconds(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds - minutes * 60;
    return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
  }

  function updatePlaybackTimeInfo(currentBeat = state.playhead.beat) {
    if (!elements.playbackTime) {
      return;
    }
    const playbackActive = state.playback.running || state.playback.loading;
    const endBeat = playbackActive ? state.playback.endBeat : getPlaybackEndBeat();
    const rate = Math.max(0.01, Number(state.playbackRate) || 1);
    const currentSeconds = (playbackActive
      ? beatToSecondsFromMap(clamp(Number(currentBeat) || 0, 0, getTotalBeats()), state.playback.tempoMap)
      : beatToSeconds(clamp(Number(currentBeat) || 0, 0, getTotalBeats()))) / rate;
    const totalSeconds = (playbackActive
      ? state.playback.endSeconds
      : beatToSeconds(endBeat)) / rate;
    elements.playbackTime.textContent = `${formatSeconds(currentSeconds)} / ${formatSeconds(totalSeconds)}`;
    elements.playbackTime.title = `현재 ${formatSeconds(currentSeconds)} / 전체 ${formatSeconds(totalSeconds)}`;
  }

  function clearNoteSelection() {
    state.selectedNoteIds.clear();
  }

  function noteIntervalsOverlap(left, right) {
    const leftStart = Number(left.startBeat) || 0;
    const leftEnd = leftStart + Math.max(CONFIG.minimumNoteBeat, Number(left.durationBeat) || CONFIG.minimumNoteBeat);
    const rightStart = Number(right.startBeat) || 0;
    const rightEnd = rightStart + Math.max(CONFIG.minimumNoteBeat, Number(right.durationBeat) || CONFIG.minimumNoteBeat);
    return leftStart < rightEnd - 1e-7 && rightStart < leftEnd - 1e-7;
  }

  function sortNoteIntervals(notes) {
    return notes.slice().sort(compareNotesByTimeline);
  }

  function canPlaceMonophonicNotes(candidateNotes, blockingNotes = []) {
    const candidates = sortNoteIntervals(candidateNotes);
    for (let index = 1; index < candidates.length; index += 1) {
      if (noteIntervalsOverlap(candidates[index - 1], candidates[index])) return false;
    }
    const blockers = sortNoteIntervals(blockingNotes);
    let blockerIndex = 0;
    for (const candidate of candidates) {
      const candidateStart = candidate.startBeat;
      const candidateEnd = candidate.startBeat + candidate.durationBeat;
      while (
        blockerIndex < blockers.length
        && blockers[blockerIndex].startBeat + blockers[blockerIndex].durationBeat <= candidateStart + 1e-7
      ) {
        blockerIndex += 1;
      }
      for (let index = blockerIndex; index < blockers.length && blockers[index].startBeat < candidateEnd - 1e-7; index += 1) {
        if (noteIntervalsOverlap(candidate, blockers[index])) return false;
      }
    }
    return true;
  }

  function canPlaceInChannelMonophonically(channel, candidateNotes, ignoredNoteIds = new Set()) {
    if (!channel) return false;
    const ignored = ignoredNoteIds instanceof Set ? ignoredNoteIds : new Set(ignoredNoteIds || []);
    const blockers = channel.notes.filter((note) => !ignored.has(note.id));
    return canPlaceMonophonicNotes(candidateNotes, blockers);
  }

  function buildNoteBoundarySnapPoints(channel, ignoredNoteIds = new Set()) {
    const ignored = ignoredNoteIds instanceof Set ? ignoredNoteIds : new Set(ignoredNoteIds || []);
    const values = [0];
    for (const note of channel?.notes || []) {
      if (ignored.has(note.id)) continue;
      const start = Math.max(0, Number(note.startBeat) || 0);
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      values.push(start, end);
    }
    values.sort((a, b) => a - b);
    const unique = [];
    for (const value of values) {
      if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 1e-7) unique.push(value);
    }
    return unique;
  }

  // Magnetic snapping is directional. A note before the edited interval contributes
  // only its trailing edge; a note after the interval contributes only its leading
  // edge. This prevents a coarse drag from catching the wrong side of a neighbor.
  function buildDirectionalNoteBoundarySnapPoints(channel, referenceStartBeat, referenceEndBeat = referenceStartBeat, ignoredNoteIds = new Set()) {
    const ignored = ignoredNoteIds instanceof Set ? ignoredNoteIds : new Set(ignoredNoteIds || []);
    const referenceStart = Math.max(0, Number(referenceStartBeat) || 0);
    const referenceEnd = Math.max(referenceStart, Number(referenceEndBeat) || referenceStart);
    const precedingEnds = [0];
    const followingStarts = [];
    for (const note of channel?.notes || []) {
      if (ignored.has(note.id)) continue;
      const start = Math.max(0, Number(note.startBeat) || 0);
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      if (end <= referenceStart + 1e-7) {
        precedingEnds.push(end);
      } else if (start >= referenceEnd - 1e-7) {
        followingStarts.push(start);
      } else {
        // Stable edit channels are monophonic, but keep sensible directional edges
        // for legacy/temporarily-overlapping data too.
        if (start < referenceStart - 1e-7) precedingEnds.push(end);
        if (end > referenceEnd + 1e-7) followingStarts.push(start);
      }
    }
    const uniqueSorted = (values) => {
      values.sort((a, b) => a - b);
      const unique = [];
      for (const value of values) {
        if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 1e-7) unique.push(value);
      }
      return unique;
    };
    return {
      precedingEnds: uniqueSorted(precedingEnds),
      followingStarts: uniqueSorted(followingStarts),
    };
  }

  function mergeNoteBoundarySnapPoints(...groups) {
    const values = [];
    for (const group of groups) {
      for (const raw of group || []) {
        const value = Math.max(0, Number(raw) || 0);
        values.push(value);
      }
    }
    values.sort((a, b) => a - b);
    const unique = [];
    for (const value of values) {
      if (!unique.length || Math.abs(value - unique[unique.length - 1]) > 1e-7) unique.push(value);
    }
    return unique;
  }

  function getMagneticSnapCaptureBeat(unit = getSnapBeat(), thresholdPixels = CONFIG.noteBoundarySnapPixels) {
    const safeUnit = Math.max(CONFIG.minimumNoteBeat, Number(unit) || getSnapBeat());
    const pixelBeat = thresholdPixels / Math.max(1, getQuarterWidth());
    // Fine note/original boundaries must remain reachable even when the edit unit is
    // coarser.  The unit-scaled capture range gives those sub-grid points a real
    // magnetic area instead of requiring the pointer to land on the exact pixel.
    return Math.max(pixelBeat, Math.min(safeUnit * 0.34, 0.75));
  }

  function findNearestBoundaryBeat(target, boundaries, maximumDistance = Infinity) {
    if (!Array.isArray(boundaries) || !boundaries.length) return null;
    let low = 0;
    let high = boundaries.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (boundaries[middle] < target) low = middle + 1;
      else high = middle;
    }
    let best = null;
    for (const index of [low - 1, low, low + 1]) {
      if (index < 0 || index >= boundaries.length) continue;
      const distance = Math.abs(boundaries[index] - target);
      if (distance <= maximumDistance + 1e-9 && (!best || distance < best.distance)) {
        best = { beat: boundaries[index], distance };
      }
    }
    return best?.beat ?? null;
  }

  function findCrossedBoundaryBeat(previousBeat, targetBeat, boundaries) {
    if (!Array.isArray(boundaries) || !boundaries.length || !Number.isFinite(previousBeat)) return null;
    const start = Number(previousBeat);
    const end = Number(targetBeat);
    if (Math.abs(end - start) <= 1e-9) return null;
    const direction = end > start ? 1 : -1;

    // Catch the FIRST boundary encountered in the actual drag direction.  This is
    // intentionally independent from the current edit unit: a 1/16 boundary must
    // still stop a 1/4 drag before the pointer reaches the next 1/4 grid line.
    if (direction > 0) {
      for (const beat of boundaries) {
        if (beat > start + 1e-9 && beat <= end + 1e-9) return beat;
      }
      return null;
    }

    for (let index = boundaries.length - 1; index >= 0; index -= 1) {
      const beat = boundaries[index];
      if (beat < start - 1e-9 && beat >= end - 1e-9) return beat;
    }
    return null;
  }

  function resolveMagneticBoundaryBeat(rawBeat, boundaries, interaction, {
    unit = getSnapBeat(),
    latchKey = "magnetLatchedBeat",
    lastRawKey = "magnetLastRawBeat",
    thresholdPixels = CONFIG.noteBoundarySnapPixels,
  } = {}) {
    if (!Array.isArray(boundaries) || !boundaries.length) return null;
    const target = Number(rawBeat) || 0;
    const captureBeat = getMagneticSnapCaptureBeat(unit, thresholdPixels);
    const releaseBeat = Math.max(captureBeat * 1.45, Math.min(Math.max(CONFIG.minimumNoteBeat, Number(unit) || 0) * 0.46, 1));
    const latched = Number(interaction?.[latchKey]);

    if (Number.isFinite(latched) && Math.abs(target - latched) <= releaseBeat + 1e-9) {
      if (interaction) interaction[lastRawKey] = target;
      return latched;
    }

    const previousRaw = Number(interaction?.[lastRawKey]);
    const nearby = findNearestBoundaryBeat(target, boundaries, captureBeat);
    const crossed = findCrossedBoundaryBeat(previousRaw, target, boundaries);
    // If the pointer crossed a real boundary between frames, that boundary wins over
    // whichever point happens to be nearest to the final pointer position. This is
    // what makes a short 1/16 boundary stop a coarse 1/4 drag instead of skipping it.
    const selected = crossed ?? nearby;

    if (interaction) {
      interaction[lastRawKey] = target;
      interaction[latchKey] = selected == null ? null : selected;
    }
    return selected;
  }

  function findMagneticBoundaryBeat(rawBeat, boundaries, thresholdPixels = CONFIG.noteBoundarySnapPixels) {
    // Kept for non-drag callers. Dragging uses resolveMagneticBoundaryBeat(), which
    // also catches boundaries crossed between pointer events and provides hysteresis.
    const captureBeat = Math.max(CONFIG.minimumNoteBeat * 0.18, thresholdPixels / Math.max(1, getQuarterWidth()));
    return findNearestBoundaryBeat(Number(rawBeat) || 0, boundaries, captureBeat);
  }

  function buildMoveSnapOffsets(originals, anchorStartBeat) {
    const offsets = [];
    for (const original of originals || []) {
      const start = Number(original.startBeat) || 0;
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(original.durationBeat) || CONFIG.minimumNoteBeat);
      offsets.push(start - anchorStartBeat, end - anchorStartBeat);
    }
    offsets.sort((a, b) => a - b);
    const unique = [];
    for (const offset of offsets) {
      if (!unique.length || Math.abs(offset - unique[unique.length - 1]) > 1e-7) unique.push(offset);
    }
    if (unique.length <= 128) return unique;
    const sampled = [unique[0], unique[unique.length - 1]];
    const step = Math.ceil(unique.length / 126);
    for (let index = step; index < unique.length - 1; index += step) sampled.push(unique[index]);
    return sampled.sort((a, b) => a - b);
  }

  function snapMoveDeltaToNoteBoundaries(rawDeltaBeat, interaction) {
    const boundaries = interaction?.magnetBoundaries;
    const offsets = interaction?.magnetOffsets;
    if (!Array.isArray(boundaries) || !boundaries.length || !Array.isArray(offsets) || !offsets.length) return null;

    const unit = getSnapBeat();
    const captureBeat = getMagneticSnapCaptureBeat(unit);
    const releaseBeat = Math.max(captureBeat * 1.45, Math.min(unit * 0.46, 1));
    const latchedDelta = Number(interaction.magnetLatchedDeltaBeat);
    if (Number.isFinite(latchedDelta) && Math.abs(rawDeltaBeat - latchedDelta) <= releaseBeat + 1e-9) {
      interaction.magnetLastRawDeltaBeat = rawDeltaBeat;
      return latchedDelta;
    }

    const previousDelta = Number(interaction.magnetLastRawDeltaBeat);
    let best = null;
    for (const offset of offsets) {
      const movingBeat = interaction.anchorOriginalStartBeat + rawDeltaBeat + offset;
      const nearby = findNearestBoundaryBeat(movingBeat, boundaries, captureBeat);
      const previousMovingBeat = Number.isFinite(previousDelta)
        ? interaction.anchorOriginalStartBeat + previousDelta + offset
        : NaN;
      const crossed = findCrossedBoundaryBeat(previousMovingBeat, movingBeat, boundaries);
      const boundary = crossed ?? nearby;
      if (boundary == null) continue;
      const correction = boundary - movingBeat;
      const distance = Math.abs(correction);
      const candidate = { delta: rawDeltaBeat + correction, distance };
      if (!best || candidate.distance < best.distance - 1e-9) best = candidate;
    }

    interaction.magnetLastRawDeltaBeat = rawDeltaBeat;
    interaction.magnetLatchedDeltaBeat = best?.delta ?? null;
    return best?.delta ?? null;
  }

  function snapMoveDeltaDirectionally(rawDeltaBeat, interaction) {
    if (!interaction) return null;
    const rawDelta = Number(rawDeltaBeat) || 0;
    const targets = [0];

    // For every blocking note there are only two legitimate placements:
    // 1) blocker is FOLLOWING -> selected trailing edge meets blocker leading edge
    // 2) blocker is PRECEDING -> selected leading edge meets blocker trailing edge
    // We never snap start-to-start or end-to-end, so the wrong side of another note
    // cannot steal the drag.
    for (const blocker of interaction.blockingNotes || []) {
      const blockerStart = Math.max(0, Number(blocker.startBeat) || 0);
      const blockerEnd = blockerStart + Math.max(
        CONFIG.minimumNoteBeat,
        Number(blocker.durationBeat) || CONFIG.minimumNoteBeat,
      );
      targets.push(
        blockerStart - Number(interaction.maxEndBeat),
        blockerEnd - Number(interaction.minStartBeat),
      );
    }
    targets.sort((a, b) => a - b);
    const uniqueTargets = targets.filter((value, index) => index === 0 || Math.abs(value - targets[index - 1]) > 1e-7);

    return resolveMagneticBoundaryBeat(rawDelta, uniqueTargets, interaction, {
      unit: getSnapBeat(),
      latchKey: "magnetLatchedDirectionalDelta",
      lastRawKey: "magnetLastRawDirectionalDelta",
    });
  }

  // Direct piano-roll editing uses overwrite semantics instead of rejecting overlaps.
  // A note that already started before an edited note is trimmed to the edited note's
  // start. Notes whose start falls inside an edited interval are removed. This keeps
  // each editable channel monophonic without making drag operations feel blocked.
  function resolveDirectEditOverlaps(channel, editedNoteIds) {
    if (!channel?.notes?.length) return { trimmed: 0, deleted: 0 };
    const editedIds = editedNoteIds instanceof Set
      ? editedNoteIds
      : new Set(Array.from(editedNoteIds || [], (id) => Number(id)));
    const edited = sortNoteIntervals(channel.notes.filter((note) => editedIds.has(Number(note.id))));
    if (!edited.length) return { trimmed: 0, deleted: 0 };

    const deletedIds = new Set();
    let trimmed = 0;
    for (const blocker of channel.notes) {
      if (editedIds.has(Number(blocker.id))) continue;
      let blockerStart = Number(blocker.startBeat) || 0;
      let blockerEnd = blockerStart + Math.max(CONFIG.minimumNoteBeat, Number(blocker.durationBeat) || CONFIG.minimumNoteBeat);
      for (const candidate of edited) {
        const candidateStart = Number(candidate.startBeat) || 0;
        const candidateEnd = candidateStart + Math.max(CONFIG.minimumNoteBeat, Number(candidate.durationBeat) || CONFIG.minimumNoteBeat);
        if (blockerEnd <= candidateStart + 1e-7 || blockerStart >= candidateEnd - 1e-7) continue;

        if (blockerStart < candidateStart - 1e-7) {
          const nextDuration = candidateStart - blockerStart;
          if (nextDuration >= CONFIG.minimumNoteBeat - 1e-7) {
            blocker.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, nextDuration).toFixed(6));
            blockerEnd = blockerStart + blocker.durationBeat;
            trimmed += 1;
            continue;
          }
        }
        deletedIds.add(blocker.id);
        break;
      }
    }

    if (deletedIds.size) {
      channel.notes = channel.notes.filter((note) => !deletedIds.has(note.id));
      for (const id of deletedIds) state.selectedNoteIds.delete(id);
    }
    state.channelNoteRuntime.delete(String(channel.id));
    return { trimmed, deleted: deletedIds.size };
  }

  function isCancelableNoteInteraction(interaction = state.interaction) {
    return Boolean(interaction && ["create", "move-selection", "resize-note"].includes(interaction.type));
  }

  function cancelCurrentNoteInteraction() {
    const interaction = state.interaction;
    if (!isCancelableNoteInteraction(interaction)) return false;

    stopRollDragAutoScroll();
    if (interaction.type === "move-selection") {
      for (const original of interaction.originals || []) {
        original.note.startBeat = original.startBeat;
        original.note.pitch = original.pitch;
        original.note.durationBeat = original.durationBeat;
      }
    } else if (interaction.type === "resize-note" && interaction.note) {
      interaction.note.startBeat = interaction.originalStartBeat;
      interaction.note.durationBeat = interaction.originalDurationBeat;
    }

    const pointerId = interaction.pointerId;
    state.interaction = null;
    state.suppressContextMenuUntil = performance.now() + 650;
    clearEditorPitchPreview(true);
    if (Number.isFinite(Number(pointerId))) {
      try { elements.rollCanvas.releasePointerCapture(pointerId); } catch {}
    }
    elements.rollCanvas.style.cursor = state.editTool === "select" || state.activePanel !== "notes" ? "default" : "crosshair";
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    return true;
  }

  function normalizeMonophonicNotes(notes) {
    const byStart = new Map();
    for (const raw of notes || []) {
      const dynamics = normalizeNoteDynamics(raw);
      const note = {
        ...raw,
        startBeat: Math.max(0, Number(raw.startBeat) || 0),
        durationBeat: Math.max(CONFIG.minimumNoteBeat, Number(raw.durationBeat) || CONFIG.minimumNoteBeat),
        velocity: dynamics.velocity,
        volume: dynamics.volume,
      };
      const key = note.startBeat.toFixed(6);
      const existing = byStart.get(key);
      const noteStrength = getNotePlaybackVelocity(note);
      const existingStrength = existing ? getNotePlaybackVelocity(existing) : -1;
      if (!existing || noteStrength > existingStrength || (
        noteStrength === existingStrength && note.durationBeat > existing.durationBeat
      )) {
        byStart.set(key, note);
      }
    }
    const selected = [...byStart.values()].sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    const output = [];
    for (let index = 0; index < selected.length; index += 1) {
      const note = { ...selected[index] };
      const nextStart = selected[index + 1]?.startBeat;
      if (Number.isFinite(nextStart) && note.startBeat + note.durationBeat > nextStart + 1e-7) {
        const available = nextStart - note.startBeat;
        if (available < CONFIG.minimumNoteBeat - 1e-7) continue;
        note.durationBeat = Number(available.toFixed(6));
      }
      output.push(note);
    }
    return output;
  }

  function getSelectedNotes(channel = getActiveChannel()) {
    if (!channel?.notes) return [];
    return channel.notes.filter((note) => state.selectedNoteIds.has(note.id));
  }

  function selectOnlyNote(noteId) {
    clearNoteSelection();
    state.selectedNoteIds.add(noteId);
  }

  function selectAllNotes() {
    const channel = state.activePanel === "notes" ? getActiveChannel() : null;
    if (!channel) return false;
    clearNoteSelection();
    for (const note of channel.notes) {
      state.selectedNoteIds.add(note.id);
    }
    drawRoll();
    updateChannelInfo();
    return true;
  }

  function deselectActiveChannel() {
    // 채널은 항상 하나가 선택되어 있어야 하므로 이전 버전의 선택 해제 동작은 더 이상 사용하지 않습니다.
    if (!state.channels.length) state.channels = createDefaultChannels(1);
    state.activePanel = "notes";
    state.activeAudioClipId = null;
    state.activeChannel = clamp(state.activeChannel, 0, state.channels.length - 1);
    clearMidiSelection();
    renderChannelTabs();
    renderChannelEditor();
    return false;
  }

  function selectChannel(index, { toggle = false } = {}) {
    setSidebarTab("channels");
    const nextIndex = clamp(index, 0, state.channels.length - 1);
    // 채널 선택은 항상 하나를 유지합니다. 같은 채널을 다시 눌러도 선택 해제하지 않습니다.
    state.activePanel = "notes";
    state.activeAudioClipId = null;
    state.activeChannel = nextIndex;
    clearNoteSelection();
    clearMidiSelection();
    state.timelineBeats = Math.max(CONFIG.beatsPerMeasure, getMinimumTimelineBeats());
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    scheduleAutosave(250);
    return true;
  }

  function selectMidiReferenceTab() {
    const target = getActiveMidiDocument() || state.midiDocuments[0] || null;
    return target ? selectMidiDocument(target.id) : false;
  }

  function selectMidiDocument(documentId) {
    setSidebarTab("channels");
    const midiDocument = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    if (!midiDocument) {
      return false;
    }
    state.activePanel = "midi";
    state.activeAudioClipId = null;
    setActiveMidiReference(midiDocument);
    state.midiReference.activeGroupId = null;
    clearMidiSelection();
    clearNoteSelection();
    state.timelineBeats = Math.max(
      CONFIG.beatsPerMeasure,
      midiDocument.durationBeats + CONFIG.minimumNoteBeat,
      getViewportVisibleEndBeat(),
    );
    state.playhead.beat = clamp(state.playhead.beat, 0, getTotalBeats());
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    return true;
  }

  function getActiveChannel() {
    return state.channels[state.activeChannel];
  }

  function getChannelById(channelId) {
    return state.channels.find((channel) => String(channel.id) === String(channelId)) || null;
  }

  function setChannelVisibleById(channelId, visible, { notify = true } = {}) {
    const channel = getChannelById(channelId);
    const nextVisible = Boolean(visible);
    if (!channel || channel.visible === nextVisible) return false;
    channel.visible = nextVisible;
    setDirtyWithoutHistory();
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(`${channel.name}을 ${channel.visible ? "표시" : "숨김"} 처리했습니다.`);
    return true;
  }

  function setChannelMutedById(channelId, muted, { notify = true } = {}) {
    const channel = getChannelById(channelId);
    const nextMuted = Boolean(muted);
    if (!channel || channel.muted === nextMuted) return false;
    channel.muted = nextMuted;
    setDirtyWithoutHistory();

    // 재생 자체를 정지/재시작하지 않고 해당 채널의 음원만 갱신합니다.
    if (state.playback.running || state.playback.loading) {
      if (channel.muted) {
        releasePlaybackVoicesForSource(channel.id, { source: "channel" });
      } else {
        schedulePlaybackCatchupForSource(channel.id, { source: "channel" });
      }
      refreshPlaybackVisualsAfterMuteChange();
    }

    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(`${channel.name} ${channel.muted ? "음소거" : "음소거 해제"}`);
    return true;
  }

  function setAllChannelsMuted(muted, { notify = true } = {}) {
    const nextMuted = Boolean(muted);
    let changed = false;
    for (const channel of state.channels) {
      if (channel.muted === nextMuted) continue;
      channel.muted = nextMuted;
      changed = true;
      if (state.playback.running || state.playback.loading) {
        if (nextMuted) releasePlaybackVoicesForSource(channel.id, { source: "channel" });
        else schedulePlaybackCatchupForSource(channel.id, { source: "channel" });
      }
    }
    if (!changed) return false;
    setDirtyWithoutHistory();
    if (state.playback.running || state.playback.loading) refreshPlaybackVisualsAfterMuteChange();
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(nextMuted ? "모든 채널을 음소거했습니다." : "모든 채널의 음소거를 해제했습니다.");
    return true;
  }

  function nextChannelId() {
    return Math.max(0, ...state.channels.map((channel) => Number(channel.id) || 0)) + 1;
  }

  function defaultChannelName(channel) {
    return `Ch${Number(channel?.id) || 1}`;
  }

  function makeUniqueChannelName(name, exceptChannelId = null, usedNames = null) {
    const base = String(name || "").trim() || "Channel";
    const occupied = usedNames || new Set(
      state.channels
        .filter((channel) => String(channel.id) !== String(exceptChannelId))
        .map((channel) => String(channel.name || "").trim().toLocaleLowerCase()),
    );
    let candidate = base;
    let suffix = 2;
    while (occupied.has(candidate.toLocaleLowerCase())) {
      candidate = `${base} (${suffix++})`;
    }
    return candidate;
  }

  function normalizeDefaultChannelNames() {
    const usedNames = new Set();
    const usedIds = new Set();
    let generatedId = Math.max(0, ...state.channels.map((channel) => Number(channel.id) || 0)) + 1;
    state.channels.forEach((channel, index) => {
      let requestedId = Math.max(1, Math.round(Number(channel.id) || index + 1));
      if (usedIds.has(requestedId)) {
        while (usedIds.has(generatedId)) {
          generatedId += 1;
        }
        requestedId = generatedId++;
      }
      channel.id = requestedId;
      usedIds.add(channel.id);
      const currentName = String(channel.name || "").trim();
      const requestedName = !currentName || /^(?:Ch|Channel)\s*\d+$/i.test(currentName)
        ? defaultChannelName(channel)
        : currentName;
      channel.name = makeUniqueChannelName(requestedName, channel.id, usedNames);
      usedNames.add(channel.name.toLocaleLowerCase());
      channel.color = getChannelColor(channel, index);
      channel.muted = Boolean(channel.muted);
      channel.visible = channel.visible !== false;
    });
  }

  function addChannel() {
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    channel.name = makeUniqueChannelName(defaultChannelName(channel), channel.id);
    state.channels.push(channel);
    state.activePanel = "notes";
    state.activeChannel = state.channels.length - 1;
    clearNoteSelection();
    markDirty("채널 추가");
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    showToast(`${channel.name}을 추가했습니다.`);
    return true;
  }

  function getCheckedChannelDeleteIds() {
    if (!elements.channelDeleteList) return [];
    return [...elements.channelDeleteList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => String(input.value));
  }

  function updateChannelDeleteSummary() {
    const ids = getCheckedChannelDeleteIds();
    const remaining = state.channels.length - ids.length;
    const invalid = ids.length === 0;
    if (elements.channelDeleteSummary) {
      elements.channelDeleteSummary.textContent = ids.length === 0
        ? "삭제할 채널을 선택하세요."
        : remaining <= 0
          ? `${ids.length}개 채널 삭제 · 빈 채널 1개 자동 생성`
          : `${ids.length}개 채널 삭제 · ${remaining}개 채널 유지`;
    }
    if (elements.channelDeleteApplyButton) elements.channelDeleteApplyButton.disabled = invalid;
  }

  function renderChannelDeleteDialog() {
    if (!elements.channelDeleteList) return false;
    elements.channelDeleteList.replaceChildren();
    state.channels.forEach((channel, index) => {
      const row = document.createElement("label");
      row.className = "midi-transfer-channel-row channel-delete-row";
      row.style.setProperty("--channel-color", getChannelColor(channel, index));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(channel.id);
      checkbox.checked = false;
      checkbox.setAttribute("aria-label", `${channel.name} 삭제 선택`);
      const text = document.createElement("span");
      text.className = "midi-transfer-channel-name";
      text.textContent = `${channel.name} · ${channel.notes?.length || 0}노트`;
      row.append(checkbox, text);
      checkbox.addEventListener("change", updateChannelDeleteSummary);
      elements.channelDeleteList.append(row);
    });
    updateChannelDeleteSummary();
    return true;
  }

  function openChannelDeleteDialog() {
    if (!renderChannelDeleteDialog()) return false;
    elements.channelDeleteBackdrop.hidden = false;
    requestAnimationFrame(() => elements.channelDeleteList.querySelector('input[type="checkbox"]')?.focus());
    return true;
  }

  function closeChannelDeleteDialog() {
    if (elements.channelDeleteBackdrop) elements.channelDeleteBackdrop.hidden = true;
  }

  function setAllChannelDeleteChecked(checked) {
    if (!elements.channelDeleteList) return;
    elements.channelDeleteList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = Boolean(checked);
    });
    updateChannelDeleteSummary();
  }

  function applyChannelDeleteSelection() {
    const ids = new Set(getCheckedChannelDeleteIds());
    if (!ids.size) return false;
    const activeId = getActiveChannel()?.id;
    const activeOldIndex = state.activeChannel;
    state.channels = state.channels.filter((channel) => !ids.has(String(channel.id)));
    if (!state.channels.length) {
      state.channels = createDefaultChannels(1);
      normalizeDefaultChannelNames();
    }
    let nextIndex = state.channels.findIndex((channel) => String(channel.id) === String(activeId));
    if (nextIndex < 0) nextIndex = clamp(activeOldIndex, 0, state.channels.length - 1);
    state.activePanel = "notes";
    state.activeChannel = nextIndex;
    clearNoteSelection();
    closeChannelDeleteDialog();
    markDirty(`채널 ${ids.size}개 삭제`);
    renderChannelTabs();
    renderChannelEditor();
    shrinkTimelineToContent();
    drawRoll();
    showToast(`${ids.size}개 채널을 삭제했습니다.`);
    return true;
  }

  function deleteChannel(index = state.activeChannel) {
    state.activePanel = "notes";
    const targetIndex = clamp(index, 0, state.channels.length - 1);
    const channel = state.channels[targetIndex];
    const activeChannelId = getActiveChannel()?.id;
    state.channels.splice(targetIndex, 1);
    if (!state.channels.length) {
      state.channels = createDefaultChannels(1);
      normalizeDefaultChannelNames();
      state.activeChannel = 0;
    } else if (activeChannelId === channel.id) {
      state.activeChannel = clamp(targetIndex, 0, state.channels.length - 1);
    } else {
      state.activeChannel = Math.max(0, state.channels.findIndex((item) => item.id === activeChannelId));
    }
    clearNoteSelection();
    markDirty("채널 삭제");
    renderChannelTabs();
    renderChannelEditor();
    shrinkTimelineToContent();
    drawRoll();
    showToast(`${channel.name}을 삭제했습니다.`);
    return true;
  }

  async function requestDeleteChannel(index = state.activeChannel) {
    const targetIndex = clamp(index, 0, state.channels.length - 1);
    const channel = state.channels[targetIndex];
    const confirmed = await showConfirmDialog({
      title: "채널 삭제",
      message: `${channel.name} 채널을 삭제할까요?\n노트 내용도 함께 삭제됩니다.`,
      confirmLabel: "삭제",
    });
    return confirmed ? deleteChannel(targetIndex) : false;
  }

  function getNoteBounds(note) {
    const left = beatToX(note.startBeat);
    const top = pitchToY(note.pitch);
    const width = Math.max(
      5,
      beatToX(note.startBeat + note.durationBeat) - left,
    );
    return {
      left,
      top,
      right: left + width,
      bottom: top + getRowHeight(),
      width,
    };
  }

  function findNoteHitAt(x, y, channelIndex = state.activeChannel) {
    const channel = state.channels[channelIndex];
    if (!channel || channel.visible === false) {
      return null;
    }
    const beat = Math.max(0, xToBeat(x));
    const rawCandidates = getVisibleChannelNotes(channel, beat, beat, channelIndex);
    const candidates = channelIndex === state.activeChannel
      ? [...rawCandidates].sort((left, right) => {
        const leftSelected = state.selectedNoteIds.has(left.id) ? 1 : 0;
        const rightSelected = state.selectedNoteIds.has(right.id) ? 1 : 0;
        return leftSelected - rightSelected || compareNotesByTimeline(left, right);
      })
      : rawCandidates;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const note = candidates[index];
      const bounds = getNoteBounds(note);
      const isSelected = channelIndex === state.activeChannel && state.selectedNoteIds.has(note.id);
      const outerHandlePadding = isSelected ? 4 : 0;
      if (
        x >= bounds.left - outerHandlePadding &&
        x <= bounds.right + outerHandlePadding &&
        y >= bounds.top &&
        y <= bounds.bottom
      ) {
        const innerHandleWidth = Math.min(4, Math.max(1.5, bounds.width * 0.24));
        const leftDistance = Math.abs(x - bounds.left);
        const rightDistance = Math.abs(x - bounds.right);
        const nearLeft = leftDistance <= (x < bounds.left ? outerHandlePadding : innerHandleWidth);
        const nearRight = rightDistance <= (x > bounds.right ? outerHandlePadding : innerHandleWidth);
        if (nearLeft || nearRight) {
          return {
            note,
            part: nearLeft && nearRight
              ? (leftDistance <= rightDistance ? "left-resize" : "right-resize")
              : nearLeft
                ? "left-resize"
                : "right-resize",
            bounds,
          };
        }
        if (x >= bounds.left && x <= bounds.right) {
          return { note, part: "body", bounds };
        }
      }
    }
    return null;
  }

  function findNoteAt(x, y, channelIndex = state.activeChannel) {
    return findNoteHitAt(x, y, channelIndex)?.note || null;
  }

  function findOtherVisibleChannelNoteHitAt(x, y, excludedChannelIndex = state.activeChannel) {
    // 채널은 낮은 인덱스부터 그려지므로 마지막에 그려진 채널부터 역순으로 찾습니다.
    for (let channelIndex = state.channels.length - 1; channelIndex >= 0; channelIndex -= 1) {
      if (channelIndex === excludedChannelIndex || state.channels[channelIndex]?.visible === false) {
        continue;
      }
      const hit = findNoteHitAt(x, y, channelIndex);
      if (hit) {
        return { channelIndex, hit };
      }
    }
    return null;
  }

  function clientToRollPoint(clientX, clientY) {
    const rect = elements.rollViewport.getBoundingClientRect();
    return {
      x: clamp(
        elements.rollViewport.scrollLeft + clientX - rect.left,
        0,
        getRollWidth(),
      ),
      y: clamp(
        elements.rollViewport.scrollTop + clientY - rect.top,
        0,
        getRollHeight() - 1,
      ),
    };
  }

  function pointerToRoll(event) {
    return clientToRollPoint(event.clientX, event.clientY);
  }

  function isRollInteractionDragActive() {
    const interaction = state.interaction;
    if (!interaction) {
      return false;
    }
    if (interaction.type === "create" || interaction.type === "move-selection" || interaction.type === "resize-note") {
      return Boolean(interaction.dragStarted);
    }
    if (interaction.type === "marquee") {
      return Boolean(interaction.moved);
    }
    return false;
  }

  function canAutoExtendRollInteraction() {
    return Boolean(isRollInteractionDragActive() && state.interaction && [
      "create",
      "move-selection",
      "resize-note",
    ].includes(state.interaction.type));
  }

  function ensureTimelineForDragPointer(clientX) {
    if (!canAutoExtendRollInteraction()) {
      return false;
    }
    const rect = elements.rollViewport.getBoundingClientRect();
    const contentX = elements.rollViewport.scrollLeft + clientX - rect.left;
    const requiredBeat = xToBeat(contentX) + CONFIG.timelineExtensionBeats;
    if (requiredBeat < getTotalBeats() - CONFIG.timelineExtensionBeats * 0.25) {
      return false;
    }
    return extendTimelineToBeat(requiredBeat);
  }

  function stopRollDragAutoScroll() {
    cancelAnimationFrame(state.dragAutoScroll.animationFrame);
    state.dragAutoScroll.animationFrame = 0;
  }

  function startRollDragAutoScroll(clientX, clientY) {
    state.dragAutoScroll.clientX = clientX;
    state.dragAutoScroll.clientY = clientY;
    if (!state.dragAutoScroll.animationFrame) {
      state.dragAutoScroll.animationFrame = requestAnimationFrame(runRollDragAutoScroll);
    }
  }

  function getDragAutoScrollDelta(clientX) {
    const rect = elements.rollViewport.getBoundingClientRect();
    const edge = Math.min(CONFIG.dragAutoScrollEdgePixels, rect.width * 0.22);
    if (clientX > rect.right - edge) {
      const ratio = clamp((clientX - (rect.right - edge)) / edge, 0, 1.6);
      return CONFIG.dragAutoScrollMinSpeed
        + (CONFIG.dragAutoScrollMaxSpeed - CONFIG.dragAutoScrollMinSpeed) * ratio;
    }
    if (clientX < rect.left + edge) {
      const ratio = clamp(((rect.left + edge) - clientX) / edge, 0, 1.6);
      return -(CONFIG.dragAutoScrollMinSpeed
        + (CONFIG.dragAutoScrollMaxSpeed - CONFIG.dragAutoScrollMinSpeed) * ratio);
    }
    return 0;
  }

  function runRollDragAutoScroll() {
    state.dragAutoScroll.animationFrame = 0;
    if (!state.interaction) {
      return;
    }

    const delta = isRollInteractionDragActive()
      ? getDragAutoScrollDelta(state.dragAutoScroll.clientX)
      : 0;
    if (Math.abs(delta) > 0.01) {
      if (delta > 0) {
        const requiredRightX = elements.rollViewport.scrollLeft
          + elements.rollViewport.clientWidth
          + CONFIG.timelineExtensionBeats * getQuarterWidth();
        extendTimelineToBeat(xToBeat(requiredRightX));
      }
      const nextScrollLeft = clamp(
        elements.rollViewport.scrollLeft + delta,
        0,
        getMaxScrollLeft(),
      );
      if (Math.abs(nextScrollLeft - elements.rollViewport.scrollLeft) > 0.01) {
        elements.rollViewport.scrollLeft = nextScrollLeft;
        updateRollInteractionAtPoint(
          clientToRollPoint(state.dragAutoScroll.clientX, state.dragAutoScroll.clientY),
          null,
        );
      }
    }

    state.dragAutoScroll.animationFrame = requestAnimationFrame(runRollDragAutoScroll);
  }

  function noteIntersectsBox(note, left, top, right, bottom) {
    const noteLeft = beatToX(note.startBeat);
    const noteTop = pitchToY(note.pitch);
    const noteRight = beatToX(note.startBeat + note.durationBeat);
    const noteBottom = noteTop + getRowHeight();
    return noteRight >= left && noteLeft <= right && noteBottom >= top && noteTop <= bottom;
  }

  function updateMarqueeSelection(interaction) {
    const left = Math.min(interaction.startX, interaction.currentX);
    const right = Math.max(interaction.startX, interaction.currentX);
    const top = Math.min(interaction.startY, interaction.currentY);
    const bottom = Math.max(interaction.startY, interaction.currentY);
    const nextSelection = new Set(interaction.baseSelection);
    for (const note of getActiveChannel().notes) {
      if (noteIntersectsBox(note, left, top, right, bottom)) {
        nextSelection.add(note.id);
      }
    }
    state.selectedNoteIds = nextSelection;
  }

  function beginMarqueeSelection(event, point) {
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    state.interaction = {
      type: "marquee",
      pointerId: event.pointerId,
      pointerButton: event.button,
      startX: Math.max(point.x, beatToX(0)),
      startY: point.y,
      currentX: Math.max(point.x, beatToX(0)),
      currentY: point.y,
      baseSelection: additive ? new Set(state.selectedNoteIds) : new Set(),
      moved: false,
      selectionStarted: false,
    };
    trySetPointerCapture(elements.rollCanvas, event.pointerId);
  }

  function beginNoteCreation(event, point, pointBeat) {
    const unit = getSnapBeat();
    const startBeat = clamp(snapBeat(pointBeat), 0, getTotalBeats() - CONFIG.minimumNoteBeat);
    const directionalBoundaries = buildDirectionalNoteBoundarySnapPoints(
      getActiveChannel(),
      startBeat,
      startBeat,
    );
    // A coarse edit unit must not immediately cover a finer following gap. Only the
    // LEADING edge of a following note is eligible; a preceding note contributes only
    // its TRAILING edge when dragging left.
    const nextBoundary = directionalBoundaries.followingStarts.find((beat) => beat > startBeat + 1e-7);
    const initialEndBeat = nextBoundary != null && nextBoundary < startBeat + unit - 1e-7
      ? nextBoundary
      : Math.min(getTotalBeats(), startBeat + unit);
    const initialDurationBeat = Math.max(CONFIG.minimumNoteBeat, initialEndBeat - startBeat);
    clearNoteSelection();
    state.interaction = {
      type: "create",
      pointerId: event.pointerId,
      pointerButton: event.button,
      anchorBeat: startBeat,
      initialEndBeat,
      draft: {
        startBeat,
        durationBeat: initialDurationBeat,
        pitch: yToPitch(point.y),
      },
      lastPreviewPitch: yToPitch(point.y),
      startX: point.x,
      startY: point.y,
      dragStarted: false,
      magnetPrecedingEnds: directionalBoundaries.precedingEnds,
      magnetFollowingStarts: directionalBoundaries.followingStarts,
      magnetEdgeDirection: 0,
      magnetLastRawBeat: startBeat,
      magnetLatchedBeat: null,
    };
    previewEditorPitch(state.interaction.lastPreviewPitch, { holdVisual: true });
    trySetPointerCapture(elements.rollCanvas, event.pointerId);
  }

  function noteRefIntersectsBox(note, left, top, right, bottom) {
    const bounds = getMidiNoteBounds(note);
    return bounds.right >= left && bounds.left <= right && bounds.bottom >= top && bounds.top <= bottom;
  }

  function updateMidiMarqueeSelection(interaction) {
    const left = Math.min(interaction.startX, interaction.currentX);
    const right = Math.max(interaction.startX, interaction.currentX);
    const top = Math.min(interaction.startY, interaction.currentY);
    const bottom = Math.max(interaction.startY, interaction.currentY);
    const activeGroup = getMidiGroupById(interaction.groupId);
    const next = new Set(interaction.additive ? interaction.baseSelection : []);
    if (!activeGroup || activeGroup.visible === false || getActiveMidiDocument()?.visible === false) {
      state.midiSelectedNoteKeys = next;
      return;
    }
    const startBeat = Math.max(0, xToBeat(left) - CONFIG.minimumNoteBeat);
    const endBeat = Math.max(startBeat, xToBeat(right) + CONFIG.minimumNoteBeat);
    for (const [groupIndex, noteIndex] of getVisibleMidiNoteRefs(startBeat, endBeat)) {
      const group = state.midiReference.groups[groupIndex];
      if (!group || String(group.id) !== String(activeGroup.id)) continue;
      const note = group.notes[noteIndex];
      if (note && noteRefIntersectsBox(note, left, top, right, bottom)) {
        next.add(midiSelectionKey(activeGroup.id, note.id));
      }
    }
    state.midiSelectedNoteKeys = next;
  }

  function handleMidiRollPointerDown(event) {
    const point = pointerToRoll(event);
    const hit = findMidiNoteAt(point.x, point.y);
    if (event.button === 2) {
      if (hit) {
        activateMidiGroupFromRoll(hit.group.id);
        if (!state.midiSelectedNoteKeys.has(midiSelectionKey(hit.group.id, hit.note.id))) {
          selectOnlyMidiNote(hit.group.id, hit.note.id);
        }
        updateMidiReferenceUI();
        renderChannelTabs();
        drawRoll();
      } else if (xToBeat(point.x) >= 0 && getMidiGroupById()) {
        const additive = event.ctrlKey || event.metaKey || event.shiftKey;
        state.interaction = {
          type: "midi-marquee",
          pointerId: event.pointerId,
          pointerButton: event.button,
          groupId: state.midiReference.activeGroupId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          baseSelection: additive ? new Set(state.midiSelectedNoteKeys) : new Set(),
          additive,
          moved: false,
        };
        trySetPointerCapture(elements.rollCanvas, event.pointerId);
      }
      event.preventDefault();
      return;
    }

    if (hit) {
      const switchedGroup = activateMidiGroupFromRoll(hit.group.id);
      const key = midiSelectionKey(hit.group.id, hit.note.id);
      if (switchedGroup) {
        selectOnlyMidiNote(hit.group.id, hit.note.id);
      } else if (event.ctrlKey || event.metaKey || event.shiftKey) {
        if (state.midiSelectedNoteKeys.has(key)) state.midiSelectedNoteKeys.delete(key);
        else state.midiSelectedNoteKeys.add(key);
      } else {
        selectOnlyMidiNote(hit.group.id, hit.note.id);
      }
      previewEditorPitch(hit.note.pitch, { holdVisual: false });
      updateMidiReferenceUI();
      renderChannelTabs();
      drawRoll();
    } else {
      const beat = xToBeat(point.x);
      const activeGroup = getMidiGroupById();
      if (beat >= 0 && state.editTool === "select" && activeGroup) {
        const additive = event.ctrlKey || event.metaKey || event.shiftKey;
        state.interaction = {
          type: "midi-marquee",
          pointerId: event.pointerId,
          pointerButton: event.button,
          groupId: activeGroup.id,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          baseSelection: additive ? new Set(state.midiSelectedNoteKeys) : new Set(),
          additive,
          moved: false,
        };
        trySetPointerCapture(elements.rollCanvas, event.pointerId);
      } else {
        clearMidiSelection();
        if (beat >= 0) setPlayheadBeat(clamp(snapBeat(beat), 0, getTotalBeats()), { stop: true });
        updateMidiReferenceUI();
        drawRoll();
      }
    }
    event.preventDefault();
  }

  function handleRollPointerDown(event) {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    if (event.button === 2 && isCancelableNoteInteraction()) {
      cancelCurrentNoteInteraction();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    elements.rollViewport.focus();
    if (isMidiReferenceActive()) {
      handleMidiRollPointerDown(event);
      return;
    }
    if (state.activePanel === "audio") {
      const point = pointerToRoll(event);
      const beat = xToBeat(point.x);
      if (beat >= 0) setPlayheadBeat(clamp(snapBeat(beat), 0, getTotalBeats()), { stop: true });
      event.preventDefault();
      return;
    }
    if (state.activePanel === "none") {
      const point = pointerToRoll(event);
      const beat = xToBeat(point.x);
      if (event.button === 0 && state.editTool === "select") {
        const otherChannelHit = findOtherVisibleChannelNoteHitAt(point.x, point.y, -1);
        if (otherChannelHit) {
          selectChannel(otherChannelHit.channelIndex);
          selectOnlyNote(otherChannelHit.hit.note.id);
          previewEditorPitch(otherChannelHit.hit.note.pitch, { holdVisual: false });
          drawRoll();
          updateChannelInfo();
          event.preventDefault();
          return;
        }
      }
      if (beat >= 0 && event.button === 0) {
        setPlayheadBeat(clamp(snapBeat(beat), 0, getTotalBeats()), { stop: true });
      }
      event.preventDefault();
      return;
    }
    const point = pointerToRoll(event);
    const pointBeat = xToBeat(point.x);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const touchSelectionMode = state.editTool === "select" && event.button === 0;

    let noteHit = findNoteHitAt(point.x, point.y);
    // 선택 도구에서 아무 노트도 선택되지 않았다면, 현재 채널 뒤에 비쳐 보이는
    // 다른 편집 채널의 노트를 직접 눌러 그 채널로 이동할 수 있습니다.
    if (touchSelectionMode && state.selectedNoteIds.size === 0 && !noteHit) {
      const otherChannelHit = findOtherVisibleChannelNoteHitAt(point.x, point.y);
      if (otherChannelHit) {
        selectChannel(otherChannelHit.channelIndex);
        noteHit = otherChannelHit.hit;
      }
    }
    const existing = noteHit?.note || null;

    if (getActiveChannel()?.visible === false && event.button === 0 && pointBeat >= 0 && !existing) {
      showToast("숨긴 채널은 표시 버튼을 켠 뒤 편집할 수 있습니다.");
      event.preventDefault();
      return;
    }

    // 오른쪽 드래그는 빈 영역의 범위 선택에만 사용합니다. 노트 위의 우클릭은 노트 메뉴를 엽니다.
    if (event.button === 2) {
      if (existing) {
        if (!state.selectedNoteIds.has(existing.id)) {
          selectOnlyNote(existing.id);
          drawRoll();
          updateChannelInfo();
        }
      } else if (pointBeat >= 0) {
        beginMarqueeSelection(event, point);
      } else {
        clearNoteSelection();
        drawRoll();
        updateChannelInfo();
      }
      return;
    }
    if (existing) {
      if (additive) {
        previewEditorPitch(existing.pitch, { holdVisual: false });
        if (state.selectedNoteIds.has(existing.id)) {
          state.selectedNoteIds.delete(existing.id);
        } else {
          state.selectedNoteIds.add(existing.id);
        }
        drawRoll();
        updateChannelInfo();
        event.preventDefault();
        return;
      }

      const wasSelected = state.selectedNoteIds.has(existing.id);
      if (!wasSelected) {
        if (touchSelectionMode) {
          state.selectedNoteIds.add(existing.id);
        } else {
          selectOnlyNote(existing.id);
        }
      }
      previewEditorPitch(existing.pitch, { holdVisual: true });

      if (noteHit.part === "left-resize" || noteHit.part === "right-resize") {
        const snapUnit = getSnapBeat();
        state.interaction = {
          type: "resize-note",
          pointerId: event.pointerId,
          pointerButton: event.button,
          edge: noteHit.part === "left-resize" ? "left" : "right",
          note: existing,
          startX: point.x,
          moved: false,
          snapUnit,
          originalStartBeat: existing.startBeat,
          originalDurationBeat: existing.durationBeat,
          originalEndBeat: existing.startBeat + existing.durationBeat,
          minimumDurationBeat: CONFIG.minimumNoteBeat,
          blockingNotes: sortNoteIntervals(getActiveChannel().notes.filter((note) => note.id !== existing.id)),
          ...(() => {
            const directional = buildDirectionalNoteBoundarySnapPoints(
              getActiveChannel(),
              existing.startBeat,
              existing.startBeat + existing.durationBeat,
              new Set([existing.id]),
            );
            return {
              magnetPrecedingEnds: directional.precedingEnds,
              magnetFollowingStarts: directional.followingStarts,
            };
          })(),
          magnetLastRawBeat: noteHit.part === "left-resize"
            ? existing.startBeat
            : existing.startBeat + existing.durationBeat,
          magnetLatchedBeat: null,
          lastValidStartBeat: existing.startBeat,
          lastValidDurationBeat: existing.durationBeat,
          pointerBeatOffset: xToBeat(point.x) - (
            noteHit.part === "left-resize"
              ? existing.startBeat
              : existing.startBeat + existing.durationBeat
          ),
          dragStarted: false,
        };
      } else {
        const selected = getSelectedNotes();
        state.interaction = {
          type: "move-selection",
          pointerId: event.pointerId,
          pointerButton: event.button,
          startX: point.x,
          startY: point.y,
          moved: false,
          originals: selected.map((note) => ({
            note,
            startBeat: note.startBeat,
            pitch: note.pitch,
            durationBeat: note.durationBeat,
          })),
          minStartBeat: Math.min(...selected.map((note) => note.startBeat)),
          maxEndBeat: Math.max(...selected.map((note) => note.startBeat + note.durationBeat)),
          minPitch: Math.min(...selected.map((note) => note.pitch)),
          maxPitch: Math.max(...selected.map((note) => note.pitch)),
          anchorOriginalStartBeat: existing.startBeat,
          pointerBeatOffset: xToBeat(point.x) - existing.startBeat,
          previewOriginalPitch: existing.pitch,
          lastPreviewPitch: existing.pitch,
          dragStarted: false,
          toggleSelectionOnTap: touchSelectionMode && wasSelected,
          clickedNoteId: existing.id,
          selectedIds: new Set(selected.map((note) => note.id)),
          blockingNotes: sortNoteIntervals(getActiveChannel().notes.filter((note) => !state.selectedNoteIds.has(note.id))),
          ...(() => {
            const minStartBeat = Math.min(...selected.map((note) => note.startBeat));
            const maxEndBeat = Math.max(...selected.map((note) => note.startBeat + note.durationBeat));
            const directional = buildDirectionalNoteBoundarySnapPoints(
              getActiveChannel(),
              minStartBeat,
              maxEndBeat,
              new Set(selected.map((note) => note.id)),
            );
            return {
              magnetPrecedingEnds: directional.precedingEnds,
              magnetFollowingStarts: directional.followingStarts,
            };
          })(),
          magnetMoveDirection: 0,
          magnetLastRawDirectionalDelta: 0,
          magnetLatchedDirectionalDelta: 0,
          lastValidDeltaBeat: 0,
          lastValidPitchDelta: 0,
        };
      }
      trySetPointerCapture(elements.rollCanvas, event.pointerId);
    } else if (pointBeat >= 0) {
      if (state.editTool === "select") {
        beginMarqueeSelection(event, point);
      } else {
        // 노트 도구의 빈 편집 영역 클릭/드래그는 현재 음표 단위로 노트를 배치합니다.
        beginNoteCreation(event, point, pointBeat);
      }
    } else {
      // 앞쪽 고정 공백은 클릭해도 노트를 만들지 않습니다.
      return;
    }

    if (state.interaction) {
      startRollDragAutoScroll(event.clientX, event.clientY);
    }
    drawRoll();
    updateChannelInfo();
    event.preventDefault();
  }

  function updateRollInteractionAtPoint(point, event = null) {
    if (!state.interaction) {
      if (isMidiReferenceActive()) {
        elements.rollCanvas.style.cursor = findMidiNoteAt(point.x, point.y) ? "pointer" : "default";
        return;
      }
      const noteHit = findNoteHitAt(point.x, point.y);
      elements.rollCanvas.style.cursor = noteHit?.part === "left-resize" || noteHit?.part === "right-resize"
        ? "ew-resize"
        : noteHit?.part === "body"
          ? "grab"
          : state.editTool === "select" ? "default" : "crosshair";
      return;
    }

    if (state.interaction.type === "create") {
      if (!state.interaction.dragStarted && Math.hypot(
        point.x - state.interaction.startX,
        point.y - state.interaction.startY,
      ) >= 2) {
        state.interaction.dragStarted = true;
      }
      const unit = getSnapBeat();
      const rawCurrentBeat = xToBeat(point.x);
      const anchorBeat = state.interaction.anchorBeat;
      const edgeDirection = rawCurrentBeat >= anchorBeat ? 1 : -1;
      if (state.interaction.magnetEdgeDirection !== edgeDirection) {
        state.interaction.magnetEdgeDirection = edgeDirection;
        state.interaction.magnetLatchedBeat = null;
        state.interaction.magnetLastRawBeat = anchorBeat;
      }
      const directionalBoundaries = edgeDirection > 0
        ? state.interaction.magnetFollowingStarts
        : state.interaction.magnetPrecedingEnds;
      const magneticBeat = resolveMagneticBoundaryBeat(
        rawCurrentBeat,
        directionalBoundaries,
        state.interaction,
        { unit },
      );
      let start;
      let end;
      const useMagneticEdge = state.interaction.dragStarted && magneticBeat != null;
      if (useMagneticEdge && rawCurrentBeat >= anchorBeat && magneticBeat > anchorBeat + 1e-7) {
        // A note boundary may be finer than the current edit unit. When the pointer
        // catches it, use that exact boundary as the dragged right edge.
        start = anchorBeat;
        end = clamp(magneticBeat, anchorBeat + CONFIG.minimumNoteBeat, getTotalBeats());
      } else if (useMagneticEdge && rawCurrentBeat < anchorBeat && magneticBeat < anchorBeat - 1e-7) {
        // Dragging left can catch only the trailing edge of a preceding note. Keep
        // the click-created right edge intact so a finer following gap is preserved.
        start = clamp(magneticBeat, 0, state.interaction.initialEndBeat - CONFIG.minimumNoteBeat);
        end = state.interaction.initialEndBeat;
      } else {
        const currentBeat = clamp(snapBeat(rawCurrentBeat), 0, getTotalBeats() - unit);
        start = Math.min(anchorBeat, currentBeat);
        end = Math.min(
          getTotalBeats(),
          Math.max(anchorBeat + unit, currentBeat + unit),
        );
      }
      state.interaction.draft.startBeat = Number(start.toFixed(6));
      state.interaction.draft.durationBeat = Number(
        Math.max(useMagneticEdge ? CONFIG.minimumNoteBeat : unit, end - start).toFixed(6),
      );
      const nextPitch = yToPitch(point.y);
      state.interaction.draft.pitch = nextPitch;
      if (nextPitch !== state.interaction.lastPreviewPitch) {
        state.interaction.lastPreviewPitch = nextPitch;
        previewEditorPitch(nextPitch, { holdVisual: true });
      }
    } else if (state.interaction.type === "midi-marquee") {
      state.interaction.currentX = Math.max(point.x, beatToX(0));
      state.interaction.currentY = point.y;
      if (Math.abs(state.interaction.currentX - state.interaction.startX) >= 3 || Math.abs(state.interaction.currentY - state.interaction.startY) >= 3) {
        state.interaction.moved = true;
        state.suppressContextMenuUntil = performance.now() + 600;
        closeContextMenu();
        updateMidiMarqueeSelection(state.interaction);
        event?.preventDefault();
      }
      updateMidiSelectionUI();
      drawRoll();
    } else if (state.interaction.type === "marquee") {
      state.interaction.currentX = Math.max(point.x, beatToX(0));
      state.interaction.currentY = point.y;
      if (
        Math.abs(state.interaction.currentX - state.interaction.startX) >= 3 ||
        Math.abs(state.interaction.currentY - state.interaction.startY) >= 3
      ) {
        if (!state.interaction.selectionStarted) {
          state.selectedNoteIds = new Set(state.interaction.baseSelection);
          state.interaction.selectionStarted = true;
        }
        state.interaction.moved = true;
        state.suppressContextMenuUntil = performance.now() + 600;
        closeContextMenu();
        updateMarqueeSelection(state.interaction);
        event?.preventDefault();
      }
    } else if (state.interaction.type === "resize-note") {
      const interaction = state.interaction;
      if (!interaction.dragStarted && Math.abs(point.x - interaction.startX) < 2) {
        return;
      }
      interaction.dragStarted = true;

      const rawEdgeBeat = xToBeat(point.x) - interaction.pointerBeatOffset;
      const edgeBoundaries = interaction.edge === "left"
        ? mergeNoteBoundarySnapPoints(interaction.magnetPrecedingEnds, [interaction.originalStartBeat])
        : mergeNoteBoundarySnapPoints(interaction.magnetFollowingStarts, [interaction.originalEndBeat]);
      const magneticEdgeBeat = resolveMagneticBoundaryBeat(
        rawEdgeBeat,
        edgeBoundaries,
        interaction,
        { unit: interaction.snapUnit },
      );
      const snappedEdgeBeat = magneticEdgeBeat == null
        ? snapBeatToUnit(rawEdgeBeat, interaction.snapUnit)
        : magneticEdgeBeat;

      let candidateStartBeat = interaction.note.startBeat;
      let candidateDurationBeat = interaction.note.durationBeat;
      if (interaction.edge === "left") {
        // Do NOT quantize the resize limit to the edit unit.  The original note may
        // be shorter than the active unit (e.g. original 1/8 while editing in 1/4),
        // and its exact original edge must remain reachable.
        const maximumStartBeat = Math.max(
          0,
          interaction.originalEndBeat - interaction.minimumDurationBeat,
        );
        candidateStartBeat = clamp(snappedEdgeBeat, 0, maximumStartBeat);
        candidateDurationBeat = interaction.originalEndBeat - candidateStartBeat;
      } else {
        const minimumEndBeat = Math.min(
          getTotalBeats(),
          interaction.originalStartBeat + interaction.minimumDurationBeat,
        );
        const targetEndBeat = clamp(snappedEdgeBeat, minimumEndBeat, getTotalBeats());
        candidateStartBeat = interaction.originalStartBeat;
        candidateDurationBeat = targetEndBeat - interaction.originalStartBeat;
      }
      const candidate = {
        ...interaction.note,
        startBeat: Number(candidateStartBeat.toFixed(6)),
        durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, candidateDurationBeat).toFixed(6)),
      };
      interaction.note.startBeat = candidate.startBeat;
      interaction.note.durationBeat = candidate.durationBeat;
      interaction.lastValidStartBeat = candidate.startBeat;
      interaction.lastValidDurationBeat = candidate.durationBeat;

      interaction.moved = interaction.moved
        || Math.abs(interaction.note.startBeat - interaction.originalStartBeat) > 1e-7
        || Math.abs(interaction.note.durationBeat - interaction.originalDurationBeat) > 1e-7;
      elements.rollCanvas.style.cursor = "ew-resize";
    } else if (state.interaction.type === "move-selection") {
      const interaction = state.interaction;
      const pixelDistance = Math.hypot(point.x - interaction.startX, point.y - interaction.startY);
      if (!interaction.dragStarted && pixelDistance < 3) {
        return;
      }
      interaction.dragStarted = true;

      const rawAnchorBeat = xToBeat(point.x) - interaction.pointerBeatOffset;
      const rawRequestedDeltaBeat = rawAnchorBeat - interaction.anchorOriginalStartBeat;
      const magneticDeltaBeat = snapMoveDeltaDirectionally(rawRequestedDeltaBeat, interaction);
      const snappedAnchorBeat = snapBeat(rawAnchorBeat);
      const requestedDeltaBeat = magneticDeltaBeat == null
        ? snappedAnchorBeat - interaction.anchorOriginalStartBeat
        : magneticDeltaBeat;
      const deltaBeat = clamp(
        requestedDeltaBeat,
        -interaction.minStartBeat,
        getTotalBeats() - interaction.maxEndBeat,
      );
      const requestedPitchDelta = -Math.round((point.y - interaction.startY) / getRowHeight());
      const pitchDelta = clamp(
        requestedPitchDelta,
        CONFIG.minPitch - interaction.minPitch,
        CONFIG.maxPitch - interaction.maxPitch,
      );

      const candidates = interaction.originals.map((original) => ({
        ...original.note,
        startBeat: Number((original.startBeat + deltaBeat).toFixed(6)),
        durationBeat: original.durationBeat,
        pitch: original.pitch + pitchDelta,
      }));
      interaction.originals.forEach((original, index) => {
        original.note.startBeat = candidates[index].startBeat;
        original.note.pitch = candidates[index].pitch;
      });
      interaction.lastValidDeltaBeat = deltaBeat;
      interaction.lastValidPitchDelta = pitchDelta;
      const appliedPitchDelta = interaction.lastValidPitchDelta;
      const appliedDeltaBeat = interaction.lastValidDeltaBeat;
      const previewPitch = interaction.previewOriginalPitch + appliedPitchDelta;
      if (previewPitch !== interaction.lastPreviewPitch) {
        interaction.lastPreviewPitch = previewPitch;
        previewEditorPitch(previewPitch, { holdVisual: true });
      }
      interaction.moved = interaction.moved || Math.abs(appliedDeltaBeat) > 1e-7 || appliedPitchDelta !== 0;
      elements.rollCanvas.style.cursor = "grabbing";
    }

    drawRoll();
    if (state.interaction?.type === "marquee") {
      updateChannelInfo();
    } else if (state.interaction?.type === "midi-marquee") {
      updateMidiSelectionUI();
    }
  }

  function handleRollPointerMove(event) {
    if (state.interaction && state.interaction.pointerId !== event.pointerId) {
      return;
    }
    if (state.interaction) {
      state.dragAutoScroll.clientX = event.clientX;
      state.dragAutoScroll.clientY = event.clientY;
    }
    updateRollInteractionAtPoint(pointerToRoll(event), event);
    if (state.interaction && ensureTimelineForDragPointer(event.clientX)) {
      updateRollInteractionAtPoint(pointerToRoll(event), event);
    }
  }

  function handleRollPointerUp(event) {
    if (state.suppressNextRollPointerUp === event.pointerId) {
      state.suppressNextRollPointerUp = null;
      event.preventDefault();
      return;
    }
    if (!state.interaction || state.interaction.pointerId !== event.pointerId) {
      return;
    }

    const interaction = state.interaction;
    stopRollDragAutoScroll();
    if (interaction.pointerButton === 0 && interaction.type !== "marquee" && interaction.type !== "midi-marquee") {
      endEditorPitchPreview();
    }
    if (interaction.type === "create") {
      const draft = interaction.draft;
      const note = {
        id: state.nextNoteId++,
        pitch: draft.pitch,
        startBeat: Number(draft.startBeat.toFixed(6)),
        durationBeat: Number(draft.durationBeat.toFixed(6)),
        velocity: 127,
        volume: 15,
      };
      const channel = getActiveChannel();
      channel.notes.push(note);
      resolveDirectEditOverlaps(channel, new Set([note.id]));
      selectOnlyNote(note.id);
      markDirty("노트 추가");
    } else if (
      (interaction.type === "move-selection" || interaction.type === "resize-note") &&
      interaction.moved
    ) {
      const channel = getActiveChannel();
      const editedIds = interaction.type === "resize-note"
        ? new Set([interaction.note.id])
        : new Set((interaction.originals || []).map((original) => original.note.id));
      resolveDirectEditOverlaps(channel, editedIds);
      markDirty(interaction.type === "resize-note" ? "노트 길이 변경" : "노트 이동");
    } else if (interaction.type === "move-selection" && interaction.toggleSelectionOnTap) {
      state.selectedNoteIds.delete(interaction.clickedNoteId);
    } else if (interaction.type === "midi-marquee" && interaction.moved) {
      state.suppressContextMenuUntil = performance.now() + 600;
      closeContextMenu();
      updateMidiReferenceUI();
    } else if (interaction.type === "midi-marquee") {
      clearMidiSelection();
      updateMidiReferenceUI();
      closeContextMenu();
    } else if (interaction.type === "marquee" && interaction.moved) {
      state.suppressContextMenuUntil = performance.now() + 600;
      closeContextMenu();
    } else if (interaction.type === "marquee") {
      clearNoteSelection();
      closeContextMenu();
    }

    state.interaction = null;
    elements.rollCanvas.style.cursor = isMidiReferenceActive() || state.editTool === "select" ? "default" : "crosshair";
    try {
      elements.rollCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
  }


  const MML_NOTE_SEMITONES = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
  };

  function removeMmlComments(source) {
    return String(source || "")
      .replace(/^\uFEFF/, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");
  }

  function extractMmlBody(source) {
    const cleaned = removeMmlComments(source).trim();
    if (!cleaned) {
      throw new Error("불러올 MML 내용이 없습니다.");
    }
    const wrapper = /MML\s*@/i.exec(cleaned);
    if (!wrapper) {
      return cleaned.replace(/;+\s*$/, "").trim();
    }
    const start = wrapper.index + wrapper[0].length;
    const end = cleaned.indexOf(";", start);
    return cleaned.slice(start, end >= 0 ? end : cleaned.length).trim();
  }

  function readMmlUnsignedInteger(text, startIndex) {
    let index = startIndex;
    while (index < text.length && /[0-9]/.test(text[index])) index += 1;
    if (index === startIndex) return { value: null, nextIndex: startIndex };
    return {
      value: Number(text.slice(startIndex, index)),
      nextIndex: index,
    };
  }

  function readMmlLength(text, startIndex, defaultLengthBeat, { requireNumber = false } = {}) {
    const numeric = readMmlUnsignedInteger(text, startIndex);
    if (requireNumber && numeric.value == null) {
      return { value: null, nextIndex: startIndex };
    }
    if (numeric.value != null && numeric.value <= 0) {
      return { value: null, nextIndex: numeric.nextIndex };
    }
    let length = numeric.value == null ? defaultLengthBeat : 4 / numeric.value;
    let index = numeric.nextIndex;
    let addition = length / 2;
    while (text[index] === ".") {
      length += addition;
      addition /= 2;
      index += 1;
    }
    return { value: length, nextIndex: index };
  }

  function parseMmlPart(partText, partIndex) {
    const text = String(partText || "");
    const notes = [];
    const tempos = [];
    let cursorBeat = 0;
    let octave = 4;
    let defaultLengthBeat = 1;
    let volume = 8;
    let tiePending = false;
    let previousNote = null;
    let unsupportedTokenCount = 0;
    let skippedPitchCount = 0;
    let tempoOrder = 0;

    const addNote = (pitch, durationBeat) => {
      const startBeat = cursorBeat;
      const duration = Math.max(1e-8, Number(durationBeat) || defaultLengthBeat);
      if (pitch < CONFIG.minPitch || pitch > CONFIG.maxPitch) {
        skippedPitchCount += 1;
        cursorBeat += duration;
        previousNote = null;
        tiePending = false;
        return;
      }
      const velocity = mmlVolumeToVelocity(volume);
      if (
        tiePending
        && previousNote
        && previousNote.pitch === pitch
        && Math.abs(previousNote.startBeat + previousNote.durationBeat - startBeat) < 1e-7
      ) {
        previousNote.durationBeat += duration;
      } else {
        previousNote = {
          pitch,
          startBeat,
          durationBeat: duration,
          velocity,
          volume,
        };
        notes.push(previousNote);
      }
      cursorBeat += duration;
      tiePending = false;
    };

    for (let index = 0; index < text.length;) {
      const rawCharacter = text[index];
      const character = rawCharacter.toLowerCase();
      if (/\s/.test(rawCharacter)) {
        index += 1;
        continue;
      }
      if (rawCharacter === ";") break;
      if (rawCharacter === "&") {
        tiePending = true;
        index += 1;
        continue;
      }
      if (rawCharacter === ">") {
        octave = clamp(octave + 1, 0, 8);
        index += 1;
        continue;
      }
      if (rawCharacter === "<") {
        octave = clamp(octave - 1, 0, 8);
        index += 1;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(MML_NOTE_SEMITONES, character) || character === "r") {
        index += 1;
        let accidental = 0;
        if (character !== "r") {
          while (text[index] === "+" || text[index] === "#" || text[index] === "-") {
            accidental += text[index] === "-" ? -1 : 1;
            index += 1;
          }
        }
        const length = readMmlLength(text, index, defaultLengthBeat);
        index = length.nextIndex;
        const duration = length.value ?? defaultLengthBeat;
        if (character === "r") {
          cursorBeat += duration;
          previousNote = null;
          tiePending = false;
        } else {
          const pitch = (octave + 1) * 12 + MML_NOTE_SEMITONES[character] + accidental;
          addNote(pitch, duration);
        }
        continue;
      }
      if (character === "n") {
        const numeric = readMmlUnsignedInteger(text, index + 1);
        if (numeric.value == null) {
          unsupportedTokenCount += 1;
          index += 1;
          continue;
        }
        index = numeric.nextIndex;
        addNote(Math.round(numeric.value), defaultLengthBeat);
        continue;
      }
      if (character === "o") {
        const numeric = readMmlUnsignedInteger(text, index + 1);
        if (numeric.value == null) {
          unsupportedTokenCount += 1;
          index += 1;
        } else {
          octave = clamp(Math.round(numeric.value), 0, 8);
          index = numeric.nextIndex;
        }
        continue;
      }
      if (character === "l") {
        const length = readMmlLength(text, index + 1, defaultLengthBeat, { requireNumber: true });
        if (length.value == null) {
          unsupportedTokenCount += 1;
          index += 1;
        } else {
          defaultLengthBeat = length.value;
          index = length.nextIndex;
        }
        continue;
      }
      if (character === "v") {
        const numeric = readMmlUnsignedInteger(text, index + 1);
        if (numeric.value == null) {
          unsupportedTokenCount += 1;
          index += 1;
        } else {
          volume = clamp(Math.round(numeric.value), 0, 15);
          index = numeric.nextIndex;
        }
        continue;
      }
      if (character === "t") {
        const numeric = readMmlUnsignedInteger(text, index + 1);
        if (numeric.value == null) {
          unsupportedTokenCount += 1;
          index += 1;
        } else {
          tempos.push({
            beat: cursorBeat,
            bpm: clamp(Math.round(numeric.value), CONFIG.minTempo, CONFIG.maxTempo),
            partIndex,
            order: tempoOrder++,
          });
          index = numeric.nextIndex;
        }
        continue;
      }
      if (["q", "p", "m", "s", "@"].includes(character)) {
        const numeric = readMmlUnsignedInteger(text, index + 1);
        index = numeric.value == null ? index + 1 : numeric.nextIndex;
        unsupportedTokenCount += 1;
        continue;
      }
      if (/[0-9]/.test(rawCharacter)) {
        index = readMmlUnsignedInteger(text, index).nextIndex;
        unsupportedTokenCount += 1;
        continue;
      }
      unsupportedTokenCount += 1;
      index += 1;
    }

    return {
      partIndex,
      notes,
      tempos,
      durationBeat: cursorBeat,
      unsupportedTokenCount,
      skippedPitchCount,
    };
  }

  function getMmlQuantizeUnit(denominator) {
    return 4 / (Number(denominator) === 32 ? 32 : 64);
  }

  function quantizeMmlPartNotes(notes, denominator) {
    const unit = getMmlQuantizeUnit(denominator);
    const byStart = new Map();
    for (const raw of notes || []) {
      const startBeat = Math.max(0, snapBeatToUnit(Number(raw.startBeat) || 0, unit));
      const rawEnd = Math.max(Number(raw.startBeat) || 0, (Number(raw.startBeat) || 0) + Math.max(0, Number(raw.durationBeat) || 0));
      const endBeat = Math.max(startBeat + unit, snapBeatToUnit(rawEnd, unit));
      const dynamics = normalizeNoteDynamics(raw, 8);
      const note = {
        pitch: clamp(Math.round(Number(raw.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
        startBeat: Number(startBeat.toFixed(6)),
        durationBeat: Number((endBeat - startBeat).toFixed(6)),
        velocity: dynamics.velocity,
        volume: dynamics.volume,
      };
      const key = note.startBeat.toFixed(6);
      const existing = byStart.get(key);
      const strength = getNotePlaybackVelocity(note);
      const existingStrength = existing ? getNotePlaybackVelocity(existing) : -1;
      if (!existing || strength > existingStrength || (
        strength === existingStrength && note.durationBeat > existing.durationBeat
      )) {
        byStart.set(key, note);
      }
    }

    const sorted = [...byStart.values()].sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    const output = [];
    for (let index = 0; index < sorted.length; index += 1) {
      const note = { ...sorted[index] };
      const nextStart = sorted[index + 1]?.startBeat;
      let endBeat = note.startBeat + note.durationBeat;
      if (Number.isFinite(nextStart) && endBeat > nextStart + 1e-7) {
        endBeat = nextStart;
      }
      if (endBeat - note.startBeat < unit - 1e-7) continue;
      note.durationBeat = Number((endBeat - note.startBeat).toFixed(6));
      output.push(note);
    }
    return output;
  }

  function quantizeMmlTempoEvents(parts, denominator) {
    const unit = getMmlQuantizeUnit(denominator);
    const byBeat = new Map();
    const events = parts.flatMap((part) => part.tempos || []).sort((left, right) => (
      left.beat - right.beat
      || left.partIndex - right.partIndex
      || left.order - right.order
    ));
    for (const event of events) {
      const beat = Math.max(0, snapBeatToUnit(Number(event.beat) || 0, unit));
      const key = beat.toFixed(6);
      const existing = byBeat.get(key);
      if (
        !existing
        || event.partIndex < existing.partIndex
        || (event.partIndex === existing.partIndex && event.order > existing.order)
      ) {
        byBeat.set(key, {
          beat: Number(beat.toFixed(6)),
          bpm: clamp(Math.round(Number(event.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
          partIndex: event.partIndex,
          order: event.order,
        });
      }
    }
    const tempos = [...byBeat.values()]
      .sort((left, right) => left.beat - right.beat)
      .map(({ beat, bpm }) => ({ beat, bpm, fixed: beat === 0 }));
    if (!tempos.some((tempo) => Math.abs(tempo.beat) < 1e-7)) {
      tempos.unshift({ beat: 0, bpm: 120, fixed: true });
    } else {
      tempos[0].beat = 0;
      tempos[0].fixed = true;
    }
    return tempos;
  }

  function parseMmlText(source, { quantize = 64 } = {}) {
    const body = extractMmlBody(source);
    const rawParts = body.split(",");
    const parsedParts = rawParts.map((part, partIndex) => parseMmlPart(part, partIndex));
    const noteParts = parsedParts
      .map((part) => ({
        ...part,
        notes: quantizeMmlPartNotes(part.notes, quantize),
      }))
      .filter((part) => part.notes.length);
    const explicitTempoCount = parsedParts.reduce((count, part) => count + part.tempos.length, 0);
    const tempos = quantizeMmlTempoEvents(parsedParts, quantize);
    const noteCount = noteParts.reduce((count, part) => count + part.notes.length, 0);
    const endBeat = Math.max(
      0,
      ...noteParts.flatMap((part) => part.notes.map((note) => note.startBeat + note.durationBeat)),
      ...tempos.map((tempo) => tempo.beat),
    );
    return {
      quantize: Number(quantize) === 32 ? 32 : 64,
      rawPartCount: rawParts.length,
      noteParts,
      tempos,
      explicitTempoCount,
      noteCount,
      endBeat,
      unsupportedTokenCount: parsedParts.reduce((count, part) => count + part.unsupportedTokenCount, 0),
      skippedPitchCount: parsedParts.reduce((count, part) => count + part.skippedPitchCount, 0),
    };
  }

  function decodeTextFileBytes(data) {
    if (typeof data === "string") return data;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes);
    }
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementCount > 0) {
      for (const encoding of ["shift_jis", "windows-31j", "euc-kr"]) {
        try {
          const decoded = new TextDecoder(encoding).decode(bytes);
          if ((decoded.match(/\uFFFD/g) || []).length < replacementCount) return decoded;
        } catch {
          // Some browsers do not expose every legacy decoder.
        }
      }
    }
    return utf8;
  }

  function cleanupThreeMleName(value) {
    return String(value || "")
      .replace(/^\s*["']|["']\s*$/g, "")
      .replace(/[\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function extractThreeMleSectionBlock(text, sectionName) {
    const source = String(text || "");
    const escaped = String(sectionName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const header = new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im").exec(source);
    if (!header) return "";
    const start = header.index + header[0].length;
    const nextHeader = /^\s*\[[^\]]+\]\s*$/gim;
    nextHeader.lastIndex = start;
    const next = nextHeader.exec(source);
    return source.slice(start, next ? next.index : source.length);
  }

  function cleanupThreeMleMmlCode(value) {
    let source = String(value || "");
    source = source.replace(/\bEXx[^\s]*/gi, "");
    source = source.replace(/[Yy]\s*\d+\s*,\s*-?\d+/g, "");
    source = source.replace(/@\s*-?\d+/g, "");
    source = source.replace(/~\s*-?\d+(?:\s*,\s*-?\d+)*/g, "");
    source = source.replace(/[Vv]\s*(\d+)/g, (_, raw) => {
      const numeric = Math.max(0, Number(raw) || 0);
      const volume = numeric > 15 ? velocityToMmlVolume(Math.min(127, numeric)) : clamp(Math.round(numeric), 0, 15);
      return `v${volume}`;
    });
    source = source.replace(/[^cdefgabronltv<>+#\-&.0-9\s]/gi, "");
    return source.replace(/\s+/g, "").trim();
  }

  function cleanupThreeMleMmlLine(line) {
    let source = String(line || "");
    if (!source.trim() || /^\s*\/\//.test(source)) return "";
    source = source.replace(/^\s*\/\*\s*M\s*\d+\s*\*\/\s*/i, "");
    source = source.replace(/\/\*[\s\S]*?\*\//g, "");
    source = source.replace(/\/\/.*$/g, "");
    return cleanupThreeMleMmlCode(source);
  }

  function extractThreeMleGlobalTempo(text) {
    const source = String(text || "");
    const scanSources = [extractThreeMleSectionBlock(source, "Channel1"), source].filter(Boolean);
    for (const scanSource of scanSources) {
      for (const line of String(scanSource).split(/\r?\n/)) {
        const cleaned = cleanupThreeMleMmlLine(line);
        const match = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(cleaned);
        if (match) return `t${clamp(Math.round(Number(match[1]) || 120), CONFIG.minTempo, CONFIG.maxTempo)}`;
      }
      const rawMatch = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(String(scanSource));
      if (rawMatch) return `t${clamp(Math.round(Number(rawMatch[1]) || 120), CONFIG.minTempo, CONFIG.maxTempo)}`;
    }
    return "";
  }

  function extractThreeMleChannelName(block) {
    for (const line of String(block || "").split(/\r?\n/)) {
      const match = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
      if (!match) continue;
      const raw = String(match[1] || "").trim();
      if (!raw || raw.startsWith("#") || /^(initialize|init|using_extension|using_channel)$/i.test(raw)) continue;
      const name = cleanupThreeMleName(raw);
      if (name) return name;
    }
    return "";
  }

  function extractThreeMleChannelMmlCode(block) {
    const parts = [];
    for (const line of String(block || "").split(/\r?\n/)) {
      const cleaned = cleanupThreeMleMmlLine(line);
      if (cleaned) parts.push(cleaned);
    }
    return cleanupThreeMleMmlCode(parts.join(""));
  }

  function normalizeMmiLegacyLengthsInPart(value) {
    const source = String(value || "");
    let index = 0;
    let output = "";
    let legacyDefault = null;
    const isDigit = (character) => /\d/.test(character || "");
    const readDigits = () => {
      const start = index;
      while (index < source.length && isDigit(source[index])) index += 1;
      return index > start ? source.slice(start, index) : "";
    };
    const readDots = () => {
      const start = index;
      while (source[index] === ".") index += 1;
      return index - start;
    };
    const dottedFactor = (dots) => {
      let factor = 1;
      let addition = 0.5;
      for (let count = 0; count < dots; count += 1) {
        factor += addition;
        addition /= 2;
      }
      return factor;
    };
    const isNativeLength = (length) => [1, 2, 4, 8, 16, 32, 64].includes(length);
    const quantaFromSpec = (spec) => {
      if (!spec?.length || spec.length <= 0) return 16;
      return Math.max(1, Math.round((64 / spec.length) * dottedFactor(spec.dots || 0) * (spec.extraFactor || 1)));
    };
    const decomposeQuanta = (quanta) => {
      let remaining = Math.max(1, Math.floor(quanta));
      const result = [];
      for (const entry of [
        { length: 1, quanta: 64 },
        { length: 2, quanta: 32 },
        { length: 4, quanta: 16 },
        { length: 8, quanta: 8 },
        { length: 16, quanta: 4 },
        { length: 32, quanta: 2 },
        { length: 64, quanta: 1 },
      ]) {
        while (remaining >= entry.quanta) {
          result.push(entry.length);
          remaining -= entry.quanta;
        }
      }
      return result.length ? result : [64];
    };
    const expandTimedToken = (head, spec, options = {}) => {
      const lengths = decomposeQuanta(quantaFromSpec(spec));
      const rest = options.rest || /^r$/i.test(head) || /^n0$/i.test(head);
      if (options.needsLengthCommand) {
        return lengths.map((length) => `l${length}${head}`).join(rest ? "" : "&");
      }
      return lengths.map((length) => `${head}${length}`).join(rest ? "" : "&");
    };
    const defaultSpec = (dots = 0) => legacyDefault ? {
      length: legacyDefault.length,
      dots: legacyDefault.dots,
      extraFactor: dottedFactor(dots),
    } : null;

    while (index < source.length) {
      const character = source[index];
      const lower = character.toLowerCase();
      if (lower === "l") {
        const start = index;
        index += 1;
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) legacyDefault = { length, dots };
        else {
          legacyDefault = null;
          output += source.slice(start, index);
        }
        continue;
      }
      if (/[cdefgab]/i.test(character)) {
        index += 1;
        let head = character;
        if (["+", "#", "-"].includes(source[index])) head += source[index++];
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) output += expandTimedToken(head, { length, dots });
        else if (!digits && legacyDefault) output += expandTimedToken(head, defaultSpec(dots));
        else output += `${head}${digits}${".".repeat(dots)}`;
        continue;
      }
      if (lower === "r") {
        index += 1;
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) output += expandTimedToken(character, { length, dots }, { rest: true });
        else if (!digits && legacyDefault) output += expandTimedToken(character, defaultSpec(dots), { rest: true });
        else output += `${character}${digits}${".".repeat(dots)}`;
        continue;
      }
      if (lower === "n") {
        index += 1;
        const noteNumber = readDigits();
        const dots = readDots();
        const head = `n${noteNumber}`;
        if (legacyDefault && noteNumber) {
          output += expandTimedToken(head, defaultSpec(dots), { needsLengthCommand: true, rest: Number(noteNumber) === 0 });
        } else {
          output += `${head}${".".repeat(dots)}`;
        }
        continue;
      }
      output += character;
      index += 1;
    }
    return output;
  }

  function cleanupMmiMmlValue(value) {
    let source = String(value == null ? "" : value);
    source = source.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    source = source.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    source = source.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    source = source
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    return source.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim();
  }

  function looksLikeMmlPart(value) {
    const source = String(value || "").trim();
    if (!source || /[^cdefgabronltv<>+#\-&.0-9\s]/i.test(source)) return false;
    if (!/[cdefgabronrltv<>]/i.test(source)) return false;
    const normalized = normalizeMmiLegacyLengthsInPart(source);
    try {
      const parsed = parseMmlPart(normalized, 0);
      return Boolean(parsed.notes.length || parsed.tempos.length || /r/i.test(normalized));
    } catch {
      return false;
    }
  }

  function cleanupMmiNameValue(value) {
    let source = String(value == null ? "" : value);
    source = source.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    source = source.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    source = source.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    source = source
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    source = source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    source = source.replace(/^name\s*[:=]\s*/i, "").trim();
    if (!source || source.length > 120 || /^MML\s*@/i.test(source)) return "";
    return cleanupThreeMleName(source);
  }

  function extractMmiNameMarkers(source) {
    const text = String(source || "");
    const markers = [];
    const seen = new Set();
    const add = (raw, index = 0) => {
      const name = cleanupMmiNameValue(raw);
      if (!name) return;
      const normalizedIndex = Math.max(0, Number(index) || 0);
      const key = `${normalizedIndex}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      markers.push({ index: normalizedIndex, name });
    };
    let match;
    const nameTag = /<([A-Za-z0-9_:-]*(?:name|trackname|partname)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]{0,500}?)<\/\1>/gim;
    while ((match = nameTag.exec(text))) add(match[2] || "", match.index);
    const nameAttribute = /\b(?:name|trackName|track_name|partName|part_name)\s*=\s*(?:"([^"]{0,220})"|'([^']{0,220})')/gim;
    while ((match = nameAttribute.exec(text))) add(match[1] ?? match[2] ?? "", match.index);
    const keyedName = /(?:^|[\r\n,{;\s])(?:[A-Za-z0-9_.:-]*(?:name|trackname|track_name|partname|part_name)[A-Za-z0-9_.:-]*)\s*[:=]\s*(?:"([^"]{0,220})"|'([^']{0,220})'|([^\r\n,}<>]{0,220}))/gim;
    while ((match = keyedName.exec(text))) add(match[1] ?? match[2] ?? match[3] ?? "", match.index);
    return markers.sort((left, right) => left.index - right.index);
  }

  function findMmiNameForCandidate(position, markers, orderIndex = 0) {
    if (!markers?.length) return "";
    const target = Math.max(0, Number(position) || 0);
    let best = null;
    for (const marker of markers) {
      const distance = target - marker.index;
      if (distance >= 0 && distance <= 2400 && (!best || distance < best.distance)) {
        best = { name: marker.name, distance };
      }
    }
    if (best?.name) return best.name;
    for (const marker of markers) {
      const distance = marker.index - target;
      if (distance >= 0 && distance <= 900 && (!best || distance < best.distance)) {
        best = { name: marker.name, distance };
      }
    }
    if (best?.name) return best.name;
    return markers[clamp(Math.round(Number(orderIndex) || 0), 0, markers.length - 1)]?.name || "";
  }

  function formatMmiChannelLabel(number, name = "") {
    const channelLabel = `Ch ${number}`;
    const cleanedName = cleanupMmiNameValue(name);
    return cleanedName ? `${channelLabel} · ${cleanedName}` : channelLabel;
  }

  function extractMabiIccoMmlPartCandidates(text) {
    const source = String(text || "");
    const nameMarkers = extractMmiNameMarkers(source);
    const fullRecords = [];
    const fullPattern = /MML\s*@([\s\S]*?)\s*;/gi;
    let match;
    let channelIndex = 0;
    while ((match = fullPattern.exec(source))) {
      const parts = String(match[1] || "").split(",");
      for (const part of parts) {
        channelIndex += 1;
        const cleaned = cleanupMmiMmlValue(part);
        if (!cleaned || !looksLikeMmlPart(cleaned)) continue;
        const name = nameMarkers[channelIndex - 1]?.name || findMmiNameForCandidate(match.index, nameMarkers, channelIndex - 1);
        fullRecords.push({
          channelNumber: channelIndex,
          label: formatMmiChannelLabel(channelIndex, name),
          name,
          value: normalizeMmiLegacyLengthsInPart(cleaned),
        });
        if (fullRecords.length >= 32) return fullRecords;
      }
    }
    if (fullRecords.length) return fullRecords;

    const found = [];
    const seen = new Set();
    const addCandidate = (rawValue, position = 0) => {
      const cleaned = cleanupMmiMmlValue(rawValue);
      if (!cleaned) return;
      const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
      for (const part of parts) {
        const candidate = cleanupMmiMmlValue(part);
        if (!looksLikeMmlPart(candidate)) continue;
        const normalized = normalizeMmiLegacyLengthsInPart(candidate);
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          position,
          value: normalized,
          name: findMmiNameForCandidate(position, nameMarkers, found.length),
        });
      }
    };

    const keyedPattern = /(?:^|[\s<{,;])(?:[A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\r\n<>]+))/gim;
    while ((match = keyedPattern.exec(source))) addCandidate(match[1] ?? match[2] ?? match[3] ?? "", match.index);
    const directMmlTagPattern = /<([A-Za-z0-9_:-]*mml[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
    while ((match = directMmlTagPattern.exec(source))) addCandidate(match[2] || "", match.index);
    const taggedPattern = /<([A-Za-z0-9_:-]*(?:melody|chord|song|part|track)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
    while ((match = taggedPattern.exec(source))) addCandidate(match[2] || "", match.index);
    const stringPattern = /<string\b[^>]*>([\s\S]*?)<\/string>/gim;
    while ((match = stringPattern.exec(source))) addCandidate(match[1] || "", match.index);
    if (found.length < 6) {
      const linePattern = /^\s*([^\r\n=:#<>]{1,20000})\s*$/gm;
      while ((match = linePattern.exec(source))) addCandidate(match[1] || "", match.index);
    }

    found.sort((left, right) => left.position - right.position);
    return found.slice(0, 32).map((candidate, index) => ({
      channelNumber: index + 1,
      label: formatMmiChannelLabel(index + 1, candidate.name),
      name: candidate.name,
      value: candidate.value,
    }));
  }

  function extractThreeMleMmlPartCandidates(text) {
    const source = String(text || "");
    const headers = [];
    const headerPattern = /^\s*\[([^\]]+)\]\s*$/gim;
    let match;
    while ((match = headerPattern.exec(source))) {
      headers.push({ title: String(match[1] || "").trim(), index: match.index, end: headerPattern.lastIndex });
    }
    const candidates = [];
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      const channelMatch = /^Channel\s*(\d+)$/i.exec(header.title);
      if (!channelMatch) continue;
      const channelNumber = Number(channelMatch[1]) || candidates.length + 1;
      const block = source.slice(header.end, headers[index + 1]?.index ?? source.length);
      const rawCode = extractThreeMleChannelMmlCode(block);
      if (!rawCode || !/[cdefgabn]/i.test(rawCode)) continue;
      const name = extractThreeMleChannelName(block);
      const code = normalizeMmiLegacyLengthsInPart(rawCode);
      candidates.push({
        channelNumber,
        label: name ? `Ch ${channelNumber} · ${name}` : `Ch ${channelNumber}`,
        name,
        value: code,
      });
      if (candidates.length >= 32) break;
    }
    const tempo = extractThreeMleGlobalTempo(source);
    if (!tempo) return candidates;
    return candidates.map((candidate) => ({
      ...candidate,
      value: /^t\s*\d+/i.test(candidate.value) ? candidate.value : `${tempo}${candidate.value}`,
    }));
  }

  function parseMmlCandidateParts(candidates, quantize = 64) {
    const parsedParts = (candidates || []).map((candidate, partIndex) => ({
      ...parseMmlPart(candidate.value, partIndex),
      importName: candidate.name || candidate.label || `3MLE ${partIndex + 1}`,
    }));
    const noteParts = parsedParts.map((part) => ({
      ...part,
      notes: quantizeMmlPartNotes(part.notes, quantize),
    })).filter((part) => part.notes.length);
    const explicitTempoCount = parsedParts.reduce((count, part) => count + part.tempos.length, 0);
    const tempos = quantizeMmlTempoEvents(parsedParts, quantize);
    const noteCount = noteParts.reduce((count, part) => count + part.notes.length, 0);
    const endBeat = Math.max(
      0,
      ...noteParts.flatMap((part) => part.notes.map((note) => note.startBeat + note.durationBeat)),
      ...tempos.map((tempo) => tempo.beat),
    );
    return {
      quantize: Number(quantize) === 32 ? 32 : 64,
      rawPartCount: candidates.length,
      noteParts,
      tempos,
      explicitTempoCount,
      noteCount,
      endBeat,
      unsupportedTokenCount: parsedParts.reduce((count, part) => count + part.unsupportedTokenCount, 0),
      skippedPitchCount: parsedParts.reduce((count, part) => count + part.skippedPitchCount, 0),
    };
  }

  function analyzeMmlImportSource(source) {
    const text = String(source || "").replace(/^\uFEFF/, "");
    const fileName = String(state.mmlImport.sourceFileName || "");
    const extension = (fileName.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
    const isThreeMle = !/^\s*MML\s*@/i.test(text) && /^\s*\[Channel\s*\d+\]\s*$/im.test(text);
    const isMmi = extension === "mmi";
    if (!isThreeMle && !isMmi) {
      state.mmlImport.format = "mml";
      state.mmlImport.candidates = [];
      state.mmlImport.selectedCandidateIndexes = new Set();
      state.mmlImport.candidateSignature = "";
      return parseMmlText(text, { quantize: 64 });
    }

    const format = isMmi ? "mmi" : "3mle";
    const candidates = isMmi
      ? extractMabiIccoMmlPartCandidates(text)
      : extractThreeMleMmlPartCandidates(text);
    if (!candidates.length) {
      throw new Error(isMmi
        ? "MMI 파일에서 연주 가능한 MML 채널을 찾지 못했습니다."
        : "3MLE 파일에서 연주 가능한 [ChannelN] 채널을 찾지 못했습니다.");
    }
    const signature = candidates.map((candidate) => `${candidate.label}\u0000${candidate.value}`).join("\u0001");
    if (state.mmlImport.candidateSignature !== signature) {
      state.mmlImport.selectedCandidateIndexes = new Set(candidates.slice(0, 6).map((_, index) => index));
      state.mmlImport.candidateSignature = signature;
    } else {
      state.mmlImport.selectedCandidateIndexes = new Set(
        [...state.mmlImport.selectedCandidateIndexes].filter((index) => index >= 0 && index < candidates.length),
      );
    }
    state.mmlImport.format = format;
    state.mmlImport.candidates = candidates;
    const selected = candidates.filter((_, index) => state.mmlImport.selectedCandidateIndexes.has(index));
    return parseMmlCandidateParts(selected, 64);
  }

  function getMmlImportBaseName() {
    const fileName = String(state.mmlImport.sourceFileName || "").trim();
    return (fileName ? fileName.replace(/\.(?:mml|3mle|mmi|txt)$/i, "") : "MML").trim() || "MML";
  }

  function setMmlImportStatus(message, { error = false } = {}) {
    if (!elements.mmlImportStatus) return;
    elements.mmlImportStatus.textContent = message;
    elements.mmlImportStatus.classList.toggle("error", error);
  }

  function renderMmlImportChannelList() {
    if (!elements.mmlImportChannelSection || !elements.mmlImportChannelList) return;
    const isSelectableProject = ["3mle", "mmi"].includes(state.mmlImport.format);
    elements.mmlImportChannelSection.hidden = !isSelectableProject;
    elements.mmlImportChannelList.replaceChildren();
    if (!isSelectableProject) return;
    const selectedCount = state.mmlImport.selectedCandidateIndexes.size;
    const formatLabel = state.mmlImport.format === "mmi" ? "MMI" : "3MLE";
    elements.mmlImportChannelTitle.textContent = `${formatLabel} 채널 선택 (${selectedCount}/6)`;
    state.mmlImport.candidates.forEach((candidate, index) => {
      const row = document.createElement("label");
      row.className = "mml-import-channel-row";
      row.classList.toggle("selected", state.mmlImport.selectedCandidateIndexes.has(index));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.mmlImport.selectedCandidateIndexes.has(index);
      checkbox.setAttribute("aria-label", `${candidate.label} 선택`);
      const main = document.createElement("span");
      main.className = "mml-import-channel-main";
      const title = document.createElement("strong");
      title.textContent = candidate.label;
      const meta = document.createElement("small");
      meta.textContent = `${candidate.value.length}자`;
      const preview = document.createElement("code");
      preview.textContent = candidate.value.length > 120 ? `${candidate.value.slice(0, 120)}…` : candidate.value;
      main.append(title, meta);
      row.append(checkbox, main, preview);
      checkbox.addEventListener("change", () => {
        const next = new Set(state.mmlImport.selectedCandidateIndexes);
        if (checkbox.checked) {
          if (next.size >= 6) {
            checkbox.checked = false;
            showToast("3MLE·MMI 채널은 한 번에 최대 6개까지 선택할 수 있습니다.");
            return;
          }
          next.add(index);
        } else {
          next.delete(index);
        }
        state.mmlImport.selectedCandidateIndexes = next;
        updateMmlImportPreview();
      });
      elements.mmlImportChannelList.append(row);
    });
  }

  function updateMmlImportPreview() {
    window.clearTimeout(state.mmlImport.parseTimer);
    state.mmlImport.parseTimer = 0;
    const source = elements.mmlImportText?.value || "";
    if (!source.trim()) {
      state.mmlImport.parsed = null;
      state.mmlImport.format = "mml";
      state.mmlImport.candidates = [];
      state.mmlImport.selectedCandidateIndexes = new Set();
      renderMmlImportChannelList();
      elements.mmlImportApplyButton.disabled = true;
      elements.mmlImportApplyTempo.disabled = true;
      setMmlImportStatus("MML, 3MLE 또는 MMI 내용을 입력하면 채널·노트·템포 정보를 확인합니다.");
      return null;
    }
    try {
      const parsed = analyzeMmlImportSource(source);
      state.mmlImport.parsed = parsed;
      renderMmlImportChannelList();
      const details = [
        state.mmlImport.format === "mml" ? `MML 음성 ${parsed.noteParts.length}개` : `${state.mmlImport.format === "mmi" ? "MMI" : "3MLE"} 선택 ${state.mmlImport.selectedCandidateIndexes.size}개`,
        `노트 ${parsed.noteCount}개`,
        "1/64 음표 변환",
        `${parsed.noteParts.length}개 새 편집 채널 추가`,
      ];
      if (parsed.explicitTempoCount) details.push(`템포 ${parsed.explicitTempoCount}개 감지`);
      if (parsed.skippedPitchCount) details.push(`음역 밖 ${parsed.skippedPitchCount}개 제외`);
      if (parsed.unsupportedTokenCount) details.push(`미지원 표기 ${parsed.unsupportedTokenCount}개 무시`);
      const canApply = parsed.noteCount > 0 || (parsed.explicitTempoCount > 0 && elements.mmlImportApplyTempo?.checked);
      elements.mmlImportApplyButton.disabled = !canApply;
      elements.mmlImportApplyTempo.disabled = parsed.explicitTempoCount === 0;
      setMmlImportStatus(details.join(" · "));
      return parsed;
    } catch (error) {
      state.mmlImport.parsed = null;
      renderMmlImportChannelList();
      elements.mmlImportApplyButton.disabled = true;
      elements.mmlImportApplyTempo.disabled = true;
      setMmlImportStatus(error instanceof Error ? error.message : "MML을 해석하지 못했습니다.", { error: true });
      return null;
    }
  }

  function scheduleMmlImportPreview() {
    window.clearTimeout(state.mmlImport.parseTimer);
    state.mmlImport.parseTimer = window.setTimeout(updateMmlImportPreview, 90);
  }

  function openMmlImportDialog({ text = "", fileName = "" } = {}) {
    closeFileMenu();
    closeEditMenu();
    closeContextMenu();
    closeThemeMenu();
    closeVolumeMenu();
    closeZoomMenu();
    closePlaybackRateMenu();
    state.mmlImport.sourceFileName = String(fileName || "");
    state.mmlImport.parsed = null;
    state.mmlImport.format = "mml";
    state.mmlImport.candidates = [];
    state.mmlImport.selectedCandidateIndexes = new Set();
    state.mmlImport.candidateSignature = "";
    elements.mmlImportText.value = String(text || "");
    elements.mmlImportApplyTempo.checked = true;
    elements.mmlImportSourceLabel.textContent = fileName || "텍스트를 붙여넣거나 파일을 선택하세요.";
    elements.mmlImportBackdrop.hidden = false;
    updateMmlImportPreview();
    requestAnimationFrame(() => elements.mmlImportText.focus());
  }

  function closeMmlImportDialog() {
    if (!elements.mmlImportBackdrop) return;
    window.clearTimeout(state.mmlImport.parseTimer);
    state.mmlImport.parseTimer = 0;
    state.mmlImport.parsed = null;
    state.mmlImport.candidates = [];
    state.mmlImport.selectedCandidateIndexes = new Set();
    state.mmlImport.candidateSignature = "";
    elements.mmlImportBackdrop.hidden = true;
  }

  async function loadMmlImportFile(file) {
    if (!file) return false;
    try {
      const text = decodeTextFileBytes(await file.arrayBuffer()).replace(/^\uFEFF/, "");
      if (elements.mmlImportBackdrop.hidden) {
        openMmlImportDialog({ text, fileName: file.name || "" });
      } else {
        state.mmlImport.sourceFileName = file.name || "";
        state.mmlImport.candidateSignature = "";
        elements.mmlImportSourceLabel.textContent = file.name || "MML / 3MLE / MMI 파일";
        elements.mmlImportText.value = text;
        updateMmlImportPreview();
        elements.mmlImportText.focus();
      }
      return true;
    } catch (error) {
      console.error(error);
      showToast("MML, 3MLE 또는 MMI 파일을 읽지 못했습니다.");
      return false;
    }
  }

  async function pasteMmlImportTextFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("clipboard unavailable");
      const text = await navigator.clipboard.readText();
      if (!String(text || "").trim()) {
        showToast("클립보드에 MML 텍스트가 없습니다.");
        return false;
      }
      state.mmlImport.sourceFileName = "";
      state.mmlImport.candidateSignature = "";
      elements.mmlImportSourceLabel.textContent = "클립보드 MML / 3MLE / MMI";
      elements.mmlImportText.value = text;
      updateMmlImportPreview();
      elements.mmlImportText.focus();
      return true;
    } catch {
      showToast("클립보드를 읽을 수 없습니다. 내용을 직접 붙여넣으세요.");
      elements.mmlImportText.focus();
      return false;
    }
  }

  function createImportedChannel(part, partNumber) {
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    const requestedName = String(part.importName || "").trim() || `${getMmlImportBaseName()} ${partNumber}`;
    channel.name = makeUniqueChannelName(requestedName, channel.id);
    channel.notes = part.notes.map((note) => ({ ...note, id: state.nextNoteId++ }));
    channel.visible = true;
    return channel;
  }

  function applyMmlImport() {
    const parsed = updateMmlImportPreview();
    if (!parsed) return false;
    const applyTempo = Boolean(elements.mmlImportApplyTempo?.checked && parsed.explicitTempoCount);
    if (!parsed.noteCount && !applyTempo) {
      showToast("불러올 노트나 템포가 없습니다.");
      return false;
    }
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    const format = state.mmlImport.format;
    const importedChannelIds = [];
    parsed.noteParts.forEach((part, partIndex) => {
      const channel = createImportedChannel(part, partIndex + 1);
      state.channels.push(channel);
      importedChannelIds.push(channel.id);
    });
    if (applyTempo) {
      state.tempos = parsed.tempos.map((tempo, index) => ({
        id: index + 1,
        beat: Number(tempo.beat.toFixed(6)),
        bpm: clamp(Math.round(tempo.bpm), CONFIG.minTempo, CONFIG.maxTempo),
        fixed: index === 0,
      }));
      state.nextTempoId = state.tempos.length + 1;
    }
    state.activePanel = "notes";
    if (importedChannelIds.length) {
      const activeIndex = state.channels.findIndex((channel) => channel.id === importedChannelIds[0]);
      if (activeIndex >= 0) state.activeChannel = activeIndex;
    }
    clearNoteSelection();
    clearMidiSelection();
    state.channelNoteRuntime.clear();
    const importLabel = format === "mmi" ? "MMI" : format === "3mle" ? "3MLE" : "MML";
    markDirty(`${importLabel} 불러오기`);
    shrinkTimelineToContent();
    ensureTimelineFitsViewport();
    renderAll();
    closeMmlImportDialog();
    showToast(`${importLabel}에서 ${parsed.noteCount}개 노트를 새 편집 채널로 불러왔습니다.`);
    return true;
  }

  const MML_PITCH_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];

  function beatLengthToMmlTokens(beatLength, symbol = "r") {
    let units = Math.max(0, Math.round((Number(beatLength) || 0) / CONFIG.minimumNoteBeat));
    const values = [64, 32, 16, 8, 4, 2, 1];
    const tokens = [];
    for (const value of values) {
      while (units >= value) {
        tokens.push(`${symbol}${64 / value}`);
        units -= value;
      }
    }
    return tokens;
  }

  function partitionNotesIntoMmlVoices(notes) {
    const voices = [];
    const sorted = notes.slice().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    for (const note of sorted) {
      let voice = voices.find((candidate) => candidate.endBeat <= note.startBeat + 1e-7);
      if (!voice) {
        voice = { endBeat: 0, notes: [] };
        voices.push(voice);
      }
      voice.notes.push(note);
      voice.endBeat = Math.max(voice.endBeat, note.startBeat + note.durationBeat);
    }
    return voices.map((voice) => voice.notes);
  }

  function buildNoteVoiceMml(notes, originBeat) {
    let cursorBeat = originBeat;
    let octave = null;
    let velocity = null;
    const output = [];
    for (const note of notes) {
      const startBeat = Math.max(originBeat, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat));
      const endBeat = Math.max(
        startBeat + CONFIG.minimumNoteBeat,
        snapBeatToUnit(note.startBeat + note.durationBeat, CONFIG.minimumNoteBeat),
      );
      if (startBeat > cursorBeat + 1e-7) {
        output.push(...beatLengthToMmlTokens(startBeat - cursorBeat, "r"));
      }
      const nextOctave = clamp(Math.floor(note.pitch / 12) - 1, 0, 8);
      if (nextOctave !== octave) {
        output.push(`o${nextOctave}`);
        octave = nextOctave;
      }
      const nextVelocity = getNoteVolume(note);
      if (nextVelocity !== velocity) {
        output.push(`v${nextVelocity}`);
        velocity = nextVelocity;
      }
      const pitchName = MML_PITCH_NAMES[((note.pitch % 12) + 12) % 12];
      const durationTokens = beatLengthToMmlTokens(endBeat - startBeat, pitchName);
      durationTokens.forEach((token, index) => output.push(index ? `&${token}` : token));
      cursorBeat = endBeat;
    }
    return output.join("");
  }

  function getTempoAtBeatFromCollection(beat, tempos) {
    let bpm = 120;
    for (const tempo of tempos.slice().sort((left, right) => left.beat - right.beat)) {
      if (tempo.beat > beat + 1e-9) break;
      bpm = tempo.bpm;
    }
    return bpm;
  }

  function buildTempoVoiceMml(tempos, originBeat, endBeat) {
    const sorted = tempos.slice().sort((left, right) => left.beat - right.beat);
    const output = [`t${getTempoAtBeatFromCollection(originBeat, sorted)}`];
    let cursorBeat = originBeat;
    for (const tempo of sorted) {
      if (tempo.beat <= originBeat + 1e-7 || tempo.beat > endBeat + 1e-7) continue;
      output.push(...beatLengthToMmlTokens(tempo.beat - cursorBeat, "r"));
      output.push(`t${tempo.bpm}`);
      cursorBeat = tempo.beat;
    }
    return output.join("");
  }

  function notesToMml(notes, { tempos = getSortedTempos(), originBeat = null } = {}) {
    if (!notes.length) return "";
    const normalized = notes.map((note) => ({
      ...note,
      startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
      durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
    }));
    const firstBeat = originBeat == null
      ? Math.min(...normalized.map((note) => note.startBeat))
      : Math.max(0, originBeat);
    const endBeat = Math.max(...normalized.map((note) => note.startBeat + note.durationBeat));
    const voices = partitionNotesIntoMmlVoices(normalized)
      .map((voice) => buildNoteVoiceMml(voice, firstBeat))
      .filter(Boolean);
    const tempoChanges = tempos.filter((tempo) => tempo.beat > firstBeat + 1e-7 && tempo.beat <= endBeat + 1e-7);
    if (tempoChanges.length) {
      voices.unshift(buildTempoVoiceMml(tempos, firstBeat, endBeat));
    } else if (voices.length) {
      voices[0] = `t${getTempoAtBeatFromCollection(firstBeat, tempos)}${voices[0]}`;
    }
    return `MML@${voices.join(",")};`;
  }

  const NOTE_CLIPBOARD_FORMAT = "mobibard-note-clipboard";

  async function writeTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch {}
    textarea.remove();
    return copied;
  }

  function createNodeClipboardPayload(notes, { originBeat = null, label = "노트", source = "editor" } = {}) {
    if (!notes.length) return null;
    const safeOrigin = originBeat == null
      ? Math.min(...notes.map((note) => Math.max(0, Number(note.startBeat) || 0)))
      : Math.max(0, Number(originBeat) || 0);
    return {
      format: NOTE_CLIPBOARD_FORMAT,
      version: 1,
      label: String(label || "노트"),
      source: String(source || "editor"),
      copiedAt: Date.now(),
      notes: notes
        .map((note) => ({
          pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat: Number((Math.max(0, Number(note.startBeat) || 0) - safeOrigin).toFixed(6)),
          durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat).toFixed(6)),
          velocity: normalizeNoteDynamics(note).velocity,
          volume: normalizeNoteDynamics(note).volume,
        }))
        .sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch),
    };
  }

  function isValidNodeClipboardPayload(payload) {
    return Boolean(
      payload
      && payload.format === NOTE_CLIPBOARD_FORMAT
      && Array.isArray(payload.notes)
      && payload.notes.length
    );
  }

  async function copyNotesToNodeClipboard(notes, options = {}) {
    const payload = createNodeClipboardPayload(notes, options);
    if (!payload) {
      showToast(`복사할 ${options.label || "노트"}가 없습니다.`);
      return false;
    }
    state.noteClipboard = payload;
    updateEditMenuState();
    renderChannelTabs();
    // 브라우저 클립보드에는 MML이 아니라 모비바드 노트 데이터(JSON)를 기록합니다.
    // 파일 환경에서 권한이 거부되어도 내부 클립보드는 정상 동작합니다.
    writeTextToClipboard(JSON.stringify(payload)).catch(() => {});
    showToast(`${payload.label}을 복사했습니다.`);
    return true;
  }

  async function readNodeClipboardFromSystem() {
    try {
      if (!navigator.clipboard?.readText) return null;
      const text = await navigator.clipboard.readText();
      const payload = JSON.parse(text);
      return isValidNodeClipboardPayload(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  async function getNodeClipboardPayload() {
    if (isValidNodeClipboardPayload(state.noteClipboard)) {
      return state.noteClipboard;
    }
    const external = await readNodeClipboardFromSystem();
    if (external) {
      state.noteClipboard = external;
      updateEditMenuState();
      return external;
    }
    return null;
  }

  async function pasteNotesFromClipboard() {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭은 읽기 전용입니다. 일반 채널을 선택한 뒤 붙여넣으세요.");
      return false;
    }
    const payload = await getNodeClipboardPayload();
    if (!payload) {
      showToast("붙여넣을 노트 정보가 없습니다.");
      return false;
    }
    const channel = getActiveChannel();
    const targetOrigin = clamp(snapBeat(state.playhead.beat), 0, getTotalBeats());
    const requiredEndBeat = Math.max(
      targetOrigin + CONFIG.minimumNoteBeat,
      ...payload.notes.map((note) => targetOrigin + Math.max(0, Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat)),
    );
    if (requiredEndBeat > getTotalBeats() - 1e-7) {
      state.timelineBeats = Math.ceil(requiredEndBeat / CONFIG.timelineExtensionBeats) * CONFIG.timelineExtensionBeats;
      resizeRollSurface();
    }

    const pasted = payload.notes.map((note, index) => ({
      id: state.nextNoteId + index,
      pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
      startBeat: Number((targetOrigin + Math.max(0, Number(note.startBeat) || 0)).toFixed(6)),
      durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat).toFixed(6)),
      velocity: normalizeNoteDynamics(note).velocity,
      volume: normalizeNoteDynamics(note).volume,
    }));
    if (!canPlaceMonophonicNotes(pasted, [])) {
      showToast("복사한 노트끼리 서로 겹쳐 있어 단선율 채널에 붙여넣을 수 없습니다.");
      return false;
    }
    clearNoteSelection();
    state.nextNoteId += pasted.length;
    pasted.forEach((note) => state.selectedNoteIds.add(note.id));
    channel.notes.push(...pasted);
    resolveDirectEditOverlaps(channel, new Set(pasted.map((note) => note.id)));
    channel.notes.sort(compareNotesByTimeline);
    channel.visible = true;
    state.channelNoteRuntime.delete(String(channel.id));
    markDirty("노트 붙여넣기");
    ensureTimelineFitsViewport();
    resizeAndDraw();
    renderChannelTabs();
    updateChannelInfo();
    showToast(`${pasted.length}개 노트를 ${channel.name}에 붙여넣었습니다.`);
    return true;
  }

  async function exportNotesAsMml(notes, { label = "노트", tempos = getSortedTempos(), originBeat = null } = {}) {
    if (!notes.length) {
      showToast(`내보낼 ${label}가 없습니다.`);
      return false;
    }
    const mml = notesToMml(notes, { tempos, originBeat });
    const copied = await writeTextToClipboard(mml);
    showToast(copied ? `${label}을 MML로 내보냈습니다.` : "클립보드에 내보내지 못했습니다.");
    return copied;
  }

  async function exportSelectedNotesAsMml() {
    const selected = getSelectedNotes().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    return exportNotesAsMml(selected, { label: `선택 노트 ${selected.length}개` });
  }

  async function exportActiveChannelAsMml() {
    const channel = getActiveChannel();
    if (!channel) return false;
    return exportNotesAsMml(channel.notes, { label: channel.name, originBeat: 0 });
  }

  async function exportSelectedMidiNotesAsMml() {
    const selected = getSelectedMidiNotes().map((item) => item.note);
    return exportNotesAsMml(selected, {
      label: `선택 MIDI 노트 ${selected.length}개`,
      tempos: state.midiReference.tempoEvents || [],
    });
  }

  async function exportActiveMidiInstrumentAsMml() {
    const group = getMidiGroupById();
    return group
      ? exportNotesAsMml(group.notes, { label: group.programName || "MIDI 악기", tempos: state.midiReference.tempoEvents || [], originBeat: 0 })
      : false;
  }

  function getMmlExportSelectedChannels() {
    if (!elements.mmlExportChannelList) return [];
    const selectedIds = new Set(
      [...elements.mmlExportChannelList.querySelectorAll('input[type="checkbox"]:checked')]
        .map((input) => String(input.value || "")),
    );
    return state.channels.filter((channel) => selectedIds.has(String(channel.id)) && channel.notes?.length);
  }

  function updateMmlExportDialogState() {
    const selected = getMmlExportSelectedChannels();
    const exportableCount = state.channels.filter((channel) => channel.notes?.length).length;
    if (elements.mmlExportSummary) {
      elements.mmlExportSummary.textContent = selected.length
        ? `${selected.length}개 채널 선택`
        : (exportableCount ? "선택된 채널이 없습니다." : "내보낼 노트가 있는 채널이 없습니다.");
    }
    if (elements.mmlExportApplyButton) elements.mmlExportApplyButton.disabled = selected.length === 0;
  }

  function renderMmlExportChannelList() {
    if (!elements.mmlExportChannelList) return;
    elements.mmlExportChannelList.replaceChildren();
    state.channels.forEach((channel, index) => {
      const row = document.createElement("label");
      row.className = "mml-export-channel-row";
      row.style.setProperty("--channel-color", getChannelColor(channel, index));

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(channel.id);
      checkbox.checked = false;
      checkbox.disabled = !channel.notes?.length;

      const info = document.createElement("span");
      info.className = "mml-export-channel-info";
      const name = document.createElement("strong");
      name.textContent = channel.name || `Ch${index + 1}`;
      const detail = document.createElement("small");
      detail.textContent = channel.notes?.length ? `${channel.notes.length}개 노트` : "빈 채널";
      info.append(name, detail);

      row.append(checkbox, info);
      checkbox.addEventListener("change", () => {
        row.classList.toggle("selected", checkbox.checked);
        updateMmlExportDialogState();
      });
      elements.mmlExportChannelList.append(row);
    });
    updateMmlExportDialogState();
  }

  function openMmlExportDialog() {
    if (state.activePanel === "audio") {
      showToast("오디오는 MML로 내보낼 수 없습니다.");
      return false;
    }
    closeFileMenu();
    closeEditMenu();
    closeContextMenu();
    closeThemeMenu();
    closeVolumeMenu();
    closeZoomMenu();
    closePlaybackRateMenu();
    renderMmlExportChannelList();
    if (elements.mmlExportBackdrop) elements.mmlExportBackdrop.hidden = false;
    return true;
  }

  function closeMmlExportDialog() {
    if (elements.mmlExportBackdrop) elements.mmlExportBackdrop.hidden = true;
    if (elements.mmlExportChannelList) elements.mmlExportChannelList.replaceChildren();
    updateMmlExportDialogState();
  }

  function channelsToMml(channels, { tempos = getSortedTempos(), originBeat = 0 } = {}) {
    const selectedChannels = (channels || []).filter((channel) => channel?.notes?.length);
    if (!selectedChannels.length) return "";
    const firstBeat = Math.max(0, Number(originBeat) || 0);
    const voices = [];
    let endBeat = firstBeat;

    for (const channel of selectedChannels) {
      const normalized = channel.notes.map((note) => ({
        ...note,
        startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
        durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
      }));
      endBeat = Math.max(endBeat, ...normalized.map((note) => note.startBeat + note.durationBeat));
      partitionNotesIntoMmlVoices(normalized)
        .map((voice) => buildNoteVoiceMml(voice, firstBeat))
        .filter(Boolean)
        .forEach((voiceMml) => voices.push(voiceMml));
    }

    if (!voices.length) return "";
    const tempoChanges = tempos.filter((tempo) => tempo.beat > firstBeat + 1e-7 && tempo.beat <= endBeat + 1e-7);
    if (tempoChanges.length) {
      voices.unshift(buildTempoVoiceMml(tempos, firstBeat, endBeat));
    } else {
      voices[0] = `t${getTempoAtBeatFromCollection(firstBeat, tempos)}${voices[0]}`;
    }
    return `MML@${voices.join(",")};`;
  }

  async function applyMmlExportSelection() {
    const channels = getMmlExportSelectedChannels();
    if (!channels.length) {
      updateMmlExportDialogState();
      return false;
    }
    const mml = channelsToMml(channels, { originBeat: 0 });
    if (!mml) {
      showToast("내보낼 노트가 없습니다.");
      return false;
    }
    const copied = await writeTextToClipboard(mml);
    if (!copied) {
      showToast("클립보드에 내보내지 못했습니다.");
      return false;
    }
    closeMmlExportDialog();
    showToast(`${channels.length}개 채널을 MML로 내보냈습니다.`);
    return true;
  }

  function exportCurrentContextAsMml() {
    return openMmlExportDialog();
  }

  function copySelectedNotes() {
    const selected = getSelectedNotes().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    return copyNotesToNodeClipboard(selected, { label: `선택 노트 ${selected.length}개`, source: "editor" });
  }

  async function cutSelectedNotes() {
    const selected = getSelectedNotes().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    if (!selected.length) {
      showToast("잘라낼 노트를 선택하세요.");
      return false;
    }
    const copied = await copyNotesToNodeClipboard(selected, { label: `선택 노트 ${selected.length}개`, source: "editor" });
    if (!copied) return false;
    deleteSelectedNote("노트 잘라내기");
    showToast(`${selected.length}개 노트를 잘라냈습니다.`);
    return true;
  }

  function copyActiveChannelNotes() {
    const channel = getActiveChannel();
    if (!channel?.notes.length) {
      showToast("복사할 채널 노트가 없습니다.");
      return false;
    }
    return copyNotesToNodeClipboard(channel.notes, { label: `${channel.name} 전체 노트`, originBeat: 0, source: "channel" });
  }

  async function cutActiveChannelNotes() {
    const channel = getActiveChannel();
    if (!channel?.notes.length) {
      showToast("잘라낼 채널 노트가 없습니다.");
      return false;
    }
    const copied = await copyActiveChannelNotes();
    if (!copied) return false;
    channel.notes = [];
    clearNoteSelection();
    state.channelNoteRuntime.delete(String(channel.id));
    markDirty("채널 노트 잘라내기");
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(`${channel.name}의 노트를 잘라냈습니다.`);
    return true;
  }

  function deleteSelectedNote(historyLabel = "노트 삭제") {
    if (!state.selectedNoteIds.size) {
      return false;
    }
    const channel = getActiveChannel();
    const before = channel.notes.length;
    channel.notes = channel.notes.filter((note) => !state.selectedNoteIds.has(note.id));
    const removed = before - channel.notes.length;
    if (!removed) {
      return false;
    }
    clearNoteSelection();
    markDirty(historyLabel);
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    return true;
  }

  function clearActiveChannel() {
    const channel = getActiveChannel();
    if (!channel.notes.length) {
      showToast("현재 채널은 이미 비어 있습니다.");
      return;
    }
    channel.notes = [];
    clearNoteSelection();
    markDirty("채널 비우기");
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(`${channel.name}을 비웠습니다.`);
  }

  function closeTimeEditDialog() {
    if (elements.timeEditBackdrop) elements.timeEditBackdrop.hidden = true;
  }

  function openTimeEditDialog(unit = "measure") {
    const normalizedUnit = unit === "beat" ? "beat" : "measure";
    state.timeEdit = { unit: normalizedUnit, beat: clamp(Number(state.playhead.beat) || 0, 0, getTotalBeats()) };
    if (elements.timeEditTitle) elements.timeEditTitle.textContent = normalizedUnit === "measure" ? "마디 공간 편집" : "박자 공간 편집";
    if (elements.timeEditPosition) elements.timeEditPosition.textContent = `빨간 재생선 ${state.timeEdit.beat.toFixed(3)} beat 기준`;
    if (elements.timeEditUnitLabel) elements.timeEditUnitLabel.textContent = normalizedUnit === "measure" ? "마디" : "박자";
    if (elements.timeEditAmountInput) {
      elements.timeEditAmountInput.value = "1";
      elements.timeEditAmountInput.min = "1";
      elements.timeEditAmountInput.step = "1";
    }
    if (elements.timeEditBackdrop) elements.timeEditBackdrop.hidden = false;
    requestAnimationFrame(() => elements.timeEditAmountInput?.focus());
  }

  function trimNoteToBeat(note, targetEndBeat) {
    const nextDuration = targetEndBeat - note.startBeat;
    if (nextDuration < CONFIG.minimumNoteBeat - 1e-7) return false;
    note.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, nextDuration).toFixed(6));
    return true;
  }

  function insertTrackSpaceAtPlayhead(amountBeats) {
    const amount = Math.max(CONFIG.minimumNoteBeat, Number(amountBeats) || 0);
    const cursor = clamp(Number(state.timeEdit?.beat ?? state.playhead.beat) || 0, 0, getTotalBeats());
    for (const channel of state.channels) {
      const kept = [];
      for (const note of channel.notes || []) {
        const start = Number(note.startBeat) || 0;
        const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        if (start >= cursor - 1e-7) {
          note.startBeat = Number((start + amount).toFixed(6));
          kept.push(note);
        } else if (end > cursor + 1e-7) {
          if (trimNoteToBeat(note, cursor)) kept.push(note);
          else state.selectedNoteIds.delete(note.id);
        } else kept.push(note);
      }
      channel.notes = kept;
      state.channelNoteRuntime.delete(String(channel.id));
    }
    for (const tempo of state.tempos) {
      if (!tempo.fixed && tempo.beat >= cursor - 1e-7) tempo.beat = Number((tempo.beat + amount).toFixed(6));
    }
    state.tempos.sort((a, b) => a.beat - b.beat || a.id - b.id);
    state.timelineBeats = Math.max(getTotalBeats() + amount, getPersistentContentEndBeat() + getSnapBeat());
    ensureTimelineFitsViewport();
    markDirty(state.timeEdit.unit === "measure" ? "마디 공간 추가" : "박자 공간 추가");
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
    showToast(`${state.timeEdit.unit === "measure" ? "마디" : "박자"} 공간을 추가했습니다.`);
    return true;
  }

  function deleteTrackSpaceAtPlayhead(amountBeats) {
    const requested = Math.max(CONFIG.minimumNoteBeat, Number(amountBeats) || 0);
    const cursor = clamp(Number(state.timeEdit?.beat ?? state.playhead.beat) || 0, 0, getTotalBeats());
    const amount = Math.min(requested, Math.max(0, getTotalBeats() - cursor));
    if (amount < CONFIG.minimumNoteBeat - 1e-7) {
      showToast("삭제할 공간이 없습니다.");
      return false;
    }
    const cutEnd = cursor + amount;
    const bpmAfterCut = getTempoAtBeatFromCollection(cutEnd + 1e-8, state.tempos);
    for (const channel of state.channels) {
      const nextNotes = [];
      for (const note of channel.notes || []) {
        const start = Number(note.startBeat) || 0;
        const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        if (end <= cursor + 1e-7) {
          nextNotes.push(note);
        } else if (start >= cutEnd - 1e-7) {
          note.startBeat = Number(Math.max(0, start - amount).toFixed(6));
          nextNotes.push(note);
        } else if (start < cursor - 1e-7 && end > cutEnd + 1e-7) {
          note.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, end - start - amount).toFixed(6));
          nextNotes.push(note);
        } else if (start < cursor - 1e-7) {
          if (trimNoteToBeat(note, cursor)) nextNotes.push(note);
          else state.selectedNoteIds.delete(note.id);
        } else if (end > cutEnd + 1e-7) {
          const nextDuration = end - cutEnd;
          if (nextDuration >= CONFIG.minimumNoteBeat - 1e-7) {
            note.startBeat = Number(cursor.toFixed(6));
            note.durationBeat = Number(nextDuration.toFixed(6));
            nextNotes.push(note);
          } else state.selectedNoteIds.delete(note.id);
        } else state.selectedNoteIds.delete(note.id);
      }
      channel.notes = nextNotes;
      state.channelNoteRuntime.delete(String(channel.id));
    }

    const fixedTempos = state.tempos.filter((tempo) => tempo.fixed).map((tempo) => ({ ...tempo }));
    const tempoByBeat = new Map();
    for (const tempo of state.tempos.filter((tempo) => !tempo.fixed).sort((a, b) => a.beat - b.beat || a.id - b.id)) {
      if (tempo.beat >= cursor - 1e-7 && tempo.beat < cutEnd - 1e-7) continue;
      const beat = tempo.beat >= cutEnd - 1e-7 ? tempo.beat - amount : tempo.beat;
      tempoByBeat.set(Number(beat).toFixed(6), { ...tempo, beat: Number(Number(beat).toFixed(6)) });
    }
    if (cursor <= 1e-7) {
      if (fixedTempos[0]) fixedTempos[0].bpm = bpmAfterCut;
      tempoByBeat.delete("0.000000");
    } else {
      const cursorKey = Number(cursor).toFixed(6);
      const existingAtCursor = tempoByBeat.get(cursorKey);
      tempoByBeat.set(cursorKey, existingAtCursor
        ? { ...existingAtCursor, bpm: bpmAfterCut }
        : { id: state.nextTempoId++, beat: Number(cursor.toFixed(6)), bpm: bpmAfterCut, fixed: false });
    }
    state.tempos = [...fixedTempos, ...tempoByBeat.values()].sort((a, b) => a.beat - b.beat || a.id - b.id);
    state.timelineBeats = Math.max(CONFIG.beatsPerMeasure, getTotalBeats() - amount);
    shrinkTimelineToContent();
    ensureTimelineFitsViewport();
    markDirty(state.timeEdit.unit === "measure" ? "마디 공간 삭제" : "박자 공간 삭제");
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
    showToast(`${state.timeEdit.unit === "measure" ? "마디" : "박자"} 공간을 삭제했습니다.`);
    return true;
  }

  function applyTimeEdit(action) {
    const amountCount = Math.max(1, Math.floor(Number(elements.timeEditAmountInput?.value) || 1));
    const amountBeats = state.timeEdit.unit === "measure" ? amountCount * CONFIG.beatsPerMeasure : amountCount;
    return action === "delete" ? deleteTrackSpaceAtPlayhead(amountBeats) : insertTrackSpaceAtPlayhead(amountBeats);
  }

  function closeTempoEditor() {
    if (!elements.tempoEditorBackdrop) return;
    elements.tempoEditorBackdrop.hidden = true;
    state.tempoEditor = { mode: null, tempoId: null, beat: 0 };
  }

  function openTempoEditor(tempo = null, { beat = null } = {}) {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭의 템포는 읽기 전용입니다.");
      return false;
    }
    const adding = !tempo;
    const targetBeat = adding
      ? clamp(snapBeat(Number(beat) || 0), 0, getTotalBeats())
      : Math.max(0, Number(tempo.beat) || 0);
    if (adding) {
      if (targetBeat <= 0) {
        showToast("0번 위치에는 기본 템포가 이미 있습니다.");
        return false;
      }
      if (getTempoAtExactBeat(targetBeat)) {
        showToast("해당 위치에 이미 템포가 있습니다.");
        return false;
      }
    }
    state.tempoEditor = {
      mode: adding ? "add" : "edit",
      tempoId: tempo?.id ?? null,
      beat: Number(targetBeat.toFixed(6)),
    };
    elements.tempoEditorTitle.textContent = adding ? "템포 추가" : "템포 수정";
    elements.tempoEditorPosition.textContent = `${targetBeat.toFixed(3)} beat`;
    elements.tempoBpmInput.value = String(adding ? getTempoAtBeat(targetBeat) : tempo.bpm);
    elements.tempoEditorDeleteButton.hidden = adding || Boolean(tempo?.fixed) || targetBeat === 0;
    elements.tempoEditorBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.tempoBpmInput.focus();
      elements.tempoBpmInput.select();
    });
    return true;
  }

  function applyTempoEditor() {
    const bpm = Number(elements.tempoBpmInput?.value);
    if (!Number.isInteger(bpm) || bpm < CONFIG.minTempo || bpm > CONFIG.maxTempo) {
      showToast(`템포는 ${CONFIG.minTempo}~${CONFIG.maxTempo} 사이의 정수만 입력할 수 있습니다.`);
      elements.tempoBpmInput?.focus();
      return false;
    }
    const editor = state.tempoEditor;
    if (editor.mode === "add") {
      if (getTempoAtExactBeat(editor.beat)) {
        showToast("해당 위치에 이미 템포가 있습니다.");
        closeTempoEditor();
        return false;
      }
      if (state.playback.running || state.playback.loading) stopPlayback(false);
      state.tempos.push({
        id: state.nextTempoId++,
        beat: Number(editor.beat.toFixed(6)),
        bpm,
        fixed: false,
      });
      closeTempoEditor();
      markDirty("템포 추가");
      drawRoll();
      drawTimeline();
      updateChannelInfo();
      showToast(`${editor.beat.toFixed(3)} beat에 템포 ${bpm}을 추가했습니다.`);
      return true;
    }
    if (editor.mode !== "edit") return false;
    const tempo = state.tempos.find((item) => String(item.id) === String(editor.tempoId));
    if (!tempo) {
      closeTempoEditor();
      return false;
    }
    if (tempo.bpm === bpm) {
      closeTempoEditor();
      return false;
    }
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    tempo.bpm = bpm;
    closeTempoEditor();
    markDirty("템포 변경");
    drawRoll();
    drawTimeline();
    updateChannelInfo();
    showToast(`템포를 ${bpm}으로 변경했습니다.`);
    return true;
  }

  function addTempoAtBeat(beat) {
    return openTempoEditor(null, { beat });
  }

  function editTempo(tempo) {
    return tempo ? openTempoEditor(tempo) : false;
  }

  function deleteTempo(tempo) {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭의 템포는 읽기 전용입니다.");
      return false;
    }
    if (state.playback.running || state.playback.loading) {
      stopPlayback(false);
    }
    if (!tempo || tempo.fixed || tempo.beat === 0) {
      showToast("0번 템포는 삭제할 수 없습니다.");
      return false;
    }
    const before = state.tempos.length;
    state.tempos = state.tempos.filter((item) => item.id !== tempo.id);
    if (state.tempos.length === before) {
      return false;
    }
    closeTempoEditor();
    markDirty("템포 삭제");
    shrinkTimelineToContent();
    drawRoll();
    drawTimeline();
    updateChannelInfo();
    showToast(`템포 ${tempo.bpm}을 삭제했습니다.`);
    return true;
  }

  function deleteTempoFromEditor() {
    const tempo = state.tempos.find((item) => String(item.id) === String(state.tempoEditor.tempoId));
    return tempo ? deleteTempo(tempo) : false;
  }


  const ROW_HEIGHT_OPTIONS = [8, 10, 12, 14, 16];

  function normalizeRowHeight(value) {
    const numeric = Number(value) || CONFIG.defaultRowHeight;
    return ROW_HEIGHT_OPTIONS.reduce((nearest, candidate) =>
      Math.abs(candidate - numeric) < Math.abs(nearest - numeric) ? candidate : nearest,
    CONFIG.defaultRowHeight);
  }

  function setRowHeight(value, { dirty = true } = {}) {
    const nextHeight = normalizeRowHeight(value);
    if (nextHeight === state.rowHeight) {
      elements.pitchSpacingSelect.value = String(nextHeight);
      return false;
    }

    const oldHeight = getRowHeight();
    const viewportCenterY = elements.rollViewport.scrollTop + elements.rollViewport.clientHeight / 2;
    const centerPitchPosition = CONFIG.maxPitch - viewportCenterY / oldHeight;
    state.rowHeight = nextHeight;
    elements.pitchSpacingSelect.value = String(nextHeight);
    resizeAndDraw();

    const nextCenterY = (CONFIG.maxPitch - centerPitchPosition) * nextHeight;
    const maxScrollTop = Math.max(0, getRollHeight() - elements.rollViewport.clientHeight);
    elements.rollViewport.scrollTop = clamp(
      nextCenterY - elements.rollViewport.clientHeight / 2,
      0,
      maxScrollTop,
    );
    drawKeyboard();
    if (dirty) {
      setDirtyWithoutHistory();
    }
    return true;
  }

  function normalizeZoom(value) {
    const numeric = clamp(Number(value) || 1, CONFIG.minZoom, CONFIG.maxZoom);
    return CONFIG.zoomLevels.reduce((nearest, candidate) => (
      Math.abs(candidate - numeric) < Math.abs(nearest - numeric) ? candidate : nearest
    ), 1);
  }

  function getZoomLevelIndex(value = state.zoom) {
    const normalized = normalizeZoom(value);
    return Math.max(0, CONFIG.zoomLevels.findIndex((candidate) => Math.abs(candidate - normalized) < 1e-7));
  }

  function setZoom(value, { anchor = "left", clientX = null } = {}) {
    const nextZoom = normalizeZoom(value);
    if (Math.abs(nextZoom - state.zoom) < 1e-7) {
      updateZoomLabel();
      return false;
    }

    const viewport = elements.rollViewport;
    const oldZoom = state.zoom;
    const oldQuarterWidth = getQuarterWidth();
    const oldScrollLeft = viewport.scrollLeft;
    const preRoll = getPreRollWidth();
    const playbackActive = state.playback.running || state.playback.loading;
    const oldPlayheadScreenX = preRoll + state.playhead.beat * oldQuarterWidth - oldScrollLeft;
    let anchorScreenX = 0;
    if (anchor === "pointer" && Number.isFinite(Number(clientX))) {
      const rect = viewport.getBoundingClientRect();
      anchorScreenX = clamp(Number(clientX) - rect.left, 0, viewport.clientWidth);
    } else if (anchor === "center") {
      anchorScreenX = viewport.clientWidth / 2;
    }
    const anchorAbsoluteX = oldScrollLeft + anchorScreenX;
    let anchorBeat = Math.max(0, (anchorAbsoluteX - preRoll) / oldQuarterWidth);
    let keepPrerollPinned = oldScrollLeft <= preRoll && anchorScreenX <= preRoll - oldScrollLeft + 0.5;

    if (playbackActive && oldPlayheadScreenX < -1) {
      // 사용자가 가로 스크롤을 오른쪽으로 옮겨 재생선이 이미 왼쪽 밖에 있는 경우에도
      // 재생선을 확대 기준점으로 삼아 안전한 왼쪽 여백으로 함께 복귀시킵니다.
      anchorScreenX = getPlaybackLeftContext(viewport.clientWidth);
      anchorBeat = clamp(Number(state.playhead.beat) || 0, 0, getTotalBeats());
      keepPrerollPinned = false;
    } else if (playbackActive && oldPlayheadScreenX <= viewport.clientWidth + 1) {
      const zoomRatio = nextZoom / Math.max(CONFIG.minZoom, oldZoom);
      const predictedPlayheadScreenX = anchorScreenX + (oldPlayheadScreenX - anchorScreenX) * zoomRatio;
      if (predictedPlayheadScreenX < -1) {
        // 마우스 기준 확대가 재생선을 왼쪽 밖으로 밀면 재생선 자체를 확대 기준점으로 바꿉니다.
        anchorScreenX = clamp(oldPlayheadScreenX, 0, viewport.clientWidth);
        anchorBeat = clamp(Number(state.playhead.beat) || 0, 0, getTotalBeats());
        keepPrerollPinned = false;
      }
    }

    if (playbackActive) {
      // 이전 배율의 픽셀 좌표로 진행 중이던 자동 스크롤이 새 위치를 덮어쓰지 않도록 폐기합니다.
      state.playback.scrollAnimation = null;
    }

    state.zoom = nextZoom;
    resizeAndDraw();
    let targetScrollLeft = keepPrerollPinned
      ? oldScrollLeft
      : getPreRollWidth() + anchorBeat * getQuarterWidth() - anchorScreenX;
    targetScrollLeft = clamp(targetScrollLeft, 0, getMaxScrollLeft());

    if (playbackActive) {
      const nextPlayheadAbsoluteX = beatToX(state.playhead.beat);
      if (nextPlayheadAbsoluteX - targetScrollLeft < -1) {
        const safeLeftContext = oldPlayheadScreenX >= 0 && oldPlayheadScreenX <= viewport.clientWidth
          ? oldPlayheadScreenX
          : getPlaybackLeftContext(viewport.clientWidth);
        targetScrollLeft = clamp(nextPlayheadAbsoluteX - safeLeftContext, 0, getMaxScrollLeft());
      }
    }

    viewport.scrollLeft = targetScrollLeft;
    updatePlayheadVisual();
    drawTimeline();
    scheduleAutosave(500);
    return true;
  }

  function changeZoom(direction, options = {}) {
    const currentIndex = getZoomLevelIndex();
    const nextIndex = clamp(currentIndex + Math.sign(direction), 0, CONFIG.zoomLevels.length - 1);
    return setZoom(CONFIG.zoomLevels[nextIndex], options);
  }


  function getNormalizedWheelDelta(event) {
    const raw = Number(event.deltaY) || Number(event.deltaX) || 0;
    if (!raw) return 0;
    if (event.deltaMode === 1) return raw * 16;
    if (event.deltaMode === 2) {
      return raw * Math.max(1, elements.rollViewport?.clientHeight || 600);
    }
    return raw;
  }

  function getEditableAltWheelSelectedNotes() {
    if (isMidiReferenceActive() || state.activePanel !== "notes" || !state.selectedNoteIds.size) {
      return [];
    }
    const channel = getActiveChannel();
    if (!channel?.notes?.length) {
      return [];
    }
    return channel.notes.filter((note) => state.selectedNoteIds.has(note.id));
  }

  function updateCurrentWheelVolumeHistory(label = "노트 볼륨 변경") {
    if (state.history.restoring || !state.history.currentEntry) {
      return false;
    }
    state.history.currentEntry.snapshot = captureHistorySnapshot();
    state.history.currentEntry.label = label;
    state.history.currentEntry.createdAt = Date.now();
    state.history.redoStack.length = 0;
    state.dirty = true;
    updateDirtyState();
    return true;
  }

  function adjustSelectedNoteVolumesByStep(step, now = performance.now()) {
    const selected = getEditableAltWheelSelectedNotes();
    if (!selected.length || !step) {
      return false;
    }

    const channel = getActiveChannel();
    let changed = false;
    for (const note of selected) {
      const nextVolume = clamp(getNoteVolume(note) + Math.sign(step), 0, 15);
      if (nextVolume === getNoteVolume(note)) {
        continue;
      }
      note.volume = nextVolume;
      note.velocity = mmlVolumeToVelocity(nextVolume);
      changed = true;
    }
    if (!changed) {
      return false;
    }

    state.channelNoteRuntime.delete(String(channel.id));
    const selectionSignature = `${channel.id}:${selected.map((note) => note.id).sort((a, b) => a - b).join(",")}`;
    const canMergeWithCurrentHistory = (
      state.zoomWheel.mode === "volume"
      && state.zoomWheel.selectionSignature === selectionSignature
      && now - state.zoomWheel.lastVolumeEditAt <= 520
      && state.history.currentEntry?.id === state.zoomWheel.volumeHistoryEntryId
    );
    if (canMergeWithCurrentHistory) {
      updateCurrentWheelVolumeHistory();
    } else {
      markDirty("노트 볼륨 변경");
      state.zoomWheel.volumeHistoryEntryId = state.history.currentEntry?.id ?? null;
    }
    state.zoomWheel.selectionSignature = selectionSignature;
    state.zoomWheel.lastVolumeEditAt = now;

    drawRoll();
    updateChannelInfo();
    const volumes = [...new Set(selected.map((note) => getNoteVolume(note)))];
    showToast(volumes.length === 1
      ? `${selected.length}개 노트 볼륨 · V${volumes[0]}`
      : `${selected.length}개 노트 볼륨을 ${step > 0 ? "올렸습니다" : "내렸습니다"}.`);
    return true;
  }

  function handlePianoRollAltWheelZoom(event) {
    if (event.ctrlKey || event.metaKey) return false;
    const selectedNotes = getEditableAltWheelSelectedNotes();
    // Zoom moved from Alt+wheel to Shift+wheel. Alt+wheel remains the
    // selected-note volume gesture so the two operations no longer compete.
    const isZoomGesture = event.shiftKey && !event.altKey;
    const isVolumeGesture = event.altKey && !event.shiftKey && selectedNotes.length > 0;
    if (!isZoomGesture && !isVolumeGesture) return false;
    const delta = getNormalizedWheelDelta(event);
    if (!delta) return false;
    event.preventDefault();
    event.stopPropagation();

    const mode = isVolumeGesture ? "volume" : "zoom";
    const now = performance.now();
    const direction = Math.sign(delta);
    const previousDirection = Math.sign(state.zoomWheel.accumulatedDelta);
    if (
      state.zoomWheel.mode !== mode
      || now - state.zoomWheel.lastEventAt > 180
      || (previousDirection && previousDirection !== direction)
    ) {
      state.zoomWheel.accumulatedDelta = 0;
    }
    if (state.zoomWheel.mode !== mode) {
      state.zoomWheel.selectionSignature = "";
      state.zoomWheel.volumeHistoryEntryId = null;
    }
    state.zoomWheel.mode = mode;
    state.zoomWheel.lastEventAt = now;
    state.zoomWheel.accumulatedDelta += delta;

    const threshold = 48;
    if (Math.abs(state.zoomWheel.accumulatedDelta) < threshold) return true;
    if (now - state.zoomWheel.lastStepAt < 55) return true;

    const stepDirection = state.zoomWheel.accumulatedDelta < 0 ? 1 : -1;
    const changed = mode === "volume"
      ? adjustSelectedNoteVolumesByStep(stepDirection, now)
      : changeZoom(stepDirection, { anchor: "pointer", clientX: event.clientX });
    state.zoomWheel.lastStepAt = now;
    state.zoomWheel.accumulatedDelta = 0;
    if (changed) {
      elements.rollViewport?.focus({ preventScroll: true });
    }
    return true;
  }

  function updateZoomLabel() {
    const normalizedZoom = normalizeZoom(state.zoom);
    const index = getZoomLevelIndex(normalizedZoom);
    const percent = Math.round(normalizedZoom * 100);
    const minPercent = Math.round(CONFIG.minZoom * 100);
    const maxPercent = Math.round(CONFIG.maxZoom * 100);
    if (elements.zoomSlider) {
      elements.zoomSlider.min = "0";
      elements.zoomSlider.max = String(Math.max(0, CONFIG.zoomLevels.length - 1));
      elements.zoomSlider.step = "1";
      elements.zoomSlider.value = String(index);
    }
    if (elements.zoomMinLabel) elements.zoomMinLabel.textContent = `${minPercent}%`;
    if (elements.zoomMaxLabel) elements.zoomMaxLabel.textContent = `${maxPercent}%`;
    if (elements.zoomValue) elements.zoomValue.textContent = `${percent}%`;
    if (elements.zoomButton) {
      elements.zoomButton.textContent = `배율 ${percent}`;
      elements.zoomButton.title = `확대 배율 ${percent}% (Shift+휠, - / = 키 지원)`;
    }
  }

  function updatePlayButton() {
    if (state.playback.loading) {
      elements.playButton.setAttribute("aria-pressed", "true");
      elements.playButton.textContent = "… 재생 준비";
      return;
    }
    if (state.playback.running) {
      elements.playButton.setAttribute("aria-pressed", "true");
      elements.playButton.textContent = "■ 정지";
      return;
    }
    elements.playButton.setAttribute("aria-pressed", "false");
    elements.playButton.textContent = "▶ 재생";
  }

  function getAudibleMidiGroups(midiDocument = getActiveMidiDocument()) {
    if (!midiDocument || midiDocument.muted) return [];
    return (midiDocument.groups || []).filter((group) => !group.muted);
  }

  function getPlaybackEndBeat() {
    const lastAudioEnd = state.audioClips
      .filter((clip) => !clip.muted && Boolean(getAudioRuntime(clip.id)?.audioBuffer))
      .reduce((maximum, clip) => Math.max(maximum, getAudioClipEndBeat(clip)), 0);
    if (isMidiReferenceActive()) {
      const groups = getActiveMidiDocument()?.groups || [];
      const midiEnd = groups.reduce((maximum, group) => group.notes.reduce(
        (groupMaximum, note) => Math.max(groupMaximum, note.startBeat + note.durationBeat),
        maximum,
      ), 0);
      return clamp(Math.max(midiEnd, lastAudioEnd), 0, getTotalBeats());
    }
    const lastNoteEnd = state.channels
      .reduce((projectEnd, channel) => channel.notes.reduce(
        (channelEnd, note) => Math.max(channelEnd, note.startBeat + note.durationBeat),
        projectEnd,
      ), 0);
    const lastTempoBeat = state.tempos.reduce(
      (maximum, tempo) => tempo.fixed ? maximum : Math.max(maximum, tempo.beat),
      0,
    );
    return clamp(Math.max(lastNoteEnd, lastTempoBeat, lastAudioEnd), 0, getTotalBeats());
  }

  function getPlaybackNormalizationGainForVoiceCount(voiceCount) {
    const peakVoiceCount = Math.max(0, Math.floor(Number(voiceCount) || 0));
    const referenceVoices = Math.max(1, Math.floor(Number(CONFIG.playbackNormalizationReferenceVoices) || 2));
    if (peakVoiceCount <= referenceVoices) return 1;
    return clamp(
      Math.sqrt(referenceVoices / peakVoiceCount),
      CONFIG.playbackNormalizationMinimumGain,
      1,
    );
  }

  function computePlaybackAutoGainScale(notes, { windowStart = -Infinity, windowEnd = Infinity } = {}) {
    const safeWindowStart = Number.isFinite(Number(windowStart)) ? Number(windowStart) : -Infinity;
    const safeWindowEnd = Number.isFinite(Number(windowEnd)) ? Number(windowEnd) : Infinity;
    if (safeWindowEnd <= safeWindowStart) return 1;
    const events = [];
    for (const note of Array.isArray(notes) ? notes : []) {
      const start = Number(note?.startSeconds);
      const end = Number(note?.endSeconds);
      if (
        !Number.isFinite(start)
        || !Number.isFinite(end)
        || end <= start
        || end <= safeWindowStart
        || start >= safeWindowEnd
        || getNotePlaybackVelocity(note) <= 0
      ) {
        continue;
      }
      events.push({ time: Math.max(start, safeWindowStart), delta: 1 });
      events.push({ time: Math.min(end, safeWindowEnd), delta: -1 });
    }
    if (!events.length) return 1;

    // 같은 시각에는 끝나는 음을 먼저 제거해 경계만 맞닿은 음을 동시 발음으로 세지 않습니다.
    events.sort((left, right) => left.time - right.time || left.delta - right.delta);
    let simultaneous = 0;
    let peakSimultaneous = 0;
    for (const event of events) {
      simultaneous += event.delta;
      if (simultaneous > peakSimultaneous) peakSimultaneous = simultaneous;
    }
    return getPlaybackNormalizationGainForVoiceCount(peakSimultaneous);
  }

  function refreshPlaybackAutoGainScale() {
    const audibleNotes = state.playback.notes.filter((note) => isPlaybackNoteCurrentlyAudible(note));
    state.playback.autoGainScale = computePlaybackAutoGainScale(audibleNotes, {
      windowStart: state.playback.startSeconds,
      windowEnd: state.playback.endSeconds,
    });
    return state.playback.autoGainScale;
  }

  function collectPlaybackNotes(startBeat = 0, { includeMuted = false } = {}) {
    if (isMidiReferenceActive()) {
      const document = getActiveMidiDocument();
      const cache = ensureMidiPlaybackCache(document);
      if (!document || !cache || (!includeMuted && document.muted)) return [];
      const mutedGroupIds = includeMuted
        ? new Set()
        : new Set((document.groups || []).filter((group) => group.muted).map((group) => String(group.id)));
      return cache.notes.filter((note) => (
        !mutedGroupIds.has(String(note.sourceId)) && note.endBeat > startBeat + 1e-7
      ));
    }
    const notes = [];
    for (const channel of state.channels) {
      if (!includeMuted && channel.muted) continue;
      for (const note of channel.notes) {
        if (note.startBeat + note.durationBeat <= startBeat + 1e-7) continue;
        notes.push({
          id: note.id,
          pitch: note.pitch,
          velocity: getNotePlaybackVelocity(note),
          volume: getNoteVolume(note),
          startBeat: note.startBeat,
          durationBeat: note.durationBeat,
          endBeat: note.startBeat + note.durationBeat,
          source: "channel",
          sourceId: channel.id,
          instrumentProgram: getChannelInstrumentProgram(channel),
          instrumentBank: getChannelInstrumentBank(channel),
        });
      }
    }
    return notes.sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
  }

  function getPlaybackNoteKey(note) {
    return `${String(note?.source || "channel")}:${String(note?.sourceId ?? "")}:${String(note?.id ?? "")}:${Number(note?.startBeat || 0).toFixed(6)}`;
  }

  function isPlaybackNoteCurrentlyAudible(note) {
    if (!note) return false;
    if (note.source === "midi") {
      const document = getActiveMidiDocument();
      if (!document || document.muted) return false;
      const group = (document.groups || []).find((item) => String(item.id) === String(note.sourceId));
      return Boolean(group && !group.muted);
    }
    const channel = getChannelById(note.sourceId);
    return Boolean(channel && !channel.muted);
  }

  function trackPlaybackVoice(note, voice) {
    if (!voice) return;
    const key = getPlaybackNoteKey(note);
    state.playback.scheduledNoteKeys.add(key);
    state.playback.voiceRecords.set(key, {
      key,
      voice,
      source: String(note.source || "channel"),
      sourceId: String(note.sourceId ?? ""),
      endSeconds: Number(note.endSeconds) || 0,
    });
  }

  function schedulePlaybackNoteVoice(note, { timelineNow, contextNow, rate } = {}) {
    if (!note || !audioEngine.context || !isPlaybackNoteCurrentlyAudible(note)) return false;
    const key = getPlaybackNoteKey(note);
    if (state.playback.scheduledNoteKeys.has(key)) return false;
    const context = audioEngine.context;
    const safeContextNow = Number.isFinite(contextNow) ? contextNow : context.currentTime;
    const safeRate = Math.max(0.01, Number(rate) || Number(state.playbackRate) || 1);
    const safeTimelineNow = Number.isFinite(timelineNow)
      ? timelineNow
      : state.playback.startSeconds + Math.max(0, safeContextNow - state.playback.audioStartTime) * safeRate;
    if (note.endSeconds <= safeTimelineNow + 0.002) return false;
    const audibleStartSeconds = Math.max(note.startSeconds, safeTimelineNow);
    const startAt = Math.max(
      safeContextNow + 0.004,
      state.playback.audioStartTime + (audibleStartSeconds - state.playback.startSeconds) / safeRate,
    );
    const duration = (note.endSeconds - audibleStartSeconds) / safeRate;
    const playbackVelocity = getNotePlaybackVelocity(note);
    if (duration <= 0.002 || playbackVelocity <= 0) return false;
    const voice = audioEngine.playNote(note.pitch, playbackVelocity, startAt, duration, {
      program: clamp(Number(note.instrumentProgram) || 0, 0, 127),
      bank: clamp(Number(note.instrumentBank) || 0, 0, 16383),
      gainScale: state.playback.autoGainScale,
    });
    trackPlaybackVoice(note, voice);
    return true;
  }

  function releasePlaybackVoicesForSource(sourceId = null, { source = "channel" } = {}) {
    const context = audioEngine.context;
    if (!context) return false;
    const sourceKey = String(source || "channel");
    const targetId = sourceId == null ? null : String(sourceId);
    const now = context.currentTime;
    let changed = false;
    for (const [key, record] of [...state.playback.voiceRecords]) {
      if (record.source !== sourceKey || (targetId != null && record.sourceId !== targetId)) continue;
      const voice = record.voice;
      if (voice && !voice.ended) {
        try {
          if (Number(voice.startedAt) > now + 0.012 && typeof voice.cancel === "function") voice.cancel(now);
          else voice.release?.(now, 0.035);
        } catch {}
      }
      state.playback.voiceRecords.delete(key);
      state.playback.scheduledNoteKeys.delete(key);
      changed = true;
    }
    return changed;
  }

  function schedulePlaybackCatchupForSource(sourceId = null, { source = "channel" } = {}) {
    if (!state.playback.running || !audioEngine.context) return false;
    refreshPlaybackAutoGainScale();
    const context = audioEngine.context;
    const contextNow = context.currentTime;
    const rate = Math.max(0.01, Number(state.playbackRate) || 1);
    const timelineNow = state.playback.startSeconds + Math.max(0, contextNow - state.playback.audioStartTime) * rate;
    const horizonSeconds = state.playback.startSeconds + Math.max(
      0,
      contextNow + CONFIG.playbackLookaheadSeconds - state.playback.audioStartTime,
    ) * rate;
    const sourceKey = String(source || "channel");
    const targetId = sourceId == null ? null : String(sourceId);
    let scheduled = false;
    for (const note of state.playback.notes) {
      if (String(note.source || "channel") !== sourceKey) continue;
      if (targetId != null && String(note.sourceId ?? "") !== targetId) continue;
      if (note.endSeconds <= timelineNow + 0.002 || note.startSeconds > horizonSeconds + 1e-7) continue;
      scheduled = schedulePlaybackNoteVoice(note, { timelineNow, contextNow, rate }) || scheduled;
    }
    if (scheduled) queuePlaybackScheduler(0);
    return scheduled;
  }

  function refreshPlaybackVisualsAfterMuteChange() {
    if (!(state.playback.running || state.playback.loading)) return;
    refreshPlaybackAutoGainScale();
    initializePlaybackVisualEvents(
      state.playback.notes.filter((note) => isPlaybackNoteCurrentlyAudible(note)),
      state.playhead.beat,
    );
  }

  function limitPlaybackOnsetDensity(notes) {
    const maximum = Math.max(16, Number(audioEngine.maxVoices) || 64);
    if (notes.length <= maximum) return notes;
    const limited = [];
    let start = 0;
    while (start < notes.length) {
      const slot = Math.round(notes[start].startSeconds * 250);
      let end = start + 1;
      while (end < notes.length && Math.round(notes[end].startSeconds * 250) === slot) end += 1;
      if (end - start <= maximum) {
        for (let index = start; index < end; index += 1) limited.push(notes[index]);
      } else {
        const chord = notes.slice(start, end)
          .sort((left, right) => getNotePlaybackVelocity(right) - getNotePlaybackVelocity(left) || left.pitch - right.pitch)
          .slice(0, maximum)
          .sort((left, right) => left.pitch - right.pitch);
        limited.push(...chord);
      }
      start = end;
    }
    return limited;
  }

  function preparePlaybackSchedule(startBeat) {
    const startSeconds = beatToSecondsFromMap(startBeat, state.playback.tempoMap);
    let rawNotes;
    if (isMidiReferenceActive()) {
      rawNotes = collectPlaybackNotes(startBeat, { includeMuted: true });
    } else {
      rawNotes = collectPlaybackNotes(startBeat, { includeMuted: true }).map((note) => ({
        ...note,
        startSeconds: beatToSecondsFromMap(note.startBeat, state.playback.tempoMap),
        endSeconds: beatToSecondsFromMap(note.endBeat, state.playback.tempoMap),
      }));
    }
    const notes = limitPlaybackOnsetDensity(rawNotes
      .filter((note) => note.endSeconds > startSeconds + 1e-5 && getNotePlaybackVelocity(note) > 0)
      .sort((left, right) => left.startSeconds - right.startSeconds || left.pitch - right.pitch));
    state.playback.notes = notes;
    state.playback.scheduleIndex = 0;
    state.playback.scheduledNoteKeys = new Set();
    state.playback.voiceRecords = new Map();
    refreshPlaybackAutoGainScale();
    initializePlaybackVisualEvents(notes.filter((note) => isPlaybackNoteCurrentlyAudible(note)), startBeat);
    return notes;
  }

  function queuePlaybackScheduler(delay = CONFIG.playbackSchedulerIntervalMs) {
    window.clearTimeout(state.playback.schedulerTimer);
    if (!state.playback.running) {
      state.playback.schedulerTimer = 0;
      return;
    }
    state.playback.schedulerTimer = window.setTimeout(schedulePlaybackLookahead, Math.max(0, delay));
  }

  function schedulePlaybackLookahead() {
    state.playback.schedulerTimer = 0;
    if (!state.playback.running || !audioEngine.context) return;
    const context = audioEngine.context;
    const contextNow = context.currentTime;
    const rate = Math.max(0.01, Number(state.playbackRate) || 1);
    const timelineNow = state.playback.startSeconds + Math.max(0, contextNow - state.playback.audioStartTime) * rate;
    const horizonSeconds = state.playback.startSeconds + Math.max(
      0,
      contextNow + CONFIG.playbackLookaheadSeconds - state.playback.audioStartTime,
    ) * rate;
    const notes = state.playback.notes;
    const workStartedAt = performance.now();
    let processed = 0;
    while (state.playback.scheduleIndex < notes.length) {
      const note = notes[state.playback.scheduleIndex];
      if (note.startSeconds > horizonSeconds + 1e-7) break;
      state.playback.scheduleIndex += 1;
      processed += 1;
      if (note.endSeconds > timelineNow + 0.002) {
        schedulePlaybackNoteVoice(note, { timelineNow, contextNow, rate });
      }
      if (
        processed >= CONFIG.playbackScheduleBatchLimit
        || performance.now() - workStartedAt >= CONFIG.playbackScheduleBudgetMs
      ) {
        break;
      }
    }
    const next = notes[state.playback.scheduleIndex];
    if (next && next.startSeconds <= horizonSeconds + 1e-7) queuePlaybackScheduler(0);
    else queuePlaybackScheduler(CONFIG.playbackSchedulerIntervalMs);
  }


  function preparePlaybackViewport(startBeat) {
    const viewportWidth = elements.rollViewport.clientWidth;
    if (viewportWidth <= 0) {
      return;
    }

    const absolutePlayheadX = beatToX(startBeat);
    const visiblePlayheadX = absolutePlayheadX - elements.rollViewport.scrollLeft;
    const desiredLeftContext = clamp(
      viewportWidth * CONFIG.playbackStartContextRatio,
      CONFIG.playbackStartContextMinPixels,
      Math.min(CONFIG.playbackStartContextMaxPixels, viewportWidth * 0.42),
    );
    const rightSafeMargin = clamp(viewportWidth * 0.16, 72, 190);
    const rightSafeX = viewportWidth - rightSafeMargin;

    if (visiblePlayheadX >= desiredLeftContext && visiblePlayheadX <= rightSafeX) {
      return;
    }

    const target = snapScrollLeftToBeatUnit(
      absolutePlayheadX - desiredLeftContext,
      CONFIG.minimumNoteBeat,
    );
    elements.rollViewport.scrollLeft = target;
    updatePlayheadVisual();
    drawTimeline();
  }

  async function startPlayback() {
    if (state.playback.running || state.playback.loading) return;

    const token = ++state.playback.requestToken;
    const endBeat = getPlaybackEndBeat();
    if (endBeat <= 0) {
      showToast("재생할 노트가 없습니다.");
      return;
    }

    let startBeat = clamp(state.playhead.beat, 0, endBeat);
    if (startBeat >= endBeat) {
      startBeat = 0;
      setPlayheadBeat(0);
      elements.rollViewport.scrollLeft = 0;
    }
    state.playback.loading = true;
    preparePlaybackViewport(startBeat);
    state.playback.startBeat = startBeat;
    state.playback.endBeat = endBeat;
    const midiDocument = isMidiReferenceActive() ? getActiveMidiDocument() : null;
    state.playback.tempoMap = midiDocument
      ? ensureMidiPlaybackCache(midiDocument)?.tempoMap || createTempoTimeMap(midiDocument.tempoEvents || [])
      : createTempoTimeMap();
    state.playback.startSeconds = beatToSecondsFromMap(startBeat, state.playback.tempoMap);
    state.playback.endSeconds = beatToSecondsFromMap(endBeat, state.playback.tempoMap);
    state.playback.scrollAnimation = null;
    state.playback.lastTimelineDrawAt = 0;
    const playbackNotes = preparePlaybackSchedule(startBeat);
    const hasPlayableAudio = state.audioClips.some((clip) => (
      !clip.muted
      && getAudioClipEndBeat(clip) > startBeat + 1e-7
      && Boolean(getAudioRuntime(clip.id)?.audioBuffer)
    ));
    if (!playbackNotes.length && !hasPlayableAudio) {
      state.playback.loading = false;
      updatePlayButton();
      showToast("음소거되지 않은 재생 노트나 오디오가 없습니다.");
      return;
    }
    updatePlayButton();

    try {
      audioEngine.ensureContext();
      await audioEngine.resume();
      if (playbackNotes.length) {
        await audioEngine.ensureReady();
      }
      if (playbackNotes.length && typeof audioEngine.preloadPitches === "function") {
        await audioEngine.preloadPitches(playbackNotes);
      }
      if (token !== state.playback.requestToken) return;

      const context = audioEngine.context;
      const scheduleDelay = 0.14;
      state.playback.audioStartTime = context.currentTime + scheduleDelay;
      state.playback.startedAt = performance.now() + scheduleDelay * 1000;
      state.playback.loading = false;
      state.playback.running = true;
      updatePlayButton();
      scheduleAudioClipsForPlayback(startBeat);
      if (playbackNotes.length) schedulePlaybackLookahead();
      state.playback.animationFrame = requestAnimationFrame(playbackFrame);
    } catch (error) {
      console.error(error);
      if (token === state.playback.requestToken) {
        state.playback.loading = false;
        state.playback.running = false;
        window.clearTimeout(state.playback.schedulerTimer);
        state.playback.schedulerTimer = 0;
        clearPlaybackKeyboardPitches();
        updatePlayButton();
        showToast(error instanceof Error ? error.message : "소리를 재생하지 못했습니다.");
      }
    }
  }


  function easeInOutCubic(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function getPlaybackLeftContext(viewportWidth = elements.rollViewport?.clientWidth || 0) {
    const width = Math.max(0, Number(viewportWidth) || 0);
    return clamp(
      width * CONFIG.pageScrollLeftMarginRatio,
      72,
      Math.min(190, width * 0.3),
    );
  }

  function restorePlaybackPlayheadFromLeft(currentBeat = state.playhead.beat, { force = false } = {}) {
    const viewport = elements.rollViewport;
    const viewportWidth = viewport?.clientWidth || 0;
    if (!viewport || viewportWidth <= 0) return false;
    if (!force && state.customScrollDrag?.axis === "x") return false;

    const safeBeat = clamp(Number(currentBeat) || 0, 0, getTotalBeats());
    const absolutePlayheadX = beatToX(safeBeat);
    const visiblePlayheadX = absolutePlayheadX - viewport.scrollLeft;
    if (visiblePlayheadX >= -1) return false;

    const target = snapScrollLeftToBeatUnit(
      clamp(absolutePlayheadX - getPlaybackLeftContext(viewportWidth), 0, getMaxScrollLeft()),
      CONFIG.minimumNoteBeat,
      "floor",
    );
    state.playback.scrollAnimation = null;
    if (Math.abs(target - viewport.scrollLeft) < 0.5) return false;
    viewport.scrollLeft = target;
    return true;
  }

  function updatePagedPlaybackScroll(now, currentBeat) {
    const viewportWidth = elements.rollViewport.clientWidth;
    if (viewportWidth <= 0) {
      return;
    }
    if (state.customScrollDrag?.axis === "x") {
      return;
    }

    const animation = state.playback.scrollAnimation;
    if (animation) {
      const progress = clamp((now - animation.startedAt) / animation.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      const interpolated = animation.from + (animation.to - animation.from) * eased;
      elements.rollViewport.scrollLeft = snapScrollLeftToBeatUnit(
        interpolated,
        CONFIG.minimumNoteBeat,
      );
      if (progress >= 1) {
        state.playback.scrollAnimation = null;
      }
      return;
    }

    if (restorePlaybackPlayheadFromLeft(currentBeat)) {
      return;
    }

    const absolutePlayheadX = beatToX(currentBeat);
    const visiblePlayheadX = absolutePlayheadX - elements.rollViewport.scrollLeft;
    const rightMargin = clamp(
      viewportWidth * CONFIG.pageScrollRightMarginRatio,
      96,
      Math.min(260, viewportWidth * 0.35),
    );
    const triggerX = viewportWidth - rightMargin;
    if (visiblePlayheadX < triggerX) {
      return;
    }

    const leftMargin = getPlaybackLeftContext(viewportWidth);
    const maxScrollLeft = getMaxScrollLeft();
    const target = snapScrollLeftToBeatUnit(
      clamp(absolutePlayheadX - leftMargin, 0, maxScrollLeft),
      CONFIG.minimumNoteBeat,
      "ceil",
    );
    const from = elements.rollViewport.scrollLeft;
    if (target <= from + 1) {
      return;
    }

    const pixelsPerMillisecond = getQuarterWidth() * (getTempoAtBeat(currentBeat) / 60) * Math.max(0.01, state.playbackRate) / 1000;
    const safeTravel = Math.max(36, triggerX - leftMargin - 18);
    const adaptiveDuration = pixelsPerMillisecond > 0
      ? safeTravel / pixelsPerMillisecond
      : CONFIG.pageScrollDuration;

    state.playback.scrollAnimation = {
      from,
      to: target,
      startedAt: now,
      duration: clamp(adaptiveDuration, 70, CONFIG.pageScrollDuration),
    };
  }

  function playbackFrame(now) {
    if (!state.playback.running) {
      return;
    }
    const elapsedSeconds = Math.max(
      0,
      (audioEngine.context?.currentTime || state.playback.audioStartTime) - state.playback.audioStartTime,
    );
    const currentTimelineSeconds = state.playback.startSeconds + elapsedSeconds * Math.max(0.01, Number(state.playbackRate) || 1);
    const currentBeat = secondsToBeatFromMap(currentTimelineSeconds, state.playback.tempoMap);

    if (currentTimelineSeconds >= state.playback.endSeconds || currentBeat >= state.playback.endBeat) {
      setPlayheadBeat(state.playback.endBeat);
      stopPlayback(false);
      return;
    }

    const visualBeat = getPlaybackVisualBeat(currentBeat);
    state.playhead.beat = visualBeat;
    updatePlaybackKeyboardPitches(currentBeat);
    updatePagedPlaybackScroll(now, visualBeat);
    updatePlayheadVisual();
    if (now - state.playback.lastTimelineDrawAt >= 32) {
      state.playback.lastTimelineDrawAt = now;
      drawTimeline();
      updatePlaybackTimeInfo(currentBeat);
    }
    state.playback.animationFrame = requestAnimationFrame(playbackFrame);
  }

  function stopPlayback(resetToStart = false) {
    state.playback.requestToken += 1;
    state.playback.loading = false;
    state.playback.running = false;
    state.playback.scrollAnimation = null;
    cancelAnimationFrame(state.playback.animationFrame);
    window.clearTimeout(state.playback.schedulerTimer);
    state.playback.schedulerTimer = 0;
    state.playback.notes = [];
    state.playback.scheduleIndex = 0;
    state.playback.scheduledNoteKeys = new Set();
    state.playback.voiceRecords = new Map();
    state.playback.autoGainScale = 1;
    stopScheduledAudioClips();
    audioEngine.stopAll();
    clearPlaybackKeyboardPitches();
    updatePlayButton();
    if (resetToStart) {
      setPlayheadBeat(0);
      elements.rollViewport.scrollLeft = 0;
    } else {
      updatePlayheadVisual();
      drawTimeline();
      updatePlaybackTimeInfo();
    }
  }

  function togglePlayback() {
    if (state.playback.running || state.playback.loading) {
      stopPlayback(false);
    } else {
      startPlayback();
    }
  }

  function moveToTimelineStart() {
    stopPlayback(false);
    setPlayheadBeat(0);
    elements.rollViewport.scrollLeft = 0;
    updatePlayheadVisual();
    drawTimeline();
  }

  function moveToTimelineEnd() {
    stopPlayback(false);
    const endBeat = getPlaybackEndBeat();
    setPlayheadBeat(endBeat);
    const viewportWidth = elements.rollViewport.clientWidth;
    const rightPadding = Math.min(96, Math.max(36, viewportWidth * 0.12));
    elements.rollViewport.scrollLeft = clamp(
      beatToX(endBeat) - viewportWidth + rightPadding,
      0,
      getMaxScrollLeft(),
    );
    updatePlayheadVisual();
    drawTimeline();
  }


  function serializeProject() {
    return {
      format: "mml-piano-roll-project",
      version: 21,
      projectName: state.projectName,
      snapValue: state.snapValue,
      rowHeight: state.rowHeight,
      zoom: state.zoom,
      nextNoteId: state.nextNoteId,
      nextTempoId: state.nextTempoId,
      nextMidiDocumentId: state.nextMidiDocumentId,
      nextAudioClipId: state.nextAudioClipId,
      channels: state.channels,
      tempos: state.tempos.map((tempo) => ({ ...tempo })),
      // v21: 지원 음악 파일은 공통 플러그인을 거쳐 불러오는 즉시 일반 편집 채널로 변환됩니다.
      midiDocuments: [],
      audioClips: state.audioClips.map((clip) => ({ ...clip, assetAvailable: Boolean(getAudioRuntime(clip.id)?.audioBuffer) })),
      editor: {
        activeChannel: state.activeChannel,
        activePanel: state.activePanel,
        activeMidiDocumentId: state.activeMidiDocumentId,
        activeAudioClipId: state.activeAudioClipId,
        playheadBeat: state.playhead.beat,
        scrollLeft: elements.rollViewport.scrollLeft,
        scrollTop: elements.rollViewport.scrollTop,
        timelineBeats: getTotalBeats(),
        sidebarTab: state.sidebarTab,
        collapsedChannelGroups: { ...state.collapsedChannelGroups },
        collapsedMidiDocumentIds: Array.from(state.collapsedMidiDocumentIds),
      },
    };
  }

  function saveProject() {
    shrinkTimelineToContent();
    const data = JSON.stringify(serializeProject(), null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    const safeName = (state.projectName || "mobibard-project").replace(/[\\/:*?"<>|]/g, "_");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeName}.mmlproj.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    state.dirty = false;
    updateDirtyState();
    scheduleAutosave(0);
    showToast("프로젝트를 저장했습니다.");
  }

  async function loadProjectFromFile(file, { notify = true } = {}) {
    state.channelNoteRuntime.clear();
    state.audioRuntime.clear();
    state.collapsedMidiDocumentIds.clear();
    const text = await file.text();
    const data = JSON.parse(text);
    validateProject(data);
    stopPlayback(false);
    releaseKeyboardVoice(true);
    clearEditorPitchPreview(true);

    state.projectName = data.projectName || file.name.replace(/\.(mmlproj\.)?json$/i, "");
    state.snapValue = [1, 2, 4, 8, 16, 32, 64].includes(Number(data.snapValue)) ? Number(data.snapValue) : 4;
    state.rowHeight = normalizeRowHeight(data.rowHeight);
    state.zoom = normalizeZoom(data.zoom);
    const loadedMidiDocuments = Array.isArray(data.midiDocuments)
      ? data.midiDocuments
      : data.midiReference?.groups?.length
        ? [data.midiReference]
        : [];
    state.midiDocuments = loadedMidiDocuments.map((midiDocument, index) => {
      const cloned = normalizeMidiDocumentInstruments({ ...createDefaultMidiReference(), ...cloneMidiReferenceForStorage(midiDocument) });
      cloned.id = cloned.id || `midi-doc-${index + 1}`;
      cloned.title = cloned.title || stripMidiFileExtension(cloned.fileName) || `MIDI ${index + 1}`;
      if (!cloned.tempoEvents.length) {
        cloned.tempoEvents = [{ id: 1, beat: 0, bpm: 120, fixed: true }];
      }
      buildMidiPlaybackCache(cloned);
      return cloned;
    });
    const highestMidiDocumentNumber = state.midiDocuments.reduce((maximum, midiDocument) => {
      const match = String(midiDocument.id || "").match(/(\d+)$/);
      return Math.max(maximum, match ? Number(match[1]) : 0);
    }, 0);
    state.nextMidiDocumentId = Math.max(
      Number(data.nextMidiDocumentId) || 1,
      highestMidiDocumentNumber + 1,
      state.midiDocuments.length + 1,
    );
    state.audioClips = (Array.isArray(data.audioClips) ? data.audioClips : []).map((clip, index) => {
      const normalized = normalizeAudioClip(clip, index);
      normalized.assetAvailable = false;
      return normalized;
    });
    const highestAudioNumber = state.audioClips.reduce((maximum, clip) => {
      const match = String(clip.id || "").match(/(\d+)$/);
      return Math.max(maximum, match ? Number(match[1]) : 0);
    }, 0);
    state.nextAudioClipId = Math.max(
      Number(data.nextAudioClipId) || 1,
      highestAudioNumber + 1,
      state.audioClips.length + 1,
    );
    state.activeAudioClipId = null;
    setActiveMidiReference(null);
    const loadedContentEndBeat = Math.max(
      0,
      ...data.channels.flatMap((channel) => channel.notes.map((note) =>
        Math.max(0, Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || 0)
      )),
      ...(Array.isArray(data.tempos) ? data.tempos.map((tempo) => Math.max(0, Number(tempo.beat) || 0)) : []),
      ...state.audioClips.map((clip) => getAudioClipEndBeat(clip)),
      Math.max(0, Number(data.editor?.playheadBeat) || 0),
    );
    state.timelineBeats = Math.max(
      CONFIG.beatsPerMeasure,
      Number(data.editor?.timelineBeats) || 0,
      loadedContentEndBeat + CONFIG.minimumNoteBeat,
    );
    state.channels = data.channels.map((channel, index) => ({
      id: Number(channel.id) || index + 1,
      name: String(channel.name || `Ch${Number(channel.id) || index + 1}`),
      color: getChannelColor(channel, index),
      muted: Boolean(channel.muted),
      visible: channel.visible !== false,
      instrument: String(channel.instrument || "Acoustic Grand Piano"),
      notes: normalizeMonophonicNotes(channel.notes.map((note) => {
        const startBeat = clamp(
          Number(note.startBeat),
          0,
          getTotalBeats() - CONFIG.minimumNoteBeat,
        );
        const durationBeat = clamp(
          Number(note.durationBeat) || CONFIG.minimumNoteBeat,
          CONFIG.minimumNoteBeat,
          getTotalBeats() - startBeat,
        );
        return {
          id: Number(note.id),
          pitch: clamp(Number(note.pitch), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat,
          durationBeat,
          velocity: normalizeNoteDynamics(note).velocity,
          volume: normalizeNoteDynamics(note).volume,
        };
      })),
    }));

    if (!state.channels.length) {
      state.channels = createDefaultChannels(1);
    }
    normalizeDefaultChannelNames();

    // v21부터 지원 음악 파일의 별도 "원본 자료" 트리를 사용하지 않습니다.
    // 이전 프로젝트/자동저장에 남은 원본 악기는 데이터 손실 없이 일반 편집 채널로 1회 변환합니다.
    state.nextNoteId = Math.max(
      Number(data.nextNoteId) || 1,
      ...state.channels.flatMap((channel) => channel.notes.map((note) => note.id + 1)),
    );
    if (state.midiDocuments.length) {
      const legacyMidiDocuments = state.midiDocuments.slice();
      state.midiDocuments = [];
      state.activeMidiDocumentId = null;
      setActiveMidiReference(null);
      legacyMidiDocuments.forEach((midiDocument) => {
        importMidiSelectionAsEditableChannels(midiDocument, {
          openNew: false,
          fileName: midiDocument.fileName || `${midiDocument.title || "MIDI"}.mid`,
        });
      });
      normalizeDefaultChannelNames();
    }

    const loadedTempos = Array.isArray(data.tempos) ? data.tempos : [];
    const tempoByBeat = new Map();
    let initialTempoBpm = 120;
    for (const item of loadedTempos) {
      const beat = clamp(Number(item.beat), 0, getTotalBeats());
      const bpm = Number(item.bpm);
      if (!Number.isInteger(bpm) || bpm < CONFIG.minTempo || bpm > CONFIG.maxTempo) {
        continue;
      }
      if (Math.abs(beat) < 1e-7) {
        initialTempoBpm = bpm;
        continue;
      }
      const key = Number(beat.toFixed(6));
      if (!tempoByBeat.has(key)) {
        tempoByBeat.set(key, {
          id: Number(item.id) || 0,
          beat: key,
          bpm,
          fixed: false,
        });
      }
    }
    state.tempos = [{ id: 1, beat: 0, bpm: initialTempoBpm, fixed: true }];
    const usedTempoIds = new Set([1]);
    let generatedTempoId = 2;
    for (const tempo of tempoByBeat.values()) {
      const requestedId = Number(tempo.id);
      if (requestedId > 1 && !usedTempoIds.has(requestedId)) {
        tempo.id = requestedId;
      } else {
        while (usedTempoIds.has(generatedTempoId)) {
          generatedTempoId += 1;
        }
        tempo.id = generatedTempoId++;
      }
      usedTempoIds.add(tempo.id);
      state.tempos.push(tempo);
    }
    state.nextTempoId = Math.max(
      Number(data.nextTempoId) || 2,
      ...state.tempos.map((tempo) => tempo.id + 1),
    );
    state.nextNoteId = Math.max(
      Number(data.nextNoteId) || 1,
      ...state.channels.flatMap((channel) => channel.notes.map((note) => note.id + 1)),
    );
    state.activeChannel = clamp(Number(data.editor?.activeChannel) || 0, 0, state.channels.length - 1);
    const requestedMidiId = data.editor?.activeMidiDocumentId;
    const requestedMidi = state.midiDocuments.find((midiDocument) => String(midiDocument.id) === String(requestedMidiId));
    const requestedAudio = state.audioClips.find((clip) => String(clip.id) === String(data.editor?.activeAudioClipId));
    if (data.editor?.activePanel === "midi" && requestedMidi) {
      state.activePanel = "midi";
      setActiveMidiReference(requestedMidi);
      state.timelineBeats = Math.max(state.timelineBeats, getMidiReferenceEndBeat(requestedMidi) + CONFIG.minimumNoteBeat);
    } else if (data.editor?.activePanel === "audio" && requestedAudio) {
      state.activePanel = "audio";
      state.activeAudioClipId = requestedAudio.id;
      setActiveMidiReference(null);
      state.timelineBeats = Math.max(state.timelineBeats, getAudioClipEndBeat(requestedAudio) + CONFIG.minimumNoteBeat);
    } else {
      // 이전 버전의 "선택 없음" 상태도 첫/기존 편집 채널 선택 상태로 복원합니다.
      state.activePanel = "notes";
      state.activeAudioClipId = null;
      setActiveMidiReference(null);
    }
    ensureTimelineFitsViewport();
    state.playhead.beat = clamp(
      Number(data.editor?.playheadBeat) || 0,
      0,
      getTotalBeats(),
    );
    state.collapsedChannelGroups = {
      edit: Boolean(data.editor?.collapsedChannelGroups?.edit),
      source: Boolean(data.editor?.collapsedChannelGroups?.source),
    };
    const validMidiIds = new Set(state.midiDocuments.map((item) => String(item.id)));
    state.collapsedMidiDocumentIds = new Set(
      (Array.isArray(data.editor?.collapsedMidiDocumentIds) ? data.editor.collapsedMidiDocumentIds : [])
        .map(String)
        .filter((id) => validMidiIds.has(id)),
    );
    state.sidebarTab = data.editor?.sidebarTab === "history" ? "history" : "channels";
    clearNoteSelection();
    stopRollDragAutoScroll();
    state.interaction = null;
    state.tempoDrag = null;
    state.dirty = false;

    elements.snapSelect.value = String(state.snapValue);
    elements.pitchSpacingSelect.value = String(state.rowHeight);
    renderAll();
    setSidebarTab(state.sidebarTab, { persist: false });
    initializeHistory();

    requestAnimationFrame(() => {
      const savedScrollLeft = Math.max(0, Number(data.editor?.scrollLeft) || 0);
      const fileVersion = Number(data.version) || 1;
      let migratedScrollLeft;
      if (fileVersion >= 7) {
        migratedScrollLeft = savedScrollLeft;
      } else if (fileVersion >= 4) {
        // 버전 4~6은 앞 여백이 1박자 폭이었으므로 고정 픽셀 여백으로 보정합니다.
        migratedScrollLeft = Math.max(0, savedScrollLeft - getQuarterWidth() + getPreRollWidth());
      } else if (fileVersion >= 2) {
        // 버전 2~3은 앞 여백이 4박자 폭이었습니다.
        migratedScrollLeft = Math.max(0, savedScrollLeft - 4 * getQuarterWidth() + getPreRollWidth());
      } else {
        migratedScrollLeft = savedScrollLeft + getPreRollWidth();
      }
      elements.rollViewport.scrollLeft = migratedScrollLeft;
      const savedScrollTop = Math.max(0, Number(data.editor?.scrollTop) || 0);
      const migratedScrollTop = Number(data.version) >= 3
        ? savedScrollTop
        : savedScrollTop + 12 * CONFIG.defaultRowHeight;
      elements.rollViewport.scrollTop = migratedScrollTop;
      updatePlayheadVisual();
      drawTimeline();
      drawKeyboard();
    });

    if (notify) {
      showToast(`${state.projectName}을 불러왔습니다.`);
    }
    if (!state.autosave.restoring) {
      scheduleAutosave(0);
    }
  }

  function validateProject(data) {
    if (!data || typeof data !== "object") {
      throw new Error("프로젝트 형식이 올바르지 않습니다.");
    }
    if (!Array.isArray(data.channels)) {
      throw new Error("채널 데이터가 없습니다.");
    }
    for (const channel of data.channels) {
      if (!Array.isArray(channel.notes)) {
        throw new Error("노트 데이터 형식이 올바르지 않습니다.");
      }
    }
  }

  function resetProject({ notify = true } = {}) {
    state.channelNoteRuntime.clear();
    state.collapsedMidiDocumentIds.clear();
    state.collapsedChannelGroups = { edit: false, source: false };
    stopPlayback(true);
    releaseKeyboardVoice(true);
    clearEditorPitchPreview(true);
    state.projectName = "새 프로젝트";
    state.snapValue = 4;
    state.rowHeight = CONFIG.defaultRowHeight;
    state.zoom = 1;
    state.timelineBeats = CONFIG.beatsPerMeasure;
    state.activeChannel = 0;
    state.activePanel = "notes";
    state.editTool = "note";
    state.playhead.beat = 0;
    stopRollDragAutoScroll();
    state.interaction = null;
    state.tempoDrag = null;
    clearNoteSelection();
    state.nextNoteId = 1;
    state.nextTempoId = 2;
    state.channels = createDefaultChannels();
    state.tempos = createDefaultTempos();
    state.midiDocuments = [];
    state.activeMidiDocumentId = null;
    state.nextMidiDocumentId = 1;
    state.audioClips = [];
    state.activeAudioClipId = null;
    state.nextAudioClipId = 1;
    state.audioRuntime.clear();
    setActiveMidiReference(null);
    clearMidiSelection();
    state.dirty = false;
    elements.snapSelect.value = "4";
    elements.pitchSpacingSelect.value = String(state.rowHeight);
    elements.rollViewport.scrollLeft = 0;
    elements.rollViewport.scrollTop = 0;
    renderAll();
    requestAnimationFrame(() => {
      elements.rollViewport.scrollTop = Math.max(0, pitchToY(60) - elements.rollViewport.clientHeight / 2);
      drawKeyboard();
    });
    initializeHistory();
    scheduleAutosave(0);
    if (notify) showToast("새 프로젝트를 만들었습니다.");
  }

  function showConfirmDialog({ title = "확인", message = "계속할까요?", confirmLabel = "확인" } = {}) {
    if (!elements.confirmDialog || typeof elements.confirmDialog.showModal !== "function") {
      return Promise.resolve(window.confirm(message));
    }
    if (elements.confirmDialog.open) {
      elements.confirmDialog.close("cancel");
    }
    elements.confirmDialogTitle.textContent = title;
    elements.confirmDialogMessage.textContent = message;
    elements.confirmDialogConfirm.textContent = confirmLabel;
    elements.confirmDialog.returnValue = "cancel";
    return new Promise((resolve) => {
      const finish = () => resolve(elements.confirmDialog.returnValue === "confirm");
      elements.confirmDialog.addEventListener("close", finish, { once: true });
      elements.confirmDialog.showModal();
      requestAnimationFrame(() => elements.confirmDialogCancel.focus());
    });
  }

  async function requestClearMidiReference() {
    const document = getActiveMidiDocument();
    if (!document) return false;
    const activeGroup = getMidiGroupById();
    if (activeGroup) {
      return requestDeleteMidiGroup(document.id, activeGroup.id);
    }
    const confirmed = await showConfirmDialog({
      title: "원본 자료 삭제",
      message: `${document.title || document.fileName || "선택한 원본 자료"} 전체를 삭제할까요?`,
      confirmLabel: "삭제",
    });
    return confirmed ? clearMidiReference() : false;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      elements.toast.classList.remove("visible");
    }, 1700);
  }

  function cancelLongPress() {
    const pending = state.longPress;
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timer);
    state.longPress = null;
  }

  function cancelPointerInteractionForLongPress(pointerId) {
    if (state.interaction?.pointerId === pointerId) {
      stopRollDragAutoScroll();
      state.interaction = null;
      clearEditorPitchPreview(true);
      try { elements.rollCanvas.releasePointerCapture(pointerId); } catch {}
      state.suppressNextRollPointerUp = pointerId;
      drawRoll();
      updateChannelInfo();
    }
    if (state.tempoDrag?.pointerId === pointerId) {
      const tempo = state.tempos.find((item) => item.id === state.tempoDrag.tempoId);
      if (tempo) {
        tempo.beat = state.tempoDrag.originalBeat;
      }
      state.tempoDrag = null;
      try { elements.timelineCanvas.releasePointerCapture(pointerId); } catch {}
      drawTimeline();
    }
    if (state.tempoTouchTap?.pointerId === pointerId) {
      state.tempoTouchTap = null;
      try { elements.timelineCanvas.releasePointerCapture(pointerId); } catch {}
    }
    if (state.playhead.pointerId === pointerId) {
      state.playhead.pointerId = null;
      try { elements.timelineCanvas.releasePointerCapture(pointerId); } catch {}
    }
  }

  function shouldUseLongPress(target) {
    return Boolean(target?.closest?.(
      "#timelineCanvas, #rollCanvas, #keyboardCanvas, .channel-tab-item, [data-context-area='midi-instrument'], .channel-detail-toolbar, #channelPanel",
    ));
  }

  function beginLongPress(event) {
    if (event.pointerType === "mouse" || event.button !== 0 || !shouldUseLongPress(event.target)) {
      return;
    }
    cancelLongPress();
    const target = event.target;
    const pending = {
      pointerId: event.pointerId,
      target,
      clientX: event.clientX,
      clientY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      fired: false,
      timer: 0,
    };
    pending.timer = window.setTimeout(() => {
      if (state.longPress !== pending) {
        return;
      }
      pending.fired = true;
      cancelPointerInteractionForLongPress(pending.pointerId);
      state.suppressContextMenuUntil = 0;
      const synthetic = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: pending.clientX,
        clientY: pending.clientY,
        button: 2,
        buttons: 0,
      });
      target.dispatchEvent(synthetic);
      if (navigator.vibrate) {
        try { navigator.vibrate(12); } catch {}
      }
    }, CONFIG.longPressDurationMs);
    state.longPress = pending;
  }

  function moveLongPress(event) {
    const pending = state.longPress;
    if (!pending || pending.pointerId !== event.pointerId || pending.fired) {
      return;
    }
    pending.clientX = event.clientX;
    pending.clientY = event.clientY;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > CONFIG.longPressMoveTolerance) {
      cancelLongPress();
    }
  }

  function endLongPress(event) {
    const pending = state.longPress;
    if (!pending || pending.pointerId !== event.pointerId) {
      return;
    }
    const fired = pending.fired;
    cancelLongPress();
    if (fired) {
      if (state.suppressNextRollPointerUp === event.pointerId) {
        state.suppressNextRollPointerUp = null;
      }
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // 모든 영역의 우클릭 메뉴를 한 곳에서 등록/교체할 수 있는 기반입니다.
  const contextMenuRegistry = new Map();

  function registerContextMenu(areaName, factory) {
    contextMenuRegistry.set(areaName, factory);
  }

  function resolveContextArea(target) {
    const areaElement = target.closest("[data-context-area]");
    return {
      name: areaElement?.dataset.contextArea || "app",
      element: areaElement || elements.app,
    };
  }

  function openContextMenu(event) {
    event.preventDefault();
    if (state.channelDrag.dragging) {
      event.stopPropagation();
      cancelChannelPointerDrag();
      state.suppressNextContextMenu = false;
      closeContextMenu();
      return;
    }
    // 마우스는 왼쪽 버튼을 누른 채 오른쪽 버튼을 눌렀을 때 추가 pointerdown을
    // 보내지 않을 수 있습니다. contextmenu 경로에서도 편집 중이면 ESC와 동일하게 취소합니다.
    if (isCancelableNoteInteraction()) {
      event.stopPropagation();
      cancelCurrentNoteInteraction();
      state.suppressNextContextMenu = false;
      closeContextMenu();
      return;
    }
    if (state.suppressNextContextMenu) {
      state.suppressNextContextMenu = false;
      closeContextMenu();
      return;
    }
    if (performance.now() < state.suppressContextMenuUntil) {
      closeContextMenu();
      return;
    }
    const area = resolveContextArea(event.target);
    if (
      (area.name === "piano-roll" && xToBeat(pointerToRoll(event).x) < 0) ||
      (area.name === "timeline" && timelineRawBeatFromPointer(event) < 0)
    ) {
      if (area.name === "piano-roll") {
        clearNoteSelection();
        drawRoll();
        updateChannelInfo();
      }
      closeContextMenu();
      return;
    }
    if (area.name === "piano-roll" && !isMidiReferenceActive()) {
      const point = pointerToRoll(event);
      if (!findNoteAt(point.x, point.y)) {
        clearNoteSelection();
        drawRoll();
        updateChannelInfo();
        closeContextMenu();
        return;
      }
    }
    const factory = contextMenuRegistry.get(area.name) || contextMenuRegistry.get("app");
    const items = factory?.({ event, area, state }) || [];
    renderContextMenu(items, event.clientX, event.clientY, area.name);
  }

  function renderContextMenu(items, x, y, areaName) {
    elements.contextMenu.replaceChildren();

    const label = document.createElement("div");
    label.className = "menu-label";
    label.textContent = `영역: ${areaName}`;
    elements.contextMenu.append(label);

    for (const item of items) {
      if (item === "separator") {
        const separator = document.createElement("div");
        separator.className = "menu-separator";
        elements.contextMenu.append(separator);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      if (item.danger) {
        button.classList.add("danger");
      }
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        closeContextMenu();
        item.action?.();
      });
      elements.contextMenu.append(button);
    }

    elements.contextMenu.hidden = false;
    const rect = elements.contextMenu.getBoundingClientRect();
    elements.contextMenu.style.left = `${clamp(x, 4, window.innerWidth - rect.width - 4)}px`;
    elements.contextMenu.style.top = `${clamp(y, 4, window.innerHeight - rect.height - 4)}px`;
  }

  function closeContextMenu() {
    elements.contextMenu.hidden = true;
  }

  function handleRightMouseCancelDuringChannelDrag(event) {
    if (event.button !== 2 || !state.channelDrag.dragging) return;
    event.preventDefault();
    event.stopPropagation();
    cancelChannelPointerDrag();
    state.suppressNextContextMenu = true;
    closeContextMenu();
  }

  function handleRightMouseCancelDuringNoteEdit(event) {
    // Pointer Events의 pointerdown은 마우스에서 첫 버튼을 눌렀을 때만 발생합니다.
    // 따라서 왼쪽 버튼으로 드래그 중 오른쪽 버튼을 추가로 누르는 동작은 mousedown으로 잡아야 합니다.
    if (event.button !== 2 || !isCancelableNoteInteraction()) return;
    event.preventDefault();
    event.stopPropagation();
    cancelCurrentNoteInteraction();
    state.suppressNextContextMenu = true;
    closeContextMenu();
  }

  function registerDefaultContextMenus() {
    const commonItems = () => [
      { label: "새 파일", action: resetProject },
      { label: "불러오기", action: () => openFilePickerInput(elements.fileInput) },
      { label: "저장", action: saveProject },
    ];

    registerContextMenu("app", commonItems);
    registerContextMenu("topbar", commonItems);
    registerContextMenu("piano-section", () => [
      { label: "45% 전체 보기", action: () => { setZoom(0.45); elements.rollViewport.scrollLeft = 0; } },
      { label: "100% 확대", action: () => setZoom(1) },
      "separator",
      {
        label: "첫 위치로 이동",
        action: () => {
          setPlayheadBeat(0, { stop: true });
          elements.rollViewport.scrollLeft = 0;
        },
      },
    ]);
    registerContextMenu("timeline", ({ event }) => {
      const beat = timelineBeatFromPointer(event);
      const tempo = findTempoMarkerFromPointer(event);
      if (isMidiReferenceActive()) {
        return [
          tempo
            ? { label: `MIDI 템포 ${tempo.bpm} · 읽기 전용`, disabled: true }
            : { label: "MIDI 템포 맵 · 읽기 전용", disabled: true },
          { label: "재생선을 여기에 놓기", action: () => setPlayheadBeat(tempo?.beat ?? beat, { stop: true }) },
          {
            label: "0 마디 시작으로 이동",
            action: () => {
              setPlayheadBeat(0, { stop: true });
              elements.rollViewport.scrollLeft = 0;
            },
          },
        ];
      }
      if (tempo?.fixed) {
        return [
          { label: `0번 · ${tempo.bpm}`, disabled: true },
          { label: "템포 값 변경", action: () => editTempo(tempo) },
          { label: "위치 고정 · 이동/삭제 불가", disabled: true },
          "separator",
          { label: "재생선을 0번에 놓기", action: () => setPlayheadBeat(0, { stop: true }) },
        ];
      }
      if (tempo) {
        return [
          { label: `${tempo.bpm}`, disabled: true },
          { label: "템포 값 변경", action: () => editTempo(tempo) },
          { label: "템포 삭제", danger: true, action: () => deleteTempo(tempo) },
          "separator",
          { label: "재생선을 여기에 놓기", action: () => setPlayheadBeat(tempo.beat, { stop: true }) },
        ];
      }
      return [
        { label: `${beat.toFixed(3)} beat에 템포 추가`, disabled: beat <= 0, action: () => addTempoAtBeat(beat) },
        { label: "재생선을 여기에 놓기", action: () => setPlayheadBeat(beat, { stop: true }) },
        {
          label: "0 마디 시작으로 이동",
          action: () => {
            setPlayheadBeat(0, { stop: true });
            elements.rollViewport.scrollLeft = 0;
          },
        },
      ];
    });
    registerContextMenu("keyboard", ({ event }) => {
      const rect = elements.keyboardCanvas.getBoundingClientRect();
      const pitch = keyboardPitchAt(
        clamp(event.clientX - rect.left, 0, rect.width),
        event.clientY - rect.top + elements.rollViewport.scrollTop,
        rect.width,
      );
      return [
        {
          label: `${noteLabel(pitch)} 미리 듣기`,
          action: async () => {
            try {
              audioEngine.ensureContext();
              await audioEngine.ensureReady();
              audioEngine.playNote(pitch, 108, null, 0.75);
            } catch (error) {
              showToast(error instanceof Error ? error.message : "소리를 재생하지 못했습니다.");
            }
          },
        },
        { label: `${noteLabel(pitch)} 행으로 이동`, action: () => { elements.rollViewport.scrollTop = pitchToY(pitch); } },
        { label: "중앙 C로 이동", action: () => { elements.rollViewport.scrollTop = Math.max(0, pitchToY(60) - 120); } },
      ];
    });
    registerContextMenu("piano-roll", ({ event }) => {
      if (isMidiReferenceActive()) {
        return [
          { label: "MIDI 노트 · 읽기 전용", disabled: true },
          { label: "채널 복사", disabled: !(getMidiGroupById()?.notes.length || getActiveMidiDocument()?.groups?.some((group) => group.notes?.length)), action: openMidiTransferDialog },
        ];
      }
      const point = pointerToRoll(event);
      const clicked = findNoteAt(point.x, point.y);
      if (!clicked) {
        return state.noteClipboard?.notes?.length
          ? [{ label: "재생선 위치에 붙여넣기", action: pasteNotesFromClipboard }]
          : [];
      }
      if (!state.selectedNoteIds.has(clicked.id)) {
        selectOnlyNote(clicked.id);
        drawRoll();
        updateChannelInfo();
      }
      return [
        { label: "선택 노트 복사", action: copySelectedNotes },
        { label: "선택 노트 잘라내기", action: cutSelectedNotes },
        { label: "재생선 위치에 붙여넣기", action: pasteNotesFromClipboard },
        { label: "선택 노트 볼륨 수정", action: openNoteVolumeDialog },
        "separator",
        {
          label: state.selectedNoteIds.size > 1 ? `선택 노트 ${state.selectedNoteIds.size}개 삭제` : "선택 노트 삭제",
          danger: true,
          action: deleteSelectedNote,
        },
      ];
    });

    registerContextMenu("channel-panel", () => [
      { label: "채널 추가", action: addChannel },
      { label: "현재 채널 전체 복사", disabled: !getActiveChannel()?.notes.length, action: copyActiveChannelNotes },
      { label: "재생선 위치에 붙여넣기", action: pasteNotesFromClipboard },
      "separator",
      { label: "현재 채널 삭제", danger: true, action: () => requestDeleteChannel(state.activeChannel) },
      { label: "현재 채널 비우기", danger: true, action: clearActiveChannel },
      { label: "첫 채널로 이동", action: () => selectChannel(0) },
    ]);
    registerContextMenu("channel-tabs", () => [
      { label: "채널 추가", action: addChannel },
      { label: "이름 초기화", action: () => renameChannel(state.activeChannel, defaultChannelName(getActiveChannel())) },
      { label: "히스토리 보기", action: () => setSidebarTab("history") },
    ]);
    registerContextMenu("channel-tab", ({ area }) => {
      const index = Number(area.element.dataset.channelIndex);
      const channel = state.channels[index];
      return [
        { label: "이 채널 선택", action: () => selectChannel(index) },
        { label: channel?.visible === false ? "피아노롤에 표시" : "피아노롤에서 숨기기", action: () => channel && setChannelVisibleById(channel.id, channel.visible === false) },
        { label: "채널 이름 변경", action: () => promptRenameChannel(index) },
        { label: "채널 색상 변경", action: () => openChannelColorPicker(index) },
        { label: "채널 전체 노트 복사", disabled: !channel?.notes.length, action: () => { selectChannel(index); copyActiveChannelNotes(); } },
        { label: "채널 전체 노트 잘라내기", disabled: !channel?.notes.length, action: () => { selectChannel(index); cutActiveChannelNotes(); } },
        { label: "재생선 위치에 붙여넣기", action: () => { selectChannel(index); pasteNotesFromClipboard(); } },
        { label: channel?.muted ? "음소거 해제" : "음소거", action: () => channel && setChannelMutedById(channel.id, !channel.muted) },
        "separator",
        { label: "채널 비우기", danger: true, action: () => { selectChannel(index); clearActiveChannel(); } },
        { label: "채널 삭제", danger: true, action: () => requestDeleteChannel(index) },
      ];
    });
    registerContextMenu("midi-reference-tab", ({ area }) => {
      const documentId = area.element.dataset.midiDocumentId;
      const midiDocument = state.midiDocuments.find((item) => String(item.id) === String(documentId));
      const visible = isMidiDocumentVisible(midiDocument);
      return [
        { label: "원본 자료 선택", action: () => midiDocument && selectMidiDocument(midiDocument.id) },
        { label: visible ? "MIDI 노트 숨기기" : "MIDI 노트 표시", action: () => midiDocument && setMidiDocumentVisible(midiDocument.id, !visible) },
        { label: midiDocument?.muted ? "MIDI 음소거 해제" : "MIDI 음소거", action: () => midiDocument && setMidiDocumentMuted(midiDocument.id, !midiDocument.muted) },
        { label: "채널 복사", disabled: !midiDocument?.groups?.length, action: () => { if (midiDocument) { selectMidiDocument(midiDocument.id); openMidiTransferDialog(); } } },
        { label: "원본 자료 삭제", disabled: !midiDocument, danger: true, action: () => { if (midiDocument) { selectMidiDocument(midiDocument.id); requestClearMidiReference(); } } },
      ];
    });
    registerContextMenu("midi-reference", () => [
      { label: "채널 복사", disabled: !(getMidiGroupById()?.notes.length || getActiveMidiDocument()?.groups?.some((group) => group.notes?.length)), action: openMidiTransferDialog },
      { label: state.midiReference.activeGroupId ? "원본 채널 삭제" : "원본 자료 삭제", danger: true, action: requestClearMidiReference },
    ]);
    registerContextMenu("midi-instrument", ({ area }) => {
      const documentId = area.element.dataset.midiDocumentId || state.activeMidiDocumentId;
      const midiDocument = state.midiDocuments.find((item) => String(item.id) === String(documentId));
      const group = midiDocument?.groups?.find((item) => String(item.id) === String(area.element.dataset.groupId));
      return [
        { label: "이 악기 선택", action: () => group && selectMidiGroupFromTree(midiDocument.id, group.id) },
        { label: group?.visible === false ? "악기 노트 표시" : "악기 노트 숨기기", action: () => group && setMidiGroupVisibleByDocument(midiDocument.id, group.id, group.visible === false) },
        { label: group?.muted ? "악기 음소거 해제" : "악기 음소거", action: () => group && setMidiGroupMuted(midiDocument.id, group.id, !group.muted) },
        { label: "채널 복사", disabled: !group?.notes.length, action: () => { if (group) { selectMidiGroupFromTree(midiDocument.id, group.id); copyActiveMidiInstrumentToNewChannels(); } } },
        "separator",
        { label: "원본 채널 삭제", disabled: !group, danger: true, action: () => group && requestDeleteMidiGroup(midiDocument.id, group.id) },
      ];
    });

    registerContextMenu("channel-info", () => [
      { label: "정보 새로고침", action: updateChannelInfo },
      { label: "현재 채널 이름 변경", action: () => promptRenameChannel(state.activeChannel) },
    ]);
    registerContextMenu("splitter", () => []);
  }

  function renameChannel(index, name) {
    const channel = state.channels[index];
    if (!channel) {
      return false;
    }
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      return false;
    }
    const uniqueName = makeUniqueChannelName(trimmed, channel.id);
    if (uniqueName === channel.name) {
      return false;
    }
    channel.name = uniqueName;
    markDirty("채널명 변경");
    renderChannelTabs();
    renderChannelEditor();
    if (uniqueName !== trimmed) {
      showToast(`중복되지 않도록 이름을 ${uniqueName}(으)로 변경했습니다.`);
    }
    return true;
  }

  function promptRenameChannel(index) {
    const current = state.channels[index]?.name;
    if (!current) {
      return;
    }
    const result = window.prompt("채널 이름", current);
    if (result != null) {
      renameChannel(index, result);
    }
  }

  function setChannelColor(index, color, { commit = true } = {}) {
    const channel = state.channels[index];
    if (!channel || !isValidChannelColor(color)) {
      return false;
    }
    const normalized = String(color).toLowerCase();
    if (channel.color === normalized) {
      return false;
    }
    channel.color = normalized;
    if (commit) {
      markDirty("채널 색상 변경");
    } else {
      state.dirty = true;
      updateDirtyState();
    }
    renderChannelTabs();
    renderChannelMuteMixer();
    elements.channelColorInput.value = normalized;
    updateChannelColorControl(normalized);
    drawRoll();
    return true;
  }

  function openChannelColorPicker(index) {
    selectChannel(index);
    elements.channelColorInput.click();
  }

  function setChannelPanelHeight(height) {
    const available = elements.workspace.clientHeight;
    const clamped = clamp(height, 150, Math.max(150, available - 150));
    document.documentElement.style.setProperty("--channel-height", `${clamped}px`);
    requestAnimationFrame(resizeAndDraw);
  }

  function initializeSplitter() {
    // 하단 채널 영역은 두 줄 고정 높이이므로 크기 조절기를 사용하지 않습니다.
  }

  const EDIT_MODE_SHORTCUTS = new Map([
    ["1", 1],
    ["2", 2],
    ["3", 4],
    ["4", 8],
    ["5", 16],
    ["6", 32],
    ["7", 64],
  ]);

  function setEditMode(noteValue, { notify = true, dirty = true } = {}) {
    if (![1, 2, 4, 8, 16, 32, 64].includes(noteValue)) {
      return false;
    }
    state.snapValue = noteValue;
    elements.snapSelect.value = String(noteValue);
    if (dirty) {
      setDirtyWithoutHistory();
    }
    drawRoll();
    if (notify) {
      showToast(`1/${noteValue} 음표 편집 모드`);
    }
    return true;
  }

  function isTextEntryTarget(target) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function handleEditModeShortcut(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target)) {
      return false;
    }
    const noteValue = EDIT_MODE_SHORTCUTS.get(event.key);
    if (!noteValue) {
      return false;
    }
    event.preventDefault();
    setEditMode(noteValue);
    elements.rollViewport.focus();
    return true;
  }

  function handleZoomShortcut(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target)) {
      return false;
    }

    const zoomDirection = event.key === "=" || event.code === "Equal"
      ? 1
      : event.key === "-" || event.code === "Minus"
        ? -1
        : 0;
    if (!zoomDirection) {
      return false;
    }

    event.preventDefault();
    changeZoom(zoomDirection);
    elements.rollViewport.focus();
    return true;
  }

  function handlePlaybackShortcut(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target)) {
      return false;
    }
    if (event.code !== "Space") {
      return false;
    }
    event.preventDefault();
    state.playback.running || state.playback.loading ? stopPlayback(false) : startPlayback();
    return true;
  }

  function scheduleManualScrollSnap() {
    window.clearTimeout(state.viewportScroll.snapTimer);
    if (state.playback.running || state.playback.loading || state.playhead.pointerId !== null || state.tempoDrag || state.interaction) {
      return;
    }
    state.viewportScroll.snapTimer = window.setTimeout(() => {
      state.viewportScroll.snapTimer = 0;
      if (state.playback.running || state.playback.loading || state.playhead.pointerId !== null || state.tempoDrag || state.interaction) {
        return;
      }
      const snapped = snapScrollLeftToBeatUnit(elements.rollViewport.scrollLeft, getSnapBeat());
      if (Math.abs(snapped - elements.rollViewport.scrollLeft) >= 0.5) {
        elements.rollViewport.scrollLeft = snapped;
      }
    }, CONFIG.manualScrollSnapDelay);
  }

  function bindEvents() {
    document.addEventListener("keydown", handleHistoryShortcut, true);
    elements.fileButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = elements.fileMenu.hidden;
      closeEditMenu();
      closeThemeMenu();
      closeGoogleAccountMenu();
      closeVolumeMenu();
      closeZoomMenu();
      closePlaybackRateMenu();
      elements.fileMenu.hidden = !opening;
      elements.fileButton.setAttribute("aria-expanded", String(opening));
      if (opening) requestAnimationFrame(() => positionTopbarMenu(elements.fileMenu, elements.fileButton));
    });
    elements.editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = elements.editMenu.hidden;
      closeFileMenu();
      closeThemeMenu();
      closeGoogleAccountMenu();
      closeVolumeMenu();
      closeZoomMenu();
      closePlaybackRateMenu();
      updateEditMenuState();
      elements.editMenu.hidden = !opening;
      elements.editButton.setAttribute("aria-expanded", String(opening));
      if (opening) requestAnimationFrame(() => positionTopbarMenu(elements.editMenu, elements.editButton));
    });
    elements.editUndoButton.addEventListener("click", () => { closeEditMenu(); undoHistory(); });
    elements.editRedoButton.addEventListener("click", () => { closeEditMenu(); redoHistory(); });
    elements.editCopyButton.addEventListener("click", () => { closeEditMenu(); copyCurrentContext(); });
    elements.editCutButton.addEventListener("click", () => { closeEditMenu(); cutCurrentContext(); });
    elements.editPasteButton.addEventListener("click", () => { closeEditMenu(); pasteNotesFromClipboard(); });
    elements.editSelectAllButton.addEventListener("click", () => { closeEditMenu(); selectAllCurrentContext(); });
    elements.editDeleteButton.addEventListener("click", () => { closeEditMenu(); deleteCurrentSelection(); });
    elements.editNoteVolumeButton?.addEventListener("click", () => { closeEditMenu(); openNoteVolumeDialog(); });
    elements.fileExportButton.addEventListener("click", () => { closeFileMenu(); exportCurrentContextAsMml(); });
    elements.newButton.addEventListener("click", () => {
      closeFileMenu();
      resetProject();
    });
    elements.openButton.addEventListener("click", () => {
      closeFileMenu();
      openFilePickerInput(elements.fileInput);
    });
    elements.mmlImportButton?.addEventListener("click", () => {
      openMmlImportDialog();
    });
    elements.mmlImportChooseFileButton?.addEventListener("click", () => {
      openFilePickerInput(elements.mmlImportFileInput);
    });
    elements.mmlImportPasteButton?.addEventListener("click", pasteMmlImportTextFromClipboard);
    elements.mmlImportFileInput?.addEventListener("change", async () => {
      const [file] = elements.mmlImportFileInput.files || [];
      elements.mmlImportFileInput.value = "";
      if (file) await loadMmlImportFile(file);
    });
    elements.mmlImportText?.addEventListener("input", scheduleMmlImportPreview);
    elements.mmlImportApplyTempo?.addEventListener("change", updateMmlImportPreview);
    elements.mmlImportSelectAllButton?.addEventListener("click", () => {
      state.mmlImport.selectedCandidateIndexes = new Set(state.mmlImport.candidates.slice(0, 6).map((_, index) => index));
      updateMmlImportPreview();
    });
    elements.mmlImportClearSelectionButton?.addEventListener("click", () => {
      state.mmlImport.selectedCandidateIndexes = new Set();
      updateMmlImportPreview();
    });
    elements.mmlImportCloseButton?.addEventListener("click", closeMmlImportDialog);
    elements.mmlImportCancelButton?.addEventListener("click", closeMmlImportDialog);
    elements.mmlImportApplyButton?.addEventListener("click", applyMmlImport);
    elements.mmlImportBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.mmlImportBackdrop) closeMmlImportDialog();
    });
    elements.mmlImportText?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        applyMmlImport();
      }
    });
    elements.saveButton.addEventListener("click", () => {
      closeFileMenu();
      saveProject();
    });
    elements.midiOpenButton?.addEventListener("click", () => {
      closeFileMenu();
      openFilePickerInput(elements.fileInput);
    });
    elements.midiFileInput?.addEventListener("change", async () => {
      const [file] = elements.midiFileInput.files || [];
      elements.midiFileInput.value = "";
      if (file) await prepareMidiImportFile(file);
    });
    elements.audioOpenButton?.addEventListener("click", () => {
      closeFileMenu();
      openFilePickerInput(elements.audioFileInput);
    });
    elements.audioFileInput?.addEventListener("change", async () => {
      const [file] = elements.audioFileInput.files || [];
      elements.audioFileInput.value = "";
      if (file) await importAudioFile(file);
    });
    elements.midiImportTargetMode?.addEventListener("change", updateMidiImportDialog);
    elements.midiImportIgnoreSingle64thOverlap?.addEventListener("change", updateMidiImportDialog);
    elements.midiImportQuantize?.addEventListener("change", () => {
      if (state.midiImport.kind === "midi" && state.midiImport.midiBuffer && !state.midiImport.busy) {
        try { reparseMidiImportPreview(); }
        catch (error) {
          console.error(error);
          setMidiImportStatus(error instanceof Error ? error.message : "양자화를 다시 적용하지 못했습니다.", { error: true });
        }
      }
    });
    elements.midiImportPreviewSelectedButton?.addEventListener("click", () => {
      const ids = getMidiImportSelectedGroups().map((group) => String(group.id));
      if (ids.length) previewMidiImportGroups(ids, "selected");
    });
    elements.midiImportPreviewAllButton?.addEventListener("click", () => previewMidiImportGroups(null, "all"));
    elements.midiImportSelectAllButton?.addEventListener("click", () => {
      if (state.midiImport.kind === "midi") {
        state.midiImport.selectedGroupIds = new Set((state.midiImport.preview?.groups || []).map((group) => String(group.id)));
      } else {
        state.midiImport.selectedTextIndexes = new Set((state.midiImport.textCandidates || []).map((_, index) => index));
      }
      updateMidiImportDialog();
    });
    elements.midiImportClearAllButton?.addEventListener("click", () => {
      if (state.midiImport.kind === "midi") state.midiImport.selectedGroupIds = new Set();
      else state.midiImport.selectedTextIndexes = new Set();
      updateMidiImportDialog();
    });
    elements.midiImportTextSelectAllButton?.addEventListener("click", () => {
      state.midiImport.selectedTextIndexes = new Set((state.midiImport.textCandidates || []).map((_, index) => index));
      updateMidiImportDialog();
    });
    elements.midiImportTextClearAllButton?.addEventListener("click", () => {
      state.midiImport.selectedTextIndexes = new Set();
      updateMidiImportDialog();
    });
    elements.midiImportCloseButton?.addEventListener("click", () => closeMidiImportDialog());
    elements.midiImportCancelButton?.addEventListener("click", () => closeMidiImportDialog());
    elements.midiImportApplyButton?.addEventListener("click", () => applyMidiImport("add"));
    elements.midiImportNewButton?.addEventListener("click", () => applyMidiImport("new"));
    elements.midiImportBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.midiImportBackdrop && !state.midiImport.busy) closeMidiImportDialog();
    });

    elements.mmlExportCloseButton?.addEventListener("click", closeMmlExportDialog);
    elements.mmlExportCancelButton?.addEventListener("click", closeMmlExportDialog);
    elements.mmlExportSelectAllButton?.addEventListener("click", () => {
      elements.mmlExportChannelList?.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((checkbox) => {
        checkbox.checked = true;
        checkbox.closest(".mml-export-channel-row")?.classList.add("selected");
      });
      updateMmlExportDialogState();
    });
    elements.mmlExportClearAllButton?.addEventListener("click", () => {
      elements.mmlExportChannelList?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
        checkbox.closest(".mml-export-channel-row")?.classList.remove("selected");
      });
      updateMmlExportDialogState();
    });
    elements.mmlExportApplyButton?.addEventListener("click", applyMmlExportSelection);
    elements.mmlExportBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.mmlExportBackdrop) closeMmlExportDialog();
    });

    elements.fileInput.addEventListener("change", async () => {
      const [file] = elements.fileInput.files || [];
      elements.fileInput.value = "";
      if (file) await prepareUnifiedImportFile(file);
    });

    elements.historyCornerToggle.addEventListener("click", () => setHistoryCollapsed(!state.history.collapsed));
    elements.sidebarChannelsTab?.addEventListener("click", () => setSidebarTab("channels"));
    elements.sidebarHistoryTab?.addEventListener("click", () => setSidebarTab("history"));
    elements.channelTabs?.addEventListener("keydown", handleChannelTreeArrowNavigation);
    elements.historyList?.addEventListener("keydown", handleHistoryArrowNavigation);
    elements.historyUndoButton.addEventListener("click", () => undoHistory());
    elements.historyRedoButton.addEventListener("click", () => redoHistory());

    elements.noteToolButton.addEventListener("click", () => setEditTool("note"));
    elements.selectToolButton.addEventListener("click", () => setEditTool("select"));

    elements.jumpStartButton.addEventListener("click", moveToTimelineStart);
    elements.playButton.addEventListener("click", togglePlayback);
    elements.jumpEndButton.addEventListener("click", moveToTimelineEnd);

    elements.volumeButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleVolumeMenu();
    });
    elements.volumeSlider?.addEventListener("input", () => {
      setMasterVolume(Number(elements.volumeSlider.value) / 100);
    });
    elements.volumeResetButton?.addEventListener("click", () => {
      setMasterVolume(1);
      elements.volumeSlider?.focus();
    });
    elements.zoomButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleZoomMenu();
    });
    elements.zoomSlider?.addEventListener("input", () => {
      const index = clamp(Math.round(Number(elements.zoomSlider.value) || 0), 0, CONFIG.zoomLevels.length - 1);
      setZoom(CONFIG.zoomLevels[index]);
    });
    elements.zoomResetButton?.addEventListener("click", () => {
      setZoom(1);
      elements.zoomSlider?.focus();
    });
    elements.playbackRateButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePlaybackRateMenu();
    });
    elements.playbackRateSlider?.addEventListener("input", () => {
      updatePlaybackRatePreview(Number(elements.playbackRateSlider.value));
    });
    elements.playbackRateSlider?.addEventListener("change", () => {
      setPlaybackRate(Number(elements.playbackRateSlider.value));
    });
    elements.playbackRateResetButton?.addEventListener("click", () => {
      setPlaybackRate(1);
      elements.playbackRateSlider?.focus();
    });

    elements.snapSelect.addEventListener("change", () => {
      setEditMode(Number(elements.snapSelect.value), { notify: false });
    });
    elements.noteVolumeDisplaySelect?.addEventListener("change", () => {
      setNoteVolumeDisplay(elements.noteVolumeDisplaySelect.value);
    });
    elements.pitchSpacingSelect.addEventListener("change", () => {
      setRowHeight(Number(elements.pitchSpacingSelect.value));
    });


    elements.themeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = elements.themeMenu.hidden;
      closeFileMenu();
      closeEditMenu();
      closeGoogleAccountMenu();
      closeVolumeMenu();
      closeZoomMenu();
      closePlaybackRateMenu();
      elements.themeMenu.hidden = !opening;
      elements.themeButton.setAttribute("aria-expanded", String(opening));
    });
    elements.themeMenu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-theme-choice]");
      if (!item) {
        return;
      }
      applyTheme(item.dataset.themeChoice, { notify: true });
    });
    elements.googleLoginButton.addEventListener("click", () => {
      showToast("구글 로그인 연동 영역을 준비했습니다.");
    });
    elements.languageSelect.addEventListener("change", () => {
      applyLanguage(elements.languageSelect.value, { notify: true });
    });

    elements.horizontalScrollBar.addEventListener("pointerdown", (event) => beginCustomScrollbarDrag("x", event));
    elements.horizontalScrollBar.addEventListener("pointermove", moveCustomScrollbarDrag);
    elements.horizontalScrollBar.addEventListener("pointerup", endCustomScrollbarDrag);
    elements.horizontalScrollBar.addEventListener("pointercancel", endCustomScrollbarDrag);
    elements.verticalScrollBar.addEventListener("pointerdown", (event) => beginCustomScrollbarDrag("y", event));
    elements.verticalScrollBar.addEventListener("pointermove", moveCustomScrollbarDrag);
    elements.verticalScrollBar.addEventListener("pointerup", endCustomScrollbarDrag);
    elements.verticalScrollBar.addEventListener("pointercancel", endCustomScrollbarDrag);

    elements.rollViewport.addEventListener("scroll", () => {
      // 캔버스를 화면보다 크게 미리 그려 둔 뒤 안전 여백을 벗어날 때만 즉시 재중앙화합니다.
      // 따라서 빠른 세로 스크롤에서도 다음 프레임을 기다리는 빈 영역이 나타나지 않습니다.
      ensureRollRenderBuffer(false);
      updatePlayheadVisual();
      drawTimeline();
      drawKeyboard();
      updateAudioLaneTransform();
      updateCustomScrollbars();
      scheduleManualScrollSnap();
      scheduleAutosave(1200);
    }, { passive: true });
    elements.pianoSection?.addEventListener("wheel", handlePianoRollAltWheelZoom, { passive: false });
    elements.timelineCanvas.addEventListener("pointerdown", handleTimelinePointerDown);
    elements.timelineCanvas.addEventListener("pointermove", handleTimelinePointerMove);
    elements.timelineCanvas.addEventListener("pointerup", handleTimelinePointerUp);
    elements.timelineCanvas.addEventListener("pointercancel", handleTimelinePointerUp);

    elements.rollCanvas.addEventListener("pointerdown", handleRollPointerDown);
    elements.rollCanvas.addEventListener("pointermove", handleRollPointerMove);
    elements.rollCanvas.addEventListener("pointerup", handleRollPointerUp);
    elements.rollCanvas.addEventListener("pointercancel", handleRollPointerUp);

    elements.keyboardCanvas.addEventListener("pointerdown", handleKeyboardPointerDown);
    elements.keyboardCanvas.addEventListener("pointermove", handleKeyboardPointerMove);
    elements.keyboardCanvas.addEventListener("pointerup", handleKeyboardPointerUp);
    elements.keyboardCanvas.addEventListener("pointercancel", handleKeyboardPointerUp);
    elements.keyboardCanvas.addEventListener("pointerleave", handleKeyboardPointerLeave);

    elements.rollViewport.addEventListener("keydown", (event) => {
      if (handleEditModeShortcut(event) || handleZoomShortcut(event) || handlePlaybackShortcut(event)) {
        return;
      }
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (state.activePanel === "none") {
        if (event.key === "Escape") {
          closeContextMenu();
          event.preventDefault();
        }
        return;
      }
      if (state.activePanel === "audio") {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          void requestDeleteAudioClip();
        }
        if (event.key === "Escape") {
          state.activePanel = "notes";
          state.activeAudioClipId = null;
          renderChannelTabs();
          renderChannelEditor();
          renderAudioLane();
          event.preventDefault();
        }
        return;
      }
      if (isMidiReferenceActive()) {
        if (commandKey && key === "c") {
          event.preventDefault();
          state.midiSelectedNoteKeys.size ? copySelectedMidiNotes() : copyActiveMidiInstrument();
          return;
        }
        if (!commandKey && !event.altKey && event.shiftKey && key === "a") {
          event.preventDefault();
          selectAllMidiNotes();
          return;
        }
        if (event.key === "Escape") {
          clearMidiSelection();
          updateMidiReferenceUI();
          drawRoll();
          closeContextMenu();
          event.preventDefault();
        }
        return;
      }
      if (commandKey && key === "c") {
        event.preventDefault();
        copySelectedNotes();
        return;
      }
      if (commandKey && key === "x") {
        event.preventDefault();
        cutSelectedNotes();
        return;
      }
      if (commandKey && key === "v") {
        event.preventDefault();
        pasteNotesFromClipboard();
        return;
      }
      if (!commandKey && !event.altKey && event.shiftKey && key === "a") {
        event.preventDefault();
        selectAllNotes();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (deleteSelectedNote()) {
          event.preventDefault();
        }
        return;
      }
      if (event.key === "Escape") {
        if (!cancelCurrentNoteInteraction()) {
          clearNoteSelection();
          clearEditorPitchPreview(true);
          drawRoll();
          updateChannelInfo();
        }
        event.preventDefault();
        return;
      }
    });

    elements.addChannelButton.addEventListener("click", addChannel);
    elements.deleteChannelsButton?.addEventListener("click", openChannelDeleteDialog);
    elements.copyChannelButton.addEventListener("click", copyActiveChannelNotes);
    elements.pasteChannelButton.addEventListener("click", pasteNotesFromClipboard);
    elements.noteVolumeButton?.addEventListener("click", openNoteVolumeDialog);
    elements.deleteChannelButton.addEventListener("click", () => requestDeleteChannel(state.activeChannel));
    elements.clearChannelButton.addEventListener("click", clearActiveChannel);
    elements.channelNameInput.addEventListener("change", () => {
      if (!renameChannel(state.activeChannel, elements.channelNameInput.value)) {
        elements.channelNameInput.value = getActiveChannel().name;
      }
    });
    elements.channelNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.channelNameInput.blur();
      }
    });
    elements.channelColorInput.addEventListener("change", () => {
      setChannelColor(state.activeChannel, elements.channelColorInput.value, { commit: true });
    });
    bindRecommendedColorPalette(elements.channelColorInput);
    elements.channelInstrumentSelect?.addEventListener("change", () => {
      const channel = getActiveChannel();
      if (!channel) return;
      const selectedValue = String(elements.channelInstrumentSelect.value || "0");
      const program = clamp(Math.round(Number(selectedValue) || 0), 0, GM_PROGRAM_NAMES.length - 1);
      const nextInstrument = selectedValue === "drums" ? "Drums" : (GM_PROGRAM_NAMES[program] || GM_PROGRAM_NAMES[0]);
      if (channel.instrument === nextInstrument) return;
      channel.instrument = nextInstrument;
      if (typeof audioEngine.prepareProgram === "function") {
        void audioEngine.prepareProgram(program, 0).catch((error) => console.warn("악기 음원 준비 실패", error));
      }
      markDirty("채널 악기 변경");
      renderChannelTabs();
      updateChannelInfo();
      showToast(`${channel.name} 악기를 ${nextInstrument}(으)로 변경했습니다.`);
    });
    elements.midiSourceColorInput?.addEventListener("change", () => {
      const document = getActiveMidiDocument();
      const group = getMidiGroupById();
      if (!document || !group) {
        updateMidiReferenceUI();
        return;
      }
      setMidiGroupColor(document.id, group.id, elements.midiSourceColorInput.value, { commit: true });
    });
    elements.midiSourceNameInput?.addEventListener("change", () => {
      if (state.midiReference.activeGroupId) {
        updateMidiReferenceUI();
        return;
      }
      renameActiveMidiDocumentTitle(elements.midiSourceNameInput.value);
    });
    elements.midiSourceNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.midiSourceNameInput.blur();
      }
    });
    bindRecommendedColorPalette(elements.midiSourceColorInput);
    elements.audioSourceNameInput?.addEventListener("change", () => renameActiveAudioTitle(elements.audioSourceNameInput.value));
    elements.audioSourceNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.audioSourceNameInput.blur();
      }
    });
    elements.audioSourceColorInput?.addEventListener("change", () => {
      const clip = getActiveAudioClip();
      if (clip) setAudioClipColor(clip.id, elements.audioSourceColorInput.value, { commit: true });
    });
    bindRecommendedColorPalette(elements.audioSourceColorInput);
    elements.audioSourceOffsetInput?.addEventListener("change", () => {
      updateAudioClipSettings(getActiveAudioClip(), { offsetSeconds: elements.audioSourceOffsetInput.value, commit: true });
    });
    elements.audioSourceVolumeInput?.addEventListener("input", () => {
      if (elements.audioSourceVolumeValue) elements.audioSourceVolumeValue.textContent = `${elements.audioSourceVolumeInput.value}%`;
    });
    elements.audioSourceVolumeInput?.addEventListener("change", () => {
      updateAudioClipSettings(getActiveAudioClip(), { volumePercent: elements.audioSourceVolumeInput.value, commit: true });
    });
    elements.audioSourceRateInput?.addEventListener("change", () => {
      updateAudioClipSettings(getActiveAudioClip(), { playbackRate: elements.audioSourceRateInput.value, commit: true });
    });
    elements.audioSourceDeleteButton?.addEventListener("click", () => requestDeleteAudioClip());
    elements.audioLaneViewport?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".audio-clip-block")) return;
      const rect = elements.audioLaneViewport.getBoundingClientRect();
      const beat = xToBeat(event.clientX - rect.left + elements.rollViewport.scrollLeft);
      if (beat >= 0) setPlayheadBeat(clamp(snapBeat(beat), 0, getTotalBeats()), { stop: true });
      event.preventDefault();
    });

    elements.midiReferenceLoadButton.addEventListener("click", () => openFilePickerInput(elements.midiFileInput));
    elements.channelDeleteCloseButton?.addEventListener("click", closeChannelDeleteDialog);
    elements.channelDeleteCancelButton?.addEventListener("click", closeChannelDeleteDialog);
    elements.channelDeleteApplyButton?.addEventListener("click", applyChannelDeleteSelection);
    elements.channelDeleteSelectAllButton?.addEventListener("click", () => setAllChannelDeleteChecked(true));
    elements.channelDeleteClearAllButton?.addEventListener("click", () => setAllChannelDeleteChecked(false));
    elements.channelDeleteBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.channelDeleteBackdrop) closeChannelDeleteDialog();
    });
    elements.midiReferenceClearButton.addEventListener("click", requestClearMidiReference);
    elements.midiTransferButton?.addEventListener("click", openMidiTransferDialog);
    elements.midiTransferCloseButton?.addEventListener("click", closeMidiTransferDialog);
    elements.midiTransferCancelButton?.addEventListener("click", closeMidiTransferDialog);
    elements.midiTransferApplyButton?.addEventListener("click", applyMidiTransfer);
    elements.midiTransferSelectAllButton?.addEventListener("click", () => setAllMidiTransferGroupsChecked(true));
    elements.midiTransferClearAllButton?.addEventListener("click", () => setAllMidiTransferGroupsChecked(false));
    elements.midiTransferBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.midiTransferBackdrop) closeMidiTransferDialog();
    });
    elements.noteVolumeCloseButton?.addEventListener("click", closeNoteVolumeDialog);
    elements.noteVolumeCancelButton?.addEventListener("click", closeNoteVolumeDialog);
    elements.noteVolumeApplyButton?.addEventListener("click", applySelectedNoteVolume);
    elements.noteVolumeSlider?.addEventListener("input", () => {
      elements.noteVolumeValue.textContent = `V${clamp(Math.round(Number(elements.noteVolumeSlider.value) || 0), 0, 15)}`;
    });
    elements.noteVolumeBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.noteVolumeBackdrop) closeNoteVolumeDialog();
    });
    elements.tempoEditorCloseButton?.addEventListener("click", closeTempoEditor);
    elements.tempoEditorCancelButton?.addEventListener("click", closeTempoEditor);
    elements.tempoEditorApplyButton?.addEventListener("click", applyTempoEditor);
    elements.tempoEditorDeleteButton?.addEventListener("click", deleteTempoFromEditor);
    elements.measureSpaceButton?.addEventListener("click", () => openTimeEditDialog("measure"));
    elements.beatSpaceButton?.addEventListener("click", () => openTimeEditDialog("beat"));
    elements.timeEditCloseButton?.addEventListener("click", closeTimeEditDialog);
    elements.timeEditCancelButton?.addEventListener("click", closeTimeEditDialog);
    elements.timeEditInsertButton?.addEventListener("click", () => applyTimeEdit("insert"));
    elements.timeEditDeleteButton?.addEventListener("click", () => applyTimeEdit("delete"));
    elements.timeEditAmountInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyTimeEdit("insert");
      }
    });
    elements.timeEditBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.timeEditBackdrop) closeTimeEditDialog();
    });
    elements.tempoBpmInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyTempoEditor();
      }
    });
    elements.tempoEditorBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.tempoEditorBackdrop) closeTempoEditor();
    });
    elements.midiReferenceShowAllButton.addEventListener("click", () => setAllMidiGroupsVisible(true));
    elements.midiReferenceHideAllButton.addEventListener("click", () => setAllMidiGroupsVisible(false));
    elements.midiCopySelectedButton.addEventListener("click", copySelectedMidiNotes);
    elements.midiCopyInstrumentButton.addEventListener("click", copyActiveMidiInstrument);

    document.addEventListener("pointerdown", beginLongPress, true);
    document.addEventListener("pointermove", moveLongPress, true);
    document.addEventListener("pointerup", endLongPress, true);
    document.addEventListener("pointercancel", endLongPress, true);
    document.addEventListener("mousedown", handleRightMouseCancelDuringChannelDrag, true);
    document.addEventListener("mousedown", handleRightMouseCancelDuringNoteEdit, true);
    document.addEventListener("contextmenu", openContextMenu, true);
    document.addEventListener("pointerdown", (event) => {
      if (!elements.contextMenu.hidden && !elements.contextMenu.contains(event.target)) {
        closeContextMenu();
      }
      if (!elements.fileMenu.hidden && !event.target.closest(".file-control")) {
        closeFileMenu();
      }
      if (!elements.editMenu.hidden && !event.target.closest(".edit-control")) {
        closeEditMenu();
      }
      if (!elements.themeMenu.hidden && !event.target.closest(".theme-control")) {
        closeThemeMenu();
      }
      if (elements.volumeMenu && !elements.volumeMenu.hidden && !event.target.closest(".volume-control")) {
        closeVolumeMenu();
      }
      if (elements.zoomMenu && !elements.zoomMenu.hidden && !event.target.closest(".zoom-control")) {
        closeZoomMenu();
      }
      if (elements.playbackRateMenu && !elements.playbackRateMenu.hidden && !event.target.closest(".playback-rate-control")) {
        closePlaybackRateMenu();
      }
      if (elements.googleAccountMenu && !elements.googleAccountMenu.hidden && !event.target.closest(".account-control")) {
        closeGoogleAccountMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (handleEditModeShortcut(event) || handleZoomShortcut(event) || handlePlaybackShortcut(event)) {
        return;
      }

      // 채널 트리/버튼에 포커스가 있어도 채널 간 노트 복사·붙여넣기 단축키는 계속 동작합니다.
      const commandKey = event.ctrlKey || event.metaKey;
      const key = String(event.key || "").toLowerCase();
      if (
        !event.defaultPrevented
        && commandKey
        && !event.altKey
        && !isTextEntryTarget(event.target)
        && state.activePanel === "notes"
        && !isMidiReferenceActive()
      ) {
        if (key === "c") {
          event.preventDefault();
          void copySelectedNotes();
          return;
        }
        if (key === "x") {
          event.preventDefault();
          void cutSelectedNotes();
          return;
        }
        if (key === "v") {
          event.preventDefault();
          void pasteNotesFromClipboard();
          return;
        }
      }

      if (event.key === "Escape") {
        closeContextMenu();
        closeFileMenu();
        closeEditMenu();
        closeThemeMenu();
        closeGoogleAccountMenu();
        closeChannelMuteMixer();
        closeVolumeMenu();
        closeZoomMenu();
        closePlaybackRateMenu();
        closeMmlImportDialog();
        closeMidiImportDialog();
        closeMidiTransferDialog();
        closeNoteVolumeDialog();
        closeTempoEditor();
        closeTimeEditDialog();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        closeFileMenu();
        saveProject();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        closeFileMenu();
        openFilePickerInput(elements.fileInput);
      }
    });

    window.addEventListener("resize", () => {
      resizeAndDraw();
      requestAnimationFrame(() => {
        shrinkTimelineToContent();
        updateCustomScrollbars();
      });
    });
    if (typeof ResizeObserver === "function") {
      let resizeFrame = 0;
      const layoutObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          resizeAndDraw();
        });
      });
      layoutObserver.observe(elements.pianoSection);
      layoutObserver.observe(elements.rollViewport);
    }
    window.addEventListener("blur", () => {
      releaseKeyboardVoice(true);
      clearEditorPitchPreview(true);
    });
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.autosave.pendingChanges) {
        void saveAutosaveNow();
      }
    });
    window.addEventListener("pagehide", () => {
      if (state.autosave.pendingChanges) {
        void saveAutosaveNow();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (state.dirty && (state.autosave.pendingChanges || state.autosave.failed || !state.autosave.lastSavedAt)) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  function seedDemoNotes() {
    const channel = state.channels[0];
    const pitches = [60, 62, 64, 67, 69, 67, 64, 62];
    pitches.forEach((pitch, index) => {
      channel.notes.push({
        id: state.nextNoteId++,
        pitch,
        startBeat: index * 0.5,
        durationBeat: index % 3 === 0 ? 0.5 : 0.25,
        velocity: 100,
        volume: velocityToMmlVolume(100),
      });
    });
  }

  function populateChannelInstrumentSelect() {
    if (!elements.channelInstrumentSelect || elements.channelInstrumentSelect.options.length) return;
    const families = ["Piano", "Chromatic Percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth Lead", "Synth Pad", "Synth Effects", "Ethnic", "Percussive", "Sound Effects"];
    const drumGroup = document.createElement("optgroup");
    drumGroup.label = "Drums / Percussion";
    const drumOption = document.createElement("option");
    drumOption.value = "drums";
    drumOption.textContent = "Drums (GM Channel 10)";
    drumGroup.append(drumOption);
    elements.channelInstrumentSelect.append(drumGroup);
    GM_PROGRAM_NAMES.forEach((name, program) => {
      if (program % 8 === 0) {
        const group = document.createElement("optgroup");
        group.label = families[Math.floor(program / 8)] || `Program ${program + 1}-${program + 8}`;
        elements.channelInstrumentSelect.append(group);
      }
      const option = document.createElement("option");
      option.value = String(program);
      option.textContent = `${program + 1}. ${name}`;
      elements.channelInstrumentSelect.lastElementChild.append(option);
    });
  }

  async function initialize() {
    populateChannelInstrumentSelect();
    state.language = loadStoredLanguage();
    applyLanguage(state.language, { persist: false });
    state.theme = loadStoredTheme();
    applyTheme(state.theme, { persist: false });
    state.masterVolume = loadStoredVolume();
    setMasterVolume(state.masterVolume, { persist: false });
    state.noteVolumeDisplay = loadStoredNoteVolumeDisplay();
    setNoteVolumeDisplay(state.noteVolumeDisplay, { persist: false });
    state.playbackRate = loadStoredPlaybackRate();
    setPlaybackRate(state.playbackRate, { persist: false, restart: false });
    registerDefaultContextMenus();
    bindEvents();
    initializeSplitter();
    setSidebarTab(loadStoredSidebarTab(), { persist: false });
    setHistoryCollapsed(loadHistoryCollapsedState());
    updateEditToolControls();

    const restoredAutosave = await restoreAutosaveOnStartup();
    if (!restoredAutosave) {
      initializeHistory();
      renderAll();
      requestAnimationFrame(() => {
        elements.rollViewport.scrollTop = Math.max(0, pitchToY(72) - 180);
        updatePlayheadVisual();
        drawKeyboard();
        drawTimeline();
      });
      scheduleAutosave(0);
    }

    const prepareAudio = () => audioEngine.prepare();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(prepareAudio, { timeout: 700 });
    } else {
      window.setTimeout(prepareAudio, 250);
    }

    // 추후 메뉴를 교체할 때 사용할 수 있도록 공개합니다.
    window.MMLEditor = {
      state,
      registerContextMenu,
      serializeProject,
      renderAll,
      ensureRollRenderBuffer,
      audioEngine,
      getPlaybackEndBeat,
      collectPlaybackNotes,
      getPlaybackNormalizationGainForVoiceCount,
      computePlaybackAutoGainScale,
      getTimelineStartBeat,
      getSnapBeat,
      getPlaybackVisualBeat,
      preparePlaybackViewport,
      beatToSeconds,
      secondsToBeat,
      addChannel,
      deleteChannel,
      requestDeleteChannel,
      setEditTool,
      selectChannel,
      selectMidiDocument,
      getVisibleGridUnit,
      normalizeMonophonicNotes,
      canPlaceInChannelMonophonically,
      moveChannelById,
      setChannelMutedById,
      setMidiDocumentMuted,
      setMidiGroupMuted,
      setAllChannelsMuted,
      setSidebarTab,
      setMidiGroupVisibleByDocument,
      setMasterVolume,
      setNoteVolumeDisplay,
      setPlaybackRate,
      setZoom,
      changeZoom,
      handlePianoRollAltWheelZoom,
      adjustSelectedNoteVolumesByStep,
      findOtherVisibleChannelNoteHitAt,
      parseMmlText,
      analyzeMmlImportSource,
      extractThreeMleMmlPartCandidates,
      extractMabiIccoMmlPartCandidates,
      normalizeMmiLegacyLengthsInPart,
      openMmlImportDialog,
      closeMmlImportDialog,
      updateMmlImportPreview,
      applyMmlImport,
      openMidiTransferDialog,
      openNoteVolumeDialog,
      velocityToMmlVolume,
      mmlVolumeToVelocity,
      setChannelColor,
      addTempoAtBeat,
      editTempo,
      deleteTempo,
      applyTheme,
      shrinkTimelineToContent,
      undoHistory,
      redoHistory,
      initializeHistory,
      togglePlayback,
      moveToTimelineStart,
      moveToTimelineEnd,
      selectMidiReferenceTab,
      prepareUnifiedImportFile,
      prepareCompatibleTextImportFile,
      prepareMidiImportFile,
      previewMidiImportGroups,
      openMidiImportDialog,
      closeMidiImportDialog,
      updateMidiImportDialog,
      applyMidiImport,
      splitNotesIntoMonophonicVoices,
      importMidiSelectionAsEditableChannels,
      overwriteEditorChannelsFromMidiDocument,
      loadMidiReferenceFile,
      clearMidiReference,
      updateMidiReferenceUI,
      getMidiReferenceEndBeat,
      parseMidiArrayBuffer,
      normalizeMidiDocumentInstruments,
      setChannelVisibleById,
      setMidiDocumentVisible,
      setMidiGroupVisible,
      copyCurrentContext,
      cutCurrentContext,
      pasteNotesFromClipboard,
      copyActiveChannelNotes,
      cutActiveChannelNotes,
      copySelectedNotes,
      cutSelectedNotes,
      copySelectedMidiNotes,
      copyActiveMidiInstrument,
      exportCurrentContextAsMml,
      openMmlExportDialog,
      closeMmlExportDialog,
      applyMmlExportSelection,
      channelsToMml,
      exportActiveChannelAsMml,
      exportSelectedNotesAsMml,
      exportSelectedMidiNotesAsMml,
      exportActiveMidiInstrumentAsMml,
      saveAutosaveNow,
      restoreAutosaveOnStartup,
      importAudioFile,
      renderAudioLane,
      selectAudioClip,
      getActiveAudioClip,
      setAudioClipVisible,
      setAudioClipMuted,
      getChannelInstrumentProgram,
      updateAudioClipSettings,
      requestDeleteAudioClip,
    };
    window.Mobibard = window.MMLEditor;
  }

  initialize().catch((error) => {
    console.error("Mobibard initialization failed", error);
    showToast("편집기를 초기화하지 못했습니다.");
  });
})();
