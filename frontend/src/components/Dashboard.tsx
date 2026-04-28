import React, { useMemo } from 'react';
import type { ValuationData } from '../types';
import { getCurrencySymbol, formatCurrency } from '../utils/formatters';

export default function Dashboard({ data, intrinsicOverride }: { data: ValuationData, intrinsicOverride?: number | null }) {
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
    <div className="animate-fade-in">
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 500 }}>
          {info.shortName || data.ticker} ({data.ticker})
        </h2>
        
        {/* Currency Warning Banner */}
        {currencyWarning && (
          <div style={{
            margin: '0 0 1rem 0', padding: '0.75rem 1rem', borderRadius: '8px',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)',
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem', textAlign: 'left'
          }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
              <strong>Currency / Data Warning:</strong> {currencyWarning} DCF figures are in <strong>{currency}</strong>.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '2rem', margin: '2rem 0' }}>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Intrinsic Value {isOverridden && <span style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', marginLeft: '4px' }}>(Custom)</span>}
            </p>
            <p className="text-gradient" style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>
              {cs}{intrinsic.toFixed(2)}
            </p>
          </div>

          <div style={{ width: '1px', height: '60px', background: 'var(--border-color)' }}></div>

          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Price</p>
            <p style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {cs}{current.toFixed(2)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <span className={`status-pill ${statusClass}`}>
            {statusText}
          </span>
          <span style={{ fontSize: '1.125rem', fontWeight: 600, color: margin > 15 ? 'var(--success)' : (margin < -15 ? 'var(--danger)' : 'var(--text-primary)') }}>
            {margin > 0 ? '+' : ''}{margin.toFixed(2)}% Upside
          </span>
          {currency !== 'USD' && (
            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)' }}>
              {currency}
            </span>
          )}
        </div>

        {info.fiftyTwoWeekLow && info.fiftyTwoWeekHigh && (
          <div style={{ marginTop: '2.5rem', maxWidth: '400px', margin: '2.5rem auto 0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>52W Low: {cs}{info.fiftyTwoWeekLow.toFixed(2)}</span>
              <span>52W High: {cs}{info.fiftyTwoWeekHigh.toFixed(2)}</span>
            </div>
            <div style={{ position: 'relative', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px' }}>
              <div style={{
                position: 'absolute',
                left: `${Math.min(100, Math.max(0, ((current - info.fiftyTwoWeekLow) / (info.fiftyTwoWeekHigh - info.fiftyTwoWeekLow)) * 100))}%`,
                top: '-3px',
                width: '12px', height: '12px',
                background: 'var(--accent-primary)',
                borderRadius: '50%',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 8px var(--accent-primary)'
              }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem', textAlign: 'center' }}>
              Current price is at {Math.min(100, Math.max(0, ((current - info.fiftyTwoWeekLow) / (info.fiftyTwoWeekHigh - info.fiftyTwoWeekLow)) * 100)).toFixed(0)}% of 52W Range
            </p>
          </div>
        )}
      </div>

      <div className="grid-3">
        <div className="glass-panel">
          <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Company Profile</h3>
          <table className="data-table">
            <tbody>
              <tr>
                <td className="metric-name">Sector</td>
                <td style={{ textAlign: 'right' }}>{info.sector || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">Industry</td>
                <td style={{ textAlign: 'right' }}>{info.industry || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">Market Cap</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(info.marketCap || 0, cs)}</td>
              </tr>
              <tr>
                <td className="metric-name">Enterprise Value</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(info.enterpriseValue || 0, cs)}</td>
              </tr>
              <tr>
                <td className="metric-name">Dividend Yield</td>
                <td style={{ textAlign: 'right' }}>{info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : '0.00%'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="glass-panel delay-100">
          <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Risk Metrics</h3>
          <table className="data-table">
            <tbody>
              <tr>
                <td className="metric-name">Beta (5Y Monthly)</td>
                <td style={{ textAlign: 'right' }}>{info.beta?.toFixed(2) || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">Debt to Equity</td>
                <td style={{ textAlign: 'right' }}>{data.derived_metrics?.[0]?.['Debt/Equity']?.toFixed(2) || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">Current Ratio</td>
                <td style={{ textAlign: 'right' }}>{data.derived_metrics?.[0]?.['Current Ratio']?.toFixed(2) || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="glass-panel delay-200">
          <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Valuation Multiples</h3>
          <table className="data-table">
            <tbody>
              <tr>
                <td className="metric-name">P/E (TTM)</td>
                <td style={{ textAlign: 'right' }}>{info.trailingPE?.toFixed(2) || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">EV/EBITDA</td>
                <td style={{ textAlign: 'right' }}>{data.comps_snapshot?.['EV/EBITDA']?.toFixed(2) || 'N/A'}</td>
              </tr>
              <tr>
                <td className="metric-name">Price to Book</td>
                <td style={{ textAlign: 'right' }}>{info.priceToBook?.toFixed(2) || 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

