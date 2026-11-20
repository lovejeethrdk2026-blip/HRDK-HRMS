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

// Employees > State change: pick the new state (and city) and one effective
// date, tick employees, and move them all at once. Each move is an ordinary
// state Transfer on the employee: PT and the minimum wage follow the new state
// from that date (shows in their State changes and Full history). The list
// shows each one's PT and in-hand now and after the move.
// Server: POST /api/employees/bulk-state-transfer. Same look as Assign shift
// (sh-* styles in theme.css): step 1 where to, step 2 who, action bar below.

const toAppDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const firstOfNextMonth = () => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
};
const subNames = (dept) => (dept?.subDepartments || []).map((s) => (typeof s === "string" ? s : s.name));
const norm = (s) => String(s ?? "").trim().toLowerCase();
const sameState = (a, b) => norm(a) === norm(b);

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
  const active = useMemo(
    () => (employees || []).filter((e) => isActive(e)).filter((e) => !ownOnly || inMyDepartments(user, e)),
    [employees, ownOnly, user]
  );

  // Where people work now, most first: "Now in" chips.
  const statesNow = useMemo(() => {
    const counts = new Map();
    for (const e of active) {
      const name = e.state || "";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [active]);

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return active
      .filter((e) => !filter.state || sameState(e.state, filter.state === "-" ? "" : filter.state))
      .filter((e) => !filter.department || e.department === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [active, filter]);

  const filterSubs = filter.department
    ? subNames(departments.find((d) => d.name === filter.department))
    : [...new Set(departments.flatMap(subNames))].sort((a, b) => a.localeCompare(b));

  const chosen = active.filter((e) => picked.has(e.employeeId));
  const alreadyThere = target.state ? chosen.filter((e) => sameState(e.state, target.state)).length : 0;
  const toMove = Math.max(picked.size - alreadyThere, 0);
  const where = [target.city, target.state].filter(Boolean).join(", ");

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
    <div className={`sh-page ${picked.size ? "has-bar" : ""}`}>
      <div className="page-header sh-head">
        <div>
          <h1 className="page-title">State change</h1>
          <p className="page-subtitle">Pick the new state, tick employees, and move them all at once from one date.</p>
        </div>
        <div className="sh-stats">
          <div>
            <strong>{active.length}</strong>
            <span>Active</span>
          </div>
          <div>
            <strong>{statesNow.filter(([name]) => name).length}</strong>
            <span>States</span>
          </div>
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

      <section className="card sh-step">
        <h2 className="sh-step-title">
          <span className="sh-step-no">1</span> Move to
        </h2>
        <div className="mv-fields">
          <div className="sh-field">
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
          <div className="sh-field">
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
          <div className="sh-field">
            <label htmlFor="bs-date">Effective from</label>
            <input id="bs-date" className="bi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sh-field mv-wide">
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
      </section>

      <section className="card sh-step sh-list">
        <h2 className="sh-step-title">
          <span className="sh-step-no">2</span> Employees
        </h2>
        {statesNow.length > 0 && (
          <div className="sh-chips mv-now" aria-label="State now">
            <span className="sh-chips-label">Now in</span>
            <button
              type="button"
              className={`sh-chip ${!filter.state ? "is-on" : ""}`}
              onClick={() => setFilter((f) => ({ ...f, state: "" }))}
            >
              All <span className="sh-chip-count">{active.length}</span>
            </button>
            {statesNow.map(([name, count]) => (
              <button
                key={name || "-"}
                type="button"
                className={`sh-chip ${filter.state === (name || "-") ? "is-on" : ""}`}
                onClick={() => setFilter((f) => ({ ...f, state: name || "-" }))}
              >
                {name || "No state"} <span className="sh-chip-count">{count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sh-filters">
          <select
            className="bi-input"
            aria-label="Department"
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
          <select
            className="bi-input"
            aria-label="Sub department"
            value={filter.subDepartment}
            disabled={!filterSubs.length}
            onChange={(e) => setFilter((f) => ({ ...f, subDepartment: e.target.value }))}
          >
            <option value="">All sub departments</option>
            {filterSubs.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            className="bi-input sh-search"
            type="search"
            aria-label="Search"
            placeholder="Search name or code"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <div className="sh-count">
          {shown.length} employee{shown.length === 1 ? "" : "s"}
          {picked.size > 0 && <strong> · {picked.size} ticked</strong>}
        </div>

        {!employees && !error && <Loader text="Loading employees…" />}
        {employees && (
          <div className="table-scroll sh-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-col-check">
                    <input
                      type="checkbox"
                      aria-label="Tick every employee shown"
                      checked={allShownPicked}
                      onChange={toggleAll}
                      disabled={!shown.length}
                    />
                  </th>
                  <th className="sh-col-id">ID</th>
                  <th>Employee</th>
                  <th>State now</th>
                  <th>After the move</th>
                  {seeSalary && <th className="mv-num">PT / In hand</th>}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={cols} className="sh-empty">
                      {active.length === 0 ? "No active employees yet." : "No employees match these filters."}
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
                    <tr key={e.employeeId} className={on ? "is-on" : undefined} onClick={() => toggle(e.employeeId)}>
                      <td className="sh-col-check" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" aria-label={`Tick ${e.name}`} checked={on} onChange={() => toggle(e.employeeId)} />
                      </td>
                      <td className="sh-col-id">{e.employeeId}</td>
                      <td>
                        <span className="sh-name">{e.name}</span>
                        <span className="sh-sub">{[e.department, e.subDepartment].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td>
                        <span className="sh-dept">{e.state || "—"}</span>
                        {stay?.city && <span className="sh-sub">{stay.city}</span>}
                      </td>
                      <td>
                        {!on || !target.state ? (
                          <span className="sh-none">—</span>
                        ) : same ? (
                          <span className="sh-none">Already there (skipped)</span>
                        ) : (
                          <>
                            <span className="sh-name mv-to">{target.state}</span>
                            {target.city && <span className="sh-sub">{target.city}</span>}
                          </>
                        )}
                      </td>
                      {seeSalary && (
                        <td className="mv-num">
                          <span className="sh-dept">
                            PT {rupees(e.salary?.professionalTax ?? 0)}
                            {next && <span className="mv-to"> → {rupees(next.professionalTax)}</span>}
                          </span>
                          <span className="sh-sub">
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

      {picked.size > 0 && (
        <div className="sh-bar" role="region" aria-label="Selected employees">
          <div className="sh-bar-inner">
            <div className="sh-bar-count">
              <strong>{picked.size}</strong> ticked
              {alreadyThere > 0 && <span className="sh-sub"> · {alreadyThere} already there</span>}
              <button type="button" className="bi-link" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>
            <div className="sh-bar-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !target.state || !toMove}
                onClick={apply}
              >
                {saving
                  ? "Saving…"
                  : !target.state
                    ? "Pick the new state first"
                    : `Move ${toMove} to ${target.state}${date ? ` from ${toAppDate(date)}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
