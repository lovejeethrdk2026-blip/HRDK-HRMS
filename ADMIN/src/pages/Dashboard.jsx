import { Suspense, lazy, useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { isActive } from "../utils/employeeStatus";
import LivePunches from "../components/LivePunches";
import { inMyDepartments, myDepartmentNames, myRegisterNames } from "../utils/userScope";

// Fetched while the head count loads, so both arrive together.
const loadChart = () => import("../components/AttendanceAreaChart");
const AttendanceAreaChart = lazy(loadChart);

// Dashboard: opens after login. Shows the total employees, from
// GET /api/employees, today's IN / OUT punches (components/LivePunches.jsx),
// and a chart of how many punched each day, from the Daily Register head
// count (GET /api/attendance/headcount).

const PERIODS = [7, 30, 90]; // days the chart can show

const pad = (n) => String(n).padStart(2, "0");
const ddmmyyyy = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
// Financial year a day falls in: April onwards belongs to that year.
const fyOf = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

// The last `count` days, oldest first, today last.
function lastDays(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i)));
}

// Every day of financial year `fy` (1 April fy .. 31 March fy+1), up to today.
function fyDays(fy) {
  const today = new Date();
  const days = [];
  for (let d = new Date(fy, 3, 1); d <= today && d < new Date(fy + 1, 3, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(d);
  }
  return days;
}

const fyLabel = (fy) => `FY ${fy}-${String(fy + 1).slice(2)}`;

// Days present per day: a line over the last 7 / 30 / 90 days, or a whole
// financial year ("fy2026").
function AttendanceChart() {
  const [period, setPeriod] = useState("30");
  const [counts, setCounts] = useState(null); // "DD-MM-YYYY" -> head count
  const [error, setError] = useState("");
  const currentFy = fyOf(new Date());
  const days = period.startsWith("fy") ? fyDays(Number(period.slice(2))) : lastDays(Number(period));

  // The days may cross 1 April, so ask for every financial year they touch.
  const years = [...new Set(days.map(fyOf))].join(",");
  useEffect(() => {
    loadChart();
    let cancelled = false;
    setError("");
    Promise.all(years.split(",").map((fy) => api.get("/attendance/headcount", { params: { fy } })))
      .then((replies) => !cancelled && setCounts(Object.assign({}, ...replies.map(({ data }) => data.counts || {}))))
      .catch((err) => !cancelled && setError(err.response?.data?.message || err.message));
    return () => {
      cancelled = true;
    };
  }, [years]);

  const rows = days.map((day) => {
    const date = ddmmyyyy(day);
    return { date, label: `${pad(day.getDate())}/${pad(day.getMonth() + 1)}`, present: counts?.[date] ?? 0 };
  });
  // A financial year: one tick per month (its 1st), shown as "Apr", "May", ...
  const yearView = days.length > 120;
  const monthTicks = yearView ? rows.filter((row) => row.label.startsWith("01/")).map((row) => row.label) : undefined;
  const worked = rows.filter((row) => row.present);
  const average = worked.length ? Math.round(worked.reduce((sum, row) => sum + row.present, 0) / worked.length) : 0;

  return (
    <section className="card">
      <div className="dash-chart-head">
        <div>
          <h3 className="card-title">Attendance</h3>
          <p className="kpi-sub">
            Employees who punched each day
            {worked.length ? ` · average ${average} over ${worked.length} working days` : ""}
          </p>
        </div>
        <select aria-label="Days shown" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((n) => (
            <option key={n} value={String(n)}>
              Last {n} days
            </option>
          ))}
          {[currentFy, currentFy - 1].map((fy) => (
            <option key={fy} value={`fy${fy}`}>
              {fyLabel(fy)}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="state-panel">Could not load attendance: {error}</p>
      ) : !counts ? (
        <p className="state-panel">Loading attendance…</p>
      ) : (
        <div className="dash-chart">
          <Suspense fallback={<p className="state-panel">Loading chart…</p>}>
            <AttendanceAreaChart rows={rows} yearView={yearView} monthTicks={monthTicks} />
          </Suspense>
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/employees")
      .then(({ data }) => !cancelled && setEmployees(data))
      .catch((err) => !cancelled && setError(err.response?.data?.message || err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  // "Their department" roles count only employees of the user's own department.
  // Those who have left (Inactive on the Employees page) are not counted.
  const ownOnly = user.role !== "admin" && user.employeeScope === "department";
  const total = (employees || []).filter(
    (employee) => isActive(employee) && (!ownOnly || inMyDepartments(user, employee))
  ).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
        </div>
      </div>
      {error ? (
        <div className="card">
          <p className="state-panel">Could not load employees: {error}</p>
        </div>
      ) : (
        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-head">
              <span>Total employees</span>
            </div>
            <div className="kpi-value">{employees ? total : "…"}</div>
            <p className="kpi-sub">
              {ownOnly
                ? myDepartmentNames(user)
                : myRegisterNames(user) || "All departments"}
            </p>
            <div className="kpi-rail">
              <span style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      )}
      {can("attendance.view") && <LivePunches />}
      {can("attendance.view") && <AttendanceChart />}
    </div>
  );
}
