(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-midi.js");
  core.registerFormat({
    id: "midi",
    label: "MIDI",
    category: "basic",
    extensions: ["mid", "midi"],
    mimeTypes: ["audio/midi", "audio/x-midi", "application/midi", "application/x-midi"],
    description: "표준 MIDI 및 MacBinary로 포장된 MIDI",
    convert(bytes) {
      const view = core.asUint8Array(bytes);
      if (String.fromCharCode(...view.subarray(0, 4)) === "MThd") return { midiBytes: view };
      if (view.length >= 142 && String.fromCharCode(...view.subarray(128, 132)) === "MThd") {
        const dataForkLength = ((view[83] << 24) | (view[84] << 16) | (view[85] << 8) | view[86]) >>> 0;
        const available = Math.max(0, view.length - 128);
        const length = dataForkLength > 0 && dataForkLength <= available ? dataForkLength : available;
        return { midiBytes: view.slice(128, 128 + length), metadata: { macBinary: true } };
      }
      throw new Error("표준 MIDI 헤더(MThd)를 찾지 못했습니다.");
    },
    detect(bytes) {
      const signature = String.fromCharCode(...bytes.subarray(0, 4));
      const wrapped = bytes.length >= 132 && String.fromCharCode(...bytes.subarray(128, 132)) === "MThd";
      return signature === "MThd" || wrapped;
    },
  });
})();
