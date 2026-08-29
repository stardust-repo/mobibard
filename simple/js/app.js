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
  const LOCALE_VERSION = "5.2.0";
  const LOCALE_REVISION = "20260829-v52";
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
    fadeInLabel: $("fadeInLabel"),
    fadeInOptions: $("fadeInOptions"),
    fadeOutLabel: $("fadeOutLabel"),
    fadeOutOptions: $("fadeOutOptions"),
    tutorialButton: $("simpleTutorialBtn"),
    playbackControls: $("playbackControls"),
    playButton: $("playButton"),
    rewindButton: $("rewindButton"),
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
    subtitle: $("subtitle"),
    sourceStepTitle: $("sourceStepTitle"),
    sourceStepDescription: $("sourceStepDescription"),
    convertStepTitle: $("convertStepTitle"),
    convertStepDescription: $("convertStepDescription"),
    brandName: $("brandName"),
    midiExtractLink: $("midiExtractLink"),
    rollscriptorLink: $("rollscriptorLink"),
    fullEditorLink: $("fullEditorLink"),
    discordLink: $("discordLink"),
    settingsControl: $("settingsControl"),
    settingsButton: $("settingsButton"),
    settingsMenu: $("settingsMenu"),
    languageSelect: $("languageSelect"),
    languageLabel: $("languageLabel"),
    themeLabel: $("themeLabel"),
    themeButton: $("themeButton"),
    themeButtonText: $("themeButtonText"),
    toast: $("simpleToast")
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
  let selectedFadeIn = 0;
  let selectedFadeOut = 0;
  let currentMml = "";
  let resultPages = [];
  let conversionSerial = 0;
  let fileSelectionSerial = 0;
  let conversionTimer = 0;

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
      "xml.parse_error": "xmlInvalid",
      "simple.err_playback_plugin": "playbackPluginMissing",
      "simple.err_soundbank": "soundbankMissing",
      "simple.err_preset": "presetMissing",
      "simple.err_no_audible": "noAudiblePlayback"
    };
    const uiKey = map[key];
    if (uiKey) return t(uiKey, values);
    if (key === "ui.no_notes") return t("engineNoNotes");
    if (key === "midi.program_number") return ({ ko: `프로그램 ${values[0] ?? ""}`, ja: `プログラム ${values[0] ?? ""}`, "zh-CN": `音色 ${values[0] ?? ""}`, "zh-TW": `音色 ${values[0] ?? ""}` }[language] || `Program ${values[0] ?? ""}`);
    if (key === "midi.part_default") return ({ ko: `파트 ${values[0] ?? ""}`, ja: `パート ${values[0] ?? ""}`, "zh-CN": `声部 ${values[0] ?? ""}`, "zh-TW": `聲部 ${values[0] ?? ""}` }[language] || `Part ${values[0] ?? ""}`);
    if (key === "ui.beat") return ({ ko: "리듬", ja: "リズム", "zh-CN": "节拍", "zh-TW": "節拍" }[language] || "Beat");
    if (key === "snd.no_inst") return ({ ko: "악기 없음", ja: "楽器なし", "zh-CN": "无乐器", "zh-TW": "無樂器" }[language] || "No instrument");
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
    els.brandName.textContent = t("brand");
    els.subtitle.textContent = t("subtitle");
    if (els.sourceStepTitle) els.sourceStepTitle.textContent = t("stepSourceTitle");
    if (els.sourceStepDescription) els.sourceStepDescription.textContent = t("stepSourceDescription");
    if (els.convertStepTitle) els.convertStepTitle.textContent = t("stepConvertTitle");
    if (els.convertStepDescription) els.convertStepDescription.textContent = t("stepConvertDescription");
    els.midiExtractLink.textContent = t("extract");
    if (els.rollscriptorLink) { els.rollscriptorLink.textContent = t("rollscriptor"); els.rollscriptorLink.href = `../rollscriptor/index.html?lang=${encodeURIComponent(language)}`; }
    els.fullEditorLink.textContent = t("full");
    els.fullEditorLink.href = `../player/index.html?lang=${encodeURIComponent(language)}`;
    els.discordLink.setAttribute("aria-label", t("discord"));
    els.discordLink.title = t("discord");
    els.settingsButton.setAttribute("aria-label", t("account"));
    els.settingsButton.title = t("account");
    els.settingsMenu.setAttribute("aria-label", t("account"));
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
    els.fadeInLabel.textContent = t("fadeInSeconds");
    els.fadeOutLabel.textContent = t("fadeOutSeconds");
    if (els.tutorialButton) els.tutorialButton.textContent = t("tutorialOpen");
    updateSimpleTutorialLocale();
    els.fullScoreTitle.textContent = t("fullScore");
    els.copyAllButton.textContent = t("copy");
    els.resultsTitle.textContent = t("split");
    els.playbackSlider.setAttribute("aria-label", t("seek"));
    els.languageSelect.value = language;
    updatePlayButton();
    if (resultPages.length) renderResults(resultPages);
    try {
      window.dispatchEvent(new CustomEvent("mobibard:simple-localechange", {
        detail: { language, strings: { ...(activeLocale?.strings || {}) } }
      }));
    } catch (_) {}
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
      showToast(t("invalidFile"), "error");
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
      requestConversion();
    } catch (error) {
      if (selectToken !== fileSelectionSerial) return;
      selectedFile = null;
      selectedBytes = null;
      els.fileName.hidden = true;
      clearResults();
      showToast(t("failed", [shortError(error)]), "error");
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

  function selectFadeOption(kind, value, refresh = true) {
    const seconds = [0, 1, 2, 4].includes(Number(value)) ? Number(value) : 0;
    const wrap = kind === "in" ? els.fadeInOptions : els.fadeOutOptions;
    if (kind === "in") selectedFadeIn = seconds;
    else selectedFadeOut = seconds;
    wrap?.querySelectorAll("[data-fade-in],[data-fade-out]").forEach(button => {
      const buttonValue = Number(button.dataset.fadeIn ?? button.dataset.fadeOut ?? 0);
      const active = buttonValue === seconds;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    });
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
      ignoreSingle64thOverlap: true,
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

  function applySimpleFade(mml) {
    const fade = window.MabiOptimizer?.applyFadeMml;
    if (typeof fade !== "function" || (selectedFadeIn <= 0 && selectedFadeOut <= 0)) return mml;
    return fade(mml, {
      partCount: 3,
      fadeInSeconds: selectedFadeIn,
      fadeOutSeconds: selectedFadeOut
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

  function trackScoreCopy(scope) {
    const event = { name: "score_copy", params: { page: "simple", copy_scope: String(scope || "all") } };
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
      showToast(t("failed", ["MIDI converter is unavailable"]), "error");
      return;
    }

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
      const fadedMml = applySimpleFade(alignedMml);
      if (token !== conversionSerial) return;

      currentMml = fadedMml;
      resultPages = splitForCopy(fadedMml);
      rebuildPlayback(fadedMml);
      renderResults(resultPages);
    } catch (error) {
      if (token !== conversionSerial) return;
      clearResults();
      showToast(t("failed", [shortError(error)]), "error");
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
      const copied = await writeClipboard(text);
      if (!copied) return;
      trackScoreCopy(button === els.copyAllButton ? "all" : "split");
      button.textContent = t("copied");
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = t(restoreKey);
        button.classList.remove("copied");
      }, 1200);
    } catch (_) {
      showToast(t("copyFailed"), "error");
    }
  }

  function shortError(error) {
    const text = String(error?.message || error || "Unknown error");
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }

  let toastTimer = 0;

  function showToast(message, tone = "info") {
    const toast = els.toast || $("simpleToast");
    if (!toast || !message) return;
    clearTimeout(toastTimer);
    toast.textContent = String(message);
    toast.dataset.tone = tone;
    toast.hidden = false;
    toast.classList.remove("is-visible");
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 1800);
  }

  function rebuildPlayback(mml) {
    stopPlayback(false);
    playbackOffset = 0;
    playbackSchedule = null;
    preparedPlaybackNotes = null;
    els.playbackControls.hidden = true;
    els.playButton.disabled = true;
    if (els.rewindButton) els.rewindButton.disabled = true;
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
      if (els.rewindButton) els.rewindButton.disabled = duration <= 0;
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
    if (els.rewindButton) els.rewindButton.disabled = true;
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
        if (!playbackApi?.loadDefaultPreset) throw new Error(engineText("simple.err_playback_plugin"));
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
    const label = playbackPlaying ? t("stop") : t("play");
    els.playButton.classList.toggle("is-playing", playbackPlaying);
    els.playButton.setAttribute("aria-label", label);
    els.playButton.title = label;
  }

  function rewindPlayback() {
    stopPlayback(false);
    playbackOffset = 0;
    setPlaybackSlider(0);
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
    const now = audioCtx?.currentTime || 0;
    for (const item of sources) {
      const gainParam = item?.gain?.gain;
      if (audioCtx && gainParam) {
        const fadeEnd = now + 0.012;
        try {
          if (typeof gainParam.cancelAndHoldAtTime === "function") gainParam.cancelAndHoldAtTime(now);
          else gainParam.cancelScheduledValues(now);
          gainParam.linearRampToValueAtTime(0.0001, fadeEnd);
        } catch (_) {}
        try { item?.source?.stop(fadeEnd + 0.004); } catch (_) {}
      } else {
        try { item?.source?.stop(); } catch (_) {}
      }
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
      if (!prepared.length) throw new Error(engineText("simple.err_no_audible"));
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
      showToast(shortError(error), "error");
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

  function normalizePastedMml(value) {
    let text = String(value || "").trim();
    if (!text) throw new Error(t("pasteEmpty"));
    if (!/^MML\s*@/i.test(text)) {
      if (text.includes(",")) text = `MML@${text.replace(/;\s*$/, "")};`;
      else text = `MML@${text.replace(/;\s*$/, "")},,;`;
    }
    if (!/;\s*$/.test(text)) text += ";";
    if (window.MabiMml?.parseMabinogiMml) window.MabiMml.parseMabinogiMml(text);
    return text;
  }

  function loadPastedMml(value, name = "") {
    const normalized = normalizePastedMml(value);
    conversionSerial += 1;
    fileSelectionSerial += 1;
    if (conversionTimer) clearTimeout(conversionTimer);
    conversionTimer = 0;
    selectedFile = null;
    selectedBytes = null;
    currentMml = normalized;
    resultPages = splitForCopy(normalized);
    els.fileName.textContent = name || t("pastedName");
    els.fileName.hidden = false;
    rebuildPlayback(normalized);
    renderResults(resultPages);
    showToast(t("pasteLoaded"), "success");
    return normalized;
  }

  const SIMPLE_TUTORIAL_STEPS = Object.freeze([
    { image: "01-source.webp", title: "tutorialStep1Title", body: "tutorialStep1Body", note: "tutorialStep1Note" },
    { image: "02-options.webp", title: "tutorialStep2Title", body: "tutorialStep2Body", note: "tutorialStep2Note" },
    { image: "03-preview.webp", title: "tutorialStep3Title", body: "tutorialStep3Body", note: "tutorialStep3Note" },
    { image: "04-copy.webp", title: "tutorialStep4Title", body: "tutorialStep4Body", note: "tutorialStep4Note" }
  ]);
  let simpleTutorialStep = 0;
  let simpleTutorialUi = null;

  function tutorialLanguageFolder() {
    return SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  }

  function ensureSimpleTutorial() {
    if (simpleTutorialUi) return simpleTutorialUi;
    const dialog = document.createElement("dialog");
    dialog.className = "simple-tutorial-dialog";
    dialog.id = "simpleTutorialDialog";
    const card = document.createElement("div"); card.className = "simple-tutorial-card";
    const head = document.createElement("header"); head.className = "simple-tutorial-head";
    const headText = document.createElement("div");
    const title = document.createElement("h2");
    const progress = document.createElement("div"); progress.className = "simple-tutorial-progress";
    headText.append(title, progress);
    const close = document.createElement("button"); close.type="button"; close.className="simple-tutorial-close";
    head.append(headText, close);
    const content = document.createElement("div"); content.className="simple-tutorial-content";
    const visual = document.createElement("div"); visual.className="simple-tutorial-visual";
    const image = document.createElement("img"); image.className="simple-tutorial-image";
    const fallback = document.createElement("p"); fallback.className="simple-tutorial-image-fallback"; fallback.hidden=true;
    visual.append(image, fallback);
    const copy = document.createElement("div"); copy.className="simple-tutorial-copy";
    const stepTitle = document.createElement("h3"); stepTitle.className="simple-tutorial-step-title";
    const body = document.createElement("p"); body.className="simple-tutorial-body";
    const note = document.createElement("p"); note.className="simple-tutorial-note";
    copy.append(stepTitle, body, note); content.append(visual, copy);
    const footer = document.createElement("footer"); footer.className="simple-tutorial-footer";
    const dots = document.createElement("div"); dots.className="simple-tutorial-dots";
    const dotButtons = SIMPLE_TUTORIAL_STEPS.map((_, index) => { const b=document.createElement("button"); b.type="button"; b.className="simple-tutorial-dot"; b.addEventListener("click",()=>{simpleTutorialStep=index; renderSimpleTutorial();}); dots.append(b); return b; });
    const nav = document.createElement("div"); nav.className="simple-tutorial-nav";
    const prev = document.createElement("button"); prev.type="button"; prev.className="simple-tutorial-prev";
    const next = document.createElement("button"); next.type="button"; next.className="simple-tutorial-next";
    nav.append(prev,next); footer.append(dots,nav); card.append(head,content,footer); dialog.append(card); document.body.append(dialog);
    close.addEventListener("click",()=>dialog.close());
    prev.addEventListener("click",()=>{ if(simpleTutorialStep>0){simpleTutorialStep--;renderSimpleTutorial();} });
    next.addEventListener("click",()=>{ if(simpleTutorialStep>=SIMPLE_TUTORIAL_STEPS.length-1) dialog.close(); else {simpleTutorialStep++;renderSimpleTutorial();} });
    image.addEventListener("error",()=>{image.hidden=true;fallback.hidden=false;fallback.textContent=t("tutorialImageError");});
    dialog.addEventListener("click",event=>{ if(event.target===dialog) dialog.close(); });
    dialog.addEventListener("keydown",event=>{ if(event.key==="ArrowLeft"&&simpleTutorialStep>0){event.preventDefault();simpleTutorialStep--;renderSimpleTutorial();} if(event.key==="ArrowRight"&&simpleTutorialStep<SIMPLE_TUTORIAL_STEPS.length-1){event.preventDefault();simpleTutorialStep++;renderSimpleTutorial();} });
    simpleTutorialUi={dialog,title,progress,close,image,fallback,stepTitle,body,note,prev,next,dots:dotButtons};
    updateSimpleTutorialLocale();
    return simpleTutorialUi;
  }

  function renderSimpleTutorial() {
    const ui=ensureSimpleTutorial();
    const step=SIMPLE_TUTORIAL_STEPS[Math.max(0,Math.min(SIMPLE_TUTORIAL_STEPS.length-1,simpleTutorialStep))];
    ui.title.textContent=t("tutorialTitle");
    ui.progress.textContent=t("tutorialProgress",[simpleTutorialStep+1,SIMPLE_TUTORIAL_STEPS.length]);
    ui.close.textContent=t("tutorialClose"); ui.close.setAttribute("aria-label",t("tutorialClose"));
    ui.stepTitle.textContent=t(step.title); ui.body.textContent=t(step.body); ui.note.textContent=t(step.note);
    ui.prev.textContent=t("tutorialPrev"); ui.prev.disabled=simpleTutorialStep===0;
    ui.next.textContent=t(simpleTutorialStep===SIMPLE_TUTORIAL_STEPS.length-1?"tutorialFinish":"tutorialNext");
    ui.image.hidden=false; ui.fallback.hidden=true;
    ui.image.src=`assets/tutorial/${tutorialLanguageFolder()}/${step.image}?rev=20260824-final43`;
    ui.image.alt=t("tutorialImageAlt",[t(step.title)]);
    ui.dots.forEach((button,index)=>{ const active=index===simpleTutorialStep; button.classList.toggle("active",active); button.setAttribute("aria-current",active?"step":"false"); button.setAttribute("aria-label",t("tutorialJump",[index+1])); });
  }

  function updateSimpleTutorialLocale() {
    if (els.tutorialButton) els.tutorialButton.textContent=t("tutorialOpen");
    if (simpleTutorialUi) renderSimpleTutorial();
  }

  function openSimpleTutorial() {
    simpleTutorialStep=0;
    const ui=ensureSimpleTutorial();
    renderSimpleTutorial();
    if (typeof ui.dialog.showModal === "function") ui.dialog.showModal(); else ui.dialog.setAttribute("open","");
  }

  function currentSuggestedName() {
    const base = String(selectedFile?.name || els.fileName?.textContent || "mobibard-simple")
      .replace(/\.[^.]+$/, "")
      .replace(/[\/:*?"<>|]+/g, "_")
      .trim() || "mobibard-simple";
    return `${base}.txt`;
  }

  window.MobibardSimpleBridge = {
    selectFile,
    loadPastedMml,
    getCurrentMml: () => currentMml,
    getSuggestedName: currentSuggestedName,
    rewindPlayback,
    stopPlayback: () => stopPlayback(true),
    showToast,
    getLanguage: () => language,
    translate: (key, values = []) => t(key, values)
  };
  try { window.dispatchEvent(new Event("mobibard:simple-ready")); } catch (_) {}

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
    if (event.target.closest("button")) return;
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
  els.fadeInOptions?.addEventListener("click", event => {
    const button = event.target.closest("[data-fade-in]");
    if (button) selectFadeOption("in", button.dataset.fadeIn, true);
  });
  els.fadeOutOptions?.addEventListener("click", event => {
    const button = event.target.closest("[data-fade-out]");
    if (button) selectFadeOption("out", button.dataset.fadeOut, true);
  });
  els.tutorialButton?.addEventListener("click", event => { event.stopPropagation(); openSimpleTutorial(); });

  els.playButton.addEventListener("click", togglePlayback);
  els.rewindButton?.addEventListener("click", rewindPlayback);
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
  selectFadeOption("in", 0, false);
  selectFadeOption("out", 0, false);
  void applyLanguage(language, false);
})();
