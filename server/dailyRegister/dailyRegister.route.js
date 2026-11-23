import express from "express";
import {
  getAttendance,
  getLatestAttendance,
  getAttendanceRange,
  getHeadCount,
  getRegisterDepartments,
  getNightShiftStaff,
  setNightShift,
  syncStatus,
  syncNow
} from "./dailyRegister.controller.js";
import { isLoggedIn } from "../middleware/auth.js";

const router = express.Router();

// HRMS sign-in needed: punches of every employee (this server is on the internet).
router.use(isLoggedIn);

// Daily Register.
router.get("/", getAttendance);
router.get("/latest", getLatestAttendance);
router.get("/range", getAttendanceRange); // first/last day that has data
router.get("/headcount", getHeadCount); // employees who punched, per day of a financial year
router.get("/departments", getRegisterDepartments); // COSEC departments, for the Users page

// Night shift staff: their punches are grouped noon to noon (nightShift.js).
router.get("/night-shift", getNightShiftStaff);
router.put("/night-shift/:employeeId", setNightShift);

// COSEC punch sync: how the last run went, and an on-demand run.
router.get("/sync", syncStatus);
router.post("/sync", syncNow);

export default router;
