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


def test_role_permissions_matrix():
    client = TestClient(app)
    got = client.get("/api/settings")
    assert got.status_code == 200, got.text
    body = got.json()
    assert "students" in {tab["key"] for tab in body["tabs"]}
    assert body["role_permissions"]["admin"]["users"] == ["view", "edit", "delete"]
    matrix = body["role_permissions"]
    matrix["user"]["students"] = ["view"]
    matrix["user"]["users"] = []
    saved = client.put("/api/settings", json={"role_permissions": matrix})
    assert saved.status_code == 200, saved.text
    assert saved.json()["role_permissions"]["user"]["students"] == ["view"]
    me = client.get("/api/auth/me").json()
    assert "view" in me["permissions"]["settings"]


def test_logo_upload_under_one_mb_and_public_fetch():
    from io import BytesIO
    from PIL import Image

    client = TestClient(app)
    buf = BytesIO()
    Image.new("RGB", (40, 24), "#2E7D32").save(buf, "PNG")
    uploaded = client.post("/api/settings/logo", files={"file": ("logo.png", buf.getvalue(), "image/png")})
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["has_custom_logo"] is True
    raw = RawClient(app)
    logo = raw.get("/api/branding/logo")
    assert logo.status_code == 200
    assert logo.content[:8] == b"\x89PNG\r\n\x1a\n"
    too_big = client.post("/api/settings/logo", files={"file": ("huge.png", b"x" * (1024 * 1024 + 10), "image/png")})
    assert too_big.status_code == 400


def test_admin_reset_password_sets_123456():
    client = TestClient(app)
    username = "reset_pw_user"
    created = client.post(
        "/api/users",
        json={"username": username, "password": "oldpass", "display_name": "Reset Me", "role": "user"},
    )
    if created.status_code == 409:
        users = client.get("/api/users").json()
        row = next(item for item in users if item["username"] == username)
    else:
        assert created.status_code == 200, created.text
        row = created.json()
    reset = client.post(f"/api/users/{row['id']}/reset-password")
    assert reset.status_code == 200, reset.text
    assert reset.json()["password"] == "123456"
    raw = RawClient(app)
    old = raw.post("/api/auth/login", json={"username": username, "password": "oldpass"})
    assert old.status_code == 401
    ok = raw.post("/api/auth/login", json={"username": username, "password": "123456"})
    assert ok.status_code == 200, ok.text


def test_user_can_change_own_password():
    from uuid import uuid4

    client = TestClient(app)
    username = f"chg_{uuid4().hex[:10]}"
    created = client.post(
        "/api/users",
        json={"username": username, "password": "pass123", "display_name": "Changer", "role": "user"},
    )
    assert created.status_code == 200, created.text
    raw = RawClient(app)
    login = raw.post("/api/auth/login", json={"username": username, "password": "pass123"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    bad = raw.put("/api/auth/password", json={"current_password": "wrong", "new_password": "newpass1"}, headers=headers)
    assert bad.status_code == 400
    changed = raw.put(
        "/api/auth/password",
        json={"current_password": "pass123", "new_password": "newpass1"},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    again = raw.post("/api/auth/login", json={"username": username, "password": "newpass1"})
    assert again.status_code == 200, again.text


def test_default_processed_dir_and_folder_browse():
    from app.settings_store import DEFAULT_PROCESSED_DIR

    assert DEFAULT_PROCESSED_DIR == r"E:\OMR Processed Sheets"
    client = TestClient(app)
    saved = client.put("/api/settings", json={"processed_images_dir": r"E:\OMR Processed Sheets"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["processed_images_dir"] == r"E:\OMR Processed Sheets"
    folders = client.get("/api/settings/folders?path=")
    assert folders.status_code == 200, folders.text
    assert "dirs" in folders.json()
    restore = client.put("/api/settings", json={"processed_images_dir": "/tmp/omr-processed-test"})
    assert restore.status_code == 200


def test_edit_student_updates_fields():
    client = TestClient(app)
    created = client.post(
        "/api/students",
        json={"roll_no": "EDIT001", "name": "Old Name", "gender": "M", "class_name": "10", "section": "A", "session": "2025-26"},
    )
    if created.status_code == 400:
        rows = client.get("/api/students").json()
        student = next(item for item in rows if item["roll_no"] == "EDIT001")
    else:
        assert created.status_code == 200, created.text
        student = created.json()
    updated = client.put(
        f"/api/students/{student['id']}",
        json={"roll_no": "EDIT001", "name": "New Name", "gender": "F", "class_name": "11", "section": "B", "session": "2026-27"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "New Name"
    assert updated.json()["class_name"] == "11"
    assert updated.json()["gender"] == "F"
