import { useState } from "react";
import { apiPost } from "./api";

export default function Login({ onLogin }) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const data = await apiPost("/employee/login", { employeeId, password });
      onLogin(data);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="portal">
      <div className={`scan-card ${loggingIn ? "is-scanning" : ""}`}>
        <div className="scan-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <h1 className="scan-title">My Attendance</h1>
        <p className="scan-subtitle">Employee self-service &mdash; scan in with your ID</p>

        <form onSubmit={handleLogin} className="scan-form">
          <label className="field">
            <span className="field-label">Employee ID</span>
            <input
              className="field-input mono"
              inputMode="numeric"
              autoComplete="username"
              placeholder="e.g. 10395"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Passcode</span>
            <input
              className="field-input mono"
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button type="submit" className="scan-button" disabled={loggingIn}>
            {loggingIn ? "Verifying…" : "Verify Identity"}
          </button>
        </form>

        {loginError && (
          <div className="scan-denied" role="alert">
            <span className="denied-dot" aria-hidden="true" />
            Access denied &mdash; {loginError}
          </div>
        )}

        <div className="scan-sweep" aria-hidden="true" />
      </div>
    </div>
  );
}
