import { useEffect, useState } from "react";
import api from "../api/axios";

// Night Shift Staff dialog (Daily Register): tick the employees who work
// nights. Their punches are then counted 12:00 noon to 12:00 noon, so a
// 21:00 -> 06:00 shift is one row (server dailyRegister/nightShift.js).
// Each tick saves at once: PUT /attendance/night-shift/:employeeId.
// onClose(changed): changed = at least one tick was saved.
export default function NightShiftDialog({ onClose }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyTicked, setOnlyTicked] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose(changed);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, changed]);

  useEffect(() => {
    api
      .get("/attendance/night-shift")
      .then(({ data }) => setEmployees(data.employees))
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(employee) {
    const nightShift = !employee.nightShift;
    setSavingId(employee.employeeId);
    setError("");
    try {
      await api.put(`/attendance/night-shift/${employee.employeeId}`, { nightShift });
      setEmployees((list) =>
        list.map((e) => (e.employeeId === employee.employeeId ? { ...e, nightShift } : e))
      );
      setChanged(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSavingId("");
    }
  }

  const text = search.trim().toLowerCase();
  const shown = employees.filter(
    (e) =>
      (!onlyTicked || e.nightShift) &&
      (!text ||
        e.employeeId.toLowerCase().includes(text) ||
        e.name.toLowerCase().includes(text) ||
        e.department.toLowerCase().includes(text) ||
        e.section.toLowerCase().includes(text))
  );
  const tickedCount = employees.filter((e) => e.nightShift).length;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(changed)}>
      <div
        className="modal-card dept-modal night-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ns-title"
      >
        <h2 id="ns-title" className="dept-modal-title">
          Night Shift Staff
        </h2>
        <p className="night-modal-note">
          Ticked employees' punches are counted from 12:00 noon to 12:00 noon the next day, so a shift
          like 21:00 → 06:00 shows as one row on the day it started. {tickedCount} ticked.
        </p>

        <div className="night-modal-tools">
          <input
            className="dept-modal-input"
            type="search"
            placeholder="Search ID, name, department or section"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="night-modal-only">
            <input type="checkbox" checked={onlyTicked} onChange={(e) => setOnlyTicked(e.target.checked)} />
            Only ticked
          </label>
        </div>

        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}

        <div className="night-modal-list">
          {loading && <p className="state-panel">Loading employees…</p>}
          {!loading && shown.length === 0 && <p className="state-panel">No employees match.</p>}
          {shown.map((e) => (
            <label key={e.employeeId} className="night-modal-row">
              <input
                type="checkbox"
                checked={e.nightShift}
                disabled={savingId === e.employeeId}
                onChange={() => toggle(e)}
              />
              <span className="night-modal-id">{e.employeeId}</span>
              <span className="night-modal-name">{e.name || "–"}</span>
              <span className="night-modal-dept">
                {[e.department, e.section].filter(Boolean).join(" · ") || "–"}
              </span>
            </label>
          ))}
        </div>

        <div className="dept-modal-actions">
          <button type="button" className="btn btn-primary" onClick={() => onClose(changed)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
