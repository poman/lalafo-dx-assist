import type { FormFillPayload } from '../types/messages';
import type { MarketCode } from '../types/region';

export const MARKET_TEST_DATA = {
  pl: {
    login: {
      emailOrPhone: 'qa.pl@lalafo.test',
      password: 'Pl_Test_123!',
    },
    registration: {
      phone: '+48500111222',
      password: 'Pl_Reg_123!',
      acceptRules: true,
    },
    order: {
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'order.pl@lalafo.test',
      phone: '+48500999888',
    },
  },
  kg: {
    login: {
      emailOrPhone: 'qa.kg@lalafo.test',
      password: 'Kg_Test_123!',
    },
    registration: {
      phone: '+996700111222',
      password: 'Kg_Reg_123!',
      acceptRules: true,
    },
    order: {
      firstName: 'Aibek',
      lastName: 'Sadykov',
      email: 'order.kg@lalafo.test',
      phone: '+996700999888',
    },
  },
  az: {
    login: {
      emailOrPhone: 'qa.az@lalafo.test',
      password: 'Az_Test_123!',
    },
    registration: {
      phone: '+994501112233',
      password: 'Az_Reg_123!',
      acceptRules: true,
    },
    order: {
      firstName: 'Elvin',
      lastName: 'Mammadov',
      email: 'order.az@lalafo.test',
      phone: '+994509998877',
    },
  },
  rs: {
    login: {
      emailOrPhone: 'qa.rs@lalafo.test',
      password: 'Rs_Test_123!',
    },
    registration: {
      phone: '+381601112233',
      password: 'Rs_Reg_123!',
      acceptRules: true,
    },
    order: {
      firstName: 'Milan',
      lastName: 'Petrovic',
      email: 'order.rs@lalafo.test',
      phone: '+381609998877',
    },
  },
  gr: {
    login: {
      emailOrPhone: 'qa.gr@lalafo.test',
      password: 'Gr_Test_123!',
    },
    registration: {
      phone: '+306901112233',
      password: 'Gr_Reg_123!',
      acceptRules: true,
    },
    order: {
      firstName: 'Nikos',
      lastName: 'Papadopoulos',
      email: 'order.gr@lalafo.test',
      phone: '+306909998877',
    },
  },
} satisfies Record<MarketCode, FormFillPayload>;

export const getMarketTestData = (market: MarketCode): FormFillPayload => {
  return MARKET_TEST_DATA[market];
};

