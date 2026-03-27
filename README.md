# lalafo-dx-assist

Chrome Extension (Manifest V3, React, TypeScript) for QA and developer workflows on Lalafo regional domains.

## Features

- `Main` tab (grouped by feature):
  - `Dark mode`: `Enable QA Dark Mode`
  - `Accessibility Testing`:
    - `Enable auto Accessibility checks`
    - `Show highlights` (default: off)
      - toggling ON/OFF re-runs scan and keeps issue results/count in sync
      - when enabled, highlights are shown on supported page navigations
  - `SEO analyzer`: `Enable auto SEO checks`
- `Accessibility` tab:
  - WCAG scan via `axe-core`
  - issue list with severity, rule id, node count, and docs link
  - issue navigation (`Previous` / `Next`)
  - optional `Blink and scroll to rule on click`
  - focus fallback: when global highlights are off, clicking an issue can still highlight/focus that rule
- `SEO` tab:
  - live report stream from active tab
  - title/description/canonical/H1/OG checks
  - web vitals (`LCP`, `CLS`, `INP`) and analyzer issues
- `Fill form` tab (shown as the last tab):
  - grouped presets: `Login`, `Register`, `Checkout`, `Custom`
  - create/edit/delete presets with per-market persistence
  - autofill dispatch to active tab with React-safe value setter + events
- Header `Info` icon:
  - opens `About` modal with project overview
  - repository link and author profile link

## About

- Repository: `https://github.com/poman/lalafo-dx-assist`
- Developed by: [Roman Kukla](https://linkedin.com/in/romankukla)

## Supported domains

- `lalafo.pl`
- `lalafo.kg`
- `lalafo.az`
- `lalafo.rs`
- `lalafo.gr`

The extension manifest includes both root and wildcard host patterns for each domain in `host_permissions` and `content_scripts.matches`.

## Project scripts

- `pnpm dev` - run Vite in dev mode
- `pnpm build` - build extension to `dist/`
- `pnpm lint` - run ESLint
- `pnpm test` - run unit tests (Vitest)
- `pnpm test:watch` - run tests in watch mode

## Local setup

```bash
pnpm install
pnpm build
```

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked` and choose `dist/`.
4. Open any supported Lalafo page.
5. Click the extension icon to use `Main`, `Accessibility`, `SEO`, and `Fill form` tools.

## Accessibility workflow

1. Open popup and switch to `Accessibility`.
2. Click `Run scan`.
3. Review `Found rules` list.
4. Click an issue to focus corresponding element on page.
5. Use `Previous issue` / `Next issue` to continue audit.
6. Control global highlights from `Main` -> `Accessibility Testing` -> `Show highlights`.

## Troubleshooting

- If a fresh build is not reflected, run:

```bash
pnpm build
```

Then reload the extension in `chrome://extensions`.

- `Accessibility` actions work only on regular web pages (`http/https`) where content scripts can run.
- If scan/highlight controls do not react, refresh target tab and reopen popup.

## Key files

- `manifest.config.ts` - MV3 manifest config, permissions, and content script matches.
- `src/popup/App.tsx` - popup UI (`Main`, `Accessibility`, `SEO`, `Fill form`, `About`).
- `src/background/main.ts` - auto scans, tab update handling, badge synchronization.
- `src/content/a11yScanner.ts` - axe scan + highlight overlay implementation.
- `src/popup/a11yScanner.ts` - popup bridge for scan/highlight/focus actions.
- `src/popup/formTemplates.ts` - preset model and storage normalization.
- `src/popup/formFiller.ts` - popup-to-content autofill orchestration.
- `src/content/formFiller.ts` - page-side fill logic.
- `src/shared/types/messages.ts` - typed runtime message contracts.
