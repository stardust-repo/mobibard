(() => {
  "use strict";
  const { clampInt, unique } = window.MabiUtils;
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];

  function midiToMml(bytes, fileName = "MID") {
    const midi = parseMidiFile(bytes);
    if (midi.smpteDivision) throw new Error("SMPTE 방식 MIDI는 지원하지 않습니다. PPQ/TPQN 방식으로 내보내 주세요.");
    const ppq = midi.ppq;
    const ticksPerGrid = ppq / 16; // 64분음표 = 4분음표 / 16
    const warnings = [...midi.warnings];
    const normalizedMidiTempos = normalizeMidiTempos(midi.tempoEvents);
    const tempoStart = normalizedMidiTempos.length ? normalizedMidiTempos[0].bpm : 120;
    if (normalizedMidiTempos.some(t => t.tick > 0)) warnings.push("중간 템포 변경은 변환 결과에서 첫 템포만 사용합니다.");

    const notes = midi.notes.map(n => {
      const startGrid = Math.max(0, Math.round(n.startTick / ticksPerGrid));
      const durGrid = Math.max(1, Math.round((n.endTick - n.startTick) / ticksPerGrid));
      const velocity = clampInt(Math.round(n.velocity / 127 * 15), 1, 15);
      return { midi: n.midi, startGrid, endGrid: startGrid + durGrid, durGrid, velocity };
    }).sort((a, b) => a.startGrid - b.startGrid || b.midi - a.midi);

    if (!notes.length) throw new Error("노트를 찾지 못했습니다. 드럼/컨트롤만 있는 MIDI이거나 note on/off 쌍이 깨진 파일일 수 있습니다.");

    const partCount = 6;
    const voices = Array.from({ length: partCount }, () => []);
    const voiceEnd = Array(partCount).fill(0);
    let skipped = 0;
    for (const n of notes) {
      let best = -1;
      for (let i = 0; i < partCount; i++) {
        if (voiceEnd[i] <= n.startGrid) { best = i; break; }
      }
      if (best < 0) { skipped++; continue; }
      voices[best].push(n);
      voiceEnd[best] = n.endGrid;
    }

    const parts = voices.map((v, i) => voiceToMml64(v, i === 0 ? tempoStart : null));
    const mml = `MML@${parts.join(",")};`;
    const totalUsed = voices.reduce((s, v) => s + v.length, 0);
    const message = [
      `${fileName} 변환 완료`,
      `입력 노트 ${notes.length}개 → 출력 노트 ${totalUsed}개`,
      `변환 설정: 6파트 / 최소 64분음표`,
      skipped ? `동시음 초과로 ${skipped}개를 생략했습니다.` : "생략된 노트가 없습니다.",
      warnings.length ? "\n주의:\n- " + unique(warnings).join("\n- ") : ""
    ].filter(Boolean).join("\n");
    return { mml, parts, message, warnings };
  }

  function voiceToMml64(notes, initialTempo) {
    let out = initialTempo ? `T${initialTempo}` : "";
    let pos = 0;
    let octave = 4;
    let volume = 8;
    for (const n of notes) {
      if (n.startGrid > pos) {
        out += durationToMmlTokens("r", n.startGrid - pos, false);
        pos = n.startGrid;
      }
      if (n.velocity !== volume) { out += `V${n.velocity}`; volume = n.velocity; }
      const noteOct = Math.floor(n.midi / 12) - 1;
      if (noteOct !== octave) { out += `O${noteOct}`; octave = noteOct; }
      const name = NOTE_NAMES[n.midi % 12];
      out += durationToMmlTokens(name, n.endGrid - n.startGrid, true);
      pos = n.endGrid;
    }
    return out;
  }

  function durationToMmlTokens(prefix, grids, tie) {
    const units = [
      [64, "1"], [48, "2."], [32, "2"], [24, "4."], [16, "4"], [12, "8."],
      [8, "8"], [6, "16."], [4, "16"], [3, "32."], [2, "32"], [1, "64"]
    ];
    const parts = [];
    let left = grids;
    while (left > 0) {
      const u = units.find(([g]) => g <= left) || units[units.length - 1];
      parts.push(prefix + u[1]);
      left -= u[0];
    }
    return tie ? parts.join("&") : parts.join("");
  }

function parseMidiFile(bytes) {
  const r = new ByteReader(bytes);
  const warnings = [];
  if (r.readAscii(4) !== "MThd") throw new Error("MThd 헤더가 없습니다. 표준 MID 파일인지 확인해 주세요.");
  const headerLength = r.readU32();
  if (headerLength < 6) throw new Error("MIDI 헤더 길이가 올바르지 않습니다.");
  const format = r.readU16();
  const trackCount = r.readU16();
  const divisionRaw = r.readU16();
  if (headerLength > 6) r.skip(headerLength - 6);
  const smpteDivision = (divisionRaw & 0x8000) !== 0;
  const ppq = smpteDivision ? 480 : (divisionRaw & 0x7fff);
  const notes = [];
  const tempoEvents = [{ tick: 0, bpm: 120 }];
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (r.remaining() < 8) break;
    const id = r.readAscii(4);
    const len = r.readU32();
    if (id !== "MTrk") throw new Error(`${trackIndex + 1}번 트랙에서 MTrk 헤더를 찾지 못했습니다.`);
    const end = r.pos + len;
    parseMidiTrack(r, end, trackIndex, notes, tempoEvents, warnings);
    r.pos = end;
  }
  notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  tempoEvents.sort((a, b) => a.tick - b.tick);
  return { format, trackCount, ppq, smpteDivision, notes, tempoEvents, warnings };
}

