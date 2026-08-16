#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends python3-venv python3-pip
fi

if ! command -v php >/dev/null 2>&1 || ! php -m | grep -qi mysqli; then
  sudo apt-get update
  sudo apt-get install -y --no-install-recommends php-cli php-mysqli php-xml php-mbstring php-zip php-gd mariadb-server
fi

if [[ ! -x .venv/bin/python ]] || ! .venv/bin/python -c 'import pip' >/dev/null 2>&1; then
  rm -rf .venv
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
if [[ -f backend/requirements.txt ]]; then
  .venv/bin/pip install -r backend/requirements.txt
fi

if ! mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then
  sudo mkdir -p /run/mysqld
  sudo chown mysql:mysql /run/mysqld || true
  sudo mariadbd --user=mysql --datadir=/var/lib/mysql --socket=/run/mysqld/mysqld.sock --pid-file=/run/mysqld/mysqld.pid --bind-address=127.0.0.1 >/tmp/mariadb.log 2>&1 &
  sleep 3
fi
mysql -u root -e "CREATE DATABASE IF NOT EXISTS omr_scanner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'omr'@'localhost' IDENTIFIED BY 'omr_local'; GRANT ALL ON omr_scanner.* TO 'omr'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null \
  || sudo mysql -e "CREATE DATABASE IF NOT EXISTS omr_scanner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'omr'@'localhost' IDENTIFIED BY 'omr_local'; GRANT ALL ON omr_scanner.* TO 'omr'@'localhost'; FLUSH PRIVILEGES;"

php -r 'require "php/bootstrap.php"; omr_migrate(); omr_seed(); echo "Database ready\n";'
echo "Install complete."
