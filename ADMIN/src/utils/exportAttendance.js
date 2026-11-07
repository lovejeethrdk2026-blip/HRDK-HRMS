import * as XLSX from "xlsx";
import {
  FULL_DAY_HOURS,
  punchCount,
  lunchText,
  lunchRange,
  totalWorkingText,
  vsFullDayText
} from "./attendanceStats";

const PAIR_KEY = /^pair(\d+)$/;

function pairNumbers(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .map((key) => Number(key.match(PAIR_KEY)[1]))
    .sort((a, b) => a - b);
}

// Builds the same rows/columns AttendanceTable renders (Employee ID, Name,
// Date, then IN/OUT per pair) and downloads them as an .xlsx file.
// register: the Daily Register's slim layout -- Employee ID, Name, Department, Section,
// Date, Total Punches, Lunch Break, Total Working, vs 8 Hours and the IN/OUT
// pairs only.
export function exportAttendanceToExcel(records, filename = "attendance", { register = false } = {}) {
  if (!records.length) return;

  const maxPairs = Math.max(...records.map((doc) => Math.max(0, ...pairNumbers(doc))));
  const pairCols = Array.from({ length: maxPairs }, (_, i) => i + 1);

  if (register) {
    const withStatus = records.some((doc) => doc.status);
    const header = [
      "Employee ID",
      "Name",
      "Department",
      "Section",
      "Shift",
      ...(withStatus ? ["Status"] : []),
      "Date",
      "Total Punches",
      "Lunch (13:00-15:00)",
      "Lunch Break",
      "Total Working",
      `vs ${FULL_DAY_HOURS} Hours`
    ];
    pairCols.forEach((n) => header.push(`Pair ${n} IN`, `Pair ${n} OUT`));
    const rows = records.map((doc) => {
      const row = [
        doc.ID,
        doc.NAME,
        doc.department || "",
        doc.subDepartment || "",
        doc.nightShift ? "Night" : "",
        ...(withStatus ? [doc.status || ""] : []),
        doc.Date,
        punchCount(doc),
        lunchRange(doc),
        lunchText(doc),
        totalWorkingText(doc),
        vsFullDayText(doc)
      ];
      pairCols.forEach((n) => {
        const pair = doc[`pair${n}`];
        row.push(pair?.IN || "", pair?.OUT || "");
      });
      return row;
    });
    writeSheet(header, rows, filename);
    return;
  }

  const header = ["Employee ID", "Name", "Date", "Lunch (13:00-15:00)", "Total Working", "Punches"];
  pairCols.forEach((n) => header.push(`Pair ${n} IN`, `Pair ${n} OUT`));

  const rows = records.map((doc) => {
    const row = [doc.ID, doc.NAME, doc.Date, lunchText(doc), totalWorkingText(doc), punchCount(doc)];
    pairCols.forEach((n) => {
      const pair = doc[`pair${n}`];
      row.push(pair?.IN || "", pair?.OUT || "");
    });
    return row;
  });

  // Action column (P / A / H/D) as the last column.
  header.push("Action");
  rows.forEach((row, i) => row.push(records[i].mark || ""));

  writeSheet(header, rows, filename);
}

function writeSheet(header, rows, filename) {
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = header.map((_, i) => ({ wch: i < 2 ? 20 : i === 3 ? 20 : 12 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}-${date}.xlsx`);
}
