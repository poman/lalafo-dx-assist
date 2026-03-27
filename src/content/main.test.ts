import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FILL_FORM_RESPONSE_TYPE } from '../shared/types/messages';

type RuntimeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

const installChromeRuntimeMock = () => {
  const addListenerMock = vi.fn<(listener: RuntimeMessageListener) => void>();

  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: addListenerMock,
      },
    },
  };

  return { addListenerMock };
};

describe('content runtime listener request validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    (globalThis as { chrome?: unknown }).chrome = undefined;
    document.body.innerHTML = '';
  });

  it('returns INVALID_REQUEST response for malformed payload instead of crashing', async () => {
    const { addListenerMock } = installChromeRuntimeMock();

    await import('./main');

    expect(addListenerMock.mock.calls.length).toBeGreaterThan(0);

    const malformedMessage = {
      type: 'FILL_FORM',
      market: 'pl',
      payload: {
        login: { emailOrPhone: 'user@example.com', password: 777 },
      },
    };

    const expectedResponse = {
      type: FILL_FORM_RESPONSE_TYPE,
      success: false,
      error: 'INVALID_REQUEST',
      detectedFormKind: 'unknown',
      diagnostics: [
        {
          code: 'INVALID_PAYLOAD',
          message: 'Malformed fill-form request payload.',
        },
      ],
    };

    const listeners = addListenerMock.mock.calls
      .map((call) => call[0])
      .filter((listener): listener is RuntimeMessageListener => typeof listener === 'function');

    let matchingListenerFound = false;

    for (const listener of listeners) {
      const sendResponse = vi.fn<(response: unknown) => void>();
      const handled = listener(malformedMessage, {} as chrome.runtime.MessageSender, sendResponse);

      if (sendResponse.mock.calls.length === 0) {
        continue;
      }

      matchingListenerFound = true;
      expect(handled).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith(expectedResponse);
      break;
    }

    expect(matchingListenerFound).toBe(true);
  });
});

