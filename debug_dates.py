import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline
p = ValuatorPipeline('AAPL')
p.fetch_financials()
print("Income Stmt columns:", p.income_stmt.columns)
print("Cashflow columns:", p.cashflow.columns)
