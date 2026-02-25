import { useCallback, useEffect, useRef } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const HAND_MODEL_CANDIDATES = [
  "/mediapipe/models/hand_landmarker.task",
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
];

const WASM_ROOT_CANDIDATES = [
  "/mediapipe/wasm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
];

const PINCH_ENGAGE_RATIO = 0.4;
const PINCH_RELEASE_RATIO = 0.62;
const PINCH_RATIO_SMOOTHING = 0.55;
const PINCH_ENGAGE_FRAMES = 2;
const PINCH_RELEASE_FRAMES = 3;
const NO_HAND_RELEASE_GRACE_FRAMES = 4;
const INDEX_MISSING_RELEASE_GRACE_FRAMES = 3;
const CURSOR_ALPHA_BASE = 0.09;
const CURSOR_ALPHA_MAX = 0.33;
const DRAW_CURSOR_ALPHA_BASE = 0.06;
const DRAW_CURSOR_ALPHA_MAX = 0.22;
const CURSOR_VELOCITY_MIN = 40;
const CURSOR_VELOCITY_MAX = 2200;
const CURSOR_JITTER_DEADZONE_PX = 1.9;
const DRAW_CURSOR_JITTER_DEADZONE_PX = 0.9;
const RAW_OUTLIER_JUMP_PX = 120;
const RAW_OUTLIER_DT_MS = 95;
const MAX_CURSOR_STEP_PX_PER_SEC = 1650;
const DRAW_MAX_CURSOR_STEP_PX_PER_SEC = 980;
const INDEX_DWELL_MS = 500;
const INDEX_DWELL_RADIUS_PX = 26;
const CLICK_COOLDOWN_MS = 360;

type Point = { x: number; y: number };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface UseWhiteboardGesturesOptions {
  onCursor: (point: Point) => void;
  onPinchStart: (point: Point) => void;
  onPinchMove: (point: Point) => void;
  onPinchEnd: () => void;
  onIndexOnlyDwellClick: (point: Point) => void;
}

function isFingerExtended(
  tip: { y: number } | undefined,
  pip: { y: number } | undefined,
  margin = 0.012
): boolean {
  if (!tip || !pip) {
    return false;
  }
  return tip.y < pip.y - margin;
}

