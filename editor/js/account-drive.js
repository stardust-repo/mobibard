import {
  initializeGoogleAccountMenu,
  ensureGoogleAccessToken,
  getGoogleAccessToken,
  isGoogleAccountConnected,
} from '../../plugins/google/google-account-menu.js?v=20260906-editor-alpha1';

const GOOGLE_CONFIG = window.MOBIBARD_GOOGLE_CONFIG || {};
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const PROJECT_FOLDER_NAME = 'MML_Mobibard';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PROJECT_MIME = 'application/json';

let accountController = null;
let pickerPromise = null;
let pickerScriptPromise = null;
let busy = false;

function t(key, values = []) {
  const api = window.MobibardI18n;
  const translated = api?.t?.(key, values);
  if (translated != null && translated !== key) return String(translated);
  const fallback = {
    'account.guest': 'Guest',
    'account.menu': '계정 및 설정',
    'account.user': 'Google 사용자',
    'auth.login': '로그인',
    'auth.logout': '로그아웃',
    'google.login': 'Google 계정 로그인',
    'google.logout': 'Google 계정 로그아웃',
    'google.connect_help': 'Google 계정으로 로그인합니다.',
    'google.logout_help': 'Google 계정에서 로그아웃합니다.',
    'google.login_wait': 'Google 로그인 중…',
    'google.connected': 'Google에 연결되었습니다.',
    'google.logout_done': 'Google 연결을 해제했습니다.',
    'google.login_fail_short': 'Google 로그인 실패',
    'google.client_id_missing': 'Google OAuth Client ID가 설정되지 않았습니다.',
    'editor.drive.login_required': 'Google 로그인이 필요합니다.',
    'editor.drive.loading_picker': 'Google Drive를 여는 중…',
    'editor.drive.load_title': 'Google Drive에서 프로젝트 불러오기',
    'editor.drive.load_fail': 'Google Drive 프로젝트를 불러오지 못했습니다.',
    'editor.drive.loaded': 'Google Drive에서 프로젝트를 불러왔습니다.',
    'editor.drive.save_name_prompt': 'Google Drive에 저장할 프로젝트 파일 이름을 입력하세요.',
    'editor.drive.save_fail': 'Google Drive에 프로젝트를 저장하지 못했습니다.',
    'editor.drive.saved': 'Google Drive에 프로젝트를 저장했습니다.',
    'editor.drive.overwrite': '{0} 파일이 이미 있습니다. 덮어쓸까요?',
    'editor.drive.unsupported': '모비바드 프로젝트 JSON 파일을 선택하세요.',
    'editor.drive.folder_fail': 'Google Drive 저장 폴더를 준비하지 못했습니다.',
  };
  let text = fallback[key] || key;
  return String(text).replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? '');
}

function editorApi() {
  return window.MMLEditor || window.Mobibard || null;
}

function showToast(message, tone = 'info') {
  const api = editorApi();
  if (api?.showToast) {
    api.showToast(String(message || ''));
    return;
  }
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = String(message || '');
  toast.classList.toggle('error', tone === 'error');
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

function closeFileMenu() {
  const api = editorApi();
  if (api?.closeFileMenu) return api.closeFileMenu();
  const menu = document.getElementById('fileMenu');
  const button = document.getElementById('fileButton');
  if (menu) menu.hidden = true;
  button?.setAttribute('aria-expanded', 'false');
}

function googleApiKey() {
  return String(GOOGLE_CONFIG.apiKey || GOOGLE_CONFIG.API_KEY || '').trim();
}

function googleAppId() {
  return String(GOOGLE_CONFIG.appId || GOOGLE_CONFIG.APP_ID || '').trim();
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureSignedIn() {
  if (isGoogleAccountConnected()) return getGoogleAccessToken();
  showToast(t('google.login_wait'));
  const token = await ensureGoogleAccessToken();
  await accountController?.refreshProfile?.(true);
  return token;
}

async function driveFetch(url, options = {}) {
  const token = getGoogleAccessToken() || await ensureSignedIn();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) throw new Error(t('editor.drive.login_required'));
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || '';
    } catch (_) {
      try { detail = await response.text(); } catch (_) {}
    }
    throw new Error(detail || `Google Drive HTTP ${response.status}`);
  }
  return response;
}

