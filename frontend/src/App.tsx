import React, { useState, useCallback } from 'react';
import { Search, TrendingUp, BarChart2, FileText, AlertCircle, Loader2, Download, Activity } from 'lucide-react';
import { exportValuationPDF } from './utils/pdfExport';
import Dashboard from './components/Dashboard';
import FinancialsTable from './components/FinancialsTable';
import WaccAndDcf from './components/WaccAndDcf';
import Comps from './components/Comps';
import AIPromptGenerator from './components/AIPromptGenerator';
import AnalysisHub from './components/AnalysisHub';
import type { ValuationData, PeerData } from './types';

function App() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState<ValuationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
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
    setIntrinsicOverride(null);
    setPeers([]);
    setScenariosData(null);

    try {
      const response = await fetch(`http://localhost:8000/api/evaluate/${ticker}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data for this ticker. Verify symbol.');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExportingExcel(true);
    try {
      const response = await fetch(`http://localhost:8000/api/export-excel/${data.ticker}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      console.error('Export failed:', err);
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
      console.error('Export failed:', err);
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="container animate-fade-in">
      <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <TrendingUp className="text-gradient" size={40} />
          <span className="text-gradient">Valuator AI</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Institutional-grade equity valuation engine powered by AI.
        </p>

        <form onSubmit={handleSearch} style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input
              type="text"
              className="input-search"
              placeholder="Enter ticker (e.g., AAPL)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="spinner" size={18} /> : 'Evaluate'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: '1.5rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
      </header>

      {data && !loading && (
        <main className="animate-fade-in delay-100">
          <div className="glass-panel" style={{ marginBottom: '2rem' }}>
            <div className="tabs-header" style={{ marginBottom: 0, borderBottom: 'none' }}>
              <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                <BarChart2 size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                Dashboard
              </button>
              <button className={`tab-btn ${activeTab === 'financials' ? 'active' : ''}`} onClick={() => setActiveTab('financials')}>
                <FileText size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                Financials
              </button>
              <button className={`tab-btn ${activeTab === 'wacc_dcf' ? 'active' : ''}`} onClick={() => setActiveTab('wacc_dcf')}>
                <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                WACC & DCF
              </button>
              <button className={`tab-btn ${activeTab === 'comps' ? 'active' : ''}`} onClick={() => setActiveTab('comps')}>
                <BarChart2 size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                Comps
              </button>
              <button className={`tab-btn ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
                <Activity size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                Analysis
              </button>
              <button className={`tab-btn ${activeTab === 'ai_prompts' ? 'active' : ''}`} onClick={() => setActiveTab('ai_prompts')}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }}/>
                AI Prompts
              </button>
            </div>
            
            <button 
              className="tab-btn" 
              style={{ color: 'var(--accent-primary)', borderBottomColor: 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleExportExcel}
              disabled={exportingExcel}
            >
              {exportingExcel ? <Loader2 size={16} className="spinner" /> : <Download size={16} />}
              Export Excel
            </button>

            <button 
              className="tab-btn" 
              style={{ color: 'var(--accent-primary)', borderBottomColor: 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleExportPDF}
              disabled={exportingPDF}
            >
              {exportingPDF ? <Loader2 size={16} className="spinner" /> : <Download size={16} />}
              Export PDF
            </button>
          </div>

          <div id="valuation-report" style={{ marginTop: '2rem' }}>
            {activeTab === 'dashboard'  && <Dashboard data={data} intrinsicOverride={intrinsicOverride} />}
            {activeTab === 'financials' && <FinancialsTable data={data} />}
            {/* WaccAndDcf is always mounted so onScenariosChange fires even before visiting this tab */}
            <div style={{ display: activeTab === 'wacc_dcf' ? 'block' : 'none' }}>
              <WaccAndDcf 
                data={data} 
                onRecalculate={setIntrinsicOverride} 
                onScenariosChange={handleScenariosChange}
                isVisible={activeTab === 'wacc_dcf'} 
              />
            </div>
            {activeTab === 'comps'      && <Comps data={data} peers={peers} setPeers={setPeers} overrides={compsOverrides} setOverrides={setCompsOverrides} />}
            {activeTab === 'analysis'   && <AnalysisHub data={data} peers={peers} overrides={compsOverrides} />}
            {activeTab === 'ai_prompts' && <AIPromptGenerator data={data} />}
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
