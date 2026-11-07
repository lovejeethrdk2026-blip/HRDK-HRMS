import { useEffect, useState } from "react";
import api from "../api/axios";
import Brand from "./Brand";

// Simple line icons (24x24 viewBox), stroked with currentColor.
const ICONS = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  ),
  sheet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M9 3v4M15 3v4M8 14h3M8 17h6" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  tree: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="5" rx="1.5" />
      <rect x="3" y="16" width="6" height="5" rx="1.5" />
      <rect x="15" y="16" width="6" height="5" rx="1.5" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </svg>
  )
};

// The panel's jobs: the employee list, the daily attendance register and payroll.
export const MENU = [
  {
    section: "Overview",
    entries: [{ key: "dashboard", label: "Dashboard", icon: "grid" }]
  },
  {
    section: "People",
    entries: [
      {
        key: "employeesMenu",
        label: "Employees",
        icon: "users",
        items: [
          { key: "addEmployee", label: "Add Employee" },
          { key: "employees", label: "All Employees" }
        ]
      },
      // Department -> sub-department -> employees, from the COSEC master.
      { key: "departments", label: "Department", icon: "tree" },
      // Who reports to whom, from HR's department list (Excel).
      { key: "reportingChart", label: "Reporting Chart", icon: "tree" }
    ]
  },
  {
    section: "Attendance",
    entries: [
      {
        key: "attendanceMenu",
        label: "Daily Register",
        icon: "check",
        // All four are views of pages/Attendance.jsx.
        items: [
          { key: "attendanceAll", label: "All Employees" },
          { key: "headCount", label: "Head Count" },
          { key: "attendance", label: "Daily Register" },
          { key: "nightShift", label: "Night Shift" }
        ]
      }
    ]
  },
  {
    section: "Payroll",
    entries: [
      {
        key: "paySheets",
        label: "Pay Sheet",
        icon: "sheet",
        items: [
          { key: "paySheet1", label: "Salary Summary" },
          { key: "paySheet2", label: "Salary Detail" },
          { key: "paySheet3", label: "Employee Loans" },
          { key: "empCost", label: "Emp Cost" },
          { key: "financialSummary", label: "Financial Summary" }
        ]
      }
    ]
  }
];

const FLAT = MENU.flatMap((group) => group.entries);

// The menu without the pages this user may not open (canOpen from App.jsx);
// a dropdown or section left empty is dropped too.
export function visibleMenu(canOpen) {
  return MENU.map((group) => ({
    ...group,
    entries: group.entries
      .map((entry) => (entry.items ? { ...entry, items: entry.items.filter((item) => canOpen(item.key)) } : entry))
      .filter((entry) => (entry.items ? entry.items.length > 0 : canOpen(entry.key)))
  })).filter((group) => group.entries.length > 0);
}

// Title of a page key, for the title bar.
export function pageTitle(page) {
  for (const entry of FLAT) {
    if (entry.key === page) return entry.label;
    const sub = entry.items?.find((item) => item.key === page);
    if (sub) return sub.label;
  }
  return "Daily Register";
}

function relativeTime(iso) {
  const minutes = Math.round((Date.now() - new Date(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Clock + COSEC sync freshness. The one place the chrome reports on itself,
// so an admin can tell at a glance whether what they are looking at is current.
// Shown in the top bar, and in the drawer while it is open.
export function StatusStrip({ className = "sidebar-status" }) {
  const [clock, setClock] = useState(() => new Date());
  const [sync, setSync] = useState(null);

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get("/attendance/sync")
        .then(({ data }) => !cancelled && setSync(data))
        .catch(() => {});
    load();
    const poll = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  // Stale once it has missed two scheduled runs, or if the last run errored.
  const staleAfterMs = ((sync?.intervalMinutes || 5) * 2 + 1) * 60000;
  const stale =
    !sync?.lastRunAt || Boolean(sync.lastError) || Date.now() - new Date(sync.lastRunAt) > staleAfterMs;

  let label = "Connecting";
  if (sync?.running) label = "Syncing now";
  else if (sync?.lastError) label = "Sync failed";
  else if (sync?.lastRunAt) label = `Synced ${relativeTime(sync.lastRunAt)}`;

  return (
    <div className={`${className} ${stale ? "is-stale" : ""}`}>
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label">{label}</span>
      <span className="status-clock">{clock.toLocaleTimeString("en-GB")}</span>
    </div>
  );
}

// The menu as a drawer for narrow screens, where the top bar has no room for
// it; it slides in over the page (open/onClose). Hidden on wide screens.
export default function Sidebar({ page, onNavigate, open, onClose, counts, canOpen }) {
  const [openGroup, setOpenGroup] = useState(() =>
    FLAT.find((e) => e.items?.some((i) => i.key === page))?.key || ""
  );

  function renderEntry(entry) {
    if (!entry.items) {
      const count = counts?.[entry.key];
      return (
        <button
          key={entry.key}
          className={`sidebar-link ${page === entry.key ? "active" : ""}`}
          onClick={() => onNavigate(entry.key)}
        >
          <span className="sidebar-icon">{ICONS[entry.icon]}</span>
          <span className="sidebar-label">{entry.label}</span>
          {count ? <span className="sidebar-badge">{count}</span> : null}
        </button>
      );
    }

    const expanded = openGroup === entry.key;
    return (
      <div key={entry.key} className="sidebar-group">
        <button
          className={`sidebar-link ${entry.items.some((i) => i.key === page) ? "active" : ""}`}
          onClick={() => setOpenGroup(expanded ? "" : entry.key)}
          aria-expanded={expanded}
        >
          <span className="sidebar-icon">{ICONS[entry.icon]}</span>
          <span className="sidebar-label">{entry.label}</span>
          <span className={`sidebar-caret ${expanded ? "open" : ""}`} aria-hidden="true">
            &#9662;
          </span>
        </button>
        {expanded && (
          <div className="sidebar-sub">
            {entry.items.map((item) => (
              <button
                key={item.key}
                className={`sidebar-sublink ${page === item.key ? "active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
        </div>

        {open && <StatusStrip />}

        {visibleMenu(canOpen).map((group) => (
          <div key={group.section}>
            <div className="sidebar-section-title">{group.section}</div>
            <nav className="sidebar-nav">{group.entries.map(renderEntry)}</nav>
          </div>
        ))}
      </aside>
    </>
  );
}
