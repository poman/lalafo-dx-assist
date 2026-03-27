# lalafo-dx-assist

Chrome Extension (Manifest V3, React, TypeScript) for QA and developer workflows on Lalafo regional domains.

## Implemented now

- `QA Dark Mode` popup toggle (`Enable QA Dark Mode`).
- Persisted state in `chrome.storage.local` (`qaDarkModeEnabled`).
- CSS apply/remove on active tab via `chrome.scripting.insertCSS` / `chrome.scripting.removeCSS`.
- QA auditor CSS for inline hardcoded white backgrounds (red outline).

## Supported domains

- `lalafo.pl`
- `lalafo.kg`
- `lalafo.az`
- `lalafo.rs`
- `lalafo.gr`

## Project scripts

- `pnpm dev` - run Vite in dev mode
- `pnpm build` - build extension to `dist/`
- `pnpm lint` - run ESLint
- `pnpm test` - run unit tests (Vitest)

## Local run

1. Install dependencies and build:

```bash
pnpm install
pnpm build
```

2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked` and select `dist/`.
5. Open any supported Lalafo domain, click the extension icon, and toggle `Enable QA Dark Mode`.

## Key files

- `manifest.config.ts` - MV3 manifest config and permissions.
- `src/popup/App.tsx` - popup UI and toggle behavior.
- `src/popup/qaDarkMode.ts` - storage and scripting API orchestration.
- `public/qa-dark-mode.css` - inversion + QA highlighting CSS.
- `src/popup/qaDarkMode.test.ts` - unit tests for dark mode logic.
