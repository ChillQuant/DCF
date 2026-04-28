import sys
from pipeline import ValuatorPipeline

def debug(ticker):
    print(f"--- Debugging {ticker} ---")
    p = ValuatorPipeline(ticker)
    res = p.run()
    
    wacc = res.get('wacc_inputs', {})
    dcf = res.get('dcf_summary', {})
    
    print("--- WACC Inputs ---")
    for k, v in wacc.items():
        print(f"  {k}: {v}")
        
    print("--- DCF Summary ---")
    for k, v in dcf.items():
        print(f"  {k}: {v}")

debug("JPM")
