import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";

// Leave: apply leave for an employee, approve / reject / cancel it, see each
// employee's balance per financial year (April to March) and set up the leave
// types. PL, CL, SL and LWP are built in (HR sets their days a year); HR can
// add more types beside them. Sundays are not counted as leave days. Approved
// leave shows in the Daily Register on that employee's day.
// Server: server/leave (GET/POST /api/leave/...).

const STATUSES = ["Pending", "Approved", "Rejected", "Cancelled", "All"];
const STATUS_PILL = { Pending: "lv-st-pending", Approved: "lv-st-approved", Rejected: "lv-st-rejected", Cancelled: "lv-st-cancelled" };
// Colour family per built-in type; added types share a neutral one.
const TYPE_TONE = { PL: "gold", CL: "teal", SL: "green", LWP: "red" };
const tone = (code) => TYPE_TONE[code] || "grey";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-11-08" -> "8 Nov 2026" (year left out when withYear is false)
const niceDate = (iso, withYear = true) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ""}`;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const currentFy = () => {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};
const fyOfIso = (iso) => (Number(iso.slice(5, 7)) >= 4 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);
const fyLabel = (fy) => `${fy}-${String(fy + 1).slice(2)}`;
const errorText = (err) => err.response?.data?.message || err.message;
const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Sundays are the weekly off; mirrors server leave/leaveDays.js.
function countDays(from, to, half) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) n += half ? 0.5 : 1;
  }
  return n;
}

// "12 Nov → 14 Nov 2026" or "8 Nov 2026"
function dateRange(from, to) {
  if (!to || to === from) return niceDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${niceDate(from, !sameYear)} → ${niceDate(to)}`;
}

// A popup: dark backdrop, card, Escape closes it.
function Modal({ title, subtitle, onClose, busy, wide, children, footer, onSubmit }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="lvm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className={`lvm ${wide ? "lvm-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lvm-title"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <header className="lvm-head">
          <div>
            <h2 id="lvm-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="lvm-close" aria-label="Close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </header>
        <div className="lvm-body">{children}</div>
        {footer && <footer className="lvm-foot">{footer}</footer>}
      </form>
    </div>
  );
}

