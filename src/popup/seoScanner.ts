import {
  REQUEST_SEO_REPORT_TYPE,
  SEO_REPORT_RESPONSE_TYPE,
  type RequestSeoReportMessage,
  type SeoReportPayload,
  type SeoReportResponse,
} from '../shared/types/messages';

export type SeoPopupLoadStatus =
  | { kind: 'success'; tabId: number; report: SeoReportPayload }
  | { kind: 'failure'; error: 'RESTRICTED_TAB' | 'SEND_MESSAGE_FAILED' | 'NO_RESPONSE' | 'INVALID_RESPONSE' };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isScriptableUrl = (url?: string): boolean => {
  if (!url) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current) {
    return current;
  }

  const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return fallback ?? null;
};

const isSeoReportPayload = (value: unknown): value is SeoReportPayload => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (!isObjectRecord(value.meta) || !Array.isArray(value.headings) || !isObjectRecord(value.vitals)) {
    return false;
  }

  return (
    typeof value.meta.title === 'string' &&
    typeof value.meta.titleLength === 'number' &&
    typeof value.meta.description === 'string' &&
    typeof value.meta.canonical === 'string' &&
    typeof value.meta.h1Count === 'number' &&
    typeof value.meta.hasSingleH1 === 'boolean' &&
    isObjectRecord(value.meta.openGraph)
  );
};

const isSeoReportResponse = (value: unknown): value is SeoReportResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return value.type === SEO_REPORT_RESPONSE_TYPE && isSeoReportPayload(value.payload);
};

const sendSeoRequest = async (tabId: number): Promise<SeoReportResponse> => {
  const message: RequestSeoReportMessage = { type: REQUEST_SEO_REPORT_TYPE };

  return new Promise((resolve, reject) => {
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

      if (!isSeoReportResponse(response)) {
        reject(new Error('Invalid SEO response shape'));
        return;
      }

      resolve(response);
    });
  });
};

export const requestSeoReportFromActiveTab = async (): Promise<SeoPopupLoadStatus> => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab || typeof activeTab.id !== 'number' || !isScriptableUrl(activeTab.url)) {
      return { kind: 'failure', error: 'RESTRICTED_TAB' };
    }

    try {
      const response = await sendSeoRequest(activeTab.id);
      return { kind: 'success', tabId: activeTab.id, report: response.payload };
    } catch (error) {
      if (error instanceof Error && error.message.includes('No response')) {
        return { kind: 'failure', error: 'NO_RESPONSE' };
      }

      if (error instanceof Error && error.message.includes('Invalid SEO response shape')) {
        return { kind: 'failure', error: 'INVALID_RESPONSE' };
      }

      return { kind: 'failure', error: 'SEND_MESSAGE_FAILED' };
    }
  } catch {
    return { kind: 'failure', error: 'SEND_MESSAGE_FAILED' };
  }
};

