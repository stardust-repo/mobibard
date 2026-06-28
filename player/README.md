# 마비노기 MML 재생기 샘플 - 모비바드 v3.2

공개용 정적 웹앱입니다. 기본 MML 재생, MIDI/MMI/3MLE MML/TXT 불러오기, MML 최적화, 나눠복사, Google Drive 연동, 채널별 음색 프리셋을 한 페이지에서 처리합니다.

기본 재생은 로컬 파일만으로 동작합니다. Google Drive 연동을 사용하려면 Google Identity Services와 Google Picker 스크립트를 온라인으로 불러오며, `js/google-config.js` 설정이 필요합니다.

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
   ├─ mml-optimizer.js         # 자동 최적화, 쉼표 삭제, 시작 공백, 나눠복사
   ├─ sf2-sampler.js           # SF2 파싱, 노트 준비, look-ahead 오디오 스케줄링
   ├─ google-config.js         # Google OAuth/Picker/API Key 설정
   └─ app.js                   # 앱 상태, UI 이벤트, 파일/Drive 입출력, Dialog 제어, 재생 제어
```

### 전역 모듈 연결

빌드 도구 없이 브라우저 전역 객체로 모듈을 연결합니다.

| 파일 | export 전역 | 주요 함수 |
|---|---|---|
| `js/utils.js` | `window.MabiUtils` | `clamp`, `clampInt`, `unique`, `formatTime`, `shortError`, `base64ToUint8Array` |
| `js/midi-to-mml.js` | `window.MabiMidi` | `analyzeMidi`, `midiToMml`, `buildMidiInstrumentPreview`, `buildMidiFilePreview` |
| `js/mml-parser.js` | `window.MabiMml` | `parseMabinogiMml`, `splitMmlParts`, `parseMmlPart`, `buildSchedule`, `beatToSeconds`, `composeMml` |
| `js/mml-optimizer.js` | `window.MabiOptimizer` | `optimizeMml`, `optimizePart`, `trimShortRestsMml`, `addLeadingSilenceMml`, `splitMmlPages` |
| `js/sf2-sampler.js` | `window.MabiSf2` | `parseSoundFont`, `prepareNotes`, `schedulePreparedNotes`, `scheduleNotes` |

`app.js`는 위 전역 객체를 가져와 UI와 파일 흐름을 연결합니다. 새 기능을 넣을 때는 계산/변환 로직은 가능한 전용 JS에 두고, `app.js`에는 UI 상태와 호출 흐름만 남기는 편이 유지보수하기 쉽습니다.

---

## 현재 앱 기준값

| 항목 | 값 / 위치 |
|---|---|
| 앱 버전 표시 | `index.html`의 `<title>`과 `.app-version`: `모비바드 v3.2` |
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

---

## 주요 UI 영역

### 1. 상단 앱 카드

- 앱 제목과 버전 표시
- 악보 공유 / 디스코드 바로가기
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
- `쉼표 삭제`, `시작 공백 추가` 편집 기능을 제공합니다.
- 사운드 폰트 선택, 자동/사용자 음색 프리셋, 채널별 음색 설정, 전체/채널 음소거를 제공합니다.

### 3. Dialog 목록

| ID | 용도 |
|---|---|
| `googleDriveSaveDialog` | Google Drive 저장 파일명/폴더 선택 |
| `mmiImportDialog` | MMI/3MLE MML 채널 선택, 모두 선택해제, 파일 다시 불러오기, 채널 미리듣기 |
| `partSoundDialog` | 멜로디/화음1~5 채널별 SF2 프리셋 설정 및 사용자 프리셋 저장/삭제 |
| `codeHelpDialog` | 지원 MML 코드 도움말 |
| `restTrimDialog` | 짧은 쉼표 삭제 옵션 선택 |
| `leadingSilenceDialog` | 시작 공백 초 단위 입력 |
| `splitCopyDialog` | 나눠복사 결과, 악보별 듣기/복사 |
| `midiConvertDialog` | MIDI 변환 설정: 채널 역할, 겹침 병합, 악기 선택, MIDI 듣기, 악기별 듣기, 파일 다시 불러오기 |

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
- 오래된 MMI의 `6`, `12`, `24`, `48` 같은 비정규 길이는 64분음표 기준의 정규 길이 조합으로 근사 보정합니다.
  - 예: `c6` → `c8&c32&c64`
  - 예: `r12` → `r16r64`

### 3MLE 레거시 `.mml`

- `[ChannelN]` 섹션을 찾아 채널 후보로 표시합니다.
- `// 채널명` 주석을 채널 이름으로 표시합니다.
- `/*M */` 마디 주석과 3MLE 전용 명령은 불러오기 전에 정리합니다.
- `[Channel1]` 또는 파일 전체에서 전역 템포 `T150` 같은 값을 찾으면, 템포가 없는 각 선택 채널 앞에 적용합니다.
- 이미 채널 자체가 `T숫자`로 시작하면 전역 템포를 중복 삽입하지 않습니다.

