from fastapi.testclient import TestClient as RawClient

from app.main import app
from conftest import TestClient

# The SPA route sits outside the login middleware, so each of these must come
# back as the app shell rather than the contents of a file outside the build.
TRAVERSAL_PATHS = (
    "/../../backend/data/omr.db",
    "/../backend/app/main.py",
    "/../../../etc/passwd",
    "/..%2f..%2fbackend%2fdata%2fomr.db",
    "/static/../../../backend/data/omr.db",
)


def test_spa_route_does_not_serve_files_outside_the_build():
    raw = RawClient(app)
    for path in TRAVERSAL_PATHS:
        res = raw.get(path)
        assert res.status_code == 200, path
        body = res.content
        assert not body.startswith(b"SQLite format 3"), f"database leaked via {path}"
        assert b"root:" not in body[:400], f"passwd leaked via {path}"
        assert b"FRONTEND_DIST" not in body, f"source leaked via {path}"
        assert body.lstrip().startswith(b"<!doctype html>"), path


def test_spa_route_still_serves_the_app():
    raw = RawClient(app)
    for path in ("/", "/exams", "/index.html", "/layouts/studio"):
        res = raw.get(path)
        assert res.status_code == 200, path
        assert res.content.lstrip().startswith(b"<!doctype html>"), path


def test_unknown_api_path_is_not_reported_as_success():
    client = TestClient(app)
    res = client.get("/api/not-a-real-endpoint")
    assert res.status_code == 404
