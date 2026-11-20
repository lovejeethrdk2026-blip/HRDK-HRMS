// Pay Formulas (Payroll > Pay Formulas, HR only): pay components HR writes
// themselves, like Excel formulas, e.g.
//   ATTENDANCE_BONUS  earning    IF(ABSENT = 0, 500, 0)
//   CANTEEN           deduction  PRESENT * 30
//   OT_EXTRA          earning    ROUND(OT_HOURS * PER_HOUR * 0.5)
// Month Shift Register & Pay works each active one out for every employee,
// in list order, and adds earnings / takes off deductions from the net pay.
//
// No eval: formulas are read by the small parser below, so a formula can only
// do arithmetic on the variables listed in PAY_VARIABLES and the components
// above it. Shared by the server (checks formulas before saving) and the admin
// app (imported through "@salary", see salaryFormulas.js).

// Variables a formula may use. sample: value for the Test box on the page.
export const PAY_VARIABLES = [
  // Salary (employee master, as on the month's last day)
  { name: "CTC", short: "CTC", group: "Salary", label: "Monthly CTC", sample: 25000 },
  { name: "BASIC", short: "Basic", group: "Salary", label: "Basic (full month)", sample: 12500 },
  { name: "HRA", short: "HRA", group: "Salary", label: "HRA (full month)", sample: 6250 },
  { name: "SPECIAL", short: "Special allowance", group: "Salary", label: "Special allowance (full month)", sample: 3100 },
  { name: "BONUS", short: "Bonus", group: "Salary", label: "Statutory bonus (full month)", sample: 1400 },
  { name: "PF_APPLICABLE", short: "PF applies", group: "Salary", label: "1 when PF applies, else 0", sample: 1 },
  { name: "ESIC_APPLICABLE", short: "ESIC applies", group: "Salary", label: "1 when ESIC applies, else 0", sample: 1 },
  { name: "FULL_PF", short: "Full-month PF", group: "Salary", label: "Employee PF in the salary split (full month)", sample: 1800 },
  { name: "FULL_ESIC", short: "Full-month ESIC", group: "Salary", label: "Employee ESIC in the salary split (full month)", sample: 94 },
  { name: "FULL_IN_HAND", short: "Full-month in hand", group: "Salary", label: "In hand in the salary split (full month)", sample: 21156 },
  // Attendance (Daily Register, the month)
  { name: "DAYS_IN_MONTH", short: "Days in month", group: "Attendance", label: "Days in the month", sample: 30 },
  { name: "PAID_DAYS", short: "Paid days", group: "Attendance", label: "Paid days", sample: 28 },
  { name: "PRESENT", short: "Present days", group: "Attendance", label: "Full days present", sample: 22 },
  { name: "HALF_DAYS", short: "Half days", group: "Attendance", label: "Half days", sample: 1 },
  { name: "ABSENT", short: "Absent days", group: "Attendance", label: "Days absent", sample: 2 },
  { name: "WEEKLY_OFFS", short: "Weekly offs", group: "Attendance", label: "Weekly offs", sample: 4 },
  { name: "WO_WORKED", short: "Weekly-off days worked", group: "Attendance", label: "Days worked on a weekly off", sample: 0 },
  { name: "HOLIDAYS", short: "Holidays", group: "Attendance", label: "Paid holidays", sample: 1 },
  { name: "HOLIDAY_WORKED", short: "Holiday days worked", group: "Attendance", label: "Days worked on a holiday", sample: 0 },
  { name: "LEAVE_DAYS", short: "Leave days", group: "Attendance", label: "Approved leave days", sample: 1 },
  { name: "LATE_DAYS", short: "Late days", group: "Attendance", label: "Days came late", sample: 3 },
  { name: "LATE_HOURS", short: "Late hours", group: "Attendance", label: "Total late hours", sample: 1.5 },
  { name: "EARLY_OUT_DAYS", short: "Early-out days", group: "Attendance", label: "Days left early", sample: 1 },
  { name: "WORKED_HOURS", short: "Worked hours", group: "Attendance", label: "Hours worked", sample: 200 },
  { name: "OT_HOURS", short: "OT hours", group: "Attendance", label: "Overtime hours", sample: 6 },
  { name: "SHORT_HOURS", short: "Short hours", group: "Attendance", label: "Hours short of shift", sample: 2 },
  { name: "FULL_DAY_HOURS", short: "Full-day hours", group: "Attendance", label: "Hours in a full day (shift)", sample: 8 },
  // Pay already worked out (Month Shift Pay)
  { name: "PER_DAY", short: "Per day pay", group: "Pay", label: "CTC ÷ days in month", sample: 833.33 },
  { name: "PER_HOUR", short: "Per hour pay", group: "Pay", label: "Per day ÷ full-day hours", sample: 104.17 },
  { name: "EARNED", short: "Earned CTC", group: "Pay", label: "Earned CTC (per day × paid days)", sample: 23333 },
  { name: "GROSS", short: "Gross", group: "Pay", label: "Earned gross (basic+HRA+bonus+special for paid days)", sample: 21400 },
  { name: "PF", short: "Employee PF", group: "Pay", label: "Employee PF", sample: 1600 },
  { name: "ESIC", short: "Employee ESIC", group: "Pay", label: "Employee ESIC", sample: 88 },
  { name: "PT", short: "PT", group: "Pay", label: "Professional Tax", sample: 200 },
  { name: "IN_HAND", short: "In hand", group: "Pay", label: "In hand (gross − PF − ESIC − PT)", sample: 19512 },
  { name: "OT_PAY", short: "OT pay", group: "Pay", label: "OT pay (OT hours × per hour)", sample: 625 },
  // Who / when (text values compare ignoring case: STATE = "Maharashtra")
  { name: "MONTH", short: "Month", group: "Employee", label: "Pay month number, 1–12", sample: 11 },
  { name: "STATE", short: "State", group: "Employee", label: "State (text)", sample: "Maharashtra" },
  { name: "DEPARTMENT", short: "Department", group: "Employee", label: "Department (text)", sample: "Production" },
  { name: "SALARY_TYPE", short: "Salary type", group: "Employee", label: "Salary type on master (text)", sample: "" }
];

