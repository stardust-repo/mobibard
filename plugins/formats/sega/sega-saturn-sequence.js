(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before sega-saturn-sequence.js");

  const be16 = (b, o) => ((b[o] << 8) | b[o + 1]) >>> 0;
  const be32 = (b, o) => (((b[o] << 24) >>> 0) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const clamp = (v, lo, hi, fallback = lo) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : fallback;
  const titleFromName = name => String(name || "Sega Saturn SEQ").replace(/\.[^.]+$/, "");

  function locateSong(bytes) {
    if (bytes.length < 16) return null;
    // Normal Saturn sequence banks start with song count + BE32 pointers. The first pointer
    // immediately follows the pointer table: 2 + songCount * 4.
    const count = be16(bytes, 0);
    if (count > 0 && count <= 128 && 2 + count * 4 <= bytes.length) {
      const first = be32(bytes, 2);
      if (first === 2 + count * 4 && first + 8 < bytes.length) return { offset: first, count };
    }
    // Also accept an already-extracted single song beginning directly at its SEQ header.
    const resolution = be16(bytes, 0), tempoCount = be16(bytes, 2), dataOffset = be16(bytes, 4);
    if (resolution >= 12 && resolution <= 9600 && tempoCount <= 1024 && dataOffset >= 8 && dataOffset < bytes.length) {
      return { offset: 0, count: 1 };
    }
    return null;
  }

  function plausibleNormalEvent(bytes, songOffset, dataOffset) {
    const pos = songOffset + dataOffset;
    if (pos >= bytes.length) return false;
    const status = bytes[pos];
    return status <= 0x7f || status === 0x81 || status === 0x82 || status === 0x83 ||
      (status >= 0x88 && status <= 0x8f) || (status >= 0xa0 && status <= 0xef) || status === 0xff;
  }

  function detect(input) {
    const bytes = core.asUint8Array(input);
    // Avoid the PlayStation format, which uses the same .seq extension but has a pQES signature.
    if (bytes.length >= 4 && bytes[0] === 0x70 && bytes[1] === 0x51 && bytes[2] === 0x45 && bytes[3] === 0x53) return false;
    const found = locateSong(bytes);
    if (!found) return false;
    const song = found.offset;
    if (song + 8 > bytes.length) return false;
    const resolution = be16(bytes, song), tempoCount = be16(bytes, song + 2), dataOffset = be16(bytes, song + 4);
    if (resolution < 12 || resolution > 9600 || tempoCount > 1024 || dataOffset < 8 || song + dataOffset >= bytes.length) return false;
    const tempoEnd = song + 8 + tempoCount * 8;
    if (tempoEnd > bytes.length || dataOffset < 8 + tempoCount * 8) return false;
    return plausibleNormalEvent(bytes, song, dataOffset);
  }

  function convert(input, fileName = "sequence.seq") {
    const bytes = core.asUint8Array(input);
    const located = locateSong(bytes);
    if (!located || !detect(bytes)) throw new Error("Sega Saturn SEQ v2 시퀀스를 판별하지 못했습니다.");
    const songOffset = located.offset;
    const resolution = be16(bytes, songOffset);
    const tempoCount = be16(bytes, songOffset + 2);
    const dataOffset = be16(bytes, songOffset + 4);
    const normalStart = songOffset + dataOffset;
    const tempoEvents = [];
    let tempoTick = 0;
    let tempoPos = songOffset + 8;
    for (let i = 0; i < tempoCount && tempoPos + 8 <= bytes.length; i++, tempoPos += 8) {
      const step = be32(bytes, tempoPos);
      const mpqn = be32(bytes, tempoPos + 4);
      if (mpqn > 0 && mpqn <= 0xffffff) tempoEvents.push({ tick: tempoTick, bpm: 60000000 / mpqn });
      tempoTick += step;
    }
    if (!tempoEvents.length) tempoEvents.push({ tick: 0, bpm: 120 });

    const channels = Array.from({ length: 16 }, (_, channel) => ({
      name: channel === 9 ? "Drums" : `Saturn Ch ${channel + 1}`,
      channel,
      program: 0,
      notes: [],
      controlChanges: [],
      programChanges: [],
      pitchBends: [],
      touched: false,
      isDrums: channel === 9,
    }));
    const state = { clock: 0, gateExtra: 0, steps: 0 };
    const MAX_EVENTS = 1000000;

    function advance(amount) {
      state.clock += Math.max(0, amount | 0);
    }
    function parseRange(start, logicalLimit = Infinity, depth = 0) {
      if (depth > 8) throw new Error("Sega Saturn SEQ reference 중첩이 너무 깊습니다.");
      let pos = start, logical = 0;
      while (pos < bytes.length && logical < logicalLimit && state.steps++ < MAX_EVENTS) {
        const status = bytes[pos++];
        if (status <= 0x7f) {
          if (pos + 4 > bytes.length) break;
          const channel = status & 0x0f;
          const pitch = bytes[pos++], velocity = bytes[pos++];
          const gateLow = bytes[pos++], stepLow = bytes[pos++];
          const gate = state.gateExtra + gateLow + ((status & 0x40) ? 0x100 : 0);
          const step = stepLow + ((status & 0x20) ? 0x100 : 0);
          state.gateExtra = 0;
          advance(step);
          channels[channel].notes.push({
            startTick: state.clock,
            durationTick: Math.max(1, gate),
            pitch: clamp(pitch, 0, 127, 60),
            velocity: clamp(velocity, 1, 127, 96),
            channel,
          });
          channels[channel].touched = true;
          logical++;
        } else if (status >= 0xb0 && status <= 0xbf) {
          if (pos + 3 > bytes.length) break;
          const channel = status & 0x0f, controller = bytes[pos++], value = bytes[pos++], step = bytes[pos++];
          advance(step);
          channels[channel].controlChanges.push({ tick: state.clock, controller, value, channel });
          channels[channel].touched = true;
          logical++;
        } else if (status >= 0xc0 && status <= 0xcf) {
          if (pos + 2 > bytes.length) break;
          const channel = status & 0x0f, program = bytes[pos++], step = bytes[pos++];
          advance(step);
          channels[channel].program = program & 0x7f;
          channels[channel].programChanges.push({ tick: state.clock, program: program & 0x7f, channel });
          channels[channel].touched = true;
          logical++;
        } else if (status >= 0xa0 && status <= 0xaf) {
          if (pos + 3 > bytes.length) break;
          pos += 2; advance(bytes[pos++]); logical++;
        } else if (status >= 0xd0 && status <= 0xdf) {
          if (pos + 2 > bytes.length) break;
          pos++; advance(bytes[pos++]); logical++;
        } else if (status >= 0xe0 && status <= 0xef) {
          if (pos + 2 > bytes.length) break;
          const channel = status & 0x0f, msb = bytes[pos++], step = bytes[pos++];
          advance(step);
          channels[channel].pitchBends.push({ tick: state.clock, lsb: 0, msb, channel });
          channels[channel].touched = true;
          logical++;
        } else if (status === 0x81) {
          if (pos + 3 > bytes.length) break;
          const offset = be16(bytes, pos); pos += 2;
          const count = bytes[pos++];
          const reference = normalStart + offset;
          if (reference >= normalStart && reference < bytes.length && count) parseRange(reference, count, depth + 1);
          logical++;
        } else if (status === 0x82) {
          if (pos >= bytes.length) break;
          advance(bytes[pos++]);
          logical++;
        } else if (status === 0x83) {
          return { pos, ended: true };
        } else if (status === 0x88) state.gateExtra += 0x200;
        else if (status === 0x89) state.gateExtra += 0x800;
        else if (status === 0x8a) state.gateExtra += 0x1000;
        else if (status === 0x8b) state.gateExtra += 0x2000;
        else if (status === 0x8c) advance(0x100);
        else if (status === 0x8d) advance(0x200);
        else if (status === 0x8e) advance(0x800);
        else if (status === 0x8f) advance(0x1000);
        else if (status === 0xff) {
          // Saturn's sound simulator strips this fixed-width meta record. It does not carry step time.
          pos = Math.min(bytes.length, pos + 5);
          logical++;
        } else break;
      }
      return { pos, ended: false };
    }

    parseRange(normalStart);
    const tracks = channels.filter(track => track.touched || track.notes.length);
    if (!tracks.some(track => track.notes.length)) throw new Error("Sega Saturn SEQ에서 연주 노트를 찾지 못했습니다.");
    return {
      midiBytes: core.buildMidi({ ppq: resolution, title: titleFromName(fileName), tempoEvents, tracks }),
      metadata: {
        sourceFormat: "Sega Saturn SEQ v2",
        sequenceBankCount: located.count,
        importedSequence: 1,
        resolution,
      },
    };
  }


  const le16 = (b, o) => (b[o] | (b[o + 1] << 8)) >>> 0;
  const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const asciiAt = (bytes, offset, text) => {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  };

  function detectXgm(input) {
    const bytes = core.asUint8Array(input);
    return bytes.length >= 0x10 && (asciiAt(bytes, 0, "XGM ") || asciiAt(bytes, 0, "XGM2"));
  }

  function midiNoteFromHz(hz) {
    if (!(hz > 0) || !Number.isFinite(hz)) return null;
    return clamp(69 + 12 * Math.log2(hz / 440), 0, 127, 60);
  }

  function makeXgmTrack(name, channel, program) {
    return { name, channel, program, notes: [], programChanges: [{ tick: 0, program, channel }], controlChanges: [], pitchBends: [], touched: false, active: null };
  }

  function closeXgmTrack(track, tick) {
    if (!track?.active) return;
    const active = track.active;
    track.notes.push({ startTick: active.tick, endTick: Math.max(active.tick + 1, tick), pitch: active.pitch, velocity: active.velocity, channel: track.channel });
    track.touched = true;
    track.active = null;
  }

  function startXgmTrack(track, tick, pitch, velocity = 96) {
    if (pitch == null) return;
    closeXgmTrack(track, tick);
    track.active = { tick, pitch, velocity: clamp(velocity, 1, 127, 96) };
    track.touched = true;
  }

  function updateXgmTrackPitch(track, tick, pitch) {
    if (!track?.active || pitch == null || track.active.pitch === pitch) return;
    const velocity = track.active.velocity;
    closeXgmTrack(track, tick);
    startXgmTrack(track, tick, pitch, velocity);
  }

  function xgmYmPitch(rawFrequency, pal = false) {
    const fnum = rawFrequency & 0x7ff;
    const block = (rawFrequency >> 11) & 0x07;
    if (!fnum) return null;
    const clock = pal ? 7600489 : 7670454;
    const hz = (fnum * Math.pow(2, block) * clock) / (144 * Math.pow(2, 20));
    return midiNoteFromHz(hz);
  }

  function xgmPsgPitch(tone, pal = false) {
    if (!(tone > 0)) return null;
    const clock = pal ? 3546893 : 3579545;
    return midiNoteFromHz(clock / (32 * tone));
  }

  function makeXgmState(pal) {
    const fm = Array.from({ length: 6 }, (_, i) => makeXgmTrack(`Mega Drive FM ${i + 1}`, i, 81));
    const psg = Array.from({ length: 3 }, (_, i) => makeXgmTrack(`Mega Drive PSG ${i + 1}`, 10 + i, 80));
    return {
      pal,
      fm,
      psg,
      fmFreq: new Uint16Array(6),
      psgTone: new Uint16Array([0, 0, 0, 0]),
      psgVolume: new Uint8Array([15, 15, 15, 15]),
      psgLatchChannel: 0,
      psgLatchVolume: false,
    };
  }

  function xgmYmChannelFromKey(value) {
    const low = value & 0x03;
    if (low === 3) return -1;
    return low + ((value & 0x04) ? 3 : 0);
  }

  function xgmYmKey(state, value, tick) {
    const channel = xgmYmChannelFromKey(value);
    if (channel < 0 || channel >= 6) return;
    if (value & 0xf0) startXgmTrack(state.fm[channel], tick, xgmYmPitch(state.fmFreq[channel], state.pal), 100);
    else closeXgmTrack(state.fm[channel], tick);
  }

  function xgmYmWrite(state, port, reg, value, tick) {
    if (reg >= 0xa0 && reg <= 0xa2) {
      const channel = (port ? 3 : 0) + (reg - 0xa0);
      state.fmFreq[channel] = (state.fmFreq[channel] & 0x3f00) | value;
      updateXgmTrackPitch(state.fm[channel], tick, xgmYmPitch(state.fmFreq[channel], state.pal));
    } else if (reg >= 0xa4 && reg <= 0xa6) {
      const channel = (port ? 3 : 0) + (reg - 0xa4);
      state.fmFreq[channel] = (state.fmFreq[channel] & 0x00ff) | ((value & 0x3f) << 8);
      updateXgmTrackPitch(state.fm[channel], tick, xgmYmPitch(state.fmFreq[channel], state.pal));
    } else if (!port && reg === 0x28) {
      xgmYmKey(state, value, tick);
    }
  }

  function refreshXgmPsg(state, channel, tick) {
    if (channel < 0 || channel >= 3) return;
    const track = state.psg[channel];
    const volume = state.psgVolume[channel];
    const pitch = xgmPsgPitch(state.psgTone[channel], state.pal);
    if (volume >= 15 || pitch == null) closeXgmTrack(track, tick);
    else {
      const velocity = clamp(((15 - volume) / 15) * 127, 1, 127, 96);
      if (!track.active) startXgmTrack(track, tick, pitch, velocity);
      else if (track.active.pitch !== pitch || Math.abs(track.active.velocity - velocity) >= 8) startXgmTrack(track, tick, pitch, velocity);
    }
  }

  function xgmPsgWrite(state, value, tick) {
    if (value & 0x80) {
      const channel = (value >> 5) & 0x03;
      const volume = Boolean(value & 0x10);
      state.psgLatchChannel = channel;
      state.psgLatchVolume = volume;
      if (volume) state.psgVolume[channel] = value & 0x0f;
      else if (channel < 3) state.psgTone[channel] = (state.psgTone[channel] & 0x3f0) | (value & 0x0f);
      refreshXgmPsg(state, channel, tick);
    } else {
      const channel = state.psgLatchChannel;
      if (state.psgLatchVolume) state.psgVolume[channel] = value & 0x0f;
      else if (channel < 3) state.psgTone[channel] = (state.psgTone[channel] & 0x00f) | ((value & 0x3f) << 4);
      refreshXgmPsg(state, channel, tick);
    }
  }

  function finishXgm(state, tick, fileName, sourceFormat, frameRate) {
    for (const track of [...state.fm, ...state.psg]) closeXgmTrack(track, tick + 1);
    const tracks = [...state.fm, ...state.psg].filter(track => track.touched && track.notes.length).map(({ active, ...track }) => track);
    if (!tracks.length) throw new Error(`${sourceFormat}에서 복원 가능한 FM/PSG 연주 노트를 찾지 못했습니다.`);
    return {
      midiBytes: core.buildMidi({ ppq: frameRate, title: titleFromName(fileName), tempoEvents: [{ tick: 0, bpm: 60 }], tracks }),
      metadata: { sourceFormat, frameRate, approximation: "FM/PSG frequency-to-note" },
    };
  }

  function convertXgmV1(bytes, fileName) {
    const sampleLength = le16(bytes, 0x100) * 256;
    const flags = bytes[0x103] || 0;
    const pal = Boolean(flags & 1);
    const frameRate = pal ? 50 : 60;
    const musicLengthOffset = 0x104 + sampleLength;
    if (musicLengthOffset + 4 > bytes.length) throw new Error("XGM 음악 데이터 헤더가 잘렸습니다.");
    const musicLength = le32(bytes, musicLengthOffset);
    const start = musicLengthOffset + 4;
    const end = Math.min(bytes.length, start + musicLength);
    const state = makeXgmState(pal);
    let pos = start, tick = 0, commands = 0;
    while (pos < end && commands++ < 2000000) {
      const command = bytes[pos++];
      if (command === 0x00) { tick++; continue; }
      const type = command >> 4, low = command & 0x0f;
      if (type === 1) {
        const count = low + 1;
        for (let i = 0; i < count && pos < end; i++) xgmPsgWrite(state, bytes[pos++], tick);
      } else if (type === 2 || type === 3) {
        const count = low + 1, port = type === 3 ? 1 : 0;
        for (let i = 0; i < count && pos + 1 < end; i++) { const reg = bytes[pos++], value = bytes[pos++]; xgmYmWrite(state, port, reg, value, tick); }
      } else if (type === 4) {
        const count = low + 1;
        for (let i = 0; i < count && pos < end; i++) xgmYmKey(state, bytes[pos++], tick);
      } else if (type === 5) {
        pos = Math.min(end, pos + 1); // PCM sample id: no stable pitch information.
      } else if (command === 0x7e) {
        pos = Math.min(end, pos + 3); // loop target; import one linear pass only.
      } else if (command === 0x7f) break;
      else break;
    }
    return finishXgm(state, tick, fileName, "Mega Drive XGM v1", frameRate);
  }

  function xgm2Channel(low) {
    const base = low & 0x03;
    if (base > 2) return -1;
    return base + ((low & 0x04) ? 3 : 0);
  }

  function xgm2SetFrequency(state, channel, raw, tick, keyOff, keyOn) {
    if (channel < 0 || channel >= 6) return;
    if (keyOff) closeXgmTrack(state.fm[channel], tick);
    state.fmFreq[channel] = raw & 0x3fff;
    if (keyOn) startXgmTrack(state.fm[channel], tick, xgmYmPitch(state.fmFreq[channel], state.pal), 100);
    else updateXgmTrackPitch(state.fm[channel], tick, xgmYmPitch(state.fmFreq[channel], state.pal));
  }

  function parseXgm2Fm(bytes, start, end, state) {
    let pos = start, tick = 0, commands = 0;
    while (pos < end && commands++ < 2000000) {
      const cmd = bytes[pos++], type = cmd >> 4, low = cmd & 0x0f;
      if (type === 0) {
        if (low === 0x0f) { if (pos >= end) break; tick += 16 + bytes[pos++]; }
        else tick += low + 1;
      } else if (type === 1) pos = Math.min(end, pos + 1);
      else if (type === 2) pos = Math.min(end, pos + 30);
      else if (type === 3 || type === 8) {
        if (pos + 1 >= end) break;
        const word = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2;
        if (!(low & 0x08)) xgm2SetFrequency(state, xgm2Channel(low), word & 0x3fff, tick, Boolean(word & 0x4000), Boolean(word & 0x8000));
        if (type === 8) tick++;
      } else if (type === 4 || type === 5) {
        const ch = xgm2Channel(low);
        if (ch >= 0) {
          if (type === 4) { if (low & 0x08) startXgmTrack(state.fm[ch], tick, xgmYmPitch(state.fmFreq[ch], state.pal), 100); else closeXgmTrack(state.fm[ch], tick); }
          else { closeXgmTrack(state.fm[ch], tick); startXgmTrack(state.fm[ch], tick, xgmYmPitch(state.fmFreq[ch], state.pal), 100); if (low & 0x08) closeXgmTrack(state.fm[ch], tick + 1); }
        }
      } else if (type === 6 || type === 7) {
        // panning only
      } else if (type === 9 || type === 0xc) pos = Math.min(end, pos + 1);
      else if (type === 0xa || type === 0xb) {
        if (pos >= end) break;
        const deltaByte = bytes[pos++], ch = xgm2Channel(low);
        if (ch >= 0 && !(low & 0x08)) {
          const delta = (deltaByte >> 1) + 1;
          const next = (state.fmFreq[ch] + ((deltaByte & 1) ? -delta : delta)) & 0x3fff;
          xgm2SetFrequency(state, ch, next, tick, false, false);
        }
        if (type === 0xb) tick++;
      } else if (type === 0xd) { pos = Math.min(end, pos + 1); tick++; }
      else if (type === 0xe) {
        const count = (low & 7) + 1, port = (low & 8) ? 1 : 0;
        for (let i = 0; i < count && pos + 1 < end; i++) { const reg = bytes[pos++], value = bytes[pos++]; xgmYmWrite(state, port, reg, value, tick); }
      } else if (cmd === 0xf0) {
        // splitter only; no musical time passes by itself.
      } else if (cmd === 0xf8) { if (pos < end) xgmYmKey(state, bytes[pos++], tick); }
      else if (cmd === 0xf9) pos = Math.min(end, pos + 1);
      else if (cmd >= 0xfa && cmd <= 0xfd) { /* mode/DAC toggles */ }
      else if (cmd === 0xff) { pos = Math.min(end, pos + 3); break; }
      else break;
    }
    return tick;
  }

  function setXgm2PsgTone(state, ch, tone, tick) {
    if (ch < 0 || ch >= 3) return;
    state.psgTone[ch] = tone & 0x3ff;
    refreshXgmPsg(state, ch, tick);
  }

  function parseXgm2Psg(bytes, start, end, state) {
    let pos = start, tick = 0, commands = 0;
    while (pos < end && commands++ < 2000000) {
      const cmd = bytes[pos++], type = cmd >> 4, low = cmd & 0x0f;
      if (type === 0) {
        if (low <= 0x0d) tick += low + 1;
        else if (low === 0x0e) { if (pos >= end) break; tick += 15 + bytes[pos++]; }
        else { pos = Math.min(end, pos + 3); break; }
      } else if (type === 1) {
        if (pos >= end) break;
        xgmPsgWrite(state, bytes[pos++], tick);
        if (low & 1) tick++;
      } else if (type === 2 || type === 3) {
        if (pos >= end) break;
        const ch = (low >> 2) & 3, tone = ((low & 3) << 8) | bytes[pos++];
        if (ch < 3) setXgm2PsgTone(state, ch, tone, tick);
        if (type === 3) tick++;
      } else if (type >= 4 && type <= 7) {
        const ch = type - 4;
        if (ch < 3) {
          const delta = (low & 3) + 1;
          setXgm2PsgTone(state, ch, state.psgTone[ch] + ((low & 4) ? -delta : delta), tick);
        }
        if (low & 8) tick++;
      } else if (type >= 8 && type <= 0xb) {
        const ch = type - 8;
        state.psgVolume[ch] = low & 0x0f;
        refreshXgmPsg(state, ch, tick);
      } else if (type >= 0xc) {
        const ch = type - 0xc;
        const delta = (low & 3) + 1;
        state.psgVolume[ch] = clamp(state.psgVolume[ch] + ((low & 4) ? -delta : delta), 0, 15, 15);
        refreshXgmPsg(state, ch, tick);
        if (low & 8) tick++;
      }
    }
    return tick;
  }

  function firstTrackRange(bytes, tableOffset, dataStart, dataLength) {
    const first = le16(bytes, tableOffset);
    if (first === 0xffff) return { start: dataStart, end: dataStart };
    const start = dataStart + first * 256;
    let end = dataStart + dataLength;
    for (let i = 1; i < 128; i++) {
      const next = le16(bytes, tableOffset + i * 2);
      if (next !== 0xffff && next > first) { end = Math.min(end, dataStart + next * 256); break; }
    }
    return { start: Math.min(start, dataStart + dataLength), end: Math.min(end, dataStart + dataLength) };
  }

  function convertXgmV2(bytes, fileName) {
    const flags = bytes[5] || 0;
    if (flags & 0x08) throw new Error("압축된 XGM2 FM/PSG 스트림은 현재 직접 변환하지 않습니다.");
    const pal = Boolean(flags & 1), multi = Boolean(flags & 2), frameRate = pal ? 50 : 60;
    const sampleLength = le16(bytes, 6) * 256, fmLength = le16(bytes, 8) * 256, psgLength = le16(bytes, 10) * 256;
    const sidSize = multi ? 504 : 248;
    let tableEnd = 12 + sidSize;
    let fmTable = -1, psgTable = -1;
    if (multi) { fmTable = tableEnd; psgTable = tableEnd + 256; tableEnd += 512; }
    const sampleStart = tableEnd, fmStart = sampleStart + sampleLength, psgStart = fmStart + fmLength;
    if (psgStart + psgLength > bytes.length) throw new Error("XGM2 데이터 블록 길이가 파일 크기를 벗어납니다.");
    let fmRange = { start: fmStart, end: fmStart + fmLength }, psgRange = { start: psgStart, end: psgStart + psgLength };
    if (multi) {
      fmRange = firstTrackRange(bytes, fmTable, fmStart, fmLength);
      psgRange = firstTrackRange(bytes, psgTable, psgStart, psgLength);
    }
    const state = makeXgmState(pal);
    const fmTicks = parseXgm2Fm(bytes, fmRange.start, fmRange.end, state);
    const psgTicks = parseXgm2Psg(bytes, psgRange.start, psgRange.end, state);
    return finishXgm(state, Math.max(fmTicks, psgTicks), fileName, "Mega Drive XGM2", frameRate);
  }

  function convertXgm(input, fileName = "sequence.xgm") {
    const bytes = core.asUint8Array(input);
    if (asciiAt(bytes, 0, "XGM ")) return convertXgmV1(bytes, fileName);
    if (asciiAt(bytes, 0, "XGM2")) return convertXgmV2(bytes, fileName);
    throw new Error("XGM/XGM2 헤더를 찾지 못했습니다.");
  }

  root.MabiSegaSaturnSequence = Object.freeze({ detect, convert, detectXgm, convertXgm });
})();
