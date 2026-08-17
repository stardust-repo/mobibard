export * from './types.js';
export * from './pitch.js';
export { parseGp3File } from './gp3-parser.js';
const DURATION_BEATS = {
    whole: 4, half: 2, quarter: 1, eighth: 0.5,
    '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125,
};
export function durationToBeats(duration, dotCount = 0, tuplet = null) {
    let beats = DURATION_BEATS[duration] ?? 1;
    let add = beats;
    for (let i = 0; i < dotCount; i++) {
        add /= 2;
        beats += add;
    }
    if (tuplet && tuplet.num > 0)
        beats *= tuplet.den / tuplet.num;
    return beats;
}
