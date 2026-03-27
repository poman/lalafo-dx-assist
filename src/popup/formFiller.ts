import { getMarketTestData } from '../shared/config/testData';
import {
  FILL_FORM_REQUEST_TYPE,
  FILL_FORM_RESPONSE_TYPE,
  type FormFillPayload,
  type FillFormRequest,
  type FillFormResponse,
  type FormKind,
} from '../shared/types/messages';
import { SUPPORTED_MARKETS, type MarketCode } from '../shared/types/region';

export type AutoFillPopupStatus =
  | { kind: 'sent' }
  | { kind: 'success'; detectedFormKind: FormKind }
  | { kind: 'failure'; error: FillFormResponseErrorCode }
  | { kind: 'restricted-tab' };

export interface ITemplateRuntimeField {
  selector: string;
  value: string;
  inputKind: 'text' | 'password' | 'tel' | 'email' | 'checkbox';
}

type FillFormResponseErrorCode =
  | FillFormFailureErrorCode
  | 'TAB_QUERY_FAILED'
  | 'SEND_MESSAGE_FAILED'
  | 'NO_RESPONSE'
  | 'INVALID_RESPONSE'
  | 'UNEXPECTED_ERROR';

type FillFormFailureErrorCode = Extract<FillFormResponse, { success: false }>['error'];

export interface IActiveMarketContext {
  tabId: number;
  market: MarketCode;
}

const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
};

const FORM_KINDS: readonly FormKind[] = ['login', 'registration', 'order', 'unknown'];
const FAILURE_ERRORS: readonly Extract<FillFormResponse, { success: false }>['error'][] = [
  'FORM_NOT_FOUND',
  'FILL_FAILED',
  'INVALID_REQUEST',
];

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFillFormResponse = (value: unknown): value is FillFormResponse => {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (value.type !== FILL_FORM_RESPONSE_TYPE || typeof value.success !== 'boolean') {
    return false;
  }

  if (!FORM_KINDS.includes(value.detectedFormKind as FormKind)) {
    return false;
  }

  if (!Array.isArray(value.diagnostics)) {
    return false;
  }

  if (
    value.diagnostics.some(
      (item) =>
        !isObjectRecord(item) || typeof item.code !== 'string' || typeof item.message !== 'string',
    )
  ) {
    return false;
  }

  if (value.success) {
    return true;
  }

  return FAILURE_ERRORS.includes(value.error as (typeof FAILURE_ERRORS)[number]);
};

const getMarketFromUrl = (url?: string): MarketCode | null => {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const market = SUPPORTED_MARKETS.find(
      (code) =>
        parsedUrl.hostname === `lalafo.${code}` ||
        parsedUrl.hostname.endsWith(`.lalafo.${code}`),
    );

    return market ?? null;
  } catch {
    return null;
  }
};

export const resolveActiveTabMarket = async (): Promise<IActiveMarketContext | null> => {
  const activeTab = await getActiveTab();
  if (!activeTab || typeof activeTab.id !== 'number') {
    return null;
  }

  const market = getMarketFromUrl(activeTab.url);
  if (!market) {
    return null;
  }

  return {
    tabId: activeTab.id,
    market,
  };
};

const sendFillFormMessage = (tabId: number, message: FillFormRequest): Promise<FillFormResponse> => {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response?: unknown) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      if (!response) {
        reject(new Error('No response from content script'));
        return;
      }

      if (!isFillFormResponse(response)) {
        reject(new Error('Invalid response shape from content script'));
        return;
      }

      resolve(response);
    });
  });
};

