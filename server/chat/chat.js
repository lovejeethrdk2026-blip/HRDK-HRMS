import mongoose from "mongoose";
import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import User from "../users/models/User.js";
import { accessFor } from "../roles/roles.controller.js";
import { isWorkingOn, openExitOf } from "../utils/salaryFormulas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Chat between an employee (HRDK app) and their manager (ADMIN website), with
// HR able to read and answer every chat.
//
//   HR (admin, or a role with "chat.all")  -> every employee's chat
//   manager (a login with "chat.team")     -> only employees whose Reporting
//                                             manager is the login's managerName
//                                             (Users page)
//   employee (app)                         -> their own chat only
//
// One thread per employee, keyed by the Matrix ID the app logs in with
// (profile's Initials No., else its employee code).

const messageSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    from: { type: String, enum: ["employee", "manager", "hr"], required: true },
    senderName: { type: String, default: "" },
    text: { type: String, required: true },
    readByEmployee: { type: Boolean, default: false },
    readByStaff: { type: Boolean, default: false }
  },
  { timestamps: true, collection: "chat_messages" }
);
messageSchema.index({ employeeId: 1, createdAt: 1 });
export const ChatMessage = mongoose.model("ChatMessage", messageSchema);

const MAX_TEXT = 2000;

// HR (admin logins) sees and answers every chat. A manager login sees only
// its own staff -- employees whose Reporting manager is its "Manager name for
// chat" -- and only when HR has given its role "Chat with their own team" on
// the Roles page. Seeing every chat is never a role permission, so it can't
// be handed to a manager by mistake.
const MANAGER_CHAT = true;
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const active = (p) => !openExitOf(p) || isWorkingOn(p, today());
export const chatIdOf = (p) => String(p.initialsNo || p.employeeId || "").trim();

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
      throw error;
    }
  });

function cleanText(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) fail(400, "Write a message");
  if (text.length > MAX_TEXT) fail(400, `A message can be at most ${MAX_TEXT} characters`);
  return text;
}

// ---------- staff side (ADMIN website, signed-in users) ----------

// Who is asking: { all, managerName, name } or 403.
async function staffOf(req) {
  if (!req.session?.userId) fail(401, "Please login first");
  const user = await User.findById(req.session.userId, { username: 1, role: 1, managerName: 1 }).lean();
  if (!user) fail(401, "Please login first");
  const { permissions } = await accessFor(user.role);
  const all = user.role === "admin";
  if (!all && !(MANAGER_CHAT && permissions.includes("chat.team"))) {
    fail(403, MANAGER_CHAT ? "You are not allowed to use chat" : "Chat is between HR and employees only for now");
  }
  return { all, managerName: clean(user.managerName), name: user.username };
}

// Active employees this staff member may chat with: [{ id, name, department, subDepartment, manager }].
export async function employeesFor(staff) {
  const filter = staff.all ? {} : { reportingManager: { $exists: true } };
  // Whole records (less files) so the shared exit rules see every date they use.
  const profiles = await EmployeeProfile.find(filter, { documents: 0, selfCorrection: 0 }).lean();
  return profiles
    .filter(active)
    .filter((p) => staff.all || (staff.managerName && clean(p.reportingManager) === staff.managerName))
    .map((p) => ({
      id: chatIdOf(p),
      name: clean(p.name),
      department: p.department || "",
      subDepartment: p.subDepartment || "",
      manager: clean(p.reportingManager)
    }))
    .filter((e) => e.id);
}

// GET /api/chat/threads -> { scope, managerName, threads: [{ employeeId, name, department,
//   subDepartment, manager, last: { text, from, at }, unread }] }, newest chat first,
//   then everyone else in the team by name.
export const listThreads = handle(async (req, res) => {
  const staff = await staffOf(req);
  const employees = await employeesFor(staff);
  const ids = employees.map((e) => e.id);
  const summary = await ChatMessage.aggregate([
    { $match: { employeeId: { $in: ids } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: "$employeeId",
        text: { $last: "$text" },
        from: { $last: "$from" },
        at: { $last: "$createdAt" },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ["$from", "employee"] }, { $eq: ["$readByStaff", false] }] }, 1, 0] } }
      }
    }
  ]);
  const byId = new Map(summary.map((s) => [s._id, s]));
  const threads = employees
    .map((e) => {
      const s = byId.get(e.id);
      return {
        employeeId: e.id,
        name: e.name,
        department: e.department,
        subDepartment: e.subDepartment,
        manager: e.manager,
        last: s ? { text: s.text, from: s.from, at: s.at } : null,
        unread: s?.unread || 0
      };
    })
    .sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0) || a.name.localeCompare(b.name));
  res.json({ scope: staff.all ? "all" : "team", managerName: staff.managerName, threads });
});

