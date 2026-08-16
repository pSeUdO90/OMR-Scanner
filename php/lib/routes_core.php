<?php

function dispatch_api(string $method, string $path): void
{
    $public = ['/api/health', '/api/auth/login', '/api/branding/logo'];
    if ($method === 'OPTIONS') {
        ok(['ok' => true]);
    }
    if (str_starts_with($path, '/api/') && !in_array($path, $public, true) && !preg_match('#^/api/branding/logo#', $path)) {
        require_user();
    }

    if ($path === '/api/health' && $method === 'GET') {
        ok(['ok' => true, 'service' => 'omr-reader']);
    }

    if ($path === '/api/auth/login' && $method === 'POST') {
        $p = json_body();
        $user = db_one('SELECT * FROM app_users WHERE username = ?', 's', [trim($p['username'] ?? '')]);
        if (!$user || !$user['is_active'] || !verify_password($p['password'] ?? '', $user['password_hash'])) {
            fail(401, 'Invalid username or password');
        }
        $token = create_session((int) $user['id']);
        ok(['token' => $token, 'user' => user_out($user)]);
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        $token = bearer_token();
        if ($token) {
            db_exec('DELETE FROM user_sessions WHERE token = ?', 's', [$token]);
        }
        ok(['ok' => true]);
    }
    if ($path === '/api/auth/me' && $method === 'GET') {
        ok(user_out(require_user()));
    }
    if ($path === '/api/auth/password' && $method === 'PUT') {
        $user = require_user();
        $p = json_body();
        if (!verify_password($p['current_password'] ?? '', $user['password_hash'])) {
            fail(400, 'Current password is incorrect');
        }
        $new = trim($p['new_password'] ?? '');
        if (strlen($new) < 6) {
            fail(400, 'New password must be at least 6 characters');
        }
        db_exec('UPDATE app_users SET password_hash = ? WHERE id = ?', 'si', [hash_password($new), (int) $user['id']]);
        ok(['ok' => true]);
    }

    if ($path === '/api/users' && $method === 'GET') {
        require_admin();
        ok(array_map('user_out', db_all('SELECT * FROM app_users ORDER BY username')));
    }
    if ($path === '/api/users' && $method === 'POST') {
        require_admin();
        $p = json_body();
        $username = trim($p['username'] ?? '');
        if ($username === '' || ($p['password'] ?? '') === '') {
            fail(400, 'Username and password are required');
        }
        if (!in_array($p['role'] ?? 'user', ['admin', 'user'], true)) {
            fail(400, 'Role must be admin or user');
        }
        if (db_one('SELECT id FROM app_users WHERE username = ?', 's', [$username])) {
            fail(409, 'Username already exists');
        }
        db_exec(
            'INSERT INTO app_users (username, password_hash, display_name, role, is_active) VALUES (?, ?, ?, ?, ?)',
            'ssssi',
            [$username, hash_password($p['password']), trim($p['display_name'] ?? '') ?: $username, $p['role'] ?? 'user', !empty($p['is_active']) ? 1 : 0]
        );
        ok(user_out(db_one('SELECT * FROM app_users WHERE id = ?', 'i', [db_insert_id()])));
    }
    if (preg_match('#^/api/users/(\d+)$#', $path, $m)) {
        require_admin();
        $id = (int) $m[1];
        $row = db_one('SELECT * FROM app_users WHERE id = ?', 'i', [$id]);
        if (!$row) {
            fail(404, 'User not found');
        }
        if ($method === 'PUT') {
            $p = json_body();
            $username = trim($p['username'] ?? '');
            if ($username === '') {
                fail(400, 'Username is required');
            }
            if (!in_array($p['role'] ?? '', ['admin', 'user'], true)) {
                fail(400, 'Role must be admin or user');
            }
            if (db_one('SELECT id FROM app_users WHERE username = ? AND id != ?', 'si', [$username, $id])) {
                fail(409, 'Username already exists');
            }
            if ($row['role'] === 'admin' && ($p['role'] ?? '') !== 'admin') {
                $admins = db_one("SELECT COUNT(*) AS c FROM app_users WHERE role='admin' AND is_active=1");
                if ((int) $admins['c'] <= 1) {
                    fail(400, 'Keep at least one admin account');
                }
            }
            $hash = $row['password_hash'];
            if (!empty($p['password'])) {
                $hash = hash_password($p['password']);
            }
            db_exec(
                'UPDATE app_users SET username=?, display_name=?, role=?, is_active=?, password_hash=? WHERE id=?',
                'sssisi',
                [$username, trim($p['display_name'] ?? '') ?: $username, $p['role'], !empty($p['is_active']) ? 1 : 0, $hash, $id]
            );
            ok(user_out(db_one('SELECT * FROM app_users WHERE id = ?', 'i', [$id])));
        }
        if ($method === 'DELETE') {
            $current = require_admin();
            if ((int) $row['id'] === (int) $current['id']) {
                fail(400, 'You cannot delete your own account');
            }
            if ($row['role'] === 'admin') {
                $admins = db_one("SELECT COUNT(*) AS c FROM app_users WHERE role='admin' AND is_active=1");
                if ((int) $admins['c'] <= 1) {
                    fail(400, 'Keep at least one admin account');
                }
            }
            db_exec('DELETE FROM app_users WHERE id = ?', 'i', [$id]);
            ok(['ok' => true]);
        }
    }
    if (preg_match('#^/api/users/(\d+)/reset-password$#', $path, $m) && $method === 'POST') {
        require_admin();
        $row = db_one('SELECT * FROM app_users WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'User not found');
        }
        db_exec('UPDATE app_users SET password_hash = ? WHERE id = ?', 'si', [hash_password('123456'), (int) $row['id']]);
        db_exec('DELETE FROM user_sessions WHERE user_id = ?', 'i', [(int) $row['id']]);
        ok(['ok' => true, 'username' => $row['username'], 'password' => '123456']);
    }

    if ($path === '/api/settings' && $method === 'GET') {
        require_user();
        ok(settings_body());
    }
    if ($path === '/api/settings' && $method === 'PUT') {
        require_admin();
        $p = json_body();
        $row = get_settings_row();
        $dir = $p['processed_images_dir'] ?? $row['processed_images_dir'];
        $perms = $row['role_permissions_json'];
        if (isset($p['role_permissions'])) {
            $perms = json_encode(normalize_permissions($p['role_permissions']));
        }
        db_exec('UPDATE app_settings SET processed_images_dir = ?, role_permissions_json = ? WHERE id = ?', 'ssi', [trim((string) $dir), $perms, (int) $row['id']]);
        ok(settings_body());
    }
    if ($path === '/api/settings/folders' && $method === 'GET') {
        require_admin();
        ok(list_folders($_GET['path'] ?? ''));
    }
    if (preg_match('#^/api/branding/logo#', $path) && $method === 'GET') {
        $row = get_settings_row();
        $pathFile = (trim($row['logo_path'] ?? '') && is_file($row['logo_path'])) ? $row['logo_path'] : $GLOBALS['OMR_CONFIG']['default_logo'];
        send_file($pathFile);
    }
    if ($path === '/api/settings/logo' && $method === 'POST') {
        require_admin();
        if (empty($_FILES['file']['tmp_name'])) {
            fail(400, 'Use a PNG, JPG, WEBP, GIF, or SVG image under 1 MB');
        }
        $data = file_get_contents($_FILES['file']['tmp_name']);
        if (strlen($data) > $GLOBALS['OMR_CONFIG']['max_logo']) {
            fail(400, 'Logo must be under 1 MB');
        }
        $name = strtolower($_FILES['file']['name'] ?? 'logo.png');
        $ext = '.png';
        foreach (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] as $e) {
            if (str_ends_with($name, $e)) {
                $ext = $e === '.jpeg' ? '.jpg' : $e;
            }
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/branding';
        ensure_dir($dir);
        $dest = $dir . '/logo-' . bin2hex(random_bytes(8)) . $ext;
        file_put_contents($dest, $data);
        $row = get_settings_row();
        db_exec('UPDATE app_settings SET logo_path = ? WHERE id = ?', 'si', [$dest, (int) $row['id']]);
        ok(settings_body());
    }
    if ($path === '/api/settings/logo' && $method === 'DELETE') {
        require_admin();
        $row = get_settings_row();
        db_exec('UPDATE app_settings SET logo_path = ? WHERE id = ?', 'si', ['', (int) $row['id']]);
        ok(settings_body());
    }

    students_routes($method, $path);
    subjects_routes($method, $path);
    layouts_routes($method, $path);
    exams_routes($method, $path);

    fail(404, 'Not found');
}

