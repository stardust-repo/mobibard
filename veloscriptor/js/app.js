import { makeOutputFileName, parseMidiForVelocity, patchMidiVelocities } from './midi.js?v=20260830-site-nav1';
import { initializeLanguage, onLanguageChange, t } from './language-manager.js?v=20260831-ja-labels1';

const TARGET_SAMPLE_RATE = 16000;
const AUTO_BASE_VELOCITY = 96;
const AUTO_DYNAMIC_PERCENT = 100;
const AUTO_COMPENSATE_CONTROLLERS = true;
const state = {
  midiFile: null,
  audioFile: null,
  midi: null,
  audioCache: null,
  outputBytes: null,
  outputName: '',
  velocityMap: null,
  summary: null,
  analyzing: false,
  taskId: 0,
  worker: null,
  statusKey: 'status.select_files',
  statusValues: {},
  statusDetailKey: 'status.select_files_detail',
  statusDetailValues: {},
};

const ids = [
  'midiFile', 'audioFile', 'midiDrop', 'audioDrop', 'midiFileName', 'audioFileName', 'midiInfo', 'audioInfo',
  'audioOffset', 'midiSiteLinks', 'analyzeButton', 'progressBar', 'progressLabel', 'progressDetail',
  'resultCount', 'resultPanel', 'resultSummary', 'resultOriginalStats', 'resultNewStats', 'histogram',
  'downloadMidi', 'resetResult', 'runtimeError', 'toast',
];
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

function formatDuration(seconds) {
  const numeric = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(numeric / 60);
  const remain = numeric - minutes * 60;
  return `${minutes}:${remain.toFixed(2).padStart(5, '0')}`;
}

