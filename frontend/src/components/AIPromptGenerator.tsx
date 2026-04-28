import React, { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';
import type { ValuationData } from '../types';

export default function AIPromptGenerator({ data }: { data: ValuationData }) {
  const [copied, setCopied] = useState<string | null>(null);

  const getFinancialDataString = () => {
    return JSON.stringify({
      raw_financials: data.raw_financials,
      derived_metrics: data.derived_metrics
    }, null, 2);
  };

  const getValuationDataString = () => {
    return JSON.stringify({
      wacc_inputs: data.wacc_inputs,
      dcf_projection: data.dcf_projection,
      dcf_summary: data.dcf_summary,
      comps_snapshot: data.comps_snapshot,
      derived_metrics: data.derived_metrics
    }, null, 2);
  };

  const prompts = [
    {
      id: 'chain1',
      title: 'Prompt Chain 1 — Margin Health & Stability',
      description: 'Generates a Credit Memorandum section evaluating financial health.',
      template: `You are a Senior Credit Analyst at a bulge-bracket investment bank with 15 years of experience in corporate credit evaluation. You have been assigned to produce a formal Credit Memorandum section covering Margin Health, Capital Structure, and Financial Stability for the company described in the data below.

INSTRUCTIONS — follow these EXACTLY:

1. MARGIN ANALYSIS:
   - Evaluate Gross Margin, Operating Margin, Net Margin, and FCF Margin across all available fiscal years.
   - Identify the TREND (expanding, compressing, or volatile).
   - Benchmark: State whether each margin is above or below the typical range for this company's sector.
   - Explicitly calculate the year-over-year basis-point change for each margin.

2. CAPITAL STRUCTURE ANALYSIS:
   - Decompose the Debt/Equity ratio, Net Debt/EBITDA, and interest coverage ratio for each year.
   - Classify the leverage profile as: Conservative (<1x D/E), Moderate (1–2x), Aggressive (2–3x), or Distressed (>3x).
   - Assess refinancing risk: Is the debt predominantly short-term or long-term? What is the current ratio trend?

3. FINANCIAL STABILITY SCORECARD:
   - Assign a score from 1 (critical risk) to 10 (fortress balance sheet) across these five dimensions:
       a) Profitability Consistency
       b) Cash Flow Generation
       c) Leverage Prudence
       d) Liquidity Adequacy
       e) Earnings Quality
   - Provide a COMPOSITE SCORE.

4. OUTPUT FORMAT:
   - Use plain English. No jargon without definition.
   - Present the Stability Scorecard as a formatted table.
   - End with a one-paragraph "Credit Analyst's Take".

=== BEGIN COMPANY FINANCIAL DATA ===
${getFinancialDataString()}
=== END COMPANY FINANCIAL DATA ===`
    },
    {
      id: 'chain2',
      title: 'Prompt Chain 2 — Retail Investment Risk',
      description: 'Identifies red flags and calculates Altman Z-Score.',
      template: `You are acting as a Forensic Financial Analyst and Risk Officer conducting a pre-investment due diligence review for a retail investor. Your mandate is to identify EVERY material risk and red flag hidden in the historical financial data provided below.

ANALYTICAL FRAMEWORK:

STEP 1: RED FLAG SCAN
Examine the data for warning signals (declining revenue, margins below 5%, negative FCF with positive Net Income, high debt, low current ratio, high stock-based comp, etc). State "FLAGGED" or "CLEAR" for each.

STEP 2: ALTMAN Z-SCORE ESTIMATION
Compute an approximate Altman Z-Score and classify into Safe, Grey, or Distress Zone.

STEP 3: CONCENTRATION & SUSTAINABILITY RISKS
Assess revenue deceleration, debt-funded growth, and capex trends.

STEP 4: RISK SEVERITY MATRIX
Produce a table mapping Risk Factor, Severity, Trend, and Impact Horizon.

STEP 5: FINAL RISK VERDICT
Classify the investment as LOW, MODERATE, ELEVATED, or HIGH RISK. End with "If I Were Investing My Own Money" paragraph.

=== BEGIN COMPANY FINANCIAL DATA ===
${getValuationDataString()}
=== END COMPANY FINANCIAL DATA ===`
    },
    {
      id: 'chain3',
      title: 'Prompt Chain 3 — Definitive Valuation Verdict',
      description: 'Produces a final investment verdict based on DCF and Comps.',
      template: `You are the Head of Equity Research at a top-tier asset management firm. You have been given a completed DCF valuation model and comparable company analysis. Deliver a FINAL INVESTMENT VERDICT.

REQUIRED ANALYTICAL SEQUENCE:

SECTION 1: DCF VALUATION AUDIT
- Review WACC inputs. Flag anomalies.
- Review FCF growth rate assumption.
- Recalculate Intrinsic Value using Base, Bull (+200bps growth, -50bps WACC), and Bear cases. Present in a table.

SECTION 2: COMPARABLE COMPANY CROSS-CHECK
- Calculate implied equity value per share using Comps. Compare to DCF.

SECTION 3: TRIANGULATED FAIR VALUE
- Weight valuations (DCF: 50%, EV/EBITDA: 30%, P/E: 20%). Calculate BLENDED FAIR VALUE.

SECTION 4: THE VERDICT
- Compare Blended Fair Value to Current Market Price.
- Classify as STRONG BUY, BUY, HOLD, SELL, or STRONG SELL based on percentage difference.

SECTION 5: ONE-PARAGRAPH EXECUTIVE SUMMARY
Write exactly 4 sentences covering worth, market price, verdict, and key catalyst.

=== BEGIN VALUATION DATA ===
${getValuationDataString()}
=== END VALUATION DATA ===`
    }
  ];

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="animate-fade-in">
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>AI Prompt Library</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          These prompts have been dynamically populated with {data.ticker}'s actual financial and valuation data. 
          Copy them and paste into ChatGPT, Claude, or Gemini for instant institutional-quality analysis.
        </p>
      </div>

      <div className="grid-3">
        {prompts.map((prompt, index) => (
          <div key={prompt.id} className={`glass-panel delay-${(index + 1) * 100}`} style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{prompt.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', flexGrow: 1 }}>
              {prompt.description}
            </p>
            
            <div style={{ position: 'relative' }}>
              <div 
                style={{ 
                  background: 'rgba(0,0,0,0.3)', 
                  padding: '1rem', 
                  borderRadius: 'var(--radius-sm)', 
                  height: '150px', 
                  overflow: 'hidden',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  position: 'relative'
                }}
              >
                {prompt.template}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px', background: 'linear-gradient(transparent, #15181e)' }}></div>
              </div>
              
              <button 
                onClick={() => handleCopy(prompt.id, prompt.template)}
                className="btn-primary" 
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {copied === prompt.id ? (
                  <><CheckCircle2 size={16} /> Copied to Clipboard</>
                ) : (
                  <><Copy size={16} /> Copy Prompt & Data</>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
