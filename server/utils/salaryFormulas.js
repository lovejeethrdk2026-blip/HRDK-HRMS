// Salary formulas from the HR sheet "CTC PF YES AND ESIC YES CASES.xlsx", one
// function per item. salaryStructure() at the bottom runs them in order. The
// only copy: the server uses it when saving an employee, and the admin app
// imports this same file (alias "@salary" in ADMIN/vite.config.js) for the Add
// Employee preview.
//
// Monthly CTC = basic + HRA + bonus + special + employer PF + employer ESIC.
// In hand = that gross less employee PF, ESIC and Professional Tax.
// All amounts are monthly rupees; state names are matched ignoring case.

import { FORMULA_STAGES, checkStage, runFormulas, setFormulaHelpers, settingVariables } from "./payFormula.js";

// ---- Payroll settings (Payroll Settings page, HR only) -----------------------
// The numbers the formulas use. Defaults are the HR sheet's; the server loads
// the saved ones from MongoDB (server/payrollSettings) and the admin app loads
// them at login, both through setPayrollSettings, so every screen uses the
// same values. Percentages are stored as percent (12 = 12%).
export const DEFAULT_PAYROLL_SETTINGS = {
  pfEnabled: true, // company has PF at all
  pfEmployeeRate: 12, // % of basic + bonus + special
  pfEmployerRate: 12,
  pfCeilingRequired: true, // PF capped: flat pfMaxAmount from pfWageLimit basic up
  pfWageLimit: 25000,
  pfMaxAmount: 3000,
  esicEnabled: true, // company has ESIC at all
  esicEmployeeRate: 0.75, // % of basic
  esicEmployerRate: 3.25,
  esicCeiling: 0, // monthly gross above this: no ESIC; 0 = no limit
  ptEnabled: true, // deduct Professional Tax (state slabs)
  // HR's own pay components (Payroll > Pay Formulas, utils/payFormula.js):
  // [{ code, name, type, formula, active }], worked out in this order.
  formulas: [],
  // The salary split and the month pay as formula lists (Pay Formulas page,
  // "Built-in formulas"): [{ code, name, formula }]. The standard lists give
  // the pay the HR sheet's rules give.
  splitFormulas: FORMULA_STAGES.split.defaults,
  monthFormulas: FORMULA_STAGES.month.defaults,
  basicPercent: 50, // basic = this % of CTC (never below the state's minimum wage)
  hraPercent: 50, // HRA at most this % of basic
  statutoryBonus: 1400, // monthly
  bonusYearlyLimit: 600000, // no bonus from this yearly CTC up
  minWages: { rajasthan: 8050, "west bengal": 11365, maharashtra: 14470 }, // basic floor by state
  // Professional Tax by state: slabs in order, first match wins. upTo is the
  // monthly gross the slab runs to; null on the last one = "and above".
  // februaryTop: PT on the top slab in February (the year's balance), 0 = same.
  // From the PT BC365 deducts (pay sheets Apr-Aug 2026: West Bengal staff 8xxxx,
  // Maharashtra staff 4xxxx) and the states' slabs. A state not listed (e.g.
  // Rajasthan) has no PT.
  ptSlabs: {
    "west bengal": {
      slabs: [
        { upTo: 20000, pt: 0 },
        { upTo: 30000, pt: 100 },
        { upTo: 50000, pt: 140 },
        { upTo: 100000, pt: 170 },
        { upTo: null, pt: 208 }
      ],
      februaryTop: 0
    },
    maharashtra: {
      slabs: [
        { upTo: 7500, pt: 0 },
        { upTo: 10000, pt: 175 },
        { upTo: null, pt: 200 }
      ],
      februaryTop: 300
    },
    karnataka: {
      slabs: [
        { upTo: 24999.99, pt: 0 },
        { upTo: null, pt: 200 }
      ],
      februaryTop: 300
    }
  }
};

let settings = { ...DEFAULT_PAYROLL_SETTINGS };

// Saved values -> the settings the formulas use (missing keys keep their defaults).
function buildSettings(next) {
  const built = { ...DEFAULT_PAYROLL_SETTINGS, ...(next || {}) };
  built.minWages = { ...(next?.minWages || DEFAULT_PAYROLL_SETTINGS.minWages) };
  built.ptSlabs = structuredClone(next?.ptSlabs || DEFAULT_PAYROLL_SETTINGS.ptSlabs);
  built.formulas = Array.isArray(next?.formulas) ? next.formulas.map((c) => ({ ...c })) : [];
  built.splitFormulas = stageList("split", next?.splitFormulas);
  built.monthFormulas = stageList("month", next?.monthFormulas);
  return built;
}

