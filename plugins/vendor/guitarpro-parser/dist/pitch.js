const SHARP_NAMES = { 0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F', 6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B' };
const FLAT_NAMES = { 0: 'C', 1: 'Db', 2: 'D', 3: 'Eb', 4: 'E', 5: 'F', 6: 'Gb', 7: 'G', 8: 'Ab', 9: 'A', 10: 'Bb', 11: 'B' };
const NATURAL_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
function resolveAccidental(pc, preferFlats) { if (NATURAL_PITCH_CLASSES.has(pc))
    return 'natural'; return preferFlats ? 'flat' : 'sharp'; }
export function noteFromPitchClass(pc, preferFlats = false, octave) { const name = preferFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc]; return { pitchClass: pc, name, accidental: resolveAccidental(pc, preferFlats), octave }; }
export function midiToPitchClass(midi) { return (((midi % 12) + 12) % 12); }
