import sys
import os
import warnings
import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
import requests

warnings.filterwarnings("ignore")

RISK_FREE_FALLBACK = 0.0435
MARKET_RETURN = 0.10
STAGE1_YEARS = 5    # High-growth projection period
STAGE2_YEARS = 5    # Growth fade period (two-stage DCF)
TERMINAL_GROWTH_RATE = 0.025
PROJECTION_YEARS = STAGE1_YEARS  # kept for frontend slider reference

COUNTRY_RISK_PROFILES = {
    'USD': {'rf': 0.0435, 'erp': 0.055, 'beta_floor': 0.8},
    'EUR': {'rf': 0.0250, 'erp': 0.060, 'beta_floor': 0.8},
    'GBP': {'rf': 0.0400, 'erp': 0.060, 'beta_floor': 0.8},
    'JPY': {'rf': 0.0100, 'erp': 0.065, 'beta_floor': 0.8},
    'CHF': {'rf': 0.0100, 'erp': 0.055, 'beta_floor': 0.8},
    'CAD': {'rf': 0.0350, 'erp': 0.055, 'beta_floor': 0.8},
    'AUD': {'rf': 0.0420, 'erp': 0.055, 'beta_floor': 0.8},
    'CNY': {'rf': 0.0250, 'erp': 0.070, 'beta_floor': 0.9},
    'HKD': {'rf': 0.0350, 'erp': 0.065, 'beta_floor': 0.9},
    'INR': {'rf': 0.0700, 'erp': 0.080, 'beta_floor': 1.0},
    'BRL': {'rf': 0.1050, 'erp': 0.090, 'beta_floor': 1.0},
    'MXN': {'rf': 0.0950, 'erp': 0.085, 'beta_floor': 1.0},
    'ZAR': {'rf': 0.1000, 'erp': 0.090, 'beta_floor': 1.0},
    'RUB': {'rf': 0.1500, 'erp': 0.120, 'beta_floor': 1.0},
    'THB': {'rf': 0.0260, 'erp': 0.080, 'beta_floor': 1.0},
    'SGD': {'rf': 0.0300, 'erp': 0.060, 'beta_floor': 0.8},
    'MYR': {'rf': 0.0380, 'erp': 0.075, 'beta_floor': 1.0},
    'IDR': {'rf': 0.0680, 'erp': 0.085, 'beta_floor': 1.0},
    'PHP': {'rf': 0.0630, 'erp': 0.085, 'beta_floor': 1.0},
    'VND': {'rf': 0.0280, 'erp': 0.100, 'beta_floor': 1.0},
    'KRW': {'rf': 0.0340, 'erp': 0.065, 'beta_floor': 0.9},
    'TWD': {'rf': 0.0150, 'erp': 0.065, 'beta_floor': 0.9},
}

FX_FALLBACK = {
    'JPYUSD': 0.0065,
    'USDJPY': 155.0,
    'EURUSD': 1.08,
    'GBPUSD': 1.25,
    'KRWUSD': 0.00073,
    'THBUSD': 0.027,
}

class DataFetchError(Exception):
    pass

def replace_nan(obj):
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: replace_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [replace_nan(v) for v in obj]
    return obj

