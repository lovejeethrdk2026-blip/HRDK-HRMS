import Attendance from "./models/Attendance.js";
import { runCosecSync, getSyncStatus } from "./cosecSync.js";
import Employee from "./models/Employee.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerScope } from "./registerScope.js";
import { applyNightShift, nightShiftIds } from "./nightShift.js";
import NightShiftStaff from "./models/NightShiftStaff.js";
import { employeeMaster, monthRecords } from "./attendanceCache.js";

// "YYYY-MM-DD" -> "DD-MM-YYYY"
function toDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

// "DD-MM-YYYY" -> comparable number (YYYYMMDD), for sorting in JS instead of
// relying on the derived sortDate field (see note below).
function dateSortKey(displayDate) {
  const [d, m, y] = displayDate.split("-");
  return Number(`${y}${m}${d}`);
}

// YYYYMMDD number -> "DD-MM-YYYY", the inverse of dateSortKey.
function displayDateFromSortKey(sortKey) {
  const s = String(sortKey);
  return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
}

const PAIR_KEY = /^pair\d+$/;

// ?view=register (the Daily Register): each row cut down to employee ID, name,
// department, date and punch pairs -- no timestamps or whatever else COSEC
// left on the document. Department comes from the employee master copy.
async function toRegisterRows(records) {
  const master = await employeeMaster();

  return records.map((record) => {
    const employee = master.get(String(record.ID)) || {};
    // "Left" when the COSEC master flags the employee inactive or carries a
    // leaving date; "Active" otherwise (also when the master has no row).
    const left = employee.isActive === false || Boolean(employee.leavingDate);
    const row = {
      ID: record.ID,
      NAME: record.NAME,
      department: employee.department || "",
      // COSEC's "Section" (GOLD, SILKY, LASER, ...) is the sub-department.
      subDepartment: employee.section || "",
      status: left ? "Left" : "Active",
      leavingDate: employee.leavingDate || "",
      Date: record.Date
    };
    // Night shift rows run noon to noon (nightShift.js).
    if (record.nightShift) row.nightShift = true;
    for (const key of Object.keys(record)) {
      if (PAIR_KEY.test(key)) row[key] = record[key];
    }
    return row;
  });
}

async function getAttendance(req, res) {
  const { employeeId, date, month } = req.query; // date: YYYY-MM-DD, month: YYYY-MM

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  // The Daily Register asks for a whole month in one go (~6000 slim rows):
  // eleven 500-row pages, one after another, took 10+ seconds.
  const maxLimit = req.query.view === "register" ? 10000 : 500;
  const limit = Math.min(maxLimit, parseInt(req.query.limit, 10) || 100);

  // only the user's own Daily Register department (registerScope.js)
  const scope = await registerScope(req);

  // The Daily Register (a month, or one day) comes from the in-memory month
  // cache (attendanceCache.js) instead of a fresh read from Atlas.
  if (req.query.view === "register" && (month || date)) {
    const [y, m] = (month || date).split("-"); // "YYYY-MM" or "YYYY-MM-DD"
    const day = month ? null : toDisplayDate(date);
    const ids = scope ? new Set(scope.ids) : null;
    const records = (await monthRecords(m, y)).filter(
      (r) =>
        (!day || r.Date === day) &&
        (!employeeId || String(r.ID) === String(employeeId)) &&
        (!ids || ids.has(String(r.ID)))
    );
    records.sort((a, b) => {
      if (a.ID !== b.ID) return a.ID < b.ID ? -1 : 1;
      return dateSortKey(a.Date) - dateSortKey(b.Date);
    });
    const pageRows = records.slice((page - 1) * limit, page * limit);
    return res.json({
      records: await toRegisterRows(await applyNightShift(pageRows)),
      page,
      limit,
      total: records.length,
      totalPages: Math.ceil(records.length / limit)
    });
  }

  const match = {};
  if (employeeId) match.ID = String(employeeId);
  if (scope) match.ID = { $in: employeeId ? scope.ids.filter((id) => id === String(employeeId)) : scope.ids };
  if (date) match.Date = toDisplayDate(date);

  if (month) {
    const [y, m] = month.split("-"); // already "YYYY-MM", zero-padded
    // Date is stored as "DD-MM-YYYY" -- match the month/year segments as a
    // string pattern directly, instead of comparing the derived sortDate
    // field. sortDate keeps getting wiped by something outside this app
    // (still unresolved), so filtering on it made this silently return
    // zero results whenever that happened; this match never depends on it.
    match.Date = { $regex: `^\\d{2}-${m}-${y}$` };
  }

  // The register view never shows the bookkeeping fields, so they are not fetched.
  const projection =
    req.query.view === "register" ? { sortDate: 0, _id: 0, __v: 0, createdAt: 0, updatedAt: 0 } : { sortDate: 0 };
  // A register page is a whole month and is sorted below anyway. Sorting it in
  // MongoDB too walks the {ID, sortDate} index over every document of every
  // month (35000+ fetches instead of one plain scan), so only paged reads sort.
  const find = Attendance.find(match, projection);
  if (req.query.view !== "register") find.sort({ ID: 1, sortDate: -1 });
  const [records, total] = await Promise.all([
    find
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Attendance.countDocuments(match)
  ]);

  // Re-sort this page's rows in JS by the real Date string, ascending
  // (oldest first) -- the DB-level sort above uses sortDate, which keeps
  // getting wiped by something outside this app (still unresolved), so it
  // can't be trusted for ordering. Safe to do here since a page is capped
  // at `limit` rows (default 100, max 500, 10000 for view=register).
  records.sort((a, b) => {
    if (a.ID !== b.ID) return a.ID < b.ID ? -1 : 1;
    return dateSortKey(a.Date) - dateSortKey(b.Date);
  });

  res.json({
    records: req.query.view === "register" ? await toRegisterRows(await applyNightShift(records)) : records,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  });
}

