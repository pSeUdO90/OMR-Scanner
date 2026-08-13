import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam, Student } from "../api";

export default function Dashboard() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  useEffect(() => {
    api.get("/api/exams").then(setExams);
    api.get("/api/students").then(setStudents);
  }, []);
  return (
    <>
      <h2>Examination desk</h2>
      <p className="muted">Import the student roll, pick a sheet layout, evaluate scans, then publish Right / Wrong / Left analysis.</p>
      <div className="grid">
        <div className="card"><div className="muted">Students on roll</div><div className="stat">{students.length}</div></div>
        <div className="card"><div className="muted">Exams</div><div className="stat">{exams.length}</div></div>
        <div className="card"><div className="muted">Published</div><div className="stat">{exams.filter((e) => e.status === "published").length}</div></div>
      </div>
      <div className="card">
        <h3>Recent exams</h3>
        {exams.length === 0 && <p className="muted">No exams yet. Create one after uploading students.</p>}
        {exams.map((exam) => (
          <p key={exam.id}>
            <Link to={`/exams/${exam.id}`}>{exam.name}</Link> — {exam.exam_date} · {exam.status} · {exam.evaluated_count}/{exam.sheet_count} sheets
          </p>
        ))}
      </div>
    </>
  );
}
