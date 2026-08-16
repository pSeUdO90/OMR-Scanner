<?php

$GLOBALS['OMR_CONFIG'] = require __DIR__ . '/config.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/omr.php';
require __DIR__ . '/lib/helpers.php';
require __DIR__ . '/lib/routes_core.php';
require __DIR__ . '/lib/routes_omr.php';

function omr_migrate(): void
{
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    db()->multi_query($sql);
    while (db()->more_results()) {
        db()->next_result();
    }
}

function omr_seed(): void
{
    if (!db_one("SELECT id FROM subjects LIMIT 1")) {
        foreach ([['Physics', 'PHY'], ['Chemistry', 'CHE'], ['Biology', 'BIO'], ['Mathematics', 'MAT'], ['English', 'ENG'], ['Paper', 'PAP']] as [$name, $code]) {
            db_exec('INSERT INTO subjects (name, code) VALUES (?, ?)', 'ss', [$name, $code]);
        }
    }
    if (!db_one("SELECT id FROM app_users WHERE username='admin'")) {
        db_exec(
            'INSERT INTO app_users (username, password_hash, display_name, role, is_active) VALUES (?,?,?,?,1)',
            'ssss',
            ['admin', hash_password('admin'), 'Administrator', 'admin']
        );
    }
    get_settings_row();
    $builtins = omr_worker('builtins', [])['layouts'] ?? [];
    $slugMap = [
        'gyana-vikash-180' => 'pcb-180',
        'standard-100' => 'mcq-100',
        'jee-main-90' => 'jee-90',
    ];
    foreach ($builtins as $layout) {
        $slug = $slugMap[$layout['slug']] ?? $layout['slug'];
        if (db_one('SELECT id FROM omr_layouts WHERE slug = ?', 's', [$slug])) {
            continue;
        }
        $layout['slug'] = $slug;
        db_exec(
            'INSERT INTO omr_layouts (slug, name, description, total_questions, options, config_json, is_builtin, is_finalized, field_map_json) VALUES (?,?,?,?,?,?,0,1,?)',
            'sssisss',
            [$slug, $layout['name'], $layout['description'], (int) $layout['total_questions'], $layout['options'], json_encode($layout), '{}']
        );
    }
}
