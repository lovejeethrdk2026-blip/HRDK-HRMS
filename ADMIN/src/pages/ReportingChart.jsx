import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { REPORTING } from "../data/reportingChart";
import { isActive } from "../utils/employeeStatus";
import { SHEETS } from "./PaySheets";

// Reporting Chart: who reports to whom, as a collapsible tree. Rows come from
// data/reportingChart.js (HR's department list) until "Load Excel" reads a
// newer sheet with the same headings: Employee Code, Employee Name,
// Department Name, SUB DEPARTMENT, MANAGER. A blank MANAGER makes a top box.
// Users with paysheet.view also see each one's pay for a month from Salary
// Summary (GET /api/paysheets/1), matched on BC's Initials No., which is the
// sheet's Employee Code (Matrix ID). Clicking a box opens that employee.

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();

const SUMMARY = SHEETS.paySheet1;
// Salary Summary's amount columns: [key, label].
const PAY_COLUMNS = SUMMARY.columns.slice(SUMMARY.amountsFrom);

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rupees = (n) => `₹${money.format(n || 0)}`;

// "YYYY-MM" of `back` months before this one.
function monthBefore(back) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { fromDate: `${month}-01`, toDate: `${month}-${String(last).padStart(2, "0")}` };
}

const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

// The month a from..to range covers exactly ("YYYY-MM"), else "".
function wholeMonthOf({ fromDate, toDate }) {
  const month = fromDate.slice(0, 7);
  const full = monthRange(month);
  return fromDate === full.fromDate && toDate === full.toDate ? month : "";
}

const dmy = (iso) => iso.split("-").reverse().join("-"); // "2026-10-05" -> "05-10-2026"

// "October 2026" for a whole month, else "05-10-2026 to 20-10-2026".
const periodLabel = (range) => {
  const month = wholeMonthOf(range);
  return month ? monthLabel(month) : `${dmy(range.fromDate)} to ${dmy(range.toDate)}`;
};

// Salary Summary rows -> Map(initials -> one row, Wages and Salary rows added up).
function payByInitials(rows) {
  const map = new Map();
  for (const raw of rows) {
    const id = String(raw.initials ?? "").trim();
    if (!id) continue;
    const row = SUMMARY.mapRow(raw);
    const into = map.get(id);
    if (!into) {
      map.set(id, { ...row, types: [row.salaryType].filter(Boolean) });
      continue;
    }
    for (const [key] of PAY_COLUMNS) into[key] = Math.round(((into[key] || 0) + (row[key] || 0)) * 100) / 100;
    if (row.salaryType && !into.types.includes(row.salaryType)) into.types.push(row.salaryType);
  }
  return map;
}

// Employees from the Add Employee page (GET /api/employees) laid over the
// sheet's rows: same code updates that row, a new code is added (marked
// "added"), and anyone who has left is taken off the chart.
function withAppEmployees(rows, employees) {
  if (!employees?.length) return rows;
  const byCode = new Map(rows.map((row) => [row.code, row]));
  for (const e of employees) {
    const code = clean(e.employeeId);
    if (!code) continue;
    const initials = clean(e.initialsNo);
    // The sheet's Employee Code is the Initials No., so either may match a row.
    if (!byCode.has(code) && initials && byCode.has(initials)) {
      byCode.set(code, byCode.get(initials));
      byCode.delete(initials);
    }
    if (!isActive(e)) {
      byCode.delete(code);
      continue;
    }
    const sheet = byCode.get(code);
    const pick = (field, fallback) => clean(e[field]) || fallback || "";
    byCode.set(code, {
      code,
      name: pick("name", sheet?.name),
      department: pick("department", sheet?.department),
      subDepartment: pick("subDepartment", sheet?.subDepartment),
      manager: pick("reportingManager", sheet?.manager),
      designation: pick("designation", sheet?.designation),
      role: String(e.employeeRole ?? "").trim(),
      initials: initials || sheet?.initials || (sheet ? sheet.code : ""),
      added: !sheet
    });
  }
  return [...byCode.values()];
}