class ValuatorPipeline:
    def __init__(self, ticker: str):
        self.ticker = ticker.upper().strip()
        self.yf_obj = yf.Ticker(self.ticker)
        self.info: dict = {}
        self.income_stmt: pd.DataFrame = pd.DataFrame()
        self.balance_sheet: pd.DataFrame = pd.DataFrame()
        self.cashflow: pd.DataFrame = pd.DataFrame()
        self.hist_prices: pd.DataFrame = pd.DataFrame()
        self.risk_free_rate: float = RISK_FREE_FALLBACK

    def fetch_risk_free_rate(self) -> float:
        try:
            tnx = yf.Ticker("^TNX")
            hist = tnx.history(period="5d")
            if hist.empty:
                raise DataFetchError("^TNX history empty")
            last_close = hist["Close"].dropna().iloc[-1]
            self.risk_free_rate = round(float(last_close) / 100, 6)
        except Exception:
            self.risk_free_rate = RISK_FREE_FALLBACK
        return self.risk_free_rate

    def fetch_company_info(self) -> dict:
        try:
            self.info = self.yf_obj.info
            if not self.info or "shortName" not in self.info:
                raise DataFetchError("Ticker .info payload is empty or invalid")
        except Exception as e:
            raise DataFetchError(f"Failed to fetch info for '{self.ticker}'. Error: {e}")
        return self.info

    def fetch_financials(self):
        try:
            # Use freq='annual' explicitly to get more history if available
            self.income_stmt = self.yf_obj.get_income_stmt(freq='annual')
        except Exception:
            self.income_stmt = self.yf_obj.income_stmt

        try:
            self.balance_sheet = self.yf_obj.get_balance_sheet(freq='annual')
        except Exception:
            self.balance_sheet = self.yf_obj.balance_sheet

        try:
            self.cashflow = self.yf_obj.get_cashflow(freq='annual')
        except Exception:
            self.cashflow = self.yf_obj.cashflow

    def fetch_price_history(self):
        try:
            self.hist_prices = self.yf_obj.history(period="3y")[["Close"]]
            self.hist_prices.index = self.hist_prices.index.tz_localize(None)
        except Exception:
            self.hist_prices = pd.DataFrame()

    @staticmethod
    def _safe_get(source: dict, key: str, default=0.0):
        val = source.get(key, default)
        if val is None:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def _extract_line_item(self, df: pd.DataFrame, label: str) -> list:
        if df.empty or label not in df.index:
            return [np.nan] * max(df.shape[1] if not df.empty else 3, 3)
        row = df.loc[label]
        return [float(x) if pd.notna(x) else np.nan for x in row.values]

    def build_clean_financials(self) -> pd.DataFrame:
        # Collect all unique years across all statements
        all_years = set()
        for df in [self.income_stmt, self.balance_sheet, self.cashflow]:
            if not df.empty:
                for col in df.columns:
                    all_years.add(col)
        
        # Sort years descending (latest first)
        sorted_years = sorted(list(all_years), reverse=True)
        year_labels = [str(c.year) if hasattr(c, "year") else str(c) for c in sorted_years]
        
        if not year_labels:
            year_labels = [str(dt.date.today().year - i) for i in range(5)]

        mapping = {
            "Total Revenue":            ("income_stmt", "Total Revenue"),
            "Cost Of Revenue":          ("income_stmt", "Cost Of Revenue"),
            "Gross Profit":             ("income_stmt", "Gross Profit"),
            "Operating Income":         ("income_stmt", "Operating Income"),
            "EBIT":                     ("income_stmt", "EBIT"),
            "EBITDA":                   ("income_stmt", "EBITDA"),
            "Net Income":               ("income_stmt", "Net Income"),
            "Interest Expense":         ("income_stmt", "Interest Expense"),
            "Tax Provision":            ("income_stmt", "Tax Provision"),
            "Pretax Income":            ("income_stmt", "Pretax Income"),
            "Diluted EPS":              ("income_stmt", "Diluted EPS"),
            "Total Assets":             ("balance_sheet", "Total Assets"),
            "Total Liabilities":        ("balance_sheet", "Total Liabilities Net Minority Interest"),
            "Total Equity":             ("balance_sheet", "Stockholders Equity"),
            "Total Debt":               ("balance_sheet", "Total Debt"),
            "Cash And Equivalents":     ("balance_sheet", "Cash And Cash Equivalents"),
            "Net Debt":                 ("balance_sheet", "Net Debt"),
            "Current Assets":           ("balance_sheet", "Current Assets"),
            "Current Liabilities":      ("balance_sheet", "Current Liabilities"),
            "Long Term Debt":           ("balance_sheet", "Long Term Debt"),
            "Short Term Debt":          ("balance_sheet", "Current Debt"),
            "Operating Cash Flow":      ("cashflow", "Operating Cash Flow"),
            "Capital Expenditure":      ("cashflow", "Capital Expenditure"),
            "Free Cash Flow":           ("cashflow", "Free Cash Flow"),
            "Depreciation & Amort":     ("cashflow", "Depreciation And Amortization"),
            "Stock Based Compensation": ("cashflow", "Stock Based Compensation"),
        }
        source_map = {
            "income_stmt": self.income_stmt,
            "balance_sheet": self.balance_sheet,
            "cashflow": self.cashflow,
        }
        
        # Create a year-to-date mapping for consistent indexing
        # We'll use the year string as the primary key
        year_to_original_dates = {}
        for dt in sorted_years:
            yr_str = str(dt.year) if hasattr(dt, 'year') else str(dt)[:4]
            if yr_str not in year_to_original_dates:
                year_to_original_dates[yr_str] = dt
        
        final_year_labels = sorted(year_to_original_dates.keys(), reverse=True)
        records = {}
        
        for display_name, (src_key, raw_label) in mapping.items():
            df_src = source_map[src_key]
            values = []
            
            if not df_src.empty and raw_label in df_src.index:
                row = df_src.loc[raw_label]
                # row is a series/dataframe row with dates as index
                for yr in final_year_labels:
                    # Find any date in this row that matches the year
                    match = None
                    for col_dt in row.index:
                        col_yr = str(col_dt.year) if hasattr(col_dt, 'year') else str(col_dt)[:4]
                        if col_yr == yr:
                            val = row[col_dt]
                            match = float(val) if pd.notna(val) else np.nan
                            break
                    values.append(match if match is not None else np.nan)
            else:
                values = [np.nan] * len(final_year_labels)
            
            records[display_name] = values

        clean_df = pd.DataFrame(records, index=final_year_labels)
        clean_df.index.name = "Fiscal Year"
        clean_df = clean_df.ffill().bfill()

        currency = self.info.get('currency', 'USD')
        fin_currency = self.info.get('financialCurrency', currency)
        needs_fx = (currency.upper() != fin_currency.upper())
        fx_rate = 1.0

        if needs_fx:
            try:
                fx_ticker = f"{fin_currency.upper()}{currency.upper()}=X"
                hist = yf.Ticker(fx_ticker).history(period="5d")
                if not hist.empty:
                    fx_rate = float(hist["Close"].iloc[-1])
                else:
                    fx_rate = FX_FALLBACK.get(f"{fin_currency.upper()}{currency.upper()}", 1.0)
            except Exception:
                fx_rate = FX_FALLBACK.get(f"{fin_currency.upper()}{currency.upper()}", 1.0)

            # Convert all monetary columns in clean_df to the trading currency
            for col in clean_df.columns:
                clean_df[col] = clean_df[col] * fx_rate
                
        self._fx_rate = fx_rate
        self._fx_conversion = f"{fin_currency} -> {currency}" if needs_fx else None

        return clean_df

    def compute_derived_metrics(self, clean_df: pd.DataFrame) -> pd.DataFrame:
        df = clean_df.copy()
        df["Gross Margin %"] = (df["Gross Profit"] / df["Total Revenue"] * 100).round(2)
        df["Operating Margin %"] = (df["Operating Income"] / df["Total Revenue"] * 100).round(2)
        df["Net Margin %"] = (df["Net Income"] / df["Total Revenue"] * 100).round(2)
        df["FCF Margin %"] = (df["Free Cash Flow"] / df["Total Revenue"] * 100).round(2)
        df["ROE %"] = (df["Net Income"] / df["Total Equity"].replace(0, np.nan) * 100).round(2)
        df["ROA %"] = (df["Net Income"] / df["Total Assets"].replace(0, np.nan) * 100).round(2)
        df["ROIC %"] = (df["EBIT"] * (1 - 0.21) / ((df["Total Equity"] + df["Total Debt"] - df["Cash And Equivalents"]).replace(0, np.nan)) * 100).round(2)
        df["Debt/Equity"] = (df["Total Debt"] / df["Total Equity"].replace(0, np.nan)).round(4)
        df["Current Ratio"] = (df["Current Assets"] / df["Current Liabilities"].replace(0, np.nan)).round(4)
        df["Net Debt/EBITDA"] = (df["Net Debt"] / df["EBITDA"].replace(0, np.nan)).round(4)
        df["Effective Tax Rate %"] = (df["Tax Provision"] / df["Pretax Income"].replace(0, np.nan) * 100).round(2)

        rev = df["Total Revenue"].values
        growth = [np.nan]
        for i in range(1, len(rev)):
            if rev[i] != 0 and not np.isnan(rev[i]):
                growth.append(round((rev[i - 1] - rev[i]) / abs(rev[i]) * 100, 2))
            else:
                growth.append(np.nan)
        df["Revenue Growth YoY %"] = growth
        return df

    def build_wacc_inputs(self, clean_df: pd.DataFrame) -> pd.DataFrame:
        info = self.info
        latest = clean_df.iloc[0] if not clean_df.empty else pd.Series(dtype=float)
        
        market_cap = self._safe_get(info, "marketCap", 0)
        shares_out = self._safe_get(info, "sharesOutstanding", 0)
        current_price = self._safe_get(info, "currentPrice", self._safe_get(info, "regularMarketPrice", 0))
        
        if market_cap == 0 and shares_out > 0 and current_price > 0:
            market_cap = shares_out * current_price
            
        total_debt = latest.get("Total Debt", 0) if not np.isnan(latest.get("Total Debt", 0)) else 0
        ev = market_cap + total_debt - (latest.get("Cash And Equivalents", 0) if not np.isnan(latest.get("Cash And Equivalents", 0)) else 0)
        
        currency = self.info.get("currency", "USD")
        profile = COUNTRY_RISK_PROFILES.get(currency.upper(), COUNTRY_RISK_PROFILES['USD'])
        
        # FIX #5: Blume's beta adjustment toward market mean (used by Bloomberg/Goldman)
        raw_beta = self._safe_get(info, "beta", 1.0)
        if raw_beta == 0 or np.isnan(raw_beta): raw_beta = 1.0
        
        # Apply region-specific beta floor to prevent artificially low discount rates in emerging markets
        beta_floor = profile.get('beta_floor', 0.8)
        beta = max(round((2/3) * raw_beta + (1/3) * 1.0, 6), beta_floor)

        rf = profile.get('rf', self.risk_free_rate)
        erp = profile.get('erp', max(0.045, min(0.065, MARKET_RETURN - rf)))
        cost_of_equity = rf + beta * erp

        interest_expense = abs(latest.get("Interest Expense", 0)) if not np.isnan(latest.get("Interest Expense", 0)) else 0
        # FIX #7: Floor cost of debt at risk-free rate (lenders won't lend below treasury)
        raw_cost_of_debt = interest_expense / total_debt if total_debt > 0 else rf
        cost_of_debt_pretax = max(raw_cost_of_debt, rf) if total_debt > 0 else rf

        eff_tax = latest.get("Tax Provision", 0) / latest.get("Pretax Income", 1) if latest.get("Pretax Income", 1) != 0 else 0.21
        if np.isnan(eff_tax) or eff_tax < 0 or eff_tax > 0.50: eff_tax = 0.21
        cost_of_debt_aftertax = cost_of_debt_pretax * (1 - eff_tax)

        total_capital = market_cap + total_debt
        w_equity = market_cap / total_capital if total_capital > 0 else 1.0
        w_debt = total_debt / total_capital if total_capital > 0 else 0.0
        wacc = (w_equity * cost_of_equity) + (w_debt * cost_of_debt_aftertax)
        
        return pd.DataFrame([{
            "Ticker": self.ticker,
            "Current Price ($)": current_price,
            "Shares Outstanding": shares_out,
            "Market Cap ($)": market_cap,
            "Total Debt ($)": total_debt,
            "Cash ($)": latest.get("Cash And Equivalents", 0),
            "Enterprise Value ($)": ev,
            "Raw Beta": round(raw_beta, 4),
            "Beta": beta,  # Blume-adjusted
            "Risk-Free Rate": rf,
            "Equity Risk Premium": erp,
            "Cost of Equity (CAPM)": round(cost_of_equity, 6),
            "Interest Expense ($)": interest_expense,
            "Cost of Debt (Pre-Tax)": round(cost_of_debt_pretax, 6),
            "Effective Tax Rate": round(eff_tax, 6),
            "Cost of Debt (After-Tax)": round(cost_of_debt_aftertax, 6),
            "Weight Equity": round(w_equity, 6),
            "Weight Debt": round(w_debt, 6),
            "WACC": round(wacc, 6),
            "Terminal Growth Rate": TERMINAL_GROWTH_RATE,
            "Projection Years": PROJECTION_YEARS,
        }])

    def build_dcf_projection(self, clean_df: pd.DataFrame, wacc_inputs: pd.DataFrame) -> pd.DataFrame:
        """Two-stage DCF (10-year) with normalized FCF, SBC deduction, and FCF CAGR growth."""
        if clean_df.empty: return pd.DataFrame()

        # ── FIX #2: Normalize Base FCF using 3-year median ─────────────────────
        # Collect FCF values from available years (most recent first)
        fcf_values = []
        sbc_values = []
        for i in range(min(3, len(clean_df))):
            row = clean_df.iloc[i]
            fcf = row.get("Free Cash Flow", np.nan)
            sbc = row.get("Stock Based Compensation", np.nan)
            if np.isnan(fcf) or fcf == 0:
                ocf = row.get("Operating Cash Flow", 0)
                capex = row.get("Capital Expenditure", 0)
                fcf = (ocf if not np.isnan(ocf) else 0) - abs(capex if not np.isnan(capex) else 0)
            fcf_values.append(fcf)
            sbc_values.append(sbc if not np.isnan(sbc) else 0)

        # ── FIX #3: Subtract SBC (real economic dilution cost) ──────────────────
        # SBC is added back as non-cash in OCF, so reported FCF is inflated
        real_fcf_values = [fcf - sbc for fcf, sbc in zip(fcf_values, sbc_values)]
        base_fcf = float(np.median(real_fcf_values)) if real_fcf_values else 0
        avg_sbc = float(np.mean(sbc_values)) if sbc_values else 0
        avg_reported_fcf = float(np.median(fcf_values)) if fcf_values else 0

        # ── FIX #1: Use FCF CAGR, not Revenue CAGR ─────────────────────────────
        # Get historical FCF series (oldest first for CAGR calculation)
        hist_fcf = []
        for i in range(len(clean_df) - 1, -1, -1):
            row = clean_df.iloc[i]
            fcf = row.get("Free Cash Flow", np.nan)
            sbc = row.get("Stock Based Compensation", np.nan)
            if np.isnan(fcf) or fcf == 0:
                ocf = row.get("Operating Cash Flow", 0)
                capex = row.get("Capital Expenditure", 0)
                fcf = (ocf if not np.isnan(ocf) else 0) - abs(capex if not np.isnan(capex) else 0)
            sbc_adj = sbc if not np.isnan(sbc) else 0
            hist_fcf.append(fcf - sbc_adj)

        # Compute CAGR if we have at least 2 positive FCF years
        pos_fcf = [(v, i) for i, v in enumerate(hist_fcf) if v > 0]
        fcf_growth_rate = 0.05  # fallback
        if len(pos_fcf) >= 2:
            first_val = pos_fcf[0][0]
            last_val  = pos_fcf[-1][0]
            n_periods = pos_fcf[-1][1] - pos_fcf[0][1]
            if n_periods > 0 and first_val > 0:
                cagr = (last_val / first_val) ** (1 / n_periods) - 1
                fcf_growth_rate = cagr
        # ── Normalize: if SBC-adj FCF is negative, use reported FCF ─────────────
        # Heavy-capex companies (energy, telco) often have negative real FCF.
        # Fall back to reported FCF (pre-SBC) so the model can still run.
        if base_fcf <= 0 and avg_reported_fcf > 0:
            base_fcf = avg_reported_fcf  # use pre-SBC as conservative floor
            sbc_note = "SBC-adj FCF negative; using reported FCF as base"
        else:
            sbc_note = ""

        # ── FCF CAGR with distortion guard ────────────────────────────────────────
        # For cyclical/commodity companies, FCF swings wildly year-to-year.
        # If CAGR > 20%, blend 50/50 with revenue CAGR to reduce distortion.
        rev = clean_df["Total Revenue"].dropna().values
        rev_cagr = 0.05
        if len(rev) >= 2 and rev[-1] > 0 and rev[0] > 0:
            rev_cagr = (rev[0] / rev[-1]) ** (1 / max(len(rev) - 1, 1)) - 1

        # ── FIX #3: Better Growth Rate Blending ───────────────────────────────────
        # Get Analyst Forward Growth
        fwd_eps = self._safe_get(self.info, "forwardEps", np.nan)
        trail_eps = self._safe_get(self.info, "trailingEps", np.nan)
        analyst_growth = ((fwd_eps / trail_eps) - 1) if (pd.notna(fwd_eps) and pd.notna(trail_eps) and trail_eps > 0) else np.nan

        # If FCF CAGR is negative but Revenue CAGR is positive, the company might be in an investment cycle
        # Default to a more optimistic blend
        valid_rates = []
        if np.isfinite(fcf_growth_rate) and -0.05 < fcf_growth_rate < 0.50:
            valid_rates.append(fcf_growth_rate)
        if np.isfinite(rev_cagr) and rev_cagr > 0:
            valid_rates.append(rev_cagr)
        if np.isfinite(analyst_growth) and -0.10 < analyst_growth < 0.50:
            valid_rates.append(analyst_growth)
            # Give analyst estimates double weight if they exist and are reasonable
            valid_rates.append(analyst_growth)

        if valid_rates:
            blended_growth = float(np.mean(valid_rates))
        else:
            blended_growth = max(rev_cagr, 0.05) if np.isfinite(rev_cagr) else 0.05

        # Floor growth at 0% for profitable companies unless all signals are deeply negative
        if base_fcf > 0 and blended_growth < 0 and (np.isfinite(rev_cagr) and rev_cagr >= 0):
             blended_growth = max(rev_cagr, 0.02)
             
        # Cap stage 1 growth: max 30%, min -5%
        stage1_growth = max(min(blended_growth, 0.30), -0.05)

        wacc = wacc_inputs.iloc[0]["WACC"]
        rf   = wacc_inputs.iloc[0]["Risk-Free Rate"]

        # ── FIX #6: Terminal growth must be < risk-free rate ────────────────────
        tgr = min(TERMINAL_GROWTH_RATE, max(rf - 0.01, 0.01))

        shares   = wacc_inputs.iloc[0]["Shares Outstanding"]
        total_debt = clean_df.iloc[0].get("Total Debt", 0) if not np.isnan(clean_df.iloc[0].get("Total Debt", 0)) else 0
        cash = clean_df.iloc[0].get("Cash And Equivalents", 0) if not np.isnan(clean_df.iloc[0].get("Cash And Equivalents", 0)) else 0
        net_debt = total_debt - cash

        # ── FIX #4: Two-Stage DCF (Stage 1: high growth, Stage 2: linear fade) ─
        total_years = STAGE1_YEARS + STAGE2_YEARS
        rows = []
        cumulative_pv = 0.0
        projected_fcf = base_fcf

        for yr in range(1, total_years + 1):
            if yr <= STAGE1_YEARS:
                # Stage 1: High growth phase
                growth = stage1_growth
                stage_label = "S1"
            else:
                # Stage 2: Linear fade from stage1_growth → tgr
                fade_step = yr - STAGE1_YEARS
                growth = stage1_growth + (tgr - stage1_growth) * (fade_step / STAGE2_YEARS)
                stage_label = "S2"

            projected_fcf = projected_fcf * (1 + growth)
            discount_factor = 1 / ((1 + wacc) ** yr)
            pv_fcf = projected_fcf * discount_factor
            cumulative_pv += pv_fcf

            rows.append({
                "Year": f"{yr} ({stage_label})",
                "Growth Rate": round(growth, 6),
                "Projected FCF ($)": round(projected_fcf, 2),
                "Discount Factor": round(discount_factor, 6),
                "PV of FCF ($)": round(pv_fcf, 2),
                "Cumulative PV ($)": round(cumulative_pv, 2),
            })

        # Terminal value anchored on Year 10 FCF
        terminal_fcf = projected_fcf * (1 + tgr)
        terminal_value = terminal_fcf / (wacc - tgr) if wacc > tgr else 0
        pv_terminal = terminal_value / ((1 + wacc) ** total_years)
        enterprise_value = cumulative_pv + pv_terminal
        equity_value = enterprise_value - net_debt
        intrinsic_per_share = equity_value / shares if shares > 0 else 0

        rows.append({
            "Year": "TERMINAL",
            "Growth Rate": round(tgr, 6),
            "Projected FCF ($)": round(terminal_fcf, 2),
            "Discount Factor": round(1 / ((1 + wacc) ** total_years), 6),
            "PV of FCF ($)": round(pv_terminal, 2),
            "Cumulative PV ($)": round(cumulative_pv + pv_terminal, 2),
        })

        # Sanity check: if intrinsic is >15x price, likely a unit/currency mismatch
        currency = self.info.get('currency', 'USD')
        fin_currency = self.info.get('financialCurrency', currency)
        currency_warning = None
        current_price = wacc_inputs.iloc[0].get("Current Price ($)", 0)
        if current_price > 0 and intrinsic_per_share > 0:
            ratio = intrinsic_per_share / current_price
            if ratio > 15 or ratio < 0.05:
                currency_warning = (
                    f"Extreme valuation ratio ({ratio:.1f}x). "
                    f"Possible unit mismatch: price currency={currency}, "
                    f"financial currency={fin_currency}. Interpret with caution."
                )

        self._dcf_summary = {
            # Base FCF inputs
            "Reported FCF (3Y Median, $)": round(avg_reported_fcf, 2),
            "Avg SBC Deducted ($)": round(avg_sbc, 2),
            "Base FCF ($)": round(base_fcf, 2),
            "SBC Note": sbc_note,
            # Growth assumptions
            "FCF CAGR (Historical)": round(fcf_growth_rate, 6),
            "Assumed FCF Growth Rate": round(stage1_growth, 6),
            "Stage 2 Fade to Terminal": True,
            "Terminal Growth Rate": round(tgr, 6),
            # Discount rate
            "WACC": round(wacc, 6),
            # Output
            "Sum PV of Projected FCFs": round(cumulative_pv, 2),
            "Terminal Value ($)": round(terminal_value, 2),
            "PV of Terminal Value ($)": round(pv_terminal, 2),
            "Enterprise Value ($)": round(enterprise_value, 2),
            "Net Debt ($)": round(net_debt, 2),
            "Equity Value ($)": round(equity_value, 2),
            "Shares Outstanding": shares,
            "Intrinsic Value/Share ($)": round(intrinsic_per_share, 2),
            "Current Price ($)": current_price,
            "Currency": currency,
            "Financial Currency": fin_currency,
            "Currency Warning": currency_warning,
            "FX Rate Applied": round(self._fx_rate, 6),
            "FX Conversion": self._fx_conversion,
            "Upside/Downside %": round((intrinsic_per_share / current_price - 1) * 100, 2) if current_price > 0 else 0,
        }
        return pd.DataFrame(rows)

    def build_comps_snapshot(self, derived_df: pd.DataFrame) -> pd.DataFrame:
        info = self.info
        latest = derived_df.iloc[0] if not derived_df.empty else pd.Series(dtype=float)
        let_ev = self._safe_get(info, "enterpriseValue", 0)
        if let_ev <= 0:
            market_cap = self._safe_get(info, "marketCap", 0)
            shares_out = self._safe_get(info, "sharesOutstanding", 0)
            current_price = self._safe_get(info, "currentPrice", self._safe_get(info, "regularMarketPrice", 0))
            if market_cap == 0 and shares_out > 0 and current_price > 0:
                market_cap = shares_out * current_price
            total_debt = latest.get("Total Debt", 0) if not np.isnan(latest.get("Total Debt", 0)) else 0
            cash = latest.get("Cash And Equivalents", 0) if not np.isnan(latest.get("Cash And Equivalents", 0)) else 0
            let_ev = market_cap + total_debt - cash
            
        ev = let_ev
        return pd.DataFrame([{
            "Ticker": self.ticker,
            "Market Cap ($)": self._safe_get(info, "marketCap"),
            "EV ($)": ev,
            "EV/Revenue": round(ev / latest.get("Total Revenue", 1), 2) if latest.get("Total Revenue", 0) != 0 else np.nan,
            "EV/EBITDA": round(ev / latest.get("EBITDA", 1), 2) if latest.get("EBITDA", 0) != 0 else np.nan,
            "P/E (TTM)": self._safe_get(info, "trailingPE"),
            "P/E (Forward)": self._safe_get(info, "forwardPE"),
            "P/B": self._safe_get(info, "priceToBook"),
            "P/S": self._safe_get(info, "priceToSalesTrailing12Months"),
            "EV/FCF": round(ev / latest.get("Free Cash Flow", 1), 2) if latest.get("Free Cash Flow", 0) != 0 else np.nan,
            "Dividend Yield %": round(self._safe_get(info, "dividendYield", 0) * 100, 2),
            "Gross Margin %": latest.get("Gross Margin %", np.nan),
            "Operating Margin %": latest.get("Operating Margin %", np.nan),
            "Net Margin %": latest.get("Net Margin %", np.nan),
            "ROE %": latest.get("ROE %", np.nan),
            "Debt/Equity": latest.get("Debt/Equity", np.nan),
        }])

    # ─── Reverse DCF ─────────────────────────────────────────────────────────────
    def compute_reverse_dcf(self, base_fcf: float, wacc: float, net_debt: float,
                            shares: float, current_price: float) -> float:
        """Binary search for the FCF growth rate that makes intrinsic value = market price."""
        if current_price <= 0 or shares <= 0 or base_fcf <= 0:
            return np.nan
        target_ev = current_price * shares + net_debt
        stage1, stage2 = STAGE1_YEARS, STAGE2_YEARS
        total_years = stage1 + stage2
        tgr = min(TERMINAL_GROWTH_RATE, max(self.risk_free_rate - 0.01, 0.01))

        def calc_ev(g: float) -> float:
            pv, fcf = 0.0, base_fcf
            for yr in range(1, total_years + 1):
                if yr <= stage1:
                    gr = g
                else:
                    fade = yr - stage1
                    gr = g + (tgr - g) * (fade / stage2)
                fcf = fcf * (1 + gr)
                pv += fcf / (1 + wacc) ** yr
            tf = fcf * (1 + tgr)
            tv = tf / (wacc - tgr) if wacc > tgr else 0
            pv += tv / (1 + wacc) ** total_years
            return pv

        lo, hi = -0.20, 1.50
        for _ in range(120):
            mid = (lo + hi) / 2
            if calc_ev(mid) < target_ev:
                lo = mid
            else:
                hi = mid
            if abs(hi - lo) < 0.00005:
                break
        return round((lo + hi) / 2, 6)

    # ─── Quality & Risk Analytics ─────────────────────────────────────────────────
    def build_quality_metrics(self, clean_df: pd.DataFrame, derived_df: pd.DataFrame,
                              wacc_df: pd.DataFrame, dcf_summary: dict) -> dict:
        info = self.info
        w        = wacc_df.iloc[0] if not wacc_df.empty else pd.Series(dtype=float)
        latest   = clean_df.iloc[0] if not clean_df.empty else pd.Series(dtype=float)
        wacc_val = float(w.get("WACC", 0.10))
        rf       = float(w.get("Risk-Free Rate", 0.04))
        shares   = float(dcf_summary.get("Shares Outstanding", 1) or 1)
        total_debt = latest.get("Total Debt", 0) if not np.isnan(latest.get("Total Debt", 0)) else 0
        cash = latest.get("Cash And Equivalents", 0) if not np.isnan(latest.get("Cash And Equivalents", 0)) else 0
        net_debt = total_debt - cash
        base_fcf = float(dcf_summary.get("Base FCF ($)", 0) or 0)
        price    = float(w.get("Current Price ($)", 0) or 0)

        # ── ROIC ──────────────────────────────────────────────────────────────────
        ebit     = float(latest.get("EBIT", np.nan))
        tax_rate = float(w.get("Effective Tax Rate", 0.21))
        equity   = float(latest.get("Total Equity", np.nan))
        debt     = float(latest.get("Total Debt", np.nan))
        cash     = float(latest.get("Cash And Equivalents", np.nan))
        nopat    = ebit * (1 - tax_rate) if not np.isnan(ebit) else np.nan
        inv_cap  = (0 if np.isnan(equity) else equity) + (0 if np.isnan(debt) else debt) - (0 if np.isnan(cash) else cash)
        roic     = nopat / inv_cap if (inv_cap > 0 and not np.isnan(nopat)) else np.nan
        roic_spread = (roic - wacc_val) if not np.isnan(roic) else np.nan

        # Historical ROIC series (for chart)
        hist_roic = []
        for i in range(len(derived_df)):
            row = derived_df.iloc[i]
            hist_roic.append({
                "year": str(row.name),
                "roic_pct": row.get("ROIC %"),
                "wacc_pct": round(wacc_val * 100, 2)
            })

        # ── EPV (Earnings Power Value — Zero Growth) ───────────────────────────
        epv = nopat / wacc_val if (not np.isnan(nopat) and wacc_val > 0) else np.nan
        epv_per_share = (epv - net_debt) / shares if (not np.isnan(epv) and shares > 0) else np.nan

        # ── Graham Number ─────────────────────────────────────────────────────────
        eps   = self._safe_get(info, "trailingEps", 0)
        bvps  = self._safe_get(info, "bookValue", 0)
        graham = round(float(np.sqrt(22.5 * eps * bvps)), 2) if (eps > 0 and bvps > 0) else None

        # ── Forward Estimates ─────────────────────────────────────────────────────
        fwd_eps     = self._safe_get(info, "forwardEps", np.nan)
        trail_eps   = self._safe_get(info, "trailingEps", np.nan)
        rev_growth  = self._safe_get(info, "revenueGrowth", np.nan)   # TTM revenue growth
        earn_growth = self._safe_get(info, "earningsGrowth", np.nan)  # TTM earnings growth
        analyst_fwd_growth = ((fwd_eps / trail_eps) - 1) if (fwd_eps > 0 and trail_eps > 0 and not np.isnan(fwd_eps)) else np.nan

        # ── Reverse DCF ───────────────────────────────────────────────────────────
        # Use avg_reported_fcf as fallback when SBC-adj FCF is negative (capex-heavy firms)
        reverse_dcf_base = base_fcf if base_fcf > 0 else float(dcf_summary.get("Reported FCF (3Y Median, $)", 0) or 0)
        implied_growth = self.compute_reverse_dcf(reverse_dcf_base, wacc_val, net_debt, shares, price)
        reverse_dcf_note = "Using reported FCF (pre-SBC) as base" if base_fcf <= 0 and reverse_dcf_base > 0 else ""

        # ── Weighted Consensus Target ─────────────────────────────────────────────
        # Will be enriched in Comps; here we store DCF + EPV components
        dcf_iv = float(dcf_summary.get("Intrinsic Value/Share ($)", 0) or 0)

        # ── Risk Flags ────────────────────────────────────────────────────────────
        flags = []

        # Debt risk
        if not np.isnan(equity) and equity > 0 and not np.isnan(debt):
            de = debt / equity
            if de > 3:    flags.append({"level": "red",    "msg": f"Very High Leverage: D/E = {de:.1f}x"})
            elif de > 1.5: flags.append({"level": "yellow", "msg": f"Elevated Leverage: D/E = {de:.1f}x"})

        # FCF health
        fcf_vals = []
        for i in range(min(3, len(clean_df))):
            f = clean_df.iloc[i].get("Free Cash Flow", np.nan)
            if not np.isnan(f): fcf_vals.append(f)
        neg_count = sum(1 for f in fcf_vals if f < 0)
        if neg_count >= 2: flags.append({"level": "red",    "msg": f"Negative FCF in {neg_count}/3 recent years"})
        elif neg_count == 1: flags.append({"level": "yellow", "msg": "FCF turned negative in 1 of last 3 years"})

        # Revenue trend
        rev_vals = clean_df["Total Revenue"].dropna().values
        if len(rev_vals) >= 2 and rev_vals[0] < rev_vals[1]:  # latest < year before
            flags.append({"level": "yellow", "msg": "Revenue declined year-over-year"})

        # SBC dilution
        avg_sbc = float(dcf_summary.get("Avg SBC Deducted ($)", 0) or 0)
        rep_fcf = float(dcf_summary.get("Reported FCF (3Y Median, $)", 1) or 1)
        if rep_fcf > 0 and avg_sbc / rep_fcf > 0.15:
            flags.append({"level": "yellow", "msg": f"Heavy SBC dilution: {avg_sbc/rep_fcf*100:.1f}% of FCF"})

        # Tax rate sustainability
        if tax_rate < 0.08:
            flags.append({"level": "yellow", "msg": f"Very low effective tax rate ({tax_rate*100:.1f}%) — may not persist"})

        # ROIC vs WACC
        if not np.isnan(roic_spread):
            if roic_spread < 0:
                flags.append({"level": "red",   "msg": f"ROIC ({roic*100:.1f}%) < WACC ({wacc_val*100:.1f}%): growth destroys value"})
            elif roic_spread > 0.10:
                flags.append({"level": "green", "msg": f"Strong value creation: ROIC exceeds WACC by {roic_spread*100:.1f}pp"})

        # Implied growth vs analyst
        if not np.isnan(implied_growth) and not np.isnan(analyst_fwd_growth):
            if implied_growth > analyst_fwd_growth + 0.10:
                flags.append({"level": "red", "msg": f"Market implies {implied_growth*100:.1f}% FCF growth, analysts forecast only {analyst_fwd_growth*100:.1f}% EPS growth"})

        # Market implies negative growth with positive price?
        if not np.isnan(implied_growth) and implied_growth < -0.05:
            flags.append({"level": "red", "msg": f"Market price implies FCF will shrink {abs(implied_growth)*100:.1f}%/yr — priced for decline"})

        if not flags:
            flags.append({"level": "green", "msg": "No major risk flags — financials look healthy"})

        return replace_nan({
            "roic":             round(roic, 6)        if not np.isnan(roic)       else None,
            "roic_spread":      round(roic_spread, 6) if not np.isnan(roic_spread) else None,
            "historical_roic":  hist_roic,
            "epv_per_share":    round(epv_per_share, 2) if (epv_per_share is not None and not np.isnan(epv_per_share)) else None,
            "graham_number":    graham,
            "implied_growth":   round(implied_growth, 6) if not np.isnan(implied_growth) else None,
            "fwd_revenue_growth": rev_growth if not np.isnan(rev_growth) else None,
            "fwd_earnings_growth": earn_growth if not np.isnan(earn_growth) else None,
            "analyst_eps_growth": round(analyst_fwd_growth, 6) if not np.isnan(analyst_fwd_growth) else None,
            "dcf_intrinsic":    round(dcf_iv, 2),
            "risk_flags":       flags,
        })

    def run(self):
        self.fetch_risk_free_rate()
        self.fetch_company_info()
        self.fetch_financials()
        self.fetch_price_history()

        clean_df   = self.build_clean_financials()
        derived_df = self.compute_derived_metrics(clean_df)
        wacc_df    = self.build_wacc_inputs(clean_df)
        dcf_df     = self.build_dcf_projection(clean_df, wacc_df)
        comps_df   = self.build_comps_snapshot(derived_df)
        dcf_sum    = getattr(self, '_dcf_summary', {})
        quality    = self.build_quality_metrics(clean_df, derived_df, wacc_df, dcf_sum)

        return replace_nan({
            "ticker":          self.ticker,
            "info":            self.info,
            "raw_financials":  clean_df.reset_index().to_dict(orient="records"),
            "derived_metrics": derived_df.reset_index().to_dict(orient="records"),
            "wacc_inputs":     wacc_df.to_dict(orient="records")[0] if not wacc_df.empty else {},
            "dcf_projection":  dcf_df.to_dict(orient="records"),
            "dcf_summary":     dcf_sum,
            "comps_snapshot":  comps_df.to_dict(orient="records")[0] if not comps_df.empty else {},
            "price_history":   self.hist_prices.reset_index().assign(
                Date=lambda x: x['Date'].dt.strftime('%Y-%m-%d')
            ).to_dict(orient="records") if not self.hist_prices.empty else [],
            "quality_metrics": quality,
        })

    def run_comps_only(self):
        self.fetch_company_info()
        try:
            self.fetch_financials()
            clean_df = self.build_clean_financials()
            derived_df = self.compute_derived_metrics(clean_df)
        except Exception:
            derived_df = pd.DataFrame()
        comps_df = self.build_comps_snapshot(derived_df)
        return replace_nan(comps_df.to_dict(orient="records")[0] if not comps_df.empty else {})
