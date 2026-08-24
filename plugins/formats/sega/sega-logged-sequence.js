(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  const utils = root.MabiUtils;
  if (!core) throw new Error("music-format-core.js must be loaded before sega-logged-sequence.js");

  const clamp = (value, min, max, fallback = min) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const clampInt = (value, min, max, fallback = min) => Math.round(clamp(value, min, max, fallback));
  const le16 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  const le32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const asciiAt = (bytes, offset, text) => {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  };
  const titleFromName = (fileName, fallback = "Chip Log") => String(fileName || fallback).replace(/\.[^.]+$/, "");
  const clockValue = value => (Number(value) >>> 0) & 0x3fffffff;

  function midiNoteFromHz(hz) {
    if (!(hz > 0) || !Number.isFinite(hz)) return null;
    return clampInt(69 + 12 * Math.log2(hz / 440), 0, 127, 60);
  }

  const MELODIC_CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);
  function makeChannelAllocator() {
    let index = 0;
    return () => {
      const channel = MELODIC_CHANNELS[index % MELODIC_CHANNELS.length];
      index++;
      return channel;
    };
  }

  function makeTrack(name, channel, program = 80) {
    return {
      name,
      channel,
      program,
      notes: [],
      controlChanges: [],
      pitchBends: [],
      touched: false,
      active: null,
    };
  }

  function closeTrack(track, tick) {
    if (!track?.active) return;
    const active = track.active;
    track.notes.push({
      startTick: active.tick,
      endTick: Math.max(active.tick + 1, Math.round(tick)),
      pitch: active.pitch,
      velocity: active.velocity,
      channel: track.channel,
    });
    track.touched = true;
    track.active = null;
  }

  function startTrack(track, tick, pitch, velocity = 96) {
    if (!track || pitch == null) return;
    closeTrack(track, tick);
    track.active = {
      tick: Math.max(0, Math.round(tick)),
      pitch: clampInt(pitch, 0, 127, 60),
      velocity: clampInt(velocity, 1, 127, 96),
    };
    track.touched = true;
  }

  function refreshTrack(track, tick, pitch, velocity = 96, enabled = true) {
    if (!track) return;
    if (!enabled || pitch == null) {
      closeTrack(track, tick);
      return;
    }
    const roundedPitch = clampInt(pitch, 0, 127, 60);
    const roundedVelocity = clampInt(velocity, 1, 127, 96);
    if (!track.active) {
      startTrack(track, tick, roundedPitch, roundedVelocity);
      return;
    }
    if (track.active.pitch !== roundedPitch || Math.abs(track.active.velocity - roundedVelocity) >= 8) {
      startTrack(track, tick, roundedPitch, roundedVelocity);
    }
  }

  function finishDecoder(decoder, tick) {
    if (!decoder) return;
    if (typeof decoder.finish === "function") decoder.finish(tick);
    for (const track of decoder.tracks || []) closeTrack(track, tick + 1);
  }

  function collectTracks(decoders) {
    const tracks = [];
    for (const decoder of decoders) {
      for (const track of decoder?.tracks || []) {
        if (track.touched && track.notes.length) {
          const { active, touched, ...cleanTrack } = track;
          tracks.push(cleanTrack);
        }
      }
    }
    return tracks;
  }

  function finishConversion({ decoders, tick, fileName, sourceFormat, ppq, bpm = 120, metadata = {} }) {
    for (const decoder of decoders) finishDecoder(decoder, tick);
    const tracks = collectTracks(decoders);
    if (!tracks.length) throw new Error(`${sourceFormat}에서 복원 가능한 FM/PSG 연주 노트를 찾지 못했습니다.`);
    return {
      midiBytes: core.buildMidi({
        ppq,
        title: titleFromName(fileName, sourceFormat),
        tempoEvents: [{ tick: 0, bpm }],
        tracks,
      }),
      metadata: {
        sourceFormat,
        approximation: "chip register frequency/key-on to MIDI note",
        trackCount: tracks.length,
        ...metadata,
      },
    };
  }

  function createSn76489(clock, name, allocateChannel) {
    const tracks = Array.from({ length: 3 }, (_, i) => makeTrack(`${name} Tone ${i + 1}`, allocateChannel(), 80));
    const tone = new Uint16Array(4);
    const volume = new Uint8Array([15, 15, 15, 15]);
    let latchChannel = 0;
    let latchVolume = false;

    function pitch(channel) {
      const period = tone[channel];
      return period > 0 ? midiNoteFromHz(clock / (32 * period)) : null;
    }
    function refresh(channel, tick) {
      if (channel < 0 || channel >= 3) return;
      const attenuation = volume[channel];
      const velocity = clampInt(((15 - attenuation) / 15) * 127, 1, 127, 96);
      refreshTrack(tracks[channel], tick, pitch(channel), velocity, attenuation < 15);
    }
    function writeRaw(value, tick) {
      value &= 0xff;
      if (value & 0x80) {
        const channel = (value >> 5) & 0x03;
        const isVolume = Boolean(value & 0x10);
        latchChannel = channel;
        latchVolume = isVolume;
        if (isVolume) volume[channel] = value & 0x0f;
        else if (channel < 3) tone[channel] = (tone[channel] & 0x3f0) | (value & 0x0f);
        refresh(channel, tick);
      } else {
        const channel = latchChannel;
        if (latchVolume) volume[channel] = value & 0x0f;
        else if (channel < 3) tone[channel] = (tone[channel] & 0x00f) | ((value & 0x3f) << 4);
        refresh(channel, tick);
      }
    }
    return { name, tracks, writeRaw };
  }

  function createAy(clock, name, allocateChannel, divider = 16) {
    const tracks = Array.from({ length: 3 }, (_, i) => makeTrack(`${name} PSG ${i + 1}`, allocateChannel(), 80));
    const regs = new Uint8Array(16);

    function refresh(channel, tick) {
      if (channel < 0 || channel >= 3) return;
      const period = ((regs[channel * 2 + 1] & 0x0f) << 8) | regs[channel * 2];
      const mixer = regs[7];
      const toneEnabled = (mixer & (1 << channel)) === 0;
      const volumeReg = regs[8 + channel];
      const envelope = Boolean(volumeReg & 0x10);
      const level = volumeReg & 0x0f;
      const enabled = toneEnabled && period > 0 && (envelope || level > 0);
      const hz = period > 0 ? clock / (divider * period) : 0;
      const velocity = envelope ? 96 : clampInt((level / 15) * 127, 1, 127, 96);
      refreshTrack(tracks[channel], tick, midiNoteFromHz(hz), velocity, enabled);
    }

    function write(reg, value, tick) {
      reg &= 0x0f;
      regs[reg] = value & 0xff;
      if (reg <= 5) refresh(Math.floor(reg / 2), tick);
      else if (reg === 7) for (let channel = 0; channel < 3; channel++) refresh(channel, tick);
      else if (reg >= 8 && reg <= 10) refresh(reg - 8, tick);
    }
    return { name, tracks, write };
  }

  function createOpn({ clock, name, channels = 6, hasSsg = false, ssgDivider = 64 }, allocateChannel) {
    const fmTracks = Array.from({ length: channels }, (_, i) => makeTrack(`${name} FM ${i + 1}`, allocateChannel(), 81));
    const frequency = new Uint16Array(channels);
    const ssg = hasSsg ? createAy(clock, `${name}`, allocateChannel, ssgDivider) : null;
    const tracks = ssg ? [...fmTracks, ...ssg.tracks] : fmTracks;

    function pitch(channel) {
      const raw = frequency[channel];
      const fnum = raw & 0x07ff;
      const block = (raw >> 11) & 0x07;
      if (!fnum) return null;
      const hz = (fnum * clock * Math.pow(2, block)) / (144 * Math.pow(2, 21));
      return midiNoteFromHz(hz);
    }
    function channelFromKey(value) {
      const low = value & 0x03;
      if (low === 3) return -1;
      return low + ((value & 0x04) ? 3 : 0);
    }
    function write(port, reg, value, tick) {
      port &= 1;
      reg &= 0xff;
      value &= 0xff;
      if (ssg && port === 0 && reg <= 0x0d) ssg.write(reg, value, tick);
      if (reg >= 0xa0 && reg <= 0xa2) {
        const channel = (port ? 3 : 0) + (reg - 0xa0);
        if (channel < channels) {
          frequency[channel] = (frequency[channel] & 0x3f00) | value;
          if (fmTracks[channel].active) refreshTrack(fmTracks[channel], tick, pitch(channel), fmTracks[channel].active.velocity, true);
        }
      } else if (reg >= 0xa4 && reg <= 0xa6) {
        const channel = (port ? 3 : 0) + (reg - 0xa4);
        if (channel < channels) {
          frequency[channel] = (frequency[channel] & 0x00ff) | ((value & 0x3f) << 8);
          if (fmTracks[channel].active) refreshTrack(fmTracks[channel], tick, pitch(channel), fmTracks[channel].active.velocity, true);
        }
      } else if (port === 0 && reg === 0x28) {
        const channel = channelFromKey(value);
        if (channel >= 0 && channel < channels) {
          if (value & 0xf0) startTrack(fmTracks[channel], tick, pitch(channel), 96);
          else closeTrack(fmTracks[channel], tick);
        }
      }
    }
    return { name, tracks, write };
  }

  const OPM_NOTE_INDEX = Object.freeze({ 0: 0, 1: 1, 2: 2, 4: 3, 5: 4, 6: 5, 8: 6, 9: 7, 10: 8, 12: 9, 13: 10, 14: 11 });
  function createOpm(clock, name, allocateChannel) {
    const tracks = Array.from({ length: 8 }, (_, i) => makeTrack(`${name} FM ${i + 1}`, allocateChannel(), 81));
    const kc = new Uint8Array(8);
    const kf = new Uint8Array(8);

    function pitch(channel) {
      const value = kc[channel];
      const octave = (value >> 4) & 0x07;
      const noteIndex = OPM_NOTE_INDEX[value & 0x0f];
      if (noteIndex == null) return null;
      const fraction = ((kf[channel] >> 2) & 0x3f) / 64;
      const clockOffset = 12 * Math.log2(clock / 3579545);
      return clampInt(13 + octave * 12 + noteIndex + fraction + clockOffset, 0, 127, 60);
    }
    function write(_port, reg, value, tick) {
      reg &= 0xff;
      value &= 0xff;
      if (reg >= 0x28 && reg <= 0x2f) {
        const channel = reg - 0x28;
        kc[channel] = value;
        if (tracks[channel].active) refreshTrack(tracks[channel], tick, pitch(channel), tracks[channel].active.velocity, true);
      } else if (reg >= 0x30 && reg <= 0x37) {
        const channel = reg - 0x30;
        kf[channel] = value;
        if (tracks[channel].active) refreshTrack(tracks[channel], tick, pitch(channel), tracks[channel].active.velocity, true);
      } else if (reg === 0x08) {
        const channel = value & 0x07;
        if (value & 0x78) startTrack(tracks[channel], tick, pitch(channel), 96);
        else closeTrack(tracks[channel], tick);
      }
    }
    return { name, tracks, write };
  }

  function createOpll(clock, name, allocateChannel) {
    const tracks = Array.from({ length: 9 }, (_, i) => makeTrack(`${name} FM ${i + 1}`, allocateChannel(), 81));
    const fnumLow = new Uint8Array(9);
    const control = new Uint8Array(9);
    const attenuation = new Uint8Array(9);

    function pitch(channel) {
      const fnum = fnumLow[channel] | ((control[channel] & 1) << 8);
      const block = (control[channel] >> 1) & 0x07;
      if (!fnum) return null;
      const hz = (fnum * clock * Math.pow(2, block)) / (72 * Math.pow(2, 19));
      return midiNoteFromHz(hz);
    }
    function refresh(channel, tick, keyTransition = false) {
      const keyOn = Boolean(control[channel] & 0x10);
      const velocity = clampInt(((15 - attenuation[channel]) / 15) * 127, 1, 127, 96);
      if (!keyOn) closeTrack(tracks[channel], tick);
      else if (keyTransition || !tracks[channel].active) startTrack(tracks[channel], tick, pitch(channel), velocity);
      else refreshTrack(tracks[channel], tick, pitch(channel), velocity, true);
    }
    function write(_port, reg, value, tick) {
      reg &= 0xff;
      value &= 0xff;
      if (reg >= 0x10 && reg <= 0x18) {
        const channel = reg - 0x10;
        fnumLow[channel] = value;
        refresh(channel, tick, false);
      } else if (reg >= 0x20 && reg <= 0x28) {
        const channel = reg - 0x20;
        const wasOn = Boolean(control[channel] & 0x10);
        control[channel] = value;
        refresh(channel, tick, !wasOn && Boolean(value & 0x10));
      } else if (reg >= 0x30 && reg <= 0x38) {
        const channel = reg - 0x30;
        attenuation[channel] = value & 0x0f;
        refresh(channel, tick, false);
      }
    }
    return { name, tracks, write };
  }

  function createOpl(clock, name, allocateChannel, channels = 9, opl3 = false) {
    const tracks = Array.from({ length: channels }, (_, i) => makeTrack(`${name} FM ${i + 1}`, allocateChannel(), 81));
    const fnumLow = new Uint8Array(channels);
    const control = new Uint8Array(channels);

    function pitch(channel) {
      const fnum = fnumLow[channel] | ((control[channel] & 0x03) << 8);
      const block = (control[channel] >> 2) & 0x07;
      if (!fnum) return null;
      const divider = opl3 ? 288 : 72;
      const hz = (fnum * clock * Math.pow(2, block)) / (divider * Math.pow(2, 20));
      return midiNoteFromHz(hz);
    }
    function refresh(channel, tick, keyTransition = false) {
      const keyOn = Boolean(control[channel] & 0x20);
      if (!keyOn) closeTrack(tracks[channel], tick);
      else if (keyTransition || !tracks[channel].active) startTrack(tracks[channel], tick, pitch(channel), 96);
      else refreshTrack(tracks[channel], tick, pitch(channel), tracks[channel].active.velocity, true);
    }
    function write(port, reg, value, tick) {
      port &= 1;
      reg &= 0xff;
      value &= 0xff;
      const base = opl3 ? port * 9 : 0;
      if (reg >= 0xa0 && reg <= 0xa8) {
        const channel = base + (reg - 0xa0);
        if (channel < channels) {
          fnumLow[channel] = value;
          refresh(channel, tick, false);
        }
      } else if (reg >= 0xb0 && reg <= 0xb8) {
        const channel = base + (reg - 0xb0);
        if (channel < channels) {
          const wasOn = Boolean(control[channel] & 0x20);
          control[channel] = value;
          refresh(channel, tick, !wasOn && Boolean(value & 0x20));
        }
      }
    }
    return { name, tracks, write };
  }

  const CHIP_DEFAULT_CLOCK = Object.freeze({
    sn76489: 3579545,
    ym2413: 3579545,
    ym2612: 7670454,
    ym2151: 3579545,
    ym2203: 3993600,
    ym2608: 7987200,
    ym2610: 8000000,
    ym3526: 3579545,
    ym3812: 3579545,
    ymf262: 14318180,
    ay8910: 1789773,
  });

  function createChipDecoder(type, clock, name, allocateChannel) {
    const effectiveClock = clock > 0 ? clock : CHIP_DEFAULT_CLOCK[type];
    switch (type) {
      case "sn76489": return createSn76489(effectiveClock, name || "SN76489", allocateChannel);
      case "ay8910": return createAy(effectiveClock, name || "AY-3-8910", allocateChannel, 16);
      case "ym2203": return createOpn({ clock: effectiveClock, name: name || "YM2203", channels: 3, hasSsg: true, ssgDivider: 64 }, allocateChannel);
      case "ym2612": return createOpn({ clock: effectiveClock, name: name || "YM2612", channels: 6, hasSsg: false }, allocateChannel);
      case "ym2608": return createOpn({ clock: effectiveClock, name: name || "YM2608", channels: 6, hasSsg: true, ssgDivider: 64 }, allocateChannel);
      case "ym2610": return createOpn({ clock: effectiveClock, name: name || "YM2610", channels: 6, hasSsg: true, ssgDivider: 64 }, allocateChannel);
      case "ym2151": return createOpm(effectiveClock, name || "YM2151", allocateChannel);
      case "ym2413": return createOpll(effectiveClock, name || "YM2413", allocateChannel);
      case "ym3526": return createOpl(effectiveClock, name || "YM3526", allocateChannel, 9, false);
      case "ym3812": return createOpl(effectiveClock, name || "YM3812", allocateChannel, 9, false);
      case "ymf262": return createOpl(effectiveClock, name || "YMF262", allocateChannel, 18, true);
      default: return null;
    }
  }

  function maybeGunzip(input) {
    const bytes = core.asUint8Array(input);
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (utils?.gunzip) return utils.gunzip(bytes);
      if (root.pako?.ungzip) return new Uint8Array(root.pako.ungzip(bytes));
      throw new Error("VGZ 압축을 해제할 pako 모듈을 불러오지 못했습니다.");
    }
    return bytes;
  }

  function detectVgm(input) {
    try {
      const bytes = maybeGunzip(input);
      return bytes.length >= 0x40 && asciiAt(bytes, 0, "Vgm ");
    } catch (_error) {
      return false;
    }
  }

  const VGM_CLOCK_OFFSETS = Object.freeze({
    sn76489: 0x0c,
    ym2413: 0x10,
    ym2612: 0x2c,
    ym2151: 0x30,
    ym2203: 0x44,
    ym2608: 0x48,
    ym2610: 0x4c,
    ym3812: 0x50,
    ym3526: 0x54,
    ymf262: 0x5c,
    ay8910: 0x74,
  });

  function vgmVersionText(version) {
    const hex = version.toString(16).padStart(3, "0");
    return `${parseInt(hex[0], 16)}.${hex.slice(1)}`;
  }

  function convertVgm(input, fileName = "music.vgm") {
    const bytes = maybeGunzip(input);
    if (bytes.length < 0x40 || !asciiAt(bytes, 0, "Vgm ")) throw new Error("VGM 헤더를 찾지 못했습니다.");
    const version = le32(bytes, 0x08);
    const dataOffsetField = version >= 0x150 && bytes.length >= 0x38 ? le32(bytes, 0x34) : 0;
    const dataStart = version >= 0x150 ? (dataOffsetField ? 0x34 + dataOffsetField : 0x40) : 0x40;
    if (dataStart < 0x40 || dataStart >= bytes.length) throw new Error("VGM 데이터 시작 위치가 파일 범위를 벗어납니다.");

    const clocks = {};
    const headerEnd = Math.min(bytes.length, dataStart);
    for (const [type, offset] of Object.entries(VGM_CLOCK_OFFSETS)) {
      clocks[type] = offset + 4 <= headerEnd ? clockValue(le32(bytes, offset)) : 0;
    }
    if (version <= 0x101 && clocks.ym2413) {
      const legacyClock = clocks.ym2413;
      clocks.ym2413 = 0;
      if (legacyClock > 5000000 && !clocks.ym2612) clocks.ym2612 = legacyClock;
      else if (!clocks.ym2151) clocks.ym2151 = legacyClock;
    }

    const allocateChannel = makeChannelAllocator();
    const decoderMap = new Map();
    const decodedChips = [];
    function getDecoder(type, instance = 0) {
      const key = `${type}:${instance}`;
      if (decoderMap.has(key)) return decoderMap.get(key);
      const baseClock = clocks[type] || CHIP_DEFAULT_CLOCK[type];
      const decoder = createChipDecoder(type, baseClock, `${type.toUpperCase()}${instance ? ` #${instance + 1}` : ""}`, allocateChannel);
      if (decoder) {
        decoderMap.set(key, decoder);
        decodedChips.push(`${type.toUpperCase()}${instance ? ` #${instance + 1}` : ""}`);
      }
      return decoder;
    }
    function writeYmCommand(command, instance, reg, value, tick) {
      const mapping = {
        0x51: ["ym2413", 0],
        0x52: ["ym2612", 0],
        0x53: ["ym2612", 1],
        0x54: ["ym2151", 0],
        0x55: ["ym2203", 0],
        0x56: ["ym2608", 0],
        0x57: ["ym2608", 1],
        0x58: ["ym2610", 0],
        0x59: ["ym2610", 1],
        0x5a: ["ym3812", 0],
        0x5b: ["ym3526", 0],
        0x5e: ["ymf262", 0],
        0x5f: ["ymf262", 1],
      };
      const entry = mapping[command];
      if (!entry) return;
      const decoder = getDecoder(entry[0], instance);
      decoder?.write(entry[1], reg, value, tick);
    }

    let pos = dataStart;
    let tick = 0;
    let wait62 = 735;
    let wait63 = 882;
    let commands = 0;
    const maxCommands = 5000000;
    while (pos < bytes.length && commands++ < maxCommands) {
      const command = bytes[pos++];
      if (command === 0x66) break;
      if (command === 0x30) {
        if (pos >= bytes.length) break;
        getDecoder("sn76489", 1)?.writeRaw(bytes[pos++], tick);
      } else if (command === 0x4f) {
        pos = Math.min(bytes.length, pos + 1);
      } else if (command === 0x50) {
        if (pos >= bytes.length) break;
        getDecoder("sn76489", 0)?.writeRaw(bytes[pos++], tick);
      } else if (command >= 0x51 && command <= 0x5f) {
        if (pos + 1 >= bytes.length) break;
        const reg = bytes[pos++], value = bytes[pos++];
        writeYmCommand(command, 0, reg, value, tick);
      } else if (command === 0x61) {
        if (pos + 1 >= bytes.length) break;
        tick += le16(bytes, pos);
        pos += 2;
      } else if (command === 0x62) {
        tick += wait62;
      } else if (command === 0x63) {
        tick += wait63;
      } else if (command === 0x64) {
        if (pos + 2 >= bytes.length) break;
        const target = bytes[pos++];
        const length = le16(bytes, pos);
        pos += 2;
        if (target === 0x62) wait62 = length;
        else if (target === 0x63) wait63 = length;
      } else if (command === 0x67) {
        if (pos + 6 > bytes.length || bytes[pos] !== 0x66) break;
        pos += 2; // 0x66 compatibility byte + data type
        const size = le32(bytes, pos);
        pos += 4;
        pos = Math.min(bytes.length, pos + (size & 0x7fffffff));
      } else if (command === 0x68) {
        pos = Math.min(bytes.length, pos + 11);
      } else if (command >= 0x70 && command <= 0x7f) {
        tick += (command & 0x0f) + 1;
      } else if (command >= 0x80 && command <= 0x8f) {
        tick += command & 0x0f;
      } else if (command === 0x90 || command === 0x91 || command === 0x95) {
        pos = Math.min(bytes.length, pos + 4);
      } else if (command === 0x92) {
        pos = Math.min(bytes.length, pos + 5);
      } else if (command === 0x93) {
        pos = Math.min(bytes.length, pos + 10);
      } else if (command === 0x94) {
        pos = Math.min(bytes.length, pos + 1);
      } else if (command === 0xa0) {
        if (pos + 1 >= bytes.length) break;
        let reg = bytes[pos++], value = bytes[pos++];
        const instance = reg & 0x80 ? 1 : 0;
        reg &= 0x7f;
        getDecoder("ay8910", instance)?.write(reg, value, tick);
      } else if (command >= 0xa1 && command <= 0xaf) {
        if (pos + 1 >= bytes.length) break;
        const reg = bytes[pos++], value = bytes[pos++];
        writeYmCommand(command - 0x50, 1, reg, value, tick);
      } else if (command >= 0xb0 && command <= 0xbf) {
        pos = Math.min(bytes.length, pos + 2);
      } else if (command >= 0xc0 && command <= 0xdf) {
        pos = Math.min(bytes.length, pos + 3);
      } else if (command >= 0xe0) {
        pos = Math.min(bytes.length, pos + 4);
      } else if (command >= 0x40 && command <= 0x4e) {
        pos = Math.min(bytes.length, pos + 2);
      } else if (command >= 0x31 && command <= 0x3f) {
        pos = Math.min(bytes.length, pos + 1);
      } else {
        // Unknown legacy/reserved command. Stop instead of losing byte alignment.
        break;
      }
    }
    if (commands >= maxCommands) throw new Error("VGM 명령 수가 비정상적으로 많아 변환을 중단했습니다.");

    return finishConversion({
      decoders: Array.from(decoderMap.values()),
      tick,
      fileName,
      sourceFormat: `VGM ${vgmVersionText(version)}`,
      ppq: 22050,
      bpm: 120,
      metadata: {
        sampleRate: 44100,
        decodedChips,
        compressed: core.asUint8Array(input)[0] === 0x1f && core.asUint8Array(input)[1] === 0x8b,
        note: "PCM/DAC, noise/rhythm mode and chip-specific modulation are not converted to pitched MIDI notes.",
      },
    });
  }

  function detectGym(input, fileName = "") {
    const bytes = core.asUint8Array(input);
    if (bytes.length >= 4 && asciiAt(bytes, 0, "GYMX")) return true;
    if (/\.gym$/i.test(String(fileName || ""))) return bytes.length > 0;
    return false;
  }

  function gymPalFromName(fileName) {
    return /(?:^|[\s._-])(?:pal|50hz|europe)(?:[\s._-]|$)/i.test(String(fileName || ""));
  }

  function convertGym(input, fileName = "music.gym") {
    let bytes = core.asUint8Array(input);
    let dataStart = 0;
    let compressed = false;
    const hasHeader = bytes.length >= 428 && asciiAt(bytes, 0, "GYMX");
    if (hasHeader) {
      dataStart = 428;
      const packedSize = le32(bytes, 424);
      if (packedSize) {
        const packedEnd = Math.min(bytes.length, dataStart + packedSize);
        const packed = bytes.subarray(dataStart, packedEnd);
        if (utils?.inflate) bytes = utils.inflate(packed);
        else if (root.pako?.inflate) bytes = new Uint8Array(root.pako.inflate(packed));
        else throw new Error("압축 GYM을 해제할 pako 모듈을 불러오지 못했습니다.");
        dataStart = 0;
        compressed = true;
      }
    }

    const pal = gymPalFromName(fileName);
    const frameRate = pal ? 50 : 60;
    const allocateChannel = makeChannelAllocator();
    const ym = createChipDecoder("ym2612", pal ? 7600489 : 7670454, "Mega Drive YM2612", allocateChannel);
    const psg = createChipDecoder("sn76489", pal ? 3546893 : 3579545, "Mega Drive SN76489", allocateChannel);
    let pos = dataStart;
    let tick = 0;
    let commands = 0;
    while (pos < bytes.length && commands++ < 5000000) {
      const command = bytes[pos++];
      if (command === 0x00) {
        tick += 2;
      } else if (command === 0x01 || command === 0x02) {
        if (pos + 1 >= bytes.length) break;
        const reg = bytes[pos++], value = bytes[pos++];
        ym.write(command === 0x02 ? 1 : 0, reg, value, tick);
      } else if (command === 0x03) {
        if (pos >= bytes.length) break;
        psg.writeRaw(bytes[pos++], tick);
      } else {
        throw new Error(`GYM 데이터에서 알 수 없는 명령 0x${command.toString(16).padStart(2, "0")}을 찾았습니다.`);
      }
    }

    return finishConversion({
      decoders: [ym, psg],
      tick,
      fileName,
      sourceFormat: "Mega Drive GYM",
      ppq: frameRate,
      bpm: 120,
      metadata: {
        frameRate,
        palInferredFromFileName: pal,
        header: hasHeader,
        compressed,
        note: "PCM/DAC and PSG noise are omitted because they do not contain stable pitched-note information.",
      },
    });
  }

  const S98_DEVICE_TYPES = Object.freeze({
    1: { key: "ym2149", label: "YM2149", decoder: "ay8910", divider: 16 },
    2: { key: "ym2203", label: "YM2203", decoder: "ym2203" },
    3: { key: "ym2612", label: "YM2612", decoder: "ym2612" },
    4: { key: "ym2608", label: "YM2608", decoder: "ym2608" },
    5: { key: "ym2151", label: "YM2151", decoder: "ym2151" },
    6: { key: "ym2413", label: "YM2413", decoder: "ym2413" },
    7: { key: "ym3526", label: "YM3526", decoder: "ym3526" },
    8: { key: "ym3812", label: "YM3812", decoder: "ym3812" },
    9: { key: "ymf262", label: "YMF262", decoder: "ymf262" },
    15: { key: "ay8910", label: "AY-3-8910", decoder: "ay8910", divider: 16 },
    16: { key: "sn76489", label: "SN76489", decoder: "sn76489" },
  });

  function detectS98(input) {
    const bytes = core.asUint8Array(input);
    return bytes.length >= 0x1c && asciiAt(bytes, 0, "S98") && bytes[3] >= 0x30 && bytes[3] <= 0x33;
  }

  function parseS98Devices(bytes, version) {
    if (version >= 3) {
      const count = Math.min(64, le32(bytes, 0x1c));
      if (!count) return [{ type: 4, clock: 7987200, pan: 0 }];
      if (0x20 + count * 16 > bytes.length) throw new Error("S98 장치 정보가 파일 끝에서 잘렸습니다.");
      const devices = [];
      for (let i = 0; i < count; i++) {
        const offset = 0x20 + i * 16;
        devices.push({ type: le32(bytes, offset), clock: le32(bytes, offset + 4), pan: le32(bytes, offset + 8) });
      }
      return devices;
    }
    if (version === 2) {
      const devices = [];
      for (let offset = 0x20; offset + 16 <= bytes.length && devices.length < 64; offset += 16) {
        const type = le32(bytes, offset);
        if (!type) break;
        devices.push({ type, clock: le32(bytes, offset + 4), pan: 0 });
      }
      return devices.length ? devices : [{ type: 4, clock: 7987200, pan: 0 }];
    }
    return [{ type: 4, clock: 7987200, pan: 0 }];
  }

  function convertS98(input, fileName = "music.s98") {
    let bytes = core.asUint8Array(input);
    if (!detectS98(bytes)) throw new Error("S98 헤더를 찾지 못했습니다.");
    const version = bytes[3] - 0x30;
    const numerator = le32(bytes, 0x04) || 10;
    const denominator = le32(bytes, 0x08) || 1000;
    if (!(numerator > 0 && denominator > 0)) throw new Error("S98 sync 시간 정보가 올바르지 않습니다.");
    let dataStart = le32(bytes, 0x14);
    if (!dataStart || dataStart >= bytes.length) throw new Error("S98 dump data 시작 위치가 파일 범위를 벗어납니다.");

    const compressedSize = le32(bytes, 0x0c);
    if (version <= 2 && compressedSize) {
      const compressedOffset = version === 2 && le32(bytes, 0x1c) ? le32(bytes, 0x1c) : dataStart;
      if (compressedOffset >= bytes.length) throw new Error("S98 압축 데이터 위치가 파일 범위를 벗어납니다.");
      // In S98 v1/v2 the header stores the Inflate output size, not the compressed byte count.
      // The compressed stream itself begins at compressedOffset and runs to the end of the stored stream.
      const packed = bytes.subarray(compressedOffset);
      if (utils?.inflate) bytes = utils.inflate(packed);
      else if (root.pako?.inflate) bytes = new Uint8Array(root.pako.inflate(packed));
      else throw new Error("압축 S98을 해제할 pako 모듈을 불러오지 못했습니다.");
      dataStart = 0;
    } else if (version >= 3 && compressedSize) {
      throw new Error("S98 v3의 COMPRESSING 필드는 0이어야 합니다.");
    }

    const devices = parseS98Devices(core.asUint8Array(input), version);
    const allocateChannel = makeChannelAllocator();
    const decoders = devices.map((device, index) => {
      const info = S98_DEVICE_TYPES[device.type];
      if (!info) return null;
      const clock = device.clock || (info.decoder === "ym2608" ? 7987200 : CHIP_DEFAULT_CLOCK[info.decoder]);
      if (device.type === 1) return createAy(clock, `${info.label} #${index + 1}`, allocateChannel, 16);
      return createChipDecoder(info.decoder, clock, `${info.label} #${index + 1}`, allocateChannel);
    });
    const decodedDevices = devices.map((device, index) => {
      const info = S98_DEVICE_TYPES[device.type];
      return info ? `${info.label} #${index + 1}` : `Unsupported device ${device.type} #${index + 1}`;
    });

    // MIDI uses a 120 BPM timeline here: ppq 12000 -> 24000 ticks/sec.
    const ppq = 12000;
    const ticksPerSecond = ppq * 2;
    const ticksPerSync = (numerator / denominator) * ticksPerSecond;
    let tickFloat = 0;
    let pos = dataStart;
    let commands = 0;
    const maxCommands = 5000000;

    while (pos < bytes.length && commands++ < maxCommands) {
      const command = bytes[pos++];
      if (command === 0xfd) break;
      if (command === 0xff) {
        tickFloat += ticksPerSync;
        continue;
      }
      if (command === 0xfe) {
        let value = 0;
        let shift = 0;
        let part = 0;
        do {
          if (pos >= bytes.length || shift > 28) throw new Error("S98 nSYNC 가변 길이 값이 잘렸습니다.");
          part = bytes[pos++];
          value |= (part & 0x7f) << shift;
          shift += 7;
        } while (part & 0x80);
        tickFloat += (value + 2) * ticksPerSync;
        continue;
      }
      if (command >= 0x80) throw new Error(`S98 예약 명령 0x${command.toString(16)}을 만나 변환을 중단했습니다.`);
      if (pos + 1 >= bytes.length) break;
      const deviceIndex = command >> 1;
      const port = command & 1;
      const reg = bytes[pos++];
      const value = bytes[pos++];
      const decoder = decoders[deviceIndex];
      if (!decoder) continue;
      const tick = Math.max(0, Math.round(tickFloat));
      const deviceInfo = devices[deviceIndex];
      if (deviceInfo?.type === 16) {
        if (port === 0 && reg === 0 && decoder.writeRaw) decoder.writeRaw(value, tick);
      } else if (decoder.write) {
        decoder.write(port, reg, value, tick);
      }
    }
    if (commands >= maxCommands) throw new Error("S98 명령 수가 비정상적으로 많아 변환을 중단했습니다.");

    return finishConversion({
      decoders: decoders.filter(Boolean),
      tick: Math.max(0, Math.round(tickFloat)),
      fileName,
      sourceFormat: `S98 v${version}`,
      ppq,
      bpm: 120,
      metadata: {
        version,
        syncNumerator: numerator,
        syncDenominator: denominator,
        decodedDevices,
        compressed: Boolean(version <= 2 && compressedSize),
        note: "FM/PSG pitched channels are reconstructed; rhythm/ADPCM/noise and chip-specific effects are simplified or omitted.",
      },
    });
  }

  root.MabiSegaLoggedSequence = Object.freeze({
    detectVgm,
    convertVgm,
    detectGym,
    convertGym,
    detectS98,
    convertS98,
  });
})();
