import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import { STATES } from "../data/places";
import { payrollSettings, salaryStructure, setPayrollSettings } from "@salary";

// Payroll Settings (top-right menu, admin / HR only): the rates and switches
// the salary formulas use -- PF, ESIC, Professional Tax, basic and HRA share,
// statutory bonus, minimum wages by state. Saved once for the whole company
// (server/payrollSettings); Add Employee, Month Shift Pay, histories and
// exports all use them. Server: GET / PUT /api/payroll-settings.

const errorText = (err) => err.response?.data?.message || err.message;
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// On / off switch with a sliding knob and a Yes / No word beside it.
export function Toggle({ id, value, onChange, disabled }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className={`prs-toggle ${value ? "is-on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <span className="prs-toggle-track">
        <span className="prs-toggle-knob" />
      </span>
      <span className="prs-toggle-word">{value ? "Yes" : "No"}</span>
    </button>
  );
}

// Number box with ₹ in front or % behind.
function Amount({ id, value, onChange, unit, disabled, step = "1" }) {
  return (
    <div className={`prs-amount ${disabled ? "is-disabled" : ""}`}>
      {unit === "₹" && <span className="prs-affix">₹</span>}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        max={unit === "%" ? 100 : undefined}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      {unit === "%" && <span className="prs-affix">%</span>}
    </div>
  );
}

// One setting: name and a plain-words explanation on the left, control on the right.
export function Row({ id, label, hint, disabled, children }) {
  return (
    <div className={`prs-row ${disabled ? "is-disabled" : ""}`}>
      <div className="prs-row-text">
        <label htmlFor={id}>{label}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="prs-row-control">{children}</div>
    </div>
  );
}

// State dropdown: every Indian state (same list as Add Employee), the ones
// where employees work first with their headcount (GET /employees).
// exclude: lower-case names already set up, left out of the list.
function StateSelect({ id, value, onChange, counts, exclude, placeholder, label }) {
  const open = STATES.filter((name) => !exclude?.has(name.toLowerCase()));
  const staffed = open.filter((name) => counts[name.toLowerCase()]).sort((a, b) => counts[b.toLowerCase()] - counts[a.toLowerCase()]);
  const others = open.filter((name) => !counts[name.toLowerCase()]);
  const option = (name) => (
    <option key={name} value={name}>
      {name}
      {counts[name.toLowerCase()] ? ` (${counts[name.toLowerCase()]} employees)` : ""}
    </option>
  );
  return (
    <select id={id} aria-label={label} className="prs-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {staffed.length > 0 && <optgroup label="Where employees work">{staffed.map(option)}</optgroup>}
      <optgroup label={staffed.length ? "Other states" : "States"}>{others.map(option)}</optgroup>
    </select>
  );
}

// collapsible: a dropdown (closed until clicked), as on the Pay Formulas page.
export function Section({ id, title, intro, children, collapsible }) {
  if (collapsible) {
    return (
      <details className="prs-section prs-drop" id={id}>
        <summary>
          <span>
            <h2 id={`${id}-title`}>{title}</h2>
            {intro && <p>{intro}</p>}
          </span>
        </summary>
        <div className="prs-rows">{children}</div>
      </details>
    );
  }
  return (
    <section className="prs-section" id={id} aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      <div className="prs-rows">{children}</div>
    </section>
  );
}

// embedded: shown inside Pay Formulas ("Payroll Settings" tab), every section
// a dropdown. onSaved(values) runs after a save.
export default function PayrollSettings({ embedded = false, onSaved } = {}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [newState, setNewState] = useState({ name: "", wage: "" });
  const [newPtState, setNewPtState] = useState("");
  const [stateCounts, setStateCounts] = useState({}); // "rajasthan" -> employees there
  const [example, setExample] = useState({ ctc: 20000, state: "Rajasthan", pf: true, esic: true });

  useEffect(() => {
    api
      .get("/payroll-settings")
      .then(({ data }) => {
        setDraft(data.values);
        setSaved(data.values);
        setDefaults(data.defaults);
      })
      .catch((err) => setError(errorText(err)));
    // Headcount by state for the dropdowns; the dropdowns work without it.
    api
      .get("/employees")
      .then(({ data }) => {
        const counts = {};
        for (const e of Array.isArray(data) ? data : []) {
          const key = String(e.state || "").trim().toLowerCase();
          if (key) counts[key] = (counts[key] || 0) + 1;
        }
        setStateCounts(counts);
      })
      .catch(() => {});
  }, []);

  const set = (key) => (value) => {
    setNotice("");
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const changed = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  // The example employee's split with the settings on screen (not yet saved).
  const preview = useMemo(() => {
    if (!draft) return null;
    const inUse = payrollSettings();
    try {
      setPayrollSettings(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "" ? 0 : v])));
      return salaryStructure({ monthlyCtc: example.ctc, state: example.state, pfApplicable: example.pf, esicApplicable: example.esic });
    } finally {
      setPayrollSettings(inUse);
    }
  }, [draft, example]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/payroll-settings", draft);
      setPayrollSettings(data.values);
      setDraft(data.values);
      setSaved(data.values);
      setNotice("Saved. New salary splits use these settings from now on.");
      onSaved?.(data.values);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    const sure = await confirm({
      title: "Back to standard rates?",
      message: "The form goes back to PF 12%, ESIC 0.75% / 3.25%, basic 50% and the other standard values. Nothing changes until you press Save.",
      confirmLabel: "Use standard rates"
    });
    if (sure) setDraft(defaults);
  }

  function addState(e) {
    e.preventDefault();
    const name = newState.name.trim().toLowerCase();
    if (!name || newState.wage === "") return;
    set("minWages")({ ...draft.minWages, [name]: Number(newState.wage) });
    setNewState({ name: "", wage: "" });
  }

  // ---- PT slabs ----
  const setPt = (state, rule) => set("ptSlabs")({ ...draft.ptSlabs, [state]: rule });
  const setSlab = (state, i, patch) => {
    const rule = draft.ptSlabs[state];
    setPt(state, { ...rule, slabs: rule.slabs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  };
  // A new slab goes just before the "and above" one, starting where the previous ends.
  const addSlab = (state) => {
    const rule = draft.ptSlabs[state];
    const prev = rule.slabs.length > 1 ? Number(rule.slabs.at(-2).upTo) || 0 : 0;
    const slabs = [...rule.slabs.slice(0, -1), { upTo: prev + 10000, pt: 0 }, rule.slabs.at(-1)];
    setPt(state, { ...rule, slabs });
  };
  const removeSlab = (state, i) => {
    const rule = draft.ptSlabs[state];
    const slabs = rule.slabs.filter((_, j) => j !== i);
    slabs[slabs.length - 1] = { ...slabs.at(-1), upTo: null };
    setPt(state, { ...rule, slabs });
  };
  async function removePtState(state) {
    const sure = await confirm({
      title: `Remove PT for ${titleCase(state)}?`,
      message: "Employees in this state will have no Professional Tax once you save.",
      confirmLabel: "Remove",
      danger: true
    });
    if (!sure) return;
    const rest = { ...draft.ptSlabs };
    delete rest[state];
    set("ptSlabs")(rest);
  }
  function addPtState(e) {
    e.preventDefault();
    const name = newPtState.trim().toLowerCase();
    if (!name || draft.ptSlabs?.[name]) return;
    setPt(name, { slabs: [{ upTo: null, pt: 0 }], februaryTop: 0 });
    setNewPtState("");
  }

  function removeState(state) {
    const rest = { ...draft.minWages };
    delete rest[state];
    set("minWages")(rest);
  }

  if (error && !draft) {
    return (
      <div className="error-banner">
        <span>{error}</span>
      </div>
    );
  }
  if (!draft) return <Loader text="Loading payroll settings…" />;

  const pfOff = !draft.pfEnabled;
  const capOff = pfOff || !draft.pfCeilingRequired;
  const esicOff = !draft.esicEnabled;
  const deductions = preview ? preview.pfEmployee + preview.esicEmployee + preview.professionalTax : 0;
  const gross = preview ? preview.basic + preview.hra + preview.statutoryBonus + preview.specialAllowance : 0;

  return (
    <div className={`prs ${changed ? "has-changes" : ""} ${embedded ? "prs-embedded" : ""}`}>
      {embedded ? (
        <div className="prs-embedded-head">
          <p>
            The numbers and switches the formulas use (PF_EMPLOYEE_RATE, BASIC_PERCENT, MINWAGE, PTSLAB …). Open a section to change it, then
            press <b>Save settings</b>.
          </p>
          <button className="btn btn-ghost" onClick={resetDefaults} disabled={saving}>
            Standard rates
          </button>
        </div>
      ) : (
        <div className="page-header">
          <div>
            <h1 className="page-title">Payroll Settings</h1>
            <p className="page-subtitle">
              Company-wide PF, ESIC and Professional Tax rules. Add Employee, Salary revision, Month Shift Register &amp; Pay and
              the exports all use these. Only HR (admin) can change them.
            </p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-ghost" onClick={resetDefaults} disabled={saving}>
              Standard rates
            </button>
          </div>
        </div>
      )}

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
          <Section collapsible={embedded} id="prs-pf" title="Provident Fund (PF)" intro="Deducted from the employee and matched by the company.">
            <Row id="prs-pf-on" label="Does the company have PF?" hint="No turns PF off for everyone, whatever the employee master says.">
              <Toggle id="prs-pf-on" value={draft.pfEnabled} onChange={set("pfEnabled")} />
            </Row>
            <Row id="prs-pf-emp" label="Employee PF" hint="Share of basic + bonus + special, cut from salary." disabled={pfOff}>
              <Amount id="prs-pf-emp" unit="%" step="0.01" value={draft.pfEmployeeRate} onChange={set("pfEmployeeRate")} disabled={pfOff} />
            </Row>
            <Row id="prs-pf-er" label="Employer PF" hint="Company's share. Part of CTC, not paid to the employee." disabled={pfOff}>
              <Amount id="prs-pf-er" unit="%" step="0.01" value={draft.pfEmployerRate} onChange={set("pfEmployerRate")} disabled={pfOff} />
            </Row>
            <Row id="prs-pf-cap" label="PF ceiling required?" hint="Cap PF at a fixed monthly amount." disabled={pfOff}>
              <Toggle id="prs-pf-cap" value={draft.pfCeilingRequired} onChange={set("pfCeilingRequired")} disabled={pfOff} />
            </Row>
            <Row id="prs-pf-limit" label="PF wage limit" hint="From this basic up, PF is the flat maximum below." disabled={capOff}>
              <Amount id="prs-pf-limit" unit="₹" value={draft.pfWageLimit} onChange={set("pfWageLimit")} disabled={capOff} />
            </Row>
            <Row id="prs-pf-max" label="Maximum PF a month" hint="Highest PF cut in one month." disabled={capOff}>
              <Amount id="prs-pf-max" unit="₹" value={draft.pfMaxAmount} onChange={set("pfMaxAmount")} disabled={capOff} />
            </Row>
          </Section>

          <Section collapsible={embedded} id="prs-esi" title="ESIC" intro="Employees' State Insurance, worked out on basic.">
            <Row id="prs-esi-on" label="Does the company have ESIC?" hint="No turns ESIC off for everyone.">
              <Toggle id="prs-esi-on" value={draft.esicEnabled} onChange={set("esicEnabled")} />
            </Row>
            <Row id="prs-esi-emp" label="Employee ESIC" hint="Cut from salary." disabled={esicOff}>
              <Amount id="prs-esi-emp" unit="%" step="0.01" value={draft.esicEmployeeRate} onChange={set("esicEmployeeRate")} disabled={esicOff} />
            </Row>
            <Row id="prs-esi-er" label="Employer ESIC" hint="Company's share, part of CTC." disabled={esicOff}>
              <Amount id="prs-esi-er" unit="%" step="0.01" value={draft.esicEmployerRate} onChange={set("esicEmployerRate")} disabled={esicOff} />
            </Row>
            <Row id="prs-esi-ceil" label="ESIC ceiling" hint="Monthly gross above this gets no ESIC. 0 = no limit (statutory limit is 21,000)." disabled={esicOff}>
              <Amount id="prs-esi-ceil" unit="₹" value={draft.esicCeiling} onChange={set("esicCeiling")} disabled={esicOff} />
            </Row>
          </Section>

          <Section collapsible={embedded} id="prs-split" title="Professional Tax and salary split">
            <Row id="prs-pt" label="Deduct Professional Tax?" hint="Uses the slabs by state below. A state with no slabs (e.g. Rajasthan) has no PT.">
              <Toggle id="prs-pt" value={draft.ptEnabled} onChange={set("ptEnabled")} />
            </Row>
            <Row id="prs-basic" label="Basic" hint="Share of monthly CTC. Never below the state's minimum wage.">
              <Amount id="prs-basic" unit="%" step="0.01" value={draft.basicPercent} onChange={set("basicPercent")} />
            </Row>
            <Row id="prs-hra" label="HRA" hint="At most this share of basic.">
              <Amount id="prs-hra" unit="%" step="0.01" value={draft.hraPercent} onChange={set("hraPercent")} />
            </Row>
            <Row id="prs-bonus" label="Statutory bonus" hint="Paid every month.">
              <Amount id="prs-bonus" unit="₹" value={draft.statutoryBonus} onChange={set("statutoryBonus")} />
            </Row>
            <Row id="prs-bonus-limit" label="No bonus from yearly CTC" hint="Employees earning this much a year or more get no bonus.">
              <Amount id="prs-bonus-limit" unit="₹" value={draft.bonusYearlyLimit} onChange={set("bonusYearlyLimit")} />
            </Row>
          </Section>

          <Section collapsible={embedded}
            id="prs-ptslabs"
            title="Professional Tax slabs by state"
            intro="Monthly gross decides the PT. First matching slab wins; the last slab covers everything above."
          >
            {Object.entries(draft.ptSlabs || {}).map(([state, rule]) => (
              <div key={state} className={`prs-pt-state ${draft.ptEnabled ? "" : "is-disabled"}`}>
                <div className="prs-pt-head">
                  <h3>{titleCase(state)}</h3>
                  <label className="prs-pt-feb">
                    February, top slab
                    <Amount
                      id={`prs-pt-feb-${state}`}
                      unit="₹"
                      value={rule.februaryTop}
                      onChange={(v) => setPt(state, { ...rule, februaryTop: v })}
                    />
                  </label>
                  <button className="prs-remove" type="button" onClick={() => removePtState(state)}>
                    Remove state
                  </button>
                </div>
                <table className="prs-pt-table">
                  <thead>
                    <tr>
                      <th>Monthly gross</th>
                      <th>PT a month</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rule.slabs.map((slab, i) => {
                      const last = i === rule.slabs.length - 1;
                      const from = i === 0 ? 0 : rule.slabs[i - 1].upTo;
                      return (
                        <tr key={i}>
                          <td>
                            {last ? (
                              <span className="prs-pt-above">
                                {i === 0 ? "Any gross" : `Above ₹ ${money.format(Number(from) || 0)}`}
                              </span>
                            ) : (
                              <div className="prs-pt-upto">
                                <span>Up to</span>
                                <Amount
                                  id={`prs-pt-${state}-${i}`}
                                  unit="₹"
                                  step="0.01"
                                  value={slab.upTo}
                                  onChange={(v) => setSlab(state, i, { upTo: v })}
                                />
                              </div>
                            )}
                          </td>
                          <td>
                            <Amount
                              id={`prs-pt-${state}-${i}-pt`}
                              unit="₹"
                              value={slab.pt}
                              onChange={(v) => setSlab(state, i, { pt: v })}
                            />
                          </td>
                          <td>
                            {rule.slabs.length > 1 && (
                              <button className="prs-remove" type="button" onClick={() => removeSlab(state, i)} aria-label={`Remove slab ${i + 1}`}>
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button className="btn btn-ghost prs-pt-add" type="button" onClick={() => addSlab(state)}>
                  + Add slab
                </button>
              </div>
            ))}
            <form className="prs-add-state" onSubmit={addPtState}>
              <StateSelect
                label="State for PT slabs"
                placeholder="Add PT for a state…"
                value={newPtState}
                onChange={setNewPtState}
                counts={stateCounts}
                exclude={new Set(Object.keys(draft.ptSlabs || {}))}
              />
              <button className="btn" type="submit" disabled={!newPtState.trim() || Boolean(draft.ptSlabs?.[newPtState.trim().toLowerCase()])}>
                Add state
              </button>
            </form>
          </Section>

          <Section collapsible={embedded} id="prs-wages" title="Minimum wage by state" intro="Basic is never set below these.">
            {Object.entries(draft.minWages || {}).map(([state, wage]) => (
              <Row key={state} id={`prs-mw-${state}`} label={titleCase(state)}>
                <Amount
                  id={`prs-mw-${state}`}
                  unit="₹"
                  value={wage}
                  onChange={(v) => set("minWages")({ ...draft.minWages, [state]: v })}
                />
                <button className="prs-remove" type="button" onClick={() => removeState(state)} aria-label={`Remove ${titleCase(state)}`}>
                  Remove
                </button>
              </Row>
            ))}
            <form className="prs-add-state" onSubmit={addState}>
              <StateSelect
                label="New state"
                placeholder="Add a state…"
                value={newState.name}
                onChange={(name) => setNewState({ ...newState, name })}
                counts={stateCounts}
                exclude={new Set(Object.keys(draft.minWages || {}))}
              />
              <div className="prs-amount">
                <span className="prs-affix">₹</span>
                <input
                  aria-label="Minimum wage"
                  type="number"
                  min="0"
                  placeholder="Minimum wage"
                  value={newState.wage}
                  onChange={(e) => setNewState({ ...newState, wage: e.target.value })}
                />
              </div>
              <button className="btn" type="submit" disabled={!newState.name.trim() || newState.wage === ""}>
                Add
              </button>
            </form>
          </Section>
        </div>

        <aside className="prs-aside">
          <div className="prs-example">
            <h2>Live example</h2>
            <p>One employee with the settings on this page{changed ? " (not saved yet)" : ""}.</p>
            <div className="prs-example-inputs">
              <label>
                Monthly CTC
                <div className="prs-amount">
                  <span className="prs-affix">₹</span>
                  <input type="number" min="0" value={example.ctc} onChange={(e) => setExample({ ...example, ctc: Number(e.target.value) || 0 })} />
                </div>
              </label>
              <label>
                State
                <StateSelect label="State" value={example.state} onChange={(state) => setExample({ ...example, state })} counts={stateCounts} />
              </label>
              <div className="prs-example-flags">
                <label className="prs-check">
                  <input type="checkbox" checked={example.pf} onChange={(e) => setExample({ ...example, pf: e.target.checked })} /> PF
                </label>
                <label className="prs-check">
                  <input type="checkbox" checked={example.esic} onChange={(e) => setExample({ ...example, esic: e.target.checked })} /> ESIC
                </label>
              </div>
            </div>
            {preview && (
              <>
                <dl className="prs-lines">
                  <div><dt>Basic</dt><dd>{money.format(preview.basic)}</dd></div>
                  <div><dt>HRA</dt><dd>{money.format(preview.hra)}</dd></div>
                  <div><dt>Bonus</dt><dd>{money.format(preview.statutoryBonus)}</dd></div>
                  <div><dt>Special</dt><dd>{money.format(preview.specialAllowance)}</dd></div>
                  <div className="prs-sum"><dt>Gross</dt><dd>{money.format(gross)}</dd></div>
                  <div className="prs-minus"><dt>Employee PF</dt><dd>− {money.format(preview.pfEmployee)}</dd></div>
                  <div className="prs-minus"><dt>Employee ESIC</dt><dd>− {money.format(preview.esicEmployee)}</dd></div>
                  <div className="prs-minus"><dt>Professional Tax</dt><dd>− {money.format(preview.professionalTax)}</dd></div>
                </dl>
                <div className="prs-inhand">
                  <span>In hand</span>
                  <b>₹ {money.format(preview.inHand)}</b>
                  <small>after ₹ {money.format(deductions)} deductions</small>
                </div>
                <dl className="prs-lines prs-employer">
                  <div><dt>Employer PF</dt><dd>{money.format(preview.pfEmployer)}</dd></div>
                  <div><dt>Employer ESIC</dt><dd>{money.format(preview.esicEmployer)}</dd></div>
                </dl>
              </>
            )}
          </div>
          <p className="prs-footnote">
            Saved salary splits are not rewritten: each employee picks up new settings the next time they are saved. Month Shift
            Register &amp; Pay and the history exports use them straight away.
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
