import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("OMR_DATA_DIR") or (_BACKEND_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = Path(os.environ.get("OMR_UPLOAD_DIR") or (_BACKEND_ROOT / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("OMR_DATABASE_URL") or f"sqlite:///{DATA_DIR / 'omr.db'}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
