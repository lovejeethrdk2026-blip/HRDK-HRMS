import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { isActive } from "../utils/employeeStatus";
import { XLSX, loadXlsx } from "../utils/xlsx";

// Employees > App logins: every employee's employee-app login in one list.
// Username = the Employee ID they punch with (Matrix ID, initialsNo). HR ticks
// employees and generates first passwords for all of them at once (shown once
// here and downloadable as Excel); the app makes each employee choose their
// own at the first login. One employee's password can also be set on the
// Employees panel (Employee app login box).
// HR can also turn a login off (and on again) for ticked employees; anyone who
// has left the company (exit past its last working day) is blocked by the
// server on its own.
// Server: GET /api/employees/app-logins, POST /api/employees/app-logins/generate,
// POST /api/employees/app-logins/access (server/portal/appPasswords.js).

const when = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
const loginIdOf = (e) => {
  const id = String(e.initialsNo ?? "").trim();
  return /^\d{1,10}$/.test(id) ? id : "";
};

// Login state of one employee: none | first | own | off | noId
const STATES = {
  off: { label: "Login off", className: "al-noid" },
  none: { label: "No password", className: "al-none" },
  first: { label: "First password, not changed", className: "al-first" },
  own: { label: "Own password set", className: "al-own" },
  noId: { label: "No Employee ID", className: "al-noid" }
};

