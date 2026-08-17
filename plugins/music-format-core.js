(() => {
  "use strict";

  const registrations = [];
  const byExtension = new Map();
  const DEFAULT_PPQ = 480;

  function asUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Uint8Array(value || []);
  }

  function standaloneBytes(value) {
    const view = asUint8Array(value);
    return new Uint8Array(view);
  }

  function extensionOf(fileName) {
    const match = /\.([^.\\/]+)$/.exec(String(fileName || ""));
    return match ? match[1].toLowerCase() : "";
  }

  function normalizeExtension(value) {
    return String(value || "").trim().toLowerCase().replace(/^\./, "");
  }

  function registerFormat(definition) {
    if (!definition || typeof definition.convert !== "function") {
      throw new TypeError("A music format plugin must provide a convert function.");
    }
    const id = String(definition.id || "").trim();
    if (!id) throw new TypeError("A music format plugin must provide an id.");
    const extensions = Array.from(new Set((definition.extensions || []).map(normalizeExtension).filter(Boolean)));
    if (!extensions.length) throw new TypeError(`Music format plugin ${id} has no extensions.`);

    const normalized = Object.freeze({
      id,
      label: String(definition.label || id),
      category: String(definition.category || "other"),
      extensions,
      mimeTypes: Array.from(new Set((definition.mimeTypes || []).map(value => String(value || "").toLowerCase()).filter(Boolean))),
      description: definition.description || "",
      limitation: definition.limitation || "",
      requiresNetwork: Boolean(definition.requiresNetwork),
      convert: definition.convert,
      detect: typeof definition.detect === "function" ? definition.detect : null,
    });

    const oldIndex = registrations.findIndex(item => item.id === id);
    if (oldIndex >= 0) {
      const old = registrations[oldIndex];
      for (const ext of old.extensions) {
        if (byExtension.get(ext)?.id === id) byExtension.delete(ext);
      }
      registrations.splice(oldIndex, 1, normalized);
    } else {
      registrations.push(normalized);
    }
    for (const ext of extensions) byExtension.set(ext, normalized);
    return normalized;
  }

  function findFormat(fileName, mimeType = "", bytes = null) {
    const ext = extensionOf(fileName);
    if (ext && byExtension.has(ext)) return byExtension.get(ext);
    const type = String(mimeType || "").toLowerCase();
    if (type) {
      const byMime = registrations.find(item => item.mimeTypes.includes(type));
      if (byMime) return byMime;
    }
    if (bytes) {
      const view = asUint8Array(bytes);
      return registrations.find(item => item.detect?.(view, fileName, mimeType)) || null;
    }
    return null;
  }

  function isSupported(fileName, mimeType = "") {
    return Boolean(findFormat(fileName, mimeType));
  }

  function supportedExtensions() {
    return Array.from(byExtension.keys()).sort();
  }

  function acceptAttribute(extra = []) {
    return Array.from(new Set([...supportedExtensions().map(ext => `.${ext}`), ...extra])).join(",");
  }

  async function convertBytes(bytes, fileName, mimeType = "", options = {}) {
    const sourceBytes = standaloneBytes(bytes);
    const format = findFormat(fileName, mimeType, sourceBytes);
    if (!format) throw new Error(`지원하지 않는 파일 형식입니다: .${extensionOf(fileName) || "?"}`);
    const converted = await format.convert(sourceBytes, String(fileName || format.label), {
      ...options,
      mimeType,
      format,
      core: api,
    });
    const midiBytes = standaloneBytes(converted?.midiBytes ?? converted);
    if (midiBytes.length < 14 || String.fromCharCode(...midiBytes.subarray(0, 4)) !== "MThd") {
      throw new Error(`${format.label} 변환 결과가 올바른 MIDI 파일이 아닙니다.`);
    }
    return {
      midiBytes,
      format,
      sourceType: format.id,
      sourceLabel: format.label,
      metadata: converted?.metadata || {},
    };
  }

  async function convertFile(file, options = {}) {
    if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("File 객체가 필요합니다.");
    return convertBytes(await file.arrayBuffer(), file.name || "music", file.type || "", options);
  }

  function textDecode(bytes, encodings = ["utf-8", "shift_jis", "windows-1252"]) {
    const view = asUint8Array(bytes);
    let best = "";
    let bestReplacement = Infinity;
    for (const encoding of encodings) {
      try {
        const text = new TextDecoder(encoding, { fatal: false }).decode(view).replace(/^\uFEFF/, "");
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

  function xmlDocument(bytesOrText, fileName = "XML") {
    const text = typeof bytesOrText === "string" ? bytesOrText : textDecode(bytesOrText, ["utf-8", "utf-16le", "utf-16be", "shift_jis"]);
    const documentNode = new DOMParser().parseFromString(text, "application/xml");
    const parserError = documentNode.querySelector("parsererror");
    if (parserError) throw new Error(`${fileName} XML을 해석하지 못했습니다.`);
    return documentNode;
  }

  function localElements(root, localName) {
    const expected = String(localName || "").toLowerCase();
    return Array.from(root?.getElementsByTagName?.("*") || []).filter(node => String(node.localName || node.nodeName).toLowerCase() === expected);
  }

  function firstLocal(root, localName) {
    return localElements(root, localName)[0] || null;
  }

  function childLocal(root, localName) {
    const expected = String(localName || "").toLowerCase();
    return Array.from(root?.children || []).find(node => String(node.localName || node.nodeName).toLowerCase() === expected) || null;
  }

  function childText(root, names, fallback = "") {
    for (const name of Array.isArray(names) ? names : [names]) {
      const child = childLocal(root, name);
      if (child && String(child.textContent || "").trim() !== "") return String(child.textContent).trim();
    }
    return fallback;
  }

  function clampInt(value, min, max, fallback = min) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function numberValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pushUint32(target, value) {
    target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  function pushUint16(target, value) {
    target.push((value >>> 8) & 0xff, value & 0xff);
  }

  function variableLength(value) {
    let buffer = Math.max(0, Math.round(Number(value) || 0)) & 0x0fffffff;
    const bytes = [buffer & 0x7f];
    while ((buffer >>= 7)) bytes.unshift((buffer & 0x7f) | 0x80);
    return bytes;
  }

  function textMeta(type, text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    return [0xff, type, ...variableLength(bytes.length), ...bytes];
  }

  function midiChunk(type, payload) {
    const output = Array.from(new TextEncoder().encode(type));
    pushUint32(output, payload.length);
    output.push(...payload);
    return output;
  }

  function normalizeTempoValue(value) {
    let bpm = Number(value);
    if (!Number.isFinite(bpm) || bpm <= 0) return 120;
    if (bpm > 1000) bpm /= 100;
    return Math.max(1, Math.min(999, bpm));
  }

  function buildMidi({ ppq = DEFAULT_PPQ, title = "Converted", tempoEvents = [], timeSignatures = [], keySignatures = [], tracks = [] } = {}) {
    const division = clampInt(ppq, 24, 32767, DEFAULT_PPQ);
    const metaEvents = [];
    metaEvents.push({ tick: 0, order: 0, bytes: textMeta(0x03, title) });
    const normalizedTempos = tempoEvents.length ? tempoEvents : [{ tick: 0, bpm: 120 }];
    for (const item of normalizedTempos) {
      const tick = Math.max(0, Math.round(numberValue(item.tick, 0)));
      const bpm = normalizeTempoValue(item.bpm);
      const mpqn = Math.max(1, Math.round(60000000 / bpm));
      metaEvents.push({ tick, order: 1, bytes: [0xff, 0x51, 0x03, (mpqn >>> 16) & 0xff, (mpqn >>> 8) & 0xff, mpqn & 0xff] });
    }
    const normalizedTime = timeSignatures.length ? timeSignatures : [{ tick: 0, numerator: 4, denominator: 4 }];
    for (const item of normalizedTime) {
      const numerator = clampInt(item.numerator, 1, 255, 4);
      let denominator = clampInt(item.denominator, 1, 128, 4);
      let power = 0;
      while ((1 << power) < denominator && power < 7) power++;
      denominator = 1 << power;
      metaEvents.push({
        tick: Math.max(0, Math.round(numberValue(item.tick, 0))),
        order: 2,
        bytes: [0xff, 0x58, 0x04, numerator, power, 24, 8],
      });
    }
    for (const item of keySignatures) {
      const sf = clampInt(item.sharps ?? item.sf, -7, 7, 0);
      const minor = item.minor || item.mode === "minor" ? 1 : 0;
      metaEvents.push({ tick: Math.max(0, Math.round(numberValue(item.tick, 0))), order: 3, bytes: [0xff, 0x59, 0x02, sf & 0xff, minor] });
    }

    function serializeTrack(events) {
      const sorted = events.slice().sort((a, b) => a.tick - b.tick || a.order - b.order);
      const payload = [];
      let previousTick = 0;
      for (const event of sorted) {
        const tick = Math.max(previousTick, Math.round(event.tick || 0));
        payload.push(...variableLength(tick - previousTick), ...event.bytes);
        previousTick = tick;
      }
      payload.push(0x00, 0xff, 0x2f, 0x00);
      return midiChunk("MTrk", payload);
    }

    const chunks = [serializeTrack(metaEvents)];
    let nextMelodicChannel = 0;
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const track = tracks[trackIndex] || {};
      let channel = Number.isFinite(Number(track.channel)) ? clampInt(track.channel, 0, 15, 0) : nextMelodicChannel;
      if (track.isDrums) channel = 9;
      if (channel === 9 && !track.isDrums) channel = 10;
      if (!Number.isFinite(Number(track.channel)) && !track.isDrums) {
        nextMelodicChannel = channel + 1;
        if (nextMelodicChannel === 9) nextMelodicChannel++;
        if (nextMelodicChannel > 15) nextMelodicChannel = 0;
      }
      const events = [{ tick: 0, order: 0, bytes: textMeta(0x03, track.name || `Track ${trackIndex + 1}`) }];
      if (!track.isDrums) events.push({ tick: 0, order: 1, bytes: [0xc0 | channel, clampInt(track.program, 0, 127, 0)] });
      for (const note of track.notes || []) {
        const start = Math.max(0, Math.round(numberValue(note.startTick ?? note.start ?? note.position, 0)));
        const duration = Math.max(1, Math.round(numberValue(note.durationTick ?? note.duration ?? note.length, division / 4)));
        const end = Math.max(start + 1, Math.round(numberValue(note.endTick, start + duration)));
        const pitch = clampInt(note.pitch ?? note.note ?? note.tone, 0, 127, 60);
        const velocity = clampInt(note.velocity, 1, 127, 96);
        const noteChannel = Number.isFinite(Number(note.channel)) ? clampInt(note.channel, 0, 15, channel) : channel;
        events.push({ tick: start, order: 4, bytes: [0x90 | noteChannel, pitch, velocity] });
        events.push({ tick: end, order: 2, bytes: [0x80 | noteChannel, pitch, 0] });
        if (note.lyric) events.push({ tick: start, order: 3, bytes: textMeta(0x05, note.lyric) });
      }
      chunks.push(serializeTrack(events));
    }

    const headerPayload = [];
    pushUint16(headerPayload, 1);
    pushUint16(headerPayload, chunks.length);
    pushUint16(headerPayload, division);
    return new Uint8Array([...midiChunk("MThd", headerPayload), ...chunks.flat()]);
  }

  function readUint16LE(view, offset) {
    return view[offset] | (view[offset + 1] << 8);
  }

  function readUint32LE(view, offset) {
    return (view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16) | (view[offset + 3] << 24)) >>> 0;
  }

  function unzip(bytes) {
    const view = asUint8Array(bytes);
    let eocd = -1;
    for (let i = Math.max(0, view.length - 65557); i <= view.length - 22; i++) {
      if (readUint32LE(view, i) === 0x06054b50) eocd = i;
    }
    if (eocd < 0) throw new Error("ZIP 중앙 디렉터리를 찾지 못했습니다.");
    const entryCount = readUint16LE(view, eocd + 10);
    let cursor = readUint32LE(view, eocd + 16);
    const result = new Map();
    for (let index = 0; index < entryCount; index++) {
      if (readUint32LE(view, cursor) !== 0x02014b50) throw new Error("ZIP 중앙 디렉터리가 손상되었습니다.");
      const method = readUint16LE(view, cursor + 10);
      const compressedSize = readUint32LE(view, cursor + 20);
      const uncompressedSize = readUint32LE(view, cursor + 24);
      const nameLength = readUint16LE(view, cursor + 28);
      const extraLength = readUint16LE(view, cursor + 30);
      const commentLength = readUint16LE(view, cursor + 32);
      const localOffset = readUint32LE(view, cursor + 42);
      const name = new TextDecoder("utf-8").decode(view.subarray(cursor + 46, cursor + 46 + nameLength));
      if (readUint32LE(view, localOffset) !== 0x04034b50) throw new Error(`ZIP 항목 ${name}의 로컬 헤더가 손상되었습니다.`);
      const localNameLength = readUint16LE(view, localOffset + 26);
      const localExtraLength = readUint16LE(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = view.subarray(dataStart, dataStart + compressedSize);
      let data;
      if (method === 0) data = new Uint8Array(compressed);
      else if (method === 8) {
        const pako = window.pako;
        if (!pako?.inflateRaw) throw new Error("ZIP 압축 해제 모듈(pako)을 불러오지 못했습니다.");
        data = new Uint8Array(pako.inflateRaw(compressed));
      } else {
        throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${method}`);
      }
      if (uncompressedSize && data.length !== uncompressedSize) {
        throw new Error(`ZIP 항목 ${name}의 크기가 일치하지 않습니다.`);
      }
      result.set(name, data);
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return result;
  }

  function stripYamlComment(line) {
    let quote = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote && line[i - 1] !== "\\") quote = "";
      } else if (ch === "\"" || ch === "'") quote = ch;
      else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }

  function yamlScalar(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
      const body = text.slice(1, -1);
      return text[0] === "\"" ? body.replace(/\\n/g, "\n").replace(/\\\"/g, "\"").replace(/\\\\/g, "\\") : body.replace(/''/g, "'");
    }
    if (text === "null" || text === "~") return null;
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
    if (/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(text)) return Number(text);
    if (text.startsWith("[") && text.endsWith("]")) {
      const inner = text.slice(1, -1).trim();
      return inner ? inner.split(",").map(yamlScalar) : [];
    }
    if (text.startsWith("{") && text.endsWith("}")) {
      const object = {};
      const inner = text.slice(1, -1).trim();
      if (inner) for (const part of inner.split(",")) {
        const colon = part.indexOf(":");
        if (colon >= 0) object[part.slice(0, colon).trim()] = yamlScalar(part.slice(colon + 1));
      }
      return object;
    }
    return text;
  }

  function parseYaml(text) {
    const lines = String(text || "").split(/\r?\n/).map((raw, sourceIndex) => {
      const withoutComment = stripYamlComment(raw.replace(/\t/g, "  ")).replace(/\s+$/, "");
      const indent = withoutComment.match(/^ */)[0].length;
      return { indent, text: withoutComment.trim(), sourceIndex };
    }).filter(line => line.text && line.text !== "---" && line.text !== "...");

    function parseBlock(start, indent) {
      if (start >= lines.length || lines[start].indent < indent) return { value: {}, next: start };
      const isArray = lines[start].indent === indent && lines[start].text.startsWith("- ");
      const value = isArray ? [] : {};
      let index = start;
      while (index < lines.length) {
        const line = lines[index];
        if (line.indent < indent) break;
        if (line.indent > indent) break;
        if (isArray) {
          if (!line.text.startsWith("-")) break;
          const itemText = line.text.slice(1).trim();
          if (!itemText) {
            const nested = parseBlock(index + 1, lines[index + 1]?.indent ?? indent + 2);
            value.push(nested.value);
            index = nested.next;
            continue;
          }
          const colon = itemText.indexOf(":");
          if (colon >= 0) {
            const object = {};
            const key = itemText.slice(0, colon).trim();
            const rawValue = itemText.slice(colon + 1).trim();
            object[key] = rawValue ? yamlScalar(rawValue) : {};
            index++;
            while (index < lines.length && lines[index].indent > indent) {
              const childIndent = lines[index].indent;
              const child = lines[index];
              const childColon = child.text.indexOf(":");
              if (childColon < 0 || child.text.startsWith("- ")) {
                const nested = parseBlock(index, childIndent);
                if (!rawValue && Object.keys(object).length === 1) object[key] = nested.value;
                index = nested.next;
                continue;
              }
              const childKey = child.text.slice(0, childColon).trim();
              const childRaw = child.text.slice(childColon + 1).trim();
              if (childRaw) {
                object[childKey] = yamlScalar(childRaw);
                index++;
              } else {
                const nextIndent = lines[index + 1]?.indent;
                if (Number.isFinite(nextIndent) && nextIndent > childIndent) {
                  const nested = parseBlock(index + 1, nextIndent);
                  object[childKey] = nested.value;
                  index = nested.next;
                } else {
                  object[childKey] = {};
                  index++;
                }
              }
            }
            value.push(object);
          } else {
            value.push(yamlScalar(itemText));
            index++;
          }
        } else {
          if (line.text.startsWith("- ")) break;
          const colon = line.text.indexOf(":");
          if (colon < 0) { index++; continue; }
          const key = line.text.slice(0, colon).trim();
          const rawValue = line.text.slice(colon + 1).trim();
          if (rawValue) {
            value[key] = yamlScalar(rawValue);
            index++;
          } else {
            const nextIndent = lines[index + 1]?.indent;
            if (Number.isFinite(nextIndent) && nextIndent > indent) {
              const nested = parseBlock(index + 1, nextIndent);
              value[key] = nested.value;
              index = nested.next;
            } else {
              value[key] = {};
              index++;
            }
          }
        }
      }
      return { value, next: index };
    }

    return parseBlock(0, lines[0]?.indent || 0).value;
  }

  const api = {
    version: "4.8-format-plugins-1",
    registerFormat,
    findFormat,
    isSupported,
    supportedExtensions,
    acceptAttribute,
    convertBytes,
    convertFile,
    listFormats: () => registrations.slice(),
    extensionOf,
    asUint8Array,
    standaloneBytes,
    textDecode,
    xmlDocument,
    localElements,
    firstLocal,
    childLocal,
    childText,
    clampInt,
    numberValue,
    buildMidi,
    unzip,
    parseYaml,
    DEFAULT_PPQ,
  };

  window.MabiMusicFormats = api;
  window.dispatchEvent(new CustomEvent("mabi-music-formats-ready"));
})();
