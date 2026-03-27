import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketTestData } from '../shared/config/testData';
import {
  FILL_FORM_REQUEST_TYPE,
  type FillFormRequest,
} from '../shared/types/messages';
import { fillDetectedForm } from './formFiller';

const createRequest = (): FillFormRequest => ({
  type: FILL_FORM_REQUEST_TYPE,
  market: 'pl',
  payload: getMarketTestData('pl'),
});

const makeInputVisible = (input: HTMLInputElement): void => {
  Object.defineProperty(input, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 40,
      width: 200,
      height: 40,
      toJSON: () => ({}),
    }),
  });
};

const setFixture = (html: string): void => {
  document.body.innerHTML = html;
  document.querySelectorAll<HTMLInputElement>('input').forEach(makeInputVisible);
};

describe('fillDetectedForm', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects and fills login form from structural selectors', () => {
    setFixture(`
      <form data-testid="login-form">
        <input type="text" />
        <input type="password" />
      </form>
    `);

    const request = createRequest();
    const response = fillDetectedForm(request);

    const textInput = document.querySelector<HTMLInputElement>('input[type="text"]');
    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');

    expect(response.success).toBe(true);
    expect(response.detectedFormKind).toBe('login');
    expect(textInput?.value).toBe(request.payload.login.emailOrPhone);
    expect(passwordInput?.value).toBe(request.payload.login.password);
  });

  it('detects and fills registration form and checks rules checkbox', () => {
    setFixture(`
      <form data-testid="registration-form">
        <input type="tel" />
        <input type="password" />
        <input type="checkbox" />
      </form>
    `);

    const request = createRequest();
    const response = fillDetectedForm(request);

    const telInput = document.querySelector<HTMLInputElement>('input[type="tel"]');
    const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
    const checkboxInput = document.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(response.success).toBe(true);
    expect(response.detectedFormKind).toBe('registration');
    expect(telInput?.value).toBe(request.payload.registration.phone);
    expect(passwordInput?.value).toBe(request.payload.registration.password);
    expect(checkboxInput?.checked).toBe(true);
  });

  it('detects and fills order form from input type structure only', () => {
    setFixture(`
      <form data-testid="order-form">
        <input type="text" />
        <input type="text" />
        <input type="text" />
        <input type="tel" />
      </form>
    `);

    const request = createRequest();
    const response = fillDetectedForm(request);

    const textInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]');
    const phoneInput = document.querySelector<HTMLInputElement>('input[type="tel"]');

    expect(response.success).toBe(true);
    expect(response.detectedFormKind).toBe('order');
    expect(textInputs[0]?.value).toBe(request.payload.order.firstName);
    expect(textInputs[1]?.value).toBe(request.payload.order.lastName);
    expect(textInputs[2]?.value).toBe(request.payload.order.email);
    expect(phoneInput?.value).toBe(request.payload.order.phone);
  });

  it('keeps detection within a coherent container on non-form pages', () => {
    setFixture(`
      <div id="fragment-a">
        <input type="text" />
      </div>
      <div id="fragment-b">
        <input type="password" />
      </div>
      <div id="order-container">
        <input type="text" />
        <input type="text" />
        <input type="text" />
        <input type="tel" />
      </div>
    `);

    const request = createRequest();
    const response = fillDetectedForm(request);

    const fragmentText = document.querySelector<HTMLInputElement>('#fragment-a input[type="text"]');
    const fragmentPassword = document.querySelector<HTMLInputElement>(
      '#fragment-b input[type="password"]',
    );
    const orderInputs = document.querySelectorAll<HTMLInputElement>('#order-container input[type="text"]');
    const orderPhone = document.querySelector<HTMLInputElement>('#order-container input[type="tel"]');

    expect(response.success).toBe(true);
    expect(response.detectedFormKind).toBe('order');
    expect(fragmentText?.value).toBe('');
    expect(fragmentPassword?.value).toBe('');
    expect(orderInputs[0]?.value).toBe(request.payload.order.firstName);
    expect(orderInputs[1]?.value).toBe(request.payload.order.lastName);
    expect(orderInputs[2]?.value).toBe(request.payload.order.email);
    expect(orderPhone?.value).toBe(request.payload.order.phone);
  });

  it('applies kind priority inside each container instead of globally by kind', () => {
    setFixture(`
      <form id="login-first">
        <input type="text" />
        <input type="password" />
      </form>
      <form id="order-second">
        <input type="text" />
        <input type="text" />
        <input type="text" />
        <input type="tel" />
      </form>
    `);

    const request = createRequest();
    const response = fillDetectedForm(request);

    const loginInputs = document.querySelectorAll<HTMLInputElement>('#login-first input');
    const orderFirstName = document.querySelector<HTMLInputElement>('#order-second input[type="text"]');

    expect(response.success).toBe(true);
    expect(response.detectedFormKind).toBe('login');
    expect(loginInputs[0]?.value).toBe(request.payload.login.emailOrPhone);
    expect(loginInputs[1]?.value).toBe(request.payload.login.password);
    expect(orderFirstName?.value).toBe('');
  });

  it('uses native value setter and dispatches bubbling input events for text fields', () => {
    setFixture(`
      <form id="login-form">
        <input type="text" />
        <input type="password" />
      </form>
    `);

    const descriptorSpy = vi.spyOn(Object, 'getOwnPropertyDescriptor');
    const form = document.getElementById('login-form');
    const inputTargets: EventTarget[] = [];

    form?.addEventListener('input', (event) => {
      inputTargets.push(event.target as EventTarget);
    });

    const response = fillDetectedForm(createRequest());
    const formInputs = form?.querySelectorAll('input') ?? [];

    expect(response.success).toBe(true);
    expect(descriptorSpy.mock.calls.some((call) => call[1] === 'value')).toBe(true);
    expect(inputTargets).toHaveLength(2);
    expect(inputTargets[0]).toBe(formInputs[0]);
    expect(inputTargets[1]).toBe(formInputs[1]);

    descriptorSpy.mockRestore();
  });

  it('dispatches bubbling change event when checking registration rules checkbox', () => {
    setFixture(`
      <form id="registration-form">
        <input type="tel" />
        <input type="password" />
        <input type="checkbox" />
      </form>
    `);

    const form = document.getElementById('registration-form');
    const checkbox = form?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
    const changeTargets: EventTarget[] = [];

    form?.addEventListener('change', (event) => {
      changeTargets.push(event.target as EventTarget);
    });

    const response = fillDetectedForm(createRequest());

    expect(response.success).toBe(true);
    expect(checkbox?.checked).toBe(true);
    expect(changeTargets).toHaveLength(1);
    expect(changeTargets[0]).toBe(checkbox);
  });
});




