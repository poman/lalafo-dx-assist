import type { MarketCode } from './region';

export const FILL_FORM_REQUEST_TYPE = 'FILL_FORM' as const;
export const FILL_FORM_RESPONSE_TYPE = 'FILL_FORM_RESULT' as const;
export const REQUEST_A11Y_SCAN_TYPE = 'REQUEST_A11Y_SCAN' as const;
export const A11Y_SCAN_RESPONSE_TYPE = 'A11Y_SCAN_RESULT' as const;
export const TOGGLE_HIGHLIGHTS_TYPE = 'TOGGLE_HIGHLIGHTS' as const;
export const FOCUS_A11Y_RULE_TYPE = 'FOCUS_A11Y_RULE' as const;

export type FormKind = 'login' | 'registration' | 'order' | 'unknown';
export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical' | null;

export interface A11yViolationNode {
  target: string[];
  summary?: string;
}

export interface A11yViolation {
  id: string;
  impact: A11yImpact;
  description: string;
  help: string;
  helpUrl: string;
  nodes: A11yViolationNode[];
}

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

export interface RequestA11yScanMessage {
  type: typeof REQUEST_A11Y_SCAN_TYPE;
}

export interface ToggleHighlightsMessage {
  type: typeof TOGGLE_HIGHLIGHTS_TYPE;
  enabled: boolean;
}

export interface FocusA11yRuleMessage {
  type: typeof FOCUS_A11Y_RULE_TYPE;
  ruleId: string;
}

export interface RequestA11yScanSuccessResponse {
  type: typeof A11Y_SCAN_RESPONSE_TYPE;
  success: true;
  violations: A11yViolation[];
}

export interface RequestA11yScanFailureResponse {
  type: typeof A11Y_SCAN_RESPONSE_TYPE;
  success: false;
  violations: [];
  error: string;
}

export type RequestA11yScanResponse =
  | RequestA11yScanSuccessResponse
  | RequestA11yScanFailureResponse;

