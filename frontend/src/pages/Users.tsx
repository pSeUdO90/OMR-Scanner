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
      <PageTitle icon="users" subtitle="Create logins for this OMR Software. The default administrator is admin / admin.">
        Users
      </PageTitle>
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
                <td>
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
