import { useEffect, useState } from "react";
import api from "../api/axios";
import { roleLabel, useAuth } from "../auth/AuthContext";
import Loader from "../components/Loader";
import GoogleDriveCard from "../components/GoogleDriveCard";
import DepartmentPicker from "../components/DepartmentPicker";

// Admin page (top-right menu > Admin): every user, "+ Add user" to give a
// manager or viewer their username and password, and "New password" for a
// user who forgot theirs. Uses server/users (admin-only routes).

// Department fields shared by "+ Add user" and "Edit": one or more departments
// (each with sub departments) and Daily Register departments (each with COSEC
// sections). Hidden for an admin, who sees every department.
//   departmentOptions / registerOptions: [{ name, subs: [...] }]
function AccessFields({ form, setForm, departmentOptions, registerOptions, managerOptions = [] }) {
  if (form.role === "admin") return <p className="cp-note">An admin can see and manage every department, and every chat.</p>;
  return (
    <>
      <label className="dept-modal-label" htmlFor="uf-manager">
        Manager name for chat
      </label>
      <input
        id="uf-manager"
        className="dept-modal-input"
        list="uf-manager-names"
        placeholder="e.g. SATYA PRAKASH SHARMA (leave blank if not a manager)"
        value={form.managerName}
        onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value.toUpperCase() }))}
      />
      <datalist id="uf-manager-names">
        {managerOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="cp-note">
        This login gets the app chats of every employee whose Reporting manager is this name (needs the role&apos;s
        &quot;Chat with their own team&quot; permission).
      </p>
      <div className="us-pickers">
      <DepartmentPicker
        id="uf-depts"
        label="Departments"
        options={departmentOptions}
        value={form.departments}
        onChange={(departments) => setForm((f) => ({ ...f, departments }))}
        emptyText="No departments yet. Add them on the Department page."
      />
      <DepartmentPicker
        id="uf-register"
        label="Daily Register departments"
        options={registerOptions}
        value={form.registerDepartments}
        onChange={(registerDepartments) => setForm((f) => ({ ...f, registerDepartments }))}
        subLabel="sections"
      />
      </div>
      <p className="cp-note">
        No sub department picked = the whole department. No Daily Register department picked = every department.
      </p>
    </>
  );
}

// form -> the body POST /users/register and PUT /users/:id expect.
function accessBody(form) {
  if (form.role === "admin") return { departments: [], registerDepartments: [], managerName: "" };
  return {
    managerName: form.managerName || "",
    departments: form.departments.map((d) => ({ name: d.name, subDepartments: d.subs })),
    registerDepartments: form.registerDepartments.map((d) => ({ name: d.name, sections: d.subs }))
  };
}

// "+ Add user" dialog: POST /users/register.
// roles: from the Roles & Permissions page, e.g. [{ name: "manager", label: "Manager" }].
function AddUserDialog({ departmentOptions, registerOptions, managerOptions, roles, onSaved, onClose }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: roles[0]?.name || "admin",
    departments: [],
    registerDepartments: [],
    managerName: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 6) return setError("Password must be at least 6 characters");
    if (form.role !== "admin" && !form.departments.length) return setError("Pick at least one department");
    setSaving(true);
    setError("");
    try {
      const username = form.username.trim();
      await api.post("/users/register", { username, password: form.password, role: form.role, ...accessBody(form) });
      onSaved(username);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal us-user-modal" role="dialog" aria-modal="true" aria-labelledby="au-title" onSubmit={handleSubmit}>
        <button type="button" className="us-modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
          ×
        </button>
        <h2 id="au-title" className="dept-modal-title">
          Add user
        </h2>
        <label className="dept-modal-label" htmlFor="au-username">
          Username
        </label>
        <input id="au-username" className="dept-modal-input" autoFocus value={form.username} onChange={set("username")} required />
        <label className="dept-modal-label" htmlFor="au-password">
          Password
        </label>
        <input
          id="au-password"
          className="dept-modal-input"
          type="text"
          autoComplete="off"
          placeholder="Min 6 characters — give this to the user"
          value={form.password}
          onChange={set("password")}
          required
        />
        <label className="dept-modal-label" htmlFor="au-role">
          Role
        </label>
        <select id="au-role" className="dept-modal-input" value={form.role} onChange={set("role")}>
          {roles.map((role) => (
            <option key={role.name} value={role.name}>
              {role.label}
            </option>
          ))}
          <option value="admin">Administrator</option>
        </select>
        <AccessFields
          form={form}
          setForm={setForm}
          departmentOptions={departmentOptions}
          registerOptions={registerOptions}
          managerOptions={managerOptions}
        />
        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Add user"}
          </button>
        </div>
      </form>
    </div>
  );
}

