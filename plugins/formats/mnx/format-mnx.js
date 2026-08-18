(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-mnx.js");

  core.registerFormat({
    id: "mnx",
    label: "MNX",
    category: "basic",
    extensions: ["mnx", "mnx.json"],
    mimeTypes: ["application/vnd.mnx+json"],
    description: "MNX JSON 악보 및 ZIP으로 묶인 MNX 문서",
    limitation: "레이아웃·빔·아티큘레이션은 생략하고 음표·쉼표·성부·조표·박자·템포를 재생 정보로 변환합니다.",
    detect(bytes) {
      if (window.MabiUtils?.looksLikeZip(bytes)) return false;
      const head = window.MabiUtils?.decodeText(bytes.subarray(0, Math.min(bytes.length, 4096)), ["utf-8"]) || "";
      return /^\s*\{/.test(head) && /"mnx"\s*:/.test(head) && /"parts"\s*:/.test(head);
    },
    convert(bytes, fileName) {
      if (!window.MabiMnx?.mnxToMidiBytes) throw new Error("MNX 변환 모듈을 불러오지 못했습니다.");
      return window.MabiMnx.mnxToMidiBytes(bytes, fileName);
    },
  });
})();
