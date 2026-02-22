export type TabDirection = 'next' | 'prev';
export type ControlMode = 'hand' | 'face' | 'pointer';

export interface GestureConfig {
  windowMs: number;
  minDeltaX: number;
  cooldownMs: number;
}

export interface GestureEvent {
  direction: TabDirection;
  score: number;
  timestamp: number;
}

export interface GesturePoint {
  x: number;
  t: number;
}
