import { getMarketTestData } from '../shared/config/testData';
import type { FormFillPayload, LoginPayload, OrderPayload, RegistrationPayload } from '../shared/types/messages';
import type { MarketCode } from '../shared/types/region';

const STORAGE_KEY = 'formFillerTemplateConfigByMarket';

export type BaseTemplateType = 'login' | 'registration' | 'checkout';
export type TemplateType = BaseTemplateType | 'custom';

export interface ITemplateField {
  id: string;
  key: string;
  label: string;
  selector: string;
  value: string;
  inputKind: 'text' | 'password' | 'tel' | 'email' | 'checkbox';
}

export interface ITemplateForm {
  id: string;
  name: string;
  type: TemplateType;
  fields: ITemplateField[];
  isDefault?: boolean;
}

export interface IMarketTemplateConfig {
  forms: ITemplateForm[];
  activeByType: Record<TemplateType, string>;
}

type ITemplateStorage = Partial<Record<MarketCode, IMarketTemplateConfig>>;

const makeId = (): string => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const field = (
  key: string,
  label: string,
  selector: string,
  value: string,
  inputKind: ITemplateField['inputKind'],
): ITemplateField => ({
  id: makeId(),
  key,
  label,
  selector,
  value,
  inputKind,
});

const getDefaultConfig = (market: MarketCode): IMarketTemplateConfig => {
  const defaults = getMarketTestData(market);

  const loginPhoneId = 'default-login-john-phone';
  const loginEmailId = 'default-login-jane-email';
  const registrationId = 'default-registration';
  const checkoutId = 'default-checkout';
  const customId = 'default-custom';

  const johnPhone = defaults.registration.phone;

  return {
    forms: [
      {
        id: loginPhoneId,
        name: 'John (Phone)',
        type: 'login',
        isDefault: true,
        fields: [
          field('emailOrPhone', 'Phone', 'form input[type="text"]', johnPhone, 'text'),
          field('password', 'Password', 'form input[type="password"]', defaults.login.password, 'password'),
        ],
      },
      {
        id: loginEmailId,
        name: 'Jane (Email)',
        type: 'login',
        isDefault: true,
        fields: [
          field('emailOrPhone', 'Email or phone', 'form input[type="text"]', defaults.login.emailOrPhone, 'text'),
          field('password', 'Password', 'form input[type="password"]', defaults.login.password, 'password'),
        ],
      },
      {
        id: registrationId,
        name: 'Standard Registration',
        type: 'registration',
        isDefault: true,
        fields: [
          field('phone', 'Phone', 'input[type="tel"]', defaults.registration.phone, 'tel'),
          field('password', 'Password', 'input[type="password"]', defaults.registration.password, 'password'),
          field(
            'acceptRules',
            'Accept rules',
            'input[type="checkbox"]',
            String(defaults.registration.acceptRules),
            'checkbox',
          ),
        ],
      },
      {
        id: checkoutId,
        name: 'Standard Order (John Doe)',
        type: 'checkout',
        isDefault: true,
        fields: [
          field(
            'firstName',
            'First name',
            '.CartForm_cartFormList__0hsyT .cartFormListItem:nth-of-type(1) input[type="text"]',
            defaults.order.firstName,
            'text',
          ),
          field(
            'lastName',
            'Last name',
            '.CartForm_cartFormList__0hsyT .cartFormListItem:nth-of-type(2) input[type="text"]',
            defaults.order.lastName,
            'text',
          ),
          field(
            'email',
            'Email',
            '.CartForm_cartFormList__0hsyT .cartFormListItem:nth-of-type(3) input[type="text"]',
            defaults.order.email,
            'email',
          ),
          field(
            'phone',
            'Phone',
            '.CartForm_cartFormList__0hsyT .cartFormListItem:nth-of-type(4) input[type="tel"]',
            defaults.order.phone,
            'tel',
          ),
        ],
      },
      {
        id: customId,
        name: 'Custom Template',
        type: 'custom',
        isDefault: true,
        fields: [field('customField', 'Custom field', 'form input[type="text"]', '', 'text')],
      },
    ],
    activeByType: {
      login: loginPhoneId,
      registration: registrationId,
      checkout: checkoutId,
      custom: customId,
    },
  };
};