---

## MIDI 변환 흐름

MIDI 변환은 `js/midi-to-mml.js`가 담당하고, `app.js`는 설정 Dialog와 결과 적용만 담당합니다.

1. MIDI 전체를 파싱합니다.
2. 트랙 수, PPQ, 템포 수, 후보 채널 수, 악기 그룹을 분석합니다.
3. MIDI 변환 Dialog에서 Export 채널 수를 1~6개로 고릅니다.
4. 각 MML 채널마다 역할, 겹침 병합 방식, 사용할 악기를 고릅니다.
5. 변환 버튼을 누르면 입력/버튼을 잠그고 상태 문구를 표시합니다.
6. 변환 결과를 전체 MML에 반영하고, MIDI 악기 선택 정보를 `최근 MIDI 음색` 자동 프리셋으로 갱신합니다.

### MIDI 악기 선택

- 화면에는 악기명 단위로 선택지를 표시합니다.
- 같은 악기명이 여러 MIDI 채널에 있어도 하나의 선택지로 묶습니다.
- 내부적으로는 원본 MIDI 채널/프로그램 정보를 유지합니다.
- 한 MML 채널에는 여러 악기를 선택할 수 있습니다.
- 여러 MML 채널이 같은 악기를 선택할 수 있습니다.
- 원본 MIDI 노트 하나는 전체 MML 채널 중 한 곳에만 배치됩니다. 같은 노트를 여러 MML 채널에 복제하지 않습니다.
- 악기 목록에는 전부 선택 / 전부 해제 / 악기별 듣기 버튼이 있습니다.
- 악기 목록에는 해당 악기가 선택된 MML 채널을 배지로 표시합니다.
- MML 채널 목록에는 악기 이름 대신 선택된 악기 개수를 표시합니다.

### 비트 악기 분류

- MIDI 10번 채널의 타악 노트는 킥/스네어/심벌즈처럼 노트 번호별 비트 악기로 묶습니다.
- 드럼, 스네어, 북, 공, 심벌즈, 킥, 하이햇, 탐 등 비트 힌트가 있는 악기는 비트 그룹으로 분류합니다.
- 비트 그룹이 없는 MIDI에서는 역할 선택에서 `비트` 항목을 숨기고 안내 문구를 표시합니다.
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
| `모두` | 기존 음이 울리는 중이어도 구제책으로 잘라서 새 음을 배치합니다. |
| `절반` | 앞 노트가 50% 이상 지난 뒤 새 노트가 겹칠 때만 병합합니다. |
| `안함` | 겹침 병합을 사용하지 않습니다. |

기본값은 멜로디와 화음2가 `절반`, 나머지 채널이 `모두`입니다.

