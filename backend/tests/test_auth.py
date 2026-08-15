from fastapi.testclient import TestClient as RawClient

from app.database import SessionLocal
from app.main import app
from app.models import AppUser
from conftest import TestClient


def test_login_admin_and_reject_bad_password():
    raw = RawClient(app)
    bad = raw.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad.status_code == 401
    ok = raw.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["username"] == "admin"
    assert ok.json()["user"]["role"] == "admin"
    denied = raw.get("/api/students")
    assert denied.status_code == 401
    allowed = raw.get("/api/students", headers={"Authorization": f"Bearer {ok.json()['token']}"})
    assert allowed.status_code == 200


def test_admin_can_create_user_and_new_user_can_login():
    client = TestClient(app)
    username = "teacher_auth_test"
    created = client.post(
        "/api/users",
        json={"username": username, "password": "pass123", "display_name": "Teacher", "role": "user"},
    )
    if created.status_code == 409:
        users = client.get("/api/users").json()
        row = next(item for item in users if item["username"] == username)
        client.put(f"/api/users/{row['id']}", json={"username": username, "password": "pass123", "display_name": "Teacher", "role": "user", "is_active": True})
    else:
        assert created.status_code == 200, created.text
    raw = RawClient(app)
    login = raw.post("/api/auth/login", json={"username": "teacher_auth_test", "password": "pass123"})
    assert login.status_code == 200, login.text
    users = raw.get("/api/users", headers={"Authorization": f"Bearer {login.json()['token']}"})
    assert users.status_code == 403


def test_settings_processed_folder():
    client = TestClient(app)
    saved = client.put("/api/settings", json={"processed_images_dir": "/tmp/omr-processed-test"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["resolved_dir"].endswith("omr-processed-test")
    got = client.get("/api/settings")
    assert got.json()["processed_images_dir"].endswith("omr-processed-test")
    with SessionLocal() as db:
        assert db.query(AppUser).filter(AppUser.username == "admin").one().role == "admin"
