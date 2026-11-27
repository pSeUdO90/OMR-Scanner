import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { DeleteButton } from "../components/ActionButtons";
import { useConfirm } from "../components/ConfirmProvider";
import PageTitle from "../components/PageTitle";

type AppUserRow = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

export default function Users() {
  const [rows, setRows] = useState<AppUserRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("user");
  const [err, setErr] = useState("");
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const confirm = useConfirm();
  const load = () => api.get("/api/users").then(setRows);
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.post("/api/users", {
        username,
        password,
        display_name: displayName,
        role,
        is_active: true,
      });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not create user");
    }
  };

  return (
    <>
      <PageTitle icon="users" subtitle="Create logins for this OMR Software.">
        Users
      </PageTitle>
      {issued && (
        <div className="card">
          <p>
            One-time password for <strong>{issued.username}</strong>: <code>{issued.password}</code>
          </p>
          <p className="muted">
            Give it to them now — it is shown only once, and they must set their own password before they can use the
            app.
          </p>
          <div className="row-actions">
            <button type="button" className="secondary" onClick={() => setIssued(null)}>Dismiss</button>
          </div>
        </div>
      )}
      <form className="card row" onSubmit={onSubmit}>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label>Display Name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit">Create User</button>
      </form>
      {err && <p className="error">{err}</p>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.username}</td>
                <td>{row.display_name}</td>
                <td>{row.role}</td>
                <td>{row.is_active ? "Active" : "Disabled"}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Reset password",
                        message: `Reset the password for “${row.username}”? They will be signed out and given a one-time password to change at next sign-in.`,
                        confirmLabel: "Reset",
                      });
                      if (!ok) return;
                      setErr("");
                      try {
                        const res = (await api.post(`/api/users/${row.id}/reset-password`)) as {
                          username?: string;
                          password?: string;
                        };
                        if (res?.password) {
                          setIssued({ username: res.username || row.username, password: res.password });
                        }
                        load();
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : "Could not reset password");
                      }
                    }}
                  >
                    Reset Password
                  </button>
                  <DeleteButton
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Delete user",
                        message: `Delete “${row.username}”? They will no longer be able to sign in.`,
                      });
                      if (!ok) return;
                      setErr("");
                      try {
                        await api.del(`/api/users/${row.id}`);
                        load();
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : "Could not delete user");
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
