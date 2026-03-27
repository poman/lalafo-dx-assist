import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketTestData } from '../shared/config/testData';
import {
  FILL_FORM_REQUEST_TYPE,
  FILL_FORM_RESPONSE_TYPE,
  type FillFormRequest,
  type FillFormResponse,
} from '../shared/types/messages';
import { dispatchAutoFillToActiveTab } from './formFiller';

type SendMessageHandler = (
  tabId: number,
  message: FillFormRequest,
  sendResponse: (response?: unknown) => void,
) => void;

interface ChromeMockOptions {
  tabs?: chrome.tabs.Tab[];
  queryError?: Error;
  sendMessageHandler?: SendMessageHandler;
}

interface ChromeMockControls {
  queryMock: ReturnType<typeof vi.fn>;
  sendMessageMock: ReturnType<typeof vi.fn>;
}

const installChromeMock = (options: ChromeMockOptions): ChromeMockControls => {
  const runtime: { lastError?: { message: string } } = {};

  const queryMock = vi.fn(async () => {
    if (options.queryError) {
      throw options.queryError;
    }

    return options.tabs ?? [];
  });

  const sendMessageMock = vi.fn(
    (tabId: number, message: FillFormRequest, callback: (response?: unknown) => void) => {
      runtime.lastError = undefined;

      if (!options.sendMessageHandler) {
        callback();
        return;
      }

      options.sendMessageHandler(tabId, message, callback);
    },
  );

  (globalThis as { chrome?: unknown }).chrome = {
    tabs: {
      query: queryMock,
      sendMessage: sendMessageMock,
    },
    runtime,
  };

  return { queryMock, sendMessageMock };
};

describe('dispatchAutoFillToActiveTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { chrome?: unknown }).chrome = undefined;
  });

  it('resolves market from tab URL and sends typed FILL_FORM message', async () => {
    const { sendMessageMock } = installChromeMock({
      tabs: [{ id: 44, url: 'https://www.lalafo.az/account/login' } as chrome.tabs.Tab],
      sendMessageHandler: (_tabId, _message, callback) => {
        callback({
          type: FILL_FORM_RESPONSE_TYPE,
          success: true,
          detectedFormKind: 'login',
          diagnostics: [],
        });
      },
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'success', detectedFormKind: 'login' });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    const [tabId, message] = sendMessageMock.mock.calls[0] as [
      number,
      FillFormRequest,
      (response?: FillFormResponse) => void,
    ];

    expect(tabId).toBe(44);
    expect(message.type).toBe(FILL_FORM_REQUEST_TYPE);
    expect(message.market).toBe('az');
    expect(message.payload).toEqual(getMarketTestData('az'));
  });

  it('returns restricted-tab for unsupported domains', async () => {
    const { sendMessageMock } = installChromeMock({
      tabs: [{ id: 88, url: 'https://example.com/login' } as chrome.tabs.Tab],
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'restricted-tab' });
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('returns failure NO_RESPONSE when content script does not reply', async () => {
    const { sendMessageMock } = installChromeMock({
      tabs: [{ id: 99, url: 'https://lalafo.pl/auth' } as chrome.tabs.Tab],
      sendMessageHandler: (_tabId, _message, callback) => {
        callback(undefined);
      },
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'failure', error: 'NO_RESPONSE' });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it('returns failure from content response when filler reports failure', async () => {
    installChromeMock({
      tabs: [{ id: 71, url: 'https://lalafo.rs/post-ad' } as chrome.tabs.Tab],
      sendMessageHandler: (_tabId, _message, callback) => {
        callback({
          type: FILL_FORM_RESPONSE_TYPE,
          success: false,
          error: 'FORM_NOT_FOUND',
          detectedFormKind: 'unknown',
          diagnostics: [{ code: 'FORM_NOT_DETECTED', message: 'missing form' }],
        });
      },
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'failure', error: 'FORM_NOT_FOUND' });
  });

  it('returns failure SEND_MESSAGE_FAILED when runtime.lastError is set', async () => {
    installChromeMock({
      tabs: [{ id: 12, url: 'https://lalafo.kg/signin' } as chrome.tabs.Tab],
      sendMessageHandler: (_tabId, _message, callback) => {
        const chromeRuntime = (globalThis as { chrome: { runtime: { lastError?: { message: string } } } })
          .chrome.runtime;
        chromeRuntime.lastError = { message: 'Receiving end does not exist.' };
        callback(undefined);
      },
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'failure', error: 'SEND_MESSAGE_FAILED' });
  });

  it('returns failure TAB_QUERY_FAILED when querying active tab rejects', async () => {
    installChromeMock({ queryError: new Error('tabs query denied') });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'failure', error: 'TAB_QUERY_FAILED' });
  });

  it('returns failure INVALID_RESPONSE when content script returns malformed shape', async () => {
    installChromeMock({
      tabs: [{ id: 54, url: 'https://lalafo.gr/account/login' } as chrome.tabs.Tab],
      sendMessageHandler: (_tabId, _message, callback) => {
        callback({ success: true });
      },
    });

    const status = await dispatchAutoFillToActiveTab();

    expect(status).toEqual({ kind: 'failure', error: 'INVALID_RESPONSE' });
  });
});


