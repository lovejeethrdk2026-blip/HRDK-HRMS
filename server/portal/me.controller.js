import crypto from "node:crypto";
import mongoose from "mongoose";
import Employee from "../dailyRegister/models/Employee.js";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { monthRecords } from "../dailyRegister/attendanceCache.js";
import { applyNightShift } from "../dailyRegister/nightShift.js";
import { employeeShifts } from "../dailyRegister/employeeShifts.js";
import { approvedLeaveDays } from "../leave/leaveDays.js";
import { applyLeave, cancelLeave, listBalances, listTypes } from "../leave/leave.controller.js";
import { LeaveApplication } from "../leave/models/Leave.js";
import { PaySheetError } from "../paySheet/paySheet.controller.js";
import { finishedMonths, payslipOf } from "./monthPay.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { appFeatures } from "../appSettings/appSettings.route.js";
import * as stats from "../../ADMIN/src/utils/attendanceStats.js";
import { buildPayslipPdf } from "./payslipPdf.js";
import { checkLogin, loginBlock, passwordOf } from "./appPasswords.js";
import { sendDocument } from "../employee/employeeDocuments.js";

// The employee app (HRDK-EMP-APP): every route works on the logged-in
// employee only, taken from the login key -- never from the request.
// The employee is identified by the Matrix (COSEC) ID, the same ID the Daily
// Register and the Pay Sheet rows ("initials") use.
//
// Login for now: Employee ID only (EMP_APP_ID_LOGIN=1 in server/.env), until
// OTP / password login is set up. Anyone who knows an ID can then log in as
// that employee, so keep it to the office network.

const SESSION_DAYS = 30;
const sessions = () => mongoose.connection.collection("app_sessions");
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const pad = (n) => String(n).padStart(2, "0");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const handle = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
      if (error instanceof PaySheetError) return res.status(502).json({ message: "Payslips are not available right now" });
      throw error;
    }
  });

// ---------- who ----------

async function employeeFor(id) {
  const master = await Employee.findOne(
    { employeeId: id },
    { _id: 0, employeeId: 1, name: 1, department: 1, section: 1, isActive: 1, leavingDate: 1 }
  ).lean();
  if (!master) return null;
  const profile = await EmployeeProfile.findOne(
    { $or: [{ initialsNo: id }, { employeeId: id }] },
    { _id: 0, employeeId: 1, designation: 1, joiningDate: 1, reportingManager: 1, mobile: 1, shift: 1, subDepartment: 1 }
  ).lean();
  const mobile = String(profile?.mobile || "");
  const password = await passwordOf(id);
  return {
    employeeId: id,
    code: profile?.employeeId || "",
    name: master.name || "",
    department: master.department || "",
    section: master.section || profile?.subDepartment || "",
    designation: profile?.designation || "",
    joiningDate: profile?.joiningDate || "",
    reportingManager: profile?.reportingManager || "",
    mobile: mobile.length >= 4 ? `${mobile.slice(0, 2)}xxxxxx${mobile.slice(-2)}` : "",
    shift: profile?.shift?.in && profile?.shift?.out ? profile.shift : null,
    active: master.isActive !== false && !master.leavingDate,
    // App login: hasPassword false = ID-only so far; mustChangePassword true =
    // still on the password HR gave, the app asks for a new one first.
    hasPassword: Boolean(password?.hash),
    mustChangePassword: Boolean(password?.mustChange),
    // What HR lets the app show (Employee App settings).
    features: await appFeatures()
  };
}

// Login key -> the employee's ID, or "" (expired, logged out, login turned
// off, left the company). For the app's live-refresh socket (live/live.js).
export async function employeeOfToken(token) {
  if (!token) return "";
  const session = await sessions().findOne({ _id: hash(String(token)) });
  if (!session || session.expiresAt < new Date()) return "";
  if (await loginBlock(session.employeeId)) return "";
  return session.employeeId;
}

