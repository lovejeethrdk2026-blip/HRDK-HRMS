import { useState } from "react";
import Sidebar from "./Sidebar";
import Login from "./Login";
import Home from "./Home";
import AttendanceCalendar from "./AttendanceCalendar";
import Placeholder from "./Placeholder";
import Document from "./Document";
import LeaveApplication from "./LeaveApplication";

function Page({ page, employee }) {
  const employeeId = employee.employeeId;

  switch (page) {
    case "home":
      return <Home employee={employee} />;
    case "profile":
      return <Placeholder title="My Profile" note="Profile details are coming soon." />;
    case "me":
      return <Placeholder title="Me" note="Coming soon." />;
    case "leave-application":
      return <LeaveApplication employee={employee} />;
    case "leave-approval":
      return <Placeholder title="Leave Approval" note="Manage leave approvals here soon." />;
    case "leave-balance":
      return <Placeholder title="Leave Balance" note="Your leave balance is coming soon." />;
    case "attendance-calendar":
      return <AttendanceCalendar employeeId={employeeId} />;
    case "payroll":
      return <Placeholder title="Payroll" note="Your salary slip is coming soon." />;
    case "document":
      return <Document />;
    default:
      return <Home employee={employee} />;
  }
}

export default function App() {
  const [employee, setEmployee] = useState(null); // { employeeId, name } once logged in
  const [page, setPage] = useState("home");

  function handleLogin(data) {
    setEmployee(data);
    setPage("home");
  }

  function handleLogout() {
    setEmployee(null);
    setPage("home");
  }

  if (!employee) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Sidebar employee={employee} page={page} onNavigate={setPage} onLogout={handleLogout} />
      <div className="page">
        <Page page={page} employee={employee} />
      </div>
    </div>
  );
}
