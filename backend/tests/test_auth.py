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


def test_admin_reset_password_issues_a_one_time_password():
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
    temp_password = reset.json()["password"]
    assert temp_password != "123456"
    raw = RawClient(app)
    old = raw.post("/api/auth/login", json={"username": username, "password": "oldpass"})
    assert old.status_code == 401
    ok = raw.post("/api/auth/login", json={"username": username, "password": temp_password})
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["must_change_password"] is True


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


def test_temp_passwords_are_random_and_never_a_known_constant():
    from app.routers.auth import generate_temp_password

    issued = {generate_temp_password() for _ in range(200)}
    assert len(issued) > 190
    assert "123456" not in issued
    for password in issued:
        assert len(password) >= 10
        assert not set(password) & set("0O1lI")


def test_account_with_a_temporary_password_is_gated_until_it_is_changed():
    from uuid import uuid4

    from app.models import UserSession

    client = TestClient(app)
    username = f"gated_{uuid4().hex[:8]}"
    created = client.post(
        "/api/users",
        json={"username": username, "password": "initial-pw", "display_name": "Gated", "role": "user"},
    )
    assert created.status_code == 200, created.text
    user_id = created.json()["id"]
    try:
        first = client.post(f"/api/users/{user_id}/reset-password").json()["password"]
        second = client.post(f"/api/users/{user_id}/reset-password").json()["password"]
        assert first != second, "each reset must issue a fresh password"

        raw = RawClient(app)
        login = raw.post("/api/auth/login", json={"username": username, "password": second})
        assert login.status_code == 200, login.text
        assert login.json()["user"]["must_change_password"] is True
        headers = {"Authorization": f"Bearer {login.json()['token']}"}

        # Gated everywhere except the endpoints needed to set a new password.
        assert raw.get("/api/students", headers=headers).status_code == 403
        assert raw.get("/api/exams", headers=headers).status_code == 403
        assert raw.get("/api/auth/me", headers=headers).status_code == 200

        reuse = raw.put(
            "/api/auth/password",
            headers=headers,
            json={"current_password": second, "new_password": second},
        )
        assert reuse.status_code == 400

        changed = raw.put(
            "/api/auth/password",
            headers=headers,
            json={"current_password": second, "new_password": "chosen-by-the-user"},
        )
        assert changed.status_code == 200, changed.text
        assert raw.get("/api/auth/me", headers=headers).json()["must_change_password"] is False
        assert raw.get("/api/students", headers=headers).status_code == 200
        assert raw.post("/api/auth/login", json={"username": username, "password": second}).status_code == 401
    finally:
        with SessionLocal() as db:
            row = db.query(AppUser).filter(AppUser.username == username).one_or_none()
            if row:
                db.query(UserSession).filter(UserSession.user_id == row.id).delete()
                db.delete(row)
                db.commit()


def test_configured_admin_password_does_not_force_a_change():
    from app.seed import seed_reference_data

    # conftest sets OMR_ADMIN_PASSWORD, so the admin this suite signs in as must
    # not be gated, or every other test here would be locked out.
    with SessionLocal() as db:
        seed_reference_data(db)
        admin = db.query(AppUser).filter(AppUser.username == "admin").one()
        assert bool(admin.must_change_password) is False
