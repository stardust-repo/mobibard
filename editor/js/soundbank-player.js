(() => {
  "use strict";

  const clamp = window.MabiUtils?.clamp;
  if (typeof clamp !== "function") throw new Error("utils.js must be loaded before this Editor script");

  function normalizeSharedRange(value) {
    const source = Array.isArray(value) ? value : [0, 127];
    const rawLow = Number(source[0]);
    const rawHigh = Number(source[1]);
    const low = clamp(Math.round(Number.isFinite(rawLow) ? rawLow : 0), 0, 127);
    const high = clamp(Math.round(Number.isFinite(rawHigh) ? rawHigh : 127), low, 127);
    return { low, high };
  }

  function selectSharedPreset(soundBank, program = 0, bank = 0) {
    const safeBank = clamp(Math.round(Number(bank) || 0), 0, 16383);
    const shared = window.MabiSoundBank?.findPreset?.(soundBank, program, safeBank);
    if (shared) return shared;

    // A drum request must never fall back to the first melodic preset.
    if (safeBank === 128) return null;

    const presets = Array.isArray(soundBank?.presets) ? soundBank.presets : [];
    return presets[0] || null;
  }

  function findExactZone(soundFont, midi, velocity) {
    if (!soundFont || !Array.isArray(soundFont.zones)) return null;
    for (const zone of soundFont.zones) {
      if (
        midi >= zone.keyRange.low &&
        midi <= zone.keyRange.high &&
        velocity >= zone.velocityRange.low &&
        velocity <= zone.velocityRange.high
      ) {
        return zone;
      }
    }
    return null;
  }

  function adaptSharedPreset(soundBank, preset) {
    if (!soundBank || !preset) {
      throw new Error("재생 가능한 SoundBank 프리셋이 없습니다.");
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
        loopRegion: region,
      };
    }).filter(Boolean);

    if (!zones.length) {
      throw new Error("선택한 SoundBank 프리셋에 샘플 영역이 없습니다.");
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
        const soundBankApi = window.MabiSoundBank;
        if (!soundBankApi?.loadEmbeddedSoundBank) {
          this.emitStatus("기본 신시사이저", "fallback");
          return null;
        }

        try {
          this.emitStatus("공용 SF3 음원 준비 0%", "loading");
          this.soundBank = await soundBankApi.loadEmbeddedSoundBank({
            clearBase64: true,
            onProgress: (progress) => {
              const percent = Math.min(99, Math.round(progress * 100));
              this.emitStatus(`공용 SF3 음원 준비 ${percent}%`, "loading");
            },
          });
          const preset = selectSharedPreset(this.soundBank, this.presetNumber, this.bankNumber);
          this.soundFont = adaptSharedPreset(this.soundBank, preset);
          this.soundFonts.set(`${this.soundFont.bank}:${this.soundFont.preset}`, this.soundFont);
          this.soundFonts.set(`${this.bankNumber}:${this.presetNumber}`, this.soundFont);
          this.emitStatus(`${this.soundBank.fileName || "공용 SF3"} · ${this.soundFont.presetName}`, "ready");
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
        // Missing percussion must not silently turn into the initial melodic preset.
        if (safeBank === 128) return null;
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
      const safeBank = clamp(Math.round(Number(bank) || 0), 0, 16383);
      const soundFont = this.getSoundFont(program, safeBank);
      if (!soundFont) return null;
      const cacheKey = `${safeBank}:${soundFont.bank}:${soundFont.preset}:${Math.round(midi)}:${Math.floor(clamp(velocity, 0, 127) / 16)}`;
      if (this.zoneCache.has(cacheKey)) {
        return this.zoneCache.get(cacheKey);
      }

      let matched = findExactZone(soundFont, midi, velocity);

      if (safeBank === 128) {
        // Percussion keys are discrete instruments. Never transpose/borrow the nearest
        // key. If the selected drum kit lacks this key, use the same key from the
        // bundled Standard Drum Kit (Bank 128 / Program 0).
        if (!matched && Number(soundFont.preset) !== 0) {
          const standardKit = this.getSoundFont(0, 128);
          matched = findExactZone(standardKit, midi, velocity);
        }
        this.zoneCache.set(cacheKey, matched);
        return matched;
      }

      // Melodic presets keep the existing nearest-zone fallback.
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
        throw new Error("SoundBank 샘플 버퍼를 만들 수 없습니다.");
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
        // A missing drum key should stay silent rather than become a pitched synth.
        if (clamp(Math.round(Number(bank) || 0), 0, 16383) === 128) return null;
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
        const resolvedLoop = window.MabiSoundBank?.resolveLoopFrames?.(zone.sample, zone.loopRegion, buffer);
        if (resolvedLoop && resolvedLoop.endFrame > resolvedLoop.startFrame + 1) {
          source.loop = true;
          const loopRate = Math.max(8000, Number(buffer.sampleRate || zone.sampleRate) || 44100);
          source.loopStart = resolvedLoop.startFrame / loopRate;
          source.loopEnd = Math.max(source.loopStart + 0.001, resolvedLoop.endFrame / loopRate);
        }
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
          const fadeEnd = stopAt + 0.012;
          voice.releaseAt = Math.min(voice.releaseAt, stopAt);
          try {
            if (typeof gain.gain.cancelAndHoldAtTime === "function") {
              gain.gain.cancelAndHoldAtTime(stopAt);
            } else {
              gain.gain.cancelScheduledValues(stopAt);
              gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value || peak), stopAt);
            }
            gain.gain.linearRampToValueAtTime(0.0001, fadeEnd);
          } catch {}
          try { source.stop(fadeEnd + 0.004); } catch {}
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

  const editorSoundBankApi = Object.freeze({
    version: "5.1.0",
    parse(source, options = {}) {
      const shared = window.MabiSoundBank;
      if (source && typeof source.arrayBuffer === "function") return shared?.parseSoundBankFile?.(source, options);
      return shared?.parseSoundBank?.(source, options);
    },
    loadDefault: (...args) => window.MabiSoundBank?.loadEmbeddedSoundBank?.(...args),
    findPreset: (...args) => window.MabiSoundBank?.findPreset?.(...args),
    Player: MabinogiSf2Player,
  });

  window.MobibardEditorSoundBank = editorSoundBankApi;
  window.MabinogiSf2Player = MabinogiSf2Player; // Backward-compatible editor API.
  window.MabinogiSf2Debug = Object.freeze({
    parseSharedSoundBank: editorSoundBankApi.parse,
  });
})();
