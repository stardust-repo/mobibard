(() => {
  "use strict";

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function clampInt(v, a, b) { return Math.round(clamp(Number.isFinite(v) ? v : a, a, b)); }
  function unique(a) { return [...new Set(a)]; }
  function formatTime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const total = Math.round(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function shortError(err) {
    const msg = err?.message || String(err);
    return msg.length > 520 ? msg.slice(0, 520) + "..." : msg;
  }
  function base64ToUint8Array(b64) {
    const clean = String(b64 || "").replace(/\s+/g, "");
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.MabiUtils = { clamp, clampInt, unique, formatTime, shortError, base64ToUint8Array };
})();
