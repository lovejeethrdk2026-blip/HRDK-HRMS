import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { useLive } from "../api/live";

// Holidays: company holidays (Diwali, Holi, 15 August ...), one paid day off
// for every employee. Month Shift Register & Pay pays them like a weekly off
// (code PH, paid holiday); work done on a holiday is paid on top (PH+P).
// Server: server/holidays (GET/POST/PUT/DELETE /api/holidays).

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const showDate = (iso) => iso.split("-").reverse().join("-");
const dayName = (iso) => WEEK_DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const errorText = (err) => err.response?.data?.message || err.message;

export default function Holidays() {
  const { can } = useAuth();
  const canManage = can("holidays.manage");
  const confirm = useConfirm();
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name }

  async function load(y = year) {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/holidays", { params: { year: y } });
      setHolidays(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  useLive(["holidays"], () => load(year));

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/holidays", { date, name });
      setName("");
      setDate("");
      const y = Number(date.slice(0, 4));
      if (y !== year) setYear(y);
      else await load(year);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function rename() {
    if (!editing) return;
    try {
      await api.put(`/holidays/${editing.id}`, { name: editing.name });
      setEditing(null);
      await load(year);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(holiday) {
    const sure = await confirm({
      title: "Delete holiday?",
      message: `${holiday.name} on ${showDate(holiday.date)} will no longer be a paid holiday.`,
      confirmLabel: "Delete",
      danger: true
    });
    if (!sure) return;
    try {
      await api.delete(`/holidays/${holiday._id}`);
      await load(year);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];
  if (!years.includes(year)) years.push(year);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Holidays</h1>
          <p className="page-subtitle">
            Company holidays like Diwali, Holi and 15 August. Paid for every employee; work on a holiday is paid extra in Month
            Shift Register &amp; Pay.
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="field-group">
          <label htmlFor="hol-year">Year</label>
          <select id="hol-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.sort().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {canManage && (
          <form className="hol-add" onSubmit={add}>
            <div className="field-group">
              <label htmlFor="hol-date">Date</label>
              <input id="hol-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field-group">
              <label htmlFor="hol-name">Holiday name</label>
              <input
                id="hol-name"
                placeholder="e.g. Diwali"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving || !date || !name.trim()}>
              {saving ? "Adding…" : "Add holiday"}
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Loader text="Loading holidays…" />
      ) : !holidays.length ? (
        <div className="card">
          <p className="state-panel">No holidays set for {year} yet.{canManage && " Add one above."}</p>
        </div>
      ) : (
        <div className="card card-table">
          <div className="table-scroll">
            <table className="ps-table hol-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Holiday</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday) => (
                  <tr key={holiday._id}>
                    <td>{showDate(holiday.date)}</td>
                    <td>{dayName(holiday.date)}</td>
                    <td>
                      {editing?.id === holiday._id ? (
                        <input
                          autoFocus
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") rename();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        holiday.name
                      )}
                    </td>
                    {canManage && (
                      <td className="hol-actions">
                        {editing?.id === holiday._id ? (
                          <>
                            <button className="btn btn-primary" onClick={rename} disabled={!editing.name.trim()}>
                              Save
                            </button>
                            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost" onClick={() => setEditing({ id: holiday._id, name: holiday.name })}>
                              Rename
                            </button>
                            <button className="btn btn-ghost" onClick={() => remove(holiday)}>
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
