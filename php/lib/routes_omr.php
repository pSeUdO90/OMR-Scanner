<?php

function layouts_routes(string $method, string $path): void
{
    $retired = "('gyana-vikash-180','standard-100','jee-main-90')";
    if ($path === '/api/layouts' && $method === 'GET') {
        $rows = db_all("SELECT * FROM omr_layouts WHERE slug NOT IN $retired ORDER BY id");
        ok(array_map(fn ($r) => layout_out($r), $rows));
    }
    if ($path === '/api/layouts/predefined-blocks' && $method === 'GET') {
        ok(omr_worker('predefined-blocks', [
            'total_questions' => (int) ($_GET['total_questions'] ?? 100),
            'columns' => (int) ($_GET['columns'] ?? 4),
            'options' => $_GET['options'] ?? 'ABCD',
            'roll_cols' => (int) ($_GET['roll_cols'] ?? 8),
        ]));
    }
    if ($path === '/api/layouts/studio' && $method === 'POST') {
        $p = json_body();
        $name = assert_unique_layout_name($p['name'] ?? '');
        $slug = unique_slug($name);
        $config = omr_worker('studio-config', $p + ['name' => $name, 'slug' => $slug])['config'];
        $sample = write_studio_sample($slug, $config, $p['thumbnail_base64'] ?? '');
        db_exec(
            'INSERT INTO omr_layouts (slug, name, description, total_questions, options, config_json, is_builtin, is_finalized, sample_path, field_map_json) VALUES (?,?,?,?,?,?,0,1,?,?)',
            'sssissss',
            [$slug, $name, $p['description'] ?? $config['description'], (int) $config['total_questions'], $config['options'], json_encode($config), $sample, json_encode(['date' => 'exam_date', 'test_id' => 'test_id', 'test_no' => 'test_no'])]
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [db_insert_id()])));
    }
    if ($path === '/api/layouts/design' && $method === 'POST') {
        $p = json_body();
        $name = assert_unique_layout_name($p['name'] ?? '');
        $slug = unique_slug($name);
        $config = omr_worker('a4-design', $p + ['name' => $name, 'slug' => $slug])['config'];
        $sample = write_studio_sample($slug, $config);
        db_exec(
            'INSERT INTO omr_layouts (slug, name, description, total_questions, options, config_json, is_builtin, is_finalized, sample_path, field_map_json) VALUES (?,?,?,?,?,?,0,1,?,?)',
            'sssissss',
            [$slug, $name, $p['description'] ?? '', (int) $config['total_questions'], $config['options'], json_encode($config), $sample, json_encode(['date' => 'exam_date', 'test_id' => 'test_id', 'test_no' => 'test_no'])]
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [db_insert_id()]), true));
    }
    if ($path === '/api/layouts' && $method === 'POST') {
        $name = assert_unique_layout_name($_POST['name'] ?? '');
        $slug = unique_slug($name);
        if (empty($_FILES['sample']['tmp_name'])) {
            fail(400, 'PDF/JPG of the sample OMR must be uploaded');
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
        ensure_dir($dir);
        $src = $_FILES['sample']['tmp_name'];
        $out = $dir . '/' . $slug . '-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.jpg';
        omr_worker('sample-to-image', ['src' => $src, 'filename' => $_FILES['sample']['name'] ?? 'sample.jpg', 'out' => $out]);
        $config = omr_worker('custom-grid', [
            'name' => $name,
            'slug' => $slug,
            'total_questions' => (int) ($_POST['total_questions'] ?? 100),
            'columns' => (int) ($_POST['columns'] ?? 4),
            'options' => $_POST['options'] ?? 'ABCD',
            'description' => $_POST['description'] ?? '',
            'default_maps' => json_decode($_POST['subject_maps'] ?? '[]', true),
        ])['config'];
        db_exec(
            'INSERT INTO omr_layouts (slug, name, description, total_questions, options, config_json, is_builtin, is_finalized, sample_path, field_map_json) VALUES (?,?,?,?,?,?,0,1,?,?)',
            'sssissss',
            [$slug, $name, $_POST['description'] ?? '', (int) $config['total_questions'], $config['options'], json_encode($config), $out, json_encode(['date' => 'exam_date', 'test_id' => 'test_id', 'test_no' => 'test_no'])]
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [db_insert_id()]), true));
    }
    if (preg_match('#^/api/layouts/(\d+)/studio$#', $path, $m) && $method === 'PUT') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        if ($row['is_builtin']) {
            fail(400, 'Built-in layouts cannot be edited');
        }
        if (layout_in_use((int) $row['id'])) {
            fail(409, 'Layout Associated with Exam. Cannot be Deleted');
        }
        $p = json_body();
        $name = assert_unique_layout_name($p['name'] ?? '', (int) $row['id']);
        $config = omr_worker('studio-config', $p + ['name' => $name, 'slug' => $row['slug']])['config'];
        $sample = write_studio_sample($row['slug'], $config, $p['thumbnail_base64'] ?? '');
        db_exec(
            'UPDATE omr_layouts SET name=?, description=?, total_questions=?, options=?, config_json=?, sample_path=?, is_finalized=1 WHERE id=?',
            'ssisssi',
            [$name, $p['description'] ?? $config['description'], (int) $config['total_questions'], $config['options'], json_encode($config), $sample, (int) $row['id']]
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $row['id']])));
    }
    if (preg_match('#^/api/layouts/(\d+)/copy$#', $path, $m) && $method === 'POST') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        $name = $row['name'] . ' copy';
        $n = 2;
        while (db_one('SELECT id FROM omr_layouts WHERE LOWER(name) = LOWER(?)', 's', [$name])) {
            $name = $row['name'] . ' copy ' . $n++;
        }
        $slug = unique_slug($name);
        $config = json_decode($row['config_json'], true);
        $config['slug'] = $slug;
        $config['name'] = $name;
        $sample = '';
        if ($row['sample_path'] && is_file($row['sample_path'])) {
            $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
            ensure_dir($dir);
            $sample = $dir . '/' . $slug . '-copy-' . substr(bin2hex(random_bytes(4)), 0, 8) . '.jpg';
            copy($row['sample_path'], $sample);
        }
        db_exec(
            'INSERT INTO omr_layouts (slug, name, description, total_questions, options, config_json, is_builtin, is_finalized, sample_path, field_map_json) VALUES (?,?,?,?,?,?,0,?,?,?)',
            'sssississ',
            [$slug, $name, $row['description'], (int) $row['total_questions'], $row['options'], json_encode($config), (int) $row['is_finalized'], $sample, $row['field_map_json'] ?: '{}']
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [db_insert_id()])));
    }
    if (preg_match('#^/api/layouts/(\d+)/sample$#', $path, $m) && $method === 'GET') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        $file = $row['sample_path'];
        if (!$file || !is_file($file)) {
            $cfg = json_decode($row['config_json'], true);
            $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
            ensure_dir($dir);
            $file = $dir . '/' . $row['slug'] . '-preview.jpg';
            omr_worker('blank-sheet', ['config' => $cfg, 'out' => $file]);
            db_exec('UPDATE omr_layouts SET sample_path = ? WHERE id = ?', 'si', [$file, (int) $row['id']]);
        }
        send_file($file);
    }
    if (preg_match('#^/api/layouts/(\d+)/blank-sheet$#', $path, $m) && $method === 'GET') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
        ensure_dir($dir);
        $dest = $dir . '/' . $row['slug'] . '-blank.jpg';
        omr_worker('blank-sheet', ['config' => json_decode($row['config_json'], true), 'out' => $dest]);
        send_file($dest, 'image/jpeg', $row['slug'] . '-a4-omr.jpg');
    }
    if (preg_match('#^/api/layouts/(\d+)/blank-sheet.pdf$#', $path, $m) && $method === 'GET') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/layouts';
        ensure_dir($dir);
        $dest = $dir . '/' . $row['slug'] . '-blank.jpg';
        $pdf = $dir . '/' . $row['slug'] . '-blank.pdf';
        omr_worker('blank-sheet', ['config' => json_decode($row['config_json'], true), 'out' => $dest, 'pdf' => $pdf]);
        send_file($pdf, 'application/pdf', $row['slug'] . '-a4-omr.pdf');
    }
    if (preg_match('#^/api/layouts/(\d+)/field-map$#', $path, $m) && $method === 'POST') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        $p = json_body();
        $mapping = $p['field_map'] ?? $p;
        db_exec('UPDATE omr_layouts SET field_map_json = ? WHERE id = ?', 'si', [json_encode($mapping), (int) $row['id']]);
        ok(['ok' => true, 'field_map' => $mapping]);
    }
    if (preg_match('#^/api/layouts/(\d+)/blocks$#', $path, $m) && $method === 'POST') {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        if (layout_in_use((int) $row['id'])) {
            fail(409, 'Layout Associated with Exam. Cannot be Deleted');
        }
        $p = json_body();
        if (!isset($p['blocks']) || !is_array($p['blocks'])) {
            fail(400, 'blocks must be a list of mapped regions');
        }
        $config = omr_worker('apply-blocks', ['config' => json_decode($row['config_json'], true), 'blocks' => $p['blocks']])['config'];
        db_exec(
            'UPDATE omr_layouts SET config_json = ?, total_questions = ?, field_map_json = ? WHERE id = ?',
            'sisi',
            [json_encode($config), (int) ($config['total_questions'] ?? $row['total_questions']), json_encode($p['field_map'] ?? new stdClass()), (int) $row['id']]
        );
        ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $row['id']]), true));
    }
    if (preg_match('#^/api/layouts/(\d+)$#', $path, $m)) {
        $row = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $m[1]]);
        if (!$row) {
            fail(404, 'Layout not found');
        }
        if ($method === 'GET') {
            ok(layout_out($row, true));
        }
        if ($method === 'DELETE') {
            if (layout_in_use((int) $row['id'])) {
                fail(409, 'Layout Associated with Exam. Cannot be Deleted');
            }
            db_exec('DELETE FROM omr_layouts WHERE id = ?', 'i', [(int) $row['id']]);
            ok(['ok' => true]);
        }
        if ($method === 'PUT') {
            if (layout_in_use((int) $row['id'])) {
                fail(409, 'Layout Associated with Exam. Cannot be Deleted');
            }
            $name = assert_unique_layout_name($_POST['name'] ?? json_body()['name'] ?? '', (int) $row['id']);
            db_exec('UPDATE omr_layouts SET name = ?, description = ? WHERE id = ?', 'ssi', [$name, $_POST['description'] ?? '', (int) $row['id']]);
            ok(layout_out(db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $row['id']]), true));
        }
    }
}

