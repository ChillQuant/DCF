import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline

p = ValuatorPipeline('PTT.BK')
p.fetch_company_info()
p.fetch_financials()
clean = p.build_clean_financials()
wacc = p.build_wacc_inputs(clean)

for col in wacc.columns:
    print(f"{col}: {wacc.iloc[0][col]}")
