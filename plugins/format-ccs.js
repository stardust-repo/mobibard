(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-ccs.js");
  core.registerFormat({
    id: "ccs",
    label: "CeVIO CCS",
    category: "vocal",
    extensions: ["ccs"],
    description: "CeVIO Creative Studio 프로젝트",
    limitation: "말하기 트랙과 보컬 표현 데이터는 제외합니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseCcs) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseCcs(bytes, fileName);
    },
  });
})();
