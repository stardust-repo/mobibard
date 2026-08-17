(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-musicxml.js");
  core.registerFormat({
    id: "musicxml",
    label: "MusicXML",
    category: "basic",
    extensions: ["musicxml", "xml", "mxl"],
    mimeTypes: [
      "application/vnd.recordare.musicxml+xml",
      "application/vnd.recordare.musicxml",
      "application/vnd.recordare.musicxml-mxl",
      "application/musicxml+xml",
      "application/xml",
      "text/xml",
    ],
    description: "MusicXML 악보 및 압축 MusicXML",
    async convert(bytes, fileName) {
      if (!window.MabiMusicXml?.musicXmlToMidiBytes) throw new Error("MusicXML 변환 모듈을 불러오지 못했습니다.");
      return { midiBytes: await window.MabiMusicXml.musicXmlToMidiBytes(bytes, fileName) };
    },
  });
})();
