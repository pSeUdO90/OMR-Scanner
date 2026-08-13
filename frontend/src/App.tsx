import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Subjects from "./pages/Subjects";
import Layouts from "./pages/Layouts";
import Exams from "./pages/Exams";
import ExamDetail from "./pages/ExamDetail";
import Evaluation from "./pages/Evaluation";
import Results from "./pages/Results";

export default function App() {
  return (
    <div className="shell">
      <nav className="nav">
        <h1>Gyana OMR</h1>
        <p>Scan. Score. Publish RWL.</p>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/students">Students</NavLink>
        <NavLink to="/subjects">Subjects</NavLink>
        <NavLink to="/layouts">OMR layouts</NavLink>
        <NavLink to="/exams">Exams</NavLink>
        <NavLink to="/evaluation">Evaluation</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/layouts" element={<Layouts />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:id" element={<ExamDetail />} />
          <Route path="/exams/:id/results" element={<Results />} />
          <Route path="/evaluation" element={<Evaluation />} />
        </Routes>
      </main>
    </div>
  );
}
