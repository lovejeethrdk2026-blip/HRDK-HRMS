import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../auth/AuthContext";

const MIN_PASSWORD_LENGTH = 8;
const EMPTY_FORM = { username: "", name: "", password: "", confirm: "" };

function formatDateTime(timestamp) {
  if (!timestamp) return "–";
  return new Date(timestamp)
    .toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
    .replace(/\//g, "-");
}

function statusOf(user) {
  if (!user.isActive) return { label: "Disabled", className: "leave-status-rejected" };
  if (user.isLocked) return { label: "Locked", className: "leave-status-pending" };
  return { label: "Active", className: "leave-status-approved" };
}

export default function AdminUsers() {
  const { admin: currentAdmin, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState("");
  const [resetId, setResetId] = useState(""); // row whose "reset password" field is open
  const [resetPassword, setResetPassword] = useState("");

  async function fetchUsers() {
    setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  function replaceUser(updated) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }

    setCreating(true);
    try {
      const { data } = await api.post("/admin/users", {
        username: form.username,
        name: form.name,
        password: form.password
      });
      setUsers((prev) => [...prev, data]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setNotice(`Admin "${data.username}" created. They can sign in now.`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user) {
    setBusyId(user.id);
    setError("");
    setNotice("");

    try {
      const { data } = await api.patch(`/admin/users/${user.id}`, { isActive: !user.isActive });
      replaceUser(data);
      setNotice(
        data.isActive
          ? `"${data.username}" can sign in again.`
          : `"${data.username}" is disabled and was signed out.`
      );
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleResetPassword(user) {
    setError("");
    setNotice("");

    if (resetPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setBusyId(user.id);
    try {
      const { data } = await api.post(`/admin/users/${user.id}/password`, {
        password: resetPassword
      });

      // Resetting a password ends every session for that admin, including
      // this one if it's your own -- sign in again with the new password.
      if (data.id === currentAdmin.id) {
        await logout();
        return;
      }

      replaceUser(data);
      setResetId("");
      setResetPassword("");
      setNotice(`Password for "${data.username}" changed. They were signed out everywhere.`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Users</h1>
          <p className="page-subtitle">People who can sign in to this admin panel.</p>
        </div>

        <div className="page-header-actions">
          <button className="btn" onClick={fetchUsers} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowForm((v) => !v);
              setError("");
              setNotice("");
            }}
          >
            {showForm ? "Close" : "Add Admin"}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="filters" onSubmit={handleCreate}>
          <div className="field-group">
            <label htmlFor="new-admin-username">Username</label>
            <input
              id="new-admin-username"
              autoComplete="off"
              placeholder="e.g. hr.manager"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="new-admin-name">Full name</label>
            <input
              id="new-admin-name"
              placeholder="Optional"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="field-group">
            <label htmlFor="new-admin-password">Password</label>
            <input
              id="new-admin-password"
              type="password"
              autoComplete="new-password"
              placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="new-admin-confirm">Confirm password</label>
            <input
              id="new-admin-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </div>

          <div className="filters-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm(false);
              }}
              disabled={creating}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating && <span className="spinner" aria-hidden="true" />}
              {creating ? "Creating…" : "Create Admin"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {notice && <div className="notice-banner">{notice}</div>}

      {loading && users.length === 0 ? (
        <p className="state-panel">Loading admin users…</p>
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="leave-table">
              <thead>
                <tr>
                  <th className="col-left">Username</th>
                  <th className="col-left">Name</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const status = statusOf(user);
                  const isSelf = user.id === currentAdmin.id;
                  const busy = busyId === user.id;

                  return [
                    <tr key={user.id}>
                      <td className="col-left">
                        {user.username}
                        {isSelf && <span className="leave-halfday-tag">You</span>}
                      </td>
                      <td className="col-left">{user.name || "–"}</td>
                      <td>
                        <span className={`leave-status ${status.className}`}>{status.label}</span>
                      </td>
                      <td>{formatDateTime(user.lastLoginAt)}</td>
                      <td>{formatDateTime(user.createdAt)}</td>
                      <td>
                        <div className="leave-actions">
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => {
                              setResetId(resetId === user.id ? "" : user.id);
                              setResetPassword("");
                            }}
                          >
                            Reset Password
                          </button>
                          <button
                            className={`btn ${user.isActive ? "btn-reject" : "btn-approve"}`}
                            disabled={busy || (isSelf && user.isActive)}
                            title={isSelf && user.isActive ? "You can't disable your own account" : ""}
                            onClick={() => toggleActive(user)}
                          >
                            {user.isActive ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </td>
                    </tr>,

                    resetId === user.id && (
                      <tr key={`${user.id}-reset`} className="admin-reset-row">
                        <td colSpan={6}>
                          <form
                            className="admin-reset-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleResetPassword(user);
                            }}
                          >
                            <label htmlFor={`reset-${user.id}`}>
                              New password for <strong>{user.username}</strong>
                              {isSelf && " (you'll be signed out)"}
                            </label>
                            <input
                              id={`reset-${user.id}`}
                              className="leave-remarks-input"
                              type="password"
                              autoComplete="new-password"
                              placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              autoFocus
                            />
                            <button type="submit" className="btn btn-primary" disabled={busy}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setResetId("")}
                              disabled={busy}
                            >
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    )
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
