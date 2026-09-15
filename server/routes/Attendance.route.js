const express = require("express");
const { getAttendance, getLatestAttendance } = require("../controllers/Attendance.controller");

const router = express.Router();

router.get("/", getAttendance);
router.get("/latest", getLatestAttendance);

module.exports = router;