const fillFormViaExecuteScript = async (
  tabId: number,
  payload: FormFillPayload,
): Promise<FillFormResponse> => {
  const results = await chrome.scripting.executeScript<[FormFillPayload], FillFormResponse>({
    target: { tabId },
    args: [payload],
    func: (requestPayload): FillFormResponse => {
      type LocalFormMatch =
        | { kind: 'login'; textInput: HTMLInputElement; passwordInput: HTMLInputElement }
        | {
            kind: 'registration';
            telInput: HTMLInputElement;
            passwordInput: HTMLInputElement;
            checkboxInput: HTMLInputElement;
          }
        | {
            kind: 'order';
            textInputs: [HTMLInputElement, HTMLInputElement, HTMLInputElement];
            telInput: HTMLInputElement;
          };

      const createFail = (
        error: Extract<FillFormResponse, { success: false }>['error'],
        code: FillFormResponse['diagnostics'][number]['code'],
        message: string,
        detectedFormKind: FormKind,
      ): FillFormResponse => ({
        type: 'FILL_FORM_RESULT',
        success: false,
        error,
        detectedFormKind,
        diagnostics: [{ code, message }],
      });

      const isVisibleInput = (input: HTMLInputElement): boolean => {
        if (input.disabled || input.type === 'hidden') {
          return false;
        }

        const style = window.getComputedStyle(input);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }

        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const byType = (container: ParentNode, type: string): HTMLInputElement[] =>
        Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)).filter(
          isVisibleInput,
        );

      const setInputValue = (input: HTMLInputElement, value: string): boolean => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (!setter) {
          return false;
        }

        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };

      const setCheckboxChecked = (input: HTMLInputElement): boolean => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
        if (!setter) {
          return false;
        }

        setter.call(input, true);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const detect = (): LocalFormMatch | null => {
        const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
        const containers: ParentNode[] = forms.length > 0 ? forms : [document];

        for (const container of containers) {
          const tel = byType(container, 'tel');
          const password = byType(container, 'password');
          const checkbox = byType(container, 'checkbox');
          if (tel.length > 0 && password.length > 0 && checkbox.length > 0) {
            return {
              kind: 'registration',
              telInput: tel[0],
              passwordInput: password[0],
              checkboxInput: checkbox[0],
            };
          }

          const text = byType(container, 'text');
          if (text.length >= 3 && tel.length > 0) {
            return {
              kind: 'order',
              textInputs: [text[0], text[1], text[2]],
              telInput: tel[0],
            };
          }

          if (text.length > 0 && password.length > 0) {
            return {
              kind: 'login',
              textInput: text[0],
              passwordInput: password[0],
            };
          }
        }

        return null;
      };

      const detected = detect();
      if (!detected) {
        return createFail('FORM_NOT_FOUND', 'FORM_NOT_DETECTED', 'No supported form was detected.', 'unknown');
      }

      if (detected.kind === 'login') {
        const loginOk = setInputValue(detected.textInput, requestPayload.login.emailOrPhone);
        const passwordOk = setInputValue(detected.passwordInput, requestPayload.login.password);
        if (!loginOk || !passwordOk) {
          return createFail('FILL_FAILED', 'FIELD_WRITE_FAILED', 'Failed to fill login form fields.', 'login');
        }
      }

      if (detected.kind === 'registration') {
        const telOk = setInputValue(detected.telInput, requestPayload.registration.phone);
        const passwordOk = setInputValue(detected.passwordInput, requestPayload.registration.password);
        const checkboxOk = setCheckboxChecked(detected.checkboxInput);

        if (!telOk || !passwordOk || !checkboxOk) {
          return createFail(
            'FILL_FAILED',
            'FIELD_WRITE_FAILED',
            'Failed to fill registration form fields.',
            'registration',
          );
        }
      }

      if (detected.kind === 'order') {
        const firstNameOk = setInputValue(detected.textInputs[0], requestPayload.order.firstName);
        const lastNameOk = setInputValue(detected.textInputs[1], requestPayload.order.lastName);
        const emailOk = setInputValue(detected.textInputs[2], requestPayload.order.email);
        const phoneOk = setInputValue(detected.telInput, requestPayload.order.phone);

        if (!firstNameOk || !lastNameOk || !emailOk || !phoneOk) {
          return createFail('FILL_FAILED', 'FIELD_WRITE_FAILED', 'Failed to fill order form fields.', 'order');
        }
      }

      return {
        type: 'FILL_FORM_RESULT',
        success: true,
        detectedFormKind: detected.kind,
        diagnostics: [],
      };
    },
  });

  const response = results[0]?.result;
  if (!response || !isFillFormResponse(response)) {
    throw new Error('Invalid response shape from executeScript fallback');
  }

  return response;
};

