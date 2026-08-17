(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-vsqx.js");
  core.registerFormat({
    id: "vsqx",
    label: "VOCALOID VSQX",
    category: "vocal",
    extensions: ["vsqx"],
    description: "VOCALOID 3/4 XML 프로젝트",
    limitation: "보이스뱅크·음소·피치 곡선은 변환하지 않습니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseVsqx) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseVsqx(bytes, fileName);
    },
  });
})();
