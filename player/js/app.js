(() => {
  "use strict";

  const DEFAULT_SF2_URL = "assets/Roland_SC-55.sf2";
  const DEFAULT_SF2_EMBEDDED_B64 = () => window.MABINOGI_DEFAULT_SF2_B64 || "";
  const PART_LABELS = ["멜로디", "화음1", "화음2", "화음3", "화음4", "화음5"];
  const PREF_PREFIX = "mobibard.player.";
  const DEFAULT_PART_PRESET_KEY = "0:0";
  const PART_PREVIEW_MELODY_INTERVALS = [0, 2, 4, 7, 9, 7, 4, 0];
  const PART_PREVIEW_DRUM_NOTES = [36, 42, 38, 42, 36, 46, 38, 42];


  const { shortError, base64ToUint8Array, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview } = window.MabiMidi;
  const { parseMabinogiMml, splitMmlParts, buildSchedule, composeMml } = window.MabiMml;
  const { optimizeMml, optimizePart, trimShortRestsMml, trimLeadingSilenceMml, addLeadingSilenceMml, splitMmlPages } = window.MabiOptimizer;
  const { parseSoundFont, prepareNotes, schedulePreparedNotes } = window.MabiSf2;

  const $ = (id) => document.getElementById(id);
  const midiFile = $("midiFile");
  const midiLoadBtn = $("midiLoadBtn");
  const soundSource = $("soundSource");
  const sf2File = $("sf2File");
  const soundName = $("soundName");
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
  const themeToggleBtn = $("themeToggleBtn");
  const charCount = $("charCount");
  const partSoundBtn = $("partSoundBtn");
  const partSoundDialog = $("partSoundDialog");
  const partSoundRows = $("partSoundRows");
  const partSoundReset = $("partSoundReset");
  const partSoundCancel = $("partSoundCancel");
  const partSoundApply = $("partSoundApply");
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
  let splitPreviewButton = null;
  let splitPreviewButtonText = "";
  let partPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
  let draftPartPresetKeys = null;

  init();

  function init() {
    loadThemePref();
    loadPlaybackPrefs();
    loadPartSoundPrefs();
    midiLoadBtn.addEventListener("click", () => { midiFile.value = ""; midiFile.click(); });
    midiFile.addEventListener("change", () => void loadSourceFile());
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
    partSoundReset?.addEventListener("click", () => resetPartSoundDraft());
    partSoundCancel?.addEventListener("click", () => partSoundDialog?.close());
    partSoundApply?.addEventListener("click", () => applyPartSoundDialog());
    leadingSilenceSeconds?.addEventListener("change", normalizeLeadingSilenceSecondsInput);
    leadingSilenceSeconds?.addEventListener("blur", normalizeLeadingSilenceSecondsInput);
    midiExportCount?.addEventListener("change", updateMidiRoleControls);
    midiFullPreviewBtn?.addEventListener("click", () => void toggleMidiFullPreview());
    midiConvertApply?.addEventListener("click", () => applyMidiConvertDialog());
    midiConvertCancel?.addEventListener("click", () => { stopMidiPreview(); pendingMidiImport = null; pendingMidiSettings = null; midiConvertDialog?.close(); });
    midiConvertDialog?.addEventListener("close", () => stopMidiPreview());
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


  function loadPartSoundPrefs() {
    const saved = readPref("partPresetKeys");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      const next = Array.from({ length: 6 }, (_, i) => sanitizePresetKey(arr[i] || DEFAULT_PART_PRESET_KEY));
      partPresetKeys = next;
    } catch (_) {
      partPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
    }
  }

  function savePartSoundPrefs() {
    writePref("partPresetKeys", JSON.stringify(partPresetKeys));
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
    try {
      stopMidiPreview();
      stopPlayback(false);
      if (ext === "mid" || ext === "midi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const overview = analyzeMidi(bytes, name);
        openMidiConvertDialog({ bytes, name, overview });
      } else if (ext === "txt" || ext === "md") {
        const text = await file.text();
        const loaded = readMmlTextFile(text);
        try {
          const trimmed = trimLeadingSilenceMml(loaded);
          const optimized = optimizeMml(trimmed.mml);
          setMainMml(optimized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showDialog("MML 최적화 생략", `파일은 불러왔지만 문법 오류 때문에 자동 최적화는 생략했습니다.\n\n${shortError(optErr)}`);
        }
      } else {
        throw new Error("지원하지 않는 파일입니다. mid, midi, txt, md 파일을 선택해 주세요.");
      }
    } catch (err) {
      showDialog("파일 불러오기 실패", shortError(err));
    }
  }


  function readMmlTextFile(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!/^MML\s*@/i.test(raw)) {
      throw new Error("TXT/MD 파일은 MML@...; 형식이어야 합니다.");
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
      midiConvertSummary.textContent = `${importData.name || "MID"} · 노트 ${formatCount(overview.noteCount)}개 · 악기 ${formatCount(groups.length)}개 · 일반 ${formatCount(normalGroups.length)}개 / 비트 ${formatCount(beatGroups.length)}개 · PPQ ${overview.ppq}`;
    }
    if (midiBeatNotice) {
      midiBeatNotice.hidden = beatGroups.length > 0;
      midiBeatNotice.textContent = beatGroups.length ? "" : "이 MIDI에는 비트 그룹 악기가 없습니다.";
    }
    if (midiExportCount) midiExportCount.value = "3";
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
      return {
        role,
        overlapMerge: true,
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
      row.innerHTML = `
        <button class="midi-channel-select" type="button" data-midi-channel-select="${i}" aria-label="${PART_LABELS[i]} 악기 선택">
          <span class="midi-export-label">${PART_LABELS[i]}</span>
          <span class="midi-export-summary">${escapeHtml(summarizeMidiChannelInstruments(i))}</span>
        </button>
        <select data-role-index="${i}" aria-label="${PART_LABELS[i]} 역할">
          ${selectOptions}
        </select>
        <label class="merge-check"><input type="checkbox" data-merge-index="${i}" ${setting.overlapMerge ? "checked" : ""} /> 겹침 병합</label>
      `;
      row.querySelector("button")?.addEventListener("click", () => {
        pendingMidiSettings.activeIndex = i;
        renderMidiRoleList();
        renderActiveMidiInstrumentList();
        updateMidiRoleControls();
      });
      row.querySelector("select")?.addEventListener("change", (ev) => {
        const role = String(ev.target.value || "auto");
        updateMidiChannelRole(i, role);
      });
      row.querySelector('input[type="checkbox"]')?.addEventListener("change", (ev) => {
        pendingMidiSettings.channels[i].overlapMerge = Boolean(ev.target.checked);
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
      midiFullPreviewBtn.textContent = midiFullPreviewActive ? "MID 정지" : "MID 듣기";
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

  function collectMidiConvertOptions() {
    if (!pendingMidiSettings) throw new Error("MIDI 변환 설정을 찾지 못했습니다.");
    const partCount = clampInt(Number(midiExportCount?.value || pendingMidiSettings.partCount || 3), 1, 6);
    const exportChannels = [];
    for (let i = 0; i < partCount; i++) {
      const setting = pendingMidiSettings.channels[i];
      const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
      const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
      if (!selected.length) throw new Error(`${PART_LABELS[i]} 채널에 포함할 악기를 하나 이상 선택해 주세요.`);
      exportChannels.push({
        role: setting.role || "auto",
        overlapMerge: Boolean(setting.overlapMerge),
        selectedInstrumentGroups: selected
      });
    }
    return {
      partCount,
      roles: exportChannels.map(ch => ch.role),
      exportChannels
    };
  }

  function applyMidiConvertDialog() {
    if (!pendingMidiImport) return;
    try {
      const options = collectMidiConvertOptions();
      stopPlayback(false);
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const trimmed = trimLeadingSilenceMml(result.mml);
      const optimized = optimizeMml(trimmed.mml);
      setMainMml(optimized.mml);
      stopMidiPreview();
      midiConvertDialog?.close();
      pendingMidiImport = null;
      pendingMidiSettings = null;
      const saved = Math.max(0, Number(optimized.saved) || 0);
      showDialog(
        "MIDI 변환 완료",
        result.message + (saved ? `\n\n최적화 절약: ${formatCount(saved)} 자` : "")
      );
    } catch (err) {
      showDialog("MIDI 변환 실패", shortError(err));
    }
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
      draftPartPresetKeys = partPresetKeys.slice(0, 6).map(k => sanitizePresetKey(k));
      while (draftPartPresetKeys.length < 6) draftPartPresetKeys.push(DEFAULT_PART_PRESET_KEY);
      renderPartSoundRows();
      if (partSoundDialog?.showModal) partSoundDialog.showModal();
      else showDialog("채널 음색 설정", "이 브라우저에서는 설정 창을 열 수 없습니다.");
    } catch (err) {
      showDialog("채널 음색 설정 실패", shortError(err));
    }
  }

  function resetPartSoundDraft() {
    draftPartPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
    renderPartSoundRows();
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
    if (!Array.isArray(draftPartPresetKeys)) draftPartPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
    partPresetKeys = Array.from({ length: 6 }, (_, i) => sanitizePresetKey(draftPartPresetKeys[i] || DEFAULT_PART_PRESET_KEY));
    savePartSoundPrefs();
    rebuildSchedulePreviewSilently();
    partSoundDialog?.close();
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
        if (!draftPartPresetKeys) draftPartPresetKeys = partPresetKeys.slice(0, 6);
        draftPartPresetKeys[i] = sanitizePresetKey(select.value);
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
      if (preparedNotes.length === 0) throw new Error("소리 나는 음표가 없습니다. V0만 있거나 선택한 음색에서 맞는 음역을 찾지 못했습니다.");

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

  function resetSchedule() {
    currentOffset = 0;
    scheduleCache = null;
    preparedNotes = [];
    scheduledNoteIds = new Set();
    updateProgressUi(0, 0);
    updateTempoMarkers([], 0);
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

  function formatBeatCount(value) {
    const n = Number(value) || 0;
    if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n).toLocaleString("ko-KR");
    return n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
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
    if (raw === "all" || raw === "전체" || raw === "모두") return { all: true, units: Infinity, denom: null };
    const denom = Number(raw);
    if (![4, 8, 16, 32, 64].includes(denom)) {
      showDialog("쉼표 삭제", "삭제 길이는 all, 4, 8, 16, 32, 64 중 하나를 선택해 주세요.");
      return null;
    }
    return { all: false, units: durationUnits(denom, 0), denom };
  }

  function removeShortRestsFromPart(partText, threshold) {
    const tokens = tokenizeMmlPartForEdit(normalizePartText(partText));
    let lastNote = null;
    let canAbsorb = false;
    let removed = 0;
    let removedUnits = 0;

    for (const token of tokens) {
      if (token.type === "note") {
        lastNote = token;
        canAbsorb = Boolean(token.extendBase) && Number.isInteger(token.durUnits);
        continue;
      }

      if (token.type === "rest") {
        const restUnits = token.durUnits;
        const canDelete = Number.isFinite(restUnits) && restUnits <= threshold.units + 1e-9;
        if (canDelete && lastNote && canAbsorb && Number.isInteger(lastNote.durUnits + restUnits)) {
          lastNote.durUnits += restUnits;
          lastNote.raw = renderNoteDuration(lastNote.extendBase, lastNote.durUnits, lastNote.defaultUnits);
          token.omit = true;
          removed++;
          removedUnits += restUnits;
          continue;
        }
        canAbsorb = false;
        continue;
      }

      if (token.type === "space") continue;
      canAbsorb = false;
    }

    return {
      text: tokens.filter(t => !t.omit).map(t => t.raw).join(""),
      removed,
      removedUnits
    };
  }

  function tokenizeMmlPartForEdit(partText) {
    const s = String(partText || "");
    const tokens = [];
    let i = 0;
    let octave = 4;
    let defaultUnits = durationUnits(4, 0);

    const readNumber = () => {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      return i > start ? { text: s.slice(start, i), value: Number(s.slice(start, i)), start, end: i } : null;
    };
    const readDotsCount = () => {
      let count = 0;
      while (s[i] === ".") { count++; i++; }
      return count;
    };
    const readLengthUnits = () => {
      const n = readNumber();
      const dots = readDotsCount();
      if (!n) return durationUnitsFromBase(defaultUnits, dots);
      if (![1, 2, 4, 8, 16, 32, 64].includes(n.value)) return NaN;
      return durationUnits(n.value, dots);
    };
    const pushRaw = (type, start, extra = {}) => tokens.push({ type, raw: s.slice(start, i), ...extra });

    while (i < s.length) {
      const start = i;
      const ch = s[i];
      const lower = ch.toLowerCase();

      if (/\s/.test(ch)) {
        while (i < s.length && /\s/.test(s[i])) i++;
        pushRaw("space", start);
      } else if ("cdefgab".includes(lower)) {
        i++;
        let semitone = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 }[lower];
        if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
        else if (s[i] === "-") { semitone--; i++; }
        const baseEnd = i;
        const units = readLengthUnits();
        const midi = (octave + 1) * 12 + semitone;
        pushRaw("note", start, {
          midi,
          durUnits: units,
          defaultUnits,
          extendBase: s.slice(start, baseEnd)
        });
      } else if (lower === "n") {
        i++;
        const n = readNumber();
        const midi = n ? Math.max(0, Math.min(127, n.value)) : null;
        const dots = readDotsCount();
        const units = durationUnitsFromBase(defaultUnits, dots);
        const base = midi == null ? null : noteBaseForMidiInOctave(midi, octave);
        pushRaw("note", start, {
          midi,
          durUnits: units,
          defaultUnits,
          extendBase: base
        });
      } else if (lower === "r") {
        i++;
        const units = readLengthUnits();
        pushRaw("rest", start, { durUnits: units });
      } else if (lower === "l") {
        i++;
        const n = readNumber();
        const dots = readDotsCount();
        if (n && [1, 2, 4, 8, 16, 32, 64].includes(n.value)) defaultUnits = durationUnits(n.value, dots);
        pushRaw("command", start);
      } else if (lower === "o") {
        i++;
        const n = readNumber();
        if (n && n.value >= 0 && n.value <= 9) octave = n.value;
        pushRaw("command", start);
      } else if (ch === ">") {
        i++;
        octave++;
        pushRaw("command", start);
      } else if (ch === "<") {
        i++;
        octave--;
        pushRaw("command", start);
      } else if (lower === "t" || lower === "v") {
        i++;
        readNumber();
        pushRaw("command", start);
      } else if (ch === "&") {
        i++;
        pushRaw("command", start);
      } else {
        i++;
        pushRaw("other", start);
      }
    }
    return tokens;
  }

  function durationUnits(denom, dots = 0) {
    let total = 256 / denom;
    let add = total / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function durationUnitsFromBase(baseUnits, dots = 0) {
    let total = baseUnits;
    let add = baseUnits / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function noteBaseForMidiInOctave(midi, octave) {
    const semitone = midi - (octave + 1) * 12;
    const names = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];
    return semitone >= 0 && semitone < names.length ? names[semitone] : null;
  }

  function renderNoteDuration(base, totalUnits, defaultUnits) {
    const units = Math.round(totalUnits);
    if (!base || units <= 0 || !Number.isInteger(units)) return base || "";
    const candidates = buildDurationCandidates(defaultUnits);
    const dp = Array(units + 1).fill(null);
    dp[0] = "";

    for (let u = 1; u <= units; u++) {
      let best = null;
      for (const cand of candidates) {
        if (cand.units > u || dp[u - cand.units] == null) continue;
        const piece = `${base}${cand.suffix}`;
        const text = u === cand.units ? piece : `${dp[u - cand.units]}&${piece}`;
        if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
      }
      dp[u] = best;
    }
    return dp[units] || `${base}${durationSuffixFromUnits(units)}`;
  }

  function buildDurationCandidates(defaultUnits) {
    const map = new Map();
    const add = (units, suffix) => {
      if (!Number.isInteger(units) || units <= 0) return;
      const old = map.get(units);
      if (old == null || suffix.length < old.length) map.set(units, suffix);
    };
    add(Math.round(defaultUnits), "");
    add(Math.round(defaultUnits * 1.5), ".");
    for (const denom of [1, 2, 4, 8, 16, 32, 64]) {
      add(durationUnits(denom, 0), String(denom));
      add(durationUnits(denom, 1), `${denom}.`);
    }
    return Array.from(map, ([units, suffix]) => ({ units, suffix })).sort((a, b) => b.units - a.units || a.suffix.length - b.suffix.length);
  }

  function durationSuffixFromUnits(units) {
    for (const denom of [1, 2, 4, 8, 16, 32, 64]) {
      if (durationUnits(denom, 0) === units) return String(denom);
      if (durationUnits(denom, 1) === units) return `${denom}.`;
    }
    return "";
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
        pasted = trimLeadingSilenceMml(text).mml;
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
    rebuildSchedulePreviewSilently();
    flashButton(pasteBtn, "붙여넣기 완료");
  }

  async function copyVisibleMml() {
    const activePanel = panels.find(p => !p.hidden) || panels[0];
    const textarea = activePanel.querySelector("textarea");
    const isMainPanel = activePanel.dataset.panel === "main";
    let text;
    try {
      text = isMainPanel
        ? normalizeMmlForCopy(optimizeMml(textarea?.value || "").mml)
        : optimizePart(normalizePartText(textarea?.value || ""), { includeTempo: activePanel.dataset.panel === "part0" }).part;
    } catch (err) {
      showDialog("복사 실패", `MML 최적화 중 문제가 발생했습니다.\n\n${shortError(err)}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, "복사 완료");
      showCopySummary(activePanel, text);
    } catch {
      textarea?.select();
      try {
        document.execCommand("copy");
        flashButton(copyBtn, "복사 완료");
        showCopySummary(activePanel, text);
      } catch (err) {
        showDialog("복사 실패", "자동 복사가 막혔습니다. MML을 선택한 뒤 Ctrl+C로 복사해 주세요.");
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
      exportData = getVisibleMmlForExport();
    } catch (err) {
      showDialog("저장 실패", `MML 최적화 중 문제가 발생했습니다.\n\n${shortError(err)}`);
      return;
    }
    const { text, isMainPanel, panelName } = exportData;
    if (!text.trim()) {
      showDialog("저장 실패", "저장할 MML이 비어 있습니다.");
      return;
    }

    const defaultName = isMainPanel ? "mabinogi-mml.md" : `mabinogi-${panelName || "part"}.md`;
    const blob = new Blob([text + "\n"], { type: "text/markdown;charset=utf-8" });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: "Markdown MML 파일",
            accept: { "text/markdown": [".md"] }
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
    if (!/\.md$/i.test(fileName)) fileName += ".md";
    downloadBlob(blob, fileName);
    flashButton(saveBtn, "저장 완료");
  }

  function getVisibleMmlForExport() {
    const activePanel = panels.find(p => !p.hidden) || panels[0];
    const textarea = activePanel.querySelector("textarea");
    const isMainPanel = activePanel.dataset.panel === "main";
    let text;
    if (isMainPanel) {
      text = normalizeMmlForCopy(optimizeMml(textarea?.value || "").mml);
    } else {
      text = optimizePart(normalizePartText(textarea?.value || ""), { includeTempo: activePanel.dataset.panel === "part0" }).part;
    }
    return { text, isMainPanel, panelName: activePanel.dataset.panel || "part" };
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
