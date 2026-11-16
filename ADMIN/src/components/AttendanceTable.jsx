import { Fragment } from "react";
import {
  FULL_DAY_HOURS,
  GRACE_MINUTES,
  pairsOf,
  punchCount,
  lastPunch,
  directionKnown,
  dayIsOver,
  outsideText,
  unaccountedText,
  missedText,
  areaPunchText,
  lunchText,
  lunchRange,
  totalWorkingText,
  vsFullDayText,
  shiftText,
  fullDayText,
  lateText,
  earlyOutText,
  lunchOutCount,
  lunchTimeText,
  lunchBreaksRange
} from "../utils/attendanceStats";

// Some days have dozens of punches (someone passing a reader all day long);
// showing every pair would stretch the table to 100+ columns. Only the first
// MAX_PAIR_COLUMNS pairs get columns, the rest is summarised as "+N punches".
// The Excel export still contains every pair.
const MAX_PAIR_COLUMNS = 8;
// Other-machine punches written out in the cell; the rest show on hover.
const AREA_INLINE = 4;

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

  const today = todayDisplayDate();

  // The Daily Register: Total Punches, Total Working, how many times the
  // employee went out in lunch time (13:00-15:00), then the ENTRY / EXIT times.
  if (register) {
    // ENTRY / EXIT column pairs, as many as the busiest day needs (at most MAX_PAIR_COLUMNS).
    const simpleMax = Math.max(...records.map((doc) => pairsOf(doc).length));
    const simplePairs = Array.from({ length: Math.min(simpleMax, MAX_PAIR_COLUMNS) }, (_, i) => i + 1);
    const simpleMore = simpleMax > MAX_PAIR_COLUMNS;
    // Punches at other machines (not the gate): counted in Total Punches, so
    // they need a column or the count looks bigger than the times shown.
    const simpleArea = records.some((doc) => doc.areaPunches?.length);
    return (
      <div className="table-scroll">
        <table className={`att-table att-simple ${hideName ? "att-table-no-name" : ""}`}>
          <thead>
            <tr>
              <th className="col-emp">Employee ID</th>
              {!hideName && <th className="col-name">Name</th>}
              <th className="col-name">Department</th>
              <th className="col-name" title="COSEC Section (sub-department)">Section</th>
              {status && <th className="col-status">Status</th>}
              {showDate && <th>Date</th>}
              <th className="col-punches" title="Every IN and OUT punch recorded that day">Total Punches</th>
              <th className="col-total" title="Every IN → OUT pair added up, plus Unaccounted missed-punch gaps (lunch and time outside not counted)">Total Working</th>
              <th className="col-lunch" title="Time out on breaks that started between 13:00 and 15:00 (EXIT to the next ENTRY). ×2 = went out twice. Hover a cell for the times.">
                Lunch Time Out (13:00–15:00)
              </th>
              {simplePairs.map((n) => (
                <Fragment key={n}>
                  <th className="col-io-in punch-entry-head" title={`Pair ${n}: ENTRY machine (in). On Guess rows the times only alternate.`}>ENTRY</th>
                  <th className="col-io-out punch-exit-head" title={`Pair ${n}: EXIT machine (out). On Guess rows the times only alternate.`}>EXIT</th>
                </Fragment>
              ))}
              {simpleMore && <th className="col-more" title="Every punch is included in the Excel export">More</th>}
              {simpleArea && (
                <th className="col-area" title="Punches at machines other than the ENTRY / EXIT gate (counted in Total Punches)">
                  Other Machines
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((doc) => {
              const punches = punchCount(doc);
              const total = totalWorkingText(doc);
              const outs = lunchOutCount(doc);
              const lunchTime = lunchTimeText(doc);
              return (
                <tr key={doc._id || `${doc.ID}-${doc.Date}`} className={doc.Date === today ? "present-today" : ""}>
                  <td className="col-emp">
                    {doc.ID}
                    {doc.nightShift && <span className="pill pill-accent pill-night">Night</span>}
                    {doc.leave && (
                      <span className="pill pill-good pill-night" title="Approved leave, from the Leave page">
                        {doc.leave.type}
                        {doc.leave.half ? " ½" : ""}
                      </span>
                    )}
                  </td>
                  {!hideName && <td className="col-name">{doc.NAME}</td>}
                  <td className="col-name">{doc.department || "–"}</td>
                  <td className="col-name">{doc.subDepartment || "–"}</td>
                  {status && (
                    <td className="col-status">
                      {doc.status ? <span className={`pill ${doc.status === "Left" ? "pill-left" : "pill-good"}`}>{doc.status}</span> : "–"}
                    </td>
                  )}
                  {showDate && <td>{doc.Date}</td>}
                  <td className={`col-punches ${punches ? "" : "punch-empty"}`}>{punches}</td>
                  <td className={`col-total ${total ? "" : "punch-empty"}`}>{total || "–"}</td>
                  <td
                    className={`col-lunch ${lunchTime ? "" : "punch-empty"}`}
                    title={lunchTime ? `Out ${lunchBreaksRange(doc)}${outs > 1 ? ` (${outs} times)` : ""}` : undefined}
                  >
                    {lunchTime || "–"}
                    {outs > 1 && <span className="lunch-times"> ×{outs}</span>}
                  </td>
                  {simplePairs.map((n) => {
                    const pair = doc[`pair${n}`] || {};
                    const guessed = !directionKnown(doc);
                    // ENTRY times green, EXIT times red.
                    const cell = (time, side) =>
                      time ? (
                        <td className={`punch-${side} ${guessed ? "punch-guess" : ""}`} title={guessed ? "Guessed: no ENTRY/EXIT machine for this day" : undefined}>
                          {time}
                        </td>
                      ) : (
                        <td className="punch-empty">–</td>
                      );
                    return (
                      <Fragment key={n}>
                        {cell(pair.IN, "entry")}
                        {cell(pair.OUT, "exit")}
                      </Fragment>
                    );
                  })}
                  {simpleMore && (
                    <td className="col-more">
                      {(() => {
                        const extra = pairsOf(doc)
                          .slice(MAX_PAIR_COLUMNS)
                          .reduce((sum, pair) => sum + (pair.IN ? 1 : 0) + (pair.OUT ? 1 : 0), 0);
                        return extra ? `+${extra} punches` : "–";
                      })()}
                    </td>
                  )}
                  {simpleArea && (
                    <td
                      className={`col-area ${doc.areaPunches?.length ? "" : "punch-empty"}`}
                      title={areaPunchText(doc) || undefined}
                    >
                      {(() => {
                        // First few inline, the rest on hover (some days have dozens).
                        const list = doc.areaPunches || [];
                        if (!list.length) return "–";
                        const head = areaPunchText({ areaPunches: list.slice(0, AREA_INLINE) });
                        return list.length > AREA_INLINE ? `${head} +${list.length - AREA_INLINE} more` : head;
                      })()}
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

  const maxPairs = Math.max(...records.map((doc) => pairsOf(doc).length));
  const hasMore = maxPairs > MAX_PAIR_COLUMNS;
  const pairCols = Array.from({ length: Math.min(maxPairs, MAX_PAIR_COLUMNS) }, (_, i) => i + 1);

  // IN/OUT values in the pairs beyond the shown columns.
  function extraPunches(doc) {
    return pairsOf(doc)
      .slice(MAX_PAIR_COLUMNS)
      .reduce((sum, pair) => sum + (pair.IN ? 1 : 0) + (pair.OUT ? 1 : 0), 0);
  }

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
                  className="col-total"
                  title="Machine: IN/OUT from the ENTRY / EXIT machines. Guess: no gate machine recorded for the day, so IN/OUT alternate in time order."
                >
                  IN/OUT
                </th>
                <th
                  rowSpan={2}
                  className="col-lunch"
                  title="How long the time out (OUT punch to the next IN) touching 13:00-15:00 was; hover a cell for its times"
                >
                  Lunch Break (13:00–15:00)
                </th>
                <th rowSpan={2} className="col-total" title="The day's final punch, also when it is past the pair columns shown">
                  Last Punch
                </th>
                <th rowSpan={2} className="col-total" title="Time worked inside the office: every ENTRY → EXIT at the main gate added up (lunch and time outside are not counted)">
                  Total Working
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title="Time out of the office: EXIT to the next ENTRY at the main gate, not counting lunch time 13:00-15:00 (going out for lunch then is allowed). Machine rows only."
                >
                  Outside
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title="Main gate punches that are missing: an EXIT with no ENTRY before it (came in without punching), or an ENTRY with no EXIT after it"
                >
                  Missed
                </th>
                <th
                  rowSpan={2}
                  className="col-total"
                  title="Time between gate punches that can't be counted as inside or outside because a punch is missing (EXIT then EXIT, or ENTRY then ENTRY). Already counted inside Total Working (shown here for information)."
                >
                  Unaccounted
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
                <th className="col-io-in" title={register ? "ENTRY machine (IN). On Guess rows the times only alternate." : undefined}>
                  {register ? "ENTRY" : "IN"}
                </th>
                <th className="col-io-out" title={register ? "EXIT machine (OUT). On Guess rows the times only alternate." : undefined}>
                  {register ? "EXIT" : "OUT"}
                </th>
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
            const last = register ? lastPunch(doc) : null;
            const outside = register ? outsideText(doc) : "";
            const missed = register ? missedText(doc) : "";
            const unaccounted = register ? unaccountedText(doc) : "";
            const area = areaPunchText(doc);
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
                  {doc.leave && (
                    <span
                      className="pill pill-good pill-night"
                      title={`Approved leave (${doc.leave.type}${doc.leave.half ? ", half day" : ""}), from the Leave page`}
                    >
                      {doc.leave.type}
                      {doc.leave.half ? " ½" : ""}
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
                    <td className={`col-punches ${punches ? "" : "punch-empty"}`} title={area ? `Other machines: ${area}` : undefined}>
                      {punches}
                    </td>
                    <td
                      className={`col-total ${directionKnown(doc) ? "" : doc.gateDown ? "hours-short" : "punch-empty"}`}
                      title={
                        doc.gateDown
                          ? "The ENTRY or EXIT machine recorded (almost) nothing this day, so IN/OUT can't come from the machines and is guessed"
                          : undefined
                      }
                    >
                      {directionKnown(doc) ? "Machine" : doc.gateDown ? "Machine off" : "Guess"}
                    </td>
                    <td className={`col-lunch ${lunch ? "" : "punch-empty"}`} title={lunchRange(doc)}>
                      {lunch || "–"}
                    </td>
                    <td className={`col-total ${last ? "" : "punch-empty"}`}>
                      {last ? (
                        <>
                          {last.time}{" "}
                          <span className="last-punch-type">
                            {register && directionKnown(doc) ? (last.type === "IN" ? "ENTRY" : "EXIT") : last.type}
                          </span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={`col-total ${total ? "" : "punch-empty"}`}>{total || "–"}</td>
                    <td className={`col-total ${outside && outside !== "0:00" ? "hours-short" : "punch-empty"}`}>{outside || "–"}</td>
                    <td className={`col-total ${missed ? "hours-short" : "punch-empty"}`}>{missed || "–"}</td>
                    <td className={`col-total ${unaccounted && unaccounted !== "0:00" ? "hours-short" : "punch-empty"}`}>
                      {unaccounted || "–"}
                    </td>
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
                  const known = register && directionKnown(doc);
                  const guessed = register && !directionKnown(doc);
                  // On machine rows a pair missing one side is a missed punch:
                  // ENTRY missing = came in without punching; EXIT missing =
                  // went out without punching (not the last pair of today).
                  const missedIn = known && pair && !pair.IN && pair.OUT;
                  const missedOut =
                    known && pair && pair.IN && !pair.OUT && (n < pairsOf(doc).length || dayIsOver(doc));
                  const cell = (time, missed, label) =>
                    time ? (
                      <td className={guessed ? "punch-guess" : ""} title={guessed ? "Guessed: no ENTRY/EXIT machine for this day" : undefined}>
                        {time}
                      </td>
                    ) : missed ? (
                      <td className="punch-missed" title={`No ${label} punch: missing at the ${label} machine`}>
                        missed
                      </td>
                    ) : (
                      <td className="punch-empty">–</td>
                    );
                  return (
                    <Fragment key={n}>
                      {cell(pair?.IN, missedIn, "ENTRY")}
                      {cell(pair?.OUT, missedOut, "EXIT")}
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
