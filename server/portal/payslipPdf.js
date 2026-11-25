import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { payVersionIds } from "../utils/salaryFormulas.js";

// Salary slip PDF for the employee app, laid out like the BC365 pay slip:
// company header, employee details, Earnings | Deductions, gross / net and net
// pay in words. The money is the full monthly salary from Joining & pay
// (portal/monthPay.js, the employee's pay version); the details from the
// employee's profile. No days or tax working on this slip.

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "hrdk-logo.png");
const COMPANY = "HRDK JEWEL CRAFT LIMITED";
const ADDRESS = "E-229, MARUDHAR INDUSTRIAL AREA, BASNI 2ND PHASE, Jodhpur Marudhar Ind Area,";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const money = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 12345.5 -> "Twelve Thousand Three Hundred Forty Five and Fifty Paise"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const under100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const under1000 = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", under100(n % 100)].filter(Boolean).join(" ");
function indianWords(n) {
  if (!n) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}
export function rupeesInWords(amount) {
  const value = Math.round(Math.abs(Number(amount) || 0) * 100);
  const rupees = Math.floor(value / 100);
  const paise = value % 100;
  return `Rupees ${indianWords(rupees)}${paise ? ` and ${under100(paise)} Paise` : ""} Only`;
}

// "15-04-2017" -> "15-Apr-2017"
const showDate = (text) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(text || ""));
  return m ? `${m[1]}-${SHORT[Number(m[2]) - 1]}-${m[3]}` : String(text || "");
};