export const dispatchAutoFillToActiveTab = async (
  payloadOverride?: FormFillPayload,
): Promise<AutoFillPopupStatus> => {
  let context: IActiveMarketContext | null = null;
  try {
    context = await resolveActiveTabMarket();
  } catch {
    return { kind: 'failure', error: 'TAB_QUERY_FAILED' };
  }

  if (!context) {
    return { kind: 'restricted-tab' };
  }

  const request: FillFormRequest = {
    type: FILL_FORM_REQUEST_TYPE,
    market: context.market,
    payload: payloadOverride ?? getMarketTestData(context.market),
  };

  let response: FillFormResponse;
  try {
    response = await sendFillFormMessage(context.tabId, request);
  } catch (error) {
    if (error instanceof Error && error.message === 'No response from content script') {
      try {
        response = await fillFormViaExecuteScript(context.tabId, request.payload);
      } catch {
        return { kind: 'failure', error: 'NO_RESPONSE' };
      }
    }

    if (error instanceof Error && error.message === 'Invalid response shape from content script') {
      return { kind: 'failure', error: 'INVALID_RESPONSE' };
    }

    if (error instanceof Error && error.message.includes('Receiving end does not exist')) {
      try {
        response = await fillFormViaExecuteScript(context.tabId, request.payload);
      } catch {
        return { kind: 'failure', error: 'SEND_MESSAGE_FAILED' };
      }
    } else {
      try {
        response = await fillFormViaExecuteScript(context.tabId, request.payload);
      } catch {
        return { kind: 'failure', error: 'SEND_MESSAGE_FAILED' };
      }
    }
  }

  if (response.success) {
    return { kind: 'success', detectedFormKind: response.detectedFormKind };
  }

  return { kind: 'failure', error: response.error };
};

export const applyTemplateFieldsToActiveTab = async (
  fields: ITemplateRuntimeField[],
): Promise<AutoFillPopupStatus> => {
  let context: IActiveMarketContext | null = null;

  try {
    context = await resolveActiveTabMarket();
  } catch {
    return { kind: 'failure', error: 'TAB_QUERY_FAILED' };
  }

  if (!context) {
    return { kind: 'restricted-tab' };
  }

  try {
    const results = await chrome.scripting.executeScript<[ITemplateRuntimeField[]], { ok: boolean }>({
      target: { tabId: context.tabId },
      args: [fields],
      func: (items) => {
        const setInputValue = (input: HTMLInputElement, value: string): boolean => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (!setter) {
            return false;
          }

          setter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        };

        const setChecked = (input: HTMLInputElement, value: string): boolean => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
          if (!setter) {
            return false;
          }

          setter.call(input, value === 'true');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };

        let hasWrite = false;

        for (const item of items) {
          if (!item.selector) {
            continue;
          }

          const input = document.querySelector<HTMLInputElement>(item.selector);
          if (!input) {
            continue;
          }

          const ok = item.inputKind === 'checkbox' ? setChecked(input, item.value) : setInputValue(input, item.value);
          if (ok) {
            hasWrite = true;
          }
        }

        return { ok: hasWrite };
      },
    });

    if (results[0]?.result?.ok === true) {
      return { kind: 'success', detectedFormKind: 'unknown' };
    }

    return { kind: 'failure', error: 'FILL_FAILED' };
  } catch {
    return { kind: 'failure', error: 'SEND_MESSAGE_FAILED' };
  }
};


