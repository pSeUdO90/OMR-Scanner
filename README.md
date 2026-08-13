# OMR-Scanner

Python-based Optical Mark Recognition (OMR) scanner for grading multiple-choice bubble sheets using OpenCV.

## Requirements

- Python 3.10+
- OpenCV system libraries (`libgl1`, `libglib2.0-0`)

## Setup

```bash
./scripts/cloud-agent-install.sh
```

## Generate a sample sheet

```bash
.venv/bin/python scripts/generate_sample_sheet.py --output samples/demo_sheet.png
```

## Scan and grade

```bash
.venv/bin/python main.py --image samples/demo_sheet.png --json
```

## Run tests

```bash
.venv/bin/pytest -q
```

## Project layout

- `omr_scanner/` — core scanning and grading logic
- `main.py` — CLI entry point
- `scripts/generate_sample_sheet.py` — synthetic bubble sheet generator for local testing
- `tests/` — automated tests
