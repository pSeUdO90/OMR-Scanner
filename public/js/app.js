const TOKEN_KEY = "omr_token";
const CLASS_CHOICES = ["6", "7", "8", "9", "10", "11", "12"];
const SECTION_CHOICES = ["A", "B", "C", "D", "E", "F"];
const SESSION_CHOICES = ["2024-25", "2025-26", "2026-27"];
const NAV = [
  { hash: "#/", tab: "dashboard", label: "Dashboard" },
  { hash: "#/students", tab: "students", label: "Students" },
  { hash: "#/subjects", tab: "subjects", label: "Subjects" },
  { hash: "#/layouts", tab: "layouts", label: "OMR layouts" },
  { hash: "#/exams", tab: "exams", label: "Exams" },
  { hash: "#/evaluation", tab: "evaluation", label: "Evaluation" },
  { hash: "#/reports", tab: "reports", label: "Reports" },
  { hash: "#/settings", tab: "settings", label: "Settings" },
  { hash: "#/users", tab: "users", label: "Users" },
];

let user = null;

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    document.cookie = `omr_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = "omr_token=; path=/; max-age=0; SameSite=Lax";
  }
}
function toast(kind, message) {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = `toast toast-${kind === "ok" ? "ok" : "error"}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
function authFileUrl(path) {
  const token = getToken();
  if (!token) return path;
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
async function api(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (res.status === 401 && !path.includes("/api/auth/login")) setToken("");
  if (!res.ok) {
    const message = (data && data.detail) || text || res.statusText;
    if (!path.includes("/api/settings/folders")) toast("error", message);
    throw new Error(message);
  }
  if (["POST", "PUT", "DELETE"].includes(method) && !path.includes("/auth/login") && !path.includes("/auth/me") && !path.includes("/import/preview")) {
    if (path.includes("/reset-password")) toast("ok", "Password reset to 123456");
    else if (path.includes("/auth/password")) toast("ok", "Password updated");
    else toast("ok", "Task completed");
  }
  return data;
}
const get = (p) => api("GET", p);
const post = (p, b) => api("POST", p, b);
const put = (p, b) => api("PUT", p, b);
const del = (p) => api("DELETE", p);

function can(tab, action = "view") {
  return ((user && user.permissions && user.permissions[tab]) || []).includes(action);
}
function h(html) { return html; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function route() {
  const hash = location.hash || "#/";
  return hash.replace(/^#/, "") || "/";
}
function go(hash) { location.hash = hash; }

function shell(mainHtml) {
  const links = NAV.filter((n) => can(n.tab)).map((n) =>
    `<a href="${n.hash}" class="${route().startsWith(n.hash.slice(1)) && n.hash !== "#/" || (n.hash === "#/" && route() === "/") ? "active" : ""}">${esc(n.label)}</a>`
  ).join("");
  return `<div class="shell">
    <nav class="nav">
      <div class="brand">
        <img src="${authFileUrl("/api/branding/logo")}" alt="Gyana Vikash English Medium School" />
        <h1>OMR Software</h1>
      </div>
      <div class="nav-links">${links}</div>
      <div class="nav-footer">
        <div class="nav-user-row">
          <div class="nav-username">${esc(user.display_name || user.username)}</div>
          <button type="button" class="nav-profile-btn" id="open-profile" title="Profile">⚙</button>
        </div>
        <button type="button" class="nav-logout" id="logout">Log Out</button>
      </div>
    </nav>
    <main class="main">${mainHtml}</main>
  </div>
  <div id="profile-modal" class="modal-backdrop" hidden>
    <form class="modal" id="profile-form">
      <h3>Profile</h3>
      <p class="muted">${esc(user.display_name || user.username)} · ${esc(user.role)}</p>
      <label>Current password<input type="password" name="current_password" required /></label>
      <label>New password<input type="password" name="new_password" minlength="6" required /></label>
      <label>Confirm new password<input type="password" name="confirm_password" minlength="6" required /></label>
      <div class="row-actions">
        <button type="button" class="secondary" id="close-profile">Cancel</button>
        <button type="submit">Change Password</button>
      </div>
    </form>
  </div>`;
}

function pageTitle(title, sub) {
  return `<h2>${esc(title)}</h2><p class="muted">${esc(sub)}</p>`;
}

function confirmBox(message) { return window.confirm(message); }

async function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-screen">
      <form class="card login-card" id="login-form">
        <img src="/api/branding/logo" alt="Gyana Vikash English Medium School" class="login-logo" />
        <h1>OMR Software</h1>
        <p class="muted">Sign in to continue.</p>
        <label>Username<input name="username" value="admin" autocomplete="username" required /></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required /></label>
        <p class="error" id="login-err" hidden></p>
        <button type="submit">Log In</button>
      </form>
    </div>`;
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await post("/api/auth/login", { username: fd.get("username"), password: fd.get("password") });
      setToken(data.token);
      user = data.user;
      await render();
    } catch (err) {
      const el = document.getElementById("login-err");
      el.hidden = false;
      el.textContent = err.message;
    }
  };
}

function bindShell() {
  document.getElementById("logout").onclick = async () => {
    await post("/api/auth/logout", {});
    setToken("");
    user = null;
    await render();
  };
  document.getElementById("open-profile").onclick = () => { document.getElementById("profile-modal").hidden = false; };
  document.getElementById("close-profile").onclick = () => { document.getElementById("profile-modal").hidden = true; };
  document.getElementById("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("new_password") !== fd.get("confirm_password")) {
      toast("error", "New passwords do not match");
      return;
    }
    await put("/api/auth/password", { current_password: fd.get("current_password"), new_password: fd.get("new_password") });
    document.getElementById("profile-modal").hidden = true;
  };
}

async function pageDashboard() {
  const [exams, students] = await Promise.all([get("/api/exams"), get("/api/students")]);
  const published = exams.filter((e) => e.status === "published");
  const evaluated = exams.filter((e) => e.status === "evaluated" || e.status === "published");
  const recent = evaluated.slice(0, 12);
  const stats = [
    ["Students on roll", students.length],
    ["Evaluated exams", evaluated.length],
    ["Published", published.length],
    ["Draft exams", exams.filter((e) => e.status === "draft").length],
  ];
  return `${pageTitle("Examination desk", "Live counts from evaluated and published exams.")}
    <div class="grid">${stats.map(([l, v]) => `<div class="card stat-card"><div class="muted">${esc(l)}</div><div class="stat">${v}</div></div>`).join("")}</div>
    <div class="card"><h3>Recent exams</h3>
      ${recent.length === 0 ? `<p class="muted">No evaluated or published exams yet.</p>` : `<table class="table"><thead><tr><th>Exam Name</th><th>Date</th><th>Class</th><th>Status</th><th>Sheets</th></tr></thead>
      <tbody>${recent.map((e) => `<tr><td><a href="#/exams/${e.id}">${esc(e.name)}</a></td><td>${esc(e.exam_date)}</td><td>${esc(e.class_name)}</td><td>${esc(e.status)}</td><td>${e.evaluated_count}/${e.sheet_count}</td></tr>`).join("")}</tbody></table>`}
    </div>`;
}

async function pageStudents() {
  const rows = await get("/api/students");
  const options = await get("/api/students/options").catch(() => ({ classes: [], sections: [], batches: [] }));
  const classes = [...new Set([...CLASS_CHOICES, ...(options.classes || [])])];
  const sections = [...new Set([...SECTION_CHOICES, ...(options.sections || [])])];
  const sessions = [...new Set([...SESSION_CHOICES, ...(options.batches || [])])];
  const sel = (name, vals) => `<select name="${name}" class="form-select">${vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select>`;
  return `${pageTitle("Students", "Roll no, Student Name, Gender, Class, Section, Session.")}
    <form class="card row" id="student-form">
      <input type="hidden" name="id" />
      <label>Roll no<input name="roll_no" required /></label>
      <label>Student Name<input name="name" required /></label>
      <label>Gender<select name="gender"><option>M</option><option>F</option></select></label>
      <label>Class${sel("class_name", classes)}</label>
      <label>Section${sel("section", sections)}</label>
      <label>Session${sel("session", sessions)}</label>
      <button type="submit">Save student</button>
    </form>
    <div class="card row">
      <a class="btn secondary" href="/api/students/template.xlsx">Download template</a>
      <label>Import XLSX<input type="file" id="xlsx" accept=".xlsx" /></label>
    </div>
    <div class="card">
      <input placeholder="Search" id="student-q" />
      <table class="table" id="student-table"><thead><tr><th>Roll</th><th>Name</th><th>Gender</th><th>Class</th><th>Section</th><th>Session</th><th></th></tr></thead>
      <tbody>${rows.map((s) => studentRow(s)).join("")}</tbody></table>
    </div>`;
}
function studentRow(s) {
  return `<tr data-id="${s.id}"><td>${esc(s.roll_no)}</td><td><a href="#/students/${s.id}">${esc(s.name)}</a></td><td>${esc(s.gender)}</td><td>${esc(s.class_name)}</td><td>${esc(s.section)}</td><td>${esc(s.session)}</td>
    <td class="row-actions"><button type="button" class="btn-edit" data-edit='${esc(JSON.stringify(s))}'>Edit</button>
    <button type="button" class="btn-delete" data-del="${s.id}">Delete</button></td></tr>`;
}

async function pageStudentView(id) {
  const data = await get(`/api/students/${id}/results`);
  const s = data.student;
  return `${pageTitle(s.name, `Roll ${s.roll_no} · Class ${s.class_name}-${s.section}`)}
    <div class="card"><table class="table"><thead><tr><th>Exam</th><th>Date</th><th>R</th><th>W</th><th>L</th><th>Score</th></tr></thead>
    <tbody>${(data.exams || []).map((e) => `<tr><td><a href="#/exams/${e.exam_id}/results">${esc(e.exam_name)}</a></td><td>${esc(e.exam_date)}</td><td>${e.right}</td><td>${e.wrong}</td><td>${e.left}</td><td>${e.score}/${e.max_score}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No results yet</td></tr>`}</tbody></table></div>`;
}

async function pageSubjects() {
  const rows = await get("/api/subjects");
  return `${pageTitle("Subjects", "A subject used by an exam cannot be deleted.")}
    <form class="card row" id="subject-form">
      <label>Name<input name="name" required /></label>
      <label>Code<input name="code" /></label>
      <button>Add subject</button>
    </form>
    <div class="card"><table class="table"><tbody>${rows.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td><td><button class="btn-delete" data-del="${s.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
}

async function pageLayouts() {
  const rows = await get("/api/layouts");
  return `${pageTitle("OMR layouts", "Create and edit sheets in A4 OMR Studio.")}
    <p class="card"><a class="btn-view" href="#/layouts/studio">Open A4 OMR Studio</a></p>
    <div class="card"><div class="row">${rows.map((l) => `
      <div class="card" style="min-width:16rem">
        <img src="${authFileUrl("/api/layouts/" + l.id + "/sample")}" alt="" style="width:100%;max-height:8rem;object-fit:contain;background:#fff;border-radius:8px" />
        <h4>${esc(l.name)}</h4>
        <p class="muted">${l.total_questions} questions · ${esc(l.options)}</p>
        <div class="row-actions">
          <a class="btn-edit" href="#/layouts/studio/${l.id}">Edit</a>
          <button class="btn secondary" data-copy="${l.id}">Copy</button>
          <button class="btn-delete" data-del="${l.id}">Delete</button>
        </div>
      </div>`).join("") || "<p class='muted'>No layouts yet.</p>"}</div></div>`;
}

async function pageStudio(id) {
  const existing = id ? await get(`/api/layouts/${id}`) : null;
  const cfg = existing?.studio_config || {};
  return `${pageTitle("A4 OMR Studio", "Name the sheet, set question count, and save.")}
    <form class="card" id="studio-form">
      <div class="row">
        <label>Layout name<input name="name" value="${esc(existing?.name || "")}" required /></label>
        <label>Total questions<input type="number" name="total_questions" value="${existing?.total_questions || 100}" min="1" max="400" /></label>
        <label>Columns<input type="number" name="columns" value="${cfg.questionColumns || 4}" min="1" max="6" /></label>
        <label>Roll digits<input type="number" name="rollCols" value="${cfg.rollCols || 8}" min="4" max="12" /></label>
        <label>Options<input name="options" value="${esc(existing?.options || "ABCD")}" /></label>
      </div>
      <label>Description<textarea name="description">${esc(existing?.description || "")}</textarea></label>
      <button type="submit">Save layout</button>
    </form>`;
}

async function pageExams() {
  const [exams, layouts, subjects, students, nextId] = await Promise.all([
    get("/api/exams"), get("/api/layouts"), get("/api/subjects"), get("/api/students"), get("/api/exams/next-test-id"),
  ]);
  const usable = layouts.filter((l) => l.is_finalized || l.is_builtin);
  const layoutOpts = usable.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("");
  const classSet = [...new Set(students.map((s) => s.class_name).filter(Boolean))];
  return `${pageTitle("Create exam", "Test ID is generated automatically.")}
    <form class="card" id="exam-form">
      <div class="row">
        <label>Exam name<input name="name" required /></label>
        <label>Date<input type="date" name="exam_date" value="${new Date().toISOString().slice(0,10)}" /></label>
        <label>Type<input name="exam_type" value="Unit Test" /></label>
        <label>Duration<input type="number" name="duration_minutes" value="180" /></label>
        <label>+ marks<input type="number" step="0.5" name="correct_marks" value="4" /></label>
        <label>- marks<input type="number" step="0.5" name="wrong_marks" value="-1" /></label>
        <label>Unattempted<input type="number" step="0.5" name="unattempted_marks" value="0" /></label>
        <label>Layout<select name="layout_id">${layoutOpts}</select></label>
        <label>Test ID<input name="test_id" value="${esc(nextId.test_id)}" readonly /></label>
        <label>Test no<input name="test_no" /></label>
        <label>Class<select name="class_name"><option value=""></option>${classSet.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
        <label>Section<input name="section" placeholder="A,B" /></label>
        <label>Batch / session<input name="batch" /></label>
      </div>
      <div id="maps">${(usable[0]?.preview?.default_maps || []).map((m, i) => {
        const sid = subjects.find((s) => s.name === m.subject)?.id || subjects[0]?.id || "";
        return `<div class="row map-row"><label>Subject<select name="sid">${subjects.map((s) => `<option value="${s.id}" ${s.id==sid?"selected":""}>${esc(s.name)}</option>`).join("")}</select></label>
          <label>Start<input type="number" name="start_q" value="${m.start_q}" /></label>
          <label>End<input type="number" name="end_q" value="${m.end_q}" /></label></div>`;
      }).join("")}</div>
      <button type="submit">Create exam</button>
    </form>
    <div class="card"><h3>All exams</h3>
      <table class="table"><thead><tr><th>Name</th><th>Date</th><th>Test ID</th><th>Status</th><th></th></tr></thead>
      <tbody>${exams.map((e) => `<tr><td><a href="#/exams/${e.id}">${esc(e.name)}</a></td><td>${esc(e.exam_date)}</td><td>${esc(e.test_id)}</td><td>${esc(e.status)}</td>
        <td class="row-actions"><a class="btn-edit" href="#/exams/${e.id}">Open</a><button class="btn-delete" data-del="${e.id}">Delete</button></td></tr>`).join("")}</tbody></table>
    </div>`;
}

async function pageExamDetail(id) {
  const exam = await get(`/api/exams/${id}`);
  const key = Object.entries(exam.answer_key || {}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([,v])=>v).join("");
  return `${pageTitle(exam.name, `${exam.exam_type} · ${exam.exam_date} · ${exam.status}`)}
    <div class="card">
      <p>Test ID ${esc(exam.test_id)} · Layout ${esc(exam.layout_name)} · ${exam.total_questions} questions</p>
      <div class="row-actions">
        <a class="btn" href="#/evaluation">Evaluate</a>
        <a class="btn secondary" href="#/exams/${id}/results">RWL results</a>
      </div>
    </div>
    <form class="card" id="key-form">
      <h3>Answer key</h3>
      <label>ABCD string<textarea name="key_string" rows="3">${esc(key)}</textarea></label>
      <button type="submit">Save answer key</button>
    </form>
    <form class="card row" id="grace-form">
      <label>Grace questions<input name="questions" value="${esc((exam.grace_questions||[]).join(","))}" placeholder="1,2,5-7" /></label>
      <button>Save grace</button>
    </form>`;
}

async function pageEvaluation() {
  const exams = await get("/api/exams");
  const examId = exams[0]?.id || 0;
  const exam = examId ? await get(`/api/exams/${examId}`) : null;
  const sheets = examId ? await get(`/api/exams/${examId}/sheets`) : [];
  const key = exam ? Object.entries(exam.answer_key || {}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([,v])=>v).join("") : "";
  return `${pageTitle("Evaluation", "Choose an exam, upload the answer key, then upload scanned OMR sheets.")}
    <div class="card row">
      <label>Exam<select id="eval-exam">${exams.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></label>
    </div>
    ${exam ? `
    <form class="card" id="eval-key"><label>Answer key<textarea name="key_string">${esc(key)}</textarea></label><button>Save key</button></form>
    <div class="card eval-actions">
      <label>Upload sheets<input type="file" id="sheet-files" multiple /></label>
      <button type="button" id="process-omr">Process OMR</button>
      <button type="button" id="evaluate">Evaluate</button>
      <button type="button" id="publish">Publish</button>
      <button type="button" class="btn-delete" id="reset-omr">Reset OMR</button>
    </div>
    <form class="card row" id="sample-sheet"><label>Generate sample roll<input name="roll" required /></label><button>Make sample sheet</button></form>
    <div class="card"><table class="table"><thead><tr><th>File</th><th>Roll</th><th>Student</th><th>Status</th><th>Score</th></tr></thead>
    <tbody>${sheets.map((s) => `<tr><td>${esc(s.filename)}</td><td>${esc(s.detected_roll)}</td><td>${esc(s.student_name)}</td><td>${esc(s.status)}</td><td>${s.raw_score}/${s.max_score}</td></tr>`).join("")}</tbody></table></div>` : "<p class='muted'>Create an exam first.</p>"}`;
}

async function pageReports() {
  const exams = (await get("/api/exams")).filter((e) => e.name !== "Process OMR Exam");
  const exam = exams.find((e) => e.status === "evaluated" || e.status === "published") || exams[0];
  return `${pageTitle("Reports", "Export Right / Wrong / Left reports.")}
    <div class="card">
      <label>Select exam<select id="rep-exam">${exams.map((e) => `<option value="${e.id}" ${exam && e.id===exam.id?"selected":""}>${esc(e.name)} · ${esc(e.status)}</option>`).join("")}</select></label>
      ${exam ? `<div class="row-actions" style="margin-top:1rem">
        <a class="btn" id="xlsx" href="/api/exams/${exam.id}/results.xlsx">Export RWL Excel</a>
        <a class="btn secondary" id="csv" href="/api/exams/${exam.id}/results.csv">Export RWL CSV</a>
        <a class="btn-view" href="#/exams/${exam.id}/results">View results</a>
      </div>` : ""}
    </div>`;
}

async function pageResults(id) {
  const data = await get(`/api/exams/${id}/results`);
  return `${pageTitle(data.exam_name, data.published ? "Published" : "Evaluated")}
    <div class="grid">
      <div class="card"><div class="muted">Appeared</div><div class="stat">${data.appeared}</div></div>
      <div class="card"><div class="muted">Average</div><div class="stat">${data.average_score}</div></div>
      <div class="card"><div class="muted">Highest</div><div class="stat">${data.highest_score}</div></div>
    </div>
    <div class="card"><table class="table"><thead><tr><th>Rank</th><th>Roll</th><th>Name</th><th>R</th><th>W</th><th>L</th><th>Score</th></tr></thead>
    <tbody>${(data.results||[]).map((r) => `<tr><td>${r.rank}</td><td>${esc(r.roll_no)}</td><td>${esc(r.name)}</td><td>${r.right}</td><td>${r.wrong}</td><td>${r.left}</td><td>${r.score}</td></tr>`).join("")}</tbody></table></div>`;
}

async function pageSettings() {
  const s = await get("/api/settings");
  const roles = s.roles || ["admin", "user"];
  const actions = s.actions || ["view", "edit", "delete"];
  const tabs = s.tabs || [];
  const matrix = s.role_permissions || {};
  const table = roles.map((role) => {
    const rows = tabs.map((t) => `<tr><td>${esc(t.label)}</td>${actions.map((a) => {
      const on = (matrix[role]?.[t.key] || []).includes(a);
      return `<td><input type="checkbox" data-role="${role}" data-tab="${t.key}" data-action="${a}" ${on?"checked":""} /></td>`;
    }).join("")}</tr>`).join("");
    return `<h4>${esc(role)}</h4><table class="table"><thead><tr><th>Tab</th>${actions.map((a)=>`<th>${a}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  return `${pageTitle("Settings", "Processed images folder, logo, and role permissions.")}
    <form class="card" id="folder-form">
      <label>Processed images directory<input name="dir" value="${esc(s.processed_images_dir)}" /></label>
      <p class="muted">Resolved: ${esc(s.resolved_dir)}</p>
      <button>Save folder</button>
    </form>
    <div class="card logo-settings">
      <img class="logo-preview" src="${esc(s.logo_url)}" alt="logo" />
      <label>Upload logo (under 1 MB)<input type="file" id="logo-file" accept="image/*" /></label>
      ${s.has_custom_logo ? `<button type="button" id="reset-logo" class="secondary">Reset logo</button>` : ""}
    </div>
    <form class="card" id="perm-form">${table}<button>Save permissions</button></form>`;
}

async function pageUsers() {
  const rows = await get("/api/users");
  return `${pageTitle("Users", "Default administrator is admin / admin.")}
    <form class="card row" id="user-form">
      <label>Username<input name="username" required /></label>
      <label>Password<input type="password" name="password" required /></label>
      <label>Display Name<input name="display_name" /></label>
      <label>Role<select name="role"><option value="user">User</option><option value="admin">Admin</option></select></label>
      <button>Create User</button>
    </form>
    <div class="card"><table class="table"><tbody>${rows.map((r) => `<tr>
      <td>${esc(r.username)}</td><td>${esc(r.display_name)}</td><td>${esc(r.role)}</td><td>${r.is_active?"Active":"Disabled"}</td>
      <td class="row-actions"><button data-reset="${r.id}">Reset Password</button><button class="btn-delete" data-del="${r.id}">Delete</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

async function afterRender(path) {
  bindShell();
  if (path === "/students") {
    document.getElementById("student-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      const id = body.id; delete body.id;
      if (id) await put(`/api/students/${id}`, body); else await post("/api/students", body);
      await render();
    };
    document.querySelectorAll("[data-edit]").forEach((btn) => btn.onclick = () => {
      const s = JSON.parse(btn.getAttribute("data-edit"));
      const f = document.getElementById("student-form");
      Object.entries(s).forEach(([k,v]) => { if (f[k]) f[k].value = v; });
    });
    document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
      if (!confirmBox("Delete this student?")) return;
      await del(`/api/students/${btn.dataset.del}`);
      await render();
    });
    document.getElementById("xlsx").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const data = new FormData(); data.append("file", file);
      const preview = await post("/api/students/import/preview", data);
      const on = (preview.existing || []).length && !confirmBox("Update existing rolls?") ? "skip" : "update";
      await post(`/api/students/import?on_conflict=${on}`, data);
      await render();
    };
  }
  if (path === "/subjects") {
    document.getElementById("subject-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await post("/api/subjects", { name: fd.get("name"), code: fd.get("code") });
      await render();
    };
    document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
      if (!confirmBox("Delete subject?")) return;
      await del(`/api/subjects/${btn.dataset.del}`);
      await render();
    });
  }
  if (path === "/layouts") {
    document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
      if (!confirmBox("Delete layout?")) return;
      await del(`/api/layouts/${btn.dataset.del}`);
      await render();
    });
    document.querySelectorAll("[data-copy]").forEach((btn) => btn.onclick = async () => {
      await post(`/api/layouts/${btn.dataset.copy}/copy`, {});
      await render();
    });
  }
  if (path.startsWith("/layouts/studio")) {
    const id = path.split("/")[3];
    document.getElementById("studio-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get("name"),
        description: fd.get("description"),
        total_questions: Number(fd.get("total_questions")),
        options: fd.get("options"),
        config: { questionColumns: Number(fd.get("columns")), rollCols: Number(fd.get("rollCols")) },
        geometry: {},
        blocks: [],
        mapping: {},
      };
      if (id) await put(`/api/layouts/${id}/studio`, body);
      else await post("/api/layouts/studio", body);
      go("#/layouts");
    };
  }
  if (path === "/exams") {
    document.getElementById("exam-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const maps = [...document.querySelectorAll(".map-row")].map((row) => ({
        subject_id: Number(row.querySelector("[name=sid]").value),
        start_q: Number(row.querySelector("[name=start_q]").value),
        end_q: Number(row.querySelector("[name=end_q]").value),
      }));
      await post("/api/exams", {
        name: fd.get("name"), exam_date: fd.get("exam_date"), exam_type: fd.get("exam_type"),
        duration_minutes: Number(fd.get("duration_minutes")), correct_marks: Number(fd.get("correct_marks")),
        wrong_marks: Number(fd.get("wrong_marks")), unattempted_marks: Number(fd.get("unattempted_marks")),
        layout_id: Number(fd.get("layout_id")), test_no: fd.get("test_no"), class_name: fd.get("class_name"),
        section: fd.get("section"), batch: fd.get("batch"), subject_maps: maps, answer_key: {},
      });
      await render();
    };
    document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
      if (!confirmBox("Delete exam?")) return;
      await del(`/api/exams/${btn.dataset.del}`);
      await render();
    });
  }
  if (/^\/exams\/\d+$/.test(path)) {
    const id = path.split("/")[2];
    document.getElementById("key-form").onsubmit = async (e) => {
      e.preventDefault();
      await put(`/api/exams/${id}/answer-key`, { key_string: new FormData(e.target).get("key_string") });
      await render();
    };
    document.getElementById("grace-form").onsubmit = async (e) => {
      e.preventDefault();
      await put(`/api/exams/${id}/grace`, { questions: new FormData(e.target).get("questions") });
      await render();
    };
  }
  if (path === "/evaluation") {
    const sel = document.getElementById("eval-exam");
    if (!sel) return;
    const examId = () => sel.value;
    sel.onchange = () => { /* reload via hash query skip */ location.reload(); };
    document.getElementById("eval-key")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await put(`/api/exams/${examId()}/answer-key`, { key_string: new FormData(e.target).get("key_string") });
      await render();
    });
    document.getElementById("sheet-files")?.addEventListener("change", async (e) => {
      const fd = new FormData();
      [...e.target.files].forEach((f) => fd.append("files[]", f));
      await post(`/api/exams/${examId()}/sheets`, fd);
      await render();
    });
    document.getElementById("process-omr")?.addEventListener("click", async () => { await post(`/api/exams/${examId()}/process-omr`, {}); await render(); });
    document.getElementById("evaluate")?.addEventListener("click", async () => { await post(`/api/exams/${examId()}/evaluate`, {}); await render(); });
    document.getElementById("publish")?.addEventListener("click", async () => { await post(`/api/exams/${examId()}/publish`, {}); await render(); });
    document.getElementById("reset-omr")?.addEventListener("click", async () => {
      if (!confirmBox("Reset OMR sheets?")) return;
      await post(`/api/exams/${examId()}/reset-omr`, {});
      await render();
    });
    document.getElementById("sample-sheet")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await post(`/api/exams/${examId()}/sample-sheet`, fd);
      await render();
    });
  }
  if (path === "/reports") {
    document.getElementById("rep-exam")?.addEventListener("change", (e) => {
      const id = e.target.value;
      document.getElementById("xlsx").href = `/api/exams/${id}/results.xlsx`;
      document.getElementById("csv").href = `/api/exams/${id}/results.csv`;
    });
  }
  if (path === "/settings") {
    document.getElementById("folder-form").onsubmit = async (e) => {
      e.preventDefault();
      await put("/api/settings", { processed_images_dir: new FormData(e.target).get("dir") });
      await render();
    };
    document.getElementById("logo-file").onchange = async (e) => {
      const fd = new FormData(); fd.append("file", e.target.files[0]);
      await post("/api/settings/logo", fd);
      await render();
    };
    document.getElementById("reset-logo")?.addEventListener("click", async () => { await del("/api/settings/logo"); await render(); });
    document.getElementById("perm-form").onsubmit = async (e) => {
      e.preventDefault();
      const matrix = {};
      document.querySelectorAll("#perm-form input[type=checkbox]").forEach((box) => {
        matrix[box.dataset.role] ||= {};
        matrix[box.dataset.role][box.dataset.tab] ||= [];
        if (box.checked) matrix[box.dataset.role][box.dataset.tab].push(box.dataset.action);
      });
      await put("/api/settings", { role_permissions: matrix });
      await render();
    };
  }
  if (path === "/users") {
    document.getElementById("user-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await post("/api/users", { username: fd.get("username"), password: fd.get("password"), display_name: fd.get("display_name"), role: fd.get("role"), is_active: true });
      await render();
    };
    document.querySelectorAll("[data-reset]").forEach((btn) => btn.onclick = async () => {
      await post(`/api/users/${btn.dataset.reset}/reset-password`, {});
    });
    document.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
      if (!confirmBox("Delete user?")) return;
      await del(`/api/users/${btn.dataset.del}`);
      await render();
    });
  }
}

