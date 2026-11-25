import { useEffect, useState } from "react";
import api from "../api/axios";
import { loadPayrollSettings } from "../auth/AuthContext";
import { useConfirm } from "./ConfirmDialog";

// Pay Formulas > pay versions: every version of the payroll settings and
// formulas ("0.1", "0.2", ...). Only the latest is edited on this page; older
// ones are frozen so the pay worked out with them never changes. Each
// employee's pay names its version (Add Employee > Joining & pay, Salary
// revision). Server: /api/payroll-settings (versions, POST /versions).

const when = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

// What a version holds, read-only: its formula lists and main numbers.
function VersionDetail({ version, onClose }) {
  const v = version.values || {};
  const lists = [
    ["Salary split", v.splitFormulas],
    ["Month pay", v.monthFormulas],
    ["Your formulas", v.formulas]
  ];
  const numbers = [
    ["Basic %", v.basicPercent],
    ["HRA % of basic", v.hraPercent],
    ["PF employee / employer %", `${v.pfEmployeeRate ?? "–"} / ${v.pfEmployerRate ?? "–"}`],
    ["PF wage limit / max", `${v.pfWageLimit ?? "–"} / ${v.pfMaxAmount ?? "–"}`],
    ["ESIC employee / employer %", `${v.esicEmployeeRate ?? "–"} / ${v.esicEmployerRate ?? "–"}`],
    ["Bonus / no bonus from yearly CTC", `${v.statutoryBonus ?? "–"} / ${v.bonusYearlyLimit ?? "–"}`]
  ];
  return (
    <div className="pv-detail">
      <div className="pv-detail-head">
        <h3 className="emp-box-title">
          Version {version.version} <span className="pv-muted">(view only)</span>
        </h3>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="pv-numbers">
        {numbers.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "–"}</dd>
          </div>
        ))}
      </dl>
      {lists.map(([title, list]) =>
        list?.length ? (
          <div key={title}>
            <h4 className="emp-box-sub">{title}</h4>
            <table className="ps-table pv-table">
              <tbody>
                {list.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <code>{row.code}</code>
                      <div className="pv-muted">{row.name}</div>
                    </td>
                    <td className="pf-math">{row.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={title} className="pv-muted">
            {title}: standard list
          </p>
        )
      )}
    </div>
  );
}

export default function PayVersions() {
  const confirm = useConfirm();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [viewing, setViewing] = useState(null);

  async function load() {
    try {
      const { data } = await api.get("/payroll-settings");
      setVersions(data.versions || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const latest = versions?.at(-1);

  async function createVersion() {
    const ok = await confirm({
      title: "Make a new pay version?",
      message: `A copy of version ${latest?.version} is made and becomes the one you edit here. Version ${latest?.version} is then frozen: employees on it keep exactly their pay. New employees get the new version; move others to it with Edit details or Salary revision.`,
      confirmLabel: "Make new version"
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/payroll-settings/versions", { note });
      setNote("");
      await loadPayrollSettings(); // the formulas everywhere in this app
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  // Takes back the latest version (made by mistake). The server refuses the
  // first version and one any employee is on.
  async function deleteVersion(version) {
    const ok = await confirm({
      title: `Delete version ${version}?`,
      message: `Version ${version} is removed and version ${versions.at(-2)?.version} becomes the one you edit again. Only possible while no employee is on ${version}.`,
      confirmLabel: "Delete version",
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/payroll-settings/versions/${encodeURIComponent(version)}`);
      // The formulas on this page were the deleted version's: load the page
      // again so it shows (and saves) the version that is now the latest.
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setBusy(false);
    }
  }

  return (
    <section className="card pv">
      <div className="pv-head">
        <div>
          <h2 className="emp-box-title">Pay versions</h2>
          <p className="pv-muted">
            You are editing version <strong>{latest?.version || "…"}</strong> (the latest). Employees on it see changes at once; to keep their
            pay as it is, make a new version first and change that.
          </p>
        </div>
        <div className="pv-new">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. PF rule from 4.6 lakh" maxLength={200} />
          <button type="button" className="btn btn-primary" disabled={busy || !versions} onClick={createVersion}>
            {busy ? "Making…" : "+ New version"}
          </button>
        </div>
      </div>
      {error && (
        <p className="ae-docs-problem" role="alert">
          {error}
        </p>
      )}
      {versions && (
        <div className="pv-list">
          {[...versions].reverse().map((v, i) => (
            <div key={v.version} className={`pv-chip ${i === 0 ? "is-latest" : ""}`}>
              <strong>v{v.version}</strong>
              <span className="pv-muted">
                {i === 0 ? "latest, editable" : "frozen"} · {when(v.createdAt)}
                {v.note ? ` · ${v.note}` : ""}
              </span>
              <button type="button" className="btn" onClick={() => setViewing(viewing?.version === v.version ? null : v)}>
                {viewing?.version === v.version ? "Hide" : "View"}
              </button>
              {i === 0 && versions.length > 1 && (
                <button type="button" className="btn btn-danger-outline" disabled={busy} onClick={() => deleteVersion(v.version)}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {viewing && <VersionDetail version={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
