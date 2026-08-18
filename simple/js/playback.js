(() => {
  "use strict";

  const VERSION = "5.0.0";

  function soundBankApi() {
    const api = window.MabiSoundBank;
    if (!api?.loadEmbeddedSoundBank || !api?.findPreset) {
      throw new Error("공용 SoundBank 모듈을 불러오지 못했습니다.");
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
    if (!preset) throw new Error(`Bank ${bankNumber} / Program ${program} 프리셋을 찾지 못했습니다.`);
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
