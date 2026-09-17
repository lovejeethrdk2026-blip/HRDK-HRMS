const express = require("express");
const { applyLeave, getLeaves, updateLeaveStatus } = require("../controllers/Leave.controller");

const router = express.Router();

router.get("/", getLeaves);
router.post("/", applyLeave);
router.patch("/:id/status", updateLeaveStatus);

module.exports = router;