export const PAY_FUNCTIONS = [
  { name: "IF", usage: "IF(condition, then, else)", label: "then when condition is true, else otherwise" },
  { name: "MIN", usage: "MIN(a, b, …)", label: "Smallest value" },
  { name: "MAX", usage: "MAX(a, b, …)", label: "Largest value" },
  { name: "ROUND", usage: "ROUND(x, digits)", label: "Round to digits (0 when left out)" },
  { name: "ROUNDUP", usage: "ROUNDUP(x, digits)", label: "Round up" },
  { name: "ROUNDDOWN", usage: "ROUNDDOWN(x, digits)", label: "Round down" },
  { name: "ABS", usage: "ABS(x)", label: "Value without minus sign" },
  { name: "MOD", usage: "MOD(x, y)", label: "Remainder of x ÷ y" },
  { name: "MINWAGE", usage: "MINWAGE(STATE)", label: "State's minimum wage (Payroll Settings), 0 when none" },
  { name: "PTSLAB", usage: "PTSLAB(GROSS, STATE, MONTH)", label: "Professional Tax from the state's slabs (Payroll Settings)" },
  { name: "AND", usage: "AND(a, b, …)", label: "True when all are true" },
  { name: "OR", usage: "OR(a, b, …)", label: "True when any is true" },
  { name: "NOT", usage: "NOT(a)", label: "Opposite" }
];

// Component kinds: earnings add to net pay, deductions take off, employer
// cost and info are shown only.
export const COMPONENT_TYPES = [
  { value: "earning", label: "Earning (adds to pay)" },
  { value: "deduction", label: "Deduction (cuts pay)" },
  { value: "employer", label: "Employer cost (not paid)" },
  { value: "info", label: "Info only" }
];

// Payroll Settings numbers, usable in every formula (e.g. BASIC * PF_EMPLOYEE_RATE%).
// key: the Payroll Settings field. Rates are per cent numbers (12 = 12%).
export const SETTING_VARIABLES = [
  { name: "BASIC_PERCENT", key: "basicPercent", short: "Basic share", label: "Basic % of CTC" },
  { name: "HRA_PERCENT", key: "hraPercent", short: "HRA share", label: "HRA at most % of basic" },
  { name: "BONUS_AMOUNT", key: "statutoryBonus", short: "Bonus amount", label: "Statutory bonus a month" },
  { name: "BONUS_LIMIT", key: "bonusYearlyLimit", short: "Bonus yearly limit", label: "No bonus from this yearly CTC" },
  { name: "PF_EMPLOYEE_RATE", key: "pfEmployeeRate", short: "Employee PF rate", label: "Employee PF %" },
  { name: "PF_EMPLOYER_RATE", key: "pfEmployerRate", short: "Employer PF rate", label: "Employer PF %" },
  { name: "PF_CEILING", key: "pfCeilingRequired", short: "PF ceiling on", label: "1 when the PF ceiling is required, else 0" },
  { name: "PF_WAGE_LIMIT", key: "pfWageLimit", short: "PF wage limit", label: "PF wage limit" },
  { name: "PF_MAX", key: "pfMaxAmount", short: "Max PF", label: "Maximum PF a month" },
  { name: "ESIC_EMPLOYEE_RATE", key: "esicEmployeeRate", short: "Employee ESIC rate", label: "Employee ESIC %" },
  { name: "ESIC_EMPLOYER_RATE", key: "esicEmployerRate", short: "Employer ESIC rate", label: "Employer ESIC %" },
  { name: "ESIC_CEILING", key: "esicCeiling", short: "ESIC ceiling", label: "ESIC ceiling (0 = none)" }
];