function formatBytes(size) {
  const value = Math.max(0, Number(size) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function setStatus(labelKey, detailKey, labelValues = {}, detailValues = {}) {
  state.statusKey = labelKey;
  state.statusValues = labelValues;
  state.statusDetailKey = detailKey;
  state.statusDetailValues = detailValues;
  renderStatus();
}

function renderStatus() {
  if (elements.progressLabel) elements.progressLabel.textContent = t(state.statusKey, state.statusValues);
  if (elements.progressDetail) elements.progressDetail.textContent = t(state.statusDetailKey, state.statusDetailValues);
}

function setProgress(value) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
}

let toastTimer = 0;
function showToast(message, error = false) {
  if (!elements.toast) return;
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.classList.add('show');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function clearResult() {
  state.outputBytes = null;
  state.outputName = '';
  state.velocityMap = null;
  state.summary = null;
  elements.resultPanel.hidden = true;
  elements.downloadMidi.disabled = true;
  elements.resetResult.disabled = true;
  elements.resultCount.textContent = '0';
  elements.histogram.replaceChildren();
}

function updateReadyState({ refreshStatus = true } = {}) {
  const ready = Boolean(state.midi && state.audioFile);
  elements.analyzeButton.disabled = !ready && !state.analyzing;
  elements.midiDrop.classList.toggle('is-ready', Boolean(state.midi));
  elements.audioDrop.classList.toggle('is-ready', Boolean(state.audioFile));
  if (refreshStatus && !state.analyzing && !state.outputBytes) {
    if (ready) setStatus('status.ready', 'status.ready_detail');
    else setStatus('status.select_files', 'status.select_files_detail');
  }
}

function updateMidiUi() {
  if (!state.midiFile || !state.midi) {
    elements.midiFileName.textContent = t('file.midi_prompt');
    elements.midiInfo.hidden = true;
    elements.midiInfo.textContent = '';
    return;
  }
  elements.midiFileName.textContent = state.midiFile.name;
  elements.midiInfo.hidden = false;
  elements.midiInfo.textContent = t('file.midi_info', {
    tracks: state.midi.trackCount,
    notes: state.midi.noteEvents.length,
    melodic: state.midi.melodicNotes.length,
    drums: state.midi.drumNotes.length,
    duration: formatDuration(state.midi.durationSeconds),
  });
}

function updateAudioUi() {
  if (!state.audioFile) {
    elements.audioFileName.textContent = t('file.audio_prompt');
    elements.audioInfo.hidden = true;
    elements.audioInfo.textContent = '';
    return;
  }
  elements.audioFileName.textContent = state.audioFile.name;
  elements.audioInfo.hidden = false;
  const duration = state.audioCache?.file === state.audioFile ? formatDuration(state.audioCache.duration) : t('file.audio_duration_pending');
  elements.audioInfo.textContent = t('file.audio_info', { size: formatBytes(state.audioFile.size), duration });
}

async function loadMidi(file) {
  if (!file) return;
  clearResult();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseMidiForVelocity(bytes);
    if (!parsed.noteEvents.length) throw new Error(t('error.no_notes'));
    state.midiFile = file;
    state.midi = parsed;
    updateMidiUi();
    updateReadyState();
    showToast(t('toast.midi_loaded', { count: parsed.noteEvents.length }));
  } catch (error) {
    state.midiFile = null;
    state.midi = null;
    updateMidiUi();
    updateReadyState();
    showToast(error?.message || t('error.midi_open'), true);
  }
}

function loadAudio(file) {
  if (!file) return;
  clearResult();
  state.audioFile = file;
  if (state.audioCache?.file !== file) state.audioCache = null;
  updateAudioUi();
  updateReadyState();
  showToast(t('toast.audio_loaded'));
}

function setupDropZone(zone, input, callback) {
  input.addEventListener('change', () => {
    const [file] = input.files || [];
    if (file) callback(file);
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, event => {
      event.preventDefault();
      if (!state.analyzing) zone.classList.add('is-dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.remove('is-dragging');
    });
  }
  zone.addEventListener('drop', event => {
    if (state.analyzing) return;
    const [file] = event.dataTransfer?.files || [];
    if (file) callback(file);
  });
}

async function decodeAudio(file, taskId) {
  if (state.audioCache?.file === file && state.audioCache.samples) return state.audioCache;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error(t('error.web_audio'));
  setStatus('status.decoding', 'status.decoding_detail');
  setProgress(4);
  const sourceBytes = await file.arrayBuffer();
  if (taskId !== state.taskId) throw new DOMException('Cancelled', 'AbortError');
  const context = new AudioContextClass();
  let buffer;
  try {
    buffer = await context.decodeAudioData(sourceBytes.slice(0));
  } finally {
    try { await context.close(); } catch (_) {}
  }
  if (taskId !== state.taskId) throw new DOMException('Cancelled', 'AbortError');
  if (!buffer?.length || !buffer.numberOfChannels) throw new Error(t('error.audio_decode'));

  setStatus('status.resampling', 'status.resampling_detail');
  const samples = await mixAndResample(buffer, TARGET_SAMPLE_RATE, taskId, fraction => setProgress(12 + fraction * 24));
  const cache = { file, samples, sampleRate: TARGET_SAMPLE_RATE, duration: buffer.duration, channels: buffer.numberOfChannels };
  state.audioCache = cache;
  updateAudioUi();
  const midiDuration = Number(state.midi?.durationSeconds) || 0;
  const durationGap = Math.abs(cache.duration - midiDuration);
  if (midiDuration > 0 && durationGap > Math.max(3, midiDuration * 0.08)) {
    showToast(t('toast.duration_mismatch', { midi: formatDuration(midiDuration), audio: formatDuration(cache.duration) }), true);
  }
  return cache;
}

async function mixAndResample(buffer, targetRate, taskId, onProgress) {
  const outputLength = Math.max(1, Math.ceil(buffer.duration * targetRate));
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OfflineContext) {
    try {
      onProgress?.(0.08);
      const offline = new OfflineContext(1, outputLength, targetRate);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      if (taskId !== state.taskId) throw new DOMException('Cancelled', 'AbortError');
      onProgress?.(1);
      return rendered.getChannelData(0).slice();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('OfflineAudioContext resampling failed; using linear fallback.', error);
    }
  }

  const sourceRate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  const chunkSize = 24000;
  for (let chunkStart = 0; chunkStart < outputLength; chunkStart += chunkSize) {
    if (taskId !== state.taskId) throw new DOMException('Cancelled', 'AbortError');
    const chunkEnd = Math.min(outputLength, chunkStart + chunkSize);
    for (let outputIndex = chunkStart; outputIndex < chunkEnd; outputIndex += 1) {
      const sourcePosition = outputIndex * ratio;
      const index0 = Math.min(buffer.length - 1, Math.floor(sourcePosition));
      const index1 = Math.min(buffer.length - 1, index0 + 1);
      const fraction = sourcePosition - index0;
      let mixed = 0;
      for (const data of channels) mixed += data[index0] + ((data[index1] - data[index0]) * fraction);
      output[outputIndex] = mixed / channels.length;
    }
    onProgress?.(chunkEnd / outputLength);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return output;
}

function runWorker(audio, taskId) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./audio-worker.js?v=20260830-site-nav1', import.meta.url));
    state.worker = worker;
    worker.addEventListener('message', event => {
      if (taskId !== state.taskId) return;
      const message = event.data || {};
      if (message.type === 'progress') {
        const fraction = message.total ? message.completed / message.total : 0;
        setProgress(38 + fraction * 56);
        setStatus('status.analyzing', 'status.analyzing_detail', {}, { current: message.completed, total: message.total });
      } else if (message.type === 'done') {
        worker.terminate();
        if (state.worker === worker) state.worker = null;
        resolve(message);
      } else if (message.type === 'error') {
        worker.terminate();
        if (state.worker === worker) state.worker = null;
        reject(new Error(message.message || t('error.analysis')));
      }
    });
    worker.addEventListener('error', event => {
      worker.terminate();
      if (state.worker === worker) state.worker = null;
      reject(new Error(event.message || t('error.analysis')));
    });

    const workerSamples = audio.samples.slice();
    const notes = state.midi.melodicNotes.map(note => ({
      index: note.index,
      time: note.time,
      midi: note.midi,
      channel: note.channel,
      originalVelocity: note.originalVelocity,
      channelVolume: note.channelVolume,
      expression: note.expression,
      program: note.program,
      bankMsb: note.bankMsb,
      bankLsb: note.bankLsb,
    }));
    worker.postMessage({
      type: 'analyze',
      samples: workerSamples,
      sampleRate: audio.sampleRate,
      notes,
      offsetSeconds: Math.min(10, Math.max(-10, (Number(elements.audioOffset.value) || 0) / 1000)),
      baseVelocity: AUTO_BASE_VELOCITY,
      dynamicPercent: AUTO_DYNAMIC_PERCENT,
      compensateControllers: AUTO_COMPENSATE_CONTROLLERS,
    }, [workerSamples.buffer]);
  });
}

