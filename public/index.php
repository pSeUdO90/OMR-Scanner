<?php
require __DIR__ . '/../php/bootstrap.php';
omr_migrate();
omr_seed();

$method = request_method();
$path = request_path();

if (str_starts_with($path, '/api/')) {
    dispatch_api($method, $path);
}

$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mimes = ['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'woff2' => 'font/woff2'];
    header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
    readfile($file);
    exit;
}

readfile(__DIR__ . '/index.html');
