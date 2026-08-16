<?php

function layout_in_use(int $id): bool
{
    return (bool) db_one('SELECT id FROM exams WHERE layout_id = ? LIMIT 1', 'i', [$id]);
}

function layout_out(array $row, bool $withImage = false): array
{
    $cfg = json_decode($row['config_json'] ?: '{}', true) ?: [];
    $preview = ['default_maps' => $cfg['default_maps'] ?? []];
    $inUse = layout_in_use((int) $row['id']);
    $item = [
        'id' => (int) $row['id'],
        'slug' => $row['slug'],
        'name' => $row['name'],
        'description' => $row['description'] ?? '',
        'total_questions' => (int) $row['total_questions'],
        'options' => $row['options'],
        'is_builtin' => (bool) $row['is_builtin'],
        'is_studio' => !empty($cfg['studio']),
        'is_finalized' => (bool) $row['is_finalized'],
        'in_use' => $inUse,
        'has_sample' => $row['sample_path'] && is_file($row['sample_path']),
        'sample_rev' => ($row['sample_path'] && is_file($row['sample_path'])) ? (int) filemtime($row['sample_path']) : 0,
        'studio_config' => $cfg['studio_config'] ?? new stdClass(),
        'studio_geometry' => $cfg['studio_geometry'] ?? new stdClass(),
        'studio_blocks' => $cfg['studio_blocks'] ?? [],
        'field_map' => json_decode($row['field_map_json'] ?: '{}', true) ?: new stdClass(),
        'blocks' => $cfg['blocks'] ?? [],
        'preview' => $preview,
    ];
    if ($withImage) {
        $item['analysis'] = [];
        if ($row['sample_path'] && is_file($row['sample_path'])) {
            $item['analysis'] = omr_worker('analyze', ['layout' => $cfg, 'image' => $row['sample_path']])['analysis'] ?? [];
        }
    }
    return $item;
}

function exam_out(array $exam, bool $withAnalysis = false): array
{
    $layout = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
    $maps = db_all(
        'SELECT m.*, s.name AS subject_name FROM exam_subject_maps m JOIN subjects s ON s.id = m.subject_id WHERE m.exam_id = ?',
        'i',
        [(int) $exam['id']]
    );
    $sheets = db_all('SELECT status FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']]);
    $subjectMaps = [];
    foreach ($maps as $m) {
        $subjectMaps[] = [
            'id' => (int) $m['id'],
            'subject_id' => (int) $m['subject_id'],
            'start_q' => (int) $m['start_q'],
            'end_q' => (int) $m['end_q'],
            'subject_name' => $m['subject_name'],
        ];
    }
    $fieldMap = json_decode($exam['field_map_json'] ?: '{}', true);
    if (!$fieldMap) {
        $fieldMap = json_decode(($layout['field_map_json'] ?? '{}') ?: '{}', true) ?: new stdClass();
    }
    $out = [
        'id' => (int) $exam['id'],
        'name' => $exam['name'],
        'exam_date' => $exam['exam_date'],
        'exam_type' => $exam['exam_type'],
        'duration_minutes' => (int) $exam['duration_minutes'],
        'correct_marks' => (float) $exam['correct_marks'],
        'wrong_marks' => (float) $exam['wrong_marks'],
        'unattempted_marks' => (float) $exam['unattempted_marks'],
        'layout_id' => (int) $exam['layout_id'],
        'layout_name' => $layout['name'] ?? '',
        'total_questions' => (int) ($layout['total_questions'] ?? 0),
        'status' => $exam['status'],
        'created_at' => $exam['created_at'],
        'subject_maps' => $subjectMaps,
        'answer_key' => json_decode($exam['answer_key_json'] ?: '{}', true) ?: new stdClass(),
        'sheet_count' => count($sheets),
        'evaluated_count' => count(array_filter($sheets, fn ($s) => in_array($s['status'], ['evaluated', 'unmatched'], true))),
        'has_sample' => $exam['sample_path'] && is_file($exam['sample_path']),
        'test_id' => $exam['test_id'] ?? '',
        'test_no' => $exam['test_no'] ?? '',
        'class_name' => $exam['class_name'] ?? '',
        'section' => $exam['section'] ?? '',
        'batch' => $exam['batch'] ?? '',
        'grace_questions' => json_decode($exam['grace_questions_json'] ?: '[]', true) ?: [],
        'field_map' => $fieldMap,
        'analysis' => [],
    ];
    if ($withAnalysis && $layout) {
        $cfg = json_decode($layout['config_json'] ?: '{}', true) ?: [];
        $img = ($exam['sample_path'] && is_file($exam['sample_path'])) ? $exam['sample_path'] : null;
        $out['analysis'] = omr_worker('analyze', ['layout' => $cfg, 'image' => $img])['analysis'] ?? [];
    }
    return $out;
}

