# 마비노기 MML 재생기 샘플 - 모비바드 v3.4

공개용 정적 웹앱입니다. 기본 MML 재생, MIDI/MMI/3MLE MML/TXT 불러오기, MML 최적화, 나눠복사, Google Drive 연동, Firebase Analytics, 채널별 음색 프리셋을 한 페이지에서 처리합니다.

기본 재생은 로컬 파일만으로 동작합니다. Google Drive 연동을 사용하려면 Google Identity Services와 Google Picker 스크립트를 온라인으로 불러오며, `js/google-config.js` 설정이 필요합니다. Firebase Analytics는 `js/firebase-config.js`와 `js/firebase-analytics.js`에서 초기화합니다.

---

## 빠른 실행

```bash
cd mabinogi_mml_public
python -m http.server 8000
```

브라우저에서 `http://localhost:8000/`로 접속합니다.

`index.html`만 따로 복사하면 `js/`, `styles.css`, `assets/` 파일을 찾지 못합니다. 배포할 때는 폴더 구조를 그대로 유지해야 합니다.

---

## 파일 구조와 역할

```text
mabinogi_mml_public/
├─ index.html                  # 화면 골격, 주요 버튼, 모든 dialog 마크업, 버전 표시
├─ styles.css                  # 전체 레이아웃, 다이얼로그, MIDI 변환 UI, 테마 스타일
├─ README.md                   # 현재 문서
├─ favicon.ico                 # 루트 favicon 복사본
├─ assets/
│  ├─ favicon.ico              # 실제 favicon 링크 대상
│  ├─ Roland_SC-55.sf2         # 기본 사운드폰트
│  └─ default-sf2-base64.js    # 기본 SF2 내장 fallback
└─ js/
   ├─ utils.js                 # 공통 유틸: clamp, formatTime, shortError, base64 변환
   ├─ midi-to-mml.js           # MIDI 파서/분석/미리듣기 이벤트/6채널 MML 변환
   ├─ mml-parser.js            # MML@ 분해, 파트 파싱, 글로벌 템포맵, 재생 스케줄 생성
   ├─ mml-optimizer.js         # 자동 최적화, 쉼표 삭제, 볼륨 조절, 시작 공백, 나눠복사
   ├─ sf2-sampler.js           # SF2 파싱, 노트 준비, look-ahead 오디오 스케줄링
   ├─ google-config.js         # Google OAuth/Picker/API Key 설정
   ├─ firebase-config.js       # Firebase Web App 설정 객체
   ├─ firebase-analytics.js    # Firebase Analytics 초기화와 이벤트 큐 처리
   └─ app.js                   # 앱 상태, UI 이벤트, 파일/Drive 입출력, Dialog 제어, 재생 제어
```

### 전역 모듈 연결

빌드 도구 없이 브라우저 전역 객체로 모듈을 연결합니다.

| 파일 | export 전역 | 주요 함수 |
|---|---|---|
| `js/utils.js` | `window.MabiUtils` | `clamp`, `clampInt`, `unique`, `formatTime`, `shortError`, `base64ToUint8Array` |
| `js/midi-to-mml.js` | `window.MabiMidi` | `analyzeMidi`, `midiToMml`, `buildMidiInstrumentPreview`, `buildMidiFilePreview` |
| `js/mml-parser.js` | `window.MabiMml` | `parseMabinogiMml`, `splitMmlParts`, `parseMmlPart`, `buildSchedule`, `beatToSeconds`, `composeMml` |
| `js/mml-optimizer.js` | `window.MabiOptimizer` | `optimizeMml`, `optimizePart`, `trimShortRestsMml`, `adjustVolumesMml`, `addLeadingSilenceMml`, `splitMmlPages` |
| `js/sf2-sampler.js` | `window.MabiSf2` | `parseSoundFont`, `prepareNotes`, `schedulePreparedNotes`, `scheduleNotes` |
| `js/firebase-analytics.js` | `window.MobibardAnalytics` | `logEvent`, `isReady`, `isEnabled`, `getStatus` |

`app.js`는 위 전역 객체를 가져와 UI와 파일 흐름을 연결합니다. 새 기능을 넣을 때는 계산/변환 로직은 가능한 전용 JS에 두고, `app.js`에는 UI 상태와 호출 흐름만 남기는 편이 유지보수하기 쉽습니다.

---

## 현재 앱 기준값

| 항목 | 값 / 위치 |
|---|---|
| 앱 버전 표시 | `index.html`의 `<title>`과 `.app-version`: `모비바드 v3.4` |
| MML 파트 수 | 최대 6개: `멜로디`, `화음1`~`화음5` (`app.js`의 `PART_LABELS`) |
| 설정 localStorage prefix | `mobibard.player.` (`app.js`의 `PREF_PREFIX`) |
| 기본 SF2 | `assets/Roland_SC-55.sf2` |
| 기본 내장 SF2 fallback | `window.MABINOGI_DEFAULT_SF2_B64` (`assets/default-sf2-base64.js`) |
| 자동 시작 공백 | 불러오기/붙여넣기 시 T120 기준 약 2초 (`AUTO_IMPORT_LEADING_SILENCE_SECONDS = 2`) |
| MMI/3MLE 선택 최대 채널 | 6개 (`MMI_IMPORT_MAX_CHANNELS`) |
| 감지 채널 최대 표시 | 96개 (`MMI_IMPORT_MAX_DETECTED_PARTS`) |
| 지원 불러오기 확장자 | `.mid`, `.midi`, `.txt`, `.mmi`, `.mml` |
| Google 기본 폴더 | `MML_Mobibard` |
| Google 설정 파일 | 앱 데이터 폴더의 `mobibard-player-settings.json` |
| Google 로그인 유지 플래그 | `mobibard.player.googleAutoReconnect` |
| Google 단기 토큰 캐시 | `mobibard.player.googleTokenCache` (`accessToken`, `expiresAt`, 로컬 전용) |
| Google scope | `drive.file`, `drive.appdata` |
| Firebase 프로젝트 | `mobibard` (`js/firebase-config.js`) |
| Firebase Analytics 측정 ID | `G-38SYBVDLZQ` (`js/firebase-config.js`) |
| Firebase SDK | CDN modular SDK `12.15.0` (`js/firebase-analytics.js`) |

---

## 주요 UI 영역

### 1. 상단 앱 카드

- 앱 제목과 버전 표시
- 디스코드 바로가기
- 개발자 MML 공유와 MIDI 파일 사이트를 여는 바로가기 콤보박스
- Google 로그인 / 로그아웃
- 테마 전환
- 파일 불러오기 / 저장하기 그룹
- 붙여넣기, 전부복사, 나눠복사
- 재생, 처음, 반복, 재생 시간, 배속, 볼륨, 진행 슬라이더
- 진행 슬라이더 위 템포 변화 마커

### 2. MML 보기 · 편집 카드

- `전체 MML`, `멜로디`, `화음1`~`화음5` 탭
- 전체 MML 탭은 파트별 색상 하이라이트를 표시합니다.
- 현재 탭 글자 수를 `1,234 자` 형식으로 표시합니다.
- 전체 MML의 글자 수는 `MML@`, 쉼표, 세미콜론을 제외한 파트 내용 합계입니다.
- `쉼표 삭제`, `볼륨 조절`, `시작 공백 시간` 편집 기능을 제공합니다.
- 사운드 폰트 선택, 자동/사용자 음색 프리셋, 채널별 음색 설정, 전체/채널 음소거를 제공합니다.

