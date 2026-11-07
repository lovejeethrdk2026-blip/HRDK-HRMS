import Department from "./models/Department.js";

// Department page: departments and their sub-departments, all added on that
// page and kept in models/Department.js. This is separate from the Matrix
// COSEC employee master used by the Daily Register; nothing is read from it.

const byName = (a, b) => a.name.localeCompare(b.name);

// Trimmed, single-spaced, case kept as typed.
function cleanName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
// Names match ignoring case: "Polish" and "POLISH" are one department.
const same = (a, b) => a.toUpperCase() === b.toUpperCase();
const sameName = (name) => new RegExp(`^\\s*${escapeRegExp(name)}\\s*$`, "i");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toJson(doc) {
  return {
    name: doc.name,
    subDepartments: (doc.subDepartments || []).map((name) => ({ name })).sort(byName)
  };
}

// GET /api/departments -> { departments: [{ name, subDepartments: [{ name }] }] }
async function listDepartments(req, res) {
  const docs = await Department.find({}, { _id: 0, name: 1, subDepartments: 1 }).lean();
  res.json({ departments: docs.map(toJson).sort(byName) });
}

// Loads the department named in the URL, or answers 404.
async function findDepartment(req, res) {
  const name = cleanName(req.params.department);
  const doc = await Department.findOne({ name: sameName(name) });
  if (!doc) res.status(404).json({ message: `Department "${name}" not found` });
  return doc;
}

// POST /api/departments { name } -> the department.
async function createDepartment(req, res) {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "Department name is required" });
  if (await Department.exists({ name: sameName(name) })) {
    return res.status(409).json({ message: `Department "${name}" already exists` });
  }
  const created = await Department.create({ name, subDepartments: [] });
  res.status(201).json(toJson(created));
}

// DELETE /api/departments/:department -> 204 (its sub-departments go with it).
async function deleteDepartment(req, res) {
  const doc = await findDepartment(req, res);
  if (!doc) return;
  await doc.deleteOne();
  res.status(204).end();
}

// POST /api/departments/:department/sub-departments { name } -> the department.
async function createSubDepartment(req, res) {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ message: "Sub department name is required" });
  const doc = await findDepartment(req, res);
  if (!doc) return;
  if (doc.subDepartments.some((sub) => same(sub, name))) {
    return res.status(409).json({ message: `Sub department "${name}" already exists in ${doc.name}` });
  }
  doc.subDepartments.push(name);
  await doc.save();
  res.status(201).json(toJson(doc));
}

// DELETE /api/departments/:department/sub-departments/:sub -> 204.
async function deleteSubDepartment(req, res) {
  const doc = await findDepartment(req, res);
  if (!doc) return;
  const name = cleanName(req.params.sub);
  const before = doc.subDepartments.length;
  doc.subDepartments = doc.subDepartments.filter((sub) => !same(sub, name));
  if (doc.subDepartments.length === before) {
    return res.status(404).json({ message: `Sub department "${name}" not found in ${doc.name}` });
  }
  await doc.save();
  res.status(204).end();
}

export { listDepartments, createDepartment, deleteDepartment, createSubDepartment, deleteSubDepartment };
