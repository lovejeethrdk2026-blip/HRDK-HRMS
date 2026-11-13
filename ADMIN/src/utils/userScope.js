// The logged-in user's departments, as the Users page sets them (from /users/me):
//   user.departments:         [{ name, subDepartments: [] }]  ([] = whole department)
//   user.registerDepartments: [{ name, sections: [] }]        (Daily Register; [] list = every department)

// Is this Employees-page employee in one of the user's departments / sub departments?
export function inMyDepartments(user, employee) {
  return (user.departments || []).some(
    (d) =>
      d.name === employee.department &&
      (!d.subDepartments?.length || d.subDepartments.includes(employee.subDepartment))
  );
}

// "CASTING DEPARTMENT, CAD DEPARTMENT" or the fallback when there are none.
export function myDepartmentNames(user, fallback = "Your department") {
  const names = (user.departments || []).map((d) => d.name);
  return names.length ? names.join(", ") : fallback;
}

// Daily Register departments by name ("" when the user sees every department).
export function myRegisterNames(user) {
  if (user.role === "admin") return "";
  return (user.registerDepartments || []).map((d) => d.name).join(", ");
}
