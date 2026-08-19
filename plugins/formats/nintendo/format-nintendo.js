(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-nintendo.js");

  core.registerFormat({
    id: "nintendo-sequence",
    label: "Nintendo Sequence",
    category: "console",
    extensions: [
      "sseq", "ssar", "sdat",
      "brseq", "rseq", "brsar",
      "bcseq", "cseq", "bcsar",
      "bfseq", "fseq", "bfsar",
    ],
    mimeTypes: ["application/octet-stream", "audio/x-nintendo-sequence"],
    description: "Nintendo DS·Wii·3DS·Wii U·Switch의 표준 시퀀스/사운드 아카이브를 MIDI로 변환합니다.",
    limitation: "사운드 아카이브는 첫 번째 시퀀스를 가져옵니다. 런타임 변수에 의존하는 일부 동적 분기·랜덤 명령과 전용 악기뱅크 음색은 단순화될 수 있습니다.",
    detect(bytes) {
      return Boolean(root.MabiNintendoSequence?.detect?.(bytes));
    },
    convert(bytes, fileName) {
      if (!root.MabiNintendoSequence?.convert) throw new Error("Nintendo 시퀀스 변환 모듈을 불러오지 못했습니다.");
      return root.MabiNintendoSequence.convert(bytes, fileName);
    },
  });
})();