function velocityStats(values) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const raw of values) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    count += 1;
  }
  if (!count) return { min: 0, max: 0, average: 0 };
  return { min, max, average: sum / count };
}

function renderHistogram(original, analyzed) {
  const binCount = 16;
  const originalBins = new Array(binCount).fill(0);
  const analyzedBins = new Array(binCount).fill(0);
  for (const value of original) originalBins[Math.min(binCount - 1, Math.floor((Math.max(1, value) - 1) / 8))] += 1;
  for (const value of analyzed) analyzedBins[Math.min(binCount - 1, Math.floor((Math.max(1, value) - 1) / 8))] += 1;
  const maximum = Math.max(1, ...originalBins, ...analyzedBins);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < binCount; index += 1) {
    const column = document.createElement('div');
    column.className = 'histogram-column';
    const bars = document.createElement('div');
    bars.className = 'histogram-bars';
    const originalBar = document.createElement('span');
    originalBar.className = 'histogram-bar is-original';
    originalBar.style.height = `${Math.max(2, originalBins[index] / maximum * 100)}%`;
    originalBar.title = t('result.histogram_original_title', { min: index * 8 + 1, max: Math.min(127, index * 8 + 8), count: originalBins[index] });
    const analyzedBar = document.createElement('span');
    analyzedBar.className = 'histogram-bar is-analyzed';
    analyzedBar.style.height = `${Math.max(2, analyzedBins[index] / maximum * 100)}%`;
    analyzedBar.title = t('result.histogram_analyzed_title', { min: index * 8 + 1, max: Math.min(127, index * 8 + 8), count: analyzedBins[index] });
    bars.append(originalBar, analyzedBar);
    const label = document.createElement('span');
    label.className = 'histogram-label';
    label.textContent = index % 3 === 0 || index === binCount - 1 ? String(index * 8 + 1) : '';
    column.append(bars, label);
    fragment.append(column);
  }
  elements.histogram.replaceChildren(fragment);
}

function renderResult(resultMessage, patched) {
  const resultMap = new Map(resultMessage.results.map(result => [result.index, result.velocity]));
  const originalValues = state.midi.melodicNotes.map(note => note.originalVelocity);
  const newValues = state.midi.melodicNotes.map(note => resultMap.get(note.index) ?? note.originalVelocity);
  const originalStats = velocityStats(originalValues);
  const newStats = velocityStats(newValues);
  const summary = resultMessage.summary || {};

  elements.resultCount.textContent = String(summary.analyzedCount || 0);
  elements.resultSummary.textContent = t('result.summary', {
    analyzed: summary.analyzedCount || 0,
    changed: patched.changedCount,
    drums: state.midi.drumNotes.length,
    skipped: (summary.outsideCount || 0) + (summary.silentCount || 0),
  });
  elements.resultOriginalStats.textContent = t('result.stats_values', {
    min: originalStats.min,
    avg: originalStats.average.toFixed(1),
    max: originalStats.max,
  });
  elements.resultNewStats.textContent = t('result.stats_values', {
    min: newStats.min,
    avg: newStats.average.toFixed(1),
    max: newStats.max,
  });
  renderHistogram(originalValues, newValues);
  elements.resultPanel.hidden = false;
  elements.downloadMidi.disabled = false;
  elements.resetResult.disabled = false;
}

