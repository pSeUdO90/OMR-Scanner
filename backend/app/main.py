from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .database import Base, SessionLocal, engine
from .routers import auth, exams, layouts, students, subjects
from .security import user_from_token
from .seed import seed_reference_data


def _ensure_columns() -> None:
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(exams)")).fetchall()}
        if cols and "sample_path" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN sample_path VARCHAR(500) DEFAULT ''"))
        layout_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(omr_layouts)")).fetchall()}
        if layout_cols and "sample_path" not in layout_cols:
            conn.execute(text("ALTER TABLE omr_layouts ADD COLUMN sample_path VARCHAR(500) DEFAULT ''"))
        if layout_cols and "field_map_json" not in layout_cols:
            conn.execute(text("ALTER TABLE omr_layouts ADD COLUMN field_map_json TEXT DEFAULT '{}'"))
        if layout_cols and "is_finalized" not in layout_cols:
            conn.execute(text("ALTER TABLE omr_layouts ADD COLUMN is_finalized BOOLEAN DEFAULT 1"))
        if cols and "test_id" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN test_id VARCHAR(40) DEFAULT ''"))
        if cols and "test_no" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN test_no VARCHAR(40) DEFAULT ''"))
        if cols and "field_map_json" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN field_map_json TEXT DEFAULT '{}'"))
        if cols and "grace_marks" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN grace_marks FLOAT DEFAULT 0"))
        if cols and "grace_questions_json" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN grace_questions_json TEXT DEFAULT '[]'"))
        if cols and "class_name" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN class_name VARCHAR(40) DEFAULT ''"))
        if cols and "section" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN section VARCHAR(20) DEFAULT ''"))
        if cols and "batch" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN batch VARCHAR(40) DEFAULT ''"))
        sheet_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(exam_sheets)")).fetchall()}
        if sheet_cols and "assigned_manually" not in sheet_cols:
            conn.execute(text("ALTER TABLE exam_sheets ADD COLUMN assigned_manually BOOLEAN DEFAULT 0"))
        if sheet_cols and "alignment_json" not in sheet_cols:
            conn.execute(text("ALTER TABLE exam_sheets ADD COLUMN alignment_json TEXT DEFAULT '{}'"))
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(app_users)")).fetchall()}
        if user_cols and "must_change_password" not in user_cols:
            conn.execute(text("ALTER TABLE app_users ADD COLUMN must_change_password BOOLEAN DEFAULT 0"))
        setting_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(app_settings)")).fetchall()}
        if setting_cols and "role_permissions_json" not in setting_cols:
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN role_permissions_json TEXT DEFAULT '{}'"))
        if setting_cols and "logo_path" not in setting_cols:
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN logo_path VARCHAR(500) DEFAULT ''"))
        _ensure_indexes(conn)


# Foreign keys that routers filter on. create_all() skips tables that already
# exist, so databases created before these indexes need them added here.
FK_INDEXES = (
    ("ix_exams_layout_id", "exams", "layout_id"),
    ("ix_exam_sheets_exam_id", "exam_sheets", "exam_id"),
    ("ix_exam_sheets_student_id", "exam_sheets", "student_id"),
    ("ix_exam_subject_maps_exam_id", "exam_subject_maps", "exam_id"),
    ("ix_exam_subject_maps_subject_id", "exam_subject_maps", "subject_id"),
    ("ix_sheet_question_results_sheet_id", "sheet_question_results", "sheet_id"),
    ("ix_user_sessions_user_id", "user_sessions", "user_id"),
)


def _ensure_indexes(conn) -> None:
    tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
    for name, table, column in FK_INDEXES:
        if table in tables:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})"))


def init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
        _ensure_columns()
    except OperationalError:
        pass
    with SessionLocal() as db:
        seed_reference_data(db)


init_db()

app = FastAPI(title="OMR Software", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(subjects.router)
app.include_router(layouts.router)
app.include_router(exams.router)

PUBLIC_API = {"/api/health", "/api/auth/login", "/api/branding/logo"}

# Reachable while an account still owes a password change, so the user can see
# who they are, set a new password, and sign out. Everything else waits.
PASSWORD_CHANGE_API = {"/api/auth/me", "/api/auth/password", "/api/auth/logout"}


@app.middleware("http")
async def require_api_login(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path.startswith("/api/") and path not in PUBLIC_API:
        header = request.headers.get("authorization") or ""
        token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else None
        if not token:
            token = request.query_params.get("token") or request.cookies.get("omr_token")
        with SessionLocal() as db:
            user = user_from_token(db, token)
            must_change = bool(user.must_change_password) if user else False
        if user is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        if must_change and path not in PASSWORD_CHANGE_API:
            return JSONResponse(
                {"detail": "Set a new password before using the app"},
                status_code=403,
            )
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "omr-reader"}


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _dist_asset(full_path: str) -> Path | None:
    """Resolve a request path to a file inside the built frontend, or None.

    The SPA route is deliberately outside the login middleware, so a path that
    escapes the build directory would hand out arbitrary files to anyone.
    """
    root = FRONTEND_DIST.resolve()
    try:
        candidate = (root / full_path).resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    if not candidate.is_relative_to(root) or candidate == root:
        return None
    return candidate if candidate.is_file() else None


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        index = FRONTEND_DIST / "index.html"
        if full_path:
            asset = _dist_asset(full_path)
            if asset is not None:
                return FileResponse(asset)
        return FileResponse(index)
