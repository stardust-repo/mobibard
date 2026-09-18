(() => {
  "use strict";

  const APP_VERSION_LABEL = "v5.3";

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
    // UI currently exposes a fixed 3-channel cap, while the packing logic accepts any N >= 1.
    midiImportMaxChannelsPerInstrument: 3,
    // Newly created editor channels start note entry at MML volume V10.
    defaultNewChannelNoteVolume: 10,
  };

  const { getIgnorableSequentialOverlapTrim } = window.MabiUtils;

  function openFilePickerInput(input) {
    if (!input || input.disabled) return;
    // Always clear the native file value before opening the picker. Browsers do not
    // fire change when the exact same file is selected twice unless the value was reset first.
    // This also makes every import pass start from a fresh dialog/state path.
    try { input.value = ""; } catch {}
    const groupedPicker = window.MabiSupportedFilesUi?.openFileInput;
    if (typeof groupedPicker === "function") {
      void groupedPicker(input);
      return;
    }
    input.click();
  }

  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  // Color data is hue-only. Every editable color is stored as 0..359 degrees.
  // Saturation/lightness are presentation details derived from the current theme.
  const CHANNEL_HUES = Array.from({ length: 12 }, (_, index) => index * 30);
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
      selectedStroke: "#00c8ff",
      selectedHalo: "rgba(0,200,255,0.42)",
      selectedOverlay: "rgba(0,200,255,0.22)",
      noteStroke: "#ffffff",
      selectedShine: "rgba(190,243,255,0.48)",
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
      selectedStroke: "#009fce",
      selectedHalo: "rgba(0,159,206,0.40)",
      selectedOverlay: "rgba(0,174,224,0.20)",
      noteStroke: "#ffffff",
      selectedShine: "rgba(0,159,206,0.32)",
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
    appContent: document.querySelector(".app-content"),
    sidePanel: document.querySelector("#sidePanel"),
    sidebarChannelsTab: document.querySelector("#sidebarChannelsTab"),
    sidebarHistoryTab: document.querySelector("#sidebarHistoryTab"),
    pianoSection: document.querySelector(".piano-section"),
    historyPanel: document.querySelector("#historyPanel"),
    historyCornerToggle: document.querySelector("#historyCornerToggle"),
    collapsedMergeChannelsButton: document.querySelector("#collapsedMergeChannelsButton"),
    collapsedAddChannelButton: document.querySelector("#collapsedAddChannelButton"),
    collapsedDeleteChannelsButton: document.querySelector("#collapsedDeleteChannelsButton"),
    collapsedChannelList: document.querySelector("#collapsedChannelList"),
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
    midiExportButton: document.querySelector("#midiExportButton"),
    audioExportButton: document.querySelector("#audioExportButton"),
    midiExtractButton: document.querySelector("#midiExtractButton"),
    supportedFilesMenuButton: document.querySelector("#supportedFilesMenuButton"),
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
    measureSpaceInsertButton: document.querySelector("#measureSpaceInsertButton"),
    measureSpaceDeleteButton: document.querySelector("#measureSpaceDeleteButton"),
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
    themeMenu: document.querySelector("#themeMenu"),
    themeToggleButton: document.querySelector("#themeToggleButton"),
    themeToggleButtonText: document.querySelector("#themeToggleButtonText"),
    languageSelect: document.querySelector("#languageSelect"),
    editorRecommendedLinks: document.querySelector("#editorRecommendedLinks"),
    editorSoundFontSettingsButton: document.querySelector("#editorSoundFontSettingsButton"),
    editorSoundFontMenuLabel: document.querySelector("#editorSoundFontMenuLabel"),
    editorSoundFontBackdrop: document.querySelector("#editorSoundFontBackdrop"),
    editorSoundFontCloseButton: document.querySelector("#editorSoundFontCloseButton"),
    editorSoundFontDoneButton: document.querySelector("#editorSoundFontDoneButton"),
    editorSoundFontCurrentName: document.querySelector("#editorSoundFontCurrentName"),
    editorSoundFontFileInput: document.querySelector("#editorSoundFontFileInput"),
    editorSoundFontLoadButton: document.querySelector("#editorSoundFontLoadButton"),
    editorSoundFontResetButton: document.querySelector("#editorSoundFontResetButton"),
    shortcutHelpButton: document.querySelector("#shortcutHelpButton"),
    shortcutHelpBackdrop: document.querySelector("#shortcutHelpBackdrop"),
    shortcutHelpCloseButton: document.querySelector("#shortcutHelpCloseButton"),
    shortcutHelpDoneButton: document.querySelector("#shortcutHelpDoneButton"),
    googleAccountButton: document.querySelector("#googleAccountButton"),
    googleAccountMenu: document.querySelector("#googleAccountMenu"),
    noteToolButton: document.querySelector("#noteToolButton"),
    selectToolButton: document.querySelector("#selectToolButton"),
    overviewTimelineCanvas: document.querySelector("#overviewTimelineCanvas"),
    timelineCanvas: document.querySelector("#timelineCanvas"),
    timelineTempoReadout: document.querySelector("#timelineTempoReadout"),
    timelineTempoValue: document.querySelector("#timelineTempoValue"),
    keyboardCanvas: document.querySelector("#keyboardCanvas"),
    rollViewport: document.querySelector("#rollViewport"),
    rollSpacer: document.querySelector("#rollSpacer"),
    rollCanvas: document.querySelector("#rollCanvas"),
    playhead: document.querySelector("#playhead"),
    playheadTimeLabel: document.querySelector("#playheadTimeLabel"),
    horizontalScrollBar: document.querySelector("#horizontalScrollBar"),
    horizontalScrollThumb: document.querySelector("#horizontalScrollThumb"),
    verticalScrollBar: document.querySelector("#verticalScrollBar"),
    verticalScrollThumb: document.querySelector("#verticalScrollThumb"),
    channelPanel: document.querySelector("#channelPanel"),
    channelTabs: document.querySelector("#channelTabs"),
    loadedFileName: document.querySelector("#loadedFileName"),
    mergeChannelsButton: document.querySelector("#mergeChannelsButton"),
    addChannelButton: document.querySelector("#addChannelButton"),
    deleteChannelsButton: document.querySelector("#deleteChannelsButton"),
    copyChannelButton: document.querySelector("#copyChannelButton"),
    pasteChannelButton: document.querySelector("#pasteChannelButton"),
    noteVolumeButton: document.querySelector("#noteVolumeButton"),
    channelNameInput: document.querySelector("#channelNameInput"),
    channelInstrumentSelect: document.querySelector("#channelInstrumentSelect"),
    deleteChannelButton: document.querySelector("#deleteChannelButton"),
    clearChannelButton: document.querySelector("#clearChannelButton"),
    channelMuteBackdrop: document.querySelector("#channelMuteBackdrop"),
    channelMuteList: document.querySelector("#channelMuteList"),
    channelTitle: document.querySelector("#channelTitle"),
    channelColorInput: document.querySelector("#channelColorInput"),
    dirtyIndicator: document.querySelector("#dirtyIndicator"),
    infoCharCount: document.querySelector("#infoCharCount"),
    infoSelectionCount: document.querySelector("#infoSelectionCount"),
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
    midiImportTitle: document.querySelector("#midiImportTitle"),
    midiImportSourceLabel: document.querySelector("#midiImportSourceLabel"),
    midiImportSummary: document.querySelector("#midiImportSummary"),
    midiImportTargetMode: document.querySelector("#midiImportTargetMode"),
    midiImportQuantize: document.querySelector("#midiImportQuantize"),
    midiImportIgnoreSingle64thOverlap: document.querySelector("#midiImportIgnoreSingle64thOverlap"),
    midiImportLimitChannelsPerInstrument: document.querySelector("#midiImportLimitChannelsPerInstrument"),
    midiImportChannelLimitLabel: document.querySelector("#midiImportChannelLimitLabel"),
    midiImportMidiControls: document.querySelector("#midiImportMidiControls"),
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
    mmlExportCloseButton: document.querySelector("#mmlExportCloseButton"),
    mmlExportSelectAllButton: document.querySelector("#mmlExportSelectAllButton"),
    mmlExportClearAllButton: document.querySelector("#mmlExportClearAllButton"),
    mmlExportChannelList: document.querySelector("#mmlExportChannelList"),
    mmlExportCopyPanel: document.querySelector("#mmlExportCopyPanel"),
    mmlExportFullCopyDetail: document.querySelector("#mmlExportFullCopyDetail"),
    mmlExportCopyAllButton: document.querySelector("#mmlExportCopyAllButton"),
    mmlExportSplitSummary: document.querySelector("#mmlExportSplitSummary"),
    mmlExportSplitLimitInput: document.querySelector("#mmlExportSplitLimitInput"),
    mmlExportSplitButtons: document.querySelector("#mmlExportSplitButtons"),
    mmlExportSummary: document.querySelector("#mmlExportSummary"),
    mmlExportCancelButton: document.querySelector("#mmlExportCancelButton"),
    channelMergeBackdrop: document.querySelector("#channelMergeBackdrop"),
    channelMergeCloseButton: document.querySelector("#channelMergeCloseButton"),
    channelMergeCancelButton: document.querySelector("#channelMergeCancelButton"),
    channelMergeApplyButton: document.querySelector("#channelMergeApplyButton"),
    channelMergeSelectAllButton: document.querySelector("#channelMergeSelectAllButton"),
    channelMergeClearAllButton: document.querySelector("#channelMergeClearAllButton"),
    channelMergeList: document.querySelector("#channelMergeList"),
    channelMergeSummary: document.querySelector("#channelMergeSummary"),
    channelMergeRoleOptions: document.querySelector("#channelMergeRoleOptions"),
    channelMergeOverlapOptions: document.querySelector("#channelMergeOverlapOptions"),
    channelDeleteBackdrop: document.querySelector("#channelDeleteBackdrop"),
    channelDeleteCloseButton: document.querySelector("#channelDeleteCloseButton"),
    channelDeleteCancelButton: document.querySelector("#channelDeleteCancelButton"),
    channelDeleteApplyButton: document.querySelector("#channelDeleteApplyButton"),
    channelDeleteSelectAllButton: document.querySelector("#channelDeleteSelectAllButton"),
    channelDeleteClearAllButton: document.querySelector("#channelDeleteClearAllButton"),
    channelDeleteList: document.querySelector("#channelDeleteList"),
    channelDeleteSummary: document.querySelector("#channelDeleteSummary"),
    channelEditBackdrop: document.querySelector("#channelEditBackdrop"),
    channelEditCloseButton: document.querySelector("#channelEditCloseButton"),
    channelEditCancelButton: document.querySelector("#channelEditCancelButton"),
    channelEditApplyButton: document.querySelector("#channelEditApplyButton"),
    channelEditNameInput: document.querySelector("#channelEditNameInput"),
    channelEditInstrumentSelect: document.querySelector("#channelEditInstrumentSelect"),
    channelEditColorInput: document.querySelector("#channelEditColorInput"),
    channelEditTargetLabel: document.querySelector("#channelEditTargetLabel"),
    channelMmlBackdrop: document.querySelector("#channelMmlBackdrop"),
    channelMmlDialog: document.querySelector("#channelMmlDialog"),
    channelMmlTargetLabel: document.querySelector("#channelMmlTargetLabel"),
    channelMmlText: document.querySelector("#channelMmlText"),
    channelMmlIncludeTempo: document.querySelector("#channelMmlIncludeTempo"),
    channelMmlStatus: document.querySelector("#channelMmlStatus"),
    channelMmlCloseButton: document.querySelector("#channelMmlCloseButton"),
    channelMmlCancelButton: document.querySelector("#channelMmlCancelButton"),
    channelMmlApplyButton: document.querySelector("#channelMmlApplyButton"),
    audioEditBackdrop: document.querySelector("#audioEditBackdrop"),
    audioEditCloseButton: document.querySelector("#audioEditCloseButton"),
    audioEditCancelButton: document.querySelector("#audioEditCancelButton"),
    audioEditApplyButton: document.querySelector("#audioEditApplyButton"),
    audioEditNameInput: document.querySelector("#audioEditNameInput"),
    audioEditColorInput: document.querySelector("#audioEditColorInput"),
    audioEditOffsetInput: document.querySelector("#audioEditOffsetInput"),
    audioEditRateInput: document.querySelector("#audioEditRateInput"),
    audioEditVolumeInput: document.querySelector("#audioEditVolumeInput"),
    audioEditTargetLabel: document.querySelector("#audioEditTargetLabel"),
    midiTransferBackdrop: document.querySelector("#midiTransferBackdrop"),
    midiTransferCloseButton: document.querySelector("#midiTransferCloseButton"),
    midiTransferCancelButton: document.querySelector("#midiTransferCancelButton"),
    midiTransferApplyButton: document.querySelector("#midiTransferApplyButton"),
    midiTransferSourceLabel: document.querySelector("#midiTransferSourceLabel"),
    midiTransferChannelList: document.querySelector("#midiTransferChannelList"),
    midiTransferSummary: document.querySelector("#midiTransferSummary"),
    midiTransferSelectAllButton: document.querySelector("#midiTransferSelectAllButton"),
    midiTransferClearAllButton: document.querySelector("#midiTransferClearAllButton"),
    noteVolumeBackdrop: document.querySelector("#noteVolumeBackdrop"),
    noteVolumeCloseButton: document.querySelector("#noteVolumeCloseButton"),
    noteVolumeCancelButton: document.querySelector("#noteVolumeCancelButton"),
    noteVolumeApplyButton: document.querySelector("#noteVolumeApplyButton"),
    noteVolumeFixedMode: document.querySelector("#noteVolumeFixedMode"),
    noteVolumeControlLabel: document.querySelector("#noteVolumeControlLabel"),
    noteVolumeSlider: document.querySelector("#noteVolumeSlider"),
    noteVolumeValue: document.querySelector("#noteVolumeValue"),
    noteVolumeDialogTitle: document.querySelector("#noteVolumeDialogTitle"),
    noteVolumeSelectionLabel: document.querySelector("#noteVolumeSelectionLabel"),
    noteVolumeCurrentCounts: document.querySelector("#noteVolumeCurrentCounts"),
    noteVolumeTargetCounts: document.querySelector("#noteVolumeTargetCounts"),
    noteTrillBackdrop: document.querySelector("#noteTrillBackdrop"),
    noteTrillSelectionLabel: document.querySelector("#noteTrillSelectionLabel"),
    noteTrillDirectionSelect: document.querySelector("#noteTrillDirectionSelect"),
    noteTrillIntervalSelect: document.querySelector("#noteTrillIntervalSelect"),
    noteTrillStartDivisionSelect: document.querySelector("#noteTrillStartDivisionSelect"),
    noteTrillGradualSpeed: document.querySelector("#noteTrillGradualSpeed"),
    noteTrillEndDivisionSelect: document.querySelector("#noteTrillEndDivisionSelect"),
    noteTrillDynamicsSelect: document.querySelector("#noteTrillDynamicsSelect"),
    noteTrillVolumeRangeSelect: document.querySelector("#noteTrillVolumeRangeSelect"),
    noteTrillStartNoteSelect: document.querySelector("#noteTrillStartNoteSelect"),
    noteTrillEndOnBase: document.querySelector("#noteTrillEndOnBase"),
    noteTrillStartEndRow: document.querySelector("#noteTrillStartEndRow"),
    noteTrillPreviewGrid: document.querySelector("#noteTrillPreviewGrid"),
    noteTrillCloseButton: document.querySelector("#noteTrillCloseButton"),
    noteTrillCancelButton: document.querySelector("#noteTrillCancelButton"),
    noteTrillApplyButton: document.querySelector("#noteTrillApplyButton"),
    notePerformanceBackdrop: document.querySelector("#notePerformanceBackdrop"),
    notePerformanceSelectionLabel: document.querySelector("#notePerformanceSelectionLabel"),
    notePerformanceModeSelect: document.querySelector("#notePerformanceModeSelect"),
    notePerformanceDirectionSelect: document.querySelector("#notePerformanceDirectionSelect"),
    notePerformanceSpeedSelect: document.querySelector("#notePerformanceSpeedSelect"),
    notePerformanceStepSelect: document.querySelector("#notePerformanceStepSelect"),
    notePerformanceRangeModeSelect: document.querySelector("#notePerformanceRangeModeSelect"),
    notePerformanceRangeSelect: document.querySelector("#notePerformanceRangeSelect"),
    notePerformanceTargetPitchSelect: document.querySelector("#notePerformanceTargetPitchSelect"),
    notePerformanceDynamicsSelect: document.querySelector("#notePerformanceDynamicsSelect"),
    notePerformanceVolumeRangeSelect: document.querySelector("#notePerformanceVolumeRangeSelect"),
    notePerformanceDirectionRow: document.querySelector("#notePerformanceDirectionRow"),
    notePerformanceStepRow: document.querySelector("#notePerformanceStepRow"),
    notePerformanceRangeRow: document.querySelector("#notePerformanceRangeRow"),
    notePerformancePreviewGrid: document.querySelector("#notePerformancePreviewGrid"),
    notePerformanceHelp: document.querySelector("#notePerformanceHelp"),
    notePerformanceCloseButton: document.querySelector("#notePerformanceCloseButton"),
    notePerformanceCancelButton: document.querySelector("#notePerformanceCancelButton"),
    notePerformanceApplyButton: document.querySelector("#notePerformanceApplyButton"),
    timelineFadeBackdrop: document.querySelector("#timelineFadeBackdrop"),
    timelineFadePosition: document.querySelector("#timelineFadePosition"),
    timelineFadeTypeIn: document.querySelector("#timelineFadeTypeIn"),
    timelineFadeTypeOut: document.querySelector("#timelineFadeTypeOut"),
    timelineFadeDuration: document.querySelector("#timelineFadeDuration"),
    timelineFadeCloseButton: document.querySelector("#timelineFadeCloseButton"),
    timelineFadeCancelButton: document.querySelector("#timelineFadeCancelButton"),
    timelineFadeDeleteButton: document.querySelector("#timelineFadeDeleteButton"),
    timelineFadeApplyButton: document.querySelector("#timelineFadeApplyButton"),
    timelineHoverTooltip: document.querySelector("#timelineHoverTooltip"),
    tempoEditorBackdrop: document.querySelector("#tempoEditorBackdrop"),
    tempoEditorTitle: document.querySelector("#tempoEditorTitle"),
    tempoEditorPosition: document.querySelector("#tempoEditorPosition"),
    tempoBpmInput: document.querySelector("#tempoBpmInput"),
    tempoEditorCloseButton: document.querySelector("#tempoEditorCloseButton"),
    tempoEditorCancelButton: document.querySelector("#tempoEditorCancelButton"),
    tempoEditorApplyButton: document.querySelector("#tempoEditorApplyButton"),
    tempoEditorDeleteButton: document.querySelector("#tempoEditorDeleteButton"),
    tempoSimplifyBackdrop: document.querySelector("#tempoSimplifyBackdrop"),
    tempoSimplifyThresholdInput: document.querySelector("#tempoSimplifyThresholdInput"),
    tempoSimplifyPreserveExtrema: document.querySelector("#tempoSimplifyPreserveExtrema"),
    tempoSimplifySummary: document.querySelector("#tempoSimplifySummary"),
    tempoSimplifyCloseButton: document.querySelector("#tempoSimplifyCloseButton"),
    tempoSimplifyCancelButton: document.querySelector("#tempoSimplifyCancelButton"),
    tempoSimplifyApplyButton: document.querySelector("#tempoSimplifyApplyButton"),
    timeEditBackdrop: document.querySelector("#timeEditBackdrop"),
    timeEditTitle: document.querySelector("#timeEditTitle"),
    timeEditPosition: document.querySelector("#timeEditPosition"),
    timeEditMeasureInput: document.querySelector("#timeEditMeasureInput"),
    timeEditBeatInput: document.querySelector("#timeEditBeatInput"),
    timeEditSelectedChannelOnly: document.querySelector("#timeEditSelectedChannelOnly"),
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
    loadedFileName: "",
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
    channelMerge: { role: "high", overlapMode: "half" },
    editTool: "note",
    ctrlToolHeld: false,
    selectedNoteIds: new Set(),
    nextNoteId: 1,
    dirty: false,
    channels: createDefaultChannels(),
    soloChannelIds: new Set(),
    tempos: createDefaultTempos(),
    nextTempoId: 2,
    interaction: null,
    tempoDrag: null,
    tempoTouchTap: null,
    fadeDrag: null,
    fadeTouchTap: null,
    tempoEditor: { mode: null, tempoId: null, beat: 0 },
    tempoSimplify: { maxBpmDeltaExclusive: 5, preserveExtrema: true },
    timelineFades: [],
    trillOptions: {
      direction: "up",
      intervalSemitones: 2,
      startDivision: "1/32",
      gradualSpeed: false,
      endDivision: "1/32",
      dynamics: "preserve",
      volumeRange: 3,
      startWith: "base",
      endOnBase: true,
    },
    performanceOptions: {
      mode: "glissando",
      direction: "up",
      speed: "1/32",
      stepSemitones: 1,
      rangeMode: "amount",
      rangeSemitones: 12,
      targetPitch: null,
      dynamics: "preserve",
      volumeRange: 3,
    },
    timeEdit: { beat: 0, scope: "all", channelId: null, preferredAction: null },
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
      container: null,
      previewOrder: [],
    },
    channelEdit: {
      channelId: null,
      lastClickChannelId: null,
      lastClickAt: 0,
    },
    channelMmlEdit: {
      channelId: null,
      parseTimer: 0,
      parsed: null,
      includeTempo: true,
    },
    audioEdit: {
      clipId: null,
      lastClickClipId: null,
      lastClickAt: 0,
    },
    noteVolumeDoubleClick: {
      noteId: null,
      lastClickAt: 0,
      selectedIds: new Set(),
    },
    customScrollDrag: null,
    longPress: null,
    masterVolume: 1,
    noteVolumeDisplay: "selected",
    noteVolumeDialogScope: "selected",
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
  let editorSoundFontName = "기본 음색";
  let editorSoundFontBusy = false;
  let editorInstrumentOptionsSignature = "";

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
      await loadProjectFromFile(virtualFile, {
        notify: false,
        loadedFileName: snapshot.data?.editor?.loadedFileName || "",
      });
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

  function normalizeHue(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return ((Math.round(Number(fallback) || 0) % 360) + 360) % 360;
    return ((Math.round(number) % 360) + 360) % 360;
  }

  function getDefaultHue(index = 0) {
    return CHANNEL_HUES[((Math.round(Number(index) || 0) % CHANNEL_HUES.length) + CHANNEL_HUES.length) % CHANNEL_HUES.length];
  }

  function getThemeHueColor(hue, tone = "base") {
    const normalizedHue = normalizeHue(hue);
    const lightTheme = state.theme === "light";
    const toneConfig = lightTheme
      ? {
        base: [88, 42],
        edge: [92, 29],
        bright: [92, 54],
        soft: [74, 50],
      }
      : {
        base: [92, 61],
        edge: [95, 76],
        bright: [96, 70],
        soft: [78, 56],
      };
    const [saturation, lightness] = toneConfig[tone] || toneConfig.base;
    return `hsl(${normalizedHue} ${saturation}% ${lightness}%)`;
  }

  function getPureHueColor(hue) {
    return `hsl(${normalizeHue(hue)} 100% 50%)`;
  }

  function getChannelHue(channel, fallbackIndex = 0) {
    return Number.isFinite(Number(channel?.hue)) ? normalizeHue(channel.hue) : getDefaultHue(fallbackIndex);
  }

  function getChannelColor(channel, fallbackIndex = 0, tone = "base") {
    return getThemeHueColor(getChannelHue(channel, fallbackIndex), tone);
  }

  function getMidiGroupHue(group, fallbackIndex = 0) {
    return Number.isFinite(Number(group?.hue)) ? normalizeHue(group.hue) : getDefaultHue(fallbackIndex);
  }

  function getMidiGroupColor(group, fallbackIndex = 0, tone = "base") {
    return getThemeHueColor(getMidiGroupHue(group, fallbackIndex), tone);
  }

  function getMidiGroupDisplayName(group, fallback = "악기 채널") {
    if (!group) return fallback;
    const channels = Array.isArray(group.channels) ? group.channels : [group.channel].filter((value) => value != null);
    const isDrums = channels.some((channel) => Number(channel) === 9)
      || String(group.programName || group.name || "").toLowerCase() === "drums";
    if (isDrums) return `Ch10 · ${group.programName || group.name || "Drums"}`;
    const program = clamp(Math.round(Number(group.program) || 0), 0, 127);
    const bank = getMidiGroupBank(group);
    const bankPrefix = bank > 0 ? `B${bank} · ` : "";
    return `${bankPrefix}#${program + 1} · ${group.programName || group.name || GM_PROGRAM_NAMES[program] || fallback}`;
  }

  let activeHueColorControl = null;
  let hueColorPalette = null;
  let hueColorRange = null;
  let hueColorValue = null;

  function getHueControlValue(control, fallback = 0) {
    return normalizeHue(control?.dataset?.hue, fallback);
  }

  function hueControlUsesPureColor(control) {
    // 편집 팝업은 저장되는 Hue 그 자체를 고르는 곳이므로 테마 명도 보정을 하지 않습니다.
    // 실제 채널/노트/오디오에 적용될 때만 getThemeHueColor()로 테마에 맞춰 표시합니다.
    return control === elements.channelEditColorInput || control === elements.audioEditColorInput;
  }

  function getHueControlDisplayColor(control, hue) {
    return hueControlUsesPureColor(control) ? getPureHueColor(hue) : getThemeHueColor(hue);
  }

  function setHueControlValue(control, hue, { dispatch = false } = {}) {
    if (!control) return;
    const normalizedHue = normalizeHue(hue);
    control.dataset.hue = String(normalizedHue);
    control.style.setProperty("--channel-current-color", getHueControlDisplayColor(control, normalizedHue));
    control.title = `색상 Hue ${normalizedHue}°`;
    control.setAttribute("aria-label", `색상 Hue ${normalizedHue}도`);
    if (dispatch) control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function refreshHuePaletteTheme() {
    if (!hueColorPalette) return;
    const pure = hueControlUsesPureColor(activeHueColorControl);
    hueColorPalette.querySelectorAll(".recommended-color-swatch[data-hue]").forEach((button) => {
      button.style.setProperty("--swatch-color", pure
        ? getPureHueColor(button.dataset.hue)
        : getThemeHueColor(button.dataset.hue));
    });
  }

  function closeHueColorPalette() {
    if (!hueColorPalette) return;
    hueColorPalette.hidden = true;
    activeHueColorControl = null;
  }

  function ensureHueColorPalette() {
    if (hueColorPalette) return hueColorPalette;
    const menu = document.createElement("div");
    menu.className = "recommended-color-palette hue-color-palette";
    menu.hidden = true;
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Hue 색상 선택");

    const title = document.createElement("div");
    title.className = "recommended-color-palette-title";
    title.textContent = "색상";

    const grid = document.createElement("div");
    grid.className = "recommended-color-grid";
    CHANNEL_HUES.forEach((hue, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recommended-color-swatch";
      button.dataset.hue = String(hue);
      button.style.setProperty("--swatch-color", getThemeHueColor(hue));
      button.title = `${hue}°`;
      button.setAttribute("aria-label", `Hue ${hue}도`);
      button.addEventListener("click", () => {
        const control = activeHueColorControl;
        if (!control) return;
        setHueControlValue(control, hue, { dispatch: true });
        closeHueColorPalette();
      });
      grid.append(button);
    });

    const hueWrap = document.createElement("div");
    hueWrap.className = "recommended-hue-control";
    const hueHeader = document.createElement("div");
    hueHeader.className = "recommended-hue-header";
    const hueLabel = document.createElement("span");
    hueLabel.textContent = "HSL Hue";
    const hueOutput = document.createElement("output");
    hueOutput.textContent = "0°";
    hueHeader.append(hueLabel, hueOutput);

    const range = document.createElement("input");
    range.type = "range";
    range.className = "recommended-hue-range";
    range.min = "0";
    range.max = "359";
    range.step = "1";
    range.value = "0";
    range.setAttribute("aria-label", "Hue 0도에서 359도");
    range.addEventListener("input", () => {
      const hue = normalizeHue(range.value);
      hueOutput.textContent = `${hue}°`;
      if (activeHueColorControl) setHueControlValue(activeHueColorControl, hue);
    });
    range.addEventListener("change", () => {
      const control = activeHueColorControl;
      if (!control) return;
      const hue = normalizeHue(range.value);
      hueOutput.textContent = `${hue}°`;
      setHueControlValue(control, hue, { dispatch: true });
    });
    hueWrap.append(hueHeader, range);

    menu.append(title, grid, hueWrap);
    document.body.append(menu);
    hueColorPalette = menu;
    hueColorRange = range;
    hueColorValue = hueOutput;

    document.addEventListener("pointerdown", (event) => {
      if (menu.hidden) return;
      if (menu.contains(event.target) || event.target === activeHueColorControl) return;
      closeHueColorPalette();
    });
    return menu;
  }

  function openHueColorPalette(control) {
    if (!control || control.disabled) return false;
    const menu = ensureHueColorPalette();
    activeHueColorControl = control;
    refreshHuePaletteTheme();
    const currentHue = getHueControlValue(control);
    if (hueColorRange) hueColorRange.value = String(currentHue);
    if (hueColorValue) hueColorValue.textContent = `${currentHue}°`;
    const rect = control.getBoundingClientRect();
    menu.hidden = false;
    const width = menu.offsetWidth || 196;
    const height = menu.offsetHeight || 146;
    const left = clamp(rect.left, 6, Math.max(6, window.innerWidth - width - 6));
    const below = rect.bottom + 6;
    const top = below + height <= window.innerHeight - 6 ? below : Math.max(6, rect.top - height - 6);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    return true;
  }

  function bindHueColorPalette(control) {
    if (!control) return;
    control.addEventListener("click", (event) => {
      if (control.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      openHueColorPalette(control);
    });
  }

  function updateSourceColorControl(hue, editable = false) {
    const displayColor = editable ? getThemeHueColor(hue) : SOURCE_ROOT_COLOR;
    elements.midiSourceIdentity?.style.setProperty("--channel-current-color", displayColor);
    elements.midiSourceColorInput?.closest(".source-color-control")?.style.setProperty("--channel-current-color", displayColor);
    if (elements.midiSourceColorInput) {
      if (editable) setHueControlValue(elements.midiSourceColorInput, hue);
      elements.midiSourceColorInput.disabled = !editable;
      elements.midiSourceColorInput.title = editable ? `악기 채널 색상 · Hue ${normalizeHue(hue)}°` : "원본 루트 색상은 고정됩니다.";
    }
    elements.midiSourceIdentity?.classList.toggle("source-root-identity", !editable);
  }

  function updateChannelColorControl(hue) {
    const normalizedHue = normalizeHue(hue);
    const displayColor = getThemeHueColor(normalizedHue);
    const identity = elements.channelColorInput?.closest(".channel-identity-control");
    const control = elements.channelColorInput?.closest(".channel-color-control");
    identity?.style.setProperty("--channel-current-color", displayColor);
    control?.style.setProperty("--channel-current-color", displayColor);
    setHueControlValue(elements.channelColorInput, normalizedHue);
  }

  function createDefaultChannel(id, fallbackIndex = 0) {
    return {
      id,
      name: `Ch${id}`,
      hue: getDefaultHue(fallbackIndex),
      muted: false,
      visible: true,
      instrument: "Piano",
      instrumentProgram: 0,
      instrumentBank: 0,
      instrumentExactPreset: true,
      defaultNoteVolume: CONFIG.defaultNewChannelNoteVolume,
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

  function getMidiGroupBank(group) {
    if (isMidiGroupDrums(group)) return 128;
    const explicit = Number(group?.bank);
    if (Number.isFinite(explicit)) return clamp(Math.round(explicit), 0, 16383);
    const bankMsb = clamp(Math.round(Number(group?.bankMsb) || 0), 0, 127);
    const bankLsb = clamp(Math.round(Number(group?.bankLsb) || 0), 0, 127);
    return bankMsb * 128 + bankLsb;
  }

  function getMidiGroupInstrumentKey(group) {
    if (isMidiGroupDrums(group)) return "drums";
    const bank = getMidiGroupBank(group);
    const program = clamp(Math.round(Number(group?.program) || 0), 0, 127);
    return `bank-${bank}-program-${program}`;
  }

  function compareMidiGroupsWithDrumsLast(left, right) {
    const leftDrums = isMidiGroupDrums(left);
    const rightDrums = isMidiGroupDrums(right);
    if (leftDrums !== rightDrums) return leftDrums ? 1 : -1;
    return getMidiGroupBank(left) - getMidiGroupBank(right)
      || clamp(Math.round(Number(left?.program) || 0), 0, 127) - clamp(Math.round(Number(right?.program) || 0), 0, 127)
      || Math.max(0, Number(left?.trackIndex) || 0) - Math.max(0, Number(right?.trackIndex) || 0);
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
    const stored = Number(channel?.instrumentProgram);
    if (Number.isFinite(stored)) return clamp(Math.round(stored), 0, 127);
    return getInstrumentProgramFromName(channel?.instrument);
  }

  function getChannelInstrumentBank(channel) {
    const stored = Number(channel?.instrumentBank);
    if (Number.isFinite(stored)) return clamp(Math.round(stored), 0, 16383);
    return isDrumInstrumentName(channel?.instrument) ? 128 : 0;
  }

  function getChannelInstrumentExactPreset(channel) {
    return channel?.instrumentExactPreset === true;
  }

  function isChannelPercussionInstrument(channel) {
    const bank = getChannelInstrumentBank(channel);
    const program = getChannelInstrumentProgram(channel);
    if (bank === 128 || isDrumInstrumentName(channel?.instrument)) return true;
    return isEditorUsingEmbeddedDefaultSoundBank() && bank === 0 && (program === 12 || program === 13);
  }

  function editorPresetKey(bank = 0, program = 0) {
    return `${clamp(Math.round(Number(bank) || 0), 0, 16383)}:${clamp(Math.round(Number(program) || 0), 0, 127)}`;
  }

  function parseEditorPresetKey(value) {
    const match = String(value || "").match(/^(\d+):(\d+)$/);
    if (!match) return { bank: 0, program: 0 };
    return {
      bank: clamp(Math.round(Number(match[1]) || 0), 0, 16383),
      program: clamp(Math.round(Number(match[2]) || 0), 0, 127),
    };
  }

  function getEditorSoundBankPresets() {
    const soundBank = audioEngine?.soundBank;
    if (!soundBank || !Array.isArray(soundBank.presets)) return [];
    const seen = new Set();
    return soundBank.presets
      .filter((preset) => preset && Array.isArray(preset.regions) && preset.regions.length)
      .slice()
      .sort((left, right) => (
        Number(left.bank || 0) - Number(right.bank || 0)
        || Number(left.preset || 0) - Number(right.preset || 0)
        || String(left.name || "").localeCompare(String(right.name || ""))
      ))
      .filter((preset) => {
        const key = editorPresetKey(preset.bank, preset.preset);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function findEditorSoundBankPreset(bank = 0, program = 0) {
    const targetKey = editorPresetKey(bank, program);
    return getEditorSoundBankPresets().find((preset) => editorPresetKey(preset.bank, preset.preset) === targetKey) || null;
  }

  function formatEditorPresetLabel(preset) {
    const bank = clamp(Math.round(Number(preset?.bank) || 0), 0, 16383);
    const program = clamp(Math.round(Number(preset?.preset) || 0), 0, 127);
    const name = String(preset?.name || `Preset ${program + 1}`).trim();
    const number = String(program + 1).padStart(3, "0");
    return bank === 0 ? `${number} ${name}` : `Bank ${bank} · ${number} ${name}`;
  }

  function setChannelInstrumentPreset(channel, preset) {
    if (!channel || !preset) return false;
    channel.instrumentProgram = clamp(Math.round(Number(preset.preset) || 0), 0, 127);
    channel.instrumentBank = clamp(Math.round(Number(preset.bank) || 0), 0, 16383);
    channel.instrumentExactPreset = true;
    channel.instrument = String(preset.name || `Preset ${channel.instrumentProgram + 1}`).trim();
    return true;
  }

  function isEditorUsingEmbeddedDefaultSoundBank() {
    if (audioEngine?.soundBank) return Boolean(audioEngine.soundBank.isEmbeddedDefault);
    return editorSoundFontName === "기본 음색";
  }

  function chooseDefaultPresetForMidiGroup(group, notes = []) {
    const mapper = window.MobibardDefaultInstrumentMap;
    if (!mapper?.resolveRequest) return { bank: 0, program: 0, name: "Piano" };
    if (isMidiGroupDrums(group)) {
      const counts = new Map();
      for (const note of Array.isArray(notes) ? notes : []) {
        const target = mapper.resolveRequest({ isDrum: true, bank: 128, channel: 9, midi: Number(note?.pitch) });
        const key = editorPresetKey(target?.bank, target?.preset);
        const current = counts.get(key) || { target, count: 0 };
        current.count += 1;
        counts.set(key, current);
      }
      const best = [...counts.values()].sort((left, right) => (
        right.count - left.count
        || Number(left.target?.priority || 0) - Number(right.target?.priority || 0)
      ))[0]?.target || mapper.resolveRequest({ isDrum: true, bank: 128 });
      return {
        bank: clamp(Math.round(Number(best?.bank) || 0), 0, 16383),
        program: clamp(Math.round(Number(best?.preset) || 0), 0, 127),
        name: String(best?.name || "Piano"),
      };
    }
    const target = mapper.resolveRequest({
      program: clamp(Math.round(Number(group?.program) || 0), 0, 127),
      // The embedded MobiBard bank maps melodic instruments by GM program.
      // Preserve source bank metadata for grouping/custom banks, but do not let bank 128
      // accidentally classify a melodic source as percussion in the default mapper.
      bank: 0,
      instrumentName: group?.programName || group?.name || "",
    });
    return {
      bank: clamp(Math.round(Number(target?.bank) || 0), 0, 16383),
      program: clamp(Math.round(Number(target?.preset) || 0), 0, 127),
      name: String(target?.name || "Piano"),
    };
  }

  function resolveMidiGroupEditorPreset(group, notes = []) {
    const presets = getEditorSoundBankPresets();
    const fallback = presets[0] || null;
    if (isEditorUsingEmbeddedDefaultSoundBank()) {
      const mapped = chooseDefaultPresetForMidiGroup(group, notes);
      return findEditorSoundBankPreset(mapped.bank, mapped.program) || {
        bank: mapped.bank,
        preset: mapped.program,
        name: mapped.name,
        regions: [],
      };
    }
    const requestedBank = getMidiGroupBank(group);
    const requestedProgram = isMidiGroupDrums(group) ? 0 : clamp(Math.round(Number(group?.program) || 0), 0, 127);
    return findEditorSoundBankPreset(requestedBank, requestedProgram)
      || findEditorSoundBankPreset(0, requestedProgram)
      || fallback;
  }

  function reconcileEditorChannelsWithSoundBank() {
    const presets = getEditorSoundBankPresets();
    if (!presets.length) return false;
    const first = presets[0];
    let changed = false;
    for (const channel of state.channels) {
      let preset = findEditorSoundBankPreset(getChannelInstrumentBank(channel), getChannelInstrumentProgram(channel));
      if (!preset && isEditorUsingEmbeddedDefaultSoundBank()) {
        const legacyProgram = getChannelInstrumentProgram(channel);
        const legacyIsDrums = isDrumInstrumentName(channel?.instrument) || getChannelInstrumentBank(channel) === 128;
        const mapped = chooseDefaultPresetForMidiGroup({
          program: legacyProgram,
          bank: legacyIsDrums ? 128 : 0,
          channel: legacyIsDrums ? 9 : 0,
          programName: channel?.instrument || "",
          name: channel?.instrument || "",
        }, channel?.notes || []);
        if (mapped) preset = findEditorSoundBankPreset(mapped.bank, mapped.program);
      }
      preset ||= first;
      const before = editorPresetKey(getChannelInstrumentBank(channel), getChannelInstrumentProgram(channel));
      const beforeName = String(channel.instrument || "");
      setChannelInstrumentPreset(channel, preset);
      if (before !== editorPresetKey(channel.instrumentBank, channel.instrumentProgram) || beforeName !== channel.instrument) changed = true;
    }
    return changed;
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
          name: String(group.name || i18nText("midi.default_instrument_name", [groupIndex + 1])),
          trackName: String(group.trackName || ""),
          trackIndex: Math.max(0, Number(group.trackIndex) || 0),
          sourceTrackIndices: Array.isArray(group.sourceTrackIndices)
            ? [...new Set(group.sourceTrackIndices.map((value) => Math.max(0, Math.round(Number(value) || 0))))]
            : [Math.max(0, Number(group.trackIndex) || 0)],
          sourceTracks: Array.isArray(group.sourceTracks) ? group.sourceTracks.map((value) => String(value || "")) : [],
          port: clamp(Math.round(Number(group.port) || 0), 0, 127),
          ports: Array.isArray(group.ports)
            ? [...new Set(group.ports.map((value) => clamp(Math.round(Number(value) || 0), 0, 127)))]
            : [clamp(Math.round(Number(group.port) || 0), 0, 127)],
          channel: clamp(Math.round(Number(group.channel) || 0), 0, 15),
          channels: Array.isArray(group.channels)
            ? [...new Set(group.channels.map((value) => clamp(Math.round(Number(value) || 0), 0, 15)))]
            : [clamp(Math.round(Number(group.channel) || 0), 0, 15)],
          bankMsb: clamp(Math.round(Number(group.bankMsb) || 0), 0, 127),
          bankLsb: clamp(Math.round(Number(group.bankLsb) || 0), 0, 127),
          bank: isMidiGroupDrums(group) ? 128 : getMidiGroupBank(group),
          program: clamp(Math.round(Number(group.program) || 0), 0, 127),
          programName: String(group.programName || GM_PROGRAM_NAMES[Number(group.program) || 0] || "Unknown"),
          visible: group.visible !== false,
          muted: Boolean(group.muted),
          hue: getMidiGroupHue(group, groupIndex),
          notes: Array.isArray(group.notes)
            ? group.notes.map((note, noteIndex) => ({
              id: Number(note.id) || noteIndex + 1,
              pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
              startBeat: Math.max(0, Number(note.startBeat) || 0),
              durationBeat: Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat),
              rawStartBeat: Number.isFinite(Number(note.rawStartBeat))
                ? Math.max(0, Number(note.rawStartBeat))
                : Math.max(0, Number(note.startBeat) || 0),
              rawEndBeat: Number.isFinite(Number(note.rawEndBeat))
                ? Math.max(Number(note.rawStartBeat) || 0, Number(note.rawEndBeat))
                : Math.max(0, Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat),
              sourceTrackIndex: Math.max(0, Math.round(Number(note.sourceTrackIndex ?? note.trackIndex) || 0)),
              sourceTrackIndices: Array.isArray(note.sourceTrackIndices)
                ? [...new Set(note.sourceTrackIndices.map((value) => Math.max(0, Math.round(Number(value) || 0))))]
                : [Math.max(0, Math.round(Number(note.sourceTrackIndex ?? note.trackIndex) || 0))],
              sourcePort: clamp(Math.round(Number(note.sourcePort ?? note.port) || 0), 0, 127),
              sourcePorts: Array.isArray(note.sourcePorts)
                ? [...new Set(note.sourcePorts.map((value) => clamp(Math.round(Number(value) || 0), 0, 127)))]
                : [clamp(Math.round(Number(note.sourcePort ?? note.port) || 0), 0, 127)],
              sourceChannel: clamp(Math.round(Number(note.sourceChannel ?? note.channel) || 0), 0, 15),
              sourceChannels: Array.isArray(note.sourceChannels)
                ? [...new Set(note.sourceChannels.map((value) => clamp(Math.round(Number(value) || 0), 0, 15)))]
                : [clamp(Math.round(Number(note.sourceChannel ?? note.channel) || 0), 0, 15)],
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

  function timelineFadeSourceList(value = state.timelineFades) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.markers)) return value.markers;
    const legacy = [];
    if (value?.fadeIn?.enabled) legacy.push({ id: 1, type: "in", startBeat: Number(value.fadeIn.startBeat) || 0, durationBeat: Math.max(CONFIG.minimumNoteBeat, (Number(value.fadeIn.endBeat) || 0) - (Number(value.fadeIn.startBeat) || 0)) });
    if (value?.fadeOut?.enabled) legacy.push({ id: 2, type: "out", startBeat: Number(value.fadeOut.startBeat) || 0, durationBeat: Math.max(CONFIG.minimumNoteBeat, (Number(value.fadeOut.endBeat) || 0) - (Number(value.fadeOut.startBeat) || 0)) });
    return legacy;
  }

  function timelineFadeTempoMap(tempoCollection = null) {
    return createTempoTimeMap(Array.isArray(tempoCollection) ? tempoCollection : null);
  }

  function timelineFadeBeatToSeconds(beat, tempoCollection = null) {
    return beatToSecondsInTempoMap(Math.max(0, Number(beat) || 0), timelineFadeTempoMap(tempoCollection));
  }

  function timelineFadeSecondsToBeat(seconds, tempoCollection = null) {
    const targetSeconds = Math.max(0, Number(seconds) || 0);
    const map = timelineFadeTempoMap(tempoCollection);
    if (!map.length) return targetSeconds * 2;
    let low = 0;
    let high = map.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (map[middle].startSeconds <= targetSeconds + 1e-9) low = middle;
      else high = middle - 1;
    }
    const segment = map[low];
    return Math.max(0, segment.startBeat + Math.max(0, targetSeconds - segment.startSeconds) * segment.bpm / 60);
  }

  function normalizeTimelineFadeSeconds(value, fallback = 2) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : fallback;
    return Math.max(0.1, Math.round(safe * 10) / 10);
  }

  function timelineFadeDurationSecondsFromBeats(startBeat, durationBeat, tempoCollection = null) {
    const start = Math.max(0, Number(startBeat) || 0);
    const duration = Math.max(CONFIG.minimumNoteBeat, Number(durationBeat) || CONFIG.minimumNoteBeat);
    return normalizeTimelineFadeSeconds(
      timelineFadeBeatToSeconds(start + duration, tempoCollection) - timelineFadeBeatToSeconds(start, tempoCollection),
      0.1,
    );
  }

  function normalizeTimelineFadeEvent(fade, fallbackId = 1, tempoCollection = null) {
    const type = String(fade?.type || "").toLowerCase() === "out" ? "out" : "in";
    const startBeat = snapBeatToUnit(Math.max(0, Number(fade?.startBeat) || 0), CONFIG.minimumNoteBeat);
    const rawSeconds = Number(fade?.durationSeconds);
    const rawDurationBeat = Number(fade?.durationBeat);
    const legacyEnd = Number(fade?.endBeat);
    let durationSeconds;
    if (Number.isFinite(rawSeconds)) {
      durationSeconds = normalizeTimelineFadeSeconds(rawSeconds);
    } else {
      const durationBeat = Number.isFinite(rawDurationBeat)
        ? rawDurationBeat
        : (Number.isFinite(legacyEnd) ? legacyEnd - startBeat : CONFIG.beatsPerMeasure);
      durationSeconds = timelineFadeDurationSecondsFromBeats(startBeat, durationBeat, tempoCollection);
    }
    return { id: Math.max(1, Math.round(Number(fade?.id) || fallbackId)), type, startBeat, durationSeconds };
  }

  function normalizeTimelineFades(value = state.timelineFades, tempoCollection = null) {
    const used = new Set();
    let nextId = 1;
    return timelineFadeSourceList(value).map((fade) => {
      while (used.has(nextId)) nextId += 1;
      let next = normalizeTimelineFadeEvent(fade, nextId, tempoCollection);
      if (used.has(next.id)) next = { ...next, id: nextId };
      used.add(next.id);
      nextId = Math.max(nextId + 1, next.id + 1);
      return next;
    }).sort((a,b) => a.startBeat - b.startBeat || a.id - b.id);
  }

  function getTimelineFadeEndBeat(fade, tempoCollection = null) {
    const normalized = normalizeTimelineFadeEvent(fade, Number(fade?.id) || 1, tempoCollection);
    const startSeconds = timelineFadeBeatToSeconds(normalized.startBeat, tempoCollection);
    return timelineFadeSecondsToBeat(startSeconds + normalized.durationSeconds, tempoCollection);
  }

  function getRawTimelineFadeEndBeat(value, tempoCollection = null) {
    return timelineFadeSourceList(value).reduce((max, fade) => {
      const normalized = normalizeTimelineFadeEvent(fade, 1, tempoCollection);
      return Math.max(max, getTimelineFadeEndBeat(normalized, tempoCollection));
    }, 0);
  }

  function getNextTimelineFadeId() {
    return normalizeTimelineFades().reduce((max, fade) => Math.max(max, Number(fade.id) || 0), 0) + 1;
  }

  function getTimelineFadeAtBeat(beat, tolerance = CONFIG.minimumNoteBeat / 2 + 1e-7) {
    const target = Math.max(0, Number(beat) || 0);
    return normalizeTimelineFades().find((fade) => Math.abs(fade.startBeat - target) <= tolerance) || null;
  }

  function getTimelineFadeById(id) {
    return normalizeTimelineFades().find((fade) => String(fade.id) === String(id)) || null;
  }

  function getTimelineFadeFactorAtBeat(beat) {
    const safeBeat = Math.max(0, Number(beat) || 0);
    let active = null;
    for (const fade of normalizeTimelineFades()) {
      if (fade.startBeat > safeBeat + 1e-7) break;
      active = fade;
    }
    if (!active) return 1;
    const beatSeconds = timelineFadeBeatToSeconds(safeBeat);
    const startSeconds = timelineFadeBeatToSeconds(active.startBeat);
    const endSeconds = startSeconds + active.durationSeconds;
    if (beatSeconds >= endSeconds - 1e-7) return active.type === "in" ? 1 : 0;
    const progress = clamp((beatSeconds - startSeconds) / Math.max(0.1, active.durationSeconds), 0, 1);
    return active.type === "in" ? progress : 1 - progress;
  }

  function getTimelineFadedNoteVolume(note, beat = note?.startBeat) {
    const baseVolume = getNoteVolume(note);
    const factor = getTimelineFadeFactorAtBeat(beat);
    return clamp(Math.round(baseVolume * factor), 0, 15);
  }

  function getNotePlaybackVelocityForVolume(note, volume) {
    const safeVolume = clamp(Math.round(Number(volume) || 0), 0, 15);
    if (safeVolume <= 0) return 0;
    if (safeVolume === getNoteVolume(note)) return getNotePlaybackVelocity(note);
    return mmlVolumeToVelocity(safeVolume);
  }

  // Player playback treats MML V0~V15 as the actual note loudness source.
  // Use the same V -> velocity mapping for SoundFont region selection while
  // the final audible gain is calculated directly from the V value.
  function mmlVolumeToPlayerPlaybackVelocity(value) {
    const volume = clamp(Math.round(Number(value) || 0), 0, 15);
    if (volume <= 0) return 0;
    return clamp(Math.max(1, Math.round(volume / 15 * 127)), 1, 127);
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
    const fades = normalizeTimelineFades();
    const lastFadeBeat = fades.reduce((maximum, fade) => Math.max(maximum, getTimelineFadeEndBeat(fade)), 0);
    return Math.max(lastNoteEnd, lastTempoBeat, lastAudioEnd, lastFadeBeat);
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
    drawOverviewTimeline();
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
    if (state.playback.running || state.playback.loading || state.interaction || state.tempoDrag || state.fadeDrag) {
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
    drawOverviewTimeline();
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

  function getPlaybackVisualBeat(beat, { snapWhenStopped = true } = {}) {
    const safeBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    // Playback must track the audio clock continuously. Quantizing the visual beat
    // here made the red playhead jump one 1/64-note cell at a time, which becomes
    // very noticeable at high zoom. Keep the continuous beat while playback is
    // active and only quantize once playback is stopped.
    if (state.playback.running || state.playback.loading || !snapWhenStopped) {
      return safeBeat;
    }
    return snapBeatToUnit(safeBeat, CONFIG.minimumNoteBeat, "floor");
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
          instrumentBank: getMidiGroupBank(group),
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


  function getCanvasTheme() {
    return CANVAS_THEME[state.theme] || CANVAS_THEME.dark;
  }

  function loadStoredTheme() {
    try {
      const shared = window.localStorage.getItem("mobibard.player.theme");
      if (shared === "light" || shared === "dark") return shared;
      const legacy = window.localStorage.getItem("mobibard-theme")
        ?? window.localStorage.getItem("mml-editor-theme");
      const migrated = legacy === "dark" ? "dark" : "light";
      if (legacy === "light" || legacy === "dark") {
        window.localStorage.setItem("mobibard.player.theme", migrated);
      }
      return migrated;
    } catch {
      return "light";
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
    if (value === "all" || value === "selected" || value === "none") return value;
    return "selected";
  }

  function loadStoredNoteVolumeDisplay() {
    try {
      return normalizeNoteVolumeDisplay(window.localStorage.getItem("mobibard-note-volume-display"));
    } catch {
      return "selected";
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
      const muted = percent === 0;
      elements.volumeButton.innerHTML = `<span aria-hidden="true" class="transport-utility-icon">${muted ? "🔇" : "🔊"}</span><span class="transport-utility-value">${percent}</span>`;
      elements.volumeButton.classList.toggle("volume-muted", muted);
      elements.volumeButton.setAttribute("aria-label", `전체 재생 볼륨 ${percent}%`);
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
      elements.playbackRateButton.innerHTML = `<span aria-hidden="true" class="transport-utility-icon">⏱️</span><span class="transport-utility-value">${label}</span>`;
      elements.playbackRateButton.setAttribute("aria-label", `재생 배속 ${label}`);
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
      const shared = window.localStorage.getItem("mobibard.player.language");
      if (shared) return normalizeLanguage(shared);
      const legacy = window.localStorage.getItem("mobibard-language");
      if (legacy) {
        window.localStorage.setItem("mobibard.player.language", legacy);
        return normalizeLanguage(legacy);
      }
      return "ko";
    } catch {
      return "ko";
    }
  }

  function i18nText(key, values = []) {
    return window.MobibardI18n?.t?.(key, values) || String(key);
  }

  function refreshLocaleDependentUi() {
    state.language = normalizeLanguage(window.MobibardI18n?.language || state.language);
    if (elements.languageSelect) elements.languageSelect.value = state.language;
    updateVolumeControls();
    updatePlaybackRateControl();
    updateThemeControls();
    updateEditorSoundFontUi();
    renderAll();
    updateMidiReferenceUI();
    updateEditMenuState();
    if (elements.midiImportBackdrop && !elements.midiImportBackdrop.hidden) updateMidiImportDialog();
    if (elements.midiTransferBackdrop && !elements.midiTransferBackdrop.hidden) renderMidiTransferDialog();
    if (elements.channelMergeBackdrop && !elements.channelMergeBackdrop.hidden) renderChannelMergeDialog();
    if (elements.channelDeleteBackdrop && !elements.channelDeleteBackdrop.hidden) renderChannelDeleteDialog();
    if (elements.mmlExportBackdrop && !elements.mmlExportBackdrop.hidden) updateMmlExportDialogState();
    if (elements.noteVolumeBackdrop && !elements.noteVolumeBackdrop.hidden) {
      updateNoteVolumeDialogControl();
      updateNoteVolumeDialogCounts();
    }
    if (elements.tempoSimplifyBackdrop && !elements.tempoSimplifyBackdrop.hidden) updateTempoSimplifySummary();
    window.MobibardSiteNavigation?.refresh?.();
  }

  function applyLanguage(language, { persist = true, notify = false } = {}) {
    const nextLanguage = normalizeLanguage(language);
    state.language = nextLanguage;
    if (elements.languageSelect) elements.languageSelect.value = nextLanguage;
    const manager = window.MobibardI18n;
    if (manager?.setLanguage) {
      if (!persist && !notify && normalizeLanguage(manager.language) === nextLanguage) {
        window.MobibardSiteNavigation?.refresh?.();
        return nextLanguage;
      }
      void manager.setLanguage(nextLanguage, { persist, source: notify ? "user" : "app" }).then((applied) => {
        state.language = normalizeLanguage(applied || nextLanguage);
        if (elements.languageSelect) elements.languageSelect.value = state.language;
        window.MobibardSiteNavigation?.refresh?.();
        if (notify) {
          const label = elements.languageSelect?.selectedOptions?.[0]?.textContent || state.language;
          showToast(i18nText("editor.language_saved", [label]));
        }
      }).catch((error) => console.error("Editor locale change failed", error));
    } else {
      document.documentElement.lang = nextLanguage;
      if (persist) {
        try { window.localStorage.setItem("mobibard.player.language", nextLanguage); } catch {}
      }
      if (notify) {
        const label = elements.languageSelect?.selectedOptions?.[0]?.textContent || nextLanguage;
        showToast(`언어 설정을 ${label}(으)로 저장했습니다.`);
      }
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
    if (elements.editNoteVolumeButton) {
      elements.editNoteVolumeButton.disabled = !state.channels.some((channel) => Array.isArray(channel.notes) && channel.notes.length > 0);
    }
    // MML/MIDI 내보내기는 현재 선택/활성 패널/노트 유무와 관계없이 항상 사용할 수 있습니다.
    elements.fileExportButton.disabled = false;
    if (elements.midiExportButton) elements.midiExportButton.disabled = false;
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

  function updateEditorSoundFontUi(message = "") {
    const label = message || editorSoundFontName || "기본 음색";
    if (elements.editorSoundFontCurrentName) elements.editorSoundFontCurrentName.textContent = label;
    if (elements.editorSoundFontMenuLabel) elements.editorSoundFontMenuLabel.textContent = label;
    if (elements.editorSoundFontSettingsButton) {
      elements.editorSoundFontSettingsButton.title = `사운드폰트 설정 · ${label}`;
    }
  }

  function setEditorSoundFontBusy(busy) {
    editorSoundFontBusy = Boolean(busy);
    if (elements.editorSoundFontLoadButton) elements.editorSoundFontLoadButton.disabled = editorSoundFontBusy;
    if (elements.editorSoundFontResetButton) elements.editorSoundFontResetButton.disabled = editorSoundFontBusy;
  }

  function openEditorSoundFontDialog() {
    if (!elements.editorSoundFontBackdrop) return;
    closeThemeMenu();
    updateEditorSoundFontUi();
    elements.editorSoundFontBackdrop.hidden = false;
    requestAnimationFrame(() => elements.editorSoundFontLoadButton?.focus());
  }

  function closeEditorSoundFontDialog() {
    if (!elements.editorSoundFontBackdrop) return;
    elements.editorSoundFontBackdrop.hidden = true;
  }

  async function loadEditorSoundFontFile(file) {
    if (!file || editorSoundFontBusy) return false;
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    setEditorSoundFontBusy(true);
    updateEditorSoundFontUi("불러오는 중…");
    try {
      await audioEngine.useSoundBank(file, { label: file.name || "SoundBank" });
      editorSoundFontName = String(file.name || "SoundBank");
      reconcileEditorChannelsWithSoundBank();
      populateChannelInstrumentSelect();
      renderChannelEditor();
      renderChannelTabs();
      updateEditorSoundFontUi();
      showToast(`${editorSoundFontName} 사운드폰트를 적용했습니다.`);
      return true;
    } catch (error) {
      console.error("Editor SoundFont load failed", error);
      updateEditorSoundFontUi();
      showToast(`사운드폰트를 불러오지 못했습니다: ${error?.message || error}`, "error");
      return false;
    } finally {
      if (elements.editorSoundFontFileInput) elements.editorSoundFontFileInput.value = "";
      setEditorSoundFontBusy(false);
    }
  }

  async function restoreEditorDefaultSoundFont() {
    if (editorSoundFontBusy) return false;
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    setEditorSoundFontBusy(true);
    updateEditorSoundFontUi("기본 음색 준비 중…");
    try {
      await audioEngine.restoreDefaultSoundBank();
      editorSoundFontName = "기본 음색";
      reconcileEditorChannelsWithSoundBank();
      populateChannelInstrumentSelect();
      renderChannelEditor();
      renderChannelTabs();
      updateEditorSoundFontUi();
      showToast("기본 사운드폰트로 복원했습니다.");
      return true;
    } catch (error) {
      console.error("Editor default SoundFont restore failed", error);
      updateEditorSoundFontUi();
      showToast(`기본 사운드폰트를 복원하지 못했습니다: ${error?.message || error}`, "error");
      return false;
    } finally {
      setEditorSoundFontBusy(false);
    }
  }

  function closeGoogleAccountMenu() {
    if (elements.googleAccountMenu) {
      elements.googleAccountMenu.hidden = true;
    }
    elements.googleAccountButton?.setAttribute("aria-expanded", "false");
  }

  function updateThemeControls() {
    const currentThemeLabel = state.theme === "light" ? "밝은 색상" : "어두운 색상";
    if (elements.themeToggleButton) {
      elements.themeToggleButton.title = `테마 변경 · 현재 ${currentThemeLabel}`;
      elements.themeToggleButton.setAttribute("aria-label", `테마 변경 · 현재 ${currentThemeLabel}`);
    }
    if (elements.themeToggleButtonText) {
      elements.themeToggleButtonText.textContent = "테마 변경";
    }
  }

  function applyTheme(theme, { persist = true, notify = false } = {}) {
    const nextTheme = theme === "light" ? "light" : "dark";
    state.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    updateThemeControls();
    if (persist) {
      try {
        window.localStorage.setItem("mobibard.player.theme", nextTheme);
      } catch {
        // Storage can be unavailable in private or restricted environments.
      }
    }
    if (elements.channelTabs) {
      renderChannelTabs();
      renderAudioLane();
      renderChannelEditor();
      refreshHuePaletteTheme();
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

  function renderLoadedFileName() {
    if (!elements.loadedFileName) return;
    const fileName = String(state.loadedFileName || "").trim();
    elements.loadedFileName.textContent = fileName;
    elements.loadedFileName.title = fileName;
  }

  function renderAll() {
    renderLoadedFileName();
    renderChannelTabs();
    renderChannelEditor();
    renderHistoryPanel();
    updateEditToolControls();
    resizeAndDraw();
    renderAudioLane();
    updateDirtyState();
  }

  function getEffectiveEditTool(event = null) {
    const ctrlHeld = event && typeof event.ctrlKey === "boolean"
      ? Boolean(event.ctrlKey)
      : Boolean(state.ctrlToolHeld);
    if (!ctrlHeld) return state.editTool;
    return state.editTool === "select" ? "note" : "select";
  }

  function setCtrlToolHeld(held) {
    const next = Boolean(held);
    if (state.ctrlToolHeld === next) return false;
    state.ctrlToolHeld = next;
    updateEditToolControls();
    return true;
  }

  function updateEditToolControls() {
    const selecting = getEffectiveEditTool() === "select";
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
    const configuredTimelineHeight = Number.parseFloat(rootStyle.getPropertyValue("--timeline-height")) || 38;
    const configuredOverviewHeight = Number.parseFloat(rootStyle.getPropertyValue("--overview-timeline-height")) || 30;
    const configuredScrollbarSize = Number.parseFloat(rootStyle.getPropertyValue("--scrollbar-size")) || 12;
    const keyboardWidth = Math.max(1, Math.round(configuredKeyboardWidth));
    const timelineWidth = Math.max(1, Math.round(elements.rollViewport.clientWidth));
    const keyboardHeight = Math.max(1, Math.round(elements.rollViewport.clientHeight));
    const timelineHeight = Math.max(1, Math.round(configuredTimelineHeight));
    const overviewHeight = Math.max(1, Math.round(configuredOverviewHeight));
    const overviewWidth = keyboardWidth + timelineWidth + Math.max(0, Math.round(configuredScrollbarSize));
    if (elements.overviewTimelineCanvas) resizeCanvas(elements.overviewTimelineCanvas, overviewWidth, overviewHeight);
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
    const hasMidiSelection = state.midiSelectedNoteKeys.size > 0;

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
        const selectionDim = hasMidiSelection && !selected ? 0.75 : 1;
        context.globalAlpha = (group.muted ? baseAlpha * 0.46 : baseAlpha) * selectionDim;
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
        if (selected) {
          context.save();
          context.globalAlpha = 1;
          context.fillStyle = theme.selectedOverlay;
          context.fillRect(x + 1, y, width, height);
          context.strokeStyle = theme.selectedHalo;
          context.lineWidth = 5;
          context.strokeRect(x + 1.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
          context.strokeStyle = theme.selectedStroke;
          context.lineWidth = 2.5;
          context.strokeRect(x + 1.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
          context.restore();
        } else {
          context.globalAlpha = (group.muted ? baseAlpha * 0.46 : baseAlpha) * selectionDim;
          context.strokeStyle = color || theme.midiReferenceStroke;
          context.lineWidth = active ? 1.5 : 1;
          context.strokeRect(x + 1.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
        }
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
      // Dark mode needs the note edge to move away from the dark canvas, not toward it.
      // Light mode keeps the existing darker edge so channel colors preserve their embossed look.
      const noteBorderColor = getChannelColor(channel, channelIndex, "edge");
      const isActive = state.activePanel === "notes" && channelIndex === state.activeChannel;
      const hasActiveSelection = isActive && state.selectedNoteIds.size > 0;
      // Keep overlaps visible, while giving the active channel a dense foreground presence.
      const baseAlpha = isActive ? 0.99 : 0.70;
      const channelAlpha = isChannelEffectivelyMuted(channel) ? baseAlpha * 0.46 : baseAlpha;
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
        const selected = state.selectedNoteIds.has(note.id);
        const noteVolume = getNoteVolume(note);
        const selectionDim = isActive && hasActiveSelection && !selected ? 0.75 : 1;
        context.globalAlpha = channelAlpha * (0.62 + noteVolume / 15 * 0.36) * selectionDim;

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
        if (selected) {
          context.save();
          context.globalAlpha = 1;
          context.fillStyle = theme.selectedOverlay;
          context.fillRect(x + 1, y, widthValue, heightValue);
          context.strokeStyle = theme.selectedHalo;
          context.lineWidth = 5;
          context.strokeRect(x + 1.5, y + 0.5, widthValue - 1, heightValue - 1);
          context.strokeStyle = theme.selectedStroke;
          context.lineWidth = 2.5;
          context.strokeRect(x + 1.5, y + 0.5, widthValue - 1, heightValue - 1);
          context.restore();
        } else {
          context.strokeStyle = noteBorderColor;
          context.lineWidth = isActive ? 1.5 : 1;
          context.strokeRect(x + 1.5, y + 0.5, widthValue - 1, heightValue - 1);
        }

        if (selected) {
          context.globalAlpha = 1;
          context.fillStyle = theme.selectedShine;
          context.fillRect(x + 3, y + 2, Math.max(0, widthValue - 4), 3);
          if (isActive) {
            const handleWidth = Math.min(4, Math.max(2, Math.floor(widthValue / 4)));
            context.fillStyle = theme.resizeHandle;
            context.fillRect(x + 1, y + 1, handleWidth, Math.max(1, heightValue - 2));
            context.fillRect(x + 1 + widthValue - handleWidth, y + 1, handleWidth, Math.max(1, heightValue - 2));
            context.fillStyle = theme.resizeHandleLine;
            context.fillRect(x + 2, y + 4, 1, Math.max(1, heightValue - 8));
            context.fillRect(x + widthValue - 1, y + 4, 1, Math.max(1, heightValue - 8));
          }
        }
        if (shouldDrawNoteVolumeLabel(isActive)) {
          // 마비노기 볼륨은 노트 시작점의 왼쪽 위 바깥에 표시합니다.
          // 설정에서 전체/선택 채널만/숨김을 선택할 수 있습니다.
          const volumeLabel = `V${noteVolume}`;
          const volumeFontSize = clamp(Math.floor(heightValue - 1), 6, 9);
          context.save();
          context.globalAlpha = isChannelEffectivelyMuted(channel)
            ? (isActive ? 0.54 : 0.34)
            : (isActive ? 0.96 : 0.62);
          context.font = `700 ${volumeFontSize}px system-ui, sans-serif`;
          context.textAlign = "left";
          context.textBaseline = "bottom";
          context.lineJoin = "round";
          context.lineWidth = 2;
          // Keep the V label readable across both themes:
          // dark theme = white glyph with black outline, light theme = dark glyph with white outline.
          const darkThemeVolumeLabel = state.theme !== "light";
          context.strokeStyle = darkThemeVolumeLabel ? "rgba(0,0,0,.96)" : "rgba(255,255,255,.94)";
          context.fillStyle = darkThemeVolumeLabel ? "#ffffff" : "#101923";
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


  function getAlignedVisiblePlayheadX() {
    // Preserve sub-pixel X while playing. CSS transforms can render fractional
    // pixels smoothly; rounding here caused a second, pixel-sized stepping layer.
    return beatToX(state.playhead.beat) - elements.rollViewport.scrollLeft;
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

  function getTimelineFadeMarkerScreenGeometry(fade) {
    const normalized = normalizeTimelineFadeEvent(fade, Number(fade?.id) || 1);
    const lineX = Math.round(beatToX(normalized.startBeat) - elements.rollViewport.scrollLeft) + 0.5;
    const label = normalized.type === "out" ? "OUT" : "IN";
    const labelWidth = Math.max(30, 13 + label.length * 6.2);
    const canvasWidth = elements.timelineCanvas.clientWidth;
    const labelX = clamp(lineX + 5, 2, Math.max(2, canvasWidth - labelWidth - 2));
    return {
      lineX,
      label,
      labelX,
      labelY: 2,
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

  let overviewTimelineContentVersion = 0;
  let overviewTimelineActivityCache = null;
  let overviewTimelineDrag = null;

  function invalidateOverviewTimelineActivity() {
    overviewTimelineContentVersion += 1;
    overviewTimelineActivityCache = null;
  }

  function getOverviewTimelineActivityData() {
    if (
      overviewTimelineActivityCache?.version === overviewTimelineContentVersion
      && overviewTimelineActivityCache.channelsRef === state.channels
      && overviewTimelineActivityCache.audioClipsRef === state.audioClips
    ) {
      return overviewTimelineActivityCache;
    }
    let lastNoteEnd = 0;
    const channelActivities = [];
    state.channels.forEach((channel, index) => {
      const intervals = [];
      for (const note of channel.notes || []) {
        const start = Math.max(0, Number(note.startBeat) || 0);
        const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        lastNoteEnd = Math.max(lastNoteEnd, end);
        intervals.push({ start, end });
      }
      if (intervals.length) {
        intervals.sort((a, b) => a.start - b.start || a.end - b.end);
        channelActivities.push({ channel, index, intervals });
      }
    });
    const lastAudioEnd = state.audioClips.reduce(
      (maximum, clip) => Math.max(maximum, getAudioClipEndBeat(clip)),
      0,
    );
    overviewTimelineActivityCache = {
      version: overviewTimelineContentVersion,
      channelsRef: state.channels,
      audioClipsRef: state.audioClips,
      endBeat: Math.max(CONFIG.beatsPerMeasure, lastNoteEnd, lastAudioEnd),
      channelActivities,
    };
    return overviewTimelineActivityCache;
  }

  function getOverviewTimelineEndBeat() {
    return getOverviewTimelineActivityData().endBeat;
  }

  function drawOverviewTimeline() {
    const canvas = elements.overviewTimelineCanvas;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const context = canvas.getContext("2d");
    const width = Math.max(1, canvas.clientWidth || 1);
    const height = Math.max(1, canvas.clientHeight || 30);
    const theme = getCanvasTheme();
    const overviewData = getOverviewTimelineActivityData();
    const endBeat = overviewData.endBeat;

    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.timelineBackground;
    context.fillRect(0, 0, width, height);

    // A few quiet global guides make the compact overview readable without
    // turning it into a second detailed ruler.
    context.strokeStyle = state.theme === "light" ? "rgba(70,85,104,.20)" : "rgba(210,220,232,.13)";
    context.lineWidth = 1;
    for (const ratio of [0.25, 0.5, 0.75]) {
      const x = Math.round(width * ratio) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    const overviewFades = normalizeTimelineFades();
    const drawOverviewFade = (fade) => {
      if (!(endBeat > 0)) return;
      const x1 = clamp(fade.startBeat / endBeat * width, 0, width);
      const x2 = clamp(getTimelineFadeEndBeat(fade) / endBeat * width, 0, width);
      if (x2 <= x1) return;
      const gradient = context.createLinearGradient(x1, 0, x2, 0);
      if (fade.type === "in") {
        gradient.addColorStop(0, "rgba(82,173,255,.03)"); gradient.addColorStop(1, "rgba(82,173,255,.25)");
      } else {
        gradient.addColorStop(0, "rgba(255,133,104,.25)"); gradient.addColorStop(1, "rgba(255,133,104,.03)");
      }
      context.fillStyle = gradient; context.fillRect(x1, 0, Math.max(1, x2 - x1), height);
    };
    overviewFades.forEach(drawOverviewFade);

    const channelActivities = overviewData.channelActivities || [];
    const activeChannelId = getActiveChannel()?.id ?? null;
    const firstTwelve = channelActivities.slice(0, 12);
    const activeEntry = activeChannelId == null
      ? null
      : channelActivities.find((entry) => String(entry.channel?.id) === String(activeChannelId)) || null;
    let visibleChannels = firstTwelve;
    if (activeEntry && !firstTwelve.includes(activeEntry)) {
      visibleChannels = [
        ...channelActivities.filter((entry) => entry !== activeEntry).slice(0, 11),
        activeEntry,
      ];
    }
    // The selected channel is always represented when it has notes. If it lies
    // outside the leading twelve channels, it replaces the twelfth overview lane.
    const lanePitch = Math.max(2.1, Math.min(3.15, (height - 6) / 12));
    const usedHeight = visibleChannels.length * lanePitch;
    const top = Math.max(1, (height - usedHeight) / 2);
    const lineWidth = Math.max(1.3, Math.min(1.85, lanePitch * 0.62));
    const mergeGapPx = 0.85;
    const laneIndexByEntry = new Map(visibleChannels.map((entry, lane) => [entry, lane]));
    const drawOrder = [
      ...visibleChannels.filter((entry) => String(entry.channel?.id) !== String(activeChannelId)),
      ...visibleChannels.filter((entry) => String(entry.channel?.id) === String(activeChannelId)),
    ];

    context.lineCap = "butt";
    for (const entry of drawOrder) {
      const lane = laneIndexByEntry.get(entry) ?? 0;
      const { channel, index, intervals } = entry;
      const isActiveChannel = activeChannelId != null && String(channel?.id) === String(activeChannelId);
      const y = top + lanePitch * (lane + 0.5);
      const barHeight = isActiveChannel ? lineWidth * 2 : lineWidth;
      const barColor = getChannelColor(channel, index);
      const borderColor = state.theme === "light" ? "rgba(74,88,106,.68)" : "rgba(244,248,252,.72)";
      context.globalAlpha = isChannelEffectivelyMuted(channel) ? 0.28 : (channel.visible === false ? 0.42 : 0.92);
      let pendingStart = -1;
      let pendingEnd = -1;
      const flush = () => {
        if (pendingStart < 0) return;
        const x1 = clamp(pendingStart, 0, width);
        const x2 = clamp(Math.max(x1 + 0.8, pendingEnd), 0, width);
        const segmentWidth = Math.max(0.8, x2 - x1);
        const yTop = y - barHeight / 2;
        context.fillStyle = barColor;
        context.fillRect(x1, yTop, segmentWidth, barHeight);
        if (isActiveChannel) {
          context.strokeStyle = borderColor;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(x1, Math.round(yTop) + 0.5);
          context.lineTo(x1 + segmentWidth, Math.round(yTop) + 0.5);
          context.moveTo(x1, Math.round(yTop + barHeight) - 0.5);
          context.lineTo(x1 + segmentWidth, Math.round(yTop + barHeight) - 0.5);
          context.stroke();
        }
        pendingStart = -1;
        pendingEnd = -1;
      };
      for (const interval of intervals) {
        const x1 = clamp(interval.start / endBeat * width, 0, width);
        const x2 = clamp(interval.end / endBeat * width, 0, width);
        if (pendingStart < 0) {
          pendingStart = x1;
          pendingEnd = x2;
        } else if (x1 <= pendingEnd + mergeGapPx) {
          pendingEnd = Math.max(pendingEnd, x2);
        } else {
          flush();
          pendingStart = x1;
          pendingEnd = x2;
        }
      }
      flush();
    }
    context.globalAlpha = 1;

    // Show the currently visible roll window inside the full-song overview.
    const visibleStartBeat = clamp(xToBeat(elements.rollViewport.scrollLeft), 0, endBeat);
    const visibleEndBeat = clamp(
      xToBeat(elements.rollViewport.scrollLeft + elements.rollViewport.clientWidth),
      visibleStartBeat,
      endBeat,
    );
    const viewX = visibleStartBeat / endBeat * width;
    const viewWidth = Math.max(2, (visibleEndBeat - visibleStartBeat) / endBeat * width);
    const isLightOverview = state.theme === "light";
    const viewBoxX = clamp(viewX, 0, Math.max(0, width - 1));
    const viewBoxWidth = Math.max(2, Math.min(viewWidth, width - viewBoxX));

    // Distinguish the visible roll window mainly by fill color. Keep the outline
    // thin so the overview does not feel boxed-in, while retaining enough contrast
    // in both light and dark themes.
    context.save();
    context.fillStyle = isLightOverview ? "rgba(18,112,232,.20)" : "rgba(0,200,255,.14)";
    context.fillRect(viewBoxX, 0, viewBoxWidth, height);
    context.strokeStyle = isLightOverview ? "rgba(0,88,205,.88)" : "rgba(70,220,255,.82)";
    context.lineWidth = 1;
    context.strokeRect(
      Math.round(viewBoxX) + 0.5,
      0.5,
      Math.max(1, Math.round(viewBoxWidth) - 1),
      Math.max(1, height - 1),
    );
    context.restore();

    const playheadX = clamp(state.playhead.beat / endBeat * width, 0, width);
    context.strokeStyle = "rgba(255,78,96,.96)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(Math.round(playheadX) + 0.5, 0);
    context.lineTo(Math.round(playheadX) + 0.5, height);
    context.stroke();
  }

  function overviewTimelineBeatFromPointer(event) {
    const canvas = elements.overviewTimelineCanvas;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * getOverviewTimelineEndBeat();
  }

  function navigateOverviewTimelineFromPointer(event) {
    const targetBeat = overviewTimelineBeatFromPointer(event);
    const targetX = beatToX(targetBeat);
    elements.rollViewport.scrollLeft = clamp(
      targetX - elements.rollViewport.clientWidth / 2,
      0,
      getMaxScrollLeft(),
    );
    // The overview is a viewport navigator only. The red playback line keeps its
    // current beat while the visible piano-roll window moves underneath it.
    updateCustomScrollbars();
    drawRoll();
    drawTimeline();
    return targetBeat;
  }

  function handleOverviewTimelinePointerDown(event) {
    if (event.button !== 0 || !elements.overviewTimelineCanvas) return;
    overviewTimelineDrag = { pointerId: event.pointerId };
    trySetPointerCapture(elements.overviewTimelineCanvas, event.pointerId);
    navigateOverviewTimelineFromPointer(event);
    event.preventDefault();
  }

  function handleOverviewTimelinePointerMove(event) {
    if (overviewTimelineDrag?.pointerId !== event.pointerId) return;
    navigateOverviewTimelineFromPointer(event);
    event.preventDefault();
  }

  function handleOverviewTimelinePointerUp(event) {
    if (overviewTimelineDrag?.pointerId !== event.pointerId) return;
    overviewTimelineDrag = null;
    try {
      elements.overviewTimelineCanvas?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released.
    }
    if (event.type !== "pointercancel") navigateOverviewTimelineFromPointer(event);
    event.preventDefault();
  }

  function drawTimelineFadeOverlay(context, width, height, scrollLeft) {
    for (const fade of normalizeTimelineFades()) {
      const x1 = beatToX(fade.startBeat) - scrollLeft;
      const x2 = beatToX(getTimelineFadeEndBeat(fade)) - scrollLeft;
      if (x2 < 0 || x1 > width || x2 <= x1) continue;
      const left = Math.max(0, x1);
      const right = Math.min(width, x2);
      const gradient = context.createLinearGradient(x1, 0, x2, 0);
      if (fade.type === "in") { gradient.addColorStop(0, "rgba(82,173,255,.03)"); gradient.addColorStop(1, "rgba(82,173,255,.22)"); }
      else { gradient.addColorStop(0, "rgba(255,133,104,.22)"); gradient.addColorStop(1, "rgba(255,133,104,.03)"); }
      context.save();
      context.fillStyle = gradient;
      context.fillRect(left, 0, Math.max(0, right-left), height);
      context.strokeStyle = fade.type === "in" ? "rgba(98,190,255,.92)" : "rgba(255,151,118,.92)";
      context.lineWidth = 2;
      if (x1 >= -1 && x1 <= width + 1) {
        context.beginPath();
        context.moveTo(Math.round(x1)+.5, 0);
        context.lineTo(Math.round(x1)+.5, height);
        context.stroke();
      }
      context.restore();
    }
  }

  function drawTimeline() {
    const context = elements.timelineCanvas.getContext("2d");
    const width = elements.timelineCanvas.clientWidth;
    const height = elements.timelineCanvas.clientHeight || 51;
    const scrollLeft = elements.rollViewport.scrollLeft;
    const theme = getCanvasTheme();
    const currentTempo = getTempoAtBeat(clamp(Number(state.playhead.beat) || 0, 0, getTotalBeats()));
    if (elements.timelineTempoValue) elements.timelineTempoValue.textContent = String(currentTempo);
    if (elements.timelineTempoReadout) elements.timelineTempoReadout.title = `현재 템포 ${currentTempo} BPM`;
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
    drawTimelineFadeOverlay(context, width, height, scrollLeft);

    const visibleFadeMarkers = [];
    for (const fade of normalizeTimelineFades()) {
      const marker = getTimelineFadeMarkerScreenGeometry(fade);
      if (marker.lineX < -marker.labelWidth - 8 || marker.lineX > width + marker.labelWidth + 8) continue;
      visibleFadeMarkers.push({ fade, marker });
    }

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
    for (const { fade, marker } of visibleFadeMarkers) {
      drawRoundedRect(context, marker.labelX, marker.labelY, marker.labelWidth, marker.labelHeight, 3);
      const accent = fade.type === "in"
        ? (state.theme === "light" ? "#267ba8" : "#8bd7ff")
        : (state.theme === "light" ? "#b65f43" : "#ffb39a");
      context.fillStyle = fade.type === "in"
        ? (state.theme === "light" ? "rgba(45, 150, 205, .11)" : "rgba(82, 173, 255, .16)")
        : (state.theme === "light" ? "rgba(192, 91, 58, .10)" : "rgba(255, 133, 104, .15)");
      context.fill();
      context.strokeStyle = accent;
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = accent;
      context.textBaseline = "middle";
      context.fillText(marker.label, marker.labelX + 6, marker.labelY + marker.labelHeight / 2 + 0.5);
    }

    context.font = "700 10px sans-serif";
    for (const marker of visibleTempoMarkers) {
      drawRoundedRect(context, marker.labelX, marker.labelY, marker.labelWidth, marker.labelHeight, 3);
      const tempoAccent = state.theme === "light" ? "#23865b" : "#72e2a8";
      context.fillStyle = state.theme === "light" ? "rgba(35, 134, 91, 0.10)" : "rgba(58, 191, 124, 0.14)";
      context.fill();
      context.strokeStyle = tempoAccent;
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = tempoAccent;
      context.textBaseline = "middle";
      context.fillText(marker.label, marker.labelX + 6, marker.labelY + marker.labelHeight / 2 + 0.5);
    }
    context.textBaseline = "alphabetic";
    context.lineWidth = 1;
    drawOverviewTimeline();
  }

  function formatTimelineHoverClock(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remain = safe - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${remain.toFixed(1).padStart(4, "0")}`;
  }

  function showTimelineHoverTooltip(event, beat) {
    const tooltip = elements.timelineHoverTooltip;
    const host = elements.timelineCanvas?.closest?.(".piano-section");
    if (!tooltip || !host) return;
    const safeBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    tooltip.textContent = formatTimelineHoverClock(beatToSeconds(safeBeat));
    tooltip.hidden = false;
    const hostRect = host.getBoundingClientRect();
    const width = tooltip.offsetWidth || 68;
    const left = clamp(event.clientX - hostRect.left - width / 2, 4, Math.max(4, hostRect.width - width - 4));
    const top = clamp(event.clientY - hostRect.top - 30, 4, Math.max(4, hostRect.height - 28));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function hideTimelineHoverTooltip() {
    if (elements.timelineHoverTooltip) elements.timelineHoverTooltip.hidden = true;
  }

  function handleTimelineHover(event) {
    showTimelineHoverTooltip(event, timelineBeatFromPointer(event));
  }

  function handleOverviewTimelineHover(event) {
    showTimelineHoverTooltip(event, overviewTimelineBeatFromPointer(event));
  }

  function handleHorizontalTrackHover(event) {
    const bar = elements.horizontalScrollBar;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    showTimelineHoverTooltip(event, ratio * getTotalBeats());
  }

  function getPlayheadDisplaySeconds(currentBeat = state.playhead.beat) {
    const safeBeat = clamp(Number(currentBeat) || 0, 0, getTotalBeats());
    const playbackActive = state.playback.running || state.playback.loading;
    const timelineSeconds = playbackActive
      ? beatToSecondsFromMap(safeBeat, state.playback.tempoMap)
      : beatToSeconds(safeBeat);
    return timelineSeconds / Math.max(0.01, Number(state.playbackRate) || 1);
  }

  function formatPlayheadClock(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function updatePlayheadVisual() {
    if (elements.playheadTimeLabel) {
      elements.playheadTimeLabel.textContent = formatPlayheadClock(getPlayheadDisplaySeconds());
    }
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
    elements.playhead.style.transform = `translate3d(${left - 1}px, 0, 0)`;
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
                bank: getMidiGroupBank(group),
              });
            }
          }
        }
      }
    } else {
      for (const channel of state.channels) {
        if (isChannelEffectivelyMuted(channel)) continue;
        for (const note of channel.notes || []) {
          if (note.startBeat <= safeBeat + 1e-7 && note.startBeat + note.durationBeat > safeBeat + 1e-7) {
            const velocity = getNotePlaybackVelocity(note);
            if (velocity > 0) notes.push({
              pitch: note.pitch,
              velocity,
              program: getChannelInstrumentProgram(channel),
              bank: getChannelInstrumentBank(channel),
              exactPreset: getChannelInstrumentExactPreset(channel),
            });
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
        exactPreset: Boolean(note.exactPreset),
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

  function restartRunningPlaybackAtBeat(beat) {
    if (!state.playback.running || !audioEngine.context) return false;

    const endBeat = getPlaybackEndBeat();
    const targetBeat = clamp(Number(beat) || 0, 0, endBeat);
    state.playhead.beat = targetBeat;
    updatePlayheadVisual();
    drawTimeline();
    updatePlaybackTimeInfo(targetBeat);

    if (targetBeat >= endBeat - 1e-7) {
      stopPlayback(false);
      return true;
    }

    window.clearTimeout(state.playback.schedulerTimer);
    state.playback.schedulerTimer = 0;
    state.playback.scrollAnimation = null;
    state.playback.lastTimelineDrawAt = 0;
    stopScheduledAudioClips();
    audioEngine.stopAll();
    clearPlaybackKeyboardPitches();

    state.playback.startBeat = targetBeat;
    state.playback.endBeat = endBeat;
    const midiDocument = isMidiReferenceActive() ? getActiveMidiDocument() : null;
    state.playback.tempoMap = midiDocument
      ? ensureMidiPlaybackCache(midiDocument)?.tempoMap || createTempoTimeMap(midiDocument.tempoEvents || [])
      : createTempoTimeMap();
    state.playback.startSeconds = beatToSecondsFromMap(targetBeat, state.playback.tempoMap);
    state.playback.endSeconds = beatToSecondsFromMap(endBeat, state.playback.tempoMap);

    const playbackNotes = preparePlaybackSchedule(targetBeat);
    const hasPlayableAudio = state.audioClips.some((clip) => (
      !clip.muted
      && getAudioClipEndBeat(clip) > targetBeat + 1e-7
      && Boolean(getAudioRuntime(clip.id)?.audioBuffer)
    ));
    if (!playbackNotes.length && !hasPlayableAudio) {
      stopPlayback(false);
      return true;
    }

    const scheduleDelay = 0.025;
    state.playback.audioStartTime = audioEngine.context.currentTime + scheduleDelay;
    state.playback.startedAt = performance.now() + scheduleDelay * 1000;
    scheduleAudioClipsForPlayback();
    if (playbackNotes.length) schedulePlaybackLookahead();
    updatePlayButton();
    return true;
  }

  function seekPlayheadBeat(beat, { preview = false } = {}) {
    const targetBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    if (state.playback.running && audioEngine.context) {
      restartRunningPlaybackAtBeat(targetBeat);
      return;
    }
    if (state.playback.loading) {
      stopPlayback(false);
      setPlayheadBeat(targetBeat, { preview: false });
      window.setTimeout(() => startPlayback(), 0);
      return;
    }
    setPlayheadBeat(targetBeat, { preview });
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

  function findTimelineFadeMarkerFromPointer(event) {
    const rect = elements.timelineCanvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const touchLike = event.pointerType === "touch" || event.pointerType === "pen";
    const padding = touchLike ? 8 : 2;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const fade of normalizeTimelineFades()) {
      const marker = getTimelineFadeMarkerScreenGeometry(fade);
      const onLabel = pointerX >= marker.labelX - padding
        && pointerX <= marker.labelX + marker.labelWidth + padding
        && pointerY >= marker.labelY - padding
        && pointerY <= marker.labelY + marker.labelHeight + padding;
      const distance = Math.abs(pointerX - marker.lineX);
      if (onLabel && distance < nearestDistance) {
        nearest = fade;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function handleTimelineDoubleClick(event) {
    if (event.button !== 0) return;
    const rawBeat = timelineRawBeatFromPointer(event);
    if (rawBeat < 0) return;
    const fade = findTimelineFadeMarkerFromPointer(event);
    const tempo = fade ? null : findTempoMarkerFromPointer(event);
    const beat = timelineBeatFromPointer(event);
    seekPlayheadBeat(fade?.startBeat ?? tempo?.beat ?? beat);
    if (fade) {
      openTimelineFadeDialog(fade.startBeat, fade);
      event.preventDefault();
      return;
    }
    if (isMidiReferenceActive()) {
      showToast(tempo ? `MIDI 템포 ${tempo.bpm} · 읽기 전용` : "MIDI 템포 맵은 읽기 전용입니다.");
      event.preventDefault();
      return;
    }
    if (tempo) openTempoEditor(tempo);
    else openTempoEditor(null, { beat });
    event.preventDefault();
  }

  function handleTimelinePointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    const rawBeat = timelineRawBeatFromPointer(event);
    const fade = rawBeat >= 0 ? findTimelineFadeMarkerFromPointer(event) : null;
    const tempo = rawBeat >= 0 && !fade ? findTempoMarkerFromPointer(event) : null;
    const touchLike = event.pointerType === "touch" || event.pointerType === "pen";

    if (fade) {
      setPlayheadBeat(fade.startBeat, { stop: true });
      state.fadeDrag = {
        pointerId: event.pointerId,
        fadeId: fade.id,
        originalBeat: fade.startBeat,
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
    setPlayheadBeat(timelineBeatFromPointer(event), { preview: false });
    event.preventDefault();
  }

  function handleTimelinePointerMove(event) {
    if (state.fadeDrag?.pointerId === event.pointerId) {
      const drag = state.fadeDrag;
      const touchLike = drag.pointerType === "touch" || drag.pointerType === "pen";
      if (touchLike && !drag.dragStarted) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (distance <= CONFIG.longPressMoveTolerance) { event.preventDefault(); return; }
        drag.dragStarted = true;
        elements.timelineCanvas.style.cursor = "ew-resize";
      }
      scrollTimelineDuringDrag(event);
      const targetBeat = clamp(timelineBeatFromPointer(event), 0, getTotalBeats());
      const current = getTimelineFadeById(drag.fadeId);
      if (current && !getTimelineFadeAtBeat(targetBeat, 1e-7)) {
        if (Math.abs(current.startBeat - targetBeat) > 1e-7) {
          state.timelineFades = normalizeTimelineFades().map((fade) =>
            String(fade.id) === String(drag.fadeId) ? { ...fade, startBeat: Number(targetBeat.toFixed(6)) } : fade
          );
          drag.moved = true;
          drawTimeline();
          updateChannelInfo();
          if (elements.mmlExportBackdrop && !elements.mmlExportBackdrop.hidden) updateMmlExportDialogState();
        }
      }
      event.preventDefault();
      return;
    }

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

    const hoverFade = findTimelineFadeMarkerFromPointer(event);
    const hoverTempo = hoverFade ? null : findTempoMarkerFromPointer(event);
    elements.timelineCanvas.style.cursor = hoverFade
      ? "ew-resize"
      : hoverTempo
        ? (isMidiReferenceActive() || hoverTempo.fixed ? "pointer" : "ew-resize")
        : "default";
  }

  function handleTimelinePointerUp(event) {
    if (state.fadeDrag?.pointerId === event.pointerId) {
      const drag = state.fadeDrag;
      const moved = drag.moved;
      const touchLike = drag.pointerType === "touch" || drag.pointerType === "pen";
      const fade = getTimelineFadeById(drag.fadeId);
      state.fadeDrag = null;
      elements.timelineCanvas.style.cursor = "default";
      try { elements.timelineCanvas.releasePointerCapture(event.pointerId); } catch {}
      if (moved) {
        markDirty(i18nText("history.timeline_fade"));
        shrinkTimelineToContent();
        drawRoll();
        drawTimeline();
        updateChannelInfo();
        if (elements.mmlExportBackdrop && !elements.mmlExportBackdrop.hidden) updateMmlExportDialogState();
      } else if (touchLike && event.type !== "pointercancel" && fade) {
        openTimelineFadeDialog(fade.startBeat, fade);
      }
      return;
    }

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
    const targetBeat = state.playhead.beat;
    state.playhead.pointerId = null;
    try {
      elements.timelineCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    if (event.type === "pointercancel") {
      if (state.playback.running && audioEngine.context) {
        const elapsedSeconds = Math.max(0, audioEngine.context.currentTime - state.playback.audioStartTime);
        const timelineSeconds = state.playback.startSeconds + elapsedSeconds * Math.max(0.01, Number(state.playbackRate) || 1);
        setPlayheadBeat(getPlaybackVisualBeat(secondsToBeatFromMap(timelineSeconds, state.playback.tempoMap)));
      }
      return;
    }
    if (state.playback.running || state.playback.loading) seekPlayheadBeat(targetBeat);
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
      state.keyboard.voice = audioEngine.playNote(pitch, 108, null, null, { program: previewProgram, bank: previewBank, exactPreset: Boolean(previewChannel) });
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
      state.keyboard.previewVoice = audioEngine.playNote(safePitch, 104, null, 0.14, { program: previewProgram, bank: previewBank, exactPreset: Boolean(previewChannel) });
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

  function selectNotesByKeyboardPitch(pitch) {
    if (isMidiReferenceActive() || state.activePanel !== "notes") return false;
    const safePitch = clamp(Math.round(Number(pitch) || CONFIG.minPitch), CONFIG.minPitch, CONFIG.maxPitch);
    const channel = getActiveChannel();
    // Ctrl/Cmd + piano key is additive: keep the current selection and append
    // every matching-pitch note from the active channel.
    for (const note of channel?.notes || []) {
      if (Math.round(Number(note.pitch) || CONFIG.minPitch) === safePitch) {
        state.selectedNoteIds.add(note.id);
      }
    }
    drawRoll();
    updateChannelInfo();
    return true;
  }

  function handleKeyboardPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    state.keyboard.pointerId = event.pointerId;
    trySetPointerCapture(elements.keyboardCanvas, event.pointerId);
    const pitch = keyboardPitchFromPointer(event);
    state.keyboard.hoverPitch = pitch;
    if (event.ctrlKey || event.metaKey) {
      selectNotesByKeyboardPitch(pitch);
    }
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

  function getChannelDragContainer() {
    return state.channelDrag.container || elements.channelTabs || null;
  }

  function clearChannelDropIndicators() {
    const container = getChannelDragContainer();
    container?.querySelectorAll("[data-channel-id]").forEach((item) => {
      item.classList.remove("drop-before", "drop-after");
      item.classList.toggle(
        "dragging",
        Boolean(state.channelDrag.dragging)
          && item.dataset.channelId === String(state.channelDrag.sourceId),
      );
    });
  }

  function getChannelPreviewOrderIds(container = getChannelDragContainer()) {
    if (!container) return [];
    return [...container.querySelectorAll("[data-channel-id]")]
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
    const container = getChannelDragContainer();
    if (!drag.dragging || !container || !drag.sourceElement) return;
    const treeRect = container.getBoundingClientRect();
    if (event.clientY < treeRect.top + 42) {
      container.scrollTop -= 14;
    } else if (event.clientY > treeRect.bottom - 42) {
      container.scrollTop += 14;
    }

    const sourceElement = drag.sourceElement;
    const channelItems = [...container.querySelectorAll("[data-channel-id]")]
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
      container.insertBefore(sourceElement, beforeElement);
    } else {
      // 펼친 목록과 접힌 레일 모두 음악 채널은 오디오 항목보다 위에 유지합니다.
      const firstAudioItem = container.querySelector("[data-audio-clip-id]");
      container.insertBefore(sourceElement, firstAudioItem || null);
    }
    drag.previewOrder = getChannelPreviewOrderIds(container);
    clearChannelDropIndicators();
  }

  function resetChannelDragState() {
    state.channelDrag.sourceId = null;
    state.channelDrag.pointerId = null;
    state.channelDrag.dragging = false;
    state.channelDrag.sourceElement = null;
    state.channelDrag.container = null;
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

  function beginChannelPointerDrag(event, channelId, item, container = elements.channelTabs) {
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
    state.channelDrag.container = container || item.parentElement || elements.channelTabs;
    state.channelDrag.previewOrder = getChannelPreviewOrderIds(state.channelDrag.container);
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
    if (index < 0) return;
    const now = performance.now();
    const doubleClick = state.channelEdit.lastClickChannelId === String(sourceId)
      && now - state.channelEdit.lastClickAt <= 360;
    state.channelEdit.lastClickChannelId = doubleClick ? null : String(sourceId);
    state.channelEdit.lastClickAt = doubleClick ? 0 : now;
    if (doubleClick) {
      openChannelEditDialog(sourceId);
    } else {
      selectChannel(index);
      // 채널 목록을 마우스/터치로 선택하면 renderChannelTabs()로 기존 버튼이 교체되어
      // 포커스가 document로 빠질 수 있습니다. 선택한 채널 버튼에 포커스를 복원해
      // 바로 ↑/↓ 키로 이전/다음 채널을 계속 선택할 수 있게 합니다.
      requestAnimationFrame(() => {
        const restored = findChannelTreeItemByIdentity({ kind: "channel", id: String(sourceId) });
        restored?.querySelector(".channel-tree-main")?.focus({ preventScroll: true });
        restored?.scrollIntoView({ block: "nearest" });
      });
    }
  }


  function getAudioClipHue(clip, fallbackIndex = 0) {
    return Number.isFinite(Number(clip?.hue)) ? normalizeHue(clip.hue) : getDefaultHue(fallbackIndex);
  }

  function getAudioClipColor(clip, fallbackIndex = 0, tone = "base") {
    return getThemeHueColor(getAudioClipHue(clip, fallbackIndex), tone);
  }

  function normalizeAudioClip(raw, index = 0) {
    const startBeat = Math.max(0, Number(raw?.startBeat) || 0);
    const durationBeat = Math.max(CONFIG.minimumNoteBeat, Number(raw?.durationBeat) || CONFIG.beatsPerMeasure);
    return {
      id: String(raw?.id || `audio-${index + 1}`),
      title: String(raw?.title || raw?.fileName || `오디오 ${index + 1}`),
      fileName: String(raw?.fileName || raw?.title || `오디오 ${index + 1}`),
      mimeType: String(raw?.mimeType || "audio/*"),
      hue: getAudioClipHue(raw, index),
      visible: raw?.visible !== false,
      muted: Boolean(raw?.muted),
      lane: clamp(Math.round(Number(raw?.lane ?? raw?.row ?? (index % 3)) || 0), 0, 2),
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
    const hue = getAudioClipHue(clip, state.audioClips.indexOf(clip));
    const displayColor = getThemeHueColor(hue);
    elements.audioSourceIdentity?.style.setProperty("--channel-current-color", displayColor);
    elements.audioSourceColorInput?.closest(".source-color-control")?.style.setProperty("--channel-current-color", displayColor);
    setHueControlValue(elements.audioSourceColorInput, hue);
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
    // 노트는 캔버스에 그려지므로 state만 비우면 선택 하이라이트가 화면에 남습니다.
    // 오디오 선택 즉시 피아노롤도 다시 그려 양쪽 선택이 동시에 보이지 않게 합니다.
    drawRoll();
    updateChannelInfo();
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
    if (notify) showToast(i18nText(clip.muted ? "ui.mute_2" : "ui.unmute_2", [clip.title]));
    return true;
  }

  function setAudioClipHue(clipId, hue, { commit = true } = {}) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip) return false;
    const normalizedHue = normalizeHue(hue, getAudioClipHue(clip, state.audioClips.indexOf(clip)));
    if (clip.hue === normalizedHue) return false;
    clip.hue = normalizedHue;
    if (commit) markDirty("오디오 색상 변경");
    else setDirtyWithoutHistory();
    renderChannelTabs();
    renderAudioLane();
    updateAudioSourceInspector();
    return true;
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
        hue: getDefaultHue(state.audioClips.length),
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

  function scheduleAudioClipsForPlayback() {
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

  function getAudioLaneMetrics() {
    const laneHeight = Math.max(1, elements.audioLaneViewport?.clientHeight || 58);
    const padding = 2;
    const gap = 2;
    const blockHeight = Math.max(12, Math.floor((laneHeight - padding * 2 - gap * 2) / 3));
    const usedHeight = blockHeight * 3 + gap * 2;
    const topPadding = Math.max(1, Math.floor((laneHeight - usedHeight) / 2));
    return { laneHeight, gap, blockHeight, topPadding };
  }

  function getAudioLaneRowFromClientY(clientY) {
    const rect = elements.audioLaneViewport?.getBoundingClientRect();
    if (!rect) return 0;
    const relativeY = clamp(Number(clientY) - rect.top, 0, Math.max(0, rect.height - 0.001));
    return clamp(Math.floor(relativeY / Math.max(1, rect.height) * 3), 0, 2);
  }

  function updateAudioClipVerticalOrder() {
    if (!elements.audioLaneContent || !elements.audioLaneViewport) return;
    const { laneHeight, gap, blockHeight, topPadding } = getAudioLaneMetrics();
    const ordered = getVisibleAudioClipsInDisplayOrder();
    elements.audioLaneContent.style.height = `${laneHeight}px`;
    ordered.forEach(({ clip, sourceIndex }, orderIndex) => {
      const element = Array.from(elements.audioLaneContent.children).find((item) => String(item.dataset?.audioClipId) === String(clip.id));
      if (!element) return;
      const lane = clamp(Math.round(Number(clip.lane) || 0), 0, 2);
      clip.lane = lane;
      element.style.top = `${topPadding + lane * (blockHeight + gap)}px`;
      element.style.height = `${blockHeight}px`;
      const active = String(clip.id) === String(state.activeAudioClipId || "");
      // getAudioClipsInDisplayOrder()는 시작 시간이 늦은 블록부터 반환합니다.
      // 따라서 앞쪽 항목에 더 높은 z-index를 줘 뒤에 배치된 오디오가 위에 보이게 합니다.
      element.style.zIndex = String(active ? 1000 : 100 + (ordered.length - orderIndex));
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
      block.title = i18nText("audio.block_tooltip", [clip.title, clip.startBeat.toFixed(3), getAudioClipEndBeat(clip).toFixed(3), clip.assetAvailable === false ? i18nText("audio.source_needs_reloading") : ""]);

      const leftHandle = document.createElement("button");
      leftHandle.type = "button";
      leftHandle.className = "audio-clip-handle audio-clip-left-handle";
      leftHandle.setAttribute("aria-label", i18nText("ui.adjust_start", [clip.title]));
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
      rightHandle.setAttribute("aria-label", i18nText("ui.adjust_end", [clip.title]));
      block.append(leftHandle, main, rightHandle);

      const begin = (event, mode) => {
        if (event.button !== 0) return;
        state.activePanel = "audio";
        state.activeAudioClipId = clip.id;
        clearNoteSelection();
        clearMidiSelection();
        drawRoll();
        updateChannelInfo();
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
          originalLane: clamp(Math.round(Number(clip.lane) || 0), 0, 2),
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
          clip.lane = getAudioLaneRowFromClientY(event.clientY);
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
        // 오디오의 위치/길이가 바뀌는 즉시 전체 타임라인의 끝 추정과 축척도 갱신합니다.
        // state.audioClips 배열 참조는 그대로이므로 캐시를 명시적으로 무효화해야 합니다.
        invalidateOverviewTimelineActivity();
        const timelineExtended = extendTimelineToBeat(getAudioClipEndBeat(clip) + CONFIG.minimumNoteBeat);
        if (!timelineExtended) drawOverviewTimeline();
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
        if (!interaction.moved && event.type !== "pointercancel") handleAudioEditActivation(clip.id, { select: false });
      };
      block.addEventListener("pointerup", finish);
      block.addEventListener("pointercancel", finish);
      elements.audioLaneContent.append(block);
    });
    updateAudioClipVerticalOrder();
    if (elements.audioLaneLabel) {
      const label = document.createElement("span");
      label.className = "audio-lane-icon";
      label.textContent = "🎵";
      label.setAttribute("aria-hidden", "true");
      if (state.audioClips.length) {
        const count = document.createElement("strong");
        count.textContent = String(state.audioClips.length);
        elements.audioLaneLabel.replaceChildren(label, count);
      } else {
        elements.audioLaneLabel.replaceChildren(label);
      }
    }
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

  function renderCollapsedChannelRail() {
    const list = elements.collapsedChannelList;
    if (!list) return;
    list.replaceChildren();
    state.channels.forEach((channel, index) => {
      const active = state.activePanel === "notes" && index === state.activeChannel;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sidebar-rail-channel${active ? " active" : ""}${isChannelEffectivelyMuted(channel) ? " is-muted" : ""}${channel.visible === false ? " is-hidden" : ""}${isChannelSolo(channel) ? " is-solo" : ""}`;
      button.style.setProperty("--channel-color", getChannelColor(channel, index));
      button.textContent = String(index + 1);
      button.title = channel.name;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("aria-label", `${index + 1}번 채널 ${channel.name}`);
      button.dataset.channelId = String(channel.id);
      button.dataset.channelIndex = String(index);
      // 펼친 채널 행과 완전히 같은 우클릭 메뉴를 사용합니다.
      button.dataset.contextArea = "channel-tab";
      button.addEventListener("pointerdown", (event) => beginChannelPointerDrag(event, channel.id, button, list));
      button.addEventListener("pointermove", moveChannelPointerDrag);
      button.addEventListener("pointerup", endChannelPointerDrag);
      button.addEventListener("pointercancel", () => { cancelChannelPointerDrag(); });
      button.addEventListener("click", (event) => {
        // Pointer clicks are handled by endChannelPointerDrag so a drag does not also activate a stale index.
        if (event.detail === 0) {
          const nextIndex = state.channels.findIndex((item) => String(item.id) === String(channel.id));
          if (nextIndex >= 0) selectChannel(nextIndex);
        }
      });
      list.append(button);
    });

    // 접힌 상태에서도 펼친 채널 목록과 동일하게 오디오 항목을 이어서 표시합니다.
    getAudioClipsInDisplayOrder().forEach(({ clip, sourceIndex: clipIndex }, audioIndex) => {
      const active = state.activePanel === "audio" && String(state.activeAudioClipId) === String(clip.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sidebar-rail-channel sidebar-rail-audio${active ? " active" : ""}${clip.muted ? " is-muted" : ""}${clip.visible === false ? " is-hidden" : ""}`;
      button.style.setProperty("--channel-color", getAudioClipColor(clip, clipIndex));
      button.textContent = `♫${audioIndex + 1}`;
      button.title = clip.title;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("aria-label", `오디오 ${audioIndex + 1} ${clip.title}`);
      button.dataset.audioClipId = String(clip.id);
      button.dataset.contextArea = "audio-source";
      button.addEventListener("click", () => handleAudioEditActivation(clip.id));
      list.append(button);
    });

    if (elements.collapsedMergeChannelsButton) {
      elements.collapsedMergeChannelsButton.disabled = state.channels.length < 2;
    }
    if (elements.collapsedDeleteChannelsButton) {
      elements.collapsedDeleteChannelsButton.disabled = state.channels.length <= 1;
    }
  }

  const channelActionSweep = {
    active: false,
    pointerId: null,
    kind: "",
    targetValue: null,
    visitedActionKeys: new Set(),
  };

  function resetChannelActionSweep({ releaseCapture = false } = {}) {
    if (releaseCapture && elements.channelTabs && channelActionSweep.pointerId !== null) {
      try {
        if (elements.channelTabs.hasPointerCapture?.(channelActionSweep.pointerId)) {
          elements.channelTabs.releasePointerCapture(channelActionSweep.pointerId);
        }
      } catch {}
    }
    channelActionSweep.active = false;
    channelActionSweep.pointerId = null;
    channelActionSweep.kind = "";
    channelActionSweep.targetValue = null;
    channelActionSweep.visitedActionKeys.clear();
  }

  function getChannelSweepActionAt(clientX, clientY) {
    const hit = document.elementFromPoint(clientX, clientY);
    const action = hit?.closest?.(".channel-tree-channel-item .channel-tree-action[data-channel-sweep-kind]");
    if (!action || !elements.channelTabs?.contains(action)) return null;
    return action;
  }

  function applyChannelSweepAction(action) {
    if (!action) return false;
    const kind = String(action.dataset.channelSweepKind || "");
    const channelId = String(action.dataset.channelSweepId || "");
    if (!kind || !channelId) return false;
    if (channelActionSweep.active && kind !== channelActionSweep.kind) return false;

    const actionKey = `${kind}:${channelId}`;
    // 한 번의 누름/터치 제스처 동안 같은 채널 버튼은 딱 한 번만 변경합니다.
    // 렌더링 과정에서 현재 버튼 DOM이 교체되어도 방문 기록은 제스처가 끝날 때까지 유지됩니다.
    if (channelActionSweep.visitedActionKeys.has(actionKey)) return false;
    channelActionSweep.visitedActionKeys.add(actionKey);

    const channel = getChannelById(channelId);
    if (!channel) return false;
    if (kind === "visibility") {
      const targetVisible = channelActionSweep.targetValue === null
        ? channel.visible === false
        : Boolean(channelActionSweep.targetValue);
      if (channelActionSweep.targetValue === null) channelActionSweep.targetValue = targetVisible;
      return setChannelVisibleById(channel.id, targetVisible, { notify: false });
    }
    if (kind === "mute") {
      const targetMuted = channelActionSweep.targetValue === null
        ? !channel.muted
        : Boolean(channelActionSweep.targetValue);
      if (channelActionSweep.targetValue === null) channelActionSweep.targetValue = targetMuted;
      return setChannelMutedById(channel.id, targetMuted, { notify: false });
    }
    return false;
  }

  function beginChannelActionSweep(event, action) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const kind = String(action?.dataset.channelSweepKind || "");
    if (!kind || !elements.channelTabs) return;

    event.preventDefault();
    event.stopPropagation();
    resetChannelActionSweep();
    channelActionSweep.active = true;
    channelActionSweep.pointerId = event.pointerId;
    channelActionSweep.kind = kind;
    try { elements.channelTabs.setPointerCapture?.(event.pointerId); } catch {}
    applyChannelSweepAction(action);
  }

  function moveChannelActionSweep(event) {
    if (!channelActionSweep.active || event.pointerId !== channelActionSweep.pointerId) return;
    event.preventDefault();
    const action = getChannelSweepActionAt(event.clientX, event.clientY);
    if (!action || String(action.dataset.channelSweepKind || "") !== channelActionSweep.kind) {
      return;
    }
    applyChannelSweepAction(action);
  }

  function endChannelActionSweep(event) {
    if (!channelActionSweep.active || event.pointerId !== channelActionSweep.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resetChannelActionSweep({ releaseCapture: true });
  }

  function renderChannelTabs() {
    if (!elements.channelTabs) return;
    elements.channelTabs.replaceChildren();

    const createAction = ({ kind, active, label, title, onClick, onContextMenu = null, sweep = false, sweepId = "", solo = false, textContent = null }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `channel-tree-action channel-tree-${kind}${solo ? " is-solo" : ""}`;
      button.setAttribute("aria-pressed", String(Boolean(solo || active)));
      button.setAttribute("aria-label", label);
      button.title = title;
      const glyph = document.createElement("span");
      glyph.className = "channel-tree-action-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = textContent != null
        ? String(textContent)
        : (kind === "visibility"
          ? "👁"
          : (solo ? "S" : (active ? "🔇" : "🔊")));
      button.append(glyph);
      if (typeof onContextMenu === "function") {
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(event);
        });
      }
      if (sweep) {
        button.dataset.channelSweepKind = kind;
        button.dataset.channelSweepId = String(sweepId);
        button.addEventListener("pointerdown", (event) => beginChannelActionSweep(event, button));
        button.addEventListener("click", (event) => {
          // 포인터 클릭은 pointerdown에서 이미 처리합니다. 키보드 활성화(click detail=0)는 기존 동작을 유지합니다.
          event.preventDefault();
          event.stopPropagation();
          if (event.detail === 0) onClick?.();
        });
      } else {
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onClick?.();
        });
      }
      return button;
    };

    // 모든 음악 채널은 하나의 평면 편집 채널 목록으로 표시합니다.
    // 지원 음악 파일은 불러오는 순간 공통 플러그인에서 MIDI로 정규화한 뒤 일반 편집 채널로 변환하므로 별도 원본 트리를 만들지 않습니다.
    state.channels.forEach((channel, index) => {
      const active = state.activePanel === "notes" && index === state.activeChannel;
      const item = document.createElement("div");
      const channelSolo = isChannelSolo(channel);
      item.className = `channel-tab-item channel-tree-item channel-tree-channel-item${active ? " active" : ""}${isChannelEffectivelyMuted(channel) ? " is-muted" : ""}${channel.visible === false ? " is-hidden" : ""}${channelSolo ? " is-solo" : ""}`;
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
          kind: "mml",
          active: false,
          label: i18nText("channel.mml_button_aria", [channel.name]),
          title: i18nText("channel.mml_button_title"),
          textContent: "M",
          onClick: () => openChannelMmlDialog(channel.id),
        }),
        createAction({
          kind: "visibility",
          active: channel.visible !== false,
          label: i18nText(channel.visible === false ? "ui.show_2" : "ui.hide_3", [channel.name]),
          title: i18nText(channel.visible === false ? "ui.show_piano_roll" : "ui.hide_piano_roll"),
          onClick: () => setChannelVisibleById(channel.id, channel.visible === false),
          sweep: true,
          sweepId: channel.id,
        }),
        createAction({
          kind: "mute",
          active: channel.muted,
          solo: channelSolo,
          label: channelSolo
            ? i18nText("channel.solo_off_named", [channel.name])
            : i18nText(channel.muted ? "ui.unmute_2" : "ui.mute_2", [channel.name]),
          title: channelSolo
            ? i18nText("channel.solo_off")
            : i18nText("channel.mute_context_solo", [i18nText(channel.muted ? "ui.unmute" : "ui.mute")]),
          onClick: () => channelSolo
            ? setChannelSoloById(channel.id, false)
            : setChannelMutedById(channel.id, !channel.muted),
          onContextMenu: () => setChannelSoloById(channel.id, !channelSolo),
          sweep: !channelSolo,
          sweepId: channel.id,
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
      main.addEventListener("click", () => handleAudioEditActivation(clip.id));

      const actions = document.createElement("div");
      actions.className = "channel-tree-actions";
      actions.append(
        createAction({
          kind: "visibility",
          active: clip.visible !== false,
          label: i18nText(clip.visible === false ? "ui.show_2" : "ui.hide_3", [clip.title]),
          title: i18nText(clip.visible === false ? "audio.show_block" : "audio.hide_block"),
          onClick: () => setAudioClipVisible(clip.id, clip.visible === false),
        }),
        createAction({
          kind: "mute",
          active: clip.muted,
          label: i18nText(clip.muted ? "ui.unmute_2" : "ui.mute_2", [clip.title]),
          title: i18nText(clip.muted ? "audio.unmute" : "audio.mute"),
          onClick: () => setAudioClipMuted(clip.id, !clip.muted),
        }),
      );
      item.append(main, actions);
      elements.channelTabs.append(item);
    });

    elements.addChannelButton.disabled = false;
    if (elements.mergeChannelsButton) elements.mergeChannelsButton.disabled = state.channels.length < 2;
    if (elements.deleteChannelsButton) elements.deleteChannelsButton.disabled = state.channels.length <= 1;
    elements.deleteChannelButton.disabled = state.activePanel !== "notes" || state.channels.length <= 1;
    elements.clearChannelButton.disabled = state.activePanel !== "notes";
    elements.copyChannelButton.disabled = state.activePanel !== "notes";
    elements.pasteChannelButton.disabled = state.activePanel !== "notes";
    renderCollapsedChannelRail();
    updateEditMenuState();
  }

  function openChannelEditDialog(channelId) {
    const index = state.channels.findIndex((channel) => String(channel.id) === String(channelId));
    if (index < 0 || !elements.channelEditBackdrop) return false;
    selectChannel(index);
    const channel = state.channels[index];
    state.channelEdit.channelId = String(channel.id);
    populateChannelInstrumentSelect();
    if (elements.channelEditNameInput) elements.channelEditNameInput.value = channel.name;
    setHueControlValue(elements.channelEditColorInput, getChannelHue(channel, index));
    if (elements.channelEditTargetLabel) elements.channelEditTargetLabel.textContent = `${index + 1}번 채널`;
    if (elements.channelEditInstrumentSelect) {
      elements.channelEditInstrumentSelect.value = editorPresetKey(getChannelInstrumentBank(channel), getChannelInstrumentProgram(channel));
    }
    elements.channelEditBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.channelEditNameInput?.focus();
      elements.channelEditNameInput?.select();
    });
    return true;
  }

  function closeChannelEditDialog() {
    if (elements.channelEditBackdrop) elements.channelEditBackdrop.hidden = true;
    state.channelEdit.channelId = null;
  }


  function normalizeMmlCommandCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, (character) => {
      const lower = character.toLowerCase();
      if ("tolv".includes(lower)) return lower.toUpperCase();
      if ("rnabcdefg".includes(lower)) return lower;
      return character;
    });
  }

  function normalizeMmlTextCase(text) {
    const source = String(text || "");
    const wrapper = source.match(/^(\s*)MML\s*@([\s\S]*?)(;?)(\s*)$/i);
    if (wrapper) {
      const parts = wrapper[2].split(",").map((part) => normalizeMmlCommandCase(part));
      return `${wrapper[1]}MML@${parts.join(",")};${wrapper[4]}`;
    }
    return normalizeMmlCommandCase(source);
  }

  function normalizeMmlImportTextareaCase() {
    const textarea = elements.mmlImportText;
    if (!textarea) return false;
    const source = String(textarea.value || "");
    const fileName = String(state.mmlImport.sourceFileName || "");
    const extension = (fileName.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
    const isThreeMle = !/^\s*MML\s*@/i.test(source) && /^\s*\[Channel\s*\d+\]\s*$/im.test(source);
    const isMabiIccoText = /^\s*\[mml-score\]\s*$/im.test(source) || /(?:^|\r?\n)\s*mml-track\s*=/i.test(source);
    if (extension === "mmi" || isThreeMle || isMabiIccoText) return false;
    const normalized = normalizeMmlTextCase(source);
    if (normalized === source) return false;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = normalized;
    try { textarea.setSelectionRange(start, end); } catch {}
    return true;
  }

  function normalizeChannelMmlTextareaCase() {
    const textarea = elements.channelMmlText;
    if (!textarea) return;
    const before = String(textarea.value || "");
    const after = normalizeMmlCommandCase(before);
    if (before === after) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = after;
    try { textarea.setSelectionRange(start, end); } catch {}
  }

  function channelToEditableMml(channel, { includeTempo = false, sourceNotes = null } = {}) {
    const inputNotes = Array.isArray(sourceNotes) ? sourceNotes : (channel?.notes || []);
    if (!inputNotes.length) {
      if (!includeTempo) return "";
      const tempos = getSortedTempos();
      return normalizeMmlCommandCase(`t${getTempoAtBeatFromCollection(0, tempos)}`);
    }
    const normalized = inputNotes.map((note) => ({
      ...note,
      startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
      durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
    }));
    const voices = partitionNotesIntoMmlVoices(normalized);
    const endBeat = normalized.reduce((maximum, note) => Math.max(maximum, note.startBeat + note.durationBeat), 0);
    const tempos = getSortedTempos();
    const rendered = voices
      .map((voice, voiceIndex) => (includeTempo && voiceIndex === 0
        ? buildTempoIntegratedNoteVoiceMml(voice, tempos, 0, endBeat, { applyTimelineFade: false })
        : buildNoteVoiceMml(voice, 0, { applyTimelineFade: false })))
      .filter(Boolean);
    return normalizeMmlCommandCase(rendered.join(","));
  }

  function setChannelMmlStatus(message, { error = false } = {}) {
    if (!elements.channelMmlStatus) return;
    elements.channelMmlStatus.textContent = String(message || "");
    elements.channelMmlStatus.classList.toggle("error", Boolean(error));
  }

  function updateChannelMmlPreview() {
    if (!elements.channelMmlText) return null;
    normalizeChannelMmlTextareaCase();
    const source = String(elements.channelMmlText.value || "");
    const includeTempo = Boolean(elements.channelMmlIncludeTempo?.checked);
    try {
      const parsed = parseMmlText(source, { quantize: 64 });
      state.channelMmlEdit.parsed = parsed;
      if (parsed.noteParts.length > 1) {
        setChannelMmlStatus(i18nText("channel.mml_status_multi"), { error: true });
        if (elements.channelMmlApplyButton) elements.channelMmlApplyButton.disabled = true;
        return parsed;
      }
      const details = [
        i18nText("channel.mml_status_notes", [parsed.noteCount]),
        i18nText("channel.mml_status_chars", [source.length]),
      ];
      if (parsed.explicitTempoCount) {
        details.push(includeTempo
          ? i18nText("channel.mml_status_tempo_included", [parsed.explicitTempoCount])
          : i18nText("channel.mml_status_tempo_ignored"));
      }
      if (parsed.skippedPitchCount) details.push(i18nText("channel.mml_status_pitch_skipped", [parsed.skippedPitchCount]));
      if (parsed.unsupportedTokenCount) details.push(i18nText("channel.mml_status_unsupported", [parsed.unsupportedTokenCount]));
      setChannelMmlStatus(details.join(" · "));
      if (elements.channelMmlApplyButton) elements.channelMmlApplyButton.disabled = false;
      return parsed;
    } catch (error) {
      state.channelMmlEdit.parsed = null;
      setChannelMmlStatus(error instanceof Error ? error.message : i18nText("channel.mml_status_invalid"), { error: true });
      if (elements.channelMmlApplyButton) elements.channelMmlApplyButton.disabled = true;
      return null;
    }
  }

  function scheduleChannelMmlPreview() {
    window.clearTimeout(state.channelMmlEdit.parseTimer);
    state.channelMmlEdit.parseTimer = window.setTimeout(updateChannelMmlPreview, 80);
  }

  function refreshChannelMmlTempoOption() {
    const channelId = state.channelMmlEdit.channelId;
    const channel = state.channels.find((entry) => String(entry.id) === String(channelId));
    if (!channel || !elements.channelMmlText) return false;
    const includeTempo = Boolean(elements.channelMmlIncludeTempo?.checked);
    state.channelMmlEdit.includeTempo = includeTempo;
    let sourceNotes = null;
    try {
      const parsed = parseMmlText(String(elements.channelMmlText.value || ""), { quantize: 64 });
      if (parsed.noteParts.length <= 1) sourceNotes = parsed.noteParts[0]?.notes || [];
    } catch {}
    elements.channelMmlText.value = channelToEditableMml(channel, { includeTempo, sourceNotes });
    updateChannelMmlPreview();
    return true;
  }

  function openChannelMmlDialog(channelId) {
    const index = state.channels.findIndex((channel) => String(channel.id) === String(channelId));
    if (index < 0 || !elements.channelMmlBackdrop || !elements.channelMmlText) return false;
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    selectChannel(index);
    const channel = state.channels[index];
    state.channelMmlEdit.channelId = String(channel.id);
    state.channelMmlEdit.parsed = null;
    window.clearTimeout(state.channelMmlEdit.parseTimer);
    state.channelMmlEdit.parseTimer = 0;
    if (elements.channelMmlTargetLabel) elements.channelMmlTargetLabel.textContent = channel.name;
    if (elements.channelMmlIncludeTempo) elements.channelMmlIncludeTempo.checked = state.channelMmlEdit.includeTempo !== false;
    elements.channelMmlText.value = channelToEditableMml(channel, {
      includeTempo: Boolean(elements.channelMmlIncludeTempo?.checked),
    });
    elements.channelMmlBackdrop.hidden = false;
    closeContextMenu();
    closeFileMenu();
    closeEditMenu();
    updateChannelMmlPreview();
    requestAnimationFrame(() => {
      elements.channelMmlText?.focus();
      elements.channelMmlText?.setSelectionRange?.(0, 0);
    });
    return true;
  }

  function closeChannelMmlDialog() {
    window.clearTimeout(state.channelMmlEdit.parseTimer);
    state.channelMmlEdit.parseTimer = 0;
    state.channelMmlEdit.channelId = null;
    state.channelMmlEdit.parsed = null;
    if (elements.channelMmlBackdrop) elements.channelMmlBackdrop.hidden = true;
  }

  function applyChannelMmlDialog() {
    const channelId = state.channelMmlEdit.channelId;
    const channel = state.channels.find((entry) => String(entry.id) === String(channelId));
    if (!channel) {
      closeChannelMmlDialog();
      return false;
    }
    const parsed = updateChannelMmlPreview();
    if (!parsed || parsed.noteParts.length > 1) return false;
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    const includeTempo = Boolean(elements.channelMmlIncludeTempo?.checked);
    const notes = parsed.noteParts[0]?.notes || [];
    channel.notes = notes.map((note) => ({ ...note, id: state.nextNoteId++ }));
    if (includeTempo && parsed.explicitTempoCount) {
      state.tempos = parsed.tempos.map((tempo, index) => ({
        id: index + 1,
        beat: Number(tempo.beat.toFixed(6)),
        bpm: clamp(Math.round(tempo.bpm), CONFIG.minTempo, CONFIG.maxTempo),
        fixed: index === 0,
      }));
      state.nextTempoId = state.tempos.length + 1;
    }
    clearNoteSelection();
    clearMidiSelection();
    state.channelNoteRuntime.clear();
    markDirty(i18nText("channel.mml_history"));
    shrinkTimelineToContent();
    ensureTimelineFitsViewport();
    renderAll();
    closeChannelMmlDialog();
    showToast(i18nText("channel.mml_applied", [channel.name, notes.length]));
    return true;
  }

  function applyChannelEditDialog() {
    const channelId = state.channelEdit.channelId;
    const index = state.channels.findIndex((channel) => String(channel.id) === String(channelId));
    if (index < 0) {
      closeChannelEditDialog();
      return false;
    }
    const channel = state.channels[index];
    const requestedName = String(elements.channelEditNameInput?.value || "").trim();
    if (!requestedName) {
      showToast("채널 이름은 비워둘 수 없습니다.");
      elements.channelEditNameInput?.focus();
      return false;
    }
    const nextName = makeUniqueChannelName(requestedName, channel.id);
    const nextHue = getHueControlValue(elements.channelEditColorInput, getChannelHue(channel, index));
    const selectedValue = String(elements.channelEditInstrumentSelect?.value || "0:0");
    const selectedKey = parseEditorPresetKey(selectedValue);
    const selectedPreset = findEditorSoundBankPreset(selectedKey.bank, selectedKey.program) || getEditorSoundBankPresets()[0] || null;
    const nextInstrument = String(selectedPreset?.name || channel.instrument || "Piano");
    const nextProgram = selectedPreset ? clamp(Math.round(Number(selectedPreset.preset) || 0), 0, 127) : getChannelInstrumentProgram(channel);
    const nextBank = selectedPreset ? clamp(Math.round(Number(selectedPreset.bank) || 0), 0, 16383) : getChannelInstrumentBank(channel);
    const changed = channel.name !== nextName
      || channel.hue !== nextHue
      || channel.instrument !== nextInstrument
      || getChannelInstrumentProgram(channel) !== nextProgram
      || getChannelInstrumentBank(channel) !== nextBank;
    if (!changed) {
      closeChannelEditDialog();
      return true;
    }
    channel.name = nextName;
    channel.hue = nextHue;
    if (selectedPreset) setChannelInstrumentPreset(channel, selectedPreset);
    else {
      channel.instrument = nextInstrument;
      channel.instrumentProgram = nextProgram;
      channel.instrumentBank = nextBank;
      channel.instrumentExactPreset = true;
    }
    if (typeof audioEngine.prepareProgram === "function") {
      void audioEngine.prepareProgram(nextProgram, nextBank, { exactPreset: true }).catch((error) => console.warn("악기 음원 준비 실패", error));
    }
    markDirty("채널 정보 변경");
    renderChannelTabs();
    renderChannelEditor();
    renderChannelMuteMixer();
    drawRoll();
    closeChannelEditDialog();
    if (nextName !== requestedName) showToast(`중복되지 않도록 이름을 ${nextName}(으)로 변경했습니다.`);
    else showToast(`${nextName} 채널 정보를 변경했습니다.`);
    return true;
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
    const activeHue = getChannelHue(channel, state.activeChannel);
    updateChannelColorControl(activeHue);
    if (elements.channelInstrumentSelect) {
      populateChannelInstrumentSelect();
      elements.channelInstrumentSelect.value = editorPresetKey(getChannelInstrumentBank(channel), getChannelInstrumentProgram(channel));
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
    elements.midiInfoFormat.textContent = hasSource ? `${reference.sourceLabel || i18nText("ui.source_short")} · ${reference.format ? `SMF ${reference.format}` : i18nText("ui.readonly")}` : i18nText("common.none");
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
      activeGroup ? getMidiGroupHue(activeGroup, activeGroupIndex) : 0,
      Boolean(activeGroup),
    );
    const tempoCount = reference.tempoEvents?.length || 0;
    setMidiReferenceStatus(
      document
        ? (hasSource ? i18nText("midi.status_summary", [reference.groups.length, totalNotes, tempoCount]) : i18nText("channel.there_no_source"))
        : i18nText("ui.no_source"),
      document ? "ready" : "",
    );
    renderMidiInstrumentList();
    updateEditMenuState();
  }

  function handleAudioEditActivation(clipId, { select = true } = {}) {
    const safeId = String(clipId || "");
    if (!safeId) return false;
    const now = performance.now();
    const doubleClick = state.audioEdit.lastClickClipId === safeId
      && now - state.audioEdit.lastClickAt <= 360;
    state.audioEdit.lastClickClipId = doubleClick ? null : safeId;
    state.audioEdit.lastClickAt = doubleClick ? 0 : now;
    if (doubleClick) return openAudioEditDialog(safeId);
    if (select) return selectAudioClip(safeId);
    return false;
  }

  function openAudioEditDialog(clipId = state.activeAudioClipId) {
    const clip = state.audioClips.find((item) => String(item.id) === String(clipId));
    if (!clip || !elements.audioEditBackdrop) return false;
    selectAudioClip(clip.id);
    state.audioEdit.clipId = String(clip.id);
    const index = state.audioClips.indexOf(clip);
    if (elements.audioEditNameInput) elements.audioEditNameInput.value = clip.title;
    setHueControlValue(elements.audioEditColorInput, getAudioClipHue(clip, index));
    if (elements.audioEditOffsetInput) {
      elements.audioEditOffsetInput.max = String(Math.max(0, Number(clip.sourceDurationSeconds) || 0));
      elements.audioEditOffsetInput.value = String(Math.round((Number(clip.sourceOffsetSeconds) || 0) * 100) / 100);
    }
    if (elements.audioEditRateInput) elements.audioEditRateInput.value = String(Math.round(clamp(Number(clip.playbackRate) || 1, 0.25, 4) * 100) / 100);
    if (elements.audioEditVolumeInput) elements.audioEditVolumeInput.value = String(Math.round(clamp(Number(clip.volume) || 0, 0, 1) * 100));
    if (elements.audioEditTargetLabel) elements.audioEditTargetLabel.textContent = clip.fileName || clip.title;
    elements.audioEditBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.audioEditNameInput?.focus();
      elements.audioEditNameInput?.select();
    });
    return true;
  }

  function closeAudioEditDialog() {
    if (elements.audioEditBackdrop) elements.audioEditBackdrop.hidden = true;
    state.audioEdit.clipId = null;
  }

  function applyAudioEditDialog() {
    const clip = state.audioClips.find((item) => String(item.id) === String(state.audioEdit.clipId));
    if (!clip) {
      closeAudioEditDialog();
      return false;
    }
    const requestedName = String(elements.audioEditNameInput?.value || "").trim();
    if (!requestedName) {
      showToast("오디오 이름은 비워둘 수 없습니다.");
      elements.audioEditNameInput?.focus();
      return false;
    }
    const index = state.audioClips.indexOf(clip);
    const nextHue = getHueControlValue(elements.audioEditColorInput, getAudioClipHue(clip, index));
    const maxOffset = Math.max(0, Number(clip.sourceDurationSeconds) || 0);
    const nextOffset = clamp(Number(elements.audioEditOffsetInput?.value) || 0, 0, maxOffset);
    const nextRate = clamp(Number(elements.audioEditRateInput?.value) || 1, 0.25, 4);
    const nextVolume = clamp((Number(elements.audioEditVolumeInput?.value) || 0) / 100, 0, 1);
    const nextName = requestedName.slice(0, 80);
    const changed = clip.title !== nextName
      || clip.hue !== nextHue
      || Math.abs((Number(clip.sourceOffsetSeconds) || 0) - nextOffset) > 1e-7
      || Math.abs((Number(clip.playbackRate) || 1) - nextRate) > 1e-7
      || Math.abs((Number(clip.volume) || 0) - nextVolume) > 1e-7;
    if (!changed) {
      closeAudioEditDialog();
      return true;
    }
    const wasPlaying = state.playback.running || state.playback.loading;
    const resumeBeat = state.playhead.beat;
    clip.title = nextName;
    clip.hue = nextHue;
    clip.sourceOffsetSeconds = nextOffset;
    clip.playbackRate = nextRate;
    clip.volume = nextVolume;
    if (wasPlaying) {
      stopPlayback(false);
      state.playhead.beat = resumeBeat;
      window.setTimeout(() => startPlayback(), 0);
    }
    markDirty("오디오 정보 변경");
    renderChannelTabs();
    renderChannelEditor();
    renderAudioLane();
    updateAudioSourceInspector();
    closeAudioEditDialog();
    showToast(`${clip.title} 오디오 정보를 변경했습니다.`);
    return true;
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

  function getMidiNoteRawStartBeat(note) {
    const raw = Number(note?.rawStartBeat);
    if (Number.isFinite(raw)) return Math.max(0, raw);
    return Math.max(0, Number(note?.startBeat) || 0);
  }

  function getMidiNoteRawEndBeat(note) {
    const start = getMidiNoteRawStartBeat(note);
    const raw = Number(note?.rawEndBeat);
    if (Number.isFinite(raw)) return Math.max(start + 1e-9, raw);
    const duration = Math.max(1e-9, Number(note?.durationBeat) || CONFIG.minimumNoteBeat);
    return start + duration;
  }

  function mergeMidiInstrumentNotes(rawNotes) {
    const duplicateMap = new Map();
    for (const note of rawNotes) {
      const rawStartBeat = getMidiNoteRawStartBeat(note);
      const rawEndBeat = getMidiNoteRawEndBeat(note);
      // Only collapse true MIDI duplicates. Notes that merely land in the same quantized
      // cell stay separate so raw-timing voice assignment can distinguish them later.
      const key = `${note.pitch}:${rawStartBeat.toFixed(9)}:${rawEndBeat.toFixed(9)}`;
      let merged = duplicateMap.get(key);
      if (!merged) {
        merged = {
          pitch: note.pitch,
          startBeat: note.startBeat,
          durationBeat: note.durationBeat,
          rawStartBeat,
          rawEndBeat,
          velocities: [],
          sourceTrackIndices: new Set(),
          sourcePorts: new Set(),
          sourceChannels: new Set(),
          primaryTrackIndex: Math.max(0, Math.round(Number(note.sourceTrackIndex ?? note.trackIndex) || 0)),
          primaryPort: clamp(Math.round(Number(note.sourcePort ?? note.port) || 0), 0, 127),
          primaryChannel: clamp(Math.round(Number(note.sourceChannel ?? note.channel) || 0), 0, 15),
          program: clamp(Math.round(Number(note.program) || 0), 0, 127),
          bankMsb: clamp(Math.round(Number(note.bankMsb) || 0), 0, 127),
          bankLsb: clamp(Math.round(Number(note.bankLsb) || 0), 0, 127),
          bank: clamp(Math.round(Number(note.bank) || 0), 0, 16383),
        };
        duplicateMap.set(key, merged);
      }
      merged.velocities.push(note.velocity);
      const trackIndex = Math.max(0, Math.round(Number(note.sourceTrackIndex ?? note.trackIndex) || 0));
      const port = clamp(Math.round(Number(note.sourcePort ?? note.port) || 0), 0, 127);
      const channel = clamp(Math.round(Number(note.sourceChannel ?? note.channel) || 0), 0, 15);
      merged.sourceTrackIndices.add(trackIndex);
      merged.sourcePorts.add(port);
      merged.sourceChannels.add(channel);
      if (trackIndex < merged.primaryTrackIndex) {
        merged.primaryTrackIndex = trackIndex;
        merged.primaryPort = port;
        merged.primaryChannel = channel;
      }
    }
    const merged = Array.from(duplicateMap.values())
      .map((note, index) => ({
        id: index + 1,
        pitch: note.pitch,
        startBeat: Number(Number(note.startBeat).toFixed(6)),
        durationBeat: Number(Number(note.durationBeat).toFixed(6)),
        rawStartBeat: Number(note.rawStartBeat.toFixed(9)),
        rawEndBeat: Number(note.rawEndBeat.toFixed(9)),
        sourceTrackIndex: note.primaryTrackIndex,
        sourceTrackIndices: [...note.sourceTrackIndices].sort((a, b) => a - b),
        sourcePort: note.primaryPort,
        sourcePorts: [...note.sourcePorts].sort((a, b) => a - b),
        sourceChannel: note.primaryChannel,
        sourceChannels: [...note.sourceChannels].sort((a, b) => a - b),
        program: note.program,
        bankMsb: note.bankMsb,
        bankLsb: note.bankLsb,
        bank: note.bank,
        velocity: evaluateMergedMidiVelocity(note.velocities),
      }))
      .sort((left, right) => getMidiNoteRawStartBeat(left) - getMidiNoteRawStartBeat(right)
        || left.pitch - right.pitch
        || getMidiNoteRawEndBeat(left) - getMidiNoteRawEndBeat(right))
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
      const bank = drums ? 128 : getMidiGroupBank(group);
      const bankMsb = drums ? 0 : clamp(Math.round(Number(group.bankMsb) || Math.floor(bank / 128)), 0, 127);
      const bankLsb = drums ? 0 : clamp(Math.round(Number(group.bankLsb) || (bank % 128)), 0, 127);
      const key = drums ? "drums" : `bank-${bank}-program-${program}`;
      let merged = instrumentMap.get(key);
      if (!merged) {
        merged = {
          id: `midi-instrument-${drums ? "drums" : `${bank}-${program}`}`,
          name: drums ? "Drums" : (GM_PROGRAM_NAMES[program] || `Program ${program + 1}`),
          programName: drums ? "Drums" : (GM_PROGRAM_NAMES[program] || `Program ${program + 1}`),
          program,
          bank,
          bankMsb,
          bankLsb,
          channel: channels[0] ?? 0,
          channels: new Set(),
          port: clamp(Math.round(Number(group.port) || 0), 0, 127),
          ports: new Set(),
          trackIndex: Math.max(0, Number(group.trackIndex) || 0),
          sourceTrackIndices: new Set(),
          sourceTracks: new Set(),
          visible: group.visible !== false,
          muted: Boolean(group.muted),
          hue: getMidiGroupHue(group, groupIndex),
          rawNotes: [],
        };
        instrumentMap.set(key, merged);
      } else {
        merged.visible = merged.visible || group.visible !== false;
        merged.muted = merged.muted && Boolean(group.muted);
        merged.trackIndex = Math.min(merged.trackIndex, Math.max(0, Number(group.trackIndex) || 0));
      }
      channels.forEach((channel) => merged.channels.add(channel));
      const ports = Array.isArray(group.ports) && group.ports.length ? group.ports : [group.port ?? 0];
      ports.forEach((port) => merged.ports.add(clamp(Math.round(Number(port) || 0), 0, 127)));
      const tracks = Array.isArray(group.sourceTracks) ? group.sourceTracks : [group.trackName].filter(Boolean);
      tracks.forEach((track) => merged.sourceTracks.add(String(track)));
      const trackIndices = Array.isArray(group.sourceTrackIndices) && group.sourceTrackIndices.length
        ? group.sourceTrackIndices
        : [group.trackIndex ?? 0];
      trackIndices.forEach((trackIndex) => merged.sourceTrackIndices.add(Math.max(0, Math.round(Number(trackIndex) || 0))));
      for (const note of group.notes || []) {
        const rawStartBeat = getMidiNoteRawStartBeat(note);
        const rawEndBeat = getMidiNoteRawEndBeat(note);
        const startBeat = Math.max(0, snapBeatToUnit(rawStartBeat, quantizeUnit));
        const endBeat = Math.max(startBeat + quantizeUnit, snapBeatToUnit(rawEndBeat, quantizeUnit));
        const sourceTrackIndex = Math.max(0, Math.round(Number(note.sourceTrackIndex ?? group.trackIndex) || 0));
        const sourcePort = clamp(Math.round(Number(note.sourcePort ?? group.port) || 0), 0, 127);
        const sourceChannel = clamp(Math.round(Number(note.sourceChannel ?? group.channel) || 0), 0, 15);
        merged.rawNotes.push({
          pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
          startBeat: Number(startBeat.toFixed(6)),
          durationBeat: Number((endBeat - startBeat).toFixed(6)),
          rawStartBeat,
          rawEndBeat,
          velocity: clamp(Math.round(Number(note.velocity) || 100), 1, 127),
          sourceTrackIndex,
          sourceTrackIndices: Array.isArray(note.sourceTrackIndices) ? note.sourceTrackIndices : [sourceTrackIndex],
          sourcePort,
          sourcePorts: Array.isArray(note.sourcePorts) ? note.sourcePorts : [sourcePort],
          sourceChannel,
          sourceChannels: Array.isArray(note.sourceChannels) ? note.sourceChannels : [sourceChannel],
          program,
          bankMsb,
          bankLsb,
          bank: drums ? 128 : bank,
        });
      }
    }
    const groups = [...instrumentMap.values()].map((group, index) => {
      const channels = [...group.channels].sort((a, b) => a - b);
      const ports = [...group.ports].sort((a, b) => a - b);
      const sourceTracks = [...group.sourceTracks];
      const sourceTrackIndices = [...group.sourceTrackIndices].sort((a, b) => a - b);
      return {
        id: `${group.id}-${index + 1}`,
        name: group.name,
        trackName: sourceTracks.join(", "),
        sourceTracks,
        sourceTrackIndices,
        trackIndex: group.trackIndex,
        port: ports[0] ?? group.port ?? 0,
        ports,
        channel: channels[0] ?? 0,
        channels,
        bank: group.bank,
        bankMsb: group.bankMsb,
        bankLsb: group.bankLsb,
        program: group.program,
        programName: group.programName,
        visible: group.visible,
        muted: group.muted,
        hue: getMidiGroupHue(group, index),
        notes: mergeMidiInstrumentNotes(group.rawNotes),
      };
    }).filter((group) => group.notes.length)
      .sort(compareMidiGroupsWithDrumsLast);
    groups.forEach((group, index) => {
      group.hue = getDefaultHue(index);
      group.id = `midi-instrument-${isMidiGroupDrums(group) ? "drums" : `${getMidiGroupBank(group)}-${group.program}`}-${index + 1}`;
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
      const port = clamp(Math.round(Number(note.port) || 0), 0, 127);
      const channel = clamp(Math.round(Number(note.channel) || 0), 0, 15);
      const isDrums = channel === 9;
      const program = isDrums ? 0 : clamp(Math.round(Number(note.program) || 0), 0, 127);
      const bankMsb = clamp(Math.round(Number(note.bankMsb) || 0), 0, 127);
      const bankLsb = clamp(Math.round(Number(note.bankLsb) || 0), 0, 127);
      const bank = isDrums ? 128 : clamp(
        Math.round(Number.isFinite(Number(note.bank)) ? Number(note.bank) : bankMsb * 128 + bankLsb),
        0,
        16383,
      );
      return {
        trackIndex,
        trackName,
        instrumentName: String(note.instrumentMetaName || ""),
        port,
        channel,
        program,
        bank,
        bankMsb,
        bankLsb,
        pitch: clamp(Math.round(Number(note.midi ?? note.pitch) || 60), 0, 127),
        rawStartBeat: Number(rawStartBeat.toFixed(9)),
        rawEndBeat: Number(rawEndBeat.toFixed(9)),
        startBeat: Number(startBeat.toFixed(6)),
        durationBeat: Number((endBeat - startBeat).toFixed(6)),
        velocity: clamp(Math.round(Number(note.effectiveVelocity ?? note.velocity) || 64), 1, 127),
        sourceTrackIndex: trackIndex,
        sourceTrackIndices: [trackIndex],
        sourcePort: port,
        sourcePorts: [port],
        sourceChannel: channel,
        sourceChannels: [channel],
      };
    });

    if (!rawNotes.length) {
      throw new Error("MIDI 파일에서 노트 이벤트를 찾지 못했습니다.");
    }

    const instruments = new Map();
    for (const note of rawNotes) {
      const isDrums = note.channel === 9;
      const key = isDrums ? "drums" : `bank-${note.bank}-program-${note.program}`;
      let instrument = instruments.get(key);
      if (!instrument) {
        const programName = isDrums ? "Drums" : (GM_PROGRAM_NAMES[note.program] || `Program ${note.program + 1}`);
        instrument = {
          key,
          id: `midi-instrument-${isDrums ? "drums" : `${note.bank}-${note.program}`}`,
          name: programName,
          trackName: "",
          trackIndex: note.trackIndex,
          sourceTrackIndices: new Set(),
          port: note.port,
          ports: new Set(),
          channel: note.channel,
          channels: new Set(),
          bank: isDrums ? 128 : note.bank,
          bankMsb: note.bankMsb,
          bankLsb: note.bankLsb,
          sourceTracks: new Set(),
          program: isDrums ? 0 : note.program,
          programName,
          visible: true,
          muted: false,
          hue: getDefaultHue(instruments.size),
          rawNotes: [],
        };
        instruments.set(key, instrument);
      }
      instrument.trackIndex = Math.min(instrument.trackIndex, note.trackIndex);
      instrument.sourceTrackIndices.add(note.trackIndex);
      instrument.ports.add(note.port);
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
        const sourceTrackIndices = Array.from(instrument.sourceTrackIndices).sort((left, right) => left - right);
        const ports = Array.from(instrument.ports).sort((left, right) => left - right);
        const channels = Array.from(instrument.channels).sort((left, right) => left - right);
        return {
          id: `${instrument.id}-${index + 1}`,
          name: instrument.programName,
          trackName: sourceTracks.join(", "),
          sourceTracks,
          sourceTrackIndices,
          trackIndex: instrument.trackIndex,
          port: ports[0] ?? 0,
          ports,
          channel: channels[0] ?? 0,
          channels,
          bank: instrument.bank,
          bankMsb: instrument.bankMsb,
          bankLsb: instrument.bankLsb,
          program: instrument.program,
          programName: instrument.programName,
          visible: true,
          muted: false,
          hue: getDefaultHue(index),
          notes,
        };
      })
      .filter((group) => group.notes.length)
      .sort(compareMidiGroupsWithDrumsLast);

    groups.forEach((group, index) => {
      group.hue = getDefaultHue(index);
      group.id = `midi-instrument-${isMidiGroupDrums(group) ? "drums" : `${getMidiGroupBank(group)}-${group.program}`}-${index + 1}`;
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
      message: i18nText("midi.import_read_summary", [groups.length, totalNotes, quantizeDivision]) + (mergedDuplicateCount ? i18nText("midi.import_merged_duplicates", [mergedDuplicateCount]) : ""),
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
    if (elements.midiImportLimitChannelsPerInstrument) {
      elements.midiImportLimitChannelsPerInstrument.checked = false;
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
    if (["mml", "3mle", "mmi"].includes(format) && state.midiImport.textCandidates.length) {
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
        entries.push(`악기 ${preview.groups.length}개`, `노트 ${noteCount}개`, `템포 ${tempoCount}개`, i18nText("ui.duration_value", [formatSeconds(durationSeconds)]));
      }
    } else {
      const format = state.midiImport.textFormat;
      const parsed = getCurrentUnifiedTextParsed();
      if (["mml", "3mle", "mmi"].includes(format) && state.midiImport.textCandidates.length) {
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

  function setTransportButtonContent(button, { icon = "", label = "", glyph = "" } = {}) {
    if (!button) return;
    const nodes = [];
    if (icon) {
      const iconNode = document.createElement("span");
      iconNode.className = `shared-transport-icon shared-icon-${icon}`;
      iconNode.setAttribute("aria-hidden", "true");
      nodes.push(iconNode);
    } else if (glyph) {
      const glyphNode = document.createElement("span");
      glyphNode.className = glyph === "…" ? "transport-loading-glyph" : "transport-stop-glyph";
      glyphNode.setAttribute("aria-hidden", "true");
      glyphNode.textContent = glyph;
      nodes.push(glyphNode);
    }
    if (label) {
      const labelNode = document.createElement("span");
      labelNode.className = "transport-button-label";
      labelNode.textContent = label;
      nodes.push(labelNode);
    }
    button.replaceChildren(...nodes);
  }

  function renderMidiImportSelectionList() {
    if (!elements.midiImportSelectionList) return;
    elements.midiImportSelectionList.replaceChildren();
    const isMidi = state.midiImport.kind === "midi";
    const isSelectableText = state.midiImport.kind === "text"
      && ["mml", "3mle", "mmi"].includes(state.midiImport.textFormat)
      && state.midiImport.textCandidates.length > 0;
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
        checkbox.setAttribute("aria-label", i18nText("ui.import", [getMidiGroupDisplayName(group)]));
        const info = document.createElement("div");
        info.className = "midi-import-selection-info";
        const title = document.createElement("strong");
        title.textContent = getMidiGroupDisplayName(group, i18nText("midi.default_instrument_name", [index + 1]));
        const meta = document.createElement("small");
        meta.textContent = `${i18nText("note.format_3", [group.notes?.length || 0])}${group.trackName ? ` · ${group.trackName}` : ""}`;
        info.append(title, meta);
        const previewButton = document.createElement("button");
        previewButton.type = "button";
        const previewKey = `group:${group.id}`;
        previewButton.className = "midi-import-row-preview";
        const previewPlaying = state.midiImport.previewingKey === previewKey;
        setTransportButtonContent(previewButton, { icon: previewPlaying ? "stop" : "play" });
        const previewActionLabel = i18nText(previewPlaying ? "stop" : "play");
        previewButton.setAttribute("aria-label", previewActionLabel);
        previewButton.title = previewActionLabel;
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
      checkbox.setAttribute("aria-label", i18nText("ui.import", [candidate.label]));
      const info = document.createElement("div");
      info.className = "midi-import-selection-info";
      const title = document.createElement("strong");
      title.textContent = candidate.label;
      const meta = document.createElement("small");
      meta.textContent = i18nText("ui.chars_3", [candidate.value?.length || 0]);
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
        ? i18nText("ui.import_2", [state.midiImport.sourceLabel || "MIDI"])
        : i18nText("ui.import_2", [textFormat]);
    }
    if (elements.midiImportSourceLabel) elements.midiImportSourceLabel.textContent = state.midiImport.fileName || i18nText("file.select");
    if (elements.midiImportMidiControls) elements.midiImportMidiControls.hidden = !isMidi;
    if (elements.midiImportChannelLimitLabel) {
      elements.midiImportChannelLimitLabel.textContent = i18nText("midi.limit_channels", [CONFIG.midiImportMaxChannelsPerInstrument]);
    }
    if (elements.midiImportApplyButton) elements.midiImportApplyButton.disabled = !ready;
    if (elements.midiImportNewButton) elements.midiImportNewButton.disabled = !ready;
    if (elements.midiImportPreviewAllButton) {
      elements.midiImportPreviewAllButton.disabled = !midiReady;
      if (state.midiImport.previewingKey === "all") setTransportButtonContent(elements.midiImportPreviewAllButton, { icon: "stop", label: i18nText("ui.stop_source") });
      else setTransportButtonContent(elements.midiImportPreviewAllButton, { icon: "play", label: i18nText("ui.preview_source") });
    }
    updateMidiImportSummary();
    renderMidiImportSelectionList();

    if (state.midiImport.busy) return;
    if (isMidi && state.midiImport.preview) {
      const selected = getMidiImportSelectedGroups().length;
      const division = Number(elements.midiImportQuantize?.value) === 32 ? 32 : 64;
      const statusKey = elements.midiImportIgnoreSingle64thOverlap?.checked !== false ? "instrument.quantize_overlap" : "instrument.quantize_summary";
      const channelLimitLabel = elements.midiImportLimitChannelsPerInstrument?.checked
        ? ` · ${i18nText("midi.limit_channels", [CONFIG.midiImportMaxChannelsPerInstrument])}`
        : "";
      setMidiImportStatus(i18nText(statusKey, [selected, state.midiImport.preview.groups.length, division]) + channelLimitLabel);
    } else if (isText && ["mml", "3mle", "mmi"].includes(state.midiImport.textFormat) && state.midiImport.textCandidates.length) {
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
    setMidiImportStatus(i18nText("file.analyzing_named", [source.sourceLabel]));
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
        if (!candidates.length) throw new Error(`${format === "mmi" ? "MabiIcco" : "3MLE"} 파일에서 연주 가능한 채널을 찾지 못했습니다.`);
        state.midiImport.textCandidates = candidates;
        state.midiImport.selectedTextIndexes = new Set(candidates.map((_, index) => index));
        state.midiImport.textParsed = parseMmlCandidateParts(candidates, 64);
      } else {
        const candidates = extractGenericMmlPartCandidates(text);
        if (!candidates.length) throw new Error("MML 파일에서 채널을 찾지 못했습니다.");
        state.midiImport.textCandidates = candidates;
        state.midiImport.selectedTextIndexes = new Set(candidates.map((_, index) => index));
        state.midiImport.textParsed = parseMmlCandidateParts(candidates, 64);
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
            bank: getMidiGroupBank(group),
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

  function getMidiVoiceSourceTrack(note) {
    const value = Number(note?.sourceTrackIndex ?? note?.trackIndex);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  }

  function getMidiVoiceSourcePort(note) {
    const value = Number(note?.sourcePort ?? note?.port);
    return Number.isFinite(value) ? clamp(Math.round(value), 0, 127) : null;
  }

  function getMidiVoiceSourceChannel(note) {
    const value = Number(note?.sourceChannel ?? note?.channel);
    return Number.isFinite(value) ? clamp(Math.round(value), 0, 15) : null;
  }

  function canAssignRawMidiNoteToVoice(voice, note, ignoreSingle64thOverlap) {
    const start = getMidiNoteRawStartBeat(note);
    if (voice.endBeat <= start + 1e-9) return true;
    if (!ignoreSingle64thOverlap || start <= voice.lastStartBeat + 1e-9) return false;
    // Small overlaps in source MIDI are usually pedal/release or tick-boundary artifacts.
    // Treat up to one editor 1/64 cell as sequential, but never collapse true simultaneity.
    return voice.endBeat - start <= CONFIG.minimumNoteBeat + 1e-7;
  }

  function scoreRawMidiVoiceAssignment(voice, note) {
    const start = getMidiNoteRawStartBeat(note);
    const pitch = clamp(Math.round(Number(note?.pitch) || 60), 0, 127);
    const pitchDistance = voice.lastPitch == null ? 0 : Math.abs(voice.lastPitch - pitch);
    const rangeCenter = voice.minPitch == null || voice.maxPitch == null
      ? pitch
      : (voice.minPitch + voice.maxPitch) / 2;
    let score = pitchDistance + Math.abs(rangeCenter - pitch) * 0.08;

    const sourceTrack = getMidiVoiceSourceTrack(note);
    if (sourceTrack != null && voice.lastSourceTrack != null) {
      score += sourceTrack === voice.lastSourceTrack ? -28 : 8;
    }
    const sourcePort = getMidiVoiceSourcePort(note);
    const sourceChannel = getMidiVoiceSourceChannel(note);
    if (sourcePort != null && sourceChannel != null && voice.lastSourcePort != null && voice.lastSourceChannel != null) {
      score += sourcePort === voice.lastSourcePort && sourceChannel === voice.lastSourceChannel ? -12 : 4;
    }

    // When affinity is otherwise similar, prefer the voice that ended more recently.
    score += Math.min(8, Math.max(0, start - voice.endBeat)) * 0.35;
    return score;
  }

  function appendRawMidiNoteToVoice(voice, note) {
    const start = getMidiNoteRawStartBeat(note);
    const end = getMidiNoteRawEndBeat(note);
    const pitch = clamp(Math.round(Number(note?.pitch) || 60), 0, 127);
    voice.notes.push({ ...note });
    voice.lastStartBeat = start;
    voice.endBeat = end;
    voice.lastPitch = pitch;
    voice.minPitch = voice.minPitch == null ? pitch : Math.min(voice.minPitch, pitch);
    voice.maxPitch = voice.maxPitch == null ? pitch : Math.max(voice.maxPitch, pitch);
    voice.lastSourceTrack = getMidiVoiceSourceTrack(note);
    voice.lastSourcePort = getMidiVoiceSourcePort(note);
    voice.lastSourceChannel = getMidiVoiceSourceChannel(note);
  }

  function chooseQuantizedMidiCollisionRepresentative(candidates, startBeat) {
    return candidates.slice().sort((left, right) => (
      Math.abs(getMidiNoteRawStartBeat(left) - startBeat) - Math.abs(getMidiNoteRawStartBeat(right) - startBeat)
      || (Number(right.velocity) || 0) - (Number(left.velocity) || 0)
      || (getMidiNoteRawEndBeat(right) - getMidiNoteRawStartBeat(right)) - (getMidiNoteRawEndBeat(left) - getMidiNoteRawStartBeat(left))
      || (Number(left.pitch) || 0) - (Number(right.pitch) || 0)
    ))[0];
  }

  function quantizeMidiVoiceForEditor(notes, quantizeUnit) {
    const unit = Math.max(CONFIG.minimumNoteBeat, Number(quantizeUnit) || CONFIG.minimumNoteBeat);
    const buckets = new Map();
    for (const note of notes || []) {
      const rawStart = getMidiNoteRawStartBeat(note);
      const rawEnd = getMidiNoteRawEndBeat(note);
      const startBeat = Math.max(0, snapBeatToUnit(rawStart, unit));
      const endBeat = Math.max(startBeat + unit, snapBeatToUnit(rawEnd, unit));
      const key = startBeat.toFixed(9);
      if (!buckets.has(key)) buckets.set(key, { startBeat, candidates: [] });
      buckets.get(key).candidates.push({ ...note, startBeat, durationBeat: endBeat - startBeat });
    }

    let collisionCount = 0;
    const quantized = [...buckets.values()]
      .sort((left, right) => left.startBeat - right.startBeat)
      .map((bucket) => {
        collisionCount += Math.max(0, bucket.candidates.length - 1);
        const selected = chooseQuantizedMidiCollisionRepresentative(bucket.candidates, bucket.startBeat);
        return {
          ...selected,
          startBeat: Number(bucket.startBeat.toFixed(6)),
          durationBeat: Number(Math.max(unit, Number(selected.durationBeat) || unit).toFixed(6)),
        };
      });

    // Raw-timing voices are monophonic. If quantization expands a note over the next
    // grid onset, shorten it instead of creating another editor channel.
    for (let index = 0; index < quantized.length - 1; index += 1) {
      const note = quantized[index];
      const next = quantized[index + 1];
      const endBeat = note.startBeat + Math.max(unit, Number(note.durationBeat) || unit);
      if (endBeat > next.startBeat + 1e-7) {
        note.durationBeat = Number(Math.max(unit, next.startBeat - note.startBeat).toFixed(6));
      }
    }
    return { notes: quantized, collisionCount };
  }

  function splitNotesIntoMonophonicVoices(notes, {
    ignoreSingle64thOverlap = true,
    quantizeUnit = CONFIG.minimumNoteBeat,
  } = {}) {
    const sorted = (notes || []).map((note) => ({ ...note })).sort((left, right) => (
      getMidiNoteRawStartBeat(left) - getMidiNoteRawStartBeat(right)
      || getMidiNoteRawEndBeat(left) - getMidiNoteRawEndBeat(right)
      || left.pitch - right.pitch
      || (getMidiVoiceSourceTrack(left) ?? 0) - (getMidiVoiceSourceTrack(right) ?? 0)
    ));
    const voices = [];

    // Process notes with the same source onset as a batch. Pairing the whole onset at once
    // avoids note-sort order from stealing the best existing voice from a neighboring pitch.
    for (let cursor = 0; cursor < sorted.length;) {
      const batchStart = getMidiNoteRawStartBeat(sorted[cursor]);
      const batch = [];
      while (cursor < sorted.length && Math.abs(getMidiNoteRawStartBeat(sorted[cursor]) - batchStart) <= 1e-9) {
        batch.push(sorted[cursor]);
        cursor += 1;
      }

      const availableVoiceIndexes = new Set();
      voices.forEach((voice, voiceIndex) => {
        if (batch.some((note) => canAssignRawMidiNoteToVoice(voice, note, ignoreSingle64thOverlap))) {
          availableVoiceIndexes.add(voiceIndex);
        }
      });
      const remainingNoteIndexes = new Set(batch.map((_, noteIndex) => noteIndex));

      while (availableVoiceIndexes.size && remainingNoteIndexes.size) {
        let best = null;
        for (const noteIndex of remainingNoteIndexes) {
          const note = batch[noteIndex];
          for (const voiceIndex of availableVoiceIndexes) {
            const voice = voices[voiceIndex];
            if (!canAssignRawMidiNoteToVoice(voice, note, ignoreSingle64thOverlap)) continue;
            const score = scoreRawMidiVoiceAssignment(voice, note);
            const pitchDistance = voice.lastPitch == null ? 0 : Math.abs(voice.lastPitch - Number(note.pitch));
            const candidate = { score, pitchDistance, voiceIndex, noteIndex };
            if (!best
              || candidate.score < best.score - 1e-9
              || (Math.abs(candidate.score - best.score) <= 1e-9 && candidate.pitchDistance < best.pitchDistance)
              || (Math.abs(candidate.score - best.score) <= 1e-9 && candidate.pitchDistance === best.pitchDistance && candidate.voiceIndex < best.voiceIndex)
              || (Math.abs(candidate.score - best.score) <= 1e-9 && candidate.pitchDistance === best.pitchDistance && candidate.voiceIndex === best.voiceIndex && candidate.noteIndex < best.noteIndex)) {
              best = candidate;
            }
          }
        }
        if (!best) break;
        appendRawMidiNoteToVoice(voices[best.voiceIndex], batch[best.noteIndex]);
        availableVoiceIndexes.delete(best.voiceIndex);
        remainingNoteIndexes.delete(best.noteIndex);
      }

      [...remainingNoteIndexes]
        .sort((leftIndex, rightIndex) => Number(batch[leftIndex].pitch) - Number(batch[rightIndex].pitch))
        .forEach((noteIndex) => {
          const voice = {
            notes: [],
            lastStartBeat: -Infinity,
            endBeat: 0,
            lastPitch: null,
            minPitch: null,
            maxPitch: null,
            lastSourceTrack: null,
            lastSourcePort: null,
            lastSourceChannel: null,
          };
          appendRawMidiNoteToVoice(voice, batch[noteIndex]);
          voices.push(voice);
        });
    }

    let quantizationCollisionCount = 0;
    const result = voices.map((voice) => {
      const quantized = quantizeMidiVoiceForEditor(voice.notes, quantizeUnit);
      quantizationCollisionCount += quantized.collisionCount;
      return quantized.notes;
    }).filter((voiceNotes) => voiceNotes.length);
    Object.defineProperty(result, "quantizationCollisionCount", {
      value: quantizationCollisionCount,
      enumerable: false,
      configurable: true,
    });
    return result;
  }

  function getMidiPackedVoicePitchCenter(notes) {
    const pitches = (notes || [])
      .map((note) => Number(note?.pitch))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (!pitches.length) return 60;
    const middle = Math.floor(pitches.length / 2);
    return pitches.length % 2
      ? pitches[middle]
      : (pitches[middle - 1] + pitches[middle]) / 2;
  }

  function getMidiPackedVoicePreferredTargets(voices, targetCount) {
    const count = Math.max(1, Math.round(Number(targetCount) || 1));
    const ranked = (voices || []).map((voice, sourceVoiceIndex) => ({
      sourceVoiceIndex,
      pitchCenter: getMidiPackedVoicePitchCenter(voice),
    })).sort((left, right) => (
      right.pitchCenter - left.pitchCenter
      || left.sourceVoiceIndex - right.sourceVoiceIndex
    ));
    const preferred = new Map();
    ranked.forEach((item, rank) => {
      const targetIndex = ranked.length <= 1 || count <= 1
        ? 0
        : Math.round((rank / (ranked.length - 1)) * (count - 1));
      preferred.set(item.sourceVoiceIndex, targetIndex);
    });
    return preferred;
  }

  function findMidiPackedVoiceReferenceNote(target, pitch) {
    const references = target?.referenceNotes || [];
    let best = null;
    let bestDistance = Infinity;
    for (const note of references) {
      const distance = Math.abs((Number(note?.pitch) || 60) - pitch);
      if (distance < bestDistance) {
        best = note;
        bestDistance = distance;
      }
    }
    return best;
  }

  function scoreMidiPackedVoiceTarget(target, targetIndex, targetCount, item, onsetInfo, preferredTargets) {
    const note = item.note;
    const pitch = clamp(Math.round(Number(note?.pitch) || 60), 0, 127);
    const reference = findMidiPackedVoiceReferenceNote(target, pitch);
    const pitchDistance = reference ? Math.abs((Number(reference.pitch) || 60) - pitch) : 0;
    const overlapCount = target?.activeNotes?.length || 0;
    const sameOnsetCount = onsetInfo.assignedCounts[targetIndex] || 0;
    const sourcePreferred = preferredTargets.get(item.sourceVoiceIndex) ?? 0;
    const targetPosition = targetCount <= 1 ? 0.5 : targetIndex / (targetCount - 1);
    const pitchPosition = onsetInfo.maxPitch > onsetInfo.minPitch
      ? (onsetInfo.maxPitch - pitch) / (onsetInfo.maxPitch - onsetInfo.minPitch)
      : targetPosition;
    const pitchLaneDistance = Math.abs(targetPosition - pitchPosition);
    const preferredDistance = Math.abs(targetIndex - sourcePreferred);

    let sourceAffinity = 0;
    const sourceTrack = getMidiVoiceSourceTrack(note);
    const sourcePort = getMidiVoiceSourcePort(note);
    const sourceChannel = getMidiVoiceSourceChannel(note);
    if (reference) {
      const referenceTrack = getMidiVoiceSourceTrack(reference);
      if (sourceTrack != null && referenceTrack != null) sourceAffinity += sourceTrack === referenceTrack ? -22 : 5;
      const referencePort = getMidiVoiceSourcePort(reference);
      const referenceChannel = getMidiVoiceSourceChannel(reference);
      if (sourcePort != null && sourceChannel != null && referencePort != null && referenceChannel != null) {
        sourceAffinity += sourcePort === referencePort && sourceChannel === referenceChannel ? -10 : 3;
      }
    }

    // This follows the Player's two-stage idea: free/unused channels win first, then an
    // already-busy channel is accepted instead of dropping a note. The strong same-onset
    // and overlap costs spread a chord across N channels before stacking additional notes.
    return sameOnsetCount * 10000
      + overlapCount * 1200
      + pitchLaneDistance * 90
      + preferredDistance * 18
      + pitchDistance * 2.4
      + sourceAffinity
      + target.notes.length * 0.002;
  }

  function packMidiVoicesToMaxChannels(voices, maxVoiceCount) {
    const sourceVoices = (voices || []).filter((voice) => Array.isArray(voice) && voice.length);
    const requestedCount = Math.max(1, Math.round(Number(maxVoiceCount) || 1));
    if (sourceVoices.length <= requestedCount) return sourceVoices;

    const targetCount = Math.min(requestedCount, sourceVoices.length);
    const targets = Array.from({ length: targetCount }, () => ({
      notes: [],
      activeNotes: [],
      referenceNotes: [],
      currentOnsetNotes: [],
    }));
    const preferredTargets = getMidiPackedVoicePreferredTargets(sourceVoices, targetCount);
    const items = sourceVoices.flatMap((voice, sourceVoiceIndex) => voice.map((note, sourceNoteIndex) => ({
      note: { ...note },
      sourceVoiceIndex,
      sourceNoteIndex,
    }))).sort((left, right) => (
      Number(left.note.startBeat) - Number(right.note.startBeat)
      || Number(right.note.pitch) - Number(left.note.pitch)
      || left.sourceVoiceIndex - right.sourceVoiceIndex
      || left.sourceNoteIndex - right.sourceNoteIndex
    ));

    for (let cursor = 0; cursor < items.length;) {
      const startBeat = Number(items[cursor].note.startBeat) || 0;
      const batch = [];
      while (cursor < items.length && Math.abs((Number(items[cursor].note.startBeat) || 0) - startBeat) <= 1e-9) {
        batch.push(items[cursor]);
        cursor += 1;
      }
      const pitches = batch.map((item) => clamp(Math.round(Number(item.note.pitch) || 60), 0, 127));
      const onsetInfo = {
        minPitch: Math.min(...pitches),
        maxPitch: Math.max(...pitches),
        assignedCounts: Array(targetCount).fill(0),
      };
      targets.forEach((target) => {
        target.activeNotes = target.activeNotes.filter((note) => (
          (Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat) > startBeat + 1e-9
        ));
        target.currentOnsetNotes = [];
      });

      const remaining = batch.slice();
      while (remaining.length) {
        let best = null;
        for (let noteIndex = 0; noteIndex < remaining.length; noteIndex += 1) {
          const item = remaining[noteIndex];
          for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
            const score = scoreMidiPackedVoiceTarget(targets[targetIndex], targetIndex, targetCount, item, onsetInfo, preferredTargets);
            const candidate = { score, noteIndex, targetIndex };
            if (!best
              || candidate.score < best.score - 1e-9
              || (Math.abs(candidate.score - best.score) <= 1e-9 && candidate.targetIndex < best.targetIndex)
              || (Math.abs(candidate.score - best.score) <= 1e-9 && candidate.targetIndex === best.targetIndex && candidate.noteIndex < best.noteIndex)) {
              best = candidate;
            }
          }
        }
        const [chosen] = remaining.splice(best.noteIndex, 1);
        targets[best.targetIndex].notes.push(chosen.note);
        targets[best.targetIndex].currentOnsetNotes.push(chosen.note);
        onsetInfo.assignedCounts[best.targetIndex] += 1;
      }
      targets.forEach((target) => {
        if (target.currentOnsetNotes.length) target.referenceNotes = target.currentOnsetNotes.slice();
        target.activeNotes.push(...target.currentOnsetNotes);
      });
    }

    const packed = targets.map((target) => target.notes.sort((left, right) => (
      Number(left.startBeat) - Number(right.startBeat)
      || Number(left.durationBeat) - Number(right.durationBeat)
      || Number(left.pitch) - Number(right.pitch)
    ))).filter((voice) => voice.length);
    Object.defineProperties(packed, {
      sourceVoiceCount: { value: sourceVoices.length, enumerable: false, configurable: true },
      packedVoiceCount: { value: packed.length, enumerable: false, configurable: true },
      quantizationCollisionCount: { value: Number(voices?.quantizationCollisionCount) || 0, enumerable: false, configurable: true },
    });
    return packed;
  }

  function overwriteEditorChannelsFromMidiDocument(parsed) {
    const descriptors = [];
    for (const group of parsed.groups || []) {
      const voices = splitNotesIntoMonophonicVoices(group.notes || [], { quantizeUnit: 4 / (Number(parsed?.quantizeDivision) === 32 ? 32 : 64) });
      voices.forEach((notes, voiceIndex) => {
        descriptors.push({
          name: voices.length > 1 ? `${group.name} ${voiceIndex + 1}` : group.name,
          group,
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
      const descriptorPreset = resolveMidiGroupEditorPreset(descriptor.group, descriptor.notes);
      if (descriptorPreset) setChannelInstrumentPreset(channel, descriptorPreset);
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
    maxChannelsPerInstrument = 0,
  } = {}) {
    const groups = (parsed?.groups || [])
      .filter((group) => Array.isArray(group?.notes) && group.notes.length)
      .sort(compareMidiGroupsWithDrumsLast);
    if (!groups.length) return { channelCount: 0, instrumentCount: 0, noteCount: 0 };

    const sourceTitle = stripMidiFileExtension(fileName || parsed?.fileName || parsed?.title || "불러온 파일") || "불러온 파일";
    if (openNew) {
      resetProject({ notify: false });
      state.channels = [];
      state.activeChannel = 0;
      state.projectName = sourceTitle;
      state.loadedFileName = String(fileName || parsed?.fileName || "").trim();
    }

    const hueByInstrument = new Map();
    const createdChannels = [];
    let noteCount = 0;
    let limitedInstrumentCount = 0;
    let channelsBeforeLimit = 0;

    groups.forEach((group, groupIndex) => {
      const instrumentKey = getMidiGroupInstrumentKey(group);
      if (!hueByInstrument.has(instrumentKey)) {
        hueByInstrument.set(instrumentKey, getMidiGroupHue(group, groupIndex));
      }
      const copyHue = hueByInstrument.get(instrumentKey);
      let voices = splitNotesIntoMonophonicVoices(group.notes || [], {
        ignoreSingle64thOverlap,
        quantizeUnit: 4 / (Number(parsed?.quantizeDivision) === 32 ? 32 : 64),
      });
      const uncappedVoiceCount = voices.length;
      const channelLimit = Math.max(0, Math.round(Number(maxChannelsPerInstrument) || 0));
      if (channelLimit > 0 && voices.length > channelLimit) {
        channelsBeforeLimit += uncappedVoiceCount;
        voices = packMidiVoicesToMaxChannels(voices, channelLimit);
        limitedInstrumentCount += 1;
      }
      voices.forEach((voiceNotes, voiceIndex) => {
        if (!voiceNotes.length) return;
        const channel = makeEditorChannelFromMidiVoice(group, voiceNotes, {
          voiceIndex,
          voiceCount: voices.length,
          copyHue,
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
    return {
      channelCount: createdChannels.length,
      instrumentCount: groups.length,
      noteCount,
      limitedInstrumentCount,
      channelsBeforeLimit,
      maxChannelsPerInstrument: Math.max(0, Math.round(Number(maxChannelsPerInstrument) || 0)),
    };
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
          maxChannelsPerInstrument: elements.midiImportLimitChannelsPerInstrument?.checked
            ? CONFIG.midiImportMaxChannelsPerInstrument
            : 0,
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
        const limitToast = imported.limitedInstrumentCount > 0
          ? i18nText("midi.limit_channels_applied", [imported.limitedInstrumentCount, imported.maxChannelsPerInstrument])
          : "";
        showToast(`${stripMidiFileExtension(fileName)}에서 선택한 악기 ${imported.instrumentCount}개를 ${imported.channelCount}개 편집 채널로 ${openNew ? "새로 열었습니다." : "추가했습니다."}${limitToast}`);
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
        state.loadedFileName = String(fileName || "").trim();
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
      markDirty(i18nText("history.source_add", [converted.sourceLabel]));
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
      message: i18nText("midi.delete_group_confirm", [getMidiGroupDisplayName(group)]),
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

  function setMidiGroupHue(documentId, groupId, hue, { commit = true } = {}) {
    const document = state.midiDocuments.find((item) => String(item.id) === String(documentId));
    const group = document?.groups?.find((item) => String(item.id) === String(groupId));
    if (!group) return false;
    const index = Math.max(0, (document.groups || []).indexOf(group));
    const normalizedHue = normalizeHue(hue, getMidiGroupHue(group, index));
    if (group.hue === normalizedHue) return false;
    group.hue = normalizedHue;
    if (commit) setDirtyWithoutHistory();
    renderChannelTabs();
    updateMidiReferenceUI();
    drawRoll();
    drawOverviewTimeline();
    scheduleAutosave(120);
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

  function makeEditorChannelFromMidiVoice(group, notes, { voiceIndex = 0, voiceCount = 1, copyHue = null } = {}) {
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    const voiceSuffix = voiceCount > 1 ? ` (${voiceIndex + 1})` : "";
    const requestedName = `${getMidiGroupDisplayName(group, i18nText("channel.instrument_3"))}${voiceSuffix}`;
    channel.name = makeUniqueChannelName(requestedName, channel.id);
    channel.hue = Number.isFinite(Number(copyHue)) ? normalizeHue(copyHue) : getMidiGroupHue(group, state.channels.length);
    const sourcePreset = resolveMidiGroupEditorPreset(group, notes);
    if (sourcePreset) setChannelInstrumentPreset(channel, sourcePreset);
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
    const validGroups = (groups || [])
      .filter((group) => Array.isArray(group?.notes) && group.notes.length)
      .sort(compareMidiGroupsWithDrumsLast);
    if (!validGroups.length) {
      showToast("복사할 원본 악기 채널이 없습니다.");
      return false;
    }
    const createdChannels = [];
    const hueByInstrument = new Map();
    let copiedNotes = 0;
    for (const group of validGroups) {
      const sourceIndex = Math.max(0, (document?.groups || []).indexOf(group));
      const instrumentKey = getMidiGroupInstrumentKey(group);
      if (!hueByInstrument.has(instrumentKey)) {
        hueByInstrument.set(instrumentKey, getMidiGroupHue(group, sourceIndex));
      }
      const copyHue = hueByInstrument.get(instrumentKey);
      const voices = splitNotesIntoMonophonicVoices(group.notes || [], { quantizeUnit: 4 / (Number(document?.quantizeDivision) === 32 ? 32 : 64) });
      voices.forEach((voiceNotes, voiceIndex) => {
        if (!voiceNotes.length) return;
        const channel = makeEditorChannelFromMidiVoice(group, voiceNotes, {
          voiceIndex,
          voiceCount: voices.length,
          copyHue,
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
      if (elements.infoCharCount) elements.infoCharCount.textContent = "0";
      if (elements.infoSelectionCount) elements.infoSelectionCount.textContent = "0";
      updatePlaybackTimeInfo();
      updateEditMenuState();
      return;
    }
    const selected = getSelectedNotes();
    if (elements.infoCharCount) {
      elements.infoCharCount.textContent = getMmlChannelCharacterCount(channel).toLocaleString();
      elements.infoCharCount.title = "현재 채널 단독 MML 기준 글자 수(템포 명령 제외)";
    }
    if (elements.infoSelectionCount) elements.infoSelectionCount.textContent = selected.length.toLocaleString();
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

  function getNoteVolumeCounts(notes) {
    const counts = new Map();
    for (const note of notes || []) {
      const volume = getNoteVolume(note);
      counts.set(volume, (counts.get(volume) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([volume, count]) => ({ volume, count }));
  }

  function renderNoteVolumeCountChips(node, items) {
    if (!node) return;
    node.replaceChildren();
    const values = Array.isArray(items) ? items : [];
    if (!values.length) {
      const empty = document.createElement("span");
      empty.className = "note-volume-count-chip is-empty";
      empty.textContent = "V-";
      node.append(empty);
      return;
    }
    for (const { volume, count } of values) {
      const chip = document.createElement("span");
      chip.className = "note-volume-count-chip";
      const label = document.createElement("em");
      label.textContent = `V${volume}`;
      const amount = document.createElement("strong");
      amount.textContent = `× ${Number(count).toLocaleString()}`;
      chip.append(label, amount);
      node.append(chip);
    }
  }

  function getAllEditorNotes() {
    return state.channels.flatMap((channel) => Array.isArray(channel?.notes) ? channel.notes : []);
  }

  function getNoteVolumeDialogNotes() {
    return state.noteVolumeDialogScope === "all" ? getAllEditorNotes() : getSelectedNotes();
  }

  function isNoteVolumeFixedMode() {
    return Boolean(elements.noteVolumeFixedMode?.checked);
  }

  function formatNoteVolumeDelta(value) {
    const delta = clamp(Math.round(Number(value) || 0), -15, 15);
    if (delta > 0) return `+${delta}`;
    if (delta < 0) return `${delta}`;
    return "±0";
  }

  function getNoteVolumeDialogTargetVolume(note) {
    const sliderValue = Math.round(Number(elements.noteVolumeSlider?.value) || 0);
    if (isNoteVolumeFixedMode()) return clamp(sliderValue, 0, 15);
    return clamp(getNoteVolume(note) + clamp(sliderValue, -15, 15), 0, 15);
  }

  function updateNoteVolumeDialogControl() {
    const fixed = isNoteVolumeFixedMode();
    if (elements.noteVolumeControlLabel) {
      const labelKey = fixed ? "volume.fixed_value" : "volume.relative_adjust";
      elements.noteVolumeControlLabel.dataset.i18n = labelKey;
      elements.noteVolumeControlLabel.textContent = i18nText(labelKey);
    }
    const value = Math.round(Number(elements.noteVolumeSlider?.value) || 0);
    if (elements.noteVolumeValue) {
      elements.noteVolumeValue.textContent = fixed
        ? `V${clamp(value, 0, 15)}`
        : formatNoteVolumeDelta(value);
    }
  }

  function configureNoteVolumeSliderForMode(resetValue = true) {
    if (!elements.noteVolumeSlider) return;
    const notes = getNoteVolumeDialogNotes();
    const fixed = isNoteVolumeFixedMode();
    if (fixed) {
      elements.noteVolumeSlider.min = "0";
      elements.noteVolumeSlider.max = "15";
      elements.noteVolumeSlider.step = "1";
      if (resetValue) {
        const volumes = notes.map((note) => getNoteVolume(note));
        const unique = new Set(volumes);
        const initial = unique.size === 1
          ? (volumes[0] ?? CONFIG.defaultNewChannelNoteVolume)
          : Math.round(volumes.reduce((sum, value) => sum + value, 0) / Math.max(1, volumes.length));
        elements.noteVolumeSlider.value = String(clamp(initial, 0, 15));
      }
    } else {
      elements.noteVolumeSlider.min = "-15";
      elements.noteVolumeSlider.max = "15";
      elements.noteVolumeSlider.step = "1";
      if (resetValue) elements.noteVolumeSlider.value = "0";
    }
    updateNoteVolumeDialogControl();
    updateNoteVolumeDialogCounts();
  }

  function updateNoteVolumeDialogCounts() {
    const notes = getNoteVolumeDialogNotes();
    renderNoteVolumeCountChips(elements.noteVolumeCurrentCounts, getNoteVolumeCounts(notes));
    const targets = notes.map((note) => ({ volume: getNoteVolumeDialogTargetVolume(note) }));
    renderNoteVolumeCountChips(elements.noteVolumeTargetCounts, getNoteVolumeCounts(targets));
  }

  function openNoteVolumeDialog(options = null) {
    const scope = options?.scope === "all" ? "all" : "selected";
    if (scope === "selected") {
      if (state.activePanel === "audio") {
        showToast("오디오에는 노트 볼륨 기능을 사용할 수 없습니다.");
        return false;
      }
      if (isMidiReferenceActive()) {
        showToast("MIDI 노트는 읽기 전용입니다.");
        return false;
      }
    }
    state.noteVolumeDialogScope = scope;
    const notes = scope === "all" ? getAllEditorNotes() : getSelectedNotes();
    if (!notes.length) {
      showToast(scope === "all" ? i18nText("volume.no_editor_notes") : "볼륨을 수정할 노트를 선택하세요.");
      return false;
    }
    // Default behavior is relative adjustment: each note keeps its own volume relationship.
    if (elements.noteVolumeFixedMode) elements.noteVolumeFixedMode.checked = false;
    configureNoteVolumeSliderForMode(true);
    if (elements.noteVolumeDialogTitle) {
      elements.noteVolumeDialogTitle.textContent = scope === "all" ? i18nText("volume.edit_all_notes") : i18nText("note.volume");
    }
    elements.noteVolumeSelectionLabel.textContent = scope === "all"
      ? i18nText("volume.all_channels_note_count", [notes.length.toLocaleString()])
      : `${notes.length}개 선택 노트`;
    elements.noteVolumeBackdrop?.querySelector("#noteVolumeDialog")?.setAttribute(
      "aria-label",
      scope === "all" ? i18nText("volume.edit_all_notes") : i18nText("note.edit_volume"),
    );
    updateNoteVolumeDialogCounts();
    elements.noteVolumeBackdrop.hidden = false;
    requestAnimationFrame(() => elements.noteVolumeSlider.focus());
    return true;
  }

  function openAllNoteVolumeDialog() {
    return openNoteVolumeDialog({ scope: "all" });
  }

  function closeNoteVolumeDialog() {
    if (elements.noteVolumeBackdrop) elements.noteVolumeBackdrop.hidden = true;
    state.noteVolumeDialogScope = "selected";
  }

  function applySelectedNoteVolume() {
    const scope = state.noteVolumeDialogScope;
    const notes = getNoteVolumeDialogNotes();
    if (!notes.length) {
      closeNoteVolumeDialog();
      return false;
    }
    const fixed = isNoteVolumeFixedMode();
    const sliderValue = Math.round(Number(elements.noteVolumeSlider?.value) || 0);
    const fixedVolume = clamp(sliderValue, 0, 15);
    const delta = clamp(sliderValue, -15, 15);
    let changedCount = 0;
    for (const note of notes) {
      const before = getNoteVolume(note);
      const nextVolume = fixed ? fixedVolume : clamp(before + delta, 0, 15);
      if (nextVolume === before) continue;
      note.volume = nextVolume;
      note.velocity = mmlVolumeToVelocity(nextVolume);
      changedCount += 1;
    }
    closeNoteVolumeDialog();
    if (!changedCount) return false;
    markDirty(scope === "all" ? "모든 볼륨 수정" : "노트 볼륨 변경");
    drawRoll();
    updateChannelInfo();
    if (fixed) {
      showToast(scope === "all"
        ? i18nText("volume.all_fixed", [changedCount.toLocaleString(), fixedVolume])
        : i18nText("volume.selected_fixed", [changedCount.toLocaleString(), fixedVolume]));
    } else {
      const deltaText = formatNoteVolumeDelta(delta);
      showToast(scope === "all"
        ? i18nText("volume.all_adjusted", [changedCount.toLocaleString(), deltaText])
        : i18nText("volume.selected_adjusted", [changedCount.toLocaleString(), deltaText]));
    }
    return true;
  }

  function updateDirtyState() {
    elements.dirtyIndicator.hidden = !state.dirty;
    // 다른 MobiBard 제품과 동일하게 제품명이 아닌 언어별 브랜드명으로 고정합니다.
    const brandTitle = i18nText("app.title");
    if (document.title !== brandTitle) document.title = brandTitle;
  }

  function captureHistorySnapshot() {
    return JSON.stringify({
      channels: state.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        hue: getChannelHue(channel),
        instrument: channel.instrument,
        instrumentProgram: getChannelInstrumentProgram(channel),
        instrumentBank: getChannelInstrumentBank(channel),
        instrumentExactPreset: getChannelInstrumentExactPreset(channel),
        defaultNoteVolume: clamp(
          Math.round(Number(channel.defaultNoteVolume ?? CONFIG.defaultNewChannelNoteVolume) || CONFIG.defaultNewChannelNoteVolume),
          0,
          15,
        ),
        notes: channel.notes.map((note) => ({ ...note })),
      })),
      tempos: state.tempos.map((tempo) => ({ ...tempo })),
      timelineFades: normalizeTimelineFades(),
      audioClips: state.audioClips.map((clip) => ({ ...clip })),
      nextNoteId: state.nextNoteId,
      nextTempoId: state.nextTempoId,
      nextAudioClipId: state.nextAudioClipId,
    });
  }

  function createHistoryEntry(snapshot, label = "편집") {
    const activeChannel = getActiveChannel();
    return {
      id: state.history.nextId++,
      snapshot,
      label: String(label || "편집"),
      channelId: activeChannel?.id ?? null,
      restorePlayheadBeat: null,
      createdAt: Date.now(),
    };
  }

  function rememberCurrentHistoryPlayhead(beat = state.playhead.beat) {
    if (!state.history.currentEntry) return false;
    const value = Number(beat);
    if (!Number.isFinite(value)) return false;
    state.history.currentEntry.restorePlayheadBeat = Math.max(0, value);
    return true;
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
    elements.historyList.style.counterReset = `history-step ${entries.length + 1}`;
    elements.historyList.replaceChildren();
    newestFirst.forEach(({ entry, index }) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `history-item${index === currentIndex ? " current" : ""}${index > currentIndex ? " future" : ""}`;
      button.dataset.contextArea = "history-item";
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
      return index >= 0 ? selectChannel(index) : false;
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
    if (elements.sidePanel) elements.sidePanel.hidden = false;
    if (elements.historyCornerToggle) {
      elements.historyCornerToggle.textContent = state.history.collapsed ? "›" : "‹";
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

  function restoreHistorySnapshot(snapshot, restorePlayheadBeat = null) {
    const data = JSON.parse(snapshot);
    invalidateOverviewTimelineActivity();
    const scrollLeft = elements.rollViewport.scrollLeft;
    const scrollTop = elements.rollViewport.scrollTop;
    const activeChannelId = getActiveChannel()?.id ?? null;
    const activeChannelIndex = state.activeChannel;
    const currentPlayheadBeat = state.playhead.beat;
    const requestedPlayheadBeat = Number(restorePlayheadBeat);
    const playheadBeat = Number.isFinite(requestedPlayheadBeat)
      ? Math.max(0, requestedPlayheadBeat)
      : currentPlayheadBeat;
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
        hue: getChannelHue(channel, index),
        muted: mutedByChannelId.get(String(channelId)) || false,
        visible: visibleByChannelId.has(String(channelId)) ? visibleByChannelId.get(String(channelId)) : true,
        instrument: String(channel.instrument || "Piano"),
        instrumentProgram: clamp(Math.round(Number(channel.instrumentProgram ?? getInstrumentProgramFromName(channel.instrument)) || 0), 0, 127),
        instrumentBank: clamp(Math.round(Number(channel.instrumentBank ?? (isDrumInstrumentName(channel.instrument) ? 128 : 0)) || 0), 0, 16383),
        instrumentExactPreset: channel.instrumentExactPreset === true,
        defaultNoteVolume: clamp(
          Math.round(Number(channel.defaultNoteVolume ?? CONFIG.defaultNewChannelNoteVolume) || CONFIG.defaultNewChannelNoteVolume),
          0,
          15,
        ),
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
      state.timelineFades = normalizeTimelineFades(data.timelineFades || state.timelineFades);
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
    restoreHistorySnapshot(state.history.currentEntry.snapshot, state.history.currentEntry.restorePlayheadBeat);
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
    restoreHistorySnapshot(previousEntry.snapshot, previousEntry.restorePlayheadBeat);
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
    restoreHistorySnapshot(nextEntry.snapshot, nextEntry.restorePlayheadBeat);
    renderHistoryPanel();
    if (notify) showToast("편집을 다시 실행했습니다.");
    return true;
  }

  function handleHistoryShortcut(event) {
    if (isModalPopupOpen()) return false;
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
    invalidateOverviewTimelineActivity();
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
    const currentSeconds = getPlayheadDisplaySeconds(currentBeat);
    if (elements.playheadTimeLabel) {
      elements.playheadTimeLabel.textContent = formatPlayheadClock(currentSeconds);
    }
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

  function buildIndependentResizeOriginals(channel, selectedNotes) {
    const ordered = sortNoteIntervals(channel?.notes || []);
    const indexById = new Map(ordered.map((note, index) => [String(note.id), index]));
    const totalBeats = getTotalBeats();
    return (selectedNotes || []).map((note) => {
      const startBeat = Math.max(0, Number(note.startBeat) || 0);
      const durationBeat = Math.max(
        CONFIG.minimumNoteBeat,
        Number(note.durationBeat) || CONFIG.minimumNoteBeat,
      );
      const endBeat = startBeat + durationBeat;
      const orderedIndex = indexById.get(String(note.id));
      const previous = Number.isInteger(orderedIndex) && orderedIndex > 0
        ? ordered[orderedIndex - 1]
        : null;
      const following = Number.isInteger(orderedIndex) && orderedIndex < ordered.length - 1
        ? ordered[orderedIndex + 1]
        : null;
      const previousEndBeat = previous
        ? (Number(previous.startBeat) || 0) + Math.max(
          CONFIG.minimumNoteBeat,
          Number(previous.durationBeat) || CONFIG.minimumNoteBeat,
        )
        : 0;
      const followingStartBeat = following
        ? Math.max(0, Number(following.startBeat) || 0)
        : totalBeats;

      // Shift-resize is intentionally non-destructive: each selected note is
      // clamped against its own immediate neighbours instead of overwriting them.
      // Math.min/Math.max with the original edge also keeps legacy overlapping
      // data stationary at delta 0 rather than forcing a jump on pointer-down.
      return {
        note,
        startBeat,
        durationBeat,
        endBeat,
        minStartBeat: Math.min(startBeat, Math.max(0, previousEndBeat)),
        maxStartBeat: Math.max(0, endBeat - CONFIG.minimumNoteBeat),
        minEndBeat: Math.min(totalBeats, startBeat + CONFIG.minimumNoteBeat),
        maxEndBeat: following
          ? Math.max(endBeat, Math.min(totalBeats, followingStartBeat))
          : Number.POSITIVE_INFINITY,
      };
    });
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
      if (interaction.multiResize && Array.isArray(interaction.resizeOriginals)) {
        for (const original of interaction.resizeOriginals) {
          original.note.startBeat = original.startBeat;
          original.note.durationBeat = original.durationBeat;
        }
      } else {
        interaction.note.startBeat = interaction.originalStartBeat;
        interaction.note.durationBeat = interaction.originalDurationBeat;
      }
    }

    const pointerId = interaction.pointerId;
    state.interaction = null;
    state.suppressContextMenuUntil = performance.now() + 650;
    clearEditorPitchPreview(true);
    if (Number.isFinite(Number(pointerId))) {
      try { elements.rollCanvas.releasePointerCapture(pointerId); } catch {}
    }
    elements.rollCanvas.style.cursor = getEffectiveEditTool() === "select" || state.activePanel !== "notes" ? "default" : "crosshair";
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
    const audioWasActive = state.activePanel === "audio" || state.activeAudioClipId != null;
    state.activePanel = "notes";
    state.activeAudioClipId = null;
    clearNoteSelection();
    state.selectedNoteIds.add(noteId);
    if (audioWasActive) {
      renderChannelTabs();
      renderChannelEditor();
      renderAudioLane();
    }
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

  function removeRestsBetweenSelectedNotes() {
    const channel = state.activePanel === "notes" && !isMidiReferenceActive() ? getActiveChannel() : null;
    if (!channel?.notes?.length) return false;

    const selectedIds = state.selectedNoteIds;
    if (selectedIds.size < 2) return false;

    const ordered = sortNoteIntervals(channel.notes);
    const runs = [];
    let currentRun = [];

    for (const note of ordered) {
      if (selectedIds.has(note.id)) {
        currentRun.push(note);
        continue;
      }
      if (currentRun.length >= 2) runs.push(currentRun);
      currentRun = [];
    }
    if (currentRun.length >= 2) runs.push(currentRun);

    if (!runs.length) {
      showToast("서로 연속해서 선택된 노트가 없습니다.");
      return true;
    }

    let filledBeats = 0;
    let changedRunCount = 0;

    for (const run of runs) {
      let runChanged = false;

      for (let index = 0; index < run.length - 1; index += 1) {
        const note = run[index];
        const nextNote = run[index + 1];
        const start = Math.max(0, Number(note.startBeat) || 0);
        const duration = Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        const nextStart = Math.max(0, Number(nextNote.startBeat) || 0);
        const end = start + duration;
        const gap = nextStart - end;

        if (gap <= 1e-7) continue;

        note.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, nextStart - start).toFixed(6));
        filledBeats += gap;
        runChanged = true;
      }

      if (runChanged) changedRunCount += 1;
    }

    if (filledBeats <= 1e-7) {
      showToast("연속 선택된 노트 사이에 메울 쉼표가 없습니다.");
      return true;
    }

    state.channelNoteRuntime.delete(String(channel.id));
    markDirty("연속 선택 구간 쉼표 메우기");
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(`연속 선택 ${changedRunCount}구간에서 앞 노트를 늘려 쉼표 ${Number(filledBeats.toFixed(3))} beat를 메웠습니다.`);
    return true;
  }

  function extendSelectedNotesToSide(direction) {
    const channel = state.activePanel === "notes" && !isMidiReferenceActive() ? getActiveChannel() : null;
    if (!channel?.notes?.length || !state.selectedNoteIds.size) return false;

    const selected = getSelectedNotes(channel);
    if (!selected.length) return false;
    const minStart = Math.min(...selected.map((note) => Number(note.startBeat) || 0));
    const maxStart = Math.max(...selected.map((note) => Number(note.startBeat) || 0));
    const beforeCount = state.selectedNoteIds.size;

    for (const note of channel.notes) {
      const start = Number(note.startBeat) || 0;
      if (direction < 0 ? start < minStart - 1e-7 : start > maxStart + 1e-7) {
        state.selectedNoteIds.add(note.id);
      }
    }

    drawRoll();
    updateChannelInfo();
    if (state.selectedNoteIds.size === beforeCount) {
      showToast(direction < 0 ? "선택된 노트보다 왼쪽에 노트가 없습니다." : "선택된 노트보다 오른쪽에 노트가 없습니다.");
    }
    return true;
  }

  function shiftSelectedNotesByOctave(direction) {
    const channel = state.activePanel === "notes" && !isMidiReferenceActive() ? getActiveChannel() : null;
    if (!channel?.notes?.length || !state.selectedNoteIds.size) return false;

    const selected = getSelectedNotes(channel);
    if (!selected.length) return false;
    const lowest = Math.min(...selected.map((note) => Number(note.pitch) || CONFIG.minPitch));
    const highest = Math.max(...selected.map((note) => Number(note.pitch) || CONFIG.minPitch));
    const canMoveFullOctave = direction > 0
      ? highest + 12 <= CONFIG.maxPitch
      : lowest - 12 >= CONFIG.minPitch;
    const semitones = canMoveFullOctave ? (direction > 0 ? 12 : -12) : 0;

    if (!semitones) {
      showToast(direction > 0
        ? "선택 노트를 한 옥타브 더 올릴 수 없습니다."
        : "선택 노트를 한 옥타브 더 내릴 수 없습니다.");
      return true;
    }

    for (const note of selected) note.pitch += semitones;
    state.channelNoteRuntime.delete(String(channel.id));
    markDirty(direction > 0 ? "선택 노트 옥타브 올리기" : "선택 노트 옥타브 내리기");
    drawRoll();
    updateChannelInfo();
    return true;
  }


  function selectChannel(index) {
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

  function isChannelSolo(channelOrId) {
    const channelId = typeof channelOrId === "object" && channelOrId
      ? channelOrId.id
      : channelOrId;
    return state.soloChannelIds.has(String(channelId));
  }

  function pruneSoloChannelIds() {
    const validIds = new Set(state.channels.map((channel) => String(channel.id)));
    for (const channelId of [...state.soloChannelIds]) {
      if (!validIds.has(String(channelId))) state.soloChannelIds.delete(String(channelId));
    }
    return state.soloChannelIds.size;
  }

  function isChannelEffectivelyMuted(channel) {
    if (!channel) return true;
    pruneSoloChannelIds();
    if (state.soloChannelIds.size) return !isChannelSolo(channel);
    return Boolean(channel.muted);
  }

  function captureChannelAudibleStates() {
    return new Map(state.channels.map((channel) => [String(channel.id), !isChannelEffectivelyMuted(channel)]));
  }

  function refreshChannelPlaybackForAudibleStateChange(beforeAudible) {
    if (!(state.playback.running || state.playback.loading)) return;
    for (const channel of state.channels) {
      const key = String(channel.id);
      const wasAudible = Boolean(beforeAudible?.get(key));
      const isAudible = !isChannelEffectivelyMuted(channel);
      if (wasAudible === isAudible) continue;
      if (isAudible) schedulePlaybackCatchupForSource(channel.id, { source: "channel" });
      else releasePlaybackVoicesForSource(channel.id, { source: "channel" });
    }
    refreshPlaybackVisualsAfterMuteChange();
  }

  function setChannelSoloById(channelId, solo, { notify = true } = {}) {
    const channel = getChannelById(channelId);
    if (!channel) return false;
    const key = String(channel.id);
    const nextSolo = Boolean(solo);
    if (state.soloChannelIds.has(key) === nextSolo) return false;

    const beforeAudible = captureChannelAudibleStates();
    if (nextSolo) state.soloChannelIds.add(key);
    else state.soloChannelIds.delete(key);
    refreshChannelPlaybackForAudibleStateChange(beforeAudible);

    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(i18nText(nextSolo ? "channel.solo_on_named" : "channel.solo_off_named", [channel.name]));
    return true;
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
    if (notify) showToast(i18nText(channel.visible ? "ui.showed" : "ui.hid", [channel.name]));
    return true;
  }

  function setChannelMutedById(channelId, muted, { notify = true } = {}) {
    const channel = getChannelById(channelId);
    const nextMuted = Boolean(muted);
    if (!channel || channel.muted === nextMuted) return false;
    const beforeAudible = captureChannelAudibleStates();
    channel.muted = nextMuted;
    setDirtyWithoutHistory();

    // 싱글 모드가 켜져 있으면 실제 들리는 상태를 기준으로 재생 음원만 갱신합니다.
    refreshChannelPlaybackForAudibleStateChange(beforeAudible);

    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(i18nText(channel.muted ? "ui.mute_2" : "ui.unmute_2", [channel.name]));
    return true;
  }

  function setAllChannelsMuted(muted, { notify = true } = {}) {
    const nextMuted = Boolean(muted);
    const beforeAudible = captureChannelAudibleStates();
    let changed = false;
    for (const channel of state.channels) {
      if (channel.muted === nextMuted) continue;
      channel.muted = nextMuted;
      changed = true;
    }
    if (!changed) return false;
    setDirtyWithoutHistory();
    refreshChannelPlaybackForAudibleStateChange(beforeAudible);
    renderChannelTabs();
    renderChannelEditor();
    drawRoll();
    updateChannelInfo();
    if (notify) showToast(i18nText(nextMuted ? "channel.mute_all" : "channel.unmute_all"));
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
      channel.hue = getChannelHue(channel, index);
      channel.muted = Boolean(channel.muted);
      channel.visible = channel.visible !== false;
      channel.defaultNoteVolume = clamp(
        Math.round(Number(channel.defaultNoteVolume ?? CONFIG.defaultNewChannelNoteVolume) || CONFIG.defaultNewChannelNoteVolume),
        0,
        15,
      );
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

  function normalizeChannelMergeRole(value) {
    const role = String(value || "auto").toLowerCase();
    return ["auto", "high", "low"].includes(role) ? role : "auto";
  }

  function normalizeChannelMergeOverlapMode(value) {
    const mode = String(value || "all").toLowerCase();
    return ["all", "half", "none"].includes(mode) ? mode : "all";
  }

  function getCheckedChannelMergeIds() {
    if (!elements.channelMergeList) return [];
    return [...elements.channelMergeList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => String(input.value));
  }

  function getSelectedChannelMergeChannels() {
    const ids = new Set(getCheckedChannelMergeIds());
    return state.channels.filter((channel) => ids.has(String(channel.id)));
  }

  function updateChannelMergeOptionButtons() {
    const role = normalizeChannelMergeRole(state.channelMerge?.role);
    const overlapMode = normalizeChannelMergeOverlapMode(state.channelMerge?.overlapMode);
    elements.channelMergeRoleOptions?.querySelectorAll("[data-merge-role]").forEach((button) => {
      const active = button.dataset.mergeRole === role;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    elements.channelMergeOverlapOptions?.querySelectorAll("[data-merge-overlap]").forEach((button) => {
      const active = button.dataset.mergeOverlap === overlapMode;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function updateChannelMergeSummary() {
    const channels = getSelectedChannelMergeChannels();
    const noteCount = channels.reduce((sum, channel) => sum + (channel.notes?.length || 0), 0);
    const roleLabels = { auto: "자동", high: "고음", low: "저음" };
    const overlapLabels = { all: "모두", half: "절반", none: "안함" };
    const role = normalizeChannelMergeRole(state.channelMerge?.role);
    const overlapMode = normalizeChannelMergeOverlapMode(state.channelMerge?.overlapMode);
    if (elements.channelMergeSummary) {
      elements.channelMergeSummary.textContent = channels.length < 2
        ? "2개 이상의 채널을 선택하세요."
        : `${channels.length}개 채널 · ${noteCount}노트 · ${roleLabels[role]} / ${overlapLabels[overlapMode]}`;
    }
    if (elements.channelMergeApplyButton) {
      elements.channelMergeApplyButton.disabled = channels.length < 2 || noteCount < 1;
    }
  }

  function renderChannelMergeDialog() {
    if (!elements.channelMergeList) return false;
    elements.channelMergeList.replaceChildren();
    state.channels.forEach((channel, index) => {
      const row = document.createElement("label");
      row.className = "midi-transfer-channel-row channel-merge-row";
      row.style.setProperty("--channel-color", getChannelColor(channel, index));
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(channel.id);
      checkbox.checked = false;
      checkbox.setAttribute("aria-label", `${channel.name} 병합 선택`);
      const text = document.createElement("span");
      text.className = "midi-transfer-channel-name";
      text.textContent = `${channel.name} · ${channel.notes?.length || 0}노트`;
      row.append(checkbox, text);
      checkbox.addEventListener("change", updateChannelMergeSummary);
      elements.channelMergeList.append(row);
    });
    state.channelMerge.role = "high";
    state.channelMerge.overlapMode = "half";
    updateChannelMergeOptionButtons();
    updateChannelMergeSummary();
    return true;
  }

  function openChannelMergeDialog() {
    if (state.channels.length < 2) {
      showToast("병합할 채널이 2개 이상 필요합니다.");
      return false;
    }
    if (!renderChannelMergeDialog()) return false;
    elements.channelMergeBackdrop.hidden = false;
    requestAnimationFrame(() => elements.channelMergeList.querySelector('input[type="checkbox"]')?.focus());
    return true;
  }

  function closeChannelMergeDialog() {
    if (elements.channelMergeBackdrop) elements.channelMergeBackdrop.hidden = true;
  }

  function setAllChannelMergeChecked(checked) {
    if (!elements.channelMergeList) return;
    elements.channelMergeList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = Boolean(checked);
    });
    updateChannelMergeSummary();
  }

  function setChannelMergeRole(role) {
    state.channelMerge.role = normalizeChannelMergeRole(role);
    updateChannelMergeOptionButtons();
    updateChannelMergeSummary();
  }

  function setChannelMergeOverlapMode(mode) {
    state.channelMerge.overlapMode = normalizeChannelMergeOverlapMode(mode);
    updateChannelMergeOptionButtons();
    updateChannelMergeSummary();
  }

  function chooseChannelMergeNoteCandidate(group, role, previousPitch = null) {
    const notes = [...(group || [])];
    if (!notes.length) return null;
    const strength = (note) => getNotePlaybackVelocity(note);
    if (role === "high") {
      notes.sort((left, right) => right.pitch - left.pitch || strength(right) - strength(left) || right.durationBeat - left.durationBeat || left.sourceIndex - right.sourceIndex);
      return notes[0];
    }
    if (role === "low") {
      notes.sort((left, right) => left.pitch - right.pitch || strength(right) - strength(left) || right.durationBeat - left.durationBeat || left.sourceIndex - right.sourceIndex);
      return notes[0];
    }
    const sortedPitches = notes.map((note) => note.pitch).sort((a, b) => a - b);
    const middle = Math.floor(sortedPitches.length / 2);
    const medianPitch = sortedPitches.length % 2
      ? sortedPitches[middle]
      : (sortedPitches[middle - 1] + sortedPitches[middle]) * 0.5;
    const targetPitch = Number.isFinite(Number(previousPitch)) ? Number(previousPitch) : medianPitch;
    notes.sort((left, right) => (
      Math.abs(left.pitch - targetPitch) - Math.abs(right.pitch - targetPitch)
      || strength(right) - strength(left)
      || right.durationBeat - left.durationBeat
      || left.sourceIndex - right.sourceIndex
      || left.pitch - right.pitch
    ));
    return notes[0];
  }

  function mergeEditorChannelsToSingleVoice(channels, { role = "auto", overlapMode = "all" } = {}) {
    const normalizedRole = normalizeChannelMergeRole(role);
    const normalizedOverlapMode = normalizeChannelMergeOverlapMode(overlapMode);
    const exactNotes = new Map();
    (channels || []).forEach((channel, sourceIndex) => {
      (channel.notes || []).forEach((raw) => {
        const dynamics = normalizeNoteDynamics(raw);
        const startBeat = Math.max(0, Number(raw.startBeat) || 0);
        const durationBeat = Math.max(CONFIG.minimumNoteBeat, Number(raw.durationBeat) || CONFIG.minimumNoteBeat);
        const pitch = clamp(Math.round(Number(raw.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
        const candidate = {
          pitch,
          startBeat: Number(startBeat.toFixed(6)),
          durationBeat: Number(durationBeat.toFixed(6)),
          velocity: dynamics.velocity,
          volume: dynamics.volume,
          sourceIndex,
        };
        const endBeat = candidate.startBeat + candidate.durationBeat;
        const key = `${candidate.pitch}|${candidate.startBeat.toFixed(6)}|${endBeat.toFixed(6)}`;
        const current = exactNotes.get(key);
        if (!current || getNotePlaybackVelocity(candidate) > getNotePlaybackVelocity(current)) exactNotes.set(key, candidate);
      });
    });
    const notes = [...exactNotes.values()].sort((left, right) => (
      left.startBeat - right.startBeat
      || left.pitch - right.pitch
      || right.durationBeat - left.durationBeat
      || left.sourceIndex - right.sourceIndex
    ));
    if (!notes.length) return [];

    const startGroups = [];
    for (const note of notes) {
      const key = note.startBeat.toFixed(6);
      const last = startGroups[startGroups.length - 1];
      if (!last || last.key !== key) startGroups.push({ key, startBeat: note.startBeat, notes: [note] });
      else last.notes.push(note);
    }

    const output = [];
    let previousPitch = null;
    for (const group of startGroups) {
      const candidate = chooseChannelMergeNoteCandidate(group.notes, normalizedRole, previousPitch);
      if (!candidate) continue;
      const startBeat = candidate.startBeat;
      const active = output[output.length - 1];
      if (active) {
        const activeEnd = active.startBeat + active.durationBeat;
        if (startBeat < activeEnd - 1e-7) {
          if (normalizedOverlapMode === "none") continue;
          if (normalizedOverlapMode === "half") {
            const halfPoint = active.startBeat + active.durationBeat * 0.5;
            if (startBeat < halfPoint - 1e-7) continue;
          }
          const trimmedDuration = startBeat - active.startBeat;
          if (trimmedDuration >= CONFIG.minimumNoteBeat - 1e-7) {
            active.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, trimmedDuration).toFixed(6));
          } else {
            output.pop();
          }
        }
      }
      output.push({
        pitch: candidate.pitch,
        startBeat: candidate.startBeat,
        durationBeat: candidate.durationBeat,
        velocity: candidate.velocity,
        volume: candidate.volume,
      });
      previousPitch = candidate.pitch;
    }
    return output;
  }

  function applyChannelMergeSelection() {
    const channels = getSelectedChannelMergeChannels();
    if (channels.length < 2) return false;
    const mergedNotes = mergeEditorChannelsToSingleVoice(channels, state.channelMerge);
    if (!mergedNotes.length) {
      showToast("선택한 채널에서 병합할 노트를 찾지 못했습니다.");
      return false;
    }
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    const source = channels[0];
    channel.name = makeUniqueChannelName("병합 채널", channel.id);
    channel.hue = getChannelHue(source, state.channels.indexOf(source));
    channel.instrument = source?.instrument || channel.instrument;
    channel.instrumentProgram = getChannelInstrumentProgram(source);
    channel.instrumentBank = getChannelInstrumentBank(source);
    channel.instrumentExactPreset = getChannelInstrumentExactPreset(source);
    channel.notes = mergedNotes.map((note) => ({ ...note, id: state.nextNoteId++ }));
    channel.visible = true;
    channel.muted = false;
    state.channels.push(channel);
    state.activePanel = "notes";
    state.activeChannel = state.channels.length - 1;
    state.activeAudioClipId = null;
    clearNoteSelection();
    closeChannelMergeDialog();
    markDirty(i18nText("history.channel_merge_count", [channels.length]));
    renderChannelTabs();
    renderChannelEditor();
    shrinkTimelineToContent();
    drawRoll();
    showToast(`${channels.length}개 채널을 ${channel.name}으로 병합했습니다. (${channel.notes.length}노트)`);
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
        ? i18nText("channel.delete_summary_select")
        : remaining <= 0
          ? i18nText("channel.delete_summary_auto", [ids.length])
          : i18nText("channel.delete_summary_remaining", [ids.length, remaining]);
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
      checkbox.setAttribute("aria-label", i18nText("channel.delete_select_aria", [channel.name]));
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
    for (const channelId of ids) state.soloChannelIds.delete(String(channelId));
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
    markDirty(i18nText("history.channel_delete_count", [ids.size]));
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
    state.soloChannelIds.delete(String(channel.id));
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
      message: i18nText("channel.delete_confirm", [channel.name]),
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
    return Boolean(
      isRollInteractionDragActive()
      && state.interaction
      && ["create", "move-selection", "resize-note"].includes(state.interaction.type)
      && !(state.interaction.type === "move-selection" && state.interaction.verticalOnly),
    );
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

    const horizontalDragAllowed = !(
      state.interaction?.type === "move-selection"
      && state.interaction.verticalOnly
    );
    const delta = isRollInteractionDragActive() && horizontalDragAllowed
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

  function applyMarqueeSelectionMode(baseSelection, matchingIds, event = null, fallbackMode = "toggle") {
    // Keep the selection rule fixed for the whole gesture. This prevents notes
    // from being inverted merely because the drag rectangle passes over an
    // already-selected note.
    if (fallbackMode === "add") {
      const nextSelection = new Set(baseSelection);
      for (const id of matchingIds) nextSelection.add(id);
      return nextSelection;
    }
    if (fallbackMode === "replace") {
      const nextSelection = new Set();
      for (const id of matchingIds) nextSelection.add(id);
      return nextSelection;
    }

    // Legacy Select-tool drag without Shift remains XOR/toggle.
    const nextSelection = new Set(baseSelection);
    for (const id of matchingIds) {
      if (baseSelection.has(id)) nextSelection.delete(id);
      else nextSelection.add(id);
    }
    return nextSelection;
  }

  function updateMarqueeSelection(interaction, event = null) {
    const left = Math.min(interaction.startX, interaction.currentX);
    const right = Math.max(interaction.startX, interaction.currentX);
    const top = Math.min(interaction.startY, interaction.currentY);
    const bottom = Math.max(interaction.startY, interaction.currentY);
    const matchingIds = [];
    for (const note of getActiveChannel().notes) {
      if (noteIntersectsBox(note, left, top, right, bottom)) matchingIds.push(note.id);
    }
    state.selectedNoteIds = applyMarqueeSelectionMode(
      interaction.baseSelection,
      matchingIds,
      event,
      interaction.initialSelectionMode,
    );
  }

  function beginMarqueeSelection(event, point, options = {}) {
    const initialSelectionMode = options.initialSelectionMode || "toggle";
    state.interaction = {
      type: "marquee",
      pointerId: event.pointerId,
      pointerButton: event.button,
      startX: Math.max(point.x, beatToX(0)),
      startY: point.y,
      currentX: Math.max(point.x, beatToX(0)),
      currentY: point.y,
      baseSelection: new Set(state.selectedNoteIds),
      initialSelectionMode,
      tapToggleNoteId: options.tapToggleNoteId ?? null,
      preserveSelectionOnTap: Boolean(options.preserveSelectionOnTap),
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

  function updateMidiMarqueeSelection(interaction, event = null) {
    const left = Math.min(interaction.startX, interaction.currentX);
    const right = Math.max(interaction.startX, interaction.currentX);
    const top = Math.min(interaction.startY, interaction.currentY);
    const bottom = Math.max(interaction.startY, interaction.currentY);
    const activeGroup = getMidiGroupById(interaction.groupId);
    const matchingKeys = [];
    if (activeGroup && activeGroup.visible !== false && getActiveMidiDocument()?.visible !== false) {
      const startBeat = Math.max(0, xToBeat(left) - CONFIG.minimumNoteBeat);
      const endBeat = Math.max(startBeat, xToBeat(right) + CONFIG.minimumNoteBeat);
      for (const [groupIndex, noteIndex] of getVisibleMidiNoteRefs(startBeat, endBeat)) {
        const group = state.midiReference.groups[groupIndex];
        if (!group || String(group.id) !== String(activeGroup.id)) continue;
        const note = group.notes[noteIndex];
        if (note && noteRefIntersectsBox(note, left, top, right, bottom)) {
          matchingKeys.push(midiSelectionKey(activeGroup.id, note.id));
        }
      }
    }
    state.midiSelectedNoteKeys = applyMarqueeSelectionMode(
      interaction.baseSelection,
      matchingKeys,
      event,
      interaction.initialSelectionMode,
    );
  }

  function handleMidiRollPointerDown(event) {
    const point = pointerToRoll(event);
    const effectiveEditTool = getEffectiveEditTool(event);
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
        const initialSelectionMode = event.ctrlKey || event.metaKey ? "add" : "replace";
        state.interaction = {
          type: "midi-marquee",
          pointerId: event.pointerId,
          pointerButton: event.button,
          groupId: state.midiReference.activeGroupId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          baseSelection: new Set(state.midiSelectedNoteKeys),
          initialSelectionMode,
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
      } else if (event.ctrlKey || event.metaKey) {
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
      if (beat >= 0 && effectiveEditTool === "select" && activeGroup) {
        const initialSelectionMode = event.ctrlKey || event.metaKey ? "add" : "replace";
        state.interaction = {
          type: "midi-marquee",
          pointerId: event.pointerId,
          pointerButton: event.button,
          groupId: activeGroup.id,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          baseSelection: new Set(state.midiSelectedNoteKeys),
          initialSelectionMode,
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

    // When a note context menu is open, the first left click on the piano-roll
    // is only a dismissal gesture. Do not let that same click create, move,
    // resize, seek, or alter note selection.
    if (event.button === 0 && elements.contextMenu && !elements.contextMenu.hidden) {
      closeContextMenu();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.button === 2 && isCancelableNoteInteraction()) {
      cancelCurrentNoteInteraction();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    elements.rollViewport.focus();
    if (Boolean(event.ctrlKey) !== Boolean(state.ctrlToolHeld)) {
      state.ctrlToolHeld = Boolean(event.ctrlKey);
      updateEditToolControls();
    }
    const effectiveEditTool = getEffectiveEditTool(event);
    if (isMidiReferenceActive()) {
      handleMidiRollPointerDown(event);
      return;
    }
    if (state.activePanel === "audio") {
      // 피아노롤에서 작업을 시작하면 오디오 선택을 해제하고 노트 편집으로 즉시 전환합니다.
      // 두 종류가 동시에 선택된 채 남아 노트 편집이 잠기는 상태를 만들지 않습니다.
      state.activePanel = "notes";
      state.activeAudioClipId = null;
      clearMidiSelection();
      renderChannelTabs();
      renderChannelEditor();
      renderAudioLane();
    }
    if (state.activePanel === "none") {
      const point = pointerToRoll(event);
      const beat = xToBeat(point.x);
      if (event.button === 0 && effectiveEditTool === "select") {
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
    const additive = event.ctrlKey || event.metaKey;
    const touchSelectionMode = effectiveEditTool === "select" && event.button === 0;

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

    // A selected note can be double-clicked to edit the volume of the whole current selection.
    // Select mode normally toggles a note on the first tap, so preserve the first-click selection
    // and restore it on the second click before opening the volume dialog.
    if (event.button === 0 && existing && !additive) {
      const tracker = state.noteVolumeDoubleClick;
      const now = performance.now();
      const isSecondClick = tracker.noteId === existing.id
        && now - tracker.lastClickAt <= 420
        && tracker.selectedIds instanceof Set
        && tracker.selectedIds.has(existing.id);
      if (isSecondClick) {
        state.selectedNoteIds = new Set(tracker.selectedIds);
        tracker.noteId = null;
        tracker.lastClickAt = 0;
        tracker.selectedIds = new Set();
        state.activePanel = "notes";
        state.activeAudioClipId = null;
        state.interaction = null;
        state.suppressNextRollPointerUp = event.pointerId;
        endEditorPitchPreview();
        drawRoll();
        updateChannelInfo();
        openNoteVolumeDialog();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (state.selectedNoteIds.has(existing.id)) {
        tracker.noteId = existing.id;
        tracker.lastClickAt = now;
        tracker.selectedIds = new Set(state.selectedNoteIds);
      } else if (tracker.noteId !== existing.id || now - tracker.lastClickAt > 420) {
        tracker.noteId = null;
        tracker.lastClickAt = 0;
        tracker.selectedIds = new Set();
      }
    }

    if (getActiveChannel()?.visible === false && event.button === 0 && pointBeat >= 0 && !existing) {
      showToast("숨긴 채널은 표시 버튼을 켠 뒤 편집할 수 있습니다.");
      event.preventDefault();
      return;
    }

    // 노트 도구에서는 오른쪽 드래그를 언제나 새 범위 선택으로 시작합니다.
    // Shift+오른쪽 드래그는 기존 선택을 유지한 채 범위 안의 노트를 추가합니다.
    // 단순 우클릭(드래그 없음)은 기존 선택을 보존해 컨텍스트 메뉴 동작을 유지합니다.
    if (event.button === 2) {
      if (pointBeat >= 0 && effectiveEditTool !== "select") {
        beginMarqueeSelection(event, point, {
          initialSelectionMode: event.shiftKey ? "add" : "replace",
          preserveSelectionOnTap: true,
        });
        startRollDragAutoScroll(event.clientX, event.clientY);
        return;
      }
      if (existing) {
        if (!state.selectedNoteIds.has(existing.id)) {
          selectOnlyNote(existing.id);
          drawRoll();
          updateChannelInfo();
        }
      } else if (pointBeat >= 0) {
        beginMarqueeSelection(event, point, {
          initialSelectionMode: event.shiftKey ? "add" : "toggle",
          preserveSelectionOnTap: true,
        });
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

      // In Select mode, a normal body drag keeps the existing XOR marquee behavior.
      // Shift + dragging the note body is shared with Note mode: it moves the
      // selected notes vertically (pitch only) while keeping their time positions fixed.
      if (touchSelectionMode && noteHit.part === "body" && !event.shiftKey) {
        beginMarqueeSelection(event, point, {
          initialSelectionMode: "toggle",
          tapToggleNoteId: existing.id,
        });
      } else {
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
        const selectedForResize = getSelectedNotes();
        const multiResize = Boolean(
          event.shiftKey
          && selectedForResize.length > 1
          && state.selectedNoteIds.has(existing.id)
        );
        const resizeIgnoredIds = multiResize
          ? new Set(selectedForResize.map((note) => note.id))
          : new Set([existing.id]);
        state.interaction = {
          type: "resize-note",
          pointerId: event.pointerId,
          pointerButton: event.button,
          edge: noteHit.part === "left-resize" ? "left" : "right",
          note: existing,
          startX: point.x,
          moved: false,
          snapUnit,
          multiResize,
          resizeOriginals: multiResize
            ? buildIndependentResizeOriginals(getActiveChannel(), selectedForResize)
            : null,
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
              resizeIgnoredIds,
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
          lastValidResizeDeltaBeat: 0,
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
          verticalOnly: Boolean(event.shiftKey),
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
      }
    } else if (pointBeat >= 0) {
      if (effectiveEditTool === "select") {
        beginMarqueeSelection(event, point, {
          initialSelectionMode: event.shiftKey ? "add" : "toggle",
        });
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
          : getEffectiveEditTool() === "select" ? "default" : "crosshair";
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
        updateMidiMarqueeSelection(state.interaction, event);
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
        updateMarqueeSelection(state.interaction, event);
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

      if (interaction.multiResize && Array.isArray(interaction.resizeOriginals)) {
        const anchorOriginalEdgeBeat = interaction.edge === "left"
          ? interaction.originalStartBeat
          : interaction.originalEndBeat;
        const requestedDeltaBeat = snappedEdgeBeat - anchorOriginalEdgeBeat;
        let groupChanged = false;

        for (const original of interaction.resizeOriginals) {
          let nextStartBeat = original.startBeat;
          let nextEndBeat = original.endBeat;
          if (interaction.edge === "left") {
            nextStartBeat = clamp(
              original.startBeat + requestedDeltaBeat,
              original.minStartBeat,
              original.maxStartBeat,
            );
          } else {
            const maximumEndBeat = Number.isFinite(original.maxEndBeat)
              ? Math.min(getTotalBeats(), original.maxEndBeat)
              : getTotalBeats();
            nextEndBeat = clamp(
              original.endBeat + requestedDeltaBeat,
              original.minEndBeat,
              maximumEndBeat,
            );
          }
          const nextDurationBeat = Math.max(
            CONFIG.minimumNoteBeat,
            nextEndBeat - nextStartBeat,
          );
          original.note.startBeat = Number(nextStartBeat.toFixed(6));
          original.note.durationBeat = Number(nextDurationBeat.toFixed(6));
          groupChanged = groupChanged
            || Math.abs(original.note.startBeat - original.startBeat) > 1e-7
            || Math.abs(original.note.durationBeat - original.durationBeat) > 1e-7;
        }

        interaction.lastValidResizeDeltaBeat = requestedDeltaBeat;
        interaction.moved = interaction.moved || groupChanged;
      } else {
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
      }
      if (interaction.moved) {
        invalidateOverviewTimelineActivity();
        drawOverviewTimeline();
      }
      elements.rollCanvas.style.cursor = "ew-resize";
    } else if (state.interaction.type === "move-selection") {
      const interaction = state.interaction;
      const pixelDistance = Math.hypot(point.x - interaction.startX, point.y - interaction.startY);
      if (!interaction.dragStarted && pixelDistance < 3) {
        return;
      }
      interaction.dragStarted = true;

      let deltaBeat = 0;
      if (!interaction.verticalOnly) {
        const rawAnchorBeat = xToBeat(point.x) - interaction.pointerBeatOffset;
        const rawRequestedDeltaBeat = rawAnchorBeat - interaction.anchorOriginalStartBeat;
        const magneticDeltaBeat = snapMoveDeltaDirectionally(rawRequestedDeltaBeat, interaction);
        const snappedAnchorBeat = snapBeat(rawAnchorBeat);
        const requestedDeltaBeat = magneticDeltaBeat == null
          ? snappedAnchorBeat - interaction.anchorOriginalStartBeat
          : magneticDeltaBeat;
        deltaBeat = clamp(
          requestedDeltaBeat,
          -interaction.minStartBeat,
          getTotalBeats() - interaction.maxEndBeat,
        );
      }
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
      if (interaction.moved && Math.abs(appliedDeltaBeat) > 1e-7) {
        invalidateOverviewTimelineActivity();
        drawOverviewTimeline();
      }
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
      const channel = getActiveChannel();
      const defaultVolume = clamp(
        Math.round(Number(channel?.defaultNoteVolume ?? CONFIG.defaultNewChannelNoteVolume) || CONFIG.defaultNewChannelNoteVolume),
        0,
        15,
      );
      const note = {
        id: state.nextNoteId++,
        pitch: draft.pitch,
        startBeat: Number(draft.startBeat.toFixed(6)),
        durationBeat: Number(draft.durationBeat.toFixed(6)),
        velocity: mmlVolumeToVelocity(defaultVolume),
        volume: defaultVolume,
      };
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
        ? interaction.multiResize
          ? new Set((interaction.resizeOriginals || []).map((original) => original.note.id))
          : new Set([interaction.note.id])
        : new Set((interaction.originals || []).map((original) => original.note.id));
      if (interaction.type === "resize-note" && interaction.multiResize) {
        // Group Shift-resize already clamps every note against its own neighbours,
        // so do not apply the normal overwrite cleanup to surrounding notes.
        state.channelNoteRuntime.delete(String(channel.id));
      } else {
        resolveDirectEditOverlaps(channel, editedIds);
      }
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
      if (interaction.preserveSelectionOnTap) {
        state.selectedNoteIds = new Set(interaction.baseSelection);
      } else if (interaction.tapToggleNoteId != null) {
        state.selectedNoteIds = new Set(interaction.baseSelection);
        if (interaction.initialSelectionMode === "add") {
          state.selectedNoteIds.add(interaction.tapToggleNoteId);
        } else if (interaction.baseSelection.has(interaction.tapToggleNoteId)) {
          state.selectedNoteIds.delete(interaction.tapToggleNoteId);
        } else {
          state.selectedNoteIds.add(interaction.tapToggleNoteId);
        }
      } else if (interaction.initialSelectionMode === "add") {
        state.selectedNoteIds = new Set(interaction.baseSelection);
      } else {
        clearNoteSelection();
      }
      closeContextMenu();
    }

    state.interaction = null;
    elements.rollCanvas.style.cursor = isMidiReferenceActive() || getEffectiveEditTool() === "select" ? "default" : "crosshair";
    try {
      elements.rollCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    shrinkTimelineToContent();
    drawRoll();
    drawOverviewTimeline();
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

  const MABIICCO_TPQN = 96;
  const MABIICCO_PART_ROLES = ["Melody", "Chord 1", "Chord 2", "Song"];

  function extractMabiIccoScoreSection(text) {
    const source = String(text || "");
    const header = /^\s*\[mml-score\]\s*$/im.exec(source);
    if (!header) return source;
    const start = header.index + header[0].length;
    const nextHeader = /^\s*\[[^\]]+\]\s*$/gim;
    nextHeader.lastIndex = start;
    const next = nextHeader.exec(source);
    return source.slice(start, next ? next.index : source.length);
  }

  function readMabiIccoLineValue(block, key) {
    const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\r?\\n)\\s*${escaped}\\s*=\\s*([^\\r\\n]*)`, "i").exec(String(block || ""));
    return match ? String(match[1] || "").trim() : "";
  }

  function readMabiIccoInteger(block, key, fallback = 0) {
    const raw = readMabiIccoLineValue(block, key);
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function readMabiIccoBoolean(block, key, fallback = true) {
    const raw = readMabiIccoLineValue(block, key).toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  }

  function extractMabiIccoGlobalTempoEvents(scoreSection) {
    const raw = readMabiIccoLineValue(scoreSection, "tempo");
    if (!raw) return [];
    const events = [];
    for (const item of raw.split(",")) {
      const match = /^\s*(-?\d+)\s*T\s*(\d+)\s*$/i.exec(item);
      if (!match) continue;
      const tick = Math.max(0, Number(match[1]) || 0);
      const bpm = clamp(Math.round(Number(match[2]) || 120), CONFIG.minTempo, CONFIG.maxTempo);
      events.push({
        beat: tick / MABIICCO_TPQN,
        bpm,
        partIndex: -1,
        order: events.length,
      });
    }
    return events.sort((left, right) => left.beat - right.beat || left.order - right.order);
  }

  function looksLikeMabiIccoPart(value) {
    const source = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(value));
    if (!source) return false;
    try {
      const parsed = parseMmlPart(source, 0);
      return Boolean(parsed.notes.length || parsed.tempos.length || /r/i.test(source));
    } catch {
      return false;
    }
  }

  function extractStructuredMabiIccoTrackCandidates(text) {
    const scoreSection = extractMabiIccoScoreSection(text);
    const trackPattern = /(?:^|\r?\n)\s*mml-track\s*=\s*(MML\s*@[\s\S]*?;)\s*(?=\r?\n|$)/gi;
    const matches = [];
    let match;
    while ((match = trackPattern.exec(scoreSection))) {
      matches.push({
        index: match.index,
        end: trackPattern.lastIndex,
        mml: String(match[1] || ""),
      });
    }
    if (!matches.length) return [];

    const globalTempoEvents = extractMabiIccoGlobalTempoEvents(scoreSection);
    const candidates = [];
    let commonStartOffset = 0;
    let previousTrackEnd = 0;

    matches.forEach((trackMatch, trackIndex) => {
      const prelude = scoreSection.slice(previousTrackEnd, trackMatch.index);
      const startOffsetMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startOffset\s*=\s*(-?\d+)/gi)];
      if (startOffsetMatches.length) {
        commonStartOffset = Math.max(0, Number(startOffsetMatches[startOffsetMatches.length - 1][1]) || 0);
      }
      const startDeltaMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startDelta\s*=\s*(-?\d+)/gi)];
      const startSongDeltaMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startSongDelta\s*=\s*(-?\d+)/gi)];
      const startDelta = startDeltaMatches.length ? Number(startDeltaMatches[startDeltaMatches.length - 1][1]) || 0 : 0;
      const startSongDelta = startSongDeltaMatches.length ? Number(startSongDeltaMatches[startSongDeltaMatches.length - 1][1]) || 0 : 0;

      const nextTrackIndex = matches[trackIndex + 1]?.index ?? scoreSection.length;
      const propertyBlock = scoreSection.slice(trackMatch.end, nextTrackIndex);
      const trackNumber = trackIndex + 1;
      const trackName = cleanupMmiNameValue(readMabiIccoLineValue(propertyBlock, "name"));
      const program = readMabiIccoInteger(propertyBlock, "program", 0);
      const songProgram = readMabiIccoInteger(propertyBlock, "songProgram", -1);
      const panpot = clamp(readMabiIccoInteger(propertyBlock, "panpot", 64), 0, 127);
      const rawVolume = readMabiIccoLineValue(propertyBlock, "volume") || readMabiIccoLineValue(propertyBlock, "volumn");
      const parsedVolume = Number.parseInt(rawVolume, 10);
      const volume = clamp(Number.isFinite(parsedVolume) ? parsedVolume : 100, 0, 127);
      const visible = readMabiIccoBoolean(propertyBlock, "visible", true);
      const mmlBody = cleanupMmiMmlValue(trackMatch.mml);
      const parts = mmlBody.split(",");

      for (let partIndex = 0; partIndex < Math.max(4, parts.length); partIndex += 1) {
        const cleaned = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(parts[partIndex] || ""));
        if (!cleaned || !looksLikeMabiIccoPart(cleaned)) continue;
        const role = MABIICCO_PART_ROLES[partIndex] || `Part ${partIndex + 1}`;
        const displayTrackName = trackName || `Track ${trackNumber}`;
        const partProgram = partIndex === 3 && songProgram >= 0 ? songProgram : program;
        const startTick = Math.max(0, commonStartOffset + (partIndex === 3 ? startSongDelta : startDelta));
        candidates.push({
          channelNumber: candidates.length + 1,
          label: `${displayTrackName} · ${role}`,
          name: `${displayTrackName} · ${role}`,
          value: cleaned,
          mmiTrackNumber: trackNumber,
          mmiTrackName: trackName,
          mmiPartIndex: partIndex,
          mmiPartRole: role,
          mmiProgram: program,
          mmiSongProgram: songProgram,
          mmiPartProgram: partProgram,
          mmiPanpot: panpot,
          mmiVolume: volume,
          mmiVisible: visible,
          mmiStartTick: startTick,
          mmiGlobalTempoEvents: globalTempoEvents,
        });
      }
      previousTrackEnd = trackMatch.end;
    });

    return candidates;
  }

  function extractMabiIccoMmlPartCandidates(text) {
    const source = String(text || "");
    const structured = extractStructuredMabiIccoTrackCandidates(source);
    if (structured.length) return structured;

    // Legacy/non-standard MMI fallback: keep broad compatibility, but do not impose a channel limit.
    const nameMarkers = extractMmiNameMarkers(source);
    const found = [];
    const seen = new Set();
    const addCandidate = (rawValue, position = 0) => {
      const cleaned = cleanupMmiMmlValue(rawValue);
      if (!cleaned) return;
      const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
      for (const part of parts) {
        const candidate = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(part));
        if (!candidate || !looksLikeMabiIccoPart(candidate)) continue;
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          position,
          value: candidate,
          name: findMmiNameForCandidate(position, nameMarkers, found.length),
        });
      }
    };

    const fullPattern = /MML\s*@([\s\S]*?)\s*;/gi;
    let match;
    while ((match = fullPattern.exec(source))) addCandidate(match[1] || "", match.index);
    if (!found.length) {
      const keyedPattern = /(?:^|[\s<{,;])(?:[A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\r\n<>]+))/gim;
      while ((match = keyedPattern.exec(source))) addCandidate(match[1] ?? match[2] ?? match[3] ?? "", match.index);
      const directMmlTagPattern = /<([A-Za-z0-9_:-]*mml[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
      while ((match = directMmlTagPattern.exec(source))) addCandidate(match[2] || "", match.index);
      const taggedPattern = /<([A-Za-z0-9_:-]*(?:melody|chord|song|part|track)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
      while ((match = taggedPattern.exec(source))) addCandidate(match[2] || "", match.index);
    }

    found.sort((left, right) => left.position - right.position);
    return found.map((candidate, index) => ({
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
    }
    const tempo = extractThreeMleGlobalTempo(source);
    if (!tempo) return candidates;
    return candidates.map((candidate) => ({
      ...candidate,
      value: /^t\s*\d+/i.test(candidate.value) ? candidate.value : `${tempo}${candidate.value}`,
    }));
  }

  function extractGenericMmlPartCandidates(text) {
    const body = extractMmlBody(text);
    return body.split(",")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value, index) => ({
        channelNumber: index + 1,
        label: `채널 ${index + 1}`,
        name: `채널 ${index + 1}`,
        value,
      }));
  }

  function parseMmlCandidateParts(candidates, quantize = 64) {
    const sourceCandidates = candidates || [];
    const parsedParts = sourceCandidates.map((candidate, partIndex) => {
      const parsed = parseMmlPart(candidate.value, partIndex);
      const startOffsetBeat = Math.max(0, Number(candidate.mmiStartTick) || 0) / MABIICCO_TPQN;
      if (startOffsetBeat > 0) {
        parsed.notes = parsed.notes.map((note) => ({ ...note, startBeat: note.startBeat + startOffsetBeat }));
        parsed.tempos = parsed.tempos.map((tempo) => ({ ...tempo, beat: tempo.beat + startOffsetBeat }));
        parsed.durationBeat += startOffsetBeat;
      }
      return {
        ...parsed,
        ...candidate,
        importName: candidate.name || candidate.label || `3MLE ${partIndex + 1}`,
      };
    });
    const noteParts = parsedParts.map((part) => ({
      ...part,
      notes: quantizeMmlPartNotes(part.notes, quantize),
    })).filter((part) => part.notes.length);
    const mmiGlobalTempoEvents = sourceCandidates.find((candidate) => Array.isArray(candidate.mmiGlobalTempoEvents) && candidate.mmiGlobalTempoEvents.length)?.mmiGlobalTempoEvents || [];
    const explicitTempoCount = mmiGlobalTempoEvents.length
      ? mmiGlobalTempoEvents.length
      : parsedParts.reduce((count, part) => count + part.tempos.length, 0);
    const tempos = mmiGlobalTempoEvents.length
      ? quantizeMmlTempoEvents([{ tempos: mmiGlobalTempoEvents }], quantize)
      : quantizeMmlTempoEvents(parsedParts, quantize);
    const noteCount = noteParts.reduce((count, part) => count + part.notes.length, 0);
    const endBeat = Math.max(
      0,
      ...noteParts.flatMap((part) => part.notes.map((note) => note.startBeat + note.durationBeat)),
      ...tempos.map((tempo) => tempo.beat),
    );
    return {
      quantize: Number(quantize) === 32 ? 32 : 64,
      rawPartCount: sourceCandidates.length,
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
      state.mmlImport.selectedCandidateIndexes = new Set(candidates.map((_, index) => index));
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
    elements.mmlImportDialog?.classList.toggle("has-channel-selection", isSelectableProject);
    elements.mmlImportChannelList.replaceChildren();
    if (!isSelectableProject) return;
    const selectedCount = state.mmlImport.selectedCandidateIndexes.size;
    const formatLabel = state.mmlImport.format === "mmi" ? "MabiIcco" : "3MLE";
    elements.mmlImportChannelTitle.textContent = `${formatLabel} 채널 선택 (${selectedCount}/${state.mmlImport.candidates.length})`;
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
      if (state.mmlImport.format === "mmi" && Number.isFinite(Number(candidate.mmiTrackNumber))) {
        const details = [
          `${candidate.value.length}자`,
          `Track ${candidate.mmiTrackNumber}`,
          candidate.mmiPartRole || "",
          Number.isFinite(Number(candidate.mmiPartProgram)) ? `Program ${candidate.mmiPartProgram}` : "",
          Number.isFinite(Number(candidate.mmiVolume)) ? `Volume ${candidate.mmiVolume}` : "",
          Number.isFinite(Number(candidate.mmiPanpot)) ? `Pan ${candidate.mmiPanpot}` : "",
        ].filter(Boolean);
        meta.textContent = details.join(" · ");
      } else {
        meta.textContent = `${candidate.value.length}자`;
      }
      const preview = document.createElement("code");
      preview.textContent = candidate.value.length > 120 ? `${candidate.value.slice(0, 120)}…` : candidate.value;
      main.append(title, meta);
      row.append(checkbox, main, preview);
      checkbox.addEventListener("change", () => {
        const next = new Set(state.mmlImport.selectedCandidateIndexes);
        if (checkbox.checked) {
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
    normalizeMmlImportTextareaCase();
    const source = elements.mmlImportText?.value || "";
    if (!source.trim()) {
      state.mmlImport.parsed = null;
      state.mmlImport.format = "mml";
      state.mmlImport.candidates = [];
      state.mmlImport.selectedCandidateIndexes = new Set();
      renderMmlImportChannelList();
      elements.mmlImportApplyButton.disabled = true;
      elements.mmlImportApplyTempo.disabled = true;
      setMmlImportStatus("3MLE, MabiIcco 또는 MML 내용을 입력하면 채널·노트·템포 정보를 확인합니다.");
      return null;
    }
    try {
      const parsed = analyzeMmlImportSource(source);
      state.mmlImport.parsed = parsed;
      renderMmlImportChannelList();
      const details = [
        state.mmlImport.format === "mml" ? `MML 음성 ${parsed.noteParts.length}개` : `${state.mmlImport.format === "mmi" ? "MabiIcco" : "3MLE"} 선택 ${state.mmlImport.selectedCandidateIndexes.size}개`,
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
        state.mmlImport.parsed = null;
        state.mmlImport.format = "mml";
        state.mmlImport.candidates = [];
        state.mmlImport.selectedCandidateIndexes = new Set();
        state.mmlImport.candidateSignature = "";
        elements.mmlImportSourceLabel.textContent = file.name || "3MLE / MabiIcco / MML 파일";
        elements.mmlImportText.value = text;
        updateMmlImportPreview();
        elements.mmlImportText.focus();
      }
      return true;
    } catch (error) {
      console.error(error);
      showToast("3MLE, MabiIcco 또는 MML 파일을 읽지 못했습니다.");
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
      elements.mmlImportSourceLabel.textContent = "클립보드 3MLE / MabiIcco / MML";
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

  function isClipboardMmlCode(value) {
    const text = String(value || "").replace(/^\uFEFF/, "").trim();
    if (!text) return false;
    try {
      if (/MML\s*@/i.test(text)) {
        const parsed = parseMmlText(text, { quantize: 64 });
        return Boolean(parsed?.noteCount || parsed?.explicitTempoCount);
      }
      const body = extractMmlBody(text);
      const parts = body.split(",").map((part) => String(part || "").trim()).filter(Boolean);
      return Boolean(parts.length && parts.every((part) => looksLikeMmlPart(part)));
    } catch {
      return false;
    }
  }

  async function pasteMmlFromClipboardShortcut() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("clipboard unavailable");
      const text = await navigator.clipboard.readText();
      if (!isClipboardMmlCode(text)) {
        showToast("클립보드에서 MML 코드를 찾지 못했습니다.");
        return false;
      }
      openMmlImportDialog({ text, fileName: "" });
      if (elements.mmlImportSourceLabel) elements.mmlImportSourceLabel.textContent = "클립보드 MML";
      return true;
    } catch {
      showToast("클립보드를 읽을 수 없습니다. MML 불러오기 창에서 직접 붙여넣으세요.");
      return false;
    }
  }

  function createImportedChannel(part, partNumber) {
    const id = nextChannelId();
    const channel = createDefaultChannel(id, state.channels.length);
    const requestedName = String(part.importName || "").trim() || `${getMmlImportBaseName()} ${partNumber}`;
    channel.name = makeUniqueChannelName(requestedName, channel.id);
    channel.notes = part.notes.map((note) => ({ ...note, id: state.nextNoteId++ }));
    if (Number.isFinite(Number(part.mmiTrackNumber))) {
      channel.hue = getDefaultHue(Math.max(0, Number(part.mmiTrackNumber) - 1));
      channel.visible = part.mmiVisible !== false;
    } else {
      channel.visible = true;
    }
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
    const importLabel = format === "mmi" ? "MabiIcco" : format === "3mle" ? "3MLE" : "MML";
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

  function buildNoteVoiceMml(notes, originBeat, { applyTimelineFade = true } = {}) {
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
      const nextVelocity = applyTimelineFade
        ? getTimelineFadedNoteVolume(note, Number.isFinite(Number(note.fadeReferenceBeat)) ? Number(note.fadeReferenceBeat) : startBeat)
        : normalizeNoteDynamics(note, 8).volume;
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
    return normalizeMmlTextCase(`MML@${voices.join(",")};`);
  }

  const NOTE_CLIPBOARD_FORMAT = "mobibard-note-clipboard";
  const NOTE_CLIPBOARD_STORAGE_KEY = "mobibard.editor.note-clipboard.v1";
  let suppressNativeNoteClipboardEvent = false;

  function copyTextWithLegacyCommand(value) {
    const previousFocus = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    let copied = false;
    suppressNativeNoteClipboardEvent = true;
    try {
      copied = document.execCommand("copy");
    } catch {} finally {
      suppressNativeNoteClipboardEvent = false;
      textarea.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        try { previousFocus.focus({ preventScroll: true }); } catch {}
      }
    }
    return copied;
  }

  async function writeTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return false;

    // execCommand is deprecated, but it still provides the most compatible synchronous
    // fallback for user-triggered copy actions on browsers/pages where the async Clipboard
    // API is unavailable or permission-gated. Try it while the user gesture is still active.
    if (copyTextWithLegacyCommand(value)) return true;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}
    return false;
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

  function parseNodeClipboardText(text) {
    try {
      const payload = JSON.parse(String(text || ""));
      return isValidNodeClipboardPayload(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  function persistNodeClipboardPayload(payload) {
    if (!isValidNodeClipboardPayload(payload)) return false;
    try {
      window.localStorage.setItem(NOTE_CLIPBOARD_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function readNodeClipboardFromSharedStorage() {
    try {
      return parseNodeClipboardText(window.localStorage.getItem(NOTE_CLIPBOARD_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function rememberNodeClipboardPayload(payload, { persist = true, render = true } = {}) {
    if (!isValidNodeClipboardPayload(payload)) return false;
    state.noteClipboard = payload;
    if (persist) persistNodeClipboardPayload(payload);
    if (render) {
      updateEditMenuState();
      renderChannelTabs();
    }
    return true;
  }

  function writeNodeClipboardToEvent(event, payload) {
    if (!event?.clipboardData || !isValidNodeClipboardPayload(payload)) return false;
    try {
      event.clipboardData.setData("text/plain", JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  async function copyNotesToNodeClipboard(notes, options = {}) {
    const payload = createNodeClipboardPayload(notes, options);
    if (!payload) {
      showToast(`복사할 ${options.label || "노트"}가 없습니다.`);
      return false;
    }
    rememberNodeClipboardPayload(payload);
    // 메뉴/버튼에서 실행된 복사도 OS 공용 클립보드에 기록을 시도합니다.
    // Ctrl/Cmd+C는 아래 ClipboardEvent 경로가 직접 clipboardData에 기록하므로
    // 브라우저 간 복사에서도 navigator.clipboard 권한에 덜 의존합니다.
    void writeTextToClipboard(JSON.stringify(payload));
    showToast(`${payload.label}을 복사했습니다.`);
    return true;
  }

  async function readNodeClipboardFromSystem() {
    try {
      if (!navigator.clipboard?.readText) return { readable: false, payload: null };
      const text = await navigator.clipboard.readText();
      return { readable: true, payload: parseNodeClipboardText(text) };
    } catch {
      return { readable: false, payload: null };
    }
  }

  async function getNodeClipboardPayload() {
    // 시스템 클립보드가 읽히는 환경에서는 항상 최신 OS 클립보드를 우선합니다.
    // 예전에는 state.noteClipboard를 먼저 사용해서 한 번 붙여넣은 뒤 다른 창에서
    // 새 노트를 복사해도 최초 복사본이 계속 붙는 문제가 있었습니다.
    const systemClipboard = await readNodeClipboardFromSystem();
    if (systemClipboard.readable) {
      if (systemClipboard.payload) rememberNodeClipboardPayload(systemClipboard.payload);
      return systemClipboard.payload;
    }

    // Clipboard API 읽기 권한이 없는 경우에는 같은 브라우저/같은 origin의 다른
    // 창에서 갱신되는 localStorage 공유본을 다음 우선순위로 사용합니다.
    const shared = readNodeClipboardFromSharedStorage();
    if (isValidNodeClipboardPayload(shared)) {
      const sharedTime = Number(shared.copiedAt) || 0;
      const localTime = Number(state.noteClipboard?.copiedAt) || 0;
      if (!isValidNodeClipboardPayload(state.noteClipboard) || sharedTime >= localTime) {
        rememberNodeClipboardPayload(shared, { persist: false });
        return shared;
      }
    }

    return isValidNodeClipboardPayload(state.noteClipboard) ? state.noteClipboard : null;
  }

  async function pasteNotesFromClipboard(payloadOverride = null) {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭은 읽기 전용입니다. 일반 채널을 선택한 뒤 붙여넣으세요.");
      return false;
    }
    const payload = isValidNodeClipboardPayload(payloadOverride)
      ? payloadOverride
      : await getNodeClipboardPayload();
    if (!payload) {
      showToast("붙여넣을 노트 정보가 없습니다.");
      return false;
    }
    if (payloadOverride) rememberNodeClipboardPayload(payload, { persist: true });
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

  async function insertPasteNotesFromClipboard(payloadOverride = null) {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭은 읽기 전용입니다. 일반 채널을 선택한 뒤 삽입하세요.");
      return false;
    }
    const payload = isValidNodeClipboardPayload(payloadOverride)
      ? payloadOverride
      : await getNodeClipboardPayload();
    if (!payload) {
      showToast("삽입할 노트 정보가 없습니다.");
      return false;
    }
    const channel = getActiveChannel();
    const targetOrigin = clamp(snapBeat(state.playhead.beat), 0, getTotalBeats());
    const insertBeats = Math.max(
      CONFIG.minimumNoteBeat,
      ...payload.notes.map((note) => Math.max(0, Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat)),
    );
    const pasted = payload.notes.map((note, index) => ({
      id: state.nextNoteId + index,
      pitch: clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch),
      startBeat: Number((targetOrigin + Math.max(0, Number(note.startBeat) || 0)).toFixed(6)),
      durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat).toFixed(6)),
      velocity: normalizeNoteDynamics(note).velocity,
      volume: normalizeNoteDynamics(note).volume,
    }));
    if (!canPlaceMonophonicNotes(pasted, [])) {
      showToast("복사한 노트끼리 서로 겹쳐 있어 단선율 채널에 삽입할 수 없습니다.");
      return false;
    }

    // Insert semantics: create time only in the active channel. Notes beginning at/after
    // the playhead move right by the clipboard span. A held note crossing the insertion
    // point follows the same rule as the measure-space editor and is trimmed to the cursor.
    const kept = [];
    for (const note of channel.notes || []) {
      const start = Number(note.startBeat) || 0;
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      if (start >= targetOrigin - 1e-7) {
        note.startBeat = Number((start + insertBeats).toFixed(6));
        kept.push(note);
      } else if (end > targetOrigin + 1e-7) {
        if (trimNoteToBeat(note, targetOrigin)) kept.push(note);
        else state.selectedNoteIds.delete(note.id);
      } else {
        kept.push(note);
      }
    }
    channel.notes = kept;

    clearNoteSelection();
    state.nextNoteId += pasted.length;
    pasted.forEach((note) => state.selectedNoteIds.add(note.id));
    channel.notes.push(...pasted);
    channel.notes.sort(compareNotesByTimeline);
    channel.visible = true;
    state.channelNoteRuntime.delete(String(channel.id));

    state.timelineBeats = Math.max(
      getTotalBeats(),
      getPersistentContentEndBeat() + getSnapBeat(),
      targetOrigin + insertBeats + getSnapBeat(),
    );
    ensureTimelineFitsViewport();
    markDirty("노트 삽입 붙여넣기");
    resizeAndDraw();
    renderChannelTabs();
    updateChannelInfo();
    showToast(`${pasted.length}개 노트를 ${channel.name}에 삽입했습니다.`);
    return true;
  }

  function canHandleNativeNodeClipboardEvent(event) {
    return Boolean(
      !suppressNativeNoteClipboardEvent
      && !event?.defaultPrevented
      && !isPopupLikeUiOpen()
      && !isTextEntryTarget(event.target)
      && state.activePanel === "notes"
      && !isMidiReferenceActive()
      && getActiveChannel()
    );
  }

  function handleNativeNodeCopyEvent(event) {
    if (!canHandleNativeNodeClipboardEvent(event)) return false;
    const selected = getSelectedNotes().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    if (!selected.length) return false;

    const payload = createNodeClipboardPayload(selected, { label: `선택 노트 ${selected.length}개`, source: "editor" });
    if (!payload || !writeNodeClipboardToEvent(event, payload)) return false;

    event.preventDefault();
    rememberNodeClipboardPayload(payload);
    showToast(`${payload.label}을 복사했습니다.`);
    return true;
  }

  function handleNativeNodeCutEvent(event) {
    if (!canHandleNativeNodeClipboardEvent(event)) return false;
    const selected = getSelectedNotes().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    if (!selected.length) return false;

    const payload = createNodeClipboardPayload(selected, { label: `선택 노트 ${selected.length}개`, source: "editor" });
    if (!payload || !writeNodeClipboardToEvent(event, payload)) return false;

    event.preventDefault();
    rememberNodeClipboardPayload(payload);
    deleteSelectedNote("노트 잘라내기");
    showToast(`${selected.length}개 노트를 잘라냈습니다.`);
    return true;
  }

  function handleNativeNodePasteEvent(event) {
    if (!canHandleNativeNodeClipboardEvent(event)) return false;
    const text = event.clipboardData?.getData?.("text/plain");
    const payload = parseNodeClipboardText(text);
    if (!payload) return false;

    event.preventDefault();
    rememberNodeClipboardPayload(payload);
    void pasteNotesFromClipboard(payload);
    return true;
  }

  function handleNodeClipboardStorageEvent(event) {
    if (event.key !== NOTE_CLIPBOARD_STORAGE_KEY || !event.newValue) return;
    const payload = parseNodeClipboardText(event.newValue);
    if (!payload) return;
    const incomingTime = Number(payload.copiedAt) || 0;
    const currentTime = Number(state.noteClipboard?.copiedAt) || 0;
    if (!isValidNodeClipboardPayload(state.noteClipboard) || incomingTime >= currentTime) {
      rememberNodeClipboardPayload(payload, { persist: false });
    }
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

  let mmlExportSelectionQueue = [];
  const MML_EXPORT_SPLIT_DEFAULT_CHARS = 2400;
  const MML_EXPORT_SPLIT_MAX_PAGES = 200;
  let mmlExportSplitMaxChars = MML_EXPORT_SPLIT_DEFAULT_CHARS;
  let mmlExportCopyState = { mml: "", pages: [] };

  function normalizeMmlExportSplitMaxChars(value) {
    return Math.max(200, Math.min(5000, Math.round(Number(value) || MML_EXPORT_SPLIT_DEFAULT_CHARS)));
  }

  function getMmlExportSelectedChannels() {
    if (!elements.mmlExportChannelList) return [];
    const checkedIds = new Set(
      [...elements.mmlExportChannelList.querySelectorAll('input[type="checkbox"]:checked')]
        .map((input) => String(input.value || "")),
    );
    mmlExportSelectionQueue = mmlExportSelectionQueue.filter((id) => checkedIds.has(String(id)));
    for (const input of elements.mmlExportChannelList.querySelectorAll('input[type="checkbox"]:checked')) {
      const id = String(input.value || "");
      if (!mmlExportSelectionQueue.includes(id)) mmlExportSelectionQueue.push(id);
    }
    const channelById = new Map(state.channels.map((channel) => [String(channel.id), channel]));
    return mmlExportSelectionQueue
      .map((id) => channelById.get(String(id)))
      .filter((channel) => channel?.notes?.length);
  }

  function getMmlChannelCharacterCount(channel, { includeTempo = false, tempos = getSortedTempos(), exportEndBeat = null } = {}) {
    if (!channel?.notes?.length) return 0;
    const normalized = channel.notes.map((note) => ({
      ...note,
      startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
      durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
    }));
    const partitioned = partitionNotesIntoMmlVoices(normalized);
    const channelEndBeat = normalized.reduce(
      (maximum, note) => Math.max(maximum, note.startBeat + note.durationBeat),
      0,
    );
    const safeExportEndBeat = Math.max(channelEndBeat, Number(exportEndBeat) || 0);
    const voices = partitioned
      .map((voice, voiceIndex) => (
        includeTempo && voiceIndex === 0
          ? buildTempoIntegratedNoteVoiceMml(voice, tempos, 0, safeExportEndBeat)
          : buildNoteVoiceMml(voice, 0)
      ))
      .filter(Boolean);
    return voices.length ? `MML@${voices.join(",")};`.length : 0;
  }

  function getMmlExportEndBeat(channels) {
    return (channels || []).reduce((maximum, channel) => (
      Math.max(
        maximum,
        ...(channel?.notes || []).map((note) => (
          Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat))
          + Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat))
        )),
      )
    ), 0);
  }

  function splitMmlPartsForExport(mml) {
    const source = String(mml || "").trim();
    const match = source.match(/^MML@([\s\S]*);$/i);
    if (!match) return [];
    return match[1].split(",");
  }

  function getMmlExportPartLengths(mml) {
    return splitMmlPartsForExport(mml).map((part) => String(part || "").length);
  }

  function getMmlExportMaxPartLength(mml) {
    const lengths = getMmlExportPartLengths(mml);
    return lengths.length ? Math.max(...lengths) : 0;
  }

  function formatMmlExportPartLengths(page) {
    const lengths = Array.isArray(page?.lengths) && page.lengths.length
      ? page.lengths
      : getMmlExportPartLengths(page?.mml || "");
    const visible = lengths
      .map((length) => Number(length) || 0)
      .filter((length) => length > 0)
      .map((length) => i18nText("mml_export.part_length", [length.toLocaleString()]));
    return visible.join(", ") || i18nText("mml_export.part_length", ["0"]);
  }

  function channelsToMmlRange(channels, startBeat, endBeat, tempos = getSortedTempos()) {
    const start = Math.max(0, Number(startBeat) || 0);
    const end = Math.max(start + CONFIG.minimumNoteBeat, Number(endBeat) || start + CONFIG.minimumNoteBeat);
    const fullVoices = [];
    for (const channel of (channels || []).filter((item) => item?.notes?.length)) {
      const normalized = channel.notes.map((note) => ({
        ...note,
        startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
        durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
      }));
      partitionNotesIntoMmlVoices(normalized).forEach((voice) => fullVoices.push(voice));
    }
    if (!fullVoices.length) return "";

    const rendered = fullVoices.map((voice, voiceIndex) => {
      const clipped = voice.flatMap((note) => {
        const noteStart = Math.max(0, Number(note.startBeat) || 0);
        const noteEnd = noteStart + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        if (noteEnd <= start + 1e-7 || noteStart >= end - 1e-7) return [];
        const clippedStart = Math.max(start, noteStart);
        const clippedEnd = Math.min(end, noteEnd);
        if (clippedEnd <= clippedStart + 1e-7) return [];
        return [{
          ...note,
          fadeReferenceBeat: Number.isFinite(Number(note.fadeReferenceBeat)) ? Number(note.fadeReferenceBeat) : noteStart,
          startBeat: Number(clippedStart.toFixed(6)),
          durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, clippedEnd - clippedStart).toFixed(6)),
        }];
      });
      if (voiceIndex === 0) return buildTempoIntegratedNoteVoiceMml(clipped, tempos, start, end);
      return clipped.length ? buildNoteVoiceMml(clipped, start) : "";
    });
    return normalizeMmlTextCase(`MML@${rendered.join(",")};`);
  }

  function buildMmlExportSplitCandidates(channels, tempos, totalEndBeat) {
    const candidates = new Set([0, Number(totalEndBeat) || 0]);
    for (const channel of channels || []) {
      for (const note of channel?.notes || []) {
        const start = Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat));
        const end = start + Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat));
        if (start > 1e-7 && start < totalEndBeat - 1e-7) candidates.add(Number(start.toFixed(6)));
        if (end > 1e-7 && end < totalEndBeat - 1e-7) candidates.add(Number(end.toFixed(6)));
      }
    }
    for (const tempo of tempos || []) {
      const beat = Math.max(0, snapBeatToUnit(tempo.beat, CONFIG.minimumNoteBeat));
      if (beat > 1e-7 && beat < totalEndBeat - 1e-7) candidates.add(Number(beat.toFixed(6)));
    }
    return [...candidates]
      .filter((beat) => Number.isFinite(beat) && beat >= 0 && beat <= totalEndBeat + 1e-7)
      .sort((a, b) => a - b);
  }

  function splitMmlExportPages(channels, fullMml) {
    const source = String(fullMml || "");
    if (!source) return [];
    const sourceParts = splitMmlPartsForExport(source);
    const sourceLengths = sourceParts.map((part) => String(part || "").length);
    const sourceMax = sourceLengths.length ? Math.max(...sourceLengths) : 0;
    if (sourceMax <= mmlExportSplitMaxChars) {
      return [{ index: 1, mml: source, parts: sourceParts, lengths: sourceLengths, maxPartLength: sourceMax }];
    }

    // Editor의 분할 복사는 이미 생성된 MML의 실제 글자 수를 기준으로 해야 한다.
    // 공용 MML optimizer는 파싱 후 다시 렌더링하면서 l 명령 등을 사용해 원문을
    // 압축할 수 있어서, 원본 파트가 제한을 넘더라도 "한 페이지"로 판단할 수 있다.
    // (예: 실제 Editor 출력 2,400자 초과 -> optimizer 재렌더 후 2,400자 미만)
    // 따라서 Editor에서는 선택 채널의 원본 노트 타임라인을 직접 분할하고,
    // 각 구간을 Editor와 동일한 MML 렌더러로 다시 만들어 제한을 검사한다.

    const tempos = getSortedTempos();
    const totalEndBeat = getMmlExportEndBeat(channels);
    if (!(totalEndBeat > 0)) {
      return [{ index: 1, mml: source, parts: sourceParts, lengths: sourceLengths, maxPartLength: sourceMax }];
    }

    const candidates = buildMmlExportSplitCandidates(channels, tempos, totalEndBeat);
    const pages = [];
    let pageStart = 0;
    let guard = 0;

    while (pageStart < totalEndBeat - 1e-7 && guard++ < MML_EXPORT_SPLIT_MAX_PAGES) {
      const firstIndex = candidates.findIndex((beat) => beat > pageStart + 1e-7);
      if (firstIndex < 0) break;
      let low = firstIndex;
      let high = candidates.length - 1;
      let bestIndex = -1;
      let bestMml = "";
      let bestLengths = [];
      const cache = new Map();

      const renderAt = (index) => {
        if (cache.has(index)) return cache.get(index);
        const endBeat = candidates[index];
        const mml = channelsToMmlRange(channels, pageStart, endBeat, tempos);
        const lengths = getMmlExportPartLengths(mml);
        const maxPartLength = lengths.length ? Math.max(...lengths) : 0;
        const result = { mml, lengths, maxPartLength };
        cache.set(index, result);
        return result;
      };

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const rendered = renderAt(mid);
        if (rendered.mml && rendered.maxPartLength <= mmlExportSplitMaxChars) {
          bestIndex = mid;
          bestMml = rendered.mml;
          bestLengths = rendered.lengths;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (bestIndex < 0) {
        bestIndex = firstIndex;
        const rendered = renderAt(bestIndex);
        bestMml = rendered.mml;
        bestLengths = rendered.lengths;
      }

      const pageEnd = Math.max(pageStart + CONFIG.minimumNoteBeat, candidates[bestIndex]);
      if (!bestMml) bestMml = channelsToMmlRange(channels, pageStart, pageEnd, tempos);
      if (!bestLengths.length) bestLengths = getMmlExportPartLengths(bestMml);
      const maxPartLength = bestLengths.length ? Math.max(...bestLengths) : 0;
      pages.push({
        index: pages.length + 1,
        mml: bestMml,
        parts: splitMmlPartsForExport(bestMml),
        lengths: bestLengths,
        maxPartLength,
        startBeat: pageStart,
        endBeat: pageEnd,
      });
      if (pageEnd <= pageStart + 1e-7) break;
      pageStart = pageEnd;
    }

    if (!pages.length || pageStart < totalEndBeat - 1e-7) {
      return [{ index: 1, mml: source, parts: sourceParts, lengths: sourceLengths, maxPartLength: sourceMax }];
    }
    return pages;
  }

  async function copyMmlExportText(text, button, successMessage) {
    const copied = await writeTextToClipboard(normalizeMmlTextCase(text));
    if (!copied) {
      showToast(i18nText("mml_export.copy_failed"));
      return false;
    }
    if (button) {
      const original = button.textContent;
      button.textContent = i18nText("copied");
      button.classList.add("copied");
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = original;
        button.classList.remove("copied");
      }, 1200);
    }
    showToast(successMessage);
    return true;
  }

  function renderMmlExportCopyActions(selectedChannels) {
    const channels = (selectedChannels || []).filter((channel) => channel?.notes?.length);
    if (!channels.length) {
      mmlExportCopyState = { mml: "", pages: [] };
      if (elements.mmlExportCopyPanel) elements.mmlExportCopyPanel.hidden = true;
      if (elements.mmlExportCopyAllButton) elements.mmlExportCopyAllButton.disabled = true;
      if (elements.mmlExportSplitButtons) elements.mmlExportSplitButtons.replaceChildren();
      return;
    }

    const mml = channelsToMml(channels, { originBeat: 0 });
    const parts = splitMmlPartsForExport(mml);
    const maxPartLength = getMmlExportMaxPartLength(mml);
    const pages = splitMmlExportPages(channels, mml);
    mmlExportCopyState = { mml, pages };

    if (elements.mmlExportCopyPanel) elements.mmlExportCopyPanel.hidden = false;
    if (elements.mmlExportCopyAllButton) elements.mmlExportCopyAllButton.disabled = !mml;
    if (elements.mmlExportFullCopyDetail) {
      elements.mmlExportFullCopyDetail.textContent = i18nText("mml_export.full_detail", [parts.length, maxPartLength.toLocaleString()]);
    }
    if (elements.mmlExportSplitSummary) {
      elements.mmlExportSplitSummary.textContent = pages.length > 1
        ? i18nText("mml_export.split_detail", [mmlExportSplitMaxChars.toLocaleString(), pages.length])
        : i18nText("mml_export.split_not_needed", [maxPartLength.toLocaleString()]);
    }
    if (elements.mmlExportSplitLimitInput && document.activeElement !== elements.mmlExportSplitLimitInput) {
      elements.mmlExportSplitLimitInput.value = String(mmlExportSplitMaxChars);
    }
    if (elements.mmlExportSplitButtons) {
      elements.mmlExportSplitButtons.replaceChildren();
      pages.forEach((page, index) => {
        const row = document.createElement("div");
        row.className = "mml-export-page-copy-row";
        const meta = document.createElement("div");
        meta.className = "mml-export-page-copy-meta";
        const title = document.createElement("strong");
        title.textContent = i18nText("mml_export.page_label", [index + 1]);
        const detail = document.createElement("small");
        detail.textContent = formatMmlExportPartLengths(page);
        meta.append(title, detail);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "mml-export-page-copy-button";
        button.textContent = i18nText("copy");
        const longest = Number(page.maxPartLength) || getMmlExportMaxPartLength(page.mml);
        button.title = i18nText("mml_export.page_detail", [index + 1, longest.toLocaleString()]);
        button.addEventListener("click", () => void copyMmlExportText(
          page.mml,
          button,
          i18nText("mml_export.split_copied", [index + 1]),
        ));
        row.append(meta, button);
        elements.mmlExportSplitButtons.append(row);
      });
    }
  }

  function syncMmlExportSelectionIndicators() {
    if (!elements.mmlExportChannelList) return;
    const selectedChannels = getMmlExportSelectedChannels();
    const firstSelectedId = selectedChannels.length ? String(selectedChannels[0].id) : null;
    const exportEndBeat = getMmlExportEndBeat(selectedChannels);
    const channelById = new Map(state.channels.map((channel) => [String(channel.id), channel]));
    const orderById = new Map(mmlExportSelectionQueue.map((id, index) => [String(id), index + 1]));
    elements.mmlExportChannelList.querySelectorAll('.mml-export-channel-row').forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const order = row.querySelector('.mml-export-order');
      const detail = row.querySelector('.mml-export-channel-info small');
      const id = String(checkbox?.value || "");
      const channel = channelById.get(id);
      const selectedOrder = checkbox?.checked ? orderById.get(id) : null;
      row.classList.toggle("selected", Boolean(selectedOrder));
      if (order) {
        order.textContent = selectedOrder ? String(selectedOrder) : "";
        order.classList.toggle("filled", Boolean(selectedOrder));
        order.setAttribute("aria-label", selectedOrder ? `내보내기 ${selectedOrder}번째` : "선택 순서");
      }
      if (detail && channel?.notes?.length) {
        const includesTempo = id === firstSelectedId;
        const characterCount = getMmlChannelCharacterCount(channel, {
          includeTempo: includesTempo,
          exportEndBeat,
        });
        detail.textContent = `${characterCount.toLocaleString()}자${includesTempo ? " (템포 포함)" : ""} · ${channel.notes.length.toLocaleString()}개 노트`;
        detail.title = includesTempo
          ? "첫 번째 선택 채널의 실제 MML 기준 글자 수(템포 명령 포함)"
          : "채널 단독 MML 기준 글자 수(템포 명령 제외)";
      }
    });
  }

  function setMmlExportCheckboxChecked(checkbox, checked) {
    if (!checkbox || checkbox.disabled) return;
    const id = String(checkbox.value || "");
    checkbox.checked = Boolean(checked);
    mmlExportSelectionQueue = mmlExportSelectionQueue.filter((item) => String(item) !== id);
    if (checkbox.checked) mmlExportSelectionQueue.push(id);
  }

  function updateMmlExportDialogState() {
    const selected = getMmlExportSelectedChannels();
    const exportableCount = state.channels.filter((channel) => channel.notes?.length).length;
    syncMmlExportSelectionIndicators();
    if (elements.mmlExportSummary) {
      elements.mmlExportSummary.textContent = selected.length
        ? i18nText("mml_export.selection_summary", [selected.length])
        : (exportableCount ? "선택된 채널이 없습니다." : "내보낼 노트가 있는 채널이 없습니다.");
    }
    renderMmlExportCopyActions(selected);
  }

  function renderMmlExportChannelList() {
    if (!elements.mmlExportChannelList) return;
    elements.mmlExportChannelList.replaceChildren();
    mmlExportSelectionQueue = [];
    state.channels.forEach((channel, index) => {
      const row = document.createElement("label");
      row.className = "mml-export-channel-row";
      row.style.setProperty("--channel-color", getChannelColor(channel, index));

      const order = document.createElement("span");
      order.className = "mml-export-order";
      order.setAttribute("aria-label", "선택 순서");

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
      if (channel.notes?.length) {
        const characterCount = getMmlChannelCharacterCount(channel);
        detail.textContent = `${characterCount.toLocaleString()}자 · ${channel.notes.length.toLocaleString()}개 노트`;
        detail.title = "채널 단독 MML 기준 글자 수(템포 명령 제외)";
      } else {
        detail.textContent = "빈 채널";
      }
      info.append(name, detail);

      row.append(order, checkbox, info);
      checkbox.addEventListener("change", () => {
        const id = String(checkbox.value || "");
        mmlExportSelectionQueue = mmlExportSelectionQueue.filter((item) => String(item) !== id);
        if (checkbox.checked) mmlExportSelectionQueue.push(id);
        updateMmlExportDialogState();
      });
      elements.mmlExportChannelList.append(row);
    });
    updateMmlExportDialogState();
  }

  function openMmlExportDialog() {
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
    if (elements.mmlExportSplitButtons) elements.mmlExportSplitButtons.replaceChildren();
    if (elements.mmlExportCopyPanel) elements.mmlExportCopyPanel.hidden = true;
    mmlExportSelectionQueue = [];
    mmlExportCopyState = { mml: "", pages: [] };
    if (elements.mmlExportSummary) elements.mmlExportSummary.textContent = "선택된 채널이 없습니다.";
  }

  function appendDurationTokens(output, symbol, durationBeat, { tied = false } = {}) {
    const tokens = beatLengthToMmlTokens(durationBeat, symbol);
    tokens.forEach((token, index) => output.push((tied || index > 0 ? "&" : "") + token));
    return tokens.length > 0;
  }

  function buildTempoIntegratedNoteVoiceMml(notes, tempos, originBeat, endBeat, { applyTimelineFade = true } = {}) {
    const sortedNotes = notes.slice().sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);
    const sortedTempos = tempos.slice().sort((left, right) => left.beat - right.beat);
    const tempoEvents = sortedTempos.filter((tempo) => tempo.beat > originBeat + 1e-7 && tempo.beat <= endBeat + 1e-7);
    const output = [`t${getTempoAtBeatFromCollection(originBeat, sortedTempos)}`];
    let cursorBeat = originBeat;
    let tempoIndex = 0;
    let octave = null;
    let velocity = null;

    const emitTempoEventsThrough = (targetBeat) => {
      while (tempoIndex < tempoEvents.length && tempoEvents[tempoIndex].beat <= targetBeat + 1e-7) {
        const tempo = tempoEvents[tempoIndex];
        if (tempo.beat > cursorBeat + 1e-7) {
          output.push(...beatLengthToMmlTokens(tempo.beat - cursorBeat, "r"));
          cursorBeat = tempo.beat;
        }
        output.push(`t${tempo.bpm}`);
        tempoIndex += 1;
      }
      if (targetBeat > cursorBeat + 1e-7) {
        output.push(...beatLengthToMmlTokens(targetBeat - cursorBeat, "r"));
        cursorBeat = targetBeat;
      }
    };

    for (const note of sortedNotes) {
      const startBeat = Math.max(originBeat, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat));
      const noteEndBeat = Math.max(
        startBeat + CONFIG.minimumNoteBeat,
        snapBeatToUnit(note.startBeat + note.durationBeat, CONFIG.minimumNoteBeat),
      );
      emitTempoEventsThrough(startBeat);

      const nextOctave = clamp(Math.floor(note.pitch / 12) - 1, 0, 8);
      if (nextOctave !== octave) {
        output.push(`o${nextOctave}`);
        octave = nextOctave;
      }
      const nextVelocity = applyTimelineFade
        ? getTimelineFadedNoteVolume(note, Number.isFinite(Number(note.fadeReferenceBeat)) ? Number(note.fadeReferenceBeat) : startBeat)
        : normalizeNoteDynamics(note, 8).volume;
      if (nextVelocity !== velocity) {
        output.push(`v${nextVelocity}`);
        velocity = nextVelocity;
      }
      const pitchName = MML_PITCH_NAMES[((note.pitch % 12) + 12) % 12];
      let segmentStart = startBeat;
      let tied = false;
      while (tempoIndex < tempoEvents.length && tempoEvents[tempoIndex].beat < noteEndBeat - 1e-7) {
        const tempo = tempoEvents[tempoIndex];
        if (tempo.beat > segmentStart + 1e-7) {
          if (appendDurationTokens(output, pitchName, tempo.beat - segmentStart, { tied })) tied = true;
          segmentStart = tempo.beat;
          cursorBeat = tempo.beat;
        }
        output.push(`t${tempo.bpm}`);
        tempoIndex += 1;
      }
      if (noteEndBeat > segmentStart + 1e-7) {
        appendDurationTokens(output, pitchName, noteEndBeat - segmentStart, { tied });
      }
      cursorBeat = noteEndBeat;
    }

    // If the first selected channel ends before a later global tempo change,
    // advance this same voice with rests so the tempo command still lives in
    // the first selected channel instead of creating a hidden tempo-only voice.
    while (tempoIndex < tempoEvents.length) {
      const tempo = tempoEvents[tempoIndex];
      if (tempo.beat > cursorBeat + 1e-7) {
        output.push(...beatLengthToMmlTokens(tempo.beat - cursorBeat, "r"));
        cursorBeat = tempo.beat;
      }
      output.push(`t${tempo.bpm}`);
      tempoIndex += 1;
    }
    return output.join("");
  }

  function channelsToMml(channels, { tempos = getSortedTempos(), originBeat = 0 } = {}) {
    const selectedChannels = (channels || []).filter((channel) => channel?.notes?.length);
    if (!selectedChannels.length) return "";
    const firstBeat = Math.max(0, Number(originBeat) || 0);
    const prepared = selectedChannels.map((channel) => {
      const normalized = channel.notes.map((note) => ({
        ...note,
        startBeat: Math.max(0, snapBeatToUnit(note.startBeat, CONFIG.minimumNoteBeat)),
        durationBeat: Math.max(CONFIG.minimumNoteBeat, snapBeatToUnit(note.durationBeat, CONFIG.minimumNoteBeat)),
      }));
      return {
        channel,
        normalized,
        voices: partitionNotesIntoMmlVoices(normalized),
        endBeat: normalized.reduce((maximum, note) => Math.max(maximum, note.startBeat + note.durationBeat), firstBeat),
      };
    });
    const endBeat = prepared.reduce((maximum, entry) => Math.max(maximum, entry.endBeat), firstBeat);
    const voices = [];

    prepared.forEach((entry, channelIndex) => {
      entry.voices.forEach((voice, voiceIndex) => {
        const voiceMml = channelIndex === 0 && voiceIndex === 0
          ? buildTempoIntegratedNoteVoiceMml(voice, tempos, firstBeat, endBeat)
          : buildNoteVoiceMml(voice, firstBeat);
        if (voiceMml) voices.push(voiceMml);
      });
    });

    return voices.length ? normalizeMmlTextCase(`MML@${voices.join(",")};`) : "";
  }

  async function applyMmlExportSelection() {
    const channels = getMmlExportSelectedChannels();
    if (!channels.length) {
      updateMmlExportDialogState();
      return false;
    }
    const mml = mmlExportCopyState.mml || channelsToMml(channels, { originBeat: 0 });
    if (!mml) {
      showToast("내보낼 노트가 없습니다.");
      return false;
    }
    return copyMmlExportText(
      mml,
      elements.mmlExportCopyAllButton,
      i18nText("mml_export.full_copied", [channels.length]),
    );
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
    state.timeEdit = { beat: 0, scope: "all", channelId: null, preferredAction: null };
  }

  function updateTimeEditScopeUi() {
    const targetChannel = state.channels.find((channel) => String(channel.id) === String(state.timeEdit?.channelId))
      || getActiveChannel()
      || null;
    const channelScopeAvailable = Boolean(targetChannel) && !isMidiReferenceActive();
    if (elements.timeEditSelectedChannelOnly) {
      elements.timeEditSelectedChannelOnly.disabled = !channelScopeAvailable;
      if (!channelScopeAvailable) elements.timeEditSelectedChannelOnly.checked = false;
    }
    const channelScoped = Boolean(elements.timeEditSelectedChannelOnly?.checked) && channelScopeAvailable;
    state.timeEdit.scope = channelScoped ? "channel" : "all";
    state.timeEdit.channelId = targetChannel?.id ?? null;
    if (elements.timeEditPosition) {
      elements.timeEditPosition.textContent = channelScoped
        ? i18nText("channel.playhead_basis", [targetChannel.name, state.timeEdit.beat.toFixed(3)])
        : i18nText("timeline.playhead_basis", [state.timeEdit.beat.toFixed(3)]);
    }
  }

  function openTimeEditDialog({ beat = state.playhead.beat, scope = "all", channelId = null, preferredAction = null } = {}) {
    const targetChannel = state.channels.find((channel) => String(channel.id) === String(channelId ?? getActiveChannel()?.id)) || null;
    const normalizedAction = preferredAction === "insert" || preferredAction === "delete" ? preferredAction : null;
    const channelScopeAvailable = Boolean(targetChannel) && !isMidiReferenceActive();
    state.timeEdit = {
      beat: clamp(Number(beat) || 0, 0, getTotalBeats()),
      scope: "all",
      channelId: channelScopeAvailable ? targetChannel.id : null,
      preferredAction: normalizedAction,
    };
    if (elements.timeEditTitle) {
      elements.timeEditTitle.textContent = normalizedAction === "insert"
        ? i18nText("timeline.add_measure_beat")
        : normalizedAction === "delete"
          ? i18nText("timeline.delete_measure_beat")
          : i18nText("timeline.edit_measure");
    }
    if (elements.timeEditSelectedChannelOnly) {
      elements.timeEditSelectedChannelOnly.checked = false;
    }
    updateTimeEditScopeUi();
    if (elements.timeEditMeasureInput) elements.timeEditMeasureInput.value = "1";
    if (elements.timeEditBeatInput) elements.timeEditBeatInput.value = "0";
    // 추가/삭제를 하나의 팝업에 통합합니다. 메뉴에서 어느 동작으로 열었는지는 Enter 기본 동작에만 사용합니다.
    if (elements.timeEditInsertButton) elements.timeEditInsertButton.hidden = false;
    if (elements.timeEditDeleteButton) elements.timeEditDeleteButton.hidden = false;
    if (elements.timeEditBackdrop) elements.timeEditBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.timeEditMeasureInput?.focus();
      elements.timeEditMeasureInput?.select();
    });
    return true;
  }

  function getTimeEditAmount() {
    const measures = Math.max(0, Math.floor(Number(elements.timeEditMeasureInput?.value) || 0));
    const rawSubdivision = String(elements.timeEditBeatInput?.value ?? "").trim();
    const subdivisions = rawSubdivision === ""
      ? 0
      : clamp(Math.floor(Number(rawSubdivision) || 0), 0, 63);
    return {
      measures,
      subdivisions,
      amountBeats: measures * CONFIG.beatsPerMeasure + subdivisions * CONFIG.minimumNoteBeat,
    };
  }

  function describeTimeEditAmount(measures, subdivisions) {
    const parts = [];
    if (measures) parts.push(`${measures}마디`);
    if (subdivisions) parts.push(`${subdivisions}/64 박자`);
    return parts.join(" ") || "0박자";
  }

  function normalizeTimeEditMeasureInput({ clampValue = false } = {}) {
    const input = elements.timeEditMeasureInput;
    if (!input) return 0;
    const raw = String(input.value ?? "").trim();
    if (raw === "") {
      if (clampValue) input.value = "0";
      return 0;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) {
      input.value = clampValue ? "0" : "";
      return 0;
    }
    const normalized = Math.max(0, parsed);
    if (clampValue || normalized !== parsed) input.value = String(normalized);
    return normalized;
  }

  function normalizeTimeEditSubdivisionInput({ clampValue = false } = {}) {
    const input = elements.timeEditBeatInput;
    if (!input) return 0;
    const raw = String(input.value ?? "").trim();
    if (raw === "") {
      if (clampValue) input.value = "0";
      return 0;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed)) {
      input.value = clampValue ? "0" : "";
      return 0;
    }
    const normalized = clamp(parsed, 0, 63);
    if (clampValue || normalized !== parsed) input.value = String(normalized);
    return normalized;
  }

  function trimNoteToBeat(note, targetEndBeat) {
    const nextDuration = targetEndBeat - note.startBeat;
    if (nextDuration < CONFIG.minimumNoteBeat - 1e-7) return false;
    note.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, nextDuration).toFixed(6));
    return true;
  }

  function shiftTimelineFadesForInsert(cursorBeat, amountBeats) {
    const cursor = Math.max(0, Number(cursorBeat) || 0);
    const amount = Math.max(0, Number(amountBeats) || 0);
    if (!(amount > 0)) return;
    state.timelineFades = normalizeTimelineFades().map((fade) => ({ ...fade, startBeat: fade.startBeat >= cursor - 1e-7 ? fade.startBeat + amount : fade.startBeat }));
  }

  function shiftTimelineFadesForDelete(cursorBeat, amountBeats) {
    const cursor = Math.max(0, Number(cursorBeat) || 0);
    const amount = Math.max(0, Number(amountBeats) || 0);
    if (!(amount > 0)) return;
    const cutEnd = cursor + amount;
    const mapBeat = (beat) => beat <= cursor + 1e-7 ? beat : (beat >= cutEnd - 1e-7 ? Math.max(0, beat - amount) : cursor);
    state.timelineFades = normalizeTimelineFades().flatMap((fade) => {
      const start = mapBeat(fade.startBeat);
      const end = mapBeat(getTimelineFadeEndBeat(fade));
      if (end <= start + 1e-7) return [];
      const durationSeconds = normalizeTimelineFadeSeconds(timelineFadeBeatToSeconds(end) - timelineFadeBeatToSeconds(start), 0.1);
      return [{ ...fade, startBeat: start, durationSeconds }];
    });
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
    shiftTimelineFadesForInsert(cursor, amount);
    state.timelineBeats = Math.max(getTotalBeats() + amount, getPersistentContentEndBeat() + getSnapBeat());
    ensureTimelineFitsViewport();
    markDirty(i18nText("timeline.add_measure_beat"));
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
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
    shiftTimelineFadesForDelete(cursor, amount);
    state.timelineBeats = Math.max(CONFIG.beatsPerMeasure, getTotalBeats() - amount);
    shrinkTimelineToContent();
    ensureTimelineFitsViewport();
    markDirty(i18nText("timeline.delete_measure_beat"));
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
    return true;
  }

  function getTimeEditChannel() {
    if (state.timeEdit?.scope !== "channel") return null;
    return state.channels.find((channel) => String(channel.id) === String(state.timeEdit.channelId)) || null;
  }

  function insertChannelSpaceAtPlayhead(amountBeats) {
    const channel = getTimeEditChannel();
    if (!channel) return false;
    const amount = Math.max(CONFIG.minimumNoteBeat, Number(amountBeats) || 0);
    const cursor = clamp(Number(state.timeEdit?.beat ?? state.playhead.beat) || 0, 0, getTotalBeats());
    const kept = [];
    let changed = false;
    for (const note of channel.notes || []) {
      const start = Number(note.startBeat) || 0;
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      if (start >= cursor - 1e-7) {
        note.startBeat = Number((start + amount).toFixed(6));
        kept.push(note);
        changed = true;
      } else if (end > cursor + 1e-7) {
        if (trimNoteToBeat(note, cursor)) {
          kept.push(note);
          changed = true;
        } else {
          state.selectedNoteIds.delete(note.id);
          changed = true;
        }
      } else kept.push(note);
    }
    if (!changed) {
      showToast(i18nText("channel.space_no_notes"));
      return false;
    }
    channel.notes = kept;
    state.channelNoteRuntime.delete(String(channel.id));
    state.timelineBeats = Math.max(
      getTotalBeats(),
      getPersistentContentEndBeat() + Math.max(getSnapBeat(), CONFIG.minimumNoteBeat),
    );
    ensureTimelineFitsViewport();
    markDirty(i18nText("history.channel_space_add"));
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
    return true;
  }

  function deleteChannelSpaceAtPlayhead(amountBeats) {
    const channel = getTimeEditChannel();
    if (!channel) return false;
    const amount = Math.max(CONFIG.minimumNoteBeat, Number(amountBeats) || 0);
    const cursor = clamp(Number(state.timeEdit?.beat ?? state.playhead.beat) || 0, 0, getTotalBeats());
    const cutEnd = cursor + amount;
    const nextNotes = [];
    let changed = false;
    for (const note of channel.notes || []) {
      const start = Number(note.startBeat) || 0;
      const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      if (end <= cursor + 1e-7) {
        nextNotes.push(note);
      } else if (start >= cutEnd - 1e-7) {
        note.startBeat = Number(Math.max(0, start - amount).toFixed(6));
        nextNotes.push(note);
        changed = true;
      } else if (start < cursor - 1e-7 && end > cutEnd + 1e-7) {
        note.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, end - start - amount).toFixed(6));
        nextNotes.push(note);
        changed = true;
      } else if (start < cursor - 1e-7) {
        if (trimNoteToBeat(note, cursor)) nextNotes.push(note);
        else state.selectedNoteIds.delete(note.id);
        changed = true;
      } else if (end > cutEnd + 1e-7) {
        const nextDuration = end - cutEnd;
        if (nextDuration >= CONFIG.minimumNoteBeat - 1e-7) {
          note.startBeat = Number(cursor.toFixed(6));
          note.durationBeat = Number(nextDuration.toFixed(6));
          nextNotes.push(note);
        } else state.selectedNoteIds.delete(note.id);
        changed = true;
      } else {
        state.selectedNoteIds.delete(note.id);
        changed = true;
      }
    }
    if (!changed) {
      showToast(i18nText("channel.space_no_notes"));
      return false;
    }
    channel.notes = nextNotes;
    state.channelNoteRuntime.delete(String(channel.id));
    shrinkTimelineToContent();
    ensureTimelineFitsViewport();
    markDirty(i18nText("history.channel_space_delete"));
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    closeTimeEditDialog();
    return true;
  }

  function applyTimeEdit(action) {
    normalizeTimeEditMeasureInput({ clampValue: true });
    normalizeTimeEditSubdivisionInput({ clampValue: true });
    const { measures, subdivisions, amountBeats } = getTimeEditAmount();
    if (amountBeats <= 0) {
      showToast("추가하거나 삭제할 마디 또는 1/64 박자를 입력하세요.");
      elements.timeEditMeasureInput?.focus();
      return false;
    }
    const resumePlayback = state.playback.running || state.playback.loading;
    if (resumePlayback) stopPlayback(false);
    const channelScoped = state.timeEdit?.scope === "channel";
    const applied = action === "delete"
      ? (channelScoped ? deleteChannelSpaceAtPlayhead(amountBeats) : deleteTrackSpaceAtPlayhead(amountBeats))
      : (channelScoped ? insertChannelSpaceAtPlayhead(amountBeats) : insertTrackSpaceAtPlayhead(amountBeats));
    if (applied) {
      const actionLabel = action === "delete" ? i18nText("action.delete") : i18nText("action.add");
      showToast(channelScoped
        ? i18nText("channel.space_edited", [describeTimeEditAmount(measures, subdivisions), actionLabel])
        : i18nText("timeline.space_edited", [describeTimeEditAmount(measures, subdivisions), actionLabel]));
      if (resumePlayback) window.setTimeout(() => startPlayback(), 0);
    }
    return applied;
  }

  let timelineFadeEditor = { fadeId: null, beat: 0 };

  function closeTimelineFadeDialog() {
    if (elements.timelineFadeBackdrop) elements.timelineFadeBackdrop.hidden = true;
    timelineFadeEditor = { fadeId: null, beat: 0 };
  }

  function timelineFadeFieldValue(input, fallback = 0) {
    const value = Number(input?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function setTimelineFadeTypeControls(type) {
    const isOut = type === "out";
    if (elements.timelineFadeTypeIn) elements.timelineFadeTypeIn.checked = !isOut;
    if (elements.timelineFadeTypeOut) elements.timelineFadeTypeOut.checked = isOut;
  }

  function getTimelineFadeTypeFromControls() {
    return elements.timelineFadeTypeOut?.checked ? "out" : "in";
  }

  function handleTimelineFadeTypeChange(event) {
    if (event?.target === elements.timelineFadeTypeIn) {
      if (elements.timelineFadeTypeIn.checked) elements.timelineFadeTypeOut.checked = false;
      else if (!elements.timelineFadeTypeOut?.checked) elements.timelineFadeTypeIn.checked = true;
    } else if (event?.target === elements.timelineFadeTypeOut) {
      if (elements.timelineFadeTypeOut.checked) elements.timelineFadeTypeIn.checked = false;
      else if (!elements.timelineFadeTypeIn?.checked) elements.timelineFadeTypeOut.checked = true;
    }
  }

  function normalizeTimelineFadeDurationInput({ commit = false } = {}) {
    if (!elements.timelineFadeDuration) return 2;
    const value = normalizeTimelineFadeSeconds(timelineFadeFieldValue(elements.timelineFadeDuration, 2), 2);
    if (commit) elements.timelineFadeDuration.value = value.toFixed(1);
    return value;
  }

  function readTimelineFadeDialog() {
    return normalizeTimelineFadeEvent({
      id: timelineFadeEditor.fadeId || getNextTimelineFadeId(),
      type: getTimelineFadeTypeFromControls(),
      startBeat: Math.max(0, Number(timelineFadeEditor.beat) || 0),
      durationSeconds: normalizeTimelineFadeDurationInput(),
    }, timelineFadeEditor.fadeId || getNextTimelineFadeId());
  }

  function openTimelineFadeDialog(contextBeat = state.playhead.beat, sourceFade = null) {
    if (!elements.timelineFadeBackdrop) return false;
    const beat = snapBeatToUnit(Math.max(0, Number(contextBeat) || 0), CONFIG.minimumNoteBeat);
    const source = sourceFade ? normalizeTimelineFadeEvent(sourceFade, sourceFade.id || 1) : getTimelineFadeAtBeat(beat);
    timelineFadeEditor = { fadeId: source?.id ?? null, beat: source?.startBeat ?? beat };
    if (elements.timelineFadePosition) elements.timelineFadePosition.textContent = `${timelineFadeEditor.beat.toFixed(3)} beat`;
    setTimelineFadeTypeControls(source?.type || "in");
    if (elements.timelineFadeDuration) elements.timelineFadeDuration.value = normalizeTimelineFadeSeconds(source?.durationSeconds, 2).toFixed(1);
    if (elements.timelineFadeDeleteButton) elements.timelineFadeDeleteButton.hidden = !source;
    elements.timelineFadeBackdrop.hidden = false;
    requestAnimationFrame(() => elements.timelineFadeDuration?.focus());
    return true;
  }

  function applyTimelineFadeDialog() {
    normalizeTimelineFadeDurationInput({ commit: true });
    const next = readTimelineFadeDialog();
    const before = JSON.stringify(normalizeTimelineFades());
    const remaining = normalizeTimelineFades().filter((fade) => {
      if (timelineFadeEditor.fadeId != null && String(fade.id) === String(timelineFadeEditor.fadeId)) return false;
      return Math.abs(fade.startBeat - next.startBeat) > 1e-7;
    });
    state.timelineFades = normalizeTimelineFades([...remaining, next]);
    state.timelineBeats = Math.max(getTotalBeats(), getTimelineFadeEndBeat(next));
    closeTimelineFadeDialog();
    if (JSON.stringify(state.timelineFades) === before) return false;
    markDirty(i18nText("history.timeline_fade"));
    resizeAndDraw(); updateChannelInfo();
    if (elements.mmlExportBackdrop && !elements.mmlExportBackdrop.hidden) updateMmlExportDialogState();
    showToast(i18nText("timeline.fade_applied"));
    return true;
  }

  function deleteTimelineFadeById(fadeId, { closeDialog = false } = {}) {
    if (fadeId == null) return false;
    const before = normalizeTimelineFades().length;
    state.timelineFades = normalizeTimelineFades().filter((fade) => String(fade.id) !== String(fadeId));
    if (closeDialog) closeTimelineFadeDialog();
    if (state.timelineFades.length === before) return false;
    markDirty(i18nText("history.timeline_fade"));
    resizeAndDraw(); updateChannelInfo();
    if (elements.mmlExportBackdrop && !elements.mmlExportBackdrop.hidden) updateMmlExportDialogState();
    showToast(i18nText("timeline.fade_deleted"));
    return true;
  }

  function deleteTimelineFadeFromDialog() {
    return deleteTimelineFadeById(timelineFadeEditor.fadeId, { closeDialog: true });
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

  function getNonInitialTempos() {
    return state.tempos.filter((item) => Math.abs(Number(item?.beat) || 0) > 1e-7);
  }

  function deleteAllNonInitialTempos() {
    if (isMidiReferenceActive()) {
      showToast("MIDI 탭의 템포는 읽기 전용입니다.");
      return false;
    }
    const removable = getNonInitialTempos();
    if (!removable.length) {
      showToast(i18nText("tempo.delete_all_none"));
      return false;
    }
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    state.tempos = state.tempos.filter((item) => Math.abs(Number(item?.beat) || 0) <= 1e-7);
    closeTempoEditor();
    markDirty("모든 템포 삭제");
    shrinkTimelineToContent();
    drawRoll();
    drawTimeline();
    updateChannelInfo();
    showToast(i18nText("tempo.delete_all_done", [removable.length.toLocaleString()]));
    return true;
  }


  function closeTempoSimplifyDialog() {
    if (elements.tempoSimplifyBackdrop) elements.tempoSimplifyBackdrop.hidden = true;
  }

  function getFirstEditorNoteBeat() {
    let firstBeat = Infinity;
    for (const channel of state.channels || []) {
      for (const note of channel.notes || []) {
        const beat = Number(note.startBeat);
        if (Number.isFinite(beat)) firstBeat = Math.min(firstBeat, Math.max(0, beat));
      }
    }
    return Number.isFinite(firstBeat) ? firstBeat : 0;
  }

  function analyzeTempoSimplification({ maxBpmDeltaExclusive = 5, preserveExtrema = true } = {}) {
    const threshold = Math.max(1, Number(maxBpmDeltaExclusive) || 5);
    const source = [...(state.tempos || [])]
      .map((tempo) => ({ ...tempo, beat: Math.max(0, Number(tempo.beat) || 0), bpm: Number(tempo.bpm) || 120 }))
      .sort((left, right) => left.beat - right.beat || (Number(left.id) || 0) - (Number(right.id) || 0));

    const grouped = [];
    for (const tempo of source) {
      let group = grouped[grouped.length - 1];
      if (!group || Math.abs(group.beat - tempo.beat) > 1e-7) {
        group = { beat: tempo.beat, tempos: [] };
        grouped.push(group);
      }
      group.tempos.push(tempo);
    }

    const timeline = grouped.map((group) => {
      const winner = group.tempos[group.tempos.length - 1];
      return {
        beat: group.beat,
        bpm: winner.bpm,
        fixed: group.tempos.some((tempo) => Boolean(tempo.fixed)),
        tempos: group.tempos,
      };
    });

    if (!timeline.length) {
      return { removedIds: new Set(), removedCount: 0, beforeCount: 0, afterCount: 0, minBpm: 120, maxBpm: 120 };
    }

    // Player와 동일하게 선행 무음용 T120 -> 첫 노트 위치의 실제 템포 복원은
    // 음악적 템포 비교 기준에서 제외합니다.
    const firstNoteBeat = getFirstEditorNoteBeat();
    const firstTempo = timeline[0] || null;
    const nextTempo = timeline[1] || null;
    const hasLeadingDefaultTempoPadding = Boolean(
      firstTempo
      && Math.abs(firstTempo.beat) < 1e-7
      && firstTempo.bpm === 120
      && firstNoteBeat > 1e-7
      && nextTempo
      && Math.abs(nextTempo.beat - firstNoteBeat) < 1e-7
    );

    const comparisonTimeline = hasLeadingDefaultTempoPadding ? timeline.slice(1) : timeline;
    const comparisonBpms = comparisonTimeline.length
      ? comparisonTimeline.map((tempo) => tempo.bpm)
      : timeline.map((tempo) => tempo.bpm);
    const minBpm = Math.min(...comparisonBpms);
    const maxBpm = Math.max(...comparisonBpms);
    const removedGroups = [];
    let previousRetained = null;

    for (let index = 0; index < timeline.length; index++) {
      const tempo = timeline[index];
      if (hasLeadingDefaultTempoPadding && index === 0) continue;
      if (!previousRetained) {
        previousRetained = tempo;
        continue;
      }
      const isExtrema = Boolean(preserveExtrema) && (tempo.bpm === minBpm || tempo.bpm === maxBpm);
      const isSmallChange = Math.abs(tempo.bpm - previousRetained.bpm) < threshold;
      if (!tempo.fixed && !isExtrema && isSmallChange) {
        removedGroups.push(tempo);
        continue;
      }
      previousRetained = tempo;
    }

    const removedIds = new Set();
    for (const group of removedGroups) {
      for (const tempo of group.tempos || []) {
        if (!tempo.fixed) removedIds.add(String(tempo.id));
      }
    }
    return {
      removedIds,
      removedCount: removedIds.size,
      beforeCount: source.length,
      afterCount: Math.max(0, source.length - removedIds.size),
      minBpm,
      maxBpm,
      maxBpmDeltaExclusive: threshold,
      preserveExtrema: Boolean(preserveExtrema),
      ignoredLeadingDefaultTempoForComparison: hasLeadingDefaultTempoPadding,
    };
  }

  function readTempoSimplifyOptionsFromUi() {
    const rawThreshold = Number(elements.tempoSimplifyThresholdInput?.value);
    const threshold = Number.isFinite(rawThreshold) ? Math.round(rawThreshold) : 5;
    return {
      maxBpmDeltaExclusive: clamp(threshold, 1, 255),
      preserveExtrema: elements.tempoSimplifyPreserveExtrema?.checked !== false,
    };
  }

  function updateTempoSimplifySummary() {
    if (!elements.tempoSimplifySummary) return;
    const options = readTempoSimplifyOptionsFromUi();
    const analysis = analyzeTempoSimplification(options);
    elements.tempoSimplifySummary.textContent = i18nText("tempo.simplify_preview", [
      analysis.beforeCount.toLocaleString(document.documentElement.lang || undefined),
      analysis.afterCount.toLocaleString(document.documentElement.lang || undefined),
      analysis.removedCount.toLocaleString(document.documentElement.lang || undefined),
    ]);
  }

  function openTempoSimplifyDialog() {
    if (isMidiReferenceActive()) {
      showToast(i18nText("midi.tempo_tab_readonly"));
      return false;
    }
    if (!elements.tempoSimplifyBackdrop) return false;
    const options = state.tempoSimplify || { maxBpmDeltaExclusive: 5, preserveExtrema: true };
    elements.tempoSimplifyThresholdInput.value = String(Math.max(1, Math.round(Number(options.maxBpmDeltaExclusive) || 5)));
    elements.tempoSimplifyPreserveExtrema.checked = options.preserveExtrema !== false;
    updateTempoSimplifySummary();
    elements.tempoSimplifyBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.tempoSimplifyThresholdInput?.focus();
      elements.tempoSimplifyThresholdInput?.select();
    });
    return true;
  }

  function applyTempoSimplification() {
    const options = readTempoSimplifyOptionsFromUi();
    if (elements.tempoSimplifyThresholdInput) elements.tempoSimplifyThresholdInput.value = String(options.maxBpmDeltaExclusive);
    state.tempoSimplify = { ...options };
    const analysis = analyzeTempoSimplification(options);
    if (!analysis.removedCount) {
      updateTempoSimplifySummary();
      showToast(i18nText("tempo.simplify_no_changes"));
      return false;
    }
    if (state.playback.running || state.playback.loading) stopPlayback(false);
    state.tempos = state.tempos.filter((tempo) => !analysis.removedIds.has(String(tempo.id)));
    closeTempoSimplifyDialog();
    shrinkTimelineToContent();
    markDirty(i18nText("history.tempo_simplify"));
    drawRoll();
    drawTimeline();
    updateChannelInfo();
    updatePlaybackTimeInfo();
    showToast(i18nText("tempo.simplify_done", [analysis.removedCount.toLocaleString(document.documentElement.lang || undefined)]));
    return true;
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

  function consumeEditorWheelGesture(event, mode, applyStep, { onChanged = null } = {}) {
    const delta = getNormalizedWheelDelta(event);
    if (!delta) return false;
    event.preventDefault();
    event.stopPropagation();

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
    const changed = Boolean(applyStep(stepDirection, now));
    state.zoomWheel.lastStepAt = now;
    state.zoomWheel.accumulatedDelta = 0;
    if (changed && typeof onChanged === "function") {
      onChanged();
    }
    return true;
  }

  function handleGlobalTrackZoomWheel(event) {
    // Ctrl/Cmd + wheel is reserved for editor track zoom. Chromium-class
    // browsers (and trackpad pinch gestures) may otherwise interpret this as
    // page zoom, so consume it at the document capture phase before the
    // browser can act on it.
    const commandWheel = event.ctrlKey || event.metaKey;
    if (!commandWheel || event.altKey) return false;

    // Browser/page zoom must never win for Ctrl/Cmd + wheel, even when a popup
    // is open. Popups simply suppress the editor zoom step while the gesture
    // itself remains consumed.
    event.preventDefault();
    event.stopPropagation();
    if (isPopupLikeUiOpen()) return true;

    const targetInPianoSection = event.target instanceof Node
      && Boolean(elements.pianoSection?.contains(event.target));
    return consumeEditorWheelGesture(event, "zoom", (stepDirection) => changeZoom(
      stepDirection,
      targetInPianoSection
        ? { anchor: "pointer", clientX: event.clientX }
        : { anchor: "center" },
    ));
  }

  function handlePianoRollAltWheelZoom(event) {
    // Ctrl/Cmd+wheel is handled globally by handleGlobalTrackZoomWheel().
    // Alt+wheel remains local to the piano roll for selected-note volume.
    if (event.ctrlKey || event.metaKey || !event.altKey) return false;
    const selectedNotes = getEditableAltWheelSelectedNotes();
    if (!selectedNotes.length) return false;
    return consumeEditorWheelGesture(
      event,
      "volume",
      (stepDirection, now) => adjustSelectedNoteVolumesByStep(stepDirection, now),
      { onChanged: () => elements.rollViewport?.focus({ preventScroll: true }) },
    );
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
      elements.zoomButton.innerHTML = `<span aria-hidden="true" class="transport-utility-icon">🔍</span><span class="transport-utility-value">${percent}</span>`;
      elements.zoomButton.setAttribute("aria-label", `확대 배율 ${percent}%`);
      elements.zoomButton.title = `확대 배율 ${percent}% (Ctrl+휠, - / = 키 지원)`;
    }
  }

  function updatePlayButton() {
    if (state.playback.loading) {
      elements.playButton.setAttribute("aria-pressed", "true");
      elements.playButton.setAttribute("aria-label", "재생 준비");
      elements.playButton.title = "재생 준비";
      setTransportButtonContent(elements.playButton, { glyph: "…" });
      return;
    }
    if (state.playback.running) {
      elements.playButton.setAttribute("aria-pressed", "true");
      elements.playButton.setAttribute("aria-label", "정지");
      elements.playButton.title = "정지";
      setTransportButtonContent(elements.playButton, { icon: "stop" });
      return;
    }
    elements.playButton.setAttribute("aria-pressed", "false");
    elements.playButton.setAttribute("aria-label", "재생");
    elements.playButton.title = "재생";
    setTransportButtonContent(elements.playButton, { icon: "play" });
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
      if (!includeMuted && isChannelEffectivelyMuted(channel)) continue;
      for (const note of channel.notes) {
        if (note.startBeat + note.durationBeat <= startBeat + 1e-7) continue;
        const fadedVolume = getTimelineFadedNoteVolume(note);
        notes.push({
          id: note.id,
          pitch: note.pitch,
          velocity: mmlVolumeToPlayerPlaybackVelocity(fadedVolume),
          volume: fadedVolume,
          startBeat: note.startBeat,
          durationBeat: note.durationBeat,
          endBeat: note.startBeat + note.durationBeat,
          source: "channel",
          sourceId: channel.id,
          instrumentProgram: getChannelInstrumentProgram(channel),
          instrumentBank: getChannelInstrumentBank(channel),
          instrumentExactPreset: getChannelInstrumentExactPreset(channel),
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
    return Boolean(channel && !isChannelEffectivelyMuted(channel));
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
      exactPreset: Boolean(note.instrumentExactPreset),
      gainScale: state.playback.autoGainScale,
      mmlVolume: Number.isFinite(Number(note.volume)) ? Number(note.volume) : null,
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
      scheduleAudioClipsForPlayback();
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
      // Do not quantize every animation frame. The destination may stay aligned
      // to the 1/64 grid, but intermediate scroll positions must remain continuous.
      elements.rollViewport.scrollLeft = clamp(interpolated, 0, getMaxScrollLeft());
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

    const visualBeat = getPlaybackVisualBeat(currentBeat, { snapWhenStopped: false });
    updatePlaybackKeyboardPitches(currentBeat);
    if (state.playhead.pointerId === null) {
      state.playhead.beat = visualBeat;
      updatePagedPlaybackScroll(now, visualBeat);
      updatePlayheadVisual();
    }
    if (now - state.playback.lastTimelineDrawAt >= 32) {
      state.playback.lastTimelineDrawAt = now;
      drawTimeline();
      updatePlaybackTimeInfo(currentBeat);
    }
    state.playback.animationFrame = requestAnimationFrame(playbackFrame);
  }

  function stopPlayback(resetToStart = false) {
    const wasPlaybackActive = state.playback.running || state.playback.loading;
    const stoppedBeat = state.playhead.beat;
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
      // While stopped, keep the editor cursor on the existing 1/64-note grid.
      // This preserves deterministic edit/select positions without forcing the
      // moving playback line to jump between those cells.
      if (wasPlaybackActive) {
        state.playhead.beat = getPlaybackVisualBeat(stoppedBeat);
      }
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
    seekPlayheadBeat(0);
    elements.rollViewport.scrollLeft = 0;
    updatePlayheadVisual();
    drawTimeline();
  }

  function moveToTimelineEnd() {
    stopPlayback(false);
    const endBeat = Math.max(getPlaybackEndBeat(), getPersistentContentEndBeat());
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
      version: 26,
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
      timelineFades: normalizeTimelineFades(),
      // v26: 페이드는 타임라인 마커(type/startBeat/durationBeat) 배열로 저장하며 원본 노트 볼륨은 변경하지 않습니다.
      // v23: 채널 악기는 현재 SoundFont의 실제 Bank/Preset을 저장하고, 색상은 hue(0..359)만 저장합니다.
      // 지원 음악 파일은 공통 플러그인을 거쳐 불러오는 즉시 일반 편집 채널로 변환됩니다.
      midiDocuments: [],
      audioClips: state.audioClips.map((clip) => ({ ...clip, assetAvailable: Boolean(getAudioRuntime(clip.id)?.audioBuffer) })),
      editor: {
        loadedFileName: state.loadedFileName,
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

  function markProjectSaved({ notify = true, message = "프로젝트를 저장했습니다." } = {}) {
    state.dirty = false;
    updateDirtyState();
    scheduleAutosave(0);
    if (notify && message) showToast(message);
  }

  function saveProject() {
    shrinkTimelineToContent();
    const data = JSON.stringify(serializeProject(), null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    const safeName = (state.projectName || "mobibard-project").replace(/[\/:*?"<>|]/g, "_");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeName}.mmlproj.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    markProjectSaved();
  }


  let audioOggExportBusy = false;

  function collectProjectAudioExportNotes() {
    const tempoMap = createTempoTimeMap();
    const notes = [];
    for (const channel of state.channels || []) {
      for (const note of channel.notes || []) {
        const fadedVolume = getTimelineFadedNoteVolume(note);
        const velocity = mmlVolumeToPlayerPlaybackVelocity(fadedVolume);
        if (velocity <= 0 || Number(note.durationBeat) <= 0) continue;
        const startBeat = Math.max(0, Number(note.startBeat) || 0);
        const endBeat = startBeat + Math.max(0, Number(note.durationBeat) || 0);
        const startSeconds = beatToSecondsFromMap(startBeat, tempoMap);
        const endSeconds = beatToSecondsFromMap(endBeat, tempoMap);
        if (!(endSeconds > startSeconds + 0.0001)) continue;
        notes.push({
          id: note.id,
          pitch: clamp(Math.round(Number(note.pitch) || 60), 0, 127),
          velocity,
          volume: fadedVolume,
          startBeat,
          endBeat,
          startSeconds,
          endSeconds,
          source: "channel",
          sourceId: channel.id,
          instrumentProgram: getChannelInstrumentProgram(channel),
          instrumentBank: getChannelInstrumentBank(channel),
          instrumentExactPreset: getChannelInstrumentExactPreset(channel),
        });
      }
    }
    notes.sort((left, right) => left.startSeconds - right.startSeconds || left.pitch - right.pitch);
    return notes;
  }

  function configureOfflineEditorEngine(context, notes) {
    const offlineEngine = new EditorSoundBankPlayer({
      bankNumber: 0,
      presetNumber: 0,
      volume: 1,
      maxVoices: Math.max(256, (notes?.length || 0) + 32),
      onStatus: () => {},
    });
    offlineEngine.context = context;
    offlineEngine.masterGain = context.createGain();
    offlineEngine.masterGain.gain.value = 1;
    offlineEngine.compressor = context.createDynamicsCompressor();
    offlineEngine.compressor.threshold.value = -12;
    offlineEngine.compressor.knee.value = 16;
    offlineEngine.compressor.ratio.value = 4;
    offlineEngine.compressor.attack.value = 0.003;
    offlineEngine.compressor.release.value = 0.2;
    offlineEngine.masterGain.connect(offlineEngine.compressor);
    offlineEngine.compressor.connect(context.destination);
    offlineEngine.soundBank = audioEngine.soundBank;
    offlineEngine.soundFont = audioEngine.soundFont;
    offlineEngine.soundFonts = new Map(audioEngine.soundFonts || []);
    offlineEngine.preparePromise = Promise.resolve(offlineEngine.soundFont);
    offlineEngine.mode = audioEngine.mode;
    return offlineEngine;
  }

  function editorAudioExportFileName() {
    const safeName = (state.projectName || "mobibard-project").replace(/[\/:*?"<>|]/g, "_").trim() || "mobibard-project";
    return `${safeName}.ogg`;
  }

  async function exportProjectAsAudioOgg() {
    if (audioOggExportBusy) return false;
    const exporter = window.MobibardAudioExport;
    if (!exporter?.renderAndDownloadOgg) {
      showToast(i18nText("audio.export_failed"));
      return false;
    }

    const notes = collectProjectAudioExportNotes();
    if (!notes.length) {
      showToast(i18nText("audio.export_no_notes"));
      return false;
    }
    const duration = notes.reduce((maximum, note) => Math.max(maximum, note.endSeconds), 0);
    if (!(duration > 0)) {
      showToast(i18nText("audio.export_no_notes"));
      return false;
    }

    audioOggExportBusy = true;
    if (elements.audioExportButton) elements.audioExportButton.disabled = true;
    showToast(i18nText("audio.exporting_ogg"));
    try {
      await audioEngine.prepare();
      const autoGainScale = computePlaybackAutoGainScale(notes, { windowStart: 0, windowEnd: duration });
      await exporter.renderAndDownloadOgg({
        fileName: editorAudioExportFileName(),
        durationSec: duration,
        tailSec: 3.65,
        vbrQuality: 5,
        render: async (context) => {
          const offlineEngine = configureOfflineEditorEngine(context, notes);
          for (let index = 0; index < notes.length; index += 1) {
            const note = notes[index];
            offlineEngine.playNote(
              note.pitch,
              note.velocity,
              0.01 + note.startSeconds,
              Math.max(0.003, note.endSeconds - note.startSeconds),
              {
                program: clamp(Number(note.instrumentProgram) || 0, 0, 127),
                bank: clamp(Number(note.instrumentBank) || 0, 0, 16383),
                exactPreset: Boolean(note.instrumentExactPreset),
                gainScale: autoGainScale,
                mmlVolume: Number.isFinite(Number(note.volume)) ? Number(note.volume) : null,
              },
            );
            if (index > 0 && index % 512 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
          }
        },
      });
      showToast(i18nText("audio.export_done"));
      return true;
    } catch (error) {
      console.error("Editor OGG audio export failed", error);
      showToast(`${i18nText("audio.export_failed")} ${String(error?.message || error || "")}`.trim());
      return false;
    } finally {
      audioOggExportBusy = false;
      if (elements.audioExportButton) elements.audioExportButton.disabled = false;
    }
  }

  const MIDI_EXPORT_MELODIC_CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);

  function midiExportSamePitchOverlap(leftNotes, rightNotes) {
    const byPitch = (notes) => {
      const map = new Map();
      for (const note of notes || []) {
        const pitch = clamp(Math.round(Number(note.pitch) || 60), 0, 127);
        if (!map.has(pitch)) map.set(pitch, []);
        map.get(pitch).push(note);
      }
      for (const list of map.values()) list.sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);
      return map;
    };
    const leftByPitch = byPitch(leftNotes);
    const rightByPitch = byPitch(rightNotes);
    for (const [pitch, left] of leftByPitch) {
      const right = rightByPitch.get(pitch);
      if (!right?.length) continue;
      let i = 0;
      let j = 0;
      while (i < left.length && j < right.length) {
        const a = left[i];
        const b = right[j];
        if (a.endTick <= b.startTick) i += 1;
        else if (b.endTick <= a.startTick) j += 1;
        else return true;
      }
    }
    return false;
  }

  function splitMidiExportActivityBlocks(lane) {
    const notes = (lane.notes || []).slice().sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick || a.pitch - b.pitch);
    const blocks = [];
    let current = null;
    for (const note of notes) {
      if (!current || note.startTick > current.endTick) {
        current = {
          signature: lane.signature,
          isDrums: lane.isDrums,
          program: lane.program,
          bank: lane.bank,
          names: lane.names.slice(),
          notes: [],
          startTick: note.startTick,
          endTick: note.endTick,
        };
        blocks.push(current);
      }
      current.notes.push(note);
      current.endTick = Math.max(current.endTick, note.endTick);
    }
    return blocks;
  }

  function packMidiExportActivityBlocks(blocks) {
    const lanes = [];
    for (const block of blocks.slice().sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick || a.signature.localeCompare(b.signature))) {
      const available = lanes.filter(lane => lane.endTick <= block.startTick);
      let target = available.find(lane => lane.lastSignature === block.signature) || null;
      if (!target && available.length) {
        target = available.slice().sort((a, b) => b.endTick - a.endTick)[0];
      }
      if (!target) {
        target = { isDrums: block.isDrums, segments: [], startTick: block.startTick, endTick: block.endTick, lastSignature: "" };
        lanes.push(target);
      }
      target.segments.push(block);
      target.startTick = Math.min(target.startTick, block.startTick);
      target.endTick = Math.max(target.endTick, block.endTick);
      target.lastSignature = block.signature;
    }
    return lanes;
  }

  function buildEditorMidiPacking(ppq = 480) {
    const parts = state.channels.map((channel, channelIndex) => {
      const isDrums = isChannelPercussionInstrument(channel);
      const program = getChannelInstrumentProgram(channel);
      const bank = getChannelInstrumentBank(channel);
      const useFixedDefaultPercussionPitch = isEditorUsingEmbeddedDefaultSoundBank() && bank === 0 && (program === 12 || program === 13);
      const fixedPercussionPitch = useFixedDefaultPercussionPitch ? (program === 12 ? 36 : 49) : null;
      const notes = (Array.isArray(channel?.notes) ? channel.notes : []).map((note) => {
        const fadedVolume = getTimelineFadedNoteVolume(note);
        const fadedVelocity = getNotePlaybackVelocityForVolume(note, fadedVolume);
        if (fadedVelocity <= 0) return null;
        const startTick = Math.max(0, Math.round((Number(note.startBeat) || 0) * ppq));
        const durationTick = Math.max(1, Math.round(Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat) * ppq));
        return {
          startTick,
          durationTick,
          endTick: startTick + durationTick,
          pitch: fixedPercussionPitch == null ? clamp(Math.round(Number(note.pitch) || 60), 0, 127) : fixedPercussionPitch,
          velocity: fadedVelocity,
        };
      }).filter(Boolean).sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.endTick - b.endTick);
      if (!notes.length) return null;
      return {
        sourceIndex: channelIndex,
        name: String(channel?.name || `Ch${channelIndex + 1}`),
        isDrums,
        program,
        bank,
        signature: isDrums ? "drums" : `${bank}:${program}`,
        notes,
        startTick: notes[0].startTick,
        endTick: Math.max(...notes.map(note => note.endTick)),
      };
    }).filter(Boolean);

    // Same-instrument Editor channels can share one MIDI channel as long as
    // overlapping equal pitches cannot make Note-Off events ambiguous.
    const instrumentLanes = [];
    for (const part of parts.slice().sort((a, b) => a.signature.localeCompare(b.signature) || a.startTick - b.startTick || a.sourceIndex - b.sourceIndex)) {
      let target = null;
      for (const lane of instrumentLanes) {
        if (lane.signature !== part.signature) continue;
        if (midiExportSamePitchOverlap(lane.notes, part.notes)) continue;
        target = lane;
        break;
      }
      if (!target) {
        target = {
          signature: part.signature,
          isDrums: part.isDrums,
          program: part.program,
          bank: part.bank,
          names: [],
          notes: [],
          startTick: part.startTick,
          endTick: part.endTick,
        };
        instrumentLanes.push(target);
      }
      target.names.push(part.name);
      target.notes.push(...part.notes);
      target.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.endTick - b.endTick);
      target.startTick = Math.min(target.startTick, part.startTick);
      target.endTick = Math.max(target.endTick, part.endTick);
    }

    // Split long instrument lanes at true silent gaps. This lets another
    // instrument reuse the same MIDI channel during the gap, then restores the
    // original program when that instrument returns. This is tighter than using
    // only each lane's first/last note range.
    const activityBlocks = instrumentLanes.flatMap(splitMidiExportActivityBlocks);
    const melodicLanes = packMidiExportActivityBlocks(activityBlocks.filter(block => !block.isDrums));
    const drumLanes = packMidiExportActivityBlocks(activityBlocks.filter(block => block.isDrums));
    const packedLanes = [...melodicLanes, ...drumLanes];

    const portCount = Math.max(1, Math.ceil(melodicLanes.length / MIDI_EXPORT_MELODIC_CHANNELS.length), drumLanes.length);
    if (portCount > 128) {
      throw new Error(i18nText("midi.export_port_limit", [portCount]));
    }

    const physicalTracks = Array.from({ length: portCount }, (_, port) => ({
      name: port === 0 ? String(state.projectName || "MobiBard Editor") : `MobiBard Extension ${port + 1}`,
      midiPort: port,
      omitName: port === 0,
      suppressInitialProgram: true,
      channel: 0,
      notes: [],
      programChanges: [],
    }));

    melodicLanes.forEach((lane, index) => {
      const port = Math.floor(index / MIDI_EXPORT_MELODIC_CHANNELS.length);
      const channel = MIDI_EXPORT_MELODIC_CHANNELS[index % MIDI_EXPORT_MELODIC_CHANNELS.length];
      const track = physicalTracks[port];
      let previousSignature = null;
      lane.segments.sort((a, b) => a.startTick - b.startTick).forEach(segment => {
        if (segment.signature !== previousSignature) {
          track.programChanges.push({
            tick: segment.startTick,
            channel,
            program: segment.program,
            bank: segment.bank,
          });
          previousSignature = segment.signature;
        }
        for (const note of segment.notes) track.notes.push({ ...note, channel });
      });
    });

    drumLanes.forEach((lane, index) => {
      const track = physicalTracks[index];
      const channel = 9;
      for (const segment of lane.segments) {
        for (const note of segment.notes) track.notes.push({ ...note, channel });
      }
    });

    for (const track of physicalTracks) {
      track.notes.sort((a, b) => a.startTick - b.startTick || a.channel - b.channel || a.pitch - b.pitch);
      track.programChanges.sort((a, b) => a.tick - b.tick || a.channel - b.channel);
    }

    return {
      editorChannelCount: parts.length,
      midiChannelCount: packedLanes.length,
      portCount,
      extended: portCount > 1,
      physicalTracks,
      noteCount: parts.reduce((sum, part) => sum + part.notes.length, 0),
    };
  }

  function exportProjectAsMidi() {
    const buildMidi = window.MabiMusicFormats?.buildMidi;
    if (typeof buildMidi !== "function") {
      showToast(i18nText("midi.export_module_unavailable"));
      return false;
    }

    const ppq = 480;
    const tempoEvents = getSortedTempos().map((tempo) => ({
      tick: Math.max(0, Math.round((Number(tempo.beat) || 0) * ppq)),
      bpm: clamp(Math.round(Number(tempo.bpm) || 120), CONFIG.minTempo, CONFIG.maxTempo),
    }));
    if (!tempoEvents.length || tempoEvents[0].tick > 0) {
      tempoEvents.unshift({ tick: 0, bpm: 120 });
    }

    let packing;
    try {
      packing = buildEditorMidiPacking(ppq);
      if (!packing.noteCount) {
        showToast(i18nText("midi.export_no_notes"));
        return false;
      }
      const bytes = buildMidi({
        ppq,
        title: String(state.projectName || "MobiBard Editor"),
        tempoEvents,
        timeSignatures: [{ tick: 0, numerator: CONFIG.beatsPerMeasure, denominator: 4 }],
        tracks: packing.physicalTracks,
        mergeMetaIntoFirstTrack: true,
      });
      const blob = new Blob([bytes], { type: "audio/midi" });
      const safeName = (state.projectName || "mobibard-project").replace(/[\/:*?"<>|]/g, "_");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName}.mid`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (packing.extended) {
        showToast(i18nText("midi.export_extended", [packing.portCount, packing.midiChannelCount]));
      } else {
        showToast(i18nText("midi.export_standard", [packing.midiChannelCount, packing.noteCount]));
      }
      return true;
    } catch (error) {
      console.error("MIDI export failed", error);
      showToast(i18nText("midi.fail_create_file"));
      return false;
    }
  }

  function openMidiExtractionSupport() {
    window.open("https://muscriptor.kyutai.org/", "_blank", "noopener,noreferrer");
    return true;
  }

  async function loadProjectFromFile(file, { notify = true, loadedFileName = null } = {}) {
    state.soloChannelIds.clear();
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
    state.loadedFileName = loadedFileName == null
      ? String(file?.name || "").trim()
      : String(loadedFileName || "").trim();
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
      getRawTimelineFadeEndBeat(data.timelineFades, data.tempos),
      Math.max(0, Number(data.editor?.playheadBeat) || 0),
    );
    state.timelineBeats = Math.max(
      CONFIG.beatsPerMeasure,
      Number(data.editor?.timelineBeats) || 0,
      loadedContentEndBeat + CONFIG.minimumNoteBeat,
    );
    state.timelineFades = normalizeTimelineFades(data.timelineFades || [], data.tempos);
    state.channels = data.channels.map((channel, index) => ({
      id: Number(channel.id) || index + 1,
      name: String(channel.name || `Ch${Number(channel.id) || index + 1}`),
      hue: getChannelHue(channel, index),
      muted: Boolean(channel.muted),
      visible: channel.visible !== false,
      instrument: String(channel.instrument || "Piano"),
      instrumentProgram: clamp(Math.round(Number(channel.instrumentProgram ?? getInstrumentProgramFromName(channel.instrument)) || 0), 0, 127),
      instrumentBank: clamp(Math.round(Number(channel.instrumentBank ?? (isDrumInstrumentName(channel.instrument) ? 128 : 0)) || 0), 0, 16383),
      instrumentExactPreset: channel.instrumentExactPreset === true,
      defaultNoteVolume: clamp(
        Math.round(Number(channel.defaultNoteVolume ?? CONFIG.defaultNewChannelNoteVolume) || CONFIG.defaultNewChannelNoteVolume),
        0,
        15,
      ),
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
    state.fadeDrag = null;
    state.dirty = false;

    if (getEditorSoundBankPresets().length) {
      reconcileEditorChannelsWithSoundBank();
      populateChannelInstrumentSelect();
    }
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
    state.soloChannelIds.clear();
    state.channelNoteRuntime.clear();
    state.collapsedMidiDocumentIds.clear();
    state.collapsedChannelGroups = { edit: false, source: false };
    stopPlayback(true);
    releaseKeyboardVoice(true);
    clearEditorPitchPreview(true);
    state.projectName = "새 프로젝트";
    state.loadedFileName = "";
    state.snapValue = 4;
    state.rowHeight = CONFIG.defaultRowHeight;
    state.zoom = 1;
    state.timelineBeats = CONFIG.beatsPerMeasure;
    state.activeChannel = 0;
    state.activePanel = "notes";
    state.editTool = "note";
    state.ctrlToolHeld = false;
    state.playhead.beat = 0;
    stopRollDragAutoScroll();
    state.interaction = null;
    state.tempoDrag = null;
    state.fadeDrag = null;
    clearNoteSelection();
    state.nextNoteId = 1;
    state.nextTempoId = 2;
    state.channels = createDefaultChannels();
    state.tempos = createDefaultTempos();
    state.timelineFades = [];
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

  async function requestNewProject({ notify = true } = {}) {
    if (state.dirty) {
      const confirmed = await showConfirmDialog({
        title: "새 파일",
        message: "저장되지 않은 변경사항이 있습니다. 정말 새 파일을 만들까요? 현재 변경사항은 사라집니다.",
        confirmLabel: "새 파일",
      });
      if (!confirmed) return false;
    }
    resetProject({ notify });
    return true;
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
      message: i18nText("source.delete_confirm", [document.title || document.fileName || i18nText("selection.source_data")]),
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
    if (state.fadeDrag?.pointerId === pointerId) {
      state.timelineFades = normalizeTimelineFades().map((fade) =>
        String(fade.id) === String(state.fadeDrag.fadeId) ? { ...fade, startBeat: state.fadeDrag.originalBeat } : fade
      );
      state.fadeDrag = null;
      try { elements.timelineCanvas.releasePointerCapture(pointerId); } catch {}
      drawTimeline();
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
      "#timelineCanvas, #rollCanvas, #keyboardCanvas, .channel-tab-item, .history-item, [data-context-area='midi-instrument'], .channel-detail-toolbar, #channelPanel",
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

    // 채널 음소거 버튼의 오른쪽 클릭은 일반 컨텍스트 메뉴 대신 싱글(Solo) 토글로 사용합니다.
    // document 캡처 단계에서 처리해 채널 항목 컨텍스트 메뉴가 뒤이어 열리지 않게 합니다.
    const channelMuteButton = event.target?.closest?.(".channel-tree-channel-item .channel-tree-mute");
    if (channelMuteButton) {
      const channelItem = channelMuteButton.closest(".channel-tree-channel-item");
      const channelId = channelItem?.dataset?.channelId;
      if (channelId) {
        event.stopPropagation();
        resetChannelActionSweep({ releaseCapture: true });
        closeContextMenu();
        setChannelSoloById(channelId, !isChannelSolo(channelId));
        return;
      }
    }

    const area = resolveContextArea(event.target);
    if (area.name === "topbar") {
      closeContextMenu();
      return;
    }
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
    if (area.name === "timeline") {
      // Right-click actions should always show exactly which timeline position they target.
      // If playback is active, seek there without leaving playback stopped.
      seekPlayheadBeat(timelineBeatFromPointer(event));
    }
    if (area.name === "piano-roll") {
      const point = pointerToRoll(event);
      const clicked = !isMidiReferenceActive() ? findNoteAt(point.x, point.y) : null;
      const preserveSelectedNotePlayhead = Boolean(clicked && state.selectedNoteIds.has(clicked.id));
      // Empty space and unselected notes target the snapped right-click position.
      // A context click on an already-selected note keeps the existing playhead so
      // note-only operations do not unexpectedly change the editing cursor.
      if (!preserveSelectedNotePlayhead) {
        seekPlayheadBeat(clamp(snapBeat(xToBeat(point.x)), 0, getTotalBeats()));
      }
    }
    if (area.name === "piano-roll" && !isMidiReferenceActive()) {
      const point = pointerToRoll(event);
      if (!findNoteAt(point.x, point.y)) {
        clearNoteSelection();
        drawRoll();
        updateChannelInfo();
      }
    }
    const factory = contextMenuRegistry.get(area.name) || contextMenuRegistry.get("app");
    const items = factory?.({ event, area, state }) || [];
    renderContextMenu(items, event.clientX, event.clientY, area.name, event);
  }

  function getContextMenuTitle(areaName, event = null) {
    if (areaName === "piano-roll") {
      if (isMidiReferenceActive()) return i18nText("context.source_notes");
      const point = event ? pointerToRoll(event) : null;
      const clicked = point ? findNoteAt(point.x, point.y) : null;
      return i18nText(clicked ? "context.note_edit" : "context.channel_roll");
    }
    const keyByArea = {
      app: "context.editor",
      "piano-section": "context.piano_nav",
      timeline: "context.timeline",
      keyboard: "context.keyboard",
      "overview-timeline": "context.overview",
      "audio-lane": "context.audio_track",
      "audio-source": "context.audio_source",
      "channel-panel": "context.channel_list",
      "channel-tabs": "context.channel_list",
      "channel-tab": "context.channel_item",
      "midi-reference-tab": "context.source_data_item",
      "midi-reference": "context.source_data",
      "midi-instrument": "context.source_instrument",
      "channel-info": "context.channel_info",
      history: "context.history",
      "history-item": "context.history_item",
      splitter: "context.layout",
    };
    return i18nText(keyByArea[areaName] || "context.editor");
  }

  function renderContextMenu(items, x, y, areaName, event = null) {
    elements.contextMenu.replaceChildren();

    const label = document.createElement("div");
    label.className = "menu-label";
    label.textContent = getContextMenuTitle(areaName, event);
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

  function getSelectedSamePitchMergePlan() {
    if (isMidiReferenceActive() || state.activePanel !== "notes") return null;
    const channel = getActiveChannel();
    if (!channel || state.selectedNoteIds.size < 2) return null;

    const selectedIds = new Set(state.selectedNoteIds);
    const ordered = sortNoteIntervals(channel.notes);
    const groups = [];
    let current = [];

    const flush = () => {
      if (current.length >= 2) groups.push(current);
      current = [];
    };

    // Only neighboring selected notes in the channel's actual timeline order may
    // be joined. An unselected note or a different pitch splits the run, so a
    // non-mergeable section never prevents other mergeable runs from succeeding.
    for (const note of ordered) {
      if (!selectedIds.has(note.id)) {
        flush();
        continue;
      }
      if (!current.length || Number(current[0].pitch) === Number(note.pitch)) {
        current.push(note);
      } else {
        flush();
        current = [note];
      }
    }
    flush();

    if (!groups.length) return null;
    return {
      channel,
      groups,
      selectedIds,
      mergeNoteCount: groups.reduce((sum, group) => sum + group.length, 0),
    };
  }

  function mergeSelectedSamePitchNotes() {
    const plan = getSelectedSamePitchMergePlan();
    if (!plan) return false;

    const removeIds = new Set();
    const nextSelection = new Set(plan.selectedIds);
    for (const group of plan.groups) {
      const survivor = group[0];
      const startBeat = Math.min(...group.map((note) => Number(note.startBeat) || 0));
      const endBeat = Math.max(...group.map((note) =>
        (Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat)
      ));
      survivor.startBeat = Number(startBeat.toFixed(6));
      survivor.durationBeat = Number(Math.max(CONFIG.minimumNoteBeat, endBeat - startBeat).toFixed(6));
      for (const note of group.slice(1)) {
        removeIds.add(note.id);
        nextSelection.delete(note.id);
      }
    }

    plan.channel.notes = plan.channel.notes.filter((note) => !removeIds.has(note.id));
    state.selectedNoteIds = nextSelection;
    state.channelNoteRuntime.delete(String(plan.channel.id));
    markDirty("선택 노트 합침");
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(i18nText("note.merge_same_pitch", [plan.mergeNoteCount, plan.groups.length]));
    return true;
  }

  function closeNoteTrillDialog() {
    if (elements.noteTrillBackdrop) elements.noteTrillBackdrop.hidden = true;
  }

  const TRILL_RATE_BEATS = Object.freeze({
    "1/4": 1,
    "1.5/8": 0.75,
    "1/8": 0.5,
    "1.5/16": 0.375,
    "1/16": 0.25,
    "1.5/32": 0.1875,
    "1/32": 0.125,
    "1/64": CONFIG.minimumNoteBeat,
  });

  function normalizeTrillDivision(value, fallback = "1/32") {
    const raw = String(value ?? "").trim();
    if (Object.prototype.hasOwnProperty.call(TRILL_RATE_BEATS, raw)) return raw;
    // Keep old project/runtime values such as 16/32/64 compatible.
    const numeric = Math.round(Number(raw) || 0);
    const legacy = `1/${numeric}`;
    if (Object.prototype.hasOwnProperty.call(TRILL_RATE_BEATS, legacy)) return legacy;
    const safeFallback = String(fallback ?? "1/32");
    if (Object.prototype.hasOwnProperty.call(TRILL_RATE_BEATS, safeFallback)) return safeFallback;
    const legacyFallback = `1/${Math.round(Number(fallback) || 32)}`;
    return Object.prototype.hasOwnProperty.call(TRILL_RATE_BEATS, legacyFallback) ? legacyFallback : "1/32";
  }

  function trillDivisionBeat(value, fallback = "1/32") {
    return Math.max(CONFIG.minimumNoteBeat, Number(TRILL_RATE_BEATS[normalizeTrillDivision(value, fallback)]) || 0.125);
  }

  function readNoteTrillOptionsFromUi() {
    const directionValue = String(elements.noteTrillDirectionSelect?.value || "up");
    const direction = ["repeat", "up", "down"].includes(directionValue) ? directionValue : "up";
    const intervalSemitones = Number(elements.noteTrillIntervalSelect?.value) === 1 ? 1 : 2;
    const startDivision = normalizeTrillDivision(elements.noteTrillStartDivisionSelect?.value, "1/32");
    const endDivision = normalizeTrillDivision(elements.noteTrillEndDivisionSelect?.value, startDivision);
    const gradualSpeed = Boolean(elements.noteTrillGradualSpeed?.checked);
    const dynamicsValue = String(elements.noteTrillDynamicsSelect?.value || "preserve");
    const dynamics = ["preserve", "crescendo", "decrescendo", "swell"].includes(dynamicsValue)
      ? dynamicsValue
      : "preserve";
    const volumeRange = clamp(Math.round(Number(elements.noteTrillVolumeRangeSelect?.value) || 3), 1, 5);
    const startWith = elements.noteTrillStartNoteSelect?.value === "neighbor" ? "neighbor" : "base";
    return {
      direction,
      intervalSemitones,
      startDivision,
      gradualSpeed,
      endDivision,
      dynamics,
      volumeRange,
      startWith,
      endOnBase: elements.noteTrillEndOnBase?.checked !== false,
    };
  }

  function updateNoteTrillOptionAvailability() {
    const repeatOnly = String(elements.noteTrillDirectionSelect?.value || "up") === "repeat";
    if (elements.noteTrillIntervalSelect) elements.noteTrillIntervalSelect.disabled = repeatOnly;
    if (elements.noteTrillStartNoteSelect) elements.noteTrillStartNoteSelect.disabled = repeatOnly;
    if (elements.noteTrillEndOnBase) elements.noteTrillEndOnBase.disabled = repeatOnly;
    elements.noteTrillStartEndRow?.classList.toggle("is-disabled", repeatOnly);

    const gradualSpeed = Boolean(elements.noteTrillGradualSpeed?.checked);
    if (elements.noteTrillEndDivisionSelect) elements.noteTrillEndDivisionSelect.disabled = !gradualSpeed;
    const dynamicsEnabled = String(elements.noteTrillDynamicsSelect?.value || "preserve") !== "preserve";
    if (elements.noteTrillVolumeRangeSelect) elements.noteTrillVolumeRangeSelect.disabled = !dynamicsEnabled;
    elements.noteTrillEndDivisionSelect?.closest(".note-trill-subcontrol")?.classList.toggle("is-disabled", !gradualSpeed);
    elements.noteTrillVolumeRangeSelect?.closest(".note-trill-subcontrol")?.classList.toggle("is-disabled", !dynamicsEnabled);
    updateNoteTrillPreview();
  }

  function openNoteTrillDialog() {
    const selected = getSelectedNotes();
    if (!selected.length) {
      showToast(i18nText("note.trill_need_selection"));
      return false;
    }
    const options = state.trillOptions || {};
    if (elements.noteTrillSelectionLabel) {
      elements.noteTrillSelectionLabel.textContent = i18nText("note.trill_selected_count", [selected.length]);
    }
    const direction = ["repeat", "up", "down"].includes(String(options.direction)) ? String(options.direction) : "up";
    if (elements.noteTrillDirectionSelect) elements.noteTrillDirectionSelect.value = direction;
    if (elements.noteTrillIntervalSelect) elements.noteTrillIntervalSelect.value = String(Number(options.intervalSemitones) === 1 ? 1 : 2);
    if (elements.noteTrillStartDivisionSelect) elements.noteTrillStartDivisionSelect.value = normalizeTrillDivision(options.startDivision, "1/32");
    if (elements.noteTrillGradualSpeed) elements.noteTrillGradualSpeed.checked = Boolean(options.gradualSpeed);
    if (elements.noteTrillEndDivisionSelect) elements.noteTrillEndDivisionSelect.value = normalizeTrillDivision(options.endDivision, options.startDivision || "1/32");
    if (elements.noteTrillDynamicsSelect) {
      const value = String(options.dynamics || "preserve");
      elements.noteTrillDynamicsSelect.value = ["preserve", "crescendo", "decrescendo", "swell"].includes(value) ? value : "preserve";
    }
    if (elements.noteTrillVolumeRangeSelect) elements.noteTrillVolumeRangeSelect.value = String(clamp(Math.round(Number(options.volumeRange) || 3), 1, 5));
    if (elements.noteTrillStartNoteSelect) elements.noteTrillStartNoteSelect.value = options.startWith === "neighbor" ? "neighbor" : "base";
    if (elements.noteTrillEndOnBase) elements.noteTrillEndOnBase.checked = options.endOnBase !== false;
    updateNoteTrillOptionAvailability();
    if (elements.noteTrillBackdrop) elements.noteTrillBackdrop.hidden = false;
    requestAnimationFrame(() => elements.noteTrillDirectionSelect?.focus());
    return true;
  }

  function buildTrillSegmentDurations(durationBeat, options) {
    const minimum = CONFIG.minimumNoteBeat;
    const duration = Math.max(minimum, Number(durationBeat) || minimum);
    const startUnit = trillDivisionBeat(options.startDivision, "1/32");
    const endUnit = trillDivisionBeat(options.endDivision, options.startDivision || "1/32");
    const durations = [];
    let cursor = 0;
    let remaining = duration;
    let guard = 0;

    while (remaining > 1e-7 && guard < 4096) {
      guard += 1;
      const progress = duration > minimum ? clamp(cursor / duration, 0, 1) : 0;
      const interpolated = options.gradualSpeed
        ? startUnit + (endUnit - startUnit) * progress
        : startUnit;
      // The editor resolves note positions/durations at 1/64. Dotted 1/32 and
      // longer dotted values are exact multiples of this unit; gradual ramps are
      // rounded to the same grid so the result remains editable.
      const unit = Math.max(minimum, Math.round(interpolated / minimum) * minimum);
      let piece = Math.min(unit, remaining);
      const leftover = remaining - piece;
      if (leftover > 1e-7 && leftover < minimum - 1e-7) {
        piece = remaining;
      }
      if (piece < minimum - 1e-7) {
        if (durations.length) durations[durations.length - 1] += remaining;
        else durations.push(remaining);
        remaining = 0;
        break;
      }
      durations.push(piece);
      remaining -= piece;
      cursor += piece;
    }
    if (remaining > 1e-7 && durations.length) durations[durations.length - 1] += remaining;
    if (options.gradualSpeed && endUnit > startUnit + 1e-7) {
      while (durations.length >= 2 && durations[durations.length - 1] < durations[durations.length - 2] - 1e-7) {
        durations[durations.length - 2] += durations.pop();
      }
    }
    return durations.map((value) => Number(value.toFixed(6)));
  }

  function getTrillNeighborPitch(basePitch, options) {
    if (options.direction === "repeat") return basePitch;
    const interval = Number(options.intervalSemitones) === 1 ? 1 : 2;
    const direction = options.direction === "down" ? -1 : 1;
    let candidate = basePitch + direction * interval;
    if (candidate < CONFIG.minPitch || candidate > CONFIG.maxPitch) {
      candidate = basePitch - direction * interval;
    }
    return clamp(candidate, CONFIG.minPitch, CONFIG.maxPitch);
  }

  function getTrillSegmentVolume(baseVolume, options, progress) {
    const source = clamp(Math.round(Number(baseVolume) || 0), 0, 15);
    const range = clamp(Math.round(Number(options.volumeRange) || 3), 1, 5);
    const p = clamp(Number(progress) || 0, 0, 1);
    if (options.dynamics === "crescendo") {
      return clamp(source + Math.round(range * p), 0, 15);
    }
    if (options.dynamics === "decrescendo") {
      return clamp(source - Math.round(range * p), 0, 15);
    }
    if (options.dynamics === "swell") {
      const factor = 1 - 4 * Math.abs(p - 0.5); // -1 → +1 → -1
      return clamp(source + Math.round(range * factor), 0, 15);
    }
    return source;
  }

  function buildTrillPattern(durationBeat, basePitch, baseVolume, options) {
    const pieceDurations = buildTrillSegmentDurations(durationBeat, options);
    if (!pieceDurations.length) return [];
    const repeatOnly = options.direction === "repeat";
    const neighborPitch = repeatOnly ? basePitch : getTrillNeighborPitch(basePitch, options);
    const originalSegmentCount = pieceDurations.length;
    const durations = pieceDurations.slice();

    // When forcing a trill to end on the base pitch would create two adjacent
    // base attacks, extend the previous base note instead of retriggering it.
    if (!repeatOnly && options.endOnBase !== false && durations.length >= 2) {
      const previousIndex = durations.length - 2;
      const previousAlternateIndex = previousIndex + (options.startWith === "neighbor" ? 1 : 0);
      const previousPitch = previousAlternateIndex % 2 === 0 ? basePitch : neighborPitch;
      if (previousPitch === basePitch) {
        durations[previousIndex] = Number((durations[previousIndex] + durations[previousIndex + 1]).toFixed(6));
        durations.pop();
      }
    }

    return durations.map((pieceDuration, segmentIndex) => {
      const progress = originalSegmentCount > 1 ? segmentIndex / (originalSegmentCount - 1) : 0;
      let pitch = basePitch;
      if (!repeatOnly) {
        const alternateIndex = segmentIndex + (options.startWith === "neighbor" ? 1 : 0);
        pitch = alternateIndex % 2 === 0 ? basePitch : neighborPitch;
        if (options.endOnBase !== false && segmentIndex === durations.length - 1) pitch = basePitch;
      }
      const volume = options.dynamics && options.dynamics !== "preserve"
        ? getTrillSegmentVolume(baseVolume, options, progress)
        : baseVolume;
      return {
        durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, pieceDuration).toFixed(6)),
        pitch,
        volume,
        progress,
      };
    });
  }

  function updateNoteTrillPreview() {
    const grid = elements.noteTrillPreviewGrid;
    if (!grid) return;
    grid.replaceChildren();

    const options = readNoteTrillOptionsFromUi();
    const selected = getSelectedNotes();
    const sampleNote = selected[0] || null;
    const basePitch = clamp(Math.round(Number(sampleNote?.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
    const baseVolume = getNoteVolume(sampleNote || {}, CONFIG.defaultNewChannelNoteVolume);
    const pattern = buildTrillPattern(CONFIG.beatsPerMeasure, basePitch, baseVolume, options);
    const repeatOnly = options.direction === "repeat";
    const neighborPitch = repeatOnly ? basePitch : getTrillNeighborPitch(basePitch, options);
    const pitches = repeatOnly
      ? [basePitch]
      : (neighborPitch > basePitch ? [neighborPitch, basePitch] : [basePitch, neighborPitch]);
    const lanes = new Map();

    for (const pitch of pitches) {
      const row = document.createElement("div");
      row.className = "note-trill-preview-row";
      const label = document.createElement("span");
      label.className = "note-trill-preview-pitch";
      label.textContent = noteLabel(pitch);
      const lane = document.createElement("div");
      lane.className = "note-trill-preview-lane";
      row.append(label, lane);
      grid.append(row);
      lanes.set(pitch, lane);
    }

    let cursor = 0;
    const total = CONFIG.beatsPerMeasure;
    for (const segment of pattern) {
      const lane = lanes.get(segment.pitch) || lanes.get(basePitch);
      if (!lane) continue;
      const note = document.createElement("div");
      note.className = "note-trill-preview-note";
      const leftPercent = clamp((cursor / total) * 100, 0, 100);
      const widthPercent = clamp((segment.durationBeat / total) * 100, 0, 100 - leftPercent);
      note.style.left = `${leftPercent}%`;
      note.style.width = `max(2px, calc(${widthPercent}% - 1px))`;
      note.style.opacity = String(0.34 + (clamp(segment.volume, 0, 15) / 15) * 0.66);
      note.title = `${noteLabel(segment.pitch)} · V${segment.volume}`;
      if (widthPercent >= 8) note.textContent = `V${segment.volume}`;
      lane.append(note);
      cursor += segment.durationBeat;
    }
  }

  function convertSelectedNotesToTrill(options = state.trillOptions || {}) {
    if (isMidiReferenceActive() || state.activePanel !== "notes") return false;
    const channel = getActiveChannel();
    if (!channel?.notes?.length || !state.selectedNoteIds.size) return false;

    const selectedIds = new Set(state.selectedNoteIds);
    const nextNotes = [];
    const nextSelection = new Set();
    let convertedCount = 0;

    for (const note of channel.notes) {
      if (!selectedIds.has(note.id)) {
        nextNotes.push(note);
        continue;
      }

      const startBeat = Math.max(0, Number(note.startBeat) || 0);
      const durationBeat = Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
      const basePitch = clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
      const baseVolume = getNoteVolume(note, CONFIG.defaultNewChannelNoteVolume);
      const pattern = buildTrillPattern(durationBeat, basePitch, baseVolume, options);
      if (pattern.length < 2) {
        nextNotes.push(note);
        nextSelection.add(note.id);
        continue;
      }

      let cursor = startBeat;
      convertedCount += 1;
      pattern.forEach((patternNote, segmentIndex) => {
        const segmentId = segmentIndex === 0 ? note.id : state.nextNoteId++;
        const segment = {
          ...note,
          id: segmentId,
          pitch: patternNote.pitch,
          startBeat: Number(cursor.toFixed(6)),
          durationBeat: patternNote.durationBeat,
        };
        if (options.dynamics && options.dynamics !== "preserve") {
          segment.volume = patternNote.volume;
          segment.velocity = mmlVolumeToVelocity(patternNote.volume);
        }
        nextNotes.push(segment);
        nextSelection.add(segmentId);
        cursor += patternNote.durationBeat;
      });
    }

    if (!convertedCount) {
      showToast(i18nText("note.trill_no_change"));
      return false;
    }

    channel.notes = normalizeMonophonicNotes(nextNotes);
    const survivingIds = new Set(channel.notes.map((note) => note.id));
    state.selectedNoteIds = new Set([...nextSelection].filter((noteId) => survivingIds.has(noteId)));
    state.channelNoteRuntime.delete(String(channel.id));
    markDirty(i18nText("history.note_trill"));
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(i18nText("note.trill_done", [convertedCount]));
    return true;
  }

  function applySelectedNotesToTrill() {
    const options = readNoteTrillOptionsFromUi();
    state.trillOptions = { ...options };
    const changed = convertSelectedNotesToTrill(options);
    if (changed) closeNoteTrillDialog();
    return changed;
  }

  function closeNotePerformanceDialog() {
    if (elements.notePerformanceBackdrop) elements.notePerformanceBackdrop.hidden = true;
  }

  function normalizePerformanceMode(value) {
    const mode = String(value || "glissando");
    return ["glissando", "strum"].includes(mode) ? mode : "glissando";
  }

  function readNotePerformanceOptionsFromUi() {
    const mode = normalizePerformanceMode(elements.notePerformanceModeSelect?.value);
    const directionValue = String(elements.notePerformanceDirectionSelect?.value || "up");
    const direction = directionValue === "down" ? "down" : "up";
    const speed = normalizeTrillDivision(elements.notePerformanceSpeedSelect?.value, "1/32");
    const stepSemitones = Number(elements.notePerformanceStepSelect?.value) === 2 ? 2 : 1;
    const rangeModeValue = String(elements.notePerformanceRangeModeSelect?.value || "amount");
    const rangeMode = rangeModeValue === "target" ? "target" : "amount";
    const rangeRaw = Math.round(Number(elements.notePerformanceRangeSelect?.value) || 12);
    const rangeSemitones = [5, 7, 12, 24].includes(rangeRaw) ? rangeRaw : 12;
    const targetPitch = clamp(Math.round(Number(elements.notePerformanceTargetPitchSelect?.value) || 72), CONFIG.minPitch, CONFIG.maxPitch);
    const dynamicsValue = String(elements.notePerformanceDynamicsSelect?.value || "preserve");
    const dynamics = ["preserve", "crescendo", "decrescendo", "swell"].includes(dynamicsValue)
      ? dynamicsValue
      : "preserve";
    const volumeRange = clamp(Math.round(Number(elements.notePerformanceVolumeRangeSelect?.value) || 3), 1, 5);
    return { mode, direction, speed, stepSemitones, rangeMode, rangeSemitones, targetPitch, dynamics, volumeRange };
  }

  function performanceModeHelpKey(mode) {
    if (mode === "strum") return "note.performance_help_strum";
    return "note.performance_help_glissando";
  }

  function ensureNotePerformanceTargetPitchOptions() {
    const select = elements.notePerformanceTargetPitchSelect;
    if (!select || select.options.length) return;
    for (let pitch = CONFIG.minPitch; pitch <= CONFIG.maxPitch; pitch += 1) {
      const option = document.createElement("option");
      option.value = String(pitch);
      option.textContent = noteLabel(pitch);
      select.append(option);
    }
  }

  function updateNotePerformanceOptionAvailability() {
    const options = readNotePerformanceOptionsFromUi();
    const isGlissando = options.mode === "glissando";
    const targetMode = isGlissando && options.rangeMode === "target";
    if (elements.notePerformanceDirectionSelect) elements.notePerformanceDirectionSelect.disabled = targetMode;
    if (elements.notePerformanceStepSelect) elements.notePerformanceStepSelect.disabled = !isGlissando;
    if (elements.notePerformanceRangeModeSelect) elements.notePerformanceRangeModeSelect.disabled = !isGlissando;
    if (elements.notePerformanceRangeSelect) {
      elements.notePerformanceRangeSelect.disabled = !isGlissando || targetMode;
      elements.notePerformanceRangeSelect.hidden = targetMode;
    }
    if (elements.notePerformanceTargetPitchSelect) {
      elements.notePerformanceTargetPitchSelect.disabled = !targetMode;
      elements.notePerformanceTargetPitchSelect.hidden = !targetMode;
    }
    elements.notePerformanceDirectionRow?.classList.toggle("is-disabled", targetMode);
    elements.notePerformanceStepRow?.classList.toggle("is-disabled", !isGlissando);
    elements.notePerformanceRangeRow?.classList.toggle("is-disabled", !isGlissando);
    const dynamicsEnabled = options.dynamics !== "preserve";
    if (elements.notePerformanceVolumeRangeSelect) elements.notePerformanceVolumeRangeSelect.disabled = !dynamicsEnabled;
    elements.notePerformanceVolumeRangeSelect?.closest(".note-trill-subcontrol")?.classList.toggle("is-disabled", !dynamicsEnabled);
    if (elements.notePerformanceHelp) {
      const helpKey = targetMode ? "note.performance_help_glissando_target" : performanceModeHelpKey(options.mode);
      elements.notePerformanceHelp.textContent = i18nText(helpKey);
    }
    updateNotePerformancePreview();
  }

  function openNotePerformanceDialog() {
    const selected = getSelectedNotes();
    if (!selected.length) {
      showToast(i18nText("note.performance_need_selection"));
      return false;
    }
    const options = state.performanceOptions || {};
    ensureNotePerformanceTargetPitchOptions();
    if (elements.notePerformanceSelectionLabel) {
      elements.notePerformanceSelectionLabel.textContent = i18nText("note.performance_selected_count", [selected.length]);
    }
    if (elements.notePerformanceModeSelect) elements.notePerformanceModeSelect.value = normalizePerformanceMode(options.mode);
    if (elements.notePerformanceDirectionSelect) elements.notePerformanceDirectionSelect.value = options.direction === "down" ? "down" : "up";
    if (elements.notePerformanceSpeedSelect) elements.notePerformanceSpeedSelect.value = normalizeTrillDivision(options.speed, "1/32");
    if (elements.notePerformanceStepSelect) elements.notePerformanceStepSelect.value = String(Number(options.stepSemitones) === 2 ? 2 : 1);
    if (elements.notePerformanceRangeModeSelect) elements.notePerformanceRangeModeSelect.value = options.rangeMode === "target" ? "target" : "amount";
    if (elements.notePerformanceRangeSelect) {
      const range = [5, 7, 12, 24].includes(Number(options.rangeSemitones)) ? Number(options.rangeSemitones) : 12;
      elements.notePerformanceRangeSelect.value = String(range);
    }
    if (elements.notePerformanceTargetPitchSelect) {
      const firstPitch = clamp(Math.round(Number(selected[0]?.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
      const fallbackTarget = clamp(firstPitch + (options.direction === "down" ? -12 : 12), CONFIG.minPitch, CONFIG.maxPitch);
      const hasTargetPitch = options.targetPitch !== null
        && options.targetPitch !== undefined
        && options.targetPitch !== ""
        && Number.isFinite(Number(options.targetPitch));
      const targetPitch = hasTargetPitch
        ? clamp(Math.round(Number(options.targetPitch)), CONFIG.minPitch, CONFIG.maxPitch)
        : fallbackTarget;
      elements.notePerformanceTargetPitchSelect.value = String(targetPitch);
    }
    if (elements.notePerformanceDynamicsSelect) {
      const dynamics = ["preserve", "crescendo", "decrescendo", "swell"].includes(String(options.dynamics)) ? String(options.dynamics) : "preserve";
      elements.notePerformanceDynamicsSelect.value = dynamics;
    }
    if (elements.notePerformanceVolumeRangeSelect) elements.notePerformanceVolumeRangeSelect.value = String(clamp(Math.round(Number(options.volumeRange) || 3), 1, 5));
    updateNotePerformanceOptionAvailability();
    if (elements.notePerformanceBackdrop) elements.notePerformanceBackdrop.hidden = false;
    requestAnimationFrame(() => elements.notePerformanceModeSelect?.focus());
    return true;
  }

  function getPerformanceVolume(baseVolume, options, progress) {
    return getTrillSegmentVolume(baseVolume, options, progress);
  }

  function buildGlissandoPitchSequence(basePitch, options) {
    const base = clamp(Math.round(Number(basePitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
    const step = Number(options.stepSemitones) === 2 ? 2 : 1;
    let targetPitch;
    if (options.rangeMode === "target") {
      targetPitch = clamp(Math.round(Number(options.targetPitch) || base), CONFIG.minPitch, CONFIG.maxPitch);
    } else {
      const direction = options.direction === "down" ? -1 : 1;
      const range = Math.max(step, Math.round(Number(options.rangeSemitones) || 12));
      targetPitch = clamp(base + direction * range, CONFIG.minPitch, CONFIG.maxPitch);
    }
    if (targetPitch === base) return [base];
    const direction = targetPitch > base ? 1 : -1;
    const pitches = [base];
    let cursor = base;
    let guard = 0;
    while (cursor !== targetPitch && guard < 512) {
      const candidate = cursor + direction * step;
      cursor = direction > 0 ? Math.min(candidate, targetPitch) : Math.max(candidate, targetPitch);
      pitches.push(clamp(cursor, CONFIG.minPitch, CONFIG.maxPitch));
      guard += 1;
    }
    return pitches;
  }

  function buildGlissandoPattern(durationBeat, basePitch, baseVolume, options) {
    const duration = Math.max(CONFIG.minimumNoteBeat, Number(durationBeat) || CONFIG.minimumNoteBeat);
    const unit = trillDivisionBeat(options.speed, "1/32");
    const pitches = buildGlissandoPitchSequence(basePitch, options);
    const segments = [];
    let cursor = 0;
    let stepIndex = 0;
    while (cursor < duration - 1e-7) {
      const remaining = duration - cursor;
      const pitch = pitches[Math.min(stepIndex, pitches.length - 1)];
      let piece = Math.min(unit, remaining);
      if (stepIndex >= pitches.length - 1) piece = remaining;
      if (piece < CONFIG.minimumNoteBeat - 1e-7 && segments.length) {
        segments[segments.length - 1].durationBeat = Number((segments[segments.length - 1].durationBeat + piece).toFixed(6));
        break;
      }
      const progress = duration > CONFIG.minimumNoteBeat ? clamp(cursor / duration, 0, 1) : 0;
      segments.push({
        pitch,
        volume: options.dynamics === "preserve" ? baseVolume : getPerformanceVolume(baseVolume, options, progress),
        durationBeat: Number(Math.max(CONFIG.minimumNoteBeat, piece).toFixed(6)),
      });
      cursor += piece;
      stepIndex += 1;
      if (stepIndex > 512) break;
    }
    return segments;
  }

  function buildPitchOrder(notes, direction = "up") {
    const ascending = [...notes].sort((a, b) => Number(a.pitch) - Number(b.pitch));
    if (!ascending.length) return [];
    return direction === "down" ? ascending.slice().reverse() : ascending;
  }

  function buildPerformancePreviewPattern(options) {
    const sampleNotes = [
      { pitch: 60, volume: 9 },
      { pitch: 64, volume: 10 },
      { pitch: 67, volume: 11 },
    ];
    const total = CONFIG.beatsPerMeasure;
    const unit = trillDivisionBeat(options.speed, "1/32");
    if (options.mode === "glissando") {
      return buildGlissandoPattern(total, 60, 10, options).map((note, index, array) => ({
        ...note,
        startBeat: array.slice(0, index).reduce((sum, item) => sum + item.durationBeat, 0),
      }));
    }
    if (options.mode === "strum") {
      const ordered = buildPitchOrder(sampleNotes, options.direction);
      return ordered.map((note, index) => ({
        pitch: note.pitch,
        volume: options.dynamics === "preserve" ? note.volume : getPerformanceVolume(note.volume, options, ordered.length > 1 ? index / (ordered.length - 1) : 0),
        startBeat: index * unit,
        durationBeat: unit,
      }));
    }
    return [];
  }

  function updateNotePerformancePreview() {
    const grid = elements.notePerformancePreviewGrid;
    if (!grid) return;
    grid.replaceChildren();
    const options = readNotePerformanceOptionsFromUi();
    const pattern = buildPerformancePreviewPattern(options);
    if (!pattern.length) return;

    const total = options.mode === "strum"
      ? Math.max(CONFIG.minimumNoteBeat, ...pattern.map((note) => note.startBeat + note.durationBeat))
      : CONFIG.beatsPerMeasure;
    const sequencePitches = [...new Set(pattern.map((note) => note.pitch))];
    const allPitches = [...sequencePitches].sort((a, b) => b - a);
    let pitches = allPitches;
    let omittedPitchSet = new Set();
    if (options.mode === "glissando" && allPitches.length > 2) {
      pitches = [allPitches[0], allPitches[allPitches.length - 1]];
      omittedPitchSet = new Set(allPitches.slice(1, -1));
    }

    const lanes = new Map();
    let omissionLane = null;
    const appendPitchRow = (pitch) => {
      const row = document.createElement("div");
      row.className = "note-trill-preview-row";
      const label = document.createElement("span");
      label.className = "note-trill-preview-pitch";
      label.textContent = noteLabel(pitch);
      const lane = document.createElement("div");
      lane.className = "note-trill-preview-lane";
      row.append(label, lane);
      grid.append(row);
      lanes.set(pitch, lane);
    };

    if (options.mode === "glissando" && omittedPitchSet.size) {
      appendPitchRow(pitches[0]);
      const omissionRow = document.createElement("div");
      omissionRow.className = "note-trill-preview-row note-performance-omission-row";
      const omissionLabel = document.createElement("span");
      omissionLabel.className = "note-trill-preview-pitch";
      omissionLabel.textContent = "⋯";
      omissionLane = document.createElement("div");
      omissionLane.className = "note-trill-preview-lane note-performance-omission";
      omissionRow.append(omissionLabel, omissionLane);
      grid.append(omissionRow);
      appendPitchRow(pitches[1]);
    } else {
      for (const pitch of pitches.slice(0, 3)) appendPitchRow(pitch);
    }

    const appendPreviewNote = (lane, startBeat, durationBeat, volume, title = "") => {
      if (!lane) return;
      const note = document.createElement("div");
      note.className = "note-trill-preview-note";
      const leftPercent = clamp((startBeat / total) * 100, 0, 100);
      const widthPercent = clamp((durationBeat / total) * 100, 0, 100 - leftPercent);
      note.style.left = `${leftPercent}%`;
      note.style.width = `max(2px, calc(${widthPercent}% - 1px))`;
      note.style.opacity = String(0.34 + (clamp(volume, 0, 15) / 15) * 0.66);
      if (title) note.title = title;
      lane.append(note);
    };

    for (const segment of pattern) {
      const lane = lanes.get(segment.pitch);
      if (!lane) continue;
      appendPreviewNote(lane, segment.startBeat, segment.durationBeat, segment.volume, `V${segment.volume}`);
    }

    if (omissionLane && omittedPitchSet.size) {
      const omittedSegments = pattern.filter((segment) => omittedPitchSet.has(segment.pitch));
      if (omittedSegments.length) {
        const omittedStart = Math.min(...omittedSegments.map((segment) => segment.startBeat));
        const omittedEnd = Math.max(...omittedSegments.map((segment) => segment.startBeat + segment.durationBeat));
        const averageVolume = omittedSegments.reduce((sum, segment) => sum + segment.volume, 0) / omittedSegments.length;
        appendPreviewNote(
          omissionLane,
          omittedStart,
          Math.max(CONFIG.minimumNoteBeat, omittedEnd - omittedStart),
          averageVolume,
          `${omittedSegments.length} notes omitted`,
        );
      }
    }
  }

  function convertSelectedNotesToPerformance(options = state.performanceOptions || {}) {
    if (isMidiReferenceActive() || state.activePanel !== "notes") return false;
    const channel = getActiveChannel();
    if (!channel?.notes?.length || !state.selectedNoteIds.size) return false;
    const selected = getSelectedNotes(channel);
    if (!selected.length) return false;
    const mode = normalizePerformanceMode(options.mode);
    const selectedIds = new Set(selected.map((note) => note.id));
    const nextNotes = channel.notes.filter((note) => !selectedIds.has(note.id));
    const nextSelection = new Set();
    let convertedCount = 0;

    if (mode === "glissando") {
      for (const note of selected) {
        const durationBeat = Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        const basePitch = clamp(Math.round(Number(note.pitch) || 60), CONFIG.minPitch, CONFIG.maxPitch);
        const baseVolume = getNoteVolume(note, CONFIG.defaultNewChannelNoteVolume);
        const pattern = buildGlissandoPattern(durationBeat, basePitch, baseVolume, options);
        if (pattern.length < 2) {
          nextNotes.push(note);
          nextSelection.add(note.id);
          continue;
        }
        convertedCount += 1;
        let cursor = Math.max(0, Number(note.startBeat) || 0);
        pattern.forEach((part, index) => {
          const id = index === 0 ? note.id : state.nextNoteId++;
          const segment = {
            ...note,
            id,
            pitch: part.pitch,
            startBeat: Number(cursor.toFixed(6)),
            durationBeat: Number(part.durationBeat.toFixed(6)),
          };
          if (options.dynamics !== "preserve") {
            segment.volume = part.volume;
            segment.velocity = mmlVolumeToVelocity(part.volume);
          }
          nextNotes.push(segment);
          nextSelection.add(id);
          cursor += part.durationBeat;
        });
      }
    } else if (mode === "strum") {
      if (selected.length < 2) {
        showToast(i18nText("note.performance_need_multiple"));
        return false;
      }
      const ordered = buildPitchOrder(selected, options.direction);
      const unit = trillDivisionBeat(options.speed, "1/32");
      const startBeat = Math.min(...selected.map((note) => Math.max(0, Number(note.startBeat) || 0)));
      const originalEnd = Math.max(...selected.map((note) => Math.max(0, Number(note.startBeat) || 0) + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat)));
      ordered.forEach((note, index) => {
        const progress = ordered.length > 1 ? index / (ordered.length - 1) : 0;
        const volume = options.dynamics === "preserve"
          ? getNoteVolume(note, CONFIG.defaultNewChannelNoteVolume)
          : getPerformanceVolume(getNoteVolume(note, CONFIG.defaultNewChannelNoteVolume), options, progress);
        const noteStart = startBeat + index * unit;
        const nextStart = startBeat + (index + 1) * unit;
        const durationBeat = index === ordered.length - 1
          ? Math.max(CONFIG.minimumNoteBeat, originalEnd - noteStart)
          : Math.max(CONFIG.minimumNoteBeat, nextStart - noteStart);
        const segment = {
          ...note,
          startBeat: Number(noteStart.toFixed(6)),
          durationBeat: Number(durationBeat.toFixed(6)),
          volume,
          velocity: mmlVolumeToVelocity(volume),
        };
        nextNotes.push(segment);
        nextSelection.add(segment.id);
      });
      convertedCount = selected.length;
    }

    if (!convertedCount) {
      showToast(i18nText("note.performance_no_change"));
      return false;
    }
    channel.notes = normalizeMonophonicNotes(nextNotes);
    const survivingIds = new Set(channel.notes.map((note) => note.id));
    state.selectedNoteIds = new Set([...nextSelection].filter((noteId) => survivingIds.has(noteId)));
    state.channelNoteRuntime.delete(String(channel.id));
    markDirty(i18nText("history.note_performance"));
    shrinkTimelineToContent();
    drawRoll();
    updateChannelInfo();
    showToast(i18nText("note.performance_done", [i18nText(`note.performance_mode_${mode}`)]));
    return true;
  }

  function applySelectedNotesToPerformance() {
    const options = readNotePerformanceOptionsFromUi();
    state.performanceOptions = { ...options };
    const changed = convertSelectedNotesToPerformance(options);
    if (changed) closeNotePerformanceDialog();
    return changed;
  }

  function deleteTimelineBeforeBeat(beat) {
    const cutBeat = clamp(Number(beat) || 0, 0, getTotalBeats());
    if (cutBeat < CONFIG.minimumNoteBeat - 1e-7) {
      showToast(i18nText("timeline.trim_nothing_before"));
      return false;
    }
    rememberCurrentHistoryPlayhead(state.playhead.beat);
    const resumePlayback = state.playback.running || state.playback.loading;
    if (resumePlayback) stopPlayback(false);

    // Keep audio placement consistent with the global timeline crop. Clips that
    // cross the cut keep only their right-hand portion and advance source offset.
    const tempoMapBeforeCut = createTempoTimeMap();
    const nextAudioClips = [];
    for (const clip of state.audioClips) {
      const start = Math.max(0, Number(clip.startBeat) || 0);
      const end = getAudioClipEndBeat(clip);
      if (end <= cutBeat + 1e-7) {
        if (String(state.activeAudioClipId) === String(clip.id)) state.activeAudioClipId = null;
        continue;
      }
      if (start < cutBeat - 1e-7) {
        const elapsedTimelineSeconds = Math.max(0,
          beatToSecondsInTempoMap(cutBeat, tempoMapBeforeCut)
          - beatToSecondsInTempoMap(start, tempoMapBeforeCut));
        clip.sourceOffsetSeconds = Math.min(
          Math.max(0, Number(clip.sourceDurationSeconds) || Infinity),
          Math.max(0, Number(clip.sourceOffsetSeconds) || 0)
            + elapsedTimelineSeconds * Math.max(0.01, Number(clip.playbackRate) || 1),
        );
        clip.durationBeat = Math.max(CONFIG.minimumNoteBeat, end - cutBeat);
        clip.startBeat = 0;
      } else {
        clip.startBeat = Number(Math.max(0, start - cutBeat).toFixed(6));
      }
      nextAudioClips.push(clip);
    }
    state.audioClips = nextAudioClips;
    if (!state.activeAudioClipId && state.activePanel === "audio") state.activePanel = "notes";

    state.timeEdit = { beat: 0, scope: "all", channelId: null, preferredAction: "delete" };
    const applied = deleteTrackSpaceAtPlayhead(cutBeat);
    if (!applied) return false;
    setPlayheadBeat(0, { stop: false });
    rememberCurrentHistoryPlayhead(0);
    elements.rollViewport.scrollLeft = 0;
    showToast(i18nText("timeline.trim_before_done"));
    if (resumePlayback) window.setTimeout(() => startPlayback(), 0);
    return true;
  }

  function deleteTimelineAfterBeat(beat) {
    const cursor = clamp(Number(beat) || 0, 0, getTotalBeats());
    const totalBeats = getTotalBeats();
    if (totalBeats - cursor < CONFIG.minimumNoteBeat - 1e-7) {
      showToast(i18nText("timeline.trim_nothing_after"));
      return false;
    }
    rememberCurrentHistoryPlayhead(state.playhead.beat);
    const resumePlayback = state.playback.running || state.playback.loading;
    if (resumePlayback) stopPlayback(false);
    for (const channel of state.channels) {
      const nextNotes = [];
      for (const note of channel.notes || []) {
        const start = Number(note.startBeat) || 0;
        const end = start + Math.max(CONFIG.minimumNoteBeat, Number(note.durationBeat) || CONFIG.minimumNoteBeat);
        if (start >= cursor - 1e-7) {
          state.selectedNoteIds.delete(note.id);
          continue;
        }
        if (end > cursor + 1e-7) {
          if (!trimNoteToBeat(note, cursor)) {
            state.selectedNoteIds.delete(note.id);
            continue;
          }
        }
        nextNotes.push(note);
      }
      channel.notes = nextNotes;
      state.channelNoteRuntime.delete(String(channel.id));
    }
    const nextAudioClips = [];
    for (const clip of state.audioClips) {
      const start = Math.max(0, Number(clip.startBeat) || 0);
      const end = getAudioClipEndBeat(clip);
      if (start >= cursor - 1e-7) {
        if (String(state.activeAudioClipId) === String(clip.id)) state.activeAudioClipId = null;
        continue;
      }
      if (end > cursor + 1e-7) {
        clip.durationBeat = Math.max(CONFIG.minimumNoteBeat, cursor - start);
      }
      nextAudioClips.push(clip);
    }
    state.audioClips = nextAudioClips;
    if (!state.activeAudioClipId && state.activePanel === "audio") state.activePanel = "notes";

    state.tempos = state.tempos.filter((tempo) => tempo.fixed || Number(tempo.beat) < cursor - 1e-7);
    state.timelineFades = normalizeTimelineFades().flatMap((fade) => {
      if (fade.startBeat >= cursor - 1e-7) return [];
      const end = Math.min(getTimelineFadeEndBeat(fade), cursor);
      if (end <= fade.startBeat + 1e-7) return [];
      const durationSeconds = normalizeTimelineFadeSeconds(timelineFadeBeatToSeconds(end) - timelineFadeBeatToSeconds(fade.startBeat), 0.1);
      return [{ ...fade, durationSeconds }];
    });
    state.timelineBeats = Math.max(CONFIG.beatsPerMeasure, Number(cursor.toFixed(6)));
    if (state.playhead.beat > cursor) state.playhead.beat = cursor;
    ensureTimelineFitsViewport();
    markDirty(i18nText("history.timeline_trim_after"));
    rememberCurrentHistoryPlayhead(state.playhead.beat);
    renderChannelTabs();
    renderChannelEditor();
    resizeAndDraw();
    updateChannelInfo();
    showToast(i18nText("timeline.trim_after_done"));
    if (resumePlayback) window.setTimeout(() => startPlayback(), 0);
    return true;
  }

  function historyEntryChannelIndex(entry) {
    if (entry?.channelId == null) return -1;
    return state.channels.findIndex((channel) => String(channel.id) === String(entry.channelId));
  }

  function viewHistoryEntryChannel(entry) {
    const channelIndex = historyEntryChannelIndex(entry);
    if (channelIndex < 0) return false;
    selectChannel(channelIndex);
    setSidebarTab("channels");
    requestAnimationFrame(() => {
      const target = [...(elements.channelTabs?.querySelectorAll("[data-channel-id]") || [])]
        .find((item) => String(item.dataset.channelId) === String(entry.channelId));
      target?.scrollIntoView({ block: "nearest" });
      target?.querySelector(".channel-tree-main")?.focus({ preventScroll: true });
    });
    return true;
  }

  function movePlayheadToLastMeasure() {
    const total = Math.max(CONFIG.beatsPerMeasure, getTotalBeats());
    const lastMeasureBeat = Math.max(0, Math.floor((total - 1e-7) / CONFIG.beatsPerMeasure) * CONFIG.beatsPerMeasure);
    seekPlayheadBeat(lastMeasureBeat);
    if (elements.rollViewport) {
      const targetLeft = Math.max(0, beatToX(lastMeasureBeat) - Math.max(0, elements.rollViewport.clientWidth * 0.25));
      elements.rollViewport.scrollLeft = targetLeft;
    }
  }

  function registerDefaultContextMenus() {
    const commonItems = () => [
      { label: "새 파일", action: () => requestNewProject() },
      { label: "불러오기", action: () => openFilePickerInput(elements.fileInput) },
      { label: "저장", action: saveProject },
    ];

    registerContextMenu("app", commonItems);
    registerContextMenu("piano-section", () => [
      {
        label: i18nText("timeline.move_first_measure"),
        action: () => {
          setPlayheadBeat(0, { stop: true });
          elements.rollViewport.scrollLeft = 0;
        },
      },
      { label: i18nText("timeline.move_last_measure"), action: movePlayheadToLastMeasure },
    ]);
    registerContextMenu("timeline", ({ event }) => {
      const beat = timelineBeatFromPointer(event);
      const markerTempo = findTempoMarkerFromPointer(event);
      const tempoAtBeat = getSortedTempos().find((item) => Math.abs((Number(item.beat) || 0) - beat) < 1e-7) || null;
      const tempo = markerTempo || tempoAtBeat;
      const selectedChannel = getActiveChannel();
      const tempoSimplifyItem = {
        label: i18nText("tempo.simplify"),
        action: openTempoSimplifyDialog,
      };
      const deleteAllTemposItem = {
        label: i18nText("tempo.delete_all_except_initial"),
        disabled: getNonInitialTempos().length === 0,
        danger: true,
        action: deleteAllNonInitialTempos,
      };
      const existingFade = findTimelineFadeMarkerFromPointer(event) || getTimelineFadeAtBeat(beat);
      const fadeItems = existingFade
        ? [
            { label: i18nText("timeline.fade_change"), action: () => openTimelineFadeDialog(beat, existingFade) },
            { label: i18nText("timeline.fade_delete"), danger: true, action: () => deleteTimelineFadeById(existingFade.id) },
          ]
        : [
            { label: i18nText("timeline.fade_add"), action: () => openTimelineFadeDialog(beat, null) },
          ];
      const selectedChannelMeasureItems = [
        {
          label: i18nText("timeline.add_measure_beat"),
          action: () => openTimeEditDialog({
            beat,
            scope: selectedChannel && !isMidiReferenceActive() ? "channel" : "all",
            channelId: selectedChannel?.id,
            preferredAction: "insert",
          }),
        },
        {
          label: i18nText("timeline.delete_measure_beat"),
          danger: true,
          action: () => openTimeEditDialog({
            beat,
            scope: selectedChannel && !isMidiReferenceActive() ? "channel" : "all",
            channelId: selectedChannel?.id,
            preferredAction: "delete",
          }),
        },
      ];
      const trimBeforeItem = {
        label: i18nText("timeline.trim_before"),
        disabled: beat <= 0,
        danger: true,
        action: () => deleteTimelineBeforeBeat(beat),
      };
      const trimAfterItem = {
        label: i18nText("timeline.trim_after"),
        disabled: beat >= getTotalBeats() - CONFIG.minimumNoteBeat,
        danger: true,
        action: () => deleteTimelineAfterBeat(beat),
      };
      if (isMidiReferenceActive()) {
        return [
          tempo
            ? { label: `MIDI 템포 ${tempo.bpm} · 읽기 전용`, disabled: true }
            : { label: "MIDI 템포 맵 · 읽기 전용", disabled: true },
          ...selectedChannelMeasureItems,
          "separator",
          trimBeforeItem,
          trimAfterItem,
          "separator",
          {
            label: i18nText("timeline.move_first_measure"),
            action: () => {
              seekPlayheadBeat(0);
              elements.rollViewport.scrollLeft = 0;
            },
          },
          { label: i18nText("timeline.move_last_measure"), action: movePlayheadToLastMeasure },
        ];
      }
      if (tempo?.fixed) {
        return [
          { label: i18nText("tempo.change"), action: () => editTempo(tempo) },
          tempoSimplifyItem,
          deleteAllTemposItem,
          "separator",
          ...fadeItems,
          "separator",
          ...selectedChannelMeasureItems,
          "separator",
          trimBeforeItem,
          trimAfterItem,
          "separator",
          {
            label: i18nText("timeline.move_first_measure"),
            action: () => { seekPlayheadBeat(0); elements.rollViewport.scrollLeft = 0; },
          },
          { label: i18nText("timeline.move_last_measure"), action: movePlayheadToLastMeasure },
        ];
      }
      if (tempo) {
        return [
          { label: i18nText("tempo.change"), action: () => editTempo(tempo) },
          { label: i18nText("tempo.delete"), danger: true, action: () => deleteTempo(tempo) },
          tempoSimplifyItem,
          deleteAllTemposItem,
          "separator",
          ...fadeItems,
          "separator",
          ...selectedChannelMeasureItems,
          "separator",
          trimBeforeItem,
          trimAfterItem,
          "separator",
          {
            label: i18nText("timeline.move_first_measure"),
            action: () => { seekPlayheadBeat(0); elements.rollViewport.scrollLeft = 0; },
          },
          { label: i18nText("timeline.move_last_measure"), action: movePlayheadToLastMeasure },
        ];
      }
      return [
        { label: i18nText("timeline.add_tempo_measure"), disabled: beat <= 0, action: () => addTempoAtBeat(beat) },
        tempoSimplifyItem,
        deleteAllTemposItem,
        "separator",
        ...fadeItems,
        "separator",
        ...selectedChannelMeasureItems,
        "separator",
        trimBeforeItem,
        trimAfterItem,
        "separator",
        {
          label: i18nText("timeline.move_first_measure"),
          action: () => {
            seekPlayheadBeat(0);
            elements.rollViewport.scrollLeft = 0;
          },
        },
        { label: i18nText("timeline.move_last_measure"), action: movePlayheadToLastMeasure },
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
        { label: i18nText("piano.go_row", [noteLabel(pitch)]), action: () => { elements.rollViewport.scrollTop = pitchToY(pitch); } },
        { label: "중앙 C로 이동", action: () => { elements.rollViewport.scrollTop = Math.max(0, pitchToY(60) - 120); } },
        "separator",
        { label: i18nText("piano.add_pitch_selection", [noteLabel(pitch)]), disabled: isMidiReferenceActive() || state.activePanel !== "notes", action: () => selectNotesByKeyboardPitch(pitch) },
        "separator",
        { label: i18nText("soundbank.change"), action: openEditorSoundFontDialog },
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
      const contextBeat = clamp(snapBeat(xToBeat(point.x)), 0, getTotalBeats());
      const channelTools = [
        { label: i18nText("timeline.add_measure_beat"), action: () => openTimeEditDialog({ beat: state.playhead.beat, scope: "channel", channelId: getActiveChannel()?.id, preferredAction: "insert" }) },
        { label: i18nText("timeline.delete_measure_beat"), danger: true, action: () => openTimeEditDialog({ beat: state.playhead.beat, scope: "channel", channelId: getActiveChannel()?.id, preferredAction: "delete" }) },
      ];
      const trimTools = [
        {
          label: i18nText("timeline.trim_before"),
          disabled: contextBeat <= 0,
          danger: true,
          action: () => deleteTimelineBeforeBeat(contextBeat),
        },
        {
          label: i18nText("timeline.trim_after"),
          disabled: contextBeat >= getTotalBeats() - CONFIG.minimumNoteBeat,
          danger: true,
          action: () => deleteTimelineAfterBeat(contextBeat),
        },
      ];
      if (!clicked) {
        return [
          { label: i18nText("channel.select_all_note"), disabled: !getActiveChannel()?.notes?.length, action: selectAllNotes },
          ...(state.noteClipboard?.notes?.length ? [{ label: i18nText("note.paste_playhead"), action: pasteNotesFromClipboard }] : []),
          "separator",
          ...channelTools,
          "separator",
          ...trimTools,
        ];
      }
      if (!state.selectedNoteIds.has(clicked.id)) {
        selectOnlyNote(clicked.id);
        drawRoll();
        updateChannelInfo();
      }
      const mergePlan = getSelectedSamePitchMergePlan();
      return [
        { label: i18nText("context.action.note_copy"), action: copySelectedNotes },
        { label: i18nText("context.action.note_cut"), action: cutSelectedNotes },
        { label: i18nText("context.action.note_volume_edit"), action: openNoteVolumeDialog },
        { label: i18nText("context.action.note_trill"), action: openNoteTrillDialog },
        { label: i18nText("context.action.note_performance"), action: openNotePerformanceDialog },
        ...(mergePlan ? [{ label: i18nText("note.merge_consecutive_same", [mergePlan.mergeNoteCount]), action: mergeSelectedSamePitchNotes }] : []),
        "separator",
        { label: i18nText("context.action.note_extend_left"), action: () => extendSelectedNotesToSide(-1) },
        { label: i18nText("context.action.note_extend_right"), action: () => extendSelectedNotesToSide(1) },
        "separator",
        {
          label: i18nText("context.action.note_delete"),
          danger: true,
          action: deleteSelectedNote,
        },
      ];
    });

    const buildAudioContextItems = ({ event = null } = {}) => {
      const audioTarget = event?.target?.closest?.("[data-audio-clip-id]");
      if (audioTarget?.dataset?.audioClipId) selectAudioClip(audioTarget.dataset.audioClipId);
      const clip = getActiveAudioClip();
      return [
        { label: "오디오 추가", action: () => openFilePickerInput(elements.audioFileInput) },
        { label: "선택 오디오 편집", disabled: !clip, action: () => clip && openAudioEditDialog(clip.id) },
        "separator",
        { label: "선택 오디오 삭제", disabled: !clip, danger: true, action: () => clip && requestDeleteAudioClip(clip.id) },
      ];
    };
    registerContextMenu("audio-lane", buildAudioContextItems);
    registerContextMenu("audio-source", buildAudioContextItems);

    const channelListContextItems = () => [
      { label: i18nText("channel.merge"), disabled: state.channels.length < 2, action: openChannelMergeDialog },
      { label: i18nText("channel.add"), action: addChannel },
      { label: i18nText("channel.delete"), danger: true, action: openChannelDeleteDialog },
      "separator",
      { label: i18nText("channel.go_first"), disabled: !state.channels.length, action: () => selectChannel(0) },
      { label: i18nText("channel.go_last"), disabled: !state.channels.length, action: () => selectChannel(Math.max(0, state.channels.length - 1)) },
    ];
    registerContextMenu("channel-panel", channelListContextItems);
    registerContextMenu("channel-tabs", channelListContextItems);
    registerContextMenu("channel-tab", ({ area }) => {
      const index = Number(area.element.dataset.channelIndex);
      const channel = state.channels[index];
      return [
        { label: i18nText("channel.edit_2"), action: () => channel && openChannelEditDialog(channel.id) },
        { label: i18nText("channel.copy_all_note"), disabled: !channel?.notes.length, action: () => { selectChannel(index); copyActiveChannelNotes(); } },
        { label: i18nText("channel.cut_all_note"), disabled: !channel?.notes.length, action: () => { selectChannel(index); cutActiveChannelNotes(); } },
        { label: channel?.visible === false ? i18nText("context.action.note_show") : i18nText("context.action.note_hide"), action: () => channel && setChannelVisibleById(channel.id, channel.visible === false) },
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
      { label: i18nText("channel.edit_2"), action: () => { const channel = getActiveChannel(); if (channel) openChannelEditDialog(channel.id); } },
      "separator",
      { label: i18nText("soundbank.change"), action: openEditorSoundFontDialog },
    ]);
    registerContextMenu("history", () => [
      { label: i18nText("history.undo"), disabled: state.history.undoStack.length === 0, action: () => undoHistory() },
      { label: i18nText("history.redo"), disabled: state.history.redoStack.length === 0, action: () => redoHistory() },
    ]);
    registerContextMenu("history-item", ({ area }) => {
      const index = Number(area.element.dataset.historyIndex);
      const entries = getOrderedHistoryEntries();
      const entry = entries[index];
      const currentIndex = state.history.undoStack.length;
      return [
        {
          label: i18nText("context.action.go_history"),
          disabled: !entry || index === currentIndex,
          action: () => entry && jumpToHistoryIndex(index),
        },
      ];
    });
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
      showToast(i18nText("ui.renamed_avoid_duplicate", [uniqueName]));
    }
    return true;
  }

  function promptRenameChannel(index) {
    const current = state.channels[index]?.name;
    if (!current) {
      return;
    }
    const result = window.prompt(i18nText("channel.name"), current);
    if (result != null) {
      renameChannel(index, result);
    }
  }

  function setChannelHue(index, hue, { commit = true } = {}) {
    const channel = state.channels[index];
    if (!channel) return false;
    const normalizedHue = normalizeHue(hue, getChannelHue(channel, index));
    if (channel.hue === normalizedHue) return false;
    channel.hue = normalizedHue;
    if (commit) {
      markDirty("채널 색상 변경");
    } else {
      state.dirty = true;
      updateDirtyState();
    }
    renderChannelTabs();
    renderChannelMuteMixer();
    updateChannelColorControl(normalizedHue);
    drawRoll();
    drawOverviewTimeline();
    return true;
  }

  function openChannelColorPicker(index) {
    selectChannel(index);
    openHueColorPalette(elements.channelColorInput);
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

  function isActuallyVisiblePopupElement(element) {
    if (!(element instanceof Element)) return false;
    if (typeof HTMLDialogElement !== "undefined" && element instanceof HTMLDialogElement && element.open) return true;
    if (element.hidden || element.closest("[hidden]")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return element.getClientRects().length > 0;
  }

  function isPopupLikeUiOpen() {
    const candidates = document.querySelectorAll([
      "dialog[open]",
      ".popup-backdrop",
      "[role='dialog']",
      "[role='menu']",
      ".brand-site-map[open]",
    ].join(","));
    return [...candidates].some(isActuallyVisiblePopupElement);
  }

  function isModalPopupOpen() {
    return [...document.querySelectorAll(".popup-backdrop")].some(isActuallyVisiblePopupElement);
  }

  function handleModalBackgroundKeyGuard(event) {
    const openBackdrops = [...document.querySelectorAll(".popup-backdrop")].filter(isActuallyVisiblePopupElement);
    if (!openBackdrops.length) return false;
    const target = event.target;
    if (target instanceof Node && openBackdrops.some((backdrop) => backdrop.contains(target))) return false;
    if (event.key === "Escape") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function handleGlobalSelectAllShortcut(event) {
    const commandKey = event.ctrlKey || event.metaKey;
    const selectAllCommand = commandKey
      && !event.altKey
      && !event.shiftKey
      && (event.code === "KeyA" || String(event.key || "").toLowerCase() === "a");

    // Context/File/Edit menus and the shortcut-help popup are keyboard-modal for
    // Ctrl/Cmd+A. Skipping the editor shortcut alone would let the browser's
    // native Select All highlight the menu/popup text. Consume it completely.
    const blockSelectAll = [
      elements.contextMenu,
      elements.fileMenu,
      elements.editMenu,
      elements.shortcutHelpBackdrop,
    ].some(isActuallyVisiblePopupElement);
    if (selectAllCommand && blockSelectAll) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    if (
      event.defaultPrevented
      || !selectAllCommand
      || isPopupLikeUiOpen()
    ) {
      return false;
    }

    let handled = false;
    if (isMidiReferenceActive()) {
      selectAllMidiNotes();
      handled = true;
    } else if (state.activePanel === "notes" && getActiveChannel()) {
      selectAllNotes();
      handled = true;
    }

    if (!handled) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleNewProjectShortcut(event) {
    const key = String(event.key || "").toLowerCase();
    const altOnly = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (
      event.defaultPrevented
      || !altOnly
      || key !== "n"
      || isPopupLikeUiOpen()
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    closeFileMenu();
    void requestNewProject();
    return true;
  }

  function handleChannelCreateDeleteShortcut(event) {
    const key = String(event.key || "").toLowerCase();
    const altOnly = event.altKey && !event.ctrlKey && !event.metaKey;
    if (
      event.defaultPrevented
      || !altOnly
      || key !== "t"
      || isPopupLikeUiOpen()
      || isTextEntryTarget(event.target)
      || isMidiReferenceActive()
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey) {
      void requestDeleteChannel(state.activeChannel);
    } else {
      addChannel();
    }
    return true;
  }

  function handleGlobalSelectedNoteShortcut(event) {
    if (
      event.defaultPrevented
      || event.altKey
      || isPopupLikeUiOpen()
      || isTextEntryTarget(event.target)
      || state.activePanel !== "notes"
      || isMidiReferenceActive()
      || !getActiveChannel()
    ) {
      return false;
    }

    const selectedCount = getSelectedNotes().length;
    const key = String(event.key || "");
    const commandKey = event.ctrlKey || event.metaKey;

    if (
      selectedCount >= 2
      && event.shiftKey
      && !commandKey
      && (key === "Delete" || key === "Backspace")
    ) {
      event.preventDefault();
      event.stopPropagation();
      removeRestsBetweenSelectedNotes();
      return true;
    }

    if (
      selectedCount >= 1
      && commandKey
      && !event.shiftKey
      && (key === "ArrowLeft" || key === "ArrowRight")
    ) {
      event.preventDefault();
      event.stopPropagation();
      extendSelectedNotesToSide(key === "ArrowLeft" ? -1 : 1);
      return true;
    }

    if (
      selectedCount >= 1
      && event.shiftKey
      && !commandKey
      && (key === "ArrowUp" || key === "ArrowDown")
    ) {
      event.preventDefault();
      event.stopPropagation();
      shiftSelectedNotesByOctave(key === "ArrowUp" ? 1 : -1);
      return true;
    }

    return false;
  }

  function handleEditModeShortcut(event) {
    if (isModalPopupOpen()) return false;
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
    if (isModalPopupOpen()) return false;
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

  function isPlaybackShortcutInstrumentSelect(target) {
    return target === elements.channelInstrumentSelect;
  }

  function handlePlaybackShortcut(event) {
    if (isModalPopupOpen()) return false;
    if (event.code !== "Space") {
      return false;
    }
    const instrumentSelectFocused = isPlaybackShortcutInstrumentSelect(event.target);
    if (
      event.defaultPrevented
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || (isTextEntryTarget(event.target) && !instrumentSelectFocused)
    ) {
      return false;
    }
    event.preventDefault();
    if (instrumentSelectFocused && event.target instanceof HTMLElement) {
      event.target.blur();
      elements.rollViewport?.focus?.({ preventScroll: true });
    }
    state.playback.running || state.playback.loading ? stopPlayback(false) : startPlayback();
    return true;
  }

  function scheduleManualScrollSnap() {
    window.clearTimeout(state.viewportScroll.snapTimer);
    if (state.playback.running || state.playback.loading || state.playhead.pointerId !== null || state.tempoDrag || state.fadeDrag || state.interaction) {
      return;
    }
    state.viewportScroll.snapTimer = window.setTimeout(() => {
      state.viewportScroll.snapTimer = 0;
      if (state.playback.running || state.playback.loading || state.playhead.pointerId !== null || state.tempoDrag || state.fadeDrag || state.interaction) {
        return;
      }
      const snapped = snapScrollLeftToBeatUnit(elements.rollViewport.scrollLeft, getSnapBeat());
      if (Math.abs(snapped - elements.rollViewport.scrollLeft) >= 0.5) {
        elements.rollViewport.scrollLeft = snapped;
      }
    }, CONFIG.manualScrollSnapDelay);
  }

  function openShortcutHelpDialog() {
    closeFileMenu();
    closeEditMenu();
    closeThemeMenu();
    closeGoogleAccountMenu();
    closeVolumeMenu();
    closeZoomMenu();
    closePlaybackRateMenu();
    if (!elements.shortcutHelpBackdrop) return false;
    elements.shortcutHelpBackdrop.hidden = false;
    requestAnimationFrame(() => elements.shortcutHelpCloseButton?.focus());
    return true;
  }

  function closeShortcutHelpDialog() {
    if (elements.shortcutHelpBackdrop) elements.shortcutHelpBackdrop.hidden = true;
  }

  function openSelectedRecommendedLink() {
    const select = elements.editorRecommendedLinks;
    if (!select) return false;
    const value = String(select.value || "").trim();
    select.value = "";
    if (!/^https?:\/\//i.test(value)) return false;
    window.open(value, "_blank", "noopener,noreferrer");
    return true;
  }

  function bindEvents() {
    document.addEventListener("keydown", handleModalBackgroundKeyGuard, true);
    document.addEventListener("keydown", handleNewProjectShortcut, true);
    document.addEventListener("keydown", handleChannelCreateDeleteShortcut, true);
    document.addEventListener("keydown", handleHistoryShortcut, true);
    document.addEventListener("keydown", handleGlobalSelectAllShortcut, true);
    document.addEventListener("keydown", handleGlobalSelectedNoteShortcut, true);
    document.addEventListener("wheel", handleGlobalTrackZoomWheel, { capture: true, passive: false });
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
    elements.editNoteVolumeButton?.addEventListener("click", () => { closeEditMenu(); openAllNoteVolumeDialog(); });
    elements.fileExportButton.addEventListener("click", () => { closeFileMenu(); exportCurrentContextAsMml(); });
    elements.midiExportButton?.addEventListener("click", () => { closeFileMenu(); exportProjectAsMidi(); });
    elements.audioExportButton?.addEventListener("click", () => { closeFileMenu(); void exportProjectAsAudioOgg(); });
    elements.midiExtractButton?.addEventListener("click", () => { closeFileMenu(); openMidiExtractionSupport(); });
    elements.supportedFilesMenuButton?.addEventListener("click", closeFileMenu);
    elements.newButton.addEventListener("click", () => {
      closeFileMenu();
      requestNewProject();
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
      state.mmlImport.selectedCandidateIndexes = new Set(state.mmlImport.candidates.map((_, index) => index));
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
    elements.midiImportLimitChannelsPerInstrument?.addEventListener("change", updateMidiImportDialog);
    elements.midiImportQuantize?.addEventListener("change", () => {
      if (state.midiImport.kind === "midi" && state.midiImport.midiBuffer && !state.midiImport.busy) {
        try { reparseMidiImportPreview(); }
        catch (error) {
          console.error(error);
          setMidiImportStatus(error instanceof Error ? error.message : "양자화를 다시 적용하지 못했습니다.", { error: true });
        }
      }
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
        if (!checkbox.checked) setMmlExportCheckboxChecked(checkbox, true);
      });
      updateMmlExportDialogState();
    });
    elements.mmlExportClearAllButton?.addEventListener("click", () => {
      elements.mmlExportChannelList?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      mmlExportSelectionQueue = [];
      updateMmlExportDialogState();
    });
    elements.mmlExportSplitLimitInput?.addEventListener("change", () => {
      mmlExportSplitMaxChars = normalizeMmlExportSplitMaxChars(elements.mmlExportSplitLimitInput.value);
      elements.mmlExportSplitLimitInput.value = String(mmlExportSplitMaxChars);
      updateMmlExportDialogState();
    });
    elements.mmlExportCopyAllButton?.addEventListener("click", applyMmlExportSelection);
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
    elements.channelTabs?.addEventListener("pointermove", moveChannelActionSweep);
    elements.channelTabs?.addEventListener("pointerup", endChannelActionSweep);
    elements.channelTabs?.addEventListener("pointercancel", endChannelActionSweep);
    elements.channelTabs?.addEventListener("lostpointercapture", () => resetChannelActionSweep());
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
    elements.themeToggleButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, { notify: true });
    });
    elements.languageSelect.addEventListener("change", () => {
      applyLanguage(elements.languageSelect.value, { notify: true });
    });
    elements.editorRecommendedLinks?.addEventListener("change", openSelectedRecommendedLink);
    elements.editorSoundFontSettingsButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditorSoundFontDialog();
    });
    elements.editorSoundFontCloseButton?.addEventListener("click", closeEditorSoundFontDialog);
    elements.editorSoundFontDoneButton?.addEventListener("click", closeEditorSoundFontDialog);
    elements.editorSoundFontBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.editorSoundFontBackdrop) closeEditorSoundFontDialog();
    });
    elements.editorSoundFontLoadButton?.addEventListener("click", () => {
      if (!elements.editorSoundFontFileInput || editorSoundFontBusy) return;
      elements.editorSoundFontFileInput.value = "";
      openFilePickerInput(elements.editorSoundFontFileInput);
    });
    elements.editorSoundFontFileInput?.addEventListener("change", () => {
      const file = elements.editorSoundFontFileInput?.files?.[0];
      if (file) void loadEditorSoundFontFile(file);
    });
    elements.editorSoundFontResetButton?.addEventListener("click", () => { void restoreEditorDefaultSoundFont(); });
    elements.shortcutHelpButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      openShortcutHelpDialog();
    });
    elements.shortcutHelpCloseButton?.addEventListener("click", closeShortcutHelpDialog);
    elements.shortcutHelpDoneButton?.addEventListener("click", closeShortcutHelpDialog);
    elements.shortcutHelpBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.shortcutHelpBackdrop) closeShortcutHelpDialog();
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
    elements.overviewTimelineCanvas?.addEventListener("pointerdown", handleOverviewTimelinePointerDown);
    elements.overviewTimelineCanvas?.addEventListener("pointermove", handleOverviewTimelinePointerMove);
    elements.overviewTimelineCanvas?.addEventListener("pointerup", handleOverviewTimelinePointerUp);
    elements.overviewTimelineCanvas?.addEventListener("pointercancel", handleOverviewTimelinePointerUp);
    elements.timelineCanvas.addEventListener("pointerdown", handleTimelinePointerDown);
    elements.timelineCanvas.addEventListener("dblclick", handleTimelineDoubleClick);
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
        if (event.key === "Escape") {
          clearMidiSelection();
          updateMidiReferenceUI();
          drawRoll();
          closeContextMenu();
          event.preventDefault();
        }
        return;
      }
      // Ctrl/Cmd+C/X/V는 실제 ClipboardEvent에서 처리합니다. 키다운에서 먼저
      // preventDefault하면 일부 브라우저에서 copy/paste 이벤트 자체가 발생하지 않아
      // 다른 창/다른 브라우저의 OS 클립보드와 동기화되지 않을 수 있습니다.
      if (commandKey && (key === "b" || event.code === "KeyB")) {
        event.preventDefault();
        insertPasteNotesFromClipboard();
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

    elements.mergeChannelsButton?.addEventListener("click", openChannelMergeDialog);
    elements.addChannelButton.addEventListener("click", addChannel);
    elements.collapsedMergeChannelsButton?.addEventListener("click", openChannelMergeDialog);
    elements.collapsedAddChannelButton?.addEventListener("click", addChannel);
    elements.deleteChannelsButton?.addEventListener("click", openChannelDeleteDialog);
    elements.collapsedDeleteChannelsButton?.addEventListener("click", openChannelDeleteDialog);
    elements.channelEditCloseButton?.addEventListener("click", closeChannelEditDialog);
    elements.audioEditCloseButton?.addEventListener("click", closeAudioEditDialog);
    elements.audioEditCancelButton?.addEventListener("click", closeAudioEditDialog);
    elements.audioEditApplyButton?.addEventListener("click", applyAudioEditDialog);
    elements.audioEditBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.audioEditBackdrop) closeAudioEditDialog();
    });
    elements.audioEditNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyAudioEditDialog();
      }
    });
    bindHueColorPalette(elements.audioEditColorInput);

    elements.channelEditCancelButton?.addEventListener("click", closeChannelEditDialog);
    elements.channelEditApplyButton?.addEventListener("click", applyChannelEditDialog);
    elements.channelEditBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.channelEditBackdrop) closeChannelEditDialog();
    });
    elements.channelEditNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyChannelEditDialog();
      }
    });
    bindHueColorPalette(elements.channelEditColorInput);
    elements.channelMmlCloseButton?.addEventListener("click", closeChannelMmlDialog);
    elements.channelMmlCancelButton?.addEventListener("click", closeChannelMmlDialog);
    elements.channelMmlApplyButton?.addEventListener("click", applyChannelMmlDialog);
    elements.channelMmlBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.channelMmlBackdrop) closeChannelMmlDialog();
    });
    elements.channelMmlText?.addEventListener("input", () => {
      normalizeChannelMmlTextareaCase();
      scheduleChannelMmlPreview();
    });
    elements.channelMmlIncludeTempo?.addEventListener("change", refreshChannelMmlTempoOption);
    elements.channelMmlText?.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        applyChannelMmlDialog();
      }
    });
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
      setChannelHue(state.activeChannel, getHueControlValue(elements.channelColorInput), { commit: true });
    });
    bindHueColorPalette(elements.channelColorInput);
    // 악기 콤보박스가 포커스를 유지한 상태에서도 Space는 재생/정지 단축키로 우선 처리합니다.
    // 방향키 등 일반 select 조작은 그대로 유지하고 Space를 누를 때만 포커스를 피아노롤로 돌립니다.
    elements.channelInstrumentSelect?.addEventListener("keydown", handlePlaybackShortcut);
    elements.channelInstrumentSelect?.addEventListener("change", () => {
      const channel = getActiveChannel();
      if (!channel) return;
      const selected = parseEditorPresetKey(elements.channelInstrumentSelect.value);
      const preset = findEditorSoundBankPreset(selected.bank, selected.program);
      if (!preset) {
        populateChannelInstrumentSelect();
        renderChannelEditor();
        return;
      }
      const before = editorPresetKey(getChannelInstrumentBank(channel), getChannelInstrumentProgram(channel));
      const nextKey = editorPresetKey(preset.bank, preset.preset);
      if (before === nextKey && String(channel.instrument || "") === String(preset.name || "")) return;
      setChannelInstrumentPreset(channel, preset);
      if (typeof audioEngine.prepareProgram === "function") {
        void audioEngine.prepareProgram(channel.instrumentProgram, channel.instrumentBank, { exactPreset: true })
          .catch((error) => console.warn("악기 음원 준비 실패", error));
      }
      markDirty("채널 악기 변경");
      renderChannelTabs();
      updateChannelInfo();
      showToast(i18nText("instrument.change", [channel.name, channel.instrument]));
    });
    elements.midiSourceColorInput?.addEventListener("change", () => {
      const document = getActiveMidiDocument();
      const group = getMidiGroupById();
      if (!document || !group) {
        updateMidiReferenceUI();
        return;
      }
      setMidiGroupHue(document.id, group.id, getHueControlValue(elements.midiSourceColorInput), { commit: true });
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
    bindHueColorPalette(elements.midiSourceColorInput);
    elements.audioSourceNameInput?.addEventListener("change", () => renameActiveAudioTitle(elements.audioSourceNameInput.value));
    elements.audioSourceNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elements.audioSourceNameInput.blur();
      }
    });
    elements.audioSourceColorInput?.addEventListener("change", () => {
      const clip = getActiveAudioClip();
      if (clip) setAudioClipHue(clip.id, getHueControlValue(elements.audioSourceColorInput), { commit: true });
    });
    bindHueColorPalette(elements.audioSourceColorInput);
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
    // The audio placement lane is not a transport/seek surface.
    // Clicking its empty area must never stop playback or move the playhead.

    elements.midiReferenceLoadButton.addEventListener("click", () => openFilePickerInput(elements.midiFileInput));
    elements.channelMergeCloseButton?.addEventListener("click", closeChannelMergeDialog);
    elements.channelMergeCancelButton?.addEventListener("click", closeChannelMergeDialog);
    elements.channelMergeApplyButton?.addEventListener("click", applyChannelMergeSelection);
    elements.channelMergeSelectAllButton?.addEventListener("click", () => setAllChannelMergeChecked(true));
    elements.channelMergeClearAllButton?.addEventListener("click", () => setAllChannelMergeChecked(false));
    elements.channelMergeRoleOptions?.querySelectorAll("[data-merge-role]").forEach((button) => {
      button.addEventListener("click", () => setChannelMergeRole(button.dataset.mergeRole));
    });
    elements.channelMergeOverlapOptions?.querySelectorAll("[data-merge-overlap]").forEach((button) => {
      button.addEventListener("click", () => setChannelMergeOverlapMode(button.dataset.mergeOverlap));
    });
    elements.channelMergeBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.channelMergeBackdrop) closeChannelMergeDialog();
    });
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
    elements.noteVolumeFixedMode?.addEventListener("change", () => configureNoteVolumeSliderForMode(true));
    elements.noteVolumeSlider?.addEventListener("input", () => {
      updateNoteVolumeDialogControl();
      updateNoteVolumeDialogCounts();
    });
    elements.noteVolumeBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.noteVolumeBackdrop) closeNoteVolumeDialog();
    });
    elements.noteTrillCloseButton?.addEventListener("click", closeNoteTrillDialog);
    elements.noteTrillCancelButton?.addEventListener("click", closeNoteTrillDialog);
    elements.noteTrillApplyButton?.addEventListener("click", applySelectedNotesToTrill);
    [
      elements.noteTrillDirectionSelect,
      elements.noteTrillIntervalSelect,
      elements.noteTrillStartDivisionSelect,
      elements.noteTrillGradualSpeed,
      elements.noteTrillEndDivisionSelect,
      elements.noteTrillDynamicsSelect,
      elements.noteTrillVolumeRangeSelect,
      elements.noteTrillStartNoteSelect,
      elements.noteTrillEndOnBase,
    ].forEach((control) => control?.addEventListener("change", updateNoteTrillOptionAvailability));
    elements.noteTrillBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.noteTrillBackdrop) closeNoteTrillDialog();
    });
    elements.notePerformanceCloseButton?.addEventListener("click", closeNotePerformanceDialog);
    elements.notePerformanceCancelButton?.addEventListener("click", closeNotePerformanceDialog);
    elements.notePerformanceApplyButton?.addEventListener("click", applySelectedNotesToPerformance);
    [
      elements.notePerformanceModeSelect,
      elements.notePerformanceDirectionSelect,
      elements.notePerformanceSpeedSelect,
      elements.notePerformanceStepSelect,
      elements.notePerformanceRangeModeSelect,
      elements.notePerformanceRangeSelect,
      elements.notePerformanceTargetPitchSelect,
      elements.notePerformanceDynamicsSelect,
      elements.notePerformanceVolumeRangeSelect,
    ].forEach((control) => control?.addEventListener("change", updateNotePerformanceOptionAvailability));
    elements.notePerformanceBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.notePerformanceBackdrop) closeNotePerformanceDialog();
    });
    elements.timelineFadeCloseButton?.addEventListener("click", closeTimelineFadeDialog);
    elements.timelineFadeCancelButton?.addEventListener("click", closeTimelineFadeDialog);
    elements.timelineFadeApplyButton?.addEventListener("click", applyTimelineFadeDialog);
    elements.timelineFadeDeleteButton?.addEventListener("click", deleteTimelineFadeFromDialog);
    [elements.timelineFadeTypeIn, elements.timelineFadeTypeOut].forEach((control) => {
      control?.addEventListener("change", handleTimelineFadeTypeChange);
    });
    elements.timelineFadeDuration?.addEventListener("blur", () => normalizeTimelineFadeDurationInput({ commit: true }));
    elements.timelineFadeBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.timelineFadeBackdrop) closeTimelineFadeDialog();
    });
    elements.timelineCanvas?.addEventListener("pointermove", handleTimelineHover);
    elements.timelineCanvas?.addEventListener("pointerleave", hideTimelineHoverTooltip);
    elements.overviewTimelineCanvas?.addEventListener("pointermove", handleOverviewTimelineHover);
    elements.overviewTimelineCanvas?.addEventListener("pointerleave", hideTimelineHoverTooltip);
    elements.horizontalScrollBar?.addEventListener("pointermove", handleHorizontalTrackHover);
    elements.horizontalScrollBar?.addEventListener("pointerleave", hideTimelineHoverTooltip);
    elements.tempoEditorCloseButton?.addEventListener("click", closeTempoEditor);
    elements.tempoEditorCancelButton?.addEventListener("click", closeTempoEditor);
    elements.tempoEditorApplyButton?.addEventListener("click", applyTempoEditor);
    elements.tempoEditorDeleteButton?.addEventListener("click", deleteTempoFromEditor);
    elements.tempoSimplifyCloseButton?.addEventListener("click", closeTempoSimplifyDialog);
    elements.tempoSimplifyCancelButton?.addEventListener("click", closeTempoSimplifyDialog);
    elements.tempoSimplifyApplyButton?.addEventListener("click", applyTempoSimplification);
    elements.tempoSimplifyThresholdInput?.addEventListener("input", updateTempoSimplifySummary);
    elements.tempoSimplifyPreserveExtrema?.addEventListener("change", updateTempoSimplifySummary);
    elements.tempoSimplifyThresholdInput?.addEventListener("blur", () => {
      const options = readTempoSimplifyOptionsFromUi();
      if (elements.tempoSimplifyThresholdInput) elements.tempoSimplifyThresholdInput.value = String(options.maxBpmDeltaExclusive);
      updateTempoSimplifySummary();
    });
    elements.tempoSimplifyThresholdInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); applyTempoSimplification(); }
    });
    elements.tempoSimplifyBackdrop?.addEventListener("pointerdown", (event) => {
      if (event.target === elements.tempoSimplifyBackdrop) closeTempoSimplifyDialog();
    });
    elements.measureSpaceInsertButton?.addEventListener("click", () => openTimeEditDialog({ preferredAction: "insert" }));
    elements.measureSpaceDeleteButton?.addEventListener("click", () => openTimeEditDialog({ preferredAction: "delete" }));
    elements.timeEditCloseButton?.addEventListener("click", closeTimeEditDialog);
    elements.timeEditCancelButton?.addEventListener("click", closeTimeEditDialog);
    elements.timeEditInsertButton?.addEventListener("click", () => applyTimeEdit("insert"));
    elements.timeEditDeleteButton?.addEventListener("click", () => applyTimeEdit("delete"));
    elements.timeEditSelectedChannelOnly?.addEventListener("change", updateTimeEditScopeUi);
    elements.timeEditBeatInput?.addEventListener("input", () => {
      const input = elements.timeEditBeatInput;
      if (!input || input.value === "") return;
      const parsed = Math.floor(Number(input.value));
      if (!Number.isFinite(parsed)) {
        input.value = "";
        return;
      }
      if (parsed < 0) input.value = "0";
      else if (parsed > 63) input.value = "63";
      else if (String(parsed) !== input.value) input.value = String(parsed);
    });
    elements.timeEditMeasureInput?.addEventListener("blur", () => normalizeTimeEditMeasureInput({ clampValue: true }));
    elements.timeEditBeatInput?.addEventListener("blur", () => normalizeTimeEditSubdivisionInput({ clampValue: true }));
    for (const input of [elements.timeEditMeasureInput, elements.timeEditBeatInput]) {
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyTimeEdit(state.timeEdit?.preferredAction === "delete" ? "delete" : "insert");
        }
      });
    }
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
    document.addEventListener("copy", handleNativeNodeCopyEvent);
    document.addEventListener("cut", handleNativeNodeCutEvent);
    document.addEventListener("paste", handleNativeNodePasteEvent);
    window.addEventListener("storage", handleNodeClipboardStorageEvent);

    document.addEventListener("keydown", (event) => {
      if (isModalPopupOpen()) {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          closeContextMenu();
          closeFileMenu();
          closeEditMenu();
          closeThemeMenu();
          closeGoogleAccountMenu();
          closeChannelMuteMixer();
          closeChannelMergeDialog();
          closeChannelEditDialog();
          closeChannelMmlDialog();
          closeEditorSoundFontDialog();
          closeShortcutHelpDialog();
          closeVolumeMenu();
          closeZoomMenu();
          closePlaybackRateMenu();
          closeMmlImportDialog();
          closeMidiImportDialog();
          closeMidiTransferDialog();
          closeNoteVolumeDialog();
          closeNoteTrillDialog();
          closeNotePerformanceDialog();
          closeChannelShiftDialog();
          closeTempoEditor();
          closeTempoSimplifyDialog();
          closeTimeEditDialog();
        }
        return;
      }
      if (event.key === "Control" && !isTextEntryTarget(event.target)) {
        setCtrlToolHeld(true);
      }
      if (handleEditModeShortcut(event) || handleZoomShortcut(event) || handlePlaybackShortcut(event)) {
        return;
      }

      // 채널 트리/버튼에 포커스가 있어도 채널 간 노트 복사·붙여넣기 단축키는 계속 동작합니다.
      const commandKey = event.ctrlKey || event.metaKey;
      const key = String(event.key || "").toLowerCase();

      // Ctrl/Cmd + Shift + V: 클립보드의 MML 코드를 전용 불러오기 창으로 보냅니다.
      if (
        !event.defaultPrevented
        && commandKey
        && event.shiftKey
        && !event.altKey
        && key === "v"
        && !isTextEntryTarget(event.target)
      ) {
        event.preventDefault();
        void pasteMmlFromClipboardShortcut();
        return;
      }

      if (
        !event.defaultPrevented
        && commandKey
        && !event.shiftKey
        && !event.altKey
        && !isTextEntryTarget(event.target)
        && state.activePanel === "notes"
        && !isMidiReferenceActive()
        && (key === "b" || event.code === "KeyB")
      ) {
        event.preventDefault();
        void insertPasteNotesFromClipboard();
        return;
      }

      if (event.key === "Escape") {
        closeContextMenu();
        closeFileMenu();
        closeEditMenu();
        closeThemeMenu();
        closeGoogleAccountMenu();
        closeChannelMuteMixer();
        closeChannelMergeDialog();
        closeChannelEditDialog();
        closeChannelMmlDialog();
        closeEditorSoundFontDialog();
        closeShortcutHelpDialog();
        closeVolumeMenu();
        closeZoomMenu();
        closePlaybackRateMenu();
        closeMmlImportDialog();
        closeMidiImportDialog();
        closeMidiTransferDialog();
        closeNoteVolumeDialog();
        closeNoteTrillDialog();
        closeNotePerformanceDialog();
        closeChannelShiftDialog();
        closeTempoEditor();
        closeTempoSimplifyDialog();
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
    document.addEventListener("keyup", (event) => {
      if (event.key === "Control") setCtrlToolHeld(false);
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
      setCtrlToolHeld(false);
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


  function populateChannelInstrumentSelect() {
    const selects = [elements.channelInstrumentSelect, elements.channelEditInstrumentSelect].filter(Boolean);
    if (!selects.length) return;
    const presets = getEditorSoundBankPresets();
    const signature = presets.length
      ? presets.map((preset) => `${editorPresetKey(preset.bank, preset.preset)}:${String(preset.name || "")}`).join("|")
      : "loading";
    if (signature === editorInstrumentOptionsSignature && selects.every((select) => select.options.length)) return;
    editorInstrumentOptionsSignature = signature;
    for (const select of selects) {
      const previousValue = String(select.value || "");
      select.replaceChildren();
      if (!presets.length) {
        const option = new Option(i18nText("ui.ready_default_sounds"), "0:0");
        option.disabled = true;
        select.add(option);
        select.disabled = true;
        continue;
      }
      select.disabled = false;
      for (const preset of presets) {
        const bank = clamp(Math.round(Number(preset.bank) || 0), 0, 16383);
        select.add(new Option(formatEditorPresetLabel(preset), editorPresetKey(bank, preset.preset)));
      }
      if ([...select.options].some((option) => option.value === previousValue)) select.value = previousValue;
    }
  }

  async function initialize() {
    try { await window.MobibardI18n?.ready; } catch (error) { console.error("Editor locale initialization failed", error); }
    populateChannelInstrumentSelect();
    state.language = normalizeLanguage(window.MobibardI18n?.language || loadStoredLanguage());
    window.addEventListener("mobibard:localechange", refreshLocaleDependentUi);
    applyLanguage(state.language, { persist: false });
    state.theme = loadStoredTheme();
    applyTheme(state.theme, { persist: false });
    state.masterVolume = loadStoredVolume();
    setMasterVolume(state.masterVolume, { persist: false });
    state.noteVolumeDisplay = loadStoredNoteVolumeDisplay();
    setNoteVolumeDisplay(state.noteVolumeDisplay, { persist: false });
    state.playbackRate = loadStoredPlaybackRate();
    setPlaybackRate(state.playbackRate, { persist: false, restart: false });
    state.noteClipboard = readNodeClipboardFromSharedStorage();
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

    const prepareAudio = async () => {
      try {
        await audioEngine.prepare();
        reconcileEditorChannelsWithSoundBank();
        populateChannelInstrumentSelect();
        renderChannelEditor();
        renderChannelTabs();
      } catch (error) {
        console.error("Editor default SoundFont preparation failed", error);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => { void prepareAudio(); }, { timeout: 700 });
    } else {
      window.setTimeout(() => { void prepareAudio(); }, 250);
    }

    // 추후 메뉴를 교체할 때 사용할 수 있도록 공개합니다.
    window.MMLEditor = {
      state,
      registerContextMenu,
      serializeProject,
      loadProjectFromFile,
      markProjectSaved,
      showToast,
      closeFileMenu,
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
      setChannelHue,
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
    window.dispatchEvent(new CustomEvent("mobibard:editorready", { detail: { editor: window.MMLEditor } }));
  }

  initialize().catch((error) => {
    console.error("Mobibard initialization failed", error);
    showToast("편집기를 초기화하지 못했습니다.");
  });
})();
