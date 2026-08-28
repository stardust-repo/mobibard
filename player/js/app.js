(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const el = (tag, className = "", attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === "text") node.textContent = String(value);
      else if (key === "hidden") node.hidden = Boolean(value);
      else if (key === "checked") node.checked = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    return node;
  };

  

  function lang() {
    const raw = String(window.MobibardI18n?.language || window.__MOBIBARD_INITIAL_LANGUAGE__ || document.documentElement.lang || "en").replace(/_/g, "-").toLowerCase();
    if (raw.startsWith("ko")) return "ko";
    if (raw.startsWith("ja")) return "ja";
    if (raw === "zh-tw" || raw === "zh-hk" || raw === "zh-mo" || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh") || raw.includes("hans")) return "zh-CN";
    return "en";
  }

  function localeText(key, values = [], fallback = "") {
    const normalizedValues = Array.isArray(values) ? values : [];
    const apiValue = window.MobibardI18n?.t?.(key, normalizedValues);
    if (typeof apiValue === "string" && apiValue !== key) return apiValue;
    const catalogs = window.__MOBIBARD_LOCALES__ || {};
    const catalog = catalogs[lang()]?.strings || catalogs.en?.strings || {};
    let value = catalog[key];
    if (typeof value !== "string") value = fallback || key;
    normalizedValues.forEach((item, index) => { value = value.replaceAll(`{${index}}`, String(item)); });
    return value;
  }

  const t = (key, values = []) => localeText(`layout.${key}`, values, key);
  const appText = (key, fallback = "") => localeText(key, [], fallback || key);
  const channelKey = index => index === 0 ? "part.melody" : `part.harmony${index}`;
  const channelFallback = index => ["Melody", "Harmony 1", "Harmony 2", "Harmony 3", "Harmony 4", "Harmony 5"][index] || `Channel ${index + 1}`;
  const channelLabel = index => appText(channelKey(index), channelFallback(index));

  const makeChannelOptions = index => ({
    restMode: "32",
    volumeDelta: 0,
    octaveDelta: 0,
    accompaniment: { analysis: index === 0, generation: index > 0 }
  });

  const state = {
    sourceMml: "",
    sourceMeta: {},
    applying: false,
    manualEdited: false,
    midiAutoTimer: 0,
    applyFrame: 0,
    applyTimer: 0,
    sourceVersion: 0,
    lastApplySignature: "",
    lastResultMml: "",
    metricsFrame: 0,
    metricsIdleHandle: 0,
    metricsCache: { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], noteStatsSource: "", noteStats: [], tempoInput: "", tempoResult: null },
    pipelineCache: { sourceVersion: -1, stages: [] },
    tempoCleanCount: 0,
    copySplitCache: { mml: "", maxChars: 0, searchPercent: 0, pages: null },
    copySplitPlan: { sourceVersion: -1, maxChars: 0, searchPercent: 0, geometrySignature: "", pages: null },
    channelDraft: null,
    channelOptionsDirty: false,
    instrumentDirty: false,
    playbackChannelMedia: null,
    toastTimer: 0,
    sessionSaveTimer: 0,
    sessionLoadedSnapshot: null,
    restoringSession: false,
    sessionHasUserEdit: false,
    activeOptionFeature: "rest",
    panelState: new WeakMap(),
    openPanels: [],
    activeChannel: 0,
    activeChannelView: 0,
    originalPreviewAvailable: false,
    midiQuantizeAvailable: false,
    midiQuantizeDivision: 64,
    ui: {},
    options: {
      channels: Array.from({ length: 6 }, (_, index) => makeChannelOptions(index)),
      leading: { beats: 4 },
      fade: { inSeconds: 0, outSeconds: 0 },
      tempo: { scale: 100, simplify: true },
      dynamics: { genre: "", strength: "normal", targetChannels: [true, true, true, true, true, true] },
      accompaniment: { genre: "", strength: "normal" },
      split: { maxChars: 2400, searchPercent: 50 }
    }
  };

  const FADE_SECOND_OPTIONS = Object.freeze([0, 1, 2, 4]);

  function normalizeFadeSeconds(value) {
    const raw = Math.max(0, Number(value) || 0);
    if (raw <= 0) return 0;
    let best = FADE_SECOND_OPTIONS[1];
    let bestDistance = Math.abs(raw - best);
    for (let index = 2; index < FADE_SECOND_OPTIONS.length; index += 1) {
      const candidate = FADE_SECOND_OPTIONS[index];
      const distance = Math.abs(raw - candidate);
      if (distance < bestDistance - 1e-9 || (Math.abs(distance - bestDistance) <= 1e-9 && candidate > best)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function cloneChannelOptions(channels = state.options.channels) {
    return Array.from({ length: 6 }, (_, index) => {
      const source = channels?.[index] || makeChannelOptions(index);
      return {
        restMode: String(source.restMode || "keep"),
        volumeDelta: Math.max(-15, Math.min(15, Math.round(Number(source.volumeDelta) || 0))),
        octaveDelta: Math.max(-7, Math.min(7, Math.round(Number(source.octaveDelta) || 0))),
        accompaniment: {
          analysis: Boolean(source.accompaniment?.analysis),
          generation: Boolean(source.accompaniment?.generation)
        }
      };
    });
  }

  function cloneAccompanimentOption(value = state.options.accompaniment) {
    return {
      genre: String(value?.genre || ""),
      strength: String(value?.strength || "normal")
    };
  }

  function ensureChannelDraft() {
    if (!state.channelDraft) {
      state.channelDraft = {
        channels: cloneChannelOptions(),
        accompaniment: cloneAccompanimentOption()
      };
    }
    return state.channelDraft;
  }

  function workspaceTab(name) {
    return state.ui.workspaceTabs?.find?.(button => button.dataset.workspaceTab === name) || null;
  }

  function setWorkspacePending(name, pending) {
    const tab = workspaceTab(name);
    if (!tab) return;
    tab.classList.toggle("has-pending", Boolean(pending));
    tab.setAttribute("data-pending", pending ? "true" : "false");
  }

  function setInstrumentDirty(dirty = true) {
    state.instrumentDirty = Boolean(dirty);
    if (state.ui.instrumentApplyBar) state.ui.instrumentApplyBar.hidden = !state.instrumentDirty;
    setWorkspacePending("instrument", state.instrumentDirty);
  }

  function refreshInstrumentDirtyState({ markEdit = true } = {}) {
    const api = window.MobibardMidiEditor;
    const dirty = Boolean(api?.hasSource?.() && api?.isDirty?.());
    setInstrumentDirty(dirty);
    if (dirty && markEdit) {
      markPlayerEdited();
    } else if (!dirty) {
      clearPendingPlaybackPreview();
      scheduleSessionPersist();
    }
    return dirty;
  }

  function setChannelOptionsDirty(dirty = true) {
    state.channelOptionsDirty = Boolean(dirty);
    if (state.ui.channelApplyBar) state.ui.channelApplyBar.hidden = !state.channelOptionsDirty;
    setWorkspacePending("channel", state.channelOptionsDirty);
  }

  function normalizedChannelOptionSnapshot(channels, accompaniment) {
    return {
      channels: cloneChannelOptions(channels).map(channel => ({
        restMode: String(channel.restMode || "keep"),
        volumeDelta: Number(channel.volumeDelta) || 0,
        octaveDelta: Number(channel.octaveDelta) || 0,
        accompaniment: {
          analysis: Boolean(channel.accompaniment?.analysis),
          generation: Boolean(channel.accompaniment?.generation)
        }
      })),
      accompaniment: cloneAccompanimentOption(accompaniment)
    };
  }

  function channelDraftMatchesApplied() {
    const draft = ensureChannelDraft();
    const pending = normalizedChannelOptionSnapshot(draft.channels, draft.accompaniment);
    const applied = normalizedChannelOptionSnapshot(state.options.channels, state.options.accompaniment);
    return JSON.stringify(pending) === JSON.stringify(applied);
  }

  function markChannelOptionsDirty() {
    setChannelOptionsDirty(!channelDraftMatchesApplied());
    markPlayerEdited();
    if (state.activeOptionFeature === "volume" || state.activeOptionFeature === "octave") scheduleOptionMetricsUpdate();
  }

  function syncChannelDraftControls() {
    const draft = ensureChannelDraft();
    ["rest", "volume", "octave"].forEach(feature => {
      const refs = state.ui.featureControls?.[feature];
      if (!refs) return;
      refs.channels?.forEach((control, index) => {
        const channel = draft.channels[index];
        const value = feature === "rest"
          ? channel?.restMode
          : feature === "volume"
            ? channel?.volumeDelta
            : channel?.octaveDelta;
        control?.setValue?.(value);
      });
      syncFeatureBatchState(feature);
    });
    syncAccompanimentFeatureControls();
    scheduleOptionMetricsUpdate();
  }

  function cancelChannelOptionsDraft() {
    syncChannelDraftFromApplied({ force: true });
    syncChannelDraftControls();
    setChannelOptionsDirty(false);
    clearPendingPlaybackPreview();
    scheduleSessionPersist();
    showToast(t("channelCancelled"), "info");
  }

  function applyChannelOptionsDraft() {
    const draft = ensureChannelDraft();
    if (channelDraftMatchesApplied()) {
      setChannelOptionsDirty(false);
      return;
    }
    state.options.channels = cloneChannelOptions(draft.channels);
    state.options.accompaniment = cloneAccompanimentOption(draft.accompaniment);
    setChannelOptionsDirty(false);
    state.lastApplySignature = "";
    applyFromSource({ force: true });
    clearPendingPlaybackPreview();
    scheduleOptionMetricsUpdate();
    scheduleSessionPersist();
    showToast(t("channelApplied"), "success");
  }

  function syncChannelDraftFromApplied({ force = false } = {}) {
    if (state.channelOptionsDirty && !force) return;
    const channels = cloneChannelOptions(state.options.channels);
    const accompaniment = cloneAccompanimentOption(state.options.accompaniment);
    if (!state.channelDraft) {
      state.channelDraft = { channels, accompaniment };
      return;
    }
    for (let index = 0; index < 6; index += 1) {
      const source = channels[index];
      const target = state.channelDraft.channels[index] || makeChannelOptions(index);
      target.restMode = source.restMode;
      target.volumeDelta = source.volumeDelta;
      target.octaveDelta = source.octaveDelta;
      target.accompaniment ||= {};
      target.accompaniment.analysis = source.accompaniment.analysis;
      target.accompaniment.generation = source.accompaniment.generation;
      state.channelDraft.channels[index] = target;
    }
    state.channelDraft.accompaniment.genre = accompaniment.genre;
    state.channelDraft.accompaniment.strength = accompaniment.strength;
  }

  function resetSubmenuStateForNewSource() {
    // A file/paste/Drive load is a new editing job. Keep the global "전체 설정"
    // controls, but reset every lower workspace to its clean defaults.
    state.options.channels = Array.from({ length: 6 }, (_, index) => makeChannelOptions(index));
    state.options.accompaniment = { genre: "", strength: "normal" };
    state.options.split = { maxChars: 2400, searchPercent: 50 };
    state.manualEdited = false;
    state.activeWorkspaceTab = "copy";
    state.activeOptionFeature = "rest";
    state.activeChannel = 0;
    state.activeChannelView = 0;
    state.copyDirty = true;
    syncChannelDraftFromApplied({ force: true });
    setChannelOptionsDirty(false);
    setInstrumentDirty(false);
    clearPendingPlaybackPreview();
    if (state.ui.manualBadge) state.ui.manualBadge.hidden = true;
    if (state.ui.featureControls) syncChannelDraftControls();
  }

  document.documentElement.dataset.playerLayout = "player-ui";
  document.body.classList.add("player-ui");

  const main = document.querySelector("main");
  const menuCard = main?.querySelector(".menu-card");
  const editorCard = main?.querySelector(".card:not(.menu-card)");
  const fileToolbar = menuCard?.querySelector(".player-file-toolbar");
  const playLayout = menuCard?.querySelector(".play-layout");
  const retained = {
    copy: $("copyBtn"),
    save: $("saveBtn"),
    driveSave: $("googleDriveSaveBtn")
  };
  if (!main || !menuCard || !editorCard || !fileToolbar || !playLayout) return;

  function keyedText(key, className = "", tag = "span") {
    return el(tag, className, { "data-wb4-text": key, text: t(key) });
  }

  function buildHeaderActions() {
    const topActions = document.querySelector(".player-top-actions");
    if (!topActions) return;
    const midiExtract = $("midiExtractBtn");
    if (!midiExtract) return;
    midiExtract.classList.add("wb4-midi-extract-button");
    midiExtract.querySelector(".midi-extract-toolbar-icon")?.remove();
    const group = el("div", "wb4-top-external", { "aria-label": t("external") });
    group.append(midiExtract);
    topActions.prepend(group);
  }

  function buildTitle(canvas) {
    const row = el("div", "wb4-title-row");
    const title = el("h1", "wb4-title");
    state.ui.titleName = el("span", "wb4-title-name", { text: appText("mml.generator_title", "MML 생성기") });
    title.append(state.ui.titleName);

    const actions = el("div", "wb4-title-actions");
    const mobibeat = $("rhythmGameBtn");
    const rollscriptor = $("rollscriptorBtn");
    const simple = $("simpleVersionBtn");
    if (mobibeat) {
      mobibeat.querySelector(".rhythm-game-toolbar-icon")?.remove();
      const label = mobibeat.querySelector("span:last-child");
      if (label) { label.removeAttribute("data-i18n"); label.textContent = t("mobibeat"); }
      mobibeat.removeAttribute("data-i18n-title");
      mobibeat.title = t("mobibeat");
      actions.append(mobibeat);
    }
    if (rollscriptor) {
      rollscriptor.className = "player-mode-action-button";
      actions.append(rollscriptor);
    }
    if (simple) actions.append(simple);
    row.append(title, actions);
    canvas.append(row);
  }

  function buildWorkflowHead(canvas, step, titleKey, descriptionKey, first = false) {
    const head = el("div", `wb15-workflow-head${first ? " wb15-workflow-head-first" : ""}`);
    const titleWrap = el("div", "wb15-workflow-title-wrap");
    titleWrap.append(
      el("span", "wb15-step-number", { text: String(step), "aria-hidden": "true" }),
      el("h2", "", { "data-player-workflow-title": titleKey, text: appText(titleKey, titleKey) })
    );
    const description = el("p", "", {
      "data-player-workflow-description": descriptionKey,
      text: appText(descriptionKey, descriptionKey)
    });
    head.append(titleWrap, description);
    canvas.append(head);
  }

  function ensurePasteDialog() {
    let dialog = $("pasteMmlDialog");
    if (dialog) return dialog;
    dialog = el("dialog", "mml-dialog wb4-native-popup wb4-paste-dialog", { id: "pasteMmlDialog" });
    const form = el("form", "dialog-card wb4-paste-card", { id: "pasteMmlForm", method: "dialog" });
    form.append(keyedText("pasteMml", "", "h3"), keyedText("pasteHint", "wb4-paste-hint", "p"));
    const textarea = el("textarea", "wb4-paste-textarea", { id: "pasteMmlText", spellcheck: "false", rows: "10" });
    const status = el("div", "dialog-small wb4-paste-status", { id: "pasteMmlStatus", role: "status", "aria-live": "polite" });
    const actions = el("div", "dialog-actions");
    actions.append(
      el("button", "", { id: "pasteMmlCancel", type: "button", "data-wb4-text": "cancel", text: t("cancel") }),
      el("button", "primary", { id: "pasteMmlApply", type: "submit", "data-wb4-text": "pasteApply", text: t("pasteApply") })
    );
    form.append(textarea, status, actions);
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }

  function buildSourceBlock(canvas) {
    ensurePasteDialog();
    const block = el("section", "wb4-block wb4-source-block");
    const drop = el("div", "wb4-drop-zone", { id: "playerDropZone", role: "button", tabindex: "0", "aria-controls": "midiFile" });
    const supported = fileToolbar.querySelector("[data-supported-files-button]");
    const load = $("midiLoadBtn");
    const drive = $("googleDriveLoadBtn");
    const paste = $("pasteBtn");
    const input = $("midiFile");

    if (supported) {
      supported.className = "mabi-supported-files-button wb12-supported-button";
      supported.textContent = t("supported");
    }
    if (load) {
      load.removeAttribute("data-i18n");
      load.removeAttribute("data-i18n-title");
      load.textContent = t("loadFile");
      load.className = "wb4-load-primary";
    }
    if (drive) {
      drive.removeAttribute("data-i18n");
      drive.removeAttribute("data-i18n-title");
      drive.textContent = t("driveLoad");
      drive.className = "wb4-load-secondary";
    }
    if (paste) {
      paste.removeAttribute("data-i18n");
      paste.textContent = t("pasteMml");
      paste.className = "wb4-load-secondary wb4-paste-source-button";
    }

    const sourceTools = el("div", "wb15-source-tools");
    if (supported) sourceTools.append(supported);
    state.ui.tutorialButton = el("button", "wb15-tutorial-source-button", {
      id: "tutorialBtn",
      type: "button",
      text: appText("tutorial.open", "튜토리얼")
    });
    sourceTools.append(state.ui.tutorialButton);

    const actions = el("div", "wb4-load-actions");
    if (load) actions.append(load);
    if (drive) actions.append(drive);
    if (paste) actions.append(paste);
    state.ui.fileName = el("strong", "wb4-file-name", { "data-wb4-text": "noFile" });
    state.ui.fileState = el("span", "wb4-file-state", { hidden: true });
    state.ui.restoreButton = el("button", "wb13-restore-button", { type: "button", hidden: true });
    state.ui.restoreButton.addEventListener("click", () => void restoreLastPlayerUiSession());
    const meta = el("div", "wb4-file-meta");
    meta.append(state.ui.fileName, state.ui.restoreButton);

    drop.append(sourceTools, actions, keyedText("dropHint", "wb4-drop-hint"), meta);
    if (input) drop.append(input);
    block.append(drop);
    state.ui.sourceInlineHost = el("div", "wb4-inline-host");
    block.append(state.ui.sourceInlineHost);
    canvas.append(block);

    const openPicker = () => load?.click();
    drop.addEventListener("click", event => {
      if (!event.target.closest("button,a,input,select,label")) openPicker();
    });
    drop.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPicker();
      }
    });
    ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => {
      event.preventDefault();
      drop.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(type => drop.addEventListener(type, event => {
      event.preventDefault();
      drop.classList.remove("dragover");
    }));
    drop.addEventListener("drop", event => {
      const file = event.dataTransfer?.files?.[0];
      if (!file || !input) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
    });
    input?.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        state.sessionHasUserEdit = false;
        clearTimeout(state.sessionSaveTimer);
        state.sessionSaveTimer = 0;
        setSourceName(file.name);
      }
    });
  }

  function formatClock(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function prepareTimeline(seekRow) {
    const progressWrap = seekRow?.querySelector(".progress-wrap");
    const progressSlider = $("progressSlider");
    const tempoLayer = $("tempoMarkerLayer");
    if (!progressWrap || !progressSlider || !tempoLayer) return;

    progressWrap.classList.add("wb4-tempo-timeline");
    seekRow.classList.add("wb4-seek-row");
    progressSlider.setAttribute("aria-label", t("playbackPosition"));

    const grid = el("div", "wb4-timeline-grid", { "aria-hidden": "true" });
    for (let index = 0; index <= 16; index += 1) {
      grid.append(el("i", index % 4 === 0 ? "major" : "minor", { style: `left:${index / 16 * 100}%` }));
    }
    const tickLabels = el("div", "wb4-timeline-tick-labels", { "aria-hidden": "true" });
    state.ui.timelineTicks = [0, .25, .5, .75, 1].map((ratio, index) => {
      const tick = el("span", "", { style: `left:${ratio * 100}%`, text: index === 0 ? "00:00" : "" });
      tickLabels.append(tick);
      return tick;
    });
    state.ui.playhead = el("div", "wb4-timeline-playhead", { "aria-hidden": "true" });
    state.ui.playheadLabel = el("span", "wb4-playhead-label", { text: "00:00" });
    state.ui.playhead.append(state.ui.playheadLabel);
    state.ui.playheadTrack = el("div", "wb4-timeline-playhead-track", { "aria-hidden": "true" });
    state.ui.playheadTrack.append(state.ui.playhead);
    state.ui.timelineActivityCanvas = el("canvas", "wb4-timeline-activity", { id: "timelineActivityCanvas", "aria-hidden": "true" });
    progressWrap.prepend(grid, state.ui.timelineActivityCanvas, tickLabels);
    progressWrap.append(state.ui.playheadTrack);
    state.ui.progressSlider = progressSlider;

    let wheelCommitTimer = 0;
    progressWrap.addEventListener("wheel", event => {
      const max = Math.max(0, Number(progressSlider.max) || 0);
      if (progressSlider.disabled || max <= 0) return;
      const horizontalDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? event.deltaX
        : (event.shiftKey ? event.deltaY : 0);
      if (!horizontalDelta) return;
      event.preventDefault();
      const width = Math.max(240, progressWrap.clientWidth || 0);
      const next = Math.max(0, Math.min(max, Number(progressSlider.value || 0) + max * horizontalDelta / width));
      progressSlider.value = String(next);
      progressSlider.dispatchEvent(new Event("input", { bubbles: true }));
      clearTimeout(wheelCommitTimer);
      wheelCommitTimer = window.setTimeout(() => {
        progressSlider.dispatchEvent(new Event("change", { bubbles: true }));
      }, 120);
    }, { passive: false });

    const sync = () => {
      const max = Math.max(0, Number(progressSlider.max) || 0);
      const value = Math.max(0, Math.min(max || 0, Number(progressSlider.value) || 0));
      const percent = max > 0 ? value / max * 100 : 0;
      progressWrap.style.setProperty("--wb4-playback-progress", `${percent}%`);
      progressWrap.classList.toggle("disabled", progressSlider.disabled || max <= 0);
      if (state.ui.playheadLabel) state.ui.playheadLabel.textContent = formatClock(value);
      state.ui.timelineTicks?.forEach((node, index) => { node.textContent = formatClock(max * (index / 4)); });
      window.requestAnimationFrame(sync);
    };
    window.requestAnimationFrame(sync);
  }

  function segmented(defs, current, onChange, className = "") {
    const wrap = el("div", `wb4-segmented ${className}`.trim());
    const buttons = new Map();
    const setValue = (next, { silent = true, mixed = false } = {}) => {
      wrap.dataset.mixed = mixed ? "true" : "false";
      for (const [value, button] of buttons.entries()) {
        const active = !mixed && String(value) === String(next);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
      if (!silent && !mixed) onChange(next);
    };
    defs.forEach(([value, label]) => {
      const button = el("button", "wb4-segment", { type: "button", text: label, "aria-pressed": value === current ? "true" : "false" });
      button.dataset.value = String(value);
      button.classList.toggle("active", value === current);
      button.addEventListener("click", () => setValue(value, { silent: false }));
      buttons.set(String(value), button);
      wrap.append(button);
    });
    wrap.setValue = setValue;
    return wrap;
  }

  function selectControl(values, current, onChange, className = "") {
    const select = el("select", `wb4-select ${className}`.trim());
    values.forEach(([value, label]) => {
      const option = el("option", "", { value, text: label });
      if (String(value) === String(current)) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  function sliderNumber({ min, max, step, value, suffix = "", onChange }) {
    const wrap = el("div", "wb4-slider-number");
    const range = el("input", "wb4-range", { type: "range", min, max, step, value });
    const number = el("input", "wb4-number", { type: "number", min, max, step, value });
    const suffixNode = suffix ? el("span", "wb4-number-suffix", { text: suffix }) : null;
    const normalize = raw => {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = Number(value);
      next = Math.max(Number(min), Math.min(Number(max), next));
      if (Number(step) >= 1) next = Math.round(next / Number(step)) * Number(step);
      return next;
    };
    const setValue = (raw, { silent = true, mixed = false } = {}) => {
      const next = normalize(raw);
      // 채널 값이 서로 다른 상태에서는 일괄 슬라이더의 thumb를 특정 채널 값으로 끌고 가지 않는다.
      // 숫자 칸만 mixed 상태로 비우고, 사용자가 일괄 슬라이더를 직접 움직였을 때만 새 값이 된다.
      if (!mixed) {
        range.value = String(next);
        number.value = String(next);
      } else {
        number.value = "";
      }
      wrap.dataset.mixed = mixed ? "true" : "false";
      number.placeholder = mixed ? t("mixedValues") : "";
      if (!silent) onChange(next);
    };
    range.addEventListener("input", () => setValue(range.value, { silent: false }));
    number.addEventListener("change", () => setValue(number.value, { silent: false }));
    wrap.setValue = setValue;
    wrap._range = range;
    wrap._number = number;
    wrap.append(range, number);
    if (suffixNode) wrap.append(suffixNode);
    return wrap;
  }

  function toggleControl(labelText, checked, onChange, className = "") {
    const label = el("label", `wb4-toggle-row ${className}`.trim());
    const input = el("input", "", { type: "checkbox", checked });
    label.append(input, el("span", "", { text: labelText }));
    input.addEventListener("change", () => onChange(input.checked));
    label._input = input;
    return label;
  }

  function optionRow(labelKey, control, hintKey = "", className = "") {
    const row = el("div", `wb4-option-row ${className}`.trim());
    const label = el("div", "wb4-option-name");
    label.append(keyedText(labelKey, "", "strong"));
    if (hintKey) label.append(keyedText(hintKey, "", "small"));
    const body = el("div", "wb4-option-control");
    if (control) body.append(control);
    row.append(label, body);
    return row;
  }

  function getApplySignature() {
    const transformOptions = {
      channels: state.options.channels,
      leading: state.options.leading,
      fade: state.options.fade,
      tempo: state.options.tempo,
      dynamics: state.options.dynamics,
      accompaniment: state.options.accompaniment
    };
    return `${state.sourceVersion}|${JSON.stringify(transformOptions)}`;
  }

  function queueApply({ immediate = false, userEdit = true } = {}) {
    if (userEdit) markPlayerEdited();
    if (state.applyFrame) cancelAnimationFrame(state.applyFrame);
    if (state.applyTimer) clearTimeout(state.applyTimer);
    const run = () => {
      state.applyTimer = 0;
      state.applyFrame = requestAnimationFrame(() => {
        state.applyFrame = 0;
        applyFromSource();
      });
    };
    if (immediate) run();
    else state.applyTimer = window.setTimeout(run, 72);
  }

  function genreValues() {
    return [["pop", t("pop")], ["jazz", t("jazz")], ["ballad", t("ballad")], ["bossa", t("bossa")], ["rock", t("rock")], ["funk", t("funk")], ["classical", t("classical")]];
  }

  function genreValuesWithPlaceholder() {
    return [["", t("genreSelect")], ...genreValues()];
  }

  function updateMidiChannelFilter() {
    const dialog = $("midiConvertDialog");
    if (!dialog) return;
    dialog.removeAttribute("data-active-channel");
    dialog.querySelectorAll(".midi-role-row,[data-midi-group-channel]").forEach(node => { node.hidden = false; });
    dialog.querySelectorAll("details.midi-instrument-section").forEach(section => { section.open = true; });
  }

  function setSourceName(name) {
    if (!state.ui.fileName || !name) return;
    state.ui.fileName.hidden = false;
    state.ui.fileName.textContent = String(name);
    state.ui.fileName.dataset.hasFile = "true";
    if (state.ui.fileState) state.ui.fileState.hidden = true;
    if (state.ui.restoreButton) state.ui.restoreButton.hidden = true;
  }


  const PLAYER_SESSION_DB = "mobibard-player-session-v1";
  const PLAYER_SESSION_STORE = "sessions";
  const PLAYER_SESSION_KEY = "last";

  function openPlayerSessionDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(PLAYER_SESSION_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PLAYER_SESSION_STORE)) db.createObjectStore(PLAYER_SESSION_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function readPlayerSession() {
    let db;
    try {
      db = await openPlayerSessionDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(PLAYER_SESSION_STORE, "readonly");
        const request = tx.objectStore(PLAYER_SESSION_STORE).get(PLAYER_SESSION_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Session read failed"));
      });
    } catch (_) {
      return null;
    } finally {
      try { db?.close(); } catch (_) {}
    }
  }

  async function writePlayerSession(snapshot) {
    let db;
    try {
      db = await openPlayerSessionDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PLAYER_SESSION_STORE, "readwrite");
        tx.objectStore(PLAYER_SESSION_STORE).put(snapshot, PLAYER_SESSION_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Session write failed"));
        tx.onabort = () => reject(tx.error || new Error("Session write aborted"));
      });
      return true;
    } catch (_) {
      return false;
    } finally {
      try { db?.close(); } catch (_) {}
    }
  }

  function normalizeSessionOptions(saved = {}) {
    const channels = cloneChannelOptions(saved.channels || state.options.channels);
    const targetChannels = Array.from({ length: 6 }, (_, index) => saved.dynamics?.targetChannels?.[index] !== false);
    return {
      channels,
      leading: { beats: Math.max(0, Math.min(600, Math.round((Number(saved.leading?.beats) || 0) * 2) / 2)) },
      fade: {
        inSeconds: normalizeFadeSeconds(saved.fade?.inSeconds),
        outSeconds: normalizeFadeSeconds(saved.fade?.outSeconds)
      },
      tempo: {
        scale: Math.max(50, Math.min(200, Math.round(Number(saved.tempo?.scale) || 100))),
        simplify: saved.tempo?.simplify !== false
      },
      dynamics: {
        genre: String(saved.dynamics?.genre || ""),
        strength: String(saved.dynamics?.strength || "normal"),
        targetChannels
      },
      accompaniment: cloneAccompanimentOption(saved.accompaniment),
      split: {
        maxChars: Math.max(200, Math.min(5000, Math.round(Number(saved.split?.maxChars) || 2400))),
        searchPercent: [50, 60, 70, 80, 90].includes(Number(saved.split?.searchPercent)) ? Number(saved.split.searchPercent) : 50
      }
    };
  }

  function syncCommonOptionControls() {
    state.ui.tempoScaleControl?.setValue?.(state.options.tempo.scale);
    state.ui.leadingControl?.setValue?.(state.options.leading.beats * 0.5);
    state.ui.fadeInControl?.setValue?.(String(normalizeFadeSeconds(state.options.fade?.inSeconds)));
    state.ui.fadeOutControl?.setValue?.(String(normalizeFadeSeconds(state.options.fade?.outSeconds)));
    updateTempoCleanButton();
    state.ui.leadingControl?.setSuffix?.(t("seconds"));
    syncVolumeGenerationControls();
    state.ui.quantizeControl?.setValue?.(String(Number(state.midiQuantizeDivision) === 32 ? 32 : 64));
  }

  function markPlayerEdited() {
    if (state.restoringSession || !state.sourceMml) return;
    state.sessionHasUserEdit = true;
    scheduleSessionPersist();
  }

  async function persistLastPlayerSession() {
    if (state.restoringSession || !state.sessionHasUserEdit || !state.sourceMml) return;
    const name = String(state.sourceMeta?.name || state.ui.fileName?.textContent || "").trim();
    if (!name || name === t("noFile")) return;
    if (name === "Sample MML" && state.sourceMeta?.sourceType === "mml") return;
    let midiState = null;
    try {
      const exported = window.MobibardMidiEditor?.exportSessionState?.() || null;
      if (exported?.pendingMidiImport?.name === name) midiState = exported;
    } catch (_) {}
    const snapshot = {
      version: 3,
      userEdited: true,
      savedAt: Date.now(),
      name,
      sourceMml: String(state.sourceMml || ""),
      sourceMeta: { ...state.sourceMeta, name },
      resultMml: String($("mainMml")?.value || ""),
      options: JSON.parse(JSON.stringify(state.options)),
      channelDraft: state.channelDraft ? normalizedChannelOptionSnapshot(state.channelDraft.channels, state.channelDraft.accompaniment) : null,
      channelOptionsDirty: Boolean(state.channelOptionsDirty),
      instrumentDirty: Boolean(state.instrumentDirty),
      manualEdited: Boolean(state.manualEdited),
      activeWorkspaceTab: state.activeWorkspaceTab || "copy",
      activeOptionFeature: state.activeOptionFeature || "rest",
      activeChannelView: Number(state.activeChannelView),
      midiQuantizeDivision: Number(state.midiQuantizeDivision) === 32 ? 32 : 64,
      midiState
    };
    await writePlayerSession(snapshot);
  }

  function scheduleSessionPersist(delay = 160) {
    if (state.restoringSession || !state.sessionHasUserEdit || !state.sourceMml) return;
    clearTimeout(state.sessionSaveTimer);
    state.sessionSaveTimer = window.setTimeout(() => {
      state.sessionSaveTimer = 0;
      void persistLastPlayerSession();
    }, Math.max(60, Number(delay) || 160));
  }

  async function loadSessionRestorePrompt() {
    const snapshot = await readPlayerSession();
    if (!snapshot?.sourceMml || !snapshot?.name || snapshot.version < 3 || snapshot.userEdited !== true || state.sourceMml) return;
    state.sessionLoadedSnapshot = snapshot;
    if (state.ui.restoreButton && state.ui.fileName) {
      state.ui.fileName.hidden = true;
      state.ui.restoreButton.textContent = `${snapshot.name} ${t("restoreSuffix")}`;
      state.ui.restoreButton.title = snapshot.name;
      state.ui.restoreButton.hidden = false;
    }
  }

  function restoreChannelDraftInPlace(savedDraft = null) {
    const target = ensureChannelDraft();
    const sourceChannels = cloneChannelOptions(savedDraft?.channels || state.options.channels);
    const sourceAccompaniment = cloneAccompanimentOption(savedDraft?.accompaniment || state.options.accompaniment);
    for (let index = 0; index < 6; index += 1) {
      const source = sourceChannels[index];
      const channel = target.channels[index] || makeChannelOptions(index);
      channel.restMode = source.restMode;
      channel.volumeDelta = source.volumeDelta;
      channel.octaveDelta = source.octaveDelta;
      channel.accompaniment ||= {};
      channel.accompaniment.analysis = Boolean(source.accompaniment?.analysis);
      channel.accompaniment.generation = Boolean(source.accompaniment?.generation);
      target.channels[index] = channel;
    }
    target.accompaniment.genre = sourceAccompaniment.genre;
    target.accompaniment.strength = sourceAccompaniment.strength;
    return target;
  }

  async function restoreLastPlayerUiSession() {
    const snapshot = state.sessionLoadedSnapshot || await readPlayerSession();
    if (!snapshot?.sourceMml || snapshot.version < 3 || snapshot.userEdited !== true) return;
    state.restoringSession = true;
    clearTimeout(state.sessionSaveTimer);
    // Restore replaces the current editing state just like loading a file, Drive
    // source, or pasted MML. Preserve the saved editor/options state, but start
    // the restored playback context from 0 seconds instead of carrying the
    // timeline position of the page that happened to be open before restore.
    try {
      window.dispatchEvent(new CustomEvent("mobibard:playback-context-reset", {
        detail: { reason: "restore" }
      }));
    } catch (_) {}
    try {
      state.options = normalizeSessionOptions(snapshot.options || {});
      state.sourceMml = String(snapshot.sourceMml || "");
      state.sourceMeta = { ...(snapshot.sourceMeta || {}), name: String(snapshot.name || snapshot.sourceMeta?.name || "") };
      state.sourceVersion += 1;
      state.lastApplySignature = "";
      state.lastResultMml = String(snapshot.resultMml || "");
      state.manualEdited = Boolean(snapshot.manualEdited);
      state.midiQuantizeDivision = Number(snapshot.midiQuantizeDivision) === 32 ? 32 : 64;
      resetPipelineCache();
      state.metricsCache = { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], noteStatsSource: "", noteStats: [], tempoInput: "", tempoResult: null };

      restoreChannelDraftInPlace(snapshot.channelDraft || null);

      const mainMml = $("mainMml");
      if (mainMml) {
        state.applying = true;
        mainMml.dataset.playerUiApply = "1";
        mainMml.value = String(snapshot.resultMml || state.sourceMml);
        mainMml.dispatchEvent(new Event("input", { bubbles: true }));
        delete mainMml.dataset.playerUiApply;
        state.applying = false;
      }

      if (snapshot.midiState) {
        try { window.MobibardMidiEditor?.restoreSessionState?.(snapshot.midiState); } catch (_) {}
      }
      setSourceName(state.sourceMeta.name || snapshot.name);
      syncCommonOptionControls();
      syncChannelDraftControls();
      setChannelOptionsDirty(Boolean(snapshot.channelOptionsDirty));
      setInstrumentDirty(Boolean(snapshot.instrumentDirty));
      state.activeOptionFeature = ["rest", "volume", "octave", "accompaniment"].includes(snapshot.activeOptionFeature) ? snapshot.activeOptionFeature : "rest";
      activateChannelView(Number.isFinite(Number(snapshot.activeChannelView)) ? Number(snapshot.activeChannelView) : 0);
      activateWorkspaceTab(["copy", "instrument", "channel", "code"].includes(snapshot.activeWorkspaceTab) ? snapshot.activeWorkspaceTab : "copy");
      if (state.activeWorkspaceTab === "channel") activateOptionFeature(state.activeOptionFeature);
      if (state.ui.manualBadge) state.ui.manualBadge.hidden = !state.manualEdited;
      clearPendingPlaybackPreview();
      scheduleChannelCountsUpdate();
      scheduleCopyRowsRender();
      scheduleOptionMetricsUpdate();
      state.sessionLoadedSnapshot = null;
      state.sessionHasUserEdit = true;
    } finally {
      state.restoringSession = false;
    }
    scheduleSessionPersist(120);
  }

  function scaleTempoCommands(mml, percent) {
    const factor = Number(percent) / 100;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < .0001) return String(mml || "");
    return String(mml || "").replace(/([tT])(\d{1,3})/g, (_, command, raw) => `${command}${Math.max(32, Math.min(255, Math.round(Number(raw) * factor)))}`);
  }

  function resultMml(result, fallback) {
    if (typeof result === "string") return result;
    return typeof result?.mml === "string" ? result.mml : fallback;
  }

  function resetPipelineCache() {
    state.pipelineCache = { sourceVersion: state.sourceVersion, stages: [] };
  }

  function pipelineStage(index, previousKey, name, optionKey, input, runner, diagnostics) {
    if (state.pipelineCache.sourceVersion !== state.sourceVersion) resetPipelineCache();
    const key = `${previousKey}|${name}:${JSON.stringify(optionKey)}`;
    const cached = state.pipelineCache.stages[index];
    if (cached?.key === key) {
      diagnostics.cacheHits += 1;
      return { output: cached.output, key };
    }
    const started = performance.now();
    const output = String(runner(input) ?? input);
    diagnostics.stageDurations[name] = Math.round((performance.now() - started) * 10) / 10;
    state.pipelineCache.stages[index] = { key, output };
    state.pipelineCache.stages.length = index + 1;
    return { output, key };
  }

  function getTempoCleanupAnalysis(input) {
    const source = String(input || "");
    if (state.metricsCache.tempoInput === source && state.metricsCache.tempoResult) return state.metricsCache.tempoResult;
    let result = { mml: source, removedCount: 0 };
    try {
      result = window.MabiOptimizer?.simplifyTemposMml?.(source, {
        partCount: 6,
        maxBpmDeltaExclusive: 5,
        preserveExtrema: true
      }) || result;
    } catch (_) {}
    state.metricsCache.tempoInput = source;
    state.metricsCache.tempoResult = result;
    return result;
  }


  function transformPreviewSource(sourceMml, channelOptions, accompanimentOption) {
    const optimizer = window.MabiOptimizer;
    let out = String(sourceMml || "");
    if (!optimizer || !out) return out;
    const channels = cloneChannelOptions(channelOptions);
    const accompaniment = cloneAccompanimentOption(accompanimentOption);

    const analysisPartIndexes = [];
    const generationPartIndexes = [];
    channels.forEach((channel, index) => {
      if (channel.accompaniment.analysis) analysisPartIndexes.push(index);
      if (channel.accompaniment.generation) generationPartIndexes.push(index);
    });
    if (accompaniment.genre && optimizer.generateAccompanimentMml && analysisPartIndexes.length && generationPartIndexes.length) {
      out = resultMml(optimizer.generateAccompanimentMml(out, {
        genre: accompaniment.genre,
        strength: accompaniment.strength,
        analysisPartIndexes,
        generationPartIndexes
      }), out);
    }

    const dynamicsTargets = state.options.dynamics.targetChannels
      .map((enabled, index) => enabled ? index : -1)
      .filter(index => index >= 0);
    if (state.options.dynamics.genre && optimizer.generateDynamicsMml && dynamicsTargets.length) {
      out = resultMml(optimizer.generateDynamicsMml(out, {
        partCount: 6,
        genre: state.options.dynamics.genre,
        strength: state.options.dynamics.strength,
        targetPartIndexes: dynamicsTargets,
        overwriteExisting: true
      }), out);
    }

    const previewRestModes = channels.map(channel => String(channel.restMode || "keep"));
    if (optimizer.trimShortRestsMml && previewRestModes.some(mode => mode !== "keep")) {
      out = resultMml(optimizer.trimShortRestsMml(out, {
        partCount: 6,
        partModes: previewRestModes
      }), out);
    }
    const previewVolumeDeltas = channels.map(channel => Number(channel.volumeDelta) || 0);
    if (optimizer.adjustVolumesMml && previewVolumeDeltas.some(delta => delta !== 0)) {
      out = resultMml(optimizer.adjustVolumesMml(out, {
        partCount: 6,
        partDeltas: previewVolumeDeltas
      }), out);
    }
    const previewOctaveDeltas = channels.map(channel => Number(channel.octaveDelta) || 0);
    if (optimizer.transposeOctavesMml && previewOctaveDeltas.some(octaves => octaves !== 0)) {
      out = resultMml(optimizer.transposeOctavesMml(out, {
        partCount: 6,
        partOctaves: previewOctaveDeltas
      }), out);
    }

    const leadingBeats = Math.max(0, Math.round((Number(state.options.leading.beats) || 0) * 2) / 2);
    if (leadingBeats > 0 && optimizer.addLeadingSilenceMml) {
      out = resultMml(optimizer.addLeadingSilenceMml(out, { partCount: 6, beats: leadingBeats }), out);
    }
    if (state.options.tempo.simplify && optimizer.simplifyTemposMml) {
      out = resultMml(optimizer.simplifyTemposMml(out, {
        partCount: 6,
        maxBpmDeltaExclusive: 5,
        preserveExtrema: true
      }), out);
    }
    if (Number(state.options.tempo.scale) !== 100) out = scaleTempoCommands(out, state.options.tempo.scale);
    const fadeInSeconds = normalizeFadeSeconds(state.options.fade?.inSeconds);
    const fadeOutSeconds = normalizeFadeSeconds(state.options.fade?.outSeconds);
    if ((fadeInSeconds > 0 || fadeOutSeconds > 0) && optimizer.applyFadeMml) {
      out = resultMml(optimizer.applyFadeMml(out, { partCount: 6, fadeInSeconds, fadeOutSeconds }), out);
    }
    return out;
  }

  function clearPendingPlaybackPreview() {
    try {
      window.dispatchEvent(new CustomEvent("mobibard:preview-source", { detail: { active: false } }));
    } catch (_) {}
  }

  async function preparePendingPlaybackPreview() {
    const hasPending = Boolean(state.instrumentDirty || state.channelOptionsDirty);
    if (!hasPending) {
      clearPendingPlaybackPreview();
      return true;
    }
    try {
      let source = String(state.sourceMml || "");
      if (state.instrumentDirty && window.MobibardMidiEditor?.buildPendingPreviewMml) {
        const pendingMidiMml = await window.MobibardMidiEditor.buildPendingPreviewMml();
        if (pendingMidiMml) source = String(pendingMidiMml);
      }
      if (!source) return false;
      const channelState = state.channelOptionsDirty
        ? ensureChannelDraft()
        : { channels: state.options.channels, accompaniment: state.options.accompaniment };
      const previewMml = transformPreviewSource(source, channelState.channels, channelState.accompaniment);
      try {
        window.dispatchEvent(new CustomEvent("mobibard:preview-source", {
          detail: { active: true, mml: previewMml, label: t("previewPending") }
        }));
      } catch (_) {}
      showToast(t("previewPending"), "info");
      return true;
    } catch (error) {
      showToast(error?.message || String(error), "error");
      return false;
    }
  }

  let pendingExportDialogOpen = false;

  async function confirmPendingExport(action = "copy") {
    if (!state.instrumentDirty && !state.channelOptionsDirty) return true;
    if (pendingExportDialogOpen) return false;

    const isSave = action === "save";
    const message = t(isSave ? "pendingExportSave" : "pendingExportCopy");
    const confirmUi = window.MobibardInlineUi?.confirm;
    pendingExportDialogOpen = true;
    try {
      if (typeof confirmUi !== "function") return window.confirm(message);
      return await confirmUi(message, {
        title: t("pendingExportTitle"),
        confirmText: t(isSave ? "pendingExportSaveConfirm" : "pendingExportCopyConfirm"),
        cancelText: t("pendingExportBack"),
        modal: true
      });
    } finally {
      pendingExportDialogOpen = false;
    }
  }

  window.MobibardBeforePlay = preparePendingPlaybackPreview;
  window.MobibardBeforeExport = confirmPendingExport;

  function applyFromSource({ force = false } = {}) {
    if (!state.sourceMml) {
      scheduleCopyRowsRender();
      scheduleOptionMetricsUpdate();
      return;
    }
    const optimizer = window.MabiOptimizer;
    if (!optimizer) return;
    const signature = getApplySignature();
    if (!force && signature === state.lastApplySignature) return;

    const startedAt = performance.now();
    const transformCalls = { dynamics: 0, rest: 0, volume: 0, octave: 0, accompaniment: 0, leading: 0, tempoClean: 0, tempoScale: 0, fade: 0 };
    const diagnostics = { cacheHits: 0, stageDurations: {} };
    let out = String(state.sourceMml);
    let previousKey = `source:${state.sourceVersion}`;
    let stageIndex = 0;
    try {

      const accompaniment = state.options.accompaniment;
      const analysisPartIndexes = [];
      const generationPartIndexes = [];
      state.options.channels.forEach((channel, index) => {
        if (channel.accompaniment.analysis) analysisPartIndexes.push(index);
        if (channel.accompaniment.generation) generationPartIndexes.push(index);
      });
      let stage = pipelineStage(stageIndex++, previousKey, "accompaniment", {
        genre: accompaniment.genre,
        strength: accompaniment.strength,
        analysisPartIndexes,
        generationPartIndexes
      }, out, input => {
        if (!accompaniment.genre || !optimizer.generateAccompanimentMml || !analysisPartIndexes.length || !generationPartIndexes.length) return input;
        transformCalls.accompaniment += 1;
        return resultMml(optimizer.generateAccompanimentMml(input, {
          genre: accompaniment.genre,
          strength: accompaniment.strength,
          analysisPartIndexes,
          generationPartIndexes
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const dynamics = state.options.dynamics;
      const dynamicsTargets = dynamics.targetChannels
        .map((enabled, index) => enabled ? index : -1)
        .filter(index => index >= 0);
      stage = pipelineStage(stageIndex++, previousKey, "dynamics", {
        genre: dynamics.genre,
        strength: dynamics.strength,
        targetPartIndexes: dynamicsTargets
      }, out, input => {
        if (!dynamics.genre || !optimizer.generateDynamicsMml || !dynamicsTargets.length) return input;
        transformCalls.dynamics += 1;
        return resultMml(optimizer.generateDynamicsMml(input, {
          partCount: 6,
          genre: dynamics.genre,
          strength: dynamics.strength,
          targetPartIndexes: dynamicsTargets,
          overwriteExisting: true
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const restMetricInput = String(out || "");
      if (state.metricsCache.restInput !== restMetricInput) {
        state.metricsCache.restInput = restMetricInput;
        state.metricsCache.rest = new Map();
      }
      const restModes = state.options.channels.map(channel => String(channel.restMode || "keep"));
      stage = pipelineStage(stageIndex++, previousKey, "rest", restModes, out, input => {
        if (!optimizer.trimShortRestsMml || !restModes.some(mode => mode !== "keep")) return input;
        transformCalls.rest += 1;
        return resultMml(optimizer.trimShortRestsMml(input, {
          partCount: 6,
          partModes: restModes
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const volumeDeltas = state.options.channels.map(channel => Number(channel.volumeDelta) || 0);
      stage = pipelineStage(stageIndex++, previousKey, "volume", volumeDeltas, out, input => {
        if (!optimizer.adjustVolumesMml || !volumeDeltas.some(delta => delta !== 0)) return input;
        transformCalls.volume += 1;
        return resultMml(optimizer.adjustVolumesMml(input, {
          partCount: 6,
          partDeltas: volumeDeltas
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const octaveDeltas = state.options.channels.map(channel => Number(channel.octaveDelta) || 0);
      stage = pipelineStage(stageIndex++, previousKey, "octave", octaveDeltas, out, input => {
        if (!optimizer.transposeOctavesMml || !octaveDeltas.some(octaves => octaves !== 0)) return input;
        transformCalls.octave += 1;
        return resultMml(optimizer.transposeOctavesMml(input, {
          partCount: 6,
          partOctaves: octaveDeltas
        }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const leadingBeats = Math.max(0, Math.round((Number(state.options.leading.beats) || 0) * 2) / 2);
      stage = pipelineStage(stageIndex++, previousKey, "leading", leadingBeats, out, input => {
        if (leadingBeats <= 0 || !optimizer.addLeadingSilenceMml) return input;
        transformCalls.leading += 1;
        return resultMml(optimizer.addLeadingSilenceMml(input, { partCount: 6, beats: leadingBeats }), input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const cleanupAnalysis = getTempoCleanupAnalysis(out);
      state.tempoCleanCount = Math.max(0, Number(cleanupAnalysis?.removedCount) || 0);
      updateTempoCleanButton();
      stage = pipelineStage(stageIndex++, previousKey, "tempoClean", state.options.tempo.simplify, out, input => {
        if (!state.options.tempo.simplify) return input;
        transformCalls.tempoClean += 1;
        return resultMml(cleanupAnalysis, input);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      stage = pipelineStage(stageIndex++, previousKey, "tempoScale", state.options.tempo.scale, out, input => {
        if (Number(state.options.tempo.scale) === 100) return input;
        transformCalls.tempoScale += 1;
        return scaleTempoCommands(input, state.options.tempo.scale);
      }, diagnostics);
      out = stage.output;
      previousKey = stage.key;

      const fadeInSeconds = normalizeFadeSeconds(state.options.fade?.inSeconds);
      const fadeOutSeconds = normalizeFadeSeconds(state.options.fade?.outSeconds);
      stage = pipelineStage(stageIndex++, previousKey, "fade", { fadeInSeconds, fadeOutSeconds }, out, input => {
        if ((fadeInSeconds <= 0 && fadeOutSeconds <= 0) || !optimizer.applyFadeMml) return input;
        transformCalls.fade += 1;
        return resultMml(optimizer.applyFadeMml(input, { partCount: 6, fadeInSeconds, fadeOutSeconds }), input);
      }, diagnostics);
      out = stage.output;

      state.lastApplySignature = signature;
      const changed = writeResultMml(out);
      try {
        window.dispatchEvent(new CustomEvent("mobibard:options-applied", {
          detail: {
            durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
            sourceVersion: state.sourceVersion,
            changed,
            transformCalls,
            cacheHits: diagnostics.cacheHits,
            stageDurations: diagnostics.stageDurations
          }
        }));
      } catch (_) {}
    } catch (error) {
      showToast(error?.message || String(error), "error");
    }
  }

  function normalizeMainToParts(text) {
    let source = String(text || "").trim();
    const match = source.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (match) source = match[1];
    const parts = source.split(",").slice(0, 6).map(item => String(item || "").trim());
    while (parts.length < 6) parts.push("");
    return parts;
  }

  function partDetail(parts) {
    return parts.map((part, index) => ({ part, index })).filter(item => item.part).map(item => `${channelLabel(item.index)} ${item.part.length.toLocaleString()}`).join(" · ") || "0";
  }

  function showToast(message, tone = "success") {
    let toast = state.ui.toast;
    if (!toast) {
      toast = el("div", "wb9-toast", { role: "status", "aria-live": "polite", hidden: true });
      state.ui.toast = toast;
      document.body.append(toast);
    }
    clearTimeout(state.toastTimer);
    toast.textContent = String(message || "");
    toast.dataset.tone = tone;
    toast.hidden = false;
    toast.classList.remove("is-visible");
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 1500);
  }

  function trackScoreCopy() {
    const event = { name: "score_copy", params: { page: "player", copy_scope: "split" } };
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(event.name, event.params);
      } else {
        const queueKey = "__MOBIBARD_ANALYTICS_QUEUE__";
        const queue = Array.isArray(window[queueKey]) ? window[queueKey] : (window[queueKey] = []);
        queue.push(event);
        if (queue.length > 100) queue.splice(0, queue.length - 100);
      }
    } catch (_) {}
  }

  async function copyText(text) {
    const value = String(text || "").trim();
    if (!value) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch (_) {
      const textarea = el("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      try { copied = document.execCommand("copy") === true; } catch (_) { copied = false; }
      textarea.remove();
    }
    if (!copied) return;
    trackScoreCopy();
    showToast(t("copyToast"));
  }

  function invalidateCopySplitPlan() {
    state.copySplitCache = { mml: "", maxChars: 0, searchPercent: 0, pages: null };
    state.copySplitPlan = { sourceVersion: -1, maxChars: 0, searchPercent: 0, geometrySignature: "", pages: null };
  }

  function copySplitGeometrySignature() {
    // Cached timing boundaries are only reusable while the musical geometry is
    // unchanged. Rest trimming can extend notes across former silences, leading
    // silence shifts every event, and accompaniment can add/remove sounding
    // regions. Volume/octave/dynamics/fade changes keep the same timing geometry and
    // may safely reuse the expensive boundary search.
    return JSON.stringify({
      restModes: state.options.channels.map(channel => String(channel.restMode || "keep")),
      leadingBeats: Math.max(0, Math.round((Number(state.options.leading?.beats) || 0) * 2) / 2),
      accompaniment: {
        genre: String(state.options.accompaniment?.genre || ""),
        strength: String(state.options.accompaniment?.strength || "normal"),
        channels: state.options.channels.map(channel => ({
          analysis: Boolean(channel.accompaniment?.analysis),
          generation: Boolean(channel.accompaniment?.generation)
        }))
      }
    });
  }

  function splitPagesForCopy(mml) {
    const maxChars = Math.max(200, Math.min(5000, Math.round(Number(state.options.split.maxChars) || 2400)));
    const searchPercent = [50, 60, 70, 80, 90].includes(Number(state.options.split.searchPercent)) ? Number(state.options.split.searchPercent) : 50;
    state.options.split.maxChars = maxChars;
    state.options.split.searchPercent = searchPercent;

    const input = String(mml || "");
    const cached = state.copySplitCache;
    if (cached?.mml === input && cached.maxChars === maxChars && cached.searchPercent === searchPercent && Array.isArray(cached.pages)) {
      return cached.pages;
    }

    const sourceParts = normalizeMainToParts(input);
    const sourceLengths = sourceParts.map(part => String(part || "").length);
    if (sourceLengths.every(length => length <= maxChars)) {
      const pages = [{ index: 1, mml: input, parts: sourceParts, lengths: sourceLengths, maxPartLength: Math.max(0, ...sourceLengths) }];
      state.copySplitCache = { mml: input, maxChars, searchPercent, pages };
      return pages;
    }

    if (!window.MabiOptimizer?.splitMmlPages) {
      const pages = [{ index: 1, mml: input, parts: sourceParts }];
      state.copySplitCache = { mml: input, maxChars, searchPercent, pages };
      return pages;
    }

    const geometrySignature = copySplitGeometrySignature();
    const plan = state.copySplitPlan;
    const canReusePlan = plan?.sourceVersion === state.sourceVersion
      && plan.maxChars === maxChars
      && plan.searchPercent === searchPercent
      && plan.geometrySignature === geometrySignature
      && Array.isArray(plan.pages)
      && plan.pages.length;
    const result = window.MabiOptimizer.splitMmlPages(input, {
      partCount: 6,
      maxChars,
      searchSlackChars: Math.round(maxChars * searchPercent / 100),
      maxCommonSilenceBeats: 2,
      preferredPages: canReusePlan ? plan.pages : undefined
    });
    const pages = Array.isArray(result?.pages) && result.pages.length ? result.pages : [{ index: 1, mml: input, parts: sourceParts }];
    state.copySplitCache = { mml: input, maxChars, searchPercent, pages };
    state.copySplitPlan = {
      sourceVersion: state.sourceVersion,
      maxChars,
      searchPercent,
      geometrySignature,
      pages: pages.map(page => ({ start: page.start, end: page.end, nextStart: page.nextStart }))
        .filter(page => Number.isFinite(page.start) && Number.isFinite(page.end) && Number.isFinite(page.nextStart))
    };
    return pages;
  }

  function renderCopyItem(title, detail, button) {
    const row = el("div", "copy-item wb4-copy-item");
    const meta = el("div", "copy-meta");
    meta.append(el("strong", "copy-title", { text: title }), el("span", "copy-detail", { text: detail }));
    row.append(meta, button);
    return row;
  }

  function createQuestionPanel({ title = "", message = "", defaultValue = "", mode = "prompt", multiline = false, confirmText = "", cancelText = "", host = null } = {}) {
    const panel = el("section", "wb4-inline-panel wb4-question-panel");
    const form = el("form", "dialog-card wb4-question-card");
    const titleNode = el("h3", "", { text: title || t(mode === "confirm" ? "confirm" : "promptValue") });
    const messageNode = el("p", "", { text: message });
    const uid = `wb-question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    titleNode.id = `${uid}-title`;
    messageNode.id = `${uid}-message`;
    form.append(titleNode, messageNode);
    let input = null;
    if (mode === "prompt") {
      input = el(multiline ? "textarea" : "input", "wb4-question-input");
      if (!multiline) input.type = "text";
      input.value = String(defaultValue ?? "");
      form.append(input);
    }
    const actions = el("div", "dialog-actions");
    const cancel = el("button", "", { type: "button", text: cancelText || t("cancel") });
    const confirm = el("button", "primary", { type: "submit", text: confirmText || t("confirm") });
    actions.append(cancel, confirm);
    form.append(actions);
    panel.append(form);
    panel.setAttribute("role", mode === "confirm" ? "dialog" : "region");
    panel.setAttribute("aria-labelledby", titleNode.id);
    panel.setAttribute("aria-describedby", messageNode.id);
    (host || state.ui.sourceInlineHost || state.ui.copyInlineHost || state.ui.legacyHost)?.append(panel);
    panel.open = false;
    panel.showModal = () => { panel.open = true; panel.hidden = false; };
    panel.close = () => { panel.open = false; panel.hidden = true; panel.dispatchEvent(new Event("close")); };
    panel.hidden = true;
    return { panel, form, input, cancel, confirm };
  }


  window.MobibardInlineUi = {
    prompt(message, defaultValue = "", options = {}) {
      return new Promise(resolve => {
        const ui = createQuestionPanel({ title: options.title || "", message, defaultValue, mode: "prompt", multiline: Boolean(options.multiline) });
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          ui.panel.close();
          ui.panel.remove();
          resolve(value);
        };
        ui.cancel.addEventListener("click", () => finish(null));
        ui.form.addEventListener("submit", event => {
          event.preventDefault();
          finish(ui.input?.value ?? "");
        });
        ui.panel.showModal();
        requestAnimationFrame(() => ui.input?.focus());
      });
    },
    confirm(message, options = {}) {
      return new Promise(resolve => {
        const modal = Boolean(options.modal);
        const ui = createQuestionPanel({
          title: options.title || t("confirm"),
          message,
          mode: "confirm",
          confirmText: options.confirmText || "",
          cancelText: options.cancelText || "",
          host: modal ? document.body : (options.host || null)
        });
        if (modal) {
          ui.panel.classList.add("wb13-modal-confirm");
          ui.panel.setAttribute("aria-modal", "true");
        }
        let done = false;
        const finish = value => {
          if (done) return;
          done = true;
          ui.panel.close();
          ui.panel.remove();
          resolve(Boolean(value));
        };
        ui.cancel.addEventListener("click", () => finish(false));
        ui.form.addEventListener("submit", event => {
          event.preventDefault();
          finish(true);
        });
        ui.panel.addEventListener("keydown", event => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          finish(false);
        });
        if (modal) {
          ui.panel.addEventListener("pointerdown", event => {
            if (event.target === ui.panel) finish(false);
          });
        }
        ui.panel.showModal();
        requestAnimationFrame(() => (modal ? ui.cancel : ui.confirm)?.focus());
      });
    }
  };

  /* PlayerUi v6: source preview, common overview, and task-oriented lower tabs. */
  

  function wb6t(key, values = []) {
    return localeText(`layout6.${key}`, values, key);
  }

  function wb6Text(key, className = "", tag = "span") {
    return el(tag, className, { "data-wb6-text": key, text: wb6t(key) });
  }

  function updateLocalText() {
    document.querySelectorAll("[data-wb4-text]").forEach(node => { node.textContent = t(node.dataset.wb4Text); });
    document.querySelectorAll("[data-wb4-aria]").forEach(node => node.setAttribute("aria-label", t(node.dataset.wb4Aria)));
    document.querySelectorAll("[data-wb6-text]").forEach(node => { node.textContent = wb6t(node.dataset.wb6Text); });
    document.querySelectorAll("[data-player-workflow-title]").forEach(node => { node.textContent = appText(node.dataset.playerWorkflowTitle, node.dataset.playerWorkflowTitle); });
    document.querySelectorAll("[data-player-workflow-description]").forEach(node => { node.textContent = appText(node.dataset.playerWorkflowDescription, node.dataset.playerWorkflowDescription); });
    document.querySelectorAll("[data-wb8-feature-key]").forEach(node => { node.textContent = t(node.dataset.wb8FeatureKey); });
    document.querySelectorAll("[data-wb8-channel-index]").forEach(node => {
      const index = Number(node.dataset.wb8ChannelIndex);
      node.textContent = index < 0 ? t("applyAll") : channelLabel(index);
    });
    if (state.ui.titleName) state.ui.titleName.textContent = appText("mml.generator_title", "MML 생성기");
    if (state.ui.fileName && !state.ui.fileName.dataset.hasFile) state.ui.fileName.textContent = t("noFile");
    state.ui.channelTabGroups?.forEach(group => group.forEach(button => {
      const index = Number(button.dataset.channelIndex);
      button.textContent = index < 0 ? wb6t("allChannels") : channelLabel(index);
    }));
    if (state.ui.codeHelpButton) state.ui.codeHelpButton.textContent = t("codeHelp");
    if (state.ui.tutorialButton) state.ui.tutorialButton.textContent = appText("tutorial.open", "튜토리얼");
    updateTutorialLocale();
    if ($("pasteBtn")) $("pasteBtn").textContent = t("pasteMml");
    const play = $("playToggleBtn");
    if (play) {
      const playing = play.classList.contains("danger");
      play.setAttribute("aria-label", wb6t(playing ? "stop" : "play"));
      play.title = wb6t(playing ? "stop" : "play");
    }
    const rewind = $("rewindBtn");
    if (rewind) {
      rewind.setAttribute("aria-label", wb6t("rewind"));
      rewind.title = wb6t("rewind");
    }
    const leftHead = $("midiRoleList")?.closest(".midi-left-panel")?.querySelector(".dialog-section-head strong");
    if (leftHead) {
      leftHead.removeAttribute("data-i18n");
      leftHead.textContent = wb6t("channelSettings");
    }
    const instrumentHead = $("midiInstrumentPanelTitle");
    if (instrumentHead) {
      instrumentHead.removeAttribute("data-i18n");
      instrumentHead.textContent = wb6t("instrumentSettings");
    }
    refreshPlayerUiText();
    syncMidiQuantizeControl();
    updateTempoCleanButton();
    state.ui.leadingControl?.setSuffix?.(t("seconds"));
    syncVolumeGenerationControls();
    syncAccompanimentFeatureControls();
    scheduleChannelCountsUpdate();
    scheduleCopyRowsRender();
  }


  function refreshPlayerUiText() {
    const supported = document.querySelector("[data-supported-files-button]");
    if (supported) supported.textContent = t("supported");
    if ($("midiLoadBtn")) $("midiLoadBtn").textContent = t("loadFile");
    if ($("googleDriveLoadBtn")) $("googleDriveLoadBtn").textContent = t("driveLoad");
    if ($("pasteBtn")) $("pasteBtn").textContent = t("pasteMml");

    const restKeys = { keep: "keep", "64": "rest64", "32": "rest32", "16": "rest16", "8": "rest8", "4": "rest4", all: "all" };
    document.querySelectorAll(".wb9-rest-buttons .wb4-segment").forEach(button => {
      const key = restKeys[String(button.dataset.value || "")];
      if (key) button.textContent = t(key);
    });

    const quantizeKeys = { "64": "quantize64", "32": "quantize32" };
    document.querySelectorAll(".wb7-quantize-segments .wb4-segment").forEach(button => {
      const key = quantizeKeys[String(button.dataset.value || "")];
      if (key) button.textContent = t(key);
    });

    const genreKeys = { "": "genreSelect", pop: "pop", jazz: "jazz", ballad: "ballad", bossa: "bossa", rock: "rock", funk: "funk", classical: "classical" };
    document.querySelectorAll(".wb9-genre-select").forEach(select => {
      [...select.options].forEach(option => {
        const key = genreKeys[String(option.value || "")];
        if (key) option.textContent = t(key);
      });
    });

    const strengthKeys = { light: "light", normal: "normal", strong: "strong" };
    document.querySelectorAll(".wb9-strength-select").forEach(select => {
      [...select.options].forEach(option => {
        const key = strengthKeys[String(option.value || "")];
        if (key) option.textContent = t(key);
      });
    });

    const shortLabels = [t("melShort"), "1", "2", "3", "4", "5"];
    document.querySelectorAll(".wb9-playback-channel[data-playback-channel-index]").forEach(button => {
      const index = Math.max(0, Math.min(5, Number(button.dataset.playbackChannelIndex) || 0));
      button.textContent = shortLabels[index];
      button.title = channelLabel(index);
    });
    document.querySelectorAll(".wb9-target-channel").forEach((button, index) => {
      const normalized = Math.max(0, Math.min(5, index % 6));
      button.textContent = shortLabels[normalized];
      button.title = channelLabel(normalized);
    });

    document.querySelectorAll(".wb9-accompaniment-channel-control").forEach(control => {
      const labels = control.querySelectorAll(".wb4-toggle-row span");
      if (labels[0]) labels[0].textContent = t("useForAnalysis");
      if (labels[1]) labels[1].textContent = t("useForGeneration");
    });

    const mobibeat = $("rhythmGameBtn");
    const mobibeatLabel = mobibeat?.querySelector("span:last-child");
    if (mobibeatLabel) mobibeatLabel.textContent = t("mobibeat");
    if (mobibeat) {
      mobibeat.title = t("mobibeat");
      mobibeat.setAttribute("aria-label", t("mobibeat"));
    }
  }

  function syncOriginalPreviewSource() {
    const checkbox = state.ui.originalCheckbox;
    if (!checkbox) return;
    const available = Boolean(state.originalPreviewAvailable);
    checkbox.disabled = !available;
    checkbox.title = available ? "" : wb6t("originalUnavailable");
    if (!available && checkbox.checked) checkbox.checked = false;
    const requested = available && Boolean(checkbox.checked);
    state.originalPreview = requested;
    checkbox.setAttribute("aria-checked", requested ? "true" : "false");
    state.ui.previewBlock?.classList.toggle("is-original-preview", requested);
    try {
      window.dispatchEvent(new CustomEvent("mobibard:original-midi-preview", {
        detail: { active: requested }
      }));
    } catch (_) {}
  }

  function createChannelTabs(scope, includeAll = false) {
    const tabs = el("div", `wb6-channel-tabs wb6-${scope}-channel-tabs${includeAll ? " wb7-has-all-channel" : ""}`, {
      role: "tablist",
      "aria-label": appText("mml.select_part", t("selectChannel"))
    });
    const values = includeAll ? [-1, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
    const buttons = [];
    values.forEach(value => {
      const activeValue = includeAll ? state.activeChannelView : state.activeChannel;
      const active = value === activeValue;
      const button = el("button", `wb6-channel-tab ${value < 0 ? "wb7-all-channel-tab" : `wb6-channel-tab-${value}`}`, {
        type: "button",
        role: "tab",
        text: value < 0 ? wb6t("allChannels") : channelLabel(value),
        "aria-selected": active ? "true" : "false",
        tabindex: active ? "0" : "-1",
        style: value < 0 ? "--wb6-channel-color:var(--wb4-accent)" : `--wb6-channel-color:var(--part${value})`
      });
      button.dataset.channelIndex = String(value);
      button.dataset.channelScope = scope;
      button.addEventListener("click", () => activateChannelView(value));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = Math.max(0, values.indexOf(includeAll ? state.activeChannelView : state.activeChannel));
        let target = current;
        if (event.key === "ArrowLeft") target = (current + values.length - 1) % values.length;
        if (event.key === "ArrowRight") target = (current + 1) % values.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = values.length - 1;
        activateChannelView(values[target]);
        buttons[target]?.focus();
      });
      tabs.append(button);
      buttons.push(button);
    });
    state.ui.channelTabGroups ||= [];
    state.ui.channelTabGroups.push(buttons);
    return tabs;
  }

  function commonValue(getter) {
    const values = ensureChannelDraft().channels.map(getter);
    return { value: values[0], mixed: values.some(value => String(value) !== String(values[0])) };
  }

  function syncMidiQuantizeControl() {
    const control = state.ui.quantizeControl;
    if (!control) return;
    control.setValue(String(state.midiQuantizeDivision), { silent: true });
    control.querySelectorAll("button").forEach(button => {
      button.disabled = !state.midiQuantizeAvailable;
      button.title = state.midiQuantizeAvailable ? "" : wb6t("noInstrumentSource");
    });
    control.classList.toggle("is-disabled", !state.midiQuantizeAvailable);
  }

  function scheduleChannelCountsUpdate() {
    if (state.channelCountFrame) cancelAnimationFrame(state.channelCountFrame);
    state.channelCountFrame = requestAnimationFrame(() => {
      state.channelCountFrame = 0;
      updateChannelCodeCount();
    });
  }

  function updateChannelCodeCount(index = state.activeChannelView) {
    const mainText = String($("mainMml")?.value || "");
    const mainParts = normalizeMainToParts(mainText);
    const counts = [];
    for (let partIndex = 0; partIndex < 6; partIndex += 1) {
      const partText = String(mainParts[partIndex] || $(`part${partIndex}`)?.value || "");
      const count = partText.length;
      counts.push(count);
      const countNode = state.ui.channelCharCounts?.[partIndex];
      if (countNode) {
        const formatted = Number(count).toLocaleString(document.documentElement.lang || undefined);
        countNode.textContent = lang() === "en" ? `${formatted} ${t("chars")}` : `${formatted}${t("chars")}`;
      }
    }

    const allChannels = Number(index) < 0;
    const metricText = allChannels ? mainText : String(mainParts[index] || $(`part${index}`)?.value || "");
    const charValue = allChannels ? mainText.length : Number(counts[index] || 0);
    const restValue = (metricText.match(/r(?=\s*(?:\d|\.|&|[a-g<>ovtln#+,;@-]|$))/gi) || []).length;
    const volumeValue = (metricText.match(/v\s*\d+/gi) || []).length;
    const formatMetric = value => Number(value || 0).toLocaleString(document.documentElement.lang || undefined);

    if (state.ui.codeCount) {
      const count = formatMetric(charValue);
      state.ui.codeCount.textContent = lang() === "en" ? `${count} ${t("chars")}` : `${count}${t("chars")}`;
      state.ui.codeCount.className = allChannels
        ? "char-count wb4-channel-code-count wb6-code-count wb7-all-code-count wb10-code-metric-value"
        : `char-count wb4-channel-code-count wb6-code-count part-count-${index} wb10-code-metric-value`;
    }
    if (state.ui.codeRestCount) state.ui.codeRestCount.textContent = t("itemCount", [formatMetric(restValue)]);
    if (state.ui.codeVolumeCount) state.ui.codeVolumeCount.textContent = t("itemCount", [formatMetric(volumeValue)]);
  }

  function buildOverviewBlock(canvas) {
    const block = el("section", "wb4-block wb6-overview-block", {
      "data-active-channel": state.activeChannel
    });
    state.ui.overviewBlock = block;
    const countStrip = el("div", "wb6-channel-count-strip", {
      "aria-label": wb6t("charsSummary")
    });
    state.ui.channelCharCounts = [];
    for (let index = 0; index < 6; index += 1) {
      const item = el("div", `wb6-channel-count wb6-channel-count-${index}`, {
        style: `--wb6-channel-color:var(--part${index})`
      });
      const name = el("span", "wb6-channel-count-name", { text: channelLabel(index) });
      const value = el("strong", "wb6-channel-count-value", { text: lang() === "en" ? `0 ${t("chars")}` : `0${t("chars")}` });
      item.append(name, value);
      countStrip.append(item);
      state.ui.channelCharCounts.push(value);
    }
    const common = buildCommonOptions();
    block.append(countStrip, common);
    canvas.append(block);
  }

  function buildInstrumentWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-instrument-panel wb7-instrument-panel", {
      role: "tabpanel",
      "data-workspace-panel": "instrument",
      hidden: true
    });
    state.ui.instrumentApplyBar = el("div", "wb11-pending-apply wb11-instrument-apply", {
      role: "status",
      "aria-live": "polite",
      hidden: true
    });
    const pendingText = keyedText("instrumentPending", "wb11-pending-apply-text");
    state.ui.instrumentCancelButton = $("midiConvertCancel");
    state.ui.instrumentApplyButton = $("midiConvertApply");
    const pendingActions = el("div", "wb11-pending-actions wb13-instrument-pending-actions");
    if (state.ui.instrumentCancelButton) {
      state.ui.instrumentCancelButton.removeAttribute("data-i18n");
      state.ui.instrumentCancelButton.textContent = t("cancel");
      state.ui.instrumentCancelButton.className = "wb11-cancel-button wb13-instrument-cancel-button";
      pendingActions.append(state.ui.instrumentCancelButton);
    }
    if (state.ui.instrumentApplyButton) {
      state.ui.instrumentApplyButton.removeAttribute("data-i18n");
      state.ui.instrumentApplyButton.setAttribute("data-wb4-text", "apply");
      state.ui.instrumentApplyButton.textContent = t("apply");
      state.ui.instrumentApplyButton.className = "wb11-apply-button primary";
      pendingActions.append(state.ui.instrumentApplyButton);
    }
    state.ui.instrumentApplyBar.append(pendingText, pendingActions);
    state.ui.assignmentHost = el("div", "wb4-assignment-host wb6-assignment-host");
    state.ui.assignmentEmpty = wb6Text("noInstrumentSource", "wb4-assignment-empty wb6-assignment-empty");
    state.ui.assignmentHost.append(state.ui.assignmentEmpty);
    panel.append(state.ui.instrumentApplyBar, state.ui.assignmentHost);
    return panel;
  }

  function buildCodeWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-code-panel", {
      role: "tabpanel",
      "data-workspace-panel": "code",
      hidden: true,
      "data-active-channel": String(state.activeChannelView)
    });
    panel.append(createChannelTabs("code", true));
    const tools = el("div", "wb4-channel-code-tools wb6-code-tools wb10-code-tools");
    const metrics = el("div", "wb10-code-metrics", { role: "group", "aria-label": t("codeEdit") });
    const createMetric = (key, valueNode) => {
      const item = el("div", "wb10-code-metric");
      item.append(keyedText(key, "wb10-code-metric-label"), valueNode);
      return item;
    };

    state.ui.codeCount = $("charCount") || el("span", "char-count wb4-channel-code-count wb6-code-count");
    state.ui.codeCount.replaceChildren();
    state.ui.codeCount.className = "char-count wb4-channel-code-count wb6-code-count wb10-code-metric-value";
    state.ui.codeRestCount = el("strong", "wb10-code-metric-value", { text: t("itemCount", [0]) });
    state.ui.codeVolumeCount = el("strong", "wb10-code-metric-value", { text: t("itemCount", [0]) });
    metrics.append(
      createMetric("codeChars", state.ui.codeCount),
      createMetric("codeRests", state.ui.codeRestCount),
      createMetric("codeVolumes", state.ui.codeVolumeCount)
    );
    tools.append(metrics);

    state.ui.codeHelpButton = $("codeHelpBtn");
    if (state.ui.codeHelpButton) {
      state.ui.codeHelpButton.removeAttribute("data-i18n");
      state.ui.codeHelpButton.textContent = t("codeHelp");
      state.ui.codeHelpButton.className = "wb4-code-help-button wb6-code-help-button";
      tools.append(state.ui.codeHelpButton);
    }
    state.ui.codeEditorHost = el("div", "wb4-channel-code-editor wb6-channel-code-editor", { id: "wb4ChannelCodeEditor" });
    panel.append(tools, state.ui.codeEditorHost);
    return panel;
  }

  function buildCopyWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-copy-panel", {
      role: "tabpanel",
      "data-workspace-panel": "copy"
    });
    state.ui.copyRows = el("div", "wb4-copy-results");
    state.ui.copyInlineHost = el("div", "wb4-inline-host");
    panel.append(state.ui.copyRows, state.ui.copyInlineHost);
    return panel;
  }

  function buildWorkspaceBlock(canvas) {
    const block = el("section", "wb4-block wb6-workspace-block", {
      "data-active-channel": state.activeChannel
    });
    state.ui.workspaceBlock = block;
    const tabs = el("div", "wb6-workspace-tabs", { role: "tablist" });
    const definitions = [
      ["copy", "copyTab"],
      ["instrument", "instrumentTab"],
      ["channel", "channelOptionTab"],
      ["code", "codeTab"]
    ];
    state.ui.workspaceTabs = [];
    definitions.forEach(([name, key], index) => {
      const button = el("button", "wb6-workspace-tab", {
        type: "button",
        role: "tab",
        "data-workspace-tab": name,
        "data-wb6-text": key,
        text: wb6t(key),
        "aria-selected": index === 0 ? "true" : "false",
        tabindex: index === 0 ? "0" : "-1"
      });
      button.addEventListener("click", () => activateWorkspaceTab(name));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = definitions.findIndex(item => item[0] === state.activeWorkspaceTab);
        let target = current;
        if (event.key === "ArrowLeft") target = (current + definitions.length - 1) % definitions.length;
        if (event.key === "ArrowRight") target = (current + 1) % definitions.length;
        if (event.key === "Home") target = 0;
        if (event.key === "End") target = definitions.length - 1;
        activateWorkspaceTab(definitions[target][0]);
        state.ui.workspaceTabs[target]?.focus();
      });
      tabs.append(button);
      state.ui.workspaceTabs.push(button);
    });

    state.ui.workspacePanels = {
      copy: buildCopyWorkspacePanel(),
      instrument: buildInstrumentWorkspacePanel(),
      channel: buildChannelOptionsWorkspacePanel(),
      code: buildCodeWorkspacePanel()
    };
    block.append(tabs, ...Object.values(state.ui.workspacePanels));
    canvas.append(block);
    activateWorkspaceTab(state.activeWorkspaceTab || "copy");
  }

  function syncChannelCodeEditor() {
    const view = state.activeChannelView;
    const panelName = view < 0 ? "main" : `part${view}`;
    const panel = document.querySelector(`.mml-panel[data-panel="${panelName}"]`);
    if (panel && state.ui.codeEditorHost) {
      state.ui.codeEditorHost.querySelectorAll(".mml-panel").forEach(item => { item.hidden = true; });
      state.ui.codeEditorHost.append(panel);
      panel.hidden = false;
    }
    const hiddenTab = document.querySelector(`.tab-btn[data-tab="${panelName}"]`);
    if (hiddenTab) hiddenTab.click();
    updateChannelCodeCount(view);
  }

  function activateChannel(index) {
    activateChannelView(index);
  }

  function buildShell() {
    document.body.classList.add("player-ui");
    state.activeWorkspaceTab = "copy";
    state.activeChannelView = 0;
    state.originalPreview = false;
    state.ui.channelTabGroups = [];
    buildHeaderActions();
    const shell = el("section", "wb4-shell wb6-shell wb7-shell wb8-shell");
    const canvas = el("div", "wb4-canvas wb6-canvas wb7-canvas wb8-canvas");
    state.ui.canvas = canvas;
    state.ui.legacyHost = el("div", "wb4-legacy-host", { hidden: true });
    buildTitle(canvas);
    buildWorkflowHead(canvas, 1, "workflow.play_title", "workflow.play_description", true);
    buildSourceBlock(canvas);
    buildPreviewBlock(canvas);
    buildWorkflowHead(canvas, 2, "workflow.global_title", "workflow.global_description");
    buildOverviewBlock(canvas);
    buildWorkflowHead(canvas, 3, "workflow.copy_detail_title", "workflow.copy_detail_description");
    buildWorkspaceBlock(canvas);
    // Move the retained copy/save controls before the legacy file toolbar is removed.
    // app.js binds these elements synchronously immediately after this script.
    renderCopyRows();
    state.ui.legacyHost.append(editorCard);
    canvas.append(state.ui.legacyHost);
    shell.append(canvas);
    main.replaceChildren(shell);
    fileToolbar.remove();
    menuCard.remove();
    activateChannelView(state.activeChannelView);
  }

  const TUTORIAL_STEPS = Object.freeze([
    { image: "01-source.webp", title: "tutorial.step1.title", body: "tutorial.step1.body", note: "tutorial.step1.note" },
    { image: "02-common-options.webp", title: "tutorial.step2.title", body: "tutorial.step2.body", note: "tutorial.step2.note" },
    { image: "03-midi-settings.webp", title: "tutorial.step3.title", body: "tutorial.step3.body", note: "tutorial.step3.note" },
    { image: "04-channel-options.webp", title: "tutorial.step4.title", body: "tutorial.step4.body", note: "tutorial.step4.note" },
    { image: "05-preview.webp", title: "tutorial.step5.title", body: "tutorial.step5.body", note: "tutorial.step5.note" },
    { image: "06-copy.webp", title: "tutorial.step6.title", body: "tutorial.step6.body", note: "tutorial.step6.note" }
  ]);
  let tutorialStepIndex = 0;

  function tutorialLanguageFolder() {
    const current = lang();
    return ["ko", "en", "ja", "zh-CN", "zh-TW"].includes(current) ? current : "en";
  }

  function tutorialText(key, fallback = "") {
    return appText(key, fallback || key);
  }

  function tutorialFormat(key, values = [], fallback = "") {
    return localeText(key, values, fallback || key);
  }

  function renderTutorialStep() {
    const dialog = state.ui.tutorialDialog;
    if (!dialog) return;
    tutorialStepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(tutorialStepIndex) || 0));
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    const title = tutorialText(step.title, `Step ${tutorialStepIndex + 1}`);
    const folder = tutorialLanguageFolder();
    if (state.ui.tutorialStepTitle) state.ui.tutorialStepTitle.textContent = title;
    if (state.ui.tutorialBody) state.ui.tutorialBody.textContent = tutorialText(step.body, "");
    if (state.ui.tutorialNote) state.ui.tutorialNote.textContent = tutorialText(step.note, "");
    if (state.ui.tutorialProgress) state.ui.tutorialProgress.textContent = tutorialFormat(
      "tutorial.progress",
      [tutorialStepIndex + 1, TUTORIAL_STEPS.length],
      `${tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}`
    );
    if (state.ui.tutorialImage) {
      state.ui.tutorialImage.hidden = false;
      state.ui.tutorialImage.src = `assets/tutorial/${folder}/${step.image}?rev=20260824-final42`;
      state.ui.tutorialImage.alt = tutorialFormat("tutorial.image_alt", [title], `${title} screen example`);
    }
    if (state.ui.tutorialImageFallback) state.ui.tutorialImageFallback.hidden = true;
    if (state.ui.tutorialPrev) {
      state.ui.tutorialPrev.disabled = tutorialStepIndex === 0;
      state.ui.tutorialPrev.textContent = tutorialText("tutorial.prev", "Previous");
    }
    if (state.ui.tutorialNext) {
      const last = tutorialStepIndex === TUTORIAL_STEPS.length - 1;
      state.ui.tutorialNext.textContent = tutorialText(last ? "tutorial.finish" : "tutorial.next", last ? "Done" : "Next");
    }
    state.ui.tutorialDots?.forEach((button, index) => {
      const active = index === tutorialStepIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "step" : "false");
      button.setAttribute("aria-label", tutorialFormat("tutorial.jump", [index + 1], `Go to step ${index + 1}`));
    });
    const next = TUTORIAL_STEPS[tutorialStepIndex + 1];
    if (next) {
      const preload = new Image();
      preload.src = `assets/tutorial/${folder}/${next.image}?rev=20260824-final42`;
    }
  }

  function updateTutorialLocale() {
    if (!state.ui.tutorialDialog) return;
    if (state.ui.tutorialDialogTitle) state.ui.tutorialDialogTitle.textContent = tutorialText("tutorial.title", "Quick tutorial");
    if (state.ui.tutorialClose) {
      state.ui.tutorialClose.textContent = tutorialText("tutorial.close", "Close");
      state.ui.tutorialClose.setAttribute("aria-label", tutorialText("tutorial.close", "Close"));
    }
    if (state.ui.tutorialImageFallback) state.ui.tutorialImageFallback.textContent = tutorialText("tutorial.image_error", "Preview image unavailable.");
    renderTutorialStep();
  }

  function installTutorial() {
    const button = state.ui.tutorialButton;
    if (!button || state.ui.tutorialDialog) return;
    const dialog = el("dialog", "wb14-tutorial-dialog", { id: "playerTutorialDialog", "aria-labelledby": "playerTutorialTitle" });
    const card = el("div", "wb14-tutorial-card");
    const head = el("header", "wb14-tutorial-head");
    const headText = el("div", "wb14-tutorial-head-text");
    state.ui.tutorialDialogTitle = el("h2", "wb14-tutorial-title", { id: "playerTutorialTitle" });
    state.ui.tutorialProgress = el("span", "wb14-tutorial-progress");
    headText.append(state.ui.tutorialDialogTitle, state.ui.tutorialProgress);
    state.ui.tutorialClose = el("button", "wb14-tutorial-close", { type: "button" });
    head.append(headText, state.ui.tutorialClose);

    const content = el("div", "wb14-tutorial-content");
    const visual = el("div", "wb14-tutorial-visual");
    state.ui.tutorialImage = el("img", "wb14-tutorial-image", { decoding: "async" });
    state.ui.tutorialImageFallback = el("p", "wb14-tutorial-image-fallback", { hidden: true });
    state.ui.tutorialImage.addEventListener("error", () => {
      state.ui.tutorialImage.hidden = true;
      state.ui.tutorialImageFallback.hidden = false;
    });
    visual.append(state.ui.tutorialImage, state.ui.tutorialImageFallback);

    const copy = el("div", "wb14-tutorial-copy");
    state.ui.tutorialStepTitle = el("h3", "wb14-tutorial-step-title");
    state.ui.tutorialBody = el("p", "wb14-tutorial-body");
    state.ui.tutorialNote = el("p", "wb14-tutorial-note");
    copy.append(state.ui.tutorialStepTitle, state.ui.tutorialBody, state.ui.tutorialNote);
    content.append(visual, copy);

    const footer = el("footer", "wb14-tutorial-footer");
    const dots = el("div", "wb14-tutorial-dots", { role: "group" });
    state.ui.tutorialDots = TUTORIAL_STEPS.map((_, index) => {
      const dot = el("button", "wb14-tutorial-dot", { type: "button" });
      dot.addEventListener("click", () => { tutorialStepIndex = index; renderTutorialStep(); });
      dots.append(dot);
      return dot;
    });
    const nav = el("div", "wb14-tutorial-nav");
    state.ui.tutorialPrev = el("button", "wb14-tutorial-prev", { type: "button" });
    state.ui.tutorialNext = el("button", "wb14-tutorial-next primary", { type: "button" });
    nav.append(state.ui.tutorialPrev, state.ui.tutorialNext);
    footer.append(dots, nav);
    card.append(head, content, footer);
    dialog.append(card);
    document.body.append(dialog);
    state.ui.tutorialDialog = dialog;

    const close = () => { if (dialog.open) dialog.close(); };
    button.addEventListener("click", () => {
      tutorialStepIndex = 0;
      updateTutorialLocale();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => state.ui.tutorialNext?.focus());
    });
    state.ui.tutorialClose.addEventListener("click", close);
    state.ui.tutorialPrev.addEventListener("click", () => {
      if (tutorialStepIndex <= 0) return;
      tutorialStepIndex -= 1;
      renderTutorialStep();
    });
    state.ui.tutorialNext.addEventListener("click", () => {
      if (tutorialStepIndex >= TUTORIAL_STEPS.length - 1) { close(); return; }
      tutorialStepIndex += 1;
      renderTutorialStep();
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("pointerdown", event => { if (event.target === dialog) close(); });
    dialog.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" && tutorialStepIndex > 0) {
        event.preventDefault(); tutorialStepIndex -= 1; renderTutorialStep();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (tutorialStepIndex < TUTORIAL_STEPS.length - 1) { tutorialStepIndex += 1; renderTutorialStep(); }
      }
    });
    updateTutorialLocale();
  }

  function targetForPanel(id) {
    if (id === "midiConvertDialog" || id === "midiBulkAssignDialog") return state.ui.assignmentHost;
    if (id === "mmiImportDialog") return state.ui.sourceInlineHost;
    if (id === "googleDriveSaveDialog") return state.ui.copyInlineHost;
    return state.ui.legacyHost;
  }

  function registerPanel(panel) {
    const target = targetForPanel(panel.id) || state.ui.legacyHost;
    const local = { open: false, returnValue: "" };
    state.panelState.set(panel, local);
    panel.classList.add("wb4-inline-panel");
    panel.hidden = true;
    panel.removeAttribute("aria-modal");
    panel.setAttribute("role", "region");
    Object.defineProperty(panel, "open", {
      configurable: true,
      enumerable: true,
      get: () => local.open,
      set: value => value ? panel.showModal() : panel.close()
    });
    Object.defineProperty(panel, "returnValue", {
      configurable: true,
      enumerable: true,
      get: () => local.returnValue,
      set: value => { local.returnValue = String(value ?? ""); }
    });
    panel.showModal = () => {
      local.open = true;
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      if (panel.id === "midiConvertDialog") {
        activateWorkspaceTab("instrument");
        state.ui.assignmentEmpty.hidden = true;
        const leftHead = panel.querySelector(".midi-left-panel .dialog-section-head strong");
        if (leftHead) {
          leftHead.removeAttribute("data-i18n");
          leftHead.textContent = wb6t("channelSettings");
        }
        const rightHead = panel.querySelector("#midiInstrumentPanelTitle");
        if (rightHead) {
          rightHead.removeAttribute("data-i18n");
          rightHead.textContent = wb6t("instrumentSettings");
        }
        updateMidiChannelFilter();
        requestAnimationFrame(updateMidiChannelFilter);
      }
      state.openPanels.push(panel);
      if (target === state.ui.legacyHost) panel.hidden = true;
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    panel.show = panel.showModal;
    panel.close = (value = "") => {
      if (!local.open) return;
      local.open = false;
      local.returnValue = String(value ?? "");
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      const index = state.openPanels.lastIndexOf(panel);
      if (index >= 0) state.openPanels.splice(index, 1);
      panel.dispatchEvent(new Event("close"));
    };
    target?.append(panel);
  }

  function convertDialogs() {
    const nativePopupIds = new Set(["tempoEditDialog", "partSoundDialog", "codeHelpDialog", "pasteMmlDialog", "midiBulkAssignDialog"]);
    Array.from(document.querySelectorAll("dialog")).forEach(dialog => {
      if (nativePopupIds.has(dialog.id)) return;
      const panel = el("section", `${dialog.className} wb4-converted-dialog`);
      for (const attr of Array.from(dialog.attributes)) {
        if (["class", "open", "aria-modal"].includes(attr.name)) continue;
        panel.setAttribute(attr.name, attr.value);
      }
      while (dialog.firstChild) panel.append(dialog.firstChild);
      dialog.replaceWith(panel);
      registerPanel(panel);
    });
    state.ui.assignmentHost?.addEventListener("change", event => {
      if (event.target.closest("#midiConvertDialog")) scheduleMidiAutoApply();
    });
    state.ui.assignmentHost?.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || !button.closest("#midiConvertDialog")) return;
      if (["midiBulkAssignBtn", "midiConvertReloadFile", "midiConvertGoogleDriveLoad", "midiConvertApply", "midiConvertCancel"].includes(button.id)) return;
      if (button.closest("#midiBulkAssignDialog")) return;
      scheduleMidiAutoApply();
    });
  }

  function installGlobalHandling() {
    window.addEventListener("mobibard:source-baseline", event => receiveSourceBaseline(event.detail || {}));
    window.addEventListener("mobibard:midi-settings-dirty", () => {
      queueMicrotask(() => refreshInstrumentDirtyState());
    });
    window.addEventListener("mobibard:midi-settings-cancelled", () => {
      setInstrumentDirty(false);
      clearPendingPlaybackPreview();
      showToast(t("instrumentCancelled"), "info");
      scheduleSessionPersist();
    });
    window.addEventListener("mobibard:midi-convert-complete", event => {
      if (event.detail?.name) setSourceName(event.detail.name);
      setInstrumentDirty(false);
      clearPendingPlaybackPreview();
      scheduleSessionPersist();
      activateWorkspaceTab("instrument");
      scheduleChannelCountsUpdate();
      renderCopyRows();
    });
    window.addEventListener("mobibard:original-preview-availability", event => {
      state.originalPreviewAvailable = Boolean(event.detail?.available);
      if (!state.originalPreviewAvailable && state.ui.originalCheckbox) state.ui.originalCheckbox.checked = false;
      syncOriginalPreviewSource();
    });
    window.addEventListener("mobibard:original-preview-state", event => {
      const active = Boolean(event.detail?.active) && state.originalPreviewAvailable;
      state.originalPreview = active;
      if (state.ui.originalCheckbox) {
        state.ui.originalCheckbox.checked = active;
        state.ui.originalCheckbox.setAttribute("aria-checked", active ? "true" : "false");
      }
      state.ui.previewBlock?.classList.toggle("is-original-preview", active);
    });
    window.addEventListener("mobibard:midi-quantize-state", event => {
      state.midiQuantizeAvailable = Boolean(event.detail?.available);
      state.midiQuantizeDivision = Number(event.detail?.division) === 32 ? 32 : 64;
      syncMidiQuantizeControl();
    });
    window.addEventListener("mobibard:localechange", updateLocalText);
    $("mainMml")?.addEventListener("input", event => {
      if (!state.applying) {
        state.manualEdited = true;
        invalidateCopySplitPlan();
        if (event.isTrusted) markPlayerEdited();
      }
      scheduleChannelCountsUpdate();
      scheduleCopyRowsRender();
      scheduleSessionPersist();
    });
    for (let index = 0; index < 6; index += 1) {
      $(`part${index}`)?.addEventListener("input", event => {
        if (!state.applying && event.isTrusted) markPlayerEdited();
        scheduleChannelCountsUpdate();
        scheduleCopyRowsRender();
        scheduleSessionPersist();
      });
    }
    window.addEventListener("resize", syncPlaybackChannelPlacement, { passive: true });
    window.addEventListener("pagehide", () => { if (state.sessionHasUserEdit && state.sourceMml) void persistLastPlayerSession(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.sessionHasUserEdit && state.sourceMml) void persistLastPlayerSession();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".wb13-modal-confirm:not([hidden])")) return;
      const panel = [...state.openPanels].reverse().find(item => item.open && !item.hidden);
      if (!panel) return;
      const cancel = new Event("cancel", { cancelable: true });
      if (panel.dispatchEvent(cancel)) panel.close("escape");
    }, true);
  }

  /* PlayerUi v9: immediate source-based options, compact metrics, and cached transforms. */
  function wb9NumberControl({ min, max, step = 1, value, suffix = "", label = "", onChange }) {
    const wrap = el("div", "wb9-number-control");
    const numericStep = Math.max(Number.EPSILON, Number(step) || 1);
    const decimals = String(numericStep).includes(".") ? String(numericStep).split(".")[1].length : 0;
    let current = Number(value) || 0;
    const input = el("input", "wb4-number wb9-number-input", {
      type: "number", min, max, step: numericStep, value: current,
      "aria-label": label || undefined
    });
    const buttonWrap = el("div", "wb9-number-step-buttons");
    const up = el("button", "wb9-number-step is-up", {
      type: "button", text: "▲",
      "aria-label": t("increaseValue", [label || t("promptValue")])
    });
    const down = el("button", "wb9-number-step is-down", {
      type: "button", text: "▼",
      "aria-label": t("decreaseValue", [label || t("promptValue")])
    });
    const suffixNode = suffix ? el("span", "wb4-number-suffix wb9-number-suffix", { text: suffix }) : null;
    const normalize = raw => {
      let next = Number(raw);
      if (!Number.isFinite(next)) next = current;
      next = Math.max(Number(min), Math.min(Number(max), next));
      next = Math.round(next / numericStep) * numericStep;
      return Number(next.toFixed(decimals));
    };
    const format = next => decimals > 0 ? Number(next).toFixed(decimals).replace(/\.0+$/, "") : String(Math.round(next));
    const syncButtons = () => {
      up.disabled = current >= Number(max);
      down.disabled = current <= Number(min);
    };
    const setValue = (raw, { silent = true, mixed = false } = {}) => {
      const next = normalize(raw);
      current = next;
      input.value = mixed ? "" : format(next);
      input.placeholder = mixed ? t("mixedValues") : "";
      wrap.dataset.mixed = mixed ? "true" : "false";
      syncButtons();
      if (!silent && !mixed) onChange(next);
    };
    const stepBy = direction => {
      const base = input.value === "" ? current : Number(input.value);
      setValue(base + numericStep * direction, { silent: false });
      input.focus();
    };
    up.addEventListener("click", () => stepBy(1));
    down.addEventListener("click", () => stepBy(-1));
    input.addEventListener("change", () => setValue(input.value, { silent: false }));
    input.addEventListener("blur", () => setValue(input.value, { silent: true }));
    wrap.setValue = setValue;
    wrap.setSuffix = text => {
      if (suffixNode) suffixNode.textContent = String(text ?? "");
    };
    wrap._input = input;
    buttonWrap.append(up, down);
    wrap.append(input, buttonWrap);
    if (suffixNode) wrap.append(suffixNode);
    setValue(current);
    return wrap;
  }

  function scheduleCopyRowsRender() {
    state.copyDirty = true;
    if (state.activeWorkspaceTab !== "copy") return;
    if (state.copyRenderFrame) cancelAnimationFrame(state.copyRenderFrame);
    state.copyRenderFrame = requestAnimationFrame(() => {
      state.copyRenderFrame = 0;
      if (!state.copyDirty) return;
      state.copyDirty = false;
      renderCopyRows();
    });
  }

  function getRestRemovalCounts(mode) {
    if (!state.sourceMml || mode === "keep") return Array.from({ length: 6 }, () => 0);
    if (state.metricsCache.sourceVersion !== state.sourceVersion) {
      state.metricsCache.sourceVersion = state.sourceVersion;
      state.metricsCache.restInput = "";
      state.metricsCache.rest = new Map();
    }
    if (state.metricsCache.rest.has(mode)) return state.metricsCache.rest.get(mode);
    const metricInput = state.metricsCache.restInput || state.sourceMml;
    let counts = Array.from({ length: 6 }, () => 0);
    try {
      const result = window.MabiOptimizer?.countShortRestsMml?.(metricInput, {
        partCount: 6,
        all: mode === "all",
        denom: mode === "all" ? 64 : Number(mode)
      });
      counts = Array.from({ length: 6 }, (_, index) => Math.max(0, Number(result?.counts?.[index]) || 0));
    } catch (_) {}
    state.metricsCache.rest.set(mode, counts);
    return counts;
  }

  function getNoteMetricStats(source) {
    const input = String(source || "");
    if (state.metricsCache.noteStatsSource === input && state.metricsCache.noteStats.length === 6) return state.metricsCache.noteStats;
    const parts = normalizeMainToParts(input);
    const stats = parts.map((part, index) => {
      if (!part) return { total: 0, volumeCounts: [], minMidi: null, maxMidi: null };
      try {
        const notes = window.MabiMml?.parseMmlPart?.(part, index)?.notes || [];
        const volumes = new Map();
        let minMidi = Infinity;
        let maxMidi = -Infinity;
        for (const note of notes) {
          const volume = Math.max(0, Math.min(15, Math.round(Number(note?.volume ?? 8))));
          volumes.set(volume, (volumes.get(volume) || 0) + 1);
          const midi = Math.max(0, Math.min(127, Math.round(Number(note?.midi) || 0)));
          minMidi = Math.min(minMidi, midi);
          maxMidi = Math.max(maxMidi, midi);
        }
        return {
          total: notes.length,
          volumeCounts: [...volumes.entries()],
          minMidi: Number.isFinite(minMidi) ? minMidi : null,
          maxMidi: Number.isFinite(maxMidi) ? maxMidi : null
        };
      } catch (_) {
        return { total: 0, volumeCounts: [], minMidi: null, maxMidi: null };
      }
    });
    state.metricsCache.noteStatsSource = input;
    state.metricsCache.noteStats = stats;
    return stats;
  }

  function getVolumeDistributions() {
    const source = String($("mainMml")?.value || "");
    const draft = ensureChannelDraft().channels;
    const adjustments = draft.map((channel, index) => Number(channel.volumeDelta || 0) - Number(state.options.channels[index]?.volumeDelta || 0));
    const cacheKey = `${source}
#draft-volume:${adjustments.join(",")}`;
    if (state.metricsCache.volumeSource === cacheKey && state.metricsCache.volume.length === 6) return state.metricsCache.volume;
    const baseStats = getNoteMetricStats(source);
    const rows = baseStats.map((stats, index) => {
      if (!stats?.total) return { total: 0, items: [] };
      const counts = new Map();
      const delta = adjustments[index] || 0;
      for (const [baseVolume, count] of stats.volumeCounts || []) {
        const volume = Math.max(0, Math.min(15, Math.round(Number(baseVolume) + delta)));
        counts.set(volume, (counts.get(volume) || 0) + Number(count || 0));
      }
      return {
        total: stats.total,
        items: [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([volume, count]) => ({ volume, count }))
      };
    });
    state.metricsCache.volumeSource = cacheKey;
    state.metricsCache.volume = rows;
    return rows;
  }

  function getOctaveRanges() {
    const source = String($("mainMml")?.value || "");
    const baseStats = getNoteMetricStats(source);
    const draft = ensureChannelDraft().channels;
    return baseStats.map((stats, index) => {
      if (!stats?.total || stats.minMidi == null || stats.maxMidi == null) return null;
      const delta = (Number(draft[index]?.octaveDelta) || 0) - (Number(state.options.channels[index]?.octaveDelta) || 0);
      const minMidi = Math.max(0, Math.min(127, Math.round(stats.minMidi + delta * 12)));
      const maxMidi = Math.max(0, Math.min(127, Math.round(stats.maxMidi + delta * 12)));
      return {
        min: Math.max(0, Math.min(9, Math.floor(minMidi / 12) - 1)),
        max: Math.max(0, Math.min(9, Math.floor(maxMidi / 12) - 1)),
        count: stats.total
      };
    });
  }

  function renderOctaveRange(node, range) {
    if (!node) return;
    node.textContent = range ? `O${range.min} – O${range.max}` : t("noNotes");
    node.classList.toggle("is-empty", !range);
  }

  function setCountBadge(node, count) {
    if (!node) return;
    node.textContent = t("itemCount", [Math.max(0, Number(count) || 0).toLocaleString(document.documentElement.lang || undefined)]);
  }

  function renderVolumeChips(node, items) {
    if (!node) return;
    node.replaceChildren();
    const values = Array.isArray(items) ? items : [];
    if (!values.length) {
      node.append(el("span", "wb9-volume-chip is-empty", { text: "V-" }));
      return;
    }
    values.forEach(({ volume, count }) => node.append(el("span", "wb9-volume-chip", {
      text: `V${volume} × ${Number(count).toLocaleString(document.documentElement.lang || undefined)}`
    })));
  }

  function updateOptionMetrics() {
    if (!state.ui.featurePanels || state.activeWorkspaceTab !== "channel") return;
    if (state.activeOptionFeature === "rest") {
      const channelCounts = ensureChannelDraft().channels.map((channel, index) => getRestRemovalCounts(channel.restMode)[index] || 0);
      setCountBadge(state.ui.restBatchMetric, channelCounts.reduce((sum, count) => sum + count, 0));
      (state.ui.restMetricNodes || []).forEach((node, index) => setCountBadge(node, channelCounts[index]));
      return;
    }
    if (state.activeOptionFeature === "volume") {
      const rows = getVolumeDistributions();
      rows.forEach((row, index) => {
        const metric = state.ui.volumeMetricNodes?.[index];
        renderVolumeChips(metric?.detail, row.items);
      });
      return;
    }
    if (state.activeOptionFeature === "octave") {
      const ranges = getOctaveRanges();
      (state.ui.octaveMetricNodes || []).forEach((node, index) => renderOctaveRange(node, ranges[index]));
      const valid = ranges.filter(Boolean);
      renderOctaveRange(state.ui.octaveBatchMetric, valid.length ? {
        min: Math.min(...valid.map(item => item.min)),
        max: Math.max(...valid.map(item => item.max))
      } : null);
    }
  }

  function scheduleOptionMetricsUpdate() {
    state.metricsDirty = true;
    if (state.activeWorkspaceTab !== "channel") return;
    if (state.metricsIdleHandle) {
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(state.metricsIdleHandle);
      else clearTimeout(state.metricsIdleHandle);
    }
    const run = () => {
      state.metricsIdleHandle = 0;
      if (!state.metricsDirty || state.activeWorkspaceTab !== "channel") return;
      state.metricsDirty = false;
      updateOptionMetrics();
    };
    state.metricsIdleHandle = typeof requestIdleCallback === "function"
      ? requestIdleCallback(run, { timeout: 180 })
      : window.setTimeout(run, 50);
  }

  function syncFeatureBatchState(feature) {
    const refs = state.ui.featureControls?.[feature];
    if (!refs) return;
    const getter = feature === "rest"
      ? channel => channel.restMode
      : feature === "volume"
        ? channel => channel.volumeDelta
        : channel => channel.octaveDelta;
    const values = ensureChannelDraft().channels.map(getter);
    const value = { value: values[0], mixed: values.some(item => String(item) !== String(values[0])) };
    refs.batch?.setValue(value.value, { mixed: value.mixed });
  }

  function wb9OptionListRow({ index = -1, control, metric = null, extraClass = "", metricPlacement = "after" }) {
    const row = el("div", `wb8-option-list-row wb9-option-list-row ${index < 0 ? "wb8-option-list-all wb9-option-list-all" : `wb8-option-list-channel wb8-option-list-channel-${index}`} ${extraClass}`.trim(), {
      style: index < 0 ? "--wb8-channel-color:var(--wb4-accent)" : `--wb8-channel-color:var(--part${index})`
    });
    const label = el("div", "wb8-option-list-label wb9-option-list-label");
    const labelText = el("strong", "wb9-option-channel-name", {
      text: index < 0 ? t("applyAll") : channelLabel(index),
      "data-wb8-channel-index": index
    });
    label.append(labelText);
    const body = el("div", "wb8-option-list-control wb9-option-list-control");
    if (metricPlacement === "top") {
      const metricRow = el("div", "wb13-option-metric-top");
      if (metric?.badge) metricRow.append(metric.badge);
      if (metric?.detail) metricRow.append(metric.detail);
      if (metricRow.childNodes.length) row.append(metricRow);
      if (control) body.append(control);
      row.append(label, body);
      return row;
    }
    if (metricPlacement === "above") {
      const metricRow = el("div", "wb13-option-metric-above");
      if (metric?.badge) metricRow.append(metric.badge);
      if (metric?.detail) metricRow.append(metric.detail);
      if (metricRow.childNodes.length) body.append(metricRow);
      if (control) body.append(control);
      row.append(label, body);
      return row;
    }
    if (metric?.badge) label.append(metric.badge);
    if (control) body.append(control);
    row.append(label, body);
    if (metric?.detail) row.append(metric.detail);
    return row;
  }

  function restDefinitions() {
    return [["keep", t("keep")], ["64", t("rest64")], ["32", t("rest32")], ["16", t("rest16")], ["8", t("rest8")], ["4", t("rest4")], ["all", t("all")]];
  }

  function buildRestFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-rest-feature wb9-rest-feature", { role: "tabpanel", "data-option-feature-panel": "rest" });
    const channels = ensureChannelDraft().channels;
    state.ui.restMetricNodes = [];
    state.ui.featureControls.rest = { channels: [] };
    const common = commonValue(channel => channel.restMode);
    const batch = segmented(restDefinitions(), common.value, value => {
      channels.forEach(channel => { channel.restMode = value; });
      state.ui.featureControls.rest.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("rest");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }, "wb9-rest-buttons wb9-rest-buttons-batch");
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.rest.batch = batch;
    state.ui.restBatchMetric = el("span", "wb9-option-count", { text: t("restRemovedNone") });
    panel.append(wb9OptionListRow({ index: -1, control: batch, metric: { badge: state.ui.restBatchMetric } }));
    channels.forEach((channel, index) => {
      const control = segmented(restDefinitions(), channel.restMode, value => {
        channel.restMode = value;
        syncFeatureBatchState("rest");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }, "wb9-rest-buttons");
      const badge = el("span", "wb9-option-count wb9-rest-count", { text: t("restRemovedNone") });
      state.ui.featureControls.rest.channels.push(control);
      state.ui.restMetricNodes.push(badge);
      panel.append(wb9OptionListRow({ index, control, metric: { badge } }));
    });
    return panel;
  }

  function buildVolumeFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-volume-feature wb9-volume-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "volume" });
    const channels = ensureChannelDraft().channels;
    state.ui.volumeMetricNodes = [];
    state.ui.volumeBatchMetric = null;
    state.ui.featureControls.volume = { channels: [] };

    const common = commonValue(channel => channel.volumeDelta);
    const batch = sliderNumber({ min: -15, max: 15, step: 1, value: common.value, onChange: value => {
      channels.forEach(channel => { channel.volumeDelta = value; });
      state.ui.featureControls.volume.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("volume");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }});
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.volume.batch = batch;
    panel.append(wb9OptionListRow({ index: -1, control: batch }));

    channels.forEach((channel, index) => {
      const control = sliderNumber({ min: -15, max: 15, step: 1, value: channel.volumeDelta, onChange: value => {
        channel.volumeDelta = value;
        syncFeatureBatchState("volume");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }});
      const metric = {
        detail: el("div", "wb9-volume-distribution wb13-volume-channel-distribution")
      };
      state.ui.featureControls.volume.channels.push(control);
      state.ui.volumeMetricNodes.push(metric);
      panel.append(wb9OptionListRow({ index, control, metric, extraClass: "wb13-volume-metric-row", metricPlacement: "top" }));
    });
    return panel;
  }

  function buildOctaveFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-octave-feature wb9-octave-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "octave" });
    const channels = ensureChannelDraft().channels;
    state.ui.octaveMetricNodes = [];
    state.ui.featureControls.octave = { channels: [] };
    state.ui.octaveBatchMetric = el("span", "wb13-octave-range wb13-octave-range-all", { text: t("noNotes") });
    const common = commonValue(channel => channel.octaveDelta);
    const batch = sliderNumber({ min: -7, max: 7, step: 1, value: common.value, onChange: value => {
      channels.forEach(channel => { channel.octaveDelta = value; });
      state.ui.featureControls.octave.channels.forEach(control => control.setValue(value));
      syncFeatureBatchState("octave");
      markChannelOptionsDirty();
      scheduleOptionMetricsUpdate();
    }});
    batch.setValue(common.value, { mixed: common.mixed });
    state.ui.featureControls.octave.batch = batch;
    panel.append(wb9OptionListRow({ index: -1, control: batch, metric: { badge: state.ui.octaveBatchMetric } }));
    channels.forEach((channel, index) => {
      const control = sliderNumber({ min: -7, max: 7, step: 1, value: channel.octaveDelta, onChange: value => {
        channel.octaveDelta = value;
        syncFeatureBatchState("octave");
        markChannelOptionsDirty();
        scheduleOptionMetricsUpdate();
      }});
      const range = el("span", "wb13-octave-range", { text: t("noNotes"), title: t("octaveRange") });
      state.ui.featureControls.octave.channels.push(control);
      state.ui.octaveMetricNodes.push(range);
      panel.append(wb9OptionListRow({ index, control, metric: { badge: range } }));
    });
    return panel;
  }

  function wb9SetMixedToggle(toggle, values) {
    const input = toggle?._input;
    if (!input) return;
    input.checked = values.every(Boolean);
    input.indeterminate = values.some(Boolean) && !values.every(Boolean);
  }

  function setToggleDisabled(toggle, disabled) {
    if (!toggle?._input) return;
    toggle._input.disabled = Boolean(disabled);
    toggle.classList.toggle("is-disabled", Boolean(disabled));
  }

  function syncAccompanimentFeatureControls() {
    const refs = state.ui.featureControls?.accompaniment;
    if (!refs) return;
    const draft = ensureChannelDraft();
    const channels = draft.channels;
    const accompanimentOption = draft.accompaniment;
    const disabled = !accompanimentOption.genre;
    if (refs.genre) refs.genre.value = accompanimentOption.genre;
    if (refs.strength) {
      refs.strength.value = accompanimentOption.strength;
      refs.strength.disabled = disabled;
    }
    wb9SetMixedToggle(refs.batch?.analysis, channels.map(item => item.accompaniment.analysis));
    wb9SetMixedToggle(refs.batch?.generation, channels.map(item => item.accompaniment.generation));
    setToggleDisabled(refs.batch?.analysis, disabled);
    setToggleDisabled(refs.batch?.generation, disabled);
    refs.channels?.forEach((control, index) => {
      const accompaniment = channels[index]?.accompaniment;
      if (!accompaniment) return;
      control.analysis._input.checked = Boolean(accompaniment.analysis);
      control.analysis._input.indeterminate = false;
      control.generation._input.checked = Boolean(accompaniment.generation);
      control.generation._input.indeterminate = false;
      setToggleDisabled(control.analysis, disabled);
      setToggleDisabled(control.generation, disabled);
    });
    refs.panel?.classList.toggle("is-genre-unselected", disabled);
  }

  function wb9AccompanimentChannelControl(channel, { batch = false } = {}) {
    const wrap = el("div", "wb8-accompaniment-channel-control wb9-accompaniment-channel-control");
    const channels = ensureChannelDraft().channels;
    const analysis = toggleControl(t("useForAnalysis"), batch ? channels.every(item => item.accompaniment.analysis) : channel.accompaniment.analysis, value => {
      if (batch) channels.forEach(item => { item.accompaniment.analysis = value; });
      else channel.accompaniment.analysis = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    });
    const generation = toggleControl(t("useForGeneration"), batch ? channels.every(item => item.accompaniment.generation) : channel.accompaniment.generation, value => {
      if (batch) channels.forEach(item => { item.accompaniment.generation = value; });
      else channel.accompaniment.generation = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    });
    wrap._controls = { analysis, generation };
    wrap.append(analysis, generation);
    return wrap;
  }

  function buildAccompanimentFeaturePanel() {
    const panel = el("section", "wb8-feature-panel wb9-feature-panel wb8-accompaniment-feature wb9-accompaniment-feature", { role: "tabpanel", hidden: true, "data-option-feature-panel": "accompaniment" });
    const draft = ensureChannelDraft();
    const global = el("div", "wb8-accompaniment-global wb9-accompaniment-global");
    const genre = selectControl(genreValuesWithPlaceholder(), draft.accompaniment.genre, value => {
      draft.accompaniment.genre = value;
      syncAccompanimentFeatureControls();
      markChannelOptionsDirty();
    }, "wb9-genre-select");
    const strength = selectControl([["light", t("light")], ["normal", t("normal")], ["strong", t("strong")]], draft.accompaniment.strength, value => {
      draft.accompaniment.strength = value;
      markChannelOptionsDirty();
    }, "wb9-strength-select");
    global.append(genre, strength);
    panel.append(global);
    const batchWrap = wb9AccompanimentChannelControl(draft.channels[0], { batch: true });
    state.ui.featureControls.accompaniment = { panel, genre, strength, batch: batchWrap._controls, channels: [] };
    panel.append(wb9OptionListRow({ index: -1, control: batchWrap, extraClass: "wb8-option-list-wide wb9-option-list-wide" }));
    draft.channels.forEach((channel, index) => {
      const control = wb9AccompanimentChannelControl(channel);
      state.ui.featureControls.accompaniment.channels.push(control._controls);
      panel.append(wb9OptionListRow({ index, control, extraClass: "wb8-option-list-wide wb9-option-list-wide" }));
    });
    requestAnimationFrame(syncAccompanimentFeatureControls);
    return panel;
  }

  function activateOptionFeature(name) {
    const next = ["rest", "volume", "octave", "accompaniment"].includes(name) ? name : "rest";
    state.activeOptionFeature = next;
    state.ui.featureTabs?.forEach(button => {
      const active = button.dataset.optionFeature === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    state.ui.featurePanels?.forEach(panel => { panel.hidden = panel.dataset.optionFeaturePanel !== next; });
    if (next === "rest" || next === "volume" || next === "octave") scheduleOptionMetricsUpdate();
  }

  function buildChannelOptionsWorkspacePanel() {
    const panel = el("section", "wb6-workspace-panel wb6-channel-options-panel wb8-channel-options-panel wb9-channel-options-panel", {
      role: "tabpanel",
      "data-workspace-panel": "channel",
      hidden: true
    });
    const definitions = [["rest", "rest"], ["volume", "volume"], ["octave", "octave"], ["accompaniment", "accompaniment"]];
    const tabs = el("div", "wb8-feature-tabs wb9-feature-tabs", { role: "tablist" });
    state.ui.featureTabs = [];
    definitions.forEach(([name, key], index) => {
      const button = el("button", "wb8-feature-tab wb9-feature-tab", {
        type: "button",
        role: "tab",
        text: t(key),
        "data-option-feature": name,
        "data-wb8-feature-key": key,
        "aria-selected": index === 0 ? "true" : "false",
        tabindex: index === 0 ? "0" : "-1"
      });
      button.addEventListener("click", () => activateOptionFeature(name));
      tabs.append(button);
      state.ui.featureTabs.push(button);
    });
    state.ui.featureControls = {};
    state.ui.channelPanels = [];
    state.ui.featurePanels = [
      buildRestFeaturePanel(),
      buildVolumeFeaturePanel(),
      buildOctaveFeaturePanel(),
      buildAccompanimentFeaturePanel()
    ];
    state.ui.channelApplyBar = el("div", "wb11-pending-apply wb11-channel-apply", {
      role: "status",
      "aria-live": "polite",
      hidden: true
    });
    const channelCancelButton = el("button", "wb11-cancel-button", {
      type: "button",
      text: t("cancel"),
      "data-wb4-text": "cancel"
    });
    const channelApplyButton = el("button", "wb11-apply-button", {
      type: "button",
      text: t("apply"),
      "data-wb4-text": "apply"
    });
    channelCancelButton.addEventListener("click", cancelChannelOptionsDraft);
    channelApplyButton.addEventListener("click", applyChannelOptionsDraft);
    const channelPendingActions = el("div", "wb11-pending-actions");
    channelPendingActions.append(channelCancelButton, channelApplyButton);
    state.ui.channelCancelButton = channelCancelButton;
    state.ui.channelApplyButton = channelApplyButton;
    state.ui.channelApplyBar.append(keyedText("channelPending", "wb11-pending-apply-text"), channelPendingActions);
    panel.append(tabs, state.ui.channelApplyBar, ...state.ui.featurePanels);
    requestAnimationFrame(() => activateOptionFeature(state.activeOptionFeature));
    return panel;
  }

  function syncPlaybackChannelPlacement() {
    const channels = state.ui.playbackChannels;
    const quickControls = state.ui.playbackQuickControls;
    const transportActions = state.ui.playbackTransportActions;
    const speedWrap = state.ui.playbackSpeedWrap;
    if (!channels || !quickControls || !transportActions) return;
    const narrow = window.matchMedia?.("(max-width: 620px)")?.matches ?? window.innerWidth <= 620;
    if (narrow) {
      if (channels.parentElement !== transportActions) transportActions.append(channels);
    } else if (channels.parentElement !== quickControls) {
      if (speedWrap?.parentElement === quickControls) quickControls.insertBefore(channels, speedWrap);
      else quickControls.prepend(channels);
    }
    channels.classList.toggle("is-mobile-transport", narrow);
  }

  function buildPreviewBlock(canvas) {
    const block = el("section", "wb4-block wb4-preview-block wb6-preview-block wb8-preview-block wb9-preview-block");
    state.ui.previewBlock = block;
    const transport = playLayout.querySelector(".transport-row");
    const seek = playLayout.querySelector(".seek-row");
    const piano = $("pianoRoll");
    const play = $("playToggleBtn");
    const rewind = $("rewindBtn");
    const playInfo = $("playInfo");
    const loopInput = $("loopPlayback");
    const loopLabel = loopInput?.closest("label");
    const quickControls = transport?.querySelector(".quick-controls");
    const transportActions = transport?.querySelector(".transport-actions");
    const soundButton = $("partSoundBtn");
    const speedWrap = $("speedControlButton")?.closest(".compact-control-wrap");
    const volumeWrap = $("volumeControlButton")?.closest(".compact-control-wrap");

    if (play) {
      play.removeAttribute("data-i18n");
      play.innerHTML = '<span class="shared-transport-icon shared-icon-play" aria-hidden="true"></span>';
      play.classList.add("wb6-transport-symbol", "wb6-play-symbol");
      play.setAttribute("aria-label", wb6t("play"));
      play.title = wb6t("play");
    }
    if (rewind) {
      rewind.removeAttribute("data-i18n");
      rewind.removeAttribute("data-i18n-title");
      rewind.innerHTML = '<span class="shared-transport-icon shared-icon-first" aria-hidden="true"></span>';
      rewind.classList.add("wb6-transport-symbol", "wb6-rewind-symbol");
      rewind.setAttribute("aria-label", wb6t("rewind"));
      rewind.title = wb6t("rewind");
    }
    if (playInfo) {
      playInfo.hidden = true;
      playInfo.classList.add("wb6-hidden-play-info");
    }
    if (quickControls && speedWrap) {
      const channels = el("div", "wb8-playback-channels wb9-playback-channels", { role: "group", "aria-label": t("playbackChannels") });
      const labels = [t("melShort"), "1", "2", "3", "4", "5"];
      for (let index = 0; index < 6; index += 1) {
        const button = el("button", `wb8-playback-channel wb8-playback-channel-${index} wb9-playback-channel active`, {
          type: "button",
          text: labels[index],
          "data-playback-channel-index": index,
          "aria-pressed": "true",
          title: channelLabel(index),
          style: `--wb8-channel-color:var(--part${index})`
        });
        channels.append(button);
      }
      state.ui.playbackChannels = channels;
      state.ui.playbackQuickControls = quickControls;
      state.ui.playbackTransportActions = transportActions;
      state.ui.playbackSpeedWrap = speedWrap;
      quickControls.insertBefore(channels, speedWrap);
    }
    if (quickControls && soundButton) {
      soundButton.classList.add("wb9-sound-button");
      if (volumeWrap?.parentElement === quickControls) volumeWrap.after(soundButton);
      else quickControls.append(soundButton);
    }
    if (loopLabel) {
      state.ui.originalCheckbox = el("input", "", { id: "originalPlayback", type: "checkbox", disabled: true });
      const originalLabel = el("label", "loop-label wb6-original-label wb8-original-label wb9-original-label");
      originalLabel.append(state.ui.originalCheckbox, wb6Text("original"));
      loopLabel.after(originalLabel);
      state.ui.originalCheckbox.addEventListener("change", syncOriginalPreviewSource);
    }

    playLayout.replaceChildren();
    if (piano) playLayout.append(piano);
    if (seek) playLayout.append(seek);
    if (transport) playLayout.append(transport);
    syncPlaybackChannelPlacement();
    prepareTimeline(seek);
    block.append(playLayout);
    state.ui.playbackExtraHost = el("div", "wb4-inline-host");
    block.append(state.ui.playbackExtraHost);
    canvas.append(block);
  }

  function updateTempoCleanButton() {
    const button = state.ui.tempoCleanButton;
    if (!button) return;
    button.textContent = state.options.tempo.simplify
      ? t("tempoCleanEnabledCount", [Math.max(0, Number(state.tempoCleanCount) || 0).toLocaleString(document.documentElement.lang || undefined)])
      : t("tempoCleanDisabled");
    button.classList.toggle("active", Boolean(state.options.tempo.simplify));
    button.setAttribute("aria-pressed", state.options.tempo.simplify ? "true" : "false");
  }

  function createTargetChannelButtons(values, onChange, className = "") {
    const wrap = el("div", `wb9-target-channels ${className}`.trim(), { role: "group", "aria-label": t("channelApply") });
    const buttons = [];
    const labels = [t("melShort"), "1", "2", "3", "4", "5"];
    const sync = () => buttons.forEach((button, index) => {
      const active = Boolean(values[index]);
      button.classList.toggle("active", active);
      button.classList.toggle("is-inactive", !active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    for (let index = 0; index < 6; index += 1) {
      const button = el("button", `wb9-target-channel wb9-target-channel-${index}`, {
        type: "button",
        text: labels[index],
        "aria-pressed": values[index] ? "true" : "false",
        title: channelLabel(index),
        style: `--wb9-channel-color:var(--part${index})`
      });
      button.addEventListener("click", () => {
        if (button.disabled) return;
        values[index] = !values[index];
        sync();
        onChange(values.slice());
      });
      wrap.append(button);
      buttons.push(button);
    }
    wrap._buttons = buttons;
    wrap.sync = sync;
    wrap.setDisabled = disabled => {
      buttons.forEach(button => { button.disabled = Boolean(disabled); });
      wrap.classList.toggle("is-disabled", Boolean(disabled));
    };
    sync();
    return wrap;
  }

  function syncVolumeGenerationControls() {
    const refs = state.ui.volumeGeneration;
    if (!refs) return;
    const disabled = !state.options.dynamics.genre;
    refs.genre.value = state.options.dynamics.genre;
    refs.strength.value = state.options.dynamics.strength;
    refs.strength.disabled = disabled;
    refs.channels.sync();
    refs.channels.setDisabled(disabled);
    refs.wrap.classList.toggle("is-genre-unselected", disabled);
  }

  function buildCommonOptions() {
    const common = el("div", "wb4-common-options wb6-common-options wb7-common-options wb8-common-options wb9-common-options");
    state.ui.quantizeControl = segmented([
      ["64", t("quantize64")], ["32", t("quantize32")]
    ], String(state.midiQuantizeDivision), division => {
      const normalized = Number(division) === 32 ? 32 : 64;
      state.midiQuantizeDivision = normalized;
      try { window.dispatchEvent(new CustomEvent("mobibard:set-midi-quantize", { detail: { division: normalized } })); } catch (_) {}
      scheduleMidiAutoApply();
    }, "wb7-quantize-segments");
    common.append(optionRow("quantize", state.ui.quantizeControl, "", "wb7-common-quantize wb8-common-quantize wb9-common-quantize"));

    state.ui.tempoCleanButton = el("button", "wb9-tempo-clean-button", {
      type: "button",
      "aria-pressed": state.options.tempo.simplify ? "true" : "false"
    });
    state.ui.tempoCleanButton.addEventListener("click", () => {
      state.options.tempo.simplify = !state.options.tempo.simplify;
      updateTempoCleanButton();
      queueApply();
    });
    updateTempoCleanButton();
    common.append(optionRow("tempoClean", state.ui.tempoCleanButton, "", "wb8-common-tempo-clean wb9-common-tempo-clean"));

    const tempoScale = wb9NumberControl({ min: 50, max: 200, step: 1, value: state.options.tempo.scale, suffix: "%", label: t("tempoScale"), onChange: value => {
      state.options.tempo.scale = value;
      queueApply();
    }});
    state.ui.tempoScaleControl = tempoScale;
    common.append(optionRow("tempoScale", tempoScale, "", "wb6-common-tempo wb8-common-tempo-scale wb9-common-tempo-scale"));

    const leadingStepper = wb9NumberControl({ min: 0, max: 300, step: 0.25, value: state.options.leading.beats * 0.5, suffix: t("seconds"), label: t("leading"), onChange: value => {
      state.options.leading.beats = Math.round(value * 4) / 2;
      queueApply();
    }});
    state.ui.leadingControl = leadingStepper;
    common.append(optionRow("leading", leadingStepper, "", "wb6-common-leading wb8-common-leading wb9-common-leading"));

    const fadeSecondsDefs = FADE_SECOND_OPTIONS.map(value => [String(value), String(value)]);
    const fadeInSegments = segmented(fadeSecondsDefs, String(normalizeFadeSeconds(state.options.fade?.inSeconds)), value => {
      state.options.fade.inSeconds = normalizeFadeSeconds(value);
      queueApply();
    }, "wb9-fade-segments");
    state.ui.fadeInControl = fadeInSegments;
    common.append(optionRow("fadeInSeconds", fadeInSegments, "", "wb9-common-fade-in"));

    const fadeOutSegments = segmented(fadeSecondsDefs, String(normalizeFadeSeconds(state.options.fade?.outSeconds)), value => {
      state.options.fade.outSeconds = normalizeFadeSeconds(value);
      queueApply();
    }, "wb9-fade-segments");
    state.ui.fadeOutControl = fadeOutSegments;
    common.append(optionRow("fadeOutSeconds", fadeOutSegments, "", "wb9-common-fade-out"));

    const dynamicsWrap = el("div", "wb9-volume-generation-controls");
    const genre = selectControl(genreValuesWithPlaceholder(), state.options.dynamics.genre, value => {
      state.options.dynamics.genre = value;
      syncVolumeGenerationControls();
      queueApply();
    }, "wb9-genre-select");
    const strength = selectControl([["light", t("light")], ["normal", t("normal")], ["strong", t("strong")]], state.options.dynamics.strength, value => {
      state.options.dynamics.strength = value;
      if (state.options.dynamics.genre) queueApply();
    }, "wb9-strength-select");
    const channels = createTargetChannelButtons(state.options.dynamics.targetChannels, () => {
      if (state.options.dynamics.genre) queueApply();
    }, "wb9-volume-generation-channels");
    dynamicsWrap.append(genre, strength, channels);
    state.ui.volumeGeneration = { wrap: dynamicsWrap, genre, strength, channels };
    common.append(optionRow("dynamics", dynamicsWrap, "", "wb9-common-dynamics"));
    syncVolumeGenerationControls();
    syncMidiQuantizeControl();
    return common;
  }

  function renderCopyRows() {
    const host = state.ui.copyRows;
    if (!host) return;
    const mainMml = $("mainMml")?.value || "";
    const fullParts = normalizeMainToParts(mainMml);
    host.replaceChildren();

    const fullRow = el("div", "copy-item wb4-copy-item wb8-full-copy-item");
    const meta = el("div", "copy-meta");
    meta.append(el("strong", "copy-title", { text: t("copyAll") }), el("span", "copy-detail", { text: partDetail(fullParts) }));
    const actions = el("div", "wb8-full-copy-actions");
    const save = retained.save;
    const drive = retained.driveSave;
    const copyButton = retained.copy;
    if (save) {
      save.removeAttribute("data-i18n");
      save.textContent = t("saveFile");
      save.className = "copy-button wb4-copy-button wb9-save-copy-button";
      actions.append(save);
    }
    if (drive) {
      drive.removeAttribute("data-i18n");
      drive.removeAttribute("data-i18n-title");
      drive.textContent = t("saveDrive");
      drive.className = "copy-button wb4-copy-button wb9-save-copy-button";
      actions.append(drive);
    }
    if (copyButton) {
      copyButton.removeAttribute("data-i18n");
      copyButton.textContent = t("copy");
      copyButton.className = "copy-button wb4-copy-button";
      actions.append(copyButton);
    }
    fullRow.append(meta, actions);
    host.append(fullRow);

    const splitResults = el("div", "split-results wb4-split-results");
    const head = el("div", "results-head wb4-results-head");
    const titleWrap = el("div", "wb4-split-title-wrap");
    titleWrap.append(el("h2", "", { text: t("splitCopy") }));
    const controls = el("div", "wb4-split-controls");
    const limitLabel = el("label", "wb4-split-control");
    limitLabel.append(keyedText("splitLimit"));
    const limitInput = el("input", "wb4-split-limit", { type: "number", min: 200, max: 5000, step: 50, value: state.options.split.maxChars });
    limitInput.addEventListener("change", () => {
      state.options.split.maxChars = Math.max(200, Math.min(5000, Math.round(Number(limitInput.value) || 2400)));
      invalidateCopySplitPlan();
      markPlayerEdited();
      scheduleCopyRowsRender();
    });
    limitLabel.append(limitInput);
    const searchLabel = el("label", "wb4-split-control");
    searchLabel.append(keyedText("splitSearch"));
    const searchSelect = selectControl([["50", "50%"], ["60", "60%"], ["70", "70%"], ["80", "80%"], ["90", "90%"]], String(state.options.split.searchPercent), value => {
      state.options.split.searchPercent = Number(value);
      invalidateCopySplitPlan();
      markPlayerEdited();
      scheduleCopyRowsRender();
    }, "wb4-split-search");
    searchSelect.id = "splitSearchPercent";
    searchLabel.append(searchSelect);
    controls.append(limitLabel, searchLabel);
    const pages = splitPagesForCopy(mainMml);
    const summary = el("span", "results-summary", { text: pages.length > 1 ? t("splitPages", [pages.length]) : t("splitNoNeed") });
    titleWrap.append(summary);
    head.append(titleWrap, controls);
    splitResults.append(head);
    if (pages.length > 1) {
      const copyButtons = el("div", "copy-buttons wb4-copy-buttons");
      pages.forEach((page, pageIndex) => {
        const parts = Array.isArray(page.parts) && page.parts.length ? page.parts.slice(0, 6) : normalizeMainToParts(page.mml);
        while (parts.length < 6) parts.push("");
        const button = el("button", "copy-button wb4-copy-button", { type: "button", text: t("copy") });
        button.addEventListener("click", async () => {
          if (await confirmPendingExport("copy")) void copyText(page.mml);
        });
        copyButtons.append(renderCopyItem(t("splitPage", [page.index || pageIndex + 1]), partDetail(parts), button));
      });
      splitResults.append(copyButtons);
    }
    host.append(splitResults);
  }

  function scheduleMidiAutoApply() {
    clearTimeout(state.midiAutoTimer);
    state.midiAutoTimer = window.setTimeout(() => {
      state.midiAutoTimer = 0;
      refreshInstrumentDirtyState();
    }, 0);
  }

  function activateWorkspaceTab(name) {
    const next = ["copy", "instrument", "channel", "code"].includes(name) ? name : "copy";
    state.activeWorkspaceTab = next;
    state.ui.workspaceTabs?.forEach(button => {
      const active = button.dataset.workspaceTab === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    Object.entries(state.ui.workspacePanels || {}).forEach(([key, panel]) => { panel.hidden = key !== next; });
    if (next === "code") syncChannelCodeEditor();
    if (next === "instrument") updateMidiChannelFilter();
    if (next === "channel") {
      activateOptionFeature(state.activeOptionFeature);
      scheduleOptionMetricsUpdate();
    }
    if (next === "copy") {
      state.copyDirty = true;
      scheduleCopyRowsRender();
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    scheduleSessionPersist();
  }

  function activateChannelView(index) {
    const numeric = Number(index);
    const next = numeric < 0 ? -1 : Math.max(0, Math.min(5, Number.isFinite(numeric) ? numeric : 0));
    state.activeChannelView = next;
    if (next >= 0) state.activeChannel = next;
    [state.ui.workspaceBlock, state.ui.overviewBlock, state.ui.workspacePanels?.code]
      .filter(Boolean)
      .forEach(node => node.setAttribute("data-active-channel", String(next)));
    state.ui.channelTabGroups?.forEach(group => group.forEach(button => {
      const value = Number(button.dataset.channelIndex);
      const active = value === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }));
    if (state.activeWorkspaceTab === "code") syncChannelCodeEditor();
    scheduleChannelCountsUpdate();
    window.dispatchEvent(new Event("resize"));
    scheduleSessionPersist();
  }

  function receiveSourceBaseline(detail = {}) {
    const nextSource = String(detail.mml || "");
    const startsNewSource = detail.newSource === true;
    const preserveEditedSession = !startsNewSource && Boolean(state.instrumentDirty && state.sessionHasUserEdit);
    if (!preserveEditedSession) {
      state.sessionHasUserEdit = false;
      clearTimeout(state.sessionSaveTimer);
      state.sessionSaveTimer = 0;
    }
    if (startsNewSource) {
      resetSubmenuStateForNewSource();
    }
    state.sourceMml = nextSource;
    state.sourceMeta = {
      name: detail.name || "",
      sourceType: detail.sourceType || "",
      sourceLabel: detail.sourceLabel || ""
    };
    if (detail.name) setSourceName(detail.name);
    state.manualEdited = false;
    state.sourceVersion += 1;
    state.lastApplySignature = "";
    state.tempoCleanCount = 0;
    syncChannelDraftFromApplied();
    state.metricsCache = { sourceVersion: -1, restInput: "", rest: new Map(), volumeSource: "", volume: [], noteStatsSource: "", noteStats: [], tempoInput: "", tempoResult: null };
    resetPipelineCache();
    clearPendingPlaybackPreview();
    applyFromSource({ force: true });
    if (startsNewSource) {
      activateChannelView(0);
      activateOptionFeature("rest");
      activateWorkspaceTab("copy");
    }
    scheduleChannelCountsUpdate();
    scheduleOptionMetricsUpdate();
    if (preserveEditedSession) scheduleSessionPersist();
  }

  function writeResultMml(mml) {
    const mainMml = $("mainMml");
    if (!mainMml) return false;
    const next = String(mml || "");
    const changed = mainMml.value !== next;
    state.lastResultMml = next;
    state.manualEdited = false;
    if (state.ui.manualBadge) state.ui.manualBadge.hidden = true;
    if (changed) {
      state.applying = true;
      mainMml.dataset.playerUiApply = "1";
      mainMml.value = next;
      mainMml.dispatchEvent(new Event("input", { bubbles: true }));
      delete mainMml.dataset.playerUiApply;
      state.applying = false;
    }
    if (changed) {
      scheduleCopyRowsRender();
      scheduleChannelCountsUpdate();
    }
    scheduleOptionMetricsUpdate();
    return changed;
  }


  buildShell();
  document.documentElement.removeAttribute("data-player-ui-booting");
  convertDialogs();
  installTutorial();
  installGlobalHandling();
  updateLocalText();
  window.setTimeout(() => syncChannelCodeEditor(), 0);

  Promise.resolve(window.MobibardI18n?.ready).then(async () => {
    updateLocalText();
    await loadSessionRestorePrompt();
    if (!state.sourceMml && !state.sessionLoadedSnapshot) {
      const initial = $("mainMml")?.value || "";
      if (initial.trim()) receiveSourceBaseline({ mml: initial, name: "Sample MML", sourceType: "mml", sourceLabel: "MML" });
    }
  });

  window.MobibardPlayerLayout = Object.freeze({
    get sourceMml() { return state.sourceMml; },
    get options() { return JSON.parse(JSON.stringify(state.options)); },
    get activeChannel() { return state.activeChannel; },
    applyFromSource,
    activateChannel,
    showToast
  });
})();

/* ===== Player application ===== */
window.MobibardStartPlayerApp = function MobibardStartPlayerApp() {
  if (window.__MOBIBARD_PLAYER_APP_STARTED__) return;
  window.__MOBIBARD_PLAYER_APP_STARTED__ = true;
  "use strict";

  const DEFAULT_SOUND_BANK_FILE_NAME = String(window.MOBIBARD_DEFAULT_SF3_NAME || "FluidR3Mono_GM_compact.sf3");
  const PART_LABEL_KEYS = ["part.melody", "part.harmony1", "part.harmony2", "part.harmony3", "part.harmony4", "part.harmony5"];
  const PART_LABELS = new Proxy(PART_LABEL_KEYS, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        return i18nText(target[Number(property)]);
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const PREF_PREFIX = "mobibard.player.";
  const DEFAULT_PART_PRESET_KEY = "0:0";
  const MOBIBEATS_URL = new URL("../mobibeats/", window.location.href).href;
  const MOBIBEATS_TARGET_ORIGIN = window.location.origin === "null" ? "*" : window.location.origin;
  const DEFAULT_MIDI_SOUND_PRESET_KEY = "midi.recent_sounds";
  const USER_SOUND_PRESET_VALUE_PREFIX = "user:";
  const PART_PREVIEW_MELODY_INTERVALS = [0, 2, 4, 7, 9, 7, 4, 0];
  const PART_PREVIEW_DRUM_NOTES = [36, 42, 38, 42, 36, 46, 38, 42];
  const OVERLAP_MERGE_OPTIONS = [
    { value: "all", labelKey: "ui.all" },
    { value: "half", labelKey: "ui.half" },
    { value: "none", labelKey: "ui.none" }
  ];
  const MIDI_INSTRUMENT_CATEGORY_ORDER = ["keyboard", "strings", "winds", "vocal", "other", "drums"];
  const MIDI_INSTRUMENT_CATEGORY_LABEL_KEYS = {
    keyboard: "ui.keyboards",
    strings: "ui.strings",
    winds: "ui.winds",
    vocal: "midi.vocal_instruments",
    other: "midi.other_instruments",
    drums: "midi.drums"
  };
  const GOOGLE_CONFIG = window.MOBIBARD_GOOGLE_CONFIG || {};
  const GOOGLE_DRIVE_SCOPE = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.appdata"
  ].join(" ");
  const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
  const GOOGLE_DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  const GOOGLE_SETTINGS_FILE_NAME = "mobibard-player-settings.json";
  const GOOGLE_SETTINGS_APP_NAME = "mabinogi-mml-player";
  const GOOGLE_MML_FOLDER_NAME = "MML_Mobibard";
  const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
  const GOOGLE_DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
  const GOOGLE_DOCS_DOCUMENT_MIME = "application/vnd.google-apps.document";
  const GOOGLE_DRIVE_TEXT_EXPORT_MIME = "text/plain";
  const GOOGLE_AUTO_RECONNECT_PREF = "googleAutoReconnect";
  const GOOGLE_TOKEN_CACHE_PREF = "googleTokenCache";
  const MIDI_CONVERT_CACHE_PREF = "midiConvertLastSettings";
  const MIDI_CONVERT_CACHE_VERSION = 2;
  const SOUND_BANK_SELECTION_PREF = "soundBankSelectionMeta";
  const GOOGLE_SOUND_BANK_FILE_NAME = "mobibard-player-soundbank-cache.bin";
  const GOOGLE_SOUND_BANK_MIME = "application/octet-stream";
  const GOOGLE_LOCAL_ONLY_PREFS = new Set([
    GOOGLE_AUTO_RECONNECT_PREF,
    GOOGLE_TOKEN_CACHE_PREF,
    MIDI_CONVERT_CACHE_PREF,
    SOUND_BANK_SELECTION_PREF
  ]);
  const GUEST_AVATAR_URL = "../assets/icons/guest-user.svg?v=5.1.0&rev=20260818-205217";
  const AUTO_IMPORT_LEADING_SILENCE_SECONDS = 2;
  const MMI_IMPORT_MAX_CHANNELS = 6;
  const MMI_IMPORT_MAX_DETECTED_PARTS = 96;
  const SOURCE_FILE_EXTENSIONS = new Set(["txt", "mmi", "mml", ...(window.MabiMusicFormats?.inputExtensions?.() || window.MabiMusicFormats?.supportedExtensions?.() || [])]);
  // MIDI/KAR + MML are core Player workflows and remain eagerly loaded.
  // Other source-format converters are loaded only when a matching file is actually opened.
  const FORMAT_RUNTIME_REVISION = "20260824-final46";
  const FORMAT_RUNTIME_SCRIPTS = Object.freeze({
    notation: "../plugins/formats/notation/notation-utils.js",
    consoleGm: "../plugins/formats/console-gm-normalizer.js",
    xsf: "../plugins/formats/xsf/xsf-container.js",
    playstation: "../plugins/formats/playstation/playstation-sequence.js",
    akao: "../plugins/formats/playstation/akao-sequence.js",
    nintendo: "../plugins/formats/nintendo/nintendo-sequence.js",
    musicxml: "../plugins/formats/musicxml/musicxml-to-midi.js",
    finaleMus: "../plugins/formats/finale/finale-mus-to-midi.js",
    finaleMusx: "../plugins/formats/finale/finale-musx-to-midi.js",
    mnx: "../plugins/formats/mnx/mnx-to-midi.js",
    musescore: "../plugins/formats/musescore/musescore-to-midi.js",
    gp3: "../plugins/formats/guitarpro/vendor/guitarpro-parser/gp3-browser.js",
    gp5: "../plugins/formats/guitarpro/vendor/parse-gp5/index.js",
    guitarpro: "../plugins/formats/guitarpro/guitarpro-local.js",
    vocal: "../plugins/formats/vocal/vocal-format-parsers.js",
    legacyPc: "../plugins/formats/legacy-pc/legacy-pc-sequence.js",
    tracker: "../plugins/formats/tracker/tracker-sequence.js",
    segaSaturn: "../plugins/formats/sega/sega-saturn-sequence.js",
    segaLogged: "../plugins/formats/sega/sega-logged-sequence.js"
  });
  const FORMAT_RUNTIME_BY_ID = Object.freeze({
    "midi": [],
    "playstation-sequence": ["consoleGm", "playstation"],
    "nintendo-sequence": ["consoleGm", "nintendo"],
    "playstation-xsf": ["consoleGm", "xsf", "playstation", "akao"],
    "nintendo-xsf": ["consoleGm", "xsf", "nintendo"],
    "musicxml": ["notation", "musicxml"],
    "finale-mus": ["notation", "finaleMus"],
    "finale-musx": ["notation", "finaleMusx"],
    "mnx": ["notation", "mnx"],
    "musescore": ["notation", "musescore"],
    "gp3": ["notation", "gp3", "guitarpro"],
    "gp5": ["notation", "gp5", "guitarpro"],
    "vsq": ["vocal"],
    "vsqx": ["vocal"],
    "vpr": ["vocal"],
    "ust": ["vocal"],
    "ustx": ["vocal"],
    "svp": ["vocal"],
    "s5p": ["vocal"],
    "ccs": ["vocal"],
    "xmi": ["legacyPc"],
    "hmp": ["legacyPc"],
    "hmi": ["legacyPc"],
    "tracker-module": ["tracker"],
    "sega-saturn-sequence": ["segaSaturn"],
    "sega-megadrive-xgm": ["segaSaturn"],
    "sega-vgm": ["segaLogged"],
    "sega-gym": ["segaLogged"],
    "s98": ["segaLogged"]
  });
  const formatRuntimeScriptPromises = new Map();

  function loadPlayerRuntimeScript(path) {
    const raw = String(path || "");
    if (!raw) return Promise.resolve();
    const url = new URL(raw, window.location.href);
    url.searchParams.set("v", "5.1.0");
    url.searchParams.set("rev", FORMAT_RUNTIME_REVISION);
    const key = url.href;
    if (formatRuntimeScriptPromises.has(key)) return formatRuntimeScriptPromises.get(key);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = key;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`음악 포맷 변환 모듈을 불러오지 못했습니다: ${raw}`));
      document.head.appendChild(script);
    }).catch(error => {
      formatRuntimeScriptPromises.delete(key);
      throw error;
    });
    formatRuntimeScriptPromises.set(key, promise);
    return promise;
  }

  async function loadFormatRuntimeKeys(keys) {
    // Dependencies are intentionally loaded in order because several converters
    // capture helper globals (notation/console GM) during script evaluation.
    for (const key of Array.from(new Set(keys || []))) {
      const path = FORMAT_RUNTIME_SCRIPTS[key];
      if (path) await loadPlayerRuntimeScript(path);
    }
  }

  function resolveSourceFormatForLazyLoad(fileName, mimeType = "", bytes = null) {
    const core = window.MabiMusicFormats;
    if (!core) return { format: null, generic: false };
    const uploadedName = String(fileName || "");
    let generic = Boolean(core.isGenericContainer?.(uploadedName, mimeType));
    let format = generic ? null : core.findFormat?.(uploadedName, mimeType, bytes);
    if (bytes != null) {
      try {
        const macBinary = window.MabiUtils?.inspectMacBinary?.(bytes);
        const internalName = String(macBinary?.fileName || "").trim();
        if (internalName) {
          const internalFormat = core.findFormat?.(internalName, "", macBinary?.data || bytes);
          if (internalFormat) {
            format = internalFormat;
            generic = false;
          }
        }
      } catch (_) {}
    }
    return { format, generic };
  }

  async function ensureMusicFormatRuntime(fileName, mimeType = "", bytes = null) {
    const { format, generic } = resolveSourceFormatForLazyLoad(fileName, mimeType, bytes);
    if (format?.id) {
      await loadFormatRuntimeKeys(FORMAT_RUNTIME_BY_ID[format.id] || []);
      return;
    }
    if (!generic) return;
    // A generic MacBinary/BIN container can hide any supported source type.
    // Load all non-core converters only in this exceptional case so detection remains complete.
    const allKeys = Object.values(FORMAT_RUNTIME_BY_ID).flat();
    await loadFormatRuntimeKeys(allKeys);
  }
  const HEADER_SHORTCUT_LINKS = new Set([
    "https://bitmidi.com/",
    "https://www.classicalarchives.com/midi.html",
    "https://ichigos.com/",
    "https://josh.agarrado.net/music/anime/index.php",
    "http://www.midiex.net/",
    "http://www.midisite.co.uk/",
    "https://musescore.com/",
    "https://www.vgmusic.com/",
    "https://www.zophar.net/"
  ]);
  const ACTIVE_CODE_LOOKAHEAD_SEC = 0.012;
  const ACTIVE_CODE_RELEASE_SEC = 0.026;
  const PIANO_ROLL_MIN_KEY_SPAN = 24;
  // 피아노롤의 음정 좌표는 12반음을 동일 폭으로 배치한다.
  // 아래 피아노 건반만 이 균등한 음정 중심에 맞춰 흰/검은 건반 모양으로 그린다.
  const PIANO_ROLL_NOTE_WIDTH_RATIO = 0.86;
  const PIANO_BLACK_KEY_HEIGHT_RATIO = 0.62;
  const PIANO_BLACK_KEY_WIDTH_IN_PITCH_LANES = 1.06;
  const PIANO_ROLL_FALL_WINDOW_COLLAPSED = 1.8;
  const PIANO_ROLL_FALL_WINDOW_EXPANDED = 4.6;
  const PIANO_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const PIANO_BLACK_KEY_PITCHES = new Set([1, 3, 6, 8, 10]);


  const { shortError, clampInt, formatTime } = window.MabiUtils;
  const { midiToMml: sharedMidiToMml, analyzeMidi, buildMidiInstrumentPreview, buildMidiFilePreview } = window.MabiMidi;
  const midiToMml = (bytes, fileName, options = {}) => sharedMidiToMml(bytes, fileName, {
    ...options,
    ignoreSingle64thOverlap: true,
  });
  const { parseMabinogiMml, splitMmlParts, splitMmlPartsDetailed, parseMmlPart, buildSchedule, composeMml, analyzeIrregularMmlLengths, normalizeIrregularMmlLengths } = window.MabiMml;
  const { optimizeMml, addLeadingSilenceMml } = window.MabiOptimizer;
  const { parseSoundBank, loadEmbeddedSoundBank, prepareNotes, prepareDrumNotes, schedulePreparedNotes } = window.MabiSoundBank;

  const $ = (id) => document.getElementById(id);

  const { showToast } = window.MobibardPlayerLayout;

  function inlinePrompt(message, defaultValue = "", options = {}) {
    const handler = window.MobibardInlineUi?.prompt;
    return typeof handler === "function"
      ? handler(message, defaultValue, options)
      : Promise.resolve(null);
  }

  function inlineConfirm(message, options = {}) {
    const handler = window.MobibardInlineUi?.confirm;
    return typeof handler === "function"
      ? handler(message, options)
      : Promise.resolve(false);
  }


  function openFilePickerInput(input) {
    if (!input || input.disabled) return;
    const groupedPicker = window.MabiSupportedFilesUi?.openFileInput;
    if (typeof groupedPicker === "function") {
      void groupedPicker(input);
      return;
    }
    input.click();
  }

  const midiFile = $("midiFile");
  const midiLoadBtn = $("midiLoadBtn");
  const midiSiteLinks = $("midiSiteLinks");
  const sf2File = $("sf2File");
  const soundName = $("soundName");
  const soundFontLoadBtn = $("soundFontLoadBtn");
  const soundFontResetBtn = $("soundFontResetBtn");
  const languageSelect = $("languageSelect");
  const googleLoginBtn = $("googleLoginBtn");
  const googleDriveLoadBtn = $("googleDriveLoadBtn");
  const googleDriveSaveBtn = $("googleDriveSaveBtn");
  const accountMenuButton = $("accountMenuButton");
  const accountMenu = $("accountMenu");
  const accountAvatarImg = $("accountAvatarImg");
  const accountMenuName = $("accountMenuName");
  const accountMenuEmail = $("accountMenuEmail");
  const googleDriveSaveDialog = $("googleDriveSaveDialog");
  const googleDriveSaveFolderNameText = $("googleDriveSaveFolderNameText");
  const googleDriveSaveFolderBtn = $("googleDriveSaveFolderBtn");
  const googleDriveSaveFileName = $("googleDriveSaveFileName");
  const googleDriveSaveStatus = $("googleDriveSaveStatus");
  const googleDriveSaveCancel = $("googleDriveSaveCancel");
  const googleDriveSaveApply = $("googleDriveSaveApply");
  const mmiImportDialog = $("mmiImportDialog");
  const mmiImportTitle = $("mmiImportTitle");
  const mmiImportSummary = $("mmiImportSummary");
  const mmiFullPreviewBtn = $("mmiFullPreviewBtn");
  const mmiAllPreviewBtn = $("mmiAllPreviewBtn");
  const mmiChannelList = $("mmiChannelList");
  const mmiImportStatus = $("mmiImportStatus");
  const mmiImportClear = $("mmiImportClear");
  const mmiImportReloadFile = $("mmiImportReloadFile");
  const mmiImportGoogleDriveLoad = $("mmiImportGoogleDriveLoad");
  const mmiImportCancel = $("mmiImportCancel");
  const mmiImportApply = $("mmiImportApply");
  const codeHelpBtn = $("codeHelpBtn");
  const codeHelpDialog = $("codeHelpDialog");
  const codeHelpClose = $("codeHelpClose");
  const playToggleBtn = $("playToggleBtn");
  const rewindBtn = $("rewindBtn");
  const loopPlayback = $("loopPlayback");
  const speedControlButton = $("speedControlButton");
  const speedControlPopover = $("speedControlPopover");
  const speedResetBtn = $("speedResetBtn");
  const speedSlider = $("speedSlider");
  const speedValue = $("speedValue");
  const volumeControlButton = $("volumeControlButton");
  const volumeControlPopover = $("volumeControlPopover");
  const volumeResetBtn = $("volumeResetBtn");
  const volumeSlider = $("volumeSlider");
  const volumeValue = $("volumeValue");
  const progressSlider = $("progressSlider");
  const tempoMarkerLayer = $("tempoMarkerLayer");
  const timelineActivityCanvas = $("timelineActivityCanvas");
  const tempoEditDialog = $("tempoEditDialog");
  const tempoEditForm = $("tempoEditForm");
  const tempoEditContext = $("tempoEditContext");
  const tempoEditBpm = $("tempoEditBpm");
  const tempoEditApply = $("tempoEditApply");
  const tempoEditCancel = $("tempoEditCancel");
  const pianoRoll = $("pianoRoll");
  const pianoRollCanvas = $("pianoRollCanvas");
  const pianoRollEmpty = $("pianoRollEmpty");
  const pianoRollRangeLabel = $("pianoRollRangeLabel");
  const pianoRollToggleLabel = $("pianoRollToggleLabel");
  const playInfo = $("playInfo");
  const copyBtn = $("copyBtn");
  const pasteBtn = $("pasteBtn");
  const pasteMmlDialog = $("pasteMmlDialog");
  const pasteMmlForm = $("pasteMmlForm");
  const pasteMmlText = $("pasteMmlText");
  const pasteMmlStatus = $("pasteMmlStatus");
  const pasteMmlApply = $("pasteMmlApply");
  const pasteMmlCancel = $("pasteMmlCancel");
  const saveBtn = $("saveBtn");
  const midiExtractBtn = $("midiExtractBtn");
  const rhythmGameBtn = $("rhythmGameBtn");
  const simpleVersionBtn = $("simpleVersionBtn");
  const rhythmGameLayer = $("rhythmGameLayer");
  const rhythmGameClose = $("rhythmGameClose");
  const rhythmGameFrame = $("rhythmGameFrame");
  const rhythmGameStatus = $("rhythmGameStatus");
  const rhythmGameLoading = $("rhythmGameLoading");
  const rhythmGameLoadingText = $("rhythmGameLoadingText");
  const midiConvertDialog = $("midiConvertDialog");
  const midiConvertTitle = $("midiConvertTitle");
  const midiConvertSummary = $("midiConvertSummary");
  const midiBulkAssignBtn = $("midiBulkAssignBtn");
  const midiBulkAssignDialog = $("midiBulkAssignDialog");
  const midiBulkChannelButtons = Array.from(document.querySelectorAll(".midi-bulk-channel"));
  const midiBulkAllBtn = $("midiBulkAllBtn");
  const midiBulkInstrumentButtons = Array.from(document.querySelectorAll(".midi-bulk-instrument"));
  const midiBulkAllInstrumentBtn = $("midiBulkAllInstrumentBtn");
  const midiBulkSelectBtn = $("midiBulkSelectBtn");
  const midiBulkClearBtn = $("midiBulkClearBtn");
  const midiBulkCancelBtn = $("midiBulkCancelBtn");
  const midiChannelList = $("midiChannelList");
  const midiRoleList = $("midiRoleList");
  const midiInstrumentPanelTitle = $("midiInstrumentPanelTitle");
  const midiConvertReloadFile = $("midiConvertReloadFile");
  const midiConvertGoogleDriveLoad = $("midiConvertGoogleDriveLoad");
  const midiConvertApply = $("midiConvertApply");
  const midiConvertCancel = $("midiConvertCancel");
  const themeToggleBtn = $("themeToggleBtn");
  const themeModeText = $("themeModeText");
  const charCount = $("charCount");
  const partSoundBtn = $("partSoundBtn");
  const partSoundDialog = $("partSoundDialog");
  const partSoundRows = $("partSoundRows");
  const partSoundCancel = $("partSoundCancel");
  const partSoundApply = $("partSoundApply");
  const partSoundPresetSelect = $("partSoundPresetSelect");
  const partSoundPresetSave = $("partSoundPresetSave");
  const partSoundPresetDelete = $("partSoundPresetDelete");
  const playbackChannelButtons = Array.from(document.querySelectorAll("[data-playback-channel-index]"));
  const mainMml = $("mainMml");
  const mainMmlHighlight = $("mainMmlHighlight");
  const partTexts = PART_LABELS.map((_, i) => $(`part${i}`));
  const partMmlHighlights = PART_LABELS.map((_, i) => $(`part${i}Highlight`));
  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".mml-panel"));

  let audioCtx = null;
  let masterGain = null;
  let partPlaybackGains = [];
  let soundFont = null;
  let defaultSoundFont = null;
  let sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
  let soundFontIsDefault = true;
  let activeSources = [];
  let activeTimers = [];
  let preparedNotes = [];
  let preparedPlaybackPrefixMaxEnd = [];
  let playbackScheduleCursor = 0;
  let scheduledNoteIds = new Set();
  let schedulerTimer = 0;
  const PLAY_START_DELAY = 0.18;
  const SCHEDULE_AHEAD_SEC = 1.6;
  const SCHEDULE_INTERVAL_MS = 80;
  let isPlaying = false;
  let playbackSpeed = 1;
  let scheduleCache = null;
  let scheduleCacheVersion = 0;
  let timelineActivityIntervalsVersion = -1;
  let timelineActivityIntervals = Array.from({ length: 6 }, () => []);
  let timelineActivityRenderSignature = "";
  let timelineActivityResizeObserver = null;
  let timelineActivityRefreshRaf = 0;
  let currentOffset = 0;
  let pianoRollExpanded = false;
  let pianoRollKeyMin = 48;
  let pianoRollKeyMax = 72;
  let pianoRollLastRenderBucket = -1;
  let pianoRollLastDataSignature = "";
  let pianoRollVisibleCacheSignature = "";
  let pianoRollVisibleCache = [];
  let pianoRollRefreshRaf = 0;
  let pianoRollRefreshSettleTimer = 0;
  let pianoRollResizeObserver = null;
  let pianoRollHoveredTempoMarker = null;
  let selectedTempoMarker = null;
  let tempoEditResumePlayback = false;
  let tempoEditResumeOffset = 0;
  let tempoEditSuppressCloseResume = false;
  let playContextStart = 0;
  let playOffsetStart = 0;
  let playbackAutoGainScale = 1;
  let rafId = 0;
  let syncing = false;
  let copyTimer = 0;
  let activeTabName = "main";
  let isSeeking = false;
  let seekRestartTimer = 0;
  let seekPreviewTimer = 0;
  let seekPreviewToken = 0;
  let seekPreviewLastBucket = -1;
  let seekPreviewSources = [];
  let pendingMidiImport = null;
  let pendingMidiSettings = null;
  let pendingMidiStartsNewSource = false;
  const midiInstrumentSectionOpenState = new Map();
  let midiPreviewSources = [];
  let midiPreviewTimer = 0;
  let midiInstrumentPreviewButton = null;
  let midiInstrumentPreviewGroupId = "";
  let midiInstrumentPreviewToken = 0;
  let midiChannelPreviewButton = null;
  let midiChannelPreviewButtonText = "";
  let midiConvertBusy = false;
  let midiLastAppliedSignature = "";
  let midiAppliedSettingsSnapshot = null;
  let midiConvertQueued = false;
  let midiConvertRequestTimer = 0;
  let splitPreviewButton = null;
  let splitPreviewButtonText = "";
  let partPresetKeys = Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
  let draftPartPresetKeys = null;
  let draftSoundPresetBaseId = "";
  let midiPartPresetKeys = null;
  let midiPartPresetName = defaultMidiSoundPresetLabel();
  let userSoundPresets = [];
  let partMuteStates = Array.from({ length: 6 }, () => false);
  let googleTokenClient = null;
  let googleAccessToken = "";
  let googleTokenExpiresAt = 0;
  let googleTokenExpiryTimer = 0;
  let googlePickerLoaded = false;
  let googleSettingsFileId = "";
  let googleSoundBankFileId = "";
  let googleSoundBankSyncQueue = Promise.resolve();
  let googleSettingsApplying = false;
  let googleSettingsSaveTimer = 0;
  let googleSettingsSaving = false;
  let googleDriveMmlFileName = "";
  let googleDriveMmlFolderId = "";
  let googleDriveSaveFolderId = "";
  let googleDriveSaveFolderName = "";
  let googleUserProfile = null;
  let googleUserProfileToken = "";
  let googleUserProfilePromise = null;
  let suggestedMmlSaveFileName = "";
  let pendingMmiImport = null;
  let activePlaybackCodeSignature = "";
  let activePlaybackScanBucket = -1;
  let activePlaybackScanSignature = "";
  let activePlaybackMainRanges = [];
  let activePlaybackPartRanges = Array.from({ length: 6 }, () => []);
  let scheduleTemporalIndexVersion = -1;
  let scheduleNoteTemporalIndex = null;
  let scheduleRestTemporalIndex = null;
  let pianoRollTemporalIndex = null;
  let pianoRollRangeCache = { min: 48, max: 71 };
  let pianoRollTempoMapCacheVersion = -1;
  let pianoRollTempoMapCache = [];
  let editorContentVersion = 0;
  let editorAnalysisCache = {
    source: "",
    parts: null,
    parsed: null,
    schedule: null,
    volumeCounts: null
  };
  let mainHighlightRenderSignature = "";
  let partHighlightRenderSignatures = Array.from({ length: 6 }, () => "");
  const googlePickerSuspendedCloseDialogs = new WeakSet();
  let googlePickerLayerWatchTimer = 0;
  let googlePickerLayerObserver = null;
  let rhythmGameFrameReady = false;
  let rhythmGamePendingPayload = null;
  let rhythmGameLoadTimer = 0;
  let rhythmGamePayloadPending = false;
  let playbackSourceOverride = "";
  let playbackSourceOverrideLabel = "";
  let playbackAnalysisCache = { source: "", schedule: null };
  let originalMidiImport = null;
  let originalMidiPreviewCache = null;
  let playbackMidiOriginalOverride = false;

  async function runPlayerUiBeforeAction(action) {
    const hook = window.MobibardBeforeExport;
    if (typeof hook !== "function") return true;
    try {
      return (await hook(String(action || "export"))) !== false;
    } catch (error) {
      console.warn("[Mobibard] before-export hook failed", error);
      return false;
    }
  }

  async function runPlayerUiBeforePlay() {
    const hook = window.MobibardBeforePlay;
    if (typeof hook !== "function") return true;
    try {
      return (await hook()) !== false;
    } catch (error) {
      console.warn("[Mobibard] before-play hook failed", error);
      return false;
    }
  }

  function notifyPlayerUiSourceBaseline(text, meta = {}) {
    const mml = normalizeMmlForDisplay(String(text || ""));
    try {
      window.dispatchEvent(new CustomEvent("mobibard:source-baseline", {
        detail: {
          mml,
          name: String(meta?.name || ""),
          sourceType: String(meta?.sourceType || ""),
          sourceLabel: String(meta?.sourceLabel || ""),
          newSource: meta?.newSource === true
        }
      }));
    } catch (_) {}
  }

  function handlePlayerUiPreviewSource(event) {
    const detail = event?.detail || {};
    const active = Boolean(detail.active);
    const nextSource = active ? normalizeMmlForDisplay(String(detail.mml || "")) : "";
    const nextLabel = active ? String(detail.label || "") : "";
    if (nextSource === playbackSourceOverride && nextLabel === playbackSourceOverrideLabel) return;

    const wasPlaying = Boolean(isPlaying);
    stopPlayback(false);
    playbackSourceOverride = nextSource;
    playbackSourceOverrideLabel = nextLabel;
    playbackAnalysisCache = { source: "", schedule: null };
    currentOffset = 0;
    clearPlaybackCodeHighlight();
    rebuildSchedulePreviewSilently();
    try {
      window.dispatchEvent(new CustomEvent("mobibard:preview-source-changed", {
        detail: { active: Boolean(playbackSourceOverride), label: playbackSourceOverrideLabel }
      }));
    } catch (_) {}
    if (wasPlaying) setTimeout(() => void playFromCurrent(), 20);
  }

  window.addEventListener("mobibard:preview-source", handlePlayerUiPreviewSource);


  function dispatchPlayerUiOriginalAvailability() {
    try {
      window.dispatchEvent(new CustomEvent("mobibard:original-preview-availability", {
        detail: { available: Boolean(originalMidiImport?.bytes) }
      }));
    } catch (_) {}
  }

  function dispatchPlayerUiOriginalState(active = playbackMidiOriginalOverride) {
    try {
      window.dispatchEvent(new CustomEvent("mobibard:original-preview-state", {
        detail: { active: Boolean(active), available: Boolean(originalMidiImport?.bytes) }
      }));
    } catch (_) {}
  }

  function setPlayerUiOriginalMidiImport(importData = null) {
    originalMidiImport = importData?.bytes ? importData : null;
    originalMidiPreviewCache = null;
    if (!originalMidiImport && playbackMidiOriginalOverride) {
      playbackMidiOriginalOverride = false;
      currentOffset = 0;
      rebuildSchedulePreviewSilently();
      dispatchPlayerUiOriginalState(false);
    }
    dispatchPlayerUiOriginalAvailability();
  }

  function getPlayerUiOriginalMidiSchedule() {
    if (originalMidiPreviewCache) return originalMidiPreviewCache;
    if (!originalMidiImport?.bytes) return null;
    const preview = buildMidiFilePreview(originalMidiImport.bytes, { maxSeconds: 900, tailSeconds: 1.0 });
    const notes = Array.isArray(preview?.notes) ? preview.notes : [];
    const duration = Math.max(
      Number(preview?.duration) || 0,
      notes.reduce((max, note) => Math.max(max, Number(note?.start) + Number(note?.durationSec || 0)), 0)
    );
    originalMidiPreviewCache = {
      notes,
      rests: [],
      duration,
      tempoMarkers: Array.isArray(preview?.tempoMarkers) ? preview.tempoMarkers : [],
      tempoMap: Array.isArray(preview?.tempoMap) && preview.tempoMap.length
        ? preview.tempoMap
        : [{ beat: 0, time: 0, bpm: 120, part: -1, explicit: false }],
      summary: i18nText("mml.estimated_length", [formatTime(duration)])
    };
    return originalMidiPreviewCache;
  }

  function handlePlayerUiOriginalMidiPreview(event) {
    const requested = Boolean(event?.detail?.active) && Boolean(originalMidiImport?.bytes);
    if (requested === playbackMidiOriginalOverride) {
      dispatchPlayerUiOriginalState(requested);
      return;
    }
    const wasPlaying = Boolean(isPlaying);
    stopMidiPreview();
    stopPlayback(false);
    try {
      if (requested && !getPlayerUiOriginalMidiSchedule()) throw new Error(i18nText("midi.err_no_preview_notes"));
      playbackMidiOriginalOverride = requested;
      playbackSourceOverride = "";
      playbackSourceOverrideLabel = "";
      playbackAnalysisCache = { source: "", schedule: null };
      currentOffset = 0;
      clearPlaybackCodeHighlight();
      rebuildSchedulePreviewSilently();
      dispatchPlayerUiOriginalState(requested);
      if (wasPlaying) setTimeout(() => void playFromCurrent(), 20);
    } catch (err) {
      playbackMidiOriginalOverride = false;
      currentOffset = 0;
      rebuildSchedulePreviewSilently();
      dispatchPlayerUiOriginalState(false);
      showToast([i18nText("midi.preview_fail_title", [getMidiImportSourceLabel(originalMidiImport)]), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  window.addEventListener("mobibard:original-midi-preview", handlePlayerUiOriginalMidiPreview);
  window.addEventListener("mobibard:set-midi-quantize", event => {
    if (!pendingMidiSettings || midiConvertBusy) return;
    const division = Number(event?.detail?.division) === 32 ? 32 : 64;
    if (Number(pendingMidiSettings.quantizeDivision) === division) {
      updateMidiQuantizeToggle();
      return;
    }
    stopMidiPreview();
    pendingMidiSettings.quantizeDivision = division;
    updateMidiQuantizeToggle();
    showToast(i18nText("midi.quantize_changed", [division]), "info");
  });
  window.addEventListener("mobibard:request-midi-convert", () => requestMidiConvert());

  void init();

  async function init() {
    try { await window.MobibardI18n?.ready; } catch (_) {}
    loadThemePref();
    loadPlaybackPrefs();
    loadPianoRollPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    restoreGoogleTokenCache();
    midiLoadBtn.addEventListener("click", () => openSourceFilePicker());
    midiSiteLinks?.addEventListener("change", openHeaderShortcutLink);
    midiFile.addEventListener("change", () => void loadSourceFile());
    installSourceFileDropHandlers();
    languageSelect?.addEventListener("change", () => void handleLanguageChange());
    accountMenuButton?.addEventListener("click", toggleAccountMenu);
    document.addEventListener("pointerdown", handleAccountMenuOutsidePointer);
    document.addEventListener("keydown", handleAccountMenuKeydown);
    document.addEventListener("pointerdown", handleControlPopoverOutsidePointer);
    document.addEventListener("keydown", handleControlPopoverKeydown);
    window.addEventListener("mobibard:localechange", handleLocaleChange);
    updateSimpleVersionLink();
    if (accountAvatarImg) {
      accountAvatarImg.addEventListener("error", () => {
        const current = accountAvatarImg.getAttribute("src") || "";
        if (!current.endsWith(GUEST_AVATAR_URL)) accountAvatarImg.src = GUEST_AVATAR_URL;
      });
    }
    googleLoginBtn?.addEventListener("click", () => void handleGoogleLoginButton());
    googleDriveLoadBtn?.addEventListener("click", () => void openGoogleDrivePicker());
    googleDriveSaveBtn?.addEventListener("click", async () => {
      if (await runPlayerUiBeforeAction("save")) void saveMmlToGoogleDrive();
    });
    codeHelpBtn?.addEventListener("click", () => openCodeHelpDialog());
    codeHelpClose?.addEventListener("click", () => codeHelpDialog?.close());
    mmiFullPreviewBtn?.addEventListener("click", () => void toggleMmiSelectedPreview());
    mmiAllPreviewBtn?.addEventListener("click", () => void toggleMmiAllPreview());
    mmiImportClear?.addEventListener("click", () => clearMmiImportSelection());
    mmiImportReloadFile?.addEventListener("click", () => openSourceFilePicker());
    mmiImportGoogleDriveLoad?.addEventListener("click", () => void openGoogleDrivePicker());
    mmiImportCancel?.addEventListener("click", () => closeMmiImportDialog(null));
    mmiImportApply?.addEventListener("click", () => applyMmiImportDialog());
    mmiImportDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      stopMidiPreview();
      closeMmiImportDialog(null);
    });
    mmiImportDialog?.addEventListener("close", () => {
      stopMidiPreview();
      if (googlePickerSuspendedCloseDialogs.has(mmiImportDialog)) {
        googlePickerSuspendedCloseDialogs.delete(mmiImportDialog);
        return;
      }
      if (pendingMmiImport) resolveMmiImportDialog(null);
    });
    sf2File?.addEventListener("change", () => { if (sf2File.files?.[0]) void loadUserSf2(); });
    soundFontLoadBtn?.addEventListener("click", openSf2Picker);
    soundFontResetBtn?.addEventListener("click", () => void restoreDefaultSoundFont());
    playToggleBtn.addEventListener("click", async () => {
      if (isPlaying) { stopPlayback(false); return; }
      if (await runPlayerUiBeforePlay()) void playFromCurrent();
    });
    rewindBtn.addEventListener("click", () => void rewindToStart());
    loopPlayback?.addEventListener("change", () => writePref("loop", loopPlayback.checked ? "1" : "0"));
    speedControlButton?.addEventListener("click", () => toggleControlPopover(speedControlButton, speedControlPopover));
    volumeControlButton?.addEventListener("click", () => toggleControlPopover(volumeControlButton, volumeControlPopover));
    speedResetBtn?.addEventListener("click", resetPlaybackSpeed);
    volumeResetBtn?.addEventListener("click", resetOutputVolume);
    speedSlider?.addEventListener("input", applyPlaybackSpeed);
    speedSlider?.addEventListener("change", applyPlaybackSpeed);
    volumeSlider?.addEventListener("input", applyOutputVolume);
    progressSlider.addEventListener("pointerdown", () => {
      isSeeking = true;
      seekPreviewLastBucket = -1;
      stopSeekPreviewAudio();
    });
    progressSlider.addEventListener("pointerup", () => { isSeeking = false; handleSeekInput(true); });
    progressSlider.addEventListener("pointercancel", () => { isSeeking = false; handleSeekInput(true); });
    progressSlider.addEventListener("touchend", () => { isSeeking = false; handleSeekInput(true); }, { passive: true });
    progressSlider.addEventListener("input", () => handleSeekInput(false));
    progressSlider.addEventListener("change", () => handleSeekInput(true));
    tempoMarkerLayer?.addEventListener("click", handleTempoMarkerLayerClick);
    tempoEditApply?.addEventListener("click", applyTempoEditFromDialog);
    tempoEditForm?.addEventListener("submit", event => { event.preventDefault(); applyTempoEditFromDialog(); });
    tempoEditCancel?.addEventListener("click", () => tempoEditDialog?.close());
    tempoEditBpm?.addEventListener("change", normalizeTempoEditBpmInput);
    tempoEditBpm?.addEventListener("blur", normalizeTempoEditBpmInput);
    tempoEditDialog?.addEventListener("close", () => {
      selectedTempoMarker = null;
      if (!tempoEditSuppressCloseResume) resumePlaybackAfterTempoEdit();
    });
    pianoRoll?.addEventListener("click", handlePianoRollClick);
    pianoRoll?.addEventListener("pointermove", handlePianoRollPointerMove);
    pianoRoll?.addEventListener("pointerleave", clearPianoRollTempoHover);
    pianoRoll?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        togglePianoRoll();
      }
    });
    installPianoRollRefreshHooks();
    installTimelineActivityRefreshHooks();
    copyBtn.addEventListener("click", async () => {
      if (!(await runPlayerUiBeforeAction("copy"))) return;
      void copyVisibleMml();
    });
    pasteBtn.addEventListener("click", () => void openPasteMmlDialog());
    pasteMmlCancel?.addEventListener("click", () => pasteMmlDialog?.close());
    pasteMmlApply?.addEventListener("click", event => {
      event.preventDefault();
      void applyPasteMmlDialog();
    });
    pasteMmlForm?.addEventListener("submit", event => {
      event.preventDefault();
      void applyPasteMmlDialog();
    });
    pasteMmlDialog?.addEventListener("close", () => {
      if (pasteMmlStatus) pasteMmlStatus.textContent = "";
    });
    saveBtn.addEventListener("click", async () => {
      if (await runPlayerUiBeforeAction("save")) void saveVisibleMml();
    });
    midiExtractBtn?.addEventListener("click", () => {
      const midiExtractWindow = window.open("https://muscriptor.kyutai.org/", "_blank");
      if (midiExtractWindow) midiExtractWindow.opener = null;
    });
    rhythmGameBtn?.addEventListener("click", () => {
      openRhythmGameLayer();
    });
    rhythmGameClose?.addEventListener("click", closeRhythmGameLayer);
    rhythmGameFrame?.addEventListener("load", handleRhythmGameFrameLoad);
    window.addEventListener("message", handleRhythmGameMessage);
    partSoundBtn?.addEventListener("click", () => void openPartSoundDialog());
    partSoundCancel?.addEventListener("click", () => partSoundDialog?.close());
    partSoundApply?.addEventListener("click", () => applyPartSoundDialog());
    partSoundPresetSelect?.addEventListener("change", () => applyPartSoundPresetToDraft(partSoundPresetSelect.value));
    partSoundPresetSave?.addEventListener("click", () => void saveDraftSoundPreset());
    partSoundPresetDelete?.addEventListener("click", () => void deleteSelectedSoundPreset());
    for (const button of playbackChannelButtons) {
      button.addEventListener("click", () => {
        const index = clampInt(Number(button.dataset.playbackChannelIndex), 0, 5);
        const next = partMuteStates.slice();
        next[index] = !next[index];
        applyPartMuteStates(next);
      });
    }
    midiBulkAssignBtn?.addEventListener("click", openMidiBulkAssignDialog);
    for (const button of midiBulkChannelButtons) {
      button.addEventListener("click", () => {
        const selected = button.getAttribute("aria-pressed") !== "true";
        setMidiBulkChannelButtonState(button, selected);
        updateMidiBulkAllButtonState();
      });
    }
    midiBulkAllBtn?.addEventListener("click", () => {
      const shouldSelectAll = !midiBulkChannelButtons.every(button => button.getAttribute("aria-pressed") === "true");
      for (const button of midiBulkChannelButtons) setMidiBulkChannelButtonState(button, shouldSelectAll);
      updateMidiBulkAllButtonState();
    });
    for (const button of midiBulkInstrumentButtons) {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const selected = button.getAttribute("aria-pressed") !== "true";
        setMidiBulkChannelButtonState(button, selected);
        updateMidiBulkAllInstrumentButtonState();
      });
    }
    midiBulkAllInstrumentBtn?.addEventListener("click", () => {
      const availableButtons = midiBulkInstrumentButtons.filter(button => !button.disabled);
      if (!availableButtons.length) return;
      const shouldSelectAll = !availableButtons.every(button => button.getAttribute("aria-pressed") === "true");
      for (const button of availableButtons) setMidiBulkChannelButtonState(button, shouldSelectAll);
      updateMidiBulkAllInstrumentButtonState();
    });
    midiBulkClearBtn?.addEventListener("click", () => applyMidiBulkAssignment(false));
    midiBulkSelectBtn?.addEventListener("click", () => applyMidiBulkAssignment(true));
    midiBulkCancelBtn?.addEventListener("click", () => midiBulkAssignDialog?.close());
    midiConvertReloadFile?.addEventListener("click", () => { if (!midiConvertBusy) openSourceFilePicker(); });
    midiConvertGoogleDriveLoad?.addEventListener("click", () => { if (!midiConvertBusy) void openGoogleDrivePicker(); });
    midiConvertApply?.addEventListener("click", () => requestMidiConvert({ force: true }));
    midiConvertCancel?.addEventListener("click", () => {
      if (midiConvertBusy) return;
      stopMidiPreview();
      if (midiAppliedSettingsSnapshot) {
        pendingMidiSettings = cloneMidiPendingSettings(midiAppliedSettingsSnapshot);
        updateMidiConvertSummary();
        updateMidiQuantizeToggle();
        renderMidiRoleList();
        renderActiveMidiInstrumentList();
        updateMidiRoleControls();
        try { window.dispatchEvent(new CustomEvent("mobibard:midi-settings-cancelled")); } catch (_) {}
        return;
      }
      pendingMidiImport = null;
      pendingMidiSettings = null;
      midiConvertDialog?.close();
    });
    midiConvertDialog?.addEventListener("cancel", (event) => {
      if (midiConvertBusy) event.preventDefault();
    });
    midiConvertDialog?.addEventListener("close", () => {
      stopMidiPreview();
      if (!midiConvertBusy) setMidiConvertBusy(false);
      if (midiChannelList) {
        midiChannelList.style.height = "";
        midiChannelList.style.minHeight = "";
        midiChannelList.style.maxHeight = "";
      }
    });
    window.addEventListener("resize", () => {
      if (midiConvertDialog?.open) scheduleMidiInstrumentListHeightSync();
      requestPianoRollRefresh(true);
    });
    partSoundDialog?.addEventListener("close", () => stopMidiPreview());
    themeToggleBtn?.addEventListener("click", toggleTheme);
    mainMml.addEventListener("paste", handleEditorMmlPaste);
    mainMml.addEventListener("input", () => {
      const generatedByPlayerUi = mainMml.dataset.playerUiApply === "1";
      if (!generatedByPlayerUi) normalizeTextareaCommands(mainMml);
      syncPartsFromMain({ generatedByPlayerUi });
    });
    mainMml.addEventListener("scroll", syncHighlightScroll);
    partTexts.forEach((t, i) => {
      t.addEventListener("paste", handleEditorMmlPaste);
      t.addEventListener("input", () => {
        normalizeTextareaCommands(t);
        syncMainFromParts();
      });
      t.addEventListener("scroll", () => syncPartHighlightScroll(i));
    });
    tabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
    // 이전 MML 편집 초안 캐시는 더 이상 사용하지 않는다.
    // MIDI/파일 불러오기 설정 캐시(midiConvertLastSettings)는 별도 키이므로 유지한다.
    try { localStorage.removeItem(PREF_PREFIX + "mmlDraft"); } catch (_) {}
    await restoreCachedSoundBankFromLocal();
    normalizeTextareaCommands(mainMml);
    syncPartsFromMain();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updateSoundFontUi();
    updateSoundPresetControls();
    updatePartMuteControl();
    updateGoogleDriveControls();
    scheduleGoogleAutoReconnect();
    updateCharCount();
    rebuildSchedulePreviewSilently();
    requestPianoRollRefresh(true);
  }

  function updateSimpleVersionLink(language = "") {
    if (!simpleVersionBtn) return;
    const requested = window.MobibardI18n?.normalizeLanguage(language || languageSelect?.value || document.documentElement.lang) || "en";
    try {
      const url = new URL("../simple/index.html", window.location.href);
      url.searchParams.set("lang", requested);
      simpleVersionBtn.href = url.href;
    } catch (_) {
      simpleVersionBtn.href = `../simple/index.html?lang=${encodeURIComponent(requested)}`;
    }
  }

  async function handleLanguageChange() {
    if (!languageSelect) return;
    const requested = window.MobibardI18n?.normalizeLanguage(languageSelect.value) || "en";
    writePref("language", requested);
    const applied = await window.MobibardI18n?.setLanguage(requested, { persist: false, source: "user" });
    updateSimpleVersionLink(applied || requested);
  }

  function i18nText(key, values = []) {
    return window.MobibardI18n?.t?.(key, values) || String(key);
  }

  function defaultMidiSoundPresetLabel() {
    return i18nText(DEFAULT_MIDI_SOUND_PRESET_KEY);
  }

  function setAccountMenuOpen(open) {
    if (!accountMenu || !accountMenuButton) return;
    const next = Boolean(open);
    if (next) closeAllControlPopovers();
    accountMenu.hidden = !next;
    accountMenuButton.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      updateAccountUi();
      if (isGoogleConnected()) void loadGoogleUserProfile();
    }
  }

  function toggleAccountMenu() {
    setAccountMenuOpen(Boolean(accountMenu?.hidden));
  }

  function handleAccountMenuOutsidePointer(event) {
    if (accountMenu?.hidden) return;
    if (event?.target?.closest?.(".account-menu-wrap")) return;
    setAccountMenuOpen(false);
  }

  function handleAccountMenuKeydown(event) {
    if (event?.key !== "Escape" || accountMenu?.hidden) return;
    event.preventDefault();
    setAccountMenuOpen(false);
    accountMenuButton?.focus();
  }

  function getControlPopoverPairs() {
    return [
      [speedControlButton, speedControlPopover],
      [volumeControlButton, volumeControlPopover]
    ].filter(([button, popover]) => button && popover);
  }

  function closeAllControlPopovers(exceptPopover = null) {
    for (const [button, popover] of getControlPopoverPairs()) {
      if (popover === exceptPopover) continue;
      popover.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  }

  function positionControlPopover(popover) {
    if (!popover || popover.hidden) return;
    const viewportPadding = 8;
    popover.classList.remove("place-below");
    popover.style.removeProperty("--popover-shift-x");

    let rect = popover.getBoundingClientRect();
    if (rect.top < viewportPadding) {
      popover.classList.add("place-below");
      rect = popover.getBoundingClientRect();
    }

    let shiftX = 0;
    if (rect.left < viewportPadding) shiftX = viewportPadding - rect.left;
    if (rect.right > window.innerWidth - viewportPadding) {
      shiftX += window.innerWidth - viewportPadding - rect.right;
    }
    if (shiftX) popover.style.setProperty("--popover-shift-x", `${Math.round(shiftX)}px`);
  }

  function setControlPopoverOpen(button, popover, open) {
    if (!button || !popover) return;
    const next = Boolean(open);
    if (next) {
      setAccountMenuOpen(false);
      closeAllControlPopovers(popover);
    }
    popover.hidden = !next;
    button.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      requestAnimationFrame(() => {
        positionControlPopover(popover);
        popover.querySelector('a[href], input, button, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
      });
    } else {
      popover.classList.remove("place-below");
      popover.style.removeProperty("--popover-shift-x");
    }
  }

  function toggleControlPopover(button, popover) {
    setControlPopoverOpen(button, popover, Boolean(popover?.hidden));
  }

  function handleControlPopoverOutsidePointer(event) {
    if (event?.target?.closest?.(".compact-control-wrap")) return;
    closeAllControlPopovers();
  }

  function handleControlPopoverKeydown(event) {
    if (event?.key !== "Escape") return;
    const openPair = getControlPopoverPairs().find(([, popover]) => !popover.hidden);
    if (!openPair) return;
    event.preventDefault();
    closeAllControlPopovers();
    openPair[0]?.focus();
  }

  function handleLocaleChange(event) {
    updateSimpleVersionLink(event?.detail?.language || "");
    applyTheme(document.documentElement.dataset.theme, false);
    updateAccountUi();
    updateGoogleDriveControls();
    updatePlayButton();
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updatePartMuteControl();
    updateSoundFontUi();
    updateSoundPresetControls();
    if (mmiImportDialog?.open) updateMmiImportSelectionState();
    if (pianoRollEmpty && !pianoRollEmpty.hidden && pianoRollRangeLabel) {
      pianoRollRangeLabel.textContent = i18nText("roll.title");
    }
    if (midiConvertDialog?.open) refreshMidiConvertLocale();
  }

  function openHeaderShortcutLink() {
    if (!midiSiteLinks) return;
    const url = midiSiteLinks.value;
    midiSiteLinks.value = "";
    if (!url || !HEADER_SHORTCUT_LINKS.has(url)) return;

    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      try { opened.opener = null; } catch (_) {}
    }
  }

  function trackScoreCopy(scope) {
    const event = { name: "score_copy", params: { page: "player", copy_scope: String(scope || "all") } };
    try {
      const analytics = window.MobibardAnalytics;
      if (analytics && typeof analytics.logEvent === "function") {
        analytics.logEvent(event.name, event.params);
      } else {
        const queueKey = "__MOBIBARD_ANALYTICS_QUEUE__";
        const queue = Array.isArray(window[queueKey]) ? window[queueKey] : (window[queueKey] = []);
        queue.push(event);
        if (queue.length > 100) queue.splice(0, queue.length - 100);
      }
    } catch (_) {}
  }

  function loadPlaybackPrefs() {
    const savedVolumeText = readPref("volume");
    if (savedVolumeText != null && savedVolumeText !== "") {
      const savedVolume = Number(savedVolumeText);
      if (Number.isFinite(savedVolume)) volumeSlider.value = String(Math.max(0, Math.min(150, Math.round(savedVolume))));
    }

    const savedSpeedText = readPref("speed");
    if (savedSpeedText != null && savedSpeedText !== "") {
      const savedSpeed = Number(savedSpeedText);
      if (Number.isFinite(savedSpeed)) speedSlider.value = String(Math.max(0.75, Math.min(1.5, savedSpeed)));
    }

    const savedLoop = readPref("loop");
    if (loopPlayback && savedLoop != null) loopPlayback.checked = savedLoop === "1";
  }


  function defaultPartPresetKeys() {
    return Array.from({ length: 6 }, () => DEFAULT_PART_PRESET_KEY);
  }

  function normalizePresetKeyArray(input, fallback = DEFAULT_PART_PRESET_KEY) {
    const source = Array.isArray(input) ? input : [];
    return Array.from({ length: 6 }, (_, i) => sanitizePresetKey(source[i] || fallback));
  }

  function samePresetKeys(a, b) {
    const aa = normalizePresetKeyArray(a);
    const bb = normalizePresetKeyArray(b);
    return aa.every((key, i) => key === bb[i]);
  }

  function loadPartSoundPrefs() {
    const saved = readPref("partPresetKeys");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      partPresetKeys = normalizePresetKeyArray(arr);
    } catch (_) {
      partPresetKeys = defaultPartPresetKeys();
    }
  }

  function savePartSoundPrefs() {
    partPresetKeys = normalizePresetKeyArray(partPresetKeys);
    writePref("partPresetKeys", JSON.stringify(partPresetKeys));
  }

  function loadMidiPartSoundPresetPrefs() {
    const saved = readPref("midiPartPresetKeys");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      midiPartPresetKeys = normalizePresetKeyArray(arr);
      midiPartPresetName = readPref("midiPartPresetName") || defaultMidiSoundPresetLabel();
    } catch (_) {
      midiPartPresetKeys = null;
      midiPartPresetName = defaultMidiSoundPresetLabel();
    }
  }

  function saveMidiPartSoundPresetPrefs() {
    if (!Array.isArray(midiPartPresetKeys)) return;
    midiPartPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
    writePref("midiPartPresetKeys", JSON.stringify(midiPartPresetKeys));
    writePref("midiPartPresetName", midiPartPresetName || defaultMidiSoundPresetLabel());
  }

  function loadPianoRollPrefs() {
    pianoRollExpanded = readPref("pianoRollExpanded") === "1";
    applyPianoRollExpandedState(false);
  }

  function togglePianoRoll() {
    pianoRollExpanded = !pianoRollExpanded;
    applyPianoRollExpandedState(true);
    requestPianoRollRefresh(true);
  }

  function handlePianoRollClick(event) {
    const toggleControl = event?.target?.closest?.(".piano-roll-corner");
    if (toggleControl && pianoRoll?.contains(toggleControl)) {
      event.preventDefault();
      event.stopPropagation();
      togglePianoRoll();
      return;
    }

    // 템포 가로선은 순수 표시 요소다. 왼쪽의 T숫자 라벨만 편집 버튼으로 동작한다.
    const marker = findPianoRollTempoMarkerAtEvent(event);
    if (marker) {
      event.preventDefault();
      event.stopPropagation();
      openTempoEditDialog(marker);
      return;
    }
    togglePianoRoll();
  }

  function handlePianoRollPointerMove(event) {
    const toggleControl = event?.target?.closest?.(".piano-roll-corner");
    const marker = toggleControl ? null : findPianoRollTempoMarkerAtEvent(event);
    if (marker === pianoRollHoveredTempoMarker) return;
    pianoRollHoveredTempoMarker = marker;
    pianoRoll?.classList.toggle("tempo-label-hover", Boolean(marker));
    requestPianoRollRefresh(false);
  }

  function clearPianoRollTempoHover() {
    if (!pianoRollHoveredTempoMarker) return;
    pianoRollHoveredTempoMarker = null;
    pianoRoll?.classList.remove("tempo-label-hover");
    requestPianoRollRefresh(false);
  }

  function findPianoRollTempoMarkerAtEvent(event) {
    const stage = pianoRoll?.querySelector?.(".piano-roll-stage");
    const markers = Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : [];
    if (!stage || !markers.length) return null;

    const rect = stage.getBoundingClientRect();
    const x = Number(event?.clientX) - rect.left;
    const y = Number(event?.clientY) - rect.top;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

    const keyHeight = Math.min(getPianoRollKeyHeight(), Math.max(18, rect.height * 0.72));
    const fallAreaHeight = Math.max(12, rect.height - keyHeight);
    if (y > fallAreaHeight + 7) return null;

    const duration = scheduleCache?.duration || Number(progressSlider?.max) || 0;
    const current = Math.max(0, Math.min(duration || Infinity, Number(currentOffset) || 0));
    const fallWindow = pianoRollExpanded ? PIANO_ROLL_FALL_WINDOW_EXPANDED : PIANO_ROLL_FALL_WINDOW_COLLAPSED;
    const pxPerSec = fallAreaHeight / fallWindow;
    const visibleEnd = current + fallWindow;
    let best = null;
    let bestDistance = Infinity;

    for (const marker of markers) {
      const time = Math.max(0, Number(marker?.time) || 0);
      if (time < current - 0.03 || time > visibleEnd + 0.03) continue;
      const rawY = fallAreaHeight - ((time - current) * pxPerSec);
      if (rawY < -1 || rawY > fallAreaHeight + 1) continue;
      const lineY = Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(rawY) + 0.5));
      const bpm = Math.max(1, Math.round(Number(marker?.bpm) || 120));
      const labelWidth = measurePianoRollTempoLabelWidth(bpm);
      const labelHeight = 17;
      const labelX = 5;
      const labelY = Math.max(2, Math.min(fallAreaHeight - labelHeight - 2, lineY - labelHeight - 2));
      const labelHit = x >= labelX - 3 && x <= labelX + labelWidth + 3 && y >= labelY - 3 && y <= labelY + labelHeight + 3;
      if (labelHit && 0 < bestDistance) {
        best = marker;
        bestDistance = 0;
      }
    }
    return best;
  }


  function measurePianoRollTempoLabelWidth(bpm) {
    const fallback = Math.max(31, 7 * String(`T${bpm}`).length + 12);
    if (!(pianoRollCanvas instanceof HTMLCanvasElement)) return fallback;
    const ctx = pianoRollCanvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.save();
    ctx.font = `950 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const width = Math.ceil(ctx.measureText(`T${bpm}`).width) + 12;
    ctx.restore();
    return Math.max(31, width);
  }

  function applyPianoRollExpandedState(persist) {
    if (!pianoRoll) return;
    pianoRoll.classList.toggle("expanded", pianoRollExpanded);
    pianoRoll.setAttribute("aria-expanded", pianoRollExpanded ? "true" : "false");
    pianoRoll.setAttribute("aria-label", pianoRollExpanded ? i18nText("roll.collapse") : i18nText("roll.expand"));
    pianoRoll.title = pianoRollExpanded ? i18nText("roll.collapse_help") : i18nText("roll.expand_help");
    if (pianoRollToggleLabel) pianoRollToggleLabel.textContent = pianoRollExpanded ? i18nText("ui.collapse") : i18nText("ui.expand");
    if (persist) writePref("pianoRollExpanded", pianoRollExpanded ? "1" : "0");
  }

  function getPianoRollRenderDuration() {
    return scheduleCache?.duration || Number(progressSlider?.max) || 0;
  }

  function requestPianoRollRefresh(settle = false) {
    if (!pianoRoll || !pianoRollCanvas) return;

    const run = () => updatePianoRoll(currentOffset, getPianoRollRenderDuration(), true);
    const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);
    const caf = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);

    if (pianoRollRefreshRaf) caf(pianoRollRefreshRaf);
    pianoRollRefreshRaf = raf(() => {
      pianoRollRefreshRaf = 0;
      run();
      // 레이아웃 계산 직후 한 번 더 그려서 접힘/펼침 직후 캔버스 비율이 늘어나 보이는 현상을 줄인다.
      raf(run);
    });

    if (settle) {
      clearTimeout(pianoRollRefreshSettleTimer);
      pianoRollRefreshSettleTimer = setTimeout(run, 240);
    }
  }

  function installPianoRollRefreshHooks() {
    const stage = pianoRoll?.querySelector(".piano-roll-stage");
    if (!stage) return;

    if (typeof ResizeObserver === "function") {
      try { pianoRollResizeObserver?.disconnect?.(); } catch (_) {}
      let lastWidth = -1;
      let lastHeight = -1;
      pianoRollResizeObserver = new ResizeObserver((entries) => {
        const rect = entries?.[0]?.contentRect;
        const width = Math.round((rect?.width || stage.clientWidth || 0) * 10);
        const height = Math.round((rect?.height || stage.clientHeight || 0) * 10);
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        requestPianoRollRefresh(false);
      });
      pianoRollResizeObserver.observe(stage);
    }

    stage.addEventListener("transitionend", (event) => {
      if (!event || event.propertyName === "height" || event.propertyName === "all") {
        requestPianoRollRefresh(false);
      }
    });

    if (document.readyState === "complete") {
      requestPianoRollRefresh(true);
    } else {
      window.addEventListener("load", () => requestPianoRollRefresh(true), { once: true });
    }
  }

  function loadPartMutePrefs() {
    const saved = readPref("playbackChannelAudibleV8");
    if (!saved) {
      partMuteStates = Array.from({ length: 6 }, () => false);
      return;
    }
    try {
      const audible = JSON.parse(saved);
      if (!Array.isArray(audible)) throw new Error("invalid preference");
      partMuteStates = Array.from({ length: 6 }, (_, i) => !Boolean(audible[i]));
    } catch (_) {
      partMuteStates = Array.from({ length: 6 }, () => false);
    }
  }

  function savePartMutePrefs() {
    partMuteStates = Array.from({ length: 6 }, (_, i) => Boolean(partMuteStates[i]));
    writePref("playbackChannelAudibleV8", JSON.stringify(partMuteStates.map(muted => !muted)));
  }

  function loadThemePref() {
    const savedTheme = readPref("theme");
    applyTheme(savedTheme === "dark" ? "dark" : "light", false);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  }

  function applyTheme(theme, persist = true) {
    const resolved = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    if (themeToggleBtn) {
      const toggleLabel = i18nText("theme.toggle");
      themeToggleBtn.dataset.currentTheme = resolved;
      delete themeToggleBtn.dataset.targetTheme;
      themeToggleBtn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
      themeToggleBtn.setAttribute("aria-label", toggleLabel);
      themeToggleBtn.title = toggleLabel;
      if (themeModeText) themeModeText.textContent = toggleLabel;
    }
    if (persist) writePref("theme", resolved);
    pianoRollLastDataSignature = "";
    requestTimelineActivityRefresh(true);
    updatePianoRoll(currentOffset, scheduleCache?.duration || Number(progressSlider?.max) || 0, true);
  }

  function readPref(name) {
    try { return localStorage.getItem(PREF_PREFIX + name); }
    catch (_) { return null; }
  }

  function writePref(name, value) {
    try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
    catch (_) {}
    scheduleGoogleSettingsSave();
  }

  function writeLocalPrefOnly(name, value) {
    try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
    catch (_) {}
  }

  function removeLocalPrefOnly(name) {
    try { localStorage.removeItem(PREF_PREFIX + name); }
    catch (_) {}
  }

  function readLocalJsonPref(name) {
    const raw = readPref(name);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  }

  function writeLocalJsonPref(name, value) {
    try { writeLocalPrefOnly(name, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function shouldGoogleAutoReconnect() {
    return readPref(GOOGLE_AUTO_RECONNECT_PREF) === "1";
  }

  function setGoogleAutoReconnect(enabled) {
    writeLocalPrefOnly(GOOGLE_AUTO_RECONNECT_PREF, enabled ? "1" : "0");
  }

  function googleClientId() {
    return String(GOOGLE_CONFIG.clientId || GOOGLE_CONFIG.clientID || GOOGLE_CONFIG.CLIENT_ID || "").trim();
  }

  function googleApiKey() {
    return String(GOOGLE_CONFIG.apiKey || GOOGLE_CONFIG.API_KEY || "").trim();
  }

  function googleAppId() {
    return String(GOOGLE_CONFIG.appId || GOOGLE_CONFIG.APP_ID || "").trim();
  }

  function isGoogleConnected() {
    return Boolean(googleAccessToken) && Date.now() < googleTokenExpiresAt - 30000;
  }

  function clearGoogleTokenExpiryTimer() {
    if (googleTokenExpiryTimer) {
      window.clearTimeout(googleTokenExpiryTimer);
      googleTokenExpiryTimer = 0;
    }
  }

  function scheduleGoogleTokenExpiryRefresh() {
    clearGoogleTokenExpiryTimer();
    if (!googleAccessToken || !Number.isFinite(googleTokenExpiresAt) || !googleTokenExpiresAt) return;
    const delay = Math.max(0, googleTokenExpiresAt - Date.now() - 30000);
    googleTokenExpiryTimer = window.setTimeout(() => {
      if (!isGoogleConnected()) {
        clearGoogleTokenState(true);
        updateGoogleDriveControls(i18nText("ui.login_required"));
      } else {
        updateGoogleDriveControls();
        scheduleGoogleTokenExpiryRefresh();
      }
    }, delay + 250);
  }

  function clearGoogleTokenCache() {
    removeLocalPrefOnly(GOOGLE_TOKEN_CACHE_PREF);
  }

  function currentRhythmGameTitle() {
    const name = String(googleDriveMmlFileName || suggestedMmlSaveFileName || "")
      .replace(/\.(txt|mml|mid|midi|kar|xmi|hmp|hmi|mod|s3m|xm|it|seq|xgm|vgm|vgz|gym|s98|mus|musx|mnx(?:\.json)?|mscz|mscx|musicxml|xml|mxl|mmi|gp3|gp4|gp5|gpx|gp|tab|vsq|vsqx|vpr|ust|ustx|svp|s5p|ccs)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    return name || i18nText("mml.title");
  }

  function buildRhythmGamePayload() {
    normalizeTextareaCommands(mainMml);
    const mml = normalizeMmlForDisplay(mainMml?.value || "");
    const parsed = parseMabinogiMml(mml);
    const activeChannelCount = (parsed.parts || []).filter(part =>
      (part.notes || []).some(note => Number(note.volume ?? 8) > 0)
    ).length;
    if (!activeChannelCount) throw new Error(i18nText("game.no_channel"));

    return {
      title: currentRhythmGameTitle(),
      mml,
      instruments: normalizePresetKeyArray(partPresetKeys),
      channelCount: activeChannelCount
    };
  }

  function setRhythmGameLoading(message, mode = "loading") {
    if (rhythmGameLoadingText) rhythmGameLoadingText.textContent = message;
    if (rhythmGameLoading) {
      rhythmGameLoading.hidden = false;
      rhythmGameLoading.dataset.mode = mode;
    }
    if (rhythmGameStatus) rhythmGameStatus.textContent = message;
  }

  function hideRhythmGameLoading(message = i18nText("game.ready")) {
    if (rhythmGameLoading) rhythmGameLoading.hidden = true;
    if (rhythmGameStatus) rhythmGameStatus.textContent = message;
  }

  function clearRhythmGameLoadTimer() {
    if (!rhythmGameLoadTimer) return;
    window.clearTimeout(rhythmGameLoadTimer);
    rhythmGameLoadTimer = 0;
  }

  function startRhythmGameLoadTimer(stage = "ready_timeout") {
    clearRhythmGameLoadTimer();
    rhythmGameLoadTimer = window.setTimeout(() => {
      if (rhythmGameLayer?.hidden) return;
      const timedOut = stage === "ready_timeout"
        ? !rhythmGameFrameReady
        : rhythmGameFrameReady && rhythmGamePayloadPending;
      if (!timedOut) return;

      rhythmGamePayloadPending = false;
      const message = stage === "payload_timeout"
        ? i18nText("game.send_fail")
        : i18nText("game.load_fail");
      setRhythmGameLoading(message, "error");
    }, 10000);
  }

  function sendRhythmGamePayload() {
    if (!rhythmGameFrameReady || !rhythmGamePendingPayload || !rhythmGameFrame?.contentWindow) return;
    setRhythmGameLoading(i18nText("mml.send_inst"));
    rhythmGamePayloadPending = true;
    rhythmGameFrame.contentWindow.postMessage({
      type: "MML_RHYTHM_LOAD",
      payload: rhythmGamePendingPayload
    }, MOBIBEATS_TARGET_ORIGIN);
    startRhythmGameLoadTimer("payload_timeout");
  }

  function openRhythmGameLayer() {
    if (!rhythmGameLayer || !rhythmGameFrame) return;
    try {
      rhythmGamePendingPayload = buildRhythmGamePayload();
    } catch (err) {
      showToast([i18nText("game.open_fail"), shortError(err)].filter(Boolean).join(": "), "error");
      return;
    }

    const currentUrl = String(rhythmGameFrame.getAttribute("src") || "");

    stopPlayback(true);
    stopMidiPreview();
    rhythmGameLayer.hidden = false;
    rhythmGameLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("rhythm-game-open");
    setRhythmGameLoading(i18nText("game.loading"));

    if (!rhythmGameFrameReady || currentUrl === "about:blank") {
      rhythmGameFrameReady = false;
      rhythmGameFrame.src = MOBIBEATS_URL;
      startRhythmGameLoadTimer();
    } else {
      sendRhythmGamePayload();
    }
    requestAnimationFrame(() => rhythmGameClose?.focus());
  }

  function closeRhythmGameLayer() {
    if (!rhythmGameLayer || rhythmGameLayer.hidden) return;
    try { rhythmGameFrame?.contentWindow?.MobiBeats?.pause?.(); } catch (_) {}
    clearRhythmGameLoadTimer();
    rhythmGamePayloadPending = false;
    rhythmGamePendingPayload = null;
    rhythmGameLayer.hidden = true;
    rhythmGameLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("rhythm-game-open");
    if (rhythmGameStatus) rhythmGameStatus.textContent = i18nText("game.preparing");
    rhythmGameBtn?.focus();
  }

  function handleRhythmGameFrameLoad() {
    if (!rhythmGameFrame) return;
    const loadedUrl = String(rhythmGameFrame.getAttribute("src") || "");
    if (!loadedUrl || loadedUrl === "about:blank" || rhythmGameFrameReady) return;
    if (!rhythmGameLayer?.hidden) {
      setRhythmGameLoading(i18nText("game.wait_ready"));
      startRhythmGameLoadTimer();
    }
  }

  function isTrustedRhythmGameMessage(event) {
    if (!rhythmGameFrame?.contentWindow || event.source !== rhythmGameFrame.contentWindow) return false;
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
      if (!rhythmGameLayer?.hidden && rhythmGamePendingPayload) sendRhythmGamePayload();
      return;
    }

    if (data.type === "MML_RHYTHM_LOADED") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      hideRhythmGameLoading(i18nText("game.ready"));
      try { rhythmGameFrame.contentWindow.focus(); } catch (_) {}
      return;
    }

    if (data.type === "MML_RHYTHM_ERROR") {
      clearRhythmGameLoadTimer();
      rhythmGamePayloadPending = false;
      const message = String(data.message || data.payload?.message || i18nText("game.data_fail"));
      setRhythmGameLoading(message, "error");
      return;
    }

    if (data.type === "MML_RHYTHM_CLOSE") {
      closeRhythmGameLayer();
    }
  }

  function saveGoogleTokenCache(response = {}) {
    if (!googleAccessToken || !Number.isFinite(googleTokenExpiresAt) || Date.now() >= googleTokenExpiresAt - 30000) {
      clearGoogleTokenCache();
      return;
    }
    const payload = {
      accessToken: googleAccessToken,
      expiresAt: googleTokenExpiresAt,
      cachedAt: Date.now(),
      scope: String(response.scope || GOOGLE_DRIVE_SCOPE)
    };
    try {
      writeLocalPrefOnly(GOOGLE_TOKEN_CACHE_PREF, JSON.stringify(payload));
      scheduleGoogleTokenExpiryRefresh();
    } catch (_) {
      clearGoogleTokenCache();
    }
  }

  function restoreGoogleTokenCache() {
    if (isGoogleConnected()) return true;
    const raw = readPref(GOOGLE_TOKEN_CACHE_PREF);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      const token = String(data?.accessToken || data?.access_token || "");
      const expiresAt = Number(data?.expiresAt || data?.expires_at || 0);
      if (!token || !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 30000) {
        clearGoogleTokenCache();
        return false;
      }
      googleAccessToken = token;
      googleTokenExpiresAt = expiresAt;
      scheduleGoogleTokenExpiryRefresh();
      void loadGoogleUserProfile();
      return true;
    } catch (_) {
      clearGoogleTokenCache();
      return false;
    }
  }

  function clearGoogleTokenState(clearCache = false) {
    googleAccessToken = "";
    googleTokenExpiresAt = 0;
    clearGoogleTokenExpiryTimer();
    clearTimeout(googleSettingsSaveTimer);
    clearGoogleUserProfile();
    if (clearCache) clearGoogleTokenCache();
  }

  function resetGoogleSessionState(clearCache = false) {
    clearGoogleTokenState(clearCache);
    googleDriveMmlFileName = "";
    googleDriveMmlFolderId = "";
  }

  let lastGoogleToastMessage = "";
  let lastGoogleToastAt = 0;

  function clearGoogleUserProfile(refresh = true) {
    googleUserProfile = null;
    googleUserProfileToken = "";
    googleUserProfilePromise = null;
    if (refresh) updateAccountUi();
  }

  function updateAccountUi() {
    const connected = isGoogleConnected();
    const profile = connected && googleUserProfile ? googleUserProfile : {};
    const displayName = connected
      ? (String(profile.displayName || "").trim() || i18nText("account.user"))
      : i18nText("account.guest");
    const email = connected ? String(profile.emailAddress || "").trim() : "";
    const photo = connected ? String(profile.photoLink || "").trim() : "";

    if (accountMenuName) accountMenuName.textContent = displayName;
    if (accountMenuEmail) {
      accountMenuEmail.textContent = email;
      accountMenuEmail.hidden = !email;
    }
    if (accountAvatarImg) {
      const target = photo || GUEST_AVATAR_URL;
      if (accountAvatarImg.getAttribute("src") !== target) accountAvatarImg.src = target;
      accountAvatarImg.alt = "";
    }
    if (accountMenuButton) {
      accountMenuButton.dataset.connected = connected ? "true" : "false";
      accountMenuButton.setAttribute("aria-label", connected ? displayName : i18nText("account.menu"));
      accountMenuButton.title = connected ? displayName : i18nText("account.menu");
    }
  }

  async function loadGoogleUserProfile(force = false) {
    if (!isGoogleConnected()) {
      clearGoogleUserProfile();
      return null;
    }
    const token = googleAccessToken;
    if (!force && googleUserProfileToken === token && googleUserProfile) {
      updateAccountUi();
      return googleUserProfile;
    }
    if (!force && googleUserProfilePromise && googleUserProfileToken === token) {
      return googleUserProfilePromise;
    }

    googleUserProfileToken = token;
    googleUserProfilePromise = (async () => {
      try {
        const fields = encodeURIComponent("user(displayName,emailAddress,photoLink)");
        const response = await fetch(`${GOOGLE_DRIVE_API_BASE}/about?fields=${fields}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Google profile HTTP ${response.status}`);
        const data = await response.json();
        if (googleAccessToken !== token) return null;
        const user = data?.user || {};
        googleUserProfile = {
          displayName: String(user.displayName || ""),
          emailAddress: String(user.emailAddress || ""),
          photoLink: String(user.photoLink || "")
        };
      } catch (_) {
        if (googleAccessToken === token) googleUserProfile = {};
      } finally {
        if (googleAccessToken === token) updateAccountUi();
        if (googleUserProfileToken === token) googleUserProfilePromise = null;
      }
      return googleUserProfile;
    })();
    return googleUserProfilePromise;
  }

  function updateGoogleDriveControls(message = "") {
    const hasClient = Boolean(googleClientId());
    const hasPickerKey = Boolean(googleApiKey());
    const connected = isGoogleConnected();
    if (googleLoginBtn) {
      googleLoginBtn.disabled = !hasClient;
      const googleLoginLabel = googleLoginBtn.querySelector(".google-login-label");
      const labelText = i18nText(connected ? "auth.logout" : "auth.login");
      if (googleLoginLabel) {
        googleLoginLabel.textContent = labelText;
      } else {
        googleLoginBtn.textContent = labelText;
      }
      googleLoginBtn.setAttribute("aria-label", i18nText(connected ? "google.logout" : "google.login"));
      googleLoginBtn.title = hasClient
        ? i18nText(connected ? "google.logout_help" : "google.connect_help")
        : i18nText("msg.enter_oauth");
    }
    const googleDriveLoadTitle = !hasClient
      ? i18nText("msg.enter_oauth")
      : !connected
        ? i18nText("google.connect_help")
        : !hasPickerKey
          ? i18nText("drive.select_files")
          : i18nText("drive.select_gdocs");
    if (googleDriveLoadBtn) {
      googleDriveLoadBtn.disabled = false;
      googleDriveLoadBtn.title = googleDriveLoadTitle;
    }
    if (mmiImportGoogleDriveLoad) {
      mmiImportGoogleDriveLoad.disabled = false;
      mmiImportGoogleDriveLoad.title = googleDriveLoadTitle;
    }
    if (midiConvertGoogleDriveLoad) {
      midiConvertGoogleDriveLoad.disabled = Boolean(midiConvertBusy);
      midiConvertGoogleDriveLoad.title = midiConvertBusy ? i18nText("drive.fail_load") : googleDriveLoadTitle;
    }
    if (googleDriveSaveBtn) {
      googleDriveSaveBtn.disabled = false;
      googleDriveSaveBtn.title = !hasClient
        ? i18nText("msg.enter_oauth")
        : !connected
          ? i18nText("google.connect_help")
          : i18nText("drive.save_done_mml");
    }
    if (message) showToast(message, "info");
    updateAccountUi();
    if (connected && googleUserProfileToken !== googleAccessToken) void loadGoogleUserProfile();
  }

  function openCodeHelpDialog() {
    if (codeHelpDialog?.showModal) {
      codeHelpDialog.showModal();
    } else {
      showToast([i18nText("edit.help"), i18nText("err.code_help")].filter(Boolean).join(": "), "error");
    }
  }

  const googleExternalScriptPromises = new Map();

  function loadGoogleExternalScript(src) {
    const url = String(src || "");
    if (!url) return Promise.resolve();
    if (googleExternalScriptPromises.has(url)) return googleExternalScriptPromises.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Google API 로드 실패: ${url}`));
      document.head.appendChild(script);
    }).catch(error => {
      googleExternalScriptPromises.delete(url);
      throw error;
    });
    googleExternalScriptPromises.set(url, promise);
    return promise;
  }

  function waitForGoogleGlobal(test, label, timeoutMs = 10000) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (test()) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          window.clearInterval(timer);
          reject(new Error(i18nText("err.lib_load", [label])));
        }
      }, 80);
    });
  }

  async function ensureGoogleIdentityLoaded() {
    if (!window.google?.accounts?.oauth2) {
      await loadGoogleExternalScript("https://accounts.google.com/gsi/client");
    }
    await waitForGoogleGlobal(() => Boolean(window.google?.accounts?.oauth2), i18nText("google.login_title"));
  }

  async function ensureGooglePickerLoaded() {
    if (!window.gapi?.load) {
      await loadGoogleExternalScript("https://apis.google.com/js/api.js");
    }
    await waitForGoogleGlobal(() => Boolean(window.gapi?.load), "Google Picker");
    if (googlePickerLoaded && window.google?.picker) return;
    await new Promise((resolve, reject) => {
      try {
        window.gapi.load("picker", {
          callback: () => { googlePickerLoaded = true; resolve(); },
          onerror: () => reject(new Error(i18nText("google.picker_fail"))),
          timeout: 10000,
          ontimeout: () => reject(new Error(i18nText("google.picker_timeout")))
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function googleLoginRequiredError() {
    return new Error(i18nText("google.session_expired"));
  }

  function requireGoogleAccessToken() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    clearGoogleTokenState(true);
    updateGoogleDriveControls(i18nText("ui.login_required"));
    throw googleLoginRequiredError();
  }

  async function requestGoogleAccessTokenInteractive() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    const clientId = googleClientId();
    if (!clientId) throw new Error(i18nText("google.client_id_missing"));
    await ensureGoogleIdentityLoaded();
    return new Promise((resolve, reject) => {
      try {
        if (!googleTokenClient) {
          googleTokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_DRIVE_SCOPE,
            include_granted_scopes: true,
            callback: () => {}
          });
        }
        googleTokenClient.callback = (response) => {
          if (!response || response.error) {
            reject(new Error(response?.error_description || response?.error || i18nText("google.login_fail")));
            return;
          }
          googleAccessToken = String(response.access_token || "");
          const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
          googleTokenExpiresAt = Date.now() + expiresIn * 1000;
              setGoogleAutoReconnect(true);
          saveGoogleTokenCache(response);
          void loadGoogleUserProfile(true);
          updateGoogleDriveControls();
          resolve(googleAccessToken);
        };
        googleTokenClient.requestAccessToken({ prompt: "select_account" });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function ensureGoogleSessionForDriveAction() {
    if (isGoogleConnected() || restoreGoogleTokenCache()) return googleAccessToken;
    updateGoogleDriveControls(i18nText("google.login_wait"));
    await requestGoogleAccessTokenInteractive();
    setGoogleAutoReconnect(true);
    const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
    updateGoogleDriveControls(appliedDriveSettings ? i18nText("google.cfg_applied") : i18nText("cfg.local"));
    return googleAccessToken;
  }

  function scheduleGoogleAutoReconnect() {
    if (!shouldGoogleAutoReconnect() || !googleClientId()) return;
    if (restoreGoogleTokenCache()) {
      updateGoogleDriveControls(i18nText("google.restored"));
      window.setTimeout(() => void applyGoogleSettingsAfterSessionRestore(i18nText("google.restored")), 100);
      return;
    }
    updateGoogleDriveControls(i18nText("ui.login_required"));
  }

  async function applyGoogleSettingsAfterSessionRestore(fallbackMessage = i18nText("google.restored")) {
    if (!isGoogleConnected()) return;
    const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
    updateGoogleDriveControls(appliedDriveSettings ? i18nText("google.cfg_applied") : fallbackMessage);
  }

  async function handleGoogleLoginButton() {
    if (isGoogleConnected()) {
      setGoogleAutoReconnect(false);
      resetGoogleSessionState(true);
      updateGoogleDriveControls();
      showToast(i18nText("google.logout_done"), "info");
      return;
    }
    try {
      updateGoogleDriveControls();
      showToast(i18nText("google.login_wait"), "info");
      await requestGoogleAccessTokenInteractive();
      setGoogleAutoReconnect(true);
      const appliedDriveSettings = await loadGoogleSettingsOrFallbackLocal();
      updateGoogleDriveControls();
      showToast(appliedDriveSettings ? i18nText("google.cfg_applied") : i18nText("google.connected"), "success");
    } catch (err) {
      resetGoogleSessionState(true);
      updateGoogleDriveControls();
      showToast(`${i18nText("google.login_fail_short")}: ${shortError(err)}`, "error");
    }
  }

  function driveQueryString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function appendGoogleDriveParams(url, params = {}) {
    const query = Object.entries(params)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    if (!query) return url;
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
  }

  function googleDriveSupportsAllDrivesParams(extra = {}) {
    return { supportsAllDrives: "true", ...extra };
  }

  function googleDriveListParams(extra = {}) {
    return { supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...extra };
  }

  function isGoogleDriveNotFoundError(err) {
    return /(?:^|\b)(?:404|notFound|File not found)(?:\b|:)/i.test(String(err?.message || err || ""));
  }

  function clearRememberedGoogleDriveSaveFolder() {
    googleDriveSaveFolderId = "";
    googleDriveSaveFolderName = "";
    removeLocalPrefOnly("googleDriveSaveFolderId");
    removeLocalPrefOnly("googleDriveSaveFolderName");
    scheduleGoogleSettingsSave();
  }

  function isGoogleDriveNativeEditorMime(mimeType = "") {
    const type = String(mimeType || "").toLowerCase();
    return type.startsWith("application/vnd.google-apps.")
      && type !== GOOGLE_DRIVE_FOLDER_MIME
      && type !== GOOGLE_DRIVE_SHORTCUT_MIME;
  }

  function isGoogleDocsDocumentMime(mimeType = "") {
    return String(mimeType || "").toLowerCase() === GOOGLE_DOCS_DOCUMENT_MIME;
  }

  async function googleDriveFetch(url, options = {}, retry = true) {
    const token = requireGoogleAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      clearGoogleTokenState(true);
        updateGoogleDriveControls(i18nText("ui.login_required"));
      throw googleLoginRequiredError();
    }
    return response;
  }

  async function googleDriveJson(url, options = {}) {
    const response = await googleDriveFetch(url, options);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.json();
  }

  async function googleDriveErrorMessage(response) {
    try {
      const data = await response.json();
      return data?.error?.message || `${response.status} ${response.statusText}`;
    } catch (_) {
      try { return await response.text() || `${response.status} ${response.statusText}`; }
      catch (__) { return `${response.status} ${response.statusText}`; }
    }
  }

  function createMultipartBody(metadata, content, contentType) {
    const boundary = `mobibard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  async function uploadGoogleDriveTextFile({ fileId = "", name, text, parents = null, mimeType = "text/plain" }) {
    const metadata = { name, mimeType };
    if (parents && !fileId) metadata.parents = parents;
    const multipart = createMultipartBody(metadata, text, `${mimeType}; charset=UTF-8`);
    const encodedId = encodeURIComponent(fileId);
    const baseUrl = fileId
      ? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${encodedId}`
      : `${GOOGLE_DRIVE_UPLOAD_BASE}/files`;
    const url = appendGoogleDriveParams(baseUrl, googleDriveSupportsAllDrivesParams({
      uploadType: "multipart",
      fields: "id,name,modifiedTime,webViewLink,parents"
    }));
    const method = fileId ? "PATCH" : "POST";
    return googleDriveJson(url, {
      method,
      headers: { "Content-Type": multipart.contentType },
      body: multipart.body
    });
  }

  async function uploadGoogleDriveBinaryFile({ fileId = "", name, bytes, parents = null, mimeType = GOOGLE_SOUND_BANK_MIME }) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const metadata = { name, mimeType };
    if (parents && !fileId) metadata.parents = parents;
    const encodedId = encodeURIComponent(fileId);
    const baseUrl = fileId
      ? `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${encodedId}`
      : `${GOOGLE_DRIVE_UPLOAD_BASE}/files`;
    const initUrl = appendGoogleDriveParams(baseUrl, googleDriveSupportsAllDrivesParams({
      uploadType: "resumable",
      fields: "id,name,modifiedTime,size,mimeType,parents"
    }));
    const method = fileId ? "PATCH" : "POST";
    const initResponse = await googleDriveFetch(initUrl, {
      method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(view.byteLength)
      },
      body: JSON.stringify(metadata)
    });
    if (!initResponse.ok) throw new Error(await googleDriveErrorMessage(initResponse));
    const sessionUrl = initResponse.headers.get("Location");
    if (!sessionUrl) throw new Error("Google Drive did not return an upload session URL.");
    const uploadResponse = await googleDriveFetch(sessionUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: new Blob([view], { type: mimeType })
    });
    if (!uploadResponse.ok) throw new Error(await googleDriveErrorMessage(uploadResponse));
    return uploadResponse.json();
  }

  async function findGoogleSoundBankCacheFile() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_SOUND_BANK_FILE_NAME)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,size,mimeType)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function downloadGoogleDriveBinary(fileId) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(url);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return new Uint8Array(await response.arrayBuffer());
  }

  async function deleteGoogleDriveFile(fileId) {
    if (!fileId) return false;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams());
    const response = await googleDriveFetch(url, { method: "DELETE" });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return true;
  }

  async function findGoogleMmlFolder() {
    const q = `name = '${driveQueryString(GOOGLE_MML_FOLDER_NAME)}' and mimeType = '${GOOGLE_DRIVE_FOLDER_MIME}' and trashed = false`;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveListParams({
      spaces: "drive",
      corpora: "allDrives",
      pageSize: "1",
      q,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,capabilities,driveId)"
    }));
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function createGoogleMmlFolder() {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveSupportsAllDrivesParams({
      fields: "id,name,mimeType,modifiedTime,webViewLink,capabilities,driveId"
    }));
    return googleDriveJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: GOOGLE_MML_FOLDER_NAME,
        mimeType: GOOGLE_DRIVE_FOLDER_MIME,
        parents: ["root"]
      })
    });
  }

  async function ensureGoogleMmlFolder() {
    if (googleDriveMmlFolderId) {
      try {
        const cached = await validateGoogleDriveFolder(googleDriveMmlFolderId, { requireWritable: true });
        googleDriveMmlFolderId = cached.id;
        return googleDriveMmlFolderId;
      } catch (err) {
        if (!isGoogleDriveNotFoundError(err)) throw err;
        googleDriveMmlFolderId = "";
      }
    }
    const existing = await findGoogleMmlFolder();
    if (existing?.id) {
      try {
        const folder = await validateGoogleDriveFolder(existing.id, { requireWritable: true });
        googleDriveMmlFolderId = folder.id || existing.id;
        return googleDriveMmlFolderId;
      } catch (_) {
        googleDriveMmlFolderId = "";
      }
    }
    const created = await createGoogleMmlFolder();
    if (!created?.id) throw new Error(i18nText("drive.folder_create_fail", [GOOGLE_MML_FOLDER_NAME]));
    googleDriveMmlFolderId = created.id;
    return googleDriveMmlFolderId;
  }

  function loadGoogleDriveFolderPrefs() {
    googleDriveSaveFolderId = String(readPref("googleDriveSaveFolderId") || "").trim();
    googleDriveSaveFolderName = String(readPref("googleDriveSaveFolderName") || "").trim();
  }

  function rememberGoogleDriveSaveFolder(id, name) {
    googleDriveSaveFolderId = String(id || "").trim();
    googleDriveSaveFolderName = String(name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (googleDriveSaveFolderId) writePref("googleDriveSaveFolderId", googleDriveSaveFolderId);
    if (googleDriveSaveFolderName) writePref("googleDriveSaveFolderName", googleDriveSaveFolderName);
  }

  async function validateGoogleDriveFolder(folderId, { requireWritable = false } = {}) {
    const id = String(folderId || "").trim();
    if (!id) throw new Error(i18nText("drive.folder_required"));
    const meta = await getGoogleDriveFileMeta(id, "id,name,mimeType,trashed,capabilities,driveId,shortcutDetails");
    let folder = meta;
    if (folder?.mimeType === GOOGLE_DRIVE_SHORTCUT_MIME && folder.shortcutDetails?.targetId) {
      folder = await getGoogleDriveFileMeta(folder.shortcutDetails.targetId, "id,name,mimeType,trashed,capabilities,driveId");
    }
    if (!folder?.id) throw new Error(i18nText("drive.folder_not_found"));
    if (folder.trashed) throw new Error(i18nText("drive.folder_trashed", [folder.name || i18nText("drive.selected_dir")]));
    if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) throw new Error(i18nText("drive.not_folder"));
    if (requireWritable && folder.capabilities && folder.capabilities.canAddChildren === false) {
      throw new Error(i18nText("drive.folder_no_permission", [folder.name || i18nText("drive.selected_dir")]));
    }
    return {
      id: folder.id,
      name: folder.name || GOOGLE_MML_FOLDER_NAME,
      driveId: folder.driveId || "",
      capabilities: folder.capabilities || null
    };
  }

  async function resolveGoogleDriveSaveFolder(folderId, folderName) {
    try {
      const folder = await validateGoogleDriveFolder(folderId, { requireWritable: true });
      rememberGoogleDriveSaveFolder(folder.id, folder.name || folderName || GOOGLE_MML_FOLDER_NAME);
      return folder;
    } catch (err) {
      if (!isGoogleDriveNotFoundError(err)) throw err;
      clearRememberedGoogleDriveSaveFolder();
      googleDriveMmlFolderId = "";
      const fallbackId = await ensureGoogleMmlFolder();
      const fallback = await validateGoogleDriveFolder(fallbackId, { requireWritable: true });
      rememberGoogleDriveSaveFolder(fallback.id, fallback.name || GOOGLE_MML_FOLDER_NAME);
      return fallback;
    }
  }

  async function pickGoogleDriveSaveFolder() {
    requireGoogleAccessToken();
    if (!googleApiKey()) throw new Error(i18nText("google.api_key_missing"));
    showToast(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]), "info");
    const defaultFolderId = await ensureGoogleMmlFolder();
    await ensureGooglePickerLoaded();

    return new Promise((resolve, reject) => {
      try {
        const picker = window.google?.picker;
        if (!picker) throw new Error(i18nText("google.picker_load_fail"));
        const viewId = picker.ViewId.FOLDERS || picker.ViewId.DOCS;
        const view = new picker.DocsView(viewId);
        try { view.setIncludeFolders(true); } catch (_) {}
        try { view.setSelectFolderEnabled(true); } catch (_) {}
        try { view.setMimeTypes(GOOGLE_DRIVE_FOLDER_MIME); } catch (_) {}
        try { if (defaultFolderId && typeof view.setParent === "function") view.setParent(defaultFolderId); } catch (_) {}

        const folderHint = googleDriveSaveFolderName
          ? i18nText("drive.current_selection", [googleDriveSaveFolderName])
          : i18nText("drive.default_folder", [GOOGLE_MML_FOLDER_NAME]);
        const builder = new picker.PickerBuilder()
          .setDeveloperKey(googleApiKey())
          .setOAuthToken(googleAccessToken)
          .setTitle(i18nText("drive.select_location_title", [folderHint]))
          .addView(view)
          .setCallback((data) => {
            const action = data?.[picker.Response.ACTION];
            if (action === picker.Action.CANCEL) {
              stopGooglePickerLayerWatch();
              resolve(null);
              return;
            }
            if (action !== picker.Action.PICKED) {
              forceGooglePickerLayer();
              return;
            }
            stopGooglePickerLayerWatch();
            const doc = data[picker.Response.DOCUMENTS]?.[0];
            const id = doc?.[picker.Document.ID] || "";
            const name = doc?.[picker.Document.NAME] || i18nText("drive.selected_dir");
            const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
            if (!id) {
              resolve(null);
              return;
            }
            if (mimeType && mimeType !== GOOGLE_DRIVE_FOLDER_MIME) {
              showToast([i18nText("drive.save_loc"), i18nText("drive.select_folder_only")].filter(Boolean).join(": "), "info");
              resolve(null);
              return;
            }
            resolve({ id, name });
          });
        const appId = googleAppId();
        if (appId) builder.setAppId(appId);
        builder.build().setVisible(true);
        startGooglePickerLayerWatch();
        requestAnimationFrame(() => {
          forceGooglePickerLayer();
          window.setTimeout(forceGooglePickerLayer, 80);
          window.setTimeout(forceGooglePickerLayer, 240);
        });
      } catch (err) {
        stopGooglePickerLayerWatch();
        reject(err);
      }
    });
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function buildGoogleDriveDefaultMmlFileName() {
    const d = new Date();
    const stamp = [
      pad2(d.getFullYear() % 100),
      pad2(d.getMonth() + 1),
      pad2(d.getDate()),
      pad2(d.getHours()),
      pad2(d.getMinutes()),
      pad2(d.getSeconds())
    ].join("");
    return `mml_${stamp}.txt`;
  }

  function sourceNameToTxtFileName(name) {
    const cleaned = String(name == null ? "" : name)
      .replace(/\.[^.\\/]*$/, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned ? `${cleaned}.txt` : "";
  }

  function rememberSuggestedMmlSaveFileName(name) {
    const suggested = sourceNameToTxtFileName(name);
    suggestedMmlSaveFileName = suggested ? normalizeGoogleDriveTxtFileName(suggested) : "";
  }

  function clearSuggestedMmlSaveFileName() {
    suggestedMmlSaveFileName = "";
  }

  function defaultMmlSaveFileName() {
    return suggestedMmlSaveFileName || buildGoogleDriveDefaultMmlFileName();
  }

  function defaultGoogleDriveSaveFileName() {
    return defaultMmlSaveFileName();
  }

  function defaultLocalSaveFileName() {
    return defaultMmlSaveFileName();
  }

  function normalizeGoogleDriveTxtFileName(name) {
    const text = String(name == null ? "" : name).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
    const base = text || buildGoogleDriveDefaultMmlFileName();
    return /\.txt$/i.test(base) ? base : `${base}.txt`;
  }

  async function findGoogleDriveTextFileInFolder(folderId, name) {
    if (!folderId || !name) return null;
    const q = `'${driveQueryString(folderId)}' in parents and name = '${driveQueryString(name)}' and trashed = false`;
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files`, googleDriveListParams({
      spaces: "drive",
      corpora: "allDrives",
      pageSize: "10",
      q,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents,driveId)"
    }));
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  function openGoogleDriveSaveDialog({ defaultFolderId, defaultFolderName, defaultFileName, onCommit = null }) {
    const initialFolder = {
      id: defaultFolderId || googleDriveSaveFolderId || googleDriveMmlFolderId,
      name: defaultFolderName || googleDriveSaveFolderName || GOOGLE_MML_FOLDER_NAME
    };
    const initialName = normalizeGoogleDriveTxtFileName(defaultFileName || buildGoogleDriveDefaultMmlFileName());

    if (!googleDriveSaveDialog?.showModal || !googleDriveSaveFileName) {
      return inlinePrompt(
        i18nText("drive.save_name_prompt", [initialFolder.name]),
        initialName,
        { title: i18nText("drive.save"), confirmText: i18nText("ui.save") }
      ).then((entered) => entered == null ? null : ({
        folderId: initialFolder.id,
        folderName: initialFolder.name,
        fileName: normalizeGoogleDriveTxtFileName(entered)
      }));
    }

    let selectedFolder = { ...initialFolder };
    let settled = false;
    let pauseCloseResolve = false;
    let saving = false;

    const updateFolderLabel = () => {
      if (googleDriveSaveFolderNameText) googleDriveSaveFolderNameText.textContent = selectedFolder.name || GOOGLE_MML_FOLDER_NAME;
    };
    const focusFileName = () => {
      requestAnimationFrame(() => {
        try {
          googleDriveSaveFileName.focus();
          const dot = googleDriveSaveFileName.value.toLowerCase().lastIndexOf(".txt");
          googleDriveSaveFileName.setSelectionRange(0, dot > 0 ? dot : googleDriveSaveFileName.value.length);
        } catch (_) {}
      });
    };
    const reopenSaveDialog = () => {
      if (settled || googleDriveSaveDialog.open) return;
      try {
        googleDriveSaveDialog.showModal();
        focusFileName();
      } catch (_) {}
    };
    const setSaveBusy = (busy, message = "") => {
      saving = busy;
      if (googleDriveSaveApply) {
        googleDriveSaveApply.disabled = busy;
        googleDriveSaveApply.textContent = busy ? i18nText("st.saving") : i18nText("ui.save");
      }
      if (googleDriveSaveCancel) googleDriveSaveCancel.disabled = busy;
      if (googleDriveSaveFolderBtn) googleDriveSaveFolderBtn.disabled = busy;
      if (googleDriveSaveFileName) googleDriveSaveFileName.disabled = busy;
      if (googleDriveSaveStatus) googleDriveSaveStatus.textContent = message || "";
    };

    return new Promise((resolve) => {
      const cleanup = () => {
        googleDriveSaveCancel?.removeEventListener("click", onCancel);
        googleDriveSaveApply?.removeEventListener("click", onSave);
        googleDriveSaveFolderBtn?.removeEventListener("click", onPickFolder);
        googleDriveSaveDialog.removeEventListener("cancel", onCancelEvent);
        googleDriveSaveDialog.removeEventListener("close", onClose);
        setSaveBusy(false);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const closeDialog = () => {
        try { googleDriveSaveDialog.close(); } catch (_) {}
      };
      const onCancel = () => {
        if (saving) return;
        finish(null);
        closeDialog();
      };
      const onCancelEvent = (event) => {
        event.preventDefault();
        onCancel();
      };
      const onClose = () => {
        if (pauseCloseResolve) return;
        if (!settled) finish(null);
      };
      const onSave = async () => {
        if (saving) return;
        const fileName = normalizeGoogleDriveTxtFileName(googleDriveSaveFileName.value);
        googleDriveSaveFileName.value = fileName;
        setSaveBusy(true, i18nText("drive.duplicate_check"));
        try {
          const preparedFolder = await resolveGoogleDriveSaveFolder(
            selectedFolder.id || googleDriveMmlFolderId || await ensureGoogleMmlFolder(),
            selectedFolder.name || GOOGLE_MML_FOLDER_NAME
          );
          const folderId = preparedFolder.id;
          const folderName = preparedFolder.name || selectedFolder.name || GOOGLE_MML_FOLDER_NAME;
          selectedFolder = { id: folderId, name: folderName };
          updateFolderLabel();
          const existing = await findGoogleDriveTextFileInFolder(folderId, fileName);
          if (existing?.id) {
            const overwrite = await inlineConfirm(
              i18nText("drive.file_exists_confirm", [folderName, fileName]),
              { title: i18nText("drive.save"), confirmText: i18nText("ui.save") }
            );
            if (!overwrite) {
              setSaveBusy(false);
              focusFileName();
              return;
            }
          }
          const target = {
            folderId,
            folderName,
            fileName,
            overwriteFileId: existing?.id || ""
          };
          if (typeof onCommit === "function") {
            setSaveBusy(true, i18nText("drive.saving_wait"));
            const result = await onCommit(target);
            const savedName = result?.fileName || result?.name || fileName;
            const action = result?.createsNewFile === false ? i18nText("drive.overwritten") : i18nText("drive.saved");
            showToast([i18nText("drive.save_done"), i18nText("drive.save_result", [folderName, savedName, action])].filter(Boolean).join(": "), "info");
            finish(result || target);
            closeDialog();
            return;
          }
          finish(target);
          closeDialog();
        } catch (err) {
          setSaveBusy(false);
          showToast([i18nText("drive.save_fail"), shortError(err)].filter(Boolean).join(": "), "error");
          reopenSaveDialog();
        }
      };
      const onPickFolder = async () => {
        if (saving) return;
        const savedName = googleDriveSaveFileName.value;
        pauseCloseResolve = true;
        closeDialog();
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        try {
          const picked = await pickGoogleDriveSaveFolder();
          if (picked) {
            selectedFolder = { id: picked.id, name: picked.name || i18nText("drive.selected_dir") };
            rememberGoogleDriveSaveFolder(selectedFolder.id, selectedFolder.name);
          }
        } catch (err) {
          showToast([i18nText("drive.folder_select_fail"), shortError(err)].filter(Boolean).join(": "), "error");
        } finally {
          googleDriveSaveFileName.value = savedName;
          updateFolderLabel();
          pauseCloseResolve = false;
          reopenSaveDialog();
        }
      };

      updateFolderLabel();
      googleDriveSaveFileName.value = initialName;
      googleDriveSaveCancel?.addEventListener("click", onCancel);
      googleDriveSaveApply?.addEventListener("click", onSave);
      googleDriveSaveFolderBtn?.addEventListener("click", onPickFolder);
      googleDriveSaveDialog.addEventListener("cancel", onCancelEvent);
      googleDriveSaveDialog.addEventListener("close", onClose);
      googleDriveSaveDialog.showModal();
      focusFileName();
    });
  }

  function soundBankSelectionTime(meta) {
    const time = Date.parse(String(meta?.updatedAt || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function normalizeGoogleSoundBankMeta(value) {
    const normalized = normalizeSoundBankSelectionMeta(value);
    if (!normalized) return null;
    return {
      ...normalized,
      fileId: normalized.mode === "custom" ? String(value?.fileId || "").trim().slice(0, 200) : ""
    };
  }

  function buildGoogleSoundBankSettingsMeta() {
    const local = readSoundBankSelectionMeta() || newDefaultSoundBankSelectionMeta("");
    return {
      ...local,
      fileId: local.mode === "custom" ? String(googleSoundBankFileId || "") : ""
    };
  }

  async function uploadSoundBankBytesToGoogle(bytes) {
    if (!googleSoundBankFileId) {
      const existing = await findGoogleSoundBankCacheFile();
      googleSoundBankFileId = existing?.id || "";
    }
    let saved;
    try {
      saved = await uploadGoogleDriveBinaryFile({
        fileId: googleSoundBankFileId,
        name: GOOGLE_SOUND_BANK_FILE_NAME,
        bytes,
        parents: googleSoundBankFileId ? null : ["appDataFolder"],
        mimeType: GOOGLE_SOUND_BANK_MIME
      });
    } catch (err) {
      if (!googleSoundBankFileId || !isGoogleDriveNotFoundError(err)) throw err;
      googleSoundBankFileId = "";
      saved = await uploadGoogleDriveBinaryFile({
        fileId: "",
        name: GOOGLE_SOUND_BANK_FILE_NAME,
        bytes,
        parents: ["appDataFolder"],
        mimeType: GOOGLE_SOUND_BANK_MIME
      });
    }
    googleSoundBankFileId = saved?.id || googleSoundBankFileId;
    return saved;
  }

  async function removeGoogleSoundBankCacheFile(fileId = "") {
    let targetId = String(fileId || googleSoundBankFileId || "").trim();
    if (!targetId) {
      try { targetId = String((await findGoogleSoundBankCacheFile())?.id || ""); } catch (_) {}
    }
    if (targetId) {
      try { await deleteGoogleDriveFile(targetId); }
      catch (err) { if (!isGoogleDriveNotFoundError(err)) throw err; }
    }
    googleSoundBankFileId = "";
  }

  function queueGoogleSoundBankSync(task) {
    const run = googleSoundBankSyncQueue
      .catch(() => false)
      .then(() => task());
    googleSoundBankSyncQueue = run;
    return run;
  }

  async function syncManualSoundBankSelectionToGoogle(bytes) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
        await uploadSoundBankBytesToGoogle(bytes);
        await saveGoogleSettingsNow(true);
        return true;
      } catch (err) {
        console.warn("[Mobibard] Failed to cache sound bank in Google Drive.", err);
        return false;
      }
    });
  }

  async function syncDefaultSoundBankSelectionToGoogle(meta) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
        await removeGoogleSoundBankCacheFile();
        if (meta) writeSoundBankSelectionMeta(meta);
        await saveGoogleSettingsNow(true);
        return true;
      } catch (err) {
        console.warn("[Mobibard] Failed to clear Google sound-bank cache.", err);
        return false;
      }
    });
  }

  async function applyGoogleCustomSoundBank(bytes, cloudMeta) {
    const meta = normalizeGoogleSoundBankMeta(cloudMeta);
    if (!meta || meta.mode !== "custom") throw new Error("Invalid Google sound-bank metadata.");
    if (meta.size > 0 && bytes.byteLength !== meta.size) {
      throw new Error(`Cached sound-bank size mismatch (${bytes.byteLength}/${meta.size}).`);
    }
    if (meta.sha256) {
      const actual = await sha256Hex(bytes);
      if (actual && actual !== meta.sha256) throw new Error("Cached sound-bank SHA-256 mismatch.");
    }
    const parsed = await parseSoundBank(bytes);
    stopPlayback(false);
    stopMidiPreview();
    soundFont = parsed;
    soundFontIsDefault = false;
    sf2Name = meta.name || "SoundBank";
    const api = soundBankCacheApi();
    if (api?.putActive) {
      try {
        await api.putActive({
          bytes,
          name: sf2Name,
          mimeType: meta.mimeType || GOOGLE_SOUND_BANK_MIME,
          extension: meta.extension || soundBankExtension(sf2Name),
          sha256: meta.sha256,
          updatedAt: meta.updatedAt
        });
      } catch (err) {
        console.warn("[Mobibard] Local sound-bank cache write failed after Google restore.", err);
      }
    }
    writeSoundBankSelectionMeta(meta);
    updateSoundFontUi();
    if (partSoundDialog?.open) {
      draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
      renderPartSoundRows();
      updateSoundPresetControls();
    }
  }

  async function syncSoundBankSelectionWithGoogle(cloudValue) {
    if (!isGoogleConnected()) return false;
    return queueGoogleSoundBankSync(async () => {
      try {
      const cloud = normalizeGoogleSoundBankMeta(cloudValue);
      if (cloud?.fileId) googleSoundBankFileId = cloud.fileId;
      const local = readSoundBankSelectionMeta();
      let cached = null;
      if (local?.mode === "custom") {
        try { cached = await soundBankCacheApi()?.getActive?.(); } catch (_) {}
      }
      const localTime = soundBankSelectionTime(local);
      const cloudTime = soundBankSelectionTime(cloud);

      if (!cloud) {
        if (local?.mode === "custom" && cached?.bytes?.byteLength) {
          await uploadSoundBankBytesToGoogle(cached.bytes);
        } else {
          googleSoundBankFileId = "";
          if (!local) writeSoundBankSelectionMeta(newDefaultSoundBankSelectionMeta(new Date().toISOString()));
        }
        return true;
      }

      if (cloud.mode === "default" && (cloudTime > localTime || !local)) {
        await removeGoogleSoundBankCacheFile();
        await restoreDefaultSoundFont({
          silent: true,
          syncGoogle: false,
          persistSelection: true,
          updatedAt: cloud.updatedAt || new Date().toISOString()
        });
        return false;
      }

      if (local?.mode === "default" && cloud.mode === "custom" && localTime >= cloudTime) {
        await removeGoogleSoundBankCacheFile(cloud.fileId);
        return true;
      }

      if (cloud.mode === "custom" && (
        cloudTime > localTime
        || !local
        || (local.mode === "custom" && !cached?.bytes?.byteLength)
        || (local.mode !== "custom" && cloudTime >= localTime)
      )) {
        if (!cloud.fileId) throw new Error("Google sound-bank cache metadata has no file ID.");
        const bytes = await downloadGoogleDriveBinary(cloud.fileId);
        await applyGoogleCustomSoundBank(bytes, cloud);
        return false;
      }

      if (local?.mode === "custom" && cached?.bytes?.byteLength && (localTime > cloudTime || cloud.mode !== "custom" || !cloud.fileId)) {
        await uploadSoundBankBytesToGoogle(cached.bytes);
        return true;
      }

      return false;
      } catch (err) {
        console.warn("[Mobibard] Failed to synchronize sound-bank cache with Google Drive.", err);
        return false;
      }
    });
  }

  function captureLocalPrefSnapshot() {
    const prefs = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREF_PREFIX)) continue;
        const name = key.slice(PREF_PREFIX.length);
        if (GOOGLE_LOCAL_ONLY_PREFS.has(name)) continue;
        const value = localStorage.getItem(key);
        if (name && value != null && value.length < 250000) prefs[name] = value;
      }
    } catch (_) {}
    return prefs;
  }

  function parseGoogleSettings(text) {
    const data = JSON.parse(String(text || ""));
    const prefs = data?.prefs;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
      throw new Error(i18nText("google.settings_invalid"));
    }
    const normalized = {};
    for (const [key, value] of Object.entries(prefs)) {
      const name = String(key || "").trim();
      if (!name || GOOGLE_LOCAL_ONLY_PREFS.has(name) || name.includes(".") || name.length > 80) continue;
      if (value == null) continue;
      if (["string", "number", "boolean"].includes(typeof value)) normalized[name] = String(value);
    }
    return {
      prefs: normalized,
      soundBank: normalizeGoogleSoundBankMeta(data?.soundBank)
    };
  }

  function buildGoogleSettingsPayload() {
    return JSON.stringify({
      app: GOOGLE_SETTINGS_APP_NAME,
      version: 2,
      savedAt: new Date().toISOString(),
      prefs: captureLocalPrefSnapshot(),
      soundBank: buildGoogleSoundBankSettingsMeta()
    }, null, 2);
  }

  async function findGoogleSettingsFile() {
    const q = encodeURIComponent(`name = '${driveQueryString(GOOGLE_SETTINGS_FILE_NAME)}' and trashed = false`);
    const url = `${GOOGLE_DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=1&q=${q}&fields=files(id,name,modifiedTime,size)`;
    const data = await googleDriveJson(url);
    return Array.isArray(data.files) && data.files.length ? data.files[0] : null;
  }

  async function downloadGoogleDriveText(fileId) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(url);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.text();
  }

  async function exportGoogleDriveText(fileId, exportMimeType = GOOGLE_DRIVE_TEXT_EXPORT_MIME) {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export`, {
      mimeType: exportMimeType
    });
    const response = await googleDriveFetch(url);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    return response.text();
  }

  function applyPrefSnapshot(prefs) {
    googleSettingsApplying = true;
    try {
      for (const [name, value] of Object.entries(prefs || {})) {
        try { localStorage.setItem(PREF_PREFIX + name, String(value)); }
        catch (_) {}
      }
      reloadPreferencesFromStorage();
    } finally {
      googleSettingsApplying = false;
    }
  }

  function reloadPreferencesFromStorage() {
    partPresetKeys = defaultPartPresetKeys();
    midiPartPresetKeys = null;
    midiPartPresetName = defaultMidiSoundPresetLabel();
    userSoundPresets = [];
    partMuteStates = Array.from({ length: 6 }, () => false);
    loadThemePref();
    loadPlaybackPrefs();
    loadPianoRollPrefs();
    loadPartSoundPrefs();
    loadMidiPartSoundPresetPrefs();
    loadUserSoundPresetPrefs();
    loadPartMutePrefs();
    loadGoogleDriveFolderPrefs();
    void window.MobibardI18n?.syncFromPreference({ source: "settings" });
    applyPlaybackSpeed(false);
    applyOutputVolume();
    updateSoundPresetControls();
    updatePartMuteControl();
    applyPartMuteAudioGains();
    updateCharCount();
    rebuildSchedulePreviewSilently();
  }

  async function loadGoogleSettingsOrFallbackLocal() {
    if (!isGoogleConnected()) return false;
    try {
      showToast(i18nText("google.settings_check"), "info");
      const file = await findGoogleSettingsFile();
      if (!file?.id) {
        googleSettingsFileId = "";
        showToast(i18nText("google.settings_create"), "info");
        await syncSoundBankSelectionWithGoogle(null);
        await saveGoogleSettingsNow(true);
        showToast(i18nText("google.local_settings"), "info");
        return false;
      }
      googleSettingsFileId = file.id;
      const text = await downloadGoogleDriveText(file.id);
      const settings = parseGoogleSettings(text);
      applyPrefSnapshot(settings.prefs);
      const soundBankChangedCloud = await syncSoundBankSelectionWithGoogle(settings.soundBank);
      if (soundBankChangedCloud) await saveGoogleSettingsNow(true);
      showToast(i18nText("google.settings_applied"), "info");
      return true;
    } catch (err) {
      showToast(i18nText("google.settings_fallback"), "info");
      try { await saveGoogleSettingsNow(true); } catch (_) {}
      return false;
    }
  }

  function scheduleGoogleSettingsSave(delay = 1600) {
    if (googleSettingsApplying || !isGoogleConnected()) return;
    clearTimeout(googleSettingsSaveTimer);
    googleSettingsSaveTimer = window.setTimeout(() => void saveGoogleSettingsNow(true), delay);
  }

  async function saveGoogleSettingsNow(silent = false) {
    if (!isGoogleConnected()) return false;
    if (googleSettingsSaving) {
      clearTimeout(googleSettingsSaveTimer);
      googleSettingsSaveTimer = window.setTimeout(() => void saveGoogleSettingsNow(true), 1200);
      return false;
    }
    googleSettingsSaving = true;
    try {
      if (!googleSettingsFileId) {
        const existing = await findGoogleSettingsFile();
        googleSettingsFileId = existing?.id || "";
      }
      const payload = buildGoogleSettingsPayload();
      let saved;
      try {
        saved = await uploadGoogleDriveTextFile({
          fileId: googleSettingsFileId,
          name: GOOGLE_SETTINGS_FILE_NAME,
          text: payload,
          parents: googleSettingsFileId ? null : ["appDataFolder"],
          mimeType: "application/json"
        });
      } catch (err) {
        if (!googleSettingsFileId || !isGoogleDriveNotFoundError(err)) throw err;
        googleSettingsFileId = "";
        saved = await uploadGoogleDriveTextFile({
          fileId: "",
          name: GOOGLE_SETTINGS_FILE_NAME,
          text: payload,
          parents: ["appDataFolder"],
          mimeType: "application/json"
        });
      }
      googleSettingsFileId = saved?.id || googleSettingsFileId;
      if (!silent) showToast(i18nText("google.settings_saved"), "info");
      return true;
    } catch (err) {
      if (!silent) showToast([i18nText("google.settings_save_fail"), shortError(err)].filter(Boolean).join(": "), "error");
      else showToast(i18nText("google.settings_save_fail"), "info");
      return false;
    } finally {
      googleSettingsSaving = false;
    }
  }

  function forceGooglePickerLayer() {
    const pickerLayerZ = 2147483001;
    const pickerBackdropZ = 2147483000;
    const selectors = [
      ".picker-dialog-bg",
      ".picker-dialog",
      "iframe[src*=\"picker\"]",
      "iframe[src*=\"docs.google.com/picker\"]",
      "iframe[src*=\"apis.google.com/picker\"]"
    ];
    const nodes = new Set();
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach((node) => nodes.add(node));
      } catch (_) {}
    }
    for (const node of nodes) {
      try {
        const isBackdrop = node.classList?.contains("picker-dialog-bg");
        const z = isBackdrop ? pickerBackdropZ : pickerLayerZ;
        node.style.setProperty("z-index", String(z), "important");
        // Keep the Picker's own size and placement intact.
        // Changing iframe/dialog position here can make Google Picker expand incorrectly on some browsers.
        const parent = node.parentElement;
        if (parent && parent !== document.body) {
          parent.style.setProperty("z-index", String(z), "important");
        }
      } catch (_) {}
    }
  }

  function startGooglePickerLayerWatch() {
    stopGooglePickerLayerWatch();
    forceGooglePickerLayer();
    googlePickerLayerWatchTimer = window.setInterval(forceGooglePickerLayer, 120);
    try {
      googlePickerLayerObserver = new MutationObserver(() => forceGooglePickerLayer());
      googlePickerLayerObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    } catch (_) {
      googlePickerLayerObserver = null;
    }
    // Picker가 비정상 종료되더라도 보정 루프가 남지 않도록 안전 타임아웃을 둔다.
    window.setTimeout(() => stopGooglePickerLayerWatch(), 60_000);
  }

  function stopGooglePickerLayerWatch() {
    if (googlePickerLayerWatchTimer) {
      clearInterval(googlePickerLayerWatchTimer);
      googlePickerLayerWatchTimer = 0;
    }
    if (googlePickerLayerObserver) {
      try { googlePickerLayerObserver.disconnect(); } catch (_) {}
      googlePickerLayerObserver = null;
    }
  }

  function suspendPopupPanelsForGooglePicker() {
    const suspended = [];
    const suspend = (dialog, type) => {
      if (!dialog?.open) return;
      googlePickerSuspendedCloseDialogs.add(dialog);
      try {
        dialog.close("google-picker");
        suspended.push(type);
      } catch (_) {
        googlePickerSuspendedCloseDialogs.delete(dialog);
      }
    };

    // Google Picker는 일반 document 레이어에 붙기 때문에, showModal()로 열린
    // 앱 내부 팝업은 브라우저 top-layer 특성상 z-index만으로 Picker보다 뒤로
    // 보낼 수 없다. Picker를 열 때 변환/가져오기 팝업을 잠깐 닫고, 취소 시 복구한다.
    suspend(midiConvertDialog, "midi");
    suspend(mmiImportDialog, "mmi");
    return suspended;
  }

  function restorePopupPanelsAfterGooglePicker(suspended) {
    if (!Array.isArray(suspended) || !suspended.length) return;
    for (const type of suspended) {
      try {
        if (type === "midi" && pendingMidiImport && pendingMidiSettings && midiConvertDialog?.showModal && !midiConvertDialog.open) {
          midiConvertDialog.showModal();
          scheduleMidiInstrumentListHeightSync();
        } else if (type === "mmi" && pendingMmiImport && mmiImportDialog?.showModal && !mmiImportDialog.open) {
          mmiImportDialog.showModal();
        }
      } catch (_) {}
    }
  }

  function discardPopupPanelsAfterGooglePicker(suspended) {
    if (!Array.isArray(suspended) || !suspended.length) return;
    stopMidiPreview();
    if (suspended.includes("midi")) {
      pendingMidiImport = null;
      pendingMidiSettings = null;
      pendingMidiStartsNewSource = false;
      setMidiConvertBusy(false);
    }
    if (suspended.includes("mmi")) {
      resolveMmiImportDialog(null);
    }
  }

  async function openGoogleDrivePicker() {
    let suspendedPanels = null;
    try {
      await ensureGoogleSessionForDriveAction();
      if (!googleApiKey()) throw new Error(i18nText("google.api_key_missing"));
      showToast(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]), "info");
      const folderId = await ensureGoogleMmlFolder();
      await ensureGooglePickerLoaded();
      suspendedPanels = suspendPopupPanelsForGooglePicker();
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      // Drive에 업로드된 음악 파일은 서비스/브라우저에 따라 MIME 타입이
      // application/octet-stream 등으로 달라질 수 있다. Picker에서 MIME 타입을
      // 강하게 제한하지 않고 넓게 보여준 뒤, 선택 후 공통 포맷 등록소와
      // MML/MMI/TXT 검사로 실제 지원 파일만 처리한다.
      try { if (folderId && typeof view.setParent === "function") view.setParent(folderId); } catch (_) {}
      const builder = new window.google.picker.PickerBuilder()
        .setDeveloperKey(googleApiKey())
        .setOAuthToken(googleAccessToken)
        .setTitle(i18nText("drive.select_files_title", [GOOGLE_MML_FOLDER_NAME]))
        .addView(view)
        .setCallback((data) => void handleGooglePickerResult(data, suspendedPanels));
      const appId = googleAppId();
      if (appId) builder.setAppId(appId);
      builder.build().setVisible(true);
      startGooglePickerLayerWatch();
      requestAnimationFrame(() => {
        forceGooglePickerLayer();
        window.setTimeout(forceGooglePickerLayer, 80);
        window.setTimeout(forceGooglePickerLayer, 240);
      });
      showToast(i18nText("google.connected"), "info");
    } catch (err) {
      stopGooglePickerLayerWatch();
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      showToast([i18nText("drive.load_fail"), shortError(err)].filter(Boolean).join(": "), "error");
      updateGoogleDriveControls();
    }
  }

  async function handleGooglePickerResult(data, suspendedPanels = null) {
    const picker = window.google?.picker;
    const action = data?.[picker?.Response?.ACTION];
    if (!picker) {
      return;
    }
    if (action === picker.Action.CANCEL) {
      stopGooglePickerLayerWatch();
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    if (action !== picker.Action.PICKED) {
      // Google Picker는 열리는 과정에서 LOADED 같은 중간 이벤트를 보낼 수 있다.
      // 이때 변환/가져오기 dialog를 복구하면 Picker가 다시 뒤로 밀리므로 무시한다.
      forceGooglePickerLayer();
      return;
    }
    stopGooglePickerLayerWatch();
    const doc = data[picker.Response.DOCUMENTS]?.[0];
    const fileId = doc?.[picker.Document.ID];
    const name = doc?.[picker.Document.NAME] || i18nText("drive.file");
    const mimeType = doc?.[picker.Document.MIME_TYPE] || "";
    if (!fileId) {
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    if (mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
      showToast([i18nText("drive.load"), i18nText("drive.select_mml")].filter(Boolean).join(": "), "info");
      restorePopupPanelsAfterGooglePicker(suspendedPanels);
      return;
    }
    discardPopupPanelsAfterGooglePicker(suspendedPanels);
    try {
      await loadGoogleDriveSourceFile(fileId, name);
    } catch (err) {
      showToast([i18nText("drive.load_fail"), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  async function getGoogleDriveFileMeta(fileId, fields = "id,name,mimeType,size,modifiedTime,webViewLink,parents,driveId,shortcutDetails") {
    const url = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, googleDriveSupportsAllDrivesParams({ fields }));
    return googleDriveJson(url);
  }

  async function resolveGoogleDriveShortcutMeta(meta) {
    if (meta?.mimeType !== GOOGLE_DRIVE_SHORTCUT_MIME || !meta.shortcutDetails?.targetId) return meta;
    return getGoogleDriveFileMeta(meta.shortcutDetails.targetId);
  }

  function isGoogleDriveTextMmlFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "txt") return true;
    if (["mmi", "mml"].includes(ext) || window.MabiMusicFormats?.isSupported(name, mimeType)) return false;
    return String(mimeType || "").toLowerCase() === "text/plain";
  }

  function isGoogleDriveMabiIccoFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "mmi") return true;
    const type = String(mimeType || "").toLowerCase();
    return type === "application/x-mabiicco" || type === "application/vnd.mabiicco";
  }

  function isGoogleDriveThreeMleFile(name, mimeType = "") {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "mml") return true;
    const type = String(mimeType || "").toLowerCase();
    return type === "application/x-3mle" || type === "application/vnd.3mle";
  }

  async function buildPluginMidiImport(bytes, name = "Music", mimeType = "") {
    if (!window.MabiMusicFormats?.convertBytes) {
      throw new Error("음악 포맷 플러그인을 불러오지 못했습니다.");
    }
    await ensureMusicFormatRuntime(name, mimeType, bytes);
    const converted = await window.MabiMusicFormats.convertBytes(bytes, name, mimeType);
    const midiBytes = converted.midiBytes;
    const overview = analyzeMidi(midiBytes, name);
    return {
      bytes: midiBytes,
      name,
      overview,
      sourceType: converted.sourceType,
      sourceLabel: converted.sourceLabel,
      cacheFingerprint: buildSourceFileFingerprint(converted.sourceType, bytes)
    };
  }

  function getMidiImportSourceLabel(importData = pendingMidiImport) {
    if (importData?.sourceLabel) return String(importData.sourceLabel);
    const sourceType = String(importData?.sourceType || "");
    const plugin = window.MabiMusicFormats?.listFormats?.().find(format => format.id === sourceType);
    return plugin?.label || "MIDI";
  }

  async function loadGoogleDriveSourceFile(fileId, fallbackName = i18nText("drive.file")) {
    requireGoogleAccessToken();
    closeImportDialogsForSourceReload();
    stopMidiPreview();
    stopPlayback(false);
    const pickedMeta = await getGoogleDriveFileMeta(fileId);
    const meta = await resolveGoogleDriveShortcutMeta(pickedMeta);
    const sourceFileId = meta?.id || fileId;
    const name = meta?.name || pickedMeta?.name || fallbackName;
    const mimeType = meta?.mimeType || pickedMeta?.mimeType || "";
    if (isGoogleDocsDocumentMime(mimeType)) {
      const loaded = readMmlTextFile(await exportGoogleDriveText(sourceFileId, GOOGLE_DRIVE_TEXT_EXPORT_MIME));
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_gdocs", [shortError(optErr)])].filter(Boolean).join(": "), "info");
      }
      notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "gdocs", sourceLabel: "Google Docs", newSource: true });
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      showToast(i18nText("drive.gdocs_loaded"), "info");
      return;
    }
    if (isGoogleDriveNativeEditorMime(mimeType)) {
      throw new Error(i18nText("file.gdocs_documents"));
    }
    const mediaUrl = appendGoogleDriveParams(`${GOOGLE_DRIVE_API_BASE}/files/${encodeURIComponent(sourceFileId)}`, googleDriveSupportsAllDrivesParams({ alt: "media" }));
    const response = await googleDriveFetch(mediaUrl);
    if (!response.ok) throw new Error(await googleDriveErrorMessage(response));
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (window.MabiMusicFormats?.isSupported(name, mimeType)) {
      const importData = await buildPluginMidiImport(bytes, name, mimeType);
      googleDriveMmlFileName = "";
      openMidiConvertDialog(importData);
      showToast(i18nText("drive.midi_loaded"), "info");
      return;
    }
    if (isGoogleDriveMabiIccoFile(name, mimeType)) {
      const loaded = await readMabiIccoMmiFile(bytes, name);
      if (!loaded) return;
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_mmi", [shortError(optErr)])].filter(Boolean).join(": "), "info");
      }
      notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "mmi", sourceLabel: "MabiIcco", newSource: true });
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      showToast(i18nText("drive.mmi_loaded"), "info");
      return;
    }
    if (isGoogleDriveThreeMleFile(name, mimeType)) {
      const loaded = await readThreeMleMmlFile(bytes, name);
      if (!loaded) return;
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_3mle", [shortError(optErr)])].filter(Boolean).join(": "), "info");
      }
      notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "mml", sourceLabel: "3MLE", newSource: true });
        googleDriveMmlFileName = "";
      rememberSuggestedMmlSaveFileName(name);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      showToast(i18nText("drive.mle3_loaded"), "info");
      return;
    }
    if (isGoogleDriveTextMmlFile(name, mimeType)) {
      const loaded = readMmlTextFile(decodeTextFileBytes(bytes));
      try {
        const normalized = normalizeImportedFullMml(loaded);
        setMainMml(normalized.mml);
      } catch (optErr) {
        setMainMml(loaded);
        showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_drive_file", [shortError(optErr)])].filter(Boolean).join(": "), "info");
      }
      notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "txt", sourceLabel: "MML", newSource: true });
      googleDriveMmlFileName = name;
      rememberSuggestedMmlSaveFileName(name);
      showLoadedChannelCount(googleDriveLoadBtn, i18nText("drive.loaded"), mainMml.value);
      if (Array.isArray(meta?.parents) && meta.parents[0]) {
        rememberGoogleDriveSaveFolder(meta.parents[0], GOOGLE_MML_FOLDER_NAME);
      }
      showToast(i18nText("drive.txt_loaded"), "info");
      return;
    }
    throw new Error(i18nText("drive.unsupported_file"));
  }

  async function saveMmlToGoogleDrive() {
    try {
      await ensureGoogleSessionForDriveAction();
      showToast(i18nText("drive.folder_checking", [GOOGLE_MML_FOLDER_NAME]), "info");
      const defaultFolderId = await ensureGoogleMmlFolder();
      let exportData;
      try {
        exportData = getFullMmlForExport();
      } catch (err) {
        showToast([i18nText("drive.save_fail"), i18nText("mml.optimize_error_detail", [shortError(err)])].filter(Boolean).join(": "), "error");
        return;
      }
      const text = exportData.text;
      if (!text.trim()) {
        showToast([i18nText("drive.save_fail"), i18nText("mml.empty")].filter(Boolean).join(": "), "error");
        return;
      }
      const defaultFolderName = googleDriveSaveFolderName || GOOGLE_MML_FOLDER_NAME;
      const defaultFileName = googleDriveMmlFileName || defaultGoogleDriveSaveFileName();
      const result = await openGoogleDriveSaveDialog({
        defaultFolderId: googleDriveSaveFolderId || defaultFolderId,
        defaultFolderName,
        defaultFileName,
        onCommit: async (target) => {
          const folderId = target.folderId || defaultFolderId;
          const folderName = target.folderName || GOOGLE_MML_FOLDER_NAME;
          const fileName = normalizeGoogleDriveTxtFileName(target.fileName);
          rememberGoogleDriveSaveFolder(folderId, folderName);

          let targetId = target.overwriteFileId || "";
          let createsNewFile = !targetId;
          showToast(i18nText("drive.saving"), "info");
          let saved;
          try {
            saved = await uploadGoogleDriveTextFile({
              fileId: targetId,
              name: fileName,
              text: text + "\n",
              parents: createsNewFile ? [folderId] : null,
              mimeType: "text/plain"
            });
          } catch (err) {
            if (!targetId || !isGoogleDriveNotFoundError(err)) throw err;
            targetId = "";
            createsNewFile = true;
            saved = await uploadGoogleDriveTextFile({
              fileId: "",
              name: fileName,
              text: text + "\n",
              parents: [folderId],
              mimeType: "text/plain"
            });
          }
          googleDriveMmlFileName = saved?.name || fileName;
          rememberSuggestedMmlSaveFileName(googleDriveMmlFileName);
          return {
            saved,
            folderId,
            folderName,
            fileName: googleDriveMmlFileName,
            createsNewFile
          };
        }
      });
      if (!result) {
        showToast(i18nText("drive.save_cancel"), "info");
        return;
      }
      flashButton(googleDriveSaveBtn, i18nText("drive.save_done"));
      showToast(i18nText("drive.save_done"), "info");
    } catch (err) {
      showToast([i18nText("drive.save_fail"), shortError(err)].filter(Boolean).join(": "), "error");
      updateGoogleDriveControls();
    }
  }

  function hasMidiPartSoundPreset() {
    return Array.isArray(midiPartPresetKeys) && midiPartPresetKeys.length >= 6;
  }

  function getAutoPartPresetKeys() {
    return hasMidiPartSoundPreset() ? normalizePresetKeyArray(midiPartPresetKeys) : defaultPartPresetKeys();
  }

  function sanitizeUserSoundPresetName(name, fallback = i18nText("snd.preset")) {
    const text = String(name == null ? "" : name).replace(/\s+/g, " ").trim();
    return (text || fallback).slice(0, 40);
  }

  function createUserSoundPresetId() {
    const random = Math.random().toString(36).slice(2, 7);
    return `p${Date.now().toString(36)}${random}`;
  }

  function normalizeUserSoundPreset(raw, index = 0, usedIds = new Set()) {
    if (!raw || typeof raw !== "object") return null;
    let id = String(raw.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!id || usedIds.has(id)) id = createUserSoundPresetId();
    usedIds.add(id);
    const name = sanitizeUserSoundPresetName(raw.name, i18nText("snd.preset_default_name", [index + 1]));
    const keys = normalizePresetKeyArray(raw.keys);
    return { id, name, keys };
  }

  function loadUserSoundPresetPrefs() {
    const saved = readPref("userSoundPresets");
    if (!saved) return;
    try {
      const arr = JSON.parse(saved);
      if (!Array.isArray(arr)) return;
      const usedIds = new Set();
      userSoundPresets = arr
        .map((item, index) => normalizeUserSoundPreset(item, index, usedIds))
        .filter(Boolean)
        .slice(0, 80);
    } catch (_) {
      userSoundPresets = [];
    }
  }

  function saveUserSoundPresetPrefs() {
    const usedIds = new Set();
    userSoundPresets = (Array.isArray(userSoundPresets) ? userSoundPresets : [])
      .map((item, index) => normalizeUserSoundPreset(item, index, usedIds))
      .filter(Boolean)
      .slice(0, 80);
    writePref("userSoundPresets", JSON.stringify(userSoundPresets));
  }

  function userSoundPresetValue(id) {
    return `${USER_SOUND_PRESET_VALUE_PREFIX}${id}`;
  }

  function userSoundPresetIdFromValue(value) {
    const text = String(value || "");
    return text.startsWith(USER_SOUND_PRESET_VALUE_PREFIX) ? text.slice(USER_SOUND_PRESET_VALUE_PREFIX.length) : "";
  }

  function findUserSoundPreset(id) {
    return userSoundPresets.find(p => p.id === id) || null;
  }

  function findUserSoundPresetIdByKeys(keys) {
    const normalized = normalizePresetKeyArray(keys);
    const matched = userSoundPresets.find(p => samePresetKeys(normalized, p.keys));
    return matched?.id || "";
  }

  function soundPresetMatch(keys) {
    const normalized = normalizePresetKeyArray(keys);
    if (samePresetKeys(normalized, getAutoPartPresetKeys())) return "auto";
    const matched = userSoundPresets.find(p => samePresetKeys(normalized, p.keys));
    return matched ? userSoundPresetValue(matched.id) : "current";
  }

  function renderSoundPresetSelect(select, keys, preferredValue = null) {
    if (!select) return;
    const match = soundPresetMatch(keys);
    const currentValue = preferredValue || match;
    select.innerHTML = "";

    select.appendChild(new Option(i18nText("snd.auto"), "auto"));

    if (userSoundPresets.length) {
      const group = document.createElement("optgroup");
      group.label = i18nText("snd.saved");
      for (const preset of userSoundPresets) {
        group.appendChild(new Option(preset.name, userSoundPresetValue(preset.id)));
      }
      select.appendChild(group);
    }

    const hasPreferred = Array.from(select.options).some(option => option.value === currentValue);
    if (hasPreferred) {
      select.value = currentValue;
    } else if (match === "current") {
      const current = new Option(i18nText("cfg.current"), "current");
      current.disabled = true;
      current.selected = true;
      select.insertBefore(current, select.children[1] || null);
    } else {
      select.value = match;
    }
  }

  function updateSoundPresetControls(preferredDialogValue = null) {
    renderSoundPresetSelect(partSoundPresetSelect, draftPartPresetKeys || partPresetKeys, preferredDialogValue);
    updatePartSoundPresetDeleteState();
  }

  function updatePartSoundPresetDeleteState() {
    const id = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const preset = id ? findUserSoundPreset(id) : null;
    const canManage = Boolean(preset);
    if (partSoundPresetDelete) {
      partSoundPresetDelete.disabled = !canManage;
      partSoundPresetDelete.title = canManage ? i18nText("snd.delete_saved") : i18nText("snd.delete_select");
    }
  }

  function getPartPresetKeysForMode(mode) {
    if (mode === "auto") return getAutoPartPresetKeys();
    const id = userSoundPresetIdFromValue(mode);
    const preset = id ? findUserSoundPreset(id) : null;
    return preset ? normalizePresetKeyArray(preset.keys) : null;
  }

  function applyPartSoundPresetToDraft(mode) {
    const keys = getPartPresetKeysForMode(mode);
    if (!keys) {
      updateSoundPresetControls();
      return;
    }
    draftSoundPresetBaseId = userSoundPresetIdFromValue(mode);
    draftPartPresetKeys = normalizePresetKeyArray(keys);
    renderPartSoundRows();
    updateSoundPresetControls(mode);
  }

  async function saveDraftSoundPreset() {
    if (!Array.isArray(draftPartPresetKeys)) draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
    const keys = normalizePresetKeyArray(draftPartPresetKeys);
    const selectedId = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const baseId = selectedId || draftSoundPresetBaseId;
    const basePreset = baseId ? findUserSoundPreset(baseId) : null;
    let target = null;
    let message = "";

    if (basePreset) {
      if (samePresetKeys(keys, basePreset.keys)) {
        showToast([i18nText("snd.preset_save"), i18nText("snd.no_settings")].filter(Boolean).join(": "), "info");
        updatePartSoundPresetDeleteState();
        return;
      }
      const overwrite = await inlineConfirm(
        i18nText("snd.preset_overwrite_confirm", [basePreset.name]),
        { title: i18nText("snd.preset_save") }
      );
      if (overwrite) {
        basePreset.keys = keys;
        target = basePreset;
        message = i18nText("snd.preset_overwritten", [target.name]);
      } else {
        target = await createSoundPresetFromPrompt(keys, i18nText("snd.preset_copy_name", [basePreset.name]));
        if (!target) return;
        message = i18nText("snd.preset_saved_new", [target.name]);
      }
    } else {
      target = await createSoundPresetFromPrompt(keys, i18nText("snd.preset_default_name", [userSoundPresets.length + 1]));
      if (!target) return;
      message = i18nText("snd.preset_saved_named", [target.name]);
    }

    saveUserSoundPresetPrefs();
    draftPartPresetKeys = keys;
    draftSoundPresetBaseId = target.id;
    updateSoundPresetControls(userSoundPresetValue(target.id));
    showToast([i18nText("snd.preset_saved"), message].filter(Boolean).join(": "), "info");
  }

  async function createSoundPresetFromPrompt(keys, defaultName, excludeId = "") {
    const input = await inlinePrompt(
      i18nText("snd.name_required"),
      defaultName,
      { title: i18nText("snd.preset_save") }
    );
    if (input == null) return null;
    const name = sanitizeUserSoundPresetName(input, "");
    if (!name) {
      showToast([i18nText("snd.save_preset"), i18nText("snd.enter_preset")].filter(Boolean).join(": "), "info");
      return null;
    }

    let target = userSoundPresets.find(p => p.name === name && p.id !== excludeId) || null;
    if (target) {
      if (!(await inlineConfirm(
        i18nText("snd.preset_exists_confirm", [name]),
        { title: i18nText("snd.preset_save") }
      ))) return null;
      target.keys = keys;
      return target;
    }

    target = { id: createUserSoundPresetId(), name, keys };
    userSoundPresets.push(target);
    return target;
  }

  async function deleteSelectedSoundPreset() {
    const id = userSoundPresetIdFromValue(partSoundPresetSelect?.value);
    const preset = id ? findUserSoundPreset(id) : null;
    if (!preset) {
      showToast([i18nText("snd.delete_preset"), i18nText("snd.select_saved")].filter(Boolean).join(": "), "info");
      updatePartSoundPresetDeleteState();
      return;
    }
    if (!(await inlineConfirm(
      i18nText("snd.preset_delete_confirm", [preset.name]),
      { title: i18nText("snd.delete_preset") }
    ))) return;
    userSoundPresets = userSoundPresets.filter(p => p.id !== id);
    saveUserSoundPresetPrefs();
    updateSoundPresetControls();
    showToast([i18nText("snd.preset_deleted"), i18nText("snd.preset_deleted_named", [preset.name])].filter(Boolean).join(": "), "info");
  }

  function updatePartMuteControl() {
    for (const button of playbackChannelButtons) {
      const index = clampInt(Number(button.dataset.playbackChannelIndex), 0, 5);
      const audible = !partMuteStates[index];
      button.classList.toggle("active", audible);
      button.classList.toggle("muted", !audible);
      button.setAttribute("aria-pressed", audible ? "true" : "false");
      button.title = `${PART_LABELS[index]} · ${audible ? i18nText("player.play") : i18nText("snd.mute")}`;
    }
    for (let i = 0; i < 6; i++) {
      const tab = tabs.find(t => t.dataset.tab === `part${i}`);
      if (tab) tab.classList.toggle("muted", Boolean(partMuteStates[i]));
    }
  }

  function invalidatePartMuteVisualState() {
    pianoRollVisibleCacheSignature = "";
    pianoRollLastDataSignature = "";
    activePlaybackScanBucket = -1;
    activePlaybackScanSignature = "";
  }


  function applyPartMuteAudioGains({ instant = false } = {}) {
    if (!audioCtx || audioCtx.state === "closed" || partPlaybackGains.length !== 6) return;
    const now = audioCtx.currentTime;
    const fadeSec = 0.012;
    for (let part = 0; part < 6; part++) {
      const gainNode = partPlaybackGains[part];
      const param = gainNode?.gain;
      if (!param) continue;
      const target = partMuteStates[part] ? 0 : 1;
      try {
        if (instant) {
          param.cancelScheduledValues(now);
          param.setValueAtTime(target, now);
          continue;
        }
        if (typeof param.cancelAndHoldAtTime === "function") {
          param.cancelAndHoldAtTime(now);
        } else {
          const current = Number.isFinite(param.value) ? param.value : (target ? 0 : 1);
          param.cancelScheduledValues(now);
          param.setValueAtTime(current, now);
        }
        param.linearRampToValueAtTime(target, now + fadeSec);
      } catch {
        try { param.value = target; } catch {}
      }
    }
  }

  function applyPartMuteStates(nextStates) {
    const playbackOffset = isPlaying ? getCurrentPlaybackOffset() : currentOffset;

    partMuteStates = Array.from({ length: 6 }, (_, i) => Boolean(nextStates?.[i]));
    savePartMutePrefs();
    applyPartMuteAudioGains();

    updatePartMuteControl();
    invalidatePartMuteVisualState();
    requestTimelineActivityRefresh(true);
    updatePlaybackCodeHighlight(playbackOffset);
    updatePianoRoll(playbackOffset, scheduleCache?.duration || Number(progressSlider?.max) || 0, true);
  }


  function restartPlaybackAfterSoundChange() {
    if (!isPlaying) return;
    currentOffset = getCurrentPlaybackOffset();
    stopPlayback(false);
    void playFromCurrent();
  }

  function setSoundFontControlsBusy(busy) {
    if (soundFontLoadBtn) soundFontLoadBtn.disabled = Boolean(busy);
    if (soundFontResetBtn) soundFontResetBtn.disabled = Boolean(busy);
  }

  function soundBankCacheApi() {
    return window.MobibardSoundBankCache || null;
  }

  function soundBankExtension(name = "") {
    const match = String(name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function normalizeSoundBankSelectionMeta(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const mode = value.mode === "custom" ? "custom" : (value.mode === "default" ? "default" : "");
    if (!mode) return null;
    const updatedAt = String(value.updatedAt || "");
    if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) return null;
    const normalized = {
      version: 1,
      mode,
      updatedAt,
      name: String(value.name || "").slice(0, 255),
      extension: String(value.extension || "").replace(/^\./, "").toLowerCase().slice(0, 12),
      mimeType: String(value.mimeType || GOOGLE_SOUND_BANK_MIME).slice(0, 120),
      size: Math.max(0, Number(value.size) || 0),
      sha256: String(value.sha256 || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64)
    };
    return normalized;
  }

  function readSoundBankSelectionMeta() {
    return normalizeSoundBankSelectionMeta(readLocalJsonPref(SOUND_BANK_SELECTION_PREF));
  }

  function writeSoundBankSelectionMeta(meta) {
    const normalized = normalizeSoundBankSelectionMeta(meta);
    if (!normalized) return false;
    return writeLocalJsonPref(SOUND_BANK_SELECTION_PREF, normalized);
  }

  function newDefaultSoundBankSelectionMeta(updatedAt) {
    const resolvedUpdatedAt = updatedAt === undefined ? new Date().toISOString() : String(updatedAt || "");
    return {
      version: 1,
      mode: "default",
      updatedAt: resolvedUpdatedAt,
      name: "",
      extension: "",
      mimeType: GOOGLE_SOUND_BANK_MIME,
      size: 0,
      sha256: ""
    };
  }

  async function sha256Hex(bytes) {
    try {
      if (!window.crypto?.subtle) return "";
      const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
      const digest = await window.crypto.subtle.digest("SHA-256", view);
      return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return "";
    }
  }

  async function persistManualSoundBankCache(bytes, file) {
    const api = soundBankCacheApi();
    const updatedAt = new Date().toISOString();
    const name = String(file?.name || sf2Name || "SoundBank");
    const extension = soundBankExtension(name);
    const mimeType = String(file?.type || GOOGLE_SOUND_BANK_MIME);
    const sha256 = await sha256Hex(bytes);
    const meta = normalizeSoundBankSelectionMeta({
      version: 1,
      mode: "custom",
      updatedAt,
      name,
      extension,
      mimeType,
      size: bytes.byteLength,
      sha256
    });
    if (api?.putActive) {
      try {
        await api.putActive({
          bytes,
          name: meta.name,
          mimeType: meta.mimeType,
          extension: meta.extension,
          sha256: meta.sha256,
          updatedAt: meta.updatedAt
        });
      } catch (err) {
        console.warn("[Mobibard] Local sound-bank cache write failed.", err);
      }
    }
    writeSoundBankSelectionMeta(meta);
    return meta;
  }

  async function restoreCachedSoundBankFromLocal() {
    const meta = readSoundBankSelectionMeta();
    if (!meta || meta.mode !== "custom") {
      soundFontIsDefault = true;
      sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
      return false;
    }
    const api = soundBankCacheApi();
    if (!api?.getActive) return false;
    try {
      const cached = await api.getActive();
      if (!cached?.bytes?.byteLength) return false;
      if (meta.size > 0 && cached.bytes.byteLength !== meta.size) return false;
      if (meta.sha256 && cached.sha256 && meta.sha256 !== String(cached.sha256).toLowerCase()) return false;
      const parsed = await parseSoundBank(cached.bytes);
      soundFont = parsed;
      soundFontIsDefault = false;
      sf2Name = meta.name || cached.name || "SoundBank";
      return true;
    } catch (err) {
      console.warn("[Mobibard] Failed to restore cached sound bank.", err);
      return false;
    }
  }

  async function clearLocalSoundBankCache(updatedAt = new Date().toISOString()) {
    try { await soundBankCacheApi()?.clearActive?.(); } catch (err) {
      console.warn("[Mobibard] Failed to clear cached sound bank.", err);
    }
    const meta = newDefaultSoundBankSelectionMeta(updatedAt);
    writeSoundBankSelectionMeta(meta);
    return meta;
  }

  function updateSoundFontUi(message = "") {
    if (!soundName) return;
    if (message) {
      soundName.textContent = message;
      return;
    }
    soundName.textContent = soundFontIsDefault
      ? i18nText("snd.restore_default")
      : (sf2Name || "SoundBank");
  }

  function openSf2Picker() {
    if (!sf2File) return;
    sf2File.value = "";
    openFilePickerInput(sf2File);
  }

  async function restoreDefaultSoundFont(options = {}) {
    const silent = Boolean(options?.silent);
    const syncGoogle = options?.syncGoogle !== false;
    const persistSelection = options?.persistSelection !== false;
    const selectionUpdatedAt = String(options?.updatedAt || new Date().toISOString());
    stopPlayback(false);
    stopMidiPreview();
    setSoundFontControlsBusy(true);
    soundFont = null;
    soundFontIsDefault = true;
    sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
    if (sf2File) sf2File.value = "";
    updateSoundFontUi(i18nText("snd.reading_soundbank"));
    let selectionMeta = null;
    try {
      if (persistSelection) selectionMeta = await clearLocalSoundBankCache(selectionUpdatedAt);
      await loadDefaultSf2IfNeeded();
      updateSoundFontUi();
      if (partSoundDialog?.open) {
        draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
        renderPartSoundRows();
        updateSoundPresetControls();
      }
      if (syncGoogle && isGoogleConnected()) {
        void syncDefaultSoundBankSelectionToGoogle(selectionMeta || newDefaultSoundBankSelectionMeta(selectionUpdatedAt));
      }
    } catch (err) {
      updateSoundFontUi();
      if (!silent) showToast([i18nText("snd.load_soundbank"), shortError(err)].filter(Boolean).join(": "), "error");
    } finally {
      setSoundFontControlsBusy(false);
    }
  }

  function openSourceFilePicker() {
    if (!midiFile) return;
    midiFile.value = "";
    openFilePickerInput(midiFile);
  }

  function closeImportDialogsForSourceReload() {
    stopMidiPreview();
    setPlayerUiOriginalMidiImport(null);
    if (midiConvertDialog?.open) {
      try { midiConvertDialog.close("reload"); } catch (_) {}
      pendingMidiImport = null;
      pendingMidiSettings = null;
      setMidiConvertBusy(false);
    }
    if (mmiImportDialog?.open) {
      try { mmiImportDialog.close("reload"); } catch (_) {}
    }
  }

  async function loadSourceFile() {
    const file = midiFile.files?.[0];
    if (!file) return;
    await loadLocalSourceFile(file);
  }

  async function loadLocalSourceFile(file) {
    if (!file) return;
    const name = file.name || i18nText("file.selected");
    const ext = getSourceFileExtension(name);
    googleDriveMmlFileName = "";
    clearSuggestedMmlSaveFileName();
    closeImportDialogsForSourceReload();
    try {
      stopMidiPreview();
      stopPlayback(false);
      if (window.MabiMusicFormats?.isSupported(name, file.type || "")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const importData = await buildPluginMidiImport(bytes, name, file.type || "");
        openMidiConvertDialog(importData);
      } else if (ext === "mmi") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await readMabiIccoMmiFile(bytes, name);
        if (!loaded) return;
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_mmi", [shortError(optErr)])].filter(Boolean).join(": "), "info");
        }
        notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "mmi", sourceLabel: "MabiIcco", newSource: true });
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
      } else if (ext === "mml") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await readThreeMleMmlFile(bytes, name);
        if (!loaded) return;
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_3mle", [shortError(optErr)])].filter(Boolean).join(": "), "info");
        }
        notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "mml", sourceLabel: "3MLE", newSource: true });
        rememberSuggestedMmlSaveFileName(name);
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
      } else if (ext === "txt") {
        const text = await file.text();
        const loaded = readMmlTextFile(text);
        try {
          const normalized = normalizeImportedFullMml(loaded);
          setMainMml(normalized.mml);
        } catch (optErr) {
          setMainMml(loaded);
          showToast([i18nText("mml.opt_skip"), i18nText("mml.opt_skip_file", [shortError(optErr)])].filter(Boolean).join(": "), "info");
        }
        notifyPlayerUiSourceBaseline(mainMml.value, { name, sourceType: "txt", sourceLabel: "MML", newSource: true });
        showLoadedChannelCount(midiLoadBtn, i18nText("st.loaded"), mainMml.value);
      } else {
        throw new Error(i18nText("xml.unsupported_file"));
      }
    } catch (err) {
      showToast([i18nText("file.load_fail"), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  function installSourceFileDropHandlers() {
    document.addEventListener("dragover", (event) => {
      if (!isSourceFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = hasOpenAppDialog() ? "none" : "copy";
    });
    document.addEventListener("drop", (event) => {
      if (!isSourceFileDrag(event)) return;
      event.preventDefault();
      if (hasOpenAppDialog()) return;
      const file = findFirstSupportedSourceFile(event.dataTransfer?.files);
      if (!file) {
        showToast([i18nText("file.load_fail"), i18nText("xml.drag_drop")].filter(Boolean).join(": "), "error");
        return;
      }
      void loadLocalSourceFile(file);
    });
  }

  function isSourceFileDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes("Files") || types.includes("application/x-moz-file");
  }

  function hasOpenAppDialog() {
    return Array.from(document.querySelectorAll("dialog")).some(dialog => dialog.open);
  }

  function getSourceFileExtension(name) {
    return String(name || "").split(".").pop()?.toLowerCase() || "";
  }

  function isSupportedSourceFile(file) {
    return Boolean(file && (window.MabiMusicFormats?.isSupported(file.name || "", file.type || "") || SOURCE_FILE_EXTENSIONS.has(getSourceFileExtension(file.name || ""))));
  }

  function findFirstSupportedSourceFile(files) {
    return Array.from(files || []).find(isSupportedSourceFile) || null;
  }


  function normalizeImportedFullMml(text) {
    return addLeadingSilenceMml(normalizeMmlForDisplay(text), {
      partCount: 6,
      beats: AUTO_IMPORT_LEADING_SILENCE_SECONDS * 2
    });
  }


  function readMmlTextFile(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!/^MML\s*@/i.test(raw)) {
      throw new Error(i18nText("mml.txt_files"));
    }
    const m = raw.match(/^MML\s*@([\s\S]*);\s*$/i);
    if (!m) {
      throw new Error(i18nText("mml.semicolon_required"));
    }
    // 채널 내부 문법은 여기서 검사하지 않는다. 잘못된 명령은 편집기에서 빨간 배경으로 표시한다.
    return normalizeMmlForDisplay(raw);
  }


  function countMmlChannels(text) {
    try {
      return splitMmlParts(normalizeMmlForDisplay(text))
        .slice(0, MMI_IMPORT_MAX_CHANNELS)
        .filter(part => String(part || "").trim()).length;
    } catch (_) {
      return 0;
    }
  }

  function showLoadedChannelCount(button, label, text) {
    const count = countMmlChannels(text);
    if (count > 0) {
      flashButton(button, i18nText("ui.channel_count", [formatCount(count)]));
      return;
    }
    flashButton(button, label || i18nText("st.loaded"));
  }

  async function readMabiIccoMmiFile(data, name = i18nText("file.mmi")) {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    const candidates = extractMabiIccoMmlPartCandidates(text);
    if (!candidates.length) {
      throw new Error(i18nText("mml.code_not_found", [name]));
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }

  async function readThreeMleMmlFile(data, name = i18nText("mml.mle3_file")) {
    const text = decodeTextFileBytes(data).replace(/^\uFEFF/, "");
    if (/^\s*MML\s*@/i.test(text)) {
      return readMmlTextFile(text);
    }
    const globalTempo = extractThreeMleGlobalTempo(text);
    const candidates = applyThreeMleGlobalTempoToCandidates(extractThreeMleMmlPartCandidates(text), globalTempo);
    if (!candidates.length) {
      throw new Error(i18nText("mml.mle3_channels_not_found", [name]));
    }
    const selectedParts = await openMmiImportDialog(candidates, name);
    if (!selectedParts) return null;
    while (selectedParts.length < MMI_IMPORT_MAX_CHANNELS) selectedParts.push("");
    const normalizedParts = selectedParts
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(part => normalizeMmiLegacyLengthsInPart(part));
    return normalizeMmlForDisplay(composeMml(normalizedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS }));
  }


  function openMmiImportDialog(candidates, name = i18nText("file.mmi")) {
    const normalizedCandidates = (candidates || [])
      .map((candidate, index) => ({
        label: candidate.label || i18nText("ui.channel_n", [index + 1]),
        value: cleanupMmiMmlValue(candidate.value || ""),
        index
      }))
      .filter(candidate => candidate.value.trim())
      .slice(0, MMI_IMPORT_MAX_DETECTED_PARTS);

    if (!normalizedCandidates.length) {
      throw new Error(i18nText("mml.import_channels_not_found", [name]));
    }

    if (!mmiImportDialog?.showModal || !mmiChannelList) {
      return Promise.resolve(normalizedCandidates.slice(0, MMI_IMPORT_MAX_CHANNELS).map(candidate => candidate.value));
    }

    return new Promise(resolve => {
      pendingMmiImport = { candidates: normalizedCandidates, resolve };
      renderMmiImportDialog(name);
      try {
        mmiImportDialog.showModal();
      } catch (_) {
        resolveMmiImportDialog(normalizedCandidates.slice(0, MMI_IMPORT_MAX_CHANNELS).map(candidate => candidate.value));
      }
    });
  }

  function renderMmiImportDialog(name = i18nText("file.mmi")) {
    if (!pendingMmiImport || !mmiChannelList) return;
    const candidates = pendingMmiImport.candidates || [];
    if (mmiImportSummary) {
      mmiImportSummary.textContent = i18nText("mml.import_summary", [name, formatCount(candidates.length), MMI_IMPORT_MAX_CHANNELS]);
    }
    mmiChannelList.innerHTML = candidates.map((candidate, index) => {
      const normalized = normalizeMmiLegacyLengthsInPart(candidate.value);
      const changed = normalized !== candidate.value;
      const checked = index < MMI_IMPORT_MAX_CHANNELS ? " checked" : "";
      const preview = normalized.replace(/\s+/g, " ").slice(0, 180) || i18nText("ui.empty_ch");
      const meta = [i18nText("ui.char_count", [formatCount(normalized.length)])];
      if (changed) meta.push(i18nText("ui.length_correction"));
      return `
        <div class="mmi-channel-row${checked ? " selected" : ""}" data-mmi-row="${index}">
          <input class="mmi-channel-check" type="checkbox" value="${index}"${checked} aria-label="${escapeHtml(i18nText("aria.select_item", [candidate.label || i18nText("ui.channel_n", [index + 1])]))}" />
          <span class="mmi-channel-main">
            <strong>${escapeHtml(candidate.label || i18nText("ui.channel_n", [index + 1]))}</strong>
            <small>${escapeHtml(meta.join(" · "))}</small>
          </span>
          <code>${escapeHtml(preview)}${normalized.length > 180 ? "…" : ""}</code>
          <button class="mmi-preview-btn" type="button" data-mmi-preview="${index}" aria-label="${escapeHtml(i18nText("aria.listen_item", [candidate.label || i18nText("ui.channel_n", [index + 1])]))}">${escapeHtml(i18nText("ui.listen"))}</button>
        </div>`;
    }).join("");
    Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check")).forEach(input => {
      input.addEventListener("change", handleMmiImportSelectionChanged);
    });
    Array.from(mmiChannelList.querySelectorAll("[data-mmi-preview]")).forEach(button => {
      button.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMmiImportCandidate(Number(button.dataset.mmiPreview), button);
      });
    });
    Array.from(mmiChannelList.querySelectorAll("[data-mmi-row]")).forEach(row => {
      row.addEventListener("click", (ev) => {
        if (ev.target?.closest?.("button, input, a, select, textarea")) return;
        const input = row.querySelector(".mmi-channel-check");
        if (!input || input.disabled) return;
        input.checked = !input.checked;
        handleMmiImportSelectionChanged();
      });
    });
    updateMmiImportSelectionState();
  }

  function getSelectedMmiImportIndexes() {
    if (!mmiChannelList) return [];
    return Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check:checked"))
      .map(input => Number(input.value))
      .filter(index => Number.isInteger(index));
  }

  function getSelectedMmiImportParts() {
    if (!pendingMmiImport) return [];
    return getSelectedMmiImportIndexes()
      .slice(0, MMI_IMPORT_MAX_CHANNELS)
      .map(index => pendingMmiImport.candidates[index]?.value || "")
      .filter(value => value.trim());
  }

  function handleMmiImportSelectionChanged() {
    if (splitPreviewButton === mmiFullPreviewBtn) stopMidiPreview();
    updateMmiImportSelectionState();
  }

  function setMmiImportStatus(message = "") {
    if (!mmiImportStatus) return;
    const text = String(message || "");
    mmiImportStatus.textContent = text;
    mmiImportStatus.closest(".mmi-import-status-row")?.toggleAttribute("hidden", !text);
  }

  function updateMmiImportSelectionState() {
    if (!mmiChannelList) return;
    const checks = Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check"));
    const checked = checks.filter(input => input.checked);
    const checkedCount = checked.length;
    if (mmiImportTitle) {
      mmiImportTitle.textContent = i18nText("mml.select_chs_total", [checkedCount, MMI_IMPORT_MAX_CHANNELS]);
    }
    for (const input of checks) {
      input.disabled = !input.checked && checkedCount >= MMI_IMPORT_MAX_CHANNELS;
      input.closest(".mmi-channel-row")?.classList.toggle("selected", Boolean(input.checked));
    }
    setMmiImportStatus(checkedCount ? "" : i18nText("msg.select_one_ch"));
    if (mmiFullPreviewBtn) mmiFullPreviewBtn.disabled = checkedCount < 1 && splitPreviewButton !== mmiFullPreviewBtn;
    if (mmiAllPreviewBtn) mmiAllPreviewBtn.disabled = getAllMmiImportParts().length < 1 && splitPreviewButton !== mmiAllPreviewBtn;
    if (mmiImportClear) mmiImportClear.disabled = checkedCount < 1;
    if (mmiImportApply) mmiImportApply.disabled = checkedCount < 1;
  }

  function clearMmiImportSelection() {
    if (!mmiChannelList) return;
    if (splitPreviewButton === mmiFullPreviewBtn) stopMidiPreview();
    Array.from(mmiChannelList.querySelectorAll(".mmi-channel-check")).forEach(input => {
      input.checked = false;
      input.disabled = false;
    });
    updateMmiImportSelectionState();
  }

  async function toggleMmiSelectedPreview() {
    if (!pendingMmiImport || !mmiChannelList) return;
    const button = mmiFullPreviewBtn instanceof HTMLElement ? mmiFullPreviewBtn : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    const selectedParts = getSelectedMmiImportParts();
    if (!selectedParts.length) {
      setMmiImportStatus(i18nText("msg.select_one_ch_2"));
      return;
    }

    await playMmiImportPartsPreview(selectedParts, {
      button,
      statusText: i18nText("mml.preview_selected_status", [selectedParts.length, MMI_IMPORT_MAX_CHANNELS]),
      errorPrefix: i18nText("err.preview_select")
    });
  }

  async function toggleMmiAllPreview() {
    if (!pendingMmiImport) return;
    const button = mmiAllPreviewBtn instanceof HTMLElement ? mmiAllPreviewBtn : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    const allParts = getAllMmiImportParts();
    if (!allParts.length) {
      setMmiImportStatus(i18nText("mml.file_contain"));
      return;
    }

    await playMmiImportPartsPreview(allParts, {
      button,
      statusText: i18nText("mml.preview_all_status", [allParts.length]),
      errorPrefix: i18nText("err.preview_all"),
      allowManyParts: true
    });
  }

  function getAllMmiImportParts() {
    if (!pendingMmiImport) return [];
    return (pendingMmiImport.candidates || [])
      .map(candidate => candidate?.value || "")
      .filter(value => String(value || "").trim());
  }

  async function playMmiImportPartsPreview(rawParts, options = {}) {
    const button = options.button instanceof HTMLElement ? options.button : null;
    const parts = (rawParts || [])
      .map(part => normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(part || "")))
      .filter(part => part.trim());
    if (!parts.length) {
      setMmiImportStatus(i18nText("mml.no_chs"));
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      setMmiImportStatus(options.statusText || i18nText("ui.preview_wait"));

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const scheduled = buildMmiImportPreviewSchedule(parts, { allowManyParts: Boolean(options.allowManyParts) });
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error(i18nText("msg.no_notes_preview"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));

      const prepared = prepareMmiImportPreviewNotes(ctx, notes, parts.length);
      if (!prepared.length) throw new Error(i18nText("msg.no_audible"));

      const duration = notes.reduce((m, n) => Math.max(m, (Number(n.start) || 0) + (Number(n.durationSec) || 0)), 0);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        playbackSpeed,
        windowStart: 0,
        windowEnd: Math.max(0.5, duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: null,
        minLeadTime: 0.01,
        gainScale
      });
      const stopMs = Math.max(800, (result.maxEnd - ctx.currentTime + 0.35) * 1000);
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        updateMmiImportSelectionState();
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      setMmiImportStatus(i18nText("err.with_detail", [options.errorPrefix || i18nText("err.preview"), shortError(err)]));
    }
  }

  function buildMmiImportPreviewSchedule(parts, options = {}) {
    const normalizedParts = (parts || []).map(part => normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(part || "")));
    if (!options.allowManyParts) {
      const fixedParts = normalizedParts.slice(0, MMI_IMPORT_MAX_CHANNELS);
      while (fixedParts.length < MMI_IMPORT_MAX_CHANNELS) fixedParts.push("");
      const mml = composeMml(fixedParts, { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS });
      return buildSchedule(parseMabinogiMml(mml));
    }

    const parsedParts = normalizedParts.map((part, index) => parseMmlPart(part, index));
    const tempos = [{ beat: 0, bpm: 120, part: -1, order: -1 }];
    for (const part of parsedParts) {
      if (Array.isArray(part.tempos)) tempos.push(...part.tempos);
    }
    tempos.sort((a, b) => a.beat - b.beat || a.order - b.order || a.part - b.part);
    return buildSchedule({ parts: parsedParts, tempos: normalizeMmiImportPreviewTempoMap(tempos) });
  }

  function normalizeMmiImportPreviewTempoMap(events) {
    const map = [];
    for (const ev of events || []) {
      if (!Number.isFinite(Number(ev?.beat)) || !Number.isFinite(Number(ev?.bpm))) continue;
      const beat = Number(ev.beat);
      const bpm = Number(ev.bpm);
      const last = map[map.length - 1];
      if (last && Math.abs(last.beat - beat) < 1e-9) last.bpm = bpm;
      else map.push({ beat, bpm });
    }
    if (!map.length || Math.abs(map[0].beat) > 1e-9) map.unshift({ beat: 0, bpm: 120 });
    return map;
  }

  function prepareMmiImportPreviewNotes(ctx, notes, partCount) {
    const prepared = [];
    const count = Math.max(0, Number(partCount) || 0);
    for (let partIndex = 0; partIndex < count; partIndex++) {
      const partNotes = notes.filter(note => note.part === partIndex);
      if (!partNotes.length) continue;
      const preset = getPartPreset(partIndex % MMI_IMPORT_MAX_CHANNELS);
      if (!preset) continue;
      prepared.push(...prepareNotes(ctx, soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi || a.id - b.id);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    return prepared;
  }

  async function previewMmiImportCandidate(index, triggerButton = null) {
    const candidates = pendingMmiImport?.candidates || [];
    const candidate = candidates[Number(index)];
    if (!candidate) return;

    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    if (button && splitPreviewButton === button) {
      stopMidiPreview();
      updateMmiImportSelectionState();
      return;
    }

    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) setSplitPreviewButton(button);
      if (button) {
        button.textContent = i18nText("player.stop");
        button.classList.add("danger");
        button.setAttribute("aria-pressed", "true");
      }
      setMmiImportStatus(i18nText("mml.preview_channel_status", [candidate.label || i18nText("ui.channel_selected")]));

      await loadDefaultSf2IfNeeded();
      const ctx = await ensureAudioContext();
      const part = normalizeMmiLegacyLengthsInPart(cleanupMmiMmlValue(candidate.value || ""));
      const mml = composeMml([part, "", "", "", "", ""], { preserveEmpty: true, partCount: MMI_IMPORT_MAX_CHANNELS });
      const parsed = parseMabinogiMml(mml);
      const scheduled = buildSchedule(parsed);
      const notes = Array.isArray(scheduled.notes) ? scheduled.notes : [];
      if (!notes.length) throw new Error(i18nText("msg.no_notes_preview"));
      if (!soundFont?.presets?.length) throw new Error(i18nText("snd.find_avail"));

      const firstStart = notes.reduce((m, n) => Math.min(m, Number(n.start) || 0), Infinity);
      const lastEnd = notes.reduce((m, n) => Math.max(m, (Number(n.start) || 0) + (Number(n.durationSec) || 0)), 0);
      const fromSec = Number.isFinite(firstStart) ? Math.max(0, firstStart) : 0;
      const windowEnd = Math.min(lastEnd, fromSec + 10);
      const preset = getPartPreset(0);
      if (!preset) throw new Error(i18nText("snd.find_preview"));
      const prepared = prepareNotes(ctx, soundFont, preset, notes).sort((a, b) => a.start - b.start || a.midi - b.midi);
      for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
      if (!prepared.length) throw new Error(i18nText("msg.no_audible"));
      const gainScale = computeAutoGainScale(prepared, { windowStart: fromSec, windowEnd });

      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec,
        playbackSpeed,
        windowStart: fromSec,
        windowEnd: Math.max(fromSec + 0.25, windowEnd + 0.05),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.012,
        gainScale
      });
      const stopMs = Math.max(800, Math.min(12000, (result.maxEnd - ctx.currentTime + 0.35) * 1000));
      midiPreviewTimer = window.setTimeout(() => {
        stopMidiPreview();
        updateMmiImportSelectionState();
      }, stopMs);
    } catch (err) {
      stopMidiPreview();
      setMmiImportStatus(i18nText("err.with_detail", [i18nText("err.preview"), shortError(err)]));
    }
  }

  function applyMmiImportDialog() {
    if (!pendingMmiImport || !mmiChannelList) return;
    const selectedParts = getSelectedMmiImportParts();
    if (!selectedParts.length) {
      setMmiImportStatus(i18nText("msg.select_one_ch"));
      return;
    }
    resolveMmiImportDialog(selectedParts);
    if (mmiImportDialog?.open) mmiImportDialog.close("apply");
  }

  function closeMmiImportDialog(value = null) {
    resolveMmiImportDialog(value);
    if (mmiImportDialog?.open) mmiImportDialog.close(value ? "apply" : "cancel");
  }

  function resolveMmiImportDialog(value) {
    if (!pendingMmiImport) return;
    const resolve = pendingMmiImport.resolve;
    pendingMmiImport = null;
    if (typeof resolve === "function") resolve(value);
  }


  function decodeTextFileBytes(data) {
    if (typeof data === "string") return data;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes);
    }
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    const bad = (utf8.match(/\uFFFD/g) || []).length;
    if (bad > 0 && typeof TextDecoder === "function") {
      for (const enc of ["shift_jis", "windows-31j", "euc-kr"]) {
        try {
          const decoded = new TextDecoder(enc).decode(bytes);
          const decodedBad = (decoded.match(/\uFFFD/g) || []).length;
          if (decodedBad < bad) return decoded;
        } catch (_) {}
      }
    }
    return utf8;
  }

  function extractThreeMleGlobalTempo(text) {
    const source = String(text || "");
    const channel1 = extractThreeMleSectionBlock(source, "Channel1");
    const scanSources = [channel1, source].filter(Boolean);
    for (const scanSource of scanSources) {
      const lines = String(scanSource || "").split(/\r?\n/);
      for (const line of lines) {
        const cleaned = cleanupThreeMleMmlLine(line);
        const m = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(cleaned);
        if (!m) continue;
        const bpm = clampInt(Number(m[1]) || 0, 32, 255);
        if (bpm) return `t${bpm}`;
      }
      const rawMatch = /(?:^|[^a-z])t\s*(\d{2,3})/i.exec(String(scanSource || ""));
      if (rawMatch) {
        const bpm = clampInt(Number(rawMatch[1]) || 0, 32, 255);
        if (bpm) return `t${bpm}`;
      }
    }
    return "";
  }

  function extractThreeMleSectionBlock(text, sectionName) {
    const source = String(text || "");
    const escaped = String(sectionName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im");
    const match = re.exec(source);
    if (!match) return "";
    const start = match.index + match[0].length;
    const next = /^\s*\[[^\]]+\]\s*$/gim;
    next.lastIndex = start;
    const nextMatch = next.exec(source);
    const end = nextMatch ? nextMatch.index : source.length;
    return source.slice(start, end);
  }

  function applyThreeMleGlobalTempoToCandidates(candidates, tempoToken) {
    const tempo = String(tempoToken || "").trim();
    if (!tempo) return candidates || [];
    return (candidates || []).map(candidate => {
      const value = String(candidate?.value || "").trim();
      if (!value) return candidate;
      const nextValue = /^t\s*\d+/i.test(value) ? value : `${tempo}${value}`;
      return { ...candidate, value: nextValue };
    });
  }

  function extractThreeMleMmlPartCandidates(text) {
    const source = String(text || "");
    const headers = [];
    const headerRe = /^\s*\[([^\]]+)\]\s*$/gim;
    let m;
    while ((m = headerRe.exec(source))) {
      headers.push({ title: String(m[1] || "").trim(), index: m.index, end: headerRe.lastIndex });
    }

    const records = [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const chMatch = /^Channel\s*(\d+)$/i.exec(header.title);
      if (!chMatch) continue;
      const channelNo = Number(chMatch[1]) || records.length + 1;
      const nextIndex = headers[i + 1]?.index ?? source.length;
      const block = source.slice(header.end, nextIndex);
      const code = extractThreeMleChannelMmlCode(block);
      if (!code || !hasThreeMlePlayableTokens(code) || !looksLikeMmlPart(code)) continue;
      const name = extractThreeMleChannelName(block);
      records.push({
        label: formatMmiChannelLabel(channelNo, name),
        value: code,
        name
      });
      if (records.length >= MMI_IMPORT_MAX_DETECTED_PARTS) break;
    }
    return records;
  }

  function extractThreeMleChannelName(block) {
    const text = String(block || "");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const raw = m[1] || "";
      if (!raw || /^#/.test(raw)) continue;
      if (/^(initialize|init|using_extension|using_channel)$/i.test(raw.trim())) continue;
      const name = cleanupMmiNameValue(raw);
      if (name) return name;
    }
    return "";
  }

  function extractThreeMleChannelMmlCode(block) {
    const lines = String(block || "").split(/\r?\n/);
    const parts = [];
    for (const line of lines) {
      const cleaned = cleanupThreeMleMmlLine(line);
      if (cleaned) parts.push(cleaned);
    }
    return cleanupThreeMleMmlCode(parts.join(""));
  }

  function cleanupThreeMleMmlLine(line) {
    let s = String(line || "");
    if (!s.trim() || /^\s*\/\//.test(s)) return "";
    s = s.replace(/^\s*\/\*\s*M\s*\d+\s*\*\/\s*/i, "");
    s = s.replace(/\/\*[\s\S]*?\*\//g, "");
    s = s.replace(/\/\/.*$/g, "");
    return cleanupThreeMleMmlCode(s);
  }

  function cleanupThreeMleMmlCode(value) {
    let s = String(value || "");
    s = s.replace(/\bEXx[^\s]*/gi, "");
    s = s.replace(/[Yy]\s*\d+\s*,\s*-?\d+/g, "");
    s = s.replace(/@\s*-?\d+/g, "");
    s = s.replace(/~\s*-?\d+(?:\s*,\s*-?\d+)*/g, "");
    s = s.replace(/[Vv]\s*(\d+)/g, (_, raw) => {
      const n = Math.max(0, Number(raw) || 0);
      const scaled = n > 15 ? Math.round(Math.min(127, n) * 15 / 127) : n;
      return `v${clampInt(scaled, 0, 15)}`;
    });
    s = s.replace(/[^cdefgabronltv<>+#\-&.0-9\s]/gi, "");
    return s.replace(/\s+/g, "").trim();
  }

  function hasThreeMlePlayableTokens(value) {
    return /[cdefgabn]/i.test(String(value || ""));
  }
  function extractMabiIccoMmlPartCandidates(text) {
    const source = String(text || "");
    const nameMarkers = extractMmiNameMarkers(source);
    const fullRecords = [];
    const fullRe = /MML\s*@([\s\S]*?)\s*;/gi;
    let m;
    let fullIndex = 0;
    while ((m = fullRe.exec(source))) {
      const parsed = splitMmlParts(`MML@${m[1]};`);
      for (const part of parsed) {
        fullIndex++;
        const cleaned = cleanupMmiMmlValue(part);
        if (cleaned) {
          const name = nameMarkers[fullIndex - 1]?.name || findMmiNameForCandidate(m.index, nameMarkers, fullIndex - 1);
          fullRecords.push({ label: formatMmiChannelLabel(fullIndex, name), value: cleaned, name });
        }
        if (fullRecords.length >= MMI_IMPORT_MAX_DETECTED_PARTS) return fullRecords;
      }
    }
    if (fullRecords.length) return fullRecords;

    const found = [];
    const add = (value, index = 0) => {
      const cleaned = cleanupMmiMmlValue(value);
      if (!cleaned) return;
      const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
      for (const part of parts) {
        const candidate = cleanupMmiMmlValue(part);
        if (looksLikeMmlPart(candidate)) {
          const name = findMmiNameForCandidate(index, nameMarkers, found.length);
          found.push({ index, value: candidate, name });
        }
      }
    };

    const keyed = /(?:^|[\s<{,;])(?:[A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\r\n<>]+))/gim;
    while ((m = keyed.exec(source))) add(m[1] ?? m[2] ?? m[3] ?? "", m.index);

    const tagged = /<([A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
    while ((m = tagged.exec(source))) add(m[2] || "", m.index);

    const stringTagged = /<string\b[^>]*>([\s\S]*?)<\/string>/gim;
    while ((m = stringTagged.exec(source))) add(m[1] || "", m.index);

    if (found.length < MMI_IMPORT_MAX_CHANNELS) {
      const lineRe = /^\s*([^\r\n=:#<>]{1,20000})\s*$/gm;
      while ((m = lineRe.exec(source))) add(m[1] || "", m.index);
    }

    found.sort((a, b) => a.index - b.index);
    const parts = [];
    for (const item of found) {
      pushMmiPart(parts, item.value, item.index, item.name);
      if (parts.length >= MMI_IMPORT_MAX_DETECTED_PARTS) break;
    }
    return parts.map((part, index) => ({
      label: formatMmiChannelLabel(index + 1, part.name),
      value: part.value,
      name: part.name
    }));
  }

  function extractMmiNameMarkers(source) {
    const text = String(source || "");
    const markers = [];
    const seen = new Set();
    const addName = (raw, index = 0) => {
      const name = cleanupMmiNameValue(raw);
      if (!name) return;
      const key = `${index}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      markers.push({ index: Math.max(0, Number(index) || 0), name });
    };

    let m;
    const nameTag = /<([A-Za-z0-9_:-]*(?:name|trackname|partname)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]{0,500}?)<\/\1>/gim;
    while ((m = nameTag.exec(text))) addName(m[2] || "", m.index);

    const nameAttr = /\b(?:name|trackName|track_name|partName|part_name)\s*=\s*(?:"([^"]{0,220})"|'([^']{0,220})')/gim;
    while ((m = nameAttr.exec(text))) addName(m[1] ?? m[2] ?? "", m.index);

    const keyedName = /(?:^|[\r\n,{;\s])(?:[A-Za-z0-9_.:-]*(?:name|trackname|track_name|partname|part_name)[A-Za-z0-9_.:-]*)\s*[:=]\s*(?:"([^"]{0,220})"|'([^']{0,220})'|([^\r\n,}<>]{0,220}))/gim;
    while ((m = keyedName.exec(text))) addName(m[1] ?? m[2] ?? m[3] ?? "", m.index);

    return markers.sort((a, b) => a.index - b.index);
  }

  function cleanupMmiNameValue(value) {
    let s = String(value == null ? "" : value);
    s = s.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    s = s.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    s = s.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
    s = s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^name\s*[:=]\s*/i, "").trim();
    if (!s || s.length > 120) return "";
    if (/^MML\s*@/i.test(s)) return "";
    const cleanedAsMml = cleanupMmiMmlValue(s);
    if (cleanedAsMml && looksLikeMmlPart(cleanedAsMml)) return "";
    return s;
  }

  function findMmiNameForCandidate(position, markers, orderIndex = 0) {
    if (!markers?.length) return "";
    const pos = Math.max(0, Number(position) || 0);
    let best = null;
    for (const marker of markers) {
      const beforeDistance = pos - marker.index;
      if (beforeDistance >= 0 && beforeDistance <= 2400) {
        if (!best || beforeDistance < best.distance) best = { name: marker.name, distance: beforeDistance };
      }
    }
    if (best?.name) return best.name;
    for (const marker of markers) {
      const afterDistance = marker.index - pos;
      if (afterDistance >= 0 && afterDistance <= 900) {
        if (!best || afterDistance < best.distance) best = { name: marker.name, distance: afterDistance };
      }
    }
    if (best?.name) return best.name;
    const ordered = markers[Math.max(0, Math.min(markers.length - 1, Number(orderIndex) || 0))];
    return ordered?.name || "";
  }

  function formatMmiChannelLabel(number, name = "") {
    const label = `Ch ${number}`;
    const cleaned = cleanupMmiNameValue(name);
    return cleaned ? `${label} · ${cleaned}` : label;
  }

  function cleanupMmiMmlValue(value) {
    let s = String(value == null ? "" : value);
    s = s.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    s = s.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    s = s.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
    return s.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim();
  }


  function normalizeMmiLegacyLengthsInPart(value) {
    const s = String(value || "");
    let i = 0;
    let out = "";
    let legacyDefault = null;

    const isDigit = ch => /\d/.test(ch || "");
    const readDigits = () => {
      const start = i;
      while (i < s.length && isDigit(s[i])) i++;
      return i > start ? s.slice(start, i) : "";
    };
    const readDots = () => {
      const start = i;
      while (s[i] === ".") i++;
      return i - start;
    };
    const legacyFactor = dots => {
      let factor = 1;
      let add = 0.5;
      for (let n = 0; n < dots; n++) {
        factor += add;
        add /= 2;
      }
      return factor;
    };
    const isValidMmlLength = n => [1, 2, 4, 8, 16, 32, 64].includes(n);
    const quantaFromSpec = spec => {
      if (!spec || !spec.length || spec.length <= 0) return 16;
      const factor = legacyFactor(spec.dots || 0) * (spec.extraFactor || 1);
      return Math.max(1, Math.round((64 / spec.length) * factor));
    };
    const decomposeQuanta = quanta => {
      let remain = Math.max(1, Math.floor(quanta));
      const result = [];
      for (const entry of [
        { len: 1, q: 64 },
        { len: 2, q: 32 },
        { len: 4, q: 16 },
        { len: 8, q: 8 },
        { len: 16, q: 4 },
        { len: 32, q: 2 },
        { len: 64, q: 1 }
      ]) {
        while (remain >= entry.q) {
          result.push(entry.len);
          remain -= entry.q;
        }
      }
      return result.length ? result : [64];
    };
    const expandTimedToken = (head, spec, options = {}) => {
      const lengths = decomposeQuanta(quantaFromSpec(spec));
      const isRest = options.rest || /^r$/i.test(head) || /^n0$/i.test(head);
      if (options.needsLengthCommand) {
        return lengths
          .map(len => `l${len}${head}`)
          .join(isRest ? "" : "&");
      }
      return lengths
        .map(len => `${head}${len}`)
        .join(isRest ? "" : "&");
    };
    const combineDefaultSpec = (dots = 0) => {
      if (!legacyDefault) return null;
      return {
        length: legacyDefault.length,
        dots: legacyDefault.dots,
        extraFactor: legacyFactor(dots)
      };
    };

    while (i < s.length) {
      const ch = s[i];
      const lower = ch.toLowerCase();

      if (lower === "l") {
        const start = i;
        i++;
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          legacyDefault = { length: n, dots };
        } else {
          legacyDefault = null;
          out += s.slice(start, i);
        }
        continue;
      }

      if (/[cdefgab]/i.test(ch)) {
        i++;
        let head = ch;
        if (s[i] === "+" || s[i] === "#" || s[i] === "-") {
          head += s[i];
          i++;
        }
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          out += expandTimedToken(head, { length: n, dots });
        } else if (!digits && legacyDefault) {
          out += expandTimedToken(head, combineDefaultSpec(dots));
        } else {
          out += `${head}${digits}${".".repeat(dots)}`;
        }
        continue;
      }

      if (lower === "r") {
        i++;
        const digits = readDigits();
        const dots = readDots();
        const n = digits ? Number(digits) : null;
        if (n && !isValidMmlLength(n)) {
          out += expandTimedToken(ch, { length: n, dots }, { rest: true });
        } else if (!digits && legacyDefault) {
          out += expandTimedToken(ch, combineDefaultSpec(dots), { rest: true });
        } else {
          out += `${ch}${digits}${".".repeat(dots)}`;
        }
        continue;
      }

      if (lower === "n") {
        i++;
        const noteNumber = readDigits();
        const dots = readDots();
        const head = `n${noteNumber}`;
        if (legacyDefault && noteNumber) {
          out += expandTimedToken(head, combineDefaultSpec(dots), { needsLengthCommand: true, rest: Number(noteNumber) === 0 });
        } else {
          out += `${head}${".".repeat(dots)}`;
        }
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  function looksLikeMmlPart(value) {
    const s = String(value || "").trim();
    if (!s) return false;
    if (/[^cdefgabronltv<>+#\-&.0-9\s]/i.test(s)) return false;
    if (!/[cdefgabronrltv<>]/i.test(s)) return false;
    const normalized = normalizeMmiLegacyLengthsInPart(s);
    try {
      const parsed = parseMabinogiMml(composeMml([normalized], { preserveEmpty: true, partCount: 1 }));
      const part = parsed.parts?.[0];
      return Boolean(part && (part.notes.length || part.tempos.length || /[rR]/.test(normalized)));
    } catch (_) {
      return false;
    }
  }

  function pushMmiPart(list, value, index = 0, name = "") {
    const cleaned = cleanupMmiMmlValue(value);
    if (!cleaned) return;
    list.push({ value: cleaned, index, name: cleanupMmiNameValue(name) });
  }


  function openMidiConvertDialog(importData) {
    pendingMidiImport = importData;
    pendingMidiStartsNewSource = true;
    midiLastAppliedSignature = "";
    midiConvertQueued = false;
    clearTimeout(midiConvertRequestTimer);
    midiConvertRequestTimer = 0;
    const sourceLabel = getMidiImportSourceLabel(importData);
    const overview = importData.overview;
    const groups = overview.instrumentGroups || overview.channels || [];
    if (!groups.length) {
      pendingMidiImport = null;
      setPlayerUiOriginalMidiImport(null);
      throw new Error(i18nText("midi.group_not_found", [sourceLabel]));
    }

    setPlayerUiOriginalMidiImport(importData);
    pendingMidiSettings = createDefaultMidiSettings(groups);
    midiAppliedSettingsSnapshot = null;
    midiInstrumentSectionOpenState.clear();
    // A newly loaded file starts a fresh playerUi. Do not resurrect the previous
    // instrument/channel assignment cache for the same file; use the automatic
    // initial assignment and let session restore handle intentional recovery.
    applyInitialMidiGroupAssignment(pendingMidiSettings);
    midiAppliedSettingsSnapshot = cloneMidiPendingSettings(pendingMidiSettings);

    if (midiConvertTitle) midiConvertTitle.textContent = i18nText("cfg.conv_cfg", [sourceLabel]);
    updateMidiConvertSummary();
    updateMidiQuantizeToggle();
    setMidiConvertBusy(false);
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();

    if (midiConvertDialog?.showModal) {
      midiConvertDialog.showModal();
      scheduleMidiInstrumentListHeightSync();
      // Source PlayerUi에서는 최초 채널 배정을 바로 적용해 불러오자마자 재생/편집할 수 있게 한다.
      window.setTimeout(() => requestMidiConvert({ force: true }), 0);
    } else {
      // 오래된 브라우저에서는 기본값으로 바로 변환한다.
      applyMidiConvertDialog();
    }
  }

  let sourceFingerprintCrcTable = null;

  function buildSourceFileFingerprint(sourceType, bytes) {
    let data;
    if (bytes instanceof Uint8Array) {
      data = bytes;
    } else if (ArrayBuffer.isView(bytes)) {
      data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else if (bytes instanceof ArrayBuffer) {
      data = new Uint8Array(bytes);
    } else {
      data = new Uint8Array(0);
    }
    if (!sourceFingerprintCrcTable) {
      sourceFingerprintCrcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
          value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        sourceFingerprintCrcTable[i] = value >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = sourceFingerprintCrcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    const checksum = ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0");
    return `${String(sourceType || "midi").toLowerCase()}:${data.byteLength}:${checksum}`;
  }

  function getMidiImportCacheFingerprint(importData) {
    const saved = String(importData?.cacheFingerprint || "").trim();
    if (saved) return saved;
    return buildSourceFileFingerprint(importData?.sourceType || "midi", importData?.bytes);
  }

  function midiGroupCacheSignature(group) {
    return [
      Number.isInteger(group?.bankMsb) ? group.bankMsb : 0,
      Number.isInteger(group?.bankLsb) ? group.bankLsb : 0,
      Number.isInteger(group?.program) ? group.program : 0,
      Number.isInteger(group?.drumMidi) ? group.drumMidi : "-",
      Number(group?.noteCount) || 0,
      Array.isArray(group?.sourceGroupIds) ? group.sourceGroupIds.length : 0,
      group?.isBeat ? 1 : 0
    ].join(":");
  }

  function serializeMidiConvertSettings(importData, settings) {
    const groups = Array.isArray(settings?.groups) ? settings.groups : [];
    const indexById = new Map(groups.map((group, index) => [String(group.id), index]));
    return {
      version: MIDI_CONVERT_CACHE_VERSION,
      fingerprint: getMidiImportCacheFingerprint(importData),
      sourceType: String(importData?.sourceType || "midi"),
      sourceName: String(importData?.name || ""),
      savedAt: Date.now(),
      groupSignatures: groups.map(midiGroupCacheSignature),
      quantizeDivision: Number(settings?.quantizeDivision) === 32 ? 32 : 64,
      channels: Array.from({ length: 6 }, (_, index) => {
        const channel = settings?.channels?.[index] || {};
        const selectedGroupIndexes = Array.from(channel.selectedInstrumentGroups || [])
          .map(id => indexById.get(String(id)))
          .filter(groupIndex => Number.isInteger(groupIndex));
        return {
          role: ["auto", "high", "low"].includes(channel.role) ? channel.role : "auto",
          overlapMergeMode: normalizeOverlapMergeMode(channel.overlapMergeMode ?? channel.overlapMerge),
          selectedGroupIndexes
        };
      }),
      sectionOpenState: Object.fromEntries(
        MIDI_INSTRUMENT_CATEGORY_ORDER
          .filter(category => midiInstrumentSectionOpenState.has(category))
          .map(category => [category, midiInstrumentSectionOpenState.get(category) !== false])
      )
    };
  }

  function saveLastMidiConvertSettings(importData, settings) {
    if (!importData || !settings) return;
    writeLocalJsonPref(MIDI_CONVERT_CACHE_PREF, serializeMidiConvertSettings(importData, settings));
  }

  function createDefaultMidiSettings(groups) {
    const allGroups = Array.isArray(groups) ? groups : [];
    const channelSettings = Array.from({ length: 6 }, (_, i) => {
      const role = i === 0 ? "high" : (i === 2 ? "low" : "auto");
      const overlapMergeMode = (i === 0 || i === 2) ? "half" : "all";
      return {
        role,
        overlapMerge: overlapMergeMode !== "none",
        overlapMergeMode,
        selectedInstrumentGroups: new Set()
      };
    });
    return {
      groups: allGroups,
      quantizeDivision: 64,
      partCount: 0,
      channels: channelSettings
    };
  }

  function cloneMidiPendingSettings(settings) {
    if (!settings) return null;
    const groups = Array.isArray(settings.groups) ? settings.groups : [];
    return {
      groups,
      quantizeDivision: Number(settings.quantizeDivision) === 32 ? 32 : 64,
      partCount: Math.max(0, Number(settings.partCount) || 0),
      channels: Array.from({ length: 6 }, (_, index) => {
        const source = settings.channels?.[index] || {};
        const overlapMergeMode = normalizeOverlapMergeMode(source.overlapMergeMode ?? source.overlapMerge);
        return {
          role: ["auto", "high", "low"].includes(source.role) ? source.role : "auto",
          overlapMerge: overlapMergeMode !== "none",
          overlapMergeMode,
          selectedInstrumentGroups: new Set(Array.from(source.selectedInstrumentGroups || []))
        };
      })
    };
  }

  function cloneMidiImportData(importData) {
    if (!importData) return null;
    const bytes = importData.bytes instanceof Uint8Array
      ? new Uint8Array(importData.bytes)
      : (ArrayBuffer.isView(importData.bytes)
        ? new Uint8Array(importData.bytes.buffer.slice(importData.bytes.byteOffset, importData.bytes.byteOffset + importData.bytes.byteLength))
        : (importData.bytes instanceof ArrayBuffer ? new Uint8Array(importData.bytes.slice(0)) : importData.bytes));
    return { ...importData, bytes };
  }

  function restoreMidiPlayerUiSnapshot(snapshot) {
    if (!snapshot?.pendingMidiImport || !snapshot?.pendingMidiSettings) return false;
    pendingMidiImport = cloneMidiImportData(snapshot.pendingMidiImport);
    pendingMidiSettings = cloneMidiPendingSettings(snapshot.pendingMidiSettings);
    pendingMidiStartsNewSource = false;
    midiAppliedSettingsSnapshot = cloneMidiPendingSettings(snapshot.appliedSettings || snapshot.pendingMidiSettings);
    midiLastAppliedSignature = String(snapshot.lastAppliedSignature || "");
    midiInstrumentSectionOpenState.clear();
    const restoredSectionState = snapshot.sectionOpenState;
    if (restoredSectionState && typeof restoredSectionState === "object" && !Array.isArray(restoredSectionState)) {
      for (const category of MIDI_INSTRUMENT_CATEGORY_ORDER) {
        if (typeof restoredSectionState[category] === "boolean") {
          midiInstrumentSectionOpenState.set(category, restoredSectionState[category]);
        }
      }
    }
    midiConvertQueued = false;
    clearTimeout(midiConvertRequestTimer);
    midiConvertRequestTimer = 0;
    setPlayerUiOriginalMidiImport(pendingMidiImport);
    const sourceLabel = getMidiImportSourceLabel(pendingMidiImport);
    if (midiConvertTitle) midiConvertTitle.textContent = i18nText("cfg.conv_cfg", [sourceLabel]);
    updateMidiConvertSummary();
    updateMidiQuantizeToggle();
    setMidiConvertBusy(false);
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
    midiConvertDialog?.showModal?.();
    scheduleMidiInstrumentListHeightSync();
    return true;
  }

  function applyInitialMidiGroupAssignment(settings) {
    if (!settings?.groups?.length || !Array.isArray(settings.channels)) return;
    const sortedGroups = sortMidiInstrumentGroups(settings.groups);
    // 드럼이 정렬상 첫 그룹이어도 뒤의 멜로디 그룹을 찾아 최초 배정한다.
    // 드럼만 있는 파일은 드럼 그룹 자체를 배정해 최초 자동 변환이 비지 않게 한다.
    const firstGroup = sortedGroups.find(group => getMidiInstrumentCategory(group) !== "drums") || sortedGroups[0];
    if (!firstGroup) return;
    const firstCategory = getMidiInstrumentCategory(firstGroup);

    const firstCategoryGroupIds = sortedGroups
      .filter(group => getMidiInstrumentCategory(group) === firstCategory)
      .map(group => group.id);

    for (const channelIndex of [0, 1, 2]) {
      const selected = settings.channels[channelIndex]?.selectedInstrumentGroups;
      if (!selected) continue;
      for (const groupId of firstCategoryGroupIds) selected.add(groupId);
    }
  }

  function updateMidiQuantizeToggle() {
    const available = Boolean(pendingMidiSettings);
    const division = Number(pendingMidiSettings?.quantizeDivision) === 32 ? 32 : 64;
    try {
      window.dispatchEvent(new CustomEvent("mobibard:midi-quantize-state", {
        detail: { available, division }
      }));
    } catch (_) {}
  }

  function refreshMidiConvertLocale() {
    if (!pendingMidiImport || !pendingMidiSettings) return;
    const sourceLabel = getMidiImportSourceLabel(pendingMidiImport);
    if (midiConvertTitle) midiConvertTitle.textContent = i18nText("cfg.conv_cfg", [sourceLabel]);
    updateMidiConvertSummary();
    updateMidiQuantizeToggle();
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
  }


  function renderMidiRoleList() {
    if (!midiRoleList || !pendingMidiSettings) return;
    midiRoleList.innerHTML = "";
    const header = document.createElement("div");
    header.className = "midi-role-list-header wb13-midi-role-header";
    header.innerHTML = `
      <strong>${escapeHtml(i18nText("ui.channel"))}</strong>
      <strong>${escapeHtml(i18nText("midi.instrument_note_placement"))}</strong>
      <strong>${escapeHtml(i18nText("midi.instrument_note_overlap"))}</strong>
    `;
    midiRoleList.appendChild(header);

    const roleOptions = [
      ["auto", i18nText("ui.auto")],
      ["high", i18nText("ui.high")],
      ["low", i18nText("ui.low")]
    ];
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      const row = document.createElement("div");
      row.className = `midi-role-row midi-export-channel part-${i} wb8-midi-role-card wb13-midi-role-row`;
      row.dataset.channelIndex = String(i);
      const mergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      setting.overlapMergeMode = mergeMode;
      setting.overlapMerge = mergeMode !== "none";

      const roleButtons = roleOptions.map(([value, label]) => `
        <button type="button" class="wb13-midi-role-option${setting.role === value ? " active" : ""}"
          data-role-index="${i}" data-role-value="${value}" aria-pressed="${setting.role === value ? "true" : "false"}">${escapeHtml(label)}</button>
      `).join("");
      const mergeButtons = OVERLAP_MERGE_OPTIONS.map(opt => `
        <button type="button" class="wb13-midi-role-option${mergeMode === opt.value ? " active" : ""}"
          data-merge-index="${i}" data-merge-value="${opt.value}" aria-pressed="${mergeMode === opt.value ? "true" : "false"}">${escapeHtml(i18nText(opt.labelKey))}</button>
      `).join("");

      row.innerHTML = `
        <strong class="wb8-midi-role-name wb13-midi-role-name">${escapeHtml(PART_LABELS[i])}</strong>
        <div class="wb13-midi-role-options" role="group" aria-label="${escapeHtml(i18nText("aria.role", [PART_LABELS[i]]))}">${roleButtons}</div>
        <div class="wb13-midi-role-options" role="group" aria-label="${escapeHtml(i18nText("aria.merge_mode", [PART_LABELS[i]]))}">${mergeButtons}</div>
      `;
      row.querySelectorAll("[data-role-value]").forEach(button => button.addEventListener("click", () => {
        const value = String(button.dataset.roleValue || "auto");
        updateMidiChannelRole(i, value);
        renderMidiRoleList();
      }));
      row.querySelectorAll("[data-merge-value]").forEach(button => button.addEventListener("click", () => {
        const mode = normalizeOverlapMergeMode(button.dataset.mergeValue);
        pendingMidiSettings.channels[i].overlapMergeMode = mode;
        pendingMidiSettings.channels[i].overlapMerge = mode !== "none";
        updateMidiRoleControls();
        scheduleMidiConvertRequest();
        renderMidiRoleList();
      }));
      midiRoleList.appendChild(row);
    }
    scheduleMidiInstrumentListHeightSync();
  }

  function syncMidiInstrumentListHeight() {
    if (!midiRoleList || !midiChannelList) return;
    if (document.body?.classList?.contains("player-ui")) {
      midiChannelList.style.height = "";
      midiChannelList.style.minHeight = "";
      midiChannelList.style.maxHeight = "";
      return;
    }
    const resetHeight = () => {
      midiChannelList.style.height = "";
      midiChannelList.style.minHeight = "";
      midiChannelList.style.maxHeight = "";
    };
    if (window.matchMedia?.("(max-width: 980px)")?.matches) {
      resetHeight();
      return;
    }

    const leftPanel = midiRoleList.closest(".midi-left-panel");
    const rightPanel = midiChannelList.closest(".midi-right-panel");
    const rightHead = rightPanel?.querySelector(".dialog-section-head");
    if (!leftPanel || !rightPanel || !rightHead) {
      resetHeight();
      return;
    }

    // 오른쪽 악기 목록은 내용이 많아도 Dialog/Grid 높이를 키우지 않도록 먼저 임시로 0px에 가깝게 고정한다.
    // 그 상태에서 왼쪽 전체 파트(Export 콤보 + 안내 + 6개 채널)의 자연 높이를 측정해 오른쪽 하단을 맞춘다.
    const previousHeight = midiChannelList.style.height;
    const previousMinHeight = midiChannelList.style.minHeight;
    const previousMaxHeight = midiChannelList.style.maxHeight;
    midiChannelList.style.height = "1px";
    midiChannelList.style.minHeight = "0px";
    midiChannelList.style.maxHeight = "1px";

    const leftHeight = Math.ceil(leftPanel.getBoundingClientRect().height || 0);
    const headHeight = Math.ceil(rightHead.getBoundingClientRect().height || 0);
    if (!leftHeight || !headHeight) {
      midiChannelList.style.height = previousHeight;
      midiChannelList.style.minHeight = previousMinHeight;
      midiChannelList.style.maxHeight = previousMaxHeight;
      return;
    }

    const styles = window.getComputedStyle(rightPanel);
    const rowGap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
    const availableHeight = Math.max(160, leftHeight - headHeight - rowGap);
    const height = `${Math.ceil(availableHeight)}px`;
    midiChannelList.style.height = height;
    midiChannelList.style.minHeight = height;
    midiChannelList.style.maxHeight = height;
  }

  function scheduleMidiInstrumentListHeightSync() {
    requestAnimationFrame(() => syncMidiInstrumentListHeight());
  }

  function updateMidiChannelRole(index, role) {
    if (!pendingMidiSettings) return;
    const setting = pendingMidiSettings.channels[index];
    const requestedRole = String(role || "auto").toLowerCase();
    setting.role = ["auto", "high", "low"].includes(requestedRole) ? requestedRole : "auto";
    updateMidiRoleControls();
    scheduleMidiConvertRequest();
  }

  function normalizeOverlapMergeMode(value) {
    if (value === true || value === "true") return "all";
    if (value === false || value === "false") return "none";
    const mode = String(value || "all").toLowerCase();
    return OVERLAP_MERGE_OPTIONS.some(opt => opt.value === mode) ? mode : "all";
  }


  function getMidiGroupSelectableChannels(group) {
    if (!pendingMidiSettings || !group) return [];
    return Array.from({ length: 6 }, (_, i) => ({
      index: i,
      label: PART_LABELS[i] || i18nText("ui.numbered", [i + 1]),
      selected: Boolean(pendingMidiSettings.channels[i]?.selectedInstrumentGroups?.has(group.id))
    }));
  }

  function renderMidiGroupChannelButtons(group) {
    const items = getMidiGroupSelectableChannels(group);
    if (!items.length) return "";
    const shortLabel = (item) => item.index === 0 ? i18nText("ui.mel") : String(item.index);
    return items.map(item => `
      <button
        class="midi-part-chip midi-part-toggle wb13-instrument-channel-button part-${item.index}${item.selected ? " selected" : ""}"
        type="button"
        data-midi-group-channel="${item.index}"
        aria-pressed="${item.selected ? "true" : "false"}"
        aria-label="${escapeHtml(i18nText("aria.select_item", [item.label]))}"
        title="${escapeHtml(item.label)}"
        style="--wb13-channel-color:var(--part${item.index})"
      >${escapeHtml(shortLabel(item))}</button>
    `).join("");
  }

  function toggleMidiGroupChannel(groupId, channelIndex, sourceButton = null) {
    if (!pendingMidiSettings) return;
    const index = clampInt(Number(channelIndex), 0, 5);
    const group = pendingMidiSettings.groups.find(item => String(item.id) === String(groupId));
    const setting = pendingMidiSettings.channels[index];
    if (!group || !setting) return;
    if (setting.selectedInstrumentGroups.has(group.id)) setting.selectedInstrumentGroups.delete(group.id);
    else setting.selectedInstrumentGroups.add(group.id);
    const selected = setting.selectedInstrumentGroups.has(group.id);
    if (sourceButton) {
      sourceButton.classList.toggle("selected", selected);
      sourceButton.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    updateMidiRoleControls();
    scheduleMidiConvertRequest();
  }

  function getAllowedMidiGroupsForSetting(setting) {
    if (!pendingMidiSettings || !setting) return [];
    return pendingMidiSettings.groups;
  }


  function getMidiInstrumentCategory(group) {
    if (!group) return "other";
    if (group.isDrumNoteGroup || Number.isInteger(group.drumMidi)) return "drums";
    const rawProgram = Number(group.program);
    const hasProgram = Number.isFinite(rawProgram);
    const program = hasProgram ? clampInt(rawProgram, 0, 127) : null;
    const name = String(group.instrumentName || group.programText || "").toLowerCase();

    if (hasProgram) {
      if ([52, 53, 54, 85, 91, 101, 121, 123].includes(program)) return "vocal";
      if ((program >= 0 && program <= 7) || (program >= 16 && program <= 20) || program === 21 || program === 23) return "keyboard";
      if ((program >= 24 && program <= 46) || (program >= 48 && program <= 51) || (program >= 104 && program <= 107) || program === 110) return "strings";
      if (program === 22 || (program >= 56 && program <= 79) || program === 109 || program === 111) return "winds";
    }

    if (/(choir|chorus|voice|vocal|vocoder|aahs?|oohs?|sing|singer|chant|breath|bird|goblin|합창|보컬|목소리|코러스|성악|人声|人聲|合唱|ボーカル|コーラス|声)/i.test(name)) return "vocal";
    if (/(piano|keyboard|organ|harpsichord|clavinet|clavi|accordion)/i.test(name)) return "keyboard";
    if (/(bassoon|trumpet|trombone|tuba|horn|brass|sax|oboe|clarinet|piccolo|flute|recorder|pipe|whistle|ocarina|harmonica|shanai|bagpipe|bag pipe)/i.test(name)) return "winds";
    if (/(guitar|\bbass\b|violin|viola|cello|contrabass|string|harp|sitar|banjo|shamisen|koto|fiddle)/i.test(name)) return "strings";
    return "other";
  }

  function sortMidiInstrumentGroups(groups) {
    return [...(groups || [])].sort((a, b) => {
      const ca = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(a));
      const cb = MIDI_INSTRUMENT_CATEGORY_ORDER.indexOf(getMidiInstrumentCategory(b));
      const oa = ca >= 0 ? ca : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      const ob = cb >= 0 ? cb : MIDI_INSTRUMENT_CATEGORY_ORDER.length;
      return oa - ob
        || (Number(a.bankMsb) || 0) - (Number(b.bankMsb) || 0)
        || (Number(a.bankLsb) || 0) - (Number(b.bankLsb) || 0)
        || (Number(a.program) || 0) - (Number(b.program) || 0)
        || (Number.isInteger(a.drumMidi) ? a.drumMidi : -1) - (Number.isInteger(b.drumMidi) ? b.drumMidi : -1)
        || String(a.instrumentName || a.programText || "").localeCompare(String(b.instrumentName || b.programText || ""), "ko")
        || String(a.id).localeCompare(String(b.id));
    });
  }

  function setMidiBulkChannelButtonState(button, selected) {
    if (!button) return;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.classList.toggle("selected", selected);
  }

  function updateMidiBulkAllButtonState() {
    if (!midiBulkAllBtn) return;
    const allSelected = midiBulkChannelButtons.length > 0
      && midiBulkChannelButtons.every(button => button.getAttribute("aria-pressed") === "true");
    setMidiBulkChannelButtonState(midiBulkAllBtn, allSelected);
  }

  function updateMidiBulkAllInstrumentButtonState() {
    if (!midiBulkAllInstrumentBtn) return;
    const availableButtons = midiBulkInstrumentButtons.filter(button => !button.disabled);
    const allSelected = availableButtons.length > 0
      && availableButtons.every(button => button.getAttribute("aria-pressed") === "true");
    setMidiBulkChannelButtonState(midiBulkAllInstrumentBtn, allSelected);
  }

  function updateMidiBulkInstrumentAvailability() {
    const categoryCounts = new Map();
    for (const group of pendingMidiSettings?.groups || []) {
      const category = getMidiInstrumentCategory(group);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    let availableCount = 0;
    for (const button of midiBulkInstrumentButtons) {
      const category = String(button.dataset.midiBulkCategory || "");
      const count = categoryCounts.get(category) || 0;
      const disabled = count === 0;
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
      button.dataset.instrumentCount = String(count);
      if (disabled) setMidiBulkChannelButtonState(button, false);
      else availableCount += 1;
    }

    if (midiBulkAllInstrumentBtn) {
      midiBulkAllInstrumentBtn.disabled = availableCount === 0;
      midiBulkAllInstrumentBtn.setAttribute("aria-disabled", availableCount === 0 ? "true" : "false");
      if (availableCount === 0) setMidiBulkChannelButtonState(midiBulkAllInstrumentBtn, false);
    }
    updateMidiBulkAllInstrumentButtonState();
  }

  function openMidiBulkAssignDialog() {
    if (!pendingMidiSettings || midiConvertBusy || !midiBulkAssignDialog) return;
    for (const button of midiBulkChannelButtons) setMidiBulkChannelButtonState(button, false);
    updateMidiBulkAllButtonState();
    for (const button of midiBulkInstrumentButtons) setMidiBulkChannelButtonState(button, false);
    updateMidiBulkInstrumentAvailability();
    if (midiBulkAssignDialog.showModal) midiBulkAssignDialog.showModal();
  }

  function getMidiBulkTargetGroups(categories) {
    if (!pendingMidiSettings) return [];
    const targets = categories instanceof Set ? categories : new Set(categories || []);
    return pendingMidiSettings.groups.filter(group => targets.has(getMidiInstrumentCategory(group)));
  }

  function applyMidiBulkAssignment(checked) {
    if (!pendingMidiSettings) return;
    const channelIndexes = midiBulkChannelButtons
      .filter(button => button.getAttribute("aria-pressed") === "true")
      .map(button => clampInt(Number(button.dataset.midiBulkChannel), 0, 5));
    if (!channelIndexes.length) {
      showToast([i18nText("midi.bulk_assign"), i18nText("midi.choose_target_channel")].filter(Boolean).join(": "), "info");
      return;
    }
    const targetCategories = new Set(
      midiBulkInstrumentButtons
        .filter(button => !button.disabled && button.getAttribute("aria-pressed") === "true")
        .map(button => String(button.dataset.midiBulkCategory || ""))
        .filter(Boolean)
    );
    if (!targetCategories.size) {
      showToast([i18nText("midi.bulk_assign"), i18nText("midi.choose_target_instrument")].filter(Boolean).join(": "), "info");
      return;
    }
    const groups = getMidiBulkTargetGroups(targetCategories);
    for (const index of channelIndexes) {
      const selected = pendingMidiSettings.channels[index]?.selectedInstrumentGroups;
      if (!selected) continue;
      for (const group of groups) {
        if (checked) selected.add(group.id);
        else selected.delete(group.id);
      }
    }
    midiBulkAssignDialog?.close();
    renderMidiRoleList();
    renderActiveMidiInstrumentList();
    updateMidiRoleControls();
    scheduleMidiConvertRequest();
  }

  function renderActiveMidiInstrumentList() {
    if (!midiChannelList || !pendingMidiSettings) return;
    const groups = sortMidiInstrumentGroups(pendingMidiSettings.groups || []);
    if (midiInstrumentPanelTitle) midiInstrumentPanelTitle.textContent = i18nText("midi.instrument_channel_select");
    midiChannelList.innerHTML = "";
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "midi-instrument-empty";
      empty.textContent = i18nText("snd.no_inst");
      midiChannelList.appendChild(empty);
      return;
    }

    const makeRow = group => {
      const row = document.createElement("div");
      row.className = `midi-channel-row midi-instrument-row wb8-midi-instrument-row${getMidiInstrumentCategory(group) === "drums" ? " percussion" : ""}`;
      row.dataset.midiGroupId = String(group.id);
      const name = group.displayName || [group.instrumentName || group.programText || i18nText("snd.no_inst"), group.partName].filter(Boolean).join(" · ");
      row.innerHTML = `
        <div class="midi-instrument-selected-parts wb8-midi-instrument-channels" aria-label="${escapeHtml(i18nText("mml.chs"))}">${renderMidiGroupChannelButtons(group)}</div>
        <strong class="wb8-midi-instrument-name">${escapeHtml(name)}</strong>
        <span class="wb8-midi-instrument-count">${escapeHtml(i18nText("midi.note_count", [formatCount(group.noteCount)]))}</span>
        <button class="midi-preview-btn wb8-midi-listen" type="button" data-midi-preview="${escapeHtml(group.id)}" aria-label="${escapeHtml(i18nText("ui.listen"))}" title="${escapeHtml(i18nText("ui.listen"))}"><span class="shared-transport-icon shared-icon-play" aria-hidden="true"></span></button>
      `;
      row.querySelector("[data-midi-preview]")?.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        void previewMidiInstrument(group.id, ev.currentTarget, name);
      });
      row.querySelectorAll("[data-midi-group-channel]").forEach(button => {
        button.addEventListener("click", ev => {
          ev.preventDefault();
          ev.stopPropagation();
          toggleMidiGroupChannel(group.id, Number(button.dataset.midiGroupChannel), button);
        });
      });
      return row;
    };

    const grouped = new Map(MIDI_INSTRUMENT_CATEGORY_ORDER.map(key => [key, []]));
    for (const group of groups) {
      const key = getMidiInstrumentCategory(group);
      grouped.get(grouped.has(key) ? key : "other").push(group);
    }
    for (const key of MIDI_INSTRUMENT_CATEGORY_ORDER) {
      const items = grouped.get(key) || [];
      if (!items.length) continue;
      const label = i18nText(MIDI_INSTRUMENT_CATEGORY_LABEL_KEYS[key] || "midi.other_instruments");
      const section = document.createElement("details");
      section.dataset.midiCategory = key;
      section.open = midiInstrumentSectionOpenState.has(key) ? midiInstrumentSectionOpenState.get(key) !== false : true;
      section.className = `midi-instrument-section midi-instrument-category-section category-${key}`;
      section.innerHTML = `<summary class="midi-instrument-section-head"><strong>${escapeHtml(i18nText("ui.name_count", [label, formatCount(items.length)]))}</strong></summary>`;
      section.addEventListener("toggle", () => midiInstrumentSectionOpenState.set(key, section.open));
      for (const group of items) section.appendChild(makeRow(group));
      midiChannelList.appendChild(section);
    }
    scheduleMidiInstrumentListHeightSync();
  }


  async function previewMidiInstrument(groupId, triggerButton = null, previewLabel = "") {
    if (!pendingMidiImport) return;
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const normalizedGroupId = String(groupId || "");
    if (button && midiInstrumentPreviewButton === button && midiInstrumentPreviewGroupId === normalizedGroupId) {
      stopMidiPreview();
      return;
    }

    stopPlayback(false);
    stopMidiPreview();
    const previewToken = ++midiInstrumentPreviewToken;
    const label = String(previewLabel || "").trim()
      || String(pendingMidiSettings?.groups?.find(group => String(group.id) === normalizedGroupId)?.displayName || "").trim()
      || i18nText("snd.no_inst");
    setMidiInstrumentPreviewButton(button, normalizedGroupId);

    try {
      await loadDefaultSf2IfNeeded();
      if (previewToken !== midiInstrumentPreviewToken) return;
      const preview = buildMidiInstrumentPreview(pendingMidiImport.bytes, groupId, { maxSeconds: 8, tailSeconds: 0.75 });
      const ctx = await ensureAudioContext();
      if (previewToken !== midiInstrumentPreviewToken) return;
      const resolved = resolvePreviewPreset(preview);
      if (!resolved?.preset || !resolved?.soundBank) throw new Error(i18nText("snd.find_sf2_preset"));
      const prepared = resolved.isDrum
        ? prepareDrumNotes(
            ctx,
            resolved.soundBank,
            resolved.preset,
            preview.notes,
            resolved.fallbackSoundBank,
            resolved.fallbackPreset
          )
        : prepareNotes(ctx, resolved.soundBank, resolved.preset, preview.notes);
      if (!prepared.length) throw new Error(i18nText("snd.find_preview_sf2"));
      if (previewToken !== midiInstrumentPreviewToken) return;
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: preview.duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, preview.duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01,
        gainScale
      });
      if (previewToken !== midiInstrumentPreviewToken) {
        stopMidiPreview();
        return;
      }
      showToast(i18nText("midi.previewing", [label]), "info");
      const stopMs = Math.max(600, Math.min(12000, (result.maxEnd - ctx.currentTime + 0.25) * 1000));
      midiPreviewTimer = window.setTimeout(() => {
        if (previewToken === midiInstrumentPreviewToken) stopMidiPreview();
      }, stopMs);
    } catch (err) {
      if (previewToken !== midiInstrumentPreviewToken) return;
      stopMidiPreview();
      showToast([i18nText("snd.inst_preview"), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  function setMidiInstrumentPreviewButtonIcon(button, isPlaying) {
    if (!(button instanceof HTMLElement)) return;
    const label = isPlaying ? i18nText("midi.preview_stop") : i18nText("ui.listen");
    const icon = document.createElement("span");
    icon.className = `shared-transport-icon shared-icon-${isPlaying ? "stop" : "play"}`;
    icon.setAttribute("aria-hidden", "true");
    button.replaceChildren(icon);
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function setMidiInstrumentPreviewButton(button, groupId) {
    if (!(button instanceof HTMLElement)) return;
    midiInstrumentPreviewButton = button;
    midiInstrumentPreviewGroupId = String(groupId || "");
    setMidiInstrumentPreviewButtonIcon(button, true);
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
    button.disabled = false;
  }

  function resetMidiInstrumentPreviewButton() {
    if (!midiInstrumentPreviewButton) return;
    try {
      setMidiInstrumentPreviewButtonIcon(midiInstrumentPreviewButton, false);
      midiInstrumentPreviewButton.classList.remove("danger");
      midiInstrumentPreviewButton.setAttribute("aria-pressed", "false");
      midiInstrumentPreviewButton.disabled = false;
    } catch (_) {}
    midiInstrumentPreviewButton = null;
    midiInstrumentPreviewGroupId = "";
  }

  function resolveMidiBankPreset(bankMsb, bankLsb, program, options = {}) {
    const selectedPresets = Array.isArray(soundFont?.presets) ? soundFont.presets : [];
    const originalPresets = Array.isArray(defaultSoundFont?.presets) ? defaultSoundFont.presets : [];
    const msb = clampInt(Number(bankMsb) || 0, 0, 127);
    const lsb = clampInt(Number(bankLsb) || 0, 0, 127);
    const presetNumber = clampInt(Number(program) || 0, 0, 127);
    const preferDrum = Boolean(options.preferDrum);

    if (preferDrum) {
      // Percussion fallback is intentionally isolated from melodic Bank 0.
      // 1) selected SoundBank: requested drum kit
      // 2) bundled SoundBank: same drum kit
      // 3) bundled SoundBank: Standard Drum Kit (Bank 128 / Program 0)
      const selectedKit = selectedPresets.find(p => Number(p.bank) === 128 && Number(p.preset) === presetNumber) || null;
      const originalSameKit = originalPresets.find(p => Number(p.bank) === 128 && Number(p.preset) === presetNumber) || null;
      const originalStandardKit = originalPresets.find(p => Number(p.bank) === 128 && Number(p.preset) === 0) || null;

      if (selectedKit) {
        return {
          soundBank: soundFont,
          preset: selectedKit,
          isDrum: true,
          fallbackSoundBank: defaultSoundFont || null,
          fallbackPreset: originalStandardKit
        };
      }
      if (originalSameKit) {
        return {
          soundBank: defaultSoundFont,
          preset: originalSameKit,
          isDrum: true,
          fallbackSoundBank: defaultSoundFont,
          fallbackPreset: originalStandardKit
        };
      }
      if (originalStandardKit) {
        return {
          soundBank: defaultSoundFont,
          preset: originalStandardKit,
          isDrum: true,
          fallbackSoundBank: defaultSoundFont,
          fallbackPreset: originalStandardKit
        };
      }
      return null;
    }

    const exactBanks = [msb * 128 + lsb, lsb, msb];
    for (const bank of [...new Set(exactBanks)]) {
      const preset = selectedPresets.find(p => Number(p.bank) === bank && Number(p.preset) === presetNumber);
      if (preset) return { soundBank: soundFont, preset, isDrum: false, fallbackSoundBank: null, fallbackPreset: null };
    }

    // Melodic behavior is unchanged: bundled Bank 0 / same program, then Piano.
    const originalPreset = originalPresets.find(p => Number(p.bank) === 0 && Number(p.preset) === presetNumber)
      || originalPresets.find(p => Number(p.bank) === 0 && Number(p.preset) === 0)
      || null;
    return originalPreset
      ? { soundBank: soundFont, preset: originalPreset, isDrum: false, fallbackSoundBank: null, fallbackPreset: null }
      : null;
  }

  function resolvePreviewPreset(preview) {
    return resolveMidiBankPreset(
      preview?.bankMsb,
      preview?.bankLsb,
      preview?.program,
      { preferDrum: Boolean(preview?.isBeat) }
    );
  }

  function stopMidiPreview() {
    midiInstrumentPreviewToken += 1;
    if (midiPreviewTimer) {
      clearTimeout(midiPreviewTimer);
      midiPreviewTimer = 0;
    }
    const previewStopAt = audioCtx?.currentTime || 0;
    for (const item of midiPreviewSources) {
      const gainParam = item?.gain?.gain;
      if (audioCtx && gainParam) {
        const fadeEnd = previewStopAt + 0.012;
        try {
          if (typeof gainParam.cancelAndHoldAtTime === "function") gainParam.cancelAndHoldAtTime(previewStopAt);
          else gainParam.cancelScheduledValues(previewStopAt);
          gainParam.linearRampToValueAtTime(0.0001, fadeEnd);
        } catch {}
        try { item.source?.stop(fadeEnd + 0.004); } catch {}
      } else {
        try { item.source?.stop(); } catch {}
      }
    }
    midiPreviewSources = [];
    resetMidiInstrumentPreviewButton();
    resetMidiChannelPreviewButton();
    resetSplitPreviewButton();
  }

  function resetMidiChannelPreviewButton() {
    if (!midiChannelPreviewButton) return;
    try {
      midiChannelPreviewButton.textContent = midiChannelPreviewButtonText || i18nText("ui.listen");
      midiChannelPreviewButton.classList.remove("danger");
      midiChannelPreviewButton.setAttribute("aria-pressed", "false");
      midiChannelPreviewButton.disabled = false;
    } catch (_) {}
    midiChannelPreviewButton = null;
    midiChannelPreviewButtonText = "";
  }

  function resetSplitPreviewButton() {
    if (!splitPreviewButton) return;
    try {
      splitPreviewButton.textContent = splitPreviewButtonText || i18nText("ui.listen");
      splitPreviewButton.classList.remove("danger");
      splitPreviewButton.setAttribute("aria-pressed", "false");
      splitPreviewButton.disabled = false;
    } catch (_) {}
    splitPreviewButton = null;
    splitPreviewButtonText = "";
  }

  function setSplitPreviewButton(button) {
    if (!(button instanceof HTMLElement)) return;
    splitPreviewButton = button;
    splitPreviewButtonText = button.textContent || i18nText("ui.listen");
    button.textContent = i18nText("player.stop");
    button.classList.add("danger");
    button.setAttribute("aria-pressed", "true");
  }

  function updateMidiConvertSummary() {
    if (!midiConvertSummary || !pendingMidiImport) return;
    const overview = pendingMidiImport.overview || {};
    const sourceLabel = pendingMidiImport.name || getMidiImportSourceLabel(pendingMidiImport);
    const selectedChannelCount = pendingMidiSettings ? countActiveMidiExportChannels() : 0;
    midiConvertSummary.textContent = i18nText("midi.summary", [
      sourceLabel,
      formatCount(selectedChannelCount),
      formatCount(Number(overview.noteCount) || 0)
    ]);
  }

  function updateMidiConvertApplyState() {
    if (!midiConvertApply) return;
    const hasSelectedChannel = Boolean(pendingMidiSettings && countActiveMidiExportChannels() > 0);
    const disabled = midiConvertBusy || !hasSelectedChannel;
    midiConvertApply.disabled = disabled;
    midiConvertApply.setAttribute("aria-disabled", disabled ? "true" : "false");
    midiConvertApply.title = hasSelectedChannel ? "" : i18nText("midi.choose_target_channel");
  }

  function updateMidiRoleControls() {
    if (!pendingMidiSettings) {
      updateMidiConvertApplyState();
      return;
    }
    pendingMidiSettings.partCount = countActiveMidiExportChannels();
    updateMidiConvertSummary();
    updateMidiConvertApplyState();
  }

  function buildMidiPartSoundPreset(exportChannels, groups, partCount = 6) {
    const keys = defaultPartPresetKeys();
    const groupMap = new Map((groups || []).map(g => [String(g.id), g]));
    const count = clampInt(Number(partCount) || 6, 1, 6);
    const instrumentMap = window.MobibardInstrumentMap;

    for (let i = 0; i < count; i++) {
      const channel = exportChannels?.[i];
      const selected = Array.isArray(channel?.selectedInstrumentGroups)
        ? channel.selectedInstrumentGroups.map(id => groupMap.get(String(id))).filter(Boolean)
        : [];
      if (!selected.length) continue;

      // 설정 파일이 로드되어 있으면 선택된 모든 MIDI 악기의 노트 수를 합산해
      // 14개 마비노기 악기 중 가장 비중이 큰 대표 음색을 고른다.
      const mappedTarget = instrumentMap?.chooseTarget?.(selected);
      if (mappedTarget?.presetKey) {
        keys[i] = sanitizePresetKey(mappedTarget.presetKey);
        continue;
      }

      // 설정 파일이 없거나 잘못된 경우에도 범주 외 코드는 1번 피아노를 사용한다.
      keys[i] = DEFAULT_PART_PRESET_KEY;
    }
    return normalizePresetKeyArray(keys);
  }

  function rememberMidiPartSoundPreset(keys) {
    const selectedQuickMode = soundPresetMatch(partPresetKeys);
    const shouldApplyToCurrentSound = selectedQuickMode === "auto";
    midiPartPresetKeys = normalizePresetKeyArray(keys);
    midiPartPresetName = defaultMidiSoundPresetLabel();
    saveMidiPartSoundPresetPrefs();

    if (shouldApplyToCurrentSound) {
      partPresetKeys = normalizePresetKeyArray(midiPartPresetKeys);
      savePartSoundPrefs();
      updateSoundPresetControls();
      return true;
    }

    updateSoundPresetControls();
    return false;
  }

  function getMidiExportChannelConfigs() {
    if (!pendingMidiSettings) return [];
    const exportChannels = [];
    for (let i = 0; i < 6; i++) {
      const setting = pendingMidiSettings.channels[i];
      const allowedIds = new Set(getAllowedMidiGroupsForSetting(setting).map(g => g.id));
      const selected = Array.from(setting.selectedInstrumentGroups || []).filter(id => allowedIds.has(id));
      if (!selected.length) continue;
      const overlapMergeMode = normalizeOverlapMergeMode(setting.overlapMergeMode ?? setting.overlapMerge);
      exportChannels.push({
        sourcePartIndex: i,
        role: setting.role || "auto",
        overlapMergeMode,
        overlapMerge: overlapMergeMode !== "none",
        selectedInstrumentGroups: selected
      });
    }
    return exportChannels;
  }

  function countActiveMidiExportChannels() {
    return getMidiExportChannelConfigs().length;
  }

  function collectMidiConvertOptions() {
    const sourceLabel = getMidiImportSourceLabel();
    if (!pendingMidiSettings) throw new Error(i18nText("midi.settings_missing", [sourceLabel]));
    const exportChannels = getMidiExportChannelConfigs();
    if (!exportChannels.length) throw new Error(i18nText("mml.select_one"));
    const partCount = exportChannels.length;
    return {
      partCount,
      roles: exportChannels.map(ch => ch.role),
      exportChannels,
      quantizeDivision: Number(pendingMidiSettings.quantizeDivision) === 32 ? 32 : 64,
      sourceLabel
    };
  }

  function getMidiConvertSettingsSignature() {
    if (!pendingMidiSettings || !pendingMidiImport) return "";
    const channels = pendingMidiSettings.channels.map(channel => ({
      role: channel.role,
      overlap: normalizeOverlapMergeMode(channel.overlapMergeMode ?? channel.overlapMerge),
      groups: [...channel.selectedInstrumentGroups].map(String).sort()
    }));
    return JSON.stringify({
      source: `${pendingMidiImport.name || ""}|${pendingMidiImport.bytes?.byteLength || pendingMidiImport.bytes?.length || 0}`,
      quantize: Number(pendingMidiSettings.quantizeDivision) === 32 ? 32 : 64,
      channels
    });
  }

  function requestMidiConvert({ force = false } = {}) {
    if (!pendingMidiImport || !pendingMidiSettings) return;
    const signature = getMidiConvertSettingsSignature();
    if (!force && signature && signature === midiLastAppliedSignature) return;
    if (midiConvertBusy) {
      midiConvertQueued = true;
      return;
    }
    void applyMidiConvertDialog({ force });
  }

  function scheduleMidiConvertRequest() {
    clearTimeout(midiConvertRequestTimer);
    midiConvertRequestTimer = 0;
    try { window.dispatchEvent(new CustomEvent("mobibard:midi-settings-dirty")); } catch (_) {}
  }

  function finishMidiConvertRequest() {
    if (!midiConvertQueued) return;
    midiConvertQueued = false;
    setTimeout(() => requestMidiConvert(), 0);
  }

  async function applyMidiConvertDialog({ force = false } = {}) {
    if (!pendingMidiImport) return;
    if (midiConvertBusy) {
      midiConvertQueued = true;
      return;
    }
    const requestSignature = getMidiConvertSettingsSignature();
    if (!force && requestSignature && requestSignature === midiLastAppliedSignature) return;
    const sourceLabel = getMidiImportSourceLabel();
    const sourceType = pendingMidiImport?.sourceType || "midi";
    let options;
    try {
      options = collectMidiConvertOptions();
    } catch (err) {
      showToast([i18nText("midi.convert_fail_title", [sourceLabel]), shortError(err)].filter(Boolean).join(": "), "error");
      return;
    }

    const startedAt = performance.now();
    saveLastMidiConvertSettings(pendingMidiImport, pendingMidiSettings);
    stopMidiPreview();
    setMidiConvertBusy(true, i18nText("midi.converting", [sourceLabel]));
    await waitForBrowserPaint();

    try {
      stopPlayback(false);
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      const midiSoundPresetKeys = buildMidiPartSoundPreset(options.exportChannels, pendingMidiSettings?.groups || [], options.partCount);
      const normalized = normalizeImportedFullMml(result.mml);
      notifyPlayerUiSourceBaseline(normalized.mml, {
        name: pendingMidiImport.name,
        sourceType,
        sourceLabel,
        newSource: pendingMidiStartsNewSource
      });
      rememberSuggestedMmlSaveFileName(pendingMidiImport.name);
      googleDriveMmlFileName = "";
      rememberMidiPartSoundPreset(midiSoundPresetKeys);
      const midiGroupCount = Number(pendingMidiSettings?.groups?.length || 0);
      const saved = Math.max(0, Number(normalized.saved) || 0);
      midiLastAppliedSignature = requestSignature;
      midiAppliedSettingsSnapshot = cloneMidiPendingSettings(pendingMidiSettings);
      pendingMidiStartsNewSource = false;

      setMidiConvertBusy(false);
      try {
        window.dispatchEvent(new CustomEvent("mobibard:midi-convert-complete", {
          detail: {
            sourceType,
            sourceLabel,
            name: pendingMidiImport?.name || "",
            exportChannels: Number(options.partCount || 0),
            quantizeDivision: Number(options.quantizeDivision || 64),
            instrumentGroups: midiGroupCount,
            optimizedChars: saved,
            durationMs: Math.round((performance.now() - startedAt) * 10) / 10
          }
        }));
      } catch (_) {}
      finishMidiConvertRequest();
      return;
    } catch (err) {
      setMidiConvertBusy(false);
      showToast([i18nText("midi.convert_fail_title", [sourceLabel]), shortError(err)].filter(Boolean).join(": "), "error");
      finishMidiConvertRequest();
    }
  }

  function setMidiConvertBusy(busy, message = "") {
    midiConvertBusy = Boolean(busy);
    if (busy && message) showToast(String(message), "info");
    const controls = midiConvertDialog ? Array.from(midiConvertDialog.querySelectorAll("button, input, select")) : [];
    for (const control of controls) {
      if (busy) {
        if (!control.dataset.prevMidiBusyDisabled) {
          control.dataset.prevMidiBusyDisabled = control.disabled ? "1" : "0";
        }
        control.disabled = true;
      } else if (control.dataset.prevMidiBusyDisabled) {
        control.disabled = control.dataset.prevMidiBusyDisabled === "1";
        delete control.dataset.prevMidiBusyDisabled;
      }
    }
    // Source PlayerUi에서는 취소 버튼이 dialog 밖의 pending action bar로 이동되어 있으므로
    // 변환 중 상태를 별도로 동기화한다.
    if (midiConvertCancel) midiConvertCancel.disabled = Boolean(busy);
    if (midiConvertApply) {
      midiConvertApply.textContent = busy ? i18nText("ui.conv") : i18nText("ui.apply");
    }
    updateMidiConvertApplyState();
  }

  function waitForBrowserPaint() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame !== "function") {
        setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function loadUserSf2() {
    const file = sf2File?.files?.[0];
    if (!file) return;
    const previousSoundFont = soundFont;
    const previousSoundFontIsDefault = soundFontIsDefault;
    const previousSf2Name = sf2Name;
    stopPlayback(false);
    stopMidiPreview();
    setSoundFontControlsBusy(true);
    updateSoundFontUi(i18nText("snd.reading_soundbank"));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseSoundBank(bytes);
      soundFont = parsed;
      soundFontIsDefault = false;
      sf2Name = file.name || "SoundBank";
      updateSoundFontUi();
      if (partSoundDialog?.open) {
        draftPartPresetKeys = normalizePresetKeyArray(draftPartPresetKeys || partPresetKeys);
        renderPartSoundRows();
        updateSoundPresetControls();
      }
      try {
        const meta = await persistManualSoundBankCache(bytes, file);
        if (meta && isGoogleConnected()) void syncManualSoundBankSelectionToGoogle(bytes);
      } catch (cacheErr) {
        console.warn("[Mobibard] Failed to cache selected sound bank.", cacheErr);
      }
    } catch (err) {
      soundFont = previousSoundFont;
      soundFontIsDefault = previousSoundFontIsDefault;
      sf2Name = previousSf2Name;
      if (sf2File) sf2File.value = "";
      if (!soundFont) {
        soundFontIsDefault = true;
        sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
        try { await loadDefaultSf2IfNeeded(); } catch (_) {}
      }
      updateSoundFontUi();
      showToast([i18nText("snd.load_soundbank"), shortError(err)].filter(Boolean).join(": "), "error");
    } finally {
      setSoundFontControlsBusy(false);
    }
  }

  async function ensureDefaultSoundFont() {
    if (defaultSoundFont) return defaultSoundFont;
    defaultSoundFont = await loadEmbeddedSoundBank({ clearBase64: true });
    return defaultSoundFont;
  }

  async function loadDefaultSf2IfNeeded() {
    const original = await ensureDefaultSoundFont();
    if (!soundFont) {
      soundFont = original;
      soundFontIsDefault = true;
      sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
    }
    updateSoundFontUi();
  }

  async function openPartSoundDialog() {
    stopPlayback(false);
    stopMidiPreview();

    // 음색 파일을 읽지 못하더라도 설정 창 자체는 항상 연다.
    // 사용자는 이 창의 "불러오기" 버튼으로 SF2/SF3/DLS 파일을 교체할 수 있어야 한다.
    if (!soundFont) {
      updateSoundFontUi(i18nText("snd.reading_soundbank"));
      try {
        await loadDefaultSf2IfNeeded();
      } catch (_) {
        soundFont = null;
        soundFontIsDefault = true;
        sf2Name = DEFAULT_SOUND_BANK_FILE_NAME;
        updateSoundFontUi();
      }
    } else {
      updateSoundFontUi();
    }

    draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
    draftSoundPresetBaseId = findUserSoundPresetIdByKeys(draftPartPresetKeys);
    renderPartSoundRows();
    updateSoundPresetControls();
    if (partSoundDialog?.showModal) partSoundDialog.showModal();
    else showToast([i18nText("snd.ch_settings"), i18nText("cfg.browser_fail")].filter(Boolean).join(": "), "error");
  }

  async function previewPartPreset(key, partIndex = 0, triggerButton = null) {
    const button = triggerButton instanceof HTMLElement ? triggerButton : null;
    const originalText = button?.textContent || i18nText("ui.listen");
    try {
      stopPlayback(false);
      stopMidiPreview();
      if (button) {
        button.disabled = true;
        button.textContent = i18nText("ui.play");
      }
      await loadDefaultSf2IfNeeded();
      const preset = findPresetByKey(key);
      if (!preset) throw new Error(i18nText("snd.find_sf2_preset_2"));
      const ctx = await ensureAudioContext();
      const notes = buildPartPresetPreviewNotes(preset, partIndex);
      const prepared = prepareNotes(ctx, soundFont, preset, notes);
      if (!prepared.length) throw new Error(i18nText("snd.find_preview_sf2"));
      const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      const gainScale = computeAutoGainScale(prepared, { windowStart: 0, windowEnd: duration });
      const result = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.08,
        fromSec: 0,
        windowStart: 0,
        windowEnd: Math.max(0.5, duration + 0.1),
        destination: masterGain || ctx.destination,
        activeSources: midiPreviewSources,
        scheduledIds: new Set(),
        minLeadTime: 0.01,
        gainScale
      });
      const stopMs = Math.max(650, Math.min(6000, (result.maxEnd - ctx.currentTime + 0.25) * 1000));
      midiPreviewTimer = window.setTimeout(() => stopMidiPreview(), stopMs);
    } catch (err) {
      showToast([i18nText("snd.preview_fail"), shortError(err)].filter(Boolean).join(": "), "error");
    } finally {
      if (button) {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 350);
      }
    }
  }

  function buildPartPresetPreviewNotes(preset, partIndex = 0) {
    const part = clampInt(Number(partIndex) || 0, 0, 5);
    if (Number(preset?.bank) === 128) {
      return PART_PREVIEW_DRUM_NOTES.map((midi, i) => ({
        id: i,
        part,
        start: i * 0.18,
        durationSec: midi === 46 ? 0.2 : 0.13,
        midi,
        volume: midi === 42 ? 10 : 13
      }));
    }

    const range = getPresetPlayableRange(preset);
    const base = choosePreviewMelodyBaseMidi(range, PART_PREVIEW_MELODY_INTERVALS);
    let start = 0;
    return PART_PREVIEW_MELODY_INTERVALS.map((interval, i) => {
      const last = i === PART_PREVIEW_MELODY_INTERVALS.length - 1;
      const durationSec = last ? 0.34 : 0.18;
      const note = {
        id: i,
        part,
        start,
        durationSec,
        midi: clampInt(base + interval, range.min, range.max),
        volume: 13
      };
      start += last ? 0.34 : 0.2;
      return note;
    });
  }

  function getPresetPlayableRange(preset) {
    const regions = Array.isArray(preset?.regions) ? preset.regions : [];
    let min = 127;
    let max = 0;
    let found = false;
    for (const region of regions) {
      const keyRange = Array.isArray(region?.keyRange) ? region.keyRange : [0, 127];
      const lo = clampInt(Number(keyRange[0]), 0, 127);
      const hi = clampInt(Number(keyRange[1]), 0, 127);
      if (hi < lo) continue;
      min = Math.min(min, lo);
      max = Math.max(max, hi);
      found = true;
    }
    return found ? { min, max } : { min: 0, max: 127 };
  }

  function choosePreviewMelodyBaseMidi(range, intervals) {
    const min = clampInt(Number(range?.min), 0, 127);
    const max = clampInt(Number(range?.max), min, 127);
    const minInterval = Math.min(...intervals);
    const maxInterval = Math.max(...intervals);
    for (const base of [60, 48, 72, 36, 84, 24, 96]) {
      if (base + minInterval >= min && base + maxInterval <= max) return base;
    }
    const centered = Math.round((min + max - minInterval - maxInterval) / 2);
    return clampInt(centered, Math.max(0, min - minInterval), Math.min(127, max - maxInterval));
  }

  function applyPartSoundDialog() {
    if (!Array.isArray(draftPartPresetKeys)) draftPartPresetKeys = defaultPartPresetKeys();
    partPresetKeys = normalizePresetKeyArray(draftPartPresetKeys);
    savePartSoundPrefs();
    updateSoundPresetControls();
    rebuildSchedulePreviewSilently();
    partSoundDialog?.close();
    restartPlaybackAfterSoundChange();
  }

  function renderPartSoundRows() {
    if (!partSoundRows) return;
    const presets = getPresetOptions();
    partSoundRows.innerHTML = "";
    if (!presets.length) {
      const empty = document.createElement("div");
      empty.className = "part-sound-empty";
      empty.textContent = soundFont ? i18nText("snd.find_any") : i18nText("snd.load_or_replace");
      partSoundRows.appendChild(empty);
      return;
    }

    for (let i = 0; i < 6; i++) {
      const row = document.createElement("div");
      row.className = `part-sound-row part-${i}`;
      const label = document.createElement("label");
      label.className = "part-sound-label";
      label.htmlFor = `partSoundSelect${i}`;
      label.textContent = PART_LABELS[i] || i18nText("ui.numbered", [i + 1]);

      const select = document.createElement("select");
      select.id = `partSoundSelect${i}`;
      select.dataset.partPresetIndex = String(i);
      select.setAttribute("aria-label", i18nText("aria.sound", [PART_LABELS[i]]));
      const current = sanitizePresetKey(draftPartPresetKeys?.[i] || DEFAULT_PART_PRESET_KEY);
      const availableKeys = new Set(presets.map(p => p.key));
      const selectedKey = availableKeys.has(current) ? current : (availableKeys.has(DEFAULT_PART_PRESET_KEY) ? DEFAULT_PART_PRESET_KEY : presets[0].key);
      if (draftPartPresetKeys) draftPartPresetKeys[i] = selectedKey;
      for (const preset of presets) {
        const option = document.createElement("option");
        option.value = preset.key;
        option.textContent = preset.label;
        option.selected = preset.key === selectedKey;
        select.appendChild(option);
      }
      const previewButton = document.createElement("button");
      previewButton.className = "part-sound-preview-btn soft-tool-button";
      previewButton.type = "button";
      previewButton.textContent = i18nText("ui.listen");
      previewButton.setAttribute("aria-label", i18nText("aria.preview_selected_sound", [PART_LABELS[i]]));
      previewButton.addEventListener("click", (ev) => {
        ev.preventDefault();
        void previewPartPreset(select.value, i, previewButton);
      });

      select.addEventListener("change", () => {
        if (!draftPartPresetKeys) draftPartPresetKeys = normalizePresetKeyArray(partPresetKeys);
        draftPartPresetKeys[i] = sanitizePresetKey(select.value);
        updateSoundPresetControls();
        void previewPartPreset(select.value, i, previewButton);
      });

      const control = document.createElement("div");
      control.className = "part-sound-control";
      control.appendChild(select);
      control.appendChild(previewButton);

      row.appendChild(label);
      row.appendChild(control);
      partSoundRows.appendChild(row);
    }
  }

  function sanitizePresetKey(value) {
    const text = String(value == null ? DEFAULT_PART_PRESET_KEY : value).trim();
    const m = text.match(/^(\d{1,5}):(\d{1,5})$/);
    if (!m) return DEFAULT_PART_PRESET_KEY;
    const bank = clampInt(Number(m[1]), 0, 16383);
    const preset = clampInt(Number(m[2]), 0, 127);
    return `${bank}:${preset}`;
  }

  function presetKey(preset) {
    return `${clampInt(Number(preset?.bank ?? 0), 0, 16383)}:${clampInt(Number(preset?.preset ?? 0), 0, 127)}`;
  }

  function getPresetOptions() {
    if (!soundFont || !Array.isArray(soundFont.presets)) return [];
    const seen = new Set();
    return soundFont.presets
      .filter(p => p && Array.isArray(p.regions) && p.regions.length && (typeof soundFont.hasAudiblePreset !== "function" || soundFont.hasAudiblePreset(p)))
      .slice()
      .sort((a, b) => (a.bank - b.bank) || (a.preset - b.preset) || String(a.name || "").localeCompare(String(b.name || "")))
      .filter(p => {
        const key = presetKey(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(p => ({ key: presetKey(p), label: formatPresetLabel(p) }));
  }

  function formatPresetLabel(preset) {
    const bank = clampInt(Number(preset?.bank ?? 0), 0, 16383);
    const program = clampInt(Number(preset?.preset ?? 0), 0, 127);
    const name = String(preset?.name || i18nText("snd.unnamed_preset")).trim();
    const num = String(program + 1).padStart(3, "0");
    return bank === 0 ? `${num} ${name}` : `Bank ${bank} · ${num} ${name}`;
  }

  function findPresetByKey(key) {
    if (!soundFont) return null;
    const [bankText, presetText] = sanitizePresetKey(key).split(":");
    const bank = Number(bankText);
    const program = Number(presetText);
    return soundFont.presets.find(p => p.bank === bank && p.preset === program)
      || (bank === 0 ? soundFont.findPreset(program) : null)
      || null;
  }

  function getPartPreset(partIndex) {
    const key = partPresetKeys[clampInt(Number(partIndex), 0, 5)] || DEFAULT_PART_PRESET_KEY;
    return findPresetByKey(key) || soundFont?.findPreset(0) || soundFont?.presets?.[0] || null;
  }

  function computeAutoGainScale(prepared, options = {}) {
    const list = Array.isArray(prepared) ? prepared : [];
    if (!list.length) return 1;
    const windowStart = Number.isFinite(Number(options.windowStart)) ? Number(options.windowStart) : 0;
    const windowEnd = Number.isFinite(Number(options.windowEnd)) ? Number(options.windowEnd) : Infinity;
    const events = [];
    for (const n of list) {
      const start = Number(n?.start);
      const end = Number(n?.noteEnd ?? (Number(n?.start) + Number(n?.durationSec || 0)));
      const gain = Math.max(0, Number(n?.gainValue) || 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= windowStart || start >= windowEnd || gain <= 0) continue;
      events.push({ t: Math.max(start, windowStart), deltaCount: 1 });
      events.push({ t: Math.min(end, windowEnd), deltaCount: -1 });
    }
    if (!events.length) return 1;
    events.sort((a, b) => a.t - b.t || a.deltaCount - b.deltaCount);
    let simultaneous = 0;
    let peakSimultaneous = 0;
    for (const ev of events) {
      simultaneous += ev.deltaCount;
      if (simultaneous > peakSimultaneous) peakSimultaneous = simultaneous;
    }
    if (peakSimultaneous <= 3) return 1;

    // 1~3개 동시 발음은 원음을 유지하고, 4개 이상부터만 완만하게 낮춘다.
    const scale = Math.sqrt(3 / peakSimultaneous);
    return Math.max(0.35, Math.min(1, scale));
  }

  function prepareNotesWithPartPresets(ctx, notes) {
    const prepared = [];
    const list = Array.isArray(notes) ? notes : [];
    for (let part = 0; part < 6; part++) {
      // 음소거 채널도 미리 준비한다. 재생 중 음소거 해제 시 재스케줄 없이 즉시 소리가 나야 한다.
      const partNotes = list.filter(n => Number(n.part) === part);
      if (!partNotes.length) continue;
      const preset = getPartPreset(part);
      if (!preset) continue;
      prepared.push(...prepareNotes(ctx, soundFont, preset, partNotes));
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    for (let i = 0; i < prepared.length; i++) prepared[i].id = i;
    return prepared;
  }


  function prepareOriginalMidiNotes(ctx, notes) {
    const prepared = [];
    const byPreset = new Map();
    for (const note of (Array.isArray(notes) ? notes : [])) {
      const part = clampInt(Number(note?.part ?? note?.channel ?? 0), 0, 5);
      if (partMuteStates[part]) continue;
      const resolved = resolvePreviewPreset(note);
      if (!resolved?.preset || !resolved?.soundBank) continue;
      const sourceTag = resolved.soundBank === soundFont ? "selected" : "default";
      const key = `${sourceTag}:${resolved.preset.bank}:${resolved.preset.preset}:${note.isBeat ? 1 : 0}`;
      if (!byPreset.has(key)) byPreset.set(key, { ...resolved, notes: [] });
      byPreset.get(key).notes.push({ ...note, part });
    }
    for (const item of byPreset.values()) {
      if (item.isDrum) {
        prepared.push(...prepareDrumNotes(
          ctx,
          item.soundBank,
          item.preset,
          item.notes,
          item.fallbackSoundBank,
          item.fallbackPreset
        ));
      } else {
        prepared.push(...prepareNotes(ctx, item.soundBank, item.preset, item.notes));
      }
    }
    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    for (let index = 0; index < prepared.length; index++) prepared[index].id = index;
    return prepared;
  }

  function buildTemporalIndex(items) {
    const list = Array.from(items || []).slice().sort((a, b) => (Number(a?.start) || 0) - (Number(b?.start) || 0));
    const starts = new Array(list.length);
    const prefixMaxEnd = new Array(list.length);
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < list.length; i++) {
      const start = Math.max(0, Number(list[i]?.start) || 0);
      const end = start + Math.max(0, Number(list[i]?.durationSec) || 0);
      starts[i] = start;
      maxEnd = Math.max(maxEnd, end);
      prefixMaxEnd[i] = maxEnd;
    }
    return { list, starts, prefixMaxEnd };
  }

  function firstTemporalOverlapIndex(index, windowStart) {
    const prefix = index?.prefixMaxEnd || [];
    const target = Number(windowStart) || 0;
    let lo = 0;
    let hi = prefix.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefix[mid] >= target - 0.0000001) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function firstTemporalStartAtOrAfter(index, windowEnd) {
    const starts = index?.starts || [];
    const target = Number(windowEnd) || 0;
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] >= target - 0.0000001) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function temporalWindow(index, windowStart, windowEnd) {
    if (!index?.list?.length) return { list: [], start: 0, end: 0 };
    const start = firstTemporalOverlapIndex(index, windowStart);
    const end = firstTemporalStartAtOrAfter(index, windowEnd);
    return { list: index.list, start, end: Math.max(start, end) };
  }

  function ensureScheduleTemporalIndexes() {
    if (scheduleTemporalIndexVersion === scheduleCacheVersion) {
      return { notes: scheduleNoteTemporalIndex, rests: scheduleRestTemporalIndex };
    }
    scheduleTemporalIndexVersion = scheduleCacheVersion;
    scheduleNoteTemporalIndex = buildTemporalIndex(scheduleCache?.notes || []);
    scheduleRestTemporalIndex = buildTemporalIndex(scheduleCache?.rests || []);
    return { notes: scheduleNoteTemporalIndex, rests: scheduleRestTemporalIndex };
  }

  function rebuildPreparedPlaybackIndex() {
    preparedPlaybackPrefixMaxEnd = new Array(preparedNotes.length);
    let maxEnd = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < preparedNotes.length; i++) {
      maxEnd = Math.max(maxEnd, Number(preparedNotes[i]?.noteEnd) || Number(preparedNotes[i]?.start) || 0);
      preparedPlaybackPrefixMaxEnd[i] = maxEnd;
    }
  }

  function findFirstPreparedOverlapIndex(time) {
    const target = Math.max(0, Number(time) || 0);
    let lo = 0;
    let hi = preparedPlaybackPrefixMaxEnd.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (preparedPlaybackPrefixMaxEnd[mid] > target + 0.0001) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function preparePlaybackNotes(ctx, notes) {
    return playbackMidiOriginalOverride
      ? prepareOriginalMidiNotes(ctx, notes)
      : prepareNotesWithPartPresets(ctx, notes);
  }

  function areAllScheduledNotesMuted(notes) {
    const list = Array.isArray(notes) ? notes : [];
    return list.length > 0 && list.every(n => {
      const part = clampInt(Number(n?.part ?? 0), 0, 5);
      return Boolean(partMuteStates[part]);
    });
  }

  async function playFromCurrent() {
    try {
      stopMidiPreview();
      stopPlayback(false);
      cancelScheduledEditorDerivedRefresh();
      await loadDefaultSf2IfNeeded();
      scheduleCache = createScheduleFromEditor();
      scheduleCacheVersion++;
      updateTempoMarkers(scheduleCache.tempoMarkers, scheduleCache.duration);
      requestTimelineActivityRefresh(true);
      if (scheduleCache.notes.length === 0) throw new Error(i18nText("mml.no_notes"));
      if (currentOffset >= scheduleCache.duration - 0.05) currentOffset = 0;
      const ctx = await ensureAudioContext();
      if (!soundFont.presets?.length) throw new Error(i18nText("snd.find_avail"));
      preparedNotes = preparePlaybackNotes(ctx, scheduleCache.notes);
      rebuildPreparedPlaybackIndex();
      playbackScheduleCursor = findFirstPreparedOverlapIndex(currentOffset);
      playbackAutoGainScale = computeAutoGainScale(preparedNotes, { windowStart: 0, windowEnd: scheduleCache.duration || 0 });
      const allScheduledNotesMuted = areAllScheduledNotesMuted(scheduleCache.notes);
      if (preparedNotes.length === 0 && !allScheduledNotesMuted) throw new Error(i18nText("mml.no_audible"));

      const baseTime = ctx.currentTime + PLAY_START_DELAY;
      activeSources = [];
      scheduledNoteIds = new Set();
      playContextStart = baseTime;
      playOffsetStart = currentOffset;
      isPlaying = true;
      updatePlayButton();
      updateProgressUi(currentOffset, scheduleCache.duration);
      schedulePlaybackWindow();
      startProgressLoop();
    } catch (err) {
      stopPlayback(false);
      showToast([i18nText("play.fail"), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  function schedulePlaybackWindow() {
    if (!isPlaying || !audioCtx || !scheduleCache) return;
    if (schedulerTimer) clearTimeout(schedulerTimer);

    const nowOffset = getCurrentPlaybackOffset();
    const duration = scheduleCache.duration || 0;
    if (duration > 0 && nowOffset >= duration - 0.01) {
      finishPlayback();
      return;
    }

    const windowStart = Math.max(playOffsetStart, nowOffset - 0.03);
    const windowEnd = Math.min(duration, nowOffset + SCHEDULE_AHEAD_SEC * playbackSpeed);
    const scheduled = schedulePreparedNotes(audioCtx, preparedNotes, {
      baseTime: playContextStart,
      fromSec: playOffsetStart,
      playbackSpeed,
      windowStart,
      windowEnd,
      startIndex: playbackScheduleCursor,
      destination: masterGain || audioCtx.destination,
      destinationsByPart: partPlaybackGains,
      activeSources,
      scheduledIds: scheduledNoteIds,
      minLeadTime: 0.018,
      gainScale: playbackAutoGainScale
    });
    if (Number.isInteger(scheduled?.nextIndex)) playbackScheduleCursor = scheduled.nextIndex;

    schedulerTimer = setTimeout(schedulePlaybackWindow, SCHEDULE_INTERVAL_MS);
  }

  function invalidateEditorDerivedState() {
    editorContentVersion++;
    scheduleTemporalIndexVersion = -1;
    pianoRollTempoMapCacheVersion = -1;
    editorAnalysisCache = {
      source: "",
      parts: null,
      parsed: null,
      schedule: null,
      volumeCounts: null
    };
    if (!playbackSourceOverride) playbackAnalysisCache = { source: "", schedule: null };
    mainHighlightRenderSignature = "";
    partHighlightRenderSignatures = Array.from({ length: 6 }, () => "");
  }

  function getEditorDerivedState({ needSchedule = false, needVolumeCounts = false } = {}) {
    const source = normalizeMmlForDisplay(mainMml?.value || "");
    if (editorAnalysisCache.source !== source) {
      editorAnalysisCache = {
        source,
        parts: null,
        parsed: null,
        schedule: null,
        volumeCounts: null
      };
    }

    if (!editorAnalysisCache.parts) {
      const parts = splitMmlParts(source).slice(0, 6).map(normalizePartText);
      while (parts.length < 6) parts.push("");
      editorAnalysisCache.parts = parts;
    }

    if ((needSchedule || needVolumeCounts) && !editorAnalysisCache.parsed) {
      editorAnalysisCache.parsed = parseMabinogiMml(source);
    }

    if (needSchedule && !editorAnalysisCache.schedule) {
      const scheduled = buildSchedule(editorAnalysisCache.parsed);
      const noteDuration = (scheduled.notes || []).reduce((m, n) => Math.max(m, n.start + n.durationSec), 0);
      const restDuration = (scheduled.rests || []).reduce((m, r) => Math.max(m, r.start + r.durationSec), 0);
      const duration = Math.max(Number(scheduled.duration) || 0, noteDuration, restDuration);
      editorAnalysisCache.schedule = { ...scheduled, duration };
    }

    if (needVolumeCounts && !editorAnalysisCache.volumeCounts) {
      const counts = Array(16).fill(0);
      for (const part of (editorAnalysisCache.parsed?.parts || [])) {
        for (const note of (part.notes || [])) {
          const volume = clampInt(Number(note.volume ?? 8), 0, 15);
          counts[volume]++;
        }
      }
      editorAnalysisCache.volumeCounts = counts;
    }

    return editorAnalysisCache;
  }

  function createScheduleFromEditor() {
    if (playbackMidiOriginalOverride) {
      const originalSchedule = getPlayerUiOriginalMidiSchedule();
      if (!originalSchedule) throw new Error(i18nText("midi.err_no_preview_notes"));
      return originalSchedule;
    }
    if (!playbackSourceOverride) {
      normalizeTextareaCommands(mainMml);
      return getEditorDerivedState({ needSchedule: true }).schedule;
    }

    const source = normalizeMmlForDisplay(playbackSourceOverride);
    if (playbackAnalysisCache.source !== source || !playbackAnalysisCache.schedule) {
      const parsed = parseMabinogiMml(source);
      const scheduled = buildSchedule(parsed);
      const noteDuration = (scheduled.notes || []).reduce((max, note) => Math.max(max, Number(note.start) + Number(note.durationSec || 0)), 0);
      const restDuration = (scheduled.rests || []).reduce((max, rest) => Math.max(max, Number(rest.start) + Number(rest.durationSec || 0)), 0);
      const duration = Math.max(Number(scheduled.duration) || 0, noteDuration, restDuration);
      playbackAnalysisCache = { source, schedule: { ...scheduled, duration } };
    }
    return playbackAnalysisCache.schedule;
  }

  function stopPlayback(updateOffset = true) {
    stopSeekPreviewAudio();
    for (const t of activeTimers) clearTimeout(t);
    activeTimers = [];
    if (schedulerTimer) clearTimeout(schedulerTimer);
    schedulerTimer = 0;
    if (seekRestartTimer) clearTimeout(seekRestartTimer);
    seekRestartTimer = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (audioCtx && isPlaying && updateOffset) currentOffset = getCurrentPlaybackOffset();
    const stopAt = audioCtx?.currentTime || 0;
    for (const item of activeSources) {
      const gainParam = item?.gain?.gain;
      if (audioCtx && gainParam) {
        const fadeEnd = stopAt + 0.012;
        try {
          if (typeof gainParam.cancelAndHoldAtTime === "function") gainParam.cancelAndHoldAtTime(stopAt);
          else gainParam.cancelScheduledValues(stopAt);
          gainParam.linearRampToValueAtTime(0.0001, fadeEnd);
        } catch {}
        try { item.source.stop(fadeEnd + 0.004); } catch {}
      } else {
        try { item.source.stop(); } catch {}
      }
    }
    activeSources = [];
    preparedPlaybackPrefixMaxEnd = [];
    playbackScheduleCursor = 0;
    scheduledNoteIds = new Set();
    playbackAutoGainScale = 1;
    isPlaying = false;
    updatePlayButton();
    if (scheduleCache) updateProgressUi(currentOffset, scheduleCache.duration);
  }

  function finishPlayback() {
    const shouldLoop = Boolean(loopPlayback?.checked) && Boolean(scheduleCache?.duration);
    stopPlayback(false);
    if (shouldLoop) {
      currentOffset = 0;
      updateProgressUi(0, scheduleCache?.duration || 0);
      setTimeout(() => {
        if (loopPlayback?.checked) void playFromCurrent();
      }, 20);
      return;
    }
    currentOffset = scheduleCache?.duration || 0;
    updateProgressUi(currentOffset, scheduleCache?.duration || 0);
  }

  async function rewindToStart() {
    const wasPlaying = isPlaying;
    stopPlayback(false);
    currentOffset = 0;
    const duration = scheduleCache?.duration || Number(progressSlider.max) || 0;
    updateProgressUi(0, duration);
    if (wasPlaying) await playFromCurrent();
  }

  function quantizePlaybackTime(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  }

  function stopSeekPreviewSources() {
    const stopAt = audioCtx?.currentTime || 0;
    for (const item of seekPreviewSources) {
      try {
        const gainParam = item?.gain?.gain;
        if (audioCtx && gainParam) {
          gainParam.cancelScheduledValues(stopAt);
          gainParam.setTargetAtTime(0.0001, stopAt, 0.008);
          item.source.stop(stopAt + 0.035);
        } else {
          item?.source?.stop?.();
        }
      } catch (_) {}
    }
    seekPreviewSources = [];
  }

  function stopSeekPreviewAudio() {
    if (seekPreviewTimer) clearTimeout(seekPreviewTimer);
    seekPreviewTimer = 0;
    seekPreviewToken++;
    stopSeekPreviewSources();
  }

  function queueSeekPreview(offset) {
    if (isPlaying) return;
    const bucket = Math.round(Math.max(0, Number(offset) || 0) * 24);
    if (bucket === seekPreviewLastBucket) return;
    seekPreviewLastBucket = bucket;
    if (seekPreviewTimer) clearTimeout(seekPreviewTimer);
    const token = ++seekPreviewToken;
    seekPreviewTimer = setTimeout(() => {
      seekPreviewTimer = 0;
      void auditionSeekPosition(offset, token);
    }, 34);
  }

  async function auditionSeekPosition(offset, token) {
    try {
      await loadDefaultSf2IfNeeded();
      if (token !== seekPreviewToken || isPlaying) return;
      const ctx = await ensureAudioContext();
      if (token !== seekPreviewToken || isPlaying || !soundFont?.presets?.length) return;
      if (!scheduleCache) {
        scheduleCache = createScheduleFromEditor();
        scheduleCacheVersion++;
        requestTimelineActivityRefresh(true);
      }
      const time = Math.max(0, Number(offset) || 0);
      const noteIndex = ensureScheduleTemporalIndexes().notes;
      const activeWindow = temporalWindow(noteIndex, time - 0.025, time + 0.0451);
      let candidates = [];
      for (let index = activeWindow.start; index < activeWindow.end; index++) {
        const note = activeWindow.list[index];
        const part = clampInt(Number(note?.part ?? 0), 0, 5);
        if (partMuteStates[part] || Number(note?.volume ?? 0) <= 0) continue;
        const start = Math.max(0, Number(note?.start) || 0);
        const end = start + Math.max(0, Number(note?.durationSec) || 0);
        if (start <= time + 0.045 && end >= time - 0.025) candidates.push(note);
      }
      if (!candidates.length) {
        const futureWindow = temporalWindow(noteIndex, time - 0.000001, time + 0.1201);
        for (let index = futureWindow.start; index < futureWindow.end; index++) {
          const note = futureWindow.list[index];
          const part = clampInt(Number(note?.part ?? 0), 0, 5);
          const start = Math.max(0, Number(note?.start) || 0);
          if (!partMuteStates[part] && Number(note?.volume ?? 0) > 0 && start >= time && start <= time + 0.12) candidates.push(note);
        }
      }
      candidates.sort((a, b) => Math.abs((Number(a.start) || 0) - time) - Math.abs((Number(b.start) || 0) - time));
      const unique = [];
      const seen = new Set();
      for (const note of candidates) {
        const key = `${Number(note?.part) || 0}:${Number(note?.midi) || 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(note);
        if (unique.length >= 10) break;
      }
      if (!unique.length || token !== seekPreviewToken) return;
      const previewNotes = unique.map((note, index) => ({
        ...note,
        id: index,
        start: 0,
        durationSec: Math.max(0.08, Math.min(0.18, Number(note?.durationSec) || 0.12))
      }));
      const prepared = preparePlaybackNotes(ctx, previewNotes);
      if (!prepared.length || token !== seekPreviewToken) return;
      stopSeekPreviewSources();
      const seekPreviewResult = schedulePreparedNotes(ctx, prepared, {
        baseTime: ctx.currentTime + 0.012,
        fromSec: 0,
        playbackSpeed: 1,
        windowStart: 0,
        windowEnd: 0.2,
        destination: masterGain || ctx.destination,
        destinationsByPart: partPlaybackGains,
        activeSources: seekPreviewSources,
        minLeadTime: 0.008,
        gainScale: 0.58
      });
      if (seekPreviewResult?.count) {
        window.dispatchEvent(new CustomEvent("mobibard:seek-audition", {
          detail: { offset: time, noteCount: seekPreviewResult.count }
        }));
      }
    } catch (_) {}
  }

  function resetPlaybackTimelineForNewContext() {
    // A newly loaded/restored state is a new playback context. Do not carry the
    // previous song's seek position or pending seek-preview state forward.
    if (seekRestartTimer) clearTimeout(seekRestartTimer);
    seekRestartTimer = 0;
    stopSeekPreviewAudio();
    seekPreviewLastBucket = -1;
    isSeeking = false;
    if (isPlaying) stopPlayback(false);
    currentOffset = 0;
    playOffsetStart = 0;
    playContextStart = 0;
    playbackScheduleCursor = 0;
    clearPlaybackCodeHighlight();
    const duration = Math.max(0, Number(scheduleCache?.duration) || Number(progressSlider?.max) || 0);
    updateProgressUi(0, duration);
  }

  // source-baseline is also consumed by the layout shell in a separate IIFE.
  // Keep playback reset in the player-app scope and run it in capture phase so
  // every new source (local file, Drive, paste, etc.) is reset before the
  // layout shell starts applying the new MML.
  window.addEventListener("mobibard:source-baseline", event => {
    if (event?.detail?.newSource === true) resetPlaybackTimelineForNewContext();
  }, true);
  window.addEventListener("mobibard:playback-context-reset", () => {
    resetPlaybackTimelineForNewContext();
  }, true);

  function handleSeekInput(restart) {
    const duration = scheduleCache?.duration || Number(progressSlider.max) || 0;
    currentOffset = Math.max(0, Math.min(duration, quantizePlaybackTime(progressSlider.value)));
    updateProgressUi(currentOffset, duration);
    if (restart) stopSeekPreviewAudio();
    else queueSeekPreview(currentOffset);
    if (restart && isPlaying) {
      clearTimeout(seekRestartTimer);
      const seekTo = currentOffset;
      seekRestartTimer = setTimeout(() => {
        currentOffset = seekTo;
        void playFromCurrent();
      }, 10);
    }
  }

  function startProgressLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const tick = () => {
      if (!isPlaying) return;
      const duration = scheduleCache?.duration || 0;
      if (!isSeeking) currentOffset = getCurrentPlaybackOffset();
      if (duration > 0) {
        if (!isSeeking) updateProgressUi(currentOffset, duration);
        if (currentOffset >= duration - 0.01) {
          finishPlayback();
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function getCurrentPlaybackOffset() {
    if (!audioCtx || !isPlaying) return currentOffset;
    if (audioCtx.currentTime < playContextStart) return playOffsetStart;
    const elapsed = Math.max(0, audioCtx.currentTime - playContextStart) * playbackSpeed;
    const duration = scheduleCache?.duration || Infinity;
    return Math.max(0, Math.min(duration, playOffsetStart + elapsed));
  }

  function getTimelineActivityIntervals() {
    if (timelineActivityIntervalsVersion === scheduleCacheVersion) return timelineActivityIntervals;
    timelineActivityIntervalsVersion = scheduleCacheVersion;
    timelineActivityIntervals = Array.from({ length: 6 }, () => []);

    const notes = Array.isArray(scheduleCache?.notes) ? scheduleCache.notes : [];
    for (const note of notes) {
      const part = clampInt(Number(note?.part ?? 0), 0, 5);
      const volume = Number(note?.volume ?? 0);
      if (!(volume > 0)) continue;
      const start = Math.max(0, Number(note?.start) || 0);
      const duration = Math.max(0, Number(note?.durationSec) || 0);
      if (!(duration > 0)) continue;
      timelineActivityIntervals[part].push({ start, end: start + duration });
    }

    const mergeGapSec = 0.004;
    for (let part = 0; part < 6; part++) {
      const source = timelineActivityIntervals[part];
      if (source.length <= 1) continue;
      source.sort((a, b) => a.start - b.start || a.end - b.end);
      const merged = [];
      for (const interval of source) {
        const previous = merged[merged.length - 1];
        if (previous && interval.start <= previous.end + mergeGapSec) {
          if (interval.end > previous.end) previous.end = interval.end;
        } else {
          merged.push({ start: interval.start, end: interval.end });
        }
      }
      timelineActivityIntervals[part] = merged;
    }
    return timelineActivityIntervals;
  }

  function timelinePartColor(part) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--part${part}`).trim();
    return raw || ["#dc2626", "#16a34a", "#2563eb", "#b58105", "#0891b2", "#c026d3"][part];
  }

  function renderTimelineActivity(force = false) {
    if (!(timelineActivityCanvas instanceof HTMLCanvasElement)) return;
    const rect = timelineActivityCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || timelineActivityCanvas.clientWidth || 1);
    const cssHeight = Math.max(1, rect.height || timelineActivityCanvas.clientHeight || 1);
    const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
    const duration = Math.max(0, Number(scheduleCache?.duration) || Number(progressSlider?.max) || 0);
    const theme = document.documentElement.dataset.theme || "light";
    const muteSignature = partMuteStates.map(value => value ? "1" : "0").join("");
    const signature = `${scheduleCacheVersion}|${Math.round(cssWidth)}x${Math.round(cssHeight)}|${duration.toFixed(4)}|${theme}|${muteSignature}|${dpr}`;
    if (!force && signature === timelineActivityRenderSignature) return;
    timelineActivityRenderSignature = signature;

    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (timelineActivityCanvas.width !== pixelWidth) timelineActivityCanvas.width = pixelWidth;
    if (timelineActivityCanvas.height !== pixelHeight) timelineActivityCanvas.height = pixelHeight;
    const ctx = timelineActivityCanvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (!(duration > 0)) return;

    const intervalsByPart = getTimelineActivityIntervals();
    const laneHeight = cssHeight / 6;
    const lineWidth = Math.max(1.5, Math.min(2.6, laneHeight * 0.48));
    const pixelMergeGap = 0.85;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let part = 0; part < 6; part++) {
      const intervals = intervalsByPart[part] || [];
      if (!intervals.length) continue;
      const y = laneHeight * (part + 0.5);
      ctx.strokeStyle = timelinePartColor(part);
      ctx.globalAlpha = partMuteStates[part] ? 0.24 : 0.9;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      let pendingStart = -1;
      let pendingEnd = -1;
      const flush = () => {
        if (pendingStart < 0) return;
        const x1 = Math.max(0, Math.min(cssWidth, pendingStart));
        const x2 = Math.max(x1 + 0.8, Math.min(cssWidth, pendingEnd));
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        pendingStart = -1;
        pendingEnd = -1;
      };

      for (const interval of intervals) {
        const start = Math.max(0, Math.min(duration, Number(interval.start) || 0));
        const end = Math.max(start, Math.min(duration, Number(interval.end) || start));
        const x1 = start / duration * cssWidth;
        const x2 = end / duration * cssWidth;
        if (pendingStart < 0) {
          pendingStart = x1;
          pendingEnd = x2;
        } else if (x1 <= pendingEnd + pixelMergeGap) {
          if (x2 > pendingEnd) pendingEnd = x2;
        } else {
          flush();
          pendingStart = x1;
          pendingEnd = x2;
        }
      }
      flush();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function requestTimelineActivityRefresh(force = false) {
    if (force) timelineActivityRenderSignature = "";
    if (timelineActivityRefreshRaf) return;
    timelineActivityRefreshRaf = window.requestAnimationFrame(() => {
      timelineActivityRefreshRaf = 0;
      renderTimelineActivity(force);
    });
  }

  function installTimelineActivityRefreshHooks() {
    if (!(timelineActivityCanvas instanceof HTMLCanvasElement)) return;
    if (typeof ResizeObserver === "function") {
      timelineActivityResizeObserver = new ResizeObserver(() => requestTimelineActivityRefresh(true));
      timelineActivityResizeObserver.observe(timelineActivityCanvas);
    } else {
      window.addEventListener("resize", () => requestTimelineActivityRefresh(true), { passive: true });
    }
    requestTimelineActivityRefresh(true);
  }

  function updateProgressUi(current, duration) {
    const d = Math.max(0, Number(duration) || 0);
    const c = Math.max(0, Math.min(d, Number(current) || 0));
    progressSlider.max = d > 0 ? String(d) : "0";
    progressSlider.step = "0.01";
    progressSlider.value = String(quantizePlaybackTime(c));
    progressSlider.disabled = d <= 0;
    playInfo.textContent = `${formatTime(c)} / ${formatTime(d)}`;
    updateActiveTempoMarker(c);
    updatePlaybackCodeHighlight(c);
    updatePianoRoll(c, d);
  }

  function rebuildSchedulePreviewSilently() {
    const previousDuration = Math.max(0, Number(scheduleCache?.duration) || Number(progressSlider?.max) || 0);
    const liveOffset = isPlaying ? getCurrentPlaybackOffset() : currentOffset;
    const previousOffset = Math.max(0, Math.min(previousDuration || Number.POSITIVE_INFINITY, Number(liveOffset) || 0));
    const previousRatio = previousDuration > 0 ? previousOffset / previousDuration : 0;
    try {
      scheduleCache = createScheduleFromEditor();
      scheduleCacheVersion++;
      const nextDuration = Math.max(0, Number(scheduleCache.duration) || 0);
      currentOffset = previousDuration > 0
        ? Math.max(0, Math.min(nextDuration, previousRatio * nextDuration))
        : Math.max(0, Math.min(nextDuration, previousOffset));
      updateProgressUi(currentOffset, nextDuration);
      updateTempoMarkers(scheduleCache.tempoMarkers, nextDuration);
      requestTimelineActivityRefresh(true);
    } catch (_) {
      scheduleCache = null;
      scheduleCacheVersion++;
      currentOffset = 0;
      updateProgressUi(0, 0);
      updateTempoMarkers([], 0);
      requestTimelineActivityRefresh(true);
    }
  }

  function updateTempoMarkers(markers, duration) {
    if (!tempoMarkerLayer) return;
    tempoMarkerLayer.innerHTML = "";
    const d = Math.max(0, Number(duration) || 0);
    if (d <= 0 || !Array.isArray(markers) || markers.length === 0) return;

    const used = new Map();
    for (const [markerIndex, marker] of markers.entries()) {
      const time = Math.max(0, Math.min(d, Number(marker.time) || 0));
      const bpm = Math.max(1, Math.round(Number(marker.bpm) || 0));
      const percent = Math.max(0, Math.min(100, time / d * 100));
      const key = `${Math.round(percent * 10)}:${bpm}`;
      if (used.has(key)) continue;
      used.set(key, true);

      const el = document.createElement("span");
      el.className = "tempo-marker";
      if (percent < 6) el.classList.add("near-start");
      if (percent > 86) el.classList.add("near-end");
      el.style.left = `${percent}%`;
      el.dataset.time = String(time);
      el.dataset.bpm = String(bpm);
      el.dataset.beat = String(Math.max(0, Number(marker.beat) || 0));
      el.dataset.markerIndex = String(markerIndex);
      el.title = i18nText("tempo.marker_title", [bpm, formatTime(time)]);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "tempo-marker-label";
      label.textContent = `T${bpm}`;
      label.setAttribute("aria-label", i18nText("tempo.marker_aria", [bpm, formatTime(time)]));
      el.appendChild(label);
      tempoMarkerLayer.appendChild(el);
    }
    updateActiveTempoMarker(currentOffset);
  }

  function updateActiveTempoMarker(current) {
    if (!tempoMarkerLayer) return;
    const markers = Array.from(tempoMarkerLayer.querySelectorAll(".tempo-marker"));
    if (markers.length === 0) return;
    const c = Math.max(0, Number(current) || 0);
    let active = markers[0];
    let bestTime = -Infinity;
    for (const marker of markers) {
      const t = Number(marker.dataset.time || 0);
      marker.classList.remove("active");
      if (t <= c + 0.02 && t >= bestTime) {
        bestTime = t;
        active = marker;
      }
    }
    if (active) active.classList.add("active");
  }

  function handleTempoMarkerLayerClick(event) {
    if (playbackSourceOverride || playbackMidiOriginalOverride) return;
    const labelElement = event?.target?.closest?.(".tempo-marker-label");
    const markerElement = labelElement?.closest?.(".tempo-marker");
    if (!labelElement || !markerElement || !tempoMarkerLayer?.contains(markerElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(markerElement.dataset.markerIndex);
    const markers = Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : [];
    const marker = Number.isInteger(index) ? markers[index] : null;
    openTempoEditDialog(marker || {
      beat: Number(markerElement.dataset.beat) || 0,
      time: Number(markerElement.dataset.time) || 0,
      bpm: Number(markerElement.dataset.bpm) || 120
    });
  }

  async function openTempoEditDialog(marker) {
    if (!marker) return;

    tempoEditResumePlayback = Boolean(isPlaying);
    if (tempoEditResumePlayback) {
      stopPlayback(true);
      tempoEditResumeOffset = Math.max(0, Number(currentOffset) || 0);
    } else {
      tempoEditResumeOffset = Math.max(0, Number(currentOffset) || 0);
    }

    const bpm = normalizeTempoBpm(marker.bpm);
    selectedTempoMarker = { ...marker, bpm };
    if (tempoEditBpm) tempoEditBpm.value = String(bpm);
    if (tempoEditContext) {
      const part = Number.isInteger(marker.part) && marker.part >= 0 ? PART_LABELS[marker.part] : i18nText("tempo.default");
      tempoEditContext.textContent = i18nText("tempo.edit_context", [formatTime(Math.max(0, Number(marker.time) || 0)), bpm, part]);
    }
    if (tempoEditDialog?.showModal) {
      tempoEditDialog.showModal();
      tempoEditBpm?.focus();
      tempoEditBpm?.select?.();
      return;
    }
    const answer = await inlinePrompt(i18nText("tempo.prompt", [bpm]), String(bpm));
    if (answer == null) {
      selectedTempoMarker = null;
      resumePlaybackAfterTempoEdit();
      return;
    }
    applyTempoEdit(answer, selectedTempoMarker);
    selectedTempoMarker = null;
    resumePlaybackAfterTempoEdit();
  }

  function resumePlaybackAfterTempoEdit() {
    if (!tempoEditResumePlayback) return;
    const resumeOffset = Math.max(0, Number(tempoEditResumeOffset) || 0);
    tempoEditResumePlayback = false;
    tempoEditResumeOffset = 0;

    const duration = Math.max(0, Number(scheduleCache?.duration) || Number(progressSlider?.max) || 0);
    currentOffset = duration > 0 ? Math.min(resumeOffset, duration) : resumeOffset;
    if (scheduleCache) updateProgressUi(currentOffset, duration);

    setTimeout(() => {
      if (!isPlaying && !tempoEditDialog?.open) void playFromCurrent();
    }, 20);
  }

  function normalizeTempoEditBpmInput() {
    if (!tempoEditBpm) return;
    tempoEditBpm.value = String(normalizeTempoBpm(tempoEditBpm.value));
  }

  function normalizeTempoBpm(value) {
    let bpm = Math.round(Number(value));
    if (!Number.isFinite(bpm)) bpm = 120;
    return clampInt(bpm, 32, 255);
  }

  function applyTempoEditFromDialog() {
    if (!selectedTempoMarker) {
      tempoEditDialog?.close();
      return;
    }
    normalizeTempoEditBpmInput();
    const bpm = normalizeTempoBpm(tempoEditBpm?.value);
    const marker = selectedTempoMarker;
    tempoEditSuppressCloseResume = true;
    tempoEditDialog?.close();
    try {
      applyTempoEdit(bpm, marker);
    } finally {
      tempoEditSuppressCloseResume = false;
      resumePlaybackAfterTempoEdit();
    }
  }

  function applyTempoEdit(value, marker) {
    const bpm = normalizeTempoBpm(value);
    const beforeBpm = normalizeTempoBpm(marker?.bpm);
    if (bpm === beforeBpm) {
      showToast([i18nText("tempo.edit"), i18nText("tempo.no_change", [beforeBpm])].filter(Boolean).join(": "), "info");
      return;
    }

    stopPlayback(false);
    try {
      const source = normalizeMmlForDisplay(mainMml?.value || "");
      const updated = replaceTempoMarkerCommand(source, marker, bpm);
      setMainMml(updated);
      currentOffset = 0;
      showToast([i18nText("tempo.edit"), i18nText("tempo.changed", [formatTime(Math.max(0, Number(marker?.time) || 0)), beforeBpm, bpm])].filter(Boolean).join(": "), "info");
    } catch (err) {
      showToast([i18nText("tempo.edit_2"), shortError(err)].filter(Boolean).join(": "), "error");
    }
  }

  function replaceTempoMarkerCommand(source, marker, bpm) {
    const text = String(source || "");
    const start = Number(marker?.globalSourceStart);
    const end = Number(marker?.globalSourceEnd);
    if (Boolean(marker?.explicit) && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length) {
      const token = text.slice(start, end);
      if (!/^T\d+$/i.test(token)) throw new Error(i18nText("mml.locate_tempo_cmd"));
      return `${text.slice(0, start)}T${bpm}${text.slice(end)}`;
    }

    if (Math.abs(Number(marker?.beat) || 0) <= 1e-7) {
      const header = text.match(/^\s*MML\s*@/i);
      if (header) return `${text.slice(0, header[0].length)}T${bpm}${text.slice(header[0].length)}`;
      return `MML@T${bpm}${text.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/, "")};`;
    }
    throw new Error(i18nText("mml.locate_tempo_cmd_2"));
  }

  function ensurePartPlaybackGains() {
    if (!audioCtx || !masterGain) return;
    if (partPlaybackGains.length === 6 && partPlaybackGains.every(Boolean)) return;
    for (const node of partPlaybackGains) {
      try { node?.disconnect(); } catch {}
    }
    partPlaybackGains = Array.from({ length: 6 }, (_, part) => {
      const gain = audioCtx.createGain();
      gain.gain.value = partMuteStates[part] ? 0 : 1;
      gain.connect(masterGain);
      return gain;
    });
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error(i18nText("audio.unsupported_web"));
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      partPlaybackGains = [];
    }
    if (!masterGain) {
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      partPlaybackGains = [];
    }
    ensurePartPlaybackGains();
    applyPartMuteAudioGains({ instant: true });
    if (audioCtx.state !== "running") await audioCtx.resume();
    applyOutputVolume();
    return audioCtx;
  }

  function applyPlaybackSpeed(restartPlaying = true) {
    if (!speedSlider) return;
    const wasPlaying = isPlaying;
    const oldSpeed = playbackSpeed;
    if (wasPlaying) currentOffset = getCurrentPlaybackOffset();
    const raw = Number(speedSlider.value || 1);
    playbackSpeed = Math.max(0.75, Math.min(1.5, Number.isFinite(raw) ? raw : 1));
    speedSlider.value = playbackSpeed.toFixed(2).replace(/\.00$/, "");
    if (speedValue) speedValue.textContent = `${playbackSpeed.toFixed(2)}x`;
    writePref("speed", playbackSpeed.toFixed(2));
    if (wasPlaying && restartPlaying && Math.abs(oldSpeed - playbackSpeed) > 0.0001) {
      clearTimeout(seekRestartTimer);
      seekRestartTimer = setTimeout(() => void playFromCurrent(), 20);
    }
  }

  function resetPlaybackSpeed() {
    if (!speedSlider) return;
    speedSlider.value = "1";
    applyPlaybackSpeed(true);
  }

  function resetOutputVolume() {
    if (!volumeSlider) return;
    volumeSlider.value = "100";
    applyOutputVolume();
  }

  function applyOutputVolume() {
    const percent = clampInt(Number(volumeSlider.value || 100), 0, 150);
    volumeSlider.value = String(percent);
    volumeValue.textContent = `${percent}%`;
    if (volumeControlButton) {
      const muted = percent === 0;
      volumeControlButton.classList.toggle("volume-muted", muted);
      volumeControlButton.setAttribute("aria-pressed", muted ? "true" : "false");
    }
    writePref("volume", String(percent));
    if (masterGain && audioCtx && audioCtx.state !== "closed") {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(percent / 100, now, 0.015);
    }
  }

  function updatePlayButton() {
    const label = isPlaying ? i18nText("player.stop") : i18nText("player.play");
    if (isPlaying) playToggleBtn.innerHTML = '<span class="shared-transport-icon shared-icon-stop" aria-hidden="true"></span>';
    else playToggleBtn.innerHTML = '<span class="shared-transport-icon shared-icon-play" aria-hidden="true"></span>';
    playToggleBtn.setAttribute("aria-label", label);
    playToggleBtn.title = label;
    playToggleBtn.classList.toggle("danger", isPlaying);
  }

  function setMainMml(text) {
    syncing = true;
    mainMml.value = normalizeMmlForDisplay(text);
    syncing = false;
    syncPartsFromMain({ generatedByPlayerUi: true });
  }

  const EDITOR_DERIVED_REFRESH_DEBOUNCE_MS = 120;
  let previewRefreshFrame = 0;
  let previewRefreshTimer = 0;

  function cancelScheduledEditorDerivedRefresh() {
    if (previewRefreshFrame) cancelAnimationFrame(previewRefreshFrame);
    if (previewRefreshTimer) clearTimeout(previewRefreshTimer);
    previewRefreshFrame = 0;
    previewRefreshTimer = 0;
  }

  function runEditorDerivedRefresh() {
    updateVisibleHighlight();
    rebuildSchedulePreviewSilently();
  }

  function scheduleEditorDerivedRefresh(delayMs = EDITOR_DERIVED_REFRESH_DEBOUNCE_MS) {
    cancelScheduledEditorDerivedRefresh();
    previewRefreshFrame = requestAnimationFrame(() => {
      previewRefreshFrame = 0;
      previewRefreshTimer = window.setTimeout(() => {
        previewRefreshTimer = 0;
        runEditorDerivedRefresh();
      }, Math.max(0, Number(delayMs) || 0));
    });
  }

  function schedulePlayerUiPreviewRefresh() {
    scheduleEditorDerivedRefresh(0);
  }

  function seedEditorPartsCache(parts) {
    editorAnalysisCache.source = normalizeMmlForDisplay(mainMml?.value || "");
    editorAnalysisCache.parts = Array.from({ length: 6 }, (_, index) => normalizePartText(parts?.[index] || ""));
  }

  function syncPartsFromMain({ generatedByPlayerUi = false } = {}) {
    if (syncing) return;
    syncing = true;
    try {
      if (!generatedByPlayerUi) mainMml.value = normalizeMmlForDisplay(mainMml.value);
      const parts = splitMmlParts(mainMml.value).slice(0, 6).map(normalizePartText);
      while (parts.length < 6) parts.push("");
      partTexts.forEach((t, i) => { t.value = parts[i] || ""; });
      invalidateEditorDerivedState();
      seedEditorPartsCache(parts);
      updateCharCount();
      if (generatedByPlayerUi) schedulePlayerUiPreviewRefresh();
      else scheduleEditorDerivedRefresh();
    } finally {
      syncing = false;
    }
  }

  function syncMainFromParts() {
    if (syncing) return;
    syncing = true;
    try {
      partTexts.forEach(normalizeTextareaCommands);
      const parts = partTexts.map(t => t.value);
      mainMml.value = normalizeMmlForDisplay(composeMml(parts, { preserveEmpty: true, partCount: 6 }));
      invalidateEditorDerivedState();
      seedEditorPartsCache(parts);
      updateCharCount();
      scheduleEditorDerivedRefresh();
    } finally {
      syncing = false;
    }
  }

  function selectTab(name) {
    activeTabName = name || "main";
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === activeTabName));
    panels.forEach(p => p.hidden = p.dataset.panel !== activeTabName);
    updatePartMuteControl();
    updateCharCount();
    updatePlaybackCodeHighlight(currentOffset);
    updateVisibleHighlight();
  }

  function getCurrentPartTexts(partCount = 6) {
    const count = Math.max(1, Math.min(6, Number(partCount) || 6));
    return getEditorDerivedState().parts.slice(0, count);
  }

  function updateCharCount() {
    if (!charCount) return;
    const parts = getCurrentPartTexts(6);

    if (activeTabName === "main") {
      const counts = parts.map(part => part.length);
      const total = counts.reduce((sum, count) => sum + count, 0);
      charCount.className = "char-count char-count-all";
      charCount.replaceChildren();

      const totalLine = document.createElement("div");
      totalLine.className = "char-count-total";
      totalLine.textContent = i18nText("ui.char_count", [formatCount(total)]);

      const partLine = document.createElement("div");
      partLine.className = "char-count-parts";
      counts.forEach((count, idx) => {
        if (idx > 0) {
          const separator = document.createElement("span");
          separator.className = "char-count-separator";
          separator.textContent = "/";
          partLine.append(separator);
        }
        const channelCount = document.createElement("span");
        channelCount.className = `char-count-channel part-count-${idx}`;
        channelCount.textContent = formatCount(count);
        channelCount.title = i18nText("ui.part_chars", [PART_LABELS[idx], formatCount(count)]);
        partLine.append(channelCount);
      });
      const unit = document.createElement("span");
      unit.className = "char-count-unit";
      unit.textContent = i18nText("ui.chars");
      partLine.append(unit);

      charCount.append(totalLine, partLine);
      charCount.setAttribute("aria-label", i18nText("ui.char_summary", [formatCount(total), counts.map(formatCount).join(", ")]));
      return;
    }

    const m = /^part(\d+)$/.exec(activeTabName || "");
    const idx = m ? Number(m[1]) : 0;
    const partCount = (parts[idx] || "").length;
    charCount.textContent = i18nText("ui.char_count", [formatCount(partCount)]);
    charCount.className = `char-count part-count-${idx}`;
    charCount.setAttribute("aria-label", i18nText("ui.part_chars", [PART_LABELS[idx] || i18nText("ui.channel"), formatCount(partCount)]));
  }

  function formatCount(value) {
    return Math.max(0, Number(value) || 0).toLocaleString(document.documentElement.lang || undefined);
  }


  async function openPasteMmlDialog() {
    if (!pasteMmlDialog?.showModal) return;
    if (pasteMmlStatus) pasteMmlStatus.textContent = "";
    if (pasteMmlText) pasteMmlText.value = "";
    pasteMmlDialog.showModal();
    requestAnimationFrame(() => pasteMmlText?.focus());
    try {
      if (navigator.clipboard?.readText) {
        const clipboardText = await navigator.clipboard.readText();
        if (pasteMmlText && !pasteMmlText.value && String(clipboardText || "").trim()) {
          pasteMmlText.value = clipboardText;
          pasteMmlText.select();
        }
      }
    } catch (_) {}
  }

  async function applyPasteMmlDialog() {
    let text = String(pasteMmlText?.value || "");
    if (!text.trim()) {
      if (pasteMmlStatus) pasteMmlStatus.textContent = i18nText("mml.paste_empty");
      return;
    }
    try {
      const prepared = await prepareIrregularLengthPaste(text);
      if (!prepared) return;
      text = prepared.text;
      let pasted = "";
      const looksLikeFullMml = /^\s*mml\s*@/i.test(text) || text.includes(",");
      if (looksLikeFullMml) {
        try {
          pasted = normalizeImportedFullMml(text).mml;
        } catch (_) {
          pasted = normalizeMmlForDisplay(text);
        }
      } else {
        const parts = [normalizePartText(text), "", "", "", "", ""];
        pasted = normalizeMmlForDisplay(composeMml(parts, { preserveEmpty: true, partCount: 6 }));
      }
      if (!pasted.trim()) throw new Error(i18nText("mml.paste_empty"));
      setPlayerUiOriginalMidiImport(null);
      notifyPlayerUiSourceBaseline(pasted, {
        name: i18nText("mml.pasted_name"),
        sourceType: "mml",
        sourceLabel: "MML",
        newSource: true
      });
      clearSuggestedMmlSaveFileName();
      googleDriveMmlFileName = "";
      pasteMmlDialog?.close();
    } catch (error) {
      if (pasteMmlStatus) pasteMmlStatus.textContent = shortError(error);
    }
  }

  async function handleEditorMmlPaste(event) {
    const textarea = event.currentTarget;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const pastedText = event.clipboardData?.getData?.("text/plain");
    if (pastedText == null) return;

    let info;
    try {
      info = analyzeIrregularMmlLengths(pastedText);
    } catch (_) {
      return;
    }
    if (!info?.count) return;

    let convertedText;
    try {
      convertedText = normalizeIrregularMmlLengths(pastedText).mml;
    } catch (err) {
      showToast([i18nText("err.paste"), i18nText("mml.irregular_convert_failed", [shortError(err)])].filter(Boolean).join(": "), "error");
      return;
    }

    // 붙여넣은 조각만 자동 보정한다. 기존 편집 내용에 사용자가 직접 입력해 둔
    // 비정규 박자는 경고 상태로 그대로 유지한다.
    event.preventDefault();
    const before = String(textarea.value || "");
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : before.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const next = before.slice(0, start) + convertedText + before.slice(end);

    textarea.value = next;
    const caret = Math.min(next.length, start + convertedText.length);
    try { textarea.setSelectionRange(caret, caret); } catch {}
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    clearSuggestedMmlSaveFileName();
    googleDriveMmlFileName = "";
  }

  async function prepareIrregularLengthPaste(text) {
    const original = String(text || "");
    let info;
    try {
      info = analyzeIrregularMmlLengths(original);
    } catch (_) {
      return { text: original, converted: false };
    }
    if (!info?.count) return { text: original, converted: false };

    try {
      const converted = normalizeIrregularMmlLengths(original);
      return { text: converted.mml, converted: converted.changed, info: converted };
    } catch (err) {
      showToast([i18nText("err.paste"), i18nText("mml.irregular_convert_failed", [shortError(err)])].filter(Boolean).join(": "), "error");
      return { text: original, converted: false };
    }
  }

  async function copyVisibleMml() {
    let text;
    try {
      text = normalizeMmlForCopy(optimizeMml(mainMml?.value || "").mml);
    } catch (err) {
      showToast([i18nText("err.copy"), i18nText("mml.optimize_error_detail", [shortError(err)])].filter(Boolean).join(": "), "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      trackScoreCopy("all");
      showToast(i18nText("st.copy_done"));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        const copied = document.execCommand("copy");
        if (!copied) throw new Error("copy failed");
        trackScoreCopy("all");
        showToast(i18nText("st.copy_done"));
      } catch (err) {
        showToast([i18nText("err.copy"), i18nText("mml.auto_copying")].filter(Boolean).join(": "), "error");
      } finally {
        ta.remove();
      }
    }
  }

  async function saveVisibleMml() {
    let exportData;
    try {
      exportData = getFullMmlForExport();
    } catch (err) {
      showToast([i18nText("err.save"), i18nText("mml.optimize_error_detail", [shortError(err)])].filter(Boolean).join(": "), "error");
      return;
    }
    const { text } = exportData;
    if (!text.trim()) {
      showToast([i18nText("err.save"), i18nText("mml.empty")].filter(Boolean).join(": "), "error");
      return;
    }

    const defaultName = defaultLocalSaveFileName();
    const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: i18nText("mml.text_file"),
            accept: { "text/plain": [".txt"] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        flashButton(saveBtn, i18nText("st.save_done"));
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        showToast([i18nText("err.save"), shortError(err)].filter(Boolean).join(": "), "error");
        return;
      }
    }

    const entered = await inlinePrompt(
      i18nText("file.save_name_prompt"),
      defaultName,
      { title: i18nText("ui.save"), confirmText: i18nText("ui.save") }
    );
    if (entered == null) return;
    let fileName = entered.trim() || defaultName;
    if (!/\.txt$/i.test(fileName)) fileName += ".txt";
    downloadBlob(blob, fileName);
    flashButton(saveBtn, i18nText("st.save_done"));
  }

  function getFullMmlForExport() {
    const text = normalizeMmlForCopy(optimizeMml(mainMml?.value || "").mml);
    return { text };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function flashButton(button, text) {
    const old = button.textContent;
    button.textContent = text;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { button.textContent = old; }, 1000);
  }

  function normalizeTextareaCommands(textarea) {
    const before = textarea.value;
    const after = textarea === mainMml ? normalizeMmlForDisplay(before) : normalizePartText(before);
    if (before === after) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = after;
    try { textarea.setSelectionRange(start, end); } catch {}
  }

  function normalizePartText(text) {
    return normalizeCommandCase(String(text || "")
      .replace(/^\s*mml\s*@/i, "")
      .replace(/;\s*$/g, ""))
      .trim();
  }

  function normalizeCommandCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, ch => {
      const lower = ch.toLowerCase();
      if ("tolv".includes(lower)) return lower.toUpperCase();
      if ("rnabcdefg".includes(lower)) return lower;
      return ch;
    });
  }

  function normalizeMmlForDisplay(text) {
    let s = String(text || "").replace(/^\s*mml\s*@/i, "MML@");

    const m = s.match(/^\s*MML@([\s\S]*?)(;?)\s*$/i);
    let parts;
    if (m) parts = m[1].split(",").map(x => normalizePartText(x)).slice(0, 6);
    else parts = [normalizePartText(s)];
    while (parts.length < 6) parts.push("");
    return `MML@${parts.join(",")};`;
  }

  function normalizeMmlForCopy(text) {
    const parts = splitMmlParts(normalizeMmlForDisplay(text)).map(normalizePartText).filter(Boolean);
    return `MML@${parts.join(",")};`;
  }

  function getActiveEditorPartIndex() {
    const match = /^part(\d+)$/.exec(activeTabName || "");
    if (!match) return -1;
    const index = Number(match[1]);
    return Number.isInteger(index) && index >= 0 && index < 6 ? index : -1;
  }

  function codeRangeSignature(ranges) {
    return (ranges || []).map(range => `${range.start}:${range.end}`).join("|");
  }

  function updateVisibleHighlight() {
    const codePanel = document.querySelector('[data-workspace-panel="code"]');
    if (codePanel?.hidden) return;
    if (activeTabName === "main") {
      updateMainHighlight();
      return;
    }
    const index = getActiveEditorPartIndex();
    if (index >= 0) updatePartHighlight(index);
  }

  function updateMainHighlight() {
    if (!mainMmlHighlight || activeTabName !== "main") return;
    const signature = `${editorContentVersion}|${codeRangeSignature(activePlaybackMainRanges)}`;
    if (signature !== mainHighlightRenderSignature) {
      mainMmlHighlight.innerHTML = renderColoredMml(mainMml.value, activePlaybackMainRanges) + "\n";
      mainHighlightRenderSignature = signature;
    }
    syncHighlightScroll();
  }

  function syncHighlightScroll() {
    if (!mainMmlHighlight) return;
    mainMmlHighlight.scrollTop = mainMml.scrollTop;
    mainMmlHighlight.scrollLeft = mainMml.scrollLeft;
  }

  function updatePartHighlight(index) {
    if (activeTabName !== `part${index}`) return;
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    const signature = `${editorContentVersion}|${codeRangeSignature(activePlaybackPartRanges[index] || [])}`;
    if (signature !== partHighlightRenderSignatures[index]) {
      highlight.innerHTML = renderPartWithErrors(textarea.value, activePlaybackPartRanges[index] || []) + "\n";
      partHighlightRenderSignatures[index] = signature;
    }
    syncPartHighlightScroll(index);
  }

  function syncPartHighlightScroll(index) {
    const highlight = partMmlHighlights[index];
    const textarea = partTexts[index];
    if (!highlight || !textarea) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  function getVisiblePianoRollNotes() {
    const notes = Array.isArray(scheduleCache?.notes) ? scheduleCache.notes : [];
    const signature = [
      scheduleCacheVersion,
      notes.length,
      partMuteStates.map(v => v ? "1" : "0").join("")
    ].join("|");
    if (signature === pianoRollVisibleCacheSignature) return pianoRollVisibleCache;

    pianoRollVisibleCacheSignature = signature;
    pianoRollVisibleCache = [];
    for (const note of notes) {
      const part = clampInt(Number(note?.part ?? 0), 0, 5);
      const midi = Number(note?.midi);
      if (!Number.isFinite(midi) || Number(note?.volume ?? 0) <= 0) continue;
      pianoRollVisibleCache.push({
        start: Math.max(0, Number(note?.start) || 0),
        durationSec: Math.max(0.02, Number(note?.durationSec) || 0.02),
        midi: clampInt(midi, 0, 127),
        part,
        muted: Boolean(partMuteStates[part])
      });
    }
    pianoRollVisibleCache.sort((a, b) => a.start - b.start || a.part - b.part || a.midi - b.midi);
    pianoRollTemporalIndex = buildTemporalIndex(pianoRollVisibleCache);
    pianoRollRangeCache = getPianoRollRange(pianoRollVisibleCache);
    return pianoRollVisibleCache;
  }

  function getPianoRollRange(notes) {
    if (!notes.length) return { min: 48, max: 71 };

    let rawMin = 127;
    let rawMax = 0;
    for (const note of notes) {
      const midi = clampInt(Number(note.midi) || 0, 0, 127);
      rawMin = Math.min(rawMin, midi);
      rawMax = Math.max(rawMax, midi);
    }

    // 건반 폭은 옥타브 수에 의해 결정된다. 예전 계산은 한 옥타브짜리 곡도
    // 최소 범위를 맞춘 뒤 다시 C~B로 반올림하면서 3옥타브까지 늘어날 수 있었고,
    // 그 결과 흰/검은 건반과 세로 레인이 필요 이상으로 눌려 보였다.
    // 점유한 옥타브를 먼저 구한 뒤 부족한 옥타브만 정확히 보충한다.
    const minOctaves = Math.max(1, Math.ceil(PIANO_ROLL_MIN_KEY_SPAN / 12));
    const minOctaveIndex = 0;
    const maxOctaveIndex = Math.floor(127 / 12);
    let firstOctave = Math.floor(rawMin / 12);
    let lastOctave = Math.floor(rawMax / 12);
    const occupiedOctaves = Math.max(1, lastOctave - firstOctave + 1);
    const extraOctaves = Math.max(0, minOctaves - occupiedOctaves);

    firstOctave -= Math.floor(extraOctaves / 2);
    lastOctave += Math.ceil(extraOctaves / 2);

    if (firstOctave < minOctaveIndex) {
      lastOctave = Math.min(maxOctaveIndex, lastOctave + (minOctaveIndex - firstOctave));
      firstOctave = minOctaveIndex;
    }
    if (lastOctave > maxOctaveIndex) {
      firstOctave = Math.max(minOctaveIndex, firstOctave - (lastOctave - maxOctaveIndex));
      lastOctave = maxOctaveIndex;
    }

    const min = Math.max(0, firstOctave * 12);
    const max = Math.min(127, lastOctave * 12 + 11);
    return { min, max };
  }

  function getPianoRollKeyHeight() {
    if (!pianoRoll) return pianoRollExpanded ? 38 : 30;
    const raw = getComputedStyle(pianoRoll).getPropertyValue("--piano-key-h");
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : (pianoRollExpanded ? 38 : 30);
  }

  function noteNameForMidi(midi) {
    const n = clampInt(Number(midi) || 0, 0, 127);
    return `${PIANO_NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
  }

  function getPianoPitch(midi) {
    return ((clampInt(Number(midi) || 0, 0, 127) % 12) + 12) % 12;
  }

  function isPianoBlackKey(midi) {
    return PIANO_BLACK_KEY_PITCHES.has(getPianoPitch(midi));
  }


  function getPianoRollLayout(minMidi, maxMidi) {
    const min = clampInt(Number(minMidi) || 0, 0, 127);
    const max = clampInt(Number(maxMidi) || 0, 0, 127);
    const pitchCount = Math.max(1, max - min + 1);
    const pitchWidth = 100 / pitchCount;

    const getLaneMetrics = (midi) => {
      const n = clampInt(Number(midi) || 0, min, max);
      const left = (n - min) * pitchWidth;
      return {
        left,
        width: pitchWidth,
        center: left + pitchWidth / 2
      };
    };

    const previousWhiteDistance = [1, 0, 2, 0, 2, 1, 0, 2, 0, 2, 0, 2];
    const nextWhiteDistance = [2, 0, 2, 0, 1, 2, 0, 2, 0, 2, 0, 1];
    const blackWidth = pitchWidth * PIANO_BLACK_KEY_WIDTH_IN_PITCH_LANES;

    const getKeyMetrics = (midi) => {
      const n = clampInt(Number(midi) || 0, min, max);
      const lane = getLaneMetrics(n);
      const black = isPianoBlackKey(n);
      if (black) {
        const width = Math.min(100, blackWidth);
        const left = Math.max(0, Math.min(100 - width, lane.center - width / 2));
        return { black, left, width, center: lane.center };
      }

      const pitch = getPianoPitch(n);
      const leftRaw = lane.center - (previousWhiteDistance[pitch] * pitchWidth / 2);
      const rightRaw = lane.center + (nextWhiteDistance[pitch] * pitchWidth / 2);
      const left = Math.max(0, leftRaw);
      const right = Math.min(100, rightRaw);
      return {
        black,
        left,
        width: Math.max(0, right - left),
        center: lane.center
      };
    };

    return { pitchWidth, blackWidth, getLaneMetrics, getKeyMetrics };
  }

  function buildPianoRollDataSignature(notes, duration) {
    const first = notes[0] || null;
    const last = notes[notes.length - 1] || null;
    return [
      scheduleCacheVersion,
      notes.length,
      Math.round((Number(duration) || 0) * 1000),
      pianoRollExpanded ? 1 : 0,
      partMuteStates.map(v => v ? "1" : "0").join(""),
      Math.round(Number(pianoRollCanvas?.clientWidth) || 0),
      Math.round(Number(pianoRollCanvas?.clientHeight) || 0),
      document.documentElement.dataset.theme || "light",
      first ? `${Math.round(first.start * 1000)}:${first.midi}:${first.part}` : "-",
      last ? `${Math.round(last.start * 1000)}:${last.midi}:${last.part}` : "-"
    ].join("|");
  }

  function getCanvasCssVar(name, fallback, element = document.documentElement) {
    try {
      const value = getComputedStyle(element).getPropertyValue(name).trim();
      return value || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function preparePianoRollCanvas() {
    if (!(pianoRollCanvas instanceof HTMLCanvasElement)) return null;
    const rect = pianoRollCanvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || pianoRollCanvas.clientWidth || 1);
    const cssHeight = Math.max(1, rect.height || pianoRollCanvas.clientHeight || 1);
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (pianoRollCanvas.width !== pixelWidth || pianoRollCanvas.height !== pixelHeight) {
      pianoRollCanvas.width = pixelWidth;
      pianoRollCanvas.height = pixelHeight;
    }
    const ctx = pianoRollCanvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    return { ctx, width: cssWidth, height: cssHeight };
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPianoKeyLabel(ctx, midi, x, y, width, height, activePart, colors) {
    if (getPianoPitch(midi) !== 0) return;
    const label = noteNameForMidi(midi);
    const match = /^([A-G]#?)(-?\d+)$/.exec(label);
    const textColor = activePart == null ? colors.whiteText : "#ffffff";
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.globalAlpha = activePart == null ? 0.96 : 1;
    ctx.textBaseline = "alphabetic";

    if (width < 32 && match) {
      const fontSize = Math.max(8.5, Math.min(12, height * 0.36));
      const lineHeight = Math.max(7.5, fontSize * 0.86);
      const textX = x + Math.max(2, width * 0.08);
      const bottom = y + height - 4;
      ctx.font = `950 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(match[1], textX, bottom - lineHeight);
      ctx.fillText(match[2], textX, bottom);
    } else {
      const fontSize = Math.max(8, Math.min(11, height * 0.31, width * 0.46));
      ctx.font = `950 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, x + width / 2, y + height - 4);
    }
    ctx.restore();
  }

  function buildPianoRollCanvasColors() {
    const dark = document.documentElement.dataset.theme === "dark";
    return {
      dark,
      line: getCanvasCssVar("--line", dark ? "#334155" : "#d1d5db"),
      accent: getCanvasCssVar("--accent", dark ? "#818cf8" : "#4f46e5"),
      tempo: getCanvasCssVar("--tempo", dark ? "#a78bfa" : "#7c3aed"),
      tempoActive: getCanvasCssVar("--tempo-active", dark ? "#22c55e" : "#16a34a"),
      activeLine: getCanvasCssVar("--active-code-line", dark ? "rgba(74, 222, 128, 0.95)" : "rgba(22, 163, 74, 0.92)"),
      mutedLine: dark ? "rgba(226, 232, 240, 0.82)" : "rgba(51, 65, 85, 0.72)",
      mutedMark: dark ? "rgba(248, 250, 252, 0.88)" : "rgba(30, 41, 59, 0.78)",
      whiteA: getCanvasCssVar("--piano-white-key-bg-a", "#ffffff", pianoRoll),
      whiteB: getCanvasCssVar("--piano-white-key-bg-b", dark ? "#dbeafe" : "#eef2f7", pianoRoll),
      whiteText: getCanvasCssVar("--piano-white-key-text", dark ? "#172033" : "#334155", pianoRoll),
      whiteLine: getCanvasCssVar("--piano-white-key-line", dark ? "rgba(15, 23, 42, .42)" : "rgba(100, 116, 139, .36)", pianoRoll),
      gridLine: dark ? "rgba(148, 163, 184, 0.16)" : "rgba(100, 116, 139, 0.22)",
      blackLane: dark ? "rgba(255, 255, 255, 0.035)" : "rgba(15, 23, 42, 0.035)",
      blackA: "#020617",
      blackB: "#111827",
      parts: Array.from({ length: 6 }, (_, i) => getCanvasCssVar(`--part${i}`, ["#dc2626", "#16a34a", "#2563eb", "#b58105", "#0891b2", "#c026d3"][i]))
    };
  }

  function getPianoRollTempoMap() {
    if (pianoRollTempoMapCacheVersion === scheduleCacheVersion) return pianoRollTempoMapCache;
    const source = Array.isArray(scheduleCache?.tempoMap) && scheduleCache.tempoMap.length
      ? scheduleCache.tempoMap
      : (Array.isArray(scheduleCache?.tempoMarkers) ? scheduleCache.tempoMarkers : []);
    const sorted = source
      .map((tempo) => ({
        beat: Math.max(0, Number(tempo?.beat) || 0),
        time: Math.max(0, Number(tempo?.time) || 0),
        bpm: Math.max(1, Number(tempo?.bpm) || 120)
      }))
      .sort((a, b) => a.beat - b.beat || a.time - b.time);

    const result = [];
    for (const tempo of sorted) {
      const previous = result[result.length - 1];
      if (previous && Math.abs(previous.beat - tempo.beat) < 1e-7) result[result.length - 1] = tempo;
      else result.push(tempo);
    }
    if (!result.length || result[0].beat > 1e-7) result.unshift({ beat: 0, time: 0, bpm: 120 });
    pianoRollTempoMapCacheVersion = scheduleCacheVersion;
    pianoRollTempoMapCache = result;
    return pianoRollTempoMapCache;
  }

  function pianoRollBeatToSeconds(beat, tempoMap) {
    const target = Math.max(0, Number(beat) || 0);
    const map = Array.isArray(tempoMap) && tempoMap.length ? tempoMap : [{ beat: 0, time: 0, bpm: 120 }];
    let segment = map[0];
    for (let i = 1; i < map.length; i++) {
      if (map[i].beat > target + 1e-9) break;
      segment = map[i];
    }
    return segment.time + Math.max(0, target - segment.beat) * 60 / segment.bpm;
  }

  function pianoRollSecondsToBeat(seconds, tempoMap) {
    const target = Math.max(0, Number(seconds) || 0);
    const map = Array.isArray(tempoMap) && tempoMap.length ? tempoMap : [{ beat: 0, time: 0, bpm: 120 }];
    let segment = map[0];
    for (let i = 1; i < map.length; i++) {
      if (map[i].time > target + 1e-9) break;
      segment = map[i];
    }
    return segment.beat + Math.max(0, target - segment.time) * segment.bpm / 60;
  }

  function drawPianoRollCanvasGrid(ctx, width, fallAreaHeight, keyLayout, minMidi, maxMidi, current, visibleEnd, pxPerSec, tempoMap, colors) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    // 피아노롤 본문은 건반의 물리적인 흰/검은 폭이 아니라 균등한 12반음 레인을 사용한다.
    // 검은음도 흰음과 같은 레인 폭을 가지므로 노트 중심 간격과 두께가 모두 일정하다.
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (!isPianoBlackKey(midi)) continue;
      const lane = keyLayout.getLaneMetrics(midi);
      const x = lane.left * width / 100;
      const w = lane.width * width / 100;
      ctx.fillStyle = colors.blackLane;
      ctx.fillRect(x, 0, w, fallAreaHeight);
    }

    // 모든 반음의 경계를 같은 간격으로 그린다. C 경계만 옥타브 구분을 위해 강조한다.
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      const lane = keyLayout.getLaneMetrics(midi);
      const x = lane.left * width / 100;
      ctx.strokeStyle = getPianoPitch(midi) === 0 ? colors.accent : colors.gridLine;
      ctx.lineWidth = getPianoPitch(midi) === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.max(0.5, Math.min(width - 0.5, Math.round(x) + 0.5)), 0);
      ctx.lineTo(Math.max(0.5, Math.min(width - 0.5, Math.round(x) + 0.5)), fallAreaHeight);
      ctx.stroke();
    }

    const finalLane = keyLayout.getLaneMetrics(maxMidi);
    const right = (finalLane.left + finalLane.width) * width / 100;
    ctx.strokeStyle = colors.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.min(width - 0.5, Math.max(0.5, Math.round(right) - 0.5)), 0);
    ctx.lineTo(Math.min(width - 0.5, Math.max(0.5, Math.round(right) - 0.5)), fallAreaHeight);
    ctx.stroke();

    // L4는 1박이다. 각 정수 박자의 실제 시간을 템포맵으로 환산해
    // 건반 윗선에서 시작하고 재생 시간에 따라 아래로 흐르는 격자를 그린다.
    const firstBeat = Math.max(0, Math.ceil(pianoRollSecondsToBeat(current, tempoMap) - 1e-7));
    const lastBeat = Math.floor(pianoRollSecondsToBeat(visibleEnd, tempoMap) + 1e-7);
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const time = pianoRollBeatToSeconds(beat, tempoMap);
      if (time < current - 1e-7 || time > visibleEnd + 1e-7) continue;
      const y = fallAreaHeight - ((time - current) * pxPerSec);
      const strong = beat % 4 === 0;
      ctx.strokeStyle = strong ? colors.line : colors.gridLine;
      ctx.globalAlpha = strong ? 0.58 : 0.34;
      ctx.lineWidth = strong ? 1.15 : 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(y) + 0.5)));
      ctx.lineTo(width, Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(y) + 0.5)));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPianoRollCanvasTempoLines(ctx, width, fallAreaHeight, markers, current, visibleEnd, pxPerSec, colors) {
    if (!Array.isArray(markers) || !markers.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    for (const marker of markers) {
      const time = Math.max(0, Number(marker?.time) || 0);
      if (time < current - 0.03 || time > visibleEnd + 0.03) continue;
      const bpm = Math.max(1, Math.round(Number(marker?.bpm) || 120));
      const rawY = fallAreaHeight - ((time - current) * pxPerSec);
      if (rawY < -1 || rawY > fallAreaHeight + 1) continue;
      const y = Math.max(0.5, Math.min(fallAreaHeight - 0.5, Math.round(rawY) + 0.5));
      const active = Math.abs(time - current) <= 0.035;
      const lineColor = active ? colors.tempoActive : colors.tempo;

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.setLineDash(active ? [] : [7, 4]);
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = active ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.restore();

      const label = `T${bpm}`;
      const hovered = marker === pianoRollHoveredTempoMarker;
      ctx.save();
      ctx.font = `950 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const labelWidth = Math.ceil(ctx.measureText(label).width) + 12;
      const labelHeight = 17;
      const baseLabelX = 5;
      const baseLabelY = Math.max(2, Math.min(fallAreaHeight - labelHeight - 2, y - labelHeight - 2));
      const labelX = hovered ? baseLabelX - 1 : baseLabelX;
      const labelY = hovered ? Math.max(1, baseLabelY - 1) : baseLabelY;
      const drawWidth = hovered ? labelWidth + 2 : labelWidth;
      const drawHeight = hovered ? labelHeight + 2 : labelHeight;
      if (hovered) {
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 1;
      }
      ctx.fillStyle = lineColor;
      drawRoundRect(ctx, labelX, labelY, drawWidth, drawHeight, hovered ? 10 : 8);
      ctx.fill();
      if (hovered) {
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, baseLabelX + 6, baseLabelY + labelHeight / 2 + 0.25);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPianoRollCanvasNotes(ctx, width, fallAreaHeight, keyLayout, visibleNotes, current, pxPerSec, colors) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, fallAreaHeight);
    ctx.clip();

    const limit = pianoRollExpanded ? 1800 : 720;
    for (const { end, noteDuration, midi, part, active, muted } of visibleNotes.slice(0, limit)) {
      const lane = keyLayout.getLaneMetrics(midi);
      const laneWidth = lane.width * width / 100;
      const noteWidth = Math.max(2, laneWidth * PIANO_ROLL_NOTE_WIDTH_RATIO);
      const center = lane.center * width / 100;
      const x = Math.max(0, Math.min(width - noteWidth, center - noteWidth / 2));
      const y = fallAreaHeight - ((end - current) * pxPerSec);
      const h = Math.max(1.2, noteDuration * pxPerSec);
      if (y > fallAreaHeight || y + h < 0) continue;
      const r = pianoRollExpanded ? 5 : 4;
      ctx.save();
      ctx.globalAlpha = muted ? (active ? 0.42 : 0.27) : (active ? 0.98 : 0.86);
      ctx.fillStyle = colors.parts[part] || colors.parts[0];
      drawRoundRect(ctx, x, y, noteWidth, h, r);
      ctx.fill();
      ctx.globalAlpha = muted ? 0.9 : (active ? 0.95 : 0.28);
      ctx.lineWidth = muted ? 1.4 : (active ? 2 : 1);
      ctx.strokeStyle = muted ? colors.mutedLine : (active ? colors.activeLine : "rgba(255, 255, 255, 0.55)");
      if (muted) ctx.setLineDash([Math.max(2, noteWidth * 0.28), 2.5]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMutedPianoKeyMark(ctx, x, y, width, height, colors) {
    if (width < 3 || height < 6) return;
    ctx.save();
    ctx.strokeStyle = colors.mutedMark;
    ctx.lineWidth = Math.max(1.2, Math.min(2, width * 0.08));
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.22, y + height * 0.2);
    ctx.lineTo(x + width * 0.78, y + height * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawPianoRollCanvasKeyboard(ctx, width, keyY, keyHeight, keyLayout, minMidi, maxMidi, activeKeyParts, colors) {
    ctx.save();
    ctx.lineWidth = 1;

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const x = metrics.left * width / 100;
      const w = metrics.width * width / 100;
      const activeKey = activeKeyParts.get(midi) || null;
      const activePart = activeKey?.part;
      const activeMuted = Boolean(activeKey?.muted);
      const gradient = ctx.createLinearGradient(0, keyY, 0, keyY + keyHeight);
      gradient.addColorStop(0, colors.whiteA);
      gradient.addColorStop(1, colors.whiteB);
      ctx.save();
      ctx.globalAlpha = activeMuted ? 0.42 : 1;
      ctx.fillStyle = activePart == null ? gradient : (colors.parts[activePart] || colors.parts[0]);
      ctx.fillRect(x, keyY, w, keyHeight);
      ctx.restore();
      ctx.strokeStyle = colors.whiteLine;
      ctx.strokeRect(x + 0.5, keyY + 0.5, Math.max(0, w - 1), Math.max(0, keyHeight - 1));
      ctx.fillStyle = "rgba(15, 23, 42, 0.07)";
      ctx.fillRect(x, keyY + keyHeight - Math.max(4, keyHeight * 0.18), w, Math.max(3, keyHeight * 0.18));
      if (activeMuted) drawMutedPianoKeyMark(ctx, x, keyY, w, keyHeight, colors);
    }

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (!isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const x = metrics.left * width / 100;
      const w = metrics.width * width / 100;
      const h = keyHeight * PIANO_BLACK_KEY_HEIGHT_RATIO;
      const activeKey = activeKeyParts.get(midi) || null;
      const activePart = activeKey?.part;
      const activeMuted = Boolean(activeKey?.muted);
      const gradient = ctx.createLinearGradient(0, keyY, 0, keyY + h);
      gradient.addColorStop(0, colors.blackA);
      gradient.addColorStop(1, colors.blackB);
      ctx.save();
      ctx.globalAlpha = activeMuted ? 0.46 : 1;
      ctx.fillStyle = activePart == null ? gradient : (colors.parts[activePart] || colors.parts[0]);
      drawRoundRect(ctx, x, keyY, w, h, Math.min(4, w / 2));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.stroke();
      if (activeMuted) drawMutedPianoKeyMark(ctx, x, keyY, w, h, colors);
    }

    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (isPianoBlackKey(midi)) continue;
      const metrics = keyLayout.getKeyMetrics(midi);
      const activeKey = activeKeyParts.get(midi) || null;
      drawPianoKeyLabel(
        ctx,
        midi,
        metrics.left * width / 100,
        keyY,
        metrics.width * width / 100,
        keyHeight,
        activeKey?.part,
        colors
      );
    }
    ctx.restore();
  }

  function updatePianoRoll(currentSec, durationSec, force = false) {
    if (!pianoRoll || !pianoRollCanvas) return;

    const notes = getVisiblePianoRollNotes();
    const duration = Math.max(0, Number(durationSec) || 0);
    const current = Math.max(0, Math.min(duration || Infinity, Number(currentSec) || 0));
    const bucket = Math.floor(current * (pianoRollExpanded ? 36 : 24));
    const dataSignature = buildPianoRollDataSignature(notes, duration);
    if (!force && bucket === pianoRollLastRenderBucket && dataSignature === pianoRollLastDataSignature) return;
    pianoRollLastRenderBucket = bucket;
    pianoRollLastDataSignature = dataSignature;

    const canvas = preparePianoRollCanvas();
    if (!canvas) return;
    const { ctx, width, height: stageHeight } = canvas;

    if (!notes.length || duration <= 0) {
      if (pianoRollEmpty) pianoRollEmpty.hidden = false;
      if (pianoRollRangeLabel) pianoRollRangeLabel.textContent = i18nText("roll.title");
      return;
    }

    if (pianoRollEmpty) pianoRollEmpty.hidden = true;
    const range = pianoRollRangeCache || getPianoRollRange(notes);
    pianoRollKeyMin = range.min;
    pianoRollKeyMax = range.max;
    const keyLayout = getPianoRollLayout(pianoRollKeyMin, pianoRollKeyMax);
    const keyHeight = Math.min(getPianoRollKeyHeight(), Math.max(18, stageHeight * 0.72));
    const fallAreaHeight = Math.max(12, stageHeight - keyHeight);
    const fallWindow = pianoRollExpanded ? PIANO_ROLL_FALL_WINDOW_EXPANDED : PIANO_ROLL_FALL_WINDOW_COLLAPSED;
    const pxPerSec = fallAreaHeight / fallWindow;
    const visibleEnd = current + fallWindow;
    const activeKeyParts = new Map();
    const visibleNotes = [];
    const pianoWindow = temporalWindow(pianoRollTemporalIndex || buildTemporalIndex(notes), current, visibleEnd + 0.0001);

    for (let noteIndex = pianoWindow.start; noteIndex < pianoWindow.end; noteIndex++) {
      const note = pianoWindow.list[noteIndex];
      const start = Math.max(0, Number(note.start) || 0);
      const noteDuration = Math.max(0.02, Number(note.durationSec) || 0.02);
      const end = start + noteDuration;
      // 노트의 아래쪽 끝은 발음 시작점, 위쪽 끝은 발음 종료점이다.
      // 시작점이 건반 구분선에 닿는 순간 소리가 나고, 종료점이 구분선을 지나면 완전히 사라진다.
      if (end <= current) continue;
      const midi = clampInt(Number(note.midi) || 0, 0, 127);
      if (midi < pianoRollKeyMin || midi > pianoRollKeyMax) continue;
      const part = clampInt(Number(note.part ?? 0), 0, 5);
      const muted = Boolean(note.muted);
      const active = start <= current + 0.012 && end >= current - 0.026;
      if (active) {
        const previous = activeKeyParts.get(midi);
        // 같은 건반에 음소거/재생 채널이 동시에 있으면 실제로 들리는 채널을 우선 표시한다.
        if (!previous || (previous.muted && !muted)) activeKeyParts.set(midi, { part, muted });
      }
      visibleNotes.push({ start, end, noteDuration, midi, part, active, muted });
    }

    const colors = buildPianoRollCanvasColors();
    const tempoMap = getPianoRollTempoMap();
    drawPianoRollCanvasGrid(
      ctx,
      width,
      fallAreaHeight,
      keyLayout,
      pianoRollKeyMin,
      pianoRollKeyMax,
      current,
      visibleEnd,
      pxPerSec,
      tempoMap,
      colors
    );
    drawPianoRollCanvasNotes(ctx, width, fallAreaHeight, keyLayout, visibleNotes, current, pxPerSec, colors);
    drawPianoRollCanvasTempoLines(
      ctx,
      width,
      fallAreaHeight,
      scheduleCache?.tempoMarkers || [],
      current,
      visibleEnd,
      pxPerSec,
      colors
    );
    drawPianoRollCanvasKeyboard(ctx, width, fallAreaHeight, keyHeight, keyLayout, pianoRollKeyMin, pianoRollKeyMax, activeKeyParts, colors);

    ctx.save();
    ctx.strokeStyle = colors.tempoActive;
    ctx.lineWidth = 2;
    ctx.shadowColor = colors.tempoActive;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, fallAreaHeight + 0.5);
    ctx.lineTo(width, fallAreaHeight + 0.5);
    ctx.stroke();
    ctx.restore();

    if (pianoRollRangeLabel) {
      const shown = visibleNotes.length;
      const total = notes.length;
      pianoRollRangeLabel.textContent = `${noteNameForMidi(pianoRollKeyMin)}–${noteNameForMidi(pianoRollKeyMax)} · ${shown}/${total}`;
    }
  }

  function updatePlaybackCodeHighlight(currentSec) {
    if (playbackSourceOverride || playbackMidiOriginalOverride) {
      clearPlaybackCodeHighlight();
      return;
    }
    const noteList = Array.isArray(scheduleCache?.notes) ? scheduleCache.notes : [];
    const restList = Array.isArray(scheduleCache?.rests) ? scheduleCache.rests : [];
    if (!noteList.length && !restList.length) {
      clearPlaybackCodeHighlight();
      return;
    }

    const current = Math.max(0, Number(currentSec) || 0);
    const scanBucket = Math.floor(current * 30);
    const scanSignature = `${scheduleCacheVersion}|${activeTabName}|${noteList.length}|${restList.length}|${partMuteStates.map(v => v ? "1" : "0").join("")}`;
    if (scanBucket === activePlaybackScanBucket && scanSignature === activePlaybackScanSignature) return;
    activePlaybackScanBucket = scanBucket;
    activePlaybackScanSignature = scanSignature;
    const temporalIndexes = ensureScheduleTemporalIndexes();
    const noteWindow = temporalWindow(temporalIndexes.notes, current - ACTIVE_CODE_RELEASE_SEC, current + ACTIVE_CODE_LOOKAHEAD_SEC + 0.0001);
    const restWindow = temporalWindow(temporalIndexes.rests, current - ACTIVE_CODE_RELEASE_SEC, current + ACTIVE_CODE_LOOKAHEAD_SEC + 0.0001);
    const mainRanges = [];
    const partRanges = Array.from({ length: 6 }, () => []);
    const activePartIndex = getActiveEditorPartIndex();
    const collectMainRanges = activeTabName === "main";

    const collectSourceRanges = (item, part) => {
      const sourceRanges = Array.isArray(item.sourceRanges) && item.sourceRanges.length
        ? item.sourceRanges
        : [{ start: item.sourceStart, end: item.sourceEnd, globalStart: item.globalSourceStart, globalEnd: item.globalSourceEnd }];

      for (const range of sourceRanges) {
        const partStart = Number(range?.start);
        const partEnd = Number(range?.end);
        const globalStart = Number(range?.globalStart);
        const globalEnd = Number(range?.globalEnd);
        if (part === activePartIndex && Number.isFinite(partStart) && Number.isFinite(partEnd) && partEnd > partStart) {
          partRanges[part].push({ start: partStart, end: partEnd });
        }
        if (collectMainRanges && Number.isFinite(globalStart) && Number.isFinite(globalEnd) && globalEnd > globalStart) {
          mainRanges.push({ start: globalStart, end: globalEnd });
        }
      }
    };

    const isCurrentItem = (item) => {
      const start = Number(item.start) || 0;
      const end = start + Math.max(0, Number(item.durationSec) || 0);
      return current + ACTIVE_CODE_LOOKAHEAD_SEC >= start && current <= end + ACTIVE_CODE_RELEASE_SEC;
    };

    for (let noteIndex = noteWindow.start; noteIndex < noteWindow.end; noteIndex++) {
      const note = noteWindow.list[noteIndex];
      const part = clampInt(Number(note?.part ?? 0), 0, 5);
      if (partMuteStates[part]) continue;
      if (Number(note?.volume ?? 0) <= 0) continue;
      if (!isCurrentItem(note)) continue;
      collectSourceRanges(note, part);
    }

    for (let restIndex = restWindow.start; restIndex < restWindow.end; restIndex++) {
      const rest = restWindow.list[restIndex];
      const part = clampInt(Number(rest?.part ?? 0), 0, 5);
      if (partMuteStates[part]) continue;
      if (!isCurrentItem(rest)) continue;
      collectSourceRanges(rest, part);
    }

    const compactMain = compactCodeRanges(mainRanges);
    const compactParts = partRanges.map(compactCodeRanges);
    const signature = buildActiveCodeSignature(compactMain, compactParts);
    if (signature === activePlaybackCodeSignature) return;

    activePlaybackCodeSignature = signature;
    activePlaybackMainRanges = compactMain;
    activePlaybackPartRanges = compactParts;
    updateVisibleHighlight();
  }

  function clearPlaybackCodeHighlight() {
    if (!activePlaybackCodeSignature && activePlaybackMainRanges.length === 0 && activePlaybackPartRanges.every(r => !r.length)) return;
    activePlaybackCodeSignature = "";
    activePlaybackScanBucket = -1;
    activePlaybackScanSignature = "";
    activePlaybackMainRanges = [];
    activePlaybackPartRanges = Array.from({ length: 6 }, () => []);
    updateVisibleHighlight();
  }

  function compactCodeRanges(ranges) {
    const sorted = Array.from(ranges || [])
      .map(r => ({ start: Math.max(0, Math.floor(Number(r.start) || 0)), end: Math.max(0, Math.ceil(Number(r.end) || 0)) }))
      .filter(r => r.end > r.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [];
    for (const range of sorted) {
      const last = out[out.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else out.push({ ...range });
    }
    return out;
  }

  function buildActiveCodeSignature(mainRanges, partRanges) {
    const main = (mainRanges || []).map(r => `m${r.start}:${r.end}`).join("|");
    const parts = (partRanges || []).map((ranges, i) => ranges.map(r => `p${i}:${r.start}:${r.end}`).join("|")).join("|");
    return `${main}#${parts}`;
  }

  function renderColoredMml(text, activeRanges = []) {
    const s = normalizeMmlForDisplay(text);
    const classes = createClassBuckets(s.length);
    const at = s.indexOf("@");
    const lastSemi = s.lastIndexOf(";");
    const hasHeader = /^\s*MML\s*@/i.test(s) && at >= 0;
    const bodyStart = hasHeader ? at + 1 : 0;
    const bodyEnd = lastSemi >= bodyStart ? lastSemi : s.length;

    if (hasHeader) addRangeClass(classes, 0, bodyStart, "mml-prefix");
    if (lastSemi >= bodyStart) addRangeClass(classes, bodyEnd, s.length, "mml-suffix");
    for (let i = bodyStart; i < bodyEnd; i++) {
      if (s[i] === ",") addRangeClass(classes, i, i + 1, "mml-separator");
    }

    const detailedParts = typeof splitMmlPartsDetailed === "function" ? splitMmlPartsDetailed(s).slice(0, 6) : [];
    detailedParts.forEach((info, index) => {
      const partClass = `ch${Math.min(index, 5)}`;
      addRangeClass(classes, info.sourceStart, info.sourceEnd, partClass);
      const invalid = findInvalidPartChars(info.text);
      invalid.forEach(pos => addRangeClass(classes, info.sourceStart + pos, info.sourceStart + pos + 1, "invalid-code"));
      const irregularRanges = findIrregularPartRanges(info.text);
      for (const range of irregularRanges) addRangeClass(classes, info.sourceStart + range.start, info.sourceStart + range.end, "irregular-length-code");
      const tempoRanges = findTempoHighlightRanges(info.text, invalid);
      for (const range of tempoRanges) addRangeClass(classes, info.sourceStart + range.start, info.sourceStart + range.end, "tempo-code");
    });

    for (const range of activeRanges || []) addRangeClass(classes, range.start, range.end, "mml-active-code");
    return renderClassedText(s, classes);
  }

  function renderPartWithErrors(part, activeRanges = []) {
    const text = String(part || "");
    const classes = createClassBuckets(text.length);
    const invalid = findInvalidPartChars(text);
    invalid.forEach(pos => addRangeClass(classes, pos, pos + 1, "invalid-code"));
    const irregularRanges = findIrregularPartRanges(text);
    for (const range of irregularRanges) addRangeClass(classes, range.start, range.end, "irregular-length-code");
    const tempoRanges = findTempoHighlightRanges(text, invalid);
    for (const range of tempoRanges) addRangeClass(classes, range.start, range.end, "tempo-code");
    for (const range of activeRanges || []) addRangeClass(classes, range.start, range.end, "mml-active-code");
    return renderClassedText(text, classes);
  }

  function createClassBuckets(length) {
    return Array.from({ length: Math.max(0, Number(length) || 0) }, () => []);
  }

  function addRangeClass(classes, start, end, className) {
    if (!className || !classes?.length) return;
    const from = Math.max(0, Math.min(classes.length, Math.floor(Number(start) || 0)));
    const to = Math.max(from, Math.min(classes.length, Math.ceil(Number(end) || 0)));
    for (let i = from; i < to; i++) {
      if (!classes[i].includes(className)) classes[i].push(className);
    }
  }

  function renderClassedText(text, classes) {
    const s = String(text || "");
    if (!s) return "";
    let out = "";
    let runStart = 0;
    let runKey = (classes[0] || []).join(" ");

    const flush = (to) => {
      const chunk = escapeHtml(s.slice(runStart, to));
      out += runKey ? `<span class="${runKey}">${chunk}</span>` : chunk;
    };

    for (let i = 1; i < s.length; i++) {
      const key = (classes[i] || []).join(" ");
      if (key === runKey) continue;
      flush(i);
      runStart = i;
      runKey = key;
    }
    flush(s.length);
    return out;
  }

  function findTempoHighlightRanges(part, invalid = new Set()) {
    const text = String(part || "");
    const ranges = [];
    const re = /[tT]\s*\d+/g;
    let match;
    while ((match = re.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      let hasInvalid = false;
      for (let i = start; i < end; i++) {
        if (invalid.has(i)) { hasInvalid = true; break; }
      }
      if (!hasInvalid) ranges.push({ start, end });
    }
    return ranges;
  }

  function findIrregularPartRanges(part) {
    try {
      const info = analyzeIrregularMmlLengths(String(part || ""));
      return (info?.occurrences || [])
        .map(item => ({
          start: Math.max(0, Number(item?.start) || 0),
          end: Math.max(0, Number(item?.end) || 0)
        }))
        .filter(range => range.end > range.start);
    } catch (_) {
      return [];
    }
  }

  function findInvalidPartChars(part) {
    const s = String(part || "");
    const invalid = new Set();
    let i = 0;

    const mark = (from, to) => {
      const end = Math.max(from + 1, to);
      for (let p = Math.max(0, from); p < Math.min(s.length, end); p++) invalid.add(p);
    };
    const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readNumberRange = () => {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      return { start, end: i, text: s.slice(start, i), value: i > start ? Number(s.slice(start, i)) : null };
    };
    const readDots = () => { while (s[i] === ".") i++; };
    const readLength = (cmdStart, explicitRequired) => {
      const n = readNumberRange();
      if (n.value == null) {
        if (explicitRequired) mark(cmdStart, i);
        readDots();
        return;
      }
      if (!Number.isFinite(n.value) || n.value <= 0) mark(n.start, n.end);
      readDots();
    };
    const isNote = ch => "cdefgab".includes(ch);
    const hasTieTargetAhead = from => {
      let j = from;
      const skipAheadSpace = () => { while (j < s.length && /\s/.test(s[j])) j++; };
      const readAheadDigits = () => {
        const start = j;
        while (j < s.length && /\d/.test(s[j])) j++;
        return j > start;
      };

      while (j < s.length) {
        skipAheadSpace();
        if (j >= s.length) return false;

        const raw = s[j];
        const lower = raw.toLowerCase();
        if (isNote(lower) || lower === "r" || lower === "n") return true;

        if (raw === ">" || raw === "<") {
          j++;
          continue;
        }

        if ("tolv".includes(lower)) {
          j++;
          if (!readAheadDigits()) return false;
          if (lower === "l") {
            while (s[j] === ".") j++;
          }
          continue;
        }

        return false;
      }
      return false;
    };

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const start = i;
      const ch = s[i];
      const lower = ch.toLowerCase();

      if (isNote(lower)) {
        if (ch !== lower) mark(start, start + 1);
        i++;
        if (s[i] === "+" || s[i] === "#" || s[i] === "-") i++;
        readLength(start, false);
      } else if (lower === "r") {
        if (ch !== "r") mark(start, start + 1);
        i++;
        readLength(start, false);
      } else if (lower === "n") {
        if (ch !== "n") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 127) mark(n.start, n.end);
        readDots();
      } else if (lower === "t") {
        if (ch !== "T") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 32 || n.value > 255) mark(n.start, n.end);
      } else if (lower === "o") {
        if (ch !== "O") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 9) mark(n.start, n.end);
      } else if (lower === "l") {
        if (ch !== "L") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null || !Number.isFinite(n.value) || n.value <= 0) mark(n.start === n.end ? start : n.start, n.end);
        readDots();
      } else if (lower === "v") {
        if (ch !== "V") mark(start, start + 1);
        i++;
        const n = readNumberRange();
        if (n.value == null) mark(start, i);
        else if (n.value < 0 || n.value > 15) mark(n.start, n.end);
      } else if (ch === ">" || ch === "<") {
        i++;
      } else if (ch === "&") {
        i++;
        if (!hasTieTargetAhead(i)) mark(start, start + 1);
      } else if (ch === "." || ch === "+" || ch === "#" || ch === "-" || ch === "[" || ch === "]" || ch === ";" || ch === ",") {
        mark(start, start + 1);
        i++;
      } else if (/\d/.test(ch)) {
        const n = readNumberRange();
        mark(n.start, n.end);
      } else {
        mark(start, start + 1);
        i++;
      }
    }
    return invalid;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }


  window.MobibardMidiEditor = {
    hasSource() { return Boolean(pendingMidiImport && pendingMidiSettings); },
    isDirty() {
      const signature = getMidiConvertSettingsSignature();
      return Boolean(signature && signature !== midiLastAppliedSignature);
    },
    async buildPendingPreviewMml() {
      if (!pendingMidiImport || !pendingMidiSettings) return "";
      const options = collectMidiConvertOptions();
      await waitForBrowserPaint();
      const result = midiToMml(pendingMidiImport.bytes, pendingMidiImport.name, options);
      return normalizeImportedFullMml(result.mml).mml;
    },
    cancelPending() {
      if (!pendingMidiSettings || !midiAppliedSettingsSnapshot) return false;
      pendingMidiSettings = cloneMidiPendingSettings(midiAppliedSettingsSnapshot);
      updateMidiConvertSummary();
      updateMidiQuantizeToggle();
      renderMidiRoleList();
      renderActiveMidiInstrumentList();
      updateMidiRoleControls();
      try { window.dispatchEvent(new CustomEvent("mobibard:midi-settings-cancelled")); } catch (_) {}
      return true;
    },
    exportSessionState() {
      if (!pendingMidiImport || !pendingMidiSettings) return null;
      return {
        version: 1,
        pendingMidiImport: cloneMidiImportData(pendingMidiImport),
        pendingMidiSettings: cloneMidiPendingSettings(pendingMidiSettings),
        appliedSettings: cloneMidiPendingSettings(midiAppliedSettingsSnapshot || pendingMidiSettings),
        lastAppliedSignature: midiLastAppliedSignature,
        sectionOpenState: Object.fromEntries(
          MIDI_INSTRUMENT_CATEGORY_ORDER
            .filter(category => midiInstrumentSectionOpenState.has(category))
            .map(category => [category, midiInstrumentSectionOpenState.get(category) !== false])
        )
      };
    },
    restoreSessionState(snapshot) { return restoreMidiPlayerUiSnapshot(snapshot); }
  };
};
