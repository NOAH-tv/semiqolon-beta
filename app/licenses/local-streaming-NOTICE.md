# PC 한국어 실시간 인식 시험판

- 실행 코드: sherpa-onnx 1.13.8, Apache-2.0. https://github.com/k2-fsa/sherpa-onnx
  라이선스 전문: `sherpa-onnx-LICENSE.txt`.
- 모델: `sherpa-onnx-streaming-zipformer-korean-2024-06-16`, 공식 배포 ONNX.
  https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html#sherpa-onnx-streaming-zipformer-korean-2024-06-16-korean
- 원 학습 코드: https://github.com/k2-fsa/icefall/pull/1651
- 공식 안내에서 연결한 학습 체크포인트의 모델 카드에 Apache-2.0이 명시되어 있음.
  https://huggingface.co/johnBamma/icefall-asr-ksponspeech-pruned-transducer-stateless7-streaming-2024-06-12
  참고 사본: `korean-streaming-model-card.md`. 원 학습 데이터 자체를 이 앱에 복제하지 않음.
- 다운로드 아카이브 SHA256: `e346a5882a409650472be17326237e24df7bf409db6b4a8a52e1a61422bf2500`.
- 이 앱의 연결·표시 코드는 직접 작성. Google 엔진의 코드·모델을 복제하지 않음.

이 시험판은 127.0.0.1의 PC 프로세스에서 인식합니다. 모델은 최초 한 번 내려받고 이후 인식 시 외부 API에 음성을 보내지 않습니다. WebSocket의 16비트 변환·모델 내부 리샘플링은 인식용 사본에만 적용하며, 원래 녹음은 기존 24비트 WAV로 브라우저에 보관합니다. 토큰 시각은 근삿값이며 발음 정확도나 성대 상태를 판정하지 않습니다.

현재 GitHub Pages 휴대폰 버전은 기존 Whisper 기기 인식을 사용합니다. 이 PC 엔진의 iPhone/Android 이식 및 실제 휴대폰 속도·정확도 검증은 아직 하지 않았습니다.
