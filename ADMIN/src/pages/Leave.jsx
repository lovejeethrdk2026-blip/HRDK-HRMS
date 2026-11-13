import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";

// Leave: apply leave for an employee, approve / reject / cancel it, see each
// employee's balance per financial year (April to March) and set up the leave
// types (CL, SL, EL, ...). Sundays are not counted as leave days. Approved
// leave shows in the Daily Register on that employee's day.
// Server: server/leave (GET/POST /api/leave/...).

const STATUSES = ["Pending", "Approved", "Rejected", "Cancelled", "All"];
const STATUS_PILL = { Pending: "pill-accent", Approved: "pill-good", Rejected: "pill-left", Cancelled: "pill-muted" };

const showDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const currentFy = () => {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};
const fyLabel = (fy) => `${fy}-${String(fy + 1).slice(2)}`;
const errorText = (err) => err.response?.data?.message || err.message;

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

export default function Leave() {
  const { can } = useAuth();
  const [tab, setTab] = useState("applications");
  const [types, setTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");

  async function loadTypes() {
    const { data } = await api.get("/leave/types");
    setTypes(data.types);
  }

  useEffect(() => {
    loadTypes().catch((err) => setError(errorText(err)));
    api
      .get("/leave/employees")
      .then(({ data }) => setEmployees(data))
      .catch((err) => setError(errorText(err)));
  }, []);

  const tabs = [
    ["applications", "Applications"],
    ["balances", "Balances"],
    ["types", "Leave types"]
  ];

  return (
    <div className="lv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave</h1>
          <p className="page-subtitle">
            Apply and approve leave, and see what each employee has left this financial year. Sundays are not counted.
          </p>
        </div>
        <div className="page-header-actions">
          <div className="segmented emp-status" role="group" aria-label="Leave view">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? "active" : undefined}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {tab === "applications" && <Applications types={types} employees={employees} can={can} />}
      {tab === "balances" && <Balances employees={employees} can={can} />}
      {tab === "types" && <LeaveTypes types={types} onSaved={setTypes} can={can} />}
    </div>
  );
}

// ---------- Applications ----------

