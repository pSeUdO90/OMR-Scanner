import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { brandingLogoUrl, notifyLogoUpdated } from "../branding";
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
  const [logoUrl, setLogoUrl] = useState(brandingLogoUrl());
  const [hasCustomLogo, setHasCustomLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseDirs, setBrowseDirs] = useState<string[]>([]);
  const admin = user?.role === "admin";

  const load = () => {
    api.get("/api/settings").then((row) => {
      setDir(String(row.processed_images_dir || ""));
      setResolved(String(row.resolved_dir || ""));
      setTabs((row.tabs as TabDef[]) || []);
      setActions((row.actions as string[]) || ["view", "edit", "delete"]);
      setRoles((row.roles as string[]) || ["admin", "user"]);
      setMatrix((row.role_permissions as RoleMatrix) || {});
      setHasCustomLogo(Boolean(row.has_custom_logo));
      setLogoUrl(String(row.logo_url || brandingLogoUrl()));
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

  const openBrowse = async (path = dir || "E:\\OMR Processed Sheets") => {
    setErr("");
    try {
      const listing = await api.get(`/api/settings/folders?path=${encodeURIComponent(path)}`);
      setBrowsePath(String(listing.path || path));
      setBrowseParent(listing.parent == null ? null : String(listing.parent));
      setBrowseDirs((listing.dirs as string[]) || []);
      setBrowseOpen(true);
    } catch (error) {
      try {
        const listing = await api.get("/api/settings/folders?path=");
        setBrowsePath(String(listing.path || ""));
        setBrowseParent(listing.parent == null ? null : String(listing.parent));
        setBrowseDirs((listing.dirs as string[]) || []);
        setBrowseOpen(true);
      } catch {
        setErr(error instanceof Error ? error.message : "Could not browse folders on this computer");
      }
    }
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
      <div className="card">
        <h3>Software Logo</h3>
        <p className="muted">PNG, JPG, WEBP, GIF, or SVG. Maximum size 1 MB.</p>
        <div className="logo-settings">
          <img src={logoUrl} alt="Current software logo" className="logo-preview" />
          <div className="row">
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setErr("");
                setMsg("");
                if (file.size > 1024 * 1024) {
                  setErr("Logo must be under 1 MB");
                  return;
                }
                const data = new FormData();
                data.append("file", file);
                try {
                  const saved = await api.post("/api/settings/logo", data);
                  setHasCustomLogo(Boolean(saved.has_custom_logo));
                  setLogoUrl(String(saved.logo_url || brandingLogoUrl()));
                  notifyLogoUpdated();
                  setMsg("Software logo updated.");
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Could not update logo");
                }
              }}
            />
            {admin && (
              <button type="button" onClick={() => logoRef.current?.click()}>
                Change Logo
              </button>
            )}
            {admin && hasCustomLogo && (
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  setErr("");
                  setMsg("");
                  try {
                    const saved = await api.del("/api/settings/logo");
                    setHasCustomLogo(Boolean(saved.has_custom_logo));
                    setLogoUrl(String(saved.logo_url || brandingLogoUrl()));
                    notifyLogoUpdated();
                    setMsg("Default logo restored.");
                  } catch (error) {
                    setErr(error instanceof Error ? error.message : "Could not restore logo");
                  }
                }}
              >
                Restore Default
              </button>
            )}
          </div>
        </div>
        {!admin && <p className="muted">Only an admin can change the logo.</p>}
      </div>
      <form className="card" onSubmit={saveFolder}>
        <h3>Processed Images</h3>
        <label>
          Processed images location
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="E:\OMR Processed Sheets"
            disabled={!admin}
          />
        </label>
        <p className="muted">Each Process OMR run writes aligned sheets into a new folder named after the exam, inside this location.</p>
        {resolved && <p className="muted">Current folder: {resolved}</p>}
        {admin && (
          <div className="row">
            <button type="button" className="secondary" onClick={() => openBrowse()}>Browse</button>
            <button type="submit">Save Folder</button>
          </div>
        )}
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
      {browseOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Choose folder</h3>
            <p className="muted">{browsePath || "Select a folder"}</p>
            <div className="row-actions">
              {browseParent != null && (
                <button type="button" className="secondary" onClick={() => openBrowse(browseParent)}>Up</button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDir(browsePath || dir);
                  setBrowseOpen(false);
                }}
              >
                Use This Folder
              </button>
              <button type="button" className="ghost" onClick={() => setBrowseOpen(false)}>Cancel</button>
            </div>
            <div className="folder-list">
              {browseDirs.map((item) => (
                <button key={item} type="button" className="ghost" onClick={() => openBrowse(item)}>
                  {item}
                </button>
              ))}
              {browseDirs.length === 0 && <p className="muted">No subfolders in this location.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
