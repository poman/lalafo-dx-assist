import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTemplateConfig } from './formTemplates';

const installChromeStorageMock = (): void => {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
    },
  };
};

describe('formTemplates defaults', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installChromeStorageMock();
  });

  it('uses structural checkout selectors instead of dynamic hashed classes', async () => {
    const config = await loadTemplateConfig('pl');
    const checkout = config.forms.find((form) => form.id === 'default-checkout');

    expect(checkout).toBeDefined();

    const selectors = checkout?.fields.map((field) => field.selector) ?? [];

    expect(selectors).toEqual([
      'main section > div:nth-of-type(1) input[type="text"]',
      'main section > div:nth-of-type(2) input[type="text"]',
      'main section > div:nth-of-type(3) input[type="text"]',
      'main section > div:nth-of-type(4) input[type="tel"]',
    ]);

    expect(selectors.some((selector) => selector.includes('CartForm_'))).toBe(false);
  });
});

