from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models

router = APIRouter()


@router.get("/roles")
def role_names(db: Session = Depends(get_db)):
    """Публичный эндпоинт — названия ролей для отображения."""
    defaults = {
        "role_admin_name": "Администратор",
        "role_teacher_name": "Преподаватель",
        "role_student_name": "Ученик",
    }
    out = {}
    for k, default in defaults.items():
        s = db.query(models.Setting).filter_by(key=k).first()
        out[k.replace("role_", "").replace("_name", "")] = s.value if s else default
    return out