// Replaces the settings in use: the latest pay version, the one Payroll
// Settings and Pay Formulas edit.
export function setPayrollSettings(next) {
  settings = buildSettings(next);
  if (versionIds?.length) versionSettings.set(versionIds.at(-1), settings);
}

// ---- Pay versions (Pay Formulas page) ----------------------------------------
// A pay version is a frozen copy of every payroll setting and formula ("0.1",
// "0.2", ...). Each employee's pay (and each salary revision) names the version
// it is worked out with (payVersion); a pay with none uses the first version,
// so the pay worked out before versions existed never changes. Only the latest
// version can be edited; making a new one copies it.
let versionSettings = new Map(); // "0.1" -> settings
let versionIds = []; // oldest first

// versions: [{ version, values }] oldest first (the latest = the settings in use).
export function setPayVersions(versions) {
  versionIds = [];
  versionSettings = new Map();
  for (const { version, values } of Array.isArray(versions) ? versions : []) {
    if (!version || versionSettings.has(version)) continue;
    versionIds.push(version);
    versionSettings.set(version, buildSettings(values));
  }
  // The latest version is the one in use: same object, so edits show at once.
  if (versionIds.length) versionSettings.set(versionIds.at(-1), settings);
}

export const payVersionIds = () => [...versionIds];
export const latestPayVersion = () => versionIds.at(-1) || "";
export const firstPayVersion = () => versionIds[0] || "";

// The version a pay record names, or the first one when it names none (or one
// that does not exist); "" before versions are loaded.
export function resolvePayVersion(version) {
  if (version && versionSettings.has(version)) return version;
  return versionIds[0] || "";
}

// Runs fn with that version's settings in place (sync code only), then puts
// the latest back.
export function withPayVersion(version, fn) {
  const target = versionSettings.get(resolvePayVersion(version));
  if (!target || target === settings) return fn();
  const latest = settings;
  settings = target;
  try {
    return fn();
  } finally {
    settings = latest;
  }
}

// A saved built-in list when it still checks out, else the standard one.
function stageList(stage, list) {
  if (Array.isArray(list) && list.length) {
    const checked = checkStage(stage, list);
    if (checked.list) return checked.list;
    console.error(`Saved ${stage} formulas not usable (${checked.error}); using the standard ones`);
  }
  return FORMULA_STAGES[stage].defaults.map((row) => ({ ...row }));
}

// MINWAGE(STATE) and PTSLAB(GROSS, STATE, MONTH) in formulas.
setFormulaHelpers({
  minWage: (state) => Number(settings.minWages?.[stateKey(state)]) || 0,
  professionalTax: (gross, state, month) => professionalTax(gross, state, month)
});

export {
  PAY_VARIABLES,
  PAY_FUNCTIONS,
  SETTING_VARIABLES,
  FORMULA_STAGES,
  COMPONENT_TYPES,
  checkComponents,
  checkStage,
  evaluateFormula,
  applyComponents,
  runFormulas,
  sampleVariables,
  settingVariables,
  describeFormula
} from "./payFormula.js";

export const payrollSettings = () => settings;

const pct = (n) => (Number(n) || 0) / 100;

const stateKey = (state) => String(state ?? "").trim().toLowerCase();
const paise = (amount) => Math.round(amount * 100) / 100;

// Higher of basicPercent of CTC and the floor: the state's minimum wage,
// raised to 21005 when PF is on but ESIC is off, and to 25005 when both are off.
export function basicSalary(ctc, state, pf, esic) {
  let floor = Number(settings.minWages?.[stateKey(state)]) || 0;
  if (pf && !esic) floor = Math.max(floor, 21005);
  if (!pf && !esic) floor = Math.max(floor, 25005);
  return Math.max(ctc * pct(settings.basicPercent), floor);
}

// The statutory bonus (1400) while yearly CTC is under the limit, else 0.
export function statutoryBonus(ctc) {
  return ctc > 0 && ctc * 12 < settings.bonusYearlyLimit ? Number(settings.statutoryBonus) || 0 : 0;
}

