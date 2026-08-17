(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before supported-files-ui.js");

  const I18N = {
    ko: {
      button: "지원 파일",
      title: "지원 파일 형식",
      close: "닫기",
      basic: "기본 음악 파일",
      tablature: "TAB 악보",
      vocal: "보컬 시퀀스",
      project: "프로젝트 · MML",
      audio: "오디오 참고 파일",
      network: "처음 불러올 때 인터넷 연결 필요",
      commonNote: "음표·템포·박자는 MIDI로 변환해 가져옵니다. 각 프로그램 고유의 레이아웃, 가사 발음, 보컬 표현과 기타 주법 일부는 단순화될 수 있습니다.",
    },
    ja: {
      button: "対応ファイル",
      title: "対応ファイル形式",
      close: "閉じる",
      basic: "基本音楽ファイル",
      tablature: "TAB譜",
      vocal: "ボーカルシーケンス",
      project: "プロジェクト・MML",
      audio: "参照オーディオ",
      network: "初回読込時にインターネット接続が必要",
      commonNote: "音符・テンポ・拍子をMIDIへ変換して読み込みます。固有のレイアウト、発音、ボーカル表現や奏法の一部は簡略化される場合があります。",
    },
    en: {
      button: "Supported files",
      title: "Supported file formats",
      close: "Close",
      basic: "Core music files",
      tablature: "Tablature",
      vocal: "Vocal sequences",
      project: "Projects · MML",
      audio: "Reference audio",
      network: "Internet connection required on first import",
      commonNote: "Notes, tempo and time signatures are converted through MIDI. App-specific layout, phonemes, vocal expression and some playing techniques may be simplified.",
    },
    "zh-CN": {
      button: "支持文件",
      title: "支持的文件格式",
      close: "关闭",
      basic: "基本音乐文件",
      tablature: "吉他谱",
      vocal: "歌声序列",
      project: "工程 · MML",
      audio: "参考音频",
      network: "首次导入时需要联网",
      commonNote: "音符、速度和拍号会先转换为 MIDI。各软件特有的排版、音素、歌声表现及部分演奏技法可能会被简化。",
    },
    "zh-TW": {
      button: "支援檔案",
      title: "支援的檔案格式",
      close: "關閉",
      basic: "基本音樂檔案",
      tablature: "吉他譜",
      vocal: "歌聲序列",
      project: "專案 · MML",
      audio: "參考音訊",
      network: "首次匯入時需要連線",
      commonNote: "音符、速度與拍號會先轉換為 MIDI。各軟體特有的版面、音素、歌聲表現及部分演奏技法可能會被簡化。",
    },
  };

  const EXTRA = {
    simple: [],
    player: [
      { category: "project", label: "MML / MMI", extensions: ["mml", "mmi", "txt"], description: "마비노기 MML 및 모비바드 MMI" },
    ],
    editor: [
      { category: "project", label: "모비바드 프로젝트", extensions: ["mmlproj", "mmlproj.json", "json"], description: "피아노롤 편집 프로젝트" },
      { category: "project", label: "MML / 3MLE / MMI", extensions: ["mml", "3mle", "mmi", "txt"], description: "MML 텍스트와 호환 편집 파일" },
      { category: "audio", label: "오디오", extensions: ["wav", "mp3", "ogg", "m4a", "aac", "flac", "webm"], description: "편집용 참고 오디오" },
    ],
  };

  function language() {
    const raw = String(document.documentElement.lang || navigator.language || "ko").toLowerCase();
    if (raw.startsWith("ja")) return "ja";
    if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-mo") || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh")) return "zh-CN";
    if (raw.startsWith("en")) return "en";
    return "ko";
  }

  function strings() { return I18N[language()] || I18N.ko; }

  function addStyles() {
    if (document.getElementById("mabiSupportedFilesStyles")) return;
    const style = document.createElement("style");
    style.id = "mabiSupportedFilesStyles";
    style.textContent = `
      .mabi-supported-files-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 11px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:999px;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;font:inherit;font-size:12px;font-weight:700;line-height:1;cursor:pointer;white-space:nowrap}
      .mabi-supported-files-button:hover{background:color-mix(in srgb,currentColor 10%,transparent);border-color:color-mix(in srgb,currentColor 38%,transparent)}
      .mabi-supported-files-button::before{content:"";width:15px;height:15px;background:currentColor;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 13h8m-8 4h8'/%3E%3C/svg%3E") center/contain no-repeat}
      .mabi-supported-files-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(9,13,20,.56);backdrop-filter:blur(5px)}
      .mabi-supported-files-backdrop[hidden]{display:none!important}
      .mabi-supported-files-dialog{width:min(720px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:20px;background:var(--surface,#fff);color:var(--text,#1d2430);box-shadow:0 24px 80px rgba(0,0,0,.28);padding:0}
      [data-theme="dark"] .mabi-supported-files-dialog{background:var(--surface,#20242c);color:var(--text,#edf0f4)}
      .mabi-supported-files-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);background:inherit}
      .mabi-supported-files-title{margin:0;font-size:20px;line-height:1.2}
      .mabi-supported-files-close{width:34px;height:34px;border:0;border-radius:50%;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font-size:24px;line-height:1;cursor:pointer}
      .mabi-supported-files-body{display:grid;gap:20px;padding:20px}
      .mabi-supported-files-note{margin:0;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,#4b7bec 10%,transparent);font-size:13px;line-height:1.55}
      .mabi-supported-files-group{display:grid;gap:9px}
      .mabi-supported-files-group h3{margin:0;font-size:14px}
      .mabi-supported-files-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .mabi-supported-file-item{min-width:0;padding:11px 12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 3%,transparent)}
      .mabi-supported-file-name{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:13px;font-weight:800}
      .mabi-supported-file-exts{display:inline-flex;flex-wrap:wrap;gap:4px}
      .mabi-supported-file-ext{padding:2px 6px;border-radius:999px;background:color-mix(in srgb,#4b7bec 14%,transparent);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;font-weight:700}
      .mabi-supported-file-desc,.mabi-supported-file-limit{display:block;margin-top:5px;font-size:11px;line-height:1.45;opacity:.72;overflow-wrap:anywhere}
      .mabi-supported-file-limit{opacity:.58}
      .mabi-supported-file-network{display:inline-flex;margin-top:6px;padding:3px 6px;border-radius:6px;background:color-mix(in srgb,#f59f00 14%,transparent);font-size:10px;font-weight:700}
      @media(max-width:560px){.mabi-supported-files-backdrop{padding:10px}.mabi-supported-files-dialog{max-height:calc(100dvh - 20px);border-radius:16px}.mabi-supported-files-head{padding:15px 16px}.mabi-supported-files-body{padding:16px}.mabi-supported-files-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function itemMarkup(item, t) {
    const extensions = (item.extensions || []).map(ext => `<span class="mabi-supported-file-ext">.${String(ext).replace(/^\./, "")}</span>`).join("");
    const showKoreanDetails = language() === "ko";
    return `<div class="mabi-supported-file-item">
      <div class="mabi-supported-file-name"><span>${item.label}</span><span class="mabi-supported-file-exts">${extensions}</span></div>
      ${showKoreanDetails && item.description ? `<span class="mabi-supported-file-desc">${item.description}</span>` : ""}
      ${showKoreanDetails && item.limitation ? `<span class="mabi-supported-file-limit">${item.limitation}</span>` : ""}
      ${item.requiresNetwork ? `<span class="mabi-supported-file-network">${t.network}</span>` : ""}
    </div>`;
  }

  function createDialog(context) {
    const backdrop = document.createElement("div");
    backdrop.className = "mabi-supported-files-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `<section class="mabi-supported-files-dialog" role="dialog" aria-modal="true">
      <header class="mabi-supported-files-head"><h2 class="mabi-supported-files-title"></h2><button class="mabi-supported-files-close" type="button" aria-label="">×</button></header>
      <div class="mabi-supported-files-body"></div>
    </section>`;
    document.body.appendChild(backdrop);
    const dialog = backdrop.querySelector(".mabi-supported-files-dialog");
    const closeButton = backdrop.querySelector(".mabi-supported-files-close");
    let previousFocus = null;

    function render() {
      const t = strings();
      backdrop.querySelector(".mabi-supported-files-title").textContent = t.title;
      closeButton.setAttribute("aria-label", t.close);
      const formats = core.listFormats().map(format => ({ ...format }));
      const items = [...formats, ...(EXTRA[context] || [])];
      const categoryOrder = ["basic", "tablature", "vocal", "project", "audio"];
      const body = backdrop.querySelector(".mabi-supported-files-body");
      body.innerHTML = `<p class="mabi-supported-files-note">${t.commonNote}</p>` + categoryOrder.map(category => {
        const categoryItems = items.filter(item => item.category === category);
        if (!categoryItems.length) return "";
        return `<section class="mabi-supported-files-group"><h3>${t[category]}</h3><div class="mabi-supported-files-list">${categoryItems.map(item => itemMarkup(item, t)).join("")}</div></section>`;
      }).join("");
    }

    function open(trigger) {
      render();
      previousFocus = trigger || document.activeElement;
      backdrop.hidden = false;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => closeButton.focus());
    }
    function close() {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      document.body.style.overflow = "";
      previousFocus?.focus?.();
    }
    closeButton.addEventListener("click", close);
    backdrop.addEventListener("pointerdown", event => { if (event.target === backdrop) close(); });
    dialog.addEventListener("pointerdown", event => event.stopPropagation());
    document.addEventListener("keydown", event => { if (!backdrop.hidden && event.key === "Escape") close(); });
    return { open, close, render };
  }


  function syncMusicFormatInputs() {
    const formatAccept = core.acceptAttribute().split(",").map(value => value.trim()).filter(Boolean);
    for (const input of document.querySelectorAll("input[type=file][data-music-format-input]")) {
      const current = String(input.getAttribute("accept") || "").split(",").map(value => value.trim()).filter(Boolean);
      input.setAttribute("accept", Array.from(new Set([...current, ...formatAccept])).join(","));
    }
  }

  function mount() {
    addStyles();
    syncMusicFormatInputs();
    const dialogs = new Map();
    const buttons = Array.from(document.querySelectorAll("[data-supported-files-button]"));
    for (const button of buttons) {
      const context = button.dataset.supportedFilesContext || "simple";
      if (!dialogs.has(context)) dialogs.set(context, createDialog(context));
      const update = () => {
        const t = strings();
        button.textContent = t.button;
        button.setAttribute("aria-label", t.title);
        button.setAttribute("title", t.title);
      };
      update();
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        dialogs.get(context).open(button);
      });
      button.__mabiSupportedFilesUpdate = update;
    }
    const observer = new MutationObserver(() => {
      for (const button of buttons) button.__mabiSupportedFilesUpdate?.();
      for (const dialog of dialogs.values()) dialog.render();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();

  window.MabiSupportedFilesUi = Object.freeze({ mount, syncMusicFormatInputs });
})();
