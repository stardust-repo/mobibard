// Frontend features for one window, off the main thread (several of these run in parallel).
import { Frontend } from "./w2m_web.mjs";
let fe = null;
onmessage = e => {
  const d = e.data;
  if (d.meta) { fe = new Frontend(d.meta.frontend); return; }
  const f = fe.features(d.seg, d.seg.length / 240);
  postMessage({ id: d.id, f }, [f.buffer]);
};
