(() => {
  "use strict";

  const DEFAULT_SF2_URL = "assets/Roland_SC-55.sf2";
  const DEFAULT_SF2_EMBEDDED_B64 = () => window.MABINOGI_DEFAULT_SF2_B64 || "";
  const PART_LABELS = ["멜로디", "화음1", "화음2", "화음3", "화음4", "화음5"];
  const PREF_PREFIX = "mobibard.player.";
  const DEFAULT_PART_PRESET_KEY = "0:0";
  const DEFAULT_MIDI_SOUND_PRESET_LABEL = "최근 MIDI 음색";
  const USER_SOUND_PRESET_VALUE_PREFIX = "user:";
  const PART_PREVIEW_MELODY_INTERVALS = [0, 2, 4, 7, 9, 7, 4, 0];
  const PART_PREVIEW_DRUM_NOTES = [36, 42, 38, 42, 36, 46, 38, 42];
  const OVERLAP_MERGE_OPTIONS = [
    { value: "all", label: "모두" },
    { value: "half", label: "절반" },
    { value: "none", label: "안함" }
  ];
  const MIDI_INSTRUMENT_CATEGORY_ORDER = ["keyboard", "strings", "winds", "percussion", "other"];
  const MIDI_INSTRUMENT_CATEGORY_LABELS = {
    keyboard: "건반악기",
    strings: "현악기",
    winds: "관악기",
    percussion: "타악기",
    other: "나머지"
  };
  const GOOGLE_CONFIG = window.MOBIBARD_GOOGLE_CONFIG || {};
  const GOOGLE_DRIVE_SCOPE = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.appdata"
  ].join(" ");
  const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
  const GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  const GOOGLE_SETTINGS_FILE_NAME = "mobibard-player-settings.json";
  const GOOGLE_SETTINGS_APP_NAME = "mabinogi-mml-player";
  const GOOGLE_MML_FOLDER_NAME = "MML_Mobibard";
  const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
  const GOOGLE_AUTO_RECONNECT_PREF = "googleAutoReconnect";
  const GOOGLE_TOKEN_CACHE_PREF = "googleTokenCache";
  const GOOGLE_LOCAL_ONLY_PREFS = new Set([GOOGLE_AUTO_RECONNECT_PREF, GOOGLE_TOKEN_CACHE_PREF]);
  const AUTO_IMPORT_LEADING_SILENCE_SECONDS = 2;
  const MMI_IMPORT_MAX_CHANNELS = 6;
  const MMI_IMPORT_MAX_DETECTED_PARTS = 96;
  const SOURCE_FILE_EXTENSIONS = new Set(["mid", "midi", "txt", "mmi", "mml"]);
  const HEADER_SHORTCUT_LINKS = new Map([
    ["https://drive.google.com/drive/folders/17mHTnFD475WKYUFK9aowEymi1183vtqD?usp=drive_link", "developer_mml_share"],
    ["https://bitmidi.com/", "bitmidi"],
    ["https://ichigos.com/", "ichigos"],
    ["http://www.midiex.net/", "midiex"],
    ["http://www.midisite.co.uk/", "midisite"],
    ["https://musescore.com/", "musescore"],
    ["https://www.vgmusic.com/", "vgmusic_https"]
  ]);
  const MIDI_RESOURCE_LINK_IDS = new Set(["bitmidi", "ichigos", "midiex", "midisite", "musescore", "vgmusic_https"]);


  const { shortError, base64ToUint8Array, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview } = window.MabiMidi;
  const { parseMabinogiMml, splitMmlParts, parseMmlPart, buildSchedule, composeMml } = window.MabiMml;
  const { optimizeMml, optimizePart, trimShortRestsMml, addLeadingSilenceMml, adjustVolumesMml, splitMmlPages } = window.MabiOptimizer;
  const { parseSoundFont, prepareNotes, schedulePreparedNotes } = window.MabiSf2;

  const $ = (id) => document.getElementById(id);
  const midiFile = $("midiFile");
  const midiLoadBtn = $("midiLoadBtn");
  const midiSiteLinks = $("midiSiteLinks");
  const soundSource = $("soundSource");
  const sf2File = $("sf2File");
  const soundName = $("soundName");
  const googleLoginBtn = $("googleLoginBtn");
  const googleDriveLoadBtn = $("googleDriveLoadBtn");
  const googleDriveSaveBtn = $("googleDriveSaveBtn");
  const googleStatus = $("googleStatus");
  const googleDriveSaveDialog = $("googleDriveSaveDialog");
  const googleDriveSaveForm = $("googleDriveSaveForm");
  const googleDriveSaveFolderNameText = $("googleDriveSaveFolderNameText");
  const googleDriveSaveFolderBtn = $("googleDriveSaveFolderBtn");
  const googleDriveSaveFileName = $("googleDriveSaveFileName");
  const googleDriveSaveStatus = $("googleDriveSaveStatus");
  const googleDriveSaveCancel = $("googleDriveSaveCancel");
  const googleDriveSaveApply = $("googleDriveSaveApply");
  const mmiImportDialog = $("mmiImportDialog");
  const mmiImportForm = $("mmiImportForm");
  const mmiImportTitle = $("mmiImportTitle");
  const mmiImportSummary = $("mmiImportSummary");
  const mmiFullPreviewBtn = $("mmiFullPreviewBtn");
  const mmiAllPreviewBtn = $("mmiAllPreviewBtn");
  const mmiChannelList = $("mmiChannelList");
  const mmiImportStatus = $("mmiImportStatus");
  const mmiImportClear = $("mmiImportClear");
  const mmiImportReloadFile = $("mmiImportReloadFile");
  const mmiImportCancel = $("mmiImportCancel");
  const mmiImportApply = $("mmiImportApply");
  const codeHelpBtn = $("codeHelpBtn");
  const codeHelpDialog = $("codeHelpDialog");
  const codeHelpClose = $("codeHelpClose");
  const playToggleBtn = $("playToggleBtn");
  const rewindBtn = $("rewindBtn");
  const loopPlayback = $("loopPlayback");
  const speedSlider = $("speedSlider");
  const speedValue = $("speedValue");
  const volumeSlider = $("volumeSlider");
  const volumeValue = $("volumeValue");
  const progressSlider = $("progressSlider");
  const tempoMarkerLayer = $("tempoMarkerLayer");
  const playInfo = $("playInfo");
  const copyBtn = $("copyBtn");
  const pasteBtn = $("pasteBtn");
  const saveBtn = $("saveBtn");
  const splitCopyBtn = $("splitCopyBtn");
  const splitCopyDialog = $("splitCopyDialog");
  const splitCopyLimit = $("splitCopyLimit");
  const splitCopySummary = $("splitCopySummary");
  const splitCopyPages = $("splitCopyPages");
  const splitCopyRebuild = $("splitCopyRebuild");
  const splitCopyClose = $("splitCopyClose");
  const restTrimBtn = $("restTrimBtn");
  const restTrimDialog = $("restTrimDialog");
  const restTrimLimit = $("restTrimLimit");
  const restTrimApply = $("restTrimApply");
  const restTrimCancel = $("restTrimCancel");
  const restTrimSelectAll = $("restTrimSelectAll");
  const restTrimSelectNone = $("restTrimSelectNone");
  const bulkVolumeBtn = $("bulkVolumeBtn");
  const bulkVolumeDialog = $("bulkVolumeDialog");
  const bulkVolumeAmount = $("bulkVolumeAmount");
  const bulkVolumeApply = $("bulkVolumeApply");
  const bulkVolumeCancel = $("bulkVolumeCancel");
  const bulkVolumeSelectAll = $("bulkVolumeSelectAll");
  const bulkVolumeSelectNone = $("bulkVolumeSelectNone");
  const leadingSilenceBtn = $("leadingSilenceBtn");
  const leadingSilenceDialog = $("leadingSilenceDialog");
  const leadingSilenceSeconds = $("leadingSilenceSeconds");
  const leadingSilenceApply = $("leadingSilenceApply");
  const leadingSilenceCancel = $("leadingSilenceCancel");
  const midiConvertDialog = $("midiConvertDialog");
  const midiConvertSummary = $("midiConvertSummary");
  const midiFullPreviewBtn = $("midiFullPreviewBtn");
  const midiSelectedPreviewBtn = $("midiSelectedPreviewBtn");
  const midiInstrumentSelectAll = $("midiInstrumentSelectAll");
  const midiInstrumentSelectNone = $("midiInstrumentSelectNone");
  const midiInstrumentCategoryButtons = Array.from(document.querySelectorAll("[data-midi-category-select]"));
  const midiChannelList = $("midiChannelList");
  const midiRoleList = $("midiRoleList");
  const midiBeatNotice = $("midiBeatNotice");
  const midiInstrumentPanelTitle = $("midiInstrumentPanelTitle");
  const midiInstrumentPanelHint = $("midiInstrumentPanelHint");
  const midiConvertReloadFile = $("midiConvertReloadFile");
  const midiConvertApply = $("midiConvertApply");
  const midiConvertCancel = $("midiConvertCancel");
  const midiConvertStatus = $("midiConvertStatus");
  const themeToggleBtn = $("themeToggleBtn");
  const charCount = $("charCount");
  const partSoundBtn = $("partSoundBtn");
  const partSoundDialog = $("partSoundDialog");
  const partSoundRows = $("partSoundRows");
  const partSoundCancel = $("partSoundCancel");
  const partSoundApply = $("partSoundApply");
  const partSoundPresetSelect = $("partSoundPresetSelect");
  const partSoundPresetSave = $("partSoundPresetSave");
  const partSoundPresetDelete = $("partSoundPresetDelete");
  const soundPresetQuickSelect = $("soundPresetQuickSelect");
  const partMuteToggle = $("partMuteToggle");
  const partMuteLabel = $("partMuteLabel");
  const mainMml = $("mainMml");
  const mainMmlHighlight = $("mainMmlHighlight");
  const partTexts = PART_LABELS.map((_, i) => $(`part${i}`));
  const partMmlHighlights = PART_LABELS.map((_, i) => $(`part${i}Highlight`));
  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".mml-panel"));

  let audioCtx = null;
  let masterGain = null;
  let soundFont = null;
  let sf2Name = "기본 사운드";
  let activeSources = [];
  let activeTimers = [];
  let preparedNotes = [];
  let scheduledNoteIds = new Set();
  let schedulerTimer = 0;
  const PLAY_START_DELAY = 0.18;
  const SCHEDULE_AHEAD_SEC = 1.6;
  const SCHEDULE_INTERVAL_MS = 80;
  let isPlaying = false;
  let playbackSpeed = 1;
  let scheduleCache = null;
  let currentOffset = 0;
  let playContextStart = 0;
  let playOffsetStart = 0;
  let playbackAutoGainScale = 1;
  let rafId = 0;
  let syncing = false;
  let copyTimer = 0;
  let activeTabName = "main";
  let isSeeking = false;
  let seekRestartTimer = 0;
  let pendingMidiImport = null;
  let pendingMidiSettings = null;
  let midiPreviewSources = [];
  let midiPreviewTimer = 0;
  let midiFullPreviewActive = false;
  let midiSelectedPreviewActive = false;
  let midiChannelPreviewButton = null;
  let midiChannelPreviewButtonText = "";
  let midiConvertBusy = false;
  let splitPreviewButton = null;
  let splitPreviewButtonText = "";
  let partPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
  let draftPartPresetKeys = null;
  let draftSoundPresetBaseId = "";
  let midiPartPresetKeys = null;
  let midiPartPresetName = DEFAULT_MIDI_SOUND_PRESET_LABEL;
  let userSoundPresets = [];
  let partMuteStates = Array.from({ length: 6 }, () => false);
  let googleTokenClient = null;
  let googleAccessToken = "";
  let googleTokenExpiresAt = 0;
  let googleTokenExpiryTimer = 0;
  let googlePickerLoaded = false;
  let googleSettingsFileId = "";
  let googleSettingsApplying = false;
  let googleSettingsSaveTimer = 0;
  let googleSettingsSaving = false;
  let googleDriveMmlFileId = "";
  let googleDriveMmlFileName = "";
  let googleDriveMmlFolderId = "";
  let googleDriveSaveFolderId = "";
  let googleDriveSaveFolderName = "";
  let googleSilentRestoreFailed = false;
  let suggestedMmlSaveFileName = "";
  let pendingMmiImport = null;

  init();

  function init() {
    loadThemePref();
    loadPlaybackPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    restoreGoogleTokenCache();
    midiLoadBtn.addEventListener("click", () => openSourceFilePicker());
    midiSiteLinks?.addEventListener("change", openHeaderShortcutLink);
    midiFile.addEventListener("change", () => void loadSourceFile());
    installSourceFileDropHandlers();
    googleLoginBtn?.addEventListener("click", () => void handleGoogleLoginButton());
    googleDriveLoadBtn?.addEventListener("click", () => void openGoogleDrivePicker());
    googleDriveSaveBtn?.addEventListener("click", () => void saveMmlToGoogleDrive());
    codeHelpBtn?.addEventListener("click", () => openCodeHelpDialog());
    codeHelpClose?.addEventListener("click", () => codeHelpDialog?.close());
    mmiFullPreviewBtn?.addEventListener("click", () => void toggleMmiSelectedPreview());
    mmiAllPreviewBtn?.addEventListener("click", () => void toggleMmiAllPreview());
    mmiImportClear?.addEventListener("click", () => clearMmiImportSelection());
    mmiImportReloadFile?.addEventListener("click", () => openSourceFilePicker());
    mmiImportCancel?.addEventListener("click", () => closeMmiImportDialog(null));
    mmiImportApply?.addEventListener("click", () => applyMmiImportDialog());
    mmiImportDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      stopMidiPreview();
      closeMmiImportDialog(null);
    });
    mmiImportDialog?.addEventListener("close", () => {
      stopMidiPreview();
      if (pendingMmiImport) resolveMmiImportDialog(null);
    });
    soundSource.addEventListener("change", () => handleSoundSourceChange());
    sf2File.addEventListener("change", () => { if (sf2File.files?.[0]) void loadUserSf2(); resetSoundActionMenu(); });
    playToggleBtn.addEventListener("click", () => { isPlaying ? stopPlayback(false) : void playFromCurrent(); });
    rewindBtn.addEventListener("click", () => void rewindToStart());
    loopPlayback?.addEventListener("change", () => writePref("loop", loopPlayback.checked ? "1" : "0"));
    speedSlider?.addEventListener("input", applyPlaybackSpeed);
    speedSlider?.addEventListener("change", applyPlaybackSpeed);
    volumeSlider.addEventListener("input", applyOutputVolume);
    progressSlider.addEventListener("pointerdown", () => { isSeeking = true; });
    progressSlider.addEventListener("pointerup", () => { isSeeking = false; handleSeekInput(true); });
    progressSlider.addEventListener("touchend", () => { isSeeking = false; handleSeekInput(true); }, { passive: true });
    progressSlider.addEventListener("input", () => handleSeekInput(false));
    progressSlider.addEventListener("change", () => handleSeekInput(true));
    copyBtn.addEventListener("click", () => void copyVisibleMml());
    splitCopyBtn?.addEventListener("click", () => openSplitCopyDialog());
    splitCopyRebuild?.addEventListener("click", () => buildSplitCopyPages());
    splitCopyClose?.addEventListener("click", () => splitCopyDialog?.close());
    splitCopyDialog?.addEventListener("close", () => stopMidiPreview());
    pasteBtn.addEventListener("click", () => void pasteVisibleMml());
    saveBtn.addEventListener("click", () => void saveVisibleMml());
    restTrimBtn?.addEventListener("click", openRestTrimDialog);
    restTrimApply?.addEventListener("click", () => applyRestTrimFromDialog());
    restTrimCancel?.addEventListener("click", () => restTrimDialog?.close());
    restTrimSelectAll?.addEventListener("click", () => setDialogChannelSelection(".rest-trim-channel", true));
    restTrimSelectNone?.addEventListener("click", () => setDialogChannelSelection(".rest-trim-channel", false));
    bulkVolumeBtn?.addEventListener("click", openBulkVolumeDialog);
    bulkVolumeApply?.addEventListener("click", () => applyBulkVolumeFromDialog());
    bulkVolumeCancel?.addEventListener("click", () => bulkVolumeDialog?.close());
    bulkVolumeSelectAll?.addEventListener("click", () => setDialogChannelSelection(".bulk-volume-channel", true));
    bulkVolumeSelectNone?.addEventListener("click", () => setDialogChannelSelection(".bulk-volume-channel", false));
    bulkVolumeAmount?.addEventListener("change", normalizeBulkVolumeAmountInput);
    leadingSilenceBtn?.addEventListener("click", openLeadingSilenceDialog);
    leadingSilenceApply?.addEventListener("click", () => applyLeadingSilenceFromDialog());
    leadingSilenceCancel?.addEventListener("click", () => leadingSilenceDialog?.close());
    partSoundBtn?.addEventListener("click", () => void openPartSoundDialog());
    partSoundCancel?.addEventListener("click", () => partSoundDialog?.close());
    partSoundApply?.addEventListener("click", () => applyPartSoundDialog());
    partSoundPresetSelect?.addEventListener("change", () => applyPartSoundPresetToDraft(partSoundPresetSelect.value));
    partSoundPresetSave?.addEventListener("click", () => saveDraftSoundPreset());
    partSoundPresetDelete?.addEventListener("click", () => deleteSelectedSoundPreset());
    soundPresetQuickSelect?.addEventListener("change", () => applyQuickSoundPreset(soundPresetQuickSelect.value));
    partMuteToggle?.addEventListener("change", () => handlePartMuteToggleChange());
    leadingSilenceSeconds?.addEventListener("change", normalizeLeadingSilenceSecondsInput);
    leadingSilenceSeconds?.addEventListener("blur", normalizeLeadingSilenceSecondsInput);
    midiSelectedPreviewBtn?.addEventListener("click", () => void toggleMidiSelectedPreview());
    midiFullPreviewBtn?.addEventListener("click", () => void toggleMidiFullPreview());
    midiInstrumentSelectAll?.addEventListener("click", () => selectActiveMidiInstruments(true));
    midiInstrumentSelectNone?.addEventListener("click", () => selectActiveMidiInstruments(false));
    for (const button of midiInstrumentCategoryButtons) {
      button.addEventListener("click", () => selectActiveMidiInstrumentCategory(button.dataset.midiCategorySelect));
    }
    midiConvertReloadFile?.addEventListener("click", () => { if (!midiConvertBusy) openSourceFilePicker(); });
    midiConvertApply?.addEventListener("click", () => void applyMidiConvertDialog());
    midiConvertCancel?.addEventListener("click", () => {
      if (midiConvertBusy) return;
      stopMidiPreview();
      pendingMidiImport = null;
      pendingMidiSettings = null;
      midiConvertDialog?.close();
    });
    midiConvertDialog?.addEventListener("cancel", (event) => {
      if (midiConvertBusy) event.preventDefault();
    });
    midiConvertDialog?.addEventListener("close", () => {
      stopMidiPreview();
      if (!midiConvertBusy) setMidiConvertBusy(false);
      if (midiChannelList) {
        midiChannelList.style.height = "";
        midiChannelList.style.minHeight = "";
        midiChannelList.style.maxHeight = "";
      }
    });
    window.addEventListener("resize", () => {
      if (midiConvertDialog?.open) scheduleMidiInstrumentListHeightSync();
    });
    partSoundDialog?.addEventListener("close", () => stopMidiPreview());
    themeToggleBtn?.addEventListener("click", toggleTheme);
    mainMml.addEventListener("input", () => {
      normalizeTextareaCommands(mainMml);
      syncPartsFromMain();
      updateMainHighlight();
    });
    mainMml.addEventListener("scroll", syncHighlightScroll);
    partTexts.forEach((t, i) => {
      t.addEventListener("input", () => {
        normalizeTextareaCommands(t);
        syncMainFromParts();
      });
      t.addEventListener("scroll", () => syncPartHighlightScroll(i));
    });
    tabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
    normalizeTextareaCommands(mainMml);
    syncPartsFromMain();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    resetSoundActionMenu();
    updateSoundPresetControls();
    updatePartMuteControl();
    updateGoogleDriveControls();
    scheduleGoogleAutoReconnect();
    updateCharCount();
    rebuildSchedulePreviewSilently();
    trackAnalytics("mobibard_app_open", { version: "3_3" });
  }

  function trackAnalytics(eventName, params = {}) {
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(eventName, params);
        return;
      }
      const queue = window.__MOBIBARD_ANALYTICS_QUEUE__ || [];
      window.__MOBIBARD_ANALYTICS_QUEUE__ = queue;
      queue.push({ name: eventName, params });
      if (queue.length > 100) queue.splice(0, queue.length - 100);
    } catch (_) {}
  }

  function openHeaderShortcutLink() {
    if (!midiSiteLinks) return;
    const url = midiSiteLinks.value;
    midiSiteLinks.value = "";
    if (!url || !HEADER_SHORTCUT_LINKS.has(url)) return;

    const linkId = HEADER_SHORTCUT_LINKS.get(url);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      try { opened.opener = null; } catch (_) {}
    }
    trackAnalytics("shortcut_link_open", { link: linkId });
    if (MIDI_RESOURCE_LINK_IDS.has(linkId)) {
      trackAnalytics("midi_resource_link_open", { site: linkId });
    }
  }

  function analyticsFileType(nameOrExt) {
    const text = String(nameOrExt || "").trim().toLowerCase();
    const ext = text.includes(".") ? text.split(".").pop() : text;
    if (ext === "midi") return "mid";
    return SOURCE_FILE_EXTENSIONS.has(ext) ? ext : "unknown";
  }

  function analyticsFileSizeBucket(bytes) {
    const size = Number(bytes) || 0;
    if (size <= 0) return "unknown";
    if (size < 10 * 1024) return "lt_10kb";
    if (size < 100 * 1024) return "lt_100kb";
    if (size < 1024 * 1024) return "lt_1mb";
    if (size < 10 * 1024 * 1024) return "lt_10mb";
    return "gte_10mb";
  }

  function analyticsChannelCount(text) {
    try { return Math.max(0, countMmlChannels(text)); }
    catch (_) { return 0; }
  }

  function loadPlaybackPrefs() {
    const savedVolumeText = readPref("volume");
    if (savedVolumeText != null && savedVolumeText !== "") {
      const savedVolume = Number(savedVolumeText);
      if (Number.isFinite(savedVolume)) volumeSlider.value = String(Math.max(0, Math.min(150, Math.round(savedVolume))));
    }

    const savedSpeedText = readPref("speed");
    if (savedSpeedText != null && savedSpeedText !== "") {
      const savedSpeed = Number(savedSpeedText);
      if (Number.isFinite(savedSpeed)) speedSlider.value = String(Math.max(0.75, Math.min(1.5, savedSpeed)));
    }

    const savedLoop = readPref("loop");
    if (loopPlayback && savedLoop != null) loopPlayback.checked = savedLoop === "1";
  }


  function defaultPartPresetKeys() {
    return Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
  }

  function normalizePresetKeyArray(input, fallback = DEFAULT_PART_PRESET_KEY) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: 6 }, (_, i) => sanitizePresetKey(source[i] || fallback));
  }

  function samePresetKeys(a, b) {
    const aa = normalizePresetKeyArray(a);
    const bb = normalizePresetKeyArray(b);
    return aa.every((key, i) => key === bb[i]);
  }

  function loadPartSoundPrefs() {
    const saved = readPref("partPresetKeys");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      partPresetKeys = normalizePresetKeyArray(arr);
    } catch (_) {
      partPresetKeys = defaultPartPresetKeys();
    }
  }

  function savePartSoundPrefs() {
    partPresetKeys = normalizePresetKeyArray(partPresetKeys);
    writePref("partPresetKeys", JSON.stringify(partPresetKeys));
  }

  function loadMidiPartSoundPresetPrefs() {
    const saved = readPref("midiPartPresetKeys");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      midiPartPresetKeys = normalizePresetKeyArray(arr);
      midiPartPresetName = readPref("midiPartPresetName") || DEFAULT_MIDI_SOUND_PRESET_LABEL;
    } catch (_) {
      midiPartPresetKeys = null;
      midiPartPresetName = DEFAULT_MIDI_SOUND_PRESET_LABEL;
    }
  }

  function saveMidiPartSoundPresetPrefs() {
    if (!Array.isArray(midiPartPresetKeys)) return;
    midiPartPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
    writePref("midiPartPresetKeys", JSON.stringify(midiPartPresetKeys));
    writePref("midiPartPresetName", midiPartPresetName || DEFAULT_MIDI_SOUND_PRESET_LABEL);
  }

  function loadPartMutePrefs() {
    const saved = readPref("partMuteStates");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      partMuteStates = Array.from({ length: 6 }, (_, i) => Boolean(arr[i]));
    } catch (_) {
      partMuteStates = Array.from({ length: 6 }, () => false);
    }
  }

  function savePartMutePrefs() {
    partMuteStates = Array.from({ length: 6 }, (_, i) => Boolean(partMuteStates[i]));
    writePref("partMuteStates", JSON.stringify(partMuteStates));
  }

  function loadThemePref() {
    const savedTheme = readPref("theme");
    applyTheme(savedTheme === "dark" ? "dark" : "light", false);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  }

  function applyTheme(theme, persist = true) {
    const resolved = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    if (themeToggleBtn) {
      const nextLabel = resolved === "dark" ? "밝은 테마로 변경" : "어두운 테마로 변경";
      themeToggleBtn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
      themeToggleBtn.setAttribute("aria-label", nextLabel);
      themeToggleBtn.title = nextLabel;
    }
    if (persist) writePref("theme", resolved);
  }

  function readPref(name) {
    try { return localStorage.getItem(PREF_PREFIX + name); }
    catch (_) { return null; }
  }

  function writePref(name, value) {
    try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
    catch (_) {}
    scheduleGoogleSettingsSave();
  }

  function writeLocalPrefOnly(name, value) {
    try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
    catch (_) {}
  }

  function removeLocalPrefOnly(name) {
    try { localStorage.removeItem(PREF_PREFIX + name); }
    catch (_) {}
  }

  function shouldGoogleAutoReconnect() {
    return readPref(GOOGLE_AUTO_RECONNECT_PREF) === "1";
  }

  function setGoogleAutoReconnect(enabled) {
    writeLocalPrefOnly(GOOGLE_AUTO_RECONNECT_PREF, enabled ? "1" : "0");
  }

  function googleClientId() {
    return String(GOOGLE_CONFIG.clientId || GOOGLE_CONFIG.clientID || GOOGLE_CONFIG.CLIENT_ID || "").trim();
  }

  function googleApiKey() {
    return String(GOOGLE_CONFIG.apiKey || GOOGLE_CONFIG.API_KEY || "").trim();
  }

  function googleAppId() {
    return String(GOOGLE_CONFIG.appId || GOOGLE_CONFIG.APP_ID || "").trim();
  }

  function isGoogleConnected() {
    return Boolean(googleAccessToken) && Date.now() < googleTokenExpiresAt - 30000;
  }

  function clearGoogleTokenExpiryTimer() {
    if (googleTokenExpiryTimer) {
      window.clearTimeout(googleTokenExpiryTimer);
      googleTokenExpiryTimer = 0;
    }
  }

  function scheduleGoogleTokenExpiryRefresh() {
    clearGoogleTokenExpiryTimer();
    if (!googleAccessToken || !Number.isFinite(googleTokenExpiresAt) || !googleTokenExpiresAt) return;
    const delay = Math.max(0, googleTokenExpiresAt - Date.now() - 30000);
    googleTokenExpiryTimer = window.setTimeout(() => {
      if (!isGoogleConnected()) {
        clearGoogleTokenState(true);
        googleSilentRestoreFailed = true;
        updateGoogleDriveControls("로그인 필요");
      } else {
        updateGoogleDriveControls();
        scheduleGoogleTokenExpiryRefresh();
      }
    }, delay + 250);
  }

  function clearGoogleTokenCache() {
    removeLocalPrefOnly(GOOGLE_TOKEN_CACHE_PREF);
  }

  function saveGoogleTokenCache(response = {}) {
    if (!googleAccessToken || !Number.isFinite(googleTokenExpiresAt) || Date.now() >= googleTokenExpiresAt - 30000) {
      clearGoogleTokenCache();
      return;
    }
    const payload = {
      accessToken: googleAccessToken,
      expiresAt: googleTokenExpiresAt,
      cachedAt: Date.now(),
      scope: String(response.scope || GOOGLE_DRIVE_SCOPE)
    };
    try {
      writeLocalPrefOnly(GOOGLE_TOKEN_CACHE_PREF, JSON.stringify(payload));
      scheduleGoogleTokenExpiryRefresh();
    } catch (_) {
      clearGoogleTokenCache();
    }
  }

  function restoreGoogleTokenCache() {
    if (isGoogleConnected()) return true;
    const raw = readPref(GOOGLE_TOKEN_CACHE_PREF);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      const token = String(data?.accessToken || data?.access_token || "");
      const expiresAt = Number(data?.expiresAt || data?.expires_at || 0);
      if (!token || !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 30000) {
        clearGoogleTokenCache();
        return false;
      }
      googleAccessToken = token;
      googleTokenExpiresAt = expiresAt;
      googleSilentRestoreFailed = false;
      scheduleGoogleTokenExpiryRefresh();
      return true;
    } catch (_) {
      clearGoogleTokenCache();
      return false;
    }
  }

  function clearGoogleTokenState(clearCache = false) {
    googleAccessToken = "";
    googleTokenExpiresAt = 0;
    clearGoogleTokenExpiryTimer();
    clearTimeout(googleSettingsSaveTimer);
    if (clearCache) clearGoogleTokenCache();
  }

  function resetGoogleSessionState(clearCache = false) {
    clearGoogleTokenState(clearCache);
    googleDriveMmlFileId = "";
    googleDriveMmlFileName = "";
    googleDriveMmlFolderId = "";
  }

  function setGoogleStatus(message) {
    if (googleStatus) googleStatus.textContent = message || "";
  }

  function updateGoogleDriveControls(message = "") {
    const hasClient = Boolean(googleClientId());
    const hasPickerKey = Boolean(googleApiKey());
    const connected = isGoogleConnected();
    if (googleLoginBtn) {
      googleLoginBtn.disabled = !hasClient;
      googleLoginBtn.textContent = connected ? "로그아웃" : "로그인";
      googleLoginBtn.title = hasClient
        ? (connected ? "Google 계정에서 로그아웃합니다. 권한 동의는 유지됩니다." : "Google 계정으로 Drive 연동을 시작합니다.")
        : "js/google-config.js에 OAuth Client ID를 입력해야 합니다.";
    }
    if (googleDriveLoadBtn) {
      googleDriveLoadBtn.disabled = !connected || !hasPickerKey;
      googleDriveLoadBtn.title = !hasPickerKey
        ? "Drive 파일 선택에는 js/google-config.js의 API Key가 필요합니다."
        : "Google Drive의 MML_Mobibard 폴더에서 MIDI, MMI 또는 TXT MML 파일을 선택합니다.";
    }
    if (googleDriveSaveBtn) {
      googleDriveSaveBtn.disabled = !connected;
      googleDriveSaveBtn.title = "현재 전체 MML을 Google Drive의 MML_Mobibard 폴더에 TXT 파일로 저장합니다.";
    }
    if (message) {
      setGoogleStatus(message);
    } else if (!hasClient) {
      setGoogleStatus("구글 설정 필요");
    } else if (connected && !hasPickerKey) {
      setGoogleStatus("연동됨 · API Key 필요");
    } else if (connected) {
      setGoogleStatus("구글 연동됨");
    } else {
      setGoogleStatus("미연동");
    }
  }

  function openCodeHelpDialog() {
    if (codeHelpDialog?.showModal) {
      codeHelpDialog.showModal();
    } else {
      showDialog("코드 도움말", "이 브라우저에서는 코드 도움말 Dialog를 열 수 없습니다.");
    }
  }

  function waitForGoogleGlobal(test, label, timeoutMs = 10000) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (test()) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          window.clearInterval(timer);
          reject(new Error(`${label} 라이브러리를 불러오지 못했습니다.`));
        }
      }, 80);
    });
  }

  async function ensureGoogleIdentityLoaded() {
    await waitForGoogleGlobal(() => Boolean(window.google?.accounts?.oauth2), "Google 로그인");
  }

  async function ensureGooglePickerLoaded() {
    await waitForGoogleGlobal(() => Boolean(window.gapi?.load), "Google Picker");
    if (googlePickerLoaded && window.google?.picker) return;
    await new Promise((resolve, reject) => {
      try {
        window.gapi.load("picker", {
          callback: () => { googlePickerLoaded = true; resolve(); },
          onerror: () => reject(new Error("Google Picker를 불러오지 못했습니다.")),
          timeout: 10000,
          ontimeout: () => reject(new Error("Google Picker 불러오기가 시간 초과되었습니다."))
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function googleLoginRequiredError() {
    return new Error("Google 로그인 세션이 만료되었습니다. 상단 Google 로그인 버튼으로 다시 연동해 주세요.");
  }

  function requireGoogleAccessToken() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    clearGoogleTokenState(true);
    googleSilentRestoreFailed = true;
    updateGoogleDriveControls("로그인 필요");
    throw googleLoginRequiredError();
  }

  async function requestGoogleAccessTokenInteractive() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    const clientId = googleClientId();
    if (!clientId) throw new Error("Google OAuth Client ID가 설정되지 않았습니다. js/google-config.js를 먼저 채워 주세요.");
    await ensureGoogleIdentityLoaded();
    return new Promise((resolve, reject) => {
      try {
        if (!googleTokenClient) {
          googleTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_DRIVE_SCOPE,
            include_granted_scopes: true,
            callback: () => {}
          });
        }
        googleTokenClient.callback = (response) => {
          if (!response || response.error) {
            reject(new Error(response?.error_description || response?.error || "Google 로그인에 실패했습니다."));
            return;
          }
          googleAccessToken = String(response.access_token || "");
          const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
          googleTokenExpiresAt = Date.now() + expiresIn * 1000;
          googleSilentRestoreFailed = false;
          setGoogleAutoReconnect(true);
          saveGoogleTokenCache(response);
          updateGoogleDriveControls("구글 연동됨");
          resolve(googleAccessToken);
        };
        googleTokenClient.requestAccessToken({ prompt: "select_account" });
      } catch (err) {
        reject(err);
      }
    });
  }

  function scheduleGoogleAutoReconnect() {
    if (!shouldGoogleAutoReconnect() || !googleClientId()) return;
    if (restoreGoogleTokenCache()) {
      updateGoogleDriveControls("구글 연동 복원됨");
      window.setTimeout(() => void applyGoogleSettingsAfterSessionRestore("구글 연동 복원됨"), 100);
      return;
    }
    googleSilentRestoreFailed = true;
    updateGoogleDriveControls("로그인 필요");
  }

  async function applyGoogleSettingsAfterSessionRestore(fallbackMessage = "구글 연동 복원됨") {
    if (!isGoogleConnected()) return;
    const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
    updateGoogleDriveControls(appliedDriveSettings ? "구글 설정 적용됨" : fallbackMessage);
  }

  async function handleGoogleLoginButton() {
    if (isGoogleConnected()) {
      setGoogleAutoReconnect(false);
      resetGoogleSessionState(true);
      googleSilentRestoreFailed = false;
      updateGoogleDriveControls("구글 로그아웃됨");
      trackAnalytics("google_drive_logout");
      return;
    }
    try {
      updateGoogleDriveControls("구글 로그인 중...");
      await requestGoogleAccessTokenInteractive();
      setGoogleAutoReconnect(true);
      const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
      updateGoogleDriveControls(appliedDriveSettings ? "구글 설정 적용됨" : "로컬 설정 사용 중");
      trackAnalytics("google_drive_login", { settings_source: appliedDriveSettings ? "drive" : "local" });
    } catch (err) {
      resetGoogleSessionState(true);
      updateGoogleDriveControls("구글 로그인 실패");
      showDialog("구글 로그인 실패", shortError(err));
    }
  }

  function driveQueryString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function googleDriveFetch(url, options = {}, retry = true) {
    const token = requireGoogleAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      clearGoogleTokenState(true);
      googleSilentRestoreFailed = true;
      updateGoogleDriveControls("로그인 필요");
      throw googleLoginRequiredError();
    }
    return response;
  }

  async function googleDriveJson(url, options = {}) {
    const response = await googleDriveFetch(url, options);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.json();
  }

  async function googleDriveErrorMessage(response) {
    try {
      const data = await response.json();
      return data?.error?.message || `${response.status} ${response.statusText}`;
    } catch (_) {
      try { return await response.text() || `${response.status} ${response.statusText}`; }
      catch (__) { return `${response.status} ${response.statusText}`; }
    }
  }

  function createMultipartBody(metadata, content, contentType) {
    const boundary = `mobibard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  async function uploadGoogleDriveTextFile({ fileId = "", name, text, parents = null, mimeType = "text/plain" }) {
    const metadata = { name, mimeType };
    if (parents && !fileId) metadata.parents = parents;
    const multipart = createMultipartBody(metadata, text, `${mimeType}; charset=UTF-8`);
    const encodedId = encodeURIComponent(fileId);
    const url = fileId
      ? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${encodedId}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink`
      : `${GOOGLE_DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink`;
    const method = fileId ? "PATCH" : "POST";
    return googleDriveJson(url, {
      method,
      headers: { "Content-Type": multipart.contentType },
      body: multipart.body
    });
  }

  async function findGoogleMmlFolder() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_MML_FOLDER_NAME)}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=drive&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,webViewLink)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function createGoogleMmlFolder() {
    return googleDriveJson(`${GOOGLE_DRIVE_API_BASE}/files?fields=id,name,modifiedTime,webViewLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: GOOGLE_MML_FOLDER_NAME,
        mimeType: GOOGLE_DRIVE_FOLDER_MIME,
        parents: ["root"]
      })
    });
  }

  async function ensureGoogleMmlFolder() {
    if (googleDriveMmlFolderId) return googleDriveMmlFolderId;
    const existing = await findGoogleMmlFolder();
    if (existing?.id) {
      googleDriveMmlFolderId = existing.id;
      return googleDriveMmlFolderId;
    }
    const created = await createGoogleMmlFolder();
    if (!created?.id) throw new Error(`${GOOGLE_MML_FOLDER_NAME} 폴더를 만들지 못했습니다.`);
    googleDriveMmlFolderId = created.id;
    return googleDriveMmlFolderId;
  }

  function loadGoogleDriveFolderPrefs() {
    googleDriveSaveFolderId = String(readPref("googleDriveSaveFolderId") || "").trim();
    googleDriveSaveFolderName = String(readPref("googleDriveSaveFolderName") || "").trim();
  }

  function rememberGoogleDriveSaveFolder(id, name) {
    googleDriveSaveFolderId = String(id || "").trim();
    googleDriveSaveFolderName = String(name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (googleDriveSaveFolderId) writePref("googleDriveSaveFolderId", googleDriveSaveFolderId);
    if (googleDriveSaveFolderName) writePref("googleDriveSaveFolderName", googleDriveSaveFolderName);
  }

  async function pickGoogleDriveSaveFolder() {
    requireGoogleAccessToken();
    if (!googleApiKey()) throw new Error("Google Picker API Key가 설정되지 않았습니다. js/google-config.js의 apiKey를 채워 주세요.");
    setGoogleStatus(`${GOOGLE_MML_FOLDER_NAME} 폴더 확인 중...`);
    const defaultFolderId = await ensureGoogleMmlFolder();
    await ensureGooglePickerLoaded();

    return new Promise((resolve, reject) => {
      try {
        const picker = window.google?.picker;
        if (!picker) throw new Error("Google Picker를 불러오지 못했습니다.");
        const viewId = picker.ViewId.FOLDERS || picker.ViewId.DOCS;
        const view = new picker.DocsView(viewId);
        try { view.setIncludeFolders(true); } catch (_) {}
        try { view.setSelectFolderEnabled(true); } catch (_) {}
        try { view.setMimeTypes(GOOGLE_DRIVE_FOLDER_MIME); } catch (_) {}
        try { if (defaultFolderId && typeof view.setParent === "function") view.setParent(defaultFolderId); } catch (_) {}

        const folderHint = googleDriveSaveFolderName
          ? `현재 선택: ${googleDriveSaveFolderName}`
          : `기본 폴더: ${GOOGLE_MML_FOLDER_NAME}`;
        const builder = new picker.PickerBuilder()
          .setDeveloperKey(googleApiKey())
          .setOAuthToken(googleAccessToken)
          .setTitle(`저장 위치 선택 · ${folderHint}`)
          .addView(view)
          .setCallback((data) => {
            const action = data?.[picker.Response.ACTION];
            if (action === picker.Action.CANCEL) {
              resolve(null);
              return;
            }
            if (action !== picker.Action.PICKED) return;
            const doc = data[picker.Response.DOCUMENTS]?.[0];
            const id = doc?.[picker.Document.ID] || "";
            const name = doc?.[picker.Document.NAME] || "선택한 폴더";
            const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
            if (!id) {
              resolve(null);
              return;
            }
            if (mimeType && mimeType !== GOOGLE_DRIVE_FOLDER_MIME) {
              showDialog("Drive 저장 위치", "파일이 아니라 폴더를 선택해 주세요.");
              resolve(null);
              return;
            }
            resolve({ id, name });
          });
        const appId = googleAppId();
        if (appId) builder.setAppId(appId);
        builder.build().setVisible(true);
      } catch (err) {
        reject(err);
      }
    });
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function buildGoogleDriveDefaultMmlFileName() {
    const d = new Date();
    const stamp = [
      pad2(d.getFullYear() % 100),
      pad2(d.getMonth() + 1),
      pad2(d.getDate()),
      pad2(d.getHours()),
      pad2(d.getMinutes()),
      pad2(d.getSeconds())
    ].join("");
    return `mml_${stamp}.txt`;
  }

  function sourceNameToTxtFileName(name) {
    const cleaned = String(name == null ? "" : name)
      .replace(/\.[^.\\/]*$/, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? `${cleaned}.txt` : "";
  }

  function rememberSuggestedMmlSaveFileName(name) {
    const suggested = sourceNameToTxtFileName(name);
    suggestedMmlSaveFileName = suggested ? normalizeGoogleDriveTxtFileName(suggested) : "";
  }

  function clearSuggestedMmlSaveFileName() {
    suggestedMmlSaveFileName = "";
  }

  function defaultMmlSaveFileName() {
    return suggestedMmlSaveFileName || buildGoogleDriveDefaultMmlFileName();
  }

  function defaultGoogleDriveSaveFileName() {
    return defaultMmlSaveFileName();
  }

  function defaultLocalSaveFileName() {
    return defaultMmlSaveFileName();
  }

  function normalizeGoogleDriveTxtFileName(name) {
    const text = String(name == null ? "" : name).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
    const base = text || buildGoogleDriveDefaultMmlFileName();
    return /\.txt$/i.test(base) ? base : `${base}.txt`;
  }

  async function findGoogleDriveTextFileInFolder(folderId, name) {
    if (!folderId || !name) return null;
    const q = encodeURIComponent(`'${driveQueryString(folderId)}' in parents and name = '${driveQueryString(name)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=drive&pageSize=10&q=${q}&fields=files(id,name,modifiedTime,webViewLink,parents)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  function openGoogleDriveSaveDialog({ defaultFolderId, defaultFolderName, defaultFileName, onCommit = null }) {
    const initialFolder = {
      id: defaultFolderId || googleDriveSaveFolderId || googleDriveMmlFolderId,
      name: defaultFolderName || googleDriveSaveFolderName || GOOGLE_MML_FOLDER_NAME
    };
    const initialName = normalizeGoogleDriveTxtFileName(defaultFileName || buildGoogleDriveDefaultMmlFileName());

    if (!googleDriveSaveDialog?.showModal || !googleDriveSaveFileName) {
      const entered = window.prompt(`${initialFolder.name} 폴더에 저장할 TXT 파일 이름을 입력해 주세요.`, initialName);
      if (entered == null) return Promise.resolve(null);
      return Promise.resolve({
        folderId: initialFolder.id,
        folderName: initialFolder.name,
        fileName: normalizeGoogleDriveTxtFileName(entered)
      });
    }

    let selectedFolder = { ...initialFolder };
    let settled = false;
    let pauseCloseResolve = false;
    let saving = false;

    const updateFolderLabel = () => {
      if (googleDriveSaveFolderNameText) googleDriveSaveFolderNameText.textContent = selectedFolder.name || GOOGLE_MML_FOLDER_NAME;
    };
    const focusFileName = () => {
      requestAnimationFrame(() => {
        try {
          googleDriveSaveFileName.focus();
          const dot = googleDriveSaveFileName.value.toLowerCase().lastIndexOf(".txt");
          googleDriveSaveFileName.setSelectionRange(0, dot > 0 ? dot : googleDriveSaveFileName.value.length);
        } catch (_) {}
      });
    };
    const reopenSaveDialog = () => {
      if (settled || googleDriveSaveDialog.open) return;
      try {
        googleDriveSaveDialog.showModal();
        focusFileName();
      } catch (_) {}
    };
    const setSaveBusy = (busy, message = "") => {
      saving = busy;
      if (googleDriveSaveApply) {
        googleDriveSaveApply.disabled = busy;
        googleDriveSaveApply.textContent = busy ? "저장 중..." : "저장";
      }
      if (googleDriveSaveCancel) googleDriveSaveCancel.disabled = busy;
      if (googleDriveSaveFolderBtn) googleDriveSaveFolderBtn.disabled = busy;
      if (googleDriveSaveFileName) googleDriveSaveFileName.disabled = busy;
      if (googleDriveSaveStatus) googleDriveSaveStatus.textContent = message || "";
    };

    return new Promise((resolve) => {
      const cleanup = () => {
        googleDriveSaveCancel?.removeEventListener("click", onCancel);
        googleDriveSaveApply?.removeEventListener("click", onSave);
        googleDriveSaveFolderBtn?.removeEventListener("click", onPickFolder);
        googleDriveSaveDialog.removeEventListener("cancel", onCancelEvent);
        googleDriveSaveDialog.removeEventListener("close", onClose);
        setSaveBusy(false);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const closeDialog = () => {
        try { googleDriveSaveDialog.close(); } catch (_) {}
      };
      const onCancel = () => {
        if (saving) return;
        finish(null);
        closeDialog();
      };
      const onCancelEvent = (event) => {
        event.preventDefault();
        onCancel();
      };
      const onClose = () => {
        if (pauseCloseResolve) return;
        if (!settled) finish(null);
      };
      const onSave = async () => {
        if (saving) return;
        const fileName = normalizeGoogleDriveTxtFileName(googleDriveSaveFileName.value);
        googleDriveSaveFileName.value = fileName;
        setSaveBusy(true, "같은 이름의 파일이 있는지 확인 중...");
        try {
          const folderId = selectedFolder.id || googleDriveMmlFolderId || await ensureGoogleMmlFolder();
          const folderName = selectedFolder.name || GOOGLE_MML_FOLDER_NAME;
          const existing = await findGoogleDriveTextFileInFolder(folderId, fileName);
          if (existing?.id) {
            const overwrite = window.confirm(`'${folderName}' 폴더에 '${fileName}' 파일이 이미 있습니다.

덮어쓸까요?`);
            if (!overwrite) {
              setSaveBusy(false);
              focusFileName();
              return;
            }
          }
          const target = {
            folderId,
            folderName,
            fileName,
            overwriteFileId: existing?.id || ""
          };
          if (typeof onCommit === "function") {
            setSaveBusy(true, "Google Drive에 저장 중입니다. 잠시만 기다려 주세요...");
            const result = await onCommit(target);
            const savedName = result?.fileName || result?.name || fileName;
            const action = result?.createsNewFile === false ? "덮어썼습니다" : "저장했습니다";
            showDialog("Drive 저장 완료", `'${folderName}' 폴더에 '${savedName}' 파일로 ${action}.`);
            finish(result || target);
            closeDialog();
            return;
          }
          finish(target);
          closeDialog();
        } catch (err) {
          setSaveBusy(false);
          showDialog("Drive 저장 실패", shortError(err));
          reopenSaveDialog();
        }
      };
      const onPickFolder = async () => {
        if (saving) return;
        const savedName = googleDriveSaveFileName.value;
        pauseCloseResolve = true;
        closeDialog();
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        try {
          const picked = await pickGoogleDriveSaveFolder();
          if (picked) {
            selectedFolder = { id: picked.id, name: picked.name || "선택한 폴더" };
            rememberGoogleDriveSaveFolder(selectedFolder.id, selectedFolder.name);
          }
        } catch (err) {
          showDialog("Drive 저장 위치 선택 실패", shortError(err));
        } finally {
          googleDriveSaveFileName.value = savedName;
          updateFolderLabel();
          pauseCloseResolve = false;
          reopenSaveDialog();
        }
      };

      updateFolderLabel();
      googleDriveSaveFileName.value = initialName;
      googleDriveSaveCancel?.addEventListener("click", onCancel);
      googleDriveSaveApply?.addEventListener("click", onSave);
      googleDriveSaveFolderBtn?.addEventListener("click", onPickFolder);
      googleDriveSaveDialog.addEventListener("cancel", onCancelEvent);
      googleDriveSaveDialog.addEventListener("close", onClose);
      googleDriveSaveDialog.showModal();
      focusFileName();
    });
  }

  function captureLocalPrefSnapshot() {
    const prefs = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREF_PREFIX)) continue;
        const name = key.slice(PREF_PREFIX.length);
        if (GOOGLE_LOCAL_ONLY_PREFS.has(name)) continue;
        const value = localStorage.getItem(key);
        if (name && value != null && value.length < 250000) prefs[name] = value;
      }
    } catch (_) {}
    return prefs;
  }

  function parseGoogleSettings(text) {
    const data = JSON.parse(String(text || ""));
    const prefs = data?.prefs;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
      throw new Error("설정 파일 형식이 올바르지 않습니다.");
    }
    const normalized = {};
    for (const [key, value] of Object.entries(prefs)) {
      const name = String(key || "").trim();
      if (!name || GOOGLE_LOCAL_ONLY_PREFS.has(name) || name.includes(".") || name.length > 80) continue;
      if (value == null) continue;
      if (["string", "number", "boolean"].includes(typeof value)) normalized[name] = String(value);
    }
    return normalized;
  }

  function buildGoogleSettingsPayload() {
    return JSON.stringify({
      app: GOOGLE_SETTINGS_APP_NAME,
      version: 1,
      savedAt: new Date().toISOString(),
      prefs: captureLocalPrefSnapshot()
    }, null, 2);
  }

  async function findGoogleSettingsFile() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_SETTINGS_FILE_NAME)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,size)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function downloadGoogleDriveText(fileId) {
    const response = await googleDriveFetch(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.text();
  }

  function applyPrefSnapshot(prefs) {
    googleSettingsApplying = true;
    try {
      for (const [name, value] of Object.entries(prefs || {})) {
        try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
        catch (_) {}
      }
      reloadPreferencesFromStorage();
    } finally {
      googleSettingsApplying = false;
    }
  }

  function reloadPreferencesFromStorage() {
    partPresetKeys = defaultPartPresetKeys();
    midiPartPresetKeys = null;
    midiPartPresetName = DEFAULT_MIDI_SOUND_PRESET_LABEL;
    userSoundPresets = [];
    partMuteStates = Array.from({ length: 6 }, () => false);
    loadThemePref();
    loadPlaybackPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updateSoundPresetControls();
    updatePartMuteControl();
    updateCharCount();
    rebuildSchedulePreviewSilently();
  }

  async function loadGoogleSettingsOrFallbackLocal() {
    if (!isGoogleConnected()) return false;
    try {
      setGoogleStatus("구글 설정 확인 중...");
      const file = await findGoogleSettingsFile();
      if (!file?.id) {
        googleSettingsFileId = "";
        setGoogleStatus("구글 설정 생성 중...");
        await saveGoogleSettingsNow(true);
        setGoogleStatus("로컬 설정 사용 중");
        return false;
      }
      googleSettingsFileId = file.id;
      const text = await downloadGoogleDriveText(file.id);
      const prefs = parseGoogleSettings(text);
      applyPrefSnapshot(prefs);
      setGoogleStatus("구글 설정 적용됨");
      return true;
    } catch (err) {
      setGoogleStatus("구글 설정 실패 · 로컬 사용");
      try { await saveGoogleSettingsNow(true); } catch (_) {}
      return false;
    }
  }

  function scheduleGoogleSettingsSave(delay = 1600) {
    if (googleSettingsApplying || !isGoogleConnected()) return;
    clearTimeout(googleSettingsSaveTimer);
    googleSettingsSaveTimer = window.setTimeout(() => void saveGoogleSettingsNow(true), delay);
  }

  async function saveGoogleSettingsNow(silent = false) {
    if (!isGoogleConnected()) return false;
    if (googleSettingsSaving) {
      clearTimeout(googleSettingsSaveTimer);
      googleSettingsSaveTimer = window.setTimeout(() => void saveGoogleSettingsNow(true), 1200);
      return false;
    }
    googleSettingsSaving = true;
    try {
      if (!googleSettingsFileId) {
        const existing = await findGoogleSettingsFile();
        googleSettingsFileId = existing?.id || "";
      }
      const payload = buildGoogleSettingsPayload();
      const saved = await uploadGoogleDriveTextFile({
        fileId: googleSettingsFileId,
        name: GOOGLE_SETTINGS_FILE_NAME,
        text: payload,
        parents: googleSettingsFileId ? null : ["appDataFolder"],
        mimeType: "application/json"
      });
      googleSettingsFileId = saved?.id || googleSettingsFileId;
      if (!silent) setGoogleStatus("구글 설정 저장됨");
      return true;
    } catch (err) {
      if (!silent) showDialog("구글 설정 저장 실패", shortError(err));
      else setGoogleStatus("구글 설정 저장 실패");
      return false;
    } finally {
      googleSettingsSaving = false;
    }
  }

  async function openGoogleDrivePicker() {
    try {
      requireGoogleAccessToken();
      if (!googleApiKey()) throw new Error("Google Picker API Key가 설정되지 않았습니다. js/google-config.js의 apiKey를 채워 주세요.");
      setGoogleStatus(`${GOOGLE_MML_FOLDER_NAME} 폴더 확인 중...`);
      const folderId = await ensureGoogleMmlFolder();
      await ensureGooglePickerLoaded();
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      // Drive에 업로드된 MIDI 파일은 환경에 따라 audio/midi, audio/x-midi,
      // application/octet-stream 등 서로 다른 MIME 타입으로 저장될 수 있다.
      // Picker에서 MIME 타입을 강하게 제한하면 .mid/.midi 파일이 목록에서
      // 사라질 수 있으므로 기본 폴더 안의 파일을 넓게 보여주고, 선택 후
      // 확장자/MIME 검사로 MIDI 또는 TXT만 처리한다.
      try { if (folderId && typeof view.setParent === "function") view.setParent(folderId); } catch (_) {}
      const builder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey())
        .setOAuthToken(googleAccessToken)
        .setTitle(`${GOOGLE_MML_FOLDER_NAME}에서 MIDI / MMI / 3MLE MML / TXT 파일 선택`)
        .addView(view)
        .setCallback((data) => void handleGooglePickerResult(data));
      const appId = googleAppId();
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
      trackAnalytics("google_drive_picker_open");
      setGoogleStatus("구글 연동됨");
    } catch (err) {
      showDialog("Drive 불러오기 실패", shortError(err));
      updateGoogleDriveControls();
    }
  }

  async function handleGooglePickerResult(data) {
    const picker = window.google?.picker;
    if (!picker || data?.[picker.Response.ACTION] !== picker.Action.PICKED) return;
    const doc = data[picker.Response.DOCUMENTS]?.[0];
    const fileId = doc?.[picker.Document.ID];
    const name = doc?.[picker.Document.NAME] || "Google Drive 파일";
    const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
    if (!fileId) return;
    if (mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
      showDialog("Drive 불러오기", "폴더가 아니라 MIDI, MMI, 3MLE MML 또는 TXT 파일을 선택해 주세요.");
      return;
    }
    try {
      await loadGoogleDriveSourceFile(fileId, name);
    } catch (err) {
      showDialog("Drive 불러오기 실패", shortError(err));
    }
  }

  async function getGoogleDriveFileMeta(fileId) {
    return googleDriveJson(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,parents`);
  }

  function isGoogleDriveMidiFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "mid" || ext === "midi") return true;
    const type = String(mimeType || "").toLowerCase();
    return [
      "audio/midi",
      "audio/mid",
      "audio/x-midi",
      "audio/x-mid",
      "application/midi",
      "application/x-midi"
    ].includes(type);
  }

  function isGoogleDriveTextMmlFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "txt") return true;
    return ext !== "mmi" && String(mimeType || "").toLowerCase() === "text/plain";
  }

  function isGoogleDriveMabiIccoFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "mmi") return true;
    const type = String(mimeType || "").toLowerCase();
    return type === "application/x-mabiicco" || type === "application/vnd.mabiicco";
  }

  function isGoogleDriveThreeMleFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "mml") return true;
    const type = String(mimeType || "").toLowerCase();
    return type === "application/x-3mle" || type === "application/vnd.3mle";
  }

  async function loadGoogleDriveSourceFile(fileId, fallbackName = "Google Drive 파일") {
    requireGoogleAccessToken();
    stopMidiPreview();
    stopPlayback(false);
    const meta = await getGoogleDriveFileMeta(fileId);
    const name = meta?.name || fallbackName;
    const mimeType = meta?.mimeType || "";
    const response = await googleDriveFetch(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (isGoogleDriveMidiFile(name, mimeType)) {
      const overview = analyzeMidi(bytes, name);
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      openMidiConvertDialog({ bytes, name, overview });
      trackAnalytics("drive_import_midi", {
        file_type: analyticsFileType(name),
        instrument_groups: Number(overview.instrumentGroups?.length || overview.channels?.length || 0),
        note_count: Number(overview.noteCount || 0)
      });
      setGoogleStatus("Drive MIDI 불러옴");
      return;
    }
    if (isGoogleDriveMabiIccoFile(name, mimeType)) {
      const loaded = await readMabiIccoMmiFile(bytes, name);
      if (!loaded) return;
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showDialog("MML 최적화 생략", `Drive MMI 파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
      }
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, "Drive 불러옴", mainMml.value);
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus("Drive MMI 불러옴");
      return;
    }
    if (isGoogleDriveThreeMleFile(name, mimeType)) {
      const loaded = await readThreeMleMmlFile(bytes, name);
      if (!loaded) return;
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showDialog("MML 최적화 생략", `Drive 3MLE MML 파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
      }
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, "Drive 불러옴", mainMml.value);
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus("Drive 3MLE MML 불러옴");
      return;
    }
    if (isGoogleDriveTextMmlFile(name, mimeType)) {
      const loaded = readMmlTextFile(decodeTextFileBytes(bytes));
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showDialog("MML 최적화 생략", `Drive 파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
      }
      googleDriveMmlFileId = fileId;
      googleDriveMmlFileName = name;
      rememberSuggestedMmlSaveFileName(name);
      showLoadedChannelCount(googleDriveLoadBtn, "Drive 불러옴", mainMml.value);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus("Drive TXT 불러옴");
      return;
    }
    throw new Error("지원하지 않는 Drive 파일입니다. mid, midi, mmi, mml 또는 txt 파일만 선택해 주세요.");
  }

  async function saveMmlToGoogleDrive() {
    try {
      requireGoogleAccessToken();
      setGoogleStatus(`${GOOGLE_MML_FOLDER_NAME} 폴더 확인 중...`);
      const defaultFolderId = await ensureGoogleMmlFolder();
      let exportData;
      try {
        exportData = getFullMmlForExport();
      } catch (err) {
        showDialog("Drive 저장 실패", `MML 최적화 중 문제가 발생했습니다.

${shortError(err)}`);
        return;
      }
      const text = exportData.text;
      if (!text.trim()) {
        showDialog("Drive 저장 실패", "저장할 MML이 비어 있습니다.");
        return;
      }

      const defaultFolderName = googleDriveSaveFolderName || GOOGLE_MML_FOLDER_NAME;
      const defaultFileName = googleDriveMmlFileName || defaultGoogleDriveSaveFileName();
      const result = await openGoogleDriveSaveDialog({
        defaultFolderId: googleDriveSaveFolderId || defaultFolderId,
        defaultFolderName,
        defaultFileName,
        onCommit: async (target) => {
          const folderId = target.folderId || defaultFolderId;
          const folderName = target.folderName || GOOGLE_MML_FOLDER_NAME;
          const fileName = normalizeGoogleDriveTxtFileName(target.fileName);
          rememberGoogleDriveSaveFolder(folderId, folderName);

          const targetId = target.overwriteFileId || "";
          const createsNewFile = !targetId;
          setGoogleStatus("Drive 저장 중...");
          const saved = await uploadGoogleDriveTextFile({
            fileId: targetId,
            name: fileName,
            text: text + "\n",
            parents: createsNewFile ? [folderId] : null,
            mimeType: "text/plain"
          });
          googleDriveMmlFileId = saved?.id || targetId;
          googleDriveMmlFileName = saved?.name || fileName;
          rememberSuggestedMmlSaveFileName(googleDriveMmlFileName);
          return {
            saved,
            folderId,
            folderName,
            fileName: googleDriveMmlFileName,
            createsNewFile
          };
        }
      });
      if (!result) {
        setGoogleStatus("Drive 저장 취소");
        return;
      }
      flashButton(googleDriveSaveBtn, "Drive 저장 완료");
      setGoogleStatus("Drive 저장 완료");
      trackAnalytics("drive_save_mml", {
        create_new: Boolean(result.createsNewFile),
        channel_count: analyticsChannelCount(text)
      });
    } catch (err) {
      showDialog("Drive 저장 실패", shortError(err));
      updateGoogleDriveControls();
    }
  }

  function hasMidiPartSoundPreset() {
    return Array.isArray(midiPartPresetKeys) && midiPartPresetKeys.length >= 6;
  }

  function getAutoPartPresetKeys() {
    return hasMidiPartSoundPreset() ? normalizePresetKeyArray(midiPartPresetKeys) : defaultPartPresetKeys();
  }

  function sanitizeUserSoundPresetName(name, fallback = "음색 프리셋") {
    const text = String(name == null ? "" : name).replace(/\s+/g, " ").trim();
    return (text || fallback).slice(0, 40);
  }

  function createUserSoundPresetId() {
    const random = Math.random().toString(36).slice(2, 7);
    return `p${Date.now().toString(36)}${random}`;
  }

  function normalizeUserSoundPreset(raw, index = 0, usedIds = new Set()) {
    if (!raw || typeof raw !== "object") return null;
    let id = String(raw.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!id || usedIds.has(id)) id = createUserSoundPresetId();
    usedIds.add(id);
    const name = sanitizeUserSoundPresetName(raw.name, `음색 프리셋 ${index + 1}`);
    const keys = normalizePresetKeyArray(raw.keys);
    return { id, name, keys };
  }

  function loadUserSoundPresetPrefs() {
    const saved = readPref("userSoundPresets");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      const usedIds = new Set();
      userSoundPresets = arr
        .map((item, index) => normalizeUserSoundPreset(item, index, usedIds))
        .filter(Boolean)
        .slice(0, 80);
    } catch (_) {
      userSoundPresets = [];
    }
  }

  function saveUserSoundPresetPrefs() {
    const usedIds = new Set();
    userSoundPresets = (Array.isArray(userSoundPresets) ? userSoundPresets : [])
      .map((item, index) => normalizeUserSoundPreset(item, index, usedIds))
      .filter(Boolean)
      .slice(0, 80);
    writePref("userSoundPresets", JSON.stringify(userSoundPresets));
  }

  function userSoundPresetValue(id) {
    return `${USER_SOUND_PRESET_VALUE_PREFIX}${id}`;
  }

  function userSoundPresetIdFromValue(value) {
    const text = String(value || "");
    return text.startsWith(USER_SOUND_PRESET_VALUE_PREFIX) ? text.slice(USER_SOUND_PRESET_VALUE_PREFIX.length) : "";
  }

  function findUserSoundPreset(id) {
    return userSoundPresets.find(p => p.id === id) || null;
  }

  function findUserSoundPresetIdByKeys(keys) {
    const normalized = normalizePresetKeyArray(keys);
    const matched = userSoundPresets.find(p => samePresetKeys(normalized, p.keys));
    return matched?.id || "";
  }

  function soundPresetMatch(keys) {
    const normalized = normalizePresetKeyArray(keys);
    if (samePresetKeys(normalized, getAutoPartPresetKeys())) return "auto";
    const matched = userSoundPresets.find(p => samePresetKeys(normalized, p.keys));
    return matched ? userSoundPresetValue(matched.id) : "current";
  }

  function renderSoundPresetSelect(select, keys, preferredValue = null) {
    if (!select) return;
    const match = soundPresetMatch(keys);
    const currentValue = preferredValue || match;
    select.innerHTML = "";

    select.appendChild(new Option("자동 음색", "auto"));

    if (userSoundPresets.length) {
      const group = document.createElement("optgroup");
      group.label = "저장한 프리셋";
      for (const preset of userSoundPresets) {
        group.appendChild(new Option(preset.name, userSoundPresetValue(preset.id)));
      }
      select.appendChild(group);
    }

    const hasPreferred = Array.from(select.options).some(option => option.value === currentValue);
    if (hasPreferred) {
      select.value = currentValue;
    } else if (match === "current") {
      const current = new Option("현재 설정", "current");
      current.disabled = true;
      current.selected = true;
      select.insertBefore(current, select.children[1] || null);
    } else {
      select.value = match;
    }
  }

  function updateSoundPresetControls(preferredDialogValue = null, preferredQuickValue = null) {
    renderSoundPresetSelect(soundPresetQuickSelect, partPresetKeys, preferredQuickValue);
    renderSoundPresetSelect(partSoundPresetSelect, draftPartPresetKeys || partPresetKeys, preferredDialogValue);
    updatePartSoundPresetDeleteState();
  }

  function updatePartSoundPresetDeleteState() {
    const id = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const preset = id ? findUserSoundPreset(id) : null;
    const canManage = Boolean(preset);
    if (partSoundPresetDelete) {
      partSoundPresetDelete.disabled = !canManage;
      partSoundPresetDelete.title = canManage ? "선택한 저장 프리셋을 삭제합니다." : "저장한 프리셋을 선택했을 때만 삭제할 수 있습니다.";
    }
  }

  function getPartPresetKeysForMode(mode) {
    if (mode === "auto") return getAutoPartPresetKeys();
    const id = userSoundPresetIdFromValue(mode);
    const preset = id ? findUserSoundPreset(id) : null;
    return preset ? normalizePresetKeyArray(preset.keys) : null;
  }

  function applyQuickSoundPreset(mode) {
    const keys = getPartPresetKeysForMode(mode);
    if (!keys) {
      updateSoundPresetControls();
      return;
    }
    partPresetKeys = normalizePresetKeyArray(keys);
    savePartSoundPrefs();
    updateSoundPresetControls(null, mode);
    rebuildSchedulePreviewSilently();
    restartPlaybackAfterSoundChange();
  }

  function applyPartSoundPresetToDraft(mode) {
    const keys = getPartPresetKeysForMode(mode);
    if (!keys) {
      updateSoundPresetControls();
      return;
    }
    draftSoundPresetBaseId = userSoundPresetIdFromValue(mode);
    draftPartPresetKeys = normalizePresetKeyArray(keys);
    renderPartSoundRows();
    updateSoundPresetControls(mode);
  }

  function saveDraftSoundPreset() {
    if (!Array.isArray(draftPartPresetKeys)) draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
    const keys = normalizePresetKeyArray(draftPartPresetKeys);
    const selectedId = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const baseId = selectedId || draftSoundPresetBaseId;
    const basePreset = baseId ? findUserSoundPreset(baseId) : null;
    let target = null;
    let message = "";

    if (basePreset) {
      if (samePresetKeys(keys, basePreset.keys)) {
        showDialog("프리셋 저장", "변경된 음색이 없습니다.");
        updatePartSoundPresetDeleteState();
        return;
      }
      const overwrite = window.confirm(`'${basePreset.name}' 프리셋에 덮어쓸까요?

확인: 덮어쓰기
취소: 새 프리셋으로 저장`);
      if (overwrite) {
        basePreset.keys = keys;
        target = basePreset;
        message = `'${target.name}' 프리셋을 덮어썼습니다.`;
      } else {
        target = createSoundPresetFromPrompt(keys, `${basePreset.name} 복사`);
        if (!target) return;
        message = `'${target.name}' 프리셋을 새로 저장했습니다.`;
      }
    } else {
      target = createSoundPresetFromPrompt(keys, `음색 프리셋 ${userSoundPresets.length + 1}`);
      if (!target) return;
      message = `'${target.name}' 프리셋을 저장했습니다.`;
    }

    saveUserSoundPresetPrefs();
    draftPartPresetKeys = keys;
    draftSoundPresetBaseId = target.id;
    updateSoundPresetControls(userSoundPresetValue(target.id));
    showDialog("프리셋 저장 완료", message);
  }

  function createSoundPresetFromPrompt(keys, defaultName, excludeId = "") {
    const input = window.prompt("저장할 음색 프리셋 이름을 입력하세요.", defaultName);
    if (input == null) return null;
    const name = sanitizeUserSoundPresetName(input, "");
    if (!name) {
      showDialog("프리셋 저장 실패", "프리셋 이름을 입력해 주세요.");
      return null;
    }

    let target = userSoundPresets.find(p => p.name === name && p.id !== excludeId) || null;
    if (target) {
      if (!window.confirm(`이미 '${name}' 프리셋이 있습니다. 덮어쓸까요?`)) return null;
      target.keys = keys;
      return target;
    }

    target = { id: createUserSoundPresetId(), name, keys };
    userSoundPresets.push(target);
    return target;
  }

  function deleteSelectedSoundPreset() {
    const id = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const preset = id ? findUserSoundPreset(id) : null;
    if (!preset) {
      showDialog("프리셋 삭제 실패", "삭제할 저장 프리셋을 선택해 주세요.");
      updatePartSoundPresetDeleteState();
      return;
    }
    if (!window.confirm(`'${preset.name}' 프리셋을 삭제할까요?`)) return;
    userSoundPresets = userSoundPresets.filter(p => p.id !== id);
    saveUserSoundPresetPrefs();
    updateSoundPresetControls();
    showDialog("프리셋 삭제 완료", `'${preset.name}' 프리셋을 삭제했습니다.`);
  }

  function getActivePartIndex() {
    const m = /^part(\d+)$/.exec(activeTabName || "");
    if (!m) return null;
    const idx = Number(m[1]);
    return idx >= 0 && idx < 6 ? idx : null;
  }

  function updatePartMuteControl() {
    const idx = getActivePartIndex();
    const allMuted = partMuteStates.every(Boolean);
    if (partMuteToggle) {
      partMuteToggle.disabled = false;
      partMuteToggle.indeterminate = false;
      partMuteToggle.checked = idx == null ? allMuted : Boolean(partMuteStates[idx]);
      partMuteToggle.title = idx == null
        ? "모든 채널을 한 번에 재생에서 제외하거나 다시 켭니다."
        : `${PART_LABELS[idx]} 채널을 재생에서 제외합니다.`;
    }
    if (partMuteLabel) partMuteLabel.textContent = idx == null ? "전체 음소거" : "채널 음소거";
    for (let i = 0; i < 6; i++) {
      const tab = tabs.find(t => t.dataset.tab === `part${i}`);
      if (tab) tab.classList.toggle("muted", Boolean(partMuteStates[i]));
    }
  }

  function handlePartMuteToggleChange() {
    if (!partMuteToggle) {
      updatePartMuteControl();
      return;
    }
    const idx = getActivePartIndex();
    const muted = Boolean(partMuteToggle.checked);
    if (idx == null) {
      partMuteStates = Array.from({ length: 6 }, () => muted);
    } else {
      partMuteStates[idx] = muted;
    }
    savePartMutePrefs();
    updatePartMuteControl();
    rebuildSchedulePreviewSilently();
    restartPlaybackAfterSoundChange();
  }

  function restartPlaybackAfterSoundChange() {
    if (!isPlaying) return;
    currentOffset = getCurrentPlaybackOffset();
    stopPlayback(false);
    void playFromCurrent();
  }

  function handleSoundSourceChange() {
    const action = soundSource.value;
    resetSoundActionMenu();
    if (action === "default") {
      useDefaultSound();
    } else if (action === "custom") {
      openSf2Picker();
    }
  }

  function resetSoundActionMenu() {
    // select를 동작 메뉴처럼 사용한다. 선택 후 빈 값으로 되돌리면 같은 메뉴를 다시 선택해도 change가 발생한다.
    soundSource.value = "";
  }

  function openSf2Picker() {
    // 같은 SF2 파일을 다시 선택해도 change 이벤트가 발생하도록 매번 초기화한다.
    sf2File.value = "";
    sf2File.click();
  }

  function useDefaultSound() {
    stopPlayback(false);
    soundFont = null;
    sf2Name = "기본 사운드";
    sf2File.value = "";
    resetSoundActionMenu();
    soundName.textContent = "기본 사운드";
  }

  function openSourceFilePicker() {
    if (!midiFile) return;
    midiFile.value = "";
    midiFile.click();
  }

  function closeImportDialogsForSourceReload() {
    stopMidiPreview();
    if (midiConvertDialog?.open) {
      try { midiConvertDialog.close("reload"); } catch (_) {}
      pendingMidiImport = null;
      pendingMidiSettings = null;
      setMidiConvertBusy(false);
    }
    if (mmiImportDialog?.open) {
      try { mmiImportDialog.close("reload"); } catch (_) {}
    }
  }

  async function loadSourceFile() {
    const file = midiFile.files?.[0];
    if (!file) return;
    await loadLocalSourceFile(file);
  }

  async function loadLocalSourceFile(file) {
    if (!file) return;
    const name = file.name || "선택한 파일";
    const ext = getSourceFileExtension(name);
    googleDriveMmlFileId = "";
    googleDriveMmlFileName = "";
    clearSuggestedMmlSaveFileName();
    closeImportDialogsForSourceReload();
    try {
      stopMidiPreview();
      stopPlayback(false);
      if (ext === "mid" || ext === "midi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const overview = analyzeMidi(bytes, name);
        openMidiConvertDialog({ bytes, name, overview });
        trackAnalytics("local_import_midi", {
          file_type: analyticsFileType(ext),
          file_size: analyticsFileSizeBucket(file.size),
          instrument_groups: Number(overview.instrumentGroups?.length || overview.channels?.length || 0),
          note_count: Number(overview.noteCount || 0)
        });
      } else if (ext === "mmi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await readMabiIccoMmiFile(bytes, name);
        if (!loaded) return;
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showDialog("MML 최적화 생략", `MMI 파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
        }
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, "불러옴", mainMml.value);
        trackAnalytics("local_import_mml", {
          file_type: analyticsFileType(ext),
          file_size: analyticsFileSizeBucket(file.size),
          channel_count: analyticsChannelCount(mainMml.value)
        });
      } else if (ext === "mml") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await readThreeMleMmlFile(bytes, name);
        if (!loaded) return;
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showDialog("MML 최적화 생략", `3MLE MML 파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
        }
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, "불러옴", mainMml.value);
        trackAnalytics("local_import_mml", {
          file_type: analyticsFileType(ext),
          file_size: analyticsFileSizeBucket(file.size),
          channel_count: analyticsChannelCount(mainMml.value)
        });
      } else if (ext === "txt") {
        const text = await file.text();
        const loaded = readMmlTextFile(text);
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showDialog("MML 최적화 생략", `파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
        }
        showLoadedChannelCount(midiLoadBtn, "불러옴", mainMml.value);
        trackAnalytics("local_import_mml", {
          file_type: analyticsFileType(ext),
          file_size: analyticsFileSizeBucket(file.size),
          channel_count: analyticsChannelCount(mainMml.value)
        });
      } else {
        throw new Error("지원하지 않는 파일입니다. mid, midi, mmi, mml, txt 파일을 선택해 주세요.");
      }
    } catch (err) {
      showDialog("파일 불러오기 실패", shortError(err));
    }
  }

  function installSourceFileDropHandlers() {
    document.addEventListener("dragover", (event) => {
      if (!isSourceFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = hasOpenAppDialog() ? "none" : "copy";
    });
    document.addEventListener("drop", (event) => {
      if (!isSourceFileDrag(event)) return;
      event.preventDefault();
      if (hasOpenAppDialog()) return;
      const file = findFirstSupportedSourceFile(event.dataTransfer?.files);
      if (!file) {
        showDialog("파일 불러오기 실패", "드래그 앤 드롭은 mid, midi, mmi, mml, txt 파일만 지원합니다.");
        return;
      }
      void loadLocalSourceFile(file);
    });
  }

  function isSourceFileDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes("Files") || types.includes("application/x-moz-file");
  }

  function hasOpenAppDialog() {
    return Array.from(document.querySelectorAll("dialog")).some(dialog => dialog.open);
  }

  function getSourceFileExtension(name) {
    return String(name || "").split(".").pop()?.toLowerCase() || "";
  }

  function isSupportedSourceFile(file) {
    return SOURCE_FILE_EXTENSIONS.has(getSourceFileExtension(file?.name || ""));
  }

  function findFirstSupportedSourceFile(files) {
    return Array.from(files || []).find(isSupportedSourceFile) || null;
  }


  function normalizeImportedFullMml(text) {
    return addLeadingSilenceMml(normalizeMmlForDisplay(text), {
      partCount: 6,
      beats: AUTO_IMPORT_LEADING_SILENCE_SECONDS * 2
    });
  }


  function readMmlTextFile(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!/^MML\s*@/i.test(raw)) {
      throw new Error("TXT 파일은 MML@...; 형식이어야 합니다.");
    }
    const m = raw.match(/^MML\s*@([\s\S]*);\s*$/i);
    if (!m) {
      throw new Error("MML 끝에 세미콜론(;)이 필요합니다.");
    }
    // 채널 내부 문법은 여기서 검사하지 않는다. 잘못된 명령은 편집기에서 빨간 배경으로 표시한다.
    return normalizeMmlForDisplay(raw);
  }


  function countMmlChannels(text) {
    try {
      return splitMmlParts(normalizeMmlForDisplay(text))
        .slice(0, MMI_IMPORT_MAX_CHANNELS)
        .filter(part => String(part || "").trim()).length;
    } catch (_) {
      return 0;
    }
  }

  function showLoadedChannelCount(button, label, text) {
    const count = countMmlChannels(text);
    if (count > 0) {
      flashButton(button, `${formatCount(count)}채널`);
      return;
    }
    flashButton(button, label || "불러옴");
  }

  async function readMabiIccoMmiFile(data, name = "MMI 파일") {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    const candidates = extractMabiIccoMmlPartCandidates(text);
    if (!candidates.length) {
      throw new Error(`${name}에서 MML 코드를 찾지 못했습니다.`);
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }

  async function readThreeMleMmlFile(data, name = "3MLE MML 파일") {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    if (/^\s*MML\s*@/i.test(text)) {
      return readMmlTextFile(text);
    }
    const globalTempo = extractThreeMleGlobalTempo(text);
    const candidates = applyThreeMleGlobalTempoToCandidates(extractThreeMleMmlPartCandidates(text), globalTempo);
    if (!candidates.length) {
      throw new Error(`${name}에서 3MLE MML 채널을 찾지 못했습니다.`);
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }


  function openMmiImportDialog(candidates, name = "MMI 파일") {
    const normalizedCandidates = (candidates || [])
      .map((candidate, index) => ({
        label: candidate.label || `채널 ${index + 1}`,
        value: cleanupMmiMmlValue(candidate.value || ""),
        index
      }))
      .filter(candidate => candidate.value.trim())
      .slice(0, MMI_IMPORT_MAX_DETECTED_PARTS);

    if (!normalizedCandidates.length) {
      throw new Error(`${name}에서 불러올 수 있는 MML 채널을 찾지 못했습니다.`);
    }

    if (!mmiImportDialog?.showModal || !mmiChannelList) {
      return Promise.resolve(normalizedCandidates.slice(0, MMI_IMPORT_MAX_CHANNELS).map(candidate => candidate.value));
    }

    return new Promise(resolve => {
      pendingMmiImport = { candidates: normalizedCandidates, resolve };
      renderMmiImportDialog(name);
      try {
        mmiImportDialog.showModal();
      } catch (_) {
        resolveMmiImportDialog(normalizedCandidates.slice(0, MMI_IMPORT_MAX_CHANNELS).map(candidate => candidate.value));
      }
    });
  }

  function renderMmiImportDialog(name = "MMI 파일") {
    if (!pendingMmiImport || !mmiChannelList) return;
    const candidates = pendingMmiImport.candidates || [];
    if (mmiImportTitle) {
      mmiImportTitle.textContent = `MML 채널 선택 · 총 ${formatCount(candidates.length)}개`;
    }
    if (mmiImportSummary) {
      mmiImportSummary.textContent = `${name}에서 ${formatCount(candidates.length)}개의 MML 채널을 찾았습니다. 불러올 채널을 최대 ${MMI_IMPORT_MAX_CHANNELS}개까지 선택해 주세요.`;
    }
    mmiChannelList.innerHTML = candidates.map((candidate, index) => {
      const normalized = normalizeMmiLegacyLengthsInPart(candidate.value);
      const changed = normalized !== candidate.value;
      const checked = index < MMI_IMPORT_MAX_CHANNELS ? " checked" : "";
      const preview = normalized.replace(/\s+/g, " ").slice(0, 180) || "빈 채널";
      const meta = [`${formatCount(normalized.length)}자`];
      if (changed) meta.push("길이 보정");
      return `
        <div class="mmi-channel-row${checked ? " selected" : ""}" data-mmi-row="${index}">
          <input class="mmi-channel-check" type="checkbox" value="${index}"${checked} aria-label="${escapeHtml(candidate.label || `채널 ${index + 1}`)} 선택" />
          <span class="mmi-channel-main">
            <strong>${escapeHtml(candidate.label || `채널 ${index + 1}`)}</strong>
            <small>${escapeHtml(meta.join(" · "))}</small>
          </span>
          <code>${escapeHtml(preview)}${normalized.length > 180 ? "…" : ""}</code>
          <button class="mmi-preview-btn" type="button" data-mmi-preview="${index}" aria-label="${escapeHtml(candidate.label || `채널 ${index + 1}`)} 듣기">듣기</button>
        </div>`;
    }).join("");
    Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check")).forEach(input => {
      input.addEventListener("change", handleMmiImportSelectionChanged);
    });
    Array.from(mmiChannelList.querySelectorAll("[data-mmi-preview]")).forEach(button => {
      button.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMmiImportCandidate(Number(button.dataset.mmiPreview), button);
      });
    });
    Array.from(mmiChannelList.querySelectorAll("[data-mmi-row]")).forEach(row => {
      row.addEventListener("click", (ev) => {
        if (ev.target?.closest?.("button, input, a, select, textarea")) return;
        const input = row.querySelector(".mmi-channel-check");
        if (!input || input.disabled) return;
        input.checked = !input.checked;
        handleMmiImportSelectionChanged();
      });
    });
    updateMmiImportSelectionState();
  }

  function getSelectedMmiImportIndexes() {
    if (!mmiChannelList) return [];
    return Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check:checked"))
      .map(input => Number(input.value))
      .filter(index => Number.isInteger(index));
  }

  function getSelectedMmiImportParts() {
    if (!pendingMmiImport) return [];
    return getSelectedMmiImportIndexes()
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(index => pendingMmiImport.candidates[index]?.value || "")
      .filter(value => value.trim());
  }

  function handleMmiImportSelectionChanged() {
    if (splitPreviewButton === mmiFullPreviewBtn) stopMidiPreview();
    updateMmiImportSelectionState();
  }

  function updateMmiImportSelectionState() {
    if (!mmiChannelList) return;
    const checks = Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check"));
    const checked = checks.filter(input => input.checked);
    const checkedCount = checked.length;
    for (const input of checks) {
      input.disabled = !input.checked && checkedCount >= MMI_IMPORT_MAX_CHANNELS;
      input.closest(".mmi-channel-row")?.classList.toggle("selected", Boolean(input.checked));
    }
    if (mmiImportStatus) {
      mmiImportStatus.textContent = checkedCount
        ? `선택 ${checkedCount}/${MMI_IMPORT_MAX_CHANNELS}개`
        : "불러올 채널을 1개 이상 선택해 주세요.";
    }
    if (mmiFullPreviewBtn) mmiFullPreviewBtn.disabled = checkedCount < 1 && splitPreviewButton !== mmiFullPreviewBtn;
    if (mmiAllPreviewBtn) mmiAllPreviewBtn.disabled = getAllMmiImportParts().length < 1 && splitPreviewButton !== mmiAllPreviewBtn;
    if (mmiImportClear) mmiImportClear.disabled = checkedCount < 1;
    if (mmiImportApply) mmiImportApply.disabled = checkedCount < 1;
  }

  function clearMmiImportSelection() {
    if (!mmiChannelList) return;
    if (splitPreviewButton === mmiFullPreviewBtn) stopMidiPreview();
    Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check")).forEach(input => {
      input.checked = false;
      input.disabled = false;
    });
    updateMmiImportSelectionState();
  }

  async function toggleMmiSelectedPreview() {
    if (!pendingMmiImport || !mmiChannelList) return;
    const button = mmiFullPreviewBtn instanceof HTMLElement ? mmiFullPreviewBtn : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    const selectedParts = getSelectedMmiImportParts();
    if (!selectedParts.length) {
      if (mmiImportStatus) mmiImportStatus.textContent = "선택 듣기를 하려면 채널을 1개 이상 선택해 주세요.";
      return;
    }

    trackAnalytics("preview_mml_selected", { channel_count: selectedParts.length });
    await playMmiImportPartsPreview(selectedParts, {
      button,
      statusText: `선택 ${selectedParts.length}/${MMI_IMPORT_MAX_CHANNELS}개 미리듣기 중...`,
      errorPrefix: "선택 듣기 실패"
    });
  }

  async function toggleMmiAllPreview() {
    if (!pendingMmiImport) return;
    const button = mmiAllPreviewBtn instanceof HTMLElement ? mmiAllPreviewBtn : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    const allParts = getAllMmiImportParts();
    if (!allParts.length) {
      if (mmiImportStatus) mmiImportStatus.textContent = "전부 듣기를 하려면 파일 안에 MML 채널이 1개 이상 있어야 합니다.";
      return;
    }

    trackAnalytics("preview_mml_all", { channel_count: allParts.length });
    await playMmiImportPartsPreview(allParts, {
      button,
      statusText: `전체 ${allParts.length}개 채널 미리듣기 중...`,
      errorPrefix: "전부 미리듣기 실패",
      allowManyParts: true
    });
  }

  function getAllMmiImportParts() {
    if (!pendingMmiImport) return [];
    return (pendingMmiImport.candidates || [])
      .map(candidate => candidate?.value || "")
      .filter(value => String(value || "").trim());
  }

  async function playMmiImportPartsPreview(rawParts, options = {}) {
    const button = options.button instanceof HTMLElement ? options.button : null;
    const parts = (rawParts || [])
      .map(part => normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(part || "")))
      .filter(part => part.trim());
    if (!parts.length) {
      if (mmiImportStatus) mmiImportStatus.textContent = "미리들을 MML 채널이 없습니다.";
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      if (mmiImportStatus) mmiImportStatus.textContent = options.statusText || "미리듣기 중...";

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const scheduled = buildMmiImportPreviewSchedule(parts, { allowManyParts: Boolean(options.allowManyParts) });
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error("미리들을 음표가 없습니다.");
      if (!soundFont?.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");

      const prepared = prepareMmiImportPreviewNotes(ctx, notes, parts.length);
      if (!prepared.length) throw new Error("소리 나는 음표가 없습니다.");

      const duration = notes.reduce((m, n) => Math.max(m, (Number(n.start) || 0) + (Number(n.durationSec) || 0)), 0);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: Math.max(0.5, duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: null,
        minLeadTime: 0.01,
        gainScale
      });
      const stopMs = Math.max(800, (result.maxEnd - ctx.currentTime + 0.35) * 1000);
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        updateMmiImportSelectionState();
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      if (mmiImportStatus) mmiImportStatus.textContent = `${options.errorPrefix || "미리듣기 실패"}: ${shortError(err)}`;
    }
  }

  function buildMmiImportPreviewSchedule(parts, options = {}) {
    const normalizedParts = (parts || []).map(part => normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(part || "")));
    if (!options.allowManyParts) {
      const fixedParts = normalizedParts.slice(0, MMI_IMPORT_MAX_CHANNELS);
      while (fixedParts.length < MMI_IMPORT_MAX_CHANNELS) fixedParts.push("");
      const mml = composeMml(fixedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS });
      return buildSchedule(parseMabinogiMml(mml));
    }

    const parsedParts = normalizedParts.map((part, index) => parseMmlPart(part, index));
    const tempos = [{ beat: 0, bpm: 120, part: -1, order: -1 }];
    for (const part of parsedParts) {
      if (Array.isArray(part.tempos)) tempos.push(...part.tempos);
    }
    tempos.sort((a, b) => a.beat - b.beat || a.order - b.order || a.part - b.part);
    return buildSchedule({ parts: parsedParts, tempos: normalizeMmiImportPreviewTempoMap(tempos) });
  }

  function normalizeMmiImportPreviewTempoMap(events) {
    const map = [];
    for (const ev of events || []) {
      if (!Number.isFinite(Number(ev?.beat)) || !Number.isFinite(Number(ev?.bpm))) continue;
      const beat = Number(ev.beat);
      const bpm = Number(ev.bpm);
      const last = map[map.length - 1];
      if (last && Math.abs(last.beat - beat) < 1e-9) last.bpm = bpm;
      else map.push({ beat, bpm });
    }
    if (!map.length || Math.abs(map[0].beat) > 1e-9) map.unshift({ beat: 0, bpm: 120 });
    return map;
  }

  function prepareMmiImportPreviewNotes(ctx, notes, partCount) {
    const prepared = [];
    const count = Math.max(0, Number(partCount) || 0);
    for (let partIndex = 0; partIndex < count; partIndex++) {
      const partNotes = notes.filter(note => note.part === partIndex);
      if (!partNotes.length) continue;
      const preset = getPartPreset(partIndex % MMI_IMPORT_MAX_CHANNELS);
      if (!preset) continue;
      prepared.push(...prepareNotes(ctx, soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi || a.id - b.id);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    return prepared;
  }

  async function previewMmiImportCandidate(index, triggerButton = null) {
    const candidates = pendingMmiImport?.candidates || [];
    const candidate = candidates[Number(index)];
    if (!candidate) return;

    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      if (button) {
        button.textContent = "정지";
        button.classList.add("danger");
        button.setAttribute("aria-pressed", "true");
      }
      if (mmiImportStatus) mmiImportStatus.textContent = `${candidate.label || "선택 채널"} 미리듣기 중...`;
      trackAnalytics("preview_mml_channel", { channel_index: Number(index) + 1 });

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const part = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(candidate.value || ""));
      const mml = composeMml([part, "", "", "", "", ""], { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS });
      const parsed = parseMabinogiMml(mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error("미리들을 음표가 없습니다.");
      if (!soundFont?.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");

      const firstStart = notes.reduce((m, n) => Math.min(m, Number(n.start) || 0), Infinity);
      const lastEnd = notes.reduce((m, n) => Math.max(m, (Number(n.start) || 0) + (Number(n.durationSec) || 0)), 0);
      const fromSec = Number.isFinite(firstStart) ? Math.max(0, firstStart) : 0;
      const windowEnd = Math.min(lastEnd, fromSec + 10);
      const preset = getPartPreset(0);
      if (!preset) throw new Error("미리듣기에 사용할 음색을 찾지 못했습니다.");
      const prepared = prepareNotes(ctx, soundFont, preset, notes).sort((a, b) => a.start - b.start || a.midi - b.midi);
      for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
      if (!prepared.length) throw new Error("소리 나는 음표가 없습니다.");
      const gainScale = computeAutoGainScale(prepared, { windowStart: fromSec, windowEnd });

      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec,
        playbackSpeed,
        windowStart: fromSec,
        windowEnd: Math.max(fromSec + 0.25, windowEnd + 0.05),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012,
        gainScale
      });
      const stopMs = Math.max(800, Math.min(12000, (result.maxEnd - ctx.currentTime + 0.35) * 1000));
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        updateMmiImportSelectionState();
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      if (mmiImportStatus) mmiImportStatus.textContent = `미리듣기 실패: ${shortError(err)}`;
    }
  }

  function applyMmiImportDialog() {
    if (!pendingMmiImport || !mmiChannelList) return;
    const selectedParts = getSelectedMmiImportParts();
    if (!selectedParts.length) {
      if (mmiImportStatus) mmiImportStatus.textContent = "불러올 채널을 1개 이상 선택해 주세요.";
      return;
    }
    resolveMmiImportDialog(selectedParts);
    if (mmiImportDialog?.open) mmiImportDialog.close("apply");
  }

  function closeMmiImportDialog(value = null) {
    resolveMmiImportDialog(value);
    if (mmiImportDialog?.open) mmiImportDialog.close(value ? "apply" : "cancel");
  }

  function resolveMmiImportDialog(value) {
    if (!pendingMmiImport) return;
    const resolve = pendingMmiImport.resolve;
    pendingMmiImport = null;
    if (typeof resolve === "function") resolve(value);
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
    const bad = (utf8.match(/\uFFFD/g) || []).length;
    if (bad > 0 && typeof TextDecoder === "function") {
      for (const enc of ["shift_jis", "windows-31j", "euc-kr"]) {
        try {
          const decoded = new TextDecoder(enc).decode(bytes);
          const decodedBad = (decoded.match(/\uFFFD/g) || []).length;
          if (decodedBad < bad) return decoded;
        } catch (_) {}
      }
    }
    return utf8;
  }

  function extractThreeMleGlobalTempo(text) {
    const source = String(text || "");
    const channel1 = extractThreeMleSectionBlock(source, "Channel1");
    const scanSources = [channel1, source].filter(Boolean);
    for (const scanSource of scanSources) {
      const lines = String(scanSource || "").split(/\r?\n/);
      for (const line of lines) {
        const cleaned = cleanupThreeMleMmlLine(line);
        const m = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(cleaned);
        if (!m) continue;
        const bpm = clampInt(Number(m[1]) || 0, 32, 255);
        if (bpm) return `t${bpm}`;
      }
      const rawMatch = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(String(scanSource || ""));
      if (rawMatch) {
        const bpm = clampInt(Number(rawMatch[1]) || 0, 32, 255);
        if (bpm) return `t${bpm}`;
      }
    }
    return "";
  }

  function extractThreeMleSectionBlock(text, sectionName) {
    const source = String(text || "");
    const escaped = String(sectionName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im");
    const match = re.exec(source);
    if (!match) return "";
    const start = match.index + match[0].length;
    const next = /^\s*\[[^\]]+\]\s*$/gim;
    next.lastIndex = start;
    const nextMatch = next.exec(source);
    const end = nextMatch ? nextMatch.index : source.length;
    return source.slice(start, end);
  }

  function applyThreeMleGlobalTempoToCandidates(candidates, tempoToken) {
    const tempo = String(tempoToken || "").trim();
    if (!tempo) return candidates || [];
    return (candidates || []).map(candidate => {
      const value = String(candidate?.value || "").trim();
      if (!value) return candidate;
      const nextValue = /^t\s*\d+/i.test(value) ? value : `${tempo}${value}`;
      return { ...candidate, value: nextValue };
    });
  }

  function extractThreeMleMmlPartCandidates(text) {
    const source = String(text || "");
    const headers = [];
    const headerRe = /^\s*\[([^\]]+)\]\s*$/gim;
    let m;
    while ((m = headerRe.exec(source))) {
      headers.push({ title: String(m[1] || "").trim(), index: m.index, end: headerRe.lastIndex });
    }

    const records = [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const chMatch = /^Channel\s*(\d+)$/i.exec(header.title);
      if (!chMatch) continue;
      const channelNo = Number(chMatch[1]) || records.length + 1;
      const nextIndex = headers[i + 1]?.index ?? source.length;
      const block = source.slice(header.end, nextIndex);
      const code = extractThreeMleChannelMmlCode(block);
      if (!code || !hasThreeMlePlayableTokens(code) || !looksLikeMmlPart(code)) continue;
      const name = extractThreeMleChannelName(block);
      records.push({
        label: formatMmiChannelLabel(channelNo, name),
        value: code,
        name
      });
      if (records.length >= MMI_IMPORT_MAX_DETECTED_PARTS) break;
    }
    return records;
  }

  function extractThreeMleChannelName(block) {
    const text = String(block || "");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const raw = m[1] || "";
      if (!raw || /^#/.test(raw)) continue;
      if (/^(initialize|init|using_extension|using_channel)$/i.test(raw.trim())) continue;
      const name = cleanupMmiNameValue(raw);
      if (name) return name;
    }
    return "";
  }

  function extractThreeMleChannelMmlCode(block) {
    const lines = String(block || "").split(/\r?\n/);
    const parts = [];
    for (const line of lines) {
      const cleaned = cleanupThreeMleMmlLine(line);
      if (cleaned) parts.push(cleaned);
    }
    return cleanupThreeMleMmlCode(parts.join(""));
  }

  function cleanupThreeMleMmlLine(line) {
    let s = String(line || "");
    if (!s.trim() || /^\s*\/\//.test(s)) return "";
    s = s.replace(/^\s*\/\*\s*M\s*\d+\s*\*\/\s*/i, "");
    s = s.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/\/\/.*$/g, "");
    return cleanupThreeMleMmlCode(s);
  }

  function cleanupThreeMleMmlCode(value) {
    let s = String(value || "");
    s = s.replace(/\bEXx[^\s]*/gi, "");
    s = s.replace(/[Yy]\s*\d+\s*,\s*-?\d+/g, "");
    s = s.replace(/@\s*-?\d+/g, "");
    s = s.replace(/~\s*-?\d+(?:\s*,\s*-?\d+)*/g, "");
    s = s.replace(/[Vv]\s*(\d+)/g, (_, raw) => {
      const n = Math.max(0, Number(raw) || 0);
      const scaled = n > 15 ? Math.round(Math.min(127, n) * 15 / 127) : n;
      return `v${clampInt(scaled, 0, 15)}`;
    });
    s = s.replace(/[^cdefgabronltv<>+#\-&.0-9\s]/gi, "");
    return s.replace(/\s+/g, "").trim();
  }

  function hasThreeMlePlayableTokens(value) {
    return /[cdefgabn]/i.test(String(value || ""));
  }
  function extractMabiIccoMmlPartCandidates(text) {
    const source = String(text || "");
    const nameMarkers = extractMmiNameMarkers(source);
    const fullRecords = [];
    const fullRe = /MML\s*@([\s\S]*?)\s*;/gi;
    let m;
    let fullIndex = 0;
    while ((m = fullRe.exec(source))) {
      const parsed = splitMmlParts(`MML@${m[1]};`);
      for (const part of parsed) {
        fullIndex++;
        const cleaned = cleanupMmiMmlValue(part);
        if (cleaned) {
          const name = nameMarkers[fullIndex - 1]?.name || findMmiNameForCandidate(m.index, nameMarkers, fullIndex - 1);
          fullRecords.push({ label: formatMmiChannelLabel(fullIndex, name), value: cleaned, name });
        }
        if (fullRecords.length >= MMI_IMPORT_MAX_DETECTED_PARTS) return fullRecords;
      }
    }
    if (fullRecords.length) return fullRecords;

    const found = [];
    const add = (value, index = 0) => {
      const cleaned = cleanupMmiMmlValue(value);
      if (!cleaned) return;
      const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
      for (const part of parts) {
        const candidate = cleanupMmiMmlValue(part);
        if (looksLikeMmlPart(candidate)) {
          const name = findMmiNameForCandidate(index, nameMarkers, found.length);
          found.push({ index, value: candidate, name });
        }
      }
    };

    const keyed = /(?:^|[\s<{,;])(?:[A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\r\n<>]+))/gim;
    while ((m = keyed.exec(source))) add(m[1] ?? m[2] ?? m[3] ?? "", m.index);

    const tagged = /<([A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
    while ((m = tagged.exec(source))) add(m[2] || "", m.index);

    const stringTagged = /<string\b[^>]*>([\s\S]*?)<\/string>/gim;
    while ((m = stringTagged.exec(source))) add(m[1] || "", m.index);

    if (found.length < MMI_IMPORT_MAX_CHANNELS) {
      const lineRe = /^\s*([^\r\n=:#<>]{1,20000})\s*$/gm;
      while ((m = lineRe.exec(source))) add(m[1] || "", m.index);
    }

    found.sort((a, b) => a.index - b.index);
    const parts = [];
    for (const item of found) {
      pushMmiPart(parts, item.value, item.index, item.name);
      if (parts.length >= MMI_IMPORT_MAX_DETECTED_PARTS) break;
    }
    return parts.map((part, index) => ({
      label: formatMmiChannelLabel(index + 1, part.name),
      value: part.value,
      name: part.name
    }));
  }

  function extractMmiNameMarkers(source) {
    const text = String(source || "");
    const markers = [];
    const seen = new Set();
    const addName = (raw, index = 0) => {
      const name = cleanupMmiNameValue(raw);
      if (!name) return;
      const key = `${index}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      markers.push({ index: Math.max(0, Number(index) || 0), name });
    };

    let m;
    const nameTag = /<([A-Za-z0-9_:-]*(?:name|trackname|partname)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]{0,500}?)<\/\1>/gim;
    while ((m = nameTag.exec(text))) addName(m[2] || "", m.index);

    const nameAttr = /\b(?:name|trackName|track_name|partName|part_name)\s*=\s*(?:"([^"]{0,220})"|'([^']{0,220})')/gim;
    while ((m = nameAttr.exec(text))) addName(m[1] ?? m[2] ?? "", m.index);

    const keyedName = /(?:^|[\r\n,{;\s])(?:[A-Za-z0-9_.:-]*(?:name|trackname|track_name|partname|part_name)[A-Za-z0-9_.:-]*)\s*[:=]\s*(?:"([^"]{0,220})"|'([^']{0,220})'|([^\r\n,}<>]{0,220}))/gim;
    while ((m = keyedName.exec(text))) addName(m[1] ?? m[2] ?? m[3] ?? "", m.index);

    return markers.sort((a, b) => a.index - b.index);
  }

  function cleanupMmiNameValue(value) {
    let s = String(value == null ? "" : value);
    s = s.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    s = s.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    s = s.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
    s = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^name\s*[:=]\s*/i, "").trim();
    if (!s || s.length > 120) return "";
    if (/^MML\s*@/i.test(s)) return "";
    const cleanedAsMml = cleanupMmiMmlValue(s);
    if (cleanedAsMml && looksLikeMmlPart(cleanedAsMml)) return "";
    return s;
  }

  function findMmiNameForCandidate(position, markers, orderIndex = 0) {
    if (!markers?.length) return "";
    const pos = Math.max(0, Number(position) || 0);
    let best = null;
    for (const marker of markers) {
      const beforeDistance = pos - marker.index;
      if (beforeDistance >= 0 && beforeDistance <= 2400) {
        if (!best || beforeDistance < best.distance) best = { name: marker.name, distance: beforeDistance };
      }
    }
    if (best?.name) return best.name;
    for (const marker of markers) {
      const afterDistance = marker.index - pos;
      if (afterDistance >= 0 && afterDistance <= 900) {
        if (!best || afterDistance < best.distance) best = { name: marker.name, distance: afterDistance };
      }
    }
    if (best?.name) return best.name;
    const ordered = markers[Math.max(0, Math.min(markers.length - 1, Number(orderIndex) || 0))];
    return ordered?.name || "";
  }

  function formatMmiChannelLabel(number, name = "") {
    const label = `Ch ${number}`;
    const cleaned = cleanupMmiNameValue(name);
    return cleaned ? `${label} · ${cleaned}` : label;
  }

  function cleanupMmiMmlValue(value) {
    let s = String(value == null ? "" : value);
    s = s.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    s = s.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    s = s.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
    return s.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim();
  }


  function normalizeMmiLegacyLengthsInPart(value) {
    const s = String(value || "");
    let i = 0;
    let out = "";
    let legacyDefault = null;

    const isDigit = ch => /\d/.test(ch || "");
    const readDigits = () => {
      const start = i;
      while (i < s.length && isDigit(s[i])) i++;
      return i > start ? s.slice(start, i) : "";
    };
    const readDots = () => {
      const start = i;
      while (s[i] === ".") i++;
      return i - start;
    };
    const legacyFactor = dots => {
      let factor = 1;
      let add = 0.5;
      for (let n = 0; n < dots; n++) {
        factor += add;
        add /= 2;
      }
      return factor;
    };
    const isValidMmlLength = n => [1, 2, 4, 8, 16, 32, 64].includes(n);
    const quantaFromSpec = spec => {
      if (!spec || !spec.length || spec.length <= 0) return 16;
      const factor = legacyFactor(spec.dots || 0) * (spec.extraFactor || 1);
      return Math.max(1, Math.round((64 / spec.length) * factor));
    };
    const decomposeQuanta = quanta => {
      let remain = Math.max(1, Math.floor(quanta));
      const result = [];
      for (const entry of [
        { len: 1, q: 64 },
        { len: 2, q: 32 },
        { len: 4, q: 16 },
        { len: 8, q: 8 },
        { len: 16, q: 4 },
        { len: 32, q: 2 },
        { len: 64, q: 1 }
      ]) {
        while (remain >= entry.q) {
          result.push(entry.len);
          remain -= entry.q;
        }
      }
      return result.length ? result : [64];
    };
    const expandTimedToken = (head, spec, options = {}) => {
      const lengths = decomposeQuanta(quantaFromSpec(spec));
      const isRest = options.rest || /^r$/i.test(head) || /^n0$/i.test(head);
      if (options.needsLengthCommand) {
        return lengths
          .map(len => `l${len}${head}`)
          .join(isRest ? "" : "&");
      }
      return lengths
        .map(len => `${head}${len}`)
        .join(isRest ? "" : "&");
    };
    const combineDefaultSpec = (dots = 0) => {
      if (!legacyDefault) return null;
      return {
        length: legacyDefault.length,
        dots: legacyDefault.dots,
        extraFactor: legacyFactor(dots)
      };
    };

    while (i < s.length) {
      const ch = s[i];
      const lower = ch.toLowerCase();

      if (lower === "l") {
        const start = i;
        i++;
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          legacyDefault = { length: n, dots };
        } else {
          legacyDefault = null;
          out += s.slice(start, i);
        }
        continue;
      }

      if (/[cdefgab]/i.test(ch)) {
        i++;
        let head = ch;
        if (s[i] === "+" || s[i] === "#" || s[i] === "-") {
          head += s[i];
          i++;
        }
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          out += expandTimedToken(head, { length: n, dots });
        } else if (!digits && legacyDefault) {
          out += expandTimedToken(head, combineDefaultSpec(dots));
        } else {
          out += `${head}${digits}${".".repeat(dots)}`;
        }
        continue;
      }

      if (lower === "r") {
        i++;
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          out += expandTimedToken(ch, { length: n, dots }, { rest: true });
        } else if (!digits && legacyDefault) {
          out += expandTimedToken(ch, combineDefaultSpec(dots), { rest: true });
        } else {
          out += `${ch}${digits}${".".repeat(dots)}`;
        }
        continue;
      }

      if (lower === "n") {
        i++;
        const noteNumber = readDigits();
        const dots = readDots();
        const head = `n${noteNumber}`;
        if (legacyDefault && noteNumber) {
          out += expandTimedToken(head, combineDefaultSpec(dots), { needsLengthCommand: true, rest: Number(noteNumber) === 0 });
        } else {
          out += `${head}${".".repeat(dots)}`;
        }
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  function looksLikeMmlPart(value) {
    const s = String(value || "").trim();
    if (!s) return false;
    if (/[^cdefgabronltv<>+#\-&.0-9\s]/i.test(s)) return false;
    if (!/[cdefgabronrltv<>]/i.test(s)) return false;
    const normalized = normalizeMmiLegacyLengthsInPart(s);
    try {
      const parsed = parseMabinogiMml(composeMml([normalized], { preserveEmpty: true, partCount: 1 }));
      const part = parsed.parts?.[0];
      return Boolean(part && (part.notes.length || part.tempos.length || /[rR]/.test(normalized)));
    } catch (_) {
      return false;
    }
  }

  function pushMmiPart(list, value, index = 0, name = "") {
    const cleaned = cleanupMmiMmlValue(value);
    if (!cleaned) return;
    list.push({ value: cleaned, index, name: cleanupMmiNameValue(name) });
  }


  function openMidiConvertDialog(importData) {
    pendingMidiImport = importData;
    const overview = importData.overview;
    const groups = overview.instrumentGroups || overview.channels || [];
    if (!groups.length) {
      pendingMidiImport = null;
      throw new Error("변환할 수 있는 MIDI 악기 그룹을 찾지 못했습니다.");
    }

    const normalGroups = groups.filter(g => !g.isBeat);
    const beatGroups = groups.filter(g => g.isBeat);
    pendingMidiSettings = createDefaultMidiSettings(groups, Boolean(overview.hasBeatGroups));

    if (midiConvertSummary) {
      const trackCount = Number(overview.trackCount) || 0;
      midiConvertSummary.textContent = `${importData.name || "MIDI"} · 트랙 ${formatCount(trackCount)}개 · 변환 후보 채널 ${formatCount(groups.length)}개 · 노트 ${formatCount(overview.noteCount)}개 · 일반 ${formatCount(normalGroups.length)}개 / 비트 ${formatCount(beatGroups.length)}개 · PPQ ${overview.ppq}`;
    }
    if (midiBeatNotice) {
      midiBeatNotice.hidden = beatGroups.length > 0;
      midiBeatNotice.textContent = beatGroups.length ? "" : "이 MIDI에는 비트 그룹 악기가 없습니다.";
    }
    setMidiConvertBusy(false);
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();

    if (midiConvertDialog?.showModal) {
      midiConvertDialog.showModal();
      scheduleMidiInstrumentListHeightSync();
    } else {
      // 오래된 브라우저에서는 기본값으로 바로 변환한다.
      applyMidiConvertDialog();
    }
  }

  function createDefaultMidiSettings(groups, hasBeatGroups) {
    const allGroups = Array.isArray(groups) ? groups : [];
    const normalIds = allGroups.filter(g => !g.isBeat).map(g => g.id);
    const beatIds = allGroups.filter(g => g.isBeat).map(g => g.id);
    const channelSettings = Array.from({ length: 6 }, (_, i) => {
      const role = i === 0 ? "high" : (i === 2 ? "low" : "auto");
      const overlapMergeMode = (i === 0 || i === 2) ? "half" : "all";
      return {
        role,
        overlapMerge: overlapMergeMode !== "none",
        overlapMergeMode,
        selectedInstrumentGroups: new Set(i >= 3 ? [] : (role === "beat" ? beatIds : normalIds))
      };
    });
    return {
      groups: allGroups,
      normalIds,
      beatIds,
      hasBeatGroups: Boolean(hasBeatGroups && beatIds.length),
      activeIndex: 0,
      partCount: 3,
      channels: channelSettings
    };
  }

  function getActiveMidiChannelSetting() {
    if (!pendingMidiSettings) return null;
    pendingMidiSettings.activeIndex = clampInt(Number(pendingMidiSettings.activeIndex || 0), 0, 5);
    return pendingMidiSettings.channels[pendingMidiSettings.activeIndex] || null;
  }

  function renderMidiRoleList() {
    if (!midiRoleList || !pendingMidiSettings) return;
    midiRoleList.innerHTML = "";
    const allowBeat = pendingMidiSettings.hasBeatGroups;
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      const row = document.createElement("div");
      row.className = `midi-role-row midi-export-channel part-${i}`;
      row.dataset.channelIndex = String(i);
      const selectOptions = [
        `<option value="auto" ${setting.role === "auto" ? "selected" : ""}>자동</option>`,
        `<option value="high" ${setting.role === "high" ? "selected" : ""}>고음</option>`,
        `<option value="low" ${setting.role === "low" ? "selected" : ""}>저음</option>`,
        allowBeat ? `<option value="beat" ${setting.role === "beat" ? "selected" : ""}>비트</option>` : ""
      ].join("");
      const mergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      setting.overlapMergeMode = mergeMode;
      setting.overlapMerge = mergeMode !== "none";
      const mergeOptions = OVERLAP_MERGE_OPTIONS.map(opt =>
        `<option value="${opt.value}" ${mergeMode === opt.value ? "selected" : ""}>${opt.label}</option>`
      ).join("");
      row.innerHTML = `
        <button class="midi-channel-select" type="button" data-midi-channel-select="${i}" aria-label="${PART_LABELS[i]} 악기 선택">
          <span class="midi-export-label">${PART_LABELS[i]}</span>
          <span class="midi-export-summary">${escapeHtml(summarizeMidiChannelInstruments(i))}</span>
        </button>
        <select data-role-index="${i}" aria-label="${PART_LABELS[i]} 역할">
          ${selectOptions}
        </select>
        <label class="merge-mode">
          <span>겹침</span>
          <select data-merge-index="${i}" aria-label="${PART_LABELS[i]} 겹침 병합 방식">
            ${mergeOptions}
          </select>
          <span>병합</span>
        </label>
        <button class="midi-role-preview-btn" type="button" data-midi-part-preview="${i}" aria-label="${PART_LABELS[i]} 미리 듣기">듣기</button>
      `;
      row.querySelector("button")?.addEventListener("click", () => {
        pendingMidiSettings.activeIndex = i;
        renderMidiRoleList();
        renderActiveMidiInstrumentList();
        updateMidiRoleControls();
      });
      row.querySelector("[data-role-index]")?.addEventListener("change", (ev) => {
        const role = String(ev.target.value || "auto");
        updateMidiChannelRole(i, role);
      });
      row.querySelector("[data-midi-part-preview]")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMidiExportChannel(i, ev.currentTarget);
      });
      row.querySelector("[data-merge-index]")?.addEventListener("change", (ev) => {
        const mode = normalizeOverlapMergeMode(ev.target.value);
        pendingMidiSettings.channels[i].overlapMergeMode = mode;
        pendingMidiSettings.channels[i].overlapMerge = mode !== "none";
      });
      midiRoleList.appendChild(row);
    }
    scheduleMidiInstrumentListHeightSync();
  }

  function syncMidiInstrumentListHeight() {
    if (!midiRoleList || !midiChannelList) return;
    const resetHeight = () => {
      midiChannelList.style.height = "";
      midiChannelList.style.minHeight = "";
      midiChannelList.style.maxHeight = "";
    };
    if (window.matchMedia?.("(max-width: 980px)")?.matches) {
      resetHeight();
      return;
    }

    const leftPanel = midiRoleList.closest(".midi-left-panel");
    const rightPanel = midiChannelList.closest(".midi-right-panel");
    const rightHead = rightPanel?.querySelector(".dialog-section-head");
    const rightActions = rightPanel?.querySelector(".midi-instrument-panel-actions");
    if (!leftPanel || !rightPanel || !rightHead) {
      resetHeight();
      return;
    }

    // 오른쪽 악기 목록은 내용이 많아도 Dialog/Grid 높이를 키우지 않도록 먼저 임시로 0px에 가깝게 고정한다.
    // 그 상태에서 왼쪽 전체 파트(Export 콤보 + 안내 + 6개 채널)의 자연 높이를 측정해 오른쪽 하단을 맞춘다.
    const previousHeight = midiChannelList.style.height;
    const previousMinHeight = midiChannelList.style.minHeight;
    const previousMaxHeight = midiChannelList.style.maxHeight;
    midiChannelList.style.height = "1px";
    midiChannelList.style.minHeight = "0px";
    midiChannelList.style.maxHeight = "1px";

    const leftHeight = Math.ceil(leftPanel.getBoundingClientRect().height || 0);
    const headHeight = Math.ceil(rightHead.getBoundingClientRect().height || 0);
    const actionsHeight = Math.ceil(rightActions?.getBoundingClientRect?.().height || 0);
    if (!leftHeight || !headHeight) {
      midiChannelList.style.height = previousHeight;
      midiChannelList.style.minHeight = previousMinHeight;
      midiChannelList.style.maxHeight = previousMaxHeight;
      return;
    }

    const styles = window.getComputedStyle(rightPanel);
    const rowGap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
    const availableHeight = Math.max(160, leftHeight - headHeight - actionsHeight - rowGap * (actionsHeight ? 2 : 1));
    const height = `${Math.ceil(availableHeight)}px`;
    midiChannelList.style.height = height;
    midiChannelList.style.minHeight = height;
    midiChannelList.style.maxHeight = height;
  }

  function scheduleMidiInstrumentListHeightSync() {
    requestAnimationFrame(() => syncMidiInstrumentListHeight());
  }

  function updateMidiChannelRole(index, role) {
    if (!pendingMidiSettings) return;
    const setting = pendingMidiSettings.channels[index];
    const previousIsBeat = setting.role === "beat";
    const previousSelected = Array.from(setting.selectedInstrumentGroups || []);
    const nextRole = role === "beat" && !pendingMidiSettings.hasBeatGroups ? "auto" : role;
    setting.role = nextRole;
    const nextIsBeat = nextRole === "beat";
    if (previousIsBeat !== nextIsBeat) {
      const allowedIds = nextIsBeat ? pendingMidiSettings.beatIds : pendingMidiSettings.normalIds;
      const allowedSet = new Set(allowedIds);
      const kept = previousSelected.filter(id => allowedSet.has(id));
      setting.selectedInstrumentGroups = new Set(kept.length ? kept : (previousSelected.length ? allowedIds : []));
    }
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }

  function summarizeMidiChannelInstruments(index) {
    if (!pendingMidiSettings) return "";
    const setting = pendingMidiSettings.channels[index];
    const allowed = getAllowedMidiGroupsForSetting(setting);
    const selectedCount = allowed.filter(g => setting.selectedInstrumentGroups.has(g.id)).length;
    return `악기 ${formatCount(selectedCount)}개 선택`;
  }

  function normalizeOverlapMergeMode(value) {
    if (value === true || value === "true") return "all";
    if (value === false || value === "false") return "none";
    const mode = String(value || "all").toLowerCase();
    return OVERLAP_MERGE_OPTIONS.some(opt => opt.value === mode) ? mode : "all";
  }

  function getMidiGroupSelectedChannels(groupId) {
    if (!pendingMidiSettings) return [];
    const items = [];
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      if (setting?.selectedInstrumentGroups?.has(groupId)) {
        items.push({ index: i, label: PART_LABELS[i] || `${i + 1}번` });
      }
    }
    return items;
  }

  function renderMidiGroupSelectedChips(groupId) {
    const items = getMidiGroupSelectedChannels(groupId);
    if (!items.length) return '<span class="midi-part-chip empty">-</span>';
    const shortLabel = (item) => item.index === 0 ? "멜" : String(item.index);
    return items.map(item => `<span class="midi-part-chip part-${item.index}" title="${escapeHtml(item.label)}">${escapeHtml(shortLabel(item))}</span>`).join("");
  }

  function getAllowedMidiGroupsForSetting(setting) {
    if (!pendingMidiSettings || !setting) return [];
    const wantBeat = setting.role === "beat";
    return pendingMidiSettings.groups.filter(g => wantBeat ? g.isBeat : !g.isBeat);
  }


  function getMidiInstrumentCategory(group) {
    if (!group || group.isBeat) return "beat";
    const rawProgram = Number(group.program);
    const hasProgram = Number.isFinite(rawProgram);
    const program = hasProgram ? clampInt(rawProgram, 0, 127) : null;
    const name = String(group.instrumentName || group.programText || "").toLowerCase();

    // General MIDI program numbers are handled first so names like "Bassoon" do not get
    // accidentally caught by a broad "bass" string matcher. Bassoon is a woodwind.
    if (hasProgram) {
      if ((program >= 0 && program <= 7) || (program >= 16 && program <= 20) || program === 21 || program === 23) return "keyboard";
      if ((program >= 24 && program <= 46) || (program >= 48 && program <= 51) || (program >= 104 && program <= 107) || program === 110) return "strings";
      if (program === 22 || (program >= 56 && program <= 79) || program === 109 || program === 111) return "winds";
      if ((program >= 8 && program <= 15) || program === 47 || program === 108 || (program >= 112 && program <= 119)) return "percussion";
    }

    if (/(piano|keyboard|organ|harpsichord|clavinet|clavi|accordion)/i.test(name)) return "keyboard";
    if (/(bassoon|trumpet|trombone|tuba|horn|brass|sax|oboe|clarinet|piccolo|flute|recorder|pipe|whistle|ocarina|harmonica|shanai|bagpipe|bag pipe)/i.test(name)) return "winds";
    if (/(guitar|\bbass\b|violin|viola|cello|contrabass|string|harp|sitar|banjo|shamisen|koto|fiddle)/i.test(name)) return "strings";
    if (/(celesta|glockenspiel|music box|vibraphone|marimba|xylophone|bell|dulcimer|kalimba|timpani|agogo|steel drums|woodblock|taiko|tom|drum|cymbal)/i.test(name)) return "percussion";
    return "other";
  }

  function sortMidiInstrumentGroups(groups) {
    return [...(groups || [])].sort((a, b) => {
      const ca = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(a));
      const cb = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(b));
      const oa = ca >= 0 ? ca : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      const ob = cb >= 0 ? cb : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      return oa - ob || String(a.instrumentName || a.programText || "").localeCompare(String(b.instrumentName || b.programText || ""), "ko") || String(a.id).localeCompare(String(b.id));
    });
  }

  function syncMidiInstrumentPanelActions(groups = null) {
    const setting = getActiveMidiChannelSetting();
    const hasGroups = Array.isArray(groups) ? groups.length > 0 : Boolean(setting);
    const isBeat = setting?.role === "beat";
    if (midiInstrumentSelectAll) midiInstrumentSelectAll.disabled = !hasGroups;
    if (midiInstrumentSelectNone) midiInstrumentSelectNone.disabled = !hasGroups;
    for (const button of midiInstrumentCategoryButtons) {
      button.hidden = Boolean(isBeat);
      button.disabled = Boolean(isBeat || !hasGroups);
    }
  }

  function selectActiveMidiInstruments(checked) {
    const setting = getActiveMidiChannelSetting();
    if (!setting) return;
    const groups = getAllowedMidiGroupsForSetting(setting);
    for (const g of groups) {
      if (checked) setting.selectedInstrumentGroups.add(g.id);
      else setting.selectedInstrumentGroups.delete(g.id);
    }
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }

  function selectActiveMidiInstrumentCategory(category) {
    const setting = getActiveMidiChannelSetting();
    if (!setting || setting.role === "beat") return;
    const target = MIDI_INSTRUMENT_CATEGORY_ORDER.includes(category) ? category : "other";
    const groups = getAllowedMidiGroupsForSetting(setting).filter(g => !g.isBeat);
    for (const g of groups) {
      if (getMidiInstrumentCategory(g) === target) setting.selectedInstrumentGroups.add(g.id);
      else setting.selectedInstrumentGroups.delete(g.id);
    }
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }

  function renderActiveMidiInstrumentList() {
    if (!midiChannelList || !pendingMidiSettings) return;
    const activeIndex = pendingMidiSettings.activeIndex;
    const setting = getActiveMidiChannelSetting();
    const groups = getAllowedMidiGroupsForSetting(setting);
    const isBeat = setting?.role === "beat";
    if (midiInstrumentPanelTitle) midiInstrumentPanelTitle.textContent = `${PART_LABELS[activeIndex]} 악기 선택`;
    if (midiInstrumentPanelHint) {
      midiInstrumentPanelHint.textContent = isBeat
        ? "비트 채널은 비트 그룹 악기만 선택할 수 있습니다."
        : "한 채널에 여러 일반 악기를 선택할 수 있습니다.";
    }
    syncMidiInstrumentPanelActions(groups);

    midiChannelList.innerHTML = "";
    if (!groups.length) {
      const section = document.createElement("div");
      section.className = "midi-instrument-section empty";
      section.innerHTML = `
        <div class="midi-instrument-section-head">
          <strong>${isBeat ? "비트 악기" : "일반 악기"}</strong>
          ${isBeat ? `<span>드럼·북·스네어·심벌즈 계열</span>` : ""}
        </div>
      `;
      const empty = document.createElement("div");
      empty.className = "midi-instrument-empty";
      empty.textContent = isBeat ? "선택할 비트 악기가 없습니다." : "선택할 일반 악기가 없습니다.";
      section.appendChild(empty);
      midiChannelList.appendChild(section);
      scheduleMidiInstrumentListHeightSync();
      return;
    }

    const makeRow = (group) => {
      const id = `midi-instrument-${activeIndex}-${cssSafeId(group.id)}`;
      const row = document.createElement("div");
      row.className = `midi-channel-row midi-instrument-row${group.isBeat ? " percussion" : ""}`;
      row.innerHTML = `
        <input type="checkbox" value="${escapeHtml(group.id)}" ${setting.selectedInstrumentGroups.has(group.id) ? "checked" : ""} />
        <label class="midi-channel-main" for="${escapeHtml(id)}">
          <strong>${escapeHtml(group.instrumentName || group.programText || "악기 정보 없음")}</strong>
        </label>
        <div class="midi-instrument-selected-parts" aria-label="선택된 MML 채널">${renderMidiGroupSelectedChips(group.id)}</div>
        <button class="midi-preview-btn" type="button" data-midi-preview="${escapeHtml(group.id)}">듣기</button>
        <span class="midi-channel-sub">
          노트 ${formatCount(group.noteCount)}개 · ${escapeHtml(group.rangeText || "노트 없음")}
          ${group.duplicateMerged ? `<em>64분음표 기준 완전 중복 ${formatCount(group.duplicateMerged)}개 병합 예정</em>` : ""}
          ${group.isBeat ? `<em>비트 그룹</em>` : ""}
        </span>
      `;
      const input = row.querySelector("input");
      if (input) {
        input.id = id;
        input.addEventListener("change", () => {
          if (input.checked) setting.selectedInstrumentGroups.add(group.id);
          else setting.selectedInstrumentGroups.delete(group.id);
          renderMidiRoleList();
          updateMidiRoleControls();
        });
      }
      row.querySelector("[data-midi-preview]")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMidiInstrument(group.id, ev.currentTarget);
      });
      return row;
    };

    if (isBeat) {
      const section = document.createElement("details");
      section.open = true;
      section.className = "midi-instrument-section";
      section.innerHTML = `
        <summary class="midi-instrument-section-head">
          <strong>비트 악기 ${formatCount(groups.length)}개</strong>
          <span>한 음색만 내는 드럼·북·스네어·심벌즈 계열</span>
        </summary>
      `;
      for (const group of groups) section.appendChild(makeRow(group));
      midiChannelList.appendChild(section);
    } else {
      const grouped = new Map(MIDI_INSTRUMENT_CATEGORY_ORDER.map(key => [key, []]));
      for (const group of sortMidiInstrumentGroups(groups)) {
        const key = getMidiInstrumentCategory(group);
        if (!grouped.has(key)) grouped.set("other", []);
        grouped.get(grouped.has(key) ? key : "other").push(group);
      }
      for (const key of MIDI_INSTRUMENT_CATEGORY_ORDER) {
        const items = grouped.get(key) || [];
        if (!items.length) continue;
        const label = MIDI_INSTRUMENT_CATEGORY_LABELS[key] || "나머지";
        const section = document.createElement("details");
        section.open = true;
        section.className = `midi-instrument-section midi-instrument-category-section category-${key}`;
        section.innerHTML = `
          <summary class="midi-instrument-section-head">
            <strong>${escapeHtml(label)} ${formatCount(items.length)}개</strong>
          </summary>
        `;
        for (const group of items) section.appendChild(makeRow(group));
        midiChannelList.appendChild(section);
      }
    }
    scheduleMidiInstrumentListHeightSync();
  }

  function collectMidiConvertOptionsForSingleChannel(index) {
    if (!pendingMidiSettings) throw new Error("MIDI 변환 설정을 찾지 못했습니다.");
    const sourceIndex = clampInt(Number(index), 0, 5);
    const setting = pendingMidiSettings.channels[sourceIndex];
    const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
    const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
    if (!selected.length) throw new Error(`${PART_LABELS[sourceIndex]} 채널에 포함할 악기를 하나 이상 선택해 주세요.`);
    const overlapMergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
    return {
      partCount: 1,
      roles: [setting.role || "auto"],
      sourcePartIndex: sourceIndex,
      exportChannels: [{
        sourcePartIndex: sourceIndex,
        role: setting.role || "auto",
        overlapMergeMode,
        overlapMerge: overlapMergeMode !== "none",
        selectedInstrumentGroups: selected
      }]
    };
  }

  async function toggleMidiSelectedPreview() {
    if (!pendingMidiImport) return;
    if (midiSelectedPreviewActive) {
      stopMidiPreview();
      return;
    }

    let options;
    try {
      options = collectMidiConvertOptions();
    } catch (err) {
      showDialog("미리 듣기 실패", shortError(err));
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiSelectedPreviewState(true);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = "현재 설정으로 MML 미리듣기를 준비 중입니다.";
        midiConvertStatus.hidden = false;
      }
      trackAnalytics("preview_midi_selected", { export_channels: Number(options.partCount || 0) });
      await loadDefaultSf2IfNeeded();
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const normalized = normalizeImportedFullMml(result.mml);
      const parsed = parseMabinogiMml(normalized.mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error("선택한 설정으로 재생할 음표가 없습니다.");
      if (!soundFont?.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");
      const ctx = await ensureAudioContext();
      const presetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const prepared = prepareNotesWithPresetKeys(ctx, notes, presetKeys, { respectMute: false });
      if (!prepared.length) throw new Error("소리 나는 음표가 없습니다. 선택한 음색에서 맞는 음역을 찾지 못했습니다.");
      const windowEnd = Math.min(duration, 45);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd });
      const scheduleResult = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: Math.max(0.5, windowEnd + 0.05),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012,
        gainScale
      });
      if (midiConvertStatus) {
        midiConvertStatus.textContent = "미리 듣기 중...";
        midiConvertStatus.hidden = false;
      }
      const stopMs = Math.max(800, Math.min(60000, (scheduleResult.maxEnd - ctx.currentTime + 0.35) * 1000));
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        if (midiConvertStatus) midiConvertStatus.hidden = true;
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      if (midiConvertStatus) midiConvertStatus.hidden = true;
      showDialog("미리 듣기 실패", shortError(err));
    }
  }

  async function previewMidiExportChannel(index, triggerButton = null) {
    if (!pendingMidiImport) return;
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    if (button && midiChannelPreviewButton === button) {
      stopMidiPreview();
      return;
    }

    let options;
    const sourceIndex = clampInt(Number(index), 0, 5);
    try {
      options = collectMidiConvertOptionsForSingleChannel(sourceIndex);
    } catch (err) {
      showDialog("채널 미리 듣기 실패", shortError(err));
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiChannelPreviewButton(button);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = `${PART_LABELS[sourceIndex]} 미리 듣기를 준비 중입니다.`;
        midiConvertStatus.hidden = false;
      }
      trackAnalytics("preview_midi_export_channel", { channel_index: sourceIndex + 1 });
      await loadDefaultSf2IfNeeded();
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const normalized = normalizeImportedFullMml(result.mml);
      const parsed = parseMabinogiMml(normalized.mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error("선택한 채널 설정으로 재생할 음표가 없습니다.");
      if (!soundFont?.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");
      const ctx = await ensureAudioContext();
      const presetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const prepared = prepareNotesWithPresetKeys(ctx, notes, presetKeys, { respectMute: false });
      if (!prepared.length) throw new Error("소리 나는 음표가 없습니다. 선택한 음색에서 맞는 음역을 찾지 못했습니다.");
      const windowEnd = Math.min(duration, 30);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd });
      const scheduleResult = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: Math.max(0.5, windowEnd + 0.05),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012,
        gainScale
      });
      if (midiConvertStatus) {
        midiConvertStatus.textContent = `${PART_LABELS[sourceIndex]} 미리 듣기 중...`;
        midiConvertStatus.hidden = false;
      }
      const stopMs = Math.max(800, Math.min(45000, (scheduleResult.maxEnd - ctx.currentTime + 0.35) * 1000));
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        if (midiConvertStatus) midiConvertStatus.hidden = true;
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      if (midiConvertStatus) midiConvertStatus.hidden = true;
      showDialog("채널 미리 듣기 실패", shortError(err));
    }
  }

  async function toggleMidiFullPreview() {
    if (!pendingMidiImport) return;
    if (midiFullPreviewActive) {
      stopMidiPreview();
      return;
    }
    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiFullPreviewState(true);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = "MIDI 미리듣기를 준비 중입니다.";
        midiConvertStatus.hidden = false;
      }
      trackAnalytics("preview_midi_file");
      await loadDefaultSf2IfNeeded();
      const preview = buildMidiFilePreview(pendingMidiImport.bytes, { maxSeconds: 45, tailSeconds: 1.0 });
      const ctx = await ensureAudioContext();
      const prepared = [];
      const byPreset = new Map();
      for (const note of preview.notes) {
        const preset = findPreviewPreset(note);
        if (!preset) continue;
        const key = `${preset.bank}:${preset.preset}:${note.isBeat ? 1 : 0}`;
        if (!byPreset.has(key)) byPreset.set(key, { preset, notes: [] });
        byPreset.get(key).notes.push(note);
      }
      for (const item of byPreset.values()) {
        prepared.push(...prepareNotes(ctx, soundFont, item.preset, item.notes));
      }
      prepared.sort((a, b) => a.start - b.start || a.midi - b.midi || a.id - b.id);
      if (!prepared.length) throw new Error("MIDI 미리듣기에 사용할 소리를 찾지 못했습니다.");
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: preview.duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, preview.duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: null,
        minLeadTime: 0.01,
        gainScale
      });
      if (midiConvertStatus) {
        midiConvertStatus.textContent = "MIDI 미리듣기 중...";
        midiConvertStatus.hidden = false;
      }
      const stopMs = Math.max(800, Math.min(60000, (result.maxEnd - ctx.currentTime + 0.3) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      stopMidiPreview();
      if (midiConvertStatus) midiConvertStatus.hidden = true;
      showDialog("MIDI 미리듣기 실패", shortError(err));
    }
  }

  function setMidiFullPreviewState(active) {
    midiFullPreviewActive = Boolean(active);
    if (midiFullPreviewBtn) {
      midiFullPreviewBtn.textContent = midiFullPreviewActive ? "정지" : "MIDI 듣기";
      midiFullPreviewBtn.classList.toggle("danger", midiFullPreviewActive);
      midiFullPreviewBtn.setAttribute("aria-pressed", midiFullPreviewActive ? "true" : "false");
    }
  }

  function setMidiSelectedPreviewState(active) {
    midiSelectedPreviewActive = Boolean(active);
    if (midiSelectedPreviewBtn) {
      midiSelectedPreviewBtn.textContent = midiSelectedPreviewActive ? "정지" : "미리 듣기";
      midiSelectedPreviewBtn.classList.toggle("danger", midiSelectedPreviewActive);
      midiSelectedPreviewBtn.setAttribute("aria-pressed", midiSelectedPreviewActive ? "true" : "false");
    }
  }

  async function previewMidiInstrument(groupId, triggerButton = null) {
    if (!pendingMidiImport) return;
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalText = button?.textContent || "듣기";
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) {
        button.disabled = true;
        button.textContent = "재생중";
      }
      trackAnalytics("preview_midi_instrument");
      await loadDefaultSf2IfNeeded();
      const preview = buildMidiInstrumentPreview(pendingMidiImport.bytes, groupId, { maxSeconds: 8, tailSeconds: 0.75 });
      const ctx = await ensureAudioContext();
      const preset = findPreviewPreset(preview);
      if (!preset) throw new Error("미리듣기에 사용할 SF2 프리셋을 찾지 못했습니다.");
      const prepared = prepareNotes(ctx, soundFont, preset, preview.notes);
      if (!prepared.length) throw new Error("SF2에서 미리듣기 할 소리를 찾지 못했습니다.");
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: preview.duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, preview.duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01,
        gainScale
      });
      const stopMs = Math.max(600, Math.min(12000, (result.maxEnd - ctx.currentTime + 0.25) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      showDialog("악기 미리듣기 실패", shortError(err));
    } finally {
      if (button) {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 350);
      }
    }
  }

  function findPreviewPreset(preview) {
    if (!soundFont) return null;
    const program = clampInt(Number(preview?.program ?? 0), 0, 127);
    if (preview?.isBeat) {
      return soundFont.presets.find(p => p.bank === 128 && p.preset === 0)
        || soundFont.presets.find(p => p.bank === 128)
        || soundFont.findPreset(program)
        || soundFont.findPreset(0)
        || soundFont.presets[0];
    }
    return soundFont.findPreset(program) || soundFont.findPreset(0) || soundFont.presets[0];
  }

  function stopMidiPreview() {
    if (midiPreviewTimer) {
      clearTimeout(midiPreviewTimer);
      midiPreviewTimer = 0;
    }
    for (const item of midiPreviewSources) {
      try { item.gain?.gain?.cancelScheduledValues(audioCtx?.currentTime || 0); } catch {}
      try { item.source?.stop(); } catch {}
      try { item.source?.disconnect(); } catch {}
      try { item.gain?.disconnect(); } catch {}
    }
    midiPreviewSources = [];
    if ((midiFullPreviewActive || midiSelectedPreviewActive || midiChannelPreviewButton) && midiConvertStatus) midiConvertStatus.hidden = true;
    setMidiFullPreviewState(false);
    setMidiSelectedPreviewState(false);
    resetMidiChannelPreviewButton();
    resetSplitPreviewButton();
  }

  function resetMidiChannelPreviewButton() {
    if (!midiChannelPreviewButton) return;
    try {
      midiChannelPreviewButton.textContent = midiChannelPreviewButtonText || "듣기";
      midiChannelPreviewButton.classList.remove("danger");
      midiChannelPreviewButton.setAttribute("aria-pressed", "false");
      midiChannelPreviewButton.disabled = false;
    } catch (_) {}
    midiChannelPreviewButton = null;
    midiChannelPreviewButtonText = "";
  }

  function setMidiChannelPreviewButton(button) {
    if (!(button instanceof HTMLElement)) return;
    midiChannelPreviewButton = button;
    midiChannelPreviewButtonText = button.textContent || "듣기";
    button.textContent = "정지";
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
  }

  function resetSplitPreviewButton() {
    if (!splitPreviewButton) return;
    try {
      splitPreviewButton.textContent = splitPreviewButtonText || "듣기";
      splitPreviewButton.classList.remove("danger");
      splitPreviewButton.setAttribute("aria-pressed", "false");
      splitPreviewButton.disabled = false;
    } catch (_) {}
    splitPreviewButton = null;
    splitPreviewButtonText = "";
  }

  function setSplitPreviewButton(button) {
    if (!(button instanceof HTMLElement)) return;
    splitPreviewButton = button;
    splitPreviewButtonText = button.textContent || "듣기";
    button.textContent = "정지";
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
  }

  function cssSafeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function updateMidiRoleControls() {
    if (!pendingMidiSettings) return;
    pendingMidiSettings.activeIndex = clampInt(Number(pendingMidiSettings.activeIndex || 0), 0, 5);
    pendingMidiSettings.partCount = countActiveMidiExportChannels();
    const rows = Array.from(midiRoleList?.querySelectorAll(".midi-role-row") || []);
    rows.forEach((row, i) => {
      const active = i === pendingMidiSettings.activeIndex;
      row.classList.remove("disabled");
      row.classList.toggle("active", active);
      row.querySelectorAll("button, select, input").forEach(control => { control.disabled = false; });
    });
    renderActiveMidiInstrumentList();
  }

  function buildMidiPartSoundPreset(exportChannels, groups, partCount = 6) {
    const keys = defaultPartPresetKeys();
    const groupMap = new Map((groups || []).map(g => [String(g.id), g]));
    const count = clampInt(Number(partCount) || 6, 1, 6);
    for (let i = 0; i < count; i++) {
      const channel = exportChannels?.[i];
      const selected = Array.isArray(channel?.selectedInstrumentGroups)
        ? channel.selectedInstrumentGroups.map(id => groupMap.get(String(id))).filter(Boolean)
        : [];
      if (!selected.length) continue;
      selected.sort((a, b) => (Number(b.noteCount) || 0) - (Number(a.noteCount) || 0) || String(a.instrumentName || "").localeCompare(String(b.instrumentName || ""), "ko"));
      keys[i] = midiGroupToPresetKey(selected[0]);
    }
    return normalizePresetKeyArray(keys);
  }

  function midiGroupToPresetKey(group) {
    if (!group) return DEFAULT_PART_PRESET_KEY;
    if (group.isBeat || group.isPercussion) return "128:0";
    const program = clampInt(Number(group.program ?? group.preset ?? 0), 0, 127);
    return `0:${program}`;
  }

  function rememberMidiPartSoundPreset(keys) {
    const selectedQuickMode = soundPresetQuickSelect?.value || soundPresetMatch(partPresetKeys);
    const shouldApplyToCurrentSound = selectedQuickMode === "auto";
    midiPartPresetKeys = normalizePresetKeyArray(keys);
    midiPartPresetName = DEFAULT_MIDI_SOUND_PRESET_LABEL;
    saveMidiPartSoundPresetPrefs();

    if (shouldApplyToCurrentSound) {
      partPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
      savePartSoundPrefs();
      updateSoundPresetControls(null, "auto");
      return true;
    }

    const preferredQuickMode = userSoundPresetIdFromValue(selectedQuickMode) ? selectedQuickMode : null;
    updateSoundPresetControls(null, preferredQuickMode);
    return false;
  }

  function getMidiExportChannelConfigs() {
    if (!pendingMidiSettings) return [];
    const exportChannels = [];
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
      const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
      if (!selected.length) continue;
      const overlapMergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      exportChannels.push({
        sourcePartIndex: i,
        role: setting.role || "auto",
        overlapMergeMode,
        overlapMerge: overlapMergeMode !== "none",
        selectedInstrumentGroups: selected
      });
    }
    return exportChannels;
  }

  function countActiveMidiExportChannels() {
    return getMidiExportChannelConfigs().length;
  }

  function collectMidiConvertOptions() {
    if (!pendingMidiSettings) throw new Error("MIDI 변환 설정을 찾지 못했습니다.");
    const exportChannels = getMidiExportChannelConfigs();
    if (!exportChannels.length) throw new Error("MML에 포함할 악기를 하나 이상 선택해 주세요.");
    const partCount = exportChannels.length;
    return {
      partCount,
      roles: exportChannels.map(ch => ch.role),
      exportChannels
    };
  }

  async function applyMidiConvertDialog() {
    if (!pendingMidiImport || midiConvertBusy) return;

    let options;
    try {
      options = collectMidiConvertOptions();
    } catch (err) {
      showDialog("MIDI 변환 실패", shortError(err));
      return;
    }

    stopMidiPreview();
    setMidiConvertBusy(true, "MIDI를 MML로 변환 중입니다. 잠시만 기다려 주세요.");
    await waitForBrowserPaint();

    try {
      stopPlayback(false);
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const midiSoundPresetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const normalized = normalizeImportedFullMml(result.mml);
      setMainMml(normalized.mml);
      rememberSuggestedMmlSaveFileName(pendingMidiImport.name);
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      const autoSoundApplied = rememberMidiPartSoundPreset(midiSoundPresetKeys);
      const midiGroupCount = Number(pendingMidiSettings?.groups?.length || 0);
      midiConvertDialog?.close();
      setMidiConvertBusy(false);
      pendingMidiImport = null;
      pendingMidiSettings = null;
      const saved = Math.max(0, Number(normalized.saved) || 0);
      trackAnalytics("midi_convert_complete", {
        export_channels: Number(options.partCount || 0),
        instrument_groups: midiGroupCount,
        optimized_chars: saved
      });
      showDialog(
        "MIDI 변환 완료",
        result.message +
          (saved ? `\n\n최적화 절약: ${formatCount(saved)} 자` : "") +
          (autoSoundApplied
            ? "\n\nMIDI 악기 구성을 자동 음색으로 갱신하고 현재 재생 음색에 적용했습니다."
            : "\n\nMIDI 악기 구성을 자동 음색 정보로 갱신했습니다. 현재 선택한 음색 설정은 유지했습니다.")
      );
    } catch (err) {
      setMidiConvertBusy(false);
      showDialog("MIDI 변환 실패", shortError(err));
    }
  }

  function setMidiConvertBusy(busy, message = "") {
    midiConvertBusy = Boolean(busy);
    if (midiConvertStatus) {
      midiConvertStatus.textContent = message || "";
      midiConvertStatus.hidden = !message;
    }
    const controls = midiConvertDialog ? Array.from(midiConvertDialog.querySelectorAll("button, input, select")) : [];
    for (const control of controls) {
      if (busy) {
        if (!control.dataset.prevMidiBusyDisabled) {
          control.dataset.prevMidiBusyDisabled = control.disabled ? "1" : "0";
        }
        control.disabled = true;
      } else if (control.dataset.prevMidiBusyDisabled) {
        control.disabled = control.dataset.prevMidiBusyDisabled === "1";
        delete control.dataset.prevMidiBusyDisabled;
      }
    }
    if (midiConvertApply) {
      midiConvertApply.textContent = busy ? "변환 중..." : "변환";
      if (busy) midiConvertApply.disabled = true;
    }
  }

  function waitForBrowserPaint() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame !== "function") {
        setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function loadUserSf2() {
    const file = sf2File.files?.[0];
    if (!file) return useDefaultSound();
    try {
      stopPlayback(false);
      soundName.textContent = "SF2 읽는 중...";
      const bytes = new Uint8Array(await file.arrayBuffer());
      soundFont = await parseSoundFont(bytes);
      sf2Name = file.name;
      resetSoundActionMenu();
      soundName.textContent = file.name;
    } catch (err) {
      soundFont = null;
      resetSoundActionMenu();
      soundName.textContent = "기본 사운드";
      sf2File.value = "";
      showDialog("SF2 불러오기 실패", shortError(err));
    }
  }

  async function loadDefaultSf2IfNeeded() {
    if (soundFont && sf2Name !== "기본 사운드") return;
    if (soundFont && sf2Name === "기본 사운드") return;
    const bytes = await readDefaultSf2Bytes();
    soundFont = await parseSoundFont(bytes);
    sf2Name = "기본 사운드";
    soundName.textContent = "기본 사운드";
  }

  async function readDefaultSf2Bytes() {
    if (location.protocol !== "file:") {
      try {
        const res = await fetch(DEFAULT_SF2_URL);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      } catch (_) {}
    }
    const b64 = DEFAULT_SF2_EMBEDDED_B64();
    if (!b64) throw new Error("기본 SF2를 읽지 못했습니다. assets 폴더와 default-sf2-base64.js 파일을 확인해 주세요.");
    return base64ToUint8Array(b64);
  }

  async function openPartSoundDialog() {
    try {
      stopPlayback(false);
      stopMidiPreview();
      await loadDefaultSf2IfNeeded();
      draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
      draftSoundPresetBaseId = userSoundPresetIdFromValue(soundPresetQuickSelect?.value) || findUserSoundPresetIdByKeys(draftPartPresetKeys);
      renderPartSoundRows();
      updateSoundPresetControls();
      if (partSoundDialog?.showModal) partSoundDialog.showModal();
      else showDialog("채널 음색 설정", "이 브라우저에서는 설정 창을 열 수 없습니다.");
    } catch (err) {
      showDialog("채널 음색 설정 실패", shortError(err));
    }
  }

  async function previewPartPreset(key, partIndex = 0, triggerButton = null) {
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalText = button?.textContent || "듣기";
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) {
        button.disabled = true;
        button.textContent = "재생중";
      }
      await loadDefaultSf2IfNeeded();
      const preset = findPresetByKey(key);
      if (!preset) throw new Error("선택한 SF2 프리셋을 찾지 못했습니다.");
      const ctx = await ensureAudioContext();
      const notes = buildPartPresetPreviewNotes(preset, partIndex);
      const prepared = prepareNotes(ctx, soundFont, preset, notes);
      if (!prepared.length) throw new Error("SF2에서 미리듣기 할 소리를 찾지 못했습니다.");
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01,
        gainScale
      });
      const stopMs = Math.max(650, Math.min(6000, (result.maxEnd - ctx.currentTime + 0.25) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      showDialog("음색 미리듣기 실패", shortError(err));
    } finally {
      if (button) {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 350);
      }
    }
  }

  function buildPartPresetPreviewNotes(preset, partIndex = 0) {
    const part = clampInt(Number(partIndex) || 0, 0, 5);
    if (Number(preset?.bank) === 128) {
      return PART_PREVIEW_DRUM_NOTES.map((midi, i) => ({
        id: i,
        part,
        start: i * 0.18,
        durationSec: midi === 46 ? 0.2 : 0.13,
        midi,
        volume: midi === 42 ? 10 : 13
      }));
    }

    const range = getPresetPlayableRange(preset);
    const base = choosePreviewMelodyBaseMidi(range, PART_PREVIEW_MELODY_INTERVALS);
    let start = 0;
    return PART_PREVIEW_MELODY_INTERVALS.map((interval, i) => {
      const last = i === PART_PREVIEW_MELODY_INTERVALS.length - 1;
      const durationSec = last ? 0.34 : 0.18;
      const note = {
        id: i,
        part,
        start,
        durationSec,
        midi: clampInt(base + interval, range.min, range.max),
        volume: 13
      };
      start += last ? 0.34 : 0.2;
      return note;
    });
  }

  function getPresetPlayableRange(preset) {
    const regions = Array.isArray(preset?.regions) ? preset.regions : [];
    let min = 127;
    let max = 0;
    let found = false;
    for (const region of regions) {
      const keyRange = Array.isArray(region?.keyRange) ? region.keyRange : [0, 127];
      const lo = clampInt(Number(keyRange[0]), 0, 127);
      const hi = clampInt(Number(keyRange[1]), 0, 127);
      if (hi < lo) continue;
      min = Math.min(min, lo);
      max = Math.max(max, hi);
      found = true;
    }
    return found ? { min, max } : { min: 0, max: 127 };
  }

  function choosePreviewMelodyBaseMidi(range, intervals) {
    const min = clampInt(Number(range?.min), 0, 127);
    const max = clampInt(Number(range?.max), min, 127);
    const minInterval = Math.min(...intervals);
    const maxInterval = Math.max(...intervals);
    for (const base of [60, 48, 72, 36, 84, 24, 96]) {
      if (base + minInterval >= min && base + maxInterval <= max) return base;
    }
    const centered = Math.round((min + max - minInterval - maxInterval) / 2);
    return clampInt(centered, Math.max(0, min - minInterval), Math.min(127, max - maxInterval));
  }

  function applyPartSoundDialog() {
    if (!Array.isArray(draftPartPresetKeys)) draftPartPresetKeys = defaultPartPresetKeys();
    partPresetKeys = normalizePresetKeyArray(draftPartPresetKeys);
    savePartSoundPrefs();
    updateSoundPresetControls();
    rebuildSchedulePreviewSilently();
    partSoundDialog?.close();
    restartPlaybackAfterSoundChange();
  }

  function renderPartSoundRows() {
    if (!partSoundRows) return;
    const presets = getPresetOptions();
    partSoundRows.innerHTML = "";
    if (!presets.length) {
      const empty = document.createElement("div");
      empty.className = "part-sound-empty";
      empty.textContent = "현재 SF2에서 선택 가능한 프리셋을 찾지 못했습니다.";
      partSoundRows.appendChild(empty);
      return;
    }

    for (let i = 0; i < 6; i++) {
      const row = document.createElement("div");
      row.className = `part-sound-row part-${i}`;
      const label = document.createElement("label");
      label.className = "part-sound-label";
      label.htmlFor = `partSoundSelect${i}`;
      label.textContent = PART_LABELS[i] || `${i + 1}번`;

      const select = document.createElement("select");
      select.id = `partSoundSelect${i}`;
      select.dataset.partPresetIndex = String(i);
      select.setAttribute("aria-label", `${PART_LABELS[i]} 음색`);
      const current = sanitizePresetKey(draftPartPresetKeys?.[i] || DEFAULT_PART_PRESET_KEY);
      const availableKeys = new Set(presets.map(p => p.key));
      const selectedKey = availableKeys.has(current) ? current : (availableKeys.has(DEFAULT_PART_PRESET_KEY) ? DEFAULT_PART_PRESET_KEY : presets[0].key);
      if (draftPartPresetKeys) draftPartPresetKeys[i] = selectedKey;
      for (const preset of presets) {
        const option = document.createElement("option");
        option.value = preset.key;
        option.textContent = preset.label;
        option.selected = preset.key === selectedKey;
        select.appendChild(option);
      }
      const previewButton = document.createElement("button");
      previewButton.className = "part-sound-preview-btn";
      previewButton.type = "button";
      previewButton.textContent = "듣기";
      previewButton.setAttribute("aria-label", `${PART_LABELS[i]} 선택 음색 듣기`);
      previewButton.addEventListener("click", (ev) => {
        ev.preventDefault();
        void previewPartPreset(select.value, i, previewButton);
      });

      select.addEventListener("change", () => {
        if (!draftPartPresetKeys) draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
        draftPartPresetKeys[i] = sanitizePresetKey(select.value);
        updateSoundPresetControls();
        void previewPartPreset(select.value, i, previewButton);
      });

      const control = document.createElement("div");
      control.className = "part-sound-control";
      control.appendChild(select);
      control.appendChild(previewButton);

      row.appendChild(label);
      row.appendChild(control);
      partSoundRows.appendChild(row);
    }
  }

  function sanitizePresetKey(value) {
    const text = String(value == null ? DEFAULT_PART_PRESET_KEY : value).trim();
    const m = text.match(/^(\d{1,5}):(\d{1,5})$/);
    if (!m) return DEFAULT_PART_PRESET_KEY;
    const bank = clampInt(Number(m[1]), 0, 16383);
    const preset = clampInt(Number(m[2]), 0, 127);
    return `${bank}:${preset}`;
  }

  function presetKey(preset) {
    return `${clampInt(Number(preset?.bank ?? 0), 0, 16383)}:${clampInt(Number(preset?.preset ?? 0), 0, 127)}`;
  }

  function getPresetOptions() {
    if (!soundFont || !Array.isArray(soundFont.presets)) return [];
    const seen = new Set();
    return soundFont.presets
      .filter(p => p && Array.isArray(p.regions) && p.regions.length)
      .slice()
      .sort((a, b) => (a.bank - b.bank) || (a.preset - b.preset) || String(a.name || "").localeCompare(String(b.name || "")))
      .filter(p => {
        const key = presetKey(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(p => ({ key: presetKey(p), label: formatPresetLabel(p) }));
  }

  function formatPresetLabel(preset) {
    const bank = clampInt(Number(preset?.bank ?? 0), 0, 16383);
    const program = clampInt(Number(preset?.preset ?? 0), 0, 127);
    const name = String(preset?.name || "이름 없는 프리셋").trim();
    const num = String(program + 1).padStart(3, "0");
    return bank === 0 ? `${num} ${name}` : `Bank ${bank} · ${num} ${name}`;
  }

  function findPresetByKey(key) {
    if (!soundFont) return null;
    const [bankText, presetText] = sanitizePresetKey(key).split(":");
    const bank = Number(bankText);
    const program = Number(presetText);
    return soundFont.presets.find(p => p.bank === bank && p.preset === program)
      || (bank === 0 ? soundFont.findPreset(program) : null)
      || null;
  }

  function getPartPreset(partIndex) {
    const key = partPresetKeys[clampInt(Number(partIndex), 0, 5)] || DEFAULT_PART_PRESET_KEY;
    return findPresetByKey(key) || soundFont?.findPreset(0) || soundFont?.presets?.[0] || null;
  }

  function getPresetByKeyOrDefault(key) {
    return findPresetByKey(key) || soundFont?.findPreset(0) || soundFont?.presets?.[0] || null;
  }

  function prepareNotesWithPresetKeys(ctx, notes, presetKeys, options = {}) {
    const keys = normalizePresetKeyArray(presetKeys);
    const prepared = [];
    const list = Array.isArray(notes) ? notes : [];
    const respectMute = Boolean(options.respectMute);
    for (let part = 0; part < 6; part++) {
      if (respectMute && partMuteStates[part]) continue;
      const partNotes = list.filter(n => Number(n.part) === part);
      if (!partNotes.length) continue;
      const preset = getPresetByKeyOrDefault(keys[part]);
      if (!preset) continue;
      prepared.push(...prepareNotes(ctx, soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    return prepared;
  }

  function computeAutoGainScale(prepared, options = {}) {
    const list = Array.isArray(prepared) ? prepared : [];
    if (!list.length) return 1;
    const windowStart = Number.isFinite(Number(options.windowStart)) ? Number(options.windowStart) : 0;
    const windowEnd = Number.isFinite(Number(options.windowEnd)) ? Number(options.windowEnd) : Infinity;
    const events = [];
    for (const n of list) {
      const start = Number(n?.start);
      const end = Number(n?.noteEnd ?? (Number(n?.start) + Number(n?.durationSec || 0)));
      const gain = Math.max(0, Number(n?.gainValue) || 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= windowStart || start >= windowEnd || gain <= 0) continue;
      events.push({ t: Math.max(start, windowStart), deltaCount: 1 });
      events.push({ t: Math.min(end, windowEnd), deltaCount: -1 });
    }
    if (!events.length) return 1;
    events.sort((a, b) => a.t - b.t || a.deltaCount - b.deltaCount);
    let simultaneous = 0;
    let peakSimultaneous = 0;
    for (const ev of events) {
      simultaneous += ev.deltaCount;
      if (simultaneous > peakSimultaneous) peakSimultaneous = simultaneous;
    }
    if (peakSimultaneous <= 3) return 1;

    // 1~3개 동시 발음은 원음을 유지하고, 4개 이상부터만 완만하게 낮춘다.
    const scale = Math.sqrt(3 / peakSimultaneous);
    return Math.max(0.35, Math.min(1, scale));
  }

  function prepareNotesWithPartPresets(ctx, notes) {
    const prepared = [];
    const list = Array.isArray(notes) ? notes : [];
    for (let part = 0; part < 6; part++) {
      if (partMuteStates[part]) continue;
      const partNotes = list.filter(n => Number(n.part) === part);
      if (!partNotes.length) continue;
      const preset = getPartPreset(part);
      if (!preset) continue;
      prepared.push(...prepareNotes(ctx, soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    return prepared;
  }

  function areAllScheduledNotesMuted(notes) {
    const list = Array.isArray(notes) ? notes : [];
    return list.length > 0 && list.every(n => {
      const part = clampInt(Number(n?.part ?? 0), 0, 5);
      return Boolean(partMuteStates[part]);
    });
  }

  async function playFromCurrent() {
    try {
      stopMidiPreview();
      stopPlayback(false);
      await loadDefaultSf2IfNeeded();
      scheduleCache = createScheduleFromEditor();
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
      if (scheduleCache.notes.length === 0) throw new Error("재생할 음표가 없습니다. MML 내용을 확인해 주세요.");
      if (currentOffset >= scheduleCache.duration - 0.05) currentOffset = 0;
      const ctx = await ensureAudioContext();
      if (!soundFont.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");
      preparedNotes = prepareNotesWithPartPresets(ctx, scheduleCache.notes);
      playbackAutoGainScale = computeAutoGainScale(preparedNotes, { windowStart: 0, windowEnd: scheduleCache.duration || 0 });
      const allScheduledNotesMuted = areAllScheduledNotesMuted(scheduleCache.notes);
      if (preparedNotes.length === 0 && !allScheduledNotesMuted) throw new Error("소리 나는 음표가 없습니다. V0만 있거나 선택한 음색에서 맞는 음역을 찾지 못했습니다.");

      const baseTime = ctx.currentTime + PLAY_START_DELAY;
      activeSources = [];
      scheduledNoteIds = new Set();
      playContextStart = baseTime;
      playOffsetStart = currentOffset;
      isPlaying = true;
      trackAnalytics("playback_start", {
        offset_sec: Math.max(0, Math.round(Number(currentOffset) || 0)),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      updatePlayButton();
      updateProgressUi(currentOffset, scheduleCache.duration);
      schedulePlaybackWindow();
      startProgressLoop();
    } catch (err) {
      stopPlayback(false);
      showDialog("재생 실패", shortError(err));
    }
  }

  function schedulePlaybackWindow() {
    if (!isPlaying || !audioCtx || !scheduleCache) return;
    if (schedulerTimer) clearTimeout(schedulerTimer);

    const nowOffset = getCurrentPlaybackOffset();
    const duration = scheduleCache.duration || 0;
    if (duration > 0 && nowOffset >= duration - 0.01) {
      finishPlayback();
      return;
    }

    const windowStart = Math.max(playOffsetStart, nowOffset - 0.03);
    const windowEnd = Math.min(duration, nowOffset + SCHEDULE_AHEAD_SEC * playbackSpeed);
    schedulePreparedNotes(audioCtx, preparedNotes, {
      baseTime: playContextStart,
      fromSec: playOffsetStart,
      playbackSpeed,
      windowStart,
      windowEnd,
      destination: masterGain || audioCtx.destination,
      activeSources,
      scheduledIds: scheduledNoteIds,
      minLeadTime: 0.018,
      gainScale: playbackAutoGainScale
    });

    schedulerTimer = setTimeout(schedulePlaybackWindow, SCHEDULE_INTERVAL_MS);
  }

  function createScheduleFromEditor() {
    normalizeTextareaCommands(mainMml);
    const parsed = parseMabinogiMml(mainMml.value);
    const scheduled = buildSchedule(parsed);
    const duration = scheduled.notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
    return { ...scheduled, duration };
  }

  function stopPlayback(updateOffset = true) {
    for (const t of activeTimers) clearTimeout(t);
    activeTimers = [];
    if (schedulerTimer) clearTimeout(schedulerTimer);
    schedulerTimer = 0;
    if (seekRestartTimer) clearTimeout(seekRestartTimer);
    seekRestartTimer = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (audioCtx && isPlaying && updateOffset) currentOffset = getCurrentPlaybackOffset();
    for (const item of activeSources) {
      try { item.gain.gain.cancelScheduledValues(audioCtx?.currentTime || 0); } catch {}
      try { item.source.stop(); } catch {}
    }
    activeSources = [];
    scheduledNoteIds = new Set();
    playbackAutoGainScale = 1;
    isPlaying = false;
    updatePlayButton();
    if (scheduleCache) updateProgressUi(currentOffset, scheduleCache.duration);
  }

  function finishPlayback() {
    const shouldLoop = Boolean(loopPlayback?.checked) && Boolean(scheduleCache?.duration);
    stopPlayback(false);
    if (shouldLoop) {
      currentOffset = 0;
      updateProgressUi(0, scheduleCache?.duration || 0);
      setTimeout(() => {
        if (loopPlayback?.checked) void playFromCurrent();
      }, 20);
      return;
    }
    currentOffset = scheduleCache?.duration || 0;
    updateProgressUi(currentOffset, scheduleCache?.duration || 0);
  }

  async function rewindToStart() {
    const wasPlaying = isPlaying;
    stopPlayback(false);
    currentOffset = 0;
    const duration = scheduleCache?.duration || Number(progressSlider.max) || 0;
    updateProgressUi(0, duration);
    if (wasPlaying) await playFromCurrent();
  }

  function handleSeekInput(restart) {
    const duration = scheduleCache?.duration || Number(progressSlider.max) || 0;
    currentOffset = Math.max(0, Math.min(duration, Number(progressSlider.value) || 0));
    updateProgressUi(currentOffset, duration);
    if (restart && isPlaying) {
      clearTimeout(seekRestartTimer);
      const seekTo = currentOffset;
      seekRestartTimer = setTimeout(() => {
        currentOffset = seekTo;
        void playFromCurrent();
      }, 10);
    }
  }

  function startProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const tick = () => {
      if (!isPlaying) return;
      const duration = scheduleCache?.duration || 0;
      if (!isSeeking) currentOffset = getCurrentPlaybackOffset();
      if (duration > 0) {
        if (!isSeeking) updateProgressUi(currentOffset, duration);
        if (currentOffset >= duration - 0.01) {
          finishPlayback();
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function getCurrentPlaybackOffset() {
    if (!audioCtx || !isPlaying) return currentOffset;
    if (audioCtx.currentTime < playContextStart) return playOffsetStart;
    const elapsed = Math.max(0, audioCtx.currentTime - playContextStart) * playbackSpeed;
    const duration = scheduleCache?.duration || Infinity;
    return Math.max(0, Math.min(duration, playOffsetStart + elapsed));
  }

  function updateProgressUi(current, duration) {
    const d = Math.max(0, Number(duration) || 0);
    const c = Math.max(0, Math.min(d, Number(current) || 0));
    progressSlider.max = d > 0 ? String(d) : "0";
    progressSlider.step = "0.001";
    progressSlider.value = String(c);
    progressSlider.disabled = d <= 0;
    playInfo.textContent = `${formatTime(c)} / ${formatTime(d)}`;
    updateActiveTempoMarker(c);
  }

  function rebuildSchedulePreviewSilently() {
    currentOffset = 0;
    try {
      scheduleCache = createScheduleFromEditor();
      updateProgressUi(0, scheduleCache.duration);
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
    } catch (_) {
      scheduleCache = null;
      updateProgressUi(0, 0);
      updateTempoMarkers([], 0);
    }
  }

  function updateTempoMarkers(markers, duration) {
    if (!tempoMarkerLayer) return;
    tempoMarkerLayer.innerHTML = "";
    const d = Math.max(0, Number(duration) || 0);
    if (d <= 0 || !Array.isArray(markers) || markers.length === 0) return;

    const used = new Map();
    for (const marker of markers) {
      const time = Math.max(0, Math.min(d, Number(marker.time) || 0));
      const bpm = Math.max(1, Math.round(Number(marker.bpm) || 0));
      const percent = Math.max(0, Math.min(100, time / d * 100));
      const key = `${Math.round(percent * 10)}:${bpm}`;
      if (used.has(key)) continue;
      used.set(key, true);

      const el = document.createElement("span");
      el.className = "tempo-marker";
      if (percent < 6) el.classList.add("near-start");
      if (percent > 86) el.classList.add("near-end");
      el.style.left = `${percent}%`;
      el.dataset.time = String(time);
      el.dataset.bpm = String(bpm);
      el.title = `T${bpm} · ${formatTime(time)}`;
      const label = document.createElement("span");
      label.className = "tempo-marker-label";
      label.textContent = `T${bpm}`;
      el.appendChild(label);
      tempoMarkerLayer.appendChild(el);
    }
    updateActiveTempoMarker(currentOffset);
  }

  function updateActiveTempoMarker(current) {
    if (!tempoMarkerLayer) return;
    const markers = Array.from(tempoMarkerLayer.querySelectorAll(".tempo-marker"));
    if (markers.length === 0) return;
    const c = Math.max(0, Number(current) || 0);
    let active = markers[0];
    let bestTime = -Infinity;
    for (const marker of markers) {
      const t = Number(marker.dataset.time || 0);
      marker.classList.remove("active");
      if (t <= c + 0.02 && t >= bestTime) {
        bestTime = t;
        active = marker;
      }
    }
    if (active) active.classList.add("active");
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("이 브라우저는 WebAudio를 지원하지 않습니다.");
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
    }
    if (!masterGain) {
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state !== "running") await audioCtx.resume();
    applyOutputVolume();
    return audioCtx;
  }

  function applyPlaybackSpeed(restartPlaying = true) {
    if (!speedSlider) return;
    const wasPlaying = isPlaying;
    const oldSpeed = playbackSpeed;
    if (wasPlaying) currentOffset = getCurrentPlaybackOffset();
    const raw = Number(speedSlider.value || 1);
    playbackSpeed = Math.max(0.75, Math.min(1.5, Number.isFinite(raw) ? raw : 1));
    speedSlider.value = playbackSpeed.toFixed(2).replace(/\.00$/, "");
    if (speedValue) speedValue.textContent = `${playbackSpeed.toFixed(2)}x`;
    writePref("speed", playbackSpeed.toFixed(2));
    if (wasPlaying && restartPlaying && Math.abs(oldSpeed - playbackSpeed) > 0.0001) {
      clearTimeout(seekRestartTimer);
      seekRestartTimer = setTimeout(() => void playFromCurrent(), 20);
    }
  }

  function applyOutputVolume() {
    const percent = clampInt(Number(volumeSlider.value || 100), 0, 150);
    volumeSlider.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    writePref("volume", String(percent));
    if (masterGain && audioCtx && audioCtx.state !== "closed") {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(percent / 100, now, 0.015);
    }
  }

  function updatePlayButton() {
    playToggleBtn.textContent = isPlaying ? "정지" : "재생";
    playToggleBtn.classList.toggle("danger", isPlaying);
  }

  function setMainMml(text) {
    syncing = true;
    mainMml.value = normalizeMmlForDisplay(text);
    syncing = false;
    syncPartsFromMain();
    updateMainHighlight();
    updateCharCount();
  }

  function syncPartsFromMain() {
    if (syncing) return;
    syncing = true;
    try {
      mainMml.value = normalizeMmlForDisplay(mainMml.value);
      const parts = splitMmlParts(mainMml.value).slice(0, 6).map(normalizePartText);
      while (parts.length < 6) parts.push("");
      partTexts.forEach((t, i) => { t.value = parts[i] || ""; });
      updateMainHighlight();
      updatePartHighlights();
      updateCharCount();
      rebuildSchedulePreviewSilently();
    } finally {
      syncing = false;
    }
  }

  function syncMainFromParts() {
    if (syncing) return;
    syncing = true;
    try {
      partTexts.forEach(normalizeTextareaCommands);
      mainMml.value = normalizeMmlForDisplay(composeMml(partTexts.map(t => t.value), { preserveEmpty: true, partCount: 6 }));
      updateMainHighlight();
      updatePartHighlights();
      updateCharCount();
      rebuildSchedulePreviewSilently();
    } finally {
      syncing = false;
    }
  }

  function selectTab(name) {
    activeTabName = name || "main";
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === activeTabName));
    panels.forEach(p => p.hidden = p.dataset.panel !== activeTabName);
    updatePartMuteControl();
    updateCharCount();
    const partMatch = /^part(\d+)$/.exec(activeTabName || "");
    if (partMatch) updatePartHighlight(Number(partMatch[1]));
  }

  function updateCharCount() {
    if (!charCount) return;
    const parts = splitMmlParts(normalizeMmlForDisplay(mainMml.value)).slice(0, 6).map(normalizePartText);
    while (parts.length < 6) parts.push("");

    if (activeTabName === "main") {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      charCount.textContent = `${formatCount(total)} 자`;
      charCount.className = "char-count";
      return;
    }

    const m = /^part(\d+)$/.exec(activeTabName || "");
    const idx = m ? Number(m[1]) : 0;
    charCount.textContent = `${formatCount((parts[idx] || "").length)} 자`;
    charCount.className = `char-count part-count-${idx}`;
  }

  function formatCount(value) {
    return Math.max(0, Number(value) || 0).toLocaleString("ko-KR");
  }


  function openRestTrimDialog() {
    if (restTrimLimit) restTrimLimit.value = "32";
    setDialogChannelSelection(".rest-trim-channel", true);
    if (restTrimDialog?.showModal) {
      restTrimDialog.showModal();
      return;
    }
    const answer = prompt("삭제할 쉼표 길이를 입력해 주세요.\nall = 모든 쉼표\n4 = 4분음표 이하\n8 = 8분음표 이하\n16 = 16분음표 이하\n32 = 32분음표 이하\n64 = 64분음표 이하\n\n이 브라우저에서는 채널 선택 Dialog를 사용할 수 없어 전체 6채널에 적용됩니다.", "32");
    if (answer == null) return;
    applyRestTrim(answer, null);
  }

  function applyRestTrimFromDialog() {
    const value = restTrimLimit?.value || "32";
    const targetPartIndexes = getDialogSelectedPartIndexes(".rest-trim-channel");
    if (!targetPartIndexes.length) {
      showDialog("쉼표 삭제", "적용할 채널을 1개 이상 선택해 주세요.");
      return;
    }
    restTrimDialog?.close();
    applyRestTrim(value, targetPartIndexes);
  }

  function applyRestTrim(limitValue, targetPartIndexes = null) {
    const threshold = parseRestTrimLimit(limitValue);
    if (!threshold) return;
    const selectedIndexes = targetPartIndexes == null ? null : normalizePartIndexList(targetPartIndexes);
    if (targetPartIndexes != null && !selectedIndexes.length) {
      showDialog("쉼표 삭제", "적용할 채널을 1개 이상 선택해 주세요.");
      return;
    }
    const wasPlaying = isPlaying;
    stopPlayback(false);

    try {
      const result = trimShortRestsMml(normalizeMmlForDisplay(mainMml.value), {
        partCount: 6,
        targetPartIndexes: selectedIndexes,
        all: threshold.all,
        denom: threshold.denom
      });

      if (result.removed <= 0) {
        showDialog("쉼표 삭제", "선택한 채널에서 삭제할 수 있는 쉼표가 없습니다.\n채널 시작 부분의 쉼표나 앞에 음표가 없는 쉼표는 유지됩니다.");
      } else {
        setMainMml(result.mml);
        rebuildSchedulePreviewSilently();
        const label = threshold.all ? "모든 쉼표" : `${threshold.denom}분음표 이하`;
        const selectedLabel = formatSelectedPartLabels(selectedIndexes);
        const saved = Math.max(0, Number(result.saved) || 0);
        flashButton(restTrimBtn, "삭제 완료");
        trackAnalytics("rest_trim_apply", {
          limit: threshold.all ? "all" : String(threshold.denom),
          selected_channel_count: selectedIndexes?.length || 6
        });
        showDialog(
          "쉼표 삭제",
          `${selectedLabel}에서 ${label} 길이로 쉼표 ${result.removed.toLocaleString("ko-KR")}개를 정리했습니다.\n` +
          `최적화 결과: ${result.before.toLocaleString("ko-KR")} 자 → ${result.after.toLocaleString("ko-KR")} 자` +
          (saved ? `\n절약: ${saved.toLocaleString("ko-KR")} 자` : "")
        );
      }
    } catch (err) {
      showDialog("쉼표 삭제 실패", shortError(err));
    } finally {
      if (wasPlaying) currentOffset = 0;
    }
  }

  function openBulkVolumeDialog() {
    if (bulkVolumeAmount) bulkVolumeAmount.value = "0";
    setDialogChannelSelection(".bulk-volume-channel", true);
    if (bulkVolumeDialog?.showModal) {
      bulkVolumeDialog.showModal();
      bulkVolumeAmount?.focus();
      bulkVolumeAmount?.select?.();
      return;
    }
    const answer = prompt("선택 채널에 더할 볼륨 변화량을 입력해 주세요.\n-15 ~ 15 사이의 정수만 사용할 수 있습니다.\n\n이 브라우저에서는 채널 선택 Dialog를 사용할 수 없어 전체 6채널에 적용됩니다.", "0");
    if (answer == null) return;
    applyBulkVolume(answer, null);
  }

  function applyBulkVolumeFromDialog() {
    normalizeBulkVolumeAmountInput();
    const targetPartIndexes = getDialogSelectedPartIndexes(".bulk-volume-channel");
    if (!targetPartIndexes.length) {
      showDialog("볼륨 조절", "적용할 채널을 1개 이상 선택해 주세요.");
      return;
    }
    const value = bulkVolumeAmount?.value || "0";
    bulkVolumeDialog?.close();
    applyBulkVolume(value, targetPartIndexes);
  }

  function applyBulkVolume(value, targetPartIndexes = null) {
    const delta = normalizeBulkVolumeDelta(value);
    const selectedIndexes = targetPartIndexes == null ? null : normalizePartIndexList(targetPartIndexes);
    if (targetPartIndexes != null && !selectedIndexes.length) {
      showDialog("볼륨 조절", "적용할 채널을 1개 이상 선택해 주세요.");
      return;
    }

    const wasPlaying = isPlaying;
    stopPlayback(false);
    try {
      const result = adjustVolumesMml(normalizeMmlForDisplay(mainMml.value), {
        partCount: 6,
        targetPartIndexes: selectedIndexes,
        delta
      });

      if (result.changedNotes <= 0) {
        const message = delta === 0
          ? "볼륨 변화량이 0이라 변경할 내용이 없습니다."
          : "선택한 채널에서 변경 가능한 음표가 없습니다. 이미 0 또는 15에 걸려 있으면 더 이상 변하지 않습니다.";
        showDialog("볼륨 조절", message);
      } else {
        setMainMml(result.mml);
        rebuildSchedulePreviewSilently();
        const saved = Math.max(0, Number(result.saved) || 0);
        const selectedLabel = formatSelectedPartLabels(selectedIndexes);
        flashButton(bulkVolumeBtn, "적용 완료");
        trackAnalytics("bulk_volume_adjust", {
          delta,
          selected_channel_count: selectedIndexes?.length || 6
        });
        showDialog(
          "볼륨 조절",
          `${selectedLabel}의 음표 ${result.changedNotes.toLocaleString("ko-KR")}개 볼륨을 ${delta > 0 ? "+" : ""}${delta} 조절했습니다.\n` +
          `결과 범위는 V0~V15로 제한됩니다.` +
          (result.clampedNotes ? `\n범위 제한 적용: ${result.clampedNotes.toLocaleString("ko-KR")}개` : "") +
          `\n최적화 결과: ${result.before.toLocaleString("ko-KR")} 자 → ${result.after.toLocaleString("ko-KR")} 자` +
          (saved ? `\n절약: ${saved.toLocaleString("ko-KR")} 자` : "")
        );
      }
    } catch (err) {
      showDialog("볼륨 조절 실패", shortError(err));
    } finally {
      if (wasPlaying) currentOffset = 0;
    }
  }

  function setDialogChannelSelection(selector, checked) {
    document.querySelectorAll(selector).forEach(input => {
      input.checked = Boolean(checked);
    });
  }

  function getDialogSelectedPartIndexes(selector) {
    return normalizePartIndexList(Array.from(document.querySelectorAll(selector))
      .filter(input => input.checked)
      .map(input => Number(input.dataset.partIndex)));
  }

  function normalizePartIndexList(indexes) {
    const selected = [];
    const seen = new Set();
    for (const raw of indexes || []) {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= PART_LABELS.length || seen.has(index)) continue;
      seen.add(index);
      selected.push(index);
    }
    return selected;
  }

  function formatSelectedPartLabels(indexes) {
    const selected = normalizePartIndexList(indexes);
    if (!selected.length || selected.length >= PART_LABELS.length) return "전체 채널";
    return selected.map(index => PART_LABELS[index] || `${index + 1}채널`).join(", ");
  }

  function normalizeBulkVolumeAmountInput() {
    if (!bulkVolumeAmount) return;
    bulkVolumeAmount.value = String(normalizeBulkVolumeDelta(bulkVolumeAmount.value));
  }

  function normalizeBulkVolumeDelta(value) {
    let delta = Math.round(Number(value));
    if (!Number.isFinite(delta)) delta = 0;
    return clampInt(delta, -15, 15);
  }

  function openLeadingSilenceDialog() {
    if (leadingSilenceSeconds) leadingSilenceSeconds.value = "2";
    if (leadingSilenceDialog?.showModal) {
      leadingSilenceDialog.showModal();
      leadingSilenceSeconds?.focus();
      leadingSilenceSeconds?.select?.();
      return;
    }
    const answer = prompt("악보 맨앞에 넣을 공백 시간을 초 단위로 입력해 주세요.\n기본값 2초, 최소 0.25초, 0.25초 단위", "2");
    if (answer == null) return;
    applyLeadingSilence(answer);
  }

  function applyLeadingSilenceFromDialog() {
    normalizeLeadingSilenceSecondsInput();
    const value = leadingSilenceSeconds?.value || "2";
    leadingSilenceDialog?.close();
    applyLeadingSilence(value);
  }

  function normalizeLeadingSilenceSecondsInput() {
    if (!leadingSilenceSeconds) return;
    leadingSilenceSeconds.value = formatSecondInput(normalizeLeadingSilenceSeconds(leadingSilenceSeconds.value));
  }

  function normalizeLeadingSilenceSeconds(value) {
    const step = 0.25;
    const min = 0.25;
    let seconds = Number(value);
    if (!Number.isFinite(seconds)) seconds = 2;
    seconds = Math.max(min, seconds);
    seconds = Math.round(seconds / step) * step;
    seconds = Math.max(min, seconds);
    return Number(seconds.toFixed(2));
  }

  function formatSecondInput(seconds) {
    return String(Number(seconds.toFixed(2)));
  }

  function formatSecondCount(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return "0초";
    return `${Number(value.toFixed(2)).toLocaleString("ko-KR")}초`;
  }

  function applyLeadingSilence(value) {
    const seconds = normalizeLeadingSilenceSeconds(value);
    try {
      stopPlayback(false);
      const result = addLeadingSilenceMml(normalizeMmlForDisplay(mainMml.value), {
        partCount: 6,
        beats: seconds * 2
      });
      setMainMml(result.mml);
      rebuildSchedulePreviewSilently();
      flashButton(leadingSilenceBtn, "설정 완료");
      const removedSeconds = Math.max(0, Number(result.removedLeadingBeats || 0) / 2);
      const addedSeconds = Math.max(0, Number(result.addedBeats || 0) / 2);
      const removedLine = removedSeconds > 0
        ? `\n기존 첫 음 앞 공통 공백 ${formatSecondCount(removedSeconds)}를 제거했습니다.`
        : "";
      showDialog(
        "시작 공백 설정 완료",
        `시작 공백을 ${formatSecondCount(addedSeconds)}로 설정했습니다.${removedLine}\n설정 구간은 T120 기준 쉼표로 시작합니다.`
      );
    } catch (err) {
      showDialog("시작 공백 설정 실패", shortError(err));
    }
  }

  function parseRestTrimLimit(value) {
    const raw = String(value || "32").trim().toLowerCase();
    if (raw === "all" || raw === "전체" || raw === "모두") return { all: true, denom: null };
    const denom = Number(raw);
    if (![4, 8, 16, 32, 64].includes(denom)) {
      showDialog("쉼표 삭제", "삭제 길이는 all, 4, 8, 16, 32, 64 중 하나를 선택해 주세요.");
      return null;
    }
    return { all: false, denom };
  }

  async function pasteVisibleMml() {
    let text = "";
    try {
      if (!navigator.clipboard?.readText) throw new Error("clipboard read unavailable");
      text = await navigator.clipboard.readText();
    } catch (_) {
      const manual = prompt("붙여넣을 MML을 입력해 주세요.");
      if (manual == null) return;
      text = manual;
    }
    if (!String(text || "").trim()) {
      showDialog("붙여넣기 실패", "붙여넣을 MML이 비어 있습니다.");
      return;
    }

    const activePanel = panels.find(p => !p.hidden) || panels[0];
    const isMainPanel = activePanel.dataset.panel === "main";
    const looksLikeFullMml = /^\s*mml\s*@/i.test(text) || String(text).includes(",");
    if (isMainPanel || looksLikeFullMml) {
      let pasted = text;
      try {
        pasted = normalizeImportedFullMml(text).mml;
      } catch (_) {
        pasted = text;
      }
      setMainMml(pasted);
    } else {
      const textarea = activePanel.querySelector("textarea");
      if (!textarea) return;
      textarea.value = normalizePartText(text);
      syncMainFromParts();
    }
    clearSuggestedMmlSaveFileName();
    googleDriveMmlFileId = "";
    googleDriveMmlFileName = "";
    rebuildSchedulePreviewSilently();
    flashButton(pasteBtn, "붙여넣기 완료");
    trackAnalytics("paste_mml", { channel_count: analyticsChannelCount(mainMml.value) });
  }

  async function copyVisibleMml() {
    let text;
    try {
      text = normalizeMmlForCopy(optimizeMml(mainMml?.value || "").mml);
    } catch (err) {
      showDialog("복사 실패", `MML 최적화 중 문제가 발생했습니다.

${shortError(err)}`);
      return;
    }
    const mainPanel = panels.find(p => p.dataset.panel === "main") || panels[0];
    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, "복사 완료");
      showCopySummary(mainPanel, text);
      trackAnalytics("copy_all_mml", { channel_count: analyticsChannelCount(text) });
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flashButton(copyBtn, "복사 완료");
        showCopySummary(mainPanel, text);
        trackAnalytics("copy_all_mml", { channel_count: analyticsChannelCount(text) });
      } catch (err) {
        showDialog("복사 실패", "자동 복사가 막혔습니다. 전체 MML을 선택한 뒤 Ctrl+C로 복사해 주세요.");
      } finally {
        ta.remove();
      }
    }
  }


  function showCopySummary(activePanel, copiedText) {
    const isMainPanel = activePanel.dataset.panel === "main";
    let rows = [];

    if (isMainPanel) {
      const copiedParts = splitMmlParts(normalizeMmlForDisplay(copiedText)).slice(0, 6).map(normalizePartText);
      rows = copiedParts
        .map((part, i) => ({ label: PART_LABELS[i] || `채널${i + 1}`, length: part.length }))
        .filter(row => row.length > 0);
    } else {
      const m = /^part(\d+)$/.exec(activePanel.dataset.panel || "");
      const idx = m ? Number(m[1]) : 0;
      rows = [{ label: PART_LABELS[idx] || "현재 채널", length: normalizePartText(copiedText).length }].filter(row => row.length > 0);
    }

    if (!rows.length) {
      showDialog("복사 완료", "복사된 MML이 비어 있습니다.");
      return;
    }

    const total = rows.reduce((sum, row) => sum + row.length, 0);
    const body = [
      "복사된 MML 정보",
      "",
      ...rows.map(row => `${row.label}: ${formatCount(row.length)} 자`),
      "",
      `합계: ${formatCount(total)} 자`
    ].join("\n");
    showDialog("복사 완료", body);
  }


  function openSplitCopyDialog() {
    try {
      buildSplitCopyPages();
      trackAnalytics("split_copy_open");
      if (splitCopyDialog?.showModal) splitCopyDialog.showModal();
      else showDialog("악보 나눠복사", "이 브라우저는 나눠복사 Dialog를 지원하지 않습니다.");
    } catch (err) {
      showDialog("나눠복사 실패", shortError(err));
    }
  }

  function buildSplitCopyPages() {
    if (!splitCopyPages || !splitCopySummary) return;
    const maxChars = Math.max(200, Math.min(5000, Math.round(Number(splitCopyLimit?.value || 2400) || 2400)));
    if (splitCopyLimit) splitCopyLimit.value = String(maxChars);

    let result;
    try {
      result = splitMmlPages(mainMml.value || "", {
        partCount: 6,
        maxChars,
        searchSlackChars: Math.round(maxChars / 2),
        minCommonSilenceBeats: 2
      });
    } catch (err) {
      splitCopySummary.hidden = false;
      splitCopySummary.textContent = `분할 실패: ${shortError(err)}`;
      splitCopyPages.innerHTML = "";
      throw err;
    }

    const pages = result.pages || [];
    const warnings = Array.from(result.warnings || []);
    if (splitCopySummary) {
      splitCopySummary.hidden = warnings.length === 0;
      splitCopySummary.innerHTML = warnings.length
        ? `<em>${escapeHtml(warnings.slice(0, 3).join(" / "))}${warnings.length > 3 ? " 외" : ""}</em>`
        : "";
    }

    splitCopyPages.innerHTML = "";
    if (!pages.length) {
      splitCopyPages.innerHTML = `<div class="split-copy-empty">분할할 MML이 없습니다.</div>`;
      return;
    }

    for (const page of pages) {
      const row = document.createElement("div");
      row.className = `split-copy-page${page.maxPartLength > maxChars ? " over" : ""}`;
      const nonEmpty = page.parts
        .map((part, i) => ({ label: PART_LABELS[i] || `채널${i + 1}`, length: String(part || "").length }))
        .filter(item => item.length > 0);
      const lengthText = nonEmpty.length
        ? nonEmpty.map(item => `${item.label} ${formatCount(item.length)}자`).join(" · ")
        : "빈 악보";
      const reasonText = describeSplitReason(page.reason);
      const skipped = page.skippedUnits > 0 ? ` · 공통 무음 ${formatBeatUnits(page.skippedUnits)} 제거` : "";
      row.innerHTML = `
        <div class="split-copy-page-main">
          <strong>악보 ${page.index}</strong>
          <span>${escapeHtml(lengthText)}</span>
          <small>${escapeHtml(reasonText + skipped)}${page.warning ? ` · ${escapeHtml(page.warning)}` : ""}</small>
        </div>
        <div class="split-copy-page-actions">
          <button type="button" class="ghost" data-split-preview-index="${page.index - 1}">듣기</button>
          <button type="button" class="primary" data-split-copy-index="${page.index - 1}">복사</button>
        </div>
      `;
      row.querySelector("[data-split-copy-index]")?.addEventListener("click", () => void copySplitPage(page));
      row.querySelector("[data-split-preview-index]")?.addEventListener("click", (ev) => void previewSplitPage(page, ev.currentTarget));
      splitCopyPages.appendChild(row);
    }
  }

  async function previewSplitPage(page, triggerButton = null) {
    const text = String(page?.mml || "").trim();
    if (!text) {
      showDialog("나눠복사 미리듣기 실패", "재생할 악보가 비어 있습니다.");
      return;
    }
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      return;
    }
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      trackAnalytics("preview_split_page", { page_index: Number(page?.index || 0) });
      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const parsed = parseMabinogiMml(text);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error("재생할 음표가 없습니다.");
      if (!soundFont.presets?.length) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");
      const prepared = prepareNotesWithPartPresets(ctx, notes);
      if (!prepared.length) throw new Error("소리 나는 음표가 없습니다.");
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: duration + 0.05,
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012,
        gainScale
      });
      const stopMs = Math.max(800, Math.min(180000, (result.maxEnd - ctx.currentTime + 0.35) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      stopMidiPreview();
      showDialog("나눠복사 미리듣기 실패", shortError(err));
    }
  }

  async function copySplitPage(page) {
    const text = String(page.mml || "").trim();
    if (!text) {
      showDialog("나눠복사 실패", "복사할 악보가 비어 있습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showDialog("복사 완료", buildSplitCopyPageMessage(page));
      trackAnalytics("copy_split_page", { page_index: Number(page?.index || 0) });
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showDialog("복사 완료", buildSplitCopyPageMessage(page));
        trackAnalytics("copy_split_page", { page_index: Number(page?.index || 0) });
      } catch (err) {
        showDialog("복사 실패", "자동 복사가 막혔습니다. Dialog의 악보를 직접 선택해 복사해 주세요.");
      } finally {
        ta.remove();
      }
    }
  }

  function buildSplitCopyPageMessage(page) {
    const rows = page.parts
      .map((part, i) => ({ label: PART_LABELS[i] || `채널${i + 1}`, length: String(part || "").length }))
      .filter(row => row.length > 0);
    const total = rows.reduce((sum, row) => sum + row.length, 0);
    return [
      `악보 ${page.index}가 복사되었습니다.`,
      "",
      ...rows.map(row => `${row.label}: ${formatCount(row.length)} 자`),
      "",
      `합계: ${formatCount(total)} 자`
    ].join("\n");
  }

  function describeSplitReason(reason) {
    switch (reason) {
      case "last": return "마지막 악보";
      case "common-silence": return "2박 이상 공통 무음에서 분할";
      case "longest-silence": return "가장 긴 공통 무음에서 분할";
      case "clean-boundary": return "전체 채널 경계에서 분할";
      case "partial-boundary": return "최대 안전 경계에서 분할";
      case "char-limit": return "글자 수 기준 분할";
      case "forced": return "강제 분할";
      default: return "분할";
    }
  }

  function formatBeatUnits(units) {
    const beats = (Number(units) || 0) / 256;
    if (Math.abs(beats - Math.round(beats)) < 1e-6) return `${formatCount(Math.round(beats))}박`;
    return `${beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}박`;
  }

  async function saveVisibleMml() {
    let exportData;
    try {
      exportData = getFullMmlForExport();
    } catch (err) {
      showDialog("저장 실패", `MML 최적화 중 문제가 발생했습니다.\n\n${shortError(err)}`);
      return;
    }
    const { text } = exportData;
    if (!text.trim()) {
      showDialog("저장 실패", "저장할 MML이 비어 있습니다.");
      return;
    }

    const defaultName = defaultLocalSaveFileName();
    const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: "텍스트 MML 파일",
            accept: { "text/plain": [".txt"] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        flashButton(saveBtn, "저장 완료");
        trackAnalytics("local_save_mml", { channel_count: analyticsChannelCount(text) });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        showDialog("저장 실패", shortError(err));
        return;
      }
    }

    const entered = prompt("저장할 파일 이름을 입력해 주세요.\n브라우저에 따라 저장 위치는 다운로드 설정을 따릅니다.", defaultName);
    if (entered == null) return;
    let fileName = entered.trim() || defaultName;
    if (!/\.txt$/i.test(fileName)) fileName += ".txt";
    downloadBlob(blob, fileName);
    flashButton(saveBtn, "저장 완료");
    trackAnalytics("local_save_mml", { channel_count: analyticsChannelCount(text) });
  }

  function getFullMmlForExport() {
    const text = normalizeMmlForCopy(optimizeMml(mainMml?.value || "").mml);
    return { text };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function flashButton(button, text) {
    const old = button.textContent;
    button.textContent = text;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { button.textContent = old; }, 1000);
  }

  function normalizeTextareaCommands(textarea) {
    const before = textarea.value;
    const after = textarea === mainMml ? normalizeMmlForDisplay(before) : normalizePartText(before);
    if (before === after) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = after;
    try { textarea.setSelectionRange(start, end); } catch {}
  }

  function normalizePartText(text) {
    return normalizeCommandCase(String(text || "")
      .replace(/^\s*mml\s*@/i, "")
      .replace(/;\s*$/g, ""))
      .trim();
  }

  function normalizeCommandCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, ch => {
      const lower = ch.toLowerCase();
      if ("tolv".includes(lower)) return lower.toUpperCase();
      if ("rnabcdefg".includes(lower)) return lower;
      return ch;
    });
  }

  function normalizeMmlForDisplay(text) {
    let s = String(text || "").replace(/^\s*mml\s*@/i, "MML@");

    const m = s.match(/^\s*MML@([\s\S]*?)(;?)\s*$/i);
    let parts;
    if (m) parts = m[1].split(",").map(x => normalizePartText(x)).slice(0, 6);
    else parts = [normalizePartText(s)];
    while (parts.length < 6) parts.push("");
    return `MML@${parts.join(",")};`;
  }

  function normalizeMmlForCopy(text) {
    const parts = splitMmlParts(normalizeMmlForDisplay(text)).map(normalizePartText).filter(Boolean);
    return `MML@${parts.join(",")};`;
  }

  function updateMainHighlight() {
    if (!mainMmlHighlight) return;
    mainMmlHighlight.innerHTML = renderColoredMml(mainMml.value) + "\n";
    syncHighlightScroll();
  }

  function syncHighlightScroll() {
    if (!mainMmlHighlight) return;
    mainMmlHighlight.scrollTop = mainMml.scrollTop;
    mainMmlHighlight.scrollLeft = mainMml.scrollLeft;
  }

  function updatePartHighlights() {
    partMmlHighlights.forEach((_, i) => updatePartHighlight(i));
  }

  function updatePartHighlight(index) {
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    highlight.innerHTML = renderPartWithErrors(textarea.value) + "\n";
    syncPartHighlightScroll(index);
  }

  function syncPartHighlightScroll(index) {
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  function renderColoredMml(text) {
    const s = normalizeMmlForDisplay(text);
    const at = s.indexOf("@");
    const lastSemi = s.lastIndexOf(";");
    const hasHeader = /^\s*MML\s*@/i.test(s) && at >= 0;
    const prefix = hasHeader ? s.slice(0, at + 1) : "";
    const bodyStart = hasHeader ? at + 1 : 0;
    const bodyEnd = lastSemi >= bodyStart ? lastSemi : s.length;
    const body = s.slice(bodyStart, bodyEnd);
    const suffix = lastSemi >= bodyStart ? s.slice(lastSemi) : "";
    const parts = body.split(",").map(x => x.trim()).slice(0, 6);
    const colored = parts.map((part, i) => `<span class="ch${Math.min(i, 5)}">${renderPartWithErrors(part)}</span>`).join(`<span class="mml-separator">,</span>`);
    return `<span class="mml-prefix">${escapeHtml(prefix)}</span>${colored}<span class="mml-suffix">${escapeHtml(suffix)}</span>`;
  }

  function renderPartWithErrors(part) {
    const text = String(part || "");
    const invalid = findInvalidPartChars(text);
    const tempoRanges = findTempoHighlightRanges(text, invalid);
    let tempoRangeIndex = 0;
    let out = "";

    for (let i = 0; i < text.length; i++) {
      const tempoRange = tempoRanges[tempoRangeIndex];
      if (tempoRange && i === tempoRange.start) {
        out += `<span class="tempo-code">${escapeHtml(text.slice(tempoRange.start, tempoRange.end))}</span>`;
        i = tempoRange.end - 1;
        tempoRangeIndex++;
        continue;
      }

      const ch = escapeHtml(text[i]);
      out += invalid.has(i) ? `<span class="invalid-code">${ch}</span>` : ch;
    }
    return out;
  }

  function findTempoHighlightRanges(part, invalid = new Set()) {
    const text = String(part || "");
    const ranges = [];
    const re = /[tT]\s*\d+/g;
    let match;
    while ((match = re.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      let hasInvalid = false;
      for (let i = start; i < end; i++) {
        if (invalid.has(i)) { hasInvalid = true; break; }
      }
      if (!hasInvalid) ranges.push({ start, end });
    }
    return ranges;
  }

  function findInvalidPartChars(part) {
    const s = String(part || "");
    const invalid = new Set();
    let i = 0;
    let defaultLength = 4;

    const mark = (from, to) => {
      const end = Math.max(from + 1, to);
      for (let p = Math.max(0, from); p < Math.min(s.length, end); p++) invalid.add(p);
    };
    const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readNumberRange = () => {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      return { start, end: i, text: s.slice(start, i), value: i > start ? Number(s.slice(start, i)) : null };
    };
    const readDots = () => { while (s[i] === ".") i++; };
    const readLength = (cmdStart, explicitRequired) => {
      const n = readNumberRange();
      if (n.value == null) {
        if (explicitRequired) mark(cmdStart, i);
        readDots();
        return;
      }
      if (![1, 2, 4, 8, 16, 32, 64].includes(n.value)) mark(n.start, n.end);
      readDots();
    };
    const isNote = ch => "cdefgab".includes(ch);

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const start = i;
      const ch = s[i];
      const lower = ch.toLowerCase();

      if (isNote(lower)) {
        if (ch !== lower) mark(start, start + 1);
        i++;
        if (s[i] === "+" || s[i] === "#" || s[i] === "-") i++;
        readLength(start, false);
      } else if (lower === "r") {
        if (ch !== "r") mark(start, start + 1);
        i++;
        readLength(start, false);
      } else if (lower === "n") {
        if (ch !== "n") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 127) mark(n.start, n.end);
        readDots();
      } else if (lower === "t") {
        if (ch !== "T") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 32 || n.value > 255) mark(n.start, n.end);
      } else if (lower === "o") {
        if (ch !== "O") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 9) mark(n.start, n.end);
      } else if (lower === "l") {
        if (ch !== "L") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null || ![1, 2, 4, 8, 16, 32, 64].includes(n.value)) mark(n.start === n.end ? start : n.start, n.end);
        else defaultLength = n.value;
        readDots();
      } else if (lower === "v") {
        if (ch !== "V") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 15) mark(n.start, n.end);
      } else if (ch === ">" || ch === "<") {
        i++;
      } else if (ch === "&") {
        i++;
        let j = i;
        while (j < s.length && /\s/.test(s[j])) j++;
        const next = s[j]?.toLowerCase();
        if (!(isNote(next) || next === "r" || next === "n")) mark(start, start + 1);
      } else if (ch === "." || ch === "+" || ch === "#" || ch === "-" || ch === "[" || ch === "]" || ch === ";" || ch === ",") {
        mark(start, start + 1);
        i++;
      } else if (/\d/.test(ch)) {
        const n = readNumberRange();
        mark(n.start, n.end);
      } else {
        mark(start, start + 1);
        i++;
      }
    }
    return invalid;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }


  function showDialog(title, message) {
    alert(`${title}\n\n${message}`);
  }
})();
