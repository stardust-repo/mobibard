(() => {
  "use strict";
  // MobiBard shared SoundFont list ("sound stack").
  // One list per browser origin, shared by every MobiBard product:
  //   - the bundled MobiBard sound is always last and can never be removed;
  //   - user fonts sit above it, the top entry has the highest priority;
  //   - when a font has no matching instrument the next font is asked;
  //   - when no font matches, each product keeps its existing default handling.
  const DB_NAME = "mobibard-soundstack";
  const STORE = "banks";
  const ORDER_KEY = "mobibard.soundstack.order.v1";
  const REV_KEY = "mobibard.soundstack.rev.v1";
  const CHANNEL = "mobibard-soundstack";
  const LANG_KEY = "mobibard.player.language";
  const LANGS = ["ko", "ja", "en", "zh-CN", "zh-TW"];

  const STR = {
    ko: { button: "사운드폰트", title: "사운드폰트", add: "추가하기", reset: "리셋", def: "모비바드 기본 음색", defTag: "기본", remove: "삭제", up: "위로", down: "아래로", hint: "위쪽 사운드폰트부터 우선 적용됩니다.", compat: "호환", empty: "추가한 사운드폰트가 없습니다.", close: "닫기", reading: "읽는 중…", failed: "불러오지 못했습니다", tryTitle: "모비바드 호환 시도", tryMsg: "파일에 'MobiBard'가 있지만 호환 표시는 없습니다. 모비바드 악기 배치(프리셋 0~14)로 시도해 볼까요?", tryYes: "호환 시도", tryNo: "그대로 추가", download: "다운로드", sf3: "SF3", dls: "DLS", license: "라이선스", guide: "호환 방법", forced: "호환 시도", confirmRemove: "이 사운드폰트를 삭제할까요?" },
    en: { button: "SoundFont", title: "SoundFont", add: "Add", reset: "Reset", def: "MobiBard default sound", defTag: "Default", remove: "Remove", up: "Move up", down: "Move down", hint: "Fonts at the top take priority.", compat: "Compatible", empty: "No SoundFonts added.", close: "Close", reading: "Reading…", failed: "Could not load", tryTitle: "Try MobiBard compatibility", tryMsg: "The file mentions 'MobiBard' but has no compatibility marker. Try MobiBard's instrument layout (presets 0-14)?", tryYes: "Try it", tryNo: "Add as is", download: "Download", sf3: "SF3", dls: "DLS", license: "License", guide: "How to make compatible", forced: "compat. tried", confirmRemove: "Remove this SoundFont?" },
    ja: { button: "サウンドフォント", title: "サウンドフォント", add: "追加", reset: "リセット", def: "モビバード標準音色", defTag: "標準", remove: "削除", up: "上へ", down: "下へ", hint: "上のサウンドフォントが優先されます。", compat: "互換", empty: "追加したサウンドフォントはありません。", close: "閉じる", reading: "読み込み中…", failed: "読み込めませんでした", tryTitle: "モビバード互換を試す", tryMsg: "ファイルに「MobiBard」がありますが互換マーカーがありません。モビバードの楽器配置(プリセット0〜14)で試しますか?", tryYes: "試す", tryNo: "そのまま追加", download: "ダウンロード", sf3: "SF3", dls: "DLS", license: "ライセンス", guide: "互換方法", forced: "互換を試行", confirmRemove: "このサウンドフォントを削除しますか?" },
    "zh-CN": { button: "音色库", title: "音色库", add: "添加", reset: "重置", def: "MobiBard 默认音色", defTag: "默认", remove: "删除", up: "上移", down: "下移", hint: "靠上的音色库优先。", compat: "兼容", empty: "尚未添加音色库。", close: "关闭", reading: "读取中…", failed: "无法加载", tryTitle: "尝试 MobiBard 兼容", tryMsg: "文件中含有「MobiBard」但没有兼容标记。要尝试用 MobiBard 的乐器布局(预设 0-14)吗？", tryYes: "尝试", tryNo: "直接添加", download: "下载", sf3: "SF3", dls: "DLS", license: "许可证", guide: "兼容方法", forced: "已尝试兼容", confirmRemove: "要删除这个音色库吗？" },
    "zh-TW": { button: "音色庫", title: "音色庫", add: "新增", reset: "重設", def: "MobiBard 預設音色", defTag: "預設", remove: "刪除", up: "上移", down: "下移", hint: "靠上的音色庫優先。", compat: "相容", empty: "尚未新增音色庫。", close: "關閉", reading: "讀取中…", failed: "無法載入", tryTitle: "嘗試 MobiBard 相容", tryMsg: "檔案中含有「MobiBard」但沒有相容標記。要嘗試用 MobiBard 的樂器配置(預設 0-14)嗎？", tryYes: "嘗試", tryNo: "直接新增", download: "下載", sf3: "SF3", dls: "DLS", license: "授權", guide: "相容方法", forced: "已嘗試相容", confirmRemove: "要刪除這個音色庫嗎？" },
  };

  function normLang(v) {
    const s = String(v || "").trim();
    if (LANGS.includes(s)) return s;
    const l = s.toLowerCase();
    if (l.startsWith("zh-tw") || l.startsWith("zh-hant") || l === "zh-hk") return "zh-TW";
    if (l.startsWith("zh")) return "zh-CN";
    const b = l.split("-")[0];
    return LANGS.includes(b) ? b : "";
  }
  function lang() {
    let saved = "";
    try { saved = localStorage.getItem(LANG_KEY) || ""; } catch (_) {}
    return normLang(document.documentElement.lang) || normLang(saved) || normLang(navigator.language) || "en";
  }
  const t = (k) => (STR[lang()] || STR.en)[k] ?? STR.en[k] ?? k;

  // ---------------------------------------------------------------- storage
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }
  async function tx(mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let result;
        try { result = fn(store); } catch (e) { reject(e); return; }
        transaction.oncomplete = () => resolve(result && "result" in result ? result.result : result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }
  const DEFAULT_ID = "default";
  const DEFAULT_OFF_KEY = "mobibard.soundstack.defaultOff.v1";
  function isDefaultOff() { try { return localStorage.getItem(DEFAULT_OFF_KEY) === "1"; } catch (_) { return false; } }
  function setDefaultOffFlag(off) { try { if (off) localStorage.setItem(DEFAULT_OFF_KEY, "1"); else localStorage.removeItem(DEFAULT_OFF_KEY); } catch (_) {} }
  // Saved order (user font ids and "default"); unknown ids are dropped, missing ones appended,
  // and the bundled MobiBard sound defaults to the last place.
  function fullOrder(userIds) {
    const order = readOrder().filter((id) => id === DEFAULT_ID || userIds.includes(id));
    for (const id of userIds) if (!order.includes(id)) order.push(id);
    if (!order.includes(DEFAULT_ID)) order.push(DEFAULT_ID);
    return order.filter((id, i) => order.indexOf(id) === i);
  }
  function readOrder() {
    try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch (_) { return []; }
  }
  function writeOrder(order) {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (_) {}
  }
  function bumpRev() {
    const rev = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem(REV_KEY, rev); } catch (_) {}
    try { channel?.postMessage({ rev }); } catch (_) {}
    return rev;
  }

  // ---------------------------------------------------- audio pause while busy
  // Parsing a newly added font blocks the page for a moment. Instead of letting the song stutter,
  // every running AudioContext of the page is paused while the list is rebuilt and resumed once the
  // products have switched to the new sound.
  const trackedContexts = new Set();
  function registerAudioContext(ctx) { if (ctx && typeof ctx.suspend === "function") trackedContexts.add(ctx); return ctx; }
  try {
    const Native = window.AudioContext;
    if (typeof Native === "function" && !Native.__sbsTracked) {
      const Tracked = class extends Native { constructor(...args) { super(...args); registerAudioContext(this); } };
      Object.defineProperty(Tracked, "name", { value: "AudioContext" });
      Tracked.__sbsTracked = true;
      window.AudioContext = Tracked;
    }
  } catch (_) {}
  async function pauseAudio() {
    const paused = [];
    for (const ctx of trackedContexts) {
      if (ctx.state === "closed") { trackedContexts.delete(ctx); continue; }
      if (ctx.state !== "running") continue;
      try { await ctx.suspend(); paused.push(ctx); } catch (_) {}
    }
    return paused;
  }
  function resumeAudio(paused) {
    for (const ctx of paused || []) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); }
  }

  let channel = null;
  try { channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null; } catch (_) {}

  // ------------------------------------------------------------------ state
  const state = { banks: [], items: [], entries: [], bankById: new Map(), defaultActive: true, loaded: false, loading: null, listeners: new Set() };

  async function listEntries() {
    const all = await tx("readonly", (store) => { const r = store.getAll(); return { get result() { return r.result; } }; });
    const byId = new Map((all || []).map((e) => [e.id, e]));
    const order = readOrder().filter((id) => byId.has(id));
    for (const id of byId.keys()) if (!order.includes(id)) order.push(id);
    return order.map((id) => byId.get(id));
  }

  async function waitForParser() {
    for (let i = 0; i < 200 && !window.MabiSoundBank?.parseSoundBank; i++) await new Promise((r) => setTimeout(r, 50));
  }
  // Portable font identity stored in projects: derived from file name + size, never the random id.
  function fontKeyOf(e) { return "u~" + encodeURIComponent(String(e.name || "")) + "~" + Number(e.size || 0); }
  // Parsed fonts are kept between changes: reordering / toggling never re-parses, adding parses only the new file.
  const parseCache = new Map(); // id -> { sig, bank, mention }
  let parseSerial = 0;
  let lastNotifiedSig = null;
  async function reload() {
    await waitForParser();
    let entries = [];
    try { entries = await listEntries(); } catch (_) { entries = []; }
    const api = window.MabiSoundBank;
    const banks = [];
    const parsedById = new Map();
    const mentionById = new Map();
    const sigOf = (entry) => `${entry.size}|${entry.forceCompat ? 1 : 0}|${entry.addedAt || 0}`;
    const needParse = entries.some((entry) => parseCache.get(entry.id)?.sig !== sigOf(entry));
    const paused = needParse && state.loaded ? await pauseAudio() : [];
    for (const id of Array.from(parseCache.keys())) if (!entries.some((entry) => entry.id === id)) parseCache.delete(id);
    for (const entry of entries) {
      const cached = parseCache.get(entry.id);
      if (cached && cached.sig === sigOf(entry)) {
        parsedById.set(entry.id, cached.bank);
        mentionById.set(entry.id, cached.mention);
        continue;
      }
      try {
        if (!api?.parseSoundBank) throw new Error("parser unavailable");
        const raw = new Uint8Array(entry.bytes);
        const bank = await api.parseSoundBank(raw);
        let mention = false;
        try { mention = !entry.forceCompat && !bank.isMobibardCompatible && Boolean(api.needsCompatPrompt?.(bank, entry.name, raw)); } catch (_) {}
        mentionById.set(entry.id, mention);
        if (entry.forceCompat && !bank.isMobibardCompatible) api.applyForcedCompat?.(bank, entry.name, entry.size, false);
        bank.stackId = entry.id;
        bank.stackName = entry.name;
        parsedById.set(entry.id, bank);
        bank.__sbsSerial = ++parseSerial;
        parseCache.set(entry.id, { sig: sigOf(entry), bank, mention });
      } catch (error) { console.warn("[MobiBard] SoundFont list entry failed", entry?.name, error); }
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    const order = fullOrder(entries.map((e) => e.id));
    state.items = [];
    state.entries = [];
    const defaultOff = isDefaultOff();
    state.defaultActive = !defaultOff;
    for (const id of order) {
      if (id === DEFAULT_ID) {
        if (!defaultOff) state.items.push({ id, bank: null });
        state.entries.push({ id, key: "default", isDefault: true, disabled: defaultOff, compat: true });
      } else if (parsedById.has(id)) {
        const e = byId.get(id);
        banks.push(parsedById.get(id));
        state.items.push({ id, bank: parsedById.get(id) });
        state.entries.push({ id, key: fontKeyOf(e), name: e.name, size: e.size, forceCompat: !!e.forceCompat, compat: !!parsedById.get(id).isMobibardCompatible, mention: mentionById.get(id) === true, asked: !!e.compatAsked });
      }
    }
    state.banks = banks;
    state.bankById = parsedById;
    state.loaded = true;
    // Tell the products only when the effective list really changed (opening the popup or a
    // re-read with the same content must not make them rebuild / restart their playback).
    const listSig = state.entries.map((e) => `${e.id}:${e.disabled ? 1 : 0}:${e.compat ? 1 : 0}:${e.isDefault ? 0 : (state.bankById.get(e.id)?.__sbsSerial || 0)}`).join("|");
    const changed = listSig !== lastNotifiedSig;
    lastNotifiedSig = listSig;
    const results = [];
    if (changed) for (const cb of Array.from(state.listeners)) { try { results.push(cb(banks.slice())); } catch (_) {} }
    if (paused.length) {
      // Let the products restart on the new sound (bounded wait), then continue the music.
      await Promise.race([Promise.allSettled(results), new Promise((r) => setTimeout(r, 4000))]);
      await new Promise((r) => setTimeout(r, 60));
      resumeAudio(paused);
    }
    return banks;
  }
  function load() {
    if (!state.loading) state.loading = reload().finally(() => { state.loading = null; });
    return state.loading;
  }
  function ready() { return state.loaded && !state.loading ? Promise.resolve(state.banks) : load(); }
  function onChange(cb) { state.listeners.add(cb); return () => state.listeners.delete(cb); }

  if (channel) channel.onmessage = () => { void load(); };
  window.addEventListener("storage", (e) => { if (e.key === REV_KEY || e.key === ORDER_KEY) void load(); });

  async function addFile(file, { forceCompat = false } = {}) {
    const bytes = await file.arrayBuffer();
    const id = "sb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await tx("readwrite", (store) => store.put({ id, name: String(file.name || "SoundBank"), size: bytes.byteLength, forceCompat: !!forceCompat, addedAt: Date.now(), bytes }));
    writeOrder([id, ...state.entries.map((e) => e.id).filter((x) => x !== id)]);
    bumpRev();
    return load();
  }
  // Remember the user's answer to "try MobiBard compatibility" for a font.
  async function setForceCompat(id, force) {
    await tx("readwrite", (store) => {
      const r = store.get(id);
      r.onsuccess = () => { const v = r.result; if (v) { v.forceCompat = !!force; v.compatAsked = true; store.put(v); } };
      return r;
    });
    bumpRev();
    return load();
  }
  async function remove(id) {
    await tx("readwrite", (store) => store.delete(id));
    writeOrder(state.entries.map((e) => e.id).filter((x) => x !== id));
    bumpRev();
    return load();
  }
  // Back to the initial state: only the bundled MobiBard sound remains.
  async function resetAll() {
    await tx("readwrite", (store) => store.clear());
    writeOrder([DEFAULT_ID]);
    setDefaultOffFlag(false);
    bumpRev();
    return load();
  }
  async function setDefaultActive(active) {
    setDefaultOffFlag(!active);
    bumpRev();
    return load();
  }
  async function move(id, delta) {
    const order = state.entries.map((e) => e.id);
    const i = order.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    writeOrder(order);
    bumpRev();
    return load();
  }

  // Ordered font list for products that show instrument menus (stack order, disabled default included).
  function fontList() {
    return state.entries.map((e) => ({
      key: e.key, id: e.id, isDefault: !!e.isDefault, disabled: !!e.disabled, compat: !!e.compat,
      name: e.isDefault ? defaultLabel() : e.name,
      bank: e.isDefault ? null : (state.bankById.get(e.id) || null),
    }));
  }
  // The first active font drives the "main" behaviour (MobiBard mapping or plain MIDI).
  function mainFont() { return fontList().find((f) => !f.disabled && (f.isDefault || f.bank)) || null; }
  function bankForKey(key) { const f = fontList().find((x) => x.key === key); return f && !f.disabled ? f.bank : null; }

  // ------------------------------------------------------------- resolution
  // Representative GM program per MobiBard target, used only for fonts that are
  // NOT MobiBard-compatible (plain GM numbering) when a product asks for a
  // MobiBard target such as "Violin".
  const TARGET_PROGRAM = { piano: 0, chalumeau: 71, flute: 73, harp: 46, lute: 24, mandolin: 105, violin: 40, xylophone: 13, musicBox: 10, guitar: 25, harmonica: 22, vocal: 53, gramophone: 0 };
  const TARGET_DRUM_NOTE = { drum: 38, metal: 42 };

  function findPreset(bank, bankNo, num) {
    const presets = Array.isArray(bank?.presets) ? bank.presets : [];
    return presets.find((p) => Number(p.bank) === bankNo && Number(p.preset) === num) || null;
  }
  function drumKitHasKey(preset, key) {
    const regions = preset?.regions;
    if (!Array.isArray(regions) || !Number.isFinite(key)) return true;
    return regions.some((r) => {
      const kr = Array.isArray(r.keyRange) ? r.keyRange : [0, 127];
      const lo = Number(kr[0]), hi = Number(kr[1]);
      return key >= lo && key <= hi;
    });
  }

  // req: { program, bankMsb, bankLsb, isDrum, midi, instrumentName, targetPreset }
  // returns { soundBank, preset, isDrum } or null (caller keeps its default path)
  function pick(req = {}) {
    const banks = state.banks;
    if (!banks.length) return null;
    const mapper = window.MobibardDefaultInstrumentMap;
    const isDrum = Boolean(req.isDrum);
    const targetPreset = Number.isFinite(Number(req.targetPreset)) ? Math.trunc(Number(req.targetPreset)) : null;
    const msb = Math.max(0, Math.min(127, Math.trunc(Number(req.bankMsb) || 0)));
    const lsb = Math.max(0, Math.min(127, Math.trunc(Number(req.bankLsb) || 0)));
    const program = Math.max(0, Math.min(127, Math.trunc(Number(req.program) || 0)));
    const midi = Number.isFinite(Number(req.midi)) ? Math.trunc(Number(req.midi)) : null;
    const target = mapper?.targets?.find((x) => x.preset === targetPreset) || null;

    for (const item of state.items) {
      // The bundled MobiBard sound always has an answer, so everything below it is never asked.
      if (!item.bank) return null;
      const bank = item.bank;
      if (bank.isMobibardCompatible) {
        let number = targetPreset;
        if (number == null) {
          const mapped = mapper?.resolveRequest?.({ program, preset: program, bank: isDrum ? 128 : 0, midi, drumMidi: midi, isDrum, isBeat: isDrum, instrumentName: req.instrumentName || "" });
          number = mapped ? mapped.preset : 0;
        }
        const preset = findPreset(bank, 0, number);
        if (preset) return { soundBank: bank, preset, isDrum: false, compat: true };
        continue;
      }
      // plain GM font
      if (targetPreset != null) {
        if (!target) continue;
        if (target.id in TARGET_DRUM_NOTE) {
          const kit = findPreset(bank, 128, 0);
          if (kit && drumKitHasKey(kit, TARGET_DRUM_NOTE[target.id])) return { soundBank: bank, preset: kit, isDrum: true };
          continue;
        }
        const preset = findPreset(bank, 0, TARGET_PROGRAM[target.id] ?? 0);
        if (preset) return { soundBank: bank, preset, isDrum: false };
        continue;
      }
      if (isDrum) {
        const kit = findPreset(bank, 128, program) || findPreset(bank, 128, 0);
        if (kit && drumKitHasKey(kit, midi)) return { soundBank: bank, preset: kit, isDrum: true };
        continue;
      }
      for (const bankNo of [...new Set([msb * 128 + lsb, lsb, msb])]) {
        const preset = findPreset(bank, bankNo, program);
        if (preset) return { soundBank: bank, preset, isDrum: false };
      }
    }
    // The bundled sound is switched off: the first font answers for everything it can.
    if (!state.defaultActive && state.items.length) return fallbackPick(state.items[0].bank, { isDrum, targetPreset, program, midi, target });
    return null;
  }
  function fallbackPick(bank, { isDrum, targetPreset, program, midi, target }) {
    if (!bank) return null;
    if (isDrum || (target && target.id in TARGET_DRUM_NOTE)) {
      const kit = bank.isMobibardCompatible ? (findPreset(bank, 0, target?.preset ?? 12)) : (findPreset(bank, 128, program) || findPreset(bank, 128, 0));
      return kit ? { soundBank: bank, preset: kit, isDrum: !bank.isMobibardCompatible } : null;
    }
    const piano = findPreset(bank, 0, 0) || (Array.isArray(bank.presets) ? bank.presets.find((p) => Number(p.bank) !== 128) : null);
    return piano ? { soundBank: bank, preset: piano, isDrum: false } : null;
  }

  // ------------------------------------------------------------------- UI
  const DL = {
    sf3: [["v2.0", "assets/MobiBard_Instruments_v2.0_sf3.zip"], ["v1.0", "assets/MobiBard_Instruments_v1.0_sf3.zip"]],
    dls: [["v2.0", "assets/MobiBard_Instruments_v2.0_dls.zip"], ["v1.0", "assets/MobiBard_Instruments_v1.0_dls.zip"]],
  };
  function assetBase() {
    const s = Array.from(document.scripts).find((x) => /plugins\/common\/soundbank-stack\.js/.test(x.src));
    return s ? new URL("../../", s.src).href : new URL("./", location.href).href;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function defaultLabel() {
    const d = window.__mobibardDefaultBankInfo;
    return d?.version ? `${t("def")} ${d.version}` : t("def");
  }

  function downloadMenu(kind, base) {
    const d = el("details", "sbs-dl");
    d.appendChild(el("summary", "sbs-btn", kind.toUpperCase()));
    const menu = el("div", "sbs-dl-menu");
    for (const [label, path] of DL[kind]) {
      const a = el("a", "", label);
      a.href = new URL(path, base).href;
      a.download = path.split("/").pop();
      a.addEventListener("click", () => { d.open = false; });
      menu.appendChild(a);
    }
    d.appendChild(menu);
    // Only one download menu open at a time.
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      document.querySelectorAll("details.sbs-dl[open]").forEach((other) => { if (other !== d) other.open = false; });
    });
    if (!downloadMenu.outsideHooked) {
      downloadMenu.outsideHooked = true;
      // Clicking or tapping anywhere else (other buttons, other dropdowns, the list) closes it.
      document.addEventListener("pointerdown", (event) => {
        document.querySelectorAll("details.sbs-dl[open]").forEach((open) => { if (!open.contains(event.target)) open.open = false; });
      }, true);
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const open = document.querySelectorAll("details.sbs-dl[open]");
        if (!open.length) return;
        open.forEach((item) => { item.open = false; });
        event.preventDefault();
        event.stopPropagation();
      }, true);
    }
    return d;
  }

  let dialog = null;
  function closeDialog() {
    const wasOpen = Boolean(dialog);
    if (dialog) {
      try { if (dialog.open) dialog.close(); } catch (_) {}
      dialog.remove();
      dialog = null;
    }
    // Nothing left in the list: bring the bundled MobiBard sound back as number one.
    if (wasOpen && state.loaded && !state.items.length) {
      writeOrder([DEFAULT_ID, ...state.entries.map((e) => e.id).filter((x) => x !== DEFAULT_ID)]);
      void setDefaultActive(true);
    }
  }

  async function render(root, status) {
    const base = assetBase();
    const hadFocus = root.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement;
    root.textContent = "";
    // Re-rendering removes the focused button; keep focus inside the popup so keys (Esc) stay here.
    if (hadFocus) queueMicrotask(() => { if (root.isConnected && !root.contains(document.activeElement)) { root.tabIndex = -1; root.focus({ preventScroll: true }); } });
    const head = el("div", "sbs-head");
    head.appendChild(el("strong", "", t("title")));
    const x = el("button", "sbs-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("close")); x.onclick = closeDialog;
    head.appendChild(x);
    root.appendChild(head);

    const body = el("div", "sbs-body");
    const add = el("button", "sbs-btn sbs-add", "+ " + t("add")); add.type = "button";
    const input = document.createElement("input"); input.type = "file"; input.hidden = true;
    input.accept = ".sf2,.sf3,.dls,.bin,.macbin,application/macbinary,application/x-macbinary";
    add.onclick = () => { input.value = ""; const picker = window.MabiSupportedFilesUi?.openFileInput; if (typeof picker === "function") void picker(input); else input.click(); };
    input.onchange = async () => {
      const file = input.files && input.files[0]; if (!file) return;
      add.disabled = true; msg.textContent = t("reading");
      try {
        const api = window.MabiSoundBank;
        await addFile(file);
        await maybeAskMain(root);
        msg.textContent = "";
      } catch (e) { msg.textContent = `${t("failed")}: ${e?.message || e}`; }
      add.disabled = false;
      render(root);
    };
    const reset = el("button", "sbs-btn sbs-reset", t("reset")); reset.type = "button";
    reset.disabled = !state.entries.some((e) => !e.isDefault) && state.defaultActive;
    reset.onclick = async () => {
      reset.disabled = true;
      try { await resetAll(); await maybeAskMain(root); } catch (e) { msg.textContent = `${t("failed")}: ${e?.message || e}`; }
      render(root);
    };
    const top = el("div", "sbs-top"); top.append(add, reset);
    body.append(top, input);
    const msg = el("p", "sbs-msg", status || ""); body.appendChild(msg);

    const list = el("ul", "sbs-list");
    const entries = state.entries;
    const firstActive = entries.findIndex((e) => !e.disabled);
    entries.forEach((entry, i) => {
      const li = el("li", "sbs-item" + (entry.isDefault ? " sbs-default" : "") + (entry.disabled ? " sbs-off" : ""));
      const label = entry.isDefault ? defaultLabel() : entry.name;
      const name = el("span", "sbs-name"); name.title = label;
      if (i === firstActive) name.appendChild(el("span", "sbs-star", "★"));
      name.appendChild(document.createTextNode(label));
      li.appendChild(name);
      if (entry.isDefault) li.appendChild(el("span", "sbs-tag sbs-tag-def", t("defTag")));
      else if (entry.compat) li.appendChild(el("span", "sbs-tag sbs-tag-compat", t("compat")));
      const up = el("button", "sbs-mini", "▲"); up.type = "button"; up.title = t("up"); up.disabled = i === 0; up.onclick = async () => { await move(entry.id, -1); await maybeAskMain(root); render(root); };
      const dn = el("button", "sbs-mini", "▼"); dn.type = "button"; dn.title = t("down"); dn.disabled = i === entries.length - 1; dn.onclick = async () => { await move(entry.id, 1); await maybeAskMain(root); render(root); };
      li.append(up, dn);
      if (entry.isDefault && entry.disabled) {
        const addBack = el("button", "sbs-mini sbs-addback", "+"); addBack.type = "button"; addBack.title = t("add"); addBack.setAttribute("aria-label", t("add"));
        addBack.onclick = async () => { await setDefaultActive(true); await maybeAskMain(root); render(root); };
        li.appendChild(addBack);
      } else {
        const del = el("button", "sbs-mini sbs-del", "−"); del.type = "button"; del.title = t("remove"); del.setAttribute("aria-label", t("remove"));
        del.onclick = async () => { if (entry.isDefault) await setDefaultActive(false); else await remove(entry.id); await maybeAskMain(root); render(root); };
        li.appendChild(del);
      }
      list.appendChild(li);
    });
    body.appendChild(list);
    body.appendChild(el("p", "sbs-hint", t("hint")));
    root.appendChild(body);

    const foot = el("div", "sbs-foot");
    const lic = el("a", "sbs-btn", t("license")); lic.href = new URL("assets/MobiBard_Instruments_LICENSE.txt", base).href; lic.target = "_blank"; lic.rel = "noopener noreferrer";
    const guide = el("a", "sbs-btn", t("guide")); guide.href = new URL("soundfont-compat.html?lang=" + lang(), base).href; guide.target = "_blank"; guide.rel = "noopener noreferrer";
    const left = el("div", "sbs-foot-left"); left.append(lic, guide);
    const right = el("div", "sbs-foot-right"); right.append(el("span", "sbs-foot-label", t("download")), downloadMenu("sf3", base), downloadMenu("dls", base));
    foot.append(left, right);
    root.appendChild(foot);
  }

  // A non-compatible font that becomes number one and mentions "MobiBard" (file name or content)
  // is offered the MobiBard instrument layout once; the answer is remembered.
  async function maybeAskMain(root) {
    const main = state.entries.find((e) => !e.disabled);
    if (!main || main.isDefault || main.compat || !main.mention || main.asked) return;
    const yes = await askCompat(root);
    await setForceCompat(main.id, yes);
  }
  function askCompat(root) {
    return new Promise((resolve) => {
      const bar = el("div", "sbs-ask");
      bar.appendChild(el("strong", "", t("tryTitle")));
      bar.appendChild(el("p", "", t("tryMsg")));
      const row = el("div", "sbs-ask-row");
      const yes = el("button", "sbs-btn sbs-primary", t("tryYes")); yes.type = "button";
      const no = el("button", "sbs-btn", t("tryNo")); no.type = "button";
      yes.onclick = () => { bar.remove(); resolve(true); };
      no.onclick = () => { bar.remove(); resolve(false); };
      row.append(no, yes); bar.appendChild(row);
      root.appendChild(bar);
    });
  }

  // Opens once (repeated clicks while it is still loading are ignored) and always on the top layer,
  // so it works even while another popup (file loading, conversion settings…) is open.
  let opening = null;
  function openDialog() {
    if (dialog && dialog.isConnected) return Promise.resolve();
    if (opening) return opening;
    opening = (async () => {
      const back = document.createElement("dialog");
      back.className = "sbs-backdrop";
      const root = el("section", "sbs-dialog"); root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true");
      root.appendChild(el("div", "sbs-loading", "…"));
      back.appendChild(root);
      back.addEventListener("pointerdown", (e) => { if (e.target === back) closeDialog(); });
      back.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(); });
      back.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented && document.querySelector("details.sbs-dl[open]")) return;
        if (back.querySelector("details.sbs-dl[open]")) return;
        e.preventDefault(); e.stopPropagation(); closeDialog();
      });
      document.body.appendChild(back);
      dialog = back;
      try { back.showModal(); } catch (_) { back.setAttribute("open", ""); }
      await ready().catch(() => {});
      if (dialog !== back) return;
      await render(root);
      try { const dflt = await window.MabiSoundBank?.loadEmbeddedSoundBank?.({ clearBase64: true }); if (dflt?.mobibard?.version) window.__mobibardDefaultBankInfo = { version: dflt.mobibard.version }; } catch (_) {}
      if (dialog !== back) return;
      await render(root);
      await maybeAskMain(root);
      if (dialog !== back) return;
      render(root);
      root.querySelector(".sbs-add")?.focus();
    })().finally(() => { opening = null; });
    return opening;
  }

  // Wire a product's "SoundFont" button; keeps its label localized.
  function bindButton(button) {
    if (!button || button.dataset.sbsBound) return;
    button.dataset.sbsBound = "1";
    const label = () => { const span = button.querySelector("[data-sbs-label]") || button; span.textContent = t("button"); };
    label();
    button.addEventListener("click", () => { void openDialog(); });
    new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    window.addEventListener("storage", (e) => { if (e.key === LANG_KEY) label(); });
  }
  function autoBind() { document.querySelectorAll("[data-soundfont-stack-button]").forEach(bindButton); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoBind); else autoBind();

  window.MobibardSoundStack = Object.freeze({
    load, ready, onChange, pick, fontList, mainFont, bankForKey, setForceCompat, registerAudioContext, resetAll, openDialog, bindButton, addFile, remove, move,
    get banks() { return state.banks; },
    get loaded() { return state.loaded; },
    downloadMenu,
  });
  // Start loading user fonts as early as possible.
  load().catch(() => {});
})();
