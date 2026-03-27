import {
  A11Y_SCAN_RESPONSE_TYPE,
  FOCUS_A11Y_RULE_TYPE,
  REQUEST_A11Y_SCAN_TYPE,
  TOGGLE_HIGHLIGHTS_TYPE,
  type A11yViolation,
  type FocusA11yRuleMessage,
  type RequestA11yScanMessage,
  type RequestA11yScanResponse,
  type ToggleHighlightsMessage,
} from '../shared/types/messages';

export type A11yPopupScanStatus =
  | { kind: 'success'; violations: A11yViolation[] }
  | {
      kind: 'failure';
      error: 'SEND_MESSAGE_FAILED' | 'NO_RESPONSE' | 'INVALID_RESPONSE' | 'UNEXPECTED_ERROR';
      detail?: string;
    }
  | { kind: 'restricted-tab' };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const activeTabs = await chrome.tabs.query({ active: true });
  const webTab = activeTabs.find((tab) => typeof tab.id === 'number' && isScriptableUrl(tab.url));
  if (webTab) {
    return webTab;
  }

  const fallbackWithId = activeTabs.find((tab) => typeof tab.id === 'number');
  if (fallbackWithId) {
    return fallbackWithId;
  }

  const [activeInCurrentWindow] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeInCurrentWindow) {
    return activeInCurrentWindow;
  }

  const [activeInLastFocusedWindow] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return activeInLastFocusedWindow ?? null;
};

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

const getPrimaryContentScriptFile = (): string | null => {
  const contentScripts = chrome.runtime.getManifest().content_scripts;
  const files = contentScripts?.[0]?.js;
  return files?.[0] ?? null;
};

const isReceiverMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Receiving end does not exist') ||
    error.message.includes('message port closed before a response')
  );
};

const isRestrictedTabError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Cannot access contents of url') ||
    error.message.includes('Cannot access a chrome:// URL') ||
    error.message.includes('The extensions gallery cannot be scripted') ||
    error.message.includes('Missing host permission')
  );
};

const toErrorMessage = (error: unknown): string | undefined => {
  return error instanceof Error ? error.message : undefined;
};

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
};

const ensureContentScriptInjected = async (
  tabId: number,
): Promise<{ ok: true } | { ok: false; error: 'RESTRICTED_TAB' | 'SEND_MESSAGE_FAILED' }> => {
  const file = getPrimaryContentScriptFile();
  if (!file) {
    return { ok: false, error: 'SEND_MESSAGE_FAILED' };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file],
    });
    return { ok: true };
  } catch (error) {
    if (isRestrictedTabError(error)) {
      return { ok: false, error: 'RESTRICTED_TAB' };
    }

    return { ok: false, error: 'SEND_MESSAGE_FAILED' };
  }
};

const isA11yViolation = (value: unknown): value is A11yViolation => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.help !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.helpUrl !== 'string'
  ) {
    return false;
  }

  const impacts = ['minor', 'moderate', 'serious', 'critical', null] as const;
  if (!impacts.includes((value.impact ?? null) as (typeof impacts)[number])) {
    return false;
  }

  if (!Array.isArray(value.nodes)) {
    return false;
  }

  return value.nodes.every(
    (node) =>
      isObjectRecord(node) &&
      Array.isArray(node.target) &&
      (node.summary === undefined || typeof node.summary === 'string') &&
      node.target.every((selector) => typeof selector === 'string'),
  );
};

const isRequestA11yScanResponse = (value: unknown): value is RequestA11yScanResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (value.type !== A11Y_SCAN_RESPONSE_TYPE || typeof value.success !== 'boolean') {
    return false;
  }

  if (!Array.isArray(value.violations)) {
    return false;
  }

  if (!value.violations.every((item) => isA11yViolation(item))) {
    return false;
  }

  if (value.success) {
    return true;
  }

  return typeof value.error === 'string';
};

const sendMessage = async <TResponse>(
  tabId: number,
  message: RequestA11yScanMessage | ToggleHighlightsMessage | FocusA11yRuleMessage,
): Promise<TResponse> => {
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

      resolve(response as TResponse);
    });
  });
};

