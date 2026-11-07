import { useState } from "react";
import api from "../api/axios";
import { salaryStructure } from "@salary";
import { rupees } from "./SalarySplit";

// An Employees card's Salary revision form: a new monthly CTC from a date,
// with no transfer. ChangeHistory.jsx shows the pay before and after.

// "2026-08-01" (date input) -> "01-08-2026"
const fromDateInput = (value) => value.split("-").reverse().join("-");

// Same rule as the server (employee.controller.js): below this monthly CTC,
// PF and ESIC always apply.
const PF_ESIC_LIMIT = 25500;

// POSTs /api/employees/:employeeId/salary-revision and hands the updated
// record to onDone (onCancel closes it).
export function SalaryRevisionForm({ employee, onDone, onCancel }) {
  const [monthlyCtc, setMonthlyCtc] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // What the new CTC would pay in hand, in the employee's current state.
  const ctc = Number(monthlyCtc);
  const below = ctc < PF_ESIC_LIMIT;
  const preview =
    monthlyCtc !== "" && ctc > 0
      ? salaryStructure({
          monthlyCtc: ctc,
          state: employee.state,
          pfApplicable: below || employee.pfApplicable,
          esicApplicable: below || employee.esicApplicable
        })
      : null;
  const diff = preview ? preview.inHand - (employee.salary?.inHand ?? 0) : 0;

  async function submit(e) {
    e.preventDefault();
    if (!monthlyCtc || !effectiveDate) {
      setError("Fill the new monthly CTC and the effective date");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`/employees/${encodeURIComponent(employee.employeeId)}/salary-revision`, {
        monthlyCtc,
        effectiveDate: fromDateInput(effectiveDate),
        remark
      });
      onDone(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <form className="st-form" onSubmit={submit}>
      <h3 className="ss-group-title">Salary revision</h3>
      <p className="st-note">
        On {rupees(employee.monthlyCtc)} a month now ({rupees(employee.salary?.inHand)} in hand). Months before the
        effective date keep the old pay; yearly CTC becomes 12 times the new one.
      </p>
      <div className="st-fields">
        <label className="detail-row detail-row-edit">
          <span className="detail-label">
            New monthly CTC (₹)<span className="field-required"> *</span>
          </span>
          <input
            className="detail-input"
            type="number"
            min="0"
            step="0.01"
            value={monthlyCtc}
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
            placeholder="e.g. Yearly increment"
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
        <div className="detail-row">
          <span className="detail-label">New in hand</span>
          <span className="sr-preview">
            {preview ? `${rupees(preview.inHand)} (${diff >= 0 ? "+" : "−"}${rupees(Math.abs(diff))})` : "—"}
          </span>
        </div>
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
          {saving ? "Saving…" : "Save revision"}
        </button>
      </div>
    </form>
  );
}
