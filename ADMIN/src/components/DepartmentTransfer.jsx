import { useEffect, useState } from "react";
import api from "../api/axios";
import { rupees } from "./SalarySplit";

// An Employees card's department transfer form. The move may come with a new
// CTC; ChangeHistory.jsx shows the pay before and after.

// "2026-08-01" (date input) -> "01-08-2026"
const fromDateInput = (value) => value.split("-").reverse().join("-");

// Department transfer form: POSTs /api/employees/:employeeId/department-transfer
// and hands the updated record to onDone (onCancel closes it). The lists are
// the Department tab's (GET /api/departments).
export function DepartmentTransferForm({ employee, onDone, onCancel }) {
  const [departments, setDepartments] = useState([]);
  const [department, setDepartment] = useState("");
  const [subDepartment, setSubDepartment] = useState("");
  const [designation, setDesignation] = useState(employee.designation || "");
  const [reportingManager, setReportingManager] = useState(employee.reportingManager || "");
  const [monthlyCtc, setMonthlyCtc] = useState(""); // "": pay stays as it is
  const [effectiveDate, setEffectiveDate] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/departments")
      .then(({ data }) => !cancelled && setDepartments(data.departments || []))
      .catch((err) => !cancelled && setError(err.response?.data?.message || err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const subs = (departments.find((d) => d.name === department)?.subDepartments || []).map((s) => s.name);
  // Every department and sub department except the one they are in now.
  const isCurrent = (name, sub) => name === employee.department && sub === (employee.subDepartment || "");
  const choices = departments.filter(
    (d) => !(d.subDepartments.length ? d.subDepartments.every((s) => isCurrent(d.name, s.name)) : isCurrent(d.name, ""))
  );

  async function submit(e) {
    e.preventDefault();
    if (!department || !effectiveDate || (subs.length && !subDepartment)) {
      setError(
        subs.length && department && !subDepartment
          ? "Pick the sub department"
          : "Pick the new department and the effective date"
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(
        `/employees/${encodeURIComponent(employee.employeeId)}/department-transfer`,
        {
          department,
          subDepartment,
          designation,
          reportingManager,
          monthlyCtc,
          effectiveDate: fromDateInput(effectiveDate),
          remark
        }
      );
      onDone(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  const now = [employee.department, employee.subDepartment].filter(Boolean).join(" · ") || "—";
  return (
    <form className="st-form" onSubmit={submit}>
      <h3 className="ss-group-title">Transfer to another department</h3>
      <p className="st-note">
        Works in {now} now, on {rupees(employee.monthlyCtc)} a month. Fill New monthly CTC only if the pay changes
        with the move; the old department and pay stay on record up to the day before the effective date.
      </p>
      <div className="st-fields">
        <label className="detail-row detail-row-edit">
          <span className="detail-label">
            New department<span className="field-required"> *</span>
          </span>
          <select
            className="detail-input"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setSubDepartment("");
              setError("");
            }}
          >
            <option value="">{departments.length ? "Select…" : "No departments yet (add in Department tab)"}</option>
            {choices.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">
            Sub department{subs.length > 0 && <span className="field-required"> *</span>}
          </span>
          <select
            className="detail-input"
            value={subDepartment}
            disabled={!subs.length}
            onChange={(e) => {
              setSubDepartment(e.target.value);
              setError("");
            }}
          >
            <option value="">{!department ? "Pick a department first" : subs.length ? "Select…" : "No sub departments"}</option>
            {subs
              .filter((name) => !isCurrent(department, name))
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">Designation</span>
          <input className="detail-input" value={designation} onChange={(e) => setDesignation(e.target.value)} />
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">Reporting manager</span>
          <input
            className="detail-input"
            value={reportingManager}
            onChange={(e) => setReportingManager(e.target.value)}
          />
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">New monthly CTC (₹)</span>
          <input
            className="detail-input"
            type="number"
            min="0"
            step="0.01"
            value={monthlyCtc}
            placeholder={`Same: ${employee.monthlyCtc ?? "—"}`}
            onChange={(e) => {
              setMonthlyCtc(e.target.value);
              setError("");
            }}
          />
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">
            Effective date<span className="field-required"> *</span>
          </span>
          <input
            className="detail-input"
            type="date"
            value={effectiveDate}
            onChange={(e) => {
              setEffectiveDate(e.target.value);
              setError("");
            }}
          />
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">Remark</span>
          <input
            className="detail-input"
            value={remark}
            placeholder="e.g. Moved to the polishing unit"
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save transfer"}
        </button>
      </div>
    </form>
  );
}
