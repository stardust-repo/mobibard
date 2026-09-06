const GOOGLE_CONFIG = window.MOBIBARD_GOOGLE_CONFIG || {};
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');
const GOOGLE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TOKEN_KEY = 'mobibard.player.googleTokenCache';
const AUTO_RECONNECT_KEY = 'mobibard.player.googleAutoReconnect';
const GUEST_AVATAR_URL = '../assets/icons/guest-user.svg?v=5.1.0&rev=20260818-205217';

let accessToken = '';
let tokenExpiresAt = 0;
let tokenClient = null;
let profile = null;
let profileToken = '';
let profilePromise = null;
let externalScriptPromise = null;
let expiryTimer = 0;

function clientId() {
  return String(GOOGLE_CONFIG.clientId || GOOGLE_CONFIG.clientID || GOOGLE_CONFIG.CLIENT_ID || '').trim();
}

function isConnected() {
  return Boolean(accessToken) && Number.isFinite(tokenExpiresAt) && Date.now() < tokenExpiresAt - 30000;
}

function readAutoReconnect() {
  try { return localStorage.getItem(AUTO_RECONNECT_KEY) === '1'; }
  catch (_) { return false; }
}

function writeAutoReconnect(enabled) {
  try { localStorage.setItem(AUTO_RECONNECT_KEY, enabled ? '1' : '0'); }
  catch (_) {}
}

function clearTokenCache() {
  try { localStorage.removeItem(TOKEN_KEY); }
  catch (_) {}
}

function clearExpiryTimer() {
  if (expiryTimer) { window.clearTimeout(expiryTimer); expiryTimer = 0; }
}

function resetSession({ clearCache = false, disableReconnect = false } = {}) {
  clearExpiryTimer();
  accessToken = '';
  tokenExpiresAt = 0;
  profile = null;
  profileToken = '';
  profilePromise = null;
  if (clearCache) clearTokenCache();
  if (disableReconnect) writeAutoReconnect(false);
}

function scheduleExpiry(update) {
  clearExpiryTimer();
  if (!isConnected()) return;
  const delay = Math.max(0, tokenExpiresAt - Date.now() - 30000);
  expiryTimer = window.setTimeout(() => {
    if (!isConnected()) {
      resetSession({ clearCache: true });
      try { update?.(); } catch (_) {}
    }
  }, delay);
}

function restoreTokenCache() {
  if (isConnected()) return true;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const token = String(data?.accessToken || data?.access_token || '');
    const expiresAt = Number(data?.expiresAt || data?.expires_at || 0);
    if (!token || !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 30000) {
      clearTokenCache();
      return false;
    }
    accessToken = token;
    tokenExpiresAt = expiresAt;
    return true;
  } catch (_) {
    clearTokenCache();
    return false;
  }
}

function saveTokenCache(response = {}) {
  if (!isConnected()) return;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      accessToken,
      expiresAt: tokenExpiresAt,
      cachedAt: Date.now(),
      scope: String(response.scope || GOOGLE_SCOPE),
    }));
  } catch (_) {}
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (externalScriptPromise) return externalScriptPromise;
  externalScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 12000) {
          window.clearInterval(timer);
          reject(new Error('Google Identity unavailable'));
        }
      }, 80);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity load failed'));
    document.head.appendChild(script);
  }).then(() => {
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity unavailable');
  }).catch(error => {
    externalScriptPromise = null;
    throw error;
  });
  return externalScriptPromise;
}

async function requestAccessToken() {
  if (isConnected() || restoreTokenCache()) return accessToken;
  const id = clientId();
  if (!id) throw new Error('google.client_id_missing');
  await loadGoogleIdentityScript();
  return new Promise((resolve, reject) => {
    try {
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: GOOGLE_SCOPE,
          include_granted_scopes: true,
          callback: () => {},
        });
      }
      tokenClient.callback = response => {
        if (!response || response.error) {
          reject(new Error(response?.error_description || response?.error || 'google.login_fail_short'));
          return;
        }
        accessToken = String(response.access_token || '');
        tokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000;
        writeAutoReconnect(true);
        saveTokenCache(response);
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      reject(error);
    }
  });
}

export function isGoogleAccountConnected() {
  return isConnected() || restoreTokenCache();
}

export function getGoogleAccessToken() {
  if (!isConnected()) restoreTokenCache();
  return isConnected() ? accessToken : '';
}

export async function ensureGoogleAccessToken() {
  if (isConnected() || restoreTokenCache()) return accessToken;
  const token = await requestAccessToken();
  return token;
}

