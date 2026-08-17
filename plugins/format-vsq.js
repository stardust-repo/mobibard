(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-vsq.js");
  core.registerFormat({
    id: "vsq",
    label: "VOCALOID 2 VSQ",
    category: "vocal",
    extensions: ["vsq"],
    description: "MIDI 기반 VOCALOID 2 시퀀스",
    limitation: "가사·발음·표현 파라미터는 MIDI/MML에서 단순화됩니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseVsq) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseVsq(bytes, fileName);
    },
  });
})();