### 3. Dialog 목록

| ID | 용도 |
|---|---|
| `googleDriveSaveDialog` | Google Drive 저장 파일명/폴더 선택 |
| `mmiImportDialog` | MMI/3MLE MML 채널 선택, 선택 듣기, 전부 듣기, 모두 선택해제, 파일 다시 불러오기, 채널 미리듣기 |
| `partSoundDialog` | 멜로디/화음1~5 채널별 SF2 프리셋 설정 및 사용자 프리셋 저장/삭제 |
| `codeHelpDialog` | 지원 MML 코드 도움말, 숫자형 명령 설명/예시 |
| `restTrimDialog` | 짧은 쉼표 삭제 길이와 적용 채널 선택 |
| `bulkVolumeDialog` | 볼륨 조절 변화량과 적용 채널 선택 |
| `leadingSilenceDialog` | 시작 공백 초 단위 입력 |
| `splitCopyDialog` | 나눠복사 결과, 악보별 듣기/복사 |
| `midiConvertDialog` | MIDI 변환 설정 안내, 채널 역할, 겹침 병합, 악기 선택, 미리 듣기, MIDI 듣기, 채널별 듣기, 악기별 듣기, 파일 다시 불러오기 |

---

## 파일 불러오기 흐름

모든 로컬 불러오기는 숨겨진 `#midiFile` input을 사용합니다. Dialog 안의 `파일 불러오기` 버튼도 같은 picker를 다시 열며, 새 파일을 고르면 열려 있던 import dialog를 닫고 새 파일 흐름으로 들어갑니다.

### 공통 진입점

- 로컬 버튼: `openSourceFilePicker()` → `loadSourceFile()` → `loadLocalSourceFile(file)`
- 드래그 앤 드롭: Dialog가 열려 있지 않을 때만 `installSourceFileDropHandlers()`가 첫 지원 파일을 찾아 `loadLocalSourceFile(file)` 호출
- Google Drive: `openGoogleDrivePicker()` → `handleGooglePickerResult()` → `loadGoogleDriveSourceFile(fileId, name)`

### 확장자별 처리

| 확장자 | 처리 |
|---|---|
| `.mid`, `.midi` | `analyzeMidi()`로 파일 요약과 악기 그룹을 만들고 `midiConvertDialog` 표시 |
| `.mmi` | MabiIcco 저장 파일에서 MML 후보를 추출해 `mmiImportDialog`에서 최대 6개 선택 |
| `.mml` | `MML@...;`이면 TXT처럼 처리, 아니면 3MLE `[ChannelN]` 프로젝트로 처리 |
| `.txt` | `MML@...;` 형식만 허용, 가능하면 자동 최적화 후 반영 |

### 불러온 뒤 공통 보정

- 전체 MML 형식은 `normalizeMmlForDisplay()`로 정리합니다.
- MIDI/MMI/3MLE/TXT 불러오기와 클립보드 붙여넣기에는 기존 공통 선행 무음을 정리한 뒤 T120 기준 약 2초 시작 공백을 자동으로 넣습니다.
- 최적화 중 채널 내부 문법 오류가 있으면 가능한 경우 원본을 불러오고, 최적화 생략 안내를 표시합니다.

---

## MMI / 3MLE MML 처리 규칙

### MMI

- MabiIcco 저장 파일 안에서 MML 후보를 추출합니다.
- `name` 항목이 있으면 `Ch 번호 · 이름` 형식으로 표시합니다.
- 처음에는 앞쪽 최대 6개 채널이 자동 선택됩니다.
- 선택 채널은 최대 6개입니다.
- `선택 듣기`는 현재 체크된 채널만 합쳐서 재생합니다.
- `전부 듣기`는 체크 여부와 관계없이 읽어온 파일에서 감지된 모든 MML 후보 채널을 합쳐서 재생합니다.
- 오래된 MMI의 `6`, `12`, `24`, `48` 같은 비정규 길이는 64분음표 기준의 정규 길이 조합으로 근사 보정합니다.
  - 예: `c6` → `c8&c32&c64`
  - 예: `r12` → `r16r64`

### 3MLE 레거시 `.mml`

- `[ChannelN]` 섹션을 찾아 채널 후보로 표시합니다.
- `// 채널명` 주석을 채널 이름으로 표시합니다.
- MMI와 같은 선택 Dialog를 사용하므로 `선택 듣기`와 `전부 듣기`를 모두 지원합니다.
- `/*M */` 마디 주석과 3MLE 전용 명령은 불러오기 전에 정리합니다.
- `[Channel1]` 또는 파일 전체에서 전역 템포 `T150` 같은 값을 찾으면, 템포가 없는 각 선택 채널 앞에 적용합니다.
- 이미 채널 자체가 `T숫자`로 시작하면 전역 템포를 중복 삽입하지 않습니다.

---

## MIDI 변환 흐름

MIDI 변환은 `js/midi-to-mml.js`가 담당하고, `app.js`는 설정 Dialog와 결과 적용만 담당합니다.

사용자가 MIDI 파일을 불러오면 `midiConvertDialog`가 열립니다. 이 Dialog는 “MIDI 안의 악기들을 마비노기 MML의 1~6개 채널에 어떻게 배치할지” 정하는 화면입니다. 상단 안내는 기본 접힘 상태의 `<details>`로 표시합니다. 요약 줄에는 이 화면이 “MIDI 안의 악기들을 마비노기 MML의 최대 6채널에 나눠 넣는 설정”임을 보여 주고, 펼치면 `MIDI 듣기 → MML 채널 선택 → 오른쪽 악기 선택 → 미리 듣기/변환` 순서와 용어 설명을 확인할 수 있습니다.

1. MIDI 전체를 파싱합니다.
2. 트랙 수, PPQ, 템포 수, 후보 채널 수, 악기 그룹을 분석합니다.
3. 기본 상태에서는 멜로디/화음1/화음2에 일반 악기 후보가 모두 체크되고, 화음3/화음4/화음5는 악기가 선택되지 않습니다.
4. 각 MML 채널마다 역할, 겹침 병합 방식, 사용할 악기를 직접 조정할 수 있습니다.
5. 악기가 하나 이상 선택된 채널만 최종 MML에 포함됩니다. 비어 있는 채널은 자동으로 제외됩니다.
6. `미리 듣기`를 누르면 현재 선택/역할/겹침 병합 기준으로 실제 MML 변환 결과를 만들고, 편집기에 반영하지 않은 채 미리 재생합니다.
7. 변환 버튼을 누르면 입력/버튼을 잠그고 상태 문구를 표시합니다.
8. 변환 결과를 전체 MML에 반영하고, MIDI 악기 선택 정보를 `최근 MIDI 음색` 자동 프리셋으로 갱신합니다.

### MIDI 미리듣기

- `MIDI 듣기`: 원본 MIDI 파일을 최대 45초까지 미리 재생합니다.
- `미리 듣기`: 악기가 선택된 MML 채널, 채널 역할, 겹침 병합, 악기 체크 상태를 기준으로 MML로 변환했을 때의 소리를 미리 재생합니다.
- MML 채널 행의 `듣기`: 해당 채널 하나만 현재 역할/악기 선택 기준으로 MML 변환해 미리 재생합니다.
- 악기별 `듣기`: 오른쪽 악기 목록에서 해당 악기만 짧게 재생합니다.
- 모든 듣기/재생 경로에는 동시 발음 4개 이상부터 자동 음량 보정이 적용되어, 여러 소리가 겹칠 때만 소리가 과하게 커지는 것을 줄입니다.

