import type { FC } from 'react';

type Props = {
  status: string;
  message: string;
  lastGesture: string | null;
  controlMode?: string;
};

export const StatusPanel: FC<Props> = ({ status, message, lastGesture, controlMode }) => {
  return (
    <section className="panel">
      <h2>Engine Status</h2>
      <p>
        <strong>Mode:</strong> {controlMode ?? 'unknown'}
      </p>
      <p>
        <strong>State:</strong> {status}
      </p>
      <p>
        <strong>Message:</strong> {message}
      </p>
      <p>
        <strong>Last Gesture:</strong> {lastGesture ?? 'none'}
      </p>
    </section>
  );
};
