# lalafo-dx-assist

Chrome Extension (Manifest V3, React, TypeScript) for QA and developer workflows on Lalafo regional domains.

## Features

- `Main` tab:
  - `QA Dark Mode` toggle (`Enable QA Dark Mode`)
  - persistent state in `chrome.storage.local`
  - CSS apply/remove on active tab via `chrome.scripting.insertCSS` / `chrome.scripting.removeCSS`
- `Fill form` tab:
  - grouped presets: `Login`, `Register`, `Checkout`, `Custom`
  - create/edit/delete presets with per-market persistence
  - autofill dispatch to active tab with React-safe input events
- `Accessibility` tab:
  - WCAG scan via `axe-core`
  - visual highlighter overlay (isolated host + `Shadow DOM`)
  - severity colors, clickable rule list, official docs links
  - optional blink-and-scroll focus on selected issue
  - saved last scan results and issue navigation (`Previous` / `Next`)

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
5. Click the extension icon to use `Main`, `Fill form`, or `Accessibility` tools.

## Accessibility workflow

1. Open the popup and switch to `Accessibility`.
2. Click `Run scan`.
3. Review `Found rules` list (impact, rule id, description, node count).
4. Click a rule to focus it on the page (blink + scroll if enabled).
5. Use `Previous issue` / `Next issue` to continue audit.

## Troubleshooting

- If a fresh build is not reflected, run:

```bash
pnpm build
```

Then reload the extension in `chrome://extensions`.

- If scan/highlight controls do not react, refresh the target tab and re-open popup.
- `Accessibility` actions work on regular web pages (`http/https`) where content scripts can run.

## Key files

- `manifest.config.ts` - MV3 manifest config, permissions, and content script matches.
- `src/popup/App.tsx` - popup UI for all tabs (`Main`, `Fill form`, `Accessibility`, `SEO`).
- `src/popup/formTemplates.ts` - preset model and storage normalization.
- `src/popup/formFiller.ts` - popup-to-content autofill orchestration.
- `src/content/formFiller.ts` - page-side fill logic.
- `src/content/a11yScanner.ts` - axe scan + highlight overlay implementation.
- `src/popup/a11yScanner.ts` - popup bridge for scan/highlight/focus actions.
- `src/shared/types/messages.ts` - typed runtime message contracts.
