import React, { useState, useCallback } from 'react';
import { Search, TrendingUp, AlertCircle, Loader2, Download } from 'lucide-react';
import { exportValuationPDF } from './utils/pdfExport';
import { IntrinsicValueSummary, CompanyProfile, RiskMetrics, ValuationMultiples } from './components/Dashboard';
import { HistoricalPerformanceChart, FinancialStatementsTable } from './components/FinancialsTable';
import WaccAndDcf from './components/WaccAndDcf';
import Comps from './components/Comps';
import AIPromptGenerator from './components/AIPromptGenerator';
import { RiskFlagPanel, MultiMethodValuation, ReverseDCF, RoicWaccChart } from './components/AnalysisHub';
import { GeminiNanoAdvisor } from './components/GeminiNanoAdvisor';
import type { ValuationData, PeerData } from './types';

function App() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<ValuationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [intrinsicOverride, setIntrinsicOverride] = useState<number | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [peers, setPeers] = useState<PeerData[]>([]);
  const [compsOverrides, setCompsOverrides] = useState<Record<string, Record<string, number>>>({});
  const [scenariosData, setScenariosData] = useState<{ scenarios: any; results: any } | null>(null);

  const handleScenariosChange = useCallback((s: any, r: any) => {
    setScenariosData({ scenarios: s, results: r });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    setLoading(true);
    setError('');
    setData(null);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/api/evaluate/${ticker}`);
      if (!response.ok) throw new Error('Ticker not found or error processing data');
      const resData = await response.json();
      setData(resData);
      setScenariosData(null); // reset interactive overrides
      setIntrinsicOverride(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExportingExcel(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_BASE_URL}/api/export-excel/${data.ticker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          scenarios: scenariosData ? scenariosData.scenarios : null,
          scenario_results: scenariosData ? scenariosData.results : null
        }),
      });
      if (!response.ok) throw new Error('Failed to generate Excel');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.ticker}_Valuation.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPDF = async () => {
    if (!data) return;
    setExportingPDF(true);
    try {
      await exportValuationPDF(data, intrinsicOverride, scenariosData, peers);
    } catch (err) {
      console.error(err);
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="container animate-fade-in">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TrendingUp style={{ color: 'var(--accent-primary)' }} size={28} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Valuator AI</h1>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '400px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
            <input
              type="text"
              className="input-search"
              placeholder="Enter Ticker..."
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              style={{ paddingLeft: '36px', maxWidth: 'none' }}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="spinner" /> : 'Evaluate'}
          </button>
        </form>

        {data && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={handleExportExcel} disabled={exportingExcel} style={{ height: '36px' }}>
              {exportingExcel ? <Loader2 className="spinner" /> : <Download size={14} />} Excel
            </button>
            <button className="btn-secondary" onClick={handleExportPDF} disabled={exportingPDF} style={{ height: '36px' }}>
              {exportingPDF ? <Loader2 className="spinner" /> : <Download size={14} />} PDF
            </button>
          </div>
        )}
      </header>

      {error && (
        <div style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {data && !loading && (
        <main>
          <div className="tabs-header">
            <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
              Overview
            </button>
            <button className={`tab-btn ${activeTab === 'projections' ? 'active' : ''}`} onClick={() => setActiveTab('projections')}>
              Projections & Financials
            </button>
            <button className={`tab-btn ${activeTab === 'valuation' ? 'active' : ''}`} onClick={() => setActiveTab('valuation')}>
              Valuation & Comps
            </button>
            <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
              AI Assistant
            </button>
          </div>

          <div style={{ marginTop: '24px' }}>
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <GeminiNanoAdvisor data={data} />
                <div className="grid-2" style={{ alignItems: 'stretch' }}>
                  <IntrinsicValueSummary data={data} intrinsicOverride={intrinsicOverride} />
                  <MultiMethodValuation data={data} peers={peers} overrides={compsOverrides} />
                </div>
                <div className="grid-3">
                  <CompanyProfile data={data} />
                  <RiskMetrics data={data} />
                  <ValuationMultiples data={data} />
                </div>
                <div className="grid-2">
                  <RiskFlagPanel data={data} />
                  <HistoricalPerformanceChart data={data} />
                </div>
              </div>
            )}

            {activeTab === 'projections' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <WaccAndDcf 
                  data={data} 
                  onRecalculate={setIntrinsicOverride} 
                  onScenariosChange={handleScenariosChange}
                  isVisible={activeTab === 'projections'} 
                />
                <FinancialStatementsTable data={data} />
              </div>
            )}

            {activeTab === 'valuation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <Comps data={data} peers={peers} setPeers={setPeers} overrides={compsOverrides} setOverrides={setCompsOverrides} />
                <div className="grid-2">
                  <ReverseDCF data={data} />
                  <RoicWaccChart data={data} />
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <AIPromptGenerator data={data} />
            )}
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