// The Payroll Settings numbers as formula variables.
export function settingVariables(settings) {
  return Object.fromEntries(
    SETTING_VARIABLES.map(({ name, key }) => [name, typeof settings?.[key] === "boolean" ? (settings[key] ? 1 : 0) : Number(settings?.[key]) || 0])
  );
}

const VARIABLE_NAMES = new Set([...PAY_VARIABLES.map((v) => v.name), ...SETTING_VARIABLES.map((v) => v.name)]);
const FUNCTION_NAMES = new Set(PAY_FUNCTIONS.map((f) => f.name));

// ---- Reading a formula --------------------------------------------------------

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(i));
      if (!m) throw new Error(`Bad number at "${text.slice(i, i + 8)}"`);
      tokens.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      tokens.push({ t: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      if (end < 0) throw new Error("Text not closed: add the closing quote");
      tokens.push({ t: "str", v: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "==", "&&", "||"].includes(two)) {
      tokens.push({ t: "op", v: two === "!=" ? "<>" : two === "==" ? "=" : two });
      i += 2;
      continue;
    }
    if ("+-*/%()<>=,".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`"${c}" is not allowed in a formula`);
  }
  return tokens;
}

// Recursive descent, lowest precedence first:
// or (OR, ||) > and (AND, &&) > compare (= <> < <= > >=) > + - > * / % > unary - > atom
function parse(text) {
  const tokens = tokenize(String(text ?? ""));
  if (!tokens.length) throw new Error("Formula is empty");
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek()?.t === "op" && peek().v === v;
  // After an operand AND / OR can only join two conditions, even before "(".
  const isWord = (v) => peek()?.t === "id" && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(peek() ? `Expected "${v}" near "${peek().v}"` : `Missing "${v}" at the end`);
    pos++;
  };

  function orExpr() {
    let left = andExpr();
    while (isOp("||") || isWord("OR")) {
      pos++;
      left = { k: "call", name: "OR", args: [left, andExpr()], infix: true };
    }
    return left;
  }
  function andExpr() {
    let left = compare();
    while (isOp("&&") || isWord("AND")) {
      pos++;
      left = { k: "call", name: "AND", args: [left, compare()], infix: true };
    }
    return left;
  }
  function compare() {
    let left = sum();
    while (["=", "<>", "<", "<=", ">", ">="].some(isOp)) {
      const op = tokens[pos++].v;
      left = { k: "bin", op, left, right: sum() };
    }
    return left;
  }
  function sum() {
    let left = product();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].v;
      left = { k: "bin", op, left, right: product() };
    }
    return left;
  }
  function product() {
    let left = unary();
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].v;
      left = { k: "bin", op, left, right: unary() };
    }
    return left;
  }
  function unary() {
    if (isOp("-")) {
      pos++;
      return { k: "neg", arg: unary() };
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    let value = atom();
    // 12% = 0.12, as in Excel.
    while (isOp("%")) {
      pos++;
      value = { k: "bin", op: "/", left: value, right: { k: "num", v: 100 }, pct: true };
    }
    return value;
  }
  function atom() {
    const tok = peek();
    if (!tok) throw new Error("Formula ends too soon");
    if (tok.t === "num") {
      pos++;
      return { k: "num", v: tok.v };
    }
    if (tok.t === "str") {
      pos++;
      return { k: "str", v: tok.v };
    }
    if (isOp("(")) {
      pos++;
      const inner = orExpr();
      expect(")");
      return inner;
    }
    if (tok.t === "id") {
      pos++;
      if (isOp("(")) {
        if (!FUNCTION_NAMES.has(tok.v)) throw new Error(`Unknown function ${tok.v}`);
        pos++;
        const args = [];
        if (!isOp(")")) {
          args.push(orExpr());
          while (isOp(",")) {
            pos++;
            args.push(orExpr());
          }
        }
        expect(")");
        return { k: "call", name: tok.v, args };
      }
      if (tok.v === "TRUE") return { k: "num", v: 1 };
      if (tok.v === "FALSE") return { k: "num", v: 0 };
      return { k: "var", name: tok.v };
    }
    throw new Error(`Unexpected "${tok.v}"`);
  }

  const ast = orExpr();
  if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].v}"`);
  return ast;
}

