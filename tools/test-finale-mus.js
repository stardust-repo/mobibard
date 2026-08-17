#!/usr/bin/env node
"use strict";

// Manual regression helper for the shared browser MUS decoder.
// Usage: node tools/test-finale-mus.js file1.mus [file2.mus ...]

const fs = require("fs");
const path = require("path");

global.window = global;
global.TextEncoder ||= require("util").TextEncoder;
global.pako = require(path.join(__dirname, "../player/js/pako_inflate.min.js"));
require(path.join(__dirname, "../player/js/finale-mus-to-midi.js"));

function readU32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readVlq(bytes, cursor) {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    if (cursor.position >= bytes.length) throw new Error("MIDI VLQ is truncated");
    const byte = bytes[cursor.position++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  return value;
}

function summarizeMidi(bytes) {
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== "MThd") throw new Error("Converted output has no MThd header");
  const format = (bytes[8] << 8) | bytes[9];
  const trackCount = (bytes[10] << 8) | bytes[11];
  const ppq = (bytes[12] << 8) | bytes[13];
  let position = 8 + readU32(bytes, 4);
  let noteOns = 0;
  let noteOffs = 0;
  let lastTick = 0;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (ascii(position, 4) !== "MTrk") throw new Error(`Track ${trackIndex + 1} has no MTrk header`);
    const length = readU32(bytes, position + 4);
    const end = position + 8 + length;
    const cursor = { position: position + 8 };
    let tick = 0;
    let runningStatus = 0;
    while (cursor.position < end) {
      tick += readVlq(bytes, cursor);
      lastTick = Math.max(lastTick, tick);
      let status = bytes[cursor.position++];
      if (status < 0x80) {
        cursor.position -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }
      if (status === 0xff) {
        cursor.position += 1;
        const size = readVlq(bytes, cursor);
        cursor.position += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const size = readVlq(bytes, cursor);
        cursor.position += size;
        continue;
      }
      const kind = status & 0xf0;
      if (kind === 0xc0 || kind === 0xd0) {
        cursor.position += 1;
        continue;
      }
      const data1 = bytes[cursor.position++];
      const data2 = bytes[cursor.position++];
      if (kind === 0x90 && data2 > 0) noteOns += 1;
      if (kind === 0x80 || (kind === 0x90 && data2 === 0)) noteOffs += 1;
      void data1;
    }
    if (cursor.position !== end) throw new Error(`Track ${trackIndex + 1} length mismatch`);
    position = end;
  }
  if (noteOns !== noteOffs) throw new Error(`Unbalanced notes: on=${noteOns}, off=${noteOffs}`);
  return { format, trackCount, ppq, noteOns, lastTick };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node tools/test-finale-mus.js file1.mus [file2.mus ...]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  try {
    const input = new Uint8Array(fs.readFileSync(file));
    const score = global.MabiFinaleMus.parseFinaleMus(input, path.basename(file));
    const midi = global.MabiFinaleMus.musToMidiBytes(input, path.basename(file));
    const summary = summarizeMidi(midi);
    console.log(JSON.stringify({
      file: path.basename(file),
      container: score.family,
      staves: score.staffIds.length,
      measures: score.measures.size,
      placements: score.placements.length,
      ...summary,
      outputBytes: midi.length,
    }));
  } catch (error) {
    failed = true;
    console.error(`${file}: ${error?.stack || error}`);
  }
}
process.exitCode = failed ? 1 : 0;
