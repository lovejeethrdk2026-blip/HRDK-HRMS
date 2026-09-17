const mongoose = require("mongoose");

// One document per leave application submitted from the employee portal.
// Dates are plain "YYYY-MM-DD" strings (what <input type="date"> produces),
// so they compare/sort correctly as strings with no timezone shifting.
const leaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true
    },

    name: {
      type: String,
      default: ""
    },

    leaveType: {
      type: String,
      enum: ["Casual Leave", "Sick Leave", "Earned Leave", "Unpaid Leave"],
      required: true
    },

    fromDate: {
      type: String,
      required: true
    },

    toDate: {
      type: String,
      required: true
    },

    halfDay: {
      type: Boolean,
      default: false
    },

    days: {
      type: Number,
      required: true
    },

    reason: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    },

    // Set by the admin when approving/rejecting.
    remarks: {
      type: String,
      default: ""
    },

    decidedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

leaveSchema.index({ employeeId: 1, fromDate: -1 });

module.exports = mongoose.model("Leave", leaveSchema);