async function driveJson(url, options = {}) {
  const response = await driveFetch(url, options);
  if (response.status === 204) return {};
  return response.json();
}

function loadScript(url) {
  if (url.includes('apis.google.com/js/api.js') && window.gapi) return Promise.resolve();
  if (pickerScriptPromise) return pickerScriptPromise;
  pickerScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.gapi) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 12000) {
          window.clearInterval(timer);
          reject(new Error('Google API load timeout'));
        }
      }, 80);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google API load failed'));
    document.head.appendChild(script);
  }).catch(error => {
    pickerScriptPromise = null;
    throw error;
  });
  return pickerScriptPromise;
}

async function ensurePicker() {
  if (window.google?.picker) return;
  if (pickerPromise) return pickerPromise;
  pickerPromise = (async () => {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise((resolve, reject) => {
      if (!window.gapi?.load) {
        reject(new Error('Google API unavailable'));
        return;
      }
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Google Picker load failed')),
        timeout: 12000,
        ontimeout: () => reject(new Error('Google Picker load timeout')),
      });
    });
    if (!window.google?.picker) throw new Error('Google Picker unavailable');
  })().catch(error => {
    pickerPromise = null;
    throw error;
  });
  return pickerPromise;
}

async function pickProjectFile() {
  const token = await ensureSignedIn();
  const apiKey = googleApiKey();
  if (!apiKey) throw new Error('Google Picker API Key is not configured.');
  await ensurePicker();
  const picker = window.google.picker;
  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);
      if (typeof view.setMimeTypes === 'function') view.setMimeTypes('application/json,text/plain');
      const builder = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setTitle(t('editor.drive.load_title'))
        .setCallback(data => {
          const action = data?.[picker.Response.ACTION];
          if (action === picker.Action.CANCEL) {
            resolve(null);
            return;
          }
          if (action !== picker.Action.PICKED) return;
          const doc = data?.[picker.Response.DOCUMENTS]?.[0];
          const id = doc?.[picker.Document.ID] || '';
          const name = doc?.[picker.Document.NAME] || '';
          const mimeType = doc?.[picker.Document.MIME_TYPE] || '';
          resolve(id ? { id, name, mimeType } : null);
        });
      const appId = googleAppId();
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}

function normalizeProjectFileName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'mobibard-project';
  if (/\.mmlproj\.json$/i.test(cleaned)) return cleaned;
  if (/\.json$/i.test(cleaned)) return cleaned.replace(/\.json$/i, '.mmlproj.json');
  return `${cleaned}.mmlproj.json`;
}

async function findProjectFolder() {
  const q = [
    `mimeType = '${FOLDER_MIME}'`,
    `name = '${escapeDriveQuery(PROJECT_FOLDER_NAME)}'`,
    `'root' in parents`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({ q, spaces: 'drive', fields: 'files(id,name)', pageSize: '10' });
  const data = await driveJson(`${DRIVE_API}/files?${params}`);
  return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
}

async function ensureProjectFolder() {
  const found = await findProjectFolder();
  if (found?.id) return found;
  const created = await driveJson(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: PROJECT_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }),
  });
  if (!created?.id) throw new Error(t('editor.drive.folder_fail'));
  return created;
}

