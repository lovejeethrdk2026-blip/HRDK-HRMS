import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import Loader from "../components/Loader";
import { useConfirm } from "../components/ConfirmDialog";
import { isActive } from "../utils/employeeStatus";
import { useLive } from "../api/live";

// Department tab: one card per department from GET /api/departments
// (server/department/department.controller.js), added on this page with
// "+ Add Department". Each card lists its sub departments as chips, added and
// deleted right there, with how many employees (GET /api/employees) work in
// each. This is the app's own list, separate from the Matrix COSEC employee
// master the Daily Register uses.

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "CASTING DEPARTMENT" -> "C"
const initial = (name) => String(name ?? "").trim().charAt(0).toUpperCase() || "?";

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// One required name field.
function NameDialog({ title, label, placeholder, submitLabel, onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(event) {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError(`${label} is required.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal-card dept-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-dialog-title"
        onSubmit={handleSubmit}
      >
        <h2 id="dept-dialog-title" className="dept-modal-title">
          {title}
        </h2>
        <label className="dept-modal-label" htmlFor="dept-dialog-name">
          {label} <span aria-hidden="true">*</span>
        </label>
        <input
          id="dept-dialog-name"
          className="dept-modal-input"
          autoFocus
          value={name}
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Departments() {
  const { can } = useAuth();
  const canEdit = can("departments.edit"); // add and delete, from Roles & Permissions
  const confirm = useConfirm();
  const [layout, setLayout] = useState("list"); // "list": one line each, "cards": the grid
  const [departments, setDepartments] = useState(null);
  const [error, setError] = useState("");
  // Employee counts by department ("" while not loaded or failed: no counts).
  const [employees, setEmployees] = useState(null);
  // "" | "department" | { sub: departmentName }. Checked with typeof: a
  // string has a built-in .sub() method, so `dialog?.sub` is never a safe test.
  const [dialog, setDialog] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/departments");
      setDepartments(data.departments);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }
  useLive(["departments"], () => load());

  useEffect(() => {
    load();
    api
      .get("/employees")
      .then(({ data }) => setEmployees(data))
      .catch(() => setEmployees(null)); // cards then show no counts
  }, []);

  // Employees on the rolls today; those who have left are not counted.
  const countIn = (department, sub) =>
    (employees || []).filter(
      (e) => isActive(e) && e.department === department && (sub == null || e.subDepartment === sub)
    ).length;
  const subTotal = (departments || []).reduce((sum, d) => sum + d.subDepartments.length, 0);

  async function addDepartment(name) {
    await api.post("/departments", { name });
    await load();
    setDialog("");
  }

  async function addSubDepartment(name) {
    await api.post(`/departments/${encodeURIComponent(dialog.sub)}/sub-departments`, { name });
    await load();
    setDialog("");
  }

  async function removeDepartment(item) {
    const n = item.subDepartments.length;
    const note = n ? ` and its ${n} sub department${n === 1 ? "" : "s"}` : "";
    const sure = await confirm({
      title: "Delete department?",
      message: `"${item.name}"${note} will be deleted.`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!sure) return;
    try {
      await api.delete(`/departments/${encodeURIComponent(item.name)}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  async function removeSubDepartment(department, sub) {
    const sure = await confirm({
      title: "Delete sub department?",
      message: `"${sub.name}" will be removed from ${department.name}.`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!sure) return;
    try {
      await api.delete(
        `/departments/${encodeURIComponent(department.name)}/sub-departments/${encodeURIComponent(sub.name)}`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  // A department's sub departments as chips, each with its employee count and
  // (for editors) its delete ×. Shared by the list and the cards.
  function subChips(department) {
    const subs = department.subDepartments;
    if (!subs.length) return <p className="dp-none">No sub departments yet.</p>;
    return (
      <ul className="dp-chips">
        {subs.map((sub) => {
          const n = countIn(department.name, sub.name);
          return (
            <li key={sub.name} className="dp-chip">
              <span>{sub.name}</span>
              {employees && n > 0 && (
                <span className="dp-chip-count" title={plural(n, "employee")}>
                  {n}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="dp-chip-x"
                  aria-label={`Delete sub department ${sub.name}`}
                  title="Delete sub department"
                  onClick={() => removeSubDepartment(department, sub)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">
            {departments
              ? `${plural(departments.length, "department")} · ${plural(subTotal, "sub department")}.`
              : "Departments and their sub departments."}
          </p>
        </div>
        <div className="page-header-actions">
          <div className="segmented emp-status" role="group" aria-label="View">
            {[
              ["list", "List"],
              ["cards", "Cards"]
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={layout === key ? "active" : undefined}
                aria-pressed={layout === key}
                onClick={() => setLayout(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setDialog("department")} disabled={!departments}>
              + Add Department
            </button>
          )}
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

      {!departments && !error && <Loader text="Loading departments…" />}

      {departments && layout === "list" && (
        <div className="card emp-list-card">
          <div className="table-scroll emp-list-scroll">
            <table className="people-table emp-list-table dp-list-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Sub departments</th>
                  <th className="st-num">Subs</th>
                  {employees && <th className="st-num">Employees</th>}
                  {canEdit && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr key={department.name} className="dp-list-row">
                    <td>
                      <span className="emp-list-who">
                        <span className="dp-icon dp-icon-sm" aria-hidden="true">
                          {initial(department.name)}
                        </span>
                        <span className="dp-list-name">{department.name}</span>
                      </span>
                    </td>
                    <td className="dp-list-subs">{subChips(department)}</td>
                    <td className="st-num">{department.subDepartments.length}</td>
                    {employees && <td className="st-num dp-list-count">{countIn(department.name)}</td>}
                    {canEdit && (
                      <td className="dp-list-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setDialog({ sub: department.name })}>
                          + Sub department
                        </button>
                        <button
                          type="button"
                          className="dp-delete"
                          aria-label={`Delete department ${department.name}`}
                          title="Delete department"
                          onClick={() => removeDepartment(department)}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {departments && layout === "cards" && (
        <div className="dp-grid">
          {departments.map((department) => {
            const subs = department.subDepartments;
            const staff = countIn(department.name);
            return (
              <article key={department.name} className="card dp-card">
                <header className="dp-head">
                  <span className="dp-icon" aria-hidden="true">
                    {initial(department.name)}
                  </span>
                  <span className="dp-who">
                    <span className="dp-name">{department.name}</span>
                    <span className="dp-meta">
                      {plural(subs.length, "sub department")}
                      {employees && ` · ${plural(staff, "employee")}`}
                    </span>
                  </span>
                  {canEdit && (
                  <button
                    type="button"
                    className="dp-delete"
                    aria-label={`Delete department ${department.name}`}
                    title="Delete department"
                    onClick={() => removeDepartment(department)}
                  >
                    <TrashIcon />
                  </button>
                  )}
                </header>

                <div className="dp-body">
                  <span className="dp-label">Sub departments</span>
                  {subChips(department)}
                </div>

                {canEdit && (
                  <button type="button" className="dp-add-sub" onClick={() => setDialog({ sub: department.name })}>
                    + Add sub department
                  </button>
                )}
              </article>
            );
          })}

          {canEdit && (
          <button type="button" className="dp-card dp-new" onClick={() => setDialog("department")}>
            <span className="dp-new-plus" aria-hidden="true">
              +
            </span>
            <span className="dp-new-text">Add department</span>
          </button>
          )}
        </div>
      )}

      {dialog === "department" && (
        <NameDialog
          title="Add Department"
          label="Department name"
          placeholder="e.g. Polish Department"
          submitLabel="Add Department"
          onSubmit={addDepartment}
          onClose={() => setDialog("")}
        />
      )}
      {typeof dialog === "object" && dialog.sub && (
        <NameDialog
          title={`Add Sub Department in ${dialog.sub}`}
          label="Sub department name"
          placeholder="e.g. Gold"
          submitLabel="Add Sub Department"
          onSubmit={addSubDepartment}
          onClose={() => setDialog("")}
        />
      )}
    </div>
  );
}
