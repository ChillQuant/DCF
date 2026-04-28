#!/usr/bin/env python3
import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline

p = ValuatorPipeline("MSFT")
r = p.run()
q = r.get('quality_metrics', {})

print("=== QUALITY METRICS ===")
print(f"ROIC:           {q.get('roic', 0) * 100:.1f}%" if q.get('roic') else "ROIC: N/A")
print(f"ROIC Spread:    {q.get('roic_spread', 0) * 100:.1f}pp" if q.get('roic_spread') else "ROIC Spread: N/A")
print(f"EPV/Share:      ${q.get('epv_per_share', 0):.2f}" if q.get('epv_per_share') else "EPV: N/A")
print(f"Graham Number:  ${q.get('graham_number', 0):.2f}" if q.get('graham_number') else "Graham: N/A")
print(f"Implied Growth: {q.get('implied_growth', 0) * 100:.1f}%" if q.get('implied_growth') is not None else "Implied: N/A")
print(f"Analyst EPS G:  {q.get('analyst_eps_growth', 0) * 100:.1f}%" if q.get('analyst_eps_growth') else "Analyst: N/A")
print(f"Hist ROIC rows: {len(q.get('historical_roic', []))}")

print("\n=== RISK FLAGS ===")
for f in q.get('risk_flags', []):
    print(f"  [{f['level'].upper()}] {f['msg']}")
