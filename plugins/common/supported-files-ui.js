(() => {
  "use strict";

  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before supported-files-ui.js");

  const I18N = {
    ko: {
      button: "지원 파일",
      title: "지원 파일",
      close: "닫기",
      standard: "표준 음악 · 악보",
      editor: "음악 편집기",
      console: "콘솔",
      vocal: "보컬 편집기",
      project: "프로젝트 · MML",
      audio: "오디오 참고 파일",
      network: "처음 불러올 때 인터넷 연결 필요",
      commonNote: "음표·템포·박자는 MIDI로 변환해 가져옵니다. 각 프로그램 고유의 레이아웃, 가사 발음, 보컬 표현과 기타 주법 일부는 단순화될 수 있습니다.",
      pickerAll: "지원 파일",
      pickerMidi: "MIDI · KAR",
      pickerPlayStation: "PlayStation",
      pickerNintendo: "Nintendo",
      pickerSega: "Sega",
      pickerChipLog: "VGM · GYM · S98",
      pickerTracker: "Tracker",
      pickerLegacyPc: "XMI · HMP · HMI",
      pickerFinale: "Finale",
      pickerMusicXml: "MusicXML",
      pickerMnx: "MNX",
      pickerMuseScore: "MuseScore",
      pickerGuitarPro: "Guitar Pro",
      pickerVocaloid: "VOCALOID",
      pickerUtau: "UTAU",
      pickerOpenUtau: "OpenUtau",
      pickerSynthV: "Synthesizer V",
      pickerCevio: "CeVIO",
      pickerMml: "3MLE · MabiIcco · MML",
      pickerProject: "모비바드 프로젝트",
      pickerSoundFont: "SoundFont",
      pickerDls: "DLS 음원",
      pickerAudio: "오디오",
    },
    ja: {
      button: "対応ファイル",
      title: "対応ファイル",
      close: "閉じる",
      standard: "標準音楽・楽譜",
      editor: "音楽エディター",
      console: "ゲーム機",
      vocal: "ボーカルエディター",
      project: "プロジェクト・MML",
      audio: "参照オーディオ",
      network: "初回読込時にインターネット接続が必要",
      commonNote: "音符・テンポ・拍子をMIDIへ変換して読み込みます。固有のレイアウト、発音、ボーカル表現や奏法の一部は簡略化される場合があります。",
      pickerAll: "対応ファイル",
      pickerMidi: "MIDI・KAR",
      pickerPlayStation: "PlayStation",
      pickerNintendo: "Nintendo",
      pickerSega: "Sega",
      pickerChipLog: "VGM · GYM · S98",
      pickerTracker: "Tracker",
      pickerLegacyPc: "XMI · HMP · HMI",
      pickerFinale: "Finale",
      pickerMusicXml: "MusicXML",
      pickerMnx: "MNX",
      pickerMuseScore: "MuseScore",
      pickerGuitarPro: "Guitar Pro",
      pickerVocaloid: "VOCALOID",
      pickerUtau: "UTAU",
      pickerOpenUtau: "OpenUtau",
      pickerSynthV: "Synthesizer V",
      pickerCevio: "CeVIO",
      pickerMml: "3MLE・MabiIcco・MML",
      pickerProject: "Mobibardプロジェクト",
      pickerSoundFont: "SoundFont",
      pickerDls: "DLSサウンド",
      pickerAudio: "オーディオ",
    },
    en: {
      button: "Supported files",
      title: "Supported files",
      close: "Close",
      standard: "Standard music · notation",
      editor: "Music editor projects",
      console: "Console sequences",
      vocal: "Vocal editors",
      project: "Projects · MML",
      audio: "Reference audio",
      network: "Internet connection required on first import",
      commonNote: "Notes, tempo and time signatures are converted through MIDI. App-specific layout, phonemes, vocal expression and some playing techniques may be simplified.",
      pickerAll: "Supported files",
      pickerMidi: "MIDI · KAR",
      pickerPlayStation: "PlayStation",
      pickerNintendo: "Nintendo",
      pickerSega: "Sega",
      pickerChipLog: "VGM · GYM · S98",
      pickerTracker: "Tracker",
      pickerLegacyPc: "XMI · HMP · HMI",
      pickerFinale: "Finale",
      pickerMusicXml: "MusicXML",
      pickerMnx: "MNX",
      pickerMuseScore: "MuseScore",
      pickerGuitarPro: "Guitar Pro",
      pickerVocaloid: "VOCALOID",
      pickerUtau: "UTAU",
      pickerOpenUtau: "OpenUtau",
      pickerSynthV: "Synthesizer V",
      pickerCevio: "CeVIO",
      pickerMml: "3MLE · MabiIcco · MML",
      pickerProject: "Mobibard projects",
      pickerSoundFont: "SoundFont",
      pickerDls: "DLS sound banks",
      pickerAudio: "Audio",
    },
    "zh-CN": {
      button: "支持文件",
      title: "支持文件",
      close: "关闭",
      standard: "标准音乐 · 乐谱",
      editor: "音乐编辑器",
      console: "游戏机",
      vocal: "歌声编辑器",
      project: "工程 · MML",
      audio: "参考音频",
      network: "首次导入时需要联网",
      commonNote: "音符、速度和拍号会先转换为 MIDI。各软件特有的排版、音素、歌声表现及部分演奏技法可能会被简化。",
      pickerAll: "支持文件",
      pickerMidi: "MIDI · KAR",
      pickerPlayStation: "PlayStation",
      pickerNintendo: "Nintendo",
      pickerSega: "Sega",
      pickerChipLog: "VGM · GYM · S98",
      pickerTracker: "Tracker",
      pickerLegacyPc: "XMI · HMP · HMI",
      pickerFinale: "Finale",
      pickerMusicXml: "MusicXML",
      pickerMnx: "MNX",
      pickerMuseScore: "MuseScore",
      pickerGuitarPro: "Guitar Pro",
      pickerVocaloid: "VOCALOID",
      pickerUtau: "UTAU",
      pickerOpenUtau: "OpenUtau",
      pickerSynthV: "Synthesizer V",
      pickerCevio: "CeVIO",
      pickerMml: "3MLE · MabiIcco · MML",
      pickerProject: "Mobibard 工程",
      pickerSoundFont: "SoundFont",
      pickerDls: "DLS 音源",
      pickerAudio: "音频",
    },
    "zh-TW": {
      button: "支援檔案",
      title: "支援檔案",
      close: "關閉",
      standard: "標準音樂 · 樂譜",
      editor: "音樂編輯器",
      console: "遊戲主機",
      vocal: "歌聲編輯器",
      project: "專案 · MML",
      audio: "參考音訊",
      network: "首次匯入時需要連線",
      commonNote: "音符、速度與拍號會先轉換為 MIDI。各軟體特有的版面、音素、歌聲表現及部分演奏技法可能會被簡化。",
      pickerAll: "支援檔案",
      pickerMidi: "MIDI · KAR",
      pickerPlayStation: "PlayStation",
      pickerNintendo: "Nintendo",
      pickerSega: "Sega",
      pickerChipLog: "VGM · GYM · S98",
      pickerTracker: "Tracker",
      pickerLegacyPc: "XMI · HMP · HMI",
      pickerFinale: "Finale",
      pickerMusicXml: "MusicXML",
      pickerMnx: "MNX",
      pickerMuseScore: "MuseScore",
      pickerGuitarPro: "Guitar Pro",
      pickerVocaloid: "VOCALOID",
      pickerUtau: "UTAU",
      pickerOpenUtau: "OpenUtau",
      pickerSynthV: "Synthesizer V",
      pickerCevio: "CeVIO",
      pickerMml: "3MLE · MabiIcco · MML",
      pickerProject: "Mobibard 專案",
      pickerSoundFont: "SoundFont",
      pickerDls: "DLS 音源",
      pickerAudio: "音訊",
    },
  };

  const EXTRA = {
    simple: [],
    player: [
      { category: "project", label: "3MLE / MabiIcco / MML", extensions: ["mml", "mmi", "txt"], description: "3MLE(.mml) · MabiIcco/마비꼬(.mmi) · MML 텍스트(.txt)" },
    ],
    editor: [
      { category: "project", label: "모비바드 프로젝트", extensions: ["mmlproj", "mmlproj.json", "json"], description: "피아노롤 편집 프로젝트" },
      { category: "project", label: "3MLE / MabiIcco / MML", extensions: ["mml", "3mle", "mmi", "txt"], description: "3MLE(.mml/.3mle) · MabiIcco/마비꼬(.mmi) · MML 텍스트(.txt)" },
      { category: "audio", label: "오디오", extensions: ["wav", "mp3", "ogg", "m4a", "aac", "flac", "webm"], description: "편집용 참고 오디오" },
    ],
  };

  const MAC_BINARY_EXTENSIONS = Object.freeze(["bin", "macbin"]);

  const PICKER_GROUPS = Object.freeze([
    { id: "midi", labelKey: "pickerMidi", formatIds: ["midi"], includeMacBinary: true, mimeType: "audio/midi" },
    { id: "legacy-pc", labelKey: "pickerLegacyPc", formatIds: ["xmi", "hmp", "hmi"], mimeType: "application/octet-stream" },
    { id: "tracker", labelKey: "pickerTracker", formatIds: ["tracker-module"], mimeType: "application/octet-stream" },
    { id: "musicxml", labelKey: "pickerMusicXml", formatIds: ["musicxml"], mimeType: "application/xml" },
    { id: "mnx", labelKey: "pickerMnx", formatIds: ["mnx"], mimeType: "application/json" },
    { id: "finale", labelKey: "pickerFinale", formatIds: ["finale-mus", "finale-musx"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "musescore", labelKey: "pickerMuseScore", formatIds: ["musescore"], mimeType: "application/octet-stream" },
    { id: "guitarpro", labelKey: "pickerGuitarPro", formatIds: ["gp3", "gp5"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "playstation", labelKey: "pickerPlayStation", formatIds: ["playstation-sequence", "playstation-xsf"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "nintendo", labelKey: "pickerNintendo", formatIds: ["nintendo-sequence", "nintendo-xsf"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "sega", labelKey: "pickerSega", formatIds: ["sega-saturn-sequence", "sega-megadrive-xgm"], mimeType: "application/octet-stream" },
    { id: "chiplog", labelKey: "pickerChipLog", formatIds: ["sega-vgm", "sega-gym", "s98"], mimeType: "application/octet-stream" },
    { id: "vocaloid", labelKey: "pickerVocaloid", formatIds: ["vsq", "vsqx", "vpr"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "utau", labelKey: "pickerUtau", formatIds: ["ust"], mimeType: "text/plain" },
    { id: "openutau", labelKey: "pickerOpenUtau", formatIds: ["ustx"], mimeType: "application/octet-stream" },
    { id: "synthv", labelKey: "pickerSynthV", formatIds: ["svp", "s5p"], mimeType: "application/octet-stream" },
    { id: "cevio", labelKey: "pickerCevio", formatIds: ["ccs"], mimeType: "application/xml" },
    { id: "project", labelKey: "pickerProject", extensions: ["mmlproj", "mmlproj.json", "json"], mimeType: "application/json" },
    { id: "mml", labelKey: "pickerMml", extensions: ["mml", "mmi", "3mle", "txt"], mimeType: "text/plain" },
    { id: "soundfont", labelKey: "pickerSoundFont", extensions: ["sf2", "sf3"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "dls", labelKey: "pickerDls", extensions: ["dls"], includeMacBinary: true, mimeType: "application/octet-stream" },
    { id: "audio", labelKey: "pickerAudio", extensions: ["wav", "mp3", "ogg", "m4a", "aac", "flac", "webm"], mimeType: "audio/*" },
  ]);

  const POPUP_FAMILIES = Object.freeze([
    {
      id: "legacy-pc", labelKey: "pickerLegacyPc", category: "standard", formatIds: ["xmi", "hmp", "hmi"],
      description: "Miles XMIDI(XMI)와 Human Machine Interfaces의 HMP/HMI 시퀀스를 MIDI로 변환합니다.",
      limitation: "드라이버 전용 루프·브랜치·콜백 정보는 일반 MIDI 연주 정보로 단순화될 수 있습니다.",
    },
    {
      id: "tracker", labelKey: "pickerTracker", category: "standard", formatIds: ["tracker-module"],
      description: "MOD/S3M/XM/IT Tracker 패턴의 노트·템포·볼륨을 MIDI로 변환합니다.",
      limitation: "샘플 음색과 포르타멘토·필터·샘플 오프셋 등 Tracker 고유 효과 일부는 단순화됩니다.",
    },
    {
      id: "finale", labelKey: "pickerFinale", category: "editor", formatIds: ["finale-mus", "finale-musx"],
      description: "Finale MUS/MUSX 프로젝트를 음표·쉼표·박자·조표 중심으로 MIDI로 변환합니다.",
      limitation: "아티큘레이션·표현 기호·고급 재생 데이터와 일부 레이아웃은 단순화됩니다.",
    },
    {
      id: "guitarpro", labelKey: "pickerGuitarPro", category: "editor", formatIds: ["gp3", "gp5"],
      description: "Guitar Pro 3/5 프로젝트를 트랙별 MIDI로 변환합니다.",
      limitation: "프렛·주법·표현 기호 등 Guitar Pro 고유 정보 일부는 단순화됩니다.",
    },
    {
      id: "vocaloid", labelKey: "pickerVocaloid", category: "vocal", formatIds: ["vsq", "vsqx", "vpr"],
      description: "VOCALOID 2~6의 시퀀스/프로젝트에서 음표·템포 중심의 연주 정보를 가져옵니다.",
      limitation: "보이스뱅크·음소·피치 곡선과 보컬 표현 파라미터는 단순화되거나 제외됩니다.",
    },
    { id: "utau", labelKey: "pickerUtau", category: "vocal", formatIds: ["ust"] },
    { id: "openutau", labelKey: "pickerOpenUtau", category: "vocal", formatIds: ["ustx"] },
    {
      id: "synthv", labelKey: "pickerSynthV", category: "vocal", formatIds: ["svp", "s5p"],
      description: "Synthesizer V 프로젝트에서 음표·템포 중심의 연주 정보를 가져옵니다.",
      limitation: "가수·음소·피치·보컬 표현 데이터는 제외됩니다.",
    },
    { id: "cevio", labelKey: "pickerCevio", category: "vocal", formatIds: ["ccs"] },
    {
      id: "playstation", labelKey: "pickerPlayStation", category: "console", formatIds: ["playstation-sequence", "playstation-xsf"],
      description: "PlayStation SEQ/SEP, PS2 SQ/BQ와 PSF/PSF2 컨테이너 안의 MIDI·Sony 시퀀스·SquareSoft AKAO v1.0/v2를 MIDI로 변환합니다.",
      limitation: "라이브러리 결합이 실제로 필요한 MiniPSF는 제한될 수 있습니다.",
    },
    {
      id: "nintendo", labelKey: "pickerNintendo", category: "console", formatIds: ["nintendo-sequence", "nintendo-xsf"],
      description: "Nintendo DS/Wii/3DS/Wii U/Switch 시퀀스 및 사운드 아카이브와 NCSF/2SF의 내장 SDAT/SSEQ 데이터를 MIDI로 변환합니다.",
      limitation: "라이브러리나 ROM/게임 고유 사운드 드라이버 복원이 필요한 Mini xSF는 단독 변환이 제한될 수 있습니다.",
    },
    {
      id: "sega", labelKey: "pickerSega", category: "console", formatIds: ["sega-saturn-sequence", "sega-megadrive-xgm"],
      description: "Sega Saturn SEQ와 Mega Drive/Genesis XGM/XGM2의 시퀀스·FM/PSG 연주 정보를 MIDI로 변환합니다.",
      limitation: "Saturn 전용 음색과 XGM의 FM/PSG·PCM 표현은 GM 음표/악기로 근사되며 일부 칩 고유 효과는 단순화됩니다.",
    },
    {
      id: "chiplog", labelKey: "pickerChipLog", category: "console", formatIds: ["sega-vgm", "sega-gym", "s98"],
      description: "VGM/VGZ, Mega Drive GYM, S98 사운드칩 로그에서 FM/PSG 주파수와 Key On/Off를 복원해 MIDI로 변환합니다.",
      limitation: "음정이 안정적으로 복원되는 FM/PSG 채널을 중심으로 변환하며 PCM/DAC·노이즈·리듬/ADPCM·칩 고유 효과는 제외되거나 단순화됩니다.",
    },
  ]);

  function language() {
    const raw = String(document.documentElement.lang || navigator.language || "ko").toLowerCase();
    if (raw.startsWith("ja")) return "ja";
    if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-mo") || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh")) return "zh-CN";
    if (raw.startsWith("en")) return "en";
    return "ko";
  }

  function strings() {
    return I18N[language()] || I18N.ko;
  }

  function normalizeExtension(value) {
    return String(value || "").trim().toLowerCase().replace(/^\.+/, "");
  }

  function uniqueExtensions(values) {
    return Array.from(new Set((values || []).map(normalizeExtension).filter(Boolean)));
  }

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
      .mabi-supported-files-close{box-sizing:border-box;display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;margin:0;padding:0;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:50%;appearance:none;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;line-height:0;cursor:pointer}
      .mabi-supported-files-close:hover{background:color-mix(in srgb,currentColor 14%,transparent);border-color:color-mix(in srgb,currentColor 24%,transparent)}
      .mabi-supported-files-close:focus-visible{outline:2px solid color-mix(in srgb,#4b7bec 78%,transparent);outline-offset:2px}
      .mabi-supported-files-close svg{display:block;width:17px;height:17px;overflow:visible;pointer-events:none}
      .mabi-supported-files-close path{fill:none;stroke:currentColor;stroke-width:2.25;stroke-linecap:round;vector-effect:non-scaling-stroke}
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

  function popupFamilyFor(format) {
    return POPUP_FAMILIES.find(group =>
      group.formatIds?.includes(format.id) || group.categories?.includes(format.category)
    ) || null;
  }

  function groupFormatsForPopup(formats, t) {
    const result = [];
    const emitted = new Set();
    for (const format of formats) {
      const family = popupFamilyFor(format);
      if (!family) {
        result.push({ ...format });
        continue;
      }
      if (emitted.has(family.id)) continue;
      emitted.add(family.id);
      const members = formats.filter(item =>
        family.formatIds?.includes(item.id) || family.categories?.includes(item.category)
      );
      result.push({
        id: `family-${family.id}`,
        label: t[family.labelKey] || members[0]?.label || family.id,
        category: family.category || members[0]?.category || "standard",
        extensions: uniqueExtensions(members.flatMap(item => item.extensions || [])),
        description: family.description || (members.length === 1 ? (members[0]?.description || "") : ""),
        limitation: family.limitation || (members.length === 1 ? (members[0]?.limitation || "") : ""),
        requiresNetwork: members.some(item => item.requiresNetwork),
      });
    }
    return result;
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
      <header class="mabi-supported-files-head">
        <h2 class="mabi-supported-files-title"></h2>
        <button class="mabi-supported-files-close" type="button" aria-label="">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>
        </button>
      </header>
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
      closeButton.setAttribute("title", t.close);
      const formats = groupFormatsForPopup(core.listFormats(), t);
      const items = [...formats, ...(EXTRA[context] || [])];
      const categoryOrder = ["standard", "editor", "console", "vocal", "project", "audio"];
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

  function acceptExtensions(input) {
    const extensions = String(input?.getAttribute?.("accept") || "")
      .split(",")
      .map(value => value.trim())
      .filter(value => value.startsWith("."))
      .map(normalizeExtension);
    if (input?.hasAttribute?.("data-music-format-input")) {
      extensions.push(...(core.inputExtensions?.() || core.supportedExtensions?.() || []));
    }
    return uniqueExtensions(extensions);
  }

  function extensionsForPickerGroup(group, formats, allowed) {
    const nativeExtensions = [...(group.extensions || [])];
    for (const format of formats) {
      if (group.formatIds?.includes(format.id) || group.categories?.includes(format.category)) {
        nativeExtensions.push(...(format.extensions || []));
      }
    }

    const extensions = uniqueExtensions(nativeExtensions).filter(extension => !allowed || allowed.has(extension));
    if (!extensions.length) return [];
    if (group.includeMacBinary) {
      extensions.push(...MAC_BINARY_EXTENSIONS.filter(extension => !allowed || allowed.has(extension)));
    }
    return uniqueExtensions(extensions);
  }

  function filePickerType(description, extensions, mimeType = "application/octet-stream") {
    const suffixes = uniqueExtensions(extensions)
      .map(extension => `.${extension}`)
      .filter(extension => extension.length <= 17 && !/[\\/]/.test(extension) && !extension.endsWith("."));
    if (!suffixes.length) return null;
    return {
      description: String(description || "Files"),
      accept: { [mimeType]: suffixes },
    };
  }

  function buildPickerTypes(input) {
    const allowed = new Set(acceptExtensions(input));
    if (!allowed.size) return [];

    const t = strings();
    const formats = core.listFormats();
    const allExtensions = Array.from(allowed);
    const allType = filePickerType(t.pickerAll, allExtensions);
    if (!allType) return [];

    const result = [allType];
    const signatures = new Set([allExtensions.slice().sort().join("|")]);
    for (const group of PICKER_GROUPS) {
      const extensions = extensionsForPickerGroup(group, formats, allowed);
      if (!extensions.length) continue;
      const signature = extensions.slice().sort().join("|");
      if (signatures.has(signature)) continue;
      const type = filePickerType(t[group.labelKey] || group.id, extensions, group.mimeType);
      if (!type) continue;
      signatures.add(signature);
      result.push(type);
    }
    return result;
  }

  function assignFiles(input, files) {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return false;
    if (!input.multiple) selected.splice(1);

    const transfer = new DataTransfer();
    for (const file of selected) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function openFileInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || input.disabled) return false;
    input.value = "";

    if (typeof window.showOpenFilePicker !== "function") {
      input.click();
      return false;
    }

    const types = buildPickerTypes(input);
    const options = { multiple: Boolean(input.multiple) };
    if (types.length) {
      options.types = types;
      options.excludeAcceptAllOption = true;
    }

    try {
      const handles = await window.showOpenFilePicker(options);
      const files = await Promise.all(handles.map(handle => handle.getFile()));
      input.__mabiFileHandles = handles;
      return assignFiles(input, files);
    } catch (error) {
      if (error?.name === "AbortError") return false;
      console.warn("[Mobibard] Grouped file picker failed; using the browser file input instead.", error);
      input.click();
      return false;
    }
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

  window.MabiSupportedFilesUi = Object.freeze({
    version: "5.1.0",
    mount,
    syncMusicFormatInputs,
    buildPickerTypes,
    openFileInput,
  });
})();
