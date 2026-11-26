import { Server } from "socket.io";
import sessionMiddleware from "../config/session.js";
import { appSaves, startAppLive } from "./appLive.js";

// Live refresh for the admin app (Socket.IO). The server only says WHAT kind
// of data changed ("attendance", "leave", ...), never the data itself; each
// open admin page that shows that kind reloads it through the normal API, so
// the usual login and department checks still decide what it sees.
//
// Changes come from three places:
// - any successful save on the API (POST / PUT / PATCH / DELETE), by HR on the
//   admin site or by an employee in the app (liveSaves below);
// - new punches written by the COSEC sync (dailyRegister/attendanceWatcher.js);
// - anything else that calls notify(area).
//
// Only logged-in admin users may connect: the handshake carries the same
// session cookie as the API.
//
// The employee app connects to its own channel ("/app", appLive.js) with its
// login key and hears only about its own employee (or about everyone, e.g. a
// new holiday).

let io = null;

// area -> pending timer. Bursts (a bulk save, the sync re-writing many days)
// become one message a little later.
const pending = new Map();
// area -> socket id that made the save, so that tab is not told about its own
// change (it already reloads after saving).
const fromSocket = new Map();
const WAIT_MS = { attendance: 10000 };
const DEFAULT_WAIT_MS = 800;

export function startLive(httpServer, origins) {
  io = new Server(httpServer, {
    cors: { origin: origins.length ? origins : true, credentials: true },
    // Render's free plan sleeps; let the client fall back to polling if a
    // proxy blocks the WebSocket upgrade.
    transports: ["websocket", "polling"]
  });
  io.engine.use(sessionMiddleware);
  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session?.userId) return next(new Error("Please login first"));
    next();
  });
  io.on("connection", (socket) => {
    socket.join("admin");
  });
  startAppLive(io);
  console.log("Live refresh (Socket.IO) ready");
  return io;
}

// Tell every open admin page that this kind of data changed.
export function notify(area, { except } = {}) {
  if (!io || !area) return;
  if (except) fromSocket.set(area, except);
  else fromSocket.delete(area);
  if (pending.has(area)) return;
  pending.set(
    area,
    setTimeout(() => {
      pending.delete(area);
      const skip = fromSocket.get(area);
      fromSocket.delete(area);
      const target = skip ? io.to("admin").except(skip) : io.to("admin");
      target.emit("changed", { area, at: Date.now() });
    }, WAIT_MS[area] ?? DEFAULT_WAIT_MS)
  );
}

// "/api/employees/app-logins/access" -> "employees"; employee app routes
// (/api/me/...) by what the employee changed.
const AREAS = [
  [/^\/api\/me\/(leave)/, "leave"],
  [/^\/api\/me\/(chat|messages)/, "chat"],
  [/^\/api\/me\/(details|documents|profile)/, "employees"],
  [/^\/api\/me\/password/, "employees"],
  [/^\/api\/employees/, "employees"],
  [/^\/api\/attendance/, "attendance"],
  [/^\/api\/leave/, "leave"],
  [/^\/api\/holidays/, "holidays"],
  [/^\/api\/chat/, "chat"],
  [/^\/api\/departments/, "departments"],
  [/^\/api\/shifts/, "employees"],
  [/^\/api\/users/, "users"],
  [/^\/api\/roles/, "users"],
  [/^\/api\/payroll-settings/, "payroll"],
  [/^\/api\/app-settings/, "settings"]
];
// Saves that change nothing others see.
const QUIET = /^\/api\/(users\/(login|logout|logout-all)|me\/auth\/)/;

export function areaOf(path) {
  if (QUIET.test(path)) return "";
  return AREAS.find(([pattern]) => pattern.test(path))?.[1] || "";
}

// Express middleware: after a save answers OK, tell the admin pages.
export function liveSaves(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const area = areaOf(req.originalUrl.split("?")[0]);
    if (area) notify(area, { except: req.get("x-socket-id") || undefined });
    appSaves(req).catch((error) => console.error("App live refresh:", error.message));
  });
  next();
}
