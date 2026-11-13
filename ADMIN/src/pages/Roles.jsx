import { useEffect, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import { useAuth } from "../auth/AuthContext";

// Roles & Permissions (admin only, top-right menu): one column per role, one
// row per permission. Ticking a box saves that role at once (PUT /roles/:name).
// The Admin column hides / shows options for admins too (PUT /roles/admin);
// admins always see all employees and keep the Users and Roles pages.

// "+ Create role" dialog: POST /roles.
function CreateRoleDialog({ onSaved, onClose }) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/roles", { label: label.trim() });
      onSaved(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-card dept-modal" role="dialog" aria-modal="true" aria-labelledby="cr-title" onSubmit={handleSubmit}>
        <h2 id="cr-title" className="dept-modal-title">
          Create role
        </h2>
        <label className="dept-modal-label" htmlFor="cr-label">
          Role name
        </label>
        <input
          id="cr-label"
          className="dept-modal-input"
          autoFocus
          placeholder="e.g. Accounts"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <p className="cp-note">It starts with nothing allowed. Tick what it may do.</p>
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
            {saving ? "Saving…" : "Create role"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Roles() {
  const [data, setData] = useState(null); // { permissions, employeeScopes, adminUsers, roles }
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(""); // name of the role being saved
  const { refreshAccess } = useAuth();

  async function load() {
    try {
      const { data } = await api.get("/roles");
      setData(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Save one role, showing the change straight away.
  async function saveRole(role, changes) {
    const updated = { ...role, ...changes };
    setData((d) => ({ ...d, roles: d.roles.map((r) => (r.name === role.name ? updated : r)) }));
    setSaving(role.name);
    try {
      await api.put(`/roles/${role.name}`, {
        permissions: updated.permissions,
        employeeScope: updated.employeeScope
      });
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      load(); // put back what the server has
    } finally {
      setSaving("");
    }
  }

  // Admin column: what admins keep. Re-reads this user's access after, so the
  // menu follows straight away.
  async function toggleAdmin(key) {
    const has = data.adminPermissions.includes(key);
    const permissions = has ? data.adminPermissions.filter((k) => k !== key) : [...data.adminPermissions, key];
    setData((d) => ({ ...d, adminPermissions: permissions }));
    setSaving("admin");
    try {
      await api.put("/roles/admin", { permissions });
      setError("");
      await refreshAccess();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      load();
    } finally {
      setSaving("");
    }
  }

  function toggle(role, key) {
    const has = role.permissions.includes(key);
    const permissions = has ? role.permissions.filter((k) => k !== key) : [...role.permissions, key];
    saveRole(role, { permissions });
  }

  const usersText = (n) => `${n} user${n === 1 ? "" : "s"}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles &amp; Permissions</h1>
          <p className="page-subtitle">
            What each role can see and do — tick to change. Saved at once. Admins always keep Users and Roles &amp;
            Permissions.
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn" onClick={() => setCreating(true)} disabled={!data}>
            + Create role
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {!data && !error && <Loader text="Loading roles…" />}

      {data && (
        <div className="card rp-card">
          <div className="table-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th className="rp-perm">Permission</th>
                  <th>
                    <span className="rp-role">Admin</span>
                    <span className="rp-users">{saving === "admin" ? "Saving…" : usersText(data.adminUsers)}</span>
                  </th>
                  {data.roles.map((role) => (
                    <th key={role.name}>
                      <span className="rp-role">{role.label}</span>
                      <span className="rp-users">
                        {saving === role.name ? "Saving…" : usersText(role.users)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.permissions.map((group) => (
                  <PermissionGroup
                    key={group.group}
                    group={group}
                    data={data}
                    onToggle={toggle}
                    onToggleAdmin={toggleAdmin}
                    onScope={saveRole}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <CreateRoleDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// One group: its heading row, then (for Employees) "Which employees they see",
// then a row per permission.
function PermissionGroup({ group, data, onToggle, onToggleAdmin, onScope }) {
  const cols = data.roles.length + 2;
  return (
    <>
      <tr className="rp-group">
        <td colSpan={cols}>{group.group}</td>
      </tr>

      {group.group === "Employees" && (
        <tr>
          <td className="rp-perm">Which employees they see</td>
          <td className="rp-fixed">All employees</td>
          {data.roles.map((role) => (
            <td key={role.name}>
              <select
                className="rp-select"
                value={role.employeeScope}
                aria-label={`Which employees ${role.label} sees`}
                onChange={(e) => onScope(role, { employeeScope: e.target.value })}
              >
                {data.employeeScopes.map((scope) => (
                  <option key={scope.value} value={scope.value}>
                    {scope.label}
                  </option>
                ))}
              </select>
            </td>
          ))}
        </tr>
      )}

      {group.items.map((item) => (
        <tr key={item.key}>
          <td className="rp-perm">{item.label}</td>
          <td>
            <input
              type="checkbox"
              className="rp-check"
              checked={data.adminPermissions.includes(item.key)}
              aria-label={`Admin: ${item.label}`}
              onChange={() => onToggleAdmin(item.key)}
            />
          </td>
          {data.roles.map((role) => (
            <td key={role.name}>
              <input
                type="checkbox"
                className="rp-check"
                checked={role.permissions.includes(item.key)}
                aria-label={`${role.label}: ${item.label}`}
                onChange={() => onToggle(role, item.key)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
