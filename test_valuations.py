import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline

tickers = ['AAPL', 'MSFT', 'GOOG']
for t in tickers:
    try:
        p = ValuatorPipeline(t)
        res = p.run()
        dcf = res.get('dcf_summary', {})
        price = dcf.get('Current Price ($)', 0)
        iv = dcf.get('Intrinsic Value/Share ($)', 0)
        g = dcf.get('Assumed FCF Growth Rate', 0)
        cagr = dcf.get('FCF CAGR (Historical)', 0)
        wacc = dcf.get('WACC', 0)
        print(f"{t}: Price={price}, IV={iv}, Implied Upside={dcf.get('Upside/Downside %')}%")
        print(f"   Historical CAGR={cagr:.2%}, Used Growth={g:.2%}, WACC={wacc:.2%}")
    except Exception as e:
        print(f"{t}: Error {e}")
