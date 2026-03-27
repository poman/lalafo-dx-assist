# Agent Guidelines

This codebase is a React + TypeScript Chrome Extension (Manifest V3) built with Vite (e.g., using CRXJS). It uses styled-components, Jotai (for local UI state), and i18next. Follow existing patterns and keep changes consistent with Chrome Extension architecture boundaries.

**Common Commands**
1. `pnpm dev` for local dev with HMR (Do not rely on this for full E2E, use build).
2. `pnpm build` to compile the unpacked extension into the `dist/` folder.
3. `pnpm lint` for linting.
4. `pnpm test` for unit tests (Vitest) using mocked Chrome APIs.

**Project Structure & Architecture Limits**
1. `src/popup`, `src/options`, `src/sidepanel`: React UI entry points.
2. `src/content`: Content Scripts injected into host pages. Must not import Node.js or DOM-incompatible libraries.
3. `src/background`: Service Worker. Sleeps when inactive. **No DOM access. No `localStorage`.**
4. `src/shared/ui`, `src/shared/utils`, `src/shared/api`: Reusable code.

**Multi-Region Support (CRITICAL)**
1. The extension operates across 5 different regional domains: `lalafo.pl`, `lalafo.kg`, `lalafo.az`, `lalafo.rs`, `lalafo.gr`.
2. **Language-Agnostic Selectors**: You MUST NOT use text-based or locale-dependent selectors (e.g., `[placeholder="Email или телефон"]`). They will break on different regional sites. Use `[type="email"]`, `[type="password"]`, `[name="..."]`, or structural/parent relationships.
3. `manifest.json` MUST explicitly include all 5 domains in both `host_permissions` (`https://*.lalafo.kg/*` etc.) and `content_scripts.matches` (`https://lalafo.kg/*` etc.).

**File Organization**
1. Prefer colocated files: `Component.tsx`, `Component.types.ts`, `Component.styled.tsx`, `helpers.ts`.
2. Content scripts and background workers communicate EXCLUSIVELY via strongly typed `chrome.runtime.sendMessage`.

**Imports**
1. Use relative imports within a module/component.
2. If a relative import traverses more than two parent levels, use absolute aliases (`@shared/*`, `@content/*`, `@background/*`).

**Variable and Constants Naming**
1. For booleans, prefer `is*` or `has*` prefixes.
2. Exceptions: native HTML/DOM attributes (`disabled`, `checked`).

**Component Props & Hook Order**
1. Value props first, then method props.
2. Inside components: `useTheme`/`useTranslation` -> `useState`/`useAtom` -> custom hooks -> `useCallback`/`useMemo` -> `useEffect`.
3. Ensure all dependencies are declared before passing them into hooks.

**Methods Naming**
1. Component props for handlers must start with `on` (`onClickFill`, `onCheckWCAG`).
2. Internal handler names should start with `handle` (`handleFormFill`, `handleMessage`).

**Types and Interfaces**
1. Interfaces use the `I` prefix (`IProfile`, `IMessagePayload`).
2. Message passing types must be defined in `src/shared/types/messages.ts` to ensure Background and Content scripts share the same contract.

**Styled Components & CSS**
1. Styled components inside a regular UI (Popup/Options) start with `S` (`SContainer`).
2. **CRITICAL for Content Scripts**: When injecting UI into the host page, styles MUST be isolated (e.g., using Shadow DOM or strict CSS modules) so they do not conflict with the host site's CSS.

**Storage (`chrome.storage`)**
1. Do NOT use `localStorage` or IndexedDB.
2. Use `chrome.storage.local` for extension state and `chrome.storage.sync` for user preferences.
3. Wrap storage calls in async utility functions in `src/shared/utils/storage.ts`.

---

## App Environment (Chrome Extension)
- **Target Host URLs**: `https://lalafo.pl/*`, `https://lalafo.kg/*`, `https://lalafo.az/*`, `https://lalafo.rs/*`, `https://lalafo.gr/*`.
- **Extension Output**: The compiled extension lives in the `dist/` directory.
- **Service Worker Lifecycle**: The background script terminates after ~30 seconds of inactivity. Do not rely on global variables for state in `background.ts`. Always read/write to `chrome.storage`.

## Browser Testing (Playwright / Puppeteer)
- Standard web testing does not work. You MUST launch the browser with the unpacked extension loaded.
- Use args: `--disable-extensions-except=./dist` and `--load-extension=./dist`.
- **Content Script Testing**: Navigate to the target host URL (e.g., Lalafo login page of any supported region) and verify the content script executes.
- **Popup Testing**: Navigate to `chrome-extension://<EXTENSION_ID>/popup/index.html` to test UI in isolation.

### Browser Testing & DOM Gotchas (CRITICAL)
1. **React Input Filling**: Simply changing `input.value = 'test'` **WILL NOT WORK** on React-controlled forms (like Lalafo). You MUST use native value setters and dispatch events.
   *Pattern to use in evaluate_script or Content Scripts:*
   ```javascript
   const input = document.querySelector('input[type="password"]');
   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
   nativeInputValueSetter.call(input, 'myPassword123');
   input.dispatchEvent(new Event('input', { bubbles: true }));
