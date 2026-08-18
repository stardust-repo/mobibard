(() => {
  "use strict";

  const LANGUAGE_KEY = "mobibard.player.language";
  const THEME_KEY = "mobibard.player.theme";
  const MAX_SPLIT_CHARS = 2400;
  const SUPPORTED_LANGUAGES = ["ko", "ja", "en", "zh-CN", "zh-TW"];
  const LANGUAGE_QUERY_KEYS = ["lang", "language", "locale"];
  const PLAY_LOOKAHEAD_SEC = 0.7;
  const PLAY_SCHEDULER_MS = 120;
  const FIXED_PLAYBACK_BANK = 0;
  const FIXED_PLAYBACK_PROGRAM = 0;
  const GENERATED_MML_LEADING_SILENCE_SECONDS = 2;

  const LOCALE_FILES = Object.freeze({ ko: "ko.js", ja: "ja.js", en: "en.js", "zh-CN": "zh-CN.js", "zh-TW": "zh-TW.js" });
  const LOCALE_VERSION = "5.0.0";
  const LOCALE_REVISION = "20260818-211321";
  const localeCache = new Map();
  const localeLoadPromises = new Map();

  const $ = id => document.getElementById(id);
  const els = {
    fileInput: $("midiFileInput"),
    fileButton: $("fileButton"),
    dropZone: $("dropZone"),
    dropHint: $("dropHint"),
    fileName: $("fileName"),
    quantizeLabel: $("quantizeLabel"),
    quantizeOptions: $("quantizeOptions"),
    restLabel: $("restLabel"),
    restOptions: $("restOptions"),
    allRestButton: $("allRestButton"),
    status: $("status"),
    playbackControls: $("playbackControls"),
    playButton: $("playButton"),
    playbackSlider: $("playbackSlider"),
    results: $("results"),
    resultsTitle: $("resultsTitle"),
    resultsSummary: $("resultsSummary"),
    splitResults: $("splitResults"),
    fullScoreTitle: $("fullScoreTitle"),
    fullScoreDetail: $("fullScoreDetail"),
    copyAllButton: $("copyAllButton"),
    copyButtons: $("copyButtons"),
    pageTitleText: $("pageTitleText"),
    eyebrow: $("eyebrow"),
    subtitle: $("subtitle"),
    brandName: $("brandName"),
    midiExtractLink: $("midiExtractLink"),
    fullEditorLink: $("fullEditorLink"),
    discordLink: $("discordLink"),
    settingsControl: $("settingsControl"),
    settingsButton: $("settingsButton"),
    settingsMenu: $("settingsMenu"),
    languageSelect: $("languageSelect"),
    languageLabel: $("languageLabel"),
    themeLabel: $("themeLabel"),
    themeButton: $("themeButton"),
    themeButtonText: $("themeButtonText")
  };

  function openFilePickerInput(input) {
    if (!input || input.disabled) return;
    const groupedPicker = window.MabiSupportedFilesUi?.openFileInput;
    if (typeof groupedPicker === "function") {
      void groupedPicker(input);
      return;
    }
    input.click();
  }

  let language = resolveInitialLanguage();
  let activeLocale = null;
  let selectedFile = null;
  let selectedBytes = null;
  let selectedRest = "32";
  let selectedQuantize = 64;
  let currentMml = "";
  let resultPages = [];
  let conversionSerial = 0;
  let fileSelectionSerial = 0;
  let conversionTimer = 0;
  let analyticsTrackedSelectionSerial = -1;

  let audioCtx = null;
  let masterGain = null;
  let playbackSoundFont = null;
  let fixedPlaybackPreset = null;
  let playbackSoundFontPromise = null;
  let preparedPlaybackNotes = null;
  let playbackSchedule = null;
  let playbackPlaying = false;
  let playbackOffset = 0;
  let playContextStart = 0;
  let playOffsetStart = 0;
  let schedulerTimer = 0;
  let progressRaf = 0;
  let activeSampleSources = [];
  let scheduledPlaybackIds = new Set();
  let seekWasPlaying = false;
  let isSeeking = false;

  function readStorage(key) {
    try { return localStorage.getItem(key) || ""; } catch (_) { return ""; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function normalizeLanguage(value) {
    const raw = String(value || "").trim().replace(/_/g, "-");
    const lower = raw.toLowerCase();
    if (lower === "ko" || lower.startsWith("ko-")) return "ko";
    if (lower === "ja" || lower.startsWith("ja-")) return "ja";
    if (lower === "en" || lower.startsWith("en-")) return "en";
    if (lower === "zh-cn" || lower === "zh-sg" || lower === "zh-hans" || lower.startsWith("zh-hans-")) return "zh-CN";
    if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant" || lower.startsWith("zh-hant-")) return "zh-TW";
    if (lower === "zh" || lower.startsWith("zh-")) return "zh-CN";
    return "";
  }

  function readLanguageQuery() {
    try {
      const params = new URL(window.location.href).searchParams;
      for (const key of LANGUAGE_QUERY_KEYS) {
        if (!params.has(key)) continue;
        const raw = String(params.get(key) || "").trim();
        if (!raw || /^(?:auto|browser|system)$/i.test(raw)) return { mode: "auto", language: "" };
        const normalized = normalizeLanguage(raw);
        return { mode: "fixed", language: SUPPORTED_LANGUAGES.includes(normalized) ? normalized : "en" };
      }
    } catch (_) {}
    return { mode: "auto", language: "" };
  }

  function clearLanguageQuery() {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of LANGUAGE_QUERY_KEYS) {
        if (!url.searchParams.has(key)) continue;
        url.searchParams.delete(key);
        changed = true;
      }
      if (changed && window.history?.replaceState) window.history.replaceState(window.history.state, "", url.href);
    } catch (_) {}
  }

  function resolveInitialLanguage() {
    const query = readLanguageQuery();
    if (query.mode === "fixed") return query.language;
    const cached = normalizeLanguage(readStorage(LANGUAGE_KEY));
    if (cached && SUPPORTED_LANGUAGES.includes(cached)) return cached;
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (const candidate of candidates) {
      const browser = normalizeLanguage(candidate);
      if (SUPPORTED_LANGUAGES.includes(browser)) return browser;
    }
    return "en";
  }

  function validateLocaleData(data, code) {
    if (!data || typeof data !== "object" || !data.strings || typeof data.strings !== "object") {
      throw new Error(`Invalid simple locale data: ${code}`);
    }
    return { ...data, code, strings: data.strings };
  }

  function buildLocaleUrl(code) {
    const file = LOCALE_FILES[code] || LOCALE_FILES.en;
    const url = new URL(`locale/${file}`, document.baseURI);
    if (url.protocol !== "file:") {
      url.searchParams.set("v", LOCALE_VERSION);
      url.searchParams.set("rev", LOCALE_REVISION);
    }
    return url.href;
  }

  async function loadLocale(code) {
    const normalized = SUPPORTED_LANGUAGES.includes(code) ? code : "en";
    if (localeCache.has(normalized)) return localeCache.get(normalized);
    if (localeLoadPromises.has(normalized)) return localeLoadPromises.get(normalized);

    const bundled = window.__MOBIBARD_SIMPLE_LOCALES__?.[normalized];
    if (bundled) {
      const locale = validateLocaleData(bundled, normalized);
      localeCache.set(normalized, locale);
      return locale;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.charset = "utf-8";
      script.dataset.mobibardSimpleLocale = normalized;
      script.src = buildLocaleUrl(normalized);
      script.onload = () => {
        try {
          const data = window.__MOBIBARD_SIMPLE_LOCALES__?.[normalized];
          const locale = validateLocaleData(data, normalized);
          localeCache.set(normalized, locale);
          resolve(locale);
        } catch (error) {
          reject(error);
        } finally {
          script.remove();
        }
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`Simple locale load failed: ${normalized}`));
      };
      document.head.appendChild(script);
    });

    localeLoadPromises.set(normalized, promise);
    try { return await promise; }
    finally { localeLoadPromises.delete(normalized); }
  }

  function t(key, values = []) {
    let text = activeLocale?.strings?.[key] ?? String(key);
    values.forEach((value, index) => { text = text.replaceAll(`{${index}}`, String(value)); });
    return text;
  }

  function engineText(key, values = []) {
    const map = {
      "midi.err_no_notes": "engineNoNotes",
      "midi.err_selected_no_notes": "engineSelectedNoNotes",
      "midi.err_smpte": "engineSmpte",
      "midi.err_header": "engineHeader",
      "midi.err_header_length": "engineHeader",
      "midi.err_track_header": "engineHeader",
      "rest.err_limit": "restError",
      "xml.err_empty": "xmlEmpty",
      "xml.err_score_missing": "xmlInvalid",
      "xml.err_zip_empty": "xmlInvalid",
      "xml.err_body_missing": "xmlInvalid",
      "xml.err_central_dir": "xmlInvalid",
      "xml.err_compression": "xmlInvalid",
      "xml.err_decompress_unsupported": "xmlDecompress",
      "xml.err_notes_missing": "xmlNoNotes",
      "xml.err_parse": "xmlInvalid",
      "xml.err_parts_missing": "xmlInvalid",
      "xml.err_score_type": "xmlInvalid",
      "xml.parse_error": "xmlInvalid"
    };
    const uiKey = map[key];
    if (uiKey) return t(uiKey, values);
    if (key === "ui.no_notes") return t("engineNoNotes");
    if (key === "midi.program_number") return `Program ${values[0] ?? ""}`;
    if (key === "midi.part_default") return `Part ${values[0] ?? ""}`;
    if (key === "ui.beat") return language === "ko" ? "리듬" : (language === "ja" ? "リズム" : "Beat");
    if (key === "snd.no_inst") return language === "ko" ? "악기 없음" : "No instrument";
    if (key === "midi.convert_result_brief" || key === "midi.warn_pitch_skipped" || key === "midi.warn_missing_note_off") return "";
    if (key === "midi.note_count") return String(values[0] ?? "");
    if (key.startsWith("split.warn_")) return "";
    return String(key);
  }

  window.MobibardI18n = { t: engineText, translate: engineText };

  async function applyLanguage(nextLanguage, persist = true, source = "app") {
    if (source === "user") clearLanguageQuery();
    let resolved = SUPPORTED_LANGUAGES.includes(nextLanguage) ? nextLanguage : "en";
    let locale;
    try {
      locale = await loadLocale(resolved);
    } catch (error) {
      console.warn(error);
      resolved = "en";
      locale = await loadLocale("en");
    }
    language = resolved;
    activeLocale = locale;
    if (persist) writeStorage(LANGUAGE_KEY, language);
    document.documentElement.lang = activeLocale.htmlLang || (language === "zh-CN" ? "zh-Hans" : (language === "zh-TW" ? "zh-Hant" : language));
    document.title = t("browserTitle");
    els.pageTitleText.textContent = t("title");
    els.eyebrow.textContent = t("eyebrow");
    els.brandName.textContent = t("brand");
    els.subtitle.textContent = t("subtitle");
    els.midiExtractLink.textContent = t("extract");
    els.fullEditorLink.textContent = t("full");
    els.fullEditorLink.href = `../player/index.html?lang=${encodeURIComponent(language)}`;
    els.discordLink.setAttribute("aria-label", t("discord"));
    els.discordLink.title = t("discord");
    els.settingsButton.setAttribute("aria-label", t("settings"));
    els.settingsButton.title = t("settings");
    els.settingsMenu.setAttribute("aria-label", t("settings"));
    els.languageLabel.textContent = t("language");
    els.themeLabel.textContent = t("themeLabel");
    els.themeButtonText.textContent = t("theme");
    els.themeButton.title = t("theme");
    els.fileButton.textContent = t("choose");
    els.dropHint.textContent = t("drop");
    els.quantizeLabel.textContent = t("quantize");
    els.quantizeOptions.querySelector('[data-quantize="64"]').textContent = t("quantize64");
    els.quantizeOptions.querySelector('[data-quantize="32"]').textContent = t("quantize32");
    els.restLabel.textContent = t("rest");
    els.restOptions.querySelector('[data-rest="keep"]').textContent = t("keep");
    for (const denom of [64, 32, 16, 8, 4]) {
      els.restOptions.querySelector(`[data-rest="${denom}"]`).textContent = t(`rest${denom}`);
    }
    els.allRestButton.textContent = t("all");
    els.fullScoreTitle.textContent = t("fullScore");
    els.copyAllButton.textContent = t("copy");
    els.resultsTitle.textContent = t("split");
    els.playbackSlider.setAttribute("aria-label", t("seek"));
    els.languageSelect.value = language;
    updatePlayButton();
    if (resultPages.length) renderResults(resultPages);
  }

  function setSettingsMenuOpen(open) {
    const next = Boolean(open);
    els.settingsMenu.hidden = !next;
    els.settingsButton.setAttribute("aria-expanded", next ? "true" : "false");
  }

  function toggleSettingsMenu() {
    setSettingsMenuOpen(els.settingsMenu.hidden);
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStorage(THEME_KEY, next);
  }

  function isSupportedSourceFile(file) {
    return Boolean(file && window.MabiMusicFormats?.isSupported(file.name || "", file.type || ""));
  }

  async function normalizeSourceToMidiBytes(file, sourceBytes) {
    if (!window.MabiMusicFormats?.convertBytes) throw new Error(t("failed", ["Music format plugins are unavailable"]));
    const converted = await window.MabiMusicFormats.convertBytes(sourceBytes, file.name || "music", file.type || "");
    return converted.midiBytes;
  }

  async function selectFile(file) {
    const selectToken = ++fileSelectionSerial;
    conversionSerial++;
    if (conversionTimer) clearTimeout(conversionTimer);
    conversionTimer = 0;
    selectedFile = null;
    selectedBytes = null;
    els.fileName.hidden = true;
    clearResults();

    if (!isSupportedSourceFile(file)) {
      showStatus(t("invalidFile"));
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const sourceBytes = new Uint8Array(buffer);
      const midiBytes = await normalizeSourceToMidiBytes(file, sourceBytes);
      if (selectToken !== fileSelectionSerial) return;
      selectedFile = file;
      selectedBytes = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes || []);
      els.fileName.textContent = file.name;
      els.fileName.hidden = false;
      hideStatus();
      requestConversion();
    } catch (error) {
      if (selectToken !== fileSelectionSerial) return;
      selectedFile = null;
      selectedBytes = null;
      els.fileName.hidden = true;
      clearResults();
      showStatus(t("failed", [shortError(error)]));
    }
  }

  function selectRestOption(value, refresh = true) {
    selectedRest = String(value || "keep");
    for (const button of els.restOptions.querySelectorAll("[data-rest]")) {
      const active = button.dataset.rest === selectedRest;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    }
    if (refresh) requestConversion();
  }

  function selectQuantizeOption(value, refresh = true) {
    selectedQuantize = Number(value) === 32 ? 32 : 64;
    for (const button of els.quantizeOptions.querySelectorAll("[data-quantize]")) {
      const active = Number(button.dataset.quantize) === selectedQuantize;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    }
    if (refresh) requestConversion();
  }

  function buildSimpleConvertOptions(groupIds) {
    const ids = [...groupIds];
    return {
      partCount: 3,
      quantizeDivision: selectedQuantize,
      roles: ["high", "auto", "low"],
      selectedInstrumentGroups: ids,
      exportChannels: [
        { role: "high", overlapMergeMode: "half", overlapMerge: true, selectedInstrumentGroups: ids },
        { role: "auto", overlapMergeMode: "all", overlapMerge: true, selectedInstrumentGroups: ids },
        { role: "low", overlapMergeMode: "half", overlapMerge: true, selectedInstrumentGroups: ids }
      ]
    };
  }

  function isDrumGroup(group) {
    return Boolean(group?.isBeat || group?.isPercussion || group?.isDrumNoteGroup || Number.isInteger(group?.drumMidi));
  }

  function applyTempoSimplification(mml) {
    const simplify = window.MabiOptimizer?.simplifyTemposMml;
    if (typeof simplify !== "function") return mml;
    return simplify(mml, {
      partCount: 3,
      maxBpmDeltaExclusive: 5,
      preserveExtrema: true
    }).mml;
  }

  function applyRestRemoval(mml) {
    if (selectedRest === "keep") return mml;
    if (!window.MabiOptimizer?.trimShortRestsMml) return mml;
    const options = selectedRest === "all"
      ? { partCount: 3, all: true }
      : { partCount: 3, denom: Number(selectedRest) };
    return window.MabiOptimizer.trimShortRestsMml(mml, options).mml;
  }

  function alignGeneratedMmlStart(mml) {
    if (!window.MabiOptimizer?.addLeadingSilenceMml) {
      throw new Error("MML leading-silence optimizer is unavailable");
    }
    // Player와 동일하게 기존 공통 앞 공백을 제거한 뒤 T120 기준 2초(R1)로 다시 정렬한다.
    // 쉼표 제거를 먼저 실행해야 사용자가 선택한 제거 옵션이 최종 2초 공백을 지우지 않는다.
    return window.MabiOptimizer.addLeadingSilenceMml(mml, {
      partCount: 3,
      beats: GENERATED_MML_LEADING_SILENCE_SECONDS * 2
    }).mml;
  }

  function splitForCopy(mml) {
    if (!window.MabiOptimizer?.splitMmlPages) {
      return [{ index: 1, mml, parts: splitMmlPartsFallback(mml) }];
    }
    const split = window.MabiOptimizer.splitMmlPages(mml, {
      partCount: 3,
      maxChars: MAX_SPLIT_CHARS
    });
    return Array.isArray(split?.pages) && split.pages.length
      ? split.pages
      : [{ index: 1, mml, parts: splitMmlPartsFallback(mml) }];
  }

  function splitMmlPartsFallback(mml) {
    const match = /^\s*MML@([\s\S]*?);?\s*$/i.exec(String(mml || ""));
    if (!match) return [String(mml || ""), "", ""];
    return match[1].split(",").slice(0, 3);
  }

  function analyticsSourceType(file) {
    return window.MabiMusicFormats?.findFormat(file?.name || "", file?.type || "")?.id || "unknown";
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

  function trackSimpleFileConvertComplete(file, pages) {
    if (!file || analyticsTrackedSelectionSerial === fileSelectionSerial) return;
    const event = {
      name: "simple_file_convert_complete",
      params: {
        source_type: analyticsSourceType(file),
        file_size: analyticsFileSizeBucket(file.size),
        quantize_division: Number(selectedQuantize || 64),
        rest_mode: String(selectedRest || "keep"),
        page_count: Array.isArray(pages) ? pages.length : 0
      }
    };
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(event.name, event.params);
      } else {
        const queueKey = "__MOBIBARD_ANALYTICS_QUEUE__";
        const queue = Array.isArray(window[queueKey]) ? window[queueKey] : (window[queueKey] = []);
        queue.push(event);
        if (queue.length > 100) queue.splice(0, queue.length - 100);
      }
      analyticsTrackedSelectionSerial = fileSelectionSerial;
    } catch (_) {}
  }

  function requestConversion() {
    if (!selectedBytes || !selectedFile) return;
    const token = ++conversionSerial;
    if (conversionTimer) clearTimeout(conversionTimer);
    conversionTimer = setTimeout(() => {
      conversionTimer = 0;
      refreshConversion(token);
    }, 0);
  }

  function refreshConversion(token) {
    if (token !== conversionSerial || !selectedBytes || !selectedFile) return;
    if (!window.MabiMidi?.analyzeMidi || !window.MabiMidi?.midiToMml) {
      clearResults();
      showStatus(t("failed", ["MIDI converter is unavailable"]));
      return;
    }

    hideStatus();
    try {
      const analysis = window.MabiMidi.analyzeMidi(selectedBytes, selectedFile.name);
      const nonDrumGroups = (analysis.instrumentGroups || []).filter(group => !isDrumGroup(group) && Number(group.noteCount || 0) > 0);
      if (!nonDrumGroups.length) throw new Error(t("noMelody"));

      const options = buildSimpleConvertOptions(nonDrumGroups.map(group => group.id));
      const converted = window.MabiMidi.midiToMml(selectedBytes, selectedFile.name, options);
      // 템포 정리는 원본 템포 흐름을 기준으로 먼저 적용한 뒤 나머지 후처리를 수행한다.
      const simplifiedMml = applyTempoSimplification(converted.mml);
      const cleanedMml = applyRestRemoval(simplifiedMml);
      const alignedMml = alignGeneratedMmlStart(cleanedMml);
      if (token !== conversionSerial) return;

      currentMml = alignedMml;
      resultPages = splitForCopy(alignedMml);
      rebuildPlayback(alignedMml);
      renderResults(resultPages);
      hideStatus();
      trackSimpleFileConvertComplete(selectedFile, resultPages);
    } catch (error) {
      if (token !== conversionSerial) return;
      clearResults();
      showStatus(t("failed", [shortError(error)]));
    }
  }

  function clearResults() {
    currentMml = "";
    resultPages = [];
    els.copyButtons.innerHTML = "";
    els.results.hidden = true;
    els.resultsSummary.textContent = "";
    els.fullScoreDetail.textContent = "";
    resetPlayback();
  }

  function renderResults(pages) {
    els.copyButtons.innerHTML = "";
    els.results.hidden = false;
    const showSplitResults = Array.isArray(pages) && pages.length > 1;
    els.splitResults.hidden = !showSplitResults;
    els.fullScoreTitle.textContent = t("fullScore");
    els.copyAllButton.textContent = t("copy");
    els.copyAllButton.classList.remove("copied");
    const fullParts = splitMmlPartsFallback(currentMml);
    while (fullParts.length < 3) fullParts.push("");
    els.fullScoreDetail.textContent = t("detail", [fullParts[0].length, fullParts[1].length, fullParts[2].length]);
    els.resultsSummary.textContent = showSplitResults ? t("pages", [pages.length]) : "";
    if (!showSplitResults) return;

    for (const page of pages) {
      const parts = Array.isArray(page.parts) && page.parts.length
        ? page.parts.slice(0, 3)
        : splitMmlPartsFallback(page.mml);
      while (parts.length < 3) parts.push("");

      const row = document.createElement("div");
      row.className = "copy-item";
      const meta = document.createElement("div");
      meta.className = "copy-meta";
      const title = document.createElement("strong");
      title.className = "copy-title";
      title.textContent = t("score", [page.index || 1]);
      const detail = document.createElement("span");
      detail.className = "copy-detail";
      detail.textContent = t("detail", [parts[0].length, parts[1].length, parts[2].length]);
      meta.append(title, detail);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy-button";
      button.textContent = t("copy");
      button.addEventListener("click", () => void copyText(page.mml, button, "copy"));
      row.append(meta, button);
      els.copyButtons.appendChild(row);
    }
  }

  async function writeClipboard(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("copy failed");
    return true;
  }

  async function copyText(text, button, restoreKey) {
    try {
      await writeClipboard(text);
      button.textContent = t("copied");
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = t(restoreKey);
        button.classList.remove("copied");
      }, 1200);
    } catch (_) {
      showStatus(t("copyFailed"));
    }
  }

  function shortError(error) {
    const text = String(error?.message || error || "Unknown error");
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }

  function showStatus(message) {
    els.status.textContent = message;
    els.status.hidden = false;
  }

  function hideStatus() {
    els.status.hidden = true;
    els.status.textContent = "";
  }

  function rebuildPlayback(mml) {
    stopPlayback(false);
    playbackOffset = 0;
    playbackSchedule = null;
    preparedPlaybackNotes = null;
    els.playbackControls.hidden = true;
    els.playButton.disabled = true;
    els.playbackSlider.disabled = true;
    els.playbackSlider.min = "0";
    els.playbackSlider.max = "0";
    els.playbackSlider.value = "0";

    if (!mml || !window.MabiMml?.parseMabinogiMml || !window.MabiMml?.buildSchedule) return;
    try {
      const parsed = window.MabiMml.parseMabinogiMml(mml);
      const schedule = window.MabiMml.buildSchedule(parsed);
      playbackSchedule = schedule;
      const duration = Math.max(0, Number(schedule.duration) || 0);
      els.playbackControls.hidden = false;
      els.playButton.disabled = !(schedule.notes || []).length || duration <= 0;
      els.playbackSlider.disabled = duration <= 0;
      els.playbackSlider.max = String(duration);
      els.playbackSlider.value = "0";
      updatePlayButton();
    } catch (_) {
      playbackSchedule = null;
      els.playbackControls.hidden = true;
    }
  }

  function resetPlayback() {
    stopPlayback(false);
    playbackSchedule = null;
    preparedPlaybackNotes = null;
    playbackOffset = 0;
    els.playbackControls.hidden = true;
    els.playButton.disabled = true;
    els.playbackSlider.disabled = true;
    els.playbackSlider.max = "0";
    els.playbackSlider.value = "0";
    updatePlayButton();
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API is unavailable");
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.44;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") await audioCtx.resume();
    return audioCtx;
  }

  async function ensureFixedPlaybackPreset() {
    if (playbackSoundFont && fixedPlaybackPreset) return fixedPlaybackPreset;
    if (!playbackSoundFontPromise) {
      playbackSoundFontPromise = (async () => {
        const playbackApi = window.MobibardSimplePlayback;
        if (!playbackApi?.loadDefaultPreset) throw new Error("Simple 재생 플러그인을 불러오지 못했습니다.");
        const loaded = await playbackApi.loadDefaultPreset({
          bank: FIXED_PLAYBACK_BANK,
          program: FIXED_PLAYBACK_PROGRAM,
          clearBase64: true,
        });
        playbackSoundFont = loaded.soundBank;
        fixedPlaybackPreset = loaded.preset;
        return loaded.preset;
      })().catch(error => {
        playbackSoundFontPromise = null;
        throw error;
      });
    }
    return playbackSoundFontPromise;
  }

  function updatePlayButton() {
    els.playButton.textContent = playbackPlaying ? t("stop") : t("play");
  }

  function getCurrentPlaybackOffset() {
    if (!audioCtx || !playbackPlaying) return playbackOffset;
    if (audioCtx.currentTime <= playContextStart) return playOffsetStart;
    const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
    return Math.max(0, Math.min(duration, playOffsetStart + (audioCtx.currentTime - playContextStart)));
  }

  function setPlaybackSlider(value) {
    const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
    const clamped = Math.max(0, Math.min(duration, Number(value) || 0));
    els.playbackSlider.value = String(Math.round(clamped * 100) / 100);
  }

  function stopActiveSampleSources() {
    const sources = activeSampleSources.splice(0);
    for (const item of sources) {
      try { item?.source?.stop(); } catch (_) {}
      try { item?.source?.disconnect(); } catch (_) {}
      try { item?.gain?.disconnect(); } catch (_) {}
    }
    scheduledPlaybackIds.clear();
  }

  function stopPlayback(updateOffset = true) {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = 0;
    if (progressRaf) cancelAnimationFrame(progressRaf);
    progressRaf = 0;
    if (updateOffset && playbackPlaying) playbackOffset = getCurrentPlaybackOffset();
    stopActiveSampleSources();
    playbackPlaying = false;
    setPlaybackSlider(playbackOffset);
    updatePlayButton();
  }

  function prepareFixedPlaybackNotes() {
    const playbackApi = window.MobibardSimplePlayback;
    if (!playbackSchedule || !playbackSoundFont || !fixedPlaybackPreset || !playbackApi?.prepareNotes) return [];
    const prepared = playbackApi.prepareNotes(audioCtx, playbackSoundFont, fixedPlaybackPreset, playbackSchedule.notes || []);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    preparedPlaybackNotes = prepared;
    return prepared;
  }

  function schedulePlaybackWindow() {
    const playbackApi = window.MobibardSimplePlayback;
    if (!playbackPlaying || !audioCtx || !playbackSchedule || !preparedPlaybackNotes || !playbackApi?.schedulePreparedNotes) return;
    const nowOffset = getCurrentPlaybackOffset();
    const duration = Math.max(0, Number(playbackSchedule.duration) || 0);
    if (duration > 0 && nowOffset >= duration - 0.005) {
      finishPlayback();
      return;
    }
    const windowEnd = Math.min(duration, nowOffset + PLAY_LOOKAHEAD_SEC);
    playbackApi.schedulePreparedNotes(audioCtx, preparedPlaybackNotes, {
      baseTime: playContextStart,
      fromSec: playOffsetStart,
      windowStart: nowOffset,
      windowEnd,
      destination: masterGain,
      activeSources: activeSampleSources,
      scheduledIds: scheduledPlaybackIds,
      minLeadTime: 0.012
    });
  }

  function startProgressLoop() {
    if (progressRaf) cancelAnimationFrame(progressRaf);
    const tick = () => {
      if (!playbackPlaying) return;
      const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
      playbackOffset = getCurrentPlaybackOffset();
      if (!isSeeking) setPlaybackSlider(playbackOffset);
      if (duration > 0 && playbackOffset >= duration - 0.005) {
        finishPlayback();
        return;
      }
      progressRaf = requestAnimationFrame(tick);
    };
    progressRaf = requestAnimationFrame(tick);
  }

  async function startPlayback() {
    const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
    if (!playbackSchedule || !(playbackSchedule.notes || []).length || duration <= 0) return;
    try {
      if (playbackOffset >= duration - 0.005) playbackOffset = 0;
      await ensureAudioContext();
      await ensureFixedPlaybackPreset();
      stopPlayback(false);
      const prepared = prepareFixedPlaybackNotes();
      if (!prepared.length) throw new Error("Bank 0 / Program 0 produced no audible playback notes");
      activeSampleSources = [];
      scheduledPlaybackIds = new Set();
      playOffsetStart = playbackOffset;
      playContextStart = audioCtx.currentTime + 0.04;
      playbackPlaying = true;
      updatePlayButton();
      schedulePlaybackWindow();
      schedulerTimer = setInterval(schedulePlaybackWindow, PLAY_SCHEDULER_MS);
      startProgressLoop();
    } catch (error) {
      stopPlayback(false);
      showStatus(shortError(error));
    }
  }

  function finishPlayback() {
    const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
    stopPlayback(false);
    playbackOffset = duration;
    setPlaybackSlider(duration);
  }

  function togglePlayback() {
    if (playbackPlaying) stopPlayback(true);
    else void startPlayback();
  }

  function updateSeekFromSlider() {
    const duration = Math.max(0, Number(playbackSchedule?.duration) || 0);
    playbackOffset = Math.max(0, Math.min(duration, Number(els.playbackSlider.value) || 0));
    setPlaybackSlider(playbackOffset);
  }

  function finishSeek() {
    isSeeking = false;
    if (!seekWasPlaying) return;
    seekWasPlaying = false;
    void startPlayback();
  }

  els.fileButton.addEventListener("click", event => {
    event.stopPropagation();
    openFilePickerInput(els.fileInput);
  });
  els.dropZone.addEventListener("click", event => {
    if (event.target === els.fileButton) return;
    openFilePickerInput(els.fileInput);
  });
  els.dropZone.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openFilePickerInput(els.fileInput);
  });
  els.fileInput.addEventListener("change", () => void selectFile(els.fileInput.files?.[0] || null));

  for (const eventName of ["dragenter", "dragover"]) {
    els.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      els.dropZone.classList.add("dragover");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    els.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      els.dropZone.classList.remove("dragover");
    });
  }
  els.dropZone.addEventListener("drop", event => void selectFile(event.dataTransfer?.files?.[0] || null));

  els.quantizeOptions.addEventListener("click", event => {
    const button = event.target.closest("[data-quantize]");
    if (!button) return;
    selectQuantizeOption(button.dataset.quantize, true);
  });
  els.restOptions.addEventListener("click", event => {
    const button = event.target.closest("[data-rest]");
    if (!button) return;
    selectRestOption(button.dataset.rest, true);
  });

  els.playButton.addEventListener("click", togglePlayback);
  els.playbackSlider.addEventListener("pointerdown", () => {
    isSeeking = true;
    seekWasPlaying = playbackPlaying;
    if (playbackPlaying) stopPlayback(true);
  });
  els.playbackSlider.addEventListener("input", () => {
    if (playbackPlaying) {
      seekWasPlaying = true;
      stopPlayback(true);
    }
    updateSeekFromSlider();
  });
  els.playbackSlider.addEventListener("change", finishSeek);
  els.playbackSlider.addEventListener("pointerup", () => setTimeout(finishSeek, 0));

  els.copyAllButton.addEventListener("click", () => void copyText(currentMml, els.copyAllButton, "copy"));
  els.settingsButton.addEventListener("click", toggleSettingsMenu);
  els.languageSelect.addEventListener("change", () => void applyLanguage(els.languageSelect.value, true, "user"));
  els.themeButton.addEventListener("click", toggleTheme);
  document.addEventListener("pointerdown", event => {
    if (!els.settingsMenu.hidden && !els.settingsControl.contains(event.target)) setSettingsMenuOpen(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || els.settingsMenu.hidden) return;
    setSettingsMenuOpen(false);
    els.settingsButton.focus();
  });

  selectQuantizeOption(64, false);
  selectRestOption("32", false);
  void applyLanguage(language, false);
})();
