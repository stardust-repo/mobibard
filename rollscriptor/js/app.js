import {
  autoDetectKeyboardRegion,
  clamp,
  cropImageData,
  createKeyMap,
  createLineAnalysisProbes,
  detectKeyGeometry,
  formatTime,
  isWhiteMidi,
  midiNoteName,
  createLineProbeSampler,
  sampleKeyColors,
  sampleKeyColorsFromContext,
  PROBE_PATCH_COUNT,
  suggestLeftmostMidi,
} from './vision.js';
import { StreamingNoteDetector } from './analysis.js?v=20260830-hue30-bright50';
import { createMidiFile } from './midi.js';
import { getLanguage, initializeLanguage, onLanguageChange, t } from './language-manager.js';
import { initializeHeaderUi, initializeThemeUi } from './ui.js';

const MEDIABUNNY_VERSION = '1.55.3';
const MEDIABUNNY_URLS = [
  `https://cdn.jsdelivr.net/npm/mediabunny@${MEDIABUNNY_VERSION}/dist/bundles/mediabunny.min.mjs`,
  `https://unpkg.com/mediabunny@${MEDIABUNNY_VERSION}/dist/bundles/mediabunny.min.mjs`,
];

const elements = Object.fromEntries([
  'videoFile', 'fileDrop', 'fileName', 'runtimeError', 'previewStage', 'previewCanvas', 'overlayCanvas',
  'playPause', 'jumpStart', 'prev5Frame', 'prevFrame', 'nextFrame', 'next5Frame', 'jumpEnd', 'timeline', 'timeLabel', 'currentChord', 'keyboardStatus',
  'analysisStart', 'analysisEnd', 'analysisRangeLabel', 'setStartCurrent', 'setEndCurrent',
  'leftmostNote', 'tempo', 'velocity', 'velocityValue', 'detectKeys', 'keyboardOrientationToggle', 'keyboardOrientationIcon', 'keyboardColorPalette', 'whiteKeyColors', 'blackKeyColors', 'analyzeVideo', 'cancelAnalysis', 'progressBar',
  'progressTitle', 'progressDetail', 'noteCountResult', 'downloadMidi', 'toast', 'languageSelect',
  'videoQualityWarning', 'tutorialButton', 'tutorialDialog', 'tutorialClose',
].map(id => [id, document.getElementById(id)]));

const previewContext = elements.previewCanvas.getContext('2d', { willReadFrequently: true });
const overlayContext = elements.overlayCanvas.getContext('2d');

const state = {
  mediabunny: null,
  input: null,
  track: null,
  previewSink: null,
  displayWidth: 0,
  displayHeight: 0,
  timeOrigin: 0,
  endTimestamp: 0,
  duration: 0,
  fps: 30,
  previewTime: 0,
  previewFrameTime: 0,
  previewToken: 0,
  previewRenderPending: false,
  previewFromFrameCache: false,
  frameCache: [],
  frameCacheToken: 0,
  frameCacheTimer: null,
  frameCachePromise: null,
  playing: false,
  playbackTimer: null,
  playbackStartWall: 0,
  playbackStartTime: 0,
  keyboardSide: 'bottom', // inferred from guide orientation + guide position around the video center
  guide: null, // { side, span0, span1, blackPos, whitePos }
  geometry: null,
  keyMap: null,
  keyboardDetectionConfirmed: false,
  noteManuallyChanged: false,
  dragMode: null,
  dragOriginalGuide: null,
  analyzing: false,
  analysisAbort: false,
  midiBlob: null,
  notes: [],
  noteTimeOrigin: 0,
  noteTimeEnd: 0,
  fileBaseName: 'video-piano',
  releaseBaselineColors: null,
  releaseBaselineTime: 0,
  detectedColorSummary: null,
  videoWidth: 0,
  videoHeight: 0,
};

