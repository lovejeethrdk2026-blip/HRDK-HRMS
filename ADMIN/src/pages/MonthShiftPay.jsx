import { Fragment, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import RegisterScopeNote from "../components/RegisterScopeNote";
import { formatDuration } from "../utils/attendanceStats";
import { monthShiftPay } from "../utils/monthShiftPay";
import { payrollSettings } from "@salary";

// Payroll > Month Shift Register & Pay: for one month, every employee's days
// measured against their shift (Daily Register) and pay from their monthly CTC
// (employee master). Calculation only; the rules are in utils/monthShiftPay.js.

const pad = (n) => String(n).padStart(2, "0");
const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
};

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const hours = (seconds) => (seconds ? formatDuration(seconds) : "–");
const num = (n) => (n ? String(n) : "–");

// [key, label, render(row, includeOt)]
const COLUMNS = [
  ["employeeId", "Code", (r) => r.employeeId],
  ["cosecId", "COSEC ID", (r) => r.cosecId],
  ["name", "Name", (r) => r.name],
  ["department", "Department", (r) => r.department],
  ["shift", "Shift", (r) =>
    r.shiftSuspect ? (
      <span className="msp-suspect" title={`${r.fullDayHours} hours a day: check AM/PM on the employee master (e.g. 07:00 should be 19:00)`}>
        {r.shift} ⚠ {r.fullDayHours}h
      </span>
    ) : (
      r.shift || "8h (no shift)"
    )],
  ["monthlyCtc", "Monthly CTC", (r) => (r.monthlyCtc ? money.format(r.monthlyCtc) : "no CTC")],
  ["daysCounted", "Days", (r) => r.daysCounted],
  ["present", "P", (r) => num(r.present)],
  ["halfDays", "HD", (r) => num(r.halfDays)],
  ["absent", "A", (r) => num(r.absent)],
  ["weeklyOffs", "WO", (r) => num(r.weeklyOffs)],
  ["woWorked", "WO worked", (r) => num(r.woWorked)],
  ["holidays", "Holiday", (r) => num(r.holidays)],
  ["holidayWorked", "Holiday worked", (r) => num(r.holidayWorked)],
  ["leaveDays", "Leave", (r) => num(r.leaveDays)],
  ["paidDays", "Paid days", (r) => r.paidDays],
  ["workedSeconds", "Worked hrs", (r) => hours(r.workedSeconds)],
  ["shiftSeconds", "Shift hrs", (r) => hours(r.shiftSeconds)],
  ["overtimeSeconds", "OT hrs", (r) => hours(r.overtimeSeconds)],
  ["shortSeconds", "Short hrs", (r) => hours(r.shortSeconds)],
  ["lateDays", "Late days", (r) => (r.lateDays ? `${r.lateDays} (${formatDuration(r.lateSeconds)})` : "–")],
  ["perDay", "Per day", (r) => money2.format(r.perDay)],
  ["earned", "Earned CTC", (r) => money.format(r.earned)],
  ["gross", "Gross", (r) => money.format(r.gross)],
  ["pf", "PF", (r) => num(r.pf)],
  ["esic", "ESIC", (r) => num(r.esic)],
  ["pt", "PT", (r) => num(r.pt)],
  ["inHand", "In hand", (r) => money.format(r.inHand)],
  ["otPay", "OT pay", (r) => money.format(r.otPay)],
  ["total", "Total pay", (r, ot) => money.format(r.netPay + (ot ? r.otPay : 0))]
];
const NUM_KEYS = new Set(COLUMNS.slice(5).map(([key]) => key));

// Pay Formulas (HR's own components) go in after "In hand": one column each.
const TYPE_SIGN = { earning: "+", deduction: "−", employer: "employer", info: "info" };
function columnsWith(components) {
  if (!components.length) return COLUMNS;
  const at = COLUMNS.findIndex(([key]) => key === "inHand") + 1;
  const extra = components.map((c) => [
    `f:${c.code}`,
    `${c.name} (${TYPE_SIGN[c.type] || c.type})`,
    (r) =>
      r.customErrors?.[c.code] ? (
        <span className="msp-suspect" title={r.customErrors[c.code]}>error</span>
      ) : (
        money2.format(r.custom?.[c.code] ?? 0)
      )
  ]);
  return [...COLUMNS.slice(0, at), ...extra, ...COLUMNS.slice(at)];
}
const isNum = (key) => NUM_KEYS.has(key) || key.startsWith("f:");

