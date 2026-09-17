const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const AdminRefreshToken = require("../models/AdminRefreshToken");

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS) || 7;

const REFRESH_COOKIE = "hrms_admin_rt";
// Cookie is only sent to the auth endpoints, never to regular API calls.
const REFRESH_COOKIE_PATH = "/api/admin/auth";

// Two tabs (or React StrictMode's double effect) can refresh with the same
// token at nearly the same moment. A revoked token reused within this window
// is treated as that race, not as theft.
const REUSE_GRACE_MS = 30 * 1000;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Compared against when the username doesn't exist, so a wrong username
// takes as long as a wrong password and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync("hrms-dummy-password", 10);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH
  };
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

function publicAdmin(admin) {
  return { id: admin._id.toString(), username: admin.username, name: admin.name };
}

function signAccessToken(admin) {
  return jwt.sign(
    { sub: admin._id.toString(), username: admin.username, role: "admin" },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL, algorithm: "HS256" }
  );
}

// Issues a new refresh token (cookie) + access token (JSON body) for this admin.
async function sendSession(req, res, admin) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  const maxAge = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

  await AdminRefreshToken.create({
    admin: admin._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + maxAge),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
    ip: req.ip || ""
  });

  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge });
  res.json({ accessToken: signAccessToken(admin), admin: publicAdmin(admin) });
}

// POST /api/admin/auth/login  Body: { username, password }
async function login(req, res) {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username: username.trim().toLowerCase() });

    if (!admin) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (admin.lockUntil && admin.lockUntil > new Date()) {
      const minutes = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
      });
    }

    const passwordOk = await bcrypt.compare(password, admin.passwordHash);

    if (!passwordOk) {
      admin.failedLoginAttempts += 1;
      if (admin.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        admin.failedLoginAttempts = 0;
        admin.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      }
      await admin.save();
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "This admin account is disabled" });
    }

    admin.failedLoginAttempts = 0;
    admin.lockUntil = null;
    admin.lastLoginAt = new Date();
    await admin.save();

    await sendSession(req, res, admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /api/admin/auth/refresh  (refresh token read from the httpOnly cookie)
async function refresh(req, res) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      return res.status(401).json({ message: "Not logged in" });
    }

    const now = new Date();
    const record = await AdminRefreshToken.findOne({ tokenHash: hashToken(token) });

    if (!record || record.expiresAt <= now) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Session expired, please log in again" });
    }

    if (record.revokedAt && now - record.revokedAt > REUSE_GRACE_MS) {
      // An old, already-rotated token came back: assume it was stolen and
      // end every session for this admin.
      await AdminRefreshToken.updateMany(
        { admin: record.admin, revokedAt: null },
        { $set: { revokedAt: now } }
      );
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Session revoked, please log in again" });
    }

    const admin = await Admin.findById(record.admin);
    if (!admin || !admin.isActive) {
      await AdminRefreshToken.updateMany(
        { admin: record.admin, revokedAt: null },
        { $set: { revokedAt: now } }
      );
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Admin account is no longer active" });
    }

    // Rotate: this token is single-use from here on.
    await AdminRefreshToken.updateOne(
      { _id: record._id, revokedAt: null },
      { $set: { revokedAt: now } }
    );

    await sendSession(req, res, admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /api/admin/auth/logout
async function logout(req, res) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await AdminRefreshToken.updateOne(
        { tokenHash: hashToken(token), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    clearRefreshCookie(res);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// GET /api/admin/auth/me  (requires access token)
async function me(req, res) {
  try {
    const admin = await Admin.findById(req.admin.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "Admin account is no longer active" });
    }
    res.json(publicAdmin(admin));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { login, refresh, logout, me };
