import Attendance from "./models/Attendance.js";
import Employee from "./models/Employee.js";

// The Daily Register reads a whole month at a time (~6000 day records, ~1.2 MB).
// Pulling that from Atlas on every visit took 15+ seconds, so each month asked
// for is kept here in memory and handed out at once. The attendance watcher
// (attendanceWatcher.js) passes every change in, so a cached month stays
// current without being read again; if the watcher drops, the cache is
// emptied (it may have missed changes). A month is also re-read in the
// background once it is older than MONTH_TTL_MS, as a safety net.

const MONTH_TTL_MS = 30 * 60 * 1000;
const FIELDS = { sortDate: 0, __v: 0, createdAt: 0, updatedAt: 0 };

const months = new Map(); // "MM-YYYY" -> { at, docs: Map(_id -> record) }
const loading = new Map(); // "MM-YYYY" -> { promise, changes: [] }

const monthKeyOf = (displayDate) => displayDate.slice(3); // "DD-MM-YYYY" -> "MM-YYYY"
const isDayRecord = (doc) => typeof doc?.Date === "string" && /^\d{2}-\d{2}-\d{4}$/.test(doc.Date);

function slim(doc) {
  const { _id, sortDate, __v, createdAt, updatedAt, ...record } = doc;
  return record;
}

function applyTo(docs, change) {
  if (change.operationType === "delete") docs.delete(String(change.documentKey?._id));
  else docs.set(String(change.fullDocument._id), slim(change.fullDocument));
}

function loadMonth(mm, yyyy) {
  const key = `${mm}-${yyyy}`;
  if (!loading.has(key)) {
    const entry = { changes: [] };
    entry.promise = Attendance.find({ Date: { $regex: `^\\d{2}-${mm}-${yyyy}$` } }, FIELDS)
      .lean()
      .then((rows) => {
        const docs = new Map(rows.map((row) => [String(row._id), slim(row)]));
        // changes that arrived while the month was being read
        for (const change of entry.changes) applyTo(docs, change);
        months.set(key, { at: Date.now(), docs });
        return docs;
      })
      .finally(() => loading.delete(key));
    loading.set(key, entry);
  }
  return loading.get(key).promise;
}

// Every day record of one month (mm "10", yyyy "2026"), without _id and
// bookkeeping fields. Callers must not change the objects.
export async function monthRecords(mm, yyyy) {
  const hit = months.get(`${mm}-${yyyy}`);
  if (!hit) return [...(await loadMonth(mm, yyyy)).values()];
  if (Date.now() - hit.at > MONTH_TTL_MS) loadMonth(mm, yyyy).catch(() => {});
  return [...hit.docs.values()];
}

// A change stream event on attendance_days (insert / update / replace with
// fullDocument, or delete).
export function applyAttendanceChange(change) {
  if (change.operationType === "delete") {
    for (const { docs } of months.values()) applyTo(docs, change);
    for (const entry of loading.values()) entry.changes.push(change);
    return;
  }
  if (!isDayRecord(change.fullDocument)) return;
  const key = monthKeyOf(change.fullDocument.Date);
  months.get(key) && applyTo(months.get(key).docs, change);
  loading.get(key)?.changes.push(change);
}

// The watcher stopped: changes may have been missed.
export function clearAttendanceCache() {
  months.clear();
}

// Read this month (India time) ahead, so the first Daily Register visit is quick.
export function warmAttendanceCache() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  monthRecords(mm, String(now.getUTCFullYear())).catch((error) =>
    console.error("Daily Register warm-up failed:", error.message)
  );
}

// ---------- employee master (department, section, status) ----------

const EMPLOYEE_TTL_MS = 5 * 60 * 1000;
let employees = null; // { at, byId: Map(employeeId -> row) }
let employeesLoading = null;

function loadEmployees() {
  employeesLoading ??= Employee.find(
    {},
    { _id: 0, employeeId: 1, department: 1, section: 1, isActive: 1, leavingDate: 1 }
  )
    .lean()
    .then((rows) => {
      employees = { at: Date.now(), byId: new Map(rows.map((row) => [String(row.employeeId), row])) };
      return employees.byId;
    })
    .finally(() => (employeesLoading = null));
  return employeesLoading;
}

// employeeId -> { department, section, isActive, leavingDate }, at most
// EMPLOYEE_TTL_MS old (re-read in the background after that).
export async function employeeMaster() {
  if (!employees) return loadEmployees();
  if (Date.now() - employees.at > EMPLOYEE_TTL_MS) loadEmployees().catch(() => {});
  return employees.byId;
}
