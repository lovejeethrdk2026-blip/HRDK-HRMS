import { useEffect, useState } from "react";
import api from "../api/axios";

const PAIR_KEY = /^pair(\d+)$/;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n) {
  return String(n).padStart(2, "0");
}

// Pairs sorted by number: [{ IN, OUT }, ...]
function pairsOf(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .sort((a, b) => Number(a.match(PAIR_KEY)[1]) - Number(b.match(PAIR_KEY)[1]))
    .map((key) => doc[key] || {});
}

// Month grid starting on Monday; null = padding cell outside the month.
function buildCells(year, monthIndex) {
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AttendanceMark() {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState("");
  const [appliedId, setAppliedId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appliedId) return;

    setLoading(true);
    setError("");

    api
      .get("/attendance", {
        params: { employeeId: appliedId, month: `${year}-${pad(monthIndex + 1)}`, limit: 100 }
      })
      .then(({ data }) => setRecords(data.records))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [appliedId, year, monthIndex]);

  function shiftMonth(delta) {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  }

  function handleSubmit(e) {
    e.preventDefault();
    setRecords([]);
    setAppliedId(employeeId.trim());
  }

  // "DD-MM-YYYY" -> record
  const byDate = Object.fromEntries(records.map((doc) => [doc.Date, doc]));
  const todayKey = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const cells = buildCells(year, monthIndex);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });

  let present = 0;
  let absent = 0;
  const days = cells.map((day) => {
    if (day === null) return null;

    const key = `${pad(day)}-${pad(monthIndex + 1)}-${year}`;
    const doc = byDate[key];
    const isFuture = new Date(year, monthIndex, day) > todayStart;
    const isSunday = new Date(year, monthIndex, day).getDay() === 0;

    let status = "future";
    if (doc) status = "present";
    else if (!isFuture) status = isSunday ? "off" : "absent";

    if (status === "present") present++;
    if (status === "absent") absent++;

    const pairs = doc ? pairsOf(doc) : [];
    return {
      day,
      key,
      status,
      isToday: key === todayKey,
      firstIn: pairs[0]?.IN,
      lastOut: pairs.length ? pairs[pairs.length - 1].OUT : undefined
    };
  });

  const employeeName = records[0]?.NAME;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Mark</h1>
          <p className="page-subtitle">Monthly attendance calendar for an employee.</p>
        </div>
      </div>

      <form className="filters" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="mark-employee-id">Employee ID</label>
          <input
            id="mark-employee-id"
            placeholder="e.g. 10395"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
        </div>

        {employeeName && (
          <div className="field-group">
            <label>Employee Name</label>
            <span className="field-hint">{employeeName}</span>
          </div>
        )}

        <div className="filters-actions">
          <button className="btn btn-primary" type="submit" disabled={!employeeId.trim() || loading}>
            Show Calendar
          </button>
        </div>
      </form>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {!appliedId ? (
        <div className="card">
          <p className="state-panel">Enter an employee ID to view their attendance calendar.</p>
        </div>
      ) : (
        <div className="card calendar">
          <div className="calendar-header">
            <button className="btn" onClick={() => shiftMonth(-1)} disabled={loading}>
              Prev
            </button>
            <div className="calendar-title">
              {monthLabel}
              {loading && <span className="spinner" aria-hidden="true" />}
            </div>
            <button className="btn" onClick={() => shiftMonth(1)} disabled={loading}>
              Next
            </button>
          </div>

          <div className="calendar-summary">
            <span className="calendar-legend calendar-legend-present">Present {present}</span>
            <span className="calendar-legend calendar-legend-absent">Absent {absent}</span>
            <span className="calendar-legend calendar-legend-off">Sunday off</span>
          </div>

          <div className="calendar-grid">
            {WEEKDAYS.map((name) => (
              <div key={name} className="calendar-weekday">
                {name}
              </div>
            ))}

            {days.map((cell, i) =>
              cell === null ? (
                <div key={`empty-${i}`} className="calendar-cell calendar-cell-empty" />
              ) : (
                <div
                  key={cell.key}
                  className={`calendar-cell calendar-${cell.status} ${
                    cell.isToday ? "calendar-today" : ""
                  }`}
                >
                  <span className="calendar-day">{cell.day}</span>
                  {cell.status === "present" && (
                    <span className="calendar-times">
                      {cell.firstIn || "--"} – {cell.lastOut || "--"}
                    </span>
                  )}
                  {cell.status === "absent" && <span className="calendar-mark">A</span>}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
