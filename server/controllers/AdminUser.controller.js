const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const AdminRefreshToken = require("../models/AdminRefreshToken");

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

// Never sends passwordHash.
function toListItem(admin) {
  return {
    id: admin._id.toString(),
    username: admin.username,
    name: admin.name,
    isActive: admin.isActive,
    isLocked: Boolean(admin.lockUntil && admin.lockUntil > new Date()),
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt
  };
}

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

async function revokeSessions(adminId) {
  await AdminRefreshToken.updateMany(
    { admin: adminId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

// GET /api/admin/users
async function listAdmins(req, res) {
  try {
    const admins = await Admin.find({}, { passwordHash: 0 }).sort({ createdAt: 1 }).lean();
    res.json(admins.map(toListItem));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /api/admin/users  Body: { username, name?, password }
async function createAdmin(req, res) {
  try {
    const { username, name, password } = req.body || {};
    const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";

    if (!USERNAME_PATTERN.test(normalized)) {
      return res.status(400).json({
        message: "Username must be 3-32 characters: letters, numbers, dot, dash or underscore"
      });
    }

    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });

    if (await Admin.exists({ username: normalized })) {
      return res.status(409).json({ message: `Username "${normalized}" is already taken` });
    }

    const admin = await Admin.create({
      username: normalized,
      name: typeof name === "string" ? name.trim() : "",
      passwordHash: await bcrypt.hash(password, 12)
    });

    res.status(201).json(toListItem(admin));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username is already taken" });
    }
    res.status(500).json({ message: error.message });
  }
}

// PATCH /api/admin/users/:id  Body: { name?, isActive? }
async function updateAdmin(req, res) {
  try {
    const { name, isActive } = req.body || {};
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (typeof name === "string") admin.name = name.trim();

    if (typeof isActive === "boolean" && isActive !== admin.isActive) {
      if (!isActive) {
        if (admin._id.toString() === req.admin.id) {
          return res.status(400).json({ message: "You can't disable your own account" });
        }
        const otherActive = await Admin.countDocuments({ _id: { $ne: admin._id }, isActive: true });
        if (otherActive === 0) {
          return res.status(400).json({ message: "At least one admin must stay active" });
        }
      }

      admin.isActive = isActive;
      if (isActive) {
        admin.failedLoginAttempts = 0;
        admin.lockUntil = null;
      }
    }

    await admin.save();
    if (!admin.isActive) await revokeSessions(admin._id);

    res.json(toListItem(admin));
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid admin id" });
    }
    res.status(500).json({ message: error.message });
  }
}

// POST /api/admin/users/:id/password  Body: { password }
// Also unlocks the account and logs that admin out of every session.
async function resetAdminPassword(req, res) {
  try {
    const problem = passwordProblem(req.body?.password);
    if (problem) return res.status(400).json({ message: problem });

    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    admin.passwordHash = await bcrypt.hash(req.body.password, 12);
    admin.failedLoginAttempts = 0;
    admin.lockUntil = null;
    await admin.save();
    await revokeSessions(admin._id);

    res.json(toListItem(admin));
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid admin id" });
    }
    res.status(500).json({ message: error.message });
  }
}

module.exports = { listAdmins, createAdmin, updateAdmin, resetAdminPassword };
