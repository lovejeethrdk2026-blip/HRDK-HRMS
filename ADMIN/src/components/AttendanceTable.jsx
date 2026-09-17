import { Fragment } from "react";

const PAIR_KEY = /^pair(\d+)$/;

function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

// Matches the "DD-MM-YYYY" format the backend stores Date as.
function todayDisplayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

export default function AttendanceTable({ records }) {
  if (!records.length) {
    return <p className="state-panel">No attendance records found.</p>;
  }

  const maxPairs = Math.max(...records.map((doc) => Math.max(0, ...pairNumbers(doc))));
  const pairCols = Array.from({ length: maxPairs }, (_, i) => i + 1);
  const today = todayDisplayDate();

  return (
    <div className="table-scroll">
      <table className="att-table">
        <thead>
          <tr>
            <th rowSpan={2} className="col-emp">
              Employee ID
            </th>
            <th rowSpan={2} className="col-name">
              Name
            </th>
            <th rowSpan={2}>Date</th>
            {pairCols.map((n) => (
              <th key={n} colSpan={2}>
                Pair {n}
              </th>
            ))}
          </tr>
          <tr>
            {pairCols.map((n) => (
              <Fragment key={n}>
                <th className="col-io-in">IN</th>
                <th className="col-io-out">OUT</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((doc) => (
            <tr
              key={doc._id || `${doc.ID}-${doc.Date}`}
              className={doc.Date === today ? "present-today" : ""}
            >
              <td className="col-emp">{doc.ID}</td>
              <td className="col-name">{doc.NAME}</td>
              <td>{doc.Date}</td>
              {pairCols.map((n) => {
                const pair = doc[`pair${n}`];
                return (
                  <Fragment key={n}>
                    <td className={pair?.IN ? "" : "punch-empty"}>{pair?.IN || "–"}</td>
                    <td className={pair?.OUT ? "" : "punch-empty"}>{pair?.OUT || "–"}</td>
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
