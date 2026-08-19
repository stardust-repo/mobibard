(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  const utils = window.MabiUtils;
  const notation = window.MabiNotation;
  if (!core) throw new Error("music-format-core.js must be loaded before guitarpro-local.js");
  if (!utils) throw new Error("utils.js must be loaded before guitarpro-local.js");
  if (!notation) throw new Error("notation-utils.js must be loaded before guitarpro-local.js");
  const clamp = utils.clampInt;
  const GP_FORMATS = Object.freeze([
    { extension: "gp3", signatures: ["FICHIER GUITAR PRO v3"] },
    { extension: "gp5", signatures: ["FICHIER GUITAR PRO v5"] },
  ]);

  function asciiAt(bytes, offset, text) {
    const view = utils.toUint8Array(bytes);
    const expected = String(text || "");
    if (offset < 0 || offset + expected.length > view.length) return false;
    for (let index = 0; index < expected.length; index++) {
      if (view[offset + index] !== expected.charCodeAt(index)) return false;
    }
    return true;
  }

  function startsWithGpHeader(bytes, signature) {
    const view = utils.toUint8Array(bytes);
    return asciiAt(view, 0, signature)
      || (view.length > 1 && view[0] >= signature.length && asciiAt(view, 1, signature));
  }

  function selectGuitarProContainer(value, formatHint = "") {
    const candidates = utils.macBinaryForkCandidates(value);
    for (const candidate of candidates) {
      for (const definition of GP_FORMATS) {
        if (definition.signatures.some(signature => startsWithGpHeader(candidate.bytes, signature))) {
          return { extension: definition.extension, bytes: candidate.bytes, metadata: { ...candidate.metadata } };
        }
      }
    }

    const hinted = String(formatHint || "").trim().toLowerCase();
    if (GP_FORMATS.some(definition => definition.extension === hinted) && candidates.length) {
      const candidate = candidates[0];
      return { extension: hinted, bytes: candidate.bytes, metadata: { ...candidate.metadata } };
    }
    return null;
  }

  function detectFormat(value) {
    return selectGuitarProContainer(value)?.extension || "";
  }

  function durationBeats(duration, dotted, tuplet) {
    return notation.noteValueQuarters({
      base: duration,
      dots: dotted,
      actualNotes: tuplet?.num,
      normalNotes: tuplet?.den,
    }, { fallback: 1 });
  }
  function instrumentProgram(text) {
    const m = /(?:MIDI\s*)?(\d+)/i.exec(String(text || ""));
    return clamp(m?.[1], 0, 127, 0);
  }
  function gpMixerValue(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    if (n <= 15) return clamp(Math.round(n * 127 / 15), 0, 127, fallback);
    return clamp(Math.round(n), 0, 127, fallback);
  }
  function gp3DynamicVelocity(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return core.DEFAULT_VELOCITY;
    // GP3 stores one of eight dynamic levels (ppp..fff).
    if (n >= 1 && n <= 8) return clamp(15 + (n - 1) * 16, 1, 127, core.DEFAULT_VELOCITY);
    if (n >= 0 && n <= 7) return clamp(15 + n * 16, 1, 127, core.DEFAULT_VELOCITY);
    return clamp(n, 1, 127, core.DEFAULT_VELOCITY);
  }
  function tabSongToMidi(song, fileName) {
    const ppq = 480;
    const tempoEvents = [];
    const timeSignatures = [];
    const keySignatures = [];
    const seenTempo = new Set(), seenTime = new Set(), seenKey = new Set();
    const tracks = [];
    for (let ti=0; ti<(song.tracks||[]).length; ti++) {
      const track = song.tracks[ti];
      const notes=[];
      const controlChanges=[];
      let tick=0;
      let currentTempo = clamp(song.tempo, 1, 999, 120);
      const activeTies = new Map();
      const initialVolume = gpMixerValue(track.channelSettings?.volume, undefined);
      const initialPan = gpMixerValue(track.channelSettings?.balance, undefined);
      for (const bar of track.bars || []) {
        const barTick = tick;
        const ts = bar.timeSignature || {numerator:4,denominator:4};
        const timeKey = `${barTick}:${ts.numerator}/${ts.denominator}`;
        if (!seenTime.has(timeKey)) { seenTime.add(timeKey); timeSignatures.push({tick:barTick,numerator:ts.numerator,denominator:ts.denominator}); }
        if (bar.keySignature) {
          const key = `${barTick}:${bar.keySignature.accidentalCount}:${bar.keySignature.mode}`;
          if (!seenKey.has(key)) { seenKey.add(key); keySignatures.push({tick:barTick,sharps:bar.keySignature.accidentalCount,minor:bar.keySignature.mode === "minor"}); }
        }
        for (const beat of bar.beats || []) {
          if (Number.isFinite(Number(beat.mixChange?.tempo)) && Number(beat.mixChange.tempo) >= 0) {
            currentTempo = clamp(beat.mixChange.tempo, 1, 999, 120);
          }
          const bpm = currentTempo;
          const tk = `${tick}:${bpm}`;
          if (!seenTempo.has(tk)) { seenTempo.add(tk); tempoEvents.push({tick,bpm}); }
          if (Number.isFinite(Number(beat.mixChange?.volume)) && Number(beat.mixChange.volume) >= 0) {
            controlChanges.push({ tick, controller: 7, value: gpMixerValue(beat.mixChange.volume, 64) });
          }
          if (Number.isFinite(Number(beat.mixChange?.balance)) && Number(beat.mixChange.balance) >= 0) {
            controlChanges.push({ tick, controller: 10, value: gpMixerValue(beat.mixChange.balance, 64) });
          }
          const dur = Math.max(1, Math.round(durationBeats(beat.duration, beat.dotted, beat.tuplet) * ppq));
          for (const n of beat.notes || []) {
            const stringIndex = clamp(n.string, 0, 31, 0);
            const open = Number(track.tuningMidi?.[stringIndex]);
            const pitch = clamp((Number.isFinite(open) ? open : 60) + (Number(n.fret)||0) + (Number(track.capoFret)||0), 0, 127, 60);
            const tieDest = !!n.tie?.destination;
            const tieOrigin = !!n.tie?.origin;
            const key = `${stringIndex}:${pitch}`;
            if (tieDest && activeTies.has(key)) {
              activeTies.get(key).endTick = tick + dur;
            } else {
              const baseVelocity = gp3DynamicVelocity(n.velocity);
              const item={startTick:tick,endTick:tick+dur,pitch,velocity:n.muted?Math.max(1,Math.round(baseVelocity*0.55)):baseVelocity};
              notes.push(item);
              if (tieOrigin || tieDest) activeTies.set(key,item); else activeTies.delete(key);
            }
          }
          tick += dur;
        }
        const expected = Math.max(1, Math.round((Number(ts.numerator)||4) * (4/(Number(ts.denominator)||4)) * ppq));
        if (tick < barTick + expected) tick = barTick + expected;
      }
      tracks.push({
        name:track.name || `Track ${ti+1}`,
        program:track.isPercussion ? 0 : instrumentProgram(track.instrument),
        channel:track.isPercussion ? 9 : undefined,
        isDrums:!!track.isPercussion,
        volume:initialVolume,
        pan:initialPan,
        controlChanges,
        notes
      });
    }
    return { midiBytes:core.buildMidi({ppq,title:song.title||fileName,tempoEvents,timeSignatures,keySignatures,tracks}), metadata:{title:song.title||fileName,trackCount:tracks.length} };
  }
  function gp5RawToMidi(song, fileName) {
    const ppq=480, scale=ppq/(song.quarterTime||960), tracks=[], tempoEvents=[], timeSignatures=[], keySignatures=[];
    const seenTempo=new Set(), seenTime=new Set(), seenKey=new Set();
    for (const h of song.measureHeaders || []) {
      const tick=Math.max(0,Math.round((h.start-(song.quarterTime||960))*scale));
      const bpm=clamp(h.tempo?.value || song.tempoValue,1,999,120);
      const tk=`${tick}:${bpm}`; if(!seenTempo.has(tk)){seenTempo.add(tk);tempoEvents.push({tick,bpm});}
      const ts=h.timeSignature||{numerator:4,denominator:4}; const sk=`${tick}:${ts.numerator}/${ts.denominator}`;
      if(!seenTime.has(sk)){seenTime.add(sk);timeSignatures.push({tick,numerator:ts.numerator,denominator:ts.denominator});}
      const kk=`${tick}:${h.keySignature||0}`; if(!seenKey.has(kk)){seenKey.add(kk);keySignatures.push({tick,sharps:clamp(h.keySignature,-7,7,0),minor:false});}
    }
    for (let ti=0;ti<(song.tracks||[]).length;ti++) {
      const tr=song.tracks[ti], notes=[], ties=new Map(), controlChanges=[];
      const channelSettings=song.channels?.[tr.channel] || null;
      const initialVolume=gpMixerValue(channelSettings?.volume, undefined);
      const initialPan=gpMixerValue(channelSettings?.balance, undefined);
      for (const measure of tr.measures||[]) for (const beat of measure.beats||[]) {
        const start=Math.max(0,Math.round((beat.start-(song.quarterTime||960))*scale));
        if(Number.isFinite(Number(beat.mixChange?.tempo)) && Number(beat.mixChange.tempo)>=0){
          const bpm=clamp(beat.mixChange.tempo,1,999,120); const tk=`${start}:${bpm}`;
          if(!seenTempo.has(tk)){seenTempo.add(tk);tempoEvents.push({tick:start,bpm});}
        }
        if(Number.isFinite(Number(beat.mixChange?.volume)) && Number(beat.mixChange.volume)>=0) controlChanges.push({tick:start,controller:7,value:gpMixerValue(beat.mixChange.volume,64)});
        if(Number.isFinite(Number(beat.mixChange?.balance)) && Number(beat.mixChange.balance)>=0) controlChanges.push({tick:start,controller:10,value:gpMixerValue(beat.mixChange.balance,64)});
        for (const voice of beat.voices||[]) {
          const duration=Math.max(1,Math.round((voice.duration||song.quarterTime/4)*scale));
          for (const n of voice.notes||[]) {
            const string=(tr.strings||[]).find(s=>s.number===n.string);
            const pitch=clamp((string?.value||60)+(n.value||0)+(tr.offset||0),0,127,60);
            const key=`${n.string}:${pitch}`;
            if(n.tiedNote && ties.has(key)) ties.get(key).endTick=Math.max(ties.get(key).endTick,start+duration);
            else { const item={startTick:start,endTick:start+duration,pitch,velocity:(n.velocity===null||n.velocity===undefined)?core.DEFAULT_VELOCITY:clamp(n.velocity,1,127,core.DEFAULT_VELOCITY)};notes.push(item);ties.set(key,item); }
          }
        }
      }
      tracks.push({name:tr.name||`Track ${ti+1}`,program:clamp(tr.program,0,127,0),channel:tr.isDrums?9:undefined,isDrums:!!tr.isDrums,volume:initialVolume,pan:initialPan,controlChanges,notes});
    }
    return {midiBytes:core.buildMidi({ppq,title:song.title||fileName,tempoEvents,timeSignatures,keySignatures,tracks}),metadata:{title:song.title||fileName,trackCount:tracks.length}};
  }
  async function convertGuitarPro(bytes, fileName, formatHint = "") {
    const hint = String(formatHint || core.extensionOf(fileName) || "").toLowerCase();
    const selected = selectGuitarProContainer(bytes, hint);
    const ext = selected?.extension || hint;
    const sourceBytes = selected?.bytes || utils.toUint8Array(bytes);
    const resolvedFileName = String(selected?.metadata?.fileName || fileName || `score.${ext || "gp"}`);
    try {
      let result;
      if (ext === "gp3") {
        if (!window.MabiGp3Parser) throw new Error("로컬 GP3 파서를 찾지 못했습니다.");
        result = tabSongToMidi(window.MabiGp3Parser.parseGp3File(sourceBytes), resolvedFileName);
      } else if (ext === "gp5") {
        if (!window.MabiGp5Parser) throw new Error("로컬 GP5 파서를 찾지 못했습니다.");
        result = gp5RawToMidi(window.MabiGp5Parser.parseGp5(sourceBytes), resolvedFileName);
      } else {
        throw new Error(`오프라인 Guitar Pro 파서가 지원하지 않는 형식입니다: ${ext ? `.${ext}` : "알 수 없음"}`);
      }
      return {
        ...result,
        metadata: {
          ...(result?.metadata || {}),
          container: { ...(selected?.metadata || { macBinary: false, selectedFork: "raw" }) },
        },
      };
    } catch (error) {
      throw new Error(`${resolvedFileName} Guitar Pro 악보를 읽지 못했습니다. (${error?.message || error})`);
    }
  }

  window.MabiGuitarPro = Object.freeze({
    version: "5.0.0",
    supportedExtensions: GP_FORMATS.map(definition => definition.extension),
    detectFormat,
    convertGuitarPro,
  });
})();
