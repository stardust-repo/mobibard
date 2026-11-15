# Wave2MIDI 공용 모듈

음원(오디오 파일)을 브라우저 안에서 악기별 MIDI로 변환하는 공용 모듈입니다. 파일은 서버로 업로드되지 않습니다.
Editor `파일 > 불러오기`에서 오디오 파일을 고르면 사용되며(오디오 · AI 변환), 다른 제품도 같은 API로 불러 쓸 수 있습니다.

## 구성

```text
plugins/ai/wave2midi/
  wave2midi.js            메인 스레드 API (classic script, window.MobibardWave2Midi)
  worker.js               추론 Worker: ONNX Runtime 로드, 창 분할 추론, 디코딩(state 고정), velocity, MIDI 생성
  infer-worker.js         CPU 보조 추론 Worker (같은 w16 모델, 여러 세션으로 창을 나눠 실행)
  lib/dsp.mjs             frontend 특징 추출 (w2m/dsp.py 1:1 포팅)
  lib/w2m_web.mjs         v2 web export: 확률 맵 -> 노트(state Viterbi 디코더, 드럼 피크, 악기), 6초 창 / 1초 겹침,
                          창 파이프라이닝(predictSong). MobiBard 변경: 동시 실행(concurrency), 필요한 출력만 받기(keys), 진행 콜백
  lib/feature_worker.mjs  창별 frontend 특징 계산 (중첩 Web Worker, worker.js가 여러 개 띄움)
  lib/velocity.mjs        onset spectral flux 기반 velocity (w2m/velocity.py)
  lib/midi.mjs            표준 MIDI 작성기 (w2m/midi.py)
  lib/tempo.mjs           노트로부터 템포 맵 추정 (w2m/tempo.py, 기본 사용)
  lib/model-cache.mjs     모델 영구 저장(IndexedDB) + SHA-256 무결성 검사
  model/wave2mid_v2_w16.onnx  모델 v2.0 (38 MB): 가중치 16비트 저장 / 32비트 연산. GPU(WebGPU)와 CPU(WebAssembly) 모두 이 파일 하나로 실행
  model/meta.json         학습 export 메타데이터 (모델 v2.0, 전처리, 임계값, decode, 16개 GM 클래스, velocity 설정)
  model/manifest.json     모델 이름·버전·제작자·라이선스, 파일명·크기·sha256(models.w16), fallback
  model/LICENSE           모델 라이선스 (CC BY-NC 4.0, startdust-io)
  (ONNX Runtime 사본은 공용 모듈 `plugins/vendor/onnxruntime-web/`에 있습니다. 모든 환경이 `1.31.1`을 씁니다. 폰(CPU 전용)은 1.31.1의 CPU 전용 빌드입니다. 없으면 jsDelivr의 같은 버전을 사용합니다)
```

`lib/*.mjs` 중 dsp·velocity·midi·tempo는 학습 저장소의 web export와 동일한 파일입니다. `w2m_web.mjs`는 export에 MobiBard 변경(창 동시 실행, 출력 선택, 진행 콜백)을 얹은 것이라 학습 쪽에서 갱신되면 그 변경을 다시 적용하세요. 노트당 악기 1개 정책은 `meta.json`의 `thresholds.multi = 1.01`로 유지합니다.

## 라이선스

Wave2MIDI 모델(`model/wave2mid_v2_w16.onnx`, `model/meta.json`)은 **startdust-io**가 제작했으며 **CC BY-NC 4.0 (CC-BY-NC-4.0)**으로 배포합니다. 학습 데이터에 비상업 라이선스(CC-BY-NC-4.0) 자료가 포함되어 있어 **비상업적 이용만** 허용되며, 안내문은 `model/LICENSE`에 있습니다.
모델을 다른 곳에 복사하거나 재배포할 때는 `model/LICENSE`를 함께 포함하고, 저작자 표시와 비상업 조건을 지켜야 합니다.

- `meta.json`: `author`, `license.spdx`, `license.copyright`, `license.file`
- `manifest.json`: `name`, `version`, `author`, `license`, `licenseFile`
- API: `MobibardWave2Midi.getModelInfo()`는 `{ name, version, author, license, licenseUrl }`를 돌려줍니다(모델은 내려받지 않음). `transcribe()` 결과의 `result.model`에도 `author`, `license`가 들어 있습니다.
- Editor는 오디오 AI 변환 중 진행 패널에 `Wave2MIDI v2.0 · startdust-io · CC BY-NC 4.0`를 표시하고 `model/LICENSE`로 연결합니다.

## 사용법

```html
<script src="../plugins/ai/wave2midi/wave2midi.js"></script>
```

