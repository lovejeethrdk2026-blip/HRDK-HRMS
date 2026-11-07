import EmployeeProfile from "./models/EmployeeProfile.js";
import Department from "../department/models/Department.js";
import {
  departmentHistoryOf,
  openExitOf,
  payHistoryOf,
  salaryStructure,
  sortableDate,
  stateHistoryOf
} from "../utils/salaryFormulas.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerScope, sameDepartment } from "../dailyRegister/registerScope.js";

// Only the employee code and name are required (the record is keyed by the
// code): path -> label for the "... is required" message. Every other field
// may be left blank; filled ones still get their format checked.
const REQUIRED = {
  employeeId: "Employee code",
  name: "Employee name"
};

// Text fields the Add Employee form sends, by path into the record.
const TEXT_PATHS = [
  "initialsNo",
  "department",
  "subDepartment", // optional: a department may have no sub departments
  "designation",
  "employeeRole",
  "reportingManager",
  "joiningDate",
  "salaryType",
  "employmentType",
  "confirmationDate",
  "workLocation",
  "weeklyOff",
  "uanNo",
  "esicNo",
  "state",
  "otherBenefits",
  "aadhaarNo",
  "pan",
  "otherId.type",
  "otherId.number",
  "mobile",
  "emergencyContact.name",
  "emergencyContact.phone",
  "emergencyContact.relation",
  "address.line",
  "address.city",
  "address.state",
  "address.pin",
  "address.country",
  "permanentSameAsCurrent",
  "permanentAddress.line",
  "permanentAddress.city",
  "permanentAddress.state",
  "permanentAddress.pin",
  "permanentAddress.country",
  "bank.bankName",
  "bank.accountNo",
  "bank.ifscCode",
  "shift.in",
  "shift.out"
];

// Shape checks, by path: [pattern, message].
const FORMATS = {
  initialsNo: [/^\d{1,10}$/, "Initials No. must be digits only"],
  joiningDate: [/^\d{2}-\d{2}-\d{4}$/, "Date of joining must be DD-MM-YYYY"],
  aadhaarNo: [/^\d{12}$/, "Aadhaar number must be 12 digits"],
  pan: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must look like ABCDE1234F"],
  employeeRole: [/^(Employee|Manager|Admin)$/, "Role must be Employee, Manager or Admin"],
  salaryType: [/^(Salary|Wages)$/, "Salary type must be Salary or Wages"],
  employmentType: [/^(Permanent|Contract|Trainee|Probation)$/, "Employment type must be Permanent, Contract, Trainee or Probation"],
  confirmationDate: [/^\d{2}-\d{2}-\d{4}$/, "Confirmation date must be DD-MM-YYYY"],
  weeklyOff: [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, "Weekly off must be a day of the week"],
  uanNo: [/^\d{12}$/, "UAN must be 12 digits"],
  esicNo: [/^\d{10}$/, "ESIC number must be 10 digits"],
  "otherId.type": [/^(Voter ID|Driving licence|Ration card|Passport)$/, "Unknown ID proof type"],
  mobile: [/^\d{10}$/, "Mobile number must be 10 digits"],
  "emergencyContact.phone": [/^\d{10}$/, "Emergency contact number must be 10 digits"],
  "address.pin": [/^\d{6}$/, "PIN code must be 6 digits"],
  "permanentAddress.pin": [/^\d{6}$/, "Permanent address PIN code must be 6 digits"],
  permanentSameAsCurrent: [/^(Yes|No)$/, "Same as current address must be Yes or No"],
  "bank.accountNo": [/^\d{6,18}$/, "Bank account number must be 6 to 18 digits"],
  "bank.ifscCode": [/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must look like SBIN0001234"],
  "shift.in": [/^([01]\d|2[0-3]):[0-5]\d$/, "Shift in must be a time like 09:30"],
  "shift.out": [/^([01]\d|2[0-3]):[0-5]\d$/, "Shift out must be a time like 18:30"]
};

// Monthly CTC below which PF and ESIC are always applicable.
const PF_ESIC_LIMIT = 25500;

// Stored upper-case, so "abcde1234f" and "ABCDE1234F" are the same PAN.
const UPPERCASE_PATHS = new Set(["pan", "bank.ifscCode"]);

function getPath(object, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  let node = object;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  node[keys.at(-1)] = value;
}

// Checks the Add Employee form's record and turns it into what gets stored,
// salary split included: { record } or { error } (the message for a 400).
function buildRecord(body) {
  const missing = Object.keys(REQUIRED).find((path) => !String(getPath(body, path) ?? "").trim());
  if (missing) return { error: `${REQUIRED[missing]} is required` };
  const employeeId = String(body.employeeId ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!/^[A-Za-z0-9_-]{1,32}$/.test(employeeId)) {
    return { error: "Employee code may only use letters, digits, - and _ (up to 32)" };
  }

  const record = { employeeId, name };

  for (const path of TEXT_PATHS) {
    let value = String(getPath(body, path) ?? "").trim();
    if (!value) continue;
    if (UPPERCASE_PATHS.has(path)) value = value.toUpperCase();
    const format = FORMATS[path];
    if (format && !format[0].test(value)) return { error: format[1] };
    setPath(record, path, value);
  }

  for (const path of ["yearlyCtc", "monthlyCtc"]) {
    const raw = String(body[path] ?? "").trim();
    if (!raw) continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      const label = path === "yearlyCtc" ? "Yearly" : "Monthly";
      return { error: `${label} CTC must be a number` };
    }
    record[path] = amount;
  }

  for (const path of ["pfApplicable", "esicApplicable"]) {
    const raw = String(body[path] ?? "").trim();
    if (!raw) continue;
    if (!["Yes", "No"].includes(raw)) {
      const label = path === "pfApplicable" ? "PF" : "ESIC";
      return { error: `${label} applicable must be Yes or No` };
    }
    record[path] = raw === "Yes";
  }

  // Below this monthly CTC, PF and ESIC always apply (the Add Employee form
  // locks both to Yes too).
  if (record.monthlyCtc != null && record.monthlyCtc < PF_ESIC_LIMIT) {
    record.pfApplicable = true;
    record.esicApplicable = true;
  }

  record.salary = salaryStructure(record);
  return { record };
}

