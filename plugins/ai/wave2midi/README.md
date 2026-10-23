# Wave2MIDI 공용 모듈

음원(오디오 파일)을 브라우저 안에서 악기별 MIDI로 변환하는 공용 모듈입니다. 파일은 서버로 업로드되지 않습니다.
Editor `파일 > 불러오기`에서 오디오 파일을 고르면 사용되며(오디오 · AI 변환 Beta), 다른 제품도 같은 API로 불러 쓸 수 있습니다.

## 구성

```text
plugins/ai/wave2midi/
  wave2midi.js            메인 스레드 API (classic script, window.MobibardWave2Midi)
  worker.js               추론 Worker: ONNX Runtime 로드, 창 분할 추론, 디코딩, velocity, MIDI 생성
  lib/dsp.mjs             frontend 특징 추출 (w2m/dsp.py 1:1 포팅)
  lib/decode.mjs          확률 맵 -> 노트, 8초 창 / 2초 겹침 cross-fade (w2m/labels.py, infer.py)
  lib/velocity.mjs        onset spectral flux 기반 velocity (w2m/velocity.py)
  lib/midi.mjs            표준 MIDI 작성기 (w2m/midi.py)
  lib/model-cache.mjs     모델 영구 저장(IndexedDB) + SHA-256 무결성 검사
  model/mobibard_m2m.onnx w2m_hybrid_axial_v5, 16비트 가중치 / 32비트 연산 (39 MB)
  model/meta.json         학습 export 메타데이터 (모델 버전 v0.1, 전처리, 임계값, 23개 GM 클래스, velocity 설정)
  model/manifest.json     모델 이름·버전·제작자·라이선스, 캐시 키(파일명, 크기, sha256)
  model/LICENSE           모델 라이선스 (MIT, startdust-io)
  vendor/onnxruntime-web/ (선택) 로컬 ONNX Runtime. 없으면 jsDelivr 1.20.1 사용
```

`lib/*.mjs` 중 dsp·decode·velocity·midi는 학습 저장소의 web export와 동일한 파일입니다. 학습 쪽에서 갱신되면 그대로 덮어쓰면 됩니다.

## 라이선스

Wave2MIDI 모델(`model/mobibard_m2m.onnx`, `model/meta.json`)은 **startdust-io**가 제작했으며 **MIT License**로 배포합니다. 전문은 `model/LICENSE`에 있습니다.
모델을 다른 곳에 복사하거나 재배포할 때는 `model/LICENSE`의 저작권 고지와 허가 문구를 함께 포함해야 합니다.

- `meta.json`: `author`, `license.spdx`, `license.copyright`, `license.file`
- `manifest.json`: `name`, `version`, `author`, `license`, `licenseFile`
- API: `MobibardWave2Midi.getModelInfo()`는 `{ name, version, author, license, licenseUrl }`를 돌려줍니다(모델은 내려받지 않음). `transcribe()` 결과의 `result.model`에도 `author`, `license`가 들어 있습니다.
- Editor는 오디오 AI 변환 중 진행 패널에 `Wave2MIDI v0.1 · startdust-io · MIT License`를 표시하고 `model/LICENSE`로 연결합니다.

## 사용법

```html
<script src="../plugins/ai/wave2midi/wave2midi.js"></script>
```

```js
const result = await MobibardWave2Midi.transcribe(file, {
  velocity: true,              // false면 velocity 100 고정
  onsetThreshold: undefined,   // 기본값은 meta.thresholds.onset (0.16)
  onProgress: ({ stage, done, total }) => {},
  signal: abortController.signal,
});
const midiFile = MobibardWave2Midi.toMidiFile(result, file.name); // File("곡.mid")
```

- `result.notes`: `[pitch, program, onset초, offset초, confidence]` 배열. program 128은 드럼(MIDI 채널 10)입니다.
- `result.midi`: 120 BPM, 480 PPQ 표준 MIDI(Uint8Array). program별 트랙, 드럼은 채널 10입니다.
- 진행 단계 `stage`: `decode` → `runtime` → `model-check` → (`model-download` → `model-store`) → `model-init` → `analyze`(done/total 창) → `velocity` → `midi`
- 오류 `error.code`: `unsupported`, `decode-failed`, `too-long`, `runtime-unavailable`, `model-unavailable`, `model-corrupt`, `model-init-failed`, `out-of-memory`, `aborted`
- 기본 최대 길이는 10분입니다(`maxSeconds`). 악기 확률 맵이 오디오 1분당 약 49 MB를 쓰기 때문입니다.
- 실행: WebGPU가 있으면 WebGPU, 없거나 실패하면 WebAssembly(CPU)로 실행합니다. 강제로 CPU를 쓰려면 `executionProvider: "wasm"`을 넘기세요.
- Worker는 마지막 사용 뒤 3분이 지나면 종료되어 메모리를 돌려줍니다. 다음 호출 때 모델은 IndexedDB에서 다시 불러옵니다.

## 모델 영구 저장

- 첫 사용 때 모델을 내려받아 IndexedDB `mobibard-ai-models`에 저장하고, `navigator.storage.persist()`로 영구 저장소를 요청합니다. 허용되면 브라우저가 저장 공간 부족 등을 이유로 자동 삭제하지 않습니다. 사용자가 사이트 데이터를 직접 지우면 삭제됩니다.
- 불러올 때마다 크기와 SHA-256을 확인합니다. 손상되었거나 `manifest.json`의 sha256과 다르면 다시 내려받습니다.
- 같은 사이트의 모든 제품이 저장된 모델 하나를 같이 씁니다.
- `meta.json`(버전 표기, 임계값 등)은 모델 파일과 별개로 매번 새로 받아 저장본을 갱신합니다. 모델 파일이 같으면 다시 내려받지 않습니다.
- 오프라인이어서 `manifest.json`을 못 받아도 저장된 모델과 메타가 있으면 그대로 사용합니다.
- `MobibardWave2Midi.getCacheStatus()`로 상태를 확인하고, `clearCache()`로 삭제할 수 있습니다.

## 모델 교체

1. `model/`에 새 onnx와 `meta.json`을 넣습니다.
2. `manifest.json`의 `file`, `bytes`, `sha256`을 갱신합니다.

```bash
stat -c %s model/mobibard_m2m.onnx
sha256sum model/mobibard_m2m.onnx
```

sha256이 바뀌면 사용자 브라우저에 있던 이전 모델은 다음 사용 때 새 모델로 교체됩니다. `meta.json`만 고친 경우에는 manifest를 바꿀 필요가 없습니다.

`lib/*.mjs`나 `worker.js`를 고치면 `wave2midi.js`의 `VERSION`을 올려 브라우저 캐시를 무효화하세요.
