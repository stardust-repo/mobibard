(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  if (!utils) throw new Error("utils.js must be loaded before midi-parser.js");

  const VERSION = "5.1.0";
  const DEFAULT_PPQ = 480;
  const DEFAULT_TEMPO = 120;

  const FALLBACK_MESSAGES = Object.freeze({
    "file.err_eof": "파일 끝을 예상보다 일찍 만났습니다.",
    "midi.err_header": "표준 MIDI 헤더(MThd)를 찾지 못했습니다.",
    "midi.err_header_length": "MIDI 헤더 길이가 올바르지 않습니다.",
    "midi.err_format": "지원하지 않는 MIDI Format입니다: {0}",
    "midi.err_track_header": "Track {0}의 MTrk 헤더를 찾지 못했습니다.",
    "midi.err_running_status": "MIDI running status가 올바르지 않습니다.",
    "midi.warn_missing_note_off": "Track {0}에서 Note Off가 없는 음표 {1}개를 제외했습니다.",
    "midi.warn_missing_note_off_closed": "Track {0}에서 Note Off가 없는 음표 {1}개를 트랙 끝까지 연장했습니다.",
  });

  const asUint8Array = utils.toUint8Array;
  const clampInt = utils.clampInt;

  function normalizeProgram(value) {
    return clampInt(value, 0, 127, 0);
  }

  function normalizeBank(value) {
    return clampInt(value, 0, 127, 0);
  }

  const MELODIC_CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);

  function defaultMelodicChannel(index) {
    const safeIndex = Math.max(0, Math.trunc(Number(index) || 0));
    return MELODIC_CHANNELS[safeIndex % MELODIC_CHANNELS.length];
  }

  function formatMessage(key, values = [], translate = null) {
    if (typeof translate === "function") {
      try {
        const translated = translate(key, values);
        if (translated != null && String(translated) !== key) return String(translated);
      } catch (_) {}
    }
    let text = FALLBACK_MESSAGES[key] || key;
    values.forEach((value, index) => { text = text.replaceAll(`{${index}}`, String(value)); });
    return text;
  }

  const asciiAt = utils.asciiAt;
  const looksLikeMacBinary = utils.looksLikeMacBinary;
  const extractMacBinaryDataFork = utils.extractMacBinaryDataFork;

  function normalizeContainer(sourceBytes) {
    const bytes = asUint8Array(sourceBytes);
    if (asciiAt(bytes, 0, "MThd")) {
      return {
        bytes,
        macBinary: false,
        selectedFork: "raw",
        dataForkLength: bytes.length,
        resourceForkLength: 0,
      };
    }
    const candidate = utils.macBinaryForkCandidates(bytes, { signature: "MThd" })[0];
    if (candidate?.metadata?.macBinary) return { bytes: candidate.bytes, ...candidate.metadata };
    return {
      bytes,
      macBinary: false,
      selectedFork: "raw",
      dataForkLength: bytes.length,
      resourceForkLength: 0,
    };
  }

  function normalizeTempoEvents(events) {
    const normalized = [];
    for (const event of [...(events || [])].sort((left, right) => left.tick - right.tick
      || (left.trackIndex || 0) - (right.trackIndex || 0)
      || (left.eventOrder ?? left.order ?? 0) - (right.eventOrder ?? right.order ?? 0))) {
      const tick = Math.max(0, Math.round(Number(event.tick) || 0));
      const bpm = Math.max(1, Number(event.bpm) || DEFAULT_TEMPO);
      const last = normalized[normalized.length - 1];
      if (last && last.tick === tick) last.bpm = bpm;
      else normalized.push({ tick, bpm });
    }
    if (!normalized.length || normalized[0].tick !== 0) normalized.unshift({ tick: 0, bpm: DEFAULT_TEMPO });
    return normalized.filter((event, index, array) => index === 0 || event.bpm !== array[index - 1].bpm || event.tick === 0);
  }

  function cleanDecodedText(value) {
    return String(value || "")
      .replace(/\0/g, "")
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim();
  }

  function scoreDecodedText(value, encoding = "") {
    const text = cleanDecodedText(value);
    if (!text) return -100000;
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    const controlCount = (text.match(/[\u0080-\u009F]/g) || []).length;
    const mojibakeCount = (text.match(/[ÃÂÐÑØÞæ€ž™œšžŸ]/g) || []).length;
    const hangulCount = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
    const kanaCount = (text.match(/[\u3040-\u30FF]/g) || []).length;
    const halfwidthKanaCount = (text.match(/[\uFF66-\uFF9F]/g) || []).length;
    const hanCount = (text.match(/[\u3400-\u9FFF]/g) || []).length;
    const visibleCount = (text.match(/[^\s]/g) || []).length;
    let score = visibleCount * 2
      - replacementCount * 80
      - controlCount * 24
      - mojibakeCount * 12
      - halfwidthKanaCount * 6;
    if (encoding === "shift_jis") score += kanaCount * 8 + hanCount * 1.2;
    if (encoding === "euc-kr") score += hangulCount * 9 + hanCount * 0.8;
    if (encoding === "gb18030" || encoding === "big5") score += hanCount * 2.2;
    if (encoding === "windows-1252") score -= (hangulCount + kanaCount + halfwidthKanaCount + hanCount) * 3;
    const locale = String(globalThis.navigator?.language || "").toLowerCase();
    if (locale.startsWith("ko") && encoding === "euc-kr") score += 20;
    if (locale.startsWith("ja") && encoding === "shift_jis") score += 20;
    if (/^zh-(tw|hk|mo)/.test(locale) && encoding === "big5") score += 20;
    if (locale.startsWith("zh") && !/^zh-(tw|hk|mo)/.test(locale) && encoding === "gb18030") score += 20;
    return score;
  }

  function decodeMetaText(bytes) {
    const source = asUint8Array(bytes);
    if (!source.length) return "";
    const Decoder = globalThis.TextDecoder;
    if (!Decoder) return cleanDecodedText(Array.from(source, byte => String.fromCharCode(byte)).join(""));

    if (source.length >= 2 && source[0] === 0xff && source[1] === 0xfe) {
      try { return cleanDecodedText(new Decoder("utf-16le").decode(source.subarray(2))); } catch (_) {}
    }
    if (source.length >= 2 && source[0] === 0xfe && source[1] === 0xff) {
      try { return cleanDecodedText(new Decoder("utf-16be").decode(source.subarray(2))); } catch (_) {}
    }
    if (source.length >= 3 && source[0] === 0xef && source[1] === 0xbb && source[2] === 0xbf) {
      try { return cleanDecodedText(new Decoder("utf-8").decode(source.subarray(3))); } catch (_) {}
    }
    if (source.every(value => value < 0x80)) {
      return cleanDecodedText(Array.from(source, value => String.fromCharCode(value)).join(""));
    }
    try {
      return cleanDecodedText(new Decoder("utf-8", { fatal: true }).decode(source));
    } catch (_) {}

    const candidates = [];
    for (const encoding of ["shift_jis", "euc-kr", "big5", "gb18030", "windows-1252"]) {
      try {
        const decoded = cleanDecodedText(new Decoder(encoding, { fatal: true }).decode(source));
        if (decoded) candidates.push({ decoded, score: scoreDecodedText(decoded, encoding) });
      } catch (_) {}
    }
    candidates.sort((left, right) => right.score - left.score);
    if (candidates.length) return candidates[0].decoded;
    try { return cleanDecodedText(new Decoder("utf-8", { fatal: false }).decode(source)); } catch (_) {}
    return cleanDecodedText(Array.from(source, value => String.fromCharCode(value)).join(""));
  }

  class ByteReader {
    constructor(bytes, translate) {
      this.bytes = asUint8Array(bytes);
      this.pos = 0;
      this.translate = translate;
    }
    remaining() { return this.bytes.length - this.pos; }
    readU8() {
      if (this.pos >= this.bytes.length) throw new Error(formatMessage("file.err_eof", [], this.translate));
      return this.bytes[this.pos++];
    }
    readU16() { return ((this.readU8() << 8) | this.readU8()) >>> 0; }
    readU32() {
      return (((this.readU8() << 24) >>> 0) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0;
    }
    readAscii(length) {
      let output = "";
      for (let index = 0; index < length; index++) output += String.fromCharCode(this.readU8());
      return output;
    }
    readBytes(length) {
      if (this.pos + length > this.bytes.length) throw new Error(formatMessage("file.err_eof", [], this.translate));
      const output = this.bytes.slice(this.pos, this.pos + length);
      this.pos += length;
      return output;
    }
    readVarLen() {
      let value = 0;
      for (let index = 0; index < 4; index++) {
        const byte = this.readU8();
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) return value;
      }
      return value;
    }
    skip(length) {
      this.pos = Math.min(this.bytes.length, this.pos + Math.max(0, Number(length) || 0));
    }
  }

  function parseTrack(reader, end, trackIndex, document, translate) {
    let tick = 0;
    let runningStatus = null;
    let eventOrder = 0;
    const meta = document.trackMeta[trackIndex];

    while (reader.pos < end && reader.remaining() > 0) {
      tick += reader.readVarLen();
      document.durationTicks = Math.max(document.durationTicks, tick);
      eventOrder++;
      let status = reader.readU8();
      if (status < 0x80) {
        if (runningStatus == null) throw new Error(formatMessage("midi.err_running_status", [], translate));
        reader.pos--;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const type = reader.readU8();
        const length = reader.readVarLen();
        const data = reader.readBytes(length);
        const base = { tick, trackIndex, eventOrder };
        if (type === 0x51 && data.length === 3) {
          const mpqn = (data[0] << 16) | (data[1] << 8) | data[2];
          if (mpqn > 0) document.tempoEvents.push({ ...base, bpm: 60000000 / mpqn, mpqn });
        } else if (type === 0x58 && data.length >= 2) {
          document.timeSignatures.push({
            ...base,
            numerator: data[0] || 4,
            denominator: 2 ** (data[1] || 0),
            clocksPerMetronome: data[2] ?? 24,
            thirtySecondsPerQuarter: data[3] ?? 8,
          });
        } else if (type === 0x59 && data.length >= 2) {
          document.keySignatures.push({ ...base, sharps: data[0] & 0x80 ? data[0] - 0x100 : data[0], minor: data[1] === 1 });
        } else if (type === 0x03) {
          meta.trackName = decodeMetaText(data);
        } else if (type === 0x04) {
          meta.instrumentName = decodeMetaText(data);
        } else if (type === 0x01 || type === 0x02 || type === 0x05 || type === 0x06 || type === 0x07) {
          document.textEvents.push({ ...base, type, text: decodeMetaText(data) });
        }
        if (type === 0x2f) break;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = reader.readVarLen();
        document.sysexEvents.push({ tick, trackIndex, eventOrder, status, data: reader.readBytes(length) });
        continue;
      }

      if (status >= 0xf0) {
        const systemLength = status === 0xf1 || status === 0xf3 ? 1 : status === 0xf2 ? 2 : 0;
        const data = [];
        for (let index = 0; index < systemLength && reader.pos < end; index++) data.push(reader.readU8());
        document.systemEvents.push({ tick, trackIndex, eventOrder, status, data });
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = reader.readU8();
      const needsSecond = command !== 0xc0 && command !== 0xd0;
      const data2 = needsSecond ? reader.readU8() : 0;
      const base = { tick, trackIndex, eventOrder, channel };

      if (command === 0x80) {
        document.channelEvents.push({ ...base, kind: "noteOff", midi: data1, velocity: data2 });
      } else if (command === 0x90) {
        document.channelEvents.push(data2 > 0
          ? { ...base, kind: "noteOn", midi: data1, velocity: data2 }
          : { ...base, kind: "noteOff", midi: data1, velocity: 0 });
      } else if (command === 0xa0) {
        document.polyPressureEvents.push({ ...base, midi: data1, value: data2 });
      } else if (command === 0xb0) {
        const control = { ...base, controller: data1, value: data2 };
        document.controlChanges.push(control);
        if (data1 === 0) document.channelEvents.push({ ...base, kind: "bankMsb", value: data2 });
        else if (data1 === 32) document.channelEvents.push({ ...base, kind: "bankLsb", value: data2 });
        else if (data1 === 7 || data1 === 10 || data1 === 11) {
          document.channelEvents.push({ ...base, kind: "control", controller: data1, value: data2 });
        }
      } else if (command === 0xc0) {
        const program = { ...base, program: data1 };
        document.programChanges.push(program);
        document.channelEvents.push({ ...base, kind: "program", value: data1 });
      } else if (command === 0xd0) {
        document.channelPressureEvents.push({ ...base, value: data1 });
      } else if (command === 0xe0) {
        document.pitchBendEvents.push({ ...base, value: ((data2 << 7) | data1) - 8192 });
      }
    }
    document.trackEndTicks[trackIndex] = Math.max(document.trackEndTicks[trackIndex] || 0, tick);
    reader.pos = end;
  }

  function buildNotes(document, translate, options = {}) {
    const currentProgram = Array(16).fill(0);
    const pendingBankMsb = Array(16).fill(0);
    const pendingBankLsb = Array(16).fill(0);
    const activeBankMsb = Array(16).fill(0);
    const activeBankLsb = Array(16).fill(0);
    const channelVolume = Array(16).fill(127);
    const channelExpression = Array(16).fill(127);
    const channelPan = Array(16).fill(64);
    const open = new Map();
    const notes = [];

    const events = [...document.channelEvents].sort((left, right) => left.tick - right.tick
      || left.trackIndex - right.trackIndex
      || left.eventOrder - right.eventOrder);

    for (const event of events) {
      const channel = clampInt(event.channel, 0, 15, 0);
      if (event.kind === "bankMsb") {
        pendingBankMsb[channel] = normalizeBank(event.value);
        continue;
      }
      if (event.kind === "bankLsb") {
        pendingBankLsb[channel] = normalizeBank(event.value);
        continue;
      }
      if (event.kind === "program") {
        currentProgram[channel] = normalizeProgram(event.value);
        activeBankMsb[channel] = pendingBankMsb[channel];
        activeBankLsb[channel] = pendingBankLsb[channel];
        const info = document.channelInfo[channel];
        info.programs.add(currentProgram[channel]);
        info.bankPrograms.add(`${activeBankMsb[channel]}:${activeBankLsb[channel]}:${currentProgram[channel]}`);
        continue;
      }
      if (event.kind === "control") {
        if (event.controller === 7) channelVolume[channel] = clampInt(event.value, 0, 127, 127);
        else if (event.controller === 11) channelExpression[channel] = clampInt(event.value, 0, 127, 127);
        else if (event.controller === 10) channelPan[channel] = clampInt(event.value, 0, 127, 64);
        continue;
      }

      const midi = clampInt(event.midi, 0, 127, 0);
      const key = `${channel}:${midi}`;
      if (event.kind === "noteOn") {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push({
          tick: event.tick,
          velocity: clampInt(event.velocity, 1, 127, 1),
          volume: channelVolume[channel],
          expression: channelExpression[channel],
          pan: channelPan[channel],
          channel,
          midi,
          trackIndex: event.trackIndex,
          program: currentProgram[channel],
          bankMsb: activeBankMsb[channel],
          bankLsb: activeBankLsb[channel],
        });
        continue;
      }
      if (event.kind !== "noteOff") continue;
      const queue = open.get(key);
      if (!queue?.length) continue;
      const started = queue.shift();
      if (!queue.length) open.delete(key);
      if (event.tick <= started.tick) continue;
      const meta = document.trackMeta[started.trackIndex] || {};
      const effectiveVelocity = clampInt(Math.round(
        started.velocity * (started.volume / 127) * (started.expression / 127)
      ), 1, 127, started.velocity);
      notes.push({
        startTick: started.tick,
        endTick: event.tick,
        durationTick: event.tick - started.tick,
        midi,
        pitch: midi,
        velocity: started.velocity,
        effectiveVelocity,
        channelVolume: started.volume,
        expression: started.expression,
        pan: started.pan,
        releaseVelocity: clampInt(event.velocity, 0, 127, 0),
        channel,
        trackIndex: started.trackIndex,
        program: started.program,
        bankMsb: started.bankMsb,
        bankLsb: started.bankLsb,
        bank: started.bankMsb * 128 + started.bankLsb,
        trackName: meta.trackName || "",
        instrumentMetaName: meta.instrumentName || "",
      });
      registerNoteChannel(document.channelInfo[channel], channel, midi, started.trackIndex, meta);
    }

    if (open.size) {
      const missingByTrack = new Map();
      for (const queue of open.values()) {
        for (const item of queue) {
          missingByTrack.set(item.trackIndex, (missingByTrack.get(item.trackIndex) || 0) + 1);
          if (!options.closeOpenNotes) continue;
          const endTick = Math.max(item.tick + 1, document.trackEndTicks[item.trackIndex] || document.durationTicks || item.tick + 1);
          const meta = document.trackMeta[item.trackIndex] || {};
          notes.push({
            startTick: item.tick,
            endTick,
            durationTick: endTick - item.tick,
            midi: item.midi,
            pitch: item.midi,
            velocity: item.velocity,
            effectiveVelocity: clampInt(Math.round(
              item.velocity * ((item.volume ?? 127) / 127) * ((item.expression ?? 127) / 127)
            ), 1, 127, item.velocity),
            channelVolume: item.volume ?? 127,
            expression: item.expression ?? 127,
            pan: item.pan ?? 64,
            releaseVelocity: 0,
            channel: item.channel,
            trackIndex: item.trackIndex,
            program: item.program,
            bankMsb: item.bankMsb,
            bankLsb: item.bankLsb,
            bank: item.bankMsb * 128 + item.bankLsb,
            trackName: meta.trackName || "",
            instrumentMetaName: meta.instrumentName || "",
            synthesizedNoteOff: true,
          });
          registerNoteChannel(document.channelInfo[item.channel], item.channel, item.midi, item.trackIndex, meta);
        }
      }
      for (const [trackIndex, count] of [...missingByTrack.entries()].sort((left, right) => left[0] - right[0])) {
        const key = options.closeOpenNotes ? "midi.warn_missing_note_off_closed" : "midi.warn_missing_note_off";
        document.warnings.push(formatMessage(key, [trackIndex + 1, count], translate));
      }
    }

    notes.sort((left, right) => left.startTick - right.startTick
      || left.midi - right.midi
      || left.channel - right.channel
      || left.trackIndex - right.trackIndex);
    return notes;
  }

  function registerNoteChannel(info, channel, midi, trackIndex, meta) {
    info.noteCount++;
    info.tracks.add(trackIndex);
    if (meta?.trackName) info.trackNames.add(meta.trackName);
    if (meta?.instrumentName) info.instrumentNames.add(meta.instrumentName);
    if (channel === 9) info.drumNotes.add(midi);
  }

  function parse(sourceBytes, options = {}) {
    const translate = typeof options.translate === "function" ? options.translate : null;
    const container = normalizeContainer(sourceBytes);
    const reader = new ByteReader(container.bytes, translate);
    if (reader.remaining() < 14 || reader.readAscii(4) !== "MThd") {
      throw new Error(formatMessage("midi.err_header", [], translate));
    }
    const headerLength = reader.readU32();
    if (headerLength < 6 || headerLength > reader.remaining()) {
      throw new Error(formatMessage("midi.err_header_length", [], translate));
    }
    const format = reader.readU16();
    const sourceTrackCount = reader.readU16();
    const divisionRaw = reader.readU16();
    if (format > 2) throw new Error(formatMessage("midi.err_format", [format], translate));
    if (headerLength > 6) reader.skip(headerLength - 6);
    const smpteDivision = (divisionRaw & 0x8000) !== 0;
    const ppq = smpteDivision ? DEFAULT_PPQ : Math.max(1, divisionRaw & 0x7fff);
    const requestedTrackCount = format === 2 && options.type2Policy !== "all"
      ? Math.min(sourceTrackCount, 1)
      : sourceTrackCount;

    const document = {
      version: VERSION,
      format,
      sourceTrackCount,
      trackCount: requestedTrackCount,
      parsedTrackCount: 0,
      divisionRaw,
      division: ppq,
      ppq,
      smpteDivision,
      durationTicks: 0,
      notes: [],
      tempoEvents: [{ tick: 0, bpm: DEFAULT_TEMPO, mpqn: 500000, trackIndex: -1, eventOrder: -1 }],
      timeSignatures: [],
      keySignatures: [],
      textEvents: [],
      programChanges: [],
      controlChanges: [],
      pitchBendEvents: [],
      polyPressureEvents: [],
      channelPressureEvents: [],
      sysexEvents: [],
      systemEvents: [],
      channelEvents: [],
      warnings: [],
      channelInfo: Array.from({ length: 16 }, () => ({
        noteCount: 0,
        programs: new Set(),
        bankPrograms: new Set(),
        tracks: new Set(),
        trackNames: new Set(),
        instrumentNames: new Set(),
        drumNotes: new Set(),
      })),
      trackMeta: Array.from({ length: requestedTrackCount }, () => ({ trackName: "", instrumentName: "" })),
      trackEndTicks: Array(requestedTrackCount).fill(0),
      metadata: {
        macBinary: Boolean(container.macBinary),
        selectedFork: container.selectedFork || (container.macBinary ? "data" : "raw"),
        fileName: container.fileName || "",
        fileType: container.fileType || "",
        creator: container.creator || "",
        dataForkLength: container.dataForkLength,
        resourceForkLength: container.resourceForkLength || 0,
        secondaryHeaderLength: container.secondaryHeaderLength || 0,
        headerCrcValid: container.headerCrcValid ?? null,
      },
    };

    for (let trackIndex = 0; trackIndex < requestedTrackCount; trackIndex++) {
      if (reader.remaining() < 8) break;
      const id = reader.readAscii(4);
      const length = reader.readU32();
      if (id !== "MTrk") throw new Error(formatMessage("midi.err_track_header", [trackIndex + 1], translate));
      if (length > reader.remaining()) throw new Error(formatMessage("file.err_eof", [], translate));
      const trackBytes = reader.readBytes(length);
      const trackReader = new ByteReader(trackBytes, translate);
      parseTrack(trackReader, trackBytes.length, trackIndex, document, translate);
      document.parsedTrackCount++;
    }

    document.trackCount = document.parsedTrackCount;
    document.notes = buildNotes(document, translate, options);
    document.durationTicks = Math.max(document.durationTicks, ...document.notes.map(note => note.endTick), 0);
    document.tempoEvents.sort((left, right) => left.tick - right.tick || (left.trackIndex || 0) - (right.trackIndex || 0) || (left.eventOrder || 0) - (right.eventOrder || 0));
    document.timeSignatures.sort((left, right) => left.tick - right.tick);
    document.keySignatures.sort((left, right) => left.tick - right.tick);
    return document;
  }

  root.MabiMidiParser = Object.freeze({
    version: VERSION,
    parse,
    asUint8Array,
    asciiAt,
    looksLikeMacBinary,
    extractMacBinaryDataFork,
    normalizeContainer,
    normalizeTempoEvents,
    normalizeProgram,
    normalizeBank,
    melodicChannels: MELODIC_CHANNELS,
    defaultMelodicChannel,
    decodeMetaText,
  });
})();
