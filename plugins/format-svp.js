(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-svp.js");
  core.registerFormat({
    id: "svp",
    label: "Synthesizer V SVP",
    category: "vocal",
    extensions: ["svp"],
    description: "Synthesizer V Studio 프로젝트",
    limitation: "가수·음소·피치·보컬 표현 데이터는 제외합니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseSvp) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseSvp(bytes, fileName);
    },
  });
})();
