import Attendance from "./models/Attendance.js";
import NightShiftStaff from "./models/NightShiftStaff.js";

// Night shift employees work across midnight (e.g. 21:00 -> 06:00), but COSEC
// day records are cut at midnight, which splits one shift over two rows. For
// them a working day runs noon to noon instead: punches before NIGHT_CUTOFF
// belong to the previous day's shift. The stored day records are not changed;
// the Daily Register regroups them when it reads them.
export const NIGHT_CUTOFF = "12:00:00";

const PAIR_KEY = /^pair(\d+)$/;

// Ticked employee IDs among `ids` (all of them when `ids` is omitted).
export async function nightShiftIds(ids) {
  const filter = ids ? { employeeId: { $in: ids.map(String) } } : {};
  const rows = await NightShiftStaff.find(filter, { _id: 0, employeeId: 1 }).lean();
  return new Set(rows.map((row) => row.employeeId));
}

// "DD-MM-YYYY" -> YYYYMMDD number, for sorting.
function dateKey(displayDate) {
  const [d, m, y] = displayDate.split("-");
  return Number(`${y}${m}${d}`);
}

// "DD-MM-YYYY" shifted by `days`.
function addDays(displayDate, days) {
  const [d, m, y] = displayDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}

// A day record's punches in the order they were made.
function punchesOf(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .sort((a, b) => Number(a.match(PAIR_KEY)[1]) - Number(b.match(PAIR_KEY)[1]))
    .flatMap((key) => [doc[key]?.IN, doc[key]?.OUT])
    .filter((time) => typeof time === "string" && time);
}

// One employee's day records -> noon-to-noon shift records { ID, NAME, Date, pair1, ... },
// oldest first, punches re-paired IN/OUT from the start of each shift.
export function toShiftRecords(docs) {
  const punches = docs
    .flatMap((doc) => punchesOf(doc).map((time) => ({ date: doc.Date, time })))
    .sort((a, b) => dateKey(a.date) - dateKey(b.date) || a.time.localeCompare(b.time));

  const shifts = new Map();
  for (const punch of punches) {
    const shiftDate = punch.time < NIGHT_CUTOFF ? addDays(punch.date, -1) : punch.date;
    if (!shifts.has(shiftDate)) shifts.set(shiftDate, []);
    shifts.get(shiftDate).push(punch.time);
  }

  return [...shifts.entries()].map(([shiftDate, times]) => {
    const record = { ID: docs[0].ID, NAME: docs[0].NAME, Date: shiftDate, nightShift: true };
    times.forEach((time, i) => {
      const pairKey = `pair${Math.floor(i / 2) + 1}`;
      const pair = record[pairKey] || (record[pairKey] = {});
      pair[i % 2 === 0 ? "IN" : "OUT"] = time;
    });
    return record;
  });
}

// Replaces night shift employees' day records in `records` with their
// noon-to-noon shift records. The day before and after each record is read
// too, so a shift that ends (or began) on a day outside `records` is whole.
// latest: keep only each night employee's newest shift (the "All Employees
// (Latest)" view); otherwise keep the shifts whose date `records` had.
export async function applyNightShift(records, { latest = false } = {}) {
  const night = await nightShiftIds([...new Set(records.map((r) => String(r.ID)))]);
  if (!night.size) return records;

  const byEmployee = new Map();
  for (const record of records) {
    const id = String(record.ID);
    if (!night.has(id)) continue;
    if (!byEmployee.has(id)) byEmployee.set(id, []);
    byEmployee.get(id).push(record);
  }

  const neighbours = [...byEmployee.entries()].map(([id, docs]) => {
    const have = new Set(docs.map((doc) => doc.Date));
    const dates = new Set(docs.flatMap((doc) => [addDays(doc.Date, -1), addDays(doc.Date, 1)]));
    return { ID: id, Date: { $in: [...dates].filter((date) => !have.has(date)) } };
  });
  const extra = await Attendance.find(
    { $or: neighbours },
    { _id: 0, sortDate: 0, __v: 0, createdAt: 0, updatedAt: 0 }
  ).lean();
  for (const doc of extra) byEmployee.get(String(doc.ID))?.push(doc);

  const shiftRecords = new Map();
  for (const [id, docs] of byEmployee) {
    const wanted = new Set(docs.filter((doc) => !extra.includes(doc)).map((doc) => doc.Date));
    let shifts = toShiftRecords(docs);
    shifts = latest ? shifts.slice(-1) : shifts.filter((shift) => wanted.has(shift.Date));
    shiftRecords.set(id, shifts);
  }

  // Same order as before: each night employee's shifts where their first row was.
  const result = [];
  for (const record of records) {
    const id = String(record.ID);
    if (!night.has(id)) result.push(record);
    else if (shiftRecords.has(id)) {
      result.push(...shiftRecords.get(id));
      shiftRecords.delete(id);
    }
  }
  return result;
}