async function loadProfile(force = false) {
  if (!isConnected()) return null;
  const token = accessToken;
  if (!force && profile && profileToken === token) return profile;
  if (!force && profilePromise && profileToken === token) return profilePromise;
  profileToken = token;
  profilePromise = (async () => {
    try {
      const fields = encodeURIComponent('user(displayName,emailAddress,photoLink)');
      const response = await fetch(`${GOOGLE_API_BASE}/about?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        resetSession({ clearCache: true, disableReconnect: true });
        return null;
      }
      if (!response.ok) throw new Error(`Google profile HTTP ${response.status}`);
      const data = await response.json();
      if (accessToken !== token) return null;
      const user = data?.user || {};
      profile = {
        displayName: String(user.displayName || ''),
        emailAddress: String(user.emailAddress || ''),
        photoLink: String(user.photoLink || ''),
      };
    } catch (_) {
      if (accessToken === token) profile = {};
    } finally {
      if (profileToken === token) profilePromise = null;
    }
    return profile;
  })();
  return profilePromise;
}

function shortError(error, t) {
  const raw = String(error?.message || error || '');
  const translated = raw.startsWith('google.') ? t(raw) : raw;
  return translated.length > 160 ? `${translated.slice(0, 160)}…` : translated;
}

export function initializeGoogleAccountMenu({
  t,
  notify = () => {},
  buttonId = 'settingsButton',
  menuId = 'settingsMenu',
  avatarId = 'accountAvatarImg',
  avatarIds = [],
  nameId = 'accountMenuName',
  emailId = 'accountMenuEmail',
  loginButtonId = 'googleLoginBtn',
} = {}) {
  if (typeof t !== 'function') throw new Error('initializeGoogleAccountMenu requires t()');

  const button = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  const avatar = document.getElementById(avatarId);
  const avatars = Array.from(new Set([avatar, ...[].concat(avatarIds || []).map(id => document.getElementById(id))].filter(Boolean)));
  const name = document.getElementById(nameId);
  const email = document.getElementById(emailId);
  const loginButton = document.getElementById(loginButtonId);
  const loginLabel = loginButton?.querySelector('.google-login-label') || null;
  let destroyed = false;

  const updateUi = () => {
    if (destroyed) return;
    const connected = isConnected();
    const currentProfile = connected && profile ? profile : {};
    const displayName = connected
      ? (String(currentProfile.displayName || '').trim() || t('account.user'))
      : t('account.guest');
    const emailText = connected ? String(currentProfile.emailAddress || '').trim() : '';
    const photo = connected ? String(currentProfile.photoLink || '').trim() : '';
    const hasClient = Boolean(clientId());

    if (name) name.textContent = displayName;
    if (email) {
      email.textContent = emailText;
      email.hidden = !emailText;
    }
    if (avatars.length) {
      const target = photo || GUEST_AVATAR_URL;
      avatars.forEach(node => {
        if (node.getAttribute('src') !== target) node.src = target;
        node.alt = '';
      });
    }
    if (button) {
      button.dataset.connected = connected ? 'true' : 'false';
      button.setAttribute('aria-label', connected ? displayName : t('account.menu'));
      button.title = connected ? displayName : t('account.menu');
    }
    if (menu) menu.setAttribute('aria-label', t('account.menu'));
    if (loginButton) {
      loginButton.disabled = !hasClient;
      const label = t(connected ? 'auth.logout' : 'auth.login');
      if (loginLabel) loginLabel.textContent = label;
      else loginButton.textContent = label;
      loginButton.setAttribute('aria-label', t(connected ? 'google.logout' : 'google.login'));
      loginButton.title = hasClient
        ? t(connected ? 'google.logout_help' : 'google.connect_help')
        : t('google.client_id_missing');
    }
  };

  const refreshProfile = async force => {
    if (!isConnected()) {
      updateUi();
      return null;
    }
    const result = await loadProfile(Boolean(force));
    updateUi();
    return result;
  };

  const handleLoginClick = async () => {
    if (isConnected()) {
      resetSession({ clearCache: true, disableReconnect: true });
      updateUi();
      notify(t('google.logout_done'), 'info');
      return;
    }
    try {
      notify(t('google.login_wait'), 'info');
      await requestAccessToken();
      scheduleExpiry(updateUi);
      updateUi();
      await refreshProfile(true);
      notify(t('google.connected'), 'success');
    } catch (error) {
      resetSession({ clearCache: true });
      updateUi();
      notify(`${t('google.login_fail_short')}: ${shortError(error, t)}`, 'error');
    }
  };

  const handleAvatarError = (event) => {
    const node = event?.currentTarget;
    if (!node) return;
    const current = node.getAttribute('src') || '';
    if (current !== GUEST_AVATAR_URL) node.src = GUEST_AVATAR_URL;
  };

  const handleStorage = event => {
    if (event.key !== TOKEN_KEY && event.key !== AUTO_RECONNECT_KEY) return;
    resetSession();
    if (readAutoReconnect() && restoreTokenCache()) { scheduleExpiry(updateUi); void refreshProfile(true); }
    else updateUi();
  };

  loginButton?.addEventListener('click', handleLoginClick);
  avatars.forEach(node => node.addEventListener('error', handleAvatarError));
  window.addEventListener('storage', handleStorage);

  if (readAutoReconnect() && restoreTokenCache()) {
    scheduleExpiry(updateUi);
    updateUi();
    void refreshProfile(false);
  } else {
    updateUi();
  }

  return {
    refreshText: updateUi,
    refreshProfile,
    isConnected,
    destroy() {
      destroyed = true;
      loginButton?.removeEventListener('click', handleLoginClick);
      avatars.forEach(node => node.removeEventListener('error', handleAvatarError));
      window.removeEventListener('storage', handleStorage);
      clearExpiryTimer();
    },
  };
}
