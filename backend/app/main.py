from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .database import Base, SessionLocal, engine
from .routers import exams, layouts, students, subjects
from .seed import seed_reference_data


def _ensure_columns() -> None:
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(exams)")).fetchall()}
        if cols and "sample_path" not in cols:
            conn.execute(text("ALTER TABLE exams ADD COLUMN sample_path VARCHAR(500) DEFAULT ''"))


def init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
        _ensure_columns()
    except OperationalError:
        pass
    with SessionLocal() as db:
        seed_reference_data(db)


init_db()

app = FastAPI(title="Gyana OMR Reader", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(students.router)
app.include_router(subjects.router)
app.include_router(layouts.router)
app.include_router(exams.router)


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
