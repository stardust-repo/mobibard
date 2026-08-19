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
    description: "Nintendo DS·Wii·3DS·Wii U·Switch 시퀀스를 MIDI로 변환하고, 확인 가능한 전용 악기 타입을 GM/SoundFont 재생에 맞게 정규화합니다.",
    limitation: "사운드 아카이브는 첫 번째 변환 가능한 시퀀스를 가져옵니다. DS SDAT은 연결된 SBNK의 Drumset·PSG 타입을 반영하지만, 독립 SSEQ/SSAR 및 Wii·3DS·Wii U·Switch에서 별도 음색 Bank를 얻지 못한 경우 Program 번호를 GM Bank 0의 안정적인 대체 음색으로 사용합니다. 런타임 변수에 의존하는 일부 동적 분기·랜덤 명령은 단순화될 수 있습니다.",
    detect(bytes) {
      return Boolean(root.MabiNintendoSequence?.detect?.(bytes));
    },
    convert(bytes, fileName) {
      if (!root.MabiNintendoSequence?.convert) throw new Error("Nintendo 시퀀스 변환 모듈을 불러오지 못했습니다.");
      return root.MabiNintendoSequence.convert(bytes, fileName);
    },
  });
})();
