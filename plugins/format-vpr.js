(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-vpr.js");
  core.registerFormat({
    id: "vpr",
    label: "VOCALOID VPR",
    category: "vocal",
    extensions: ["vpr"],
    description: "VOCALOID 5/6 프로젝트",
    limitation: "프로젝트 버전에 따라 고급 보컬 파라미터는 제외됩니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseVpr) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseVpr(bytes, fileName);
    },
  });
})();