### MIDI 악기 선택

- 화면에는 악기명 단위로 선택지를 표시합니다.
- 같은 악기명이 여러 MIDI 채널에 있어도 하나의 선택지로 묶습니다.
- 내부적으로는 원본 MIDI 채널/프로그램 정보를 유지합니다.
- 한 MML 채널에는 여러 악기를 선택할 수 있습니다.
- 여러 MML 채널이 같은 악기를 선택할 수 있습니다.
- 원본 MIDI 노트 하나는 전체 MML 채널 중 한 곳에만 배치됩니다. 같은 노트를 여러 MML 채널에 복제하지 않습니다.
- 악기 목록에는 전부 선택 / 전부 해제 / 분류별 선택 / 악기별 듣기 버튼이 있습니다.
- 일반 악기는 `건반악기`, `현악기`, `관악기`, `타악기`, `나머지` 섹션으로 나눠 표시하며, 각 섹션 제목에 `현악기 6개`처럼 현재 목록 개수를 함께 표시합니다.
- 섹션 제목은 접고 펼칠 수 있으며, 기본은 모두 펼친 상태입니다.
- 분류별 선택 버튼은 `건반악기`, `현악기`, `관악기`, `타악기` 4개만 제공하고 `나머지`는 목록 분류로만 표시합니다.
- 악기 목록에는 해당 악기가 선택된 MML 채널을 배지로 표시합니다.
- MML 채널 목록에는 악기 이름 대신 선택된 악기 개수를 표시합니다.

### 비트 악기 분류

- MIDI 10번 채널의 타악 노트는 킥/스네어/심벌즈처럼 노트 번호별 비트 악기로 묶습니다.
- 드럼, 스네어, 북, 공, 심벌즈, 킥, 하이햇, 탐 등 비트 힌트가 있는 악기는 비트 그룹으로 분류합니다.
- 비트 그룹이 없는 MIDI에서는 역할 선택에서 `비트` 항목을 숨기고, MML 채널의 `미리 듣기` 버튼 줄 왼쪽에 안내 문구를 표시합니다.
- 일반 채널 역할은 일반 악기만, 비트 역할은 비트 악기만 선택할 수 있습니다.

### MML 채널 역할

| 역할 | 동작 |
|---|---|
| `자동` | 중립 역할. 배치 가능한 일반 악기 음을 보완적으로 가져갑니다. |
| `고음` | `O4` 이상, MIDI 60 이상 음을 우선 수집합니다. |
| `저음` | `O4` 미만, MIDI 59 이하 음을 우선 수집합니다. |
| `비트` | 비트 그룹 노트만 수집합니다. |

기본 역할은 1번 채널 `고음`, 3번 채널 `저음`, 나머지 채널 `자동`입니다.

### 겹침 병합

| 값 | 동작 |
|---|---|
| `모두` | 채널이 이미 울리는 중이어도 기존 음 일부를 줄이고 새 음을 이어 넣습니다. |
| `절반` | 앞 음이 절반 이상 지난 뒤 겹칠 때만 기존 음 일부를 줄이고 새 음을 이어 넣습니다. |
| `안함` | 겹침 병합을 사용하지 않습니다. |

기본값은 멜로디와 화음2가 `절반`, 나머지 채널이 `모두`입니다.

겹침 병합은 MML의 제한된 채널 수 안에 더 많은 소리를 담기 위한 구제책입니다. 정상 배치 가능한 채널이 있으면 사용하지 않고, 모든 적합 채널이 이미 울리는 중일 때만 기존 음의 끝부분을 줄여 겹친 음을 이어 넣습니다.

---

## MML 파싱과 최적화 규칙

### 코드 도움말 표시 기준

`codeHelpDialog`는 `index.html`에 정적 마크업으로 구성되어 있습니다. 범위 설명은 마비노기 MML에서 사용하는 범위를 기준으로 맞춥니다.

| 코드 | 마비노기 기준 범위 / 설명 |
|---|---|
| `T` | `32~255`; 템포(BPM), 숫자가 클수록 빠름 |
| `O` | `0~7`; 옥타브, 숫자가 클수록 높은 음역 |
| `L` | `1,2,4,8,16,32,64`; 기본 음 길이, 숫자가 클수록 짧음 |
| `V` | `0~15`; 볼륨 |
| 음표/쉼표 길이 | `1,2,4,8,16,32,64`; 각 음표/쉼표 뒤에 붙이는 길이 |
| `N` | `4~88`; 마비노기 음 번호, `N48`은 4옥타브 도 |

도움말 문구를 바꿀 때는 `js/mml-parser.js`와 `js/mml-optimizer.js`의 검증 범위도 같이 확인해 주세요.

### 파싱 / 재생

- `MML@melody,chord1,...;` 형식을 파트 배열로 나눕니다.
- 템포 `T`는 파트별 템포가 아니라 전체 성부에 공유되는 글로벌 템포로 취급합니다.
- 모든 파트에서 발견한 템포 이벤트를 하나의 템포맵으로 합칩니다.
- 같은 박자 위치에 여러 `T`가 있으면 나중 순서의 값을 최종값으로 사용합니다.
- 재생 스케줄은 `buildSchedule()`에서 초 단위 노트 목록과 템포 마커를 만듭니다.

### 자동 최적화

MIDI/MMI/3MLE/TXT 불러오기, 붙여넣기, 전부복사, 파일저장, 쉼표 삭제, 시작 공백 시간, 나눠복사 결과에는 공통 최적화 단계를 적용합니다.

- 각 비어 있지 않은 채널 시작에 `V`, `O`, `L`을 명시합니다.
- 시작 템포가 없으면 멜로디 채널 시작에 `T120`을 추가합니다.
- 모든 `T` 템포 명령은 글로벌 규칙에 맞게 멜로디 채널로 이동합니다.
- 다른 채널의 `T`가 멜로디 음표 중간 위치에 있으면 음표를 `&`로 나누어 타이밍을 보존합니다.
- `N` 코드는 출력하지 않고 `a~g`, `+`, `-`, `O`, `<`, `>` 조합으로 다시 씁니다.
- 연속 쉼표는 같은 무음 길이를 유지하는 범위에서 더 짧은 `r` 표기로 합칩니다.
- 이미 `&`로 이어진 음은 가능한 짧은 길이 표기로 다시 씁니다.
- 같은 음이 연속되어 있어도 원래 `&`로 이어진 음이 아니면 임의로 합치지 않습니다.
- `T/O/L/V`는 대문자, `r/n/a~g`는 소문자로 정리합니다.

### 쉼표 삭제

- `모든 쉼표`, `4/8/16/32/64분음표 이하` 중 선택합니다.
- 기본 선택값은 `32분음표 이하`입니다.
- 삭제한 쉼표 길이는 바로 앞 음표에 흡수합니다.
- 템포 변화 지점을 지나도록 늘어난 음표는 해당 지점에서 `&`로 나누어 타이밍을 보존합니다.
- Dialog의 6채널 체크박스에서 적용할 채널을 선택합니다.
- Dialog를 열면 기본으로 6채널이 모두 체크되어 있습니다.
- `전부 선택` / `선택 해제` 버튼으로 적용 채널을 빠르게 바꿀 수 있습니다.

### 볼륨 조절

