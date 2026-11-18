(() => {
  "use strict";

  // MML -> standard MIDI file, shared by Simple and Player ("MIDI 저장").
  // Uses the shared MML parser (MabiMml) for notes/tempos and the shared MIDI writer
  // (MabiMusicFormats.buildMidi) for the file, so playback timing and the saved MIDI match.
  const VERSION = "1.0.0";
  const PPQ = 480;
  // The bundled MobiBard SoundFont is not GM-numbered (preset 0~13). Same table as the Editor's
  // MIDI export so a MobiBard instrument becomes the closest GM program in other apps.
  const MOBIBARD_PRESET_TO_GM_PROGRAM = Object.freeze([0, 71, 73, 46, 24, 15, 40, 13, 10, 25, 22, 53]);

  const clampInt = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };

  // MML volume V0~V15 -> MIDI velocity 1~127.
  function velocityFromMmlVolume(volume) {
    const v = clampInt(volume, 0, 15, 8);
    return clampInt((v * 127) / 15, 1, 127, 100);
  }

  function resolveProgram(instrument, embeddedDefault) {
    const bank = clampInt(instrument?.bank, 0, 16383, 0);
    const program = clampInt(instrument?.program, 0, 127, 0);
    if (bank === 128) return { bank: 0, program, isDrums: true };
    if (embeddedDefault && bank === 0 && program < MOBIBARD_PRESET_TO_GM_PROGRAM.length) {
      return { bank: 0, program: MOBIBARD_PRESET_TO_GM_PROGRAM[program] };
    }
    return { bank, program };
  }

  // options.instruments: [{ bank, program }] per MML part (bank/program of the playback preset).
  // options.embeddedDefault: true when those presets come from the bundled MobiBard SoundFont.
  // options.partNames: track names per part.
  function buildMidiFromMml(mml, options = {}) {
    const parser = window.MabiMml;
    const formats = window.MabiMusicFormats;
    if (typeof parser?.parseMabinogiMml !== "function" || typeof formats?.buildMidi !== "function") {
      throw new Error("MML/MIDI module is not loaded.");
    }
    const parseOptions = Number(options.maxParts) > 0 ? { maxParts: Number(options.maxParts) } : {};
    const parsed = parser.parseMabinogiMml(String(mml || ""), parseOptions);
    const tempoEvents = (parsed.tempos || [])
      .map((tempo) => ({ tick: Math.max(0, Math.round((Number(tempo.beat) || 0) * PPQ)), bpm: Number(tempo.bpm) || 120 }))
      .sort((a, b) => a.tick - b.tick);
    if (!tempoEvents.length || tempoEvents[0].tick > 0) tempoEvents.unshift({ tick: 0, bpm: 120 });

    const instruments = Array.isArray(options.instruments) ? options.instruments : [];
    const names = Array.isArray(options.partNames) ? options.partNames : [];
    let noteCount = 0;
    const tracks = (parsed.parts || []).map((part, index) => {
      const notes = (part.notes || []).map((note) => ({
        startTick: Math.max(0, Math.round((Number(note.beat) || 0) * PPQ)),
        durationTick: Math.max(1, Math.round((Number(note.duration) || 0) * PPQ)),
        pitch: clampInt(note.midi, 0, 127, 60),
        velocity: velocityFromMmlVolume(note.volume),
      }));
      noteCount += notes.length;
      const { bank, program, isDrums = false } = resolveProgram(instruments[index], Boolean(options.embeddedDefault));
      return { name: String(names[index] || `MML ${index + 1}`), bank, program, isDrums, notes };
    }).filter((track) => track.notes.length);
    if (!noteCount) {
      const error = new Error("No notes to save.");
      error.code = "no-notes";
      throw error;
    }
    const bytes = formats.buildMidi({
      ppq: PPQ,
      title: String(options.title || "MobiBard"),
      tempoEvents,
      tracks,
      mergeMetaIntoFirstTrack: true,
    });
    return { bytes, noteCount, trackCount: tracks.length };
  }

  function midiFileName(name, fallback = "mobibard") {
    const base = String(name || "").replace(/[\\/:*?"<>|]+/g, "_").trim().replace(/\.(txt|mml|mid|midi|json)$/i, "") || fallback;
    return `${base}.mid`;
  }

  // Native save dialog when available, otherwise a plain download.
  async function saveMidiBytes(bytes, fileName, { description = "MIDI" } = {}) {
    const blob = new Blob([bytes], { type: "audio/midi" });
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description, accept: { "audio/midi": [".mid", ".midi"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
        // Fall through to a download when the picker is blocked (iframes, policies).
      }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  window.MabiMmlMidi = Object.freeze({ VERSION, PPQ, MOBIBARD_PRESET_TO_GM_PROGRAM, buildMidiFromMml, midiFileName, saveMidiBytes, velocityFromMmlVolume });
})();
