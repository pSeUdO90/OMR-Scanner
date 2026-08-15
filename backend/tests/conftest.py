from fastapi.testclient import TestClient as FastAPITestClient

from app.main import app


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
