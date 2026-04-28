import sys
import pandas as pd
import numpy as np
sys.path.append('backend')
from pipeline import ValuatorPipeline

tickers = ['PTT.BK', 'CPALL.BK']
for t in tickers:
    try:
        p = ValuatorPipeline(t)
        res = p.run()
        dcf = res.get('dcf_summary', {})
        print(f"\n--- {t} ---")
        print(f"Currency: {dcf.get('Currency')}, Fin Currency: {dcf.get('Financial Currency')}")
        print(f"Price: {dcf.get('Current Price ($)')}")
        print(f"Intrinsic Value: {dcf.get('Intrinsic Value/Share ($)')}")
        print(f"Upside: {dcf.get('Upside/Downside %')}%")
        print(f"Shares Out: {dcf.get('Shares Outstanding')}")
        print(f"Base FCF: {dcf.get('Base FCF ($)')}")
        print(f"Net Debt: {dcf.get('Net Debt ($)')}")
        print(f"WACC: {dcf.get('WACC'):.2%}")
        print(f"Used Growth: {dcf.get('Assumed FCF Growth Rate'):.2%}")
        print(f"Terminal Value PV: {dcf.get('PV of Terminal Value ($)')}")
        print(f"Equity Value: {dcf.get('Equity Value ($)')}")
        
        info = p.info
        print(f"Market Cap (yf info): {info.get('marketCap')}")
        print(f"Enterprise Value (yf info): {info.get('enterpriseValue')}")
        
    except Exception as e:
        print(f"{t}: Error {e}")