async function render() {
  if (!getToken()) { await renderLogin(); return; }
  try { user = await get("/api/auth/me"); } catch { setToken(""); await renderLogin(); return; }
  const path = route();
  let html = "";
  try {
    if (path === "/") html = await pageDashboard();
    else if (path === "/students") html = await pageStudents();
    else if (path.startsWith("/students/")) html = await pageStudentView(path.split("/")[2]);
    else if (path === "/subjects") html = await pageSubjects();
    else if (path === "/layouts") html = await pageLayouts();
    else if (path.startsWith("/layouts/studio")) html = await pageStudio(path.split("/")[3]);
    else if (path === "/exams") html = await pageExams();
    else if (/^\/exams\/\d+\/results$/.test(path)) html = await pageResults(path.split("/")[2]);
    else if (/^\/exams\/\d+$/.test(path)) html = await pageExamDetail(path.split("/")[2]);
    else if (path === "/evaluation") html = await pageEvaluation();
    else if (path === "/reports") html = await pageReports();
    else if (path === "/settings") html = await pageSettings();
    else if (path === "/users") html = await pageUsers();
    else html = await pageDashboard();
  } catch (err) {
    html = `<p class="error">${esc(err.message)}</p>`;
  }
  document.getElementById("app").innerHTML = shell(html);
  await afterRender(path);
}

window.addEventListener("hashchange", render);
render();
