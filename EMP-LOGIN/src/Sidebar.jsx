import { useState } from "react";

const LEAVE_ITEMS = [
  { key: "leave-application", label: "Leave Application" },
  { key: "leave-approval", label: "Leave Approval" },
  { key: "leave-balance", label: "Leave Balance" }
];

const ATTENDANCE_ITEMS = [
  { key: "attendance-calendar", label: "Calendar" }
];

function SidebarSection({ label, items, activeKey, onSelect }) {
  const isActive = items.some((item) => item.key === activeKey);
  const [open, setOpen] = useState(isActive);

  return (
    <div className="side-section">
      <button
        type="button"
        className={`side-link ${isActive ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className={`side-caret ${open ? "side-caret-open" : ""}`} aria-hidden="true">
          &#9662;
        </span>
      </button>

      {open && (
        <div className="side-subitems">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-sublink ${activeKey === item.key ? "active" : ""}`}
              onClick={() => onSelect(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ employee, page, onNavigate, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // No sidebar at all on the login screen -- only shown once signed in.
  if (!employee) return null;

  function navigate(key) {
    onNavigate(key);
    setMobileOpen(false);
  }

  return (
    <>
      <div className="side-topbar">
        <button
          type="button"
          className="side-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="side-topbar-name">{employee.name}</span>
      </div>

      {mobileOpen && (
        <div className="side-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="topnav-user side-user">
          <span className="topnav-user-name">{employee.name}</span>
          <span className="topnav-user-id mono">ID {employee.employeeId}</span>
        </div>

        <nav className="side-nav">
          <button
            type="button"
            className={`side-link ${page === "home" ? "active" : ""}`}
            onClick={() => navigate("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={`side-link ${page === "profile" ? "active" : ""}`}
            onClick={() => navigate("profile")}
          >
            My Profile
          </button>
          <button
            type="button"
            className={`side-link ${page === "me" ? "active" : ""}`}
            onClick={() => navigate("me")}
          >
            Me
          </button>

          <SidebarSection label="Leave" items={LEAVE_ITEMS} activeKey={page} onSelect={navigate} />
          <SidebarSection
            label="Attendance"
            items={ATTENDANCE_ITEMS}
            activeKey={page}
            onSelect={navigate}
          />

          <button
            type="button"
            className={`side-link ${page === "payroll" ? "active" : ""}`}
            onClick={() => navigate("payroll")}
          >
            Payroll
          </button>
          <button
            type="button"
            className={`side-link ${page === "document" ? "active" : ""}`}
            onClick={() => navigate("document")}
          >
            Document
          </button>
        </nav>

        <button type="button" className="logout-button side-logout" onClick={onLogout}>
          Log out
        </button>
      </aside>
    </>
  );
}
