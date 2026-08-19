(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-playstation.js");

  core.registerFormat({
    id: "playstation-sequence",
    label: "PlayStation SEQ / SEP / SQ",
    category: "console",
    extensions: ["seq", "sep", "sq", "bq"],
    mimeTypes: ["application/octet-stream", "audio/x-playstation-sequence"],
    description: "Sony PlayStation의 MIDI 계열 SEQ/SEP와 PlayStation 2 SQ 시퀀스를 표준 MIDI로 변환하고, 전용 Bank/드럼 번호를 GM 재생에 맞게 정규화합니다.",
    limitation: "SEP는 여러 독립 곡을 담는 아카이브이므로 현재 첫 번째 시퀀스를 불러옵니다. PS1 VAB 및 PS2 HD/BD 자체를 함께 읽지는 않으므로 전용 Bank Select는 GM Bank 0으로 정규화하고, 채널 10의 비표준 타악기 Key는 GM 타악기 영역으로 재배치합니다.",
    detect(bytes) {
      return Boolean(root.MabiPlayStationSequence?.detect?.(bytes));
    },
    convert(bytes, fileName) {
      if (!root.MabiPlayStationSequence?.convert) throw new Error("PlayStation 시퀀스 변환 모듈을 불러오지 못했습니다.");
      return root.MabiPlayStationSequence.convert(bytes, fileName);
    },
  });
})();
