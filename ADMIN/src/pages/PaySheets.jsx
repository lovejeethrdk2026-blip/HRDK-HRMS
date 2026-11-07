import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import RegisterScopeNote from "../components/RegisterScopeNote";

// The three Pay Sheet reports of the separate Pay Sheet app (paysheet-app),
// read live from BC365 and relayed by this server at /api/paysheets/:sheet.
// Column lists follow that app's pages; the optional 3rd entry is the G/L no.

const IDENTITY = [
  ["empCode", "Emp Code"],
  ["initials", "Initials No."],
  ["employeeName", "Employee Name"],
  ["salaryType", "Salary Type"]
];

// Salary Summary (Pay Sheet 1) shows each item's Wages and Salary G/L amounts as one column.
const MERGED = {
  basicWagesSalary: ["basicWages", "basicSalary"],
  houseRentAllowanceWagesSalary: ["houseRentAllowanceWages", "houseRentAllowanceSalary"],
  transportAllowanceWagesSalary: ["transportAllowanceWages", "transportAllowanceSalary"],
  specialAllowanceWageSalary: ["specialAllowanceWage", "specialAllowanceSalary"],
  statutoryBonus1WagesSalary: ["statutoryBonus1Wages", "statutoryBonus1Salary"],
  statutoryBonus2WagesSalary: ["statutoryBonus2Wages", "statutoryBonus2Salary"],
  overtimeWagesSalary: ["overtimeWages", "overtimeSalary"],
  bonusWagesSalary: ["bonusWages", "bonusSalary"],
  stipendWagesSalary: ["stipendWages", "stipendSalary"],
  incentivesWagesSalary: ["incentiveWages", "incentives"] // 7267 + 7414
};

function mergeWagesSalary(row) {
  const merged = { ...row };
  for (const [key, [wages, salary]] of Object.entries(MERGED)) {
    merged[key] = Math.round(((row[wages] || 0) + (row[salary] || 0)) * 100) / 100;
  }
  return merged;
}