정상 배치 가능한 채널이 있으면 겹침 병합은 사용하지 않습니다. 모든 적합 채널이 이미 울리는 중일 때만 구제책으로 사용합니다.

---

## MML 파싱과 최적화 규칙

### 파싱 / 재생

- `MML@melody,chord1,...;` 형식을 파트 배열로 나눕니다.
- 템포 `T`는 파트별 템포가 아니라 전체 성부에 공유되는 글로벌 템포로 취급합니다.
- 모든 파트에서 발견한 템포 이벤트를 하나의 템포맵으로 합칩니다.
- 같은 박자 위치에 여러 `T`가 있으면 나중 순서의 값을 최종값으로 사용합니다.
- 재생 스케줄은 `buildSchedule()`에서 초 단위 노트 목록과 템포 마커를 만듭니다.

### 자동 최적화

MIDI/MMI/3MLE/TXT 불러오기, 붙여넣기, 전부복사, 파일저장, 쉼표 삭제, 시작 공백 추가, 나눠복사 결과에는 공통 최적화 단계를 적용합니다.

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
- 전체 MML 탭에서는 전체 채널에, 개별 파트 탭에서는 해당 파트에만 적용합니다.

### 시작 공백 추가

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
- 저장된 토큰이 만료되었거나 Drive API가 401을 반환하면 토큰 캐시를 지우고 Google Identity Services로 재발급을 시도합니다. 브라우저/Google 정책상 자동 재발급이 막히면 `로그인 필요` 상태로 남습니다.
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

## 수정할 때 자주 봐야 하는 위치

| 작업 | 먼저 볼 파일 / 함수 |
|---|---|
| 앱 버전 변경 | `index.html`의 `<title>`, `.app-version`, `README.md` |
| 버튼/레이아웃 변경 | `index.html`, `styles.css`, `app.js:init()` 이벤트 연결 |
| MIDI 변환 규칙 변경 | `js/midi-to-mml.js`의 `midiToMml()`, `assignNotesToVoices()`, `normalizeExportChannels()` |
| MIDI 변환 Dialog 변경 | `index.html#midiConvertDialog`, `app.js`의 `openMidiConvertDialog()`, `renderMidiRoleList()`, `renderMidiInstrumentList()`, `syncMidiInstrumentListHeight()` |
| MMI/3MLE import 변경 | `app.js`의 `readMabiIccoMmiFile()`, `readThreeMleMmlFile()`, `openMmiImportDialog()` |
| 3MLE 템포 처리 변경 | `app.js`의 `extractThreeMleGlobalTempo()`, `applyThreeMleGlobalTempoToCandidates()` |
| MML 파싱/시간 계산 변경 | `js/mml-parser.js` |
| 최적화/쉼표/공백/나눠복사 변경 | `js/mml-optimizer.js` |
| 재생/스케줄링/SF2 변경 | `js/sf2-sampler.js`, `app.js`의 재생 제어 함수 |
| Google Drive 변경 | `app.js`의 Google 관련 함수, `js/google-config.js` |
| 저장 설정 변경 | `PREF_PREFIX`, `readPref()`, `writePref()`, Google settings snapshot 관련 함수 |

---

## 회귀 방지 체크리스트

수정 후 아래 항목은 한 번씩 확인하는 것을 권장합니다.

