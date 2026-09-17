const Leave = require("../models/Leave");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Inclusive calendar-day count between two "YYYY-MM-DD" dates.
function dayCount(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

async function applyLeave(req, res) {
  try {
    const { employeeId, name, leaveType, fromDate, toDate, halfDay, reason } = req.body;

    if (!employeeId || !leaveType || !fromDate || !toDate || !reason?.trim()) {
      return res
        .status(400)
        .json({ message: "employeeId, leaveType, fromDate, toDate and reason are required" });
    }

    if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
      return res.status(400).json({ message: "Dates must be in YYYY-MM-DD format" });
    }

    if (toDate < fromDate) {
      return res.status(400).json({ message: "To date cannot be before from date" });
    }

    const isHalfDay = Boolean(halfDay);
    if (isHalfDay && fromDate !== toDate) {
      return res.status(400).json({ message: "Half day leave must start and end on the same date" });
    }

    // Block overlapping with an existing pending/approved application.
    const overlap = await Leave.findOne({
      employeeId: String(employeeId),
      status: { $in: ["Pending", "Approved"] },
      fromDate: { $lte: toDate },
      toDate: { $gte: fromDate }
    }).lean();

    if (overlap) {
      return res.status(409).json({
        message: `You already have a ${overlap.status.toLowerCase()} leave from ${overlap.fromDate} to ${overlap.toDate}`
      });
    }

    const leave = await Leave.create({
      employeeId: String(employeeId),
      name: name || "",
      leaveType,
      fromDate,
      toDate,
      halfDay: isHalfDay,
      days: isHalfDay ? 0.5 : dayCount(fromDate, toDate),
      reason: reason.trim()
    });

    res.status(201).json(leave);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
}

// ?employeeId= for one employee's applications, ?status= to filter; newest first.
async function getLeaves(req, res) {
  try {
    const { employeeId, status } = req.query;

    const match = {};
    if (employeeId) match.employeeId = String(employeeId);
    if (status) match.status = status;

    const leaves = await Leave.find(match).sort({ createdAt: -1 }).limit(500).lean();
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Admin: approve or reject an application. Body: { status: "Approved" | "Rejected", remarks? }
async function updateLeaveStatus(req, res) {
  try {
    const { status, remarks } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be Approved or Rejected" });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    if (leave.status !== "Pending") {
      return res.status(409).json({ message: `This application is already ${leave.status.toLowerCase()}` });
    }

    leave.status = status;
    leave.remarks = (remarks || "").trim();
    leave.decidedAt = new Date();
    await leave.save();

    res.json(leave);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid leave application id" });
    }
    res.status(500).json({ message: error.message });
  }
}

module.exports = { applyLeave, getLeaves, updateLeaveStatus };
