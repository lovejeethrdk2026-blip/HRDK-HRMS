import { useState } from "react";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";

const PAGES = {
  dashboard: Dashboard,
  attendance: Attendance
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