function Applications({ types, employees, can }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState("Pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/leave/applications", { params: { status } });
      setRows(data);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const typeName = (code) => types.find((t) => t.code === code)?.name || code;
  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.employeeId.includes(q) || r.department.toLowerCase().includes(q)
  );

  async function act(row, action) {
    const labels = { Approved: "Approve", Rejected: "Reject", cancel: "Cancel" };
    const sure = await confirm({
      title: `${labels[action]} ${row.type} for ${row.name}?`,
      message: `${showDate(row.fromDate)}${row.toDate !== row.fromDate ? ` to ${showDate(row.toDate)}` : ""}, ${row.days} day${
        row.days === 1 ? "" : "s"
      }.${action === "cancel" && row.status === "Approved" ? " The days go back to the balance and leave the Daily Register." : ""}`,
      confirmLabel: labels[action],
      danger: action !== "Approved"
    });
    if (!sure) return;
    setBusy(row._id);
    try {
      if (action === "cancel") await api.post(`/leave/applications/${row._id}/cancel`);
      else await api.post(`/leave/applications/${row._id}/decision`, { status: action });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card">
      <div className="filters">
        <div className="field-group">
          <label htmlFor="lv-status">Status</label>
          <select id="lv-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="lv-search">Search Employee</label>
          <input id="lv-search" placeholder="Name, ID or department" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {can("leave.apply") && (
          <button type="button" className="btn btn-primary lv-apply-btn" onClick={() => setApplying(true)}>
            + Apply leave
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!rows ? (
        <Loader text="Loading leave…" />
      ) : !shown.length ? (
        <p className="state-panel">No {status === "All" ? "" : status.toLowerCase()} leave applications.</p>
      ) : (
        <div className="table-scroll">
          <table className="people-table lv-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Leave</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Applied / decided by</th>
                {can("leave.approve") && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row._id}>
                  <td>
                    <div className="lv-who">{row.name}</div>
                    <div className="lv-sub">{row.employeeId}</div>
                  </td>
                  <td>
                    {row.department || "–"}
                    {row.section && <div className="lv-sub">{row.section}</div>}
                  </td>
                  <td title={typeName(row.type)}>
                    <span className="lv-code">{row.type}</span>
                    {row.halfDay && <span className="lv-sub"> half day</span>}
                  </td>
                  <td className="lv-nowrap">
                    {showDate(row.fromDate)}
                    {row.toDate !== row.fromDate && <> – {showDate(row.toDate)}</>}
                  </td>
                  <td>{row.days}</td>
                  <td className="lv-reason">
                    {row.reason}
                    {row.remarks && <div className="lv-sub">Remark: {row.remarks}</div>}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[row.status] || ""}`}>{row.status}</span>
                  </td>
                  <td className="lv-sub">
                    {row.appliedBy || "–"}
                    {row.decidedBy && <> / {row.decidedBy}</>}
                  </td>
                  {can("leave.approve") && (
                    <td className="lv-actions">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {applying && (
        <ApplyDialog
          types={types.filter((t) => t.active)}
          employees={employees}
          onClose={() => setApplying(false)}
          onSaved={() => {
            setApplying(false);
            if (status !== "Pending" && status !== "All") setStatus("Pending");
            else load();
          }}
        />
      )}
    </div>
  );
}

function ApplyDialog({ types, employees, onClose, onSaved }) {
  const [form, setForm] = useState({
    employee: "",
    type: types[0]?.code || "",
    fromDate: todayIso(),
    toDate: todayIso(),
    halfDay: false,
    reason: ""
  });
  const [balance, setBalance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // "10395 — RAMESH KUMAR" (datalist value) -> the employee
  const employee = useMemo(() => {
    const id = form.employee.split("—")[0].trim();
    return employees.find((e) => e.employeeId === id) || null;
  }, [form.employee, employees]);

  const fyOfFrom = form.fromDate ? (Number(form.fromDate.slice(5, 7)) >= 4 ? Number(form.fromDate.slice(0, 4)) : Number(form.fromDate.slice(0, 4)) - 1) : currentFy();

  useEffect(() => {
    setBalance(null);
    if (!employee) return;
    let cancelled = false;
    api
      .get("/leave/balances", { params: { fy: fyOfFrom } })
      .then(({ data }) => {
        if (!cancelled) setBalance(data.rows.find((r) => r.employeeId === employee.employeeId)?.balances || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [employee, fyOfFrom]);

  const toDate = form.halfDay ? form.fromDate : form.toDate;
  const days = countDays(form.fromDate, toDate, form.halfDay);
  const left = balance?.[form.type]?.left;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!employee) return setError("Pick the employee from the list");
    setSaving(true);
    setError("");
    try {
      await api.post("/leave/applications", {
        employeeId: employee.employeeId,
        type: form.type,
        fromDate: form.fromDate,
        toDate,
        halfDay: form.halfDay,
        reason: form.reason
      });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal us-user-modal" role="dialog" aria-modal="true" aria-labelledby="lv-apply-title" onSubmit={handleSubmit}>
        <button type="button" className="us-modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
          ×
        </button>
        <h2 id="lv-apply-title" className="dept-modal-title">
          Apply leave
        </h2>

        <label className="dept-modal-label" htmlFor="lv-employee">
          Employee
        </label>
        <input
          id="lv-employee"
          className="dept-modal-input"
          list="lv-employee-list"
          placeholder="Type a name or ID"
          autoFocus
          value={form.employee}
          onChange={set("employee")}
          required
        />
        <datalist id="lv-employee-list">
          {employees.map((e) => (
            <option key={e.employeeId} value={`${e.employeeId} — ${e.name}`}>
              {e.department}
            </option>
          ))}
        </datalist>
        {employee && (
          <p className="cp-note">
            {employee.department}
            {employee.section && ` · ${employee.section}`}
          </p>
        )}

        <label className="dept-modal-label" htmlFor="lv-type">
          Leave type
        </label>
        <select id="lv-type" className="dept-modal-input" value={form.type} onChange={set("type")} required>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code} — {t.name}
            </option>
          ))}
        </select>

        <div className="lv-dates">
          <div>
            <label className="dept-modal-label" htmlFor="lv-from">
              From
            </label>
            <input id="lv-from" className="dept-modal-input" type="date" value={form.fromDate} onChange={set("fromDate")} required />
          </div>
          <div>
            <label className="dept-modal-label" htmlFor="lv-to">
              To
            </label>
            <input
              id="lv-to"
              className="dept-modal-input"
              type="date"
              value={toDate}
              min={form.fromDate}
              disabled={form.halfDay}
              onChange={set("toDate")}
              required
            />
          </div>
        </div>
        <label className="lv-check">
          <input type="checkbox" checked={form.halfDay} onChange={set("halfDay")} /> Half day
        </label>

        <label className="dept-modal-label" htmlFor="lv-reason">
          Reason
        </label>
        <textarea id="lv-reason" className="dept-modal-input" rows={2} value={form.reason} onChange={set("reason")} required />

        <p className="cp-note">
          {days} day{days === 1 ? "" : "s"} (Sundays not counted)
          {left !== undefined && left !== null && (
            <>
              {" "}
              · {form.type} left in FY {fyLabel(fyOfFrom)}: <strong className={days > left ? "lv-short" : ""}>{left}</strong>
            </>
          )}
        </p>

        {error && <p className="dept-modal-error">{error}</p>}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !days}>
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </form>
    </div>
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
  const rows = (data?.rows || []).filter(
    (r) =>
      (!department || r.department === department) &&
      (!q || r.name.toLowerCase().includes(q) || r.employeeId.includes(q))
  );
  const types = (data?.types || []).filter((t) => t.active);
  const years = [currentFy() + 1, currentFy(), currentFy() - 1, currentFy() - 2];

  return (
    <div className="card">
      <div className="filters">
        <div className="field-group">
          <label htmlFor="lv-fy">Financial year</label>
          <select id="lv-fy" value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {fyLabel(y)}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="lv-dept">Department</label>
          <select id="lv-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="lv-bsearch">Search Employee</label>
          <input id="lv-bsearch" placeholder="Name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        <Loader text="Loading balances…" />
      ) : !rows.length ? (
        <p className="state-panel">No employees.</p>
      ) : (
        <>
          <p className="cp-note lv-legend">
            Each cell: <strong>left</strong> of the year's days. Hover for taken, pending and adjustment
            {can("leave.manage") ? "; click to adjust (e.g. Earned Leave carried forward)." : "."}
          </p>
          <div className="table-scroll">
            <table className="people-table lv-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  {types.map((t) => (
                    <th key={t.code} title={t.name} className="lv-num">
                      {t.code}
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
                      <div className="lv-sub">{row.employeeId}</div>
                    </td>
                    <td>
                      {row.department || "–"}
                      {row.section && <div className="lv-sub">{row.section}</div>}
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
                      return (
                        <td key={t.code} className="lv-num" title={title}>
                          {can("leave.manage") ? (
                            <button type="button" className={`lv-cell ${b.left !== null && b.left < 0 ? "lv-short" : ""}`} onClick={() => setAdjusting({ row, type: t })}>
                              {text}
                            </button>
                          ) : (
                            <span className={b.left !== null && b.left < 0 ? "lv-short" : ""}>{text}</span>
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

  async function handleSubmit(e) {
    e.preventDefault();
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal" role="dialog" aria-modal="true" aria-labelledby="lv-adj-title" onSubmit={handleSubmit}>
        <h2 id="lv-adj-title" className="dept-modal-title">
          {type.code} for {row.name}, FY {fyLabel(fy)}
        </h2>
        <p className="cp-note">
          {type.yearlyDays} a year, taken {b.used}
          {b.pending ? `, pending ${b.pending}` : ""}. The adjustment is added to the year's days (use minus to take away).
        </p>
        <label className="dept-modal-label" htmlFor="lv-adj-days">
          Adjustment (days)
        </label>
        <input id="lv-adj-days" className="dept-modal-input" type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} autoFocus required />
        <label className="dept-modal-label" htmlFor="lv-adj-note">
          Note
        </label>
        <input id="lv-adj-note" className="dept-modal-input" placeholder="e.g. carried forward from last year" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="dept-modal-error">{error}</p>}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Leave types ----------

function LeaveTypes({ types, onSaved, can }) {
  const editable = can("leave.manage");
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState({ code: "", name: "", yearlyDays: "", paid: true });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const draft = (t) => drafts[t.code] || t;
  const change = (t, key, value) => setDrafts((d) => ({ ...d, [t.code]: { ...draft(t), [key]: value } }));

  async function save(t, patch) {
    setSaving(t.code);
    setError("");
    try {
      const { data } = await api.put(`/leave/types/${t.code}`, patch);
      onSaved(data.types);
      setDrafts((d) => {
        const next = { ...d };
        delete next[t.code];
        return next;
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving("");
    }
  }

  async function add(e) {
    e.preventDefault();
    setSaving("new");
    setError("");
    try {
      const { data } = await api.post("/leave/types", { ...adding, yearlyDays: Number(adding.yearlyDays || 0) });
      onSaved(data.types);
      setAdding({ code: "", name: "", yearlyDays: "", paid: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="card">
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="table-scroll">
        <table className="people-table lv-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className="lv-num">Days a year</th>
              <th>Paid</th>
              <th>In use</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const d = draft(t);
              const dirty = d !== t;
              return (
                <tr key={t.code} className={t.active ? "" : "lv-inactive"}>
                  <td>
                    <span className="lv-code">{t.code}</span>
                  </td>
                  <td>{editable ? <input className="lv-input" value={d.name} onChange={(e) => change(t, "name", e.target.value)} /> : t.name}</td>
                  <td className="lv-num">
                    {editable ? (
                      <input
                        className="lv-input lv-input-num"
                        type="number"
                        min="0"
                        step="0.5"
                        value={d.yearlyDays}
                        onChange={(e) => change(t, "yearlyDays", e.target.value)}
                      />
                    ) : (
                      t.yearlyDays || "no limit"
                    )}
                  </td>
                  <td>
                    <input type="checkbox" checked={d.paid} disabled={!editable} onChange={(e) => change(t, "paid", e.target.checked)} aria-label="Paid" />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={t.active}
                      disabled={!editable || saving === t.code}
                      onChange={(e) => save(t, { active: e.target.checked })}
                      aria-label="In use"
                    />
                  </td>
                  {editable && (
                    <td>
                      {dirty && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={saving === t.code}
                          onClick={() => save(t, { name: d.name, yearlyDays: Number(d.yearlyDays || 0), paid: d.paid })}
                        >
                          Save
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cp-note lv-legend">
        Days a year apply to everyone for each financial year (April–March). 0 on an unpaid type means no limit. A type
        not in use can't be picked for new leave.
      </p>

      {editable && (
        <form className="filters lv-add" onSubmit={add}>
          <div className="field-group">
            <label htmlFor="lv-new-code">Code</label>
            <input id="lv-new-code" placeholder="ML" maxLength={6} value={adding.code} onChange={(e) => setAdding((a) => ({ ...a, code: e.target.value.toUpperCase() }))} required />
          </div>
          <div className="field-group">
            <label htmlFor="lv-new-name">Name</label>
            <input id="lv-new-name" placeholder="Maternity Leave" value={adding.name} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} required />
          </div>
          <div className="field-group">
            <label htmlFor="lv-new-days">Days a year</label>
            <input id="lv-new-days" type="number" min="0" step="0.5" value={adding.yearlyDays} onChange={(e) => setAdding((a) => ({ ...a, yearlyDays: e.target.value }))} />
          </div>
          <label className="lv-check">
            <input type="checkbox" checked={adding.paid} onChange={(e) => setAdding((a) => ({ ...a, paid: e.target.checked }))} /> Paid
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving === "new"}>
            + Add leave type
          </button>
        </form>
      )}
    </div>
  );
}
