(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  const parser = window.MabiMidiParser;
  if (!core) throw new Error("music-format-core.js must be loaded before format-midi.js");
  if (!parser) throw new Error("midi-parser.js must be loaded before format-midi.js");

  core.registerFormat({
    id: "midi",
    label: "MIDI / KAR",
    category: "standard",
    extensions: ["mid", "midi", "kar"],
    mimeTypes: [
      "audio/midi",
      "audio/x-midi",
      "application/midi",
      "application/x-midi",
      "audio/kar",
      "audio/x-karaoke",
      "application/x-karaoke",
    ],
    description: "표준 MIDI와 Karaoke MIDI(KAR)의 노트·템포·가사 정보를 가져옵니다.",
    convert(bytes, fileName) {
      const view = core.asUint8Array(bytes);
      if (!parser.asciiAt(view, 0, "MThd")) throw new Error("표준 MIDI 헤더(MThd)를 찾지 못했습니다.");
      // KAR is an SMF file whose lyrics/text are stored in MIDI meta events.
      const parsed = parser.parse(view, { type2Policy: "all" });
      const lyricEventCount = parsed.textEvents.filter(event => event.type === 0x05 || event.type === 0x01).length;
      return {
        midiBytes: view,
        metadata: {
          karaoke: /\.kar$/i.test(String(fileName || "")),
          lyricEventCount,
        },
      };
    },
    detect(bytes) {
      return parser.asciiAt(bytes, 0, "MThd");
    },
  });
})();
