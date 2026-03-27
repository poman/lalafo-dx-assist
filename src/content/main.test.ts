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

    expect(addListenerMock).toHaveBeenCalledTimes(1);

    const listener = addListenerMock.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf('function');

    const sendResponse = vi.fn<(response: unknown) => void>();

    const malformedMessage = {
      type: 'FILL_FORM',
      market: 'pl',
      payload: {
        login: { emailOrPhone: 'user@example.com', password: 777 },
      },
    };

    const handled = listener?.(malformedMessage, {} as chrome.runtime.MessageSender, sendResponse);

    expect(handled).toBe(false);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({
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
    });
  });
});