const bodyOf = (req) => (req.body && typeof req.body === "object" ? req.body : {});

// POST /api/employees  Body: the Add Employee form's record.
async function createEmployee(req, res) {
  const { record, error } = buildRecord(bodyOf(req));
  if (error) return res.status(400).json({ message: error });
  const { employeeId } = record;

  if (await EmployeeProfile.exists({ employeeId })) {
    return res.status(409).json({ message: `Employee ${employeeId} already exists` });
  }

  record.stateHistory = [{ state: record.state, from: record.joiningDate }];
  record.departmentHistory = departmentHistoryOf({ ...record, departmentHistory: [] });
  record.payHistory = payHistoryOf({ ...record, payHistory: [] });

  try {
    const created = await EmployeeProfile.create(record);
    res.status(201).json(created.toObject());
  } catch (error) {
    // Two saves of the same code at once: the unique index catches the second.
    if (error.code === 11000) {
      return res.status(409).json({ message: `Employee ${employeeId} already exists` });
    }
    throw error;
  }
}

// PUT /api/employees/:employeeId  Body: the whole edited record, as the Add
// Employee form sends it. The employee code itself stays as it was.
async function updateEmployee(req, res) {
  const employeeId = req.params.employeeId;
  const { record, error } = buildRecord({ ...bodyOf(req), employeeId });
  if (error) return res.status(400).json({ message: error });

  const employee = await EmployeeProfile.findOne({ employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${employeeId} not found` });

  // The form's State corrects the current stay (a move is a Transfer), and
  // its joining date starts the first.
  const history = stateHistoryOf(employee.toObject()).map((stay) => ({ ...stay }));
  history.at(-1).state = record.state;
  history[0].from = record.joiningDate;
  if (history.length > 1 && sortableDate(record.joiningDate) >= sortableDate(history[1].from)) {
    return res.status(400).json({ message: "Date of joining must be before the first transfer" });
  }
  record.stateHistory = history;

  // Same for the department: the form corrects the current spell (a move is a
  // department transfer).
  const spells = departmentHistoryOf(employee.toObject()).map((spell) => ({ ...spell }));
  Object.assign(spells.at(-1), {
    department: record.department,
    subDepartment: record.subDepartment || "",
    designation: record.designation,
    reportingManager: record.reportingManager
  });
  spells[0].from = record.joiningDate;
  if (spells.length > 1 && sortableDate(record.joiningDate) >= sortableDate(spells[1].from)) {
    return res.status(400).json({ message: "Date of joining must be before the first department transfer" });
  }
  record.departmentHistory = spells;

  // And for the pay: the form's CTC corrects the current pay (a raise is a
  // Salary revision).
  const pays = payHistoryOf(employee.toObject()).map((pay) => ({ ...pay }));
  Object.assign(pays.at(-1), {
    monthlyCtc: record.monthlyCtc,
    pfApplicable: record.pfApplicable,
    esicApplicable: record.esicApplicable
  });
  pays[0].from = record.joiningDate;
  if (pays.length > 1 && sortableDate(record.joiningDate) >= sortableDate(pays[1].from)) {
    return res.status(400).json({ message: "Date of joining must be before the first salary revision" });
  }
  record.payHistory = pays;

  employee.set(record);
  await employee.save();
  res.json(employee.toObject());
}

// A real "DD-MM-YYYY" date: no 31-02-2026.
function isDate(date) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) return false;
  const [day, month, year] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

// "DD-MM-YYYY" of the day before.
function dayBefore(date) {
  const [day, month, year] = date.split("-").map(Number);
  const before = new Date(Date.UTC(year, month - 1, day - 1));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(before.getUTCDate())}-${pad(before.getUTCMonth() + 1)}-${before.getUTCFullYear()}`;
}

// The message a change gets for an employee who has left: they rejoin (or the
// exit is undone) first. "" while they work here.
function leftMessage(employee) {
  const exit = openExitOf(employee);
  return exit ? `${employee.name} left on ${exit.lastWorkingDay}; rejoin them first` : "";
}

// A new monthly CTC from a form: { ctc } (null when left blank) or { error }.
function parseCtc(text) {
  if (!text) return { ctc: null };
  const ctc = Number(text);
  if (!Number.isFinite(ctc) || ctc <= 0) return { error: "New monthly CTC must be a number above 0" };
  return { ctc };
}

// Puts an employee on a new monthly CTC from effectiveDate: closes the current
// pay the day before, opens the new one (kind "revision" or "department") and
// sets CTC, yearly CTC (12 times), PF / ESIC and the split. Returns an error
// message, or "" once done (the caller saves).
function startPay(employee, { ctc, effectiveDate, kind, remark }) {
  const pays = payHistoryOf(employee.toObject()).map((pay) => ({ ...pay }));
  const current = pays.at(-1);
  if (ctc === current.monthlyCtc) return `${employee.name} is already on ${ctc} a month`;
  if (sortableDate(effectiveDate) <= sortableDate(current.from)) {
    const since = pays.length > 1 ? "their last pay change" : "joining";
    return `Effective date must be after ${since} (${current.from})`;
  }

  // Below this monthly CTC, PF and ESIC always apply (as on Add Employee);
  // above it they stay as they were.
  const below = ctc < PF_ESIC_LIMIT;
  const pay = {
    monthlyCtc: ctc,
    pfApplicable: below || Boolean(current.pfApplicable),
    esicApplicable: below || Boolean(current.esicApplicable)
  };
  current.to = dayBefore(effectiveDate);
  pays.push({ ...pay, kind, from: effectiveDate, to: "", remark });

  employee.payHistory = pays;
  employee.set({ ...pay, yearlyCtc: ctc * 12 });
  employee.salary = salaryStructure({ ...employee.toObject(), ...pay });
  return "";
}

// POST /api/employees/:employeeId/salary-revision  Body { monthlyCtc,
// effectiveDate ("DD-MM-YYYY"), remark }. A raise (or cut) with no transfer.
async function reviseSalary(req, res) {
  const body = bodyOf(req);
  const [ctcText, effectiveDate, remark] = ["monthlyCtc", "effectiveDate", "remark"].map((key) =>
    String(body[key] ?? "").trim()
  );
  const { ctc, error } = parseCtc(ctcText);
  if (error) return res.status(400).json({ message: error });
  if (ctc == null) return res.status(400).json({ message: "New monthly CTC is required" });
  if (!isDate(effectiveDate)) {
    return res.status(400).json({ message: "Effective date must be a date like 01-08-2026" });
  }

  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  if (leftMessage(employee)) return res.status(400).json({ message: leftMessage(employee) });

  const problem = startPay(employee, { ctc, effectiveDate, kind: "revision", remark });
  if (problem) return res.status(400).json({ message: problem });
  await employee.save();
  res.json(employee.toObject());
}

// POST /api/employees/:employeeId/transfer  Body { state, city, effectiveDate
// ("DD-MM-YYYY"), remark }. Ends the current stay the day before, starts the
// new one, and works the salary split out again for the new state.
async function transferEmployee(req, res) {
  const body = bodyOf(req);
  const [state, city, effectiveDate, remark] = ["state", "city", "effectiveDate", "remark"].map((key) =>
    String(body[key] ?? "").trim()
  );
  if (!state) return res.status(400).json({ message: "New state is required" });
  if (!isDate(effectiveDate)) {
    return res.status(400).json({ message: "Effective date must be a date like 01-08-2026" });
  }

  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  if (leftMessage(employee)) return res.status(400).json({ message: leftMessage(employee) });

  const history = stateHistoryOf(employee.toObject()).map((stay) => ({ ...stay }));
  const current = history.at(-1);
  if (state.toLowerCase() === String(current.state).trim().toLowerCase()) {
    return res.status(400).json({ message: `${employee.name} already works in ${current.state}` });
  }
  if (sortableDate(effectiveDate) <= sortableDate(current.from)) {
    const since = history.length > 1 ? "their last transfer" : "joining";
    return res.status(400).json({ message: `Effective date must be after ${since} (${current.from})` });
  }

  current.to = dayBefore(effectiveDate);
  history.push({ state, city, from: effectiveDate, to: "", remark });

  employee.stateHistory = history;
  employee.state = state;
  employee.salary = salaryStructure({ ...employee.toObject(), state });
  await employee.save();
  res.json(employee.toObject());
}

// POST /api/employees/:employeeId/department-transfer  Body { department,
// subDepartment, designation, reportingManager, monthlyCtc, effectiveDate
// ("DD-MM-YYYY"), remark }. Ends the current department spell the day before
// and starts the new one; designation, reporting manager and monthly CTC stay
// as they were when left blank. A new CTC sets the yearly one to 12 times it
// and works the salary split out again.
async function transferDepartment(req, res) {
  const body = bodyOf(req);
  const [department, subDepartment, designation, reportingManager, ctcText, effectiveDate, remark] = [
    "department",
    "subDepartment",
    "designation",
    "reportingManager",
    "monthlyCtc",
    "effectiveDate",
    "remark"
  ].map((key) => String(body[key] ?? "").trim());
  if (!department) return res.status(400).json({ message: "New department is required" });
  if (!isDate(effectiveDate)) {
    return res.status(400).json({ message: "Effective date must be a date like 01-08-2026" });
  }
  const { ctc: newCtc, error } = parseCtc(ctcText);
  if (error) return res.status(400).json({ message: error });

  // Only the Department tab's departments and their own sub departments.
  const listed = await Department.findOne({ name: department }).lean();
  if (!listed) return res.status(400).json({ message: `Department "${department}" is not in the Department tab` });
  const subs = listed.subDepartments || [];
  if (subs.length && !subs.includes(subDepartment)) {
    return res.status(400).json({ message: `Pick a sub department of ${department}` });
  }
  if (!subs.length && subDepartment) {
    return res.status(400).json({ message: `${department} has no sub departments` });
  }

  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  if (leftMessage(employee)) return res.status(400).json({ message: leftMessage(employee) });

  const spells = departmentHistoryOf(employee.toObject()).map((spell) => ({ ...spell }));
  const current = spells.at(-1);
  if (department === current.department && subDepartment === (current.subDepartment || "")) {
    const where = [department, subDepartment].filter(Boolean).join(" · ");
    return res.status(400).json({ message: `${employee.name} already works in ${where}` });
  }
  if (sortableDate(effectiveDate) <= sortableDate(current.from)) {
    const since = spells.length > 1 ? "their last department transfer" : "joining";
    return res.status(400).json({ message: `Effective date must be after ${since} (${current.from})` });
  }

  // A new CTC (one that differs) starts a new pay on the same date.
  if (newCtc != null && newCtc !== employee.monthlyCtc) {
    const problem = startPay(employee, { ctc: newCtc, effectiveDate, kind: "department", remark });
    if (problem) return res.status(400).json({ message: problem });
  }

  // The spell being closed keeps its reporting manager (older spells were
  // saved without one).
  current.reportingManager ||= employee.reportingManager;
  const next = {
    department,
    subDepartment,
    designation: designation || employee.designation,
    reportingManager: reportingManager || employee.reportingManager
  };
  current.to = dayBefore(effectiveDate);
  spells.push({ ...next, from: effectiveDate, to: "", remark });

  employee.departmentHistory = spells;
  employee.set(next);
  await employee.save();
  res.json(employee.toObject());
}

const EXIT_TYPES = ["Resigned", "Terminated", "Retired", "Absconding", "Death", "Contract end"];
const NOTICE = ["Yes", "No", "Waived"];

// The state, department and pay histories of an employee, copied:
// [[field, history, label], ...], label naming the history in messages.
function historiesOf(employee) {
  const record = employee.toObject();
  return [
    ["stateHistory", stateHistoryOf(record), "their last transfer"],
    ["departmentHistory", departmentHistoryOf(record), "their last department transfer"],
    ["payHistory", payHistoryOf(record), "their last pay change"]
  ].map(([field, history, label]) => [field, history.map((entry) => ({ ...entry })), label]);
}

// POST /api/employees/:employeeId/exit  Body { exitType, resignationDate,
// lastWorkingDay ("DD-MM-YYYY"), reason, noticeServed, rehireEligible ("Yes" /
// "No"), remark }. Closes the state, department and pay histories on the last
// working day and records the exit; the record itself is kept.
async function exitEmployee(req, res) {
  const body = bodyOf(req);
  const [exitType, resignationDate, lastWorkingDay, reason, noticeServed, rehire, remark] = [
    "exitType",
    "resignationDate",
    "lastWorkingDay",
    "reason",
    "noticeServed",
    "rehireEligible",
    "remark"
  ].map((key) => String(body[key] ?? "").trim());
  if (!EXIT_TYPES.includes(exitType)) return res.status(400).json({ message: "Pick the exit type" });
  if (!isDate(lastWorkingDay)) {
    return res.status(400).json({ message: "Last working day must be a date like 31-10-2026" });
  }
  if (resignationDate && !isDate(resignationDate)) {
    return res.status(400).json({ message: "Resignation date must be a date like 01-10-2026" });
  }
  if (resignationDate && sortableDate(resignationDate) > sortableDate(lastWorkingDay)) {
    return res.status(400).json({ message: "Resignation date must be on or before the last working day" });
  }
  if (!reason) return res.status(400).json({ message: "Reason is required" });
  if (!NOTICE.includes(noticeServed)) return res.status(400).json({ message: "Pick whether notice was served" });
  if (!["Yes", "No"].includes(rehire)) return res.status(400).json({ message: "Pick whether they may be rehired" });

  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  const open = openExitOf(employee);
  if (open) return res.status(400).json({ message: `${employee.name} already left on ${open.lastWorkingDay}` });

  const histories = historiesOf(employee);
  for (const [, history, label] of histories) {
    const current = history.at(-1);
    if (sortableDate(lastWorkingDay) < sortableDate(current.from)) {
      const since = history.length > 1 ? label : "joining";
      return res.status(400).json({ message: `Last working day must be on or after ${since} (${current.from})` });
    }
    current.to = lastWorkingDay;
  }
  for (const [field, history] of histories) employee[field] = history;
  employee.exits = [
    ...employee.toObject().exits,
    {
      exitType,
      resignationDate,
      lastWorkingDay,
      reason,
      noticeServed,
      rehireEligible: rehire === "Yes",
      remark,
      rejoinDate: "",
      rejoinRemark: ""
    }
  ];
  await employee.save();
  res.json(employee.toObject());
}

// POST /api/employees/:employeeId/rejoin  Body { rejoinDate ("DD-MM-YYYY"),
// remark }. Opens the state, department and pay histories again from the
// rejoin date, on what they had when they left (a Transfer or Salary revision
// afterwards changes it). Same employee code, earlier history kept.
async function rejoinEmployee(req, res) {
  const body = bodyOf(req);
  const rejoinDate = String(body.rejoinDate ?? "").trim();
  const remark = String(body.remark ?? "").trim();
  if (!isDate(rejoinDate)) return res.status(400).json({ message: "Rejoin date must be a date like 01-12-2026" });

  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  const exits = employee.toObject().exits;
  const open = exits.at(-1);
  if (!open || open.rejoinDate) return res.status(400).json({ message: `${employee.name} has not left` });
  if (sortableDate(rejoinDate) <= sortableDate(open.lastWorkingDay)) {
    return res.status(400).json({ message: `Rejoin date must be after the last working day (${open.lastWorkingDay})` });
  }

  for (const [field, history] of historiesOf(employee)) {
    history.push({ ...history.at(-1), kind: "rejoin", from: rejoinDate, to: "", remark: remark || "Rejoined" });
    employee[field] = history;
  }
  Object.assign(open, { rejoinDate, rejoinRemark: remark });
  employee.exits = exits;
  await employee.save();
  res.json(employee.toObject());
}

// POST /api/employees/:employeeId/undo-exit  An exit entered by mistake:
// removed, and the histories it closed are open again.
async function undoExit(req, res) {
  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId });
  if (!employee) return res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
  const open = openExitOf(employee);
  if (!open) return res.status(400).json({ message: `${employee.name} has not left` });

  for (const [field, history] of historiesOf(employee)) {
    if (history.at(-1).to === open.lastWorkingDay) history.at(-1).to = "";
    employee[field] = history;
  }
  employee.exits = employee.toObject().exits.slice(0, -1);
  await employee.save();
  res.json(employee.toObject());
}

