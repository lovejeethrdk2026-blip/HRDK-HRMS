import { Fragment, useEffect, useState } from "react";
import { apiGet } from "./api";
import { pairNumbers, parseDisplayDate, todayIso, currentMonthIso } from "./attendanceUtils";

const RANGE_LABEL = {
  today: "Today",
  week: "This week",
  month: "This month",
  all: "Full history"
};

function OwnAttendanceTable({ records }) {
  if (!records.length) {
    return <p className="empty-note">No punches on file for this range.</p>;
  }

  const maxPairs = Math.max(...records.map((doc) => Math.max(0, ...pairNumbers(doc))));
  const pairCols = Array.from({ length: maxPairs }, (_, i) => i + 1);

  return (
    <div className="log-scroll">
      <table className="log-table">
        <thead>
          <tr>
            <th rowSpan={2} className="col-date">
              Date
            </th>
            {pairCols.map((n) => (
              <th key={n} colSpan={2} className="col-pair-label">
                Punch {n}
              </th>
            ))}
          </tr>
          <tr>
            {pairCols.map((n) => (
              <Fragment key={n}>
                <th className="col-io">In</th>
                <th className="col-io">Out</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((doc) => (
            <tr key={doc._id || doc.Date}>
              <td className="col-date">{doc.Date}</td>
              {pairCols.map((n) => {
                const pair = doc[`pair${n}`];
                return (
                  <Fragment key={n}>
                    <td className={pair?.IN ? "punch-in" : "punch-empty"}>{pair?.IN || "–"}</td>
                    <td className={pair?.OUT ? "punch-out" : "punch-empty"}>
                      {pair?.OUT || "–"}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// range: "today" | "week" | "month" | "all"
export default function AttendanceHistory({ employeeId, range }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = { employeeId, limit: 100 };
        if (range === "today") params.date = todayIso();
        if (range === "month") params.month = currentMonthIso();

        const data = await apiGet("/attendance", params);
        let rows = data.records;

        if (range === "week") {
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          rows = rows.filter((doc) => parseDisplayDate(doc.Date).getTime() >= weekAgo);
        }

        if (!cancelled) setRecords(rows);
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
  }, [employeeId, range]);

  return (
    <div className="portal portal-signed-in">
      <section className="log-section">
        <h2 className="log-heading">Punch history &mdash; {RANGE_LABEL[range]}</h2>

        {loading && <p className="loading-note">Reading log…</p>}
        {error && (
          <div className="scan-denied" role="alert">
            <span className="denied-dot" aria-hidden="true" />
            {error}
          </div>
        )}
        {!loading && !error && <OwnAttendanceTable records={records} />}
      </section>
    </div>
  );
}