export default function Leave() {
  const { can } = useAuth();
  const [tab, setTab] = useState("applications");
  const [types, setTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [apps, setApps] = useState(null); // every application, all statuses
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  async function loadTypes() {
    const { data } = await api.get("/leave/types");
    setTypes(data.types);
  }
  async function loadApps() {
    try {
      const { data } = await api.get("/leave/applications", { params: { status: "All" } });
      setApps(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    loadTypes().catch((err) => setError(errorText(err)));
    loadApps();
    api
      .get("/leave/employees")
      .then(({ data }) => setEmployees(Array.isArray(data) ? data : []))
      .catch((err) => setError(errorText(err)));
  }, []);

  // Top cards: what needs a decision, who is away today, this month's leave.
  const today = todayIso();
  const month = today.slice(0, 7);
  const summary = useMemo(() => {
    const list = apps || [];
    const approved = list.filter((a) => a.status === "Approved");
    return {
      pending: list.filter((a) => a.status === "Pending").length,
      awayToday: approved.filter((a) => a.fromDate <= today && a.toDate >= today),
      monthDays: approved.filter((a) => a.fromDate.slice(0, 7) === month || a.toDate.slice(0, 7) === month).reduce((s, a) => s + a.days, 0)
    };
  }, [apps, today, month]);

  const tabs = [
    ["applications", "Requests", summary.pending],
    ["balances", "Balances"],
    ["types", "Leave types"]
  ];

  return (
    <div className="lv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave</h1>
          <p className="page-subtitle">Apply and approve leave, and see what each employee has left this financial year. Sundays are not counted.</p>
        </div>
        {can("leave.apply") && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-primary" onClick={() => setApplying(true)}>
              + Apply leave
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="lv-stats">
        <button type="button" className="lv-stat lv-stat-pending" onClick={() => setTab("applications")}>
          <span>Waiting for approval</span>
          <b>{apps ? summary.pending : "–"}</b>
          <small>{summary.pending ? "Open Requests to decide" : "Nothing pending"}</small>
        </button>
        <div className="lv-stat">
          <span>On leave today</span>
          <b>{apps ? summary.awayToday.length : "–"}</b>
          <small title={summary.awayToday.map((a) => a.name).join(", ")}>
            {summary.awayToday.length ? summary.awayToday.slice(0, 3).map((a) => a.name.split(" ")[0]).join(", ") + (summary.awayToday.length > 3 ? "…" : "") : "Everyone in"}
          </small>
        </div>
        <div className="lv-stat">
          <span>Approved this month</span>
          <b>{apps ? summary.monthDays : "–"}</b>
          <small>leave days in {MONTHS[Number(month.slice(5)) - 1]}</small>
        </div>
      </div>

      <div className="lv-tabs" role="tablist" aria-label="Leave view">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : undefined} onClick={() => setTab(key)}>
            {label}
            {count ? <span className="lv-tab-count">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "applications" && <Applications apps={apps} types={types} can={can} onChanged={loadApps} onError={setError} />}
      {tab === "balances" && <Balances employees={employees} can={can} />}
      {tab === "types" && <LeaveTypes types={types} onSaved={setTypes} can={can} />}

      {applying && (
        <ApplyDialog
          types={types.filter((t) => t.active)}
          employees={employees}
          onClose={() => setApplying(false)}
          onSaved={() => {
            setApplying(false);
            setTab("applications");
            loadApps();
          }}
        />
      )}
    </div>
  );
}

// ---------- Requests ----------

function Applications({ apps, types, can, onChanged, onError }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState("Pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");

  const typeName = (code) => types.find((t) => t.code === code)?.name || code;
  const q = search.trim().toLowerCase();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, (apps || []).filter((a) => s === "All" || a.status === s).length]));
  const shown = (apps || [])
    .filter((r) => status === "All" || r.status === status)
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.employeeId.includes(q) || (r.department || "").toLowerCase().includes(q))
    .sort((a, b) => (status === "Pending" ? a.fromDate.localeCompare(b.fromDate) : b.fromDate.localeCompare(a.fromDate)));

  async function act(row, action) {
    const labels = { Approved: "Approve", Rejected: "Reject", cancel: "Cancel" };
    const sure = await confirm({
      title: `${labels[action]} ${typeName(row.type)} for ${row.name}?`,
      message: `${dateRange(row.fromDate, row.toDate)}, ${plural(row.days, "day")}.${
        action === "cancel" && row.status === "Approved" ? " The days go back to the balance and leave the Daily Register." : ""
      }`,
      confirmLabel: labels[action],
      danger: action !== "Approved"
    });
    if (!sure) return;
    setBusy(row._id);
    try {
      if (action === "cancel") await api.post(`/leave/applications/${row._id}/cancel`);
      else await api.post(`/leave/applications/${row._id}/decision`, { status: action });
      await onChanged();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="lv-panel">
      <div className="lv-toolbar">
        <div className="lv-chips" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={`lv-chip ${status === s ? "active" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s}
              <span>{apps ? counts[s] : ""}</span>
            </button>
          ))}
        </div>
        <input className="lv-search" type="search" placeholder="Search name, ID or department" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search requests" />
      </div>

      {!apps ? (
        <Loader text="Loading leave…" />
      ) : !shown.length ? (
        <div className="lv-empty">
          <b>No {status === "All" ? "" : status.toLowerCase()} requests{q ? ` for "${search.trim()}"` : ""}.</b>
          <span>{status === "Pending" ? "New leave applications show up here for approval." : "Try another status."}</span>
        </div>
      ) : (
        <ul className="lv-list">
          {shown.map((row) => (
            <li key={row._id} className="lv-item">
              <div className="lv-person">
                <span className="lv-avatar" aria-hidden="true">
                  {initials(row.name)}
                </span>
                <div>
                  <b>{row.name}</b>
                  <span>
                    {row.employeeId}
                    {row.department ? ` · ${row.department}` : ""}
                  </span>
                </div>
              </div>
              <div className="lv-what">
                <span className={`lv-type lv-tone-${tone(row.type)}`} title={typeName(row.type)}>
                  {row.type}
                </span>
                <div>
                  <b>{dateRange(row.fromDate, row.toDate)}</b>
                  <span>
                    {row.halfDay ? "Half day" : plural(row.days, "day")} · {typeName(row.type)}
                  </span>
                </div>
              </div>
              <div className="lv-why">
                {row.reason || <i>No reason given</i>}
                {row.remarks && <span>Remark: {row.remarks}</span>}
                <span className="lv-by">
                  Applied by {row.appliedBy || "–"}
                  {row.decidedBy && ` · ${row.status.toLowerCase()} by ${row.decidedBy}`}
                </span>
              </div>
              <div className="lv-act">
                <span className={`lv-status ${STATUS_PILL[row.status] || ""}`}>{row.status}</span>
                {can("leave.approve") && (
                  <div className="lv-buttons">
                    {row.status === "Pending" && (
                      <>
                        <button type="button" className="btn btn-sm btn-primary" disabled={busy === row._id} onClick={() => act(row, "Approved")}>
                          Approve
                        </button>
                        <button type="button" className="btn btn-sm" disabled={busy === row._id} onClick={() => act(row, "Rejected")}>
                          Reject
                        </button>
                      </>
                    )}
                    {["Pending", "Approved"].includes(row.status) && (
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy === row._id} onClick={() => act(row, "cancel")}>
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Apply leave popup ----------

// Type-ahead employee picker: name, ID or department; arrow keys + Enter.
function EmployeePicker({ employees, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (q
        ? employees.filter((e) => e.name.toLowerCase().includes(q) || String(e.employeeId).includes(q) || (e.department || "").toLowerCase().includes(q))
        : employees
      ).slice(0, 8),
    [employees, q]
  );

  if (value) {
    return (
      <div className="lvm-picked">
        <span className="lv-avatar" aria-hidden="true">
          {initials(value.name)}
        </span>
        <div>
          <b>{value.name}</b>
          <span>
            {value.employeeId}
            {value.department ? ` · ${value.department}` : ""}
            {value.section ? ` · ${value.section}` : ""}
          </span>
        </div>
        <button
          type="button"
          className="lvm-link"
          onClick={() => {
            onChange(null);
            setTimeout(() => input.current?.focus(), 0);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const pick = (e) => {
    onChange(e);
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="lvm-combo">
      <input
        ref={input}
        id="lvm-employee"
        autoFocus
        autoComplete="off"
        placeholder="Type a name, ID or department"
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls="lvm-employee-list"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          }
        }}
      />
      {open && (
        <ul id="lvm-employee-list" className="lvm-options" role="listbox">
          {matches.length ? (
            matches.map((e, i) => (
              <li
                key={e.employeeId}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(e);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <b>{e.name}</b>
                <span>
                  {e.employeeId}
                  {e.department ? ` · ${e.department}` : ""}
                </span>
              </li>
            ))
          ) : (
            <li className="lvm-none">No employee matches "{query}"</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ApplyDialog({ types, employees, onClose, onSaved }) {
  const [employee, setEmployee] = useState(null);
  const [type, setType] = useState(types[0]?.code || "");
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDateRaw, setToDate] = useState(todayIso());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [balance, setBalance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fy = fromDate ? fyOfIso(fromDate) : currentFy();
  useEffect(() => {
    setBalance(null);
    if (!employee) return;
    let cancelled = false;
    api
      .get("/leave/balances", { params: { fy } })
      .then(({ data }) => !cancelled && setBalance(data.rows.find((r) => r.employeeId === employee.employeeId)?.balances || {}))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [employee, fy]);

  const toDate = halfDay ? fromDate : toDateRaw < fromDate ? fromDate : toDateRaw;
  const days = countDays(fromDate, toDate, halfDay);
  const picked = types.find((t) => t.code === type);
  const left = balance?.[type]?.left;
  const short = left !== undefined && left !== null && days > left;

  async function submit() {
    if (!employee) return setError("Pick the employee first");
    if (!days) return setError("The dates cover only Sundays. Pick a working day.");
    if (!reason.trim()) return setError("Write a short reason");
    setSaving(true);
    setError("");
    try {
      await api.post("/leave/applications", { employeeId: employee.employeeId, type, fromDate, toDate, halfDay, reason: reason.trim() });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Apply leave"
      subtitle="For an employee. It waits as Pending until someone approves it."
      onClose={onClose}
      busy={saving}
      wide
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !employee || !days}>
            {saving ? "Applying…" : `Apply ${days ? plural(days, "day") : "leave"}`}
          </button>
        </>
      }
    >
      <div className="lvm-step">
        <label htmlFor="lvm-employee">Employee</label>
        <EmployeePicker employees={employees} value={employee} onChange={setEmployee} />
      </div>

      <div className="lvm-step">
        <span className="lvm-label">Leave type</span>
        <div className="lvm-types" role="radiogroup" aria-label="Leave type">
          {types.map((t) => {
            const b = balance?.[t.code];
            return (
              <button
                key={t.code}
                type="button"
                role="radio"
                aria-checked={type === t.code}
                className={`lvm-type lv-tone-${tone(t.code)} ${type === t.code ? "active" : ""}`}
                onClick={() => setType(t.code)}
              >
                <b>{t.code}</b>
                <span>{t.name}</span>
                <small>{!employee ? (t.yearlyDays ? `${t.yearlyDays} a year` : t.paid ? "" : "Unpaid") : !b ? "…" : b.left === null ? "No limit" : `${b.left} left`}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lvm-step">
        <span className="lvm-label">How long</span>
        <div className="lvm-seg" role="group" aria-label="Full or half day">
          <button type="button" className={!halfDay ? "active" : undefined} aria-pressed={!halfDay} onClick={() => setHalfDay(false)}>
            Full days
          </button>
          <button type="button" className={halfDay ? "active" : undefined} aria-pressed={halfDay} onClick={() => setHalfDay(true)}>
            Half day
          </button>
        </div>
        <div className="lvm-dates">
          <label>
            {halfDay ? "Date" : "From"}
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          </label>
          {!halfDay && (
            <label>
              To
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} required />
            </label>
          )}
        </div>
      </div>

      <div className="lvm-step">
        <label htmlFor="lvm-reason">Reason</label>
        <textarea id="lvm-reason" rows={2} placeholder="e.g. Family function, fever" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      <div className={`lvm-summary ${short ? "is-short" : ""}`} aria-live="polite">
        <div>
          <span>Leave</span>
          <b>{days ? plural(days, "day") : "–"}</b>
          <small>{dateRange(fromDate, toDate)} · Sundays not counted</small>
        </div>
        {employee && left !== undefined && left !== null && (
          <div>
            <span>{picked?.code} balance FY {fyLabel(fy)}</span>
            <b>
              {left} → {Math.round((left - days) * 10) / 10}
            </b>
            <small>{short ? "Not enough left: approve as LWP or adjust the balance" : "after this leave"}</small>
          </div>
        )}
      </div>

      {error && (
        <p className="lvm-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

// ---------- Balances ----------

function Balances({ employees, can }) {
  const [fy, setFy] = useState(currentFy);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState(null); // { row, type }

  async function load() {
    try {
      const { data } = await api.get("/leave/balances", { params: { fy } });
      setData(data);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))].sort();
  const q = search.trim().toLowerCase();
  const rows = (data?.rows || []).filter((r) => (!department || r.department === department) && (!q || r.name.toLowerCase().includes(q) || r.employeeId.includes(q)));
  const types = (data?.types || []).filter((t) => t.active);
  const years = [currentFy() + 1, currentFy(), currentFy() - 1, currentFy() - 2];

  return (
    <div className="lv-panel">
      <div className="lv-toolbar">
        <div className="lv-filters">
          <label>
            Financial year
            <select value={fy} onChange={(e) => setFy(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {fyLabel(y)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <input className="lv-search" type="search" placeholder="Search name or ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        <Loader text="Loading balances…" />
      ) : !rows.length ? (
        <div className="lv-empty">
          <b>No employees match.</b>
        </div>
      ) : (
        <>
          <p className="lv-hint">
            Each cell shows days <b>left</b> of the year's quota. Hover for taken, pending and adjustment
            {can("leave.manage") ? "; click a cell to adjust it (e.g. PL carried forward)." : "."}
          </p>
          <div className="table-scroll">
            <table className="people-table lv-table lv-balances">
              <thead>
                <tr>
                  <th>Employee</th>
                  {types.map((t) => (
                    <th key={t.code} title={t.name} className="lv-num">
                      <span className={`lv-type lv-tone-${tone(t.code)}`}>{t.code}</span>
                      <div className="lv-sub">{t.yearlyDays ? `${t.yearlyDays}/yr` : "no limit"}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td>
                      <div className="lv-who">{row.name}</div>
                      <div className="lv-sub">
                        {row.employeeId}
                        {row.department ? ` · ${row.department}` : ""}
                      </div>
                    </td>
                    {types.map((t) => {
                      const b = row.balances[t.code];
                      const title = [
                        `${t.name}: ${b.quota} a year`,
                        b.adjust ? `adjustment ${b.adjust > 0 ? "+" : ""}${b.adjust}${b.note ? ` (${b.note})` : ""}` : "",
                        `taken ${b.used}`,
                        b.pending ? `pending ${b.pending}` : ""
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      const text = b.left === null ? b.used || "–" : b.left;
                      const low = b.left !== null && b.left < 0;
                      return (
                        <td key={t.code} className="lv-num" title={title}>
                          {can("leave.manage") ? (
                            <button type="button" className={`lv-cell ${low ? "lv-short" : ""}`} onClick={() => setAdjusting({ row, type: t })}>
                              {text}
                            </button>
                          ) : (
                            <span className={low ? "lv-short" : ""}>{text}</span>
                          )}
                          {(b.pending > 0 || b.adjust !== 0) && (
                            <div className="lv-sub">
                              {b.pending > 0 && `${b.pending} pending`}
                              {b.pending > 0 && b.adjust !== 0 && " · "}
                              {b.adjust !== 0 && `${b.adjust > 0 ? "+" : ""}${b.adjust} adj`}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adjusting && (
        <AdjustDialog
          fy={fy}
          {...adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AdjustDialog({ fy, row, type, onClose, onSaved }) {
  const b = row.balances[type.code];
  const [days, setDays] = useState(String(b.adjust || 0));
  const [note, setNote] = useState(b.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const after = (Number(b.quota) || 0) + (Number(days) || 0) - (Number(b.used) || 0);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await api.put("/leave/adjustments", { employeeId: row.employeeId, fy, type: type.code, days: Number(days), note });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Adjust ${type.code} for ${row.name}`}
      subtitle={`FY ${fyLabel(fy)} · ${type.yearlyDays} a year, taken ${b.used}${b.pending ? `, pending ${b.pending}` : ""}`}
      onClose={onClose}
      busy={saving}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </>
      }
    >
      <div className="lvm-step">
        <label htmlFor="lvm-adj-days">Extra days (use minus to take away)</label>
        <input id="lvm-adj-days" type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} autoFocus required />
      </div>
      <div className="lvm-step">
        <label htmlFor="lvm-adj-note">Note</label>
        <input id="lvm-adj-note" placeholder="e.g. carried forward from last year" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="lvm-summary">
        <div>
          <span>Left after this</span>
          <b>{Math.round(after * 10) / 10} days</b>
          <small>
            {b.quota} a year {Number(days) >= 0 ? "+" : "−"} {Math.abs(Number(days) || 0)} adjustment − {b.used} taken
          </small>
        </div>
      </div>
      {error && (
        <p className="lvm-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

// ---------- Leave types ----------

// PL, CL, SL and LWP are built in: HR sets their days a year. Types HR adds
// can also be renamed, made paid / unpaid and switched off.
function LeaveTypes({ types, onSaved, can }) {
  const editable = can("leave.manage");
  const [drafts, setDrafts] = useState({}); // code -> { name, yearlyDays, paid }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [adding, setAdding] = useState(false);

  const draft = (t) => drafts[t.code] || { name: t.name, yearlyDays: t.yearlyDays, paid: t.paid };
  const change = (t, key, value) => setDrafts((d) => ({ ...d, [t.code]: { ...draft(t), [key]: value } }));
  const dirty = (t) => {
    const d = drafts[t.code];
    return d && (Number(d.yearlyDays) !== t.yearlyDays || d.name !== t.name || d.paid !== t.paid);
  };

  async function save(t, patch) {
    setSaving(t.code);
    setError("");
    setSavedCode("");
    try {
      const { data } = await api.put(`/leave/types/${t.code}`, patch);
      onSaved(data.types);
      setDrafts((d) => {
        const next = { ...d };
        delete next[t.code];
        return next;
      });
      setSavedCode(t.code);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving("");
    }
  }

  const saveDraft = (t) => {
    const d = draft(t);
    save(t, t.fixed ? { yearlyDays: Number(d.yearlyDays || 0) } : { name: d.name.trim(), yearlyDays: Number(d.yearlyDays || 0), paid: d.paid });
  };

  return (
    <div className="lv-panel">
      <div className="lv-toolbar">
        <p className="lv-hint lv-hint-flat">Days a year apply to every employee for each financial year (April–March). Changes show in Balances straight away.</p>
        {editable && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add leave type
          </button>
        )}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="lv-type-grid">
        {types.map((t) => {
          const d = draft(t);
          const unlimited = t.code === "LWP";
          return (
            <article key={t.code} className={`lv-type-card ${t.active ? "" : "is-off"}`}>
              <header>
                <span className={`lv-type lv-type-lg lv-tone-${tone(t.code)}`}>{t.code}</span>
                {t.fixed ? <span className="lv-tag">Built in</span> : <span className="lv-tag lv-tag-own">Added by HR</span>}
              </header>
              {editable && !t.fixed ? (
                <input className="lv-type-name-input" aria-label={`${t.code} name`} value={d.name} onChange={(e) => change(t, "name", e.target.value)} />
              ) : (
                <h3>{t.name}</h3>
              )}
              <p className="lv-type-pay">{t.paid ? "Paid leave" : "Unpaid: salary is cut for these days"}</p>

              <div className="lv-type-days">
                {unlimited ? (
                  <b>No limit</b>
                ) : editable ? (
                  <label>
                    <input
                      type="number"
                      min="0"
                      max="366"
                      step="0.5"
                      aria-label={`${t.name} days a year`}
                      value={d.yearlyDays}
                      onChange={(e) => change(t, "yearlyDays", e.target.value)}
                    />
                    <span>days a year</span>
                  </label>
                ) : (
                  <b>{t.yearlyDays} days a year</b>
                )}
              </div>

              {editable && !t.fixed && (
                <div className="lv-type-switches">
                  <label>
                    <input type="checkbox" checked={d.paid} onChange={(e) => change(t, "paid", e.target.checked)} /> Paid
                  </label>
                  <label>
                    <input type="checkbox" checked={t.active} disabled={saving === t.code} onChange={(e) => save(t, { active: e.target.checked })} /> In use
                  </label>
                </div>
              )}

              {editable && !unlimited && (
                <footer>
                  {dirty(t) ? (
                    <button type="button" className="btn btn-sm btn-primary" disabled={saving === t.code} onClick={() => saveDraft(t)}>
                      {saving === t.code ? "Saving…" : "Save"}
                    </button>
                  ) : savedCode === t.code ? (
                    <span className="lv-saved">Saved</span>
                  ) : null}
                </footer>
              )}
            </article>
          );
        })}
      </div>

      {adding && (
        <AddTypeDialog
          existing={types.map((t) => t.code)}
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            onSaved(list);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddTypeDialog({ existing, onClose, onSaved }) {
  const [form, setForm] = useState({ code: "", name: "", yearlyDays: "", paid: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const taken = existing.includes(form.code);

  async function submit() {
    if (taken) return setError(`${form.code} already exists`);
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/leave/types", { ...form, name: form.name.trim(), yearlyDays: Number(form.yearlyDays || 0) });
      onSaved(data.types);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add leave type"
      subtitle="Beside PL, CL, SL and LWP, e.g. Maternity Leave or Comp-off."
      onClose={onClose}
      busy={saving}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.code || !form.name.trim() || taken}>
            {saving ? "Adding…" : "Add leave type"}
          </button>
        </>
      }
    >
      <div className="lvm-row">
        <div className="lvm-step">
          <label htmlFor="lvm-code">Short code</label>
          <input
            id="lvm-code"
            autoFocus
            maxLength={6}
            placeholder="ML"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
          />
          {taken && <small className="lvm-warn">Already used</small>}
        </div>
        <div className="lvm-step lvm-grow">
          <label htmlFor="lvm-name">Name</label>
          <input id="lvm-name" placeholder="Maternity Leave" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
      </div>
      <div className="lvm-row">
        <div className="lvm-step">
          <label htmlFor="lvm-days">Days a year</label>
          <input id="lvm-days" type="number" min="0" max="366" step="0.5" placeholder="0" value={form.yearlyDays} onChange={(e) => setForm({ ...form, yearlyDays: e.target.value })} />
          <small>0 on an unpaid type = no limit</small>
        </div>
        <div className="lvm-step lvm-grow">
          <span className="lvm-label">Pay</span>
          <div className="lvm-seg" role="group" aria-label="Paid or unpaid">
            <button type="button" className={form.paid ? "active" : undefined} aria-pressed={form.paid} onClick={() => setForm({ ...form, paid: true })}>
              Paid
            </button>
            <button type="button" className={!form.paid ? "active" : undefined} aria-pressed={!form.paid} onClick={() => setForm({ ...form, paid: false })}>
              Unpaid
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="lvm-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
