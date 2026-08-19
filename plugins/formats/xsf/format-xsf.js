(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  const xsf = root.MabiXsf;
  if (!core || !xsf) throw new Error("music-format-core.js and xsf-container.js must be loaded before format-xsf.js");

  function midiSlice(bytes, offset) {
    if (offset < 0 || offset + 14 > bytes.length) return null;
    let pos = offset + 14;
    const tracks = ((bytes[offset + 10] << 8) | bytes[offset + 11]) >>> 0;
    let seen = 0;
    while (pos + 8 <= bytes.length && seen < Math.max(1, tracks)) {
      if (String.fromCharCode(...bytes.subarray(pos, pos + 4)) !== "MTrk") break;
      const size = (((bytes[pos + 4] << 24) >>> 0) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7]) >>> 0;
      if (pos + 8 + size > bytes.length) break;
      pos += 8 + size;
      seen++;
    }
    return seen ? bytes.subarray(offset, pos) : null;
  }

  function findMidi(bytes) {
    const at = xsf.findAscii(bytes, "MThd");
    return at >= 0 ? midiSlice(bytes, at) : null;
  }

  function findPs1Sequence(bytes) {
    let cursor = 0;
    while (cursor + 13 <= bytes.length) {
      const at = xsf.findAscii(bytes, "pQES", cursor);
      if (at < 0) return null;
      try { return root.MabiPlayStationSequence.parseSeq(bytes, at); } catch (_) {}
      try { return root.MabiPlayStationSequence.parseSep(bytes, at); } catch (_) {}
      cursor = at + 4;
    }
    return null;
  }

  function findPs2Sequence(bytes) {
    let cursor = 0;
    while (cursor + 0x44 <= bytes.length) {
      const at = xsf.findAscii(bytes, "SCEIVers", cursor);
      if (at < 0) return null;
      try { return root.MabiPlayStationSequence.parsePs2Sq(bytes, at); } catch (_) {}
      cursor = at + 8;
    }
    return null;
  }

  function scanPlayStationBuffers(buffers) {
    for (const item of buffers) {
      const midi = findMidi(item.bytes);
      if (midi) return { midiBytes: midi, metadata: { containerEntry: item.name, embeddedFormat: "MIDI" } };
      const seq = findPs1Sequence(item.bytes);
      if (seq) return { ...seq, metadata: { ...(seq.metadata || {}), containerEntry: item.name, embeddedFormat: seq.metadata?.variant || "SEQ" } };
      const sq = findPs2Sequence(item.bytes);
      if (sq) return { ...sq, metadata: { ...(sq.metadata || {}), containerEntry: item.name, embeddedFormat: "PS2 SQ" } };
    }
    return null;
  }

  function convertPlayStationXsf(bytes, fileName) {
    const parsed = xsf.parse(bytes);
    if (parsed.version !== 0x01 && parsed.version !== 0x02) throw new Error(`지원하지 않는 PlayStation xSF 버전입니다: 0x${parsed.version.toString(16)}`);
    const libraries = xsf.libraryNames(parsed.tags);
    let buffers = [];
    if (parsed.version === 0x01) {
      buffers = [{ name: "PS-X EXE", bytes: parsed.program }];
    } else {
      const files = xsf.extractPsf2Files(parsed.reserved);
      buffers = files.filter(item => item.bytes?.length);
    }
    const result = scanPlayStationBuffers(buffers);
    if (result) {
      result.metadata = {
        ...(result.metadata || {}),
        xsfVersion: parsed.version,
        libraryDependencies: libraries,
        libraryDependent: libraries.length > 0,
      };
      return result;
    }
    if (libraries.length) {
      throw new Error(`${fileName}은(는) ${libraries.join(", ")} 라이브러리에 의존합니다. 현재 파일 안에서 직접 변환 가능한 시퀀스를 찾지 못했습니다.`);
    }
    throw new Error("PSF/PSF2에서 현재 지원하는 Sony SEQ/SQ 또는 MIDI 시퀀스를 찾지 못했습니다. 게임 고유 음악 드라이버 형식일 수 있습니다.");
  }

  function scanNintendoBuffers(buffers) {
    const magics = ["SDAT", "SSEQ", "SSAR", "RSEQ", "CSEQ", "FSEQ", "RSAR", "CSAR", "FSAR"];
    for (const item of buffers) {
      const hit = xsf.findStructured(item.bytes, magics);
      if (!hit) continue;
      const extensionByMagic = {
        SDAT: "sdat", SSEQ: "sseq", SSAR: "ssar",
        RSEQ: "rseq", CSEQ: "cseq", FSEQ: "fseq",
        RSAR: "brsar", CSAR: "bcsar", FSAR: "bfsar",
      };
      try {
        const converted = root.MabiNintendoSequence.convert(hit.bytes, `embedded.${extensionByMagic[hit.magic] || "bin"}`);
        return { ...converted, metadata: { ...(converted.metadata || {}), containerEntry: item.name, embeddedFormat: hit.magic } };
      } catch (_) {}
    }
    return null;
  }

  function convertNintendoXsf(bytes, fileName) {
    const parsed = xsf.parse(bytes);
    const libraries = xsf.libraryNames(parsed.tags);
    const buffers = [{ name: "program", bytes: parsed.program }, { name: "reserved", bytes: parsed.reserved }].filter(item => item.bytes.length);
    const result = scanNintendoBuffers(buffers);
    if (result) {
      result.metadata = {
        ...(result.metadata || {}),
        xsfVersion: parsed.version,
        libraryDependencies: libraries,
        libraryDependent: libraries.length > 0,
      };
      return result;
    }
    if (libraries.length) {
      throw new Error(`${fileName}은(는) ${libraries.join(", ")} 라이브러리에 의존합니다. 라이브러리 결합 전에는 시퀀스를 복원할 수 없습니다.`);
    }
    throw new Error("Nintendo xSF에서 현재 지원하는 SDAT/SSEQ 계열 시퀀스를 찾지 못했습니다. ROM/게임 고유 사운드 드라이버 복원이 필요한 파일일 수 있습니다.");
  }

  function detectXsfVersion(bytes, versions) {
    return bytes?.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x53 && bytes[2] === 0x46 && versions.includes(bytes[3]);
  }

  core.registerFormat({
    id: "playstation-xsf",
    label: "PlayStation PSF",
    category: "console",
    extensions: ["psf", "psf1", "minipsf", "minipsf1", "psflib", "psf1lib", "psf2", "minipsf2", "psf2lib"],
    description: "PSF/PSF2 컨테이너를 해제하고 내부의 지원 가능한 Sony SEQ/SQ/MIDI 시퀀스를 찾아 변환",
    limitation: "MiniPSF 계열은 외부 라이브러리가 필요한 경우 단독 파일만으로 변환할 수 없으며, 게임 고유 드라이버는 추가 엔진 지원이 필요할 수 있습니다.",
    detect(bytes) { return detectXsfVersion(bytes, [0x01, 0x02]); },
    convert: convertPlayStationXsf,
  });

  core.registerFormat({
    id: "nintendo-xsf",
    label: "Nintendo xSF",
    category: "console",
    extensions: ["ncsf", "minincsf", "ncsflib", "2sf", "mini2sf", "2sflib"],
    description: "Nintendo DS 계열 xSF를 해제하고 내장 SDAT/SSEQ 시퀀스를 MIDI로 변환",
    limitation: "Mini/2SF가 외부 라이브러리 또는 ROM 패치만 포함하는 경우 단독 파일만으로는 복원할 수 없습니다.",
    detect(bytes) {
      if (!bytes?.length || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x53 || bytes[2] !== 0x46) return false;
      // NCSF/2SF use PSF-derived version codes outside PS1/PS2. Extension matching remains the primary discriminator.
      return bytes[3] === 0x24 || bytes[3] === 0x25;
    },
    convert: convertNintendoXsf,
  });
})();
