import Attendance from "./models/Attendance.js";
import NightShiftStaff from "./models/NightShiftStaff.js";
import { employeeShifts, shiftCutoff } from "./employeeShifts.js";

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

// A day record's punches in the order they were made: [{ time, type }].
function punchesOf(doc) {
  return Object.keys(doc)
    .filter((key) => PAIR_KEY.test(key))
    .sort((a, b) => Number(a.match(PAIR_KEY)[1]) - Number(b.match(PAIR_KEY)[1]))
    .flatMap((key) => [
      { time: doc[key]?.IN, type: "IN" },
      { time: doc[key]?.OUT, type: "OUT" }
    ])
    .filter((punch) => typeof punch.time === "string" && punch.time);
}

// One employee's day records -> noon-to-noon shift records { ID, NAME, Date, pair1, ... },
// oldest first, punches re-paired IN/OUT from the start of each shift.
// cutoff: punches before this time belong to the previous day's shift (noon,
// or the middle of the time off for an employee whose own shift crosses
// midnight, employeeShifts.js).
// Day records whose IN/OUT came from the gate machines keep that direction;
// guessed ones are paired IN, OUT, IN, OUT ... again from the shift's start.
export function toShiftRecords(docs, cutoff = NIGHT_CUTOFF) {
  const known = docs.some((doc) => doc.direction === "device");
  const shiftOf = (date, time) => (time < cutoff ? addDays(date, -1) : date);
  const byDate = (a, b) => dateKey(a.date) - dateKey(b.date) || a.time.localeCompare(b.time);

  const punches = docs.flatMap((doc) => punchesOf(doc).map((punch) => ({ ...punch, date: doc.Date }))).sort(byDate);
  const area = docs
    .flatMap((doc) => (doc.areaPunches || []).map((punch) => ({ ...punch, date: doc.Date })))
    .sort(byDate);

  const shifts = new Map();
  for (const punch of punches) {
    const shiftDate = shiftOf(punch.date, punch.time);
    if (!shifts.has(shiftDate)) shifts.set(shiftDate, []);
    shifts.get(shiftDate).push(punch);
  }

  return [...shifts.entries()].map(([shiftDate, list]) => {
    const record = { ID: docs[0].ID, NAME: docs[0].NAME, Date: shiftDate, nightShift: true, direction: known ? "device" : "guess" };
    const pairs = [];
    list.forEach((punch, i) => {
      if (known) {
        const open = pairs[pairs.length - 1];
        if (punch.type === "OUT" && open && open.IN && !open.OUT) open.OUT = punch.time;
        else pairs.push({ [punch.type]: punch.time });
      } else if (i % 2 === 0) pairs.push({ IN: punch.time });
      else pairs[pairs.length - 1].OUT = punch.time;
    });
    pairs.forEach((pair, i) => {
      record[`pair${i + 1}`] = pair;
    });
    const shiftArea = area.filter((punch) => shiftOf(punch.date, punch.time) === shiftDate);
    if (shiftArea.length) record.areaPunches = shiftArea.map(({ time, device }) => ({ time, device }));
    return record;
  });
}

// Replaces night shift employees' day records in `records` with their
// noon-to-noon shift records. The day before and after each record is read
// too, so a shift that ends (or began) on a day outside `records` is whole.
// latest: keep only each night employee's newest shift (the "All Employees
// (Latest)" view); otherwise keep the shifts whose date `records` had.
// Night employees are the ticked ones plus everyone whose shift (Add Employee >
// Employee shift) crosses midnight, e.g. 20:00 -> 03:00.
export async function applyNightShift(records, { latest = false } = {}) {
  const ids = [...new Set(records.map((r) => String(r.ID)))];
  const [night, shifts] = await Promise.all([nightShiftIds(ids), employeeShifts()]);
  const cutoffs = new Map();
  for (const id of ids) {
    const cutoff = shiftCutoff(shifts.get(id));
    if (cutoff && !night.has(id)) cutoffs.set(id, cutoff);
    if (cutoff) night.add(id);
  }
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
    let shifts = toShiftRecords(docs, cutoffs.get(id));
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
