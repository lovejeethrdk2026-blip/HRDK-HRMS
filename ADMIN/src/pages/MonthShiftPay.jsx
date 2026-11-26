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

// [key, label, render(row, includeOt), excel(row, includeOt), options]
// render null: Excel only. options: stick (kept on the left while scrolling),
// hideEmpty (hidden when every row is 0 this month; still in the Excel file).
const COLUMNS = [
  ["employeeId", "Code", (r) => r.employeeId, (r) => r.employeeId, { stick: 1 }],
  [
    "name",
    "Name",
    (r) => (
      <div className="msp-name">
        <span>{r.name}</span>
        <small>
          COSEC {r.cosecId} ·{" "}
          {r.shiftSuspect ? (
            <span className="msp-suspect" title={`${r.fullDayHours} hours a day: check AM/PM on the employee master (e.g. 07:00 should be 19:00)`}>
              {r.shift} ⚠ {r.fullDayHours}h
            </span>
          ) : (
            r.shift || "8h (no shift)"
          )}
        </small>
      </div>
    ),
    (r) => r.name,
    { stick: 2 }
  ],
  ["cosecId", "COSEC ID", null, (r) => r.cosecId],
  ["shift", "Shift", null, (r) => r.shift],
  ["department", "Department", (r) => r.department, (r) => r.department],
  ["monthlyCtc", "Monthly CTC", (r) => (r.monthlyCtc ? money.format(r.monthlyCtc) : "no CTC"), (r) => r.monthlyCtc],
  ["paidDays", "Paid days", (r) => <b>{r.paidDays}</b>, (r) => r.paidDays],
  ["inHand", "In hand", (r) => money.format(r.inHand), (r) => r.inHand],
  ["total", "Total pay", (r, ot) => <b>{money.format(r.netPay + (ot ? r.otPay : 0))}</b>, (r, ot) => r.netPay + (ot ? r.otPay : 0)],
  ["daysCounted", "Days", (r) => r.daysCounted, (r) => r.daysCounted],
  ["present", "P", (r) => num(r.present), (r) => r.present],
  ["halfDays", "HD", (r) => num(r.halfDays), (r) => r.halfDays, { hideEmpty: true }],
  ["absent", "A", (r) => num(r.absent), (r) => r.absent, { hideEmpty: true }],
  ["weeklyOffs", "WO", (r) => num(r.weeklyOffs), (r) => r.weeklyOffs],
  ["woWorked", "WO worked", (r) => num(r.woWorked), (r) => r.woWorked, { hideEmpty: true }],
  ["holidays", "Holiday", (r) => num(r.holidays), (r) => r.holidays, { hideEmpty: true }],
  ["holidayWorked", "Holiday worked", (r) => num(r.holidayWorked), (r) => r.holidayWorked, { hideEmpty: true }],
  ["leaveDays", "Leave", (r) => num(r.leaveDays), (r) => r.leaveDays, { hideEmpty: true }],
  ["workedSeconds", "Worked hrs", (r) => hours(r.workedSeconds), (r) => formatDuration(r.workedSeconds)],
  ["shiftSeconds", "Shift hrs", (r) => hours(r.shiftSeconds), (r) => formatDuration(r.shiftSeconds)],
  ["overtimeSeconds", "OT hrs", (r) => hours(r.overtimeSeconds), (r) => formatDuration(r.overtimeSeconds), { hideEmpty: true }],
  ["shortSeconds", "Short hrs", (r) => hours(r.shortSeconds), (r) => formatDuration(r.shortSeconds), { hideEmpty: true }],
  ["lateDays", "Late days", (r) => (r.lateDays ? `${r.lateDays} (${formatDuration(r.lateSeconds)})` : "–"), (r) => r.lateDays, { hideEmpty: true }],
  ["perDay", "Per day", (r) => money2.format(r.perDay), (r) => r.perDay],
  ["earned", "Earned CTC", (r) => money.format(r.earned), (r) => r.earned],
  ["gross", "Gross", (r) => money.format(r.gross), (r) => r.gross],
  ["pf", "PF", (r) => num(r.pf), (r) => r.pf, { hideEmpty: true }],
  ["esic", "ESIC", (r) => num(r.esic), (r) => r.esic, { hideEmpty: true }],
  ["pt", "PT", (r) => num(r.pt), (r) => r.pt, { hideEmpty: true }],
  ["otPay", "OT pay", (r) => money.format(r.otPay), (r) => r.otPay, { hideEmpty: true }]
];
const TEXT_KEYS = new Set(["employeeId", "name", "cosecId", "shift", "department"]);

