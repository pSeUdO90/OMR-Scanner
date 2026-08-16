<?php

function omr_worker(string $action, array $payload): array
{
    $cfg = $GLOBALS['OMR_CONFIG'];
    $python = is_executable($cfg['python']) ? $cfg['python'] : 'python3';
    $cmd = escapeshellarg($python) . ' ' . escapeshellarg($cfg['worker']) . ' ' . escapeshellarg($action);
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open($cmd, $descriptors, $pipes, $cfg['root']);
    if (!is_resource($proc)) {
        fail(500, 'Could not start OMR worker');
    }
    fwrite($pipes[0], json_encode($payload));
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    $data = json_decode($stdout, true);
    if (!is_array($data)) {
        fail(500, trim($stderr ?: $stdout ?: 'OMR worker failed'));
    }
    if ($code !== 0 || isset($data['error'])) {
        fail(400, $data['error'] ?? trim($stderr ?: 'OMR worker failed'));
    }
    return $data;
}

function parse_question_numbers($value): array
{
    if (is_array($value)) {
        $nums = [];
        foreach ($value as $item) {
            if (is_numeric($item) && (int) $item > 0) {
                $nums[] = (int) $item;
            }
        }
        $nums = array_values(array_unique($nums));
        sort($nums);
        return $nums;
    }
    $text = str_replace(';', ',', (string) $value);
    $nums = [];
    foreach (explode(',', $text) as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        if (str_contains($part, '-')) {
            [$left, $right] = array_pad(explode('-', $part, 2), 2, '');
            if (ctype_digit(trim($left)) && ctype_digit(trim($right))) {
                $lo = (int) $left;
                $hi = (int) $right;
                for ($n = min($lo, $hi); $n <= max($lo, $hi); $n++) {
                    if ($n > 0) {
                        $nums[] = $n;
                    }
                }
            }
        } elseif (ctype_digit($part)) {
            $nums[] = (int) $part;
        }
    }
    $nums = array_values(array_unique($nums));
    sort($nums);
    return $nums;
}

function roll_key(string $value): string
{
    $digits = preg_replace('/\D+/', '', $value) ?? '';
    $digits = ltrim($digits, '0');
    return $digits === '' ? '0' : $digits;
}

function find_student_by_roll(string $detected): ?array
{
    $roll = trim($detected);
    if ($roll === '') {
        return null;
    }
    $student = db_one('SELECT * FROM students WHERE roll_no = ?', 's', [$roll]);
    if ($student) {
        return $student;
    }
    $key = roll_key($roll);
    if (strlen($key) < 4) {
        return null;
    }
    foreach (db_all('SELECT * FROM students') as $row) {
        $stored = trim($row['roll_no'] ?? '');
        if ($stored === $roll || roll_key($stored) === $key) {
            return $row;
        }
        $digits = preg_replace('/\D+/', '', $stored) ?? '';
        $detectedDigits = preg_replace('/\D+/', '', $roll) ?? '';
        if (strlen($detectedDigits) >= 5 && (str_ends_with($digits, $detectedDigits) || str_ends_with($detectedDigits, $digits))) {
            return $row;
        }
    }
    return null;
}

function bind_sheet_student(array $sheet, string $detected, bool $scored = false): array
{
    $roll = trim($detected);
    $updates = ['detected_roll' => $roll];
    if (!empty($sheet['assigned_manually']) && !empty($sheet['student_id'])) {
        if ($scored) {
            $updates['status'] = 'evaluated';
            $updates['error_message'] = '';
        }
        return $updates;
    }
    $student = find_student_by_roll($roll);
    if ($student) {
        $updates['student_id'] = (int) $student['id'];
        if ($scored) {
            $updates['status'] = 'evaluated';
            $updates['error_message'] = '';
        }
        return $updates;
    }
    $updates['student_id'] = null;
    if ($scored) {
        $updates['status'] = 'unmatched';
        $updates['error_message'] = $roll === ''
            ? 'Could not read roll number from the OMR sheet'
            : 'Roll number not found in student list';
    } elseif ($roll !== '') {
        $updates['status'] = 'unmatched';
        $updates['error_message'] = 'Roll number not found in student list';
    }
    return $updates;
}

