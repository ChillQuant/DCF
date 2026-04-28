import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline
p = ValuatorPipeline('AAPL')
p.fetch_company_info()
p.fetch_financials()
clean_df = p.build_clean_financials()
print("Total Revenue:\n", clean_df["Total Revenue"])
print("FCF:\n", clean_df["Free Cash Flow"])
print("SBC:\n", clean_df.get("Stock Based Compensation"))
wacc_df = p.build_wacc_inputs(clean_df)
dcf = p.build_dcf_projection(clean_df, wacc_df)
print(p._dcf_summary)
