import {
  FILL_FORM_RESPONSE_TYPE,
  FILL_FORM_REQUEST_TYPE,
  type FillFormResponse,
  type FillFormRequest,
} from '../shared/types/messages';
import { SUPPORTED_MARKETS } from '../shared/types/region';
import { fillDetectedForm } from './formFiller';
import './a11yScanner';
import './seoScanner';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isSupportedMarket = (value: unknown): value is FillFormRequest['market'] =>
  isString(value) && SUPPORTED_MARKETS.includes(value as FillFormRequest['market']);

const createInvalidRequestResponse = (): FillFormResponse => ({
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

const isLoginPayload = (value: unknown): value is FillFormRequest['payload']['login'] => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isString(value.emailOrPhone) && isString(value.password);
};

const isRegistrationPayload = (
  value: unknown,
): value is FillFormRequest['payload']['registration'] => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return isString(value.phone) && isString(value.password) && isBoolean(value.acceptRules);
};

const isOrderPayload = (value: unknown): value is FillFormRequest['payload']['order'] => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isString(value.firstName) &&
    isString(value.lastName) &&
    isString(value.email) &&
    isString(value.phone)
  );
};

const isFormFillPayload = (value: unknown): value is FillFormRequest['payload'] => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isLoginPayload(value.login) &&
    isRegistrationPayload(value.registration) &&
    isOrderPayload(value.order)
  );
};

const isFillFormRequest = (message: unknown): message is FillFormRequest => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return (
    message.type === FILL_FORM_REQUEST_TYPE &&
    isSupportedMarket(message.market) &&
    isFormFillPayload(message.payload)
  );
};

const isFillFormMessage = (message: unknown): boolean => {
  if (!isObjectRecord(message)) {
    return false;
  }

  return message.type === FILL_FORM_REQUEST_TYPE;
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isFillFormMessage(message)) {
    return false;
  }

  if (!isFillFormRequest(message)) {
    sendResponse(createInvalidRequestResponse());
    return false;
  }

  try {
    sendResponse(fillDetectedForm(message));
  } catch {
    sendResponse(createInvalidRequestResponse());
  }

  return false;
});




