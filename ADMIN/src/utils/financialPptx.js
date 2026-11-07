// Financial Summary > Download PPT: a 6-slide management deck of the payroll
// on screen, laid out like the HR audit deck (navy band, KPI cards, a chart
// with a side panel, yellow note boxes, numbered action cards). Charts are
// native PowerPoint charts, so they stay editable. pptxgenjs is loaded only
// when the button is pressed.
//
// summary: the Financial Summary's summary (blocks[0] the Total, then one
// block per posted month, each with .month "YYYY-MM").

const NAVY = "1F3864";
const INK = "171A18";
const MUTED = "6B7280";
const PAGE = "F5F6F8";
const CARD = "FFFFFF";
const LINE = "E5E7EB";
const NOTE_FILL = "FFF8E5";
const NOTE_LINE = "F3DFA6";
const GOOD = "2E8B57";
const BAD = "C00000";
const BLUE = "2E75B6";
// Same series colours as the app's charts (components/FinancialCharts.jsx).
const PALETTE = ["00918A", "B27C14", "8B4AA0", "CC5A36", "3A78C0", "4D9846"];
const FONT = "Calibri";
const FOOTER = "HRDK Payroll Financial Report";

const LAKH = 100000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPONENTS = [
  ["Basic Pay", "Basic Pay"],
  ["House Rent Allowance (HRA)", "HRA"],
  ["Special Allowance", "Special Allowance"],
  ["Bonus", "Bonus"],
  ["Incentives & Overtime", "Incentives & OT"],
  ["Other (Transport, Stipend, …)", "Other"]
];
const DEDUCTIONS = ["ESIC", "PF", "PTAX", "TDS on Salary", "Advance Recover"];

