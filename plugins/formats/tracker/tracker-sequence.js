(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before tracker-sequence.js");

  const asciiAt = (bytes, offset, text) => {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  };
  const le16 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  const le32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const titleFromBytes = (bytes, start, length, fallback) => {
    let text = "";
    for (let i = start; i < Math.min(bytes.length, start + length); i++) {
      const b = bytes[i];
      if (!b) break;
      if (b >= 32 && b < 127) text += String.fromCharCode(b);
    }
    return text.trim() || fallback;
  };
  const clamp = (value, min, max, fallback = min) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  };
  const rowEvent = () => ({ note: null, noteOff: false, instrument: null, volume: null, effect: null, param: 0 });

  function midiChannelFor(index) {
    let channel = index % 15;
    if (channel >= 9) channel++;
    return channel;
  }

  function buildSong(song, fileName) {
    const ppq = 480;
    const channels = Math.max(1, song.channels || 1);
    const tracks = Array.from({ length: channels }, (_, index) => ({
      name: `Tracker Ch ${index + 1}`,
      channel: midiChannelFor(index),
      notes: [],
      programChanges: [],
    }));
    const active = Array.from({ length: channels }, () => null);
    const currentInstrument = Array.from({ length: channels }, () => 1);
    const currentVolume = Array.from({ length: channels }, () => 48);
    const tempoEvents = [];
    let speed = clamp(song.speed, 1, 31, 6);
    let bpm = clamp(song.bpm, 32, 255, 125);
    let currentTick = 0;
    let orderIndex = 0;
    let startRow = 0;
    let guard = 0;
    const visited = new Set();
    let lastTempo = null;

    const closeNote = (channelIndex, tick) => {
      const note = active[channelIndex];
      if (!note) return;
      tracks[channelIndex].notes.push({
        startTick: note.startTick,
        endTick: Math.max(note.startTick + 1, tick),
        pitch: note.pitch,
        velocity: note.velocity,
        channel: tracks[channelIndex].channel,
      });
      active[channelIndex] = null;
    };

    while (orderIndex < song.orders.length && guard++ < 131072) {
      const order = song.orders[orderIndex];
      if (order == null || order === 0xff) break;
      if (order === 0xfe) { orderIndex++; startRow = 0; continue; }
      const pattern = song.patterns[order];
      if (!pattern) { orderIndex++; startRow = 0; continue; }
      const stateKey = `${orderIndex}:${startRow}`;
      if (visited.has(stateKey)) break; // stop at the first song loop
      visited.add(stateKey);
      let jumped = false;
      for (let row = startRow; row < pattern.length; row++) {
        const rowData = pattern[row] || [];
        let jumpOrder = null;
        let breakRow = null;
        let nextSpeed = speed;
        let nextBpm = bpm;

        // Tracker speed/tempo commands are row-scoped and should affect this row immediately.
        for (let ch = 0; ch < channels; ch++) {
          const ev = rowData[ch];
          if (!ev) continue;
          const effect = ev.effect;
          const param = ev.param || 0;
          if (effect === "speed" && param > 0) nextSpeed = clamp(param, 1, 31, speed);
          else if (effect === "tempo" && param >= 32) nextBpm = clamp(param, 32, 255, bpm);
          else if (effect === "jump") jumpOrder = param;
          else if (effect === "break") breakRow = param;
        }
        speed = nextSpeed;
        bpm = nextBpm;
        if (lastTempo !== bpm) {
          tempoEvents.push({ tick: currentTick, bpm });
          lastTempo = bpm;
        }

        for (let ch = 0; ch < channels; ch++) {
          const ev = rowData[ch];
          if (!ev) continue;
          if (ev.instrument != null && ev.instrument > 0) {
            currentInstrument[ch] = ev.instrument;
            tracks[ch].programChanges.push({ tick: currentTick, program: (ev.instrument - 1) & 0x7f, channel: tracks[ch].channel });
          }
          if (ev.volume != null) currentVolume[ch] = clamp(ev.volume, 0, 64, currentVolume[ch]);
          if (ev.noteOff) closeNote(ch, currentTick);
          if (ev.note != null) {
            closeNote(ch, currentTick);
            const volume = ev.volume != null ? ev.volume : currentVolume[ch];
            const velocity = clamp(Math.round((volume / 64) * 126) + 1, 1, 127, 96);
            active[ch] = { startTick: currentTick, pitch: clamp(ev.note, 0, 127, 60), velocity };
          }
        }

        const rowTicks = Math.max(1, Math.round(speed * ppq / 24));
        currentTick += rowTicks;
        if (jumpOrder != null || breakRow != null) {
          orderIndex = jumpOrder != null ? clamp(jumpOrder, 0, song.orders.length, orderIndex + 1) : orderIndex + 1;
          startRow = breakRow != null ? clamp(breakRow, 0, 255, 0) : 0;
          jumped = true;
          break;
        }
      }
      if (!jumped) { orderIndex++; startRow = 0; }
    }
    for (let ch = 0; ch < channels; ch++) closeNote(ch, currentTick || ppq / 4);
    const usedTracks = tracks.filter(track => track.notes.length || track.programChanges.length);
    if (!usedTracks.some(track => track.notes.length)) throw new Error("Tracker 파일에서 연주 노트를 찾지 못했습니다.");
    return {
      midiBytes: core.buildMidi({
        ppq,
        title: song.title || String(fileName || "Tracker module").replace(/\.[^.]+$/, ""),
        tempoEvents: tempoEvents.length ? tempoEvents : [{ tick: 0, bpm: 125 }],
        tracks: usedTracks,
      }),
      metadata: { sourceFormat: song.format, trackerChannels: channels },
    };
  }

  function modChannelsFromMagic(magic) {
    if (["M.K.", "M!K!", "FLT4", "4CHN"].includes(magic)) return 4;
    if (["6CHN", "FLT6"].includes(magic)) return 6;
    if (["8CHN", "FLT8", "CD81", "OKTA"].includes(magic)) return 8;
    let match = magic.match(/^(\d)CHN$/); if (match) return Number(match[1]);
    match = magic.match(/^(\d{2})CH$/); if (match) return Number(match[1]);
    return 0;
  }

  function detectMod(bytes) {
    if (bytes.length < 1084) return false;
    let magic = "";
    for (let i = 1080; i < 1084; i++) magic += String.fromCharCode(bytes[i]);
    return modChannelsFromMagic(magic) > 0;
  }

  function periodToMidi(period) {
    if (!period) return null;
    // In classic MOD tuning, period 428 is C-3. Preserve that musical register.
    return clamp(Math.round(48 - 12 * Math.log2(period / 428)), 0, 127, 48);
  }

  function parseMod(bytes) {
    let magic = "";
    for (let i = 1080; i < 1084; i++) magic += String.fromCharCode(bytes[i]);
    const channels = modChannelsFromMagic(magic);
    if (!channels) throw new Error("지원되는 MOD 채널 서명을 찾지 못했습니다.");
    const songLength = clamp(bytes[950], 1, 128, 1);
    const orders = Array.from(bytes.slice(952, 952 + songLength));
    const maxPattern = orders.reduce((max, value) => Math.max(max, value), 0);
    const patterns = [];
    let pos = 1084;
    for (let patternIndex = 0; patternIndex <= maxPattern; patternIndex++) {
      const rows = Array.from({ length: 64 }, () => Array.from({ length: channels }, rowEvent));
      for (let row = 0; row < 64; row++) {
        for (let ch = 0; ch < channels; ch++) {
          if (pos + 4 > bytes.length) break;
          const b0 = bytes[pos++], b1 = bytes[pos++], b2 = bytes[pos++], b3 = bytes[pos++];
          const instrument = (b0 & 0xf0) | (b2 >> 4);
          const period = ((b0 & 0x0f) << 8) | b1;
          const fx = b2 & 0x0f;
          const ev = rows[row][ch];
          if (instrument) ev.instrument = instrument;
          const note = periodToMidi(period); if (note != null) ev.note = note;
          if (fx === 0x0c) ev.volume = clamp(b3, 0, 64, 64);
          else if (fx === 0x0f && b3) {
            if (b3 <= 31) { ev.effect = "speed"; ev.param = b3; }
            else { ev.effect = "tempo"; ev.param = b3; }
          } else if (fx === 0x0b) { ev.effect = "jump"; ev.param = b3; }
          else if (fx === 0x0d) { ev.effect = "break"; ev.param = ((b3 >> 4) * 10) + (b3 & 0x0f); }
          else if (fx === 0x0e && (b3 >> 4) === 0x0c && (b3 & 0x0f) === 0) ev.noteOff = true;
        }
      }
      patterns.push(rows);
    }
    return { format: "MOD", title: titleFromBytes(bytes, 0, 20, "MOD module"), channels, orders, patterns, speed: 6, bpm: 125 };
  }

  function detectS3m(bytes) { return bytes.length >= 0x60 && asciiAt(bytes, 44, "SCRM"); }
  function parseS3m(bytes) {
    const orderCount = le16(bytes, 0x20), instrumentCount = le16(bytes, 0x22), patternCount = le16(bytes, 0x24);
    if (!orderCount || orderCount > 256 || patternCount > 256) throw new Error("S3M 헤더가 올바르지 않습니다.");
    const orders = Array.from(bytes.slice(0x60, 0x60 + orderCount));
    const pointerBase = 0x60 + orderCount + instrumentCount * 2;
    const patternPointers = Array.from({ length: patternCount }, (_, i) => le16(bytes, pointerBase + i * 2) * 16);
    let channels = 0;
    for (let i = 0; i < 32; i++) if (bytes[0x40 + i] < 16) channels = Math.max(channels, i + 1);
    channels = Math.max(1, channels);
    const patterns = patternPointers.map(ptr => {
      const rows = Array.from({ length: 64 }, () => Array.from({ length: channels }, rowEvent));
      if (!ptr || ptr + 2 > bytes.length) return rows;
      const packedLength = le16(bytes, ptr);
      let pos = ptr + 2, end = Math.min(bytes.length, ptr + Math.max(2, packedLength));
      let row = 0;
      while (pos < end && row < 64) {
        const token = bytes[pos++];
        if (token === 0) { row++; continue; }
        const ch = token & 31;
        let note = null, instrument = null, volume = null, command = null, info = 0;
        if (token & 0x20) { note = bytes[pos++]; instrument = bytes[pos++]; }
        if (token & 0x40) volume = bytes[pos++];
        if (token & 0x80) { command = bytes[pos++]; info = bytes[pos++]; }
        if (ch >= channels || row >= 64) continue;
        const ev = rows[row][ch];
        if (instrument && instrument !== 255) ev.instrument = instrument;
        if (note === 254) ev.noteOff = true;
        else if (note != null && note !== 255) {
          const pitchClass = note & 0x0f, octave = note >> 4;
          if (pitchClass < 12) ev.note = clamp((octave + 1) * 12 + pitchClass, 0, 127, 60);
        }
        if (volume != null && volume <= 64) ev.volume = volume;
        if (command === 1 && info) { ev.effect = "speed"; ev.param = info; }
        else if (command === 2) { ev.effect = "jump"; ev.param = info; }
        else if (command === 3) { ev.effect = "break"; ev.param = ((info >> 4) * 10) + (info & 15); }
        else if (command === 20 && info >= 32) { ev.effect = "tempo"; ev.param = info; }
      }
      return rows;
    });
    return { format: "S3M", title: titleFromBytes(bytes, 0, 28, "S3M module"), channels, orders, patterns, speed: bytes[0x31] || 6, bpm: bytes[0x32] || 125 };
  }

  function detectXm(bytes) { return bytes.length >= 80 && asciiAt(bytes, 0, "Extended Module: "); }
  function parseXm(bytes) {
    const headerSize = le32(bytes, 60);
    const orderCount = le16(bytes, 64), channels = le16(bytes, 68), patternCount = le16(bytes, 70);
    const speed = le16(bytes, 76) || 6, bpm = le16(bytes, 78) || 125;
    if (!channels || channels > 128 || patternCount > 512) throw new Error("XM 헤더가 올바르지 않습니다.");
    const orders = Array.from(bytes.slice(80, 80 + orderCount));
    const patterns = [];
    let pos = 60 + headerSize;
    for (let p = 0; p < patternCount && pos + 9 <= bytes.length; p++) {
      const patternHeaderLength = le32(bytes, pos);
      const rowCount = le16(bytes, pos + 5) || 64;
      const packedSize = le16(bytes, pos + 7);
      const dataStart = pos + patternHeaderLength;
      const end = Math.min(bytes.length, dataStart + packedSize);
      const rows = Array.from({ length: rowCount }, () => Array.from({ length: channels }, rowEvent));
      let cursor = dataStart;
      for (let row = 0; row < rowCount && cursor < end; row++) {
        for (let ch = 0; ch < channels && cursor < end; ch++) {
          let note = 0, instrument = 0, volume = 0, effect = 0, param = 0;
          const first = bytes[cursor++];
          if (first & 0x80) {
            if (first & 0x01) note = bytes[cursor++];
            if (first & 0x02) instrument = bytes[cursor++];
            if (first & 0x04) volume = bytes[cursor++];
            if (first & 0x08) effect = bytes[cursor++];
            if (first & 0x10) param = bytes[cursor++];
          } else {
            note = first;
            instrument = bytes[cursor++]; volume = bytes[cursor++]; effect = bytes[cursor++]; param = bytes[cursor++];
          }
          const ev = rows[row][ch];
          if (instrument) ev.instrument = instrument;
          if (note === 97) ev.noteOff = true;
          else if (note >= 1 && note <= 96) ev.note = clamp(note + 11, 0, 127, 60);
          if (volume >= 0x10 && volume <= 0x50) ev.volume = volume - 0x10;
          if (effect === 0x0f && param) {
            if (param <= 31) { ev.effect = "speed"; ev.param = param; }
            else { ev.effect = "tempo"; ev.param = param; }
          } else if (effect === 0x0b) { ev.effect = "jump"; ev.param = param; }
          else if (effect === 0x0d) { ev.effect = "break"; ev.param = ((param >> 4) * 10) + (param & 15); }
          else if (effect === 0x0c) ev.volume = clamp(param, 0, 64, 64);
        }
      }
      patterns.push(rows);
      pos = end;
    }
    return { format: "XM", title: titleFromBytes(bytes, 17, 20, "XM module"), channels, orders, patterns, speed, bpm };
  }

  function detectIt(bytes) { return bytes.length >= 0xc0 && asciiAt(bytes, 0, "IMPM"); }
  function parseIt(bytes) {
    const orderCount = le16(bytes, 0x20), instrumentCount = le16(bytes, 0x22), sampleCount = le16(bytes, 0x24), patternCount = le16(bytes, 0x26);
    if (!orderCount || orderCount > 512 || patternCount > 1024) throw new Error("IT 헤더가 올바르지 않습니다.");
    const orders = Array.from(bytes.slice(0xc0, 0xc0 + orderCount));
    let pointerPos = 0xc0 + orderCount + instrumentCount * 4 + sampleCount * 4;
    const patternPointers = Array.from({ length: patternCount }, (_, i) => le32(bytes, pointerPos + i * 4));
    let maxChannel = 0;
    const patterns = patternPointers.map(ptr => {
      if (!ptr || ptr + 8 > bytes.length) return Array.from({ length: 64 }, () => []);
      const packedLength = le16(bytes, ptr), rowCount = le16(bytes, ptr + 2) || 64;
      const rows = Array.from({ length: rowCount }, () => []);
      const masks = new Uint8Array(64), lastNote = new Uint8Array(64), lastInstr = new Uint8Array(64), lastVol = new Uint8Array(64), lastCmd = new Uint8Array(64), lastParam = new Uint8Array(64);
      let pos = ptr + 8, end = Math.min(bytes.length, ptr + 8 + packedLength), row = 0;
      while (pos < end && row < rowCount) {
        const channelByte = bytes[pos++];
        if (channelByte === 0) { row++; continue; }
        const ch = (channelByte - 1) & 63;
        maxChannel = Math.max(maxChannel, ch + 1);
        if (channelByte & 0x80) masks[ch] = bytes[pos++];
        const mask = masks[ch];
        let note = null, instr = null, vol = null, cmd = null, param = null;
        if (mask & 1) lastNote[ch] = note = bytes[pos++]; else if (mask & 16) note = lastNote[ch];
        if (mask & 2) lastInstr[ch] = instr = bytes[pos++]; else if (mask & 32) instr = lastInstr[ch];
        if (mask & 4) lastVol[ch] = vol = bytes[pos++]; else if (mask & 64) vol = lastVol[ch];
        if (mask & 8) { lastCmd[ch] = cmd = bytes[pos++]; lastParam[ch] = param = bytes[pos++]; }
        else if (mask & 128) { cmd = lastCmd[ch]; param = lastParam[ch]; }
        if (!rows[row][ch]) rows[row][ch] = rowEvent();
        const ev = rows[row][ch];
        if (instr) ev.instrument = instr;
        if (note === 253 || note === 254 || note === 255) ev.noteOff = true;
        else if (note != null && note >= 1 && note <= 120) ev.note = clamp(note + 11, 0, 127, 60);
        if (vol != null && vol <= 64) ev.volume = vol;
        if (cmd === 1 && param) { ev.effect = "speed"; ev.param = param; }
        else if (cmd === 2) { ev.effect = "jump"; ev.param = param; }
        else if (cmd === 3) { ev.effect = "break"; ev.param = ((param >> 4) * 10) + (param & 15); }
        else if (cmd === 20 && param >= 32) { ev.effect = "tempo"; ev.param = param; }
      }
      return rows;
    });
    const channels = Math.max(1, maxChannel);
    for (const pattern of patterns) for (const row of pattern) while (row.length < channels) row.push(undefined);
    return { format: "IT", title: titleFromBytes(bytes, 4, 26, "IT module"), channels, orders, patterns, speed: bytes[0x32] || 6, bpm: bytes[0x33] || 125 };
  }

  function detect(input, fileName = "") {
    const bytes = core.asUint8Array(input);
    const ext = core.extensionOf(fileName);
    if (ext === "mod") return detectMod(bytes);
    if (ext === "s3m") return detectS3m(bytes);
    if (ext === "xm") return detectXm(bytes);
    if (ext === "it") return detectIt(bytes);
    return detectXm(bytes) || detectS3m(bytes) || detectIt(bytes) || detectMod(bytes);
  }

  function convert(input, fileName = "module.mod") {
    const bytes = core.asUint8Array(input);
    let song;
    if (detectXm(bytes)) song = parseXm(bytes);
    else if (detectS3m(bytes)) song = parseS3m(bytes);
    else if (detectIt(bytes)) song = parseIt(bytes);
    else if (detectMod(bytes)) song = parseMod(bytes);
    else throw new Error("지원되는 Tracker 형식(MOD/S3M/XM/IT)을 판별하지 못했습니다.");
    return buildSong(song, fileName);
  }

  root.MabiTrackerSequence = Object.freeze({ detect, convert, detectMod, detectS3m, detectXm, detectIt });
})();
