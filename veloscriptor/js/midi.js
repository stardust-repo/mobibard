const DEFAULT_TEMPO_MPQN = 500000;

function clampInt(value, min, max, fallback = min) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function ascii(bytes, offset, length) {
  let output = '';
  for (let index = 0; index < length; index += 1) output += String.fromCharCode(bytes[offset + index] || 0);
  return output;
}

function readU16(bytes, offset) {
  return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

function readU32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readVarLength(bytes, state, end) {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    if (state.pos >= end) throw new Error('Unexpected end of MIDI data.');
    const byte = bytes[state.pos++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value >>> 0;
  }
  return value >>> 0;
}

function systemDataLength(status) {
  switch (status) {
    case 0xf1:
    case 0xf3:
      return 1;
    case 0xf2:
      return 2;
    case 0xf6:
    case 0xf8:
    case 0xf9:
    case 0xfa:
    case 0xfb:
    case 0xfc:
    case 0xfd:
    case 0xfe:
      return 0;
    default:
      return 0;
  }
}

function normalizeTempoEvents(events) {
  const sorted = [...events].sort((left, right) => left.tick - right.tick
    || left.trackIndex - right.trackIndex
    || left.order - right.order);
  const normalized = [];
  for (const event of sorted) {
    const current = { tick: Math.max(0, event.tick), mpqn: Math.max(1, event.mpqn) };
    const last = normalized[normalized.length - 1];
    if (last?.tick === current.tick) last.mpqn = current.mpqn;
    else normalized.push(current);
  }
  if (!normalized.length || normalized[0].tick !== 0) normalized.unshift({ tick: 0, mpqn: DEFAULT_TEMPO_MPQN });
  return normalized;
}

function createTickConverter(divisionRaw, tempoEvents) {
  const smpte = (divisionRaw & 0x8000) !== 0;
  if (smpte) {
    const high = (divisionRaw >>> 8) & 0xff;
    const signedFrames = high >= 0x80 ? high - 0x100 : high;
    const fps = signedFrames === -29 ? 29.97 : Math.abs(signedFrames || -30);
    const ticksPerFrame = Math.max(1, divisionRaw & 0xff);
    const ticksPerSecond = fps * ticksPerFrame;
    return {
      ppq: null,
      smpte: true,
      tickToSeconds: tick => Math.max(0, Number(tick) || 0) / ticksPerSecond,
    };
  }

  const ppq = Math.max(1, divisionRaw & 0x7fff);
  const tempos = normalizeTempoEvents(tempoEvents);
  const segments = [];
  let seconds = 0;
  let previousTick = tempos[0].tick;
  let previousMpqn = tempos[0].mpqn;
  segments.push({ tick: previousTick, seconds, mpqn: previousMpqn });
  for (let index = 1; index < tempos.length; index += 1) {
    const event = tempos[index];
    seconds += ((event.tick - previousTick) * previousMpqn) / (ppq * 1000000);
    previousTick = event.tick;
    previousMpqn = event.mpqn;
    segments.push({ tick: previousTick, seconds, mpqn: previousMpqn });
  }

  function tickToSeconds(tickValue) {
    const tick = Math.max(0, Number(tickValue) || 0);
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (segments[middle].tick <= tick) low = middle;
      else high = middle - 1;
    }
    const segment = segments[low];
    return segment.seconds + ((tick - segment.tick) * segment.mpqn) / (ppq * 1000000);
  }

  return { ppq, smpte: false, tickToSeconds };
}

function eventSort(left, right) {
  return left.tick - right.tick || left.trackIndex - right.trackIndex || left.order - right.order;
}

/**
 * Parses an SMF while retaining the absolute byte offset of every Note On velocity.
 * The returned byte array is a normalized standard MIDI stream; only those offsets
 * are changed when the result is exported.
 */
