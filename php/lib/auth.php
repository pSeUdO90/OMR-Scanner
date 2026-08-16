<?php

const APP_TABS = [
    'dashboard' => 'Dashboard',
    'students' => 'Students',
    'subjects' => 'Subjects',
    'layouts' => 'OMR Layouts',
    'exams' => 'Exams',
    'evaluation' => 'Evaluation',
    'reports' => 'Reports',
    'settings' => 'Settings',
    'users' => 'Users',
];

function default_permissions(): array
{
    $all = ['view', 'edit', 'delete'];
    $admin = [];
    foreach (array_keys(APP_TABS) as $key) {
        $admin[$key] = $all;
    }
    return [
        'admin' => $admin,
        'user' => [
            'dashboard' => ['view'],
            'students' => ['view', 'edit'],
            'subjects' => ['view'],
            'layouts' => ['view'],
            'exams' => ['view', 'edit'],
            'evaluation' => ['view', 'edit'],
            'reports' => ['view'],
            'settings' => [],
            'users' => [],
        ],
    ];
}

function normalize_permissions(?array $raw): array
{
    $base = default_permissions();
    if (!is_array($raw)) {
        return $base;
    }
    foreach (['admin', 'user'] as $role) {
        $incoming = $raw[$role] ?? [];
        if (!is_array($incoming)) {
            continue;
        }
        foreach (array_keys(APP_TABS) as $key) {
            $values = $incoming[$key] ?? null;
            if (!is_array($values)) {
                continue;
            }
            $allowed = array_values(array_intersect(['view', 'edit', 'delete'], $values));
            if (in_array('edit', $allowed, true) && !in_array('view', $allowed, true)) {
                array_unshift($allowed, 'view');
            }
            if (in_array('delete', $allowed, true) && !in_array('view', $allowed, true)) {
                array_unshift($allowed, 'view');
            }
            $base[$role][$key] = $allowed;
        }
    }
    if (!in_array('view', $base['admin']['settings'], true)) {
        $base['admin']['settings'] = ['view', 'edit', 'delete'];
    }
    return $base;
}

function get_settings_row(): array
{
    $row = db_one('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1');
    if (!$row) {
        $dir = $GLOBALS['OMR_CONFIG']['default_processed'];
        db_exec('INSERT INTO app_settings (processed_images_dir, role_permissions_json, logo_path) VALUES (?, ?, ?)', 'sss', [$dir, '{}', '']);
        $row = db_one('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1');
    }
    return $row;
}

function load_role_permissions(): array
{
    $row = get_settings_row();
    $raw = json_decode($row['role_permissions_json'] ?: '{}', true);
    return normalize_permissions(is_array($raw) ? $raw : []);
}

function permissions_for_user(array $user): array
{
    $matrix = load_role_permissions();
    $role = $user['role'] ?? 'user';
    return $matrix[$role] ?? $matrix['user'];
}

function user_can(array $user, string $tab, string $action): bool
{
    $granted = permissions_for_user($user)[$tab] ?? [];
    return in_array($action, $granted, true);
}

function user_out(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'] ?: $user['username'],
        'role' => $user['role'],
        'is_active' => (bool) $user['is_active'],
        'permissions' => permissions_for_user($user),
    ];
}

function hash_password(string $password): string
{
    $salt = bin2hex(random_bytes(16));
    $digest = hash_pbkdf2('sha256', $password, $salt, 120000, 64);
    return 'pbkdf2$' . $salt . '$' . $digest;
}

function verify_password(string $password, string $stored): bool
{
    $parts = explode('$', $stored, 3);
    if (count($parts) !== 3 || $parts[0] !== 'pbkdf2') {
        return password_verify($password, $stored);
    }
    [, $salt, $digest] = $parts;
    $check = hash_pbkdf2('sha256', $password, $salt, 120000, 64);
    return hash_equals($digest, $check);
}

function current_user(): ?array
{
    $token = bearer_token();
    if (!$token) {
        return null;
    }
    $row = db_one(
        'SELECT u.* FROM user_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token = ?',
        's',
        [$token]
    );
    if (!$row || !$row['is_active']) {
        return null;
    }
    return $row;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        fail(401, 'Not authenticated');
    }
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') {
        fail(403, 'Admin access required');
    }
    return $user;
}

function create_session(int $userId): string
{
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    db_exec('INSERT INTO user_sessions (token, user_id) VALUES (?, ?)', 'si', [$token, $userId]);
    return $token;
}
