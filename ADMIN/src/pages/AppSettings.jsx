import { useEffect, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import { Row, Section, Toggle } from "./PayrollSettings";

// Employee App settings (top-right menu, admin / HR only): what employees see
// and can do in the employee app (HRDK-EMP-APP). The server refuses anything
// switched off, not just the screens. Server: GET / PUT /api/app-settings
// (server/appSettings/appSettings.route.js), which also holds the list.

const errorText = (err) => err.response?.data?.message || err.message;

const GROUPS = [
  { id: "aps-att", title: "Attendance", intro: "Daily punches from the COSEC machines.", keys: ["attendance", "punchTimes"] },
  { id: "aps-leave", title: "Leave", intro: "Leave left, history and requests.", keys: ["leave", "leaveApply"] },
  { id: "aps-pay", title: "Salary", intro: "Payslips from the Pay Sheet (BC365).", keys: ["salary"] },
  { id: "aps-other", title: "Chat, documents and profile", keys: ["chat", "documents", "profileEdit"] }
];

// The tabs and Home cards the employee gets with these switches.
function whatTheySee(f) {
  return [
    ["Home", true, "Always on: greeting and quick links"],
    ["Attendance tab", f.attendance, f.attendance ? (f.punchTimes ? "With IN / OUT times" : "Status and worked hours only") : "Hidden"],
    ["Leave tab", f.leave, f.leave ? (f.leaveApply ? "Balance, history, apply" : "Balance and history, no apply") : "Hidden"],
    ["Salary tab", f.salary, f.salary ? "Payslips and last salary" : "Hidden"],
    ["Chat", f.chat, f.chat ? "Can message manager / HR" : "Hidden"],
    ["Me", true, [f.documents && "documents", f.profileEdit && "can fix details"].filter(Boolean).join(", ") || "Name and work details only"]
  ];
}

export default function AppSettings() {
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/app-settings")
      .then(({ data }) => {
        setList(data.list);
        setDraft(data.features);
        setSaved(data.features);
      })
      .catch((err) => setError(errorText(err)));
  }, []);

  const changed = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const byKey = new Map(list.map((f) => [f.key, f]));

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/app-settings", { features: draft });
      setDraft(data.features);
      setSaved(data.features);
      setNotice("Saved. Employees see the change the next time they open the app.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return error ? <div className="error-banner"><span>{error}</span></div> : <Loader text="Loading app settings…" />;

  return (
    <div className={`prs ${changed ? "has-changes" : ""}`}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee App</h1>
          <p className="page-subtitle">
            Choose what employees see and can do in the HRDK app. Anything switched off is hidden in the app and refused by the
            server too. Only HR (admin) can change this.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="prs-notice" role="status">
          {notice}
        </div>
      )}

      <div className="prs-layout">
        <div className="prs-main">
          {GROUPS.map((g) => (
            <Section key={g.id} id={g.id} title={g.title} intro={g.intro}>
              {g.keys.map((key) => {
                const f = byKey.get(key);
                if (!f) return null;
                const parentOff = f.needs && !draft[f.needs];
                return (
                  <Row
                    key={key}
                    id={`aps-${key}`}
                    label={f.label}
                    hint={parentOff ? `${f.note}. Off while "${byKey.get(f.needs)?.label}" is off.` : f.note}
                    disabled={parentOff}
                  >
                    <Toggle
                      id={`aps-${key}`}
                      value={Boolean(draft[key]) && !parentOff}
                      disabled={parentOff}
                      onChange={(v) => {
                        setNotice("");
                        setDraft((d) => ({ ...d, [key]: v }));
                      }}
                    />
                  </Row>
                );
              })}
            </Section>
          ))}
        </div>

        <aside className="prs-aside">
          <div className="prs-example">
            <h2>What employees see</h2>
            <dl className="prs-lines aps-see">
              {whatTheySee(draft).map(([name, on, note]) => (
                <div key={name} className={on ? "" : "is-off"}>
                  <dt>{name}</dt>
                  <dd>{note}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="prs-footnote">
            Leave approval, attendance and salary keep working in HRMS whatever is switched off here; this only changes the
            employee app.
          </p>
        </aside>
      </div>

      {changed && (
        <div className="prs-savebar" role="region" aria-label="Unsaved changes">
          <span>You have unsaved changes</span>
          <button className="btn btn-ghost" onClick={() => setDraft(saved)} disabled={saving}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </div>
  );
}
