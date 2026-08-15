import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Student } from "../api";
import { EditLink } from "../components/ActionButtons";
import { BulkBar, SelectAllCell, SelectCell, setAll, toggleId } from "../components/BulkSelect";
import { useConfirm } from "../components/ConfirmProvider";
import { Icon, iconPaths } from "../components/Icons";
import PageTitle from "../components/PageTitle";

export default function Dashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const confirm = useConfirm();
  const load = () => {
    api.get("/api/exams").then((rows) => setExams(rows as Exam[]));
    api.get("/api/students").then((rows) => setStudents(rows as Student[]));
  };
  useEffect(() => { load(); }, []);
  const published = exams.filter((e) => e.status === "published");
  const evaluated = exams.filter((e) => e.status === "evaluated" || e.status === "published");
  const recent = evaluated.slice(0, 12);
  const stats = [
    { label: "Students on roll", value: students.length, icon: "students" as const },
    { label: "Evaluated exams", value: evaluated.length, icon: "evaluation" as const },
    { label: "Published", value: published.length, icon: "published" as const },
    { label: "Draft exams", value: exams.filter((e) => e.status === "draft").length, icon: "draft" as const },
  ];
  return (
    <>
      <PageTitle icon="dashboard" subtitle="Live counts from evaluated and published exams. Drafts stay on the Exams page until they are evaluated.">
        Examination desk
      </PageTitle>
      <div className="grid">
        {stats.map((item) => (
          <div className="card stat-card" key={item.label}>
            <div className="stat-icon"><Icon path={iconPaths[item.icon]} size={22} /></div>
            <div>
              <div className="muted">{item.label}</div>
              <div className="stat">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Recent exams</h3>
        {recent.length === 0 ? (
          <p className="muted">No evaluated or published exams yet. Draft exams are listed under Exams until you evaluate them.</p>
        ) : (
          <>
          <BulkBar
            count={selected.size}
            onDelete={async () => {
              const ok = await confirm({
                title: "Delete exams",
                message: `Delete ${selected.size} exam(s)? This cannot be undone.`,
              });
              if (!ok) return;
              for (const id of selected) await api.del(`/api/exams/${id}`);
              setSelected(new Set());
              load();
            }}
          />
          <table>
            <thead>
              <tr>
                <SelectAllCell
                  checked={recent.length > 0 && recent.every((e) => selected.has(e.id))}
                  indeterminate={recent.some((e) => selected.has(e.id))}
                  onChange={(on) => setSelected(setAll(recent.map((e) => e.id), on))}
                />
                <th>Exam Name</th><th>Date</th><th>Class</th><th>Section</th><th>Batch</th>
                <th>Test ID</th><th>Status</th><th>Sheets</th><th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((exam) => (
                <tr key={exam.id}>
                  <SelectCell checked={selected.has(exam.id)} onChange={(on) => setSelected(toggleId(selected, exam.id, on))} label={`Select ${exam.name}`} />
                  <td><Link to={`/exams/${exam.id}`}>{exam.name}</Link></td>
                  <td>{exam.exam_date}</td>
                  <td>{exam.class_name || "—"}</td>
                  <td>{exam.section || "—"}</td>
                  <td>{exam.batch || "—"}</td>
                  <td>{exam.test_id || "—"}</td>
                  <td><span className="pill R">{exam.status}</span></td>
                  <td>{exam.evaluated_count}/{exam.sheet_count}</td>
                  <td className="row-actions">
                    <EditLink to={`/exams/${exam.id}?tab=edit`}>Edit</EditLink>
                    <Link className="btn secondary" to={`/exams/${exam.id}/results`}>Results</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </>
  );
}
