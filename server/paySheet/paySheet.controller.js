import mongoose from "mongoose";
import { registerScope } from "../dailyRegister/registerScope.js";

// The three Pay Sheet reports are built by the separate Pay Sheet app
// (paysheet-app/backend, read live from BC365). This app only relays them to
// the admin panel, behind admin sign-in -- that backend has no login of its own.
const PAYSHEET_API_URL = (process.env.PAYSHEET_API_URL || "http://localhost:4050").replace(/\/+$/, "");

const SHEETS = {
  1: "/api/pay-sheet",
  2: "/api/pay-sheet-2",
  3: "/api/employee-loans"
};

// A failure that is the Pay Sheet app's, not this server's: answered as 502.
class PaySheetError extends Error {}

// BC365 is slow: a cold month of Pay Sheet 2 can take 5-30 seconds. So every
// answer is kept, in memory and in MongoDB ("paysheet_cache", so a server
// restart keeps it), and handed out at once. One older than FRESH_MS is still
// handed out, and fetched again in the background for the next visit. The
// current financial year is kept fresh in the background (startPaySheetWarmup).
const FRESH_MS = 10 * 60 * 1000;
const cache = new Map(); // "sheet|from|to" -> { at, rows }
const loading = new Map(); // "sheet|from|to" -> promise of a fetch in progress
const store = () => (mongoose.connection.readyState === 1 ? mongoose.connection.collection("paysheet_cache") : null);

// Rows of Pay Sheet 1, 2 or 3 for fromDate..toDate (YYYY-MM-DD).
async function fetchPaySheet(sheet, fromDate, toDate) {
  if (!SHEETS[sheet]) throw new PaySheetError("Unknown pay sheet");

  const key = `${sheet}|${fromDate}|${toDate}`;
  let hit = cache.get(key);
  if (!hit) {
    const saved = await store()
      ?.findOne({ _id: key })
      .catch(() => null);
    if (saved) cache.set(key, (hit = { at: saved.at.getTime(), rows: saved.rows }));
  }
  if (!hit) return loadPaySheet(sheet, fromDate, toDate);
  if (Date.now() - hit.at > FRESH_MS) loadPaySheet(sheet, fromDate, toDate).catch(() => {});
  return hit.rows;
}

// Fetch from the Pay Sheet app and keep the answer; requests for the same
// rows while one is on its way share it.
function loadPaySheet(sheet, fromDate, toDate) {
  const key = `${sheet}|${fromDate}|${toDate}`;
  if (!loading.has(key)) {
    const promise = fetchFromApp(sheet, fromDate, toDate)
      .then(async (rows) => {
        const at = new Date();
        cache.set(key, { at: at.getTime(), rows });
        await store()
          ?.replaceOne({ _id: key }, { at, rows }, { upsert: true })
          .catch(() => {});
        return rows;
      })
      .finally(() => loading.delete(key));
    loading.set(key, promise);
  }
  return loading.get(key);
}

async function fetchFromApp(sheet, fromDate, toDate) {
  const path = SHEETS[sheet];
  let upstream;
  let data;
  try {
    const query = new URLSearchParams({ fromDate, toDate });
    // BC365 can be slow on a cold cache; give it time before giving up.
    upstream = await fetch(`${PAYSHEET_API_URL}${path}?${query}`, {
      signal: AbortSignal.timeout(5 * 60 * 1000)
    });
    data = await upstream.json();
  } catch (error) {
    throw new PaySheetError(
      `Could not reach the Pay Sheet app at ${PAYSHEET_API_URL} -- is it running? (${error.message})`
    );
  }
  if (!upstream.ok || data?.error) {
    const detail = data?.error ? JSON.stringify(data.error) : `status ${upstream.status}`;
    throw new PaySheetError(`Pay Sheet app returned an error: ${detail}`);
  }
  return data;
}

// fromDate..toDate cut at month ends: [[from, to], ...]; the first and last
// pieces keep the range's own start and end. Months that start after today
// (India time) have no payroll yet and are left out.
function monthPieces(fromDate, toDate) {
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pieces = [];
  let [y, m] = fromDate.split("-").map(Number);
  for (;;) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const monthStart = `${month}-01`;
    if (monthStart > toDate || (pieces.length && monthStart > today)) break;
    const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    pieces.push([fromDate > monthStart ? fromDate : monthStart, toDate < monthEnd ? toDate : monthEnd]);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return pieces;
}

