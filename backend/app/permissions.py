from __future__ import annotations

import json

from sqlalchemy.orm import Session

from .models import AppSettings, AppUser
from .settings_store import get_settings

APP_TABS = [
    ("dashboard", "Dashboard"),
    ("students", "Students"),
    ("subjects", "Subjects"),
    ("layouts", "OMR Layouts"),
    ("exams", "Exams"),
    ("evaluation", "Evaluation"),
    ("reports", "Reports"),
    ("settings", "Settings"),
    ("users", "Users"),
]

ACTIONS = ("view", "edit", "delete")
ROLES = ("admin", "user")


def default_permissions() -> dict[str, dict[str, list[str]]]:
    all_actions = list(ACTIONS)
    admin = {key: list(all_actions) for key, _ in APP_TABS}
    user = {
        "dashboard": ["view"],
        "students": ["view", "edit"],
        "subjects": ["view"],
        "layouts": ["view"],
        "exams": ["view", "edit"],
        "evaluation": ["view", "edit"],
        "reports": ["view"],
        "settings": [],
        "users": [],
    }
    return {"admin": admin, "user": user}


def _normalize(raw: dict | None) -> dict[str, dict[str, list[str]]]:
    base = default_permissions()
    if not isinstance(raw, dict):
        return base
    for role in ROLES:
        incoming = raw.get(role) or {}
        if not isinstance(incoming, dict):
            continue
        for key, _label in APP_TABS:
            values = incoming.get(key)
            if not isinstance(values, list):
                continue
            allowed = [item for item in ACTIONS if item in values]
            if "edit" in allowed and "view" not in allowed:
                allowed.insert(0, "view")
            if "delete" in allowed and "view" not in allowed:
                allowed.insert(0, "view")
            base[role][key] = allowed
    if "view" not in base["admin"]["settings"]:
        base["admin"]["settings"] = ["view", "edit", "delete"]
    return base


def load_role_permissions(db: Session) -> dict[str, dict[str, list[str]]]:
    row = get_settings(db)
    raw = {}
    try:
        raw = json.loads(row.role_permissions_json or "{}")
    except json.JSONDecodeError:
        raw = {}
    return _normalize(raw)


def save_role_permissions(db: Session, payload: dict) -> dict[str, dict[str, list[str]]]:
    matrix = _normalize(payload)
    row = get_settings(db)
    row.role_permissions_json = json.dumps(matrix)
    db.commit()
    return matrix


def permissions_for_user(user: AppUser, db: Session) -> dict[str, list[str]]:
    matrix = load_role_permissions(db)
    role = user.role if user.role in matrix else "user"
    return matrix.get(role) or default_permissions()["user"]


def user_can(user: AppUser, tab: str, action: str, db: Session) -> bool:
    granted = permissions_for_user(user, db).get(tab) or []
    return action in granted
