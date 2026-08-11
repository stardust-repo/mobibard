# Mobibard Simple

`simple/index.html` is a lightweight MIDI / MusicXML-to-MML converter.

- MIDI (`.mid`, `.midi`) and MusicXML (`.musicxml`, `.xml`, `.mxl`) drag & drop / file selection
- MusicXML is converted through the same `player/js/musicxml-to-midi.js` parser used by the main player, then passed into the same simple 3-channel MIDI-to-MML pipeline
- Conversion runs automatically after file selection and whenever an option changes
- Quantize options: 1/64 or 1/32 (default: 1/64)
- Drum parts are excluded
- Fixed 3-channel conversion internally:
  - Ch1: High + Half overlap merge
  - Ch2: Auto + All overlap merge
  - Ch3: Low + Half overlap merge
- Rest removal options: Keep / <= 1/64 / <= 1/32 / <= 1/16 / <= 1/8 / <= 1/4 / All (default: <= 1/32)
- MML preview uses the bundled player SoundFont sampler and is fixed to Bank 0 / Program 0 for every part, with only a play/stop button and seek slider in the UI
- Full-score copy card plus split-copy score cards at the same 2400-character limit used by the main editor
- Shared language/theme preference keys with the main Mobibard player
- Simple-only translations live in `simple/locale/` (`ko.js`, `ja.js`, `en.js`, `zh-CN.js`, `zh-TW.js`); they are not embedded in `simple/app.js` and do not depend on `player/locale/`
- Language GET parameters: `lang`, `language`, or `locale` (`ko`, `ja`, `en`, `zh-CN`, `zh-TW`)
- The browser tab title and brand name follow the same localized Mobibard naming used by the player (`모비바드 v4.8`, `モビバード v4.8`, `Mobibard v4.8`)
- `rel=alternate` hreflang links for all supported languages
- Header links: MIDI Extractor + full MML Generator + Discord icon
- Shared 64x64 brand image: `assets/icons/mobibard-mark-64.png`

The preview loads the same bundled default SF3 and `player/js/sf2-sampler.js` used by the main player only when playback is first requested. Playback always selects Bank 0 / Program 0; MIDI/MusicXML instrument metadata remains unchanged for conversion.


## Firebase Analytics

파일을 선택한 뒤 MIDI/MusicXML → MML 변환이 최초로 성공 완료되면 simple 전용 이벤트 `simple_file_convert_complete`를 1회 기록합니다. 같은 파일에서 양자화 또는 쉼표 제거 옵션을 바꿔 자동 재변환되는 과정은 중복 집계하지 않습니다. 이 이벤트는 player의 `mml_import_complete`와 별개이며 서로 합쳐지지 않습니다. 파일명이나 MML 내용은 수집하지 않고 `source_type`, `file_size`, `quantize_division`, `rest_mode`, `page_count`만 이벤트 파라미터로 기록합니다.