function showToast(message, type = '') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`.trim();
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { elements.toast.className = 'toast'; }, 2800);
}

function formatNumber(value) {
  try { return Number(value).toLocaleString(getLanguage()); }
  catch (_) { return Number(value).toLocaleString(); }
}

function setProgress(value, title, detail) {
  elements.progressBar.style.width = `${(clamp(Number(value) || 0, 0, 1) * 100).toFixed(1)}%`;
  if (title !== undefined) elements.progressTitle.textContent = title;
  if (detail !== undefined) elements.progressDetail.textContent = detail;
}

function sanitizeBaseName(name) {
  return (name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'video-piano').slice(0, 100);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function populateNoteOptions() {
  elements.leftmostNote.innerHTML = '';
  for (let midi = 0; midi <= 127; midi += 1) {
    if (!isWhiteMidi(midi)) continue;
    const option = document.createElement('option');
    option.value = String(midi);
    option.textContent = `${midiNoteName(midi)} · MIDI ${midi}`;
    if (midi === 48) option.selected = true;
    elements.leftmostNote.append(option);
  }
}

function updateTimeLabel() {
  elements.timeLabel.textContent = `${formatTime(state.previewTime)} / ${formatTime(state.duration)}`;
}

function updateVideoQualityWarning() {
  const box = elements.videoQualityWarning;
  if (!box) return;
  if (!state.track || !state.videoWidth || !state.videoHeight) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  const issues = [];
  if (Math.min(state.videoWidth, state.videoHeight) < 720) issues.push(t('video.quality_resolution_low'));
  // 29.97/29.976 are conventional 30fps sources, so allow a small nominal tolerance.
  if (state.fps < 29.5) issues.push(t('video.quality_fps_low'));
  if (!issues.length) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.textContent = t('video.quality_warning', {
    resolution: `${state.videoWidth}×${state.videoHeight}`,
    fps: Number(state.fps).toFixed(state.fps < 10 ? 2 : 1),
    issues: issues.join(' · '),
  });
  box.hidden = false;
}

function minimumAnalysisRange() {
  return Math.max(0.001, 1 / Math.max(1, state.fps));
}

function readAnalysisRange(showError = false) {
  if (!state.track) return null;
  const rawStart = Number(elements.analysisStart.value);
  const rawEnd = Number(elements.analysisEnd.value);
  const start = clamp(Number.isFinite(rawStart) ? rawStart : 0, 0, state.duration);
  const end = clamp(Number.isFinite(rawEnd) ? rawEnd : state.duration, 0, state.duration);
  if (end - start < minimumAnalysisRange() * 0.5) {
    if (showError) showToast(t('analysis.invalid_range'), 'error');
    return null;
  }
  return { start, end, duration: end - start };
}

function updateAnalysisRangeLabel() {
  const range = readAnalysisRange(false);
  elements.analysisRangeLabel.textContent = range
    ? `${formatTime(range.start)} ~ ${formatTime(range.end)} · ${formatTime(range.duration)}`
    : t('analysis.check_range');
}

function normalizeAnalysisRange(changed = '') {
  if (!state.track) return;
  const gap = minimumAnalysisRange();
  let start = clamp(Number(elements.analysisStart.value) || 0, 0, state.duration);
  let endValue = Number(elements.analysisEnd.value);
  let end = clamp(Number.isFinite(endValue) ? endValue : state.duration, 0, state.duration);

  if (end - start < gap) {
    if (changed === 'start') {
      start = Math.max(0, Math.min(start, state.duration - gap));
      end = Math.min(state.duration, Math.max(end, start + gap));
    } else {
      end = Math.min(state.duration, Math.max(end, gap));
      start = Math.max(0, Math.min(start, end - gap));
    }
  }

  elements.analysisStart.value = start.toFixed(3);
  elements.analysisEnd.value = end.toFixed(3);
  updateAnalysisRangeLabel();
  resetResults();
}

function setAnalysisRangeDefaults() {
  elements.analysisStart.min = '0';
  elements.analysisStart.max = String(state.duration || 0);
  elements.analysisEnd.min = '0';
  elements.analysisEnd.max = String(state.duration || 0);
  elements.analysisStart.value = '0.000';
  elements.analysisEnd.value = state.duration.toFixed(3);
  updateAnalysisRangeLabel();
}

function updateCurrentChord(time = state.previewTime) {
  if (!state.track) {
    elements.currentChord.textContent = '—';
    elements.currentChord.classList.remove('has-notes');
    return;
  }
  if (!state.notes.length) {
    elements.currentChord.textContent = t('transport.after_analysis');
    elements.currentChord.classList.remove('has-notes');
    return;
  }

  const localTime = time - state.noteTimeOrigin;
  const epsilon = 1e-6;
  const activeByMidi = new Map();
  if (localTime >= -epsilon && time <= state.noteTimeEnd + epsilon) {
    for (const note of state.notes) {
      if (note.start <= localTime + epsilon && note.end > localTime + epsilon) activeByMidi.set(note.midi, note);
    }
  }
  const active = [...activeByMidi.values()].sort((a, b) => a.midi - b.midi);
  elements.currentChord.textContent = active.length ? active.map(note => note.name).join(' + ') : '—';
  elements.currentChord.classList.toggle('has-notes', active.length > 0);
}

function setPlaybackUi() {
  const label = state.playing ? t('transport.pause') : t('transport.play');
  elements.playPause.textContent = state.playing ? '■' : '▶';
  elements.playPause.setAttribute('aria-label', label);
  elements.playPause.title = label;
}

function pausePlayback() {
  state.playing = false;
  if (state.playbackTimer !== null) {
    clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }
  setPlaybackUi();
}

async function playbackStep() {
  if (!state.playing || !state.track) return;
  const elapsed = Math.max(0, (performance.now() - state.playbackStartWall) / 1000);
  const targetTime = state.playbackStartTime + elapsed;
  if (targetTime >= state.duration) {
    await renderPreview(state.duration, false);
    pausePlayback();
    return;
  }

  await renderPreview(targetTime, false);
  if (state.playing) state.playbackTimer = setTimeout(playbackStep, 12);
}

function startPlayback() {
  if (!state.track || state.analyzing) return;
  if (state.previewTime >= state.duration - 0.001) {
    state.previewTime = 0;
    elements.timeline.value = '0';
    setAnalysisRangeDefaults();
    updateTimeLabel();
    updateCurrentChord();
  }
  state.playing = true;
  state.playbackStartTime = state.previewTime;
  state.playbackStartWall = performance.now();
  setPlaybackUi();
  playbackStep();
}

function togglePlayback() {
  if (state.playing) pausePlayback();
  else startPlayback();
}

function resetResults() {
  state.notes = [];
  state.noteTimeOrigin = 0;
  state.noteTimeEnd = 0;
  state.midiBlob = null;
  elements.noteCountResult.textContent = '0';
  updateCurrentChord();
  elements.downloadMidi.disabled = true;
  if (!state.analyzing) {
    const detail = !state.track
      ? t('progress.select_video')
      : (state.keyboardDetectionConfirmed ? t('progress.detected_detail') : t('progress.idle_detail'));
    setProgress(0, t('progress.waiting'), detail);
  }
}

function updateControlAvailability() {
  const hasVideo = Boolean(state.track);
  const hasKeys = Boolean(state.keyboardDetectionConfirmed && state.keyMap?.keys?.length);
  const locked = state.analyzing;
  elements.videoFile.disabled = locked || !state.mediabunny;
  elements.timeline.disabled = !hasVideo || locked;
  elements.playPause.disabled = !hasVideo || locked;
  elements.jumpStart.disabled = !hasVideo || locked;
  elements.prev5Frame.disabled = !hasVideo || locked;
  elements.prevFrame.disabled = !hasVideo || locked;
  elements.nextFrame.disabled = !hasVideo || locked;
  elements.next5Frame.disabled = !hasVideo || locked;
  elements.jumpEnd.disabled = !hasVideo || locked;
  elements.analysisStart.disabled = !hasVideo || locked;
  elements.analysisEnd.disabled = !hasVideo || locked;
  elements.setStartCurrent.disabled = !hasVideo || locked;
  elements.setEndCurrent.disabled = !hasVideo || locked;
  elements.leftmostNote.disabled = !hasKeys || locked;
  elements.detectKeys.disabled = !hasVideo || locked;
  elements.keyboardOrientationToggle.disabled = !hasVideo || locked;
  // Keep Analyze clickable after a video is loaded so an omitted keyboard-detection
  // step can be explained with a toast instead of looking like a dead control.
  elements.analyzeVideo.disabled = !hasVideo || locked;
  elements.downloadMidi.disabled = !state.midiBlob || locked;
}

function disposeCurrentInput() {
  pausePlayback();
  clearFrameCache();
  state.previewToken += 1;
  try { state.input?.dispose(); } catch { /* no-op */ }
  state.input = null;
  state.track = null;
  state.previewSink = null;
  state.releaseBaselineColors = null;
  state.releaseBaselineTime = 0;
  state.detectedColorSummary = null;
}

function setCanvasDimensions(width, height) {
  elements.previewCanvas.width = width;
  elements.previewCanvas.height = height;
  elements.overlayCanvas.width = width;
  elements.overlayCanvas.height = height;
  elements.previewStage.style.aspectRatio = `${width} / ${height}`;
}

async function loadMediabunny() {
  let lastError = null;
  for (const url of MEDIABUNNY_URLS) {
    try { return await import(url); }
    catch (error) { lastError = error; }
  }
  throw lastError ?? new Error(t('error.media_library'));
}

const FRAME_CACHE_RADIUS_FRAMES = 8;
const FRAME_CACHE_MAX_FRAMES = 24;
const FRAME_CACHE_MAX_WIDTH = 1280;

function clearFrameCache() {
  state.frameCacheToken += 1;
  if (state.frameCacheTimer !== null) {
    clearTimeout(state.frameCacheTimer);
    state.frameCacheTimer = null;
  }
  state.frameCache = [];
  state.frameCachePromise = null;
}

function cachedFrameCanvas(sourceCanvas, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas;
}

async function buildFrameCache(centerTime) {
  if (!state.track || !state.mediabunny || state.playing || state.analyzing) return false;
  const token = ++state.frameCacheToken;
  const frameDuration = 1 / Math.max(1, state.fps);
  const radius = clamp(frameDuration * FRAME_CACHE_RADIUS_FRAMES, 0.05, 0.35);
  const localStart = Math.max(0, centerTime - radius);
  const localEnd = Math.min(state.duration, centerTime + radius + frameDuration * 1.5);
  const scale = Math.min(1, FRAME_CACHE_MAX_WIDTH / Math.max(1, state.displayWidth));
  const cacheWidth = Math.max(1, Math.round(state.displayWidth * scale));
  const cacheHeight = Math.max(1, Math.round(state.displayHeight * scale));
  const { CanvasSink } = state.mediabunny;
  const sink = new CanvasSink(state.track, {
    width: cacheWidth,
    height: cacheHeight,
    fit: 'fill',
    poolSize: 2,
    decoderOptions: { hardwareAcceleration: 'prefer-hardware' },
  });
  const frames = [];
  try {
    for await (const wrapped of sink.canvases(state.timeOrigin + localStart, state.timeOrigin + localEnd)) {
      if (token !== state.frameCacheToken || state.playing || state.analyzing) return false;
      const localTime = wrapped.timestamp - state.timeOrigin;
      if (localTime + 1e-9 < localStart) continue;
      if (localTime >= localEnd - 1e-9) break;
      frames.push({
        time: clamp(localTime, 0, state.duration),
        duration: Math.max(0, wrapped.duration || frameDuration),
        canvas: cachedFrameCanvas(wrapped.canvas, cacheWidth, cacheHeight),
      });
      if (frames.length >= FRAME_CACHE_MAX_FRAMES) break;
    }
  } catch (error) {
    if (token === state.frameCacheToken) console.warn('frame cache warm failed', error);
    return false;
  }
  if (token !== state.frameCacheToken) return false;
  frames.sort((a, b) => a.time - b.time);
  state.frameCache = frames;
  return frames.length > 0;
}

function scheduleFrameCacheWarm(centerTime = state.previewFrameTime) {
  if (!state.track || state.playing || state.analyzing) return;
  if (state.frameCacheTimer !== null) clearTimeout(state.frameCacheTimer);
  state.frameCacheTimer = setTimeout(() => {
    state.frameCacheTimer = null;
    const promise = buildFrameCache(centerTime);
    state.frameCachePromise = promise;
    promise.finally(() => {
      if (state.frameCachePromise === promise) state.frameCachePromise = null;
    });
  }, 90);
}

function getAdjacentCachedFrame(direction) {
  if (!state.frameCache.length) return null;
  const current = state.previewFrameTime;
  const epsilon = Math.max(1e-5, 1 / Math.max(1, state.fps) * 0.08);
  if (direction > 0) {
    return state.frameCache.find(frame => frame.time > current + epsilon) || null;
  }
  for (let index = state.frameCache.length - 1; index >= 0; index -= 1) {
    const frame = state.frameCache[index];
    if (frame.time < current - epsilon) return frame;
  }
  return null;
}

function displayCachedFrame(frame) {
  if (!frame) return false;
  state.previewTime = frame.time;
  state.previewFrameTime = frame.time;
  state.previewFromFrameCache = true;
  elements.timeline.value = String(frame.time);
  updateTimeLabel();
  updateCurrentChord(frame.time);
  previewContext.clearRect(0, 0, state.displayWidth, state.displayHeight);
  previewContext.drawImage(frame.canvas, 0, 0, state.displayWidth, state.displayHeight);
  drawOverlay();
  return true;
}

function cacheNeedsWarm(direction) {
  const current = state.previewFrameTime;
  const epsilon = Math.max(1e-5, 1 / Math.max(1, state.fps) * 0.08);
  const count = direction > 0
    ? state.frameCache.filter(frame => frame.time > current + epsilon).length
    : state.frameCache.filter(frame => frame.time < current - epsilon).length;
  return count < 4;
}

async function stepPreviewFrame(direction) {
  if (!state.track || state.analyzing) return;
  pausePlayback();
  let frame = getAdjacentCachedFrame(direction);
  if (!frame && state.frameCachePromise) {
    try { await state.frameCachePromise; } catch { /* cache is optional */ }
    frame = getAdjacentCachedFrame(direction);
  }
  if (!frame) {
    await buildFrameCache(state.previewFrameTime);
    frame = getAdjacentCachedFrame(direction);
  }
  if (frame) {
    displayCachedFrame(frame);
    if (cacheNeedsWarm(direction)) scheduleFrameCacheWarm(state.previewFrameTime);
    return;
  }
  await renderPreview(state.previewTime + direction / Math.max(1, state.fps), true);
}

async function stepPreviewFrames(count) {
  const amount = Math.trunc(Number(count) || 0);
  if (!amount || !state.track || state.analyzing) return;
  const direction = amount > 0 ? 1 : -1;
  for (let index = 0; index < Math.abs(amount); index += 1) {
    await stepPreviewFrame(direction);
  }
}

async function jumpPreviewToBoundary(toEnd = false) {
  if (!state.track || state.analyzing) return;
  pausePlayback();
  await renderPreview(toEnd ? state.duration : 0, true);
}

async function renderPreview(timeSeconds, force = false) {
  if (!state.previewSink || !state.track) return;
  const targetTime = clamp(Number(timeSeconds) || 0, 0, state.duration);
  state.previewTime = targetTime;
  elements.timeline.value = String(targetTime);
  updateTimeLabel();
  updateCurrentChord(targetTime);

  if (state.previewRenderPending && !force) return;
  const token = ++state.previewToken;
  state.previewRenderPending = true;
  try {
    // Any direct seek invalidates a cache centered on an older location.
    // The new location is warmed again after this exact frame has been rendered.
    clearFrameCache();
    const wrapped = await state.previewSink.getCanvas(state.timeOrigin + targetTime);
    if (!wrapped || token !== state.previewToken) return;
    state.previewFrameTime = clamp((wrapped.timestamp ?? (state.timeOrigin + targetTime)) - state.timeOrigin, 0, state.duration);
    state.previewFromFrameCache = false;
    previewContext.clearRect(0, 0, state.displayWidth, state.displayHeight);
    previewContext.drawImage(wrapped.canvas, 0, 0, state.displayWidth, state.displayHeight);
    drawOverlay();
    if (!state.playing && !state.analyzing) scheduleFrameCacheWarm(state.previewFrameTime);
  } catch (error) {
    console.error(error);
    if (token === state.previewToken) showToast(`프레임 표시 실패: ${error.message || error}`, 'error');
  } finally {
    state.previewRenderPending = false;
  }
}

let timelineTimer = null;
function requestPreview(time) {
  state.previewTime = clamp(Number(time) || 0, 0, state.duration);
  updateTimeLabel();
  updateCurrentChord();
  clearTimeout(timelineTimer);
  timelineTimer = setTimeout(() => renderPreview(state.previewTime, true), 45);
}

function canvasPoint(event) {
  const bounds = elements.overlayCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) * elements.overlayCanvas.width / Math.max(1, bounds.width), 0, elements.overlayCanvas.width),
    y: clamp((event.clientY - bounds.top) * elements.overlayCanvas.height / Math.max(1, bounds.height), 0, elements.overlayCanvas.height),
  };
}

function canvasUnitsPerCssPixel() {
  const bounds = elements.overlayCanvas.getBoundingClientRect();
  return Math.max(0.5, elements.overlayCanvas.width / Math.max(1, bounds.width));
}

function isHorizontalKeyboardSide(side = state.keyboardSide) {
  return side === 'bottom' || side === 'top';
}

function keyboardOrientationForSide(side = state.keyboardSide) {
  return isHorizontalKeyboardSide(side) ? 'horizontal' : 'vertical';
}

function inferKeyboardSideFromGuide(guide) {
  if (!guide) return state.keyboardSide || 'bottom';
  const horizontal = isHorizontalKeyboardSide(guide.side);
  const center = horizontal ? state.displayHeight / 2 : state.displayWidth / 2;
  const depthCenter = (Number(guide.blackPos) + Number(guide.whitePos)) / 2;
  return horizontal
    ? (depthCenter < center ? 'top' : 'bottom')
    : (depthCenter < center ? 'left' : 'right');
}

function syncKeyboardSideFromGuide() {
  if (!state.guide) return;
  state.keyboardSide = inferKeyboardSideFromGuide(state.guide);
  state.guide.side = state.keyboardSide;
}

function keyboardDepthSign(guideOrSide = state.guide || state.keyboardSide) {
  if (guideOrSide && typeof guideOrSide === 'object') {
    const difference = Number(guideOrSide.whitePos) - Number(guideOrSide.blackPos);
    if (Math.abs(difference) > 0.001) return difference > 0 ? 1 : -1;
    guideOrSide = guideOrSide.side;
  }
  return guideOrSide === 'bottom' || guideOrSide === 'left' ? 1 : -1;
}

function guideSpanLimit(side = state.keyboardSide) {
  return isHorizontalKeyboardSide(side) ? state.displayWidth : state.displayHeight;
}

function guideDepthLimit(side = state.keyboardSide) {
  return isHorizontalKeyboardSide(side) ? state.displayHeight : state.displayWidth;
}

function cloneGuide(guide) {
  return guide ? {
    side: guide.side,
    span0: guide.span0,
    span1: guide.span1,
    blackPos: guide.blackPos,
    whitePos: guide.whitePos,
  } : null;
}

function normalizeGuide(guide) {
  if (!guide) return null;
  const side = ['bottom', 'top', 'left', 'right'].includes(guide.side) ? guide.side : 'bottom';
  const spanLimit = Math.max(1, guideSpanLimit(side));
  const depthLimit = Math.max(1, guideDepthLimit(side));
  const minSpan = Math.min(spanLimit, Math.max(60, spanLimit * 0.10));
  const minGap = Math.min(depthLimit, Math.max(14, depthLimit * 0.025));
  let span0 = clamp(Math.min(guide.span0, guide.span1), 0, spanLimit);
  let span1 = clamp(Math.max(guide.span0, guide.span1), 0, spanLimit);
  if (span1 - span0 < minSpan) {
    const center = (span0 + span1) / 2;
    span0 = clamp(center - minSpan / 2, 0, Math.max(0, spanLimit - minSpan));
    span1 = clamp(span0 + minSpan, minSpan, spanLimit);
  }

  const sign = keyboardDepthSign({ side, blackPos: guide.blackPos, whitePos: guide.whitePos });
  let blackPos = clamp(Number(guide.blackPos) || 0, 0, depthLimit);
  let whitePos = clamp(Number(guide.whitePos) || 0, 0, depthLimit);
  if ((whitePos - blackPos) * sign < minGap) {
    if (sign > 0) {
      blackPos = clamp(blackPos, 0, Math.max(0, depthLimit - minGap));
      whitePos = clamp(Math.max(whitePos, blackPos + minGap), minGap, depthLimit);
    } else {
      blackPos = clamp(blackPos, minGap, depthLimit);
      whitePos = clamp(Math.min(whitePos, blackPos - minGap), 0, Math.max(0, depthLimit - minGap));
    }
  }
  const normalized = { side, span0, span1, blackPos, whitePos };
  normalized.side = inferKeyboardSideFromGuide(normalized);
  return normalized;
}

function guideLineEndpoints(kind) {
  const guide = state.guide;
  if (!guide) return null;
  const pos = kind === 'black' ? guide.blackPos : guide.whitePos;
  return isHorizontalKeyboardSide(guide.side)
    ? [{ x: guide.span0, y: pos }, { x: guide.span1, y: pos }]
    : [{ x: pos, y: guide.span0 }, { x: pos, y: guide.span1 }];
}

/**
 * Builds an axis-aligned source crop plus a canonical keyboard coordinate system.
 * Canonical X always runs from low -> high pitch. Canonical Y always runs from
 * the black-key/back side -> the white-key/front side, regardless of which edge
 * of the video the piano keyboard is attached to.
 */
function getGuideCrop() {
  const guide = normalizeGuide(state.guide);
  if (!guide) return null;
  const sign = keyboardDepthSign(guide);
  const gap = Math.max(1, Math.abs(guide.whitePos - guide.blackPos));
  const depthLimit = guideDepthLimit(guide.side);
  const backPadding = Math.max(gap * 0.75, depthLimit * 0.12);
  const frontPadding = Math.max(gap * 0.45, depthLimit * 0.045);

  let depthMin;
  let depthMax;
  if (sign > 0) {
    depthMin = guide.blackPos - backPadding;
    depthMax = guide.whitePos + frontPadding;
  } else {
    depthMin = guide.whitePos - frontPadding;
    depthMax = guide.blackPos + backPadding;
  }
  depthMin = clamp(Math.floor(depthMin), 0, Math.max(0, depthLimit - 2));
  depthMax = clamp(Math.ceil(depthMax), depthMin + 2, depthLimit);

  const span0 = clamp(Math.floor(guide.span0), 0, Math.max(0, guideSpanLimit(guide.side) - 1));
  const span1 = clamp(Math.ceil(guide.span1), span0 + 1, guideSpanLimit(guide.side));
  const horizontal = isHorizontalKeyboardSide(guide.side);
  const left = horizontal ? span0 : depthMin;
  const top = horizontal ? depthMin : span0;
  const width = horizontal ? span1 - span0 : depthMax - depthMin;
  const height = horizontal ? depthMax - depthMin : span1 - span0;
  const canonicalWidth = horizontal ? width : height;
  const canonicalHeight = horizontal ? height : width;
  const toCanonicalDepth = sourcePos => sign > 0 ? sourcePos - depthMin : depthMax - sourcePos;

  return {
    side: guide.side,
    depthSign: sign,
    left,
    top,
    width: Math.max(1, width),
    height: Math.max(2, height),
    canonicalWidth: Math.max(1, canonicalWidth),
    canonicalHeight: Math.max(2, canonicalHeight),
    blackLineY: clamp(toCanonicalDepth(guide.blackPos), 0, Math.max(1, canonicalHeight - 1)),
    whiteLineY: clamp(toCanonicalDepth(guide.whitePos), 0, Math.max(1, canonicalHeight - 1)),
  };
}

function drawCanonicalSource(sourceCanvas, sourceRect, destinationCanvas, side, targetWidth, targetHeight, depthSign = 1) {
  destinationCanvas.width = Math.max(1, Math.round(targetWidth));
  destinationCanvas.height = Math.max(1, Math.round(targetHeight));
  const context = destinationCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const sx = sourceRect?.left ?? 0;
  const sy = sourceRect?.top ?? 0;
  const sw = sourceRect?.width ?? sourceCanvas.width;
  const sh = sourceRect?.height ?? sourceCanvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, destinationCanvas.width, destinationCanvas.height);

  if (isHorizontalKeyboardSide(side)) {
    if (depthSign > 0) {
      context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    } else {
      context.setTransform(1, 0, 0, -1, 0, targetHeight);
      context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    }
  } else if (side === 'left') {
    if (depthSign > 0) {
      // Left-edge keyboard: low -> high runs top -> bottom in source space.
      context.setTransform(0, 1, 1, 0, 0, 0);
    } else {
      context.setTransform(0, -1, 1, 0, 0, targetHeight);
    }
    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetHeight, targetWidth);
  } else {
    // Right-edge keyboard: low -> high runs bottom -> top in source space.
    if (depthSign > 0) {
      context.setTransform(0, 1, -1, 0, targetWidth, 0);
    } else {
      context.setTransform(0, -1, -1, 0, targetWidth, targetHeight);
    }
    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetHeight, targetWidth);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  return context;
}

function canonicalImageDataFromPreview(crop) {
  const canvas = document.createElement('canvas');
  const context = drawCanonicalSource(
    elements.previewCanvas,
    crop,
    canvas,
    crop.side,
    crop.canonicalWidth,
    crop.canonicalHeight,
    crop.depthSign,
  );
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function canonicalPointToDisplay(x, y, crop) {
  if (isHorizontalKeyboardSide(crop.side)) {
    return crop.depthSign > 0
      ? { x: crop.left + x, y: crop.top + y }
      : { x: crop.left + x, y: crop.top + crop.canonicalHeight - y };
  }
  const sourceDepth = crop.depthSign > 0 ? y : crop.canonicalHeight - y;
  if (crop.side === 'left') {
    return { x: crop.left + sourceDepth, y: crop.top + x };
  }
  return { x: crop.left + sourceDepth, y: crop.top + crop.canonicalWidth - x };
}

function canonicalRectToDisplay(rect, crop) {
  const points = [
    canonicalPointToDisplay(rect.x0, rect.y0, crop),
    canonicalPointToDisplay(rect.x1, rect.y0, crop),
    canonicalPointToDisplay(rect.x1, rect.y1, crop),
    canonicalPointToDisplay(rect.x0, rect.y1, crop),
  ];
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function drawGuideHandle(context, x, y, radius, color) {
  context.save();
  context.fillStyle = '#0b0e14';
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, radius * 0.35);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function drawDetectionAreas(context, crop, scale) {
  if (state.dragMode || !state.keyboardDetectionConfirmed || !state.keyMap || !state.geometry || !crop) return;
  const displayProbes = createLineAnalysisProbes(
    state.keyMap,
    state.geometry.width,
    state.geometry.height,
    state.geometry.width,
    state.geometry.height,
    crop.whiteLineY,
    crop.blackLineY,
  );
  const localPreviewTime = state.previewTime - state.noteTimeOrigin;
  const activeMidi = new Set(
    state.notes
      .filter(note => localPreviewTime >= -1e-6 && state.previewTime <= state.noteTimeEnd + 1e-6
        && note.start <= localPreviewTime + 1e-6 && note.end > localPreviewTime + 1e-6)
      .map(note => note.midi),
  );

  context.save();
  for (const probe of displayProbes) {
    const isWhite = probe.key.type === 'white';
    const active = activeMidi.has(probe.key.midi);
    const invalid = probe.valid === false;
    const canonicalBox = {
      x0: Math.min(...probe.patches.map(patch => patch.x0)),
      x1: Math.max(...probe.patches.map(patch => patch.x1)),
      y0: Math.min(...probe.patches.map(patch => patch.y0)),
      y1: Math.max(...probe.patches.map(patch => patch.y1)),
    };
    const box = canonicalRectToDisplay(canonicalBox, crop);
    const width = Math.max(1, box.x1 - box.x0);
    const height = Math.max(1, box.y1 - box.y0);

    if (invalid) {
      context.fillStyle = 'rgba(255,82,82,.32)';
      context.strokeStyle = 'rgba(255,105,105,.98)';
    } else if (isWhite) {
      context.fillStyle = active ? 'rgba(85,216,255,.72)' : 'rgba(85,216,255,.32)';
      context.strokeStyle = active ? 'rgba(190,245,255,1)' : 'rgba(85,216,255,.98)';
    } else {
      context.fillStyle = active ? 'rgba(255,112,210,.76)' : 'rgba(255,112,210,.36)';
      context.strokeStyle = active ? 'rgba(255,210,242,1)' : 'rgba(255,112,210,.98)';
    }

    context.lineWidth = Math.max(1.5, 1.35 * scale);
    context.fillRect(box.x0, box.y0, width, height);
    context.strokeRect(box.x0 + 0.5, box.y0 + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

    for (let patchIndex = 0; patchIndex < probe.patches.length - 1; patchIndex += 1) {
      const splitX = probe.patches[patchIndex].x1;
      const a = canonicalPointToDisplay(splitX, canonicalBox.y0, crop);
      const b = canonicalPointToDisplay(splitX, canonicalBox.y1, crop);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    if (invalid) {
      const a = canonicalPointToDisplay(canonicalBox.x0, canonicalBox.y0, crop);
      const b = canonicalPointToDisplay(canonicalBox.x1, canonicalBox.y1, crop);
      const c = canonicalPointToDisplay(canonicalBox.x1, canonicalBox.y0, crop);
      const d = canonicalPointToDisplay(canonicalBox.x0, canonicalBox.y1, crop);
      context.beginPath();
      context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
      context.moveTo(c.x, c.y); context.lineTo(d.x, d.y);
      context.stroke();
    }
  }
  context.restore();
}

function drawGuideLine(context, kind, color, label, scale) {
  const endpoints = guideLineEndpoints(kind);
  if (!endpoints) return;
  const [start, end] = endpoints;
  const lineWidth = Math.max(2.2 * scale, 1.5);
  context.save();
  context.globalAlpha = 0.72;
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  const radius = Math.max(6 * scale, 5);
  drawGuideHandle(context, start.x, start.y, radius, color);
  drawGuideHandle(context, end.x, end.y, radius, color);

  const fontSize = Math.max(11 * scale, 10);
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'bottom';
  context.fillStyle = color;
  const labelX = clamp(start.x + 9 * scale, 4, Math.max(4, state.displayWidth - 120 * scale));
  const labelY = clamp(start.y - 7 * scale, fontSize + 3, state.displayHeight - 3);
  context.fillText(label, labelX, labelY);
  context.restore();
}

function drawOverlay() {
  const context = overlayContext;
  context.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
  if (!state.guide) return;

  const scale = canvasUnitsPerCssPixel();
  const crop = getGuideCrop();
  drawGuideLine(context, 'white', '#55d8ff', t('overlay.white'), scale);
  drawGuideLine(context, 'black', '#ff70d2', t('overlay.black'), scale);
  drawDetectionAreas(context, crop, scale);
}

function hitTest(point) {
  const guide = state.guide;
  if (!guide) return null;
  const scale = canvasUnitsPerCssPixel();
  const threshold = 13 * scale;
  const endpointRadius = 16 * scale;

  for (const kind of ['black', 'white']) {
    const endpoints = guideLineEndpoints(kind);
    if (!endpoints) continue;
    if (Math.hypot(point.x - endpoints[0].x, point.y - endpoints[0].y) <= endpointRadius) return 'spanStart';
    if (Math.hypot(point.x - endpoints[1].x, point.y - endpoints[1].y) <= endpointRadius) return 'spanEnd';
  }

  if (isHorizontalKeyboardSide(guide.side)) {
    if (point.x >= guide.span0 - threshold && point.x <= guide.span1 + threshold) {
      if (Math.abs(point.y - guide.blackPos) <= threshold) return 'black';
      if (Math.abs(point.y - guide.whitePos) <= threshold) return 'white';
    }
  } else if (point.y >= guide.span0 - threshold && point.y <= guide.span1 + threshold) {
    if (Math.abs(point.x - guide.blackPos) <= threshold) return 'black';
    if (Math.abs(point.x - guide.whitePos) <= threshold) return 'white';
  }
  return null;
}

function cursorForMode(mode) {
  const horizontal = isHorizontalKeyboardSide(state.guide?.side);
  if (mode === 'spanStart' || mode === 'spanEnd') return horizontal ? 'ew-resize' : 'ns-resize';
  if (mode === 'black' || mode === 'white') return horizontal ? 'ns-resize' : 'ew-resize';
  return 'default';
}

function updateKeyboardOrientationButtons() {
  const orientation = keyboardOrientationForSide(state.keyboardSide);
  const vertical = orientation === 'vertical';
  if (elements.keyboardOrientationToggle) {
    elements.keyboardOrientationToggle.dataset.keyboardOrientation = orientation;
    elements.keyboardOrientationToggle.setAttribute('aria-pressed', String(vertical));
    const orientationName = t(vertical ? 'keyboard.orientation_vertical' : 'keyboard.orientation_horizontal');
    const accessibleLabel = `${t('keyboard.orientation')}: ${orientationName}`;
    elements.keyboardOrientationToggle.setAttribute('aria-label', accessibleLabel);
    elements.keyboardOrientationToggle.title = accessibleLabel;
  }
  if (elements.keyboardOrientationIcon) elements.keyboardOrientationIcon.textContent = vertical ? '┃' : '━';
}

function invalidateKeyboardDetection(message = '') {
  state.keyboardDetectionConfirmed = false;
  state.geometry = null;
  state.keyMap = null;
  state.releaseBaselineColors = null;
  state.releaseBaselineTime = 0;
  state.detectedColorSummary = null;
  resetResults();
  updateKeyboardStatus(message || (state.track ? t('keyboard.detect_required') : ''));
  drawOverlay();
  updateControlAvailability();
}

function rgbToHex(rgb) {
  return `#${rgb.map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function summarizeDetectedColors(colors, probes, type, maximum = 3) {
  if (!colors || !probes?.length) return [];
  const buckets = new Map();
  const keyStride = PROBE_PATCH_COUNT * 3;
  for (let keyIndex = 0; keyIndex < probes.length; keyIndex += 1) {
    const probe = probes[keyIndex];
    if (probe.valid === false || probe.key?.type !== type) continue;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let patchIndex = 0; patchIndex < PROBE_PATCH_COUNT; patchIndex += 1) {
      const offset = keyIndex * keyStride + patchIndex * 3;
      red += colors[offset];
      green += colors[offset + 1];
      blue += colors[offset + 2];
    }
    const rgb = [red / PROBE_PATCH_COUNT, green / PROBE_PATCH_COUNT, blue / PROBE_PATCH_COUNT];
    const quantized = rgb.map(value => clamp(Math.round(value / 24) * 24, 0, 255));
    const bucketKey = quantized.join(',');
    const bucket = buckets.get(bucketKey) || { count: 0, sum: [0, 0, 0] };
    bucket.count += 1;
    bucket.sum[0] += rgb[0];
    bucket.sum[1] += rgb[1];
    bucket.sum[2] += rgb[2];
    buckets.set(bucketKey, bucket);
  }
  const ranked = Array.from(buckets.values())
    .map(bucket => ({ count: bucket.count, rgb: bucket.sum.map(value => Math.round(value / bucket.count)) }))
    .sort((a, b) => b.count - a.count);
  const selected = [];
  for (const candidate of ranked) {
    if (selected.every(entry => colorDistance(entry.rgb, candidate.rgb) >= 28)) selected.push(candidate);
    if (selected.length >= maximum) break;
  }
  if (selected.length < maximum) {
    for (const candidate of ranked) {
      if (!selected.includes(candidate)) selected.push(candidate);
      if (selected.length >= maximum) break;
    }
  }
  return selected;
}