// "Edit" dialog: PUT /users/:id (username, role, departments, Daily Register departments).
// isMe: the admin editing their own login, whose role cannot change.
function EditUserDialog({ user, isMe, departmentOptions, registerOptions, managerOptions, roles, onSaved, onClose }) {
  const [form, setForm] = useState({
    username: user.username,
    role: user.role,
    departments: (user.departments || []).map((d) => ({ name: d.name, subs: d.subDepartments || [] })),
    registerDepartments: (user.registerDepartments || []).map((d) => ({ name: d.name, subs: d.sections || [] })),
    managerName: user.managerName || ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim()) return setError("Username is required");
    if (form.role !== "admin" && !form.departments.length) return setError("Pick at least one department");
    setSaving(true);
    setError("");
    try {
      const username = form.username.trim();
      await api.put(`/users/${user._id}`, { username, role: form.role, ...accessBody(form) });
      onSaved(username);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal us-user-modal" role="dialog" aria-modal="true" aria-labelledby="eu-title" onSubmit={handleSubmit}>
        <button type="button" className="us-modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
          ×
        </button>
        <h2 id="eu-title" className="dept-modal-title">
          Edit {user.username}
        </h2>
        <label className="dept-modal-label" htmlFor="eu-username">
          Username
        </label>
        <input id="eu-username" className="dept-modal-input" autoFocus value={form.username} onChange={set("username")} required />
        <label className="dept-modal-label" htmlFor="eu-role">
          Role
        </label>
        <select id="eu-role" className="dept-modal-input" value={form.role} onChange={set("role")} disabled={isMe}>
          {roles.map((role) => (
            <option key={role.name} value={role.name}>
              {role.label}
            </option>
          ))}
          <option value="admin">Administrator</option>
        </select>
        {isMe && <p className="cp-note">You cannot change your own role.</p>}
        <AccessFields
          form={form}
          setForm={setForm}
          departmentOptions={departmentOptions}
          registerOptions={registerOptions}
          managerOptions={managerOptions}
        />
        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// "New password" dialog: PUT /users/:id/reset-password.
function ResetPasswordDialog({ user, onSaved, onClose }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setSaving(true);
    setError("");
    try {
      await api.put(`/users/${user._id}/reset-password`, { newPassword: password });
      onSaved(user.username);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal" role="dialog" aria-modal="true" aria-labelledby="rp-title" onSubmit={handleSubmit}>
        <h2 id="rp-title" className="dept-modal-title">
          New password for {user.username}
        </h2>
        <label className="dept-modal-label" htmlFor="rp-password">
          New password
        </label>
        <input
          id="rp-password"
          className="dept-modal-input"
          type="text"
          autoComplete="off"
          autoFocus
          placeholder="Min 6 characters — give this to the user"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="cp-note">{user.username} is logged out everywhere and must login with this password.</p>
        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Set password"}
          </button>
        </div>
      </form>
    </div>
  );
}

// "Delete" confirm: DELETE /users/:id.
function DeleteUserDialog({ user, onDeleted, onClose }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      await api.delete(`/users/${user._id}`);
      onDeleted(user.username);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card dept-modal" role="alertdialog" aria-modal="true" aria-labelledby="du-title">
        <h2 id="du-title" className="dept-modal-title">
          Delete {user.username}?
        </h2>
        <p className="cp-note du-note">
          {user.username} can no longer login and is logged out everywhere. This cannot be undone; to give access
          again, add the user again.
        </p>
        {error && (
          <p className="dept-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="dept-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
            {saving ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}

// "Online", "5 min ago", "Yesterday 14:20", or "—" when never seen / logged out.
function lastActive(user) {
  if (user.online) return "Online";
  if (!user.lastSeenAt) return "—";
  const seen = new Date(user.lastSeenAt);
  const minutes = Math.round((Date.now() - seen) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return seen.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Initials avatar with a green dot while the user is online.
function UserAvatar({ user }) {
  return (
    <span className="us-avatar-wrap">
      <span className="tn-avatar us-avatar" aria-hidden="true">
        {user.username.slice(0, 2).toUpperCase()}
      </span>
      {user.online && <span className="us-online-dot" title="Online" aria-label="Online" />}
    </span>
  );
}

export default function Users() {
  const { user: me, refreshAccess } = useAuth();
  const [layout, setLayout] = useState("list"); // "list": one line each, "cards": the grid
  const [users, setUsers] = useState(null);
  // pickers: [{ name, subs }] from the Department page, and COSEC departments with their sections
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [registerOptions, setRegisterOptions] = useState([]);
  // Reporting manager names on employee records, for "Manager name for chat".
  const [managerOptions, setManagerOptions] = useState([]);
  const [roles, setRoles] = useState([]); // from the Roles & Permissions page
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // the user being edited
  const [resetting, setResetting] = useState(null); // the user getting a new password
  const [deleting, setDeleting] = useState(null); // the user being deleted
  const [note, setNote] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  useEffect(() => {
    load();
    api
      .get("/departments")
      .then(({ data }) =>
        setDepartmentOptions(
          // sub departments come as [{ name }]
          (data.departments || []).map((d) => ({
            name: d.name,
            subs: (d.subDepartments || []).map((sub) => (typeof sub === "string" ? sub : sub.name))
          }))
        )
      )
      .catch(() => setDepartmentOptions([]));
    api
      .get("/attendance/departments")
      .then(({ data }) =>
        setRegisterOptions((data.departments || []).map((name) => ({ name, subs: data.sections?.[name] || [] })))
      )
      .catch(() => setRegisterOptions([]));
    api
      .get("/employees")
      .then(({ data }) => {
        const names = (Array.isArray(data) ? data : [])
          .map((e) => String(e.reportingManager || "").replace(/\s+/g, " ").trim().toUpperCase())
          .filter(Boolean);
        setManagerOptions([...new Set(names)].sort());
      })
      .catch(() => setManagerOptions([]));
    api
      .get("/roles")
      .then(({ data }) => setRoles(data.roles || []))
      .catch(() => setRoles([]));
    // keep the online dots current
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const roleName = (user) => roles.find((r) => r.name === user.role)?.label || roleLabel(user.role);
  // "CASTING DEPARTMENT (WAX, POLISH), CAD DEPARTMENT"
  const describe = (list, key, none) =>
    list?.length ? list.map((d) => (d[key]?.length ? `${d.name} (${d[key].join(", ")})` : d.name)).join(", ") : none;
  const departmentName = (user) =>
    user.role === "admin" ? "All departments" : describe(user.departments, "subDepartments", "No department");
  const registerName = (user) =>
    user.role === "admin" ? "All departments" : describe(user.registerDepartments, "sections", "All departments");
  const actions = (user) => (
    <span className="us-actions">
      <button type="button" className="btn" onClick={() => setEditing(user)}>
        Edit
      </button>
      <button type="button" className="btn" onClick={() => setResetting(user)}>
        New password
      </button>
      {user._id !== me._id && (
        <button type="button" className="btn btn-danger-outline" onClick={() => setDeleting(user)}>
          Delete
        </button>
      )}
    </span>
  );
  const onlineCount = users ? users.filter((user) => user.online).length : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            Who can login, and what they may do.
            {users ? ` ${users.length} user${users.length === 1 ? "" : "s"}, ${onlineCount} online.` : ""}
          </p>
        </div>
        <div className="page-header-actions">
          <div className="segmented emp-status" role="group" aria-label="View">
            {[
              ["list", "List"],
              ["cards", "Cards"]
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={layout === key ? "active" : undefined}
                aria-pressed={layout === key}
                onClick={() => setLayout(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add user
          </button>
        </div>
      </div>

      <GoogleDriveCard />

      {note && (
        <div className="detail-banner" role="status">
          <span>{note}</span>
        </div>
      )}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {!users && !error && <Loader text="Loading users…" />}

      {users && layout === "list" && (
        <div className="card emp-list-card">
          <div className="table-scroll emp-list-scroll">
            <table className="people-table emp-list-table us-list-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Daily Register</th>
                  <th>Last active</th>
                  <th>Added</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td>
                      <span className="emp-list-who">
                        <UserAvatar user={user} />
                        <span className="us-name">
                          {user.username}
                          {user._id === me._id && <span className="us-you">You</span>}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`us-role us-role-${user.role}`}>{roleName(user)}</span>
                    </td>
                    <td>{departmentName(user)}</td>
                    <td>{registerName(user)}</td>
                    <td className={user.online ? "us-online-text" : undefined}>{lastActive(user)}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString("en-GB")}</td>
                    <td className="us-list-actions">{actions(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {users && layout === "cards" && (
        <div className="emp-grid">
          {users.map((user) => (
            <article key={user._id} className="card us-card">
              <div className="us-top">
                <UserAvatar user={user} />
                <span className="us-who">
                  <span className="us-name">
                    {user.username}
                    {user._id === me._id && <span className="us-you">You</span>}
                  </span>
                  <span className="us-dept">{departmentName(user)}</span>
                  {user.role !== "admin" && (
                    <span className="us-dept">Daily Register: {registerName(user)}</span>
                  )}
                </span>
                <span className={`us-role us-role-${user.role}`}>{roleName(user)}</span>
              </div>
              <div className="us-foot">
                <span className="us-since">
                  Added {new Date(user.createdAt).toLocaleDateString("en-GB")}
                  <br />
                  <span className={user.online ? "us-online-text" : undefined}>
                    {user.online ? "Online" : `Last active ${lastActive(user)}`}
                  </span>
                </span>
                {actions(user)}
              </div>
            </article>
          ))}
        </div>
      )}

      {adding && (
        <AddUserDialog
          departmentOptions={departmentOptions}
          registerOptions={registerOptions}
          managerOptions={managerOptions}
          roles={roles}
          onClose={() => setAdding(false)}
          onSaved={(username) => {
            setAdding(false);
            setNote(`${username} added. Give them their username and password.`);
            load();
          }}
        />
      )}
      {editing && (
        <EditUserDialog
          user={editing}
          isMe={editing._id === me._id}
          departmentOptions={departmentOptions}
          registerOptions={registerOptions}
          managerOptions={managerOptions}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={(username) => {
            if (editing._id === me._id) refreshAccess();
            setEditing(null);
            setNote(`${username} updated.`);
            load();
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={(username) => {
            setResetting(null);
            setNote(`New password set for ${username}.`);
          }}
        />
      )}
      {deleting && (
        <DeleteUserDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(username) => {
            setDeleting(null);
            setNote(`${username} deleted.`);
            load();
          }}
        />
      )}
    </div>
  );
}
