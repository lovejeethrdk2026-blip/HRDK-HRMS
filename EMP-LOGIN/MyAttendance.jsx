import { Fragment, useState } from "react";

async function apiGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api${path}${query ? `?${query}` : ""}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed with status ${res.status}`);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed with status ${res.status}`);
  return data;
}

const PAIR_KEY = /^pair(\d+)$/;

function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

function OwnAttendanceTable({ records }) {
  if (!records.length) {
    return <p>No attendance records found.</p>;
  }

  const maxPairs = Math.max(...records.map((doc) => Math.max(0, ...pairNumbers(doc))));
  const pairCols = Array.from({ length: maxPairs }, (_, i) => i + 1);

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Date</th>
            {pairCols.map((n) => (
              <th key={n} colSpan={2}>
                pair{n}
              </th>
            ))}
          </tr>
          <tr>
            {pairCols.map((n) => (
              <Fragment key={n}>
                <th>IN</th>
                <th>OUT</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((doc) => (
            <tr key={doc._id || doc.Date}>
              <td>{doc.Date}</td>
              {pairCols.map((n) => {
                const pair = doc[`pair${n}`];
                return (
                  <Fragment key={n}>
                    <td>{pair?.IN || "--"}</td>
                    <td>{pair?.OUT || "--"}</td>
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

export default function MyAttendance() {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [employee, setEmployee] = useState(null); // { employeeId, name } once logged in
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const data = await apiPost("/employee/login", { employeeId, password });
      setEmployee(data);
      await fetchOwnAttendance(data.employeeId);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function fetchOwnAttendance(id) {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet("/attendance", { employeeId: id, limit: 100 });
      setRecords(data.records);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setEmployee(null);
    setRecords([]);
    setEmployeeId("");
    setPassword("");
  }

  if (!employee) {
    return (
      <div>
        <h1>My Attendance</h1>
        <form className="filters" onSubmit={handleLogin} style={{ maxWidth: 320 }}>
          <input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={loggingIn}>
            {loggingIn ? "Checking..." : "Login"}
          </button>
        </form>
        {loginError && <p className="error">{loginError}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>My Attendance</h1>
      <p>
        {employee.name} (ID: {employee.employeeId}){" "}
        <button onClick={handleLogout}>Logout</button>
      </p>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && <OwnAttendanceTable records={records} />}
    </div>
  );
}
