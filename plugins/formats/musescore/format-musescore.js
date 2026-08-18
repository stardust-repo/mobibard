(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-musescore.js");

  core.registerFormat({
    id: "musescore",
    label: "MuseScore",
    category: "basic",
    extensions: ["mscz", "mscx"],
    mimeTypes: ["application/vnd.musescore", "application/x-musescore"],
    description: "MuseScore 압축 악보(MSCZ) 및 XML 악보(MSCX)",
    limitation: "음표·쉼표·성부·타이·기본 튜플릿·조표·박자·템포를 변환하며, 레이아웃과 고급 재생 속성은 생략합니다.",
    detect(bytes) {
      if (window.MabiUtils?.looksLikeZip(bytes)) return false;
      const head = window.MabiUtils?.decodeText(bytes.subarray(0, Math.min(bytes.length, 4096)), ["utf-8"]) || "";
      return /<\s*museScore\b/i.test(head);
    },
    convert(bytes, fileName) {
      if (!window.MabiMuseScore?.museScoreToMidiBytes) throw new Error("MuseScore 변환 모듈을 불러오지 못했습니다.");
      return window.MabiMuseScore.museScoreToMidiBytes(bytes, fileName);
    },
  });
})();
