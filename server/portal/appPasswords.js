import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Employee app passwords. Username = the Employee ID the employee punches
// with (Matrix / COSEC ID, EmployeeProfile.initialsNo). HR sets a first
// password on the Employees panel; on the first login with it the app makes
// the employee choose their own. Only bcrypt hashes are stored
// (collection app_passwords, _id = Employee ID).
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

// Login check. Returns "" when the login may go ahead, else the message to show.
export async function checkLogin(id, password) {
  const saved = await passwordOf(id);
  if (!saved) {
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
  if (saved) {
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
    set: Boolean(saved),
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
