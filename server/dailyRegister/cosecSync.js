// Builds this app's per-day attendance records (models/Attendance.js:
// { ID, NAME, Date: "DD-MM-YYYY", sortDate, pair1: { IN, OUT }, pair2, ... })
// from the raw punch rows the external COSEC sync writes into the
// COSEC-ATTENDANCE database (models/Punch.js).
//
// Pairing: punchDirection in that data is 0 on 99.9% of rows, so it can't
// tell IN from OUT. Instead, an employee's punches for one wall-clock day
// are sorted, taps within PUNCH_DUPLICATE_SECONDS of the previous kept
// punch are dropped (double taps at the reader), and the rest alternate
// IN, OUT, IN, OUT ...
//
// Time zone: the external sync stores the reader's local (IST) wall-clock
// time as if it were UTC (punches show up "5.5 hours before" they were
// synced). Formatting those instants in UTC therefore yields the correct
// local times, which is why PUNCH_TIME_ZONE defaults to "UTC". If that sync
// is ever fixed to store real UTC instants, set PUNCH_TIME_ZONE=Asia/Kolkata.
//
// Runs at startup (a full rebuild the very first time, incremental after
// that) and then every COSEC_SYNC_MINUTES.
//
// Incremental runs track their position by `syncedAt` -- the instant the
// external puller WROTE a punch row -- not by `punchTime`. That puller
// back-fills history out of chronological order, so a punchTime watermark
// gets stranded by a single stray newer row and every older day imported
// afterwards stays invisible forever. A run reads every row written since
// COSEC_SYNC_OVERLAP_MINUTES before that watermark, works out which
// (employee, day) pairs they touch, then rebuilds each of those days from
// ALL of its punches.
import Attendance from "./models/Attendance.js";
import SyncState from "./models/SyncState.js";
import Punch from "./models/Punch.js";
import CosecEmployee from "./models/CosecEmployee.js";
import CosecDayRecord from "./models/CosecDayRecord.js";
import Employee from "./models/Employee.js";
import { COSEC_DB_NAME } from "../config/cosecDb.js";
import { IN_DEVICES, OUT_DEVICES, gateDirection } from "./devices.js";

const STATE_NAME = "cosecPunches";
const TIME_ZONE = process.env.PUNCH_TIME_ZONE || "UTC";
const DUPLICATE_WINDOW_MS = (Number(process.env.PUNCH_DUPLICATE_SECONDS) || 120) * 1000;
// How far back before the watermark a run re-reads. This is a window on
// `syncedAt` (when the external puller wrote a row), not on punchTime, so
// minutes are plenty -- it only has to cover rows written while the previous
// run was in flight. Making it days would re-read the whole collection on
// every run.
const INGEST_OVERLAP_MS = (Number(process.env.COSEC_SYNC_OVERLAP_MINUTES) || 30) * 60 * 1000;
const INTERVAL_MINUTES = Number(process.env.COSEC_SYNC_MINUTES) || 5;
const WRITE_BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

let formatter;
try {
  formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
} catch (error) {
  throw new Error(`PUNCH_TIME_ZONE "${TIME_ZONE}" is not a valid IANA time zone`);
}

// ---------- wall-clock helpers ----------

