import { useEffect, useRef, useState } from "react";
import { roleLabel, useAuth } from "../auth/AuthContext";
import Brand from "./Brand";
import ChangePasswordDialog from "./ChangePasswordDialog";
import { StatusStrip, visibleMenu } from "./Sidebar";
import { myDepartmentNames } from "../utils/userScope";


function Chevron({ open }) {
  return (
    <span className={`tn-caret ${open ? "tn-caret-open" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

// Closes a popover on an outside click or Escape.
function useDismiss(open, ref, setOpen) {
  useEffect(() => {
    if (!open) return undefined;

    function onPointer(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, setOpen]);
}

// An entry with sub-pages (Pay Sheet) opens as a dropdown under its name.
function NavMenu({ entry, page, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, setOpen);
  const active = entry.items.some((item) => item.key === page);

  return (
    <div className="tn-menu" ref={ref}>
      <button
        className={`tn-link ${active ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {entry.label}
        <Chevron open={open} />
      </button>

      {open && (
        <div className="tn-pop" role="menu">
          {entry.items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={page === item.key ? "active" : ""}
              onClick={() => {
                setOpen(false);
                onNavigate(item.key);
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

// "Lakshit IT" -> "LI", "admin" -> "AD"
function initials(name) {
  const words = String(name ?? "").trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name ?? "?").slice(0, 2).toUpperCase();
}

// Small line icons for the account menu.
const MENU_ICONS = {
  admin: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  password: "M14.5 9.5a4 4 0 1 0-3.9 4.9L9 16h-2v2H5v2H2v-3l6.6-6.6a4 4 0 0 1 5.9-.9zM16 8h.01",
  devices: "M4 5h12v9H4zM2 18h16M19 9h3v10h-3z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"
};

function MenuIcon({ name }) {
  return (
    <svg className="tn-pop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={MENU_ICONS[name]} />
    </svg>
  );
}

// Top-right account menu: who is logged in, Admin (users page, admins only),
// Change password, Logout from all devices and Logout.
function UserMenu({ onNavigate }) {
  const { user, logout, logoutAll } = useAuth();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false); // change password dialog
  const ref = useRef(null);
  useDismiss(open, ref, setOpen);

  function pick(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="tn-user" ref={ref}>
      <button className="tn-user-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className="tn-avatar" aria-hidden="true">
          {initials(user.username)}
        </span>
        <span className="tn-user-name">{user.username}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="tn-pop tn-pop-right" role="menu">
          <div className="tn-pop-head">
            <strong>{user.username}</strong>
            <span>
              {roleLabel(user.role)}
              {user.role === "admin" ? " · All departments" : user.departments?.length ? ` · ${myDepartmentNames(user)}` : ""}
            </span>
          </div>
          {user.role === "admin" && (
            <>
              <button role="menuitem" onClick={() => pick(() => onNavigate("users"))}>
                <MenuIcon name="users" />
                Users
              </button>
              <button role="menuitem" onClick={() => pick(() => onNavigate("roles"))}>
                <MenuIcon name="admin" />
                Roles &amp; permissions
              </button>
              <button role="menuitem" onClick={() => pick(() => onNavigate("payrollSettings"))}>
                <MenuIcon name="admin" />
                Payroll settings
              </button>
              <button role="menuitem" onClick={() => pick(() => onNavigate("appSettings"))}>
                <MenuIcon name="admin" />
                Employee app settings
              </button>
            </>
          )}
          <button role="menuitem" onClick={() => pick(() => setChanging(true))}>
            <MenuIcon name="password" />
            Change password
          </button>
          <button role="menuitem" onClick={() => pick(logoutAll)}>
            <MenuIcon name="devices" />
            Logout from all devices
          </button>
          <button role="menuitem" className="tn-pop-danger" onClick={() => pick(logout)}>
            <MenuIcon name="logout" />
            Logout
          </button>
        </div>
      )}

      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
    </div>
  );
}

// Top bar: the company lockup, the menu, sync freshness and the account. On
// narrow screens the menu folds into the drawer (Sidebar.jsx) behind the burger.
export default function TopNav({ page, onNavigate, onMenu, canOpen }) {
  // The top bar lists the entries straight across; the section headings only
  // matter in the phone drawer. Pages this user may not open are left out.
  const entries = visibleMenu(canOpen).flatMap((group) => group.entries);

  return (
    <header className="tn">
      <button className="tn-burger" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <Brand />

      <nav className="tn-nav" aria-label="Main">
        {entries.map((entry) =>
          entry.items ? (
            <NavMenu key={entry.key} entry={entry} page={page} onNavigate={onNavigate} />
          ) : (
            <button
              key={entry.key}
              className={`tn-link ${page === entry.key ? "active" : ""}`}
              onClick={() => onNavigate(entry.key)}
              aria-current={page === entry.key ? "page" : undefined}
            >
              {entry.label}
            </button>
          )
        )}
      </nav>

      <div className="tn-right">
        <StatusStrip className="tn-status" />
        <UserMenu onNavigate={onNavigate} />
      </div>
    </header>
  );
}
