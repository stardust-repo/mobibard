import { onLanguageChange, t } from './language-manager.js?v=20260830-site-nav1';

const THEME_KEY = 'mobibard.player.theme';
let initialized = false;

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch (_) { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
}

export function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  const button = document.getElementById('themeButton');
  if (button) {
    const label = value === 'dark' ? t('theme.to_light') : t('theme.to_dark');
    button.title = label;
    button.setAttribute('aria-label', label);
  }
}

export function initializeThemeUi() {
  if (initialized) return;
  initialized = true;
  applyTheme(readTheme());
  document.getElementById('themeButton')?.addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, value); } catch (_) {}
    applyTheme(value);
  });
  onLanguageChange(() => applyTheme(readTheme()));
}
