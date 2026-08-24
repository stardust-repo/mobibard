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

  core.registerFormat({
    id: "sega-vgm",
    label: "VGM / VGZ",
    category: "console",
    extensions: ["vgm", "vgz"],
    mimeTypes: ["audio/x-vgm", "application/x-vgm"],
    description: "VGM/VGZ 사운드칩 로그의 FM/PSG 주파수와 Key On/Off를 복원해 표준 MIDI로 변환합니다.",
    limitation: "YM/OPL/PSG의 음정 채널을 중심으로 복원합니다. PCM/DAC, 노이즈·리듬 모드, 칩 고유 변조·효과는 제외되거나 단순화됩니다.",
    detect(bytes) {
      const runtime = root.MabiSegaLoggedSequence;
      if (runtime?.detectVgm) return Boolean(runtime.detectVgm(bytes));
      const data = core.asUint8Array(bytes);
      return data.length >= 4 && data[0] === 0x56 && data[1] === 0x67 && data[2] === 0x6d && data[3] === 0x20;
    },
    convert(bytes, fileName) {
      if (!root.MabiSegaLoggedSequence?.convertVgm) throw new Error("VGM/VGZ 변환 모듈을 불러오지 못했습니다.");
      return root.MabiSegaLoggedSequence.convertVgm(bytes, fileName);
    },
  });

  core.registerFormat({
    id: "sega-gym",
    label: "Sega Mega Drive GYM",
    category: "console",
    extensions: ["gym"],
    mimeTypes: ["audio/x-gym", "application/x-gym"],
    description: "Mega Drive/Genesis GYM의 YM2612·SN76489 레지스터 로그를 FM/PSG 음표로 복원해 표준 MIDI로 변환합니다.",
    limitation: "FM/PSG 음정 채널을 복원하며 PCM/DAC와 PSG 노이즈는 제외됩니다. PAL 표기가 없는 raw GYM은 기본 60 Hz로 해석합니다.",
    detect(bytes, fileName) {
      const runtime = root.MabiSegaLoggedSequence;
      if (runtime?.detectGym) return Boolean(runtime.detectGym(bytes, fileName));
      const data = core.asUint8Array(bytes);
      return data.length >= 4 && data[0] === 0x47 && data[1] === 0x59 && data[2] === 0x4d && data[3] === 0x58;
    },
    convert(bytes, fileName) {
      if (!root.MabiSegaLoggedSequence?.convertGym) throw new Error("GYM 변환 모듈을 불러오지 못했습니다.");
      return root.MabiSegaLoggedSequence.convertGym(bytes, fileName);
    },
  });

  core.registerFormat({
    id: "s98",
    label: "S98 Sound Log",
    category: "console",
    extensions: ["s98"],
    mimeTypes: ["audio/x-s98", "application/x-s98"],
    description: "S98 v0~v3의 OPN/OPNA/OPN2/OPM/OPLL/OPL/OPL3 및 PSG 로그에서 음정 이벤트를 복원해 표준 MIDI로 변환합니다.",
    limitation: "FM/PSG의 음정 채널 중심 변환입니다. 리듬·ADPCM·노이즈와 칩 고유 효과는 제외되거나 단순화되며, 지원되지 않는 장치는 건너뜁니다.",
    detect(bytes) {
      const runtime = root.MabiSegaLoggedSequence;
      if (runtime?.detectS98) return Boolean(runtime.detectS98(bytes));
      const data = core.asUint8Array(bytes);
      return data.length >= 4 && data[0] === 0x53 && data[1] === 0x39 && data[2] === 0x38 && data[3] >= 0x30 && data[3] <= 0x33;
    },
    convert(bytes, fileName) {
      if (!root.MabiSegaLoggedSequence?.convertS98) throw new Error("S98 변환 모듈을 불러오지 못했습니다.");
      return root.MabiSegaLoggedSequence.convertS98(bytes, fileName);
    },
  });

})();
