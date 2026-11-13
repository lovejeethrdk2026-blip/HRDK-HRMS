import Employee from "../dailyRegister/models/Employee.js";
import { registerScope } from "../dailyRegister/registerScope.js";
import User from "../users/models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { DEFAULT_LEAVE_TYPES, LeaveAdjustment, LeaveApplication, LeaveType } from "./models/Leave.js";
import { clearLeaveCache, fyOf, isIsoDate, leaveDays } from "./leaveDays.js";

// Leave page: leave types, applications (apply -> approve / reject / cancel)
// and each employee's balance per financial year. A user limited to some
// Daily Register departments (Users page) sees and handles only those employees.

const CODE = /^[A-Z][A-Z0-9]{0,5}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

// Wraps a handler so an HttpError answers with its status and message.
const handle = (fn) =>
  asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
      throw error;
    }
  });

async function username(req) {
  const user = await User.findById(req.session.userId, { username: 1 }).lean();
  return user?.username || "";
}

// null (everyone) or a Set of employee IDs this user may handle.
async function scopeIds(req) {
  const scope = await registerScope(req);
  return scope ? new Set(scope.ids) : null;
}

async function allTypes() {
  if (!(await LeaveType.estimatedDocumentCount())) {
    await LeaveType.insertMany(DEFAULT_LEAVE_TYPES).catch(() => {});
  }
  return LeaveType.find({}, { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 }).sort({ createdAt: 1 }).lean();
}

// ---------- leave types ----------

// GET /api/leave/types
export const listTypes = handle(async (req, res) => {
  res.json({ types: await allTypes() });
});

function typeFields(body, { creating }) {
  const fields = {};
  if (creating) {
    fields.code = String(body.code ?? "").trim().toUpperCase();
    if (!CODE.test(fields.code)) fail(400, "Code must be 1-6 letters or digits, e.g. CL");
  }
  if (creating || body.name !== undefined) {
    fields.name = String(body.name ?? "").trim();
    if (!fields.name) fail(400, "Give the leave type a name");
  }
  if (creating || body.yearlyDays !== undefined) {
    fields.yearlyDays = Number(body.yearlyDays ?? 0);
    if (!Number.isFinite(fields.yearlyDays) || fields.yearlyDays < 0 || fields.yearlyDays > 366) {
      fail(400, "Days a year must be between 0 and 366");
    }
  }
  if (body.paid !== undefined) fields.paid = Boolean(body.paid);
  if (body.active !== undefined) fields.active = Boolean(body.active);
  return fields;
}

// POST /api/leave/types { code, name, yearlyDays, paid }
export const createType = handle(async (req, res) => {
  await allTypes();
  const fields = typeFields(req.body || {}, { creating: true });
  if (await LeaveType.exists({ code: fields.code })) fail(409, `There is already a ${fields.code} leave type`);
  await LeaveType.create(fields);
  res.status(201).json({ types: await allTypes() });
});

// PUT /api/leave/types/:code { name?, yearlyDays?, paid?, active? }
export const updateType = handle(async (req, res) => {
  const fields = typeFields(req.body || {}, { creating: false });
  const done = await LeaveType.updateOne({ code: req.params.code }, { $set: fields });
  if (!done.matchedCount) fail(404, `No leave type ${req.params.code}`);
  res.json({ types: await allTypes() });
});

// ---------- employees ----------