// { year, month (1-12), day, hour, minute, second } of an instant in TIME_ZONE.
function wallClockParts(date) {
  if (TIME_ZONE === "UTC") {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return parts;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dayKeyOf(parts) {
  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year}`; // "DD-MM-YYYY"
}

function timeOf(parts) {
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`; // "HH:mm:ss"
}

function sortDateOf(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

// The instant at which the wall-clock day containing `date` starts.
function startOfWallClockDay(date) {
  const p = wallClockParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = Math.round((asUtc - date.getTime()) / 60000) * 60000; // zone offset at that instant
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offsetMs);
}

// ---------- building day records ----------

// IN/OUT pairs from punches that each know their direction: an IN opens a
// pair; an OUT closes the open pair, or stands alone (IN missing) when there
// is none. Two INs in a row leave the first pair without an OUT.
function pairByDirection(punches) {
  const pairs = [];
  for (const { time, type } of punches) {
    const open = pairs[pairs.length - 1];
    if (type === "OUT" && open && open.IN && !open.OUT) open.OUT = time;
    else pairs.push(type === "IN" ? { IN: time } : { OUT: time });
  }
  return pairs;
}

// punches: rows with { employeeId, employeeName, punchTime, deviceId } in any
// order. Returns one Attendance document per (employee, wall-clock day).
//
// Direction: on a day with punches at the main gate machines (devices.js),
// ENTRY punches are IN and EXIT punches OUT ("direction: device"); punches at
// other machines are kept apart as areaPunches. A day without any gate punch
// (no machine recorded yet, or a branch reader only) falls back to guessing:
// IN, OUT, IN, OUT ... in time order ("direction: guess").
// gateDown: Set of "DD-MM-YYYY" days on which the ENTRY or EXIT machine
// recorded (almost) nothing -- e.g. 26-07 to 13-08-2026 the ENTRY machine sent
// no punches at all, so every EXIT would look like "came in without ENTRY".
// Those days are guessed instead, marked gateDown.
function buildDayRecords(punches, nameOf, gateDown = new Set()) {
  const groups = new Map(); // "ID|DD-MM-YYYY" -> { doc fields..., times: [Date] }

  for (const punch of punches) {
    const time = punch.punchTime instanceof Date ? punch.punchTime : new Date(punch.punchTime);
    if (!punch.employeeId || Number.isNaN(time.getTime())) continue;

    const parts = wallClockParts(time);
    const id = String(punch.employeeId);
    const key = `${id}|${dayKeyOf(parts)}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        ID: id,
        NAME: nameOf(id, punch.employeeName),
        Date: dayKeyOf(parts),
        sortDate: sortDateOf(parts),
        times: []
      };
      groups.set(key, group);
    }
    group.times.push({ time, device: punch.deviceId != null && punch.deviceId !== "" ? String(punch.deviceId) : "" });
  }

  const docs = [];
  for (const group of groups.values()) {
    group.times.sort((a, b) => a.time - b.time);

    // Drop taps that follow the previous kept punch at the same machine too
    // closely (double taps). ENTRY then EXIT a minute apart are both kept.
    const kept = [];
    const lastAt = new Map(); // device -> time of its last kept punch
    for (const punch of group.times) {
      const previous = lastAt.get(punch.device);
      if (previous && punch.time - previous < DUPLICATE_WINDOW_MS) continue;
      kept.push(punch);
      lastAt.set(punch.device, punch.time);
    }

    const doc = { ID: group.ID, NAME: group.NAME, Date: group.Date, sortDate: group.sortDate };
    const clock = (time) => timeOf(wallClockParts(time));
    const gate = kept
      .map((punch) => ({ ...punch, type: gateDirection(punch.device) }))
      .filter((punch) => punch.type);

    let pairs;
    if (gate.length && !gateDown.has(group.Date)) {
      doc.direction = "device";
      pairs = pairByDirection(gate.map((punch) => ({ time: clock(punch.time), type: punch.type })));
      const area = kept.filter((punch) => !gateDirection(punch.device));
      if (area.length) doc.areaPunches = area.map((punch) => ({ time: clock(punch.time), device: punch.device }));
    } else {
      doc.direction = "guess";
      if (gate.length) doc.gateDown = true;
      pairs = [];
      kept.forEach((punch, i) => {
        if (i % 2 === 0) pairs.push({ IN: clock(punch.time) });
        else pairs[pairs.length - 1].OUT = clock(punch.time);
      });
    }
    pairs.forEach((pair, i) => {
      doc[`pair${i + 1}`] = pair;
    });
    docs.push(doc);
  }
  return docs;
}

// "ID|Date" -> the day record this process last wrote, as JSON. Every run
// rebuilds thousands of days that have not changed; re-sending them all used
// to rewrite all ~35000 day records every 5 minutes (4+ minute runs), and the
// attendance watcher then pulled each one back -- tens of MB per run, enough
// to get the Atlas cluster throttled and make every page slow. Only days that
// differ from the last write are sent now.
const lastWritten = new Map();
const recordKey = (doc) => `${doc.ID}|${doc.Date}`;

// replaceOne (not $set) so pairs that no longer exist for a day disappear.
// No timestamps: a replacement identical to the stored record is then a no-op
// in MongoDB (no write, no change event), which keeps restarts cheap too.
// Returns how many records were sent.
//
// fillOnly (the COSEC program's own day records): never replace a day built
// from punches (those carry `direction`, ENTRY/EXIT-aware); only add days that
// are missing and refresh days that came from this same feed.
async function upsertDayRecords(docs, { fillOnly = false } = {}) {
  const changed = docs.filter((doc) => lastWritten.get(recordKey(doc)) !== JSON.stringify(doc));
  for (let i = 0; i < changed.length; i += WRITE_BATCH) {
    const batch = changed.slice(i, i + WRITE_BATCH);
    const ops = fillOnly
      ? batch.flatMap((doc) => [
          {
            replaceOne: {
              filter: { ID: doc.ID, Date: doc.Date, direction: { $exists: false } },
              replacement: doc,
              upsert: false,
              timestamps: false
            }
          },
          {
            updateOne: {
              filter: { ID: doc.ID, Date: doc.Date },
              update: { $setOnInsert: doc },
              upsert: true,
              timestamps: false
            }
          }
        ])
      : batch.map((doc) => ({
          replaceOne: {
            filter: { ID: doc.ID, Date: doc.Date },
            replacement: doc,
            upsert: true,
            timestamps: false
          }
        }));
    await Attendance.bulkWrite(ops, { ordered: false, timestamps: false });
    for (const doc of batch) lastWritten.set(recordKey(doc), JSON.stringify(doc));
  }
  return changed.length;
}

// ---------- the external program's own day records ----------

// A second feed, separate from the raw punches: the external COSEC program
// writes the current days only as its own "DD-MM-YYYY"-keyed documents
// (models/CosecDayRecord.js) while it back-fills older history as punch rows.
// Those days have no punch rows at all, so without this they never reach this
// app. Converted here into the same { ID, NAME, Date, pair1, ... } shape.
const DAY_KEY_PATTERN = /^\d{2}-\d{2}-\d{4}$/;
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}$/;

function dayRecordsFromDayKeyedDoc(row, nameOf) {
  const id = String(row.refId);
  const name = nameOf(id, row.name || row.userName);
  const docs = [];

  for (const [key, value] of Object.entries(row)) {
    if (!DAY_KEY_PATTERN.test(key) || !Array.isArray(value)) continue;

    const [day, month, year] = key.split("-").map(Number);
    const doc = { ID: id, NAME: name, Date: key, sortDate: new Date(Date.UTC(year, month - 1, day)) };

    let pairs = 0;
    for (const entry of value) {
      const pair = {};
      if (TIME_PATTERN.test(entry?.in)) pair.IN = entry.in;
      if (TIME_PATTERN.test(entry?.out)) pair.OUT = entry.out; // `out` is null while an employee is still in
      if (!pair.IN && !pair.OUT) continue;
      doc[`pair${++pairs}`] = pair;
    }

    if (pairs) docs.push(doc);
  }

  return docs;
}

// The program only writes the current days here, but each document holds a
// whole financial year (~6 MB in all). So a scheduled run reads just the last
// RECENT_DAYS day keys of each document; every day is read at startup, on a
// manual sync, and every FULL_READ_MS in case an older day was corrected.
const RECENT_DAYS = 7;
const FULL_READ_MS = 6 * 60 * 60 * 1000;
let lastFullRead = 0;

// "DD-MM-YYYY" keys of the last `count` days, India time.
function recentDayKeys(count) {
  const now = Date.now() + 5.5 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now - i * DAY_MS);
    return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  });
}

async function syncDayKeyedRecords(nameOf, { full = false } = {}) {
  const readAll = full || Date.now() - lastFullRead > FULL_READ_MS;
  const projection = readAll
    ? undefined
    : Object.fromEntries(["refId", "name", "userName", ...recentDayKeys(RECENT_DAYS)].map((key) => [key, 1]));
  const rows = await CosecDayRecord.find({ refId: { $exists: true } }, projection).lean();
  if (readAll) lastFullRead = Date.now();

  const docs = [];
  for (const row of rows) {
    if (!row.refId) continue;
    docs.push(...dayRecordsFromDayKeyedDoc(row, nameOf));
  }

  // Days built from punches (ENTRY/EXIT machines) always win over these.
  await upsertDayRecords(docs, { fillOnly: true });
  return docs.length;
}

// ---------- employees ----------

// Copies employee ID, name and department from the COSEC employee master
// into this app's own `employees` collection (models/Employee.js); nothing
// else from the master is kept. Rows missing from the source are kept. Only
// employees whose name or department changed since this process last wrote
// them are sent (like lastWritten above).
const lastMirrored = new Map(); // employeeId -> "name|department"
const mirrorKey = (row) => `${String(row.name || row.fullName || "").trim()}|${String(row.department || "").trim()}`;

async function mirrorEmployees(allRows) {
  const now = new Date();
  const rows = allRows.filter((row) => lastMirrored.get(String(row.employeeId)) !== mirrorKey(row));
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const ops = rows.slice(i, i + WRITE_BATCH).map((row) => {
      return {
        updateOne: {
          filter: { employeeId: String(row.employeeId) },
          update: {
            $set: {
              employeeId: String(row.employeeId),
              name: String(row.name || row.fullName || "").trim(),
              department: String(row.department || "").trim(),
              syncedAt: now
            }
          },
          upsert: true
        }
      };
    });
    await Employee.bulkWrite(ops, { ordered: false });
    for (const row of rows.slice(i, i + WRITE_BATCH)) lastMirrored.set(String(row.employeeId), mirrorKey(row));
  }
}

let warnedMissingMaster = false;

// employeeId -> { name }. Read from the COSEC employee master and mirrored
// into this app's database; if that master is empty or missing (the external
// sync program resets its database now and then), the mirror is used instead
// so names keep working.
async function loadEmployees() {
  let rows = await CosecEmployee.find(
    {},
    { _id: 0, employeeId: 1, name: 1, fullName: 1, department: 1 }
  ).lean();
  rows = rows.filter((row) => row.employeeId);

  if (rows.length) {
    await mirrorEmployees(rows);
    warnedMissingMaster = false;
  } else {
    if (!warnedMissingMaster) {
      console.warn(`[cosec sync] "${COSEC_DB_NAME}.employees" is empty or missing; using this app's employees copy`);
      warnedMissingMaster = true;
    }
    rows = await Employee.find({}, { _id: 0, employeeId: 1, name: 1 }).lean();
  }

  const employees = new Map();
  for (const row of rows) {
    employees.set(String(row.employeeId), { name: String(row.name || row.fullName || "").trim() });
  }
  return employees;
}

