const express = require("express");
const { getAttendance, getLatestAttendance } = require("../controllers/Attendance.controller");
const { requireAdmin, requireAdminUnlessEmployeeScoped } = require("../middleware/requireAdmin");

const router = express.Router();

// Employee portal reads its own attendance with ?employeeId=; every other
// view (all employees, latest-per-employee) is admin only.
router.get("/", requireAdminUnlessEmployeeScoped, getAttendance);
router.get("/latest", requireAdmin, getLatestAttendance);

module.exports = router;
