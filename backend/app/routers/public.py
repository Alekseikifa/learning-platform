from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models

router = APIRouter()


@router.get("/roles")
def role_names(db: Session = Depends(get_db)):
    defaults = {
        "role_admin_name": "Администратор",
        "role_teacher_name": "Куратор",
        "role_student_name": "Ученик",
        "role_manager_name": "Методист",
    }
    out = {}
    for k, default in defaults.items():
        s = db.query(models.Setting).filter_by(key=k).first()
        out[k.replace("role_", "").replace("_name", "")] = s.value if s else default
    return out

@router.get("/theme/{theme_id}")
def theme_info(theme_id: int, db: Session = Depends(get_db)):
    """Информация о теме: нужна, чтобы фронт мог по theme_id найти курс."""
    from fastapi import HTTPException
    t = db.query(models.Theme).get(theme_id)
    if not t:
        raise HTTPException(404, "Тема не найдена")
    c = db.query(models.Course).get(t.course_id)
    return {
        "id": t.id,
        "title": t.title,
        "order_index": t.order_index,
        "course_id": t.course_id,
        "course_title": c.title if c else "",
    }