export const SHEETS = {
  paySheet1: {
    sheet: 1,
    title: "Salary Summary",
    subtitle: "Wages and Salary of each pay item combined in one column (BC365).",
    mapRow: mergeWagesSalary,
    columns: [
      ...IDENTITY,
      ["basicWagesSalary", "Basic"],
      ["houseRentAllowanceWagesSalary", "House Rent Allowance"],
      ["transportAllowanceWagesSalary", "Transport Allowance"],
      ["specialAllowanceWageSalary", "Special Allowance"],
      ["statutoryBonus1WagesSalary", "Statutory Bonus1"],
      ["statutoryBonus2WagesSalary", "Statutory Bonus2"],
      ["incentivesWagesSalary", "Incentives"],
      ["overtimeWagesSalary", "Overtime"],
      ["bonusWagesSalary", "Bonus"],
      ["stipendWagesSalary", "Stipend"],
      ["totalEarnings", "Total Earnings"],
      ["esiEmployee", "ESI Cont. (Employee) @ 0.75%"],
      ["pfEmployee", "PF Cont. (Employee) @ 12%"],
      ["professionalTax", "Professional Tax"],
      ["tdsOnSalary", "TDS on Salary"],
      ["totalDeductions", "Total Deductions"],
      ["netAmount", "Net Amount"]
    ],
    amountsFrom: 4,
    filters: ["empCode", "initials", "employeeName", "salaryType"]
  },
  paySheet2: {
    sheet: 2,
    title: "Salary Detail",
    subtitle: "Every Wages / Salary G/L account in its own column, plus employer contributions (BC365).",
    columns: [
      ...IDENTITY,
      ["basicWages", "Basic Wages", "7253"],
      ["houseRentAllowanceWages", "House Rent Allowance Wages", "7254"],
      ["transportAllowanceWages", "Transport Allowance Wages", "7255"],
      ["specialAllowanceWage", "Special Allowance Wage", "7256"],
      ["statutoryBonus1Wages", "Statutory Bonus1 Wages", "7257"],
      ["statutoryBonus2Wages", "Statutory Bonus2 Wages", "7258"],
      ["overtimeWages", "Overtime Wages", "7264"],
      ["bonusWages", "Bonus - Wages", "7265"],
      ["stipendWages", "Stipend Wages", "7266"],
      ["incentiveWages", "Incentive Wages", "7267"],
      ["salaryAccount", "Salary Account", "7400"],
      ["humanResourcesComplianceSalary", "Human Resources Compliance Salary", "7401"],
      ["basicSalary", "Basic Salary", "7402"],
      ["houseRentAllowanceSalary", "House Rent Allowance Salary", "7403"],
      ["transportAllowanceSalary", "Transport Allowance Salary", "7404"],
      ["specialAllowanceSalary", "Special Allowance Salary", "7405"],
      ["statutoryBonus1Salary", "Statutory Bonus1 Salary", "7406"],
      ["statutoryBonus2Salary", "Statutory Bonus2 Salary", "7407"],
      ["overtimeSalary", "Overtime Salary", "7408"],
      ["incentives", "Incentive", "7414"],
      ["bonusSalary", "Bonus - Salary", "7416"],
      ["stipendSalary", "Stipend Salary", "7419"],
      ["employeeContributionBearByEmployer", "Employee Contribution Bear by Employer", "7420"],
      ["totalEarnings", "Total Earnings"],
      ["esiEmployee", "ESI Cont. (Employee) @ 0.75%", "2364"],
      ["pfEmployee", "PF Cont. (Employee) @ 12%", "2367"],
      ["professionalTax", "Professional Tax", "2373"],
      ["tdsOnSalary", "TDS On Salary", "2403"],
      ["totalDeductions", "Total Deductions"],
      ["netAmount", "Net Amount"],
      ["epfEmployerWages", "EPF (Employer) @ 3.67% Wages", "7259"],
      ["epsEmployerWages", "EPS (Employer) @ 8.33% Wages", "7260"],
      ["esiEmployerWages", "ESI Cont. (Employer) @ 3.25% Wages", "7261"],
      ["adminChargesWages", "Admin Charges @ 0.5% Wages", "7262"],
      ["edliContributionWages", "EDLI Contribution @ 0.5% Wages", "7263"],
      ["epfEmployerSalary", "EPF (Employer) @ 3.67% Salary", "7409"],
      ["epsEmployerSalary", "EPS (Employer) @ 8.33% Salary", "7410"],
      ["esiEmployerSalary", "ESI Cont. (Employer) @ 3.25% Salary", "7411"],
      ["adminChargesSalary", "Admin Charges @ 0.5% Salary", "7412"],
      ["edliContributionSalary", "EDLI Contribution @ 0.5% Salary", "7413"],
      ["edliAdminCharges", "EDLI Admin Charges", "7415"],
      ["compensationFund", "Compensation Fund", "7417"],
      ["gratuityCurrentServiceCost", "Current Service Cost - Gratuity", "7418"]
    ],
    amountsFrom: 4,
    filters: ["empCode", "initials", "employeeName", "salaryType"]
  },
  paySheet3: {
    sheet: 3,
    title: "Employee Loans",
    subtitle: "Loans to employees, G/L 1602 Advance Salary To Employees (BC365).",
    columns: [
      ["empCode", "Emp Code"],
      ["initials", "Initials No."],
      ["employeeName", "Employee Name"],
      ["openingBalance", "Opening Balance"],
      ["additions", "Additions"],
      ["repayments", "Re-Payments"],
      ["closingBalance", "Closing Balance"],
      ["address", "Address"],
      ["pan", "PAN"]
    ],
    amountKeys: ["openingBalance", "additions", "repayments", "closingBalance"],
    filters: ["empCode", "initials", "employeeName"]
  }
};

const STICKY_COLUMNS = 3;

// Indian financial year containing today: 1 April .. 31 March.
function currentFinancialYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

const amountFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const formatAmount = (value) =>
  typeof value !== "number" ? value ?? "" : value === 0 ? "–" : amountFormat.format(value);

const round2 = (n) => Math.round(n * 100) / 100;

const headerText = ([, label, glNo]) => (glNo ? `${label} [${glNo}]` : label);

