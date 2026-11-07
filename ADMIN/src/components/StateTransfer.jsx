import { useState } from "react";
import api from "../api/axios";
import { CITIES_BY_STATE, STATES } from "../data/places";

// An Employees card's state transfer form. ChangeHistory.jsx shows the pay
// before and after, and each month's pay in the state it was worked in.

// "2026-08-01" (date input) -> "01-08-2026"
const fromDateInput = (value) => value.split("-").reverse().join("-");

// Transfer form: POSTs /api/employees/:employeeId/transfer and hands the
// updated record to onDone (onCancel closes it).
export function TransferForm({ employee, onDone, onCancel }) {
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!state || !effectiveDate) {
      setError("Pick the new state and the effective date");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`/employees/${encodeURIComponent(employee.employeeId)}/transfer`, {
        state,
        city,
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
      <h3 className="ss-group-title">Transfer to another state</h3>
      <p className="st-note">
        Works in {employee.state || "—"} now. From the effective date, PT and the minimum wage follow the new
        state; months before it keep the old one.
      </p>
      <div className="st-fields">
        <label className="detail-row detail-row-edit">
          <span className="detail-label">
            New state<span className="field-required"> *</span>
          </span>
          <select
            className="detail-input"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setCity("");
              setError("");
            }}
          >
            <option value="">Select…</option>
            {STATES.filter((name) => name !== employee.state).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="detail-row detail-row-edit">
          <span className="detail-label">City</span>
          <select className="detail-input" value={city} disabled={!state} onChange={(e) => setCity(e.target.value)}>
            <option value="">{state ? "Select…" : "Pick a state first"}</option>
            {(CITIES_BY_STATE[state] || []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
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
            placeholder="e.g. Moved to Bengaluru office"
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

