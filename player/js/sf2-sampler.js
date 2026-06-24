(() => {
  "use strict";

async function parseSoundFont(bytes) {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "sfbk") throw new Error("SF2 파일이 아닙니다. RIFF/sfbk 헤더를 확인해 주세요.");
  const root = parseRiff(bytes, 12, bytes.length);
  const sdta = findList(root, "sdta");
  const pdta = findList(root, "pdta");
  if (!sdta || !pdta) throw new Error("SF2에 필요한 sdta/pdta 영역이 없습니다.");
  const smpl = findChunk(sdta.children, "smpl");
  if (!smpl) throw new Error("SF2 샘플 데이터(smpl)를 찾지 못했습니다.");
  const tables = parsePdta(bytes, pdta);
  if (!tables.phdr.length || !tables.shdr.length) throw new Error("SF2 프리셋 또는 샘플 헤더가 비어 있습니다.");
  const sampleData = new Int16Array(bytes.buffer, bytes.byteOffset + smpl.offset, Math.floor(smpl.size / 2));
  const sf = new SoundFont(sampleData, tables);
  sf.buildPresets();
  return sf;
}

class SoundFont {
  constructor(sampleData, tables) {
    Object.assign(this, tables);
    this.sampleData = sampleData;
    this.bufferCache = new Map();
    this.presets = [];
  }
  buildPresets() {
    for (let p = 0; p < this.phdr.length - 1; p++) {
      const h = this.phdr[p];
      const next = this.phdr[p + 1];
      const regions = [];
      const pZones = this.getZones(this.pbag, this.pgen, h.bagIndex, next.bagIndex);
      const pGlobal = mergeGenerators(pZones.filter(z => z.instrument == null));
      for (const pz of pZones.filter(z => z.instrument != null)) {
        const inst = this.inst[pz.instrument];
        const instNext = this.inst[pz.instrument + 1];
        if (!inst || !instNext) continue;
        const iZones = this.getZones(this.ibag, this.igen, inst.bagIndex, instNext.bagIndex);
        const iGlobal = mergeGenerators(iZones.filter(z => z.sampleID == null));
        for (const iz of iZones.filter(z => z.sampleID != null)) {
          const params = combineParams(pGlobal, pz, iGlobal, iz);
          const sample = this.shdr[params.sampleID];
          if (!sample || sample.name === "EOS") continue;
          regions.push({ ...params, sample });
        }
      }
      this.presets.push({ name: h.name, preset: h.preset, bank: h.bank, regions });
    }
  }
  getZones(bags, gens, start, end) {
    const zones = [];
    for (let i = start; i < end; i++) {
      const b = bags[i]; const n = bags[i + 1]; if (!b || !n) continue;
      zones.push(readGenerators(gens.slice(b.genIndex, n.genIndex)));
    }
    return zones;
  }
  findPreset(program) {
    return this.presets.find(p => p.bank === 0 && p.preset === program) || this.presets.find(p => p.preset === program);
  }
  getBufferForSample(ctx, sample) {
    const key = sample.name + ":" + sample.start + ":" + sample.end;
    if (this.bufferCache.has(key)) return this.bufferCache.get(key);
    const start = Math.max(0, sample.start);
    const end = Math.min(this.sampleData.length, sample.end);
    const len = Math.max(1, end - start);
    const buffer = ctx.createBuffer(1, len, Math.max(8000, sample.sampleRate || 22050));
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = this.sampleData[start + i] / 32768;
    this.bufferCache.set(key, buffer);
    return buffer;
  }
}
  function prepareNotes(ctx, sf, preset, notes) {
    const prepared = [];
    if (!preset || !Array.isArray(preset.regions)) return prepared;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (!n || n.midi == null) continue;
      if ((n.volume || 0) <= 0) continue;
      if (!Number.isFinite(n.start) || !Number.isFinite(n.durationSec) || n.durationSec <= 0) continue;

      const velocity = Math.max(1, Math.round(n.volume / 15 * 127));
      const region = selectRegion(preset.regions, n.midi, velocity);
      if (!region) continue;

      const sample = region.sample;
      const buffer = sf.getBufferForSample(ctx, sample);
      const root = region.overridingRootKey ?? sample.originalPitch ?? 60;
      const cents = (n.midi - root + (region.coarseTune || 0)) * 100 + (region.fineTune || 0) + (sample.pitchCorrection || 0);
      const atten = Math.pow(10, -(region.initialAttenuation || 0) / 200);
      const gainValue = Math.pow(Math.max(0, Math.min(1, n.volume / 15)), 1.6) * atten;

      prepared.push({
        ...n,
        id: i,
        noteEnd: n.start + n.durationSec,
        region,
        sample,
        buffer,
        playbackRate: Math.pow(2, cents / 1200),
        gainValue
      });
    }

    prepared.sort((a, b) => a.start - b.start || a.part - b.part || a.id - b.id);
    return prepared;
  }

  function schedulePreparedNotes(ctx, preparedNotes, options = {}) {
    const baseTime = Number(options.baseTime) || ctx.currentTime;
    const fromSec = Number(options.fromSec) || 0;
    const windowStart = Math.max(0, Number(options.windowStart) || fromSec);
    const windowEnd = Math.max(windowStart, Number(options.windowEnd) || windowStart);
    const output = options.destination || ctx.destination;
    const activeSources = options.activeSources || null;
    const scheduledIds = options.scheduledIds || null;
    const minLeadTime = Math.max(0.005, Number(options.minLeadTime) || 0.015);
    const playbackSpeed = Math.max(0.05, Number(options.playbackSpeed) || 1);
    const now = ctx.currentTime;
    let maxEnd = now;
    let count = 0;

    for (const n of preparedNotes) {
      if (n.start >= windowEnd) break;
      if (n.noteEnd <= windowStart + 0.0001) continue;
      if (scheduledIds && scheduledIds.has(n.id)) continue;

      const audibleStart = Math.max(n.start, fromSec, windowStart);
      const remainingDur = n.noteEnd - audibleStart;
      if (remainingDur <= 0.002) continue;

      let start = baseTime + (audibleStart - fromSec) / playbackSpeed;
      if (start < now + minLeadTime) start = now + minLeadTime;
      const playDur = Math.max(0.006, remainingDur / playbackSpeed);
      const end = start + playDur;

      const source = ctx.createBufferSource();
      source.buffer = n.buffer;
      source.playbackRate.value = n.playbackRate;

      const sample = n.sample;
      const region = n.region;
      if ((region.sampleModes & 1) && sample.endLoop > sample.startLoop && sample.endLoop <= sample.end) {
        source.loop = true;
        source.loopStart = Math.max(0, (sample.startLoop - sample.start) / sample.sampleRate);
        source.loopEnd = Math.max(source.loopStart + 0.001, (sample.endLoop - sample.start) / sample.sampleRate);
      }

      const gain = ctx.createGain();
      const v = n.gainValue;
      const attack = Math.min(0.008, playDur * 0.25);
      const release = Math.min(0.04, Math.max(0.004, playDur * 0.55));
      const holdEnd = Math.max(start + attack, end - release);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(v, start + attack);
      gain.gain.setValueAtTime(v, holdEnd);
      gain.gain.linearRampToValueAtTime(0.0001, end + release);

      source.connect(gain).connect(output);
      source.start(start);
      source.stop(end + release + 0.03);

      if (scheduledIds) scheduledIds.add(n.id);
      if (activeSources) {
        const item = { source, gain, id: n.id };
        source.onended = () => {
          const idx = activeSources.indexOf(item);
          if (idx >= 0) activeSources.splice(idx, 1);
          try { source.disconnect(); } catch {}
          try { gain.disconnect(); } catch {}
        };
        activeSources.push(item);
      }

      maxEnd = Math.max(maxEnd, end);
      count++;
    }

    return { maxEnd, count };
  }

  function scheduleNotes(ctx, sf, preset, notes, baseTime, master, fromSec = 0, destination = null, activeSources = null) {
    const prepared = prepareNotes(ctx, sf, preset, notes);
    const duration = notes.reduce((m, n) => Math.max(m, n.start + n.durationSec), fromSec);
    const result = schedulePreparedNotes(ctx, prepared, {
      baseTime,
      fromSec,
      windowStart: fromSec,
      windowEnd: duration + 1,
      destination,
      activeSources,
      scheduledIds: new Set()
    });
    return result.maxEnd;
  }

