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
  const AUTO_IMPORT_LEADING_SILENCE_SECONDS = 2;


  const { shortError, base64ToUint8Array, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview } = window.MabiMidi;
  const { parseMabinogiMml, splitMmlParts, buildSchedule, composeMml } = window.MabiMml;
  const { optimizeMml, optimizePart, trimShortRestsMml, addLeadingSilenceMml, splitMmlPages } = window.MabiOptimizer;
  const { parseSoundFont, prepareNotes, schedulePreparedNotes } = window.MabiSf2;

  const $ = (id) => document.getElementById(id);
  const midiFile = $("midiFile");
  const midiLoadBtn = $("midiLoadBtn");
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
  const leadingSilenceBtn = $("leadingSilenceBtn");
  const leadingSilenceDialog = $("leadingSilenceDialog");
  const leadingSilenceSeconds = $("leadingSilenceSeconds");
  const leadingSilenceApply = $("leadingSilenceApply");
  const leadingSilenceCancel = $("leadingSilenceCancel");
  const midiConvertDialog = $("midiConvertDialog");
  const midiConvertSummary = $("midiConvertSummary");
  const midiFullPreviewBtn = $("midiFullPreviewBtn");
  const midiChannelList = $("midiChannelList");
  const midiExportCount = $("midiExportCount");
  const midiRoleList = $("midiRoleList");
  const midiBeatNotice = $("midiBeatNotice");
  const midiInstrumentPanelTitle = $("midiInstrumentPanelTitle");
  const midiInstrumentPanelHint = $("midiInstrumentPanelHint");
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
  let suggestedMmlSaveFileName = "";

  init();

  function init() {
    loadThemePref();
    loadPlaybackPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    midiLoadBtn.addEventListener("click", () => { midiFile.value = ""; midiFile.click(); });
    midiFile.addEventListener("change", () => void loadSourceFile());
    googleLoginBtn?.addEventListener("click", () => void handleGoogleLoginButton());
    googleDriveLoadBtn?.addEventListener("click", () => void openGoogleDrivePicker());
    googleDriveSaveBtn?.addEventListener("click", () => void saveMmlToGoogleDrive());
    codeHelpBtn?.addEventListener("click", () => openCodeHelpDialog());
    codeHelpClose?.addEventListener("click", () => codeHelpDialog?.close());
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
    midiExportCount?.addEventListener("change", updateMidiRoleControls);
    midiFullPreviewBtn?.addEventListener("click", () => void toggleMidiFullPreview());
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
    });
    partSoundDialog?.addEventListener("close", () => stopMidiPreview());
    themeToggleBtn?.addEventListener("click", toggleTheme);
    mainMml.addEventListener("input", () => {
      normalizeTextareaCommands(mainMml);
      syncPartsFromMain();
      updateMainHighlight();
    });
    mainMml.addEventListener("scroll", syncHighlightScroll);
    partTexts.forEach(t => t.addEventListener("input", () => {
      normalizeTextareaCommands(t);
      syncMainFromParts();
    }));
    tabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
    normalizeTextareaCommands(mainMml);
    syncPartsFromMain();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    resetSoundActionMenu();
    updateSoundPresetControls();
    updatePartMuteControl();
    updateGoogleDriveControls();
    updateCharCount();
    rebuildSchedulePreviewSilently();
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
        : "Google Drive의 MML_Mobibard 폴더에서 MIDI 또는 TXT MML 파일을 선택합니다.";
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

  async function ensureGoogleAccessToken(interactive = true) {
    if (isGoogleConnected()) return googleAccessToken;
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
          updateGoogleDriveControls("구글 연동됨");
          resolve(googleAccessToken);
        };
        googleTokenClient.requestAccessToken({ prompt: "" });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleGoogleLoginButton() {
    if (isGoogleConnected()) {
      googleAccessToken = "";
      googleTokenExpiresAt = 0;
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      googleDriveMmlFolderId = "";
      clearTimeout(googleSettingsSaveTimer);
      updateGoogleDriveControls("구글 로그아웃됨");
      return;
    }
    try {
      updateGoogleDriveControls("구글 로그인 중...");
      await ensureGoogleAccessToken(true);
      const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
      updateGoogleDriveControls(appliedDriveSettings ? "구글 설정 적용됨" : "로컬 설정 사용 중");
    } catch (err) {
      googleAccessToken = "";
      googleTokenExpiresAt = 0;
      googleDriveMmlFolderId = "";
      updateGoogleDriveControls("구글 로그인 실패");
      showDialog("구글 로그인 실패", shortError(err));
    }
  }

  function driveQueryString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function googleDriveFetch(url, options = {}, retry = true) {
    const token = await ensureGoogleAccessToken(true);
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      googleAccessToken = "";
      googleTokenExpiresAt = 0;
      updateGoogleDriveControls("구글 인증 갱신 필요");
      await ensureGoogleAccessToken(true);
      return googleDriveFetch(url, options, false);
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
    await ensureGoogleAccessToken(true);
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
      if (!name || name.includes(".") || name.length > 80) continue;
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
      await ensureGoogleAccessToken(true);
      if (!googleApiKey()) throw new Error("Google Picker API Key가 설정되지 않았습니다. js/google-config.js의 apiKey를 채워 주세요.");
      setGoogleStatus(`${GOOGLE_MML_FOLDER_NAME} 폴더 확인 중...`);
      const folderId = await ensureGoogleMmlFolder();
      await ensureGooglePickerLoaded();
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      try { view.setMimeTypes(`audio/midi,audio/x-midi,text/plain,application/octet-stream,${GOOGLE_DRIVE_FOLDER_MIME}`); } catch (_) {}
      try { if (folderId && typeof view.setParent === "function") view.setParent(folderId); } catch (_) {}
      const builder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey())
        .setOAuthToken(googleAccessToken)
        .setTitle(`${GOOGLE_MML_FOLDER_NAME}에서 MIDI / TXT MML 파일 선택`)
        .addView(view)
        .setCallback((data) => void handleGooglePickerResult(data));
      const appId = googleAppId();
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
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
      showDialog("Drive 불러오기", "폴더가 아니라 MIDI 또는 TXT 파일을 선택해 주세요.");
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

  async function loadGoogleDriveSourceFile(fileId, fallbackName = "Google Drive 파일") {
    await ensureGoogleAccessToken(true);
    stopMidiPreview();
    stopPlayback(false);
    const meta = await getGoogleDriveFileMeta(fileId);
    const name = meta?.name || fallbackName;
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const response = await googleDriveFetch(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    if (ext === "mid" || ext === "midi") {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const overview = analyzeMidi(bytes, name);
      googleDriveMmlFileId = "";
      googleDriveMmlFileName = "";
      openMidiConvertDialog({ bytes, name, overview });
      setGoogleStatus("Drive MIDI 불러옴");
      return;
    }
    if (ext === "txt") {
      const loaded = readMmlTextFile(await response.text());
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
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      setGoogleStatus("Drive TXT 불러옴");
      return;
    }
    throw new Error("지원하지 않는 Drive 파일입니다. midi 또는 txt 파일만 선택해 주세요.");
  }

  async function saveMmlToGoogleDrive() {
    try {
      await ensureGoogleAccessToken(true);
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

  async function loadSourceFile() {
    const file = midiFile.files?.[0];
    if (!file) return;
    const name = file.name || "선택한 파일";
    const ext = name.split(".").pop()?.toLowerCase() || "";
    googleDriveMmlFileId = "";
    googleDriveMmlFileName = "";
    clearSuggestedMmlSaveFileName();
    try {
      stopMidiPreview();
      stopPlayback(false);
      if (ext === "mid" || ext === "midi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const overview = analyzeMidi(bytes, name);
        openMidiConvertDialog({ bytes, name, overview });
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
      } else {
        throw new Error("지원하지 않는 파일입니다. mid, midi, txt 파일을 선택해 주세요.");
      }
    } catch (err) {
      showDialog("파일 불러오기 실패", shortError(err));
    }
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
      midiConvertSummary.textContent = `${importData.name || "MIDI"} · 노트 ${formatCount(overview.noteCount)}개 · 악기 ${formatCount(groups.length)}개 · 일반 ${formatCount(normalGroups.length)}개 / 비트 ${formatCount(beatGroups.length)}개 · PPQ ${overview.ppq}`;
    }
    if (midiBeatNotice) {
      midiBeatNotice.hidden = beatGroups.length > 0;
      midiBeatNotice.textContent = beatGroups.length ? "" : "이 MIDI에는 비트 그룹 악기가 없습니다.";
    }
    if (midiExportCount) midiExportCount.value = "3";
    setMidiConvertBusy(false);
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();

    if (midiConvertDialog?.showModal) {
      midiConvertDialog.showModal();
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
        selectedInstrumentGroups: new Set(role === "beat" ? beatIds : normalIds)
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
    const count = clampInt(Number(midiExportCount?.value || pendingMidiSettings.partCount || 3), 1, 6);
    pendingMidiSettings.partCount = count;
    if (pendingMidiSettings.activeIndex >= count) pendingMidiSettings.activeIndex = Math.max(0, count - 1);
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
      row.querySelector("[data-merge-index]")?.addEventListener("change", (ev) => {
        const mode = normalizeOverlapMergeMode(ev.target.value);
        pendingMidiSettings.channels[i].overlapMergeMode = mode;
        pendingMidiSettings.channels[i].overlapMerge = mode !== "none";
      });
      midiRoleList.appendChild(row);
    }
  }

  function updateMidiChannelRole(index, role) {
    if (!pendingMidiSettings) return;
    const setting = pendingMidiSettings.channels[index];
    const previousIsBeat = setting.role === "beat";
    const nextRole = role === "beat" && !pendingMidiSettings.hasBeatGroups ? "auto" : role;
    setting.role = nextRole;
    const nextIsBeat = nextRole === "beat";
    if (previousIsBeat !== nextIsBeat) {
      const allowedIds = nextIsBeat ? pendingMidiSettings.beatIds : pendingMidiSettings.normalIds;
      setting.selectedInstrumentGroups = new Set(allowedIds);
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
    const count = clampInt(Number(midiExportCount?.value || pendingMidiSettings.partCount || 3), 1, 6);
    const items = [];
    for (let i = 0; i < count; i++) {
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

  function renderActiveMidiInstrumentList() {
    if (!midiChannelList || !pendingMidiSettings) return;
    const activeIndex = pendingMidiSettings.activeIndex;
    const setting = getActiveMidiChannelSetting();
    const groups = getAllowedMidiGroupsForSetting(setting);
    const isBeat = setting?.role === "beat";
    if (midiInstrumentPanelTitle) midiInstrumentPanelTitle.textContent = `${PART_LABELS[activeIndex]} 악기`;
    if (midiInstrumentPanelHint) {
      midiInstrumentPanelHint.textContent = isBeat
        ? "비트 채널은 비트 그룹 악기만 선택할 수 있습니다."
        : "한 채널에 여러 일반 악기를 선택할 수 있습니다.";
    }

    midiChannelList.innerHTML = "";
    const section = document.createElement("div");
    section.className = `midi-instrument-section${groups.length ? "" : " empty"}`;
    section.innerHTML = `
      <div class="midi-instrument-section-head">
        <strong>${isBeat ? "비트 악기" : "일반 악기"}</strong>
        ${isBeat ? `<span>드럼·북·스네어·심벌즈 계열</span>` : ""}
      </div>
    `;
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "midi-instrument-empty";
      empty.textContent = isBeat ? "선택할 비트 악기가 없습니다." : "선택할 일반 악기가 없습니다.";
      section.appendChild(empty);
      midiChannelList.appendChild(section);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "midi-instrument-actions";
    actions.innerHTML = `
      <button class="mini-button" type="button" data-midi-select-all>전부 선택</button>
      <button class="mini-button" type="button" data-midi-select-none>전부 해제</button>
    `;
    actions.querySelector("[data-midi-select-all]")?.addEventListener("click", () => {
      for (const g of groups) setting.selectedInstrumentGroups.add(g.id);
      renderMidiRoleList();
      renderActiveMidiInstrumentList();
      updateMidiRoleControls();
    });
    actions.querySelector("[data-midi-select-none]")?.addEventListener("click", () => {
      for (const g of groups) setting.selectedInstrumentGroups.delete(g.id);
      renderMidiRoleList();
      renderActiveMidiInstrumentList();
      updateMidiRoleControls();
    });
    section.appendChild(actions);

    for (const group of groups) {
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
      section.appendChild(row);
    }
    midiChannelList.appendChild(section);
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
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, preview.duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: null,
        minLeadTime: 0.01
      });
      const stopMs = Math.max(800, Math.min(60000, (result.maxEnd - ctx.currentTime + 0.3) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      stopMidiPreview();
      showDialog("MIDI 미리듣기 실패", shortError(err));
    }
  }

  function setMidiFullPreviewState(active) {
    midiFullPreviewActive = Boolean(active);
    if (midiFullPreviewBtn) {
      midiFullPreviewBtn.textContent = midiFullPreviewActive ? "MIDI 정지" : "MIDI 듣기";
      midiFullPreviewBtn.classList.toggle("danger", midiFullPreviewActive);
      midiFullPreviewBtn.setAttribute("aria-pressed", midiFullPreviewActive ? "true" : "false");
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
      await loadDefaultSf2IfNeeded();
      const preview = buildMidiInstrumentPreview(pendingMidiImport.bytes, groupId, { maxSeconds: 8, tailSeconds: 0.75 });
      const ctx = await ensureAudioContext();
      const preset = findPreviewPreset(preview);
      if (!preset) throw new Error("미리듣기에 사용할 SF2 프리셋을 찾지 못했습니다.");
      const prepared = prepareNotes(ctx, soundFont, preset, preview.notes);
      if (!prepared.length) throw new Error("SF2에서 미리듣기 할 소리를 찾지 못했습니다.");
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, preview.duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01
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
    setMidiFullPreviewState(false);
    resetSplitPreviewButton();
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
    const count = clampInt(Number(midiExportCount?.value || 3), 1, 6);
    pendingMidiSettings.partCount = count;
    if (midiExportCount) midiExportCount.value = String(count);
    if (pendingMidiSettings.activeIndex >= count) pendingMidiSettings.activeIndex = Math.max(0, count - 1);
    const rows = Array.from(midiRoleList?.querySelectorAll(".midi-role-row") || []);
    rows.forEach((row, i) => {
      const enabled = i < count;
      const active = i === pendingMidiSettings.activeIndex;
      row.classList.toggle("disabled", !enabled);
      row.classList.toggle("active", active);
      row.querySelectorAll("button, select, input").forEach(control => { control.disabled = !enabled; });
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

  function collectMidiConvertOptions() {
    if (!pendingMidiSettings) throw new Error("MIDI 변환 설정을 찾지 못했습니다.");
    const partCount = clampInt(Number(midiExportCount?.value || pendingMidiSettings.partCount || 3), 1, 6);
    const exportChannels = [];
    for (let i = 0; i < partCount; i++) {
      const setting = pendingMidiSettings.channels[i];
      const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
      const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
      if (!selected.length) throw new Error(`${PART_LABELS[i]} 채널에 포함할 악기를 하나 이상 선택해 주세요.`);
      const overlapMergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      exportChannels.push({
        role: setting.role || "auto",
        overlapMergeMode,
        overlapMerge: overlapMergeMode !== "none",
        selectedInstrumentGroups: selected
      });
    }
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
      midiConvertDialog?.close();
      setMidiConvertBusy(false);
      pendingMidiImport = null;
      pendingMidiSettings = null;
      const saved = Math.max(0, Number(normalized.saved) || 0);
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
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01
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
      const allScheduledNotesMuted = areAllScheduledNotesMuted(scheduleCache.notes);
      if (preparedNotes.length === 0 && !allScheduledNotesMuted) throw new Error("소리 나는 음표가 없습니다. V0만 있거나 선택한 음색에서 맞는 음역을 찾지 못했습니다.");

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
      minLeadTime: 0.018
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
    if (restTrimDialog?.showModal) {
      restTrimDialog.showModal();
      return;
    }
    const answer = prompt("삭제할 쉼표 길이를 입력해 주세요.\nall = 모든 쉼표\n4 = 4분음표 이하\n8 = 8분음표 이하\n16 = 16분음표 이하\n32 = 32분음표 이하\n64 = 64분음표 이하", "32");
    if (answer == null) return;
    applyRestTrim(answer);
  }

  function applyRestTrimFromDialog() {
    const value = restTrimLimit?.value || "32";
    restTrimDialog?.close();
    applyRestTrim(value);
  }

  function applyRestTrim(limitValue) {
    const threshold = parseRestTrimLimit(limitValue);
    if (!threshold) return;
    const wasPlaying = isPlaying;
    stopPlayback(false);

    const activePanel = panels.find(p => !p.hidden) || panels[0];
    const isMainPanel = activePanel.dataset.panel === "main";
    const partMatch = /^part(\d+)$/.exec(activePanel.dataset.panel || "");
    const targetPartIndex = isMainPanel ? null : (partMatch ? Number(partMatch[1]) : null);

    try {
      const result = trimShortRestsMml(normalizeMmlForDisplay(mainMml.value), {
        partCount: 6,
        targetPartIndex,
        all: threshold.all,
        denom: threshold.denom
      });

      if (result.removed <= 0) {
        showDialog("쉼표 삭제", "삭제할 수 있는 쉼표가 없습니다.\n채널 시작 부분의 쉼표나 앞에 음표가 없는 쉼표는 유지됩니다.");
      } else {
        setMainMml(result.mml);
        rebuildSchedulePreviewSilently();
        const label = threshold.all ? "모든 쉼표" : `${threshold.denom}분음표 이하`;
        const saved = Math.max(0, Number(result.saved) || 0);
        flashButton(restTrimBtn, "삭제 완료");
        showDialog(
          "쉼표 삭제",
          `${label} 길이로 쉼표 ${result.removed.toLocaleString("ko-KR")}개를 정리했습니다.\n` +
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
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: duration + 0.05,
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012
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
    const invalid = findInvalidPartChars(part);
    let out = "";
    for (let i = 0; i < part.length; i++) {
      const ch = escapeHtml(part[i]);
      out += invalid.has(i) ? `<span class="invalid-code">${ch}</span>` : ch;
    }
    return out;
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
