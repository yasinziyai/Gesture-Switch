import type { GestureConfig, GestureEvent, GesturePoint } from '../types/gesture';

const DEFAULT_CONFIG: GestureConfig = {
  windowMs: 260,
  minDeltaX: 0.1,
  cooldownMs: 800
};

export class SwipeDetector {
  private readonly config: GestureConfig;
  private points: GesturePoint[] = [];
  private lastTriggerAt = 0;

  constructor(config?: Partial<GestureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  push(x: number, t: number): GestureEvent | null {
    this.points.push({ x, t });
    this.points = this.points.filter((point) => t - point.t <= this.config.windowMs);

    if (this.points.length < 4) {
      return null;
    }

    if (t - this.lastTriggerAt < this.config.cooldownMs) {
      return null;
    }

    const start = this.points[0];
    const end = this.points[this.points.length - 1];
    if (!start || !end) {
      return null;
    }

    const deltaX = end.x - start.x;

    if (Math.abs(deltaX) < this.config.minDeltaX) {
      return null;
    }

    this.lastTriggerAt = t;
    this.points = [];

    return {
      direction: deltaX > 0 ? 'next' : 'prev',
      score: Math.min(Math.abs(deltaX) / this.config.minDeltaX, 1.8),
      timestamp: t
    };
  }
}
