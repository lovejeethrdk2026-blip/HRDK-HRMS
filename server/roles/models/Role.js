import mongoose from "mongoose";

// A role and what it may do (Roles & Permissions page). "admin" is not stored
// here: an admin can always do everything.
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g. "manager"
    label: { type: String, required: true, trim: true }, // e.g. "Manager"
    permissions: { type: [String], default: [] }, // keys from roles/permissions.js
    employeeScope: { type: String, enum: ["all", "department"], default: "department" }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Role", roleSchema);
