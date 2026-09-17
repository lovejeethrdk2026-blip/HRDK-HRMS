import { useEffect, useState } from "react";
import api from "../api/axios";

const PAIR_KEY = /^pair(\d+)$/;

function todayDisplayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

function lastPair(doc) {
  const nums = Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => b - a);

  return nums.length ? doc[`pair${nums[0]}`] : null;
}

export default function Dashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/attendance/latest")
      .then(({ data }) => setRecords(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error">{error}</p>;

  const today = todayDisplayDate();
  const totalEmployees = records.length;
  const presentToday = records.filter((doc) => doc.Date === today);
  const clockedInNow = presentToday.filter((doc) => {
    const pair = lastPair(doc);
    return pair?.IN && !pair?.OUT;
  });

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-value">{totalEmployees}</div>
          <div className="stat-label">Total Employees</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{presentToday.length}</div>
          <div className="stat-label">Punched Today ({today})</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{clockedInNow.length}</div>
          <div className="stat-label">Currently Clocked In</div>
        </div>
      </div>

      {presentToday.length > 0 && (
        <>
          <h2>Today's Activity</h2>
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Last IN</th>
                <th>Last OUT</th>
              </tr>
            </thead>
            <tbody>
              {presentToday.map((doc) => {
                const pair = lastPair(doc);
                return (
                  <tr key={doc._id || doc.ID} className="present-today">
                    <td>{doc.ID}</td>
                    <td>{doc.NAME}</td>
                    <td>{pair?.IN || "--"}</td>
                    <td>{pair?.OUT || "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