// GET /api/leave/employees -> [{ employeeId, name, department, section }],
// the COSEC master's active employees this user may handle.
export const listEmployees = handle(async (req, res) => {
  const ids = await scopeIds(req);
  const rows = await Employee.find(ids ? { employeeId: { $in: [...ids] } } : {}, {
    _id: 0,
    employeeId: 1,
    name: 1,
    department: 1,
    section: 1,
    isActive: 1,
    leavingDate: 1
  }).lean();
  res.json(
    rows
      .filter((row) => row.isActive !== false && !row.leavingDate)
      .map((row) => ({
        employeeId: String(row.employeeId),
        name: row.name || "",
        department: row.department || "",
        section: row.section || ""
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
});

// ---------- applications ----------

// GET /api/leave/applications?status=Pending&employeeId=&from=YYYY-MM-DD&to=YYYY-MM-DD
export const listApplications = handle(async (req, res) => {
  const { status, employeeId, from, to } = req.query;
  const match = {};
  if (status && status !== "All") match.status = status;
  if (employeeId) match.employeeId = String(employeeId);
  if (isIsoDate(to)) match.fromDate = { $lte: to };
  if (isIsoDate(from)) match.toDate = { $gte: from };
  const ids = await scopeIds(req);
  if (ids) match.employeeId = { $in: employeeId ? [...ids].filter((id) => id === String(employeeId)) : [...ids] };
  const rows = await LeaveApplication.find(match, { __v: 0 }).sort({ fromDate: -1, createdAt: -1 }).limit(2000).lean();
  res.json(rows);
});

// Days of `type` this employee has left in financial year `fy`, not counting
// application `exceptId`; Infinity for an unpaid type without a yearly limit.
async function daysLeft(employeeId, type, fy, exceptId) {
  if (!type.paid && !type.yearlyDays) return Infinity;
  const [adjustment, taken] = await Promise.all([
    LeaveAdjustment.findOne({ employeeId, fy, type: type.code }).lean(),
    LeaveApplication.find({
      employeeId,
      type: type.code,
      status: { $in: ["Pending", "Approved"] },
      ...(exceptId && { _id: { $ne: exceptId } })
    }).lean()
  ]);
  const used = taken
    .flatMap((app) => leaveDays(app))
    .filter((day) => fyOf(day.date) === fy)
    .reduce((sum, day) => sum + day.value, 0);
  return type.yearlyDays + (adjustment?.days || 0) - used;
}

// Throws when the days asked for are more than the balance in any financial year they fall in.
async function checkBalance(app, type, exceptId) {
  const byFy = new Map();
  for (const day of leaveDays(app)) byFy.set(fyOf(day.date), (byFy.get(fyOf(day.date)) || 0) + day.value);
  for (const [fy, days] of byFy) {
    const left = await daysLeft(app.employeeId, type, fy, exceptId);
    if (days > left) {
      fail(400, `${app.name || app.employeeId} has ${Math.max(0, left)} ${type.code} left in FY ${fy}-${String(fy + 1).slice(2)}, but this needs ${days}`);
    }
  }
}

// POST /api/leave/applications { employeeId, type, fromDate, toDate, halfDay, reason }
export const applyLeave = handle(async (req, res) => {
  const body = req.body || {};
  const employeeId = String(body.employeeId ?? "").trim();
  const { fromDate, reason = "" } = body;
  const toDate = body.toDate || fromDate;
  const halfDay = Boolean(body.halfDay);

  if (!employeeId) fail(400, "Pick the employee");
  const ids = await scopeIds(req);
  if (ids && !ids.has(employeeId)) fail(403, "This employee is outside your department");
  const employee = await Employee.findOne({ employeeId }, { _id: 0, name: 1, department: 1, section: 1 }).lean();
  if (!employee) fail(404, `No employee ${employeeId}`);

  const type = (await allTypes()).find((t) => t.code === body.type);
  if (!type || !type.active) fail(400, "Pick a leave type");
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) fail(400, "Pick the From and To dates");
  if (toDate < fromDate) fail(400, "To date is before the From date");
  if (halfDay && toDate !== fromDate) fail(400, "A half day is one date: From and To must be the same");
  if (!String(reason).trim()) fail(400, "Write the reason");

  const app = {
    employeeId,
    name: employee.name || "",
    department: employee.department || "",
    section: employee.section || "",
    type: type.code,
    fromDate,
    toDate,
    halfDay,
    reason: String(reason).trim()
  };
  app.days = leaveDays(app).reduce((sum, day) => sum + day.value, 0);
  if (!app.days) fail(400, "Those dates are all Sundays: no leave needed");

  const clash = await LeaveApplication.findOne({
    employeeId,
    status: { $in: ["Pending", "Approved"] },
    fromDate: { $lte: toDate },
    toDate: { $gte: fromDate }
  }).lean();
  if (clash) {
    fail(409, `${app.name} already has ${clash.type} (${clash.status}) from ${clash.fromDate} to ${clash.toDate}`);
  }
  await checkBalance(app, type);

  const created = await LeaveApplication.create({ ...app, appliedBy: await username(req) });
  res.status(201).json(created);
});

async function findInScope(req) {
  const app = await LeaveApplication.findById(req.params.id).catch(() => null);
  if (!app) fail(404, "No such leave application");
  const ids = await scopeIds(req);
  if (ids && !ids.has(app.employeeId)) fail(403, "This employee is outside your department");
  return app;
}

// POST /api/leave/applications/:id/decision { status: "Approved" | "Rejected", remarks }
export const decideLeave = handle(async (req, res) => {
  const { status, remarks = "" } = req.body || {};
  if (!["Approved", "Rejected"].includes(status)) fail(400, "Status must be Approved or Rejected");
  const app = await findInScope(req);
  if (app.status !== "Pending") fail(409, `This application is already ${app.status}`);
  if (status === "Approved") {
    const type = (await allTypes()).find((t) => t.code === app.type);
    if (type) await checkBalance(app.toObject(), type, app._id);
  }
  app.status = status;
  app.remarks = String(remarks).trim();
  app.decidedBy = await username(req);
  app.decidedAt = new Date();
  await app.save();
  clearLeaveCache();
  res.json(app);
});

// POST /api/leave/applications/:id/cancel { remarks }
export const cancelLeave = handle(async (req, res) => {
  const app = await findInScope(req);
  if (!["Pending", "Approved"].includes(app.status)) fail(409, `This application is already ${app.status}`);
  app.status = "Cancelled";
  app.remarks = String(req.body?.remarks ?? "").trim() || app.remarks;
  app.decidedBy = await username(req);
  app.decidedAt = new Date();
  await app.save();
  clearLeaveCache();
  res.json(app);
});

// ---------- balances ----------

// GET /api/leave/balances?fy=2026 -> { fy, types, rows: [{ employeeId, name,
// department, section, balances: { CL: { quota, adjust, used, pending, left } } }] }
// (left: null for an unpaid type with no yearly limit).
export const listBalances = handle(async (req, res) => {
  const fy = Number(req.query.fy) || fyOf(new Date().toISOString().slice(0, 10));
  const ids = await scopeIds(req);
  const idFilter = ids ? { employeeId: { $in: [...ids] } } : {};
  const fyStart = `${fy}-04-01`;
  const fyEnd = `${fy + 1}-03-31`;

  const [types, employees, apps, adjustments] = await Promise.all([
    allTypes(),
    Employee.find(idFilter, { _id: 0, employeeId: 1, name: 1, department: 1, section: 1, isActive: 1, leavingDate: 1 }).lean(),
    LeaveApplication.find({
      ...idFilter,
      status: { $in: ["Pending", "Approved"] },
      fromDate: { $lte: fyEnd },
      toDate: { $gte: fyStart }
    }).lean(),
    LeaveAdjustment.find({ ...idFilter, fy }).lean()
  ]);

  const used = new Map(); // "id|CL|Approved" -> days
  for (const app of apps) {
    const days = leaveDays(app)
      .filter((day) => fyOf(day.date) === fy)
      .reduce((sum, day) => sum + day.value, 0);
    const key = `${app.employeeId}|${app.type}|${app.status}`;
    used.set(key, (used.get(key) || 0) + days);
  }
  const adjust = new Map(adjustments.map((a) => [`${a.employeeId}|${a.type}`, a]));

  const rows = employees
    .filter((e) => e.isActive !== false && !e.leavingDate)
    .map((e) => {
      const id = String(e.employeeId);
      const balances = {};
      for (const type of types) {
        const extra = adjust.get(`${id}|${type.code}`);
        const taken = used.get(`${id}|${type.code}|Approved`) || 0;
        const pending = used.get(`${id}|${type.code}|Pending`) || 0;
        const limited = type.paid || type.yearlyDays > 0;
        balances[type.code] = {
          quota: type.yearlyDays,
          adjust: extra?.days || 0,
          note: extra?.note || "",
          used: taken,
          pending,
          left: limited ? type.yearlyDays + (extra?.days || 0) - taken - pending : null
        };
      }
      return { employeeId: id, name: e.name || "", department: e.department || "", section: e.section || "", balances };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ fy, types, rows });
});

// PUT /api/leave/adjustments { employeeId, fy, type, days, note }: sets (not adds) the adjustment.
export const setAdjustment = handle(async (req, res) => {
  const { employeeId, fy, type, days, note = "" } = req.body || {};
  const id = String(employeeId ?? "");
  const year = Number(fy);
  const value = Number(days);
  if (!id) fail(400, "Pick the employee");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, "Pick the financial year");
  if (!Number.isFinite(value) || Math.abs(value) > 366 || (value * 2) % 1) fail(400, "Days must be a number like 3 or -1.5");
  if (!(await allTypes()).some((t) => t.code === type)) fail(400, "Pick a leave type");
  const ids = await scopeIds(req);
  if (ids && !ids.has(id)) fail(403, "This employee is outside your department");
  await LeaveAdjustment.updateOne(
    { employeeId: id, fy: year, type },
    { $set: { days: value, note: String(note).trim(), updatedBy: await username(req) } },
    { upsert: true }
  );
  res.json({ ok: true });
});