- `볼륨 조절` 버튼에서 Dialog를 엽니다.
- 볼륨 변화량은 `-15 ~ 15` 사이의 정수만 입력할 수 있습니다.
- 선택한 채널의 모든 음표 볼륨에 변화량을 더합니다.
- 결과 볼륨은 마비노기 MML 지원 범위인 `V0 ~ V15`로 제한합니다.
- Dialog를 열면 기본으로 6채널이 모두 체크되어 있습니다.
- `전부 선택` / `선택 해제` 버튼으로 적용 채널을 빠르게 바꿀 수 있습니다.

### 시작 공백 시간

- Dialog에서 초 단위로 입력합니다.
- 기본값은 2초입니다.
- 입력 단위는 0.25초입니다.
- 설정 구간은 T120 기준으로 시작하고, 기존 악보의 템포는 공백 뒤로 이동합니다.

### 나눠복사

- 기본 제한은 채널당 2,400자입니다.
- 각 악보는 독립 악보이므로 시작 시점의 `T/O/L/V`를 다시 선언합니다.
- Dialog에서 악보별 듣기/복사 버튼을 제공합니다.
- 파트 순서와 페이지별 독립 실행 상태를 보존하기 위해 필요한 빈 채널 위치를 유지할 수 있습니다.

---

## 재생 / SF2 처리

- 기본 사운드는 `Roland_SC-55.sf2`입니다.
- 사용자가 `.sf2` 파일을 선택할 수 있고, 기본 사운드로 되돌릴 수 있습니다.
- 긴 MML을 재생할 때 모든 음표를 한 번에 예약하지 않고, 현재 위치 기준 약 1.6초 앞까지만 예약하는 look-ahead 스케줄러를 사용합니다.
- SF2 샘플 버퍼와 음표별 재생 region은 재생 시작 전에 준비해 첫 재생 중 끊김을 줄입니다.
- `V0`처럼 소리 나지 않는 음표는 실제 오디오 노드를 만들지 않습니다.
- 64분음표처럼 짧은 음표는 attack/release 시간을 음 길이에 맞게 줄여 짧은 음이 뭉개지거나 밀리는 현상을 줄입니다.
- 재생이 끝난 `AudioBufferSourceNode`는 active 목록에서 제거합니다.
- 재생 시간 표시는 `분:초.밀리초` 형식입니다. 예: `01:23.456`
- 재생 배속 범위는 `0.75x`~`1.50x`, 기본값은 `1.00x`입니다.
- 볼륨은 기본 100%, 최대 150%입니다. 100%를 넘기면 악보와 사운드폰트에 따라 소리가 찢어질 수 있습니다.

---

## 채널별 음색 / 음소거

- `음색` 버튼에서 멜로디/화음1~5가 사용할 SF2 프리셋을 각각 선택합니다.
- Dialog의 `음색 프리셋` 첫 항목은 `자동 음색`입니다.
- 최근 MIDI 변환 음색이 있으면 자동 음색은 그 구성을 사용하고, 없으면 기본 음색을 사용합니다.
- 현재 채널별 음색 구성을 이름 붙여 저장하고 삭제할 수 있습니다.
- 상단의 프리셋 콤보박스에서도 `자동 음색`과 저장한 프리셋을 바로 적용할 수 있습니다.
- 전체 MML 탭에서는 `전체 음소거`로 모든 채널을 한 번에 음소거/해제합니다.
- 개별 파트 탭에서는 `채널 음소거`로 해당 채널만 재생에서 제외합니다.
- 설정은 localStorage와 Google Drive 앱 데이터 설정 동기화 대상에 포함됩니다.

---

## 복사 / 저장 규칙

### 전부복사

- 어떤 채널 탭을 선택 중이어도 항상 전체 MML을 복사합니다.
- 복사 전에 자동 최적화합니다.
- 복사 후 포함된 채널과 각 채널 글자 수를 Dialog로 안내합니다.

### 로컬 파일저장

- 어떤 채널 탭을 선택 중이어도 항상 전체 MML을 저장합니다.
- 저장 전에 자동 최적화합니다.
- MIDI에서 변환했거나 Drive에서 불러온 경우 원본 파일명을 `.txt`로 바꿔 제안합니다.
- 로컬 TXT/클립보드 입력은 `mml_YYMMDDHHMMSS.txt` 형식을 제안합니다.
- 지원 브라우저에서는 저장 위치와 파일명을 고르는 저장 Dialog를 사용합니다.
- 미지원 브라우저에서는 파일명 입력 후 다운로드 방식으로 저장합니다.

### 전체 MML 표시와 출력 차이

- 전체 MML 편집 영역은 빈 채널 콤마를 유지해 파트 순서를 보존합니다.
- 전부복사/파일저장은 빈 채널을 제거한 정돈된 전체 MML을 사용합니다.
- 나눠복사는 파트 순서와 페이지별 독립 실행 상태 때문에 필요한 빈 채널 위치를 유지할 수 있습니다.

---

## Google Drive 연동

Google Drive 연동을 쓰려면 Google Cloud Console에서 아래 항목을 준비한 뒤 `js/google-config.js`에 입력합니다.

```js
window.MOBIBARD_GOOGLE_CONFIG = {
  clientId: "발급받은 Web OAuth Client ID",
  apiKey: "발급받은 API Key",
  appId: "Google Cloud 프로젝트 번호"
};
```

### Google Cloud 설정 체크리스트

- OAuth Client 유형은 `Web application`을 사용합니다.
- 승인된 JavaScript origin에 실제 배포 주소와 로컬 테스트 주소를 등록합니다. 예: `http://localhost:8000`
- Google Drive API와 Google Picker API를 활성화합니다.
- OAuth 동의 화면에 앱 이름, 지원 이메일, 개발자 연락처를 입력합니다.
- 요청 scope는 `drive.file`과 `drive.appdata`입니다.

### 앱 동작

- 제목 오른쪽 `Google` 영역에서 로그인/로그아웃합니다.
- 로그인 성공 시 `mobibard.player.googleAutoReconnect = 1`을 저장합니다.
- 새 창/새로고침에서 바로 연동 상태를 복원하기 위해 `mobibard.player.googleTokenCache`에 단기 access token과 만료 시각(`expiresAt`)을 저장합니다.
- 저장된 토큰이 아직 유효하면 Google 팝업 없이 즉시 `구글 연동됨` 상태와 Drive 버튼을 복원합니다.
- 저장된 토큰이 만료되었거나 Drive API가 401을 반환하면 토큰 캐시를 지우고 `로그인 필요` 상태로만 전환합니다. 페이지 진입/백그라운드 설정 동기화 중에는 Google 로그인 팝업이나 계정 선택창을 자동으로 띄우지 않습니다.
- `googleAutoReconnect`와 `googleTokenCache`는 브라우저별 로그인 유지용 로컬 상태이므로 Google Drive 설정 동기화 payload에서는 제외합니다.
- 로그아웃은 `googleAutoReconnect`를 `0`으로 바꾸고 현재 토큰과 토큰 캐시를 삭제합니다. Google 계정의 앱 권한 동의를 철회하지 않습니다.
- `불러오기 > 구글`은 `MML_Mobibard` 폴더를 기본 위치로 열고, MIDI/MMI/3MLE MML/TXT 파일을 선택하게 합니다.
- Google Picker 목록은 Drive MIME 타입 차이를 고려해 넓게 표시하고, 선택 후 확장자/MIME 검사를 다시 합니다.
- `저장하기 > 구글`은 현재 전체 MML을 최적화한 뒤 `.txt` 파일로 저장합니다.
- 새 TXT 저장 시 `MML_Mobibard` 폴더를 기본 저장 위치로 제안하고, 저장 Dialog에서 위치를 바꿀 수 있습니다.
- 같은 폴더에 같은 이름의 TXT 파일이 있으면 저장 버튼을 눌렀을 때 덮어쓸지 확인합니다.
- 브라우저 localStorage 설정 캐시는 앱 데이터 폴더에 `mobibard-player-settings.json`으로 동기화합니다.
- 사용자 SF2 파일 본문은 브라우저 파일 권한과 용량 문제 때문에 Drive 설정 캐시에 포함하지 않습니다.

