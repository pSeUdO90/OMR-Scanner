import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AuthUser, useAuth } from "./auth";
import { brandingLogoUrl, LOGO_UPDATED_EVENT } from "./branding";
import { NavIcon } from "./components/Icons";
import { showToast } from "./components/ToastProvider";
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

const NAV_ITEMS = [
  { to: "/", tab: "dashboard", label: "Dashboard", icon: "dashboard" as const, end: true },
  { to: "/students", tab: "students", label: "Students", icon: "students" as const },
  { to: "/subjects", tab: "subjects", label: "Subjects", icon: "subjects" as const },
  { to: "/layouts", tab: "layouts", label: "OMR layouts", icon: "layouts" as const },
  { to: "/exams", tab: "exams", label: "Exams", icon: "exams" as const },
  { to: "/evaluation", tab: "evaluation", label: "Evaluation", icon: "evaluation" as const },
  { to: "/reports", tab: "reports", label: "Reports", icon: "reports" as const },
  { to: "/settings", tab: "settings", label: "Settings", icon: "settings" as const },
  { to: "/users", tab: "users", label: "Users", icon: "users" as const },
];

function can(user: AuthUser, tab: string, action = "view") {
  return (user.permissions?.[tab] || []).includes(action);
}

function Guard({ tab, user, children }: { tab: string; user: AuthUser; children: ReactNode }) {
  if (!can(user, tab, "view")) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, ready, logout } = useAuth();
  const [logoSrc, setLogoSrc] = useState(brandingLogoUrl());
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    const refresh = () => setLogoSrc(brandingLogoUrl());
    window.addEventListener(LOGO_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(LOGO_UPDATED_EVENT, refresh);
  }, []);
  if (!ready) return <div className="login-screen"><p className="muted">Loading…</p></div>;
  if (!user) return <Login />;
  const home = NAV_ITEMS.find((item) => can(user, item.tab))?.to || "/";
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src={logoSrc} alt="Gyana Vikash English Medium School" />
          <h1>OMR Software</h1>
        </div>
        <div className="nav-links">
          {NAV_ITEMS.filter((item) => can(user, item.tab)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <NavIcon name={item.icon} /> {item.label}
            </NavLink>
          ))}
        </div>
        <div className="nav-footer">
          <div className="nav-user-row">
            <div className="nav-username">{user.display_name || user.username}</div>
            <button
              type="button"
              className="nav-profile-btn"
              title="Profile"
              aria-label="Open profile"
              onClick={() => setProfileOpen(true)}
            >
              <NavIcon name="settings" />
            </button>
          </div>
          <button type="button" className="nav-logout" onClick={() => logout()}>
            <NavIcon name="logout" /> Log Out
          </button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={can(user, "dashboard") ? <Dashboard /> : <Navigate to={home} replace />} />
          <Route path="/students" element={<Guard tab="students" user={user}><Students /></Guard>} />
          <Route path="/students/:id" element={<Guard tab="students" user={user}><StudentView /></Guard>} />
          <Route path="/subjects" element={<Guard tab="subjects" user={user}><Subjects /></Guard>} />
          <Route path="/layouts" element={<Guard tab="layouts" user={user}><Layouts /></Guard>} />
          <Route path="/layouts/studio/:id" element={<Guard tab="layouts" user={user}><OmrStudio /></Guard>} />
          <Route path="/layouts/studio" element={<Guard tab="layouts" user={user}><OmrStudio /></Guard>} />
          <Route path="/layouts/:id" element={<Guard tab="layouts" user={user}><LayoutDetail /></Guard>} />
          <Route path="/exams" element={<Guard tab="exams" user={user}><Exams /></Guard>} />
          <Route path="/exams/:id" element={<Guard tab="exams" user={user}><ExamDetail /></Guard>} />
          <Route path="/exams/:id/results" element={<Guard tab="reports" user={user}><Results /></Guard>} />
          <Route path="/evaluation" element={<Guard tab="evaluation" user={user}><Evaluation /></Guard>} />
          <Route path="/reports" element={<Guard tab="reports" user={user}><Reports /></Guard>} />
          <Route path="/settings" element={<Guard tab="settings" user={user}><Settings /></Guard>} />
          <Route path="/users" element={<Guard tab="users" user={user}><Users /></Guard>} />
        </Routes>
      </main>
      {profileOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form
            className="modal"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (newPassword !== confirmPassword) {
                showToast("error", "New passwords do not match");
                return;
              }
              await api.put("/api/auth/password", {
                current_password: currentPassword,
                new_password: newPassword,
              });
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setProfileOpen(false);
            }}
          >
            <h3>Profile</h3>
            <p className="muted">{user.display_name || user.username} · {user.role}</p>
            <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
            <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required /></label>
            <label>Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required /></label>
            {newPassword && confirmPassword && newPassword !== confirmPassword && <p className="error">New passwords do not match.</p>}
            <div className="row-actions">
              <button type="button" className="secondary" onClick={() => setProfileOpen(false)}>Cancel</button>
              <button type="submit" disabled={Boolean(newPassword) && newPassword !== confirmPassword}>Change Password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
