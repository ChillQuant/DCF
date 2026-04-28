export const getCurrencySymbol = (currency: string = 'USD') => {
  const map: Record<string, string> = { 
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', THB: '฿', 
    HKD: 'HK$', SGD: 'S$', AUD: 'A$', CAD: 'C$', 
    KRW: '₩', INR: '₹', CNY: '¥' 
  };
  return map[currency] || currency + ' ';
};

export const formatFinancialValue = (val: any) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  if (typeof val === 'number') {
    // If it's a small decimal (likely a ratio or percentage)
    if (Math.abs(val) < 100 && !Number.isInteger(val)) {
      return val.toFixed(2);
    }
    // Large numbers formatting
    if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return val;
};

export const formatCurrency = (val: number, symbol: string) => {
  if (val >= 1e9) return `${symbol}${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${symbol}${(val / 1e6).toFixed(2)}M`;
  return `${symbol}${(val || 0).toLocaleString()}`;
};
