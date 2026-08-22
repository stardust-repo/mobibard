(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  const core = root.MabiMusicFormats;
  const notation = root.MabiNotation;
  if (!utils) throw new Error("utils.js must be loaded before finale-mus-to-midi.js");
  if (!core) throw new Error("music-format-core.js must be loaded before finale-mus-to-midi.js");
  if (!notation) throw new Error("notation-utils.js must be loaded before finale-mus-to-midi.js");

  // Finale legacy ENIGMA BINARY .mus reader (DCL and zlib pool containers).
  // The binary layout is based on the reverse-engineered MIT-licensed
  // finale-file-parser project. The PKWARE DCL decoder follows Mark Adler's
  // blast.c algorithm (zlib license). See THIRD-PARTY-NOTICES.md.

  const MAX_INPUT_BYTES = 64 * 1024 * 1024;
  const MAX_DECODED_BYTES = 64 * 1024 * 1024;
  const CONTAINER_START = 0x200;
  const RECORD_HEADER = 10;
  const EMPTY_RECORD = 6;
  const POOL_OTHERS = 15;
  const POOL_DETAILS = 16;
  const POOL_ENTRIES = 17;
  const ROW_SIZE = 16;
  const ENTRY_SLOT_SIZE = 38;
  const WHOLE_EDU = 4096;
  const DEFAULT_BPM = 120;
  const MAX_CHAIN_STEPS = 1_000_000;

  const ENTRY_SETBIT = 0x80000000;
  const ENTRY_FLOATREST = 0x01000000;
  const ENTRY_GRACE = 0x00800000;
  const NOTE_TIE_START = 0x40000000;
  const NOTE_TIE_END = 0x20000000;

  class FinaleMusError extends Error {
    constructor(message, code = "mus.invalid") {
      super(message);
      this.name = "FinaleMusError";
      this.code = code;
    }
  }

  const toBytes = utils.toUint8Array;


  function normalizeFinaleMusContainer(value) {
    const candidate = utils.macBinaryForkCandidates(value, { signature: "ENIGMA BINARY FILE" })[0];
    if (!candidate) return null;
    return {
      bytes: toBytes(candidate.bytes),
      metadata: { ...candidate.metadata },
    };
  }

  function isFinaleMusBytes(value) {
    return Boolean(normalizeFinaleMusContainer(value));
  }

  function readU16(bytes, offset, order) {
    if (offset < 0 || offset + 2 > bytes.length) throw new FinaleMusError("MUS 데이터가 중간에서 끝났습니다.", "mus.truncated");
    return order === "big"
      ? (bytes[offset] << 8) | bytes[offset + 1]
      : bytes[offset] | (bytes[offset + 1] << 8);
  }


  function readU32(bytes, offset, order) {
    if (offset < 0 || offset + 4 > bytes.length) throw new FinaleMusError("MUS 데이터가 중간에서 끝났습니다.", "mus.truncated");
    if (order === "big") {
      return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
    }
    return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] * 0x1000000)) >>> 0;
  }

  function signedBits(value, bits) {
    const sign = 2 ** (bits - 1);
    return value & sign ? value - 2 ** bits : value;
  }

  // --- PKWARE DCL / implode decompressor ----------------------------------
  const LEN_BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const END_OF_STREAM = 519;
  const MAX_CODE_BITS = 16;
  const LITERAL_LENGTHS = [11,124,8,7,28,7,188,13,76,4,10,8,12,10,12,10,8,23,8,9,7,6,7,8,7,6,55,8,23,24,12,11,7,9,11,12,6,7,22,5,7,24,6,11,9,6,7,22,7,11,38,7,9,8,25,11,8,11,9,12,8,12,5,38,5,38,5,11,7,5,6,21,6,10,53,8,7,24,10,27,44,253,253,253,252,252,252,13,12,45,12,45,12,61,12,45,44,173];
  const LENGTH_LENGTHS = [2,35,36,53,38,23];
  const DISTANCE_LENGTHS = [2,20,53,230,247,151,248];

  class Huffman {
    constructor(runLengthCoded) {
      const lengths = [];
      for (const byte of runLengthCoded) {
        const count = (byte >> 4) + 1;
        const length = byte & 0x0f;
        for (let i = 0; i < count; i += 1) lengths.push(length);
      }
      this.count = new Array(MAX_CODE_BITS + 1).fill(0);
      for (const length of lengths) this.count[length] += 1;
      const offsets = new Array(MAX_CODE_BITS + 1).fill(0);
      for (let length = 1; length < MAX_CODE_BITS - 1; length += 1) {
        offsets[length + 1] = offsets[length] + this.count[length];
      }
      this.symbol = new Array(lengths.length).fill(0);
      lengths.forEach((length, symbol) => {
        if (!length) return;
        this.symbol[offsets[length]] = symbol;
        offsets[length] += 1;
      });
    }
  }

  const LITERAL_CODE = new Huffman(LITERAL_LENGTHS);
  const LENGTH_CODE = new Huffman(LENGTH_LENGTHS);
  const DISTANCE_CODE = new Huffman(DISTANCE_LENGTHS);

  class BitReader {
    constructor(data, start) {
      this.data = data;
      this.position = start;
      this.bits = 0;
      this.count = 0;
    }

    take(needed) {
      let value = this.bits;
      while (this.count < needed) {
        if (this.position >= this.data.length) throw new FinaleMusError("MUS 압축 데이터가 중간에서 끝났습니다.", "mus.dcl_truncated");
        value += this.data[this.position] * (2 ** this.count);
        this.position += 1;
        this.count += 8;
      }
      this.bits = Math.floor(value / (2 ** needed));
      this.count -= needed;
      return value & ((2 ** needed) - 1);
    }

    decode(table) {
      let code = 0;
      let first = 0;
      let index = 0;
      for (let length = 1; length < MAX_CODE_BITS; length += 1) {
        code |= this.take(1) ^ 1;
        const count = table.count[length];
        if (code < first + count) return table.symbol[index + (code - first)];
        index += count;
        first = (first + count) << 1;
        code <<= 1;
      }
      throw new FinaleMusError("MUS 압축 코드가 올바르지 않습니다.", "mus.dcl_code");
    }
  }

  function blastDecompress(data, maxOutput) {
    if (data.length < 2) throw new FinaleMusError("MUS 압축 헤더가 없습니다.", "mus.dcl_header");
    const literalFlag = data[0];
    const dictionaryBits = data[1];
    if (literalFlag !== 0 && literalFlag !== 1) throw new FinaleMusError("지원하지 않는 MUS 압축 방식입니다.", "mus.dcl_literal");
    if (![4, 5, 6].includes(dictionaryBits)) throw new FinaleMusError("지원하지 않는 MUS 사전 크기입니다.", "mus.dcl_dictionary");

    const reader = new BitReader(data, 2);
    const output = [];
    while (true) {
      if (reader.take(1)) {
        const lengthSymbol = reader.decode(LENGTH_CODE);
        const length = LEN_BASE[lengthSymbol] + reader.take(LEN_EXTRA[lengthSymbol]);
        if (length === END_OF_STREAM) return Uint8Array.from(output);
        const distanceSymbol = reader.decode(DISTANCE_CODE);
        const distance = (length === 2
          ? (distanceSymbol << 2) + reader.take(2)
          : (distanceSymbol << dictionaryBits) + reader.take(dictionaryBits)) + 1;
        if (distance > output.length) throw new FinaleMusError("MUS 압축 참조가 데이터 시작 이전을 가리킵니다.", "mus.dcl_distance");
        const source = output.length - distance;
        for (let i = 0; i < length; i += 1) output.push(output[source + i]);
      } else {
        output.push(literalFlag ? reader.decode(LITERAL_CODE) : reader.take(8));
      }
      if (output.length > maxOutput) throw new FinaleMusError("MUS 압축 해제 크기가 제한을 초과했습니다.", "mus.too_large");
    }
  }

  // --- Finale DCL container and records ------------------------------------
  function containerByteOrder(bytes) {
    if (bytes.length < CONTAINER_START + EMPTY_RECORD) throw new FinaleMusError("MUS 파일이 너무 짧습니다.", "mus.truncated");
    if (readU16(bytes, CONTAINER_START, "big") === POOL_OTHERS) return "big";
    if (readU16(bytes, CONTAINER_START, "little") === POOL_OTHERS) return "little";
    throw new FinaleMusError("현재 지원 가능한 구형 Finale ENIGMA BINARY MUS 형식이 아닙니다.", "mus.unsupported_version");
  }

  function readDclPools(bytes) {
    const order = containerByteOrder(bytes);
    const pools = new Map();
    let position = CONTAINER_START;
    let decodedTotal = 0;
    let recordCount = 0;
    while (position < bytes.length) {
      if (++recordCount > 64) throw new FinaleMusError("MUS 풀 레코드가 비정상적으로 많습니다.", "mus.pool_count");
      if (position + EMPTY_RECORD > bytes.length) throw new FinaleMusError("MUS 풀 레코드가 잘렸습니다.", "mus.truncated");
      const kind = readU16(bytes, position, order);
      const length = readU32(bytes, position + 2, order);
      if (length < EMPTY_RECORD || position + length > bytes.length) throw new FinaleMusError("MUS 풀 길이가 파일 범위를 벗어납니다.", "mus.pool_length");
      let payload = new Uint8Array();
      if (length !== EMPTY_RECORD) {
        if (length < RECORD_HEADER) throw new FinaleMusError("MUS 풀 헤더 길이가 올바르지 않습니다.", "mus.pool_header");
        const compressed = bytes.subarray(position + RECORD_HEADER, position + length);
        payload = blastDecompress(compressed, MAX_DECODED_BYTES - decodedTotal);
        decodedTotal += payload.length;
      }
      pools.set(kind, { kind, order, data: payload });
      position += length;
    }
    if (!pools.has(POOL_OTHERS) || !pools.has(POOL_DETAILS) || !pools.has(POOL_ENTRIES)) {
      throw new FinaleMusError("MUS 파일에 필요한 악보 데이터 풀이 없습니다.", "mus.pool_missing");
    }
    return { order, pools };
  }


  // --- Later legacy Finale zlib container ----------------------------------
  // Some Finale/NotePad/PrintMusic .mus files use four unlabeled zlib streams
  // instead of the labelled DCL pools above. Each stream is followed by the
  // same 10-byte framing header. The first stream must be found by scanning;
  // every following stream is reached from the exact end of the previous one.
  function isZlibHeader(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) return false;
    const cmf = bytes[offset];
    const flg = bytes[offset + 1];
    return (cmf & 0x0f) === 8 && (((cmf << 8) | flg) % 31) === 0;
  }

  function inflateZlibStream(bytes, offset, budget) {
    const pako = window.pako;
    if (!pako?.Inflate) {
      throw new FinaleMusError("MUS 압축 해제 모듈을 불러오지 못했습니다.", "mus.zlib_module");
    }
    const inflater = new pako.Inflate();
    inflater.push(bytes.subarray(offset), true);
    if (inflater.err) {
      throw new FinaleMusError(`MUS zlib 압축을 해제하지 못했습니다: ${inflater.msg || inflater.err}`, "mus.zlib_decode");
    }
    const result = inflater.result instanceof Uint8Array
      ? inflater.result
      : new Uint8Array(inflater.result || []);
    if (result.length > budget) {
      throw new FinaleMusError("MUS 압축 해제 크기가 제한을 초과했습니다.", "mus.too_large");
    }
    const consumed = Number(inflater.strm?.next_in || 0);
    if (!consumed) {
      throw new FinaleMusError("MUS zlib 스트림 길이를 확인하지 못했습니다.", "mus.zlib_length");
    }
    return { data: result, consumed };
  }

  function findFirstZlibStream(bytes) {
    for (let offset = CONTAINER_START; offset + 2 <= bytes.length; offset += 1) {
      if (!isZlibHeader(bytes, offset)) continue;
      try {
        const decoded = inflateZlibStream(bytes, offset, MAX_DECODED_BYTES);
        if (decoded.data.length >= 4096) return offset;
      } catch (_) {
        // A chance byte pair can satisfy the two-byte zlib header rule.
      }
    }
    return -1;
  }

  function readZlibStreams(bytes) {
    const first = findFirstZlibStream(bytes);
    if (first < 0) throw new FinaleMusError("MUS 파일에서 zlib 데이터 풀을 찾지 못했습니다.", "mus.zlib_missing");
    const streams = [];
    let decodedTotal = 0;
    let position = first;
    while (position + 2 <= bytes.length && isZlibHeader(bytes, position)) {
      if (streams.length >= 64) throw new FinaleMusError("MUS 데이터 풀이 비정상적으로 많습니다.", "mus.pool_count");
      const decoded = inflateZlibStream(bytes, position, MAX_DECODED_BYTES - decodedTotal);
      streams.push(decoded.data);
      decodedTotal += decoded.data.length;
      const end = position + Math.max(1, decoded.consumed);
      if (isZlibHeader(bytes, end + RECORD_HEADER)) position = end + RECORD_HEADER;
      else if (isZlibHeader(bytes, end)) position = end;
      else break;
    }
    if (!streams.length) throw new FinaleMusError("MUS zlib 데이터 풀이 비어 있습니다.", "mus.pool_missing");
    return streams;
  }

  const VARIABLE_PADDING = new Set([0x0000, 0xffff]);
  const VARIABLE_MAX_PAYLOAD = 1024 * 1024;
  const VARIABLE_MIN_RECORDS = 50;

  function walkVariableOthers(stream) {
    const records = [];
    let position = 0;
    while (position + 10 <= stream.length) {
      const tag = readU16(stream, position, "little");
      if (VARIABLE_PADDING.has(tag)) {
        position += 2;
        continue;
      }
      const length = readU32(stream, position + 6, "little");
      const payloadStart = position + 10;
      const payloadEnd = payloadStart + length;
      if (length > VARIABLE_MAX_PAYLOAD || payloadEnd + 4 > stream.length) return null;
      const extraLength = readU32(stream, payloadEnd, "little");
      const end = payloadEnd + 4 + extraLength;
      if (extraLength > VARIABLE_MAX_PAYLOAD || end > stream.length || records.length >= 1_000_000) return null;
      records.push({
        tag,
        cmper: readU16(stream, position + 2, "little"),
        part: readU16(stream, position + 4, "little"),
        payload: stream.slice(payloadStart, payloadEnd),
      });
      position = end;
    }
    return records.length >= VARIABLE_MIN_RECORDS ? records : null;
  }

  function walkVariableDetails(stream) {
    const records = [];
    let position = 0;
    while (position + 12 <= stream.length) {
      const tag = readU16(stream, position, "little");
      if (VARIABLE_PADDING.has(tag)) {
        position += 2;
        continue;
      }
      const length = readU32(stream, position + 8, "little");
      const payloadStart = position + 12;
      const payloadEnd = payloadStart + length;
      if (length > VARIABLE_MAX_PAYLOAD || payloadEnd + 4 > stream.length) return null;
      const extraLength = readU32(stream, payloadEnd, "little");
      const end = payloadEnd + 4 + extraLength;
      if (extraLength > VARIABLE_MAX_PAYLOAD || end > stream.length || records.length >= 1_000_000) return null;
      records.push({
        tag,
        cmper: readU16(stream, position + 2, "little"),
        cmper2: readU16(stream, position + 4, "little"),
        inci: readU16(stream, position + 6, "little"),
        payload: stream.slice(payloadStart, payloadEnd),
      });
      position = end;
    }
    return records.length >= VARIABLE_MIN_RECORDS ? records : null;
  }

  function tryReadEntryPool(stream, order = "little") {
    try {
      return readEntries(stream, order);
    } catch (_) {
      return null;
    }
  }

  function readZlibScorePools(bytes) {
    const streams = readZlibStreams(bytes);
    let entries = null;
    let others = null;
    let details = null;
    for (const stream of streams) {
      if (!others) others = walkVariableOthers(stream);
      if (!details) details = walkVariableDetails(stream);
      if (!entries) entries = tryReadEntryPool(stream, "little");
    }
    if (!entries || !others || !details) {
      throw new FinaleMusError("MUS 파일에서 악보 데이터 풀을 식별하지 못했습니다.", "mus.pool_missing");
    }
    return { family: "zlib", order: "little", entries, others, details };
  }

  function readScorePools(bytes) {
    try {
      const { order, pools } = readDclPools(bytes);
      return {
        family: "dcl",
        order,
        entries: readEntries(pools.get(POOL_ENTRIES).data, order),
        others: readRows(pools.get(POOL_OTHERS).data, order, 4),
        details: readRows(pools.get(POOL_DETAILS).data, order, 6),
      };
    } catch (dclError) {
      try {
        return readZlibScorePools(bytes);
      } catch (zlibError) {
        const message = zlibError instanceof Error ? zlibError.message : String(zlibError || "");
        throw new FinaleMusError(`지원되는 Finale MUS 데이터 구조를 찾지 못했습니다. ${message}`.trim(), "mus.unsupported_version");
      }
    }
  }

  function decodeTag(pair, order) {
    return order === "big"
      ? String.fromCharCode(pair[0], pair[1])
      : String.fromCharCode(pair[1], pair[0]);
  }

  function readRows(pool, order, dataOffset) {
    if (pool.length % ROW_SIZE) throw new FinaleMusError("MUS 레코드 풀이 16바이트 행으로 정렬되지 않았습니다.", "mus.row_alignment");
    const result = new Map();
    for (let offset = 0; offset < pool.length; offset += ROW_SIZE) {
      const row = pool.subarray(offset, offset + ROW_SIZE);
      const cmper = readU16(row, 0, order);
      const cmper2 = dataOffset === 6 ? readU16(row, 2, order) : 0;
      const tag = decodeTag(row.subarray(dataOffset - 2, dataOffset), order);
      const key = dataOffset === 6 ? `${tag}\u0000${cmper}\u0000${cmper2}` : `${tag}\u0000${cmper}`;
      let record = result.get(key);
      if (!record) {
        record = { tag, cmper, cmper2, chunks: [], incidences: 0 };
        result.set(key, record);
      }
      record.chunks.push(row.slice(dataOffset));
      record.incidences += 1;
    }
    for (const record of result.values()) {
      const length = record.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const payload = new Uint8Array(length);
      let at = 0;
      for (const chunk of record.chunks) {
        payload.set(chunk, at);
        at += chunk.length;
      }
      record.payload = payload;
      delete record.chunks;
    }
    return [...result.values()];
  }

  function entrySlotSpan(noteCount) {
    const overflow = Math.max(noteCount - 2, 0);
    return 1 + Math.ceil(overflow / 5);
  }

  function noteOffsets(base, count) {
    const offsets = [];
    for (let i = 0; i < Math.min(count, 2); i += 1) offsets.push(base + 26 + i * 6);
    let remaining = count - 2;
    let slot = 1;
    while (remaining > 0) {
      const start = base + ENTRY_SLOT_SIZE * slot + 6;
      const take = Math.min(remaining, 5);
      for (let i = 0; i < take; i += 1) offsets.push(start + i * 6);
      remaining -= take;
      slot += 1;
    }
    return offsets;
  }

  function readEntries(pool, order) {
    if (!pool.length || pool.length % ENTRY_SLOT_SIZE) throw new FinaleMusError("MUS 엔트리 풀이 올바른 38바이트 슬롯 구조가 아닙니다.", "mus.entry_alignment");
    const entries = new Map();
    let position = 0;
    while (position + ENTRY_SLOT_SIZE <= pool.length) {
      if (readU16(pool, position + 4, order) !== 0) throw new FinaleMusError("MUS 엔트리 첫 슬롯 번호가 0이 아닙니다.", "mus.entry_slot");
      const flag = readU32(pool, position + 18, order);
      if ((flag & ENTRY_SETBIT) === 0) throw new FinaleMusError("MUS 엔트리 플래그가 올바르지 않습니다.", "mus.entry_flag");
      const storedCount = readU16(pool, position + 24, order);
      if (storedCount > 12) throw new FinaleMusError("MUS 화음의 음표 수가 지원 범위를 초과했습니다.", "mus.note_count");
      const noteCount = flag & ENTRY_FLOATREST ? 0 : storedCount;
      const notes = noteOffsets(position, noteCount).map((offset) => {
        if (offset + 6 > pool.length) throw new FinaleMusError("MUS 음표 레코드가 잘렸습니다.", "mus.truncated");
        const tcd = readU16(pool, offset, order);
        const noteFlag = readU32(pool, offset + 2, order);
        const magnitude = tcd & 0x07;
        return {
          harmLev: signedBits(tcd >> 4, 12),
          harmAlt: tcd & 0x08 ? -magnitude : magnitude,
          tieStart: Boolean(noteFlag & NOTE_TIE_START),
          tieEnd: Boolean(noteFlag & NOTE_TIE_END),
        };
      });
      const entnum = readU32(pool, position, order);
      const durationEdu = readU16(pool, position + 14, order);
      if (!durationEdu) throw new FinaleMusError(`MUS 엔트리 ${entnum}의 길이가 0입니다.`, "mus.entry_duration");
      entries.set(entnum, {
        entnum,
        prev: readU32(pool, position + 6, order),
        next: readU32(pool, position + 10, order),
        durationEdu,
        isGrace: Boolean(flag & ENTRY_GRACE),
        notes,
      });
      position += ENTRY_SLOT_SIZE * entrySlotSpan(storedCount);
    }
    return entries;
  }

  function parseFinaleMus(value, fileName = "score.mus") {
    const normalized = normalizeFinaleMusContainer(value);
    if (!normalized) throw new FinaleMusError("Finale ENIGMA BINARY MUS 파일이 아닙니다.", "mus.header");
    const bytes = normalized.bytes;
    if (bytes.length > MAX_INPUT_BYTES) throw new FinaleMusError("MUS 파일이 너무 큽니다.", "mus.too_large");

    const decoded = readScorePools(bytes);
    const { family, order, entries, others, details } = decoded;
    const isDcl = family === "dcl";
    const isTag = (record, dclTag, variableTag) => record.tag === (isDcl ? dclTag : variableTag);

    const staffSpecs = new Map();
    const measureSpecs = new Map();
    const frames = new Map();
    const dclStaffRecords = isDcl ? others.filter((record) => record.tag === "IS") : [];
    const dclFrameBase = dclStaffRecords.length && dclStaffRecords[0].incidences === 3 ? 4 : 6;
    let variableStaffOrder = [];

    for (const record of others) {
      if (!isDcl && record.part) continue;
      if (isTag(record, "IS", 231)) {
        let adjust = 0;
        if (record.payload.length >= 22) {
          const raw = readU16(record.payload, 20, order);
          const magnitude = raw & 0x07;
          adjust = raw & 0x08 ? -magnitude : magnitude;
        }
        staffSpecs.set(record.cmper, { adjust });
      } else if (isTag(record, "MS", 176)) {
        if (record.payload.length < 8) continue;
        measureSpecs.set(record.cmper, {
          number: record.cmper,
          keyRaw: readU16(record.payload, 2, order),
          beats: readU16(record.payload, 4, order) || 4,
          divbeat: readU16(record.payload, 6, order) || 1024,
        });
      } else if (isTag(record, "FR", 146)) {
        const incidences = isDcl ? record.incidences : Math.floor(record.payload.length / 12);
        if (incidences < 1 || record.payload.length < incidences * 12) continue;
        const base = (incidences - 1) * 12;
        const startEntry = readU32(record.payload, base, order);
        const endEntry = readU32(record.payload, base + 4, order);
        const startTimeEdu = incidences > 1 ? readU32(record.payload, 0, order) : 0;
        if (entries.has(startEntry) && entries.has(endEntry)) {
          frames.set(record.cmper, { startEntry, endEntry, startTimeEdu });
        }
      } else if (!isDcl && record.tag === 159 && record.cmper === 0 && record.payload.length >= 24) {
        const orderIds = [];
        for (let offset = 0; offset + 24 <= record.payload.length; offset += 24) {
          const staff = readU16(record.payload, offset, "little");
          if (staff && !orderIds.includes(staff)) orderIds.push(staff);
        }
        if (orderIds.length) variableStaffOrder = orderIds;
      }
    }

    const placements = [];
    const layerLengths = new Map();
    const staffIds = new Set();
    for (const record of details) {
      if (!isTag(record, "GF", 1044) || record.cmper === 32767) continue;
      const staff = record.cmper;
      const measure = record.cmper2;
      staffIds.add(staff);
      const layerOffsets = isDcl
        ? [0, 1, 2, 3].map((index) => dclFrameBase + index * 2)
        : [6, 8];
      for (let layer = 0; layer < layerOffsets.length; layer += 1) {
        const offset = layerOffsets[layer];
        if (offset + 2 > record.payload.length) continue;
        const frameNumber = readU16(record.payload, offset, order);
        const frame = frames.get(frameNumber);
        if (!frame) continue;
        let entnum = frame.startEntry;
        let localEdu = frame.startTimeEdu || 0;
        const visited = new Set();
        for (let step = 0; step < MAX_CHAIN_STEPS; step += 1) {
          const entry = entries.get(entnum);
          if (!entry || visited.has(entnum)) break;
          visited.add(entnum);
          const soundedEdu = entry.isGrace ? 0 : entry.durationEdu;
          placements.push({ staff, measure, layer: layer + 1, localEdu, entry });
          localEdu += soundedEdu;
          if (entnum === frame.endEntry) break;
          entnum = entry.next;
        }
        const key = `${staff}:${measure}:${layer + 1}`;
        layerLengths.set(key, Math.max(layerLengths.get(key) || 0, localEdu));
      }
    }

    if (!placements.some((item) => item.entry.notes.length)) {
      throw new FinaleMusError("MUS 악보에서 재생 가능한 음표를 찾지 못했습니다.", "mus.no_notes");
    }

    const measureNumbers = new Set([...measureSpecs.keys(), ...placements.map((item) => item.measure)]);
    const minMeasure = Math.min(...measureNumbers);
    const maxMeasure = Math.max(...measureNumbers);
    const measures = new Map();
    let currentBeats = 4;
    let currentDivbeat = 1024;
    let currentKeyRaw = 0;
    let absoluteEdu = 0;
    for (let number = minMeasure; number <= maxMeasure; number += 1) {
      const explicit = measureSpecs.get(number);
      if (explicit) {
        currentBeats = explicit.beats || currentBeats;
        currentDivbeat = explicit.divbeat || currentDivbeat;
        currentKeyRaw = explicit.keyRaw || 0;
      }
      let contentEdu = 0;
      for (const staff of staffIds) {
        const layerCount = isDcl ? 4 : 2;
        for (let layer = 1; layer <= layerCount; layer += 1) {
          contentEdu = Math.max(contentEdu, layerLengths.get(`${staff}:${number}:${layer}`) || 0);
        }
      }
      const nominalEdu = currentBeats * currentDivbeat;
      const lengthEdu = Math.max(nominalEdu, contentEdu);
      measures.set(number, {
        number,
        startEdu: absoluteEdu,
        lengthEdu,
        beats: currentBeats,
        divbeat: currentDivbeat,
        keyRaw: currentKeyRaw,
      });
      absoluteEdu += lengthEdu;
    }

    const numericStaffIds = [...staffIds].sort((a, b) => a - b);
    const orderedStaffIds = variableStaffOrder.length
      ? [...variableStaffOrder.filter((staff) => staffIds.has(staff)), ...numericStaffIds.filter((staff) => !variableStaffOrder.includes(staff))]
      : numericStaffIds;

    return {
      fileName,
      title: String(fileName || "score").replace(/\.mus$/i, ""),
      family,
      order,
      entries,
      placements,
      measures,
      staffIds: orderedStaffIds,
      staffSpecs,
      durationEdu: absoluteEdu,
      container: { ...normalized.metadata },
    };
  }

  // --- Common notation and MIDI generation ---------------------------------
  function eduToTicks(edu) {
    return Math.max(0, Math.round((Number(edu) || 0) * core.DEFAULT_PPQ / 1024));
  }

  function musToMidiBytes(value, fileName = "score.mus") {
    const score = parseFinaleMus(value, fileName);
    const timeSignatures = [];
    const keySignatures = [];
    for (const measure of score.measures.values()) {
      const tick = eduToTicks(measure.startEdu);
      timeSignatures.push({ tick, ...notation.finaleTimeSignature(measure.beats, measure.divbeat, WHOLE_EDU) });
      const key = notation.adjustFinaleKey(measure.keyRaw, 0);
      keySignatures.push({ tick, sharps: key.fifths, minor: key.minor });
    }

    const tracks = [];
    score.staffIds.forEach((staff, staffIndex) => {
      const notes = [];
      const activeTies = new Map();
      const placements = score.placements
        .filter(item => item.staff === staff)
        .sort((a, b) => a.measure - b.measure || a.layer - b.layer || a.localEdu - b.localEdu || a.entry.entnum - b.entry.entnum);

      for (const placement of placements) {
        const measure = score.measures.get(placement.measure);
        if (!measure) continue;
        const staffAdjust = score.staffSpecs.get(staff)?.adjust || 0;
        const key = notation.adjustFinaleKey(measure.keyRaw, staffAdjust);
        const startTick = eduToTicks(measure.startEdu + placement.localEdu);
        const endTick = startTick + (placement.entry.isGrace ? 1 : Math.max(1, eduToTicks(placement.entry.durationEdu)));
        for (const sourceNote of placement.entry.notes) {
          const pitch = notation.finalePitchToMidi(sourceNote.harmLev, sourceNote.harmAlt, key, 60);
          const tieKey = `${placement.layer}:${pitch}`;
          if (sourceNote.tieEnd && activeTies.has(tieKey)) {
            const previous = activeTies.get(tieKey);
            previous.endTick = Math.max(previous.endTick, endTick);
            if (!sourceNote.tieStart) activeTies.delete(tieKey);
            continue;
          }
          // The legacy MUS parser currently cannot recover playback dynamics
          // reliably. Use the project-wide 75% fallback instead of guessing.
          const note = { startTick, endTick, pitch, velocity: core.DEFAULT_VELOCITY };
          notes.push(note);
          if (sourceNote.tieStart) activeTies.set(tieKey, note);
        }
      }
      if (notes.length) tracks.push({ name: `Staff ${staff}`, program: 0, channel: root.MabiMidiParser.defaultMelodicChannel(staffIndex), notes });
    });

    if (!tracks.length) throw new FinaleMusError("MUS 악보에서 재생 가능한 음표를 찾지 못했습니다.", "mus.no_notes");
    return core.buildMidi({
      ppq: core.DEFAULT_PPQ,
      title: score.title,
      tempoEvents: [{ tick: 0, bpm: DEFAULT_BPM }],
      timeSignatures: notation.dedupeTimedEvents(timeSignatures, event => `${event.numerator}/${event.denominator}`),
      keySignatures: notation.dedupeTimedEvents(keySignatures, event => `${event.sharps}:${event.minor}`),
      tracks,
    });
  }

  root.MabiFinaleMus = Object.freeze({
    version: "5.1.0",
    FinaleMusError,
    normalizeContainer: normalizeFinaleMusContainer,
    isFinaleMusBytes,
    parseFinaleMus,
    musToMidiBytes,
  });
})();
