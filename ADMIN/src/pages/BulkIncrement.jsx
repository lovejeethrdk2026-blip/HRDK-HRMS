import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { rupees } from "../components/SalarySplit";
import { isActive } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > Bulk increment: tick employees, give one raise (5%, 10%, ... or a
// rupee amount) from one effective date, and save it for all of them at once.
// Each saved raise is an ordinary Salary revision on the employee (shows in
// their Salary revisions, Payroll and Full history). Server:
// POST /api/employees/bulk-salary-revision.

const QUICK_PERCENTS = [5, 10, 15, 20];

// "YYYY-MM-DD" (date input) <-> "DD-MM-YYYY" (how the app keeps dates)
const toAppDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const firstOfNextMonth = () => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
};

const currentCtc = (employee) => {
  const pays = employee.payHistory || [];
  return pays.length ? pays.at(-1).monthlyCtc : employee.monthlyCtc;
};

// Same rule as the server: raise, then round UP to roundTo.
function newCtcOf(ctc, mode, value, roundTo) {
  if (!ctc || !Number.isFinite(value) || value === 0) return null;
  const raw = mode === "percent" ? ctc * (1 + value / 100) : ctc + value;
  return Math.ceil(raw / roundTo) * roundTo;
}

export default function BulkIncrement() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ department: "", subDepartment: "", search: "" });
  const [picked, setPicked] = useState(() => new Set()); // employeeIds
  const [mode, setMode] = useState("percent"); // "percent" or "amount"
  const [valueText, setValueText] = useState("10");
  const [roundTo, setRoundTo] = useState(1);
  const [date, setDate] = useState(firstOfNextMonth); // "YYYY-MM-DD"
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null); // last save's [{ employeeId, name, oldCtc, newCtc, ok, message }]

  async function load() {
    try {
      const { data } = await api.get("/employees");
      setEmployees(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  useEffect(() => {
    load();
    api
      .get("/departments")
      .then(({ data }) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  const value = Number(valueText);
  const ownOnly = user.role !== "admin" && user.employeeScope === "department";

  // Active employees with a CTC, narrowed by the filters.
  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return (employees || [])
      .filter((e) => isActive(e) && currentCtc(e))
      .filter((e) => !ownOnly || inMyDepartments(user, e))
      .filter((e) => !filter.department || e.department === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, filter, ownOnly, user]);

  const subDepartments = (departments.find((d) => d.name === filter.department)?.subDepartments || []).map((s) =>
    typeof s === "string" ? s : s.name
  );

  const chosen = (employees || []).filter((e) => picked.has(e.employeeId));
  const totals = chosen.reduce(
    (sum, e) => {
      const ctc = currentCtc(e) || 0;
      const next = newCtcOf(ctc, mode, value, roundTo) ?? ctc;
      return { now: sum.now + ctc, next: sum.next + next };
    },
    { now: 0, next: 0 }
  );

  const allShownPicked = shown.length > 0 && shown.every((e) => picked.has(e.employeeId));
  function toggleAll() {
    setPicked((was) => {
      const next = new Set(was);
      for (const e of shown) allShownPicked ? next.delete(e.employeeId) : next.add(e.employeeId);
      return next;
    });
  }
  function toggle(id) {
    setPicked((was) => {
      const next = new Set(was);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const valueOk = Number.isFinite(value) && value !== 0 && (mode !== "percent" || (value > -100 && value <= 500));
  const label = mode === "percent" ? `${value}%` : `${value > 0 ? "+" : ""}${rupees(value)}`;

  async function apply() {
    if (!picked.size) return setError("Tick at least one employee");
    if (!valueOk) return setError(mode === "percent" ? "Enter a % above -100 and up to 500, not 0" : "Enter an amount, not 0");
    if (!date) return setError("Pick the effective date");
    setError("");
    const sure = await confirm({
      title: `Give ${label} to ${picked.size} employee${picked.size === 1 ? "" : "s"}?`,
      message: `New CTC from ${toAppDate(date)}. Monthly cost goes from ${rupees(totals.now)} to ${rupees(
        totals.next
      )} (${totals.next >= totals.now ? "+" : ""}${rupees(totals.next - totals.now)}). Each one is saved as a Salary revision.`,
      confirmLabel: "Apply increment"
    });
    if (!sure) return;
    setSaving(true);
    try {
      const { data } = await api.post("/employees/bulk-salary-revision", {
        employeeIds: [...picked],
        mode,
        value,
        roundTo,
        effectiveDate: toAppDate(date),
        remark
      });
      setResults(data.results);
      // keep ticked only the ones that failed, so they can be fixed and tried again
      setPicked(new Set(data.results.filter((r) => !r.ok).map((r) => r.employeeId)));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  const done = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="bi-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Salary increment</h1>
          <p className="page-subtitle">
            Set the raise in the bar on top, tick employees below, and save it for all of them at once.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}
      {results && (
        <div className={failed.length ? "error-banner" : "detail-banner"} role="status">
          <span>
            Saved for {done} employee{done === 1 ? "" : "s"}.
            {failed.length > 0 && ` Not saved for ${failed.length} (still ticked): `}
            {failed.map((r) => `${r.name || r.employeeId}: ${r.message}`).join("; ")}
          </span>
        </div>
      )}

      <div className="bi-layout">
        {/* ---------- top: how much (sticks under the navbar) ---------- */}
        <aside className="card bi-panel">
          <h2 className="bi-panel-title">Increment</h2>
          <div className="bi-panel-fields">

          <div className="bi-field">
            <span className="bi-label">Increase by</span>
            <div className="bi-toggle" role="group" aria-label="Increase by">
              {[
                ["percent", "Percent %"],
                ["amount", "Amount ₹"]
              ].map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  className={mode === key ? "is-on" : undefined}
                  aria-pressed={mode === key}
                  onClick={() => setMode(key)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {mode === "percent" && (
            <div className="bi-field">
            <span className="bi-label">Quick</span>
            <div className="bi-chips" role="group" aria-label="Quick percent">
              {QUICK_PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={value === p ? "is-on" : undefined}
                  aria-pressed={value === p}
                  onClick={() => setValueText(String(p))}
                >
                  {p}%
                </button>
              ))}
            </div>
            </div>
          )}

          <div className="bi-pair">
            <div className="bi-field">
              <label htmlFor="bi-value">{mode === "percent" ? "Percent" : "₹ a month"}</label>
              <div className="bi-affix">
                <input
                  id="bi-value"
                  className="bi-input"
                  type="number"
                  step="any"
                  value={valueText}
                  onChange={(e) => setValueText(e.target.value)}
                />
                <span aria-hidden="true">{mode === "percent" ? "%" : "₹"}</span>
              </div>
            </div>
            <div className="bi-field">
              <label htmlFor="bi-round">Round up to</label>
              <select id="bi-round" className="bi-input" value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
                <option value={1}>₹1</option>
                <option value={10}>₹10</option>
                <option value={100}>₹100</option>
              </select>
            </div>
          </div>

          <div className="bi-field">
            <label htmlFor="bi-date">Effective from</label>
            <input id="bi-date" className="bi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="bi-field bi-remark">
            <label htmlFor="bi-remark">Remark</label>
            <input
              id="bi-remark"
              className="bi-input"
              value={remark}
              placeholder="e.g. Annual increment 2026"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          </div>
          <div className="bi-panel-foot">
          <dl className="bi-totals">
            <div>
              <dt>Employees</dt>
              <dd>{picked.size}</dd>
            </div>
            <div>
              <dt>Monthly CTC now</dt>
              <dd>{rupees(totals.now)}</dd>
            </div>
            <div>
              <dt>After increment</dt>
              <dd>{rupees(totals.next)}</dd>
            </div>
            <div className="bi-total-diff">
              <dt>Extra cost a month</dt>
              <dd className={totals.next >= totals.now ? "bi-up" : "bi-down"}>
                {totals.next >= totals.now ? "+" : ""}
                {rupees(totals.next - totals.now)}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className="btn btn-primary bi-apply"
            disabled={saving || !picked.size || !valueOk}
            onClick={apply}
          >
            {saving
              ? "Saving…"
              : !picked.size
                ? "Tick employees to start"
                : `Apply ${valueOk ? label : ""} to ${picked.size} employee${picked.size === 1 ? "" : "s"}`}
          </button>
          </div>
        </aside>

        {/* ---------- below: who ---------- */}
        <section className="card bi-list">
          <div className="bi-list-head">
            <div className="bi-field">
              <label htmlFor="bi-dept">Department</label>
              <select
                id="bi-dept"
                className="bi-input"
                value={filter.department}
                onChange={(e) => setFilter((f) => ({ ...f, department: e.target.value, subDepartment: "" }))}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field">
              <label htmlFor="bi-sub">Sub department</label>
              <select
                id="bi-sub"
                className="bi-input"
                value={filter.subDepartment}
                disabled={!subDepartments.length}
                onChange={(e) => setFilter((f) => ({ ...f, subDepartment: e.target.value }))}
              >
                <option value="">All</option>
                {subDepartments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field bi-grow">
              <label htmlFor="bi-search">Search</label>
              <input
                id="bi-search"
                className="bi-input"
                placeholder="Name or code"
                value={filter.search}
                onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
          </div>

          <div className="bi-list-bar">
            <span>
              {shown.length} employee{shown.length === 1 ? "" : "s"} shown
              {picked.size > 0 && (
                <>
                  {" · "}
                  <strong>{picked.size} ticked</strong>
                </>
              )}
            </span>
            {picked.size > 0 && (
              <button type="button" className="bi-link" onClick={() => setPicked(new Set())}>
                Clear selection
              </button>
            )}
          </div>

          {!employees && !error && <Loader text="Loading employees…" />}
          {employees && (
            <div className="table-scroll bi-scroll">
              <table className="people-table bi-table">
                <thead>
                  <tr>
                    <th className="bi-check">
                      <input
                        type="checkbox"
                        aria-label="Tick every employee shown"
                        checked={allShownPicked}
                        onChange={toggleAll}
                        disabled={!shown.length}
                      />
                    </th>
                    <th>ID</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th className="st-num">Monthly CTC</th>
                    <th className="st-num">New CTC</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="bi-empty">
                        {employees.length === 0
                          ? "No employees yet. Add them on Employees > Add Employee (with a monthly CTC), then they show here."
                          : "No active employees with a CTC match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((e) => {
                    const ctc = currentCtc(e);
                    const on = picked.has(e.employeeId);
                    const next = on ? newCtcOf(ctc, mode, value, roundTo) : null;
                    return (
                      <tr key={e.employeeId} className={on ? "bi-on" : undefined} onClick={() => toggle(e.employeeId)}>
                        <td className="bi-check" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Tick ${e.name}`}
                            checked={on}
                            onChange={() => toggle(e.employeeId)}
                          />
                        </td>
                        <td className="bi-id">
                          {e.employeeId}
                          {e.initialsNo && e.initialsNo !== e.employeeId && (
                            <span className="bi-sub">Matrix {e.initialsNo}</span>
                          )}
                        </td>
                        <td>
                          <span className="bi-name">{e.name}</span>
                          {e.designation && <span className="bi-sub">{e.designation}</span>}
                        </td>
                        <td>
                          <span className="bi-dept">{e.department || "—"}</span>
                          {e.subDepartment && <span className="bi-sub">{e.subDepartment}</span>}
                        </td>
                        <td className="st-num">{rupees(ctc)}</td>
                        <td className="st-num">
                          {next ? (
                            <>
                              <span className="bi-name">{rupees(next)}</span>
                              <span className={`bi-sub ${next >= ctc ? "bi-up" : "bi-down"}`}>
                                {next >= ctc ? "+" : ""}
                                {rupees(next - ctc)}
                              </span>
                            </>
                          ) : (
                            <span className="bi-sub">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