function renderDetectedKeyColors() {
  const palette = elements.keyboardColorPalette;
  if (!palette || !elements.whiteKeyColors || !elements.blackKeyColors) return;
  const summary = state.detectedColorSummary;
  const hasColors = Boolean(state.keyboardDetectionConfirmed && summary && (summary.white.length || summary.black.length));
  palette.hidden = !hasColors;
  if (!hasColors) {
    elements.whiteKeyColors.replaceChildren();
    elements.blackKeyColors.replaceChildren();
    return;
  }
  const render = (container, entries) => {
    container.replaceChildren(...entries.map(entry => {
      const chip = document.createElement('span');
      chip.className = 'keyboard-color-chip';
      const swatch = document.createElement('i');
      swatch.className = 'keyboard-color-swatch';
      swatch.style.background = `rgb(${entry.rgb.join(',')})`;
      const hex = rgbToHex(entry.rgb);
      swatch.title = hex;
      const code = document.createElement('span');
      code.textContent = hex;
      chip.append(swatch, code);
      return chip;
    }));
  };
  render(elements.whiteKeyColors, summary.white);
  render(elements.blackKeyColors, summary.black);
}

function captureReleaseBaseline({ quiet = false } = {}) {
  if (!state.keyMap?.keys?.length || !state.geometry || !state.guide) return false;
  const crop = getGuideCrop();
  if (!crop) return false;
  try {
    const roi = canonicalImageDataFromPreview(crop);
    const probes = createLineAnalysisProbes(
      state.keyMap,
      state.geometry.width,
      state.geometry.height,
      roi.width,
      roi.height,
      crop.whiteLineY,
      crop.blackLineY,
    );
    state.releaseBaselineColors = new Uint8Array(sampleKeyColors(roi, probes));
    state.releaseBaselineTime = state.previewTime;
    state.detectedColorSummary = {
      white: summarizeDetectedColors(state.releaseBaselineColors, probes, 'white'),
      black: summarizeDetectedColors(state.releaseBaselineColors, probes, 'black'),
    };
    renderDetectedKeyColors();
    if (!quiet) showToast(t('toast.baseline_fixed', { time: formatTime(state.releaseBaselineTime) }));
    return true;
  } catch (error) {
    console.error(error);
    state.releaseBaselineColors = null;
    state.releaseBaselineTime = 0;
    state.detectedColorSummary = null;
    return false;
  }
}

