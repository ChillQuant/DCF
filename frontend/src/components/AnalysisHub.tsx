import type { ValuationData } from '../types';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { getCurrencySymbol } from '../utils/formatters';
import { useChartReady } from '../hooks/useChartReady';

const fmtPct = (v: number | null) => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`;

export function RiskFlagPanel({ data }: { data: ValuationData }) {
  const q = data.quality_metrics || {} as any;
  const flags = q.risk_flags || [];
  
  const FlagIcon = ({ level }: { level: string }) => {
    if (level === 'red')    return <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />;
    if (level === 'yellow') return <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />;
    return <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />;
  };

  const redCount    = flags.filter((f: any) => f.level === 'red').length;
  const yellowCount = flags.filter((f: any) => f.level === 'yellow').length;
  const overallColor = redCount > 0 ? 'var(--danger)' : yellowCount > 0 ? 'var(--warning)' : 'var(--success)';
  const overallLabel = redCount > 0 ? 'HIGH RISK' : yellowCount > 0 ? 'MODERATE RISK' : 'LOW RISK';

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3>Risk Assessment</h3>
        <span className="status-pill" style={{
          background: `${overallColor}11`, color: overallColor, border: `1px solid ${overallColor}33`
        }}>
          {overallLabel}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {flags.length === 0 ? (
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No significant risk flags identified.</span>
        ) : (
          flags.map((flag: any, i: number) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-base)',
              border: `1px solid var(--border-color)`
            }}>
              <FlagIcon level={flag.level} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{flag.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MultiMethodValuation({ data, peers, overrides }: { data: ValuationData, peers: any[], overrides?: Record<string, Record<string, number>> }) {
  const dcf = data.dcf_summary || {};
  const w = data.wacc_inputs || {};
  const q = data.quality_metrics || {} as any;
  const comps = data.comps_snapshot || {};
  
  const currency = dcf['Currency'] || 'USD';
  const cs = getCurrencySymbol(currency);

  const getPeerAvg = (key: string) => {
    if (!peers || peers.length === 0) return null;
    const validVals = peers.map(p => {
      const ov = overrides?.[p.Ticker]?.[key];
      return ov !== undefined ? ov : p[key];
    }).filter(v => typeof v === 'number' && !Number.isNaN(v));
    
    if (validVals.length === 0) return null;
    return validVals.reduce((acc, val) => acc + val, 0) / validVals.length;
  };

  const avgPeerEvEbitda = getPeerAvg('EV/EBITDA');
  const avgPeerPe       = getPeerAvg('P/E (TTM)');

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

  const dcfIV   = q.dcf_intrinsic ?? dcf['Intrinsic Value/Share ($)'] ?? 0;
  const epv     = q.epv_per_share;
  const graham  = q.graham_number;
  const price   = w['Current Price ($)'] ?? 0;

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

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '16px' }}>Valuation Consensus</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Method</th>
              <th style={{ textAlign: 'right' }}>Implied Price</th>
              <th style={{ textAlign: 'right' }}>Upside</th>
              <th style={{ textAlign: 'right' }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m, i) => {
              const upside = m.value && price > 0 ? ((m.value / price) - 1) * 100 : null;
              const isPos = upside !== null && upside > 0;
              return (
                <tr key={i}>
                  <td className="metric-name">{m.label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {m.value ? `${cs}${m.value.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: upside === null ? 'var(--text-muted)' : isPos ? 'var(--success)' : 'var(--danger)' }}>
                    {upside !== null ? `${upside > 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{(m.weight * 100).toFixed(0)}%</td>
                </tr>
              );
            })}
            {graham && (
              <tr style={{ borderTop: '1px dashed var(--border-color)' }}>
                <td className="metric-name" style={{ color: 'var(--text-muted)' }}>Graham Number</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{cs}{graham.toFixed(2)}</td>
                <td style={{ textAlign: 'right', color: price > 0 && graham > price ? 'var(--success)' : 'var(--danger)' }}>
                  {price > 0 ? `${((graham / price - 1) * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>Ref only</td>
              </tr>
            )}
            {consensus && (
              <tr style={{ background: 'rgba(79, 70, 229, 0.05)', borderTop: '1px solid var(--accent-primary)' }}>
                <td className="metric-name" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>Weighted Consensus</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent-primary)' }}>
                  {cs}{consensus.toFixed(2)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: consensusUpside! > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {consensusUpside !== null ? `${consensusUpside > 0 ? '+' : ''}${consensusUpside.toFixed(1)}%` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReverseDCF({ data }: { data: ValuationData }) {
  const q = data.quality_metrics || {} as any;
  const dcf = data.dcf_summary || {};
  
  const impliedG  = q.implied_growth;
  const histFcfG  = dcf['FCF CAGR (Historical)'];
  const analystG  = q.analyst_eps_growth;

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '8px' }}>Reverse DCF (Market-Implied Growth)</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
        Solves for the growth rate needed to justify the current market price.
      </p>

      <div className="grid-3" style={{ gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Implied FCF Growth', value: impliedG != null ? fmtPct(impliedG) : 'N/A', highlight: true },
          { label: 'Hist. FCF CAGR', value: histFcfG != null ? fmtPct(histFcfG) : 'N/A', highlight: false },
          { label: 'Analyst EPS Growth', value: analystG != null ? fmtPct(analystG) : 'N/A', highlight: false },
        ].map((item, i) => (
          <div key={i} style={{
            padding: '16px 12px', borderRadius: 'var(--radius-sm)', textAlign: 'center',
            background: item.highlight ? 'rgba(79, 70, 229, 0.05)' : 'var(--bg-base)',
            border: `1px solid ${item.highlight ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{item.label}</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: item.highlight ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {impliedG != null && histFcfG != null && (
        <div style={{
          padding: '12px', borderRadius: 'var(--radius-sm)',
          background: impliedG > histFcfG + 0.05 ? 'var(--danger-bg)' : 'var(--success-bg)',
          border: `1px solid ${impliedG > histFcfG + 0.05 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
        }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {impliedG > histFcfG + 0.05
              ? `⚠️ Market expects ${fmtPct(impliedG)} FCF growth, exceeding historical ${fmtPct(histFcfG)} CAGR.`
              : `✓ Market expects ${fmtPct(impliedG)} growth, aligned with historical ${fmtPct(histFcfG)} CAGR.`
            }
          </p>
        </div>
      )}
    </div>
  );
}

export function RoicWaccChart({ data }: { data: ValuationData }) {
  const { containerRef, chartReady, width, height } = useChartReady();
  const q = data.quality_metrics || {} as any;
  const w = data.wacc_inputs || {};
  const histRoic  = (q.historical_roic || []).slice().reverse();
  const wacc = w['WACC'] ?? 0;

  if (histRoic.length === 0) return null;

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '16px' }}>Value Creation (ROIC vs WACC)</h3>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current ROIC</span>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>{q.roic != null ? `${(q.roic * 100).toFixed(1)}%` : 'N/A'}</p>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>WACC</span>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger)' }}>{wacc ? `${(wacc * 100).toFixed(1)}%` : 'N/A'}</p>
        </div>
      </div>

      <div style={{ width: '100%', height: 200 }} ref={containerRef}>
        {chartReady && (
          <LineChart width={width} height={height} data={histRoic} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E24" vertical={false} />
            <XAxis dataKey="year" stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} />
            <YAxis stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
            />
            <Line type="monotone" dataKey="roic_pct" name="ROIC %" stroke="#6366F1" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="wacc_pct" name="WACC %" stroke="#EF4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        )}
      </div>
    </div>
  );
}

export default function AnalysisHub({ data, peers, overrides }: { data: ValuationData, peers: any[], overrides?: Record<string, Record<string, number>> }) {
  return (
    <div className="animate-fade-in grid-2">
      <RiskFlagPanel data={data} />
      <MultiMethodValuation data={data} peers={peers} overrides={overrides} />
      <ReverseDCF data={data} />
      <RoicWaccChart data={data} />
    </div>
  );
}
