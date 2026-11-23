import "dotenv/config";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";

import connectDB from "./config/db.js";
import sessionMiddleware from "./config/session.js";
import compression from "compression";
import { startAttendanceWatcher } from "./dailyRegister/attendanceWatcher.js";
import { warmAttendanceCache } from "./dailyRegister/attendanceCache.js";
import { startCosecSync } from "./dailyRegister/cosecSync.js";
import { startPaySheetApp } from "./paySheet/paySheetApp.js";
import dailyRegisterRoutes from "./dailyRegister/dailyRegister.route.js";
import departmentRoutes from "./department/department.route.js";
import employeeRoutes from "./employee/employee.route.js";
import paySheetRoutes from "./paySheet/paySheet.route.js";
import { startPaySheetWarmup } from "./paySheet/paySheet.controller.js";
import userRoutes from "./users/users.route.js";
import roleRoutes from "./roles/roles.route.js";
import driveRoutes from "./drive/drive.route.js";
import leaveRoutes from "./leave/leave.route.js";
import holidayRoutes from "./holidays/holidays.route.js";
import payrollSettingsRoutes from "./payrollSettings/payrollSettings.route.js";
import appSettingsRoutes from "./appSettings/appSettings.route.js";
import meRoutes from "./portal/me.route.js";
import chatRoutes from "./chat/chat.route.js";
import shiftRoutes from "./shifts/shifts.route.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { trackLastSeen } from "./middleware/lastSeen.js";

const app = express();

// The employee app's API (/api/me) uses login keys, not cookies, so any origin
// may call it (the app's web preview runs on its own port). Everything else
// only from the admin site.
// CLIENT_ORIGIN may list several sites, comma-separated (e.g. local dev and the
// Render admin site). Named sites may send the login cookie (credentials).
const adminOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const adminCors = adminOrigins.length ? cors({ origin: adminOrigins, credentials: true }) : cors({ origin: "*" });
const appCors = cors({ origin: true });
app.use((req, res, next) => (req.path.startsWith("/api/me/") ? appCors : adminCors)(req, res, next));
// gzip: a month of the Daily Register or a year of Pay Sheet is 1-2 MB of
// JSON, about a tenth of that compressed -- matters once deployed.
app.use(compression());
app.use(express.json());
app.use(sessionMiddleware);
// Users page green dot: when each logged-in user was last active.
app.use(trackLastSeen);

app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/attendance", dailyRegisterRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/paysheets", paySheetRoutes);
// Google Drive for employee documents (Users page).
app.use("/api/drive", driveRoutes);
app.use("/api/leave", leaveRoutes);
// Company holidays: Diwali, Holi, 15 August ... (Holidays page).
app.use("/api/holidays", holidayRoutes);
// PF / ESIC / PT rates and switches for the salary formulas (HR only to change).
app.use("/api/payroll-settings", payrollSettingsRoutes);
app.use("/api/app-settings", appSettingsRoutes);
app.use("/api/me", meRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/shifts", shiftRoutes); // Employees > Shift > Shifts tab

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// The built admin app (ADMIN/dist, from `npm run build` in ADMIN), so the
// whole HRMS opens fast from this one port. File names under /assets carry a
// content hash, so browsers may keep them for a year; index.html is always
// re-checked so a new build shows up on the next load.
const adminDist = fileURLToPath(new URL("../ADMIN/dist", import.meta.url));
if (existsSync(path.join(adminDist, "index.html"))) {
  app.use(
    "/assets",
    express.static(path.join(adminDist, "assets"), { immutable: true, maxAge: "365d", fallthrough: false })
  );
  app.use(express.static(adminDist, { index: "index.html", setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
}

// Must come after every route: unknown URLs, then every error passed to next().
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Independent of MongoDB: the Pay Sheet pages read BC365 through that app.
startPaySheetApp();

connectDB()
  .then(() => {
    startAttendanceWatcher();
    // This month's Daily Register read ahead into memory.
    warmAttendanceCache();
    // Raw COSEC punches -> this app's per-day attendance records.
    startCosecSync();
    // Current year's Pay Sheets fetched ahead, so the pages open at once.
    startPaySheetWarmup();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });
