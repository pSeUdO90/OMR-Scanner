import { NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { NavIcon } from "./components/Icons";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentView from "./pages/StudentView";
import Subjects from "./pages/Subjects";
import Layouts from "./pages/Layouts";
import OmrStudio from "./pages/OmrStudio";
import LayoutDetail from "./pages/LayoutDetail";
import Exams from "./pages/Exams";
import ExamDetail from "./pages/ExamDetail";
import Evaluation from "./pages/Evaluation";
import Reports from "./pages/Reports";
import Results from "./pages/Results";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Login from "./pages/Login";

export default function App() {
  const { user, ready, logout } = useAuth();
  if (!ready) return <div className="login-screen"><p className="muted">Loading…</p></div>;
  if (!user) return <Login />;
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src="/logo.svg" alt="OMR Software" />
          <h1>OMR Software</h1>
        </div>
        <NavLink to="/" end><NavIcon name="dashboard" /> Dashboard</NavLink>
        <NavLink to="/students"><NavIcon name="students" /> Students</NavLink>
        <NavLink to="/subjects"><NavIcon name="subjects" /> Subjects</NavLink>
        <NavLink to="/layouts"><NavIcon name="layouts" /> OMR layouts</NavLink>
        <NavLink to="/exams"><NavIcon name="exams" /> Exams</NavLink>
        <NavLink to="/evaluation"><NavIcon name="evaluation" /> Evaluation</NavLink>
        <NavLink to="/reports"><NavIcon name="reports" /> Reports</NavLink>
        <NavLink to="/settings"><NavIcon name="settings" /> Settings</NavLink>
        {user.role === "admin" && <NavLink to="/users"><NavIcon name="users" /> Users</NavLink>}
        <button type="button" className="nav-logout" onClick={() => logout()}>
          <NavIcon name="logout" /> Log Out
        </button>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentView />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/layouts" element={<Layouts />} />
          <Route path="/layouts/studio/:id" element={<OmrStudio />} />
          <Route path="/layouts/studio" element={<OmrStudio />} />
          <Route path="/layouts/:id" element={<LayoutDetail />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:id" element={<ExamDetail />} />
          <Route path="/exams/:id/results" element={<Results />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={user.role === "admin" ? <Users /> : <Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
