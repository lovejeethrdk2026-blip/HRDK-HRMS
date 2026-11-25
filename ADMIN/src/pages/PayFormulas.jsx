import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { useConfirm } from "../components/ConfirmDialog";
import Loader from "../components/Loader";
import PayrollSettings from "./PayrollSettings";
import PayVersions from "../components/PayVersions";
import {
  PAY_VARIABLES,
  PAY_FUNCTIONS,
  SETTING_VARIABLES,
  FORMULA_STAGES,
  COMPONENT_TYPES,
  applyComponents,
  checkComponents,
  checkStage,
  describeFormula,
  runFormulas,
  sampleVariables,
  settingVariables,
  payrollSettings,
  setPayrollSettings,
  salaryStructure
} from "@salary";

// Payroll > Pay Formulas (admin / HR only). Every pay formula, editable like
// Excel formulas:
// - Salary split (built-in): basic, HRA, special, bonus, PF, ESIC, PT, in hand
//   for a month's CTC. Add Employee, Salary revision, histories, the salary
//   sheet and payslips use it.
// - Month pay (built-in): per day, earned CTC, OT pay and the month's gross,
//   PF, ESIC, PT, in hand from the paid days. Month Shift Pay uses it.
// - Your formulas: extra earnings / deductions on top in Month Shift Pay.
// The standard built-in lists give the pay the HR sheet's rules give; "Reset
// to standard" puts them back. Before saving, the page shows how each
// employee's monthly in hand would change.
// Engine: server/utils/payFormula.js. Server: PUT /api/payroll-settings/formulas.

const errorText = (err) => err.response?.data?.message || err.message;
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;
const paise = round2;

// Ready-made starting points HR can add and then change.
const TEMPLATES = [
  { code: "ATTENDANCE_BONUS", name: "Attendance bonus", type: "earning", formula: "IF(ABSENT = 0, 500, 0)" },
  { code: "LATE_FINE", name: "Late fine", type: "deduction", formula: "IF(LATE_DAYS > 3, (LATE_DAYS - 3) * 50, 0)" },
  { code: "CANTEEN", name: "Canteen", type: "deduction", formula: "PRESENT * 30" },
  { code: "OT_EXTRA", name: "OT at 1.5x (extra half)", type: "earning", formula: "ROUND(OT_HOURS * PER_HOUR * 50%)" },
  { code: "TRAVEL", name: "Travel allowance", type: "earning", formula: "IF(DEPARTMENT = \"Sales\", PAID_DAYS * 100, 0)" },
  { code: "HOLIDAY_DOUBLE", name: "Holiday work extra", type: "earning", formula: "HOLIDAY_WORKED * PER_DAY" },
  { code: "GRATUITY", name: "Gratuity provision", type: "employer", formula: "ROUND(BASIC * 4.81%)" }
];

const newKey = () => Math.random().toString(36).slice(2);
const blank = () => ({ code: "", name: "", type: "earning", formula: "", active: true, key: newKey() });
const withKeys = (list) => (list || []).map((c) => ({ ...c, key: newKey() }));
const stripKeys = (list) => list.map(({ key, ...c }) => c);
const LISTS = ["split", "month", "formulas"];
const fromValues = (values) => ({
  split: withKeys(values.splitFormulas || FORMULA_STAGES.split.defaults),
  month: withKeys(values.monthFormulas || FORMULA_STAGES.month.defaults),
  formulas: withKeys(values.formulas)
});
const plain = (draft) => JSON.stringify(Object.fromEntries(LISTS.map((k) => [k, stripKeys(draft[k])])));

// Figures worked out by the built-in lists: shown, not typed, in the test box.
const SPLIT_TO_VARIABLE = { BASIC: "BASIC", HRA: "HRA", SPECIAL: "SPECIAL", BONUS: "BONUS", PF_EMPLOYEE: "FULL_PF", ESIC_EMPLOYEE: "FULL_ESIC", IN_HAND: "FULL_IN_HAND" };
const COMPUTED = new Set([...Object.values(SPLIT_TO_VARIABLE), ...FORMULA_STAGES.month.required]);

