import Department from "../department/models/Department.js";
import RegisterEmployee from "../dailyRegister/models/Employee.js";

// A user's departments, as the Users page sets them:
//   departments:         [{ name: "CASTING DEPARTMENT", subDepartments: ["WAX", "POLISH"] }]
//   registerDepartments: [{ name: "MACHINE CHAIN", sections: ["SILKY", "LASER"] }]  (COSEC)
// An empty sub-department / section list means the whole department.
// Users saved before multi-select have one `department` (ObjectId) and one
// `registerDepartment` (name); those are read as a one-item list.

const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).map((s) => String(s ?? "").trim()).filter(Boolean))];

// user: a lean/doc User, with `department` populated ({ name }) for old users.
export function departmentAccess(user) {
  if (!user || user.role === "admin") return [];
  if (Array.isArray(user.departments) && user.departments.length) {
    return user.departments.map((d) => ({ name: d.name, subDepartments: cleanList(d.subDepartments) }));
  }
  return user.department?.name ? [{ name: user.department.name, subDepartments: [] }] : [];
}

export function registerAccess(user) {
  if (!user || user.role === "admin") return [];
  if (Array.isArray(user.registerDepartments) && user.registerDepartments.length) {
    return user.registerDepartments.map((d) => ({ name: d.name, sections: cleanList(d.sections) }));
  }
  return user.registerDepartment ? [{ name: user.registerDepartment, sections: [] }] : [];
}

// Checks the Users page's picks against the Department page and the COSEC
// employee master. -> { departments, registerDepartments } or throws a message.
export async function validateAccess(body) {
  const departments = [];
  for (const pick of Array.isArray(body.departments) ? body.departments : []) {
    const dept = await Department.findOne({ name: String(pick?.name ?? "").trim() }).lean();
    if (!dept) throw new Error(`Department not found: ${pick?.name}`);
    const subDepartments = cleanList(pick.subDepartments);
    const unknown = subDepartments.find((sub) => !dept.subDepartments.includes(sub));
    if (unknown) throw new Error(`${dept.name} has no sub department ${unknown}`);
    if (!departments.some((d) => d.name === dept.name)) departments.push({ name: dept.name, subDepartments });
  }

  const registerDepartments = [];
  for (const pick of Array.isArray(body.registerDepartments) ? body.registerDepartments : []) {
    const name = String(pick?.name ?? "").trim();
    if (!name || registerDepartments.some((d) => d.name === name)) continue;
    if (!(await RegisterEmployee.exists({ department: name }))) {
      throw new Error(`Daily Register department not found: ${name}`);
    }
    registerDepartments.push({ name, sections: cleanList(pick.sections) });
  }

  // Chat: the Reporting manager name this login answers for (upper case, one space).
  const managerName = String(body.managerName ?? "").replace(/\s+/g, " ").trim().toUpperCase();

  return { departments, registerDepartments, managerName };
}
