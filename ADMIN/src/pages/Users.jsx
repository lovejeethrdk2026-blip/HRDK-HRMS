import { useEffect, useState } from "react";
import api from "../api/axios";
import { roleLabel, useAuth } from "../auth/AuthContext";
import Loader from "../components/Loader";

// Admin page (top-right menu > Admin): every user, "+ Add user" to give a
// manager or viewer their username and password, and "New password" for a
// user who forgot theirs. Uses server/users (admin-only routes).

// "+ Add user" dialog: POST /users/register.
// roles: from the Roles & Permissions page, e.g. [{ name: "manager", label: "Manager" }].
// registerDepartments: COSEC department names from the Daily Register.
function AddUserDialog({ departments, registerDepartments, roles, onSaved, onClose }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: roles[0]?.name || "admin",
    department: "",
    registerDepartment: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 6) return setError("Password must be at least 6 characters");
    if (form.role !== "admin" && !form.department) return setError("Pick a department");
    setSaving(true);
    setError("");
    try {
      // an admin works in every department, so none is sent
      const department = form.role === "admin" ? "" : form.department;
      await api.post("/users/register", { ...form, department, username: form.username.trim() });
      onSaved(form.username.trim());
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal" role="dialog" aria-modal="true" aria-labelledby="au-title" onSubmit={handleSubmit}>
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
        {form.role === "admin" ? (
          <p className="cp-note">An admin can see and manage every department.</p>
        ) : (
          <>
            <label className="dept-modal-label" htmlFor="au-dept">
              Department
            </label>
            <select id="au-dept" className="dept-modal-input" value={form.department} onChange={set("department")} required>
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <label className="dept-modal-label" htmlFor="au-register-dept">
              Daily Register department
            </label>
            <select
              id="au-register-dept"
              className="dept-modal-input"
              value={form.registerDepartment}
              onChange={set("registerDepartment")}
            >
              <option value="">All departments</option>
              {registerDepartments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
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
  const { user: me } = useAuth();
  const [layout, setLayout] = useState("list"); // "list": one line each, "cards": the grid
  const [users, setUsers] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [registerDepartments, setRegisterDepartments] = useState([]); // COSEC, for the Daily Register
  const [roles, setRoles] = useState([]); // from the Roles & Permissions page
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
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
      .then(({ data }) => setDepartments(data.departments || []))
      .catch(() => setDepartments([]));
    api
      .get("/attendance/departments")
      .then(({ data }) => setRegisterDepartments(data.departments || []))
      .catch(() => setRegisterDepartments([]));
    api
      .get("/roles")
      .then(({ data }) => setRoles(data.roles || []))
      .catch(() => setRoles([]));
    // keep the online dots current
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const roleName = (user) => roles.find((r) => r.name === user.role)?.label || roleLabel(user.role);
  const departmentName = (user) => (user.role === "admin" ? "All departments" : user.department?.name || "No department");
  const actions = (user) => (
    <span className="us-actions">
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
                    <td>{user.role === "admin" ? "All departments" : user.registerDepartment || "All departments"}</td>
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
                    <span className="us-dept">Daily Register: {user.registerDepartment || "All departments"}</span>
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
          departments={departments}
          registerDepartments={registerDepartments}
          roles={roles}
          onClose={() => setAdding(false)}
          onSaved={(username) => {
            setAdding(false);
            setNote(`${username} added. Give them their username and password.`);
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
