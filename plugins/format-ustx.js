(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-ustx.js");
  core.registerFormat({
    id: "ustx",
    label: "OpenUtau USTX",
    category: "vocal",
    extensions: ["ustx"],
    description: "OpenUtau YAML 프로젝트",
    limitation: "음원과 표현 곡선은 제외합니다.",
    convert(bytes, fileName) {
      if (!window.MabiVocalFormats?.parseUstx) throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
      return window.MabiVocalFormats.parseUstx(bytes, fileName);
    },
  });
})();
