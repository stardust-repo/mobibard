# ONNX Runtime Web 1.31.1 source

- Project: https://github.com/microsoft/onnxruntime
- npm package: `onnxruntime-web@1.31.1` (`package/dist/`)
- License: MIT (Copyright (c) Microsoft Corporation), see `LICENSE`
- Runtime files here (unmodified npm release files):
  - `ort.webgpu.min.js` + `ort-wasm-simd-threaded.asyncify.mjs/.wasm` : WebGPU + WebAssembly runtime
  - `ort.wasm.min.js` + `ort-wasm-simd-threaded.mjs/.wasm` : WebAssembly (CPU) only runtime, smaller wasm

Used by `plugins/ai/wave2midi/worker.js` (Wave2MIDI). Apple WebKit (iPhone/iPad/Safari) keeps using 1.20.1, because
1.21+ is reported to make Safari / WebKit 26 run away with CPU and memory after an inference
(https://github.com/microsoft/onnxruntime/issues/26827). Keep this file and `LICENSE` with redistributed copies.
