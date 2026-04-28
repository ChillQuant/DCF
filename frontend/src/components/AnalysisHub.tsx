import React from 'react';
import type { ValuationData } from '../types';
import { AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { getCurrencySymbol } from '../utils/formatters';
import { useChartReady } from '../hooks/useChartReady';

const fmtPct = (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`;

export default function AnalysisHub({ data, peers, overrides }: { data: ValuationData, peers: any[], overrides?: Record<string, Record<string, number>> }) {
  const { containerRef, chartReady, width, height } = useChartReady();
  const q   = data.quality_metrics || {} as any;
  const dcf = data.dcf_summary     || {};
  const w   = data.wacc_inputs     || {};
  const comps = data.comps_snapshot || {};
  const info  = data.info || {};

  const currency = dcf['Currency'] || 'USD';
  const cs = getCurrencySymbol(currency);

  const fmt2 = (v: number | null) => v == null ? 'N/A' : `${cs}${v.toFixed(2)}`;

  const flags     = q.risk_flags     || [];
  const histRoic  = (q.historical_roic || []).slice().reverse(); // oldest→newest for chart

  const dcfIV   = q.dcf_intrinsic ?? dcf['Intrinsic Value/Share ($)'] ?? 0;
  const epv     = q.epv_per_share;
  const graham  = q.graham_number;
  const price   = w['Current Price ($)'] ?? 0;
  const wacc    = w['WACC'] ?? 0;

  // ─── Weighted Consensus ───────────────────────────────────────────────────
  // Calculate averages from shared peers
  const getPeerAvg = (key: string) => {
    if (peers.length === 0) return null;
    const validVals = peers.map(p => {
      const ov = overrides?.[p.Ticker]?.[key];
      return ov !== undefined ? ov : p[key];
    }).filter(v => typeof v === 'number' && !Number.isNaN(v));
    
    if (validVals.length === 0) return null;
    return validVals.reduce((acc, val) => acc + val, 0) / validVals.length;
  };

  const avgPeerEvEbitda = getPeerAvg('EV/EBITDA');
  const avgPeerPe       = getPeerAvg('P/E (TTM)');

  // Derive target company EBITDA and Net Income for relative valuation
  const targetEV = comps['EV ($)'];
  const targetEvEbitda = comps['EV/EBITDA'];
  const targetEbitda = (targetEV && targetEvEbitda) ? targetEV / targetEvEbitda : null;
  
  const targetMCap = comps['Market Cap ($)'];
  const targetPe = comps['P/E (TTM)'];
  const targetNetIncome = (targetMCap && targetPe) ? targetMCap / targetPe : null;
  
  const shares = dcf['Shares Outstanding'] || 1;
  const netDebt = dcf['Net Debt ($)'] || 0;
  
  const peerEvEbitdaImplied = (avgPeerEvEbitda && targetEbitda) ? ((avgPeerEvEbitda * targetEbitda) - netDebt) / shares : null;
  const peerPeImplied       = (avgPeerPe && targetNetIncome) ? (avgPeerPe * targetNetIncome) / shares : null;

  const methods: { label: string; value: number | null; weight: number; note: string }[] = [
    { label: 'DCF (2-Stage)',          value: dcfIV,               weight: 0.40, note: 'FCF-based intrinsic value' },
    { label: 'EPV (No-Growth Floor)',  value: epv,                 weight: 0.20, note: 'Zero-growth perpetuity' },
    { label: 'Peer EV/EBITDA Implied', value: peerEvEbitdaImplied, weight: 0.20, note: 'Based on peer median multiple' },
    { label: 'Peer P/E Implied',       value: peerPeImplied,       weight: 0.20, note: 'Based on peer median P/E' },
  ];

  const validMethods = methods.filter(m => m.value != null && m.value > 0);
  let consensus: number | null = null;
  if (validMethods.length > 0) {
    const totalWeight = validMethods.reduce((s, m) => s + m.weight, 0);
    consensus = validMethods.reduce((s, m) => s + (m.value! * m.weight), 0) / totalWeight;
  }
  const consensusUpside = (consensus && price > 0) ? ((consensus / price) - 1) * 100 : null;

  // ─── Implied Growth (Reverse DCF) ────────────────────────────────────────
  const impliedG  = q.implied_growth;
  const histFcfG  = dcf['FCF CAGR (Historical)'];
  const analystG  = q.analyst_eps_growth;
  const fwdRevG   = q.fwd_revenue_growth;

  const flagColor = { red: 'var(--danger)', yellow: '#f59e0b', green: 'var(--success)' };
  const FlagIcon = ({ level }: { level: string }) => {
    if (level === 'red')    return <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />;
    if (level === 'yellow') return <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />;
    return <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />;
  };

  const redCount    = flags.filter((f: any) => f.level === 'red').length;
  const yellowCount = flags.filter((f: any) => f.level === 'yellow').length;
  const overallColor = redCount > 0 ? 'var(--danger)' : yellowCount > 0 ? '#f59e0b' : 'var(--success)';
  const overallLabel = redCount > 0 ? 'HIGH RISK' : yellowCount > 0 ? 'MODERATE RISK' : 'LOW RISK';

  return (
    <div className="animate-fade-in">

      {/* ── RISK FLAGS ─────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>⚠️ Risk Flag Panel</h2>
          <span style={{
            padding: '0.25rem 0.875rem', borderRadius: '999px', fontSize: '0.75rem',
            fontWeight: 700, letterSpacing: '0.05em',
            background: `${overallColor}22`, color: overallColor, border: `1px solid ${overallColor}55`
          }}>
            {overallLabel} — {redCount} critical · {yellowCount} warnings
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {flags.map((flag: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', borderRadius: '8px',
              background: `${(flagColor as any)[flag.level]}11`,
              border: `1px solid ${(flagColor as any)[flag.level]}33`
            }}>
              <FlagIcon level={flag.level} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{flag.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MULTI-METHOD VALUATION ─────────────────────────────────────────── */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          🎯 Multi-Method Valuation & Weighted Consensus
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Method</th>
                <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Implied Price</th>
                <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Upside</th>
                <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Weight</th>
                <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m, i) => {
                const upside = m.value && price > 0 ? ((m.value / price) - 1) * 100 : null;
                const isPos = upside !== null && upside > 0;
                return (
                  <tr key={i}>
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{m.label}</td>
                    <td style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                      {m.value ? `${cs}${m.value.toFixed(2)}` : <span style={{ color: 'var(--text-muted)' }}>N/A</span>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: upside === null ? 'var(--text-muted)' : isPos ? 'var(--success)' : 'var(--danger)' }}>
                      {upside !== null ? `${upside > 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-secondary)' }}>
                      {(m.weight * 100).toFixed(0)}%
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{m.note}</td>
                  </tr>
                );
              })}

              {/* Graham Number (no weight, reference only) */}
              {graham && (
                <tr style={{ borderTop: '1px dashed var(--border-color)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Graham Number</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)' }}>{cs}{graham.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: price > 0 && graham > price ? 'var(--success)' : 'var(--danger)' }}>
                    {price > 0 ? `${((graham / price - 1) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Ref only</td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Conservative Graham floor</td>
                </tr>
              )}

              {/* Consensus row */}
              {consensus && (
                <tr style={{ background: 'rgba(99,102,241,0.08)', borderTop: '2px solid var(--accent-primary)' }}>
                  <td style={{ padding: '0.875rem', fontWeight: 700, color: 'var(--accent-primary)' }}>★ Weighted Consensus</td>
                  <td style={{ textAlign: 'right', padding: '0.875rem', fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-primary)' }}>
                    {cs}{consensus.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.875rem', fontWeight: 700, color: consensusUpside! > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {consensusUpside !== null ? `${consensusUpside > 0 ? '+' : ''}${consensusUpside.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', padding: '0.875rem', color: 'var(--text-muted)' }}>100%</td>
                  <td style={{ padding: '0.875rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Blended across available methods</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Current Market Price: <strong style={{ color: 'var(--text-primary)' }}>{cs}{price.toFixed(2)}</strong>
          &nbsp;·&nbsp; Weights re-normalize when N/A methods are excluded.
        </p>
      </div>

      {/* ── REVERSE DCF ────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          🔄 Reverse DCF — What Growth Rate Does the Market Imply?
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Instead of computing a price from assumptions, we solve backwards: what FCF growth rate must be true for the current market price to be fair value?
        </p>

        <div className="grid-3" style={{ gap: '1rem' }}>
          {[
            { label: 'Market-Implied FCF Growth', value: impliedG != null ? fmtPct(impliedG) : 'N/A', sub: 'Annual growth required to justify current price', highlight: true },
            { label: 'Historical FCF CAGR', value: histFcfG != null ? fmtPct(histFcfG) : 'N/A', sub: 'Actual SBC-adjusted FCF growth (last 5 yrs)', highlight: false },
            { label: 'Analyst EPS Growth (Fwd)', value: analystG != null ? fmtPct(analystG) : 'N/A', sub: 'Fwd EPS ÷ Trailing EPS − 1', highlight: false },
          ].map((item, i) => (
            <div key={i} style={{
              padding: '1.25rem', borderRadius: '10px', textAlign: 'center',
              background: item.highlight ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${item.highlight ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: item.highlight ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{item.value}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{item.sub}</p>
            </div>
          ))}
        </div>

        {impliedG != null && histFcfG != null && (
          <div style={{
            marginTop: '1.25rem', padding: '1rem', borderRadius: '8px',
            background: impliedG > histFcfG + 0.05 ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)',
            border: `1px solid ${impliedG > histFcfG + 0.05 ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)'}`,
          }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              {impliedG > histFcfG + 0.05
                ? `⚠️ The market requires ${fmtPct(impliedG)} annual FCF growth, but historical FCF CAGR is only ${fmtPct(histFcfG)}. The current price embeds a significant growth premium — buyer beware.`
                : `✅ The market's implied growth of ${fmtPct(impliedG)} is in line with or below historical FCF CAGR of ${fmtPct(histFcfG)}. The price appears supported by fundamentals.`
              }
            </p>
          </div>
        )}

        {fwdRevG != null && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            TTM Revenue Growth (Yahoo): <strong style={{ color: 'var(--text-secondary)' }}>{fmtPct(fwdRevG)}</strong>
          </p>
        )}
      </div>

      {/* ── ROIC vs WACC CHART ─────────────────────────────────────────────── */}
      {histRoic.length > 0 && (
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            📈 ROIC vs WACC — Value Creation Analysis
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            When ROIC {">"} WACC, every dollar of growth creates value. When ROIC {"<"} WACC, growth destroys value.
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Current ROIC', value: q.roic != null ? `${(q.roic * 100).toFixed(1)}%` : 'N/A', color: 'var(--accent-secondary)' },
              { label: 'WACC', value: wacc ? `${(wacc * 100).toFixed(1)}%` : 'N/A', color: 'var(--danger)' },
              { label: 'ROIC Spread', value: q.roic_spread != null ? `${(q.roic_spread * 100).toFixed(1)}pp` : 'N/A', color: (q.roic_spread ?? 0) > 0 ? 'var(--success)' : 'var(--danger)' },
            ].map((item, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ width: '100%', height: 220 }} ref={containerRef}>
            {chartReady && (
                <LineChart
                  width={width}
                  height={height}
                  data={histRoic}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="year" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
                  <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#1e2128', border: '1px solid var(--border-color)' }}
                    formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name]}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="roic_pct" name="ROIC %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="wacc_pct" name="WACC %" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