// slip: { month: "2026-06", earnings: [{label, amount}], deductions, totalEarnings, totalDeductions, net }
// employee: the HRMS EmployeeProfile (lean)
export async function buildPayslipPdf(slip, employee) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape, like the BC365 slip
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const line = rgb(0.15, 0.15, 0.15);
  const shade = rgb(0.88, 0.88, 0.88);
  const W = 842;
  const L = 24;
  const R = W - 24;
  const clean = (t) => String(t ?? "").replace(/[^\x20-\x7E]/g, "");
  const text = (t, x, y, size = 9, f = font) => page.drawText(clean(t), { x, y, size, font: f, color: rgb(0, 0, 0) });
  const textRight = (t, xRight, y, size = 9, f = font) => text(t, xRight - f.widthOfTextAtSize(clean(t), size), y, size, f);
  const textCenter = (t, y, size, f = bold) => text(t, (W - f.widthOfTextAtSize(clean(t), size)) / 2, y, size, f);
  const box = (x, y, w, h, fill) => page.drawRectangle({ x, y, width: w, height: h, borderColor: line, borderWidth: 0.6, ...(fill && { color: fill }) });

  // Header
  try {
    const logo = await doc.embedPng(await fs.readFile(LOGO));
    const h = 42;
    page.drawImage(logo, { x: L, y: 595 - 24 - h, width: (logo.width / logo.height) * h, height: h });
  } catch {
    /* no logo file: header text only */
  }
  const [y4, m2] = slip.month.split("-");
  textCenter(COMPANY, 555, 13);
  textCenter(ADDRESS, 538, 8);
  textCenter(`Pay slip for the month of ${MONTHS[Number(m2) - 1]} - ${y4}`, 518, 10);

  // Employee details: label | value | label | value
  const daysInMonth = new Date(Date.UTC(Number(y4), Number(m2), 0)).getUTCDate();
  const details = [
    ["Employee Code", employee?.employeeId, "Employee Name", employee?.name],
    ["Location", employee?.state, "Date Of Joining", showDate(employee?.joiningDate)],
    ["Department", employee?.department, "Designation", employee?.designation],
    ["PAN No.", employee?.pan, "UAN Number", employee?.uanNo],
    ["ESIC Number", employee?.esicNo, "Bank Name", employee?.bank?.bankName],
    ["Bank Account No.", employee?.bank?.accountNo, "Total Days In Month", String(daysInMonth)]
  ];
  // Pay version only once there is more than one (until v0.2 everyone is on v0.1).
  const version = payVersionIds().length > 1 && slip.payVersion ? `v${slip.payVersion}` : "";
  if (slip.monthlyCtc) details.push(["Monthly CTC", money(slip.monthlyCtc), version ? "Pay version" : "", version]);
  // Days, when a payslip carries them.
  const d = slip.days;
  if (d) {
    const n = (v) => String(Math.round((Number(v) || 0) * 100) / 100);
    details.push(
      ["Days Paid", n(d.paidDays), "Present Days", n(d.present + (d.halfDays || 0) / 2)],
      ["Absent (no pay)", n(d.absent), "Weekly Off / Holidays", `${n(d.weeklyOffs)} / ${n(d.holidays)}`],
      ["Leave (paid)", n(d.leaveDays), "Pay version", slip.payVersion ? `v${slip.payVersion}` : ""]
    );
  }
  const colW = (R - L) / 4;
  const rowH = 17;
  let y = 505;
  for (const row of details) {
    y -= rowH;
    row.forEach((cell, i) => {
      box(L + i * colW, y, colW, rowH, i % 2 === 0 ? shade : null);
      text(cell || "", L + i * colW + 5, y + 5, 9, i % 2 === 0 ? font : bold);
    });
  }

  // Earnings | Amount || Deductions | Amount
  y -= 12;
  const half = (R - L) / 2;
  const nameW = half * 0.65;
  const amtW = half - nameW;
  const cols = [
    [L, nameW, "Earnings"],
    [L + nameW, amtW, "Amount"],
    [L + half, nameW, "Deductions"],
    [L + half + nameW, amtW, "Amount"]
  ];
  y -= rowH;
  for (const [x, w, head] of cols) {
    box(x, y, w, rowH, shade);
    text(head, x + (w - bold.widthOfTextAtSize(head, 9)) / 2, y + 5, 9, bold);
  }
  const earnings = slip.earnings || [];
  const deductions = slip.deductions || [];
  const lines = Math.max(earnings.length, deductions.length, 6);
  for (let i = 0; i < lines; i++) {
    y -= rowH;
    for (const [x, w] of cols) box(x, y, w, rowH);
    const e = earnings[i];
    const d = deductions[i];
    if (e) {
      text(e.label, cols[0][0] + 5, y + 5);
      textRight(money(e.amount), cols[1][0] + cols[1][1] - 5, y + 5);
    }
    if (d) {
      text(d.label, cols[2][0] + 5, y + 5);
      textRight(money(d.amount), cols[3][0] + cols[3][1] - 5, y + 5);
    }
  }
  // Totals
  y -= rowH;
  for (const [x, w] of cols) box(x, y, w, rowH, shade);
  text("Gross Salary", cols[0][0] + 5, y + 5, 9, bold);
  textRight(money(slip.totalEarnings), cols[1][0] + cols[1][1] - 5, y + 5, 9, bold);
  text("Gross Deduction", cols[2][0] + 5, y + 5, 9, bold);
  textRight(money(slip.totalDeductions), cols[3][0] + cols[3][1] - 5, y + 5, 9, bold);
  y -= rowH;
  box(cols[0][0], y, nameW, rowH, shade);
  box(cols[1][0], y, amtW, rowH, shade);
  box(L + half, y, half, rowH);
  text("Net Salary", cols[0][0] + 5, y + 5, 9, bold);
  textRight(money(slip.net), cols[1][0] + cols[1][1] - 5, y + 5, 9, bold);

  // Net pay in figures and words
  y -= 18;
  text(`Net Pay : ${money(slip.net)} Only.`, L, y, 10, bold);
  y -= 14;
  text(`In words : ${rupeesInWords(slip.net)}.`, L, y, 10, bold);
  y -= 22;
  text("This is a computer generated pay slip and does not need a signature.", L, y, 8);

  return doc.save();
}
