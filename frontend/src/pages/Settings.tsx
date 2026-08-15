import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageTitle from "../components/PageTitle";

export default function Settings() {
  const { user } = useAuth();
  const [dir, setDir] = useState("");
  const [resolved, setResolved] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const admin = user?.role === "admin";

  const load = () => {
    api.get("/api/settings").then((row) => {
      setDir(String(row.processed_images_dir || ""));
      setResolved(String(row.resolved_dir || ""));
    });
  };
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: FormEvent) => {
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

  return (
    <>
      <PageTitle icon="settings" subtitle="Processed OMR images are saved here, in a folder named after each exam.">
        Settings
      </PageTitle>
      <form className="card" onSubmit={onSubmit}>
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
        {admin && <button type="submit">Save Settings</button>}
        {!admin && <p className="muted">Only an admin can change this path.</p>}
      </form>
      {msg && <p>{msg}</p>}
      {err && <p className="error">{err}</p>}
    </>
  );
}
