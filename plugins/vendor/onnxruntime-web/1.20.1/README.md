# onnxruntime-web 1.20.1 (로컬 사본)

Wave2MIDI 워커(`plugins/ai/wave2midi/worker.js`)는 ONNX Runtime을 아래 순서로 찾습니다.

1. 이 폴더: `plugins/vendor/onnxruntime-web/1.20.1/` (공용 모듈)
2. 위치를 못 찾았을 때만 jsDelivr CDN의 `onnxruntime-web@1.20.1/dist/`

이 폴더의 파일 (`onnxruntime-web@1.20.1` 패키지의 `dist/`에서 복사, 라이선스 MIT, Microsoft):

```text
ort.webgpu.min.js                    WebGPU + WebAssembly 실행기 (약 330 KB)
ort-wasm-simd-threaded.jsep.mjs      WASM 로더 (약 47 KB)
ort-wasm-simd-threaded.jsep.wasm     WASM 본체 (약 21.7 MB, WebGPU/CPU 공용)
```

## 왜 1.20.1인가
1.21 이후 버전은 iPhone/iPad의 Safari(WebKit 26)에서 추론 뒤 CPU·메모리가 끝없이 늘다가 탭이 종료·재시작되는
문제가 보고되어 있습니다 (https://github.com/microsoft/onnxruntime/issues/26827). 1.20.0/1.20.1은 정상,
1.29.0의 asyncify WebGPU 빌드도 같은 문제로 보고되었습니다. 버전을 올리기 전에 이 이슈를 확인하고 아이패드에서 시험하세요.

버전을 바꿀 때는 아래처럼 사본을 교체하고 `worker.js`의 `ORT_VERSION`과 경로도 바꾸세요. 새 버전에서 파일 이름이 달라졌는지
`ort.webgpu.min.js` 안의 `ort-wasm-simd-threaded.*.mjs` 문자열로 확인합니다.

```bash
npm pack onnxruntime-web@<버전> && tar xzf onnxruntime-web-<버전>.tgz
cp package/dist/ort.webgpu.min.js package/dist/ort-wasm-simd-threaded.jsep.* plugins/vendor/onnxruntime-web/<버전>/
```