// Rows of several pieces folded into one row per employee and salary type,
// amounts added up.
function mergePayRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = `${row.empCode}|${row.initials}|${row.salaryType}`;
    const into = merged.get(key);
    if (!into) {
      merged.set(key, { ...row });
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "number") into[field] = Math.round(((into[field] || 0) + value) * 100) / 100;
    }
  }
  return [...merged.values()];
}

// Pay Sheet 1 or 2 for fromDate..toDate, asked for one month at a time and
// added up per employee and salary type, as the Financial Summary does. Asked
// as one range, BC365 gives wrong totals in two ways: across 31 March it also
// returns the year-end closing entries (a large minus under "(No employee)"),
// and for an employee who moved between Wages and Salary it files a whole
// range's PF / ESI / PT / TDS (which have no separate Wages and Salary
// accounts) under one type. Pay Sheet 3 (loan balances) is not additive, so it
// is never split.
async function fetchPaySheetByMonth(sheet, fromDate, toDate) {
  const pieces = monthPieces(fromDate, toDate);
  if (String(sheet) === "3" || pieces.length <= 1) return fetchPaySheet(sheet, fromDate, toDate);
  // A few months at a time, so BC365 is not hit with a whole year at once.
  const parts = [];
  for (let i = 0; i < pieces.length; i += 4) {
    const batch = pieces.slice(i, i + 4);
    parts.push(...(await Promise.all(batch.map(([from, to]) => fetchPaySheet(sheet, from, to)))));
  }
  return mergePayRows(parts.flatMap((rows) => (Array.isArray(rows) ? rows : [])));
}

// Only the rows of the user's own Daily Register department (registerScope.js):
// a row's BC Initials No. is the employee's Matrix (COSEC) ID. Admin and users
// with no Daily Register department get every row.
async function scopePayRows(req, rows) {
  const scope = await registerScope(req);
  if (!scope || !Array.isArray(rows)) return rows;
  const ids = new Set(scope.ids);
  return rows.filter((row) => ids.has(String(row.initials ?? "").trim()));
}

// GET /api/paysheets/:sheet?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD   (sheet 1, 2 or 3)
// Dates are checked by the route (middleware/validate.js).
async function getPaySheet(req, res) {
  if (!SHEETS[req.params.sheet]) return res.status(404).json({ message: "Unknown pay sheet" });

  try {
    const rows = await fetchPaySheetByMonth(req.params.sheet, req.query.fromDate, req.query.toDate);
    res.json(await scopePayRows(req, rows));
  } catch (error) {
    res.status(error instanceof PaySheetError ? 502 : 500).json({ message: error.message });
  }
}

// Keep the current financial year fresh: every FRESH_MS fetch again what the
// Pay Sheet pages open on (Pay Sheet 1 and 2 month by month, loans for the
// year and for each month), one after another so BC365 is not flooded.
// Opening those pages then never waits on BC365.
async function warmCurrentYear() {
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const fy = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const [from, to] = [`${fy}-04-01`, `${fy + 1}-03-31`];
  const pieces = monthPieces(from, to);
  const jobs = [
    ...pieces.map(([a, b]) => [1, a, b]),
    ...pieces.map(([a, b]) => [2, a, b]),
    [3, from, to],
    ...pieces.map(([a, b]) => [3, a, b])
  ];
  for (const [sheet, a, b] of jobs) {
    await loadPaySheet(sheet, a, b).catch((error) => console.error(`Pay Sheet warm-up ${sheet} ${a}: ${error.message}`));
  }
}

function startPaySheetWarmup() {
  const run = () => warmCurrentYear().catch(() => {});
  // first run once MongoDB and the Pay Sheet app are up
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, FRESH_MS).unref();
}

export { getPaySheet, fetchPaySheet, fetchPaySheetByMonth, scopePayRows, startPaySheetWarmup, PaySheetError };