- [ ] 제목에 `모비바드 v3.2`가 보이는지
- [ ] 기본 샘플 MML 재생/정지/처음/반복이 동작하는지
- [ ] 배속/볼륨/테마가 새로고침 후 복원되는지
- [ ] 전체 MML 편집과 개별 파트 탭 편집이 서로 동기화되는지
- [ ] 전부복사/파일저장 전에 자동 최적화가 적용되는지
- [ ] 나눠복사 Dialog에서 각 악보 듣기/복사가 동작하는지
- [ ] MIDI 변환 Dialog에서 `파일 불러오기` 버튼이 왼쪽에 있고, 창을 좁혀도 좌우 영역이 겹치지 않는지
- [ ] MIDI 악기가 많아도 오른쪽 악기 목록만 스크롤되고 왼쪽 채널 영역 높이가 불필요하게 늘어나지 않는지
- [ ] MIDI 변환 중 변환 버튼 주변 상태 문구가 보이고 입력이 잠기는지
- [ ] MMI/3MLE 선택 Dialog에서 `모두 선택해제`와 `파일 불러오기`가 동작하는지
- [ ] 3MLE `.mml`에서 `[Channel1]` 또는 전역 영역의 `T150` 같은 템포가 선택 채널 앞에 반영되는지
- [ ] `.mmi`의 비정규 길이 `6/12/24/48`이 정규 길이 조합으로 보정되는지
- [ ] TXT 문법 오류가 있어도 `MML@...;` 형식이면 가능한 경우 원본을 불러오는지
- [ ] Google 로그인 후 Drive 불러오기/저장 버튼이 활성화되는지
- [ ] Google 로그인 후 새로고침했을 때 별도 클릭 없이 Drive 버튼이 바로 활성화되는지
- [ ] Google 로그인 후 새 창/새 탭으로 같은 주소를 열었을 때 Drive 버튼이 바로 활성화되는지
- [ ] 저장된 Google 토큰이 만료되거나 401이 발생했을 때 토큰 캐시가 삭제되고 재로그인 흐름으로 넘어가는지
- [ ] 로그아웃 후 새로고침했을 때 자동 재연동이 일어나지 않는지
- [ ] Drive 설정 동기화 실패 시 로컬 설정을 계속 사용하는지

---

## 변경 이력

### v3.2

- 버전 표기를 `모비바드 v3.2`로 변경했습니다.
- 누적 수정 사항이 많아져 `README.md`를 개발 작업 기준으로 재정리했습니다.
- 파일별 역할, 주요 흐름, Dialog ID, 상태 저장 위치, 회귀 방지 체크리스트를 추가했습니다.
- Google 로그인 성공 후 새로고침/새 창에서 즉시 연동 상태를 복원할 수 있도록 단기 access token 캐시(`googleTokenCache`)를 추가했습니다.
- access token 캐시는 만료 시각과 함께 저장하고, 만료되었거나 Drive API가 401을 반환하면 자동 삭제하도록 변경했습니다.
- `googleAutoReconnect`와 `googleTokenCache`가 Google Drive 설정 동기화에 섞이지 않도록 저장/파싱 단계에서 제외했습니다.
- 로그아웃하면 자동 재연동 플래그와 토큰 캐시를 함께 삭제해 다음 새로고침에서 다시 로그인되지 않도록 변경했습니다.
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

- MIDI 변환 Dialog의 `MIDI 듣기` 버튼을 하나로 정리했습니다. MIDI 파일의 첫 소리 지점부터 최대 45초까지 미리듣습니다.
- MIDI 변환 Dialog의 악기별 `듣기` 버튼은 해당 악기의 첫 소리 지점부터 짧게 미리듣습니다.
- 악기 목록의 선택 채널 표시는 채널 색상의 라운드 배지로 표시합니다.
- MIDI 변환 Dialog의 악기 목록 레이아웃을 조정했습니다.
- MIDI 변환 Dialog에서 악기 목록에 현재 선택된 MML 채널을 표시합니다.
- MIDI 변환 Dialog의 MML 채널 요약은 악기 이름 대신 선택된 악기 개수로 표시합니다.
- MIDI 변환 Dialog에서 표시 가능한 악기는 기본적으로 모두 선택됩니다.
- `시작 공백 추가` Dialog 설명을 단순화했습니다.
- 나눠복사 Dialog에서 악보별 듣기 버튼을 추가했습니다.
- 악보 나눠복사 설명과 요약 박스를 단순화했습니다.
- 버전 표기를 v2.3으로 변경했습니다.
