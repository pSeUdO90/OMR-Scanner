<?php

function db(): mysqli
{
    static $mysqli = null;
    if ($mysqli instanceof mysqli) {
        return $mysqli;
    }
    $cfg = $GLOBALS['OMR_CONFIG'];
    $mysqli = @new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name'], 3306, $cfg['db_socket']);
    if ($mysqli->connect_errno) {
        $mysqli = @new mysqli($cfg['db_host'], $cfg['db_user'], $cfg['db_pass'], $cfg['db_name']);
    }
    if ($mysqli->connect_errno) {
        http_response_code(500);
        echo json_encode(['detail' => 'Database connection failed: ' . $mysqli->connect_error]);
        exit;
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function db_one(string $sql, string $types = '', array $params = []): ?array
{
    $stmt = db_stmt($sql, $types, $params);
    $res = $stmt->get_result();
    $row = $res ? $res->fetch_assoc() : null;
    $stmt->close();
    return $row ?: null;
}

function db_all(string $sql, string $types = '', array $params = []): array
{
    $stmt = db_stmt($sql, $types, $params);
    $res = $stmt->get_result();
    $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    $stmt->close();
    return $rows;
}

function db_exec(string $sql, string $types = '', array $params = []): mysqli_stmt
{
    $stmt = db_stmt($sql, $types, $params);
    $stmt->close();
    return $stmt;
}

function db_stmt(string $sql, string $types = '', array $params = []): mysqli_stmt
{
    $stmt = db()->prepare($sql);
    if (!$stmt) {
        fail(500, db()->error);
    }
    if ($types !== '') {
        if (strlen($types) !== count($params)) {
            fail(500, 'SQL bind mismatch: ' . strlen($types) . ' types vs ' . count($params) . ' params');
        }
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) {
        fail(500, $stmt->error);
    }
    return $stmt;
}

function db_insert_id(): int
{
    return (int) db()->insert_id;
}