function updateKeyboardStatus(message = '') {
  renderDetectedKeyColors();
  if (message) {
    elements.keyboardStatus.textContent = message;
    return;
  }
  if (!state.track || !state.guide) {
    elements.keyboardStatus.textContent = t('keyboard.no_video');
    return;
  }
  if (!state.keyboardDetectionConfirmed || !state.keyMap) {
    elements.keyboardStatus.textContent = t('keyboard.detect_required');
    return;
  }
  const crop = getGuideCrop();
  let invalidBlack = 0;
  if (crop && state.geometry) {
    const probes = createLineAnalysisProbes(
      state.keyMap,
      state.geometry.width,
      state.geometry.height,
      state.geometry.width,
      state.geometry.height,
      crop.whiteLineY,
      crop.blackLineY,
    );
    invalidBlack = probes.filter(probe => probe.key.type === 'black' && probe.valid === false).length;
  }
  const baselineText = state.releaseBaselineColors
    ? t('keyboard.baseline_fixed', { time: formatTime(state.releaseBaselineTime) })
    : t('keyboard.baseline_none');
  elements.keyboardStatus.textContent = invalidBlack
    ? t('keyboard.status_invalid', { white: state.keyMap.whiteKeys.length, black: state.keyMap.blackKeys.length, invalid: invalidBlack, baseline: baselineText })
    : t('keyboard.status_ok', { white: state.keyMap.whiteKeys.length, black: state.keyMap.blackKeys.length, baseline: baselineText });
}