---

## Firebase Analytics 연동

Firebase Analytics는 빌드 도구 없이 CDN modular SDK를 `type="module"`로 불러와 초기화합니다.

### 파일 역할

| 파일 | 역할 |
|---|---|
| `js/firebase-config.js` | Firebase Console에서 가져온 웹 앱 `firebaseConfig` 보관 |
| `js/firebase-analytics.js` | `initializeApp()`, `getAnalytics()`, `logEvent()` 래퍼, 초기화 전 이벤트 큐 처리 |
| `js/app.js` | `trackAnalytics()`로 앱 동작 이벤트 호출 |
| `index.html` | Firebase 설정/Analytics 스크립트를 `app.js`보다 먼저 선언 |

### 현재 기록하는 이벤트

파일명이나 원문 MML 내용은 Analytics로 보내지 않습니다. 이벤트에는 파일 종류, 채널 수, 미리듣기 종류처럼 동작 분석에 필요한 값만 넣습니다.

| 이벤트 | 발생 위치 | 주요 파라미터 |
|---|---|---|
| `mobibard_app_open` | 앱 초기화 완료 | `version` |
| `google_drive_login`, `google_drive_logout` | Google 로그인/로그아웃 | `settings_source` |
| `google_drive_picker_open` | Drive Picker 열기 | 없음 |
| `shortcut_link_open` | 상단 바로가기 콤보박스 선택 | `link` |
| `midi_resource_link_open` | 상단 바로가기 콤보박스에서 MIDI 사이트 선택 | `site` |
| `local_import_midi`, `drive_import_midi` | MIDI 파일을 변환 Dialog로 열 때 | `file_type`, `file_size`, `instrument_groups`, `note_count` |
| `local_import_mml`, `drive_import_mml` | MMI/3MLE/TXT MML 불러오기 완료 | `file_type`, `file_size`, `channel_count` |
| `preview_midi_file` | MIDI 원본 미리듣기 | 없음 |
| `preview_midi_selected` | MIDI 현재 설정 미리듣기 | `export_channels` |
| `preview_midi_export_channel` | MIDI 변환 설정의 MML 채널별 미리듣기 | `channel_index` |
| `preview_midi_instrument` | MIDI 악기별 미리듣기 | 없음 |
| `preview_mml_selected`, `preview_mml_all`, `preview_mml_channel` | MMI/3MLE 선택/전부/채널 미리듣기 | `channel_count`, `channel_index` |
| `midi_convert_complete` | MIDI 변환 완료 | `export_channels`, `instrument_groups`, `optimized_chars` |
| `playback_start` | 메인 재생 시작 | `offset_sec`, `channel_count` |
| `paste_mml`, `copy_all_mml`, `local_save_mml`, `drive_save_mml` | 붙여넣기/복사/저장 | `channel_count`, `create_new` |
| `split_copy_open`, `preview_split_page`, `copy_split_page` | 나눠복사 Dialog/악보별 듣기/복사 | `page_index` |

### 동작 방식

- Analytics가 지원되지 않는 환경, 광고 차단, 네트워크 실패가 있어도 앱 기능은 계속 동작합니다.
- `app.js`가 먼저 이벤트를 호출해도 `window.__MOBIBARD_ANALYTICS_QUEUE__`에 잠시 보관하고, Firebase 초기화 후 전송합니다.
- Firebase 웹 클라이언트 config는 공개 클라이언트 식별자입니다. Admin SDK 키, service account JSON, OAuth secret, refresh token은 사용하지 않습니다.

---

## 수정할 때 자주 봐야 하는 위치

| 작업 | 먼저 볼 파일 / 함수 |
|---|---|
| 앱 버전 변경 | `index.html`의 `<title>`, `.app-version`, `README.md` |
| 버튼/레이아웃 변경 | `index.html`, `styles.css`, `app.js:init()` 이벤트 연결 |
| MML 편집기 강조 표시 변경 | `index.html`의 `.colored-textarea`, `styles.css`의 `.tempo-code`, `app.js`의 `renderPartWithErrors()`, `updateMainHighlight()`, `updatePartHighlight()` |
| 상단 바로가기/MIDI 사이트 목록·배치 변경 | `index.html`의 `#midiSiteLinks`, `app.js`의 `HEADER_SHORTCUT_LINKS`, `MIDI_RESOURCE_LINK_IDS`, `openHeaderShortcutLink()` |
| MIDI 변환 규칙 변경 | `js/midi-to-mml.js`의 `midiToMml()`, `assignNotesToVoices()`, `normalizeExportChannels()` |
| MIDI 변환 Dialog 변경 | `index.html#midiConvertDialog`, `app.js`의 `openMidiConvertDialog()`, `toggleMidiSelectedPreview()`, `renderMidiRoleList()`, `renderMidiInstrumentList()`, `syncMidiInstrumentListHeight()` |
| MMI/3MLE import 변경 | `app.js`의 `readMabiIccoMmiFile()`, `readThreeMleMmlFile()`, `openMmiImportDialog()`, `toggleMmiSelectedPreview()`, `toggleMmiAllPreview()` |
| 3MLE 템포 처리 변경 | `app.js`의 `extractThreeMleGlobalTempo()`, `applyThreeMleGlobalTempoToCandidates()` |
| MML 파싱/시간 계산 변경 | `js/mml-parser.js` |
| 최적화/쉼표/공백/나눠복사 변경 | `js/mml-optimizer.js` |
| 재생/스케줄링/SF2 변경 | `js/sf2-sampler.js`, `app.js`의 재생 제어 함수 |
| Google Drive 변경 | `app.js`의 Google 관련 함수, `js/google-config.js` |
| Firebase Analytics 변경 | `js/firebase-config.js`, `js/firebase-analytics.js`, `app.js`의 `trackAnalytics()` 호출 위치 |
| 저장 설정 변경 | `PREF_PREFIX`, `readPref()`, `writePref()`, Google settings snapshot 관련 함수 |

---

## 회귀 방지 체크리스트

수정 후 아래 항목은 한 번씩 확인하는 것을 권장합니다.

