(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  if (!utils) throw new Error("utils.js must be loaded before xsf-container.js");

  function bytesOf(value) { return utils.toUint8Array(value); }
  function asciiAt(bytes, offset, text) {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  }
  function findAscii(bytes, text, start = 0) {
    const limit = bytes.length - text.length;
    outer: for (let i = Math.max(0, start); i <= limit; i++) {
      for (let j = 0; j < text.length; j++) if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
      return i;
    }
    return -1;
  }
  function le32(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) return 0;
    return ((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0)) >>> 0);
  }
  function decodeAscii(bytes) {
    let out = "";
    for (const b of bytes) {
      if (!b) break;
      out += String.fromCharCode(b);
    }
    return out;
  }

  function parseTags(bytes, offset) {
    const tags = {};
    if (offset + 5 > bytes.length || !asciiAt(bytes, offset, "[TAG]")) return tags;
    const text = utils.decodeText(bytes.subarray(offset + 5), ["utf-8", "windows-1252"]);
    for (const line of String(text || "").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim().toLowerCase();
      const value = line.slice(eq + 1).trim();
      if (!key) continue;
      if (tags[key] == null) tags[key] = value;
      else tags[key] = `${tags[key]}\n${value}`;
    }
    return tags;
  }

  function parse(value) {
    const bytes = bytesOf(value);
    if (bytes.length < 16 || !asciiAt(bytes, 0, "PSF")) throw new Error("xSF/PSF 헤더를 찾지 못했습니다.");
    const version = bytes[3];
    const reservedSize = le32(bytes, 4);
    const compressedSize = le32(bytes, 8);
    const reservedStart = 16;
    const programStart = reservedStart + reservedSize;
    const programEnd = programStart + compressedSize;
    if (programEnd > bytes.length) throw new Error("xSF 프로그램 영역 길이가 파일을 벗어났습니다.");
    const reserved = utils.copyUint8Array(bytes.subarray(reservedStart, programStart));
    let program = new Uint8Array(0);
    if (compressedSize) {
      try { program = utils.inflate(bytes.subarray(programStart, programEnd)); }
      catch (error) { throw new Error(`xSF 프로그램 압축 해제 실패: ${error?.message || error}`); }
    }
    return {
      version,
      reserved,
      program,
      tags: parseTags(bytes, programEnd),
      hasLibraries: false,
      bytes,
    };
  }

  function libraryNames(tags) {
    const names = [];
    if (tags?._lib) names.push(tags._lib);
    for (let i = 2; i < 100; i++) {
      const value = tags?.[`_lib${i}`];
      if (!value) break;
      names.push(value);
    }
    return names;
  }

  function extractPsf2Files(reserved) {
    const bytes = bytesOf(reserved);
    const output = [];
    const visited = new Set();

    function readFile(offset, unpackedSize, blockSize) {
      if (!unpackedSize) return new Uint8Array(0);
      if (!blockSize) throw new Error("PSF2 파일 블록 크기가 0입니다.");
      const blocks = Math.ceil(unpackedSize / blockSize);
      const tableEnd = offset + blocks * 4;
      if (offset < 0 || tableEnd > bytes.length) throw new Error("PSF2 파일 크기표가 손상되었습니다.");
      let pos = tableEnd;
      const chunks = [];
      let total = 0;
      for (let i = 0; i < blocks; i++) {
        const compressedSize = le32(bytes, offset + i * 4);
        if (!compressedSize || pos + compressedSize > bytes.length) throw new Error("PSF2 압축 블록이 손상되었습니다.");
        const chunk = utils.inflate(bytes.subarray(pos, pos + compressedSize));
        chunks.push(chunk);
        total += chunk.length;
        pos += compressedSize;
      }
      const out = new Uint8Array(Math.min(total, unpackedSize));
      let cursor = 0;
      for (const chunk of chunks) {
        const remaining = out.length - cursor;
        if (remaining <= 0) break;
        const take = Math.min(remaining, chunk.length);
        out.set(chunk.subarray(0, take), cursor);
        cursor += take;
      }
      return out;
    }

    function walk(dirOffset, path, depth) {
      if (depth > 24 || visited.has(dirOffset)) return;
      visited.add(dirOffset);
      if (dirOffset < 0 || dirOffset + 4 > bytes.length) throw new Error("PSF2 디렉터리 위치가 올바르지 않습니다.");
      const count = le32(bytes, dirOffset);
      if (count > 65535 || dirOffset + 4 + count * 48 > bytes.length) throw new Error("PSF2 디렉터리 목록이 손상되었습니다.");
      for (let i = 0; i < count; i++) {
        const entry = dirOffset + 4 + i * 48;
        const name = decodeAscii(bytes.subarray(entry, entry + 36)).trim();
        if (!name) continue;
        const offset = le32(bytes, entry + 36);
        const unpackedSize = le32(bytes, entry + 40);
        const blockSize = le32(bytes, entry + 44);
        const fullName = path ? `${path}/${name}` : name;
        if (!unpackedSize && !blockSize && offset) {
          walk(offset, fullName, depth + 1);
        } else if (!unpackedSize && !blockSize && !offset) {
          output.push({ name: fullName, bytes: new Uint8Array(0) });
        } else {
          output.push({ name: fullName, bytes: readFile(offset, unpackedSize, blockSize) });
        }
      }
    }

    if (bytes.length) walk(0, "", 0);
    return output;
  }

  function sliceStructured(bytes, offset, magic) {
    if (offset < 0) return null;
    // Nintendo/SMF-style files keep total file size at +8.
    if (["SDAT", "SSEQ", "SSAR", "RSEQ", "CSEQ", "FSEQ", "RSAR", "CSAR", "FSAR"].includes(magic)) {
      const size = le32(bytes, offset + 8);
      if (size >= 12 && offset + size <= bytes.length) return bytes.subarray(offset, offset + size);
    }
    return bytes.subarray(offset);
  }

  function findStructured(bytes, magics) {
    const view = bytesOf(bytes);
    for (const magic of magics) {
      const offset = findAscii(view, magic);
      if (offset >= 0) return { magic, offset, bytes: sliceStructured(view, offset, magic) };
    }
    return null;
  }

  root.MabiXsf = Object.freeze({
    parse,
    libraryNames,
    extractPsf2Files,
    findAscii,
    findStructured,
  });
})();
