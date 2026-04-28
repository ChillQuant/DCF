import asyncio
from backend.pipeline import ValuatorPipeline
from backend.excel_exporter import create_dcf_excel

pipeline = ValuatorPipeline("AAPL")
res = pipeline.run()
create_dcf_excel(res)
print("Excel generated successfully")
