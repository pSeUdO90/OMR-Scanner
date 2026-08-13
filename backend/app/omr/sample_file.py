from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image


def sample_to_image_bytes(filename: str, data: bytes) -> tuple[bytes, str]:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}:
        Image.open(BytesIO(data)).verify()
        return data, suffix or ".png"
    if suffix == ".pdf":
        try:
            import pypdfium2 as pdfium
        except ImportError as exc:
            raise ValueError("PDF support is not installed") from exc
        pdf = pdfium.PdfDocument(data)
        if len(pdf) < 1:
            raise ValueError("PDF has no pages")
        page = pdf[0]
        bitmap = page.render(scale=2)
        pil = bitmap.to_pil()
        buf = BytesIO()
        pil.convert("RGB").save(buf, format="PNG")
        return buf.getvalue(), ".png"
    raise ValueError("Upload a PDF or JPG/PNG sample of the OMR sheet")
