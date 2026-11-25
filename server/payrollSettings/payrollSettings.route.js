import express from "express";
import mongoose from "mongoose";
import { isLoggedIn, authorize } from "../middleware/auth.js";
import {
  DEFAULT_PAYROLL_SETTINGS,
  payrollSettings,
  setPayrollSettings,
  setPayVersions,
  checkComponents,
  checkStage
} from "../utils/salaryFormulas.js";

// Payroll Settings (HR / admin only): PF, ESIC, PT switches and rates, basic
// and HRA %, bonus, minimum wages. One document; the salary formulas
// (utils/salaryFormulas.js) use it everywhere via setPayrollSettings. Saving
// does not rewrite stored employee splits: each employee's split is worked out
// again the next time it is saved, and Month Pay / histories use it at once.

const PayrollSettings = mongoose.model(
  "PayrollSettings",
  new mongoose.Schema(
    {
      key: { type: String, unique: true, default: "main" },
      // The latest pay version's settings: what Payroll Settings / Pay Formulas edit.
      values: { type: Object, default: {} },
      // Every pay version, oldest first: [{ version: "0.1", values, createdAt,
      // createdBy, note }]. The last one's values are kept equal to values.
      versions: { type: Array, default: [] },
      updatedBy: String
    },
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
  let doc = await PayrollSettings.findOne({ key: "main" }).lean();
  // Before pay versions: today's settings become version 0.1, so every pay
  // worked out so far stays as it is.
  if (!doc?.versions?.length) {
    const first = { version: "0.1", values: doc?.values || {}, createdAt: new Date(), createdBy: "", note: "Settings in use before pay versions" };
    await PayrollSettings.updateOne({ key: "main" }, { $set: { versions: [first] } }, { upsert: true });
    doc = { ...(doc || {}), versions: [first] };
  }
  applyDoc(doc);
}

// Puts a saved document into the formulas: the latest version in use, every
// version known.
function applyDoc(doc) {
  setPayrollSettings(doc?.values);
  setPayVersions(doc?.versions || []);
}

const nextVersion = (versions) => {
  const last = versions.at(-1)?.version || "0.0";
  const [major, minor] = last.split(".").map(Number);
  return `${major || 0}.${(minor || 0) + 1}`;
};

// Keeps the latest version's copy in step after values were edited.
async function syncLatest(userId) {
  const doc = await PayrollSettings.findOne({ key: "main" }).lean();
  const versions = doc?.versions || [];
  if (versions.length) {
    versions.at(-1).values = doc.values;
    await PayrollSettings.updateOne({ key: "main" }, { $set: { versions, updatedBy: userId } });
  }
  applyDoc({ ...doc, versions });
  return { ...doc, versions };
}

// What the admin app gets: the latest settings and every version (values
// included, so pay on an older version is shown the same everywhere).
const answer = (doc) => ({
  values: payrollSettings(),
  defaults: DEFAULT_PAYROLL_SETTINGS,
  versions: (doc?.versions || []).map(({ version, values, createdAt, note }) => ({ version, values, createdAt, note }))
});
loadPayrollSettings().catch((error) => console.error("Payroll settings not loaded:", error.message));

const router = express.Router();
router.use(isLoggedIn);

// GET /api/payroll-settings -> { values, defaults }. Every signed-in user: the
// admin app needs them to show salary splits the same way the server does.
router.get("/", async (req, res, next) => {
  try {
    res.json(answer(await PayrollSettings.findOne({ key: "main" }).lean()));
  } catch (err) {
    next(err);
  }
});

// POST /api/payroll-settings/versions { note } -> answer. Admin (HR) only.
// A new pay version: a copy of the latest, which then becomes the one edited.
// Older versions are never edited again, so pay worked out with them stays.
router.post("/versions", authorize("admin"), express.json(), async (req, res, next) => {
  try {
    const doc = await PayrollSettings.findOne({ key: "main" }).lean();
    const versions = doc?.versions || [];
    const version = nextVersion(versions);
    versions.push({
      version,
      values: structuredClone(doc?.values || {}),
      createdAt: new Date(),
      createdBy: req.session.userId || "",
      note: String(req.body?.note ?? "").trim().slice(0, 200)
    });
    await PayrollSettings.updateOne({ key: "main" }, { $set: { versions, updatedBy: req.session.userId } }, { upsert: true });
    applyDoc({ ...doc, versions });
    res.status(201).json(answer({ ...doc, versions }));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/payroll-settings/versions/:version -> answer. Admin (HR) only.
// Takes back a version made by mistake: only the latest, never the first, and
// only while no employee's pay uses it. The one before becomes the latest
// (editable) again, with its own settings.
router.delete("/versions/:version", authorize("admin"), async (req, res, next) => {
  try {
    const doc = await PayrollSettings.findOne({ key: "main" }).lean();
    const versions = doc?.versions || [];
    const version = String(req.params.version);
    const latest = versions.at(-1);
    if (!latest || latest.version !== version) {
      return res.status(400).json({ message: `Only the latest version (${latest?.version || "none"}) can be deleted` });
    }
    if (versions.length < 2) return res.status(400).json({ message: "The first version can't be deleted" });
    const used = await mongoose.connection
      .collection("employee_profiles")
      .countDocuments({ $or: [{ payVersion: version }, { "payHistory.payVersion": version }] });
    if (used) {
      return res.status(400).json({
        message: `${used} employee${used === 1 ? " is" : "s are"} on version ${version}. Move them to another version (Edit details) first.`
      });
    }
    versions.pop();
    const values = versions.at(-1).values || {};
    await PayrollSettings.updateOne({ key: "main" }, { $set: { versions, values, updatedBy: req.session.userId } });
    applyDoc({ ...doc, versions, values });
    res.json(answer({ ...doc, versions }));
  } catch (err) {
    next(err);
  }
});

// PUT /api/payroll-settings { ...values } -> { values }. Admin (HR) only.
router.put("/", authorize("admin"), async (req, res, next) => {
  try {
    const { values, error } = clean(req.body);
    if (error) return res.status(400).json({ message: error });
    // Kept: saved on the Pay Formulas page.
    values.formulas = payrollSettings().formulas;
    values.splitFormulas = payrollSettings().splitFormulas;
    values.monthFormulas = payrollSettings().monthFormulas;
    await PayrollSettings.updateOne(
      { key: "main" },
      { $set: { values, updatedBy: req.session.userId } },
      { upsert: true }
    );
    res.json(answer(await syncLatest(req.session.userId)));
  } catch (err) {
    next(err);
  }
});

// PUT /api/payroll-settings/formulas { formulas, splitFormulas, monthFormulas }
// -> { values }. Admin (HR) only. Pay Formulas page: HR's own pay components
// and the built-in salary split / month pay lists, each checked
// (utils/payFormula.js) before anything is saved. A list left out is kept.
router.put("/formulas", authorize("admin"), async (req, res, next) => {
  try {
    const set = {};
    if (req.body?.formulas !== undefined) {
      const { components, error } = checkComponents(req.body.formulas);
      if (error) return res.status(400).json({ message: error });
      set["values.formulas"] = components;
    }
    for (const [stage, key] of [["split", "splitFormulas"], ["month", "monthFormulas"]]) {
      if (req.body?.[key] === undefined) continue;
      const { list, error } = checkStage(stage, req.body[key]);
      if (error) return res.status(400).json({ message: error });
      set[`values.${key}`] = list;
    }
    if (!Object.keys(set).length) return res.status(400).json({ message: "Nothing to save" });
    await PayrollSettings.updateOne({ key: "main" }, { $set: { ...set, updatedBy: req.session.userId } }, { upsert: true });
    res.json(answer(await syncLatest(req.session.userId)));
  } catch (err) {
    next(err);
  }
});

export default router;
