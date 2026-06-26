(() => {
  "use strict";

  const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NOTE_NAMES = ["c", "c+", "d", "d+", "e", "f", "f+", "g", "g+", "a", "a+", "b"];
  const VALID_LENGTHS = [1, 2, 4, 8, 16, 32, 64];
  const DEFAULT_TEMPO = 120;
  const DEFAULT_VOLUME = 8;
  const DEFAULT_OCTAVE = 4;
  const DEFAULT_LENGTH = 4;
  // whole note = 1024 units. This keeps common dotted 64th-note values integer.
  const WHOLE_UNITS = 1024;
  const EPS = 1e-9;

  const L_STATES = VALID_LENGTHS.map(denom => ({ label: String(denom), units: durationUnits(denom, 0) }));
  const durationCandidateCache = new Map();
  const noteDurationCache = new Map();
  const restDurationCache = new Map();

  function optimizeMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    const outputParts = [];
    for (let i = 0; i < partCount; i++) {
      let events = parsedParts[i].events;
      if (i === 0) events = injectTempoEvents(events, tempoMap);
      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: i === 0 && hasAnyContent,
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return { mml, parts: outputParts, before, after, saved: before - after, tempoMap };
  }

  function optimizePart(text, options = {}) {
    const parsed = parsePart(String(text || ""), 0);
    const startTempo = options.includeTempo === false
      ? null
      : normalizeTempoEvents(parsed.tempos)[0]?.bpm || DEFAULT_TEMPO;
    const events = options.includeTempo === false ? parsed.events : injectTempoEvents(parsed.events, normalizeTempoEvents(parsed.tempos));
    const part = renderPart(events, {
      isMelody: options.includeTempo !== false,
      startTempo,
      forceHeader: Boolean(String(text || "").trim()),
      partIndex: 0
    });
    return { part, before: String(text || "").trim().length, after: part.length };
  }

  function trimShortRestsMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const threshold = normalizeRestTrimThreshold(options);
    const targetPartIndex = Number.isInteger(options.targetPartIndex)
      ? Math.max(0, Math.min(partCount - 1, options.targetPartIndex))
      : null;

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const hasAnyContent = parsedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());

    let removed = 0;
    let removedUnits = 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const shouldTrim = targetPartIndex == null || targetPartIndex === i;
      let events;
      if (shouldTrim) {
        const trimmed = absorbShortRests(parsedParts[i].events, threshold, tempoMap);
        events = trimmed.events;
        removed += trimmed.removed;
        removedUnits += trimmed.removedUnits;
      } else {
        events = mergeAdjacentRests(parsedParts[i].events);
      }

      // 템포 안쪽으로 늘어난 음표는 해당 템포 위치에서 tie로 나누어 둔다.
      // 실제 T 문자는 멜로디에만 들어가지만, 다른 파트도 같은 박자 지점에서
      // 음 길이가 나뉘어야 템포 변화 구간을 더 안전하게 보존할 수 있다.
      events = splitMarkedNotesAtTempoPositions(events, tempoMap);
      if (i === 0) events = injectTempoEvents(events, tempoMap);

      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: tempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: i === 0 && hasAnyContent,
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      removed,
      removedUnits,
      tempoMap
    };
  }


  function trimLeadingSilenceMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const firstNoteStart = findFirstNoteStart(parsedParts);
    if (!(firstNoteStart > EPS)) {
      const optimized = optimizeMml(text, { partCount });
      return { ...optimized, removedUnits: 0, removedBeats: 0 };
    }

    const shiftedParts = parsedParts.map(part => ({
      ...part,
      events: shiftEventsAfterTrim(part.events, firstNoteStart)
    }));
    const shiftedTempoMap = shiftTempoMapAfterTrim(tempoMap, firstNoteStart);
    const hasAnyContent = shiftedParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim()) || shiftedTempoMap.length > 0;
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      let events = shiftedParts[i].events;
      if (i === 0) events = injectTempoEvents(events, shiftedTempoMap);
      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: shiftedTempoMap[0]?.bpm || DEFAULT_TEMPO,
        forceHeader: i === 0 && hasAnyContent,
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      tempoMap: shiftedTempoMap,
      removedUnits: firstNoteStart,
      removedBeats: firstNoteStart / durationUnits(4, 0)
    };
  }

  function addLeadingSilenceMml(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const beats = Math.max(0, Number(options.beats ?? 8));
    const addUnits = Math.round(beats * durationUnits(4, 0));
    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const leadingUnits = findFirstNoteStart(parsedParts);
    const removeUnits = leadingUnits > EPS ? Math.round(leadingUnits) : 0;

    // "맨앞 무음 설정"은 누적 추가가 아니라 현재 첫 음 앞의 공통 무음을 먼저 제거한 뒤
    // 사용자가 지정한 길이만큼 T120 기준 무음을 새로 넣는 기능이다.
    const baseParts = removeUnits > 0
      ? parsedParts.map(part => ({
          ...part,
          events: shiftEventsAfterTrim(part.events, removeUnits)
        }))
      : parsedParts;
    const baseTempoMap = removeUnits > 0
      ? shiftTempoMapAfterTrim(tempoMap, removeUnits)
      : tempoMap;

    const renderBaseWithoutLeadingSilence = () => {
      const hasAnyContent = baseParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim()) || baseTempoMap.length > 0;
      const outputParts = [];
      for (let i = 0; i < partCount; i++) {
        let events = baseParts[i].events;
        if (i === 0) events = injectTempoEvents(events, baseTempoMap);
        outputParts.push(renderPart(events, {
          isMelody: i === 0,
          startTempo: baseTempoMap[0]?.bpm || DEFAULT_TEMPO,
          forceHeader: i === 0 && hasAnyContent,
          partIndex: i
        }));
      }
      return { outputParts, tempo: baseTempoMap };
    };

    if (addUnits <= 0) {
      const rendered = renderBaseWithoutLeadingSilence();
      const mml = composeMml(rendered.outputParts, { preserveEmpty: true, partCount });
      const before = countPartChars(sourceParts);
      const after = countPartChars(rendered.outputParts);
      return {
        mml,
        parts: rendered.outputParts,
        before,
        after,
        saved: before - after,
        tempoMap: rendered.tempo,
        addedUnits: 0,
        addedBeats: 0,
        removedLeadingUnits: removeUnits,
        removedLeadingBeats: removeUnits / durationUnits(4, 0)
      };
    }

    const shiftedTempoMap = buildTempoMapWithLeadingSilence(baseTempoMap, addUnits);
    const hasAnyContent = baseParts.some(p => p.events.length || p.tempos.length || String(p.raw || "").trim());
    const outputParts = [];

    for (let i = 0; i < partCount; i++) {
      const hasPartContent = baseParts[i].events.length || String(baseParts[i].raw || "").trim();
      let events = hasPartContent
        ? prependRestToEvents(baseParts[i].events, addUnits)
        : [];
      if (i === 0) events = injectTempoEvents(events, shiftedTempoMap);
      outputParts.push(renderPart(events, {
        isMelody: i === 0,
        startTempo: DEFAULT_TEMPO,
        forceHeader: i === 0 && (hasAnyContent || shiftedTempoMap.length > 0),
        partIndex: i
      }));
    }

    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    const before = countPartChars(sourceParts);
    const after = countPartChars(outputParts);
    return {
      mml,
      parts: outputParts,
      before,
      after,
      saved: before - after,
      tempoMap: shiftedTempoMap,
      addedUnits: addUnits,
      addedBeats: addUnits / durationUnits(4, 0),
      removedLeadingUnits: removeUnits,
      removedLeadingBeats: removeUnits / durationUnits(4, 0)
    };
  }


  function findFirstNoteStart(parsedParts) {
    let first = Infinity;
    for (const part of parsedParts || []) {
      for (const ev of part.events || []) {
        if (ev.type === "note") first = Math.min(first, ev.start);
      }
    }
    return Number.isFinite(first) ? Math.max(0, Math.round(first)) : 0;
  }

  function shiftEventsAfterTrim(events, trimUnits) {
    const out = [];
    for (const ev of events || []) {
      const start = Number(ev.start) || 0;
      const end = start + (Number(ev.duration) || 0);
      if (end <= trimUnits + EPS) continue;
      if (ev.type === "rest") {
        const newStart = Math.max(0, Math.round(start - trimUnits));
        const newEnd = Math.max(0, Math.round(end - trimUnits));
        if (newEnd > newStart + EPS) out.push({ type: "rest", start: newStart, duration: newEnd - newStart });
        continue;
      }
      if (ev.type === "note") {
        const newStart = Math.max(0, Math.round(start - trimUnits));
        const newEnd = Math.max(newStart, Math.round(end - trimUnits));
        if (newEnd > newStart + EPS) out.push({ ...ev, start: newStart, duration: newEnd - newStart });
      }
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function shiftTempoMapAfterTrim(tempoMap, trimUnits) {
    const current = tempoAt(tempoMap, trimUnits);
    const shifted = [{ pos: 0, bpm: current, order: -1 }];
    let order = 0;
    for (const t of tempoMap || []) {
      if (t.pos > trimUnits + EPS) shifted.push({ pos: Math.round(t.pos - trimUnits), bpm: t.bpm, order: order++ });
    }
    return normalizeTempoEvents(shifted);
  }

  function prependRestToEvents(events, addUnits) {
    const out = [{ type: "rest", start: 0, duration: addUnits }];
    for (const ev of events || []) {
      if (ev.type !== "note" && ev.type !== "rest") continue;
      out.push({ ...ev, start: Math.round((Number(ev.start) || 0) + addUnits) });
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function buildTempoMapWithLeadingSilence(tempoMap, addUnits) {
    const originalStartTempo = tempoAt(tempoMap, 0);
    const out = [{ pos: 0, bpm: DEFAULT_TEMPO, order: -2 }];
    let order = 0;
    if (originalStartTempo !== DEFAULT_TEMPO) out.push({ pos: addUnits, bpm: originalStartTempo, order: order++ });
    for (const t of tempoMap || []) {
      if (t.pos <= EPS) continue;
      out.push({ pos: Math.round(t.pos + addUnits), bpm: t.bpm, order: order++ });
    }
    return normalizeTempoEvents(out);
  }


  function splitMmlPages(text, options = {}) {
    const partCount = Math.max(1, Math.min(6, options.partCount || 6));
    const maxChars = Math.max(200, Math.round(Number(options.maxChars || options.maxPartChars || 2400)));
    // 이전의 "200자 안쪽" 탐색 범위를, 요청대로 목표 글자 수의 절반으로 둔다.
    const searchSlackChars = Math.max(0, Math.round(Number(options.searchSlackChars ?? (maxChars / 2))));
    const minCommonSilenceUnits = Math.max(0, Math.round(Number(options.minCommonSilenceBeats ?? 2) * durationUnits(4, 0)));
    const maxPages = Math.max(1, Math.min(200, Math.round(Number(options.maxPages || 120))));

    const sourceParts = splitMmlPartsStrict(text).slice(0, partCount);
    while (sourceParts.length < partCount) sourceParts.push("");

    const parsedParts = sourceParts.map((part, index) => parsePart(part, index, { mergeRests: false }));
    const tempoMap = normalizeTempoEvents(parsedParts.flatMap(p => p.tempos));
    const totalUnits = Math.max(
      0,
      ...parsedParts.map(p => partMusicalEnd(p.events)),
      ...tempoMap.map(t => t.pos || 0)
    );

    if (totalUnits <= EPS) {
      const optimized = optimizeMml(text, { partCount });
      return {
        pages: [{
          index: 1,
          mml: optimized.mml,
          parts: optimized.parts,
          lengths: optimized.parts.map(p => p.length),
          maxPartLength: Math.max(0, ...optimized.parts.map(p => p.length)),
          start: 0,
          end: 0,
          nextStart: 0,
          skippedUnits: 0,
          reason: "empty",
          warning: ""
        }],
        maxChars,
        searchSlackChars,
        minCommonSilenceUnits,
        totalUnits,
        warnings: []
      };
    }

    const pages = [];
    const warnings = [];
    let pageStart = 0;
    let guard = 0;

    while (pageStart < totalUnits - EPS && guard++ < maxPages) {
      const cut = choosePageCut(parsedParts, tempoMap, pageStart, totalUnits, {
        partCount,
        maxChars,
        searchSlackChars,
        minCommonSilenceUnits
      });

      let pageEnd = Math.max(pageStart, Math.min(totalUnits, cut.end));
      let nextStart = Math.max(pageEnd, Math.min(totalUnits, cut.nextStart));
      if (pageEnd <= pageStart + EPS && totalUnits > pageStart + EPS) {
        pageEnd = Math.min(totalUnits, pageStart + durationUnits(4, 0));
        nextStart = pageEnd;
        cut.reason = "forced";
        cut.warning = "분할 가능한 위치가 너무 가까워 강제로 1박자 뒤에서 잘랐습니다.";
      }

      const rendered = renderPageSegment(parsedParts, tempoMap, pageStart, pageEnd, partCount);
      const page = {
        index: pages.length + 1,
        mml: rendered.mml,
        parts: rendered.parts,
        lengths: rendered.lengths,
        maxPartLength: Math.max(0, ...rendered.lengths),
        start: pageStart,
        end: pageEnd,
        nextStart,
        skippedUnits: Math.max(0, nextStart - pageEnd),
        reason: cut.reason,
        warning: cut.warning || ""
      };
      pages.push(page);
      if (page.maxPartLength > maxChars) {
        warnings.push(`${page.index}번 악보의 가장 긴 채널이 ${page.maxPartLength}자로 제한 ${maxChars}자를 넘었습니다.`);
      }
      if (page.warning) warnings.push(`${page.index}번 악보: ${page.warning}`);

      if (nextStart <= pageStart + EPS) break;
      pageStart = nextStart;
    }

    if (guard >= maxPages && pageStart < totalUnits - EPS) {
      warnings.push("페이지 수가 너무 많아 분할을 중단했습니다.");
    }

    return {
      pages,
      maxChars,
      searchSlackChars,
      minCommonSilenceUnits,
      totalUnits,
      warnings
    };
  }

  function choosePageCut(parsedParts, tempoMap, pageStart, totalUnits, options) {
    const { partCount, maxChars, searchSlackChars, minCommonSilenceUnits } = options;
    const measureCache = new Map();
    const measure = (end) => {
      const key = String(Math.round(end));
      if (!measureCache.has(key)) {
        const safeEnd = Math.max(pageStart, Math.min(totalUnits, Math.round(end)));
        try {
          const rendered = renderPageSegment(parsedParts, tempoMap, pageStart, safeEnd, partCount);
          measureCache.set(key, {
            end: safeEnd,
            maxLen: Math.max(0, ...rendered.lengths),
            lengths: rendered.lengths
          });
        } catch (_) {
          measureCache.set(key, {
            end: safeEnd,
            maxLen: Infinity,
            lengths: []
          });
        }
      }
      return measureCache.get(key);
    };

    const wholeEstimate = estimatePageMaxLength(parsedParts, pageStart, totalUnits);
    if (wholeEstimate <= maxChars) {
      const whole = measure(totalUnits);
      if (whole.maxLen <= maxChars) {
        return { end: totalUnits, nextStart: totalUnits, reason: "last", warning: "" };
      }
    }

    const candidateEnds = collectBoundaryPoints(parsedParts, pageStart, totalUnits)
      .filter(pos => pos > pageStart + EPS && pos <= totalUnits + EPS)
      .sort((a, b) => a - b);
    if (!candidateEnds.length || candidateEnds[candidateEnds.length - 1] !== Math.round(totalUnits)) {
      candidateEnds.push(Math.round(totalUnits));
    }

    let bestIdx = findEstimatedBestIndex(parsedParts, pageStart, candidateEnds, maxChars);
    if (bestIdx < 0) bestIdx = 0;

    // 실제 렌더링은 비싸므로, 추정값으로 잡은 근처만 확인한다.
    // 초과하면 이분 탐색으로 앞으로 당기고, 여유가 크면 몇 번만 뒤로 늘린다.
    if (measure(candidateEnds[bestIdx]).maxLen > maxChars) {
      let loFit = -1;
      let hiFail = bestIdx;
      while (hiFail - loFit > 1) {
        const mid = Math.floor((loFit + hiFail) / 2);
        if (measure(candidateEnds[mid]).maxLen <= maxChars) loFit = mid;
        else hiFail = mid;
      }
      bestIdx = Math.max(0, loFit);
    }

    const bestEnd = Math.max(pageStart + 1, Math.min(candidateEnds[bestIdx], totalUnits));
    const lowerTarget = Math.max(0, maxChars - searchSlackChars);
    const bestMeasure = measure(bestEnd);
    const targetReachable = bestMeasure.maxLen >= lowerTarget;

    // 분할 지점 탐색은 반드시 "제한 글자 수에 가까운 영역" 안에서만 한다.
    // 예: 제한 2400자라면 searchSlackChars 기본값은 1200자이고,
    // 실제 렌더링 기준으로 1200자 이상이 되는 첫 후보부터 2400자 이하의 마지막 후보까지만 탐색한다.
    // 예전 로직은 이 범위 안에서 2박 무음을 못 찾으면 초반 무음으로 되돌아가는 fallback이 있어서
    // 100자대 악보가 먼저 잘리는 문제가 있었다.
    const minSearchEnd = targetReachable
      ? findEarliestCandidateAtLeastLength(measure, candidateEnds, bestIdx, lowerTarget)
      : null;
    const searchStart = targetReachable && minSearchEnd ? minSearchEnd : pageStart + 1;
    const searchEnd = bestEnd;

    const commonSilences = getCommonSilenceIntervals(parsedParts, pageStart, bestEnd)
      .filter(iv => iv.end > pageStart + EPS && iv.start > pageStart + EPS && iv.start <= searchEnd + EPS)
      .map(iv => ({
        start: Math.max(pageStart + 1, Math.round(iv.start)),
        end: Math.max(pageStart + 1, Math.round(iv.end)),
        duration: Math.max(0, Math.round(iv.end - iv.start))
      }))
      .filter(iv => iv.start >= searchStart - EPS && iv.start <= searchEnd + EPS);

    const goodSilence = pickSilenceCandidate(commonSilences, measure, maxChars, lowerTarget, minCommonSilenceUnits, targetReachable, searchStart, searchEnd);
    if (goodSilence) {
      return { end: goodSilence.start, nextStart: Math.max(goodSilence.end, goodSilence.start), reason: "common-silence", warning: "" };
    }

    const anySilence = pickSilenceCandidate(commonSilences, measure, maxChars, lowerTarget, 1, targetReachable, searchStart, searchEnd);
    if (anySilence) {
      return {
        end: anySilence.start,
        nextStart: Math.max(anySilence.end, anySilence.start),
        reason: "longest-silence",
        warning: anySilence.duration < minCommonSilenceUnits ? "2박 이상 공통 무음이 없어 가장 긴 공통 무음에서 나눴습니다." : ""
      };
    }

    const bestSafeChannels = countSafeChannelsAt(parsedParts, bestEnd);
    if (bestSafeChannels >= parsedParts.length && measure(bestEnd).maxLen <= maxChars) {
      return { end: bestEnd, nextStart: bestEnd, reason: "clean-boundary", warning: "" };
    }

    const clean = pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, true, searchStart, searchEnd);
    if (clean) return { end: clean.pos, nextStart: clean.pos, reason: "clean-boundary", warning: "" };

    if (measure(bestEnd).maxLen <= maxChars) {
      return {
        end: bestEnd,
        nextStart: bestEnd,
        reason: "partial-boundary",
        warning: `모든 채널이 안전하게 나뉘는 지점을 찾지 못해 ${bestSafeChannels}/${partCount}개 채널이 안전한 지점에서 잘랐습니다.`
      };
    }

    const fallback = pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, false, searchStart, searchEnd);
    if (fallback) {
      return {
        end: fallback.pos,
        nextStart: fallback.pos,
        reason: "partial-boundary",
        warning: `모든 채널이 안전하게 나뉘는 지점을 찾지 못해 ${fallback.safeChannels}/${partCount}개 채널이 안전한 지점에서 잘랐습니다.`
      };
    }

    return {
      end: bestEnd,
      nextStart: bestEnd,
      reason: "char-limit",
      warning: "적절한 분할 지점을 찾지 못해 글자 수 기준으로 잘랐습니다. 일부 음이 잘릴 수 있습니다."
    };
  }


  function findEstimatedBestIndex(parsedParts, pageStart, candidates, maxChars) {
    let lo = 0;
    let hi = candidates.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const est = estimatePageMaxLength(parsedParts, pageStart, candidates[mid]);
      if (est <= maxChars) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function findEarliestEstimatedCandidateAtLeastLength(parsedParts, pageStart, candidates, bestIdx, targetLen) {
    if (!targetLen || bestIdx < 0 || estimatePageMaxLength(parsedParts, pageStart, candidates[bestIdx]) < targetLen) return null;
    let lo = 0;
    let hi = bestIdx;
    let ans = candidates[bestIdx];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const est = estimatePageMaxLength(parsedParts, pageStart, candidates[mid]);
      if (est >= targetLen) {
        ans = candidates[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function estimatePageMaxLength(parsedParts, start, end) {
    let max = 0;
    for (const part of parsedParts || []) {
      let count = 0;
      let gaps = 0;
      let lastEnd = 0;
      for (const ev of part.events || []) {
        if (ev.type !== "note") continue;
        const evEnd = ev.start + ev.duration;
        if (ev.start < start - EPS || ev.start >= end - EPS || evEnd <= start + EPS) continue;
        const localStart = Math.max(0, ev.start - start);
        if (localStart > lastEnd + EPS) gaps++;
        count++;
        lastEnd = Math.max(lastEnd, Math.min(evEnd, end) - start);
      }
      if (count || gaps) {
        // 실제 최적화는 반복 길이/옥타브/볼륨을 꽤 줄이므로 보수적인 근사만 사용한다.
        max = Math.max(max, 10 + count * 1.35 + gaps * 2.4);
      }
    }
    return max;
  }

  function findEarliestCandidateAtLeastLength(measure, candidates, bestIdx, targetLen) {
    if (!targetLen || bestIdx < 0 || measure(candidates[bestIdx]).maxLen < targetLen) return null;
    let lo = 0;
    let hi = bestIdx;
    let ans = candidates[bestIdx];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const m = measure(candidates[mid]);
      if (m.maxLen >= targetLen) {
        ans = candidates[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }

  function pickSilenceCandidate(intervals, measure, maxChars, lowerTarget, minDuration, requireLower, searchStart, searchEnd) {
    let best = null;
    for (const iv of intervals) {
      if (iv.duration < minDuration) continue;
      if (iv.start < searchStart - EPS || iv.start > searchEnd + EPS) continue;
      const m = measure(iv.start);
      if (m.maxLen > maxChars) continue;
      if (requireLower && m.maxLen < lowerTarget) continue;
      const score = {
        lenScore: m.maxLen,
        duration: iv.duration,
        start: iv.start
      };
      if (!best
        || score.lenScore > best.score.lenScore
        || (score.lenScore === best.score.lenScore && score.duration > best.score.duration)
        || (score.lenScore === best.score.lenScore && score.duration === best.score.duration && score.start > best.score.start)) {
        best = { ...iv, score };
      }
    }
    return best;
  }

  function pickBoundaryCandidate(parsedParts, pageStart, bestEnd, measure, maxChars, lowerTarget, requireAllSafe, searchStart, searchEnd) {
    const points = collectBoundaryPoints(parsedParts, pageStart, bestEnd);
    let best = null;
    const targetReachable = measure(bestEnd).maxLen >= lowerTarget;
    for (const pos of points) {
      if (pos <= pageStart + EPS || pos > bestEnd + EPS) continue;
      const m = measure(pos);
      if (m.maxLen > maxChars) continue;
      if (targetReachable && (pos < searchStart - EPS || m.maxLen < lowerTarget)) continue;
      const safeChannels = countSafeChannelsAt(parsedParts, pos);
      if (requireAllSafe && safeChannels < parsedParts.length) continue;
      const score = { safeChannels, lenScore: m.maxLen, pos };
      if (!best
        || score.safeChannels > best.score.safeChannels
        || (score.safeChannels === best.score.safeChannels && score.lenScore > best.score.lenScore)
        || (score.safeChannels === best.score.safeChannels && score.lenScore === best.score.lenScore && score.pos > best.score.pos)) {
        best = { pos, safeChannels, score };
      }
    }
    return best;
  }

  function renderPageSegment(parsedParts, tempoMap, start, end, partCount) {
    start = Math.max(0, Math.round(start));
    end = Math.max(start, Math.round(end));
    const currentTempo = tempoAt(tempoMap, start);
    const relTempoMap = [{ pos: 0, bpm: currentTempo }];
    for (const t of tempoMap || []) {
      if (t.pos > start + EPS && t.pos < end - EPS) relTempoMap.push({ pos: Math.round(t.pos - start), bpm: t.bpm });
    }
    const hasAnyNotes = parsedParts.some(p => (p.events || []).some(ev => ev.type === "note" && ev.start >= start - EPS && ev.start < end - EPS));
    const hasTempoInside = relTempoMap.length > 1;
    const outputParts = [];
    for (let i = 0; i < partCount; i++) {
      let events = buildPartSegmentEvents(parsedParts[i]?.events || [], start, end);
      if (i === 0) events = injectTempoEvents(events, relTempoMap);
      outputParts.push(renderPartFast(events, {
        isMelody: i === 0,
        startTempo: currentTempo,
        forceHeader: i === 0 && (hasAnyNotes || hasTempoInside),
        partIndex: i
      }));
    }
    const mml = composeMml(outputParts, { preserveEmpty: true, partCount });
    return { mml, parts: outputParts, lengths: outputParts.map(part => String(part || "").length) };
  }

  function buildPartSegmentEvents(events, start, end) {
    const notes = (events || [])
      .filter(ev => ev.type === "note")
      .map(ev => ({ ...ev, end: ev.start + ev.duration }))
      .filter(ev => ev.start >= start - EPS && ev.start < end - EPS && ev.end > start + EPS)
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
    const out = [];
    let cursor = 0;
    for (const note of notes) {
      const localStart = Math.max(0, Math.round(note.start - start));
      if (localStart > cursor) {
        out.push({ type: "rest", start: cursor, duration: localStart - cursor });
        cursor = localStart;
      }
      const clippedEnd = Math.min(note.end, end);
      const dur = Math.max(0, Math.round(clippedEnd - note.start));
      if (dur <= 0) continue;
      out.push({ type: "note", start: cursor, duration: dur, midi: note.midi, volume: note.volume });
      cursor += dur;
    }
    return mergeAdjacentRests(normalizeEventStarts(out));
  }

  function tempoAt(tempoMap, pos) {
    let bpm = DEFAULT_TEMPO;
    for (const t of tempoMap || []) {
      if (t.pos <= pos + EPS) bpm = t.bpm;
      else break;
    }
    return bpm;
  }

  function partMusicalEnd(events) {
    let end = 0;
    for (const ev of events || []) {
      if (ev.type === "note" || ev.type === "rest") end = Math.max(end, ev.start + ev.duration);
    }
    return end;
  }

  function collectAllNotes(parsedParts) {
    const notes = [];
    for (let p = 0; p < parsedParts.length; p++) {
      for (const ev of parsedParts[p].events || []) {
        if (ev.type === "note") notes.push({ part: p, start: ev.start, end: ev.start + ev.duration, midi: ev.midi });
      }
    }
    return notes;
  }

  function getCommonSilenceIntervals(parsedParts, from, to) {
    const intervals = collectAllNotes(parsedParts)
      .map(n => ({ start: Math.max(from, n.start), end: Math.min(to, n.end) }))
      .filter(n => n.end > from + EPS && n.start < to - EPS && n.end > n.start + EPS)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const gaps = [];
    let cursor = from;
    for (const iv of intervals) {
      if (iv.start > cursor + EPS) gaps.push({ start: cursor, end: iv.start });
      cursor = Math.max(cursor, iv.end);
    }
    if (cursor < to - EPS) gaps.push({ start: cursor, end: to });
    return gaps;
  }

  function collectBoundaryPoints(parsedParts, from, to) {
    const set = new Set([Math.round(to)]);
    for (const n of collectAllNotes(parsedParts)) {
      if (n.start > from + EPS && n.start < to + EPS) set.add(Math.round(n.start));
      if (n.end > from + EPS && n.end < to + EPS) set.add(Math.round(n.end));
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  function countSafeChannelsAt(parsedParts, pos) {
    let safe = 0;
    for (const p of parsedParts) {
      const active = (p.events || []).some(ev => ev.type === "note" && ev.start < pos - EPS && ev.start + ev.duration > pos + EPS);
      if (!active) safe++;
    }
    return safe;
  }

  function splitMmlPartsStrict(text) {
    let s = String(text || "").replace(/^\uFEFF/, "").trim();
    const m = s.match(/^\s*MML\s*@([\s\S]*?)\s*;?\s*$/i);
    if (m) s = m[1];
    if (/\[|\]/.test(s)) throw new Error("마비노기 MML에서는 [] 표기를 사용할 수 없습니다.");
    if (s === "") return [];
    return s.split(",").map(part => normalizeCommandCase(part.trim()));
  }

  function composeMml(parts, options = {}) {
    const raw = Array.from(parts || []).map(x => String(x || "").trim());
    const list = options.preserveEmpty ? raw.slice(0, options.partCount || raw.length || 0) : raw.filter(Boolean);
    return `MML@${list.join(",")};`;
  }

  function normalizeCommandCase(text) {
    return String(text || "").replace(/[A-Za-z]/g, ch => {
      const lower = ch.toLowerCase();
      if ("tolv".includes(lower)) return lower.toUpperCase();
      if ("rnabcdefg".includes(lower)) return lower;
      return ch;
    });
  }

  function parsePart(input, partIndex, options = {}) {
    const s = normalizeCommandCase(String(input || "").replace(/^\s*MML\s*@/i, "").replace(/;\s*$/g, "").trim());
    let i = 0;
    let pos = 0;
    let octave = DEFAULT_OCTAVE;
    let defaultUnits = durationUnits(DEFAULT_LENGTH, 0);
    let volume = DEFAULT_VOLUME;
    let order = 0;
    let pendingTie = false;
    let lastTieTarget = null;
    const events = [];
    const tempos = [];

    const fail = message => { throw new Error(`${partIndex + 1}파트: ${message}`); };
    const skipSpace = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readNumber = () => {
      const start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      return i > start ? { value: Number(s.slice(start, i)), text: s.slice(start, i) } : null;
    };
    const readDotsCount = () => {
      let dots = 0;
      while (s[i] === ".") { dots++; i++; }
      return dots;
    };
    const readLengthUnits = () => {
      const n = readNumber();
      const dots = readDotsCount();
      if (!n) return durationUnitsFromBase(defaultUnits, dots);
      if (!VALID_LENGTHS.includes(n.value)) fail(`길이 ${n.value}은 지원하지 않습니다. 1,2,4,8,16,32,64를 사용해 주세요.`);
      return durationUnits(n.value, dots);
    };
    const readNoteToken = () => {
      skipSpace();
      const ch = s[i]?.toLowerCase();
      if (!(ch in NOTE_BASE) && ch !== "r" && ch !== "n") return null;
      if (ch === "r") {
        i++;
        return { kind: "rest", duration: readLengthUnits() };
      }
      if (ch === "n") {
        i++;
        const num = readNumber();
        if (!num) fail("N 뒤에 음 번호가 필요합니다.");
        if (num.value < 0 || num.value > 127) fail(`N${num.value}은 지원 범위를 벗어났습니다.`);
        const duration = durationUnitsFromBase(defaultUnits, readDotsCount());
        if (num.value === 0) return { kind: "rest", duration };
        return { kind: "note", midi: num.value, duration, volume };
      }
      i++;
      let semitone = NOTE_BASE[ch];
      if (s[i] === "+" || s[i] === "#") { semitone++; i++; }
      else if (s[i] === "-") { semitone--; i++; }
      const midi = (octave + 1) * 12 + semitone;
      const duration = readLengthUnits();
      return { kind: "note", midi, duration, volume };
    };
    const appendToken = token => {
      if (!isIntegerLike(token.duration) || token.duration <= 0) {
        fail("64분음표보다 더 작은 소수 길이는 현재 최적화할 수 없습니다.");
      }
      token.duration = Math.round(token.duration);

      if (pendingTie) {
        if (!lastTieTarget) fail("& 앞에 이어질 음표가 필요합니다.");
        if (lastTieTarget.kind !== token.kind || lastTieTarget.midi !== token.midi) fail("&는 같은 음끼리만 이어 주세요.");
        lastTieTarget.event.duration += token.duration;
        pos += token.duration;
        pendingTie = false;
        return;
      }

      const ev = token.kind === "note"
        ? { type: "note", start: pos, duration: token.duration, midi: token.midi, volume: token.volume }
        : { type: "rest", start: pos, duration: token.duration };
      events.push(ev);
      pos += token.duration;
      lastTieTarget = { kind: token.kind, midi: token.midi, event: ev };
    };

    while (i < s.length) {
      skipSpace();
      if (i >= s.length) break;
      const raw = s[i];
      const ch = raw.toLowerCase();

      if (ch in NOTE_BASE || ch === "r" || ch === "n") {
        appendToken(readNoteToken());
      } else if (ch === "&") {
        i++;
        if (!lastTieTarget) fail("& 앞에 이어질 음표가 필요합니다.");
        if (pendingTie) fail("&가 연속으로 나왔습니다.");
        pendingTie = true;
      } else if (ch === "t") {
        i++;
        const n = readNumber();
        if (!n) fail("T 뒤에 숫자가 필요합니다.");
        if (n.value < 32 || n.value > 255) fail(`T${n.value}은 지원 범위를 벗어났습니다.`);
        tempos.push({ pos, bpm: n.value, part: partIndex, order: partIndex * 100000000 + order++ });
      } else if (ch === "o") {
        i++;
        const n = readNumber();
        if (!n) fail("O 뒤에 숫자가 필요합니다.");
        if (n.value < 0 || n.value > 9) fail(`O${n.value}은 지원 범위를 벗어났습니다.`);
        octave = n.value;
      } else if (ch === "l") {
        i++;
        const n = readNumber();
        const dots = readDotsCount();
        if (!n || !VALID_LENGTHS.includes(n.value)) fail("L은 1,2,4,8,16,32,64 중 하나를 사용해 주세요.");
        defaultUnits = durationUnits(n.value, dots);
        if (!isIntegerLike(defaultUnits)) fail("현재 최적화할 수 없는 L 점음표 길이입니다.");
        defaultUnits = Math.round(defaultUnits);
      } else if (ch === "v") {
        i++;
        const n = readNumber();
        if (!n) fail("V 뒤에 숫자가 필요합니다.");
        if (n.value < 0 || n.value > 15) fail(`V${n.value}는 지원 범위를 벗어났습니다.`);
        volume = n.value;
      } else if (raw === ">") {
        i++;
        octave++;
        if (octave > 9) fail("옥타브가 너무 높습니다.");
      } else if (raw === "<") {
        i++;
        octave--;
        if (octave < 0) fail("옥타브가 너무 낮습니다.");
      } else if (raw === ";") {
        i++;
        break;
      } else {
        fail(`알 수 없는 문자 '${raw}'가 있습니다.`);
      }
    }
    if (pendingTie) fail("& 뒤에 이어질 음표가 필요합니다.");

    return { raw: s, events: options.mergeRests === false ? normalizeEventStarts(events) : mergeAdjacentRests(events), tempos, length: pos };
  }

  function mergeAdjacentRests(events) {
    const out = [];
    for (const ev of events) {
      const last = out[out.length - 1];
      if (ev.type === "rest" && last?.type === "rest" && !ev.preTempos?.length && !last.preTempos?.length) {
        last.duration += ev.duration;
      } else {
        out.push({ ...ev });
      }
    }
    let pos = 0;
    for (const ev of out) { ev.start = pos; pos += ev.duration; }
    return out;
  }

  function normalizeRestTrimThreshold(options = {}) {
    if (options.all || String(options.denom || options.threshold || "").toLowerCase() === "all") {
      return { all: true, units: Infinity, denom: null };
    }
    const denom = Number(options.denom ?? options.thresholdDenom ?? options.threshold ?? 32);
    if (!VALID_LENGTHS.includes(denom) || denom < 4) {
      throw new Error("쉼표 삭제 기준은 all, 4, 8, 16, 32, 64 중 하나여야 합니다.");
    }
    return { all: false, units: durationUnits(denom, 0), denom };
  }

  function absorbShortRests(events, threshold, tempoMap = []) {
    const out = [];
    let lastAbsorbableNote = null;
    let removed = 0;
    let removedUnits = 0;

    for (const source of events || []) {
      const ev = { ...source };
      if (ev.type === "note") {
        delete ev.extendedByRest;
        out.push(ev);
        lastAbsorbableNote = ev;
        continue;
      }

      if (ev.type === "rest") {
        const canDelete = threshold.all || (Number.isFinite(ev.duration) && ev.duration <= threshold.units + EPS);
        if (canDelete && lastAbsorbableNote) {
          lastAbsorbableNote.duration += ev.duration;
          lastAbsorbableNote.extendedByRest = true;
          lastAbsorbableNote.crossesTempoAfterRestTrim = noteCrossesTempo(lastAbsorbableNote, tempoMap);
          removed++;
          removedUnits += ev.duration;
          continue;
        }
        out.push(ev);
        lastAbsorbableNote = null;
        continue;
      }

      out.push(ev);
      lastAbsorbableNote = null;
    }

    return {
      events: mergeAdjacentRests(normalizeEventStarts(out)),
      removed,
      removedUnits
    };
  }

  function noteCrossesTempo(ev, tempoMap = []) {
    if (!ev || ev.type !== "note") return false;
    const start = Number(ev.start) || 0;
    const end = start + (Number(ev.duration) || 0);
    return (tempoMap || []).some(t => t.pos > start + EPS && t.pos < end - EPS);
  }

  function splitMarkedNotesAtTempoPositions(events, tempoMap = []) {
    const tempos = (tempoMap || []).filter(t => t.pos > 0).sort((a, b) => a.pos - b.pos);
    if (!tempos.length) return normalizeEventStarts((events || []).map(stripEditFlags));

    const out = [];
    for (const source of events || []) {
      const ev = { ...source };
      if (ev.type !== "note" || !ev.extendedByRest) {
        out.push(stripEditFlags(ev));
        continue;
      }

      const start = ev.start;
      const end = ev.start + ev.duration;
      const cuts = tempos.map(t => t.pos).filter(pos => pos > start + EPS && pos < end - EPS);
      if (!cuts.length) {
        out.push(stripEditFlags(ev));
        continue;
      }

      let cursor = start;
      let first = true;
      for (const cut of cuts.concat(end)) {
        const duration = cut - cursor;
        if (duration > EPS) {
          const segment = stripEditFlags({ ...ev, start: cursor, duration });
          if (!first) segment.tieFromPrev = true;
          out.push(segment);
          first = false;
        }
        cursor = cut;
      }
    }
    return normalizeEventStarts(out);
  }

  function stripEditFlags(ev) {
    const copy = { ...ev };
    delete copy.extendedByRest;
    delete copy.crossesTempoAfterRestTrim;
    return copy;
  }

  function normalizeTempoEvents(events) {
    const sorted = [...events].sort((a, b) => a.pos - b.pos || a.order - b.order || a.part - b.part);
    const byPos = [];
    for (const ev of sorted) {
      const last = byPos[byPos.length - 1];
      if (last && last.pos === ev.pos) {
        last.bpm = ev.bpm;
        last.order = ev.order;
      } else {
        byPos.push({ pos: ev.pos, bpm: ev.bpm, order: ev.order });
      }
    }
    if (!byPos.length || byPos[0].pos !== 0) byPos.unshift({ pos: 0, bpm: DEFAULT_TEMPO, order: -1 });
    const out = [];
    for (const ev of byPos) {
      const last = out[out.length - 1];
      if (last && last.bpm === ev.bpm) continue;
      out.push({ pos: ev.pos, bpm: ev.bpm });
    }
    return out;
  }

  function injectTempoEvents(events, tempoMap) {
    const tempos = (tempoMap || []).filter(t => t.pos > 0).sort((a, b) => a.pos - b.pos);
    if (!tempos.length) return mergeAdjacentRests(events.map(e => ({ ...e })));

    const result = [];
    let ti = 0;
    const pushTempoOnly = bpm => result.push({ type: "tempo", preTempos: [bpm], start: currentLength(result), duration: 0 });

    for (const source of events) {
      let ev = { ...source };
      let localStart = ev.start;
      let left = ev.duration;

      while (ti < tempos.length && tempos[ti].pos <= localStart) {
        const bpm = tempos[ti++].bpm;
        const last = result[result.length - 1];
        if (last) last.postTempos = [...(last.postTempos || []), bpm];
        else pushTempoOnly(bpm);
      }

      while (ti < tempos.length && tempos[ti].pos > localStart && tempos[ti].pos < localStart + left) {
        const tempo = tempos[ti++];
        const firstDur = tempo.pos - localStart;
        if (firstDur > 0) result.push(copyEventSegment(ev, localStart, firstDur, false));
        const secondDur = localStart + left - tempo.pos;
        ev = copyEventSegment(ev, tempo.pos, secondDur, ev.type === "note");
        ev.preTempos = [...(ev.preTempos || []), tempo.bpm];
        localStart = tempo.pos;
        left = secondDur;
      }

      if (left > 0) result.push(copyEventSegment(ev, localStart, left, Boolean(ev.tieFromPrev)));
    }

    let end = events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
    while (ti < tempos.length) {
      const tempo = tempos[ti++];
      if (tempo.pos > end) {
        result.push({ type: "rest", start: end, duration: tempo.pos - end });
        end = tempo.pos;
      }
      const last = result[result.length - 1];
      if (last) last.postTempos = [...(last.postTempos || []), tempo.bpm];
      else pushTempoOnly(tempo.bpm);
    }

    return normalizeEventStarts(result);
  }

  function copyEventSegment(ev, start, duration, tieFromPrev) {
    const copy = { ...ev, start, duration };
    delete copy.postTempos;
    if (tieFromPrev) copy.tieFromPrev = true;
    else delete copy.tieFromPrev;
    return copy;
  }

  function normalizeEventStarts(events) {
    const out = [];
    let pos = 0;
    for (const ev of events) {
      if (ev.type === "tempo") {
        out.push({ ...ev, start: pos });
        continue;
      }
      const copy = { ...ev, start: pos };
      out.push(copy);
      pos += copy.duration;
      if (ev.postTempos?.length) {
        out.push({ type: "tempo", start: pos, duration: 0, preTempos: ev.postTempos.slice() });
      }
    }
    return out;
  }

  function currentLength(events) {
    return events.reduce((pos, ev) => pos + (ev.duration || 0), 0);
  }


  function renderPartFast(events, options) {
    const musicalEvents = events.filter(ev => ev.type === "note" || ev.type === "rest");
    const firstNote = musicalEvents.find(ev => ev.type === "note");
    const initVolume = firstNote ? clamp(firstNote.volume, 0, 15) : DEFAULT_VOLUME;
    const initOctave = firstNote ? midiToOctave(firstNote.midi) : DEFAULT_OCTAVE;
    const hasAnything = options.forceHeader || musicalEvents.length || events.some(ev => ev.type === "tempo" || ev.preTempos?.length || ev.postTempos?.length);
    if (!hasAnything) return "";

    const initialL = chooseFastInitialL(musicalEvents);
    let currentVolume = initVolume;
    let currentOctave = initOctave;
    let out = `${options.isMelody ? `T${options.startTempo || DEFAULT_TEMPO}` : ""}V${initVolume}O${initOctave}L${initialL.label}`;

    for (const ev of events) {
      if (ev.type === "tempo") {
        out += renderTempoList(ev.preTempos);
        continue;
      }
      const preTempo = renderTempoList(ev.preTempos);
      if (ev.tieFromPrev) out += "&";
      out += preTempo;
      if (ev.type === "rest") {
        out += renderRestDuration(ev.duration, initialL.units);
        continue;
      }
      if (ev.type === "note") {
        const vol = clamp(ev.volume, 0, 15);
        let command = "";
        if (vol !== currentVolume) {
          command += `V${vol}`;
          currentVolume = vol;
        }
        const pitch = renderPitch(ev.midi, currentOctave);
        command += pitch.prefix;
        currentOctave = pitch.octave;
        out += renderNoteDuration(command + pitch.symbol, pitch.symbol, ev.duration, initialL.units);
      }
    }
    return out;
  }

  function chooseFastInitialL(events) {
    const musical = (events || []).filter(ev => ev.type === "note" || ev.type === "rest");
    if (!musical.length) return L_STATES.find(x => x.label === String(DEFAULT_LENGTH)) || L_STATES[0];
    let best = null;
    for (const l of L_STATES) {
      let score = 0;
      for (const ev of musical) {
        try {
          score += ev.type === "rest"
            ? renderRestDuration(ev.duration, l.units).length
            : renderNoteDuration("c", "c", ev.duration, l.units).length;
        } catch (_) {
          score += 9999;
        }
      }
      // 짧은 악보에서는 기본 선언 길이 차이가 그대로 체감되므로 라벨 길이도 더한다.
      score += String(l.label).length;
      if (!best || score < best.score || (score === best.score && Number(l.label) < Number(best.label))) {
        best = { ...l, score };
      }
    }
    return best || L_STATES[0];
  }

  function renderPart(events, options) {
    const musicalEvents = events.filter(ev => ev.type === "note" || ev.type === "rest");
    const firstNote = musicalEvents.find(ev => ev.type === "note");
    const initVolume = firstNote ? clamp(firstNote.volume, 0, 15) : DEFAULT_VOLUME;
    const initOctave = firstNote ? midiToOctave(firstNote.midi) : DEFAULT_OCTAVE;
    const hasAnything = options.forceHeader || musicalEvents.length || events.some(ev => ev.type === "tempo" || ev.preTempos?.length || ev.postTempos?.length);
    if (!hasAnything) return "";

    let best = null;
    for (const initialL of L_STATES) {
      const rendered = renderPartWithInitialState(events, {
        ...options,
        initVolume,
        initOctave,
        initialL
      });
      if (best == null || rendered.length < best.length || (rendered.length === best.length && rendered < best)) best = rendered;
    }
    return best || "";
  }

  function renderPartWithInitialState(events, state) {
    let currentVolume = state.initVolume;
    let currentOctave = state.initOctave;
    const decorated = [];

    for (const ev of events) {
      if (ev.type === "tempo") {
        decorated.push({ type: "tempo", pre: renderTempoList(ev.preTempos) });
        continue;
      }
      const preTempo = renderTempoList(ev.preTempos);
      if (ev.type === "rest") {
        decorated.push({ type: "rest", duration: ev.duration, pre: preTempo, tiePrefix: false });
        continue;
      }
      const vol = clamp(ev.volume, 0, 15);
      let command = "";
      if (vol !== currentVolume) {
        command += `V${vol}`;
        currentVolume = vol;
      }
      const pitch = renderPitch(ev.midi, currentOctave);
      command += pitch.prefix;
      currentOctave = pitch.octave;
      decorated.push({
        type: "note",
        duration: ev.duration,
        pre: preTempo,
        tiePrefix: Boolean(ev.tieFromPrev),
        command,
        symbol: pitch.symbol
      });
    }

    const startTempo = state.isMelody ? `T${state.startTempo || DEFAULT_TEMPO}` : "";
    const header = `${startTempo}V${state.initVolume}O${state.initOctave}L${state.initialL.label}`;
    let dp = new Map([[state.initialL.label, { text: header, lState: state.initialL }]]);

    for (const ev of decorated) {
      if (ev.type === "tempo") {
        for (const item of dp.values()) item.text += ev.pre;
        continue;
      }
      const next = new Map();
      for (const item of dp.values()) {
        for (const targetL of L_STATES) {
          const change = targetL.label === item.lState.label ? "" : `L${targetL.label}`;
          const body = renderDecoratedEvent(ev, targetL.units);
          const prefix = (ev.tiePrefix ? "&" : "") + (ev.pre || "") + change;
          const text = item.text + prefix + body;
          const old = next.get(targetL.label);
          if (!old || text.length < old.text.length || (text.length === old.text.length && text < old.text)) {
            next.set(targetL.label, { text, lState: targetL });
          }
        }
      }
      dp = next;
    }

    let best = null;
    for (const item of dp.values()) {
      if (!best || item.text.length < best.length || (item.text.length === best.length && item.text < best)) best = item.text;
    }
    return best || header;
  }

  function renderDecoratedEvent(ev, defaultUnits) {
    if (ev.type === "rest") return renderRestDuration(ev.duration, defaultUnits);
    return renderNoteDuration(ev.command + ev.symbol, ev.symbol, ev.duration, defaultUnits);
  }

  function renderTempoList(list) {
    return Array.from(list || []).map(bpm => `T${bpm}`).join("");
  }

  function renderPitch(midi, currentOctave) {
    if (midi < 0 || midi > 127) throw new Error(`음역 ${midi}은 지원할 수 없습니다.`);
    const targetOctave = midiToOctave(midi);
    if (targetOctave < 0 || targetOctave > 9) throw new Error(`O${targetOctave} 음역은 지원할 수 없습니다.`);
    const symbol = NOTE_NAMES[((midi % 12) + 12) % 12];
    const candidates = [];
    if (targetOctave === currentOctave) candidates.push({ prefix: "", symbol, octave: targetOctave });
    const delta = targetOctave - currentOctave;
    if (delta !== 0 && Math.abs(delta) <= 9) candidates.push({ prefix: delta > 0 ? ">".repeat(delta) : "<".repeat(-delta), symbol, octave: targetOctave });
    candidates.push({ prefix: `O${targetOctave}`, symbol, octave: targetOctave });
    candidates.sort((a, b) => (a.prefix.length + a.symbol.length) - (b.prefix.length + b.symbol.length) || a.prefix.localeCompare(b.prefix));
    return candidates[0];
  }

  function midiToOctave(midi) {
    return Math.floor(midi / 12) - 1;
  }

  function renderNoteDuration(firstSymbol, repeatSymbol, units, defaultUnits) {
    units = normalizeUnits(units);
    const key = `${firstSymbol}|${repeatSymbol}|${units}|${defaultUnits}`;
    if (noteDurationCache.has(key)) return noteDurationCache.get(key);
    const candidates = getDurationCandidates(defaultUnits);
    let best = null;
    for (const cand of candidates) {
      if (cand.units > units) continue;
      const first = `${firstSymbol}${cand.suffix}`;
      let text;
      if (cand.units === units) {
        text = first;
      } else {
        let tail;
        try { tail = bestNoteTail(units - cand.units, repeatSymbol, defaultUnits); }
        catch (_) { continue; }
        text = `${first}&${tail}`;
      }
      if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
    }
    if (best == null) throw new Error(`길이 ${units}을 MML로 표현하지 못했습니다.`);
    noteDurationCache.set(key, best);
    return best;
  }

  function bestNoteTail(units, symbol, defaultUnits) {
    units = normalizeUnits(units);
    const key = `tail|${symbol}|${units}|${defaultUnits}`;
    if (noteDurationCache.has(key)) return noteDurationCache.get(key);
    if (units === 0) return "";
    const candidates = getDurationCandidates(defaultUnits);
    const dp = Array(units + 1).fill(null);
    dp[0] = "";
    for (let u = 1; u <= units; u++) {
      let best = null;
      for (const cand of candidates) {
        if (cand.units > u || dp[u - cand.units] == null) continue;
        const piece = `${symbol}${cand.suffix}`;
        const text = cand.units === u ? piece : `${dp[u - cand.units]}&${piece}`;
        if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
      }
      dp[u] = best;
    }
    const out = dp[units];
    if (out == null) throw new Error(`길이 ${units}을 MML로 표현하지 못했습니다.`);
    noteDurationCache.set(key, out);
    return out;
  }

  function renderRestDuration(units, defaultUnits) {
    units = normalizeUnits(units);
    const key = `${units}|${defaultUnits}`;
    if (restDurationCache.has(key)) return restDurationCache.get(key);
    const candidates = getDurationCandidates(defaultUnits);
    const dp = Array(units + 1).fill(null);
    dp[0] = "";
    for (let u = 1; u <= units; u++) {
      let best = null;
      for (const cand of candidates) {
        if (cand.units > u || dp[u - cand.units] == null) continue;
        const piece = `r${cand.suffix}`;
        const text = dp[u - cand.units] + piece;
        if (best == null || text.length < best.length || (text.length === best.length && text < best)) best = text;
      }
      dp[u] = best;
    }
    const out = dp[units];
    if (out == null) throw new Error(`쉼표 길이 ${units}을 MML로 표현하지 못했습니다.`);
    restDurationCache.set(key, out);
    return out;
  }

  function getDurationCandidates(defaultUnits) {
    const key = String(defaultUnits);
    if (durationCandidateCache.has(key)) return durationCandidateCache.get(key);
    const map = new Map();
    const add = (units, suffix) => {
      if (!isIntegerLike(units) || units <= 0) return;
      units = Math.round(units);
      const old = map.get(units);
      if (old == null || suffix.length < old.length || (suffix.length === old.length && suffix < old)) map.set(units, suffix);
    };
    add(defaultUnits, "");
    add(durationUnitsFromBase(defaultUnits, 1), ".");
    for (const denom of VALID_LENGTHS) {
      add(durationUnits(denom, 0), String(denom));
      add(durationUnits(denom, 1), `${denom}.`);
    }
    const candidates = Array.from(map, ([units, suffix]) => ({ units, suffix }))
      .sort((a, b) => b.units - a.units || a.suffix.length - b.suffix.length || a.suffix.localeCompare(b.suffix));
    durationCandidateCache.set(key, candidates);
    return candidates;
  }

  function durationUnits(denom, dots = 0) {
    let total = WHOLE_UNITS / denom;
    let add = total / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function durationUnitsFromBase(baseUnits, dots = 0) {
    let total = baseUnits;
    let add = baseUnits / 2;
    for (let i = 0; i < dots; i++) {
      total += add;
      add /= 2;
    }
    return total;
  }

  function normalizeUnits(value) {
    if (!isIntegerLike(value)) throw new Error("현재 최적화할 수 없는 소수 길이가 있습니다.");
    return Math.round(value);
  }

  function isIntegerLike(value) {
    return Number.isFinite(value) && Math.abs(value - Math.round(value)) < EPS;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
  }

  function countPartChars(parts) {
    return Array.from(parts || []).reduce((sum, part) => sum + String(part || "").trim().length, 0);
  }

  window.MabiOptimizer = { optimizeMml, optimizePart, trimShortRestsMml, trimLeadingSilenceMml, addLeadingSilenceMml, splitMmlPages };
})();
