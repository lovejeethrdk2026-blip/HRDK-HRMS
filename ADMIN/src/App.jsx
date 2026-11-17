import { Suspense, lazy, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import Loader from "./components/Loader";
import Sidebar from "./components/Sidebar";
import TopNav from "./components/TopNav";
import Login from "./pages/Login";

// Each page's code is fetched when it is first opened, so the first screen
// does not wait for every page (and the Excel / PowerPoint libraries).
const AddEmployee = lazy(() => import("./pages/AddEmployee"));
const BulkIncrement = lazy(() => import("./pages/BulkIncrement"));
const BulkDepartmentChange = lazy(() => import("./pages/BulkDepartmentChange"));
const BulkStateChange = lazy(() => import("./pages/BulkStateChange"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Departments = lazy(() => import("./pages/Departments"));
const Leave = lazy(() => import("./pages/Leave"));
const Holidays = lazy(() => import("./pages/Holidays"));
const PayrollSettings = lazy(() => import("./pages/PayrollSettings"));
const AppSettings = lazy(() => import("./pages/AppSettings"));
const Messages = lazy(() => import("./pages/Messages"));
const EmpCost = lazy(() => import("./pages/EmpCost"));
const MonthShiftPay = lazy(() => import("./pages/MonthShiftPay"));
const Employees = lazy(() => import("./pages/Employees"));
const FinancialSummary = lazy(() => import("./pages/FinancialSummary"));
const PaySheets = lazy(() => import("./pages/PaySheets"));
const ReportingChart = lazy(() => import("./pages/ReportingChart"));
const Roles = lazy(() => import("./pages/Roles"));
const Users = lazy(() => import("./pages/Users"));

const PAGES = {
  dashboard: Dashboard, // first, so it opens after login
  attendance: Attendance, // Daily Register: one day, or a month, in detail
  attendanceAll: (props) => <Attendance view="latest" {...props} />,
  headCount: (props) => <Attendance view="headcount" {...props} />,
  nightShift: (props) => <Attendance view="night" {...props} />,
  leave: Leave,
  holidays: Holidays,
  messages: Messages,
  employees: Employees,
  addEmployee: AddEmployee,
  bulkIncrement: BulkIncrement,
  bulkDepartmentChange: BulkDepartmentChange,
  bulkStateChange: BulkStateChange,
  departments: Departments,
  reportingChart: ReportingChart,
  paySheet1: () => <PaySheets sheetKey="paySheet1" />,
  paySheet2: () => <PaySheets sheetKey="paySheet2" />,
  paySheet3: () => <PaySheets sheetKey="paySheet3" />,
  empCost: EmpCost,
  monthShiftPay: MonthShiftPay, // Payroll > Month Shift Register & Pay
  financialSummary: FinancialSummary,
  users: Users, // admin only (top-right menu)
  roles: Roles, // admin only (top-right menu)
  payrollSettings: PayrollSettings, // admin (HR) only (top-right menu)
  appSettings: AppSettings // admin (HR) only: what the employee app shows
};

// The permission each page needs (Roles & Permissions page). "admin": admins only.
const PAGE_PERMISSION = {
  dashboard: "employees.view",
  attendance: "attendance.view",
  attendanceAll: "attendance.view",
  headCount: "attendance.view",
  nightShift: "attendance.view",
  leave: "leave.view",
  holidays: "holidays.view",
  messages: "chat.team", // admin (HR) always; a manager role only if HR gives it this permission
  employees: "employees.view",
  addEmployee: "employees.add",
  bulkIncrement: "employees.transfer",
  bulkDepartmentChange: "employees.transfer",
  bulkStateChange: "employees.transfer",
  departments: "departments.view",
  reportingChart: "employees.view",
  paySheet1: "paysheet.view",
  paySheet2: "paysheet.view",
  paySheet3: "paysheet.view",
  empCost: "paysheet.reports",
  monthShiftPay: "paysheet.monthpay",
  financialSummary: "paysheet.reports",
  users: "admin",
  roles: "admin",
  payrollSettings: "admin",
  appSettings: "admin"
};

export default function App() {
  const { user, checking, can } = useAuth();
  // Back from Google's "Allow" page (?drive=...): open Users, where the Google Drive card is.
  const [page, setPage] = useState(() => (new URLSearchParams(window.location.search).has("drive") ? "users" : ""));
  const [menuOpen, setMenuOpen] = useState(false); // menu drawer on narrow screens
  if (checking) return <Loader text="Loading…" />;
  if (!user) return <Login />;

  // May this user open that page?
  const canOpen = (key) => {
    const needs = PAGE_PERMISSION[key];
    if (!needs) return false; // not a page (e.g. "" before anything is picked)
    if (Array.isArray(needs)) return needs.some(can);
    return needs === "admin" ? user.role === "admin" : can(needs);
  };

  // The page asked for, or else the first one this user may open.
  const current = canOpen(page) ? page : Object.keys(PAGES).find(canOpen);
  const Page = PAGES[current];

  function navigate(key) {
    setPage(key);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  return (
    <div className="app-shell">
      <TopNav page={current} onNavigate={navigate} onMenu={() => setMenuOpen(true)} canOpen={canOpen} />
      <Sidebar
        page={current}
        onNavigate={navigate}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        canOpen={canOpen}
      />
      <div className="app-main">
        <div className="page">
          {Page ? (
            <Suspense fallback={<Loader text="Loading…" />}>
              <Page onNavigate={navigate} />
            </Suspense>
          ) : (
            <div className="card">
              <p className="state-panel">Your role has no pages yet. Ask your admin to give it access.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