```js
const result = await MobibardWave2Midi.transcribe(file, {
  velocity: true,              // true: 자동 추정, false: 100 고정, 숫자(1~127): 그 값으로 고정
  velocityRange: [35, 120],    // 자동 추정 때 세기 범위(기본값은 meta.velocity.min/max, 에디터는 V3~V15에 해당하는 [11, 127] 사용)
  tempo: true,                 // 기본: 노트로 템포 맵 추정. false면 120 BPM 고정, 숫자면 그 BPM으로 고정
  tempoChanges: true,          // 자동 추정 때 곡 중간 템포 변화 반영 여부
  stateBias: 0,                // 노트 시작 편향 -1~1 (기본 0). 클수록 작은 노트까지, 작을수록 확실한 노트만
  drumThreshold: 0.13,         // 드럼 검출 기준 0.05~0.4 (기본 0.13). 낮을수록 약한 타격까지
  collectFingerprint: false,   // true: 변환 중 모델의 128차원 노트 특징(출력 feat)을 모아 둠 → 나중에 postprocess로 fingerprint를 켤 수 있음
  fingerprint: false,          // true: 악기가 애매한 음(후보 2개 이상)을 근처(±3초, ±7반음) 확정 음과의 유사도로 보정 (기본 false, 에디터는 켬)
  onProgress: ({ stage, done, total }) => {},
  signal: abortController.signal,
});
const midiFile = MobibardWave2Midi.toMidiFile(result, file.name); // File("곡.mid")
```

- `result.notes`: `[pitch, program, onset초, offset초, confidence]` 배열. program 128은 드럼(MIDI 채널 10)입니다.
- `result.midi`: 480 PPQ 표준 MIDI(Uint8Array). 추정한 템포 변화와 박자표가 들어가며(`result.tempo`), program별 트랙, 드럼은 채널 10입니다.
- 진행 단계 `stage`: `decode` → `runtime` → `model-check` → (`model-download` → `model-store`) → `model-init` → `analyze`(done/total 창) → `velocity` → `midi`
- 오류 `error.code`: `unsupported`, `decode-failed`, `too-long`, `runtime-unavailable`, `model-unavailable`, `model-corrupt`, `model-init-failed`, `out-of-memory`, `aborted`
- 기본 최대 길이는 10분입니다(`maxSeconds`). 악기 확률 맵이 오디오 1분당 약 34 MB를 쓰기 때문입니다.
- 실행 환경 판별(모든 제품 공통, Worker 안에서 자동):
  1. 휴대폰(iPhone, Android 폰)은 WebGPU가 있어도 항상 CPU로 실행합니다. 아이패드·안드로이드 태블릿·데스크톱은 WebGPU 어댑터가 있으면 GPU로 먼저 실행합니다. GPU 세션을 만들지 못하면 같은 모델을 CPU(WebAssembly)로 실행합니다.
  2. GPU 세션은 만들어졌지만 변환 도중 실패(장치 유실 등)하면 처음부터 CPU로 다시 실행합니다.
  - 강제로 CPU를 쓰려면 `executionProvider: "wasm"`을 넘기세요.
  - 주파수 특징(frontend) 계산은 중첩 Web Worker(`lib/feature_worker.mjs`) 여러 개(최대 `코어 수 - 2`, 8개 이하)가 앞선 창들을 미리 병렬로 계산합니다. 중첩 Worker를 쓸 수 없으면 Worker 안에서 직접 계산합니다.
  - 다음 창의 신경망 실행을 이전 창의 결과 합산 전에 먼저 시작해 GPU/CPU가 쉬지 않게 합니다(`lib/w2m_web.mjs`).
  - 교차 출처 격리 페이지의 WebAssembly 스레드 수는 `min(8, 코어 수 - 2)`입니다.
  - `MobibardWave2Midi.getCapabilities()`는 모델을 받지 않고 `{ webgpu, adapter, f16, variant }`를 돌려줍니다. `transcribe()` 결과의 `result.provider`("webgpu" 또는 "wasm")와 `result.variant`("w16")에 실제 실행 위치·모델이 들어 있습니다. `result.decoder`는 `{ mode: "state", bias }`입니다.
- Worker는 마지막 사용 뒤 3분이 지나면 종료되어 메모리를 돌려줍니다. 다음 호출 때 모델은 IndexedDB에서 다시 불러옵니다.

### 후처리 다시 적용

- `postprocess({ stateBias, drumThreshold, fingerprint, velocity, velocityRange, tempo, tempoChanges })`: 마지막 변환의 모델 출력으로 노트·세기·템포·MIDI만 다시 계산합니다(모델을 다시 돌리지 않음). Worker가 해제된 뒤에는 `error.code === "no-job"`으로 실패하므로 `transcribe()`를 다시 호출하세요.
- `getPostprocessDefaults()`: `model/meta.json`의 기본값 `{ stateBias, stateBiasMin, stateBiasMax, drumThreshold, drumMin, drumMax, velocity, velocityMin, velocityMax, tempoChanges, tempoMin, tempoMax }` (모델은 내려받지 않음).