// Pay Formulas (HR's own components) go in after "Gross": one column each.
const TYPE_SIGN = { earning: "+", deduction: "−", employer: "employer", info: "info" };
function columnsWith(components) {
  if (!components.length) return COLUMNS;
  const at = COLUMNS.findIndex(([key]) => key === "gross") + 1;
  const extra = components.map((c) => [
    `f:${c.code}`,
    `${c.name} (${TYPE_SIGN[c.type] || c.type})`,
    (r) =>
      r.customErrors?.[c.code] ? (
        <span className="msp-suspect" title={r.customErrors[c.code]}>error</span>
      ) : (
        money2.format(r.custom?.[c.code] ?? 0)
      ),
    (r) => r.custom?.[c.code] ?? 0
  ]);
  return [...COLUMNS.slice(0, at), ...extra, ...COLUMNS.slice(at)];
}
const isNum = (key) => !TEXT_KEYS.has(key);
const cellClass = (key, opts) => [isNum(key) && "ps-num", opts?.stick && `msp-stick${opts.stick}`].filter(Boolean).join(" ") || undefined;

// A column with nothing in it this month (0 on every row).
const isEmptyColumn = (key, rows) => rows.every((r) => !Number(r[key]));

const CODE_CLASS = { P: "msp-p", HD: "msp-hd", A: "msp-a", WO: "msp-wo", PH: "msp-ph" };
const codeClass = (code) =>
  CODE_CLASS[code] || (code?.startsWith("PH") ? "msp-ph" : code?.startsWith("WO") ? "msp-wo" : code && code !== "–" ? "msp-l" : "");

async function exportToExcel(rows, month, includeOt, components = []) {
  const XLSX = await import("xlsx");
  const sheetColumns = columnsWith(components);
  const header = sheetColumns.map(([, label]) => label);
  const body = rows.map((r) => sheetColumns.map(([, , , excel]) => excel(r, includeOt)));
  const days = rows[0]?.days || [];
  const dayHeader = ["Code", "Name", ...days.map((d) => `${d.day} ${d.dayName.slice(0, 3)}`)];
  const dayBody = rows.map((r) => [r.employeeId, r.name, ...r.days.map((d) => d.code)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[`Month Shift Pay ${month}`], [], header, ...body]), "Pay");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([dayHeader, ...dayBody]), "Register");
  XLSX.writeFile(workbook, `Month_Shift_Pay_${month}.xlsx`);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Up to which day the month is counted: yesterday for the running month,
// "" for a month that is over.
function countedTill(month) {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  if (y !== now.getFullYear() || m !== now.getMonth() + 1) return "";
  const day = now.getDate() - 1;
  return day ? `${day} ${MONTH_NAMES[m - 1]} ${y}` : "no day yet";
}