const CODE_CLASS = { P: "msp-p", HD: "msp-hd", A: "msp-a", WO: "msp-wo", PH: "msp-ph" };
const codeClass = (code) =>
  CODE_CLASS[code] || (code?.startsWith("PH") ? "msp-ph" : code?.startsWith("WO") ? "msp-wo" : code && code !== "–" ? "msp-l" : "");

async function exportToExcel(rows, month, includeOt, components = []) {
  const XLSX = await import("xlsx");
  const header = columnsWith(components).map(([, label]) => label);
  const body = rows.map((r) => [
    r.employeeId, r.cosecId, r.name, r.department, r.shift, r.monthlyCtc, r.daysCounted, r.present, r.halfDays, r.absent,
    r.weeklyOffs, r.woWorked, r.holidays, r.holidayWorked, r.leaveDays, r.paidDays, formatDuration(r.workedSeconds), formatDuration(r.shiftSeconds),
    formatDuration(r.overtimeSeconds), formatDuration(r.shortSeconds), r.lateDays, r.perDay, r.earned,
    r.gross, r.pf, r.esic, r.pt, r.inHand, ...components.map((c) => r.custom?.[c.code] ?? 0), r.otPay, r.netPay + (includeOt ? r.otPay : 0)
  ]);
  const days = rows[0]?.days || [];
  const dayHeader = ["Code", "Name", ...days.map((d) => `${d.day} ${d.dayName.slice(0, 3)}`)];
  const dayBody = rows.map((r) => [r.employeeId, r.name, ...r.days.map((d) => d.code)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[`Month Shift Pay ${month}`], [], header, ...body]), "Pay");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([dayHeader, ...dayBody]), "Register");
  XLSX.writeFile(workbook, `Month_Shift_Pay_${month}.xlsx`);
}