// Employer ESIC (3.25%) of basic, when ESIC is on.
export function esicEmployer(basic, esic) {
  return esic ? basic * pct(settings.esicEmployerRate) : 0;
}

// Employee ESIC (0.75%) of basic, when ESIC is on.
export function esicEmployee(basic, esic) {
  return esic ? basic * pct(settings.esicEmployeeRate) : 0;
}

// Is the PF cap in force for this basic? (from pfWageLimit up, when required)
const pfCapped = (basic) => settings.pfCeilingRequired && basic >= settings.pfWageLimit;

// Employer PF as the HRA and special split counts it: employer rate of basic +
// bonus while uncapped (special adds its own share in specialAllowance), the
// flat cap once capped, 0 when PF is off.
export function pfForSplit(basic, bonus, pf) {
  if (!pf) return 0;
  return pfCapped(basic) ? settings.pfMaxAmount : (basic + bonus) * pct(settings.pfEmployerRate);
}

// Lower of hraPercent of basic and what CTC leaves after basic, bonus and the
// employer's ESIC and PF. Never below 5% of basic in Maharashtra, nor in West
// Bengal while ESIC is on; otherwise never below 0.
export function hraAllowance({ ctc, basic, bonus, employerEsic, splitPf, state, esic }) {
  const hra = Math.min(ctc - basic - bonus - employerEsic - splitPf, basic * pct(settings.hraPercent));
  const key = stateKey(state);
  const hasFloor = key === "maharashtra" || (key === "west bengal" && esic);
  return Math.max(hra, hasFloor ? basic * 0.05 : 0);
}

// The rest of CTC. While PF is on and uncapped, special draws employer PF of
// its own, so the rest is divided by (1 + employer rate). Never below 0.
export function specialAllowance({ ctc, basic, hra, bonus, employerEsic, splitPf, pf }) {
  const left = ctc - basic - hra - bonus - employerEsic - splitPf;
  const special = pf && !pfCapped(basic) ? left / (1 + pct(settings.pfEmployerRate)) : left;
  return Math.max(special, 0);
}

// PF at `rate` % of basic + bonus + special, rounded up, at most the cap when
// the ceiling is required, 0 when PF is off.
function pfAt(rate, basic, bonus, special, pf) {
  if (!pf) return 0;
  const amount = Math.ceil(paise((basic + bonus + special) * pct(rate)));
  return settings.pfCeilingRequired ? Math.min(amount, settings.pfMaxAmount) : amount;
}

// Employee PF (12% of basic + bonus + special, rounded up, at most 3000).
export function pfContribution(basic, bonus, special, pf) {
  return pfAt(settings.pfEmployeeRate, basic, bonus, special, pf);
}

// Professional Tax on a month's gross (basic + HRA + bonus + special) in the
// employee's state; 0 where the state has none or PT is switched off. month
// (1-12), when given, applies the February rate on the top slab (300 in
// Maharashtra, Karnataka).
export function professionalTax(gross, state, month) {
  if (!settings.ptEnabled) return 0;
  const rule = settings.ptSlabs?.[stateKey(state)];
  const slabs = rule?.slabs || [];
  if (!slabs.length) return 0;
  const slab = slabs.find(({ upTo }) => upTo == null || gross <= upTo) || slabs.at(-1);
  const top = slab === slabs.at(-1);
  return month === 2 && top && rule.februaryTop > 0 ? rule.februaryTop : Number(slab.pt) || 0;
}

// Basic + HRA + bonus + special, less the employee's PF, ESIC and PT.
export function inHandSalary({ basic, hra, bonus, special, pf, esic, pt = 0 }) {
  return basic + hra + bonus + special - pf - esic - pt;
}


// The whole monthly split for one employee. month (1-12), when given, is the
// pay month (only February's PT differs). PF / ESIC need both the company
// switch (Payroll Settings) and the employee's own; ESIC also stops above the
// ESIC ceiling when one is set.
export function salaryStructure(pay, month) {
  return withPayVersion(pay?.payVersion, () => structureNow(pay, month));
}

// salaryStructure with the settings in place.
function structureNow({ monthlyCtc, state, pfApplicable, esicApplicable }, month) {
  const ctc = Number(monthlyCtc) || 0;
  const pf = Boolean(pfApplicable) && settings.pfEnabled;
  const esic = Boolean(esicApplicable) && settings.esicEnabled;
  const split = splitFor(ctc, state, pf, esic, month);
  if (esic && settings.esicCeiling > 0 && split.gross > settings.esicCeiling) {
    return splitFor(ctc, state, pf, false, month).result;
  }
  return split.result;
}

