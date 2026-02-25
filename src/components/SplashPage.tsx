import { useEffect } from "react";

export function SplashPage() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.hash === "#splash") {
        window.location.hash = "";
      }
    }, 1600);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="splash-shell" dir="rtl">
      <section className="splash-card glass">
        <div className="splash-scene" aria-hidden>
          <div className="splash-orbit orbit-a" />
          <div className="splash-orbit orbit-b" />
          <div className="splash-orbit orbit-c" />
          <div className="splash-core">
            <span />
          </div>
          <div className="splash-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <h1>Gestivo</h1>
        <p>Gesture Engine آماده‌سازی می‌شود...</p>
      </section>
    </main>
  );
}