// One row per employee: their most recent day's document (with all its pairs).
async function getLatestAttendance(req, res) {
  const scope = await registerScope(req);
  // Find each employee's max Date (as YYYYMMDD) via $group/$max -- a single
  // streaming pass over the collection, not a $sort stage, so it never hits
  // the Atlas M0 32MB in-memory-sort limit. This replaces sorting/grouping
  // by the derived sortDate field, which keeps getting wiped by something
  // outside this app (still unresolved) and was silently picking a stale
  // (or no) "latest" doc per employee.
  const maxDates = await Attendance.aggregate([
    // The external COSEC program writes its own differently-shaped documents
    // into this same collection (refId/financialYear, no Date), so skip
    // anything that isn't one of this app's day records.
    { $match: { Date: { $type: "string" }, ...(scope && { ID: { $in: scope.ids } }) } },
    {
      $addFields: {
        _dateNum: {
          $toInt: {
            $concat: [
              { $substrCP: ["$Date", 6, 4] },
              { $substrCP: ["$Date", 3, 2] },
              { $substrCP: ["$Date", 0, 2] }
            ]
          }
        }
      }
    },
    { $group: { _id: "$ID", maxDateNum: { $max: "$_dateNum" } } }
  ]);

  // Fetch each employee's full latest-day document via the unique
  // {ID, Date} index -- targeted equality lookups, not a collection scan.
  const latestConditions = maxDates.map((row) => ({
    ID: row._id,
    Date: displayDateFromSortKey(row.maxDateNum)
  }));

  const records = latestConditions.length
    ? await Attendance.find({ $or: latestConditions }, { sortDate: 0 })
        .sort({ ID: 1 })
        .lean()
    : [];

  res.json(
    req.query.view === "register" ? await toRegisterRows(await applyNightShift(records, { latest: true })) : records
  );
}