function rebuildKeyMap() {
  if (!state.keyboardDetectionConfirmed || !state.geometry) return;
  state.keyMap = createKeyMap(state.geometry, Number(elements.leftmostNote.value));
  resetResults();
  updateKeyboardStatus();
  drawOverlay();
  updateControlAvailability();
}

function detectKeysFromGuides({ quiet = false } = {}) {
  if (!state.guide || !state.track) return false;
  const crop = getGuideCrop();
  if (!crop || crop.canonicalWidth < 40 || crop.canonicalHeight < 24) return false;
  try {
    const roi = canonicalImageDataFromPreview(crop);
    state.geometry = detectKeyGeometry(roi);
    if (!state.noteManuallyChanged) elements.leftmostNote.value = String(suggestLeftmostMidi(state.geometry));
    state.keyMap = createKeyMap(state.geometry, Number(elements.leftmostNote.value));
    if (!captureReleaseBaseline({ quiet: true })) throw new Error(t('error.baseline_missing'));
    state.keyboardDetectionConfirmed = true;
    resetResults();
    updateKeyboardStatus();
    updateKeyboardOrientationButtons();
    updateVideoQualityWarning();
    drawOverlay();
    updateControlAvailability();
    if (!quiet) showToast(t('toast.detect_updated'));
    return true;
  } catch (error) {
    console.error(error);
    state.keyboardDetectionConfirmed = false;
    state.geometry = null;
    state.keyMap = null;
    state.releaseBaselineColors = null;
    state.releaseBaselineTime = 0;
    state.detectedColorSummary = null;
    resetResults();
    updateKeyboardStatus(t('keyboard.detect_failed_hint'));
    drawOverlay();
    updateControlAvailability();
    if (!quiet) showToast(t('toast.detect_failed'), 'error');
    return false;
  }
}

