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
        setting_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(app_settings)")).fetchall()}
        if setting_cols and "role_permissions_json" not in setting_cols:
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN role_permissions_json TEXT DEFAULT '{}'"))
        if setting_cols and "logo_path" not in setting_cols:
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN logo_path VARCHAR(500) DEFAULT ''"))


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
        if user is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "omr-reader"}


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "Not found"}
        index = FRONTEND_DIST / "index.html"
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(index)