function selectRegion(regions, midi, velocity) {
  let best = null, bestScore = -1;
  for (const r of regions) {
    const kr = r.keyRange || [0, 127], vr = r.velRange || [0, 127];
    if (midi < kr[0] || midi > kr[1] || velocity < vr[0] || velocity > vr[1]) continue;
    const score = (kr[1] - kr[0] <= 12 ? 2 : 0) + (vr[1] - vr[0] <= 32 ? 1 : 0);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

function parseRiff(bytes, start, end) {
  const chunks = [];
  let pos = start;
  while (pos + 8 <= end) {
    const id = ascii(bytes, pos, 4);
    const size = u32le(bytes, pos + 4);
    const data = pos + 8;
    if (id === "LIST") chunks.push({ id, type: ascii(bytes, data, 4), offset: data + 4, size: size - 4, children: parseRiff(bytes, data + 4, data + size) });
    else chunks.push({ id, offset: data, size });
    pos = data + size + (size & 1);
  }
  return chunks;
}
function findList(chunks, type) { return chunks.find(c => c.id === "LIST" && c.type === type); }
function findChunk(chunks, id) { return chunks.find(c => c.id === id); }

function parsePdta(bytes, pdta) {
  const c = pdta.children;
  return {
    phdr: readRecords(bytes, findChunk(c, "phdr"), 38, readPhdr),
    pbag: readRecords(bytes, findChunk(c, "pbag"), 4, readBag),
    pgen: readRecords(bytes, findChunk(c, "pgen"), 4, readGen),
    inst: readRecords(bytes, findChunk(c, "inst"), 22, readInst),
    ibag: readRecords(bytes, findChunk(c, "ibag"), 4, readBag),
    igen: readRecords(bytes, findChunk(c, "igen"), 4, readGen),
    shdr: readRecords(bytes, findChunk(c, "shdr"), 46, readShdr)
  };
}
function readRecords(bytes, chunk, size, fn) { if (!chunk) throw new Error(`SF2 ${size}바이트 테이블을 찾지 못했습니다.`); const out = []; for (let p = chunk.offset; p + size <= chunk.offset + chunk.size; p += size) out.push(fn(bytes, p)); return out; }
function readName(bytes, p, n) { let s = ""; for (let i = 0; i < n; i++) { const b = bytes[p + i]; if (!b) break; s += String.fromCharCode(b); } return s; }
function readPhdr(b,p){ return { name:readName(b,p,20), preset:u16le(b,p+20), bank:u16le(b,p+22), bagIndex:u16le(b,p+24) }; }
function readBag(b,p){ return { genIndex:u16le(b,p), modIndex:u16le(b,p+2) }; }
function readInst(b,p){ return { name:readName(b,p,20), bagIndex:u16le(b,p+20) }; }
function readGen(b,p){ return { op:u16le(b,p), amount:u16le(b,p+2), sAmount:i16le(b,p+2), lo:b[p+2], hi:b[p+3] }; }
function readShdr(b,p){ return { name:readName(b,p,20), start:u32le(b,p+20), end:u32le(b,p+24), startLoop:u32le(b,p+28), endLoop:u32le(b,p+32), sampleRate:u32le(b,p+36), originalPitch:b[p+40], pitchCorrection:i8(b[p+41]), sampleLink:u16le(b,p+42), sampleType:u16le(b,p+44) }; }

function readGenerators(gens) {
  const z = {};
  for (const g of gens) {
    switch (g.op) {
      case 41: z.instrument = g.amount; break;
      case 43: z.keyRange = [g.lo, g.hi]; break;
      case 44: z.velRange = [g.lo, g.hi]; break;
      case 48: z.initialAttenuation = g.amount; break;
      case 51: z.coarseTune = g.sAmount; break;
      case 52: z.fineTune = g.sAmount; break;
      case 53: z.sampleID = g.amount; break;
      case 54: z.sampleModes = g.amount; break;
      case 58: z.overridingRootKey = g.amount; break;
    }
  }
  return z;
}
function mergeGenerators(zones) { return zones.reduce((a, z) => combineParams(a, z), {}); }
function combineParams(...objs) {
  const r = { keyRange:[0,127], velRange:[0,127], initialAttenuation:0, coarseTune:0, fineTune:0, sampleModes:0 };
  for (const o of objs) {
    if (!o) continue;
    for (const [k,v] of Object.entries(o)) {
      if (k === "initialAttenuation" || k === "coarseTune" || k === "fineTune") r[k] = (r[k] || 0) + v;
      else r[k] = Array.isArray(v) ? [...v] : v;
    }
  }
  return r;
}

function ascii(b, p, n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i] || 0); return s; }
function u16le(b,p){ return b[p] | (b[p+1] << 8); }
function i16le(b,p){ const v = u16le(b,p); return v & 0x8000 ? v - 0x10000 : v; }
function u32le(b,p){ return (b[p] | (b[p+1] << 8) | (b[p+2] << 16) | (b[p+3] << 24)) >>> 0; }
function i8(v){ return v & 0x80 ? v - 0x100 : v; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampInt(v, a, b) { return Math.round(clamp(Number.isFinite(v) ? v : a, a, b)); }
function unique(a) { return [...new Set(a)]; }
function formatTime(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m ? `${m}분 ${s}초` : `${s}초`; }


  window.MabiSf2 = { parseSoundFont, prepareNotes, schedulePreparedNotes, scheduleNotes };
})();
