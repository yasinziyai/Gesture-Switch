# Gestivo (Electron + React + TypeScript)

اپ دسکتاپ macOS که با ژست دست یا حرکت چشم (وب‌کم) بین Desktop Spaceها جابه‌جا می‌شود.

## قابلیت فعلی
- Hand Mode: Swipe راست/چپ دست -> Desktop بعدی/قبلی
- Face Mode: حرکت صورت/نگاه راست/چپ -> Desktop بعدی/قبلی

## اجرای آفلاین (اجباری)
- اپ دیگر fallback آنلاین برای مدل‌ها ندارد.
- قبل از اجرا این فایل‌ها باید داخل پروژه موجود باشند:
  - `public/mediapipe/models/hand_landmarker.task`
  - `public/mediapipe/models/face_landmarker.task`
- در `postinstall` این کارها انجام می‌شود:
  - wasm از `node_modules/@mediapipe/tasks-vision/wasm` به `public/mediapipe/wasm` کپی می‌شود.
  - اگر مدل‌ها وجود نداشته باشند یا خراب باشند، اسکریپت تلاش می‌کند آن‌ها را از `storage.googleapis.com` دانلود و اعتبارسنجی (SHA-256) کند.
- اگر دانلود خودکار انجام نشد، این دستور را اجرا کنید:
```bash
npm run sync:mediapipe-assets
```
- اگر اینترنت ندارید، مدل‌ها را دستی دانلود و در مسیر `public/mediapipe/models/` قرار دهید.

## استک
- Electron (اپ نصبی macOS)
- React + TypeScript + Vite (رابط کاربری)
- MediaPipe Tasks Vision (تشخیص دست)

## اجرا در حالت توسعه (Bun)
```bash
bun install
bun run dev
```

## ساخت نسخه نصبی مک (DMG)
```bash
bun run dist:mac
```

خروجی در مسیر زیر ساخته می‌شود:
- `dist/` برای renderer
- `dist-electron/` برای main/preload
- `dist/*.dmg` برای نصب روی macOS

## مجوزهای لازم در macOS
1. Camera برای خود اپ
2. Accessibility برای اپ (System Settings -> Privacy & Security -> Accessibility)

بدون Accessibility، ارسال شرت‌کات سیستمی توسط AppleScript انجام نمی‌شود.

## راهنمای داخل اپ
داخل UI یک بخش «راهنمای استفاده» گذاشته شده که مراحل فعال‌سازی و troubleshooting را توضیح می‌دهد.

## ساختار مهم پروژه
- `electron/main.ts`: پنجره Electron + IPC + اجرای AppleScript
- `electron/preload.ts`: bridge امن بین renderer و main
- `src/hooks/useHandGestureTabs.ts`: pipeline تشخیص ژست
- `src/services/swipeDetector.ts`: تشخیص swipe با cooldown
- `src/services/shortcutClient.ts`: فراخوانی IPC برای شرت‌کات تب
