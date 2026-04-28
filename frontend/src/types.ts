export interface RiskFlag {
  level: 'red' | 'yellow' | 'green';
  msg: string;
}

export interface HistoricalROIC {
  year: string;
  roic_pct: number;
  wacc_pct: number;
}

export interface QualityMetrics {
  roic: number | null;
  roic_spread: number | null;
  historical_roic: HistoricalROIC[];
  epv_per_share: number | null;
  graham_number: number | null;
  implied_growth: number | null;
  fwd_revenue_growth: number | null;
  fwd_earnings_growth: number | null;
  analyst_eps_growth: number | null;
  dcf_intrinsic: number;
  risk_flags: RiskFlag[];
}

export interface FinancialRow {
  'Fiscal Year': string;
  [key: string]: any; // Allow for dynamic financial metrics
}

export interface DCFSummary {
  'Intrinsic Value/Share ($)': number;
  'Current Price ($)': number;
  'Upside/Downside %': number;
  'Currency': string;
  'Currency Warning'?: string | null;
  'WACC': number;
  'Assumed FCF Growth Rate': number;
  'Terminal Growth Rate': number;
  'Base FCF ($)': number;
  [key: string]: any;
}

export interface ValuationData {
  ticker: string;
  info: {
    shortName?: string;
    sector?: string;
    industry?: string;
    marketCap?: number;
    beta?: number;
    trailingPE?: number;
    priceToBook?: number;
    [key: string]: any;
  };
  raw_financials: FinancialRow[];
  derived_metrics: FinancialRow[];
  wacc_inputs: {
    'Beta'?: number;
    'Raw Beta'?: number;
    'Cost of Equity (CAPM)'?: number;
    'Cost of Debt (After-Tax)'?: number;
    'Equity Risk Premium'?: number;
    [key: string]: any;
  };
  dcf_projection: any[];
  dcf_summary: DCFSummary;
  comps_snapshot: any;
  price_history: any[];
  quality_metrics: QualityMetrics;
}

export interface PeerData {
  Ticker: string;
  'EV/Revenue'?: number;
  'EV/EBITDA'?: number;
  'P/E (TTM)'?: number;
  'P/E (Forward)'?: number;
  'P/B'?: number;
  'P/S'?: number;
  'EV/FCF'?: number;
  'Net Margin %'?: number;
  'ROE %'?: number;
  'EV ($)'?: number;
  'Market Cap ($)'?: number;
  [key: string]: any;
}
