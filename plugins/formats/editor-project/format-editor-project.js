(() => {
  "use strict";

  const core = window.MabiMusicFormats;
  if (!core) throw new Error("music-format-core.js must be loaded before format-editor-project.js");

  const FORMAT_NAME = "mml-piano-roll-project";
  const PPQ = 480;

  function decodeJson(bytes) {
    const text = new TextDecoder("utf-8").decode(core.asUint8Array(bytes)).replace(/^\uFEFF/, "");
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("모비바드 Editor 프로젝트 JSON을 읽지 못했습니다.");
    }
    if (!data || data.format !== FORMAT_NAME || !Array.isArray(data.channels)) {
      throw new Error("모비바드 Editor 프로젝트 파일이 아닙니다.");
    }
    return data;
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function noteVelocity(note) {
    const velocity = Number(note?.velocity);
    if (Number.isFinite(velocity) && velocity > 0) return Math.round(clamp(velocity, 1, 127, 96));
    const volume = Number(note?.volume);
    if (Number.isFinite(volume)) {
      const level = Math.round(clamp(volume, 0, 15, 15));
      if (level <= 0) return 1;
      if (level === 1) return 1;
      return Math.round(1 + ((level - 1) / 14) * 126);
    }
    return 96;
  }

  function channelBank(channel) {
    return Math.round(clamp(channel?.instrumentBank, 0, 16383, 0));
  }

  function isDrumChannel(channel) {
    const bank = channelBank(channel);
    const name = String(channel?.instrument || "").toLowerCase();
    return bank === 128 || /drum|percussion|cymbal|bigdrum|북|드럼|심벌/.test(name);
  }

  function projectToMidi(project) {
    const tempoEvents = (Array.isArray(project.tempos) ? project.tempos : [])
      .map(item => ({
        tick: Math.max(0, Math.round((Number(item?.beat) || 0) * PPQ)),
        bpm: clamp(item?.bpm, 1, 999, 120),
      }))
      .sort((a, b) => a.tick - b.tick);
    if (!tempoEvents.length || tempoEvents[0].tick > 0) tempoEvents.unshift({ tick: 0, bpm: 120 });

    const tracks = (project.channels || []).map((channel, index) => {
      const bank = channelBank(channel);
      const drums = isDrumChannel(channel);
      const controls = [];
      if (!drums && bank > 0) {
        controls.push({ tick: 0, controller: 0, value: (bank >>> 7) & 0x7f });
        controls.push({ tick: 0, controller: 32, value: bank & 0x7f });
      }
      const notes = (Array.isArray(channel?.notes) ? channel.notes : []).map(note => ({
        startTick: Math.max(0, Math.round((Number(note?.startBeat) || 0) * PPQ)),
        durationTick: Math.max(1, Math.round(Math.max(1 / 64, Number(note?.durationBeat) || 1 / 4) * PPQ)),
        pitch: Math.round(clamp(note?.pitch, 0, 127, 60)),
        velocity: noteVelocity(note),
      }));
      return {
        name: String(channel?.name || `Ch${index + 1}`),
        program: Math.round(clamp(channel?.instrumentProgram, 0, 127, 0)),
        isDrums: drums,
        controlChanges: controls,
        notes,
      };
    });

    return core.buildMidi({
      ppq: PPQ,
      title: String(project.projectName || "MobiBard Editor Project"),
      tempoEvents,
      tracks,
    });
  }

  core.registerFormat({
    id: "mobibard-editor-project",
    label: "MobiBard Editor Project",
    category: "editor",
    extensions: ["mmlproj.json", "mmlproj"],
    description: "MobiBard Editor 프로젝트의 채널, 음표, 템포를 MIDI로 변환해 불러옵니다.",
    limitation: "Editor 전용 UI 상태와 참고 오디오는 Simple/Player로 전달되지 않습니다.",
    convert(bytes) {
      const project = decodeJson(bytes);
      return {
        midiBytes: projectToMidi(project),
        metadata: {
          projectName: String(project.projectName || ""),
          projectVersion: Number(project.version) || 0,
          editorChannelCount: project.channels.length,
          editorAudioClipCount: Array.isArray(project.audioClips) ? project.audioClips.length : 0,
        },
      };
    },
    detect(bytes) {
      try {
        const head = new TextDecoder("utf-8").decode(core.asUint8Array(bytes).subarray(0, 8192));
        return /["']format["']\s*:\s*["']mml-piano-roll-project["']/.test(head);
      } catch (_) {
        return false;
      }
    },
  });
})();
