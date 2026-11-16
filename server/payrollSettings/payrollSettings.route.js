import express from "express";
import mongoose from "mongoose";
import { isLoggedIn, authorize } from "../middleware/auth.js";
import { DEFAULT_PAYROLL_SETTINGS, payrollSettings, setPayrollSettings } from "../utils/salaryFormulas.js";

// Payroll Settings (HR / admin only): PF, ESIC, PT switches and rates, basic
// and HRA %, bonus, minimum wages. One document; the salary formulas
// (utils/salaryFormulas.js) use it everywhere via setPayrollSettings. Saving
// does not rewrite stored employee splits: each employee's split is worked out
// again the next time it is saved, and Month Pay / histories use it at once.

const PayrollSettings = mongoose.model(
  "PayrollSettings",
  new mongoose.Schema(
    { key: { type: String, unique: true, default: "main" }, values: { type: Object, default: {} }, updatedBy: String },
    { timestamps: true, collection: "payroll_settings" }
  )
);

const BOOLEANS = ["pfEnabled", "pfCeilingRequired", "esicEnabled", "ptEnabled"];
const PERCENTS = ["pfEmployeeRate", "pfEmployerRate", "esicEmployeeRate", "esicEmployerRate", "basicPercent", "hraPercent"];
const AMOUNTS = ["pfWageLimit", "pfMaxAmount", "esicCeiling", "statutoryBonus", "bonusYearlyLimit"];

// The body cleaned up, or a message saying what is wrong.
function clean(body) {
  const out = {};
  for (const key of BOOLEANS) out[key] = Boolean(body?.[key]);
  for (const key of [...PERCENTS, ...AMOUNTS]) {
    const n = Number(body?.[key]);
    if (!Number.isFinite(n) || n < 0) return { error: `${key} must be a number, 0 or more` };
    if (PERCENTS.includes(key) && n > 100) return { error: `${key} is a percentage, at most 100` };
    out[key] = n;
  }
  out.minWages = {};
  for (const [state, wage] of Object.entries(body?.minWages || {})) {
    const name = String(state).trim().toLowerCase();
    const n = Number(wage);
    if (!name) continue;
    if (!Number.isFinite(n) || n < 0) return { error: `Minimum wage for ${state} must be a number` };
    out.minWages[name] = n;
  }
  // PT slabs by state: { state: { slabs: [{ upTo, pt }], februaryTop } }.
  // Rising "up to" amounts; the last slab is "and above" (upTo null).
  out.ptSlabs = {};
  for (const [state, rule] of Object.entries(body?.ptSlabs || {})) {
    const name = String(state).trim().toLowerCase();
    if (!name) continue;
    const label = name.replace(/\b\w/g, (c) => c.toUpperCase());
    const rows = Array.isArray(rule?.slabs) ? rule.slabs : [];
    if (!rows.length) return { error: `${label}: add at least one PT slab` };
    const slabs = [];
    for (const [i, row] of rows.entries()) {
      const last = i === rows.length - 1;
      const pt = Number(row?.pt);
      if (!Number.isFinite(pt) || pt < 0) return { error: `${label}: PT in slab ${i + 1} must be 0 or more` };
      if (last) {
        slabs.push({ upTo: null, pt });
        continue;
      }
      const upTo = Number(row?.upTo);
      if (!Number.isFinite(upTo) || upTo <= 0) return { error: `${label}: "gross up to" in slab ${i + 1} must be above 0` };
      if (slabs.length && upTo <= slabs.at(-1).upTo) return { error: `${label}: slab amounts must go up` };
      slabs.push({ upTo, pt });
    }
    const februaryTop = Number(rule?.februaryTop) || 0;
    if (februaryTop < 0) return { error: `${label}: February PT must be 0 or more` };
    out.ptSlabs[name] = { slabs, februaryTop };
  }
  return { values: out };
}

// Loads the saved settings into the formulas (server start, mongoose waits
// for the connection).
export async function loadPayrollSettings() {
  const doc = await PayrollSettings.findOne({ key: "main" }).lean();
  setPayrollSettings(doc?.values);
}
loadPayrollSettings().catch((error) => console.error("Payroll settings not loaded:", error.message));

const router = express.Router();
router.use(isLoggedIn);

// GET /api/payroll-settings -> { values, defaults }. Every signed-in user: the
// admin app needs them to show salary splits the same way the server does.
router.get("/", (req, res) => {
  res.json({ values: payrollSettings(), defaults: DEFAULT_PAYROLL_SETTINGS });
});

// PUT /api/payroll-settings { ...values } -> { values }. Admin (HR) only.
router.put("/", authorize("admin"), async (req, res, next) => {
  try {
    const { values, error } = clean(req.body);
    if (error) return res.status(400).json({ message: error });
    await PayrollSettings.updateOne(
      { key: "main" },
      { $set: { values, updatedBy: req.session.userId } },
      { upsert: true }
    );
    setPayrollSettings(values);
    res.json({ values: payrollSettings() });
  } catch (err) {
    next(err);
  }
});

export default router;
