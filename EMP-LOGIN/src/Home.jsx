import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { pairNumbers, todayIso } from "./attendanceUtils";

export default function Home({ employee }) {
  const [today, setToday] = useState(null); // today's attendance doc, or undefined if none
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await apiGet("/attendance", {
          employeeId: employee.employeeId,
          date: todayIso(),
          limit: 1
        });
        if (!cancelled) setToday(data.records[0] || null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [employee.employeeId]);

  const nums = today ? pairNumbers(today) : [];

  return (
    <div className="portal portal-signed-in">
      <section className="log-section home-hero">
        <div className="home-id">
          <span className="topnav-user-name home-name">{employee.name}</span>
          <span className="topnav-user-id mono">ID {employee.employeeId}</span>
        </div>

        <h2 className="log-heading">Today's punches</h2>

        {loading && <p className="loading-note">Reading log…</p>}
        {error && (
          <div className="scan-denied" role="alert">
            <span className="denied-dot" aria-hidden="true" />
            {error}
          </div>
        )}

        {!loading && !error && (!today || !nums.length) && (
          <p className="empty-note">No punches yet today.</p>
        )}

        {!loading && !error && today && nums.length > 0 && (
          <div className="home-punch-list">
            {nums.map((n) => {
              const pair = today[`pair${n}`];
              return (
                <div key={n} className="home-punch-row">
                  <span className="home-punch-label">Punch {n}</span>
                  <span className="punch-in mono">{pair?.IN || "–"}</span>
                  <span className="mono">&rarr;</span>
                  <span className={pair?.OUT ? "punch-out mono" : "punch-empty mono"}>
                    {pair?.OUT || "still in"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
