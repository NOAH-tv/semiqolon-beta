# 기기 문장 인식 · 2026-10-02

- Transformers.js 3.8.1 (Apache-2.0): https://github.com/huggingface/transformers.js
  npm 정식 배포의 `transformers.min.js`, `ort-wasm-simd-threaded.jsep.mjs/.wasm`을 그대로 사용합니다.
- ONNX Runtime (MIT): https://github.com/microsoft/onnxruntime
- Whisper 원본 모델 (MIT): https://github.com/openai/whisper
- 실행 시 받는 ONNX 변환 모델: https://huggingface.co/onnx-community/whisper-base_timestamped
  고정 revision: `608c49e61301901684bc36cac8f74b95ff6b5a8e`.
- 단어별 시각 추출 사용법 참고: https://github.com/huggingface/transformers.js-examples/tree/main/whisper-word-timestamps

모델은 앱에 요청한 사용자의 브라우저로 내려받습니다. 음성 인식 API로 음성을 보내지 않으며, 모델 다운로드 요청에는 일반적인 네트워크 접속 정보가 제공될 수 있습니다. 서버 추론 API 키가 필요하지 않습니다. 라이선스 전문은 같은 폴더의 해당 txt 파일에 있습니다.
