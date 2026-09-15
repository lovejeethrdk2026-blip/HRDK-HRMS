const PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "attendance", label: "Attendance" }
];

export default function Navbar({ page, onNavigate }) {
  return (
    <nav className="navbar">
      <span className="navbar-brand">HRMS</span>
      <div className="navbar-menu">
        {PAGES.map((p) => (
          <button
            key={p.key}
            className={`navbar-link ${page === p.key ? "active" : ""}`}
            onClick={() => onNavigate(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
