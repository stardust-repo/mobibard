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
import { StreamingNoteDetector } from './analysis.js?v=20260829-centercolor1';
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
  'playPause', 'prevFrame', 'nextFrame', 'timeline', 'timeLabel', 'currentChord', 'keyboardStatus',
  'analysisStart', 'analysisEnd', 'analysisRangeLabel', 'setStartCurrent', 'setEndCurrent',
  'leftmostNote', 'tempo', 'velocity', 'velocityValue', 'resetSetup', 'analyzeVideo', 'cancelAnalysis', 'progressBar',
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
  guide: null, // { x0, x1, blackY, whiteY }
  geometry: null,
  keyMap: null,
  initialSetup: null,
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
  elements.playPause.textContent = state.playing ? t('transport.pause') : t('transport.play');
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
    setProgress(0, t('progress.waiting'), state.track ? t('progress.idle_detail') : t('progress.select_video'));
  }
}

function updateControlAvailability() {
  const hasVideo = Boolean(state.track);
  const hasKeys = Boolean(state.keyMap?.keys?.length);
  const hasBaseline = Boolean(state.releaseBaselineColors?.length === (state.keyMap?.keys?.length || 0) * PROBE_PATCH_COUNT * 3);
  const locked = state.analyzing;
  elements.videoFile.disabled = locked || !state.mediabunny;
  elements.timeline.disabled = !hasVideo || locked;
  elements.playPause.disabled = !hasVideo || locked;
  elements.prevFrame.disabled = !hasVideo || locked;
  elements.nextFrame.disabled = !hasVideo || locked;
  elements.analysisStart.disabled = !hasVideo || locked;
  elements.analysisEnd.disabled = !hasVideo || locked;
  elements.setStartCurrent.disabled = !hasVideo || locked;
  elements.setEndCurrent.disabled = !hasVideo || locked;
  elements.leftmostNote.disabled = !hasKeys || locked;
  elements.resetSetup.disabled = !state.initialSetup || locked;
  elements.analyzeVideo.disabled = !hasKeys || !hasBaseline || locked;
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

function cloneGuide(guide) {
  return guide ? { x0: guide.x0, x1: guide.x1, blackY: guide.blackY, whiteY: guide.whiteY } : null;
}

function normalizeGuide(guide) {
  if (!guide) return null;
  const minWidth = Math.max(60, state.displayWidth * 0.10);
  const minGap = Math.max(14, state.displayHeight * 0.025);
  let x0 = clamp(Math.min(guide.x0, guide.x1), 0, state.displayWidth);
  let x1 = clamp(Math.max(guide.x0, guide.x1), 0, state.displayWidth);
  if (x1 - x0 < minWidth) {
    const center = (x0 + x1) / 2;
    x0 = clamp(center - minWidth / 2, 0, Math.max(0, state.displayWidth - minWidth));
    x1 = clamp(x0 + minWidth, minWidth, state.displayWidth);
  }
  let blackY = clamp(guide.blackY, 0, Math.max(0, state.displayHeight - minGap));
  let whiteY = clamp(guide.whiteY, minGap, state.displayHeight);
  if (whiteY - blackY < minGap) {
    const center = (blackY + whiteY) / 2;
    blackY = clamp(center - minGap / 2, 0, Math.max(0, state.displayHeight - minGap));
    whiteY = clamp(blackY + minGap, minGap, state.displayHeight);
  }
  return { x0, x1, blackY, whiteY };
}

/**
 * Builds the invisible analysis crop from the two visible guide lines.
 * All values returned to Mediabunny are integer source pixels.
 */
function getGuideCrop() {
  const guide = normalizeGuide(state.guide);
  if (!guide) return null;
  const gap = Math.max(1, guide.whiteY - guide.blackY);
  const left = clamp(Math.floor(guide.x0), 0, Math.max(0, state.displayWidth - 1));
  const right = clamp(Math.ceil(guide.x1), left + 1, state.displayWidth);

  // Geometry detection must keep seeing the real black-key bodies even when
  // the user moves the two sampling lines close together. v5 based this crop
  // almost entirely on the line gap, which could crop the black keys away and
  // make white-key separators look like black keys.
  const upperPadding = Math.max(gap * 0.75, state.displayHeight * 0.12);
  const lowerPadding = Math.max(gap * 0.45, state.displayHeight * 0.045);
  const top = clamp(Math.floor(Math.min(guide.blackY, guide.whiteY) - upperPadding), 0, Math.max(0, state.displayHeight - 2));
  const bottom = clamp(Math.ceil(Math.max(guide.blackY, guide.whiteY) + lowerPadding), top + 2, state.displayHeight);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(2, bottom - top),
    blackLineY: clamp(guide.blackY - top, 0, Math.max(1, bottom - top - 1)),
    whiteLineY: clamp(guide.whiteY - top, 0, Math.max(1, bottom - top - 1)),
  };
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
  if (!state.keyMap || !state.geometry || !crop) return;
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
    const x0 = crop.left + Math.min(...probe.patches.map(patch => patch.x0));
    const x1 = crop.left + Math.max(...probe.patches.map(patch => patch.x1));
    const y0 = crop.top + Math.min(...probe.patches.map(patch => patch.y0));
    const y1 = crop.top + Math.max(...probe.patches.map(patch => patch.y1));
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);

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

    // One outlined box per key. The internal dividers show the exact three
    // sub-patches whose colors are sampled independently during analysis.
    context.lineWidth = Math.max(1.5, 1.35 * scale);
    context.fillRect(x0, y0, width, height);
    context.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

    for (let patchIndex = 0; patchIndex < probe.patches.length - 1; patchIndex += 1) {
      const splitX = crop.left + probe.patches[patchIndex].x1;
      context.beginPath();
      context.moveTo(splitX, y0);
      context.lineTo(splitX, y1);
      context.stroke();
    }

    if (invalid) {
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.moveTo(x1, y0);
      context.lineTo(x0, y1);
      context.stroke();
    }
  }
  context.restore();
}

