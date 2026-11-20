import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { isActive } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > Shift: the one place shifts are set up and given (not on the
// employee master). Three tabs:
// - Shifts: the company's named shifts (General 10:00-19:00, Night ...),
//   added / edited / deleted here (server/shifts/shifts.route.js).
// - Shift list: one card per shift with its people; tick people to move them
//   to another shift or remove theirs.
// - Assign shift: pick a shift, tick employees (those without one first),
//   give them all that shift at once.
// Each employee keeps shift.in / shift.out on their record; that is what the
// Daily Register reads. Out earlier than In is a night shift (punches grouped
// across midnight, server/dailyRegister/employeeShifts.js).
// Server: POST /api/employees/bulk-shift { employeeIds, in, out } ("" + "" clears).

const keyOf = (e) => (e.shift?.in && e.shift?.out ? `${e.shift.in}-${e.shift.out}` : "");
const isNight = (start, end) => Boolean(start && end && end < start);
const subNames = (dept) => (dept?.subDepartments || []).map((s) => (typeof s === "string" ? s : s.name));

// "09:30" -> "9:30 AM"
function clock(time) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Length from in to out (past midnight when out is earlier): "9h", "7h 30m".
function hoursOf(start, end) {
  if (!start || !end || start === end) return "";
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let diff = mins(end) - mins(start);
  if (diff <= 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function ShiftPill({ start, end, name, muted }) {
  if (!start || !end) return <span className="sh-none">No shift</span>;
  return (
    <span className={`sh-pill ${muted ? "is-muted" : ""}`}>
      {name && <span className="sh-pill-name">{name}</span>}
      <span className="sh-pill-time">
        {clock(start)} – {clock(end)}
      </span>
      <span className="sh-pill-len">{hoursOf(start, end)}</span>
      {isNight(start, end) && <span className="sh-night">Night</span>}
    </span>
  );
}

const EMPTY_FORM = { id: "", name: "", in: "", out: "", moveEmployees: true };

export default function BulkShift() {
  const { user, can } = useAuth();
  const mayChange = user.role === "admin" || can("employees.add");
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(null);
  const [types, setTypes] = useState(null); // named shifts
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(""); // "setup" | "list" | "assign"; "" until loaded
  const [shiftFilter, setShiftFilter] = useState("any");
  const [filter, setFilter] = useState({ department: "", subDepartment: "", search: "" });
  const [picked, setPicked] = useState(() => new Set());
  const [target, setTarget] = useState({ in: "", out: "" });
  const [custom, setCustom] = useState(false); // typing a time instead of picking a named shift
  const [form, setForm] = useState(null); // shift being added / edited
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }

  async function load() {
    try {
      const { data } = await api.get("/employees");
      setEmployees(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }
  async function loadTypes() {
    try {
      const { data } = await api.get("/shifts");
      setTypes(data);
      return data;
    } catch {
      setTypes([]);
      return [];
    }
  }

  useEffect(() => {
    load();
    // Open on Shifts when none are set up yet, else on the list.
    loadTypes().then((data) => setMode((m) => m || (data.length || !mayChange ? "list" : "setup")));
    api
      .get("/departments")
      .then(({ data }) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
  }, [mayChange]);

  const ownOnly = user.role !== "admin" && user.employeeScope === "department";
  const active = useMemo(
    () => (employees || []).filter((e) => isActive(e)).filter((e) => !ownOnly || inMyDepartments(user, e)),
    [employees, ownOnly, user]
  );

  // "10:00-19:00" -> "General"
  const nameByKey = useMemo(() => new Map((types || []).map((t) => [`${t.in}-${t.out}`, t.name])), [types]);
  const countByKey = useMemo(() => {
    const counts = new Map();
    for (const e of active) {
      const key = keyOf(e);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [active]);

  // Every shift to show: named ones (even with nobody on them) then times in
  // use that have no name yet. By In time.
  const shifts = useMemo(() => {
    const list = (types || []).map((t) => ({ key: `${t.in}-${t.out}`, start: t.in, end: t.out, name: t.name, id: t._id }));
    for (const key of countByKey.keys()) {
      if (!nameByKey.has(key)) {
        const [start, end] = key.split("-");
        list.push({ key, start, end, name: "", id: "" });
      }
    }
    return list
      .map((s) => ({ ...s, count: countByKey.get(s.key) || 0 }))
      .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  }, [types, countByKey, nameByKey]);
  const unnamed = shifts.filter((s) => !s.name);

  const withShift = active.filter((e) => keyOf(e)).length;
  const withoutShift = active.length - withShift;
  const listView = mode === "list";

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return active
      .filter((e) =>
        shiftFilter === "all"
          ? true
          : shiftFilter === "none"
            ? !keyOf(e)
            : shiftFilter === "any"
              ? Boolean(keyOf(e))
              : keyOf(e) === shiftFilter
      )
      .filter((e) => !filter.department || e.department === filter.department)
      .filter((e) => !filter.subDepartment || e.subDepartment === filter.subDepartment)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || String(e.employeeId).toLowerCase().includes(q))
      .sort((a, b) => (listView ? keyOf(a).localeCompare(keyOf(b)) : 0) || a.name.localeCompare(b.name));
  }, [active, filter, shiftFilter, listView]);

  const filterSubs = filter.department
    ? subNames(departments.find((d) => d.name === filter.department))
    : [...new Set(departments.flatMap(subNames))].sort((a, b) => a.localeCompare(b));

  const clearing = !target.in && !target.out;
  const half = Boolean(target.in) !== Boolean(target.out);
  const sameTime = Boolean(target.in) && target.in === target.out;
  const targetOk = !half && !sameTime && !clearing;
  const targetKey = clearing ? "" : `${target.in}-${target.out}`;
  const targetName = nameByKey.get(targetKey) || "";
  const chosen = active.filter((e) => picked.has(e.employeeId));
  const alreadyOn = targetOk ? chosen.filter((e) => keyOf(e) === targetKey).length : 0;

  function switchTo(next) {
    if (next === mode) return;
    setMode(next);
    setShiftFilter(next === "assign" ? "none" : "any");
    setNotice(null);
    setError("");
  }

  const allShownPicked = shown.length > 0 && shown.every((e) => picked.has(e.employeeId));
  function toggleAll() {
    setPicked((was) => {
      const next = new Set(was);
      for (const e of shown) allShownPicked ? next.delete(e.employeeId) : next.add(e.employeeId);
      return next;
    });
  }
  function toggle(id) {
    if (!mayChange) return;
    setPicked((was) => {
      const next = new Set(was);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ---------- give / remove shifts ----------
  async function apply(clear = false) {
    const start = clear ? "" : target.in;
    const end = clear ? "" : target.out;
    if (!picked.size) return setError("Tick at least one employee");
    if (!clear && !targetOk) return setError("Pick the shift first");
    setError("");
    const n = picked.size;
    const people = `${n} employee${n === 1 ? "" : "s"}`;
    const label = `${targetName ? `${targetName} (` : ""}${clock(start)} – ${clock(end)}${targetName ? ")" : ""}`;
    const sure = await confirm({
      title: clear ? `Remove the shift of ${people}?` : `Give ${label} to ${people}?`,
      message: clear
        ? "They will have no shift: the Daily Register then treats their punches as a day shift, with no late / early check."
        : `${isNight(start, end) ? "Night shift: Out is the next morning, so punches are grouped across midnight. " : ""}The Daily Register uses the new shift within a minute.`,
      confirmLabel: clear ? "Remove shift" : "Assign shift"
    });
    if (!sure) return;
    setSaving(true);
    try {
      const { data } = await api.post("/employees/bulk-shift", { employeeIds: [...picked], in: start, out: end });
      const failed = data.results.filter((r) => !r.ok);
      const done = data.results.length - failed.length;
      setNotice({
        ok: !failed.length,
        text: `${clear ? "Shift removed for" : "Shift saved for"} ${done} employee${done === 1 ? "" : "s"}.${
          failed.length ? ` Not saved (still ticked): ${failed.map((r) => `${r.name || r.employeeId}: ${r.message}`).join("; ")}` : ""
        }`
      });
      setPicked(new Set(failed.map((r) => r.employeeId)));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Shifts tab: add / edit / delete named shifts ----------
  const editing = form?.id ? (types || []).find((t) => t._id === form.id) : null;
  const editingCount = editing ? countByKey.get(`${editing.in}-${editing.out}`) || 0 : 0;
  const timesChanged = editing && (editing.in !== form.in || editing.out !== form.out);

  async function saveForm(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError("Type the shift name");
    if (!form.in || !form.out) return setError("Set both In and Out");
    if (form.in === form.out) return setError("In and Out cannot be the same time");
    setError("");
    setSaving(true);
    try {
      const body = { name: form.name, in: form.in, out: form.out, moveEmployees: form.moveEmployees };
      const { data } = form.id ? await api.put(`/shifts/${form.id}`, body) : await api.post("/shifts", body);
      setNotice({
        ok: true,
        text: `${form.id ? "Saved" : "Added"} ${data.name} (${clock(data.in)} – ${clock(data.out)}).${
          data.moved ? ` ${data.moved} employee${data.moved === 1 ? "" : "s"} moved to the new times.` : ""
        }`
      });
      setForm(null);
      await loadTypes();
      if (data.moved) await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeType(shift) {
    const sure = await confirm({
      title: `Delete the ${shift.name} shift?`,
      message: shift.count
        ? `${shift.count} employee${shift.count === 1 ? "" : "s"} keep ${clock(shift.start)} – ${clock(shift.end)}; only the name goes. Move them on Shift list first if they need another shift.`
        : "Nobody is on it.",
      confirmLabel: "Delete shift"
    });
    if (!sure) return;
    try {
      await api.delete(`/shifts/${shift.id}`);
      setNotice({ ok: true, text: `Deleted ${shift.name}.` });
      await loadTypes();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  // ---------- pieces ----------
  // Step 1 / action bar: pick a shift (named or in use), or type a time.
  const shiftPicker = mayChange && (
    <div className="sh-picker">
      <div className="sh-choices" role="radiogroup" aria-label="Shift">
        {shifts.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={!custom && targetKey === s.key}
            className={`sh-choice ${!custom && targetKey === s.key ? "is-on" : ""} ${isNight(s.start, s.end) ? "is-night" : ""}`}
            onClick={() => {
              setCustom(false);
              setTarget({ in: s.start, out: s.end });
            }}
          >
            <span className="sh-choice-name">{s.name || "No name"}</span>
            <span className="sh-choice-time">
              {clock(s.start)} – {clock(s.end)}
            </span>
            <span className="sh-choice-meta">
              {hoursOf(s.start, s.end)}
              {isNight(s.start, s.end) && <span className="sh-night">Night</span>}
              <span className="sh-choice-count">{s.count}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className={`sh-choice is-custom ${custom ? "is-on" : ""}`}
          onClick={() => {
            setCustom(true);
            setTarget({ in: "", out: "" });
          }}
        >
          <span className="sh-choice-name">Other time</span>
          <span className="sh-choice-time">Type In / Out</span>
        </button>
      </div>
      {custom && (
        <div className="sh-times">
          <div className="sh-field">
            <label htmlFor="sh-in">In</label>
            <input
              id="sh-in"
              className="bi-input"
              type="time"
              value={target.in}
              onChange={(e) => setTarget((t) => ({ ...t, in: e.target.value }))}
            />
          </div>
          <span className="sh-arrow" aria-hidden="true">
            →
          </span>
          <div className="sh-field">
            <label htmlFor="sh-out">Out</label>
            <input
              id="sh-out"
              className="bi-input"
              type="time"
              value={target.out}
              onChange={(e) => setTarget((t) => ({ ...t, out: e.target.value }))}
            />
          </div>
          <div className="sh-preview" aria-live="polite">
            {clearing || half ? (
              <span className="sh-hint">Fill both In and Out</span>
            ) : sameTime ? (
              <span className="sh-hint is-bad">In and Out cannot be the same</span>
            ) : (
              <ShiftPill start={target.in} end={target.out} name={targetName} />
            )}
          </div>
        </div>
      )}
    </div>
  );

  const tabs = [
    mayChange && ["setup", "Shifts", (types || []).length],
    ["list", "Shift list", withShift],
    mayChange && ["assign", "Assign shift", withoutShift]
  ].filter(Boolean);

  if (!mode) return <Loader text="Loading shifts…" />;

  return (
    <div className={`sh-page ${picked.size && mode !== "setup" ? "has-bar" : ""}`}>
      <div className="page-header sh-head">
        <div>
          <h1 className="page-title">Shift</h1>
          <p className="page-subtitle">
            {mode === "setup"
              ? "Set up the company's shifts once, then give them to employees."
              : listView
                ? "Who works which shift. Click a shift to see its people; tick people to move them or remove their shift."
                : "Pick the shift, tick employees, and give them all that shift at once."}
          </p>
        </div>
        <div className="sh-stats">
          <div>
            <strong>{active.length}</strong>
            <span>Active</span>
          </div>
          <div>
            <strong>{withShift}</strong>
            <span>With shift</span>
          </div>
          <div className={withoutShift ? "is-warn" : ""}>
            <strong>{withoutShift}</strong>
            <span>No shift</span>
          </div>
        </div>
      </div>

      <div className="pf-tabs sh-tabs" role="tablist" aria-label="Shift">
        {tabs.map(([key, title, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            className={`pf-tab ${mode === key ? "is-active" : ""}`}
            onClick={() => switchTo(key)}
          >
            {title}
            <span className="pf-tab-count">{count}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className={notice.ok ? "detail-banner" : "error-banner"} role="status">
          <span>{notice.text}</span>
        </div>
      )}

      {/* ===================== Shifts (setup) ===================== */}
      {mode === "setup" && (
        <>
          <div className="sh-types">
            {(types || []).length === 0 && !form && (
              <div className="card sh-types-empty">
                <strong>No shifts set up yet</strong>
                <span>Add each shift your company works once (e.g. General 10:00 AM – 7:00 PM), then assign them.</span>
              </div>
            )}
            {shifts
              .filter((s) => s.name)
              .map((s) => (
                <div key={s.key} className={`card sh-type ${isNight(s.start, s.end) ? "is-night" : ""}`}>
                  <div className="sh-type-head">
                    <span className="sh-type-name">{s.name}</span>
                    {isNight(s.start, s.end) && <span className="sh-night">Night</span>}
                  </div>
                  <div className="sh-type-time">
                    {clock(s.start)} <span aria-hidden="true">→</span> {clock(s.end)}
                  </div>
                  <div className="sh-type-meta">
                    <span>{hoursOf(s.start, s.end)}</span>
                    <button
                      type="button"
                      className="bi-link"
                      onClick={() => {
                        setMode("list");
                        setShiftFilter(s.key);
                      }}
                    >
                      {s.count} employee{s.count === 1 ? "" : "s"}
                    </button>
                  </div>
                  <div className="sh-type-actions">
                    <button type="button" className="btn" onClick={() => setForm({ ...EMPTY_FORM, id: s.id, name: s.name, in: s.start, out: s.end })}>
                      Edit
                    </button>
                    <button type="button" className="btn sh-remove" onClick={() => removeType(s)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            {!form && (
              <button type="button" className="sh-type-add" onClick={() => setForm({ ...EMPTY_FORM })}>
                <span aria-hidden="true">+</span> Add shift
              </button>
            )}
          </div>

          {form && (
            <form className="card sh-step sh-form" onSubmit={saveForm}>
              <h2 className="sh-step-title">{form.id ? `Edit ${editing?.name || "shift"}` : "New shift"}</h2>
              <div className="sh-times">
                <div className="sh-field sh-field-name">
                  <label htmlFor="sf-name">Name</label>
                  <input
                    id="sf-name"
                    className="bi-input"
                    placeholder="e.g. General, Morning, Night"
                    maxLength={40}
                    value={form.name}
                    autoFocus
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="sh-field">
                  <label htmlFor="sf-in">In</label>
                  <input id="sf-in" className="bi-input" type="time" value={form.in} onChange={(e) => setForm((f) => ({ ...f, in: e.target.value }))} />
                </div>
                <span className="sh-arrow" aria-hidden="true">
                  →
                </span>
                <div className="sh-field">
                  <label htmlFor="sf-out">Out</label>
                  <input id="sf-out" className="bi-input" type="time" value={form.out} onChange={(e) => setForm((f) => ({ ...f, out: e.target.value }))} />
                </div>
                <div className="sh-preview">
                  {form.in && form.out && form.in !== form.out ? (
                    <ShiftPill start={form.in} end={form.out} />
                  ) : (
                    <span className="sh-hint">Out earlier than In = night shift</span>
                  )}
                </div>
              </div>
              {timesChanged && editingCount > 0 && (
                <label className="sh-check">
                  <input
                    type="checkbox"
                    checked={form.moveEmployees}
                    onChange={(e) => setForm((f) => ({ ...f, moveEmployees: e.target.checked }))}
                  />
                  Also move the {editingCount} employee{editingCount === 1 ? "" : "s"} on {clock(editing.in)} – {clock(editing.out)} to the new times
                </label>
              )}
              <div className="sh-form-actions">
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : form.id ? "Save shift" : "Add shift"}
                </button>
              </div>
            </form>
          )}

          {unnamed.length > 0 && (
            <section className="card sh-step">
              <h2 className="sh-step-title">Times in use without a name</h2>
              <p className="sh-hint">Employees already have these times. Give them a name to pick them easily.</p>
              <div className="sh-chips">
                {unnamed.map((s) => (
                  <button key={s.key} type="button" className="sh-chip" onClick={() => setForm({ ...EMPTY_FORM, in: s.start, out: s.end })}>
                    {clock(s.start)} – {clock(s.end)}
                    <span className="sh-chip-count">{s.count}</span>
                    <span className="sh-chip-add">Name it</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ===================== Shift list: cards ===================== */}
      {listView && (
        <div className="sh-cards" role="tablist" aria-label="Shifts">
          <button
            type="button"
            role="tab"
            aria-selected={shiftFilter === "any"}
            className={`sh-card ${shiftFilter === "any" ? "is-on" : ""}`}
            onClick={() => setShiftFilter("any")}
          >
            <span className="sh-card-time">All shifts</span>
            <span className="sh-card-meta">With a shift</span>
            <span className="sh-card-count">{withShift}</span>
          </button>
          {shifts.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={shiftFilter === s.key}
              className={`sh-card ${shiftFilter === s.key ? "is-on" : ""} ${isNight(s.start, s.end) ? "is-night" : ""}`}
              onClick={() => setShiftFilter(s.key)}
            >
              <span className="sh-card-time">{s.name || `${clock(s.start)} – ${clock(s.end)}`}</span>
              <span className="sh-card-meta">
                {s.name ? `${clock(s.start)} – ${clock(s.end)} · ` : ""}
                {hoursOf(s.start, s.end)}
                {isNight(s.start, s.end) && <span className="sh-night">Night</span>}
              </span>
              <span className="sh-card-count">{s.count}</span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={shiftFilter === "none"}
            className={`sh-card is-empty ${shiftFilter === "none" ? "is-on" : ""}`}
            onClick={() => setShiftFilter("none")}
          >
            <span className="sh-card-time">No shift</span>
            <span className="sh-card-meta">Not given yet</span>
            <span className="sh-card-count">{withoutShift}</span>
          </button>
        </div>
      )}

      {/* ===================== Assign: step 1 ===================== */}
      {mode === "assign" && (
        <section className="card sh-step">
          <h2 className="sh-step-title">
            <span className="sh-step-no">1</span> Pick the shift
            {(types || []).length === 0 && (
              <button type="button" className="bi-link sh-title-link" onClick={() => switchTo("setup")}>
                Set up shifts first
              </button>
            )}
          </h2>
          {shiftPicker}
        </section>
      )}

      {/* ===================== list / assign: employees ===================== */}
      {mode !== "setup" && (
        <section className="card sh-step sh-list">
          {mode === "assign" && (
            <h2 className="sh-step-title">
              <span className="sh-step-no">2</span> Tick employees
            </h2>
          )}
          <div className="sh-filters">
            {mode === "assign" && (
              <div className="sh-seg" role="radiogroup" aria-label="Show">
                {[
                  ["none", `No shift (${withoutShift})`],
                  ["any", `With shift (${withShift})`],
                  ["all", `All (${active.length})`]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={shiftFilter === key}
                    className={shiftFilter === key ? "is-on" : ""}
                    onClick={() => setShiftFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <select
              className="bi-input"
              aria-label="Department"
              value={filter.department}
              onChange={(e) => setFilter((f) => ({ ...f, department: e.target.value, subDepartment: "" }))}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="bi-input"
              aria-label="Sub department"
              value={filter.subDepartment}
              disabled={!filterSubs.length}
              onChange={(e) => setFilter((f) => ({ ...f, subDepartment: e.target.value }))}
            >
              <option value="">All sub departments</option>
              {filterSubs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              className="bi-input sh-search"
              type="search"
              aria-label="Search"
              placeholder="Search name or code"
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <div className="sh-count">
            {shown.length} employee{shown.length === 1 ? "" : "s"}
            {picked.size > 0 && <strong> · {picked.size} ticked</strong>}
          </div>

          {!employees && !error && <Loader text="Loading employees…" />}
          {employees && (
            <div className="table-scroll sh-scroll">
              <table className="sh-table sh-hide-dept">
                <thead>
                  <tr>
                    {mayChange && (
                      <th className="sh-col-check">
                        <input
                          type="checkbox"
                          aria-label="Tick every employee shown"
                          checked={allShownPicked}
                          onChange={toggleAll}
                          disabled={!shown.length}
                        />
                      </th>
                    )}
                    <th className="sh-col-id">ID</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>{listView ? "Shift" : "Shift now"}</th>
                    {!listView && <th>After</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={(mayChange ? 1 : 0) + (listView ? 4 : 5)} className="sh-empty">
                        {active.length === 0
                          ? "No active employees yet."
                          : shiftFilter === "none"
                            ? "Everyone shown has a shift."
                            : "No employees match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((e) => {
                    const on = picked.has(e.employeeId);
                    const same = keyOf(e) === targetKey;
                    return (
                      <tr key={e.employeeId} className={on ? "is-on" : undefined} onClick={() => toggle(e.employeeId)}>
                        {mayChange && (
                          <td className="sh-col-check" onClick={(ev) => ev.stopPropagation()}>
                            <input type="checkbox" aria-label={`Tick ${e.name}`} checked={on} onChange={() => toggle(e.employeeId)} />
                          </td>
                        )}
                        <td className="sh-col-id">{e.employeeId}</td>
                        <td>
                          <span className="sh-name">{e.name}</span>
                          {e.designation && <span className="sh-sub">{e.designation}</span>}
                        </td>
                        <td>
                          <span className="sh-dept">{e.department || "—"}</span>
                          {e.subDepartment && <span className="sh-sub">{e.subDepartment}</span>}
                        </td>
                        <td>
                          <ShiftPill
                            start={e.shift?.in}
                            end={e.shift?.out}
                            name={nameByKey.get(keyOf(e))}
                            muted={!listView && on && !same && targetOk}
                          />
                        </td>
                        {!listView && (
                          <td>
                            {!on || !targetOk ? (
                              <span className="sh-none">—</span>
                            ) : same ? (
                              <span className="sh-none">No change</span>
                            ) : (
                              <ShiftPill start={target.in} end={target.out} name={targetName} />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Action bar: shows once someone is ticked. */}
      {mayChange && mode !== "setup" && picked.size > 0 && (
        <div className="sh-bar" role="region" aria-label="Selected employees">
          <div className="sh-bar-inner">
            <div className="sh-bar-count">
              <strong>{picked.size}</strong> ticked
              {alreadyOn > 0 && <span className="sh-sub"> · {alreadyOn} already on this shift</span>}
              <button type="button" className="bi-link" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>
            {listView && <div className="sh-bar-picker">{shiftPicker}</div>}
            <div className="sh-bar-actions">
              {chosen.some((e) => keyOf(e)) && (
                <button type="button" className="btn sh-remove" disabled={saving} onClick={() => apply(true)}>
                  Remove shift
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={saving || !targetOk} onClick={() => apply(false)}>
                {saving
                  ? "Saving…"
                  : !targetOk
                    ? "Pick the shift first"
                    : `${listView ? "Move" : "Assign"} ${picked.size} to ${targetName || `${clock(target.in)} – ${clock(target.out)}`}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
