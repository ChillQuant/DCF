import jsPDF from 'jspdf';
import type { ValuationData } from '../types';
import { getCurrencySymbol } from './formatters';

// ─── Color Palette ────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
  primary:   [37, 99, 235]   as RGB,
  secondary: [100, 116, 139] as RGB,
  success:   [22, 163, 74]   as RGB,
  danger:    [220, 38, 38]   as RGB,
  dark:      [15, 23, 42]    as RGB,
  light:     [248, 250, 252] as RGB,
  white:     [255, 255, 255] as RGB,
  rowA:      [255, 255, 255] as RGB,
  rowB:      [241, 245, 249] as RGB,
};

const W = 210;   // A4 width mm
const H = 297;   // A4 height mm
const M = 14;    // margin

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: any, isMoney = false, cs = '$'): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '-';
  const n = Number(val);
  if (isMoney) {
    if (Math.abs(n) >= 1e12) return `${cs}${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9)  return `${cs}${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6)  return `${cs}${(n / 1e6).toFixed(2)}M`;
    return `${cs}${n.toFixed(2)}`;
  }
  return n.toFixed(2);
}

function fmtPct(val: any): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '-';
  return `${(Number(val) * 100).toFixed(2)}%`;
}

function setFill(pdf: jsPDF, rgb: RGB) { pdf.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setStroke(pdf: jsPDF, rgb: RGB) { pdf.setDrawColor(rgb[0], rgb[1], rgb[2]); }
function setTxt(pdf: jsPDF, rgb: RGB) { pdf.setTextColor(rgb[0], rgb[1], rgb[2]); }

// ─── Main Export Function ─────────────────────────────────────────────────────
export async function exportValuationPDF(data: ValuationData, intrinsicOverride: number | null, scenariosData?: any, peers?: any[]) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const info    = data.info          || {};
  const dcf     = data.dcf_summary   || {};
  const wacc    = data.wacc_inputs   || {};
  const comps   = data.comps_snapshot || {};
  const rawFin  = [...(data.raw_financials  || [])].reverse(); // oldest → newest
  const derFin  = [...(data.derived_metrics || [])].reverse();

  const currency = dcf.Currency || 'USD';
  const PDF_CS_SAFE: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', THB: 'THB ', KRW: 'KRW ', INR: 'INR ', CNY: 'CNY '
  };
  const cs = PDF_CS_SAFE[currency.toUpperCase()] || (currency + ' ');

  const intrinsic = intrinsicOverride ?? dcf['Intrinsic Value/Share ($)'] ?? 0;
  const price     = info.currentPrice ?? dcf['Current Price ($)'] ?? 0;
  const upside    = price > 0 ? ((Number(intrinsic) / Number(price)) - 1) * 100 : 0;
  const isUp      = Number(intrinsic) > Number(price);
  const verdictC  = isUp ? C.success : C.danger;
  const companyName = info.shortName || info.longName || data.ticker;
  const dateStr   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let y = 0;

  // ── Page overflow guard ──────────────────────────────────────────────────────
  function ensureSpace(needed: number) {
    if (y + needed > H - 14) { pdf.addPage(); y = M; }
  }

  // ── Horizontal divider ───────────────────────────────────────────────────────
  function hr() {
    setStroke(pdf, C.light);
    pdf.setLineWidth(0.3);
    pdf.line(M, y, W - M, y);
    y += 2;
  }

  // ── Section header band ──────────────────────────────────────────────────────
  function section(title: string) {
    ensureSpace(14);
    setFill(pdf, C.primary);
    pdf.roundedRect(M, y, W - M * 2, 8, 1, 1, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title.toUpperCase(), M + 3, y + 5.5);
    setTxt(pdf, C.dark);
    y += 12;
  }

  // ── Key-value row ────────────────────────────────────────────────────────────
  function kv(label: string, value: string, rowIdx: number, highlight = false) {
    ensureSpace(7);
    const bg = rowIdx % 2 === 0 ? C.rowA : C.rowB;
    setFill(pdf, bg);
    pdf.rect(M, y, W - M * 2, 6.5, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    setTxt(pdf, C.secondary);
    pdf.text(label, M + 2, y + 4.5);
    pdf.setFont('helvetica', highlight ? 'bold' : 'normal');
    setTxt(pdf, highlight ? C.primary : C.dark);
    pdf.text(value, W - M - 2, y + 4.5, { align: 'right' });
    y += 6.5;
  }

  // ─── PAGE 1: HEADER ──────────────────────────────────────────────────────────
  // Dark header band
  setFill(pdf, C.dark);
  pdf.rect(0, 0, W, 40, 'F');
  // Blue accent stripe
  setFill(pdf, C.primary);
  pdf.rect(0, 36, W, 4, 'F');

  // Company name
  setTxt(pdf, C.white);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(companyName, W / 2, 15, { align: 'center' });

  // Sub-line
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(160, 190, 230);
  const subLine = [data.ticker, info.sector, info.industry].filter(Boolean).join('  ·  ');
  pdf.text(subLine, W / 2, 23, { align: 'center' });
  pdf.text(`Equity Valuation Report  ·  ${dateStr}`, W / 2, 30, { align: 'center' });

  y = 50;

  // ─── VERDICT CARD ────────────────────────────────────────────────────────────
  setFill(pdf, C.light);
  pdf.roundedRect(M, y, W - M * 2, 38, 2, 2, 'F');
  setStroke(pdf, verdictC);
  pdf.setLineWidth(0.8);
  pdf.roundedRect(M, y, W - M * 2, 38, 2, 2, 'S');
  pdf.setLineWidth(0.2);

  // Badge
  setFill(pdf, verdictC);
  pdf.roundedRect(W / 2 - 22, y + 3, 44, 7.5, 1, 1, 'F');
  setTxt(pdf, C.white);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(isUp ? '✓  UNDERVALUED' : '✕  OVERVALUED', W / 2, y + 7.8, { align: 'center' });

  // Three columns: Intrinsic | Market Price | Upside
  const third = (W - M * 2) / 3;
  const cols = [M + third * 0.5, M + third * 1.5, M + third * 2.5];

  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  setTxt(pdf, C.secondary);
  pdf.text('INTRINSIC VALUE / SHARE', cols[0], y + 18, { align: 'center' });
  pdf.text('CURRENT MARKET PRICE',   cols[1], y + 18, { align: 'center' });
  pdf.text('UPSIDE / DOWNSIDE',       cols[2], y + 18, { align: 'center' });

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  setTxt(pdf, C.primary);
  pdf.text(`${cs}${Number(intrinsic).toFixed(2)}`, cols[0], y + 30, { align: 'center' });
  setTxt(pdf, C.dark);
  pdf.text(`${cs}${Number(price).toFixed(2)}`,    cols[1], y + 30, { align: 'center' });
  setTxt(pdf, verdictC);
  pdf.text(`${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`, cols[2], y + 30, { align: 'center' });

  y += 46;

  if (dcf['FX Conversion'] && dcf['FX Rate Applied']) {
    ensureSpace(12);
    // Draw yellow warning band
    setFill(pdf, [254, 243, 199] as RGB);
    pdf.roundedRect(M, y, W - M * 2, 8, 1, 1, 'F');
    setTxt(pdf, [180, 83, 9] as RGB);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`FX Adjustment Applied: ${dcf['FX Conversion']} at rate ${Number(dcf['FX Rate Applied']).toFixed(6)}`, W / 2, y + 5.5, { align: 'center' });
    y += 12;
  }

  // ─── COMPANY PROFILE + MULTIPLES (two-column) ─────────────────────────────
  section('Company Profile & Key Multiples');

  const halfW = (W - M * 2) / 2 - 1;
  const leftX  = M;
  const rightX = M + halfW + 2;
  let lY = y;
  let rY = y;
  let rowI = 0;

  function kvL(label: string, value: string) {
    ensureSpace(7);
    const bg = rowI % 2 === 0 ? C.rowA : C.rowB;
    setFill(pdf, bg);
    pdf.rect(leftX, lY, halfW, 6.5, 'F');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    setTxt(pdf, C.secondary); pdf.text(label, leftX + 2, lY + 4.5);
    pdf.setFont('helvetica', 'bold'); setTxt(pdf, C.dark);
    pdf.text(value, leftX + halfW - 2, lY + 4.5, { align: 'right' });
    lY += 6.5; rowI++;
  }
  function kvR(label: string, value: string) {
    ensureSpace(7);
    const bg = rowI % 2 === 0 ? C.rowA : C.rowB;
    setFill(pdf, bg);
    pdf.rect(rightX, rY, halfW, 6.5, 'F');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
    setTxt(pdf, C.secondary); pdf.text(label, rightX + 2, rY + 4.5);
    pdf.setFont('helvetica', 'bold'); setTxt(pdf, C.dark);
    pdf.text(value, rightX + halfW - 2, rY + 4.5, { align: 'right' });
    rY += 6.5; rowI++;
  }

  kvL('Sector',   info.sector   || '-');
  kvL('Industry', info.industry || '-');
  kvL('Market Cap', fmt(info.marketCap, true, cs));
  kvL('Enterprise Value', fmt(info.enterpriseValue, true, cs));
  kvL('Full-Time Employees', info.fullTimeEmployees?.toLocaleString() || '-');
  kvL('Country', info.country || '-');

  kvR('P/E (TTM)',     fmt(comps['P/E (TTM)']));
  kvR('P/E (Forward)', fmt(comps['P/E (Forward)']));
  kvR('EV/EBITDA',    fmt(comps['EV/EBITDA']));
  kvR('Price / Book', fmt(comps['P/B']));
  kvR('Price / Sales',fmt(comps['P/S']));
  kvR('EV / FCF',     fmt(comps['EV/FCF']));

  y = Math.max(lY, rY) + 6;

  // ─── DCF VALUATION SUMMARY ──────────────────────────────────────────────────
  section('DCF Valuation Summary');
  const dcfRows = [
    ['Base Free Cash Flow',        fmt(dcf['Base FCF ($)'], true, cs),                       false],
    ['FCF Growth Rate (Y1–5)',      fmtPct(dcf['Assumed FCF Growth Rate']),              false],
    ['Terminal Growth Rate',        fmtPct(dcf['Terminal Growth Rate']),                 false],
    ['WACC (Discount Rate)',        fmtPct(wacc['WACC']),                                false],
    ['Sum PV of Projected FCFs',   fmt(dcf['Sum PV of Projected FCFs'], true, cs),           false],
    ['Terminal Value (PV)',         fmt(dcf['PV of Terminal Value ($)'], true, cs),           false],
    ['Enterprise Value',            fmt(dcf['Enterprise Value ($)'], true, cs),              true],
    ['Net Debt',                    fmt(dcf['Net Debt ($)'], true, cs),                      false],
    ['Equity Value',                fmt(dcf['Equity Value ($)'], true, cs),                  true],
    ['Shares Outstanding',          Number(dcf['Shares Outstanding'] || 0).toLocaleString(), false],
    ['Intrinsic Value / Share',     `${cs}${Number(intrinsic).toFixed(2)}`,                  true],
    ['Current Market Price',        `${cs}${Number(price).toFixed(2)}`,                     false],
    ['Upside / Downside',           `${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%`,   true],
  ] as [string, string, boolean][];
  dcfRows.forEach(([l, v, h], i) => kv(l, v, i, h));

  y += 5;

  // ─── SCENARIO ANALYSIS ──────────────────────────────────────────────────────
  if (scenariosData && scenariosData.scenarios && scenariosData.results) {
    ensureSpace(40);
    section('Scenario Analysis');

    const scs = scenariosData.scenarios;
    const res = scenariosData.results;

    const sCols = ['Scenario', 'Growth Rate', 'WACC', 'Terminal', 'Weight', 'Intrinsic', 'Upside'];
    const firstCW = 30;
    const dCW = (W - M * 2 - firstCW) / (sCols.length - 1);

    // Header
    setFill(pdf, C.dark);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.text('Scenario', M + 2, y + 5);
    sCols.slice(1).forEach((c, i) => pdf.text(c, M + firstCW + dCW * (i + 1) - 2, y + 5, { align: 'right' }));
    y += 7;

    const cases = ['base', 'bull', 'bear'];
    cases.forEach((cKey, mi) => {
      const sc = scs[cKey];
      const iv = res[cKey]?.intrinsicValue || 0;
      const scUpside = price > 0 ? ((iv / price) - 1) * 100 : 0;

      ensureSpace(7);
      setFill(pdf, mi % 2 === 0 ? C.rowA : C.rowB);
      pdf.rect(M, y, W - M * 2, 6.5, 'F');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      setTxt(pdf, cKey === 'bull' ? C.success : cKey === 'bear' ? C.danger : C.dark);
      pdf.text(cKey.toUpperCase(), M + 2, y + 4.5);

      pdf.setFont('helvetica', 'normal');
      setTxt(pdf, C.dark);
      
      pdf.text(fmtPct(sc.growth), M + firstCW + dCW * 1 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmtPct(sc.wacc), M + firstCW + dCW * 2 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmtPct(sc.term), M + firstCW + dCW * 3 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmtPct(sc.weight), M + firstCW + dCW * 4 - 2, y + 4.5, { align: 'right' });
      pdf.text(`${cs}${Number(iv).toFixed(2)}`, M + firstCW + dCW * 5 - 2, y + 4.5, { align: 'right' });
      
      setTxt(pdf, scUpside >= 0 ? C.success : C.danger);
      pdf.text(`${scUpside >= 0 ? '+' : ''}${scUpside.toFixed(1)}%`, M + firstCW + dCW * 6 - 2, y + 4.5, { align: 'right' });

      y += 6.5;
    });

    // Expected Value Row
    let totalW = cases.reduce((sum, k) => sum + (scs[k]?.weight || 0), 0);
    let expVal = 0;
    if (totalW > 0) {
      expVal = cases.reduce((sum, k) => sum + ((res[k]?.intrinsicValue || 0) * (scs[k]?.weight || 0)), 0) / totalW;
    }
    const expUpside = price > 0 ? ((expVal / price) - 1) * 100 : 0;

    ensureSpace(7);
    setFill(pdf, [240, 244, 255] as RGB);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.text('EXPECTED VALUE', M + 2, y + 5);
    
    pdf.text(`${cs}${Number(expVal).toFixed(2)}`, M + firstCW + dCW * 5 - 2, y + 5, { align: 'right' });
    setTxt(pdf, expUpside >= 0 ? C.success : C.danger);
    pdf.text(`${expUpside >= 0 ? '+' : ''}${expUpside.toFixed(1)}%`, M + firstCW + dCW * 6 - 2, y + 5, { align: 'right' });
    
    y += 12;
  }


  if (data.dcf_projection && data.dcf_projection.length > 0) {
    ensureSpace(40);
    section('10-Year DCF Projections');
    
    const proj = data.dcf_projection;
    const cols = ['Year', 'Growth', 'Proj FCF', 'Discount', 'PV of FCF'];
    
    const mCW = 25;
    const dCW = (W - M * 2 - mCW) / (cols.length - 1);

    // Header
    setFill(pdf, C.dark);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.text('Year', M + 2, y + 5);
    cols.slice(1).forEach((c, i) => pdf.text(c, M + mCW + dCW * (i + 1) - 2, y + 5, { align: 'right' }));
    y += 7;

    proj.forEach((row: any, mi: number) => {
      ensureSpace(7);
      setFill(pdf, mi % 2 === 0 ? C.rowA : C.rowB);
      pdf.rect(M, y, W - M * 2, 6.5, 'F');
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
      setTxt(pdf, C.secondary);
      pdf.text(String(row['Year'] || '-'), M + 2, y + 4.5);
      
      // Growth Rate
      const gr = row['Growth Rate'];
      const grStr = (gr === null || gr === undefined) ? '-' : `${(gr * 100).toFixed(1)}%`;
      setTxt(pdf, C.dark);
      pdf.text(grStr, M + mCW + dCW * 1 - 2, y + 4.5, { align: 'right' });
      
      // Projected FCF
      const pFcf = row['Projected FCF ($)'];
      pdf.text(fmt(pFcf, true, cs), M + mCW + dCW * 2 - 2, y + 4.5, { align: 'right' });
      
      // Discount Factor
      const df = row['Discount Factor'];
      const dfStr = (df === null || df === undefined) ? '-' : Number(df).toFixed(4);
      pdf.text(dfStr, M + mCW + dCW * 3 - 2, y + 4.5, { align: 'right' });
      
      // PV of FCF
      const pvFcf = row['PV of FCF ($)'];
      pdf.text(fmt(pvFcf, true, cs), M + mCW + dCW * 4 - 2, y + 4.5, { align: 'right' });

      y += 6.5;
    });

    y += 5;
  }

  // ─── WACC BREAKDOWN ─────────────────────────────────────────────────────────
  section('WACC Breakdown');
  const waccRows: [string, string][] = [
    ['Risk-Free Rate (10Y Treasury)', fmtPct(wacc['Risk-Free Rate'])],
    ['Beta (5Y Monthly)',            fmt(wacc['Beta'])],
    ['Equity Risk Premium',          fmtPct(wacc['Equity Risk Premium'])],
    ['Cost of Equity (CAPM)',        fmtPct(wacc['Cost of Equity (CAPM)'])],
    ['Cost of Debt (After-Tax)',     fmtPct(wacc['Cost of Debt (After-Tax)'])],
    ['Weight of Equity',             fmtPct(wacc['Weight Equity'])],
    ['Weight of Debt',               fmtPct(wacc['Weight Debt'])],
    ['WACC',                         fmtPct(wacc['WACC'])],
  ];
  waccRows.forEach(([l, v], i) => kv(l, v, i, l === 'WACC'));

  y += 5;

  // ─── PEER COMPARABLES ───────────────────────────────────────────────────────
  if (peers && peers.length > 0) {
    ensureSpace(40);
    section('Comparable Peers');

    const pCols = ['Ticker', 'P/E (TTM)', 'EV/EBITDA', 'P/B', 'P/S', 'EV/FCF'];
    const firstCW = 25;
    const dCW = (W - M * 2 - firstCW) / (pCols.length - 1);

    // Header
    setFill(pdf, C.dark);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.text('Ticker', M + 2, y + 5);
    pCols.slice(1).forEach((c, i) => pdf.text(c, M + firstCW + dCW * (i + 1) - 2, y + 5, { align: 'right' }));
    y += 7;

    peers.forEach((peer: any, mi: number) => {
      ensureSpace(7);
      setFill(pdf, mi % 2 === 0 ? C.rowA : C.rowB);
      pdf.rect(M, y, W - M * 2, 6.5, 'F');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      setTxt(pdf, C.dark);
      pdf.text(String(peer.Ticker || '-'), M + 2, y + 4.5);

      pdf.setFont('helvetica', 'normal');
      
      pdf.text(fmt(peer['P/E (TTM)']), M + firstCW + dCW * 1 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmt(peer['EV/EBITDA']), M + firstCW + dCW * 2 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmt(peer['P/B']), M + firstCW + dCW * 3 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmt(peer['P/S']), M + firstCW + dCW * 4 - 2, y + 4.5, { align: 'right' });
      pdf.text(fmt(peer['EV/FCF']), M + firstCW + dCW * 5 - 2, y + 4.5, { align: 'right' });

      y += 6.5;
    });

    y += 5;
  }

  const qm = data.quality_metrics || {};
  if (Object.keys(qm).length > 0) {
    ensureSpace(40);
    section('Quality & Risk Assessment');
    
    const qmRows: [string, string][] = [
      ['ROIC (Return on Invested Capital)', fmtPct(qm['roic'])],
      ['EPV (Earnings Power Value / Share)', fmt(qm['epv_per_share'], true, cs)],
      ['Graham Number',                    fmt(qm['graham_number'], true, cs)],
      ['Market Implied Growth Rate',        fmtPct(qm['implied_growth'])],
    ];
    qmRows.forEach(([l, v], i) => kv(l, v, i));
    
    y += 5;
    
    // Risk Flags list
    const flags = qm['risk_flags'] || [];
    if (flags.length > 0) {
      ensureSpace(15);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      setTxt(pdf, C.primary);
      pdf.text('VALUATION RISK FLAGS', M + 2, y + 4);
      y += 6;
      
      flags.forEach((f: any) => {
        ensureSpace(8);
        const flagColors: Record<string, RGB> = { red: C.danger, yellow: [217, 119, 6] as RGB, green: C.success };
        const color = flagColors[f.level] || C.secondary;
        
        // draw circle badge
        setFill(pdf, color);
        pdf.circle(M + 4, y + 2.5, 1.5, 'F');
        
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        setTxt(pdf, C.dark);
        pdf.text(String(f.msg || '-'), M + 10, y + 3.5);
        y += 5.5;
      });
      
      y += 5;
    }
  }

  // ─── HISTORICAL FINANCIALS TABLE ────────────────────────────────────────────
  if (rawFin.length > 0) {
    ensureSpace(50);
    section('Historical Financials');

    const years = rawFin.map(r => `FY ${r['Fiscal Year']}`);
    const mCW = 55;
    const dCW = (W - M * 2 - mCW) / years.length;

    const finRows: [string, boolean][] = [
      ['Total Revenue', true], ['Gross Profit', true], ['Operating Income', true],
      ['Net Income', true], ['EBITDA', true], ['Free Cash Flow', true],
      ['Capital Expenditure', true], ['Total Debt', true],
      ['Cash And Equivalents', true], ['Net Debt', true], ['Total Equity', true],
    ];

    // Header
    setFill(pdf, C.dark);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.text('Metric', M + 2, y + 5);
    years.forEach((yr, i) => pdf.text(yr, M + mCW + dCW * (i + 1) - 2, y + 5, { align: 'right' }));
    y += 7;

    finRows.forEach(([metric, isMoney], mi) => {
      ensureSpace(7);
      setFill(pdf, mi % 2 === 0 ? C.rowA : C.rowB);
      pdf.rect(M, y, W - M * 2, 6.5, 'F');
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
      setTxt(pdf, C.secondary);
      pdf.text(metric, M + 2, y + 4.5);
      rawFin.forEach((row, i) => {
        setTxt(pdf, C.dark);
        pdf.text(fmt(row[metric], isMoney, cs), M + mCW + dCW * (i + 1) - 2, y + 4.5, { align: 'right' });
      });
      y += 6.5;
    });

    y += 5;
  }

  // ─── PERFORMANCE RATIOS TABLE ────────────────────────────────────────────────
  if (derFin.length > 0) {
    ensureSpace(50);
    section('Key Performance Ratios (Historical)');

    const years = derFin.map(r => `FY ${r['Fiscal Year']}`);
    const mCW = 55;
    const dCW = (W - M * 2 - mCW) / years.length;

    const ratioRows: string[] = [
      'Gross Margin %', 'Operating Margin %', 'Net Margin %', 'FCF Margin %',
      'ROE %', 'ROA %', 'Debt/Equity', 'Current Ratio', 'Revenue Growth YoY %',
    ];

    // Header
    setFill(pdf, C.dark);
    pdf.rect(M, y, W - M * 2, 7, 'F');
    setTxt(pdf, C.white);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.text('Ratio', M + 2, y + 5);
    years.forEach((yr, i) => pdf.text(yr, M + mCW + dCW * (i + 1) - 2, y + 5, { align: 'right' }));
    y += 7;

    ratioRows.forEach((metric, mi) => {
      ensureSpace(7);
      setFill(pdf, mi % 2 === 0 ? C.rowA : C.rowB);
      pdf.rect(M, y, W - M * 2, 6.5, 'F');
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
      setTxt(pdf, C.secondary);
      pdf.text(metric, M + 2, y + 4.5);
      derFin.forEach((row, i) => {
        const val = row[metric];
        const isPct = metric.includes('%') || metric.includes('Growth');
        const display = (val === null || val === undefined || isNaN(Number(val))) ? '-' : `${Number(val).toFixed(2)}${isPct ? '%' : ''}`;
        setTxt(pdf, C.dark);
        pdf.text(display, M + mCW + dCW * (i + 1) - 2, y + 4.5, { align: 'right' });
      });
      y += 6.5;
    });
  }

  // ─── DISCLAIMER note ─────────────────────────────────────────────────────────
  ensureSpace(20);
  y += 6;
  setFill(pdf, [255, 251, 235] as RGB);
  pdf.roundedRect(M, y, W - M * 2, 14, 1, 1, 'F');
  setTxt(pdf, [120, 90, 0] as RGB);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DISCLAIMER', M + 3, y + 5);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    'This report is generated by Valuator AI for informational and educational purposes only. It does not constitute financial advice.',
    M + 3, y + 9.5
  );
  pdf.text('Always conduct your own research and consult a licensed financial advisor before making investment decisions.', M + 3, y + 13);

  // ─── FOOTER on every page ────────────────────────────────────────────────────
  const pageCount = (pdf as any).internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    setFill(pdf, C.dark);
    pdf.rect(0, H - 10, W, 10, 'F');
    pdf.setTextColor(140, 165, 210);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Valuator AI  ·  ${companyName} (${data.ticker})  ·  Generated ${new Date().toLocaleString()}`,
      M, H - 4
    );
    pdf.text(`Page ${i} / ${pageCount}`, W - M, H - 4, { align: 'right' });
  }

  pdf.save(`${data.ticker}_Valuation_Report.pdf`);
}