- [ ] 제목에 `모비바드 v3.4`가 보이는지
- [ ] 상단 `MML / MIDI 링크` 콤보박스가 디스코드 버튼 왼쪽에 있고, `개발자 MML 공유`와 MIDI 사이트가 새 창으로 열린 뒤 선택값이 다시 기본값으로 돌아오는지
- [ ] 기본 샘플 MML 재생/정지/처음/반복이 동작하는지
- [ ] 배속/볼륨/테마가 새로고침 후 복원되는지
- [ ] 전체 MML 편집과 개별 파트 탭 편집이 서로 동기화되는지
- [ ] 전체 MML/개별 파트 탭에서 `T120` 같은 템포 명령이 배경색으로 강조되어 찾기 쉬운지
- [ ] `코드 도움말`에서 `T/O/L/V/N`, 음표 길이, 쉼표 길이의 범위와 숫자 의미가 보이는지
- [ ] 전부복사/파일저장 전에 자동 최적화가 적용되는지
- [ ] `쉼표 삭제` Dialog에서 기본 6채널이 모두 체크되고, `전부 선택` / `선택 해제`가 동작하는지
- [ ] `쉼표 삭제`가 체크한 채널에만 적용되는지
- [ ] `볼륨 조절` Dialog에서 기본 6채널이 모두 체크되고, `전부 선택` / `선택 해제`가 동작하는지
- [ ] `볼륨 조절` 입력값이 -15~15로 제한되고, 체크한 채널의 V값만 변경되는지
- [ ] 나눠복사 Dialog에서 각 악보 듣기/복사가 동작하는지
- [ ] MIDI 변환 Dialog 상단 안내가 기본 접힘 상태인지
- [ ] MIDI 변환 Dialog 상단 안내를 펼쳤을 때 `MIDI 듣기 → 채널/악기 선택 → 미리 듣기/변환` 흐름을 이해할 수 있는지
- [ ] MIDI 변환 Dialog의 기본 상태에서 멜로디/화음1/화음2는 일반 악기가 모두 체크되어 있는지
- [ ] 화음3/화음4/화음5는 기본 악기 선택이 비어 있고, 선택하지 않으면 최종 MML에서 제외되는지
- [ ] `미리 듣기`가 현재 MIDI 변환 선택 사항을 기준으로 MML 변환 결과를 미리 재생하고, 재생 중 버튼 문구가 `정지`로 바뀌는지
- [ ] `MIDI 듣기`, `미리 듣기`, 채널별 듣기, 악기별 듣기, MMI/3MLE 듣기, 나눠복사 듣기, 메인 재생에서 동시 발음 4개 이상일 때만 자동 음량 보정이 적용되는지
- [ ] `MIDI 듣기`와 `미리 듣기`는 재생 중 버튼 문구가 모두 `정지`로 표시되는지
- [ ] MIDI 변환 Dialog에서 비트 그룹이 없는 파일의 안내가 `미리 듣기` 버튼 줄 왼쪽에 표시되는지
- [ ] 오른쪽 악기 영역 제목이 `악기 선택`으로 보이고, 일반 악기 목록이 `건반악기/현악기/관악기/타악기/나머지`로 분류되는지
- [ ] 일반 악기 선택에서 `전부 해제` 옆의 `건반악기/현악기/관악기/타악기` 버튼 4개가 현재 채널 선택만 해당 분류로 바꾸는지
- [ ] MIDI 변환 Dialog에서 `파일 불러오기` 버튼이 왼쪽에 있고, 창을 좁혀도 좌우 영역이 겹치지 않는지
- [ ] MIDI 악기가 많아도 오른쪽 악기 목록만 스크롤되고 왼쪽 채널 영역 높이가 불필요하게 늘어나지 않는지
- [ ] MIDI 변환 중 변환 버튼 주변 상태 문구가 보이고 입력이 잠기는지
- [ ] MMI/3MLE 선택 Dialog에서 `선택 듣기`가 체크된 채널만 재생하는지
- [ ] MMI/3MLE 선택 Dialog에서 `전부 듣기`가 체크 여부와 관계없이 읽어온 모든 후보 채널을 재생하는지
- [ ] MMI/3MLE 선택 Dialog에서 `모두 선택해제`와 `파일 불러오기`가 동작하는지
- [ ] 3MLE `.mml`에서 `[Channel1]` 또는 전역 영역의 `T150` 같은 템포가 선택 채널 앞에 반영되는지
- [ ] MMI/3MLE MML 채널 선택 Dialog 하단에서 `파일 불러오기`가 `모두 선택해제`보다 왼쪽에 표시되는지
- [ ] `.mmi`의 비정규 길이 `6/12/24/48`이 정규 길이 조합으로 보정되는지
- [ ] TXT 문법 오류가 있어도 `MML@...;` 형식이면 가능한 경우 원본을 불러오는지
- [ ] Google 로그인 후 Drive 불러오기/저장 버튼이 활성화되는지
- [ ] Google 로그인 후 새로고침했을 때 별도 클릭 없이 Drive 버튼이 바로 활성화되는지
- [ ] Google 로그인 후 새 창/새 탭으로 같은 주소를 열었을 때 Drive 버튼이 바로 활성화되는지
- [ ] 저장된 Google 토큰이 만료되거나 401이 발생했을 때 토큰 캐시가 삭제되고, 자동 팝업 없이 `로그인 필요` 상태로만 바뀌는지
- [ ] 로그아웃 후 새로고침했을 때 자동 재연동이 일어나지 않는지
- [ ] Drive 설정 동기화 실패 시 로컬 설정을 계속 사용하는지
- [ ] Firebase Analytics가 네트워크/차단 문제로 실패해도 앱 기본 기능이 계속 동작하는지
- [ ] Firebase DebugView 또는 Analytics 실시간 보고서에서 `mobibard_app_open`과 주요 커스텀 이벤트가 들어오는지
- [ ] Analytics 이벤트에 파일명, MML 원문, Google access token 같은 민감한 값이 들어가지 않는지

---

## 변경 이력

### v3.4

#### 버전 / 문서 / 코드 정리

- 버전 표기를 `모비바드 v3.4`로 변경했습니다.
- README의 파일 구조, 주요 UI 영역, MIDI 변환 흐름, 악기 분류, Google Drive/Firebase Analytics 설명, 회귀 방지 체크리스트를 현재 코드 기준으로 정리했습니다.
- 더 이상 참조되지 않는 `extractMabiIccoMmlParts()` 헬퍼를 제거했습니다. 현재 MMI 처리는 이름/라벨 정보가 포함된 `extractMabiIccoMmlPartCandidates()`를 사용합니다.
- 제거된 `MML 채널 수`/추천 구성 UI에서 남은 미사용 CSS 선택자(`midi-top-options`, `midi-top-option`, `midi-export-option`, `midi-export-control-row`, `midi-preview-toolbar`, `midi-instrument-action-spacer`)를 정리했습니다.

#### MML 편집기 / 코드 도움말

- `시작 공백 추가` 문구를 `시작 공백 시간`으로 정리했습니다.
- MML 편집기에서 `T120` 같은 템포 명령과 숫자 부분에 배경색을 넣어 전체 MML/개별 파트 탭에서 쉽게 찾을 수 있게 했습니다.
- 템포 강조색은 에러 표시와 헷갈리지 않고 초록 계열 파트 색에 묻히지 않도록 푸른 계열 배경/테두리로 조정했습니다.
- `코드 도움말` Dialog에서 불필요한 숫자 읽는 법/입문자 팁 영역을 제거하고, 표 머리글을 `설명`으로 변경했습니다. 설명 영역은 더 넓게, 예시 영역은 더 좁게 조정했습니다.
- `코드 도움말`의 `O` 범위를 `0~7`, `N` 범위를 `4~88`로 수정하고, `N48`이 4옥타브 도임을 명시했습니다.
- 코드 도움말 표의 모바일 레이아웃을 정비해 좁은 화면에서 3열 표가 깨지지 않고 1열 카드형으로 내려오도록 했습니다.

#### MIDI 변환 Dialog