function exams_routes(string $method, string $path): void
{
    if ($path === '/api/exams' && $method === 'GET') {
        $rows = db_all('SELECT * FROM exams ORDER BY id DESC');
        ok(array_map(fn ($e) => exam_out($e), $rows));
    }
    if ($path === '/api/exams/next-test-id' && $method === 'GET') {
        ok(['test_id' => allocate_test_id()]);
    }
    if ($path === '/api/exams' && $method === 'POST') {
        $p = json_body();
        $layout = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) ($p['layout_id'] ?? 0)]);
        if (!$layout) {
            fail(400, 'Layout not found');
        }
        if (!$layout['is_builtin'] && !$layout['is_finalized']) {
            fail(400, 'Only finalized OMR layouts can be used in an exam');
        }
        $testId = allocate_test_id();
        db_exec(
            'INSERT INTO exams (name, exam_date, exam_type, duration_minutes, correct_marks, wrong_marks, unattempted_marks, layout_id, answer_key_json, test_id, test_no, class_name, section, batch, status, grace_questions_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            'sssidddissssssss',
            [
                $p['name'], $p['exam_date'], $p['exam_type'] ?? '', (int) ($p['duration_minutes'] ?? 180),
                (float) ($p['correct_marks'] ?? 4), (float) ($p['wrong_marks'] ?? -1), (float) ($p['unattempted_marks'] ?? 0),
                (int) $layout['id'], json_encode($p['answer_key'] ?? new stdClass()), $testId, $p['test_no'] ?? '',
                $p['class_name'] ?? '', $p['section'] ?? '', $p['batch'] ?? '', 'draft', '[]',
            ]
        );
        $id = db_insert_id();
        replace_subject_maps($id, $p['subject_maps'] ?? [], $layout);
        ok(exam_out(load_exam($id)));
    }
    if (preg_match('#^/api/exams/(\d+)$#', $path, $m)) {
        $exam = load_exam((int) $m[1]);
        if ($method === 'GET') {
            ok(exam_out($exam, true));
        }
        if ($method === 'DELETE') {
            $dest = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/exam-' . $exam['id'];
            db_exec('DELETE FROM exams WHERE id = ?', 'i', [(int) $exam['id']]);
            if (is_dir($dest)) {
                array_map('unlink', glob($dest . '/*') ?: []);
                @rmdir($dest);
            }
            ok(['ok' => true]);
        }
        if ($method === 'PUT') {
            if (in_array($exam['status'], ['evaluated', 'published'], true)) {
                fail(409, 'Exam already evaluated. Only the answer key can be changed.');
            }
            $p = json_body();
            $layout = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) ($p['layout_id'] ?? 0)]);
            if (!$layout) {
                fail(400, 'Layout not found');
            }
            db_exec(
                'UPDATE exams SET name=?, exam_date=?, exam_type=?, duration_minutes=?, correct_marks=?, wrong_marks=?, unattempted_marks=?, layout_id=?, test_no=?, class_name=?, section=?, batch=? WHERE id=?',
                'sssidddissssi',
                [
                    $p['name'], $p['exam_date'], $p['exam_type'], (int) $p['duration_minutes'],
                    (float) $p['correct_marks'], (float) $p['wrong_marks'], (float) $p['unattempted_marks'],
                    (int) $layout['id'], $p['test_no'] ?? '', $p['class_name'] ?? '', $p['section'] ?? '', $p['batch'] ?? '', (int) $exam['id'],
                ]
            );
            replace_subject_maps((int) $exam['id'], $p['subject_maps'] ?? [], $layout);
            ok(exam_out(load_exam((int) $exam['id'])));
        }
    }
    exam_detail_routes($method, $path);
}

