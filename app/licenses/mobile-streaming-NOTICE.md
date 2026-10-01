# Mobile Korean streaming recognition

- Runtime: k2-fsa/sherpa-onnx v1.12.14 (Apache-2.0, see sherpa-onnx-LICENSE.txt).
- Official binary archive: https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.14/sherpa-onnx-wasm-simd-v1.12.14-en-asr-zipformer.tar.bz2
- `assets/sherpa-api.js` and `assets/sherpa-asr.wasm` are unchanged upstream files. `sherpa-runtime.js` removes only the generated English `.data` preloader before `var moduleOverrides`. SEMIQOLON loads the Korean model into the same Emscripten filesystem. No English model is shipped.
- Model: sherpa-onnx-streaming-zipformer-korean-2024-06-16. Model card: korean-streaming-model-card.md (Apache-2.0).
- Model files: encoder int8, decoder float32, joiner int8, tokens.txt. `sherpa-ko-model.json` describes byte-exact pieces with SHA-256. Pieces are under GitHub's individual file size limit; concatenating them reconstructs the unmodified ONNX files.
- Upstream model release: https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-korean-2024-06-16.tar.bz2
- The audio stays in the browser worker. CacheStorage holds model files only. One WASM SIMD thread; no cross-origin isolation required. Model/runtime first download approximately 153 MB. Browser eviction can require downloading again.
- Model processing, text alignment, or token times are not a validated pronunciation assessment. Physical phone speed and accuracy must be checked on each target device.
