import sys
from pipeline import ValuatorPipeline

def debug(ticker):
    print(f"--- Debugging {ticker} ---")
    p = ValuatorPipeline(ticker)
    res = p.run()
    
    comps = res.get('comps_snapshot', {})
    ev = comps.get("EV ($)")
    print(f"Comps Snapshot EV ($): {ev}")

debug("HTHIY")
debug("6501.T")
