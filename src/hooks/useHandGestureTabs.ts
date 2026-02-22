import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { SwipeDetector } from '../services/swipeDetector';
import { leftClick, movePointer, triggerTabShortcut } from '../services/shortcutClient';
import type { ControlMode, TabDirection } from '../types/gesture';

type EngineStatus = 'idle' | 'loading-model' | 'camera-starting' | 'running' | 'error';

interface HookState {
  status: EngineStatus;
  message: string;
  lastGesture: TabDirection | null;
}

const HAND_MODEL_CANDIDATES = [
  '/mediapipe/models/hand_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
];

const FACE_MODEL_CANDIDATES = [
  '/mediapipe/models/face_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
];

const WASM_ROOT_CANDIDATES = ['/mediapipe/wasm', 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'];

const POINTER_MOVE_INTERVAL_MS = 60;
const POINTER_CLICK_COOLDOWN_MS = 480;
type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

function getEyeSignalX(landmarks: { x: number }[]): number | null {
  const leftIris = landmarks[468];
  const rightIris = landmarks[473];

  if (leftIris && rightIris) {
    return (leftIris.x + rightIris.x) / 2;
  }

  const noseTip = landmarks[1];
  return noseTip?.x ?? null;
}

async function createResolverWithFallback(): Promise<VisionFileset> {
  const errors: string[] = [];

  for (const root of WASM_ROOT_CANDIDATES) {
    try {
      return await FilesetResolver.forVisionTasks(root);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      errors.push(`wasm root ${root}: ${message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function createHandLandmarkerWithFallback(
  filesetResolver: VisionFileset
): Promise<HandLandmarker> {
  const errors: string[] = [];

  for (const modelAssetPath of HAND_MODEL_CANDIDATES) {
    try {
      return await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath },
        runningMode: 'VIDEO',
        numHands: 1
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      errors.push(`hand model ${modelAssetPath}: ${message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

async function createFaceLandmarkerWithFallback(
  filesetResolver: VisionFileset
): Promise<FaceLandmarker> {
  const errors: string[] = [];

  for (const modelAssetPath of FACE_MODEL_CANDIDATES) {
    try {
      return await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      errors.push(`face model ${modelAssetPath}: ${message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

export function useHandGestureTabs() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const shortcutInFlightRef = useRef(false);
  const pointerMoveAtRef = useRef(0);
  const pointerClickAtRef = useRef(0);
  const pointerPressedRef = useRef(false);

  const handSwipeDetector = useMemo(() => new SwipeDetector(), []);
  const faceSwipeDetector = useMemo(
    () =>
      new SwipeDetector({
        minDeltaX: 0.06,
        windowMs: 320,
        cooldownMs: 850
      }),
    []
  );

  const [controlMode, setControlMode] = useState<ControlMode>('hand');
  const [state, setState] = useState<HookState>({
    status: 'idle',
    message: 'Press start to enable camera + gesture engine.',
    lastGesture: null
  });

  const triggerShortcut = useCallback((direction: TabDirection, mode: ControlMode) => {
    if (shortcutInFlightRef.current) {
      return;
    }

    shortcutInFlightRef.current = true;
    void triggerTabShortcut(direction)
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        setState((prev) => ({
          ...prev,
          message: `Shortcut trigger failed: ${message}`
        }));
      })
      .finally(() => {
        shortcutInFlightRef.current = false;
      });

    setState((prev) => ({
      ...prev,
      lastGesture: direction,
      message:
        mode === 'hand'
          ? direction === 'next'
            ? 'Right hand swipe -> next desktop space.'
            : 'Left hand swipe -> previous desktop space.'
          : direction === 'next'
            ? 'Face moved right -> next desktop space.'
            : 'Face moved left -> previous desktop space.'
    }));
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const handLandmarker = handLandmarkerRef.current;
    const faceLandmarker = faceLandmarkerRef.current;

    if (!video || !handLandmarker) {
      return;
    }

    if (controlMode === 'face' && !faceLandmarker) {
      return;
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const now = performance.now();

      if (controlMode === 'hand') {
        const handResult = handLandmarker.detectForVideo(video, now);
        const firstHand = handResult.landmarks[0];
        const wrist = firstHand?.[0];

        if (wrist) {
          const gesture = handSwipeDetector.push(wrist.x, now);
          if (gesture) {
            triggerShortcut(gesture.direction, 'hand');
          }
        }
      } else if (controlMode === 'face' && faceLandmarker) {
        const faceResult = faceLandmarker.detectForVideo(video, now);
        const firstFace = faceResult.faceLandmarks[0];

        if (firstFace) {
          const eyeSignalX = getEyeSignalX(firstFace);
          if (eyeSignalX !== null) {
            const gesture = faceSwipeDetector.push(eyeSignalX, now);
            if (gesture) {
              triggerShortcut(gesture.direction, 'face');
            }
          }
        }
      } else if (controlMode === 'pointer') {
        const handResult = handLandmarker.detectForVideo(video, now);
        const firstHand = handResult.landmarks[0];
        const indexTip = firstHand?.[8];
        const indexPip = firstHand?.[6];
        const indexMcp = firstHand?.[5];

        if (!indexTip || !indexPip || !indexMcp) {
          pointerPressedRef.current = false;
        } else {
          if (now - pointerMoveAtRef.current >= POINTER_MOVE_INTERVAL_MS) {
            pointerMoveAtRef.current = now;
            const pointerX = 1 - indexTip.x;
            const pointerY = indexTip.y;

            void movePointer(pointerX, pointerY).catch((error) => {
              const message = error instanceof Error ? error.message : 'unknown error';
              setState((prev) => ({
                ...prev,
                message: `Pointer move failed: ${message}`
              }));
            });
          }

          const extensionThreshold = 0.015;
          const isBent = indexTip.y > indexPip.y - extensionThreshold;

          if (
            isBent &&
            !pointerPressedRef.current &&
            now - pointerClickAtRef.current >= POINTER_CLICK_COOLDOWN_MS
          ) {
            pointerPressedRef.current = true;
            pointerClickAtRef.current = now;

            void leftClick().catch((error) => {
              const message = error instanceof Error ? error.message : 'unknown error';
              setState((prev) => ({
                ...prev,
                message: `Pointer click failed: ${message}`
              }));
            });

            setState((prev) => ({
              ...prev,
              message: 'Pointer mode: index finger bent -> click.'
            }));
          } else if (!isBent) {
            pointerPressedRef.current = false;
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [controlMode, faceSwipeDetector, handSwipeDetector, triggerShortcut]);

  const start = useCallback(async () => {
    if (state.status === 'running' || state.status === 'loading-model') {
      return;
    }

    if (!window.electronAPI) {
      setState({
        status: 'error',
        message: 'Electron bridge not found. Launch the desktop app with Electron.',
        lastGesture: null
      });
      return;
    }

    setState({
      status: 'camera-starting',
      message: 'Starting camera...',
      lastGesture: null
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error('video element is not ready');
      }

      video.srcObject = stream;
      await video.play();

      setState((prev) => ({
        ...prev,
        status: 'loading-model',
        message: 'Camera is on. Loading hand + face models...'
      }));

      const filesetResolver = await createResolverWithFallback();
      const [handLandmarker, faceLandmarker] = await Promise.all([
        createHandLandmarkerWithFallback(filesetResolver),
        createFaceLandmarkerWithFallback(filesetResolver)
      ]);

      handLandmarkerRef.current = handLandmarker;
      faceLandmarkerRef.current = faceLandmarker;

      setState({
        status: 'running',
        message:
          controlMode === 'hand'
            ? 'Hand mode is running. Swipe hand left/right for desktop switching.'
            : controlMode === 'face'
              ? 'Face mode is running. Move face/gaze left/right for desktop switching.'
              : 'Pointer mode is running. Move index fingertip to move mouse, bend index to click.',
        lastGesture: null
      });

      rafRef.current = requestAnimationFrame(loop);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const hasCamera = Boolean(streamRef.current);

      setState({
        status: 'error',
        message: hasCamera
          ? `Camera is active, but model failed to load: ${message}. For offline mode place models in /public/mediapipe/models/.`
          : `Engine startup failed: ${message}`,
        lastGesture: null
      });
    }
  }, [controlMode, loop, state.status]);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }

    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }

    shortcutInFlightRef.current = false;
    pointerPressedRef.current = false;
    pointerMoveAtRef.current = 0;
    pointerClickAtRef.current = 0;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    setState({
      status: 'idle',
      message: 'Engine stopped.',
      lastGesture: null
    });
  }, []);

  const changeMode = useCallback(
    (mode: ControlMode) => {
      setControlMode(mode);
      setState((prev) => ({
        ...prev,
        message:
          prev.status === 'running'
            ? mode === 'hand'
              ? 'Mode switched to hand. Swipe hand left/right.'
              : mode === 'face'
                ? 'Mode switched to face. Move face/gaze left/right.'
                : 'Mode switched to pointer. Move fingertip, bend index to click.'
            : prev.message
      }));
    },
    [setControlMode]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    start,
    stop,
    controlMode,
    setControlMode: changeMode,
    ...state
  };
}
