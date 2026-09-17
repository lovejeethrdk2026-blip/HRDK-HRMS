import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const MENU = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employeeDetails", label: "Employee Details" },
  { key: "attendance", label: "Attendance" },
  { key: "attendanceMark", label: "Attendance Mark" },
  {
    label: "Leave",
    items: [
      { key: "leaveApplication", label: "Leave Application" },
      { key: "leaveApproval", label: "Leave Approval" },
      { key: "leaveBalance", label: "Leave Balance" }
    ]
  },
  { key: "adminUsers", label: "Admin Users" }
];

function NavDropdown({ label, items, page, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = items.some((item) => item.key === page);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;

    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="navbar-dropdown" ref={ref}>
      <button
        className={`navbar-link ${isActive ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <span className={`navbar-caret ${open ? "navbar-caret-open" : ""}`} aria-hidden="true">
          &#9662;
        </span>
      </button>

      {open && (
        <div className="navbar-dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={`navbar-dropdown-item ${page === item.key ? "active" : ""}`}
              onClick={() => {
                onNavigate(item.key);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ page, onNavigate }) {
  const { admin, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <nav className="navbar">
      <span className="navbar-brand">HRMS</span>
      <div className="navbar-menu">
        {MENU.map((entry) =>
          entry.items ? (
            <NavDropdown
              key={entry.label}
              label={entry.label}
              items={entry.items}
              page={page}
              onNavigate={onNavigate}
            />
          ) : (
            <button
              key={entry.key}
              className={`navbar-link ${page === entry.key ? "active" : ""}`}
              onClick={() => onNavigate(entry.key)}
            >
              {entry.label}
            </button>
          )
        )}

        <div className="navbar-user">
          <span className="navbar-user-name">{admin?.name || admin?.username}</span>
          <button
            className="navbar-link"
            disabled={loggingOut}
            onClick={() => {
              setLoggingOut(true);
              logout();
            }}
          >
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </div>
    </nav>
  );
}
