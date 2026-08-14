import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, DataBlock, Layout, Subject } from "../api";
import A4SheetDesigner from "../components/A4SheetDesigner";
import PageTitle from "../components/PageTitle";
import SubjectMapsEditor, { SubjectMapRow } from "../components/SubjectMapsEditor";

export default function LayoutDesign() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "A4 OMR 100",
    description: "Designed A4 OMR with predefined data blocks",
    total_questions: 100,
    columns: 4,
    options: "ABCD",
    roll_cols: 8,
    school_name: "GYANA VIKASH ENGLISH MEDIUM SCHOOL, BERHAMPUR",
  });
  const [maps, setMaps] = useState<SubjectMapRow[]>([{ subject: "Paper", start_q: 1, end_q: 100 }]);
  const [blocks, setBlocks] = useState<DataBlock[]>([]);

  useEffect(() => {
    api.get("/api/subjects").then((list: Subject[]) => {
      setSubjects(list);
      if (list.length) {
        setMaps([{ subject_id: list[0].id, subject: list[0].name, start_q: 1, end_q: form.total_questions }]);
      }
    });
    loadStandard();
  }, []);

  const loadStandard = async () => {
    const data = await api.get(
      `/api/layouts/predefined-blocks?total_questions=${form.total_questions}&columns=${form.columns}&options=${encodeURIComponent(form.options)}&roll_cols=${form.roll_cols}`
    ) as { blocks: DataBlock[] };
    setBlocks(data.blocks || []);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const created = await api.post("/api/layouts/design", {
        ...form,
        subject_maps: maps.map((m) => ({
          subject: subjects.find((s) => s.id === m.subject_id)?.name || m.subject,
          start_q: m.start_q,
          end_q: m.end_q,
        })),
        blocks,
      }) as Layout;
      navigate(`/layouts/${created.id}?tab=view`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save A4 design");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="muted"><Link to="/layouts">← OMR layouts</Link></p>
      <PageTitle icon="layouts" subtitle="A4 (210 × 297 mm). Place predefined data blocks, then save a printable sheet.">
        Design A4 OMR
      </PageTitle>
      <form className="card" onSubmit={onSave}>
        <div className="row">
          <label>Layout name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Total questions<input type="number" min={1} value={form.total_questions} onChange={(e) => setForm({ ...form, total_questions: Number(e.target.value) })} /></label>
          <label>Answer columns<input type="number" min={1} max={6} value={form.columns} onChange={(e) => setForm({ ...form, columns: Number(e.target.value) })} /></label>
          <label>Options<input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} /></label>
          <label>Roll digits<input type="number" min={4} max={12} value={form.roll_cols} onChange={(e) => setForm({ ...form, roll_cols: Number(e.target.value) })} /></label>
        </div>
        <label>School heading<input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} /></label>
        <label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <SubjectMapsEditor maps={maps} setMaps={setMaps} subjects={subjects} />
        <p>
          <button type="button" onClick={loadStandard}>Place standard A4 blocks</button>
        </p>
        <p><button type="submit" disabled={saving || !blocks.length}>{saving ? "Saving…" : "Save A4 OMR layout"}</button></p>
        {err && <p className="error">{err}</p>}
      </form>
      <div className="card">
        <A4SheetDesigner
          blocks={blocks}
          setBlocks={setBlocks}
          options={form.options || "ABCD"}
          totalQuestions={form.total_questions}
        />
      </div>
    </>
  );
}