// GET /api/attendance/range  (admin) -> { firstDate, lastDate, days } over this
// app's day records ("DD-MM-YYYY"), so the UI can open on a day that actually
// has data instead of on today, and can say what it does have when a filter
// matches nothing.
async function getAttendanceRange(req, res) {
  const [row] = await Attendance.aggregate([
    { $match: { Date: { $type: "string" } } },
    {
      $addFields: {
        _dateNum: {
          $toInt: {
            $concat: [
              { $substrCP: ["$Date", 6, 4] },
              { $substrCP: ["$Date", 3, 2] },
              { $substrCP: ["$Date", 0, 2] }
            ]
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        min: { $min: "$_dateNum" },
        max: { $max: "$_dateNum" },
        days: { $addToSet: "$Date" }
      }
    }
  ]);

  if (!row) return res.json({ firstDate: "", lastDate: "", days: 0 });

  res.json({
    firstDate: displayDateFromSortKey(row.min),
    lastDate: displayDateFromSortKey(row.max),
    days: row.days.length
  });
}

// GET /api/attendance/headcount?fy=2026  (admin) -> { fy, counts: { "DD-MM-YYYY": n } }
// Head count per day over one financial year (01-04-fy .. 31-03-fy+1): how
// many employees have at least one IN or OUT punch that day. Days nobody
// punched are simply absent from counts.
async function getHeadCount(req, res) {
  const fy = parseInt(req.query.fy, 10);
  if (!fy || fy < 2000 || fy > 2100) {
    return res.status(400).json({ message: "fy must be a year, e.g. 2026" });
  }

  const scope = await registerScope(req);
  const rows = await Attendance.aggregate([
    {
      $match: {
        ...(scope && { ID: { $in: scope.ids } }),
        Date: {
          $regex: `^(\\d{2}-(0[4-9]|1[0-2])-${fy}|\\d{2}-0[1-3]-${fy + 1})$`
        }
      }
    },
    {
      $project: {
        ID: 1,
        Date: 1,
        // Any pairN key with an IN or OUT time counts as a punch.
        punched: {
          $anyElementTrue: [
            {
              $map: {
                input: {
                  $filter: {
                    input: { $objectToArray: "$$ROOT" },
                    cond: { $regexMatch: { input: "$$this.k", regex: /^pair\d+$/ } }
                  }
                },
                in: {
                  $or: [
                    { $gt: [{ $strLenCP: { $ifNull: [{ $toString: "$$this.v.IN" }, ""] } }, 0] },
                    { $gt: [{ $strLenCP: { $ifNull: [{ $toString: "$$this.v.OUT" }, ""] } }, 0] }
                  ]
                }
              }
            }
          ]
        }
      }
    },
    { $match: { punched: true } },
    { $group: { _id: "$Date", ids: { $addToSet: "$ID" } } },
    { $project: { _id: 0, date: "$_id", count: { $size: "$ids" } } }
  ]);

  const counts = {};
  for (const row of rows) counts[row.date] = row.count;
  res.json({ fy, counts });
}

// GET /api/attendance/departments -> { departments: ["WAX", ...] }, the COSEC
// departments in the employee master copy (Users page: Daily Register department).
async function getRegisterDepartments(req, res) {
  const names = await Employee.distinct("department", { department: { $nin: ["", null] } });
  res.json({ departments: names.map(String).sort((a, b) => a.localeCompare(b)) });
}

// GET /api/attendance/night-shift -> { employees: [{ employeeId, name, department,
// section, nightShift }] }, everyone in the user's register scope, for the
// Night Shift Staff dialog.
async function getNightShiftStaff(req, res) {
  const scope = await registerScope(req);
  const employees = await Employee.find(
    scope ? { employeeId: { $in: scope.ids } } : {},
    { _id: 0, employeeId: 1, name: 1, department: 1, section: 1 }
  ).lean();
  const night = await nightShiftIds();
  res.json({
    employees: employees
      .map((e) => ({
        employeeId: String(e.employeeId),
        name: e.name || "",
        department: e.department || "",
        section: e.section || "",
        nightShift: night.has(String(e.employeeId))
      }))
      .sort((a, b) => a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }))
  });
}

// PUT /api/attendance/night-shift/:employeeId  { nightShift: true|false }
async function setNightShift(req, res) {
  const employeeId = String(req.params.employeeId);
  const scope = await registerScope(req);
  if (scope && !scope.ids.includes(employeeId)) {
    return res.status(403).json({ message: "This employee is outside your department" });
  }
  if (!(await Employee.exists({ employeeId }))) {
    return res.status(404).json({ message: `No employee ${employeeId}` });
  }
  if (req.body?.nightShift) {
    await NightShiftStaff.updateOne({ employeeId }, { $set: { employeeId } }, { upsert: true });
  } else {
    await NightShiftStaff.deleteOne({ employeeId });
  }
  res.json({ employeeId, nightShift: Boolean(req.body?.nightShift) });
}

// GET /api/attendance/sync  (admin) -> last COSEC sync run + settings
async function syncStatus(req, res) {
  res.json(await getSyncStatus());
}

// POST /api/attendance/sync  (admin) -> run the COSEC punch sync now
async function syncNow(req, res) {
  const result = await runCosecSync("manual");
  if (result.skipped) {
    return res.status(409).json({ message: result.message });
  }
  res.json(result);
}

// Each handler is wrapped so a rejected promise reaches the error handler.
const getAttendanceHandler = asyncHandler(getAttendance);
const getLatestAttendanceHandler = asyncHandler(getLatestAttendance);
const getAttendanceRangeHandler = asyncHandler(getAttendanceRange);
const getHeadCountHandler = asyncHandler(getHeadCount);
const getRegisterDepartmentsHandler = asyncHandler(getRegisterDepartments);
const getNightShiftStaffHandler = asyncHandler(getNightShiftStaff);
const setNightShiftHandler = asyncHandler(setNightShift);
const syncStatusHandler = asyncHandler(syncStatus);
const syncNowHandler = asyncHandler(syncNow);

export {
  getAttendanceHandler as getAttendance,
  getLatestAttendanceHandler as getLatestAttendance,
  getAttendanceRangeHandler as getAttendanceRange,
  getHeadCountHandler as getHeadCount,
  getRegisterDepartmentsHandler as getRegisterDepartments,
  getNightShiftStaffHandler as getNightShiftStaff,
  setNightShiftHandler as setNightShift,
  syncStatusHandler as syncStatus,
  syncNowHandler as syncNow
};
