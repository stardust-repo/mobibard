/*
 * MabiIcco(.mmi) 형식 플러그인 — 읽기 + 내보내기 (편집기·플레이어 공용)
 *
 * 화면/앱 상태에 의존하지 않는 순수 함수만 담고, 앱마다 달라지는 부분(MML 파트 검사 등)은 옵션으로 받습니다.
 * 모든 제품은 이 파일의 window.MabiMmi 를 통해서만 MMI 를 읽고 씁니다.
 *
 * 읽기
 *   MabiMmi.extractCandidates(text, { isMmlPart, minTempo, maxTempo, nameOptions })
 *     → [{ label, name, value, mmiTrackNumber, mmiPartIndex, mmiProgram, mmiGlobalTempoEvents, ... }]
 *     [mml-score] 구조(트랙/템포/악기 번호)가 있으면 그것을 읽고, 없으면 오래된/비표준 파일용 느슨한 검색으로 대체합니다.
 *   MabiMmi.normalizeLegacyLengths(part)   옛 마비꼬의 비표준 음 길이(l5, c7 …)를 표준 길이로 바꿈
 *   MabiMmi.cleanupMmlValue / cleanupNameValue / extractNameMarkers / findNameForCandidate / formatChannelLabel
 *
 * 내보내기
 *   MabiMmi.build({ title, timeSignature, tempos:[{beat,bpm}], tracks:[{ name, program, voices:[mml…] }] }) → 파일 텍스트
 *   MabiMmi.toBlob(text), MabiMmi.fileName(title)
 *   트랙 하나는 Melody / Chord 1 / Chord 2 세 파트라서, 보이스가 3개를 넘으면 다음 트랙으로 넘깁니다.
 */
