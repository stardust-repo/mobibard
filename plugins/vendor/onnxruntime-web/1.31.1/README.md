# onnxruntime-web 1.31.1 (로컬 사본)

Wave2MIDI 워커가 **모든 환경**에서 사용합니다(Apple 기기 포함). `../1.20.1/`은 되돌릴 때를 위해 남겨 둔 사본입니다.

| 환경 | 사용 파일 |
|---|---|
| GPU 사용 가능(Windows/Android 태블릿 등) | `ort.webgpu.min.js` + `ort-wasm-simd-threaded.asyncify.mjs/.wasm` |
| CPU 전용(Android 폰) | `ort.wasm.min.js` + `ort-wasm-simd-threaded.mjs/.wasm` (wasm 약 15 MB) |

어떤 쪽을 쓸지는 `plugins/ai/wave2midi/worker.js`의 `ORT_RUNTIMES`/`pickRuntime()`이 정합니다.
Apple 기기에서 쓰려면 먼저 https://github.com/microsoft/onnxruntime/issues/26827 이슈를 확인하고 실제 기기에서 시험하세요.
위치를 못 찾았을 때만 jsDelivr의 `onnxruntime-web@1.31.1/dist/`를 씁니다.
