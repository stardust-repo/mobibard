import { getLanguage, initializeLanguage, onLanguageChange, setLanguage, t } from './language-manager.js?v=20260903-guest-locale1';
import { initializeThemeUi } from './ui.js?v=20260903-guest-locale1';
import { initializeGoogleAccountMenu } from '../../plugins/google/google-account-menu.js?v=20260903-guest-locale1';

let accountController = null;
let toastTimer = 0;

function notify(message, tone = 'info') {
  const toast = document.getElementById('toast');
  if (!toast || !message) return;
  clearTimeout(toastTimer);
  toast.textContent = String(message);
  toast.classList.toggle('error', tone === 'error');
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function initializePopover() {
  const button = document.getElementById('settingsButton');
  const menu = document.getElementById('settingsMenu');
  if (!button || !menu || button.dataset.settingsReady === 'true') return;
  button.dataset.settingsReady = 'true';
  const nativePopover = typeof menu.showPopover === 'function' && typeof menu.hidePopover === 'function';
  const sync = () => {
    let open = menu.classList.contains('is-open');
    if (nativePopover) {
      try { open = menu.matches(':popover-open'); } catch (_) {}
    }
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) void accountController?.refreshProfile(false);
  };
  if (nativePopover) {
    menu.addEventListener('toggle', sync);
    sync();
    return;
  }
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    menu.classList.toggle('is-open');
    sync();
  });
  menu.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    menu.classList.remove('is-open');
    sync();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    menu.classList.remove('is-open');
    sync();
  });
}

async function initialize() {
  initializePopover();
  try { await initializeLanguage(); } catch (error) { console.error(error); }
  const select = document.getElementById('languageSelect');
  if (select) {
    select.value = getLanguage();
    if (select.dataset.localeReady !== 'true') {
      select.dataset.localeReady = 'true';
      select.addEventListener('change', async event => {
        const target = event.currentTarget;
        target.disabled = true;
        try { await setLanguage(target.value, { persist: true, updateQuery: true }); }
        finally { target.disabled = false; }
      });
    }
  }
  initializeThemeUi();
  accountController = initializeGoogleAccountMenu({ t, notify });
  onLanguageChange(() => accountController?.refreshText());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else void initialize();
