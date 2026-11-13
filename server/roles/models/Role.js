import mongoose from "mongoose";

// A role and what it may do (Roles & Permissions page). "admin" has a document
// here only once its options are changed, and then only `hidden` counts; the
// Users and Roles pages stay admin-only whatever is hidden.
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "manager"
    label: { type: String, required: true, trim: true }, // e.g. "Manager"
    permissions: { type: [String], default: [] }, // keys from roles/permissions.js
    employeeScope: { type: String, enum: ["all", "department"], default: "department" },
    // Only on the "admin" document: options the admin has switched off for
    // admins. Kept as what is hidden (not what is allowed) so a new option
    // shows for admins until they hide it.
    hidden: { type: [String], default: [] }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Role", roleSchema);
