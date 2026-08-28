function asciiBytes(text) {
  return Uint8Array.from(Array.from(text, character => character.charCodeAt(0) & 0x7f));
}

function uint16be(value) {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

function uint32be(value) {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function variableLength(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>>= 8;
    else break;
  }
  return Uint8Array.from(bytes);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * Creates a Standard MIDI File format 0.
 * Video seconds are converted to ticks using the selected BPM, so changing
 * BPM changes the musical grid while preserving the real playback timing.
 */
export function createMidiFile(notes, options = {}) {
  const ppq = 960;
  const bpm = clampNumber(options.bpm, 20, 300, 120);
  const microsecondsPerQuarter = Math.round(60_000_000 / bpm);
  const ticksPerSecond = ppq * bpm / 60;
  const trackName = String(options.trackName || 'Video Piano Extraction').slice(0, 120);
  const events = [];

  events.push({
    tick: 0,
    order: 0,
    bytes: Uint8Array.of(
      0xff, 0x51, 0x03,
      (microsecondsPerQuarter >>> 16) & 0xff,
      (microsecondsPerQuarter >>> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ),
  });
  const nameBytes = asciiBytes(trackName);
  events.push({ tick: 0, order: 1, bytes: concatBytes([Uint8Array.of(0xff, 0x03), variableLength(nameBytes.length), nameBytes]) });
  events.push({ tick: 0, order: 2, bytes: Uint8Array.of(0xc0, 0x00) }); // Acoustic Grand Piano.

  for (const note of notes) {
    const startTick = Math.max(0, Math.round(note.start * ticksPerSecond));
    const endTick = Math.max(startTick + 1, Math.round(note.end * ticksPerSecond));
    const midi = Math.max(0, Math.min(127, Math.round(note.midi)));
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity ?? 95)));
    events.push({ tick: endTick, order: 3, bytes: Uint8Array.of(0x80, midi, 0x00) });
    events.push({ tick: startTick, order: 4, bytes: Uint8Array.of(0x90, midi, velocity) });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const trackParts = [];
  let previousTick = 0;
  for (const event of events) {
    trackParts.push(variableLength(event.tick - previousTick));
    trackParts.push(event.bytes);
    previousTick = event.tick;
  }
  trackParts.push(Uint8Array.of(0x00, 0xff, 0x2f, 0x00));
  const trackData = concatBytes(trackParts);

  const header = concatBytes([
    asciiBytes('MThd'),
    uint32be(6),
    uint16be(0),
    uint16be(1),
    uint16be(ppq),
  ]);
  const track = concatBytes([asciiBytes('MTrk'), uint32be(trackData.length), trackData]);
  return new Blob([header, track], { type: 'audio/midi' });
}
