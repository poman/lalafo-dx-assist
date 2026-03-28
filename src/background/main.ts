import {
  A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  A11Y_RESULTS_BY_TAB_STORAGE_KEY,
  AUTO_A11Y_SCAN_STORAGE_KEY,
  AUTO_SEO_SCAN_STORAGE_KEY,
  SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY,
  QA_DARK_MODE_CSS_FILE,
  QA_DARK_MODE_MARKER_ATTRIBUTE,
  QA_DARK_MODE_STORAGE_KEY,
  SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  SEO_RESULTS_BY_TAB_STORAGE_KEY,
  SUPPORTED_LALAFO_HOSTS,
} from '../shared/constants';
import {
  A11Y_SCAN_RESPONSE_TYPE,
  REQUEST_SEO_REPORT_TYPE,
  SEO_REPORT_RESPONSE_TYPE,
  REQUEST_A11Y_SCAN_TYPE,
  type A11yViolation,
  type RequestA11yScanMessage,
  type RequestA11yScanResponse,
  type RequestSeoReportMessage,
  type SeoReportPayload,
  type SeoReportResponse,
} from '../shared/types/messages';
import { analyzeSeoReport } from '../popup/seoAnalyzer';

interface IA11yTabResult {
  tabId: number;
  url: string;
  violations: A11yViolation[];
  scannedAt: number;
}

interface ISeoTabResult {
  tabId: number;
  url: string;
  report: SeoReportPayload;
  issueCount: number;
  scannedAt: number;
}

type IA11yTabResultMap = Record<string, IA11yTabResult>;
type IA11yCountMap = Record<string, number>;
type ISeoTabResultMap = Record<string, ISeoTabResult>;
type ISeoCountMap = Record<string, number>;

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

const isAutoA11yScanEnabled = async (): Promise<boolean> => {
  const data = await chrome.storage.local.get([AUTO_A11Y_SCAN_STORAGE_KEY]);
  return data[AUTO_A11Y_SCAN_STORAGE_KEY] !== false;
};

const isA11yHighlightsEnabled = async (): Promise<boolean> => {
  const data = await chrome.storage.local.get([SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY]);
  return data[SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY] === true;
};

const isAutoSeoScanEnabled = async (): Promise<boolean> => {
  const data = await chrome.storage.local.get([AUTO_SEO_SCAN_STORAGE_KEY]);
  return data[AUTO_SEO_SCAN_STORAGE_KEY] !== false;
};

const getPrimaryContentScriptFile = (): string | null => {
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
  return files?.[0] ?? null;
};

const isReceiverMissingError = (message: string): boolean => {
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('message port closed before a response')
  );
};

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => globalThis.setTimeout(resolve, ms));
};

export const isNoTabWithIdError = (error: unknown): boolean => {
  return error instanceof Error && error.message.includes('No tab with id');
};

const sendMessageToTab = async (
  tabId: number,
  message: RequestA11yScanMessage,
): Promise<RequestA11yScanResponse> => {
  return new Promise<RequestA11yScanResponse>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response?: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (response === undefined) {
        reject(new Error('No response from content script'));
        return;
      }

      resolve(response as RequestA11yScanResponse);
    });
  });
};

const sendSeoRequestToTab = async (
  tabId: number,
  message: RequestSeoReportMessage,
): Promise<SeoReportResponse> => {
  return new Promise<SeoReportResponse>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response?: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (response === undefined) {
        reject(new Error('No response from content script'));
        return;
      }

      resolve(response as SeoReportResponse);
    });
  });
};

const ensureContentScriptInjected = async (tabId: number): Promise<boolean> => {
  const file = getPrimaryContentScriptFile();
  if (!file) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file],
    });
    return true;
  } catch {
    return false;
  }
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isA11yViolation = (value: unknown): value is A11yViolation => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.help === 'string' &&
    typeof value.description === 'string' &&
    typeof value.helpUrl === 'string' &&
    Array.isArray(value.nodes)
  );
};

const isRequestA11yScanResponse = (value: unknown): value is RequestA11yScanResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (value.type !== A11Y_SCAN_RESPONSE_TYPE || typeof value.success !== 'boolean') {
    return false;
  }

  if (!Array.isArray(value.violations) || !value.violations.every((item) => isA11yViolation(item))) {
    return false;
  }

  return value.success || typeof value.error === 'string';
};

const isSeoReportPayload = (value: unknown): value is SeoReportPayload => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isObjectRecord(value.meta) && Array.isArray(value.headings) && isObjectRecord(value.vitals);
};

