(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-tab.js");

  const PITCH_CLASS = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };
  const DEFAULT_TUNINGS = {
    4: [43, 38, 33, 28],
    5: [47, 43, 38, 33, 28],
    6: [64, 59, 55, 50, 45, 40],
    7: [64, 59, 55, 50, 45, 40, 35],
    8: [64, 59, 55, 50, 45, 40, 35, 30],
  };

  function noteNamePitch(label, fallback) {
    const match = /^\s*([a-gA-G])([#b]?)(-?\d+)?\s*$/.exec(label || "");
    if (!match) return fallback;
    const key = `${match[1].toLowerCase()}${match[2] || ""}`;
    const pitchClass = PITCH_CLASS[key];
    if (!Number.isFinite(pitchClass)) return fallback;
    if (match[3] != null) return core.clampInt((Number(match[3]) + 1) * 12 + pitchClass, 0, 127, fallback);
    // ASCII TAB usually names only the open string. Choose the octave closest to the expected tuning.
    let best = fallback;
    let distance = Infinity;
    for (let octave = 0; octave <= 8; octave++) {
      const pitch = (octave + 1) * 12 + pitchClass;
      const nextDistance = Math.abs(pitch - fallback);
      if (nextDistance < distance) { best = pitch; distance = nextDistance; }
    }
    return best;
  }

  function extractGroups(text) {
    const lines = String(text || "").split(/\r?\n/);
    const groups = [];
    let current = [];
    for (const raw of lines) {
      const match = /^\s*([A-Ga-g](?:#|b)?(?:-?\d+)?)?\s*([|:])(.+)$/.exec(raw);
      const looksTab = match && /[-\d|:]/.test(match[3]) && /-/.test(match[3]);
      if (looksTab) {
        current.push({ label: match[1] || "", body: `${match[2]}${match[3]}` });
      } else if (current.length) {
        if (current.length >= 4) groups.push(current);
        current = [];
      }
    }
    if (current.length >= 4) groups.push(current);
    return groups;
  }

  function parseAsciiTab(bytes, fileName) {
    const text = core.textDecode(bytes);
    const groups = extractGroups(text);
    if (!groups.length) throw new Error(`${fileName}에서 4줄 이상의 ASCII TAB 묶음을 찾지 못했습니다.`);
    const tracks = [];
    let globalStart = 0;
    let totalNotes = 0;

    groups.forEach((group, groupIndex) => {
      const lineCount = group.length;
      const defaults = DEFAULT_TUNINGS[lineCount] || Array.from({ length: lineCount }, (_, index) => 64 - index * 5);
      const tuning = group.map((line, index) => noteNamePitch(line.label, defaults[index] ?? 40));
      const maxLength = Math.max(...group.map(line => line.body.length));
      const notesByColumn = new Map();
      group.forEach((line, stringIndex) => {
        const body = line.body.padEnd(maxLength, "-");
        const numberPattern = /\d+/g;
        let match;
        while ((match = numberPattern.exec(body))) {
          const column = match.index;
          const fret = Number(match[0]);
          const pitch = core.clampInt(tuning[stringIndex] + fret, 0, 127, 60);
          if (!notesByColumn.has(column)) notesByColumn.set(column, []);
          notesByColumn.get(column).push(pitch);
        }
      });
      const columns = Array.from(notesByColumn.keys()).sort((a, b) => a - b);
      if (!columns.length) return;
      const meaningfulDistances = [];
      for (let index = 1; index < columns.length; index++) {
        const distance = columns[index] - columns[index - 1];
        if (distance > 0 && distance < 32) meaningfulDistances.push(distance);
      }
      meaningfulDistances.sort((a, b) => a - b);
      const typicalSpacing = meaningfulDistances[Math.floor(meaningfulDistances.length / 2)] || 4;
      const ticksPerColumn = Math.max(15, Math.round(core.DEFAULT_PPQ / Math.max(4, typicalSpacing * 2)));
      const notes = [];
      columns.forEach((column, index) => {
        const nextColumn = columns[index + 1] ?? (column + typicalSpacing);
        const duration = Math.max(core.DEFAULT_PPQ / 8, (nextColumn - column) * ticksPerColumn * 0.9);
        for (const pitch of notesByColumn.get(column)) {
          notes.push({
            startTick: globalStart + column * ticksPerColumn,
            durationTick: Math.round(duration),
            pitch,
            velocity: 96,
          });
          totalNotes++;
        }
      });
      const endTick = Math.max(...notes.map(note => note.startTick + note.durationTick), globalStart);
      tracks.push({ name: `TAB ${groupIndex + 1}`, program: 24, notes });
      globalStart = endTick + core.DEFAULT_PPQ;
    });

    if (!totalNotes) throw new Error(`${fileName}에서 프렛 숫자를 찾지 못했습니다.`);
    return {
      midiBytes: core.buildMidi({
        title: fileName.replace(/\.tab$/i, ""),
        ppq: core.DEFAULT_PPQ,
        tempoEvents: [{ tick: 0, bpm: 120 }],
        tracks,
      }),
      metadata: { trackCount: tracks.length, noteCount: totalNotes, rhythmEstimated: true },
    };
  }

  core.registerFormat({
    id: "ascii-tab",
    label: "ASCII TAB",
    category: "tablature",
    extensions: ["tab"],
    description: "텍스트 기타·베이스 TAB의 줄과 프렛을 음표로 변환",
    limitation: "텍스트 TAB에는 정확한 박자가 없으므로 간격을 기준으로 리듬을 추정합니다.",
    convert: parseAsciiTab,
  });
})();
