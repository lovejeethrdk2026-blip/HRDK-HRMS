import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import AttendanceMark from "./pages/AttendanceMark";
import Placeholder from "./pages/Placeholder";
import LeaveApplications from "./pages/LeaveApplications";
import EmployeeDetails from "./pages/EmployeeDetails";
import AdminUsers from "./pages/AdminUsers";

const PAGES = {
  dashboard: Dashboard,
  employeeDetails: EmployeeDetails,
  attendance: Attendance,
  attendanceMark: AttendanceMark,
  leaveApplication: () => <LeaveApplications mode="all" />,
  leaveApproval: () => <LeaveApplications mode="approval" />,
  leaveBalance: () => (
    <Placeholder title="Leave Balance" note="Employee leave balances are coming soon." />
  ),
  adminUsers: AdminUsers
};

export default function App() {
  const { admin, checking } = useAuth();
  const [page, setPage] = useState("dashboard");
  const Page = PAGES[page] || Dashboard;

  if (checking) {
    return (
      <div className="auth-checking">
        <span className="spinner" aria-hidden="true" /> Checking session…
      </div>
    );
  }

  if (!admin) return <Login />;

  return (
    <>
      <Navbar page={page} onNavigate={setPage} />
      <div className="page">
        <Page />
      </div>
    </>
  );
}
