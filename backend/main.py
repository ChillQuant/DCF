from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pipeline import ValuatorPipeline, DataFetchError
import excel_exporter
import traceback

app = FastAPI(title="Valuator AI Backend")

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/api/evaluate/{ticker}")
async def evaluate_ticker(ticker: str):
    try:
        pipeline = ValuatorPipeline(ticker)
        results = pipeline.run()
        return results
    except DataFetchError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error while evaluating ticker")

@app.get("/api/comps/{ticker}")
async def get_comps(ticker: str):
    try:
        pipeline = ValuatorPipeline(ticker)
        comps_snapshot = pipeline.run_comps_only()
        return comps_snapshot
    except DataFetchError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error while evaluating peer ticker")

@app.post("/api/export-excel/{ticker}")
async def export_excel(ticker: str, request: Request):
    try:
        results = await request.json()
        excel_bytes = excel_exporter.create_dcf_excel(results)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={ticker.upper()}_Valuation.xlsx"
            }
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error while exporting excel")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