// Bearer token -> req.employeeId, or 401.
export const requireEmployee = handle(async (req, res, next) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) fail(401, "Please log in");
  const session = await sessions().findOne({ _id: hash(token) });
  if (!session || session.expiresAt < new Date()) fail(401, "Please log in again");
  // Login turned off by HR, or left the company: out of the app at once.
  const blocked = await loginBlock(session.employeeId);
  if (blocked) {
    await sessions().deleteMany({ employeeId: session.employeeId });
    fail(401, blocked);
  }
  req.employeeId = session.employeeId;
  next();
});

// POST /api/me/auth/login { employeeId, password } -> { accessToken, refreshToken, employee }
// Password: the one HR gave (first time) or the employee's own
// (portal/appPasswords.js). No password set yet: ID alone, while
// EMP_APP_ID_LOGIN=1.
export const login = handle(async (req, res) => {
  const id = String(req.body?.employeeId ?? "").trim();
  if (!/^\d{1,10}$/.test(id)) fail(400, "Enter your Employee ID");
  const employee = await employeeFor(id);
  if (!employee || !employee.active) fail(404, "No active employee with this ID");
  const problem = await checkLogin(id, req.body?.password);
  if (problem) fail(401, problem);
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  await sessions().insertOne({
    _id: hash(token),
    employeeId: id,
    device: req.body?.device || {},
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400000)
  });
  res.json({ accessToken: token, refreshToken: token, employee });
});

// POST /api/me/auth/logout
export const logout = handle(async (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) await sessions().deleteOne({ _id: hash(token) });
  res.json({ ok: true });
});

// GET /api/me/profile
export const profile = handle(async (req, res) => {
  const employee = await employeeFor(req.employeeId);
  if (!employee) fail(404, "Employee not found");
  res.json(employee);
});

// ---------- attendance ----------

