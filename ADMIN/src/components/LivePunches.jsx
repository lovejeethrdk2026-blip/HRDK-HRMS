import { useEffect, useState } from "react";
import api from "../api/axios";

// Dashboard > Today's punches: every IN and OUT punched today, newest first,
// with employee ID, name and department, and who is in or out right now. Read
// from the Daily Register (GET /api/attendance?date=&view=register), which the
// COSEC sync fills every few minutes; refreshed here every minute.

const REFRESH_MS = 60 * 1000;
const PAIR_KEY = /^pair(\d+)$/;
const FILTERS = [
  ["all", "All punches"],
  ["IN", "IN"],
  ["OUT", "OUT"]
];

const pad = (n) => String(n).padStart(2, "0");
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// One register row into its punches, oldest first: [{ time, type }].
function punchesOf(row) {
  return Object.keys(row)
    .filter((key) => PAIR_KEY.test(key))
    .sort((a, b) => Number(a.match(PAIR_KEY)[1]) - Number(b.match(PAIR_KEY)[1]))
    .flatMap((key) =>
      ["IN", "OUT"].filter((type) => row[key]?.[type]).map((type) => ({ time: row[key][type], type }))
    );
}

export default function LivePunches() {
  const [rows, setRows] = useState(null); // today's register rows
  const [updated, setUpdated] = useState(null); // Date of the last load
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get("/attendance", { params: { date: isoToday(), view: "register", limit: 500 } });
        if (cancelled) return;
        setRows(data.records || []);
        setUpdated(new Date());
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || err.message);
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Every punch of the day, newest first, with whether its employee is in now
  // (their last punch an IN) or out.
  const people = (rows || []).map((row) => {
    const punches = punchesOf(row);
    return { row, punches, now: punches.at(-1)?.type === "IN" ? "In" : "Out" };
  });
  const events = people
    .flatMap(({ row, punches, now }) => punches.map((punch) => ({ ...punch, row, now })))
    .sort((a, b) => b.time.localeCompare(a.time) || String(a.row.ID).localeCompare(String(b.row.ID)));
  const inNow = people.filter((p) => p.now === "In").length;

  const query = search.trim().toLowerCase();
  const shown = events.filter(
    (event) =>
      (filter === "all" || event.type === filter) &&
      (!query || String(event.row.ID).toLowerCase().includes(query) || String(event.row.NAME).toLowerCase().includes(query))
  );

  return (
    <section className="card live-punches">
      <div className="dash-chart-head">
        <div>
          <h3 className="card-title">Today's punches</h3>
          <p className="kpi-sub">
            Every IN and OUT punched today, newest first
            {updated ? ` · updated ${clock(updated)}, refreshes every minute` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p className="state-panel">Could not load today's punches: {error}</p>
      ) : !rows ? (
        <p className="state-panel">Loading today's punches…</p>
      ) : (
        <>
          <div className="lp-stats">
            <div className="lp-stat">
              <span className="lp-stat-label">Punched today</span>
              <span className="lp-stat-value">{people.length}</span>
            </div>
            <div className="lp-stat lp-stat-in">
              <span className="lp-stat-label">In now</span>
              <span className="lp-stat-value">{inNow}</span>
            </div>
            <div className="lp-stat lp-stat-out">
              <span className="lp-stat-label">Out now</span>
              <span className="lp-stat-value">{people.length - inNow}</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-label">Punches</span>
              <span className="lp-stat-value">{events.length}</span>
            </div>
          </div>

          <div className="lp-tools">
            <div className="segmented emp-status" role="group" aria-label="Punch type">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={filter === key ? "active" : undefined}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="lp-search"
              type="search"
              value={search}
              placeholder="Search name or emp ID"
              aria-label="Search name or employee ID"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {shown.length ? (
            <div className="table-scroll lp-scroll">
              <table className="people-table emp-list-table lp-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Punch</th>
                    <th>Emp ID</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Now</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((event) => (
                    <tr key={`${event.row.ID}-${event.time}-${event.type}`}>
                      <td className="lp-time">{event.time}</td>
                      <td>
                        <span className={`lp-type lp-type-${event.type.toLowerCase()}`}>{event.type}</span>
                      </td>
                      <td className="lp-id">{event.row.ID}</td>
                      <td className="lp-name">{event.row.NAME}</td>
                      <td className="lp-dept">
                        {[event.row.department, event.row.subDepartment].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td>
                        <span className={`emp-chip ${event.now === "In" ? "emp-chip-on" : ""}`}>{event.now}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="state-panel">{events.length ? "No punch matches." : "No punches yet today."}</p>
          )}
        </>
      )}
    </section>
  );
}
