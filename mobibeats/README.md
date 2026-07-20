# 모비비트 · MobiBeats v1.0

MML과 채널별 악기 정보만 전달하면 바로 플레이할 수 있는 독립형 웹 리듬게임 **모비비트(MobiBeats)**입니다. 기존 MML 생성기 하위 폴더에 종속되지 않으며, 같은 도메인의 별도 경로에 배포한 뒤 전체화면 iframe으로 열 수 있습니다.

## 게임 규칙

- 키 구성은 시작 화면에서 4키·5키·6키 중 선택
  - 4키: `D F J K`
  - 5키: `D F SPACE J K`
  - 6키: `S D F J K L`
- 타이로 이어진 전체 길이가 `L2` 미만이면 단노트
- 타이로 이어진 전체 길이가 `L2` 이상이면 장노트
- 판정: Perfect / Great / Good / Miss
- 판정 범위:
  - Perfect: ±55ms
  - Great: ±90ms
  - Good: 빠른 입력 -180ms, 늦은 입력 +260ms
- 콤보는 Perfect와 Great에서만 증가하며 Good과 Miss에서 끊김
- 모든 노트를 Perfect로 처리하면 정확히 100,000점
- 단노트 가중치: Perfect 2 / Great 1 / Good 0.5 / Miss 0
- 장노트 가중치: 단노트 가중치의 3배

## 난이도

- **HARD**: 선택한 키 수에서 연주할 수 있는 노트를 최대한 사용
- **NORMAL**: 빠른 연속 구간의 간격을 더 넓히고 동시 입력을 최대 2개로 단순화
- **EASY**: 과밀 구간의 중간 노트를 적극적으로 덜어내고 한 번에 한 노트 중심으로 단순화

NORMAL과 EASY는 HARD 차트에서 노트를 줄이는 방식이므로 같은 키 구성에서는 `HARD ≥ NORMAL ≥ EASY` 순서로 노트 수가 유지됩니다.

## v1.0 개발 변경

- 노트 오프셋 -300~+300ms 설정 추가
- 양수 오프셋은 노트와 판정 시점을 늦추고, 음원 재생 시점은 유지
- 오프셋은 기기 환경 설정으로 저장되며 새 MML을 불러와도 유지
- 외부 전달 데이터와 직접 호출 API에서 `noteOffsetMs` 지원
- NORMAL의 빠른 연속 구간과 동시 입력을 한 단계 더 단순화
- EASY의 과밀 구간 중간 노트를 더 적극적으로 제거
- 난이도 버튼을 EASY 초록색, NORMAL 노란색, HARD 빨간색으로 구분
- 4키 / 5키 / 6키 수동 선택
- 음정 흐름과 여러 채널을 반영하는 자동 레인 배정
- MML 채널 수 표시와 6개 채널 악기 선택
- 기본 음량 100%, 최대 150%
- 굵은 단노트와 판정 밴드, 판정선 아래로 내려가는 Miss 노트
- Good 이상 판정 시 판정선에서 색상별 섬광·확산 링·파티클과 키 패널 피드백 표시
- 단노트는 성공 판정 즉시 사라지고, 장노트는 끝까지 유지한 뒤 성공 판정 시 사라짐
- 늦은 Good 판정 +260ms
- Perfect 판정 범위를 ±55ms로 완화
- 카운트다운 종료 직전의 유효 입력도 판정하도록 수정해 첫 노트, 특히 첫 장노트가 무시되던 문제 해결

## 포함 기능

- 먼 곳에서 판정선으로 다가오는 원근형 트랙
- 음정 흐름, 동시 입력, 장노트 점유를 고려한 자동 레인 배정
- MML과 6개 채널 악기를 확인·수정하는 연주 정보 Dialog
- 노트 접근 배속 0.75× / 1.00× / 1.25× / 1.50× / 2.00×
- 노트 오프셋 -300~+300ms
- 마스터 음량 0~150%
- 키보드와 터치 입력
- 시작 카운트다운, 일시정지, 다시 시작, 전체화면
- 점수·콤보·진행률 HUD
- 결과 등급, 판정별 개수, 최대 콤보와 정확도 표시
- Roland SC-55 SF2 재생 및 로딩 실패 시 Web Audio 간이 음원 전환
- 같은 도메인의 부모 페이지와 `postMessage` 연동

## 배포

폴더의 내용을 원하는 독립 경로에 그대로 배포합니다.

