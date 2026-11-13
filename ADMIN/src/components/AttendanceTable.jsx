import { Fragment } from "react";
import {
  FULL_DAY_HOURS,
  GRACE_MINUTES,
  pairsOf,
  punchCount,
  lunchText,
  lunchRange,
  totalWorkingText,
  vsFullDayText,
  shiftText,
  fullDayText,
  lateText,
  earlyOutText
} from "../utils/attendanceStats";

// Some days have dozens of punches (someone passing a reader all day long);
// showing every pair would stretch the table to 100+ columns. Only the first
// MAX_PAIR_COLUMNS pairs get columns, the rest is summarised as "+N punches".
// The Excel export still contains every pair.
const MAX_PAIR_COLUMNS = 8;

// Action column choices (saved per employee-day via PUT /api/attendance/mark).
const MARKS = [
  { value: "P", title: "Present", className: "mark-btn-p" },
  { value: "A", title: "Absent", className: "mark-btn-a" },
  { value: "H/D", title: "Half day", className: "mark-btn-hd" }
];

// Matches the "DD-MM-YYYY" format the backend stores Date as.
function todayDisplayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

export function rowKey(doc) {
  return `${doc.ID}|${doc.Date}`;
}

// hideName: drop the Name column when the page already shows the (single)
// employee's name above the table.
// onMark(doc, status): when given, an Action column lets the admin mark each
// row P / A / H/D (clicking the active one clears it). savingKey is the
// rowKey of the row whose mark is being saved right now.
// register: the Daily Register's slim layout -- employee ID, name, department, section,
// total punches, lunch break, total working (and how it compares with a full
// day) and punch times only (the Date column too when rows span
// several days).
export default function AttendanceTable({
  records,
  hideName = false,
  onMark,
  savingKey = "",
  register = false,
  status = false
}) {
  if (!records.length) {
    return <p className="state-panel">No attendance records found.</p>;
  }

  const showDate = !register || records.some((doc) => doc.Date !== records[0].Date);

  const maxPairs = Math.max(...records.map((doc) => pairsOf(doc).length));
  const hasMore = maxPairs > MAX_PAIR_COLUMNS;
  const pairCols = Array.from({ length: Math.min(maxPairs, MAX_PAIR_COLUMNS) }, (_, i) => i + 1);

  // IN/OUT values in the pairs beyond the shown columns.
  function extraPunches(doc) {
    return pairsOf(doc)
      .slice(MAX_PAIR_COLUMNS)
      .reduce((sum, pair) => sum + (pair.IN ? 1 : 0) + (pair.OUT ? 1 : 0), 0);
  }
  const today = todayDisplayDate();

  return (
    <div className="table-scroll">
      <table className={`att-table ${hideName ? "att-table-no-name" : ""}`}>
        <thead>
          <tr>
            <th rowSpan={2} className="col-emp">
              Employee ID
            </th>
            {!hideName && (
              <th rowSpan={2} className="col-name">
                Name
              </th>
            )}
            {register && (
              <th rowSpan={2} className="col-name">
                Department
              </th>
            )}
            {register && (
              <th rowSpan={2} className="col-name" title="COSEC Section (sub-department)">
                Section
              </th>
            )}
            {status && (
              <th rowSpan={2} className="col-status" title="Active, or Left (inactive in the COSEC master or has a leaving date)">
                Status
              </th>
            )}
            {showDate && <th rowSpan={2}>Date</th>}
            {register && (
              <>
                <th rowSpan={2} className="col-punches" title="Every IN and OUT punch recorded that day">
                  Total Punches
                </th>
                <th
                  rowSpan={2}
                  className="col-lunch"
                  title="How long the time out (OUT punch to the next IN) touching 13:00-15:00 was; hover a cell for its times"
                >
                  Lunch Break (13:00–15:00)
                </th>
                <th rowSpan={2} className="col-total" title="Sum of every completed IN → OUT pair">
                  Total Working
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title={`Total Working against a full day: the employee's shift length (less 1 hour lunch for a day shift over 13:00-15:00), or ${FULL_DAY_HOURS} hours without a shift. + extra, - short`}
                >
                  vs Full Day
                </th>
                <th rowSpan={2} className="col-total" title="Add Employee > Employee shift (In–Out)">
                  Shift
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title={`First IN after the shift In, beyond ${GRACE_MINUTES} minutes grace`}
                >
                  Late
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title={`Last OUT before the shift Out, beyond ${GRACE_MINUTES} minutes grace`}
                >
                  Early Out
                </th>
              </>
            )}
            {pairCols.map((n) => (
              <th key={n} colSpan={2}>
                Pair {n}
              </th>
            ))}
            {hasMore && (
              <th rowSpan={2} className="col-more" title="Every punch is included in the Excel export">
                More
              </th>
            )}
            {!register && (
              <>
                <th rowSpan={2} className="col-punches" title="Every IN and OUT punch recorded that day">
                  Punches
                </th>
                <th
                  rowSpan={2}
                  className="col-lunch"
                  title="Time out (OUT punch to the next IN) that touches 13:00-15:00"
                >
                  Lunch (13:00–15:00)
                </th>
                <th rowSpan={2} className="col-total" title="Sum of every completed IN → OUT pair">
                  Total Working
                </th>
              </>
            )}
            {onMark && (
              <th rowSpan={2} className="col-action">
                Action
              </th>
            )}
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
          {records.map((doc) => {
            const lunch = lunchText(doc);
            const total = totalWorkingText(doc);
            const punches = punchCount(doc);
            const vsFullDay = register ? vsFullDayText(doc) : "";
            const shift = register ? shiftText(doc) : "";
            const late = register ? lateText(doc) : "";
            const earlyOut = register ? earlyOutText(doc) : "";
            return (
              <tr
                key={doc._id || `${doc.ID}-${doc.Date}`}
                className={doc.Date === today ? "present-today" : ""}
              >
                <td className="col-emp">
                  {doc.ID}
                  {doc.nightShift && (
                    <span className="pill pill-accent pill-night" title="Night shift: punches counted 12:00 noon to 12:00 noon">
                      Night
                    </span>
                  )}
                </td>
                {!hideName && <td className="col-name">{doc.NAME}</td>}
                {register && <td className="col-name">{doc.department || "–"}</td>}
                {register && <td className="col-name">{doc.subDepartment || "–"}</td>}
                {status && (
                  <td className="col-status">
                    {doc.status ? (
                      <span
                        className={`pill ${doc.status === "Left" ? "pill-left" : "pill-good"}`}
                        title={doc.status === "Left" && doc.leavingDate ? `Left on ${doc.leavingDate}` : undefined}
                      >
                        {doc.status}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                )}
                {showDate && <td>{doc.Date}</td>}
                {register && (
                  <>
                    <td className={`col-punches ${punches ? "" : "punch-empty"}`}>{punches}</td>
                    <td className={`col-lunch ${lunch ? "" : "punch-empty"}`} title={lunchRange(doc)}>
                      {lunch || "–"}
                    </td>
                    <td className={`col-total ${total ? "" : "punch-empty"}`}>{total || "–"}</td>
                    <td
                      className={`col-total ${
                        vsFullDay.startsWith("-") ? "hours-short" : vsFullDay.startsWith("+") ? "hours-extra" : ""
                      } ${vsFullDay ? "" : "punch-empty"}`}
                      title={`Full day: ${fullDayText(doc)}`}
                    >
                      {vsFullDay || "–"}
                    </td>
                    <td className={`col-total ${shift ? "" : "punch-empty"}`}>{shift || "–"}</td>
                    <td className={`col-total ${late ? "hours-short" : "punch-empty"}`}>{late || "–"}</td>
                    <td className={`col-total ${earlyOut ? "hours-short" : "punch-empty"}`}>{earlyOut || "–"}</td>
                  </>
                )}
                {pairCols.map((n) => {
                  const pair = doc[`pair${n}`];
                  return (
                    <Fragment key={n}>
                      <td className={pair?.IN ? "" : "punch-empty"}>{pair?.IN || "–"}</td>
                      <td className={pair?.OUT ? "" : "punch-empty"}>{pair?.OUT || "–"}</td>
                    </Fragment>
                  );
                })}
                {hasMore && (
                  <td className="col-more">
                    {extraPunches(doc) ? `+${extraPunches(doc)} punches` : "–"}
                  </td>
                )}
                {!register && (
                  <>
                    <td className={`col-punches ${punches ? "" : "punch-empty"}`}>{punches}</td>
                    <td className={`col-lunch ${lunch ? "" : "punch-empty"}`} title={lunchRange(doc)}>
                      {lunch || "–"}
                    </td>
                    <td className={`col-total ${total ? "" : "punch-empty"}`}>{total || "–"}</td>
                  </>
                )}
                {onMark && (
                  <td className="col-action">
                    <div className="mark-group" role="group" aria-label="Mark attendance">
                      {MARKS.map((mark) => {
                        const active = doc.mark === mark.value;
                        return (
                          <button
                            key={mark.value}
                            type="button"
                            title={mark.title}
                            aria-pressed={active}
                            className={`mark-btn ${mark.className} ${active ? "active" : ""}`}
                            disabled={savingKey === rowKey(doc)}
                            onClick={() => onMark(doc, active ? "" : mark.value)}
                          >
                            {mark.value}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
