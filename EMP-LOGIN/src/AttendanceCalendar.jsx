import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { pairNumbers } from "./attendanceUtils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n) {
  return String(n).padStart(2, "0");
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

export default function AttendanceCalendar({ employeeId }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");

    apiGet("/attendance", { employeeId, month: `${year}-${pad(monthIndex + 1)}`, limit: 100 })
      .then((data) => {
        if (!cancelled) setRecords(data.records);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId, year, monthIndex]);

  function shiftMonth(delta) {
    const next = new Date(year, monthIndex + delta, 1);
    setYear(next.getFullYear());
    setMonthIndex(next.getMonth());
  }

  // "DD-MM-YYYY" -> record
  const byDate = Object.fromEntries(records.map((doc) => [doc.Date, doc]));
  const todayKey = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });

  let present = 0;
  let absent = 0;
  const days = buildCells(year, monthIndex).map((day) => {
    if (day === null) return null;

    const date = new Date(year, monthIndex, day);
    const key = `${pad(day)}-${pad(monthIndex + 1)}-${year}`;
    const doc = byDate[key];

    let status = "future";
    if (doc) status = "present";
    else if (date <= todayStart) status = date.getDay() === 0 ? "off" : "absent";

    if (status === "present") present++;
    if (status === "absent") absent++;

    const nums = doc ? pairNumbers(doc) : [];
    return {
      day,
      key,
      status,
      isToday: key === todayKey,
      firstIn: nums.length ? doc[`pair${nums[0]}`]?.IN : undefined,
      lastOut: nums.length ? doc[`pair${nums[nums.length - 1]}`]?.OUT : undefined
    };
  });

  return (
    <div className="portal portal-signed-in">
      <section className="log-section">
        <h2 className="log-heading">Attendance calendar</h2>

        <div className="cal-header">
          <button type="button" className="btn" onClick={() => shiftMonth(-1)} disabled={loading}>
            Prev
          </button>
          <div className="cal-title">{monthLabel}</div>
          <button type="button" className="btn" onClick={() => shiftMonth(1)} disabled={loading}>
            Next
          </button>
        </div>

        {error ? (
          <div className="scan-denied" role="alert">
            <span className="denied-dot" aria-hidden="true" />
            {error}
          </div>
        ) : (
          <>
            <div className="cal-summary">
              <span className="cal-legend cal-legend-present">Present {loading ? "–" : present}</span>
              <span className="cal-legend cal-legend-absent">Absent {loading ? "–" : absent}</span>
              <span className="cal-legend cal-legend-off">Sunday off</span>
            </div>

            <div className={`cal-grid ${loading ? "cal-loading" : ""}`}>
              {WEEKDAYS.map((name) => (
                <div key={name} className="cal-weekday">
                  {name}
                </div>
              ))}

              {days.map((cell, i) =>
                cell === null ? (
                  <div key={`empty-${i}`} className="cal-cell cal-cell-empty" />
                ) : (
                  <div
                    key={cell.key}
                    className={`cal-cell cal-${loading ? "future" : cell.status} ${
                      cell.isToday ? "cal-today" : ""
                    }`}
                  >
                    <span className="cal-day">{cell.day}</span>
                    {!loading && cell.status === "present" && (
                      <span className="cal-times mono">
                        {cell.firstIn || "--"} – {cell.lastOut || "--"}
                      </span>
                    )}
                    {!loading && cell.status === "absent" && <span className="cal-mark">A</span>}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
