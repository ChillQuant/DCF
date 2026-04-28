import sys
import pandas as pd
import numpy as np
sys.path.append('backend')
from pipeline import ValuatorPipeline
p = ValuatorPipeline('AAPL')
p.fetch_company_info()
p.fetch_financials()
clean_df = p.build_clean_financials()

hist_fcf = []
for i in range(len(clean_df) - 1, -1, -1):
    row = clean_df.iloc[i]
    fcf = row.get("Free Cash Flow", np.nan)
    sbc = row.get("Stock Based Compensation", np.nan)
    sbc_adj = sbc if pd.notna(sbc) else 0
    hist_fcf.append(fcf - sbc_adj)

print("hist_fcf:", hist_fcf)
pos_fcf = [(v, i) for i, v in enumerate(hist_fcf) if v > 0]
fcf_growth_rate = 0.05
if len(pos_fcf) >= 2:
    first_val = pos_fcf[0][0]
    last_val  = pos_fcf[-1][0]
    n_periods = pos_fcf[-1][1] - pos_fcf[0][1]
    if n_periods > 0 and first_val > 0:
        cagr = (last_val / first_val) ** (1 / n_periods) - 1
        fcf_growth_rate = cagr
print("fcf cagr:", fcf_growth_rate)

rev = clean_df["Total Revenue"].dropna().values
print("rev values:", rev)
rev_cagr = 0.05
if len(rev) >= 2 and rev[-1] > 0 and rev[0] > 0:
    rev_cagr = (rev[0] / rev[-1]) ** (1 / max(len(rev) - 1, 1)) - 1
print("rev cagr:", rev_cagr)

if 0 <= 0 or not np.isfinite(fcf_growth_rate):
    fcf_growth_rate = rev_cagr
elif abs(fcf_growth_rate) > 0.20:
    fcf_growth_rate = 0.50 * fcf_growth_rate + 0.50 * rev_cagr

print("final fcf_growth_rate:", fcf_growth_rate)

