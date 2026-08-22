(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  if (!utils) throw new Error("utils.js must be loaded before music-format-core.js");

  const registrations = [];
  const byExtension = new Map();
  const DEFAULT_PPQ = 480;
  // When a source format provides no usable loudness/dynamic information at all,
  // Mobibard normalization policy uses MIDI 96 (about 75% of the 0..127 range).
  const DEFAULT_VELOCITY = 96;
  const NORMALIZATION_POLICY = Object.freeze({
    fallbackTempoBpm: 120,
    fallbackVelocity: DEFAULT_VELOCITY,
    fallbackVolumePercent: 75,
    defaultPan: 64,
    defaultExpression: 127,
    gmBank: 0,
    gmDrumChannel: 9,
    rules: Object.freeze([
      "Preserve explicit source tempo, note velocity, channel volume, expression, pan, program, bank and drum semantics when the source format defines them.",
      "Convert source-specific units to Standard MIDI semantics before Editor/MML processing; do not copy non-MIDI numeric domains blindly.",
      "When loudness is represented by multiple controls, preserve them independently in MIDI and combine Velocity × CC7 × CC11 only at the consumer stage that needs one effective loudness value.",
      "When source instrument semantics are known, normalize them to a plausible GM program or GM percussion key; when semantics cannot be inferred, keep the safest GM proxy instead of inventing an instrument identity.",
      "Use tempo 120 BPM only when no usable tempo can be obtained or inferred from the source.",
      "Use MIDI velocity 96 (about 75%) only when no usable loudness/dynamic information can be obtained or inferred from the source.",
    ]),
  });
  const GENERIC_CONTAINER_EXTENSIONS = Object.freeze(["bin", "macbin"]);
  const GENERIC_CONTAINER_MIME_TYPES = Object.freeze(["application/macbinary", "application/x-macbinary"]);

  const asUint8Array = utils.toUint8Array;
  const standaloneBytes = utils.copyUint8Array;
  const textDecode = utils.decodeText;
  const xmlDocument = utils.parseXml;
  const localElements = utils.descendantsByLocalName;
  const firstLocal = utils.firstDescendantByLocalName;
  const childLocal = utils.childByLocalName;
  const childText = utils.childText;
  const clampInt = utils.clampInt;
  const numberValue = utils.toFiniteNumber;
  const unzip = utils.unzip;

  function unwrapMacBinary(value, options = {}) {
    return utils.unwrapMacBinary(asUint8Array(value), options);
  }

  function normalizeExtension(value) {
    return String(value || "").trim().toLowerCase().replace(/^\.+/, "");
  }

  function extensionOf(fileName) {
    const base = String(fileName || "").split(/[?#]/, 1)[0].replace(/\\/g, "/").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    return dot >= 0 && dot + 1 < base.length ? base.slice(dot + 1).toLowerCase() : "";
  }

  function extensionCandidates(fileName) {
    const base = String(fileName || "").split(/[?#]/, 1)[0].replace(/\\/g, "/").split("/").pop() || "";
    const parts = base.toLowerCase().split(".");
    if (parts.length < 2) return [];
    const candidates = [];
    for (let index = 1; index < parts.length; index++) {
      const candidate = normalizeExtension(parts.slice(index).join("."));
      if (candidate) candidates.push(candidate);
    }
    return candidates.sort((a, b) => b.length - a.length);
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
      description: String(definition.description || ""),
      limitation: String(definition.limitation || ""),
      requiresNetwork: Boolean(definition.requiresNetwork),
      convert: definition.convert,
      detect: typeof definition.detect === "function" ? definition.detect : null,
    });

    const oldIndex = registrations.findIndex(item => item.id === id);
    if (oldIndex >= 0) {
      const old = registrations[oldIndex];
      for (const extension of old.extensions) {
        if (byExtension.get(extension)?.id === id) byExtension.delete(extension);
      }
      registrations.splice(oldIndex, 1, normalized);
    } else {
      registrations.push(normalized);
    }
    for (const extension of extensions) byExtension.set(extension, normalized);
    return normalized;
  }

  function findFormatByExtension(fileName) {
    for (const extension of extensionCandidates(fileName)) {
      if (byExtension.has(extension)) return byExtension.get(extension);
    }
    return null;
  }

  function findFormat(fileName, mimeType = "", bytes = null) {
    const extensionMatch = findFormatByExtension(fileName);
    if (extensionMatch) return extensionMatch;
    const type = String(mimeType || "").toLowerCase();
    if (type) {
      const match = registrations.find(item => item.mimeTypes.includes(type));
      if (match) return match;
    }
    if (bytes != null) {
      const view = asUint8Array(bytes);
      return registrations.find(item => item.detect?.(view, fileName, mimeType)) || null;
    }
    return null;
  }

  function isGenericContainer(fileName, mimeType = "") {
    const extension = extensionOf(fileName);
    const type = String(mimeType || "").trim().toLowerCase();
    return GENERIC_CONTAINER_EXTENSIONS.includes(extension) || GENERIC_CONTAINER_MIME_TYPES.includes(type);
  }

  function isSupported(fileName, mimeType = "") {
    return Boolean(findFormat(fileName, mimeType) || isGenericContainer(fileName, mimeType));
  }

  function supportedExtensions() {
    return Array.from(byExtension.keys()).sort((a, b) => a.localeCompare(b));
  }

  function inputExtensions() {
    return Array.from(new Set([...supportedExtensions(), ...GENERIC_CONTAINER_EXTENSIONS]))
      .sort((a, b) => a.localeCompare(b));
  }

  function acceptAttribute(extra = []) {
    return Array.from(new Set([
      ...inputExtensions().map(extension => `.${extension}`),
      ...GENERIC_CONTAINER_MIME_TYPES,
      ...(Array.isArray(extra) ? extra : [extra]),
    ].filter(Boolean))).join(",");
  }

  function collectFormatAttempts(fileNames, mimeType, bytes) {
    const attempts = [];
    const seen = new Set();
    const push = format => {
      if (!format || seen.has(format.id)) return;
      seen.add(format.id);
      attempts.push(format);
    };

    for (const name of fileNames) push(findFormatByExtension(name));

    const type = String(mimeType || "").trim().toLowerCase();
    if (type && !GENERIC_CONTAINER_MIME_TYPES.includes(type)) {
      for (const format of registrations) {
        if (format.mimeTypes.includes(type)) push(format);
      }
    }

    for (const format of registrations) {
      if (!format.detect) continue;
      try {
        if (format.detect(bytes, fileNames[0] || "music", mimeType)) push(format);
      } catch (_) {}
    }
    return attempts;
  }

  async function convertBytes(bytes, fileName, mimeType = "", options = {}) {
    const source = standaloneBytes(bytes);
    const macBinary = utils.inspectMacBinary(source);
    const uploadedName = String(fileName || "").trim();
    const internalName = String(macBinary?.fileName || "").trim();
    const sourceNames = Array.from(new Set((macBinary
      ? [internalName, uploadedName]
      : [uploadedName]
    ).filter(Boolean)));
    if (!sourceNames.length) sourceNames.push("music");

    const candidates = utils.macBinaryForkCandidates(source);
    let firstError = null;
    let matchedFormat = false;

    for (const candidate of candidates) {
      const sourceBytes = standaloneBytes(candidate.bytes);
      const formatAttempts = collectFormatAttempts(sourceNames, mimeType, sourceBytes);
      if (!formatAttempts.length) continue;
      matchedFormat = true;

      for (const format of formatAttempts) {
        const resolvedFileName = sourceNames.find(name => extensionCandidates(name)
          .some(extension => format.extensions.includes(extension)))
          || internalName
          || uploadedName
          || format.label;
        try {
          const converted = await format.convert(sourceBytes, resolvedFileName, {
            ...options,
            mimeType,
            format,
            core: api,
            container: candidate.metadata,
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
            metadata: {
              ...candidate.metadata,
              originalFileName: uploadedName,
              resolvedFileName,
              ...(converted?.metadata || {}),
            },
          };
        } catch (error) {
          if (!firstError) firstError = error;
        }
      }
    }

    if (firstError) throw firstError;
    const unsupportedExtension = sourceNames.map(extensionOf).find(Boolean) || "?";
    if (matchedFormat) throw new Error(`파일을 변환하지 못했습니다: .${unsupportedExtension}`);
    throw new Error(`지원하지 않는 파일 형식입니다: .${unsupportedExtension}`);
  }

  async function convertFile(file, options = {}) {
    if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("File 객체가 필요합니다.");
    return convertBytes(await file.arrayBuffer(), file.name || "music", file.type || "", options);
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
    const metaEvents = [{ tick: 0, order: 0, bytes: textMeta(0x03, title) }];
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
      const rawDenominator = clampInt(item.denominator, 1, 128, 4);
      let power = 0;
      while ((1 << power) < rawDenominator && power < 7) power++;
      metaEvents.push({
        tick: Math.max(0, Math.round(numberValue(item.tick, 0))),
        order: 2,
        bytes: [0xff, 0x58, 0x04, numerator, power, 24, 8],
      });
    }
    for (const item of keySignatures) {
      const sf = clampInt(item.sharps ?? item.sf ?? item.fifths, -7, 7, 0);
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
      if (Number.isFinite(Number(track.volume))) {
        events.push({ tick: 0, order: 2, bytes: [0xb0 | channel, 0x07, clampInt(track.volume, 0, 127, DEFAULT_VELOCITY)] });
      }
      if (Number.isFinite(Number(track.pan))) {
        events.push({ tick: 0, order: 2, bytes: [0xb0 | channel, 0x0a, clampInt(track.pan, 0, 127, 64)] });
      }
      if (Number.isFinite(Number(track.expression))) {
        events.push({ tick: 0, order: 2, bytes: [0xb0 | channel, 0x0b, clampInt(track.expression, 0, 127, 127)] });
      }
      for (const control of track.controlChanges || []) {
        const controlChannel = Number.isFinite(Number(control.channel)) ? clampInt(control.channel, 0, 15, channel) : channel;
        events.push({
          tick: Math.max(0, Math.round(numberValue(control.tick ?? control.position, 0))),
          order: 2,
          bytes: [0xb0 | controlChannel, clampInt(control.controller ?? control.control, 0, 127, 7), clampInt(control.value, 0, 127, 0)],
        });
      }
      for (const note of track.notes || []) {
        const start = Math.max(0, Math.round(numberValue(note.startTick ?? note.start ?? note.position, 0)));
        const duration = Math.max(1, Math.round(numberValue(note.durationTick ?? note.duration ?? note.length, division / 4)));
        const end = Math.max(start + 1, Math.round(numberValue(note.endTick, start + duration)));
        const pitch = clampInt(note.pitch ?? note.note ?? note.tone, 0, 127, 60);
        const rawVelocity = note.velocity;
        const velocity = rawVelocity === null || rawVelocity === undefined || rawVelocity === ""
          ? DEFAULT_VELOCITY
          : clampInt(rawVelocity, 1, 127, DEFAULT_VELOCITY);
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

  function stripYamlComment(line) {
    let quote = "";
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (quote) {
        if (character === quote && line[index - 1] !== "\\") quote = "";
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === "#" && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index);
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
    const lines = String(text || "").split(/\r?\n/).map(raw => {
      const withoutComment = stripYamlComment(raw.replace(/\t/g, "  ")).replace(/\s+$/, "");
      const indent = withoutComment.match(/^ */)?.[0].length || 0;
      return { indent, text: withoutComment.trim() };
    }).filter(line => line.text && line.text !== "---" && line.text !== "...");

    function parseBlock(start, indent) {
      if (start >= lines.length || lines[start].indent < indent) return { value: {}, next: start };
      const isArray = lines[start].indent === indent && lines[start].text.startsWith("- ");
      const value = isArray ? [] : {};
      let index = start;
      while (index < lines.length) {
        const line = lines[index];
        if (line.indent !== indent) break;
        if (isArray) {
          if (!line.text.startsWith("-")) break;
          const itemText = line.text.slice(1).trim();
          if (!itemText) {
            const nextIndent = lines[index + 1]?.indent ?? indent + 2;
            const nested = parseBlock(index + 1, nextIndent);
            value.push(nested.value);
            index = nested.next;
            continue;
          }
          const colon = itemText.indexOf(":");
          if (colon < 0) {
            value.push(yamlScalar(itemText));
            index++;
            continue;
          }
          const object = {};
          const key = itemText.slice(0, colon).trim();
          const rawValue = itemText.slice(colon + 1).trim();
          object[key] = rawValue ? yamlScalar(rawValue) : {};
          index++;
          while (index < lines.length && lines[index].indent > indent) {
            const child = lines[index];
            const childColon = child.text.indexOf(":");
            if (childColon < 0 || child.text.startsWith("- ")) {
              const nested = parseBlock(index, child.indent);
              if (!rawValue && Object.keys(object).length === 1) object[key] = nested.value;
              index = nested.next;
              continue;
            }
            const childKey = child.text.slice(0, childColon).trim();
            const childRaw = child.text.slice(childColon + 1).trim();
            if (childRaw) {
              object[childKey] = yamlScalar(childRaw);
              index++;
            } else if (lines[index + 1]?.indent > child.indent) {
              const nested = parseBlock(index + 1, lines[index + 1].indent);
              object[childKey] = nested.value;
              index = nested.next;
            } else {
              object[childKey] = {};
              index++;
            }
          }
          value.push(object);
        } else {
          if (line.text.startsWith("- ")) break;
          const colon = line.text.indexOf(":");
          if (colon < 0) {
            index++;
            continue;
          }
          const key = line.text.slice(0, colon).trim();
          const rawValue = line.text.slice(colon + 1).trim();
          if (rawValue) {
            value[key] = yamlScalar(rawValue);
            index++;
          } else if (lines[index + 1]?.indent > indent) {
            const nested = parseBlock(index + 1, lines[index + 1].indent);
            value[key] = nested.value;
            index = nested.next;
          } else {
            value[key] = {};
            index++;
          }
        }
      }
      return { value, next: index };
    }

    return lines.length ? parseBlock(0, lines[0].indent).value : {};
  }

  const api = Object.freeze({
    version: "5.1.0",
    registerFormat,
    findFormat,
    isSupported,
    isGenericContainer,
    supportedExtensions,
    inputExtensions,
    acceptAttribute,
    convertBytes,
    convertFile,
    listFormats: () => registrations.slice(),
    extensionOf,
    extensionCandidates,
    asUint8Array,
    standaloneBytes,
    unwrapMacBinary,
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
    DEFAULT_VELOCITY,
    NORMALIZATION_POLICY,
  });

  root.MabiMusicFormats = api;
  if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
    root.dispatchEvent(new root.CustomEvent("mabi-music-formats-ready"));
  }
})();
