import { useEffect, useState } from "react";
import { XLSX, loadXlsx } from "../utils/xlsx";
import api from "../api/axios";
import Loader from "./Loader";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const pad = (n) => String(n).padStart(2, "0");

// Financial year that today falls in: April onwards belongs to this year.
function currentFy() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

// April of fy .. March of fy+1, each with every "DD-MM-YYYY" day in it.
function fyMonths(fy) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = (3 + i) % 12; // 0-based
    const year = i < 9 ? fy : fy + 1;
    const days = new Date(year, month + 1, 0).getDate();
    return {
      key: `${year}-${pad(month + 1)}`,
      label: `${MONTH_NAMES[month]} ${year}`,
      dates: Array.from({ length: days }, (_, d) => `${pad(d + 1)}-${pad(month + 1)}-${year}`)
    };
  });
}

async function exportHeadCount(fy, months, counts) {
  await loadXlsx();
  const rows = [["Date", "Head Count"]];
  months.forEach((m) => {
    rows.push([m.label, ""]);
    m.dates.forEach((date) => rows.push([date, counts[date] ?? "-"]));
    rows.push(["", ""]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 18 }, { wch: 12 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Head Count");
  XLSX.writeFile(book, `head-count-FY${fy}-${String(fy + 1).slice(2)}.xlsx`);
}

// Daily Register "Head Count" view: per day, how many employees punched at
// least once, laid out month by month over one financial year.
export default function HeadCount() {
  const [fy, setFy] = useState(currentFy());
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(year = fy) {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/attendance/headcount", { params: { fy: year } });
      setCounts(data.counts);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(fy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const months = fyMonths(fy);
  const years = Array.from({ length: 6 }, (_, i) => currentFy() - i);

  return (
    <div>
      <div className="filters">
        <div className="field-group">
          <label htmlFor="headcount-fy">Financial Year</label>
          <select id="headcount-fy" value={fy} onChange={(e) => setFy(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}-{String(y + 1).slice(2)} (Apr {y} – Mar {y + 1})
              </option>
            ))}
          </select>
        </div>
        <div className="filters-actions">
          <button className="btn" onClick={() => exportHeadCount(fy, months, counts)} disabled={loading}>
            Export to Excel
          </button>
          <button className="btn btn-primary" onClick={() => load()} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner"><span>{error}</span></div>}

      {loading && !Object.keys(counts).length ? (
        <Loader text="Counting head count…" />
      ) : (
        <div className="headcount-grid">
          {months.map((m) => {
            const values = m.dates.map((d) => counts[d]).filter(Boolean);
            return (
              <div className="card headcount-card" key={m.key}>
                <h3 className="card-title">{m.label}</h3>
                <table className="headcount-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Head Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.dates.map((date) => (
                      <tr key={date} className={counts[date] ? "" : "headcount-empty"}>
                        <td>{date}</td>
                        <td>{counts[date] ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {values.length > 0 && (
                    <tfoot>
                      <tr>
                        <td>Average ({values.length} days)</td>
                        <td>{Math.round(values.reduce((a, b) => a + b, 0) / values.length)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
