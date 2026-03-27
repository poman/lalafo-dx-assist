import type { MarketCode } from './region';

export const FILL_FORM_REQUEST_TYPE = 'FILL_FORM' as const;
export const FILL_FORM_RESPONSE_TYPE = 'FILL_FORM_RESULT' as const;

export type FormKind = 'login' | 'registration' | 'order' | 'unknown';

export interface LoginPayload {
  emailOrPhone: string;
  password: string;
}

export interface RegistrationPayload {
  phone: string;
  password: string;
  acceptRules: boolean;
}

export interface OrderPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface FormFillPayload {
  login: LoginPayload;
  registration: RegistrationPayload;
  order: OrderPayload;
}

export interface FillFormRequest {
  type: typeof FILL_FORM_REQUEST_TYPE;
  market: MarketCode;
  payload: FormFillPayload;
}

export type FillFormDiagnosticCode =
  | 'FORM_NOT_DETECTED'
  | 'FIELD_NOT_FOUND'
  | 'FIELD_WRITE_FAILED'
  | 'INVALID_PAYLOAD'
  | 'UNEXPECTED_ERROR';

export interface FillFormDiagnostic {
  code: FillFormDiagnosticCode;
  message: string;
}

interface FillFormResponseBase {
  type: typeof FILL_FORM_RESPONSE_TYPE;
  detectedFormKind: FormKind;
  diagnostics: FillFormDiagnostic[];
}

export interface FillFormSuccessResponse extends FillFormResponseBase {
  success: true;
}

export interface FillFormFailureResponse extends FillFormResponseBase {
  success: false;
  error: 'FORM_NOT_FOUND' | 'FILL_FAILED' | 'INVALID_REQUEST';
}

export type FillFormResponse = FillFormSuccessResponse | FillFormFailureResponse;

export type FormFillerRequestMessage = FillFormRequest;
export type FormFillerResponseMessage = FillFormResponse;

