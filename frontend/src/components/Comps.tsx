import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import type { ValuationData, PeerData } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { getCurrencySymbol, formatFinancialValue } from '../utils/formatters';
import { useChartReady } from '../hooks/useChartReady';

interface CompsProps {
  data: ValuationData;
  peers: PeerData[];
  setPeers: React.Dispatch<React.SetStateAction<PeerData[]>>;
  overrides: Record<string, Record<string, number>>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
}

export default function Comps({ data, peers, setPeers, overrides, setOverrides }: CompsProps) {
  const { containerRef, chartReady, width, height } = useChartReady();

  const comps = data.comps_snapshot || {};
  const [peerInput, setPeerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currency = data.dcf_summary?.Currency || 'USD';
  const cs = useMemo(() => getCurrencySymbol(currency), [currency]);

  const handleAddPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = peerInput.toUpperCase().trim();
    if (!ticker) return;
    
    if (peers.some(p => p.Ticker === ticker) || comps.Ticker === ticker) {
      setError(`${ticker} is already in the list.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://localhost:8000/api/comps/${ticker}`);
      if (!response.ok) throw new Error(`Failed to fetch ${ticker}. Check ticker symbol.`);
      const result = await response.json();
      
      if (!result || !result.Ticker) {
        throw new Error(`No data found for ${ticker}`);
      }
      
      setPeers(prev => [...prev, result]);
      setPeerInput('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removePeer = useCallback((tickerToRemove: string) => {
    setPeers(prev => prev.filter(p => p.Ticker !== tickerToRemove));
  }, [setPeers]);

  const handleOverrideChange = (ticker: string, field: string, valStr: string) => {
    const val = parseFloat(valStr);
    setOverrides(prev => {
      const updated = { ...prev };
      if (isNaN(val)) {
        if (updated[ticker]) {
          const copy = { ...updated[ticker] };
          delete copy[field];
          updated[ticker] = copy;
        }
      } else {
        updated[ticker] = {
          ...(updated[ticker] || {}),
          [field]: val
        };
      }
      return updated;
    });
  };

  const getVal = (ticker: string, field: string, defaultVal: number | null) => {
    const ov = overrides[ticker]?.[field];
    return ov !== undefined ? ov : defaultVal;
  };

  // Calculate averages memoized
  const averages = useMemo(() => {
    if (peers.length === 0) return {} as Record<string, number | null>;
    
    const keys = ['EV/Revenue', 'EV/EBITDA', 'P/E (TTM)', 'P/E (Forward)', 'P/B', 'P/S', 'EV/FCF', 'Net Margin %', 'ROE %'];
    const results: Record<string, number | null> = {};
    
    keys.forEach(key => {
      const validVals = peers
        .map(p => getVal(p.Ticker, key, p[key] ?? null))
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      
      results[key] = validVals.length > 0 
        ? validVals.reduce((acc, val) => acc + val, 0) / validVals.length 
        : null;
    });
    
    return results;
  }, [peers, overrides]);

  // Prepare chart data for EV/EBITDA
  const chartData = useMemo(() => {
    return [comps, ...peers]
      .map(p => ({
        name: p.Ticker,
        EVEBITDA: getVal(p.Ticker, 'EV/EBITDA', p['EV/EBITDA'] ?? null)
      }))
      .filter((p): p is { name: string, EVEBITDA: number } => p && typeof p.EVEBITDA === 'number' && !Number.isNaN(p.EVEBITDA));
  }, [comps, peers, overrides]);

  if (Object.keys(comps).length === 0) {
    return <div className="glass-panel">Comps data not available.</div>;
  }

  return (
    <div className="animate-fade-in">
      {chartData.length > 1 && (
        <div className="glass-panel" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>EV/EBITDA Multiples Comparison</h3>
          <div style={{ width: '100%', height: 250 }} ref={containerRef}>
            {chartReady && (
              <BarChart width={width} height={height} data={chartData} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E1E24" vertical={false} />
                <XAxis dataKey="name" stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} />
                <YAxis stroke="#71717A" tick={{ fill: '#71717A', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: 'var(--bg-surface-hover)' }} 
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  formatter={(value: any) => [`${Number(value).toFixed(2)}x`, 'EV/EBITDA']}
                />
                <Bar dataKey="EVEBITDA" radius={[2, 2, 0, 0]} barSize={32}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === comps.Ticker ? 'var(--accent-primary)' : 'var(--accent-secondary)'} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </div>
        </div>
      )}

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ marginBottom: '4px' }}>Comparable Company Analysis</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Add peers to dynamically compare valuation multiples and calculate implied averages.
            </p>
          </div>
          
          <form onSubmit={handleAddPeer} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <input 
                type="text" 
                className="input-search" 
                placeholder="Add Peer (e.g. MSFT)" 
                value={peerInput}
                onChange={(e) => setPeerInput(e.target.value)}
                style={{ width: '180px' }}
              />
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', position: 'absolute', width: '200px' }}>{error}</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ height: '36px', padding: '0 12px' }} disabled={loading}>
              {loading ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />}
              Add
            </button>
          </form>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th style={{ textAlign: 'right' }}>EV/Revenue</th>
                <th style={{ textAlign: 'right' }}>EV/EBITDA</th>
                <th style={{ textAlign: 'right' }}>P/E (TTM)</th>
                <th style={{ textAlign: 'right' }}>P/E (Fwd)</th>
                <th style={{ textAlign: 'right' }}>P/B</th>
                <th style={{ textAlign: 'right' }}>P/S</th>
                <th style={{ textAlign: 'right' }}>EV/FCF</th>
                <th style={{ textAlign: 'right' }}>Net Margin</th>
                <th style={{ textAlign: 'right' }}>ROE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'rgba(79, 70, 229, 0.05)', borderBottom: '2px solid var(--border-color)' }}>
                <td className="metric-name" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{comps['Ticker']} (Target)</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['EV/Revenue'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['EV/EBITDA'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['P/E (TTM)'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['P/E (Forward)'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['P/B'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['P/S'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['EV/FCF'])}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['Net Margin %'])}%</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatFinancialValue(comps['ROE %'])}%</td>
                <td></td>
              </tr>

              {peers.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No peers added yet. Use the search bar above to add comparables.
                  </td>
                </tr>
              )}

              {peers.map((peer, i) => (
                <tr key={peer.Ticker || i}>
                  <td className="metric-name">{peer['Ticker']}</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['EV/Revenue'])}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input 
                      type="number"
                      step="0.1"
                      value={getVal(peer.Ticker, 'EV/EBITDA', peer['EV/EBITDA'] ?? null) ?? ''}
                      onChange={(e) => handleOverrideChange(peer.Ticker, 'EV/EBITDA', e.target.value)}
                      style={{ width: '70px', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', textAlign: 'right', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '0.875rem' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input 
                      type="number"
                      step="0.1"
                      value={getVal(peer.Ticker, 'P/E (TTM)', peer['P/E (TTM)'] ?? null) ?? ''}
                      onChange={(e) => handleOverrideChange(peer.Ticker, 'P/E (TTM)', e.target.value)}
                      style={{ width: '70px', background: 'var(--bg-base)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', textAlign: 'right', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '0.875rem' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['P/E (Forward)'])}</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['P/B'])}</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['P/S'])}</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['EV/FCF'])}</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['Net Margin %'])}%</td>
                  <td style={{ textAlign: 'right' }}>{formatFinancialValue(peer['ROE %'])}%</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => removePeer(peer.Ticker)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}

              {peers.length > 0 && (
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid var(--border-color)' }}>
                  <td className="metric-name" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Peer Average</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['EV/Revenue'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['EV/EBITDA'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['P/E (TTM)'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['P/E (Forward)'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['P/B'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['P/S'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['EV/FCF'])}</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['Net Margin %'])}%</td>
                  <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{formatFinancialValue(averages['ROE %'])}%</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {peers.length > 0 && (
          <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(79, 70, 229, 0.05)', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(79, 70, 229, 0.2)' }}>
            <h4 style={{ color: 'var(--accent-primary)', marginBottom: '16px', textTransform: 'none', letterSpacing: 'normal', fontSize: '1rem' }}>Relative Valuation Price Targets</h4>
            <div className="grid-2">
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '4px' }}>Implied Price (Peer Avg EV/EBITDA)</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {(() => {
                      const avgEVEBITDA = averages['EV/EBITDA'];
                      const targetEV = comps['EV ($)'];
                      const targetEVEBITDA = comps['EV/EBITDA'];
                      const targetEBITDA = (targetEV && targetEVEBITDA) ? targetEV / targetEVEBITDA : 0;
                      const shares = data.dcf_summary['Shares Outstanding'] || 1;
                      const netDebt = data.dcf_summary['Net Debt ($)'] || 0;
                      const implied = avgEVEBITDA ? ((avgEVEBITDA * targetEBITDA) - netDebt) / shares : 0;
                      return implied > 0 ? `${cs}${implied.toFixed(2)}` : 'N/A';
                    })()}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    based on {averages['EV/EBITDA']?.toFixed(2)}x peer average
                  </span>
                </div>
              </div>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '4px' }}>Implied Price (Peer Avg P/E TTM)</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {(() => {
                      const avgPE = averages['P/E (TTM)'];
                      const eps = data.info['trailingEps'] || 0;
                      const implied = avgPE ? (avgPE * eps) : 0;
                      return implied > 0 ? `${cs}${implied.toFixed(2)}` : 'N/A';
                    })()}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    based on {averages['P/E (TTM)']?.toFixed(2)}x peer average
                  </span>
                </div>
              </div>
            </div>
            <p style={{ marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Note: Relative valuation provides a "Market Reality Check" to your DCF model.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
