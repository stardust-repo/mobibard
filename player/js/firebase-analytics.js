// Firebase Analytics 연결 래퍼
// 앱 본문(app.js)은 window.MobibardAnalytics.logEvent(...)만 호출하고,
// SDK 로딩 실패/광고 차단/로컬 파일 실행 같은 환경 문제는 여기서 조용히 흡수합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics, isSupported, logEvent as firebaseLogEvent } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";

const QUEUE_KEY = "__MOBIBARD_ANALYTICS_QUEUE__";
const MAX_QUEUE = 100;
const config = window.MOBIBARD_FIREBASE_CONFIG || {};
const queued = Array.isArray(window[QUEUE_KEY]) ? window[QUEUE_KEY] : [];
window[QUEUE_KEY] = queued;

const state = {
  ready: false,
  enabled: false,
  reason: "initializing",
  analytics: null
};

function normalizeEventName(name) {
  return String(name || "")
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 40) || "mobibard_event";
}

function normalizeEventParams(params) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    const normalizedKey = normalizeEventName(key).slice(0, 40);
    if (!normalizedKey) continue;
    if (value == null) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      out[normalizedKey] = typeof value === "string"
        ? value.slice(0, 100)
        : (typeof value === "boolean" ? (value ? "1" : "0") : value);
    }
  }
  return out;
}

function hasRequiredConfig(value) {
  return Boolean(
    value &&
    value.apiKey &&
    value.appId &&
    value.projectId &&
    value.measurementId
  );
}

function enqueue(name, params = {}) {
  queued.push({ name: normalizeEventName(name), params: normalizeEventParams(params) });
  if (queued.length > MAX_QUEUE) queued.splice(0, queued.length - MAX_QUEUE);
}

function logEvent(name, params = {}) {
  const eventName = normalizeEventName(name);
  const eventParams = normalizeEventParams(params);
  if (!state.enabled || !state.analytics) {
    enqueue(eventName, eventParams);
    return false;
  }
  try {
    firebaseLogEvent(state.analytics, eventName, eventParams);
    return true;
  } catch (_) {
    return false;
  }
}

window.MobibardAnalytics = {
  logEvent,
  isReady: () => state.ready,
  isEnabled: () => state.enabled,
  getStatus: () => ({ ready: state.ready, enabled: state.enabled, reason: state.reason })
};

async function initFirebaseAnalytics() {
  try {
    if (!hasRequiredConfig(config)) {
      state.ready = true;
      state.enabled = false;
      state.reason = "missing_config";
      return;
    }
    if (!(await isSupported())) {
      state.ready = true;
      state.enabled = false;
      state.reason = "unsupported_environment";
      return;
    }
    const app = initializeApp(config);
    state.analytics = getAnalytics(app);
    state.ready = true;
    state.enabled = true;
    state.reason = "enabled";
    const pending = queued.splice(0, queued.length);
    for (const item of pending) logEvent(item.name, item.params);
  } catch (err) {
    state.ready = true;
    state.enabled = false;
    state.reason = err?.code || err?.message || "init_failed";
  }
}

void initFirebaseAnalytics();
