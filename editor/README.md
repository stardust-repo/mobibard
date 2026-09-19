# Editor 구현 스펙 스냅샷

마지막 갱신: 2026-09-10 KST

출시 검증: v5.3 alpha. Editor 편집 기능은 유지하며 공용 포맷 계층에 VGM/VGZ, GYM, S98 입력을 추가했습니다. 정규화 기준은 현재 배포 소스와 `plugins/formats/NORMALIZATION_RULES.md`를 따릅니다.

## 목적

MML 채널과 참조 연주 파일을 피아노롤에서 시각적으로 편집하고, 채널·노트·템포·오디오 참조 자료를 하나의 작업 문서로 관리하는 편집기입니다.

## 파일 불러오기

- MOBIBARD AI/학습 결과 `.mbt`(MBT1)를 MIDI/악보 파일처럼 불러올 수 있습니다. MBT의 ON/ACTIVE/OFF를 노트로 복원하고 `악기별`/`Compact` 채널 배치(Compact에서도 음정 악기와 북·심벌즈 무음정 악기는 서로 다른 풀)를 선택한 뒤 기존 MIDI 불러오기 화면에서 미리보기·선택·새 프로젝트/추가 가져오기를 사용할 수 있습니다.
- 지원 확장자: `.mid`, `.midi`, `.kar`, `.seq`, `.sep`, `.sq`, `.bq`, `.psf`, `.psf1`, `.minipsf`, `.minipsf1`, `.psf2`, `.minipsf2`, `.ncsf`, `.minincsf`, `.2sf`, `.mini2sf`, `.sseq`, `.ssar`, `.sdat`, `.brseq`, `.rseq`, `.brsar`, `.bcseq`, `.cseq`, `.bcsar`, `.bfseq`, `.fseq`, `.bfsar`, `.musicxml`, `.xml`, `.mxl`, `.mus`, `.musx`, `.mnx`, `.mnx.json`, `.mscz`, `.mscx`, `.gp3`, `.gp5`, `.vsq`, `.vsqx`, `.vpr`, `.ust`, `.ustx`, `.svp`, `.s5p`, `.ccs`, `.xgm`, `.vgm`, `.vgz`, `.gym`, `.s98`
- 공용 포맷 등록소가 원본 파일을 표준 MIDI로 변환합니다. PlayStation SEQ/SEP·PS2 SQ/BQ·PSF1/PSF2(AKAO v1.0/v2 포함)와 Nintendo DS·Wii·3DS·Wii U·Switch 표준 시퀀스/사운드 아카이브 및 NCSF/2SF, Sega XGM과 VGM/VGZ·GYM·S98 사운드칩 로그도 같은 입력 경로를 사용합니다. 콘솔 전용 Bank와 드럼 슬롯은 가능한 경우 GM Bank 0/GM 타악기로 정규화되어 편집기 악기 선택과 미리듣기에 전달됩니다.
- 공용 MIDI 파서가 MIDI·KAR의 연주 및 가사·텍스트 이벤트를 해석하고, Editor는 그 결과를 피아노롤 문서 구조로 가공합니다.
- Classic Mac의 MacBinary Data Fork·Resource Fork·보조 헤더와 Program·Bank, running status, 템포·박자·조표는 공용 계층에서 처리합니다.
- 확장자가 보존되지 않은 Classic Mac 컨테이너를 위해 `.bin`·`.macbin`도 선택할 수 있으며, 내부 파일명과 바이너리 시그니처로 실제 형식을 판별합니다.
- MUSX·MNX·MuseScore 입력은 기본 재생 정보를 보존하며 고급 기보와 레이아웃은 단순화됩니다.
- 통합 불러오기 대화상자는 전체 지원 형식과 MIDI·KAR, XMI·HMP·HMI, Tracker(MOD/S3M/XM/IT), MusicXML, MNX, Finale, MuseScore, Guitar Pro, PlayStation, Nintendo, Sega, VOCALOID, UTAU, OpenUtau, Synthesizer V, CeVIO, 모비바드 프로젝트, 3MLE·MabiIcco·MML 필터를 제공합니다. Classic Mac은 별도 카테고리 없이 전체 또는 관련 옛 포맷군에서 `.bin`·`.macbin`을 선택하면 내부 형식을 자동 판별합니다.
- MIDI 참조, MML 가져오기, 오디오 가져오기도 같은 공용 파일 선택 경로를 사용하며 브라우저 미지원 시 기존 파일 입력으로 자동 대체됩니다.
- 지원 파일 팝업은 표준 음악·악보, 음악 편집기, 콘솔, 보컬 편집기 등으로 구분하며 VOCALOID·UTAU·OpenUtau·Synthesizer V·CeVIO를 서로 다른 제품군으로 표시합니다.
- 지원 파일 팝업에는 Classic Mac 컨테이너를 별도 형식이나 안내 항목으로 표시하지 않으며, 선택 뒤 공용 입력 계층이 자동 판별합니다.
- 불러오기 팝업은 긴 파일명이나 긴 텍스트가 있어도 뷰포트 폭을 넘겨 늘어나지 않도록 내부 요소의 최소 폭과 말줄임을 제한하며 하단 작업 버튼을 항상 팝업 안에 유지합니다.

## 편집