// ---------- the sync itself ----------

const PUNCH_FIELDS = { _id: 0, employeeId: 1, employeeName: 1, punchTime: 1, deviceId: 1, syncedAt: 1, createdAt: 1 };

// When the external puller wrote this row. Rows it wrote before it started
// stamping syncedAt fall back to createdAt.
function ingestTimeOf(row) {
  return row.syncedAt || row.createdAt || null;
}

// The wall-clock day key of a punch row, or "" if the row is unusable.
function dayKeyOfPunch(row) {
  const time = row.punchTime instanceof Date ? row.punchTime : new Date(row.punchTime);
  if (!row.employeeId || Number.isNaN(time.getTime())) return "";
  return dayKeyOf(wallClockParts(time));
}

// Days (between `from` and `to`) on which a main gate machine was not working:
// ENTRY punches fewer than GATE_MIN_SHARE of EXIT punches, or the other way
// round. On a normal day ENTRY is about 70% of EXIT; on 26-07..13-08-2026 it
// was 0. Counted across all employees, in the punches' own wall-clock zone.
const GATE_MIN_SHARE = 0.25;
async function gateDownDays(from, to) {
  const rows = await Punch.aggregate([
    {
      $match: {
        punchTime: { $gte: from, $lt: to },
        deviceId: { $in: [...IN_DEVICES, ...OUT_DEVICES] }
      }
    },
    {
      $group: {
        _id: { day: { $dateToString: { format: "%d-%m-%Y", date: "$punchTime", timezone: TIME_ZONE } }, device: "$deviceId" },
        n: { $sum: 1 }
      }
    }
  ]);
  const days = new Map(); // day -> { in, out }
  for (const row of rows) {
    const day = days.get(row._id.day) || { in: 0, out: 0 };
    if (IN_DEVICES.has(String(row._id.device))) day.in += row.n;
    else day.out += row.n;
    days.set(row._id.day, day);
  }
  // Today is still running (mornings are nearly all ENTRY), so never judged.
  const today = recentDayKeys(1)[0];
  const down = new Set();
  for (const [day, { in: ins, out }] of days) {
    if (day === today) continue;
    if (ins < out * GATE_MIN_SHARE || out < ins * GATE_MIN_SHARE) down.add(day);
  }
  return down;
}

