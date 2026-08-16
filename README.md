# OMR Software (PHP / MySQLi / Bootstrap)

Gyana Vikash–style OMR evaluation: student rolls, layouts, exams, scan scoring, and Right / Wrong / Left reports.

The web app is **HTML, CSS, JavaScript, and Bootstrap** with a **PHP + MySQLi** API. Bubble reading still uses the existing OpenCV helpers in `tools/omr_worker.py` (same scoring engine as before).

## Run locally

```bash
./scripts/cloud-agent-install.sh
php -S 127.0.0.1:8080 -t public public/index.php
```

Open http://127.0.0.1:8080  
Login: `admin` / `admin`

MariaDB database: `omr_scanner` (user `omr` / `omr_local` by default).

## Workflow

1. **Students** — add rows or upload an XLSX (`Roll No`, `Student Name`, `Gender`, `Class`, `Section`, `Session`).
2. **Subjects** — maintain Physics / Chemistry / Biology (or your own).
3. **Layouts** — use seeded PCB/MCQ/JEE sheets or A4 OMR Studio.
4. **Exams** — name, date, type, duration, marking scheme, layout, subject maps. Test ID is allocated automatically. Edit uses PUT on the same exam id.
5. **Answer key** — paste an `ABCD...` string (saving rescores existing sheets).
6. **Upload** scanned sheets or generate a sample filled sheet.
7. **Evaluate** — alignment, roll read, bubble fill, match by roll.
8. **Publish** RWL analysis by subject and overall.

A layout or subject that is used by an exam cannot be deleted (`409`).
