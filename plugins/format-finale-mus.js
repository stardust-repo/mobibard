(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-finale-mus.js");
  core.registerFormat({
    id: "finale-mus",
    label: "Finale MUS",
    category: "basic",
    extensions: ["mus"],
    description: "Finale·NotePad·PrintMusic 2001–2005 ENIGMA BINARY",
    limitation: "DOOM MUS와 최신 MUSX는 지원하지 않습니다.",
    convert(bytes, fileName) {
      if (!window.MabiFinaleMus?.musToMidiBytes) throw new Error("Finale MUS 변환 모듈을 불러오지 못했습니다.");
      return { midiBytes: window.MabiFinaleMus.musToMidiBytes(bytes, fileName) };
    },
  });
})();
