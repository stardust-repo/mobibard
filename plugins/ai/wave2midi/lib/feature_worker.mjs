// Frontend features for one 8 s window, off the main thread (several of these run in parallel).
import { frontendFeatures } from './dsp.mjs';

let meta = null;
onmessage = e => {
  const d = e.data;
  if (d.meta) { meta = d.meta; return; }
  const f = frontendFeatures(d.seg, meta);
  postMessage({ id: d.id, f }, [f.buffer]);
};