function drawGuideLine(context, y, color, label, scale) {
  const guide = state.guide;
  const lineWidth = Math.max(2.2 * scale, 1.5);
  context.save();
  context.globalAlpha = 0.72;
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(guide.x0, y);
  context.lineTo(guide.x1, y);
  context.stroke();

  const radius = Math.max(6 * scale, 5);
  drawGuideHandle(context, guide.x0, y, radius, color);
  drawGuideHandle(context, guide.x1, y, radius, color);

  const fontSize = Math.max(11 * scale, 10);
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'bottom';
  context.fillStyle = color;
  const labelX = clamp(guide.x0 + 10 * scale, 4, Math.max(4, state.displayWidth - 120 * scale));
  context.fillText(label, labelX, y - 7 * scale);
  context.restore();
}

function drawOverlay() {
  const context = overlayContext;
  context.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
  if (!state.guide) return;

  const scale = canvasUnitsPerCssPixel();
  const crop = getGuideCrop();
  // Draw guide lines first, then the actual per-key sample boxes on top so the
  // line itself can never hide where pixels are being read.
  drawGuideLine(context, state.guide.whiteY, '#55d8ff', t('overlay.white'), scale);
  drawGuideLine(context, state.guide.blackY, '#ff70d2', t('overlay.black'), scale);
  drawDetectionAreas(context, crop, scale);
}

function hitTest(point) {
  const guide = state.guide;
  if (!guide) return null;
  const scale = canvasUnitsPerCssPixel();
  const threshold = 13 * scale;
  const endpointRadius = 16 * scale;
  const endpoints = [guide.blackY, guide.whiteY];

  for (const y of endpoints) {
    if (Math.hypot(point.x - guide.x0, point.y - y) <= endpointRadius) return 'left';
    if (Math.hypot(point.x - guide.x1, point.y - y) <= endpointRadius) return 'right';
  }

  if (point.x >= guide.x0 - threshold && point.x <= guide.x1 + threshold) {
    if (Math.abs(point.y - guide.blackY) <= threshold) return 'black';
    if (Math.abs(point.y - guide.whiteY) <= threshold) return 'white';
  }
  return null;
}

