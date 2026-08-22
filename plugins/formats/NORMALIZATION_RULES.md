# Music format normalization rules

Release verification: **2026-08-23 / Mobibard v5.1**. No normalization fallback or ordering rule was changed by the final UI pass.

Mobibard converts heterogeneous score, console, sequencer, and vocal-project formats into a common Standard MIDI-oriented representation before Editor/MML processing.

## Fallback constants

- Tempo fallback: **120 BPM**
- Loudness fallback: **MIDI velocity 96** (about **75%** of the 0–127 range)
- Pan fallback/center: **64**
- Expression default when the source does not define an independent expression controller: **127**
- Generic melodic GM bank: **Bank 0**
- GM percussion channel: **MIDI channel 10** (zero-based channel 9)

The tempo and loudness fallback values are used only when the source provides no usable value and no format-specific rule can infer one.

## Required normalization order

1. **Read source semantics first.** Preserve explicit tempo, note velocity/dynamics, volume, expression, pan, program/bank, drum-kit information, pitch bend, and time-signature information whenever the source format defines them.
2. **Convert units, do not copy numbers blindly.** Source-specific tempo clocks, percentage dynamics, mixer scales, console program numbers, and percussion slots must be converted to MIDI semantics using that format's specification.
3. **Keep loudness components separate in MIDI.** Note velocity, CC7 Volume, and CC11 Expression remain independent while producing MIDI. If a downstream representation such as MML needs one loudness value, compute an effective loudness from `velocity × CC7 × CC11` exactly once.
4. **Normalize instruments only as far as evidence allows.** If the format identifies instrument/drum semantics, map them to a plausible GM program or GM percussion key. If semantics are unknown, use a stable GM proxy rather than guessing an instrument name.
5. **Drums must remain drums.** Console-specific drum slots/keys are mapped into the GM percussion domain; they must not fall through to melodic Bank 0 or Piano.
6. **Preserve automation where supported.** Tempo, Volume, Expression, Pan and similar changes should retain their original event timing; fades should be represented by intermediate controller events when the source describes a continuous transition.
7. **Apply fallback last.** Only after source values and format-specific inference both fail, use Tempo 120 BPM and Velocity 96.

## Format-family guidance

- **Standard MIDI/KAR:** preserve MIDI events; no remapping unless required by downstream MML limitations.
- **PlayStation Sony SEQ/SQ:** convert Sony timing/controllers to MIDI; normalize proprietary banks to GM Bank 0 only when the external sound bank is unavailable; map percussion to GM keys.
- **SquareSoft AKAO:** preserve AKAO tempo/controller semantics, keep velocity and channel Volume/Expression separate, and map AKAO drum slots to GM percussion.
- **Nintendo SSEQ/SDAT/NintendoWare:** use SBNK/instrument types when available; preserve SSEQ tempo, volume, expression and pan events; map PSG/drum types to stable GM proxies.
- **MusicXML/MuseScore/Finale/Guitar Pro:** use documented tempo and dynamic/mixer semantics; do not equate percentages or editor-specific dynamic scales directly with MIDI 0–127.
- **Vocal project formats:** preserve explicit tempo and loudness/dynamics where defined; do not pretend synthesis parameters such as breathiness/tension are equivalent to MIDI velocity unless a format-specific mapping is documented.

When adding a new parser, update this document if the format needs an exception or a new normalization rule.
