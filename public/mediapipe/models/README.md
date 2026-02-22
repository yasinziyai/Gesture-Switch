Place MediaPipe model files here for offline/local loading:

- hand_landmarker.task
- face_landmarker.task

The app tries local files first:
- /mediapipe/models/hand_landmarker.task
- /mediapipe/models/face_landmarker.task

If these files are absent, it falls back to remote URLs.
