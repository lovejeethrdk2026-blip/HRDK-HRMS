import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { isActive } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > Department change: pick the new department and sub department
// (and, if it changes too, designation / reporting manager) with one
// effective date, tick employees, and move them all at once. Each move is an
// ordinary Department transfer on the employee (shows in their Department
// changes and Full history). Server: POST /api/employees/bulk-department-transfer.
// Same look as Assign shift (sh-* styles in theme.css): step 1 where to,
// step 2 who, action bar below.

const toAppDate = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const firstOfNextMonth = () => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
};
const subNames = (dept) => (dept?.subDepartments || []).map((s) => (typeof s === "string" ? s : s.name));
const place = (dept, sub) => [dept, sub].filter(Boolean).join(" · ");

export default function BulkDepartmentChange() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ department: "", subDepartment: "", search: "" });
  const [picked, setPicked] = useState(() => new Set());
  const [target, setTarget] = useState({ department: "", subDepartment: "", designation: "", reportingManager: "" });
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

  // How many work in each department now, most first: "Now in" chips.
  const deptsNow = useMemo(() => {
    const counts = new Map();
    for (const e of active) {
      const name = e.department || "";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [active]);

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return active
      .filter((e) => !filter.department || (e.department || "-") === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [active, filter]);

  // Sub departments for the filter: the picked department's, or with "All
  // departments" every sub department there is (one name may sit in several).
  const filterSubs = filter.department
    ? subNames(departments.find((d) => d.name === filter.department))
    : [...new Set(departments.flatMap(subNames))].sort((a, b) => a.localeCompare(b));
  const targetSubs = subNames(departments.find((d) => d.name === target.department));
  const targetPlace = place(target.department, target.subDepartment);
  const targetReady = Boolean(target.department) && (!targetSubs.length || Boolean(target.subDepartment));

  // Ticked employees already in the target place are skipped by the server.
  const isThere = (e) => targetReady && e.department === target.department && (e.subDepartment || "") === target.subDepartment;
  const chosen = active.filter((e) => picked.has(e.employeeId));
  const alreadyThere = chosen.filter(isThere).length;
  const toMove = Math.max(picked.size - alreadyThere, 0);

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
  const setT = (key) => (e) =>
    setTarget((t) => ({ ...t, [key]: e.target.value, ...(key === "department" && { subDepartment: "" }) }));

  async function apply() {
    if (!picked.size) return setError("Tick at least one employee");
    if (!target.department) return setError("Pick the new department");
    if (targetSubs.length && !target.subDepartment) return setError(`Pick a sub department of ${target.department}`);
    if (!date) return setError("Pick the effective date");
    setError("");
    const extra = [target.designation && `designation ${target.designation}`, target.reportingManager && `reporting manager ${target.reportingManager}`]
      .filter(Boolean)
      .join(", ");
    const sure = await confirm({
      title: `Move ${picked.size} employee${picked.size === 1 ? "" : "s"} to ${targetPlace}?`,
      message: `From ${toAppDate(date)}${extra ? `, with ${extra}` : ""}. Each one is saved as a Department transfer${
        alreadyThere ? `; ${alreadyThere} already there will be skipped` : ""
      }.`,
      confirmLabel: "Move employees"
    });
    if (!sure) return;
    setSaving(true);
    try {
      const { data } = await api.post("/employees/bulk-department-transfer", {
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

  return (
    <div className={`sh-page ${picked.size ? "has-bar" : ""}`}>
      <div className="page-header sh-head">
        <div>
          <h1 className="page-title">Department change</h1>
          <p className="page-subtitle">Pick the new department, tick employees, and move them all at once from one date.</p>
        </div>
        <div className="sh-stats">
          <div>
            <strong>{active.length}</strong>
            <span>Active</span>
          </div>
          <div>
            <strong>{deptsNow.filter(([name]) => name).length}</strong>
            <span>Departments</span>
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
            <label htmlFor="bd-dept">New department</label>
            <select id="bd-dept" className="bi-input" value={target.department} onChange={setT("department")}>
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sh-field">
            <label htmlFor="bd-sub">Sub department</label>
            <select
              id="bd-sub"
              className="bi-input"
              value={target.subDepartment}
              disabled={!targetSubs.length}
              onChange={setT("subDepartment")}
            >
              <option value="">{targetSubs.length ? "Select…" : "None"}</option>
              {targetSubs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="sh-field">
            <label htmlFor="bd-date">Effective from</label>
            <input id="bd-date" className="bi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sh-field">
            <label htmlFor="bd-desig">New designation</label>
            <input id="bd-desig" className="bi-input" placeholder="Keep as is" value={target.designation} onChange={setT("designation")} />
          </div>
          <div className="sh-field">
            <label htmlFor="bd-mgr">Reporting manager</label>
            <input
              id="bd-mgr"
              className="bi-input"
              placeholder="Keep as is"
              value={target.reportingManager}
              onChange={setT("reportingManager")}
            />
          </div>
          <div className="sh-field">
            <label htmlFor="bd-remark">Remark</label>
            <input
              id="bd-remark"
              className="bi-input"
              value={remark}
              placeholder="e.g. Unit shifted"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card sh-step sh-list">
        <h2 className="sh-step-title">
          <span className="sh-step-no">2</span> Employees
        </h2>
        {deptsNow.length > 0 && (
          <div className="sh-chips mv-now" aria-label="Department now">
            <span className="sh-chips-label">Now in</span>
            <button
              type="button"
              className={`sh-chip ${!filter.department ? "is-on" : ""}`}
              onClick={() => setFilter((f) => ({ ...f, department: "", subDepartment: "" }))}
            >
              All <span className="sh-chip-count">{active.length}</span>
            </button>
            {deptsNow.map(([name, count]) => (
              <button
                key={name || "-"}
                type="button"
                className={`sh-chip ${filter.department === (name || "-") ? "is-on" : ""}`}
                onClick={() => setFilter((f) => ({ ...f, department: name || "-", subDepartment: "" }))}
              >
                {name || "No department"} <span className="sh-chip-count">{count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="sh-filters">
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
                  <th>Department now</th>
                  <th>After the move</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="sh-empty">
                      {active.length === 0 ? "No active employees yet." : "No employees match these filters."}
                    </td>
                  </tr>
                )}
                {shown.map((e) => {
                  const on = picked.has(e.employeeId);
                  return (
                    <tr key={e.employeeId} className={on ? "is-on" : undefined} onClick={() => toggle(e.employeeId)}>
                      <td className="sh-col-check" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" aria-label={`Tick ${e.name}`} checked={on} onChange={() => toggle(e.employeeId)} />
                      </td>
                      <td className="sh-col-id">{e.employeeId}</td>
                      <td>
                        <span className="sh-name">{e.name}</span>
                        {e.designation && <span className="sh-sub">{e.designation}</span>}
                      </td>
                      <td>
                        <span className="sh-dept">{e.department || "—"}</span>
                        {e.subDepartment && <span className="sh-sub">{e.subDepartment}</span>}
                      </td>
                      <td>
                        {!on || !targetReady ? (
                          <span className="sh-none">—</span>
                        ) : isThere(e) ? (
                          <span className="sh-none">Already there (skipped)</span>
                        ) : (
                          <>
                            <span className="sh-name mv-to">{target.department}</span>
                            <span className="sh-sub">
                              {[target.subDepartment, target.designation].filter(Boolean).join(" · ")}
                            </span>
                          </>
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
              <button type="button" className="btn btn-primary" disabled={saving || !targetReady || !toMove} onClick={apply}>
                {saving
                  ? "Saving…"
                  : !target.department
                    ? "Pick the new department first"
                    : !targetReady
                      ? "Pick the sub department"
                      : `Move ${toMove} to ${targetPlace}${date ? ` from ${toAppDate(date)}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
