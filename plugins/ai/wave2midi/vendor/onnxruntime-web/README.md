# onnxruntime-web (선택 사항: 로컬 vendor)

Wave2MIDI 워커는 ONNX Runtime을 아래 순서로 찾습니다.

1. 이 폴더: `plugins/ai/wave2midi/vendor/onnxruntime-web/`
2. jsDelivr CDN의 `onnxruntime-web@1.20.1/dist/` (위치를 못 찾았을 때 대체 경로)

CDN을 쓰지 않고 사이트 안에서만 배포하려면 `onnxruntime-web@1.20.1` 패키지의 `dist/`에서 아래 파일을 이 폴더에 넣으세요.

```text
ort.webgpu.min.js
ort-wasm-simd-threaded.jsep.mjs
ort-wasm-simd-threaded.jsep.wasm
```

```bash
npm pack onnxruntime-web@1.20.1 && tar xzf onnxruntime-web-1.20.1.tgz
cp package/dist/ort.webgpu.min.js package/dist/ort-wasm-simd-threaded.jsep.* plugins/ai/wave2midi/vendor/onnxruntime-web/
```

버전을 바꿀 때는 `worker.js`의 `ORT_VERSION`도 같이 바꿔야 합니다.
