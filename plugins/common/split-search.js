/*
 * Shared split-boundary search (window.MabiSplitSearch).
 *
 * One rule for "where to cut a score that does not fit the character limit", used by
 *   - simple / player: cut a finished MML into pages          (MabiOptimizer.splitMmlPages)
 *   - editor:          place timeline part boundaries          (editor/app.js, "파트 자동 설정")
 * The search itself knows nothing about MML text or notes. The caller describes the score with a few
 * callbacks and decides what to do with the cut (cut the page / add a part marker).
 *
 * The rule, for one cut starting at `start`:
 *   1. bestEnd   = the last candidate position whose part still fits in `maxChars`.
 *   2. The search window runs backwards from bestEnd down to the earliest candidate whose part is at least
 *      `searchMinChars` long (strict: when that length cannot be reached the window is just bestEnd).
 *   3. Longest rest shared by every channel inside the window (counted up to `maxSilence`; the later one wins a
 *      tie). The part before ends where the rest starts, the next part starts where it ends.
 *   4. Otherwise the position inside the window that the most channels can be cut at cleanly (no note running
 *      through it); the later one wins a tie. At least one channel must be clean.
 *   5. Otherwise bestEnd.
 *
 * Options (positions are plain numbers in the caller's unit: MML units or beats):
 *   start            first position of the part to cut
 *   candidates       ascending cut positions > start; the last one is the end of the score
 *   measure(pos)     -> { maxLen } longest channel text of the part [start, pos]
 *   isMeasured(pos)  optional; when it returns false the generator yields before calling measure(pos), so a
 *                    caller can run the search in small background steps
 *   maxChars         character limit of a part
 *   searchMinChars   lower length of the search window; 0 (or a length that cannot be reached) leaves only bestEnd
 *   strict           true when searchMinChars comes from a "search end %" setting (see step 2)
 *   busy             sorted, non-overlapping [{ start, end }] where at least one channel has a note
 *   maxSilence       cap of the rest length that is scored (same unit as positions)
 *   countClean(pos)  -> number of channels that have no note running through `pos`
 *   channelCount     number of channels
 *   hintIndex        optional first guess of the bestEnd index (the caller's estimate); measured and corrected
 *   minAdvance       smallest step a part must advance (default 1)
 *   norm(x)          position normaliser (default identity; MML passes Math.round)
 *   eps              comparison tolerance (default 1e-9)
 *
 * Result: { end, nextStart, reason, cleanChannels } with reason one of
 *   "common-silence" | "clean-boundary" | "partial-boundary" | "char-limit".
 */
