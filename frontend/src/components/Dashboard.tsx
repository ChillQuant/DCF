import { useMemo } from 'react';
import type { ValuationData } from '../types';
import { getCurrencySymbol, formatCurrency } from '../utils/formatters';

export function IntrinsicValueSummary({ data, intrinsicOverride }: { data: ValuationData, intrinsicOverride?: number | null }) {
  const summary = data.dcf_summary || {};
  const info = data.info || {};
  
  const baseIntrinsic = summary['Intrinsic Value/Share ($)'] || 0;
  const intrinsic = intrinsicOverride !== undefined && intrinsicOverride !== null ? intrinsicOverride : baseIntrinsic;
  const isOverridden = intrinsicOverride !== undefined && intrinsicOverride !== null;
  const current = summary['Current Price ($)'] || 0;
  const currency = summary['Currency'] || 'USD';
  const currencyWarning = summary['Currency Warning'] || null;
  
  const cs = useMemo(() => getCurrencySymbol(currency), [currency]);
  
  // Recalculate margin dynamically
  const margin = current > 0 ? ((intrinsic / current) - 1) * 100 : 0;
  
  const { statusText, statusClass } = useMemo(() => {
    if (margin > 15) return { statusText: 'UNDERVALUED ✓', statusClass: 'status-undervalued' };
    if (margin < -15) return { statusText: 'OVERVALUED ✗', statusClass: 'status-overvalued' };
    return { statusText: 'FAIRLY VALUED ≈', statusClass: 'status-fair' };
  }, [margin]);

  return (
    <div className="glass-panel" style={{ textAlign: 'center', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {info.shortName || data.ticker}
          </h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>{data.ticker}</span>
        </div>
        <span className={`status-pill ${statusClass}`}>
          {statusText}
        </span>
      </div>
      
      {currencyWarning && (
        <div style={{
          margin: '0 0 16px 0', padding: '12px 16px', borderRadius: 'var(--radius-sm)',
          background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.2)',
          display: 'flex', alignItems: 'flex-start', gap: '8px', textAlign: 'left'
        }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--warning)' }}>
            <strong>Currency Warning:</strong> {currencyWarning} DCF figures are in <strong>{currency}</strong>.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '32px', margin: '16px 0' }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Intrinsic Value {isOverridden && <span style={{ color: 'var(--accent-primary)', marginLeft: '4px' }}>(Custom)</span>}
          </p>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-primary)', lineHeight: 1 }}>
            {cs}{intrinsic.toFixed(2)}
          </p>
        </div>

        <div style={{ width: '1px', height: '60px', background: 'var(--border-color)' }}></div>

        <div style={{ textAlign: 'left' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Market Price
          </p>
          <p style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
            {cs}{current.toFixed(2)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
        <span style={{ fontSize: '1rem', fontWeight: 600, color: margin > 15 ? 'var(--success)' : (margin < -15 ? 'var(--danger)' : 'var(--text-primary)') }}>
          {margin > 0 ? '+' : ''}{margin.toFixed(2)}% Upside
        </span>
        {currency !== 'USD' && (
          <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--accent-primary)' }}>
            {currency}
          </span>
        )}
      </div>

      {info.fiftyTwoWeekLow && info.fiftyTwoWeekHigh && (
        <div style={{ marginTop: '32px', width: '100%', maxWidth: '400px', margin: '32px auto 0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            <span>52W Low: {cs}{info.fiftyTwoWeekLow.toFixed(2)}</span>
            <span>52W High: {cs}{info.fiftyTwoWeekHigh.toFixed(2)}</span>
          </div>
          <div style={{ position: 'relative', height: '4px', background: 'var(--border-color)', borderRadius: '999px' }}>
            <div style={{
              position: 'absolute',
              left: `${Math.min(100, Math.max(0, ((current - info.fiftyTwoWeekLow) / (info.fiftyTwoWeekHigh - info.fiftyTwoWeekLow)) * 100))}%`,
              top: '-4px',
              width: '12px', height: '12px',
              background: 'var(--text-primary)',
              borderRadius: '50%',
              transform: 'translateX(-50%)',
              border: '2px solid var(--bg-surface)'
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function CompanyProfile({ data }: { data: ValuationData }) {
  const info = data.info || {};
  const summary = data.dcf_summary || {};
  const cs = getCurrencySymbol(summary['Currency'] || 'USD');

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '16px' }}>Company Profile</h3>
      <table className="data-table">
        <tbody>
          <tr><td className="metric-name">Sector</td><td style={{ textAlign: 'right' }}>{info.sector || 'N/A'}</td></tr>
          <tr><td className="metric-name">Industry</td><td style={{ textAlign: 'right' }}>{info.industry || 'N/A'}</td></tr>
          <tr><td className="metric-name">Market Cap</td><td style={{ textAlign: 'right' }}>{formatCurrency(info.marketCap || 0, cs)}</td></tr>
          <tr>
            <td className="metric-name">Enterprise Value</td>
            <td style={{ textAlign: 'right' }}>
              {formatCurrency(
                data.wacc_inputs?.['Enterprise Value ($)'] || info.enterpriseValue || 0,
                cs
              )}
            </td>
          </tr>
          <tr><td className="metric-name">Dividend Yield</td><td style={{ textAlign: 'right' }}>{info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : '0.00%'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function RiskMetrics({ data }: { data: ValuationData }) {
  const info = data.info || {};
  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '16px' }}>Risk Metrics</h3>
      <table className="data-table">
        <tbody>
          <tr><td className="metric-name">Beta (5Y Monthly)</td><td style={{ textAlign: 'right' }}>{info.beta?.toFixed(2) || 'N/A'}</td></tr>
          <tr><td className="metric-name">Debt to Equity</td><td style={{ textAlign: 'right' }}>{data.derived_metrics?.[0]?.['Debt/Equity']?.toFixed(2) || 'N/A'}</td></tr>
          <tr><td className="metric-name">Current Ratio</td><td style={{ textAlign: 'right' }}>{data.derived_metrics?.[0]?.['Current Ratio']?.toFixed(2) || 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function ValuationMultiples({ data }: { data: ValuationData }) {
  const info = data.info || {};
  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '16px' }}>Valuation Multiples</h3>
      <table className="data-table">
        <tbody>
          <tr><td className="metric-name">P/E (TTM)</td><td style={{ textAlign: 'right' }}>{info.trailingPE?.toFixed(2) || 'N/A'}</td></tr>
          <tr><td className="metric-name">EV/EBITDA</td><td style={{ textAlign: 'right' }}>{data.comps_snapshot?.['EV/EBITDA']?.toFixed(2) || 'N/A'}</td></tr>
          <tr><td className="metric-name">Price to Book</td><td style={{ textAlign: 'right' }}>{info.priceToBook?.toFixed(2) || 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// Fallback default export for existing App.tsx before it's updated
export default function Dashboard({ data, intrinsicOverride }: { data: ValuationData, intrinsicOverride?: number | null }) {
  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <IntrinsicValueSummary data={data} intrinsicOverride={intrinsicOverride} />
      </div>
      <div className="grid-3">
        <CompanyProfile data={data} />
        <RiskMetrics data={data} />
        <ValuationMultiples data={data} />
      </div>
    </div>
  );
}
