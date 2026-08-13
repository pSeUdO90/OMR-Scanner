import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, Student } from "../api";
import PageTitle from "../components/PageTitle";

type Rwl = {
  subject_name: string;
  right: number;
  wrong: number;
  left: number;
  invalid: number;
  accuracy: number;
  score: number;
  max_score: number;
  total: number;
};

type ExamHistory = {
  exam_id: number;
  exam_name: string;
  exam_date: string;
  exam_type: string;
  test_id: string;
  test_no: string;
  status: string;
  right: number;
  wrong: number;
  left: number;
  invalid: number;
  score: number;
  max_score: number;
  percentage: number;
  overall_rwl: Rwl;
  subjects: Rwl[];
};

function Bar({ r }: { r: Rwl }) {
  const t = Math.max(r.total, 1);
  return (
    <div className="bar" title={`R ${r.right} W ${r.wrong} L ${r.left}`}>
      <span className="r" style={{ width: `${(r.right / t) * 100}%` }} />
      <span className="w" style={{ width: `${(r.wrong / t) * 100}%` }} />
      <span className="l" style={{ width: `${(r.left / t) * 100}%` }} />
      <span className="i" style={{ width: `${(r.invalid / t) * 100}%` }} />
    </div>
  );
}

export default function StudentView() {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [exams, setExams] = useState<ExamHistory[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get(`/api/students/${id}/results`)
      .then((data) => {
        setStudent(data.student);
        setExams(data.exams || []);
      })
      .catch((error) => setErr(error instanceof Error ? error.message : "Could not load student"));
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!student) return <p>Loading…</p>;

  return (
    <>
      <p className="muted"><Link to="/students">← Students</Link></p>
      <PageTitle icon="students">
        {student.name}
      </PageTitle>
      <p className="muted">
        Roll {student.roll_no} · {student.gender} · Class {student.class_name}-{student.section} · {student.session}
      </p>
      {exams.length === 0 && <p className="muted">No evaluated exams yet for this student.</p>}
      {exams.map((exam) => (
        <div className="card" key={exam.exam_id}>
          <h3>
            <Link to={`/exams/${exam.exam_id}/results`}>{exam.exam_name}</Link>
          </h3>
          <p className="muted">
            {exam.exam_type} · {exam.exam_date}
            {exam.test_id ? ` · Test ID ${exam.test_id}` : ""}
            {exam.test_no ? ` · Test No ${exam.test_no}` : ""}
            {" · "}{exam.status}
          </p>
          <p>
            <span className="pill R">R {exam.right}</span>{" "}
            <span className="pill W">W {exam.wrong}</span>{" "}
            <span className="pill L">L {exam.left}</span>{" "}
            <span className="pill I">I {exam.invalid}</span>
            {" · "}{exam.score}/{exam.max_score} ({exam.percentage}%)
          </p>
          <h4>Overall RWL</h4>
          <Bar r={exam.overall_rwl} />
          {exam.subjects.map((s) => (
            <div key={s.subject_name} style={{ marginTop: "0.7rem" }}>
              <strong>{s.subject_name}</strong> · accuracy {s.accuracy}% · {s.score}/{s.max_score}
              <Bar r={s} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
