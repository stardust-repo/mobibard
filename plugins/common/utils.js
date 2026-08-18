(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;

  function clamp(value, min, max) {
    const number = Number(value);
    const lower = Number(min);
    const upper = Number(max);
    return Math.max(lower, Math.min(upper, Number.isFinite(number) ? number : lower));
  }

  function clampInt(value, min, max, fallback = min) {
    const number = Number(value);
    const safe = Number.isFinite(number) ? Math.round(number) : Math.round(Number(fallback));
    return Math.max(Number(min), Math.min(Number(max), safe));
  }

  function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value == null) return new Uint8Array();
    return new Uint8Array(value);
  }

  function copyUint8Array(value) {
    return new Uint8Array(toUint8Array(value));
  }


  const MACBINARY_HEADER_SIZE = 128;

  function asciiAt(value, offset, text) {
    const bytes = toUint8Array(value);
    const expected = String(text || "");
    if (offset < 0 || offset + expected.length > bytes.length) return false;
    for (let index = 0; index < expected.length; index++) {
      if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
    }
    return true;
  }

  function readUint16BE(bytes, offset) {
    const view = toUint8Array(bytes);
    if (offset < 0 || offset + 2 > view.length) return null;
    return ((view[offset] << 8) | view[offset + 1]) >>> 0;
  }

  function readUint32BE(bytes, offset) {
    const view = toUint8Array(bytes);
    if (offset < 0 || offset + 4 > view.length) return null;
    return (((view[offset] << 24) >>> 0)
      | (view[offset + 1] << 16)
      | (view[offset + 2] << 8)
      | view[offset + 3]) >>> 0;
  }

  function roundUp128(value) {
    const length = Math.max(0, Math.trunc(Number(value) || 0));
    return Math.ceil(length / 128) * 128;
  }

  function macBinaryCrc16(value, length = 124) {
    const bytes = toUint8Array(value);
    const end = Math.min(bytes.length, Math.max(0, Math.trunc(Number(length) || 0)));
    let crc = 0;
    for (let index = 0; index < end; index++) {
      crc ^= bytes[index] << 8;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xffff;
      }
    }
    return crc;
  }

  function inspectMacBinary(value) {
    const bytes = toUint8Array(value);
    if (bytes.length < MACBINARY_HEADER_SIZE || bytes[0] !== 0) return null;

    const fileNameLength = bytes[1] || 0;
    if (fileNameLength < 1 || fileNameLength > 63) return null;
    if (bytes[74] !== 0 || bytes[82] !== 0) return null;
    for (let index = 0; index < fileNameLength; index++) {
      const byte = bytes[2 + index];
      if (byte === 0 || byte < 0x20 || byte === 0x7f) return null;
    }

    const dataForkLength = readUint32BE(bytes, 83);
    const resourceForkLength = readUint32BE(bytes, 87);
    const secondaryHeaderLength = readUint16BE(bytes, 120) || 0;
    if (dataForkLength == null || resourceForkLength == null) return null;
    if (dataForkLength === 0 && resourceForkLength === 0) return null;

    const dataForkStart = MACBINARY_HEADER_SIZE + roundUp128(secondaryHeaderLength);
    const dataForkEnd = dataForkStart + dataForkLength;
    if (dataForkStart > bytes.length || dataForkEnd > bytes.length) return null;

    const resourceForkStart = dataForkStart + roundUp128(dataForkLength);
    const resourceForkEnd = resourceForkStart + resourceForkLength;
    if (resourceForkLength > 0 && resourceForkEnd > bytes.length) return null;

    const nameBytes = bytes.subarray(2, 2 + fileNameLength);
    const fileName = decodeText(nameBytes, ["macintosh", "windows-1252", "utf-8"]) || "Classic Mac file";
    const storedCrc = readUint16BE(bytes, 124);
    const calculatedCrc = macBinaryCrc16(bytes, 124);
    const version = bytes[122] || 0;
    const minimumVersion = bytes[123] || 0;

    return {
      bytes,
      fileName,
      fileType: Array.from(bytes.subarray(65, 69), byte => String.fromCharCode(byte)).join(""),
      creator: Array.from(bytes.subarray(69, 73), byte => String.fromCharCode(byte)).join(""),
      dataForkLength,
      resourceForkLength,
      secondaryHeaderLength,
      dataForkStart,
      dataForkEnd,
      resourceForkStart,
      resourceForkEnd,
      dataFork: bytes.subarray(dataForkStart, dataForkEnd),
      resourceFork: resourceForkLength > 0 ? bytes.subarray(resourceForkStart, resourceForkEnd) : new Uint8Array(),
      version,
      minimumVersion,
      headerCrc: storedCrc,
      headerCrcValid: storedCrc == null || storedCrc === 0 ? null : storedCrc === calculatedCrc,
    };
  }

  function looksLikeMacBinary(value) {
    return Boolean(inspectMacBinary(value));
  }

  function matchesByteSignature(value, signature) {
    const bytes = toUint8Array(value);
    if (signature == null || signature === "") return true;
    if (typeof signature === "function") return Boolean(signature(bytes));
    const signatures = Array.isArray(signature) ? signature : [signature];
    return signatures.some(item => {
      if (typeof item === "function") return Boolean(item(bytes));
      return asciiAt(bytes, 0, String(item || ""));
    });
  }

  function macBinaryForkCandidates(value, options = {}) {
    const source = toUint8Array(value);
    const info = inspectMacBinary(source);
    if (!info) {
      if (!matchesByteSignature(source, options.signature)) return [];
      return [{
        bytes: source,
        fork: "raw",
        metadata: {
          macBinary: false,
          selectedFork: "raw",
          dataForkLength: source.length,
          resourceForkLength: 0,
        },
      }];
    }

    const ordered = options.preferResource === true
      ? [["resource", info.resourceFork], ["data", info.dataFork]]
      : [["data", info.dataFork], ["resource", info.resourceFork]];
    const candidates = [];
    for (const [fork, forkBytes] of ordered) {
      if (!forkBytes.length || !matchesByteSignature(forkBytes, options.signature)) continue;
      candidates.push({
        bytes: forkBytes,
        fork,
        metadata: {
          macBinary: true,
          selectedFork: fork,
          fileName: info.fileName,
          fileType: info.fileType,
          creator: info.creator,
          dataForkLength: info.dataForkLength,
          resourceForkLength: info.resourceForkLength,
          secondaryHeaderLength: info.secondaryHeaderLength,
          version: info.version,
          minimumVersion: info.minimumVersion,
          headerCrcValid: info.headerCrcValid,
        },
      });
    }
    return candidates;
  }

  function unwrapMacBinary(value, options = {}) {
    const source = toUint8Array(value);
    const info = inspectMacBinary(source);
    if (!info) {
      return {
        bytes: source,
        metadata: {
          macBinary: false,
          selectedFork: "raw",
          dataForkLength: source.length,
          resourceForkLength: 0,
        },
      };
    }
    const candidate = macBinaryForkCandidates(source, options)[0];
    if (!candidate) {
      return {
        bytes: source,
        metadata: {
          macBinary: false,
          selectedFork: "raw",
          dataForkLength: source.length,
          resourceForkLength: 0,
        },
      };
    }
    return { bytes: candidate.bytes, metadata: candidate.metadata };
  }

  function extractMacBinaryDataFork(value, options = {}) {
    const info = inspectMacBinary(value);
    if (!info || !info.dataFork.length || !matchesByteSignature(info.dataFork, options.signature)) return null;
    return {
      bytes: info.dataFork,
      dataForkLength: info.dataForkLength,
      resourceForkLength: info.resourceForkLength,
      secondaryHeaderLength: info.secondaryHeaderLength,
      fileName: info.fileName,
      fileType: info.fileType,
      creator: info.creator,
      selectedFork: "data",
      headerCrcValid: info.headerCrcValid,
      macBinary: true,
    };
  }

  function extractMacBinaryResourceFork(value, options = {}) {
    const info = inspectMacBinary(value);
    if (!info || !info.resourceFork.length || !matchesByteSignature(info.resourceFork, options.signature)) return null;
    return {
      bytes: info.resourceFork,
      dataForkLength: info.dataForkLength,
      resourceForkLength: info.resourceForkLength,
      secondaryHeaderLength: info.secondaryHeaderLength,
      fileName: info.fileName,
      fileType: info.fileType,
      creator: info.creator,
      selectedFork: "resource",
      headerCrcValid: info.headerCrcValid,
      macBinary: true,
    };
  }

  function unique(values) {
    return [...new Set(values || [])];
  }

  function formatTime(seconds, fractionDigits = 2) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const digits = clampInt(fractionDigits, 0, 3);
    const scale = 10 ** digits;
    const totalUnits = Math.round(safeSeconds * scale);
    const minutes = Math.floor(totalUnits / (60 * scale));
    const wholeSeconds = Math.floor((totalUnits % (60 * scale)) / scale);
    if (!digits) return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
    const fraction = totalUnits % scale;
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(fraction).padStart(digits, "0")}`;
  }

  function composeMml(parts, options = {}) {
    const raw = Array.from(parts || []).map(value => String(value || "").trim());
    const list = options.preserveEmpty
      ? raw.slice(0, options.partCount || raw.length || 0)
      : raw.filter(Boolean);
    return `MML@${list.join(",")};`;
  }

  function shortError(error, maxLength = 520) {
    const message = error?.message || String(error);
    const limit = Math.max(32, Number(maxLength) || 520);
    return message.length > limit ? `${message.slice(0, limit)}...` : message;
  }

  function base64ToUint8Array(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
    return output;
  }

  function decodeText(value, encodings = ["utf-8", "shift_jis", "windows-1252"]) {
    const bytes = toUint8Array(value);
    if (!bytes.length) return "";
    let candidates = Array.isArray(encodings) ? encodings.slice() : [encodings];
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      candidates = ["utf-8", ...candidates];
    } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      candidates = ["utf-16le", ...candidates];
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      candidates = ["utf-16be", ...candidates];
    }
    candidates = unique(candidates.map(value => String(value || "").trim()).filter(Boolean));
    let best = "";
    let bestReplacement = Infinity;
    for (const encoding of candidates) {
      try {
        const text = new TextDecoder(encoding, { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
        const replacement = (text.match(/\uFFFD/g) || []).length;
        if (replacement < bestReplacement) {
          best = text;
          bestReplacement = replacement;
        }
        if (replacement === 0) break;
      } catch (_) {}
    }
    return best;
  }

  function decodeXml(value) {
    const bytes = toUint8Array(value);
    const asciiHead = Array.from(bytes.subarray(0, Math.min(320, bytes.length)), byte => String.fromCharCode(byte)).join("");
    const declared = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(asciiHead)?.[1];
    const encodings = declared
      ? [declared, "utf-8", "utf-16le", "utf-16be", "shift_jis", "windows-1252"]
      : ["utf-8", "utf-16le", "utf-16be", "shift_jis", "windows-1252"];
    return decodeText(bytes, encodings);
  }

  function parseXml(value, fileName = "XML") {
    const text = typeof value === "string" ? value : decodeXml(value);
    if (typeof DOMParser !== "function") throw new Error("XML 파서를 사용할 수 없는 실행 환경입니다.");
    const documentNode = new DOMParser().parseFromString(text, "application/xml");
    const errors = Array.from(documentNode.getElementsByTagName?.("parsererror") || []);
    if (errors.length) {
      const detail = String(errors[0].textContent || "").replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(`${fileName} XML을 해석하지 못했습니다${detail ? `: ${detail}` : ""}.`);
    }
    return documentNode;
  }

  function localName(node) {
    return String(node?.localName || node?.nodeName || "").replace(/^.*:/, "").toLowerCase();
  }

  function descendantsByLocalName(rootNode, name) {
    const expected = String(name || "").toLowerCase();
    return Array.from(rootNode?.getElementsByTagName?.("*") || []).filter(node => localName(node) === expected);
  }

  function firstDescendantByLocalName(rootNode, name) {
    return descendantsByLocalName(rootNode, name)[0] || null;
  }

  function childrenByLocalName(rootNode, name) {
    const expected = String(name || "").toLowerCase();
    return Array.from(rootNode?.children || []).filter(node => localName(node) === expected);
  }

  function childByLocalName(rootNode, name) {
    return childrenByLocalName(rootNode, name)[0] || null;
  }

  function childText(rootNode, names, fallback = "") {
    for (const name of Array.isArray(names) ? names : [names]) {
      const child = childByLocalName(rootNode, name);
      const value = String(child?.textContent || "").trim();
      if (value !== "") return value;
    }
    return fallback;
  }

  function looksLikeZip(value) {
    const bytes = toUint8Array(value);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
    const signature = bytes[2] | (bytes[3] << 8);
    return signature === 0x0403 || signature === 0x0605 || signature === 0x0807;
  }

  function readUint16LE(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) throw new Error("압축 파일의 16비트 값을 읽을 수 없습니다.");
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32LE(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) throw new Error("압축 파일의 32비트 값을 읽을 수 없습니다.");
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function requirePako(method) {
    const pako = root.pako;
    if (!pako || typeof pako[method] !== "function") {
      throw new Error(`압축 해제 모듈(pako.${method})을 불러오지 못했습니다.`);
    }
    return pako;
  }

  function inflateRaw(value) {
    return copyUint8Array(requirePako("inflateRaw").inflateRaw(toUint8Array(value)));
  }

  function inflate(value) {
    return copyUint8Array(requirePako("inflate").inflate(toUint8Array(value)));
  }

  function gunzip(value) {
    const pako = root.pako;
    if (pako?.ungzip) return copyUint8Array(pako.ungzip(toUint8Array(value)));
    return inflate(value);
  }

  function unzip(value) {
    const bytes = toUint8Array(value);
    if (!looksLikeZip(bytes)) throw new Error("ZIP 파일 헤더를 찾지 못했습니다.");
    let eocd = -1;
    const minimum = Math.max(0, bytes.length - 0xffff - 22);
    for (let offset = bytes.length - 22; offset >= minimum; offset--) {
      if (readUint32LE(bytes, offset) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw new Error("ZIP 중앙 디렉터리를 찾지 못했습니다.");
    const diskNumber = readUint16LE(bytes, eocd + 4);
    const directoryDisk = readUint16LE(bytes, eocd + 6);
    const entryCount = readUint16LE(bytes, eocd + 10);
    const directorySize = readUint32LE(bytes, eocd + 12);
    let cursor = readUint32LE(bytes, eocd + 16);
    if (diskNumber !== 0 || directoryDisk !== 0 || entryCount === 0xffff || directorySize === 0xffffffff || cursor === 0xffffffff) {
      throw new Error("분할 ZIP 또는 ZIP64 파일은 지원하지 않습니다.");
    }
    if (cursor + directorySize > bytes.length) throw new Error("ZIP 중앙 디렉터리 범위가 올바르지 않습니다.");

    const result = new Map();
    for (let index = 0; index < entryCount; index++) {
      if (cursor + 46 > bytes.length || readUint32LE(bytes, cursor) !== 0x02014b50) {
        throw new Error("ZIP 중앙 디렉터리가 손상되었습니다.");
      }
      const flags = readUint16LE(bytes, cursor + 8);
      const method = readUint16LE(bytes, cursor + 10);
      const compressedSize = readUint32LE(bytes, cursor + 20);
      const uncompressedSize = readUint32LE(bytes, cursor + 24);
      const nameLength = readUint16LE(bytes, cursor + 28);
      const extraLength = readUint16LE(bytes, cursor + 30);
      const commentLength = readUint16LE(bytes, cursor + 32);
      const localOffset = readUint32LE(bytes, cursor + 42);
      const headerEnd = cursor + 46 + nameLength + extraLength + commentLength;
      if (headerEnd > bytes.length) throw new Error("ZIP 항목 이름 범위가 올바르지 않습니다.");
      const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      const encoding = (flags & 0x0800) ? "utf-8" : "utf-8";
      const name = decodeText(nameBytes, [encoding, "windows-1252"]).replace(/\\/g, "/").replace(/^\/+/, "");
      if (localOffset + 30 > bytes.length || readUint32LE(bytes, localOffset) !== 0x04034b50) {
        throw new Error(`ZIP 항목 ${name || index}의 로컬 헤더가 손상되었습니다.`);
      }
      const localNameLength = readUint16LE(bytes, localOffset + 26);
      const localExtraLength = readUint16LE(bytes, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataStart < 0 || dataEnd > bytes.length) throw new Error(`ZIP 항목 ${name || index}의 데이터 범위가 올바르지 않습니다.`);
      const compressed = bytes.subarray(dataStart, dataEnd);
      let data;
      if (method === 0) data = copyUint8Array(compressed);
      else if (method === 8) data = inflateRaw(compressed);
      else throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${method}`);
      if (uncompressedSize !== 0 && data.length !== uncompressedSize) {
        throw new Error(`ZIP 항목 ${name || index}의 압축 해제 크기가 일치하지 않습니다.`);
      }
      result.set(name, data);
      cursor = headerEnd;
    }
    return result;
  }

  function findZipEntry(entries, names, fallback = null) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      if (!name) continue;
      const normalized = String(name).replace(/\\/g, "/").replace(/^\/+/, "");
      if (entries.has(normalized)) return { name: normalized, bytes: entries.get(normalized) };
      const lower = normalized.toLowerCase();
      for (const [entryName, bytes] of entries) {
        if (entryName.toLowerCase() === lower) return { name: entryName, bytes };
      }
    }
    if (typeof fallback === "function") {
      for (const [name, bytes] of entries) if (fallback(name, bytes)) return { name, bytes };
    }
    return null;
  }

  root.MabiUtils = Object.freeze({
    version: "5.0.0",
    clamp,
    clampInt,
    toFiniteNumber,
    toUint8Array,
    copyUint8Array,
    asciiAt,
    readUint16BE,
    readUint32BE,
    inspectMacBinary,
    looksLikeMacBinary,
    macBinaryForkCandidates,
    unwrapMacBinary,
    extractMacBinaryDataFork,
    extractMacBinaryResourceFork,
    unique,
    formatTime,
    composeMml,
    shortError,
    base64ToUint8Array,
    decodeText,
    decodeXml,
    parseXml,
    localName,
    descendantsByLocalName,
    firstDescendantByLocalName,
    childrenByLocalName,
    childByLocalName,
    childText,
    looksLikeZip,
    inflateRaw,
    inflate,
    gunzip,
    unzip,
    findZipEntry,
  });
})();