async function exportToExcel(config, rows, totals, period) {
  const XLSX = await import("xlsx");
  const header = config.columns.map(headerText);
  const totalRow = config.columns.map(([key], i) => (i === 0 ? "Total" : totals[key] ?? ""));
  const body = rows.map((row) => config.columns.map(([key]) => row[key] ?? ""));
  const sheet = XLSX.utils.aoa_to_sheet([[config.title], [period], [], header, totalRow, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  XLSX.writeFile(workbook, `${config.title.replace(/\s+/g, "_")}_${period.replace(/\s+/g, "_")}.xlsx`);
}

export default function PaySheets({ sheetKey }) {
  const config = SHEETS[sheetKey];
  const [draft, setDraft] = useState(currentFinancialYear);
  const [period, setPeriod] = useState(currentFinancialYear);
  const [allRows, setAllRows] = useState([]);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const amountKeys = useMemo(
    () => config.amountKeys || config.columns.slice(config.amountsFrom).map(([key]) => key),
    [config]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .get(`/paysheets/${config.sheet}`, { params: { fromDate: period.from, toDate: period.to } })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setAllRows(config.mapRow ? rows.map(config.mapRow) : rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setAllRows([]);
        setError(err.response?.data?.message || err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [config, period]);

  // Switching sheet starts with clean filters.
  useEffect(() => setFilters({}), [sheetKey]);

  const active = Object.entries(filters).filter(([, v]) => v.trim());
  const rows = active.length
    ? allRows.filter((row) =>
        active.every(([key, v]) => {
          const cell = String(row[key] ?? "").toLowerCase();
          return key === "salaryType" ? cell === v.toLowerCase() : cell.includes(v.trim().toLowerCase());
        })
      )
    : allRows;

  const totals = {};
  for (const key of amountKeys) {
    totals[key] = round2(rows.reduce((sum, r) => sum + (typeof r[key] === "number" ? r[key] : 0), 0));
  }

  const dmy = (d) => d.split("-").reverse().join("-");
  const periodLabel = `${dmy(period.from)} to ${dmy(period.to)}`;
  const salaryTypes = [...new Set(allRows.map((r) => r.salaryType).filter(Boolean))].sort();

  const cellClass = (key, i, value) =>
    [
      i < STICKY_COLUMNS && `ps-sticky ps-sticky-${i}`,
      amountKeys.includes(key) && "ps-num",
      amountKeys.includes(key) && value === 0 && "ps-zero",
      typeof value === "number" && value < 0 && "ps-negative"
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{config.title}</h1>
          <p className="page-subtitle">
            {config.subtitle} {periodLabel}
            {!loading && !error ? ` · ${active.length ? `${rows.length} of ${allRows.length}` : allRows.length} rows` : ""}
          </p>
          <RegisterScopeNote />
        </div>
        <div className="page-header-actions">
          <button
            className="btn"
            onClick={() => exportToExcel(config, rows, totals, periodLabel)}
            disabled={loading || rows.length === 0}
          >
            Export to Excel
          </button>
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPeriod({ ...draft });
        }}
      >
        <div className="field-group">
          <label htmlFor="ps-from">From</label>
          <input
            id="ps-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </div>
        <div className="field-group">
          <label htmlFor="ps-to">To</label>
          <input
            id="ps-to"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </div>

        {config.filters.map((key) => {
          const label = config.columns.find(([k]) => k === key)?.[1] || key;
          const setValue = (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
          return (
            <div className="field-group" key={key}>
              <label htmlFor={`ps-${key}`}>{label}</label>
              {key === "salaryType" ? (
                <select id={`ps-${key}`} value={filters[key] || ""} onChange={setValue}>
                  <option value="">All</option>
                  {salaryTypes.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`ps-${key}`}
                  type="search"
                  placeholder="Type to search"
                  value={filters[key] || ""}
                  onChange={setValue}
                />
              )}
            </div>
          );
        })}

        <div className="filters-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFilters({})}
            disabled={active.length === 0}
          >
            Clear filters
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Apply period
          </button>
        </div>
      </form>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {loading && <Loader text="Loading from BC365… the first load of a period can take a minute." />}

      {!loading && !error && rows.length === 0 && (
        <div className="card">
          <p className="state-panel">
            {allRows.length ? "No rows match these filters." : "No pay sheet rows for this period."}
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="card card-table">
          <div className="table-scroll">
            <table className="ps-table">
              <thead>
                <tr>
                  {config.columns.map(([key, label, glNo], i) => (
                    <th key={key} className={cellClass(key, i)}>
                      {label}
                      {glNo && <span className="ps-gl">[{glNo}]</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="ps-total">
                  {config.columns.map(([key], i) => (
                    <td key={key} className={cellClass(key, i, totals[key])}>
                      {i === 0 ? "Total" : key in totals ? formatAmount(totals[key]) : ""}
                    </td>
                  ))}
                </tr>
                {rows.map((row, ri) => (
                  <tr key={`${row.empCode}-${row.salaryType || ""}-${ri}`}>
                    {config.columns.map(([key], i) => (
                      <td key={key} className={cellClass(key, i, row[key])}>
                        {amountKeys.includes(key) ? formatAmount(row[key]) : row[key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