export default function MonthShiftPay() {
  const pfs = payrollSettings(); // rates shown in the rules note
  const [month, setMonth] = useState(thisMonth);
  const [register, setRegister] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]); // Holidays page, this month's year
  // Typed % rules; left blank, the standard 50 / 50 is used: more than 50% of
  // the shift = full day (P), exactly 50% = half day (HD), less = absent.
  const [fullPct, setFullPct] = useState("50");
  const [halfPct, setHalfPct] = useState("50");
  const fullUsed = Number(fullPct) > 0 ? Number(fullPct) : 50;
  const halfUsed = Number(halfPct) > 0 ? Number(halfPct) : 50;
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
        fullShare: fullUsed / 100,
        halfShare: halfUsed / 100
      }),
    [register, employees, holidays, month, fullUsed, halfUsed]
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
  const allColumns = columnsWith(components).filter(([, , render]) => render);
  const isHidden = ([key, , , , opts]) => opts?.hideEmpty && isEmptyColumn(key, rows);
  const columns = allColumns.filter((c) => !isHidden(c));
  const hiddenEmpty = allColumns.filter(isHidden).map(([, label]) => label);
  const noShift = result.rows.length - withShift;
  const till = countedTill(month);
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
          <label htmlFor="msp-full">Full day (P) at % of shift</label>
          <div className="msp-pct">
            <input id="msp-full" type="number" min="1" max="100" placeholder="50" value={fullPct} onChange={(e) => setFullPct(e.target.value)} />
            <span>%</span>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="msp-half">Half day (HD) at % of shift</label>
          <div className="msp-pct">
            <input id="msp-half" type="number" min="1" max="100" placeholder="50" value={halfPct} onChange={(e) => setHalfPct(e.target.value)} />
            <span>%</span>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="msp-search">Employee</label>
          <input id="msp-search" type="search" placeholder="Code, name or department" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="msp-checks">
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
      </div>

      <details className="card msp-rules">
        <summary>How the pay is calculated</summary>
        <ul>
          <li>Worked hours = completed IN→OUT punch pairs for the day (same as Daily Register "Total working").</li>
          <li>Full day = shift length, less 1 hour lunch when the shift covers 13:00–15:00. No shift on the master = 8 hours.</li>
          <li>
            {fullUsed > halfUsed ? (
              <>
                Worked ≥ {fullUsed}% of full day = <b>P</b> (1 day); ≥ {halfUsed}% = <b>HD</b> (½ day); less = <b>A</b>.
              </>
            ) : (
              <>
                Worked more than {fullUsed}% of full day = <b>P</b> (1 day, full attendance); exactly {halfUsed}% = <b>HD</b> (½ day); less = <b>A</b>.
              </>
            )}
          </li>
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

      {!loading && !error && (till || (onlyShift && noShift > 0)) && (
        <div className="msp-info">
          {till && (
            <span>
              Counted till <b>{till}</b> (today is still running).
            </span>
          )}
          {onlyShift && noShift > 0 && (
            <span className="msp-info-warn">
              {noShift} of {result.rows.length} employees have no shift on the employee master, so they are not shown. Fill their shift (Employees, Edit
              details), or untick "Only employees with a shift" to see them on an 8-hour day.
            </span>
          )}
        </div>
      )}
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
            <div className="card msp-total">
              <span>Total pay</span>
              <b>₹ {money.format(totalNet + (includeOt ? totalOt : 0))}</b>
              <small>{includeOt ? "OT pay added" : "OT not added"}</small>
            </div>
          </div>
          {hiddenEmpty.length > 0 && (
            <p className="msp-hidden-note">
              Hidden, nothing in them this month: {hiddenEmpty.join(", ")} (still in Export to Excel). Click a row to see its days.
            </p>
          )}
          <div className="card card-table">
            <div className="table-scroll">
              <table className="ps-table msp-table">
                <thead>
                  <tr>
                    {columns.map(([key, label, , , opts]) => (
                      <th key={key} className={cellClass(key, opts)}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.employeeId}>
                      <tr className="msp-row" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)} title="Show day by day">
                        {columns.map(([key, , render, , opts]) => (
                          <td key={key} className={cellClass(key, opts)}>{render(r, includeOt)}</td>
                        ))}
                      </tr>
                      {open === r.employeeId && (
                        <tr className="msp-days-row">
                          <td colSpan={columns.length}>
                            <div className="msp-legend">
                              <span className="msp-p">P present</span>
                              <span className="msp-hd">HD half day</span>
                              <span className="msp-a">A absent</span>
                              <span className="msp-wo">WO weekly off</span>
                              <span className="msp-ph">PH holiday</span>
                              <span className="msp-l">Leave</span>
                              <span className="msp-legend-short">orange hours = less than the full shift</span>
                            </div>
                            <div className="msp-days">
                              {r.days.map((d) => (
                                <div key={d.day} className={`msp-day ${d.future ? "msp-future" : codeClass(d.code)}`} title={(d.future ? "Not counted yet" : "") + (d.holidayName ? `${d.holidayName} (holiday)${d.worked ? ". " : ""}` : "") + (d.worked ? `Worked ${formatDuration(d.worked)} of ${formatDuration(d.fullDay)}${d.late ? `, late ${formatDuration(d.late)}` : ""}${d.overtime ? `, OT ${formatDuration(d.overtime)}` : ""}` : "")}>
                                  <span className="msp-day-no">{d.day} {d.dayName.slice(0, 2)}</span>
                                  <span className="msp-day-code">{d.code || "·"}</span>
                                  <span className={`msp-day-hrs${d.worked && d.worked < d.fullDay ? " is-short" : ""}`}>{d.worked ? formatDuration(d.worked) : ""}</span>
                                  {d.isHoliday && <span className="msp-day-holiday" title={d.holidayName}>{d.holidayName}</span>}
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
