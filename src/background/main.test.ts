import { beforeEach, describe, expect, it, vi } from 'vitest';

interface IChromeMockOptions {
  badgeBgError?: Error;
}

const installChromeMock = (options: IChromeMockOptions = {}): void => {
  const setBadgeBackgroundColor = vi.fn(async () => {
    if (options.badgeBgError) {
      throw options.badgeBgError;
    }
  });

  const setBadgeText = vi.fn(async () => {});

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
      onChanged: {
        addListener: vi.fn(),
      },
    },
    action: {
      setBadgeBackgroundColor,
      setBadgeText,
    },
    tabs: {
      sendMessage: vi.fn(),
      query: vi.fn(async () => []),
      onUpdated: {
        addListener: vi.fn(),
      },
      onRemoved: {
        addListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: vi.fn(async () => []),
      insertCSS: vi.fn(async () => {}),
      removeCSS: vi.fn(async () => {}),
    },
    runtime: {
      getManifest: vi.fn(() => ({ content_scripts: [{ js: ['content.js'] }] })),
      onInstalled: {
        addListener: vi.fn(),
      },
    },
  };
};

describe('safeRefreshBadgeForTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    (globalThis as { chrome?: unknown }).chrome = undefined;
  });

  it('ignores expected "No tab with id" errors', async () => {
    installChromeMock({ badgeBgError: new Error('No tab with id: 42.') });

    const module = await import('./main');

    await expect(module.safeRefreshBadgeForTab(42)).resolves.toBeUndefined();
  });

  it('rethrows unexpected badge update errors', async () => {
    installChromeMock({ badgeBgError: new Error('Random action API failure') });

    const module = await import('./main');

    await expect(module.safeRefreshBadgeForTab(7)).rejects.toThrow('Random action API failure');
  });
});

