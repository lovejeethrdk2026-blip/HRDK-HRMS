import * as XLSX from "xlsx";
import { departmentHistoryOf, payHistoryOf, salaryOn, sortableDate, stateHistoryOf } from "@salary";

// Employees page > Download transfer report, read from each employee's
// stateHistory, departmentHistory and payHistory: a Transfers sheet (every
// entry after the first, one row each, oldest first; pay only for Salary
// revisions, a department transfer's new CTC is on its own row) and a History
// sheet (every entry).

const place = (...parts) => parts.filter(Boolean).join(" · ");
const perMonth = (ctc) => (ctc == null ? "" : `${ctc} a month`);
const yesNo = (value) => (value ? "Yes" : "No");

// [CTC before, CTC after, in hand before, in hand after] around a change:
// the day before it (was.to) and its effective date (now.from).
function payCells(employee, was, now) {
  const before = salaryOn(employee, was.to);
  const after = salaryOn(employee, now.from);
  return [before.monthlyCtc ?? "", after.monthlyCtc ?? "", before.inHand, after.inHand];
}

// One row per transfer: [code, name, type, from, to, effective date,
// designation, CTC and in hand before and after, remark] plus its
// "YYYY-MM-DD" date for sorting.
export function transferRows(employees) {
  const rows = [];
  for (const employee of employees) {
    const who = [employee.employeeId, employee.name];
    // A rejoin reopens the histories; it is no transfer.
    stateHistoryOf(employee).forEach((stay, i, history) => {
      if (i === 0 || stay.kind === "rejoin") return;
      const before = history[i - 1];
      rows.push({
        date: sortableDate(stay.from),
        cells: [
          ...who,
          "State",
          place(before.state, before.city),
          place(stay.state, stay.city),
          stay.from,
          "",
          ...payCells(employee, before, stay),
          stay.remark
        ]
      });
    });
    departmentHistoryOf(employee).forEach((spell, i, history) => {
      if (i === 0 || spell.kind === "rejoin") return;
      const before = history[i - 1];
      const designation =
        before.designation && before.designation !== spell.designation
          ? `${before.designation} → ${spell.designation}`
          : spell.designation;
      rows.push({
        date: sortableDate(spell.from),
        cells: [
          ...who,
          "Department",
          place(before.department, before.subDepartment),
          place(spell.department, spell.subDepartment),
          spell.from,
          designation,
          ...payCells(employee, before, spell),
          spell.remark
        ]
      });
    });
    payHistoryOf(employee).forEach((pay, i, history) => {
      if (i === 0 || pay.kind !== "revision") return;
      const before = history[i - 1];
      rows.push({
        date: sortableDate(pay.from),
        cells: [
          ...who,
          "Salary",
          perMonth(before.monthlyCtc),
          perMonth(pay.monthlyCtc),
          pay.from,
          "",
          ...payCells(employee, before, pay),
          pay.remark
        ]
      });
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.cells[0]).localeCompare(String(b.cells[0])));
}

// The History sheet: every state, department and pay each employee has had,
// the one from joining included, as [code, name, type, state / department /
// CTC, city / sub department / PF and ESIC, designation, from, to, remark]
// plus its "YYYY-MM-DD" from for sorting.
export function historyRows(employees) {
  const rows = [];
  for (const employee of employees) {
    const who = [employee.employeeId, employee.name];
    const period = (entry) => ({ from: sortableDate(entry.from) });
    for (const stay of stateHistoryOf(employee)) {
      rows.push({
        ...period(stay),
        cells: [...who, "State", stay.state, stay.city, "", stay.from, stay.to || "Present", stay.remark]
      });
    }
    for (const spell of departmentHistoryOf(employee)) {
      rows.push({
        ...period(spell),
        cells: [
          ...who,
          "Department",
          spell.department,
          spell.subDepartment,
          spell.designation,
          spell.from,
          spell.to || "Present",
          spell.remark
        ]
      });
    }
    for (const pay of payHistoryOf(employee)) {
      rows.push({
        ...period(pay),
        cells: [
          ...who,
          "Salary",
          perMonth(pay.monthlyCtc),
          `PF ${yesNo(pay.pfApplicable)} · ESIC ${yesNo(pay.esicApplicable)}`,
          "",
          pay.from,
          pay.to || "Present",
          pay.remark
        ]
      });
    }
  }
  // Employee by employee: states, then salary, then departments, each oldest
  // first.
  return rows.sort(
    (a, b) =>
      String(a.cells[1]).localeCompare(String(b.cells[1])) ||
      String(a.cells[0]).localeCompare(String(b.cells[0])) ||
      b.cells[2].localeCompare(a.cells[2]) ||
      a.from.localeCompare(b.from)
  );
}

// The two sheets' headings and column widths, shared with one employee's
// download (exportEmployees.js).
export const TRANSFER_SHEET = {
  header: [
    "Employee code",
    "Name",
    "Transfer",
    "From",
    "To",
    "Effective date",
    "Designation",
    "Monthly CTC before",
    "Monthly CTC after",
    "In hand before",
    "In hand after",
    "Remark"
  ],
  widths: [12, 22, 12, 30, 30, 14, 22, 14, 14, 14, 14, 30]
};
export const HISTORY_SHEET = {
  header: ["Employee code", "Name", "Type", "State / Department / CTC", "City / Sub department / PF, ESIC", "Designation", "From", "To", "Remark"],
  widths: [12, 22, 12, 24, 22, 20, 12, 12, 30]
};

export function addSheet(workbook, name, header, widths, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows.map((row) => row.cells)]);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

// Downloads both sheets for every employee. Returns how many rows each got.
export function exportTransfersToExcel(employees) {
  const transfers = transferRows(employees);
  const history = historyRows(employees);
  const counts = { transfers: transfers.length, history: history.length };
  if (!history.length) return counts;

  const workbook = XLSX.utils.book_new();
  addSheet(workbook, "Transfers", TRANSFER_SHEET.header, TRANSFER_SHEET.widths, transfers);
  addSheet(workbook, "History", HISTORY_SHEET.header, HISTORY_SHEET.widths, history);

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `transfer-report-${date}.xlsx`);
  return counts;
}
