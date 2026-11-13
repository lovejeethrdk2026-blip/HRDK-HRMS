import mongoose from "mongoose";

// Leave management (Leave page). Employees are the COSEC master's
// (dailyRegister/models/Employee.js), keyed by employeeId, the same ID the
// Daily Register shows. Dates are "YYYY-MM-DD" strings, so they compare and
// sort as text with no timezone shifting.

const text = { type: String, default: "" };

// A kind of leave and how many days a year everyone gets (Leave > Leave types).
// yearlyDays 0 on an unpaid type means no limit (e.g. LWP).
const leaveTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // "CL"
    name: { type: String, required: true }, // "Casual Leave"
    yearlyDays: { type: Number, default: 0 },
    paid: { type: Boolean, default: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true, collection: "leave_types" }
);

// One leave application, applied by an HR user for an employee.
const leaveApplicationSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    name: text,
    department: text,
    section: text,
    type: { type: String, required: true }, // leave type code
    fromDate: { type: String, required: true },
    toDate: { type: String, required: true },
    halfDay: { type: Boolean, default: false },
    days: { type: Number, required: true }, // Sundays not counted; 0.5 for a half day
    reason: text,
    status: { type: String, enum: ["Pending", "Approved", "Rejected", "Cancelled"], default: "Pending" },
    appliedBy: text, // username
    decidedBy: text,
    decidedAt: { type: Date, default: null },
    remarks: text
  },
  { timestamps: true, collection: "leave_applications" }
);
leaveApplicationSchema.index({ employeeId: 1, fromDate: 1 });
leaveApplicationSchema.index({ status: 1, fromDate: 1, toDate: 1 });

// Extra (or fewer) days of one type for one employee in one financial year,
// e.g. Earned Leave carried forward: +6. Leave > Balances > Adjust.
const leaveAdjustmentSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true },
    fy: { type: Number, required: true }, // 2026 = April 2026 .. March 2027
    type: { type: String, required: true },
    days: { type: Number, default: 0 },
    note: text,
    updatedBy: text
  },
  { timestamps: true, collection: "leave_adjustments" }
);
leaveAdjustmentSchema.index({ employeeId: 1, fy: 1, type: 1 }, { unique: true });

export const LeaveType = mongoose.model("LeaveType", leaveTypeSchema);
export const LeaveApplication = mongoose.model("LeaveApplication", leaveApplicationSchema);
export const LeaveAdjustment = mongoose.model("LeaveAdjustment", leaveAdjustmentSchema);

// Created the first time the Leave page asks for the types.
export const DEFAULT_LEAVE_TYPES = [
  { code: "CL", name: "Casual Leave", yearlyDays: 12, paid: true },
  { code: "SL", name: "Sick Leave", yearlyDays: 7, paid: true },
  { code: "EL", name: "Earned Leave", yearlyDays: 15, paid: true },
  { code: "LWP", name: "Leave Without Pay", yearlyDays: 0, paid: false }
];