### UI 보조 함수 (1.0.4)

- `isAudioFile(fileOrName, mimeType)`: AI 변환 대상 오디오인지 판별(MIDI/KAR 제외).
- `progressText(event, tr)` / `progressFraction(event)`: 진행 이벤트를 문구·비율로 변환. `tr`은 `preparing`, `downloading`, `analyzing` 이름을 받는 번역 함수입니다.
- `errorText(error, tr, { maxMinutes })`: 오류 코드를 `err_*`/`no_notes`/`failed` 문구로 변환.
- `showProgressNotice(text, fraction)` / `hideProgressNotice()`: 화면 하단 가운데 진행 표시줄(Simple·Player에서 사용).

## 모델 영구 저장

- 첫 사용 때 그 환경에 맞는 빌드 하나만 내려받아 IndexedDB `mobibard-ai-models`에 저장하고, `navigator.storage.persist()`로 영구 저장소를 요청합니다. 허용되면 브라우저가 저장 공간 부족 등을 이유로 자동 삭제하지 않습니다. 사용자가 사이트 데이터를 직접 지우면 삭제됩니다.
- 불러올 때마다 크기와 SHA-256을 확인합니다. 손상되었거나 `manifest.json`의 sha256과 다르면 다시 내려받습니다.
- 같은 사이트의 모든 제품이 저장된 모델을 같이 씁니다. 저장 키는 `mobibard_m2m`입니다. 이전(v1) 모델이 저장돼 있던 사용자는 sha256이 달라 다음 사용 때 v2 모델을 새로 받습니다.
- `meta.json`(버전 표기, 임계값 등)은 모델 파일과 별개로 매번 새로 받아 저장본을 갱신합니다. 모델 파일이 같으면 다시 내려받지 않습니다.
- 오프라인이어서 `manifest.json`을 못 받아도 저장된 모델과 메타가 있으면 그대로 사용합니다.
- `MobibardWave2Midi.getCacheStatus()`로 상태를 확인하고, `clearCache()`로 삭제할 수 있습니다.

## 모델 교체

1. `model/`에 새 onnx와 `meta.json`을 넣습니다.
2. `manifest.json`의 `models.w16`의 `file`, `bytes`, `sha256`을 갱신합니다. `fallback`은 `w16`을 가리킵니다.

```bash
stat -c %s model/wave2mid_v2_w16.onnx
sha256sum model/wave2mid_v2_w16.onnx
```

sha256이 바뀌면 사용자 브라우저에 있던 이전 모델은 다음 사용 때 새 모델로 교체됩니다. `meta.json`만 고친 경우에는 manifest를 바꿀 필요가 없습니다.

`lib/*.mjs`나 `worker.js`를 고치면 `wave2midi.js`의 `VERSION`을 올려 브라우저 캐시를 무효화하세요.

## 악기 지문(fingerprint) 보정과 `feat` 출력

`wave2mid_v2_w16.onnx`에는 원래 7개 출력 외에 `feat`([1,600,88,128])이 추가되어 있습니다. 모델의 모든 헤드(시작·프레임·악기 …)가 계산되는 `/head` 행렬곱의 입력, 즉 `head_norm`의 128차원 값을 `Identity`로 그대로 내보낸 것이며 기존 출력은 비트 단위로 같습니다.
곡 전체의 128차원을 모으면 수백 MB라서, 각 윈도우에서 “노트 시작 상태 확률 ≥ 0.02인 프레임부터 5프레임”의 칸만 남기고(`sparsifyFeat`) 겹치는 구간은 크로스페이드 가중치로 합칩니다.
`fingerprint`가 켜지면(일관성 우선) 노트별 지문 = 시작 후 5프레임 평균의 128차원 원본 벡터입니다(음높이 평균을 빼면 군집이 나빠져서 쓰지 않습니다). 곡 전체의 노트를 가장 비슷한 그룹끼리 한 단계씩 병합합니다(평균 연결, 코사인 유사도 ≥ 0.6이 남지 않을 때까지). 그룹마다 노트들의 악기 점수 합이 가장 큰 악기 하나로 통일하므로, 같은 소리끼리는 같은 악기가 됩니다(그룹이 통째로 틀릴 수는 있음). `feat`이 없거나 모으지 않았으면 16개 악기 점수와 근처(±3초, ±7반음) 확정 음을 비교하는 예전 국소 규칙을 씁니다. 동시에 여러 악기를 내는 음은 건드리지 않습니다.
다른 모델로 교체할 때는 같은 위치에서 `feat` 출력을 다시 추가해야 합니다(없어도 동작은 하며 16차원 지문으로 내려갑니다).
