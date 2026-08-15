"""Single-page A4 PDF from an OMR sheet image."""

from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image

MM_PER_INCH = 25.4
A4_WIDTH_PT = 210 * 72 / MM_PER_INCH
A4_HEIGHT_PT = 297 * 72 / MM_PER_INCH


def sheet_bgr_to_a4_pdf(bgr: np.ndarray, *, dpi: int = 200) -> bytes:
    """Wrap a BGR sheet in a one-page A4 PDF.

    Pillow's PDF encoder stores the JPEG at 72 DPI. Print dialogs then treat a
    200 DPI A4 raster (about 2339 px tall) as ~32 inches and split it across
    three US Letter pages. This writer tags the JPEG at ``dpi`` and places it
    on an explicit A4 MediaBox so the file is always one page.
    """
    if bgr.ndim == 2:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_GRAY2RGB)
    else:
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb).convert("RGB")
    width_px = max(1, int(round(210 / MM_PER_INCH * dpi)))
    height_px = max(1, int(round(297 / MM_PER_INCH * dpi)))
    if image.size != (width_px, height_px):
        image = image.resize((width_px, height_px), Image.Resampling.LANCZOS)
    jpeg = BytesIO()
    image.save(jpeg, format="JPEG", quality=92, dpi=(dpi, dpi), optimize=True)
    jpeg_bytes = jpeg.getvalue()
    return _jpeg_a4_pdf(jpeg_bytes, width_px, height_px)


def _pdf_string(header: bytes, objects: list[bytes]) -> bytes:
    out = bytearray(header)
    if not header.endswith(b"\n"):
        out.extend(b"\n")
    offsets = []
    for chunk in objects:
        offsets.append(len(out))
        out.extend(chunk)
        if not chunk.endswith(b"\n"):
            out.extend(b"\n")
    xref_start = len(out)
    count = len(offsets)
    out.extend(f"xref\n0 {count + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(
        f"trailer\n<< /Size {count + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode()
    )
    return bytes(out)


def _jpeg_a4_pdf(jpeg: bytes, width_px: int, height_px: int) -> bytes:
    contents = f"q {A4_WIDTH_PT:.4f} 0 0 {A4_HEIGHT_PT:.4f} 0 0 cm /Im1 Do Q\n".encode()
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        (
            f"3 0 obj << /Type /Page /Parent 2 0 R "
            f"/MediaBox [0 0 {A4_WIDTH_PT:.4f} {A4_HEIGHT_PT:.4f}] "
            f"/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >> endobj\n"
        ).encode(),
        f"4 0 obj << /Length {len(contents)} >> stream\n".encode() + contents + b"endstream endobj\n",
        (
            f"5 0 obj << /Type /XObject /Subtype /Image /Width {width_px} "
            f"/Height {height_px} /ColorSpace /DeviceRGB /BitsPerComponent 8 "
            f"/Filter /DCTDecode /Length {len(jpeg)} >> stream\n"
        ).encode()
        + jpeg
        + b"\nendstream endobj\n",
    ]
    return _pdf_string(b"%PDF-1.4\n", objects)