export default function AppLogins() {
  const confirm = useConfirm();
  const [employees, setEmployees] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { given, skipped } of the last Generate

  async function load() {
    setError("");
    try {
      const [staff, saved] = await Promise.all([api.get("/employees"), api.get("/employees/app-logins")]);
      setEmployees(Array.isArray(staff.data) ? staff.data : []);
      setLogins(Array.isArray(saved.data) ? saved.data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const byUser = new Map(logins.map((l) => [l.username, l]));
    return employees.map((e) => {
      const username = loginIdOf(e);
      const saved = username ? byUser.get(username) : null;
      const state = !username ? "noId" : saved?.disabled ? "off" : !saved?.hasPassword ? "none" : saved.mustChange ? "first" : "own";
      return { employee: e, username, saved, state, active: isActive(e) };
    });
  }, [employees, logins]);

  const counts = useMemo(() => {
    const c = { all: 0, none: 0, first: 0, own: 0, off: 0, noId: 0, left: 0 };
    for (const r of rows) {
      // "Left company" counts everyone who has left, whatever the tick says.
      if (!r.active && r.username) c.left++;
      if (activeOnly && !r.active) continue;
      c.all++;
      c[r.state]++;
    }
    return c;
  }, [rows, activeOnly]);

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) =>
      show === "left" ? !r.active && r.username : (!activeOnly || r.active) && (show === "all" || r.state === show)
    )
    .filter(
      (r) =>
        !q ||
        [r.employee.employeeId, r.username, r.employee.name, r.employee.department].some((v) => String(v ?? "").toLowerCase().includes(q))
    )
    .sort((a, b) => String(a.employee.employeeId).localeCompare(String(b.employee.employeeId), undefined, { numeric: true }));
  const pickable = shown.filter((r) => r.username);
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(r.employee.employeeId));

  function toggle(id) {
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setPicked((old) => {
      const next = new Set(old);
      for (const r of pickable) {
        if (allPicked) next.delete(r.employee.employeeId);
        else next.add(r.employee.employeeId);
      }
      return next;
    });
  }

  async function generate(ids) {
    const chosen = rows.filter((r) => ids.includes(r.employee.employeeId));
    const resets = chosen.filter((r) => r.saved).length;
    const ok = await confirm({
      title: `Generate passwords for ${ids.length} employee${ids.length === 1 ? "" : "s"}?`,
      message: `Each gets a new first password (shown once on this page, and in Excel). ${
        resets ? `${resets} already ${resets === 1 ? "has" : "have"} a password: it is replaced and they are logged out of the app. ` : ""
      }They must choose their own password at the next login.`,
      confirmLabel: "Generate",
      danger: resets > 0
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/employees/app-logins/generate", { employeeIds: ids });
      setResult(data);
      setPicked(new Set());
      const saved = await api.get("/employees/app-logins");
      setLogins(Array.isArray(saved.data) ? saved.data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  // Turn the app login off (logs them out at once) or back on.
  async function setAccess(ids, disabled) {
    if (disabled) {
      const ok = await confirm({
        title: `Turn app login off for ${ids.length} employee${ids.length === 1 ? "" : "s"}?`,
        message: "They are logged out of the app at once and cannot log in until you turn it on again. Their password is kept.",
        confirmLabel: "Turn off",
        danger: true
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/employees/app-logins/access", { employeeIds: ids, disabled });
      if (data.skipped?.length) setError(`Skipped: ${data.skipped.map((s) => `${s.employeeId} (${s.reason})`).join(", ")}`);
      setPicked(new Set());
      const saved = await api.get("/employees/app-logins");
      setLogins(Array.isArray(saved.data) ? saved.data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadGiven() {
    await loadXlsx();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Employee code", "Name", "Username (Employee ID)", "First password"],
      ...result.given.map((g) => [g.employeeId, g.name, g.username, g.password])
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 16 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "App logins");
    XLSX.writeFile(book, `app-logins-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function downloadList() {
    await loadXlsx();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Employee code", "Name", "Department", "Username (Employee ID)", "Status", "First password given", "Own password set"],
      ...shown.map((r) => [
        r.employee.employeeId,
        r.employee.name,
        r.employee.department,
        r.username,
        STATES[r.state].label + (!r.active ? " (left company, blocked)" : ""),
        r.saved?.setAt ? when(r.saved.setAt) : "",
        r.saved?.changedAt ? when(r.saved.changedAt) : ""
      ])
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "App login status");
    XLSX.writeFile(book, `app-login-status-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">App logins</h1>
          <p className="page-subtitle">
            Employee app username and password for everyone. Username = the Employee ID they punch with. Tick employees and generate first passwords; each
            employee chooses their own at the first login.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn" onClick={downloadList} disabled={loading || !shown.length}>
            Status to Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="card al-result">
          <div className="al-result-head">
            <div>
              <h3 className="card-title">
                {result.given.length} password{result.given.length === 1 ? "" : "s"} generated
              </h3>
              <p className="al-muted">
                Shown only now. Download the Excel and give each employee their Employee ID and password. Keep the file safe and delete it once given.
              </p>
            </div>
            <div className="al-result-actions">
              {result.given.length > 0 && (
                <button className="btn btn-primary" onClick={downloadGiven}>
                  Download Excel
                </button>
              )}
              <button className="btn" onClick={() => setResult(null)}>
                Close
              </button>
            </div>
          </div>
          {result.given.length > 0 && (
            <div className="table-scroll al-result-table">
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Username</th>
                    <th>First password</th>
                  </tr>
                </thead>
                <tbody>
                  {result.given.map((g) => (
                    <tr key={g.employeeId}>
                      <td>{g.employeeId}</td>
                      <td>{g.name}</td>
                      <td>
                        <strong>{g.username}</strong>
                      </td>
                      <td>
                        <code className="al-pass">{g.password}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.skipped.length > 0 && (
            <p className="al-muted">Skipped: {result.skipped.map((s) => `${s.employeeId} (${s.reason})`).join(", ")}</p>
          )}
        </div>
      )}

      <div className="al-chips" role="tablist" aria-label="Show">
        {[
          ["all", "All"],
          ["none", STATES.none.label],
          ["first", STATES.first.label],
          ["own", STATES.own.label],
          ["off", STATES.off.label],
          ["left", "Left company"],
          ["noId", STATES.noId.label]
        ].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={show === key} className={`al-chip ${show === key ? "is-on" : ""}`} onClick={() => setShow(key)}>
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="filters al-filters">
        <div className="field-group">
          <label htmlFor="al-search">Employee</label>
          <input id="al-search" type="search" placeholder="Code, Employee ID, name or department" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="al-check">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active employees only
        </label>
        <div className="al-bulk">
          <span className="al-muted">{picked.size} ticked</span>
          <button className="btn" disabled={busy || !picked.size} onClick={() => setAccess([...picked], false)}>
            Turn login on
          </button>
          <button className="btn btn-danger-outline" disabled={busy || !picked.size} onClick={() => setAccess([...picked], true)}>
            Turn login off
          </button>
          <button className="btn btn-primary" disabled={busy || !picked.size} onClick={() => generate([...picked])}>
            {busy ? "Working…" : "Generate passwords"}
          </button>
        </div>
      </div>

      {loading ? (
        <Loader text="Loading employees…" />
      ) : (
        <div className="card card-table">
          <div className="table-scroll">
            <table className="ps-table al-table">
              <thead>
                <tr>
                  <th className="al-tick">
                    <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Tick all shown" disabled={!pickable.length} />
                  </th>
                  <th>Code</th>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>First password given</th>
                  <th>Own password set</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.employee.employeeId}>
                    <td className="al-tick">
                      <input
                        type="checkbox"
                        checked={picked.has(r.employee.employeeId)}
                        onChange={() => toggle(r.employee.employeeId)}
                        disabled={!r.username}
                        aria-label={`Tick ${r.employee.name}`}
                      />
                    </td>
                    <td>{r.employee.employeeId}</td>
                    <td>{r.username ? <strong>{r.username}</strong> : <span className="al-muted">–</span>}</td>
                    <td>
                      {r.employee.name}
                      {!r.active && <span className="al-muted"> (left)</span>}
                    </td>
                    <td>{r.employee.department || "–"}</td>
                    <td>
                      <span className={`al-pill ${STATES[r.state].className}`}>{STATES[r.state].label}</span>
                      {!r.active && r.username && <span className="al-pill al-noid">Left company, blocked</span>}
                      {r.saved?.pausedUntil && <span className="al-pill al-noid">Locked 15 min (wrong passwords)</span>}
                    </td>
                    <td>{when(r.saved?.setAt)}</td>
                    <td>{when(r.saved?.changedAt)}</td>
                    <td>
                      {r.username && (
                        <div className="al-row-actions">
                          <button className="btn al-one" disabled={busy} onClick={() => generate([r.employee.employeeId])}>
                            {r.saved?.hasPassword ? "Reset" : "Generate"}
                          </button>
                          <button
                            className={`btn al-one ${r.saved?.disabled ? "" : "btn-danger-outline"}`}
                            disabled={busy}
                            onClick={() => setAccess([r.employee.employeeId], !r.saved?.disabled)}
                          >
                            {r.saved?.disabled ? "Turn on" : "Turn off"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={9} className="state-panel">
                      No employees match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="al-muted al-foot">
        No Employee ID: add the Matrix ID (Initials No.) in Edit details first. Employees without a password can still log in with the ID alone while
        EMP_APP_ID_LOGIN is on (server setting). Employees who have left the company (exit entered, last working day past) cannot use the app at all,
        even with login on.
      </p>
    </div>
  );
}
