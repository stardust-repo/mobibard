/* guitarpro-parser 1.2.0 GP3 subset, Apache-2.0. Local classic-script bundle. */
(() => {
"use strict";
const SHARP_NAMES = { 0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F', 6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B' };
const FLAT_NAMES = { 0: 'C', 1: 'Db', 2: 'D', 3: 'Eb', 4: 'E', 5: 'F', 6: 'Gb', 7: 'G', 8: 'Ab', 9: 'A', 10: 'Bb', 11: 'B' };
const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
function resolveAccidental(pc, preferFlats) { if (NATURAL_PITCH_CLASSES.has(pc))
    return 'natural'; return preferFlats ? 'flat' : 'sharp'; }
function noteFromPitchClass(pc, preferFlats = false, octave) { const name = preferFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc]; return { pitchClass: pc, name, accidental: resolveAccidental(pc, preferFlats), octave }; }
function midiToPitchClass(midi) { return (((midi % 12) + 12) % 12); }

class GP3Reader {
    constructor(buffer) {
        this.pos = 0;
        this.view = new DataView(buffer);
        this.buf = new Uint8Array(buffer);
        this.byteLength = buffer.byteLength;
    }
    getPosition() { return this.pos; }
    skip(n) { this.pos += n; }
    readByte() { return this.buf[this.pos++]; }
    readSignedByte() { const v = this.view.getInt8(this.pos); this.pos++; return v; }
    readBool() { return this.readByte() !== 0; }
    readShort() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
    readInt() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
    readIntByteSizeString() { const total = this.readInt(), len = this.readByte(), s = this.readChars(len); this.skip(Math.max(0, total - 1 - len)); return s; }
    readByteSizeString(fixedLen) { const len = this.readByte(), used = Math.min(len, fixedLen), s = this.readChars(used); this.skip(fixedLen - used); return s; }
    readChars(length) { const chars = []; for (let i = 0; i < length; i++)
        chars.push(this.buf[this.pos + i]); this.pos += length; return String.fromCharCode(...chars); }
}
const GP_DURATION_MAP = { [-2]: 'whole', [-1]: 'half', [0]: 'quarter', [1]: 'eighth', [2]: '16th', [3]: '32nd', [4]: '64th', [5]: '128th' };
const gpDurationToDuration = (v) => GP_DURATION_MAP[v] ?? 'quarter';
const TUPLET_MAP = { 3: { num: 3, den: 2 }, 5: { num: 5, den: 4 }, 6: { num: 6, den: 4 }, 7: { num: 7, den: 4 }, 9: { num: 9, den: 8 }, 10: { num: 10, den: 8 }, 11: { num: 11, den: 8 }, 12: { num: 12, den: 8 }, 13: { num: 13, den: 8 } };
function readInfo(r) { const title = r.readIntByteSizeString(), subtitle = r.readIntByteSizeString(), artist = r.readIntByteSizeString(), album = r.readIntByteSizeString(); r.readIntByteSizeString(); r.readIntByteSizeString(); r.readIntByteSizeString(); r.readIntByteSizeString(); const n = r.readInt(); for (let i = 0; i < n; i++)
    r.readIntByteSizeString(); return { title, subtitle, artist, album }; }
function readMidiChannels(r) { const a = []; for (let i = 0; i < 64; i++) {
    const instrument = r.readInt(), volume = r.readByte(), balance = r.readByte(), chorus = r.readByte(), reverb = r.readByte(), phaser = r.readByte(), tremolo = r.readByte();
    r.skip(2);
    a.push({ instrument, volume, balance, chorus, reverb, phaser, tremolo });
} return a; }
function readMeasureHeaders(r, count) { const out = []; let pn = 4, pd = 4; for (let i = 0; i < count; i++) {
    const f = r.readByte();
    let numerator = pn, denominator = pd;
    if (f & 1)
        numerator = r.readSignedByte();
    if (f & 2)
        denominator = r.readSignedByte();
    const repeatOpen = !!(f & 4);
    let repeatClose = -1;
    if (f & 8)
        repeatClose = r.readSignedByte();
    let repeatAlternative = 0;
    if (f & 16)
        repeatAlternative = r.readByte();
    let marker = null;
    if (f & 32) {
        const name = r.readIntByteSizeString(), rr = r.readByte(), g = r.readByte(), b = r.readByte();
        r.skip(1);
        marker = { name, color: [rr, g, b] };
    }
    let keySignature = 0, keyMode = 0;
    if (f & 64) {
        keySignature = r.readSignedByte();
        keyMode = r.readSignedByte();
    }
    out.push({ numerator, denominator, repeatOpen, repeatClose, repeatAlternative, marker, keySignature, keyMode, hasDoubleBar: !!(f & 128) });
    pn = numerator;
    pd = denominator;
} return out; }
function readTrackHeaders(r, count) { const out = []; for (let i = 0; i < count; i++) {
    const f = r.readByte(), isPercussion = !!(f & 1), name = r.readByteSizeString(40), numStrings = r.readInt(), tuning = [];
    for (let s = 0; s < 7; s++) {
        const v = r.readInt();
        if (s < numStrings)
            tuning.push(v);
    }
    const port = r.readInt(), channelIndex = r.readInt() - 1, effectChannel = r.readInt() - 1, fretCount = r.readInt(), capoFret = r.readInt();
    r.skip(4);
    out.push({ name, isPercussion, numStrings, tuning, port, channelIndex, effectChannel, fretCount, capoFret });
} return out; }
function readMeasures(r, measureCount, tracks) { const all = tracks.map(() => []); for (let m = 0; m < measureCount; m++)
    for (let t = 0; t < tracks.length; t++)
        all[t].push(readVoice(r, tracks[t].numStrings)); return all; }
function readVoice(r, numStrings) { const count = r.readInt(), beats = []; for (let i = 0; i < count; i++)
    beats.push(readBeat(r, numStrings)); return beats; }
function readBeat(r, _numStrings) { const f = r.readByte(); let isRest = false, isEmpty = false; if (f & 64) {
    const s = r.readByte();
    isEmpty = s === 0;
    isRest = s === 2;
} const duration = gpDurationToDuration(r.readSignedByte()), dotted = !!(f & 1); let tuplet = null; if (f & 32)
    tuplet = TUPLET_MAP[r.readInt()] ?? null; if (f & 2)
    readChord(r); if (f & 4)
    r.readIntByteSizeString(); if (f & 8)
    readBeatEffects(r); if (f & 16)
    readMixTableChange(r); const sf = r.readByte(), notes = []; for (let i = 6; i >= 0; i--)
    if (sf & (1 << i)) {
        const n = readNote(r);
        n.string = (7 - i) - 1;
        notes.push(n);
    } return { duration, dotted, tuplet, isRest: isRest || isEmpty, isEmpty, notes }; }
function readChord(r) { const nf = r.readBool(); if (!nf) {
    r.readIntByteSizeString();
    const first = r.readInt();
    if (first !== 0)
        for (let i = 0; i < 6; i++)
            r.readInt();
}
else {
    r.readBool();
    r.skip(3);
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readBool();
    r.readByteSizeString(22);
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    for (let i = 0; i < 6; i++)
        r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    r.readInt();
    for (let i = 0; i < 7; i++)
        r.readBool();
    r.skip(1);
} }
function readBeatEffects(r) { const f = r.readByte(); if (f & 32) {
    r.readByte();
    r.readInt();
} if (f & 64) {
    r.readByte();
    r.readByte();
} }
function readMixTableChange(r) { r.readSignedByte(); const vals = [r.readSignedByte(), r.readSignedByte(), r.readSignedByte(), r.readSignedByte(), r.readSignedByte(), r.readSignedByte()], tempo = r.readInt(); for (const v of vals)
    if (v >= 0)
        r.readSignedByte(); if (tempo >= 0)
    r.readSignedByte(); }
function readNote(r) { const f = r.readByte(); let isTied = false, isDead = false; if (f & 32) {
    const t = r.readByte();
    isTied = t === 2;
    isDead = t === 3;
} if (f & 1) {
    r.readSignedByte();
    r.readSignedByte();
} let velocity = 8; if (f & 16)
    velocity = r.readSignedByte(); let fret = 0; if (f & 32) {
    fret = r.readSignedByte();
    if (fret < 0 || fret > 99)
        fret = 0;
} if (f & 128) {
    r.readSignedByte();
    r.readSignedByte();
} let hammerOn = false, letRing = false, slide = false, bend = null; if (f & 8) {
    const x = readNoteEffects(r);
    ({ hammerOn, letRing, slide, bend } = x);
} return { string: 0, fret, isTied, isDead, velocity, hammerOn, letRing, slide, bend }; }
function readNoteEffects(r) { const f = r.readByte(); let bend = null; const hammerOn = !!(f & 2), slide = !!(f & 4), letRing = !!(f & 8); if (f & 1)
    bend = readBend(r); if (f & 16)
    readGraceNote(r); return { hammerOn, letRing, slide, bend }; }
function readBend(r) { const type = r.readSignedByte(), value = r.readInt(), count = r.readInt(), points = []; for (let i = 0; i < count; i++)
    points.push({ position: r.readInt(), value: r.readInt(), vibrato: r.readBool() }); return { type, value, points }; }
function readGraceNote(r) { r.readByte(); r.readByte(); r.readByte(); r.readByte(); }
function transformToTabSong(info, tempo, headers, trackHeaders, measures, channels) {
    const tracks = trackHeaders.map((th, ti) => { const pitches = th.tuning, tuning = pitches.map(m => noteFromPitchClass(midiToPitchClass(m))); let gi = 0; const bars = []; for (let mi = 0; mi < headers.length; mi++) {
        const mh = headers[mi], data = measures[ti]?.[mi] ?? [], beats = [];
        for (const bd of data) {
            if (bd.isEmpty)
                continue;
            const notes = [];
            for (const nd of bd.notes) {
                const idx = nd.string, fret = nd.fret, open = pitches[idx] ?? 0, pc = (((open + th.capoFret + fret) % 12 + 12) % 12), note = noteFromPitchClass(pc, false);
                let br = null;
                if (nd.bend) {
                    const p = nd.bend.points;
                    br = { origin: p.length ? p[0].value / 100 : 0, destination: p.length > 1 ? p[p.length - 1].value / 100 : 0, middle: p.length > 2 ? p[Math.floor(p.length / 2)].value / 100 : 0 };
                }
                notes.push({ string: idx, fret, pitchClass: pc, noteName: note.name, slide: nd.slide ? 1 : null, harmonic: null, palmMute: false, muted: nd.isDead, letRing: nd.letRing, bend: br, tie: { origin: false, destination: nd.isTied }, vibrato: null, hammerOn: nd.hammerOn, pullOff: false, tapped: false, accent: null });
            }
            beats.push({ index: gi++, barIndex: mi, notes, duration: bd.duration, tuplet: bd.tuplet, dotted: bd.dotted ? 1 : 0, isRest: bd.isRest && notes.length === 0, dynamic: null, tempo });
        }
        bars.push({ index: mi, timeSignature: { numerator: mh.numerator, denominator: mh.denominator }, keySignature: mh.keySignature !== 0 ? { accidentalCount: mh.keySignature, mode: mh.keyMode === 1 ? 'minor' : 'major' } : null, section: mh.marker ? { text: mh.marker.name } : null, beats, repeatStart: mh.repeatOpen, repeatEnd: mh.repeatClose >= 0, repeatCount: mh.repeatClose >= 0 ? mh.repeatClose : 0 });
    } const ch = channels[th.channelIndex]; return { id: String(ti), name: th.name, shortName: th.name.substring(0, 4), instrument: ch ? `MIDI ${ch.instrument}` : null, tuning, tuningMidi: [...pitches], capoFret: th.capoFret, bars }; });
    return { title: info.title || info.subtitle || '', artist: info.artist, album: info.album, tempo, tracks };
}
function parseGp3File(data) { const buf = new ArrayBuffer(data.byteLength); new Uint8Array(buf).set(data); const r = new GP3Reader(buf), version = r.readByteSizeString(30); if (!version.includes('GUITAR PRO') || !version.includes('v3'))
    throw new Error(`Unsupported Guitar Pro version: ${version} (expected GP3)`); const info = readInfo(r); r.readBool(); const tempo = r.readInt(); r.readInt(); const channels = readMidiChannels(r), measureCount = r.readInt(), trackCount = r.readInt(), headers = readMeasureHeaders(r, measureCount), tracks = readTrackHeaders(r, trackCount), measures = readMeasures(r, measureCount, tracks); return transformToTabSong(info, tempo, headers, tracks, measures, channels); }
window.MabiGp3Parser = Object.freeze({ parseGp3File });
})();
