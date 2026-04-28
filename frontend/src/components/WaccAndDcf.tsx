import React, { useState, useEffect, useMemo } from 'react';
import type { ValuationData } from '../types';
import { Settings2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getCurrencySymbol, formatFinancialValue } from '../utils/formatters';
import { useChartReady } from '../hooks/useChartReady';

interface WaccAndDcfProps {
  data: ValuationData;
  onRecalculate?: (val: number | null) => void;
  onScenariosChange?: (scenarios: any, scenarioResults: any) => void;
  isVisible?: boolean;
}

export default function WaccAndDcf({ data, onRecalculate, onScenariosChange, isVisible = false }: WaccAndDcfProps) {
  const wacc = data.wacc_inputs || {};
  const baseSummary = data.dcf_summary || {};
  
  const baseGrowth = baseSummary['Assumed FCF Growth Rate'] || 0;
  const baseWacc = wacc['WACC'] || 0;
  const baseTerminal = baseSummary['Terminal Growth Rate'] || 0;

  const [scenarios, setScenarios] = useState({
    base: { growth: baseGrowth, wacc: baseWacc, term: baseTerminal, weight: 0.50 },
    bull: { growth: baseGrowth + 0.05, wacc: Math.max(0.01, baseWacc - 0.01), term: baseTerminal + 0.005, weight: 0.25 },
    bear: { growth: baseGrowth - 0.05, wacc: baseWacc + 0.01, term: baseTerminal - 0.005, weight: 0.25 }
  });

  const [activeScenario, setActiveScenario] = useState<'base'|'bull'|'bear'>('base');

  const currency = baseSummary.Currency || 'USD';
  const cs = useMemo(() => getCurrencySymbol(currency), [currency]);

  // Reset assumptions if a new ticker is searched
  useEffect(() => {
    setScenarios({
      base: { growth: baseGrowth, wacc: baseWacc, term: baseTerminal, weight: 0.50 },
      bull: { growth: baseGrowth + 0.05, wacc: Math.max(0.01, baseWacc - 0.01), term: baseTerminal + 0.005, weight: 0.25 },
      bear: { growth: baseGrowth - 0.05, wacc: baseWacc + 0.01, term: baseTerminal - 0.005, weight: 0.25 }
    });
    setActiveScenario('base');
  }, [data, baseGrowth, baseWacc, baseTerminal]);

  const { containerRef, chartReady, width, height } = useChartReady();

  const updateScenario = (key: 'base'|'bull'|'bear', field: 'growth'|'wacc'|'term'|'weight', value: number) => {
    setScenarios(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const calculateDCF = (growthRate: number, waccRate: number, terminalRate: number) => {
    if (Object.keys(wacc).length === 0) return { projection: [], enterpriseValue: 0, equityValue: 0, intrinsicValue: 0 };

    const baseFCF    = baseSummary['Base FCF ($)'] || 0;
    const sharesOut  = baseSummary['Shares Outstanding'] || 1;
    const netDebt    = baseSummary['Net Debt ($)'] || 0;
    const stage1 = 5;
    const stage2 = 5;
    const totalYears = stage1 + stage2;

    const rows: any[] = [];
    let cumulativePV = 0;
    let projFCF = baseFCF;

    for (let yr = 1; yr <= totalYears; yr++) {
      let growth: number;
      let stageLabel: string;
      if (yr <= stage1) {
        growth = growthRate;
        stageLabel = 'S1';
      } else {
        const fadeStep = yr - stage1;
        growth = growthRate + (terminalRate - growthRate) * (fadeStep / stage2);
        stageLabel = 'S2';
      }

      projFCF = projFCF * (1 + growth);
      const discountFactor = 1 / Math.pow(1 + waccRate, yr);
      const pvFCF = projFCF * discountFactor;
      cumulativePV += pvFCF;

      rows.push({
        Year: `${yr} (${stageLabel})`,
        'Growth Rate': growth,
        'Projected FCF ($)': projFCF,
        'Discount Factor': discountFactor,
        'PV of FCF ($)': pvFCF,
        'Cumulative PV ($)': cumulativePV
      });
    }

    const terminalFCF  = projFCF * (1 + terminalRate);
    const terminalValue = waccRate > terminalRate ? terminalFCF / (waccRate - terminalRate) : 0;
    const pvTerminal   = terminalValue / Math.pow(1 + waccRate, totalYears);

    rows.push({
      Year: 'TERMINAL',
      'Growth Rate': terminalRate,
      'Projected FCF ($)': terminalFCF,
      'Discount Factor': 1 / Math.pow(1 + waccRate, totalYears),
      'PV of FCF ($)': pvTerminal,
      'Cumulative PV ($)': cumulativePV + pvTerminal
    });

    const ev = cumulativePV + pvTerminal;
    const eq = ev - netDebt;
    const iv = eq > 0 ? eq / sharesOut : 0;

    return { projection: rows, enterpriseValue: ev, equityValue: eq, intrinsicValue: iv };
  };

  const results = useMemo(() => ({
    base: calculateDCF(scenarios.base.growth, scenarios.base.wacc, scenarios.base.term),
    bull: calculateDCF(scenarios.bull.growth, scenarios.bull.wacc, scenarios.bull.term),
    bear: calculateDCF(scenarios.bear.growth, scenarios.bear.wacc, scenarios.bear.term)
  }), [scenarios, wacc, baseSummary]);

  const activeResult = results[activeScenario];
  const { projection, enterpriseValue, equityValue, intrinsicValue } = activeResult;

  const expectedValue = useMemo(() => {
    const totalWeight = scenarios.base.weight + scenarios.bull.weight + scenarios.bear.weight;
    if (totalWeight === 0) return 0;
    
    return (
      (results.base.intrinsicValue * scenarios.base.weight) +
      (results.bull.intrinsicValue * scenarios.bull.weight) +
      (results.bear.intrinsicValue * scenarios.bear.weight)
    ) / totalWeight;
  }, [results, scenarios]);
  useEffect(() => {
    if (onScenariosChange) {
      onScenariosChange(scenarios, results);
    }
  }, [scenarios, results, onScenariosChange]);

  // Sensitivity Analysis for active scenario
  const sensitivityData = useMemo(() => {
    const s = scenarios[activeScenario];
    const waccSteps = [s.wacc + 0.01, s.wacc + 0.005, s.wacc, s.wacc - 0.005, s.wacc - 0.01];
    const termSteps = [s.term - 0.005, s.term - 0.0025, s.term, s.term + 0.0025, s.term + 0.005];

    const baseFCF   = baseSummary['Base FCF ($)'] || 0;
    const sharesOut = baseSummary['Shares Outstanding'] || 1;
    const netDebt   = baseSummary['Net Debt ($)'] || 0;
    const stage1 = 5;
    const stage2 = 5;
    const totalYears = stage1 + stage2;

    const matrix = waccSteps.map(wStep => {
      return termSteps.map(tStep => {
        let cumulativePV = 0;
        let pFCF = baseFCF;
        for (let yr = 1; yr <= totalYears; yr++) {
          let g: number;
          if (yr <= stage1) { g = s.growth; }
          else { g = s.growth + (tStep - s.growth) * ((yr - stage1) / stage2); }
          pFCF = pFCF * (1 + g);
          cumulativePV += pFCF / Math.pow(1 + wStep, yr);
        }
        const tFCF = pFCF * (1 + tStep);
        const tVal = wStep > tStep ? tFCF / (wStep - tStep) : 0;
        const pvT = tVal / Math.pow(1 + wStep, totalYears);
        const iv = ((cumulativePV + pvT) - netDebt) / sharesOut;
        return iv > 0 ? iv : 0;
      });
    });

    return { waccSteps, termSteps, matrix };
  }, [scenarios, activeScenario, baseSummary]);

  const currentPrice = data.info?.currentPrice || baseSummary['Current Price ($)'] || 0;

  // Bubble up Expected Value
  useEffect(() => {
    if (onRecalculate) {
      onRecalculate(expectedValue);
    }
  }, [expectedValue, onRecalculate]);

  if (Object.keys(wacc).length === 0 || projection.length === 0) {
    return <div className="glass-panel">WACC and DCF data not available.</div>;
  }

  const formatPercent = (val: number | undefined | null) => 
    val !== undefined && val !== null ? `${(val * 100).toFixed(2)}%` : '-';

  return (
    <div className="animate-fade-in">
      {/* Expected Value Panel */}
      <div className="glass-panel" style={{ marginBottom: '2rem', textAlign: 'center', background: 'linear-gradient(to bottom right, rgba(99, 102, 241, 0.1), transparent)' }}>
         <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Probability-Weighted Expected Value</h2>
         <p className="text-gradient" style={{ fontSize: '3.5rem', fontWeight: 700, margin: '0.5rem 0' }}>{cs}{expectedValue.toFixed(2)}</p>
         <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem' }}>
           <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Base ({formatPercent(scenarios.base.weight)})</p>
              <p style={{ fontWeight: 600 }}>{cs}{results.base.intrinsicValue.toFixed(2)}</p>
           </div>
           <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Bull ({formatPercent(scenarios.bull.weight)})</p>
              <p style={{ fontWeight: 600, color: 'var(--success)' }}>{cs}{results.bull.intrinsicValue.toFixed(2)}</p>
           </div>
           <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Bear ({formatPercent(scenarios.bear.weight)})</p>
              <p style={{ fontWeight: 600, color: 'var(--danger)' }}>{cs}{results.bear.intrinsicValue.toFixed(2)}</p>
           </div>
         </div>
      </div>

      {/* Interactive Assumptions Panel */}
      <div className="glass-panel" style={{ marginBottom: '2rem', border: '1px solid var(--accent-primary)', background: 'linear-gradient(to right, rgba(99, 102, 241, 0.05), transparent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings2 size={20} /> Interactive Operating Model
          </h2>
          <div className="tabs-header" style={{ marginBottom: 0, borderBottom: 'none' }}>
             <button className={`tab-btn ${activeScenario === 'base' ? 'active' : ''}`} onClick={() => setActiveScenario('base')}>Base</button>
             <button className={`tab-btn ${activeScenario === 'bull' ? 'active' : ''}`} onClick={() => setActiveScenario('bull')}>Bull</button>
             <button className={`tab-btn ${activeScenario === 'bear' ? 'active' : ''}`} onClick={() => setActiveScenario('bear')}>Bear</button>
          </div>
        </div>

        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Projected FCF Growth
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input 
                type="range" 
                min="-0.2" max="0.5" step="0.005" 
                value={scenarios[activeScenario].growth} 
                onChange={(e) => updateScenario(activeScenario, 'growth', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatPercent(scenarios[activeScenario].growth)}</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Terminal Growth Rate
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input 
                type="range" 
                min="0.0" max="0.06" step="0.001" 
                value={scenarios[activeScenario].term} 
                onChange={(e) => updateScenario(activeScenario, 'term', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatPercent(scenarios[activeScenario].term)}</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Discount Rate (WACC)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input 
                type="range" 
                min="0.04" max="0.2" step="0.005" 
                value={scenarios[activeScenario].wacc} 
                onChange={(e) => updateScenario(activeScenario, 'wacc', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatPercent(scenarios[activeScenario].wacc)}</span>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Probability Weight
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input 
                type="range" 
                min="0.0" max="1.0" step="0.05" 
                value={scenarios[activeScenario].weight} 
                onChange={(e) => updateScenario(activeScenario, 'weight', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>{formatPercent(scenarios[activeScenario].weight)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel delay-100" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', textTransform: 'capitalize' }}>{activeScenario} Case - Projected Free Cash Flow ({cs})</h2>
        <div style={{ width: '100%', height: 250 }} ref={containerRef}>
          {isVisible && chartReady && (
            <BarChart
                width={width}
                height={height}
                data={projection.filter((p: any) => p.Year !== 'TERMINAL')}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} opacity={0.5} />
                <XAxis dataKey="Year" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickFormatter={(val) => `Year ${val.split(' ')[0]}`} />
                <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} tickFormatter={(val) => {
                  if (Math.abs(val) >= 1e9) return `${cs}${(val / 1e9).toFixed(1)}B`;
                  if (Math.abs(val) >= 1e6) return `${cs}${(val / 1e6).toFixed(0)}M`;
                  return `${cs}${val}`;
                }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                  contentStyle={{ background: '#1e2128', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value: any) => [`${cs}${value.toLocaleString(undefined, {maximumFractionDigits: 0})}`, 'Projected FCF']}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Bar dataKey="Projected FCF ($)" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <div className="glass-panel delay-100">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--accent-secondary)' }}>
            Dynamic Output
          </h2>
          <table className="data-table">
            <tbody>
              <tr><td className="metric-name">Reported FCF (3Y Median)</td><td style={{ textAlign: 'right' }}>{cs}{formatFinancialValue(baseSummary['Reported FCF (3Y Median, $)'])}</td></tr>
              <tr><td className="metric-name" style={{ color: 'var(--danger)' }}>Avg SBC Deducted</td><td style={{ textAlign: 'right', color: 'var(--danger)' }}>-{cs}{formatFinancialValue(baseSummary['Avg SBC Deducted ($)'])}</td></tr>
              <tr><td className="metric-name" style={{ fontWeight: 600 }}>Base FCF (SBC-Adjusted)</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{cs}{formatFinancialValue(baseSummary['Base FCF ($)'])}</td></tr>
              <tr><td className="metric-name">Model</td><td style={{ textAlign: 'right' }}>2-Stage (5yr + 5yr fade)</td></tr>
              <tr><td className="metric-name">Shares Outstanding</td><td style={{ textAlign: 'right' }}>{formatFinancialValue(baseSummary['Shares Outstanding'])}</td></tr>
              <tr><td className="metric-name">Net Debt</td><td style={{ textAlign: 'right' }}>{cs}{formatFinancialValue(baseSummary['Net Debt ($)'])}</td></tr>
            </tbody>
          </table>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Live Enterprise Value</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cs}{formatFinancialValue(enterpriseValue)}</p>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem', marginBottom: '0.5rem' }}>Live Equity Value</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cs}{formatFinancialValue(equityValue)}</p>

            <p style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 600 }}>Live Intrinsic Value / Share</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{cs}{intrinsicValue.toFixed(2)}</p>
          </div>
        </div>

        <div className="glass-panel">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            Base WACC Breakdown (Reference)
          </h2>
          <table className="data-table">
            <tbody>
              <tr><td className="metric-name">Risk-Free Rate</td><td style={{ textAlign: 'right' }}>{formatPercent(wacc['Risk-Free Rate'])}</td></tr>
              <tr><td className="metric-name">Beta</td><td style={{ textAlign: 'right' }}>{wacc['Beta']?.toFixed(2) || '-'}</td></tr>
              <tr><td className="metric-name">Equity Risk Premium</td><td style={{ textAlign: 'right' }}>{formatPercent(wacc['Equity Risk Premium'])}</td></tr>
              <tr><td className="metric-name" style={{ color: 'var(--text-primary)' }}>Cost of Equity (CAPM)</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPercent(wacc['Cost of Equity (CAPM)'])}</td></tr>
              
              <tr><td className="metric-name">Cost of Debt (After-Tax)</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{formatPercent(wacc['Cost of Debt (After-Tax)'])}</td></tr>
              <tr><td className="metric-name">Weight of Equity</td><td style={{ textAlign: 'right' }}>{formatPercent(wacc['Weight Equity'])}</td></tr>
              <tr><td className="metric-name">Weight of Debt</td><td style={{ textAlign: 'right' }}>{formatPercent(wacc['Weight Debt'])}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel delay-300">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>
          Sensitivity Analysis (Football Field)
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Intrinsic Value / Share based on variations in Discount Rate (WACC) and Terminal Growth Rate for the <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{activeScenario}</span> case.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
            <thead>
              <tr>
                <th style={{ background: 'transparent', border: 'none' }}></th>
                <th colSpan={5} style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Terminal Growth Rate
                </th>
              </tr>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', padding: '10px' }}>
                  WACC
                </th>
                {sensitivityData.termSteps.map((t, i) => (
                  <th key={i} style={{ textAlign: 'center', padding: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                    {formatPercent(t)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitivityData.waccSteps.map((w, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.875rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontWeight: 600 }}>
                    {formatPercent(w)}
                  </td>
                  {sensitivityData.matrix[i].map((iv, j) => {
                    const upside = currentPrice > 0 ? (iv / currentPrice) - 1 : 0;
                    const isCenter = i === 2 && j === 2;
                    
                    let bgColor = 'rgba(255,255,255,0.02)';
                    let textColor = 'var(--text-primary)';
                    
                    if (upside > 0.2) bgColor = 'rgba(16, 185, 129, 0.3)';
                    else if (upside > 0.05) bgColor = 'rgba(16, 185, 129, 0.15)';
                    else if (upside < -0.2) bgColor = 'rgba(239, 68, 68, 0.3)';
                    else if (upside < -0.05) bgColor = 'rgba(239, 68, 68, 0.15)';

                    return (
                      <td 
                        key={j} 
                        style={{ 
                          textAlign: 'center', 
                          padding: '12px', 
                          fontSize: '0.9rem', 
                          background: bgColor, 
                          color: textColor,
                          borderRadius: '8px',
                          border: isCenter ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.05)',
                          fontWeight: isCenter ? 700 : 400
                        }}
                      >
                        {cs}{iv.toFixed(2)}
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '2px' }}>
                          {upside > 0 ? '+' : ''}{(upside * 100).toFixed(1)}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