function collectRefs(node, out = new Set()) {
  if (node.k === "var") out.add(node.name);
  if (node.left) collectRefs(node.left, out);
  if (node.right) collectRefs(node.right, out);
  if (node.arg) collectRefs(node.arg, out);
  for (const a of node.args || []) collectRefs(a, out);
  return out;
}

// ---- Working a formula out ------------------------------------------------------

// MINWAGE / PTSLAB read Payroll Settings; salaryFormulas.js plugs them in
// (setFormulaHelpers) so this file needs nothing from it.
const helpers = { minWage: () => 0, professionalTax: () => 0 };
export function setFormulaHelpers(next) {
  Object.assign(helpers, next);
}

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const truthy = (v) => (typeof v === "string" ? v !== "" : num(v) !== 0);
const roundTo = (fn, x, d) => {
  const f = 10 ** Math.trunc(num(d));
  return fn(num(x) * f) / f;
};

function evaluate(node, vars) {
  switch (node.k) {
    case "num":
    case "str":
      return node.v;
    case "var":
      if (!(node.name in vars)) throw new Error(`Unknown name ${node.name}`);
      return vars[node.name];
    case "neg":
      return -num(evaluate(node.arg, vars));
    case "bin": {
      const a = evaluate(node.left, vars);
      const b = evaluate(node.right, vars);
      switch (node.op) {
        case "+": return num(a) + num(b);
        case "-": return num(a) - num(b);
        case "*": return num(a) * num(b);
        case "/": return num(b) === 0 ? 0 : num(a) / num(b); // divide by 0 gives 0, not an error
      }
      // Text compares ignoring case and spaces at the ends.
      const text = typeof a === "string" || typeof b === "string";
      const x = text ? String(a).trim().toLowerCase() : num(a);
      const y = text ? String(b).trim().toLowerCase() : num(b);
      switch (node.op) {
        case "=": return x === y ? 1 : 0;
        case "<>": return x !== y ? 1 : 0;
        case "<": return x < y ? 1 : 0;
        case "<=": return x <= y ? 1 : 0;
        case ">": return x > y ? 1 : 0;
        case ">=": return x >= y ? 1 : 0;
      }
      throw new Error(`Unknown operator ${node.op}`);
    }
    case "call": {
      const { name, args } = node;
      if (name === "IF") {
        if (args.length < 2 || args.length > 3) throw new Error("IF needs (condition, then, else)");
        return truthy(evaluate(args[0], vars)) ? evaluate(args[1], vars) : args[2] ? evaluate(args[2], vars) : 0;
      }
      const values = args.map((a) => evaluate(a, vars));
      const need = (n) => {
        if (values.length < n) throw new Error(`${name} needs ${n === 1 ? "a value" : `${n} values`}`);
      };
      switch (name) {
        case "MIN": need(1); return Math.min(...values.map(num));
        case "MAX": need(1); return Math.max(...values.map(num));
        case "ROUND": need(1); return roundTo(Math.round, values[0], values[1] ?? 0);
        case "ROUNDUP": need(1); return roundTo(Math.ceil, values[0], values[1] ?? 0);
        case "ROUNDDOWN": need(1); return roundTo(Math.floor, values[0], values[1] ?? 0);
        case "ABS": need(1); return Math.abs(num(values[0]));
        case "MOD": need(2); return num(values[1]) === 0 ? 0 : num(values[0]) % num(values[1]);
        case "MINWAGE": need(1); return num(helpers.minWage(String(values[0] ?? "")));
        case "PTSLAB": need(2); return num(helpers.professionalTax(num(values[0]), String(values[1] ?? ""), num(values[2])));
        case "AND": need(1); return values.every(truthy) ? 1 : 0;
        case "OR": need(1); return values.some(truthy) ? 1 : 0;
        case "NOT": need(1); return truthy(values[0]) ? 0 : 1;
      }
      throw new Error(`Unknown function ${name}`);
    }
  }
  throw new Error("Bad formula");
}

// ---- Components ------------------------------------------------------------------

