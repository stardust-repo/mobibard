# onnxruntime-web 1.31.1 (로컬 사본)

Wave2MIDI 워커가 **모든 환경**에서 사용합니다(Apple 기기 포함).

| 환경 | 사용 파일 |
|---|---|
| GPU 사용 가능(Windows/Android 태블릿 등) | `ort.webgpu.min.js` + `ort-wasm-simd-threaded.asyncify.mjs/.wasm` |
| CPU 전용(Android 폰) | `ort.wasm.min.js` + `ort-wasm-simd-threaded.mjs/.wasm` (wasm 약 15 MB) |

어떤 쪽을 쓸지는 `plugins/ai/wave2midi/worker.js`의 `ORT_RUNTIMES`/`pickRuntime()`이 정합니다.
위치를 못 찾았을 때만 jsDelivr의 `onnxruntime-web@1.31.1/dist/`를 씁니다.
