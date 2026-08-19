(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  const consoleGm = root.MabiConsoleGM;
  if (!core) throw new Error("music-format-core.js must be loaded before nintendo-sequence.js");
  if (!consoleGm) throw new Error("console-gm-normalizer.js must be loaded before nintendo-sequence.js");

  const OUT_PPQ = 480;
  const MAX_STEPS = 300000;

  function bytesOf(value) { return core.asUint8Array(value); }
  function asciiAt(bytes, offset, text) {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  }
  function findAscii(bytes, text, start = 0, end = bytes.length) {
    const limit = Math.min(bytes.length, end) - text.length;
    outer: for (let i = Math.max(0, start); i <= limit; i++) {
      for (let j = 0; j < text.length; j++) if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
      return i;
    }
    return -1;
  }
  function u16(bytes, offset, little) {
    return little ? ((bytes[offset] | (bytes[offset + 1] << 8)) >>> 0)
      : (((bytes[offset] << 8) | bytes[offset + 1]) >>> 0);
  }
  function u24(bytes, offset, little) {
    return little
      ? ((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) >>> 0)
      : (((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) >>> 0);
  }
  function u32(bytes, offset, little) {
    if (little) return ((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0)) >>> 0);
    return ((((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);
  }
  function s8(value) { return value & 0x80 ? value - 0x100 : value; }
  function fileLittleEndian(bytes) {
    if (bytes.length < 6) return true;
    if (bytes[4] === 0xff && bytes[5] === 0xfe) return true;
    if (bytes[4] === 0xfe && bytes[5] === 0xff) return false;
    return true;
  }
  function readVarint(bytes, state) {
    let value = 0;
    let count = 0;
    while (state.pc < bytes.length && count < 5) {
      const b = bytes[state.pc++];
      value = (value << 7) | (b & 0x7f);
      count++;
      if (!(b & 0x80)) return value >>> 0;
    }
    throw new Error("Nintendo 시퀀스 VLQ가 손상되었습니다.");
  }

  function extractSseq(bytes) {
    const data = findAscii(bytes, "DATA", 0, Math.min(bytes.length, 0x100));
    if (data < 0 || data + 12 > bytes.length) throw new Error("Nintendo DS SSEQ DATA 블록을 찾지 못했습니다.");
    const offset = u32(bytes, data + 8, true);
    const start = offset > 0 && offset < bytes.length ? offset : data + 12;
    return { kind: "SSEQ", raw: bytes.subarray(start), little: true, source: "SSEQ" };
  }

  function extractSsar(bytes) {
    const data = findAscii(bytes, "DATA", 0, Math.min(bytes.length, 0x100));
    if (data < 0 || data + 16 > bytes.length) throw new Error("Nintendo DS SSAR DATA 블록을 찾지 못했습니다.");
    const dataOffset = u32(bytes, data + 8, true);
    const count = u32(bytes, data + 12, true);
    if (!count || data + 16 + count * 12 > bytes.length) throw new Error("Nintendo DS SSAR 시퀀스 목록이 올바르지 않습니다.");
    const firstOffset = u32(bytes, data + 16, true);
    const start = dataOffset + firstOffset;
    if (start < 0 || start >= bytes.length) throw new Error("Nintendo DS SSAR 첫 시퀀스 위치가 올바르지 않습니다.");
    return { kind: "SSEQ", raw: bytes.subarray(start), little: true, source: "SSAR", sequenceCount: count };
  }

  function sdatFatFile(bytes, fatOffset, count, fileId) {
    if (!Number.isInteger(fileId) || fileId < 0 || fileId >= count) return null;
    const rec = fatOffset + 12 + fileId * 16;
    if (rec + 16 > bytes.length) return null;
    const offset = u32(bytes, rec, true);
    const size = u32(bytes, rec + 4, true);
    if (!size || offset + size > bytes.length) return null;
    return { fileId, offset, size, bytes: bytes.subarray(offset, offset + size) };
  }

  function parseSbnkProfile(bytes) {
    if (!bytes || bytes.length < 0x3c || !asciiAt(bytes, 0, "SBNK")) return null;
    const count = u32(bytes, 0x38, true);
    if (!count || count > 4096 || 0x3c + count * 4 > bytes.length) return null;
    const instruments = [];
    let drumsetCount = 0;
    let psgWaveCount = 0;
    let psgNoiseCount = 0;
    for (let index = 0; index < count; index++) {
      const packed = u32(bytes, 0x3c + index * 4, true);
      if (!packed) { instruments[index] = null; continue; }
      const type = packed & 0xff;
      const offset = packed >>> 8;
      const profile = { type, offset };
      if (type === 0x10 && offset + 2 <= bytes.length) {
        profile.lowKey = bytes[offset] & 0x7f;
        profile.highKey = bytes[offset + 1] & 0x7f;
        if (profile.highKey < profile.lowKey) {
          delete profile.lowKey;
          delete profile.highKey;
        }
        drumsetCount++;
      } else if (type === 0x02) {
        if (offset < bytes.length) profile.dutyCycle = bytes[offset] & 0x07;
        psgWaveCount++;
      } else if (type === 0x03) {
        psgNoiseCount++;
      }
      instruments[index] = profile;
    }
    return { instrumentCount: count, instruments, drumsetCount, psgWaveCount, psgNoiseCount };
  }

  function extractSdatAssociatedSseq(bytes, infoOffset, fatOffset, fatCount) {
    if (infoOffset + 0x18 > bytes.length || !asciiAt(bytes, infoOffset, "INFO")) return null;
    const seqListRel = u32(bytes, infoOffset + 0x08, true);
    if (!seqListRel) return null;
    const seqList = infoOffset + seqListRel;
    if (seqList + 4 > bytes.length) return null;
    const seqCount = u32(bytes, seqList, true);
    if (!seqCount || seqCount > 65535 || seqList + 4 + seqCount * 4 > bytes.length) return null;

    let bankList = -1;
    let bankCount = 0;
    if (infoOffset + 0x14 <= bytes.length) {
      const bankListRel = u32(bytes, infoOffset + 0x10, true);
      if (bankListRel) {
        const candidate = infoOffset + bankListRel;
        if (candidate + 4 <= bytes.length) {
          const count = u32(bytes, candidate, true);
          if (count <= 65535 && candidate + 4 + count * 4 <= bytes.length) {
            bankList = candidate;
            bankCount = count;
          }
        }
      }
    }

    for (let seqIndex = 0; seqIndex < seqCount; seqIndex++) {
      const seqInfoRel = u32(bytes, seqList + 4 + seqIndex * 4, true);
      if (!seqInfoRel) continue;
      const seqInfo = infoOffset + seqInfoRel;
      if (seqInfo + 6 > bytes.length) continue;
      const seqFileId = u16(bytes, seqInfo, true);
      const bankId = u16(bytes, seqInfo + 4, true);
      const seqFile = sdatFatFile(bytes, fatOffset, fatCount, seqFileId);
      if (!seqFile || !asciiAt(seqFile.bytes, 0, "SSEQ")) continue;

      let bankProfile = null;
      let bankFileId = null;
      if (bankList >= 0 && bankId < bankCount) {
        const bankInfoRel = u32(bytes, bankList + 4 + bankId * 4, true);
        if (bankInfoRel) {
          const bankInfo = infoOffset + bankInfoRel;
          if (bankInfo + 2 <= bytes.length) {
            bankFileId = u16(bytes, bankInfo, true);
            const bankFile = sdatFatFile(bytes, fatOffset, fatCount, bankFileId);
            if (bankFile) bankProfile = parseSbnkProfile(bankFile.bytes);
          }
        }
      }

      const result = extractSseq(seqFile.bytes);
      return {
        ...result,
        source: "SDAT/SSEQ",
        archiveFileCount: fatCount,
        archiveEntry: seqFileId,
        archiveSequenceIndex: seqIndex,
        archiveBankIndex: bankId,
        archiveBankFileId: bankFileId,
        bankProfile,
      };
    }
    return null;
  }

  function extractSdat(bytes) {
    if (bytes.length < 0x30 || !asciiAt(bytes, 0, "SDAT")) throw new Error("Nintendo DS SDAT 헤더를 찾지 못했습니다.");
    const infoOffset = u32(bytes, 0x18, true);
    const fatOffset = u32(bytes, 0x20, true);
    if (fatOffset + 12 > bytes.length || !asciiAt(bytes, fatOffset, "FAT ")) {
      throw new Error("Nintendo DS SDAT FAT 블록을 찾지 못했습니다.");
    }
    const count = u32(bytes, fatOffset + 8, true);

    // Prefer SDAT INFO associations so the selected SSEQ can bring along its
    // matching SBNK instrument type table (sampled / PSG / drumset).
    const associated = extractSdatAssociatedSseq(bytes, infoOffset, fatOffset, count);
    if (associated) return associated;

    // Compatibility fallback for malformed/minimal SDAT files: retain the old
    // first-sequence scan even when INFO associations are unavailable.
    for (let i = 0; i < count; i++) {
      const entry = sdatFatFile(bytes, fatOffset, count, i);
      if (!entry) continue;
      const file = entry.bytes;
      if (asciiAt(file, 0, "SSEQ")) {
        const result = extractSseq(file);
        return { ...result, source: "SDAT/SSEQ", archiveFileCount: count, archiveEntry: i, bankProfile: null };
      }
      if (asciiAt(file, 0, "SSAR")) {
        const result = extractSsar(file);
        return { ...result, source: "SDAT/SSAR", archiveFileCount: count, archiveEntry: i, bankProfile: null };
      }
    }
    throw new Error("Nintendo DS SDAT에서 SSEQ/SSAR 시퀀스를 찾지 못했습니다.");
  }

  function extractRcf(bytes, magic) {
    const little = fileLittleEndian(bytes);
    const data = findAscii(bytes, "DATA", 0, bytes.length);
    if (data < 0 || data + 8 > bytes.length) throw new Error(`Nintendo ${magic} DATA 블록을 찾지 못했습니다.`);
    const blockSize = u32(bytes, data + 4, little);
    let start = data + 8;
    if (magic === "RSEQ" && data + 12 <= bytes.length) {
      const rel = u32(bytes, data + 8, little);
      if (rel >= 8 && data + rel < bytes.length && (!blockSize || rel < blockSize)) start = data + rel;
    }
    const end = blockSize >= 8 && data + blockSize <= bytes.length ? data + blockSize : bytes.length;
    if (start >= end) throw new Error(`Nintendo ${magic} 시퀀스 데이터가 비어 있습니다.`);
    return { kind: "RCF", raw: bytes.subarray(start, end), little, source: magic };
  }

  function embeddedSequence(bytes, expectedMagic) {
    let cursor = 0;
    while (cursor + 16 <= bytes.length) {
      const at = findAscii(bytes, expectedMagic, cursor);
      if (at < 0) return null;
      if (at + 16 <= bytes.length) {
        const little = fileLittleEndian(bytes.subarray(at));
        const size = u32(bytes, at + 8, little);
        if (size >= 16 && at + size <= bytes.length) return bytes.subarray(at, at + size);
      }
      cursor = at + 4;
    }
    return null;
  }

  function extractNintendo(bytes, fileName = "") {
    const ext = core.extensionOf(fileName);
    if (asciiAt(bytes, 0, "SSEQ") || ext === "sseq") return extractSseq(bytes);
    if (asciiAt(bytes, 0, "SSAR") || ext === "ssar") return extractSsar(bytes);
    if (asciiAt(bytes, 0, "SDAT") || ext === "sdat") return extractSdat(bytes);

    for (const magic of ["RSEQ", "CSEQ", "FSEQ"]) {
      if (asciiAt(bytes, 0, magic)) return extractRcf(bytes, magic);
    }

    const archiveMap = {
      brsar: ["RSEQ", "BRSAR"],
      bcsar: ["CSEQ", "BCSAR"],
      bfsar: ["FSEQ", "BFSAR"],
    };
    const archive = archiveMap[ext] || (asciiAt(bytes, 0, "RSAR") ? ["RSEQ", "BRSAR"] : asciiAt(bytes, 0, "CSAR") ? ["CSEQ", "BCSAR"] : asciiAt(bytes, 0, "FSAR") ? ["FSEQ", "BFSAR"] : null);
    if (archive) {
      const embedded = embeddedSequence(bytes, archive[0]);
      if (!embedded) throw new Error(`Nintendo ${archive[1]}에서 ${archive[0]} 시퀀스를 찾지 못했습니다.`);
      const result = extractRcf(embedded, archive[0]);
      return { ...result, source: `${archive[1]}/${archive[0]}` };
    }

    // Common non-B-prefixed aliases used by extracted sequence tools.
    if (ext === "rseq" || ext === "brseq") return extractRcf(bytes, "RSEQ");
    if (ext === "cseq" || ext === "bcseq") return extractRcf(bytes, "CSEQ");
    if (ext === "fseq" || ext === "bfseq") return extractRcf(bytes, "FSEQ");
    throw new Error("지원하는 Nintendo 시퀀스 헤더를 찾지 못했습니다.");
  }

  function argumentBytesForSimpleCommand(command, kind) {
    if (command <= 0x7f) return -1; // velocity + varint duration
    if (command === 0x80 || command === 0x81) return -2; // varint
    if (kind === "SSEQ") {
      if (command === 0x93) return 4;
      if (command === 0x94 || command === 0x95) return 3;
      if (command >= 0xb0 && command <= 0xbd) return 3;
      if ((command >= 0xc0 && command <= 0xd6)) return 1;
      if (command === 0xe0 || command === 0xe1 || command === 0xe3) return 2;
      if (command === 0xfe) return 2;
      if (command === 0xfc || command === 0xfd || command === 0xff || command === 0xa2) return 0;
      return null;
    }
    if (command === 0x88) return 4;
    if (command === 0x89 || command === 0x8a) return 3;
    if (command >= 0xb0 && command <= 0xb3) return 1;
    if (command >= 0xc0 && command <= 0xdf) return 1;
    if (command === 0xe0 || command === 0xe1 || command === 0xe3) return 2;
    if (command === 0xf0) return 4;
    if (command === 0xfe) return 2;
    if (command === 0xfc || command === 0xfd || command === 0xff || command === 0xa2) return 0;
    return null;
  }

  function skipRandomPrefix(raw, state, kind) {
    if (state.pc >= raw.length) throw new Error("Nintendo 랜덤 prefix가 손상되었습니다.");
    const sub = raw[state.pc++];
    const args = argumentBytesForSimpleCommand(sub, kind);
    if (args === -1) {
      // Randomized note duration: velocity remains explicit, duration is replaced by min/max int16.
      state.pc += 1 + 4;
    } else if (args === -2 || args === 1) {
      // The sole argument is replaced by signed min/max values.
      state.pc += 4;
    } else if (Number.isInteger(args) && args >= 2) {
      // Preserve all arguments except the last scalar and append min/max.
      state.pc += Math.max(0, args - 1) + 4;
    } else {
      throw new Error(`지원하지 않는 Nintendo 랜덤 prefix 대상 명령입니다: 0x${sub.toString(16)}`);
    }
    if (state.pc > raw.length) throw new Error("Nintendo 랜덤 prefix 길이가 파일을 벗어났습니다.");
  }

  function parseRawSequence(info) {
    const raw = info.raw;
    const kind = info.kind;
    const little = kind === "SSEQ" ? true : info.little;
    const trackOpcode = kind === "SSEQ" ? 0x93 : 0x88;
    const jumpOpcode = kind === "SSEQ" ? 0x94 : 0x89;
    const callOpcode = kind === "SSEQ" ? 0x95 : 0x8a;
    const parsedTracks = [];
    const tempoEvents = [{ tick: 0, bpm: 120 }];
    const pending = [{ track: 0, start: 0, initialTick: 0 }];
    const scheduled = new Set(["0:0"]);

    function scaleTicks(value, timebase) {
      return Math.max(0, Math.round((Number(value) || 0) * OUT_PPQ / Math.max(1, timebase || 48)));
    }

    while (pending.length) {
      const task = pending.shift();
      const state = {
        pc: task.start,
        tick: task.initialTick || 0,
        timebase: 48,
        program: 0,
        bank: 0,
        instrumentId: 0,
        transpose: 0,
        volume: 127,
        expression: 127,
        pan: 64,
        noteWait: kind === "RCF",
        callStack: [],
        loopStack: [],
        jumpVisits: new Map(),
      };
      const notes = [];
      const controls = [];
      let steps = 0;
      let stoppedByLoop = false;

      while (state.pc >= 0 && state.pc < raw.length && steps++ < MAX_STEPS) {
        const commandStart = state.pc;
        const cmd = raw[state.pc++];

        if (cmd <= 0x7f) {
          if (state.pc >= raw.length) break;
          const velocity = raw[state.pc++] & 0x7f;
          const durationUnits = readVarint(raw, state);
          const duration = Math.max(1, scaleTicks(durationUnits, state.timebase));
          notes.push({
            startTick: state.tick,
            durationTick: duration,
            pitch: Math.max(0, Math.min(127, cmd + state.transpose)),
            velocity: Math.max(1, velocity),
            volume: state.volume,
            expression: state.expression,
            pan: state.pan,
            program: state.program,
            bank: state.bank,
            instrumentId: state.instrumentId,
          });
          if (state.noteWait) state.tick += duration;
          continue;
        }

        if (cmd === 0x80) {
          state.tick += scaleTicks(readVarint(raw, state), state.timebase);
          continue;
        }
        if (cmd === 0x81) {
          const instrument = readVarint(raw, state);
          state.instrumentId = instrument;
          state.program = instrument & 0x7f;
          state.bank = instrument >>> 7;
          continue;
        }
        if (cmd === trackOpcode) {
          if (state.pc + 4 > raw.length) break;
          const track = raw[state.pc++];
          const dest = u24(raw, state.pc, kind === "SSEQ" ? true : little);
          state.pc += 3;
          if (dest < raw.length) {
            const key = `${track}:${dest}`;
            if (!scheduled.has(key)) {
              scheduled.add(key);
              pending.push({ track, start: dest, initialTick: state.tick });
            }
          }
          continue;
        }
        if (cmd === jumpOpcode) {
          if (state.pc + 3 > raw.length) break;
          const dest = u24(raw, state.pc, kind === "SSEQ" ? true : little);
          state.pc += 3;
          if (dest >= raw.length) break;
          const count = (state.jumpVisits.get(dest) || 0) + 1;
          state.jumpVisits.set(dest, count);
          if (dest <= commandStart && count > 1) { stoppedByLoop = true; break; }
          state.pc = dest;
          continue;
        }
        if (cmd === callOpcode) {
          if (state.pc + 3 > raw.length) break;
          const dest = u24(raw, state.pc, kind === "SSEQ" ? true : little);
          state.pc += 3;
          if (dest >= raw.length || state.callStack.length >= 32) continue;
          state.callStack.push(state.pc);
          state.pc = dest;
          continue;
        }
        if (cmd === 0xfd) {
          if (!state.callStack.length) break;
          state.pc = state.callStack.pop();
          continue;
        }
        if (cmd === 0xd4) {
          if (state.pc >= raw.length) break;
          const count = raw[state.pc++];
          state.loopStack.push({ start: state.pc, remaining: count === 0 ? 2 : Math.min(count, 16) });
          continue;
        }
        if (cmd === 0xfc) {
          const loop = state.loopStack[state.loopStack.length - 1];
          if (!loop) continue;
          loop.remaining--;
          if (loop.remaining > 0) state.pc = loop.start;
          else state.loopStack.pop();
          continue;
        }
        if (cmd === 0xff) break;

        if (cmd === 0xa0) {
          skipRandomPrefix(raw, state, kind);
          continue;
        }
        if (cmd === 0xa2) {
          // Conditional execution depends on runtime variables. Import the following command
          // normally; this keeps deterministic musical data instead of discarding it.
          continue;
        }
        if (cmd === 0xa1 || (kind === "RCF" && cmd >= 0xa3 && cmd <= 0xa5)) {
          throw new Error(`동적 Nintendo prefix 명령(0x${cmd.toString(16)})이 포함된 시퀀스는 현재 결정적으로 변환할 수 없습니다.`);
        }

        if (kind === "SSEQ" && cmd >= 0xb0 && cmd <= 0xbd) {
          state.pc += 3;
          if (state.pc > raw.length) break;
          continue;
        }
        if (kind === "RCF" && cmd === 0xb0) {
          if (state.pc >= raw.length) break;
          state.timebase = Math.max(1, raw[state.pc++]);
          continue;
        }
        if (kind === "RCF" && cmd >= 0xb1 && cmd <= 0xb3) {
          state.pc += 1;
          continue;
        }

        if (cmd === 0xc3) {
          if (state.pc >= raw.length) break;
          state.transpose = s8(raw[state.pc++]);
          continue;
        }
        if (kind === "SSEQ" && cmd === 0xc0) {
          if (state.pc >= raw.length) break;
          state.pan = raw[state.pc++] & 0x7f;
          controls.push({ tick: state.tick, controller: 10, value: state.pan });
          continue;
        }
        if (kind === "SSEQ" && cmd === 0xc1) {
          if (state.pc >= raw.length) break;
          state.volume = raw[state.pc++] & 0x7f;
          controls.push({ tick: state.tick, controller: 7, value: state.volume });
          continue;
        }
        if (kind === "SSEQ" && cmd === 0xd5) {
          if (state.pc >= raw.length) break;
          state.expression = raw[state.pc++] & 0x7f;
          controls.push({ tick: state.tick, controller: 11, value: state.expression });
          continue;
        }
        if (cmd === 0xc7) {
          if (state.pc >= raw.length) break;
          const value = raw[state.pc++];
          state.noteWait = kind === "SSEQ" ? value === 1 : value !== 0;
          continue;
        }
        if (cmd >= 0xc0 && cmd <= (kind === "SSEQ" ? 0xd6 : 0xdf)) {
          state.pc += 1;
          if (state.pc > raw.length) break;
          continue;
        }
        if (cmd === 0xe1) {
          if (state.pc + 2 > raw.length) break;
          const bpm = u16(raw, state.pc, kind === "SSEQ" ? true : little);
          state.pc += 2;
          if (bpm > 0) tempoEvents.push({ tick: state.tick, bpm });
          continue;
        }
        if (cmd === 0xe0 || cmd === 0xe3) {
          state.pc += 2;
          continue;
        }
        if (kind === "RCF" && cmd === 0xf0) {
          state.pc += 4;
          if (state.pc > raw.length) break;
          continue;
        }
        if (cmd === 0xfe) {
          state.pc += 2;
          continue;
        }

        throw new Error(`지원하지 않는 Nintendo 시퀀스 명령입니다: 0x${cmd.toString(16)} (offset 0x${commandStart.toString(16)})`);
      }

      if (steps >= MAX_STEPS) throw new Error("Nintendo 시퀀스 제어 흐름이 너무 길어 변환을 중단했습니다.");
      parsedTracks.push({ trackIndex: task.track, notes, controls, stoppedByLoop });
    }

    const grouped = new Map();
    let drumKeyRemappedCount = 0;
    let drumTrackGroupCount = 0;
    let psgProgramMappedCount = 0;
    let proprietaryBankCollapsedCount = 0;
    const profileInstruments = info.bankProfile?.instruments || [];

    for (const source of parsedTracks) {
      for (const note of source.notes) {
        const instrumentProfile = profileInstruments[note.instrumentId] || null;
        const instrumentType = instrumentProfile?.type ?? null;
        const isDrums = instrumentType === 0x10 || instrumentType === 0x03;
        const normalizedProgram = consoleGm.nintendoProgram(note.program, instrumentType);
        if (instrumentType === 0x02) psgProgramMappedCount++;
        if (note.bank) proprietaryBankCollapsedCount++;

        const key = `${source.trackIndex}:${note.instrumentId}:${isDrums ? "D" : normalizedProgram}`;
        let group = grouped.get(key);
        if (!group) {
          let typeName = `Program ${note.program + 1}`;
          if (instrumentType === 0x10) typeName = "Drumset";
          else if (instrumentType === 0x02) typeName = "PSG Wave → GM Square Lead";
          else if (instrumentType === 0x03) typeName = "PSG Noise → GM Percussion";
          group = {
            name: `Nintendo Track ${source.trackIndex + 1} · ${typeName}`,
            program: normalizedProgram,
            channel: source.trackIndex % 16,
            isDrums,
            notes: [],
            controlChanges: [],
            sourceTrackIndex: source.trackIndex,
          };
          grouped.set(key, group);
          if (isDrums) drumTrackGroupCount++;
        }

        let pitch = note.pitch;
        if (instrumentType === 0x10) {
          pitch = consoleGm.nintendoDrumKey(note.pitch, instrumentProfile);
        } else if (instrumentType === 0x03) {
          // The DS PSG noise generator has no melodic SoundFont equivalent.
          // Spread pitch changes over a small useful percussion palette.
          pitch = consoleGm.genericDrumKey(note.pitch, { forceSlot: true });
        }
        if (isDrums && pitch !== note.pitch) drumKeyRemappedCount++;
        group.notes.push({ ...note, pitch });
      }
    }

    for (const group of grouped.values()) {
      const state = { 7: null, 10: null, 11: null };
      const sourceControls = parsedTracks
        .filter(source => source.trackIndex === group.sourceTrackIndex)
        .flatMap(source => source.controls || [])
        .sort((a, b) => a.tick - b.tick);
      for (const control of sourceControls) {
        const controller = Number(control.controller);
        const normalized = Math.max(0, Math.min(127, Number(control.value) || 0));
        if (state[controller] === normalized) continue;
        state[controller] = normalized;
        group.controlChanges.push({ tick: control.tick, controller, value: normalized });
      }
      // If a sequence never emitted an explicit controller before its first note,
      // materialize the controller state attached to that note so the MIDI starts
      // from the same audible state (127/64/127 or an inherited value).
      for (const note of [...group.notes].sort((a, b) => a.startTick - b.startTick)) {
        const values = [[7, note.volume], [10, note.pan], [11, note.expression]];
        for (const [controller, value] of values) {
          const normalized = Math.max(0, Math.min(127, Number(value) || 0));
          if (state[controller] !== null) continue;
          state[controller] = normalized;
          group.controlChanges.push({ tick: note.startTick, controller, value: normalized });
        }
      }
      group.controlChanges.sort((a, b) => a.tick - b.tick || a.controller - b.controller);
      delete group.sourceTrackIndex;
    }

    if (!grouped.size) {
      // Preserve an empty track only to give a useful conversion error instead of a malformed MIDI.
      throw new Error("Nintendo 시퀀스에서 변환 가능한 노트를 찾지 못했습니다.");
    }

    const uniqueTempo = [];
    const seenTempo = new Set();
    for (const item of tempoEvents.sort((a, b) => a.tick - b.tick)) {
      const key = `${Math.round(item.tick)}:${Math.round(item.bpm)}`;
      if (seenTempo.has(key)) continue;
      seenTempo.add(key);
      uniqueTempo.push({ tick: Math.round(item.tick), bpm: item.bpm });
    }

    return {
      midiBytes: core.buildMidi({
        ppq: OUT_PPQ,
        title: `Nintendo ${info.source}`,
        tempoEvents: uniqueTempo,
        tracks: Array.from(grouped.values()),
      }),
      metadata: {
        variant: info.source,
        sourceTimebase: 48,
        outputPpq: OUT_PPQ,
        trackCount: parsedTracks.length,
        stoppedLoopCount: parsedTracks.filter(track => track.stoppedByLoop).length,
        sequenceCount: info.sequenceCount || 1,
        archiveFileCount: info.archiveFileCount || undefined,
        archiveEntry: info.archiveEntry,
        archiveSequenceIndex: info.archiveSequenceIndex,
        archiveBankIndex: info.archiveBankIndex,
        archiveBankFileId: info.archiveBankFileId,
        bankProfileDetected: Boolean(info.bankProfile),
        bankInstrumentCount: info.bankProfile?.instrumentCount,
        gmNormalized: true,
        drumTrackGroupCount,
        drumKeyRemappedCount,
        psgProgramMappedCount,
        proprietaryBankCollapsedCount,
      },
    };
  }

  function detect(bytes) {
    const view = bytesOf(bytes);
    for (const magic of ["SSEQ", "SSAR", "SDAT", "RSEQ", "CSEQ", "FSEQ", "RSAR", "CSAR", "FSAR"]) {
      if (asciiAt(view, 0, magic)) return magic;
    }
    return null;
  }

  function convert(bytes, fileName = "") {
    const view = bytesOf(bytes);
    return parseRawSequence(extractNintendo(view, fileName));
  }

  root.MabiNintendoSequence = Object.freeze({ detect, convert, extractNintendo, parseRawSequence, parseSbnkProfile });
})();
