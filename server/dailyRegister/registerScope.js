import User from "../users/models/User.js";
import Employee from "./models/Employee.js";
import { registerAccess } from "../users/userAccess.js";

// A user given "Daily Register departments" on the Users page sees only those
// COSEC departments (and, where picked, only those sections): in the Daily
// Register, on the Dashboard, the Employees page and the Pay Sheets. Admins,
// and users with none set, see everyone.

// "Electro Forming Department" and "ELECTRO FORMING" are one department.
export function sameDepartment(a, b) {
  const clean = (name) =>
    String(name ?? "").trim().replace(/\s+/g, " ").replace(/\s+DEPARTMENT$/i, "").toUpperCase();
  return Boolean(clean(a)) && clean(a) === clean(b);
}

// -> null (everyone), or { departments: [{ name, sections }], ids: ["10395", ...] }
// for this request's user.
export async function registerScope(req) {
  if (!req.session?.userId || req.session.role === "admin") return null;
  const user = await User.findById(req.session.userId, {
    role: 1,
    registerDepartment: 1,
    registerDepartments: 1
  }).lean();
  const departments = registerAccess(user);
  if (!departments.length) return null;
  const rows = await Employee.find(
    { department: { $in: departments.map((d) => d.name) } },
    { _id: 0, employeeId: 1, department: 1, section: 1 }
  ).lean();
  const ids = rows
    .filter((row) => {
      const pick = departments.find((d) => d.name === row.department);
      return pick && (!pick.sections.length || pick.sections.includes(row.section));
    })
    .map((row) => String(row.employeeId));
  return { departments, ids };
}

// An Employees-page profile is in scope by its COSEC ID -- the Initials No.
// (Matrix ID; employee codes are EMP_00001 style, not the COSEC ID) or the
// code itself for older records -- or (no ID match) by a department picked
// whole, i.e. with no sections narrowed.
export function profileInScope(scope, ids, employee) {
  return (
    ids.has(String(employee.initialsNo ?? "").trim()) ||
    ids.has(String(employee.employeeId)) ||
    scope.departments.some((d) => !d.sections.length && sameDepartment(employee.department, d.name))
  );
}