// One run of the salary split formulas (settings.splitFormulas).
function splitFor(ctc, state, pf, esic, month) {
  const vars = {
    ...settingVariables(settings),
    CTC: ctc,
    STATE: String(state ?? ""),
    MONTH: Number(month) || 0,
    PF_APPLICABLE: pf ? 1 : 0,
    ESIC_APPLICABLE: esic ? 1 : 0
  };
  const { values } = runFormulas(settings.splitFormulas, vars);
  const v = (code) => Number(values[code]) || 0;
  return {
    gross: v("GROSS"),
    result: {
      basic: paise(v("BASIC")),
      hra: paise(v("HRA")),
      specialAllowance: paise(v("SPECIAL")),
      statutoryBonus: v("BONUS"),
      esicEmployee: paise(v("ESIC_EMPLOYEE")),
      esicEmployer: paise(v("ESIC_EMPLOYER")),
      pfEmployee: v("PF_EMPLOYEE"),
      pfEmployer: v("PF_EMPLOYER"),
      professionalTax: v("PT"),
      inHand: paise(v("IN_HAND"))
    }
  };
}

// Month pay (Month Shift Pay) from settings.monthFormulas. vars: the month's
// figures (PAY_VARIABLES names); the Payroll Settings numbers are added here.
// Returns { values: { PER_DAY, EARNED, GROSS, PF, ..., IN_HAND }, errors }.
// payVersion: the employee's pay version for that month (see above).
export function monthPay(vars, payVersion) {
  return withPayVersion(payVersion, () => runFormulas(settings.monthFormulas, { ...settingVariables(settings), ...vars }));
}

// The settings of one pay version (the first when none / unknown).
export const payrollSettingsOf = (version) => versionSettings.get(resolvePayVersion(version)) || settings;

// State history: where the employee worked and when, oldest first, as
// [{ state, city, from, to, remark }] with "DD-MM-YYYY" dates and to "" while
// current. Transfers add to it (server/employee/employee.controller.js).

// "DD-MM-YYYY" -> "YYYY-MM-DD", which sorts and compares as the dates do.
export const sortableDate = (date) => String(date ?? "").split("-").reverse().join("-");

// The employee's history, or for a record saved before histories were kept,
// one stay in their state from the joining date.
export function stateHistoryOf(employee) {
  if (employee.stateHistory?.length) return employee.stateHistory;
  return [{ state: employee.state || "", city: "", from: employee.joiningDate || "", to: "", remark: "" }];
}

// Department history, kept the same way: [{ department, subDepartment,
// designation, reportingManager, from, to, remark }], oldest first.
export function departmentHistoryOf(employee) {
  if (employee.departmentHistory?.length) return employee.departmentHistory;
  return [
    {
      department: employee.department || "",
      subDepartment: employee.subDepartment || "",
      designation: employee.designation || "",
      reportingManager: employee.reportingManager || "",
      from: employee.joiningDate || "",
      to: "",
      remark: ""
    }
  ];
}

// Pay history, kept the same way: [{ monthlyCtc, pfApplicable,
// esicApplicable, kind, from, to, remark }], oldest first. kind is how the pay
// changed: "joining", "revision" (Salary revision) or "department" (a
// department transfer with a new CTC).
export function payHistoryOf(employee) {
  if (employee.payHistory?.length) return employee.payHistory;
  return [
    {
      monthlyCtc: employee.monthlyCtc ?? null,
      pfApplicable: employee.pfApplicable ?? null,
      esicApplicable: employee.esicApplicable ?? null,
      payVersion: employee.payVersion || "",
      kind: "joining",
      from: employee.joiningDate || "",
      to: "",
      remark: ""
    }
  ];
}

// The history entry covering a "YYYY-MM-DD" day, if any.
const entryOn = (history, day) =>
  history.find(({ from, to }) => sortableDate(from) <= day && (!to || sortableDate(to) >= day));

// "DD-MM-YYYY" -> "YYYY-MM-DD"; a "YYYY-MM-DD" day is kept as it is.
const toDay = (date) => (/^\d{4}-/.test(date) ? date : sortableDate(date));

