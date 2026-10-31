# onnxruntime-web 1.31.1 (로컬 사본)

Wave2MIDI 워커는 ONNX Runtime을 아래 순서로 찾습니다.

1. 이 폴더: `plugins/vendor/onnxruntime-web/1.31.1/` (공용 모듈, Wave2MIDI 외 제품도 같은 사본을 쓸 수 있음)
2. 위치를 못 찾았을 때만 jsDelivr CDN의 `onnxruntime-web@1.31.1/dist/`

이 폴더의 파일 (`onnxruntime-web@1.31.1` 패키지의 `dist/`에서 복사, 라이선스 MIT, Microsoft):

```text
ort.webgpu.min.js                         WebGPU + WebAssembly 실행기 (약 70 KB)
ort-wasm-simd-threaded.asyncify.mjs       WASM 로더 (약 53 KB)
ort-wasm-simd-threaded.asyncify.wasm      WASM 본체 (약 28.7 MB, WebGPU/CPU 공용)
```

1.20.x까지는 `...jsep.mjs/.wasm`을 썼지만 1.31부터 `ort.webgpu.min.js`가 `...asyncify.mjs/.wasm`을 불러옵니다.
버전을 바꿀 때는 아래처럼 사본을 교체하고 `worker.js`의 `ORT_VERSION`도 같이 바꾸세요. 새 버전에서 파일 이름이 달라졌는지
`ort.webgpu.min.js` 안의 `ort-wasm-simd-threaded.*.mjs` 문자열로 확인합니다.

```bash
npm pack onnxruntime-web@<버전> && tar xzf onnxruntime-web-<버전>.tgz
cp package/dist/ort.webgpu.min.js package/dist/ort-wasm-simd-threaded.asyncify.* plugins/vendor/onnxruntime-web/1.31.1/
```
