(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-legacy-pc.js");

  const runtime = () => root.MabiLegacyPcSequence;
  core.registerFormat({
    id: "xmi",
    label: "Miles XMIDI / XMI",
    category: "standard",
    extensions: ["xmi"],
    mimeTypes: ["application/octet-stream", "audio/x-xmi"],
    description: "Miles Sound System의 XMIDI 시퀀스를 표준 MIDI로 변환합니다.",
    limitation: "한 파일에 여러 독립 시퀀스가 있으면 현재 첫 번째 곡을 불러오며, XMIDI 전용 루프·브랜치 제어는 단순화됩니다.",
    detect(bytes) { return Boolean(runtime()?.detectXmi?.(bytes)); },
    convert(bytes, fileName) {
      if (!runtime()?.convertXmi) throw new Error("XMI 변환 모듈을 불러오지 못했습니다.");
      return runtime().convertXmi(bytes, fileName);
    },
  });
  core.registerFormat({
    id: "hmp",
    label: "HMI HMP",
    category: "standard",
    extensions: ["hmp"],
    mimeTypes: ["application/octet-stream", "audio/x-hmp"],
    description: "Human Machine Interfaces의 HMP MIDI 계열 시퀀스를 표준 MIDI로 변환합니다.",
    limitation: "드라이버 전용 브랜치/콜백 정보는 제외되고 일반 MIDI 연주 이벤트를 중심으로 가져옵니다.",
    detect(bytes) { return Boolean(runtime()?.detectHmp?.(bytes)); },
    convert(bytes, fileName) {
      if (!runtime()?.convertHmp) throw new Error("HMP 변환 모듈을 불러오지 못했습니다.");
      return runtime().convertHmp(bytes, fileName);
    },
  });
  core.registerFormat({
    id: "hmi",
    label: "HMI MIDI",
    category: "standard",
    extensions: ["hmi"],
    mimeTypes: ["application/octet-stream", "audio/x-hmi"],
    description: "Human Machine Interfaces의 HMI MIDI 계열 시퀀스를 표준 MIDI로 변환합니다.",
    limitation: "HMI 전용 브랜치·콜백 데이터는 제외하고 음표·컨트롤·프로그램 정보를 중심으로 가져옵니다.",
    detect(bytes) { return Boolean(runtime()?.detectHmi?.(bytes)); },
    convert(bytes, fileName) {
      if (!runtime()?.convertHmi) throw new Error("HMI 변환 모듈을 불러오지 못했습니다.");
      return runtime().convertHmi(bytes, fileName);
    },
  });
})();
