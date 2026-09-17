const mongoose = require("mongoose");

// One document per issued admin refresh token. Only a SHA-256 hash of the
// token is stored, so a leaked database can't be used to mint sessions.
// Tokens are single-use: each refresh revokes the old one and issues a new
// one (rotation). Presenting an already-revoked token outside the short
// grace window is treated as theft and revokes every session for that admin.
const adminRefreshTokenSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true
    },

    expiresAt: {
      type: Date,
      required: true
    },

    revokedAt: {
      type: Date,
      default: null
    },

    userAgent: {
      type: String,
      default: ""
    },

    ip: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

// MongoDB deletes expired token documents on its own.
adminRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminRefreshToken", adminRefreshTokenSchema);