export function parseMidiForVelocity(source) {
  const parser = globalThis.MabiMidiParser;
  const normalized = parser?.normalizeContainer
    ? parser.normalizeContainer(source)
    : { bytes: source instanceof Uint8Array ? source : new Uint8Array(source) };
  const bytes = new Uint8Array(normalized.bytes);
  if (bytes.length < 14 || ascii(bytes, 0, 4) !== 'MThd') throw new Error('Standard MIDI header (MThd) was not found.');

  const headerLength = readU32(bytes, 4);
  if (headerLength < 6 || 8 + headerLength > bytes.length) throw new Error('The MIDI header length is invalid.');
  const format = readU16(bytes, 8);
  const trackCount = readU16(bytes, 10);
  const divisionRaw = readU16(bytes, 12);
  if (format > 2) throw new Error(`Unsupported MIDI format: ${format}`);
  if (format === 2) throw new Error('SMF Format 2 contains independent songs and is not supported by this page.');

  const noteEvents = [];
  const stateEvents = [];
  const tempoEvents = [];
  let maxTick = 0;
  let cursor = 8 + headerLength;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (cursor + 8 > bytes.length || ascii(bytes, cursor, 4) !== 'MTrk') {
      throw new Error(`MTrk header was not found for track ${trackIndex + 1}.`);
    }
    const trackLength = readU32(bytes, cursor + 4);
    const trackStart = cursor + 8;
    const trackEnd = trackStart + trackLength;
    if (trackEnd > bytes.length) throw new Error(`Track ${trackIndex + 1} extends beyond the file.`);

    const state = { pos: trackStart };
    let tick = 0;
    let runningStatus = null;
    let order = 0;

    while (state.pos < trackEnd) {
      tick += readVarLength(bytes, state, trackEnd);
      maxTick = Math.max(maxTick, tick);
      order += 1;
      if (state.pos >= trackEnd) break;

      let status = bytes[state.pos];
      if (status < 0x80) {
        if (runningStatus == null) throw new Error(`Invalid running status in track ${trackIndex + 1}.`);
        status = runningStatus;
      } else {
        state.pos += 1;
        if (status < 0xf0) runningStatus = status;
        else if (status !== 0xf8 && status !== 0xf9 && status !== 0xfa && status !== 0xfb && status !== 0xfc && status !== 0xfd && status !== 0xfe) runningStatus = null;
      }

      if (status === 0xff) {
        if (state.pos >= trackEnd) throw new Error('Unexpected end of MIDI meta event.');
        const type = bytes[state.pos++];
        const length = readVarLength(bytes, state, trackEnd);
        if (state.pos + length > trackEnd) throw new Error('Unexpected end of MIDI meta data.');
        if (type === 0x51 && length === 3) {
          const mpqn = (bytes[state.pos] << 16) | (bytes[state.pos + 1] << 8) | bytes[state.pos + 2];
          if (mpqn > 0) tempoEvents.push({ tick, mpqn, trackIndex, order });
        }
        state.pos += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVarLength(bytes, state, trackEnd);
        if (state.pos + length > trackEnd) throw new Error('Unexpected end of SysEx data.');
        state.pos += length;
        continue;
      }

      if (status >= 0xf0) {
        const length = systemDataLength(status);
        if (state.pos + length > trackEnd) throw new Error('Unexpected end of MIDI system event.');
        state.pos += length;
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const oneDataByte = command === 0xc0 || command === 0xd0;
      if (state.pos >= trackEnd) throw new Error('Unexpected end of MIDI channel event.');
      const data1Offset = state.pos;
      const data1 = bytes[state.pos++];
      let data2Offset = -1;
      let data2 = 0;
      if (!oneDataByte) {
        if (state.pos >= trackEnd) throw new Error('Unexpected end of MIDI channel event.');
        data2Offset = state.pos;
        data2 = bytes[state.pos++];
      }

      if (command === 0x90 && data2 > 0) {
        noteEvents.push({
          index: noteEvents.length,
          tick,
          trackIndex,
          order,
          channel,
          midi: data1,
          originalVelocity: data2,
          velocityOffset: data2Offset,
          channelVolume: 127,
          expression: 127,
          program: 0,
          bankMsb: 0,
          bankLsb: 0,
        });
      } else if (command === 0xb0 && (data1 === 0 || data1 === 32 || data1 === 7 || data1 === 11)) {
        stateEvents.push({ kind: 'control', tick, trackIndex, order, channel, controller: data1, value: data2 });
      } else if (command === 0xc0) {
        stateEvents.push({ kind: 'program', tick, trackIndex, order, channel, value: data1, dataOffset: data1Offset });
      }
    }

    cursor = trackEnd;
  }

  const merged = [
    ...stateEvents,
    ...noteEvents.map(event => ({ ...event, kind: 'note' })),
  ].sort(eventSort);
  const volume = new Uint8Array(16); volume.fill(127);
  const expression = new Uint8Array(16); expression.fill(127);
  const program = new Uint8Array(16);
  const bankMsb = new Uint8Array(16);
  const bankLsb = new Uint8Array(16);
  for (const event of merged) {
    const channel = event.channel;
    if (event.kind === 'control') {
      if (event.controller === 0) bankMsb[channel] = event.value;
      else if (event.controller === 32) bankLsb[channel] = event.value;
      else if (event.controller === 7) volume[channel] = event.value;
      else if (event.controller === 11) expression[channel] = event.value;
      continue;
    }
    if (event.kind === 'program') {
      program[channel] = event.value;
      continue;
    }
    event.channelVolume = volume[channel];
    event.expression = expression[channel];
    event.program = program[channel];
    event.bankMsb = bankMsb[channel];
    event.bankLsb = bankLsb[channel];
    const target = noteEvents[event.index];
    target.channelVolume = event.channelVolume;
    target.expression = event.expression;
    target.program = event.program;
    target.bankMsb = event.bankMsb;
    target.bankLsb = event.bankLsb;
  }

  const converter = createTickConverter(divisionRaw, tempoEvents);
  for (const event of noteEvents) event.time = converter.tickToSeconds(event.tick);
  const durationSeconds = converter.tickToSeconds(maxTick);

  return {
    bytes,
    format,
    trackCount,
    divisionRaw,
    ppq: converter.ppq,
    smpte: converter.smpte,
    tempoEvents: normalizeTempoEvents(tempoEvents),
    noteEvents,
    melodicNotes: noteEvents.filter(event => event.channel !== 9),
    drumNotes: noteEvents.filter(event => event.channel === 9),
    maxTick,
    durationSeconds,
    metadata: normalized,
  };
}

export function patchMidiVelocities(parsed, velocityValues) {
  if (!parsed?.bytes || !Array.isArray(parsed.noteEvents)) throw new Error('MIDI data is not ready.');
  const output = parsed.bytes.slice();
  const values = velocityValues instanceof Map
    ? velocityValues
    : new Map(Array.isArray(velocityValues) ? velocityValues.map((value, index) => [index, value]) : []);
  let changedCount = 0;

  for (const note of parsed.noteEvents) {
    if (!values.has(note.index)) continue;
    const velocity = clampInt(values.get(note.index), 1, 127, note.originalVelocity);
    if (velocity !== note.originalVelocity) changedCount += 1;
    output[note.velocityOffset] = velocity;
  }
  return { bytes: output, changedCount };
}

export function makeOutputFileName(fileName) {
  const raw = String(fileName || 'music.mid').replace(/\.(?:mid|midi|kar)$/i, '');
  return `${raw || 'music'}_audio_velocity.mid`;
}
