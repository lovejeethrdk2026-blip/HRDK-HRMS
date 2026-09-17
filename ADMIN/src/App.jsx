import { useState } from "react";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import AttendanceMark from "./pages/AttendanceMark";
import Placeholder from "./pages/Placeholder";
import LeaveApplications from "./pages/LeaveApplications";
import EmployeeDetails from "./pages/EmployeeDetails";

const PAGES = {
  dashboard: Dashboard,
  employeeDetails: EmployeeDetails,
  attendance: Attendance,
  attendanceMark: AttendanceMark,
  leaveApplication: () => <LeaveApplications mode="all" />,
  leaveApproval: () => <LeaveApplications mode="approval" />,
  leaveBalance: () => (
    <Placeholder title="Leave Balance" note="Employee leave balances are coming soon." />
  )
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const Page = PAGES[page] || Dashboard;

  return (
    <>
      <Navbar page={page} onNavigate={setPage} />
      <div className="page">
        <Page />
      </div>
    </>
  );
}
