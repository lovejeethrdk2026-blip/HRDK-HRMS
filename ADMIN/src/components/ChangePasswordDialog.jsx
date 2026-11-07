import { useEffect, useState } from "react";
import api from "../api/axios";

// Change password dialog (top-right menu): PUT /users/change-password. The
// server keeps this device logged in and logs out the others.
export default function ChangePasswordDialog({ onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 6) return setError("New password must be at least 6 characters");
    if (newPassword !== confirm) return setError("New passwords do not match");

    setSaving(true);
    setError("");
    try {
      await api.put("/users/change-password", { oldPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal-card dept-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-title"
        onSubmit={handleSubmit}
      >
        <h2 id="cp-title" className="dept-modal-title">
          Change password
        </h2>

        {done ? (
          <>
            <p className="cp-done" role="status">
              Password changed. Your other devices have been logged out.
            </p>
            <div className="dept-modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="dept-modal-label" htmlFor="cp-old">
              Current password
            </label>
            <input
              id="cp-old"
              className="dept-modal-input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
            <label className="dept-modal-label" htmlFor="cp-new">
              New password
            </label>
            <input
              id="cp-new"
              className="dept-modal-input"
              type="password"
              autoComplete="new-password"
              placeholder="Min 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <label className="dept-modal-label" htmlFor="cp-confirm">
              Confirm new password
            </label>
            <input
              id="cp-confirm"
              className="dept-modal-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
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
                {saving ? "Saving…" : "Change password"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
