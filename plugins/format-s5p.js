(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-s5p.js");
  core.registerFormat({
    id: "s5p",
    label: "Synthesizer V S5P",
    category: "vocal",
    extensions: ["s5p"],
    description: "초기 Synthesizer V 프로젝트",
    limitation: "가수·음소·피치·보컬 표현 데이터는 제외합니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseS5p) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseS5p(bytes, fileName);
    },
  });
})();
