(() => {
  "use strict";

  // Shared note timing rules for MIDI import (editor channels and simple/player MML parts).
  //  - quantizeSpan: snap a note to the quantize grid so that NO note collapses to zero length and
  //    abutting notes stay abutting (the end is snapped itself, not start + snapped duration).
  //  - canChain: may `next` follow `prev` on the same voice/part? Yes when it starts later (also on the
  //    grid) and overlaps prev by no more than `tolerance`; the earlier note is then trimmed.
  //  - voiceCollides: two notes of one voice that snap to the same grid onset would collapse into one, so
  //    callers keep them on separate voices instead of dropping a note.
  const EPS = 1e-7;

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function snap(value, unit) {
    const u = Math.max(Number.EPSILON, toNumber(unit, 1));
    return Math.round(toNumber(value) / u + 1e-9) * u;
  }

  function quantizeSpan(start, end, unit) {
    const u = Math.max(Number.EPSILON, toNumber(unit, 1));
    const s = Math.max(0, snap(start, u));
    let e = snap(Math.max(toNumber(end, start), toNumber(start)), u);
    if (e < s + u - EPS) e = s + u;
    return { start: s, end: e, duration: e - s };
  }

  function sameGridOnset(startA, startB, unit) {
    return Math.abs(snap(startA, unit) - snap(startB, unit)) <= EPS;
  }

  // prev/next values are in the same time domain (beats, or grid cells); `unit` is the quantize unit there.
  function canChain({ prevStart, prevEnd, nextStart, tolerance = 0, unit = 0 }) {
    const ps = toNumber(prevStart);
    const pe = toNumber(prevEnd, ps);
    const ns = toNumber(nextStart);
    if (ns <= ps + EPS) return false;           // simultaneous (or earlier) start: never chain
    if (unit > 0 && snap(ns, unit) <= snap(ps, unit) + EPS) return false;   // would collapse on the grid
    if (pe <= ns + EPS) return true;            // no overlap at all
    return pe - ns <= Math.max(0, toNumber(tolerance)) + EPS;
  }

  window.MabiNoteTiming = Object.freeze({ snap, quantizeSpan, sameGridOnset, canChain });
})();
