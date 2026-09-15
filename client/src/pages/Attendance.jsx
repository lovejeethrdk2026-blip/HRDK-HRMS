import { useEffect, useState } from "react";
import api from "../api/axios";
import AttendanceTable from "../components/AttendanceTable";
import { exportAttendanceToExcel } from "../utils/exportAttendance";

export default function Attendance() {
  const [mode, setMode] = useState("latest"); // "latest" = all employees, "detail" = filtered/paginated
  const [records, setRecords] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // silent = keep existing rows on screen while this fetch is in flight
  // (manual refresh, background poll, pagination) instead of blanking the
  // table -- only the very first load of a view shows the full loading state.
  async function fetchLatest(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/attendance/latest");
      setRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // filters: optional override so Reset can fetch with cleared values in the
  // same action, without waiting on the setState/closure round-trip.
  async function fetchDetail(targetPage = 1, filters = {}) {
    setLoading(true);
    setError("");

    const effectiveEmployeeId = filters.employeeId ?? employeeId;
    const effectiveDate = filters.date ?? date;
    const effectiveMonth = filters.month ?? month;

    try {
      const params = { page: targetPage, limit: 100 };
      if (effectiveEmployeeId) params.employeeId = effectiveEmployeeId;
      if (effectiveMonth) {
        params.month = effectiveMonth;
      } else if (effectiveDate) {
        params.date = effectiveDate;
      }

      const { data } = await api.get("/attendance", { params });
      setRecords(data.records);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "latest") {
      fetchDetail(1);
      return;
    }

    fetchLatest();
    const interval = setInterval(() => fetchLatest(true), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  }

  function handleTodayActivity() {
    const today = todayIso();
    setEmployeeId("");
    setMonth("");
    setDate(today);

    if (mode === "detail") {
      fetchDetail(1, { employeeId: "", month: "", date: today });
    } else {
      setMode("detail"); // the mode-change effect below fetches with this updated state
    }
  }

  function handleReset() {
    setEmployeeId("");
    setDate("");
    setMonth("");
    fetchDetail(1, { employeeId: "", date: "", month: "" });
  }

  function handleRefresh() {
    if (mode === "latest") fetchLatest();
    else fetchDetail(page);
  }

  const hasRecords = records.length > 0;
  const isFirstLoad = loading && !hasRecords && !error;
  const filteredName = employeeId && hasRecords ? records[0]?.NAME : "";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">View employee attendance and punch history.</p>
        </div>

        <div className="page-header-actions">
          <button className="btn" onClick={handleTodayActivity} disabled={loading}>
            Today's Activity
          </button>
          <button
            className="btn"
            onClick={() => exportAttendanceToExcel(records)}
            disabled={!hasRecords}
          >
            Export to Excel
          </button>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="tabs-row">
        <div className="segmented" role="tablist" aria-label="Attendance view">
          <button
            role="tab"
            aria-selected={mode === "latest"}
            className={mode === "latest" ? "active" : ""}
            onClick={() => setMode("latest")}
          >
            All Employees (Latest)
          </button>
          <button
            role="tab"
            aria-selected={mode === "detail"}
            className={mode === "detail" ? "active" : ""}
            onClick={() => setMode("detail")}
          >
            Detailed / History
          </button>
        </div>

        {loading && hasRecords && (
          <span className="inline-refreshing">
            <span className="spinner" aria-hidden="true" /> Refreshing…
          </span>
        )}
      </div>

      {mode === "detail" && (
        <div className="filters">
          <div className="field-group">
            <label htmlFor="filter-employee-id">Employee ID</label>
            <input
              id="filter-employee-id"
              placeholder="e.g. 10395"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label htmlFor="filter-date">Date</label>
            <input
              id="filter-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setMonth("");
              }}
            />
          </div>

          <div className="field-group">
            <label htmlFor="filter-month">Month</label>
            <input
              id="filter-month"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setDate("");
              }}
            />
          </div>

          {filteredName && (
            <div className="field-group">
              <label>Employee Name</label>
              <span className="field-hint">{filteredName}</span>
            </div>
          )}

          <div className="filters-actions">
            <button className="btn btn-ghost" onClick={handleReset} disabled={loading}>
              Reset
            </button>
            <button className="btn btn-primary" onClick={() => fetchDetail(1)} disabled={loading}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {isFirstLoad && <p className="state-panel">Loading attendance…</p>}

      {!isFirstLoad && !error && hasRecords && (
        <div className="card">
          <AttendanceTable records={records} />
        </div>
      )}

      {!isFirstLoad && !error && !hasRecords && (
        <div className="card">
          <p className="state-panel">No attendance records found.</p>
        </div>
      )}

      {mode === "detail" && !error && totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn"
            disabled={page <= 1 || loading}
            onClick={() => fetchDetail(page - 1)}
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn"
            disabled={page >= totalPages || loading}
            onClick={() => fetchDetail(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
