import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import OmrLayout
from ..omr.layouts import layout_preview
from ..schemas import LayoutOut

router = APIRouter(prefix="/api/layouts", tags=["layouts"])


@router.get("", response_model=list[LayoutOut])
def list_layouts(db: Session = Depends(get_db)):
    rows = db.query(OmrLayout).order_by(OmrLayout.id).all()
    out = []
    for row in rows:
        item = LayoutOut.model_validate(row)
        item.preview = layout_preview(json.loads(row.config_json))
        out.append(item)
    return out
