import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageTitle from "../components/PageTitle";

type TabDef = { key: string; label: string };
type RoleMatrix = Record<string, Record<string, string[]>>;

export default function Settings() {
  const { user } = useAuth();
  const [dir, setDir] = useState("");
  const [resolved, setResolved] = useState("");
  const [tabs, setTabs] = useState<TabDef[]>([]);
  const [actions, setActions] = useState<string[]>(["view", "edit", "delete"]);
  const [roles, setRoles] = useState<string[]>(["admin", "user"]);
  const [matrix, setMatrix] = useState<RoleMatrix>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const admin = user?.role === "admin";

  const load = () => {
    api.get("/api/settings").then((row) => {
      setDir(String(row.processed_images_dir || ""));
      setResolved(String(row.resolved_dir || ""));
      setTabs((row.tabs as TabDef[]) || []);
      setActions((row.actions as string[]) || ["view", "edit", "delete"]);
      setRoles((row.roles as string[]) || ["admin", "user"]);
      setMatrix((row.role_permissions as RoleMatrix) || {});
    });
  };
  useEffect(() => { load(); }, []);

  const toggle = (role: string, tab: string, action: string) => {
    setMatrix((current) => {
      const next = { ...current, [role]: { ...(current[role] || {}) } };
      const granted = new Set(next[role][tab] || []);
      if (granted.has(action)) granted.delete(action);
      else granted.add(action);
      if ((action === "edit" || action === "delete") && granted.has(action)) granted.add("view");
      next[role][tab] = ["view", "edit", "delete"].filter((item) => granted.has(item));
      return next;
    });
  };

  const saveFolder = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const saved = await api.put("/api/settings", { processed_images_dir: dir });
      setDir(String(saved.processed_images_dir || dir));
      setResolved(String(saved.resolved_dir || ""));
      setMsg("Processed images folder saved.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save settings");
    }
  };

  const saveRoles = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const saved = await api.put("/api/settings", { role_permissions: matrix });
      setMatrix((saved.role_permissions as RoleMatrix) || matrix);
      setMsg("User role permissions saved.");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save role settings");
    }
  };

  return (
    <>
      <PageTitle icon="settings" subtitle="Processed OMR images and the view / edit / delete rights for each tab.">
        Settings
      </PageTitle>
      <form className="card" onSubmit={saveFolder}>
        <h3>Processed Images</h3>
        <label>
          Processed images location
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="/path/to/processed-omr"
            disabled={!admin}
          />
        </label>
        <p className="muted">Each Process OMR run writes aligned sheets into a new folder named after the exam, inside this location.</p>
        {resolved && <p className="muted">Current folder: {resolved}</p>}
        {admin && <button type="submit">Save Folder</button>}
      </form>
      <form className="card" onSubmit={saveRoles}>
        <h3>User Roles</h3>
        <p className="muted">Tick View, Edit, and Delete for every tab. Users only see tabs they can view.</p>
        <div className="role-tables">
          {roles.map((role) => (
            <div className="role-table-wrap" key={role}>
              <h4>{role === "admin" ? "Admin" : "User"}</h4>
              <table className="role-matrix">
                <thead>
                  <tr>
                    <th>Tab</th>
                    {actions.map((action) => (
                      <th key={action}>{action[0].toUpperCase() + action.slice(1)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabs.map((tab) => (
                    <tr key={`${role}-${tab.key}`}>
                      <td>{tab.label}</td>
                      {actions.map((action) => (
                        <td key={action}>
                          <input
                            type="checkbox"
                            disabled={!admin}
                            checked={(matrix[role]?.[tab.key] || []).includes(action)}
                            onChange={() => toggle(role, tab.key, action)}
                            aria-label={`${role} ${tab.label} ${action}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {admin && <button type="submit">Save Role Settings</button>}
        {!admin && <p className="muted">Only an admin can change role permissions.</p>}
      </form>
      {msg && <p>{msg}</p>}
      {err && <p className="error">{err}</p>}
    </>
  );
}