async function startAnalysis() {
  if (state.analyzing) {
    cancelAnalysis();
    return;
  }
  if (!state.midi || !state.audioFile) {
    showToast(t('error.files_required'), true);
    return;
  }
  if (!state.midi.melodicNotes.length) {
    showToast(t('error.no_melodic_notes'), true);
    return;
  }

  clearResult();
  state.analyzing = true;
  state.taskId += 1;
  const taskId = state.taskId;
  elements.analyzeButton.disabled = false;
  elements.analyzeButton.classList.add('is-cancel');
  elements.analyzeButton.textContent = t('actions.cancel');
  elements.midiFile.disabled = true;
  elements.audioFile.disabled = true;
  setProgress(0);

  try {
    const audio = await decodeAudio(state.audioFile, taskId);
    if (taskId !== state.taskId) return;
    setStatus('status.analyzing', 'status.analyzing_start');
    setProgress(38);
    const resultMessage = await runWorker(audio, taskId);
    if (taskId !== state.taskId) return;
    setStatus('status.writing', 'status.writing_detail');
    setProgress(97);
    const velocityMap = new Map(resultMessage.results.map(result => [result.index, result.velocity]));
    const patched = patchMidiVelocities(state.midi, velocityMap);
    state.outputBytes = patched.bytes;
    state.outputName = makeOutputFileName(state.midiFile.name);
    state.velocityMap = velocityMap;
    state.summary = resultMessage.summary;
    renderResult(resultMessage, patched);
    setProgress(100);
    setStatus('status.done', 'status.done_detail', {}, { count: resultMessage.summary?.analyzedCount || 0 });
    showToast(t('toast.analysis_done'));
  } catch (error) {
    if (error?.name === 'AbortError' || taskId !== state.taskId) return;
    console.error(error);
    setProgress(0);
    setStatus('status.error', 'status.error_detail');
    showToast(error?.message || t('error.analysis'), true);
  } finally {
    if (taskId === state.taskId) {
      state.analyzing = false;
      state.worker?.terminate();
      state.worker = null;
      elements.analyzeButton.classList.remove('is-cancel');
      elements.analyzeButton.textContent = t('actions.analyze');
      elements.midiFile.disabled = false;
      elements.audioFile.disabled = false;
      updateReadyState({ refreshStatus: false });
    }
  }
}

function cancelAnalysis() {
  if (!state.analyzing) return;
  state.taskId += 1;
  state.worker?.terminate();
  state.worker = null;
  state.analyzing = false;
  elements.analyzeButton.classList.remove('is-cancel');
  elements.analyzeButton.textContent = t('actions.analyze');
  elements.midiFile.disabled = false;
  elements.audioFile.disabled = false;
  setProgress(0);
  updateReadyState({ refreshStatus: false });
  setStatus('status.cancelled', 'status.cancelled_detail');
}

function downloadResult() {
  if (!state.outputBytes) return;
  const blob = new Blob([state.outputBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.outputName || 'music_audio_velocity.mid';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t('toast.downloaded'));
}

function resetResult() {
  clearResult();
  setProgress(0);
  updateReadyState();
}

function rerenderLocalizedState() {
  updateMidiUi();
  updateAudioUi();
  renderStatus();
  elements.analyzeButton.textContent = t(state.analyzing ? 'actions.cancel' : 'actions.analyze');
  if (state.summary && state.velocityMap) {
    const resultMessage = {
      results: [...state.velocityMap].map(([index, velocity]) => ({ index, velocity, analyzed: true })),
      summary: state.summary,
    };
    const changedCount = state.midi.melodicNotes.filter(note => (state.velocityMap.get(note.index) ?? note.originalVelocity) !== note.originalVelocity).length;
    renderResult(resultMessage, { changedCount });
  }
}

async function initialize() {
  try { await initializeLanguage(); } catch (error) { console.error(error); }
  setupDropZone(elements.midiDrop, elements.midiFile, loadMidi);
  setupDropZone(elements.audioDrop, elements.audioFile, loadAudio);
  elements.audioOffset.addEventListener('input', () => {
    if (state.outputBytes) clearResult();
    updateReadyState();
  });
  elements.midiSiteLinks?.addEventListener('change', () => {
    const url = String(elements.midiSiteLinks.value || '');
    elements.midiSiteLinks.value = '';
    if (!url) return;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  });
  elements.analyzeButton.addEventListener('click', startAnalysis);
  elements.downloadMidi.addEventListener('click', downloadResult);
  elements.resetResult.addEventListener('click', resetResult);
  updateMidiUi();
  updateAudioUi();
  updateReadyState();
  onLanguageChange(rerenderLocalizedState);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else void initialize();
