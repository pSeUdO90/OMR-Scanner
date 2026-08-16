# OMR Reader

Web app for Gyana Vikash–style OMR evaluation: student roll import, subject mapping, layout selection, exam setup, scan upload, bubble scoring, and Right / Wrong / Left (RWL) results.

## Run locally

```bash
./scripts/cloud-agent-install.sh
cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to port 8000.

Login: `admin` / `admin`.

## Host on a domain

This is not a static site. Use a VPS and Docker so the API and OMR engine run behind HTTPS.

See **[DEPLOY.md](DEPLOY.md)**. Short version:

1. Create an A record from `omr.yourdomain.com` to the VPS IP.
2. Copy `deploy/env.example` to `.env` and set `OMR_SITE=omr.yourdomain.com`.
3. Run `./scripts/deploy.sh`.
4. Open `https://omr.yourdomain.com`.

## Workflow

1. **Students** — add rows or upload an XLSX (`Roll No`, `Student Name`, `Gender`, `Class`, `Section`, `Session`).
2. **Subjects** — maintain Physics / Chemistry / Biology (or your own).
3. **Layouts** — pick Gyana Vikash 180 (PCB), Standard 100, or JEE Main 90.
4. **Exams** — name, date, type, duration, marking scheme (`+4/-1/0` by default), layout, and start–end question map per subject.
5. **Answer key** — paste an `ABCD...` string.
6. **Upload** scanned sheets (or generate a sample filled sheet).
7. **Evaluate** — timing-mark alignment, roll read, bubble fill, match to the student list.
8. **Publish** RWL analysis by subject and overall.

## Tests

```bash
cd backend && ../.venv/bin/pytest -q
```
