const mongoose = require("mongoose");

// Admin panel accounts. Created/reset with scripts/createAdmin.js -- there is
// no signup endpoint on purpose.
const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    name: {
      type: String,
      default: ""
    },

    // bcrypt hash, never the plaintext password.
    passwordHash: {
      type: String,
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    },

    // Brute-force protection: after MAX_FAILED_LOGINS wrong passwords the
    // account is locked until lockUntil (see AdminAuth.controller.js).
    failedLoginAttempts: {
      type: Number,
      default: 0
    },

    lockUntil: {
      type: Date,
      default: null
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Admin", adminSchema);