// GET /api/me/attendance?month=YYYY-MM -> { month, shift, days: [...] }, one
// entry per day up to today: status P (present), H (half day), A (absent),
// L (leave), WO (Sunday off), with punches and the register's figures.
export const attendance = handle(async (req, res) => {
  const month = String(req.query.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, "month=YYYY-MM is required");
  const [y, m] = month.split("-");
  const id = req.employeeId;

  const own = (await monthRecords(m, y)).filter((r) => String(r.ID) === id);
  const [records, shifts, leave] = await Promise.all([applyNightShift(own), employeeShifts(), approvedLeaveDays()]);
  const shift = shifts.get(id) || null;
  const byDate = new Map(records.map((r) => [r.Date, { ...r, ...(shift && { shift }) }]));

  const now = new Date(Date.now() + 5.5 * 3600000); // India time
  const todayIso = now.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${pad(d)}`;
    if (iso > todayIso) break;
    const display = `${pad(d)}-${m}-${y}`;
    const doc = byDate.get(display);
    const onLeave = leave.get(`${id}|${display}`);
    const sunday = new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
    const day = { date: iso };
    if (onLeave) day.leave = { type: onLeave.type, half: onLeave.half };

    if (!doc || !stats.pairsOf(doc).length) {
      day.status = onLeave && !onLeave.half ? "L" : sunday ? "WO" : iso === todayIso ? "-" : "A";
      days.push(day);
      continue;
    }

    const total = stats.totalWorking(doc);
    const pairs = stats.pairsOf(doc);
    const first = pairs.find((p) => p.IN)?.IN || pairs[0].OUT;
    const lastPunch = stats.lastPunch(doc);
    day.in = stats.hhmm(first);
    day.out = lastPunch?.type === "OUT" ? stats.hhmm(lastPunch.time) : "";
    day.worked = stats.totalWorkingText(doc);
    day.late = stats.lateText(doc);
    day.earlyOut = stats.earlyOutText(doc);
    day.outside = stats.outsideText(doc);
    day.missed = stats.missedText(doc);
    day.source = stats.directionKnown(doc) ? "machine" : "guess";
    // ENTRY -> EXIT pairs as "HH:mm" ("" where a punch is missing), for the
    // app's day timeline.
    day.pairs = pairs.map((p) => ({ in: stats.hhmm(p.IN) || "", out: stats.hhmm(p.OUT) || "" }));
    const halfDay = total.seconds < stats.fullDaySeconds(doc) / 2 && !total.open;
    day.status = onLeave?.half || (halfDay && iso !== todayIso) ? "H" : "P";
    days.push(day);
  }
  // Punch times switched off (Employee App settings): status and worked
  // hours only.
  if (!(await appFeatures()).punchTimes) {
    for (const day of days) {
      for (const key of ["in", "out", "pairs", "late", "earlyOut", "outside", "missed", "source"]) delete day[key];
    }
  }
  res.json({ month, shift, days });
});

// ---------- leave ----------

// Runs an admin leave handler for this employee and returns what it answered.
function run(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200,
      status(code) {
        this.code = code;
        return this;
      },
      json(data) {
        if (this.code >= 400) reject(new HttpError(this.code, data?.message || "Request failed"));
        else resolve(data);
      }
    };
    handler({ session: {}, query: {}, body: {}, params: {}, headers: {}, ...req }, res, reject);
  });
}

const currentFy = () => {
  const d = new Date(Date.now() + 5.5 * 3600000);
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
};

// GET /api/me/leave -> { fy, types, balances, applications }
export const leave = handle(async (req, res) => {
  const fy = currentFy();
  const [{ types }, balances, applications] = await Promise.all([
    run(listTypes, {}),
    run(listBalances, { query: { fy: String(fy) } }),
    LeaveApplication.find({ employeeId: req.employeeId }, { __v: 0 }).sort({ fromDate: -1 }).limit(100).lean()
  ]);
  const mine = balances.rows.find((row) => row.employeeId === req.employeeId);
  res.json({ fy, types: types.filter((t) => t.active), balances: mine?.balances || {}, applications });
});

// POST /api/me/leave { type, fromDate, toDate, halfDay, reason } -> Pending,
// shown on the ADMIN Leave page for approval.
export const applyMyLeave = handle(async (req, res) => {
  const { type, fromDate, toDate, halfDay, reason } = req.body || {};
  const created = await run(applyLeave, {
    body: { employeeId: req.employeeId, type, fromDate, toDate, halfDay, reason }
  });
  await LeaveApplication.updateOne({ _id: created._id }, { $set: { appliedBy: "employee app" } });
  res.status(201).json({ ...created, appliedBy: "employee app" });
});

// POST /api/me/leave/:id/cancel -- only the employee's own Pending request.
export const cancelMyLeave = handle(async (req, res) => {
  const app = await LeaveApplication.findById(req.params.id).catch(() => null);
  if (!app || app.employeeId !== req.employeeId) fail(404, "Leave request not found");
  if (app.status !== "Pending") fail(409, `This request is already ${app.status}. Ask HR to change it.`);
  res.json(await run(cancelLeave, { params: { id: req.params.id }, body: { remarks: "Cancelled by employee" } }));
});

// ---------- payslips (portal/monthPay.js) ----------
// The salary the app shows is the full monthly split from Add Employee >
// Joining & pay (that month's CTC, the employee's pay version). No Matrix
// punch days, no BC365.

const profileFor = (id) => EmployeeProfile.findOne({ $or: [{ initialsNo: id }, { employeeId: id }] }).lean();

// GET /api/me/payslips -> [{ month, net, released }] finished months, newest first
export const payslips = handle(async (req, res) => {
  const profile = await profileFor(req.employeeId);
  if (!profile) return res.json([]);
  const result = [];
  for (const month of finishedMonths(profile)) {
    const slip = payslipOf(profile, month);
    if (slip) result.push({ month, net: slip.net, released: true });
  }
  res.json(result);
});

// GET /api/me/payslips/:month -> { month, days, earnings, deductions, totalEarnings, totalDeductions, net }
export const payslip = handle(async (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, "Month must be YYYY-MM");
  res.json(await payslipData(req.employeeId, month));
});

// One month's payslip figures, for the app screen and the PDF.
async function payslipData(id, month) {
  const profile = await profileFor(id);
  if (!profile) fail(404, "HR has not created your full profile yet. Ask HR.");
  const slip = payslipOf(profile, month);
  if (!slip) fail(404, "No payslip for this month");
  return slip;
}

// ---------- payslip PDF ----------
// The app opens the PDF in the phone's browser, which can't send the login
// key, so it first asks for a signed link that works for 10 minutes.

const signOf = (payload) => {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) fail(500, "SESSION_SECRET is not set on the server");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
};

// GET /api/me/payslips/:month/pdf-link -> { path: "/api/me/payslip-pdf/<token>" }
export const payslipPdfLink = handle(async (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, "Month must be YYYY-MM");
  const payload = Buffer.from(JSON.stringify({ e: req.employeeId, m: month, x: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  res.json({ path: `/api/me/payslip-pdf/${payload}.${signOf(payload)}` });
});

// GET /api/me/payslip-pdf/:token  (no login key: the signed token is the proof)
export const payslipPdf = handle(async (req, res) => {
  const [payload, sig] = String(req.params.token || "").split(".");
  const expected = payload ? signOf(payload) : "";
  const good = sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!good) fail(403, "This download link is not valid. Open the payslip again in the app.");
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    fail(403, "This download link is not valid.");
  }
  if (!data?.x || data.x < Date.now()) fail(410, "This download link has expired. Open the payslip again in the app.");
  if (!(await appFeatures()).salary) fail(403, "Salary is switched off in the app. Ask HR.");
  const slip = await payslipData(String(data.e), String(data.m));
  const profile = await EmployeeProfile.findOne({ $or: [{ initialsNo: String(data.e) }, { employeeId: String(data.e) }] }).lean();
  const bytes = await buildPayslipPdf(slip, profile || { employeeId: data.e });
  const name = `${profile?.employeeId || data.e}_Payslip_${String(data.m).replace("-", "_")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(Buffer.from(bytes));
});

// ---------- documents (list only for now) ----------

// GET /api/me/documents -> [{ id, name, category, uploadedAt }]
export const documents = handle(async (req, res) => {
  const p = await EmployeeProfile.findOne(
    { $or: [{ initialsNo: req.employeeId }, { employeeId: req.employeeId }] },
    { _id: 0, documents: 1 }
  ).lean();
  res.json(
    (p?.documents || []).map((doc) => ({
      id: doc.id,
      name: doc.title || doc.originalName || doc.fileName,
      category: /letter/i.test(doc.title) ? "Letters" : "Documents",
      mimeType: doc.mimeType || "",
      uploadedAt: doc.uploadedAt
    }))
  );
});

// The logged-in employee's own document, or a 404.
async function myDocument(employeeId, documentId) {
  const p = await EmployeeProfile.findOne({ $or: [{ initialsNo: employeeId }, { employeeId }] });
  const doc = p?.documents?.find((d) => d.id === documentId);
  if (!doc) fail(404, "Document not found");
  return { p, doc };
}

// GET /api/me/documents/:id/link -> { path: "/api/me/document-file/<token>" }
// A signed 10-minute link: the app shows images full screen from it and opens
// PDFs / Excel in the phone's browser.
export const documentLink = handle(async (req, res) => {
  await myDocument(req.employeeId, req.params.id);
  const payload = Buffer.from(JSON.stringify({ e: req.employeeId, d: req.params.id, x: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  res.json({ path: `/api/me/document-file/${payload}.${signOf(payload)}` });
});

// GET /api/me/document-file/:token  (no login key: the signed token is the proof)
export const documentByLink = handle(async (req, res) => {
  const [payload, sig] = String(req.params.token || "").split(".");
  const expected = payload ? signOf(payload) : "";
  const good = sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!good) fail(403, "This link is not valid. Open the document again in the app.");
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    fail(403, "This link is not valid.");
  }
  if (!data?.x || data.x < Date.now()) fail(410, "This link has expired. Open the document again in the app.");
  if (!(await appFeatures()).documents) fail(403, "Documents are switched off in the app. Ask HR.");
  const { p, doc } = await myDocument(String(data.e), String(data.d));
  await sendDocument(res, p, doc, false);
});
