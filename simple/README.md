# Mobibard Simple

`simple/index.html` is a lightweight supported-music-file-to-MML converter.

- Core, tablature, and vocal-project files are accepted through the shared `plugins/music-format-core.js` registry: MIDI, MusicXML, legacy Finale MUS, Guitar Pro 3/5, ASCII TAB, VSQ/VSQX/VPR, UST/USTX, SVP/S5P, and CCS
- Standard MIDI files wrapped in a classic 128-byte MacBinary container are detected automatically; only the MIDI data fork is passed to the shared parser
- MusicXML is converted through the same `player/js/musicxml-to-midi.js` parser used by the main player, then passed into the same simple 3-channel MIDI-to-MML pipeline
- Conversion runs automatically after file selection and whenever an option changes
- Quantize options: 1/64 or 1/32 (default: 1/64)
- Drum parts are excluded
- Fixed 3-channel conversion internally:
  - Ch1: High + Half overlap merge
  - Ch2: Auto + All overlap merge
  - Ch3: Low + Half overlap merge
- Rest removal options: Keep / <= 1/64 / <= 1/32 / <= 1/16 / <= 1/8 / <= 1/4 / All (default: <= 1/32)
- After rest removal, every generated 3-channel MML is normalized to the same leading gap as the player: T120 기준 약 2초 (`R1`). Existing common leading silence is removed first, so repeated option changes do not accumulate extra silence.
- MML preview uses the bundled player SoundFont sampler and is fixed to Bank 0 / Program 0 for every part, with only a play/stop button and seek slider in the UI
- Full-score copy card plus split-copy score cards at the same 2400-character limit used by the main editor
- Shared language/theme preference keys with the main Mobibard player
- Simple-only translations live in `simple/locale/` (`ko.js`, `ja.js`, `en.js`, `zh-CN.js`, `zh-TW.js`); they are not embedded in `simple/app.js` and do not depend on `player/locale/`
- Language GET parameters: `lang`, `language`, or `locale` (`ko`, `ja`, `en`, `zh-CN`, `zh-TW`)
- The browser tab title and brand name follow the same localized Mobibard naming used by the player (`모비바드 v4.8`, `モビバード v4.8`, `Mobibard v4.8`)
- `rel=alternate` hreflang links for all supported languages
- Header links: MIDI Extractor + full MML Generator + Discord icon
- Shared 64x64 brand image: `assets/icons/mobibard-mark-64.png`

The preview loads the same bundled default SF3 and `player/js/sf2-sampler.js` used by the main player only when playback is first requested. Playback always selects Bank 0 / Program 0; imported source instrument metadata remains unchanged for conversion.



## Shared format plug-ins

- `simple`, `player`, and `editor` use the same format registry and one `plugins/format-*.js` registration script per format/extension.
- The `지원 파일` button opens the common format list generated from the live registry.
- Every non-MIDI source is normalized to Standard MIDI first and then uses the existing simple 3-channel conversion path.
- See `../docs/music-format-plugins.md` for exact extensions, limitations, load order, and regression tests.

## Firebase Analytics

파일을 선택한 뒤 지원 음악 파일 → MML 변환이 최초로 성공 완료되면 simple 전용 이벤트 `simple_file_convert_complete`를 1회 기록합니다. 같은 파일에서 양자화 또는 쉼표 제거 옵션을 바꿔 자동 재변환되는 과정은 중복 집계하지 않습니다. 이 이벤트는 player의 `mml_import_complete`와 별개이며 서로 합쳐지지 않습니다. 파일명이나 MML 내용은 수집하지 않고 `source_type`, `file_size`, `quantize_division`, `rest_mode`, `page_count`만 이벤트 파라미터로 기록합니다.

## Header / mobile layout

- The top bar keeps the Mobibard brand text visible at narrow widths.
- Language and theme controls live inside the right-side Settings menu.
- On mobile-width layouts, the converter touches the top/left/right viewport edges; only the existing 20px bottom page gap remains.

### Layout polish (2026-08-14)
- The converter uses the full available width with no outer top/left/right spacing; only the 20px bottom spacing remains.
- Mobile keeps rounded corners on the top edge as well as the bottom edge.
- Settings uses a gear-only icon button; language and theme controls remain inside its popup.


## Finale legacy MUS support

- `.mus` files whose header begins with `ENIGMA BINARY FILE` are decoded locally in the browser by `player/js/finale-mus-to-midi.js`.
- Both labelled PKWARE DCL pool containers and the later unlabeled zlib-stream pool container are handled.
- The module converts staff, measure, key/time signature, entry chains, chords, layers, transposition and ties to a standard Format 1 MIDI byte stream, then reuses the existing simple MIDI-to-MML path.
- The legacy binary format does not currently restore Finale playback expressions, printed layout, articulation playback or a reliable staff instrument assignment. Generated intermediary MIDI therefore uses 120 BPM and Program 0 unless later processing changes them.
- Keep `pako_inflate.min.js` loaded before `finale-mus-to-midi.js`; both simple and the main player intentionally share this one implementation. See `../THIRD-PARTY-NOTICES.md`.

- Guitar Pro 3/5 parsers are bundled under `plugins/vendor`; importing these files does not require an internet connection.
