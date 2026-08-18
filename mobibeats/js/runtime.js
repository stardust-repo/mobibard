(() => {
  "use strict";

  const VERSION = "5.0.0";

  function requireApi(name, value, methods) {
    if (!value || methods.some(method => typeof value[method] !== "function")) {
      throw new Error(`${name} 공용 플러그인을 불러오지 못했습니다.`);
    }
    return value;
  }

  const utils = requireApi("유틸리티", window.MabiUtils, ["clamp", "clampInt", "shortError", "base64ToUint8Array"]);
  const mml = requireApi("MML", window.MabiMml, ["parseMabinogiMml", "buildSchedule", "composeMml"]);
  const midi = requireApi("MIDI", window.MabiMidiParser, ["parse", "normalizeTempoEvents"]);
  const soundBank = requireApi("SoundBank", window.MabiSoundBank, [
    "parseSoundBank",
    "parseSoundBankFile",
    "loadEmbeddedSoundBank",
    "findPreset",
    "prepareNotes",
    "schedulePreparedNotes",
  ]);

  function parseMidi(bytes, options = {}) {
    return midi.parse(bytes, { type2Policy: "first-track", ...options });
  }

  async function parseSoundBank(source, options = {}) {
    if (source && typeof source.arrayBuffer === "function") {
      return soundBank.parseSoundBankFile(source, options);
    }
    return soundBank.parseSoundBank(source, options);
  }

  function loadDefaultSoundBank(options = {}) {
    return soundBank.loadEmbeddedSoundBank(options);
  }

  window.MobiBeatsPlugins = Object.freeze({
    version: VERSION,
    clamp: utils.clamp,
    clampInt: utils.clampInt,
    shortError: utils.shortError,
    base64ToUint8Array: utils.base64ToUint8Array,
    parseMabinogiMml: mml.parseMabinogiMml,
    buildSchedule: mml.buildSchedule,
    composeMml: mml.composeMml,
    parseMidi,
    normalizeMidiTempoEvents: midi.normalizeTempoEvents,
    parseSoundBank,
    loadDefaultSoundBank,
    findSoundBankPreset: soundBank.findPreset,
    prepareNotes: soundBank.prepareNotes,
    schedulePreparedNotes: soundBank.schedulePreparedNotes,
  });
})();