function newer(a, b) {
  return !a || (b && b > a) ? b : a;
}

// First run: every punch, one employee at a time (each query is served by
// the {employeeId, punchTime} index, so no big in-memory sorts on Atlas).
async function fullRebuild(nameOf) {
  const employeeIds = await Punch.distinct("employeeId");
  const gateDown = await gateDownDays(new Date(0), new Date(Date.now() + DAY_MS));
  let punches = 0;
  let docs = 0;
  let maxPunchTime = null;
  let maxSyncedAt = null;

  for (const employeeId of employeeIds) {
    const rows = await Punch.find({ employeeId }, PUNCH_FIELDS).sort({ punchTime: 1 }).lean();
    if (!rows.length) continue;

    const built = buildDayRecords(rows, nameOf, gateDown);
    await upsertDayRecords(built);

    punches += rows.length;
    docs += built.length;
    maxPunchTime = newer(maxPunchTime, rows[rows.length - 1].punchTime);
    for (const row of rows) maxSyncedAt = newer(maxSyncedAt, ingestTimeOf(row));
  }

  return { mode: "full", punches, docs, maxPunchTime, maxSyncedAt };
}

// Later runs: every row written since the watermark, with each day those rows
// touch rebuilt from all of its punches.
async function incrementalSync(nameOf, lastSyncedAt) {
  const since = new Date(lastSyncedAt.getTime() - INGEST_OVERLAP_MS);
  const fresh = await Punch.find(
    {
      $or: [{ syncedAt: { $gte: since } }, { syncedAt: null, createdAt: { $gte: since } }]
    },
    PUNCH_FIELDS
  ).lean();

  // employeeId -> set of wall-clock day keys those rows land on
  const affected = new Map();
  let minDayStart = null;
  let maxDayEnd = null;
  let maxPunchTime = null;
  let maxSyncedAt = null;

  for (const row of fresh) {
    const dayKey = dayKeyOfPunch(row);
    if (!dayKey) continue;

    const time = row.punchTime instanceof Date ? row.punchTime : new Date(row.punchTime);
    const id = String(row.employeeId);
    if (!affected.has(id)) affected.set(id, new Set());
    affected.get(id).add(dayKey);

    const dayStart = startOfWallClockDay(time);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    if (!minDayStart || dayStart < minDayStart) minDayStart = dayStart;
    if (!maxDayEnd || dayEnd > maxDayEnd) maxDayEnd = dayEnd;

    maxPunchTime = newer(maxPunchTime, time);
    maxSyncedAt = newer(maxSyncedAt, ingestTimeOf(row));
  }

  if (!affected.size) {
    return { mode: "incremental", punches: 0, docs: 0, maxPunchTime: null, maxSyncedAt: null };
  }

  // Re-read those employees across the span of affected days, then keep only
  // the days actually touched -- a day must be rebuilt from ALL its punches,
  // not just the ones that arrived in this run.
  const rows = await Punch.find(
    {
      employeeId: { $in: [...affected.keys()] },
      punchTime: { $gte: minDayStart, $lt: maxDayEnd }
    },
    PUNCH_FIELDS
  )
    .sort({ punchTime: 1 })
    .lean();

  const relevant = rows.filter((row) => {
    const dayKey = dayKeyOfPunch(row);
    return dayKey && affected.get(String(row.employeeId))?.has(dayKey);
  });

  const gateDown = await gateDownDays(minDayStart, maxDayEnd);
  const built = buildDayRecords(relevant, nameOf, gateDown);
  await upsertDayRecords(built);

  return { mode: "incremental", punches: relevant.length, docs: built.length, maxPunchTime, maxSyncedAt };
}

