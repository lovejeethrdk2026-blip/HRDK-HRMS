import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo.png";

// Login screen. Users are created by the admin (Users page); the first admin
// is created once from Postman (POST /api/users/setup).

function Icon({ path, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0); // failed logins: the error box shakes on each one
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setTries((n) => n + 1);
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      {/* Left: the company brand. The logo sits in a white disc ringed like a
          jeweller's hallmark stamp. */}
      <aside className="login-side">
        <div className="login-seal">
          <img className="login-big-logo" src={logo} alt="HRDK Jewel Craft Ltd." />
        </div>
        <p className="login-app-name">HRDK HRMS</p>
      </aside>

      {/* Right: the form */}
      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Use the login details your admin gave you.</p>

          {error && (
            <div key={tries} className="login-error" role="alert">
              <Icon path="M12 8v5M12 16.5v.01M12 3l9.5 17h-19z" size={16} />
              <span>{error}</span>
            </div>
          )}

          <label className="login-label" htmlFor="login-username">
            Username
          </label>
          <div className="login-field">
            <Icon path="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
            <input
              id="login-username"
              autoComplete="username"
              autoFocus
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <div className="login-field">
            <Icon path="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting && <span className="spinner" aria-hidden="true" />}
            {submitting ? "Logging in…" : "Login"}
          </button>

          <p className="login-help">Forgot your password? Your admin can set a new one.</p>
        </form>

        <p className="login-foot">© {new Date().getFullYear()} HRDK Jewel Craft Ltd.</p>
      </main>
    </div>
  );
}
