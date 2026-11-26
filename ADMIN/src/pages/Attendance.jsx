import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import AttendanceTable from "../components/AttendanceTable";
import HeadCount from "../components/HeadCount";
import Loader from "../components/Loader";
import NightShiftDialog from "../components/NightShiftDialog";
import { exportAttendanceToExcel } from "../utils/exportAttendance";
import { useLive } from "../api/live";

function formatDateTime(timestamp) {
  return new Date(timestamp)
    .toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
    .replace(/\//g, "-");
}

// "DD-MM-YYYY" -> "YYYY-MM-DD" (the value an <input type="date"> wants).
function isoFromDisplayDate(displayDate) {
  const [d, m, y] = displayDate.split("-");
  return `${y}-${m}-${d}`;
}

function syncNote(info) {
  if (info.running) return "COSEC sync running…";
  if (info.lastError) return `Last COSEC sync failed: ${info.lastError}`;
  if (!info.lastRunAt) return "COSEC punches not synced yet.";
  return `COSEC punches synced ${formatDateTime(info.lastRunAt)} (${info.lastRunPunches} punches, every ${info.intervalMinutes} min).`;
}

// The Daily Register menu's views (components/Sidebar.jsx).
const VIEW_TITLES = {
  latest: ["All Employees", "Every employee's most recent day of punches."],
  headcount: ["Head Count", "How many employees punched in, day by day."],
  detail: ["Daily Register", "View employee attendance and punch history."],
  night: ["Night Shift", "Night shift staff, with punches counted 12:00 noon to 12:00 noon."]
};

// view: "detail" (Daily Register), "latest" (All Employees), "headcount" or
// "night" (the detail view, night shift staff only).
export default function Attendance({ view = "detail", onNavigate }) {
  const { user, can } = useAuth(); // Sync and Export show only when the role allows them
  // Users page "Daily Register department": that user sees only this department.
  // With one department the filter is locked to it; with several the server
  // sends only those, and the filter picks among them.
  const myRegister = user.role !== "admin" ? user.registerDepartments || [] : [];
  const lockedDepartment = myRegister.length === 1 ? myRegister[0].name : "";
  const mode = view;
  // Night Shift has the same date/month filters as the Daily Register.
  const isDetail = mode === "detail" || mode === "night";
  const [records, setRecords] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  // Night Shift opens on yesterday: a shift is dated by the day it started, so
  // today's morning punches belong to yesterday's row and tonight's shift has
  // not started yet -- today shows nothing until the evening.
  const [date, setDate] = useState(mode === "night" ? yesterdayIso() : todayIso());
  const [month, setMonth] = useState("");
  // Narrows the loaded rows on screen; "" = every department.
  const [department, setDepartment] = useState(lockedDepartment);
  // COSEC Section (sub-department) inside the picked department; "" = every section.
  const [section, setSection] = useState("");
  // Narrows the loaded rows on screen; opens on Active, "" = Active and Left.
  const [status, setStatus] = useState("Active");
  // Latest view: narrows the loaded rows by employee ID or name; "" = everyone.
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncInfo, setSyncInfo] = useState(null); // last COSEC punch sync (GET /attendance/sync)
  const [syncing, setSyncing] = useState(false);
  const [showNightShift, setShowNightShift] = useState(false);
  // First/last day the attendance collection actually holds (GET /attendance/range).
  // The COSEC punch feed usually lags well behind today, so opening the page on
  // today would show an empty table with no hint why.
  const [range, setRange] = useState(null);

  // silent = keep existing rows on screen while this fetch is in flight
  // (manual refresh, background poll, pagination) instead of blanking the
  // table -- only the very first load of a view shows the full loading state.
  async function fetchLatest(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/attendance/latest", { params: { view: "register" } });
      setRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // filters: optional override so Reset can fetch with cleared values in the
  // same action, without waiting on the setState/closure round-trip.
  async function fetchDetail(targetPage = 1, filters = {}, silent = false) {
    if (!silent) setLoading(true);
    setError("");

    const effectiveEmployeeId = filters.employeeId ?? employeeId;
    const effectiveDate = filters.date ?? date;
    const effectiveMonth = filters.month ?? month;

    try {
      // view=register: the server sends only ID, name, department, date and punches.
      const params = { limit: 10000, view: "register" };
      if (effectiveEmployeeId) params.employeeId = effectiveEmployeeId;
      if (effectiveMonth) {
        params.month = effectiveMonth;
      } else if (effectiveDate) {
        params.date = effectiveDate;
      }

      // Everything on one page: the server sends up to 10000 register rows
      // (a whole month) at once; any further pages are fetched and joined.
      const first = (await api.get("/attendance", { params: { ...params, page: 1 } })).data;
      let rows = first.records;
      for (let p = 2; p <= first.totalPages; p++) {
        const next = (await api.get("/attendance", { params: { ...params, page: p } })).data;
        rows = rows.concat(next.records);
      }
      setRecords(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "headcount") return; // HeadCount loads its own data
    if (mode !== "latest") {
      if (mode === "night") {
        setDate(yesterdayIso());
        setMonth("");
        fetchDetail(1, { month: "", date: yesterdayIso() });
      } else {
        fetchDetail(1);
      }
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

  function yesterdayIso() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
      2,
      "0"
    )}`;
  }

  function handleTodayActivity() {
    const today = todayIso();
    setEmployeeId("");
    setMonth("");
    setDate(today);

    if (isDetail) {
      fetchDetail(1, { employeeId: "", month: "", date: today });
    } else {
      onNavigate?.("attendance"); // the Daily Register opens on today
    }
  }

  function handleReset() {
    setDepartment(lockedDepartment);
    setSection("");
    setStatus("Active");
    setEmployeeId("");
    setDate("");
    setMonth("");
    fetchDetail(1, { employeeId: "", date: "", month: "" });
  }

  function handleRefresh() {
    if (mode === "latest") fetchLatest();
    else fetchDetail();
  }

  async function loadSyncStatus() {
    try {
      const { data } = await api.get("/attendance/sync");
      setSyncInfo(data);
    } catch {
      // The sync note is informational only.
    }
  }

  // Pull the newest COSEC punches now instead of waiting for the scheduled run.
  async function handleSyncNow() {
    setSyncing(true);
    setError("");
    try {
      await api.post("/attendance/sync");
      await loadSyncStatus();
      handleRefresh();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadSyncStatus();
  }, []);

  // Live refresh: new punches (COSEC sync) or a save by someone else -> the
  // open view reloads quietly, with the filters as they are.
  useLive(["attendance", "leave", "holidays"], () => {
    loadSyncStatus();
    if (mode === "headcount") return; // HeadCount listens itself
    if (mode === "latest") fetchLatest(true);
    else fetchDetail(1, {}, true);
  });

  // Open on the newest day that has records when today has none yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/attendance/range");
        if (cancelled) return;
        setRange(data);
        if (data.lastDate) {
          const lastIso = isoFromDisplayDate(data.lastDate);
          // Night Shift already opens on yesterday; move only if data ends earlier.
          if (lastIso < (mode === "night" ? yesterdayIso() : todayIso())) {
            setDate(lastIso);
            setMonth("");
            fetchDetail(1, { employeeId: "", month: "", date: lastIso });
          }
        }
      } catch {
        // The range is only used to pick a sensible starting day.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasRecords = records.length > 0;
  const isFirstLoad = loading && !hasRecords && !error;
  // Departments in the loaded rows (plus the picked one, so it stays listed
  // after a reload that has none of its rows).
  const departments = [
    ...new Set([...records.map((doc) => doc.department).filter(Boolean), department].filter(Boolean))
  ].sort((a, b) => a.localeCompare(b));
  // Sections of the picked department (or of all), plus the picked one.
  const sections = [
    ...new Set(
      [
        ...records
          .filter((doc) => !department || doc.department === department)
          .map((doc) => doc.subDepartment),
        section
      ].filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
  const searchText = mode === "latest" ? search.trim().toLowerCase() : "";
  const shown = records.filter(
    (doc) =>
      (!department || doc.department === department) &&
      (!section || doc.subDepartment === section) &&
      (!status || doc.status === status) &&
      (mode !== "night" || doc.nightShift) &&
      (!searchText ||
        String(doc.ID ?? "").toLowerCase().includes(searchText) ||
        String(doc.NAME ?? "").toLowerCase().includes(searchText))
  );
  // Name shown above the table only when every loaded row is the same employee
  // (not just because an ID was typed but not yet applied); the table then
  // drops its Name column since it would repeat on every row.
  const singleEmployee = hasRecords && records.every((doc) => doc.ID === records[0].ID);
  const filteredName = isDetail && employeeId && singleEmployee ? records[0].NAME : "";

  const departmentFilter = (
    <div className="field-group">
      <label htmlFor="filter-department">Department</label>
      <select
        id="filter-department"
        value={department}
        onChange={(e) => {
          setDepartment(e.target.value);
          setSection("");
        }}
        disabled={Boolean(lockedDepartment)}
      >
        {!lockedDepartment && <option value="">All departments</option>}
        {departments.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  const sectionFilter = (
    <div className="field-group">
      <label htmlFor="filter-section">Section</label>
      <select id="filter-section" value={section} onChange={(e) => setSection(e.target.value)}>
        <option value="">All sections</option>
        {sections.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );

  // toRegisterRows on the server sets status to "Active" or "Left".
  const statusFilter = (
    <div className="field-group">
      <label htmlFor="filter-status">Status</label>
      <select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        <option value="Active">Active</option>
        <option value="Left">Left</option>
      </select>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{VIEW_TITLES[mode][0]}</h1>
          <p className="page-subtitle">{VIEW_TITLES[mode][1]}</p>
          {syncInfo && <p className="page-subtitle sync-note">{syncNote(syncInfo)}</p>}
        </div>

        <div className="page-header-actions">
          {can("attendance.sync") && (
            <button className="btn" onClick={handleSyncNow} disabled={syncing || loading}>
              {syncing && <span className="spinner" aria-hidden="true" />}
              {syncing ? "Syncing…" : "Sync from COSEC"}
            </button>
          )}
          {mode === "night" && can("attendance.nightshift") && (
            <button className="btn" onClick={() => setShowNightShift(true)}>
              Night Shift Staff
            </button>
          )}
          <button className="btn" onClick={handleTodayActivity} disabled={loading}>
            Today's Activity
          </button>
          {mode !== "headcount" && can("attendance.export") && (
            <button
              className="btn"
              onClick={() => exportAttendanceToExcel(shown, "attendance", { register: true })}
              disabled={!shown.length}
            >
              Export to Excel
            </button>
          )}
          <button className="btn btn-primary" onClick={handleRefresh} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && hasRecords && (
        <div className="tabs-row">
          <span className="inline-refreshing">
            <span className="spinner" aria-hidden="true" /> Refreshing…
          </span>
        </div>
      )}

      {isDetail && (
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

          {departmentFilter}
          {sectionFilter}
          {statusFilter}

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

      {mode === "latest" && (
        <div className="filters">
          {departmentFilter}
          {sectionFilter}
          {statusFilter}
          <div className="field-group">
            <label htmlFor="filter-search">Search Employee</label>
            <input
              id="filter-search"
              type="search"
              placeholder="ID or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {mode === "headcount" && <HeadCount />}

      {showNightShift && (
        <NightShiftDialog
          onClose={(changed) => {
            setShowNightShift(false);
            if (changed && mode !== "headcount") handleRefresh();
          }}
        />
      )}

      {mode !== "headcount" && error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {mode !== "headcount" && isFirstLoad && <Loader text="Loading attendance…" />}

      {mode !== "headcount" && !isFirstLoad && !error && shown.length > 0 && (
        <div className="card card-table">
          <AttendanceTable records={shown} hideName={Boolean(filteredName)} register status={mode === "latest"} />
        </div>
      )}

      {mode !== "headcount" && !isFirstLoad && !error && hasRecords && shown.length === 0 && (
        <div className="card">
          <p className="state-panel">
            {mode === "night" && !records.some((doc) => doc.nightShift)
              ? "No night shift started in this period. A shift shows on the day it started (after 12:00 noon); punches before noon belong to the previous day's row, so pick yesterday or a whole month. Tick night shift employees with the Night Shift Staff button."
              : `No attendance records for ${[department, section, status, searchText && `"${search.trim()}"`]
                  .filter(Boolean)
                  .join(", ")} in this view.`}
          </p>
        </div>
      )}

      {mode !== "headcount" && !isFirstLoad && !error && !hasRecords && (
        <div className="card">
          <p className="state-panel">
            No attendance records found.
            {range && range.days > 0 && (
              <>
                {" "}
                Attendance is available from {range.firstDate} to {range.lastDate} ({range.days}
                {" "}days). Newer days appear once the COSEC punch sync catches up.
              </>
            )}
            {range && range.days === 0 && " No punches have been synced from COSEC yet."}
          </p>
        </div>
      )}

    </div>
  );
}
