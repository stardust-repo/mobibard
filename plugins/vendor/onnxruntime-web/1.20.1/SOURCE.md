# ONNX Runtime Web 1.20.1 source

- Project: https://github.com/microsoft/onnxruntime
- npm package: `onnxruntime-web@1.20.1` (`package/dist/`)
- License: MIT (Copyright (c) Microsoft Corporation), see `LICENSE`
- Runtime files here: `ort.webgpu.min.js`, `ort-wasm-simd-threaded.jsep.mjs`, `ort-wasm-simd-threaded.jsep.wasm`

The files are the unmodified npm release files. Used by `plugins/ai/wave2midi/worker.js`
(Wave2MIDI audio-to-MIDI). Keep this file and `LICENSE` with redistributed copies.

Why 1.20.1 and not a newer release: from 1.21 on, onnxruntime-web reportedly makes Safari / WebKit 26
(iOS and iPadOS) run away with CPU and memory after an inference until the tab is killed and reloaded
(https://github.com/microsoft/onnxruntime/issues/26827; 1.20.0 and 1.20.1 are reported to work, and the
1.29.0 asyncify WebGPU build still fails). Before upgrading, check that issue and test on an iPad.