function subject_map_for_q(array $maps, int $q): ?array
{
    foreach ($maps as $map) {
        if ((int) $map['start_q'] <= $q && $q <= (int) $map['end_q']) {
            return $map;
        }
    }
    return null;
}

function score_sheet(int $examId, array $exam, array $sheet, array $answers, string $detectedRoll): void
{
    $key = json_decode($exam['answer_key_json'] ?: '{}', true) ?: [];
    $maps = db_all('SELECT * FROM exam_subject_maps WHERE exam_id = ?', 'i', [$examId]);
    $grace = array_flip(parse_question_numbers(json_decode($exam['grace_questions_json'] ?: '[]', true)));
    db_exec('DELETE FROM sheet_question_results WHERE sheet_id = ?', 'i', [(int) $sheet['id']]);
    $layout = db_one('SELECT total_questions FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
    $totalQ = (int) ($layout['total_questions'] ?? max(array_map('intval', array_keys($key) ?: [0])));
    $right = $wrong = $left = $invalid = 0;
    $score = 0.0;
    $maxScore = 0.0;
    $correctMarks = (float) $exam['correct_marks'];
    $wrongMarks = (float) $exam['wrong_marks'];
    $leftMarks = (float) $exam['unattempted_marks'];
    for ($q = 1; $q <= $totalQ; $q++) {
        $marked = strtoupper(trim((string) ($answers[(string) $q] ?? '')));
        $correct = strtoupper(trim((string) ($key[(string) $q] ?? '')));
        $mapping = subject_map_for_q($maps, $q);
        if (isset($grace[$q])) {
            $rwl = 'R';
            $right++;
            $score += $correctMarks;
        } elseif ($marked === '') {
            $rwl = 'L';
            $left++;
            $score += $leftMarks;
        } elseif ($marked === 'MULTI') {
            $rwl = 'I';
            $invalid++;
            $score += $wrongMarks;
        } elseif ($correct !== '' && $marked === $correct) {
            $rwl = 'R';
            $right++;
            $score += $correctMarks;
        } else {
            $rwl = 'W';
            $wrong++;
            $score += $wrongMarks;
        }
        if ($correct !== '') {
            $maxScore += $correctMarks;
        }
        $sid = $mapping ? (int) $mapping['subject_id'] : null;
        if ($sid === null) {
            db_exec(
                'INSERT INTO sheet_question_results (sheet_id, question_no, subject_id, marked, correct, rwl) VALUES (?, ?, NULL, ?, ?, ?)',
                'iisss',
                [(int) $sheet['id'], $q, $marked, $correct, $rwl]
            );
        } else {
            db_exec(
                'INSERT INTO sheet_question_results (sheet_id, question_no, subject_id, marked, correct, rwl) VALUES (?, ?, ?, ?, ?, ?)',
                'iiisss',
                [(int) $sheet['id'], $q, $sid, $marked, $correct, $rwl]
            );
        }
    }
    $bind = bind_sheet_student($sheet, $detectedRoll, true);
    db_exec(
        'UPDATE exam_sheets SET answers_json=?, right_count=?, wrong_count=?, left_count=?, invalid_count=?, raw_score=?, max_score=?, detected_roll=?, status=?, error_message=? WHERE id=?',
        'siiiiddsssi',
        [
            json_encode($answers),
            $right,
            $wrong,
            $left,
            $invalid,
            round($score, 2),
            round($maxScore, 2),
            $bind['detected_roll'] ?? $detectedRoll,
            $bind['status'] ?? $sheet['status'],
            $bind['error_message'] ?? '',
            (int) $sheet['id'],
        ]
    );
    if (!empty($bind['student_id'])) {
        db_exec('UPDATE exam_sheets SET student_id = ? WHERE id = ?', 'ii', [(int) $bind['student_id'], (int) $sheet['id']]);
    } else {
        db_exec('UPDATE exam_sheets SET student_id = NULL WHERE id = ?', 'i', [(int) $sheet['id']]);
    }
}

function rescore_stored_sheets(array $exam): void
{
    $sheets = db_all("SELECT * FROM exam_sheets WHERE exam_id = ? AND status IN ('evaluated','unmatched')", 'i', [(int) $exam['id']]);
    foreach ($sheets as $sheet) {
        $answers = json_decode($sheet['answers_json'] ?: '{}', true) ?: [];
        score_sheet((int) $exam['id'], $exam, $sheet, $answers, $sheet['detected_roll'] ?: '');
    }
}

function rwl_bucket(array $rows, array $exam, string $name, $subjectId, int $start, int $end): array
{
    $right = $wrong = $left = $invalid = 0;
    foreach ($rows as $r) {
        if ($r['rwl'] === 'R') {
            $right++;
        } elseif ($r['rwl'] === 'W') {
            $wrong++;
        } elseif ($r['rwl'] === 'L') {
            $left++;
        } elseif ($r['rwl'] === 'I') {
            $invalid++;
        }
    }
    $total = count($rows);
    $attempted = $right + $wrong + $invalid;
    $score = $right * $exam['correct_marks'] + $wrong * $exam['wrong_marks'] + $left * $exam['unattempted_marks'] + $invalid * $exam['wrong_marks'];
    $max = $total * $exam['correct_marks'];
    $acc = $attempted ? ($right / $attempted * 100) : 0;
    return [
        'subject_id' => $subjectId,
        'subject_name' => $name,
        'start_q' => $start,
        'end_q' => $end,
        'right' => $right,
        'wrong' => $wrong,
        'left' => $left,
        'invalid' => $invalid,
        'attempted' => $attempted,
        'total' => $total,
        'accuracy' => round($acc, 2),
        'score' => round($score, 2),
        'max_score' => round($max, 2),
    ];
}

function build_analytics(array $exam): array
{
    $layout = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
    $maps = db_all(
        'SELECT m.*, s.name AS subject_name FROM exam_subject_maps m JOIN subjects s ON s.id = m.subject_id WHERE m.exam_id = ? ORDER BY m.start_q',
        'i',
        [(int) $exam['id']]
    );
    $sheets = db_all("SELECT sh.*, st.name AS student_name, st.roll_no AS student_roll, st.class_name AS student_class, st.section AS student_section FROM exam_sheets sh LEFT JOIN students st ON st.id = sh.student_id WHERE sh.exam_id = ? AND sh.status IN ('evaluated','unmatched')", 'i', [(int) $exam['id']]);
    $results = [];
    $allRows = [];
    foreach ($sheets as $sheet) {
        $qrows = db_all('SELECT * FROM sheet_question_results WHERE sheet_id = ?', 'i', [(int) $sheet['id']]);
        $allRows = array_merge($allRows, $qrows);
        $subjects = [];
        foreach ($maps as $mapping) {
            $subset = array_values(array_filter($qrows, fn ($r) => $r['question_no'] >= $mapping['start_q'] && $r['question_no'] <= $mapping['end_q']));
            $subjects[] = rwl_bucket($subset, $exam, $mapping['subject_name'], (int) $mapping['subject_id'], (int) $mapping['start_q'], (int) $mapping['end_q']);
        }
        $pct = $sheet['max_score'] ? ($sheet['raw_score'] / $sheet['max_score'] * 100) : 0;
        $results[] = [
            'sheet_id' => (int) $sheet['id'],
            'roll_no' => $sheet['detected_roll'] ?: ($sheet['student_roll'] ?? ''),
            'name' => $sheet['student_name'] ?: 'Unmatched sheet',
            'class_name' => $sheet['student_class'] ?? '',
            'section' => $sheet['student_section'] ?? '',
            'right' => (int) $sheet['right_count'],
            'wrong' => (int) $sheet['wrong_count'],
            'left' => (int) $sheet['left_count'],
            'invalid' => (int) $sheet['invalid_count'],
            'score' => (float) $sheet['raw_score'],
            'max_score' => (float) $sheet['max_score'],
            'percentage' => round($pct, 2),
            'rank' => null,
            'subjects' => $subjects,
        ];
    }
    usort($results, fn ($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['roll_no'], $b['roll_no']));
    foreach ($results as $i => &$row) {
        $row['rank'] = $i + 1;
    }
    unset($row);
    $appeared = count($results);
    $scores = array_column($results, 'score');
    $overall = rwl_bucket($allRows, $exam, 'Overall', null, 1, (int) ($layout['total_questions'] ?? 0));
    $subjectStats = [];
    foreach ($maps as $mapping) {
        $subset = array_values(array_filter($allRows, fn ($r) => $r['question_no'] >= $mapping['start_q'] && $r['question_no'] <= $mapping['end_q']));
        $subjectStats[] = rwl_bucket($subset, $exam, $mapping['subject_name'], (int) $mapping['subject_id'], (int) $mapping['start_q'], (int) $mapping['end_q']);
    }
    $item = [];
    foreach ($allRows as $r) {
        $q = (int) $r['question_no'];
        if (!isset($item[$q])) {
            $item[$q] = ['R' => 0, 'W' => 0, 'L' => 0, 'I' => 0, 'correct' => ''];
        }
        $item[$q][$r['rwl']] = ($item[$q][$r['rwl']] ?? 0) + 1;
        $item[$q]['correct'] = $r['correct'];
    }
    ksort($item);
    $itemAnalysis = [];
    foreach ($item as $q => $data) {
        $itemAnalysis[] = [
            'question_no' => $q,
            'correct' => $data['correct'],
            'right' => $data['R'],
            'wrong' => $data['W'],
            'left' => $data['L'],
            'invalid' => $data['I'],
            'difficulty' => round(1 - ($data['R'] / max($appeared, 1)), 3),
        ];
    }
    return [
        'exam_id' => (int) $exam['id'],
        'exam_name' => $exam['name'],
        'published' => $exam['status'] === 'published',
        'appeared' => $appeared,
        'average_score' => $appeared ? round(array_sum($scores) / $appeared, 2) : 0,
        'highest_score' => $scores ? max($scores) : 0,
        'lowest_score' => $scores ? min($scores) : 0,
        'overall_rwl' => $overall,
        'subjects' => $subjectStats,
        'results' => $results,
        'item_analysis' => $itemAnalysis,
    ];
}

function allocate_test_id(): string
{
    $rows = db_all('SELECT test_id FROM exams');
    $highest = 0;
    foreach ($rows as $row) {
        $digits = preg_replace('/\D+/', '', $row['test_id'] ?? '') ?? '';
        if ($digits !== '') {
            $highest = max($highest, (int) $digits);
        }
    }
    return sprintf('%04d', $highest + 1);
}

function unique_slug(string $name): string
{
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: 'custom-layout';
    $slug = $base;
    $n = 2;
    while (db_one('SELECT id FROM omr_layouts WHERE slug = ?', 's', [$slug])) {
        $slug = $base . '-' . $n;
        $n++;
    }
    return $slug;
}

function assert_unique_layout_name(string $name, ?int $exclude = null): string
{
    $cleaned = trim($name);
    if ($cleaned === '') {
        fail(400, 'Layout name is required');
    }
    $sql = 'SELECT id FROM omr_layouts WHERE LOWER(name) = LOWER(?)';
    $params = [$cleaned];
    $types = 's';
    if ($exclude) {
        $sql .= ' AND id != ?';
        $types .= 'i';
        $params[] = $exclude;
    }
    if (db_one($sql, $types, $params)) {
        fail(409, 'Layout name already exists');
    }
    return $cleaned;
}
