import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from pipeline import ValuatorPipeline
import pandas as pd

ticker = "AAPL"
pipeline = ValuatorPipeline(ticker)
results = pipeline.run()

print("Ticker:", results['ticker'])
print("Raw Financials Length:", len(results['raw_financials']))
print("Fiscal Years:", [r['Fiscal Year'] for r in results['raw_financials']])

# Check the mapping in clean_df
clean_df = pipeline.build_clean_financials()
print("\nClean DF Shape:", clean_df.shape)
print("Clean DF Index:", clean_df.index.tolist())
