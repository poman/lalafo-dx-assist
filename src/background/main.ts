import {
  QA_DARK_MODE_CSS_FILE,
  QA_DARK_MODE_MARKER_ATTRIBUTE,
  QA_DARK_MODE_STORAGE_KEY,
  SUPPORTED_LALAFO_HOSTS,
} from '../shared/constants';

const isSupportedLalafoUrl = (url: string | undefined): boolean => {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return SUPPORTED_LALAFO_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
};

const isQaDarkModeEnabled = async (): Promise<boolean> => {
  const data = await chrome.storage.local.get([QA_DARK_MODE_STORAGE_KEY]);
  return data[QA_DARK_MODE_STORAGE_KEY] === true;
};

const isDarkModeMarkedOnTab = async (tabId: number): Promise<boolean> => {
  const results = await chrome.scripting.executeScript<[string], boolean>({
    target: { tabId },
    args: [QA_DARK_MODE_MARKER_ATTRIBUTE],
    func: (attributeName) => document.documentElement.getAttribute(attributeName) === '1',
  });

  return results[0]?.result === true;
};

const setDarkModeMarkerOnTab = async (tabId: number, enabled: boolean): Promise<void> => {
  await chrome.scripting.executeScript<[string, boolean], void>({
    target: { tabId },
    args: [QA_DARK_MODE_MARKER_ATTRIBUTE, enabled],
    func: (attributeName, shouldEnable) => {
      if (shouldEnable) {
        document.documentElement.setAttribute(attributeName, '1');
        return;
      }

      document.documentElement.removeAttribute(attributeName);
    },
  });
};

const applyDarkModeToTab = async (tabId: number): Promise<void> => {
  const alreadyEnabled = await isDarkModeMarkedOnTab(tabId);
  if (alreadyEnabled) {
    return;
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: [QA_DARK_MODE_CSS_FILE],
  });

  await setDarkModeMarkerOnTab(tabId, true);
};

const removeDarkModeFromTab = async (tabId: number): Promise<void> => {
  try {
    await chrome.scripting.removeCSS({
      target: { tabId },
      files: [QA_DARK_MODE_CSS_FILE],
    });
  } catch {
    // Ignore if styles are already absent.
  }

  try {
    await setDarkModeMarkerOnTab(tabId, false);
  } catch {
    // Ignore script execution failures on restricted pages.
  }
};

const getSupportedTabs = async (): Promise<chrome.tabs.Tab[]> => {
  const patterns = SUPPORTED_LALAFO_HOSTS.map((host) => `https://*.${host}/*`);
  return chrome.tabs.query({ url: patterns });
};

const enforceDarkModeOnSupportedTabs = async (enabled: boolean): Promise<void> => {
  const tabs = await getSupportedTabs();

  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === 'number')
      .map(async (tab) => {
        const tabId = tab.id as number;
        if (enabled) {
          await applyDarkModeToTab(tabId);
        } else {
          await removeDarkModeFromTab(tabId);
        }
      }),
  );
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const maybeUrl = changeInfo.url ?? tab.url;

  // Apply only when page is fully loaded to avoid racing injections.
  if (changeInfo.status !== 'complete' || !isSupportedLalafoUrl(maybeUrl)) {
    return;
  }

  void (async () => {
    const enabled = await isQaDarkModeEnabled();
    try {
      if (enabled) {
        await applyDarkModeToTab(tabId);
      } else {
        await removeDarkModeFromTab(tabId);
      }
    } catch {
      // Ignore unsupported pages or restricted contexts.
    }
  })();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(QA_DARK_MODE_STORAGE_KEY in changes)) {
    return;
  }

  const next = changes[QA_DARK_MODE_STORAGE_KEY]?.newValue === true;

  void (async () => {
    try {
      await enforceDarkModeOnSupportedTabs(next);
    } catch {
      // Ignore runtime/restricted tab errors to keep worker stable.
    }
  })();
});

