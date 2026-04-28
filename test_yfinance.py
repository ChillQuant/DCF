import yfinance as yf
import pandas as pd

ticker = yf.Ticker("AAPL")
print("Annual Income Statement Shape:", ticker.income_stmt.shape)
print("Columns:", ticker.income_stmt.columns)

# Try to get more years if available
print("\nTrying to get more data...")
# Sometimes yfinance has 'get_income_stmt'
try:
    stmt = ticker.get_income_stmt()
    print("get_income_stmt shape:", stmt.shape)
except:
    print("get_income_stmt not available")
