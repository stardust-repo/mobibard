(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-guitarpro.js");

  for (const definition of [
    { id: "gp3", label: "Guitar Pro 3", extension: "gp3" },
    { id: "gp5", label: "Guitar Pro 5", extension: "gp5" },
  ]) {
    core.registerFormat({
      id: definition.id,
      label: definition.label,
      category: "tablature",
      extensions: [definition.extension],
      description: "프로젝트에 포함된 오프라인 파서로 Guitar Pro 악보를 트랙별 MIDI로 변환",
      limitation: "프렛·주법 표시는 MML에서 단순화될 수 있습니다.",
      requiresNetwork: false,
      detect(bytes) {
        return root.MabiGuitarPro?.detectFormat?.(bytes) === definition.extension;
      },
      async convert(bytes, fileName) {
        if (!root.MabiGuitarPro?.convertGuitarPro) throw new Error("Guitar Pro 변환 모듈을 불러오지 못했습니다.");
        return root.MabiGuitarPro.convertGuitarPro(bytes, fileName, definition.extension);
      },
    });
  }
})();
