import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import FinancialCharts from "../components/FinancialCharts";
import Loader from "../components/Loader";
import RegisterScopeNote from "../components/RegisterScopeNote";
import { downloadFinancialPdf } from "../utils/financialPdf";
import { downloadFinancialPptx } from "../utils/financialPptx";

// Pay Sheet > Financial Summary: payroll for a From..To period added up,
// Wages and Salary employees side by side, from Pay Sheet 1 (salary items and
// deductions) and Pay Sheet 3 (loan re-payments, shown as Advance Recover),
// both relayed from BC365 at /api/paysheets/:sheet. Laid out like the HR
// "Financial Breakdown" workbook: a Total block for the whole period first,
// then one block per month (April, May, ...), each in its own box: the Total
// across the top, the months below two to a row.
//
// Head Count is the number of employees with a non-zero amount on that line
// (an employee with two rows in a month, or in several months of the Total,
// counts once). Advance Recover is the whole Credit Amount of G/L 1602 in the
// month (Employee Loans' re-payments), so it matches BC365's Chart of Accounts;
// re-payments of employees not on that month's payroll are included and also
// named under the table. Months BC365 has no payroll for yet are listed, not
// shown as zero.
// Compliance Deductions = ESIC + PF + PTAX + TDS on Salary; Net Payment
// Liability = Gross Salary - Compliance Deductions; Total Deductions =
// Compliance Deductions + Advance Recover; Net Pay = Gross Salary - Total
// Deductions.

const sum = (keys) => (row) => keys.reduce((total, key) => total + (Number(row[key]) || 0), 0);

const EARNINGS = [
  ["Basic Pay", sum(["basicWages", "basicSalary"])],
  ["House Rent Allowance (HRA)", sum(["houseRentAllowanceWages", "houseRentAllowanceSalary"])],
  ["Special Allowance", sum(["specialAllowanceWage", "specialAllowanceSalary"])],
  [
    "Bonus",
    sum([
      "statutoryBonus1Wages",
      "statutoryBonus1Salary",
      "statutoryBonus2Wages",
      "statutoryBonus2Salary",
      "bonusWages",
      "bonusSalary"
    ])
  ],
  ["Incentives & Overtime", sum(["incentiveWages", "incentives", "overtimeWages", "overtimeSalary"])]
];
// Whatever else Total Earnings holds (transport, stipend, ...); shown only when not zero.
const listedEarnings = (row) => EARNINGS.reduce((total, [, value]) => total + value(row), 0);
const OTHER_EARNINGS = ["Other (Transport, Stipend, …)", (row) => (Number(row.totalEarnings) || 0) - listedEarnings(row)];

