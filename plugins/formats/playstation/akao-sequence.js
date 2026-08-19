(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  const consoleGm = root.MabiConsoleGM;
  if (!core) throw new Error("music-format-core.js must be loaded before akao-sequence.js");
  if (!consoleGm) throw new Error("console-gm-normalizer.js must be loaded before akao-sequence.js");

  const asBytes = core.asUint8Array;
  const PPQ = 0x30;
  const NOTE_VELOCITY = 127;
  const DELTA_TIME_TABLE = Object.freeze([192, 96, 48, 24, 12, 6, 3, 32, 16, 8, 4]);
  const MELODIC_CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);

  function asciiAt(bytes, offset, text) {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
    return true;
  }

  function le16(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) throw new Error("AKAO 16비트 값을 읽을 수 없습니다.");
    return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  }

  function sle16(bytes, offset) {
    const value = le16(bytes, offset);
    return value & 0x8000 ? value - 0x10000 : value;
  }

  function le32(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) throw new Error("AKAO 32비트 값을 읽을 수 없습니다.");
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
  }

  function signed8(value) {
    return value & 0x80 ? value - 0x100 : value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function popcount32(value) {
    let v = value >>> 0;
    let count = 0;
    while (v) {
      v &= v - 1;
      count++;
    }
    return count;
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

  function midiHeader(format, tracks, division) {
    const out = [0x4d, 0x54, 0x68, 0x64];
    pushBe32(out, 6);
    pushBe16(out, format);
    pushBe16(out, tracks);
    pushBe16(out, division);
    return out;
  }

  function textMeta(type, text) {
    const encoded = Array.from(String(text || ""), ch => ch.charCodeAt(0) & 0x7f);
    return [0xff, type & 0x7f, ...vlq(encoded.length), ...encoded];
  }

  function midiTrack(events, name, endTick = 0) {
    let serial = 0;
    const source = [...events];
    if (name) source.push({ tick: 0, priority: -20, order: serial++, bytes: textMeta(0x03, name) });
    source.sort((left, right) => (left.tick - right.tick)
      || ((left.priority || 0) - (right.priority || 0))
      || ((left.order || 0) - (right.order || 0)));

    const payload = [];
    let tick = 0;
    for (const event of source) {
      const eventTick = Math.max(tick, Math.round(Number(event.tick) || 0));
      payload.push(...vlq(eventTick - tick), ...(event.bytes || []));
      tick = eventTick;
    }
    const finishTick = Math.max(tick, Math.round(Number(endTick) || 0));
    payload.push(...vlq(finishTick - tick), 0xff, 0x2f, 0x00);

    const out = [0x4d, 0x54, 0x72, 0x6b];
    pushBe32(out, payload.length);
    out.push(...payload);
    return out;
  }

  function rawTempoToBpm(rawTempo, version = 2) {
    if (!rawTempo) return 1;
    // AKAO v1.0 (FF7) uses a slightly different timer from v1.1+.
    // VGMTrans uses 0x43D1 for v1.0 and 0x44E8 for later PS1 AKAO.
    const frequency = Number(version) === 1 ? 0x43d1 : 0x44e8;
    return 60 / (PPQ * (65536 / rawTempo) * (frequency / (33868800 / 8)));
  }

  function tempoBytes(rawTempo, version = 2) {
    const bpm = Math.max(1, rawTempoToBpm(rawTempo, version));
    const mpqn = Math.max(1, Math.min(0xffffff, Math.round(60000000 / bpm)));
    return [0xff, 0x51, 0x03, (mpqn >>> 16) & 0xff, (mpqn >>> 8) & 0xff, mpqn & 0xff];
  }

  function denominatorPower(denominator) {
    const safe = Math.max(1, Number(denominator) || 4);
    return clamp(Math.round(Math.log2(safe)), 0, 7);
  }

  const BASE_ARG_LENGTH = Object.freeze({
    0xa0: 0, 0xa1: 1, 0xa2: 1, 0xa3: 1, 0xa4: 2, 0xa5: 1, 0xa6: 0, 0xa7: 0,
    0xa8: 1, 0xa9: 2, 0xaa: 1, 0xab: 2, 0xac: 1, 0xad: 1, 0xae: 1, 0xaf: 1,
    0xb0: 2, 0xb1: 1, 0xb2: 1, 0xb3: 0, 0xb4: 3, 0xb5: 1, 0xb6: 0, 0xb7: 1,
    0xb8: 3, 0xb9: 1, 0xba: 0, 0xbb: 1, 0xbc: 2, 0xbd: 1, 0xbe: 0, 0xbf: 1,
    0xc0: 1, 0xc1: 1, 0xc2: 0, 0xc3: 0, 0xc4: 0, 0xc5: 0, 0xc6: 0, 0xc7: 0,
    0xc8: 0, 0xc9: 1, 0xca: 0, 0xcb: 0, 0xcc: 0, 0xcd: 0, 0xce: 1, 0xcf: 1,
    0xd0: 0, 0xd1: 0, 0xd2: 1, 0xd3: 1, 0xd4: 0, 0xd5: 0, 0xd6: 0, 0xd7: 0,
    0xd8: 1, 0xd9: 1, 0xda: 1, 0xdb: 0, 0xdc: 1, 0xdd: 2, 0xde: 2, 0xdf: 2,
    0xe0: 0,
  });

  // AKAO v1.2/v2: 0xFC introduces the extended opcode table.
  const FC_ARG_LENGTH = Object.freeze({
    0x00: 2, 0x01: 3, 0x02: 2, 0x03: 3, 0x04: 2, 0x05: 0, 0x06: 2, 0x07: 3,
    0x08: 3, 0x09: 3, 0x0a: 1, 0x0b: 0, 0x0c: 2, 0x0d: 0, 0x0e: 1, 0x0f: 2,
    0x10: 1, 0x11: 0, 0x12: 2, 0x14: 2, 0x15: 2, 0x16: 2, 0x17: 0, 0x18: 0,
  });

  function normalizeVersionHint(value) {
    const text = String(value == null ? "" : value).trim().toLowerCase();
    if (value === 1 || text === "1" || text === "1.0" || text === "v1" || text === "v1.0" || text === "version_1_0") return 1;
    if (value === 2 || text === "2" || text === "2.0" || text === "v2" || text === "v2.0" || text === "version_2") return 2;
    return 0;
  }

  function isBcdByte(value) {
    return ((value >>> 4) & 0x0f) <= 9 && (value & 0x0f) <= 9;
  }

  function plausibleV1Timestamp(view, offset) {
    if (offset + 0x10 > view.length) return false;
    for (let index = 0x0a; index <= 0x0f; index++) if (!isBcdByte(view[offset + index])) return false;
    const month = ((view[offset + 0x0b] >>> 4) * 10) + (view[offset + 0x0b] & 0x0f);
    const day = ((view[offset + 0x0c] >>> 4) * 10) + (view[offset + 0x0c] & 0x0f);
    const hour = ((view[offset + 0x0d] >>> 4) * 10) + (view[offset + 0x0d] & 0x0f);
    const minute = ((view[offset + 0x0e] >>> 4) * 10) + (view[offset + 0x0e] & 0x0f);
    const second = ((view[offset + 0x0f] >>> 4) * 10) + (view[offset + 0x0f] & 0x0f);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59;
  }

  function readTrackOffsets(view, offset, totalSize, trackCount, pointerTableOffset) {
    if (offset + pointerTableOffset + trackCount * 2 > offset + totalSize) return null;
    const trackOffsets = [];
    for (let index = 0; index < trackCount; index++) {
      const pointerPos = pointerTableOffset + index * 2;
      const relative = le16(view, offset + pointerPos);
      const localOffset = pointerPos + 2 + relative;
      if (localOffset < pointerTableOffset || localOffset >= totalSize) return null;
      trackOffsets.push(localOffset);
    }
    return trackOffsets;
  }

  function inspectHeader(bytes, offset = 0, options = {}) {
    const view = asBytes(bytes);
    if (!asciiAt(view, offset, "AKAO")) return null;
    if (offset + 0x14 > view.length) return null;

    const sequenceId = le16(view, offset + 4);
    const storedSize = le16(view, offset + 6);
    const totalSize = 0x10 + storedSize;
    const end = offset + totalSize;
    const trackMask = le32(view, offset + 0x10);
    const trackCount = popcount32(trackMask);
    if (!storedSize || end > view.length || !trackMask || (trackMask & ~0x00ffffff) !== 0) return null;
    if (trackCount < 1 || trackCount > 24) return null;

    // AKAO v2: 0x20-byte header, and the word at +0x1C is zero.
    if (offset + 0x20 <= end && le32(view, offset + 0x1c) === 0) {
      const trackOffsets = readTrackOffsets(view, offset, totalSize, trackCount, 0x20);
      if (trackOffsets) {
        return { sequenceId, storedSize, totalSize, end, trackMask, trackCount, trackOffsets, version: 2, versionLabel: "2" };
      }
    }

    // AKAO v1.x: 0x14-byte header with a six-byte BCD timestamp at +0x0A.
    // v1.0 and v1.1 cannot be distinguished reliably from the header alone,
    // so exact v1.0 parsing is enabled by the xSF game/tag hint (FF7).
    if (plausibleV1Timestamp(view, offset)) {
      const trackOffsets = readTrackOffsets(view, offset, totalSize, trackCount, 0x14);
      if (trackOffsets) {
        const hint = normalizeVersionHint(options.versionHint);
        return {
          sequenceId, storedSize, totalSize, end, trackMask, trackCount, trackOffsets,
          version: hint === 1 ? 1 : null,
          versionFamily: 1,
          versionLabel: hint === 1 ? "1.0" : "1.x",
          needsVersionHint: hint !== 1,
        };
      }
    }
    return null;
  }

  function detect(bytes, offset = 0, options = {}) {
    return Boolean(inspectHeader(bytes, offset, options));
  }

  function find(bytes, start = 0, options = {}) {
    const view = asBytes(bytes);
    for (let offset = Math.max(0, start | 0); offset + 0x14 <= view.length; offset++) {
      if (view[offset] !== 0x41 || view[offset + 1] !== 0x4b || view[offset + 2] !== 0x41 || view[offset + 3] !== 0x4f) continue;
      if (inspectHeader(view, offset, options)) return offset;
    }
    return -1;
  }

  function readByte(view, state, limit) {
    if (state.pc >= limit) throw new Error("AKAO 이벤트가 데이터 끝에서 잘렸습니다.");
    return view[state.pc++];
  }

  function skipBytes(state, count, limit) {
    const next = state.pc + Math.max(0, count | 0);
    if (next > limit) throw new Error("AKAO 이벤트 인수가 데이터 끝을 벗어났습니다.");
    state.pc = next;
  }

  function addMidiEvent(state, tick, bytes, priority = 0) {
    state.events.push({ tick: Math.max(0, Math.round(tick)), bytes, priority, order: state.eventOrder++ });
  }

  function controlValueAt(state, name, tick) {
    const fadeKey = `${name}Fade`;
    const fade = state[fadeKey];
    if (!fade) return state[name];
    if (tick >= fade.endTick) {
      state[name] = fade.target;
      state[fadeKey] = null;
      return state[name];
    }
    if (tick <= fade.startTick) return fade.start;
    const ratio = (tick - fade.startTick) / Math.max(1, fade.endTick - fade.startTick);
    return clamp(Math.round(fade.start + (fade.target - fade.start) * ratio), 0, 127);
  }

  function setControlValue(state, name, value) {
    state[name] = clamp(value, 0, 127);
    state[`${name}Fade`] = null;
    return state[name];
  }

  function setControlFade(state, name, target, length) {
    const start = controlValueAt(state, name, state.tick);
    state[`${name}Fade`] = {
      startTick: state.tick,
      endTick: state.tick + Math.max(1, length),
      start,
      target: clamp(target, 0, 127),
    };
  }

  function emitControlFade(state, name, target, length, controller, channel) {
    const start = controlValueAt(state, name, state.tick);
    const targetValue = clamp(target, 0, 127);
    const duration = Math.max(1, length | 0);
    setControlFade(state, name, targetValue, duration);
    const steps = Math.min(32, Math.max(1, Math.ceil(duration / 6)));
    for (let index = 1; index <= steps; index++) {
      const ratio = index / steps;
      const tick = state.tick + Math.round(duration * ratio);
      const value = clamp(Math.round(start + (targetValue - start) * ratio), 0, 127);
      addMidiEvent(state, tick, [0xb0 | channel, controller & 0x7f, value & 0x7f], -2);
    }
  }

  function emitTempoFade(state, rawTempo, length) {
    const target = Math.max(1, rawTempo | 0);
    const start = Math.max(1, state.rawTempo || target);
    const duration = Math.max(1, length | 0);
    const steps = Math.min(32, Math.max(1, Math.ceil(duration / 6)));
    for (let index = 1; index <= steps; index++) {
      const ratio = index / steps;
      const tick = state.tick + Math.round(duration * ratio);
      const value = Math.max(1, Math.round(start + (target - start) * ratio));
      addMidiEvent(state, tick, tempoBytes(value, state.version), -15);
    }
    state.rawTempo = target;
  }

  function emitNoteState(state, note) {
    const channel = note.channel;
    if (channel !== 9) {
      addMidiEvent(state, note.start, [0xb0 | channel, 0x00, note.bankMsb & 0x7f], -5);
      addMidiEvent(state, note.start, [0xb0 | channel, 0x20, note.bankLsb & 0x7f], -4);
      addMidiEvent(state, note.start, [0xc0 | channel, note.program & 0x7f], -3);
    }
    addMidiEvent(state, note.start, [0xb0 | channel, 0x07, note.volume & 0x7f], -2);
    addMidiEvent(state, note.start, [0xb0 | channel, 0x0a, note.pan & 0x7f], -2);
    addMidiEvent(state, note.start, [0xb0 | channel, 0x0b, note.expression & 0x7f], -2);
    addMidiEvent(state, note.start, [0x90 | channel, note.key & 0x7f, note.velocity & 0x7f], 1);
    addMidiEvent(state, note.end, [0x80 | channel, note.key & 0x7f, 0], -10);
  }

  function keySplitProgram(context, absoluteAddress) {
    if (!context.keySplitPrograms.has(absoluteAddress)) {
      context.keySplitPrograms.set(absoluteAddress, context.keySplitPrograms.size & 0x7f);
    }
    return context.keySplitPrograms.get(absoluteAddress);
  }

  function parseTrack(view, seqOffset, header, trackIndex, context, options) {
    const start = seqOffset + header.trackOffsets[trackIndex];
    const limit = seqOffset + header.totalSize;
    const melodicChannel = root.MabiMidiParser?.defaultMelodicChannel
      ? root.MabiMidiParser.defaultMelodicChannel(trackIndex)
      : MELODIC_CHANNELS[trackIndex % MELODIC_CHANNELS.length];
    const state = {
      pc: start,
      tick: 0,
      octave: 4,
      transpose: 0,
      volume: 127,
      volumeFade: null,
      expression: 127,
      expressionFade: null,
      pan: 64,
      panFade: null,
      rawTempo: 0,
      version: header.version,
      program: 0,
      bankMsb: 0,
      bankLsb: 0,
      drum: false,
      slur: false,
      legato: false,
      lastDeltaTime: 0,
      oneTimeDelta: null,
      deltaOverwrite: 0,
      lastNote: null,
      loopStack: [],
      jumpVisits: new Map(),
      events: [],
      eventOrder: 0,
      sourceEventCount: 0,
      truncatedLoopCount: 0,
      unsupportedOpcodes: [],
      ended: false,
    };
    const maxEvents = Math.max(1000, Number(options.maxEventsPerTrack) || 250000);
    const maxFiniteLoopCount = Math.max(1, Number(options.maxFiniteLoopCount) || 16);
    const infiniteLoopCount = Math.max(1, Number(options.infiniteLoopCount) || 2);

    function localPosition() { return state.pc - seqOffset; }
    function validDestination(destination) { return destination >= seqOffset && destination < limit; }
    function jumpTo(destination, maxVisits = infiniteLoopCount) {
      if (!validDestination(destination)) return false;
      const visits = (state.jumpVisits.get(destination) || 0) + 1;
      state.jumpVisits.set(destination, visits);
      if (visits > maxVisits) {
        state.truncatedLoopCount++;
        return false;
      }
      state.pc = destination;
      return true;
    }

    while (state.pc < limit && state.sourceEventCount < maxEvents) {
      const begin = state.pc;
      const status = readByte(view, state, limit);
      state.sourceEventCount++;

      if (status <= 0x99) {
        const noteByte = status;
        const isRest = noteByte >= 0x8f;
        const isTie = !isRest && noteByte >= 0x83;
        const isNote = !isRest && !isTie;
        const tableDelta = DELTA_TIME_TABLE[noteByte % 11];
        let delta = 0;
        if (state.oneTimeDelta != null) {
          delta = state.oneTimeDelta;
          state.oneTimeDelta = null;
        }
        if (state.deltaOverwrite) delta = state.deltaOverwrite;
        if (!delta) delta = tableDelta;
        state.lastDeltaTime = delta;
        const duration = (state.slur || state.legato) ? delta : Math.max(delta - 2, 0);

        if (isNote) {
          const relativeKey = Math.floor(noteByte / 11);
          const sourceKey = state.drum ? 24 + relativeKey : state.octave * 12 + relativeKey + state.transpose;
          const key = state.drum ? consoleGm.akaoV12DrumKey(sourceKey) : clamp(sourceKey, 0, 127);
          if (state.drum && key !== sourceKey) context.drumKeyRemappedCount++;
          const note = {
            start: state.tick,
            end: state.tick + Math.max(1, duration),
            key,
            channel: state.drum ? 9 : melodicChannel,
            program: state.program,
            bankMsb: state.bankMsb,
            bankLsb: state.bankLsb,
            volume: controlValueAt(state, "volume", state.tick),
            expression: controlValueAt(state, "expression", state.tick),
            pan: controlValueAt(state, "pan", state.tick),
            // AKAO loudness lives in volume/expression controllers. Keep the
            // Note On velocity neutral/full so it is not applied twice.
            velocity: NOTE_VELOCITY,
          };
          emitNoteState(state, note);
          state.lastNote = note;
          context.noteCount++;
          state.tick += delta;
        } else if (isTie) {
          if (state.lastNote) {
            const oldEnd = state.lastNote.end;
            const newEnd = Math.max(oldEnd, state.tick + Math.max(1, duration));
            if (newEnd !== oldEnd) {
              // Replace the Note Off emitted for the previous duration with the extended one.
              for (let i = state.events.length - 1; i >= 0; i--) {
                const event = state.events[i];
                if (event.tick === oldEnd && (event.bytes?.[0] & 0xf0) === 0x80
                  && (event.bytes?.[0] & 0x0f) === state.lastNote.channel && event.bytes?.[1] === state.lastNote.key) {
                  event.tick = newEnd;
                  break;
                }
              }
              state.lastNote.end = newEnd;
            }
          }
          state.tick += delta;
        } else {
          state.tick += delta;
        }
        continue;
      }

      if (status >= 0x9a && status <= 0x9f) {
        state.unsupportedOpcodes.push({ offset: begin - seqOffset, opcode: status });
        break;
      }

      if (status === 0xfc && header.version === 2) {
        const sub = readByte(view, state, limit);
        const operandPos = state.pc;
        switch (sub) {
          case 0x00: { // Tempo
            const rawTempo = le16(view, state.pc);
            skipBytes(state, 2, limit);
            state.rawTempo = rawTempo;
            addMidiEvent(state, state.tick, tempoBytes(rawTempo, state.version), -15);
            break;
          }
          case 0x01: { // Tempo fade
            const rawLength = readByte(view, state, limit);
            const length = rawLength === 0 ? 256 : rawLength;
            const rawTempo = le16(view, state.pc);
            skipBytes(state, 2, limit);
            emitTempoFade(state, rawTempo, length);
            break;
          }
          case 0x02: // Reverb depth
            skipBytes(state, 2, limit);
            break;
          case 0x03: // Reverb depth fade
            skipBytes(state, 3, limit);
            break;
          case 0x04: // Drum kit on (v1/v2 points to an instrument structure)
            skipBytes(state, 2, limit);
            state.drum = true;
            state.bankMsb = 0;
            state.bankLsb = 0;
            break;
          case 0x05:
            state.drum = false;
            break;
          case 0x06: { // Unconditional relative jump
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const destination = state.pc + relative;
            if (!jumpTo(destination)) state.ended = true;
            break;
          }
          case 0x07: { // CPU conditional jump; VGMTrans's default conversion condition is 0.
            const targetValue = readByte(view, state, limit);
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const destination = state.pc + relative;
            if (targetValue === 0 && !jumpTo(destination)) state.ended = true;
            break;
          }
          case 0x08: { // Loop branch
            const rawCount = readByte(view, state, limit);
            const count = rawCount === 0 ? 256 : rawCount;
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const loop = state.loopStack[state.loopStack.length - 1];
            if (loop && loop.iteration + 1 === count) {
              const destination = state.pc + relative;
              if (!validDestination(destination)) state.ended = true;
              else state.pc = destination;
            }
            break;
          }
          case 0x09: { // Loop break
            const rawCount = readByte(view, state, limit);
            const count = rawCount === 0 ? 256 : rawCount;
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const loop = state.loopStack[state.loopStack.length - 1];
            if (loop && loop.iteration + 1 === count) {
              const destination = state.pc + relative;
              if (!validDestination(destination)) state.ended = true;
              else state.pc = destination;
            }
            if (loop) state.loopStack.pop();
            break;
          }
          case 0x0a: // Program change without attack sample
            state.program = consoleGm.normalizeMelodicProgram(readByte(view, state, limit));
            state.bankMsb = 0;
            state.bankLsb = 0;
            break;
          case 0x0b:
            break;
          case 0x0c:
            skipBytes(state, 2, limit);
            break;
          case 0x0d:
            break;
          case 0x0e:
            skipBytes(state, 1, limit);
            break;
          case 0x0f:
            skipBytes(state, 2, limit);
            break;
          case 0x10:
            skipBytes(state, 1, limit);
            break;
          case 0x11:
            break;
          case 0x12: { // Volume fade
            const rawLength = readByte(view, state, limit);
            const length = rawLength === 0 ? 256 : rawLength;
            const volume = readByte(view, state, limit) & 0x7f;
            emitControlFade(state, "volume", volume, length, 0x07, state.drum ? 9 : melodicChannel);
            break;
          }
          case 0x14: { // Key-split/custom instrument
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const instrumentAddress = state.pc + relative;
            // AKAO key-split instruments live in a proprietary bank. Keep a
            // deterministic program proxy, but collapse it to GM Bank 0 so any
            // complete GM SoundFont can preview it.
            state.bankMsb = 0;
            state.bankLsb = 0;
            state.program = consoleGm.normalizeMelodicProgram(keySplitProgram(context, instrumentAddress));
            context.customBankCollapsedCount++;
            break;
          }
          case 0x15: { // Time signature
            const ticksPerBeat = readByte(view, state, limit);
            const beatsPerMeasure = readByte(view, state, limit);
            if (ticksPerBeat && beatsPerMeasure) {
              const denominator = (PPQ * 4) / ticksPerBeat;
              addMidiEvent(state, state.tick, [0xff, 0x58, 0x04,
                beatsPerMeasure & 0xff, denominatorPower(denominator), ticksPerBeat & 0xff, 8], -14);
            }
            break;
          }
          case 0x16: // Measure marker
            skipBytes(state, 2, limit);
            break;
          default: {
            const knownLength = FC_ARG_LENGTH[sub];
            if (knownLength == null) {
              state.unsupportedOpcodes.push({ offset: begin - seqOffset, opcode: 0xfc, subOpcode: sub });
              state.ended = true;
            } else {
              skipBytes(state, knownLength, limit);
            }
            break;
          }
        }
        if (state.ended) break;
        continue;
      }

      if (header.version === 1 && status >= 0xe8) {
        switch (status) {
          case 0xe8: { // Tempo (AKAO v1.0 direct opcode)
            const rawTempo = le16(view, state.pc);
            skipBytes(state, 2, limit);
            state.rawTempo = rawTempo;
            addMidiEvent(state, state.tick, tempoBytes(rawTempo, 1), -15);
            break;
          }
          case 0xe9: { // Tempo fade
            const rawLength = readByte(view, state, limit);
            const length = rawLength === 0 ? 256 : rawLength;
            const rawTempo = le16(view, state.pc);
            skipBytes(state, 2, limit);
            emitTempoFade(state, rawTempo, length);
            break;
          }
          case 0xea: // Reverb depth
            skipBytes(state, 2, limit);
            break;
          case 0xeb: // Reverb depth fade
            skipBytes(state, 3, limit);
            break;
          case 0xec: { // Drum kit on (relative pointer follows the operand)
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const drumAddress = state.pc + relative;
            if (validDestination(drumAddress)) context.drumInstrumentAddresses.add(drumAddress);
            state.drum = true;
            state.bankMsb = 0;
            state.bankLsb = 0;
            break;
          }
          case 0xed:
            state.drum = false;
            break;
          case 0xee: { // Unconditional relative jump
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const destination = state.pc + relative;
            if (!jumpTo(destination)) state.ended = true;
            break;
          }
          case 0xef: { // CPU conditional jump; use the same default condition (0) as v2 conversion.
            const targetValue = readByte(view, state, limit);
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const destination = state.pc + relative;
            if (targetValue === 0 && !jumpTo(destination)) state.ended = true;
            break;
          }
          case 0xf0: { // Loop branch
            const rawCount = readByte(view, state, limit);
            const count = rawCount === 0 ? 256 : rawCount;
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const loop = state.loopStack[state.loopStack.length - 1];
            if (loop && loop.iteration + 1 === count) {
              const destination = state.pc + relative;
              if (!validDestination(destination)) state.ended = true;
              else state.pc = destination;
            }
            break;
          }
          case 0xf1: { // Loop break
            const rawCount = readByte(view, state, limit);
            const count = rawCount === 0 ? 256 : rawCount;
            const relative = sle16(view, state.pc);
            skipBytes(state, 2, limit);
            const loop = state.loopStack[state.loopStack.length - 1];
            if (loop && loop.iteration + 1 === count) {
              const destination = state.pc + relative;
              if (!validDestination(destination)) state.ended = true;
              else state.pc = destination;
            }
            if (loop) state.loopStack.pop();
            break;
          }
          case 0xf2: // Program change without attack sample
            state.program = consoleGm.normalizeMelodicProgram(readByte(view, state, limit));
            state.bankMsb = 0;
            state.bankLsb = 0;
            break;
          case 0xf3: // FF7-specific unknown event; VGMTrans treats it as zero-argument and continues.
            context.ignoredV1OpcodeCount++;
            break;
          case 0xf4: { // Overlay voice on: preserve the primary articulation as the preview program.
            const primary = readByte(view, state, limit);
            readByte(view, state, limit); // secondary articulation
            state.program = consoleGm.normalizeMelodicProgram(primary);
            state.bankMsb = 0;
            state.bankLsb = 0;
            context.overlayVoiceCount++;
            break;
          }
          case 0xf5: // Overlay voice off
            break;
          case 0xf6: // Overlay volume balance
            skipBytes(state, 1, limit);
            break;
          case 0xf7: // Overlay volume balance fade
            skipBytes(state, 2, limit);
            break;
          case 0xf8: // Alternate voice on (release rate)
            skipBytes(state, 1, limit);
            break;
          case 0xf9: // Alternate voice off
            break;
          case 0xfd: { // Time signature
            const ticksPerBeat = readByte(view, state, limit);
            const beatsPerMeasure = readByte(view, state, limit);
            if (ticksPerBeat && beatsPerMeasure) {
              const denominator = (PPQ * 4) / ticksPerBeat;
              addMidiEvent(state, state.tick, [0xff, 0x58, 0x04,
                beatsPerMeasure & 0xff, denominatorPower(denominator), ticksPerBeat & 0xff, 8], -14);
            }
            break;
          }
          case 0xfe: // Measure marker
            skipBytes(state, 2, limit);
            break;
          default:
            // v1.0 maps E0-E7 and FA-FC/FF to unimplemented commands.
            // Stop rather than guessing argument lengths and desynchronizing the stream.
            state.unsupportedOpcodes.push({ offset: begin - seqOffset, opcode: status });
            state.ended = true;
            break;
        }
        if (state.ended) break;
        continue;
      }

      if (!(status in BASE_ARG_LENGTH)) {
        state.unsupportedOpcodes.push({ offset: begin - seqOffset, opcode: status });
        break;
      }

      switch (status) {
        case 0xa0:
          state.ended = true;
          break;
        case 0xa1:
          state.program = consoleGm.normalizeMelodicProgram(readByte(view, state, limit));
          state.bankMsb = 0;
          state.bankLsb = 0;
          break;
        case 0xa2: {
          const delta = readByte(view, state, limit);
          state.lastDeltaTime = delta;
          state.oneTimeDelta = delta;
          break;
        }
        case 0xa3:
          setControlValue(state, "volume", readByte(view, state, limit) & 0x7f);
          addMidiEvent(state, state.tick, [0xb0 | melodicChannel, 0x07, state.volume], -2);
          break;
        case 0xa4:
          skipBytes(state, 2, limit); // Pitch slide is intentionally not flattened into coarse MIDI bends.
          break;
        case 0xa5:
          state.octave = readByte(view, state, limit) & 0x0f;
          break;
        case 0xa6:
          state.octave = (state.octave + 1) & 0x0f;
          break;
        case 0xa7:
          state.octave = (state.octave - 1) & 0x0f;
          break;
        case 0xa8:
          setControlValue(state, "expression", readByte(view, state, limit) & 0x7f);
          addMidiEvent(state, state.tick, [0xb0 | melodicChannel, 0x0b, state.expression], -2);
          break;
        case 0xa9: {
          const rawLength = readByte(view, state, limit);
          const length = rawLength === 0 ? 256 : rawLength;
          const expression = readByte(view, state, limit) & 0x7f;
          emitControlFade(state, "expression", expression, length, 0x0b, state.drum ? 9 : melodicChannel);
          break;
        }
        case 0xaa:
          setControlValue(state, "pan", readByte(view, state, limit) & 0x7f);
          addMidiEvent(state, state.tick, [0xb0 | melodicChannel, 0x0a, state.pan], -2);
          break;
        case 0xab: {
          const rawLength = readByte(view, state, limit);
          const length = rawLength === 0 ? 256 : rawLength;
          const pan = readByte(view, state, limit) & 0x7f;
          emitControlFade(state, "pan", pan, length, 0x0a, state.drum ? 9 : melodicChannel);
          break;
        }
        case 0xc0:
          state.transpose = signed8(readByte(view, state, limit));
          break;
        case 0xc1:
          state.transpose += signed8(readByte(view, state, limit));
          break;
        case 0xc8:
          state.loopStack.push({ start: state.pc, iteration: 0 });
          if (state.loopStack.length > 4) state.loopStack.shift();
          break;
        case 0xc9: {
          const rawCount = readByte(view, state, limit);
          const requestedCount = rawCount === 0 ? 256 : rawCount;
          const count = Math.min(requestedCount, maxFiniteLoopCount);
          const loop = state.loopStack[state.loopStack.length - 1];
          // Some retail AKAO streams jump into a shared tail immediately after its C8.
          // If no local C8 was seen, treating C9 as a one-pass delimiter is safer than jumping to address 0.
          if (loop) {
            loop.iteration++;
            if (loop.iteration >= count) state.loopStack.pop();
            else state.pc = loop.start;
            if (requestedCount > count) state.truncatedLoopCount++;
          }
          break;
        }
        case 0xca: { // Repeat again / infinite loop
          const loop = state.loopStack[state.loopStack.length - 1];
          if (!loop) break;
          loop.iteration++;
          if (loop.iteration < infiniteLoopCount) state.pc = loop.start;
          else {
            state.loopStack.pop();
            state.truncatedLoopCount++;
          }
          break;
        }
        case 0xcc:
          state.slur = true;
          break;
        case 0xcd:
          state.slur = false;
          break;
        case 0xd0:
          state.legato = true;
          break;
        case 0xd1:
          state.legato = false;
          break;
        case 0xdc: {
          const relativeLength = signed8(readByte(view, state, limit));
          state.deltaOverwrite = clamp(state.lastDeltaTime + relativeLength, 1, 255);
          break;
        }
        default:
          skipBytes(state, BASE_ARG_LENGTH[status], limit);
          break;
      }

      if (state.ended) break;
    }

    if (state.sourceEventCount >= maxEvents) {
      state.truncatedLoopCount++;
      context.warnings.push(`AKAO Track ${trackIndex + 1}: 이벤트 제한(${maxEvents})에 도달하여 반복을 종료했습니다.`);
    }
    if (state.unsupportedOpcodes.length) {
      const first = state.unsupportedOpcodes[0];
      const op = first.opcode === 0xfc
        ? `FC ${first.subOpcode.toString(16).padStart(2, "0")}`
        : first.opcode.toString(16).padStart(2, "0");
      context.warnings.push(`AKAO Track ${trackIndex + 1}: 지원하지 않는 opcode ${op} @ 0x${first.offset.toString(16)} 이후를 생략했습니다.`);
    }

    return {
      events: state.events,
      endTick: state.tick,
      eventCount: state.sourceEventCount,
      truncatedLoopCount: state.truncatedLoopCount,
      unsupportedOpcodes: state.unsupportedOpcodes,
      startOffset: header.trackOffsets[trackIndex],
    };
  }

  function parse(bytes, offset = 0, options = {}) {
    const view = asBytes(bytes);
    const header = inspectHeader(view, offset, options);
    if (!header) throw new Error("지원 가능한 AKAO v1/v2 시퀀스 헤더를 찾지 못했습니다.");
    if (header.versionFamily === 1 && header.needsVersionHint) {
      throw new Error("AKAO v1 계열 시퀀스를 찾았지만 v1.0/v1.1을 헤더만으로 구분할 수 없습니다. 게임 태그 또는 명시적 버전 정보가 필요합니다.");
    }

    const context = {
      noteCount: 0,
      keySplitPrograms: new Map(),
      drumInstrumentAddresses: new Set(),
      drumKeyRemappedCount: 0,
      customBankCollapsedCount: 0,
      ignoredV1OpcodeCount: 0,
      overlayVoiceCount: 0,
      warnings: [],
    };
    const parsedTracks = [];
    for (let trackIndex = 0; trackIndex < header.trackCount; trackIndex++) {
      parsedTracks.push(parseTrack(view, offset, header, trackIndex, context, options));
    }

    const chunks = [...midiHeader(1, parsedTracks.length, PPQ)];
    for (let index = 0; index < parsedTracks.length; index++) {
      const track = parsedTracks[index];
      chunks.push(...midiTrack(track.events, `AKAO Track ${index + 1}`, track.endTick));
    }

    const eventCount = parsedTracks.reduce((sum, track) => sum + track.eventCount, 0);
    const truncatedLoopCount = parsedTracks.reduce((sum, track) => sum + track.truncatedLoopCount, 0);
    const unsupportedOpcodeCount = parsedTracks.reduce((sum, track) => sum + track.unsupportedOpcodes.length, 0);

    return {
      midiBytes: new Uint8Array(chunks),
      metadata: {
        variant: `AKAO v${header.versionLabel || header.version}`,
        version: header.versionLabel || header.version,
        sequenceId: header.sequenceId,
        sequenceSize: header.totalSize,
        storedSequenceSize: header.storedSize,
        trackMask: header.trackMask,
        sourceTrackCount: header.trackCount,
        ppq: PPQ,
        noteCount: context.noteCount,
        eventCount,
        keySplitInstrumentCount: context.keySplitPrograms.size,
        drumInstrumentCount: context.drumInstrumentAddresses.size,
        ignoredV1OpcodeCount: context.ignoredV1OpcodeCount,
        overlayVoiceCount: context.overlayVoiceCount,
        gmNormalized: true,
        drumKeyRemappedCount: context.drumKeyRemappedCount,
        customBankCollapsedCount: context.customBankCollapsedCount,
        truncatedLoopCount,
        unsupportedOpcodeCount,
        warnings: context.warnings,
      },
    };
  }

  root.MabiAkaoSequence = Object.freeze({ detect, find, inspectHeader, parse, rawTempoToBpm });
})();
