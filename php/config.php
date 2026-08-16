<?php
return [
    'db_host' => getenv('OMR_DB_HOST') ?: '127.0.0.1',
    'db_user' => getenv('OMR_DB_USER') ?: 'omr',
    'db_pass' => getenv('OMR_DB_PASS') ?: 'omr_local',
    'db_name' => getenv('OMR_DB_NAME') ?: 'omr_scanner',
    'db_socket' => getenv('OMR_DB_SOCKET') ?: '/run/mysqld/mysqld.sock',
    'root' => dirname(__DIR__),
    'upload_dir' => dirname(__DIR__) . '/backend/uploads',
    'python' => dirname(__DIR__) . '/.venv/bin/python',
    'worker' => dirname(__DIR__) . '/tools/omr_worker.py',
    'default_processed' => 'E:\\OMR Processed Sheets',
    'default_logo' => dirname(__DIR__) . '/public/logo.svg',
    'max_logo' => 1024 * 1024,
];