const normalizeConfig = (market: MarketCode, config: IMarketTemplateConfig): IMarketTemplateConfig => {
  const defaults = getDefaultConfig(market);

  const forms = Array.isArray(config.forms) ? config.forms : [];
  if (forms.length === 0) {
    return defaults;
  }

  const firstByType = (type: TemplateType): string => {
    const match = forms.find((item) => item.type === type);
    return match ? match.id : defaults.activeByType[type];
  };

  const configActiveByType = (config.activeByType ?? {}) as Partial<Record<TemplateType, string>>;

  return {
    forms,
    activeByType: {
      login:
        forms.some((item) => item.id === configActiveByType.login && item.type === 'login')
          ? (configActiveByType.login as string)
          : firstByType('login'),
      registration:
        forms.some((item) => item.id === configActiveByType.registration && item.type === 'registration')
          ? (configActiveByType.registration as string)
          : firstByType('registration'),
      checkout:
        forms.some((item) => item.id === configActiveByType.checkout && item.type === 'checkout')
          ? (configActiveByType.checkout as string)
          : firstByType('checkout'),
      custom:
        forms.some((item) => item.id === configActiveByType.custom && item.type === 'custom')
          ? (configActiveByType.custom as string)
          : firstByType('custom'),
    },
  };
};

export const loadTemplateConfig = async (market: MarketCode): Promise<IMarketTemplateConfig> => {
  const storage = (await chrome.storage.local.get([STORAGE_KEY])) as Record<string, unknown>;
  const byMarket = (storage[STORAGE_KEY] as ITemplateStorage | undefined) ?? {};
  const existing = byMarket[market];

  if (!existing) {
    return getDefaultConfig(market);
  }

  return normalizeConfig(market, existing);
};

export const saveTemplateConfig = async (
  market: MarketCode,
  config: IMarketTemplateConfig,
): Promise<void> => {
  const storage = (await chrome.storage.local.get([STORAGE_KEY])) as Record<string, unknown>;
  const byMarket = (storage[STORAGE_KEY] as ITemplateStorage | undefined) ?? {};

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...byMarket,
      [market]: config,
    },
  });
};

const getFormByType = (config: IMarketTemplateConfig, type: BaseTemplateType): ITemplateForm | null => {
  const activeId = config.activeByType[type];
  const selected = config.forms.find((item) => item.id === activeId && item.type === type);
  if (selected) {
    return selected;
  }

  return config.forms.find((item) => item.type === type) ?? null;
};

const readField = (form: ITemplateForm | null, key: string, fallback: string): string => {
  if (!form) {
    return fallback;
  }

  const match = form.fields.find((item) => item.key === key);
  return match ? match.value : fallback;
};

export const configToPayload = (market: MarketCode, config: IMarketTemplateConfig): FormFillPayload => {
  const defaults = getMarketTestData(market);

  const loginForm = getFormByType(config, 'login');
  const registrationForm = getFormByType(config, 'registration');
  const checkoutForm = getFormByType(config, 'checkout');

  const login: LoginPayload = {
    emailOrPhone: readField(loginForm, 'emailOrPhone', defaults.login.emailOrPhone),
    password: readField(loginForm, 'password', defaults.login.password),
  };

  const registration: RegistrationPayload = {
    phone: readField(registrationForm, 'phone', defaults.registration.phone),
    password: readField(registrationForm, 'password', defaults.registration.password),
    acceptRules: readField(registrationForm, 'acceptRules', String(defaults.registration.acceptRules)) === 'true',
  };

  const order: OrderPayload = {
    firstName: readField(checkoutForm, 'firstName', defaults.order.firstName),
    lastName: readField(checkoutForm, 'lastName', defaults.order.lastName),
    email: readField(checkoutForm, 'email', defaults.order.email),
    phone: readField(checkoutForm, 'phone', defaults.order.phone),
  };

  return { login, registration, order };
};

export const createCustomForm = (type: TemplateType, name: string): ITemplateForm => {
  const id = `custom-${makeId()}`;

  if (type === 'login') {
    return {
      id,
      name,
      type,
      fields: [
        field('emailOrPhone', 'Email or phone', 'form input[type="text"]', '', 'text'),
        field('password', 'Password', 'form input[type="password"]', '', 'password'),
      ],
    };
  }

  if (type === 'registration') {
    return {
      id,
      name,
      type,
      fields: [
        field('phone', 'Phone', 'form input[type="tel"]', '', 'tel'),
        field('password', 'Password', 'form input[type="password"]', '', 'password'),
        field('acceptRules', 'Accept rules', 'form input[type="checkbox"]', 'true', 'checkbox'),
      ],
    };
  }

  if (type === 'custom') {
    return {
      id,
      name,
      type,
      fields: [field('customField', 'Custom field', 'form input[type="text"]', '', 'text')],
    };
  }

  return {
    id,
    name,
    type,
    fields: [
      field('firstName', 'First name', 'form input[type="text"]:nth-of-type(1)', '', 'text'),
      field('lastName', 'Last name', 'form input[type="text"]:nth-of-type(2)', '', 'text'),
      field('email', 'Email', 'form input[type="text"]:nth-of-type(3)', '', 'email'),
      field('phone', 'Phone', 'form input[type="tel"]', '', 'tel'),
    ],
  };
};

export const createCustomField = (): ITemplateField =>
  field(`customField-${makeId()}`, 'Custom field', '', '', 'text');