- MIDI 변환 Dialog 상단 안내를 기본 접힘 상태의 설명 영역으로 변경했습니다. 펼치면 이 화면이 무엇을 정하는지, `MIDI 듣기`, MML 채널 설정, 악기 선택, 역할/겹침 병합의 의미를 확인할 수 있습니다.
- `겹침 병합` 설명을 “MML 6채널 한계 안에 더 많은 소리를 담기 위해 기존 음 일부를 줄이고 겹친 음을 이어 넣는 기능”으로 다시 정리했습니다.
- MIDI 변환 설정의 좁은 화면 레이아웃을 조정했습니다. 모바일 폭에서도 `자동/고음/저음/비트` 역할 선택과 `겹침 병합` 선택이 같은 줄에 들어가도록 정리했습니다.
- MIDI 변환 Dialog의 `추천 구성` 콤보박스를 제거했습니다.
- 기본 상태는 멜로디/화음1/화음2만 일반 악기를 모두 체크하고, 화음3/화음4/화음5는 빈 선택으로 시작합니다.
- `MML 채널 수` 콤보박스를 제거했습니다. 최종 MML 채널 수는 악기가 하나 이상 선택된 MML 채널 개수로 자동 결정됩니다.
- `미리 듣기`는 현재 선택/역할/겹침 병합/악기 체크 상태를 기준으로 실제 MML 변환 결과를 만들고, 편집기에 반영하지 않은 채 재생합니다.
- `MIDI 듣기`와 `미리 듣기`는 재생 중 버튼 문구를 모두 `정지`로 통일했습니다.
- `MIDI 듣기`는 오른쪽 악기 영역의 안내 아래 액션 줄 오른쪽으로 이동했고, 재생 중 상태 안내 문구를 표시합니다.
- 오른쪽 악기 영역의 `전부 선택`/`전부 해제` 버튼은 안내 아래 액션 줄 왼쪽으로 이동했습니다.
- MML 채널 행의 역할 콤보박스 폭을 겹침 병합 콤보박스와 맞추고, 채널별 `듣기` 버튼을 행 맨 오른쪽으로 이동했습니다.
- 각 MML 채널 행에 현재 설정 기준으로 해당 채널만 미리 들어볼 수 있는 `듣기` 버튼을 추가했습니다.
- 비트 그룹이 없는 파일의 안내를 `미리 듣기` 버튼 줄 왼쪽으로 옮겼습니다.
- MIDI 변환 Dialog의 `MML 채널`/`악기 선택` 타이틀 높이를 맞췄습니다.

#### MIDI 악기 선택 / 악기 분류

- 오른쪽 악기 영역 제목을 `악기 선택`으로 변경했습니다.
- 일반 악기 목록을 `건반악기`, `현악기`, `관악기`, `타악기`, `나머지` 5개 섹션으로 분류하고, 각 섹션 제목에 개수를 함께 표시합니다.
- 일반 악기일 때 `전부 선택`/`전부 해제` 옆에 `건반악기`, `현악기`, `관악기`, `타악기` 선택 버튼 4개를 표시합니다. `나머지`는 목록 분류로만 표시합니다.
- 악기 섹션은 기본 펼침 상태의 접기/펼치기 영역으로 바꿨습니다.
- Bassoon처럼 `bass` 문자열이 들어간 관악기가 현악기로 잘못 분류되지 않도록 General MIDI 프로그램 번호 우선 분류와 이름 매칭 순서를 정리했습니다.
- MIDI 악기 섹션의 접기/펼치기 삼각형 인디케이터 크기를 글자 크기에 맞춰 키웠습니다.
- 악기 섹션 사이의 구분선을 제거했습니다.
- 악기 항목 사이 간격을 다시 추가해 목록 가독성을 보강했습니다.
- 악기 섹션 접기/펼치기 삼각형 인디케이터를 조금 더 키우고, 섹션명과의 간격을 줄였습니다.

#### 미리듣기 / 자동 음량 보정

- 모든 미리듣기/재생 스케줄에 자동 음량 보정을 적용했습니다.
- 자동 음량 보정은 동시 발음 4개 이상부터만 적용되도록 조정했습니다.
- 1~3개 동시 발음은 원음에 가깝게 유지하고, 4개 이상부터 점진적으로 볼륨을 낮춥니다.

#### 바로가기 링크

- 바로가기 콤보박스의 `개발자 악보 공유` 표시를 `개발자 MML 공유`로 변경했습니다.
- MIDI 사이트 목록을 BitMidi, Ichigo's, MIDIEX, Midisite, MuseScore, VGMusic 순서로 정렬했습니다.

### v3.3

- 버전 표기를 `모비바드 v3.3`으로 변경했습니다.
- `쉼표 삭제` Dialog에 6채널 체크박스를 추가했습니다. Dialog를 열면 기본으로 6채널이 모두 체크됩니다.
- `쉼표 삭제` Dialog에 `전부 선택` / `선택 해제` 버튼을 추가했습니다. 이제 현재 탭 기준이 아니라 체크한 채널 기준으로 적용합니다.
- `볼륨 조절` 버튼과 Dialog를 추가했습니다.
- 볼륨 조절은 선택한 채널의 모든 음표 볼륨에 입력값을 더하고, 결과를 `V0~V15` 범위로 제한합니다.
- 볼륨 조절 입력값은 `-15~15` 사이 정수로 제한합니다.
- `mml-optimizer.js`에 `adjustVolumesMml()`을 추가하고, `trimShortRestsMml()`이 여러 선택 채널을 받을 수 있게 수정했습니다.

### v3.2

- 버전 표기를 `모비바드 v3.2`로 변경했습니다.
- 누적 수정 사항이 많아져 `README.md`를 개발 작업 기준으로 재정리했습니다.
- 파일별 역할, 주요 흐름, Dialog ID, 상태 저장 위치, 회귀 방지 체크리스트를 추가했습니다.
- Google 로그인 성공 후 새로고침/새 창에서 즉시 연동 상태를 복원할 수 있도록 단기 access token 캐시(`googleTokenCache`)를 추가했습니다.
- access token 캐시는 만료 시각과 함께 저장하고, 만료되었거나 Drive API가 401을 반환하면 자동 삭제하도록 변경했습니다.
- `googleAutoReconnect`와 `googleTokenCache`가 Google Drive 설정 동기화에 섞이지 않도록 저장/파싱 단계에서 제외했습니다.
- 로그아웃하면 자동 재연동 플래그와 토큰 캐시를 함께 삭제해 다음 새로고침에서 다시 로그인되지 않도록 변경했습니다.
- MMI/3MLE MML 채널 선택 Dialog 상단의 기존 `전체 듣기` 버튼을 `선택 듣기`로 이름 변경했습니다. 기능은 현재 체크된 채널만 합쳐 재생하도록 유지했습니다.
- `선택 듣기` 오른쪽에 `전부 듣기` 버튼을 추가해, 체크 여부와 관계없이 읽어온 파일의 모든 감지 채널을 합쳐 재생할 수 있게 했습니다.
- MMI/3MLE MML 채널 선택 Dialog 하단의 `파일 불러오기`와 `모두 선택해제` 버튼 위치를 서로 바꿨습니다.
- Firebase Analytics 연동을 추가했습니다. `js/firebase-config.js`에는 웹 앱 설정을, `js/firebase-analytics.js`에는 SDK 초기화/이벤트 큐 처리를 분리했습니다.
- 앱 열기, 파일 불러오기, MIDI 변환, 미리듣기, 재생, 복사, 저장, Google Drive 동작을 커스텀 이벤트로 기록하도록 했습니다. 파일명과 MML 본문은 Analytics 이벤트에 포함하지 않습니다.
- Google token 만료 처리 방식을 수정했습니다. 유효한 토큰은 새로고침/새 창에서 유지하지만, 만료되거나 401이 발생하면 자동으로 Google 로그인을 다시 요청하지 않고 `로그인 필요` 상태로만 전환합니다.
- 상단 바로가기 영역의 콤보박스 기본 문구를 `MML / MIDI 링크`로 바꾸고 디스코드 버튼 왼쪽에 배치했습니다. 기존 `개발자 MML 공유` 버튼은 제거하고 `개발자 MML 공유` 항목으로 콤보박스 맨 위에 배치했습니다.
- `https://www.vgmusic.com/` 항목은 화면에 `VGMusic`으로 표시합니다. MIDI 사이트는 BitMidi, Ichigo's, MIDIEX, Midisite, MuseScore, VGMusic 순서로 정렬되어 새 창으로 열립니다.
- 바로가기 콤보박스 선택을 `shortcut_link_open` Analytics 이벤트로 기록하고, MIDI 사이트 선택은 기존 `midi_resource_link_open` 이벤트도 함께 기록합니다. 링크 식별자만 보내고 검색어/파일명은 보내지 않습니다.
- v3.1까지의 MIDI/MMI/3MLE/Google Drive/음색/최적화 변경 내용을 현재 구조 기준으로 다시 묶어 정리했습니다.

