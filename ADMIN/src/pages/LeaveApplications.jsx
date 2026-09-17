import { useEffect, useState } from "react";
import api from "../api/axios";

const STATUSES = ["Pending", "Approved", "Rejected"];

// "YYYY-MM-DD" -> "DD-MM-YYYY", same display format as attendance.
function displayDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function appliedOn(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-GB").replace(/\//g, "-");
}

// mode "all": every application with filters (Leave Application menu).
// mode "approval": pending applications with Approve / Reject (Leave Approval menu).
export default function LeaveApplications({ mode }) {
  const isApproval = mode === "approval";

  const [leaves, setLeaves] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [remarks, setRemarks] = useState({}); // leave _id -> remarks text
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  async function fetchLeaves(filters = {}) {
    setLoading(true);
    setError("");

    const effectiveEmployeeId = filters.employeeId ?? employeeId;
    const effectiveStatus = isApproval ? "Pending" : filters.status ?? status;

    try {
      const params = {};
      if (effectiveEmployeeId.trim()) params.employeeId = effectiveEmployeeId.trim();
      if (effectiveStatus) params.status = effectiveStatus;

      const { data } = await api.get("/leave", { params });
      setLeaves(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setEmployeeId("");
    setStatus("");
    setActionError("");
    fetchLeaves({ employeeId: "", status: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handleReset() {
    setEmployeeId("");
    setStatus("");
    fetchLeaves({ employeeId: "", status: "" });
  }

  async function decide(leave, decision) {
    setBusyId(leave._id);
    setActionError("");

    try {
      await api.patch(`/leave/${leave._id}/status`, {
        status: decision,
        remarks: remarks[leave._id] || ""
      });
      // Approved/rejected rows leave the pending list.
      setLeaves((prev) => prev.filter((l) => l._id !== leave._id));
    } catch (err) {
      setActionError(err.response?.data?.message || err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isApproval ? "Leave Approval" : "Leave Application"}</h1>
          <p className="page-subtitle">
            {isApproval
              ? "Approve or reject pending leave requests from employees."
              : "All leave applications submitted by employees."}
          </p>
        </div>

        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => fetchLeaves()} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          fetchLeaves();
        }}
      >
        <div className="field-group">
          <label htmlFor="leave-filter-employee">Employee ID</label>
          <input
            id="leave-filter-employee"
            placeholder="e.g. 10395"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
        </div>

        {!isApproval && (
          <div className="field-group">
            <label htmlFor="leave-filter-status">Status</label>
            <select
              id="leave-filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="filters-actions">
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={loading}>
            Reset
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Apply Filters
          </button>
        </div>
      </form>

      {(error || actionError) && (
        <div className="error-banner">
          <span>{error || actionError}</span>
          {error && (
            <button className="btn" onClick={() => fetchLeaves()}>
              Retry
            </button>
          )}
        </div>
      )}

      {loading && leaves.length === 0 && !error && (
        <p className="state-panel">Loading leave applications…</p>
      )}

      {!loading && !error && leaves.length === 0 && (
        <div className="card">
          <p className="state-panel">
            {isApproval ? "No pending leave requests." : "No leave applications found."}
          </p>
        </div>
      )}

      {!error && leaves.length > 0 && (
        <div className="card">
          <div className="table-scroll">
            <table className="leave-table">
              <thead>
                <tr>
                  <th className="col-left">Employee ID</th>
                  <th className="col-left">Name</th>
                  <th className="col-left">Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th className="col-left">Reason</th>
                  <th>Applied On</th>
                  <th>Status</th>
                  <th className="col-left">{isApproval ? "Remarks" : "Admin Remarks"}</th>
                  {isApproval && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave._id}>
                    <td className="col-left">{leave.employeeId}</td>
                    <td className="col-left">{leave.name || "–"}</td>
                    <td className="col-left">
                      {leave.leaveType}
                      {leave.halfDay && <span className="leave-halfday-tag">Half day</span>}
                    </td>
                    <td>{displayDate(leave.fromDate)}</td>
                    <td>{displayDate(leave.toDate)}</td>
                    <td>{leave.days}</td>
                    <td className="col-left leave-reason-cell" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td>{appliedOn(leave.createdAt)}</td>
                    <td>
                      <span className={`leave-status leave-status-${leave.status.toLowerCase()}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="col-left">
                      {isApproval ? (
                        <input
                          className="leave-remarks-input"
                          placeholder="Optional"
                          value={remarks[leave._id] || ""}
                          onChange={(e) =>
                            setRemarks((prev) => ({ ...prev, [leave._id]: e.target.value }))
                          }
                        />
                      ) : (
                        leave.remarks || "–"
                      )}
                    </td>
                    {isApproval && (
                      <td>
                        <div className="leave-actions">
                          <button
                            className="btn btn-approve"
                            onClick={() => decide(leave, "Approved")}
                            disabled={busyId === leave._id}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-reject"
                            onClick={() => decide(leave, "Rejected")}
                            disabled={busyId === leave._id}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
