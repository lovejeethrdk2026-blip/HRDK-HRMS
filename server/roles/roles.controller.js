import Role from "./models/Role.js";
import User from "../users/models/User.js";
import { ALL_KEYS, DEFAULT_ROLES, EMPLOYEE_SCOPES, PERMISSIONS } from "./permissions.js";

// Adds Manager and Viewer the first time, so there is always something to edit.
async function makeDefaultRoles() {
  for (const role of DEFAULT_ROLES) {
    const exists = await Role.findOne({ name: role.name });
    if (!exists) await Role.create(role);
  }
}

// What a role may do: { permissions, employeeScope }. Admin may do everything.
export async function accessFor(roleName) {
  if (roleName === "admin") return { permissions: ALL_KEYS, employeeScope: "all" };
  const role = await Role.findOne({ name: roleName });
  if (!role) return { permissions: [], employeeScope: "department" };
  return { permissions: role.permissions, employeeScope: role.employeeScope };
}

// GET /api/roles - the permission list and every role, with how many users have it
export const listRoles = async (req, res) => {
  try {
    await makeDefaultRoles();
    const roles = await Role.find().sort({ createdAt: 1 }).lean();

    // users per role, e.g. { admin: 1, manager: 3 }
    const counts = {};
    const groups = await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
    for (const g of groups) counts[g._id] = g.count;

    res.json({
      permissions: PERMISSIONS,
      employeeScopes: EMPLOYEE_SCOPES,
      adminUsers: counts.admin || 0,
      roles: roles.map((role) => ({ ...role, users: counts[role.name] || 0 }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/roles - create a role, e.g. { label: "Accounts" }. Starts with nothing allowed.
export const createRole = async (req, res) => {
  try {
    const label = String(req.body.label || "").trim();
    if (!label) {
      return res.status(400).json({ message: "Role name is required" });
    }

    // "Sales Executive" -> "sales-executive"
    const name = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!name || name === "admin") {
      return res.status(400).json({ message: "Pick another role name" });
    }
    if (await Role.findOne({ name })) {
      return res.status(400).json({ message: `Role "${label}" already exists` });
    }

    const role = await Role.create({ name, label });
    res.status(201).json({ ...role.toObject(), users: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/roles/:name - save what a role may do: { permissions: [...], employeeScope }
export const updateRole = async (req, res) => {
  try {
    const role = await Role.findOne({ name: req.params.name });
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    const { permissions, employeeScope } = req.body;
    if (Array.isArray(permissions)) {
      role.permissions = permissions.filter((key) => ALL_KEYS.includes(key)); // only known keys
    }
    if (employeeScope) {
      role.employeeScope = employeeScope;
    }

    await role.save();
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
