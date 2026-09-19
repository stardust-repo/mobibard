(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-mbt.js");

  const MAGIC = "MBT1";
  const DEFAULT_FRAME_US = 15625;
  const DEFAULT_PPQ = 960;
  const DEFAULT_BPM = 120;
  const PACKING_BY_INSTRUMENT = "byInstrument";
  const PACKING_COMPACT = "compact";
  const STORAGE_KEY = "mobibard:mbtPackingMode";

  const INSTRUMENTS = Object.freeze([
    { id: 0, name: "Piano", pitched: true, program: 0 },
    { id: 1, name: "Chalumeau", pitched: true, program: 71 },
    { id: 2, name: "Flute", pitched: true, program: 73 },
    { id: 3, name: "Harp", pitched: true, program: 46 },
    { id: 4, name: "Lute", pitched: true, program: 24 },
    { id: 5, name: "Mandolin", pitched: true, program: 15 },
    { id: 6, name: "Violin", pitched: true, program: 40 },
    { id: 7, name: "Xylophone", pitched: true, program: 13 },
    { id: 8, name: "MusicBox", pitched: true, program: 10 },
    { id: 9, name: "Guitar", pitched: true, program: 25 },
    { id: 10, name: "Harmonica", pitched: true, program: 22 },
    { id: 11, name: "Cat", pitched: true, program: 53 },
    { id: 12, name: "BigDrum", pitched: false, drumMidi: 36 },
    { id: 13, name: "Cymbals", pitched: false, drumMidi: 49 },
  ]);
  const INSTRUMENT_BY_ID = new Map(INSTRUMENTS.map(item => [item.id, item]));

  const UI_TEXT = Object.freeze({
    ko: {
      title: "MBT 불러오기",
      description: "MBT에는 채널 정보가 없습니다. 노트를 복원한 뒤 불러올 채널 배치 방식을 선택합니다.",
      byInstrument: "악기별로 구분",
      byInstrumentHint: "같은 악기끼리 빈 채널을 재사용합니다. 음색 구분을 가장 정확하게 유지합니다.",
      compact: "악기 구분 없이 최대한 압축",
      compactHint: "음정 악기는 음정 악기끼리, 북·심벌즈는 무음정 악기끼리만 빈 음성을 재사용합니다. 악기 변화는 Program Change로 보존하며, 고정 악기 채널만 지원하는 화면에서는 다시 악기별로 나뉠 수 있습니다.",
      cancel: "취소",
      load: "불러오기",
    },
    ja: {
      title: "MBTを読み込む",
      description: "MBTにはチャンネル情報がありません。ノートを復元した後、読み込み時のチャンネル配置を選択します。",
      byInstrument: "楽器ごとに分ける",
      byInstrumentHint: "同じ楽器の空きチャンネルを再利用し、音色の区別を最も正確に保ちます。",
      compact: "楽器を区別せず最大限圧縮",
      compactHint: "音程楽器は音程楽器同士、バスドラム・シンバルは無音程楽器同士でのみ空きボイスを再利用します。楽器変更はProgram Changeで保持し、固定楽器チャンネルのみ対応する画面では再び楽器ごとに分かれる場合があります。",
      cancel: "キャンセル",
      load: "読み込む",
    },
    en: {
      title: "Import MBT",
      description: "MBT has no channel data. Notes are reconstructed first, then packed into channels for import.",
      byInstrument: "Keep instruments separated",
      byInstrumentHint: "Reuses free voices only within the same instrument and preserves timbre identity most accurately.",
      compact: "Compact across instruments",
      compactHint: "Reuses free voices only within the same pitch class: pitched instruments stay with pitched instruments, while Big Drum/Cymbals stay in the pitchless pool. Instrument changes are preserved as Program Changes. Fixed-instrument views may split them again by instrument.",
      cancel: "Cancel",
      load: "Import",
    },
    "zh-CN": {
      title: "导入 MBT",
      description: "MBT 不包含声道信息。先重建音符，再选择导入时的声道分配方式。",
      byInstrument: "按乐器区分",
      byInstrumentHint: "只在相同乐器之间复用空闲声部，可最准确地保留音色区分。",
      compact: "不区分乐器，尽量压缩",
      compactHint: "有音高乐器只与有音高乐器复用空闲声部，低音鼓与镲片只在无音高乐器池中复用。乐器变化用 Program Change 保留；仅支持固定乐器声道的界面可能会再次按乐器拆分。",
      cancel: "取消",
      load: "导入",
    },
    "zh-TW": {
      title: "匯入 MBT",
      description: "MBT 不包含聲道資訊。先重建音符，再選擇匯入時的聲道配置方式。",
      byInstrument: "依樂器區分",
      byInstrumentHint: "只在相同樂器間重用空閒聲部，可最準確保留音色區分。",
      compact: "不區分樂器，盡量壓縮",
      compactHint: "有音高樂器只與有音高樂器重用空閒聲部，低音鼓與鈸只在無音高樂器池中重用。樂器變化以 Program Change 保留；僅支援固定樂器聲道的畫面可能會再次依樂器拆分。",
      cancel: "取消",
      load: "匯入",
    },
  });

  function languageCode(value = "") {
    const raw = String(value || root.document?.documentElement?.lang || root.navigator?.language || "ko").toLowerCase();
    if (raw.startsWith("ja")) return "ja";
    if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-mo") || raw.includes("hant")) return "zh-TW";
    if (raw.startsWith("zh")) return "zh-CN";
    if (raw.startsWith("en")) return "en";
    return "ko";
  }

  function normalizePackingMode(value) {
    return value === PACKING_COMPACT ? PACKING_COMPACT : PACKING_BY_INSTRUMENT;
  }

  function readStoredPackingMode() {
    try { return normalizePackingMode(root.localStorage?.getItem(STORAGE_KEY)); }
    catch (_) { return PACKING_BY_INSTRUMENT; }
  }

  function writeStoredPackingMode(mode) {
    try { root.localStorage?.setItem(STORAGE_KEY, normalizePackingMode(mode)); }
    catch (_) {}
  }

  function asciiAt(bytes, offset, text) {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let index = 0; index < text.length; index++) {
      if (bytes[offset + index] !== text.charCodeAt(index)) return false;
    }
    return true;
  }

  function instrumentInfo(id, pitch = null) {
    const known = INSTRUMENT_BY_ID.get(Number(id));
    if (known) return known;
    const pitchless = Number(pitch) === 255;
    return {
      id: Number(id),
      name: `Instrument ${Number(id)}`,
      pitched: !pitchless,
      program: 0,
      drumMidi: pitchless ? 60 : undefined,
    };
  }

  function parse(bytes) {
    const view = core.asUint8Array(bytes);
    if (view.length < 16 || !asciiAt(view, 0, MAGIC)) throw new Error("MBT1 헤더를 찾지 못했습니다.");
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    const frameCount = data.getUint32(4, true);
    const frameUs = data.getUint32(8, true);
    const reserved = data.getUint32(12, true);
    if (!frameUs) throw new Error("MBT frame_us 값이 올바르지 않습니다.");

    let offset = 16;
    const frames = new Array(frameCount);
    let eventCountTotal = 0;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      if (offset >= view.length) throw new Error(`MBT Frame ${frameIndex}의 event_count가 없습니다.`);
      const eventCount = view[offset++];
      const required = eventCount * 4;
      if (offset + required > view.length) throw new Error(`MBT Frame ${frameIndex}의 이벤트 데이터가 잘렸습니다.`);
      const events = new Array(eventCount);
      for (let eventIndex = 0; eventIndex < eventCount; eventIndex++) {
        const state = view[offset++];
        const instrument = view[offset++];
        const pitch = view[offset++];
        const level = view[offset++];
        if (state > 3) throw new Error(`MBT Frame ${frameIndex}에 알 수 없는 state ${state}가 있습니다.`);
        events[eventIndex] = { state, instrument, pitch, level };
      }
      frames[frameIndex] = events;
      eventCountTotal += eventCount;
    }
    return {
      magic: MAGIC,
      frameCount,
      frameUs,
      reserved,
      frames,
      eventCount: eventCountTotal,
      trailingBytes: Math.max(0, view.length - offset),
    };
  }

  function eventKey(event) {
    return `${Number(event.instrument)}:${Number(event.pitch)}`;
  }

  function reconstructNotes(parsed) {
    const active = new Map();
    const notes = [];
    const warnings = [];

    function openNote(event, frameIndex, recovered = false) {
      const note = {
        instrument: Number(event.instrument),
        pitch: Number(event.pitch),
        startFrame: frameIndex,
        endFrame: frameIndex + 1,
        levelSum: 0,
        levelSamples: 0,
        recovered,
      };
      if (Number.isFinite(Number(event.level))) {
        note.levelSum += Math.max(0, Math.min(127, Number(event.level)));
        note.levelSamples += 1;
      }
      active.set(eventKey(event), note);
      return note;
    }

    function sampleLevel(note, event) {
      const value = Number(event.level);
      if (!Number.isFinite(value)) return;
      note.levelSum += Math.max(0, Math.min(127, value));
      note.levelSamples += 1;
    }

    function closeNote(key, endFrame, reason = "") {
      const note = active.get(key);
      if (!note) return;
      active.delete(key);
      note.endFrame = Math.max(note.startFrame + 1, endFrame);
      const average = note.levelSamples ? Math.round(note.levelSum / note.levelSamples) : 96;
      note.level = Math.max(0, Math.min(127, average));
      delete note.levelSum;
      delete note.levelSamples;
      if (reason) note.recoveryReason = reason;
      notes.push(note);
    }

    for (let frameIndex = 0; frameIndex < parsed.frameCount; frameIndex++) {
      const events = parsed.frames[frameIndex] || [];
      const sustainedThisFrame = new Set();
      const explicitlyClosed = new Set();

      for (const event of events) {
        if (event.state === 0) continue;
        const key = eventKey(event);
        if (event.state === 1) {
          if (active.has(key)) closeNote(key, frameIndex, "retrigger");
          openNote(event, frameIndex, false);
          sustainedThisFrame.add(key);
        } else if (event.state === 2) {
          let note = active.get(key);
          if (!note) {
            note = openNote(event, frameIndex, true);
            warnings.push(`Frame ${frameIndex}: ACTIVE without ON (${key})`);
          } else {
            sampleLevel(note, event);
          }
          sustainedThisFrame.add(key);
        } else if (event.state === 3) {
          if (active.has(key)) closeNote(key, frameIndex, "off");
          else warnings.push(`Frame ${frameIndex}: OFF without active note (${key})`);
          explicitlyClosed.add(key);
        }
      }

      for (const key of Array.from(active.keys())) {
        if (!sustainedThisFrame.has(key) && !explicitlyClosed.has(key)) {
          closeNote(key, frameIndex, "missing-active");
        }
      }
    }
    for (const key of Array.from(active.keys())) closeNote(key, parsed.frameCount, "stream-end");

    notes.sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.instrument - b.instrument || a.pitch - b.pitch);
    return { notes, warnings };
  }

  function notePackingClass(note) {
    const info = instrumentInfo(note?.instrument, note?.pitch);
    return (!info.pitched || Number(note?.pitch) === 255) ? "pitchless" : "pitched";
  }

  function allocateVoices(notes, packingMode = PACKING_BY_INSTRUMENT) {
    const mode = normalizePackingMode(packingMode);
    const voices = [];
    const ordered = Array.from(notes || []).slice().sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.instrument - b.instrument || a.pitch - b.pitch);
    for (const note of ordered) {
      const packingClass = notePackingClass(note);
      let best = null;
      for (const voice of voices) {
        if (voice.endFrame > note.startFrame) continue;
        if (mode === PACKING_BY_INSTRUMENT && voice.instrument !== note.instrument) continue;
        if (mode === PACKING_COMPACT && voice.packingClass !== packingClass) continue;
        if (!best || voice.endFrame > best.endFrame) best = voice;
      }
      if (!best) {
        best = {
          id: voices.length + 1,
          instrument: mode === PACKING_BY_INSTRUMENT ? note.instrument : null,
          packingClass,
          endFrame: 0,
          notes: [],
        };
        voices.push(best);
      }
      best.notes.push(note);
      best.endFrame = Math.max(best.endFrame, note.endFrame);
    }
    return voices;
  }

  function ticksPerFrame(frameUs, ppq = DEFAULT_PPQ, bpm = DEFAULT_BPM) {
    const quarterUs = 60000000 / bpm;
    return ppq * Number(frameUs || DEFAULT_FRAME_US) / quarterUs;
  }

  function midiPitchForNote(note) {
    const info = instrumentInfo(note.instrument, note.pitch);
    if (!info.pitched || Number(note.pitch) === 255) return Math.max(0, Math.min(127, Number(info.drumMidi ?? 60)));
    return Math.max(0, Math.min(127, Number(note.pitch)));
  }

  function makeTrackFromVoice(voice, frameUs, packingMode, voiceIndex) {
    const mode = normalizePackingMode(packingMode);
    const frameTicks = ticksPerFrame(frameUs);
    const notes = [];
    const programChanges = [];
    let lastProgram = null;
    let firstMelodicInfo = null;

    for (const note of voice.notes) {
      const info = instrumentInfo(note.instrument, note.pitch);
      const startTick = Math.max(0, Math.round(note.startFrame * frameTicks));
      const endTick = Math.max(startTick + 1, Math.round(note.endFrame * frameTicks));
      const velocity = Math.max(1, Math.min(127, Math.round(Number(note.level) || 0) || 1));
      const isPercussion = !info.pitched || Number(note.pitch) === 255;
      if (!isPercussion) {
        if (!firstMelodicInfo) firstMelodicInfo = info;
        const program = Math.max(0, Math.min(127, Math.round(Number(info.program) || 0)));
        if (mode === PACKING_COMPACT && program !== lastProgram) {
          programChanges.push({ tick: startTick, program });
          lastProgram = program;
        }
      }
      notes.push({
        startTick,
        endTick,
        pitch: midiPitchForNote(note),
        velocity,
        ...(isPercussion ? { channel: 9 } : {}),
      });
    }

    if (mode === PACKING_BY_INSTRUMENT) {
      const info = instrumentInfo(voice.instrument, voice.notes[0]?.pitch);
      const isDrums = !info.pitched || Number(voice.notes[0]?.pitch) === 255;
      return {
        name: `MBT ${info.name} ${voiceIndex + 1}`,
        isDrums,
        program: Math.max(0, Math.min(127, Math.round(Number(info.program) || 0))),
        notes,
      };
    }

    const isDrums = voice.packingClass === "pitchless";
    return {
      name: isDrums ? `MBT Percussion Voice ${voiceIndex + 1}` : `MBT Voice ${voiceIndex + 1}`,
      isDrums,
      program: Math.max(0, Math.min(127, Math.round(Number(firstMelodicInfo?.program) || 0))),
      suppressInitialProgram: true,
      programChanges,
      notes,
    };
  }

  function toMidi(parsedOrBytes, options = {}) {
    const parsed = parsedOrBytes?.frames ? parsedOrBytes : parse(parsedOrBytes);
    const reconstructed = reconstructNotes(parsed);
    const packingMode = normalizePackingMode(options.packingMode || options.mbtPackingMode || PACKING_BY_INSTRUMENT);
    const voices = allocateVoices(reconstructed.notes, packingMode);
    const tracks = voices.map((voice, index) => makeTrackFromVoice(voice, parsed.frameUs, packingMode, index));
    const midiBytes = core.buildMidi({
      ppq: DEFAULT_PPQ,
      title: options.title || "MOBIBARD MBT",
      tempoEvents: [{ tick: 0, bpm: DEFAULT_BPM }],
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      tracks,
    });
    return {
      midiBytes,
      metadata: {
        mbtVersion: 1,
        frameCount: parsed.frameCount,
        frameUs: parsed.frameUs,
        eventCount: parsed.eventCount,
        noteCount: reconstructed.notes.length,
        voiceCount: voices.length,
        packingMode,
        warnings: reconstructed.warnings,
      },
    };
  }

  function isMbtFile(fileName = "") {
    return /\.mbt$/i.test(String(fileName || ""));
  }

  function injectDialogStyles() {
    if (!root.document || root.document.getElementById("mobibardMbtImportStyles")) return;
    const style = root.document.createElement("style");
    style.id = "mobibardMbtImportStyles";
    style.textContent = `
      .mobibard-mbt-dialog{width:min(520px,calc(100% - 28px));border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:0;background:var(--surface,#fff);color:var(--text,#1d2430);box-shadow:0 24px 80px rgba(0,0,0,.28)}
      .mobibard-mbt-dialog::backdrop{background:rgba(9,13,20,.58);backdrop-filter:blur(4px)}
      [data-theme="dark"] .mobibard-mbt-dialog{background:var(--surface,#20242c);color:var(--text,#edf0f4)}
      .mobibard-mbt-card{display:grid;gap:0;margin:0}.mobibard-mbt-head{padding:18px 20px 10px}.mobibard-mbt-head h2{margin:0;font-size:20px}.mobibard-mbt-body{display:grid;gap:12px;padding:8px 20px 18px}.mobibard-mbt-body>p{margin:0 0 2px;font-size:13px;line-height:1.55;opacity:.78}
      .mobibard-mbt-option{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;cursor:pointer}.mobibard-mbt-option:has(input:checked){border-color:color-mix(in srgb,#4b7bec 72%,transparent);background:color-mix(in srgb,#4b7bec 8%,transparent)}.mobibard-mbt-option input{margin-top:3px}.mobibard-mbt-option strong{display:block;font-size:13px}.mobibard-mbt-option small{display:block;margin-top:3px;font-size:11px;line-height:1.45;opacity:.68}
      .mobibard-mbt-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}.mobibard-mbt-actions button{min-height:36px;padding:7px 14px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:9px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}.mobibard-mbt-actions button[data-primary]{border-color:#4b7bec;background:#4b7bec;color:#fff}
    `;
    root.document.head.appendChild(style);
  }

  function choosePackingMode(options = {}) {
    const fallback = normalizePackingMode(options.defaultMode || readStoredPackingMode());
    if (!root.document?.body || typeof HTMLDialogElement === "undefined") return Promise.resolve(fallback);
    injectDialogStyles();
    const lang = languageCode(options.language);
    const text = UI_TEXT[lang] || UI_TEXT.ko;
    const dialog = root.document.createElement("dialog");
    dialog.className = "mobibard-mbt-dialog";
    dialog.innerHTML = `<form class="mobibard-mbt-card" method="dialog">
      <header class="mobibard-mbt-head"><h2></h2></header>
      <div class="mobibard-mbt-body"><p></p>
        <label class="mobibard-mbt-option"><input type="radio" name="packing" value="${PACKING_BY_INSTRUMENT}"><span><strong></strong><small></small></span></label>
        <label class="mobibard-mbt-option"><input type="radio" name="packing" value="${PACKING_COMPACT}"><span><strong></strong><small></small></span></label>
      </div>
      <footer class="mobibard-mbt-actions"><button value="cancel"></button><button data-primary value="apply"></button></footer>
    </form>`;
    const labels = dialog.querySelectorAll(".mobibard-mbt-option");
    dialog.querySelector("h2").textContent = text.title;
    dialog.querySelector(".mobibard-mbt-body>p").textContent = text.description;
    labels[0].querySelector("strong").textContent = text.byInstrument;
    labels[0].querySelector("small").textContent = text.byInstrumentHint;
    labels[1].querySelector("strong").textContent = text.compact;
    labels[1].querySelector("small").textContent = text.compactHint;
    const buttons = dialog.querySelectorAll(".mobibard-mbt-actions button");
    buttons[0].textContent = text.cancel;
    buttons[1].textContent = text.load;
    const selected = dialog.querySelector(`input[value="${fallback}"]`) || dialog.querySelector("input");
    if (selected) selected.checked = true;
    root.document.body.appendChild(dialog);

    return new Promise(resolve => {
      const finish = value => {
        try { dialog.remove(); } catch (_) {}
        resolve(value);
      };
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        try { dialog.close("cancel"); } catch (_) { finish(null); }
      });
      dialog.addEventListener("close", () => {
        if (dialog.returnValue !== "apply") {
          finish(null);
          return;
        }
        const mode = normalizePackingMode(dialog.querySelector('input[name="packing"]:checked')?.value || fallback);
        writeStoredPackingMode(mode);
        finish(mode);
      }, { once: true });
      dialog.showModal();
    });
  }

  const api = Object.freeze({
    version: "1.0.2",
    MAGIC,
    DEFAULT_FRAME_US,
    DEFAULT_PPQ,
    DEFAULT_BPM,
    PACKING_BY_INSTRUMENT,
    PACKING_COMPACT,
    instruments: INSTRUMENTS,
    parse,
    reconstructNotes,
    allocateVoices,
    toMidi,
    isMbtFile,
    normalizePackingMode,
    choosePackingMode,
    readStoredPackingMode,
  });
  root.MobibardMbt = api;

  core.registerFormat({
    id: "mobibard-mbt",
    label: "MOBIBARD AI / MBT",
    category: "standard",
    extensions: ["mbt"],
    mimeTypes: ["application/x-mobibard-mbt"],
    description: "MOBIBARD AI의 frame-based 추론/정답 이벤트(MBT1)를 읽어 노트와 악기를 복원합니다. 채널은 불러올 때 자동 배정합니다.",
    limitation: "MBT에는 템포/박자/채널 정보가 없으므로 절대시간을 보존하기 위해 T120 기준 MIDI 시간축으로 표준화합니다.",
    detect(bytes, fileName = "") {
      // MBT is intentionally reserved to the .mbt extension. Do not sniff generic
      // .bin/.com/.exe-style binaries as MBT merely because their payload starts MBT1.
      if (!isMbtFile(fileName)) return false;
      const view = core.asUint8Array(bytes);
      return view.length >= 16 && asciiAt(view, 0, MAGIC);
    },
    convert(bytes, fileName, options = {}) {
      return toMidi(bytes, {
        mbtPackingMode: options.mbtPackingMode,
        packingMode: options.mbtPackingMode,
        title: String(fileName || "MOBIBARD MBT").replace(/\.mbt$/i, "") || "MOBIBARD MBT",
      });
    },
  });
})();
