# Simple 구현 스펙 스냅샷

마지막 갱신: 2026-08-19 19:56:00 KST

## 목적

연주 파일 하나를 선택해 복잡한 설정 없이 최대 3개 MML 채널로 변환하고, 결과를 복사하거나 기본 음원으로 미리듣는 간편 화면입니다.

## 입력

- 지원 확장자: `.mid`, `.midi`, `.kar`, `.seq`, `.sep`, `.sq`, `.bq`, `.psf`, `.psf1`, `.minipsf`, `.minipsf1`, `.psf2`, `.minipsf2`, `.ncsf`, `.minincsf`, `.2sf`, `.mini2sf`, `.sseq`, `.ssar`, `.sdat`, `.brseq`, `.rseq`, `.brsar`, `.bcseq`, `.cseq`, `.bcsar`, `.bfseq`, `.fseq`, `.bfsar`, `.musicxml`, `.xml`, `.mxl`, `.mus`, `.musx`, `.mnx`, `.mnx.json`, `.mscz`, `.mscx`, `.gp3`, `.gp5`, `.vsq`, `.vsqx`, `.vpr`, `.ust`, `.ustx`, `.svp`, `.s5p`, `.ccs`
- 공용 포맷 등록소가 입력을 표준 MIDI로 정규화합니다. PlayStation SEQ/SEP·PS2 SQ/BQ·PSF1/PSF2(AKAO v1.0/v2 포함)와 Nintendo DS·Wii·3DS·Wii U·Switch의 표준 시퀀스/사운드 아카이브 및 NCSF/2SF도 같은 경로를 사용합니다. 콘솔 전용 Bank와 드럼 슬롯은 가능한 경우 GM Bank 0/GM 타악기로 정규화되어 일반 SoundFont 미리듣기에 사용됩니다.
- Classic Mac의 MacBinary 컨테이너는 공용 계층에서 Data Fork·Resource Fork와 MacBinary II 보조 헤더를 판별한 뒤 실제 연주 데이터를 전달합니다.
- 확장자가 보존되지 않은 Classic Mac 컨테이너를 위해 `.bin`·`.macbin`도 선택할 수 있으며, 내부 파일명과 바이너리 시그니처로 실제 형식을 판별합니다.
- MIDI와 KAR의 트랙·채널·Program·Bank·노트·템포·가사·텍스트 이벤트는 공용 MIDI 파서가 해석합니다.
- MUSX·MNX·MuseScore 변환은 기본 음표·쉼표·성부·타이·박자·조표·템포 중심이며 고급 기보와 재생 효과는 단순화됩니다.

## 변환과 미리듣기

- 공용 MIDI→MML 변환기를 사용하며 최대 3개 채널을 생성합니다.
- MIDI→MML 채널 배치에서는 공용 1/64 겹침 규칙을 항상 적용합니다. 서로 다른 시작점의 순차 노트가 1/64 이하만 겹치고 선행 노트를 잘라도 최소 1/64 길이가 남을 때만 비겹침으로 처리하며, 같은 시작점 화음이나 최소 길이를 침범하는 경우는 그대로 겹침으로 평가합니다.
- 자동 악기 그룹 선택, 음표 배치, 양자화, MML 길이 최적화를 지원합니다.
- 변환된 결과에는 템포 정리를 기본 적용합니다. `선행 템포와의 편차가 5 미만인 템포들을 삭제합니다.`라는 공용 기준을 사용하며, 판정은 쉼표 정리와 선행 2초 무음 추가보다 먼저 수행하고 정리된 결과를 복사·분할·미리듣기에 동일하게 사용합니다.
- 결과 MML의 채널별 표시와 전체 복사를 지원합니다.
- SF2·SF3·DLS는 공용 SoundBank 모델로 해석합니다.
- 기본 음원은 `assets/default_sf3.js`에 내장된 `FluidR3Mono_GM_compact.sf3`이며 제품 전용 재생 연결은 `simple/js/playback.js`가 담당합니다.
- 재생·일시정지·정지와 재생 위치 표시를 지원합니다.

## 화면과 설정

- 상단바는 본문 위의 일반 문서 흐름에 배치되며, 화면에 고정되지 않고 페이지 스크롤과 함께 위로 이동합니다.
- 화면 제목은 간편 생성기 명칭을 사용하며 버전 글씨는 제목 글씨의 절반 크기로 표시합니다. Player로 이동하는 상단 버튼은 `상세 모드`로 표시합니다.
- 지원 파일 버튼은 음악 파일 선택 버튼 위에 배치되어 있으며 두 버튼 사이에 여백이 있습니다.
- 지원 파일 팝업은 `표준 음악 · 악보 / 음악 편집기 / 콘솔 / 보컬 편집기` 등 성격별 섹션으로 나뉘며, 보컬 편집기 파일은 VOCALOID·UTAU·OpenUtau·Synthesizer V·CeVIO를 각각 구분해 표시합니다.
- 지원 파일 팝업의 제목과 버튼 명칭은 `지원 파일`로 통일되어 있고, 닫기 아이콘은 원형 버튼의 정중앙에 표시됩니다.
- 지원 파일 팝업은 Classic Mac 컨테이너를 별도 형식이나 안내 문구로 표시하지 않으며, 선택된 파일은 공용 계층에서 자동 판별합니다.
- 설정 팝업은 언어와 테마의 메뉴명·선택 항목을 각각 한 줄로 정렬합니다.
- 음악 파일 선택 대화상자는 전체 지원 형식과 MIDI·KAR, MusicXML, MNX, Finale, MuseScore, Guitar Pro, PlayStation, Nintendo, VOCALOID, UTAU, OpenUtau, Synthesizer V, CeVIO 필터를 제공합니다. Classic Mac은 별도 카테고리 없이 전체 또는 관련 옛 포맷군에서 `.bin`·`.macbin`을 선택하면 공용 계층이 내부 형식을 자동 판별합니다. 지원하지 않는 브라우저에서는 동일한 전체 확장자 `accept` 목록으로 대체됩니다.
- 한국어, 일본어, 영어, 중국어 간체·번체를 지원합니다.
- 밝은 테마와 어두운 테마를 지원합니다.
- 변환 설정과 언어·테마 선택은 브라우저 저장소를 사용합니다.

## 주요 의존성

```text
plugins/common/
plugins/formats/
plugins/google/
simple/js/playback.js
assets/default_sf3.js
```
