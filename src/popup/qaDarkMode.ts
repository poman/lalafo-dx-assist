import {
  QA_DARK_MODE_CSS_FILE,
  QA_DARK_MODE_MARKER_ATTRIBUTE,
  QA_DARK_MODE_STORAGE_KEY,
  SUPPORTED_LALAFO_HOSTS,
} from '../shared/constants';

interface IStorageArea {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

interface ITabsApi {
  query: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
}

interface IScriptingApi {
  insertCSS: (injection: chrome.scripting.CSSInjection) => Promise<void>;
  removeCSS: (injection: chrome.scripting.CSSInjection) => Promise<void>;
  executeScript: <Args extends unknown[], Result>(
    injection: chrome.scripting.ScriptInjection<Args, Result>,
  ) => Promise<Array<chrome.scripting.InjectionResult<Result>>>;
}

export interface IChromeApi {
  storage: { local: IStorageArea };
  tabs: ITabsApi;
  scripting: IScriptingApi;
}

export interface IToggleResult {
  enabled: boolean;
  appliedToTab: boolean;
  warning?: string;
}

interface IActiveTabInfo {
  id: number;
  url?: string;
}

const getApi = (): IChromeApi => chrome as unknown as IChromeApi;

export const getQaDarkModeEnabled = async (api: IChromeApi = getApi()): Promise<boolean> => {
  const data = await api.storage.local.get([QA_DARK_MODE_STORAGE_KEY]);
  return data[QA_DARK_MODE_STORAGE_KEY] === true;
};

export const setQaDarkModeEnabled = async (
  enabled: boolean,
  api: IChromeApi = getApi(),
): Promise<void> => {
  await api.storage.local.set({ [QA_DARK_MODE_STORAGE_KEY]: enabled });
};

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

const getActiveTab = async (api: IChromeApi = getApi()): Promise<IActiveTabInfo | null> => {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  const first = tabs[0];
  if (!first || typeof first.id !== 'number') {
    return null;
  }

  return { id: first.id, url: first.url };
};

export const applyQaDarkModeCss = async (
  tabId: number,
  api: IChromeApi = getApi(),
): Promise<void> => {
  await api.scripting.insertCSS({
    target: { tabId },
    files: [QA_DARK_MODE_CSS_FILE],
  });
};

export const removeQaDarkModeCss = async (
  tabId: number,
  api: IChromeApi = getApi(),
): Promise<void> => {
  await api.scripting.removeCSS({
    target: { tabId },
    files: [QA_DARK_MODE_CSS_FILE],
  });
};

const isQaDarkModeMarkedOnTab = async (tabId: number, api: IChromeApi): Promise<boolean> => {
  const results = await api.scripting.executeScript<[string], boolean>({
    target: { tabId },
    args: [QA_DARK_MODE_MARKER_ATTRIBUTE],
    func: (attributeName) => document.documentElement.getAttribute(attributeName) === '1',
  });

  return results[0]?.result === true;
};

const setQaDarkModeMarkerOnTab = async (
  tabId: number,
  enabled: boolean,
  api: IChromeApi,
): Promise<void> => {
  await api.scripting.executeScript<[string, boolean], void>({
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

const enforceQaDarkModeOnTab = async (
  tabId: number,
  enabled: boolean,
  api: IChromeApi,
): Promise<void> => {
  if (enabled) {
    const alreadyEnabled = await isQaDarkModeMarkedOnTab(tabId, api);
    if (alreadyEnabled) {
      return;
    }

    await applyQaDarkModeCss(tabId, api);
    await setQaDarkModeMarkerOnTab(tabId, true, api);
    return;
  }

  await removeQaDarkModeCss(tabId, api);
  await setQaDarkModeMarkerOnTab(tabId, false, api);
};

export const syncQaDarkModeWithActiveTab = async (
  api: IChromeApi = getApi(),
): Promise<IToggleResult> => {
  const enabled = await getQaDarkModeEnabled(api);
  const tab = await getActiveTab(api);

  if (tab === null) {
    return {
      enabled,
      appliedToTab: false,
      warning: 'State loaded, but no active tab was available.',
    };
  }

  if (!isSupportedLalafoUrl(tab.url)) {
    return {
      enabled,
      appliedToTab: false,
      warning: 'QA Dark Mode works only on lalafo.pl/.kg/.az/.rs/.gr domains.',
    };
  }

  try {
    await enforceQaDarkModeOnTab(tab.id, enabled, api);
  } catch {
    return {
      enabled,
      appliedToTab: false,
      warning: 'State loaded, but this page does not allow CSS injection.',
    };
  }

  return { enabled, appliedToTab: true };
};

export const toggleQaDarkMode = async (
  enabled: boolean,
  api: IChromeApi = getApi(),
): Promise<IToggleResult> => {
  await setQaDarkModeEnabled(enabled, api);

  const tab = await getActiveTab(api);
  if (tab === null) {
    return {
      enabled,
      appliedToTab: false,
      warning: 'State saved, but no active tab was available.',
    };
  }

  if (!isSupportedLalafoUrl(tab.url)) {
    return {
      enabled,
      appliedToTab: false,
      warning: 'State saved. It will apply only on supported Lalafo domains.',
    };
  }

  try {
    await enforceQaDarkModeOnTab(tab.id, enabled, api);
  } catch {
    return {
      enabled,
      appliedToTab: false,
      warning: 'State saved, but this page does not allow CSS injection.',
    };
  }

  return { enabled, appliedToTab: true };
};