function fallbackGuideForOrientation(orientation = keyboardOrientationForSide(state.keyboardSide)) {
  if (orientation === 'vertical') {
    // Vertical guides default to the right side. Their actual left/right side is
    // inferred continuously from where the two lines sit around the video center.
    return { side: 'right', span0: state.displayHeight * 0.04, span1: state.displayHeight * 0.96, blackPos: state.displayWidth * 0.92, whitePos: state.displayWidth * 0.72 };
  }
  // Most piano-roll videos fall from top to bottom toward a keyboard at the bottom.
  return { side: 'bottom', span0: state.displayWidth * 0.04, span1: state.displayWidth * 0.96, blackPos: state.displayHeight * 0.78, whitePos: state.displayHeight * 0.94 };
}

function initialGuideForOrientation(orientation = keyboardOrientationForSide(state.keyboardSide)) {
  if (orientation !== 'horizontal') return normalizeGuide(fallbackGuideForOrientation('vertical'));
  const frame = previewContext.getImageData(0, 0, state.displayWidth, state.displayHeight);
  try {
    const rect = autoDetectKeyboardRegion(frame).rect;
    const x0 = clamp(rect.x, 0, state.displayWidth - 1);
    const x1 = clamp(rect.x + rect.width, x0 + 40, state.displayWidth);
    const y0 = clamp(rect.y, 0, state.displayHeight - 1);
    const y1 = clamp(rect.y + rect.height, y0 + 24, state.displayHeight);
    const height = y1 - y0;
    const regionAtTop = (y0 + y1) / 2 < state.displayHeight / 2;
    return normalizeGuide(regionAtTop
      ? { side: 'top', span0: x0, span1: x1, blackPos: y0 + height * 0.36, whitePos: y0 + height * 0.05 }
      : { side: 'bottom', span0: x0, span1: x1, blackPos: y0 + height * 0.64, whitePos: y0 + height * 0.95 });
  } catch {
    return normalizeGuide(fallbackGuideForOrientation('horizontal'));
  }
}

function setupInitialGuides() {
  // Default to the common top-to-bottom falling-roll layout: horizontal guides
  // near the bottom. The exact top/bottom side is then inferred from guide position.
  state.keyboardSide = 'bottom';
  state.guide = initialGuideForOrientation('horizontal');
  syncKeyboardSideFromGuide();
  state.noteManuallyChanged = false;
  state.keyboardDetectionConfirmed = false;
  state.geometry = null;
  state.keyMap = null;
  state.releaseBaselineColors = null;
  state.releaseBaselineTime = 0;
  state.detectedColorSummary = null;
  updateKeyboardOrientationButtons();
  resetResults();
  updateKeyboardStatus();
  drawOverlay();
  updateControlAvailability();
}

function setKeyboardOrientation(orientation) {
  if (!['horizontal', 'vertical'].includes(orientation) || !state.track || state.analyzing) return;
  if (orientation === keyboardOrientationForSide(state.keyboardSide)) return;
  pausePlayback();
  state.guide = initialGuideForOrientation(orientation);
  syncKeyboardSideFromGuide();
  state.noteManuallyChanged = false;
  updateKeyboardOrientationButtons();
  invalidateKeyboardDetection(t('keyboard.detect_required'));
}

function onOverlayPointerDown(event) {
  if (!state.track || state.analyzing) return;
  pausePlayback();
  const point = canvasPoint(event);
  const mode = hitTest(point);
  if (!mode) return;
  state.dragMode = mode;
  state.dragOriginalGuide = cloneGuide(state.guide);
  elements.overlayCanvas.setPointerCapture(event.pointerId);
  elements.overlayCanvas.style.cursor = cursorForMode(mode);
}

function onOverlayPointerMove(event) {
  if (!state.track || state.analyzing) return;
  const point = canvasPoint(event);
  if (!state.dragMode) {
    elements.overlayCanvas.style.cursor = cursorForMode(hitTest(point));
    return;
  }

  const spanLimit = guideSpanLimit(state.guide.side);
  const depthLimit = guideDepthLimit(state.guide.side);
  const minSpan = Math.min(spanLimit, Math.max(60, spanLimit * 0.10));
  const minGap = Math.min(depthLimit, Math.max(14, depthLimit * 0.025));
  const spanPoint = isHorizontalKeyboardSide(state.guide.side) ? point.x : point.y;
  const depthPoint = isHorizontalKeyboardSide(state.guide.side) ? point.y : point.x;
  if (state.dragMode === 'spanStart') {
    state.guide.span0 = clamp(spanPoint, 0, state.guide.span1 - minSpan);
  } else if (state.dragMode === 'spanEnd') {
    state.guide.span1 = clamp(spanPoint, state.guide.span0 + minSpan, spanLimit);
  } else if (state.dragMode === 'black') {
    let next = clamp(depthPoint, 0, depthLimit);
    if (Math.abs(state.guide.whitePos - next) < minGap) {
      next = next < state.guide.whitePos ? state.guide.whitePos - minGap : state.guide.whitePos + minGap;
    }
    state.guide.blackPos = clamp(next, 0, depthLimit);
  } else if (state.dragMode === 'white') {
    let next = clamp(depthPoint, 0, depthLimit);
    if (Math.abs(next - state.guide.blackPos) < minGap) {
      next = next < state.guide.blackPos ? state.guide.blackPos - minGap : state.guide.blackPos + minGap;
    }
    state.guide.whitePos = clamp(next, 0, depthLimit);
  }
  state.guide = normalizeGuide(state.guide);
  syncKeyboardSideFromGuide();
  updateKeyboardOrientationButtons();
  drawOverlay();
}