function normalizeMidiTempos(events) {
  const map = [];
  for (const ev of [...events].sort((a, b) => a.tick - b.tick)) {
    const last = map[map.length - 1];
    if (last && last.tick === ev.tick) last.bpm = ev.bpm;
    else map.push({ tick: ev.tick, bpm: ev.bpm });
  }
  if (!map.length || map[0].tick !== 0) map.unshift({ tick: 0, bpm: 120 });
  return map;
}

function parseMidiTrack(r, end, trackIndex, notes, tempoEvents, warnings) {
  let tick = 0;
  let running = null;
  const open = new Map();
  while (r.pos < end && r.remaining() > 0) {
    tick += r.readVarLen();
    let status = r.readU8();
    if (status < 0x80) { if (running == null) throw new Error("MIDI running status가 올바르지 않습니다."); r.pos--; status = running; }
    else if (status < 0xf0) running = status;
    if (status === 0xff) {
      const type = r.readU8();
      const len = r.readVarLen();
      if (type === 0x51 && len === 3) {
        const mpqn = (r.readU8() << 16) | (r.readU8() << 8) | r.readU8();
        const bpm = clampInt(Math.round(60000000 / mpqn), 32, 255);
        tempoEvents.push({ tick, bpm });
      } else r.skip(len);
      if (type === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) {
      r.skip(r.readVarLen());
    } else {
      const cmd = status & 0xf0;
      const ch = status & 0x0f;
      const d1 = r.readU8();
      const needs2 = cmd !== 0xc0 && cmd !== 0xd0;
      const d2 = needs2 ? r.readU8() : 0;
      if (cmd === 0x90 && d2 > 0) {
        open.set(`${ch}:${d1}`, { tick, velocity: d2 });
      } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
        const key = `${ch}:${d1}`;
        const s = open.get(key);
        if (s) { notes.push({ startTick: s.tick, endTick: tick, midi: d1, velocity: s.velocity, channel: ch, trackIndex }); open.delete(key); }
      }
    }
  }
  if (open.size) warnings.push(`${trackIndex + 1}번 트랙: note off가 없는 노트 ${open.size}개를 생략했습니다.`);
  r.pos = end;
}

class ByteReader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  remaining() { return this.bytes.length - this.pos; }
  readU8() { if (this.pos >= this.bytes.length) throw new Error("파일 끝에 도달했습니다."); return this.bytes[this.pos++]; }
  readU16() { const v = (this.readU8() << 8) | this.readU8(); return v >>> 0; }
  readU32() { return (((this.readU8() << 24) >>> 0) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0; }
  readAscii(n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(this.readU8()); return s; }
  readVarLen() { let v = 0; for (let i = 0; i < 4; i++) { const b = this.readU8(); v = (v << 7) | (b & 0x7f); if ((b & 0x80) === 0) return v; } return v; }
  skip(n) { this.pos = Math.min(this.bytes.length, this.pos + n); }
}

  window.MabiMidi = { midiToMml };
})();