function sheet_out(array $sheet): array
{
    $student = $sheet['student_id'] ? db_one('SELECT name FROM students WHERE id = ?', 'i', [(int) $sheet['student_id']]) : null;
    return [
        'id' => (int) $sheet['id'],
        'exam_id' => (int) $sheet['exam_id'],
        'student_id' => $sheet['student_id'] ? (int) $sheet['student_id'] : null,
        'student_name' => $student['name'] ?? '',
        'filename' => $sheet['filename'],
        'status' => $sheet['status'],
        'detected_roll' => $sheet['detected_roll'],
        'error_message' => $sheet['error_message'] ?? '',
        'raw_score' => (float) $sheet['raw_score'],
        'max_score' => (float) $sheet['max_score'],
        'right_count' => (int) $sheet['right_count'],
        'wrong_count' => (int) $sheet['wrong_count'],
        'left_count' => (int) $sheet['left_count'],
        'invalid_count' => (int) $sheet['invalid_count'],
        'has_overlay' => $sheet['overlay_path'] && is_file($sheet['overlay_path']),
        'assigned_manually' => (bool) $sheet['assigned_manually'],
    ];
}

function replace_subject_maps(int $examId, array $payloadMaps, array $layout): void
{
    $maps = [];
    foreach ($payloadMaps as $m) {
        if (!empty($m['subject_id'])) {
            $maps[] = ['subject_id' => (int) $m['subject_id'], 'start_q' => (int) $m['start_q'], 'end_q' => (int) $m['end_q']];
        }
    }
    if (!$maps) {
        $cfg = json_decode($layout['config_json'] ?: '{}', true) ?: [];
        $byName = [];
        foreach (db_all('SELECT * FROM subjects') as $s) {
            $byName[$s['name']] = $s;
        }
        foreach ($cfg['default_maps'] ?? [] as $item) {
            $subject = $byName[$item['subject']] ?? null;
            if ($subject) {
                $maps[] = ['subject_id' => (int) $subject['id'], 'start_q' => (int) $item['start_q'], 'end_q' => (int) $item['end_q']];
            }
        }
    }
    db_exec('DELETE FROM exam_subject_maps WHERE exam_id = ?', 'i', [$examId]);
    foreach ($maps as $mapping) {
        db_exec(
            'INSERT INTO exam_subject_maps (exam_id, subject_id, start_q, end_q) VALUES (?, ?, ?, ?)',
            'iiii',
            [$examId, $mapping['subject_id'], $mapping['start_q'], $mapping['end_q']]
        );
    }
}

function settings_body(): array
{
    $row = get_settings_row();
    $custom = trim($row['logo_path'] ?? '') !== '' && is_file($row['logo_path']);
    $rev = $custom ? (int) filemtime($row['logo_path']) : 1;
    $tabs = [];
    foreach (APP_TABS as $key => $label) {
        $tabs[] = ['key' => $key, 'label' => $label];
    }
    return [
        'processed_images_dir' => $row['processed_images_dir'] ?: $GLOBALS['OMR_CONFIG']['default_processed'],
        'resolved_dir' => $row['processed_images_dir'] ?: $GLOBALS['OMR_CONFIG']['default_processed'],
        'default_dir' => $GLOBALS['OMR_CONFIG']['default_processed'],
        'tabs' => $tabs,
        'actions' => ['view', 'edit', 'delete'],
        'roles' => ['admin', 'user'],
        'role_permissions' => load_role_permissions(),
        'has_custom_logo' => $custom,
        'logo_url' => '/api/branding/logo?v=' . $rev,
    ];
}

function list_folders(string $path): array
{
    $cfg = $GLOBALS['OMR_CONFIG'];
    $raw = trim($path);
    if ($raw === '' || preg_match('/^[A-Za-z]:[\\\\\\/]/', $raw)) {
        $raw = $cfg['root'];
    }
    if (!is_dir($raw)) {
        fail(400, 'Folder not found: ' . $path);
    }
    $parent = dirname($raw);
    $entries = [];
    foreach (scandir($raw) ?: [] as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        $full = $raw . DIRECTORY_SEPARATOR . $name;
        if (is_dir($full)) {
            $entries[] = ['name' => $name, 'path' => $full];
        }
    }
    return ['path' => $raw, 'parent' => $parent, 'folders' => $entries, 'dirs' => array_column($entries, 'name')];
}

function exam_processed_dir(array $exam): string
{
    $row = get_settings_row();
    $root = $row['processed_images_dir'] ?: $GLOBALS['OMR_CONFIG']['default_processed'];
    if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $root) && PHP_OS_FAMILY !== 'Windows') {
        $root = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/processed';
    }
    $name = preg_replace('/[<>:"\\\\\\/|?*]+/', '-', $exam['name'] ?: 'exam');
    $name = trim(preg_replace('/\\s+/', ' ', $name), ' .') ?: ('exam-' . $exam['id']);
    $dest = rtrim($root, '/\\') . '/' . substr($name, 0, 80);
    ensure_dir($dest);
    return $dest;
}

function load_exam(int $id): array
{
    $exam = db_one('SELECT * FROM exams WHERE id = ?', 'i', [$id]);
    if (!$exam) {
        fail(404, 'Exam not found');
    }
    return $exam;
}

function write_studio_sample(string $slug, array $config, string $thumb = ''): string
{
    $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
    ensure_dir($dir);
    if ($thumb) {
        $dest = $dir . '/' . $slug . '-studio-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.jpg';
        omr_worker('thumbnail', ['data_url' => $thumb, 'out' => $dest]);
        return $dest;
    }
    $dest = $dir . '/' . $slug . '-a4-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.jpg';
    omr_worker('blank-sheet', ['config' => $config, 'out' => $dest]);
    return $dest;
}
