/* MobiBard agent API — MobiBard 핵심 기능을 JSON 요청으로 실행한다(run.mjs가 Node vm에 올려 쓴다).
 * 사용: const res = await MobibardAI.run({ capability, options, files }); 기능 목록은 MobibardAI.capabilities().
 * 모든 처리는 로컬에서 실행되며 네트워크를 쓰지 않는다. */
(() => {
  "use strict";
  const VERSION = "0.1.0";
  const W = window;
  const TRUST = { instrument: 1, balance: 0.5, context: 0 };
  const MML_EXT = /\.(txt|mml)$/i;
  const MIDI_EXT = /\.(mid|midi|kar)$/i;

  const fail = (message, code = "bad-request", extra = {}) => Object.assign(new Error(message), { code, extra });
  const need = (name) => { if (!W[name]) throw fail(`${name} 모듈이 로드되지 않았습니다.`, "module-missing"); return W[name]; };

  // ---------- 입출력 ----------
  function toBytes(file) {
    if (file.bytes) return file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    if (typeof file.base64 === "string") {
      const bin = atob(file.base64.replace(/^data:[^,]*,/, ""));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof file.text === "string") return new TextEncoder().encode(file.text);
    throw fail(`파일 '${file.name || "?"}'에 text, base64, bytes 중 하나가 필요합니다.`);
  }
  function bytesToBase64(bytes) {
    let s = ""; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }
  const textOutput = (name, kind, text) => ({ name, kind, mime: "text/plain;charset=utf-8", encoding: "text", data: text });
  const binOutput = (name, kind, mime, bytes) => ({ name, kind, mime, encoding: "base64", data: bytesToBase64(bytes), size: bytes.length });
  const baseName = (name) => String(name || "mobibard").replace(/\.[^.]+$/, "").replace(/\.mmlproj$/i, "") || "mobibard";

  function partsOf(mml) {
    return W.MabiMml.splitMmlParts(mml).map(p => String(p || ""));
  }
  const curParts = (mml) => Math.max(1, Math.min(6, partsOf(mml).length));
  function mmlStats(mml) {
    const parser = need("MabiMml");
    const parts = partsOf(mml);
    const parsed = parser.parseMabinogiMml(mml, { maxParts: 64 });
    let duration = null;
    try { duration = parser.buildSchedule(parsed).duration; } catch (_) {}
    return {
      partCount: parts.length,
      charCounts: parts.map(p => p.length),
      totalChars: String(mml).length,
      noteCounts: parsed.parts.map(p => (p.notes || []).length),
      tempoCount: (parsed.tempos || []).length,
      firstTempo: parsed.tempos?.[0]?.bpm ?? null,
      durationSeconds: duration ? Math.round(duration * 10) / 10 : null,
    };
  }

  // ---------- 입력 해석: files → state {midi, mml, name} ----------
  async function loadState(files) {
    if (!Array.isArray(files) || !files.length) throw fail("files에 파일을 하나 이상 넣어 주세요.");
    const file = files[0];
    const name = String(file.name || "input");
    const bytes = toBytes(file);
    const state = { name, midi: null, mml: null, mmiTracks: null, warnings: [] };
    const textHead = () => new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
    if (MIDI_EXT.test(name) || (bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64)) {
      state.midi = bytes; state.kind = "midi";
    } else if (/\.mmi$/i.test(name) || /^\s*\[mml-score\]/i.test(textHead())) {
      const mmi = need("MabiMmi");
      const text = new TextDecoder("utf-8").decode(bytes);
      const cands = mmi.extractCandidates(text, { isMmlPart: v => /[a-gnr<>]/i.test(v), minTempo: 1, maxTempo: 1000 });
      if (!cands.length) throw fail("MMI에서 MML을 찾지 못했습니다.", "no-mml");
      state.mmiTracks = cands.map((c, i) => ({ index: i, name: c.name || c.label || `Track ${i + 1}`, mml: /^\s*MML@/i.test(c.value) ? c.value : `MML@${c.value};` }));
      state.mml = state.mmiTracks[0].mml; state.kind = "mmi";
    } else if (MML_EXT.test(name) || /^\s*MML\s*@/i.test(textHead())) {
      state.mml = new TextDecoder("utf-8").decode(bytes).trim(); state.kind = "mml";
    } else {
      if (!/\.mmlproj(\.json)?$/i.test(name)) throw fail(`'${name}'은(는) 이 꾸러미가 지원하지 않는 형식입니다. 지원: .mid .midi .kar .mml .txt .mmi .mmlproj.json`, "unsupported-format");
      const formats = need("MabiMusicFormats");
      const converted = await formats.convertBytes(bytes, name, file.type || "", {});
      state.midi = converted.midiBytes; state.kind = "converted";
      if (converted.warnings?.length) state.warnings.push(...converted.warnings);
    }
    return state;
  }
  const needMidi = (s, cap) => { if (!s.midi) throw fail(`${cap}에는 MIDI(또는 MIDI로 바꿀 수 있는 파일)가 필요합니다. 지금 입력은 ${s.kind}입니다.`, "wrong-input"); return s.midi; };
  const needMml = (s, cap) => { if (!s.mml) throw fail(`${cap}에는 MML(.txt/.mml/.mmi)이 필요합니다. MIDI라면 먼저 midi-to-mml을 실행하세요.`, "wrong-input"); return s.mml; };

  // ---------- 기능 ----------
  const H = {};
  H.inspect = async (s, o) => {
    if (s.midi) {
      const a = need("MabiMidi").analyzeMidi(s.midi, s.name);
      return { report: { kind: s.kind, fileName: s.name, format: a.format, trackCount: a.trackCount, ppq: a.ppq, noteCount: a.noteCount, tempoCount: a.tempoCount,
        warnings: [...s.warnings, ...(a.warnings || [])],
        instrumentGroups: (a.instrumentGroups || []).map(g => ({ id: g.id, name: g.name || g.label || g.partName || g.title || g.programName || g.id, noteCount: g.noteCount, isDrum: !!(g.isBeat || g.isDrum), lowestMidi: g.minMidi ?? g.lowest, highestMidi: g.maxMidi ?? g.highest })) } };
    }
    const st = mmlStats(s.mml);
    
    return { report: { kind: s.kind, fileName: s.name, ...st, mmiTracks: s.mmiTracks?.map(t => ({ index: t.index, name: t.name })) } };
  };
  H["analyze-mml"] = async (s) => {
    const mml = needMml(s, "analyze-mml"); const st = mmlStats(mml); 
    const issues = [];
    st.charCounts.forEach((n, i) => { if (n > 2400) issues.push(`채널 ${i + 1}: ${n}자 (한 페이지 권장 2400자 초과)`); });
    if (st.partCount > 6) issues.push(`채널이 ${st.partCount}개입니다(마비노기는 최대 6채널).`);
    return { report: { ...st, issues } };
  };
  H["midi-to-mml"] = async (s, o) => {
    const midi = needMidi(s, "midi-to-mml");
    const channelCount = Math.max(1, Math.min(6, Math.round(o.channelCount ?? 3)));
    const opts = {
      channelCount, mainCount: Math.min(Math.round(o.mainCount ?? 3), channelCount),
      trust: o.trust in TRUST ? TRUST[o.trust] : (Number.isFinite(Number(o.trust)) ? Number(o.trust) : 0.5),
      mainInst: o.mainInst || "auto", rows: Array.isArray(o.rows) ? o.rows : undefined,
      cymbalDensity: o.cymbalDensity, drumDensity: o.drumDensity, quantizeDivision: o.quantizeDivision === 32 ? 32 : 64,
    };
    if (Array.isArray(o.selectedInstrumentGroups)) opts.selectedInstrumentGroups = o.selectedInstrumentGroups;
    const conv = need("MabiMidi").arrangeMidiToMml(midi, s.name, opts);
    s.mml = conv.mml; s.instIds = conv.instIds;
    const warnings = [...s.warnings, ...(conv.warnings || [])];
    const steps = ["midi-to-mml"];
    if (o.volume) { const r = await H["generate-volume"](s, typeof o.volume === "object" ? o.volume : {}); steps.push("generate-volume"); warnings.push(...(r.warnings || [])); }
    if (o.optimize) { await H["optimize-mml"](s, {}); steps.push("optimize-mml"); }
    return { report: { steps, channels: conv.channels, instIds: conv.instIds, warnings, notices: conv.notices || [], ...(() => { const st = mmlStats(s.mml);  return st; })() } };
  };
  H["optimize-mml"] = async (s, o) => {
    const mml = needMml(s, "optimize-mml");
    const r = need("MabiOptimizer").optimizeMml(mml, { partCount: o.partCount || curParts(mml) });
    s.mml = r.mml;
    return { report: { charsBefore: r.before, charsAfter: r.after, saved: r.saved } };
  };
  H["generate-volume"] = async (s, o) => {
    const mml = needMml(s, "generate-volume");
    const r = need("MabiOptimizer").generateDynamicsMml(mml, { partCount: o.partCount || curParts(mml), genre: o.genre || "pop", strength: o.strength || "normal",
      targetPartIndexes: o.targetPartIndexes, overwriteExisting: !!o.overwriteExisting, overwrite: !!o.overwriteExisting });
    s.mml = r.mml;
    const { mml: _m, parts: _p, ...rest } = r;
    return { report: rest };
  };
  const EDIT = {
    "transpose": ["transposeOctavesMml"], "set-volume": ["setVolumesMml"], "adjust-volume": ["adjustVolumesMml"],
    "simplify-volume": ["simplifyVolumesMml"], "fade": ["applyFadeMml"], "simplify-tempo": ["simplifyTemposMml"],
    "trim-short-rests": ["trimShortRestsMml"], "add-leading-silence": ["addLeadingSilenceMml"], "split-pages": ["splitMmlPages"],
  };
  H["edit-mml"] = async (s, o) => {
    const mml = needMml(s, "edit-mml");
    const op = String(o.op || "");
    if (!EDIT[op]) throw fail(`op는 ${Object.keys(EDIT).join(", ")} 중 하나여야 합니다.`);
    const defaults = op === "split-pages" ? { partCount: curParts(mml), searchEndPercent: 50 } : { partCount: curParts(mml) };
    const r = need("MabiOptimizer")[EDIT[op][0]](mml, { ...defaults, ...(o.args || {}) });
    const pages = r.pages || null;
    if (op === "split-pages") {
      const list = (pages || []).map(p => typeof p === "string" ? p : p.mml);
      if (!list.length) list.push(mml);
      s.pages = list; s.mml = list[0] || mml;
      return { report: { pageCount: list.length, pageChars: list.map(p => p.length) } };
    }
    s.mml = r.mml;
    const { mml: _m, parts: _p, ...rest } = r;
    return { report: rest };
  };
  const instProg = (ids) => (ids || []).map(id => {
    const inst = { piano: 0, harp: 46, lute: 24, folkGuitar: 25, mandolin: 105, violin: 40, flute: 73, chalumeau: 71, harmonica: 22, catHarmonica: 53, xylophone: 13, musicBox: 10 }[id];
    return id === "cymbal" || id === "bigdrum" ? { bank: 128, program: 0 } : { bank: 0, program: inst ?? 0 };
  });
  H["mml-to-midi"] = async (s, o) => {
    const mml = needMml(s, "mml-to-midi");
    const ids = o.instruments || s.instIds || [];
    const r = need("MabiMmlMidi").buildMidiFromMml(mml, { maxParts: 64, partNames: o.partNames || [], instruments: instProg(ids), title: baseName(s.name) });
    s.midiOut = r.bytes;
    return { report: { noteCount: r.noteCount, trackCount: r.trackCount, bytes: r.bytes.length } };
  };

  // ---------- 실행 ----------
  function collectOutputs(s, wanted) {
    const out = [];
    const base = baseName(s.name);
    if (!wanted.includes("mml") && !wanted.includes("mmi")) { /* mml 미요청 */ }
    else if (s.pages?.length > 1) s.pages.forEach((p, i) => out.push(textOutput(`${base}_p${i + 1}.mml`, "mml", p)));
    else if (s.mml) out.push(textOutput(`${base}.mml`, "mml", s.mml));
    if (s.mml && wanted.includes("mmi")) {
      const mmi = need("MabiMmi"); const parts = partsOf(s.mml);
      const tempo = (() => { try { return need("MabiMml").parseMabinogiMml(s.mml, { maxParts: 64 }).tempos; } catch (_) { return []; } })();
      out.push(textOutput(`${base}.mmi`, "mmi", mmi.build({ title: base, tempos: tempo, tracks: [{ name: base, program: 0, voices: parts }] })));
    }
    if (s.midiOut && wanted.includes("midi")) out.push(binOutput(`${base}.mid`, "midi", "audio/midi", s.midiOut));
    return out;
  }

  async function run(request) {
    const started = Date.now();
    try {
      if (typeof request === "string") request = JSON.parse(request);
      if (!request || typeof request !== "object") throw fail("요청은 JSON 객체여야 합니다.");
      const steps = Array.isArray(request.steps) && request.steps.length ? request.steps : [{ capability: request.capability, options: request.options || {} }];
      const lastId = steps[steps.length - 1].capability;
      const defaultOut = { inspect: [], "analyze-mml": [], "mml-to-midi": ["midi"] }[lastId] || ["mml"];
      const wanted = Array.isArray(request.outputs) ? request.outputs : defaultOut;
      const state = await loadState(request.files);
      if (state.mmiTracks && Number.isInteger(request.mmiTrack)) state.mml = state.mmiTracks[request.mmiTrack]?.mml || state.mml;
      const reports = [];
      for (const step of steps) {
        const id = step.capability;
        if (!H[id]) throw fail(`알 수 없는 capability: ${id}. 가능한 값: ${Object.keys(H).join(", ")}`, "unknown-capability");
        const r = await H[id](state, step.options || {});
        reports.push({ capability: id, report: r.report });
      }
      const last = reports[reports.length - 1];
      return { ok: true, version: VERSION, capability: steps.map(x => x.capability).join(" > "), report: reports.length === 1 ? last.report : undefined,
        steps: reports.length > 1 ? reports : undefined, outputs: collectOutputs(state, wanted), elapsedMs: Date.now() - started };
    } catch (e) {
      return { ok: false, version: VERSION, error: { code: e.code || "error", message: String(e.message || e), ...(e.extra || {}) }, elapsedMs: Date.now() - started };
    }
  }

  let catalogPromise = null;
  const capabilities = () => (catalogPromise ||= fetch(new URL("capabilities.json", document.currentScript?.src || location.href)).then(r => r.json()));
  const base = document.currentScript?.src;
  W.MobibardAI = Object.freeze({ version: VERSION, run, capabilities: () => (catalogPromise ||= fetch(new URL("capabilities.json", base || location.href)).then(r => r.json())),
    ready: () => !!(W.MabiSplitSearch && W.MabiMidi && W.MabiOptimizer && W.MabiMml && W.MabiMmlMidi && W.MabiMmi && W.MabiMusicFormats && W.MabiArranger),
    capabilityIds: () => Object.keys(H) });
})();
