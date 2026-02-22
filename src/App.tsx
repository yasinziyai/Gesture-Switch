import { useMemo, useState } from 'react';
import { useHandGestureTabs } from './hooks/useHandGestureTabs';
import type { ControlMode } from './types/gesture';

const MODE_LABELS: Record<ControlMode, { title: string; hint: string }> = {
  hand: {
    title: 'Hand',
    hint: 'سوایپ دست چپ/راست برای جابه جایی دسکتاپ'
  },
  face: {
    title: 'Face',
    hint: 'حرکت صورت/نگاه چپ/راست برای جابه جایی دسکتاپ'
  },
  pointer: {
    title: 'Pointer',
    hint: 'نوک اشاره = حرکت موس | خم شدن اشاره = کلیک'
  }
};

export function App() {
  const { videoRef, start, stop, status, message, controlMode, setControlMode } = useHandGestureTabs();
  const [view, setView] = useState<'control' | 'guide'>('control');

  const running = status === 'running' || status === 'loading-model' || status === 'camera-starting';
  const currentMode = useMemo(() => MODE_LABELS[controlMode], [controlMode]);

  return (
    <main style={{marginTop: 20}} className="shell" dir="rtl">
      <video ref={videoRef} className="hidden-video" muted playsInline />

      <header className="topbar glass">
        <div  className="brand">
          <div className="badge">GS</div>
          <div >
            <h1>Gesture Switch</h1>
            <p>macOS Desktop + Pointer Control</p>
          </div>
        </div>
        <div className="view-switch">
          <button type="button" className={view === 'control' ? 'active' : ''} onClick={() => setView('control')}>
            کنترل
          </button>
          <button type="button" className={view === 'guide' ? 'active' : ''} onClick={() => setView('guide')}>
            راهنما
          </button>
        </div>
      </header>

      {view === 'control' ? (
        <section className="panel glass">
          <h2>انتخاب حالت</h2>
          <div className="mode-grid">
            {(['hand', 'face', 'pointer'] as ControlMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`mode-btn ${controlMode === mode ? 'selected' : ''}`}
                onClick={() => setControlMode(mode)}
              >
                <span>{MODE_LABELS[mode].title}</span>
                <small>{MODE_LABELS[mode].hint}</small>
              </button>
            ))}
          </div>

          <div className="power-row">
            <button type="button" className="power" onClick={() => (running ? stop() : void start())}>
              {running ? 'خاموش کردن سرویس' : 'روشن کردن سرویس'}
            </button>
          </div>

          <div className={`status ${status === 'error' ? 'error' : ''}`}>
            <p>
              <strong>Mode:</strong> {currentMode.title}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p className="message">{message}</p>
          </div>
        </section>
      ) : (
        <section className="panel glass guide-page">
          <h2>راهنمای استفاده</h2>
          <ul>
            <li>در صفحه کنترل، مود مورد نظر را انتخاب کن.</li>
            <li>دکمه «روشن کردن سرویس» را بزن تا دوربین در پس زمینه فعال شود.</li>
            <li>نمایش دوربین داخل اپ حذف شده ولی پردازش دوربین فعال می ماند.</li>
            <li>برای Hand/Face، جابه جایی بین Desktop Spaceها انجام می شود.</li>
            <li>در Pointer، نوک اشاره موس را حرکت می دهد و خم شدن اشاره کلیک می زند.</li>
            <li>برای کارکرد کامل، Camera و Accessibility در macOS باید Allow باشد.</li>
            <li>با بستن پنجره، اپ در پس زمینه می ماند و از منوبار قابل بازشدن است.</li>
          </ul>
        </section>
      )}
    </main>
  );
}
