import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";
import { todayIso } from "./attendanceUtils";

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Unpaid Leave"];

function emptyForm() {
  return { leaveType: "", fromDate: todayIso(), toDate: todayIso(), halfDay: false, reason: "" };
}

// Inclusive calendar-day count, mirrors the server's calculation.
function dayCount(fromDate, toDate) {
  if (!fromDate || !toDate || toDate < fromDate) return 0;
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

// "YYYY-MM-DD" -> "DD-MM-YYYY", same display format as attendance.
function displayDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export default function LeaveApplication({ employee }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  async function loadLeaves() {
    setListError("");
    try {
      setLeaves(await apiGet("/leave", { employeeId: employee.employeeId }));
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.employeeId]);

  function update(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Half day is a single date: keep To in step with From.
      if (next.halfDay && (field === "fromDate" || field === "halfDay")) next.toDate = next.fromDate;
      return next;
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.leaveType) return setError("Select a leave type.");
    if (form.toDate < form.fromDate) return setError("To date cannot be before from date.");
    if (!form.reason.trim()) return setError("Enter a reason for your leave.");

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await apiPost("/leave", {
        employeeId: employee.employeeId,
        name: employee.name,
        ...form
      });
      setForm(emptyForm());
      setSuccess("Leave application submitted. Status: Pending approval.");
      loadLeaves();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const days = form.halfDay ? 0.5 : dayCount(form.fromDate, form.toDate);

  return (
    <div className="portal portal-signed-in">
      <section className="log-section">
        <h2 className="log-heading">Leave application</h2>

        <form className="leave-form" onSubmit={handleSubmit} noValidate>
          <div className="leave-grid">
            <div className="field">
              <label className="field-label" htmlFor="leave-type">
                Leave type
              </label>
              <select
                id="leave-type"
                className="field-input"
                value={form.leaveType}
                onChange={(e) => update("leaveType", e.target.value)}
              >
                <option value="">Select leave type</option>
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <label className="leave-halfday">
              <input
                type="checkbox"
                checked={form.halfDay}
                onChange={(e) => update("halfDay", e.target.checked)}
              />
              Half day
            </label>

            <div className="field">
              <label className="field-label" htmlFor="leave-from">
                From date
              </label>
              <input
                id="leave-from"
                type="date"
                className="field-input"
                value={form.fromDate}
                onChange={(e) => update("fromDate", e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="leave-to">
                To date
              </label>
              <input
                id="leave-to"
                type="date"
                className="field-input"
                value={form.toDate}
                min={form.fromDate}
                disabled={form.halfDay}
                onChange={(e) => update("toDate", e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="leave-reason">
              Reason
            </label>
            <textarea
              id="leave-reason"
              className="field-input leave-reason"
              rows={4}
              maxLength={500}
              placeholder="Briefly explain the reason for your leave"
              value={form.reason}
              onChange={(e) => update("reason", e.target.value)}
            />
          </div>

          {error && (
            <div className="scan-denied leave-message" role="alert">
              <span className="denied-dot" aria-hidden="true" />
              {error}
            </div>
          )}
          {success && (
            <div className="leave-success leave-message" role="status">
              {success}
            </div>
          )}

          <div className="leave-actions">
            <span className="leave-days">
              Total: <strong>{days}</strong> {days === 1 ? "day" : "days"}
            </span>
            <button type="submit" className="btn upload-btn leave-submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Apply for leave"}
            </button>
          </div>
        </form>
      </section>

      <section className="log-section leave-history">
        <h2 className="log-heading">My applications</h2>

        {loading && <p className="loading-note">Loading applications…</p>}
        {listError && (
          <div className="scan-denied" role="alert">
            <span className="denied-dot" aria-hidden="true" />
            {listError}
          </div>
        )}
        {!loading && !listError && leaves.length === 0 && (
          <p className="empty-note">You haven't applied for any leave yet.</p>
        )}

        {!loading && !listError && leaves.length > 0 && (
          <div className="log-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave._id}>
                    <td>{leave.leaveType}</td>
                    <td className="mono">{displayDate(leave.fromDate)}</td>
                    <td className="mono">{displayDate(leave.toDate)}</td>
                    <td className="mono">{leave.days}</td>
                    <td className="leave-reason-cell">{leave.reason}</td>
                    <td>
                      <span className={`leave-status leave-status-${leave.status.toLowerCase()}`}>
                        {leave.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
