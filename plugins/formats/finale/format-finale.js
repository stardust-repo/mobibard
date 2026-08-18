(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-finale.js");

  core.registerFormat({
    id: "finale-mus",
    label: "Finale MUS",
    category: "basic",
    extensions: ["mus"],
    description: "Finale·NotePad·PrintMusic 2001–2005 ENIGMA BINARY",
    limitation: "기본 음표·쉼표·박자·조표를 변환하며 고급 기보와 재생 효과는 단순화됩니다.",
    detect(bytes) {
      return Boolean(root.MabiFinaleMus?.isFinaleMusBytes?.(bytes));
    },
    convert(bytes, fileName) {
      if (!root.MabiFinaleMus?.musToMidiBytes) throw new Error("Finale MUS 변환 모듈을 불러오지 못했습니다.");
      return { midiBytes: root.MabiFinaleMus.musToMidiBytes(bytes, fileName) };
    },
  });

  core.registerFormat({
    id: "finale-musx",
    label: "Finale MUSX",
    category: "basic",
    extensions: ["musx"],
    description: "Finale MUSX 압축 프로젝트의 score.dat EnigmaXML",
    limitation: "음표·쉼표·레이어·이음줄·박자·조표 중심으로 변환하며 아티큘레이션·표현·고급 재생 데이터는 단순화됩니다.",
    convert(bytes, fileName) {
      if (!root.MabiFinaleMusx?.musxToMidiBytes) throw new Error("Finale MUSX 변환 모듈을 불러오지 못했습니다.");
      return root.MabiFinaleMusx.musxToMidiBytes(bytes, fileName);
    },
  });
})();