```text
/mobibeats/
  index.html
  styles.css
  README.md
  js/
    utils.js
    mml-parser.js
    sf2-sampler.js
    game.js
  assets/
    Roland_SC-55.sf2
    favicon.ico
```

SF2 파일을 `fetch()`로 불러오므로 실제 배포와 테스트는 `file://`보다 HTTP/HTTPS 정적 서버를 권장합니다.

```bash
python3 -m http.server 8000
```

## 부모 페이지에서 전체화면으로 열기

```html
<div id="rhythmOverlay" hidden>
  <iframe id="rhythmFrame" src="/mobibeats/" title="모비비트 리듬게임"></iframe>
</div>
```

```css
#rhythmOverlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: #050611;
}

#rhythmFrame {
  width: 100%;
  height: 100%;
  border: 0;
}
```

```javascript
const overlay = document.getElementById("rhythmOverlay");
const frame = document.getElementById("rhythmFrame");
let rhythmReady = false;
let pendingPayload = null;

function sendRhythmScore(payload) {
  frame.contentWindow.postMessage({
    type: "MML_RHYTHM_LOAD",
    payload
  }, location.origin);
}

function openRhythmGame(payload) {
  overlay.hidden = false;
  if (rhythmReady) sendRhythmScore(payload);
  else pendingPayload = payload;
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;

  if (event.data?.type === "MML_RHYTHM_READY") {
    rhythmReady = true;
    if (pendingPayload) {
      sendRhythmScore(pendingPayload);
      pendingPayload = null;
    }
  }

  if (event.data?.type === "MML_RHYTHM_CLOSE") {
    overlay.hidden = true;
  }

  if (event.data?.type === "MML_RHYTHM_RESULT") {
    const result = event.data.payload || event.data;
    console.log("리듬게임 결과", result);
  }
});
```

## 전달 데이터

악기는 SF2의 `bank:preset` 문자열, GM 프로그램 번호, 또는 객체로 전달할 수 있습니다. `keyCount`, `difficulty`, `noteOffsetMs`는 선택 사항이며 생략하면 채널 수에 따른 기본 키 구성, NORMAL, 저장된 노트 오프셋을 사용합니다.

```javascript
openRhythmGame({
  title: "곡 제목",
  mml: "MML@t120o5cdef,o4ceg;",
  instruments: [
    "0:0",
    48,
    { bank: 0, preset: 32 }
  ],
  keyCount: 5,
  difficulty: "normal",
  noteOffsetMs: 40
});
```

파트 배열도 지원합니다.

```javascript
openRhythmGame({
  title: "곡 제목",
  parts: [
    { mml: "t120o5cdef", instrument: 0 },
    { mml: "o4ceg", instrument: "0:48" }
  ]
});
```

수신 메시지 타입:

- `MML_RHYTHM_LOAD`
- `LOAD_RHYTHM_SCORE`
- `MML_RHYTHM_SCORE`
- `MML_RHYTHM_OPEN`

송신 메시지 타입:

- `MML_RHYTHM_READY`
- `MML_RHYTHM_LOADED`
- `MML_RHYTHM_ERROR`
- `MML_RHYTHM_RESULT`
- `MML_RHYTHM_CLOSE`

송신 메시지는 주요 값을 최상위 필드와 `payload` 양쪽에 포함합니다.

## 직접 호출 API

새 브랜드 API인 `window.MobiBeats`를 사용합니다. 기존 `window.MmlRhythmGame`도 호환을 위해 유지됩니다.

```javascript
window.MobiBeats.loadScore(payload);
window.MobiBeats.setDifficulty("easy");
window.MobiBeats.setKeyCount(5);
window.MobiBeats.setNoteOffset(40);
window.MobiBeats.start();
window.MobiBeats.pause();
window.MobiBeats.resume();
window.MobiBeats.openScoreDialog();
window.MobiBeats.getChartInfo();
window.MobiBeats.getScoreData();
```

## 판정 효과 성능 최적화

- 판정 광원은 매 프레임 새로 만들지 않고 캐시한 스프라이트를 재사용합니다.
- 같은 레인의 빠른 연타 효과는 이전 효과를 교체하며, 동시에 유지하는 효과 수를 제한합니다.
- 파티클·광선·확산 링을 가볍게 단순화하고 큰 실시간 그림자 연산을 제거했습니다.
- 프레임이 느려지는 환경에서는 효과 세부 수가 자동으로 감소합니다.
- Perfect·Great·Good의 판정 인지, 단노트 즉시 제거, 롱노트 완료 후 제거 동작은 그대로 유지됩니다.

