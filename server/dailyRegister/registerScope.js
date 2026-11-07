import User from "../users/models/User.js";
import Employee from "./models/Employee.js";

// A user given a "Daily Register department" on the Users page sees only that
// COSEC department: in the Daily Register, on the Dashboard and on the
// Employees page. Admins, and users with none set, see everyone.

// "Electro Forming Department" and "ELECTRO FORMING" are one department.
export function sameDepartment(a, b) {
  const clean = (name) =>
    String(name ?? "").trim().replace(/\s+/g, " ").replace(/\s+DEPARTMENT$/i, "").toUpperCase();
  return Boolean(clean(a)) && clean(a) === clean(b);
}

// -> null (everyone), or { department, ids: ["10395", ...] } for this request's user.
export async function registerScope(req) {
  if (!req.session?.userId || req.session.role === "admin") return null;
  const user = await User.findById(req.session.userId, { registerDepartment: 1 }).lean();
  const department = user?.registerDepartment;
  if (!department) return null;
  const rows = await Employee.find({ department }, { _id: 0, employeeId: 1 }).lean();
  return { department, ids: rows.map((row) => String(row.employeeId)) };
}