const lakh = (amount) => Math.round((amount / LAKH) * 100) / 100;
const lakhText = (amount) =>
  `₹${(amount / LAKH).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
const rupees = (amount) => `₹${Math.round(amount).toLocaleString("en-IN")}`;
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "–");
const monthName = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// A block's line by label, zeros when absent.
function lineOf(block, label) {
  for (const section of block.sections) {
    const found = section.find((l) => l.label === label);
    if (found) return found;
  }
  return { wages: { amount: 0, count: 0 }, salary: { amount: 0, count: 0 }, total: 0 };
}

function monthFigures(block) {
  const gross = lineOf(block, "Gross Salary");
  const row = {
    month: monthName(block.month),
    gross: gross.total,
    deductions: lineOf(block, "Total Deductions").total,
    net: lineOf(block, "Net Pay").total,
    wagesGross: gross.wages.amount,
    salaryGross: gross.salary.amount,
    wagesCount: gross.wages.count ?? 0,
    salaryCount: gross.salary.count ?? 0
  };
  row.headCount = row.wagesCount + row.salaryCount;
  for (const [label, key] of COMPONENTS) row[key] = lineOf(block, label).total;
  for (const label of DEDUCTIONS) row[label] = lineOf(block, label).total;
  return row;
}

// ---- slide pieces ----

function footer(slide, page, left = 0.45) {
  slide.addShape("line", { x: left, y: 6.95, w: 12.88 - left, h: 0, line: { color: LINE, width: 0.75 } });
  slide.addText(FOOTER, { x: left, y: 7.0, w: 6, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTED });
  slide.addText(String(page), { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTED, align: "right" });
}

function contentSlide(pptx, title, subtitle, page) {
  const slide = pptx.addSlide();
  slide.background = { color: PAGE };
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.14, fill: { color: NAVY }, line: { color: NAVY } });
  slide.addText(title, { x: 0.45, y: 0.32, w: 12.4, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: NAVY });
  slide.addText(subtitle, { x: 0.45, y: 0.9, w: 12.4, h: 0.3, fontFace: FONT, fontSize: 10.5, color: MUTED });
  footer(slide, page);
  return slide;
}

function card(slide, x, y, w, h) {
  slide.addShape("rect", { x, y, w, h, fill: { color: CARD }, line: { color: LINE, width: 0.75 } });
}

function kpi(slide, x, y, w, value, label, colour) {
  card(slide, x, y, w, 1.0);
  slide.addText(value, { x, y: y + 0.1, w, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: colour, align: "center" });
  slide.addText(label, { x, y: y + 0.6, w, h: 0.3, fontFace: FONT, fontSize: 9.5, color: MUTED, align: "center" });
}

function note(slide, x, y, w, h, text) {
  slide.addShape("rect", { x, y, w, h, fill: { color: NOTE_FILL }, line: { color: NOTE_LINE, width: 0.75 } });
  slide.addText(text, { x: x + 0.15, y, w: w - 0.3, h, fontFace: FONT, fontSize: 10.5, color: INK, valign: "middle" });
}

function rankedItem(slide, x, y, w, rank, title, detail) {
  card(slide, x, y, w, 0.62);
  slide.addShape("rect", { x: x + 0.15, y: y + 0.16, w: 0.3, h: 0.3, fill: { color: BAD }, line: { color: BAD } });
  slide.addText(String(rank), { x: x + 0.15, y: y + 0.16, w: 0.3, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
  slide.addText(title, { x: x + 0.55, y: y + 0.06, w: w - 0.7, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: INK });
  slide.addText(detail, { x: x + 0.55, y: y + 0.33, w: w - 0.7, h: 0.25, fontFace: FONT, fontSize: 9, color: MUTED });
}

const baseChart = {
  catAxisLabelFontFace: FONT,
  valAxisLabelFontFace: FONT,
  catAxisLabelFontSize: 10,
  valAxisLabelFontSize: 9,
  catAxisLabelColor: INK,
  valAxisLabelColor: MUTED,
  valGridLine: { color: "D9D9D9", size: 0.5 },
  catGridLine: { style: "none" },
  legendFontFace: FONT,
  legendFontSize: 10,
  dataLabelFontFace: FONT,
  dataLabelFontSize: 9,
  dataLabelColor: INK
};

// ---- the deck ----

export async function downloadFinancialPptx(summary, periodTitle) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = periodTitle;

  const total = summary.blocks[0];
  const months = summary.blocks.slice(1).map(monthFigures);
  const totals = monthFigures({ ...total, month: "0000-01" });
  const labels = months.map((m) => m.month);
  const first = months[0];
  const last = months.at(-1);
  const gross = totals.gross;
  const deductions = totals.deductions;
  const net = totals.net;
  const period = periodTitle.replace(" - Financial Breakdown", "");

  // 1. Title + KPIs + gross split
  {
    const slide = pptx.addSlide();
    slide.background = { color: PAGE };
    slide.addShape("rect", { x: 0, y: 0, w: 4.6, h: 7.5, fill: { color: NAVY }, line: { color: NAVY } });
    slide.addText("Payroll Financial\nReport", { x: 0.55, y: 1.6, w: 3.8, h: 1.6, fontFace: FONT, fontSize: 30, bold: true, color: "FFFFFF" });
    slide.addText(`Based on Pay Sheet (BC365) via HRMS Financial Summary\n${period} • ${months.length} posted month${months.length === 1 ? "" : "s"}`, {
      x: 0.55, y: 3.35, w: 3.8, h: 0.9, fontFace: FONT, fontSize: 11, color: "D6DCE8"
    });
    slide.addText("Management view: gross salary, deductions, net pay and staff mix", {
      x: 5.1, y: 0.8, w: 7.7, h: 0.7, fontFace: FONT, fontSize: 17, bold: true, color: NAVY
    });
    kpi(slide, 5.1, 1.7, 1.8, lakhText(gross), "Gross salary", NAVY);
    kpi(slide, 7.05, 1.7, 1.8, lakhText(net), "Net pay", GOOD);
    kpi(slide, 9.0, 1.7, 1.8, pct(deductions, gross), "Deduction rate", BAD);
    kpi(slide, 10.95, 1.7, 1.8, String(last.headCount), `Head count · ${last.month}`, BLUE);

    const slices = COMPONENTS.map(([, key], i) => ({ key, value: totals[key], colour: PALETTE[i] })).filter((s) => s.value > 0);
    slide.addChart(pptx.ChartType.doughnut, [{ name: "Gross", labels: slices.map((s) => s.key), values: slices.map((s) => lakh(s.value)) }], {
      x: 5.0, y: 3.0, w: 3.6, h: 3.6, holeSize: 55, chartColors: slices.map((s) => s.colour),
      showLegend: false, showPercent: false, showValue: false, dataLabelColor: "FFFFFF"
    });
    slide.addText("Gross salary split", { x: 8.9, y: 3.2, w: 3.9, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    slices.forEach((s, i) => {
      const y = 3.75 + i * 0.33;
      slide.addShape("rect", { x: 8.9, y: y + 0.07, w: 0.16, h: 0.16, fill: { color: s.colour }, line: { color: s.colour } });
      slide.addText(`${s.key}: ${lakhText(s.value)} (${pct(s.value, gross)})`, { x: 9.15, y, w: 3.8, h: 0.3, fontFace: FONT, fontSize: 11.5, color: INK });
    });
    slide.addText("Amounts in ₹ lakh (1 L = ₹1,00,000). Advance Recover is the full G/L 1602 credit.", {
      x: 8.9, y: 5.8, w: 4.0, h: 0.5, fontFace: FONT, fontSize: 9.5, color: MUTED
    });
    footer(slide, 1, 5.0);
  }

  // 2. Gross by month
  {
    const slide = contentSlide(pptx, "Gross salary by month", "Total earnings posted in BC365 each month, ₹ lakh.", 2);
    slide.addChart(pptx.ChartType.bar, [{ name: "Gross salary", labels, values: months.map((m) => lakh(m.gross)) }], {
      ...baseChart, x: 0.45, y: 1.35, w: 8.3, h: 5.4, barDir: "col", chartColors: [BLUE], valAxisMinVal: 0,
      showValue: true, dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd", showLegend: false, barGapWidthPct: 60
    });
    const best = months.reduce((a, b) => (b.gross > a.gross ? b : a));
    const low = months.reduce((a, b) => (b.gross < a.gross ? b : a));
    kpi(slide, 9.1, 1.5, 1.85, lakhText(best.gross), `Highest: ${best.month}`, GOOD);
    kpi(slide, 11.1, 1.5, 1.85, lakhText(low.gross), `Lowest: ${low.month}`, BAD);
    const growth = first.gross ? last.gross / first.gross - 1 : 0;
    note(slide, 9.1, 2.8, 3.85, 1.1,
      `Gross moved from ${lakhText(first.gross)} in ${first.month} to ${lakhText(last.gross)} in ${last.month} (${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}%), head count ${first.headCount} → ${last.headCount}.`);
    slide.addText("Reading the bars", { x: 9.1, y: 4.2, w: 3.85, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: INK });
    slide.addText(
      [
        `Average ${lakhText(gross / months.length)} a month`,
        `Gross per head in ${last.month}: ${rupees(last.gross / (last.headCount || 1))}`,
        `Basic + HRA: ${pct(totals["Basic Pay"] + totals.HRA, gross)} of gross`
      ].map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      { x: 9.1, y: 4.6, w: 3.85, h: 1.3, fontFace: FONT, fontSize: 11, color: INK, valign: "top" }
    );
  }

  // 3. Deductions
  {
    const slide = contentSlide(pptx, "Deductions: where the money goes", "Total Deductions = ESIC + PF + PTAX + TDS on Salary + Advance Recover (G/L 1602 credit), ₹ lakh.", 3);
    slide.addChart(pptx.ChartType.bar, DEDUCTIONS.map((label) => ({ name: label, labels, values: months.map((m) => lakh(m[label])) })), {
      ...baseChart, x: 0.45, y: 1.35, w: 8.3, h: 5.4, barDir: "col", barGrouping: "clustered", chartColors: PALETTE.slice(0, 5),
      showLegend: true, legendPos: "b", showValue: false, barGapWidthPct: 50
    });
    slide.addText("Largest deductions", { x: 9.1, y: 1.4, w: 3.85, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    const ranked = DEDUCTIONS.map((label) => ({ label, value: totals[label] })).sort((a, b) => b.value - a.value);
    ranked.slice(0, 3).forEach((d, i) =>
      rankedItem(slide, 9.1, 1.9 + i * 0.75, 3.85, i + 1, d.label, `${lakhText(d.value)} • ${pct(d.value, deductions)} of deductions`)
    );
    note(slide, 9.1, 4.3, 3.85, 1.2,
      `Deductions are ${pct(deductions, gross)} of gross (${lakhText(deductions)}). ESIC and PTAX are small: ${lakhText(totals.ESIC)} and ${lakhText(totals.PTAX)} for the period.`);
  }

  // 4. Wages vs Salary staff
  {
    const slide = contentSlide(pptx, "Wages vs Salary staff", "Gross salary and head count by type of employee for the period.", 4);
    const twoDonut = (x, heading, values, valueText) => {
      slide.addText(heading, { x, y: 1.4, w: 4.2, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: NAVY });
      slide.addChart(pptx.ChartType.doughnut, [{ name: heading, labels: ["Wages", "Salary"], values }], {
        x, y: 1.9, w: 4.2, h: 3.4, holeSize: 55, chartColors: [PALETTE[0], PALETTE[1]],
        showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 10, showPercent: true, dataLabelColor: "FFFFFF", dataLabelFontSize: 10
      });
      slide.addText(valueText, { x, y: 5.4, w: 4.2, h: 0.9, fontFace: FONT, fontSize: 12.5, color: INK, valign: "top" });
    };
    twoDonut(0.6, "Gross salary", [lakh(totals.wagesGross), lakh(totals.salaryGross)],
      `Wages: ${lakhText(totals.wagesGross)}\nSalary: ${lakhText(totals.salaryGross)}`);
    slide.addShape("line", { x: 4.95, y: 1.5, w: 0, h: 4.8, line: { color: "C9CED6", width: 0.75 } });
    twoDonut(5.2, `Head count · ${last.month}`, [last.wagesCount, last.salaryCount],
      `Wages: ${last.wagesCount} employees\nSalary: ${last.salaryCount} employees`);
    note(slide, 9.75, 1.5, 3.2, 1.1,
      `Average gross per head in ${last.month}: wages ${rupees(last.wagesGross / (last.wagesCount || 1))}, salary ${rupees(last.salaryGross / (last.salaryCount || 1))}.`);
    slide.addText("How to read it", { x: 9.75, y: 2.9, w: 3.2, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: INK });
    slide.addText(
      ["Wages = staff paid on the wages G/L accounts", "Salary = staff paid on the salary G/L accounts", "Head count = employees with gross pay that month"].map(
        (t, i) => ({ text: `${i + 1}. ${t}`, options: { breakLine: true } })
      ),
      { x: 9.75, y: 3.3, w: 3.2, h: 1.6, fontFace: FONT, fontSize: 11, color: INK, valign: "top" }
    );
  }

  // 5. Month-by-month
  {
    const slide = contentSlide(pptx, "Month-by-month payroll", "Net pay by month, with the full figures for each posted month.", 5);
    slide.addChart(pptx.ChartType.bar, [{ name: "Net pay", labels, values: months.map((m) => lakh(m.net)) }], {
      ...baseChart, x: 0.45, y: 1.35, w: 6.4, h: 5.4, barDir: "col", chartColors: [PALETTE[2]], valAxisMinVal: 0,
      showValue: true, dataLabelFormatCode: "0.00", dataLabelPosition: "outEnd", showLegend: false, barGapWidthPct: 60
    });
    slide.addText("Monthly figures", { x: 7.2, y: 1.4, w: 5.7, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
    const head = ["Month", "Heads", "Gross", "Deductions", "Net pay", "Ded. %"].map((text) => ({
      text, options: { bold: true, color: NAVY, fill: { color: "EEF2F8" } }
    }));
    const body = months.map((m) => [
      m.month,
      String(m.headCount),
      lakhText(m.gross),
      { text: lakhText(m.deductions), options: { color: BAD } },
      { text: lakhText(m.net), options: { color: GOOD, bold: true } },
      pct(m.deductions, m.gross)
    ]);
    const totalRow = ["Total", "", lakhText(gross), lakhText(deductions), lakhText(net), pct(deductions, gross)].map((text) => ({
      text, options: { bold: true, fill: { color: "EEF2F8" } }
    }));
    slide.addTable([head, ...body, totalRow], {
      x: 7.2, y: 1.9, w: 5.7, colW: [1.05, 0.7, 1.05, 1.05, 1.05, 0.8], fontFace: FONT, fontSize: 10, color: INK,
      fill: { color: CARD }, border: { type: "solid", color: LINE, pt: 0.5 }, align: "right", valign: "middle", rowH: 0.34
    });
    note(slide, 7.2, 1.9 + (months.length + 2) * 0.34 + 0.3, 5.7, 0.8,
      "Use this table as the monthly tracker: compare each month's deduction % against the period figure and check any jump.");
  }

  // 6. Insights and actions
  {
    const slide = contentSlide(pptx, "Key insights and actions", "What the period's payroll shows, and what to follow up.", 6);
    const inc = months.map((m) => m["Incentives & OT"]);
    const incLow = Math.min(...inc);
    const incHigh = Math.max(...inc);
    const advance = totals["Advance Recover"];
    const cards = [
      ["Gross trend", `${lakhText(first.gross)} in ${first.month} → ${lakhText(last.gross)} in ${last.month}; head count ${first.headCount} → ${last.headCount}.`],
      ["Incentives & OT", `Swings from ${lakhText(incLow)} to ${lakhText(incHigh)} a month: review approvals for the high months.`],
      ["Deductions", `${pct(deductions, gross)} of gross. TDS ${lakhText(totals["TDS on Salary"])} and PF ${lakhText(totals.PF)} are the largest statutory items.`],
      ["Advance recovery", `${lakhText(advance)} recovered on G/L 1602. Track open loans against monthly recoveries.`]
    ];
    cards.forEach(([title, text], i) => {
      const x = i % 2 === 0 ? 0.75 : 6.95;
      const y = i < 2 ? 1.55 : 3.6;
      card(slide, x, y, 5.6, 1.55);
      slide.addShape("rect", { x: x + 0.25, y: y + 0.3, w: 0.5, h: 0.5, fill: { color: NAVY }, line: { color: NAVY } });
      slide.addText(String(i + 1), { x: x + 0.25, y: y + 0.3, w: 0.5, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      slide.addText(title, { x: x + 0.95, y: y + 0.22, w: 4.4, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: INK });
      slide.addText(text, { x: x + 0.95, y: y + 0.62, w: 4.45, h: 0.8, fontFace: FONT, fontSize: 11.5, color: INK, valign: "top" });
    });
    slide.addText(`Net pay for the period: ${lakhText(net)} (${pct(net, gross)} of gross) across ${months.length} posted month${months.length === 1 ? "" : "s"}.`, {
      x: 0.75, y: 5.6, w: 11.8, h: 0.6, fontFace: FONT, fontSize: 14, bold: true, color: GOOD, align: "center"
    });
  }

  await pptx.writeFile({ fileName: `${periodTitle.replace(/\s+/g, "_")}.pptx` });
}
