(() => {
  "use strict";

  const tr = (key, values = []) => window.MobibardI18n?.t?.(key, values) || String(key);
  const COMPRESSED_SAMPLE_FLAG = 0x10;
  const DLS_DRUM_FLAG = 0x80000000;
  const FLOAT_SILENCE_EPSILON = 1e-5;

  async function parseSoundBank(bytes, options = {}) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    if (data.length < 12 || ascii(data, 0, 4) !== "RIFF") throw new Error(tr("sound.err_header"));
    const type = ascii(data, 8, 4);
    if (type === "sfbk") return parseSoundFont(data, options);
    if (type === "DLS ") return parseDls(data, options);
    throw new Error(tr("sound.err_header"));
  }

  async function parseSoundFont(bytes, options = {}) {
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "sfbk") throw new Error(tr("sf2.err_header"));
    const root = parseRiff(bytes, 12, bytes.length);
    const sdta = findList(root, "sdta");
    const pdta = findList(root, "pdta");
    if (!sdta || !pdta) throw new Error(tr("sf2.err_sections"));
    const smpl = findChunk(sdta.children, "smpl");
    if (!smpl) throw new Error(tr("sf2.err_samples"));
    const tables = parsePdta(bytes, pdta);
    if (!tables.phdr.length || !tables.shdr.length) throw new Error(tr("sf2.err_headers"));

    const sf = new SoundBank("sf2");
    sf.sampleData = new Int16Array(bytes.buffer, bytes.byteOffset + smpl.offset, Math.floor(smpl.size / 2));
    Object.assign(sf, tables);
    const compressed = tables.shdr.slice(0, -1).filter(sample => (sample.sampleType & COMPRESSED_SAMPLE_FLAG) !== 0);
    if (compressed.length) {
      sf.format = "sf3";
      await decodeSf3Samples(bytes, smpl, compressed, options);
    }
    buildSfPresets(sf);
    return sf;
  }

  class SoundBank {
    constructor(format = "unknown") {
      this.format = format;
      this.sampleData = null;
      this.bufferCache = new Map();
      this.presets = [];
    }
    findPreset(program) {
      return this.presets.find(p => p.bank === 0 && p.preset === program) || this.presets.find(p => p.preset === program);
    }
    hasAudiblePreset(preset) {
      return presetHasAudibleSample(this, preset);
    }
    getBufferForSample(ctx, sample) {
      const key = sample.cacheKey || `${this.format}:${sample.name || "sample"}:${sample.start ?? 0}:${sample.end ?? 0}`;
      if (this.bufferCache.has(key)) return this.bufferCache.get(key);

      let channelData = sample.channelData;
      let sampleRate = Math.max(8000, Number(sample.sampleRate) || 22050);
      if (!Array.isArray(channelData) || !channelData.length) {
        const start = Math.max(0, Number(sample.start) || 0);
        const end = Math.min(this.sampleData?.length || 0, Number(sample.end) || 0);
        const len = Math.max(1, end - start);
        const mono = new Float32Array(len);
        for (let i = 0; i < len; i++) mono[i] = this.sampleData[start + i] / 32768;
        channelData = [mono];
      }

      const length = Math.max(1, ...channelData.map(ch => ch?.length || 0));
      const buffer = ctx.createBuffer(Math.max(1, channelData.length), length, sampleRate);
      for (let c = 0; c < channelData.length; c++) {
        const src = channelData[c] || channelData[0];
        if (!src) continue;
        buffer.getChannelData(c).set(src.subarray(0, length));
      }
      this.bufferCache.set(key, buffer);
      return buffer;
    }
  }

  function presetHasAudibleSample(bank, preset) {
    const regions = Array.isArray(preset?.regions) ? preset.regions : [];
    if (!regions.length) return false;
    return regions.some(region => sampleHasAudibleData(bank, region?.sample));
  }

  function sampleHasAudibleData(bank, sample) {
    if (!sample || sample.invalid) return false;
    if (typeof sample._hasAudibleData === "boolean") return sample._hasAudibleData;

    let audible = false;
    const channels = Array.isArray(sample.channelData) ? sample.channelData : null;
    if (channels?.length) {
      outer: for (const channel of channels) {
        if (!channel?.length) continue;
        for (let i = 0; i < channel.length; i++) {
          if (Math.abs(Number(channel[i]) || 0) > FLOAT_SILENCE_EPSILON) {
            audible = true;
            break outer;
          }
        }
      }
    } else if (bank?.sampleData) {
      const start = Math.max(0, Math.trunc(Number(sample.start) || 0));
      const end = Math.min(bank.sampleData.length, Math.max(start, Math.trunc(Number(sample.end) || 0)));
      for (let i = start; i < end; i++) {
        if (bank.sampleData[i] !== 0) {
          audible = true;
          break;
        }
      }
    }

    sample._hasAudibleData = audible;
    return audible;
  }

  function buildSfPresets(sf) {
    for (let p = 0; p < sf.phdr.length - 1; p++) {
      const h = sf.phdr[p];
      const next = sf.phdr[p + 1];
      const regions = [];
      const pZones = getSfZones(sf.pbag, sf.pgen, h.bagIndex, next.bagIndex);
      const pGlobal = mergeGenerators(pZones.filter(z => z.instrument == null));
      for (const pz of pZones.filter(z => z.instrument != null)) {
        const inst = sf.inst[pz.instrument];
        const instNext = sf.inst[pz.instrument + 1];
        if (!inst || !instNext) continue;
        const iZones = getSfZones(sf.ibag, sf.igen, inst.bagIndex, instNext.bagIndex);
        const iGlobal = mergeGenerators(iZones.filter(z => z.sampleID == null));
        for (const iz of iZones.filter(z => z.sampleID != null)) {
          const params = combineParams(pGlobal, pz, iGlobal, iz);
          const sample = sf.shdr[params.sampleID];
          if (!sample || sample.name === "EOS" || sample.invalid) continue;
          normalizeSfSample(sample, params.sampleID);
          regions.push({ ...params, sample });
        }
      }
      const preset = { name: h.name, preset: h.preset, bank: h.bank, regions };
      if (presetHasAudibleSample(sf, preset)) sf.presets.push(preset);
    }
  }

  function getSfZones(bags, gens, start, end) {
    const zones = [];
    for (let i = start; i < end; i++) {
      const b = bags[i];
      const n = bags[i + 1];
      if (!b || !n) continue;
      zones.push(readGenerators(gens.slice(b.genIndex, n.genIndex)));
    }
    return zones;
  }

  function normalizeSfSample(sample, index) {
    if (sample._normalized) return;
    sample._normalized = true;
    sample.cacheKey = `sf:${index}:${sample.name}:${sample.start}:${sample.end}`;
    const compressed = (sample.sampleType & COMPRESSED_SAMPLE_FLAG) !== 0;
    if (compressed && Array.isArray(sample.channelData) && sample.channelData[0]) {
      sample.sampleRate = sample.decodedSampleRate || sample.sampleRate;
      sample.loopStartFrame = Math.max(0, Number(sample.startLoop) || 0);
      sample.loopEndFrame = Math.max(sample.loopStartFrame, Number(sample.endLoop) || 0);
      sample.frameLength = sample.channelData[0].length;
    } else {
      sample.loopStartFrame = Math.max(0, (Number(sample.startLoop) || 0) - (Number(sample.start) || 0));
      sample.loopEndFrame = Math.max(sample.loopStartFrame, (Number(sample.endLoop) || 0) - (Number(sample.start) || 0));
      sample.frameLength = Math.max(0, (Number(sample.end) || 0) - (Number(sample.start) || 0));
    }
  }

  function extractSf3OggStream(bytes, smpl, sample) {
    const start = Math.max(0, Math.trunc(Number(sample.start) || 0));
    const declaredEnd = Math.max(start, Math.trunc(Number(sample.end) || 0));
    if (start >= smpl.size) throw new Error("Invalid SF3 sample range");

    const absoluteStart = smpl.offset + start;
    // SF3 files found in the wild use both conventions for shdr.end:
    //   - exclusive end offset (standard)
    //   - inclusive last-byte offset (legacy/converter variants, including SC-55)
    // Do not guess from the number. Parse Ogg pages and stop on the EOS page instead.
    // Allow declaredEnd + 1 so either convention contains the whole final page.
    const relativeLimit = Math.min(smpl.size, declaredEnd + 1);
    const absoluteLimit = smpl.offset + relativeLimit;
    if (absoluteLimit <= absoluteStart || ascii(bytes, absoluteStart, 4) !== "OggS") {
      throw new Error(tr("sound.err_sf3_codec", [sample.name || "?"]));
    }

    let pos = absoluteStart;
    let pageCount = 0;
    while (pos + 27 <= absoluteLimit && pageCount < 65536) {
      if (ascii(bytes, pos, 4) !== "OggS") break;
      const segmentCount = bytes[pos + 26] || 0;
      const segmentTableEnd = pos + 27 + segmentCount;
      if (segmentTableEnd > absoluteLimit) break;

      let bodyLength = 0;
      for (let i = pos + 27; i < segmentTableEnd; i++) bodyLength += bytes[i];
      const pageEnd = segmentTableEnd + bodyLength;
      if (pageEnd > absoluteLimit) break;

      const headerType = bytes[pos + 5] || 0;
      pos = pageEnd;
      pageCount++;
      if (headerType & 0x04) {
        return bytes.slice(absoluteStart, pos);
      }
    }

    // Fallback for unusual/malformed streams that do not expose a readable EOS page.
    // Try inclusive first because a truncated Ogg can sometimes decode successfully
    // while silently dropping its final PCM frames, which breaks loop points.
    const inclusiveEnd = Math.min(smpl.size, declaredEnd + 1);
    const exclusiveEnd = Math.min(smpl.size, declaredEnd);
    return {
      inclusive: bytes.slice(absoluteStart, smpl.offset + inclusiveEnd),
      exclusive: bytes.slice(absoluteStart, smpl.offset + exclusiveEnd)
    };
  }

  async function decodeSf3Samples(bytes, smpl, samples, options = {}) {
    const decoder = createAudioDecoder(options);
    if (!decoder) throw new Error(tr("sound.err_decode_unavailable"));
    const failures = [];
    try {
      await mapWithConcurrency(samples, 4, async sample => {
        try {
          const stream = extractSf3OggStream(bytes, smpl, sample);
          let decoded;
          if (stream instanceof Uint8Array) {
            decoded = await decoder.decode(stream);
          } else {
            let inclusiveError = null;
            try {
              decoded = await decoder.decode(stream.inclusive);
            } catch (error) {
              inclusiveError = error;
            }
            if (!decoded) {
              try {
                decoded = await decoder.decode(stream.exclusive);
              } catch (_) {
                throw inclusiveError || _;
              }
            }
          }
          if (!decoded || decoded.channelData.length !== 1) throw new Error(tr("sound.err_sf3_mono", [sample.name || "?"]));
          sample.channelData = decoded.channelData;
          sample.decodedSampleRate = decoded.sampleRate;
        } catch (error) {
          // SF3 permits individually compressed samples. A single broken/unsupported
          // stream must not make the entire sound bank unusable; only presets that
          // depend exclusively on that sample are filtered out later.
          sample.invalid = true;
          sample.decodeError = error?.message || String(error || "decode failed");
          failures.push(sample);
          console.warn(`[Mobibard] SF3 sample decode skipped: ${sample.name || "?"}`, error);
        }
      });
    } finally {
      await decoder.close();
    }
    return failures;
  }

  async function parseDls(bytes, options = {}) {
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "DLS ") throw new Error(tr("dls.err_header"));
    const root = parseRiff(bytes, 12, bytes.length);
    const lins = findList(root, "lins");
    const wvpl = findList(root, "wvpl");
    if (!lins || !wvpl) throw new Error(tr("dls.err_sections"));

    const poolCues = parseDlsPoolTable(bytes, findChunk(root, "ptbl"));
    const waveChunks = wvpl.children.filter(c => c.id === "LIST" && c.type === "wave");
    if (!waveChunks.length) throw new Error(tr("dls.err_waves"));

    const decoder = createAudioDecoder(options);
    let waves;
    try {
      waves = await mapWithConcurrency(waveChunks, 4, (chunk, index) => parseDlsWave(bytes, chunk, index, decoder));
    } finally {
      if (decoder) await decoder.close();
    }
    const waveByPoolIndex = buildDlsWavePoolMap(waves, waveChunks, wvpl, poolCues);

    const bank = new SoundBank("dls");
    const instrumentChunks = lins.children.filter(c => c.id === "LIST" && c.type === "ins ");
    for (let index = 0; index < instrumentChunks.length; index++) {
      const preset = parseDlsInstrument(bytes, instrumentChunks[index], index, waveByPoolIndex);
      if (preset?.regions?.length && presetHasAudibleSample(bank, preset)) bank.presets.push(preset);
    }
    if (!bank.presets.length) throw new Error(tr("dls.err_instruments"));
    return bank;
  }

  function parseDlsPoolTable(bytes, chunk) {
    if (!chunk || chunk.size < 8) return [];
    const cbSize = Math.max(8, u32le(bytes, chunk.offset));
    const count = u32le(bytes, chunk.offset + 4);
    const start = chunk.offset + Math.min(cbSize, chunk.size);
    const out = [];
    for (let i = 0; i < count && start + i * 4 + 4 <= chunk.offset + chunk.size; i++) out.push(u32le(bytes, start + i * 4));
    return out;
  }

  function buildDlsWavePoolMap(waves, chunks, wvpl, poolCues) {
    if (!poolCues.length) return waves;
    const byOffset = new Map();
    for (let i = 0; i < chunks.length; i++) {
      const rel = Math.max(0, chunks[i].start - wvpl.offset);
      byOffset.set(rel, waves[i]);
    }
    return poolCues.map((offset, index) => byOffset.get(offset) || waves[index] || null);
  }

  async function parseDlsWave(bytes, chunk, index, decoder) {
    const fmt = findChunk(chunk.children, "fmt ");
    const data = findChunk(chunk.children, "data");
    if (!fmt || !data) return { invalid: true, name: `Wave ${index + 1}`, cacheKey: `dls:${index}` };
    const name = readInfoName(bytes, chunk.children) || `Wave ${index + 1}`;
    const waveFormat = readWaveFormat(bytes, fmt);
    let decoded = decodeWavePcm(bytes, data, waveFormat);
    if (!decoded) {
      if (!decoder) throw new Error(tr("sound.err_decode_unavailable"));
      const wavBytes = buildWaveFileBytes(bytes, fmt, data);
      decoded = await decoder.decode(wavBytes);
    }
    const wsmp = parseDlsWsmp(bytes, findChunk(chunk.children, "wsmp"));
    return {
      name,
      cacheKey: `dls:${index}:${name}`,
      channelData: decoded.channelData,
      sampleRate: decoded.sampleRate || waveFormat.sampleRate || 22050,
      originalPitch: wsmp?.unityNote ?? 60,
      pitchCorrection: wsmp?.fineTune ?? 0,
      initialAttenuation: dlsAttenuationToSfCentibels(wsmp?.attenuation ?? 0),
      loopStartFrame: wsmp?.loopStart ?? 0,
      loopEndFrame: wsmp?.loopEnd ?? 0,
      frameLength: decoded.channelData?.[0]?.length || 0,
      sampleModes: wsmp?.hasLoop ? 1 : 0,
      dlsWsmp: wsmp
    };
  }

  function parseDlsInstrument(bytes, chunk, index, waveByPoolIndex) {
    const insh = findChunk(chunk.children, "insh");
    const lrgn = findList(chunk.children, "lrgn");
    if (!insh || insh.size < 12 || !lrgn) return null;
    const ulBank = u32le(bytes, insh.offset + 4);
    const program = u32le(bytes, insh.offset + 8) & 0x7f;
    const isDrum = (ulBank & DLS_DRUM_FLAG) !== 0;
    const bankMsb = (ulBank >>> 8) & 0x7f;
    const bankLsb = ulBank & 0x7f;
    // The rest of the player uses SF-style percussion bank 128. Preserve melodic
    // DLS bank numbers as the standard 14-bit MIDI bank value.
    const bankNumber = isDrum ? 128 : ((bankMsb << 7) | bankLsb);
    const name = readInfoName(bytes, chunk.children) || `DLS ${index + 1}`;
    const regions = [];
    const regionChunks = lrgn.children.filter(c => c.id === "LIST" && (c.type === "rgn " || c.type === "rgn2"));
    for (const regionChunk of regionChunks) {
      const region = parseDlsRegion(bytes, regionChunk, waveByPoolIndex);
      if (region) regions.push(region);
    }
    return { name, bank: bankNumber, preset: program, regions, dlsBankMsb: bankMsb, dlsBankLsb: bankLsb, isDrum };
  }

  function parseDlsRegion(bytes, chunk, waveByPoolIndex) {
    const rgnh = findChunk(chunk.children, "rgnh");
    const wlnk = findChunk(chunk.children, "wlnk");
    if (!rgnh || rgnh.size < 12 || !wlnk || wlnk.size < 12) return null;
    const keyRange = [clampByte(u16le(bytes, rgnh.offset)), clampByte(u16le(bytes, rgnh.offset + 2))];
    const velRange = [clampByte(u16le(bytes, rgnh.offset + 4)), clampByte(u16le(bytes, rgnh.offset + 6))];
    const tableIndex = u32le(bytes, wlnk.offset + 8);
    const sample = waveByPoolIndex[tableIndex];
    if (!sample || sample.invalid) return null;
    const regionWsmp = parseDlsWsmp(bytes, findChunk(chunk.children, "wsmp"));
    const baseWsmp = sample.dlsWsmp || null;
    const wsmp = regionWsmp || baseWsmp || { unityNote: sample.originalPitch ?? 60, fineTune: sample.pitchCorrection ?? 0, attenuation: 0, hasLoop: sample.sampleModes === 1, loopStart: sample.loopStartFrame || 0, loopEnd: sample.loopEndFrame || 0 };

    const regionSample = regionWsmp ? {
      ...sample,
      cacheKey: `${sample.cacheKey}:r:${wsmp.unityNote}:${wsmp.fineTune}:${wsmp.loopStart}:${wsmp.loopEnd}`,
      originalPitch: wsmp.unityNote,
      pitchCorrection: wsmp.fineTune,
      loopStartFrame: wsmp.loopStart,
      loopEndFrame: wsmp.loopEnd,
      sampleModes: wsmp.hasLoop ? 1 : 0
    } : sample;

    return {
      keyRange,
      velRange,
      initialAttenuation: dlsAttenuationToSfCentibels(wsmp.attenuation || 0),
      coarseTune: 0,
      fineTune: 0,
      sampleModes: wsmp.hasLoop ? 1 : 0,
      overridingRootKey: wsmp.unityNote,
      sample: regionSample,
      dlsTableIndex: tableIndex
    };
  }

  function parseDlsWsmp(bytes, chunk) {
    if (!chunk || chunk.size < 20) return null;
    const start = chunk.offset;
    const cbSize = Math.max(20, u32le(bytes, start));
    const unityNote = clampByte(u16le(bytes, start + 4));
    const fineTune = i16le(bytes, start + 6);
    const attenuation = i32le(bytes, start + 8);
    const options = u32le(bytes, start + 12);
    const loopCount = u32le(bytes, start + 16);
    let loopStart = 0;
    let loopEnd = 0;
    let hasLoop = false;
    let pos = start + Math.min(cbSize, chunk.size);
    const chunkEnd = chunk.offset + chunk.size;
    for (let i = 0; i < loopCount && pos + 16 <= chunkEnd; i++) {
      const loopSize = Math.max(16, u32le(bytes, pos));
      const loopType = u32le(bytes, pos + 4);
      const loopOffset = u32le(bytes, pos + 8);
      const loopLength = u32le(bytes, pos + 12);
      if (!hasLoop && loopType === 0 && loopLength > 1) {
        loopStart = loopOffset;
        loopEnd = loopOffset + loopLength;
        hasLoop = true;
      }
      pos += Math.min(loopSize, Math.max(16, chunkEnd - pos));
    }
    return { unityNote, fineTune, attenuation, options, hasLoop, loopStart, loopEnd };
  }

  function dlsAttenuationToSfCentibels(value) {
    // DLS stores gain/attenuation in 16.16 dB units. SF2 uses centibels (0.1 dB).
    // Positive gain is clamped because the existing player model only carries attenuation.
    const db = -(Number(value) || 0) / 65536;
    return Math.max(0, Math.round(db * 10));
  }

  function readWaveFormat(bytes, chunk) {
    if (!chunk || chunk.size < 16) return null;
    const p = chunk.offset;
    let formatTag = u16le(bytes, p);
    const channels = Math.max(1, u16le(bytes, p + 2));
    const sampleRate = u32le(bytes, p + 4);
    const blockAlign = u16le(bytes, p + 12);
    const bitsPerSample = u16le(bytes, p + 14);
    if (formatTag === 0xfffe && chunk.size >= 40) formatTag = u16le(bytes, p + 24);
    return { formatTag, channels, sampleRate, blockAlign, bitsPerSample };
  }

  function decodeWavePcm(bytes, dataChunk, format) {
    if (!format || ![1, 3].includes(format.formatTag)) return null;
    const channels = Math.max(1, format.channels || 1);
    const bits = format.bitsPerSample || 16;
    const bytesPerSample = Math.ceil(bits / 8);
    const frameSize = format.blockAlign || (channels * bytesPerSample);
    if (frameSize <= 0) return null;
    const frames = Math.floor(dataChunk.size / frameSize);
    if (frames <= 0) return { channelData: [new Float32Array(1)], sampleRate: format.sampleRate || 22050 };
    const out = Array.from({ length: channels }, () => new Float32Array(frames));
    const view = new DataView(bytes.buffer, bytes.byteOffset + dataChunk.offset, dataChunk.size);
    for (let frame = 0; frame < frames; frame++) {
      const base = frame * frameSize;
      for (let ch = 0; ch < channels; ch++) {
        const pos = base + ch * bytesPerSample;
        let value = 0;
        if (format.formatTag === 3 && bits === 32) value = view.getFloat32(pos, true);
        else if (format.formatTag === 3 && bits === 64) value = view.getFloat64(pos, true);
        else if (bits === 8) value = (view.getUint8(pos) - 128) / 128;
        else if (bits === 16) value = view.getInt16(pos, true) / 32768;
        else if (bits === 24) {
          let v = view.getUint8(pos) | (view.getUint8(pos + 1) << 8) | (view.getUint8(pos + 2) << 16);
          if (v & 0x800000) v |= 0xff000000;
          value = v / 8388608;
        } else if (bits === 32) value = view.getInt32(pos, true) / 2147483648;
        else return null;
        out[ch][frame] = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
      }
    }
    return { channelData: out, sampleRate: format.sampleRate || 22050 };
  }

  function buildWaveFileBytes(bytes, fmt, data) {
    const fmtSize = fmt.size;
    const dataSize = data.size;
    const total = 12 + 8 + fmtSize + (fmtSize & 1) + 8 + dataSize + (dataSize & 1);
    const out = new Uint8Array(total);
    writeAscii(out, 0, "RIFF");
    writeU32le(out, 4, total - 8);
    writeAscii(out, 8, "WAVE");
    let pos = 12;
    writeAscii(out, pos, "fmt ");
    writeU32le(out, pos + 4, fmtSize);
    out.set(bytes.subarray(fmt.offset, fmt.offset + fmtSize), pos + 8);
    pos += 8 + fmtSize + (fmtSize & 1);
    writeAscii(out, pos, "data");
    writeU32le(out, pos + 4, dataSize);
    out.set(bytes.subarray(data.offset, data.offset + dataSize), pos + 8);
    return out;
  }

  function createAudioDecoder(options = {}) {
    if (typeof options.decodeAudio === "function") {
      return {
        decode: async encoded => normalizeDecodedAudio(await options.decodeAudio(encoded)),
        close: async () => {}
      };
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    let ctx = null;
    try {
      // Prefer the regular AudioContext. Some browser builds have stricter or
      // less reliable compressed-audio decoding on OfflineAudioContext.
      if (Audio) ctx = new Audio();
      else if (Offline) ctx = new Offline(1, 1, 44100);
    } catch (_) {
      ctx = null;
    }
    if (!ctx?.decodeAudioData) return null;
    return {
      decode: async encoded => {
        const source = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded || 0);
        const copy = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
        const audio = await ctx.decodeAudioData(copy);
        return normalizeDecodedAudio(audio);
      },
      close: async () => {
        if (typeof ctx.close === "function") {
          try { await ctx.close(); } catch (_) {}
        }
      }
    };
  }

  function normalizeDecodedAudio(audio) {
    if (!audio) return null;
    if (Array.isArray(audio.channelData)) {
      return {
        channelData: audio.channelData.map(ch => ch instanceof Float32Array ? ch : new Float32Array(ch || 0)),
        sampleRate: Number(audio.sampleRate) || 44100
      };
    }
    const count = Math.max(1, Number(audio.numberOfChannels) || 1);
    const channels = [];
    for (let i = 0; i < count; i++) channels.push(new Float32Array(audio.getChannelData(i)));
    return { channelData: channels, sampleRate: Number(audio.sampleRate) || 44100 };
  }

  async function mapWithConcurrency(items, concurrency, fn) {
    const list = Array.from(items || []);
    const result = new Array(list.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency || 1, list.length || 1)) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= list.length) return;
        result[index] = await fn(list[index], index);
      }
    });
    await Promise.all(workers);
    return result;
  }

  function readInfoName(bytes, chunks) {
    const info = findList(chunks, "INFO");
    const inam = info ? findChunk(info.children, "INAM") || findChunk(info.children, "inam") : null;
    if (!inam) return "";
    return readText(bytes, inam.offset, inam.size).trim();
  }

  function readText(bytes, p, n) {
    let s = "";
    const end = Math.min(bytes.length, p + n);
    for (let i = p; i < end; i++) {
      const b = bytes[i];
      if (!b) break;
      s += String.fromCharCode(b);
    }
    return s;
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
        id: n.id ?? i,
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
    const destinationsByPart = Array.isArray(options.destinationsByPart) ? options.destinationsByPart : null;
    const activeSources = options.activeSources || null;
    const scheduledIds = options.scheduledIds || null;
    const minLeadTime = Math.max(0.005, Number(options.minLeadTime) || 0.015);
    const playbackSpeed = Math.max(0.05, Number(options.playbackSpeed) || 1);
    const gainScale = Number.isFinite(Number(options.gainScale)) ? Math.max(0.02, Math.min(2, Number(options.gainScale))) : 1;
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
      const loopStartFrame = Math.max(0, Number(sample.loopStartFrame) || 0);
      const loopEndFrame = Math.min(Number(sample.frameLength) || n.buffer.length, Math.max(loopStartFrame, Number(sample.loopEndFrame) || 0));
      if ((region.sampleModes & 1) && loopEndFrame > loopStartFrame + 1) {
        source.loop = true;
        source.loopStart = loopStartFrame / sample.sampleRate;
        source.loopEnd = Math.max(source.loopStart + 0.001, loopEndFrame / sample.sampleRate);
      }

      const gain = ctx.createGain();
      const v = Math.max(0.0001, Math.min(1.25, n.gainValue * gainScale));
      const attack = Math.min(0.008, playDur * 0.25);
      const release = Math.min(0.04, Math.max(0.004, playDur * 0.55));
      const holdEnd = Math.max(start + attack, end - release);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(v, start + attack);
      gain.gain.setValueAtTime(v, holdEnd);
      gain.gain.linearRampToValueAtTime(0.0001, end + release);

      const partIndex = Number.isFinite(Number(n.part)) ? Math.max(0, Math.min(5, Math.trunc(Number(n.part)))) : -1;
      const noteOutput = partIndex >= 0 && destinationsByPart?.[partIndex] ? destinationsByPart[partIndex] : output;
      source.connect(gain).connect(noteOutput);
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
    const hardEnd = Math.min(end, bytes.length);
    while (pos + 8 <= hardEnd) {
      const id = ascii(bytes, pos, 4);
      const size = u32le(bytes, pos + 4);
      const data = pos + 8;
      const chunkEnd = Math.min(hardEnd, data + size);
      if (id === "LIST" && size >= 4 && data + 4 <= hardEnd) {
        chunks.push({ id, type: ascii(bytes, data, 4), start: pos, offset: data + 4, size: Math.max(0, size - 4), children: parseRiff(bytes, data + 4, chunkEnd) });
      } else {
        chunks.push({ id, start: pos, offset: data, size: Math.max(0, chunkEnd - data) });
      }
      let next = data + size;
      if ((size & 1) && next < hardEnd) {
        // Normal RIFF chunks are word-aligned, but SF3 explicitly permits an odd-sized
        // SMPL stream (and therefore an odd-sized surrounding LIST) without padding.
        // Prefer the unpadded boundary when it already looks like a valid chunk header.
        const unpaddedHeader = looksLikeRiffChunkHeader(bytes, next, hardEnd);
        const paddedHeader = looksLikeRiffChunkHeader(bytes, next + 1, hardEnd);
        if (!unpaddedHeader && paddedHeader) next += 1;
        else if (!unpaddedHeader && !paddedHeader) next += 1;
      }
      if (next <= pos) break;
      pos = Math.min(next, hardEnd);
    }
    return chunks;
  }
  function looksLikeRiffChunkHeader(bytes, pos, end) {
    if (pos + 8 > Math.min(end, bytes.length)) return false;
    for (let i = 0; i < 4; i++) {
      const c = bytes[pos + i];
      if (c < 0x20 || c > 0x7e) return false;
    }
    const size = u32le(bytes, pos + 4);
    return pos + 8 + size <= Math.min(end, bytes.length);
  }
  function findList(chunks, type) { return (chunks || []).find(c => c.id === "LIST" && c.type === type); }
  function findChunk(chunks, id) { return (chunks || []).find(c => c.id === id); }

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
  function readRecords(bytes, chunk, size, fn) { if (!chunk) throw new Error(tr("sf2.err_table", [size])); const out = []; for (let p = chunk.offset; p + size <= chunk.offset + chunk.size; p += size) out.push(fn(bytes, p)); return out; }
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
  function u16le(b,p){ return (b[p] || 0) | ((b[p+1] || 0) << 8); }
  function i16le(b,p){ const v = u16le(b,p); return v & 0x8000 ? v - 0x10000 : v; }
  function u32le(b,p){ return ((b[p] || 0) | ((b[p+1] || 0) << 8) | ((b[p+2] || 0) << 16) | ((b[p+3] || 0) << 24)) >>> 0; }
  function i32le(b,p){ const v = u32le(b,p); return v > 0x7fffffff ? v - 0x100000000 : v; }
  function i8(v){ return v & 0x80 ? v - 0x100 : v; }
  function clampByte(v){ return Math.max(0, Math.min(127, Number(v) || 0)); }
  function writeAscii(bytes, p, text) { for (let i = 0; i < text.length; i++) bytes[p + i] = text.charCodeAt(i) & 0xff; }
  function writeU32le(bytes, p, value) { const v = Number(value) >>> 0; bytes[p] = v & 0xff; bytes[p+1] = (v >>> 8) & 0xff; bytes[p+2] = (v >>> 16) & 0xff; bytes[p+3] = (v >>> 24) & 0xff; }

  window.MabiSf2 = { parseSoundBank, parseSoundFont, prepareNotes, schedulePreparedNotes };
})();