const CODE_RE = /^[A-Z][A-Z0-9_]{0,29}$/;

// Checks a list of components ({ code, name, type, formula, active }).
// Returns { components } cleaned up, or { error } saying what is wrong and where.
export function checkComponents(list) {
  if (!Array.isArray(list)) return { error: "Formulas must be a list" };
  const out = [];
  const known = new Set(VARIABLE_NAMES);
  for (const [i, raw] of list.entries()) {
    const where = `Row ${i + 1}`;
    const code = String(raw?.code ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(raw?.name ?? "").trim();
    const type = COMPONENT_TYPES.some((t) => t.value === raw?.type) ? raw.type : null;
    const formula = String(raw?.formula ?? "").trim();
    if (!CODE_RE.test(code)) return { error: `${where}: code must start with a letter and use only A–Z, 0–9 and _ (e.g. CANTEEN)` };
    if (VARIABLE_NAMES.has(code) || FUNCTION_NAMES.has(code) || code === "TRUE" || code === "FALSE") {
      return { error: `${where}: ${code} is a built-in name, pick another code` };
    }
    if (out.some((c) => c.code === code)) return { error: `${where}: code ${code} is used twice` };
    if (!name) return { error: `${where} (${code}): give it a name` };
    if (!type) return { error: `${where} (${code}): pick earning, deduction, employer cost or info` };
    let ast;
    try {
      ast = parse(formula);
    } catch (err) {
      return { error: `${code}: ${err.message}` };
    }
    for (const ref of collectRefs(ast)) {
      if (ref === code) return { error: `${code}: a formula cannot use itself` };
      if (!known.has(ref)) {
        const later = list.slice(i + 1).some((c) => String(c?.code ?? "").trim().toUpperCase() === ref);
        return { error: later ? `${code}: uses ${ref}, which comes later in the list. Move ${ref} above it.` : `${code}: unknown name ${ref}` };
      }
    }
    known.add(code);
    out.push({ code, name, type, formula, active: raw?.active !== false });
  }
  return { components: out };
}

// Parsed formulas are kept by text so a month of employees reads each once.
const parsed = new Map();
function parsedFormula(formula) {
  if (!parsed.has(formula)) {
    if (parsed.size > 500) parsed.clear();
    parsed.set(formula, parse(formula));
  }
  return parsed.get(formula);
}

// Works out one formula with the given variables. Throws on a bad formula.
export function evaluateFormula(formula, vars) {
  return evaluate(parsedFormula(String(formula ?? "")), vars);
}

// Works out the active components in order for one employee.
// vars: { CTC, PAID_DAYS, … } (PAY_VARIABLES names).
// Returns { values: { CODE: amount }, earnings, deductions, employer, errors: { CODE: message } }.
// A component that fails counts as 0 and its message is in errors.
export function applyComponents(components, vars) {
  const scope = { ...vars };
  const values = {};
  const errors = {};
  let earnings = 0;
  let deductions = 0;
  let employer = 0;
  for (const c of components || []) {
    if (c.active === false) continue;
    let amount = 0;
    try {
      amount = num(evaluateFormula(c.formula, scope));
      if (!Number.isFinite(amount)) amount = 0;
    } catch (err) {
      errors[c.code] = err.message;
    }
    amount = Math.round(amount * 100) / 100;
    values[c.code] = amount;
    scope[c.code] = amount;
    if (c.type === "earning") earnings += amount;
    else if (c.type === "deduction") deductions += amount;
    else if (c.type === "employer") employer += amount;
  }
  return { values, earnings, deductions, employer, errors };
}

// The sample variables (PAY_VARIABLES sample values) for the Test box.
export const sampleVariables = () =>
  Object.fromEntries([...PAY_VARIABLES.map((v) => [v.name, v.sample]), ...Object.entries(settingVariables(DEFAULT_NUMBERS))]);

// Payroll Settings defaults, for the test figures only (salaryFormulas.js has the real ones).
const DEFAULT_NUMBERS = {
  basicPercent: 50, hraPercent: 50, statutoryBonus: 1400, bonusYearlyLimit: 600000, pfEmployeeRate: 12, pfEmployerRate: 12,
  pfCeilingRequired: true, pfWageLimit: 25000, pfMaxAmount: 3000, esicEmployeeRate: 0.75, esicEmployerRate: 3.25, esicCeiling: 0
};

// ---- Built-in formulas: salary split and month pay ----------------------------------
// The salary split (Add Employee, Salary revision, histories, payslips) and
// the month pay (Month Shift Pay) are formula lists too, editable on the Pay
// Formulas page. The standard lists below give exactly the pay the code gave
// before (checked employee by employee). required: rows that must stay
// (their results are used elsewhere); other rows are helpers HR may add,
// change or remove.

const SPLIT_INPUTS = ["CTC", "STATE", "MONTH", "PF_APPLICABLE", "ESIC_APPLICABLE"];
const MONTH_OUTPUTS = ["PER_DAY", "PER_HOUR", "EARNED", "OT_PAY", "GROSS", "PF", "ESIC", "PT", "IN_HAND"];

export const FORMULA_STAGES = {
  split: {
    title: "Salary split",
    inputs: SPLIT_INPUTS,
    required: ["BASIC", "BONUS", "ESIC_EMPLOYER", "HRA", "SPECIAL", "GROSS", "PF_EMPLOYEE", "PF_EMPLOYER", "ESIC_EMPLOYEE", "PT", "IN_HAND"],
    defaults: [
      { code: "BASIC", name: "Basic", formula: "MAX(CTC * BASIC_PERCENT%, MINWAGE(STATE), IF(PF_APPLICABLE AND NOT(ESIC_APPLICABLE), 21005, 0), IF(NOT(PF_APPLICABLE) AND NOT(ESIC_APPLICABLE), 25005, 0))" },
      { code: "BONUS", name: "Statutory bonus", formula: "IF(CTC > 0 AND CTC * 12 < BONUS_LIMIT, BONUS_AMOUNT, 0)" },
      { code: "ESIC_EMPLOYER", name: "Employer ESIC", formula: "IF(ESIC_APPLICABLE, BASIC * ESIC_EMPLOYER_RATE%, 0)" },
      { code: "PF_CAPPED", name: "PF capped (1 = yes)", formula: "IF(PF_CEILING AND BASIC >= PF_WAGE_LIMIT, 1, 0)" },
      { code: "SPLIT_PF", name: "Employer PF kept aside for the split", formula: "IF(PF_APPLICABLE, IF(PF_CAPPED, PF_MAX, (BASIC + BONUS) * PF_EMPLOYER_RATE%), 0)" },
      { code: "HRA", name: "HRA", formula: "MAX(MIN(CTC - BASIC - BONUS - ESIC_EMPLOYER - SPLIT_PF, BASIC * HRA_PERCENT%), IF(STATE = \"Maharashtra\" OR (STATE = \"West Bengal\" AND ESIC_APPLICABLE), BASIC * 5%, 0))" },
      { code: "SPECIAL", name: "Special allowance", formula: "MAX((CTC - BASIC - HRA - BONUS - ESIC_EMPLOYER - SPLIT_PF) / IF(PF_APPLICABLE AND NOT(PF_CAPPED), 1 + PF_EMPLOYER_RATE%, 1), 0)" },
      { code: "GROSS", name: "Gross", formula: "BASIC + HRA + BONUS + SPECIAL" },
      { code: "PF_EMPLOYEE", name: "Employee PF", formula: "IF(PF_APPLICABLE, IF(PF_CEILING, MIN(ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * PF_EMPLOYEE_RATE%, 2)), PF_MAX), ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * PF_EMPLOYEE_RATE%, 2))), 0)" },
      { code: "PF_EMPLOYER", name: "Employer PF", formula: "IF(PF_APPLICABLE, IF(PF_CEILING, MIN(ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * PF_EMPLOYER_RATE%, 2)), PF_MAX), ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * PF_EMPLOYER_RATE%, 2))), 0)" },
      { code: "ESIC_EMPLOYEE", name: "Employee ESIC", formula: "IF(ESIC_APPLICABLE, BASIC * ESIC_EMPLOYEE_RATE%, 0)" },
      { code: "PT", name: "Professional Tax", formula: "PTSLAB(GROSS, STATE, MONTH)" },
      { code: "IN_HAND", name: "In hand", formula: "GROSS - PF_EMPLOYEE - ESIC_EMPLOYEE - PT" }
    ]
  },
  month: {
    title: "Month pay",
    inputs: PAY_VARIABLES.map((v) => v.name).filter((name) => !MONTH_OUTPUTS.includes(name)),
    required: MONTH_OUTPUTS,
    defaults: [
      { code: "PER_DAY", name: "Per day", formula: "CTC / DAYS_IN_MONTH" },
      { code: "PER_HOUR", name: "Per hour", formula: "PER_DAY / FULL_DAY_HOURS" },
      { code: "EARNED", name: "Earned CTC", formula: "PER_DAY * PAID_DAYS" },
      { code: "OT_PAY", name: "OT pay", formula: "PER_HOUR * OT_HOURS" },
      { code: "RATIO", name: "Share of the month paid", formula: "PAID_DAYS / DAYS_IN_MONTH" },
      { code: "GROSS", name: "Month gross", formula: "IF(CTC > 0, (BASIC + HRA + BONUS + SPECIAL) * RATIO, 0)" },
      { code: "PF", name: "Month employee PF", formula: "IF(CTC > 0 AND FULL_PF > 0, IF(PF_CEILING, MIN(ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * RATIO * PF_EMPLOYEE_RATE) / 100), PF_MAX), ROUNDUP(ROUND((BASIC + BONUS + SPECIAL) * RATIO * PF_EMPLOYEE_RATE) / 100)), 0)" },
      { code: "ESIC", name: "Month employee ESIC", formula: "IF(CTC > 0, FULL_ESIC * RATIO, 0)" },
      { code: "PT", name: "Month Professional Tax", formula: "IF(GROSS > 0, PTSLAB(GROSS, STATE, MONTH), 0)" },
      { code: "IN_HAND", name: "Month in hand", formula: "GROSS - PF - ESIC - PT" }
    ]
  }
};

// Checks one stage's list ({ code, name, formula }). Returns { list } cleaned
// up, or { error }. A row may use the stage's inputs, the Payroll Settings
// names and the rows above it.
export function checkStage(stageKey, list) {
  const stage = FORMULA_STAGES[stageKey];
  if (!stage) return { error: `Unknown formula list ${stageKey}` };
  if (!Array.isArray(list)) return { error: `${stage.title}: formulas must be a list` };
  const inputs = new Set([...stage.inputs, ...SETTING_VARIABLES.map((v) => v.name)]);
  const known = new Set(inputs);
  const out = [];
  for (const [i, raw] of list.entries()) {
    const code = String(raw?.code ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(raw?.name ?? "").trim();
    const formula = String(raw?.formula ?? "").trim();
    const where = `${stage.title} row ${i + 1}`;
    if (!CODE_RE.test(code)) return { error: `${where}: code must start with a letter and use only A–Z, 0–9 and _` };
    if (inputs.has(code) || FUNCTION_NAMES.has(code) || code === "TRUE" || code === "FALSE") {
      return { error: `${where}: ${code} is a built-in name, pick another code` };
    }
    if (out.some((c) => c.code === code)) return { error: `${where}: code ${code} is used twice` };
    if (!name) return { error: `${where} (${code}): give it a name` };
    let ast;
    try {
      ast = parse(formula);
    } catch (err) {
      return { error: `${code}: ${err.message}` };
    }
    for (const ref of collectRefs(ast)) {
      if (ref === code) return { error: `${code}: a formula cannot use itself` };
      if (!known.has(ref)) {
        const later = list.slice(i + 1).some((c) => String(c?.code ?? "").trim().toUpperCase() === ref);
        return { error: later ? `${code}: uses ${ref}, which comes later in the list. Move ${ref} above it.` : `${code}: unknown name ${ref}` };
      }
    }
    known.add(code);
    out.push({ code, name, formula });
  }
  const missing = stage.required.filter((code) => !out.some((c) => c.code === code));
  if (missing.length) return { error: `${stage.title}: ${missing.join(", ")} must stay in the list` };
  return { list: out };
}

// Works a stage's list out in order, no rounding between rows.
// Returns { values: { CODE: value }, errors: { CODE: message } }; a row that
// fails counts as 0.
export function runFormulas(list, vars) {
  const scope = { ...vars };
  const values = {};
  const errors = {};
  for (const row of list || []) {
    let value = 0;
    try {
      value = evaluateFormula(row.formula, scope);
      if (typeof value !== "string" && !Number.isFinite(value)) value = 0;
    } catch (err) {
      errors[row.code] = err.message;
    }
    values[row.code] = value;
    scope[row.code] = value;
  }
  return { values, errors };
}


// ---- Showing a formula to people ----------------------------------------------
// Pay Formulas page, "All formulas" at the bottom: each formula in maths
// (BASIC × 12%, ≥, ≠ ...) and in words ("if Days absent is 0 then 500,
// otherwise 0"). nameOf(CODE) gives the words for a name; the code is kept
// when it gives nothing.

const LEVEL = { or: 1, and: 2, cmp: 3, add: 4, mul: 5, neg: 6, atom: 7 };
const levelOf = (node) => {
  if (node.k === "bin") {
    if (node.pct) return LEVEL.neg;
    if (["+", "-"].includes(node.op)) return LEVEL.add;
    if (["*", "/"].includes(node.op)) return LEVEL.mul;
    return LEVEL.cmp;
  }
  if (node.k === "call" && node.name === "OR" && node.infix) return LEVEL.or;
  if (node.k === "call" && node.name === "AND" && node.infix) return LEVEL.and;
  if (node.k === "neg") return LEVEL.neg;
  return LEVEL.atom;
};
const fmtNum = (v) => String(v);

const MATH_OP = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": "=", "<>": "≠", "<": "<", "<=": "≤", ">": ">", ">=": "≥" };
const WORD_OP = {
  "+": "plus", "-": "minus", "*": "×", "/": "divided by",
  "=": "is", "<>": "is not", "<": "is less than", "<=": "is at most", ">": "is more than", ">=": "is at least"
};

function show(node, nameOf, words) {
  const wrap = (child, min) => {
    const text = show(child, nameOf, words);
    return levelOf(child) < min ? `(${text})` : text;
  };
  switch (node.k) {
    case "num":
      return fmtNum(node.v);
    case "str":
      return `"${node.v}"`;
    case "var":
      return nameOf(node.name) || node.name;
    case "neg":
      return `−${wrap(node.arg, LEVEL.neg)}`;
    case "bin": {
      if (node.pct) return `${wrap(node.left, LEVEL.atom)}%`;
      const level = levelOf(node);
      const op = (words ? WORD_OP : MATH_OP)[node.op];
      // In words an IF / MIN ... inside a sum gets brackets, so "otherwise 0 plus X" reads right.
      const side = (child, min) =>
        words && child.k === "call" && !child.infix && !child.name.startsWith("ROUND") ? `(${show(child, nameOf, words)})` : wrap(child, min);
      return `${side(node.left, level)} ${op} ${side(node.right, level + 1)}`;

    }
    case "call": {
      const args = node.args.map((a) => show(a, nameOf, words));
      const list = (joiner) => (args.length > 1 ? `${args.slice(0, -1).join(", ")} ${joiner} ${args.at(-1)}` : args[0]);
      if (node.infix) {
        const level = levelOf(node);
        return node.args.map((a) => wrap(a, level)).join(node.name === "AND" ? (words ? " and " : " AND ") : words ? " or " : " OR ");
      }
      if (!words) return `${node.name}(${args.join(", ")})`;
      const digits = (verb) => {
        const d = node.args[1];
        const n = d?.k === "num" ? d.v : null;
        const to = n ? ` to ${n} decimal${n > 1 ? "s" : ""}` : d && n !== 0 ? ` to ${args[1]} decimals` : "";
        return `${args[0]} ${verb}${to}`;
      };
      switch (node.name) {
        case "IF": return `if ${args[0]} then ${args[1]}, otherwise ${args[2] ?? "0"}`;
        case "MIN": return `the smaller of ${list("and")}`;
        case "MAX": return `the larger of ${list("and")}`;
        case "ROUND": return `(${digits("rounded")})`;
        case "ROUNDUP": return `(${digits("rounded up")})`;
        case "ROUNDDOWN": return `(${digits("rounded down")})`;
        case "ABS": return `${args[0]} without minus sign`;
        case "MOD": return `remainder of ${args[0]} ÷ ${args[1]}`;
        case "MINWAGE": return `the minimum wage of ${args[0]}`;
        case "PTSLAB": return `PT slab for ${args[0]} in ${args[1]}`;
        case "AND": return list("and");
        case "OR": return list("or");
        case "NOT": return `not (${args[0]})`;
      }
      return `${node.name}(${args.join(", ")})`;
    }
  }
  return "";
}

// { math, words } for one formula, or { error } when it cannot be read.
// Default nameOf: the short words for a PAY_VARIABLES name.
const SHORT = Object.fromEntries([...PAY_VARIABLES, ...SETTING_VARIABLES].map((v) => [v.name, v.short]));
export function describeFormula(formula, nameOf = (name) => SHORT[name]) {
  try {
    const ast = parse(formula);
    let words = show(ast, nameOf, true);
    if (ast.k === "call" && ast.name.startsWith("ROUND")) words = words.slice(1, -1); // no brackets round the whole sentence
    return { math: show(ast, nameOf, false), words: words.replace(/^(\(?)([a-z])/, (_, b, c) => b + c.toUpperCase()) };
  } catch (err) {
    return { error: err.message };
  }
}