function students_routes(string $method, string $path): void
{
    if ($path === '/api/students' && $method === 'GET') {
        ok(array_map(fn ($r) => student_out($r), db_all('SELECT * FROM students ORDER BY roll_no')));
    }
    if ($path === '/api/students/options' && $method === 'GET') {
        $rows = db_all('SELECT class_name, section, session FROM students');
        $classes = $sections = $batches = [];
        $byClass = [];
        foreach ($rows as $s) {
            if ($s['class_name']) {
                $classes[$s['class_name']] = true;
            }
            if ($s['section']) {
                $sections[$s['section']] = true;
            }
            if ($s['session']) {
                $batches[$s['session']] = true;
            }
            $cls = $s['class_name'];
            if ($cls) {
                $byClass[$cls] ??= ['sections' => [], 'batches' => []];
                if ($s['section']) {
                    $byClass[$cls]['sections'][$s['section']] = true;
                }
                if ($s['session']) {
                    $byClass[$cls]['batches'][$s['session']] = true;
                }
            }
        }
        $outBy = [];
        foreach ($byClass as $cls => $data) {
            $outBy[$cls] = [
                'sections' => array_keys($data['sections']),
                'batches' => array_keys($data['batches']),
            ];
            sort($outBy[$cls]['sections']);
            sort($outBy[$cls]['batches']);
        }
        $c = array_keys($classes);
        $sec = array_keys($sections);
        $b = array_keys($batches);
        sort($c);
        sort($sec);
        sort($b);
        ok(['classes' => $c, 'sections' => $sec, 'batches' => $b, 'by_class' => $outBy]);
    }
    if ($path === '/api/students' && $method === 'POST') {
        $p = json_body();
        if (db_one('SELECT id FROM students WHERE roll_no = ?', 's', [$p['roll_no'] ?? ''])) {
            fail(400, 'Roll number already exists');
        }
        db_exec(
            'INSERT INTO students (roll_no, name, gender, class_name, section, session) VALUES (?, ?, ?, ?, ?, ?)',
            'ssssss',
            [$p['roll_no'], $p['name'], $p['gender'] ?? '', $p['class_name'] ?? '', $p['section'] ?? '', $p['session'] ?? '']
        );
        ok(student_out(db_one('SELECT * FROM students WHERE id = ?', 'i', [db_insert_id()])));
    }
    if ($path === '/api/students/template.xlsx' && $method === 'GET') {
        $tmp = sys_get_temp_dir() . '/students_template.xlsx';
        omr_worker('students-template', ['out' => $tmp]);
        send_file($tmp, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'students_template.xlsx');
    }
    if ($path === '/api/students/import/preview' && $method === 'POST') {
        $rows = import_student_rows();
        $existing = [];
        $new = [];
        foreach ($rows as $row) {
            $found = db_one('SELECT id, name FROM students WHERE roll_no = ?', 's', [$row['roll_no']]);
            if ($found) {
                $existing[] = $row + ['id' => (int) $found['id'], 'current_name' => $found['name']];
            } else {
                $new[] = $row;
            }
        }
        ok(['new' => $new, 'existing' => $existing, 'total' => count($rows)]);
    }
    if ($path === '/api/students/import' && $method === 'POST') {
        $on = $_GET['on_conflict'] ?? 'update';
        if (!in_array($on, ['update', 'skip'], true)) {
            fail(400, 'on_conflict must be update or skip');
        }
        $created = $updated = $skipped = 0;
        foreach (import_student_rows() as $row) {
            $existing = db_one('SELECT id FROM students WHERE roll_no = ?', 's', [$row['roll_no']]);
            if ($existing) {
                if ($on === 'skip') {
                    $skipped++;
                    continue;
                }
                db_exec(
                    'UPDATE students SET name=?, gender=?, class_name=?, section=?, session=? WHERE id=?',
                    'sssssi',
                    [$row['name'], $row['gender'], $row['class_name'], $row['section'], $row['session'], (int) $existing['id']]
                );
                $updated++;
            } else {
                db_exec(
                    'INSERT INTO students (roll_no, name, gender, class_name, section, session) VALUES (?, ?, ?, ?, ?, ?)',
                    'ssssss',
                    [$row['roll_no'], $row['name'], $row['gender'], $row['class_name'], $row['section'], $row['session']]
                );
                $created++;
            }
        }
        ok(['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => $created + $updated + $skipped]);
    }
    if (preg_match('#^/api/students/(\d+)/results$#', $path, $m) && $method === 'GET') {
        $student = db_one('SELECT * FROM students WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$student) {
            fail(404, 'Student not found');
        }
        $sheets = db_all("SELECT * FROM exam_sheets WHERE student_id = ? AND status IN ('evaluated','unmatched')", 'i', [(int) $student['id']]);
        $history = [];
        foreach ($sheets as $sheet) {
            $exam = load_exam((int) $sheet['exam_id']);
            $qrows = db_all('SELECT * FROM sheet_question_results WHERE sheet_id = ?', 'i', [(int) $sheet['id']]);
            $maps = db_all(
                'SELECT m.*, s.name AS subject_name FROM exam_subject_maps m JOIN subjects s ON s.id = m.subject_id WHERE m.exam_id = ? ORDER BY m.start_q',
                'i',
                [(int) $exam['id']]
            );
            $subjects = [];
            foreach ($maps as $mapping) {
                $subset = array_values(array_filter($qrows, fn ($r) => $r['question_no'] >= $mapping['start_q'] && $r['question_no'] <= $mapping['end_q']));
                $subjects[] = rwl_bucket($subset, $exam, $mapping['subject_name'], (int) $mapping['subject_id'], (int) $mapping['start_q'], (int) $mapping['end_q']);
            }
            $layout = db_one('SELECT total_questions FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
            $overall = rwl_bucket($qrows, $exam, 'Overall', null, 1, (int) ($layout['total_questions'] ?? count($qrows)));
            $pct = $sheet['max_score'] ? ($sheet['raw_score'] / $sheet['max_score'] * 100) : 0;
            $history[] = [
                'exam_id' => (int) $exam['id'],
                'exam_name' => $exam['name'],
                'exam_date' => $exam['exam_date'],
                'exam_type' => $exam['exam_type'],
                'test_id' => $exam['test_id'],
                'test_no' => $exam['test_no'],
                'status' => $exam['status'],
                'right' => (int) $sheet['right_count'],
                'wrong' => (int) $sheet['wrong_count'],
                'left' => (int) $sheet['left_count'],
                'invalid' => (int) $sheet['invalid_count'],
                'score' => (float) $sheet['raw_score'],
                'max_score' => (float) $sheet['max_score'],
                'percentage' => round($pct, 2),
                'overall_rwl' => $overall,
                'subjects' => $subjects,
            ];
        }
        usort($history, fn ($a, $b) => strcmp($b['exam_date'], $a['exam_date']));
        ok(['student' => student_out($student), 'exams' => $history]);
    }
    if (preg_match('#^/api/students/(\d+)$#', $path, $m)) {
        $id = (int) $m[1];
        $student = db_one('SELECT * FROM students WHERE id = ?', 'i', [$id]);
        if (!$student) {
            fail(404, 'Student not found');
        }
        if ($method === 'GET') {
            ok(student_out($student));
        }
        if ($method === 'PUT') {
            $p = json_body();
            if (db_one('SELECT id FROM students WHERE roll_no = ? AND id != ?', 'si', [$p['roll_no'], $id])) {
                fail(400, 'Roll number already exists');
            }
            db_exec(
                'UPDATE students SET roll_no=?, name=?, gender=?, class_name=?, section=?, session=? WHERE id=?',
                'ssssssi',
                [$p['roll_no'], $p['name'], $p['gender'] ?? '', $p['class_name'] ?? '', $p['section'] ?? '', $p['session'] ?? '', $id]
            );
            ok(student_out(db_one('SELECT * FROM students WHERE id = ?', 'i', [$id])));
        }
        if ($method === 'DELETE') {
            db_exec('DELETE FROM students WHERE id = ?', 'i', [$id]);
            ok(['ok' => true]);
        }
    }
}

function student_out(array $s): array
{
    return [
        'id' => (int) $s['id'],
        'roll_no' => $s['roll_no'],
        'name' => $s['name'],
        'gender' => $s['gender'],
        'class_name' => $s['class_name'],
        'section' => $s['section'],
        'session' => $s['session'],
    ];
}

function import_student_rows(): array
{
    if (empty($_FILES['file']['tmp_name'])) {
        fail(400, 'XLSX must include Roll No and Student Name columns.');
    }
    $tmp = $_FILES['file']['tmp_name'];
    $res = omr_worker('parse-students-xlsx', ['src' => $tmp]);
    return $res['rows'] ?? [];
}

function subjects_routes(string $method, string $path): void
{
    if ($path === '/api/subjects' && $method === 'GET') {
        $rows = db_all('SELECT * FROM subjects ORDER BY name');
        ok(array_map(fn ($s) => ['id' => (int) $s['id'], 'name' => $s['name'], 'code' => $s['code']], $rows));
    }
    if ($path === '/api/subjects' && $method === 'POST') {
        $p = json_body();
        if (db_one('SELECT id FROM subjects WHERE name = ?', 's', [$p['name'] ?? ''])) {
            fail(400, 'Subject already exists');
        }
        db_exec('INSERT INTO subjects (name, code) VALUES (?, ?)', 'ss', [$p['name'], $p['code'] ?? '']);
        $id = db_insert_id();
        ok(['id' => $id, 'name' => $p['name'], 'code' => $p['code'] ?? '']);
    }
    if (preg_match('#^/api/subjects/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $id = (int) $m[1];
        if (!db_one('SELECT id FROM subjects WHERE id = ?', 'i', [$id])) {
            fail(404, 'Subject not found');
        }
        if (db_one('SELECT id FROM exam_subject_maps WHERE subject_id = ? LIMIT 1', 'i', [$id])) {
            fail(409, 'Subject Associated with Exam. Cannot be Deleted');
        }
        db_exec('DELETE FROM subjects WHERE id = ?', 'i', [$id]);
        ok(['ok' => true]);
    }
}
