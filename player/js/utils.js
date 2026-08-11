(() => {
  "use strict";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clampInt(v, a, b) { return Math.round(clamp(Number.isFinite(v) ? v : a, a, b)); }
  function formatTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const totalHundredths = Math.round(sec * 100);
    const m = Math.floor(totalHundredths / 6000);
    const s = Math.floor((totalHundredths % 6000) / 100);
    const hundredths = totalHundredths % 100;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }
  function shortError(err) {
    const msg = err?.message || String(err);
    return msg.length > 520 ? msg.slice(0, 520) + "..." : msg;
  }

  window.MabiUtils = { clampInt, formatTime, shortError };
})();
