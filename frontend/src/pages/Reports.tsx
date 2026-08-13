import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Exam } from "../api";
import { Icon, iconPaths } from "../components/Icons";
import PageTitle from "../components/PageTitle";

export default function Reports() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(0);
  const exam = exams.find((item) => item.id === examId) || null;

  useEffect(() => {
    api.get("/api/exams").then((rows: Exam[]) => {
      setExams(rows);
      const ready = rows.find((item) => item.status === "evaluated" || item.status === "published") || rows[0];
      if (ready) setExamId(ready.id);
    });
  }, []);

  return (
    <>
      <PageTitle icon="reports" subtitle="Select an exam to export the full Right / Wrong / Left report for every student.">
        Reports
      </PageTitle>
      <div className="card exam-form">
        <div className="form-section">
          <h3>Exam</h3>
          <div className="row">
            <label>Select exam
              <select value={examId} onChange={(e) => setExamId(Number(e.target.value))}>
                {exams.length === 0 && <option value={0}>No exams yet</option>}
                {exams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.exam_date} · {item.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {exam && (
          <div className="form-section">
            <p className="muted">
              {exam.exam_type}
              {exam.batch ? ` · Batch ${exam.batch}` : ""}
              {exam.class_name ? ` · Class ${exam.class_name}` : ""}
              {exam.section ? ` · Section ${exam.section}` : ""}
              {exam.test_id ? ` · Test ID ${exam.test_id}` : ""}
              {" · "}{exam.evaluated_count}/{exam.sheet_count} sheets scored
            </p>
            <div className="row-actions">
              <a className="btn" href={`/api/exams/${exam.id}/results.xlsx`}>
                <Icon path={iconPaths.download} size={16} /> Export RWL Excel
              </a>
              <a className="btn secondary" href={`/api/exams/${exam.id}/results.csv`}>
                <Icon path={iconPaths.sheet} size={16} /> Export RWL CSV
              </a>
              <Link className="btn ghost" to={`/exams/${exam.id}/results`}>View results</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