(() => {
  "use strict";

  const TICKS_PER_BEAT = 96;          // MabiIcco 기본 해상도(4분음표당 틱)
  const PART_ROLES = ["Melody", "Chord 1", "Chord 2", "Song"];
  const DEFAULT_MIN_TEMPO = 1;
  const DEFAULT_MAX_TEMPO = 1000;

  const clampInt = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  // ───────────────────────── 읽기 ─────────────────────────

  function normalizeLegacyLengths(value) {
    const source = String(value || "");
    let index = 0;
    let output = "";
    let legacyDefault = null;
    const isDigit = (character) => /\d/.test(character || "");
    const readDigits = () => {
      const start = index;
      while (index < source.length && isDigit(source[index])) index += 1;
      return index > start ? source.slice(start, index) : "";
    };
    const readDots = () => {
      const start = index;
      while (source[index] === ".") index += 1;
      return index - start;
    };
    const dottedFactor = (dots) => {
      let factor = 1;
      let addition = 0.5;
      for (let count = 0; count < dots; count += 1) {
        factor += addition;
        addition /= 2;
      }
      return factor;
    };
    const isNativeLength = (length) => [1, 2, 4, 8, 16, 32, 64].includes(length);
    const quantaFromSpec = (spec) => {
      if (!spec?.length || spec.length <= 0) return 16;
      return Math.max(1, Math.round((64 / spec.length) * dottedFactor(spec.dots || 0) * (spec.extraFactor || 1)));
    };
    const decomposeQuanta = (quanta) => {
      let remaining = Math.max(1, Math.floor(quanta));
      const result = [];
      for (const entry of [
        { length: 1, quanta: 64 },
        { length: 2, quanta: 32 },
        { length: 4, quanta: 16 },
        { length: 8, quanta: 8 },
        { length: 16, quanta: 4 },
        { length: 32, quanta: 2 },
        { length: 64, quanta: 1 },
      ]) {
        while (remaining >= entry.quanta) {
          result.push(entry.length);
          remaining -= entry.quanta;
        }
      }
      return result.length ? result : [64];
    };
    const expandTimedToken = (head, spec, options = {}) => {
      const lengths = decomposeQuanta(quantaFromSpec(spec));
      const rest = options.rest || /^r$/i.test(head) || /^n0$/i.test(head);
      if (options.needsLengthCommand) {
        return lengths.map((length) => `l${length}${head}`).join(rest ? "" : "&");
      }
      return lengths.map((length) => `${head}${length}`).join(rest ? "" : "&");
    };
    const defaultSpec = (dots = 0) => legacyDefault ? {
      length: legacyDefault.length,
      dots: legacyDefault.dots,
      extraFactor: dottedFactor(dots),
    } : null;

    while (index < source.length) {
      const character = source[index];
      const lower = character.toLowerCase();
      if (lower === "l") {
        const start = index;
        index += 1;
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) legacyDefault = { length, dots };
        else {
          legacyDefault = null;
          output += source.slice(start, index);
        }
        continue;
      }
      if (/[cdefgab]/i.test(character)) {
        index += 1;
        let head = character;
        if (["+", "#", "-"].includes(source[index])) head += source[index++];
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) output += expandTimedToken(head, { length, dots });
        else if (!digits && legacyDefault) output += expandTimedToken(head, defaultSpec(dots));
        else output += `${head}${digits}${".".repeat(dots)}`;
        continue;
      }
      if (lower === "r") {
        index += 1;
        const digits = readDigits();
        const dots = readDots();
        const length = digits ? Number(digits) : null;
        if (length && !isNativeLength(length)) output += expandTimedToken(character, { length, dots }, { rest: true });
        else if (!digits && legacyDefault) output += expandTimedToken(character, defaultSpec(dots), { rest: true });
        else output += `${character}${digits}${".".repeat(dots)}`;
        continue;
      }
      if (lower === "n") {
        index += 1;
        const noteNumber = readDigits();
        const dots = readDots();
        const head = `n${noteNumber}`;
        if (legacyDefault && noteNumber) {
          output += expandTimedToken(head, defaultSpec(dots), { needsLengthCommand: true, rest: Number(noteNumber) === 0 });
        } else {
          output += `${head}${".".repeat(dots)}`;
        }
        continue;
      }
      output += character;
      index += 1;
    }
    return output;
  }


  function cleanupMmlValue(value) {
    let source = String(value == null ? "" : value);
    source = source.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    source = source.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    source = source.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    source = source
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    return source.replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim();
  }

  // 파트 문자열이 MML 처럼 보이는지. 앱이 자기 파서로 더 정확히 검사하려면 options.isMmlPart 를 넘깁니다.
  function defaultIsMmlPart(value) {
    const source = String(value || "").trim();
    if (!source || /[^cdefgabronltv<>+#\-&.0-9\s]/i.test(source)) return false;
    return /[cdefgabnr]/i.test(source);
  }

  function checkMmlPart(value, options) {
    const source = normalizeLegacyLengths(cleanupMmlValue(value));
    if (!source) return false;
    return (typeof options?.isMmlPart === "function" ? options.isMmlPart : defaultIsMmlPart)(source);
  }

  // options.isMmlPart: 이름처럼 보이는 값이 사실은 MML 이면 이름으로 쓰지 않기 위한 검사(선택)
  // options.finalize : 마지막 정리(예: 길이 제한). 선택
  function cleanupNameValue(value, options = {}) {
    let source = String(value == null ? "" : value);
    source = source.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "");
    source = source.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    source = source.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
    source = source
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    source = source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    source = source.replace(/^name\s*[:=]\s*/i, "").trim();
    if (!source || source.length > 120 || /^MML\s*@/i.test(source)) return "";
    if (typeof options.isMmlPart === "function") {
      const asMml = cleanupMmlValue(source);
      if (asMml && options.isMmlPart(asMml)) return "";
    }
    return typeof options.finalize === "function" ? options.finalize(source) : source;
  }

  function extractNameMarkers(source, nameOptions) {
    const text = String(source || "");
    const markers = [];
    const seen = new Set();
    const add = (raw, index = 0) => {
      const name = cleanupNameValue(raw, nameOptions);
      if (!name) return;
      const normalizedIndex = Math.max(0, Number(index) || 0);
      const key = `${normalizedIndex}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      markers.push({ index: normalizedIndex, name });
    };
    let match;
    const nameTag = /<([A-Za-z0-9_:-]*(?:name|trackname|partname)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]{0,500}?)<\/\1>/gim;
    while ((match = nameTag.exec(text))) add(match[2] || "", match.index);
    const nameAttribute = /\b(?:name|trackName|track_name|partName|part_name)\s*=\s*(?:"([^"]{0,220})"|'([^']{0,220})')/gim;
    while ((match = nameAttribute.exec(text))) add(match[1] ?? match[2] ?? "", match.index);
    const keyedName = /(?:^|[\r\n,{;\s])(?:[A-Za-z0-9_.:-]*(?:name|trackname|track_name|partname|part_name)[A-Za-z0-9_.:-]*)\s*[:=]\s*(?:"([^"]{0,220})"|'([^']{0,220})'|([^\r\n,}<>]{0,220}))/gim;
    while ((match = keyedName.exec(text))) add(match[1] ?? match[2] ?? match[3] ?? "", match.index);
    return markers.sort((left, right) => left.index - right.index);
  }

  function findNameForCandidate(position, markers, orderIndex = 0) {
    if (!markers?.length) return "";
    const target = Math.max(0, Number(position) || 0);
    let best = null;
    for (const marker of markers) {
      const distance = target - marker.index;
      if (distance >= 0 && distance <= 2400 && (!best || distance < best.distance)) {
        best = { name: marker.name, distance };
      }
    }
    if (best?.name) return best.name;
    for (const marker of markers) {
      const distance = marker.index - target;
      if (distance >= 0 && distance <= 900 && (!best || distance < best.distance)) {
        best = { name: marker.name, distance };
      }
    }
    if (best?.name) return best.name;
    return markers[clampInt(orderIndex, 0, markers.length - 1, 0)]?.name || "";
  }

  function formatChannelLabel(number, name = "", nameOptions) {
    const channelLabel = `Ch ${number}`;
    const cleanedName = cleanupNameValue(name, nameOptions);
    return cleanedName ? `${channelLabel} · ${cleanedName}` : channelLabel;
  }

  function extractScoreSection(text) {
    const source = String(text || "");
    const header = /^\s*\[mml-score\]\s*$/im.exec(source);
    if (!header) return source;
    const start = header.index + header[0].length;
    const nextHeader = /^\s*\[[^\]]+\]\s*$/gim;
    nextHeader.lastIndex = start;
    const next = nextHeader.exec(source);
    return source.slice(start, next ? next.index : source.length);
  }

  function readLineValue(block, key) {
    const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\r?\\n)\\s*${escaped}\\s*=\\s*([^\\r\\n]*)`, "i").exec(String(block || ""));
    return match ? String(match[1] || "").trim() : "";
  }

  function readInteger(block, key, fallback = 0) {
    const value = Number.parseInt(readLineValue(block, key), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  function readBoolean(block, key, fallback = true) {
    const raw = readLineValue(block, key).toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  }

  function extractGlobalTempoEvents(scoreSection, options) {
    const raw = readLineValue(scoreSection, "tempo");
    if (!raw) return [];
    const minTempo = Number(options?.minTempo) || DEFAULT_MIN_TEMPO;
    const maxTempo = Number(options?.maxTempo) || DEFAULT_MAX_TEMPO;
    const events = [];
    for (const item of raw.split(",")) {
      const match = /^\s*(-?\d+)\s*T\s*(\d+)\s*$/i.exec(item);
      if (!match) continue;
      const tick = Math.max(0, Number(match[1]) || 0);
      events.push({
        beat: tick / TICKS_PER_BEAT,
        bpm: clampInt(match[2], minTempo, maxTempo, 120),
        partIndex: -1,
        order: events.length,
      });
    }
    return events.sort((left, right) => left.beat - right.beat || left.order - right.order);
  }

  function extractStructuredTrackCandidates(text, options) {
    const nameOptions = options?.nameOptions;
    const scoreSection = extractScoreSection(text);
    const trackPattern = /(?:^|\r?\n)\s*mml-track\s*=\s*(MML\s*@[\s\S]*?;)\s*(?=\r?\n|$)/gi;
    const matches = [];
    let match;
    while ((match = trackPattern.exec(scoreSection))) {
      matches.push({ index: match.index, end: trackPattern.lastIndex, mml: String(match[1] || "") });
    }
    if (!matches.length) return [];

    const globalTempoEvents = extractGlobalTempoEvents(scoreSection, options);
    const candidates = [];
    let commonStartOffset = 0;
    let previousTrackEnd = 0;

    matches.forEach((trackMatch, trackIndex) => {
      const prelude = scoreSection.slice(previousTrackEnd, trackMatch.index);
      const startOffsetMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startOffset\s*=\s*(-?\d+)/gi)];
      if (startOffsetMatches.length) {
        commonStartOffset = Math.max(0, Number(startOffsetMatches[startOffsetMatches.length - 1][1]) || 0);
      }
      const startDeltaMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startDelta\s*=\s*(-?\d+)/gi)];
      const startSongDeltaMatches = [...prelude.matchAll(/(?:^|\r?\n)\s*startSongDelta\s*=\s*(-?\d+)/gi)];
      const startDelta = startDeltaMatches.length ? Number(startDeltaMatches[startDeltaMatches.length - 1][1]) || 0 : 0;
      const startSongDelta = startSongDeltaMatches.length ? Number(startSongDeltaMatches[startSongDeltaMatches.length - 1][1]) || 0 : 0;

      const nextTrackIndex = matches[trackIndex + 1]?.index ?? scoreSection.length;
      const propertyBlock = scoreSection.slice(trackMatch.end, nextTrackIndex);
      const trackNumber = trackIndex + 1;
      const trackName = cleanupNameValue(readLineValue(propertyBlock, "name"), nameOptions);
      const program = readInteger(propertyBlock, "program", 0);
      const songProgram = readInteger(propertyBlock, "songProgram", -1);
      const panpot = clampInt(readInteger(propertyBlock, "panpot", 64), 0, 127, 64);
      const rawVolume = readLineValue(propertyBlock, "volume") || readLineValue(propertyBlock, "volumn");
      const parsedVolume = Number.parseInt(rawVolume, 10);
      const volume = clampInt(Number.isFinite(parsedVolume) ? parsedVolume : 100, 0, 127, 100);
      const visible = readBoolean(propertyBlock, "visible", true);
      const mmlBody = cleanupMmlValue(trackMatch.mml);
      const parts = mmlBody.split(",");

      for (let partIndex = 0; partIndex < Math.max(4, parts.length); partIndex += 1) {
        const cleaned = normalizeLegacyLengths(cleanupMmlValue(parts[partIndex] || ""));
        if (!cleaned || !checkMmlPart(cleaned, options)) continue;
        const role = PART_ROLES[partIndex] || `Part ${partIndex + 1}`;
        const displayTrackName = trackName || `Track ${trackNumber}`;
        const partProgram = partIndex === 3 && songProgram >= 0 ? songProgram : program;
        const startTick = Math.max(0, commonStartOffset + (partIndex === 3 ? startSongDelta : startDelta));
        candidates.push({
          channelNumber: candidates.length + 1,
          label: `${displayTrackName} · ${role}`,
          name: `${displayTrackName} · ${role}`,
          value: cleaned,
          mmiTrackNumber: trackNumber,
          mmiTrackName: trackName,
          mmiPartIndex: partIndex,
          mmiPartRole: role,
          mmiProgram: program,
          mmiSongProgram: songProgram,
          mmiPartProgram: partProgram,
          mmiPanpot: panpot,
          mmiVolume: volume,
          mmiVisible: visible,
          mmiStartTick: startTick,
          mmiGlobalTempoEvents: globalTempoEvents,
        });
      }
      previousTrackEnd = trackMatch.end;
    });

    return candidates;
  }

  function extractCandidates(text, options = {}) {
    const source = String(text || "");
    const structured = extractStructuredTrackCandidates(source, options);
    if (structured.length) return structured;

    // 오래된/비표준 MMI: 폭넓게 찾되 채널 수 제한은 두지 않습니다.
    const nameOptions = options.nameOptions;
    const nameMarkers = extractNameMarkers(source, nameOptions);
    const found = [];
    const seen = new Set();
    const addCandidate = (rawValue, position = 0) => {
      const cleaned = cleanupMmlValue(rawValue);
      if (!cleaned) return;
      const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
      for (const part of parts) {
        const candidate = normalizeLegacyLengths(cleanupMmlValue(part));
        if (!candidate || !checkMmlPart(candidate, options)) continue;
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ position, value: candidate, name: findNameForCandidate(position, nameMarkers, found.length) });
      }
    };

    const fullPattern = /MML\s*@([\s\S]*?)\s*;/gi;
    let match;
    while ((match = fullPattern.exec(source))) addCandidate(match[1] || "", match.index);
    if (!found.length) {
      const keyedPattern = /(?:^|[\s<{,;])(?:[A-Za-z0-9_:-]*(?:mml|melody|chord|song|part|track)[A-Za-z0-9_:-]*)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\r\n<>]+))/gim;
      while ((match = keyedPattern.exec(source))) addCandidate(match[1] ?? match[2] ?? match[3] ?? "", match.index);
      const directMmlTagPattern = /<([A-Za-z0-9_:-]*mml[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
      while ((match = directMmlTagPattern.exec(source))) addCandidate(match[2] || "", match.index);
      const taggedPattern = /<([A-Za-z0-9_:-]*(?:melody|chord|song|part|track)[A-Za-z0-9_:-]*)\b[^>]*>([\s\S]*?)<\/\1>/gim;
      while ((match = taggedPattern.exec(source))) addCandidate(match[2] || "", match.index);
    }

    found.sort((left, right) => left.position - right.position);
    return found.map((candidate, index) => ({
      channelNumber: index + 1,
      label: formatChannelLabel(index + 1, candidate.name, nameOptions),
      name: candidate.name,
      value: candidate.value,
    }));
  }

  // ───────────────────────── 내보내기 ─────────────────────────

  const PARTS_PER_TRACK = 3;          // Melody, Chord 1, Chord 2 (Song 파트는 쓰지 않음)
  const DEFAULT_BPM = 120;
  const MIN_BPM = 1;
  const MAX_BPM = 1000;
  const NEWLINE = "\r\n";

  // 값 한 줄에 줄바꿈이 섞이면 파일 구조가 깨지므로 항상 한 줄로 정리한다.
  const singleLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

  // "t120o4c4..." 같은 한 보이스. 래퍼(MML@ ;)와 쉼표가 들어 있으면 벗겨내고 비어 있으면 null.
  function cleanVoice(value) {
    let text = String(value ?? "").trim();
    const wrapper = /^MML\s*@([\s\S]*?);?$/i.exec(text);
    if (wrapper) text = wrapper[1];
    text = text.replace(/[\s;]+/g, "").replace(/,+$/g, "");
    return text || null;
  }

  // 템포 목록 → "0T120,384T140" (틱 T BPM). 같은 틱은 마지막 값만 남기고, 0틱 템포가 없으면 채운다.
  function buildTempoLine(tempos) {
    const byTick = new Map();
    for (const tempo of Array.isArray(tempos) ? tempos : []) {
      const tick = Math.max(0, Math.round((Number(tempo?.beat) || 0) * TICKS_PER_BEAT));
      byTick.set(tick, clampInt(tempo?.bpm, MIN_BPM, MAX_BPM, DEFAULT_BPM));
    }
    if (!byTick.has(0)) {
      const first = [...byTick.keys()].sort((a, b) => a - b)[0];
      byTick.set(0, first == null ? DEFAULT_BPM : byTick.get(first));
    }
    return [...byTick.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tick, bpm]) => `${tick}T${bpm}`)
      .join(",");
  }

  // 보이스 배열을 트랙 단위(최대 3파트)로 나눈다.
  function splitTrack(track) {
    const voices = (Array.isArray(track?.voices) ? track.voices : [])
      .map(cleanVoice)
      .filter(Boolean);
    if (!voices.length) return [];
    const chunks = [];
    for (let index = 0; index < voices.length; index += PARTS_PER_TRACK) {
      chunks.push(voices.slice(index, index + PARTS_PER_TRACK));
    }
    return chunks.map((parts, chunkIndex) => ({
      name: singleLine(track.name) || "Track",
      suffix: chunks.length > 1 ? ` (${chunkIndex + 1}/${chunks.length})` : "",
      parts,
    }));
  }

  function build({ title = "", author = "", timeSignature = null, tempos = [], tracks = [] } = {}) {
    const lines = ["[mml-score]"];
    lines.push(`title=${singleLine(title)}`);
    lines.push(`author=${singleLine(author)}`);
    const numerator = clampInt(timeSignature?.numerator, 1, 64, 4);
    const denominator = clampInt(timeSignature?.denominator, 1, 64, 4);
    lines.push(`time=${numerator}/${denominator}`);
    lines.push(`tempo=${buildTempoLine(tempos)}`);

    let written = 0;
    for (const track of Array.isArray(tracks) ? tracks : []) {
      const program = clampInt(track?.program, 0, 127, 0);
      const panpot = clampInt(track?.panpot, 0, 127, 64);
      for (const chunk of splitTrack(track)) {
        lines.push(`mml-track=MML@${chunk.parts.join(",")};`);
        lines.push(`name=${chunk.name}${chunk.suffix}`);
        lines.push(`program=${program}`);
        lines.push("songProgram=-1");
        lines.push(`panpot=${panpot}`);
        lines.push("visible=true");
        written += 1;
      }
    }
    if (!written) throw new Error("내보낼 노트가 있는 트랙이 없습니다.");
    return lines.join(NEWLINE) + NEWLINE;
  }

  function toBlob(text) {
    return new Blob([String(text ?? "")], { type: "text/plain;charset=utf-8" });
  }

  function fileName(title, fallback = "mobibard") {
    const base = singleLine(title).replace(/[\\/:*?"<>|]/g, "_").replace(/\.mmi$/i, "").trim();
    return `${base || fallback}.mmi`;
  }


  window.MabiMmi = Object.freeze({
    TICKS_PER_BEAT,
    PART_ROLES,
    PARTS_PER_TRACK,
    normalizeLegacyLengths,
    cleanupMmlValue,
    cleanupNameValue,
    extractNameMarkers,
    findNameForCandidate,
    formatChannelLabel,
    extractCandidates,
    build,
    buildTempoLine,
    toBlob,
    fileName,
  });
})();
