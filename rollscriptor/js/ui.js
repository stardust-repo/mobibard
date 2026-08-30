import { onLanguageChange, t } from './language-manager.js?v=20260830-site-nav1';

const THEME_KEY = 'mobibard.player.theme';
let initialized = false;

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch (_) { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  const button = document.getElementById('themeButton');
  document.documentElement.dataset.theme = next;
  if (button) {
    const text = next === 'dark' ? t('theme.to_light') : t('theme.to_dark');
    button.title = text;
    button.setAttribute('aria-label', text);
  }
}

export function initializeThemeUi() {
  if (initialized) return;
  initialized = true;
  const button = document.getElementById('themeButton');
  applyTheme(readTheme());
  button?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    applyTheme(next);
  });
  onLanguageChange(() => applyTheme(readTheme()));
}

export function initializeHeaderUi(){const siteLinks=document.getElementById('midiSiteLinks');siteLinks?.addEventListener('change',()=>{const url=siteLinks.value;if(!url)return;window.open(url,'_blank','noopener,noreferrer');siteLinks.value=''})}
