import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { isActive } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > Department change: tick employees, pick the new department and
// sub department (and, if it changes too, designation / reporting manager)
// with one effective date, and move them all at once. Each move is an
// ordinary Department transfer on the employee (shows in their Department
// changes and Full history). Server: POST /api/employees/bulk-department-transfer.
// Same look as Bulk increment (bi-* styles in theme.css).

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
  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return (employees || [])
      .filter((e) => isActive(e))
      .filter((e) => !ownOnly || inMyDepartments(user, e))
      .filter((e) => !filter.department || e.department === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, filter, ownOnly, user]);

  const filterSubs = subNames(departments.find((d) => d.name === filter.department));
  const targetSubs = subNames(departments.find((d) => d.name === target.department));
  const targetPlace = place(target.department, target.subDepartment);
  const targetReady = Boolean(target.department) && (!targetSubs.length || Boolean(target.subDepartment));

  // Ticked employees already in the target place are skipped by the server.
  const chosen = (employees || []).filter((e) => picked.has(e.employeeId));
  const alreadyThere = chosen.filter(
    (e) => targetReady && e.department === target.department && (e.subDepartment || "") === target.subDepartment
  ).length;

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
    <div className="bi-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Department change</h1>
          <p className="page-subtitle">
            Pick the new department in the bar on top, tick employees below, and move them all at once.
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
            <div className="bi-field bd-mid">
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
            <div className="bi-field bd-mid">
              <label htmlFor="bd-desig">New designation</label>
              <input
                id="bd-desig"
                className="bi-input"
                placeholder="Keep as is"
                value={target.designation}
                onChange={setT("designation")}
              />
            </div>
            <div className="bi-field bd-mid">
              <label htmlFor="bd-mgr">Reporting manager</label>
              <input
                id="bd-mgr"
                className="bi-input"
                placeholder="Keep as is"
                value={target.reportingManager}
                onChange={setT("reportingManager")}
              />
            </div>
            <div className="bi-field">
              <label htmlFor="bi-date">Effective from</label>
              <input id="bi-date" className="bi-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="bi-field bi-remark">
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
              disabled={saving || !picked.size || !targetReady}
              onClick={apply}
            >
              {saving
                ? "Saving…"
                : !picked.size
                  ? "Tick employees to start"
                  : !targetReady
                    ? "Pick the new department"
                    : `Move ${picked.size} to ${target.subDepartment || target.department}`}
            </button>
          </div>
        </aside>

        {/* ---------- below: who ---------- */}
        <section className="card bi-list">
          <div className="bi-list-head">
            <div className="bi-field">
              <label htmlFor="bd-f-dept">Department</label>
              <select
                id="bd-f-dept"
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
              <label htmlFor="bd-f-sub">Sub department</label>
              <select
                id="bd-f-sub"
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
              <label htmlFor="bd-search">Search</label>
              <input
                id="bd-search"
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
                    <th>Department now</th>
                    <th>After the move</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="bi-empty">
                        {employees.length === 0
                          ? "No employees yet. Add them on Employees > Add Employee, then they show here."
                          : "No active employees match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((e) => {
                    const on = picked.has(e.employeeId);
                    const same =
                      targetReady && e.department === target.department && (e.subDepartment || "") === target.subDepartment;
                    return (
                      <tr key={e.employeeId} className={on ? "bi-on" : undefined} onClick={() => toggle(e.employeeId)}>
                        <td className="bi-check" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" aria-label={`Tick ${e.name}`} checked={on} onChange={() => toggle(e.employeeId)} />
                        </td>
                        <td className="bi-id">{e.employeeId}</td>
                        <td>
                          <span className="bi-name">{e.name}</span>
                          {e.designation && <span className="bi-sub">{e.designation}</span>}
                        </td>
                        <td>
                          <span className="bi-dept">{e.department || "—"}</span>
                          {e.subDepartment && <span className="bi-sub">{e.subDepartment}</span>}
                        </td>
                        <td>
                          {!on || !targetReady ? (
                            <span className="bi-sub">—</span>
                          ) : same ? (
                            <span className="bi-sub">Already there (skipped)</span>
                          ) : (
                            <>
                              <span className="bi-name bi-up">{target.department}</span>
                              <span className="bi-sub">
                                {[target.subDepartment, target.designation].filter(Boolean).join(" · ") || " "}
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
      </div>
    </div>
  );
}
