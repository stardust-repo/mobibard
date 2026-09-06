const LANGUAGE_KEY = 'mobibard.player.language';
const DEFAULT_LANGUAGE = 'en';
const SUPPORTED = Object.freeze({
  ko: { file: 'ko.js', htmlLang: 'ko' },
  ja: { file: 'ja.js', htmlLang: 'ja' },
  en: { file: 'en.js', htmlLang: 'en' },
  'zh-CN': { file: 'zh-CN.js', htmlLang: 'zh-Hans' },
  'zh-TW': { file: 'zh-TW.js', htmlLang: 'zh-Hant' },
});
const listeners = new Set();
const cache = new Map();
let activeLanguage = DEFAULT_LANGUAGE;
let activeLocale = { strings: {} };
let initialPromise = null;

export function normalizeLanguage(value) {
  const raw = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (raw === 'ko' || raw.startsWith('ko-')) return 'ko';
  if (raw === 'ja' || raw.startsWith('ja-')) return 'ja';
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'zh-cn' || raw === 'zh-hans' || raw.startsWith('zh-cn-') || raw.startsWith('zh-hans-')) return 'zh-CN';
  if (raw === 'zh-tw' || raw === 'zh-hant' || raw.startsWith('zh-tw-') || raw.startsWith('zh-hant-')) return 'zh-TW';
  if (raw.startsWith('zh-')) return /(?:tw|hk|mo|hant)/.test(raw) ? 'zh-TW' : 'zh-CN';
  return '';
}

function initialLanguage() {
  try {
    const params = new URLSearchParams(location.search);
    for (const key of ['lang', 'language', 'locale']) {
      const value = normalizeLanguage(params.get(key));
      if (value) return value;
    }
    const stored = normalizeLanguage(localStorage.getItem(LANGUAGE_KEY));
    if (stored) return stored;
  } catch (_) {}
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  for (const candidate of candidates) {
    const value = normalizeLanguage(candidate);
    if (value) return value;
  }
  return DEFAULT_LANGUAGE;
}

async function loadLocale(language) {
  const normalized = SUPPORTED[language] ? language : DEFAULT_LANGUAGE;
  if (cache.has(normalized)) return cache.get(normalized);
  const module = await import(`../locale/${SUPPORTED[normalized].file}?v=20260906-locale-prune1`);
  const locale = module.default || module;
  if (!locale?.strings) throw new Error(`Invalid VeloScriptor locale: ${normalized}`);
  cache.set(normalized, locale);
  return locale;
}

function interpolate(value, replacements = {}) {
  return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => replacements[key] ?? '');
}

export function t(key, replacements = {}) {
  return interpolate(activeLocale?.strings?.[key] ?? key, replacements);
}

export function getLanguage() {
  return activeLanguage;
}

export function localizeDocument(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (key) element.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    if (key) element.title = t(key);
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria-label');
    if (key) element.setAttribute('aria-label', t(key));
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
  return normalized;
}

export function initializeLanguage() {
  if (!initialPromise) initialPromise = setLanguage(initialLanguage(), { persist: false });
  return initialPromise;
}
