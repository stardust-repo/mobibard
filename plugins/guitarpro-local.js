(() => {
  "use strict";
  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before guitarpro-local.js");
  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  }
  function durationBeats(duration, dotted, tuplet) {
    const map = { whole:4, half:2, quarter:1, eighth:.5, "16th":.25, "32nd":.125, "64th":.0625, "128th":.03125 };
    let beats = map[duration] || 1;
    let add = beats;
    for (let i=0;i<(Number(dotted)||0);i++) { add/=2; beats+=add; }
    if (tuplet?.num > 0) beats *= (Number(tuplet.den)||1) / Number(tuplet.num);
    return beats;
  }
  function instrumentProgram(text) {
    const m = /(?:MIDI\s*)?(\d+)/i.exec(String(text || ""));
    return clamp(m?.[1], 0, 127, 0);
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
      let tick=0;
      const activeTies = new Map();
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
          const bpm = clamp(beat.tempo || song.tempo, 1, 999, 120);
          const tk = `${tick}:${bpm}`;
          if (!seenTempo.has(tk)) { seenTempo.add(tk); tempoEvents.push({tick,bpm}); }
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
              const item={startTick:tick,endTick:tick+dur,pitch,velocity:n.muted?48:96};
              notes.push(item);
              if (tieOrigin || tieDest) activeTies.set(key,item); else activeTies.delete(key);
            }
          }
          tick += dur;
        }
        const expected = Math.max(1, Math.round((Number(ts.numerator)||4) * (4/(Number(ts.denominator)||4)) * ppq));
        if (tick < barTick + expected) tick = barTick + expected;
      }
      tracks.push({name:track.name || `Track ${ti+1}`,program:instrumentProgram(track.instrument),isDrums:false,notes});
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
      const tr=song.tracks[ti], notes=[], ties=new Map();
      for (const measure of tr.measures||[]) for (const beat of measure.beats||[]) {
        const start=Math.max(0,Math.round((beat.start-(song.quarterTime||960))*scale));
        for (const voice of beat.voices||[]) {
          const duration=Math.max(1,Math.round((voice.duration||song.quarterTime/4)*scale));
          for (const n of voice.notes||[]) {
            const string=(tr.strings||[]).find(s=>s.number===n.string);
            const pitch=clamp((string?.value||60)+(n.value||0)+(tr.offset||0),0,127,60);
            const key=`${n.string}:${pitch}`;
            if(n.tiedNote && ties.has(key)) ties.get(key).endTick=Math.max(ties.get(key).endTick,start+duration);
            else { const item={startTick:start,endTick:start+duration,pitch,velocity:clamp(n.velocity,1,127,96)};notes.push(item);ties.set(key,item); }
          }
        }
      }
      tracks.push({name:tr.name||`Track ${ti+1}`,program:clamp(tr.program,0,127,0),channel:tr.isDrums?9:undefined,isDrums:!!tr.isDrums,notes});
    }
    return {midiBytes:core.buildMidi({ppq,title:song.title||fileName,tempoEvents,timeSignatures,keySignatures,tracks}),metadata:{title:song.title||fileName,trackCount:tracks.length}};
  }
  async function convertGuitarPro(bytes,fileName) {
    const ext=core.extensionOf(fileName);
    try {
      if(ext==="gp3") { if (!window.MabiGp3Parser) throw new Error("로컬 GP3 파서를 찾지 못했습니다."); return tabSongToMidi(window.MabiGp3Parser.parseGp3File(bytes),fileName); }
      if(ext==="gp5") { if (!window.MabiGp5Parser) throw new Error("로컬 GP5 파서를 찾지 못했습니다."); return gp5RawToMidi(window.MabiGp5Parser.parseGp5(bytes),fileName); }
      throw new Error(`오프라인 Guitar Pro 파서가 지원하지 않는 확장자입니다: .${ext}`);
    } catch(error) {
      throw new Error(`${fileName} Guitar Pro 악보를 읽지 못했습니다. (${error?.message||error})`);
    }
  }
  window.MabiGuitarPro=Object.freeze({version:"offline-gp3-gp5-1",supportedExtensions:["gp3","gp5"],convertGuitarPro});
})();
