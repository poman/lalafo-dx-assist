export const SUPPORTED_MARKETS = ['pl', 'kg', 'az', 'rs', 'gr'] as const;

export type MarketCode = (typeof SUPPORTED_MARKETS)[number];