async function createResolverWithFallback() {
  const errors: string[] = [];
  for (const root of WASM_ROOT_CANDIDATES) {
    try {
      return await FilesetResolver.forVisionTasks(root);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push(`wasm root ${root}: ${message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

async function createHandLandmarkerWithFallback(filesetResolver: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
  const errors: string[] = [];
  for (const modelAssetPath of HAND_MODEL_CANDIDATES) {
    try {
      return await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath },
        runningMode: "VIDEO",
        numHands: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push(`hand model ${modelAssetPath}: ${message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

export function useWhiteboardGestures(options: UseWhiteboardGesturesOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const smoothedCursorRef = useRef<Point | null>(null);
  const lastRawCursorRef = useRef<Point | null>(null);
  const lastRawAtRef = useRef(0);
  const penGripActiveRef = useRef(false);
  const pinchCandidateFramesRef = useRef(0);
  const pinchReleaseFramesRef = useRef(0);
  const pinchRatioSmoothedRef = useRef<number | null>(null);
  const noHandFramesRef = useRef(0);
  const indexMissingFramesRef = useRef(0);
  const dwellAnchorRef = useRef<Point | null>(null);
  const dwellStartAtRef = useRef(0);
  const dwellClickedRef = useRef(false);
  const lastClickAtRef = useRef(0);
  const callbacksRef = useRef(options);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const resetDwell = useCallback(() => {
    dwellAnchorRef.current = null;
    dwellStartAtRef.current = 0;
    dwellClickedRef.current = false;
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const handLandmarker = handLandmarkerRef.current;
    if (!video || !handLandmarker) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const now = performance.now();
      const handResult = handLandmarker.detectForVideo(video, now);
      const firstHand = handResult.landmarks[0];

      if (!firstHand) {
        noHandFramesRef.current += 1;
        if (
          penGripActiveRef.current &&
          noHandFramesRef.current >= NO_HAND_RELEASE_GRACE_FRAMES
        ) {
          penGripActiveRef.current = false;
          callbacksRef.current.onPinchEnd();
        }
        smoothedCursorRef.current = null;
        lastRawCursorRef.current = null;
        lastRawAtRef.current = 0;
        pinchCandidateFramesRef.current = 0;
        if (noHandFramesRef.current >= NO_HAND_RELEASE_GRACE_FRAMES) {
          pinchReleaseFramesRef.current = 0;
          pinchRatioSmoothedRef.current = null;
        }
        resetDwell();
      } else {
        noHandFramesRef.current = 0;
        const indexTip = firstHand[8];
        const indexPip = firstHand[6];
        const middleTip = firstHand[12];
        const middlePip = firstHand[10];
        const ringTip = firstHand[16];
        const ringPip = firstHand[14];
        const pinkyTip = firstHand[20];
        const pinkyPip = firstHand[18];
        const thumbTip = firstHand[4];

        if (indexTip) {
          indexMissingFramesRef.current = 0;
          const rawPoint = {
            x: (1 - indexTip.x) * window.innerWidth,
            y: indexTip.y * window.innerHeight,
          };

          const lastRaw = lastRawCursorRef.current;
          const dtMs = lastRawAtRef.current > 0 ? now - lastRawAtRef.current : 0;
          const rawJump = lastRaw ? Math.hypot(rawPoint.x - lastRaw.x, rawPoint.y - lastRaw.y) : 0;
          const sanitizedRawPoint =
            lastRaw && dtMs > 0 && dtMs <= RAW_OUTLIER_DT_MS && rawJump > RAW_OUTLIER_JUMP_PX
              ? lastRaw
              : rawPoint;
          const speedPxPerSec =
            lastRaw && dtMs > 0
              ? (Math.hypot(sanitizedRawPoint.x - lastRaw.x, sanitizedRawPoint.y - lastRaw.y) / dtMs) * 1000
              : 0;
          const velocityT = clamp01(
            (speedPxPerSec - CURSOR_VELOCITY_MIN) /
              (CURSOR_VELOCITY_MAX - CURSOR_VELOCITY_MIN)
          );
          const alphaBase = penGripActiveRef.current ? DRAW_CURSOR_ALPHA_BASE : CURSOR_ALPHA_BASE;
          const alphaMax = penGripActiveRef.current ? DRAW_CURSOR_ALPHA_MAX : CURSOR_ALPHA_MAX;
          const alpha = alphaBase + (alphaMax - alphaBase) * velocityT;

          let smoothed = smoothedCursorRef.current
            ? {
                x:
                  smoothedCursorRef.current.x +
                  (sanitizedRawPoint.x - smoothedCursorRef.current.x) * alpha,
                y:
                  smoothedCursorRef.current.y +
                  (sanitizedRawPoint.y - smoothedCursorRef.current.y) * alpha,
              }
            : sanitizedRawPoint;

          if (smoothedCursorRef.current && dtMs > 0) {
            const maxStep =
              ((penGripActiveRef.current
                ? DRAW_MAX_CURSOR_STEP_PX_PER_SEC
                : MAX_CURSOR_STEP_PX_PER_SEC) *
                dtMs) /
              1000;
            const dx = smoothed.x - smoothedCursorRef.current.x;
            const dy = smoothed.y - smoothedCursorRef.current.y;
            const step = Math.hypot(dx, dy);
            if (step > maxStep && step > 0) {
              const ratio = maxStep / step;
              smoothed = {
                x: smoothedCursorRef.current.x + dx * ratio,
                y: smoothedCursorRef.current.y + dy * ratio,
              };
            }
          }

          if (smoothedCursorRef.current) {
            const drift = Math.hypot(
              smoothed.x - smoothedCursorRef.current.x,
              smoothed.y - smoothedCursorRef.current.y
            );
            const deadzone = penGripActiveRef.current
              ? DRAW_CURSOR_JITTER_DEADZONE_PX
              : CURSOR_JITTER_DEADZONE_PX;
            if (drift < deadzone) {
              smoothed = smoothedCursorRef.current;
            }
          }

          lastRawCursorRef.current = sanitizedRawPoint;
          lastRawAtRef.current = now;
          smoothedCursorRef.current = smoothed;
          callbacksRef.current.onCursor(smoothed);

          const palmAnchor = firstHand[5];
          const palmBase = firstHand[17];
          const palmScale = palmAnchor && palmBase
            ? Math.hypot(palmAnchor.x - palmBase.x, palmAnchor.y - palmBase.y)
            : 0.11;
          const pinchDistance = thumbTip
            ? Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y)
            : Number.POSITIVE_INFINITY;
          const pinchRatioRaw = pinchDistance / Math.max(0.045, palmScale);
          const pinchRatio = pinchRatioSmoothedRef.current === null
            ? pinchRatioRaw
            : pinchRatioSmoothedRef.current +
              (pinchRatioRaw - pinchRatioSmoothedRef.current) * PINCH_RATIO_SMOOTHING;
          pinchRatioSmoothedRef.current = pinchRatio;
          const isPinchCandidate = pinchRatio < PINCH_ENGAGE_RATIO;
          const isPinchReleaseCandidate = pinchRatio > PINCH_RELEASE_RATIO;

          if (!penGripActiveRef.current) {
            if (isPinchCandidate) {
              pinchCandidateFramesRef.current += 1;
            } else {
              pinchCandidateFramesRef.current = 0;
            }

            if (pinchCandidateFramesRef.current >= PINCH_ENGAGE_FRAMES) {
              penGripActiveRef.current = true;
              pinchCandidateFramesRef.current = 0;
              pinchReleaseFramesRef.current = 0;
              callbacksRef.current.onPinchStart(smoothed);
            }
          } else {
            if (isPinchReleaseCandidate) {
              pinchReleaseFramesRef.current += 1;
            } else {
              pinchReleaseFramesRef.current = 0;
            }

            if (pinchReleaseFramesRef.current >= PINCH_RELEASE_FRAMES) {
              penGripActiveRef.current = false;
              pinchCandidateFramesRef.current = 0;
              pinchReleaseFramesRef.current = 0;
              pinchRatioSmoothedRef.current = null;
              callbacksRef.current.onPinchEnd();
            }
          }

          if (penGripActiveRef.current) {
            callbacksRef.current.onPinchMove(smoothed);
          }

          const isIndexOnlyPose =
            isFingerExtended(indexTip, indexPip) &&
            !isFingerExtended(middleTip, middlePip) &&
            !isFingerExtended(ringTip, ringPip) &&
            !isFingerExtended(pinkyTip, pinkyPip) &&
            !penGripActiveRef.current;

          if (!isIndexOnlyPose) {
            resetDwell();
          } else {
            const anchor = dwellAnchorRef.current;
            if (!anchor) {
              dwellAnchorRef.current = smoothed;
              dwellStartAtRef.current = now;
              dwellClickedRef.current = false;
            } else {
              const drift = Math.hypot(smoothed.x - anchor.x, smoothed.y - anchor.y);
              if (drift > INDEX_DWELL_RADIUS_PX) {
                dwellAnchorRef.current = smoothed;
                dwellStartAtRef.current = now;
                dwellClickedRef.current = false;
              } else if (
                !dwellClickedRef.current &&
                now - dwellStartAtRef.current >= INDEX_DWELL_MS &&
                now - lastClickAtRef.current >= CLICK_COOLDOWN_MS
              ) {
                dwellClickedRef.current = true;
                lastClickAtRef.current = now;
                callbacksRef.current.onIndexOnlyDwellClick(smoothed);
              }
            }
          }
        } else {
          indexMissingFramesRef.current += 1;
          if (
            penGripActiveRef.current &&
            indexMissingFramesRef.current >= INDEX_MISSING_RELEASE_GRACE_FRAMES
          ) {
            penGripActiveRef.current = false;
            callbacksRef.current.onPinchEnd();
          }
          pinchCandidateFramesRef.current = 0;
          if (indexMissingFramesRef.current >= INDEX_MISSING_RELEASE_GRACE_FRAMES) {
            pinchReleaseFramesRef.current = 0;
            pinchRatioSmoothedRef.current = null;
          }
          resetDwell();
        }
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [resetDwell]);

  useEffect(() => {
    let active = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            facingMode: "user",
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          throw new Error("whiteboard video element is not ready");
        }

        video.srcObject = stream;
        await video.play();

        const filesetResolver = await createResolverWithFallback();
        const handLandmarker = await createHandLandmarkerWithFallback(filesetResolver);
        handLandmarkerRef.current = handLandmarker;
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        // Keep whiteboard usable even if camera/gesture pipeline is unavailable.
      }
    };

    void start();

    return () => {
      active = false;

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
    };
  }, [loop]);

  return { videoRef };
}
