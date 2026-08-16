#!/usr/bin/env python3
"""JSON CLI for OMR computer-vision helpers used by the PHP app."""
from __future__ import annotations

import json
import sys
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.omr.analyze import analyze_layout_config  # noqa: E402
from app.omr.a4_pdf import sheet_bgr_to_a4_pdf  # noqa: E402
from app.omr.de_skew_engine import align_omr_sheet  # noqa: E402
from app.omr.generator import generate_designed_sheet, generate_sheet, prefill_on_layout_sample  # noqa: E402
from app.omr.layouts import a4_design_layout, apply_blocks_to_config, custom_grid_layout, gyana_vikash_180, jee_main_90, predefined_a4_blocks, standard_100  # noqa: E402
from app.omr.processor import evaluate_image, load_image, parse_layout, save_image  # noqa: E402
from app.omr.sample_file import sample_to_image_bytes  # noqa: E402
from app.omr.studio_render import generate_studio_sheet  # noqa: E402
from app.xlsx_io import parse_students_xlsx, students_template_bytes  # noqa: E402
from PIL import Image  # noqa: E402


def out(data) -> None:
    json.dump(data, sys.stdout)
    sys.stdout.write("\n")


def read_payload() -> dict:
    raw = sys.stdin.buffer.read()
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def studio_config(payload: dict) -> dict:
    name = payload["name"]
    slug = payload["slug"]
    total = int(payload.get("total_questions") or 100)
    options = "".join(ch for ch in str(payload.get("options") or "ABCD").upper() if ch in "ABCDEF") or "ABCD"
    cfg = payload.get("config") or {}
    columns = max(1, min(6, int(cfg.get("questionColumns") or payload.get("columns") or 4)))
    roll_cols = max(4, min(12, int(cfg.get("rollCols") or payload.get("roll_cols") or 8)))
    maps = [{"subject": "Paper", "code": "PAP", "start_q": 1, "end_q": total}]
    config = a4_design_layout(
        name=name,
        slug=slug,
        total_questions=total,
        columns=columns,
        options=options,
        description=payload.get("description") or "",
        default_maps=maps,
        roll_cols=roll_cols,
    )
    config["studio"] = True
    config["studio_config"] = cfg
    config["studio_geometry"] = payload.get("geometry") or {}
    config["studio_blocks"] = payload.get("blocks") or []
    config["studio_mapping"] = payload.get("mapping") or {}
    config["blocks"] = []
    return config


