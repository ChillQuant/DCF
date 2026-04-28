import io
import xlsxwriter

def create_dcf_excel(valuation_data: dict) -> bytes:
    """
    Creates an Excel file containing a live DCF model using xlsxwriter.
    Returns the file content as bytes.
    """
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    worksheet = workbook.add_worksheet("DCF Model")

    dcf = valuation_data.get("dcf_summary", {})
    ticker = valuation_data.get("info", {}).get("symbol", "COMPANY")
    currency = dcf.get("Currency", "USD")

    currency_format_map = {
        'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 
        'THB': '฿', 'KRW': '₩', 'INR': '₹', 'CNY': '¥'
    }
    cs = currency_format_map.get(currency.upper(), '$')

    # Formats
    header_format = workbook.add_format({'bold': True, 'bg_color': '#1f497d', 'font_color': 'white', 'border': 1})
    label_format = workbook.add_format({'bold': True, 'align': 'left'})
    money_format = workbook.add_format({'num_format': f'{cs}#,##0.00'})
    large_money_format = workbook.add_format({'num_format': f'{cs}#,##0'})
    pct_format = workbook.add_format({'num_format': '0.00%'})
    input_format = workbook.add_format({'bg_color': '#ffffcc', 'border': 1})
    input_pct_format = workbook.add_format({'bg_color': '#ffffcc', 'border': 1, 'num_format': '0.00%'})
    input_money_format = workbook.add_format({'bg_color': '#ffffcc', 'border': 1, 'num_format': f'{cs}#,##0.00'})
    input_large_money_format = workbook.add_format({'bg_color': '#ffffcc', 'border': 1, 'num_format': f'{cs}#,##0'})
    
    worksheet.set_column('A:A', 30)
    worksheet.set_column('B:L', 15)
    
    # Title
    title_format = workbook.add_format({'bold': True, 'font_size': 16})
    worksheet.write('A1', f"{ticker} DCF Valuation Model", title_format)

    # Assumptions Section
    worksheet.write('A3', "Key Assumptions", header_format)
    worksheet.write('B3', "Value", header_format)

    assumptions = [
        ("Current Price", dcf.get("Current Price ($)", 0), input_money_format),
        ("Shares Outstanding", dcf.get("Shares Outstanding", 1), input_large_money_format),
        ("Base FCF", dcf.get("Base FCF ($)", 0), input_large_money_format),
        ("Net Debt", dcf.get("Net Debt ($)", 0), input_large_money_format),
        ("Stage 1 Growth Rate (Y1-5)", dcf.get("Assumed FCF Growth Rate", 0.05), input_pct_format),
        ("WACC (Discount Rate)", dcf.get("WACC", 0.10), input_pct_format),
        ("Terminal Growth Rate", dcf.get("Terminal Growth Rate", 0.025), input_pct_format)
    ]

    for i, (label, value, fmt) in enumerate(assumptions):
        worksheet.write(f'A{4+i}', label, label_format)
        worksheet.write(f'B{4+i}', value, fmt)

    # Constants mapping for formulas
    CELL_BASE_FCF = "B6"
    CELL_NET_DEBT = "B7"
    CELL_GROWTH = "B8"
    CELL_WACC = "B9"
    CELL_TGR = "B10"
    CELL_SHARES = "B5"

    # Projections Section
    worksheet.write('A12', "DCF Projections", header_format)
    
    # Headers for Year 1 to 10 + Terminal
    headers = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Terminal"]
    for i, h in enumerate(headers):
        worksheet.write(11, i+1, h, header_format)

    # Projected FCF Row (Row 13)
    worksheet.write('A13', "Projected FCF", label_format)
    
    # Year 1 (Column B / Index 1) = Base FCF * (1 + Growth)
    worksheet.write_formula('B13', f"={CELL_BASE_FCF}*(1+{CELL_GROWTH})", large_money_format)
    
    # Year 2 to 5 (Columns C to F / Index 2 to 5) = Prev Year * (1 + Growth)
    for col in range(2, 6):
        col_letter = xlsxwriter.utility.xl_col_to_name(col)
        prev_col_letter = xlsxwriter.utility.xl_col_to_name(col-1)
        worksheet.write_formula(f'{col_letter}13', f"={prev_col_letter}13*(1+${CELL_GROWTH})", large_money_format)
        
    # Year 6 to 10 (Columns G to K / Index 6 to 10) Fade logic
    # In Excel: Growth drops linearly from Stage1 to TGR over 5 years.
    # Year 6 growth = Growth + (TGR - Growth) * (1/5)
    for i, col in enumerate(range(6, 11), start=1):
        col_letter = xlsxwriter.utility.xl_col_to_name(col)
        prev_col_letter = xlsxwriter.utility.xl_col_to_name(col-1)
        # formula: =Prev * (1 + Growth + (TGR - Growth) * i / 5)
        fade_formula = f"={prev_col_letter}13*(1+${CELL_GROWTH}+(${CELL_TGR}-${CELL_GROWTH})*{i}/5)"
        worksheet.write_formula(f'{col_letter}13', fade_formula, large_money_format)
        
    # Terminal FCF (Column L / Index 11)
    worksheet.write_formula('L13', f"=K13*(1+{CELL_TGR})", large_money_format)
    
    # Discount Factor Row (Row 14)
    worksheet.write('A14', "Discount Factor", label_format)
    for col in range(1, 11):
        col_letter = xlsxwriter.utility.xl_col_to_name(col)
        worksheet.write_formula(f'{col_letter}14', f"=1/((1+${CELL_WACC})^{col})", workbook.add_format({'num_format': '0.0000'}))
    
    # Terminal Discount Factor
    worksheet.write_formula('L14', f"=1/((1+${CELL_WACC})^10)", workbook.add_format({'num_format': '0.0000'}))
    
    # PV of FCF Row (Row 15)
    worksheet.write('A15', "PV of FCF", label_format)
    for col in range(1, 11):
        col_letter = xlsxwriter.utility.xl_col_to_name(col)
        worksheet.write_formula(f'{col_letter}15', f"={col_letter}13*{col_letter}14", large_money_format)
        
    # Terminal Value (Row 15, Col L) = Terminal FCF / (WACC - TGR) * Discount Factor
    worksheet.write_formula('L15', f"=(L13/(${CELL_WACC}-${CELL_TGR}))*L14", large_money_format)
    
    # Cumulative PV
    worksheet.write('A16', "Cumulative PV", label_format)
    worksheet.write_formula('B16', "=B15", large_money_format)
    for col in range(2, 11):
        col_letter = xlsxwriter.utility.xl_col_to_name(col)
        prev_col_letter = xlsxwriter.utility.xl_col_to_name(col-1)
        worksheet.write_formula(f'{col_letter}16', f"={prev_col_letter}16+{col_letter}15", large_money_format)
        
    worksheet.write_formula('L16', f"=K16+L15", large_money_format)

    # Valuation Output Section
    worksheet.write('A18', "Valuation Output", header_format)
    worksheet.write('B18', "", header_format)
    
    worksheet.write('A19', "Sum of PV of FCF (Years 1-10)", label_format)
    worksheet.write_formula('B19', "=K16", large_money_format)
    
    worksheet.write('A20', "PV of Terminal Value", label_format)
    worksheet.write_formula('B20', "=L15", large_money_format)
    
    worksheet.write('A21', "Enterprise Value", label_format)
    worksheet.write_formula('B21', "=B19+B20", large_money_format)
    
    worksheet.write('A22', "Less: Net Debt", label_format)
    worksheet.write_formula('B22', f"={CELL_NET_DEBT}", large_money_format)
    
    worksheet.write('A23', "Equity Value", label_format)
    worksheet.write_formula('B23', "=B21-B22", large_money_format)
    
    worksheet.write('A25', "Intrinsic Value per Share", workbook.add_format({'bold': True, 'font_size': 14}))
    worksheet.write_formula('B25', f"=B23/{CELL_SHARES}", workbook.add_format({'bold': True, 'font_size': 14, 'num_format': f'{cs}#,##0.00', 'bg_color': '#e2efda', 'border': 1}))
    
    worksheet.write('A26', "Current Price", label_format)
    worksheet.write_formula('B26', "=B4", money_format)
    
    worksheet.write('A27', "Upside / (Downside)", label_format)
    worksheet.write_formula('B27', "=(B25/B26)-1", pct_format)

    # Tab 2: Financials
    raw_fin = valuation_data.get("raw_financials", [])
    if raw_fin:
        ws_fin = workbook.add_worksheet("Financials")
        ws_fin.set_column('A:A', 25)
        ws_fin.set_column('B:Z', 15)
        
        # Header: Metrics + Years
        metrics = [k for k in raw_fin[0].keys() if k != 'Fiscal Year']
        years = [str(r.get('Fiscal Year')) for r in raw_fin]
        
        ws_fin.write(0, 0, "Metric", header_format)
        for i, yr in enumerate(years):
            ws_fin.write(0, i+1, f"FY {yr}", header_format)
            
        # Data Rows
        for row_idx, metric in enumerate(metrics, start=1):
            ws_fin.write(row_idx, 0, metric, label_format)
            for col_idx, r in enumerate(raw_fin, start=1):
                val = r.get(metric)
                if isinstance(val, (int, float)):
                    ws_fin.write(row_idx, col_idx, val, large_money_format)
                else:
                    ws_fin.write(row_idx, col_idx, val if val is not None else '-')

    # Tab 3: Comparables
    comps = valuation_data.get("comps_snapshot", {})
    if comps:
        ws_comp = workbook.add_worksheet("Comparables")
        ws_comp.set_column('A:A', 25)
        ws_comp.set_column('B:B', 20)
        
        ws_comp.write(0, 0, "Peer Multiple", header_format)
        ws_comp.write(0, 1, "Value", header_format)
        
        for row_idx, (k, v) in enumerate(comps.items(), start=1):
            if k == 'Ticker': continue
            ws_comp.write(row_idx, 0, k, label_format)
            if isinstance(v, (int, float)):
                ws_comp.write(row_idx, 1, v, money_format if "P/" in k or "EV/" in k else large_money_format)
            else:
                ws_comp.write(row_idx, 1, v if v is not None else '-')

    # Tab 4: Scenarios
    scs = valuation_data.get("scenarios")
    res = valuation_data.get("scenario_results")
    if scs and res:
        ws_scen = workbook.add_worksheet("Scenarios")
        ws_scen.set_column('A:A', 15)
        ws_scen.set_column('B:F', 18)
        
        ws_scen.write(0, 0, "Scenario", header_format)
        ws_scen.write(0, 1, "FCF Growth", header_format)
        ws_scen.write(0, 2, "WACC", header_format)
        ws_scen.write(0, 3, "Terminal Growth", header_format)
        ws_scen.write(0, 4, "Weight", header_format)
        ws_scen.write(0, 5, "Intrinsic Value", header_format)
        
        cases = ['base', 'bull', 'bear']
        for row_idx, k in enumerate(cases, start=1):
            c_data = scs.get(k, {})
            c_res  = res.get(k, {})
            
            ws_scen.write(row_idx, 0, k.upper(), label_format)
            ws_scen.write(row_idx, 1, c_data.get("growth", 0), pct_format)
            ws_scen.write(row_idx, 2, c_data.get("wacc", 0), pct_format)
            ws_scen.write(row_idx, 3, c_data.get("term", 0), pct_format)
            ws_scen.write(row_idx, 4, c_data.get("weight", 0), pct_format)
            ws_scen.write(row_idx, 5, c_res.get("intrinsicValue", 0), money_format)
            
        # Expected Value
        ws_scen.write(5, 0, "Expected Value", label_format)
        ws_scen.write_formula(5, 5, "=SUMPRODUCT(E2:E4, F2:F4)", workbook.add_format({'bold': True, 'num_format': f'{cs}#,##0.00', 'bg_color': '#e2efda', 'border': 1}))

    # Tab 5: Performance Ratios (Derived Metrics)
    der_fin = valuation_data.get("derived_metrics", [])
    if der_fin:
        ws_rat = workbook.add_worksheet("Ratios")
        ws_rat.set_column('A:A', 25)
        ws_rat.set_column('B:Z', 15)
        
        # Header: Metrics + Years
        metrics = [k for k in der_fin[0].keys() if k != 'Fiscal Year']
        years = [str(r.get('Fiscal Year')) for r in der_fin]
        
        ws_rat.write(0, 0, "Ratio", header_format)
        for i, yr in enumerate(years):
            ws_rat.write(0, i+1, f"FY {yr}", header_format)
            
        number_format = workbook.add_format({'num_format': '0.00'})
            
        # Data Rows
        for row_idx, metric in enumerate(metrics, start=1):
            ws_rat.write(row_idx, 0, metric, label_format)
            for col_idx, r in enumerate(der_fin, start=1):
                val = r.get(metric)
                is_pct = '%' in metric or 'Growth' in metric
                if isinstance(val, (int, float)):
                    ws_rat.write(row_idx, col_idx, val, pct_format if is_pct else number_format)
                else:
                    ws_rat.write(row_idx, col_idx, val if val is not None else '-')

    workbook.close()
    return output.getvalue()