const sendMessageWithRetry = async (
  tabId: number,
  message: RequestA11yScanMessage | ToggleHighlightsMessage | FocusA11yRuleMessage,
  attempts: number,
  delayMs: number,
): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: 'NO_RESPONSE' | 'SEND_MESSAGE_FAILED' | 'RESTRICTED_TAB'; detail?: string }
> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await sendMessage<unknown>(tabId, message);
      return { ok: true, response };
    } catch (error) {
      lastError = error;

      if (isRestrictedTabError(error)) {
        return { ok: false, error: 'RESTRICTED_TAB', detail: toErrorMessage(error) };
      }

      if (attempt < attempts - 1) {
        await wait(delayMs);
      }
    }
  }

  if (lastError instanceof Error && lastError.message.includes('No response')) {
    return { ok: false, error: 'NO_RESPONSE', detail: lastError.message };
  }

  return {
    ok: false,
    error: 'SEND_MESSAGE_FAILED',
    detail: toErrorMessage(lastError),
  };
};

const sendMessageWithBootstrap = async (
  tabId: number,
  message: RequestA11yScanMessage | ToggleHighlightsMessage | FocusA11yRuleMessage,
): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: 'NO_RESPONSE' | 'SEND_MESSAGE_FAILED' | 'RESTRICTED_TAB'; detail?: string }
> => {
  try {
    const initialSend = await sendMessageWithRetry(tabId, message, 1, 0);
    if (initialSend.ok) {
      return initialSend;
    }

    if (initialSend.error === 'RESTRICTED_TAB') {
      return initialSend;
    }

    if (!isReceiverMissingError(new Error(initialSend.detail ?? ''))) {
      return initialSend;
    }

    const injected = await ensureContentScriptInjected(tabId);
    if (!injected.ok) {
      return { ok: false, error: injected.error };
    }

    // The loader script imports the real content bundle asynchronously.
    // A short retry window avoids the first-click race where listener isn't ready yet.
    return await sendMessageWithRetry(tabId, message, 5, 120);
  } catch (error) {
    if (!isReceiverMissingError(error)) {
      if (isRestrictedTabError(error)) {
        return { ok: false, error: 'RESTRICTED_TAB', detail: toErrorMessage(error) };
      }

      if (error instanceof Error && error.message.includes('No response')) {
        return { ok: false, error: 'NO_RESPONSE', detail: error.message };
      }

      return {
        ok: false,
        error: 'SEND_MESSAGE_FAILED',
        detail: error instanceof Error ? error.message : undefined,
      };
    }

    const injected = await ensureContentScriptInjected(tabId);
    if (!injected.ok) {
      return { ok: false, error: injected.error };
    }

    return await sendMessageWithRetry(tabId, message, 5, 120);
  }
};

export const requestA11yScanFromActiveTab = async (): Promise<A11yPopupScanStatus> => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab || typeof activeTab.id !== 'number' || !isScriptableUrl(activeTab.url)) {
      return { kind: 'restricted-tab' };
    }

    const request: RequestA11yScanMessage = { type: REQUEST_A11Y_SCAN_TYPE };
    const sent = await sendMessageWithBootstrap(activeTab.id, request);
    if (!sent.ok) {
      if (sent.error === 'RESTRICTED_TAB') {
        return { kind: 'restricted-tab' };
      }

      return { kind: 'failure', error: sent.error, detail: sent.detail };
    }

    const response = sent.response;

    if (!isRequestA11yScanResponse(response)) {
      return { kind: 'failure', error: 'INVALID_RESPONSE' };
    }

    if (!response.success) {
      return { kind: 'failure', error: 'UNEXPECTED_ERROR', detail: response.error };
    }

    return { kind: 'success', violations: response.violations };
  } catch {
    return { kind: 'failure', error: 'UNEXPECTED_ERROR' };
  }
};

export const toggleA11yHighlightsOnActiveTab = async (enabled: boolean): Promise<boolean> => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab || typeof activeTab.id !== 'number' || !isScriptableUrl(activeTab.url)) {
      return false;
    }

    const message: ToggleHighlightsMessage = {
      type: TOGGLE_HIGHLIGHTS_TYPE,
      enabled,
    };

    const sent = await sendMessageWithBootstrap(activeTab.id, message);
    return sent.ok;
  } catch {
    return false;
  }
};

export const focusA11yRuleOnActiveTab = async (ruleId: string): Promise<boolean> => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab || typeof activeTab.id !== 'number' || !isScriptableUrl(activeTab.url)) {
      return false;
    }

    const message: FocusA11yRuleMessage = {
      type: FOCUS_A11Y_RULE_TYPE,
      ruleId,
    };

    const sent = await sendMessageWithBootstrap(activeTab.id, message);
    if (!sent.ok) {
      return false;
    }

    return isObjectRecord(sent.response) && sent.response.ok === true;
  } catch {
    return false;
  }
};