async function threadFor(staff, employeeId) {
  const employee = (await employeesFor(staff)).find((e) => e.id === String(employeeId));
  if (!employee) fail(403, "This employee is not in your team");
  return employee;
}

// GET /api/chat/threads/:employeeId/messages -> { employee, messages }; marks
// the employee's messages read by staff.
export const getThread = handle(async (req, res) => {
  const staff = await staffOf(req);
  const employee = await threadFor(staff, req.params.employeeId);
  const messages = await ChatMessage.find({ employeeId: employee.id }, { __v: 0 }).sort({ createdAt: 1 }).limit(500).lean();
  await ChatMessage.updateMany({ employeeId: employee.id, from: "employee", readByStaff: false }, { $set: { readByStaff: true } });
  res.json({ employee, messages });
});

// POST /api/chat/threads/:employeeId/messages { text } -- from the manager, or
// "hr" when an HR / admin login answers someone else's team.
export const sendStaffMessage = handle(async (req, res) => {
  const staff = await staffOf(req);
  const employee = await threadFor(staff, req.params.employeeId);
  const text = cleanText(req.body?.text);
  const asManager = MANAGER_CHAT && staff.managerName && employee.manager === staff.managerName;
  const message = await ChatMessage.create({
    employeeId: employee.id,
    from: asManager ? "manager" : "hr",
    senderName: asManager ? staff.managerName : `HR (${staff.name})`,
    text,
    readByStaff: true
  });
  res.status(201).json(message);
});

// GET /api/chat/unread -> { unread } for the ADMIN menu badge.
export const unreadCount = handle(async (req, res) => {
  const staff = await staffOf(req);
  const ids = (await employeesFor(staff)).map((e) => e.id);
  const unread = await ChatMessage.countDocuments({ employeeId: { $in: ids }, from: "employee", readByStaff: false });
  res.json({ unread });
});

// ---------- employee side (HRDK app, /api/me/chat) ----------

async function profileOf(id) {
  return EmployeeProfile.findOne({ $or: [{ initialsNo: id }, { employeeId: id }] }, { _id: 0, initialsNo: 1, employeeId: 1, reportingManager: 1 }).lean();
}

// GET /api/me/chat -> { manager, messages }; marks staff messages read.
export const myChat = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  const id = p ? chatIdOf(p) : req.employeeId;
  const messages = await ChatMessage.find({ employeeId: id }, { __v: 0, readByStaff: 0 }).sort({ createdAt: 1 }).limit(500).lean();
  await ChatMessage.updateMany({ employeeId: id, from: { $ne: "employee" }, readByEmployee: false }, { $set: { readByEmployee: true } });
  res.json({ manager: clean(p?.reportingManager), messages });
});

// POST /api/me/chat { text }
export const sendMyMessage = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  if (!p) fail(404, "HR has not created your full profile yet, so chat is not ready. Ask HR.");
  const text = cleanText(req.body?.text);
  const message = await ChatMessage.create({
    employeeId: chatIdOf(p),
    from: "employee",
    senderName: "",
    text,
    readByEmployee: true
  });
  res.status(201).json(message);
});

// GET /api/me/chat/unread -> { unread } for the app's Chat badge.
export const myUnread = handle(async (req, res) => {
  const p = await profileOf(req.employeeId);
  const id = p ? chatIdOf(p) : req.employeeId;
  res.json({ unread: await ChatMessage.countDocuments({ employeeId: id, from: { $ne: "employee" }, readByEmployee: false }) });
});
