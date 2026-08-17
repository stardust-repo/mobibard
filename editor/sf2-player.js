(() => {
  "use strict";

  const GENERATOR = Object.freeze({
    START_ADDRS_OFFSET: 0,
    END_ADDRS_OFFSET: 1,
    START_LOOP_ADDRS_OFFSET: 2,
    END_LOOP_ADDRS_OFFSET: 3,
    START_ADDRS_COARSE_OFFSET: 4,
    PAN: 17,
    ATTACK_VOL_ENV: 34,
    DECAY_VOL_ENV: 36,
    SUSTAIN_VOL_ENV: 37,
    RELEASE_VOL_ENV: 38,
    INSTRUMENT: 41,
    KEY_RANGE: 43,
    VEL_RANGE: 44,
    INITIAL_ATTENUATION: 48,
    END_ADDRS_COARSE_OFFSET: 12,
    COARSE_TUNE: 51,
    FINE_TUNE: 52,
    SAMPLE_ID: 53,
    SAMPLE_MODES: 54,
    SCALE_TUNING: 56,
    OVERRIDING_ROOT_KEY: 58,
    START_LOOP_ADDRS_COARSE_OFFSET: 45,
    END_LOOP_ADDRS_COARSE_OFFSET: 50,
  });

  const DEFAULT_RANGE = Object.freeze({ low: 0, high: 127 });
  const decoder = new TextDecoder("latin1");

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readFourCC(view, offset) {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  }

  function readFixedString(bytes, offset, length) {
    const end = offset + length;
    let actualEnd = offset;
    while (actualEnd < end && bytes[actualEnd] !== 0) {
      actualEnd += 1;
    }
    return decoder.decode(bytes.subarray(offset, actualEnd)).trim();
  }

  function signed16(value) {
    return value > 0x7fff ? value - 0x10000 : value;
  }

  function timecentsToSeconds(value, fallback) {
    if (value == null || value <= -32768) {
      return fallback;
    }
    return clamp(2 ** (value / 1200), 0.003, 12);
  }

  function parseRange(amount) {
    return {
      low: amount & 0xff,
      high: (amount >> 8) & 0xff,
    };
  }

  function mergeRanges(left, right) {
    const a = left || DEFAULT_RANGE;
    const b = right || DEFAULT_RANGE;
    return {
      low: Math.max(a.low, b.low),
      high: Math.min(a.high, b.high),
    };
  }

  function parseChunks(view, start, end) {
    const chunks = [];
    let offset = start;
    while (offset + 8 <= end) {
      const id = readFourCC(view, offset);
      const size = view.getUint32(offset + 4, true);
      const dataOffset = offset + 8;
      if (dataOffset + size > view.byteLength) {
        throw new Error(`손상된 SF2 청크입니다: ${id}`);
      }
      chunks.push({ id, size, dataOffset });
      offset = dataOffset + size + (size & 1);
    }
    return chunks;
  }

  async function decodeBase64ToBytes(base64, onProgress) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < binary.length; offset += chunkSize) {
      const end = Math.min(binary.length, offset + chunkSize);
      for (let index = offset; index < end; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      onProgress?.(end / binary.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return bytes;
  }

  function parseGeneratorRecords(view, chunk) {
    const records = [];
    const count = Math.floor(chunk.size / 4);
    for (let index = 0; index < count; index += 1) {
      const offset = chunk.dataOffset + index * 4;
      records.push({
        operator: view.getUint16(offset, true),
        amount: view.getUint16(offset + 2, true),
      });
    }
    return records;
  }

  function generatorsToMap(records, start, end) {
    const map = new Map();
    for (let index = start; index < end; index += 1) {
      const record = records[index];
      map.set(record.operator, record.amount);
    }
    return map;
  }

  function mergeGeneratorMaps(...maps) {
    const result = new Map();
    for (const map of maps) {
      if (!map) {
        continue;
      }
      for (const [operator, amount] of map) {
        result.set(operator, amount);
      }
    }
    return result;
  }

  function parseSf2(bytes, presetNumber = 0, bankNumber = 0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (readFourCC(view, 0) !== "RIFF" || readFourCC(view, 8) !== "sfbk") {
      throw new Error("지원하지 않는 SoundFont 파일입니다.");
    }

    const riffEnd = Math.min(view.byteLength, 8 + view.getUint32(4, true));
    const topChunks = parseChunks(view, 12, riffEnd);
    const lists = new Map();
    for (const chunk of topChunks) {
      if (chunk.id !== "LIST" || chunk.size < 4) {
        continue;
      }
      const type = readFourCC(view, chunk.dataOffset);
      lists.set(type, {
        dataOffset: chunk.dataOffset + 4,
        size: chunk.size - 4,
      });
    }

    const sdta = lists.get("sdta");
    const pdta = lists.get("pdta");
    if (!sdta || !pdta) {
      throw new Error("SF2 내부 데이터가 없습니다.");
    }

    const sdtaChunks = parseChunks(view, sdta.dataOffset, sdta.dataOffset + sdta.size);
    const smplChunk = sdtaChunks.find((chunk) => chunk.id === "smpl");
    if (!smplChunk) {
      throw new Error("SF2 샘플 데이터가 없습니다.");
    }

    const pdtaChunks = parseChunks(view, pdta.dataOffset, pdta.dataOffset + pdta.size);
    const chunkMap = new Map(pdtaChunks.map((chunk) => [chunk.id, chunk]));
    const required = ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr"];
    for (const id of required) {
      if (!chunkMap.has(id)) {
        throw new Error(`SF2 ${id} 테이블이 없습니다.`);
      }
    }

    const phdrChunk = chunkMap.get("phdr");
    const presetHeaders = [];
    for (let offset = phdrChunk.dataOffset; offset + 38 <= phdrChunk.dataOffset + phdrChunk.size; offset += 38) {
      presetHeaders.push({
        name: readFixedString(bytes, offset, 20),
        preset: view.getUint16(offset + 20, true),
        bank: view.getUint16(offset + 22, true),
        bagIndex: view.getUint16(offset + 24, true),
      });
    }

    const pbagChunk = chunkMap.get("pbag");
    const presetBags = [];
    for (let offset = pbagChunk.dataOffset; offset + 4 <= pbagChunk.dataOffset + pbagChunk.size; offset += 4) {
      presetBags.push({
        generatorIndex: view.getUint16(offset, true),
        modulatorIndex: view.getUint16(offset + 2, true),
      });
    }
    const presetGenerators = parseGeneratorRecords(view, chunkMap.get("pgen"));

    const instChunk = chunkMap.get("inst");
    const instruments = [];
    for (let offset = instChunk.dataOffset; offset + 22 <= instChunk.dataOffset + instChunk.size; offset += 22) {
      instruments.push({
        name: readFixedString(bytes, offset, 20),
        bagIndex: view.getUint16(offset + 20, true),
      });
    }

    const ibagChunk = chunkMap.get("ibag");
    const instrumentBags = [];
    for (let offset = ibagChunk.dataOffset; offset + 4 <= ibagChunk.dataOffset + ibagChunk.size; offset += 4) {
      instrumentBags.push({
        generatorIndex: view.getUint16(offset, true),
        modulatorIndex: view.getUint16(offset + 2, true),
      });
    }
    const instrumentGenerators = parseGeneratorRecords(view, chunkMap.get("igen"));

    const shdrChunk = chunkMap.get("shdr");
    const sampleHeaders = [];
    for (let offset = shdrChunk.dataOffset; offset + 46 <= shdrChunk.dataOffset + shdrChunk.size; offset += 46) {
      sampleHeaders.push({
        name: readFixedString(bytes, offset, 20),
        start: view.getUint32(offset + 20, true),
        end: view.getUint32(offset + 24, true),
        loopStart: view.getUint32(offset + 28, true),
        loopEnd: view.getUint32(offset + 32, true),
        sampleRate: view.getUint32(offset + 36, true),
        originalPitch: view.getUint8(offset + 40),
        pitchCorrection: view.getInt8(offset + 41),
        sampleLink: view.getUint16(offset + 42, true),
        sampleType: view.getUint16(offset + 44, true),
      });
    }

    let presetIndex = presetHeaders.findIndex(
      (preset) => preset.preset === presetNumber && preset.bank === bankNumber && preset.name !== "EOP",
    );
    if (presetIndex < 0) {
      presetIndex = presetHeaders.findIndex((preset) => preset.name !== "EOP");
    }
    if (presetIndex < 0 || !presetHeaders[presetIndex + 1]) {
      throw new Error("재생 가능한 SF2 프리셋이 없습니다.");
    }

    const preset = presetHeaders[presetIndex];
    const nextPreset = presetHeaders[presetIndex + 1];
    let presetGlobal = new Map();
    const presetZones = [];

    for (let bagIndex = preset.bagIndex; bagIndex < nextPreset.bagIndex; bagIndex += 1) {
      const nextBag = presetBags[bagIndex + 1];
      if (!nextBag) {
        break;
      }
      const generators = generatorsToMap(
        presetGenerators,
        presetBags[bagIndex].generatorIndex,
        nextBag.generatorIndex,
      );
      if (generators.has(GENERATOR.INSTRUMENT)) {
        presetZones.push(generators);
      } else {
        presetGlobal = mergeGeneratorMaps(presetGlobal, generators);
      }
    }

    const zones = [];
    for (const presetZone of presetZones) {
      const instrumentIndex = presetZone.get(GENERATOR.INSTRUMENT);
      const instrument = instruments[instrumentIndex];
      const nextInstrument = instruments[instrumentIndex + 1];
      if (!instrument || !nextInstrument) {
        continue;
      }

      let instrumentGlobal = new Map();
      const localZones = [];
      for (let bagIndex = instrument.bagIndex; bagIndex < nextInstrument.bagIndex; bagIndex += 1) {
        const nextBag = instrumentBags[bagIndex + 1];
        if (!nextBag) {
          break;
        }
        const generators = generatorsToMap(
          instrumentGenerators,
          instrumentBags[bagIndex].generatorIndex,
          nextBag.generatorIndex,
        );
        if (generators.has(GENERATOR.SAMPLE_ID)) {
          localZones.push(generators);
        } else {
          instrumentGlobal = mergeGeneratorMaps(instrumentGlobal, generators);
        }
      }

      for (const localZone of localZones) {
        const generators = mergeGeneratorMaps(presetGlobal, presetZone, instrumentGlobal, localZone);
        const sampleId = generators.get(GENERATOR.SAMPLE_ID);
        const sample = sampleHeaders[sampleId];
        if (!sample || sample.name === "EOS") {
          continue;
        }

        const presetKeyRange = presetZone.has(GENERATOR.KEY_RANGE)
          ? parseRange(presetZone.get(GENERATOR.KEY_RANGE))
          : DEFAULT_RANGE;
        const instrumentKeyRange = localZone.has(GENERATOR.KEY_RANGE)
          ? parseRange(localZone.get(GENERATOR.KEY_RANGE))
          : DEFAULT_RANGE;
        const keyRange = mergeRanges(presetKeyRange, instrumentKeyRange);
        const presetVelRange = presetZone.has(GENERATOR.VEL_RANGE)
          ? parseRange(presetZone.get(GENERATOR.VEL_RANGE))
          : DEFAULT_RANGE;
        const instrumentVelRange = localZone.has(GENERATOR.VEL_RANGE)
          ? parseRange(localZone.get(GENERATOR.VEL_RANGE))
          : DEFAULT_RANGE;
        const velocityRange = mergeRanges(presetVelRange, instrumentVelRange);

        const coarse = (operator) => signed16(generators.get(operator) || 0) * 32768;
        const fine = (operator) => signed16(generators.get(operator) || 0);
        const start = clamp(
          sample.start + fine(GENERATOR.START_ADDRS_OFFSET) + coarse(GENERATOR.START_ADDRS_COARSE_OFFSET),
          0,
          smplChunk.size / 2,
        );
        const end = clamp(
          sample.end + fine(GENERATOR.END_ADDRS_OFFSET) + coarse(GENERATOR.END_ADDRS_COARSE_OFFSET),
          start + 1,
          smplChunk.size / 2,
        );
        const loopStart = clamp(
          sample.loopStart + fine(GENERATOR.START_LOOP_ADDRS_OFFSET) + coarse(GENERATOR.START_LOOP_ADDRS_COARSE_OFFSET),
          start,
          end,
        );
        const loopEnd = clamp(
          sample.loopEnd + fine(GENERATOR.END_LOOP_ADDRS_OFFSET) + coarse(GENERATOR.END_LOOP_ADDRS_COARSE_OFFSET),
          loopStart,
          end,
        );

        const rootKeyAmount = generators.get(GENERATOR.OVERRIDING_ROOT_KEY);
        const rootKey = rootKeyAmount != null && rootKeyAmount <= 127
          ? rootKeyAmount
          : sample.originalPitch;
        const coarseTune = signed16(generators.get(GENERATOR.COARSE_TUNE) || 0);
        const fineTune = signed16(generators.get(GENERATOR.FINE_TUNE) || 0);
        const scaleTuning = signed16(generators.get(GENERATOR.SCALE_TUNING) ?? 100);
        const panAmount = signed16(generators.get(GENERATOR.PAN) || 0);
        const attenuation = Math.max(0, signed16(generators.get(GENERATOR.INITIAL_ATTENUATION) || 0));
        const sampleModes = generators.get(GENERATOR.SAMPLE_MODES) || 0;

        zones.push({
          instrumentName: instrument.name,
          sampleId,
          sampleName: sample.name,
          start,
          end,
          loopStart,
          loopEnd,
          sampleRate: sample.sampleRate || 44100,
          rootKey,
          pitchCorrection: sample.pitchCorrection || 0,
          coarseTune,
          fineTune,
          scaleTuning: scaleTuning || 100,
          keyRange,
          velocityRange,
          pan: clamp(panAmount / 500, -1, 1),
          gain: 10 ** (-attenuation / 200),
          attack: timecentsToSeconds(signed16(generators.get(GENERATOR.ATTACK_VOL_ENV) ?? -32768), 0.006),
          decay: timecentsToSeconds(signed16(generators.get(GENERATOR.DECAY_VOL_ENV) ?? -32768), 1.2),
          sustainAttenuation: Math.max(0, signed16(generators.get(GENERATOR.SUSTAIN_VOL_ENV) || 0)),
          release: timecentsToSeconds(signed16(generators.get(GENERATOR.RELEASE_VOL_ENV) ?? -1200), 0.4),
          loop: (sampleModes & 1) !== 0 && loopEnd - loopStart > 8,
        });
      }
    }

    if (!zones.length) {
      throw new Error("선택한 SF2 프리셋에 샘플 영역이 없습니다.");
    }

    return {
      bytes,
      sampleData: new Int16Array(bytes.buffer, bytes.byteOffset + smplChunk.dataOffset, Math.floor(smplChunk.size / 2)),
      sampleHeaders,
      presetName: preset.name || `Preset ${presetNumber}`,
      bank: preset.bank,
      preset: preset.preset,
      zones,
    };
  }

  function normalizeSharedRange(value) {
    const source = Array.isArray(value) ? value : [0, 127];
    const rawLow = Number(source[0]);
    const rawHigh = Number(source[1]);
    const low = clamp(Math.round(Number.isFinite(rawLow) ? rawLow : 0), 0, 127);
    const high = clamp(Math.round(Number.isFinite(rawHigh) ? rawHigh : 127), low, 127);
    return { low, high };
  }

  function selectSharedPreset(soundBank, program = 0, bank = 0) {
    const presets = Array.isArray(soundBank?.presets) ? soundBank.presets : [];
    if (!presets.length) return null;
    const safeProgram = clamp(Math.round(Number(program) || 0), 0, 127);
    const safeBank = clamp(Math.round(Number(bank) || 0), 0, 16383);
    return presets.find((preset) => Number(preset?.preset) === safeProgram && Number(preset?.bank) === safeBank)
      || presets.find((preset) => Number(preset?.preset) === safeProgram && Number(preset?.bank) === 0)
      || presets.find((preset) => Number(preset?.preset) === safeProgram)
      || presets.find((preset) => Number(preset?.preset) === 0 && Number(preset?.bank) === 0)
      || presets[0]
      || null;
  }

  function adaptSharedPreset(soundBank, preset) {
    if (!soundBank || !preset) {
      throw new Error("재생 가능한 SF3 프리셋이 없습니다.");
    }
    const zones = (Array.isArray(preset.regions) ? preset.regions : []).map((region, index) => {
      const sample = region?.sample;
      if (!sample || sample.invalid) return null;
      const channelLength = Array.isArray(sample.channelData) && sample.channelData[0]
        ? sample.channelData[0].length
        : 0;
      const frameLength = Math.max(
        1,
        Math.round(Number(sample.frameLength) || channelLength || ((Number(sample.end) || 0) - (Number(sample.start) || 0)) || 1),
      );
      const sampleRate = Math.max(8000, Number(sample.decodedSampleRate || sample.sampleRate) || 44100);
      const loopStart = clamp(Math.round(Number(sample.loopStartFrame) || 0), 0, frameLength);
      const loopEnd = clamp(Math.round(Number(sample.loopEndFrame) || 0), loopStart, frameLength);
      const sampleId = String(sample.cacheKey || `shared:${preset.bank}:${preset.preset}:${sample.name || index}:${index}`);
      const attenuation = Math.max(0, Number(region.initialAttenuation) || 0);
      return {
        instrumentName: preset.name || `Preset ${preset.preset}`,
        sampleId,
        sampleName: sample.name || `Sample ${index + 1}`,
        sample,
        soundBank,
        start: 0,
        end: frameLength,
        loopStart,
        loopEnd,
        sampleRate,
        rootKey: clamp(Math.round(Number(region.overridingRootKey ?? sample.originalPitch ?? 60)), 0, 127),
        // createSf2Voice subtracts this value. Negating keeps the shared player sampler's
        // pitch-correction direction so editor/player/simple sound the same.
        pitchCorrection: -(Number(sample.pitchCorrection) || 0),
        coarseTune: Number(region.coarseTune) || 0,
        fineTune: Number(region.fineTune) || 0,
        scaleTuning: 100,
        keyRange: normalizeSharedRange(region.keyRange),
        velocityRange: normalizeSharedRange(region.velRange),
        pan: 0,
        gain: 10 ** (-attenuation / 200),
        attack: 0.006,
        decay: 1.2,
        sustainAttenuation: 0,
        release: 0.4,
        loop: ((Number(region.sampleModes) || 0) & 1) !== 0 && loopEnd - loopStart > 8,
      };
    }).filter(Boolean);

    if (!zones.length) {
      throw new Error("선택한 SF3 프리셋에 샘플 영역이 없습니다.");
    }

    return {
      soundBank,
      presetName: preset.name || `Preset ${preset.preset}`,
      bank: Number(preset.bank) || 0,
      preset: Number(preset.preset) || 0,
      zones,
    };
  }

  class MabinogiSf2Player {
    constructor(options = {}) {
      this.presetNumber = options.presetNumber ?? 0;
      this.bankNumber = options.bankNumber ?? 0;
      this.onStatus = typeof options.onStatus === "function" ? options.onStatus : null;
      this.context = null;
      this.masterGain = null;
      this.compressor = null;
      this.soundBank = null;
      this.soundFont = null;
      this.soundFonts = new Map();
      this.preparePromise = null;
      this.bufferCache = new Map();
      this.zoneCache = new Map();
      this.zoneOutputCache = new Map();
      this.voices = new Set();
      this.volume = clamp(Number(options.volume ?? 1), 0, 1.5);
      const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      this.maxVoices = Math.max(24, Number(options.maxVoices) || (coarsePointer ? 56 : 96));
      this.mode = "loading";
    }

    emitStatus(label, mode = this.mode) {
      this.mode = mode;
      this.onStatus?.({ label, mode });
    }

    ensureContext() {
      if (this.context) {
        return this.context;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("이 브라우저는 Web Audio를 지원하지 않습니다.");
      }
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.2;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      return this.context;
    }

    async resume() {
      const context = this.ensureContext();
      if (context.state !== "running") {
        await context.resume();
      }
      return context;
    }

    setVolume(value, when = null) {
      this.volume = clamp(Number(value) || 0, 0, 1.5);
      if (!this.masterGain || !this.context) {
        return this.volume;
      }
      const at = when == null ? this.context.currentTime : Math.max(this.context.currentTime, Number(when) || 0);
      const parameter = this.masterGain.gain;
      if (typeof parameter.cancelAndHoldAtTime === "function") {
        parameter.cancelAndHoldAtTime(at);
      } else {
        parameter.cancelScheduledValues(at);
        parameter.setValueAtTime(parameter.value, at);
      }
      parameter.linearRampToValueAtTime(this.volume, at + 0.018);
      return this.volume;
    }

    prepare() {
      if (this.soundFont || this.mode === "fallback") {
        return Promise.resolve(this.soundFont);
      }
      if (this.preparePromise) {
        return this.preparePromise;
      }

      this.preparePromise = (async () => {
        const base64 = String(window.MOBIBARD_DEFAULT_SF3_BASE64 || "").replace(/\s+/g, "");
        if (!base64 || !window.MabiSf2?.parseSoundBank) {
          this.emitStatus("기본 신시사이저", "fallback");
          return null;
        }

        try {
          this.emitStatus("SC-55 SF3 음원 준비 0%", "loading");
          const bytes = await decodeBase64ToBytes(base64, (progress) => {
            const percent = Math.min(99, Math.round(progress * 100));
            this.emitStatus(`SC-55 SF3 음원 준비 ${percent}%`, "loading");
          });
          this.soundBank = await window.MabiSf2.parseSoundBank(bytes);
          const preset = selectSharedPreset(this.soundBank, this.presetNumber, this.bankNumber);
          this.soundFont = adaptSharedPreset(this.soundBank, preset);
          this.soundFonts.set(`${this.soundFont.bank}:${this.soundFont.preset}`, this.soundFont);
          this.soundFonts.set(`${this.bankNumber}:${this.presetNumber}`, this.soundFont);
          try { window.MOBIBARD_DEFAULT_SF3_BASE64 = ""; } catch {}
          this.emitStatus(`SC-55 SF3 · ${this.soundFont.presetName}`, "ready");
          return this.soundFont;
        } catch (error) {
          console.error("SoundFont initialization failed", error);
          this.soundBank = null;
          this.soundFont = null;
          this.emitStatus("기본 신시사이저", "fallback");
          return null;
        }
      })();
      return this.preparePromise;
    }

    async ensureReady() {
      await this.resume();
      await this.prepare();
      return this;
    }

    getSoundFont(program = this.presetNumber, bank = this.bankNumber) {
      if (!this.soundBank || !this.soundFont) return null;
      const safeProgram = clamp(Math.round(Number(program) || 0), 0, 127);
      const safeBank = clamp(Math.round(Number(bank) || 0), 0, 16383);
      const key = `${safeBank}:${safeProgram}`;
      if (this.soundFonts.has(key)) return this.soundFonts.get(key);
      try {
        const preset = selectSharedPreset(this.soundBank, safeProgram, safeBank);
        const parsed = adaptSharedPreset(this.soundBank, preset);
        this.soundFonts.set(`${parsed.bank}:${parsed.preset}`, parsed);
        this.soundFonts.set(key, parsed);
        return parsed;
      } catch {
        return this.soundFont;
      }
    }

    async prepareProgram(program = 0, bank = 0) {
      await this.ensureReady();
      const parsed = this.getSoundFont(program, bank);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return parsed;
    }

    findZone(midi, velocity, program = this.presetNumber, bank = this.bankNumber) {
      const soundFont = this.getSoundFont(program, bank);
      if (!soundFont) return null;
      const cacheKey = `${soundFont.bank}:${soundFont.preset}:${Math.round(midi)}:${Math.floor(clamp(velocity, 0, 127) / 16)}`;
      if (this.zoneCache.has(cacheKey)) {
        return this.zoneCache.get(cacheKey);
      }
      let matched = null;
      for (const zone of soundFont.zones) {
        if (
          midi >= zone.keyRange.low &&
          midi <= zone.keyRange.high &&
          velocity >= zone.velocityRange.low &&
          velocity <= zone.velocityRange.high
        ) {
          matched = zone;
          break;
        }
      }
      if (!matched) {
        let bestDistance = Infinity;
        for (const zone of soundFont.zones) {
          const center = (zone.keyRange.low + zone.keyRange.high) / 2;
          const distance = Math.abs(midi - center);
          if (distance < bestDistance) {
            bestDistance = distance;
            matched = zone;
          }
        }
      }
      this.zoneCache.set(cacheKey, matched);
      return matched;
    }

    async preloadPitches(notesOrPitches = []) {
      if (!this.soundFont || !Array.isArray(notesOrPitches) || !notesOrPitches.length) {
        return 0;
      }
      const zones = new Map();
      for (const item of notesOrPitches) {
        const pitch = typeof item === "number" ? item : Number(item?.pitch);
        const velocity = typeof item === "number" ? 100 : clamp(Number(item?.velocity) || 100, 1, 127);
        const program = typeof item === "number" ? this.presetNumber : clamp(Number(item?.instrumentProgram) || 0, 0, 127);
        const bank = typeof item === "number" ? this.bankNumber : clamp(Number(item?.instrumentBank) || 0, 0, 16383);
        if (!Number.isFinite(pitch)) continue;
        const soundFont = this.getSoundFont(program, bank);
        const zone = this.findZone(pitch, velocity, program, bank);
        if (zone) zones.set(`${soundFont?.bank || 0}:${soundFont?.preset || program}:${zone.sampleId}`, zone);
      }
      const pending = [...zones.values()].filter((zone) => !this.bufferCache.has(zone.sampleId));
      for (let index = 0; index < pending.length; index += 1) {
        this.getSampleBuffer(pending[index]);
        if ((index + 1) % 2 === 0 && index + 1 < pending.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      return pending.length;
    }

    getZoneOutput(zone) {
      if (!this.masterGain) this.ensureContext();
      if (Math.abs(zone.pan) <= 0.01 || typeof this.context.createStereoPanner !== "function") {
        return this.masterGain;
      }
      const key = `${zone.sampleId}:${Math.round(zone.pan * 1000)}`;
      let output = this.zoneOutputCache.get(key);
      if (!output) {
        output = this.context.createStereoPanner();
        output.pan.value = zone.pan;
        output.connect(this.masterGain);
        this.zoneOutputCache.set(key, output);
      }
      return output;
    }

    enforceVoiceLimit(atTime = null) {
      if (this.voices.size < this.maxVoices) {
        return;
      }
      const context = this.ensureContext();
      const releaseAt = atTime == null ? context.currentTime : Math.max(context.currentTime, atTime);
      const candidates = [...this.voices]
        .filter((voice) => !voice.ended)
        .sort((left, right) => (left.startedAt || 0) - (right.startedAt || 0));
      const removeCount = Math.max(1, candidates.length - this.maxVoices + 1);
      for (let index = 0; index < removeCount; index += 1) {
        candidates[index]?.release(releaseAt, 0.025);
      }
    }

    getSampleBuffer(zone) {
      const cached = this.bufferCache.get(zone.sampleId);
      if (cached) {
        return cached;
      }
      const context = this.ensureContext();
      const soundBank = zone.soundBank || this.soundBank;
      if (!soundBank?.getBufferForSample || !zone.sample) {
        throw new Error("SF3 샘플 버퍼를 만들 수 없습니다.");
      }
      const buffer = soundBank.getBufferForSample(context, zone.sample);
      this.bufferCache.set(zone.sampleId, buffer);
      return buffer;
    }

    createSf2Voice(midi, velocity, when, duration, program = this.presetNumber, bank = this.bankNumber, gainScale = 1) {
      const context = this.ensureContext();
      const safeGainScale = Number.isFinite(Number(gainScale))
        ? clamp(Number(gainScale), 0, 1.5)
        : 1;
      const zone = this.findZone(midi, velocity, program, bank);
      if (!zone) {
        return this.createFallbackVoice(midi, velocity, when, duration, safeGainScale);
      }

      this.enforceVoiceLimit(when);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const outputNode = this.getZoneOutput(zone);
      const buffer = this.getSampleBuffer(zone);
      const centsFromRoot = (midi - zone.rootKey) * zone.scaleTuning - zone.pitchCorrection + zone.coarseTune * 100 + zone.fineTune;
      const peak = clamp((velocity / 127) ** 1.5 * zone.gain * 0.9 * safeGainScale, 0.0001, 1.2);
      const sustain = peak * 10 ** (-zone.sustainAttenuation / 200);
      const attack = clamp(zone.attack, 0.003, 0.25);
      const decay = clamp(zone.decay, 0.03, 8);
      const release = clamp(zone.release, 0.06, 3.5);

      source.buffer = buffer;
      source.playbackRate.value = 2 ** (centsFromRoot / 1200);
      if (zone.loop) {
        source.loop = true;
        source.loopStart = Math.max(0, (zone.loopStart - zone.start) / zone.sampleRate);
        source.loopEnd = Math.max(source.loopStart + 0.001, (zone.loopEnd - zone.start) / zone.sampleRate);
      }

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), when + attack + decay);
      source.connect(gain);
      gain.connect(outputNode);

      const voice = {
        source,
        gain,
        ended: false,
        releaseAt: Infinity,
        startedAt: when,
        release: (time = context.currentTime, releaseOverride = release) => {
          if (voice.ended) {
            return;
          }
          const releaseAt = Math.max(context.currentTime, time);
          if (releaseAt >= voice.releaseAt) {
            return;
          }
          voice.releaseAt = releaseAt;
          const releaseSeconds = clamp(releaseOverride, 0.025, 3.5);
          if (typeof gain.gain.cancelAndHoldAtTime === "function") {
            gain.gain.cancelAndHoldAtTime(releaseAt);
          } else {
            gain.gain.cancelScheduledValues(releaseAt);
            gain.gain.setValueAtTime(Math.max(0.0001, peak), releaseAt);
          }
          gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + releaseSeconds);
          try {
            source.stop(releaseAt + releaseSeconds + 0.03);
          } catch {
            // The source may already be stopped.
          }
        },
        cancel: (time = context.currentTime) => {
          if (voice.ended) return;
          const stopAt = Math.max(context.currentTime, time);
          voice.releaseAt = Math.min(voice.releaseAt, stopAt);
          try {
            gain.gain.cancelScheduledValues(stopAt);
            gain.gain.setValueAtTime(0.0001, stopAt);
          } catch {}
          try { source.stop(stopAt); } catch {}
        },
      };

      source.addEventListener("ended", () => {
        voice.ended = true;
        this.voices.delete(voice);
        try { source.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      }, { once: true });
      source.start(when);
      this.voices.add(voice);
      if (Number.isFinite(duration) && duration > 0) {
        voice.release(when + duration);
      }
      return voice;
    }

    createFallbackVoice(midi, velocity, when, duration, gainScale = 1) {
      const context = this.ensureContext();
      const safeGainScale = Number.isFinite(Number(gainScale))
        ? clamp(Number(gainScale), 0, 1.5)
        : 1;
      this.enforceVoiceLimit(when);
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const oscillatorA = context.createOscillator();
      const oscillatorB = context.createOscillator();
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const peak = clamp((velocity / 127) ** 1.4 * 0.24 * safeGainScale, 0.0001, 0.3);
      const release = 0.32;

      oscillatorA.type = "triangle";
      oscillatorA.frequency.value = frequency;
      oscillatorB.type = "sine";
      oscillatorB.frequency.value = frequency * 2;
      oscillatorB.detune.value = 2;
      filter.type = "lowpass";
      filter.frequency.value = Math.min(9000, 1800 + frequency * 5);
      filter.Q.value = 0.7;

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(peak * 0.32, when + 0.7);
      oscillatorA.connect(filter);
      oscillatorB.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      const voice = {
        gain,
        source: oscillatorA,
        sourceB: oscillatorB,
        ended: false,
        releaseAt: Infinity,
        startedAt: when,
        release: (time = context.currentTime, releaseOverride = release) => {
          if (voice.ended) {
            return;
          }
          const releaseAt = Math.max(context.currentTime, time);
          if (releaseAt >= voice.releaseAt) {
            return;
          }
          voice.releaseAt = releaseAt;
          const releaseSeconds = clamp(releaseOverride, 0.025, 1.5);
          if (typeof gain.gain.cancelAndHoldAtTime === "function") {
            gain.gain.cancelAndHoldAtTime(releaseAt);
          } else {
            gain.gain.cancelScheduledValues(releaseAt);
            gain.gain.setValueAtTime(Math.max(0.0001, peak), releaseAt);
          }
          gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + releaseSeconds);
          try { oscillatorA.stop(releaseAt + releaseSeconds + 0.03); } catch {}
          try { oscillatorB.stop(releaseAt + releaseSeconds + 0.03); } catch {}
        },
        cancel: (time = context.currentTime) => {
          if (voice.ended) return;
          const stopAt = Math.max(context.currentTime, time);
          voice.releaseAt = Math.min(voice.releaseAt, stopAt);
          try {
            gain.gain.cancelScheduledValues(stopAt);
            gain.gain.setValueAtTime(0.0001, stopAt);
          } catch {}
          try { oscillatorA.stop(stopAt); } catch {}
          try { oscillatorB.stop(stopAt); } catch {}
        },
      };

      const cleanup = () => {
        voice.ended = true;
        this.voices.delete(voice);
        try { oscillatorA.disconnect(); } catch {}
        try { oscillatorB.disconnect(); } catch {}
        try { filter.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
      oscillatorA.addEventListener("ended", cleanup, { once: true });
      oscillatorA.start(when);
      oscillatorB.start(when);
      this.voices.add(voice);
      if (Number.isFinite(duration) && duration > 0) {
        voice.release(when + duration);
      }
      return voice;
    }

    playNote(midi, velocity = 100, when = null, duration = null, options = null) {
      const context = this.ensureContext();
      const startAt = when == null ? context.currentTime + 0.005 : Math.max(context.currentTime, when);
      const program = clamp(Number(options?.program) || 0, 0, 127);
      const bank = clamp(Number(options?.bank) || 0, 0, 16383);
      const gainScale = Number.isFinite(Number(options?.gainScale))
        ? clamp(Number(options.gainScale), 0, 1.5)
        : 1;
      if (this.soundFont) {
        return this.createSf2Voice(midi, velocity, startAt, duration, program, bank, gainScale);
      }
      return this.createFallbackVoice(midi, velocity, startAt, duration, gainScale);
    }

    stopAll(time = null) {
      if (!this.context) {
        return;
      }
      const stopAt = time == null ? this.context.currentTime : time;
      for (const voice of [...this.voices]) {
        voice.release(stopAt, 0.035);
      }
    }
  }

  window.MabinogiSf2Player = MabinogiSf2Player;
  window.MabinogiSf2Debug = Object.freeze({
    parseSf2,
    parseSharedSoundBank: (...args) => window.MabiSf2?.parseSoundBank?.(...args),
  });
})();
