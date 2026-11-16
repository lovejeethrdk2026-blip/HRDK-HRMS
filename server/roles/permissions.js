// Everything a role can be allowed to do, in groups, as shown on the
// Roles & Permissions page. Admin can always do all of it.
export const PERMISSIONS = [
  {
    group: "Employees",
    items: [
      { key: "employees.view", label: "See employees" },
      { key: "employees.add", label: "Add and edit employees" },
      { key: "employees.salary", label: "See salary and payroll history" },
      { key: "employees.transfer", label: "Salary revision and transfers" },
      { key: "employees.report", label: "Download transfer report" }
    ]
  },
  {
    group: "Departments",
    items: [
      { key: "departments.view", label: "See departments" },
      { key: "departments.edit", label: "Add and delete departments" }
    ]
  },
  {
    group: "Daily Register",
    items: [
      { key: "attendance.view", label: "See the daily register" },
      { key: "attendance.sync", label: "Sync from COSEC" },
      { key: "attendance.export", label: "Export to Excel" },
      { key: "attendance.nightshift", label: "Mark night shift staff" }
    ]
  },
  {
    group: "Leave",
    items: [
      { key: "leave.view", label: "See leave applications and balances" },
      { key: "leave.apply", label: "Apply leave for employees" },
      { key: "leave.approve", label: "Approve, reject and cancel leave" },
      { key: "leave.manage", label: "Edit leave types and balances" }
    ]
  },
  {
    group: "Chat",
    items: [
      // HR (admin) always sees every chat; this lets a role's logins see only
      // their own staff's chats (Users page: "Manager name for chat").
      { key: "chat.team", label: "Chat with their own staff only (employees whose Reporting manager is them)" }
    ]
  },
  {
    group: "Pay Sheet",
    items: [
      { key: "paysheet.view", label: "See salary summary, detail and loans" },
      { key: "paysheet.reports", label: "See Emp Cost and Financial Summary" },
      { key: "paysheet.monthpay", label: "See Month Shift Register & Pay (days vs shift, pay from CTC)" }
    ]
  }
];

// Every permission key, e.g. "employees.view".
export const ALL_KEYS = PERMISSIONS.flatMap((group) => group.items.map((item) => item.key));

// "Which employees they see" choices.
export const EMPLOYEE_SCOPES = [
  { value: "all", label: "All employees" },
  { value: "department", label: "Their department" }
];

// The two roles every install starts with.
export const DEFAULT_ROLES = [
  {
    name: "manager",
    label: "Manager",
    employeeScope: "department",
    permissions: [
      "employees.view",
      "employees.add",
      "employees.salary",
      "employees.transfer",
      "employees.report",
      "departments.view",
      "attendance.view",
      "attendance.sync",
      "attendance.export",
      "attendance.nightshift",
      "leave.view",
      "leave.apply",
      "leave.approve",
      "chat.team",
      "paysheet.view"
    ]
  },
  {
    name: "viewer",
    label: "Viewer",
    employeeScope: "department",
    permissions: ["employees.view", "departments.view", "attendance.view"]
  }
];
