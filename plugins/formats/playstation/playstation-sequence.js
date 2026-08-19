(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  const consoleGm = root.MabiConsoleGM;
  if (!core) throw new Error("music-format-core.js must be loaded before playstation-sequence.js");
  if (!consoleGm) throw new Error("console-gm-normalizer.js must be loaded before playstation-sequence.js");

  const asBytes = core.asUint8Array;

  function normalizedResult(midiBytes, metadata) {
    const normalized = consoleGm.normalizeMidiLike(midiBytes, {
      collapseBanks: true,
      remapChannel10Drums: true,
    });
    return {
      midiBytes: normalized.midiBytes,
      metadata: {
        ...(metadata || {}),
        gmNormalized: true,
        bankSelectResetCount: normalized.stats.bankSelectResetCount,
        drumKeyRemappedCount: normalized.stats.drumKeyRemappedCount,
      },
    };
  }

  function asciiAt(bytes, offset, text) {
    const view = asBytes(bytes);
    if (offset < 0 || offset + text.length > view.length) return false;
    for (let i = 0; i < text.length; i++) if (view[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  }

  function be16(bytes, offset) {
    return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
  }

  function be24(bytes, offset) {
    return ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) >>> 0;
  }

  function be32(bytes, offset) {
    return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function le16(bytes, offset) {
    return ((bytes[offset] | (bytes[offset + 1] << 8)) >>> 0);
  }

  function le32(bytes, offset) {
    return ((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0)) >>> 0);
  }

  function pushBe16(out, value) {
    out.push((value >>> 8) & 0xff, value & 0xff);
  }

  function pushBe32(out, value) {
    out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  function vlq(value) {
    let v = Math.max(0, Math.round(Number(value) || 0)) & 0x0fffffff;
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  }

  function readVlq(bytes, state, end) {
    let value = 0;
    let count = 0;
    while (state.pos < end && count < 4) {
      const b = bytes[state.pos++];
      value = (value << 7) | (b & 0x7f);
      count++;
      if (!(b & 0x80)) return value >>> 0;
    }
    throw new Error("PlayStation SEQ VLQ가 손상되었습니다.");
  }

  function midiHeader(format, tracks, division) {
    const out = [0x4d, 0x54, 0x68, 0x64];
    pushBe32(out, 6);
    pushBe16(out, format);
    pushBe16(out, tracks);
    pushBe16(out, Math.max(1, Math.min(0x7fff, division | 0)));
    return out;
  }

  function midiTrack(payload) {
    const out = [0x4d, 0x54, 0x72, 0x6b];
    pushBe32(out, payload.length);
    out.push(...payload);
    return out;
  }

  const META_LENGTHS = Object.freeze({
    0x2f: 0,
    0x51: 3,
    0x54: 5,
    0x58: 4,
    0x59: 2,
  });

  function scoreToMidiTrack(bytes, start, end, initialTempo, numerator, denominatorPower) {
    const state = { pos: start };
    const payload = [];
    let runningStatus = 0;
    let reachedEnd = false;

    payload.push(0x00, 0xff, 0x51, 0x03,
      (initialTempo >>> 16) & 0xff, (initialTempo >>> 8) & 0xff, initialTempo & 0xff);
    payload.push(0x00, 0xff, 0x58, 0x04,
      Math.max(1, Math.min(255, numerator || 4)), Math.max(0, Math.min(7, denominatorPower || 2)), 24, 8);

    while (state.pos < end) {
      const delta = readVlq(bytes, state, end);
      if (state.pos >= end) break;

      let status = bytes[state.pos++];
      let firstData = null;
      if (status < 0x80) {
        if (!runningStatus) throw new Error("PlayStation SEQ running status가 올바르지 않습니다.");
        firstData = status;
        status = runningStatus;
      } else if (status < 0xf0 || status === 0xff) {
        // Sony SEQ extends running-status semantics to meta events (0xFF).
        // A following tempo event may therefore start directly with 0x51.
        runningStatus = status;
      } else {
        runningStatus = 0;
      }

      payload.push(...vlq(delta));

      if (status >= 0x80 && status <= 0xef) {
        const high = status & 0xf0;
        const dataCount = (high === 0xc0 || high === 0xd0) ? 1 : 2;
        const data = [];
        if (firstData != null) data.push(firstData);
        while (data.length < dataCount) {
          if (state.pos >= end) throw new Error("PlayStation SEQ MIDI 이벤트가 중간에서 끝났습니다.");
          data.push(bytes[state.pos++] & 0x7f);
        }
        payload.push(status, ...data);
        continue;
      }

      if (status === 0xff) {
        if (firstData == null && state.pos >= end) throw new Error("PlayStation SEQ meta 이벤트가 손상되었습니다.");
        const type = firstData == null ? bytes[state.pos++] : firstData;
        const length = META_LENGTHS[type];
        if (length == null) throw new Error(`지원하지 않는 PlayStation SEQ meta 이벤트입니다: 0x${type.toString(16)}`);
        if (state.pos + length > end) throw new Error("PlayStation SEQ meta 이벤트 길이가 올바르지 않습니다.");
        const data = Array.from(bytes.subarray(state.pos, state.pos + length));
        state.pos += length;
        payload.push(0xff, type, ...vlq(length), ...data);
        if (type === 0x2f) {
          reachedEnd = true;
          break;
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVlq(bytes, state, end);
        if (state.pos + length > end) throw new Error("PlayStation SEQ SysEx 길이가 올바르지 않습니다.");
        payload.push(status, ...vlq(length), ...bytes.subarray(state.pos, state.pos + length));
        state.pos += length;
        continue;
      }

      throw new Error(`지원하지 않는 PlayStation SEQ 이벤트입니다: 0x${status.toString(16)}`);
    }

    if (!reachedEnd) payload.push(0x00, 0xff, 0x2f, 0x00);
    return payload;
  }

  function parseSeq(bytes, offset = 0) {
    if (!asciiAt(bytes, offset, "pQES")) throw new Error("PlayStation SEQ 헤더(pQES)를 찾지 못했습니다.");
    if (offset + 13 > bytes.length) throw new Error("PlayStation SEQ 헤더가 너무 짧습니다.");

    // PsyQ's documented SEQ header stores Version as BE16 (13-byte header).
    // Some retail titles use a BE32 Version field instead (15-byte header).
    // Probe the 15-byte shape first because its leading BE16 is zero.
    let headerSize;
    let version;
    let division;
    let tempo;
    let numerator;
    let denominatorPower;
    if (offset + 15 <= bytes.length && be32(bytes, offset + 4) === 1) {
      headerSize = 15;
      version = 1;
      division = be16(bytes, offset + 8) || 480;
      tempo = be24(bytes, offset + 10) || 500000;
      numerator = bytes[offset + 13] || 4;
      denominatorPower = bytes[offset + 14] || 2;
    } else {
      version = be16(bytes, offset + 4);
      if (version !== 1) throw new Error(`지원하지 않는 PlayStation SEQ 버전입니다: ${version}`);
      headerSize = 13;
      division = be16(bytes, offset + 6) || 480;
      tempo = be24(bytes, offset + 8) || 500000;
      numerator = bytes[offset + 11] || 4;
      denominatorPower = bytes[offset + 12] || 2;
    }

    const track = scoreToMidiTrack(bytes, offset + headerSize, bytes.length, tempo, numerator, denominatorPower);
    return normalizedResult(
      new Uint8Array([...midiHeader(0, 1, division), ...midiTrack(track)]),
      { variant: "SEQ", version, headerSize, division, tempo, numerator, denominatorPower }
    );
  }

  function parseSep(bytes, offset = 0) {
    if (!asciiAt(bytes, offset, "pQES")) throw new Error("PlayStation SEP 헤더(pQES)를 찾지 못했습니다.");
    if (offset + 19 > bytes.length) throw new Error("PlayStation SEP 헤더가 너무 짧습니다.");
    const version = be16(bytes, offset + 4);
    if (version !== 0) throw new Error(`지원하지 않는 PlayStation SEP 버전입니다: ${version}`);

    let pos = offset + 6;
    const sequences = [];
    while (pos + 13 <= bytes.length && sequences.length < 4096) {
      const id = be16(bytes, pos);
      const division = be16(bytes, pos + 2) || 480;
      const tempo = be24(bytes, pos + 4) || 500000;
      const numerator = bytes[pos + 7] || 4;
      const denominatorPower = bytes[pos + 8] || 2;
      const dataSize = be32(bytes, pos + 9);
      const scoreStart = pos + 13;
      if (!dataSize || scoreStart + dataSize > bytes.length) break;
      sequences.push({ id, division, tempo, numerator, denominatorPower, scoreStart, scoreEnd: scoreStart + dataSize });
      pos = scoreStart + dataSize;
    }
    if (!sequences.length) throw new Error("PlayStation SEP 안에서 시퀀스를 찾지 못했습니다.");

    // SEP is an archive of independent songs. The import pipeline consumes one song,
    // so use the first sequence deterministically and report the archive count.
    const first = sequences[0];
    const track = scoreToMidiTrack(bytes, first.scoreStart, first.scoreEnd,
      first.tempo, first.numerator, first.denominatorPower);
    return normalizedResult(
      new Uint8Array([...midiHeader(0, 1, first.division), ...midiTrack(track)]),
      {
        variant: "SEP",
        version,
        sequenceCount: sequences.length,
        importedSequenceId: first.id,
        division: first.division,
      }
    );
  }

  function ps2GetDataByte(bytes, state, end) {
    if (state.pos >= end) throw new Error("PlayStation 2 SQ 데이터가 중간에서 끝났습니다.");
    let value = bytes[state.pos++];
    if (value & 0x80) {
      state.skipDelta = true;
      value &= 0x7f;
    } else {
      state.skipDelta = false;
    }
    return value;
  }

  function parsePs2Sq(bytes, offset = 0) {
    const view = asBytes(bytes);
    if (!asciiAt(view, offset, "SCEIVers") || !asciiAt(view, offset + 0x10, "SCEISequ")) {
      throw new Error("PlayStation 2 SQ 헤더(SCEIVers/SCEISequ)를 찾지 못했습니다.");
    }
    if (offset + 0x44 > view.length) throw new Error("PlayStation 2 SQ 헤더가 너무 짧습니다.");

    // Sony CSL chunks use native PS2 little-endian numeric fields.
    const versionChunkSize = le32(view, offset + 8);
    const sequenceChunkOffset = offset + versionChunkSize;
    if (versionChunkSize < 0x10 || sequenceChunkOffset + 0x20 > view.length || !asciiAt(view, sequenceChunkOffset, "SCEISequ")) {
      throw new Error("PlayStation 2 SQ Version/Sequence chunk가 올바르지 않습니다.");
    }
    const sequenceChunkSize = le32(view, sequenceChunkOffset + 8);
    const midiChunkOffset = sequenceChunkOffset + sequenceChunkSize;
    if (sequenceChunkSize < 0x20 || midiChunkOffset + 20 > view.length || !asciiAt(view, midiChunkOffset, "SCEIMidi")) {
      throw new Error("PlayStation 2 SQ MIDI chunk를 찾지 못했습니다.");
    }

    const midiChunkSize = le32(view, midiChunkOffset + 8);
    const maxMidiNumber = le32(view, midiChunkOffset + 12);
    const midiDataOffset = midiChunkOffset + le32(view, midiChunkOffset + 16);
    if (midiDataOffset + 6 > view.length) throw new Error("PlayStation 2 SQ MIDI data block 위치가 올바르지 않습니다.");

    const sequenceOffset = le32(view, midiDataOffset);
    const ppq = le16(view, midiDataOffset + 4) || 480;
    const compressionOption = sequenceOffset !== 6 && midiDataOffset + 8 <= view.length ? le16(view, midiDataOffset + 6) : 0;
    const eventStart = midiDataOffset + sequenceOffset;
    const chunkEnd = midiChunkSize > 0 ? Math.min(view.length, midiChunkOffset + midiChunkSize) : view.length;
    const eventEnd = Math.max(eventStart, chunkEnd);
    if (eventStart >= eventEnd) throw new Error("PlayStation 2 SQ 이벤트 데이터가 없습니다.");

    const state = { pos: eventStart, skipDelta: false };
    const payload = [];
    let runningStatus = 0;
    let reachedEnd = false;
    let eventCount = 0;

    while (state.pos < eventEnd && eventCount < 1000000) {
      let delta = 0;
      if (!state.skipDelta) delta = readVlq(view, state, eventEnd);
      state.skipDelta = false;
      if (state.pos >= eventEnd) break;

      const begin = state.pos;
      let status = view[state.pos++];
      if (status <= 0x7f) {
        if (status === 0 && state.pos + 3 <= eventEnd && view[state.pos] === 0 && view[state.pos + 1] === 0 && view[state.pos + 2] === 0) break;
        if (!runningStatus) throw new Error("PlayStation 2 SQ running status가 올바르지 않습니다.");
        status = runningStatus;
        state.pos = begin;
      } else if (status !== 0xff) {
        runningStatus = status;
      }

      payload.push(...vlq(delta));
      const high = status & 0xf0;
      const channel = status & 0x0f;

      if (high === 0x80) {
        const key = ps2GetDataByte(view, state, eventEnd);
        payload.push(0x80 | channel, key, 0);
      } else if (high === 0x90) {
        if (state.pos >= eventEnd) throw new Error("PlayStation 2 SQ Note On이 중간에서 끝났습니다.");
        const key = view[state.pos++] & 0x7f;
        const velocity = ps2GetDataByte(view, state, eventEnd);
        payload.push(0x90 | channel, key, velocity);
      } else if (high === 0xb0) {
        if (state.pos >= eventEnd) throw new Error("PlayStation 2 SQ Control Change가 중간에서 끝났습니다.");
        const controller = view[state.pos++] & 0x7f;
        const value = ps2GetDataByte(view, state, eventEnd);
        payload.push(0xb0 | channel, controller, value);
      } else if (high === 0xc0) {
        const program = ps2GetDataByte(view, state, eventEnd);
        payload.push(0xc0 | channel, program);
      } else if (high === 0xe0) {
        if (state.pos >= eventEnd) throw new Error("PlayStation 2 SQ Pitch Bend가 중간에서 끝났습니다.");
        const first = view[state.pos++] & 0x7f;
        const second = ps2GetDataByte(view, state, eventEnd);
        // Sony's reader names these hi/lo but hands them to its MIDI-format pitch-bend helper in this order.
        payload.push(0xe0 | channel, first, second);
      } else if (status === 0xff) {
        if (state.pos >= eventEnd) break;
        const type = view[state.pos++];
        if (type === 0x51) {
          if (state.pos + 4 > eventEnd) throw new Error("PlayStation 2 SQ Tempo 이벤트가 손상되었습니다.");
          const lengthByte = view[state.pos++];
          const t1 = view[state.pos++], t2 = view[state.pos++], t3 = view[state.pos++];
          payload.push(0xff, 0x51, 0x03, t1, t2, t3);
          if (lengthByte !== 0x03) {
            // Retail files conventionally store 0x03 here. Keep parsing the 24-bit tempo even if malformed.
          }
        } else if (type === 0x2f) {
          payload.push(0xff, 0x2f, 0x00);
          reachedEnd = true;
          break;
        } else {
          // VGMTrans also treats unknown PS2 SQ meta events as end-of-track.
          payload.push(0xff, 0x2f, 0x00);
          reachedEnd = true;
          break;
        }
      } else {
        // Unsupported channel/system event: stop safely rather than desynchronizing subsequent bytes.
        payload.push(0xff, 0x2f, 0x00);
        reachedEnd = true;
        break;
      }
      eventCount++;
    }

    if (!reachedEnd) payload.push(0x00, 0xff, 0x2f, 0x00);
    return normalizedResult(
      new Uint8Array([...midiHeader(0, 1, ppq), ...midiTrack(payload)]),
      {
        variant: "PS2 SQ",
        versionMajor: view[offset + 14] || 0,
        versionMinor: view[offset + 15] || 0,
        ppq,
        compressionOption,
        maxMidiNumber,
        eventCount,
      }
    );
  }

  function detect(bytes) {
    const view = asBytes(bytes);
    if (asciiAt(view, 0, "SCEIVers") && asciiAt(view, 0x10, "SCEISequ") && asciiAt(view, 0x30, "SCEIMidi")) return "sq";
    if (!asciiAt(view, 0, "pQES") || view.length < 6) return null;
    if (view.length >= 8 && be32(view, 4) === 1) return "seq";
    if (be16(view, 4) === 1) return "seq";
    if (be16(view, 4) === 0) return "sep";
    return null;
  }

  function convert(bytes, fileName = "") {
    const view = asBytes(bytes);
    const detected = detect(view);
    const variant = detected || (/\.(?:sq|bq)$/i.test(String(fileName)) ? "sq" : (/\.sep$/i.test(String(fileName)) ? "sep" : "seq"));
    if (variant === "sq") return parsePs2Sq(view);
    return variant === "sep" ? parseSep(view) : parseSeq(view);
  }

  root.MabiPlayStationSequence = Object.freeze({ detect, convert, parseSeq, parseSep, parsePs2Sq });
})();