export default function MonthShiftPay() {
  const pfs = payrollSettings(); // rates shown in the rules note
  const [month, setMonth] = useState(thisMonth);
  const [register, setRegister] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]); // Holidays page, this month's year
  const [fullPct, setFullPct] = useState(75);
  const [halfPct, setHalfPct] = useState(50);
  const [includeOt, setIncludeOt] = useState(false);
  const [onlyShift, setOnlyShift] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      const params = { limit: 10000, view: "register", month };
      const [first, staff, holidayList] = await Promise.all([
        api.get("/attendance", { params: { ...params, page: 1 } }),
        api.get("/employees"),
        api.get("/holidays", { params: { year: month.slice(0, 4) } }).catch(() => ({ data: [] }))
      ]);
      let rows = first.data.records;
      for (let p = 2; p <= first.data.totalPages; p++) {
        rows = rows.concat((await api.get("/attendance", { params: { ...params, page: p } })).data.records);
      }
      if (cancelled) return;
      setRegister(rows);
      setEmployees(Array.isArray(staff.data) ? staff.data : []);
      setHolidays(Array.isArray(holidayList.data) ? holidayList.data : []);
    })()
      .catch((err) => !cancelled && setError(err.response?.data?.message || err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const result = useMemo(
    () =>
      monthShiftPay({
        rows: register,
        employees,
        month,
        holidays,
        fullShare: Math.max(0, Number(fullPct) || 0) / 100,
        halfShare: Math.max(0, Number(halfPct) || 0) / 100
      }),
    [register, employees, holidays, month, fullPct, halfPct]
  );

  const q = search.trim().toLowerCase();
  const withShift = result.rows.filter((r) => r.shift).length;
  const suspect = result.rows.filter((r) => r.shiftSuspect && (!onlyShift || r.shift));
  const rows = result.rows.filter(
    (r) => (!onlyShift || r.shift) && (!q || r.name.toLowerCase().includes(q) || String(r.employeeId).toLowerCase().includes(q) || r.cosecId.toLowerCase().includes(q) || r.department.toLowerCase().includes(q))
  );
  const totalEarned = rows.reduce((s, r) => s + r.earned, 0);
  const totalOt = rows.reduce((s, r) => s + r.otPay, 0);
  const totalDeductions = rows.reduce((s, r) => s + r.pf + r.esic + r.pt, 0);
  const totalInHand = rows.reduce((s, r) => s + r.inHand, 0);
  const totalCtc = rows.reduce((s, r) => s + r.monthlyCtc, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPay, 0);
  const totalFormulaPlus = rows.reduce((s, r) => s + r.customEarnings, 0);
  const totalFormulaMinus = rows.reduce((s, r) => s + r.customDeductions, 0);
  const components = result.components || [];
  const columns = columnsWith(components);
  const formulaErrors = rows.filter((r) => Object.keys(r.customErrors || {}).length).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Month Shift Register &amp; Pay</h1>
          <p className="page-subtitle">
            Days and hours against each employee's shift (Daily Register), pay from monthly CTC (employee master).
            Calculation only. {!loading && !error ? `${rows.length} employees` : ""}
          </p>
          <RegisterScopeNote />
        </div>
        <div className="page-header-actions">
          <button className="btn" onClick={() => exportToExcel(rows, month, includeOt, components)} disabled={loading || !rows.length}>
            Export to Excel
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="field-group">
          <label htmlFor="msp-month">Month</label>
          <input id="msp-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <div className="field-group">
          <label htmlFor="msp-full">Full day at % of shift</label>
          <input id="msp-full" type="number" min="1" max="100" value={fullPct} onChange={(e) => setFullPct(e.target.value)} />
        </div>
        <div className="field-group">
          <label htmlFor="msp-half">Half day at % of shift</label>
          <input id="msp-half" type="number" min="1" max="100" value={halfPct} onChange={(e) => setHalfPct(e.target.value)} />
        </div>
        <div className="field-group">
          <label htmlFor="msp-search">Employee</label>
          <input id="msp-search" type="search" placeholder="Code, name or department" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="msp-check">
          <label>
            <input type="checkbox" checked={onlyShift} onChange={(e) => setOnlyShift(e.target.checked)} /> Only employees with a shift
            {!loading && ` (${withShift} of ${result.rows.length})`}
          </label>
        </div>
        <div className="msp-check">
          <label>
            <input type="checkbox" checked={includeOt} onChange={(e) => setIncludeOt(e.target.checked)} /> Add OT pay to total
          </label>
        </div>
      </div>

      <details className="card msp-rules">
        <summary>How the pay is calculated</summary>
        <ul>
          <li>Worked hours = completed IN→OUT punch pairs for the day (same as Daily Register "Total working").</li>
          <li>Full day = shift length, less 1 hour lunch when the shift covers 13:00–15:00. No shift on the master = 8 hours.</li>
          <li>Worked ≥ {fullPct}% of full day = <b>P</b> (1 day); ≥ {halfPct}% = <b>HD</b> (½ day); less = <b>A</b>.</li>
          <li>Weekly off (master, Sunday when blank) = <b>WO</b>, paid 1 day. Work on a weekly off is paid extra (WO worked).</li>
          <li>
            Company holiday (Holidays page) = <b>PH</b> (paid holiday, name shown under it), paid 1 day for everyone. Work on a holiday is paid extra (PH+P, Holiday
            worked). A holiday on a weekly off counts as WO.
          </li>
          <li>Approved leave is paid (½ for half-day leave). Days before joining / after leaving are not counted.</li>
          <li>Per day = monthly CTC ÷ {result.daysInMonth} days. Earned CTC = per day × paid days.</li>
          <li>
            Gross = basic + HRA + bonus + special (employee master salary split) × paid days ÷ {result.daysInMonth}. In hand = gross
            − employee PF ({pfs.pfEmployeeRate}% of basic + bonus + special
            {pfs.pfCeilingRequired ? `, max ${pfs.pfMaxAmount}` : ""}) − ESIC ({pfs.esicEmployeeRate}% of basic) − Professional Tax
            (state slab). Rates from Payroll Settings.
            Employer PF / ESIC are part of CTC, not paid out. Total pay = in hand + / − Pay Formulas (+ OT pay when ticked).
          </li>
          <li>OT hrs = time worked beyond the full day. OT pay = OT hrs × (per day ÷ full-day hours).</li>
          <li>Current month: counted up to yesterday.</li>
          {components.length > 0 && (
            <li>
              Pay Formulas (Payroll &gt; Pay Formulas): {components.map((c) => `${c.name} = ${c.formula}`).join("; ")}. Earnings are added to and
              deductions taken off the total pay; employer cost and info columns are shown only.
            </li>
          )}
        </ul>
      </details>

      {!loading && suspect.length > 0 && (
        <div className="error-banner msp-warn">
          <span>
            {suspect.length} shift{suspect.length > 1 ? "s look" : " looks"} too long ({suspect.slice(0, 5).map((r) => `${r.name} ${r.shift}`).join(", ")}{suspect.length > 5 ? ", …" : ""}).
            Probably AM/PM on the employee master, e.g. 07:00 should be 19:00. These employees show as absent until fixed.
          </span>
        </div>
      )}
      {!loading && formulaErrors > 0 && (
        <div className="error-banner msp-warn">
          <span>
            A Pay Formula failed for {formulaErrors} employee{formulaErrors > 1 ? "s" : ""} and counted as 0. Point at "error" in the table to see why.
          </span>
        </div>
      )}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}
      {loading && <Loader text="Loading Daily Register and employee master…" />}

      {!loading && !error && !rows.length && (
        <div className="card">
          <p className="state-panel">No employees on the rolls for this month.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="msp-summary">
            <div className="card"><span>Monthly CTC</span><b>₹ {money.format(totalCtc)}</b></div>
            <div className="card"><span>Earned CTC</span><b>₹ {money.format(totalEarned)}</b></div>
            <div className="card"><span>PF + ESIC + PT</span><b>₹ {money.format(totalDeductions)}</b></div>
            <div className="card"><span>In hand</span><b>₹ {money.format(totalInHand)}</b></div>
            {components.length > 0 && (
              <div className="card"><span>Formulas + / −</span><b>₹ {money.format(totalFormulaPlus)} / {money.format(totalFormulaMinus)}</b></div>
            )}
            <div className="card"><span>OT pay</span><b>₹ {money.format(totalOt)}</b></div>
            <div className="card"><span>Total pay</span><b>₹ {money.format(totalNet + (includeOt ? totalOt : 0))}</b></div>
          </div>
          <div className="card card-table">
            <div className="table-scroll">
              <table className="ps-table msp-table">
                <thead>
                  <tr>
                    {columns.map(([key, label]) => (
                      <th key={key} className={isNum(key) ? "ps-num" : undefined}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.employeeId}>
                      <tr className="msp-row" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)} title="Show day by day">
                        {columns.map(([key, , render]) => (
                          <td key={key} className={isNum(key) ? "ps-num" : undefined}>{render(r, includeOt)}</td>
                        ))}
                      </tr>
                      {open === r.employeeId && (
                        <tr className="msp-days-row">
                          <td colSpan={columns.length}>
                            <div className="msp-days">
                              {r.days.map((d) => (
                                <div key={d.day} className={`msp-day ${codeClass(d.code)}`} title={(d.holidayName ? `${d.holidayName} (holiday)${d.worked ? ". " : ""}` : "") + (d.worked ? `Worked ${formatDuration(d.worked)} of ${formatDuration(d.fullDay)}${d.late ? `, late ${formatDuration(d.late)}` : ""}${d.overtime ? `, OT ${formatDuration(d.overtime)}` : ""}` : "")}>
                                  <span className="msp-day-no">{d.day} {d.dayName.slice(0, 2)}</span>
                                  <span className="msp-day-code">{d.code || "·"}</span>
                                  <span className="msp-day-hrs">{d.worked ? formatDuration(d.worked) : ""}</span>
                                  {d.isHoliday && <span className="msp-day-holiday">{d.holidayName}</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