### v3.1

- 버전 표기를 `모비바드 v3.1`로 변경했습니다.
- MIDI 변환 실행 중에는 변환 버튼 왼쪽에 상태 문구를 표시하고 입력/버튼을 잠가 완료 또는 실패 결과를 기다리도록 했습니다.
- Google 로그인 시 매번 권한 동의 화면을 강제로 띄우지 않도록 변경했습니다.
- `로그아웃`은 현재 브라우저의 연결 상태만 해제하고, Google 계정의 앱 권한 동의는 유지하도록 변경했습니다.
- Google Drive 불러오기에서 MIME 타입이 제각각인 `.mid`/`.midi` 파일도 목록에 보이고, 선택하면 MIDI 변환 Dialog로 이어지도록 개선했습니다.
- `.mmi` 파일은 찾은 MML 채널을 목록으로 보여주고 필요한 채널만 최대 6개까지 선택해 불러옵니다.
- MIDI 변환 Dialog에는 MIDI 트랙 수와 변환 후보 채널 수를 표시하고, MMI/3MLE 채널 선택 Dialog 제목에는 감지된 전체 채널 수를 표시합니다.
- MIDI 변환 Dialog와 MMI/3MLE 채널 선택 Dialog에 `파일 불러오기` 버튼을 추가해, 잘못 고른 파일을 창을 닫지 않고 다시 선택할 수 있습니다.
- MIDI 변환 Dialog의 오른쪽 악기 목록은 악기 수가 많아도 왼쪽 채널 설정 영역을 늘리지 않고 고정 높이 스크롤 영역으로 표시합니다.
- MIDI 변환 Dialog의 `파일 불러오기` 버튼을 하단 왼쪽으로 이동하고, 창 폭이 좁아질 때 좌우 설정 영역이 겹치지 않도록 보정했습니다.
- 오래된 `.mmi` 파일의 비정규 길이 숫자는 `L64` 기준 정규 길이 조합으로 근사 보정합니다.
- 3MLE 레거시 `.mml` 파일에서 `[Channel1]` 등에 있는 전역 템포(`T150` 등)를 읽어 선택한 채널 앞에 적용하도록 수정했습니다.

### v3.0

- 버전 표기를 v3.0으로 변경했습니다.
- 상단 오른쪽에 바로가기 버튼과 `Google` 로그인 영역을 나란히 배치했습니다.
- 기존 지원 명령어 설명을 `코드 도움말` Dialog로 옮겼습니다.
- 재생 조작 박스를 앱 제목 카드와 합쳐 별도 `재생 조작` 제목을 제거했습니다.
- MML 보기 · 편집 제목 줄 오른쪽에 `불러오기`/`저장하기` 그룹과 붙여넣기, 전부복사, 나눠복사 버튼을 순서대로 배치했습니다.
- 편집 편의 기능 줄 오른쪽을 전체/채널 음소거, 폰트 선택, 자동 음색, 음색 버튼 순서로 정리했습니다.

### v2.4

- 버전 표기를 v2.4로 변경했습니다.
- MIDI 변환 설정에서 멜로디와 화음2의 겹침 병합 기본값을 `절반`으로 변경했습니다.
- 채널 음색 설정 Dialog에 `음색 프리셋` 콤보박스를 추가했습니다.
- MIDI 변환 완료 시 선택 악기 구성을 자동 음색 정보로 갱신합니다. 현재 `자동 음색`을 사용 중일 때만 재생 음색에도 바로 적용합니다.
- 저장/삭제 가능한 사용자 음색 프리셋을 추가했습니다.
- 전체 MML 탭에서는 모든 채널을 한 번에 음소거/해제하도록 수정했습니다.
- `전체복사` 버튼 이름을 `전부복사`로 변경했습니다.
- `전부복사`와 `파일저장`은 현재 선택 채널과 관계없이 항상 전체 MML을 대상으로 합니다.
- 일반 MML 텍스트 불러오기에서 `.md` 유형을 제거하고 `.txt`만 지원하도록 변경했습니다.
- 3MLE 레거시 `.mml` 프로젝트 파일은 별도 import 흐름으로 지원합니다.
- Google 로그인, Google Drive에서 MIDI/MMI/3MLE MML/TXT 불러오기, Google Drive에 TXT 저장 기능을 추가했습니다.
- 아무 Dialog도 열려 있지 않을 때 지원 파일을 화면에 드래그 앤 드롭하면 기존 로컬 불러오기와 같은 흐름으로 불러옵니다.
- MMI 불러오기에서 추출된 채널을 목록화하고, 필요한 채널만 최대 6개까지 선택할 수 있게 했습니다.
- MIDI/MMI/3MLE MML/TXT 불러오기와 전체 MML 붙여넣기 시 T120 기준 R1, 약 2초 시작 공백을 자동 적용합니다.
- 브라우저 설정 캐시를 Google Drive 앱 데이터 폴더에 동기화하는 기능을 추가했습니다.

### v2.3

- MIDI 변환 Dialog의 `MIDI 듣기` 버튼은 원본 MIDI 파일을 최대 45초까지 미리듣습니다.
- MIDI 변환 Dialog의 악기별 `듣기` 버튼은 해당 악기의 첫 소리 지점부터 짧게 미리듣습니다.
- 악기 목록의 선택 채널 표시는 채널 색상의 라운드 배지로 표시합니다.
- MIDI 변환 Dialog의 악기 목록 레이아웃을 조정했습니다.
- MIDI 변환 Dialog에서 악기 목록에 현재 선택된 MML 채널을 표시합니다.
- MIDI 변환 Dialog의 MML 채널 요약은 악기 이름 대신 선택된 악기 개수로 표시합니다.
- MIDI 변환 Dialog에서 표시 가능한 악기는 기본적으로 모두 선택됩니다.
- `시작 공백 시간` Dialog 설명을 단순화했습니다.
- 나눠복사 Dialog에서 악보별 듣기 버튼을 추가했습니다.
- 악보 나눠복사 설명과 요약 박스를 단순화했습니다.
- 버전 표기를 v2.3으로 변경했습니다.
