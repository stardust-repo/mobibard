(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-gp3.js");
  core.registerFormat({
    id: "gp3",
    label: "Guitar Pro 3",
    category: "tablature",
    extensions: ["gp3"],
    description: "프로젝트에 포함된 오프라인 파서로 Guitar Pro 악보를 트랙별 MIDI로 변환",
    limitation: "프렛·주법 표시는 MML에서 단순화될 수 있습니다.",
    requiresNetwork: false,
    async convert(bytes, fileName) {
      if (!window.MabiGuitarPro?.convertGuitarPro) throw new Error("Guitar Pro 변환 모듈을 불러오지 못했습니다.");
      return window.MabiGuitarPro.convertGuitarPro(bytes, fileName);
    },
  });
})();
