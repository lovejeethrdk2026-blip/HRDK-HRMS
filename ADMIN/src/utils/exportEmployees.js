import * as XLSX from "xlsx";
import { employeeOn, openExitOf, salaryOn, sortableDate, stateHistoryOf } from "@salary";
import { monthsWorked } from "../components/ChangeHistory";
import { statusOf } from "./employeeStatus";
import { HISTORY_SHEET, TRANSFER_SHEET, addSheet, historyRows, transferRows } from "./exportTransfers";

// Employees page > Download Excel: the employees the list shows (its Status
// and Department filters applied), one row each with every joining-sheet
// detail. The CTC and salary split columns only when the role may see salary.

const STATUS_LABELS = { active: "Active", leaving: "Leaving", left: "Inactive" };
const yesNo = (value) => (value == null ? "" : value ? "Yes" : "No");

// [heading, value of an employee, column width]; salary marks the CTC columns.
const COLUMNS = [
  ["Employee code", (e) => e.employeeId, 14],
  ["Initials No.", (e) => e.initialsNo, 12],
  ["Name", (e) => e.name, 24],
  ["Status", (e) => STATUS_LABELS[statusOf(e)], 10],
  ["Last working day", (e) => openExitOf(e)?.lastWorkingDay ?? "", 14],
  ["Designation", (e) => e.designation, 20],
  ["Role", (e) => e.employeeRole, 11],
  ["Department", (e) => e.department, 28],
  ["Sub department", (e) => e.subDepartment, 18],
  ["Reporting manager", (e) => e.reportingManager, 18],
  ["State", (e) => e.state, 14],
  ["Date of joining", (e) => e.joiningDate, 13],
  ["Salary type", (e) => e.salaryType, 11],
  ["Employment type", (e) => e.employmentType, 13],
  ["Confirmation date", (e) => e.confirmationDate, 13],
  ["Work location", (e) => e.workLocation, 16],
  ["Weekly off", (e) => e.weeklyOff, 11],
  ["UAN no.", (e) => e.uanNo, 14],
  ["ESIC no.", (e) => e.esicNo, 12],
  ["Monthly CTC", (e) => e.monthlyCtc ?? "", 12, "salary"],
  ["Yearly CTC", (e) => e.yearlyCtc ?? "", 12, "salary"],
  ["Basic", (e) => e.salary?.basic ?? "", 10, "salary"],
  ["HRA", (e) => e.salary?.hra ?? "", 10, "salary"],
  ["Special allowance", (e) => e.salary?.specialAllowance ?? "", 12, "salary"],
  ["Statutory bonus", (e) => e.salary?.statutoryBonus ?? "", 11, "salary"],
  ["PF employee", (e) => e.salary?.pfEmployee ?? "", 10, "salary"],
  ["ESIC employee", (e) => e.salary?.esicEmployee ?? "", 10, "salary"],
  ["Professional Tax", (e) => e.salary?.professionalTax ?? "", 10, "salary"],
  ["In hand", (e) => e.salary?.inHand ?? "", 11, "salary"],
  ["PF applicable", (e) => yesNo(e.pfApplicable), 10],
  ["ESIC applicable", (e) => yesNo(e.esicApplicable), 10],
  ["Other benefit", (e) => e.otherBenefits, 16],
  ["Mobile no.", (e) => e.mobile, 12],
  ["Aadhaar no.", (e) => e.aadhaarNo, 14],
  ["PAN no.", (e) => e.pan, 12],
  ["Other ID proof", (e) => e.otherId?.type, 14],
  ["Other ID no.", (e) => e.otherId?.number, 14],
  ["Emergency contact name", (e) => e.emergencyContact?.name, 20],
  ["Emergency contact no.", (e) => e.emergencyContact?.phone, 12],
  ["Emergency contact relation", (e) => e.emergencyContact?.relation, 12],
  ["Address", (e) => e.address?.line, 28],
  ["City", (e) => e.address?.city, 14],
  ["Address state", (e) => e.address?.state, 14],
  ["PIN code", (e) => e.address?.pin, 9],
  ["Country", (e) => e.address?.country, 10],
  ["Permanent address", (e) => e.permanentAddress?.line, 28],
  ["Permanent city", (e) => e.permanentAddress?.city, 14],
  ["Permanent state", (e) => e.permanentAddress?.state, 14],
  ["Permanent PIN", (e) => e.permanentAddress?.pin, 9],
  ["Permanent country", (e) => e.permanentAddress?.country, 10],
  ["Bank name", (e) => e.bank?.bankName, 20],
  ["Bank account no.", (e) => e.bank?.accountNo, 18],
  ["IFSC code", (e) => e.bank?.ifscCode, 13],
  ["Shift in", (e) => e.shift?.in, 8],
  ["Shift out", (e) => e.shift?.out, 8]
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const yesNoMaybe = (value) => (value == null ? "" : value ? "Yes" : "No");
const slug = (text) => String(text ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Employee page > Download Excel: one employee's whole file. Sheets: Details
// (every field, one per row), Payroll (every month on the rolls, in the
// state, department and CTC of that month), Changes (each transfer and salary
// revision with the pay before and after), History (every state, department
// and pay with from / to) and Exits. Salary sheets and pay rows only when the
// role may see salary.
export function exportEmployeeToExcel(employee, { seeSalary }) {
  const workbook = XLSX.utils.book_new();
  const columns = COLUMNS.filter(([, , , kind]) => seeSalary || kind !== "salary");
  addSheet(
    workbook,
    "Details",
    ["Field", "Value"],
    [26, 40],
    columns.map(([heading, value]) => ({ cells: [heading, value(employee) ?? ""] }))
  );

  if (seeSalary) {
    const payroll = monthsWorked(employee, Infinity).map(([year, month, day]) => {
      const s = salaryOn(employee, day);
      const gross = s.basic + s.hra + s.specialAllowance + s.statutoryBonus;
      return {
        cells: [
          `${MONTHS[month - 1]} ${year}`,
          s.state,
          [s.department, s.subDepartment].filter(Boolean).join(" · "),
          s.designation,
          s.monthlyCtc ?? "",
          s.basic,
          s.hra,
          s.specialAllowance,
          s.statutoryBonus,
          Math.round(gross * 100) / 100,
          s.pfEmployee,
          s.esicEmployee,
          s.professionalTax,
          s.inHand,
          s.pfEmployer,
          s.esicEmployer
        ]
      };
    });
    addSheet(
      workbook,
      "Payroll",
      [
        "Month",
        "State",
        "Department",
        "Designation",
        "Monthly CTC",
        "Basic",
        "HRA",
        "Special allowance",
        "Statutory bonus",
        "Gross",
        "PF employee",
        "ESIC employee",
        "Professional Tax",
        "In hand",
        "PF employer",
        "ESIC employer"
      ],
      [10, 14, 34, 20, 12, 10, 10, 12, 10, 11, 10, 10, 10, 11, 10, 10],
      payroll
    );
    const changes = transferRows([employee]);
    addSheet(
      workbook,
      "Changes",
      TRANSFER_SHEET.header,
      TRANSFER_SHEET.widths,
      changes.length ? changes : [{ cells: ["No transfer or salary revision yet"] }]
    );
  }

  // Without salary, the History sheet keeps the state and department rows.
  const history = historyRows([employee]).filter((row) => seeSalary || row.cells[2] !== "Salary");
  addSheet(workbook, "History", HISTORY_SHEET.header, HISTORY_SHEET.widths, history);

  const exits = (employee.exits || []).map((exit) => ({
    cells: [
      exit.exitType,
      exit.resignationDate,
      exit.lastWorkingDay,
      exit.reason,
      exit.noticeServed,
      yesNoMaybe(exit.rehireEligible),
      exit.remark,
      exit.rejoinDate,
      exit.rejoinRemark
    ]
  }));
  addSheet(
    workbook,
    "Exits",
    ["Exit type", "Resignation date", "Last working day", "Reason", "Notice served", "Rehire eligible", "Remark", "Rejoined on", "Rejoin remark"],
    [13, 15, 15, 30, 12, 13, 30, 12, 24],
    exits.length ? exits : [{ cells: ["Has not left"] }]
  );

  XLSX.writeFile(workbook, `employee-${slug(employee.employeeId)}-${slug(employee.name)}.xlsx`);
}

// "YYYY-MM-DD" of today, on this computer's clock.
function todayDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Days from one "YYYY-MM-DD" to another, both counted.
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

// Employee page > State-wise Excel: one file per state the employee has worked
// in (a single file when they never moved), each with their stays there from
// joining (or the transfer) to the transfer out, the last working day, or
// today, and, when the role may see salary, each month's pay worked out in that
// state. Returns how many files were downloaded.
export function exportEmployeeStatesToExcel(employee, { seeSalary }) {
  const today = todayDay();
  const stays = stateHistoryOf(employee).map((stay) => {
    const from = sortableDate(stay.from);
    const to = stay.to ? sortableDate(stay.to) : today;
    return { ...stay, days: from && to >= from ? daysBetween(from, to) : "", on: employeeOn(employee, stay.from) };
  });
  const states = [...new Set(stays.map((stay) => stay.state || "No state"))];
  const months = seeSalary ? monthsWorked(employee, Infinity) : [];

  states.forEach((state, i) => {
    const workbook = XLSX.utils.book_new();
    const here = stays.filter((stay) => (stay.state || "No state") === state);
    const rows = here.map((stay) => ({
      cells: [
        employee.employeeId,
        employee.name,
        stay.state,
        stay.city,
        stay.from,
        stay.to || "Present",
        stay.days,
        [stay.on.department, stay.on.subDepartment].filter(Boolean).join(" · "),
        stay.on.designation,
        stay.kind === "rejoin" ? "Rejoined" : stay.from === employee.joiningDate ? "Joining" : "Transfer in",
        stay.remark
      ]
    }));
    rows.push({ cells: ["", "", "", "", "", "Total days", here.reduce((sum, stay) => sum + (stay.days || 0), 0)] });
    addSheet(
      workbook,
      "Stays",
      ["Employee code", "Name", "State", "City", "From", "To", "Days", "Department", "Designation", "Started by", "Remark"],
      [14, 24, 14, 14, 12, 12, 8, 34, 20, 12, 30],
      rows
    );

    if (seeSalary) {
      const payroll = months
        .map(([year, month, day]) => [year, month, salaryOn(employee, day)])
        .filter(([, , s]) => (s.state || "No state") === state)
        .map(([year, month, s]) => ({
          cells: [
            `${MONTHS[month - 1]} ${year}`,
            [s.department, s.subDepartment].filter(Boolean).join(" · "),
            s.monthlyCtc ?? "",
            s.basic,
            s.hra,
            s.specialAllowance,
            s.statutoryBonus,
            Math.round((s.basic + s.hra + s.specialAllowance + s.statutoryBonus) * 100) / 100,
            s.pfEmployee,
            s.esicEmployee,
            s.professionalTax,
            s.inHand
          ]
        }));
      addSheet(
        workbook,
        "Payroll",
        ["Month", "Department", "Monthly CTC", "Basic", "HRA", "Special allowance", "Statutory bonus", "Gross", "PF employee", "ESIC employee", "Professional Tax", "In hand"],
        [10, 34, 12, 10, 10, 12, 10, 11, 10, 10, 10, 11],
        payroll.length ? payroll : [{ cells: ["No full month's pay in this state yet"] }]
      );
    }

    // Spaced out: browsers drop several downloads started at the same moment.
    setTimeout(
      () => XLSX.writeFile(workbook, `employee-${slug(employee.employeeId)}-${slug(employee.name)}-${slug(state)}.xlsx`),
      i * 600
    );
  });
  return states.length;
}

// Downloads the Employees sheet. label ("Active", "All · CASTING DEPARTMENT")
// names what was filtered, in the file name.
export function exportEmployeesToExcel(employees, { seeSalary, label }) {
  const columns = COLUMNS.filter(([, , , kind]) => seeSalary || kind !== "salary");
  const rows = employees.map((employee) => columns.map(([, value]) => value(employee) ?? ""));
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(([heading]) => heading), ...rows]);
  sheet["!cols"] = columns.map(([, , wch]) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Employees");
  const name = label.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  XLSX.writeFile(workbook, `employees-${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
