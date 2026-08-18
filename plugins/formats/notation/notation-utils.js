(() => {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const utils = root.MabiUtils;
  if (!utils) throw new Error("utils.js must be loaded before notation-utils.js");

  const STEP_TO_SEMITONE = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
  const NOTE_VALUE_QUARTERS = Object.freeze({
    maxima: 32,
    longa: 16,
    long: 16,
    breve: 8,
    doublewhole: 8,
    "double-whole": 8,
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    "8th": 0.5,
    "16th": 0.25,
    "32nd": 0.125,
    "64th": 0.0625,
    "128th": 0.03125,
    "256th": 0.015625,
    "512th": 0.0078125,
    "1024th": 0.00390625,
  });
  const SHARP_ORDER = "FCGDAEB";
  const FLAT_ORDER = "BEADGCF";
  const LETTERS = "CDEFGAB";
  const MAJOR_TONICS = Object.freeze({
    "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
    0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
  });
  const MINOR_TONICS = Object.freeze({
    "-7": "Ab", "-6": "Eb", "-5": "Bb", "-4": "F", "-3": "C", "-2": "G", "-1": "D",
    0: "A", 1: "E", 2: "B", 3: "F#", 4: "C#", 5: "G#", 6: "D#", 7: "A#",
  });

  function dottedMultiplier(dots) {
    const count = utils.clampInt(dots, 0, 6, 0);
    let multiplier = 1;
    let add = 0.5;
    for (let index = 0; index < count; index++) {
      multiplier += add;
      add /= 2;
    }
    return multiplier;
  }

  function fractionValue(value, fallback = NaN) {
    if (Number.isFinite(Number(value))) return Number(value);
    if (Array.isArray(value) && value.length >= 2) {
      const numerator = Number(value[0]);
      const denominator = Number(value[1]);
      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
        ? numerator / denominator
        : fallback;
    }
    if (value && typeof value === "object") {
      const numerator = Number(value.numerator ?? value.num ?? value.count ?? value.beats);
      const denominator = Number(value.denominator ?? value.den ?? value.unit ?? value.beatType);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) return numerator / denominator;
    }
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(value || ""));
    if (!match || Number(match[2]) === 0) return fallback;
    return Number(match[1]) / Number(match[2]);
  }

  function noteValueQuarters(value, options = {}) {
    if (value == null) return Number(options.fallback ?? 1);
    if (typeof value === "number") return Math.max(0, value);
    if (typeof value === "string") {
      const key = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
      if (Object.prototype.hasOwnProperty.call(NOTE_VALUE_QUARTERS, key)) return NOTE_VALUE_QUARTERS[key];
      const fraction = fractionValue(key, NaN);
      if (Number.isFinite(fraction)) return Math.max(0, fraction * 4);
      return Number(options.fallback ?? 1);
    }

    const base = value.base ?? value.type ?? value.noteValue ?? value.value;
    let quarters;
    if (typeof base === "string" && Object.prototype.hasOwnProperty.call(NOTE_VALUE_QUARTERS, base.toLowerCase())) {
      quarters = NOTE_VALUE_QUARTERS[base.toLowerCase()];
    } else if (base != null) {
      const fraction = fractionValue(base, NaN);
      quarters = Number.isFinite(fraction) ? fraction * 4 : NaN;
    } else {
      const fraction = fractionValue(value, NaN);
      quarters = Number.isFinite(fraction) ? fraction * 4 : NaN;
    }

    if (!Number.isFinite(quarters)) {
      const divisions = Number(options.divisions);
      const rawDuration = Number(value.duration ?? value.ticks ?? value.divisions);
      if (Number.isFinite(divisions) && divisions > 0 && Number.isFinite(rawDuration)) quarters = rawDuration / divisions;
    }
    if (!Number.isFinite(quarters)) quarters = Number(options.fallback ?? 1);
    quarters *= dottedMultiplier(value.dots ?? value.dot ?? 0);

    const actual = Number(value.actualNotes ?? value.actual ?? value.inner ?? value.tuplet?.actualNotes ?? value.tuplet?.actual);
    const normal = Number(value.normalNotes ?? value.normal ?? value.outer ?? value.tuplet?.normalNotes ?? value.tuplet?.normal);
    if (Number.isFinite(actual) && actual > 0 && Number.isFinite(normal) && normal > 0) quarters *= normal / actual;
    return Math.max(0, quarters);
  }

  function pitchToMidi(step, octave, alter = 0, fallback = 60) {
    const normalizedStep = String(step || "").trim().toUpperCase();
    const base = STEP_TO_SEMITONE[normalizedStep];
    const octaveNumber = Number(octave);
    const alteration = Number(alter);
    if (!Number.isFinite(base) || !Number.isFinite(octaveNumber)) return utils.clampInt(fallback, 0, 127, 60);
    return utils.clampInt((Math.round(octaveNumber) + 1) * 12 + base + (Number.isFinite(alteration) ? alteration : 0), 0, 127, fallback);
  }

  function pitchObjectToMidi(pitch, fallback = 60) {
    if (Number.isFinite(Number(pitch))) return utils.clampInt(pitch, 0, 127, fallback);
    if (!pitch || typeof pitch !== "object") return utils.clampInt(fallback, 0, 127, 60);
    if (Number.isFinite(Number(pitch.midi))) return utils.clampInt(pitch.midi, 0, 127, fallback);
    return pitchToMidi(
      pitch.step ?? pitch.letter ?? pitch.name,
      pitch.octave ?? pitch.oct,
      pitch.alter ?? pitch.accidental ?? pitch.alteration ?? 0,
      fallback,
    );
  }

  function keyAccidental(letter, fifths) {
    const normalized = String(letter || "").toUpperCase();
    const count = utils.clampInt(fifths, -7, 7, 0);
    if (count > 0 && SHARP_ORDER.slice(0, count).includes(normalized)) return 1;
    if (count < 0 && FLAT_ORDER.slice(0, -count).includes(normalized)) return -1;
    return 0;
  }

  function decodeFinaleKey(raw) {
    const value = Math.trunc(Number(raw) || 0);
    const modeValue = value >> 8;
    const low = value & 0xff;
    const fifths = utils.clampInt(low > 127 ? low - 256 : low, -7, 7, 0);
    const minor = modeValue === 1;
    const tonic = (minor ? MINOR_TONICS : MAJOR_TONICS)[String(fifths)] || (minor ? "A" : "C");
    return { fifths, minor, tonic };
  }


  function adjustFinaleKey(raw, adjust = 0) {
    const decoded = decodeFinaleKey(raw);
    const fifths = utils.clampInt(decoded.fifths + (Number(adjust) || 0), -7, 7, decoded.fifths);
    return decodeFinaleKey(((decoded.minor ? 1 : 0) << 8) | (fifths & 0xff));
  }

  function finaleTimeSignature(beats, divbeat, wholeEdu = 4096) {
    let numerator = Math.max(1, Math.round(Number(beats) || 4));
    let unit = Math.max(1, Math.round(Number(divbeat) || wholeEdu / 4));
    const compoundUnit = unit / 3;
    if (Number.isInteger(compoundUnit) && compoundUnit > 0 && (compoundUnit & (compoundUnit - 1)) === 0) {
      numerator *= 3;
      unit = compoundUnit;
    }
    const rawDenominator = Number(wholeEdu) / unit;
    const denominator = Number.isFinite(rawDenominator) && rawDenominator > 0
      ? 2 ** utils.clampInt(Math.round(Math.log2(rawDenominator)), 0, 7, 2)
      : 4;
    return normalizeTimeSignature({ numerator, denominator });
  }

  function finalePitchToMidi(harmonicLevel, harmonicAlteration, keyValue, fallback = 60) {
    const key = typeof keyValue === "object" && keyValue?.tonic ? keyValue : decodeFinaleKey(keyValue);
    const tonicLetter = String(key.tonic || "C")[0].toUpperCase();
    const tonicIndex = Math.max(0, LETTERS.indexOf(tonicLetter));
    const position = tonicIndex + Math.trunc(Number(harmonicLevel) || 0);
    const letter = LETTERS[((position % 7) + 7) % 7];
    const octave = 4 + Math.floor(position / 7);
    const alteration = keyAccidental(letter, key.fifths) + Math.trunc(Number(harmonicAlteration) || 0);
    return pitchToMidi(letter, octave, alteration, fallback);
  }

  function normalizeTimeSignature(value, fallback = { numerator: 4, denominator: 4 }) {
    if (!value || typeof value !== "object") return { ...fallback };
    const numerator = utils.clampInt(value.numerator ?? value.count ?? value.beats, 1, 255, fallback.numerator);
    const denominator = utils.clampInt(value.denominator ?? value.unit ?? value.beatType, 1, 128, fallback.denominator);
    return { numerator, denominator };
  }

  function measureQuarters(timeSignature) {
    const normalized = normalizeTimeSignature(timeSignature);
    return normalized.numerator * (4 / normalized.denominator);
  }

  function dedupeTimedEvents(events, valueKey) {
    const sorted = (events || []).slice().sort((left, right) => (left.tick || 0) - (right.tick || 0));
    const result = [];
    for (const event of sorted) {
      const normalized = { ...event, tick: Math.max(0, Math.round(Number(event.tick) || 0)) };
      const previous = result[result.length - 1];
      const signature = typeof valueKey === "function" ? valueKey(normalized) : JSON.stringify(normalized);
      if (previous && previous.tick === normalized.tick) {
        result[result.length - 1] = normalized;
        result[result.length - 1].__signature = signature;
      } else if (!previous || previous.__signature !== signature) {
        normalized.__signature = signature;
        result.push(normalized);
      }
    }
    return result.map(({ __signature, ...event }) => event);
  }

  root.MabiNotation = Object.freeze({
    version: "5.0.0",
    STEP_TO_SEMITONE,
    NOTE_VALUE_QUARTERS,
    dottedMultiplier,
    fractionValue,
    noteValueQuarters,
    pitchToMidi,
    pitchObjectToMidi,
    keyAccidental,
    decodeFinaleKey,
    adjustFinaleKey,
    finaleTimeSignature,
    finalePitchToMidi,
    normalizeTimeSignature,
    measureQuarters,
    dedupeTimedEvents,
  });
})();