let running = false;
let timer = null;

async function runCosecSync(reason = "scheduled") {
  if (running) return { skipped: true, message: "A COSEC sync is already running" };
  running = true;
  const startedAt = Date.now();

  try {
    const employees = await loadEmployees();
    const nameOf = (id, fallback) => employees.get(id)?.name || String(fallback || "").trim();

    // Before the punch rebuild, so that on a day covered by both feeds the
    // punch-derived record (built from the raw taps) is the one that stands.
    const dayKeyedDocs = await syncDayKeyedRecords(nameOf, { full: reason === "manual" });

    const state = await SyncState.findOne({ name: STATE_NAME }).lean();
    // No lastSyncedAt means either a first run, or state left by the old
    // punchTime-watermark scheme (which could have skipped back-filled days);
    // either way one full rebuild puts every day back.
    const result = state?.lastSyncedAt
      ? await incrementalSync(nameOf, state.lastSyncedAt)
      : await fullRebuild(nameOf);

    const summary = {
      mode: result.mode,
      punches: result.punches,
      docs: result.docs,
      dayKeyedDocs,
      employees: employees.size,
      ms: Date.now() - startedAt
    };

    await SyncState.updateOne(
      { name: STATE_NAME },
      {
        $set: {
          lastPunchTime: newer(state?.lastPunchTime || null, result.maxPunchTime),
          lastSyncedAt: newer(state?.lastSyncedAt || null, result.maxSyncedAt),
          lastRunAt: new Date(),
          lastRunMode: result.mode,
          lastRunPunches: result.punches,
          lastRunDocs: result.docs,
          lastRunDayKeyedDocs: dayKeyedDocs,
          lastRunMs: summary.ms,
          lastError: ""
        }
      },
      { upsert: true }
    );

    console.log(
      `[cosec sync] ${reason}, ${result.mode}: ${result.punches} punches -> ${result.docs} day records, ` +
        `${dayKeyedDocs} from the COSEC program's own day records, ` +
        `${employees.size} employees (${summary.ms} ms)`
    );
    return summary;
  } catch (error) {
    await SyncState.updateOne(
      { name: STATE_NAME },
      { $set: { lastRunAt: new Date(), lastError: error.message, lastRunMs: Date.now() - startedAt } },
      { upsert: true }
    ).catch(() => {});
    console.error(`[cosec sync] ${reason} failed:`, error.message);
    throw error;
  } finally {
    running = false;
  }
}

async function getSyncStatus() {
  const state = await SyncState.findOne({ name: STATE_NAME }, { _id: 0, __v: 0 }).lean();
  return {
    running,
    database: COSEC_DB_NAME,
    timeZone: TIME_ZONE,
    intervalMinutes: INTERVAL_MINUTES,
    ...(state || {})
  };
}

function startCosecSync() {
  if (timer) return;
  console.log(
    `COSEC punch sync: database "${COSEC_DB_NAME}", every ${INTERVAL_MINUTES} min, times as ${TIME_ZONE}`
  );
  runCosecSync("startup").catch(() => {});
  timer = setInterval(() => runCosecSync("scheduled").catch(() => {}), INTERVAL_MINUTES * 60 * 1000);
}

export { startCosecSync, runCosecSync, getSyncStatus, buildDayRecords, dayRecordsFromDayKeyedDoc, gateDownDays };
