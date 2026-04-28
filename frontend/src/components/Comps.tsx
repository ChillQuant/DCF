import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import type { ValuationData, PeerData } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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
    setOverrides(prev => ({
      ...prev,
      [ticker]: {
        ...(prev[ticker] || {}),
        [field]: isNaN(val) ? undefined : val
      }
    }));
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
      const validVals = peers.map(p => getVal(p.Ticker, key, p[key])).filter(v => typeof v === 'number' && !Number.isNaN(v));
      results[key] = validVals.length > 0 ? validVals.reduce((acc, val) => acc + val, 0) / validVals.length : null;
    });
    
    return results;
  }, [peers, overrides]);

  // Prepare chart data for EV/EBITDA
  const chartData = useMemo(() => {
    return [comps, ...peers]
      .map(p => ({
        name: p.Ticker,
        EVEBITDA: getVal(p.Ticker, 'EV/EBITDA', p['EV/EBITDA'])
      }))
      .filter(p => p && typeof p.EVEBITDA === 'number' && !Number.isNaN(p.EVEBITDA));
  }, [comps, peers, overrides]);

  if (Object.keys(comps).length === 0) {
    return <div className="glass-panel">Comps data not available.</div>;
  }

  return (
    <div className="animate-fade-in">
      {chartData.length > 1 && (
        <div className="glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>EV/EBITDA Multiples Comparison</h2>
          <div style={{ width: '100%', height: 250 }} ref={containerRef}>
            {chartReady && (
                <BarChart
                  width={width}
                  height={height}
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} opacity={0.5} />
                  <XAxis dataKey="name" stroke="#888" tick={{ fill: '#888', fontSize: 12 }} />
                  <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 12 }} domain={[0, 'dataMax + 2']} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                    contentStyle={{ background: '#1e2128', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px' }}
                    formatter={(value: any) => [`${value.toFixed(2)}x`, 'EV/EBITDA']}
                  />
                  <Bar dataKey="EVEBITDA" radius={[4, 4, 0, 0]} barSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === comps.Ticker ? 'var(--accent-primary)' : '#8b5cf6'} />
                    ))}
                  </Bar>
                </BarChart>
            )}
          </div>
        </div>
      )}

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Comparable Company Analysis</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Add peers to dynamically compare valuation multiples and calculate implied averages.
            </p>
          </div>
          
          <form onSubmit={handleAddPeer} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <input 
                type="text" 
                className="input-search" 
                placeholder="Add Peer (e.g. MSFT)" 
                value={peerInput}
                onChange={(e) => setPeerInput(e.target.value)}
                style={{ width: '180px', padding: '0.5rem 1rem' }}
              />
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px', position: 'absolute', width: '200px' }}>{error}</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} disabled={loading}>
              {loading ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />}
              Add
            </button>
          </form>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
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
              {/* Subject Company */}
              <tr style={{ background: 'rgba(99, 102, 241, 0.1)', borderBottom: '2px solid var(--border-color)' }}>
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

              {/* Peers */}
              {peers.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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
                      value={getVal(peer.Ticker, 'EV/EBITDA', peer['EV/EBITDA']) ?? ''}
                      onChange={(e) => handleOverrideChange(peer.Ticker, 'EV/EBITDA', e.target.value)}
                      style={{ width: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', textAlign: 'right', borderRadius: '4px', padding: '2px 4px', fontSize: '0.875rem' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input 
                      type="number"
                      step="0.1"
                      value={getVal(peer.Ticker, 'P/E (TTM)', peer['P/E (TTM)']) ?? ''}
                      onChange={(e) => handleOverrideChange(peer.Ticker, 'P/E (TTM)', e.target.value)}
                      style={{ width: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', textAlign: 'right', borderRadius: '4px', padding: '2px 4px', fontSize: '0.875rem' }}
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

              {/* Average Row */}
              {peers.length > 0 && (
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderTop: '1px solid var(--border-color)' }}>
                  <td className="metric-name" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Peer Average</td>
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

        {/* Relative Valuation Targets */}
        {peers.length > 0 && (
          <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px dashed rgba(99, 102, 241, 0.3)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--accent-primary)' }}>Relative Valuation Price Targets</h3>
            <div className="grid-2">
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Implied Price (Peer Avg EV/EBITDA)</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>
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
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    based on {averages['EV/EBITDA']?.toFixed(2)}x peer average
                  </span>
                </div>
              </div>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Implied Price (Peer Avg P/E TTM)</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                    {(() => {
                      const avgPE = averages['P/E (TTM)'];
                      const eps = data.info['trailingEps'] || 0;
                      const implied = avgPE ? (avgPE * eps) : 0;
                      return implied > 0 ? `${cs}${implied.toFixed(2)}` : 'N/A';
                    })()}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    based on {averages['P/E (TTM)']?.toFixed(2)}x peer average
                  </span>
                </div>
              </div>
            </div>
            <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Note: Relative valuation provides a "Market Reality Check" to your DCF model. If the DCF shows overvaluation but the relative targets show upside, the market may be valuing this sector at a premium.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

