import { useState, useMemo } from 'react';
import { useChartReady } from '../hooks/useChartReady';
import type { ValuationData, FinancialRow } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getCurrencySymbol } from '../utils/formatters';

const formatValue = (val: any) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  if (typeof val === 'number') {
    if (Math.abs(val) < 100 && !Number.isInteger(val)) return val.toFixed(2);
    if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return val;
};

export function HistoricalPerformanceChart({ data }: { data: ValuationData }) {
  const { containerRef, chartReady, width, height } = useChartReady();
  const raw = data.raw_financials || [];
  
  const { years, cs } = useMemo(() => {
    const currency = data.dcf_summary?.Currency || 'USD';
    const symbol = getCurrencySymbol(currency);
    const sortedYears = [...raw]
      .map(row => row['Fiscal Year'])
      .filter(Boolean)
      .reverse();
    return { years: sortedYears, cs: symbol };
  }, [raw, data.dcf_summary?.Currency]);

  const chartData = useMemo(() => {
    return years.map(yr => {
      const row = raw.find(r => r['Fiscal Year'] === yr) as any || {};
      return {
        year: yr,
        Revenue: (row['Total Revenue'] || row['Revenue'] || 0) / 1e9, 
        NetIncome: (row['Net Income'] || 0) / 1e9
      };
    });
  }, [years, raw]);

  if (raw.length === 0) return null;

  return (
    <div className="glass-panel">
      <div style={{ marginBottom: '16px' }}>
        <h3>Historical Performance</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Values in {cs} Billions</span>
      </div>
      <div style={{ width: '100%', height: 200 }} ref={containerRef}>
        {chartReady && (
          <BarChart width={width} height={height} data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E24" vertical={false} />
            <XAxis dataKey="year" stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} />
            <YAxis stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} tickFormatter={(v) => `${cs}${v}B`} />
            <Tooltip
              cursor={{ fill: 'var(--bg-surface-hover)' }}
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              formatter={(v: any, name: any) => [`${cs}${Number(v).toFixed(2)}B`, name]}
            />
            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
            <Bar name="Revenue" dataKey="Revenue" fill="var(--accent-primary)" radius={[2, 2, 0, 0]} barSize={24} />
            <Bar name="Net Income" dataKey="NetIncome" fill="var(--success)" radius={[2, 2, 0, 0]} barSize={24} />
          </BarChart>
        )}
      </div>
    </div>
  );
}

export function FinancialStatementsTable({ data }: { data: ValuationData }) {
  const [view, setView] = useState<'raw' | 'derived'>('derived');
  const raw = data.raw_financials || [];
  const derived = data.derived_metrics || [];
  const currentData = view === 'raw' ? raw : derived;
  
  const { years, metrics, dataMap } = useMemo(() => {
    if (!currentData || currentData.length === 0) {
      return { years: [], metrics: [], dataMap: {} };
    }
    const sortedYears = [...currentData]
      .map(row => row['Fiscal Year'])
      .filter(Boolean)
      .reverse();
      
    const allMetrics = Object.keys(currentData[0]).filter(
      k => k !== 'Fiscal Year' && k !== 'index'
    );

    const map: Record<string, FinancialRow> = {};
    currentData.forEach(row => {
      if (row['Fiscal Year']) map[row['Fiscal Year']] = row;
    });

    return { years: sortedYears, metrics: allMetrics, dataMap: map };
  }, [currentData]);

  if (currentData.length === 0) return null;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h3>Financial Statements</h3>
        <div style={{ display: 'flex', background: 'var(--bg-base)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <button 
            className={`tab-btn ${view === 'derived' ? 'active' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            onClick={() => setView('derived')}
          >
            Derived
          </button>
          <button 
            className={`tab-btn ${view === 'raw' ? 'active' : ''}`}
            style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            onClick={() => setView('raw')}
          >
            Raw
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 5 }}>Metric</th>
              {years.map((year, i) => (
                <th key={i} style={{ textAlign: 'right' }}>FY {year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, i) => (
              <tr key={i}>
                <td className="metric-name" style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 4, borderRight: '1px solid var(--border-color)' }}>
                  {metric}
                </td>
                {years.map((yr, j) => (
                  <td key={j} style={{ textAlign: 'right' }}>
                    {formatValue(dataMap[yr]?.[metric])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinancialsTable({ data }: { data: ValuationData }) {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <HistoricalPerformanceChart data={data} />
      <FinancialStatementsTable data={data} />
    </div>
  );
}
