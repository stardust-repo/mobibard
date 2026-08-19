(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;

  // A compact, broadly available General MIDI percussion palette. Proprietary
  // console drum slots are remapped here when their numeric key is not itself
  // a GM percussion key. This is intentionally deterministic rather than
  // pretending that an arbitrary console sample ID carries GM semantics.
  const GENERIC_DRUM_KEYS = Object.freeze([
    36, // Bass Drum 1
    38, // Acoustic Snare
    42, // Closed Hi-Hat
    46, // Open Hi-Hat
    41, // Low Floor Tom
    45, // Low Tom
    48, // Hi-Mid Tom
    49, // Crash Cymbal 1
    51, // Ride Cymbal 1
    39, // Hand Clap
    54, // Tambourine
    56, // Cowbell
  ]);

  const GM_DRUM_MIN = 35;
  const GM_DRUM_MAX = 81;

  function clamp7(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback & 0x7f;
    return Math.max(0, Math.min(127, Math.round(number))) & 0x7f;
  }

  function normalizeMelodicProgram(program) {
    // Proprietary console program numbers usually index a separate sample bank.
    // We cannot infer an exact timbre without that bank, but retaining the low
    // 7-bit program as a Bank-0 GM proxy guarantees a playable deterministic
    // preset on complete GM SoundFonts instead of selecting a missing custom bank.
    return clamp7(program, 0);
  }

  function isGmDrumKey(key) {
    const value = clamp7(key, 0);
    return value >= GM_DRUM_MIN && value <= GM_DRUM_MAX;
  }

  function genericDrumKey(key, { slotBase = null, forceSlot = false } = {}) {
    const value = clamp7(key, 0);
    if (!forceSlot && isGmDrumKey(value)) return value;
    let slot = slotBase == null ? value : value - Number(slotBase || 0);
    slot = ((Math.round(slot) % GENERIC_DRUM_KEYS.length) + GENERIC_DRUM_KEYS.length) % GENERIC_DRUM_KEYS.length;
    return GENERIC_DRUM_KEYS[slot];
  }

  function akaoV12DrumKey(key) {
    // AKAO v1/v2 exposes twelve octave-independent drum slots as MIDI-like
    // keys 24..35. They are slots, not GM percussion meanings.
    return genericDrumKey(key, { slotBase: 24, forceSlot: true });
  }

  function nintendoDrumKey(key, profile = null) {
    const value = clamp7(key, 0);
    const lowKey = Number(profile?.lowKey);
    const highKey = Number(profile?.highKey);
    if (Number.isFinite(lowKey) && Number.isFinite(highKey) && lowKey <= highKey) {
      // When the Nintendo drumset itself lives completely inside the standard
      // GM percussion range, retaining keys is the least destructive choice.
      if (lowKey >= GM_DRUM_MIN && highKey <= GM_DRUM_MAX && isGmDrumKey(value)) return value;
      return genericDrumKey(value, { slotBase: lowKey, forceSlot: true });
    }
    return genericDrumKey(value);
  }

  function nintendoProgram(program, instrumentType) {
    switch (instrumentType) {
      case 0x02: return 80; // Lead 1 (square): DS PSG square-wave instrument
      case 0x03: return 0;  // Program is ignored because PSG noise becomes percussion.
      default: return normalizeMelodicProgram(program);
    }
  }

  function readBe32(bytes, offset) {
    return ((((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);
  }

  function asciiAt(bytes, offset, text) {
    if (offset < 0 || offset + text.length > bytes.length) return false;
    for (let index = 0; index < text.length; index++) if (bytes[offset + index] !== text.charCodeAt(index)) return false;
    return true;
  }

  function skipVlq(bytes, state, end) {
    let count = 0;
    while (state.pos < end && count++ < 4) {
      const byte = bytes[state.pos++];
      if (!(byte & 0x80)) return true;
    }
    return false;
  }

  function normalizeMidiLike(midiBytes, { remapChannel10Drums = true, collapseBanks = true } = {}) {
    const source = midiBytes instanceof Uint8Array ? midiBytes : new Uint8Array(midiBytes || []);
    const out = new Uint8Array(source);
    const stats = { bankSelectResetCount: 0, drumKeyRemappedCount: 0 };
    if (out.length < 14 || !asciiAt(out, 0, "MThd")) return { midiBytes: out, stats };

    const headerLength = readBe32(out, 4);
    let trackPos = 8 + headerLength;
    while (trackPos + 8 <= out.length && asciiAt(out, trackPos, "MTrk")) {
      const size = readBe32(out, trackPos + 4);
      const start = trackPos + 8;
      const end = Math.min(out.length, start + size);
      const state = { pos: start };
      let runningStatus = 0;

      while (state.pos < end) {
        if (!skipVlq(out, state, end) || state.pos >= end) break;

        let status = out[state.pos];
        let explicitStatus = true;
        if (status < 0x80) {
          if (!runningStatus) break;
          status = runningStatus;
          explicitStatus = false;
        } else {
          state.pos++;
          if (status >= 0x80 && status <= 0xef) runningStatus = status;
          else runningStatus = 0;
        }

        if (status >= 0x80 && status <= 0xef) {
          const high = status & 0xf0;
          const channel = status & 0x0f;
          const dataCount = (high === 0xc0 || high === 0xd0) ? 1 : 2;
          const dataStart = state.pos;
          if (dataStart + dataCount > end) break;

          if (collapseBanks && high === 0xb0 && dataCount === 2) {
            const controller = out[dataStart] & 0x7f;
            if ((controller === 0 || controller === 32) && out[dataStart + 1] !== 0) {
              out[dataStart + 1] = 0;
              stats.bankSelectResetCount++;
            }
          }

          if (remapChannel10Drums && channel === 9 && (high === 0x80 || high === 0x90 || high === 0xa0)) {
            const before = out[dataStart] & 0x7f;
            const after = genericDrumKey(before);
            if (after !== before) {
              out[dataStart] = after;
              stats.drumKeyRemappedCount++;
            }
          }

          state.pos += dataCount;
          continue;
        }

        if (status === 0xff) {
          if (state.pos >= end) break;
          state.pos++; // meta type
          if (!skipVlq(out, state, end)) break;
          // Re-read the just-decoded VLQ to obtain length without allocating.
          // The cursor already moved past it, so walk backwards to its first byte.
          let lenEnd = state.pos;
          let lenStart = lenEnd - 1;
          while (lenStart > start && (out[lenStart - 1] & 0x80)) lenStart--;
          let length = 0;
          for (let p = lenStart; p < lenEnd; p++) length = (length << 7) | (out[p] & 0x7f);
          state.pos = Math.min(end, state.pos + length);
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const lenStart = state.pos;
          if (!skipVlq(out, state, end)) break;
          let length = 0;
          for (let p = lenStart; p < state.pos; p++) length = (length << 7) | (out[p] & 0x7f);
          state.pos = Math.min(end, state.pos + length);
          continue;
        }

        // Standard MIDI system-common/realtime events are rare in these console
        // conversions. Stop this track rather than risking desynchronization.
        if (explicitStatus) break;
      }

      trackPos = start + size;
    }
    return { midiBytes: out, stats };
  }

  root.MabiConsoleGM = Object.freeze({
    GENERIC_DRUM_KEYS,
    GM_DRUM_MIN,
    GM_DRUM_MAX,
    normalizeMelodicProgram,
    isGmDrumKey,
    genericDrumKey,
    akaoV12DrumKey,
    nintendoDrumKey,
    nintendoProgram,
    normalizeMidiLike,
  });
})();
