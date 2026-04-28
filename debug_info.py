import sys
sys.path.append('backend')
from pipeline import ValuatorPipeline
p = ValuatorPipeline('AAPL')
p.fetch_company_info()
print("Market Cap:", p.info.get("marketCap"))
print("Enterprise Value:", p.info.get("enterpriseValue"))
print("Trailing PE:", p.info.get("trailingPE"))
