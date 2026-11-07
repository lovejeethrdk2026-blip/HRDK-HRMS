import "dotenv/config";

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
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { trackLastSeen } from "./middleware/lastSeen.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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
