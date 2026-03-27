---
name: form-autofill-e2e
description: 'Run extension E2E for login autofill across multiple Lalafo domains with Playwright/Puppeteer and language-agnostic assertions.'
argument-hint: 'Use when validating content-script autofill behavior in real browser with unpacked extension loaded.'
---

# Form Autofill E2E Skill

Use this skill to validate that login autofill works in a real browser with the unpacked extension loaded from `dist/`.

## Test Objectives

1. Verify content script runs on each supported domain:
   - `https://lalafo.pl/*`
   - `https://lalafo.kg/*`
   - `https://lalafo.az/*`
   - `https://lalafo.rs/*`
   - `https://lalafo.gr/*`
2. Verify credentials from `chrome.storage.local` are injected into the login form.
3. Verify selectors and assertions are language-agnostic.
4. Verify React-controlled inputs receive values (not just DOM assignment).

## Preconditions

- Run `pnpm build` successfully.
- Confirm `dist/manifest.json` exists.
- Provide test credentials in extension storage or setup message flow in test bootstrap.

## Playwright Template (Persistent Context)

```ts
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const domains = [
  'https://lalafo.pl',
  'https://lalafo.kg',
  'https://lalafo.az',
  'https://lalafo.rs',
  'https://lalafo.gr',
] as const;

test.describe('content-script autofill on lalafo regions', () => {
  for (const domain of domains) {
    test(`autofills login form on ${domain}`, async () => {
      const extensionPath = path.join(process.cwd(), 'dist');
      const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });

      const page = await context.newPage();
      await page.goto(`${domain}/`, { waitUntil: 'domcontentloaded' });

      // Navigate to login route if needed by the product.
      // await page.goto(`${domain}/login`, { waitUntil: 'networkidle' });

      const loginInput = page.locator('form input[type="email"], form input[type="text"]').first();
      const passwordInput = page.locator('form input[type="password"]').first();

      await expect(loginInput).toBeVisible();
      await expect(passwordInput).toBeVisible();

      // Wait until content script writes values.
      await expect(loginInput).not.toHaveValue('', { timeout: 10_000 });
      await expect(passwordInput).not.toHaveValue('', { timeout: 10_000 });

      await context.close();
    });
  }
});
```

## Puppeteer Alternative

```ts
import path from 'node:path';
import puppeteer from 'puppeteer';

const extensionPath = path.join(process.cwd(), 'dist');

const browser = await puppeteer.launch({
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const page = await browser.newPage();
await page.goto('https://lalafo.kg/', { waitUntil: 'domcontentloaded' });
```

## Iframe / Cross-Origin Guidance

- If login form is inside an iframe, locate correct frame by URL/origin and run assertions inside that frame.
- You cannot bypass browser origin policies from content scripts. Instead:
  - declare correct host permissions and match patterns,
  - inject into frame origins via manifest configuration when needed,
  - or test top-level login page route where form is same-origin.

## Assertion Rules

- Do not assert localized text like button labels or placeholders.
- Assert by field presence/type and resulting values.
- Add negative case: missing credentials should keep inputs unchanged and produce expected status/log.

## Reporting Template

- Domain: `<domain>`
- Extension loaded: yes/no
- Login input filled: yes/no
- Password input filled: yes/no
- Selector strategy language-agnostic: yes/no
- Notes/errors: `<details>`

