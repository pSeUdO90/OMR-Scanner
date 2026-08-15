import { FormEvent, useState } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await login(username, password);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Login failed");
    }
  };
  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={onSubmit}>
        <img src="/logo.svg" alt="" className="login-logo" />
        <h1>OMR Software</h1>
        <p className="muted">Sign in to continue.</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && <p className="error">{err}</p>}
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}