- 채널 추가·삭제·복제·순서 변경·표시·음소거를 지원합니다.
- 노트 선택·복사·붙여넣기·이동·길이·볼륨 편집을 지원합니다.
- MIDI/악보 파일은 양자화된 위치가 아니라 원본 MIDI tick 시간으로 먼저 성부를 분리한 뒤 1/64 또는 1/32 격자에 양자화합니다. 같은 Bank/Program의 여러 트랙은 하나의 악기 그룹으로 합치되 원본 Track·Port·Channel과 음역·직전 음정을 성부 배정 우선순위에 반영합니다. 원본에서는 순차적이지만 양자화 때문에 같은 칸에 겹친 노트는 새 채널을 만들지 않고 해당 성부의 대표 노트로 축약합니다. `64박 겹침 무시`는 원본 타이밍에서 1/64 이하의 작은 순차 겹침을 같은 성부로 허용하며, 같은 시작점의 실제 화음은 항상 별도 성부로 유지합니다.
- 파일 불러오기에서 `악기당 최대 3채널`을 선택하면, 원래 4개 이상의 성부가 필요한 악기도 최대 3개의 편집 채널에 재배치합니다. 이 채널 수 제한기는 `N`을 인자로 받는 일반 함수로 구현되어 있으며, 빈 채널을 우선 사용한 뒤 필요하면 같은 채널의 시간 영역에 노트를 겹쳐서라도 모든 노트를 보존하는 방식으로 압축합니다. 기본값은 해제입니다.
- MIDI 악기 그룹은 Drum을 제외하고 Bank + Program 조합을 기준으로 구분하여 서로 다른 Bank의 동일 Program이 잘못 합쳐지지 않도록 합니다.
- MML 가져오기·내보내기와 프로젝트 저장·불러오기를 지원합니다. MML 내보내기를 실행하면 편집 채널 선택 팝업을 먼저 표시하며 모든 채널은 기본 체크 해제 상태이고 선택한 채널만 하나의 MML로 클립보드에 내보냅니다.
- 템포 이벤트와 참조 오디오를 작업 문서에서 관리합니다.

## 재생과 화면

- SF2·SF3·DLS와 `assets/default_sf3.js`에 내장된 자체 제작 `MobiBard_Instruments.sf3` 14프리셋을 공용 SoundBank 계층에서 사용합니다.
- `editor/js/soundbank-player.js`가 공용 SoundBank 모델을 Editor의 실시간 재생기에 연결합니다.
- 상단 지원 파일 버튼은 노트·선택 도구 묶음의 왼쪽에 있습니다.
- 확대·축소, 가로·세로 스크롤, 재생 위치 추적, 채널 트리 키보드 이동을 지원합니다.
- 공용 로그인·게스트 아이콘은 `assets/icons/`를 사용하며, Guest 아이콘은 버튼 배경과 분리된 투명 사람 실루엣입니다.

## 주요 의존성

```text
plugins/common/
plugins/formats/
editor/js/soundbank-player.js
assets/default_sf3.js
assets/icons/
```
## 다국어 처리

- 공용 규칙은 `../plugins/common/I18N_SPEC.md`를 따릅니다.
- Editor locale의 `strings`와 `patterns` key는 영어 semantic key만 사용하며 5개 언어가 동일한 key 집합을 유지합니다.
- `<head>`에서 URL/공용 저장 설정/브라우저 언어를 먼저 결정하고 한국어 기준 catalog와 선택 catalog를 앱 및 Analytics보다 먼저 준비합니다.
- 정적 HTML은 읽을 수 있는 한국어 fallback 본문과 `data-i18n` semantic key를 함께 사용합니다. 새 동적 문구는 `MobibardI18n.t(key)`를 사용합니다.



## 2026-09-14 채널 MML 빠른 편집

- Editor 채널 행에 `M` 버튼을 추가했습니다.
- 버튼을 누르면 해당 채널의 노트/볼륨 MML을 팝업에서 확인하고 직접 수정할 수 있습니다.
- 적용 시 기존 채널을 새로 만들지 않고 현재 채널 노트를 교체합니다.
- 템포/페이드 설정은 타임라인 값을 유지하며 채널 MML 편집에서 변경하지 않습니다.

### 2026-09-19 통합 불러오기 팝업 정리
- MIDI/KAR 및 변환 가능한 음악 파일은 한 개의 통합 불러오기 팝업을 사용합니다. 상단은 `옵션` / `채널` 두 줄로 구성되며, 옵션 줄에는 파일 선택·양자화·64박 겹침 무시·악기당 최대 3채널을, 채널 줄에는 전체 선택/해제·파일 요약·원본 듣기를 표시합니다.
- 3MLE / MabiIcco(MMI) / MML 텍스트도 별도 팝업 없이 같은 통합 팝업을 사용합니다. 이 계열은 MIDI 옵션 줄을 표시하지 않고 텍스트/파일 입력과 채널 선택만 제공합니다.
- 통합 팝업의 원본 듣기와 채널별 미리듣기는 SoundBank 준비 및 pitch preload 후 재생합니다.
- MML 계열 `새로 열기`는 파일의 템포 맵을 새 프로젝트에 적용하고, `추가`는 파일의 절대 연주 시간을 현재 프로젝트 템포 맵의 beat 위치로 재계산해 노트를 추가합니다.
