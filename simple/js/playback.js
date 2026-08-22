(() => {
  "use strict";

  const VERSION = "5.1.0";

  function soundBankApi() {
    const api = window.MabiSoundBank;
    if (!api?.loadEmbeddedSoundBank || !api?.findPreset) {
      throw new Error(window.MobibardI18n?.t?.("simple.err_soundbank") || "Could not load the shared sound bank module.");
    }
    return api;
  }

  async function parseSoundBank(source, options = {}) {
    const api = soundBankApi();
    if (source && typeof source.arrayBuffer === "function") {
      return api.parseSoundBankFile(source, options);
    }
    return api.parseSoundBank(source, options);
  }

  async function loadDefaultPreset(options = {}) {
    const api = soundBankApi();
    const bankNumber = Math.max(0, Math.min(16383, Math.round(Number(options.bank) || 0)));
    const program = Math.max(0, Math.min(127, Math.round(Number(options.program) || 0)));
    const soundBank = await api.loadEmbeddedSoundBank(options);
    const preset = api.findPreset(soundBank, program, bankNumber);
    if (!preset) throw new Error(window.MobibardI18n?.t?.("simple.err_preset", [bankNumber, program]) || `Could not find a playback instrument preset. (Bank ${bankNumber} / Program ${program})`);
    return { soundBank, preset };
  }

  function prepareNotes(...args) {
    return soundBankApi().prepareNotes(...args);
  }

  function schedulePreparedNotes(...args) {
    return soundBankApi().schedulePreparedNotes(...args);
  }

  window.MobibardSimplePlayback = Object.freeze({
    version: VERSION,
    parseSoundBank,
    loadEmbeddedSoundBank: (...args) => soundBankApi().loadEmbeddedSoundBank(...args),
    loadDefaultPreset,
    prepareNotes,
    schedulePreparedNotes,
  });
})();
