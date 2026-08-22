/*
 * parse-gp5 adaptation for MobiBard.
 * Based on juliangruber/parse-gp5 (MIT).
 * Only score timing, tracks, tuning, notes, tempo and time signatures are emitted.
 */
function parseGp5(bytes) {
  let buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let pos = 0;
  let versionIndex = 0;
  const versions = ["FICHIER GUITAR PRO v5.00", "FICHIER GUITAR PRO v5.10"];
  const QUARTER_TIME = 960;
  const td = new TextDecoder("windows-1252");
  const need = n => { if (pos + n > buf.length) throw new Error("GP5 파일이 잘렸거나 손상되었습니다."); };
  const u8 = () => { need(1); return buf[pos++]; };
  const i8 = () => { const v = u8(); return v > 127 ? v - 256 : v; };
  const i32 = () => { need(4); const v = (buf[pos] | (buf[pos+1]<<8) | (buf[pos+2]<<16) | (buf[pos+3]<<24)); pos += 4; return v; };
  const skip = n => { need(Math.max(0,n)); pos += Math.max(0,n); };
  const str = (size, len = size) => { need(size); const take = Math.max(0, Math.min(len, size)); const s = td.decode(buf.subarray(pos, pos + take)).replace(/\0+$/g, ""); pos += size; return s; };
  const strByte = size => str(size, u8());
  const strByteIntSize = () => { const n = i32(); return strByte(Math.max(0, n - 1)); };
  const strInt = () => { const n = i32(); return str(Math.max(0,n)); };
  const color = () => { const c=[u8(),u8(),u8()]; skip(1); return c; };
  const keySignature = () => i8();

  const version = strByte(30);
  versionIndex = versions.indexOf(version);
  if (versionIndex < 0) throw new Error(`지원하지 않는 GP5 버전입니다: ${version}`);
  const match = /v(\d+)\.(\d+)/.exec(version) || [];
  const title = strByteIntSize();
  const subtitle = strByteIntSize();
  const artist = strByteIntSize();
  const album = strByteIntSize();
  const lyricsAuthor = strByteIntSize();
  const musicAuthor = strByteIntSize();
  const copyright = strByteIntSize();
  const tab = strByteIntSize();
  const instructions = strByteIntSize();
  const commentCount = i32();
  const comments=[]; for(let i=0;i<commentCount;i++) comments.push(strByteIntSize());
  i32();
  const lyric = { from:i32(), lyric:strInt() };
  for(let i=0;i<4;i++){ i32(); strInt(); }
  skip(versionIndex > 0 ? 49 : 30);
  for(let i=0;i<11;i++){ skip(4); strByte(0); }
  const tempoValue = i32();
  if(versionIndex>0) skip(1);
  let currentKey = keySignature(); skip(3); u8();

  const channels=[];
  for(let i=0;i<64;i++){
    const ch={program:i32(),volume:i8(),balance:i8(),chorus:i8(),reverb:i8(),phaser:i8(),tremolo:i8(),bank:i===9?128:0};
    if(ch.program<0) ch.program=0; channels.push(ch); skip(2);
  }
  skip(42);
  const measureCount=i32(), trackCount=i32();
  if(measureCount<0 || trackCount<0 || measureCount>100000 || trackCount>512) throw new Error("GP5 마디/트랙 수가 올바르지 않습니다.");
  const measureHeaders=[];
  let ts={numerator:4,denominator:4};
  for(let i=0;i<measureCount;i++){
    if(i>0) skip(1);
    const flags=u8(); const h={number:i+1,start:0,tempo:{value:120},repeatOpen:!!(flags&4),repeatClose:-1,repeatAlternative:0,marker:null,timeSignature:null,keySignature:currentKey};
    if(flags&1) ts.numerator=i8();
    if(flags&2) ts.denominator=i8();
    h.timeSignature={...ts};
    if(flags&8) h.repeatClose=(i8()&255)-1;
    if(flags&32) h.marker={title:strByteIntSize(),color:color()};
    if(flags&16) h.repeatAlternative=u8();
    if(flags&64){ currentKey=keySignature(); skip(1); h.keySignature=currentKey; }
    if((flags&1)||(flags&2)) skip(4);
    if(!(flags&16)) skip(1);
    h.tripletFeel=i8(); measureHeaders.push(h);
  }

  const tracks=[];
  for(let number=1; number<=trackCount; number++){
    u8(); if(number===1 || versionIndex===0) skip(1);
    const tr={number,name:"",strings:[],measures:[],program:0,channel:0,isDrums:false,offset:0};
    tr.name=strByte(40);
    const stringCount=i32();
    for(let i=0;i<7;i++){ const tuning=i32(); if(stringCount>i) tr.strings.push({number:i+1,value:tuning}); }
    i32();
    const gm1=i32()-1, gm2=i32()-1;
    tr.channel=Math.max(0,Math.min(15,gm1)); tr.isDrums=gm1===9; tr.program=channels[gm1]?.program ?? 0; tr.effectChannel=gm2;
    i32(); tr.offset=i32(); tr.color=color();
    skip(versionIndex>0?49:44);
    if(versionIndex>0){ strByteIntSize(); strByteIntSize(); }
    tracks.push(tr);
  }
  skip(versionIndex===0?2:1);

  const getBeat=(measure,start)=>{ let b=measure.beats.find(x=>x.start===start); if(!b){b={start,voices:[{notes:[],duration:0,empty:false},{notes:[],duration:0,empty:false}],stroke:{}};measure.beats.push(b);} return b; };
  const getTied=(stringNo,track)=>{ for(let m=track.measures.length-1;m>=0;m--){const mm=track.measures[m];for(let b=mm.beats.length-1;b>=0;b--){for(const v of mm.beats[b].voices){for(const n of v.notes){if(n.string===stringNo)return n.value;}}}} return 0; };
  const readBend=()=>{ skip(5); const n=i32(); const points=[]; for(let j=0;j<n;j++) points.push({position:i32(),value:i32(),vibrato:u8()}); return points; };
  const readGrace=()=>{ const x={fret:u8(),dynamic:u8(),transition:i8(),duration:u8(),flags:u8()}; return x; };
  const readArtificial=()=>{ const type=i8(); if(type===2)skip(3); else if(type===3)skip(1); return type; };
  const readNoteEffects=effect=>{ const f1=u8(),f2=u8(); if(f1&1) effect.bend=readBend(); if(f1&16) effect.grace=readGrace(); if(f2&4) effect.tremoloPicking=u8(); if(f2&8){effect.slide=true;i8();} if(f2&16)effect.harmonic=readArtificial(); if(f2&32){effect.trill={fret:i8(),period:i8()};} effect.hammer=!!(f1&2); effect.letRing=!!(f1&8); effect.vibrato=!!(f2&64); effect.palmMute=!!(f2&2); effect.staccato=!!(f2&1); };
  const readNote=(string,track,effect)=>{ const flags=u8(); const n={string:string.number,value:0,tiedNote:false,dead:false,velocity:null,effect}; effect.accentuatedNote=!!(flags&64);effect.heavyAccentuatedNote=!!(flags&2);effect.ghostNote=!!(flags&4); if(flags&32){const type=u8();n.tiedNote=type===2;n.dead=type===3;} if(flags&16){const dyn=i8();n.velocity=Math.max(1,Math.min(127,15+dyn*16));} if(flags&32){const fret=i8();n.value=n.tiedNote?getTied(string.number,track):fret;if(n.value<0||n.value>=100)n.value=0;} if(flags&128)skip(2); if(flags&1)skip(8); skip(1); if(flags&8)readNoteEffects(effect); return n; };
  const readTremoloBar=()=>{ skip(5); const n=i32(); for(let j=0;j<n;j++){i32();i32();u8();} };
  const readBeatEffects=(beat,effect)=>{const f1=u8(),f2=u8();effect.fadeIn=!!(f1&16);effect.vibrato=!!(f1&2);if(f1&32)u8();if(f2&4)readTremoloBar();if(f1&64){beat.stroke.up=i8();beat.stroke.down=i8();}if(f2&2)u8();};
  const readChord=beat=>{skip(17);beat.chordName=strByte(21);skip(4);i32();for(let i=0;i<7;i++)i32();skip(32);};
  const durationTicks=flags=>{ const val=Math.pow(2,(i8()+4))/4; let dotted=!!(flags&1), enters=1,times=1;if(flags&32){const t=i32();const map={3:[3,2],5:[5,4],6:[6,4],7:[7,4],9:[9,8],10:[10,8],11:[11,8],12:[12,8],13:[13,8]};[enters,times]=map[t]||[1,1];}let time=QUARTER_TIME*4/val;if(dotted)time+=time/2;return time*times/enters;};
  const readMixChange=tempo=>{ const instrument=i8();skip(16);const vals=[i8(),i8(),i8(),i8(),i8(),i8()];strByteIntSize();const tv=i32();for(const v of vals)if(v>=0)i8();if(tv>=0){tempo.value=tv;skip(1);if(versionIndex>0)skip(1);}i8();skip(1);if(versionIndex>0){strByteIntSize();strByteIntSize();}return{instrument,volume:vals[0],balance:vals[1],chorus:vals[2],reverb:vals[3],phaser:vals[4],tremolo:vals[5],tempo:tv};};
  const readBeat=(start,measure,track,tempo,voiceIndex)=>{const flags=u8();const beat=getBeat(measure,start),voice=beat.voices[voiceIndex];if(flags&64){const type=u8();voice.empty=(type&2)===0;}const dur=durationTicks(flags);if(flags&2)readChord(beat);if(flags&4)beat.text=strByteIntSize();const effect={};if(flags&8)readBeatEffects(beat,effect);if(flags&16)beat.mixChange=readMixChange(tempo);const stringFlags=u8();for(let i=6;i>=0;i--){if((stringFlags&(1<<i))!==0 && (6-i)<track.strings.length){const s={...track.strings[6-i]};voice.notes.push(readNote(s,track,{...effect}));}}voice.duration=dur;skip(1);const read=i8();if(read&2)skip(1);return voice.notes.length?dur:0;};
  const readMeasure=(measure,track,tempo)=>{for(let voice=0;voice<2;voice++){let start=measure.start;const beats=i32();for(let k=0;k<beats;k++)start+=readBeat(start,measure,track,tempo,voice);}measure.beats=measure.beats.filter(b=>b.voices.some(v=>v.notes.length));};
  const getLength=h=>h.timeSignature.numerator*(QUARTER_TIME*4/h.timeSignature.denominator);
  let tempo={value:tempoValue}, start=QUARTER_TIME;
  for(let i=0;i<measureCount;i++){
    const header=measureHeaders[i]; header.start=start;
    for(let j=0;j<trackCount;j++){
      const tr=tracks[j], measure={header,start,beats:[]};tr.measures.push(measure);readMeasure(measure,tr,tempo);skip(1);
    }
    header.tempo={...tempo};start+=getLength(header);
  }
  return {version:{major:Number(match[1]||5),minor:Number(match[2]||0)},title,subtitle,artist,album,lyricsAuthor,musicAuthor,copyright,tab,instructions,comments,lyric,tempoValue,keySignature:currentKey,channels,measureHeaders,tracks,quarterTime:QUARTER_TIME};
}

window.MabiGp5Parser = Object.freeze({ parseGp5 });
