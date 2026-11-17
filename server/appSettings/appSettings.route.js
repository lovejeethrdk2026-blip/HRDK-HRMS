import express from "express";
import mongoose from "mongoose";
import { isLoggedIn, authorize } from "../middleware/auth.js";

// Employee App settings (HR / admin only): what employees see and can do in
// the employee app (HRDK-EMP-APP). One document. The app gets the switches with
// the employee (GET /api/me/profile, login) and hides what is off; the /api/me
// routes refuse it too (requireFeature), so a switched-off thing cannot be read
// even by calling the server directly.

export const APP_FEATURES = [
  { key: "attendance", label: "Attendance", note: "Attendance tab, today's worked time on Home" },
  { key: "punchTimes", label: "Punch times", note: "IN / OUT times, day timeline, late, early out, missed punch. Off: only status and worked hours", needs: "attendance" },
  { key: "leave", label: "Leave balance and history", note: "Leave tab, leave left on Home" },
  { key: "leaveApply", label: "Apply and cancel leave", note: "Apply leave button, cancel a waiting request", needs: "leave" },
  { key: "salary", label: "Salary and payslips", note: "Salary tab, last salary on Home" },
  { key: "chat", label: "Chat with manager and HR", note: "Chat screen and new-message dot" },
  { key: "documents", label: "Letters and documents", note: "Documents HR shared, under Me" },
  { key: "profileEdit", label: "Correct own details", note: "Fix personal details and upload Aadhaar, PAN etc. from My profile" }
];

export const DEFAULT_APP_FEATURES = Object.fromEntries(APP_FEATURES.map((f) => [f.key, true]));

const AppSettings = mongoose.model(
  "AppSettings",
  new mongoose.Schema(
    { key: { type: String, unique: true, default: "main" }, features: { type: Object, default: {} }, updatedBy: String },
    { timestamps: true, collection: "app_settings" }
  )
);

// In memory after the first read; PUT replaces it.
let cached = null;

// Switches in use: saved ones over the defaults (everything on). A feature
// whose parent is off is off too (punch times without attendance...).
export async function appFeatures() {
  if (!cached) {
    const doc = await AppSettings.findOne({ key: "main" }).lean();
    cached = { ...DEFAULT_APP_FEATURES, ...(doc?.features || {}) };
  }
  const out = { ...cached };
  for (const f of APP_FEATURES) if (f.needs && !out[f.needs]) out[f.key] = false;
  return out;
}

// /api/me middleware: 403 when HR has switched the feature off.
export const requireFeature = (key) => async (req, res, next) => {
  try {
    if ((await appFeatures())[key]) return next();
    res.status(403).json({ message: "HR has turned this off in the app", feature: key });
  } catch (err) {
    next(err);
  }
};

const router = express.Router();
router.use(isLoggedIn);

// GET /api/app-settings -> { features, list }
router.get("/", authorize("admin"), async (req, res, next) => {
  try {
    if (!cached) await appFeatures();
    res.json({ features: { ...cached }, list: APP_FEATURES });
  } catch (err) {
    next(err);
  }
});

// PUT /api/app-settings { features: { attendance: true, ... } } -> { features }
router.put("/", authorize("admin"), async (req, res, next) => {
  try {
    const features = {};
    for (const f of APP_FEATURES) features[f.key] = req.body?.features?.[f.key] !== false;
    await AppSettings.updateOne({ key: "main" }, { $set: { features, updatedBy: req.session.userId } }, { upsert: true });
    cached = features;
    res.json({ features: { ...cached } });
  } catch (err) {
    next(err);
  }
});

export default router;
