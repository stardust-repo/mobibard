const LANGUAGE_KEY = 'mobibard.player.language';
const DEFAULT_LANGUAGE = 'en';
const SUPPORTED = Object.freeze({
  ko: { file: 'ko.js', htmlLang: 'ko' },
  ja: { file: 'ja.js', htmlLang: 'ja' },
  en: { file: 'en.js', htmlLang: 'en' },
  'zh-CN': { file: 'zh-CN.js', htmlLang: 'zh-Hans' },
  'zh-TW': { file: 'zh-TW.js', htmlLang: 'zh-Hant' },
});
const QUERY_KEYS = ['lang', 'language', 'locale'];
const listeners = new Set();
const cache = new Map();
let activeLanguage = DEFAULT_LANGUAGE;
let activeLocale = { strings: {} };
let initialLanguagePromise = null;

export function normalizeLanguage(value) {
  const raw = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (!raw) return '';
  if (raw === 'ko' || raw.startsWith('ko-')) return 'ko';
  if (raw === 'ja' || raw.startsWith('ja-')) return 'ja';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'zh-cn' || raw === 'zh-hans' || raw.startsWith('zh-cn-') || raw.startsWith('zh-hans-')) return 'zh-CN';
  if (raw === 'zh-tw' || raw === 'zh-hant' || raw.startsWith('zh-tw-') || raw.startsWith('zh-hant-')) return 'zh-TW';
  if (raw.startsWith('zh-')) return raw.includes('tw') || raw.includes('hk') || raw.includes('mo') || raw.includes('hant') ? 'zh-TW' : 'zh-CN';
  return '';
}

function readQueryLanguage() {
  try {
    const params = new URLSearchParams(location.search);
    for (const key of QUERY_KEYS) {
      if (!params.has(key)) continue;
      const raw = params.get(key);
      if (!raw || /^(?:auto|browser|system)$/i.test(raw)) return '';
      return normalizeLanguage(raw);
    }
  } catch (_) {}
  return '';
}

function readStoredLanguage() {
  try { return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY)); }
  catch (_) { return ''; }
}

function detectBrowserLanguage() {
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ''];
  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (SUPPORTED[normalized]) return normalized;
  }
  return '';
}

function resolveInitialLanguage() {
  return readQueryLanguage() || readStoredLanguage() || detectBrowserLanguage() || DEFAULT_LANGUAGE;
}

async function loadLocale(language) {
  const normalized = SUPPORTED[language] ? language : DEFAULT_LANGUAGE;
  if (cache.has(normalized)) return cache.get(normalized);
  const config = SUPPORTED[normalized];
  const module = await import(`../locale/${config.file}?v=20260906-locale-prune1`);
  const locale = module.default || module.locale || module;
  if (!locale || typeof locale !== 'object' || !locale.strings) throw new Error(`Invalid RollScriptor locale: ${normalized}`);
  cache.set(normalized, locale);
  return locale;
}

function interpolate(text, values = {}) {
  return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => values[key] ?? '');
}

export function t(key, values = {}) {
  const value = activeLocale?.strings?.[key];
  return interpolate(value ?? key, values);
}

export function getLanguage() {
  return activeLanguage;
}

export function localizeDocument(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(node => {
    const key = node.getAttribute('data-i18n-aria-label');
    if (key) node.setAttribute('aria-label', t(key));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(node => {
    const key = node.getAttribute('data-i18n-title');
    if (key) node.setAttribute('title', t(key));
  });
  document.title = t('site.title');
}

export function onLanguageChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setLanguage(language, { persist = true, updateQuery = false } = {}) {
  const normalized = SUPPORTED[normalizeLanguage(language)] ? normalizeLanguage(language) : DEFAULT_LANGUAGE;
  activeLocale = await loadLocale(normalized);
  activeLanguage = normalized;
  document.documentElement.lang = SUPPORTED[normalized].htmlLang;
  if (persist) {
    try { localStorage.setItem(LANGUAGE_KEY, normalized); } catch (_) {}
  }
  if (updateQuery) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', normalized);
      history.replaceState(null, '', url);
    } catch (_) {}
  }
  const select = document.getElementById('languageSelect');
  if (select && select.value !== normalized) select.value = normalized;
  localizeDocument();
  for (const listener of listeners) {
    try { listener(normalized, activeLocale); } catch (error) { console.error(error); }
  }
  window.dispatchEvent(new CustomEvent('mobibard:rollscriptor-localechange', { detail: { language: normalized } }));
  return normalized;
}

export function initializeLanguage() {
  if (!initialLanguagePromise) {
    initialLanguagePromise = setLanguage(resolveInitialLanguage(), { persist: false, updateQuery: false });
  }
  return initialLanguagePromise;
}