function cursorForMode(mode) {
  if (mode === 'left' || mode === 'right') return 'ew-resize';
  if (mode === 'black' || mode === 'white') return 'ns-resize';
  return 'default';
}

function captureReleaseBaseline({ quiet = false } = {}) {
  if (!state.keyMap?.keys?.length || !state.geometry || !state.guide) return false;
  const crop = getGuideCrop();
  if (!crop) return false;
  try {
    const roi = cropImageData(previewContext, {
      x: crop.left,
      y: crop.top,
      width: crop.width,
      height: crop.height,
    });
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
    if (!quiet) showToast(t('toast.baseline_fixed', { time: formatTime(state.releaseBaselineTime) }));
    return true;
  } catch (error) {
    console.error(error);
    state.releaseBaselineColors = null;
    state.releaseBaselineTime = 0;
    return false;
  }
}

function updateKeyboardStatus(message = '') {
  if (message) {
    elements.keyboardStatus.textContent = message;
    return;
  }
  if (!state.guide) {
    elements.keyboardStatus.textContent = t('keyboard.no_video');
    return;
  }
  if (!state.keyMap) {
    elements.keyboardStatus.textContent = t('keyboard.adjust_guides');
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
  if (!state.geometry) return;
  state.keyMap = createKeyMap(state.geometry, Number(elements.leftmostNote.value));
  resetResults();
  updateKeyboardStatus();
  drawOverlay();
  updateControlAvailability();
}

function detectKeysFromGuides({ quiet = false, captureBaseline = true } = {}) {
  if (!state.guide || !state.track) return false;
  const crop = getGuideCrop();
  if (!crop || crop.width < 40 || crop.height < 24) return false;
  try {
    const roi = cropImageData(previewContext, {
      x: crop.left,
      y: crop.top,
      width: crop.width,
      height: crop.height,
    });
    state.geometry = detectKeyGeometry(roi);
    if (!state.noteManuallyChanged) elements.leftmostNote.value = String(suggestLeftmostMidi(state.geometry));
    state.keyMap = createKeyMap(state.geometry, Number(elements.leftmostNote.value));
    if (captureBaseline) captureReleaseBaseline({ quiet: true });
    resetResults();
    updateKeyboardStatus();
    updateVideoQualityWarning();
    drawOverlay();
    updateControlAvailability();
    if (!quiet) showToast(t('toast.detect_updated'));
    return true;
  } catch (error) {
    console.error(error);
    state.geometry = null;
    state.keyMap = null;
    state.releaseBaselineColors = null;
    state.releaseBaselineTime = 0;
    resetResults();
    updateKeyboardStatus(t('keyboard.detect_failed_hint'));
    drawOverlay();
    updateControlAvailability();
    if (!quiet) showToast(t('toast.detect_failed'), 'error');
    return false;
  }
}

function fallbackInitialRect() {
  return {
    x: Math.round(state.displayWidth * 0.04),
    y: Math.round(state.displayHeight * 0.62),
    width: Math.round(state.displayWidth * 0.92),
    height: Math.round(state.displayHeight * 0.34),
  };
}

function setupInitialGuides() {
  const frame = previewContext.getImageData(0, 0, state.displayWidth, state.displayHeight);
  let rect;
  try { rect = autoDetectKeyboardRegion(frame).rect; }
  catch { rect = fallbackInitialRect(); }

  rect = {
    x: clamp(rect.x, 0, state.displayWidth - 1),
    y: clamp(rect.y, 0, state.displayHeight - 1),
    width: clamp(rect.width, 40, state.displayWidth),
    height: clamp(rect.height, 24, state.displayHeight),
  };
  const right = clamp(rect.x + rect.width, rect.x + 40, state.displayWidth);
  const bottom = clamp(rect.y + rect.height, rect.y + 24, state.displayHeight);
  const height = bottom - rect.y;

  // Initial proposal: keep both sampling lines toward the lower part of the keyboard.
  // Black stays inside the lower half of typical black-key bodies; white sits near the key fronts.
  state.guide = normalizeGuide({
    x0: rect.x,
    x1: right,
    blackY: rect.y + height * 0.64,
    whiteY: rect.y + height * 0.95,
  });
  state.noteManuallyChanged = false;
  detectKeysFromGuides({ quiet: true });

  state.initialSetup = {
    guide: cloneGuide(state.guide),
    leftmostNote: elements.leftmostNote.value,
    releaseBaselineColors: state.releaseBaselineColors ? new Uint8Array(state.releaseBaselineColors) : null,
    releaseBaselineTime: state.releaseBaselineTime,
  };
  resetResults();
  updateKeyboardStatus();
  drawOverlay();
  updateControlAvailability();
}

function resetSetup() {
  if (!state.initialSetup) return;
  pausePlayback();
  state.guide = cloneGuide(state.initialSetup.guide);
  elements.leftmostNote.value = state.initialSetup.leftmostNote;
  state.noteManuallyChanged = false;
  detectKeysFromGuides({ quiet: true, captureBaseline: false });
  state.releaseBaselineColors = state.initialSetup.releaseBaselineColors
    ? new Uint8Array(state.initialSetup.releaseBaselineColors)
    : null;
  state.releaseBaselineTime = state.initialSetup.releaseBaselineTime || 0;
  updateKeyboardStatus();
  drawOverlay();
  updateControlAvailability();
  showToast(t('toast.reset'));
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

  const original = state.dragOriginalGuide;
  if (!original) return;
  const minWidth = Math.max(60, state.displayWidth * 0.10);
  const minGap = Math.max(14, state.displayHeight * 0.025);

  if (state.dragMode === 'left') {
    state.guide.x0 = clamp(point.x, 0, state.guide.x1 - minWidth);
  } else if (state.dragMode === 'right') {
    state.guide.x1 = clamp(point.x, state.guide.x0 + minWidth, state.displayWidth);
  } else if (state.dragMode === 'black') {
    state.guide.blackY = clamp(point.y, 0, state.guide.whiteY - minGap);
  } else if (state.dragMode === 'white') {
    state.guide.whiteY = clamp(point.y, state.guide.blackY + minGap, state.displayHeight);
  }
  state.guide = normalizeGuide(state.guide);
  drawOverlay();
}

async function finishGuideDrag(event, cancelled = false) {
  if (!state.dragMode) return;
  if (cancelled && state.dragOriginalGuide) state.guide = cloneGuide(state.dragOriginalGuide);
  state.dragMode = null;
  try { elements.overlayCanvas.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  elements.overlayCanvas.style.cursor = cursorForMode(hitTest(canvasPoint(event)));
  // Cached stepping frames may be downscaled for speed. Refresh the exact source
  // frame before recapturing keyboard geometry/baseline so analysis precision is unchanged.
  if (!cancelled && state.previewFromFrameCache) {
    await renderPreview(state.previewFrameTime, true);
  }
  detectKeysFromGuides({ quiet: true });
}

async function loadVideoFile(file) {
  if (!file || state.analyzing || !state.mediabunny) return;
  pausePlayback();
  disposeCurrentInput();
  resetResults();
  state.guide = null;
  state.geometry = null;
  state.keyMap = null;
  state.initialSetup = null;
  state.releaseBaselineColors = null;
  state.releaseBaselineTime = 0;
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
    // v13: a press may become ANY color. The only fixed reference is the
    // released color captured while adjusting the keyboard.
    clearDeltaE: 18,
    minChromaticShift: 16,
    // Three sub-patches must move in roughly the same color direction.
    minPatchBalance: 0.46,
    minPatchDirectionCosine: 0.70,
    // Brightness-invariant center-color gate. Pure brightening/darkening keeps
    // the RGB direction unchanged and must not become a Note On.
    minCenterColorAngle: 0.75,
    minMedianColorAngle: 0.60,
    // Black keys are judged spatially, not by hue angle. A real black-key
    // press may become almost neutral white while bloom edges become purple.
    // Require a local outlier versus nearby black keys, then accept either a
    // strong neutral lightness rise or a strong residual color change.
    blackMinStandaloneLightnessRise: 24,
    blackMinLocalLightnessResidual: 12,
    blackLocalLightnessMadMultiplier: 2.4,
    blackLocalLightnessSlack: 2.0,
    blackMinLocalLabResidual: 18,
    blackLocalLabMadMultiplier: 2.2,
    blackLocalLabSlack: 3.0,
    blackMinColorLocalLightnessResidual: 8,
    blackColorLightnessMadMultiplier: 1.4,
    blackColorLightnessSlack: 1.0,
    blackMinResidualLightnessRise: 14,
    blackMinResidualDeltaE: 15,
    blackMinResidualChromaticShift: 12,
    // Estimate same-frame glow/lighting from nearby same-type keys and remove
    // that common component before accepting the note.
    neighborRadius: 5,
    neighborQuietFraction: 0.5,
    minCommonEffectChroma: 6,
    minCommonEffectLab: 8,
    minResidualDeltaE: 11,
    minResidualChromaticShift: 11,
    minResidualPatchBalance: 0.38,
    minResidualDirectionCosine: 0.58,
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
  if (!state.track || !state.guide || !state.keyMap?.keys?.length || state.analyzing) return;
  if (!state.releaseBaselineColors || state.releaseBaselineColors.length !== state.keyMap.keys.length * PROBE_PATCH_COUNT * 3) {
    showToast(t('toast.baseline_missing'), 'error');
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

  const targetWidth = Math.round(Math.min(1200, Math.max(480, crop.width)));
  const targetHeight = Math.round(clamp(crop.height * targetWidth / crop.width, 64, 420));
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
      width: targetWidth,
      height: targetHeight,
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
    for await (const wrapped of sink.canvases(rangeStartTimestamp, rangeEndTimestamp)) {
      if (state.analysisAbort) break;
      const context = wrapped.canvas.getContext('2d', { willReadFrequently: true });
      if (wrapped.timestamp + 1e-9 < rangeStartTimestamp) continue;
      if (wrapped.timestamp >= rangeEndTimestamp - 1e-9) break;
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
  elements.prevFrame.addEventListener('click', () => { void stepPreviewFrame(-1); });
  elements.nextFrame.addEventListener('click', () => { void stepPreviewFrame(1); });

  elements.overlayCanvas.addEventListener('pointerdown', onOverlayPointerDown);
  elements.overlayCanvas.addEventListener('pointermove', onOverlayPointerMove);
  elements.overlayCanvas.addEventListener('pointerup', event => { void finishGuideDrag(event, false); });
  elements.overlayCanvas.addEventListener('pointercancel', event => { void finishGuideDrag(event, true); });
  elements.overlayCanvas.addEventListener('pointerleave', () => {
    if (!state.dragMode) elements.overlayCanvas.style.cursor = 'default';
  });

  elements.leftmostNote.addEventListener('change', () => {
    state.noteManuallyChanged = true;
    rebuildKeyMap();
  });
  elements.velocity.addEventListener('input', () => {
    elements.velocityValue.textContent = `${elements.velocity.value}%`;
    regenerateMidiFromCurrentNotes();
  });
  elements.tempo.addEventListener('change', regenerateMidiFromCurrentNotes);
  elements.resetSetup.addEventListener('click', resetSetup);
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
  populateNoteOptions();
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
