import { useState } from "react";
import api from "../api/axios";
import { useConfirm } from "./ConfirmDialog";

// An Employees card's Exit form, and for an employee who has left, the exit
// details with Rejoin and Undo exit. The server closes and reopens the state,
// department and pay histories (server/employee/employee.controller.js).

export const EXIT_TYPES = ["Resigned", "Terminated", "Retired", "Absconding", "Death", "Contract end"];
const NOTICE = ["Yes", "No", "Waived"];

// "2026-08-01" (date input) -> "01-08-2026"
const fromDateInput = (value) => value.split("-").reverse().join("-");

const path = (employee, action) => `/employees/${encodeURIComponent(employee.employeeId)}/${action}`;

// One labelled input of these forms.
function Row({ label, required, children }) {
  return (
    <label className="detail-row detail-row-edit">
      <span className="detail-label">
        {label}
        {required && <span className="field-required"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Choice({ value, onChange, options }) {
  return (
    <select className="detail-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

// Posts body to the card's action and hands the updated record to onDone;
// returns [saving, error, setError, send].
function useAction(employee, action, onDone) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function send(body) {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(path(employee, action), body);
      onDone(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }
  return [saving, error, setError, send];
}

// Exit form: POSTs /api/employees/:employeeId/exit.
export function ExitForm({ employee, onDone, onCancel }) {
  const [form, setForm] = useState({
    exitType: "",
    resignationDate: "",
    lastWorkingDay: "",
    reason: "",
    noticeServed: "",
    rehireEligible: "",
    remark: ""
  });
  const [saving, error, setError, send] = useAction(employee, "exit", onDone);
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };

  function submit(e) {
    e.preventDefault();
    const missing = [
      ["exitType", "the exit type"],
      ["lastWorkingDay", "the last working day"],
      ["reason", "the reason"],
      ["noticeServed", "whether notice was served"],
      ["rehireEligible", "whether they may be rehired"]
    ].find(([key]) => !form[key].trim());
    if (missing) {
      setError(`Fill in ${missing[1]}`);
      return;
    }
    send({
      ...form,
      resignationDate: form.resignationDate ? fromDateInput(form.resignationDate) : "",
      lastWorkingDay: fromDateInput(form.lastWorkingDay)
    });
  }

  return (
    <form className="st-form" onSubmit={submit}>
      <h3 className="ss-group-title">Employee leaving</h3>
      <p className="st-note">
        From the day after the last working day they show as Inactive. Their record and history are kept; nothing is
        deleted. Rejoin or Undo exit later if needed.
      </p>
      <div className="st-fields">
        <Row label="Exit type" required>
          <Choice value={form.exitType} onChange={set("exitType")} options={EXIT_TYPES} />
        </Row>
        <Row label="Resignation date">
          <input
            className="detail-input"
            type="date"
            value={form.resignationDate}
            onChange={(e) => set("resignationDate")(e.target.value)}
          />
        </Row>
        <Row label="Last working day" required>
          <input
            className="detail-input"
            type="date"
            value={form.lastWorkingDay}
            onChange={(e) => set("lastWorkingDay")(e.target.value)}
          />
        </Row>
        <Row label="Notice served" required>
          <Choice value={form.noticeServed} onChange={set("noticeServed")} options={NOTICE} />
        </Row>
        <Row label="Reason" required>
          <input
            className="detail-input"
            value={form.reason}
            placeholder="e.g. Better offer, moving home town"
            onChange={(e) => set("reason")(e.target.value)}
          />
        </Row>
        <Row label="Rehire eligible" required>
          <Choice value={form.rehireEligible} onChange={set("rehireEligible")} options={["Yes", "No"]} />
        </Row>
        <Row label="Remark">
          <input
            className="detail-input"
            value={form.remark}
            placeholder="e.g. F&F paid, tools returned"
            onChange={(e) => set("remark")(e.target.value)}
          />
        </Row>
      </div>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      <div className="st-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save exit"}
        </button>
      </div>
    </form>
  );
}

// A left employee's exit details, with Rejoin (a small form) and Undo exit.
// onDone(updated record, "rejoin" | "undo").
export function ExitPanel({ employee, exit, canChange, onDone }) {
  const confirm = useConfirm();
  const [rejoining, setRejoining] = useState(false);
  const [rejoinDate, setRejoinDate] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, error, setError, send] = useAction(employee, rejoining ? "rejoin" : "undo-exit", (data) =>
    onDone(data, rejoining ? "rejoin" : "undo")
  );

  const facts = [
    ["Exit type", exit.exitType],
    ["Resignation date", exit.resignationDate],
    ["Last working day", exit.lastWorkingDay],
    ["Reason", exit.reason],
    ["Notice served", exit.noticeServed],
    ["Rehire eligible", exit.rehireEligible == null ? "" : exit.rehireEligible ? "Yes" : "No"],
    ["Remark", exit.remark]
  ];

  async function undo() {
    const sure = await confirm({
      title: "Undo exit?",
      message: `${employee.name} becomes active again as if they never left.`,
      confirmLabel: "Undo exit"
    });
    if (sure) send({});
  }

  function rejoin(e) {
    e.preventDefault();
    if (!rejoinDate) {
      setError("Pick the rejoin date");
      return;
    }
    send({ rejoinDate: fromDateInput(rejoinDate), remark });
  }

  return (
    <section className="st-form exit-panel">
      <h3 className="ss-group-title">Left on {exit.lastWorkingDay}</h3>
      <p className="st-note">
        Shown as Inactive. Salary revision and transfers are closed until they rejoin.
      </p>
      <dl className="ss-rows exit-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="ss-row">
            <dt>{label}</dt>
            <dd className="emp-detail-value">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {rejoining && (
        <form className="st-fields exit-rejoin" onSubmit={rejoin}>
          <Row label="Rejoin date" required>
            <input
              className="detail-input"
              type="date"
              value={rejoinDate}
              onChange={(e) => {
                setRejoinDate(e.target.value);
                setError("");
              }}
            />
          </Row>
          <Row label="Remark">
            <input
              className="detail-input"
              value={remark}
              placeholder="e.g. Rejoined as Karigar"
              onChange={(e) => setRemark(e.target.value)}
            />
          </Row>
          <p className="st-note exit-rejoin-note">
            Same code; they come back on the state, department and CTC they left with. Change those afterwards with
            Transfer or Salary revision.
          </p>
          <div className="st-actions">
            <button type="button" className="btn" onClick={() => setRejoining(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save rejoin"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      {canChange && !rejoining && (
        <div className="st-actions">
          <button type="button" className="btn" onClick={undo} disabled={saving}>
            Undo exit
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError("");
              setRejoining(true);
            }}
            disabled={saving}
          >
            Rejoin
          </button>
        </div>
      )}
    </section>
  );
}