def main() -> int:
    if len(sys.argv) < 2:
        out({"error": "missing action"})
        return 1
    action = sys.argv[1]
    payload = read_payload()

    if action == "builtins":
        layouts = [gyana_vikash_180(), standard_100(), jee_main_90()]
        out({"layouts": layouts})
        return 0

    if action == "studio-config":
        out({"config": studio_config(payload)})
        return 0

    if action == "custom-grid":
        out(
            {
                "config": custom_grid_layout(
                    name=payload["name"],
                    slug=payload["slug"],
                    total_questions=int(payload["total_questions"]),
                    columns=int(payload.get("columns") or 4),
                    options=payload.get("options") or "ABCD",
                    description=payload.get("description") or "",
                    default_maps=payload.get("default_maps"),
                )
            }
        )
        return 0

    if action == "a4-design":
        out(
            {
                "config": a4_design_layout(
                    name=payload["name"],
                    slug=payload["slug"],
                    total_questions=int(payload["total_questions"]),
                    columns=int(payload.get("columns") or 4),
                    options=payload.get("options") or "ABCD",
                    description=payload.get("description") or "",
                    default_maps=payload.get("default_maps"),
                    roll_cols=int(payload.get("roll_cols") or 8),
                    blocks=payload.get("blocks"),
                    school_name=payload.get("school_name") or "GYANA VIKASH ENGLISH MEDIUM SCHOOL, BERHAMPUR",
                )
            }
        )
        return 0

    if action == "apply-blocks":
        config = payload["config"]
        out({"config": apply_blocks_to_config(config, payload["blocks"])})
        return 0

    if action == "predefined-blocks":
        out(
            {
                "page_width": 1654,
                "page_height": 2339,
                "page_width_mm": 210,
                "page_height_mm": 297,
                "blocks": predefined_a4_blocks(
                    total_questions=int(payload.get("total_questions") or 100),
                    columns=int(payload.get("columns") or 4),
                    options=payload.get("options") or "ABCD",
                    roll_cols=int(payload.get("roll_cols") or 8),
                ),
            }
        )
        return 0

    if action == "evaluate":
        layout = parse_layout(payload["layout_json"] if isinstance(payload.get("layout_json"), str) else json.dumps(payload["layout"]))
        image = load_image(payload["image"])
        result = evaluate_image(image, layout)
        overlay = payload.get("overlay")
        if overlay:
            save_image(overlay, result["overlay"])
        out({"roll": result["roll"], "answers": result["answers"], "overlay": overlay or ""})
        return 0

    if action == "align":
        aligned, meta = align_omr_sheet(
            payload["image"],
            parse_layout(payload["layout_json"] if isinstance(payload.get("layout_json"), str) else json.dumps(payload["layout"])),
            debug=bool(payload.get("debug", True)),
            debug_path=payload.get("debug_path"),
        )
        save_image(payload["out"], aligned)
        out({"ok": True, "meta": meta, "out": payload["out"]})
        return 0

    if action == "generate-sheet":
        layout = parse_layout(json.dumps(payload["layout"]) if isinstance(payload["layout"], dict) else payload["layout"])
        parsed = {int(k): v for k, v in (payload.get("answers") or {}).items()}
        image = generate_sheet(
            layout,
            payload.get("roll") or "",
            parsed,
            test_id=payload.get("test_id") or "",
            test_no=payload.get("test_no") or "",
        )
        save_image(payload["out"], image)
        out({"ok": True, "out": payload["out"]})
        return 0

    if action == "blank-sheet":
        config = payload["config"]
        if config.get("studio"):
            image = generate_studio_sheet(config)
        else:
            image = generate_designed_sheet(config)
        dest = payload["out"]
        save_image(dest, image)
        if payload.get("pdf"):
            Path(payload["pdf"]).write_bytes(sheet_bgr_to_a4_pdf(image))
        out({"ok": True, "out": dest, "pdf": payload.get("pdf") or ""})
        return 0

    if action == "analyze":
        layout = parse_layout(json.dumps(payload["layout"]) if isinstance(payload["layout"], dict) else payload["layout"])
        img = load_image(payload["image"]) if payload.get("image") else None
        out({"analysis": analyze_layout_config(layout, img)})
        return 0

    if action == "sample-to-image":
        data = Path(payload["src"]).read_bytes()
        image_bytes, suffix = sample_to_image_bytes(payload.get("filename") or "sample.jpg", data)
        dest = Path(payload["out"])
        dest.write_bytes(image_bytes)
        out({"ok": True, "out": str(dest), "suffix": suffix})
        return 0

    if action == "thumbnail":
        raw = payload.get("data_url") or ""
        if "," in raw:
            raw = raw.split(",", 1)[1]
        import base64

        blob = base64.b64decode(raw)
        image = Image.open(BytesIO(blob)).convert("RGB")
        dest = Path(payload["out"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        image.save(dest, "JPEG", quality=86)
        out({"ok": True, "out": str(dest)})
        return 0

    if action == "parse-students-xlsx":
        rows = parse_students_xlsx(Path(payload["src"]).read_bytes())
        out({"rows": rows})
        return 0

    if action == "students-template":
        Path(payload["out"]).write_bytes(students_template_bytes())
        out({"ok": True, "out": payload["out"]})
        return 0

    if action == "results-xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font

        analytics = payload["analytics"]
        wb = Workbook()
        ranks = wb.active
        ranks.title = "Rank list"
        subject_names = [s["subject_name"] for s in analytics.get("subjects") or []]
        headers = ["Rank", "Roll No", "Name", "Class", "Section", "Right", "Wrong", "Left", "Invalid", "Score", "Max", "Percentage"]
        headers += [f"{name} R" for name in subject_names]
        headers += [f"{name} W" for name in subject_names]
        headers += [f"{name} L" for name in subject_names]
        ranks.append(headers)
        for cell in ranks[1]:
            cell.font = Font(bold=True)
        for row in analytics.get("results") or []:
            by_subject = {s["subject_name"]: s for s in row.get("subjects") or []}
            ranks.append(
                [
                    row.get("rank"),
                    row.get("roll_no"),
                    row.get("name"),
                    row.get("class_name"),
                    row.get("section"),
                    row.get("right"),
                    row.get("wrong"),
                    row.get("left"),
                    row.get("invalid"),
                    row.get("score"),
                    row.get("max_score"),
                    row.get("percentage"),
                ]
                + [by_subject.get(name, {}).get("right", "") for name in subject_names]
                + [by_subject.get(name, {}).get("wrong", "") for name in subject_names]
                + [by_subject.get(name, {}).get("left", "") for name in subject_names]
            )
        Path(payload["out"]).parent.mkdir(parents=True, exist_ok=True)
        wb.save(payload["out"])
        out({"ok": True, "out": payload["out"]})
        return 0

    if action == "prefill-pdf":
        layout = parse_layout(json.dumps(payload["layout"]) if isinstance(payload["layout"], dict) else payload["layout"])
        base = load_image(payload["sample"])
        pages = []
        exam_date = payload.get("exam_date") or ""
        for student in payload["students"]:
            image = prefill_on_layout_sample(
                base,
                layout,
                roll=student["roll_no"],
                student_name=student["name"],
                test_id=payload.get("test_id") or "",
                test_no=payload.get("test_no") or "",
                exam_date=exam_date,
            )
            rgb = image[:, :, ::-1]
            pages.append(Image.fromarray(rgb))
        buf = BytesIO()
        pages[0].save(buf, format="PDF", save_all=True, append_images=pages[1:], resolution=120)
        Path(payload["out"]).write_bytes(buf.getvalue())
        out({"ok": True, "out": payload["out"]})
        return 0

    out({"error": f"unknown action {action}"})
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": str(exc)}, sys.stdout)
        sys.stdout.write("\n")
        raise SystemExit(1)
