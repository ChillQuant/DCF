import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline

p = ValuatorPipeline("AAPL")
r = p.run()
s = r['dcf_summary']
w = r['wacc_inputs']

print("=== DCF SUMMARY ===")
print(f"Reported FCF (3Y Median): ${s.get('Reported FCF (3Y Median, $)'):,.0f}")
print(f"Avg SBC Deducted:         ${s.get('Avg SBC Deducted ($)'):,.0f}  <-- real cost excluded before")
print(f"Base FCF (SBC-adjusted):  ${s.get('Base FCF ($)'):,.0f}")
print(f"FCF CAGR (Historical):    {s.get('FCF CAGR (Historical)', 0)*100:.2f}%")
print(f"Stage 1 Growth Rate:      {s.get('Assumed FCF Growth Rate', 0)*100:.2f}%")
print(f"Terminal Growth Rate:     {s.get('Terminal Growth Rate', 0)*100:.2f}%")
print(f"WACC:                     {s.get('WACC', 0)*100:.2f}%")
print(f"Intrinsic Value/Share:    ${s.get('Intrinsic Value/Share ($)', 0):.2f}")
print(f"Market Price:             ${s.get('Current Price ($)', 0):.2f}")
print(f"Upside/Downside:          {s.get('Upside/Downside %', 0):.2f}%")

print("\n=== WACC INPUTS ===")
print(f"Raw Beta:            {w.get('Raw Beta')}")
print(f"Blume-Adjusted Beta: {w.get('Beta')}  <-- adjusted toward 1.0")
print(f"ERP:                 {w.get('Equity Risk Premium', 0)*100:.2f}%")
print(f"Cost of Equity:      {w.get('Cost of Equity (CAPM)', 0)*100:.2f}%")
print(f"Cost of Debt (a/t):  {w.get('Cost of Debt (After-Tax)', 0)*100:.2f}%")

print(f"\n=== PROJECTION ROWS === ({len(r['dcf_projection'])} years)")
for row in r['dcf_projection']:
    print(f"  Yr {row['Year']:10s}  Growth: {row.get('Growth Rate', 0)*100:.2f}%  FCF: ${row['Projected FCF ($)']:,.0f}  PV: ${row['PV of FCF ($)']:,.0f}")
