(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-ust.js");
  core.registerFormat({
    id: "ust",
    label: "UTAU UST",
    category: "vocal",
    extensions: ["ust"],
    description: "UTAU 텍스트 시퀀스",
    limitation: "음원 설정과 세부 조정값은 제외합니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseUst) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseUst(bytes, fileName);
    },
  });
})();
