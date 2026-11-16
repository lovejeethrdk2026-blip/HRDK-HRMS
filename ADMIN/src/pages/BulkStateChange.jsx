import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { salaryStructure } from "@salary";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { rupees } from "../components/SalarySplit";
import { CITIES_BY_STATE, STATES } from "../data/places";
import { isActive } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > State change: tick employees, pick the new state (and city) and
// one effective date, and move them all at once. Each move is an ordinary
// state Transfer on the employee: PT and the minimum wage follow the new state
// from that date (shows in their State changes and Full history). The list
// shows each one's PT and in-hand now and after the move.
// Server: POST /api/employees/bulk-state-transfer. Same look as Bulk increment.

const toAppDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const firstOfNextMonth = () => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
};
const subNames = (dept) => (dept?.subDepartments || []).map((s) => (typeof s === "string" ? s : s.name));
const sameState = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export default function BulkStateChange() {
  const { user, can } = useAuth();
  const seeSalary = can("employees.salary");
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ department: "", subDepartment: "", state: "", search: "" });
  const [picked, setPicked] = useState(() => new Set());
  const [target, setTarget] = useState({ state: "", city: "" });
  const [date, setDate] = useState(firstOfNextMonth);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState(null);

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

  const ownOnly = user.role !== "admin" && user.employeeScope === "department";
  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return (employees || [])
      .filter((e) => isActive(e))
      .filter((e) => !ownOnly || inMyDepartments(user, e))
      .filter((e) => !filter.department || e.department === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !filter.state || sameState(e.state, filter.state))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, filter, ownOnly, user]);

