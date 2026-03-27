import { describe, expect, it, vi } from 'vitest';
import {
  getQaDarkModeEnabled,
  setQaDarkModeEnabled,
  syncQaDarkModeWithActiveTab,
  toggleQaDarkMode,
  type IChromeApi,
} from './qaDarkMode';
import {
  QA_DARK_MODE_CSS_FILE,
  QA_DARK_MODE_MARKER_ATTRIBUTE,
  QA_DARK_MODE_STORAGE_KEY,
} from '../shared/constants';

const createApi = (overrides?: Partial<IChromeApi>): IChromeApi => {
  const storageState: Record<string, unknown> = {};
  const markerByTab = new Map<number, boolean>();

  const api: IChromeApi = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            result[key] = storageState[key];
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageState, items);
        }),
      },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 999, url: 'https://lalafo.pl' } as chrome.tabs.Tab]),
    },
    scripting: {
      insertCSS: vi.fn(async () => {}),
      removeCSS: vi.fn(async () => {}),
      executeScript: vi.fn(async (injection) => {
        const tabId = injection.target.tabId;

        if (!Array.isArray(injection.args) || typeof tabId !== 'number') {
          return [{ result: undefined }];
        }

        if (
          injection.args.length === 1 &&
          injection.args[0] === QA_DARK_MODE_MARKER_ATTRIBUTE
        ) {
          return [{ result: markerByTab.get(tabId) === true }];
        }

        if (
          injection.args.length === 2 &&
          injection.args[0] === QA_DARK_MODE_MARKER_ATTRIBUTE &&
          typeof injection.args[1] === 'boolean'
        ) {
          markerByTab.set(tabId, injection.args[1]);
          return [{ result: undefined }];
        }

        return [{ result: undefined }];
      }),
    },
  };

  if (!overrides) {
    return api;
  }

  return {
    ...api,
    ...overrides,
    storage: overrides.storage ?? api.storage,
    tabs: overrides.tabs ?? api.tabs,
    scripting: overrides.scripting ?? api.scripting,
  };
};

describe('qaDarkMode logic', () => {
  it('loads false when storage key is missing', async () => {
    const api = createApi();

    const result = await getQaDarkModeEnabled(api);

    expect(result).toBe(false);
  });

  it('persists true in storage', async () => {
    const api = createApi();

    await setQaDarkModeEnabled(true, api);

    expect(api.storage.local.set).toHaveBeenCalledWith({
      [QA_DARK_MODE_STORAGE_KEY]: true,
    });
  });

  it('enables dark mode and injects css', async () => {
    const api = createApi();

    const result = await toggleQaDarkMode(true, api);

    expect(result).toEqual({ enabled: true, appliedToTab: true });
    expect(api.scripting.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 999 },
      files: [QA_DARK_MODE_CSS_FILE],
    });
    expect(api.scripting.removeCSS).not.toHaveBeenCalled();
  });

  it('disables dark mode and removes css', async () => {
    const api = createApi();

    const result = await toggleQaDarkMode(false, api);

    expect(result).toEqual({ enabled: false, appliedToTab: true });
    expect(api.scripting.removeCSS).toHaveBeenCalledWith({
      target: { tabId: 999 },
      files: [QA_DARK_MODE_CSS_FILE],
    });
    expect(api.scripting.insertCSS).not.toHaveBeenCalled();
  });

  it('persists state even when active tab is missing', async () => {
    const api = createApi({
      tabs: {
        query: vi.fn(async () => []),
      },
    });

    const result = await toggleQaDarkMode(true, api);

    expect(result).toEqual({
      enabled: true,
      appliedToTab: false,
      warning: 'State saved, but no active tab was available.',
    });
    expect(api.storage.local.set).toHaveBeenCalledWith({
      [QA_DARK_MODE_STORAGE_KEY]: true,
    });
  });

  it('does not throw when insert css fails and keeps stored state', async () => {
    const api = createApi({
      scripting: {
        insertCSS: vi.fn(async () => {
          throw new Error('injection denied');
        }),
        removeCSS: vi.fn(async () => {}),
      },
    });

    const result = await toggleQaDarkMode(true, api);

    expect(result).toEqual({
      enabled: true,
      appliedToTab: false,
      warning: 'State saved, but this page does not allow CSS injection.',
    });
    expect(api.storage.local.set).toHaveBeenCalledWith({
      [QA_DARK_MODE_STORAGE_KEY]: true,
    });
  });

  it('syncs active tab with stored disabled state by removing css', async () => {
    const api = createApi();
    await api.storage.local.set({ [QA_DARK_MODE_STORAGE_KEY]: false });

    const result = await syncQaDarkModeWithActiveTab(api);

    expect(result).toEqual({ enabled: false, appliedToTab: true });
    expect(api.scripting.removeCSS).toHaveBeenCalledWith({
      target: { tabId: 999 },
      files: [QA_DARK_MODE_CSS_FILE],
    });
    expect(api.scripting.insertCSS).not.toHaveBeenCalled();
  });

  it('syncs active tab with stored enabled state by applying css', async () => {
    const api = createApi();
    await api.storage.local.set({ [QA_DARK_MODE_STORAGE_KEY]: true });

    const result = await syncQaDarkModeWithActiveTab(api);

    expect(result).toEqual({ enabled: true, appliedToTab: true });
    expect(api.scripting.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 999 },
      files: [QA_DARK_MODE_CSS_FILE],
    });
  });

  it('does not apply styles on unsupported domains', async () => {
    const api = createApi({
      tabs: {
        query: vi.fn(async () => [{ id: 999, url: 'https://example.com' } as chrome.tabs.Tab]),
      },
    });

    const result = await syncQaDarkModeWithActiveTab(api);

    expect(result).toEqual({
      enabled: false,
      appliedToTab: false,
      warning: 'QA Dark Mode works only on lalafo.pl/.kg/.az/.rs/.gr domains.',
    });
    expect(api.scripting.insertCSS).not.toHaveBeenCalled();
    expect(api.scripting.removeCSS).not.toHaveBeenCalled();
  });
});


