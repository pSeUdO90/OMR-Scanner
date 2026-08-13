import { NavLink, Route, Routes } from "react-router-dom";
import { NavIcon } from "./components/Icons";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentView from "./pages/StudentView";
import Subjects from "./pages/Subjects";
import Layouts from "./pages/Layouts";
import LayoutDetail from "./pages/LayoutDetail";
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
        <NavLink to="/" end><NavIcon name="dashboard" /> Dashboard</NavLink>
        <NavLink to="/students"><NavIcon name="students" /> Students</NavLink>
        <NavLink to="/subjects"><NavIcon name="subjects" /> Subjects</NavLink>
        <NavLink to="/layouts"><NavIcon name="layouts" /> OMR layouts</NavLink>
        <NavLink to="/exams"><NavIcon name="exams" /> Exams</NavLink>
        <NavLink to="/evaluation"><NavIcon name="evaluation" /> Evaluation</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentView />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/layouts" element={<Layouts />} />
          <Route path="/layouts/:id" element={<LayoutDetail />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:id" element={<ExamDetail />} />
          <Route path="/exams/:id/results" element={<Results />} />
          <Route path="/evaluation" element={<Evaluation />} />
        </Routes>
      </main>
    </div>
  );
}