const isSeoReportResponse = (value: unknown): value is SeoReportResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return value.type === SEO_REPORT_RESPONSE_TYPE && isSeoReportPayload(value.payload);
};

const getSeoIssueCount = (report: SeoReportPayload): number => {
  const issues = analyzeSeoReport(report);
  return issues.filter((issue) => issue.severity !== 'info').length;
};

const updateStoredSeoResult = async (
  tabId: number,
  url: string,
  report: SeoReportPayload,
): Promise<void> => {
  const storage = (await chrome.storage.local.get([
    SEO_RESULTS_BY_TAB_STORAGE_KEY,
    SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const byTab = (storage[SEO_RESULTS_BY_TAB_STORAGE_KEY] as ISeoTabResultMap | undefined) ?? {};
  const countByTab = (storage[SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as ISeoCountMap | undefined) ?? {};
  const issueCount = getSeoIssueCount(report);

  byTab[String(tabId)] = {
    tabId,
    url,
    report,
    issueCount,
    scannedAt: Date.now(),
  };
  countByTab[String(tabId)] = issueCount;

  await chrome.storage.local.set({
    [SEO_RESULTS_BY_TAB_STORAGE_KEY]: byTab,
    [SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: countByTab,
  });
  await safeRefreshBadgeForTab(tabId);
};

const clearStoredSeoResultForTab = async (tabId: number): Promise<void> => {
  const storage = (await chrome.storage.local.get([
    SEO_RESULTS_BY_TAB_STORAGE_KEY,
    SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const byTab = (storage[SEO_RESULTS_BY_TAB_STORAGE_KEY] as ISeoTabResultMap | undefined) ?? {};
  const countByTab = (storage[SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as ISeoCountMap | undefined) ?? {};

  delete byTab[String(tabId)];
  delete countByTab[String(tabId)];

  await chrome.storage.local.set({
    [SEO_RESULTS_BY_TAB_STORAGE_KEY]: byTab,
    [SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: countByTab,
  });
  await safeRefreshBadgeForTab(tabId);
};

const clearAllStoredSeoResults = async (): Promise<void> => {
  const storage = (await chrome.storage.local.get([SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY])) as Record<string, unknown>;
  const countByTab = (storage[SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as ISeoCountMap | undefined) ?? {};

  await chrome.storage.local.set({
    [SEO_RESULTS_BY_TAB_STORAGE_KEY]: {},
    [SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: {},
  });

  await Promise.all(
    Object.keys(countByTab).map(async (tabIdRaw) => {
      const tabId = Number.parseInt(tabIdRaw, 10);
      if (Number.isNaN(tabId)) {
        return;
      }

      try {
        await safeRefreshBadgeForTab(tabId);
      } catch {
        // Ignore tabs that no longer exist.
      }
    }),
  );
};

const updateBadgeCount = async (tabId: number, count: number): Promise<void> => {
  await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c', tabId });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 999)) : '', tabId });
};

const getCombinedBadgeCount = async (tabId: number): Promise<number> => {
  const storage = (await chrome.storage.local.get([
    A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
    SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
    AUTO_SEO_SCAN_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const a11yCountByTab = (storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as IA11yCountMap | undefined) ?? {};
  const seoCountByTab = (storage[SEO_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as ISeoCountMap | undefined) ?? {};
  const includeSeo = storage[AUTO_SEO_SCAN_STORAGE_KEY] !== false;

  const a11yCount = a11yCountByTab[String(tabId)] ?? 0;
  const seoCount = includeSeo ? seoCountByTab[String(tabId)] ?? 0 : 0;

  return a11yCount + seoCount;
};

const refreshBadgeForTab = async (tabId: number): Promise<void> => {
  const combined = await getCombinedBadgeCount(tabId);
  await updateBadgeCount(tabId, combined);
};

export const safeRefreshBadgeForTab = async (tabId: number): Promise<void> => {
  try {
    await refreshBadgeForTab(tabId);
  } catch (error) {
    if (isNoTabWithIdError(error)) {
      return;
    }

    throw error;
  }
};

const updateStoredA11yResult = async (
  tabId: number,
  url: string,
  violations: A11yViolation[],
): Promise<void> => {
  const storage = (await chrome.storage.local.get([
    A11Y_RESULTS_BY_TAB_STORAGE_KEY,
    A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const byTab = (storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY] as IA11yTabResultMap | undefined) ?? {};
  const countByTab = (storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as IA11yCountMap | undefined) ?? {};

  byTab[String(tabId)] = {
    tabId,
    url,
    violations,
    scannedAt: Date.now(),
  };
  countByTab[String(tabId)] = violations.length;

  await chrome.storage.local.set({
    [A11Y_RESULTS_BY_TAB_STORAGE_KEY]: byTab,
    [A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: countByTab,
  });
  await safeRefreshBadgeForTab(tabId);
};

const clearStoredA11yResultForTab = async (tabId: number): Promise<void> => {
  const storage = (await chrome.storage.local.get([
    A11Y_RESULTS_BY_TAB_STORAGE_KEY,
    A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const byTab = (storage[A11Y_RESULTS_BY_TAB_STORAGE_KEY] as IA11yTabResultMap | undefined) ?? {};
  const countByTab = (storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as IA11yCountMap | undefined) ?? {};

  delete byTab[String(tabId)];
  delete countByTab[String(tabId)];

  await chrome.storage.local.set({
    [A11Y_RESULTS_BY_TAB_STORAGE_KEY]: byTab,
    [A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: countByTab,
  });
  await safeRefreshBadgeForTab(tabId);
};

const clearAllStoredA11yResults = async (): Promise<void> => {
  const storage = (await chrome.storage.local.get([
    A11Y_RESULTS_BY_TAB_STORAGE_KEY,
    A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY,
  ])) as Record<string, unknown>;

  const countByTab = (storage[A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY] as IA11yCountMap | undefined) ?? {};

  await chrome.storage.local.set({
    [A11Y_RESULTS_BY_TAB_STORAGE_KEY]: {},
    [A11Y_ISSUE_COUNT_BY_TAB_STORAGE_KEY]: {},
  });

  await Promise.all(
    Object.keys(countByTab).map(async (tabIdRaw) => {
      const tabId = Number.parseInt(tabIdRaw, 10);
      if (Number.isNaN(tabId)) {
        return;
      }

      try {
        await safeRefreshBadgeForTab(tabId);
      } catch {
        // Ignore tabs that no longer exist.
      }
    }),
  );
};

const dispatchA11yScanWithBootstrap = async (
  tabId: number,
  url: string,
  showHighlights: boolean,
): Promise<void> => {
  const message: RequestA11yScanMessage = { type: REQUEST_A11Y_SCAN_TYPE, showHighlights };

  try {
    const response = await sendMessageToTab(tabId, message);
    if (isRequestA11yScanResponse(response) && response.success) {
      await updateStoredA11yResult(tabId, url, response.violations);
    } else {
      await clearStoredA11yResultForTab(tabId);
    }
    return;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    if (!isReceiverMissingError(rawMessage)) {
      return;
    }
  }

  const injected = await ensureContentScriptInjected(tabId);
  if (!injected) {
    return;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await sendMessageToTab(tabId, message);
      if (isRequestA11yScanResponse(response) && response.success) {
        await updateStoredA11yResult(tabId, url, response.violations);
      } else {
        await clearStoredA11yResultForTab(tabId);
      }
      return;
    } catch {
      await wait(120);
    }
  }
};

const dispatchSeoScanWithBootstrap = async (tabId: number, url: string): Promise<void> => {
  const message: RequestSeoReportMessage = { type: REQUEST_SEO_REPORT_TYPE };

  try {
    const response = await sendSeoRequestToTab(tabId, message);
    if (isSeoReportResponse(response)) {
      await updateStoredSeoResult(tabId, url, response.payload);
    } else {
      await clearStoredSeoResultForTab(tabId);
    }
    return;
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    if (!isReceiverMissingError(rawMessage)) {
      return;
    }
  }

  const injected = await ensureContentScriptInjected(tabId);
  if (!injected) {
    return;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await sendSeoRequestToTab(tabId, message);
      if (isSeoReportResponse(response)) {
        await updateStoredSeoResult(tabId, url, response.payload);
      } else {
        await clearStoredSeoResultForTab(tabId);
      }
      return;
    } catch {
      await wait(120);
    }
  }
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
  const patterns = SUPPORTED_LALAFO_HOSTS.flatMap((host) => [
    `https://${host}/*`,
    `https://*.${host}/*`,
  ]);
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

const enforceAutoA11yScanOnSupportedTabs = async (): Promise<void> => {
  const tabs = await getSupportedTabs();
  const showHighlights = await isA11yHighlightsEnabled();

  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === 'number')
      .map(async (tab) => {
        const tabId = tab.id as number;
        await dispatchA11yScanWithBootstrap(tabId, tab.url ?? '', showHighlights);
      }),
  );
};

const enforceAutoSeoScanOnSupportedTabs = async (): Promise<void> => {
  const tabs = await getSupportedTabs();

  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === 'number')
      .map(async (tab) => {
        const tabId = tab.id as number;
        await dispatchSeoScanWithBootstrap(tabId, tab.url ?? '');
      }),
  );
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const maybeUrl = changeInfo.url ?? tab.url;

  // Apply only when page is fully loaded to avoid racing injections.
  if (changeInfo.status !== 'complete') {
    return;
  }

  if (!isSupportedLalafoUrl(maybeUrl)) {
    void clearStoredA11yResultForTab(tabId);
    void clearStoredSeoResultForTab(tabId);
    return;
  }

  void (async () => {
    const [darkModeEnabled, autoA11yEnabled, autoSeoEnabled] = await Promise.all([
      isQaDarkModeEnabled(),
      isAutoA11yScanEnabled(),
      isAutoSeoScanEnabled(),
    ]);
    const showHighlights = await isA11yHighlightsEnabled();

    try {
      if (darkModeEnabled) {
        await applyDarkModeToTab(tabId);
      } else {
        await removeDarkModeFromTab(tabId);
      }

      if (autoA11yEnabled) {
        await dispatchA11yScanWithBootstrap(tabId, maybeUrl ?? tab.url ?? '', showHighlights);
      }

      if (autoSeoEnabled) {
        await dispatchSeoScanWithBootstrap(tabId, maybeUrl ?? tab.url ?? '');
      }
    } catch {
      // Ignore unsupported pages or restricted contexts.
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearStoredA11yResultForTab(tabId);
  void clearStoredSeoResultForTab(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const settings = (await chrome.storage.local.get([
      AUTO_A11Y_SCAN_STORAGE_KEY,
      AUTO_SEO_SCAN_STORAGE_KEY,
      SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY,
    ])) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (!(AUTO_A11Y_SCAN_STORAGE_KEY in settings)) {
      patch[AUTO_A11Y_SCAN_STORAGE_KEY] = true;
    }

    if (!(AUTO_SEO_SCAN_STORAGE_KEY in settings)) {
      patch[AUTO_SEO_SCAN_STORAGE_KEY] = true;
    }

    if (!(SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY in settings)) {
      patch[SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY] = false;
    }

    if (Object.keys(patch).length > 0) {
      await chrome.storage.local.set(patch);
    }
  })();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName !== 'local' ||
    (!(QA_DARK_MODE_STORAGE_KEY in changes) &&
      !(AUTO_A11Y_SCAN_STORAGE_KEY in changes) &&
      !(AUTO_SEO_SCAN_STORAGE_KEY in changes) &&
      !(SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY in changes))
  ) {
    return;
  }

  void (async () => {
    try {
      if (QA_DARK_MODE_STORAGE_KEY in changes) {
        const nextDarkMode = changes[QA_DARK_MODE_STORAGE_KEY]?.newValue === true;
        await enforceDarkModeOnSupportedTabs(nextDarkMode);
      }

      if (AUTO_A11Y_SCAN_STORAGE_KEY in changes && changes[AUTO_A11Y_SCAN_STORAGE_KEY]?.newValue === true) {
        await enforceAutoA11yScanOnSupportedTabs();
      }

      if (AUTO_A11Y_SCAN_STORAGE_KEY in changes && changes[AUTO_A11Y_SCAN_STORAGE_KEY]?.newValue !== true) {
        await clearAllStoredA11yResults();
      }

      if (SHOW_A11Y_HIGHLIGHTS_STORAGE_KEY in changes) {
        await enforceAutoA11yScanOnSupportedTabs();
      }

      if (AUTO_SEO_SCAN_STORAGE_KEY in changes && changes[AUTO_SEO_SCAN_STORAGE_KEY]?.newValue === true) {
        await enforceAutoSeoScanOnSupportedTabs();
      }

      if (AUTO_SEO_SCAN_STORAGE_KEY in changes && changes[AUTO_SEO_SCAN_STORAGE_KEY]?.newValue !== true) {
        await clearAllStoredSeoResults();
      }

      if (AUTO_SEO_SCAN_STORAGE_KEY in changes) {
        const tabs = await getSupportedTabs();
        await Promise.all(
          tabs
            .filter((tab) => typeof tab.id === 'number')
            .map(async (tab) => {
              await safeRefreshBadgeForTab(tab.id as number);
            }),
        );
      }
    } catch {
      // Ignore runtime/restricted tab errors to keep worker stable.
    }
  })();
});

