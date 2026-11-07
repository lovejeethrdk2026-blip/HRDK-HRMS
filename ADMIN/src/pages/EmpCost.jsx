import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import RegisterScopeNote from "../components/RegisterScopeNote";

// Pay Sheet > Emp Cost: every employee's gross, deductions and in-hand for a
// period, from GET /api/paysheets/emp-cost (server/paySheet/empCost.controller.js).
// Amounts are BC365's Pay Sheet 1; nothing else is read.

const COLUMNS = [
  ["employeeCode", "Employee Code"],
  ["employeeName", "Employee Name"],
  ["salaryType", "Salary Type"],
  ["grossSalary", "Gross Salary"],
  ["providentFund", "Provident Fund"],
  ["professionalTax", "Professional Tax"],
  ["esic", "ESIC"],
  ["itDeduction", "IT Deduction"],
  ["inHand", "In Hand"]
];
const AMOUNT_KEYS = ["grossSalary", "providentFund", "professionalTax", "esic", "itDeduction", "inHand"];
const STICKY_COLUMNS = 2;

// Indian financial year containing today: 1 April .. 31 March.
function currentFinancialYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

const amountFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const formatAmount = (value) => (value === 0 ? "–" : amountFormat.format(value));
const round2 = (n) => Math.round(n * 100) / 100;

function sumOf(rows) {
  const totals = {};
  for (const key of AMOUNT_KEYS) totals[key] = round2(rows.reduce((sum, r) => sum + (r[key] || 0), 0));
  return totals;
}

async function exportToExcel(rows, totals, period) {
  const XLSX = await import("xlsx");
  const header = COLUMNS.map(([, label]) => label.toUpperCase());
  const body = rows.map((row) => COLUMNS.map(([key]) => row[key] ?? ""));
  body.push(["Total", "", "", ...AMOUNT_KEYS.map((key) => totals[key])]);
  const sheet = XLSX.utils.aoa_to_sheet([["Emp Cost"], [period], [], header, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Emp Cost");
  XLSX.writeFile(workbook, `Emp_Cost_${period.replace(/\s+/g, "_")}.xlsx`);
}

export default function EmpCost() {
  const [draft, setDraft] = useState(currentFinancialYear);
  const [period, setPeriod] = useState(currentFinancialYear);
  const [allRows, setAllRows] = useState([]);
  const [salaryType, setSalaryType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .get("/paysheets/emp-cost", { params: { fromDate: period.from, toDate: period.to } })
      .then(({ data }) => !cancelled && setAllRows(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (cancelled) return;
        setAllRows([]);
        setError(err.response?.data?.message || err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const salaryTypes = useMemo(() => [...new Set(allRows.map((r) => r.salaryType).filter(Boolean))].sort(), [allRows]);

  const q = search.trim().toLowerCase();
  const rows = allRows.filter(
    (r) =>
      (!salaryType || r.salaryType === salaryType) &&
      (!q || r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q))
  );
  const totals = sumOf(rows);

  const dmy = (d) => d.split("-").reverse().join("-");
  const periodLabel = `${dmy(period.from)} to ${dmy(period.to)}`;
  const filtered = Boolean(salaryType || q);

  const cellClass = (key, i, value) =>
    [
      i < STICKY_COLUMNS && `ps-sticky ps-sticky-${i}`,
      AMOUNT_KEYS.includes(key) && "ps-num",
      AMOUNT_KEYS.includes(key) && value === 0 && "ps-zero",
      typeof value === "number" && value < 0 && "ps-negative"
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Emp Cost</h1>
          <p className="page-subtitle">
            Gross salary, deductions and in-hand of every employee (BC365). {periodLabel}
            {!loading && !error ? ` · ${filtered ? `${rows.length} of ${allRows.length}` : allRows.length} rows` : ""}
          </p>
          <RegisterScopeNote />
        </div>
        <div className="page-header-actions">
          <button
            className="btn"
            onClick={() => exportToExcel(rows, totals, periodLabel)}
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
          <label htmlFor="ec-from">From</label>
          <input id="ec-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
        </div>
        <div className="field-group">
          <label htmlFor="ec-to">To</label>
          <input id="ec-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
        </div>
        <div className="field-group">
          <label htmlFor="ec-type">Salary Type</label>
          <select id="ec-type" value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
            <option value="">All</option>
            {salaryTypes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="ec-search">Employee</label>
          <input
            id="ec-search"
            type="search"
            placeholder="Code or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filters-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSalaryType("");
              setSearch("");
            }}
            disabled={!filtered}
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
            <table className="ps-table ec-table">
              <thead>
                <tr>
                  {COLUMNS.map(([key, label], i) => (
                    <th key={key} className={cellClass(key, i)}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="ps-total">
                  {COLUMNS.map(([key], i) => (
                    <td key={key} className={cellClass(key, i, totals[key])}>
                      {i === 0 ? "Total" : key in totals ? formatAmount(totals[key]) : ""}
                    </td>
                  ))}
                </tr>
                {rows.map((row, i) => (
                  <tr key={`${row.employeeCode}-${row.salaryType}-${i}`}>
                    {COLUMNS.map(([key], ci) => (
                      <td key={key} className={cellClass(key, ci, row[key])}>
                        {AMOUNT_KEYS.includes(key) ? formatAmount(row[key]) : row[key]}
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
