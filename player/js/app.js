(() => {
  "use strict";

  const DEFAULT_SOUND_BANK_FILE_NAME = String(window.MOBIBARD_DEFAULT_SF3_NAME || "FluidR3Mono_GM_compact.sf3");
  const PART_LABEL_KEYS = ["part.melody", "part.harmony1", "part.harmony2", "part.harmony3", "part.harmony4", "part.harmony5"];
  const PART_LABELS = new Proxy(PART_LABEL_KEYS, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        return i18nText(target[Number(property)]);
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const PREF_PREFIX = "mobibard.player.";
  const DEFAULT_PART_PRESET_KEY = "0:0";
  const MOBIBEATS_URL = new URL("../mobibeats/", window.location.href).href;
  const MOBIBEATS_TARGET_ORIGIN = window.location.origin === "null" ? "*" : window.location.origin;
  const DEFAULT_MIDI_SOUND_PRESET_KEY = "midi.recent_sounds";
  const USER_SOUND_PRESET_VALUE_PREFIX = "user:";
  const PART_PREVIEW_MELODY_INTERVALS = [0, 2, 4, 7, 9, 7, 4, 0];
  const PART_PREVIEW_DRUM_NOTES = [36, 42, 38, 42, 36, 46, 38, 42];
  const OVERLAP_MERGE_OPTIONS = [
    { value: "all", labelKey: "ui.all" },
    { value: "half", labelKey: "ui.half" },
    { value: "none", labelKey: "ui.none" }
  ];
  const MIDI_INSTRUMENT_CATEGORY_ORDER = ["keyboard", "strings", "winds", "vocal", "other", "drums"];
  const MIDI_INSTRUMENT_CATEGORY_LABEL_KEYS = {
    keyboard: "ui.keyboards",
    strings: "ui.strings",
    winds: "ui.winds",
    vocal: "midi.vocal_instruments",
    other: "midi.other_instruments",
    drums: "midi.drums"
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
  const GOOGLE_DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
  const GOOGLE_DOCS_DOCUMENT_MIME = "application/vnd.google-apps.document";
  const GOOGLE_DRIVE_TEXT_EXPORT_MIME = "text/plain";
  const GOOGLE_AUTO_RECONNECT_PREF = "googleAutoReconnect";
  const GOOGLE_TOKEN_CACHE_PREF = "googleTokenCache";
  const MIDI_CONVERT_CACHE_PREF = "midiConvertLastSettings";
  const MIDI_CONVERT_CACHE_VERSION = 2;
  const SOUND_BANK_SELECTION_PREF = "soundBankSelectionMeta";
  const GOOGLE_SOUND_BANK_FILE_NAME = "mobibard-player-soundbank-cache.bin";
  const GOOGLE_SOUND_BANK_MIME = "application/octet-stream";
  const GOOGLE_LOCAL_ONLY_PREFS = new Set([
    GOOGLE_AUTO_RECONNECT_PREF,
    GOOGLE_TOKEN_CACHE_PREF,
    MIDI_CONVERT_CACHE_PREF,
    SOUND_BANK_SELECTION_PREF
  ]);
  const GUEST_AVATAR_URL = "../assets/icons/guest-user.svg?v=5.0.0&rev=20260818-205217";
  const AUTO_IMPORT_LEADING_SILENCE_SECONDS = 2;
  const MMI_IMPORT_MAX_CHANNELS = 6;
  const MMI_IMPORT_MAX_DETECTED_PARTS = 96;
  const SOURCE_FILE_EXTENSIONS = new Set(["txt", "mmi", "mml", ...(window.MabiMusicFormats?.inputExtensions?.() || window.MabiMusicFormats?.supportedExtensions?.() || [])]);
  const HEADER_SHORTCUT_LINKS = new Set([
    "https://bitmidi.com/",
    "https://www.classicalarchives.com/midi.html",
    "https://ichigos.com/",
    "https://josh.agarrado.net/music/anime/index.php",
    "http://www.midiex.net/",
    "http://www.midisite.co.uk/",
    "https://musescore.com/",
    "https://www.vgmusic.com/"
  ]);
  const ACTIVE_CODE_LOOKAHEAD_SEC = 0.012;
  const ACTIVE_CODE_RELEASE_SEC = 0.026;
  const PIANO_ROLL_MIN_KEY_SPAN = 24;
  // 피아노롤의 음정 좌표는 12반음을 동일 폭으로 배치한다.
  // 아래 피아노 건반만 이 균등한 음정 중심에 맞춰 흰/검은 건반 모양으로 그린다.
  const PIANO_ROLL_NOTE_WIDTH_RATIO = 0.86;
  const PIANO_BLACK_KEY_WIDTH_IN_PITCH_LANES = 1.06;
  const PIANO_BLACK_KEY_HEIGHT_RATIO = 0.62;
  const PIANO_ROLL_FALL_WINDOW_COLLAPSED = 1.8;
  const PIANO_ROLL_FALL_WINDOW_EXPANDED = 4.6;
  const PIANO_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const PIANO_BLACK_KEY_PITCHES = new Set([1, 3, 6, 8, 10]);


  const { shortError, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview } = window.MabiMidi;
  const { parseMabinogiMml, splitMmlParts, splitMmlPartsDetailed, parseMmlPart, buildSchedule, composeMml, analyzeIrregularMmlLengths, normalizeIrregularMmlLengths } = window.MabiMml;
  const { optimizeMml, generateAccompanimentMml, generateDynamicsMml, simplifyTemposMml, countShortRestsMml, trimShortRestsMml, addLeadingSilenceMml, adjustVolumesMml, transposeOctavesMml, splitMmlPages } = window.MabiOptimizer;
  const { parseSoundBank, loadEmbeddedSoundBank, prepareNotes, schedulePreparedNotes } = window.MabiSoundBank;

  const $ = (id) => document.getElementById(id);

  function openFilePickerInput(input) {
    if (!input || input.disabled) return;
    const groupedPicker = window.MabiSupportedFilesUi?.openFileInput;
    if (typeof groupedPicker === "function") {
      void groupedPicker(input);
      return;
    }
    input.click();
  }

  const midiFile = $("midiFile");
  const midiLoadBtn = $("midiLoadBtn");
  const midiSiteLinks = $("midiSiteLinks");
  const sf2File = $("sf2File");
  const soundName = $("soundName");
  const soundFontLoadBtn = $("soundFontLoadBtn");
  const soundFontResetBtn = $("soundFontResetBtn");
  const languageSelect = $("languageSelect");
  const googleLoginBtn = $("googleLoginBtn");
  const googleDriveLoadBtn = $("googleDriveLoadBtn");
  const googleDriveSaveBtn = $("googleDriveSaveBtn");
  const googleStatus = $("googleStatus");
  const accountMenuButton = $("accountMenuButton");
  const accountMenu = $("accountMenu");
  const accountAvatarImg = $("accountAvatarImg");
  const accountMenuName = $("accountMenuName");
  const accountMenuEmail = $("accountMenuEmail");
  const googleDriveSaveDialog = $("googleDriveSaveDialog");
  const googleDriveSaveFolderNameText = $("googleDriveSaveFolderNameText");
  const googleDriveSaveFolderBtn = $("googleDriveSaveFolderBtn");
  const googleDriveSaveFileName = $("googleDriveSaveFileName");
  const googleDriveSaveStatus = $("googleDriveSaveStatus");
  const googleDriveSaveCancel = $("googleDriveSaveCancel");
  const googleDriveSaveApply = $("googleDriveSaveApply");
  const mmiImportDialog = $("mmiImportDialog");
  const mmiImportTitle = $("mmiImportTitle");
  const mmiImportSummary = $("mmiImportSummary");
  const mmiFullPreviewBtn = $("mmiFullPreviewBtn");
  const mmiAllPreviewBtn = $("mmiAllPreviewBtn");
  const mmiChannelList = $("mmiChannelList");
  const mmiImportStatus = $("mmiImportStatus");
  const mmiImportClear = $("mmiImportClear");
  const mmiImportReloadFile = $("mmiImportReloadFile");
  const mmiImportGoogleDriveLoad = $("mmiImportGoogleDriveLoad");
  const mmiImportCancel = $("mmiImportCancel");
  const mmiImportApply = $("mmiImportApply");
  const codeHelpBtn = $("codeHelpBtn");
  const codeHelpDialog = $("codeHelpDialog");
  const codeHelpClose = $("codeHelpClose");
  const playToggleBtn = $("playToggleBtn");
  const rewindBtn = $("rewindBtn");
  const loopPlayback = $("loopPlayback");
  const speedControlButton = $("speedControlButton");
  const speedControlPopover = $("speedControlPopover");
  const speedResetBtn = $("speedResetBtn");
  const speedSlider = $("speedSlider");
  const speedValue = $("speedValue");
  const volumeControlButton = $("volumeControlButton");
  const volumeControlPopover = $("volumeControlPopover");
  const volumeResetBtn = $("volumeResetBtn");
  const volumeSlider = $("volumeSlider");
  const volumeValue = $("volumeValue");
  const progressSlider = $("progressSlider");
  const tempoMarkerLayer = $("tempoMarkerLayer");
  const tempoEditDialog = $("tempoEditDialog");
  const tempoEditForm = $("tempoEditForm");
  const tempoEditContext = $("tempoEditContext");
  const tempoEditBpm = $("tempoEditBpm");
  const tempoEditApply = $("tempoEditApply");
  const tempoEditCancel = $("tempoEditCancel");
  const tempoSimplifyBtn = $("tempoSimplifyBtn");
  const tempoSimplifyDialog = $("tempoSimplifyDialog");
  const tempoSimplifyPreview = $("tempoSimplifyPreview");
  const tempoSimplifyApply = $("tempoSimplifyApply");
  const tempoSimplifyCancel = $("tempoSimplifyCancel");
  const pianoRoll = $("pianoRoll");
  const pianoRollCanvas = $("pianoRollCanvas");
  const pianoRollEmpty = $("pianoRollEmpty");
  const pianoRollRangeLabel = $("pianoRollRangeLabel");
  const pianoRollToggleLabel = $("pianoRollToggleLabel");
  const playInfo = $("playInfo");
  const copyBtn = $("copyBtn");
  const clearAllMmlBtn = $("clearAllMmlBtn");
  const pasteBtn = $("pasteBtn");
  const saveBtn = $("saveBtn");
  const midiExtractBtn = $("midiExtractBtn");
  const rhythmGameBtn = $("rhythmGameBtn");
  const simpleVersionBtn = $("simpleVersionBtn");
  const rhythmGameLayer = $("rhythmGameLayer");
  const rhythmGameClose = $("rhythmGameClose");
  const rhythmGameFrame = $("rhythmGameFrame");
  const rhythmGameStatus = $("rhythmGameStatus");
  const rhythmGameLoading = $("rhythmGameLoading");
  const rhythmGameLoadingText = $("rhythmGameLoadingText");
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
  const bulkVolumeStats = $("bulkVolumeStats");
  const bulkVolumeApply = $("bulkVolumeApply");
  const bulkVolumeCancel = $("bulkVolumeCancel");
  const bulkVolumeSelectAll = $("bulkVolumeSelectAll");
  const bulkVolumeSelectNone = $("bulkVolumeSelectNone");
  const bulkPitchBtn = $("bulkPitchBtn");
  const bulkPitchDialog = $("bulkPitchDialog");
  const bulkPitchForm = $("bulkPitchForm");
  const bulkPitchAmount = $("bulkPitchAmount");
  const bulkPitchStats = $("bulkPitchStats");
  const bulkPitchApply = $("bulkPitchApply");
  const bulkPitchCancel = $("bulkPitchCancel");
  const bulkPitchSelectAll = $("bulkPitchSelectAll");
  const bulkPitchSelectNone = $("bulkPitchSelectNone");
  const dynamicsGenerateBtn = $("dynamicsGenerateBtn");
  const dynamicsGenerateDialog = $("dynamicsGenerateDialog");
  const dynamicsGenerateForm = $("dynamicsGenerateForm");
  const dynamicsGenerateGenre = $("dynamicsGenerateGenre");
  const dynamicsGenerateStrength = $("dynamicsGenerateStrength");
  const dynamicsGenerateRuleTitle = $("dynamicsGenerateRuleTitle");
  const dynamicsGenerateRuleText = $("dynamicsGenerateRuleText");
  const dynamicsGenerateStatus = $("dynamicsGenerateStatus");
  const dynamicsGenerateSelectAll = $("dynamicsGenerateSelectAll");
  const dynamicsGenerateSelectNone = $("dynamicsGenerateSelectNone");
  const dynamicsGenerateApply = $("dynamicsGenerateApply");
  const dynamicsGenerateCancel = $("dynamicsGenerateCancel");
  const dynamicsGenerateConfirmDialog = $("dynamicsGenerateConfirmDialog");
  const dynamicsGenerateConfirmList = $("dynamicsGenerateConfirmList");
  const dynamicsGenerateConfirmApply = $("dynamicsGenerateConfirmApply");
  const dynamicsGenerateConfirmCancel = $("dynamicsGenerateConfirmCancel");
  let pendingDynamicsGenerateOptions = null;
  const leadingSilenceBtn = $("leadingSilenceBtn");
  const leadingSilenceDialog = $("leadingSilenceDialog");
  const leadingSilenceSeconds = $("leadingSilenceSeconds");
  const leadingSilenceApply = $("leadingSilenceApply");
  const leadingSilenceCancel = $("leadingSilenceCancel");
  const accompanimentGenerateBtn = $("accompanimentGenerateBtn");
  const accompanimentGenerateDialog = $("accompanimentGenerateDialog");
  const accompanimentGenerateForm = $("accompanimentGenerateForm");
  const accompanimentGenerateGenre = $("accompanimentGenerateGenre");
  const accompanimentGenerateStrength = $("accompanimentGenerateStrength");
  const accompanimentGenerateStatus = $("accompanimentGenerateStatus");
  const accompanimentGenerateRuleTitle = $("accompanimentGenerateRuleTitle");
  const accompanimentGenerateRuleText = $("accompanimentGenerateRuleText");
  const accompanimentAnalysisSelectAll = $("accompanimentAnalysisSelectAll");
  const accompanimentAnalysisSelectNone = $("accompanimentAnalysisSelectNone");
  const accompanimentTargetSelectAll = $("accompanimentTargetSelectAll");
  const accompanimentTargetSelectNone = $("accompanimentTargetSelectNone");
  const accompanimentGenerateApply = $("accompanimentGenerateApply");
  const accompanimentGenerateCancel = $("accompanimentGenerateCancel");
  const accompanimentGenerateConfirmDialog = $("accompanimentGenerateConfirmDialog");
  const accompanimentGenerateConfirmList = $("accompanimentGenerateConfirmList");
  const accompanimentGenerateConfirmApply = $("accompanimentGenerateConfirmApply");
  const accompanimentGenerateConfirmCancel = $("accompanimentGenerateConfirmCancel");
  let pendingAccompanimentGenerateOptions = null;
  const midiConvertDialog = $("midiConvertDialog");
  const midiConvertTitle = $("midiConvertTitle");
  const midiConvertSummary = $("midiConvertSummary");
  const midiGuideBox = $("midiGuideBox");
  const midiGuideLead = $("midiGuideLead");
  const midiFullPreviewBtn = $("midiFullPreviewBtn");
  const midiSelectedPreviewBtn = $("midiSelectedPreviewBtn");
  const midiBulkAssignBtn = $("midiBulkAssignBtn");
  const midiBulkAssignDialog = $("midiBulkAssignDialog");
  const midiBulkChannelButtons = Array.from(document.querySelectorAll(".midi-bulk-channel"));
  const midiBulkAllBtn = $("midiBulkAllBtn");
  const midiBulkInstrumentButtons = Array.from(document.querySelectorAll(".midi-bulk-instrument"));
  const midiBulkAllInstrumentBtn = $("midiBulkAllInstrumentBtn");
  const midiBulkSelectBtn = $("midiBulkSelectBtn");
  const midiBulkClearBtn = $("midiBulkClearBtn");
  const midiBulkCancelBtn = $("midiBulkCancelBtn");
  const midiChannelList = $("midiChannelList");
  const midiRoleList = $("midiRoleList");
  const midiQuantizeToggle = $("midiQuantizeToggle");
  const midiInstrumentPanelTitle = $("midiInstrumentPanelTitle");
  const midiConvertReloadFile = $("midiConvertReloadFile");
  const midiConvertGoogleDriveLoad = $("midiConvertGoogleDriveLoad");
  const midiConvertApply = $("midiConvertApply");
  const midiConvertCancel = $("midiConvertCancel");
  const midiConvertStatus = $("midiConvertStatus");
  const themeToggleBtn = $("themeToggleBtn");
  const themeModeText = $("themeModeText");
  const charCount = $("charCount");
  const partSoundBtn = $("partSoundBtn");
  const partSoundDialog = $("partSoundDialog");
  const partSoundRows = $("partSoundRows");
  const partSoundCancel = $("partSoundCancel");
  const partSoundApply = $("partSoundApply");
  const partSoundPresetSelect = $("partSoundPresetSelect");
  const partSoundPresetSave = $("partSoundPresetSave");
  const partSoundPresetDelete = $("partSoundPresetDelete");
  const muteControlButton = $("muteControlButton");
  const muteControlPopover = $("muteControlPopover");
  const muteControlValue = $("muteControlValue");
  const muteSelectAll = $("muteSelectAll");
  const muteSelectNone = $("muteSelectNone");
  const muteChannelCheckboxes = Array.from(document.querySelectorAll("[data-mute-part]"));
  const partMuteLabel = $("partMuteLabel");
  const mainMml = $("mainMml");
  const mainMmlHighlight = $("mainMmlHighlight");
  const partTexts = PART_LABELS.map((_, i) => $(`part${i}`));
  const partMmlHighlights = PART_LABELS.map((_, i) => $(`part${i}Highlight`));
  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".mml-panel"));

  let audioCtx = null;
  let masterGain = null;
  let partPlaybackGains = [];
  let soundFont = null;
  let defaultSoundFont = null;
  let sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
  let soundFontIsDefault = true;
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
  let scheduleCacheVersion = 0;
  let currentOffset = 0;
  let pianoRollExpanded = false;
  let pianoRollKeyMin = 48;
  let pianoRollKeyMax = 72;
  let pianoRollLastRenderBucket = -1;
  let pianoRollLastDataSignature = "";
  let pianoRollVisibleCacheSignature = "";
  let pianoRollVisibleCache = [];
  let pianoRollRefreshRaf = 0;
  let pianoRollRefreshSettleTimer = 0;
  let pianoRollResizeObserver = null;
  let pianoRollHoveredTempoMarker = null;
  let selectedTempoMarker = null;
  let tempoEditResumePlayback = false;
  let tempoEditResumeOffset = 0;
  let tempoEditSuppressCloseResume = false;
  let pendingTempoSimplification = null;
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
  const midiInstrumentSectionOpenState = new Map();
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
  let midiPartPresetName = defaultMidiSoundPresetLabel();
  let userSoundPresets = [];
  let partMuteStates = Array.from({ length: 6 }, () => false);
  let googleTokenClient = null;
  let googleAccessToken = "";
  let googleTokenExpiresAt = 0;
  let googleTokenExpiryTimer = 0;
  let googlePickerLoaded = false;
  let googleSettingsFileId = "";
  let googleSoundBankFileId = "";
  let googleSoundBankSyncing = false;
  let googleSoundBankSyncQueue = Promise.resolve();
  let googleSettingsApplying = false;
  let googleSettingsSaveTimer = 0;
  let googleSettingsSaving = false;
  let googleDriveMmlFileName = "";
  let googleDriveMmlFolderId = "";
  let googleDriveSaveFolderId = "";
  let googleDriveSaveFolderName = "";
  let googleUserProfile = null;
  let googleUserProfileToken = "";
  let googleUserProfilePromise = null;
  let suggestedMmlSaveFileName = "";
  let pendingMmiImport = null;
  let activePlaybackCodeSignature = "";
  let activePlaybackScanBucket = -1;
  let activePlaybackScanSignature = "";
  let activePlaybackMainRanges = [];
  let activePlaybackPartRanges = Array.from({ length: 6 }, () => []);
  let editorContentVersion = 0;
  let editorAnalysisCache = {
    source: "",
    parts: null,
    parsed: null,
    schedule: null,
    volumeCounts: null
  };
  let mainHighlightRenderSignature = "";
  let partHighlightRenderSignatures = Array.from({ length: 6 }, () => "");
  const googlePickerSuspendedCloseDialogs = new WeakSet();
  let googlePickerLayerWatchTimer = 0;
  let googlePickerLayerObserver = null;
  let rhythmGameFrameReady = false;
  let rhythmGamePendingPayload = null;
  let rhythmGameLoadTimer = 0;
  let rhythmGamePayloadPending = false;

  void init();

  async function init() {
    try { await window.MobibardI18n?.ready; } catch (_) {}
    loadThemePref();
    loadPlaybackPrefs();
    loadPianoRollPrefs();
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
    languageSelect?.addEventListener("change", () => void handleLanguageChange());
    accountMenuButton?.addEventListener("click", toggleAccountMenu);
    document.addEventListener("pointerdown", handleAccountMenuOutsidePointer);
    document.addEventListener("keydown", handleAccountMenuKeydown);
    document.addEventListener("pointerdown", handleControlPopoverOutsidePointer);
    document.addEventListener("keydown", handleControlPopoverKeydown);
    window.addEventListener("mobibard:localechange", handleLocaleChange);
    updateSimpleVersionLink();
    if (accountAvatarImg) {
      accountAvatarImg.addEventListener("error", () => {
        const current = accountAvatarImg.getAttribute("src") || "";
        if (!current.endsWith(GUEST_AVATAR_URL)) accountAvatarImg.src = GUEST_AVATAR_URL;
      });
    }
    googleLoginBtn?.addEventListener("click", () => void handleGoogleLoginButton());
    googleDriveLoadBtn?.addEventListener("click", () => void openGoogleDrivePicker());
    googleDriveSaveBtn?.addEventListener("click", () => void saveMmlToGoogleDrive());
    codeHelpBtn?.addEventListener("click", () => openCodeHelpDialog());
    codeHelpClose?.addEventListener("click", () => codeHelpDialog?.close());
    mmiFullPreviewBtn?.addEventListener("click", () => void toggleMmiSelectedPreview());
    mmiAllPreviewBtn?.addEventListener("click", () => void toggleMmiAllPreview());
    mmiImportClear?.addEventListener("click", () => clearMmiImportSelection());
    mmiImportReloadFile?.addEventListener("click", () => openSourceFilePicker());
    mmiImportGoogleDriveLoad?.addEventListener("click", () => void openGoogleDrivePicker());
    mmiImportCancel?.addEventListener("click", () => closeMmiImportDialog(null));
    mmiImportApply?.addEventListener("click", () => applyMmiImportDialog());
    mmiImportDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      stopMidiPreview();
      closeMmiImportDialog(null);
    });
    mmiImportDialog?.addEventListener("close", () => {
      stopMidiPreview();
      if (googlePickerSuspendedCloseDialogs.has(mmiImportDialog)) {
        googlePickerSuspendedCloseDialogs.delete(mmiImportDialog);
        return;
      }
      if (pendingMmiImport) resolveMmiImportDialog(null);
    });
    sf2File?.addEventListener("change", () => { if (sf2File.files?.[0]) void loadUserSf2(); });
    soundFontLoadBtn?.addEventListener("click", openSf2Picker);
    soundFontResetBtn?.addEventListener("click", () => void restoreDefaultSoundFont());
    playToggleBtn.addEventListener("click", () => { isPlaying ? stopPlayback(false) : void playFromCurrent(); });
    rewindBtn.addEventListener("click", () => void rewindToStart());
    loopPlayback?.addEventListener("change", () => writePref("loop", loopPlayback.checked ? "1" : "0"));
    speedControlButton?.addEventListener("click", () => toggleControlPopover(speedControlButton, speedControlPopover));
    volumeControlButton?.addEventListener("click", () => toggleControlPopover(volumeControlButton, volumeControlPopover));
    muteControlButton?.addEventListener("click", () => toggleControlPopover(muteControlButton, muteControlPopover));
    speedResetBtn?.addEventListener("click", resetPlaybackSpeed);
    volumeResetBtn?.addEventListener("click", resetOutputVolume);
    speedSlider?.addEventListener("input", applyPlaybackSpeed);
    speedSlider?.addEventListener("change", applyPlaybackSpeed);
    volumeSlider?.addEventListener("input", applyOutputVolume);
    progressSlider.addEventListener("pointerdown", () => { isSeeking = true; });
    progressSlider.addEventListener("pointerup", () => { isSeeking = false; handleSeekInput(true); });
    progressSlider.addEventListener("touchend", () => { isSeeking = false; handleSeekInput(true); }, { passive: true });
    progressSlider.addEventListener("input", () => handleSeekInput(false));
    progressSlider.addEventListener("change", () => handleSeekInput(true));
    tempoMarkerLayer?.addEventListener("click", handleTempoMarkerLayerClick);
    tempoEditApply?.addEventListener("click", applyTempoEditFromDialog);
    tempoEditForm?.addEventListener("submit", event => { event.preventDefault(); applyTempoEditFromDialog(); });
    tempoEditCancel?.addEventListener("click", () => tempoEditDialog?.close());
    tempoEditBpm?.addEventListener("change", normalizeTempoEditBpmInput);
    tempoEditBpm?.addEventListener("blur", normalizeTempoEditBpmInput);
    tempoEditDialog?.addEventListener("close", () => {
      selectedTempoMarker = null;
      if (!tempoEditSuppressCloseResume) resumePlaybackAfterTempoEdit();
    });
    tempoSimplifyBtn?.addEventListener("click", openTempoSimplifyDialog);
    tempoSimplifyApply?.addEventListener("click", applyTempoSimplificationFromDialog);
    tempoSimplifyCancel?.addEventListener("click", closeTempoSimplifyDialog);
    tempoSimplifyDialog?.addEventListener("close", () => { pendingTempoSimplification = null; });
    pianoRoll?.addEventListener("click", handlePianoRollClick);
    pianoRoll?.addEventListener("pointermove", handlePianoRollPointerMove);
    pianoRoll?.addEventListener("pointerleave", clearPianoRollTempoHover);
    pianoRoll?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePianoRoll();
      }
    });
    installPianoRollRefreshHooks();
    copyBtn.addEventListener("click", () => {
      trackAnalytics("copy_all_mml");
      void copyVisibleMml();
    });
    clearAllMmlBtn?.addEventListener("click", clearAllMmlChannels);
    splitCopyBtn?.addEventListener("click", () => {
      trackAnalytics("split_copy_open");
      openSplitCopyDialog();
    });
    splitCopyRebuild?.addEventListener("click", () => buildSplitCopyPages());
    splitCopyClose?.addEventListener("click", () => splitCopyDialog?.close());
    splitCopyDialog?.addEventListener("close", () => stopMidiPreview());
    pasteBtn.addEventListener("click", () => void pasteVisibleMml());
    saveBtn.addEventListener("click", () => void saveVisibleMml());
    midiExtractBtn?.addEventListener("click", () => {
      trackAnalytics("open_midi_extract_online");
      const midiExtractWindow = window.open("https://muscriptor.kyutai.org/", "_blank");
      if (midiExtractWindow) midiExtractWindow.opener = null;
    });
    rhythmGameBtn?.addEventListener("click", () => {
      trackAnalytics("open_rhythm_game");
      openRhythmGameLayer();
    });
    rhythmGameClose?.addEventListener("click", closeRhythmGameLayer);
    rhythmGameFrame?.addEventListener("load", handleRhythmGameFrameLoad);
    window.addEventListener("message", handleRhythmGameMessage);
    restTrimBtn?.addEventListener("click", openRestTrimDialog);
    restTrimApply?.addEventListener("click", () => applyRestTrimFromDialog());
    restTrimCancel?.addEventListener("click", () => restTrimDialog?.close());
    restTrimLimit?.addEventListener("change", updateRestTrimPreview);
    restTrimSelectAll?.addEventListener("click", () => setDialogChannelSelection(".rest-trim-channel", true));
    restTrimSelectNone?.addEventListener("click", () => setDialogChannelSelection(".rest-trim-channel", false));
    bulkVolumeBtn?.addEventListener("click", openBulkVolumeDialog);
    bulkVolumeApply?.addEventListener("click", () => applyBulkVolumeFromDialog());
    bulkVolumeCancel?.addEventListener("click", () => bulkVolumeDialog?.close());
    bulkVolumeSelectAll?.addEventListener("click", () => {
      setDialogChannelSelection(".bulk-volume-channel", true);
      updateBulkVolumeStats();
    });
    bulkVolumeSelectNone?.addEventListener("click", () => {
      setDialogChannelSelection(".bulk-volume-channel", false);
      updateBulkVolumeStats();
    });
    document.querySelectorAll(".bulk-volume-channel").forEach(input => {
      input.addEventListener("change", updateBulkVolumeStats);
    });
    bulkVolumeAmount?.addEventListener("change", normalizeBulkVolumeAmountInput);
    bulkPitchBtn?.addEventListener("click", openBulkPitchDialog);
    bulkPitchApply?.addEventListener("click", applyBulkPitchFromDialog);
    bulkPitchForm?.addEventListener("submit", event => { event.preventDefault(); applyBulkPitchFromDialog(); });
    bulkPitchCancel?.addEventListener("click", () => bulkPitchDialog?.close());
    bulkPitchSelectAll?.addEventListener("click", () => setDialogChannelSelection(".bulk-pitch-channel", true));
    bulkPitchSelectNone?.addEventListener("click", () => setDialogChannelSelection(".bulk-pitch-channel", false));
    bulkPitchAmount?.addEventListener("change", normalizeBulkPitchAmountInput);
    bulkPitchAmount?.addEventListener("blur", normalizeBulkPitchAmountInput);
    dynamicsGenerateBtn?.addEventListener("click", openDynamicsGenerateDialog);
    dynamicsGenerateGenre?.addEventListener("change", updateDynamicsGenerateDescription);
    dynamicsGenerateApply?.addEventListener("click", applyDynamicsGenerateFromDialog);
    dynamicsGenerateForm?.addEventListener("submit", event => { event.preventDefault(); applyDynamicsGenerateFromDialog(); });
    dynamicsGenerateCancel?.addEventListener("click", () => dynamicsGenerateDialog?.close());
    dynamicsGenerateConfirmApply?.addEventListener("click", confirmDynamicsGenerateOverwrite);
    dynamicsGenerateConfirmCancel?.addEventListener("click", cancelDynamicsGenerateOverwrite);
    dynamicsGenerateConfirmDialog?.addEventListener("cancel", event => {
      event.preventDefault();
      cancelDynamicsGenerateOverwrite();
    });
    dynamicsGenerateSelectAll?.addEventListener("click", () => setDialogChannelSelection(".dynamics-generate-channel", true));
    dynamicsGenerateSelectNone?.addEventListener("click", () => setDialogChannelSelection(".dynamics-generate-channel", false));
    leadingSilenceBtn?.addEventListener("click", openLeadingSilenceDialog);
    leadingSilenceApply?.addEventListener("click", () => applyLeadingSilenceFromDialog());
    leadingSilenceCancel?.addEventListener("click", () => leadingSilenceDialog?.close());
    accompanimentGenerateBtn?.addEventListener("click", openAccompanimentGenerateDialog);
    accompanimentGenerateGenre?.addEventListener("change", updateAccompanimentGenerateDescription);
    accompanimentGenerateApply?.addEventListener("click", () => void applyAccompanimentGenerateFromDialog());
    accompanimentGenerateForm?.addEventListener("submit", event => { event.preventDefault(); void applyAccompanimentGenerateFromDialog(); });
    accompanimentGenerateCancel?.addEventListener("click", () => accompanimentGenerateDialog?.close());
    accompanimentAnalysisSelectAll?.addEventListener("click", () => setDialogChannelSelection(".accompaniment-analysis-channel", true));
    accompanimentAnalysisSelectNone?.addEventListener("click", () => setDialogChannelSelection(".accompaniment-analysis-channel", false));
    accompanimentTargetSelectAll?.addEventListener("click", () => setDialogChannelSelection(".accompaniment-target-channel", true));
    accompanimentTargetSelectNone?.addEventListener("click", () => setDialogChannelSelection(".accompaniment-target-channel", false));
    accompanimentGenerateConfirmApply?.addEventListener("click", () => void confirmAccompanimentGeneration());
    accompanimentGenerateConfirmCancel?.addEventListener("click", cancelAccompanimentGeneration);
    accompanimentGenerateConfirmDialog?.addEventListener("cancel", event => {
      event.preventDefault();
      cancelAccompanimentGeneration();
    });
    partSoundBtn?.addEventListener("click", () => void openPartSoundDialog());
    partSoundCancel?.addEventListener("click", () => partSoundDialog?.close());
    partSoundApply?.addEventListener("click", () => applyPartSoundDialog());
    partSoundPresetSelect?.addEventListener("change", () => applyPartSoundPresetToDraft(partSoundPresetSelect.value));
    partSoundPresetSave?.addEventListener("click", () => saveDraftSoundPreset());
    partSoundPresetDelete?.addEventListener("click", () => deleteSelectedSoundPreset());
    muteSelectAll?.addEventListener("click", () => setAllPartMuteStates(true));
    muteSelectNone?.addEventListener("click", () => setAllPartMuteStates(false));
    for (const checkbox of muteChannelCheckboxes) checkbox.addEventListener("change", handleMuteChannelChange);
    leadingSilenceSeconds?.addEventListener("change", normalizeLeadingSilenceSecondsInput);
    leadingSilenceSeconds?.addEventListener("blur", normalizeLeadingSilenceSecondsInput);
    midiQuantizeToggle?.addEventListener("click", toggleMidiQuantizeDivision);
    midiSelectedPreviewBtn?.addEventListener("click", () => void toggleMidiSelectedPreview());
    midiFullPreviewBtn?.addEventListener("click", () => void toggleMidiFullPreview());
    midiBulkAssignBtn?.addEventListener("click", openMidiBulkAssignDialog);
    for (const button of midiBulkChannelButtons) {
      button.addEventListener("click", () => {
        const selected = button.getAttribute("aria-pressed") !== "true";
        setMidiBulkChannelButtonState(button, selected);
        updateMidiBulkAllButtonState();
      });
    }
    midiBulkAllBtn?.addEventListener("click", () => {
      const shouldSelectAll = !midiBulkChannelButtons.every(button => button.getAttribute("aria-pressed") === "true");
      for (const button of midiBulkChannelButtons) setMidiBulkChannelButtonState(button, shouldSelectAll);
      updateMidiBulkAllButtonState();
    });
    for (const button of midiBulkInstrumentButtons) {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const selected = button.getAttribute("aria-pressed") !== "true";
        setMidiBulkChannelButtonState(button, selected);
        updateMidiBulkAllInstrumentButtonState();
      });
    }
    midiBulkAllInstrumentBtn?.addEventListener("click", () => {
      const availableButtons = midiBulkInstrumentButtons.filter(button => !button.disabled);
      if (!availableButtons.length) return;
      const shouldSelectAll = !availableButtons.every(button => button.getAttribute("aria-pressed") === "true");
      for (const button of availableButtons) setMidiBulkChannelButtonState(button, shouldSelectAll);
      updateMidiBulkAllInstrumentButtonState();
    });
    midiBulkClearBtn?.addEventListener("click", () => applyMidiBulkAssignment(false));
    midiBulkSelectBtn?.addEventListener("click", () => applyMidiBulkAssignment(true));
    midiBulkCancelBtn?.addEventListener("click", () => midiBulkAssignDialog?.close());
    midiConvertReloadFile?.addEventListener("click", () => { if (!midiConvertBusy) openSourceFilePicker(); });
    midiConvertGoogleDriveLoad?.addEventListener("click", () => { if (!midiConvertBusy) void openGoogleDrivePicker(); });
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
      requestPianoRollRefresh(true);
    });
    partSoundDialog?.addEventListener("close", () => stopMidiPreview());
    themeToggleBtn?.addEventListener("click", toggleTheme);
    mainMml.addEventListener("paste", handleEditorMmlPaste);
    mainMml.addEventListener("input", () => {
      normalizeTextareaCommands(mainMml);
      syncPartsFromMain();
    });
    mainMml.addEventListener("scroll", syncHighlightScroll);
    partTexts.forEach((t, i) => {
      t.addEventListener("paste", handleEditorMmlPaste);
      t.addEventListener("input", () => {
        normalizeTextareaCommands(t);
        syncMainFromParts();
      });
      t.addEventListener("scroll", () => syncPartHighlightScroll(i));
    });
    tabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
    // 이전 MML 편집 초안 캐시는 더 이상 사용하지 않는다.
    // MIDI/파일 불러오기 설정 캐시(midiConvertLastSettings)는 별도 키이므로 유지한다.
    try { localStorage.removeItem(PREF_PREFIX + "mmlDraft"); } catch (_) {}
    await restoreCachedSoundBankFromLocal();
    normalizeTextareaCommands(mainMml);
    syncPartsFromMain();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updateSoundFontUi();
    updateSoundPresetControls();
    updatePartMuteControl();
    updateGoogleDriveControls();
    scheduleGoogleAutoReconnect();
    updateCharCount();
    rebuildSchedulePreviewSilently();
    requestPianoRollRefresh(true);
  }

  function updateSimpleVersionLink(language = "") {
    if (!simpleVersionBtn) return;
    const requested = window.MobibardI18n?.normalizeLanguage(language || languageSelect?.value || document.documentElement.lang) || "en";
    try {
      const url = new URL("../simple/index.html", window.location.href);
      url.searchParams.set("lang", requested);
      simpleVersionBtn.href = url.href;
    } catch (_) {
      simpleVersionBtn.href = `../simple/index.html?lang=${encodeURIComponent(requested)}`;
    }
  }

  async function handleLanguageChange() {
    if (!languageSelect) return;
    const requested = window.MobibardI18n?.normalizeLanguage(languageSelect.value) || "en";
    writePref("language", requested);
    const applied = await window.MobibardI18n?.setLanguage(requested, { persist: false, source: "user" });
    updateSimpleVersionLink(applied || requested);
  }

  function i18nText(key, values = []) {
    return window.MobibardI18n?.t?.(key, values) || String(key);
  }

  function defaultMidiSoundPresetLabel() {
    return i18nText(DEFAULT_MIDI_SOUND_PRESET_KEY);
  }

  function setAccountMenuOpen(open) {
    if (!accountMenu || !accountMenuButton) return;
    const next = Boolean(open);
    if (next) closeAllControlPopovers();
    accountMenu.hidden = !next;
    accountMenuButton.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      updateAccountUi();
      if (isGoogleConnected()) void loadGoogleUserProfile();
    }
  }

  function toggleAccountMenu() {
    setAccountMenuOpen(Boolean(accountMenu?.hidden));
  }

  function handleAccountMenuOutsidePointer(event) {
    if (accountMenu?.hidden) return;
    if (event?.target?.closest?.(".account-menu-wrap")) return;
    setAccountMenuOpen(false);
  }

  function handleAccountMenuKeydown(event) {
    if (event?.key !== "Escape" || accountMenu?.hidden) return;
    event.preventDefault();
    setAccountMenuOpen(false);
    accountMenuButton?.focus();
  }

  function getControlPopoverPairs() {
    return [
      [speedControlButton, speedControlPopover],
      [volumeControlButton, volumeControlPopover],
      [muteControlButton, muteControlPopover]
    ].filter(([button, popover]) => button && popover);
  }

  function closeAllControlPopovers(exceptPopover = null) {
    for (const [button, popover] of getControlPopoverPairs()) {
      if (popover === exceptPopover) continue;
      popover.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  }

  function positionControlPopover(popover) {
    if (!popover || popover.hidden) return;
    const viewportPadding = 8;
    popover.classList.remove("place-below");
    popover.style.removeProperty("--popover-shift-x");

    let rect = popover.getBoundingClientRect();
    if (rect.top < viewportPadding) {
      popover.classList.add("place-below");
      rect = popover.getBoundingClientRect();
    }

    let shiftX = 0;
    if (rect.left < viewportPadding) shiftX = viewportPadding - rect.left;
    if (rect.right > window.innerWidth - viewportPadding) {
      shiftX += window.innerWidth - viewportPadding - rect.right;
    }
    if (shiftX) popover.style.setProperty("--popover-shift-x", `${Math.round(shiftX)}px`);
  }

  function setControlPopoverOpen(button, popover, open) {
    if (!button || !popover) return;
    const next = Boolean(open);
    if (next) {
      setAccountMenuOpen(false);
      closeAllControlPopovers(popover);
    }
    popover.hidden = !next;
    button.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      requestAnimationFrame(() => {
        positionControlPopover(popover);
        popover.querySelector('a[href], input, button, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
      });
    } else {
      popover.classList.remove("place-below");
      popover.style.removeProperty("--popover-shift-x");
    }
  }

  function toggleControlPopover(button, popover) {
    setControlPopoverOpen(button, popover, Boolean(popover?.hidden));
  }

  function handleControlPopoverOutsidePointer(event) {
    if (event?.target?.closest?.(".compact-control-wrap")) return;
    closeAllControlPopovers();
  }

  function handleControlPopoverKeydown(event) {
    if (event?.key !== "Escape") return;
    const openPair = getControlPopoverPairs().find(([, popover]) => !popover.hidden);
    if (!openPair) return;
    event.preventDefault();
    closeAllControlPopovers();
    openPair[0]?.focus();
  }

  function handleLocaleChange(event) {
    updateSimpleVersionLink(event?.detail?.language || "");
    applyTheme(document.documentElement.dataset.theme, false);
    updateAccountUi();
    updateGoogleDriveControls();
    updatePlayButton();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updatePartMuteControl();
    updateSoundFontUi();
    updateSoundPresetControls();
    if (bulkVolumeDialog?.open) updateBulkVolumeStats();
    if (tempoSimplifyDialog?.open && pendingTempoSimplification) updateTempoSimplifyPreview(pendingTempoSimplification);
    if (mmiImportDialog?.open) updateMmiImportSelectionState();
    if (pianoRollEmpty && !pianoRollEmpty.hidden && pianoRollRangeLabel) {
      pianoRollRangeLabel.textContent = i18nText("roll.title");
    }
    if (midiConvertDialog?.open) refreshMidiConvertLocale();
  }

  function trackAnalytics(eventName, params = {}) {
    const aliases = {
      local_import_mml: "mml_import_complete",
      drive_import_mml: "mml_import_complete",
      midi_convert_complete: "mml_import_complete",
      copy_all_mml: "copy_all_mml",
      split_copy_open: "split_copy",
      open_midi_extract_online: "open_midi_extract",
      open_rhythm_game: "open_rhythm_game"
    };
    const normalized = aliases[String(eventName || "")];
    if (!normalized) return false;
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(normalized, params);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function openHeaderShortcutLink() {
    if (!midiSiteLinks) return;
    const url = midiSiteLinks.value;
    midiSiteLinks.value = "";
    if (!url || !HEADER_SHORTCUT_LINKS.has(url)) return;

    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      try { opened.opener = null; } catch (_) {}
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
      midiPartPresetName = readPref("midiPartPresetName") || defaultMidiSoundPresetLabel();
    } catch (_) {
      midiPartPresetKeys = null;
      midiPartPresetName = defaultMidiSoundPresetLabel();
    }
  }

  function saveMidiPartSoundPresetPrefs() {
    if (!Array.isArray(midiPartPresetKeys)) return;
    midiPartPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
    writePref("midiPartPresetKeys", JSON.stringify(midiPartPresetKeys));
    writePref("midiPartPresetName", midiPartPresetName || defaultMidiSoundPresetLabel());
  }

  function loadPianoRollPrefs() {
    pianoRollExpanded = readPref("pianoRollExpanded") === "1";
    applyPianoRollExpandedState(false);
  }

  function togglePianoRoll() {
    pianoRollExpanded = !pianoRollExpanded;
    applyPianoRollExpandedState(true);
    requestPianoRollRefresh(true);
  }

  function handlePianoRollClick(event) {
    const toggleControl = event?.target?.closest?.(".piano-roll-corner");
    if (toggleControl && pianoRoll?.contains(toggleControl)) {
      event.preventDefault();
      event.stopPropagation();
      togglePianoRoll();
      return;
    }

    // 템포 가로선은 순수 표시 요소다. 왼쪽의 T숫자 라벨만 편집 버튼으로 동작한다.
    const marker = findPianoRollTempoMarkerAtEvent(event);
    if (marker) {
      event.preventDefault();
      event.stopPropagation();
      openTempoEditDialog(marker);
      return;
    }
    togglePianoRoll();
  }

  function handlePianoRollPointerMove(event) {
    const toggleControl = event?.target?.closest?.(".piano-roll-corner");
    const marker = toggleControl ? null : findPianoRollTempoMarkerAtEvent(event);
    if (marker === pianoRollHoveredTempoMarker) return;
    pianoRollHoveredTempoMarker = marker;
    pianoRoll?.classList.toggle("tempo-label-hover", Boolean(marker));
    requestPianoRollRefresh(false);
  }

  function clearPianoRollTempoHover() {
    if (!pianoRollHoveredTempoMarker) return;
    pianoRollHoveredTempoMarker = null;
    pianoRoll?.classList.remove("tempo-label-hover");
    requestPianoRollRefresh(false);
  }

  function findPianoRollTempoMarkerAtEvent(event) {
    const stage = pianoRoll?.querySelector?.(".piano-roll-stage");
    const markers = Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : [];
    if (!stage || !markers.length) return null;

    const rect = stage.getBoundingClientRect();
    const x = Number(event?.clientX) - rect.left;
    const y = Number(event?.clientY) - rect.top;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

    const keyHeight = Math.min(getPianoRollKeyHeight(), Math.max(18, rect.height * 0.72));
    const fallAreaHeight = Math.max(12, rect.height - keyHeight);
    if (y > fallAreaHeight + 7) return null;

    const duration = scheduleCache?.duration || Number(progressSlider?.max) || 0;
    const current = Math.max(0, Math.min(duration || Infinity, Number(currentOffset) || 0));
    const fallWindow = pianoRollExpanded ? PIANO_ROLL_FALL_WINDOW_EXPANDED : PIANO_ROLL_FALL_WINDOW_COLLAPSED;
    const pxPerSec = fallAreaHeight / fallWindow;
    const visibleEnd = current + fallWindow;
    let best = null;
    let bestDistance = Infinity;

    for (const marker of markers) {
      const time = Math.max(0, Number(marker?.time) || 0);
      if (time < current - 0.03 || time > visibleEnd + 0.03) continue;
      const rawY = fallAreaHeight - ((time - current) * pxPerSec);
      if (rawY < -1 || rawY > fallAreaHeight + 1) continue;
      const lineY = Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(rawY) + 0.5));
      const bpm = Math.max(1, Math.round(Number(marker?.bpm) || 120));
      const labelWidth = measurePianoRollTempoLabelWidth(bpm);
      const labelHeight = 17;
      const labelX = 5;
      const labelY = Math.max(2, Math.min(fallAreaHeight - labelHeight - 2, lineY - labelHeight - 2));
      const labelHit = x >= labelX - 3 && x <= labelX + labelWidth + 3 && y >= labelY - 3 && y <= labelY + labelHeight + 3;
      if (labelHit && 0 < bestDistance) {
        best = marker;
        bestDistance = 0;
      }
    }
    return best;
  }


  function measurePianoRollTempoLabelWidth(bpm) {
    const fallback = Math.max(31, 7 * String(`T${bpm}`).length + 12);
    if (!(pianoRollCanvas instanceof HTMLCanvasElement)) return fallback;
    const ctx = pianoRollCanvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.save();
    ctx.font = `950 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const width = Math.ceil(ctx.measureText(`T${bpm}`).width) + 12;
    ctx.restore();
    return Math.max(31, width);
  }

  function applyPianoRollExpandedState(persist) {
    if (!pianoRoll) return;
    pianoRoll.classList.toggle("expanded", pianoRollExpanded);
    pianoRoll.setAttribute("aria-expanded", pianoRollExpanded ? "true" : "false");
    pianoRoll.setAttribute("aria-label", pianoRollExpanded ? i18nText("roll.collapse") : i18nText("roll.expand"));
    pianoRoll.title = pianoRollExpanded ? i18nText("roll.collapse_help") : i18nText("roll.expand_help");
    if (pianoRollToggleLabel) pianoRollToggleLabel.textContent = pianoRollExpanded ? i18nText("ui.collapse") : i18nText("ui.expand");
    if (persist) writePref("pianoRollExpanded", pianoRollExpanded ? "1" : "0");
  }

  function getPianoRollRenderDuration() {
    return scheduleCache?.duration || Number(progressSlider?.max) || 0;
  }

  function requestPianoRollRefresh(settle = false) {
    if (!pianoRoll || !pianoRollCanvas) return;

    const run = () => updatePianoRoll(currentOffset, getPianoRollRenderDuration(), true);
    const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
    const caf = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);

    if (pianoRollRefreshRaf) caf(pianoRollRefreshRaf);
    pianoRollRefreshRaf = raf(() => {
      pianoRollRefreshRaf = 0;
      run();
      // 레이아웃 계산 직후 한 번 더 그려서 접힘/펼침 직후 캔버스 비율이 늘어나 보이는 현상을 줄인다.
      raf(run);
    });

    if (settle) {
      clearTimeout(pianoRollRefreshSettleTimer);
      pianoRollRefreshSettleTimer = setTimeout(run, 240);
    }
  }

  function installPianoRollRefreshHooks() {
    const stage = pianoRoll?.querySelector(".piano-roll-stage");
    if (!stage) return;

    if (typeof ResizeObserver === "function") {
      try { pianoRollResizeObserver?.disconnect?.(); } catch (_) {}
      let lastWidth = -1;
      let lastHeight = -1;
      pianoRollResizeObserver = new ResizeObserver((entries) => {
        const rect = entries?.[0]?.contentRect;
        const width = Math.round((rect?.width || stage.clientWidth || 0) * 10);
        const height = Math.round((rect?.height || stage.clientHeight || 0) * 10);
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        requestPianoRollRefresh(false);
      });
      pianoRollResizeObserver.observe(stage);
    }

    stage.addEventListener("transitionend", (event) => {
      if (!event || event.propertyName === "height" || event.propertyName === "all") {
        requestPianoRollRefresh(false);
      }
    });

    if (document.readyState === "complete") {
      requestPianoRollRefresh(true);
    } else {
      window.addEventListener("load", () => requestPianoRollRefresh(true), { once: true });
    }
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
      const toggleLabel = i18nText("theme.toggle");
      themeToggleBtn.dataset.currentTheme = resolved;
      delete themeToggleBtn.dataset.targetTheme;
      themeToggleBtn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
      themeToggleBtn.setAttribute("aria-label", toggleLabel);
      themeToggleBtn.title = toggleLabel;
      if (themeModeText) themeModeText.textContent = toggleLabel;
    }
    if (persist) writePref("theme", resolved);
    pianoRollLastDataSignature = "";
    updatePianoRoll(currentOffset, scheduleCache?.duration || Number(progressSlider?.max) || 0, true);
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

  function readLocalJsonPref(name) {
    const raw = readPref(name);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  }

  function writeLocalJsonPref(name, value) {
    try { writeLocalPrefOnly(name, JSON.stringify(value)); return true; }
    catch (_) { return false; }
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
        updateGoogleDriveControls(i18nText("ui.login_required"));
      } else {
        updateGoogleDriveControls();
        scheduleGoogleTokenExpiryRefresh();
      }
    }, delay + 250);
  }

  function clearGoogleTokenCache() {
    removeLocalPrefOnly(GOOGLE_TOKEN_CACHE_PREF);
  }

  function currentRhythmGameTitle() {
    const name = String(googleDriveMmlFileName || suggestedMmlSaveFileName || "")
      .replace(/\.(txt|mml|mid|midi|kar|mus|musx|mnx(?:\.json)?|mscz|mscx|musicxml|xml|mxl|mmi|gp3|gp4|gp5|gpx|gp|tab|vsq|vsqx|vpr|ust|ustx|svp|s5p|ccs)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    return name || i18nText("mml.title");
  }

  function buildRhythmGamePayload() {
    normalizeTextareaCommands(mainMml);
    const mml = normalizeMmlForDisplay(mainMml?.value || "");
    const parsed = parseMabinogiMml(mml);
    const activeChannelCount = (parsed.parts || []).filter(part =>
      (part.notes || []).some(note => Number(note.volume ?? 8) > 0)
    ).length;
    if (!activeChannelCount) throw new Error(i18nText("game.no_channel"));

    return {
      title: currentRhythmGameTitle(),
      mml,
      instruments: normalizePresetKeyArray(partPresetKeys),
      channelCount: activeChannelCount
    };
  }

  function setRhythmGameLoading(message, mode = "loading") {
    if (rhythmGameLoadingText) rhythmGameLoadingText.textContent = message;
    if (rhythmGameLoading) {
      rhythmGameLoading.hidden = false;
      rhythmGameLoading.dataset.mode = mode;
    }
    if (rhythmGameStatus) rhythmGameStatus.textContent = message;
  }

  function hideRhythmGameLoading(message = i18nText("game.ready")) {
    if (rhythmGameLoading) rhythmGameLoading.hidden = true;
    if (rhythmGameStatus) rhythmGameStatus.textContent = message;
  }

  function clearRhythmGameLoadTimer() {
    if (!rhythmGameLoadTimer) return;
    window.clearTimeout(rhythmGameLoadTimer);
    rhythmGameLoadTimer = 0;
  }

  function startRhythmGameLoadTimer(stage = "ready_timeout") {
    clearRhythmGameLoadTimer();
    rhythmGameLoadTimer = window.setTimeout(() => {
      if (rhythmGameLayer?.hidden) return;
      const timedOut = stage === "ready_timeout"
        ? !rhythmGameFrameReady
        : rhythmGameFrameReady && rhythmGamePayloadPending;
      if (!timedOut) return;

      rhythmGamePayloadPending = false;
      const message = stage === "payload_timeout"
        ? i18nText("game.send_fail")
        : i18nText("game.load_fail");
      setRhythmGameLoading(message, "error");
    }, 10000);
  }

  function sendRhythmGamePayload() {
    if (!rhythmGameFrameReady || !rhythmGamePendingPayload || !rhythmGameFrame?.contentWindow) return;
    setRhythmGameLoading(i18nText("mml.send_inst"));
    rhythmGamePayloadPending = true;
    rhythmGameFrame.contentWindow.postMessage({
      type: "MML_RHYTHM_LOAD",
      payload: rhythmGamePendingPayload
    }, MOBIBEATS_TARGET_ORIGIN);
    startRhythmGameLoadTimer("payload_timeout");
  }

  function openRhythmGameLayer() {
    if (!rhythmGameLayer || !rhythmGameFrame) return;
    try {
      rhythmGamePendingPayload = buildRhythmGamePayload();
    } catch (err) {
      showDialog(i18nText("game.open_fail"), shortError(err));
      return;
    }

    const currentUrl = String(rhythmGameFrame.getAttribute("src") || "");

    stopPlayback(true);
    stopMidiPreview();
    rhythmGameLayer.hidden = false;
    rhythmGameLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("rhythm-game-open");
    setRhythmGameLoading(i18nText("game.loading"));

    if (!rhythmGameFrameReady || currentUrl === "about:blank") {
      rhythmGameFrameReady = false;
      rhythmGameFrame.src = MOBIBEATS_URL;
      startRhythmGameLoadTimer();
    } else {
      sendRhythmGamePayload();
    }
    requestAnimationFrame(() => rhythmGameClose?.focus());
  }

  function closeRhythmGameLayer() {
    if (!rhythmGameLayer || rhythmGameLayer.hidden) return;
    try { rhythmGameFrame?.contentWindow?.MobiBeats?.pause?.(); } catch (_) {}
    clearRhythmGameLoadTimer();
    rhythmGamePayloadPending = false;
    rhythmGamePendingPayload = null;
    rhythmGameLayer.hidden = true;
    rhythmGameLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("rhythm-game-open");
    if (rhythmGameStatus) rhythmGameStatus.textContent = i18nText("game.preparing");
    rhythmGameBtn?.focus();
  }

  function handleRhythmGameFrameLoad() {
    if (!rhythmGameFrame) return;
    const loadedUrl = String(rhythmGameFrame.getAttribute("src") || "");
    if (!loadedUrl || loadedUrl === "about:blank" || rhythmGameFrameReady) return;
    if (!rhythmGameLayer?.hidden) {
      setRhythmGameLoading(i18nText("game.wait_ready"));
      startRhythmGameLoadTimer();
    }
  }

  function isTrustedRhythmGameMessage(event) {
    if (!rhythmGameFrame?.contentWindow || event.source !== rhythmGameFrame.contentWindow) return false;
    if (window.location.origin === "null") return event.origin === "null";
    return event.origin === window.location.origin;
  }

  function handleRhythmGameMessage(event) {
    if (!isTrustedRhythmGameMessage(event)) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "MML_RHYTHM_READY") {
      rhythmGameFrameReady = true;
      clearRhythmGameLoadTimer();
      if (!rhythmGameLayer?.hidden && rhythmGamePendingPayload) sendRhythmGamePayload();
      return;
    }

    if (data.type === "MML_RHYTHM_LOADED") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      hideRhythmGameLoading(i18nText("game.ready"));
      try { rhythmGameFrame.contentWindow.focus(); } catch (_) {}
      return;
    }

    if (data.type === "MML_RHYTHM_ERROR") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      const message = String(data.message || data.payload?.message || i18nText("game.data_fail"));
      setRhythmGameLoading(message, "error");
      return;
    }

    if (data.type === "MML_RHYTHM_CLOSE") {
      closeRhythmGameLayer();
    }
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
      scheduleGoogleTokenExpiryRefresh();
      void loadGoogleUserProfile();
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
    clearGoogleUserProfile();
    if (clearCache) clearGoogleTokenCache();
  }

  function resetGoogleSessionState(clearCache = false) {
    clearGoogleTokenState(clearCache);
    googleDriveMmlFileName = "";
    googleDriveMmlFolderId = "";
  }

  function setGoogleStatus(message) {
    if (googleStatus) googleStatus.textContent = message || "";
  }

  function clearGoogleUserProfile(refresh = true) {
    googleUserProfile = null;
    googleUserProfileToken = "";
    googleUserProfilePromise = null;
    if (refresh) updateAccountUi();
  }

  function updateAccountUi() {
    const connected = isGoogleConnected();
    const profile = connected && googleUserProfile ? googleUserProfile : {};
    const displayName = connected
      ? (String(profile.displayName || "").trim() || i18nText("account.user"))
      : i18nText("account.guest");
    const email = connected ? String(profile.emailAddress || "").trim() : "";
    const photo = connected ? String(profile.photoLink || "").trim() : "";

    if (accountMenuName) accountMenuName.textContent = displayName;
    if (accountMenuEmail) {
      accountMenuEmail.textContent = email;
      accountMenuEmail.hidden = !email;
    }
    if (accountAvatarImg) {
      const target = photo || GUEST_AVATAR_URL;
      if (accountAvatarImg.getAttribute("src") !== target) accountAvatarImg.src = target;
      accountAvatarImg.alt = "";
    }
    if (accountMenuButton) {
      accountMenuButton.dataset.connected = connected ? "true" : "false";
      accountMenuButton.setAttribute("aria-label", connected ? displayName : i18nText("account.menu"));
      accountMenuButton.title = connected ? displayName : i18nText("account.menu");
    }
  }

  async function loadGoogleUserProfile(force = false) {
    if (!isGoogleConnected()) {
      clearGoogleUserProfile();
      return null;
    }
    const token = googleAccessToken;
    if (!force && googleUserProfileToken === token && googleUserProfile) {
      updateAccountUi();
      return googleUserProfile;
    }
    if (!force && googleUserProfilePromise && googleUserProfileToken === token) {
      return googleUserProfilePromise;
    }

    googleUserProfileToken = token;
    googleUserProfilePromise = (async () => {
      try {
        const fields = encodeURIComponent("user(displayName,emailAddress,photoLink)");
        const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/about?fields=${fields}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Google profile HTTP ${response.status}`);
        const data = await response.json();
        if (googleAccessToken !== token) return null;
        const user = data?.user || {};
        googleUserProfile = {
          displayName: String(user.displayName || ""),
          emailAddress: String(user.emailAddress || ""),
          photoLink: String(user.photoLink || "")
        };
      } catch (_) {
        if (googleAccessToken === token) googleUserProfile = {};
      } finally {
        if (googleAccessToken === token) updateAccountUi();
        if (googleUserProfileToken === token) googleUserProfilePromise = null;
      }
      return googleUserProfile;
    })();
    return googleUserProfilePromise;
  }

  function updateGoogleDriveControls(message = "") {
    const hasClient = Boolean(googleClientId());
    const hasPickerKey = Boolean(googleApiKey());
    const connected = isGoogleConnected();
    if (googleLoginBtn) {
      googleLoginBtn.disabled = !hasClient;
      const googleLoginLabel = googleLoginBtn.querySelector(".google-login-label");
      const labelText = i18nText(connected ? "auth.logout" : "auth.login");
      if (googleLoginLabel) {
        googleLoginLabel.textContent = labelText;
      } else {
        googleLoginBtn.textContent = labelText;
      }
      googleLoginBtn.setAttribute("aria-label", i18nText(connected ? "google.logout" : "google.login"));
      googleLoginBtn.title = hasClient
        ? i18nText(connected ? "google.logout_help" : "google.connect_help")
        : i18nText("msg.enter_oauth");
    }
    const googleDriveLoadTitle = !hasClient
      ? i18nText("msg.enter_oauth")
      : !connected
        ? i18nText("google.connect_help")
        : !hasPickerKey
          ? i18nText("drive.select_files")
          : i18nText("drive.select_gdocs");
    if (googleDriveLoadBtn) {
      googleDriveLoadBtn.disabled = false;
      googleDriveLoadBtn.title = googleDriveLoadTitle;
    }
    if (mmiImportGoogleDriveLoad) {
      mmiImportGoogleDriveLoad.disabled = false;
      mmiImportGoogleDriveLoad.title = googleDriveLoadTitle;
    }
    if (midiConvertGoogleDriveLoad) {
      midiConvertGoogleDriveLoad.disabled = Boolean(midiConvertBusy);
      midiConvertGoogleDriveLoad.title = midiConvertBusy ? i18nText("drive.fail_load") : googleDriveLoadTitle;
    }
    if (googleDriveSaveBtn) {
      googleDriveSaveBtn.disabled = false;
      googleDriveSaveBtn.title = !hasClient
        ? i18nText("msg.enter_oauth")
        : !connected
          ? i18nText("google.connect_help")
          : i18nText("drive.save_done_mml");
    }
    if (message) {
      setGoogleStatus(message);
    } else if (!hasClient) {
      setGoogleStatus(i18nText("google.setup_required"));
    } else if (connected && !hasPickerKey) {
      setGoogleStatus(i18nText("st.connected_api"));
    } else if (connected) {
      setGoogleStatus(i18nText("google.connected"));
    } else {
      setGoogleStatus(i18nText("st.not_connected"));
    }
    updateAccountUi();
    if (connected && googleUserProfileToken !== googleAccessToken) void loadGoogleUserProfile();
  }

  function openCodeHelpDialog() {
    if (codeHelpDialog?.showModal) {
      codeHelpDialog.showModal();
    } else {
      showDialog(i18nText("edit.help"), i18nText("err.code_help"));
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
          reject(new Error(i18nText("err.lib_load", [label])));
        }
      }, 80);
    });
  }

  async function ensureGoogleIdentityLoaded() {
    await waitForGoogleGlobal(() => Boolean(window.google?.accounts?.oauth2), i18nText("google.login_title"));
  }

  async function ensureGooglePickerLoaded() {
    await waitForGoogleGlobal(() => Boolean(window.gapi?.load), "Google Picker");
    if (googlePickerLoaded && window.google?.picker) return;
    await new Promise((resolve, reject) => {
      try {
        window.gapi.load("picker", {
          callback: () => { googlePickerLoaded = true; resolve(); },
          onerror: () => reject(new Error(i18nText("google.picker_fail"))),
          timeout: 10000,
          ontimeout: () => reject(new Error(i18nText("google.picker_timeout")))
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function googleLoginRequiredError() {
    return new Error(i18nText("google.session_expired"));
  }

  function requireGoogleAccessToken() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    clearGoogleTokenState(true);
    updateGoogleDriveControls(i18nText("ui.login_required"));
    throw googleLoginRequiredError();
  }

  async function requestGoogleAccessTokenInteractive() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    const clientId = googleClientId();
    if (!clientId) throw new Error(i18nText("google.client_id_missing"));
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
            reject(new Error(response?.error_description || response?.error || i18nText("google.login_fail")));
            return;
          }
          googleAccessToken = String(response.access_token || "");
          const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
          googleTokenExpiresAt = Date.now() + expiresIn * 1000;
              setGoogleAutoReconnect(true);
          saveGoogleTokenCache(response);
          void loadGoogleUserProfile(true);
          updateGoogleDriveControls(i18nText("google.connected"));
          resolve(googleAccessToken);
        };
        googleTokenClient.requestAccessToken({ prompt: "select_account" });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function ensureGoogleSessionForDriveAction() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    updateGoogleDriveControls(i18nText("google.login_wait"));
    await requestGoogleAccessTokenInteractive();
    setGoogleAutoReconnect(true);
    const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
    updateGoogleDriveControls(appliedDriveSettings ? i18nText("google.cfg_applied") : i18nText("cfg.local"));
    return googleAccessToken;
  }

  function scheduleGoogleAutoReconnect() {
    if (!shouldGoogleAutoReconnect() || !googleClientId()) return;
    if (restoreGoogleTokenCache()) {
      updateGoogleDriveControls(i18nText("google.restored"));
      window.setTimeout(() => void applyGoogleSettingsAfterSessionRestore(i18nText("google.restored")), 100);
      return;
    }
    updateGoogleDriveControls(i18nText("ui.login_required"));
  }

  async function applyGoogleSettingsAfterSessionRestore(fallbackMessage = i18nText("google.restored")) {
    if (!isGoogleConnected()) return;
    const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
    updateGoogleDriveControls(appliedDriveSettings ? i18nText("google.cfg_applied") : fallbackMessage);
  }

  async function handleGoogleLoginButton() {
    if (isGoogleConnected()) {
      setGoogleAutoReconnect(false);
      resetGoogleSessionState(true);
      updateGoogleDriveControls(i18nText("google.logout_done"));
      return;
    }
    try {
      updateGoogleDriveControls(i18nText("google.login_wait"));
      await requestGoogleAccessTokenInteractive();
      setGoogleAutoReconnect(true);
      const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
      updateGoogleDriveControls(appliedDriveSettings ? i18nText("google.cfg_applied") : i18nText("cfg.local"));
    } catch (err) {
      resetGoogleSessionState(true);
      updateGoogleDriveControls(i18nText("google.login_fail_short"));
      showDialog(i18nText("google.login_fail_short"), shortError(err));
    }
  }

  function driveQueryString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function appendGoogleDriveParams(url, params = {}) {
    const query = Object.entries(params)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    if (!query) return url;
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function googleDriveSupportsAllDrivesParams(extra = {}) {
    return { supportsAllDrives: "true", ...extra };
  }

  function googleDriveListParams(extra = {}) {
    return { supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...extra };
  }

  function isGoogleDriveNotFoundError(err) {
    return /(?:^|\b)(?:404|notFound|File not found)(?:\b|:)/i.test(String(err?.message || err || ""));
  }

  function clearRememberedGoogleDriveSaveFolder() {
    googleDriveSaveFolderId = "";
    googleDriveSaveFolderName = "";
    removeLocalPrefOnly("googleDriveSaveFolderId");
    removeLocalPrefOnly("googleDriveSaveFolderName");
    scheduleGoogleSettingsSave();
  }

  function isGoogleDriveNativeEditorMime(mimeType = "") {
    const type = String(mimeType || "").toLowerCase();
    return type.startsWith("application/vnd.google-apps.")
      && type !== GOOGLE_DRIVE_FOLDER_MIME
      && type !== GOOGLE_DRIVE_SHORTCUT_MIME;
  }

  function isGoogleDocsDocumentMime(mimeType = "") {
    return String(mimeType || "").toLowerCase() === GOOGLE_DOCS_DOCUMENT_MIME;
  }

  async function googleDriveFetch(url, options = {}, retry = true) {
    const token = requireGoogleAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      clearGoogleTokenState(true);
        updateGoogleDriveControls(i18nText("ui.login_required"));
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
    const baseUrl = fileId
      ? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${encodedId}`
      : `${GOOGLE_DRIVE_UPLOAD_BASE}/files`;
    const url = appendGoogleDriveParams(baseUrl, googleDriveSupportsAllDrivesParams({
      uploadType: "multipart",
      fields: "id,name,modifiedTime,webViewLink,parents"
    }));
    const method = fileId ? "PATCH" : "POST";
    return googleDriveJson(url, {
      method,
      headers: { "Content-Type": multipart.contentType },
      body: multipart.body
    });
  }

  async function uploadGoogleDriveBinaryFile({ fileId = "", name, bytes, parents = null, mimeType = GOOGLE_SOUND_BANK_MIME }) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const metadata = { name, mimeType };
    if (parents && !fileId) metadata.parents = parents;
    const encodedId = encodeURIComponent(fileId);
    const baseUrl = fileId
      ? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${encodedId}`
      : `${GOOGLE_DRIVE_UPLOAD_BASE}/files`;
    const initUrl = appendGoogleDriveParams(baseUrl, googleDriveSupportsAllDrivesParams({
      uploadType: "resumable",
      fields: "id,name,modifiedTime,size,mimeType,parents"
    }));
    const method = fileId ? "PATCH" : "POST";
    const initResponse = await googleDriveFetch(initUrl, {
      method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(view.byteLength)
      },
      body: JSON.stringify(metadata)
    });
    if (!initResponse.ok) throw new Error(await googleDriveErrorMessage(initResponse));
    const sessionUrl = initResponse.headers.get("Location");
    if (!sessionUrl) throw new Error("Google Drive did not return an upload session URL.");
    const uploadResponse = await googleDriveFetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: new Blob([view], { type: mimeType })
    });
    if (!uploadResponse.ok) throw new Error(await googleDriveErrorMessage(uploadResponse));
    return uploadResponse.json();
  }

  async function findGoogleSoundBankCacheFile() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_SOUND_BANK_FILE_NAME)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,size,mimeType)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function downloadGoogleDriveBinary(fileId) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(url);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return new Uint8Array(await response.arrayBuffer());
  }

  async function deleteGoogleDriveFile(fileId) {
    if (!fileId) return false;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams());
    const response = await googleDriveFetch(url, { method: "DELETE" });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return true;
  }

  async function findGoogleMmlFolder() {
    const q = `name = '${driveQueryString(GOOGLE_MML_FOLDER_NAME)}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME}' and trashed = false`;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveListParams({
      spaces: "drive",
      corpora: "allDrives",
      pageSize: "1",
      q,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,capabilities,driveId)"
    }));
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function createGoogleMmlFolder() {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveSupportsAllDrivesParams({
      fields: "id,name,mimeType,modifiedTime,webViewLink,capabilities,driveId"
    }));
    return googleDriveJson(url, {
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
    if (googleDriveMmlFolderId) {
      try {
        const cached = await validateGoogleDriveFolder(googleDriveMmlFolderId, { requireWritable: true });
        googleDriveMmlFolderId = cached.id;
        return googleDriveMmlFolderId;
      } catch (err) {
        if (!isGoogleDriveNotFoundError(err)) throw err;
        googleDriveMmlFolderId = "";
      }
    }
    const existing = await findGoogleMmlFolder();
    if (existing?.id) {
      try {
        const folder = await validateGoogleDriveFolder(existing.id, { requireWritable: true });
        googleDriveMmlFolderId = folder.id || existing.id;
        return googleDriveMmlFolderId;
      } catch (_) {
        googleDriveMmlFolderId = "";
      }
    }
    const created = await createGoogleMmlFolder();
    if (!created?.id) throw new Error(i18nText("drive.folder_create_fail", [GOOGLE_MML_FOLDER_NAME]));
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

  async function validateGoogleDriveFolder(folderId, { requireWritable = false } = {}) {
    const id = String(folderId || "").trim();
    if (!id) throw new Error(i18nText("drive.folder_required"));
    const meta = await getGoogleDriveFileMeta(id, "id,name,mimeType,trashed,capabilities,driveId,shortcutDetails");
    let folder = meta;
    if (folder?.mimeType === GOOGLE_DRIVE_SHORTCUT_MIME && folder.shortcutDetails?.targetId) {
      folder = await getGoogleDriveFileMeta(folder.shortcutDetails.targetId, "id,name,mimeType,trashed,capabilities,driveId");
    }
    if (!folder?.id) throw new Error(i18nText("drive.folder_not_found"));
    if (folder.trashed) throw new Error(i18nText("drive.folder_trashed", [folder.name || i18nText("drive.selected_dir")]));
    if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) throw new Error(i18nText("drive.not_folder"));
    if (requireWritable && folder.capabilities && folder.capabilities.canAddChildren === false) {
      throw new Error(i18nText("drive.folder_no_permission", [folder.name || i18nText("drive.selected_dir")]));
    }
    return {
      id: folder.id,
      name: folder.name || GOOGLE_MML_FOLDER_NAME,
      driveId: folder.driveId || "",
      capabilities: folder.capabilities || null
    };
  }

  async function resolveGoogleDriveSaveFolder(folderId, folderName) {
    try {
      const folder = await validateGoogleDriveFolder(folderId, { requireWritable: true });
      rememberGoogleDriveSaveFolder(folder.id, folder.name || folderName || GOOGLE_MML_FOLDER_NAME);
      return folder;
    } catch (err) {
      if (!isGoogleDriveNotFoundError(err)) throw err;
      clearRememberedGoogleDriveSaveFolder();
      googleDriveMmlFolderId = "";
      const fallbackId = await ensureGoogleMmlFolder();
      const fallback = await validateGoogleDriveFolder(fallbackId, { requireWritable: true });
      rememberGoogleDriveSaveFolder(fallback.id, fallback.name || GOOGLE_MML_FOLDER_NAME);
      return fallback;
    }
  }

  async function pickGoogleDriveSaveFolder() {
    requireGoogleAccessToken();
    if (!googleApiKey()) throw new Error(i18nText("google.api_key_missing"));
    setGoogleStatus(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]));
    const defaultFolderId = await ensureGoogleMmlFolder();
    await ensureGooglePickerLoaded();

    return new Promise((resolve, reject) => {
      try {
        const picker = window.google?.picker;
        if (!picker) throw new Error(i18nText("google.picker_load_fail"));
        const viewId = picker.ViewId.FOLDERS || picker.ViewId.DOCS;
        const view = new picker.DocsView(viewId);
        try { view.setIncludeFolders(true); } catch (_) {}
        try { view.setSelectFolderEnabled(true); } catch (_) {}
        try { view.setMimeTypes(GOOGLE_DRIVE_FOLDER_MIME); } catch (_) {}
        try { if (defaultFolderId && typeof view.setParent === "function") view.setParent(defaultFolderId); } catch (_) {}

        const folderHint = googleDriveSaveFolderName
          ? i18nText("drive.current_selection", [googleDriveSaveFolderName])
          : i18nText("drive.default_folder", [GOOGLE_MML_FOLDER_NAME]);
        const builder = new picker.PickerBuilder()
          .setDeveloperKey(googleApiKey())
          .setOAuthToken(googleAccessToken)
          .setTitle(i18nText("drive.select_location_title", [folderHint]))
          .addView(view)
          .setCallback((data) => {
            const action = data?.[picker.Response.ACTION];
            if (action === picker.Action.CANCEL) {
              stopGooglePickerLayerWatch();
              resolve(null);
              return;
            }
            if (action !== picker.Action.PICKED) {
              forceGooglePickerLayer();
              return;
            }
            stopGooglePickerLayerWatch();
            const doc = data[picker.Response.DOCUMENTS]?.[0];
            const id = doc?.[picker.Document.ID] || "";
            const name = doc?.[picker.Document.NAME] || i18nText("drive.selected_dir");
            const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
            if (!id) {
              resolve(null);
              return;
            }
            if (mimeType && mimeType !== GOOGLE_DRIVE_FOLDER_MIME) {
              showDialog(i18nText("drive.save_loc"), i18nText("drive.select_folder_only"));
              resolve(null);
              return;
            }
            resolve({ id, name });
          });
        const appId = googleAppId();
        if (appId) builder.setAppId(appId);
        builder.build().setVisible(true);
        startGooglePickerLayerWatch();
        requestAnimationFrame(() => {
          forceGooglePickerLayer();
          window.setTimeout(forceGooglePickerLayer, 80);
          window.setTimeout(forceGooglePickerLayer, 240);
        });
      } catch (err) {
        stopGooglePickerLayerWatch();
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
    const q = `'${driveQueryString(folderId)}' in parents and name = '${driveQueryString(name)}' and trashed = false`;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveListParams({
      spaces: "drive",
      corpora: "allDrives",
      pageSize: "10",
      q,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents,driveId)"
    }));
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
      const entered = window.prompt(i18nText("drive.save_name_prompt", [initialFolder.name]), initialName);
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
        googleDriveSaveApply.textContent = busy ? i18nText("st.saving") : i18nText("ui.save");
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
        setSaveBusy(true, i18nText("drive.duplicate_check"));
        try {
          const preparedFolder = await resolveGoogleDriveSaveFolder(
            selectedFolder.id || googleDriveMmlFolderId || await ensureGoogleMmlFolder(),
            selectedFolder.name || GOOGLE_MML_FOLDER_NAME
          );
          const folderId = preparedFolder.id;
          const folderName = preparedFolder.name || selectedFolder.name || GOOGLE_MML_FOLDER_NAME;
          selectedFolder = { id: folderId, name: folderName };
          updateFolderLabel();
          const existing = await findGoogleDriveTextFileInFolder(folderId, fileName);
          if (existing?.id) {
            const overwrite = window.confirm(i18nText("drive.file_exists_confirm", [folderName, fileName]));
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
            setSaveBusy(true, i18nText("drive.saving_wait"));
            const result = await onCommit(target);
            const savedName = result?.fileName || result?.name || fileName;
            const action = result?.createsNewFile === false ? i18nText("drive.overwritten") : i18nText("drive.saved");
            showDialog(i18nText("drive.save_done"), i18nText("drive.save_result", [folderName, savedName, action]));
            finish(result || target);
            closeDialog();
            return;
          }
          finish(target);
          closeDialog();
        } catch (err) {
          setSaveBusy(false);
          showDialog(i18nText("drive.save_fail"), shortError(err));
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
            selectedFolder = { id: picked.id, name: picked.name || i18nText("drive.selected_dir") };
            rememberGoogleDriveSaveFolder(selectedFolder.id, selectedFolder.name);
          }
        } catch (err) {
          showDialog(i18nText("drive.folder_select_fail"), shortError(err));
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

  function soundBankSelectionTime(meta) {
    const time = Date.parse(String(meta?.updatedAt || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function normalizeGoogleSoundBankMeta(value) {
    const normalized = normalizeSoundBankSelectionMeta(value);
    if (!normalized) return null;
    return {
      ...normalized,
      fileId: normalized.mode === "custom" ? String(value?.fileId || "").trim().slice(0, 200) : ""
    };
  }

  function buildGoogleSoundBankSettingsMeta() {
    const local = readSoundBankSelectionMeta() || newDefaultSoundBankSelectionMeta("");
    return {
      ...local,
      fileId: local.mode === "custom" ? String(googleSoundBankFileId || "") : ""
    };
  }

  async function uploadSoundBankBytesToGoogle(bytes) {
    if (!googleSoundBankFileId) {
      const existing = await findGoogleSoundBankCacheFile();
      googleSoundBankFileId = existing?.id || "";
    }
    let saved;
    try {
      saved = await uploadGoogleDriveBinaryFile({
        fileId: googleSoundBankFileId,
        name: GOOGLE_SOUND_BANK_FILE_NAME,
        bytes,
        parents: googleSoundBankFileId ? null : ["appDataFolder"],
        mimeType: GOOGLE_SOUND_BANK_MIME
      });
    } catch (err) {
      if (!googleSoundBankFileId || !isGoogleDriveNotFoundError(err)) throw err;
      googleSoundBankFileId = "";
      saved = await uploadGoogleDriveBinaryFile({
        fileId: "",
        name: GOOGLE_SOUND_BANK_FILE_NAME,
        bytes,
        parents: ["appDataFolder"],
        mimeType: GOOGLE_SOUND_BANK_MIME
      });
    }
    googleSoundBankFileId = saved?.id || googleSoundBankFileId;
    return saved;
  }

  async function removeGoogleSoundBankCacheFile(fileId = "") {
    let targetId = String(fileId || googleSoundBankFileId || "").trim();
    if (!targetId) {
      try { targetId = String((await findGoogleSoundBankCacheFile())?.id || ""); } catch (_) {}
    }
    if (targetId) {
      try { await deleteGoogleDriveFile(targetId); }
      catch (err) { if (!isGoogleDriveNotFoundError(err)) throw err; }
    }
    googleSoundBankFileId = "";
  }

  function queueGoogleSoundBankSync(task) {
    const run = googleSoundBankSyncQueue
      .catch(() => false)
      .then(async () => {
        googleSoundBankSyncing = true;
        try { return await task(); }
        finally { googleSoundBankSyncing = false; }
      });
    googleSoundBankSyncQueue = run;
    return run;
  }

  async function syncManualSoundBankSelectionToGoogle(bytes, meta) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
        await uploadSoundBankBytesToGoogle(bytes);
        await saveGoogleSettingsNow(true);
        return true;
      } catch (err) {
        console.warn("[Mobibard] Failed to cache sound bank in Google Drive.", err);
        return false;
      }
    });
  }

  async function syncDefaultSoundBankSelectionToGoogle(meta) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
        await removeGoogleSoundBankCacheFile();
        if (meta) writeSoundBankSelectionMeta(meta);
        await saveGoogleSettingsNow(true);
        return true;
      } catch (err) {
        console.warn("[Mobibard] Failed to clear Google sound-bank cache.", err);
        return false;
      }
    });
  }

  async function applyGoogleCustomSoundBank(bytes, cloudMeta) {
    const meta = normalizeGoogleSoundBankMeta(cloudMeta);
    if (!meta || meta.mode !== "custom") throw new Error("Invalid Google sound-bank metadata.");
    if (meta.size > 0 && bytes.byteLength !== meta.size) {
      throw new Error(`Cached sound-bank size mismatch (${bytes.byteLength}/${meta.size}).`);
    }
    if (meta.sha256) {
      const actual = await sha256Hex(bytes);
      if (actual && actual !== meta.sha256) throw new Error("Cached sound-bank SHA-256 mismatch.");
    }
    const parsed = await parseSoundBank(bytes);
    stopPlayback(false);
    stopMidiPreview();
    soundFont = parsed;
    soundFontIsDefault = false;
    sf2Name = meta.name || "SoundBank";
    const api = soundBankCacheApi();
    if (api?.putActive) {
      try {
        await api.putActive({
          bytes,
          name: sf2Name,
          mimeType: meta.mimeType || GOOGLE_SOUND_BANK_MIME,
          extension: meta.extension || soundBankExtension(sf2Name),
          sha256: meta.sha256,
          updatedAt: meta.updatedAt
        });
      } catch (err) {
        console.warn("[Mobibard] Local sound-bank cache write failed after Google restore.", err);
      }
    }
    writeSoundBankSelectionMeta(meta);
    updateSoundFontUi();
    if (partSoundDialog?.open) {
      draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
      renderPartSoundRows();
      updateSoundPresetControls();
    }
  }

  async function syncSoundBankSelectionWithGoogle(cloudValue) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
      const cloud = normalizeGoogleSoundBankMeta(cloudValue);
      if (cloud?.fileId) googleSoundBankFileId = cloud.fileId;
      const local = readSoundBankSelectionMeta();
      let cached = null;
      if (local?.mode === "custom") {
        try { cached = await soundBankCacheApi()?.getActive?.(); } catch (_) {}
      }
      const localTime = soundBankSelectionTime(local);
      const cloudTime = soundBankSelectionTime(cloud);

      if (!cloud) {
        if (local?.mode === "custom" && cached?.bytes?.byteLength) {
          await uploadSoundBankBytesToGoogle(cached.bytes);
        } else {
          googleSoundBankFileId = "";
          if (!local) writeSoundBankSelectionMeta(newDefaultSoundBankSelectionMeta(new Date().toISOString()));
        }
        return true;
      }

      if (cloud.mode === "default" && (cloudTime > localTime || !local)) {
        await removeGoogleSoundBankCacheFile();
        await restoreDefaultSoundFont({
          silent: true,
          syncGoogle: false,
          persistSelection: true,
          updatedAt: cloud.updatedAt || new Date().toISOString()
        });
        return false;
      }

      if (local?.mode === "default" && cloud.mode === "custom" && localTime >= cloudTime) {
        await removeGoogleSoundBankCacheFile(cloud.fileId);
        return true;
      }

      if (cloud.mode === "custom" && (
        cloudTime > localTime
        || !local
        || (local.mode === "custom" && !cached?.bytes?.byteLength)
        || (local.mode !== "custom" && cloudTime >= localTime)
      )) {
        if (!cloud.fileId) throw new Error("Google sound-bank cache metadata has no file ID.");
        const bytes = await downloadGoogleDriveBinary(cloud.fileId);
        await applyGoogleCustomSoundBank(bytes, cloud);
        return false;
      }

      if (local?.mode === "custom" && cached?.bytes?.byteLength && (localTime > cloudTime || cloud.mode !== "custom" || !cloud.fileId)) {
        await uploadSoundBankBytesToGoogle(cached.bytes);
        return true;
      }

      return false;
      } catch (err) {
        console.warn("[Mobibard] Failed to synchronize sound-bank cache with Google Drive.", err);
        return false;
      }
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
      throw new Error(i18nText("google.settings_invalid"));
    }
    const normalized = {};
    for (const [key, value] of Object.entries(prefs)) {
      const name = String(key || "").trim();
      if (!name || GOOGLE_LOCAL_ONLY_PREFS.has(name) || name.includes(".") || name.length > 80) continue;
      if (value == null) continue;
      if (["string", "number", "boolean"].includes(typeof value)) normalized[name] = String(value);
    }
    return {
      prefs: normalized,
      soundBank: normalizeGoogleSoundBankMeta(data?.soundBank)
    };
  }

  function buildGoogleSettingsPayload() {
    return JSON.stringify({
      app: GOOGLE_SETTINGS_APP_NAME,
      version: 2,
      savedAt: new Date().toISOString(),
      prefs: captureLocalPrefSnapshot(),
      soundBank: buildGoogleSoundBankSettingsMeta()
    }, null, 2);
  }

  async function findGoogleSettingsFile() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_SETTINGS_FILE_NAME)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,size)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function downloadGoogleDriveText(fileId) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(url);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.text();
  }

  async function exportGoogleDriveText(fileId, exportMimeType = GOOGLE_DRIVE_TEXT_EXPORT_MIME) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export`, {
      mimeType: exportMimeType
    });
    const response = await googleDriveFetch(url);
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
    midiPartPresetName = defaultMidiSoundPresetLabel();
    userSoundPresets = [];
    partMuteStates = Array.from({ length: 6 }, () => false);
    loadThemePref();
    loadPlaybackPrefs();
    loadPianoRollPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    void window.MobibardI18n?.syncFromPreference({ source: "settings" });
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updateSoundPresetControls();
    updatePartMuteControl();
    applyPartMuteAudioGains();
    updateCharCount();
    rebuildSchedulePreviewSilently();
  }

  async function loadGoogleSettingsOrFallbackLocal() {
    if (!isGoogleConnected()) return false;
    try {
      setGoogleStatus(i18nText("google.settings_check"));
      const file = await findGoogleSettingsFile();
      if (!file?.id) {
        googleSettingsFileId = "";
        setGoogleStatus(i18nText("google.settings_create"));
        await syncSoundBankSelectionWithGoogle(null);
        await saveGoogleSettingsNow(true);
        setGoogleStatus(i18nText("google.local_settings"));
        return false;
      }
      googleSettingsFileId = file.id;
      const text = await downloadGoogleDriveText(file.id);
      const settings = parseGoogleSettings(text);
      applyPrefSnapshot(settings.prefs);
      const soundBankChangedCloud = await syncSoundBankSelectionWithGoogle(settings.soundBank);
      if (soundBankChangedCloud) await saveGoogleSettingsNow(true);
      setGoogleStatus(i18nText("google.settings_applied"));
      return true;
    } catch (err) {
      setGoogleStatus(i18nText("google.settings_fallback"));
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
      let saved;
      try {
        saved = await uploadGoogleDriveTextFile({
          fileId: googleSettingsFileId,
          name: GOOGLE_SETTINGS_FILE_NAME,
          text: payload,
          parents: googleSettingsFileId ? null : ["appDataFolder"],
          mimeType: "application/json"
        });
      } catch (err) {
        if (!googleSettingsFileId || !isGoogleDriveNotFoundError(err)) throw err;
        googleSettingsFileId = "";
        saved = await uploadGoogleDriveTextFile({
          fileId: "",
          name: GOOGLE_SETTINGS_FILE_NAME,
          text: payload,
          parents: ["appDataFolder"],
          mimeType: "application/json"
        });
      }
      googleSettingsFileId = saved?.id || googleSettingsFileId;
      if (!silent) setGoogleStatus(i18nText("google.settings_saved"));
      return true;
    } catch (err) {
      if (!silent) showDialog(i18nText("google.settings_save_fail"), shortError(err));
      else setGoogleStatus(i18nText("google.settings_save_fail"));
      return false;
    } finally {
      googleSettingsSaving = false;
    }
  }

  function forceGooglePickerLayer() {
    const pickerLayerZ = 2147483001;
    const pickerBackdropZ = 2147483000;
    const selectors = [
      ".picker-dialog-bg",
      ".picker-dialog",
      "iframe[src*=\"picker\"]",
      "iframe[src*=\"docs.google.com/picker\"]",
      "iframe[src*=\"apis.google.com/picker\"]"
    ];
    const nodes = new Set();
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach((node) => nodes.add(node));
      } catch (_) {}
    }
    for (const node of nodes) {
      try {
        const isBackdrop = node.classList?.contains("picker-dialog-bg");
        const z = isBackdrop ? pickerBackdropZ : pickerLayerZ;
        node.style.setProperty("z-index", String(z), "important");
        // Keep the Picker's own size and placement intact.
        // Changing iframe/dialog position here can make Google Picker expand incorrectly on some browsers.
        const parent = node.parentElement;
        if (parent && parent !== document.body) {
          parent.style.setProperty("z-index", String(z), "important");
        }
      } catch (_) {}
    }
  }

  function startGooglePickerLayerWatch() {
    stopGooglePickerLayerWatch();
    forceGooglePickerLayer();
    googlePickerLayerWatchTimer = window.setInterval(forceGooglePickerLayer, 120);
    try {
      googlePickerLayerObserver = new MutationObserver(() => forceGooglePickerLayer());
      googlePickerLayerObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    } catch (_) {
      googlePickerLayerObserver = null;
    }
    // Picker가 비정상 종료되더라도 보정 루프가 남지 않도록 안전 타임아웃을 둔다.
    window.setTimeout(() => stopGooglePickerLayerWatch(), 60_000);
  }

  function stopGooglePickerLayerWatch() {
    if (googlePickerLayerWatchTimer) {
      clearInterval(googlePickerLayerWatchTimer);
      googlePickerLayerWatchTimer = 0;
    }
    if (googlePickerLayerObserver) {
      try { googlePickerLayerObserver.disconnect(); } catch (_) {}
      googlePickerLayerObserver = null;
    }
  }

  function suspendPopupPanelsForGooglePicker() {
    const suspended = [];
    const suspend = (dialog, type) => {
      if (!dialog?.open) return;
      googlePickerSuspendedCloseDialogs.add(dialog);
      try {
        dialog.close("google-picker");
        suspended.push(type);
      } catch (_) {
        googlePickerSuspendedCloseDialogs.delete(dialog);
      }
    };

    // Google Picker는 일반 document 레이어에 붙기 때문에, showModal()로 열린
    // 앱 내부 팝업은 브라우저 top-layer 특성상 z-index만으로 Picker보다 뒤로
    // 보낼 수 없다. Picker를 열 때 변환/가져오기 팝업을 잠깐 닫고, 취소 시 복구한다.
    suspend(midiConvertDialog, "midi");
    suspend(mmiImportDialog, "mmi");
    return suspended;
  }

  function restorePopupPanelsAfterGooglePicker(suspended) {
    if (!Array.isArray(suspended) || !suspended.length) return;
    for (const type of suspended) {
      try {
        if (type === "midi" && pendingMidiImport && pendingMidiSettings && midiConvertDialog?.showModal && !midiConvertDialog.open) {
          midiConvertDialog.showModal();
          scheduleMidiInstrumentListHeightSync();
        } else if (type === "mmi" && pendingMmiImport && mmiImportDialog?.showModal && !mmiImportDialog.open) {
          mmiImportDialog.showModal();
        }
      } catch (_) {}
    }
  }

  function discardPopupPanelsAfterGooglePicker(suspended) {
    if (!Array.isArray(suspended) || !suspended.length) return;
    stopMidiPreview();
    if (suspended.includes("midi")) {
      pendingMidiImport = null;
      pendingMidiSettings = null;
      setMidiConvertBusy(false);
    }
    if (suspended.includes("mmi")) {
      resolveMmiImportDialog(null);
    }
  }

  async function openGoogleDrivePicker() {
    let suspendedPanels = null;
    try {
      await ensureGoogleSessionForDriveAction();
      if (!googleApiKey()) throw new Error(i18nText("google.api_key_missing"));
      setGoogleStatus(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]));
      const folderId = await ensureGoogleMmlFolder();
      await ensureGooglePickerLoaded();
      suspendedPanels = suspendPopupPanelsForGooglePicker();
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      // Drive에 업로드된 음악 파일은 서비스/브라우저에 따라 MIME 타입이
      // application/octet-stream 등으로 달라질 수 있다. Picker에서 MIME 타입을
      // 강하게 제한하지 않고 넓게 보여준 뒤, 선택 후 공통 포맷 등록소와
      // MML/MMI/TXT 검사로 실제 지원 파일만 처리한다.
      try { if (folderId && typeof view.setParent === "function") view.setParent(folderId); } catch (_) {}
      const builder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey())
        .setOAuthToken(googleAccessToken)
        .setTitle(i18nText("drive.select_files_title", [GOOGLE_MML_FOLDER_NAME]))
        .addView(view)
        .setCallback((data) => void handleGooglePickerResult(data, suspendedPanels));
      const appId = googleAppId();
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
      startGooglePickerLayerWatch();
      requestAnimationFrame(() => {
        forceGooglePickerLayer();
        window.setTimeout(forceGooglePickerLayer, 80);
        window.setTimeout(forceGooglePickerLayer, 240);
      });
      setGoogleStatus(i18nText("google.connected"));
    } catch (err) {
      stopGooglePickerLayerWatch();
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      showDialog(i18nText("drive.load_fail"), shortError(err));
      updateGoogleDriveControls();
    }
  }

  async function handleGooglePickerResult(data, suspendedPanels = null) {
    const picker = window.google?.picker;
    const action = data?.[picker?.Response?.ACTION];
    if (!picker) {
      return;
    }
    if (action === picker.Action.CANCEL) {
      stopGooglePickerLayerWatch();
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    if (action !== picker.Action.PICKED) {
      // Google Picker는 열리는 과정에서 LOADED 같은 중간 이벤트를 보낼 수 있다.
      // 이때 변환/가져오기 dialog를 복구하면 Picker가 다시 뒤로 밀리므로 무시한다.
      forceGooglePickerLayer();
      return;
    }
    stopGooglePickerLayerWatch();
    const doc = data[picker.Response.DOCUMENTS]?.[0];
    const fileId = doc?.[picker.Document.ID];
    const name = doc?.[picker.Document.NAME] || i18nText("drive.file");
    const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
    if (!fileId) {
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    if (mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
      showDialog(i18nText("drive.load"), i18nText("drive.select_mml"));
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    discardPopupPanelsAfterGooglePicker(suspendedPanels);
    try {
      await loadGoogleDriveSourceFile(fileId, name);
    } catch (err) {
      showDialog(i18nText("drive.load_fail"), shortError(err));
    }
  }

  async function getGoogleDriveFileMeta(fileId, fields = "id,name,mimeType,size,modifiedTime,webViewLink,parents,driveId,shortcutDetails") {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ fields }));
    return googleDriveJson(url);
  }

  async function resolveGoogleDriveShortcutMeta(meta) {
    if (meta?.mimeType !== GOOGLE_DRIVE_SHORTCUT_MIME || !meta.shortcutDetails?.targetId) return meta;
    return getGoogleDriveFileMeta(meta.shortcutDetails.targetId);
  }

  function isGoogleDriveTextMmlFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "txt") return true;
    if (["mmi", "mml"].includes(ext) || window.MabiMusicFormats?.isSupported(name, mimeType)) return false;
    return String(mimeType || "").toLowerCase() === "text/plain";
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

  async function buildPluginMidiImport(bytes, name = "Music", mimeType = "") {
    if (!window.MabiMusicFormats?.convertBytes) {
      throw new Error("음악 포맷 플러그인을 불러오지 못했습니다.");
    }
    const converted = await window.MabiMusicFormats.convertBytes(bytes, name, mimeType);
    const midiBytes = converted.midiBytes;
    const overview = analyzeMidi(midiBytes, name);
    return {
      bytes: midiBytes,
      name,
      overview,
      sourceType: converted.sourceType,
      sourceLabel: converted.sourceLabel,
      cacheFingerprint: buildSourceFileFingerprint(converted.sourceType, bytes)
    };
  }

  function getMidiImportSourceLabel(importData = pendingMidiImport) {
    if (importData?.sourceLabel) return String(importData.sourceLabel);
    const sourceType = String(importData?.sourceType || "");
    const plugin = window.MabiMusicFormats?.listFormats?.().find(format => format.id === sourceType);
    return plugin?.label || "MIDI";
  }

  async function loadGoogleDriveSourceFile(fileId, fallbackName = i18nText("drive.file")) {
    requireGoogleAccessToken();
    closeImportDialogsForSourceReload();
    stopMidiPreview();
    stopPlayback(false);
    const pickedMeta = await getGoogleDriveFileMeta(fileId);
    const meta = await resolveGoogleDriveShortcutMeta(pickedMeta);
    const sourceFileId = meta?.id || fileId;
    const name = meta?.name || pickedMeta?.name || fallbackName;
    const mimeType = meta?.mimeType || pickedMeta?.mimeType || "";
    if (isGoogleDocsDocumentMime(mimeType)) {
      const loaded = readMmlTextFile(await exportGoogleDriveText(sourceFileId, GOOGLE_DRIVE_TEXT_EXPORT_MIME));
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_gdocs", [shortError(optErr)]));
      }
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      trackAnalytics("drive_import_mml", {
        file_type: "google_docs",
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus(i18nText("drive.gdocs_loaded"));
      return;
    }
    if (isGoogleDriveNativeEditorMime(mimeType)) {
      throw new Error(i18nText("file.gdocs_documents"));
    }
    const mediaUrl = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(sourceFileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(mediaUrl);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (window.MabiMusicFormats?.isSupported(name, mimeType)) {
      const importData = await buildPluginMidiImport(bytes, name, mimeType);
      googleDriveMmlFileName = "";
      openMidiConvertDialog(importData);
      setGoogleStatus(i18nText("drive.midi_loaded"));
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
        showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_mmi", [shortError(optErr)]));
      }
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus(i18nText("drive.mmi_loaded"));
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
        showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_3mle", [shortError(optErr)]));
      }
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus(i18nText("drive.mle3_loaded"));
      return;
    }
    if (isGoogleDriveTextMmlFile(name, mimeType)) {
      const loaded = readMmlTextFile(decodeTextFileBytes(bytes));
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_file", [shortError(optErr)]));
      }
      googleDriveMmlFileName = name;
      rememberSuggestedMmlSaveFileName(name);
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      trackAnalytics("drive_import_mml", {
        file_type: analyticsFileType(name),
        channel_count: analyticsChannelCount(mainMml.value)
      });
      setGoogleStatus(i18nText("drive.txt_loaded"));
      return;
    }
    throw new Error(i18nText("drive.unsupported_file"));
  }

  async function saveMmlToGoogleDrive() {
    try {
      await ensureGoogleSessionForDriveAction();
      setGoogleStatus(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]));
      const defaultFolderId = await ensureGoogleMmlFolder();
      let exportData;
      try {
        exportData = getFullMmlForExport();
      } catch (err) {
        showDialog(i18nText("drive.save_fail"), i18nText("mml.optimize_error_detail", [shortError(err)]));
        return;
      }
      const text = exportData.text;
      if (!text.trim()) {
        showDialog(i18nText("drive.save_fail"), i18nText("mml.empty"));
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

          let targetId = target.overwriteFileId || "";
          let createsNewFile = !targetId;
          setGoogleStatus(i18nText("drive.saving"));
          let saved;
          try {
            saved = await uploadGoogleDriveTextFile({
              fileId: targetId,
              name: fileName,
              text: text + "\n",
              parents: createsNewFile ? [folderId] : null,
              mimeType: "text/plain"
            });
          } catch (err) {
            if (!targetId || !isGoogleDriveNotFoundError(err)) throw err;
            targetId = "";
            createsNewFile = true;
            saved = await uploadGoogleDriveTextFile({
              fileId: "",
              name: fileName,
              text: text + "\n",
              parents: [folderId],
              mimeType: "text/plain"
            });
          }
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
        setGoogleStatus(i18nText("drive.save_cancel"));
        return;
      }
      flashButton(googleDriveSaveBtn, i18nText("drive.save_done"));
      setGoogleStatus(i18nText("drive.save_done"));
    } catch (err) {
      showDialog(i18nText("drive.save_fail"), shortError(err));
      updateGoogleDriveControls();
    }
  }

  function hasMidiPartSoundPreset() {
    return Array.isArray(midiPartPresetKeys) && midiPartPresetKeys.length >= 6;
  }

  function getAutoPartPresetKeys() {
    return hasMidiPartSoundPreset() ? normalizePresetKeyArray(midiPartPresetKeys) : defaultPartPresetKeys();
  }

  function sanitizeUserSoundPresetName(name, fallback = i18nText("snd.preset")) {
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
    const name = sanitizeUserSoundPresetName(raw.name, i18nText("snd.preset_default_name", [index + 1]));
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

    select.appendChild(new Option(i18nText("snd.auto"), "auto"));

    if (userSoundPresets.length) {
      const group = document.createElement("optgroup");
      group.label = i18nText("snd.saved");
      for (const preset of userSoundPresets) {
        group.appendChild(new Option(preset.name, userSoundPresetValue(preset.id)));
      }
      select.appendChild(group);
    }

    const hasPreferred = Array.from(select.options).some(option => option.value === currentValue);
    if (hasPreferred) {
      select.value = currentValue;
    } else if (match === "current") {
      const current = new Option(i18nText("cfg.current"), "current");
      current.disabled = true;
      current.selected = true;
      select.insertBefore(current, select.children[1] || null);
    } else {
      select.value = match;
    }
  }

  function updateSoundPresetControls(preferredDialogValue = null) {
    renderSoundPresetSelect(partSoundPresetSelect, draftPartPresetKeys || partPresetKeys, preferredDialogValue);
    updatePartSoundPresetDeleteState();
  }

  function updatePartSoundPresetDeleteState() {
    const id = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const preset = id ? findUserSoundPreset(id) : null;
    const canManage = Boolean(preset);
    if (partSoundPresetDelete) {
      partSoundPresetDelete.disabled = !canManage;
      partSoundPresetDelete.title = canManage ? i18nText("snd.delete_saved") : i18nText("snd.delete_select");
    }
  }

  function getPartPresetKeysForMode(mode) {
    if (mode === "auto") return getAutoPartPresetKeys();
    const id = userSoundPresetIdFromValue(mode);
    const preset = id ? findUserSoundPreset(id) : null;
    return preset ? normalizePresetKeyArray(preset.keys) : null;
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
        showDialog(i18nText("snd.preset_save"), i18nText("snd.no_settings"));
        updatePartSoundPresetDeleteState();
        return;
      }
      const overwrite = window.confirm(i18nText("snd.preset_overwrite_confirm", [basePreset.name]));
      if (overwrite) {
        basePreset.keys = keys;
        target = basePreset;
        message = i18nText("snd.preset_overwritten", [target.name]);
      } else {
        target = createSoundPresetFromPrompt(keys, i18nText("snd.preset_copy_name", [basePreset.name]));
        if (!target) return;
        message = i18nText("snd.preset_saved_new", [target.name]);
      }
    } else {
      target = createSoundPresetFromPrompt(keys, i18nText("snd.preset_default_name", [userSoundPresets.length + 1]));
      if (!target) return;
      message = i18nText("snd.preset_saved_named", [target.name]);
    }

    saveUserSoundPresetPrefs();
    draftPartPresetKeys = keys;
    draftSoundPresetBaseId = target.id;
    updateSoundPresetControls(userSoundPresetValue(target.id));
    showDialog(i18nText("snd.preset_saved"), message);
  }

  function createSoundPresetFromPrompt(keys, defaultName, excludeId = "") {
    const input = window.prompt(i18nText("snd.name_required"), defaultName);
    if (input == null) return null;
    const name = sanitizeUserSoundPresetName(input, "");
    if (!name) {
      showDialog(i18nText("snd.save_preset"), i18nText("snd.enter_preset"));
      return null;
    }

    let target = userSoundPresets.find(p => p.name === name && p.id !== excludeId) || null;
    if (target) {
      if (!window.confirm(i18nText("snd.preset_exists_confirm", [name]))) return null;
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
      showDialog(i18nText("snd.delete_preset"), i18nText("snd.select_saved"));
      updatePartSoundPresetDeleteState();
      return;
    }
    if (!window.confirm(i18nText("snd.preset_delete_confirm", [preset.name]))) return;
    userSoundPresets = userSoundPresets.filter(p => p.id !== id);
    saveUserSoundPresetPrefs();
    updateSoundPresetControls();
    showDialog(i18nText("snd.preset_deleted"), i18nText("snd.preset_deleted_named", [preset.name]));
  }

  function updatePartMuteControl() {
    const mutedCount = partMuteStates.filter(Boolean).length;
    const label = i18nText("snd.mute");
    if (partMuteLabel) partMuteLabel.textContent = label;
    if (muteControlValue) muteControlValue.textContent = `${mutedCount}/6`;
    if (muteControlButton) {
      muteControlButton.classList.toggle("active", mutedCount > 0);
      muteControlButton.setAttribute("aria-label", `${label} ${mutedCount}/6`);
      muteControlButton.title = `${i18nText("snd.mute_channels")} ${mutedCount}/6`;
    }
    for (const checkbox of muteChannelCheckboxes) {
      const index = clampInt(Number(checkbox.dataset.mutePart), 0, 5);
      checkbox.checked = Boolean(partMuteStates[index]);
    }
    for (let i = 0; i < 6; i++) {
      const tab = tabs.find(t => t.dataset.tab === `part${i}`);
      if (tab) tab.classList.toggle("muted", Boolean(partMuteStates[i]));
    }
  }

  function invalidatePartMuteVisualState() {
    pianoRollVisibleCacheSignature = "";
    pianoRollLastDataSignature = "";
    activePlaybackScanBucket = -1;
    activePlaybackScanSignature = "";
  }


  function applyPartMuteAudioGains({ instant = false } = {}) {
    if (!audioCtx || audioCtx.state === "closed" || partPlaybackGains.length !== 6) return;
    const now = audioCtx.currentTime;
    const fadeSec = 0.012;
    for (let part = 0; part < 6; part++) {
      const gainNode = partPlaybackGains[part];
      const param = gainNode?.gain;
      if (!param) continue;
      const target = partMuteStates[part] ? 0 : 1;
      try {
        if (instant) {
          param.cancelScheduledValues(now);
          param.setValueAtTime(target, now);
          continue;
        }
        if (typeof param.cancelAndHoldAtTime === "function") {
          param.cancelAndHoldAtTime(now);
        } else {
          const current = Number.isFinite(param.value) ? param.value : (target ? 0 : 1);
          param.cancelScheduledValues(now);
          param.setValueAtTime(current, now);
        }
        param.linearRampToValueAtTime(target, now + fadeSec);
      } catch {
        try { param.value = target; } catch {}
      }
    }
  }

  function applyPartMuteStates(nextStates) {
    const playbackOffset = isPlaying ? getCurrentPlaybackOffset() : currentOffset;

    partMuteStates = Array.from({ length: 6 }, (_, i) => Boolean(nextStates?.[i]));
    savePartMutePrefs();
    applyPartMuteAudioGains();

    updatePartMuteControl();
    invalidatePartMuteVisualState();
    updatePlaybackCodeHighlight(playbackOffset);
    updatePianoRoll(playbackOffset, scheduleCache?.duration || Number(progressSlider?.max) || 0, true);
  }

  function handleMuteChannelChange() {
    const nextStates = Array.from({ length: 6 }, () => false);
    for (const checkbox of muteChannelCheckboxes) {
      const index = clampInt(Number(checkbox.dataset.mutePart), 0, 5);
      nextStates[index] = Boolean(checkbox.checked);
    }
    applyPartMuteStates(nextStates);
  }

  function setAllPartMuteStates(muted) {
    applyPartMuteStates(Array.from({ length: 6 }, () => Boolean(muted)));
  }

  function restartPlaybackAfterSoundChange() {
    if (!isPlaying) return;
    currentOffset = getCurrentPlaybackOffset();
    stopPlayback(false);
    void playFromCurrent();
  }

  function setSoundFontControlsBusy(busy) {
    if (soundFontLoadBtn) soundFontLoadBtn.disabled = Boolean(busy);
    if (soundFontResetBtn) soundFontResetBtn.disabled = Boolean(busy);
  }

  function soundBankCacheApi() {
    return window.MobibardSoundBankCache || null;
  }

  function soundBankExtension(name = "") {
    const match = String(name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function normalizeSoundBankSelectionMeta(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const mode = value.mode === "custom" ? "custom" : (value.mode === "default" ? "default" : "");
    if (!mode) return null;
    const updatedAt = String(value.updatedAt || "");
    if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) return null;
    const normalized = {
      version: 1,
      mode,
      updatedAt,
      name: String(value.name || "").slice(0, 255),
      extension: String(value.extension || "").replace(/^\./, "").toLowerCase().slice(0, 12),
      mimeType: String(value.mimeType || GOOGLE_SOUND_BANK_MIME).slice(0, 120),
      size: Math.max(0, Number(value.size) || 0),
      sha256: String(value.sha256 || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64)
    };
    return normalized;
  }

  function readSoundBankSelectionMeta() {
    return normalizeSoundBankSelectionMeta(readLocalJsonPref(SOUND_BANK_SELECTION_PREF));
  }

  function writeSoundBankSelectionMeta(meta) {
    const normalized = normalizeSoundBankSelectionMeta(meta);
    if (!normalized) return false;
    return writeLocalJsonPref(SOUND_BANK_SELECTION_PREF, normalized);
  }

  function newDefaultSoundBankSelectionMeta(updatedAt) {
    const resolvedUpdatedAt = updatedAt === undefined ? new Date().toISOString() : String(updatedAt || "");
    return {
      version: 1,
      mode: "default",
      updatedAt: resolvedUpdatedAt,
      name: "",
      extension: "",
      mimeType: GOOGLE_SOUND_BANK_MIME,
      size: 0,
      sha256: ""
    };
  }

  async function sha256Hex(bytes) {
    try {
      if (!window.crypto?.subtle) return "";
      const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
      const digest = await window.crypto.subtle.digest("SHA-256", view);
      return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return "";
    }
  }

  async function persistManualSoundBankCache(bytes, file) {
    const api = soundBankCacheApi();
    const updatedAt = new Date().toISOString();
    const name = String(file?.name || sf2Name || "SoundBank");
    const extension = soundBankExtension(name);
    const mimeType = String(file?.type || GOOGLE_SOUND_BANK_MIME);
    const sha256 = await sha256Hex(bytes);
    const meta = normalizeSoundBankSelectionMeta({
      version: 1,
      mode: "custom",
      updatedAt,
      name,
      extension,
      mimeType,
      size: bytes.byteLength,
      sha256
    });
    if (api?.putActive) {
      try {
        await api.putActive({
          bytes,
          name: meta.name,
          mimeType: meta.mimeType,
          extension: meta.extension,
          sha256: meta.sha256,
          updatedAt: meta.updatedAt
        });
      } catch (err) {
        console.warn("[Mobibard] Local sound-bank cache write failed.", err);
      }
    }
    writeSoundBankSelectionMeta(meta);
    return meta;
  }

  async function restoreCachedSoundBankFromLocal() {
    const meta = readSoundBankSelectionMeta();
    if (!meta || meta.mode !== "custom") {
      soundFontIsDefault = true;
      sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
      return false;
    }
    const api = soundBankCacheApi();
    if (!api?.getActive) return false;
    try {
      const cached = await api.getActive();
      if (!cached?.bytes?.byteLength) return false;
      if (meta.size > 0 && cached.bytes.byteLength !== meta.size) return false;
      if (meta.sha256 && cached.sha256 && meta.sha256 !== String(cached.sha256).toLowerCase()) return false;
      const parsed = await parseSoundBank(cached.bytes);
      soundFont = parsed;
      soundFontIsDefault = false;
      sf2Name = meta.name || cached.name || "SoundBank";
      return true;
    } catch (err) {
      console.warn("[Mobibard] Failed to restore cached sound bank.", err);
      return false;
    }
  }

  async function clearLocalSoundBankCache(updatedAt = new Date().toISOString()) {
    try { await soundBankCacheApi()?.clearActive?.(); } catch (err) {
      console.warn("[Mobibard] Failed to clear cached sound bank.", err);
    }
    const meta = newDefaultSoundBankSelectionMeta(updatedAt);
    writeSoundBankSelectionMeta(meta);
    return meta;
  }

  function updateSoundFontUi(message = "") {
    if (!soundName) return;
    if (message) {
      soundName.textContent = message;
      return;
    }
    soundName.textContent = soundFontIsDefault
      ? i18nText("snd.restore_default")
      : (sf2Name || "SoundBank");
  }

  function openSf2Picker() {
    if (!sf2File) return;
    sf2File.value = "";
    openFilePickerInput(sf2File);
  }

  async function restoreDefaultSoundFont(options = {}) {
    const silent = Boolean(options?.silent);
    const syncGoogle = options?.syncGoogle !== false;
    const persistSelection = options?.persistSelection !== false;
    const selectionUpdatedAt = String(options?.updatedAt || new Date().toISOString());
    stopPlayback(false);
    stopMidiPreview();
    setSoundFontControlsBusy(true);
    soundFont = null;
    soundFontIsDefault = true;
    sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
    if (sf2File) sf2File.value = "";
    updateSoundFontUi(i18nText("snd.reading_soundbank"));
    let selectionMeta = null;
    try {
      if (persistSelection) selectionMeta = await clearLocalSoundBankCache(selectionUpdatedAt);
      await loadDefaultSf2IfNeeded();
      updateSoundFontUi();
      if (partSoundDialog?.open) {
        draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
        renderPartSoundRows();
        updateSoundPresetControls();
      }
      if (syncGoogle && isGoogleConnected()) {
        void syncDefaultSoundBankSelectionToGoogle(selectionMeta || newDefaultSoundBankSelectionMeta(selectionUpdatedAt));
      }
    } catch (err) {
      updateSoundFontUi();
      if (!silent) showDialog(i18nText("snd.load_soundbank"), shortError(err));
    } finally {
      setSoundFontControlsBusy(false);
    }
  }

  function openSourceFilePicker() {
    if (!midiFile) return;
    midiFile.value = "";
    openFilePickerInput(midiFile);
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
    const name = file.name || i18nText("file.selected");
    const ext = getSourceFileExtension(name);
    googleDriveMmlFileName = "";
    clearSuggestedMmlSaveFileName();
    closeImportDialogsForSourceReload();
    try {
      stopMidiPreview();
      stopPlayback(false);
      if (window.MabiMusicFormats?.isSupported(name, file.type || "")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const importData = await buildPluginMidiImport(bytes, name, file.type || "");
        openMidiConvertDialog(importData);
      } else if (ext === "mmi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await readMabiIccoMmiFile(bytes, name);
        if (!loaded) return;
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_mmi", [shortError(optErr)]));
        }
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
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
          showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_3mle", [shortError(optErr)]));
        }
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
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
          showDialog(i18nText("mml.opt_skip"), i18nText("mml.opt_skip_file", [shortError(optErr)]));
        }
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
        trackAnalytics("local_import_mml", {
          file_type: analyticsFileType(ext),
          file_size: analyticsFileSizeBucket(file.size),
          channel_count: analyticsChannelCount(mainMml.value)
        });
      } else {
        throw new Error(i18nText("xml.unsupported_file"));
      }
    } catch (err) {
      showDialog(i18nText("file.load_fail"), shortError(err));
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
        showDialog(i18nText("file.load_fail"), i18nText("xml.drag_drop"));
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
    return Boolean(file && (window.MabiMusicFormats?.isSupported(file.name || "", file.type || "") || SOURCE_FILE_EXTENSIONS.has(getSourceFileExtension(file.name || ""))));
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
      throw new Error(i18nText("mml.txt_files"));
    }
    const m = raw.match(/^MML\s*@([\s\S]*);\s*$/i);
    if (!m) {
      throw new Error(i18nText("mml.semicolon_required"));
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
      flashButton(button, i18nText("ui.channel_count", [formatCount(count)]));
      return;
    }
    flashButton(button, label || i18nText("st.loaded"));
  }

  async function readMabiIccoMmiFile(data, name = i18nText("file.mmi")) {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    const candidates = extractMabiIccoMmlPartCandidates(text);
    if (!candidates.length) {
      throw new Error(i18nText("mml.code_not_found", [name]));
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }

  async function readThreeMleMmlFile(data, name = i18nText("mml.mle3_file")) {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    if (/^\s*MML\s*@/i.test(text)) {
      return readMmlTextFile(text);
    }
    const globalTempo = extractThreeMleGlobalTempo(text);
    const candidates = applyThreeMleGlobalTempoToCandidates(extractThreeMleMmlPartCandidates(text), globalTempo);
    if (!candidates.length) {
      throw new Error(i18nText("mml.mle3_channels_not_found", [name]));
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }


  function openMmiImportDialog(candidates, name = i18nText("file.mmi")) {
    const normalizedCandidates = (candidates || [])
      .map((candidate, index) => ({
        label: candidate.label || i18nText("ui.channel_n", [index + 1]),
        value: cleanupMmiMmlValue(candidate.value || ""),
        index
      }))
      .filter(candidate => candidate.value.trim())
      .slice(0, MMI_IMPORT_MAX_DETECTED_PARTS);

    if (!normalizedCandidates.length) {
      throw new Error(i18nText("mml.import_channels_not_found", [name]));
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

  function renderMmiImportDialog(name = i18nText("file.mmi")) {
    if (!pendingMmiImport || !mmiChannelList) return;
    const candidates = pendingMmiImport.candidates || [];
    if (mmiImportSummary) {
      mmiImportSummary.textContent = i18nText("mml.import_summary", [name, formatCount(candidates.length), MMI_IMPORT_MAX_CHANNELS]);
    }
    mmiChannelList.innerHTML = candidates.map((candidate, index) => {
      const normalized = normalizeMmiLegacyLengthsInPart(candidate.value);
      const changed = normalized !== candidate.value;
      const checked = index < MMI_IMPORT_MAX_CHANNELS ? " checked" : "";
      const preview = normalized.replace(/\s+/g, " ").slice(0, 180) || i18nText("ui.empty_ch");
      const meta = [i18nText("ui.char_count", [formatCount(normalized.length)])];
      if (changed) meta.push(i18nText("ui.length_correction"));
      return `
        <div class="mmi-channel-row${checked ? " selected" : ""}" data-mmi-row="${index}">
          <input class="mmi-channel-check" type="checkbox" value="${index}"${checked} aria-label="${escapeHtml(i18nText("aria.select_item", [candidate.label || i18nText("ui.channel_n", [index + 1])]))}" />
          <span class="mmi-channel-main">
            <strong>${escapeHtml(candidate.label || i18nText("ui.channel_n", [index + 1]))}</strong>
            <small>${escapeHtml(meta.join(" · "))}</small>
          </span>
          <code>${escapeHtml(preview)}${normalized.length > 180 ? "…" : ""}</code>
          <button class="mmi-preview-btn" type="button" data-mmi-preview="${index}" aria-label="${escapeHtml(i18nText("aria.listen_item", [candidate.label || i18nText("ui.channel_n", [index + 1])]))}">${escapeHtml(i18nText("ui.listen"))}</button>
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

  function setMmiImportStatus(message = "") {
    if (!mmiImportStatus) return;
    const text = String(message || "");
    mmiImportStatus.textContent = text;
    mmiImportStatus.closest(".mmi-import-status-row")?.toggleAttribute("hidden", !text);
  }

  function updateMmiImportSelectionState() {
    if (!mmiChannelList) return;
    const checks = Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check"));
    const checked = checks.filter(input => input.checked);
    const checkedCount = checked.length;
    if (mmiImportTitle) {
      mmiImportTitle.textContent = i18nText("mml.select_chs_total", [checkedCount, MMI_IMPORT_MAX_CHANNELS]);
    }
    for (const input of checks) {
      input.disabled = !input.checked && checkedCount >= MMI_IMPORT_MAX_CHANNELS;
      input.closest(".mmi-channel-row")?.classList.toggle("selected", Boolean(input.checked));
    }
    setMmiImportStatus(checkedCount ? "" : i18nText("msg.select_one_ch"));
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
      setMmiImportStatus(i18nText("msg.select_one_ch_2"));
      return;
    }

    await playMmiImportPartsPreview(selectedParts, {
      button,
      statusText: i18nText("mml.preview_selected_status", [selectedParts.length, MMI_IMPORT_MAX_CHANNELS]),
      errorPrefix: i18nText("err.preview_select")
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
      setMmiImportStatus(i18nText("mml.file_contain"));
      return;
    }

    await playMmiImportPartsPreview(allParts, {
      button,
      statusText: i18nText("mml.preview_all_status", [allParts.length]),
      errorPrefix: i18nText("err.preview_all"),
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
      setMmiImportStatus(i18nText("mml.no_chs"));
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      setMmiImportStatus(options.statusText || i18nText("ui.preview_wait"));

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const scheduled = buildMmiImportPreviewSchedule(parts, { allowManyParts: Boolean(options.allowManyParts) });
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error(i18nText("msg.no_notes_preview"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));

      const prepared = prepareMmiImportPreviewNotes(ctx, notes, parts.length);
      if (!prepared.length) throw new Error(i18nText("msg.no_audible"));

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
      setMmiImportStatus(i18nText("err.with_detail", [options.errorPrefix || i18nText("err.preview"), shortError(err)]));
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
        button.textContent = i18nText("player.stop");
        button.classList.add("danger");
        button.setAttribute("aria-pressed", "true");
      }
      setMmiImportStatus(i18nText("mml.preview_channel_status", [candidate.label || i18nText("ui.channel_selected")]));

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const part = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(candidate.value || ""));
      const mml = composeMml([part, "", "", "", "", ""], { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS });
      const parsed = parseMabinogiMml(mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error(i18nText("msg.no_notes_preview"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));

      const firstStart = notes.reduce((m, n) => Math.min(m, Number(n.start) || 0), Infinity);
      const lastEnd = notes.reduce((m, n) => Math.max(m, (Number(n.start) || 0) + (Number(n.durationSec) || 0)), 0);
      const fromSec = Number.isFinite(firstStart) ? Math.max(0, firstStart) : 0;
      const windowEnd = Math.min(lastEnd, fromSec + 10);
      const preset = getPartPreset(0);
      if (!preset) throw new Error(i18nText("snd.find_preview"));
      const prepared = prepareNotes(ctx, soundFont, preset, notes).sort((a, b) => a.start - b.start || a.midi - b.midi);
      for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
      if (!prepared.length) throw new Error(i18nText("msg.no_audible"));
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
      setMmiImportStatus(i18nText("err.with_detail", [i18nText("err.preview"), shortError(err)]));
    }
  }

  function applyMmiImportDialog() {
    if (!pendingMmiImport || !mmiChannelList) return;
    const selectedParts = getSelectedMmiImportParts();
    if (!selectedParts.length) {
      setMmiImportStatus(i18nText("msg.select_one_ch"));
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
    const sourceLabel = getMidiImportSourceLabel(importData);
    const overview = importData.overview;
    const groups = overview.instrumentGroups || overview.channels || [];
    if (!groups.length) {
      pendingMidiImport = null;
      throw new Error(i18nText("midi.group_not_found", [sourceLabel]));
    }

    pendingMidiSettings = createDefaultMidiSettings(groups);
    midiInstrumentSectionOpenState.clear();
    const restoredCachedSettings = restoreLastMidiConvertSettings(importData, pendingMidiSettings);
    if (!restoredCachedSettings) applyInitialMidiGroupAssignment(pendingMidiSettings);

    if (midiConvertTitle) midiConvertTitle.textContent = i18nText("cfg.conv_cfg", [sourceLabel]);
    if (midiGuideBox) midiGuideBox.setAttribute("aria-label", i18nText("midi.guide_label", [sourceLabel]));
    if (midiGuideLead) midiGuideLead.textContent = i18nText("midi.help_source", [sourceLabel]);
    updateMidiConvertSummary();
    updateMidiQuantizeToggle();
    setMidiFullPreviewState(false);
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

  let sourceFingerprintCrcTable = null;

  function buildSourceFileFingerprint(sourceType, bytes) {
    let data;
    if (bytes instanceof Uint8Array) {
      data = bytes;
    } else if (ArrayBuffer.isView(bytes)) {
      data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else if (bytes instanceof ArrayBuffer) {
      data = new Uint8Array(bytes);
    } else {
      data = new Uint8Array(0);
    }
    if (!sourceFingerprintCrcTable) {
      sourceFingerprintCrcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
          value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        sourceFingerprintCrcTable[i] = value >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = sourceFingerprintCrcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    const checksum = ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0");
    return `${String(sourceType || "midi").toLowerCase()}:${data.byteLength}:${checksum}`;
  }

  function getMidiImportCacheFingerprint(importData) {
    const saved = String(importData?.cacheFingerprint || "").trim();
    if (saved) return saved;
    return buildSourceFileFingerprint(importData?.sourceType || "midi", importData?.bytes);
  }

  function midiGroupCacheSignature(group) {
    return [
      Number.isInteger(group?.bankMsb) ? group.bankMsb : 0,
      Number.isInteger(group?.bankLsb) ? group.bankLsb : 0,
      Number.isInteger(group?.program) ? group.program : 0,
      Number.isInteger(group?.drumMidi) ? group.drumMidi : "-",
      Number(group?.noteCount) || 0,
      Array.isArray(group?.sourceGroupIds) ? group.sourceGroupIds.length : 0,
      group?.isBeat ? 1 : 0
    ].join(":");
  }

  function serializeMidiConvertSettings(importData, settings) {
    const groups = Array.isArray(settings?.groups) ? settings.groups : [];
    const indexById = new Map(groups.map((group, index) => [String(group.id), index]));
    return {
      version: MIDI_CONVERT_CACHE_VERSION,
      fingerprint: getMidiImportCacheFingerprint(importData),
      sourceType: String(importData?.sourceType || "midi"),
      sourceName: String(importData?.name || ""),
      savedAt: Date.now(),
      groupSignatures: groups.map(midiGroupCacheSignature),
      quantizeDivision: Number(settings?.quantizeDivision) === 32 ? 32 : 64,
      channels: Array.from({ length: 6 }, (_, index) => {
        const channel = settings?.channels?.[index] || {};
        const selectedGroupIndexes = Array.from(channel.selectedInstrumentGroups || [])
          .map(id => indexById.get(String(id)))
          .filter(groupIndex => Number.isInteger(groupIndex));
        return {
          role: ["auto", "high", "low"].includes(channel.role) ? channel.role : "auto",
          overlapMergeMode: normalizeOverlapMergeMode(channel.overlapMergeMode ?? channel.overlapMerge),
          selectedGroupIndexes
        };
      }),
      sectionOpenState: Object.fromEntries(
        MIDI_INSTRUMENT_CATEGORY_ORDER
          .filter(category => midiInstrumentSectionOpenState.has(category))
          .map(category => [category, midiInstrumentSectionOpenState.get(category) !== false])
      )
    };
  }

  function saveLastMidiConvertSettings(importData, settings) {
    if (!importData || !settings) return;
    writeLocalJsonPref(MIDI_CONVERT_CACHE_PREF, serializeMidiConvertSettings(importData, settings));
  }

  function restoreLastMidiConvertSettings(importData, settings) {
    const cached = readLocalJsonPref(MIDI_CONVERT_CACHE_PREF);
    if (!cached || cached.version !== MIDI_CONVERT_CACHE_VERSION) return false;
    if (cached.fingerprint !== getMidiImportCacheFingerprint(importData)) return false;

    const groups = Array.isArray(settings?.groups) ? settings.groups : [];
    const signatures = groups.map(midiGroupCacheSignature);
    if (!Array.isArray(cached.groupSignatures)
      || cached.groupSignatures.length !== signatures.length
      || cached.groupSignatures.some((signature, index) => signature !== signatures[index])) {
      return false;
    }

    settings.quantizeDivision = Number(cached.quantizeDivision) === 32 ? 32 : 64;
    for (let index = 0; index < 6; index++) {
      const target = settings.channels?.[index];
      const source = cached.channels?.[index];
      if (!target || !source) continue;
      target.role = ["auto", "high", "low"].includes(source.role) ? source.role : target.role;
      target.overlapMergeMode = normalizeOverlapMergeMode(source.overlapMergeMode);
      target.overlapMerge = target.overlapMergeMode !== "none";
      target.selectedInstrumentGroups.clear();
      for (const groupIndex of source.selectedGroupIndexes || []) {
        const group = groups[Number(groupIndex)];
        if (group) target.selectedInstrumentGroups.add(group.id);
      }
    }

    const openState = cached.sectionOpenState;
    if (openState && typeof openState === "object" && !Array.isArray(openState)) {
      for (const category of MIDI_INSTRUMENT_CATEGORY_ORDER) {
        if (typeof openState[category] === "boolean") {
          midiInstrumentSectionOpenState.set(category, openState[category]);
        }
      }
    }
    return true;
  }

  function createDefaultMidiSettings(groups) {
    const allGroups = Array.isArray(groups) ? groups : [];
    const channelSettings = Array.from({ length: 6 }, (_, i) => {
      const role = i === 0 ? "high" : (i === 2 ? "low" : "auto");
      const overlapMergeMode = (i === 0 || i === 2) ? "half" : "all";
      return {
        role,
        overlapMerge: overlapMergeMode !== "none",
        overlapMergeMode,
        selectedInstrumentGroups: new Set()
      };
    });
    return {
      groups: allGroups,
      quantizeDivision: 64,
      partCount: 0,
      channels: channelSettings
    };
  }

  function applyInitialMidiGroupAssignment(settings) {
    if (!settings?.groups?.length || !Array.isArray(settings.channels)) return;
    const sortedGroups = sortMidiInstrumentGroups(settings.groups);
    const firstGroup = sortedGroups[0];
    if (!firstGroup) return;
    const firstCategory = getMidiInstrumentCategory(firstGroup);
    if (firstCategory === "drums") return;

    const firstCategoryGroupIds = sortedGroups
      .filter(group => getMidiInstrumentCategory(group) === firstCategory)
      .map(group => group.id);

    for (const channelIndex of [0, 1, 2]) {
      const selected = settings.channels[channelIndex]?.selectedInstrumentGroups;
      if (!selected) continue;
      for (const groupId of firstCategoryGroupIds) selected.add(groupId);
    }
  }

  function updateMidiQuantizeToggle() {
    if (!midiQuantizeToggle) return;
    const division = Number(pendingMidiSettings?.quantizeDivision) === 32 ? 32 : 64;
    midiQuantizeToggle.textContent = i18nText(division === 32 ? "midi.quantize_32" : "midi.quantize_64");
    midiQuantizeToggle.setAttribute("aria-pressed", division === 32 ? "true" : "false");
    midiQuantizeToggle.setAttribute("aria-label", i18nText("midi.quantize_current", [division]));
    midiQuantizeToggle.title = i18nText("midi.quantize_toggle");
  }

  function toggleMidiQuantizeDivision() {
    if (!pendingMidiSettings || midiConvertBusy) return;
    stopMidiPreview();
    pendingMidiSettings.quantizeDivision = Number(pendingMidiSettings.quantizeDivision) === 32 ? 64 : 32;
    updateMidiQuantizeToggle();
    if (midiConvertStatus) {
      midiConvertStatus.textContent = i18nText("midi.quantize_changed", [pendingMidiSettings.quantizeDivision]);
      midiConvertStatus.hidden = false;
    }
  }

  function refreshMidiConvertLocale() {
    if (!pendingMidiImport || !pendingMidiSettings) return;
    const sourceLabel = getMidiImportSourceLabel(pendingMidiImport);
    if (midiConvertTitle) midiConvertTitle.textContent = i18nText("cfg.conv_cfg", [sourceLabel]);
    if (midiGuideBox) midiGuideBox.setAttribute("aria-label", i18nText("midi.guide_label", [sourceLabel]));
    if (midiGuideLead) midiGuideLead.textContent = i18nText("midi.help_source", [sourceLabel]);
    updateMidiConvertSummary();
    updateMidiQuantizeToggle();
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
    setMidiFullPreviewState(midiFullPreviewActive);
    setMidiSelectedPreviewState(midiSelectedPreviewActive);
  }


  function renderMidiRoleList() {
    if (!midiRoleList || !pendingMidiSettings) return;
    midiRoleList.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      const row = document.createElement("div");
      row.className = `midi-role-row midi-export-channel part-${i}`;
      row.dataset.channelIndex = String(i);
      const selectOptions = [
        `<option value="auto" ${setting.role === "auto" ? "selected" : ""}>${escapeHtml(i18nText("ui.auto"))}</option>`,
        `<option value="high" ${setting.role === "high" ? "selected" : ""}>${escapeHtml(i18nText("ui.high"))}</option>`,
        `<option value="low" ${setting.role === "low" ? "selected" : ""}>${escapeHtml(i18nText("ui.low"))}</option>`
      ].join("");
      const mergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      setting.overlapMergeMode = mergeMode;
      setting.overlapMerge = mergeMode !== "none";
      const mergeOptions = OVERLAP_MERGE_OPTIONS.map(opt =>
        `<option value="${opt.value}" ${mergeMode === opt.value ? "selected" : ""}>${escapeHtml(i18nText(opt.labelKey))}</option>`
      ).join("");
      row.innerHTML = `
        <div class="midi-channel-summary">
          <span class="midi-export-label">${PART_LABELS[i]}</span>
          <span class="midi-export-summary">${escapeHtml(summarizeMidiChannelInstruments(i))}</span>
        </div>
        <select data-role-index="${i}" aria-label="${escapeHtml(i18nText("aria.role", [PART_LABELS[i]]))}">
          ${selectOptions}
        </select>
        <label class="merge-mode">
          <span>${escapeHtml(i18nText("ui.overlap"))}</span>
          <select data-merge-index="${i}" aria-label="${escapeHtml(i18nText("aria.merge_mode", [PART_LABELS[i]]))}">
            ${mergeOptions}
          </select>
          <span>${escapeHtml(i18nText("ui.merge"))}</span>
        </label>
        <button class="midi-role-preview-btn" type="button" data-midi-part-preview="${i}" aria-label="${escapeHtml(i18nText("aria.preview", [PART_LABELS[i]]))}">${escapeHtml(i18nText("ui.listen"))}</button>
      `;
      row.querySelector("[data-role-index]")?.addEventListener("change", (ev) => {
        updateMidiChannelRole(i, String(ev.target.value || "auto"));
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
    if (!leftHeight || !headHeight) {
      midiChannelList.style.height = previousHeight;
      midiChannelList.style.minHeight = previousMinHeight;
      midiChannelList.style.maxHeight = previousMaxHeight;
      return;
    }

    const styles = window.getComputedStyle(rightPanel);
    const rowGap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
    const availableHeight = Math.max(160, leftHeight - headHeight - rowGap);
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
    const requestedRole = String(role || "auto").toLowerCase();
    setting.role = ["auto", "high", "low"].includes(requestedRole) ? requestedRole : "auto";
    renderMidiRoleList();
    updateMidiRoleControls();
  }

  function summarizeMidiChannelInstruments(index) {
    if (!pendingMidiSettings) return "";
    const setting = pendingMidiSettings.channels[index];
    const allowed = getAllowedMidiGroupsForSetting(setting);
    const selectedCount = allowed.filter(g => setting.selectedInstrumentGroups.has(g.id)).length;
    return i18nText("midi.selected_inst_count", [formatCount(selectedCount)]);
  }

  function normalizeOverlapMergeMode(value) {
    if (value === true || value === "true") return "all";
    if (value === false || value === "false") return "none";
    const mode = String(value || "all").toLowerCase();
    return OVERLAP_MERGE_OPTIONS.some(opt => opt.value === mode) ? mode : "all";
  }


  function getMidiGroupSelectableChannels(group) {
    if (!pendingMidiSettings || !group) return [];
    return Array.from({ length: 6 }, (_, i) => ({
      index: i,
      label: PART_LABELS[i] || i18nText("ui.numbered", [i + 1]),
      selected: Boolean(pendingMidiSettings.channels[i]?.selectedInstrumentGroups?.has(group.id))
    }));
  }

  function renderMidiGroupChannelButtons(group) {
    const items = getMidiGroupSelectableChannels(group);
    if (!items.length) return "";
    const shortLabel = (item) => item.index === 0 ? i18nText("ui.mel") : String(item.index);
    return items.map(item => `
      <button
        class="midi-part-chip midi-part-toggle part-${item.index}${item.selected ? " selected" : ""}"
        type="button"
        data-midi-group-channel="${item.index}"
        aria-pressed="${item.selected ? "true" : "false"}"
        aria-label="${escapeHtml(i18nText("aria.select_item", [item.label]))}"
        title="${escapeHtml(item.label)}"
      >${escapeHtml(shortLabel(item))}</button>
    `).join("");
  }

  function toggleMidiGroupChannel(groupId, channelIndex) {
    if (!pendingMidiSettings) return;
    const index = clampInt(Number(channelIndex), 0, 5);
    const group = pendingMidiSettings.groups.find(item => String(item.id) === String(groupId));
    const setting = pendingMidiSettings.channels[index];
    if (!group || !setting) return;
    if (setting.selectedInstrumentGroups.has(group.id)) setting.selectedInstrumentGroups.delete(group.id);
    else setting.selectedInstrumentGroups.add(group.id);
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }

  function getAllowedMidiGroupsForSetting(setting) {
    if (!pendingMidiSettings || !setting) return [];
    return pendingMidiSettings.groups;
  }


  function getMidiInstrumentCategory(group) {
    if (!group) return "other";
    if (group.isDrumNoteGroup || Number.isInteger(group.drumMidi)) return "drums";
    const rawProgram = Number(group.program);
    const hasProgram = Number.isFinite(rawProgram);
    const program = hasProgram ? clampInt(rawProgram, 0, 127) : null;
    const name = String(group.instrumentName || group.programText || "").toLowerCase();

    if (hasProgram) {
      if ([52, 53, 54, 85, 91, 101, 121, 123].includes(program)) return "vocal";
      if ((program >= 0 && program <= 7) || (program >= 16 && program <= 20) || program === 21 || program === 23) return "keyboard";
      if ((program >= 24 && program <= 46) || (program >= 48 && program <= 51) || (program >= 104 && program <= 107) || program === 110) return "strings";
      if (program === 22 || (program >= 56 && program <= 79) || program === 109 || program === 111) return "winds";
    }

    if (/(choir|chorus|voice|vocal|vocoder|aahs?|oohs?|sing|singer|chant|breath|bird|goblin|합창|보컬|목소리|코러스|성악|人声|人聲|合唱|ボーカル|コーラス|声)/i.test(name)) return "vocal";
    if (/(piano|keyboard|organ|harpsichord|clavinet|clavi|accordion)/i.test(name)) return "keyboard";
    if (/(bassoon|trumpet|trombone|tuba|horn|brass|sax|oboe|clarinet|piccolo|flute|recorder|pipe|whistle|ocarina|harmonica|shanai|bagpipe|bag pipe)/i.test(name)) return "winds";
    if (/(guitar|\bbass\b|violin|viola|cello|contrabass|string|harp|sitar|banjo|shamisen|koto|fiddle)/i.test(name)) return "strings";
    return "other";
  }

  function sortMidiInstrumentGroups(groups) {
    return [...(groups || [])].sort((a, b) => {
      const ca = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(a));
      const cb = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(b));
      const oa = ca >= 0 ? ca : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      const ob = cb >= 0 ? cb : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      return oa - ob
        || (Number(a.bankMsb) || 0) - (Number(b.bankMsb) || 0)
        || (Number(a.bankLsb) || 0) - (Number(b.bankLsb) || 0)
        || (Number(a.program) || 0) - (Number(b.program) || 0)
        || (Number.isInteger(a.drumMidi) ? a.drumMidi : -1) - (Number.isInteger(b.drumMidi) ? b.drumMidi : -1)
        || String(a.instrumentName || a.programText || "").localeCompare(String(b.instrumentName || b.programText || ""), "ko")
        || String(a.id).localeCompare(String(b.id));
    });
  }

  function setMidiBulkChannelButtonState(button, selected) {
    if (!button) return;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.classList.toggle("selected", selected);
  }

  function updateMidiBulkAllButtonState() {
    if (!midiBulkAllBtn) return;
    const allSelected = midiBulkChannelButtons.length > 0
      && midiBulkChannelButtons.every(button => button.getAttribute("aria-pressed") === "true");
    setMidiBulkChannelButtonState(midiBulkAllBtn, allSelected);
  }

  function updateMidiBulkAllInstrumentButtonState() {
    if (!midiBulkAllInstrumentBtn) return;
    const availableButtons = midiBulkInstrumentButtons.filter(button => !button.disabled);
    const allSelected = availableButtons.length > 0
      && availableButtons.every(button => button.getAttribute("aria-pressed") === "true");
    setMidiBulkChannelButtonState(midiBulkAllInstrumentBtn, allSelected);
  }

  function updateMidiBulkInstrumentAvailability() {
    const categoryCounts = new Map();
    for (const group of pendingMidiSettings?.groups || []) {
      const category = getMidiInstrumentCategory(group);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    let availableCount = 0;
    for (const button of midiBulkInstrumentButtons) {
      const category = String(button.dataset.midiBulkCategory || "");
      const count = categoryCounts.get(category) || 0;
      const disabled = count === 0;
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
      button.dataset.instrumentCount = String(count);
      if (disabled) setMidiBulkChannelButtonState(button, false);
      else availableCount += 1;
    }

    if (midiBulkAllInstrumentBtn) {
      midiBulkAllInstrumentBtn.disabled = availableCount === 0;
      midiBulkAllInstrumentBtn.setAttribute("aria-disabled", availableCount === 0 ? "true" : "false");
      if (availableCount === 0) setMidiBulkChannelButtonState(midiBulkAllInstrumentBtn, false);
    }
    updateMidiBulkAllInstrumentButtonState();
  }

  function openMidiBulkAssignDialog() {
    if (!pendingMidiSettings || midiConvertBusy || !midiBulkAssignDialog) return;
    for (const button of midiBulkChannelButtons) setMidiBulkChannelButtonState(button, false);
    updateMidiBulkAllButtonState();
    for (const button of midiBulkInstrumentButtons) setMidiBulkChannelButtonState(button, false);
    updateMidiBulkInstrumentAvailability();
    if (midiBulkAssignDialog.showModal) midiBulkAssignDialog.showModal();
  }

  function getMidiBulkTargetGroups(categories) {
    if (!pendingMidiSettings) return [];
    const targets = categories instanceof Set ? categories : new Set(categories || []);
    return pendingMidiSettings.groups.filter(group => targets.has(getMidiInstrumentCategory(group)));
  }

  function applyMidiBulkAssignment(checked) {
    if (!pendingMidiSettings) return;
    const channelIndexes = midiBulkChannelButtons
      .filter(button => button.getAttribute("aria-pressed") === "true")
      .map(button => clampInt(Number(button.dataset.midiBulkChannel), 0, 5));
    if (!channelIndexes.length) {
      showDialog(i18nText("midi.bulk_assign"), i18nText("midi.choose_target_channel"));
      return;
    }
    const targetCategories = new Set(
      midiBulkInstrumentButtons
        .filter(button => !button.disabled && button.getAttribute("aria-pressed") === "true")
        .map(button => String(button.dataset.midiBulkCategory || ""))
        .filter(Boolean)
    );
    if (!targetCategories.size) {
      showDialog(i18nText("midi.bulk_assign"), i18nText("midi.choose_target_instrument"));
      return;
    }
    const groups = getMidiBulkTargetGroups(targetCategories);
    for (const index of channelIndexes) {
      const selected = pendingMidiSettings.channels[index]?.selectedInstrumentGroups;
      if (!selected) continue;
      for (const group of groups) {
        if (checked) selected.add(group.id);
        else selected.delete(group.id);
      }
    }
    midiBulkAssignDialog?.close();
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }

  function renderActiveMidiInstrumentList() {
    if (!midiChannelList || !pendingMidiSettings) return;
    const groups = sortMidiInstrumentGroups(pendingMidiSettings.groups || []);
    if (midiInstrumentPanelTitle) midiInstrumentPanelTitle.textContent = i18nText("midi.instrument_channel_select");

    const previousScrollTop = midiChannelList.scrollTop;
    midiChannelList.querySelectorAll("details.midi-instrument-section[data-midi-category]").forEach(section => {
      midiInstrumentSectionOpenState.set(String(section.dataset.midiCategory || ""), section.open);
    });
    midiChannelList.innerHTML = "";
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "midi-instrument-empty";
      empty.textContent = i18nText("snd.no_inst");
      midiChannelList.appendChild(empty);
      scheduleMidiInstrumentListHeightSync();
      return;
    }

    const makeRow = (group) => {
      const row = document.createElement("div");
      row.className = `midi-channel-row midi-instrument-row${getMidiInstrumentCategory(group) === "drums" ? " percussion" : ""}`;
      row.innerHTML = `
        <div class="midi-channel-main">
          <strong>${escapeHtml(group.displayName || [group.instrumentName || group.programText || i18nText("snd.no_inst"), group.partName].filter(Boolean).join(" · "))}</strong>
        </div>
        <span class="midi-channel-sub">
          ${group.bankText ? `<span>${escapeHtml(group.bankText)}</span>` : ""}
          ${group.programNumberText ? `<span>${escapeHtml(group.programNumberText)}</span>` : ""}
          ${escapeHtml(i18nText("snd.note_count_range", [formatCount(group.noteCount), group.rangeText || i18nText("ui.no_notes")]))}
          ${group.duplicateMerged ? `<em>${escapeHtml(i18nText("snd.dup_merge", [formatCount(group.duplicateMerged)]))}</em>` : ""}
        </span>
        <div class="midi-instrument-row-actions">
          <button class="midi-preview-btn" type="button" data-midi-preview="${escapeHtml(group.id)}">${escapeHtml(i18nText("ui.listen"))}</button>
          <div class="midi-instrument-selected-parts" aria-label="${escapeHtml(i18nText("mml.chs"))}">${renderMidiGroupChannelButtons(group)}</div>
        </div>
      `;
      row.querySelector("[data-midi-preview]")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMidiInstrument(group.id, ev.currentTarget);
      });
      row.querySelectorAll("[data-midi-group-channel]").forEach(button => {
        button.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          toggleMidiGroupChannel(group.id, Number(button.dataset.midiGroupChannel));
        });
      });
      return row;
    };

    const grouped = new Map(MIDI_INSTRUMENT_CATEGORY_ORDER.map(key => [key, []]));
    for (const group of groups) {
      const key = getMidiInstrumentCategory(group);
      grouped.get(grouped.has(key) ? key : "other").push(group);
    }
    for (const key of MIDI_INSTRUMENT_CATEGORY_ORDER) {
      const items = grouped.get(key) || [];
      if (!items.length) continue;
      const label = i18nText(MIDI_INSTRUMENT_CATEGORY_LABEL_KEYS[key] || "midi.other_instruments");
      const section = document.createElement("details");
      section.dataset.midiCategory = key;
      section.open = midiInstrumentSectionOpenState.get(key) !== false;
      section.className = `midi-instrument-section midi-instrument-category-section category-${key}`;
      section.addEventListener("toggle", () => {
        midiInstrumentSectionOpenState.set(key, section.open);
      });
      section.innerHTML = `
        <summary class="midi-instrument-section-head">
          <strong>${escapeHtml(i18nText("ui.name_count", [label, formatCount(items.length)]))}</strong>
        </summary>
      `;
      for (const group of items) section.appendChild(makeRow(group));
      midiChannelList.appendChild(section);
    }
    scheduleMidiInstrumentListHeightSync();
    requestAnimationFrame(() => {
      if (midiChannelList) midiChannelList.scrollTop = previousScrollTop;
    });
  }

  function collectMidiConvertOptionsForSingleChannel(index) {
    const sourceLabel = getMidiImportSourceLabel();
    if (!pendingMidiSettings) throw new Error(i18nText("midi.settings_missing", [sourceLabel]));
    const sourceIndex = clampInt(Number(index), 0, 5);
    const setting = pendingMidiSettings.channels[sourceIndex];
    const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
    const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
    if (!selected.length) throw new Error(i18nText("midi.select_inst_for_channel", [PART_LABELS[sourceIndex]]));
    const overlapMergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
    return {
      partCount: 1,
      roles: [setting.role || "auto"],
      sourcePartIndex: sourceIndex,
      sourceLabel,
      quantizeDivision: Number(pendingMidiSettings.quantizeDivision) === 32 ? 32 : 64,
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
      showDialog(i18nText("err.preview_3"), shortError(err));
      return;
    }
    const sourceLabel = options.sourceLabel || getMidiImportSourceLabel();

    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiSelectedPreviewState(true);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = i18nText("mml.prepare_preview");
        midiConvertStatus.hidden = false;
      }
      await loadDefaultSf2IfNeeded();
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, { ...options, sourceLabel });
      const normalized = normalizeImportedFullMml(result.mml);
      const parsed = parseMabinogiMml(normalized.mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error(i18nText("cfg.no_notes_play"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));
      const ctx = await ensureAudioContext();
      const presetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const prepared = prepareNotesWithPresetKeys(ctx, notes, presetKeys, { respectMute: false });
      if (!prepared.length) throw new Error(i18nText("snd.no_audible"));
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
        midiConvertStatus.textContent = i18nText("ui.preview_wait_2");
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
      showDialog(i18nText("err.preview_3"), shortError(err));
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
      showDialog(i18nText("err.ch_preview"), shortError(err));
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiChannelPreviewButton(button);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = i18nText("midi.preview_prepare_channel", [PART_LABELS[sourceIndex]]);
        midiConvertStatus.hidden = false;
      }
      await loadDefaultSf2IfNeeded();
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const normalized = normalizeImportedFullMml(result.mml);
      const parsed = parseMabinogiMml(normalized.mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error(i18nText("cfg.no_notes_play_2"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));
      const ctx = await ensureAudioContext();
      const presetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const prepared = prepareNotesWithPresetKeys(ctx, notes, presetKeys, { respectMute: false });
      if (!prepared.length) throw new Error(i18nText("snd.no_audible"));
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
        midiConvertStatus.textContent = i18nText("midi.previewing_channel", [PART_LABELS[sourceIndex]]);
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
      showDialog(i18nText("err.ch_preview"), shortError(err));
    }
  }

  async function toggleMidiFullPreview() {
    if (!pendingMidiImport) return;
    const sourceLabel = getMidiImportSourceLabel();
    if (midiFullPreviewActive) {
      stopMidiPreview();
      return;
    }
    try {
      stopPlayback(false);
      stopMidiPreview();
      setMidiFullPreviewState(true);
      if (midiConvertStatus) {
        midiConvertStatus.textContent = i18nText("midi.preview_prepare", [sourceLabel]);
        midiConvertStatus.hidden = false;
      }
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
      if (!prepared.length) throw new Error(i18nText("midi.preview_sound_missing", [sourceLabel]));
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
        midiConvertStatus.textContent = i18nText("midi.previewing", [sourceLabel]);
        midiConvertStatus.hidden = false;
      }
      const stopMs = Math.max(800, Math.min(60000, (result.maxEnd - ctx.currentTime + 0.3) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      stopMidiPreview();
      if (midiConvertStatus) midiConvertStatus.hidden = true;
      showDialog(i18nText("midi.preview_fail_title", [sourceLabel]), shortError(err));
    }
  }

  function setMidiFullPreviewState(active) {
    midiFullPreviewActive = Boolean(active);
    if (midiFullPreviewBtn) {
      midiFullPreviewBtn.textContent = midiFullPreviewActive ? i18nText("player.stop") : i18nText("midi.listen_original");
      midiFullPreviewBtn.classList.toggle("danger", midiFullPreviewActive);
      midiFullPreviewBtn.setAttribute("aria-pressed", midiFullPreviewActive ? "true" : "false");
    }
  }

  function setMidiSelectedPreviewState(active) {
    midiSelectedPreviewActive = Boolean(active);
    if (midiSelectedPreviewBtn) {
      midiSelectedPreviewBtn.textContent = midiSelectedPreviewActive ? i18nText("player.stop") : i18nText("midi.listen_mml");
      midiSelectedPreviewBtn.classList.toggle("danger", midiSelectedPreviewActive);
      midiSelectedPreviewBtn.setAttribute("aria-pressed", midiSelectedPreviewActive ? "true" : "false");
    }
  }

  async function previewMidiInstrument(groupId, triggerButton = null) {
    if (!pendingMidiImport) return;
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalText = button?.textContent || i18nText("ui.listen");
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) {
        button.disabled = true;
        button.textContent = i18nText("ui.play");
      }
      await loadDefaultSf2IfNeeded();
      const preview = buildMidiInstrumentPreview(pendingMidiImport.bytes, groupId, { maxSeconds: 8, tailSeconds: 0.75 });
      const ctx = await ensureAudioContext();
      const preset = findPreviewPreset(preview);
      if (!preset) throw new Error(i18nText("snd.find_sf2_preset"));
      const prepared = prepareNotes(ctx, soundFont, preset, preview.notes);
      if (!prepared.length) throw new Error(i18nText("snd.find_preview_sf2"));
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
      showDialog(i18nText("snd.inst_preview"), shortError(err));
    } finally {
      if (button) {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 350);
      }
    }
  }

  function findMidiBankPreset(bankMsb, bankLsb, program, options = {}) {
    if (!soundFont || !Array.isArray(soundFont.presets)) return null;
    const msb = clampInt(Number(bankMsb) || 0, 0, 127);
    const lsb = clampInt(Number(bankLsb) || 0, 0, 127);
    const presetNumber = clampInt(Number(program) || 0, 0, 127);
    const exactBanks = options.preferDrum ? [128, msb * 128 + lsb, lsb, msb] : [msb * 128 + lsb, lsb, msb];
    for (const bank of [...new Set(exactBanks)]) {
      const preset = soundFont.presets.find(p => p.bank === bank && p.preset === presetNumber);
      if (preset) return preset;
    }
    // Requested instrument is unavailable in the selected SF/SF3/DLS:
    // use the bundled original sound bank's Bank 0 with the same program,
    // then Bank 0 / Program 0 as the last audible fallback.
    const originalPresets = Array.isArray(defaultSoundFont?.presets) ? defaultSoundFont.presets : [];
    return originalPresets.find(p => p.bank === 0 && p.preset === presetNumber)
      || originalPresets.find(p => p.bank === 0 && p.preset === 0)
      || null;
  }

  function findPreviewPreset(preview) {
    return findMidiBankPreset(
      preview?.bankMsb,
      preview?.bankLsb,
      preview?.program,
      { preferDrum: Boolean(preview?.isBeat) }
    );
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
      midiChannelPreviewButton.textContent = midiChannelPreviewButtonText || i18nText("ui.listen");
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
    midiChannelPreviewButtonText = button.textContent || i18nText("ui.listen");
    button.textContent = i18nText("player.stop");
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
  }

  function resetSplitPreviewButton() {
    if (!splitPreviewButton) return;
    try {
      splitPreviewButton.textContent = splitPreviewButtonText || i18nText("ui.listen");
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
    splitPreviewButtonText = button.textContent || i18nText("ui.listen");
    button.textContent = i18nText("player.stop");
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
  }

  function updateMidiConvertSummary() {
    if (!midiConvertSummary || !pendingMidiImport) return;
    const overview = pendingMidiImport.overview || {};
    const sourceLabel = pendingMidiImport.name || getMidiImportSourceLabel(pendingMidiImport);
    const selectedChannelCount = pendingMidiSettings ? countActiveMidiExportChannels() : 0;
    midiConvertSummary.textContent = i18nText("midi.summary", [
      sourceLabel,
      formatCount(selectedChannelCount),
      formatCount(Number(overview.noteCount) || 0)
    ]);
  }

  function updateMidiConvertApplyState() {
    if (!midiConvertApply) return;
    const hasSelectedChannel = Boolean(pendingMidiSettings && countActiveMidiExportChannels() > 0);
    const disabled = midiConvertBusy || !hasSelectedChannel;
    midiConvertApply.disabled = disabled;
    midiConvertApply.setAttribute("aria-disabled", disabled ? "true" : "false");
    midiConvertApply.title = hasSelectedChannel ? "" : i18nText("midi.choose_target_channel");
  }

  function updateMidiRoleControls() {
    if (!pendingMidiSettings) {
      updateMidiConvertApplyState();
      return;
    }
    pendingMidiSettings.partCount = countActiveMidiExportChannels();
    updateMidiConvertSummary();
    updateMidiConvertApplyState();
  }

  function buildMidiPartSoundPreset(exportChannels, groups, partCount = 6) {
    const keys = defaultPartPresetKeys();
    const groupMap = new Map((groups || []).map(g => [String(g.id), g]));
    const count = clampInt(Number(partCount) || 6, 1, 6);
    const instrumentMap = window.MobibardInstrumentMap;

    for (let i = 0; i < count; i++) {
      const channel = exportChannels?.[i];
      const selected = Array.isArray(channel?.selectedInstrumentGroups)
        ? channel.selectedInstrumentGroups.map(id => groupMap.get(String(id))).filter(Boolean)
        : [];
      if (!selected.length) continue;

      // 설정 파일이 로드되어 있으면 선택된 모든 MIDI 악기의 노트 수를 합산해
      // 14개 마비노기 악기 중 가장 비중이 큰 대표 음색을 고른다.
      const mappedTarget = instrumentMap?.chooseTarget?.(selected);
      if (mappedTarget?.presetKey) {
        keys[i] = sanitizePresetKey(mappedTarget.presetKey);
        continue;
      }

      // 설정 파일이 없거나 잘못된 경우에도 범주 외 코드는 1번 피아노를 사용한다.
      keys[i] = DEFAULT_PART_PRESET_KEY;
    }
    return normalizePresetKeyArray(keys);
  }

  function rememberMidiPartSoundPreset(keys) {
    const selectedQuickMode = soundPresetMatch(partPresetKeys);
    const shouldApplyToCurrentSound = selectedQuickMode === "auto";
    midiPartPresetKeys = normalizePresetKeyArray(keys);
    midiPartPresetName = defaultMidiSoundPresetLabel();
    saveMidiPartSoundPresetPrefs();

    if (shouldApplyToCurrentSound) {
      partPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
      savePartSoundPrefs();
      updateSoundPresetControls();
      return true;
    }

    updateSoundPresetControls();
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
    const sourceLabel = getMidiImportSourceLabel();
    if (!pendingMidiSettings) throw new Error(i18nText("midi.settings_missing", [sourceLabel]));
    const exportChannels = getMidiExportChannelConfigs();
    if (!exportChannels.length) throw new Error(i18nText("mml.select_one"));
    const partCount = exportChannels.length;
    return {
      partCount,
      roles: exportChannels.map(ch => ch.role),
      exportChannels,
      quantizeDivision: Number(pendingMidiSettings.quantizeDivision) === 32 ? 32 : 64,
      sourceLabel
    };
  }

  async function applyMidiConvertDialog() {
    if (!pendingMidiImport || midiConvertBusy) return;
    const sourceLabel = getMidiImportSourceLabel();
    const sourceType = pendingMidiImport?.sourceType || "midi";

    let options;
    try {
      options = collectMidiConvertOptions();
    } catch (err) {
      showDialog(i18nText("midi.convert_fail_title", [sourceLabel]), shortError(err));
      return;
    }

    saveLastMidiConvertSettings(pendingMidiImport, pendingMidiSettings);
    stopMidiPreview();
    setMidiConvertBusy(true, i18nText("midi.converting", [sourceLabel]));
    await waitForBrowserPaint();

    try {
      stopPlayback(false);
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const midiSoundPresetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const normalized = normalizeImportedFullMml(result.mml);
      setMainMml(normalized.mml);
      rememberSuggestedMmlSaveFileName(pendingMidiImport.name);
        googleDriveMmlFileName = "";
      rememberMidiPartSoundPreset(midiSoundPresetKeys);
      const midiGroupCount = Number(pendingMidiSettings?.groups?.length || 0);
      midiConvertDialog?.close();
      setMidiConvertBusy(false);
      pendingMidiImport = null;
      pendingMidiSettings = null;
      const saved = Math.max(0, Number(normalized.saved) || 0);
      trackAnalytics("midi_convert_complete", {
        source_type: sourceType,
        export_channels: Number(options.partCount || 0),
        quantize_division: Number(options.quantizeDivision || 64),
        instrument_groups: midiGroupCount,
        optimized_chars: saved
      });
      showDialog(
        i18nText("midi.convert_done_title", [sourceLabel]),
        result.message
      );
    } catch (err) {
      setMidiConvertBusy(false);
      showDialog(i18nText("midi.convert_fail_title", [sourceLabel]), shortError(err));
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
      midiConvertApply.textContent = busy ? i18nText("ui.conv") : i18nText("ui.convert");
    }
    updateMidiConvertApplyState();
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
    const file = sf2File?.files?.[0];
    if (!file) return;
    const previousSoundFont = soundFont;
    const previousSoundFontIsDefault = soundFontIsDefault;
    const previousSf2Name = sf2Name;
    stopPlayback(false);
    stopMidiPreview();
    setSoundFontControlsBusy(true);
    updateSoundFontUi(i18nText("snd.reading_soundbank"));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseSoundBank(bytes);
      soundFont = parsed;
      soundFontIsDefault = false;
      sf2Name = file.name || "SoundBank";
      updateSoundFontUi();
      if (partSoundDialog?.open) {
        draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
        renderPartSoundRows();
        updateSoundPresetControls();
      }
      try {
        const meta = await persistManualSoundBankCache(bytes, file);
        if (meta && isGoogleConnected()) void syncManualSoundBankSelectionToGoogle(bytes, meta);
      } catch (cacheErr) {
        console.warn("[Mobibard] Failed to cache selected sound bank.", cacheErr);
      }
    } catch (err) {
      soundFont = previousSoundFont;
      soundFontIsDefault = previousSoundFontIsDefault;
      sf2Name = previousSf2Name;
      if (sf2File) sf2File.value = "";
      if (!soundFont) {
        soundFontIsDefault = true;
        sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
        try { await loadDefaultSf2IfNeeded(); } catch (_) {}
      }
      updateSoundFontUi();
      showDialog(i18nText("snd.load_soundbank"), shortError(err));
    } finally {
      setSoundFontControlsBusy(false);
    }
  }

  async function ensureDefaultSoundFont() {
    if (defaultSoundFont) return defaultSoundFont;
    defaultSoundFont = await loadEmbeddedSoundBank({ clearBase64: true });
    return defaultSoundFont;
  }

  async function loadDefaultSf2IfNeeded() {
    const original = await ensureDefaultSoundFont();
    if (!soundFont) {
      soundFont = original;
      soundFontIsDefault = true;
      sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
    }
    updateSoundFontUi();
  }

  async function openPartSoundDialog() {
    stopPlayback(false);
    stopMidiPreview();

    // 음색 파일을 읽지 못하더라도 설정 창 자체는 항상 연다.
    // 사용자는 이 창의 "불러오기" 버튼으로 SF2/SF3/DLS 파일을 교체할 수 있어야 한다.
    if (!soundFont) {
      updateSoundFontUi(i18nText("snd.reading_soundbank"));
      try {
        await loadDefaultSf2IfNeeded();
      } catch (_) {
        soundFont = null;
        soundFontIsDefault = true;
        sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
        updateSoundFontUi();
      }
    } else {
      updateSoundFontUi();
    }

    draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
    draftSoundPresetBaseId = findUserSoundPresetIdByKeys(draftPartPresetKeys);
    renderPartSoundRows();
    updateSoundPresetControls();
    if (partSoundDialog?.showModal) partSoundDialog.showModal();
    else showDialog(i18nText("snd.ch_settings"), i18nText("cfg.browser_fail"));
  }

  async function previewPartPreset(key, partIndex = 0, triggerButton = null) {
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalText = button?.textContent || i18nText("ui.listen");
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) {
        button.disabled = true;
        button.textContent = i18nText("ui.play");
      }
      await loadDefaultSf2IfNeeded();
      const preset = findPresetByKey(key);
      if (!preset) throw new Error(i18nText("snd.find_sf2_preset_2"));
      const ctx = await ensureAudioContext();
      const notes = buildPartPresetPreviewNotes(preset, partIndex);
      const prepared = prepareNotes(ctx, soundFont, preset, notes);
      if (!prepared.length) throw new Error(i18nText("snd.find_preview_sf2"));
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
      showDialog(i18nText("snd.preview_fail"), shortError(err));
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
      empty.textContent = soundFont ? i18nText("snd.find_any") : i18nText("snd.load_or_replace");
      partSoundRows.appendChild(empty);
      return;
    }

    for (let i = 0; i < 6; i++) {
      const row = document.createElement("div");
      row.className = `part-sound-row part-${i}`;
      const label = document.createElement("label");
      label.className = "part-sound-label";
      label.htmlFor = `partSoundSelect${i}`;
      label.textContent = PART_LABELS[i] || i18nText("ui.numbered", [i + 1]);

      const select = document.createElement("select");
      select.id = `partSoundSelect${i}`;
      select.dataset.partPresetIndex = String(i);
      select.setAttribute("aria-label", i18nText("aria.sound", [PART_LABELS[i]]));
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
      previewButton.className = "part-sound-preview-btn soft-tool-button";
      previewButton.type = "button";
      previewButton.textContent = i18nText("ui.listen");
      previewButton.setAttribute("aria-label", i18nText("aria.preview_selected_sound", [PART_LABELS[i]]));
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
      .filter(p => p && Array.isArray(p.regions) && p.regions.length && (typeof soundFont.hasAudiblePreset !== "function" || soundFont.hasAudiblePreset(p)))
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
    const name = String(preset?.name || i18nText("snd.unnamed_preset")).trim();
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
      // 음소거 채널도 미리 준비한다. 재생 중 음소거 해제 시 재스케줄 없이 즉시 소리가 나야 한다.
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
      scheduleCacheVersion++;
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
      if (scheduleCache.notes.length === 0) throw new Error(i18nText("mml.no_notes"));
      if (currentOffset >= scheduleCache.duration - 0.05) currentOffset = 0;
      const ctx = await ensureAudioContext();
      if (!soundFont.presets?.length) throw new Error(i18nText("snd.find_avail"));
      preparedNotes = prepareNotesWithPartPresets(ctx, scheduleCache.notes);
      playbackAutoGainScale = computeAutoGainScale(preparedNotes, { windowStart: 0, windowEnd: scheduleCache.duration || 0 });
      const allScheduledNotesMuted = areAllScheduledNotesMuted(scheduleCache.notes);
      if (preparedNotes.length === 0 && !allScheduledNotesMuted) throw new Error(i18nText("mml.no_audible"));

      const baseTime = ctx.currentTime + PLAY_START_DELAY;
      activeSources = [];
      scheduledNoteIds = new Set();
      playContextStart = baseTime;
      playOffsetStart = currentOffset;
      isPlaying = true;
      updatePlayButton();
      updateProgressUi(currentOffset, scheduleCache.duration);
      schedulePlaybackWindow();
      startProgressLoop();
    } catch (err) {
      stopPlayback(false);
      showDialog(i18nText("play.fail"), shortError(err));
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
      destinationsByPart: partPlaybackGains,
      activeSources,
      scheduledIds: scheduledNoteIds,
      minLeadTime: 0.018,
      gainScale: playbackAutoGainScale
    });

    schedulerTimer = setTimeout(schedulePlaybackWindow, SCHEDULE_INTERVAL_MS);
  }

  function invalidateEditorDerivedState() {
    editorContentVersion++;
    editorAnalysisCache = {
      source: "",
      parts: null,
      parsed: null,
      schedule: null,
      volumeCounts: null
    };
    mainHighlightRenderSignature = "";
    partHighlightRenderSignatures = Array.from({ length: 6 }, () => "");
  }

  function getEditorDerivedState({ needSchedule = false, needVolumeCounts = false } = {}) {
    const source = normalizeMmlForDisplay(mainMml?.value || "");
    if (editorAnalysisCache.source !== source) {
      editorAnalysisCache = {
        source,
        parts: null,
        parsed: null,
        schedule: null,
        volumeCounts: null
      };
    }

    if (!editorAnalysisCache.parts) {
      const parts = splitMmlParts(source).slice(0, 6).map(normalizePartText);
      while (parts.length < 6) parts.push("");
      editorAnalysisCache.parts = parts;
    }

    if ((needSchedule || needVolumeCounts) && !editorAnalysisCache.parsed) {
      editorAnalysisCache.parsed = parseMabinogiMml(source);
    }

    if (needSchedule && !editorAnalysisCache.schedule) {
      const scheduled = buildSchedule(editorAnalysisCache.parsed);
      const noteDuration = (scheduled.notes || []).reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      const restDuration = (scheduled.rests || []).reduce((m, r) => Math.max(m, r.start + r.durationSec), 0);
      const duration = Math.max(Number(scheduled.duration) || 0, noteDuration, restDuration);
      editorAnalysisCache.schedule = { ...scheduled, duration };
    }

    if (needVolumeCounts && !editorAnalysisCache.volumeCounts) {
      const counts = Array(16).fill(0);
      for (const part of (editorAnalysisCache.parsed?.parts || [])) {
        for (const note of (part.notes || [])) {
          const volume = clampInt(Number(note.volume ?? 8), 0, 15);
          counts[volume]++;
        }
      }
      editorAnalysisCache.volumeCounts = counts;
    }

    return editorAnalysisCache;
  }

  function createScheduleFromEditor() {
    normalizeTextareaCommands(mainMml);
    return getEditorDerivedState({ needSchedule: true }).schedule;
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

  function quantizePlaybackTime(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  }

  function handleSeekInput(restart) {
    const duration = scheduleCache?.duration || Number(progressSlider.max) || 0;
    currentOffset = Math.max(0, Math.min(duration, quantizePlaybackTime(progressSlider.value)));
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
    progressSlider.step = "0.01";
    progressSlider.value = String(quantizePlaybackTime(c));
    progressSlider.disabled = d <= 0;
    playInfo.textContent = `${formatTime(c)} / ${formatTime(d)}`;
    updateActiveTempoMarker(c);
    updatePlaybackCodeHighlight(c);
    updatePianoRoll(c, d);
  }

  function rebuildSchedulePreviewSilently() {
    currentOffset = 0;
    try {
      scheduleCache = createScheduleFromEditor();
      scheduleCacheVersion++;
      updateProgressUi(0, scheduleCache.duration);
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
    } catch (_) {
      scheduleCache = null;
      scheduleCacheVersion++;
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
    for (const [markerIndex, marker] of markers.entries()) {
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
      el.dataset.beat = String(Math.max(0, Number(marker.beat) || 0));
      el.dataset.markerIndex = String(markerIndex);
      el.title = i18nText("tempo.marker_title", [bpm, formatTime(time)]);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "tempo-marker-label";
      label.textContent = `T${bpm}`;
      label.setAttribute("aria-label", i18nText("tempo.marker_aria", [bpm, formatTime(time)]));
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

  function handleTempoMarkerLayerClick(event) {
    const labelElement = event?.target?.closest?.(".tempo-marker-label");
    const markerElement = labelElement?.closest?.(".tempo-marker");
    if (!labelElement || !markerElement || !tempoMarkerLayer?.contains(markerElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(markerElement.dataset.markerIndex);
    const markers = Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : [];
    const marker = Number.isInteger(index) ? markers[index] : null;
    openTempoEditDialog(marker || {
      beat: Number(markerElement.dataset.beat) || 0,
      time: Number(markerElement.dataset.time) || 0,
      bpm: Number(markerElement.dataset.bpm) || 120
    });
  }

  function openTempoEditDialog(marker) {
    if (!marker) return;

    tempoEditResumePlayback = Boolean(isPlaying);
    if (tempoEditResumePlayback) {
      stopPlayback(true);
      tempoEditResumeOffset = Math.max(0, Number(currentOffset) || 0);
    } else {
      tempoEditResumeOffset = Math.max(0, Number(currentOffset) || 0);
    }

    const bpm = normalizeTempoBpm(marker.bpm);
    selectedTempoMarker = { ...marker, bpm };
    if (tempoEditBpm) tempoEditBpm.value = String(bpm);
    if (tempoEditContext) {
      const part = Number.isInteger(marker.part) && marker.part >= 0 ? PART_LABELS[marker.part] : i18nText("tempo.default");
      tempoEditContext.textContent = i18nText("tempo.edit_context", [formatTime(Math.max(0, Number(marker.time) || 0)), bpm, part]);
    }
    if (tempoEditDialog?.showModal) {
      tempoEditDialog.showModal();
      tempoEditBpm?.focus();
      tempoEditBpm?.select?.();
      return;
    }
    const answer = prompt(i18nText("tempo.prompt", [bpm]), String(bpm));
    if (answer == null) {
      selectedTempoMarker = null;
      resumePlaybackAfterTempoEdit();
      return;
    }
    applyTempoEdit(answer, selectedTempoMarker);
    selectedTempoMarker = null;
    resumePlaybackAfterTempoEdit();
  }

  function resumePlaybackAfterTempoEdit() {
    if (!tempoEditResumePlayback) return;
    const resumeOffset = Math.max(0, Number(tempoEditResumeOffset) || 0);
    tempoEditResumePlayback = false;
    tempoEditResumeOffset = 0;

    const duration = Math.max(0, Number(scheduleCache?.duration) || Number(progressSlider?.max) || 0);
    currentOffset = duration > 0 ? Math.min(resumeOffset, duration) : resumeOffset;
    if (scheduleCache) updateProgressUi(currentOffset, duration);

    setTimeout(() => {
      if (!isPlaying && !tempoEditDialog?.open) void playFromCurrent();
    }, 20);
  }

  function normalizeTempoEditBpmInput() {
    if (!tempoEditBpm) return;
    tempoEditBpm.value = String(normalizeTempoBpm(tempoEditBpm.value));
  }

  function normalizeTempoBpm(value) {
    let bpm = Math.round(Number(value));
    if (!Number.isFinite(bpm)) bpm = 120;
    return clampInt(bpm, 32, 255);
  }

  function applyTempoEditFromDialog() {
    if (!selectedTempoMarker) {
      tempoEditDialog?.close();
      return;
    }
    normalizeTempoEditBpmInput();
    const bpm = normalizeTempoBpm(tempoEditBpm?.value);
    const marker = selectedTempoMarker;
    tempoEditSuppressCloseResume = true;
    tempoEditDialog?.close();
    try {
      applyTempoEdit(bpm, marker);
    } finally {
      tempoEditSuppressCloseResume = false;
      resumePlaybackAfterTempoEdit();
    }
  }

  function applyTempoEdit(value, marker) {
    const bpm = normalizeTempoBpm(value);
    const beforeBpm = normalizeTempoBpm(marker?.bpm);
    if (bpm === beforeBpm) {
      showDialog(i18nText("tempo.edit"), i18nText("tempo.no_change", [beforeBpm]));
      return;
    }

    stopPlayback(false);
    try {
      const source = normalizeMmlForDisplay(mainMml?.value || "");
      const updated = replaceTempoMarkerCommand(source, marker, bpm);
      setMainMml(updated);
      currentOffset = 0;
      showDialog(i18nText("tempo.edit"), i18nText("tempo.changed", [formatTime(Math.max(0, Number(marker?.time) || 0)), beforeBpm, bpm]));
    } catch (err) {
      showDialog(i18nText("tempo.edit_2"), shortError(err));
    }
  }

  function replaceTempoMarkerCommand(source, marker, bpm) {
    const text = String(source || "");
    const start = Number(marker?.globalSourceStart);
    const end = Number(marker?.globalSourceEnd);
    if (Boolean(marker?.explicit) && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length) {
      const token = text.slice(start, end);
      if (!/^T\d+$/i.test(token)) throw new Error(i18nText("mml.locate_tempo_cmd"));
      return `${text.slice(0, start)}T${bpm}${text.slice(end)}`;
    }

    if (Math.abs(Number(marker?.beat) || 0) <= 1e-7) {
      const header = text.match(/^\s*MML\s*@/i);
      if (header) return `${text.slice(0, header[0].length)}T${bpm}${text.slice(header[0].length)}`;
      return `MML@T${bpm}${text.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/, "")};`;
    }
    throw new Error(i18nText("mml.locate_tempo_cmd_2"));
  }

  function ensurePartPlaybackGains() {
    if (!audioCtx || !masterGain) return;
    if (partPlaybackGains.length === 6 && partPlaybackGains.every(Boolean)) return;
    for (const node of partPlaybackGains) {
      try { node?.disconnect(); } catch {}
    }
    partPlaybackGains = Array.from({ length: 6 }, (_, part) => {
      const gain = audioCtx.createGain();
      gain.gain.value = partMuteStates[part] ? 0 : 1;
      gain.connect(masterGain);
      return gain;
    });
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error(i18nText("audio.unsupported_web"));
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      partPlaybackGains = [];
    }
    if (!masterGain) {
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      partPlaybackGains = [];
    }
    ensurePartPlaybackGains();
    applyPartMuteAudioGains({ instant: true });
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

  function resetPlaybackSpeed() {
    if (!speedSlider) return;
    speedSlider.value = "1";
    applyPlaybackSpeed(true);
  }

  function resetOutputVolume() {
    if (!volumeSlider) return;
    volumeSlider.value = "100";
    applyOutputVolume();
  }

  function applyOutputVolume() {
    const percent = clampInt(Number(volumeSlider.value || 100), 0, 150);
    volumeSlider.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    if (volumeControlButton) {
      const muted = percent === 0;
      volumeControlButton.classList.toggle("volume-muted", muted);
      volumeControlButton.setAttribute("aria-pressed", muted ? "true" : "false");
    }
    writePref("volume", String(percent));
    if (masterGain && audioCtx && audioCtx.state !== "closed") {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(percent / 100, now, 0.015);
    }
  }

  function updatePlayButton() {
    playToggleBtn.textContent = isPlaying ? i18nText("player.stop") : i18nText("player.play");
    playToggleBtn.classList.toggle("danger", isPlaying);
  }

  function clearAllMmlChannels() {
    stopPlayback(false);
    stopMidiPreview();

    // 비우기 시 MIDI에서 기억한 "자동 음색"도 기본 피아노로 되돌린다.
    // 현재 음색이 자동 음색을 따라가고 있었다면 실제 채널 음색도 피아노로 초기화하고,
    // 사용자가 직접 선택한 음색은 그대로 유지한다.
    const wasUsingAutoSound = soundPresetMatch(partPresetKeys) === "auto";
    midiPartPresetKeys = null;
    midiPartPresetName = defaultMidiSoundPresetLabel();
    writePref("midiPartPresetKeys", "");
    writePref("midiPartPresetName", midiPartPresetName);
    if (wasUsingAutoSound) {
      partPresetKeys = defaultPartPresetKeys();
      savePartSoundPrefs();
    }
    updateSoundPresetControls();

    setMainMml(composeMml(Array.from({ length: 6 }, () => ""), {
      preserveEmpty: true,
      partCount: 6
    }));
    clearSuggestedMmlSaveFileName();
    googleDriveMmlFileName = "";
  }

  function setMainMml(text) {
    syncing = true;
    mainMml.value = normalizeMmlForDisplay(text);
    syncing = false;
    syncPartsFromMain();
  }

  function syncPartsFromMain() {
    if (syncing) return;
    syncing = true;
    try {
      mainMml.value = normalizeMmlForDisplay(mainMml.value);
      const parts = splitMmlParts(mainMml.value).slice(0, 6).map(normalizePartText);
      while (parts.length < 6) parts.push("");
      partTexts.forEach((t, i) => { t.value = parts[i] || ""; });
      invalidateEditorDerivedState();
      updateVisibleHighlight();
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
      invalidateEditorDerivedState();
      updateVisibleHighlight();
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
    updatePlaybackCodeHighlight(currentOffset);
    updateVisibleHighlight();
  }

  function getCurrentPartTexts(partCount = 6) {
    const count = Math.max(1, Math.min(6, Number(partCount) || 6));
    return getEditorDerivedState().parts.slice(0, count);
  }

  function updateCharCount() {
    if (!charCount) return;
    const parts = getCurrentPartTexts(6);

    if (activeTabName === "main") {
      const counts = parts.map(part => part.length);
      const total = counts.reduce((sum, count) => sum + count, 0);
      charCount.className = "char-count char-count-all";
      charCount.replaceChildren();

      const totalLine = document.createElement("div");
      totalLine.className = "char-count-total";
      totalLine.textContent = i18nText("ui.char_count", [formatCount(total)]);

      const partLine = document.createElement("div");
      partLine.className = "char-count-parts";
      counts.forEach((count, idx) => {
        if (idx > 0) {
          const separator = document.createElement("span");
          separator.className = "char-count-separator";
          separator.textContent = "/";
          partLine.append(separator);
        }
        const channelCount = document.createElement("span");
        channelCount.className = `char-count-channel part-count-${idx}`;
        channelCount.textContent = formatCount(count);
        channelCount.title = i18nText("ui.part_chars", [PART_LABELS[idx], formatCount(count)]);
        partLine.append(channelCount);
      });
      const unit = document.createElement("span");
      unit.className = "char-count-unit";
      unit.textContent = i18nText("ui.chars");
      partLine.append(unit);

      charCount.append(totalLine, partLine);
      charCount.setAttribute("aria-label", i18nText("ui.char_summary", [formatCount(total), counts.map(formatCount).join(", ")]));
      return;
    }

    const m = /^part(\d+)$/.exec(activeTabName || "");
    const idx = m ? Number(m[1]) : 0;
    const partCount = (parts[idx] || "").length;
    charCount.textContent = i18nText("ui.char_count", [formatCount(partCount)]);
    charCount.className = `char-count part-count-${idx}`;
    charCount.setAttribute("aria-label", i18nText("ui.part_chars", [PART_LABELS[idx] || i18nText("ui.channel"), formatCount(partCount)]));
  }

  function formatCount(value) {
    return Math.max(0, Number(value) || 0).toLocaleString(document.documentElement.lang || undefined);
  }


  function closeTempoSimplifyDialog() {
    if (!tempoSimplifyDialog?.open) return;
    try { tempoSimplifyDialog.close(); } catch (_) {}
  }

  function calculateTempoSimplification() {
    if (typeof simplifyTemposMml !== "function") throw new Error(i18nText("tempo.simplify_unavailable"));
    const source = normalizeMmlForDisplay(mainMml?.value || "");
    return {
      source,
      result: simplifyTemposMml(source, {
        partCount: 6,
        maxBpmDeltaExclusive: 5,
        preserveExtrema: true
      })
    };
  }

  function tempoSimplificationDeleteCount(pending) {
    const result = pending?.result;
    const value = result?.removedTokenCount ?? result?.removedCount;
    return Math.max(0, Number(value) || 0);
  }

  function updateTempoSimplifyPreview(pending) {
    if (!tempoSimplifyPreview || !tempoSimplifyApply) return;
    const count = tempoSimplificationDeleteCount(pending);
    tempoSimplifyPreview.textContent = count > 0
      ? i18nText("tempo.simplify_remove_count", [formatCount(count)])
      : i18nText("tempo.simplify_none");
    tempoSimplifyPreview.dataset.empty = count > 0 ? "false" : "true";
    tempoSimplifyApply.disabled = count <= 0;
    tempoSimplifyApply.setAttribute("aria-disabled", count <= 0 ? "true" : "false");
  }

  function openTempoSimplifyDialog() {
    try {
      pendingTempoSimplification = calculateTempoSimplification();
      updateTempoSimplifyPreview(pendingTempoSimplification);
      if (tempoSimplifyDialog?.showModal) {
        tempoSimplifyDialog.showModal();
        return;
      }
      const count = tempoSimplificationDeleteCount(pendingTempoSimplification);
      if (count <= 0) {
        showDialog(i18nText("tempo.simplify"), i18nText("tempo.simplify_none"));
        pendingTempoSimplification = null;
        return;
      }
      const message = `${i18nText("tempo.simplify_description")}\n\n${i18nText("tempo.simplify_remove_count", [formatCount(count)])}`;
      if (window.confirm(message)) applyTempoSimplificationFromDialog();
      else pendingTempoSimplification = null;
    } catch (err) {
      pendingTempoSimplification = null;
      showDialog(i18nText("tempo.simplify"), shortError(err));
    }
  }

  function applyTempoSimplificationFromDialog() {
    try {
      const currentSource = normalizeMmlForDisplay(mainMml?.value || "");
      if (!pendingTempoSimplification || pendingTempoSimplification.source !== currentSource) {
        pendingTempoSimplification = calculateTempoSimplification();
      }
      const result = pendingTempoSimplification.result;
      const count = tempoSimplificationDeleteCount({ result });
      if (count <= 0) {
        closeTempoSimplifyDialog();
        showDialog(i18nText("tempo.simplify"), i18nText("tempo.simplify_none"));
        return;
      }
      stopPlayback(false);
      setMainMml(result.mml);
      closeTempoSimplifyDialog();
      flashButton(tempoSimplifyBtn, i18nText("cfg.applied"));
      trackAnalytics("tempo_simplify_apply", { removed_tempos: count });
      showDialog(
        i18nText("tempo.simplify"),
        i18nText("tempo.simplify_applied", [formatCount(count)])
      );
    } catch (err) {
      showDialog(i18nText("tempo.simplify"), shortError(err));
    }
  }

  function openRestTrimDialog() {
    if (restTrimLimit) restTrimLimit.value = "32";
    applyMmlChannelAvailability(".rest-trim-channel");
    setDialogChannelSelection(".rest-trim-channel", true);
    updateRestTrimPreview();
    if (restTrimDialog?.showModal) {
      restTrimDialog.showModal();
      return;
    }
    const answer = prompt(i18nText("rest.prompt_fallback"), "32");
    if (answer == null) return;
    applyRestTrim(answer, null);
  }

  function updateRestTrimPreview() {
    const statEls = Array.from(document.querySelectorAll(".rest-trim-stat"));
    if (!statEls.length) return;
    const threshold = parseRestTrimLimit(restTrimLimit?.value || "32", { silent: true });
    if (!threshold) {
      statEls.forEach(el => { el.textContent = "-"; el.title = i18nText("err.determine_remove"); });
      return;
    }

    try {
      const result = countShortRestsMml(normalizeMmlForDisplay(mainMml?.value || ""), {
        partCount: 6,
        all: threshold.all,
        denom: threshold.denom
      });
      const counts = Array.isArray(result?.counts) ? result.counts : [];

      for (const el of statEls) {
        const index = Number(el.dataset.partIndex);
        if (!Number.isInteger(index) || index < 0 || index >= 6) continue;
        const count = Math.max(0, Number(counts[index]) || 0);
        el.textContent = formatCount(count);
        el.title = count > 0
          ? i18nText("rest.target_count", [formatCount(count)])
          : i18nText("msg.no_rests");
      }
    } catch (err) {
      statEls.forEach(el => { el.textContent = "-"; el.title = shortError(err); });
    }
  }

  function applyRestTrimFromDialog() {
    const value = restTrimLimit?.value || "32";
    const targetPartIndexes = getDialogSelectedPartIndexes(".rest-trim-channel");
    if (!targetPartIndexes.length) {
      showDialog(i18nText("ui.remove_rests"), i18nText("msg.select_one_ch_3"));
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
      showDialog(i18nText("ui.remove_rests"), i18nText("msg.select_one_ch_3"));
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
        showDialog(i18nText("ui.remove_rests"), i18nText("rest.none_removable"));
      } else {
        setMainMml(result.mml);
        const label = threshold.all ? i18nText("ui.all_rests") : i18nText("rest.note_or_shorter", [threshold.denom]);
        const selectedLabel = formatSelectedPartLabels(selectedIndexes);
        const saved = Math.max(0, Number(result.saved) || 0);
        flashButton(restTrimBtn, i18nText("st.remove_done"));
        showDialog(
          i18nText("ui.remove_rests"),
          i18nText("rest.result", [selectedLabel, label, formatCount(result.removed)]) + "\n" +
          i18nText("mml.optimize_result", [formatCount(result.before), formatCount(result.after)]) +
          (saved ? "\n" + i18nText("mml.saved_chars_line", [formatCount(saved)]) : "")
        );
      }
    } catch (err) {
      showDialog(i18nText("err.remove_rests"), shortError(err));
    } finally {
      if (wasPlaying) currentOffset = 0;
    }
  }

  function openBulkVolumeDialog() {
    if (bulkVolumeAmount) bulkVolumeAmount.value = "0";
    applyMmlChannelAvailability(".bulk-volume-channel");
    setDialogChannelSelection(".bulk-volume-channel", true);
    updateBulkVolumeStats();
    if (bulkVolumeDialog?.showModal) {
      bulkVolumeDialog.showModal();
      bulkVolumeAmount?.focus();
      bulkVolumeAmount?.select?.();
      return;
    }
    const answer = prompt(i18nText("vol.prompt_fallback"), "0");
    if (answer == null) return;
    applyBulkVolume(answer, null);
  }

  function updateBulkVolumeStats() {
    if (!bulkVolumeStats) return;

    const selectedPartIndexes = getDialogSelectedPartIndexes(".bulk-volume-channel");
    if (!selectedPartIndexes.length) {
      bulkVolumeStats.replaceChildren();
      return;
    }

    let counts;
    try {
      const parsedParts = getEditorDerivedState({ needVolumeCounts: true }).parsed?.parts || [];
      const selectedSet = new Set(selectedPartIndexes);
      counts = Array(16).fill(0);

      parsedParts.forEach((part, partIndex) => {
        if (!selectedSet.has(partIndex)) return;
        for (const note of (part?.notes || [])) {
          const volume = clampInt(Number(note.volume ?? 8), 0, 15);
          counts[volume]++;
        }
      });
    } catch (err) {
      bulkVolumeStats.innerHTML = `<div class="volume-count-title">${escapeHtml(i18nText("vol.stats_unavailable"))}</div><div class="dialog-small">${escapeHtml(shortError(err))}</div>`;
      return;
    }

    const visibleCounts = counts
      .map((count, volume) => ({ count, volume }))
      .filter(item => item.count > 0);

    if (!visibleCounts.length) {
      bulkVolumeStats.innerHTML = i18nText("tpl.vol_count_no");
      return;
    }

    const items = visibleCounts.map(({ count, volume }) => `
      <span class="volume-count-item"><em>V${volume}</em><strong>${formatCount(count)}</strong></span>`).join("");
    bulkVolumeStats.innerHTML = `<div class="volume-count-grid">${items}</div>`;
  }

  function applyBulkVolumeFromDialog() {
    normalizeBulkVolumeAmountInput();
    const targetPartIndexes = getDialogSelectedPartIndexes(".bulk-volume-channel");
    if (!targetPartIndexes.length) {
      showDialog(i18nText("vol.adjust"), i18nText("msg.select_one_ch_3"));
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
      showDialog(i18nText("vol.adjust"), i18nText("msg.select_one_ch_3"));
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
          ? i18nText("vol.change_0")
          : i18nText("err.no_adjustable");
        showDialog(i18nText("vol.adjust"), message);
      } else {
        setMainMml(result.mml);
        const saved = Math.max(0, Number(result.saved) || 0);
        const selectedLabel = formatSelectedPartLabels(selectedIndexes);
        flashButton(bulkVolumeBtn, i18nText("st.applied"));
        showDialog(
          i18nText("vol.adjust"),
          i18nText("vol.result", [selectedLabel, formatCount(result.changedNotes), `${delta > 0 ? "+" : ""}${delta}`]) + "\n" +
          i18nText("msg.result_limited") +
          (result.clampedNotes ? "\n" + i18nText("vol.clamped_count", [formatCount(result.clampedNotes)]) : "") +
          "\n" + i18nText("mml.optimize_result", [formatCount(result.before), formatCount(result.after)]) +
          (saved ? "\n" + i18nText("mml.saved_chars_line", [formatCount(saved)]) : "")
        );
      }
    } catch (err) {
      showDialog(i18nText("vol.adjust_2"), shortError(err));
    } finally {
      if (wasPlaying) currentOffset = 0;
    }
  }

  function getMmlChannelContentFlags() {
    const parts = getCurrentPartTexts(6);
    return Array.from({ length: 6 }, (_, index) => Boolean(String(parts[index] || "").trim()));
  }

  function applyMmlChannelAvailability(selector, availability = null) {
    const flags = Array.isArray(availability) ? availability : getMmlChannelContentFlags();
    document.querySelectorAll(selector).forEach(input => {
      const index = Number(input.dataset.partIndex);
      const enabled = Number.isInteger(index) && index >= 0 && index < 6 && Boolean(flags[index]);
      input.disabled = !enabled;
      if (!enabled) input.checked = false;
      input.closest(".dialog-channel-option")?.classList.toggle("is-disabled", !enabled);
    });
  }

  function setDialogChannelSelection(selector, checked) {
    document.querySelectorAll(selector).forEach(input => {
      input.checked = input.disabled ? false : Boolean(checked);
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
    if (!selected.length || selected.length >= PART_LABELS.length) return i18nText("ui.all_chs");
    return selected.map(index => PART_LABELS[index] || i18nText("ui.channel_n", [index + 1])).join(", ");
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

  function openBulkPitchDialog() {
    if (bulkPitchAmount) bulkPitchAmount.value = "0";
    applyMmlChannelAvailability(".bulk-pitch-channel");
    setDialogChannelSelection(".bulk-pitch-channel", true);
    updateBulkPitchStats();
    if (bulkPitchDialog?.showModal) {
      bulkPitchDialog.showModal();
      bulkPitchAmount?.focus();
      bulkPitchAmount?.select?.();
      return;
    }
    const answer = prompt(i18nText("pitch.prompt_fallback"), "0");
    if (answer == null) return;
    applyBulkPitch(answer, null);
  }

  function updateBulkPitchStats() {
    if (!bulkPitchStats) return;
    let parts;
    try {
      parts = splitMmlParts(normalizeMmlForDisplay(mainMml?.value || "")).slice(0, 6);
    } catch (err) {
      bulkPitchStats.innerHTML = `<div class="volume-count-title">${escapeHtml(i18nText("pitch.octave_cmds"))}</div><div class="dialog-small">${escapeHtml(shortError(err))}</div>`;
      return;
    }

    const counts = new Map();
    let total = 0;
    for (const part of parts) {
      const re = /O(\d+)/gi;
      let match;
      while ((match = re.exec(String(part || ""))) !== null) {
        const octave = Number(match[1]);
        if (!Number.isInteger(octave)) continue;
        counts.set(octave, (counts.get(octave) || 0) + 1);
        total++;
      }
    }
    if (!total) {
      bulkPitchStats.innerHTML = i18nText("tpl.vol_count_no_2");
      return;
    }

    const items = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]).map(([octave, count]) =>
      `<span class="volume-count-item"><em>O${octave}</em><strong>${formatCount(count)}</strong></span>`).join("");
    bulkPitchStats.innerHTML = `<div class="volume-count-title">${escapeHtml(i18nText("pitch.total_commands", [formatCount(total)]))}</div><div class="volume-count-grid">${items}</div>`;
  }

  function applyBulkPitchFromDialog() {
    normalizeBulkPitchAmountInput();
    const targetPartIndexes = getDialogSelectedPartIndexes(".bulk-pitch-channel");
    if (!targetPartIndexes.length) {
      showDialog(i18nText("pitch.adjust"), i18nText("msg.select_one_ch_3"));
      return;
    }
    const value = bulkPitchAmount?.value || "0";
    bulkPitchDialog?.close();
    applyBulkPitch(value, targetPartIndexes);
  }

  function applyBulkPitch(value, targetPartIndexes = null) {
    const octaves = normalizeBulkPitchDelta(value);
    const selectedIndexes = targetPartIndexes == null ? null : normalizePartIndexList(targetPartIndexes);
    if (targetPartIndexes != null && !selectedIndexes.length) {
      showDialog(i18nText("pitch.adjust"), i18nText("msg.select_one_ch_3"));
      return;
    }

    const wasPlaying = isPlaying;
    stopPlayback(false);
    try {
      const result = transposeOctavesMml(normalizeMmlForDisplay(mainMml.value), {
        partCount: 6,
        targetPartIndexes: selectedIndexes,
        octaves
      });

      if (result.changedCommands <= 0) {
        const message = octaves === 0
          ? i18nText("pitch.octave_change_0")
          : result.touchedCommands <= 0
            ? i18nText("msg.no_oct")
            : i18nText("st.oct_cmds");
        showDialog(i18nText("pitch.adjust"), message);
      } else {
        setMainMml(result.mml);
        const selectedLabel = formatSelectedPartLabels(selectedIndexes);
        flashButton(bulkPitchBtn, i18nText("st.applied"));
        showDialog(
          i18nText("pitch.adjust"),
          i18nText("pitch.result", [selectedLabel, formatCount(result.changedCommands), `${octaves > 0 ? "+" : ""}${octaves}`]) + "\n" +
          i18nText("msg.notes_cmds_not") +
          (result.clampedCommands ? "\n" + i18nText("pitch.clamped_count", [formatCount(result.clampedCommands)]) : "")
        );
      }
    } catch (err) {
      showDialog(i18nText("pitch.adjust_2"), shortError(err));
    } finally {
      if (wasPlaying) currentOffset = 0;
    }
  }

  function normalizeBulkPitchAmountInput() {
    if (!bulkPitchAmount) return;
    bulkPitchAmount.value = String(normalizeBulkPitchDelta(bulkPitchAmount.value));
  }

  function normalizeBulkPitchDelta(value) {
    let delta = Math.round(Number(value));
    if (!Number.isFinite(delta)) delta = 0;
    return clampInt(delta, -7, 7);
  }

  function openLeadingSilenceDialog() {
    if (leadingSilenceSeconds) leadingSilenceSeconds.value = "2";
    if (leadingSilenceDialog?.showModal) {
      leadingSilenceDialog.showModal();
      leadingSilenceSeconds?.focus();
      leadingSilenceSeconds?.select?.();
      return;
    }
    const answer = prompt(i18nText("lead.prompt"), "2");
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
    if (!Number.isFinite(value)) return i18nText("ui.zero_seconds");
    return i18nText("ui.seconds", [Number(value.toFixed(2)).toLocaleString(document.documentElement.lang || undefined)]);
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
      flashButton(leadingSilenceBtn, i18nText("cfg.applied"));
      const removedSeconds = Math.max(0, Number(result.removedLeadingBeats || 0) / 2);
      const addedSeconds = Math.max(0, Number(result.addedBeats || 0) / 2);
      const removedLine = removedSeconds > 0
        ? "\n" + i18nText("lead.removed", [formatSecondCount(removedSeconds)])
        : "";
      showDialog(
        i18nText("st.lead_gap"),
        i18nText("lead.result", [formatSecondCount(addedSeconds), removedLine])
      );
    } catch (err) {
      showDialog(i18nText("err.set_lead"), shortError(err));
    }
  }


  const DYNAMICS_GENERATE_INFO = {
    pop: { labelKey: "ui.pop", titleKey: "vol.pop_rules", detailKey: "msg.reg_strong" },
    jazz: { labelKey: "ui.jazz", titleKey: "vol.jazz_rules", detailKey: "msg.weak_beats" },
    ballad: { labelKey: "ui.ballad", titleKey: "vol.ballad_rules", detailKey: "msg.gentle_phrasing" },
    bossa: { labelKey: "ui.bossa_nova", titleKey: "vol.bossa_nova", detailKey: "msg.soft_offbeats_narrow" },
    rock: { labelKey: "ui.rock", titleKey: "vol.rock_rules", detailKey: "msg.strong_first" },
    funk: { labelKey: "ui.funk", titleKey: "vol.funk_rules", detailKey: "msg.syncopation16" },
    classical: { labelKey: "ui.classical", titleKey: "vol.classical_rules", detailKey: "msg.phrase_breathing" }
  };

  function getDynamicsGenerateInfo(genre) {
    const info = DYNAMICS_GENERATE_INFO[genre] || DYNAMICS_GENERATE_INFO.pop;
    return {
      label: i18nText(info.labelKey),
      title: i18nText(info.titleKey),
      detail: i18nText(info.detailKey)
    };
  }

  function updateDynamicsGenerateDescription() {
    const genre = dynamicsGenerateGenre?.value || "pop";
    const info = getDynamicsGenerateInfo(genre);
    if (dynamicsGenerateRuleTitle) dynamicsGenerateRuleTitle.textContent = info.title;
    if (dynamicsGenerateRuleText) dynamicsGenerateRuleText.textContent = info.detail;
  }

  function openDynamicsGenerateDialog() {
    if (dynamicsGenerateStatus) dynamicsGenerateStatus.textContent = i18nText("vol.change_confirm");
    if (dynamicsGenerateGenre && !Object.prototype.hasOwnProperty.call(DYNAMICS_GENERATE_INFO, dynamicsGenerateGenre.value)) {
      dynamicsGenerateGenre.value = "pop";
    }
    if (dynamicsGenerateStrength && !["light", "normal", "strong"].includes(dynamicsGenerateStrength.value)) {
      dynamicsGenerateStrength.value = "normal";
    }
    applyMmlChannelAvailability(".dynamics-generate-channel");
    setDialogChannelSelection(".dynamics-generate-channel", true);
    updateDynamicsGenerateDescription();
    if (dynamicsGenerateDialog?.showModal) {
      dynamicsGenerateDialog.showModal();
      dynamicsGenerateGenre?.focus();
      return;
    }
    applyDynamicsGenerate({ genre: "pop", strength: "normal", targetPartIndexes: null });
  }

  function applyDynamicsGenerateFromDialog() {
    const targetPartIndexes = getDialogSelectedPartIndexes(".dynamics-generate-channel");
    if (!targetPartIndexes.length) {
      showDialog(i18nText("vol.generate"), i18nText("msg.select_one_ch_3"));
      return;
    }
    applyDynamicsGenerate({
      genre: dynamicsGenerateGenre?.value || "pop",
      strength: dynamicsGenerateStrength?.value || "normal",
      targetPartIndexes
    });
  }

  function formatDynamicsConflict(partResult) {
    const conditions = [];
    if (Number(partResult.distinctVolumeCount || 0) >= 3) {
      conditions.push(i18nText("vol.distinct_values", [formatCount(partResult.distinctVolumeCount)]));
    }
    if (Number(partResult.volumeRange || 0) >= 2) {
      conditions.push(i18nText("vol.range_diff", [partResult.minVolume, partResult.maxVolume, partResult.volumeRange]));
    }
    return conditions.join(" / ") || i18nText("vol.changes_detected");
  }

  function reopenDynamicsGenerateSettings() {
    if (!dynamicsGenerateDialog?.showModal || dynamicsGenerateDialog.open) return;
    dynamicsGenerateDialog.showModal();
    dynamicsGenerateGenre?.focus();
  }

  function showDynamicsGenerateOverwriteConfirmation(options, conflicts) {
    pendingDynamicsGenerateOptions = { ...options, overwriteExisting: true };
    if (dynamicsGenerateConfirmList) {
      dynamicsGenerateConfirmList.replaceChildren();
      for (const conflict of conflicts) {
        const item = document.createElement("div");
        item.className = `dynamics-confirm-item part-${conflict.partIndex}`;
        const title = document.createElement("strong");
        title.textContent = PART_LABELS[conflict.partIndex] || i18nText("ui.channel_n", [conflict.partIndex + 1]);
        const detail = document.createElement("span");
        detail.textContent = formatDynamicsConflict(conflict);
        item.append(title, detail);
        dynamicsGenerateConfirmList.append(item);
      }
    }

    dynamicsGenerateDialog?.close();
    if (dynamicsGenerateConfirmDialog?.showModal) {
      dynamicsGenerateConfirmDialog.showModal();
      dynamicsGenerateConfirmCancel?.focus();
      return;
    }

    const lines = conflicts.map(conflict => `${PART_LABELS[conflict.partIndex] || i18nText("ui.channel_n", [conflict.partIndex + 1])}: ${formatDynamicsConflict(conflict)}`);
    const confirmed = window.confirm(
      i18nText("vol.conflict_intro") + "\n\n" +
      i18nText("vol.conflict_rule") + "\n\n" +
      `${lines.join("\n")}\n\n${i18nText("vol.replace_confirm")}`
    );
    if (confirmed) {
      const nextOptions = pendingDynamicsGenerateOptions;
      pendingDynamicsGenerateOptions = null;
      applyDynamicsGenerate(nextOptions || options);
    } else {
      pendingDynamicsGenerateOptions = null;
      reopenDynamicsGenerateSettings();
    }
  }

  function confirmDynamicsGenerateOverwrite() {
    const options = pendingDynamicsGenerateOptions;
    pendingDynamicsGenerateOptions = null;
    dynamicsGenerateConfirmDialog?.close();
    if (options) applyDynamicsGenerate(options);
  }

  function cancelDynamicsGenerateOverwrite() {
    pendingDynamicsGenerateOptions = null;
    dynamicsGenerateConfirmDialog?.close();
    reopenDynamicsGenerateSettings();
  }

  function applyDynamicsGenerate(options = {}) {
    if (typeof generateDynamicsMml !== "function") {
      showDialog(i18nText("vol.gen_fail"), i18nText("vol.load_gen"));
      return;
    }
    const selectedIndexes = options.targetPartIndexes == null ? null : normalizePartIndexList(options.targetPartIndexes);
    if (options.targetPartIndexes != null && !selectedIndexes.length) {
      showDialog(i18nText("vol.generate"), i18nText("msg.select_one_ch_3"));
      return;
    }

    const normalizedOptions = {
      genre: options.genre || "pop",
      strength: options.strength || "normal",
      targetPartIndexes: selectedIndexes,
      overwriteExisting: options.overwriteExisting === true
    };
    const sourceMml = normalizeMmlForDisplay(mainMml.value);

    try {
      if (!normalizedOptions.overwriteExisting) {
        const preview = generateDynamicsMml(sourceMml, {
          partCount: 6,
          genre: normalizedOptions.genre,
          strength: normalizedOptions.strength,
          targetPartIndexes: selectedIndexes,
          overwriteExisting: false
        });
        const conflicts = preview.partResults.filter(part => part.status === "existing_expression");
        if (conflicts.length) {
          if (dynamicsGenerateStatus) {
            dynamicsGenerateStatus.textContent = i18nText("vol.conflict_count", [formatCount(conflicts.length)]);
          }
          showDynamicsGenerateOverwriteConfirmation(normalizedOptions, conflicts);
          return;
        }
        commitDynamicsGenerate(preview, normalizedOptions, selectedIndexes);
        return;
      }

      const result = generateDynamicsMml(sourceMml, {
        partCount: 6,
        genre: normalizedOptions.genre,
        strength: normalizedOptions.strength,
        targetPartIndexes: selectedIndexes,
        overwriteExisting: true
      });
      commitDynamicsGenerate(result, normalizedOptions, selectedIndexes);
    } catch (err) {
      if (dynamicsGenerateStatus) dynamicsGenerateStatus.textContent = shortError(err);
      showDialog(i18nText("vol.gen_fail"), shortError(err));
    }
  }

  function commitDynamicsGenerate(result, options, selectedIndexes) {
    const wasPlaying = isPlaying;
    stopPlayback(false);
    if (dynamicsGenerateApply) dynamicsGenerateApply.disabled = true;
    if (dynamicsGenerateCancel) dynamicsGenerateCancel.disabled = true;
    try {
      const info = getDynamicsGenerateInfo(result.genre);
      if (result.generatedCommands <= 0 || result.processedPartCount <= 0) {
        const reason = i18nText("vol.find_notes");
        if (dynamicsGenerateStatus) dynamicsGenerateStatus.textContent = reason;
        showDialog(i18nText("vol.generate"), reason);
        return;
      }
      setMainMml(result.mml);
      dynamicsGenerateDialog?.close();
      dynamicsGenerateConfirmDialog?.close();
      flashButton(dynamicsGenerateBtn, i18nText("st.gen_done"));
      const strengthLabels = { light: i18nText("ui.light"), normal: i18nText("ui.normal"), strong: i18nText("ui.strong") };
      const overwrittenLine = options.overwriteExisting && result.existingExpressivePartCount > 0
        ? "\n" + i18nText("vol.replaced_count", [formatCount(result.existingExpressivePartCount)])
        : "";
      showDialog(
        i18nText("vol.gen_done"),
        i18nText("gen.style_strength", [info.label, strengthLabels[result.strength] || result.strength]) + "\n" +
        i18nText("gen.applied_channels", [formatCount(result.processedPartCount)]) + "\n" +
        i18nText("vol.generated_commands", [formatCount(result.generatedCommands)]) + "\n" +
        i18nText("vol.changed_notes", [formatCount(result.changedNotes), overwrittenLine])
      );
    } catch (err) {
      if (dynamicsGenerateStatus) dynamicsGenerateStatus.textContent = shortError(err);
      showDialog(i18nText("vol.gen_fail"), shortError(err));
    } finally {
      if (dynamicsGenerateApply) dynamicsGenerateApply.disabled = false;
      if (dynamicsGenerateCancel) dynamicsGenerateCancel.disabled = false;
      if (wasPlaying) currentOffset = 0;
    }
  }

  const ACCOMPANIMENT_GENERATE_INFO = {
    pop: { labelKey: "ui.pop", titleKey: "ui.pop_accomp", detailKey: "msg.stable_harm_reg", completionKey: "msg.stable_harm_reg_2" },
    jazz: { labelKey: "ui.jazz", titleKey: "ui.jazz_accomp", detailKey: "msg.jazz_walk", completionKey: "msg.jazz_walk_2" },
    ballad: { labelKey: "ui.ballad", titleKey: "ui.ballad_accomp", detailKey: "msg.long_chords_gentle", completionKey: "msg.long_chords_gentle_2" },
    bossa: { labelKey: "ui.bossa_nova", titleKey: "ui.bossa_nova_accomp", detailKey: "msg.soft_offbeats_broken", completionKey: "msg.soft_offbeat" },
    rock: { labelKey: "ui.rock", titleKey: "ui.rock_accomp", detailKey: "msg.power_chords", completionKey: "msg.power_chords_2" },
    funk: { labelKey: "ui.funk", titleKey: "ui.funk_accomp", detailKey: "pitch.short_chords", completionKey: "pitch.short_syncopated" },
    classical: { labelKey: "ui.classical", titleKey: "ui.classical_accomp", detailKey: "msg.voice_leading", completionKey: "msg.smooth_voice" }
  };

  function getAccompanimentGenerateInfo(genre) {
    const info = ACCOMPANIMENT_GENERATE_INFO[genre] || ACCOMPANIMENT_GENERATE_INFO.pop;
    return {
      label: i18nText(info.labelKey),
      title: i18nText(info.titleKey),
      detail: i18nText(info.detailKey),
      completion: i18nText(info.completionKey)
    };
  }

  function updateAccompanimentGenerateDescription() {
    const genre = accompanimentGenerateGenre?.value || "pop";
    const info = getAccompanimentGenerateInfo(genre);
    if (accompanimentGenerateRuleTitle) accompanimentGenerateRuleTitle.textContent = info.title;
    if (accompanimentGenerateRuleText) accompanimentGenerateRuleText.textContent = info.detail;
  }

  function getAccompanimentPartFlags() {
    const parts = splitMmlParts(normalizeMmlForDisplay(mainMml?.value || "")).slice(0, 6);
    while (parts.length < 6) parts.push("");
    return parts.map((part, partIndex) => {
      let noteCount = 0;
      try {
        noteCount = parseMmlPart(part, partIndex)?.notes?.length || 0;
      } catch (_) {
        noteCount = /(?:^|[^a-z])[a-g](?:\+|#|-)?(?:\d+)?/i.test(String(part || "")) ? 1 : 0;
      }
      return {
        partIndex,
        text: String(part || ""),
        hasContent: Boolean(String(part || "").trim()),
        hasNotes: noteCount > 0,
        noteCount
      };
    });
  }

  function getDefaultAccompanimentTargetIndexes(flags) {
    const notePartIndexes = flags
      .filter(flag => flag.hasNotes)
      .map(flag => flag.partIndex);

    // 멜로디 채널 하나만 있는 경우에는 첫 두 화음 채널을 기본 생성 대상으로 사용합니다.
    if (notePartIndexes.length === 1 && notePartIndexes[0] === 0) return [1, 2];

    // 6개 채널이 모두 차 있으면 마지막 채널을 교체 대상으로 제안합니다.
    if (notePartIndexes.length === 6) return [5];

    // 2개 이상의 채널이 있으면 번호가 가장 앞선 빈 채널 하나만 선택합니다.
    if (notePartIndexes.length >= 2) {
      const firstEmpty = flags.find(flag => !flag.hasNotes);
      return firstEmpty ? [firstEmpty.partIndex] : [];
    }

    // 예외적으로 첫 채널이 아닌 한 채널만 있는 경우에도 가장 앞선 빈 채널을 사용합니다.
    if (notePartIndexes.length === 1) {
      const firstEmpty = flags.find(flag => !flag.hasNotes);
      return firstEmpty ? [firstEmpty.partIndex] : [];
    }

    return [];
  }

  function setAccompanimentDefaultSelection() {
    const flags = getAccompanimentPartFlags();
    const targetIndexes = getDefaultAccompanimentTargetIndexes(flags);
    const targetSet = new Set(targetIndexes);

    applyMmlChannelAvailability(
      ".accompaniment-analysis-channel",
      flags.map(flag => Boolean(flag?.hasContent))
    );
    document.querySelectorAll(".accompaniment-analysis-channel").forEach(input => {
      const index = Number(input.dataset.partIndex);
      input.checked = !input.disabled && Boolean(flags[index]?.hasNotes);
    });
    document.querySelectorAll(".accompaniment-target-channel").forEach(input => {
      const index = Number(input.dataset.partIndex);
      input.checked = targetSet.has(index);
    });
    return { flags, targetIndexes };
  }

  function openAccompanimentGenerateDialog() {
    if (accompanimentGenerateStatus) accompanimentGenerateStatus.textContent = "";
    if (accompanimentGenerateGenre && !Object.prototype.hasOwnProperty.call(ACCOMPANIMENT_GENERATE_INFO, accompanimentGenerateGenre.value)) {
      accompanimentGenerateGenre.value = "pop";
    }
    if (accompanimentGenerateStrength && !["light", "normal", "strong"].includes(accompanimentGenerateStrength.value)) {
      accompanimentGenerateStrength.value = "normal";
    }
    const { flags, targetIndexes } = setAccompanimentDefaultSelection();
    const notePartIndexes = flags.filter(flag => flag.hasNotes).map(flag => flag.partIndex);
    if (accompanimentGenerateStatus) {
      if (notePartIndexes.length === 1 && notePartIndexes[0] === 0) {
        accompanimentGenerateStatus.textContent = i18nText("msg.melody_present");
      } else if (notePartIndexes.length === 6) {
        accompanimentGenerateStatus.textContent = i18nText("msg.all_six");
      } else if (targetIndexes.length > 0) {
        const targetLabel = PART_LABELS[targetIndexes[0]] || i18nText("ui.channel_n", [targetIndexes[0] + 1]);
        accompanimentGenerateStatus.textContent = i18nText("accomp.auto_target", [targetLabel]);
      } else {
        accompanimentGenerateStatus.textContent = i18nText("msg.select_chs");
      }
    }
    updateAccompanimentGenerateDescription();
    pendingAccompanimentGenerateOptions = null;
    if (accompanimentGenerateDialog?.showModal) {
      accompanimentGenerateDialog.showModal();
      accompanimentGenerateGenre?.focus();
      return;
    }
    void executeAccompanimentGeneration({
      genre: "pop",
      strength: "normal",
      analysisPartIndexes: flags.filter(flag => flag.hasNotes).map(flag => flag.partIndex),
      generationPartIndexes: targetIndexes
    });
  }

  function getAccompanimentDialogOptions() {
    return {
      genre: accompanimentGenerateGenre?.value || "pop",
      strength: accompanimentGenerateStrength?.value || "normal",
      analysisPartIndexes: getDialogSelectedPartIndexes(".accompaniment-analysis-channel"),
      generationPartIndexes: getDialogSelectedPartIndexes(".accompaniment-target-channel")
    };
  }

  async function applyAccompanimentGenerateFromDialog() {
    if (!accompanimentGenerateApply || accompanimentGenerateApply.disabled) return;
    const options = getAccompanimentDialogOptions();
    if (!options.analysisPartIndexes.length) {
      showDialog(i18nText("ui.gen_accomp"), i18nText("msg.select_one_ref"));
      return;
    }
    if (!options.generationPartIndexes.length) {
      showDialog(i18nText("ui.gen_accomp"), i18nText("msg.select_one_ch_4"));
      return;
    }

    const flags = getAccompanimentPartFlags();
    const overlapPartIndexes = options.generationPartIndexes.filter(index => options.analysisPartIndexes.includes(index));
    const existingTargetIndexes = options.generationPartIndexes.filter(index => flags[index]?.hasContent);
    const confirmationIndexes = Array.from(new Set([...overlapPartIndexes, ...existingTargetIndexes])).sort((a, b) => a - b);
    if (confirmationIndexes.length) {
      pendingAccompanimentGenerateOptions = { ...options, overlapPartIndexes, existingTargetIndexes, confirmationIndexes };
      renderAccompanimentGenerateConfirmation(pendingAccompanimentGenerateOptions);
      accompanimentGenerateDialog?.close();
      if (accompanimentGenerateConfirmDialog?.showModal) {
        accompanimentGenerateConfirmDialog.showModal();
        accompanimentGenerateConfirmCancel?.focus();
        return;
      }
      const labels = confirmationIndexes.map(index => PART_LABELS[index] || i18nText("ui.channel_n", [index + 1])).join(", ");
      if (window.confirm(i18nText("accomp.replace_confirm", [labels]))) {
        const confirmedOptions = pendingAccompanimentGenerateOptions;
        pendingAccompanimentGenerateOptions = null;
        await executeAccompanimentGeneration(confirmedOptions);
      } else {
        pendingAccompanimentGenerateOptions = null;
        if (accompanimentGenerateDialog?.showModal) accompanimentGenerateDialog.showModal();
      }
      return;
    }
    await executeAccompanimentGeneration(options);
  }

  function renderAccompanimentGenerateConfirmation(options) {
    if (!accompanimentGenerateConfirmList) return;
    accompanimentGenerateConfirmList.replaceChildren();
    for (const partIndex of options.confirmationIndexes || []) {
      const item = document.createElement("div");
      item.className = `dynamics-confirm-item part-${partIndex}`;
      const title = document.createElement("strong");
      title.textContent = PART_LABELS[partIndex] || i18nText("ui.channel_n", [partIndex + 1]);
      const detail = document.createElement("span");
      const overlap = options.overlapPartIndexes?.includes(partIndex);
      detail.textContent = overlap
        ? i18nText("msg.src_ref")
        : i18nText("msg.content_ch");
      item.append(title, detail);
      accompanimentGenerateConfirmList.append(item);
    }
  }

  async function confirmAccompanimentGeneration() {
    const options = pendingAccompanimentGenerateOptions;
    pendingAccompanimentGenerateOptions = null;
    accompanimentGenerateConfirmDialog?.close();
    if (!options) return;
    await executeAccompanimentGeneration(options);
  }

  function cancelAccompanimentGeneration() {
    pendingAccompanimentGenerateOptions = null;
    accompanimentGenerateConfirmDialog?.close();
    if (accompanimentGenerateDialog?.showModal && !accompanimentGenerateDialog.open) {
      accompanimentGenerateDialog.showModal();
      accompanimentGenerateGenre?.focus();
    }
  }

  async function executeAccompanimentGeneration(options) {
    if (!accompanimentGenerateApply || accompanimentGenerateApply.disabled) return;
    accompanimentGenerateApply.disabled = true;
    if (accompanimentGenerateCancel) accompanimentGenerateCancel.disabled = true;
    if (accompanimentGenerateStatus) {
      const label = getAccompanimentGenerateInfo(options.genre)?.label || i18nText("ui.genre");
      accompanimentGenerateStatus.textContent = i18nText("accomp.generating", [formatCount(options.analysisPartIndexes.length), label]);
    }
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const result = applyAccompanimentGeneration(options);
      accompanimentGenerateDialog?.close();
      accompanimentGenerateConfirmDialog?.close();
      showAccompanimentGenerationResult(result);
    } catch (err) {
      if (accompanimentGenerateStatus) accompanimentGenerateStatus.textContent = shortError(err);
      showDialog(i18nText("err.accomp_gen"), shortError(err));
      if (accompanimentGenerateDialog?.showModal && !accompanimentGenerateDialog.open) accompanimentGenerateDialog.showModal();
    } finally {
      accompanimentGenerateApply.disabled = false;
      if (accompanimentGenerateCancel) accompanimentGenerateCancel.disabled = false;
    }
  }

  function applyAccompanimentGeneration(options = {}) {
    if (typeof generateAccompanimentMml !== "function") throw new Error(i18nText("err.load_accomp"));
    stopPlayback(false);
    const result = generateAccompanimentMml(normalizeMmlForDisplay(mainMml.value), {
      genre: options.genre || "pop",
      strength: options.strength || "normal",
      analysisPartIndexes: options.analysisPartIndexes,
      generationPartIndexes: options.generationPartIndexes
    });
    setMainMml(result.mml);
    flashButton(accompanimentGenerateBtn, i18nText("st.gen_done"));
    return result;
  }

  function showAccompanimentGenerationResult(result) {
    const strengthLabels = { light: i18nText("ui.light"), normal: i18nText("ui.normal"), strong: i18nText("ui.strong") };
    const info = getAccompanimentGenerateInfo(result.genre);
    const analysisLabels = result.analysisPartIndexes.map(index => PART_LABELS[index] || i18nText("ui.channel_n", [index + 1])).join(", ");
    const roleLines = result.generatedRoles
      .map(role => `${PART_LABELS[role.partIndex] || i18nText("ui.channel_n", [role.partIndex + 1])}: ${role.role}`)
      .join("\n");
    showDialog(
      i18nText("st.accomp_gen"),
      i18nText("gen.style_strength", [info.label, strengthLabels[result.strength] || result.strength]) + "\n" +
      i18nText("accomp.reference_channels", [analysisLabels]) + "\n" +
      i18nText("accomp.detected_key", [result.key?.label || i18nText("ui.unknown")]) + "\n" +
      i18nText("accomp.chord_sections", [formatCount(result.chordCount || 0)]) + "\n" +
      i18nText("accomp.generated_roles", [roleLines]) + "\n" +
      i18nText("accomp.applied", [info.completion])
    );
  }

  function parseRestTrimLimit(value, options = {}) {
    const raw = String(value || "32").trim().toLowerCase();
    if (raw === "all" || raw === i18nText("ui.all_2") || raw === i18nText("ui.all")) return { all: true, denom: null };
    const denom = Number(raw);
    if (![4, 8, 16, 32, 64].includes(denom)) {
      if (!options.silent) showDialog(i18nText("ui.remove_rests"), i18nText("msg.select_one_all"));
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
      showDialog(i18nText("err.paste"), i18nText("mml.clipboard_read_failed"));
      return;
    }
    if (!String(text || "").trim()) {
      showDialog(i18nText("err.paste"), i18nText("mml.paste_empty"));
      return;
    }

    const prepared = await prepareIrregularLengthPaste(text);
    if (!prepared) return;
    text = prepared.text;

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
    googleDriveMmlFileName = "";
  }

  async function handleEditorMmlPaste(event) {
    const textarea = event.currentTarget;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const pastedText = event.clipboardData?.getData?.("text/plain");
    if (pastedText == null) return;

    let info;
    try {
      info = analyzeIrregularMmlLengths(pastedText);
    } catch (_) {
      return;
    }
    if (!info?.count) return;

    let convertedText;
    try {
      convertedText = normalizeIrregularMmlLengths(pastedText).mml;
    } catch (err) {
      showDialog(i18nText("err.paste"), i18nText("mml.irregular_convert_failed", [shortError(err)]));
      return;
    }

    // 붙여넣은 조각만 자동 보정한다. 기존 편집 내용에 사용자가 직접 입력해 둔
    // 비정규 박자는 경고 상태로 그대로 유지한다.
    event.preventDefault();
    const before = String(textarea.value || "");
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : before.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const next = before.slice(0, start) + convertedText + before.slice(end);

    textarea.value = next;
    const caret = Math.min(next.length, start + convertedText.length);
    try { textarea.setSelectionRange(caret, caret); } catch {}
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    clearSuggestedMmlSaveFileName();
    googleDriveMmlFileName = "";
  }

  async function prepareIrregularLengthPaste(text) {
    const original = String(text || "");
    let info;
    try {
      info = analyzeIrregularMmlLengths(original);
    } catch (_) {
      return { text: original, converted: false };
    }
    if (!info?.count) return { text: original, converted: false };

    try {
      const converted = normalizeIrregularMmlLengths(original);
      return { text: converted.mml, converted: converted.changed, info: converted };
    } catch (err) {
      showDialog(i18nText("err.paste"), i18nText("mml.irregular_convert_failed", [shortError(err)]));
      return { text: original, converted: false };
    }
  }

  async function copyVisibleMml() {
    let text;
    try {
      text = normalizeMmlForCopy(optimizeMml(mainMml?.value || "").mml);
    } catch (err) {
      showDialog(i18nText("err.copy"), i18nText("mml.optimize_error_detail", [shortError(err)]));
      return;
    }
    const mainPanel = panels.find(p => p.dataset.panel === "main") || panels[0];
    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, i18nText("st.copy_done"));
      showCopySummary(mainPanel, text);
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
        flashButton(copyBtn, i18nText("st.copy_done"));
        showCopySummary(mainPanel, text);
        } catch (err) {
        showDialog(i18nText("err.copy"), i18nText("mml.auto_copying"));
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
        .map((part, i) => ({ label: PART_LABELS[i] || i18nText("ui.channel_n", [i + 1]), length: part.length }))
        .filter(row => row.length > 0);
    } else {
      const m = /^part(\d+)$/.exec(activePanel.dataset.panel || "");
      const idx = m ? Number(m[1]) : 0;
      rows = [{ label: PART_LABELS[idx] || i18nText("ui.channel_current"), length: normalizePartText(copiedText).length }].filter(row => row.length > 0);
    }

    if (!rows.length) {
      showDialog(i18nText("st.copy_done"), i18nText("mml.copied_empty"));
      return;
    }

    const total = rows.reduce((sum, row) => sum + row.length, 0);
    const body = [
      i18nText("mml.copied_info"),
      "",
      ...rows.map(row => i18nText("ui.named_chars", [row.label, formatCount(row.length)])),
      "",
      i18nText("ui.total_chars", [formatCount(total)])
    ].join("\n");
    showDialog(i18nText("st.copy_done"), body);
  }


  function openSplitCopyDialog() {
    try {
      buildSplitCopyPages();
      if (splitCopyDialog?.showModal) splitCopyDialog.showModal();
      else showDialog(i18nText("ui.split_copy_score"), i18nText("msg.unsupported_split"));
    } catch (err) {
      showDialog(i18nText("err.split_copy"), shortError(err));
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
      splitCopySummary.textContent = i18nText("split.fail_detail", [shortError(err)]);
      splitCopyPages.innerHTML = "";
      throw err;
    }

    const pages = result.pages || [];
    const warnings = Array.from(result.warnings || []);
    if (splitCopySummary) {
      splitCopySummary.hidden = warnings.length === 0;
      splitCopySummary.innerHTML = warnings.length
        ? `<em>${escapeHtml(warnings.slice(0, 3).join(" / "))}${warnings.length > 3 ? i18nText("ui.more") : ""}</em>`
        : "";
    }

    splitCopyPages.innerHTML = "";
    if (!pages.length) {
      splitCopyPages.innerHTML = i18nText("tpl.mml_split");
      return;
    }

    for (const page of pages) {
      const row = document.createElement("div");
      row.className = `split-copy-page${page.maxPartLength > maxChars ? " over" : ""}`;
      const nonEmpty = page.parts
        .map((part, i) => ({ label: PART_LABELS[i] || i18nText("ui.channel_n", [i + 1]), length: String(part || "").length }))
        .filter(item => item.length > 0);
      const lengthText = nonEmpty.length
        ? nonEmpty.map(item => i18nText("ui.named_chars", [item.label, formatCount(item.length)])).join(" · ")
        : i18nText("ui.empty_score");
      const reasonText = describeSplitReason(page.reason);
      const skipped = page.skippedUnits > 0 ? i18nText("split.removed_silence", [formatBeatUnits(page.skippedUnits)]) : "";
      row.innerHTML = `
        <div class="split-copy-page-main">
          <strong>${escapeHtml(i18nText("split.score_n", [page.index]))}</strong>
          <span>${escapeHtml(lengthText)}</span>
          <small>${escapeHtml(reasonText + skipped)}${page.warning ? ` · ${escapeHtml(page.warning)}` : ""}</small>
        </div>
        <div class="split-copy-page-actions">
          <button type="button" class="ghost" data-split-preview-index="${page.index - 1}">${escapeHtml(i18nText("ui.listen"))}</button>
          <button type="button" class="primary" data-split-copy-index="${page.index - 1}">${escapeHtml(i18nText("ui.copy_2"))}</button>
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
      showDialog(i18nText("err.split_copy_preview"), i18nText("msg.score_play"));
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
      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const parsed = parseMabinogiMml(text);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      if (!notes.length || duration <= 0) throw new Error(i18nText("msg.no_notes_play"));
      if (!soundFont.presets?.length) throw new Error(i18nText("snd.find_avail"));
      const prepared = prepareNotesWithPartPresets(ctx, notes);
      if (!prepared.length) throw new Error(i18nText("msg.no_audible"));
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
      showDialog(i18nText("err.split_copy_preview"), shortError(err));
    }
  }

  async function copySplitPage(page) {
    const text = String(page.mml || "").trim();
    if (!text) {
      showDialog(i18nText("err.split_copy"), i18nText("msg.score_copy"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showDialog(i18nText("st.copy_done"), buildSplitCopyPageMessage(page));
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showDialog(i18nText("st.copy_done"), buildSplitCopyPageMessage(page));
      } catch (err) {
        showDialog(i18nText("err.copy"), i18nText("msg.auto_copying"));
      } finally {
        ta.remove();
      }
    }
  }

  function buildSplitCopyPageMessage(page) {
    const rows = page.parts
      .map((part, i) => ({ label: PART_LABELS[i] || i18nText("ui.channel_n", [i + 1]), length: String(part || "").length }))
      .filter(row => row.length > 0);
    const total = rows.reduce((sum, row) => sum + row.length, 0);
    return [
      i18nText("split.score_copied", [page.index]),
      "",
      ...rows.map(row => i18nText("ui.named_chars", [row.label, formatCount(row.length)])),
      "",
      i18nText("ui.total_chars", [formatCount(total)])
    ].join("\n");
  }

  function describeSplitReason(reason) {
    switch (reason) {
      case "last": return i18nText("ui.last_score");
      case "common-silence": return i18nText("msg.split_shared");
      case "longest-silence": return i18nText("msg.split_longest");
      case "clean-boundary": return i18nText("msg.split_all");
      case "partial-boundary": return i18nText("msg.split_safest");
      case "char-limit": return i18nText("ui.split_char");
      case "forced": return i18nText("ui.forced_split");
      default: return i18nText("ui.split");
    }
  }

  function formatBeatUnits(units) {
    const beats = (Number(units) || 0) / 256;
    if (Math.abs(beats - Math.round(beats)) < 1e-6) return i18nText("ui.beats", [formatCount(Math.round(beats))]);
    return i18nText("ui.beats", [beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")]);
  }

  async function saveVisibleMml() {
    let exportData;
    try {
      exportData = getFullMmlForExport();
    } catch (err) {
      showDialog(i18nText("err.save"), i18nText("mml.optimize_error_detail", [shortError(err)]));
      return;
    }
    const { text } = exportData;
    if (!text.trim()) {
      showDialog(i18nText("err.save"), i18nText("mml.empty"));
      return;
    }

    const defaultName = defaultLocalSaveFileName();
    const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: i18nText("mml.text_file"),
            accept: { "text/plain": [".txt"] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        flashButton(saveBtn, i18nText("st.save_done"));
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        showDialog(i18nText("err.save"), shortError(err));
        return;
      }
    }

    const entered = prompt(i18nText("file.save_name_prompt"), defaultName);
    if (entered == null) return;
    let fileName = entered.trim() || defaultName;
    if (!/\.txt$/i.test(fileName)) fileName += ".txt";
    downloadBlob(blob, fileName);
    flashButton(saveBtn, i18nText("st.save_done"));
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

  function getActiveEditorPartIndex() {
    const match = /^part(\d+)$/.exec(activeTabName || "");
    if (!match) return -1;
    const index = Number(match[1]);
    return Number.isInteger(index) && index >= 0 && index < 6 ? index : -1;
  }

  function codeRangeSignature(ranges) {
    return (ranges || []).map(range => `${range.start}:${range.end}`).join("|");
  }

  function updateVisibleHighlight() {
    if (activeTabName === "main") {
      updateMainHighlight();
      return;
    }
    const index = getActiveEditorPartIndex();
    if (index >= 0) updatePartHighlight(index);
  }

  function updateMainHighlight() {
    if (!mainMmlHighlight || activeTabName !== "main") return;
    const signature = `${editorContentVersion}|${codeRangeSignature(activePlaybackMainRanges)}`;
    if (signature !== mainHighlightRenderSignature) {
      mainMmlHighlight.innerHTML = renderColoredMml(mainMml.value, activePlaybackMainRanges) + "\n";
      mainHighlightRenderSignature = signature;
    }
    syncHighlightScroll();
  }

  function syncHighlightScroll() {
    if (!mainMmlHighlight) return;
    mainMmlHighlight.scrollTop = mainMml.scrollTop;
    mainMmlHighlight.scrollLeft = mainMml.scrollLeft;
  }

  function updatePartHighlight(index) {
    if (activeTabName !== `part${index}`) return;
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    const signature = `${editorContentVersion}|${codeRangeSignature(activePlaybackPartRanges[index] || [])}`;
    if (signature !== partHighlightRenderSignatures[index]) {
      highlight.innerHTML = renderPartWithErrors(textarea.value, activePlaybackPartRanges[index] || []) + "\n";
      partHighlightRenderSignatures[index] = signature;
    }
    syncPartHighlightScroll(index);
  }

  function syncPartHighlightScroll(index) {
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  function getVisiblePianoRollNotes() {
    const notes = Array.isArray(scheduleCache?.notes) ? scheduleCache.notes : [];
    const signature = [
      scheduleCacheVersion,
      notes.length,
      partMuteStates.map(v => v ? "1" : "0").join("")
    ].join("|");
    if (signature === pianoRollVisibleCacheSignature) return pianoRollVisibleCache;

    pianoRollVisibleCacheSignature = signature;
    pianoRollVisibleCache = [];
    for (const note of notes) {
      const part = clampInt(Number(note?.part ?? 0), 0, 5);
      const midi = Number(note?.midi);
      if (!Number.isFinite(midi) || Number(note?.volume ?? 0) <= 0) continue;
      pianoRollVisibleCache.push({
        start: Math.max(0, Number(note?.start) || 0),
        durationSec: Math.max(0.02, Number(note?.durationSec) || 0.02),
        midi: clampInt(midi, 0, 127),
        part,
        muted: Boolean(partMuteStates[part])
      });
    }
    return pianoRollVisibleCache;
  }

  function getPianoRollRange(notes) {
    if (!notes.length) return { min: 48, max: 71 };

    let rawMin = 127;
    let rawMax = 0;
    for (const note of notes) {
      const midi = clampInt(Number(note.midi) || 0, 0, 127);
      rawMin = Math.min(rawMin, midi);
      rawMax = Math.max(rawMax, midi);
    }

    // 건반 폭은 옥타브 수에 의해 결정된다. 예전 계산은 한 옥타브짜리 곡도
    // 최소 범위를 맞춘 뒤 다시 C~B로 반올림하면서 3옥타브까지 늘어날 수 있었고,
    // 그 결과 흰/검은 건반과 세로 레인이 필요 이상으로 눌려 보였다.
    // 점유한 옥타브를 먼저 구한 뒤 부족한 옥타브만 정확히 보충한다.
    const minOctaves = Math.max(1, Math.ceil(PIANO_ROLL_MIN_KEY_SPAN / 12));
    const minOctaveIndex = 0;
    const maxOctaveIndex = Math.floor(127 / 12);
    let firstOctave = Math.floor(rawMin / 12);
    let lastOctave = Math.floor(rawMax / 12);
    const occupiedOctaves = Math.max(1, lastOctave - firstOctave + 1);
    const extraOctaves = Math.max(0, minOctaves - occupiedOctaves);

    firstOctave -= Math.floor(extraOctaves / 2);
    lastOctave += Math.ceil(extraOctaves / 2);

    if (firstOctave < minOctaveIndex) {
      lastOctave = Math.min(maxOctaveIndex, lastOctave + (minOctaveIndex - firstOctave));
      firstOctave = minOctaveIndex;
    }
    if (lastOctave > maxOctaveIndex) {
      firstOctave = Math.max(minOctaveIndex, firstOctave - (lastOctave - maxOctaveIndex));
      lastOctave = maxOctaveIndex;
    }

    const min = Math.max(0, firstOctave * 12);
    const max = Math.min(127, lastOctave * 12 + 11);
    return { min, max };
  }

  function getPianoRollKeyHeight() {
    if (!pianoRoll) return pianoRollExpanded ? 38 : 30;
    const raw = getComputedStyle(pianoRoll).getPropertyValue("--piano-key-h");
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : (pianoRollExpanded ? 38 : 30);
  }

  function noteNameForMidi(midi) {
    const n = clampInt(Number(midi) || 0, 0, 127);
    return `${PIANO_NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
  }

  function getPianoPitch(midi) {
    return ((clampInt(Number(midi) || 0, 0, 127) % 12) + 12) % 12;
  }

  function isPianoBlackKey(midi) {
    return PIANO_BLACK_KEY_PITCHES.has(getPianoPitch(midi));
  }


  function getPianoRollLayout(minMidi, maxMidi) {
    const min = clampInt(Number(minMidi) || 0, 0, 127);
    const max = clampInt(Number(maxMidi) || 0, 0, 127);
    const pitchCount = Math.max(1, max - min + 1);
    const pitchWidth = 100 / pitchCount;

    // 노트와 피아노롤 레인은 모든 반음이 정확히 같은 폭을 사용한다.
    // C-C#-D뿐 아니라 E-F, B-C처럼 검은건반이 없는 반음도 같은 간격을 유지한다.
    const getLaneMetrics = (midi) => {
      const n = clampInt(Number(midi) || 0, min, max);
      const left = (n - min) * pitchWidth;
      return {
        left,
        width: pitchWidth,
        center: left + pitchWidth / 2
      };
    };

    // 균등한 반음 중심을 유지하면서 피아노 모양을 만들기 위해 흰건반 폭을 조절한다.
    // 각 흰건반의 좌/우 끝은 인접한 흰건반 중심과의 중간점이다.
    // 따라서 D/G/A처럼 양옆이 검은건반인 키는 조금 넓고, E-F/B-C 경계의 키는
    // 조금 좁아지지만 모든 MIDI 음의 중심은 반음 간격으로 정확히 정렬된다.
    const previousWhiteDistance = [1, 0, 2, 0, 2, 1, 0, 2, 0, 2, 0, 2];
    const nextWhiteDistance = [2, 0, 2, 0, 1, 2, 0, 2, 0, 2, 0, 1];
    const blackWidth = pitchWidth * PIANO_BLACK_KEY_WIDTH_IN_PITCH_LANES;

    const getKeyMetrics = (midi) => {
      const n = clampInt(Number(midi) || 0, min, max);
      const lane = getLaneMetrics(n);
      const black = isPianoBlackKey(n);
      if (black) {
        const width = Math.min(100, blackWidth);
        const left = Math.max(0, Math.min(100 - width, lane.center - width / 2));
        return { black, left, width, center: lane.center };
      }

      const pitch = getPianoPitch(n);
      const leftRaw = lane.center - (previousWhiteDistance[pitch] * pitchWidth / 2);
      const rightRaw = lane.center + (nextWhiteDistance[pitch] * pitchWidth / 2);
      const left = Math.max(0, leftRaw);
      const right = Math.min(100, rightRaw);
      return {
        black,
        left,
        width: Math.max(0, right - left),
        center: lane.center
      };
    };

    return { pitchWidth, blackWidth, getLaneMetrics, getKeyMetrics };
  }

  function buildPianoRollDataSignature(notes, duration) {
    const first = notes[0] || null;
    const last = notes[notes.length - 1] || null;
    return [
      scheduleCacheVersion,
      notes.length,
      Math.round((Number(duration) || 0) * 1000),
      pianoRollExpanded ? 1 : 0,
      partMuteStates.map(v => v ? "1" : "0").join(""),
      Math.round(Number(pianoRollCanvas?.clientWidth) || 0),
      Math.round(Number(pianoRollCanvas?.clientHeight) || 0),
      document.documentElement.dataset.theme || "light",
      first ? `${Math.round(first.start * 1000)}:${first.midi}:${first.part}` : "-",
      last ? `${Math.round(last.start * 1000)}:${last.midi}:${last.part}` : "-"
    ].join("|");
  }

  function getCanvasCssVar(name, fallback, element = document.documentElement) {
    try {
      const value = getComputedStyle(element).getPropertyValue(name).trim();
      return value || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function preparePianoRollCanvas() {
    if (!(pianoRollCanvas instanceof HTMLCanvasElement)) return null;
    const rect = pianoRollCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || pianoRollCanvas.clientWidth || 1);
    const cssHeight = Math.max(1, rect.height || pianoRollCanvas.clientHeight || 1);
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (pianoRollCanvas.width !== pixelWidth || pianoRollCanvas.height !== pixelHeight) {
      pianoRollCanvas.width = pixelWidth;
      pianoRollCanvas.height = pixelHeight;
    }
    const ctx = pianoRollCanvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return { ctx, width: cssWidth, height: cssHeight };
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPianoKeyLabel(ctx, midi, x, y, width, height, activePart, colors) {
    if (getPianoPitch(midi) !== 0) return;
    const label = noteNameForMidi(midi);
    const match = /^([A-G]#?)(-?\d+)$/.exec(label);
    const textColor = activePart == null ? colors.whiteText : "#ffffff";
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.globalAlpha = activePart == null ? 0.96 : 1;
    ctx.textBaseline = "alphabetic";

    if (width < 32 && match) {
      const fontSize = Math.max(8.5, Math.min(12, height * 0.36));
      const lineHeight = Math.max(7.5, fontSize * 0.86);
      const textX = x + Math.max(2, width * 0.08);
      const bottom = y + height - 4;
      ctx.font = `950 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(match[1], textX, bottom - lineHeight);
      ctx.fillText(match[2], textX, bottom);
    } else {
      const fontSize = Math.max(8, Math.min(11, height * 0.31, width * 0.46));
      ctx.font = `950 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, x + width / 2, y + height - 4);
    }
    ctx.restore();
  }

  function buildPianoRollCanvasColors() {
    const dark = document.documentElement.dataset.theme === "dark";
    return {
      dark,
      line: getCanvasCssVar("--line", dark ? "#334155" : "#d1d5db"),
      accent: getCanvasCssVar("--accent", dark ? "#818cf8" : "#4f46e5"),
      tempo: getCanvasCssVar("--tempo", dark ? "#a78bfa" : "#7c3aed"),
      tempoActive: getCanvasCssVar("--tempo-active", dark ? "#22c55e" : "#16a34a"),
      activeLine: getCanvasCssVar("--active-code-line", dark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.92)"),
      mutedLine: dark ? "rgba(226, 232, 240, 0.82)" : "rgba(51, 65, 85, 0.72)",
      mutedMark: dark ? "rgba(248, 250, 252, 0.88)" : "rgba(30, 41, 59, 0.78)",
      whiteA: getCanvasCssVar("--piano-white-key-bg-a", "#ffffff", pianoRoll),
      whiteB: getCanvasCssVar("--piano-white-key-bg-b", dark ? "#dbeafe" : "#eef2f7", pianoRoll),
      whiteText: getCanvasCssVar("--piano-white-key-text", dark ? "#172033" : "#334155", pianoRoll),
      whiteLine: getCanvasCssVar("--piano-white-key-line", dark ? "rgba(15, 23, 42, .42)" : "rgba(100, 116, 139, .36)", pianoRoll),
      gridLine: dark ? "rgba(148, 163, 184, 0.16)" : "rgba(100, 116, 139, 0.22)",
      blackLane: dark ? "rgba(255, 255, 255, 0.035)" : "rgba(15, 23, 42, 0.035)",
      blackA: "#020617",
      blackB: "#111827",
      parts: Array.from({ length: 6 }, (_, i) => getCanvasCssVar(`--part${i}`, ["#0b4fc4", "#b91c1c", "#047857", "#6d28d9", "#a16207", "#0f5f59"][i]))
    };
  }

  function getPianoRollTempoMap() {
    const source = Array.isArray(scheduleCache?.tempoMap) && scheduleCache.tempoMap.length
      ? scheduleCache.tempoMap
      : (Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : []);
    const sorted = source
      .map((tempo) => ({
        beat: Math.max(0, Number(tempo?.beat) || 0),
        time: Math.max(0, Number(tempo?.time) || 0),
        bpm: Math.max(1, Number(tempo?.bpm) || 120)
      }))
      .sort((a, b) => a.beat - b.beat || a.time - b.time);

    const result = [];
    for (const tempo of sorted) {
      const previous = result[result.length - 1];
      if (previous && Math.abs(previous.beat - tempo.beat) < 1e-7) result[result.length - 1] = tempo;
      else result.push(tempo);
    }
    if (!result.length || result[0].beat > 1e-7) result.unshift({ beat: 0, time: 0, bpm: 120 });
    return result;
  }

  function pianoRollBeatToSeconds(beat, tempoMap) {
    const target = Math.max(0, Number(beat) || 0);
    const map = Array.isArray(tempoMap) && tempoMap.length ? tempoMap : [{ beat: 0, time: 0, bpm: 120 }];
    let segment = map[0];
    for (let i = 1; i < map.length; i++) {
      if (map[i].beat > target + 1e-9) break;
      segment = map[i];
    }
    return segment.time + Math.max(0, target - segment.beat) * 60 / segment.bpm;
  }

  function pianoRollSecondsToBeat(seconds, tempoMap) {
    const target = Math.max(0, Number(seconds) || 0);
    const map = Array.isArray(tempoMap) && tempoMap.length ? tempoMap : [{ beat: 0, time: 0, bpm: 120 }];
    let segment = map[0];
    for (let i = 1; i < map.length; i++) {
      if (map[i].time > target + 1e-9) break;
      segment = map[i];
    }
    return segment.beat + Math.max(0, target - segment.time) * segment.bpm / 60;
  }

  function drawPianoRollCanvasGrid(ctx, width, fallAreaHeight, keyLayout, minMidi, maxMidi, current, visibleEnd, pxPerSec, tempoMap, colors) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    // 피아노롤 본문은 건반의 물리적인 흰/검은 폭이 아니라 균등한 12반음 레인을 사용한다.
    // 검은음도 흰음과 같은 레인 폭을 가지므로 노트 중심 간격과 두께가 모두 일정하다.
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (!isPianoBlackKey(midi)) continue;
      const lane = keyLayout.getLaneMetrics(midi);
      const x = lane.left * width / 100;
      const w = lane.width * width / 100;
      ctx.fillStyle = colors.blackLane;
      ctx.fillRect(x, 0, w, fallAreaHeight);
    }

    // 모든 반음의 경계를 같은 간격으로 그린다. C 경계만 옥타브 구분을 위해 강조한다.
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      const lane = keyLayout.getLaneMetrics(midi);
      const x = lane.left * width / 100;
      ctx.strokeStyle = getPianoPitch(midi) === 0 ? colors.accent : colors.gridLine;
      ctx.lineWidth = getPianoPitch(midi) === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.max(0.5, Math.min(width - 0.5, Math.round(x) + 0.5)), 0);
      ctx.lineTo(Math.max(0.5, Math.min(width - 0.5, Math.round(x) + 0.5)), fallAreaHeight);
      ctx.stroke();
    }

    const finalLane = keyLayout.getLaneMetrics(maxMidi);
    const right = (finalLane.left + finalLane.width) * width / 100;
    ctx.strokeStyle = colors.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.min(width - 0.5, Math.max(0.5, Math.round(right) - 0.5)), 0);
    ctx.lineTo(Math.min(width - 0.5, Math.max(0.5, Math.round(right) - 0.5)), fallAreaHeight);
    ctx.stroke();

    // L4는 1박이다. 각 정수 박자의 실제 시간을 템포맵으로 환산해
    // 건반 윗선에서 시작하고 재생 시간에 따라 아래로 흐르는 격자를 그린다.
    const firstBeat = Math.max(0, Math.ceil(pianoRollSecondsToBeat(current, tempoMap) - 1e-7));
    const lastBeat = Math.floor(pianoRollSecondsToBeat(visibleEnd, tempoMap) + 1e-7);
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const time = pianoRollBeatToSeconds(beat, tempoMap);
      if (time < current - 1e-7 || time > visibleEnd + 1e-7) continue;
      const y = fallAreaHeight - ((time - current) * pxPerSec);
      const strong = beat % 4 === 0;
      ctx.strokeStyle = strong ? colors.line : colors.gridLine;
      ctx.globalAlpha = strong ? 0.58 : 0.34;
      ctx.lineWidth = strong ? 1.15 : 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(y) + 0.5)));
      ctx.lineTo(width, Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(y) + 0.5)));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPianoRollCanvasTempoLines(ctx, width, fallAreaHeight, markers, current, visibleEnd, pxPerSec, colors) {
    if (!Array.isArray(markers) || !markers.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    for (const marker of markers) {
      const time = Math.max(0, Number(marker?.time) || 0);
      if (time < current - 0.03 || time > visibleEnd + 0.03) continue;
      const bpm = Math.max(1, Math.round(Number(marker?.bpm) || 120));
      const rawY = fallAreaHeight - ((time - current) * pxPerSec);
      if (rawY < -1 || rawY > fallAreaHeight + 1) continue;
      const y = Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(rawY) + 0.5));
      const active = Math.abs(time - current) <= 0.035;
      const lineColor = active ? colors.tempoActive : colors.tempo;

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.setLineDash(active ? [] : [7, 4]);
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = active ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.restore();

      const label = `T${bpm}`;
      const hovered = marker === pianoRollHoveredTempoMarker;
      ctx.save();
      ctx.font = `950 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const labelWidth = Math.ceil(ctx.measureText(label).width) + 12;
      const labelHeight = 17;
      const baseLabelX = 5;
      const baseLabelY = Math.max(2, Math.min(fallAreaHeight - labelHeight - 2, y - labelHeight - 2));
      const labelX = hovered ? baseLabelX - 1 : baseLabelX;
      const labelY = hovered ? Math.max(1, baseLabelY - 1) : baseLabelY;
      const drawWidth = hovered ? labelWidth + 2 : labelWidth;
      const drawHeight = hovered ? labelHeight + 2 : labelHeight;
      if (hovered) {
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 1;
      }
      ctx.fillStyle = lineColor;
      drawRoundRect(ctx, labelX, labelY, drawWidth, drawHeight, hovered ? 10 : 8);
      ctx.fill();
      if (hovered) {
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, baseLabelX + 6, baseLabelY + labelHeight / 2 + 0.25);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPianoRollCanvasNotes(ctx, width, fallAreaHeight, keyLayout, visibleNotes, current, pxPerSec, colors) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    const limit = pianoRollExpanded ? 1800 : 720;
    for (const { end, noteDuration, midi, part, active, muted } of visibleNotes.slice(0, limit)) {
      const lane = keyLayout.getLaneMetrics(midi);
      const laneWidth = lane.width * width / 100;
      const noteWidth = Math.max(2, laneWidth * PIANO_ROLL_NOTE_WIDTH_RATIO);
      const center = lane.center * width / 100;
      const x = Math.max(0, Math.min(width - noteWidth, center - noteWidth / 2));
      const y = fallAreaHeight - ((end - current) * pxPerSec);
      const h = Math.max(1.2, noteDuration * pxPerSec);
      if (y > fallAreaHeight || y + h < 0) continue;
      const r = pianoRollExpanded ? 5 : 4;
      ctx.save();
      ctx.globalAlpha = muted ? (active ? 0.42 : 0.27) : (active ? 0.98 : 0.86);
      ctx.fillStyle = colors.parts[part] || colors.parts[0];
      drawRoundRect(ctx, x, y, noteWidth, h, r);
      ctx.fill();
      ctx.globalAlpha = muted ? 0.9 : (active ? 0.95 : 0.28);
      ctx.lineWidth = muted ? 1.4 : (active ? 2 : 1);
      ctx.strokeStyle = muted ? colors.mutedLine : (active ? colors.activeLine : "rgba(255, 255, 255, 0.55)");
      if (muted) ctx.setLineDash([Math.max(2, noteWidth * 0.28), 2.5]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMutedPianoKeyMark(ctx, x, y, width, height, colors) {
    if (width < 3 || height < 6) return;
    ctx.save();
    ctx.strokeStyle = colors.mutedMark;
    ctx.lineWidth = Math.max(1.2, Math.min(2, width * 0.08));
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.22, y + height * 0.2);
    ctx.lineTo(x + width * 0.78, y + height * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawPianoRollCanvasKeyboard(ctx, width, keyY, keyHeight, keyLayout, minMidi, maxMidi, activeKeyParts, colors) {
    ctx.save();
    ctx.lineWidth = 1;

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const x = metrics.left * width / 100;
      const w = metrics.width * width / 100;
      const activeKey = activeKeyParts.get(midi) || null;
      const activePart = activeKey?.part;
      const activeMuted = Boolean(activeKey?.muted);
      const gradient = ctx.createLinearGradient(0, keyY, 0, keyY + keyHeight);
      gradient.addColorStop(0, colors.whiteA);
      gradient.addColorStop(1, colors.whiteB);
      ctx.save();
      ctx.globalAlpha = activeMuted ? 0.42 : 1;
      ctx.fillStyle = activePart == null ? gradient : (colors.parts[activePart] || colors.parts[0]);
      ctx.fillRect(x, keyY, w, keyHeight);
      ctx.restore();
      ctx.strokeStyle = colors.whiteLine;
      ctx.strokeRect(x + 0.5, keyY + 0.5, Math.max(0, w - 1), Math.max(0, keyHeight - 1));
      ctx.fillStyle = "rgba(15, 23, 42, 0.07)";
      ctx.fillRect(x, keyY + keyHeight - Math.max(4, keyHeight * 0.18), w, Math.max(3, keyHeight * 0.18));
      if (activeMuted) drawMutedPianoKeyMark(ctx, x, keyY, w, keyHeight, colors);
    }

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (!isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const x = metrics.left * width / 100;
      const w = metrics.width * width / 100;
      const h = keyHeight * PIANO_BLACK_KEY_HEIGHT_RATIO;
      const activeKey = activeKeyParts.get(midi) || null;
      const activePart = activeKey?.part;
      const activeMuted = Boolean(activeKey?.muted);
      const gradient = ctx.createLinearGradient(0, keyY, 0, keyY + h);
      gradient.addColorStop(0, colors.blackA);
      gradient.addColorStop(1, colors.blackB);
      ctx.save();
      ctx.globalAlpha = activeMuted ? 0.46 : 1;
      ctx.fillStyle = activePart == null ? gradient : (colors.parts[activePart] || colors.parts[0]);
      drawRoundRect(ctx, x, keyY, w, h, Math.min(4, w / 2));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.stroke();
      if (activeMuted) drawMutedPianoKeyMark(ctx, x, keyY, w, h, colors);
    }

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const activeKey = activeKeyParts.get(midi) || null;
      drawPianoKeyLabel(
        ctx,
        midi,
        metrics.left * width / 100,
        keyY,
        metrics.width * width / 100,
        keyHeight,
        activeKey?.part,
        colors
      );
    }
    ctx.restore();
  }

  function updatePianoRoll(currentSec, durationSec, force = false) {
    if (!pianoRoll || !pianoRollCanvas) return;

    const notes = getVisiblePianoRollNotes();
    const duration = Math.max(0, Number(durationSec) || 0);
    const current = Math.max(0, Math.min(duration || Infinity, Number(currentSec) || 0));
    const bucket = Math.floor(current * (pianoRollExpanded ? 36 : 24));
    const dataSignature = buildPianoRollDataSignature(notes, duration);
    if (!force && bucket === pianoRollLastRenderBucket && dataSignature === pianoRollLastDataSignature) return;
    pianoRollLastRenderBucket = bucket;
    pianoRollLastDataSignature = dataSignature;

    const canvas = preparePianoRollCanvas();
    if (!canvas) return;
    const { ctx, width, height: stageHeight } = canvas;

    if (!notes.length || duration <= 0) {
      if (pianoRollEmpty) pianoRollEmpty.hidden = false;
      if (pianoRollRangeLabel) pianoRollRangeLabel.textContent = i18nText("roll.title");
      return;
    }

    if (pianoRollEmpty) pianoRollEmpty.hidden = true;
    const range = getPianoRollRange(notes);
    pianoRollKeyMin = range.min;
    pianoRollKeyMax = range.max;
    const keyLayout = getPianoRollLayout(pianoRollKeyMin, pianoRollKeyMax);
    const keyHeight = Math.min(getPianoRollKeyHeight(), Math.max(18, stageHeight * 0.72));
    const fallAreaHeight = Math.max(12, stageHeight - keyHeight);
    const fallWindow = pianoRollExpanded ? PIANO_ROLL_FALL_WINDOW_EXPANDED : PIANO_ROLL_FALL_WINDOW_COLLAPSED;
    const pxPerSec = fallAreaHeight / fallWindow;
    const visibleEnd = current + fallWindow;
    const activeKeyParts = new Map();
    const visibleNotes = [];

    for (const note of notes) {
      const start = Math.max(0, Number(note.start) || 0);
      if (start > visibleEnd) break;
      const noteDuration = Math.max(0.02, Number(note.durationSec) || 0.02);
      const end = start + noteDuration;
      // 노트의 아래쪽 끝은 발음 시작점, 위쪽 끝은 발음 종료점이다.
      // 시작점이 건반 구분선에 닿는 순간 소리가 나고, 종료점이 구분선을 지나면 완전히 사라진다.
      if (end <= current) continue;
      const midi = clampInt(Number(note.midi) || 0, 0, 127);
      if (midi < pianoRollKeyMin || midi > pianoRollKeyMax) continue;
      const part = clampInt(Number(note.part ?? 0), 0, 5);
      const muted = Boolean(note.muted);
      const active = start <= current + 0.012 && end >= current - 0.026;
      if (active) {
        const previous = activeKeyParts.get(midi);
        // 같은 건반에 음소거/재생 채널이 동시에 있으면 실제로 들리는 채널을 우선 표시한다.
        if (!previous || (previous.muted && !muted)) activeKeyParts.set(midi, { part, muted });
      }
      visibleNotes.push({ start, end, noteDuration, midi, part, active, muted });
    }

    const colors = buildPianoRollCanvasColors();
    const tempoMap = getPianoRollTempoMap();
    drawPianoRollCanvasGrid(
      ctx,
      width,
      fallAreaHeight,
      keyLayout,
      pianoRollKeyMin,
      pianoRollKeyMax,
      current,
      visibleEnd,
      pxPerSec,
      tempoMap,
      colors
    );
    drawPianoRollCanvasNotes(ctx, width, fallAreaHeight, keyLayout, visibleNotes, current, pxPerSec, colors);
    drawPianoRollCanvasTempoLines(
      ctx,
      width,
      fallAreaHeight,
      scheduleCache?.tempoMarkers || [],
      current,
      visibleEnd,
      pxPerSec,
      colors
    );
    drawPianoRollCanvasKeyboard(ctx, width, fallAreaHeight, keyHeight, keyLayout, pianoRollKeyMin, pianoRollKeyMax, activeKeyParts, colors);

    ctx.save();
    ctx.strokeStyle = colors.tempoActive;
    ctx.lineWidth = 2;
    ctx.shadowColor = colors.tempoActive;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, fallAreaHeight + 0.5);
    ctx.lineTo(width, fallAreaHeight + 0.5);
    ctx.stroke();
    ctx.restore();

    if (pianoRollRangeLabel) {
      const shown = visibleNotes.length;
      const total = notes.length;
      pianoRollRangeLabel.textContent = `${noteNameForMidi(pianoRollKeyMin)}–${noteNameForMidi(pianoRollKeyMax)} · ${shown}/${total}`;
    }
  }

  function updatePlaybackCodeHighlight(currentSec) {
    const noteList = Array.isArray(scheduleCache?.notes) ? scheduleCache.notes : [];
    const restList = Array.isArray(scheduleCache?.rests) ? scheduleCache.rests : [];
    if (!noteList.length && !restList.length) {
      clearPlaybackCodeHighlight();
      return;
    }

    const current = Math.max(0, Number(currentSec) || 0);
    const scanBucket = Math.floor(current * 30);
    const scanSignature = `${scheduleCacheVersion}|${activeTabName}|${noteList.length}|${restList.length}|${partMuteStates.map(v => v ? "1" : "0").join("")}`;
    if (scanBucket === activePlaybackScanBucket && scanSignature === activePlaybackScanSignature) return;
    activePlaybackScanBucket = scanBucket;
    activePlaybackScanSignature = scanSignature;
    const mainRanges = [];
    const partRanges = Array.from({ length: 6 }, () => []);
    const activePartIndex = getActiveEditorPartIndex();
    const collectMainRanges = activeTabName === "main";

    const collectSourceRanges = (item, part) => {
      const sourceRanges = Array.isArray(item.sourceRanges) && item.sourceRanges.length
        ? item.sourceRanges
        : [{ start: item.sourceStart, end: item.sourceEnd, globalStart: item.globalSourceStart, globalEnd: item.globalSourceEnd }];

      for (const range of sourceRanges) {
        const partStart = Number(range?.start);
        const partEnd = Number(range?.end);
        const globalStart = Number(range?.globalStart);
        const globalEnd = Number(range?.globalEnd);
        if (part === activePartIndex && Number.isFinite(partStart) && Number.isFinite(partEnd) && partEnd > partStart) {
          partRanges[part].push({ start: partStart, end: partEnd });
        }
        if (collectMainRanges && Number.isFinite(globalStart) && Number.isFinite(globalEnd) && globalEnd > globalStart) {
          mainRanges.push({ start: globalStart, end: globalEnd });
        }
      }
    };

    const isCurrentItem = (item) => {
      const start = Number(item.start) || 0;
      const end = start + Math.max(0, Number(item.durationSec) || 0);
      return current + ACTIVE_CODE_LOOKAHEAD_SEC >= start && current <= end + ACTIVE_CODE_RELEASE_SEC;
    };

    for (const note of noteList) {
      const part = clampInt(Number(note?.part ?? 0), 0, 5);
      if (partMuteStates[part]) continue;
      if (Number(note?.volume ?? 0) <= 0) continue;
      if (!isCurrentItem(note)) continue;
      collectSourceRanges(note, part);
    }

    for (const rest of restList) {
      const part = clampInt(Number(rest?.part ?? 0), 0, 5);
      if (partMuteStates[part]) continue;
      if (!isCurrentItem(rest)) continue;
      collectSourceRanges(rest, part);
    }

    const compactMain = compactCodeRanges(mainRanges);
    const compactParts = partRanges.map(compactCodeRanges);
    const signature = buildActiveCodeSignature(compactMain, compactParts);
    if (signature === activePlaybackCodeSignature) return;

    activePlaybackCodeSignature = signature;
    activePlaybackMainRanges = compactMain;
    activePlaybackPartRanges = compactParts;
    updateVisibleHighlight();
  }

  function clearPlaybackCodeHighlight() {
    if (!activePlaybackCodeSignature && activePlaybackMainRanges.length === 0 && activePlaybackPartRanges.every(r => !r.length)) return;
    activePlaybackCodeSignature = "";
    activePlaybackScanBucket = -1;
    activePlaybackScanSignature = "";
    activePlaybackMainRanges = [];
    activePlaybackPartRanges = Array.from({ length: 6 }, () => []);
    updateVisibleHighlight();
  }

  function compactCodeRanges(ranges) {
    const sorted = Array.from(ranges || [])
      .map(r => ({ start: Math.max(0, Math.floor(Number(r.start) || 0)), end: Math.max(0, Math.ceil(Number(r.end) || 0)) }))
      .filter(r => r.end > r.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [];
    for (const range of sorted) {
      const last = out[out.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else out.push({ ...range });
    }
    return out;
  }

  function buildActiveCodeSignature(mainRanges, partRanges) {
    const main = (mainRanges || []).map(r => `m${r.start}:${r.end}`).join("|");
    const parts = (partRanges || []).map((ranges, i) => ranges.map(r => `p${i}:${r.start}:${r.end}`).join("|")).join("|");
    return `${main}#${parts}`;
  }

  function renderColoredMml(text, activeRanges = []) {
    const s = normalizeMmlForDisplay(text);
    const classes = createClassBuckets(s.length);
    const at = s.indexOf("@");
    const lastSemi = s.lastIndexOf(";");
    const hasHeader = /^\s*MML\s*@/i.test(s) && at >= 0;
    const bodyStart = hasHeader ? at + 1 : 0;
    const bodyEnd = lastSemi >= bodyStart ? lastSemi : s.length;

    if (hasHeader) addRangeClass(classes, 0, bodyStart, "mml-prefix");
    if (lastSemi >= bodyStart) addRangeClass(classes, bodyEnd, s.length, "mml-suffix");
    for (let i = bodyStart; i < bodyEnd; i++) {
      if (s[i] === ",") addRangeClass(classes, i, i + 1, "mml-separator");
    }

    const detailedParts = typeof splitMmlPartsDetailed === "function" ? splitMmlPartsDetailed(s).slice(0, 6) : [];
    detailedParts.forEach((info, index) => {
      const partClass = `ch${Math.min(index, 5)}`;
      addRangeClass(classes, info.sourceStart, info.sourceEnd, partClass);
      const invalid = findInvalidPartChars(info.text);
      invalid.forEach(pos => addRangeClass(classes, info.sourceStart + pos, info.sourceStart + pos + 1, "invalid-code"));
      const irregularRanges = findIrregularPartRanges(info.text);
      for (const range of irregularRanges) addRangeClass(classes, info.sourceStart + range.start, info.sourceStart + range.end, "irregular-length-code");
      const tempoRanges = findTempoHighlightRanges(info.text, invalid);
      for (const range of tempoRanges) addRangeClass(classes, info.sourceStart + range.start, info.sourceStart + range.end, "tempo-code");
    });

    for (const range of activeRanges || []) addRangeClass(classes, range.start, range.end, "mml-active-code");
    return renderClassedText(s, classes);
  }

  function renderPartWithErrors(part, activeRanges = []) {
    const text = String(part || "");
    const classes = createClassBuckets(text.length);
    const invalid = findInvalidPartChars(text);
    invalid.forEach(pos => addRangeClass(classes, pos, pos + 1, "invalid-code"));
    const irregularRanges = findIrregularPartRanges(text);
    for (const range of irregularRanges) addRangeClass(classes, range.start, range.end, "irregular-length-code");
    const tempoRanges = findTempoHighlightRanges(text, invalid);
    for (const range of tempoRanges) addRangeClass(classes, range.start, range.end, "tempo-code");
    for (const range of activeRanges || []) addRangeClass(classes, range.start, range.end, "mml-active-code");
    return renderClassedText(text, classes);
  }

  function createClassBuckets(length) {
    return Array.from({ length: Math.max(0, Number(length) || 0) }, () => []);
  }

  function addRangeClass(classes, start, end, className) {
    if (!className || !classes?.length) return;
    const from = Math.max(0, Math.min(classes.length, Math.floor(Number(start) || 0)));
    const to = Math.max(from, Math.min(classes.length, Math.ceil(Number(end) || 0)));
    for (let i = from; i < to; i++) {
      if (!classes[i].includes(className)) classes[i].push(className);
    }
  }

  function renderClassedText(text, classes) {
    const s = String(text || "");
    if (!s) return "";
    let out = "";
    let runStart = 0;
    let runKey = (classes[0] || []).join(" ");

    const flush = (to) => {
      const chunk = escapeHtml(s.slice(runStart, to));
      out += runKey ? `<span class="${runKey}">${chunk}</span>` : chunk;
    };

    for (let i = 1; i < s.length; i++) {
      const key = (classes[i] || []).join(" ");
      if (key === runKey) continue;
      flush(i);
      runStart = i;
      runKey = key;
    }
    flush(s.length);
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

  function findIrregularPartRanges(part) {
    try {
      const info = analyzeIrregularMmlLengths(String(part || ""));
      return (info?.occurrences || [])
        .map(item => ({
          start: Math.max(0, Number(item?.start) || 0),
          end: Math.max(0, Number(item?.end) || 0)
        }))
        .filter(range => range.end > range.start);
    } catch (_) {
      return [];
    }
  }

  function findInvalidPartChars(part) {
    const s = String(part || "");
    const invalid = new Set();
    let i = 0;

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
      if (!Number.isFinite(n.value) || n.value <= 0) mark(n.start, n.end);
      readDots();
    };
    const isNote = ch => "cdefgab".includes(ch);
    const hasTieTargetAhead = from => {
      let j = from;
      const skipAheadSpace = () => { while (j < s.length && /\s/.test(s[j])) j++; };
      const readAheadDigits = () => {
        const start = j;
        while (j < s.length && /\d/.test(s[j])) j++;
        return j > start;
      };

      while (j < s.length) {
        skipAheadSpace();
        if (j >= s.length) return false;

        const raw = s[j];
        const lower = raw.toLowerCase();
        if (isNote(lower) || lower === "r" || lower === "n") return true;

        if (raw === ">" || raw === "<") {
          j++;
          continue;
        }

        if ("tolv".includes(lower)) {
          j++;
          if (!readAheadDigits()) return false;
          if (lower === "l") {
            while (s[j] === ".") j++;
          }
          continue;
        }

        return false;
      }
      return false;
    };

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
        if (n.value == null || !Number.isFinite(n.value) || n.value <= 0) mark(n.start === n.end ? start : n.start, n.end);
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
        if (!hasTieTargetAhead(i)) mark(start, start + 1);
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