// GET /api/employees  Every hand-entered employee, newest first. Records saved
// before the split (or its Professional Tax) was kept get it worked out here.
// A user with a Daily Register department gets only that department's
// employees: same COSEC employee ID, or the same department name.
async function listEmployees(req, res) {
  let employees = await EmployeeProfile.find().sort({ createdAt: -1 }).lean();
  const scope = await registerScope(req);
  if (scope) {
    const ids = new Set(scope.ids);
    employees = employees.filter(
      (employee) => ids.has(String(employee.employeeId)) || sameDepartment(employee.department, scope.department)
    );
  }
  for (const employee of employees) {
    if (employee.salary?.professionalTax == null) employee.salary = salaryStructure(employee);
  }
  res.json(employees);
}

const createEmployeeHandler = asyncHandler(createEmployee);
const updateEmployeeHandler = asyncHandler(updateEmployee);
const listEmployeesHandler = asyncHandler(listEmployees);
const transferEmployeeHandler = asyncHandler(transferEmployee);
const transferDepartmentHandler = asyncHandler(transferDepartment);
const reviseSalaryHandler = asyncHandler(reviseSalary);
const exitEmployeeHandler = asyncHandler(exitEmployee);
const rejoinEmployeeHandler = asyncHandler(rejoinEmployee);
const undoExitHandler = asyncHandler(undoExit);

export {
  exitEmployeeHandler as exitEmployee,
  rejoinEmployeeHandler as rejoinEmployee,
  undoExitHandler as undoExit,
  createEmployeeHandler as createEmployee,
  transferEmployeeHandler as transferEmployee,
  transferDepartmentHandler as transferDepartment,
  reviseSalaryHandler as reviseSalary,
  updateEmployeeHandler as updateEmployee,
  listEmployeesHandler as listEmployees
};
