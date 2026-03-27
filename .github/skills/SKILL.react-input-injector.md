---
name: react-input-injector
description: 'Safely set values in React-controlled form fields from content scripts by using native setters and bubbling events.'
argument-hint: 'Use for login/autofill tasks where direct input.value assignment is ignored by React synthetic events.'
---

# React Input Injector Skill

Use this skill when a content script must fill form inputs rendered by React (or similar virtual-DOM frameworks) and plain `element.value = ...` is not reliable.

## When to Apply

- Target page is a SPA and field values do not update app state after direct assignment.
- Inputs are controlled components.
- You need deterministic autofill before submit.

## Rules

1. Never rely on locale text or placeholder selectors.
2. Prefer stable selectors in this order: `input[type]`, `input[name]`, form-scoped structural selectors.
3. Resolve both identifier and password inside the same `<form>`.
4. Read credentials from `chrome.storage.local` only.

## Reusable Helper (TypeScript)

```ts
export interface IInjectInputOptions {
  value: string;
  dispatchChange?: boolean;
}

export const injectReactInputValue = (
  input: HTMLInputElement,
  options: IInjectInputOptions,
): void => {
  const { value, dispatchChange = true } = options;
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  );

  if (!descriptor?.set) {
    // Hard fallback if browser internals are unavailable.
    input.value = value;
  } else {
    descriptor.set.call(input, value);
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));

  if (dispatchChange) {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
};
```

## Content Script Example

```ts
interface ICredentials {
  login?: string;
  password?: string;
}

const getCredentials = async (): Promise<ICredentials> => {
  const data = await chrome.storage.local.get(['login', 'password']);
  return {
    login: typeof data.login === 'string' ? data.login : undefined,
    password: typeof data.password === 'string' ? data.password : undefined,
  };
};

const findLoginFormInputs = (): { login: HTMLInputElement; password: HTMLInputElement } | null => {
  const forms = Array.from(document.querySelectorAll('form'));

  for (const form of forms) {
    const password = form.querySelector('input[type="password"]');
    const login =
      form.querySelector('input[type="email"]') ||
      form.querySelector('input[type="text"]') ||
      form.querySelector('input[name*="email" i]') ||
      form.querySelector('input[name*="phone" i]');

    if (login instanceof HTMLInputElement && password instanceof HTMLInputElement) {
      return { login, password };
    }
  }

  return null;
};

export const autofillLoginForm = async (): Promise<boolean> => {
  const { login, password } = await getCredentials();
  if (!login || !password) return false;

  const fields = findLoginFormInputs();
  if (!fields) return false;

  injectReactInputValue(fields.login, { value: login });
  injectReactInputValue(fields.password, { value: password });
  return true;
};
```

## Failure Strategy

- If fields are not found, return a typed status (`not_found`) and stop.
- If storage is empty, return `no_credentials` and stop.
- Do not throw unhandled exceptions from content script execution path.

## Review Checklist

- No placeholder/text-based selectors.
- No hashed class-name dependencies.
- Uses native setter and dispatches `input` event.
- Uses `chrome.storage.local`.
- Works with region-agnostic DOM patterns.

