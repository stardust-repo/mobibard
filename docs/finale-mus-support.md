# Finale legacy MUS support

## One shared implementation

`player/js/finale-mus-to-midi.js` is the only MUS decoder. Do not duplicate its
binary parsing inside player, editor, or simple.

All pages load dependencies in this order:

1. `player/js/pako_inflate.min.js`
2. `player/js/finale-mus-to-midi.js`
3. the page's existing MIDI parser/import code

The shared public API is `window.MabiFinaleMus`:

- `isFinaleMusBytes(bytes)`
- `parseFinaleMus(bytes, fileName)`
- `musToMidiBytes(bytes, fileName)`

## Input paths

- player local/drag: `loadLocalSourceFile()`
- player Google Drive: `loadGoogleDriveSourceFile()`
- editor unified import/reference import: `convertImportFileToMidiBuffer()`
- simple file/drop: `normalizeSourceToMidiBytes()`

Every path converts MUS to a standard MIDI Format 1 byte stream before calling
the existing MIDI analysis, preview, MML conversion, or editor import code.

## Recognized file structure

- Header must begin with `ENIGMA BINARY FILE`.
- Labelled PKWARE DCL pool chains are recognized at offset `0x200`.
- Unlabelled framed zlib stream chains are also recognized.
- The parser reads entry slots, frame chains, staff/measure placement, layers,
  chords, durations, ties, time signatures, key signatures, and staff
  transposition.

It intentionally does not identify a `.mus` file by extension alone: the
extension selects the converter, and the converter still validates the binary
header and pool structure.

## Current conversion limits

The old binary format does not currently restore all Finale playback and page
information. In particular, the browser conversion does not claim to preserve
printed layout, all articulations/expressions, original playback tempo
expressions, or a reliable instrument program for each staff. The intermediary
MIDI therefore starts at 120 BPM and Program 0. The three pages may apply their
normal later-stage instrument or tempo controls.

## Regression references

The implementation was cross-checked against independently converted MIDI from
two structurally different files. The source files are not redistributed with
the project.

| Reference file | Pool container | Staves | Measures | Sounding notes | Length at 120 BPM |
| --- | ---: | ---: | ---: | ---: | ---: |
| `inuyasha-brand-new-world.mus` | DCL | 2 | 121 | 1,181 | 244.0 s |
| `ico-you-were-there-tuba.mus` | zlib | 1 | 97 | 151 after tie merge | 145.5 s |

For both references, MIDI pitch, note start tick, and note end tick matched the
independent conversion exactly.

Run a structural check on any available MUS files with:

```bash
node tools/test-finale-mus.js path/to/file1.mus path/to/file2.mus
```

Also verify that the generated MIDI can be processed by
`player/js/midi-to-mml.js`, because all three pages depend on that bridge.

## Licensing

See `THIRD-PARTY-NOTICES.md`. Preserve that notice and the comments at the top
of `finale-mus-to-midi.js` when moving or modifying the decoder.
