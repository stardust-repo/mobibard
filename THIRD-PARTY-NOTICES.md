# Third-party notices

- 마지막 업데이트: **2026-08-19 11:58:00 KST**

이 문서는 현재 저장소에 포함된 제3자 코드와 라이선스 고지를 정리합니다. 파일을 이동하거나 공용 플러그인 구조를 변경하더라도 아래 고지와 각 원본 라이선스 파일을 함께 유지해야 합니다.

## FluidR3Mono_GM Compact default SoundFont

`assets/default_sf3.js` embeds `FluidR3Mono_GM_compact.sf3`, a smaller Ogg Vorbis q=0 re-encode made from the user-supplied `FluidR3Mono_GM.sf3`. The upstream attribution, provenance note, original README notice, COPYING notice, and MIT License are retained in `assets/licenses/FluidR3Mono_GM_LICENSE.md`.

Embedded copy:

- File: `FluidR3Mono_GM_compact.sf3`
- Size: `9,995,426 bytes`
- SHA-256: `f1b26ac9c671a4010ed5fb83bdc503c2cb94d05b0ade70e0b02fe7ba953b03e8`
- Re-encode: `Ogg Vorbis VBR q=0`
- Internal name: `FluidR3Mono_GM2-312.SF2`

Attribution retained with this distribution:

- FluidR3 original by Frank Wen, copyright © 2000–2002.
- FluidR3Mono conversion by Michael Cowgill, copyright © 2014–17.
- Original Fluid README: Frank Wen, copyright 2000–2002, 2008.
- COPYING notice: Michael Cowgill, copyright 2014–16; Frank Wen, copyright 2000–2002, 2008.
- Temple Blocks instrument by Ethan Winer, copyright © 2002.
- Drumline Percussion by Michael Schorsch, copyright © 2016.

The compact re-encode retains the original SoundFont structure and legacy internal metadata. See the dedicated license file rather than this summary for the full notice and MIT License text.

## pako inflate

`plugins/formats/vendor/pako_inflate.min.js` is the pako inflate build.
Project: https://github.com/nodeca/pako

(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## denigma MUSX score.dat decoding

`plugins/formats/finale/finale-musx-to-midi.js` adapts the symmetric `score.dat`
recode algorithm documented by the open-source `rpatters1/denigma` project.
Only archive extraction and decoding knowledge is adapted; this project contains
no Finale application source code.

MIT License

Copyright (c) 2025 Robert G. Patterson, Chris Roode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## finale-file-parser format research

`plugins/formats/finale/finale-mus-to-midi.js` uses legacy Finale binary layout knowledge
derived from the `finale-file-parser` project.
Project: https://github.com/jsawruk/finale-file-parser

MIT License

Copyright (c) 2026 jsawruk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## PKWARE DCL blast algorithm

The in-browser PKWARE DCL decoder in
`plugins/formats/finale/finale-mus-to-midi.js` is a JavaScript implementation
based on the algorithm documented by Mark Adler's `blast.c` in zlib's contrib
directory.

Copyright (c) 2003 Mark Adler

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use
of this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject
to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product,
   an acknowledgment in the product documentation would be appreciated but is
   not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

## guitarpro-parser (GP3 subset)

Guitar Pro 3 import includes adapted source from `guitarpro-parser` 1.2.0.

License: Apache License 2.0
Project: https://www.npmjs.com/package/guitarpro-parser
Local files: `plugins/formats/guitarpro/vendor/guitarpro-parser/`

The complete Apache-2.0 notice is retained in
`plugins/formats/guitarpro/vendor/guitarpro-parser/LICENSE`.

## parse-gp5

Guitar Pro 5 import includes an adapted browser-compatible parser based on
`juliangruber/parse-gp5`.

License: MIT
Project: https://github.com/juliangruber/parse-gp5
Local files: `plugins/formats/guitarpro/vendor/parse-gp5/`

The complete MIT notice is retained in
`plugins/formats/guitarpro/vendor/parse-gp5/LICENSE`.
