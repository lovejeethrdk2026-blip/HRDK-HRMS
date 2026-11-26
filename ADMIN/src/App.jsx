import { Suspense, lazy, useEffect, useState, useTransition } from "react";
import { useAuth } from "./auth/AuthContext";
import Loader from "./components/Loader";
import Sidebar from "./components/Sidebar";
import TopNav from "./components/TopNav";
import Login from "./pages/Login";
import { connectLive, disconnectLive } from "./api/live";

// Each page's code is fetched on its own, so the first screen does not wait
// for every page (and the Excel / PowerPoint libraries). pageCode() keeps the
// import so it can be fetched early: when a menu entry is hovered, and for
// every page once the browser is idle after sign-in (see App below), so a
// menu click rarely waits for code.
function pageCode(load) {
  const Component = lazy(load);
  Component.preload = () => load().catch(() => {});
  return Component;
}
const AddEmployee = pageCode(() => import("./pages/AddEmployee"));
const BulkIncrement = pageCode(() => import("./pages/BulkIncrement"));
const BulkDepartmentChange = pageCode(() => import("./pages/BulkDepartmentChange"));
const BulkStateChange = pageCode(() => import("./pages/BulkStateChange"));
const BulkShift = pageCode(() => import("./pages/BulkShift"));
const AppLogins = pageCode(() => import("./pages/AppLogins"));
const Attendance = pageCode(() => import("./pages/Attendance"));
const Dashboard = pageCode(() => import("./pages/Dashboard"));
const Departments = pageCode(() => import("./pages/Departments"));
const Leave = pageCode(() => import("./pages/Leave"));
const Holidays = pageCode(() => import("./pages/Holidays"));
const PayrollSettings = pageCode(() => import("./pages/PayrollSettings"));
const PayFormulas = pageCode(() => import("./pages/PayFormulas"));
const AppSettings = pageCode(() => import("./pages/AppSettings"));
const Messages = pageCode(() => import("./pages/Messages"));
const EmpCost = pageCode(() => import("./pages/EmpCost"));
const MonthShiftPay = pageCode(() => import("./pages/MonthShiftPay"));
const Employees = pageCode(() => import("./pages/Employees"));
const FinancialSummary = pageCode(() => import("./pages/FinancialSummary"));
const PaySheets = pageCode(() => import("./pages/PaySheets"));
const ReportingChart = pageCode(() => import("./pages/ReportingChart"));
const Roles = pageCode(() => import("./pages/Roles"));
const Users = pageCode(() => import("./pages/Users"));

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
  bulkShift: BulkShift, // Employees > Shift: shift list + assign shift
  appLogins: AppLogins, // Employees > App logins: employee app usernames / passwords
  departments: Departments,
  reportingChart: ReportingChart,
  paySheet1: () => <PaySheets sheetKey="paySheet1" />,
  paySheet2: () => <PaySheets sheetKey="paySheet2" />,
  paySheet3: () => <PaySheets sheetKey="paySheet3" />,
  empCost: EmpCost,
  monthShiftPay: MonthShiftPay, // Payroll > Month Shift Register & Pay
  payFormulas: PayFormulas, // Payroll > Pay Formulas: HR's own pay components (admin only)
  financialSummary: FinancialSummary,
  users: Users, // admin only (top-right menu)
  roles: Roles, // admin only (top-right menu)
  payrollSettings: PayrollSettings, // admin (HR) only (top-right menu)
  appSettings: AppSettings // admin (HR) only: what the employee app shows
};

// Wrappers above share another page's code.
const CODE_OF = {
  attendanceAll: Attendance,
  headCount: Attendance,
  nightShift: Attendance,
  paySheet1: PaySheets,
  paySheet2: PaySheets,
  paySheet3: PaySheets
};
const fetched = new Set();
function preloadPage(key) {
  const Component = CODE_OF[key] || PAGES[key];
  if (!Component?.preload || fetched.has(Component)) return;
  fetched.add(Component);
  Component.preload();
}

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
  appLogins: "employees.add",
  bulkShift: "employees.view", // changing shifts needs employees.add (checked on the page and server)
  departments: "departments.view",
  reportingChart: "employees.view",
  paySheet1: "paysheet.view",
  paySheet2: "paysheet.view",
  paySheet3: "paysheet.view",
  empCost: "paysheet.reports",
  monthShiftPay: "paysheet.monthpay",
  payFormulas: "admin",
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
  // A menu click is a transition: the old page stays on screen (with a thin
  // bar on top) until the new one is ready, instead of a blank "Loading…".
  const [switching, startSwitch] = useTransition();

  // Once signed in and the browser is idle, fetch every page's code in the
  // background, one at a time.
  useEffect(() => {
    if (!user) return undefined;
    const keys = Object.keys(PAGES);
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    const cancel = window.cancelIdleCallback || clearTimeout;
    let handle;
    let i = 0;
    function next() {
      if (i >= keys.length) return;
      preloadPage(keys[i++]);
      handle = idle(next);
    }
    handle = idle(next);
    return () => cancel(handle);
  }, [user]);
  // Live refresh socket while someone is logged in (api/live.js).
  useEffect(() => {
    if (!user) return undefined;
    connectLive();
    return () => disconnectLive();
  }, [user?._id ?? user?.username]);

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
    preloadPage(key);
    setMenuOpen(false);
    startSwitch(() => setPage(key));
    window.scrollTo(0, 0);
  }

  return (
    <div className="app-shell">
      {switching && <div className="route-progress" role="progressbar" aria-label="Opening page" />}
      <TopNav
        page={current}
        onNavigate={navigate}
        onMenu={() => setMenuOpen(true)}
        canOpen={canOpen}
        onPrefetch={preloadPage}
      />
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