// rows -> top-level nodes; each node { ...row, boss, reports: [nodes] }, by code.
function buildTree(rows) {
  const nodes = rows.map((row) => ({ ...row, boss: null, reports: [] }));
  const byName = new Map();
  for (const node of nodes) if (!byName.has(node.name)) byName.set(node.name, node);
  const roots = [];
  for (const node of nodes) {
    const manager = node.manager && byName.get(node.manager);
    if (manager && manager !== node) {
      manager.reports.push(node);
      node.boss = manager;
    } else roots.push(node);
  }
  const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });
  const sort = (list) => {
    list.sort(byCode);
    list.forEach((node) => sort(node.reports));
    return list;
  };
  return sort(roots);
}

// Everyone under a node, at any depth.
const teamOf = (node) => node.reports.flatMap((r) => [r, ...teamOf(r)]);

// A node's Salary Summary row: by its Initials No. (the sheet's Employee
// Code is one; an app employee may have its own).
const payOf = (pay, node) => pay?.get(node.initials || node.code);

// Net pay of a node's whole team (not counting the node).
const teamNet = (node, pay) => teamOf(node).reduce((sum, r) => sum + (payOf(pay, r)?.netAmount || 0), 0);

// Net pay rolled up bottom to top: code -> own net + every report's rolled-up
// total, so a manager's figure covers their whole team at any depth.
function rollUp(roots, pay) {
  const totals = new Map();
  const walk = (node) => {
    let total = payOf(pay, node)?.netAmount || 0;
    for (const r of node.reports) total += walk(r);
    totals.set(node.code, total);
    return total;
  };
  if (pay) roots.forEach(walk);
  return totals;
}

// Does this node, or anyone under it, match the search?
function matches(node, query) {
  if (!query) return true;
  const own = `${node.name} ${node.code} ${node.department} ${node.subDepartment}`.toLowerCase();
  return own.includes(query) || node.reports.some((r) => matches(r, query));
}

async function readExcel(file) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The file has no sheets.");
  const headings = {
    code: "EMPLOYEE CODE",
    name: "EMPLOYEE NAME",
    department: "DEPARTMENT NAME",
    subDepartment: "SUB DEPARTMENT",
    manager: "MANAGER"
  };
  const columnOf = {};
  sheet.getRow(1).eachCell((cell, column) => {
    const key = Object.keys(headings).find((k) => headings[k] === clean(cell.text));
    if (key) columnOf[key] = column;
  });
  const missing = Object.keys(headings).filter((k) => !columnOf[k]);
  if (missing.length) throw new Error(`Missing columns: ${missing.map((k) => headings[k]).join(", ")}.`);
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const item = {};
    for (const key in columnOf) item[key] = clean(row.getCell(columnOf[key]).text);
    if (item.code && item.name) rows.push(item);
  });
  if (!rows.length) throw new Error("The sheet has no employees.");
  return rows;
}

