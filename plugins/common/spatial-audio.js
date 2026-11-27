(() => {
  "use strict";

  // 공간 사운드 오디오 엔진 (에디터·플레이어 공유).
  //   채널 입력(channelInput) → 스피커(채널 합산) → 거리/방향(HRTF PannerNode) → 출력
  //                                         └→ 초기 반사(사각 방) / 잔향(돔·사각 방)
  // 좌표는 미터(m): x = 오른쪽, z = 뒤쪽(Web Audio와 같은 오른손 좌표). yaw = 0 이면 -z 방향을 보고, 양수는 오른쪽으로 돈다.
  // 높이 개념은 없다(청자·스피커 모두 같은 높이, y = 0). 반사 계산에만 고정 높이를 쓴다.
  const VERSION = "1.1.0";
  const MAX_SPEAKERS = 12;
  const SIZE_MIN = 5;
  const SIZE_MAX = 30;
  const SIZE_DEFAULT = 16;
  const SNAP = 0.5;            // 0.5m = 타일 1칸, 스피커·캐릭터는 2×2 타일(1m)
  const BODY = 1;              // 스피커·캐릭터 한 변(m)
  const SPEED_OF_SOUND = 343;
  const ROOM_HEIGHT = 3;
  const SPEAKER_HEIGHT = 1.0;
  const EAR_HEIGHT = 1.6;
  const REF_DISTANCE = 2;      // 2m 안에서는 원래 음량, 멀어질수록 1/거리로 작아진다
  const ENVIRONMENTS = ["none", "dome", "room"];
  const SEND_LEVEL = { dome: 0.5, room: 0.4 };
  const REFLECTIVITY = 0.62;

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const snap = value => Math.round(value / SNAP) * SNAP;

  function normalizeEnv(env) {
    return ENVIRONMENTS.includes(env) ? env : "room";
  }
  function normalizeSize(size) {
    return clamp(Math.round(finite(size, SIZE_DEFAULT)), SIZE_MIN, SIZE_MAX);
  }

  // 지도 안에 중심이 들어갈 수 있는 범위(몸 크기의 절반만큼 안쪽). 벽 없음도 같은 크기의 바닥 안으로 제한한다.
  function clampToMap(x, z, env, size, margin = BODY / 2) {
    const half = size / 2;
    if (normalizeEnv(env) === "dome") {
      const limit = Math.max(0, half - margin * 1.42);
      const dist = Math.hypot(x, z);
      if (dist > limit && dist > 0) return { x: x * limit / dist, z: z * limit / dist };
      return { x, z };
    }
    const limit = half - margin;
    return { x: clamp(x, -limit, limit), z: clamp(z, -limit, limit) };
  }

  function snapSpeaker(x, z, env, size) {
    // 스냅한 뒤 지도 안으로 넣고, 다시 스냅해서 칸 경계에 맞춘다(돔은 원 안쪽으로 한 칸씩 줄인다).
    let p = { x: snap(x), z: snap(z) };
    for (let i = 0; i < 4; i++) {
      const c = clampToMap(p.x, p.z, env, size);
      if (Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.z - p.z) < 1e-6) break;
      p = { x: Math.floor(c.x / SNAP + 1e-9) * SNAP, z: Math.floor(c.z / SNAP + 1e-9) * SNAP };
      if (c.x < 0) p.x = Math.ceil(c.x / SNAP - 1e-9) * SNAP;
      if (c.z < 0) p.z = Math.ceil(c.z / SNAP - 1e-9) * SNAP;
    }
    return p;
  }

  function overlap(a, b) {
    return Math.abs(a.x - b.x) < BODY - 1e-6 && Math.abs(a.z - b.z) < BODY - 1e-6;
  }

  function defaultConfig() {
    return {
      v: 1,
      enabled: false,
      env: "room",
      size: SIZE_DEFAULT,
      listener: { x: 0, z: 0, yaw: 0 },
      // 처음에는 캐릭터 정면 두 번째 칸(1m 칸 기준 2m 앞)에 모든 채널이 연결된 스피커가 하나 있다.
      speakers: [{ id: "s1", x: 0, z: -2, channels: [] , all: true }],
    };
  }

  // 저장된/외부 값을 안전한 설정으로 맞춘다. channels는 문자열 id 배열, all=true 이면 "모든 채널"이다.
  function normalizeConfig(raw) {
    const base = defaultConfig();
    const src = raw && typeof raw === "object" ? raw : {};
    const env = normalizeEnv(src.env);
    const size = normalizeSize(src.size);
    const L = src.listener || {};
    const lp = clampToMap(finite(L.x, 0), finite(L.z, 0), env, size);
    const listener = { x: lp.x, z: lp.z, yaw: finite(L.yaw, 0) };
    let speakers = Array.isArray(src.speakers) ? src.speakers : base.speakers;
    const placed = [];
    for (const item of speakers.slice(0, MAX_SPEAKERS)) {
      const p = snapSpeaker(finite(item?.x, 0), finite(item?.z, -2), env, size);
      const id = String(item?.id || `s${placed.length + 1}`);
      if (placed.some(other => other.id === id)) continue;
      placed.push({
        id,
        x: p.x,
        z: p.z,
        all: item?.all === true,
        channels: Array.isArray(item?.channels) ? [...new Set(item.channels.map(String))] : [],
      });
    }
    return { v: 1, enabled: src.enabled === true, env, size, listener, speakers: placed };
  }

  // ---- 잔향 응답(IR) 합성 -----------------------------------------------------------------------
  // Sabine 식으로 방 부피·표면적에서 잔향 시간을 구하고, 지수로 줄어드는 소음에 고음이 먼저 사라지는 경향을 입힌다.
  function reverbTime(env, size) {
    if (env === "room") {
      const volume = size * size * ROOM_HEIGHT;
      const surface = 2 * size * size + 4 * size * ROOM_HEIGHT;
      return clamp(0.161 * volume / (0.16 * surface), 0.4, 3.2);
    }
    if (env === "dome") {
      const radius = size / 2;
      return clamp(0.161 * (2 * radius / 9) / 0.1, 0.8, 4.5);
    }
    return 0;
  }

  function buildImpulse(context, env, size) {
    const rt = reverbTime(env, size);
    if (!rt) return null;
    const rate = context.sampleRate;
    const predelay = Math.min(0.09, (size / 2) / SPEED_OF_SOUND * (env === "dome" ? 0.6 : 0.8));
    const length = Math.max(1, Math.floor((predelay + rt * 1.05) * rate));
    const buffer = context.createBuffer(2, length, rate);
    // 결정적 의사난수: 같은 설정은 항상 같은 잔향이 나오도록 한다.
    let seed = 0x9e3779b9 ^ (size * 977) ^ (env === "dome" ? 0x5bd1e995 : 0x1b873593);
    const rand = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296 * 2 - 1;
    };
    const start = Math.floor(predelay * rate);
    const decayPerSample = Math.log(1000) / (rt * rate);       // -60dB at RT60
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = start; i < length; i++) {
        const t = (i - start) / rate;
        const amp = Math.exp(-decayPerSample * (i - start));
        // 시간이 지날수록 고음이 줄어든다: 로우패스 계수를 시간에 따라 키운다.
        const alpha = clamp(0.92 - 0.55 * Math.exp(-t / (rt * 0.35)), 0.25, 0.92);
        low = low * alpha + rand() * (1 - alpha);
        const dense = env === "dome" ? 1 : clamp(t / 0.04, 0.25, 1); // 사각 방은 초기에 성기고 점점 촘촘해진다
        data[i] = low * amp * dense;
      }
    }
    // 에너지 정규화(방 크기와 상관없이 비슷한 세기로).
    let energy = 0;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) energy += data[i] * data[i];
    }
    const scale = energy > 0 ? 1 / Math.sqrt(energy / 2) * 0.09 : 1;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] *= scale;
    }
    return buffer;
  }

  // 원형 벽의 1차 반사: 벽 위의 점 P에서 "스피커→P→청자" 경로 길이가 극값(정지점)이 되는 곳이 반사 지점이다(페르마 원리).
  // 반사음은 P 방향에서 경로 길이만큼 떨어진 가상 음원으로 바꿔서 돌려준다(최대 4개, 짧은 순).
  function domeWallImages(sx, sz, lx, lz, radius) {
    const N = 180;
    const lens = new Array(N);
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      const px = radius * Math.cos(a), pz = radius * Math.sin(a);
      lens[i] = Math.hypot(px - sx, pz - sz) + Math.hypot(px - lx, pz - lz);
    }
    const picks = [];
    const minGap = N / 18; // 20도
    const flat = Math.max(...lens) - Math.min(...lens) < 1e-4;
    for (let i = 0; i < N; i++) {
      const prev = lens[(i + N - 1) % N], next = lens[(i + 1) % N], v = lens[i];
      const extreme = flat ? i % (N / 4) === 0 : (v <= prev && v < next) || (v >= prev && v > next);
      if (!extreme) continue;
      if (picks.some(j => Math.min(Math.abs(j - i), N - Math.abs(j - i)) < minGap)) continue;
      picks.push(i);
    }
    return picks
      .map(i => {
        const a = i / N * Math.PI * 2;
        const px = radius * Math.cos(a), pz = radius * Math.sin(a);
        const dx = px - lx, dz = pz - lz, d = Math.hypot(dx, dz) || 1;
        return { len: lens[i], img: [lx + dx / d * lens[i], lz + dz / d * lens[i], SPEAKER_HEIGHT] };
      })
      .sort((a, b) => a.len - b.len)
      .slice(0, 4)
      .map(item => item.img);
  }

  // ---- 엔진 ------------------------------------------------------------------------------------
  function setParam(param, value, context, smooth = 0.03) {
    if (!param) return;
    try {
      if (smooth > 0 && context.state === "running") param.setTargetAtTime(value, context.currentTime, smooth);
      else param.setValueAtTime(value, context.currentTime);
    } catch (_) {
      try { param.value = value; } catch (__) {}
    }
  }

  function createEngine({ context, destination } = {}) {
    if (!context) throw new Error("AudioContext is required.");
    const output = context.createGain();
    output.connect(destination || context.destination);
    const reverbSend = context.createGain();      // 모든 스피커의 "원음"이 모이는 곳
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 1;
    reverbReturn.connect(output);
    let convolver = null;
    let convolverKey = "";
    const channelBuses = new Map();               // channelId -> GainNode
    const speakers = new Map();                   // speakerId -> speaker graph
    let config = defaultConfig();
    let listener = { x: 0, z: 0, yaw: 0 };
    let disposed = false;

    function ensureChannel(channelId) {
      const key = String(channelId);
      let bus = channelBuses.get(key);
      if (!bus) {
        bus = context.createGain();
        bus.gain.value = 1;
        channelBuses.set(key, bus);
        for (const speaker of speakers.values()) wireSpeakerChannels(speaker);
      }
      return bus;
    }

    function speakerWantsChannel(speaker, channelKey) {
      return speaker.cfg.all === true || speaker.cfg.channels.includes(channelKey);
    }

    function wireSpeakerChannels(speaker) {
      for (const [channelKey, bus] of channelBuses) {
        const wanted = speakerWantsChannel(speaker, channelKey);
        const connected = speaker.connected.has(channelKey);
        if (wanted && !connected) {
          bus.connect(speaker.input);
          speaker.connected.add(channelKey);
        } else if (!wanted && connected) {
          try { bus.disconnect(speaker.input); } catch (_) {}
          speaker.connected.delete(channelKey);
        }
      }
    }

    function createSpeaker(cfg) {
      const input = context.createGain();
      const panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = REF_DISTANCE;
      panner.rolloffFactor = 1;
      panner.maxDistance = 10000;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      input.connect(panner);
      panner.connect(output);
      const send = context.createGain();
      send.gain.value = 0;
      input.connect(send);
      send.connect(reverbSend);
      const taps = [];
      for (let i = 0; i < 6; i++) {
        const delay = context.createDelay(0.5);
        const gain = context.createGain();
        gain.gain.value = 0;
        const pan = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
        input.connect(delay);
        delay.connect(gain);
        if (pan) { gain.connect(pan); pan.connect(output); } else gain.connect(output);
        taps.push({ delay, gain, pan });
      }
      return { cfg, input, panner, send, taps, connected: new Set() };
    }

    function destroySpeaker(speaker) {
      for (const [channelKey, bus] of channelBuses) {
        if (speaker.connected.has(channelKey)) { try { bus.disconnect(speaker.input); } catch (_) {} }
      }
      for (const node of [speaker.input, speaker.panner, speaker.send, ...speaker.taps.flatMap(t => [t.delay, t.gain, t.pan])]) {
        try { node?.disconnect(); } catch (_) {}
      }
    }

    function setPannerPosition(panner, x, y, z, smooth = 0.03) {
      if (panner.positionX) {
        setParam(panner.positionX, x, context, smooth);
        setParam(panner.positionY, y, context, smooth);
        setParam(panner.positionZ, z, context, smooth);
      } else if (typeof panner.setPosition === "function") {
        panner.setPosition(x, y, z);
      }
    }

    function applyListener(smooth = 0.03) {
      const L = context.listener;
      const fx = Math.sin(listener.yaw);
      const fz = -Math.cos(listener.yaw);
      if (L.positionX) {
        setParam(L.positionX, listener.x, context, smooth);
        setParam(L.positionY, 0, context, smooth);
        setParam(L.positionZ, listener.z, context, smooth);
        setParam(L.forwardX, fx, context, smooth);
        setParam(L.forwardY, 0, context, smooth);
        setParam(L.forwardZ, fz, context, smooth);
        setParam(L.upX, 0, context, 0);
        setParam(L.upY, 1, context, 0);
        setParam(L.upZ, 0, context, 0);
      } else {
        L.setPosition?.(listener.x, 0, listener.z);
        L.setOrientation?.(fx, 0, fz, 0, 1, 0);
      }
      updateReflections(smooth);
    }

    // 사각 방 초기 반사: 벽 4면 + 바닥/천장의 1차 반사를 "거울상 음원"으로 계산한다.
    function updateReflections(smooth = 0.05) {
      const env = config.env;
      const half = config.size / 2;
      const rightX = Math.cos(listener.yaw);
      const rightZ = Math.sin(listener.yaw);
      for (const speaker of speakers.values()) {
        const sx = speaker.cfg.x;
        const sz = speaker.cfg.z;
        const direct = Math.max(0.5, Math.hypot(sx - listener.x, sz - listener.z));
        const images = [];
        if (env === "room") {
          images.push([2 * half - sx, sz, SPEAKER_HEIGHT], [-2 * half - sx, sz, SPEAKER_HEIGHT]);
          images.push([sx, 2 * half - sz, SPEAKER_HEIGHT], [sx, -2 * half - sz, SPEAKER_HEIGHT]);
          images.push([sx, sz, -SPEAKER_HEIGHT], [sx, sz, 2 * ROOM_HEIGHT - SPEAKER_HEIGHT]);
        } else if (env === "dome") {
          images.push(...domeWallImages(sx, sz, listener.x, listener.z, half));
          images.push([sx, sz, -SPEAKER_HEIGHT], [sx, sz, 2 * half - SPEAKER_HEIGHT]);
        }
        speaker.taps.forEach((tap, index) => {
          const image = images[index];
          if (!image) { setParam(tap.gain.gain, 0, context, smooth); return; }
          const dx = image[0] - listener.x;
          const dz = image[1] - listener.z;
          const dy = image[2] - EAR_HEIGHT;
          const path = Math.max(direct, Math.hypot(dx, dz, dy));
          const extra = Math.max(0, path - Math.hypot(sx - listener.x, sz - listener.z, SPEAKER_HEIGHT - EAR_HEIGHT));
          const delay = clamp(extra / SPEED_OF_SOUND, 0, 0.45);
          // 거리 감쇠는 직접음과 같은 규칙(REF_DISTANCE 안은 1, 밖은 1/거리)을 따르고, 벽 반사율을 곱한다.
          const atten = REF_DISTANCE / Math.max(REF_DISTANCE, path);
          setParam(tap.delay.delayTime, delay, context, smooth);
          setParam(tap.gain.gain, atten * REFLECTIVITY, context, smooth);
          if (tap.pan) {
            const horizontal = Math.hypot(dx, dz) || 1;
            const side = (dx * rightX + dz * rightZ) / horizontal;
            setParam(tap.pan.pan, clamp(side, -1, 1), context, smooth);
          }
        });
      }
    }

    function applyEnvironment() {
      const key = `${config.env}:${config.size}:${context.sampleRate}`;
      if (key !== convolverKey) {
        convolverKey = key;
        const impulse = config.env === "none" ? null : buildImpulse(context, config.env, config.size);
        try { reverbSend.disconnect(); } catch (_) {}
        if (convolver) { try { convolver.disconnect(); } catch (_) {} convolver = null; }
        if (impulse) {
          convolver = context.createConvolver();
          convolver.normalize = false;
          convolver.buffer = impulse;
          reverbSend.connect(convolver);
          convolver.connect(reverbReturn);
        }
      }
      const level = SEND_LEVEL[config.env] || 0;
      for (const speaker of speakers.values()) setParam(speaker.send.gain, level, context, 0.05);
    }

    function setConfig(next) {
      if (disposed) return config;
      config = normalizeConfig(next);
      const ids = new Set(config.speakers.map(s => s.id));
      for (const [id, speaker] of [...speakers]) {
        if (!ids.has(id)) { destroySpeaker(speaker); speakers.delete(id); }
      }
      for (const cfg of config.speakers) {
        let speaker = speakers.get(cfg.id);
        if (!speaker) { speaker = createSpeaker(cfg); speakers.set(cfg.id, speaker); }
        speaker.cfg = cfg;
        setPannerPosition(speaker.panner, cfg.x, 0, cfg.z);
        wireSpeakerChannels(speaker);
      }
      listener = { ...config.listener };
      applyEnvironment();
      applyListener(0);
      return config;
    }

    function setListener(next) {
      if (disposed) return;
      const p = clampToMap(finite(next?.x, listener.x), finite(next?.z, listener.z), config.env, config.size);
      listener = { x: p.x, z: p.z, yaw: finite(next?.yaw, listener.yaw) };
      applyListener(0.03);
    }

    function dispose() {
      disposed = true;
      for (const speaker of speakers.values()) destroySpeaker(speaker);
      speakers.clear();
      for (const bus of channelBuses.values()) { try { bus.disconnect(); } catch (_) {} }
      channelBuses.clear();
      for (const node of [output, reverbSend, reverbReturn, convolver]) { try { node?.disconnect(); } catch (_) {} }
    }

    return {
      version: VERSION,
      context,
      output,
      channelInput: ensureChannel,
      setConfig,
      setListener,
      getConfig: () => config,
      getListener: () => ({ ...listener }),
      dispose,
      diagnostics: () => ({ speakers: speakers.size, channels: channelBuses.size, reverbSeconds: reverbTime(config.env, config.size), env: config.env, size: config.size }),
    };
  }

  window.MobibardSpatialAudio = Object.freeze({
    version: VERSION,
    MAX_SPEAKERS, SIZE_MIN, SIZE_MAX, SIZE_DEFAULT, SNAP, BODY, ENVIRONMENTS,
    defaultConfig, normalizeConfig, domeWallImages, normalizeEnv, normalizeSize, clampToMap, snapSpeaker, overlap, reverbTime, buildImpulse,
    createEngine,
  });
})();
