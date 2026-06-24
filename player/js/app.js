(() => {
  "use strict";

  const DEFAULT_SF2_URL = "assets/Roland_SC-55.sf2";
  const DEFAULT_SF2_EMBEDDED_B64 = () => window.MABINOGI_DEFAULT_SF2_B64 || "";
  const PART_LABELS = ["멜로디", "화음1", "화음2", "화음3", "화음4", "화음5"];

  const { shortError, base64ToUint8Array, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml } = window.MabiMidi;
  const { parseMabinogiMml, splitMmlParts, buildSchedule, composeMml } = window.MabiMml;
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
  const volumeSlider = $("volumeSlider");
  const volumeValue = $("volumeValue");
  const progressSlider = $("progressSlider");
  const tempoMarkerLayer = $("tempoMarkerLayer");
  const playInfo = $("playInfo");
  const copyBtn = $("copyBtn");
  const pasteBtn = $("pasteBtn");
  const saveBtn = $("saveBtn");
  const discordBtn = $("discordBtn");
  const charCount = $("charCount");
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

  init();

  function init() {
    midiLoadBtn.addEventListener("click", () => { midiFile.value = ""; midiFile.click(); });
    midiFile.addEventListener("change", () => void loadSourceFile());
    soundSource.addEventListener("change", () => handleSoundSourceChange());
    sf2File.addEventListener("change", () => { if (sf2File.files?.[0]) void loadUserSf2(); resetSoundActionMenu(); });
    playToggleBtn.addEventListener("click", () => { isPlaying ? stopPlayback(false) : void playFromCurrent(); });
    rewindBtn.addEventListener("click", () => void rewindToStart());
    volumeSlider.addEventListener("input", applyOutputVolume);
    progressSlider.addEventListener("pointerdown", () => { isSeeking = true; });
    progressSlider.addEventListener("pointerup", () => { isSeeking = false; handleSeekInput(true); });
    progressSlider.addEventListener("touchend", () => { isSeeking = false; handleSeekInput(true); }, { passive: true });
    progressSlider.addEventListener("input", () => handleSeekInput(false));
    progressSlider.addEventListener("change", () => handleSeekInput(true));
    copyBtn.addEventListener("click", () => void copyVisibleMml());
    pasteBtn.addEventListener("click", () => void pasteVisibleMml());
    saveBtn.addEventListener("click", () => void saveVisibleMml());
    discordBtn?.addEventListener("click", openDiscord);
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
    applyOutputVolume();
    resetSoundActionMenu();
    updateCharCount();
    rebuildSchedulePreviewSilently();
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
      stopPlayback(false);
      if (ext === "mid" || ext === "midi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = midiToMml(bytes, name);
        setMainMml(result.mml);
      } else if (ext === "txt" || ext === "md") {
        const text = await file.text();
        setMainMml(readMmlTextFile(text));
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

  async function playFromCurrent() {
    try {
      stopPlayback(false);
      await loadDefaultSf2IfNeeded();
      scheduleCache = createScheduleFromEditor();
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
      if (scheduleCache.notes.length === 0) throw new Error("재생할 음표가 없습니다. MML 내용을 확인해 주세요.");
      if (currentOffset >= scheduleCache.duration - 0.05) currentOffset = 0;
      const ctx = await ensureAudioContext();
      const preset = soundFont.findPreset(0) || soundFont.presets[0];
      if (!preset) throw new Error("SF2 안에서 사용할 수 있는 프리셋을 찾지 못했습니다.");
      preparedNotes = prepareNotes(ctx, soundFont, preset, scheduleCache.notes);
      if (preparedNotes.length === 0) throw new Error("소리 나는 음표가 없습니다. V0만 있거나 SF2에서 맞는 음색을 찾지 못했습니다.");

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
    const windowEnd = Math.min(duration, nowOffset + SCHEDULE_AHEAD_SEC);
    schedulePreparedNotes(audioCtx, preparedNotes, {
      baseTime: playContextStart,
      fromSec: playOffsetStart,
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
    const elapsed = Math.max(0, audioCtx.currentTime - playContextStart);
    const duration = scheduleCache?.duration || Infinity;
    return Math.max(0, Math.min(duration, playOffsetStart + elapsed));
  }

  function updateProgressUi(current, duration) {
    const d = Math.max(0, Number(duration) || 0);
    const c = Math.max(0, Math.min(d, Number(current) || 0));
    progressSlider.max = d > 0 ? String(d) : "0";
    progressSlider.step = "0.01";
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

  function applyOutputVolume() {
    const percent = clampInt(Number(volumeSlider.value || 100), 0, 100);
    volumeSlider.value = String(percent);
    volumeValue.textContent = `${percent}%`;
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
      setMainMml(text);
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
    const text = isMainPanel ? normalizeMmlForCopy(textarea?.value || "") : normalizePartText(textarea?.value || "");
    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, "복사 완료");
    } catch {
      textarea?.select();
      try {
        document.execCommand("copy");
        flashButton(copyBtn, "복사 완료");
      } catch (err) {
        showDialog("복사 실패", "자동 복사가 막혔습니다. MML을 선택한 뒤 Ctrl+C로 복사해 주세요.");
      }
    }
  }

  async function saveVisibleMml() {
    const { text, isMainPanel, panelName } = getVisibleMmlForExport();
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
    const text = isMainPanel ? normalizeMmlForCopy(textarea?.value || "") : normalizePartText(textarea?.value || "");
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


  function openDiscord() {
    const guildId = "1518552079499792434";
    const appUrl = `discord://-/channels/${guildId}`;
    const webUrl = `https://discord.com/channels/${guildId}`;
    let openedApp = false;
    const onVisibility = () => {
      if (document.hidden) openedApp = true;
    };
    document.addEventListener("visibilitychange", onVisibility, { once: true });
    try { window.location.href = appUrl; } catch (_) {}
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (!openedApp) window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 850);
  }

  function showDialog(title, message) {
    alert(`${title}\n\n${message}`);
  }
})();
