const mongoose = require("mongoose");

// One document per employee's self-service login credentials, separate from
// the Attendance collection -- so login no longer depends on that employee
// having a synced attendance record, just on having an account here.
const empDetailsSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true
    },

    name: {
      type: String,
      default: ""
    },

    username: {
      type: String,
      required: true,
      unique: true
    },

    // bcrypt hash, never the plaintext password.
    passwordHash: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("EmpDetails", empDetailsSchema);
