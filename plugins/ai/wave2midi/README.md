# Wave2MIDI 공용 모듈

음원(오디오 파일)을 브라우저 안에서 악기별 MIDI로 변환하는 공용 모듈입니다. 파일은 서버로 업로드되지 않습니다.
Editor `파일 > 불러오기`에서 오디오 파일을 고르면 사용되며(오디오 · AI 변환), 다른 제품도 같은 API로 불러 쓸 수 있습니다.

## 구성

```text
plugins/ai/wave2midi/
  wave2midi.js            메인 스레드 API (classic script, window.MobibardWave2Midi)
  worker.js               추론 Worker: ONNX Runtime 로드, 창 분할 추론, 디코딩, velocity, MIDI 생성
  lib/dsp.mjs             frontend 특징 추출 (w2m/dsp.py 1:1 포팅)
  lib/decode.mjs          확률 맵 -> 노트, 8초 창 / 2초 겹침 cross-fade (w2m/labels.py, infer.py)
  lib/velocity.mjs        onset spectral flux 기반 velocity (w2m/velocity.py)
  lib/midi.mjs            표준 MIDI 작성기 (w2m/midi.py)
  lib/tempo.mjs           노트로부터 템포 맵 추정 (w2m/tempo.py, 기본 사용)
  lib/model-cache.mjs     모델 영구 저장(IndexedDB) + SHA-256 무결성 검사
  model/wave2mid_fp16.onnx  가속용: 16비트 연산 (39 MB). WebGPU + shader-f16 지원 환경에서만 사용
  model/wave2mid_w16.onnx   기본(fallback): 16비트 가중치 / 32비트 연산 (39 MB). 모든 환경
  model/meta.json         학습 export 메타데이터 (모델 버전 v1.1, 전처리, 임계값, 16개 GM 클래스, velocity 설정)
  model/manifest.json     모델 이름·버전·제작자·라이선스, 빌드별(models.fp16 / models.w16) 파일명·크기·sha256
  model/LICENSE           모델 라이선스 (CC BY-NC 4.0, startdust-io)
  vendor/onnxruntime-web/ (선택) 로컬 ONNX Runtime. 없으면 jsDelivr 1.20.1 사용
```

`lib/*.mjs` 중 dsp·decode·velocity·midi·tempo는 학습 저장소의 web export와 동일한 파일입니다. 학습 쪽에서 갱신되면 그대로 덮어쓰면 됩니다.

## 라이선스

Wave2MIDI 모델(`model/mobibard_w2m.onnx`, `model/meta.json`)은 **startdust-io**가 제작했으며 **CC BY-NC 4.0 (CC-BY-NC-4.0)**으로 배포합니다. 학습 데이터에 비상업 라이선스(CC-BY-NC-4.0) 자료가 포함되어 있어 **비상업적 이용만** 허용되며, 안내문은 `model/LICENSE`에 있습니다.
모델을 다른 곳에 복사하거나 재배포할 때는 `model/LICENSE`를 함께 포함하고, 저작자 표시와 비상업 조건을 지켜야 합니다.

- `meta.json`: `author`, `license.spdx`, `license.copyright`, `license.file`
- `manifest.json`: `name`, `version`, `author`, `license`, `licenseFile`
- API: `MobibardWave2Midi.getModelInfo()`는 `{ name, version, author, license, licenseUrl }`를 돌려줍니다(모델은 내려받지 않음). `transcribe()` 결과의 `result.model`에도 `author`, `license`가 들어 있습니다.
- Editor는 오디오 AI 변환 중 진행 패널에 `Wave2MIDI v1.1 · startdust-io · CC BY-NC 4.0`를 표시하고 `model/LICENSE`로 연결합니다.

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
  onsetThreshold: undefined,   // 기본값은 meta.thresholds.onset (0.16)
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
  1. WebGPU 어댑터가 있고 `shader-f16` 기능을 지원하며, 그 기능으로 장치를 실제로 만들 수 있으면 **fp16 빌드**(`wave2mid_fp16.onnx`)만 내려받아 WebGPU로 실행합니다.
  2. 그렇지 않으면 **w16 빌드**(`wave2mid_w16.onnx`)만 내려받아 WebGPU(가능하면) 또는 WebAssembly(CPU)로 실행합니다.
  3. fp16 빌드의 다운로드·초기화·추론 중 하나라도 실패하면 자동으로 w16 빌드로 다시 시도합니다.
  - 강제로 CPU를 쓰려면 `executionProvider: "wasm"`(항상 w16), 빌드를 고정하려면 `modelVariant: "fp16" | "w16"`을 넘기세요.
  - `MobibardWave2Midi.getCapabilities()`는 모델을 받지 않고 `{ webgpu, shaderF16, adapter, variant }`를 돌려줍니다. `transcribe()` 결과의 `result.variant`와 `result.model.variant`에 실제 사용한 빌드가 들어 있습니다.
