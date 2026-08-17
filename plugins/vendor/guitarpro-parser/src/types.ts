/**
 * Copyright 2026 Emilien Bevierre
 * Licensed under the Apache License, Version 2.0.
 */
import type { PitchClass, Note } from './pitch.js';
export type Duration = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th' | '128th';
export interface TabNote {
  string: number;
  fret: number;
  pitchClass: PitchClass;
  noteName: string;
  slide: number | null;
  harmonic: string | null;
  palmMute: boolean;
  muted: boolean;
  letRing: boolean;
  bend: { origin: number; destination: number; middle: number } | null;
  tie: { origin: boolean; destination: boolean };
  vibrato: string | null;
  hammerOn: boolean;
  pullOff: boolean;
  tapped: boolean;
  accent: number | null;
}
export interface TabBeat {
  index: number;
  barIndex: number;
  notes: TabNote[];
  duration: Duration;
  tuplet: { num: number; den: number } | null;
  dotted: number;
  isRest: boolean;
  dynamic: string | null;
  tempo: number;
}
export interface TabBar {
  index: number;
  timeSignature: { numerator: number; denominator: number };
  keySignature: { accidentalCount: number; mode: 'major' | 'minor' } | null;
  section: { letter?: string; text?: string } | null;
  beats: TabBeat[];
  repeatStart: boolean;
  repeatEnd: boolean;
  repeatCount: number;
}
export interface TabTrack {
  id: string;
  name: string;
  shortName: string;
  instrument: string | null;
  tuning: Note[];
  tuningMidi: number[];
  capoFret: number;
  bars: TabBar[];
}
export interface TabSong {
  title: string;
  artist: string;
  album: string;
  tempo: number;
  tracks: TabTrack[];
}
