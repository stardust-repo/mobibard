(() => {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const core = root.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-tracker.js");
  core.registerFormat({
    id: "tracker-module",
    label: "Tracker MOD / S3M / XM / IT",
    category: "standard",
    extensions: ["mod", "s3m", "xm", "it"],
    mimeTypes: ["application/octet-stream", "audio/x-mod", "audio/x-s3m", "audio/x-xm", "audio/x-it"],
    description: "대표적인 Tracker 모듈의 패턴·노트·템포·볼륨 정보를 표준 MIDI로 변환합니다.",
    limitation: "샘플 음색, 세밀한 tracker effect, 포르타멘토·필터·샘플 오프셋 등 모듈 고유 효과는 GM 악기/일반 MIDI 표현으로 단순화됩니다.",
    detect(bytes, fileName) { return Boolean(root.MabiTrackerSequence?.detect?.(bytes, fileName)); },
    convert(bytes, fileName) {
      if (!root.MabiTrackerSequence?.convert) throw new Error("Tracker 변환 모듈을 불러오지 못했습니다.");
      return root.MabiTrackerSequence.convert(bytes, fileName);
    },
  });
})();