// Side panel groups. Attendance is left out on purpose (HR asked): those names
// still work in formulas and the test uses their standard sample figures.
const GROUPS = [...new Set(PAY_VARIABLES.map((v) => v.group))].filter((g) => g !== "Attendance");
const SHORT_NAME = Object.fromEntries([...PAY_VARIABLES, ...SETTING_VARIABLES].map((v) => [v.name, v.short]));
const KIND = { earning: "Earning", deduction: "Deduction", employer: "Employer cost", info: "Info" };

// Which row an error message is about: "Salary split row 3: …", "Row 3: …" or "CODE: …".
function errorRow(message, list) {
  if (!message) return -1;
  const row = /\brow (\d+)/i.exec(message);
  if (row) return Number(row[1]) - 1;
  const code = /^([A-Z][A-Z0-9_]*):/.exec(message);
  return code ? list.findIndex((c) => c.code.trim().toUpperCase() === code[1]) : -1;
}

// The salary split for the test figures with a draft list, as salaryStructure
// works it out (company PF / ESIC switches, ESIC ceiling).
function splitExample(list, sample) {
  const settings = payrollSettings();
  const pf = Number(sample.PF_APPLICABLE) !== 0 && settings.pfEnabled;
  let esic = Number(sample.ESIC_APPLICABLE) !== 0 && settings.esicEnabled;
  const run = (esicOn) =>
    runFormulas(list, {
      ...settingVariables(settings),
      CTC: Number(sample.CTC) || 0,
      STATE: String(sample.STATE ?? ""),
      MONTH: Number(sample.MONTH) || 0,
      PF_APPLICABLE: pf ? 1 : 0,
      ESIC_APPLICABLE: esicOn ? 1 : 0
    });
  let result = run(esic);
  if (esic && settings.esicCeiling > 0 && Number(result.values.GROSS) > settings.esicCeiling) {
    esic = false;
    result = run(false);
  }
  return { ...result, pf, esic };
}