// Exits, oldest first: [{ exitType, resignationDate, lastWorkingDay, reason,
// noticeServed, rehireEligible, remark, rejoinDate, rejoinRemark }], dates
// "DD-MM-YYYY". An Exit closes every history on the last working day; a Rejoin
// sets rejoinDate and opens them again (entries of kind "rejoin").

// The exit not yet followed by a rejoin, if any.
export function openExitOf(employee) {
  const last = employee.exits?.at(-1);
  return last && !last.rejoinDate ? last : null;
}

// The stretches worked, oldest first: [{ from, to }] as "YYYY-MM-DD", to ""
// while still working.
export function workSpans(employee) {
  const spans = [];
  let from = sortableDate(employee.joiningDate);
  for (const exit of employee.exits || []) {
    spans.push({ from, to: sortableDate(exit.lastWorkingDay) });
    if (!exit.rejoinDate) return spans;
    from = sortableDate(exit.rejoinDate);
  }
  spans.push({ from, to: "" });
  return spans;
}

// Was the employee on the rolls that day ("DD-MM-YYYY" or "YYYY-MM-DD")?
export function isWorkingOn(employee, date) {
  const day = toDay(date);
  return workSpans(employee).some(({ from, to }) => from <= day && (!to || to >= day));
}

// Where the employee was and on what pay on one day ("DD-MM-YYYY" or
// "YYYY-MM-DD"): { state, city, department, subDepartment, designation,
// reportingManager, monthlyCtc, pfApplicable, esicApplicable }.
export function employeeOn(employee, date) {
  const day = toDay(date);
  const stay = entryOn(stateHistoryOf(employee), day) || {};
  const spell = entryOn(departmentHistoryOf(employee), day) || {};
  const pay = entryOn(payHistoryOf(employee), day) || {};
  const pick = (key) => pay[key] ?? employee[key] ?? null;
  return {
    state: stay.state || "",
    city: stay.city || "",
    department: spell.department || "",
    subDepartment: spell.subDepartment || "",
    designation: spell.designation || "",
    reportingManager: spell.reportingManager || "",
    monthlyCtc: pick("monthlyCtc"),
    pfApplicable: pick("pfApplicable"),
    esicApplicable: pick("esicApplicable"),
    // The pay version that pay is worked out with ("" = the first version).
    // Only the pay entry's own: an older entry without one stays on the first
    // version even when the employee's current pay is on a newer one.
    payVersion: pay.payVersion || (Object.keys(pay).length ? "" : employee.payVersion || "")
  };
}

// The split on one day, with where and on what pay (employeeOn) it was worked
// out. Only the day's month matters to the split itself (February PT).
export function salaryOn(employee, date) {
  const on = employeeOn(employee, date);
  const month = Number(toDay(date).split("-")[1]);
  return { ...salaryStructure({ ...employee, ...on }, month), ...on };
}

// The state an employee was in on the last day of a month (1-12): the one
// whose rules (PT, minimum wage) apply to that month's pay. "" before joining.
export function stateForMonth(employee, year, month) {
  return employeeOn(employee, lastDayOf(year, month)).state;
}

// "YYYY-MM-DD" of a month's (1-12) last day.
function lastDayOf(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

// The split for one pay month, as things stood on its last day: that day's
// state, department and CTC.
export function salaryForMonth(employee, year, month) {
  return salaryOn(employee, lastDayOf(year, month));
}



// ---- Family members covered under the employee's ESIC ----------------------
// Add Employee > Family. Rule: father / mother are covered when older than
// FAMILY_PARENT_AGE; spouse and children are always covered when listed.
// Nobody is covered when the employee's own ESIC is not applicable.
export const FAMILY_RELATIONS = ["Father", "Mother", "Spouse", "Child"];
export const FAMILY_PARENT_AGE = 60;

// Full years from "DD-MM-YYYY" to `today` (a Date); null when no valid date.
export function ageOn(dob, today = new Date()) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(dob ?? ""));
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

// Whether one family member ({ relation, name, dob }) is covered.
export function familyEsicCovered(member, esicApplicable, today = new Date()) {
  if (!esicApplicable || !String(member?.name ?? "").trim()) return false;
  if (member.relation === "Spouse" || member.relation === "Child") return true;
  const age = ageOn(member.dob, today);
  return age != null && age > FAMILY_PARENT_AGE;
}
