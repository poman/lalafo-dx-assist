/* eslint-disable no-undef */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = '/var/www/lalafo-dx-assist';
const extensionPath = path.join(repoRoot, 'dist');
const domains = ['pl', 'kg', 'az', 'rs', 'gr'];

const marketData = {
  pl: {
    login: { emailOrPhone: '+48500111222', password: 'Pl_Test_123!' },
    registration: { phone: '+48500111222', password: 'Pl_Reg_123!' },
    order: { firstName: 'Jan', lastName: 'Kowalski', email: 'order.pl@lalafo.test', phone: '+48500999888' },
  },
  kg: {
    login: { emailOrPhone: '+996700111222', password: 'Kg_Test_123!' },
    registration: { phone: '+996700111222', password: 'Kg_Reg_123!' },
    order: { firstName: 'Aibek', lastName: 'Sadykov', email: 'order.kg@lalafo.test', phone: '+996700999888' },
  },
  az: {
    login: { emailOrPhone: '+994501112233', password: 'Az_Test_123!' },
    registration: { phone: '+994501112233', password: 'Az_Reg_123!' },
    order: { firstName: 'Elvin', lastName: 'Mammadov', email: 'order.az@lalafo.test', phone: '+994509998877' },
  },
  rs: {
    login: { emailOrPhone: '+381601112233', password: 'Rs_Test_123!' },
    registration: { phone: '+381601112233', password: 'Rs_Reg_123!' },
    order: { firstName: 'Milan', lastName: 'Petrovic', email: 'order.rs@lalafo.test', phone: '+381609998877' },
  },
  gr: {
    login: { emailOrPhone: '+306901112233', password: 'Gr_Test_123!' },
    registration: { phone: '+306901112233', password: 'Gr_Reg_123!' },
    order: { firstName: 'Nikos', lastName: 'Papadopoulos', email: 'order.gr@lalafo.test', phone: '+306909998877' },
  },
};

const scenarioMap = {
  login: {
    presetName: 'Customer: John (Phone)',
    path: '/qa-e2e/login',
    html: `<!doctype html>
<html>
  <body>
    <form id="login-form">
      <input id="identifier" type="text" />
      <input id="password" type="password" />
    </form>
    <script>
      window.__events = [];
      const id = document.getElementById('identifier');
      const pass = document.getElementById('password');
      id.addEventListener('input', () => window.__events.push({ id: 'identifier', type: 'input', value: id.value }));
      pass.addEventListener('input', () => window.__events.push({ id: 'password', type: 'input', value: pass.value }));
    </script>
  </body>
</html>`,
    verify: async (page, data) =>
      page.evaluate((expected) => {
        const identifier = document.querySelector('#identifier');
        const password = document.querySelector('#password');
        const events = window.__events || [];
        return {
          identifierValue: identifier?.value ?? null,
          passwordValue: password?.value ?? null,
          inputEventCount: events.filter((item) => item.type === 'input').length,
          ok:
            identifier?.value === expected.login.emailOrPhone &&
            password?.value === expected.login.password &&
            events.filter((item) => item.type === 'input').length >= 2,
        };
      }, data),
  },
  registration: {
    presetName: 'New Customer (Standard)',
    path: '/qa-e2e/registration',
    html: `<!doctype html>
<html>
  <body>
    <form id="registration-form">
      <input id="phone" type="tel" />
      <input id="password" type="password" />
      <input id="accept" type="checkbox" />
    </form>
    <script>
      window.__events = [];
      const phone = document.getElementById('phone');
      const pass = document.getElementById('password');
      const accept = document.getElementById('accept');
      phone.addEventListener('input', () => window.__events.push({ id: 'phone', type: 'input', value: phone.value }));
      pass.addEventListener('input', () => window.__events.push({ id: 'password', type: 'input', value: pass.value }));
      accept.addEventListener('change', () => window.__events.push({ id: 'accept', type: 'change', checked: accept.checked }));
    </script>
  </body>
</html>`,
    verify: async (page, data) =>
      page.evaluate((expected) => {
        const phone = document.querySelector('#phone');
        const password = document.querySelector('#password');
        const accept = document.querySelector('#accept');
        const events = window.__events || [];
        return {
          phoneValue: phone?.value ?? null,
          passwordValue: password?.value ?? null,
          acceptChecked: accept?.checked ?? false,
          inputEventCount: events.filter((item) => item.type === 'input').length,
          changeEventCount: events.filter((item) => item.type === 'change').length,
          ok:
            phone?.value === expected.registration.phone &&
            password?.value === expected.registration.password &&
            accept?.checked === true &&
            events.filter((item) => item.type === 'input').length >= 2 &&
            events.filter((item) => item.type === 'change').length >= 1,
        };
      }, data),
  },
  checkout: {
    presetName: 'Standard Order (John Doe)',
    path: '/qa-e2e/checkout',
    html: `<!doctype html>
<html>
  <body>
    <main>
      <section data-testid="checkout-container">
        <div class="checkout-row"><input id="first-name" type="text" /></div>
        <div class="checkout-row"><input id="last-name" type="text" /></div>
        <div class="checkout-row"><input id="email" type="text" /></div>
        <div class="checkout-row"><input id="phone" type="tel" /></div>
      </section>
    </main>
    <script>
      window.__events = [];
      ['first-name', 'last-name', 'email', 'phone'].forEach((id) => {
        const node = document.getElementById(id);
        node.addEventListener('input', () => window.__events.push({ id, type: 'input', value: node.value }));
      });
    </script>
  </body>
</html>`,
    verify: async (page, data) =>
      page.evaluate((expected) => {
        const firstName = document.querySelector('#first-name');
        const lastName = document.querySelector('#last-name');
        const email = document.querySelector('#email');
        const phone = document.querySelector('#phone');
        const events = window.__events || [];
        return {
          firstNameValue: firstName?.value ?? null,
          lastNameValue: lastName?.value ?? null,
          emailValue: email?.value ?? null,
          phoneValue: phone?.value ?? null,
          inputEventCount: events.filter((item) => item.type === 'input').length,
          ok:
            firstName?.value === expected.order.firstName &&
            lastName?.value === expected.order.lastName &&
            email?.value === expected.order.email &&
            phone?.value === expected.order.phone &&
            events.filter((item) => item.type === 'input').length >= 4,
        };
      }, data),
  },
};

