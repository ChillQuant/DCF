import { useState, useEffect } from 'react';
import type { ValuationData } from '../types';

export function GeminiNanoAdvisor({ data }: { data: ValuationData }) {
  const [status, setStatus] = useState<'idle' | 'unsupported' | 'loading' | 'success' | 'error'>('idle');
  const [analysis, setAnalysis] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const runAnalysis = async () => {
    setStatus('loading');
    setErrorMsg('');
    
    try {
      // @ts-ignore: Experimental Chrome Prompt API
      if (!window.ai || !window.ai.languageModel) {
        setStatus('unsupported');
        return;
      }

      const ticker = data.ticker || 'Unknown';
      const intrinsic = data.dcf_summary?.['Intrinsic Value/Share ($)'] || 0;
      const current = data.dcf_summary?.['Current Price ($)'] || 0;
      const qualityFlags = data.quality_metrics?.risk_flags || [];
      const flagsText = qualityFlags.map((f: any) => f.msg).join(', ') || 'None';

      const prompt = `You are a professional equity research assistant.
Analyze the company ${ticker} based on the following fundamentals:
- Current Price: $${current}
- DCF Intrinsic Value: $${intrinsic}
- Risk Flags: ${flagsText}

Provide a 3-sentence expert assessment focusing on valuation conviction and underlying risks. Keep the tone professional.`;

      // @ts-ignore: Experimental Chrome Prompt API
      const session = await window.ai.languageModel.create({
        systemPrompt: "You are an elite quantitative investment strategist.",
        temperature: 0.3
      });

      const response = await session.prompt(prompt);
      setAnalysis(response);
      setStatus('success');
      session.destroy();
    } catch (err: any) {
      console.error('Gemini Nano Error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Failed to invoke local LLM context');
    }
  };

  useEffect(() => {
    if (data) {
      runAnalysis();
    }
  }, [data]);

  if (status === 'unsupported') {
    return (
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '8px' }}>
          ✨ Local AI Insight (Gemini Nano)
        </h4>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Enable local LLM insights by turning on experimental access in your Chromium browser:<br />
          <code>chrome://flags/#prompt-api-for-gemini-nano</code>
        </p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px' }}>
        <div className="pulse" style={{ height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px' }}>
        <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>Local AI Error: {errorMsg}</p>
      </div>
    );
  }

  if (status === 'success' && analysis) {
    return (
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', border: '1px solid rgba(99,102,241,0.2)' }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '0.95rem', marginBottom: '12px' }}>
          ✨ Gemini Nano Analysis
        </h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {analysis}
        </p>
      </div>
    );
  }

  return null;
}