function Node({ node, ctx }) {
  const { open, onToggle, query, forceOpen, pay, showPay, selected, onSelect, totals } = ctx;
  const hasTeam = node.reports.length > 0;
  const expanded = hasTeam && (forceOpen || open.has(node.code));
  const shown = node.reports.filter((r) => matches(r, query));
  const hit = query && `${node.name} ${node.code}`.toLowerCase().includes(query);
  const own = payOf(pay, node);
  const classes = ["rc-box", hasTeam && "rc-manager", hit && "rc-hit", selected === node.code && "rc-selected"];
  return (
    <li className="rc-item">
      <div className={classes.filter(Boolean).join(" ")}>
        {hasTeam && (
          <button
            type="button"
            className="rc-toggle"
            onClick={() => onToggle(node.code)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}'s team`}
          >
            {expanded ? "–" : "+"}
          </button>
        )}
        <button type="button" className="rc-text" onClick={() => onSelect(node.code)}>
          <span className="rc-name">
            {node.name}
            {node.added && <span className="rc-new">New</span>}
          </span>
          <span className="rc-meta">
            {[node.subDepartment, node.department, node.code].filter(Boolean).join(" · ")}
          </span>
        </button>
        {showPay && pay && !hasTeam && (
          <span className="rc-pay" title="Net pay this month">
            {own ? rupees(own.netAmount) : <span className="rc-nopay">No pay</span>}
          </span>
        )}
        {showPay && pay && hasTeam && (
          <span className="rc-pay rc-pay-stack" title="Total net pay: own + whole team below">
            <span className="rc-pay-total-line">{rupees(totals.get(node.code))}</span>
            <span className="rc-muted">own {own ? rupees(own.netAmount) : "–"}</span>
          </span>
        )}
        {hasTeam && (
          <span className="rc-count" title={`${teamOf(node).length} in team, ${node.reports.length} direct`}>
            {node.reports.length}
          </span>
        )}
      </div>
      {expanded && shown.length > 0 && (
        <ul className="rc-list">
          {shown.map((r) => (
            <Node key={r.code} node={r} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

// The picked employee: reporting line, pay breakup, team.
function EmployeePanel({ node, pay, showPay, range, payState, onSelect, onFocus, focused, onClose }) {
  const chain = [];
  for (let b = node.boss; b; b = b.boss) chain.unshift(b);
  const own = payOf(pay, node);
  const team = teamOf(node);
  const teamPaid = team.filter((r) => payOf(pay, r)).length;
  return (
    <aside className="card rc-panel" aria-label={`${node.name} details`}>
      <div className="rc-panel-head">
        <div>
          <h2 className="rc-panel-name">{node.name}</h2>
          <p className="rc-meta">
            {[
              node.code,
              node.initials && node.initials !== node.code && `Initials No. ${node.initials}`,
              node.designation,
              node.role,
              node.subDepartment,
              node.department
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {node.added && <p className="rc-muted">Added on the Add Employee page.</p>}
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="rc-panel-section">
        <div className="rc-label">Reports to</div>
        {chain.length ? (
          <div className="rc-chain">
            {chain.map((b, i) => (
              <span key={b.code}>
                {i > 0 && <span className="rc-chain-sep">›</span>}
                <button type="button" className="rc-link" onClick={() => onSelect(b.code)}>
                  {b.name}
                </button>
              </span>
            ))}
          </div>
        ) : node.manager ? (
          <div className="rc-warn">
            Manager “{node.manager}” is not on the chart. Fix the name on the Employees page so they move under
            the right box.
          </div>
        ) : (
          <div className="rc-muted">No one (top of the chart)</div>
        )}
      </div>

      {showPay && (
        <div className="rc-panel-section">
          <div className="rc-label">
            Pay · {periodLabel(range)}
            {own?.types.length ? ` · ${own.types.join(", ")}` : ""}
          </div>
          {payState === "loading" && <div className="rc-muted">Loading pay…</div>}
          {payState === "ready" && !own && (
            <div className="rc-muted">No Salary Summary row with Initials No. {node.initials || node.code} in this period.</div>
          )}
          {own && (
            <table className="rc-pay-table">
              <tbody>
                {PAY_COLUMNS.filter(([key]) => own[key] || ["totalEarnings", "totalDeductions", "netAmount"].includes(key)).map(
                  ([key, label]) => (
                    <tr key={key} className={["totalEarnings", "totalDeductions", "netAmount"].includes(key) ? "rc-pay-total" : undefined}>
                      <th>{label}</th>
                      <td>{rupees(own[key])}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {node.reports.length > 0 && (
        <div className="rc-panel-section">
          <div className="rc-label">
            Team · {node.reports.length} direct, {team.length} in all
          </div>
          {showPay && pay && (
            <div className="rc-team-total">
              Team net pay {rupees(teamNet(node, pay))}
              <span className="rc-muted"> · {teamPaid} of {team.length} paid</span>
              <div>Total incl. own pay {rupees(teamNet(node, pay) + (own?.netAmount || 0))}</div>
            </div>
          )}
          <ul className="rc-team">
            {node.reports.map((r) => (
              <li key={r.code}>
                <button type="button" className="rc-link" onClick={() => onSelect(r.code)}>
                  {r.name}
                </button>
                {showPay && pay && <span className="rc-muted">{payOf(pay, r) ? rupees(payOf(pay, r).netAmount) : "–"}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => onFocus(focused ? "" : node.code)}>
            {focused ? "Show whole chart" : "Show only this team"}
          </button>
        </div>
      )}
    </aside>
  );
}

export default function ReportingChart() {
  const { can } = useAuth();
  const showPay = can("paysheet.view");
  const [sheetRows, setSheetRows] = useState(REPORTING);
  const [appEmployees, setAppEmployees] = useState(null);
  const rows = useMemo(() => withAppEmployees(sheetRows, appEmployees), [sheetRows, appEmployees]);
  const [source, setSource] = useState("DEPARTMENT LIST.xlsx");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  // Pay period: a whole month (the month picker) or any from..to dates.
  const [range, setRange] = useState(() => monthRange(monthBefore(1)));
  const month = wholeMonthOf(range);
  // Until a period is picked, an empty month steps back (payroll is run late).
  const [autoMonth, setAutoMonth] = useState(true);

  // A date typed in From or To; the other end moves if they would cross.
  function setDate(end, value) {
    if (!value) return;
    setAutoMonth(false);
    setRange((prev) => {
      const next = { ...prev, [end]: value };
      if (next.fromDate > next.toDate) next[end === "fromDate" ? "toDate" : "fromDate"] = value;
      return next;
    });
  }
  const [pay, setPay] = useState(null);
  const [payState, setPayState] = useState("idle");
  const [selected, setSelected] = useState("");
  const [focus, setFocus] = useState("");
  const fileRef = useRef(null);
  const roots = useMemo(() => buildTree(rows), [rows]);
  const byCode = useMemo(() => {
    const map = new Map();
    const walk = (list) => list.forEach((n) => (map.set(n.code, n), walk(n.reports)));
    walk(roots);
    return map;
  }, [roots]);
  const totals = useMemo(() => rollUp(roots, pay), [roots, pay]);
  const managers = useMemo(() => [...byCode.values()].filter((n) => n.reports.length).map((n) => n.code), [byCode]);
  // Top boxes open at first, like HR's own chart.
  const [open, setOpen] = useState(() => new Set(buildTree(REPORTING).map((n) => n.code)));

  // Employees added on the Add Employee page join the chart.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/employees")
      .then(({ data }) => !cancelled && setAppEmployees(Array.isArray(data) ? data : []))
      .catch(() => {}); // the sheet's chart still shows
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showPay) return;
    let cancelled = false;
    setPayState("loading");
    api
      .get(`/paysheets/${SUMMARY.sheet}`, { params: range })
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        if (!list.length && autoMonth && month && month > monthBefore(4)) {
          const [y, m] = month.split("-").map(Number);
          const d = new Date(y, m - 2, 1);
          setRange(monthRange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`));
          return;
        }
        setPay(payByInitials(list));
        setPayState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setPay(null);
        setPayState("error");
        setError(`Pay not loaded: ${err.response?.data?.message || err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [showPay, range, month, autoMonth]);

  const addedCount = rows.filter((row) => row.added).length;

  const query = search.trim().toLowerCase();
  const focusNode = focus && byCode.get(focus);
  const top = focusNode ? [focusNode] : roots;
  const shown = top.filter((n) => matches(n, query));
  const picked = selected && byCode.get(selected);

  const paidCount = pay ? [...byCode.values()].filter((node) => payOf(pay, node)).length : 0;
  const totalNet = pay ? [...byCode.values()].reduce((sum, node) => sum + (payOf(pay, node)?.netAmount || 0), 0) : 0;

  function toggle(code) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  // Pick an employee: open every box above them so they show in the chart.
  function select(code) {
    setSelected(code);
    const node = byCode.get(code);
    if (focusNode && node && !teamOf(focusNode).includes(node) && node !== focusNode) setFocus("");
    setOpen((prev) => {
      const next = new Set(prev);
      for (let b = node?.boss; b; b = b.boss) next.add(b.code);
      return next;
    });
  }

  function focusTeam(code) {
    setFocus(code);
    if (code) setOpen((prev) => new Set([...prev, code]));
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const next = await readExcel(file);
      setSheetRows(next);
      setSource(file.name);
      setOpen(new Set(buildTree(next).map((n) => n.code)));
      setSelected("");
      setFocus("");
      setError("");
    } catch (err) {
      setError(err.message || "Could not read that file.");
    }
  }

  const ctx = { open, onToggle: toggle, query, forceOpen: !!query, pay, showPay, selected, onSelect: select, totals };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reporting Chart</h1>
          <p className="page-subtitle">
            {rows.length} employees · {managers.length} managers · from {source}
            {addedCount > 0 && ` + ${addedCount} added in the app`}
            {showPay && payState === "ready" && ` · ${periodLabel(range)}: ${paidCount} paid, net ${rupees(totalNet)}`}
            {showPay && payState === "loading" && " · loading pay…"}
          </p>
        </div>
        <div className="page-header-actions">
          <input
            type="search"
            className="rc-search"
            placeholder="Search name, code, department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search the chart"
          />
          {showPay && (
            <>
              <input
                type="month"
                className="rc-search rc-month"
                value={month}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setAutoMonth(false);
                  setRange(monthRange(e.target.value));
                }}
                aria-label="Pay month"
                title="Pick a whole month"
              />
              <label className="rc-date">
                <span>From</span>
                <input
                  type="date"
                  className="rc-search"
                  value={range.fromDate}
                  max={range.toDate}
                  onChange={(e) => setDate("fromDate", e.target.value)}
                  aria-label="Pay from date"
                />
              </label>
              <label className="rc-date">
                <span>To</span>
                <input
                  type="date"
                  className="rc-search"
                  value={range.toDate}
                  min={range.fromDate}
                  onChange={(e) => setDate("toDate", e.target.value)}
                  aria-label="Pay to date"
                />
              </label>
            </>
          )}
          <button type="button" className="btn" onClick={() => setOpen(new Set(managers))}>
            Expand all
          </button>
          <button type="button" className="btn" onClick={() => setOpen(new Set())}>
            Collapse all
          </button>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            Load Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      {focusNode && (
        <div className="rc-focus-note">
          Showing {focusNode.name}'s team only.{" "}
          <button type="button" className="rc-link" onClick={() => setFocus("")}>
            Show whole chart
          </button>
        </div>
      )}

      <div className={`rc-layout${picked ? " rc-with-panel" : ""}`}>
        <div className="card rc-card">
          {shown.length ? (
            <ul className="rc-list rc-root">
              {shown.map((n) => (
                <Node key={n.code} node={n} ctx={ctx} />
              ))}
            </ul>
          ) : (
            <p className="state-panel">No one matches “{search}”.</p>
          )}
        </div>
        {picked && (
          <EmployeePanel
            node={picked}
            pay={pay}
            showPay={showPay}
            range={range}
            payState={payState}
            onSelect={select}
            onFocus={focusTeam}
            focused={focus === picked.code}
            onClose={() => setSelected("")}
          />
        )}
      </div>
    </div>
  );
}
