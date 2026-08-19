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
    description: "Sony PlayStation의 MIDI 계열 SEQ/SEP와 PlayStation 2 SQ 시퀀스를 표준 MIDI로 변환합니다.",
    limitation: "SEP는 여러 독립 곡을 담는 아카이브이므로 현재 첫 번째 시퀀스를 불러옵니다. PS1 VAB 및 PS2 HD/BD 같은 별도 음색 뱅크는 기본 SoundFont로 대체됩니다.",
    detect(bytes) {
      return Boolean(root.MabiPlayStationSequence?.detect?.(bytes));
    },
    convert(bytes, fileName) {
      if (!root.MabiPlayStationSequence?.convert) throw new Error("PlayStation 시퀀스 변환 모듈을 불러오지 못했습니다.");
      return root.MabiPlayStationSequence.convert(bytes, fileName);
    },
  });
})();
