const express = require("express");
const { applyLeave, getLeaves, updateLeaveStatus } = require("../controllers/Leave.controller");
const { requireAdmin, requireAdminUnlessEmployeeScoped } = require("../middleware/requireAdmin");

const router = express.Router();

// Employee portal: own applications (?employeeId=) and applying stay open.
// Listing everyone's applications and approving/rejecting need an admin.
router.get("/", requireAdminUnlessEmployeeScoped, getLeaves);
router.post("/", applyLeave);
router.patch("/:id/status", requireAdmin, updateLeaveStatus);

module.exports = router;
