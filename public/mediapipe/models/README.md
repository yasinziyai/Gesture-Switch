Place MediaPipe model files here for offline/local loading:

- hand_landmarker.task
- face_landmarker.task

The app loads only local files from:
- /mediapipe/models/hand_landmarker.task
- /mediapipe/models/face_landmarker.task

There is no remote URL fallback.

Bootstrap helper:
- `npm run sync:mediapipe-assets` copies wasm assets and downloads/validates the model files when possible.