async function findProjectFile(folderId, fileName) {
  const q = [
    `'${escapeDriveQuery(folderId)}' in parents`,
    `name = '${escapeDriveQuery(fileName)}'`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({ q, spaces: 'drive', fields: 'files(id,name,mimeType)', pageSize: '10' });
  const data = await driveJson(`${DRIVE_API}/files?${params}`);
  return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
}

async function uploadProject({ folderId, fileName, content, overwriteId = '' }) {
  const boundary = `mobibard_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = overwriteId
    ? { name: fileName, mimeType: PROJECT_MIME }
    : { name: fileName, mimeType: PROJECT_MIME, parents: [folderId] };
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${PROJECT_MIME}; charset=UTF-8\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join('');
  const endpoint = overwriteId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(overwriteId)}?uploadType=multipart&fields=id,name,webViewLink`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`;
  return driveJson(endpoint, {
    method: overwriteId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function handleGoogleLoad() {
  if (busy) return;
  closeFileMenu();
  busy = true;
  try {
    showToast(t('editor.drive.loading_picker'));
    const picked = await pickProjectFile();
    if (!picked) return;
    const name = String(picked.name || 'project.mmlproj.json');
    if (!/\.(?:mmlproj\.)?json$/i.test(name)) {
      throw new Error(t('editor.drive.unsupported'));
    }
    const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(picked.id)}?alt=media&supportsAllDrives=true`);
    const text = await response.text();
    const file = new File([text], name, { type: PROJECT_MIME, lastModified: Date.now() });
    const api = editorApi();
    if (!api?.loadProjectFromFile) throw new Error('Editor API unavailable');
    await api.loadProjectFromFile(file, { notify: false });
    showToast(t('editor.drive.loaded'));
  } catch (error) {
    console.error('Editor Google Drive load failed', error);
    showToast(`${t('editor.drive.load_fail')}: ${String(error?.message || error)}`, 'error');
  } finally {
    busy = false;
  }
}

async function handleGoogleSave() {
  if (busy) return;
  closeFileMenu();
  busy = true;
  try {
    await ensureSignedIn();
    const api = editorApi();
    if (!api?.serializeProject) throw new Error('Editor API unavailable');
    api.shrinkTimelineToContent?.();
    const defaultName = normalizeProjectFileName(api.state?.projectName || 'mobibard-project');
    const entered = window.prompt(t('editor.drive.save_name_prompt'), defaultName);
    if (entered == null) return;
    const fileName = normalizeProjectFileName(entered);
    const folder = await ensureProjectFolder();
    const existing = await findProjectFile(folder.id, fileName);
    if (existing?.id && !window.confirm(t('editor.drive.overwrite', [fileName]))) return;
    const content = JSON.stringify(api.serializeProject(), null, 2);
    await uploadProject({ folderId: folder.id, fileName, content, overwriteId: existing?.id || '' });
    api.markProjectSaved?.({ notify: false });
    showToast(t('editor.drive.saved'));
  } catch (error) {
    console.error('Editor Google Drive save failed', error);
    showToast(`${t('editor.drive.save_fail')}: ${String(error?.message || error)}`, 'error');
  } finally {
    busy = false;
  }
}

function bindDriveButtons() {
  const open = document.getElementById('googleDriveOpenButton');
  const save = document.getElementById('googleDriveSaveButton');
  if (open && open.dataset.driveReady !== 'true') {
    open.dataset.driveReady = 'true';
    open.addEventListener('click', () => void handleGoogleLoad());
  }
  if (save && save.dataset.driveReady !== 'true') {
    save.dataset.driveReady = 'true';
    save.addEventListener('click', () => void handleGoogleSave());
  }
}

function initializeAccount() {
  if (accountController) return;
  accountController = initializeGoogleAccountMenu({
    t,
    notify: showToast,
    buttonId: 'themeButton',
    menuId: 'themeMenu',
    avatarId: 'themeIcon',
    avatarIds: ['accountAvatarImg'],
    nameId: 'accountMenuName',
    emailId: 'accountMenuEmail',
    loginButtonId: 'googleLoginButton',
  });
}

async function initialize() {
  try { await window.MobibardI18n?.ready; } catch (_) {}
  initializeAccount();
  bindDriveButtons();
  window.addEventListener('mobibard:localechange', () => accountController?.refreshText?.());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize(), { once: true });
} else {
  void initialize();
}