async function finishGuideDrag(event, cancelled = false) {
  if (!state.dragMode) return;
  if (cancelled && state.dragOriginalGuide) state.guide = cloneGuide(state.dragOriginalGuide);
  state.dragMode = null;
  try { elements.overlayCanvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  elements.overlayCanvas.style.cursor = cursorForMode(hitTest(canvasPoint(event)));
  if (cancelled) {
    syncKeyboardSideFromGuide();
    updateKeyboardOrientationButtons();
    drawOverlay();
    return;
  }
  state.guide = normalizeGuide(state.guide);
  syncKeyboardSideFromGuide();
  updateKeyboardOrientationButtons();
  invalidateKeyboardDetection(t('keyboard.detect_required'));
}

async function confirmKeyboardDetection() {
  if (!state.track || state.analyzing) return;
  pausePlayback();
  // Frame-cache canvases are intentionally downscaled. Detection and release-color
  // capture must use the exact decoded frame selected by the user.
  if (state.previewFromFrameCache) await renderPreview(state.previewFrameTime, true);
  detectKeysFromGuides({ quiet: false });
}

async function loadVideoFile(file) {
  if (!file || state.analyzing || !state.mediabunny) return;
  pausePlayback();
  disposeCurrentInput();
  resetResults();
  state.guide = null;
  state.geometry = null;
  state.keyMap = null;
  state.keyboardDetectionConfirmed = false;
  state.releaseBaselineColors = null;
  state.releaseBaselineTime = 0;
  state.detectedColorSummary = null;
  state.videoWidth = 0;
  state.videoHeight = 0;
  updateVideoQualityWarning();
  state.fileBaseName = sanitizeBaseName(file.name);
  elements.fileName.textContent = file.name;
  elements.previewStage.classList.remove('is-empty');
  updateKeyboardStatus(t('progress.opening'));
  setProgress(0.02, t('progress.opening'), t('progress.opening_detail'));

  try {
    const { Input, ALL_FORMATS, BlobSource, CanvasSink } = state.mediabunny;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    state.input = input;
    if (!await input.canRead()) throw new Error(t('error.unsupported_video'));
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(t('error.no_video_track'));
    if (!await track.canDecode()) throw new Error(t('error.codec'));
    state.track = track;

    const [width, height, firstTimestamp, endTimestamp] = await Promise.all([
      track.getDisplayWidth(), track.getDisplayHeight(), track.getFirstTimestamp(), track.computeDuration(),
    ]);
    let metrics = null;
    try { metrics = await track.computeFrameRateMetrics(); } catch { /* optional */ }

    state.displayWidth = width;
    state.displayHeight = height;
    state.videoWidth = width;
    state.videoHeight = height;
    state.timeOrigin = Math.max(0, firstTimestamp);
    state.endTimestamp = endTimestamp;
    state.duration = Math.max(0, endTimestamp - state.timeOrigin);
    state.fps = clamp(metrics?.bestGuessFrameRate || metrics?.averageFrameRate || 30, 1, 240);
    updateVideoQualityWarning();
    state.previewTime = 0;
    state.previewFrameTime = 0;
    state.previewFromFrameCache = false;
    clearFrameCache();
    state.previewSink = new CanvasSink(track, { poolSize: 1, decoderOptions: { hardwareAcceleration: 'prefer-hardware' } });

    setCanvasDimensions(width, height);
    elements.timeline.min = '0';
    elements.timeline.max = String(state.duration || 0.001);
    elements.timeline.step = String(Math.min(0.01, 1 / state.fps));
    elements.timeline.value = '0';
    setAnalysisRangeDefaults();
    updateTimeLabel();
    updateCurrentChord();
    updateControlAvailability();
    await renderPreview(0, true);
    setupInitialGuides();
    setProgress(0, t('progress.ready'), t('progress.ready_detail'));
  } catch (error) {
    console.error(error);
    disposeCurrentInput();
    elements.previewStage.classList.add('is-empty');
    state.videoWidth = 0; state.videoHeight = 0;
    updateVideoQualityWarning();
    updateKeyboardStatus(t('error.open_video'));
    setProgress(0, t('progress.error'), error.message || String(error));
    showToast(error.message || t('error.open_video'), 'error');
    updateControlAvailability();
  }
}

function currentVelocityMidi() {
  const velocityPercent = clamp(Number(elements.velocity.value) || 75, 1, 100);
  return Math.max(1, Math.min(127, Math.round(127 * velocityPercent / 100)));
}

function regenerateMidiFromCurrentNotes() {
  if (!state.notes.length) return;
  const velocity = currentVelocityMidi();
  state.notes = state.notes.map(note => ({ ...note, velocity }));
  state.midiBlob = createMidiFile(state.notes, {
    trackName: state.fileBaseName,
    bpm: clamp(Number(elements.tempo.value) || 120, 20, 300),
  });
  updateControlAvailability();
}

function analysisOptions() {
  return {
    velocity: currentVelocityMidi(),
    baselineColors: state.releaseBaselineColors,
    // Fixed release-state comparison: 12 hue regions (30° each) plus an
    // absolute 50-point brightness change on a perceptual 0..100 scale.
    hueSectorDegrees: 30,
    brightnessChangePoints: 50,
    // White/black keys have no stable hue. Treat very low RGB chroma as one
    // neutral region so tiny codec/noise tint does not flip hue sectors.
    neutralChromaPercent: 6,
  };
}

function setAnalysisBusy(busy) {
  state.analyzing = busy;
  elements.cancelAnalysis.hidden = !busy;
  elements.analyzeVideo.hidden = busy;
  elements.cancelAnalysis.disabled = false;
  elements.cancelAnalysis.textContent = t('actions.cancel');
  updateControlAvailability();
}

function updatePostProcessingProgress(info) {
  if (!info) return;
  if (info.phase === 'notes') setProgress(0.76 + info.progress * 0.23, t('progress.color_compare'), info.detail);
  else if (info.phase === 'done') setProgress(1, t('progress.done'), info.detail);
}

async function analyzeAllFrames() {
  if (!state.track || state.analyzing) return;
  if (!state.keyboardDetectionConfirmed || !state.guide || !state.keyMap?.keys?.length) {
    showToast(t('toast.detect_required'), 'error');
    return;
  }
  if (!state.releaseBaselineColors || state.releaseBaselineColors.length !== state.keyMap.keys.length * PROBE_PATCH_COUNT * 3) {
    showToast(t('toast.detect_required'), 'error');
    return;
  }
  pausePlayback();
  const crop = getGuideCrop();
  if (!crop) return;
  const range = readAnalysisRange(true);
  if (!range) return;

  state.analysisAbort = false;
  setAnalysisBusy(true);
  resetResults();

  const targetWidth = Math.round(Math.min(1200, Math.max(480, crop.canonicalWidth)));
  const targetHeight = Math.round(clamp(crop.canonicalHeight * targetWidth / crop.canonicalWidth, 64, 420));
  const sourceTargetWidth = isHorizontalKeyboardSide(crop.side) ? targetWidth : targetHeight;
  const sourceTargetHeight = isHorizontalKeyboardSide(crop.side) ? targetHeight : targetWidth;
  const probes = createLineAnalysisProbes(
    state.keyMap,
    state.geometry.width,
    state.geometry.height,
    targetWidth,
    targetHeight,
    crop.whiteLineY,
    crop.blackLineY,
  );
  const validKeyMask = probes.map(probe => probe.valid !== false);
  const probeSampler = createLineProbeSampler(probes, targetWidth, targetHeight);
  const detector = new StreamingNoteDetector(state.keyMap.keys, { ...analysisOptions(), validKeyMask });
  let frameCount = 0;
  let lastUiUpdate = performance.now();

  try {
    const { CanvasSink } = state.mediabunny;
    const sink = new CanvasSink(state.track, {
      width: sourceTargetWidth,
      height: sourceTargetHeight,
      fit: 'fill',
      crop: {
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      },
      poolSize: 1,
      decoderOptions: { hardwareAcceleration: 'prefer-hardware' },
    });

    setProgress(0.01, t('progress.frame_analysis'), t('progress.frame_range', { start: formatTime(range.start), end: formatTime(range.end) }));
    const rangeStartTimestamp = state.timeOrigin + range.start;
    const rangeEndTimestamp = state.timeOrigin + range.end;
    const canonicalCanvas = document.createElement('canvas');
    for await (const wrapped of sink.canvases(rangeStartTimestamp, rangeEndTimestamp)) {
      if (state.analysisAbort) break;
      if (wrapped.timestamp + 1e-9 < rangeStartTimestamp) continue;
      if (wrapped.timestamp >= rangeEndTimestamp - 1e-9) break;
      const context = drawCanonicalSource(wrapped.canvas, null, canonicalCanvas, crop.side, targetWidth, targetHeight, crop.depthSign);
      const colors = sampleKeyColorsFromContext(context, probeSampler);
      const relativeTimestamp = Math.max(0, wrapped.timestamp - rangeStartTimestamp);
      detector.processFrame(relativeTimestamp, wrapped.duration, colors);
      frameCount += 1;

      const now = performance.now();
      if (now - lastUiUpdate > 130) {
        const progress = clamp(relativeTimestamp / Math.max(0.001, range.duration), 0, 1);
        setProgress(progress * 0.98, t('progress.frame_analysis'), t('progress.frame_count', { count: formatNumber(frameCount), current: formatTime(relativeTimestamp), duration: formatTime(range.duration) }));
        lastUiUpdate = now;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (state.analysisAbort) {
      setProgress(0, t('progress.cancelled'), t('progress.cancelled_detail', { count: formatNumber(frameCount) }));
      return;
    }
    if (!frameCount) throw new Error(t('error.no_frames'));

    const result = detector.finish();
    state.notes = result.notes
      .map(note => {
        const end = Math.min(range.duration, note.end);
        return { ...note, end, duration: Math.max(0, end - note.start) };
      })
      .filter(note => note.end > note.start);
    state.noteTimeOrigin = range.start;
    state.noteTimeEnd = range.end;
    state.midiBlob = createMidiFile(state.notes, {
      trackName: state.fileBaseName,
      bpm: clamp(Number(elements.tempo.value) || 120, 20, 300),
    });
    elements.noteCountResult.textContent = formatNumber(state.notes.length);
    updateCurrentChord();
    drawOverlay();
    setProgress(1, t('progress.done'), t('progress.notes_made', { count: formatNumber(state.notes.length) }));
    showToast(state.notes.length ? t('toast.midi_done') : t('toast.no_notes'));
  } catch (error) {
    console.error(error);
    setProgress(0, t('progress.analysis_error'), error.message || String(error));
    showToast(error.message || t('toast.analysis_error'), 'error');
  } finally {
    setAnalysisBusy(false);
    updateControlAvailability();
  }
}

function initializeEvents() {
  elements.videoFile.addEventListener('change', event => loadVideoFile(event.target.files?.[0]));
  for (const type of ['dragenter', 'dragover']) {
    elements.fileDrop.addEventListener(type, event => {
      event.preventDefault();
      elements.fileDrop.classList.add('dragover');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    elements.fileDrop.addEventListener(type, event => {
      event.preventDefault();
      elements.fileDrop.classList.remove('dragover');
    });
  }
  elements.fileDrop.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(item => item.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(item.name));
    if (file) loadVideoFile(file);
    else showToast(t('toast.no_video_file'), 'error');
  });

  elements.playPause.addEventListener('click', togglePlayback);
  elements.timeline.addEventListener('input', event => {
    pausePlayback();
    requestPreview(event.target.value);
  });
  elements.analysisStart.addEventListener('change', () => normalizeAnalysisRange('start'));
  elements.analysisEnd.addEventListener('change', () => normalizeAnalysisRange('end'));
  elements.analysisStart.addEventListener('input', updateAnalysisRangeLabel);
  elements.analysisEnd.addEventListener('input', updateAnalysisRangeLabel);
  elements.setStartCurrent.addEventListener('click', () => {
    elements.analysisStart.value = state.previewTime.toFixed(3);
    normalizeAnalysisRange('start');
  });
  elements.setEndCurrent.addEventListener('click', () => {
    elements.analysisEnd.value = state.previewTime.toFixed(3);
    normalizeAnalysisRange('end');
  });
  elements.jumpStart.addEventListener('click', () => { void jumpPreviewToBoundary(false); });
  elements.prev5Frame.addEventListener('click', () => { void stepPreviewFrames(-5); });
  elements.prevFrame.addEventListener('click', () => { void stepPreviewFrame(-1); });
  elements.nextFrame.addEventListener('click', () => { void stepPreviewFrame(1); });
  elements.next5Frame.addEventListener('click', () => { void stepPreviewFrames(5); });
  elements.jumpEnd.addEventListener('click', () => { void jumpPreviewToBoundary(true); });

  elements.overlayCanvas.addEventListener('pointerdown', onOverlayPointerDown);
  elements.overlayCanvas.addEventListener('pointermove', onOverlayPointerMove);
  elements.overlayCanvas.addEventListener('pointerup', event => { void finishGuideDrag(event, false); });
  elements.overlayCanvas.addEventListener('pointercancel', event => { void finishGuideDrag(event, true); });
  elements.overlayCanvas.addEventListener('pointerleave', () => {
    if (!state.dragMode) elements.overlayCanvas.style.cursor = 'default';
  });

  elements.leftmostNote.addEventListener('change', () => {
    state.noteManuallyChanged = true;
    invalidateKeyboardDetection(t('keyboard.detect_required'));
  });
  elements.velocity.addEventListener('input', () => {
    elements.velocityValue.textContent = `${elements.velocity.value}%`;
    regenerateMidiFromCurrentNotes();
  });
  elements.tempo.addEventListener('change', regenerateMidiFromCurrentNotes);
  elements.keyboardOrientationToggle.addEventListener('click', () => {
    const current = keyboardOrientationForSide(state.keyboardSide);
    setKeyboardOrientation(current === 'horizontal' ? 'vertical' : 'horizontal');
  });
  elements.detectKeys.addEventListener('click', () => { void confirmKeyboardDetection(); });
  elements.analyzeVideo.addEventListener('click', analyzeAllFrames);
  elements.cancelAnalysis.addEventListener('click', () => {
    state.analysisAbort = true;
    elements.cancelAnalysis.disabled = true;
    elements.cancelAnalysis.textContent = t('actions.cancel_requested');
  });
  elements.downloadMidi.addEventListener('click', () => {
    if (state.midiBlob) downloadBlob(state.midiBlob, `${state.fileBaseName}.mid`);
  });
  elements.tutorialButton?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const dialog = elements.tutorialDialog;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  elements.tutorialClose?.addEventListener('click', () => {
    const dialog = elements.tutorialDialog;
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });
  elements.tutorialDialog?.addEventListener('click', event => {
    if (event.target !== elements.tutorialDialog) return;
    if (typeof elements.tutorialDialog.close === 'function') elements.tutorialDialog.close();
  });
  window.addEventListener('beforeunload', disposeCurrentInput);
}

async function initialize() {
  await initializeLanguage();
  initializeHeaderUi();
  initializeThemeUi();
  onLanguageChange(() => {
    setPlaybackUi();
    updateAnalysisRangeLabel();
    updateCurrentChord();
    updateKeyboardStatus();
    renderDetectedKeyColors();
    updateVideoQualityWarning();
    drawOverlay();
    if (!state.track && !elements.runtimeError.hidden) {
      elements.runtimeError.textContent = window.isSecureContext ? t('error.webcodecs') : t('error.secure_context');
      setProgress(0, t('progress.runtime_check'), elements.runtimeError.textContent);
    } else if (!state.analyzing) {
      if (!state.track) setProgress(0, t('progress.waiting'), t('progress.select_video'));
      else if (state.notes.length) setProgress(1, t('progress.done'), t('progress.notes_made', { count: formatNumber(state.notes.length) }));
      else setProgress(0, t('progress.ready'), t('progress.ready_detail'));
    }
    if (!state.track && elements.fileName) elements.fileName.textContent = t('file.prompt');
  });
  setPlaybackUi();
  populateNoteOptions();
  updateKeyboardOrientationButtons();
  initializeEvents();
  updateControlAvailability();

  if (!window.isSecureContext || !window.VideoDecoder) {
    elements.runtimeError.hidden = false;
    elements.runtimeError.textContent = window.isSecureContext
      ? t('error.webcodecs')
      : t('error.secure_context');
    setProgress(0, t('progress.runtime_check'), elements.runtimeError.textContent);
    return;
  }

  try {
    state.mediabunny = await loadMediabunny();
    updateControlAvailability();
  } catch (error) {
    console.error(error);
    elements.runtimeError.hidden = false;
    elements.runtimeError.textContent = t('error.library_load');
    setProgress(0, t('progress.library_error'), elements.runtimeError.textContent);
  }
}

initialize();