- Worker는 마지막 사용 뒤 3분이 지나면 종료되어 메모리를 돌려줍니다. 다음 호출 때 모델은 IndexedDB에서 다시 불러옵니다.

### 후처리 다시 적용 (1.0.12~)

- `postprocess({ onsetThreshold, velocity, velocityRange, tempo, tempoChanges })`: 마지막 변환의 모델 출력으로 노트·세기·템포·MIDI만 다시 계산합니다(모델을 다시 돌리지 않음). Worker가 해제된 뒤에는 `error.code === "no-job"`으로 실패하므로 `transcribe()`를 다시 호출하세요.
- `getPostprocessDefaults()`: `model/meta.json`의 기본값 `{ onsetThreshold, velocity, velocityMin, velocityMax, tempoChanges, tempoMin, tempoMax }` (모델은 내려받지 않음).

### UI 보조 함수 (1.0.4)

- `isAudioFile(fileOrName, mimeType)`: AI 변환 대상 오디오인지 판별(MIDI/KAR 제외).
- `progressText(event, tr)` / `progressFraction(event)`: 진행 이벤트를 문구·비율로 변환. `tr`은 `preparing`, `downloading`, `analyzing` 이름을 받는 번역 함수입니다.
- `errorText(error, tr, { maxMinutes })`: 오류 코드를 `err_*`/`no_notes`/`failed` 문구로 변환.
- `showProgressNotice(text, fraction)` / `hideProgressNotice()`: 화면 하단 가운데 진행 표시줄(Simple·Player에서 사용).

## 모델 영구 저장

- 첫 사용 때 그 환경에 맞는 빌드 하나만 내려받아 IndexedDB `mobibard-ai-models`에 저장하고, `navigator.storage.persist()`로 영구 저장소를 요청합니다. 허용되면 브라우저가 저장 공간 부족 등을 이유로 자동 삭제하지 않습니다. 사용자가 사이트 데이터를 직접 지우면 삭제됩니다.
- 불러올 때마다 크기와 SHA-256을 확인합니다. 손상되었거나 `manifest.json`의 sha256과 다르면 다시 내려받습니다.
- 같은 사이트의 모든 제품이 저장된 모델을 같이 씁니다. 빌드마다 따로 저장되며(w16은 `mobibard_m2m`, fp16은 `mobibard_m2m:fp16`), w16은 이전 버전과 같은 키·같은 파일이라 이미 받아 둔 모델을 그대로 씁니다.
- `meta.json`(버전 표기, 임계값 등)은 모델 파일과 별개로 매번 새로 받아 저장본을 갱신합니다. 모델 파일이 같으면 다시 내려받지 않습니다.
- 오프라인이어서 `manifest.json`을 못 받아도 저장된 모델과 메타가 있으면 그대로 사용합니다.
- `MobibardWave2Midi.getCacheStatus()`로 상태를 확인하고, `clearCache()`로 삭제할 수 있습니다.

## 모델 교체

1. `model/`에 새 onnx와 `meta.json`을 넣습니다.
2. `manifest.json`의 `models.fp16`, `models.w16` 각각의 `file`, `bytes`, `sha256`을 갱신합니다. 맨 위의 `file`/`bytes`/`sha256`은 이전 버전 호환용이므로 w16과 같은 값으로 맞춥니다.

```bash
stat -c %s model/wave2mid_fp16.onnx model/wave2mid_w16.onnx
sha256sum model/wave2mid_fp16.onnx model/wave2mid_w16.onnx
```

sha256이 바뀌면 사용자 브라우저에 있던 이전 모델은 다음 사용 때 새 모델로 교체됩니다. `meta.json`만 고친 경우에는 manifest를 바꿀 필요가 없습니다.

`lib/*.mjs`나 `worker.js`를 고치면 `wave2midi.js`의 `VERSION`을 올려 브라우저 캐시를 무효화하세요.
