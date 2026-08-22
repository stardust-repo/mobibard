(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const GOOGLE_CONFIG = window.MOBIBARD_GOOGLE_CONFIG || {};
  const GOOGLE_SCOPE = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.appdata"
  ].join(" ");
  const GOOGLE_API = "https://www.googleapis.com/drive/v3";
  const GOOGLE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
  const GOOGLE_FOLDER_NAME = "MML_Mobibard";
  const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
  const GOOGLE_TOKEN_KEY = "mobibard.player.googleTokenCache";
  const GUEST_AVATAR = "../assets/icons/guest-user.svg?v=5.1.0&rev=20260818-205217";
  const MOBIBEATS_URL = new URL("../mobibeats/", window.location.href).href;
  const MOBIBEATS_TARGET_ORIGIN = window.location.origin === "null" ? "*" : window.location.origin;

  const els = {
    midiSiteLinks: $("midiSiteLinks"),
    mobibeatsLink: $("mobibeatsLink"),
    rhythmGameLayer: $("simpleRhythmGameLayer"),
    rhythmGameClose: $("simpleRhythmGameClose"),
    rhythmGameFrame: $("simpleRhythmGameFrame"),
    rhythmGameStatus: $("simpleRhythmGameStatus"),
    rhythmGameLoading: $("simpleRhythmGameLoading"),
    rhythmGameLoadingText: $("simpleRhythmGameLoadingText"),
    rhythmGameLayerTitle: $("simpleRhythmGameLayerTitle"),
    fullEditorLink: $("fullEditorLink"),
    settingsButton: $("settingsButton"),
    settingsMenu: $("settingsMenu"),
    accountAvatar: $("accountAvatarImg"),
    accountName: $("accountMenuName"),
    accountEmail: $("accountMenuEmail"),
    googleLoginBtn: $("googleLoginBtn"),
    googleLoginLabel: $("googleLoginLabel"),
    googleFileButton: $("googleFileButton"),
    pasteButton: $("pasteButton"),
    pasteDialog: $("pasteDialog"),
    pasteForm: $("pasteForm"),
    pasteTitle: $("pasteDialogTitle"),
    pasteHint: $("pasteDialogHint"),
    pasteText: $("pasteText"),
    pasteClose: $("pasteDialogClose"),
    pasteCancel: $("pasteCancelButton"),
    pasteApply: $("pasteApplyButton"),
    rewindButton: $("rewindButton"),
    localSaveButton: $("localSaveAllButton"),
    googleSaveButton: $("googleSaveAllButton"),
    results: $("results")
  };

  const fallback = {
    ko: {
      recommended: "추천 사이트", mobibeats: "모비비트", account: "계정", guest: "게스트",
      login: "로그인", logout: "로그아웃", googleFile: "구글 파일", paste: "붙여넣기",
      pasteTitle: "MML 붙여넣기", pasteHint: "MML 코드를 붙여넣으면 바로 불러옵니다.",
      cancel: "취소", load: "불러오기", localSave: "로컬 저장", googleSave: "구글 저장",
      rewind: "처음으로", close: "닫기", loginRequired: "Google 로그인이 필요합니다.",
      googleConnecting: "Google 로그인 중...", googleConnected: "Google에 연결되었습니다.", googleDisconnected: "Google 연결을 해제했습니다.",
      googleLoginFailed: "Google 로그인에 실패했습니다.", googleLoadFailed: "Google 파일을 불러오지 못했습니다.",
      googleSaveFailed: "Google 저장에 실패했습니다.", savedLocal: "MML 파일을 저장했습니다.",
      savedGoogle: "Google Drive에 저장했습니다.", noMml: "먼저 MML을 생성해 주세요.",
      pasteEmpty: "붙여넣을 MML을 입력해 주세요.", pasteLoaded: "붙여넣은 MML을 불러왔습니다.",
      pastedName: "붙여넣은 MML", mobibeatsPreparing: "준비 중", mobibeatsLoading: "모비비트를 불러오는 중입니다.",
      mobibeatsReady: "준비되었습니다.", mobibeatsWaitReady: "모비비트의 준비 신호를 기다리고 있습니다.",
      mobibeatsSending: "현재 MML을 전달하는 중입니다.", mobibeatsLoadFail: "모비비트를 불러오지 못했습니다.",
      mobibeatsSendFail: "모비비트에 MML을 전달하지 못했습니다.", mobibeatsReturn: "생성기로 돌아가기"
    },
    en: {
      recommended: "Recommended", mobibeats: "MobiBeats", account: "Account", guest: "Guest",
      login: "Sign in", logout: "Sign out", googleFile: "Google file", paste: "Paste",
      pasteTitle: "Paste MML", pasteHint: "Paste MML code to load it immediately.",
      cancel: "Cancel", load: "Load", localSave: "Local save", googleSave: "Google save",
      rewind: "Back to start", close: "Close", loginRequired: "Google sign-in is required.",
      googleConnecting: "Signing in to Google...", googleConnected: "Connected to Google.", googleDisconnected: "Disconnected from Google.",
      googleLoginFailed: "Google sign-in failed.", googleLoadFailed: "Could not load the Google file.",
      googleSaveFailed: "Could not save to Google Drive.", savedLocal: "The MML file was saved.",
      savedGoogle: "Saved to Google Drive.", noMml: "Generate MML first.",
      pasteEmpty: "Enter MML to paste.", pasteLoaded: "The pasted MML was loaded.",
      pastedName: "Pasted MML", mobibeatsPreparing: "Preparing", mobibeatsLoading: "Loading MobiBeats.",
      mobibeatsReady: "Ready.", mobibeatsWaitReady: "Waiting for MobiBeats to become ready.",
      mobibeatsSending: "Sending the current MML.", mobibeatsLoadFail: "Could not load MobiBeats.",
      mobibeatsSendFail: "Could not send MML to MobiBeats.", mobibeatsReturn: "Return to generator"
    }
  };

  let currentLanguage = "en";
  let currentStrings = {};
  let googleAccessToken = "";
  let googleTokenExpiresAt = 0;
  let googleTokenClient = null;
  let googlePickerLoaded = false;
  let googleFolderId = "";
  let accountProfile = null;
  let rhythmGameFrameReady = false;
  let rhythmGamePendingPayload = null;
  let rhythmGamePayloadPending = false;
  let rhythmGameLoadTimer = 0;

  function bridge() {
    return window.MobibardSimpleBridge || null;
  }

  function languageKey(value = "") {
    const raw = String(value || "").toLowerCase();
    if (raw.startsWith("ko")) return "ko";
    if (raw.startsWith("ja")) return "ja";
    if (raw.includes("hant") || raw.includes("tw")) return "zh-TW";
    if (raw.startsWith("zh")) return "zh-CN";
    return "en";
  }

  function tx(key) {
    const fromLocale = currentStrings?.[key];
    if (fromLocale != null) return String(fromLocale);
    const base = fallback[currentLanguage] || fallback.en;
    return String(base?.[key] ?? fallback.en[key] ?? key);
  }

  function showToast(message, tone = "info") {
    bridge()?.showToast?.(String(message || ""), tone);
  }

  function shortError(error) {
    const message = String(error?.message || error || "Unknown error");
    return message.length > 180 ? `${message.slice(0, 180)}…` : message;
  }

  function updateStaticText() {
    const language = encodeURIComponent(currentLanguage);
    if (els.mobibeatsLink) {
      els.mobibeatsLink.textContent = tx("mobibeats");
      els.mobibeatsLink.setAttribute("aria-label", tx("mobibeats"));
      els.mobibeatsLink.title = tx("mobibeats");
    }
    if (els.rhythmGameLayerTitle) els.rhythmGameLayerTitle.textContent = tx("mobibeats");
    if (els.rhythmGameClose) els.rhythmGameClose.textContent = tx("mobibeatsReturn");
    if (els.rhythmGameLayer?.hidden && els.rhythmGameStatus) els.rhythmGameStatus.textContent = tx("mobibeatsPreparing");
    if (els.fullEditorLink) els.fullEditorLink.href = `../player/index.html?lang=${language}`;
    if (els.midiSiteLinks?.options?.[0]) els.midiSiteLinks.options[0].textContent = tx("recommended");
    if (els.midiSiteLinks) els.midiSiteLinks.setAttribute("aria-label", tx("recommended"));
    if (els.settingsButton) {
      els.settingsButton.setAttribute("aria-label", tx("account"));
      els.settingsButton.title = tx("account");
    }
    if (els.settingsMenu) els.settingsMenu.setAttribute("aria-label", tx("account"));
    if (els.googleFileButton) els.googleFileButton.textContent = tx("googleFile");
    if (els.pasteButton) els.pasteButton.textContent = tx("paste");
    if (els.localSaveButton) els.localSaveButton.textContent = tx("localSave");
    if (els.googleSaveButton) els.googleSaveButton.textContent = tx("googleSave");
    if (els.rewindButton) {
      els.rewindButton.setAttribute("aria-label", tx("rewind"));
      els.rewindButton.title = tx("rewind");
    }
    if (els.pasteTitle) els.pasteTitle.textContent = tx("pasteTitle");
    if (els.pasteHint) els.pasteHint.textContent = tx("pasteHint");
    if (els.pasteClose) {
      els.pasteClose.setAttribute("aria-label", tx("close"));
      els.pasteClose.title = tx("close");
    }
    if (els.pasteCancel) els.pasteCancel.textContent = tx("cancel");
    if (els.pasteApply) els.pasteApply.textContent = tx("load");
    updateAccountUi();
  }

  function updateSaveButtons() {
    const hasMml = Boolean(bridge()?.getCurrentMml?.());
    if (els.localSaveButton) els.localSaveButton.disabled = !hasMml;
    if (els.googleSaveButton) els.googleSaveButton.disabled = !hasMml;
  }

  function isGoogleConnected() {
    return Boolean(googleAccessToken && Number.isFinite(googleTokenExpiresAt) && Date.now() < googleTokenExpiresAt - 30000);
  }

  function readTokenCache() {
    try {
      const raw = localStorage.getItem(GOOGLE_TOKEN_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const token = String(data?.accessToken || data?.access_token || "");
      const expiresAt = Number(data?.expiresAt || data?.expires_at || 0);
      if (!token || !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 30000) {
        localStorage.removeItem(GOOGLE_TOKEN_KEY);
        return false;
      }
      googleAccessToken = token;
      googleTokenExpiresAt = expiresAt;
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveTokenCache(response = {}) {
    if (!isGoogleConnected()) return;
    try {
      localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify({
        accessToken: googleAccessToken,
        expiresAt: googleTokenExpiresAt,
        cachedAt: Date.now(),
        scope: String(response.scope || GOOGLE_SCOPE)
      }));
    } catch (_) {}
  }

  function clearTokenCache() {
    try { localStorage.removeItem(GOOGLE_TOKEN_KEY); } catch (_) {}
  }

  function updateAccountUi() {
    const connected = isGoogleConnected();
    if (els.settingsButton) els.settingsButton.dataset.connected = connected ? "true" : "false";
    if (els.accountName) els.accountName.textContent = connected ? (accountProfile?.name || accountProfile?.email || "Google") : tx("guest");
    if (els.accountEmail) {
      els.accountEmail.textContent = connected ? String(accountProfile?.email || "") : "";
      els.accountEmail.hidden = !connected || !accountProfile?.email;
    }
    if (els.accountAvatar) {
      els.accountAvatar.src = connected && accountProfile?.photo ? accountProfile.photo : GUEST_AVATAR;
    }
    if (els.googleLoginLabel) els.googleLoginLabel.textContent = connected ? tx("logout") : tx("login");
  }

  function waitFor(test, label, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (test()) { resolve(); return; }
        if (Date.now() - started >= timeout) { reject(new Error(`${label} unavailable`)); return; }
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  async function ensureGoogleIdentity() {
    await waitFor(() => Boolean(window.google?.accounts?.oauth2), "Google Identity");
  }

  async function ensureGooglePicker() {
    await waitFor(() => Boolean(window.gapi?.load), "Google Picker");
    if (googlePickerLoaded && window.google?.picker) return;
    await new Promise((resolve, reject) => {
      try {
        window.gapi.load("picker", {
          callback: () => { googlePickerLoaded = true; resolve(); },
          onerror: () => reject(new Error("Google Picker load failed")),
          timeout: 10000,
          ontimeout: () => reject(new Error("Google Picker load timed out"))
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function requestGoogleAccessToken() {
    if (isGoogleConnected() || readTokenCache()) return googleAccessToken;
    const clientId = String(GOOGLE_CONFIG.clientId || "");
    if (!clientId) throw new Error("Google client ID is missing");
    await ensureGoogleIdentity();
    return new Promise((resolve, reject) => {
      try {
        if (!googleTokenClient) {
          googleTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_SCOPE,
            include_granted_scopes: true,
            callback: () => {}
          });
        }
        googleTokenClient.callback = response => {
          if (!response || response.error) {
            reject(new Error(response?.error_description || response?.error || tx("googleLoginFailed")));
            return;
          }
          googleAccessToken = String(response.access_token || "");
          googleTokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000;
          saveTokenCache(response);
          updateAccountUi();
          void loadGoogleProfile();
          resolve(googleAccessToken);
        };
        googleTokenClient.requestAccessToken({ prompt: "select_account" });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function ensureGoogleSession() {
    if (isGoogleConnected() || readTokenCache()) {
      updateAccountUi();
      return googleAccessToken;
    }
    return requestGoogleAccessToken();
  }

  async function googleFetch(url, options = {}) {
    const token = await ensureGoogleSession();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      googleAccessToken = "";
      googleTokenExpiresAt = 0;
      clearTokenCache();
      updateAccountUi();
      throw new Error(tx("loginRequired"));
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `${response.status} ${response.statusText}`);
    }
    return response;
  }

  async function loadGoogleProfile() {
    if (!isGoogleConnected()) return;
    try {
      const response = await googleFetch(`${GOOGLE_API}/about?fields=user(displayName,emailAddress,photoLink)`);
      const data = await response.json();
      accountProfile = {
        name: String(data?.user?.displayName || ""),
        email: String(data?.user?.emailAddress || ""),
        photo: String(data?.user?.photoLink || "")
      };
      updateAccountUi();
    } catch (_) {}
  }

  async function handleGoogleLogin() {
    if (isGoogleConnected()) {
      const token = googleAccessToken;
      googleAccessToken = "";
      googleTokenExpiresAt = 0;
      googleFolderId = "";
      accountProfile = null;
      clearTokenCache();
      try { window.google?.accounts?.oauth2?.revoke?.(token, () => {}); } catch (_) {}
      updateAccountUi();
      showToast(tx("googleDisconnected"), "info");
      return;
    }
    try {
      showToast(tx("googleConnecting"), "info");
      await requestGoogleAccessToken();
      await loadGoogleProfile();
      updateAccountUi();
      showToast(tx("googleConnected"), "success");
    } catch (error) {
      showToast(`${tx("googleLoginFailed")} ${shortError(error)}`, "error");
    }
  }

  function pickerDocument(data) {
    const picker = window.google?.picker;
    if (!picker) return null;
    const docs = data?.[picker.Response.DOCUMENTS] || [];
    return docs[0] || null;
  }

  async function handlePickerResult(data) {
    const picker = window.google?.picker;
    if (!picker) return;
    const action = data?.[picker.Response.ACTION];
    if (action !== picker.Action.PICKED) return;
    const doc = pickerDocument(data);
    const id = String(doc?.[picker.Document.ID] || "");
    if (!id) return;
    try {
      const metaResponse = await googleFetch(`${GOOGLE_API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size`);
      const meta = await metaResponse.json();
      const mimeType = String(meta?.mimeType || "application/octet-stream");
      if (mimeType.startsWith("application/vnd.google-apps.")) throw new Error("Google document files are not supported");
      const mediaResponse = await googleFetch(`${GOOGLE_API}/files/${encodeURIComponent(id)}?alt=media`);
      const bytes = await mediaResponse.arrayBuffer();
      const name = String(meta?.name || doc?.[picker.Document.NAME] || "music.mid");
      if (/\.(?:mml|txt)$/i.test(name)) {
        const value = new TextDecoder().decode(bytes);
        bridge()?.loadPastedMml?.(value, name);
      } else {
        const file = new File([bytes], name, { type: mimeType });
        await bridge()?.selectFile?.(file);
      }
    } catch (error) {
      showToast(`${tx("googleLoadFailed")} ${shortError(error)}`, "error");
    }
  }

  async function openGoogleFilePicker() {
    try {
      await ensureGoogleSession();
      if (!GOOGLE_CONFIG.apiKey) throw new Error("Google API key is missing");
      await ensureGooglePicker();
      const picker = window.google.picker;
      const view = new picker.DocsView(picker.ViewId.DOCS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      const builder = new picker.PickerBuilder()
        .setDeveloperKey(String(GOOGLE_CONFIG.apiKey))
        .setOAuthToken(googleAccessToken)
        .setTitle(tx("googleFile"))
        .addView(view)
        .setCallback(data => void handlePickerResult(data));
      if (GOOGLE_CONFIG.appId) builder.setAppId(String(GOOGLE_CONFIG.appId));
      builder.build().setVisible(true);
    } catch (error) {
      showToast(`${tx("googleLoadFailed")} ${shortError(error)}`, "error");
    }
  }

  function escapeDriveQuery(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  async function ensureGoogleFolder() {
    if (googleFolderId) return googleFolderId;
    const q = [
      `name = '${escapeDriveQuery(GOOGLE_FOLDER_NAME)}'`,
      `mimeType = '${GOOGLE_FOLDER_MIME}'`,
      "trashed = false"
    ].join(" and ");
    const query = new URLSearchParams({ q, spaces: "drive", fields: "files(id,name)", pageSize: "10" });
    const response = await googleFetch(`${GOOGLE_API}/files?${query}`);
    const data = await response.json();
    const found = Array.isArray(data?.files) ? data.files[0] : null;
    if (found?.id) {
      googleFolderId = String(found.id);
      return googleFolderId;
    }
    const create = await googleFetch(`${GOOGLE_API}/files?fields=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: GOOGLE_FOLDER_NAME, mimeType: GOOGLE_FOLDER_MIME })
    });
    const folder = await create.json();
    googleFolderId = String(folder?.id || "");
    if (!googleFolderId) throw new Error("Could not create the Drive folder");
    return googleFolderId;
  }

  function normalizedSaveName() {
    const suggested = bridge()?.getSuggestedName?.() || "mobibard-simple.txt";
    const clean = String(suggested).replace(/[\\/:*?"<>|]+/g, "_").trim() || "mobibard-simple.txt";
    return /\.txt$/i.test(clean) ? clean : `${clean.replace(/\.[^.]+$/, "")}.txt`;
  }

  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveLocal() {
    const mml = String(bridge()?.getCurrentMml?.() || "");
    if (!mml) { showToast(tx("noMml"), "error"); return; }
    downloadText(normalizedSaveName(), mml);
    showToast(tx("savedLocal"), "success");
  }

  async function saveGoogle() {
    const mml = String(bridge()?.getCurrentMml?.() || "");
    if (!mml) { showToast(tx("noMml"), "error"); return; }
    try {
      const folderId = await ensureGoogleFolder();
      const boundary = `mobibard_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const metadata = { name: normalizedSaveName(), mimeType: "text/plain", parents: [folderId] };
      const body = [
        `--${boundary}\r\n`,
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\n`,
        "Content-Type: text/plain; charset=UTF-8\r\n\r\n",
        mml,
        `\r\n--${boundary}--`
      ].join("");
      await googleFetch(`${GOOGLE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      });
      showToast(tx("savedGoogle"), "success");
    } catch (error) {
      showToast(`${tx("googleSaveFailed")} ${shortError(error)}`, "error");
    }
  }

  async function openPasteDialog() {
    if (!els.pasteDialog?.showModal) return;
    els.pasteText.value = "";
    els.pasteDialog.showModal();
    requestAnimationFrame(() => els.pasteText?.focus());
    try {
      if (navigator.clipboard?.readText) {
        const clipboard = await navigator.clipboard.readText();
        if (!els.pasteText.value && String(clipboard || "").trim()) {
          els.pasteText.value = clipboard;
          els.pasteText.select();
        }
      }
    } catch (_) {}
  }

  function closePasteDialog() {
    try { els.pasteDialog?.close(); } catch (_) {}
  }

  function applyPaste(event) {
    event?.preventDefault?.();
    const value = String(els.pasteText?.value || "");
    if (!value.trim()) {
      showToast(tx("pasteEmpty"), "error");
      els.pasteText?.focus();
      return;
    }
    try {
      bridge()?.loadPastedMml?.(value, tx("pastedName"));
      closePasteDialog();
    } catch (error) {
      showToast(shortError(error), "error");
    }
  }


  function rhythmGameTitle() {
    const suggested = String(bridge()?.getSuggestedName?.() || "").replace(/\.(txt|mml)$/i, "").replace(/[_-]+/g, " ").trim();
    return suggested || tx("mobibeats");
  }

  function buildRhythmGamePayload() {
    const mml = String(bridge()?.getCurrentMml?.() || "").trim();
    if (!mml) throw new Error(tx("noMml"));
    let channelCount = 0;
    try {
      const parsed = window.MabiMml?.parseMabinogiMml?.(mml);
      channelCount = (parsed?.parts || []).filter(part => (part?.notes || []).some(note => Number(note?.volume ?? 8) > 0)).length;
    } catch (_) {}
    return {
      title: rhythmGameTitle(),
      mml,
      instruments: Array(6).fill("0:0"),
      channelCount
    };
  }

  function setRhythmGameLoading(message, mode = "loading") {
    if (els.rhythmGameLoadingText) els.rhythmGameLoadingText.textContent = message;
    if (els.rhythmGameLoading) {
      els.rhythmGameLoading.hidden = false;
      els.rhythmGameLoading.dataset.mode = mode;
    }
    if (els.rhythmGameStatus) els.rhythmGameStatus.textContent = message;
  }

  function hideRhythmGameLoading(message = tx("mobibeatsReady")) {
    if (els.rhythmGameLoading) els.rhythmGameLoading.hidden = true;
    if (els.rhythmGameStatus) els.rhythmGameStatus.textContent = message;
  }

  function clearRhythmGameLoadTimer() {
    if (!rhythmGameLoadTimer) return;
    window.clearTimeout(rhythmGameLoadTimer);
    rhythmGameLoadTimer = 0;
  }

  function startRhythmGameLoadTimer(stage = "ready_timeout") {
    clearRhythmGameLoadTimer();
    rhythmGameLoadTimer = window.setTimeout(() => {
      if (els.rhythmGameLayer?.hidden) return;
      const timedOut = stage === "ready_timeout" ? !rhythmGameFrameReady : rhythmGameFrameReady && rhythmGamePayloadPending;
      if (!timedOut) return;
      rhythmGamePayloadPending = false;
      setRhythmGameLoading(stage === "payload_timeout" ? tx("mobibeatsSendFail") : tx("mobibeatsLoadFail"), "error");
    }, 10000);
  }

  function sendRhythmGamePayload() {
    if (!rhythmGameFrameReady || !rhythmGamePendingPayload || !els.rhythmGameFrame?.contentWindow) return;
    setRhythmGameLoading(tx("mobibeatsSending"));
    rhythmGamePayloadPending = true;
    els.rhythmGameFrame.contentWindow.postMessage({ type: "MML_RHYTHM_LOAD", payload: rhythmGamePendingPayload }, MOBIBEATS_TARGET_ORIGIN);
    startRhythmGameLoadTimer("payload_timeout");
  }

  function openRhythmGameLayer() {
    if (!els.rhythmGameLayer || !els.rhythmGameFrame) return;
    try {
      rhythmGamePendingPayload = buildRhythmGamePayload();
    } catch (error) {
      showToast(shortError(error), "error");
      return;
    }
    bridge()?.stopPlayback?.();
    els.rhythmGameLayer.hidden = false;
    els.rhythmGameLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("simple-rhythm-game-open");
    setRhythmGameLoading(tx("mobibeatsLoading"));
    const currentUrl = String(els.rhythmGameFrame.getAttribute("src") || "");
    if (!rhythmGameFrameReady || currentUrl === "about:blank") {
      rhythmGameFrameReady = false;
      els.rhythmGameFrame.src = MOBIBEATS_URL;
      startRhythmGameLoadTimer();
    } else {
      sendRhythmGamePayload();
    }
    requestAnimationFrame(() => els.rhythmGameClose?.focus());
  }

  function closeRhythmGameLayer() {
    if (!els.rhythmGameLayer || els.rhythmGameLayer.hidden) return;
    try { els.rhythmGameFrame?.contentWindow?.MobiBeats?.pause?.(); } catch (_) {}
    clearRhythmGameLoadTimer();
    rhythmGamePayloadPending = false;
    rhythmGamePendingPayload = null;
    els.rhythmGameLayer.hidden = true;
    els.rhythmGameLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("simple-rhythm-game-open");
    if (els.rhythmGameStatus) els.rhythmGameStatus.textContent = tx("mobibeatsPreparing");
    els.mobibeatsLink?.focus();
  }

  function handleRhythmGameFrameLoad() {
    const loadedUrl = String(els.rhythmGameFrame?.getAttribute("src") || "");
    if (!loadedUrl || loadedUrl === "about:blank" || rhythmGameFrameReady) return;
    if (!els.rhythmGameLayer?.hidden) {
      setRhythmGameLoading(tx("mobibeatsWaitReady"));
      startRhythmGameLoadTimer();
    }
  }

  function isTrustedRhythmGameMessage(event) {
    if (!els.rhythmGameFrame?.contentWindow || event.source !== els.rhythmGameFrame.contentWindow) return false;
    if (window.location.origin === "null") return event.origin === "null";
    return event.origin === window.location.origin;
  }

  function handleRhythmGameMessage(event) {
    if (!isTrustedRhythmGameMessage(event)) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "MML_RHYTHM_READY") {
      rhythmGameFrameReady = true;
      clearRhythmGameLoadTimer();
      if (!els.rhythmGameLayer?.hidden && rhythmGamePendingPayload) sendRhythmGamePayload();
      return;
    }
    if (data.type === "MML_RHYTHM_LOADED") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      hideRhythmGameLoading();
      try { els.rhythmGameFrame.contentWindow.focus(); } catch (_) {}
      return;
    }
    if (data.type === "MML_RHYTHM_ERROR") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      setRhythmGameLoading(String(data.message || data.payload?.message || tx("mobibeatsSendFail")), "error");
      return;
    }
    if (data.type === "MML_RHYTHM_CLOSE") closeRhythmGameLayer();
  }

  els.midiSiteLinks?.addEventListener("change", () => {
    const url = String(els.midiSiteLinks.value || "");
    els.midiSiteLinks.value = "";
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  els.googleLoginBtn?.addEventListener("click", () => void handleGoogleLogin());
  els.googleFileButton?.addEventListener("click", event => { event.stopPropagation(); void openGoogleFilePicker(); });
  els.pasteButton?.addEventListener("click", event => { event.stopPropagation(); void openPasteDialog(); });
  els.pasteClose?.addEventListener("click", closePasteDialog);
  els.pasteCancel?.addEventListener("click", closePasteDialog);
  els.pasteForm?.addEventListener("submit", applyPaste);
  els.localSaveButton?.addEventListener("click", saveLocal);
  els.googleSaveButton?.addEventListener("click", () => void saveGoogle());
  els.mobibeatsLink?.addEventListener("click", openRhythmGameLayer);
  els.rhythmGameClose?.addEventListener("click", closeRhythmGameLayer);
  els.rhythmGameFrame?.addEventListener("load", handleRhythmGameFrameLoad);
  window.addEventListener("message", handleRhythmGameMessage);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !els.rhythmGameLayer?.hidden) {
      event.preventDefault();
      closeRhythmGameLayer();
    }
  });

  window.addEventListener("mobibard:simple-localechange", event => {
    currentLanguage = languageKey(event.detail?.language || document.documentElement.lang);
    currentStrings = event.detail?.strings || {};
    updateStaticText();
  });
  window.addEventListener("mobibard:simple-ready", updateSaveButtons);

  if (els.results) {
    new MutationObserver(updateSaveButtons).observe(els.results, { attributes: true, attributeFilter: ["hidden"] });
  }

  currentLanguage = languageKey(bridge()?.getLanguage?.() || document.documentElement.lang);
  readTokenCache();
  updateStaticText();
  updateSaveButtons();
  if (isGoogleConnected()) void loadGoogleProfile();
})();
