import {
  FILL_FORM_RESPONSE_TYPE,
  type FillFormRequest,
  type FillFormResponse,
} from '../shared/types/messages';

type FormMatch =
  | {
      kind: 'login';
      emailOrPhoneInput: HTMLInputElement;
      passwordInput: HTMLInputElement;
    }
  | {
      kind: 'registration';
      phoneInput: HTMLInputElement;
      passwordInput: HTMLInputElement;
      acceptRulesInput: HTMLInputElement;
    }
  | {
      kind: 'order';
      firstNameInput: HTMLInputElement;
      lastNameInput: HTMLInputElement;
      emailInput: HTMLInputElement;
      phoneInput: HTMLInputElement;
    };

type FormContainer = ParentNode;

const NON_FORM_CONTAINER_SELECTOR = '[role="form"], fieldset, section, article, main, aside, div';

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

const getVisibleInputsByType = (container: FormContainer, type: string): HTMLInputElement[] => {
  return Array.from(container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)).filter(
    isVisibleInput,
  );
};

const getAllVisibleRelevantInputs = (): HTMLInputElement[] => {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="password"], input[type="tel"], input[type="checkbox"]',
    ),
  ).filter(isVisibleInput);
};

const getNearestCoherentContainer = (input: HTMLInputElement): FormContainer | null => {
  const closestContainer = input.closest(NON_FORM_CONTAINER_SELECTOR);
  if (closestContainer) {
    return closestContainer;
  }

  return input.parentElement;
};

const getCandidateContainers = (): FormContainer[] => {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
  if (forms.length > 0) {
    return forms;
  }

  const containers: FormContainer[] = [];
  const seenContainers = new Set<FormContainer>();

  for (const input of getAllVisibleRelevantInputs()) {
    const container = getNearestCoherentContainer(input);
    if (!container || seenContainers.has(container)) {
      continue;
    }

    seenContainers.add(container);
    containers.push(container);
  }

  return containers;
};

const detectRegistrationInContainer = (container: FormContainer): FormMatch | null => {
  const telInputs = getVisibleInputsByType(container, 'tel');
  const passwordInputs = getVisibleInputsByType(container, 'password');
  const checkboxInputs = getVisibleInputsByType(container, 'checkbox');

  if (telInputs.length < 1 || passwordInputs.length < 1 || checkboxInputs.length < 1) {
    return null;
  }

  return {
    kind: 'registration',
    phoneInput: telInputs[0],
    passwordInput: passwordInputs[0],
    acceptRulesInput: checkboxInputs[0],
  };
};

const detectOrderInContainer = (container: FormContainer): FormMatch | null => {
  const textInputs = getVisibleInputsByType(container, 'text');
  const telInputs = getVisibleInputsByType(container, 'tel');

  if (textInputs.length < 3 || telInputs.length < 1) {
    return null;
  }

  return {
    kind: 'order',
    firstNameInput: textInputs[0],
    lastNameInput: textInputs[1],
    emailInput: textInputs[2],
    phoneInput: telInputs[0],
  };
};

const detectLoginInContainer = (container: FormContainer): FormMatch | null => {
  const textInputs = getVisibleInputsByType(container, 'text');
  const passwordInputs = getVisibleInputsByType(container, 'password');

  if (textInputs.length < 1 || passwordInputs.length < 1) {
    return null;
  }

  return {
    kind: 'login',
    emailOrPhoneInput: textInputs[0],
    passwordInput: passwordInputs[0],
  };
};

const detectForm = (): FormMatch | null => {
  const containers = getCandidateContainers();

  for (const container of containers) {
    const registration = detectRegistrationInContainer(container);
    if (registration) {
      return registration;
    }

    const order = detectOrderInContainer(container);
    if (order) {
      return order;
    }

    const login = detectLoginInContainer(container);
    if (login) {
      return login;
    }
  }

  return null;
};

const setInputValueReactSafe = (inputElement: HTMLInputElement, value: string): boolean => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;

  if (!nativeInputValueSetter) {
    return false;
  }

  nativeInputValueSetter.call(inputElement, value);
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

const setCheckboxCheckedReactSafe = (checkboxElement: HTMLInputElement): boolean => {
  const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'checked',
  )?.set;

  if (!nativeCheckedSetter) {
    return false;
  }

  nativeCheckedSetter.call(checkboxElement, true);
  checkboxElement.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

export const fillDetectedForm = (request: FillFormRequest): FillFormResponse => {
  const diagnostics: FillFormResponse['diagnostics'] = [];
  const detectedForm = detectForm();

  if (!detectedForm) {
    diagnostics.push({
      code: 'FORM_NOT_DETECTED',
      message: 'No supported form structure detected on this page.',
    });

    return {
      type: FILL_FORM_RESPONSE_TYPE,
      success: false,
      error: 'FORM_NOT_FOUND',
      detectedFormKind: 'unknown',
      diagnostics,
    };
  }

  if (detectedForm.kind === 'login') {
    const loginPayload = request.payload.login;

    if (!setInputValueReactSafe(detectedForm.emailOrPhoneInput, loginPayload.emailOrPhone)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set login identifier input.',
      });
    }

    if (!setInputValueReactSafe(detectedForm.passwordInput, loginPayload.password)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set login password input.',
      });
    }
  }

  if (detectedForm.kind === 'registration') {
    const registrationPayload = request.payload.registration;

    if (!setInputValueReactSafe(detectedForm.phoneInput, registrationPayload.phone)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set registration phone input.',
      });
    }

    if (!setInputValueReactSafe(detectedForm.passwordInput, registrationPayload.password)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set registration password input.',
      });
    }

    if (!setCheckboxCheckedReactSafe(detectedForm.acceptRulesInput)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to check registration rules checkbox.',
      });
    }
  }

  if (detectedForm.kind === 'order') {
    const orderPayload = request.payload.order;

    if (!setInputValueReactSafe(detectedForm.firstNameInput, orderPayload.firstName)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set order first name input.',
      });
    }

    if (!setInputValueReactSafe(detectedForm.lastNameInput, orderPayload.lastName)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set order last name input.',
      });
    }

    if (!setInputValueReactSafe(detectedForm.emailInput, orderPayload.email)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set order email input.',
      });
    }

    if (!setInputValueReactSafe(detectedForm.phoneInput, orderPayload.phone)) {
      diagnostics.push({
        code: 'FIELD_WRITE_FAILED',
        message: 'Failed to set order phone input.',
      });
    }
  }

  if (diagnostics.length > 0) {
    return {
      type: FILL_FORM_RESPONSE_TYPE,
      success: false,
      error: 'FILL_FAILED',
      detectedFormKind: detectedForm.kind,
      diagnostics,
    };
  }

  return {
    type: FILL_FORM_RESPONSE_TYPE,
    success: true,
    detectedFormKind: detectedForm.kind,
    diagnostics,
  };
};