function exam_detail_routes(string $method, string $path): void
{
    if (!preg_match('#^/api/exams/(\d+)/(.+)$#', $path, $m)) {
        return;
    }
    $exam = load_exam((int) $m[1]);
    $rest = $m[2];

    if ($rest === 'grace' && $method === 'PUT') {
        $p = json_body();
        db_exec('UPDATE exams SET grace_questions_json = ? WHERE id = ?', 'si', [json_encode(parse_question_numbers($p['questions'] ?? [])), (int) $exam['id']]);
        $exam = load_exam((int) $exam['id']);
        rescore_stored_sheets($exam);
        ok(exam_out(load_exam((int) $exam['id'])));
    }
    if ($rest === 'answer-key' && $method === 'PUT') {
        $p = json_body();
        $key = $p['answer_key'] ?? [];
        if (!empty($p['key_string'])) {
            $letters = array_values(array_filter(str_split(strtoupper($p['key_string'])), fn ($ch) => str_contains('ABCD', $ch)));
            $key = [];
            foreach ($letters as $i => $letter) {
                $key[(string) ($i + 1)] = $letter;
            }
        }
        db_exec('UPDATE exams SET answer_key_json = ? WHERE id = ?', 'si', [json_encode($key), (int) $exam['id']]);
        $exam = load_exam((int) $exam['id']);
        rescore_stored_sheets($exam);
        ok(exam_out(load_exam((int) $exam['id'])));
    }
    if ($rest === 'answer-key/upload' && $method === 'POST') {
        if (empty($_FILES['file']['tmp_name'])) {
            fail(400, 'Could not read an answer key from that file');
        }
        $name = strtolower($_FILES['file']['name'] ?? '');
        $key = [];
        if (preg_match('/\.(png|jpg|jpeg|tif|tiff|webp|bmp)$/', $name)) {
            $layout = db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
            $dest = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/exam-' . $exam['id'];
            ensure_dir($dest);
            $img = $dest . '/key-' . bin2hex(random_bytes(4)) . '.png';
            copy($_FILES['file']['tmp_name'], $img);
            $result = omr_worker('evaluate', ['layout' => json_decode($layout['config_json'], true), 'image' => $img]);
            foreach ($result['answers'] as $q => $ans) {
                if ($ans && $ans !== 'MULTI') {
                    $key[(string) $q] = $ans;
                }
            }
        } else {
            $text = file_get_contents($_FILES['file']['tmp_name']);
            $letters = array_values(array_filter(str_split(strtoupper($text)), fn ($ch) => str_contains('ABCD', $ch)));
            foreach ($letters as $i => $letter) {
                $key[(string) ($i + 1)] = $letter;
            }
        }
        if (!$key) {
            fail(400, 'Could not read an answer key from that file');
        }
        db_exec('UPDATE exams SET answer_key_json = ? WHERE id = ?', 'si', [json_encode($key), (int) $exam['id']]);
        $exam = load_exam((int) $exam['id']);
        rescore_stored_sheets($exam);
        ok(exam_out(load_exam((int) $exam['id'])));
    }
    if ($rest === 'sample' && $method === 'POST') {
        if (empty($_FILES['file']['tmp_name'])) {
            fail(400, 'No file');
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/exam-' . $exam['id'];
        ensure_dir($dir);
        $out = $dir . '/omr-sample.jpg';
        omr_worker('sample-to-image', ['src' => $_FILES['file']['tmp_name'], 'filename' => $_FILES['file']['name'] ?? 'sample.jpg', 'out' => $out]);
        db_exec('UPDATE exams SET sample_path = ? WHERE id = ?', 'si', [$out, (int) $exam['id']]);
        $layout = db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
        $analysis = omr_worker('analyze', ['layout' => json_decode($layout['config_json'], true), 'image' => $out])['analysis'] ?? [];
        ok(['ok' => true, 'filename' => $_FILES['file']['name'] ?? '', 'analysis' => $analysis, 'field_map' => json_decode($exam['field_map_json'] ?: '{}', true), 'targets' => [
            ['value' => '', 'label' => 'Ignore'],
            ['value' => 'exam_date', 'label' => 'Exam Date'],
            ['value' => 'test_id', 'label' => 'Test ID'],
            ['value' => 'test_no', 'label' => 'Test No'],
        ]]);
    }
    if ($rest === 'sample' && $method === 'GET') {
        if (!$exam['sample_path'] || !is_file($exam['sample_path'])) {
            fail(404, 'No OMR sample uploaded');
        }
        send_file($exam['sample_path']);
    }
    if ($rest === 'field-map' && $method === 'POST') {
        $p = json_body();
        $mapping = $p['field_map'] ?? $p;
        db_exec('UPDATE exams SET field_map_json = ? WHERE id = ?', 'si', [json_encode($mapping), (int) $exam['id']]);
        ok(['ok' => true, 'field_map' => $mapping]);
    }
    if ($rest === 'sheets' && $method === 'GET') {
        ok(array_map('sheet_out', db_all('SELECT * FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']])));
    }
    if ($rest === 'sheets' && $method === 'POST') {
        $files = $_FILES['files'] ?? $_FILES['file'] ?? null;
        if (!$files) {
            fail(400, 'No files');
        }
        $saved = [];
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/exam-' . $exam['id'];
        ensure_dir($dir);
        $names = is_array($files['name']) ? $files['name'] : [$files['name']];
        $tmps = is_array($files['tmp_name']) ? $files['tmp_name'] : [$files['tmp_name']];
        $layout = db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
        foreach ($names as $i => $name) {
            $stored = $dir . '/' . bin2hex(random_bytes(8)) . '.png';
            move_uploaded_file($tmps[$i], $stored);
            db_exec('INSERT INTO exam_sheets (exam_id, filename, stored_path, status) VALUES (?, ?, ?, ?)', 'isss', [(int) $exam['id'], $name, $stored, 'uploaded']);
            $sid = db_insert_id();
            $sheet = db_one('SELECT * FROM exam_sheets WHERE id = ?', 'i', [$sid]);
            try {
                $result = omr_worker('evaluate', ['layout' => json_decode($layout['config_json'], true), 'image' => $stored]);
                $bind = bind_sheet_student($sheet, $result['roll'] ?? '', false);
                db_exec(
                    'UPDATE exam_sheets SET detected_roll=?, student_id=?, status=?, error_message=? WHERE id=?',
                    'sissi',
                    [$bind['detected_roll'] ?? '', $bind['student_id'] ?? 0, $bind['status'] ?? 'uploaded', $bind['error_message'] ?? '', $sid]
                );
                if (empty($bind['student_id'])) {
                    db_exec('UPDATE exam_sheets SET student_id = NULL WHERE id = ?', 'i', [$sid]);
                }
            } catch (Throwable $e) {
                // keep uploaded
            }
            $saved[] = sheet_out(db_one('SELECT * FROM exam_sheets WHERE id = ?', 'i', [$sid]));
        }
        ok($saved);
    }
    if ($rest === 'sheets/bulk-delete' && $method === 'POST') {
        $ids = json_body()['ids'] ?? [];
        $removed = 0;
        foreach (db_all('SELECT * FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']]) as $sheet) {
            if (!in_array((int) $sheet['id'], array_map('intval', $ids), true)) {
                continue;
            }
            foreach ([$sheet['stored_path'], $sheet['overlay_path']] as $p) {
                if ($p && is_file($p)) {
                    unlink($p);
                }
            }
            db_exec('DELETE FROM exam_sheets WHERE id = ?', 'i', [(int) $sheet['id']]);
            $removed++;
        }
        ok(['ok' => true, 'removed' => $removed]);
    }
    if (preg_match('#^sheets/(\d+)/assign$#', $rest, $sm) && $method === 'PUT') {
        $sheet = db_one('SELECT * FROM exam_sheets WHERE id = ? AND exam_id = ?', 'ii', [(int) $sm[1], (int) $exam['id']]);
        if (!$sheet) {
            fail(404, 'Sheet not found');
        }
        $p = json_body();
        $student = db_one('SELECT * FROM students WHERE id = ?', 'i', [(int) ($p['student_id'] ?? 0)]);
        if (!$student) {
            fail(404, 'Student not found');
        }
        $status = $sheet['status'];
        if ($sheet['answers_json'] && $sheet['answers_json'] !== '{}') {
            $status = 'evaluated';
        } elseif ($status === 'unmatched') {
            $status = 'uploaded';
        }
        db_exec('UPDATE exam_sheets SET student_id=?, assigned_manually=1, error_message=?, status=? WHERE id=?', 'issi', [(int) $student['id'], '', $status, (int) $sheet['id']]);
        ok(sheet_out(db_one('SELECT * FROM exam_sheets WHERE id = ?', 'i', [(int) $sheet['id']])));
    }
    if (preg_match('#^sheets/(\d+)/(overlay|image)$#', $rest, $sm) && $method === 'GET') {
        $sheet = db_one('SELECT * FROM exam_sheets WHERE id = ? AND exam_id = ?', 'ii', [(int) $sm[1], (int) $exam['id']]);
        if (!$sheet) {
            fail(404, 'Sheet not found');
        }
        $file = ($sheet['overlay_path'] && is_file($sheet['overlay_path'])) ? $sheet['overlay_path'] : $sheet['stored_path'];
        if (!$file || !is_file($file)) {
            fail(404, 'Sheet image not found');
        }
        send_file($file);
    }
    if ($rest === 'process-omr' && $method === 'POST') {
        $sheets = db_all('SELECT * FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']]);
        if (!$sheets) {
            fail(400, 'Upload scanned OMR sheets before processing');
        }
        $layout = json_decode(db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']])['config_json'], true);
        $processed = $failed = 0;
        $results = [];
        foreach ($sheets as $sheet) {
            try {
                $aligned = dirname($sheet['stored_path']) . '/aligned-' . $sheet['id'] . '.png';
                $meta = omr_worker('align', ['image' => $sheet['stored_path'], 'layout' => $layout, 'out' => $aligned, 'debug' => true]);
                db_exec('UPDATE exam_sheets SET stored_path=?, error_message=?, status=? WHERE id=?', 'sssi', [$aligned, '', $sheet['status'] === 'error' ? 'uploaded' : $sheet['status'], (int) $sheet['id']]);
                $destDir = exam_processed_dir($exam);
                copy($aligned, $destDir . '/' . basename($sheet['filename'] ?: $aligned));
                $processed++;
                $results[] = ['sheet_id' => (int) $sheet['id'], 'filename' => $sheet['filename'], 'ok' => true] + ($meta['meta'] ?? []);
            } catch (Throwable $e) {
                $failed++;
                db_exec('UPDATE exam_sheets SET status=?, error_message=? WHERE id=?', 'ssi', ['error', $e->getMessage(), (int) $sheet['id']]);
                $results[] = ['sheet_id' => (int) $sheet['id'], 'filename' => $sheet['filename'], 'ok' => false, 'error' => $e->getMessage()];
            }
        }
        ok(['processed' => $processed, 'failed' => $failed, 'results' => $results, 'output_dir' => exam_processed_dir($exam)]);
    }
    if ($rest === 'evaluate' && $method === 'POST') {
        $key = json_decode($exam['answer_key_json'] ?: '{}', true);
        if (!$key) {
            fail(400, 'Set an answer key before evaluating');
        }
        $layout = json_decode(db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']])['config_json'], true);
        $evaluated = 0;
        $errors = [];
        foreach (db_all('SELECT * FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']]) as $sheet) {
            try {
                $overlay = dirname($sheet['stored_path']) . '/overlay-' . $sheet['id'] . '.png';
                $result = omr_worker('evaluate', ['layout' => $layout, 'image' => $sheet['stored_path'], 'overlay' => $overlay]);
                db_exec('UPDATE exam_sheets SET overlay_path = ? WHERE id = ?', 'si', [$overlay, (int) $sheet['id']]);
                $sheet['overlay_path'] = $overlay;
                score_sheet((int) $exam['id'], $exam, $sheet, $result['answers'] ?? [], $result['roll'] ?? '');
                $evaluated++;
            } catch (Throwable $e) {
                db_exec('UPDATE exam_sheets SET status=?, error_message=? WHERE id=?', 'ssi', ['error', $e->getMessage(), (int) $sheet['id']]);
                $errors[] = ['sheet_id' => (int) $sheet['id'], 'error' => $e->getMessage()];
            }
        }
        if ($exam['status'] !== 'published') {
            db_exec("UPDATE exams SET status='evaluated' WHERE id = ?", 'i', [(int) $exam['id']]);
        }
        ok(['evaluated' => $evaluated, 'errors' => $errors]);
    }
    if ($rest === 'publish' && $method === 'POST') {
        if (!in_array($exam['status'], ['evaluated', 'published'], true)) {
            fail(400, 'Evaluate sheets before publishing');
        }
        db_exec("UPDATE exams SET status='published' WHERE id = ?", 'i', [(int) $exam['id']]);
        ok(['status' => 'published']);
    }
    if ($rest === 'results' && $method === 'GET') {
        ok(build_analytics($exam));
    }
    if ($rest === 'results.xlsx' && $method === 'GET') {
        $analytics = build_analytics($exam);
        $tmp = sys_get_temp_dir() . '/rwl-' . $exam['id'] . '.xlsx';
        omr_worker('results-xlsx', ['analytics' => $analytics, 'out' => $tmp]);
        send_file($tmp, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', str_replace(' ', '_', $exam['name']) . '_rwl.xlsx');
    }
    if ($rest === 'results.csv' && $method === 'GET') {
        $analytics = build_analytics($exam);
        $fh = fopen('php://temp', 'w+');
        $subjects = array_column($analytics['subjects'], 'subject_name');
        $header = ['Rank', 'Roll No', 'Name', 'Class', 'Section', 'Right', 'Wrong', 'Left', 'Invalid', 'Score', 'Max', 'Percentage'];
        foreach ($subjects as $n) {
            $header[] = "$n R";
        }
        foreach ($subjects as $n) {
            $header[] = "$n W";
        }
        foreach ($subjects as $n) {
            $header[] = "$n L";
        }
        fputcsv($fh, $header);
        foreach ($analytics['results'] as $row) {
            $by = [];
            foreach ($row['subjects'] as $s) {
                $by[$s['subject_name']] = $s;
            }
            $line = [$row['rank'], $row['roll_no'], $row['name'], $row['class_name'], $row['section'], $row['right'], $row['wrong'], $row['left'], $row['invalid'], $row['score'], $row['max_score'], $row['percentage']];
            foreach ($subjects as $n) {
                $line[] = $by[$n]['right'] ?? '';
            }
            foreach ($subjects as $n) {
                $line[] = $by[$n]['wrong'] ?? '';
            }
            foreach ($subjects as $n) {
                $line[] = $by[$n]['left'] ?? '';
            }
            fputcsv($fh, $line);
        }
        rewind($fh);
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . str_replace(' ', '_', $exam['name']) . '_rwl.csv"');
        fpassthru($fh);
        exit;
    }
    if ($rest === 'reset-omr' && $method === 'POST') {
        $removed = 0;
        foreach (db_all('SELECT * FROM exam_sheets WHERE exam_id = ?', 'i', [(int) $exam['id']]) as $sheet) {
            foreach ([$sheet['stored_path'], $sheet['overlay_path']] as $p) {
                if ($p && is_file($p)) {
                    unlink($p);
                }
            }
            db_exec('DELETE FROM exam_sheets WHERE id = ?', 'i', [(int) $sheet['id']]);
            $removed++;
        }
        $status = $exam['status'];
        if (in_array($status, ['evaluated', 'published'], true)) {
            $status = 'draft';
            db_exec("UPDATE exams SET status='draft' WHERE id = ?", 'i', [(int) $exam['id']]);
        }
        ok(['ok' => true, 'removed' => $removed, 'status' => $status]);
    }
    if ($rest === 'sample-sheet' && $method === 'POST') {
        $layout = json_decode(db_one('SELECT config_json FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']])['config_json'], true);
        $key = json_decode($exam['answer_key_json'] ?: '{}', true) ?: [];
        $answers = $_POST['answers'] ?? '';
        $parsed = [];
        if ($answers) {
            $letters = array_values(array_filter(str_split(strtoupper($answers)), fn ($ch) => str_contains('ABCD', $ch)));
            foreach ($letters as $i => $letter) {
                $parsed[(string) ($i + 1)] = $letter;
            }
        } else {
            $parsed = $key;
        }
        $dir = $GLOBALS['OMR_CONFIG']['upload_dir'] . '/exam-' . $exam['id'];
        ensure_dir($dir);
        $dest = $dir . '/sample-' . bin2hex(random_bytes(4)) . '.png';
        omr_worker('generate-sheet', ['layout' => $layout, 'roll' => $_POST['roll'] ?? '', 'answers' => $parsed, 'test_id' => $exam['test_id'], 'test_no' => $exam['test_no'], 'out' => $dest]);
        db_exec('INSERT INTO exam_sheets (exam_id, filename, stored_path, status) VALUES (?, ?, ?, ?)', 'isss', [(int) $exam['id'], basename($dest), $dest, 'uploaded']);
        ok(sheet_out(db_one('SELECT * FROM exam_sheets WHERE id = ?', 'i', [db_insert_id()])));
    }
    if ($rest === 'prefilled-omr' && $method === 'GET') {
        $layoutRow = db_one('SELECT * FROM omr_layouts WHERE id = ?', 'i', [(int) $exam['layout_id']]);
        $sql = 'SELECT * FROM students WHERE 1=1';
        $types = '';
        $params = [];
        if ($exam['class_name']) {
            $sql .= ' AND class_name = ?';
            $types .= 's';
            $params[] = $exam['class_name'];
        }
        if ($exam['section']) {
            $secs = array_filter(array_map('trim', explode(',', str_replace(';', ',', $exam['section']))));
            if ($secs) {
                $in = implode(',', array_fill(0, count($secs), '?'));
                $sql .= " AND section IN ($in)";
                $types .= str_repeat('s', count($secs));
                $params = array_merge($params, $secs);
            }
        }
        if ($exam['batch']) {
            $sql .= ' AND session = ?';
            $types .= 's';
            $params[] = $exam['batch'];
        }
        $students = db_all($sql . ' ORDER BY roll_no', $types, $params);
        if (!$students) {
            fail(400, 'No students assigned to this exam. Set class, section, and batch from the student list.');
        }
        if (!$layoutRow['sample_path'] || !is_file($layoutRow['sample_path'])) {
            fail(400, 'Upload an OMR layout sample PDF/JPG before generating pre-filled sheets.');
        }
        $out = sys_get_temp_dir() . '/prefill-' . $exam['id'] . '.pdf';
        omr_worker('prefill-pdf', [
            'layout' => json_decode($layoutRow['config_json'], true),
            'sample' => $layoutRow['sample_path'],
            'students' => $students,
            'exam_date' => $exam['exam_date'],
            'test_id' => $exam['test_id'],
            'test_no' => $exam['test_no'],
            'out' => $out,
        ]);
        send_file($out, 'application/pdf', str_replace(' ', '_', $exam['name']) . '_prefilled_omr.pdf');
    }
}
