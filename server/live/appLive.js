import EmployeeProfile from "../employee/models/EmployeeProfile.js";
import { LeaveApplication } from "../leave/models/Leave.js";

// Live refresh for the employee app (HRDK-EMP-APP), on the Socket.IO channel
// "/app". The app connects with its login key (auth: { token }); each phone
// joins its employee's room ("emp:<Employee ID>", the Matrix / COSEC ID) and
// also hears messages meant for every employee.
//
// Like the admin side, only the kind of change is sent ("changed", { area }):
//   attendance  new punches, holidays, shifts, night shift
//   leave       an application decided / cancelled, leave types, balances
//   chat        HR sent a message
//   profile     HR changed the employee or their documents (lock, delete, ...)
//   payslip     payroll settings
//   settings    Employee App settings (what the app shows)
//   account     login turned off / new password / exit: the app checks its
//               login and goes back to Login if it no longer works
// The app then reloads through /api/me as usual.

let channel = null;
const pending = new Map(); // "room|area" -> timer
const WAIT_MS = { attendance: 5000 };
const DEFAULT_WAIT_MS = 600;

export function startAppLive(io) {
  channel = io.of("/app");
  channel.use(async (socket, next) => {
    try {
      // Loaded here: me.controller.js pulls in most of the server.
      const { employeeOfToken } = await import("../portal/me.controller.js");
      const id = await employeeOfToken(socket.handshake.auth?.token);
      if (!id) return next(new Error("Please log in again"));
      socket.data.employeeId = id;
      next();
    } catch (error) {
      next(error);
    }
  });
  channel.on("connection", (socket) => {
    socket.join(`emp:${socket.data.employeeId}`);
    socket.join("all");
  });
}

function send(room, area) {
  if (!channel || !room || !area) return;
  const key = `${room}|${area}`;
  if (pending.has(key)) return;
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      channel.to(room).emit("changed", { area, at: Date.now() });
    }, WAIT_MS[area] ?? DEFAULT_WAIT_MS)
  );
}

// One employee's phones (id = Matrix ID).
export const notifyEmployee = (id, area) => id && send(`emp:${String(id).trim()}`, area);
// Every phone.
export const notifyAllEmployees = (area) => send("all", area);

// Employee codes (EMP_00012) -> Matrix IDs, the app's login IDs.
async function matrixIdsOf(codes) {
  const list = [...new Set([].concat(codes).filter(Boolean).map(String))];
  if (!list.length) return [];
  const rows = await EmployeeProfile.find({ employeeId: { $in: list } }, { initialsNo: 1 }).lean();
  return rows.map((r) => String(r.initialsNo || "").trim()).filter(Boolean);
}

// After an admin save answered OK (live.js liveSaves): tell the phones it
// concerns. The employee's own saves (/api/me/...) need nothing here.
export async function appSaves(req) {
  if (!channel) return;
  const path = req.originalUrl.split("?")[0];
  const body = req.body || {};
  let m;

  if ((m = path.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/))) return notifyEmployee(decodeURIComponent(m[1]), "chat");

  if (path === "/api/leave/applications") return notifyEmployee(body.employeeId, "leave");
  if ((m = path.match(/^\/api\/leave\/applications\/([^/]+)\//))) {
    const app = await LeaveApplication.findById(m[1], { employeeId: 1 }).lean().catch(() => null);
    return notifyEmployee(app?.employeeId, "leave");
  }
  if (path.startsWith("/api/leave/")) return notifyAllEmployees("leave");

  if (/^\/api\/employees\/app-logins\/(generate|access)$/.test(path)) {
    for (const id of await matrixIdsOf(body.employeeIds)) notifyEmployee(id, "account");
    return;
  }
  if (/^\/api\/employees\/bulk-/.test(path)) {
    notifyAllEmployees("profile");
    if (path.includes("shift")) notifyAllEmployees("attendance");
    return;
  }
  if ((m = path.match(/^\/api\/employees\/([^/]+)(\/[^/]+)?/))) {
    const [id] = await matrixIdsOf(decodeURIComponent(m[1]));
    const what = m[2] || "";
    if (/^\/(app-password|exit|undo-exit|rejoin)$/.test(what)) notifyEmployee(id, "account");
    notifyEmployee(id, "profile");
    return;
  }

  if ((m = path.match(/^\/api\/attendance\/night-shift\/([^/]+)$/))) return notifyEmployee(decodeURIComponent(m[1]), "attendance");
  if (/^\/api\/(holidays|shifts)/.test(path)) return notifyAllEmployees("attendance");
  if (path.startsWith("/api/app-settings")) return notifyAllEmployees("settings");
  if (path.startsWith("/api/payroll-settings")) return notifyAllEmployees("payslip");
}
