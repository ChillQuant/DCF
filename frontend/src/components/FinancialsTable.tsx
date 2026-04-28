import React, { useState, useMemo } from 'react';
import { useChartReady } from '../hooks/useChartReady';
import type { ValuationData, FinancialRow } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCurrencySymbol } from '../utils/formatters';

const formatValue = (val: any) => {
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

// --- Sub-components ---

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currencySymbol: string;
}

const CustomTooltip = React.memo(({ active, payload, label, currencySymbol }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="tooltip-container" style={{ 
        background: '#1e2128', 
        border: '1px solid var(--border-color)', 
        padding: '12px', 
        borderRadius: '8px', 
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '0.9rem' }}>FY {label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ margin: '4px 0', color: entry.color, fontSize: '0.85rem' }}>
            {entry.name}: {currencySymbol}{entry.value.toFixed(2)}B
          </p>
        ))}
      </div>
    );
  }
  return null;
});

// --- Main Component ---

export default function FinancialsTable({ data }: { data: ValuationData }) {
  const [view, setView] = useState<'raw' | 'derived'>('derived');
  const { containerRef, chartReady, width, height } = useChartReady();

  const raw = data.raw_financials || [];
  const derived = data.derived_metrics || [];
  const currentData = view === 'raw' ? raw : derived;
  
  // Memoized derived data to prevent unnecessary calculations
  const { years, metrics, dataMap, cs } = useMemo(() => {
    const currency = data.dcf_summary?.Currency || 'USD';
    const symbol = getCurrencySymbol(currency);
    
    if (!currentData || currentData.length === 0) {
      return { years: [], metrics: [], dataMap: {}, cs: symbol };
    }

    // Oldest year first for charts
    const sortedYears = [...currentData]
      .map(row => row['Fiscal Year'])
      .filter(Boolean)
      .reverse();
    
    // Extract metrics excluding meta keys
    const allMetrics = Object.keys(currentData[0]).filter(
      k => k !== 'Fiscal Year' && k !== 'index'
    );

    // Index data by year for O(1) lookup during table render
    const map: Record<string, FinancialRow> = {};
    currentData.forEach(row => {
      if (row['Fiscal Year']) map[row['Fiscal Year']] = row;
    });

    return { years: sortedYears, metrics: allMetrics, dataMap: map, cs: symbol };
  }, [currentData, data.dcf_summary?.Currency]);

  // Chart data preparation (Always uses raw for consistency in performance chart)
  const chartData = useMemo(() => {
    return years.map(yr => {
      const row = raw.find(r => r['Fiscal Year'] === yr) || {};
      return {
        year: yr,
        Revenue: (row['Total Revenue'] || row['Revenue'] || 0) / 1e9, 
        NetIncome: (row['Net Income'] || 0) / 1e9
      };
    });
  }, [years, raw]);

  if (currentData.length === 0) {
    return <div className="glass-panel">No financial data available for {data.ticker}.</div>;
  }

  return (
    <div className="animate-fade-in">
      {/* Historical Chart Section */}
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Historical Performance</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Values in {cs} Billions</p>
        </div>
        <div style={{ width: '100%', height: 300 }} ref={containerRef}>
          {chartReady && (
            <BarChart
              width={width}
              height={height}
              data={chartData}
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} opacity={0.5} />
              <XAxis 
                dataKey="year" 
                stroke="#888" 
                tick={{ fill: '#888', fontSize: 12 }} 
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="#888" 
                tick={{ fill: '#888', fontSize: 12 }} 
                tickFormatter={(value) => `${cs}${value}B`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                content={<CustomTooltip currencySymbol={cs} />} 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }} 
                verticalAlign="bottom"
              />
              <Bar 
                name="Total Revenue" 
                dataKey="Revenue" 
                fill="var(--accent-primary, #6366f1)" 
                radius={[4, 4, 0, 0]} 
                barSize={32}
              />
              <Bar 
                name="Net Income" 
                dataKey="NetIncome" 
                fill="var(--success, #10b981)" 
                radius={[4, 4, 0, 0]} 
                barSize={32}
              />
            </BarChart>
        )}
        </div>
      </div>

      {/* Financial Statements Table */}
      <div className="glass-panel delay-100">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem', 
          flexWrap: 'wrap', 
          gap: '1rem' 
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Financial Statements</h2>
          
          <div className="tab-container" style={{ 
            display: 'flex', 
            background: 'var(--bg-base)', 
            padding: '4px', 
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <button 
              className={`tab-btn ${view === 'derived' ? 'active' : ''}`}
              style={{ 
                padding: '0.5rem 1rem', 
                background: view === 'derived' ? 'var(--bg-surface-hover)' : 'transparent',
                color: view === 'derived' ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: view === 'derived' ? 600 : 400
              }}
              onClick={() => setView('derived')}
            >
              Derived Metrics
            </button>
            <button 
              className={`tab-btn ${view === 'raw' ? 'active' : ''}`}
              style={{ 
                padding: '0.5rem 1rem', 
                background: view === 'raw' ? 'var(--bg-surface-hover)' : 'transparent',
                color: view === 'raw' ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: view === 'raw' ? 600 : 400
              }}
              onClick={() => setView('raw')}
            >
              Raw Data
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', margin: '0 -1rem', padding: '0 1rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40%', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 10 }}>Metric</th>
                {years.map((year, i) => (
                  <th key={i} style={{ textAlign: 'right', minWidth: '100px' }}>FY {year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric, i) => (
                <tr key={i}>
                  <td 
                    className="metric-name" 
                    style={{ 
                      position: 'sticky', 
                      left: 0, 
                      background: 'var(--bg-surface)', 
                      zIndex: 5,
                      borderRight: '1px solid var(--border-color)'
                    }}
                  >
                    {metric}
                  </td>
                  {years.map((yr, j) => (
                    <td key={j} style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                      {formatValue(dataMap[yr]?.[metric])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
