(() => {
  "use strict";

  const PREF_KEY = "mobibard-language";
  const DEFAULT_LANGUAGE = "ko";
  const LOCALE_VERSION = "5.3.0";
  const LOCALE_REVISION = "20260907-editor79";
  const SUPPORTED = Object.freeze({
    ko: { file: "ko.js", htmlLang: "ko" },
    ja: { file: "ja.js", htmlLang: "ja" },
    en: { file: "en.js", htmlLang: "en" },
    "zh-CN": { file: "zh-CN.js", htmlLang: "zh-Hans" },
    "zh-TW": { file: "zh-TW.js", htmlLang: "zh-Hant" }
  });
  const LANGUAGE_QUERY_KEYS = Object.freeze(["lang", "language", "locale"]);
  const TRANSLATABLE_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"];
  const EXPLICIT_ATTRIBUTE_MARKERS = Object.freeze({
    "data-i18n-title": "title",
    "data-i18n-aria-label": "aria-label",
    "data-i18n-placeholder": "placeholder",
    "data-i18n-alt": "alt"
  });
  const EXPLICIT_SELECTOR = "[data-i18n],[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-alt]";
  const OBSERVED_ATTRIBUTES = [
    ...TRANSLATABLE_ATTRIBUTES,
    "data-i18n", "data-i18n-args",
    ...Object.keys(EXPLICIT_ATTRIBUTE_MARKERS),
    ...Object.keys(EXPLICIT_ATTRIBUTE_MARKERS).map((marker) => `${marker}-args`)
  ];
  const SKIP_SELECTOR = "script,style,textarea,pre,code,kbd,samp,[data-i18n-skip],[data-i18n]";
  const localeCache = new Map();
  const localeLoadPromises = new Map();
  const textSourceCache = new WeakMap();
  const attributeSourceCache = new WeakMap();
  let activeLanguage = DEFAULT_LANGUAGE;
  let activeLocale = { strings: {} };
  let observer = null;
  let applying = false;

  const nativeDialogs = {
    alert: typeof window.alert === "function" ? window.alert.bind(window) : null,
    confirm: typeof window.confirm === "function" ? window.confirm.bind(window) : null,
    prompt: typeof window.prompt === "function" ? window.prompt.bind(window) : null
  };

  function readCachedLanguage() {
    try { return localStorage.getItem(PREF_KEY) || ""; }
    catch (_) { return ""; }
  }

  function writeCachedLanguage(language) {
    try { localStorage.setItem(PREF_KEY, language); }
    catch (_) {}
  }

  function normalizeLanguage(language) {
    const raw = String(language || "").trim();
    if (!raw) return "";
    const normalized = raw.replace(/_/g, "-");
    const lower = normalized.toLowerCase();
    if (lower === "ko" || lower.startsWith("ko-")) return "ko";
    if (lower === "ja" || lower.startsWith("ja-")) return "ja";
    if (lower === "en" || lower.startsWith("en-")) return "en";
    if (lower === "zh-cn" || lower === "zh-sg" || lower === "zh-hans" || lower.startsWith("zh-hans-")) return "zh-CN";
    if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant" || lower.startsWith("zh-hant-")) return "zh-TW";
    if (lower === "zh" || lower.startsWith("zh-")) return "zh-CN";
    return "";
  }

  function readLanguageQuery() {
    let params;
    try { params = new URL(window.location.href).searchParams; }
    catch (_) { return { mode: "auto", key: "", raw: "", language: "" }; }

    for (const key of LANGUAGE_QUERY_KEYS) {
      if (!params.has(key)) continue;
      const raw = String(params.get(key) || "").trim();
      if (!raw || /^(?:auto|browser|system)$/i.test(raw)) {
        return { mode: "auto", key, raw, language: "" };
      }
      const normalized = normalizeLanguage(raw);
      return {
        mode: "fixed",
        key,
        raw,
        language: normalized && SUPPORTED[normalized] ? normalized : DEFAULT_LANGUAGE
      };
    }
    return { mode: "auto", key: "", raw: "", language: "" };
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
      if (changed && window.history?.replaceState) {
        window.history.replaceState(window.history.state, "", url.href);
      }
    } catch (_) {}
  }

  function detectBrowserLanguage() {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ""];
    for (const candidate of candidates) {
      const normalized = normalizeLanguage(candidate);
      if (normalized) return normalized;
    }
    return DEFAULT_LANGUAGE;
  }

  function resolveAutomaticLanguage() {
    return normalizeLanguage(readCachedLanguage()) || detectBrowserLanguage() || DEFAULT_LANGUAGE;
  }

  function resolveInitialLanguage() {
    const query = readLanguageQuery();
    if (query.mode === "fixed") {
      return { language: query.language, source: query.language === DEFAULT_LANGUAGE && !normalizeLanguage(query.raw) ? "query-fallback" : "query" };
    }
    const bootstrapped = normalizeLanguage(window.__MOBIBARD_INITIAL_LANGUAGE__);
    if (bootstrapped && SUPPORTED[bootstrapped]) {
      return { language: bootstrapped, source: "bootstrap" };
    }
    return { language: resolveAutomaticLanguage(), source: "auto" };
  }

  function validateLocaleData(data, normalized) {
    if (!data || typeof data !== "object" || !data.strings || typeof data.strings !== "object" || Array.isArray(data.strings)) {
      throw new Error(`Invalid locale data: ${normalized}`);
    }
    const rawPatterns = data.patterns && typeof data.patterns === "object" && !Array.isArray(data.patterns) ? data.patterns : {};
    const compiledPatterns = Object.entries(rawPatterns).map(([source, target]) => {
      const names = [];
      let cursor = 0;
      let pattern = "";
      const matcher = /\{(\d+)\}/g;
      let match;
      while ((match = matcher.exec(source))) {
        pattern += source.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern += "(.+?)";
        names.push(Number(match[1]));
        cursor = match.index + match[0].length;
      }
      pattern += source.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const literalLength = source.replace(/\{\d+\}/g, "").length;
      return { source, target: String(target), names, regex: new RegExp(`^${pattern}$`), literalLength };
    }).sort((a, b) => (b.literalLength - a.literalLength) || (b.source.length - a.source.length));
    return { ...data, code: normalized, strings: data.strings, patterns: rawPatterns, compiledPatterns };
  }

  function buildLocaleUrl(file) {
    const url = new URL(`locale/${file}`, document.baseURI);
    // Query strings are useful for deployed cache invalidation, but can make
    // local file loading inconsistent across browsers and operating systems.
    if (url.protocol !== "file:") {
      url.searchParams.set("v", LOCALE_VERSION);
      url.searchParams.set("rev", LOCALE_REVISION);
    }
    return url.href;
  }

  async function loadLocale(language) {
    const normalized = normalizeLanguage(language) || DEFAULT_LANGUAGE;
    if (localeCache.has(normalized)) return localeCache.get(normalized);
    if (localeLoadPromises.has(normalized)) return localeLoadPromises.get(normalized);

    const config = SUPPORTED[normalized] || SUPPORTED[DEFAULT_LANGUAGE];
    const promise = new Promise((resolve, reject) => {
      const existing = window.__MOBIBARD_LOCALES__?.[normalized];
      if (existing) {
        try {
          const locale = validateLocaleData(existing, normalized);
          localeCache.set(normalized, locale);
          resolve(locale);
        } catch (error) {
          reject(error);
        }
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.charset = "utf-8";
      script.dataset.mobibardLocale = normalized;
      script.src = buildLocaleUrl(config.file);
      script.onload = () => {
        try {
          const data = window.__MOBIBARD_LOCALES__?.[normalized];
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
        reject(new Error(`Locale load failed: ${normalized}`));
      };
      document.head.appendChild(script);
    });

    localeLoadPromises.set(normalized, promise);
    try {
      return await promise;
    } finally {
      localeLoadPromises.delete(normalized);
    }
  }

  function applyTemplate(template, values) {
    return String(template).replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? "");
  }

  function translateCore(text, locale = activeLocale) {
    const source = String(text == null ? "" : text);
    if (!source) return source;
    const direct = locale?.strings?.[source];
    return typeof direct === "string" ? direct : source;
  }

  function translateKey(key, values = []) {
    const template = activeLocale?.strings?.[String(key)] ?? String(key);
    const normalizedValues = Array.isArray(values)
      ? values
      : Object.keys(values || {}).reduce((list, name) => {
          list[Number(name)] = values[name];
          return list;
        }, []);
    return applyTemplate(template, normalizedValues);
  }

  function parseExplicitArgs(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function applyExplicitElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.hasAttribute("data-i18n")) {
      const key = element.getAttribute("data-i18n") || "";
      const values = parseExplicitArgs(element.getAttribute("data-i18n-args"));
      element.textContent = translateKey(key, values);
    }
    for (const [marker, attribute] of Object.entries(EXPLICIT_ATTRIBUTE_MARKERS)) {
      if (!element.hasAttribute(marker)) continue;
      const key = element.getAttribute(marker) || "";
      const values = parseExplicitArgs(element.getAttribute(`${marker}-args`));
      element.setAttribute(attribute, translateKey(key, values));
    }
  }

  function applyExplicitSubtree(root) {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(EXPLICIT_SELECTOR)) {
      applyExplicitElement(root);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(EXPLICIT_SELECTOR).forEach(applyExplicitElement);
    }
  }

  function translatePattern(source) {
    const patterns = activeLocale?.compiledPatterns || [];
    for (const item of patterns) {
      const match = String(source).match(item.regex);
      if (!match) continue;
      const values = {};
      item.names.forEach((name, index) => { values[name] = match[index + 1] ?? ""; });
      return String(item.target).replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? "");
    }
    return null;
  }

  function translateString(text) {
    const source = String(text == null ? "" : text);
    if (!source) return source;
    if (Object.prototype.hasOwnProperty.call(activeLocale?.strings || {}, source)) {
      return translateCore(source);
    }
    const directPattern = translatePattern(source);
    if (directPattern != null) return directPattern;
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    const coreEnd = source.length - trailing.length;
    const core = source.slice(leading.length, coreEnd);
    if (!core) return source;
    const direct = translateCore(core);
    if (direct !== core) return leading + direct + trailing;
    const patterned = translatePattern(core);
    return patterned == null ? source : leading + patterned + trailing;
  }

  function shouldSkipNode(node) {
    const parent = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(parent?.closest?.(SKIP_SELECTOR));
  }

  function translateTextNode(node, force = false) {
    if (!node || node.nodeType !== Node.TEXT_NODE || shouldSkipNode(node)) return;
    const current = node.nodeValue || "";
    if (!current.trim()) return;
    const cached = textSourceCache.get(node);
    const source = force && cached
      ? cached.source
      : (cached && current === cached.last ? cached.source : current);
    const translated = translateString(source);
    textSourceCache.set(node, { source, last: translated });
    if (translated !== current) node.nodeValue = translated;
  }

  function translateElementAttributes(element, force = false) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || shouldSkipNode(element)) return;
    let map = attributeSourceCache.get(element);
    if (!map) {
      map = new Map();
      attributeSourceCache.set(element, map);
    }
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const marker = Object.keys(EXPLICIT_ATTRIBUTE_MARKERS).find((name) => EXPLICIT_ATTRIBUTE_MARKERS[name] === attribute);
      if (marker && element.hasAttribute(marker)) continue;
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute) || "";
      if (!current.trim()) continue;
      const cached = map.get(attribute);
      const source = force && cached
        ? cached.source
        : (cached && current === cached.last ? cached.source : current);
      const translated = translateString(source);
      map.set(attribute, { source, last: translated });
      if (translated !== current) element.setAttribute(attribute, translated);
    }
  }

  function translateSubtree(root, force = false) {
    if (!root) return;
    applying = true;
    try {
      applyExplicitSubtree(root);
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root, force);
        return;
      }
      if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root, force);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, force);
        else translateElementAttributes(node, force);
      }
    } finally {
      applying = false;
    }
  }

  function installObserver() {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (applying) return;
      for (const record of records) {
        if (record.type === "characterData") {
          translateTextNode(record.target, false);
        } else if (record.type === "attributes") {
          translateElementAttributes(record.target, false);
        } else if (record.type === "childList") {
          record.addedNodes.forEach((node) => translateSubtree(node, false));
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES
    });
  }

  function installDialogTranslation() {
    if (nativeDialogs.alert) window.alert = (message) => nativeDialogs.alert(translateString(message));
    if (nativeDialogs.confirm) window.confirm = (message) => nativeDialogs.confirm(translateString(message));
    if (nativeDialogs.prompt) window.prompt = (message, defaultValue) => nativeDialogs.prompt(translateString(message), defaultValue);
  }

  function updateLanguageUi(language) {
    const select = document.getElementById("languageSelect");
    if (select && select.value !== language) select.value = language;
    document.documentElement.lang = SUPPORTED[language]?.htmlLang || SUPPORTED[DEFAULT_LANGUAGE].htmlLang;
  }

  async function setLanguage(language, options = {}) {
    if (options.source === "user") clearLanguageQuery();
    const requested = normalizeLanguage(language) || DEFAULT_LANGUAGE;
    let resolved = requested;
    let locale;
    try {
      locale = await loadLocale(requested);
    } catch (error) {
      console.warn(error);
      resolved = DEFAULT_LANGUAGE;
      try {
        locale = await loadLocale(DEFAULT_LANGUAGE);
      } catch (fallbackError) {
        console.error(fallbackError);
        locale = { code: DEFAULT_LANGUAGE, strings: {} };
      }
    }
    activeLanguage = resolved;
    activeLocale = locale;
    if (options.persist !== false) writeCachedLanguage(resolved);
    updateLanguageUi(resolved);
    translateSubtree(document.documentElement, true);
    window.dispatchEvent(new CustomEvent("mobibard:localechange", {
      detail: { language: resolved, requested, source: options.source || "app" }
    }));
    return resolved;
  }

  async function syncFromPreference(options = {}) {
    const query = readLanguageQuery();
    const cached = normalizeLanguage(readCachedLanguage());
    const preferred = query.mode === "fixed"
      ? query.language
      : (cached || detectBrowserLanguage() || DEFAULT_LANGUAGE);
    if (query.mode !== "fixed" && !cached) writeCachedLanguage(preferred);
    if (preferred === activeLanguage && localeCache.has(preferred)) {
      updateLanguageUi(preferred);
      return preferred;
    }
    return setLanguage(preferred, {
      persist: false,
      source: query.mode === "fixed" ? "query" : (options.source || "preference")
    });
  }

  async function initialize() {
    const initial = resolveInitialLanguage();
    if ((initial.source === "auto" || initial.source === "bootstrap") && !normalizeLanguage(readCachedLanguage())) {
      writeCachedLanguage(initial.language);
    }
    installDialogTranslation();
    try {
      // The selected locale is bootstrapped in <head>. Keep key-backed elements
      // blank until that catalog is applied, so translation keys never flash.
      const resolved = await setLanguage(initial.language, { persist: false, source: initial.source });
      installObserver();
      return resolved;
    } finally {
      document.documentElement.removeAttribute("data-i18n-pending");
    }
  }

  const api = {
    get language() { return activeLanguage; },
    get queryLanguage() { return readLanguageQuery(); },
    get supportedLanguages() { return Object.keys(SUPPORTED); },
    normalizeLanguage,
    translate: translateString,
    t: translateKey,
    setLanguage,
    syncFromPreference,
    ready: null
  };
  window.MobibardI18n = api;
  api.ready = initialize();
})();
