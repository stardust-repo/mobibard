// Standard MIDI file writer, ported 1:1 from w2m/midi.py::write_midi (byte-identical output).
import { DRUM, roundHalfEven } from './dsp.mjs';
import { beatPosition } from './tempo.mjs';

export const GM_FAMILY = ['Piano', 'Chromatic Perc', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass',
  'Reed', 'Pipe', 'Synth Lead', 'Synth Pad', 'Synth FX', 'Ethnic', 'Percussive', 'SFX'];

const vlq = n => { const out = [n & 0x7f]; n >>>= 7; while (n) { out.push((n & 0x7f) | 0x80); n >>>= 7; } return out.reverse(); };
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (kind, data) => [...kind.split('').map(c => c.charCodeAt(0)), ...be32(data.length), ...data];
const ascii = s => s.split('').map(c => c.charCodeAt(0) & 0x7f);

function track(events) {
  const ev = events.map((e, i) => [...e, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);
  const data = [];
  let last = 0;
  for (const [tick, , msg] of ev) { data.push(...vlq(tick - last), ...msg); last = tick; }
  data.push(...vlq(0), 0xff, 0x2f, 0x00);
  return chunk('MTrk', data);
}

/** notes [[pitch, program, onset, offset, ...]], velocities: number or array. Returns Uint8Array.
 *  tempo: map from tempo.mjs tempoMap (null -> constant bpm, audio timing kept). Same bytes as midi.py. */
export function midiBytes(notes, velocities = 100, ppq = 480, bpm = 120, tempo = null) {
  const vel = i => Math.min(127, Math.max(1, Array.isArray(velocities) || ArrayBuffer.isView(velocities) ? velocities[i] : velocities));
  const tempoEv = (tick, b) => { const us = roundHalfEven(60000000 / b); return [tick, 0, [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]; };
  let toTick, nb = 4;
  const meta = [];
  if (!tempo || tempo.mode === 'fixed') {
    const b = tempo ? tempo.bpm : bpm, us = roundHalfEven(60000000 / b), tps = ppq * 1000000 / us;
    toTick = t => roundHalfEven(t * tps);
    meta.push(tempoEv(0, b));
  } else {
    toTick = t => Math.max(roundHalfEven(beatPosition(t, tempo) * ppq), 0);
    nb = tempo.time_signature?.[0] ?? 4;
    for (const sg of tempo.segments) meta.push(tempoEv(Math.max(roundHalfEven(sg.beat * ppq), 0), sg.bpm_written));
  }
  meta.push([0, 0, [0xff, 0x58, 0x04, nb, 0x02, 0x18, 0x08]]);
  const tracks = [track(meta)];
  const programs = [...new Set(notes.map(n => n[1]))].sort((a, b) => a - b);
  const melodic = [...Array(16).keys()].filter(c => c !== 9);
  let mi = 0;
  for (const prog of programs) {
    let ch, ev;
    if (prog === DRUM) {
      ch = 9; const name = 'Drums';
      ev = [[0, 0, [0xff, 0x03, ...vlq(name.length), ...ascii(name)]]];
    } else {
      ch = melodic[mi % melodic.length]; mi++;
      const name = `${GM_FAMILY[Math.floor(prog / 8)]} (program ${prog})`;
      ev = [[0, 0, [0xff, 0x03, ...vlq(name.length), ...ascii(name)]], [0, 1, [0xc0 | ch, prog & 0x7f]]];
    }
    notes.forEach((n, i) => {
      if (n[1] !== prog) return;
      const a = toTick(n[2]), b = Math.max(toTick(n[3]), a + 1), p = n[0] & 0x7f;
      ev.push([a, 3, [0x90 | ch, p, vel(i)]]);
      ev.push([b, 2, [0x80 | ch, p, 0]]);
    });
    tracks.push(track(ev));
  }
  const header = chunk('MThd', [0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (ppq >> 8) & 255, ppq & 255]);
  return new Uint8Array([...header, ...tracks.flat()]);
}
