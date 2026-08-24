(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before legacy-pc-sequence.js");

  const clamp = (value, min, max, fallback = min) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  };
  const asciiAt = (bytes, offset, text) => {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  };
  const le16 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  const le32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const be32 = (bytes, offset) => (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  const titleFromName = fileName => String(fileName || "Legacy PC sequence").replace(/\.[^.]+$/, "");

  function readMidiVlq(bytes, state, end = bytes.length) {
    let value = 0;
    let count = 0;
    while (state.pos < end && count++ < 4) {
      const byte = bytes[state.pos++];
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value >>> 0;
    }
    return value >>> 0;
  }

  function readHmpDelta(bytes, state, end) {
    let value = 0;
    for (let shift = 0; shift < 28 && state.pos < end; shift += 7) {
      const byte = bytes[state.pos++];
      value |= (byte & 0x7f) << shift;
      if (byte & 0x80) break;
    }
    return value >>> 0;
  }

  function makeChannels() {
    return Array.from({ length: 16 }, (_, channel) => ({
      channel,
      name: channel === 9 ? "Drums" : `Channel ${channel + 1}`,
      program: 0,
      notes: [],
      controlChanges: [],
      programChanges: [],
      pitchBends: [],
      touched: false,
    }));
  }

  function finishTracks(channels) {
    return channels.filter(track => track.touched || track.notes.length).map(track => ({
      ...track,
      isDrums: track.channel === 9,
    }));
  }

  function closeActive(active, channels, key, endTick) {
    const item = active.get(key);
    if (!item) return;
    const track = channels[item.channel];
    track.notes.push({
      startTick: item.startTick,
      endTick: Math.max(item.startTick + 1, endTick),
      pitch: item.pitch,
      velocity: item.velocity,
      channel: item.channel,
    });
    track.touched = true;
    active.delete(key);
  }

  function addProgram(channels, channel, tick, program) {
    const track = channels[channel];
    track.program = clamp(program, 0, 127, track.program || 0);
    track.programChanges.push({ tick, program: track.program, channel });
    track.touched = true;
  }

  function addControl(channels, channel, tick, controller, value) {
    channels[channel].controlChanges.push({ tick, controller, value, channel });
    channels[channel].touched = true;
  }

  function addPitch(channels, channel, tick, lsb, msb) {
    channels[channel].pitchBends.push({ tick, lsb, msb, channel });
    channels[channel].touched = true;
  }

  function findAscii(bytes, text, start = 0, end = bytes.length) {
    const last = Math.min(end, bytes.length) - text.length;
    for (let i = Math.max(0, start); i <= last; i++) if (asciiAt(bytes, i, text)) return i;
    return -1;
  }

  function findXmiEventChunks(bytes) {
    const chunks = [];
    for (let pos = 0; pos + 8 <= bytes.length; pos++) {
      if (!asciiAt(bytes, pos, "EVNT")) continue;
      const length = be32(bytes, pos + 4);
      const start = pos + 8;
      if (length > 0 && start + length <= bytes.length) {
        chunks.push({ start, end: start + length });
        pos = start + ((length + 1) & ~1) - 1;
      }
    }
    return chunks;
  }

  function detectXmi(input) {
    const bytes = core.asUint8Array(input);
    if (bytes.length < 16 || !asciiAt(bytes, 0, "FORM")) return false;
    const hasContainer = findAscii(bytes, "XMID", 8, Math.min(bytes.length, 128)) >= 0 || findAscii(bytes, "XDIR", 8, Math.min(bytes.length, 128)) >= 0;
    return hasContainer && findXmiEventChunks(bytes).length > 0;
  }

  function convertXmi(input, fileName = "sequence.xmi") {
    const bytes = core.asUint8Array(input);
    const chunks = findXmiEventChunks(bytes);
    if (!detectXmi(bytes) || !chunks.length) throw new Error("XMI EVNT 시퀀스를 찾지 못했습니다.");
    // XMI containers may hold several independent songs. Match the existing console-import policy
    // and import the first playable sequence rather than concatenating unrelated songs.
    const { start, end } = chunks[0];
    const channels = makeChannels();
    const state = { pos: start };
    let tick = 0;
    let eventCount = 0;
    while (state.pos < end && eventCount++ < 1000000) {
      // XMIDI delay is a sum of zero or more bytes below 0x80. A status byte ends the delay.
      while (state.pos < end && bytes[state.pos] < 0x80) tick += bytes[state.pos++];
      if (state.pos >= end) break;
      const status = bytes[state.pos++];
      const command = status & 0xf0;
      const channel = status & 0x0f;
      if (command === 0x90) {
        if (state.pos + 2 > end) break;
        const pitch = bytes[state.pos++];
        const velocity = bytes[state.pos++];
        const duration = Math.max(1, readMidiVlq(bytes, state, end));
        if (velocity > 0) {
          channels[channel].notes.push({ startTick: tick, durationTick: duration, pitch, velocity, channel });
          channels[channel].touched = true;
        }
      } else if (command === 0x80 || command === 0xa0 || command === 0xe0) {
        if (state.pos + 2 > end) break;
        const a = bytes[state.pos++], b = bytes[state.pos++];
        if (command === 0xe0) addPitch(channels, channel, tick, a, b);
      } else if (command === 0xb0) {
        if (state.pos + 2 > end) break;
        addControl(channels, channel, tick, bytes[state.pos++], bytes[state.pos++]);
      } else if (command === 0xc0) {
        if (state.pos >= end) break;
        addProgram(channels, channel, tick, bytes[state.pos++]);
      } else if (command === 0xd0) {
        state.pos++;
      } else if (status === 0xff) {
        if (state.pos >= end) break;
        const type = bytes[state.pos++];
        const length = readMidiVlq(bytes, state, end);
        if (type === 0x2f) break;
        state.pos = Math.min(end, state.pos + length);
      } else if (status === 0xf0 || status === 0xf7) {
        const length = readMidiVlq(bytes, state, end);
        state.pos = Math.min(end, state.pos + length);
      } else if (status === 0xf2) state.pos = Math.min(end, state.pos + 2);
      else if (status === 0xf3) state.pos = Math.min(end, state.pos + 1);
    }
    const tracks = finishTracks(channels);
    if (!tracks.some(track => track.notes.length)) throw new Error("XMI에서 연주 노트를 찾지 못했습니다.");
    // XMIDI timing is 120 intervals/sec. PPQ 60 at 120 BPM maps one XMI interval to one MIDI tick.
    return {
      midiBytes: core.buildMidi({ ppq: 60, title: titleFromName(fileName), tempoEvents: [{ tick: 0, bpm: 120 }], tracks }),
      metadata: { sourceFormat: "XMI", sequenceCount: chunks.length, importedSequence: 1 },
    };
  }

  function detectHmp(input) {
    const bytes = core.asUint8Array(input);
    return bytes.length >= 0x40 && asciiAt(bytes, 0, "HMIMIDIP");
  }

  function parseMidiLikeTrack(bytes, start, end, options, channels, tempoEvents) {
    const state = { pos: start };
    const active = new Map();
    let runningStatus = 0;
    let tick = 0;
    let events = 0;
    const readDelta = options.readDelta;
    const noteHasDuration = Boolean(options.noteHasDuration);
    while (state.pos < end && events++ < 1000000) {
      tick += readDelta(bytes, state, end);
      if (state.pos >= end) break;
      let status = bytes[state.pos++];
      let firstData = null;
      if (status < 0x80) {
        if (!runningStatus) break;
        firstData = status;
        status = runningStatus;
      } else if (status < 0xf0) runningStatus = status;
      else if (status !== 0xf8 && status !== 0xfe) runningStatus = 0;

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = () => firstData == null ? bytes[state.pos++] : (firstData === null ? bytes[state.pos++] : (() => { const value = firstData; firstData = null; return value; })());
      if (command === 0x80 || command === 0x90 || command === 0xa0 || command === 0xb0 || command === 0xe0) {
        if (state.pos > end) break;
        const a = firstData == null ? bytes[state.pos++] : (() => { const v = firstData; firstData = null; return v; })();
        if (state.pos >= end) break;
        const b = bytes[state.pos++];
        if (command === 0x90) {
          if (noteHasDuration) {
            const duration = Math.max(1, readMidiVlq(bytes, state, end));
            if (b > 0) {
              channels[channel].notes.push({ startTick: tick, durationTick: duration, pitch: a, velocity: b, channel });
              channels[channel].touched = true;
            }
          } else {
            const key = `${channel}:${a}`;
            if (b === 0) closeActive(active, channels, key, tick);
            else {
              closeActive(active, channels, key, tick);
              active.set(key, { channel, pitch: a, velocity: b, startTick: tick });
              channels[channel].touched = true;
            }
          }
        } else if (command === 0x80) closeActive(active, channels, `${channel}:${a}`, tick);
        else if (command === 0xb0) addControl(channels, channel, tick, a, b);
        else if (command === 0xe0) addPitch(channels, channel, tick, a, b);
      } else if (command === 0xc0 || command === 0xd0) {
        const a = firstData == null ? bytes[state.pos++] : (() => { const v = firstData; firstData = null; return v; })();
        if (command === 0xc0) addProgram(channels, channel, tick, a);
      } else if (status === 0xff) {
        if (state.pos >= end) break;
        const type = bytes[state.pos++];
        const length = readMidiVlq(bytes, state, end);
        if (state.pos + length > end) break;
        if (type === 0x51 && length === 3) {
          const mpqn = (bytes[state.pos] << 16) | (bytes[state.pos + 1] << 8) | bytes[state.pos + 2];
          if (mpqn > 0) tempoEvents.push({ tick, bpm: 60000000 / mpqn });
        }
        state.pos += length;
        if (type === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        const length = readMidiVlq(bytes, state, end);
        state.pos = Math.min(end, state.pos + length);
      } else if (status === 0xfe && options.handleSpecial) {
        options.handleSpecial(bytes, state, end);
      } else if (status >= 0xf8) {
        // Real-time event, no payload.
      } else {
        break;
      }
    }
    for (const key of Array.from(active.keys())) closeActive(active, channels, key, tick + 1);
    return tick;
  }

  function convertHmp(input, fileName = "sequence.hmp") {
    const bytes = core.asUint8Array(input);
    if (!detectHmp(bytes)) throw new Error("HMP 헤더(HMIMIDIP)를 찾지 못했습니다.");
    const revised = asciiAt(bytes, 8, "013195");
    const trackCount = le32(bytes, 0x30);
    const bpm = clamp(le32(bytes, 0x38), 20, 400, 120);
    let pos = revised ? 0x388 : 0x308;
    if (!trackCount || trackCount > 120 || pos >= bytes.length) throw new Error("HMP 트랙 헤더가 올바르지 않습니다.");
    const channels = makeChannels();
    const tempoEvents = [{ tick: 0, bpm }];
    let parsedTracks = 0;
    for (let index = 0; index < trackCount && pos + 12 <= bytes.length; index++) {
      const chunkSize = le32(bytes, pos + 4);
      if (chunkSize < 12 || pos + chunkSize > bytes.length) break;
      parseMidiLikeTrack(bytes, pos + 12, pos + chunkSize, { readDelta: readHmpDelta, noteHasDuration: false }, channels, tempoEvents);
      parsedTracks++;
      pos += chunkSize;
    }
    const tracks = finishTracks(channels);
    if (!parsedTracks || !tracks.some(track => track.notes.length)) throw new Error("HMP에서 연주 노트를 찾지 못했습니다.");
    return {
      midiBytes: core.buildMidi({ ppq: 60, title: titleFromName(fileName), tempoEvents, tracks }),
      metadata: { sourceFormat: revised ? "HMP 013195" : "HMP", trackCount: parsedTracks },
    };
  }

  function detectHmi(input) {
    const bytes = core.asUint8Array(input);
    return bytes.length >= 32 && asciiAt(bytes, 0, "HMI-MIDISONG061595");
  }

  function findHmiTracks(bytes) {
    const marker = "HMI-MIDITRACK";
    const offsets = [];
    for (let pos = 0; pos + marker.length <= bytes.length;) {
      const found = findAscii(bytes, marker, pos);
      if (found < 0) break;
      offsets.push(found);
      pos = found + marker.length;
      if (offsets.length >= 120) break;
    }
    return offsets;
  }

  function convertHmi(input, fileName = "sequence.hmi") {
    const bytes = core.asUint8Array(input);
    if (!detectHmi(bytes)) throw new Error("HMI 헤더(HMI-MIDISONG061595)를 찾지 못했습니다.");
    const offsets = findHmiTracks(bytes);
    if (!offsets.length) throw new Error("HMI 트랙을 찾지 못했습니다.");
    const channels = makeChannels();
    // The common HMI revision runs its event clock at about 120 ticks/sec.
    // This PPQ/tempo pair preserves that wall-clock rate while keeping the original tick values.
    const hmiMpqn = 0x187fff;
    const tempoEvents = [{ tick: 0, bpm: 60000000 / hmiMpqn }];
    let parsedTracks = 0;
    for (let i = 0; i < offsets.length; i++) {
      const trackStart = offsets[i];
      if (trackStart + 0x58 > bytes.length) continue;
      const headerSize = bytes[trackStart + 0x57];
      const start = trackStart + headerSize;
      const end = i + 1 < offsets.length ? offsets[i + 1] : bytes.length;
      if (start <= trackStart || start >= end) continue;
      parseMidiLikeTrack(bytes, start, end, {
        readDelta: (data, state, limit) => readMidiVlq(data, state, limit),
        noteHasDuration: true,
        handleSpecial(data, state, limit) {
          if (state.pos >= limit) return;
          const subtype = data[state.pos++];
          // HMI embeds non-MIDI branch/callback records behind FE. They carry no note data;
          // skip their documented fixed/length-prefixed payloads so the following MIDI events stay aligned.
          if (subtype === 0x10) {
            if (state.pos + 4 > limit) { state.pos = limit; return; }
            const extra = data[state.pos + 3];
            state.pos = Math.min(limit, state.pos + 8 + extra);
          } else if (subtype === 0x14) state.pos = Math.min(limit, state.pos + 3);
          else if (subtype === 0x15) state.pos = Math.min(limit, state.pos + 7);
          else state.pos = Math.min(limit, state.pos + 1);
        },
      }, channels, tempoEvents);
      parsedTracks++;
    }
    const tracks = finishTracks(channels);
    if (!tracks.some(track => track.notes.length)) throw new Error("HMI에서 연주 노트를 찾지 못했습니다.");
    return {
      midiBytes: core.buildMidi({ ppq: 192, title: titleFromName(fileName), tempoEvents, tracks }),
      metadata: { sourceFormat: "HMI", trackCount: parsedTracks },
    };
  }

  root.MabiLegacyPcSequence = Object.freeze({
    detectXmi,
    detectHmp,
    detectHmi,
    convertXmi,
    convertHmp,
    convertHmi,
  });
})();
