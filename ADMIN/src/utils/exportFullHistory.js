import api from "../api/axios";
import { XLSX, loadXlsx } from "./xlsx";
import { departmentHistoryOf, payHistoryOf, payVersionIds, resolvePayVersion, salaryOn, sortableDate, stateHistoryOf } from "@salary";
import { monthsWorked } from "../components/ChangeHistory";
import { statusOf } from "./employeeStatus";

// Employee page > Full history: ONE Excel sheet, one row per month on the
// rolls (joining month first). Every row carries every personal detail (name,
// family, IDs, bank, address, nominees), that month's state, department,
// designation and CTC with the worked-out split, what Pay Sheet 1 (BC365)
// actually paid that month, and what changed in that month (transfer, salary
// revision, exit, rejoin), each kind in its own column. Salary columns only
// when the role may see salary.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_LABELS = { active: "Active", leaving: "Leaving", left: "Inactive" };
const yesNo = (value) => (value == null ? "" : value ? "Yes" : "No");
const join = (...parts) => parts.filter(Boolean).join(", ");
const slug = (text) => String(text ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = (n) => (n == null || n === "" ? "" : Math.round(Number(n) * 100) / 100);
const monthKey = (date) => sortableDate(date).slice(0, 7); // "DD-MM-YYYY" -> "YYYY-MM"

// Names of family members of one relation ("Father", "Mother", ...).
const family = (e, relation) =>
  (e.family || [])
    .filter((m) => m.relation === relation)
    .map((m) => m.name)
    .join(", ");

const nominees = (e) =>
  (e.pfNominees || [])
    .map((n) => `${n.name} (${n.relation}${n.pfShare ? `, ${n.pfShare}%` : ""})`)
    .join("; ");

// Same on every row: [heading, value of the employee, width].
const PERSON = [
  ["Employee code", (e) => e.employeeId, 13],
  ["Initials No. (Matrix ID)", (e) => e.initialsNo, 12],
  ["Name", (e) => e.name, 24],
  ["Salutation", (e) => e.salutation, 9],
  ["Gender", (e) => e.gender, 8],
  ["Father", (e) => family(e, "Father"), 20],
  ["Mother", (e) => family(e, "Mother"), 20],
  ["Spouse", (e) => family(e, "Spouse"), 20],
  ["Children", (e) => family(e, "Child"), 24],
  ["Status today", (e) => STATUS_LABELS[statusOf(e)], 10],
  ["Date of joining", (e) => e.joiningDate, 12],
  ["Employee role", (e) => e.employeeRole, 10],
  ["Salary type", (e) => e.salaryType, 10],
  ["Employment type", (e) => e.employmentType, 12],
  ["Confirmation date", (e) => e.confirmationDate, 12],
  ["Work location", (e) => e.workLocation, 14],
  ["Weekly off", (e) => e.weeklyOff, 10],
  ["Shift", (e) => [e.shift?.in, e.shift?.out].filter(Boolean).join(" - "), 11],
  ["Mobile", (e) => e.mobile, 12],
  ["Aadhaar", (e) => e.aadhaarNo, 14],
  ["PAN", (e) => e.pan, 12],
  ["Other ID", (e) => join(e.otherId?.type, e.otherId?.number), 18],
  ["UAN (PF)", (e) => e.uanNo, 14],
  ["ESIC no.", (e) => e.esicNo, 12],
  ["PF nominees", nominees, 30],
  ["Emergency contact", (e) => join(e.emergencyContact?.name, e.emergencyContact?.relation, e.emergencyContact?.phone), 26],
  ["Bank", (e) => e.bank?.bankName, 18],
  ["Account no.", (e) => e.bank?.accountNo, 18],
  ["IFSC", (e) => e.bank?.ifscCode, 12],
  ["Address", (e) => join(e.address?.line, e.address?.city, e.address?.district, e.address?.state, e.address?.pin), 40],
  [
    "Permanent address",
    (e) =>
      join(
        e.permanentAddress?.line,
        e.permanentAddress?.city,
        e.permanentAddress?.district,
        e.permanentAddress?.state,
        e.permanentAddress?.pin
      ),
    40
  ]
];

const inr = (n) => (n == null || n === "" ? "-" : `Rs ${Math.round(Number(n)).toLocaleString("en-IN")}`);
const EMPTY = () => ({ joined: [], state: [], department: [], salary: [], exit: [], description: [] });

// What changed in each month, by kind, plus one plain line per change for the
// Description column ("Salary increased Rs 20,000 -> Rs 25,000 (+25%) from 01-11-2026"):
// { "YYYY-MM": { joined: [], state: [], department: [], salary: [], oldCtc, newCtc, exit: [], description: [] } }
function changesByMonth(employee, seeSalary) {
  const changes = {};
  const at = (date) => (changes[monthKey(date)] ??= EMPTY());
  const note = (remark) => (remark ? ` - ${remark}` : "");
  const versions = payVersionIds().length > 1; // say the version once there is more than one
  if (employee.joiningDate) {
    at(employee.joiningDate).joined.push(`Joined (${employee.joiningDate})`);
    const s = salaryOn(employee, employee.joiningDate);
    const where = [s.department, s.designation && `as ${s.designation}`].filter(Boolean).join(" ");
    const ctc = seeSalary && s.monthlyCtc ? ` at ${inr(s.monthlyCtc)} a month` : "";
    const version = seeSalary && versions ? ` (pay version v${resolvePayVersion(payHistoryOf(employee)[0]?.payVersion)})` : "";
    at(employee.joiningDate).description.push(`Joined on ${employee.joiningDate}${where ? ` in ${where}` : ""}${ctc}${version}`);
  }

  const stays = stateHistoryOf(employee);
  stays.forEach((stay, i) => {
    if (!i || stay.kind === "rejoin" || !stay.from) return;
    const before = stays[i - 1];
    at(stay.from).state.push(
      `${join(before.state, before.city)} -> ${join(stay.state, stay.city)} (${stay.from})${note(stay.remark)}`
    );
    at(stay.from).description.push(
      `Location changed ${join(before.state, before.city) || "-"} -> ${join(stay.state, stay.city) || "-"} from ${stay.from}${note(stay.remark)}`
    );
  });

  const spells = departmentHistoryOf(employee);
  spells.forEach((spell, i) => {
    if (!i || spell.kind === "rejoin" || !spell.from) return;
    const before = spells[i - 1];
    const place = (x) => [x.department, x.subDepartment].filter(Boolean).join(" · ");
    const parts = [];
    if (place(before) !== place(spell)) parts.push(`${place(before)} -> ${place(spell)}`);
    if (before.designation !== spell.designation) parts.push(`Designation ${before.designation || "-"} -> ${spell.designation || "-"}`);
    if (before.reportingManager !== spell.reportingManager)
      parts.push(`Manager ${before.reportingManager || "-"} -> ${spell.reportingManager || "-"}`);
    at(spell.from).department.push(`${parts.join(", ") || "Transfer"} (${spell.from})${note(spell.remark)}`);
    const said = [];
    if (place(before) !== place(spell)) said.push(`Department changed ${place(before) || "-"} -> ${place(spell) || "-"}`);
    if (before.designation !== spell.designation) said.push(`designation ${before.designation || "-"} -> ${spell.designation || "-"}`);
    if (before.reportingManager !== spell.reportingManager) said.push(`manager ${before.reportingManager || "-"} -> ${spell.reportingManager || "-"}`);
    const line = said.join(", ") || "Transferred";
    at(spell.from).description.push(`${line[0].toUpperCase()}${line.slice(1)} from ${spell.from}${note(spell.remark)}`);
  });

  const pays = payHistoryOf(employee);
  pays.forEach((pay, i) => {
    if (!i || pay.kind === "rejoin" || !pay.from) return;
    const before = pays[i - 1];
    const parts = [];
    if (before.monthlyCtc !== pay.monthlyCtc) parts.push(`CTC ${before.monthlyCtc ?? "-"} -> ${pay.monthlyCtc ?? "-"}`);
    if (before.pfApplicable !== pay.pfApplicable) parts.push(`PF ${yesNo(before.pfApplicable) || "-"} -> ${yesNo(pay.pfApplicable) || "-"}`);
    if (before.esicApplicable !== pay.esicApplicable)
      parts.push(`ESIC ${yesNo(before.esicApplicable) || "-"} -> ${yesNo(pay.esicApplicable) || "-"}`);
    const oldVersion = resolvePayVersion(before.payVersion);
    const newVersion = resolvePayVersion(pay.payVersion);
    if (oldVersion !== newVersion) parts.push(`Pay version v${oldVersion} -> v${newVersion}`);
    if (!parts.length) return;
    const month = at(pay.from);
    if (seeSalary) {
      const said = [];
      if (before.monthlyCtc !== pay.monthlyCtc) {
        const rise = (pay.monthlyCtc || 0) - (before.monthlyCtc || 0);
        const pct = before.monthlyCtc ? ` (${rise >= 0 ? "+" : ""}${Math.round((rise / before.monthlyCtc) * 1000) / 10}%)` : "";
        said.push(`Salary ${rise >= 0 ? "increased" : "reduced"} ${inr(before.monthlyCtc)} -> ${inr(pay.monthlyCtc)}${pct}`);
      }
      if (before.pfApplicable !== pay.pfApplicable) said.push(`PF ${pay.pfApplicable ? "started" : "stopped"}`);
      if (before.esicApplicable !== pay.esicApplicable) said.push(`ESIC ${pay.esicApplicable ? "started" : "stopped"}`);
      if (oldVersion !== newVersion) said.push(`pay version v${oldVersion} -> v${newVersion}`);
      const line = said.join(", ");
      const by = pay.kind === "department" ? " (with department change)" : "";
      month.description.push(`${line[0].toUpperCase()}${line.slice(1)} from ${pay.from}${by}${note(pay.remark)}`);
    }
    const by = pay.kind === "department" ? "with department transfer" : "salary revision";
    month.salary.push(`${parts.join(", ")} (${by}, ${pay.from})${note(pay.remark)}`);
    if (before.monthlyCtc !== pay.monthlyCtc) {
      month.oldCtc ??= before.monthlyCtc; // first CTC of the month, if it changed twice
      month.newCtc = pay.monthlyCtc;
    }
  });

  for (const exit of employee.exits || []) {
    if (exit.lastWorkingDay) {
      const line = `${exit.exitType || "Left"}, last working day ${exit.lastWorkingDay}${note(exit.reason)}`;
      at(exit.lastWorkingDay).exit.push(line);
      at(exit.lastWorkingDay).description.push(line);
    }
    if (exit.rejoinDate) {
      at(exit.rejoinDate).joined.push(`Rejoined (${exit.rejoinDate})${note(exit.rejoinRemark)}`);
      at(exit.rejoinDate).description.push(`Rejoined on ${exit.rejoinDate}${note(exit.rejoinRemark)}`);
    }
  }
  return changes;
}

// Pay Sheet 1 amounts per month: { "YYYY-MM": { totalEarnings, ... } }.
// Asked 24 months at a time (the server's limit). Throws when it cannot read.
async function paySheetMonths(employee, keys) {
  const byMonth = {};
  for (let i = 0; i < keys.length; i += 24) {
    const { data } = await api.get(`/paysheets/employee/${encodeURIComponent(employee.employeeId)}`, {
      params: { months: keys.slice(i, i + 24).join(",") }
    });
    for (const row of data.months) byMonth[row.month] = row;
  }
  return byMonth;
}

// Downloads the sheet. Returns { months, paySheetError } (error text, or "").
export async function exportEmployeeFullHistory(employee, { seeSalary }) {
  await loadXlsx();
  const months = monthsWorked(employee, Infinity); // [[year, month, day]], oldest first
  const keys = months.map(([y, m]) => `${y}-${String(m).padStart(2, "0")}`);
  const changes = changesByMonth(employee, seeSalary);

  let pay = {};
  let paySheetError = "";
  if (seeSalary && keys.length) {
    try {
      pay = await paySheetMonths(employee, keys);
    } catch (err) {
      paySheetError = err.response?.data?.message || err.message;
    }
  }

  const header = [
    "Month",
    "Description",
    ...PERSON.map(([h]) => h),
    "State",
    "City",
    "Department",
    "Sub department",
    "Designation",
    "Reporting manager",
    "PF applicable",
    "ESIC applicable"
  ];
  const widths = [10, 60, ...PERSON.map(([, , w]) => w), 13, 12, 28, 16, 18, 18, 9, 9];
  if (seeSalary) {
    header.push(
      "Monthly CTC",
      "Basic",
      "HRA",
      "Special allowance",
      "Statutory bonus",
      "Gross (worked out)",
      "PF employee",
      "ESIC employee",
      "PT",
      "In hand (worked out)",
      "PF employer",
      "ESIC employer",
      "Pay Sheet: type",
      "Pay Sheet: gross paid",
      "Pay Sheet: PF",
      "Pay Sheet: ESIC",
      "Pay Sheet: PT",
      "Pay Sheet: TDS",
      "Pay Sheet: deductions",
      "Pay Sheet: net paid"
    );
    widths.push(11, 10, 10, 11, 10, 11, 10, 10, 8, 11, 10, 10, 11, 11, 10, 10, 9, 9, 11, 11);
  }
  header.push("Joined / Rejoined", "State change", "Department change");
  widths.push(22, 36, 44);
  if (seeSalary) {
    header.push("Salary change", "Old CTC", "New CTC", "Increase", "Increase %");
    widths.push(44, 10, 10, 10, 9);
  }
  header.push("Exit");
  widths.push(36);

  const person = PERSON.map(([, value]) => value(employee) ?? "");
  const rows = months.map(([year, month, day], i) => {
    const s = salaryOn(employee, day);
    const c = changes[keys[i]] || EMPTY();
    const row = [
      `${MONTHS[month - 1]} ${year}`,
      c.description.join(". "),
      ...person,
      s.state,
      s.city,
      s.department,
      s.subDepartment,
      s.designation,
      s.reportingManager,
      yesNo(s.pfApplicable),
      yesNo(s.esicApplicable)
    ];
    if (seeSalary) {
      const paid = pay[keys[i]];
      row.push(
        money(s.monthlyCtc),
        money(s.basic),
        money(s.hra),
        money(s.specialAllowance),
        money(s.statutoryBonus),
        money(s.basic + s.hra + s.specialAllowance + s.statutoryBonus),
        money(s.pfEmployee),
        money(s.esicEmployee),
        money(s.professionalTax),
        money(s.inHand),
        money(s.pfEmployer),
        money(s.esicEmployer),
        paid ? paid.salaryTypes.join(" + ") : paySheetError ? "Could not read" : "Not in Pay Sheet",
        money(paid?.totalEarnings),
        money(paid?.pfEmployee),
        money(paid?.esiEmployee),
        money(paid?.professionalTax),
        money(paid?.tdsOnSalary),
        money(paid?.totalDeductions),
        money(paid?.netAmount)
      );
    }
    row.push(c.joined.join("; "), c.state.join("; "), c.department.join("; "));
    if (seeSalary) {
      const rise = c.oldCtc != null && c.newCtc != null ? c.newCtc - c.oldCtc : "";
      row.push(
        c.salary.join("; "),
        money(c.oldCtc),
        money(c.newCtc),
        money(rise),
        rise !== "" && c.oldCtc ? Math.round((rise / c.oldCtc) * 10000) / 100 : ""
      );
    }
    row.push(c.exit.join("; "));
    return row;
  });

  if (!rows.length) rows.push(["No date of joining, so no months to show"]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Full history");
  XLSX.writeFile(workbook, `employee-${slug(employee.employeeId)}-${slug(employee.name)}-full-history.xlsx`);
  return { months: months.length, paySheetError };
}
