// Salary formulas from the HR sheet "CTC PF YES AND ESIC YES CASES.xlsx", one
// function per item. salaryStructure() at the bottom runs them in order. The
// only copy: the server uses it when saving an employee, and the admin app
// imports this same file (alias "@salary" in ADMIN/vite.config.js) for the Add
// Employee preview.
//
// Monthly CTC = basic + HRA + bonus + special + employer PF + employer ESIC.
// In hand = that gross less employee PF, ESIC and Professional Tax.
// All amounts are monthly rupees; state names are matched ignoring case.

const MIN_WAGE = { rajasthan: 8050, "west bengal": 11365, maharashtra: 14470 };
const STATUTORY_BONUS = 1400;
const BONUS_YEARLY_LIMIT = 600000;
const PF_RATE = 0.12;
const PF_CAP = 3000;

const PF_WAGE_LIMIT = 25000;

const ESIC_EMPLOYER_RATE = 0.0325;
const ESIC_EMPLOYEE_RATE = 0.0075;

// Professional Tax by state: [up to this monthly gross, PT], first match wins.
// From the PT BC365 deducts (pay sheets Apr-Aug 2026: West Bengal staff 8xxxx,
// Maharashtra staff 4xxxx) and the states' slabs. Karnataka from its slab
// (nil below 25000). Rajasthan has no PT.

const PROFESSIONAL_TAX = {
  "west bengal": [
    [20000, 0],
    [30000, 100],
    [50000, 140],
    [100000, 170],
    [Infinity, 208]
  ],
  maharashtra: [
    [7500, 0],
    [10000, 175],
    [Infinity, 200] // 300 in February (see professionalTax)
  ],
  karnataka: [
    [24999.99, 0],
    [Infinity, 200] // 300 in February (see professionalTax)
  ]
};

// The top slab's PT in February, where it differs (the year's balance).
const FEBRUARY_TOP_PT = { maharashtra: 300, karnataka: 300 };

const stateKey = (state) => String(state ?? "").trim().toLowerCase();
const paise = (amount) => Math.round(amount * 100) / 100;

// Higher of 50% of CTC and the floor: the state's minimum wage, raised to
// 21005 when PF is on but ESIC is off, and to 25005 when both are off.
export function basicSalary(ctc, state, pf, esic) {
  let floor = MIN_WAGE[stateKey(state)] ?? 0;
  if (pf && !esic) floor = Math.max(floor, 21005);
  if (!pf && !esic) floor = Math.max(floor, 25005);
  return Math.max(ctc * 0.5, floor);
}

// 1400 while yearly CTC is under 6,00,000, else 0.
export function statutoryBonus(ctc) {
  return ctc > 0 && ctc * 12 < BONUS_YEARLY_LIMIT ? STATUTORY_BONUS : 0;
}

// 3.25% of basic, when ESIC is on.
export function esicEmployer(basic, esic) {
  return esic ? basic * ESIC_EMPLOYER_RATE : 0;
}

// 0.75% of basic, when ESIC is on.
export function esicEmployee(basic, esic) {
  return esic ? basic * ESIC_EMPLOYEE_RATE : 0;
}

// Employer PF as the HRA and special split counts it: 12% of basic + bonus
// while basic is under 25000 (special adds its own 12% in specialAllowance),
// a flat 3000 from 25000 up, 0 when PF is off.
export function pfForSplit(basic, bonus, pf) {
  if (!pf) return 0;
  return basic < PF_WAGE_LIMIT ? (basic + bonus) * PF_RATE : PF_CAP;
}

// Lower of 50% of basic and what CTC leaves after basic, bonus and the
// employer's ESIC and PF. Never below 5% of basic in Maharashtra, nor in West
// Bengal while ESIC is on; otherwise never below 0.
export function hraAllowance({ ctc, basic, bonus, employerEsic, splitPf, state, esic }) {
  const hra = Math.min(ctc - basic - bonus - employerEsic - splitPf, basic * 0.5);
  const key = stateKey(state);
  const hasFloor = key === "maharashtra" || (key === "west bengal" && esic);
  return Math.max(hra, hasFloor ? basic * 0.05 : 0);
}

// The rest of CTC. While PF is on and basic is under 25000, special draws 12%
// employer PF of its own, so the rest is divided by 1.12. Never below 0.
export function specialAllowance({ ctc, basic, hra, bonus, employerEsic, splitPf, pf }) {
  const left = ctc - basic - hra - bonus - employerEsic - splitPf;
  const special = pf && basic < PF_WAGE_LIMIT ? left / (1 + PF_RATE) : left;
  return Math.max(special, 0);
}

// Employee PF, and the same again from the employer: 12% of basic + bonus +
// special, rounded up, at most 3000, when PF is on.
export function pfContribution(basic, bonus, special, pf) {
  if (!pf) return 0;
  return Math.min(Math.ceil(paise((basic + bonus + special) * PF_RATE)), PF_CAP);
}

// Professional Tax on a month's gross (basic + HRA + bonus + special) in the
// employee's state; 0 where the state has none. month (1-12), when given,
// applies the February rate on the top slab (300 in Maharashtra, Karnataka).
export function professionalTax(gross, state, month) {
  const key = stateKey(state);
  const slabs = PROFESSIONAL_TAX[key];
  if (!slabs) return 0;
  const slab = slabs.find(([upTo]) => gross <= upTo);
  return month === 2 && slab === slabs.at(-1) && FEBRUARY_TOP_PT[key] ? FEBRUARY_TOP_PT[key] : slab[1];
}

// Basic + HRA + bonus + special, less the employee's PF, ESIC and PT.
export function inHandSalary({ basic, hra, bonus, special, pf, esic, pt = 0 }) {
  return basic + hra + bonus + special - pf - esic - pt;
}


// The whole monthly split for one employee. month (1-12), when given, is the
// pay month (only February's PT differs).
export function salaryStructure({ monthlyCtc, state, pfApplicable, esicApplicable }, month) {
  const ctc = Number(monthlyCtc) || 0;
  const pf = Boolean(pfApplicable);
  const esic = Boolean(esicApplicable);

  const basic = basicSalary(ctc, state, pf, esic);
  const bonus = statutoryBonus(ctc);
  const employerEsic = esicEmployer(basic, esic);
  const splitPf = pfForSplit(basic, bonus, pf);
  const hra = hraAllowance({ ctc, basic, bonus, employerEsic, splitPf, state, esic });
  const special = specialAllowance({ ctc, basic, hra, bonus, employerEsic, splitPf, pf });
  const pfAmount = pfContribution(basic, bonus, special, pf);
  const employeeEsic = esicEmployee(basic, esic);
  const pt = professionalTax(basic + hra + bonus + special, state, month);

  return {
    basic: paise(basic),
    hra: paise(hra),
    specialAllowance: paise(special),
    statutoryBonus: bonus,
    esicEmployee: paise(employeeEsic),
    esicEmployer: paise(employerEsic),
    pfEmployee: pfAmount,
    pfEmployer: pfAmount,
    professionalTax: pt,
    inHand: paise(inHandSalary({ basic, hra, bonus, special, pf: pfAmount, esic: employeeEsic, pt }))
  };
}

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
    esicApplicable: pick("esicApplicable")
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
