(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-vocal.js");

  const definitions = [
    {
      id: "vsq", label: "VOCALOID 2 VSQ", parser: "parseVsq",
      description: "MIDI 기반 VOCALOID 2 시퀀스",
      limitation: "가사·발음·표현 파라미터는 MIDI/MML에서 단순화됩니다.",
    },
    {
      id: "vsqx", label: "VOCALOID VSQX", parser: "parseVsqx",
      description: "VOCALOID 3/4 XML 프로젝트",
      limitation: "보이스뱅크·음소·피치 곡선은 변환하지 않습니다.",
    },
    {
      id: "vpr", label: "VOCALOID VPR", parser: "parseVpr",
      description: "VOCALOID 5/6 프로젝트",
      limitation: "프로젝트 버전에 따라 고급 보컬 파라미터는 제외됩니다.",
    },
    {
      id: "ust", label: "UTAU UST", parser: "parseUst",
      description: "UTAU 텍스트 시퀀스",
      limitation: "음원 설정과 세부 조정값은 제외합니다.",
    },
    {
      id: "ustx", label: "OpenUtau USTX", parser: "parseUstx",
      description: "OpenUtau YAML 프로젝트",
      limitation: "음원과 표현 곡선은 제외합니다.",
    },
    {
      id: "svp", label: "Synthesizer V SVP", parser: "parseSvp",
      description: "Synthesizer V Studio 프로젝트",
      limitation: "가수·음소·피치·보컬 표현 데이터는 제외합니다.",
    },
    {
      id: "s5p", label: "Synthesizer V S5P", parser: "parseS5p",
      description: "초기 Synthesizer V 프로젝트",
      limitation: "가수·음소·피치·보컬 표현 데이터는 제외합니다.",
    },
    {
      id: "ccs", label: "CeVIO CCS", parser: "parseCcs",
      description: "CeVIO Creative Studio 프로젝트",
      limitation: "말하기 트랙과 보컬 표현 데이터는 제외합니다.",
    },
  ];

  for (const definition of definitions) {
    core.registerFormat({
      id: definition.id,
      label: definition.label,
      category: "vocal",
      extensions: [definition.id],
      description: definition.description,
      limitation: definition.limitation,
      convert(bytes, fileName) {
        const parser = root.MabiVocalFormats?.[definition.parser];
        if (typeof parser !== "function") throw new Error("보컬 포맷 변환 모듈을 불러오지 못했습니다.");
        return parser(bytes, fileName);
      },
    });
  }
})();