// Sub departments for the filter: the picked department's, or with "All
// departments" every sub department there is (one name may sit in several).
  const filterSubs = filter.department
    ? subNames(departments.find((d) => d.name === filter.department))
    : [...new Set(departments.flatMap(subNames))].sort((a, b) => a.localeCompare(b));

  // States the employees work in now, for the filter.
  const statesNow = [...new Set((employees || []).map((e) => e.state).filter(Boolean))].sort();

  const chosen = (employees || []).filter((e) => picked.has(e.employeeId));
  const alreadyThere = target.state ? chosen.filter((e) => sameState(e.state, target.state)).length : 0;

  // PT and in-hand in the new state (the split worked out again, same CTC).
  const after = (e) => salaryStructure({ ...e, state: target.state });

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

  async function apply() {
    if (!picked.size) return setError("Tick at least one employee");
    if (!target.state) return setError("Pick the new state");
    if (!date) return setError("Pick the effective date");
    setError("");
    const where = [target.city, target.state].filter(Boolean).join(", ");
    const sure = await confirm({
      title: `Move ${picked.size} employee${picked.size === 1 ? "" : "s"} to ${where}?`,
      message: `From ${toAppDate(date)}. PT and the minimum wage follow ${target.state} from then. Each one is saved as a state Transfer${
        alreadyThere ? `; ${alreadyThere} already in ${target.state} will be skipped` : ""
      }.`,
      confirmLabel: "Move employees"
    });
    if (!sure) return;
    setSaving(true);
    try {
      const { data } = await api.post("/employees/bulk-state-transfer", {
        employeeIds: [...picked],
        ...target,
        effectiveDate: toAppDate(date),
        remark
      });
      setResults(data.results);
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
  const cols = seeSalary ? 6 : 5;

  return (
    <div className="bi-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">State change</h1>
          <p className="page-subtitle">Pick the new state in the bar on top, tick employees below, and move them all at once.</p>
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
            Moved {done} employee{done === 1 ? "" : "s"}.
            {failed.length > 0 && ` Not moved: ${failed.length} (still ticked): `}
            {failed.map((r) => `${r.name || r.employeeId}: ${r.message}`).join("; ")}
          </span>
        </div>
      )}

      <div className="bi-layout">
        {/* ---------- top: where to (sticks under the navbar) ---------- */}
        <aside className="card bi-panel">
          <h2 className="bi-panel-title">Move to</h2>
          <div className="bi-panel-fields">
            <div className="bi-field bd-wide">
              <label htmlFor="bs-state">New state</label>
              <select
                id="bs-state"
                className="bi-input"
                value={target.state}
                onChange={(e) => setTarget({ state: e.target.value, city: "" })}
              >
                <option value="">Select…</option>
                {STATES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field bd-mid">
              <label htmlFor="bs-city">City</label>
              <select
                id="bs-city"
                className="bi-input"
                value={target.city}
                disabled={!target.state}
                onChange={(e) => setTarget((t) => ({ ...t, city: e.target.value }))}
              >
                <option value="">{target.state ? "Select…" : "Pick a state first"}</option>
                {(CITIES_BY_STATE[target.state] || []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field">
              <label htmlFor="bi-date">Effective from</label>
              <input id="bi-date" className="bi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="bi-field bi-remark">
              <label htmlFor="bs-remark">Remark</label>
              <input
                id="bs-remark"
                className="bi-input"
                value={remark}
                placeholder="e.g. New Bengaluru unit"
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
                <dt>Already there</dt>
                <dd>{alreadyThere}</dd>
              </div>
              <div className="bi-total-diff">
                <dt>To move</dt>
                <dd className="bi-up">{Math.max(picked.size - alreadyThere, 0)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn btn-primary bi-apply"
              disabled={saving || !picked.size || !target.state}
              onClick={apply}
            >
              {saving
                ? "Saving…"
                : !picked.size
                  ? "Tick employees to start"
                  : !target.state
                    ? "Pick the new state"
                    : `Move ${picked.size} to ${target.state}`}
            </button>
          </div>
        </aside>

        {/* ---------- below: who ---------- */}
        <section className="card bi-list">
          <div className="bi-list-head">
            <div className="bi-field">
              <label htmlFor="bs-f-state">State now</label>
              <select
                id="bs-f-state"
                className="bi-input"
                value={filter.state}
                onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value }))}
              >
                <option value="">All states</option>
                {statesNow.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field">
              <label htmlFor="bs-f-dept">Department</label>
              <select
                id="bs-f-dept"
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
              <label htmlFor="bs-f-sub">Sub department</label>
              <select
                id="bs-f-sub"
                className="bi-input"
                value={filter.subDepartment}
                disabled={!filterSubs.length}
                onChange={(e) => setFilter((f) => ({ ...f, subDepartment: e.target.value }))}
              >
                <option value="">All</option>
                {filterSubs.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="bi-field bi-grow">
              <label htmlFor="bs-search">Search</label>
              <input
                id="bs-search"
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
                    <th>State now</th>
                    <th>After the move</th>
                    {seeSalary && <th className="st-num">PT / In hand</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={cols} className="bi-empty">
                        {employees.length === 0
                          ? "No employees yet. Add them on Employees > Add Employee, then they show here."
                          : "No active employees match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((e) => {
                    const on = picked.has(e.employeeId);
                    const same = target.state && sameState(e.state, target.state);
                    const moving = on && target.state && !same;
                    const next = moving && seeSalary && e.monthlyCtc ? after(e) : null;
                    const stay = (e.stateHistory || []).at(-1);
                    return (
                      <tr key={e.employeeId} className={on ? "bi-on" : undefined} onClick={() => toggle(e.employeeId)}>
                        <td className="bi-check" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" aria-label={`Tick ${e.name}`} checked={on} onChange={() => toggle(e.employeeId)} />
                        </td>
                        <td className="bi-id">{e.employeeId}</td>
                        <td>
                          <span className="bi-name">{e.name}</span>
                          <span className="bi-sub">{[e.department, e.subDepartment].filter(Boolean).join(" · ") || " "}</span>
                        </td>
                        <td>
                          <span className="bi-dept">{e.state || "—"}</span>
                          {stay?.city && <span className="bi-sub">{stay.city}</span>}
                        </td>
                        <td>
                          {!on || !target.state ? (
                            <span className="bi-sub">—</span>
                          ) : same ? (
                            <span className="bi-sub">Already there (skipped)</span>
                          ) : (
                            <>
                              <span className="bi-name bi-up">{target.state}</span>
                              {target.city && <span className="bi-sub">{target.city}</span>}
                            </>
                          )}
                        </td>
                        {seeSalary && (
                          <td className="st-num">
                            <span className="bi-dept">
                              PT {rupees(e.salary?.professionalTax ?? 0)}
                              {next && ` → ${rupees(next.professionalTax)}`}
                            </span>
                            <span className="bi-sub">
                              In hand {rupees(e.salary?.inHand ?? 0)}
                              {next && ` → ${rupees(next.inHand)}`}
                            </span>
                          </td>
                        )}
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
