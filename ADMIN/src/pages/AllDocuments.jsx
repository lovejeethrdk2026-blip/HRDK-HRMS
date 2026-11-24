import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";
import DocumentViewer, { documentUrl } from "../components/DocumentViewer";
import { DOCUMENT_TITLES } from "../components/EmployeeDocuments";
import Loader from "../components/Loader";
import { statusOf } from "../utils/employeeStatus";
import { inMyDepartments } from "../utils/userScope";

// Employees > All Documents: every employee's documents on one page, with
// search, department and document filters. View opens the file large in a
// popup (components/DocumentViewer.jsx). Pick a document and "Missing" to see
// who has not given it yet. Files are added on Add Employee > Documents or by
// the employee in the app.

const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`);
const dateText = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "–");
const kindOf = (doc) => (doc.mimeType === "application/pdf" ? "PDF" : /^image\//.test(doc.mimeType || "") ? "IMG" : "XLS");

export default function AllDocuments() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState(""); // "" = every document
  const [show, setShow] = useState("files"); // "files" | "missing"
  const [activeOnly, setActiveOnly] = useState(true);
  const [viewing, setViewing] = useState(null); // { employee, doc }

  useEffect(() => {
    api
      .get("/employees")
      .then(({ data }) => setEmployees(data))
      .catch((err) => {
        setError(err.response?.data?.message || err.message);
        setEmployees([]);
      });
  }, []);

  const ownOnly = user.role !== "admin" && user.employeeScope === "department";
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const people = useMemo(
    () =>
      (employees || []).filter(
        (e) =>
          (!ownOnly || inMyDepartments(user, e)) &&
          (!activeOnly || statusOf(e) !== "left") &&
          (!department || e.department === department) &&
          words.every((w) => [e.employeeId, e.initialsNo, e.name].join(" ").toLowerCase().includes(w))
      ),
    [employees, ownOnly, activeOnly, department, search] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const departments = useMemo(() => [...new Set((employees || []).map((e) => e.department).filter(Boolean))].sort(), [employees]);

  // One line per file, or per employee missing the picked document.
  const files = useMemo(
    () =>
      people.flatMap((e) =>
        (e.documents || []).filter((d) => !title || d.title === title).map((doc) => ({ employee: e, doc }))
      ),
    [people, title]
  );
  const missing = useMemo(() => (title ? people.filter((e) => !(e.documents || []).some((d) => d.title === title)) : []), [people, title]);
  const withAny = people.filter((e) => (e.documents || []).length).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">All Documents</h1>
          <p className="page-subtitle">
            Every employee's documents in one place. Click View to see a file large; × closes it.
          </p>
        </div>
      </div>

      <div className="filters emp-filters">
        <div className="field-group emp-search">
          <label htmlFor="ad-search">Search</label>
          <input
            id="ad-search"
            type="search"
            placeholder="Employee ID or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field-group">
          <label htmlFor="ad-dept">Department</label>
          <select id="ad-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="ad-title">Document</label>
          <select
            id="ad-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!e.target.value) setShow("files");
            }}
          >
            <option value="">All documents</option>
            {DOCUMENT_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <span className="emp-status-label" id="ad-show">
            Show
          </span>
          <div className="segmented emp-status" role="group" aria-labelledby="ad-show">
            <button type="button" className={show === "files" ? "active" : undefined} onClick={() => setShow("files")}>
              Uploaded <span className="emp-status-count">{files.length}</span>
            </button>
            <button
              type="button"
              className={show === "missing" ? "active" : undefined}
              disabled={!title}
              title={title ? "" : "Pick a document first"}
              onClick={() => setShow("missing")}
            >
              Missing <span className="emp-status-count">{title ? missing.length : "–"}</span>
            </button>
          </div>
        </div>
        <label className="ad-check">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active only
        </label>
      </div>

      {employees && (
        <p className="ad-hint">
          {people.length} employees · {withAny} with at least one document · {files.length} file{files.length === 1 ? "" : "s"} shown
        </p>
      )}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {!employees ? (
        <Loader text="Loading documents…" />
      ) : show === "missing" ? (
        !missing.length ? (
          <div className="card">
            <p className="state-panel">Everyone shown has given {title}.</p>
          </div>
        ) : (
          <div className="card card-table">
            <div className="table-scroll">
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>ID</th>
                    <th>Department</th>
                    <th>{title}</th>
                  </tr>
                </thead>
                <tbody>
                  {missing.map((e) => (
                    <tr key={e.employeeId}>
                      <td>
                        <strong>{e.name}</strong> <span className="ad-code">{e.employeeId}</span>
                      </td>
                      <td>{e.initialsNo || "–"}</td>
                      <td>{e.department || "–"}</td>
                      <td>
                        <span className="ad-missing">Missing</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : !files.length ? (
        <div className="card">
          <p className="state-panel">No documents{title ? ` for ${title}` : ""}{search.trim() ? ` matching "${search.trim()}"` : ""}.</p>
        </div>
      ) : (
        <div className="card card-table">
          <div className="table-scroll">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Document</th>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>App</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {files.map(({ employee: e, doc }) => (
                  <tr key={`${e.employeeId}-${doc.id}`}>
                    <td>
                      <strong>{e.name}</strong> <span className="ad-code">{e.employeeId}</span>
                      <div className="ad-code" style={{ marginLeft: 0 }}>
                        {e.department || ""}
                      </div>
                    </td>
                    <td>{doc.title}</td>
                    <td>
                      <span className="ae-doc-badge">{kindOf(doc)}</span> {sizeText(doc.size)}
                    </td>
                    <td>{dateText(doc.uploadedAt)}</td>
                    <td>{(e.appLockedDocs || []).includes(doc.title) ? "🔒 Locked" : "Open"}</td>
                    <td className="ad-actions">
                      <button type="button" className="btn" onClick={() => setViewing({ employee: e, doc })}>
                        View
                      </button>
                      <a className="btn" href={documentUrl(e.employeeId, doc, true)}>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DocumentViewer
        employeeId={viewing?.employee.employeeId}
        doc={viewing?.doc || null}
        label={viewing ? `${viewing.employee.name} (${viewing.employee.employeeId}) · ${viewing.doc.title}` : ""}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
