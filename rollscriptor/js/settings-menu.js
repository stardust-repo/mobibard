import { getLanguage, initializeLanguage, onLanguageChange, setLanguage, t } from './language-manager.js?v=20260831-account-menu1';
import { initializeThemeUi } from './ui.js?v=20260831-account-menu1';
import { initializeGoogleAccountMenu } from '../../plugins/google/google-account-menu.js?v=20260831-account-menu1';

let accountController = null;
let toastTimer = 0;

function notify(message, tone = 'info') {
  const toast = document.getElementById('toast');
  if (!toast || !message) return;
  clearTimeout(toastTimer);
  toast.textContent = String(message);
  toast.className = `toast show ${tone === 'error' ? 'error' : ''}`.trim();
  toastTimer = window.setTimeout(() => { toast.className = 'toast'; }, 2800);
}

function initializePopover() {
  const button = document.getElementById('settingsButton');
  const menu = document.getElementById('settingsMenu');
  if (!button || !menu || button.dataset.settingsReady === 'true') return;

  button.dataset.settingsReady = 'true';
  const hasNativePopover = typeof menu.showPopover === 'function' && typeof menu.hidePopover === 'function';

  const syncExpanded = () => {
    let open = menu.classList.contains('is-open');
    if (hasNativePopover) {
      try { open = menu.matches(':popover-open'); } catch (_) {}
    }
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) void accountController?.refreshProfile(false);
  };

  if (hasNativePopover) {
    menu.addEventListener('toggle', syncExpanded);
    syncExpanded();
    return;
  }

  const close = () => {
    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  };
  const toggle = event => {
    event.preventDefault();
    event.stopPropagation();
    menu.classList.toggle('is-open');
    syncExpanded();
  };

  button.addEventListener('click', toggle);
  menu.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  close();
}

async function initializeSettingsControls() {
  const languageSelect = document.getElementById('languageSelect');

  try {
    await initializeLanguage();
  } catch (error) {
    console.error('RollScriptor locale initialization failed:', error);
  }

  if (languageSelect) {
    languageSelect.value = getLanguage();
    if (languageSelect.dataset.localeReady !== 'true') {
      languageSelect.dataset.localeReady = 'true';
      languageSelect.addEventListener('change', async event => {
        const select = event.currentTarget;
        const requested = select.value;
        select.disabled = true;
        try {
          await setLanguage(requested, { persist: true, updateQuery: true });
        } catch (error) {
          console.error('RollScriptor locale change failed:', error);
          select.value = getLanguage();
        } finally {
          select.disabled = false;
        }
      });
    }
  }

  initializeThemeUi();
  accountController = initializeGoogleAccountMenu({ t, notify });
  onLanguageChange(() => accountController?.refreshText());
}

function initialize() {
  initializePopover();
  void initializeSettingsControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
