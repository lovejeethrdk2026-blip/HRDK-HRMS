import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isWorkingOn, openExitOf } from "../utils/salaryFormulas.js";

// Employee app passwords. Username = the Employee ID the employee punches
// with (Matrix / COSEC ID, EmployeeProfile.initialsNo). HR sets a first
// password on the Employees panel; on the first login with it the app makes
// the employee choose their own. Only bcrypt hashes are stored
// (collection app_passwords, _id = Employee ID).
//
// HR can turn an employee's app login off (field disabled: true; such a
// document may have no hash). An employee whose exit has passed (left the
// company) is blocked too, without HR doing anything. Both stop a new login
// and every request of an app already logged in (me.controller.js).
//
// An employee with no password yet can still log in with the ID alone while
// EMP_APP_ID_LOGIN=1 (server .env); remove that to require passwords for all.

const passwords = () => mongoose.connection.collection("app_passwords");
const sessions = () => mongoose.connection.collection("app_sessions");
const MIN_LENGTH = 6;
const MAX_TRIES = 5; // wrong passwords in a row before a pause
const PAUSE_MINUTES = 15;

export const passwordOf = (id) => passwords().findOne({ _id: String(id) });

function checkNew(password) {
  const value = String(password ?? "");
  if (value.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (value.length > 64) return "Password is too long";
  return "";
}

// Today as "YYYY-MM-DD" on the server clock.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Left the company: an exit with no rejoin, last working day already past.
export const hasLeft = (profile) => Boolean(profile && openExitOf(profile) && !isWorkingOn(profile, today()));

// Why this Employee ID may not use the app now, or "".
export async function loginBlock(id) {
  const saved = await passwordOf(id);
  if (saved?.disabled) return "Your app login is turned off. Ask HR.";
  const profile = await EmployeeProfile.findOne({ initialsNo: String(id) }, { exits: 1, joiningDate: 1 }).lean();
  if (hasLeft(profile)) return "You have left the company, so the app login is closed.";
  return "";
}

// Login check. Returns "" when the login may go ahead, else the message to show.
export async function checkLogin(id, password) {
  const blocked = await loginBlock(id);
  if (blocked) return blocked;
  const saved = await passwordOf(id);
  if (!saved?.hash) {
    if (process.env.EMP_APP_ID_LOGIN === "1") return "";
    return "HR has not set your app password yet. Ask HR.";
  }
  if (saved.pausedUntil && saved.pausedUntil > new Date()) {
    const minutes = Math.ceil((saved.pausedUntil - new Date()) / 60000);
    return `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  if (!password) return "Enter your password";
  if (await bcrypt.compare(String(password), saved.hash)) {
    if (saved.failCount) await passwords().updateOne({ _id: saved._id }, { $set: { failCount: 0, pausedUntil: null } });
    return "";
  }
  const failCount = (saved.failCount || 0) + 1;
  const pause = failCount >= MAX_TRIES;
  await passwords().updateOne(
    { _id: saved._id },
    { $set: { failCount: pause ? 0 : failCount, pausedUntil: pause ? new Date(Date.now() + PAUSE_MINUTES * 60000) : null } }
  );
  return pause ? `Too many wrong passwords. Try again in ${PAUSE_MINUTES} minutes.` : "Wrong Employee ID or password";
}

// ---------- employee app ----------

// POST /api/me/password { current, next }  The logged-in employee sets their
// own password. The current one is needed when there is one.
export const changeMyPassword = asyncHandler(async (req, res) => {
  const id = req.employeeId;
  const next = String(req.body?.next ?? "");
  const problem = checkNew(next);
  if (problem) return res.status(400).json({ message: problem });
  const saved = await passwordOf(id);
  if (saved?.hash) {
    if (!(await bcrypt.compare(String(req.body?.current ?? ""), saved.hash))) {
      return res.status(400).json({ message: "Current password is wrong" });
    }
    if (await bcrypt.compare(next, saved.hash)) {
      return res.status(400).json({ message: "Choose a new password, not the same one" });
    }
  }
  await passwords().updateOne(
    { _id: String(id) },
    { $set: { hash: await bcrypt.hash(next, 10), mustChange: false, changedAt: new Date(), failCount: 0, pausedUntil: null } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ---------- admin (HR) ----------

async function loginIdOf(req, res) {
  const employee = await EmployeeProfile.findOne({ employeeId: req.params.employeeId }, { initialsNo: 1, name: 1 }).lean();
  if (!employee) {
    res.status(404).json({ message: `Employee ${req.params.employeeId} not found` });
    return null;
  }
  const id = String(employee.initialsNo || "").trim();
  if (!/^\d{1,10}$/.test(id)) {
    res.status(400).json({ message: "This employee has no Employee ID (Matrix ID) to log in with. Add it in Edit details first." });
    return null;
  }
  return id;
}

// GET /api/employees/:employeeId/app-password -> { username, set, mustChange, setAt, changedAt }
export const appPasswordStatus = asyncHandler(async (req, res) => {
  const id = await loginIdOf(req, res);
  if (!id) return;
  const saved = await passwordOf(id);
  res.json({
    username: id,
    set: Boolean(saved?.hash),
    disabled: Boolean(saved?.disabled),
    mustChange: Boolean(saved?.mustChange),
    setAt: saved?.setAt || null,
    changedAt: saved?.changedAt || null
  });
});

// PUT /api/employees/:employeeId/app-password { password }  HR gives a first
// (or new) password. The employee must change it at the next login, and is
// logged out of the app everywhere.
export const setAppPassword = asyncHandler(async (req, res) => {
  const id = await loginIdOf(req, res);
  if (!id) return;
  const password = String(req.body?.password ?? "");
  const problem = checkNew(password);
  if (problem) return res.status(400).json({ message: problem });
  const now = new Date();
  await passwords().updateOne(
    { _id: id },
    {
      $set: { hash: await bcrypt.hash(password, 10), mustChange: true, setAt: now, setBy: req.session?.userId || "", failCount: 0, pausedUntil: null },
      $unset: { changedAt: "" }
    },
    { upsert: true }
  );
  await sessions().deleteMany({ employeeId: id });
  res.json({ username: id, set: true, mustChange: true, setAt: now, changedAt: null });
});

// ---------- admin (HR): App logins page ----------

// A first password HR can read out: 8 letters / digits, no 0/O, 1/l/I.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const generatePassword = () => Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => CHARS[n % CHARS.length]).join("");

// GET /api/employees/app-logins -> [{ username, hasPassword, mustChange, setAt, changedAt, pausedUntil, disabled, disabledAt }]
// Every saved app password (no hashes); the page joins them to the employees.
export const listAppLogins = asyncHandler(async (req, res) => {
  const rows = await passwords()
    .find({}, { projection: { hash: 0 } })
    .toArray();
  res.json(
    rows.map((r) => ({
      username: r._id,
      hasPassword: Boolean(r.hash),
      disabled: Boolean(r.disabled),
      disabledAt: r.disabledAt || null,
      mustChange: Boolean(r.mustChange),
      setAt: r.setAt || null,
      changedAt: r.changedAt || null,
      pausedUntil: r.pausedUntil && r.pausedUntil > new Date() ? r.pausedUntil : null
    }))
  );
});

// POST /api/employees/app-logins/access { employeeIds: [...], disabled: true|false }
// -> { changed: [employeeId], skipped: [{ employeeId, reason }] }
// Turn the app login off (logged out of the app at once) or back on. The
// password is kept, so turning it on again needs no new password.
export const setAppAccess = asyncHandler(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []).map(String))];
  if (!ids.length) return res.status(400).json({ message: "Choose at least one employee" });
  if (ids.length > 2000) return res.status(400).json({ message: "At most 2000 at a time" });
  const disabled = req.body?.disabled === true;
  const employees = await EmployeeProfile.find({ employeeId: { $in: ids } }, { employeeId: 1, initialsNo: 1 }).lean();
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const changed = [];
  const skipped = [];
  const now = new Date();
  for (const employeeId of ids) {
    const username = String(byId.get(employeeId)?.initialsNo || "").trim();
    if (!/^\d{1,10}$/.test(username)) {
      skipped.push({ employeeId, reason: byId.has(employeeId) ? "No Employee ID (Matrix ID)" : "Not found" });
      continue;
    }
    if (disabled) {
      await passwords().updateOne(
        { _id: username },
        { $set: { disabled: true, disabledAt: now, disabledBy: req.session?.userId || "" } },
        { upsert: true }
      );
      await sessions().deleteMany({ employeeId: username });
    } else {
      await passwords().updateOne({ _id: username }, { $unset: { disabled: "", disabledAt: "", disabledBy: "" } });
      // A document that only held the "off" switch has nothing left.
      await passwords().deleteOne({ _id: username, hash: { $exists: false } });
    }
    changed.push(employeeId);
  }
  res.json({ changed, skipped });
});

// POST /api/employees/app-logins/generate { employeeIds: [...] }
// -> { given: [{ employeeId, name, username, password }], skipped: [{ employeeId, reason }] }
// A new first password for each (they must choose their own at the next
// login; logged out of the app). The passwords are in this answer only.
export const generateAppPasswords = asyncHandler(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []).map(String))];
  if (!ids.length) return res.status(400).json({ message: "Choose at least one employee" });
  if (ids.length > 500) return res.status(400).json({ message: "At most 500 at a time" });
  const employees = await EmployeeProfile.find({ employeeId: { $in: ids } }, { employeeId: 1, name: 1, initialsNo: 1 }).lean();
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  const given = [];
  const skipped = [];
  const now = new Date();
  for (const employeeId of ids) {
    const employee = byId.get(employeeId);
    const username = String(employee?.initialsNo || "").trim();
    if (!employee) {
      skipped.push({ employeeId, reason: "Not found" });
      continue;
    }
    if (!/^\d{1,10}$/.test(username)) {
      skipped.push({ employeeId, reason: "No Employee ID (Matrix ID)" });
      continue;
    }
    const password = generatePassword();
    await passwords().updateOne(
      { _id: username },
      {
        $set: { hash: await bcrypt.hash(password, 10), mustChange: true, setAt: now, setBy: req.session?.userId || "", failCount: 0, pausedUntil: null },
        $unset: { changedAt: "" }
      },
      { upsert: true }
    );
    await sessions().deleteMany({ employeeId: username });
    given.push({ employeeId, name: employee.name || "", username, password });
  }
  res.json({ given, skipped });
});
