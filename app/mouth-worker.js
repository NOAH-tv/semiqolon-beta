// MediaPipe runs off the UI thread. Images stay in memory and are closed after inference.
// The MediaPipe WASM loader uses importScripts; use a classic worker.
var exports = {};
importScripts('./assets/vision_bundle.js');
const {FaceLandmarker, FilesetResolver} = exports;
let detector;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks('./assets');
      detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: './assets/face_landmarker.task', delegate: 'CPU'},
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: .65, minFacePresenceConfidence: .65,
        minTrackingConfidence: .65
      });
      self.postMessage({type: 'ready'});
    } else if (data.type === 'frame') {
      try {
        const points = detector.detectForVideo(data.bitmap, data.time).faceLandmarks[0];
        // Send only the few points needed for mouth geometry; nothing is persisted.
        const ids = [1, 13, 14, 33, 61, 78, 81, 82, 87, 88, 133, 178, 191, 263, 291, 308, 311, 312, 317, 318, 324, 95, 402, 415];
        self.postMessage({type: 'face', points: points ? Object.fromEntries(ids.map(i => [i, points[i]])) : null});
      } finally { data.bitmap.close(); }
    }
  } catch (error) { console.error('Mouth model:', error.message); self.postMessage({type: 'error', message: error.message}); }
};
