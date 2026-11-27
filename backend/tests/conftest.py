import os
import tempfile
from pathlib import Path

# These tests create and delete users, exams and sheets, so they get their own
# database and upload directory. Without this they run against the data the app
# is serving, and a run can take real records with it.
_SANDBOX = Path(tempfile.gettempdir()) / "omr-tests"
os.environ.setdefault("OMR_DATA_DIR", str(_SANDBOX / "data"))
os.environ.setdefault("OMR_UPLOAD_DIR", str(_SANDBOX / "uploads"))

# Seeding only forces a password change when no admin password is configured,
# so declaring one here keeps a freshly created test database usable.
os.environ.setdefault("OMR_ADMIN_PASSWORD", "admin")

from fastapi.testclient import TestClient as FastAPITestClient  # noqa: E402

from app.main import app  # noqa: E402


class TestClient(FastAPITestClient):
    """Logs in as admin so existing API tests keep working."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            res = super().post("/api/auth/login", json={"username": "admin", "password": "admin"})
            token = (res.json() or {}).get("token") if res.status_code == 200 else None
            if token:
                self.headers.update({"Authorization": f"Bearer {token}"})
        except Exception:
            pass