const COMPLIANCE = [
  ["ESIC", sum(["esiEmployee"])],
  ["PF", sum(["pfEmployee"])],
  ["PTAX", sum(["professionalTax"])],
  ["TDS on Salary", sum(["tdsOnSalary"])]
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const COLUMNS = ["Head Count", "Wages", "Head Count", "Salary", "Total", "% of Gross Salary"];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const money = (amount) => inr.format(Math.round(amount * 100) / 100);
const round2 = (amount) => Math.round(amount * 100) / 100;
const percent = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(2)}%` : "–");

// Indian financial year containing today: 1 April .. 31 March (as the Pay Sheet pages open).
function currentFinancialYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// Today as "YYYY-MM-DD" (local); months starting after it are not asked for.
function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "YYYY-MM" -> its first and last day, { from, to } as "YYYY-MM-DD".
function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

const dmy = (iso) => iso.split("-").reverse().join("-");
const monthName = (month) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// "April 2026" for a whole calendar month, else "01-04-2026 to 15-04-2026".
function periodLabel({ from, to }) {
  const month = from.slice(0, 7);
  const whole = monthRange(month);
  return from === whole.from && to === whole.to ? monthName(month) : `${dmy(from)} to ${dmy(to)}`;
}

// The From..To period cut at month ends: [{ month: "YYYY-MM", from, to }, ...];
// the first and last pieces keep the period's own start and end.
function monthsOf({ from, to }) {
  const pieces = [];
  let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    const whole = monthRange(month);
    pieces.push({ month, from: from > whole.from ? from : whole.from, to: to < whole.to ? to : whole.to });
    const [y, m] = month.split("-").map(Number);
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return pieces;
}

// Rows of several months folded into one row per employee (numbers added up),
// so the Total block counts each employee once.
function mergeRows(rows, keyOf) {
  const merged = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const into = merged.get(key);
    if (!into) {
      merged.set(key, { ...row });
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "number") into[field] = (into[field] || 0) + value;
    }
  }
  return [...merged.values()];
}

// One line of the breakdown: head count and amount for Wages and for Salary
// employees, and the total. value(row) reads the line's amount off a row.
function line(label, rowsByType, value) {
  const side = (rows) => {
    const amounts = rows.map(value);
    return {
      count: rows.filter((row, i) => row.initials && Math.abs(amounts[i]) > 0.005).length,
      amount: amounts.reduce((a, b) => a + b, 0)
    };
  };
  const wages = side(rowsByType.WAGES);
  const salary = side(rowsByType.SALARY);
  return { label, wages, salary, total: wages.amount + salary.amount };
}

// A subtotal line made of other lines.
function subtotal(label, lines) {
  const add = (pick) => lines.reduce((total, l) => total + pick(l), 0);
  return {
    label,
    wages: { amount: add((l) => l.wages.amount) },
    salary: { amount: add((l) => l.salary.amount) },
    total: add((l) => l.total),
    strong: true
  };
}

// One block (the Total, or one month): its two sections of lines.
// withOther: whether to keep the Other earnings line (every block shows the
// same lines, so it is decided once for the whole table).
function buildBlock(payRows, loanRows, withOther) {
  const rowsByType = {
    WAGES: payRows.filter((row) => row.salaryType === "WAGES"),
    SALARY: payRows.filter((row) => row.salaryType !== "WAGES")
  };

  const earnings = EARNINGS.map(([label, value]) => line(label, rowsByType, value));
  if (withOther) earnings.push(line(OTHER_EARNINGS[0], rowsByType, OTHER_EARNINGS[1]));
  const gross = subtotal("Gross Salary", earnings);
  const people = (rows) => new Set(rows.map((row) => row.initials).filter(Boolean)).size;
  gross.wages.count = people(rowsByType.WAGES);
  gross.salary.count = people(rowsByType.SALARY);

  const compliance = COMPLIANCE.map(([label, value]) => line(label, rowsByType, value));
  const complianceTotal = subtotal("Compliance Deductions", compliance);
  // What is owed to employees once compliance is held back.
  const liability = {
    label: "Net Payment Liability",
    wages: { amount: gross.wages.amount - complianceTotal.wages.amount },
    salary: { amount: gross.salary.amount - complianceTotal.salary.amount },
    total: gross.total - complianceTotal.total,
    strong: true
  };

  // Loan rows carry no salary type of their own: buildSummary gives each one
  // (from the employee's pay sheet row).
  const loansByType = { WAGES: [], SALARY: [] };
  for (const loan of loanRows) loansByType[loan.salaryType === "WAGES" ? "WAGES" : "SALARY"].push(loan);
  const advance = line("Advance Recover", loansByType, sum(["repayments"]));

  const totalDeductions = subtotal("Total Deductions", [complianceTotal, advance]);
  const net = {
    label: "Net Pay",
    wages: { amount: gross.wages.amount - totalDeductions.wages.amount },
    salary: { amount: gross.salary.amount - totalDeductions.salary.amount },
    total: gross.total - totalDeductions.total,
    strong: true
  };

  return {
    gross: gross.total,
    sections: [
      [...earnings, gross],
      [...compliance, complianceTotal, liability, advance, totalDeductions, net]
    ]
  };
}

const SECTION_TITLES = ["Salary Breakdown", "Compliance Breakdown"];

const payKey = (row) => `${row.initials || row.empCode}|${row.salaryType}`;
const loanKey = (row) => String(row.initials || row.empCode);

// months: [{ month, from, to, payRows, loanRows }] (payRows null for a month
// not asked for yet) -> the Total block, then one per month that has a payroll.
function buildSummary(period, months) {
  const posted = [];
  const notPosted = [];
  const offPayrollLoans = []; // { month, initials, name, amount }
  // An employee's salary type from any month of the period (the latest wins),
  // for a loan re-paid in a month they were not on the payroll.
  const anyType = new Map();
  for (const m of months) for (const row of m.payRows || []) if (row.initials) anyType.set(String(row.initials), row.salaryType);

  for (const m of months) {
    if (!m.payRows?.length) {
      notPosted.push(periodLabel(m));
      continue;
    }
    // One row per employee and salary type (BC365 can split one person's month in two).
    const payRows = mergeRows(m.payRows, payKey);
    const typeOf = new Map(payRows.filter((row) => row.initials).map((row) => [String(row.initials), row.salaryType]));
    const loanRows = mergeRows(m.loanRows, loanKey).map((loan) => {
      const id = String(loan.initials);
      if (!typeOf.has(id) && Number(loan.repayments)) {
        offPayrollLoans.push({ month: periodLabel(m), initials: loan.initials, name: loan.employeeName, amount: Number(loan.repayments) });
      }
      return { ...loan, salaryType: typeOf.get(id) || anyType.get(id) || "SALARY" };
    });
    posted.push({ ...m, payRows, loanRows });
  }

  if (!posted.length) return { empty: true, notPosted, offPayrollLoans };

  const totalPay = mergeRows(posted.flatMap((m) => m.payRows), payKey);
  // Per employee and type, so a loan re-paid under Wages and later Salary stays split.
  const totalLoans = mergeRows(posted.flatMap((m) => m.loanRows), (row) => `${loanKey(row)}|${row.salaryType}`);
  const withOther = totalPay.some((row) => Math.abs(OTHER_EARNINGS[1](row)) > 0.5);

  const blocks = [
    { title: `Total · ${periodLabel(period)}`, ...buildBlock(totalPay, totalLoans, withOther) },
    ...posted.map((m) => ({ title: periodLabel(m), month: m.month, ...buildBlock(m.payRows, m.loanRows, withOther) }))
  ];
  // Line labels, from the first block (every block has the same lines).
  const labels = blocks[0].sections.map((lines) => lines.map((l) => ({ label: l.label, strong: l.strong })));
  return { blocks, labels, empty: false, notPosted, offPayrollLoans };
}

// Page colours (theme.css) as Excel ARGB, so the download looks like the screen.
const XL = {
  tealDeep: "FF1A4442",
  tealSoft: "FFEBF2F0",
  brassSoft: "FFF4EDE0", // --brass-soft over white
  brassDeep: "FF9A7431",
  white: "FFFFFFFF",
  text: "FF171A18",
  rowLine: "FFEDEAE2",
  edge: "FFD9DAD3"
};
// Rupees with Indian grouping (₹1,23,45,678.00), as on the page.
const XL_RUPEES =
  '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00';
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// Download in the page's layout and colours: the title, then one box per
// block, as on the page -- the Total on top, then the months two to a row --
// each box with its name, and per section a dark header row and its lines,
// subtotals shaded. Built with ExcelJS, which (unlike SheetJS) writes cell
// styles.
async function exportToExcel(title, summary) {
  const { default: ExcelJS } = await import("exceljs");
  const { blocks, labels } = summary;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Financial Summary", { views: [{ showGridLines: false }] });
  // A box is 7 columns (label + the six); boxes side by side have a narrow gap.
  const BOX = [30, 11, 15, 11, 15, 16, 12];
  sheet.columns = [...BOX, 3, ...BOX].map((width) => ({ width }));
  const boxHeight = 1 + labels.reduce((rows, sectionLabels) => rows + 1 + sectionLabels.length, 0);

  sheet.mergeCells(1, 1, 1, 15);
  Object.assign(sheet.getCell(1, 1), {
    value: title,
    font: { bold: true, size: 14, color: { argb: XL.tealDeep } }
  });
  sheet.getRow(1).height = 24;

  const edge = { style: "medium", color: { argb: XL.edge } };
  const line = { style: "thin", color: { argb: XL.rowLine } };

  // One box with its top-left corner at (top, left).
  function writeBox(block, top, left, isTotal) {
    const right = left + 6;
    sheet.mergeCells(top, left, top, right);
    const name = sheet.getCell(top, left);
    name.value = block.title.toUpperCase();
    name.font = { bold: true, color: { argb: isTotal ? XL.brassDeep : XL.tealDeep } };
    name.fill = fill(isTotal ? XL.brassSoft : XL.tealSoft);
    name.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(top).height = 22;

    let r = top + 1;
    labels.forEach((sectionLabels, s) => {
      [SECTION_TITLES[s], ...COLUMNS].forEach((value, c) => {
        const cell = sheet.getCell(r, left + c);
        cell.value = value;
        cell.fill = fill(XL.tealDeep);
        cell.font = { bold: true, color: { argb: XL.white } };
        cell.alignment = { horizontal: c === 0 ? "center" : "right", vertical: "middle" };
      });
      r++;
      sectionLabels.forEach(({ label, strong }, i) => {
        const l = block.sections[s][i];
        const values = [
          label,
          l.wages.count ?? null,
          round2(l.wages.amount),
          l.salary.count ?? null,
          round2(l.salary.amount),
          round2(l.total),
          block.gross ? l.total / block.gross : null
        ];
        values.forEach((value, c) => {
          const cell = sheet.getCell(r, left + c);
          cell.value = value;
          cell.font = { bold: Boolean(strong) || c === 5, color: { argb: XL.text } };
          if (strong) cell.fill = fill(XL.tealSoft);
          cell.border = { bottom: line };
          if (c === 0) return;
          cell.alignment = { horizontal: "right" };
          if (c === 2 || c === 4 || c === 5) cell.numFmt = XL_RUPEES;
          if (c === 6) cell.numFmt = "0.00%";
        });
        r++;
      });
    });
    // A frame round the box.
    for (let row = top; row < top + boxHeight; row++) {
      for (const [col, side] of [[left, "left"], [right, "right"]]) {
        const cell = sheet.getCell(row, col);
        cell.border = { ...cell.border, [side]: edge };
      }
    }
    for (let col = left; col <= right; col++) {
      const last = sheet.getCell(top + boxHeight - 1, col);
      last.border = { ...last.border, bottom: edge };
    }
  }

  writeBox(blocks[0], 3, 1, true);
  blocks.slice(1).forEach((block, i) => {
    const top = 3 + (boxHeight + 2) * (1 + Math.floor(i / 2));
    writeBox(block, top, i % 2 === 0 ? 1 : 9, false);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/\s+/g, "_")}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One block (the Total or a month) as a box: its name, then per section a
// dark header row and its lines.
function BlockBox({ block, labels, isTotal }) {
  return (
    <section className={`card card-table fs-box${isTotal ? " fs-box-total" : ""}`}>
      <h3 className="fs-box-title">{block.title}</h3>
      <div className="table-scroll">
        <table className="fs-table">
          {labels.map((sectionLabels, s) => (
            <tbody key={SECTION_TITLES[s]}>
              <tr className="fs-head">
                <th scope="col">{SECTION_TITLES[s]}</th>
                {COLUMNS.map((column, c) => (
                  <th key={c} scope="col" className="num">
                    {column}
                  </th>
                ))}
              </tr>
              {sectionLabels.map(({ label, strong }, i) => {
                const l = block.sections[s][i];
                return (
                  <tr key={label} className={strong ? "fs-strong" : undefined}>
                    <th scope="row">{label}</th>
                    <td className="num">{l.wages.count ?? ""}</td>
                    <td className="num">{money(l.wages.amount)}</td>
                    <td className="num">{l.salary.count ?? ""}</td>
                    <td className="num">{money(l.salary.amount)}</td>
                    <td className="num fs-total">{money(l.total)}</td>
                    <td className="num">{percent(l.total, block.gross)}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

export default function FinancialSummary() {
  // draft is what the filter shows; period is what was last applied.
  const [draft, setDraft] = useState(currentFinancialYear);
  const [period, setPeriod] = useState(currentFinancialYear);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pptBusy, setPptBusy] = useState(false);
  const pageRef = useRef(null);

  async function downloadPpt() {
    setPptBusy(true);
    try {
      await downloadFinancialPptx(summary, title);
    } catch (err) {
      setError(`Could not make the PowerPoint: ${err.message}`);
    } finally {
      setPptBusy(false);
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      await downloadFinancialPdf(pageRef.current, title);
    } catch (err) {
      setError(`Could not make the PDF: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const rowsOf = (response) => (Array.isArray(response.data) ? response.data : []);
    Promise.all(
      monthsOf(period).map(async (piece) => {
        if (piece.from > todayIso()) return { ...piece, payRows: null, loanRows: [] };
        const params = { fromDate: piece.from, toDate: piece.to };
        const [pay, loans] = await Promise.all([
          api.get("/paysheets/1", { params }),
          api.get("/paysheets/3", { params })
        ]);
        return { ...piece, payRows: rowsOf(pay), loanRows: rowsOf(loans) };
      })
    )
      .then((months) => !cancelled && setSummary(buildSummary(period, months)))
      .catch((err) => {
        if (cancelled) return;
        setSummary(null);
        setError(err.response?.data?.message || err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const label = periodLabel(period);
  const title = `${label} - Financial Breakdown`;
  const draftBad = !draft.from || !draft.to || draft.from > draft.to;

  return (
    <div ref={pageRef}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Summary</h1>
          <p className="page-subtitle">
            Payroll for a period added up for Wages and Salary employees, from Pay Sheet 1 and Employee Loans
            (BC365): the Total on top, then each month.
          </p>
          <RegisterScopeNote />
        </div>
        <div className="page-header-actions">
          <button
            className="btn"
            onClick={() => exportToExcel(title, summary)}
            disabled={loading || !summary || summary.empty}
          >
            Export to Excel
          </button>
          <button className="btn" onClick={downloadPdf} disabled={loading || !summary || summary.empty || pdfBusy}>
            {pdfBusy && <span className="spinner" aria-hidden="true" />}
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button className="btn" onClick={downloadPpt} disabled={loading || !summary || summary.empty || pptBusy}>
            {pptBusy && <span className="spinner" aria-hidden="true" />}
            {pptBusy ? "Preparing PPT…" : "Download PPT"}
          </button>
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draftBad) setPeriod({ ...draft });
        }}
      >
        <div className="field-group">
          <label htmlFor="fs-from">From</label>
          <input
            id="fs-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </div>
        <div className="field-group">
          <label htmlFor="fs-to">To</label>
          <input
            id="fs-to"
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </div>
        <div className="filters-actions">
          {draftBad && <span className="fs-hint">From must be on or before To.</span>}
          <button type="submit" className="btn btn-primary" disabled={loading || draftBad}>
            Apply dates
          </button>
        </div>
      </form>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {loading && <Loader text="Loading each month from BC365… a first load can take a minute or two." />}

      {!loading && !error && summary?.empty && (
        <div className="card">
          <p className="state-panel">No payroll posted in BC365 for {label}.</p>
        </div>
      )}

      {!loading && !error && summary && !summary.empty && (
        <>
          <h2 className="fs-title">{title}</h2>
          <div className="fs-grid">
            {summary.blocks.map((block, b) => (
              <BlockBox key={block.title} block={block} labels={summary.labels} isTotal={b === 0} />
            ))}
          </div>
          <FinancialCharts blocks={summary.blocks} />
        </>
      )}

      {!loading && !error && summary && (summary.notPosted.length > 0 || summary.offPayrollLoans.length > 0) && (
        <div className="fs-notes">
          {summary.notPosted.length > 0 && (
            <p>
              <strong>Not posted in BC365 yet:</strong> {summary.notPosted.join(", ")}.
            </p>
          )}
          {summary.offPayrollLoans.length > 0 && (
            <p>
              <strong>Advance Recover includes</strong> re-payments of employees not on that month's payroll:{" "}
              {summary.offPayrollLoans
                .map((loan) => `${loan.month}: ${loan.initials} ${loan.name} ${money(loan.amount)}`)
                .join("; ")}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
