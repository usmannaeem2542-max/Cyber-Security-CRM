import type { CurrencyCode } from '../types/crm';

const AED_TO_USD = 0.272294;

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;
  if (from === 'AED' && to === 'USD') return amount * AED_TO_USD;
  return amount / AED_TO_USD;
}

export function formatMoney(
  amount: number,
  sourceCurrency: CurrencyCode = 'AED',
  displayCurrency: CurrencyCode = 'AED'
): string {
  const converted = convertCurrency(amount, sourceCurrency, displayCurrency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency,
    maximumFractionDigits: 0,
  }).format(Math.round(converted));
}

export function formatCompactMoney(
  amount: number,
  sourceCurrency: CurrencyCode = 'AED',
  displayCurrency: CurrencyCode = 'AED'
): string {
  const converted = convertCurrency(amount, sourceCurrency, displayCurrency);
  if (converted >= 1_000_000) {
    return `${displayCurrency} ${(converted / 1_000_000).toFixed(2)}M`;
  }
  if (converted >= 1_000) {
    return `${displayCurrency} ${(converted / 1_000).toFixed(1)}K`;
  }
  return `${displayCurrency} ${Math.round(converted)}`;
}