export default function PayFormulas() {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(null); // { split, month, formulas }
  const [saved, setSaved] = useState(null); // plain(draft) as saved
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  // Test figures: a full paid month (attendance can't be typed on this page), so
  // the month's in hand matches the salary split's full-month in hand.
  const [sample, setSample] = useState(() => {
    const s = sampleVariables();
    return { ...s, PAID_DAYS: s.DAYS_IN_MONTH, PRESENT: s.DAYS_IN_MONTH - s.WEEKLY_OFFS - s.HOLIDAYS, HALF_DAYS: 0, ABSENT: 0, LEAVE_DAYS: 0, OT_HOURS: 0 };
  });
  const [filter, setFilter] = useState("");
  const [employees, setEmployees] = useState([]);
  const [tab, setTab] = useState("split"); // one list on screen at a time
  const [, setSettingsSaved] = useState(0); // re-draw test figures after Payroll Settings saves
  const lastFormula = useRef(null); // { list, index, el } of the formula box last typed in

  useEffect(() => {
    api
      .get("/payroll-settings")
      .then(({ data }) => {
        const next = fromValues(data.values);
        setDraft(next);
        setSaved(plain(next));
      })
      .catch((err) => setError(errorText(err)));
    // For "what changes" before saving; the page works without it.
    api
      .get("/employees")
      .then(({ data }) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const changed = draft && plain(draft) !== saved;
  const savedLists = useMemo(() => (saved ? JSON.parse(saved) : null), [saved]);

  // Checks of the three lists.
  const checks = useMemo(() => {
    if (!draft) return {};
    return {
      split: checkStage("split", stripKeys(draft.split)),
      month: checkStage("month", stripKeys(draft.month)),
      formulas: checkComponents(stripKeys(draft.formulas))
    };
  }, [draft]);
  const firstError = checks.split?.error || checks.month?.error || checks.formulas?.error || "";

  // Test figures run through every list: split -> month -> your formulas.
  const test = useMemo(() => {
    if (!draft) return null;
    const settingVars = settingVariables(payrollSettings());
    const upper = (list) => stripKeys(list).map((c) => ({ ...c, code: String(c.code).trim().toUpperCase() }));
    const split = splitExample(checks.split?.list || upper(draft.split), sample);
    const s = (code) => Number(split.values[code]) || 0;
    const fromSplit = {
      BASIC: paise(s("BASIC")),
      HRA: paise(s("HRA")),
      SPECIAL: paise(s("SPECIAL")),
      BONUS: s("BONUS"),
      PF_APPLICABLE: split.pf ? 1 : 0,
      ESIC_APPLICABLE: split.esic ? 1 : 0,
      FULL_PF: s("PF_EMPLOYEE"),
      FULL_ESIC: paise(s("ESIC_EMPLOYEE")),
      FULL_IN_HAND: paise(s("IN_HAND"))
    };
    const monthVars = { ...settingVars, ...sample, ...fromSplit };
    const month = runFormulas(checks.month?.list || upper(draft.month), monthVars);
    const m = (code) => Number(month.values[code]) || 0;
    const shown = {
      PER_DAY: round2(m("PER_DAY")),
      PER_HOUR: round2(m("PER_HOUR")),
      EARNED: Math.round(m("EARNED")),
      OT_PAY: Math.round(m("OT_PAY")),
      GROSS: Math.round(m("GROSS")),
      PF: Math.round(m("PF")),
      ESIC: Math.round(m("ESIC")),
      PT: Math.round(m("PT")),
      IN_HAND: Math.round(m("IN_HAND"))
    };
    const custom = applyComponents(checks.formulas?.components || upper(draft.formulas), { ...monthVars, ...shown });
    return { split, month, custom, computed: { ...fromSplit, ...shown } };
  }, [draft, checks, sample]);

  // Monthly in hand of every employee: saved split formulas vs the draft.
  const impact = useMemo(() => {
    if (!draft || !savedLists || !employees.length || !checks.split?.list) return null;
    if (JSON.stringify(checks.split.list) === JSON.stringify(savedLists.split)) return null;
    const inUse = payrollSettings();
    const inHandWith = (list) => {
      setPayrollSettings({ ...inUse, splitFormulas: list });
      return employees.map((e) => (e.monthlyCtc ? salaryStructure(e).inHand : 0));
    };
    try {
      const before = inHandWith(savedLists.split);
      const after = inHandWith(checks.split.list);
      const rows = employees
        .map((e, i) => ({ employee: e, before: before[i], after: after[i], diff: round2(after[i] - before[i]) }))
        .filter((r) => Math.abs(r.diff) >= 0.01);
      return {
        total: employees.length,
        rows: rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
        before: before.reduce((a, b) => a + b, 0),
        after: after.reduce((a, b) => a + b, 0)
      };
    } finally {
      setPayrollSettings(inUse);
    }
  }, [draft, savedLists, employees, checks]);

  // ---- editing ----
  const setList = (list, fn) => {
    setNotice("");
    setDraft((d) => ({ ...d, [list]: fn(d[list]) }));
  };
  const update = (list, i, patch) => setList(list, (rows) => rows.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (list, i, by) =>
    setList(list, (rows) => {
      const next = [...rows];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item);
      return next;
    });
  const add = (template) => {
    let code = template?.code || "";
    // A template already in the list gets _2, _3 ...
    if (code && draft.formulas.some((c) => c.code.toUpperCase() === code)) {
      let n = 2;
      while (draft.formulas.some((c) => c.code.toUpperCase() === `${code}_${n}`)) n++;
      code = `${code}_${n}`;
    }
    setList("formulas", (rows) => [...rows, { ...blank(), ...template, code }]);
  };
  // A helper row goes on top, where every row below can use it.
  const addHelper = (list) => setList(list, (rows) => [{ code: "", name: "", formula: "0", key: newKey() }, ...rows]);
  async function remove(list, i) {
    const c = draft[list][i];
    const sure = await confirm({
      title: `Remove ${c.name || c.code || "this formula"}?`,
      message: list === "formulas" ? "It stops counting in Month Shift Pay once you save." : "Rows that use it will show an error until you change them.",
      confirmLabel: "Remove",
      danger: true
    });
    if (sure) setList(list, (rows) => rows.filter((_, j) => j !== i));
  }
  async function resetStage(stage) {
    const sure = await confirm({
      title: `${FORMULA_STAGES[stage].title}: back to standard?`,
      message: "The list goes back to the standard formulas (the HR sheet's rules). Nothing changes until you press Save.",
      confirmLabel: "Use standard formulas"
    });
    if (sure) setList(stage, () => withKeys(FORMULA_STAGES[stage].defaults));
  }

  // Puts a name or function into the formula box last typed in, at the cursor.
  function insert(text) {
    const target = lastFormula.current;
    const row = target && draft[target.list]?.[target.index];
    if (!row) return;
    const el = target.el;
    const value = row.formula;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    update(target.list, target.index, { formula: value.slice(0, start) + text + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function save() {
    if (firstError) return setError(firstError);
    const builtInChanged = JSON.stringify(checks.split.list) !== JSON.stringify(savedLists.split) || JSON.stringify(checks.month.list) !== JSON.stringify(savedLists.month);
    if (builtInChanged) {
      const sure = await confirm({
        title: "Change the built-in pay formulas?",
        message: impact
          ? `${impact.rows.length} of ${impact.total} employees' monthly in hand changes (total ₹ ${money.format(impact.before)} → ₹ ${money.format(impact.after)}). Month Shift Pay uses the new formulas at once; saved employee splits update the next time each employee is saved.`
          : "Month Shift Pay uses the new formulas at once; saved employee splits update the next time each employee is saved.",
        confirmLabel: "Save formulas"
      });
      if (!sure) return;
    }
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/payroll-settings/formulas", {
        formulas: stripKeys(draft.formulas),
        splitFormulas: stripKeys(draft.split),
        monthFormulas: stripKeys(draft.month)
      });
      setPayrollSettings(data.values);
      const next = fromValues(data.values);
      setDraft(next);
      setSaved(plain(next));
      setNotice("Saved. Every salary split and Month Shift Pay use these formulas from now on.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (error && !draft) {
    return (
      <div className="error-banner">
        <span>{error}</span>
      </div>
    );
  }
  if (!draft) return <Loader text="Loading pay formulas…" />;

  const q = filter.trim().toLowerCase();
  const knownCodes = draft.formulas.map((c) => c.code.trim().toUpperCase()).filter(Boolean);
  const net = test ? test.computed.IN_HAND + test.custom.earnings - test.custom.deductions : 0;

  const nameByCode = Object.fromEntries(
    [...draft.split, ...draft.month, ...draft.formulas].map((c) => [c.code.trim().toUpperCase(), c.name.trim()])
  );
  const nameOf = (code) => SHORT_NAME[code] || nameByCode[code] || code;
  const label = (c) => c.name.trim() || c.code.trim() || "(no name)";
  const activeList = draft.formulas.filter((c) => c.active !== false && c.formula.trim());
  const plus = activeList.filter((c) => c.type === "earning").map(label);
  const minus = activeList.filter((c) => c.type === "deduction").map(label);
  const settingsNow = settingVariables(payrollSettings());

  // One built-in list (split or month), editable.
  const stageSection = (stage, intro) => {
    const rows = draft[stage];
    const info = FORMULA_STAGES[stage];
    const check = checks[stage];
    const run = stage === "split" ? test?.split : test?.month;
    const badRow = errorRow(check?.error, rows);
    return (
      <section className="prs-section" aria-labelledby={`pf-${stage}-title`}>
        <header className="pf-stage-head">
          <div>
            <h2 id={`pf-${stage}-title`}>
              {info.title} <span className="pf-kind pf-kind-builtin">Built-in</span>
            </h2>
            <p>{intro}</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => resetStage(stage)}>
            Reset to standard
          </button>
        </header>
        {check?.error && badRow < 0 && <p className="pf-error pf-stage-error">{check.error}</p>}
        <div className="prs-rows">
          {rows.map((c, i) => {
            const code = c.code.trim().toUpperCase();
            const required = info.required.includes(code) && FORMULA_STAGES[stage].defaults.some((d) => d.code === c.code);
            const bad = badRow === i ? check.error : "";
            const runError = run?.errors?.[code];
            const value = run?.values?.[code];
            const words = c.formula.trim() ? describeFormula(c.formula, nameOf) : null;
            return (
              <div key={c.key} className={`pf-item ${bad ? "has-error" : ""}`}>
                <div className="pf-item-head">
                  <span className="pf-order">{i + 1}</span>
                  {required ? (
                    <span className="pf-code pf-code-fixed" title="Needed by the rest of the payroll: can be changed, not removed">
                      {code}
                    </span>
                  ) : (
                    <input
                      className="pf-code"
                      aria-label="Code"
                      placeholder="CODE"
                      value={c.code}
                      onChange={(e) => update(stage, i, { code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                    />
                  )}
                  <input className="pf-name" aria-label="Name" placeholder="Name" value={c.name} onChange={(e) => update(stage, i, { name: e.target.value })} />
                  {!required && <span className="pf-kind">Helper</span>}
                </div>
                <div className="pf-formula-row">
                  <span className="pf-eq">=</span>
                  <textarea
                    className="pf-formula"
                    aria-label={`Formula for ${c.name || code || `row ${i + 1}`}`}
                    rows={c.formula.length > 90 ? 3 : c.formula.length > 45 ? 2 : 1}
                    spellCheck={false}
                    value={c.formula}
                    onFocus={(e) => (lastFormula.current = { list: stage, index: i, el: e.target })}
                    onChange={(e) => {
                      lastFormula.current = { list: stage, index: i, el: e.target };
                      update(stage, i, { formula: e.target.value });
                    }}
                  />
                  <span className={`pf-result ${runError ? "is-bad" : ""}`} title="With the test figures on the right">
                    {runError ? "error" : typeof value === "number" ? money.format(round2(value)) : value ?? "–"}
                  </span>
                </div>
                {words?.words && !bad && <p className="pf-words">{words.words}</p>}
                {(bad || runError) && <p className="pf-error">{bad || runError}</p>}
                <div className="pf-item-foot">
                  <span className="pf-spacer" />
                  <button className="pf-link" type="button" onClick={() => move(stage, i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑ Up
                  </button>
                  <button className="pf-link" type="button" onClick={() => move(stage, i, 1)} disabled={i === rows.length - 1} aria-label="Move down">
                    ↓ Down
                  </button>
                  {!required && (
                    <button className="prs-remove" type="button" onClick={() => remove(stage, i)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pf-templates">
          <button type="button" className="pf-chip" onClick={() => addHelper(stage)}>
            + Add helper row
          </button>
          <span>A helper row works out a figure the rows below can use, e.g. RATIO.</span>
        </div>
      </section>
    );
  };

  // "All formulas" rows for one list.
  const allRows = (list, prefix, kindOf, valueOf) =>
    draft[list].map((c, i) => {
      const code = c.code.trim().toUpperCase();
      const d = c.formula.trim() ? describeFormula(c.formula, nameOf) : { error: "No formula yet" };
      const off = c.active === false;
      return (
        <tr key={c.key} className={`${off ? "is-off" : ""} ${list !== "formulas" ? "pf-builtin-row" : ""}`}>
          <td>{`${prefix}${i + 1}`}</td>
          <td>
            <b>{label(c)}</b>
            <div className="pf-all-meta">
              {kindOf(c)}
              {off && <span className="pf-kind">Off</span>}
              <code>{code}</code>
            </div>
          </td>
          <td>{d.error ? <span className="pf-error-text">{d.error}</span> : d.words}</td>
          <td className="pf-math">{d.error ? "–" : `${label(c)} = ${d.math}`}</td>
          <td className="ps-num">{off ? "off" : valueOf(code)}</td>
        </tr>
      );
    });
  const shownValue = (run) => (code) =>
    run?.errors?.[code] ? "error" : typeof run?.values?.[code] === "number" ? money.format(round2(run.values[code])) : "–";

  return (
    <div className={`prs pf ${changed ? "has-changes" : ""}`}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pay Formulas</h1>
          <p className="page-subtitle">
            Every pay formula, written like Excel formulas: the salary split, the month pay and your own extra items. Only HR (admin) can change
            them. Numbers such as PF % come from Payroll Settings and can be used by name (e.g. PF_EMPLOYEE_RATE).
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setTab("formulas");
              add();
            }}
          >
            + New formula
          </button>
        </div>
      </div>

      <PayVersions />

      <div className="pf-tabs" role="tablist" aria-label="Formula lists">
        {[
          ["split", "Salary split", draft.split.length, checks.split?.error],
          ["month", "Month pay", draft.month.length, checks.month?.error],
          ["formulas", "Your formulas", draft.formulas.length, checks.formulas?.error],
          ["all", "All formulas", draft.split.length + draft.month.length + draft.formulas.length, ""],
          ["settings", "Payroll Settings", null, ""]
        ].map(([key, title, count, bad]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`pf-tab ${tab === key ? "is-active" : ""}`}
            onClick={() => setTab(key)}
          >
            {title}
            {count != null && <span className="pf-tab-count">{count}</span>}
            {bad && <span className="pf-tab-bad" title={bad} aria-label="Has an error" />}
          </button>
        ))}
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

      {impact && (
        <div className="pf-impact" role="status">
          <b>
            If you save: {impact.rows.length} of {impact.total} employees' monthly in hand changes.
          </b>{" "}
          Total a month ₹ {money.format(impact.before)} → ₹ {money.format(impact.after)} ({impact.after >= impact.before ? "+" : "−"}₹{" "}
          {money.format(Math.abs(round2(impact.after - impact.before)))}).
          {impact.rows.length > 0 && (
            <div className="table-scroll">
              <table className="pf-all-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th className="ps-num">CTC</th>
                    <th className="ps-num">In hand now</th>
                    <th className="ps-num">New in hand</th>
                    <th className="ps-num">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.rows.slice(0, 15).map((r) => (
                    <tr key={r.employee.employeeId}>
                      <td>{r.employee.employeeId}</td>
                      <td>{r.employee.name}</td>
                      <td className="ps-num">{money.format(r.employee.monthlyCtc)}</td>
                      <td className="ps-num">{money.format(r.before)}</td>
                      <td className="ps-num">{money.format(r.after)}</td>
                      <td className="ps-num">{(r.diff > 0 ? "+" : "") + money.format(r.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {impact.rows.length > 15 && <p className="pf-words">…and {impact.rows.length - 15} more.</p>}
            </div>
          )}
        </div>
      )}

      {tab === "settings" && <PayrollSettings embedded onSaved={() => setSettingsSaved((n) => n + 1)} />}

      {tab !== "all" && tab !== "settings" && (
      <div className="prs-layout">
        <div className="prs-main">
          {tab === "split" && stageSection(
            "split",
            "A month's salary from the CTC on the employee master. Add Employee, Salary revision, histories, the salary sheet and payslips use it. Worked out top to bottom; the coded rows are needed, helper rows are yours."
          )}
          {tab === "month" && stageSection(
            "month",
            "A month's pay from the paid days (Month Shift Register & Pay). BASIC, HRA, BONUS, SPECIAL and FULL_PF / FULL_ESIC come from the salary split above."
          )}

          {tab === "formulas" && (
          <section className="prs-section" aria-labelledby="pf-list-title">
            <header>
              <h2 id="pf-list-title">Your formulas</h2>
              <p>Extra items on top of the month pay. Worked out top to bottom: a formula can use the code of any formula above it (e.g. CANTEEN * 2).</p>
            </header>
            <div className="prs-rows">
              {!draft.formulas.length && (
                <div className="pf-empty">
                  No formulas yet. Press <b>+ New formula</b>, or start from an example below.
                </div>
              )}
              {draft.formulas.map((c, i) => {
                const code = c.code.trim().toUpperCase();
                const bad = errorRow(checks.formulas?.error, draft.formulas) === i ? checks.formulas.error : "";
                const value = test?.custom?.values?.[code];
                const runError = test?.custom?.errors?.[code];
                return (
                  <div key={c.key} className={`pf-item ${c.active === false ? "is-off" : ""} ${bad ? "has-error" : ""}`}>
                    <div className="pf-item-head">
                      <span className="pf-order">{i + 1}</span>
                      <input
                        className="pf-code"
                        aria-label="Code"
                        placeholder="CODE"
                        value={c.code}
                        onChange={(e) => update("formulas", i, { code: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
                      />
                      <input
                        className="pf-name"
                        aria-label="Name"
                        placeholder="Name shown in pay (e.g. Canteen)"
                        value={c.name}
                        onChange={(e) => update("formulas", i, { name: e.target.value })}
                      />
                      <select className="prs-select pf-type" aria-label="Kind" value={c.type} onChange={(e) => update("formulas", i, { type: e.target.value })}>
                        {COMPONENT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="pf-formula-row">
                      <span className="pf-eq">=</span>
                      <textarea
                        className="pf-formula"
                        aria-label={`Formula for ${c.name || c.code || `row ${i + 1}`}`}
                        rows={1}
                        spellCheck={false}
                        placeholder="e.g. IF(ABSENT = 0, 500, 0)"
                        value={c.formula}
                        onFocus={(e) => (lastFormula.current = { list: "formulas", index: i, el: e.target })}
                        onChange={(e) => {
                          lastFormula.current = { list: "formulas", index: i, el: e.target };
                          update("formulas", i, { formula: e.target.value });
                        }}
                      />
                      <span className={`pf-result ${runError ? "is-bad" : ""}`} title="With the test figures on the right">
                        {c.active === false ? "off" : runError ? "error" : value != null ? `₹ ${money.format(value)}` : "–"}
                      </span>
                    </div>
                    {(bad || runError) && <p className="pf-error">{bad || runError}</p>}
                    <div className="pf-item-foot">
                      <label className="prs-check">
                        <input type="checkbox" checked={c.active !== false} onChange={(e) => update("formulas", i, { active: e.target.checked })} /> Active
                      </label>
                      <span className="pf-spacer" />
                      <button className="pf-link" type="button" onClick={() => move("formulas", i, -1)} disabled={i === 0} aria-label="Move up">
                        ↑ Up
                      </button>
                      <button
                        className="pf-link"
                        type="button"
                        onClick={() => move("formulas", i, 1)}
                        disabled={i === draft.formulas.length - 1}
                        aria-label="Move down"
                      >
                        ↓ Down
                      </button>
                      <button className="prs-remove" type="button" onClick={() => remove("formulas", i)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pf-templates">
              <span>Start from an example:</span>
              {TEMPLATES.map((t) => (
                <button key={t.code} type="button" className="pf-chip" onClick={() => add(t)} title={t.formula}>
                  + {t.name}
                </button>
              ))}
            </div>
          </section>
          )}

          <details className="prs-section pf-help-box">
            <summary>How to write a formula</summary>
            <ul className="pf-help">
              <li>
                Use <b>+ − * /</b> and brackets. <b>12%</b> means 0.12, as in Excel: <code>BASIC * 12%</code>, or with a setting:{" "}
                <code>BASIC * PF_EMPLOYEE_RATE%</code>.
              </li>
              <li>
                Compare with <b>= &lt;&gt; &lt; &lt;= &gt; &gt;=</b>; join conditions with <b>AND</b> / <b>OR</b>:{" "}
                <code>IF(PRESENT &gt;= 25 AND LATE_DAYS = 0, 1000, 0)</code>
              </li>
              <li>
                Text goes in quotes and ignores capitals: <code>IF(STATE = "Maharashtra", 200, 0)</code>
              </li>
              <li>
                <code>MINWAGE(STATE)</code> and <code>PTSLAB(GROSS, STATE, MONTH)</code> read the minimum wages and PT slabs on Payroll Settings.
              </li>
              <li>A fixed amount is just a number: <code>500</code>. Dividing by 0 gives 0.</li>
              <li>
                Your formulas: earnings and deductions change the total pay. <i>Employer cost</i> and <i>Info</i> are shown as columns only.
              </li>
              <li>Click a name or function on the right to put it into the formula you last typed in.</li>
            </ul>
          </details>
        </div>

        <aside className="prs-aside">
          <div className="prs-example pf-ref">
            <h2>Names you can use</h2>
            <p>Click to insert. Change a test figure to see every result on the left. Grey figures are worked out by the formulas.</p>
            <input className="pf-filter" type="search" placeholder="Find a name…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a name" />
            <div className="pf-vars">
              {GROUPS.map((group) => {
                const vars = PAY_VARIABLES.filter((v) => v.group === group && (!q || v.name.toLowerCase().includes(q) || v.label.toLowerCase().includes(q)));
                if (!vars.length) return null;
                return (
                  <div key={group} className="pf-var-group">
                    <h3>{group}</h3>
                    {vars.map((v) => (
                      <div key={v.name} className="pf-var">
                        <button type="button" className="pf-var-name" onClick={() => insert(v.name)} title={v.label}>
                          {v.name}
                        </button>
                        {COMPUTED.has(v.name) ? (
                          <span className="pf-var-computed" title="Worked out by the formulas">
                            {money.format(test?.computed?.[v.name] ?? 0)}
                          </span>
                        ) : (
                          <input
                            aria-label={`Test value for ${v.name}`}
                            value={sample[v.name]}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setSample((s) => ({ ...s, [v.name]: typeof v.sample === "string" ? raw : raw === "" ? 0 : Number(raw) || 0 }));
                            }}
                          />
                        )}
                        <small>{v.label}</small>
                      </div>
                    ))}
                  </div>
                );
              })}
              {(() => {
                const vars = SETTING_VARIABLES.filter((v) => !q || v.name.toLowerCase().includes(q) || v.label.toLowerCase().includes(q));
                if (!vars.length) return null;
                return (
                  <div className="pf-var-group">
                    <h3>Payroll Settings</h3>
                    {vars.map((v) => (
                      <div key={v.name} className="pf-var">
                        <button type="button" className="pf-var-name" onClick={() => insert(v.name)} title={v.label}>
                          {v.name}
                        </button>
                        <button type="button" className="pf-var-computed pf-var-setting" title="Change it on the Payroll Settings tab" onClick={() => setTab("settings")}>
                          {money.format(settingsNow[v.name])}
                        </button>
                        <small>{v.label}</small>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {knownCodes.length > 0 && !q && (
                <div className="pf-var-group">
                  <h3>Your formulas</h3>
                  <div className="pf-chips">
                    {knownCodes.map((code) => (
                      <button key={code} type="button" className="pf-chip" onClick={() => insert(code)}>
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!q && (
                <div className="pf-var-group">
                  <h3>Functions</h3>
                  <div className="pf-chips">
                    {PAY_FUNCTIONS.map((f) => (
                      <button key={f.name} type="button" className="pf-chip" onClick={() => insert(`${f.name}(`)} title={`${f.usage}: ${f.label}`}>
                        {f.usage}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {test && (
              <div className="prs-inhand">
                <span>Test total pay</span>
                <b>₹ {money.format(net)}</b>
                <small>
                  Month in hand {money.format(test.computed.IN_HAND)} + {money.format(test.custom.earnings)} − {money.format(test.custom.deductions)}
                </small>
              </div>
            )}
          </div>
        </aside>
      </div>
      )}

      {tab === "all" && (
      <section className="prs-section pf-all" aria-labelledby="pf-all-title">
        <header>
          <h2 id="pf-all-title">All formulas</h2>
          <p>
            Salary split (S1 …), month pay (M1 …), then yours, in words and in maths{changed ? " (including changes not saved yet)" : ""}. Results use
            the test figures.
          </p>
        </header>
        <div className="table-scroll">
          <table className="pf-all-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Formula</th>
                <th>In words</th>
                <th>In maths</th>
                <th className="ps-num">Test result</th>
              </tr>
            </thead>
            <tbody>
              {allRows("split", "S", () => <span className="pf-kind pf-kind-builtin">Salary split</span>, shownValue(test?.split))}
              {allRows("month", "M", () => <span className="pf-kind pf-kind-builtin">Month pay</span>, shownValue(test?.month))}
              {allRows(
                "formulas",
                "",
                (c) => <span className={`pf-kind pf-kind-${c.type}`}>{KIND[c.type] || c.type}</span>,
                (code) =>
                  test?.custom?.errors?.[code] ? "error" : test?.custom?.values?.[code] != null ? `₹ ${money.format(test.custom.values[code])}` : "–"
              )}
            </tbody>
          </table>
        </div>
        <div className="pf-total">
          <span>Total pay</span>
          <code>
            = Month in hand{plus.map((n) => ` + ${n}`).join("")}
            {minus.map((n) => ` − ${n}`).join("")} (+ OT pay when ticked on Month Shift Pay)
          </code>
        </div>
      </section>
      )}

      {changed && tab !== "settings" && (
        <div className="prs-savebar" role="region" aria-label="Unsaved changes">
          <span>{firstError ? "Fix the formula in red to save" : "You have unsaved changes"}</span>
          <button className="btn btn-ghost" onClick={() => setDraft(fromValues(Object.fromEntries([["splitFormulas", savedLists.split], ["monthFormulas", savedLists.month], ["formulas", savedLists.formulas]])))} disabled={saving}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || Boolean(firstError)}>
            {saving ? "Saving…" : "Save formulas"}
          </button>
        </div>
      )}
    </div>
  );
}
