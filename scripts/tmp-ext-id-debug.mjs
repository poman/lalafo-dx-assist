/* eslint-disable no-undef */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const extensionPath = '/var/www/lalafo-dx-assist/dist';

const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ext-id-debug-'));
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

  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    const managerRoot = manager?.shadowRoot;
    const itemList = managerRoot?.querySelector('extensions-item-list');
    const itemListRoot = itemList?.shadowRoot;
    const items = itemListRoot ? Array.from(itemListRoot.querySelectorAll('extensions-item')) : [];

    return items.map((item) => {
      const itemRoot = item.shadowRoot;
      const idNode = itemRoot?.querySelector('#extension-id');
      const nameNode = itemRoot?.querySelector('#name');
      return {
        idAttr: item.getAttribute('id'),
        idText: idNode?.textContent?.trim() ?? null,
        name: nameNode?.textContent?.trim() ?? null,
      };
    });
  });

  console.log(JSON.stringify({ serviceWorkers: context.serviceWorkers().map((w) => w.url()), data }, null, 2));
} finally {
  if (context) {
    await context.close();
  }
  await fs.rm(userDataDir, { recursive: true, force: true });
}




