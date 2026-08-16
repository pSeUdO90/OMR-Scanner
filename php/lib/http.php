<?php

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function fail(int $code, string $detail): never
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['detail' => $detail]);
    exit;
}

function ok($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function send_file(string $path, string $mime = '', string $download = ''): never
{
    if (!is_file($path)) {
        fail(404, 'File not found');
    }
    $mime = $mime ?: (mime_content_type($path) ?: 'application/octet-stream');
    header('Content-Type: ' . $mime);
    if ($download !== '') {
        header('Content-Disposition: attachment; filename="' . $download . '"');
    }
    header('Cache-Control: no-store');
    readfile($path);
    exit;
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function request_path(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if (str_starts_with($uri, '/index.php')) {
        $uri = substr($uri, strlen('/index.php')) ?: '/';
    }
    return rtrim($uri, '/') ?: '/';
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    if (!empty($_GET['token'])) {
        return (string) $_GET['token'];
    }
    if (!empty($_COOKIE['omr_token'])) {
        return (string) $_COOKIE['omr_token'];
    }
    return null;
}

function ensure_dir(string $path): void
{
    if (!is_dir($path)) {
        mkdir($path, 0775, true);
    }
}
