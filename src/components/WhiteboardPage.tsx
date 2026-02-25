import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useWhiteboardGestures } from "../hooks/useWhiteboardGestures";

type Tool = "pen" | "eraser";
type Point = { x: number; y: number };

const WHITEBOARD_BG = "#f9fcff";
const DEFAULT_COLOR = "#102a43";
const DEFAULT_WIDTH = 4;
const DEFAULT_ERASER = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function WhiteboardPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const gestureDrawingRef = useRef(false);
  const cursorPointRef = useRef<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const systemPointerMoveAtRef = useRef(0);
  const systemPointerLastRef = useRef<Point | null>(null);
  const toolRef = useRef<Tool>("pen");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_WIDTH);
  const [pinchActive, setPinchActive] = useState(false);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const drawSegment = useCallback(
    (from: Point, to: Point, activeTool: Tool) => {
      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }

      if (activeTool === "eraser") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = WHITEBOARD_BG;
        ctx.lineWidth = DEFAULT_ERASER;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
      }

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    },
    [color, strokeWidth]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.floor(window.innerWidth));
    const nextHeight = Math.max(1, Math.floor(window.innerHeight));
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapshotCtx = snapshot.getContext("2d");
    if (snapshotCtx && canvas.width > 0 && canvas.height > 0) {
      snapshotCtx.drawImage(canvas, 0, 0);
    }

    canvas.width = Math.floor(nextWidth * dpr);
    canvas.height = Math.floor(nextHeight * dpr);
    canvas.style.width = `${nextWidth}px`;
    canvas.style.height = `${nextHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = WHITEBOARD_BG;
    ctx.fillRect(0, 0, nextWidth, nextHeight);
    ctxRef.current = ctx;

    if (snapshot.width > 0 && snapshot.height > 0) {
      ctx.drawImage(snapshot, 0, 0, nextWidth, nextHeight);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [resizeCanvas]);

  const updateCursor = useCallback((point: Point) => {
    cursorPointRef.current = point;
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }
    cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
    cursor.style.opacity = "1";

    const now = performance.now();
    const last = systemPointerLastRef.current;
    const drift = last ? Math.hypot(point.x - last.x, point.y - last.y) : Infinity;
    if (now - systemPointerMoveAtRef.current < 24 || drift < 3.5) {
      return;
    }

    systemPointerMoveAtRef.current = now;
    systemPointerLastRef.current = point;

    if (!window.electronAPI) {
      return;
    }

    const normalizedX = clamp(point.x / Math.max(1, window.innerWidth), 0, 1);
    const normalizedY = clamp(point.y / Math.max(1, window.innerHeight), 0, 1);
    void window.electronAPI.movePointer(normalizedX, normalizedY);
  }, []);

  const clickAtPoint = useCallback((point: Point) => {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target || target === canvasRef.current) {
      return;
    }
    if (target instanceof HTMLElement) {
      target.click();
    }
  }, []);

  const onPinchStart = useCallback(
    (point: Point) => {
      setPinchActive(true);
      const target = document.elementFromPoint(point.x, point.y);
      if (target && target !== canvasRef.current) {
        if (target instanceof HTMLElement) {
          target.click();
        }
        gestureDrawingRef.current = false;
        lastPointRef.current = null;
        return;
      }

      gestureDrawingRef.current = true;
      lastPointRef.current = point;
      drawSegment(point, point, toolRef.current);
    },
    [drawSegment]
  );

  const onPinchMove = useCallback(
    (point: Point) => {
      if (!gestureDrawingRef.current) {
        return;
      }
      const prev = lastPointRef.current;
      if (!prev) {
        lastPointRef.current = point;
        return;
      }
      drawSegment(prev, point, toolRef.current);
      lastPointRef.current = point;
    },
    [drawSegment]
  );

  const onPinchEnd = useCallback(() => {
    setPinchActive(false);
    gestureDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const onIndexOnlyDwellClick = useCallback(
    (point: Point) => {
      clickAtPoint(point);
    },
    [clickAtPoint]
  );

  const { videoRef } = useWhiteboardGestures({
    onCursor: updateCursor,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    onIndexOnlyDwellClick,
  });

  const getPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== null) {
        return;
      }

      const point = getPoint(event);
      if (!point) {
        return;
      }

      activePointerIdRef.current = event.pointerId;
      drawingRef.current = true;
      lastPointRef.current = point;
      event.currentTarget.setPointerCapture(event.pointerId);
      drawSegment(point, point, toolRef.current);
    },
    [drawSegment, getPoint]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      const next = getPoint(event);
      const prev = lastPointRef.current;
      if (!next || !prev) {
        return;
      }

      drawSegment(prev, next, toolRef.current);
      lastPointRef.current = next;
    },
    [drawSegment, getPoint]
  );

  const finishStroke = useCallback((pointerId: number) => {
    if (activePointerIdRef.current !== pointerId) {
      return;
    }
    drawingRef.current = false;
    activePointerIdRef.current = null;
    lastPointRef.current = null;
  }, []);

  const clearBoard = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) {
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = WHITEBOARD_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `whiteboard-${Date.now()}.png`;
    link.click();
  }, []);

  const closeBoard = useCallback(async () => {
    if (window.electronAPI) {
      await window.electronAPI.closeWhiteboard();
      return;
    }
    window.close();
  }, []);

  return (
    <div className="whiteboard-page" dir="rtl">
      <video ref={videoRef} className="hidden-video" muted playsInline />
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishStroke(event.pointerId)}
        onPointerCancel={(event) => finishStroke(event.pointerId)}
      />

      <div
        ref={cursorRef}
        className={`whiteboard-cursor ${pinchActive ? "pinch" : ""}`}
        aria-hidden
      />

      <aside className="whiteboard-toolbar glass">
        <h2>Whiteboard</h2>
        <div className="whiteboard-tools">
          <button
            type="button"
            className={tool === "pen" ? "active" : ""}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            type="button"
            className={tool === "eraser" ? "active" : ""}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
        </div>

        {tool === "pen" ? (
          <>
            <label className="whiteboard-field">
              رنگ
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <label className="whiteboard-field">
              ضخامت
              <input
                type="range"
                min={1}
                max={18}
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
              />
            </label>
          </>
        ) : (
          <p className="whiteboard-note">Eraser size ثابت است تا پاک‌کردن سریع‌تر باشد.</p>
        )}

        <p className="whiteboard-note">
          اشاره+شصت: انتخاب/نگه‌داشتن ابزار یا شروع رسم | فقط اشاره: مکث ۵۰۰ms برای کلیک
        </p>

        <button type="button" className="whiteboard-action" onClick={clearBoard}>
          پاک کردن صفحه
        </button>
        <button type="button" className="whiteboard-action" onClick={saveBoard}>
          ذخیره PNG
        </button>
        <button type="button" className="whiteboard-action close" onClick={() => void closeBoard()}>
          بستن Whiteboard
        </button>
      </aside>
    </div>
  );
}
