import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useHandGestureTabs } from "./hooks/useHandGestureTabs";
import type { ControlMode } from "./types/gesture";
import { WhiteboardPage } from "./components/WhiteboardPage";

const SplashPage = lazy(() =>
  import("./components/SplashPage").then((module) => ({
    default: module.SplashPage,
  })),
);

type UIMode = ControlMode | "whiteboard";

const MODE_LABELS: Record<UIMode, { title: string; hint: string }> = {
  hand: {
    title: "Hand + Pointer",
    hint: "دست باز = سوایپ برای جابه جایی | فقط اشاره = حرکت موس و کلیک",
  },
  face: {
    title: "Face",
    hint: "حرکت صورت/نگاه چپ/راست برای جابه جایی دسکتاپ",
  },
  whiteboard: {
    title: "Whiteboard",
    hint: "باز کردن وایت‌بورد فول‌اسکرین با ابزار رسم",
  },
};

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.34,
      ease: EASE_OUT,
      when: "beforeChildren",
      staggerChildren: 0.065,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: EASE_OUT,
    },
  },
};

const guideListVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.08,
    },
  },
};

const guideItemVariants: Variants = {
  hidden: { opacity: 0, x: 12, filter: "blur(3px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.26,
      ease: EASE_OUT,
    },
  },
};

function ControlPanelApp() {
  const {
    videoRef,
    start,
    stop,
    status,
    message,
    setControlMode,
  } = useHandGestureTabs();
  const [selectedMode, setSelectedMode] = useState<UIMode>("hand");
  const [view, setView] = useState<"control" | "guide">("control");

  const running =
    status === "running" ||
    status === "loading-model" ||
    status === "camera-starting";
  const currentMode = useMemo(() => MODE_LABELS[selectedMode], [selectedMode]);

  const openWhiteboard = async () => {
    if (!window.electronAPI) {
      return;
    }
    await window.electronAPI.openWhiteboard();
  };

  const onSelectMode = (mode: UIMode) => {
    setSelectedMode(mode);
    if (mode === "whiteboard") {
      if (running) {
        stop();
      }
      return;
    }
    setControlMode(mode);
  };

  return (
    <motion.main
      style={{ marginTop: 20 }}
      className="shell"
      dir="rtl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <video ref={videoRef} className="hidden-video" muted playsInline />

      <motion.header className="topbar glass" variants={itemVariants}>
        <div className="brand">
          <div className="badge">
            <img src="/logo.png" alt="Gestivo logo" />
          </div>
          <div>
            <h1>Gestivo</h1>
            <p>macOS Desktop + Pointer Control</p>
          </div>
        </div>
        <div className="view-switch">
          <button
            type="button"
            className={view === "control" ? "active" : ""}
            onClick={() => setView("control")}
          >
            کنترل
          </button>
          <button
            type="button"
            className={view === "guide" ? "active" : ""}
            onClick={() => setView("guide")}
          >
            راهنما
          </button>
        </div>
      </motion.header>

      {view === "control" ? (
        <motion.section className="panel glass" variants={itemVariants}>
          <h2>انتخاب حالت</h2>
          <div className="mode-grid">
            {(["hand", "face", "whiteboard"] as UIMode[]).map((mode) => (
              <motion.button
                key={mode}
                type="button"
                className={`mode-btn ${selectedMode === mode ? "selected" : ""}`}
                onClick={() => onSelectMode(mode)}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
              >
                <span>{MODE_LABELS[mode].title}</span>
                <small>{MODE_LABELS[mode].hint}</small>
              </motion.button>
            ))}
          </div>

          <div className="power-row">
            {selectedMode === "whiteboard" ? (
              <motion.button
                type="button"
                className="power"
                onClick={() => void openWhiteboard()}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
              >
                باز کردن Whiteboard (تمام صفحه)
              </motion.button>
            ) : (
              <motion.button
                type="button"
                className="power"
                onClick={() => (running ? stop() : void start())}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
              >
                {running ? "خاموش کردن سرویس" : "روشن کردن سرویس"}
              </motion.button>
            )}
          </div>

          <motion.div
            className={`status ${status === "error" ? "error" : ""}`}
            variants={itemVariants}
          >
            <p>
              <strong>Mode:</strong> {currentMode.title}
            </p>
            <p>
              <strong>Status:</strong> {status}
            </p>
            <p className="message">
              {selectedMode === "whiteboard"
                ? "مود وایت‌بورد یک پنجره جدا و فول‌اسکرین باز می‌کند."
                : message}
            </p>
          </motion.div>
        </motion.section>
      ) : (
        <motion.section
          className="panel glass guide-page"
          variants={itemVariants}
        >
          <h2>راهنمای استفاده</h2>
          <motion.ul
            variants={guideListVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.li variants={guideItemVariants}>
              در صفحه کنترل، مود مورد نظر را انتخاب کن.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              دکمه «روشن کردن سرویس» را بزن تا دوربین در پس زمینه فعال شود.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              نمایش دوربین داخل اپ حذف شده ولی پردازش دوربین فعال می ماند.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              برای Hand/Face، جابه جایی بین Desktop Spaceها انجام می شود.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              در Hand، اگر همه انگشت ها باز باشند با سوایپ تب جابه جا می شود.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              در Hand، اگر فقط انگشت اشاره باز باشد موس حرکت می کند و با نگه
              داشتن ۱ ثانیه کلیک می زند.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              برای کارکرد کامل، Camera و Accessibility در macOS باید Allow باشد.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              با بستن پنجره، اپ در پس زمینه می ماند و از منوبار قابل بازشدن است.
            </motion.li>
            <motion.li variants={guideItemVariants}>
              در Whiteboard یک پنجره جدا و تمام‌صفحه باز می شود و سایز پنجره
              اصلی ثابت می ماند.
            </motion.li>
          </motion.ul>
        </motion.section>
      )}
    </motion.main>
  );
}

export function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  if (hash === "#splash") {
    return (
      <Suspense fallback={<main className="splash-shell" />}>
        <SplashPage />
      </Suspense>
    );
  }

  if (hash === "#whiteboard") {
    return <WhiteboardPage />;
  }

  return <ControlPanelApp />;
}