const scenarios = ['login', 'registration', 'checkout'];

const readExtensionIdFromPreferences = async (userDataDir) => {
  const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
  let raw;
  try {
    raw = await fs.readFile(preferencesPath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = JSON.parse(raw);
  const settings = parsed?.extensions?.settings;

  if (!settings || typeof settings !== 'object') {
    return null;
  }

  for (const [id, value] of Object.entries(settings)) {
    const absolutePath = value?.path;
    if (typeof absolutePath === 'string' && path.resolve(absolutePath) === path.resolve(extensionPath)) {
      return id;
    }
  }

  return null;
};

const waitForExtensionId = async (context, userDataDir) => {
  let [serviceWorker] = context.serviceWorkers();

  if (!serviceWorker) {
    try {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
    } catch {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const fromPreferences = await readExtensionIdFromPreferences(userDataDir);
        if (fromPreferences) {
          return fromPreferences;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      throw new Error('Could not resolve extension ID from service worker or Chromium preferences.');
    }
  }

  const swUrl = serviceWorker.url();
  const id = swUrl.split('/')[2];
  if (!id) {
    throw new Error(`Cannot resolve extension id from service worker URL: ${swUrl}`);
  }

  return id;
};

const clickPopupPreset = async (popupPage, presetName) => {
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.waitForSelector('button[role="tab"]', { timeout: 15000 });

  const switched = await popupPage.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
    const fillTab = tabs.find((button) => button.textContent?.trim().toLowerCase() === 'fill form');
    if (!fillTab) {
      return false;
    }

    fillTab.click();
    return true;
  });

  if (!switched) {
    throw new Error('Could not switch popup to Fill form tab');
  }

  await popupPage.waitForTimeout(300);

  const clicked = await popupPage.evaluate((name) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const preset = buttons.find((button) => button.textContent?.includes(name));
    if (!preset) {
      return false;
    }

    preset.click();
    return true;
  }, presetName);

  if (!clicked) {
    throw new Error(`Could not find preset button: ${presetName}`);
  }

  await popupPage.waitForFunction(() => {
    const statusNode = document.querySelector('.status-text');
    const text = statusNode?.textContent?.trim() ?? '';
    return text.startsWith('Status: success') || text.startsWith('Status: failure') || text.startsWith('Status: restricted');
  }, undefined, { timeout: 15000 });

  const popupStatus = await popupPage.evaluate(() => {
    const statusNodes = Array.from(document.querySelectorAll('.status-text'));
    return statusNodes.map((node) => node.textContent?.trim()).filter(Boolean);
  });

  return popupStatus;
};

const run = async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lalafo-dx-assist-e2e-'));
  const results = [];
  let context;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: process.env.CHROME_BIN,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    const bootPage = await context.newPage();
    await bootPage.goto('about:blank', { waitUntil: 'domcontentloaded' });

    const extensionId = await waitForExtensionId(context, userDataDir);
    await bootPage.close();
    for (const domain of domains) {
      for (const scenario of scenarios) {
        const setup = scenarioMap[scenario];
        const url = `https://lalafo.${domain}${setup.path}`;
        const page = await context.newPage();

        await page.route('**/*', async (route) => {
          if (route.request().isNavigationRequest()) {
            await route.fulfill({
              status: 200,
              contentType: 'text/html',
              body: setup.html,
            });
            return;
          }

          await route.fulfill({ status: 204, body: '' });
        });

        const entry = {
          domain: `lalafo.${domain}`,
          scenario,
          url,
          popupStatus: [],
          verify: null,
          pass: false,
          error: null,
        };

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' });

          const popupPage = await context.newPage();
          await popupPage.addInitScript((targetUrl) => {
            const originalQuery = chrome.tabs.query.bind(chrome.tabs);
            chrome.tabs.query = async () => {
              const tabs = await originalQuery({ currentWindow: true });
              const match = tabs.find(
                (tab) => typeof tab.url === 'string' && tab.url === targetUrl,
              );

              return match ? [match] : [];
            };
          }, url);

          await popupPage.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: 'domcontentloaded' });
          entry.popupStatus = await clickPopupPreset(popupPage, setup.presetName);
          entry.verify = await setup.verify(page, marketData[domain]);
          entry.pass = Boolean(entry.verify?.ok);

          await popupPage.close();
        } catch (error) {
          entry.error = error instanceof Error ? error.message : String(error);
        }

        results.push(entry);
        await page.close();
      }
    }

    const failed = results.filter((result) => !result.pass);
    const report = {
      timestamp: new Date().toISOString(),
      extensionPath,
      results,
      passed: failed.length === 0,
      failedCount: failed.length,
    };

    console.log(JSON.stringify(report, null, 2));

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (context) {
      await context.close();
    }

    await fs.rm(userDataDir, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});










