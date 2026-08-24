(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-sega.js");
  const be16 = (bytes, offset) => ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
  const be32 = (bytes, offset) => (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  function lightweightDetect(input) {
    const bytes = core.asUint8Array(input);
    if (bytes.length < 16 || (bytes[0] === 0x70 && bytes[1] === 0x51 && bytes[2] === 0x45 && bytes[3] === 0x53)) return false;
    const count = be16(bytes, 0);
    if (count > 0 && count <= 128 && 2 + count * 4 <= bytes.length) {
      const first = be32(bytes, 2);
      if (first === 2 + count * 4 && first + 8 < bytes.length) {
        const tempos = be16(bytes, first + 2), dataOffset = be16(bytes, first + 4);
        return tempos <= 1024 && dataOffset >= 8 + tempos * 8 && first + dataOffset < bytes.length;
      }
    }
    const resolution = be16(bytes, 0), tempos = be16(bytes, 2), dataOffset = be16(bytes, 4);
    return resolution >= 12 && resolution <= 9600 && tempos <= 1024 && dataOffset >= 8 + tempos * 8 && dataOffset < bytes.length;
  }

  core.registerFormat({
    id: "sega-saturn-sequence",
    label: "Sega Saturn SEQ",
    category: "console",
    extensions: ["seq"],
    mimeTypes: ["application/octet-stream", "audio/x-sega-saturn-seq"],
    description: "Sega Saturn Sound Driver 2 계열 SEQ 시퀀스의 노트·게이트·템포·프로그램·컨트롤 정보를 표준 MIDI로 변환합니다.",
    limitation: "한 Sequence Bank에 여러 곡이 있으면 현재 첫 번째 곡을 불러옵니다. Saturn 전용 음색 Bank가 없으므로 악기는 GM 번호로 근사됩니다.",
    detect(bytes) { return root.MabiSegaSaturnSequence?.detect ? Boolean(root.MabiSegaSaturnSequence.detect(bytes)) : lightweightDetect(bytes); },
    convert(bytes, fileName) {
      if (!root.MabiSegaSaturnSequence?.convert) throw new Error("Sega Saturn SEQ 변환 모듈을 불러오지 못했습니다.");
      return root.MabiSegaSaturnSequence.convert(bytes, fileName);
    },
  });

  core.registerFormat({
    id: "sega-megadrive-xgm",
    label: "Sega Mega Drive XGM",
    category: "console",
    extensions: ["xgm"],
    mimeTypes: ["application/octet-stream", "audio/x-xgm"],
    description: "Mega Drive/Genesis XGM 및 XGM2의 FM/PSG 연주를 음정 이벤트로 복원해 표준 MIDI로 변환합니다.",
    limitation: "FM/PSG 주파수를 음표로 근사하며 PCM 샘플과 일부 칩 고유 표현은 제외됩니다. 압축 XGM2 스트림은 제한될 수 있습니다.",
    detect(bytes) {
      const data = core.asUint8Array(bytes);
      const runtime = root.MabiSegaSaturnSequence;
      if (runtime?.detectXgm) return Boolean(runtime.detectXgm(data));
      return data.length >= 4 && ((data[0] === 0x58 && data[1] === 0x47 && data[2] === 0x4d && data[3] === 0x20) || (data[0] === 0x58 && data[1] === 0x47 && data[2] === 0x4d && data[3] === 0x32));
    },
    convert(bytes, fileName) {
      if (!root.MabiSegaSaturnSequence?.convertXgm) throw new Error("Sega XGM 변환 모듈을 불러오지 못했습니다.");
      return root.MabiSegaSaturnSequence.convertXgm(bytes, fileName);
    },
  });
})();