(() => {
  "use strict";

  function lowerBoundStart(items, value) {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].start < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function* searchBoundaryGen(options) {
    const eps = Number.isFinite(options.eps) ? options.eps : 1e-9;
    const norm = typeof options.norm === "function" ? options.norm : (value) => value;
    const minAdvance = Number.isFinite(options.minAdvance) ? options.minAdvance : 1;
    const start = options.start;
    const candidates = options.candidates;
    const maxChars = options.maxChars;
    const maxSilence = Math.max(0, Number(options.maxSilence) || 0);
    const busy = options.busy || [];

    function* measure(pos) {
      if (options.isMeasured && !options.isMeasured(pos)) yield 0;
      return options.measure(pos);
    }
    function* fits(pos) {
      return (yield* measure(pos)).maxLen <= maxChars;
    }

    // 1) bestEnd: the last candidate that still fits.
    let bestIdx = Number.isInteger(options.hintIndex) ? options.hintIndex : -2;
    if (bestIdx === -2) {
      let lo = 0;
      let hi = candidates.length - 1;
      bestIdx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (yield* fits(candidates[mid])) { bestIdx = mid; lo = mid + 1; } else hi = mid - 1;
      }
    } else {
      if (bestIdx < 0) bestIdx = 0;
      if (bestIdx > candidates.length - 1) bestIdx = candidates.length - 1;
      // Correct the caller's estimate with real measurements, in whichever direction it was off.
      if (!(yield* fits(candidates[bestIdx]))) {
        let loFit = -1;
        let hiFail = bestIdx;
        while (hiFail - loFit > 1) {
          const mid = (loFit + hiFail) >> 1;
          if (yield* fits(candidates[mid])) loFit = mid; else hiFail = mid;
        }
        bestIdx = Math.max(0, loFit);
      } else if (bestIdx < candidates.length - 1) {
        let loFit = bestIdx;
        let hi = candidates.length - 1;
        while (loFit < hi) {
          const mid = Math.ceil((loFit + hi) / 2);
          if (yield* fits(candidates[mid])) loFit = mid; else hi = mid - 1;
        }
        bestIdx = loFit;
      }
    }
    if (bestIdx < 0) bestIdx = 0;

    const bestEnd = Math.max(start + minAdvance, Math.min(candidates[bestIdx], candidates[candidates.length - 1]));

    // 2) Search window.
    const lowerTarget = Math.max(0, Math.min(maxChars, Math.round(Number(options.searchMinChars) || 0)));
    const bestMeasure = yield* measure(bestEnd);
    let earliest = null;
    if (lowerTarget > 0 && bestMeasure.maxLen >= lowerTarget) {
      let lo = 0;
      let hi = bestIdx;
      earliest = candidates[bestIdx];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((yield* measure(candidates[mid])).maxLen >= lowerTarget) { earliest = candidates[mid]; hi = mid - 1; } else lo = mid + 1;
      }
    }
    const searchStart = earliest != null ? earliest : (options.strict ? bestEnd : start + minAdvance);
    const searchEnd = bestEnd;

    // 3) Longest rest shared by every channel, scanning backwards.
    if (searchEnd > searchStart + eps) {
      let cursor = searchEnd;
      let best = null;
      let done = false;
      const consider = function* (rawStart, rawEnd) {
        const gapStart = Math.max(searchStart, norm(rawStart));
        const gapEnd = Math.min(searchEnd, norm(rawEnd));
        if (gapEnd <= gapStart + eps) return;
        const score = Math.min(Math.max(0, gapEnd - gapStart), Math.max(1, maxSilence));
        // A gap that cannot beat the current best is never chosen, so it does not need measuring.
        if (best && !(score > best.score)) return;
        if (!(yield* fits(gapStart))) return;
        best = { start: gapStart, end: gapEnd, score };
        if (score >= Math.max(1, maxSilence)) done = true;
      };
      let index = lowerBoundStart(busy, searchEnd - eps) - 1;
      for (; index >= 0 && !done; index--) {
        const item = busy[index];
        if (item.end <= searchStart + eps) break;
        const itemStart = Math.max(searchStart, item.start);
        const itemEnd = Math.min(searchEnd, item.end);
        if (itemEnd <= itemStart + eps) continue;
        if (itemEnd < cursor - eps) yield* consider(itemEnd, cursor);
        cursor = Math.min(cursor, itemStart);
      }
      if (!done && cursor > searchStart + eps) yield* consider(searchStart, cursor);
      if (best) {
        return { end: best.start, nextStart: Math.max(best.end, best.start), reason: "common-silence", cleanChannels: options.channelCount };
      }
    }

    // 4) The position with the most channels that can be cut cleanly.
    let mostClean = null;
    for (let index = Math.min(bestIdx, candidates.length - 1); index >= 0; index--) {
      const pos = candidates[index];
      if (pos > searchEnd + eps) continue;
      if (pos < searchStart - eps) break;
      if (!(yield* fits(pos))) continue;
      const clean = options.countClean(pos);
      if (clean <= 0) continue;
      if (!mostClean || clean > mostClean.clean) {
        mostClean = { pos, clean };
        if (clean >= options.channelCount) break;
      }
    }
    if (mostClean) {
      return {
        end: mostClean.pos,
        nextStart: mostClean.pos,
        reason: mostClean.clean >= options.channelCount ? "clean-boundary" : "partial-boundary",
        cleanChannels: mostClean.clean,
      };
    }

    // 5) Nothing better: cut at the last position that fits.
    return { end: bestEnd, nextStart: bestEnd, reason: "char-limit", cleanChannels: 0 };
  }

  function searchBoundary(options) {
    const iterator = searchBoundaryGen(options);
    for (;;) {
      const step = iterator.next();
      if (step.done) return step.value;
    }
  }

  window.MabiSplitSearch = Object.freeze({ searchBoundary, searchBoundaryGen });
})();
